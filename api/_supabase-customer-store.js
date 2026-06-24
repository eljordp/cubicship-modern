const { createClient } = require("@supabase/supabase-js");
const {
  clean,
  json,
  normalizeEmail,
  publicCustomer,
  readCustomerSession,
  setCustomerCookie,
} = require("./_customer-auth");

function env(name) {
  return clean(process.env[name]);
}

function isConfigured() {
  return Boolean(env("SUPABASE_URL") && env("SUPABASE_ANON_KEY") && env("SUPABASE_SERVICE_ROLE_KEY"));
}

function siteUrl() {
  return env("SITE_URL") || env("CUBICSHIP_SITE_URL") || "https://cubicship.com";
}

function authClient() {
  return createClient(env("SUPABASE_URL"), env("SUPABASE_ANON_KEY"), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function adminClient() {
  return createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function isEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function shapeCustomer(profile) {
  return {
    id: profile.id,
    source: "supabase",
    name: profile.name,
    email: normalizeEmail(profile.email),
    phone: profile.phone || "",
    company: profile.company || "",
    accountType: profile.account_type || "personal",
    businessProfile: profile.business_profile || null,
    active: profile.active !== false,
    createdAt: profile.created_at || null,
    lastLoginAt: profile.last_login_at || null,
  };
}

function businessProfileFrom(body, monthlyShipments, signupCode) {
  if (clean(body.accountType) !== "business") return null;
  return {
    signupCode,
    monthlyShipments,
    monthlyShipmentLabel: `${monthlyShipments} shipments/month`,
    sellingChannels: clean(body.sellingChannels),
    productTypes: clean(body.productTypes),
    discountProgram: "tailored_small_business",
    maxDiscountLabel: "Up to 70% off",
    reviewStatus: clean(process.env.SMALL_BUSINESS_SIGNUP_CODE) ? "code_verified" : "pending_review",
  };
}

function validateRegistration(body) {
  const name = clean(body.name);
  const email = normalizeEmail(body.email);
  const phone = clean(body.phone);
  const company = clean(body.company);
  const accountType = clean(body.accountType) === "business" ? "business" : "personal";
  const signupCode = clean(body.signupCode);
  const monthlyShipments = ["10", "20", "30"].includes(clean(body.monthlyShipments)) ? clean(body.monthlyShipments) : "";
  const password = String(body.password || "");

  if (!name) return { error: "Your name is required." };
  if (!isEmail(email)) return { error: "Enter a valid email address." };
  if (password.length < 8) return { error: "Password must be at least 8 characters." };
  if (accountType === "business") {
    if (!company) return { error: "Business name is required." };
    if (!signupCode) return { error: "Small business signup code is required." };
    if (!monthlyShipments) return { error: "Choose a monthly shipment tier: 10, 20, or 30 shipments." };
    const configuredCode = clean(process.env.SMALL_BUSINESS_SIGNUP_CODE);
    if (configuredCode && signupCode.toLowerCase() !== configuredCode.toLowerCase()) {
      return { error: "Small business signup code is not valid.", status: 403 };
    }
  }

  return {
    values: {
      name,
      email,
      phone,
      company,
      accountType,
      password,
      businessProfile: businessProfileFrom(body, monthlyShipments, signupCode),
    },
  };
}

async function profileById(id) {
  const { data, error } = await adminClient()
    .from("customer_profiles")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return data;
}

async function upsertProfile(user, values) {
  const now = new Date().toISOString();
  const profile = {
    id: user.id,
    email: values.email,
    name: values.name,
    phone: values.phone,
    company: values.company,
    account_type: values.accountType,
    business_profile: values.businessProfile,
    active: true,
    updated_at: now,
  };
  const { data, error } = await adminClient()
    .from("customer_profiles")
    .upsert(profile, { onConflict: "id" })
    .select("*")
    .single();
  if (error) throw error;
  return data;
}

async function registerCustomer(req, res, body) {
  const validation = validateRegistration(body);
  if (validation.error) return json(res, validation.status || 400, { ok: false, error: validation.error });
  const values = validation.values;

  const { data, error } = await authClient().auth.signUp({
    email: values.email,
    password: values.password,
    options: {
      emailRedirectTo: `${siteUrl()}/auth/callback.html?next=${encodeURIComponent("/profile.html")}`,
      data: {
        name: values.name,
        phone: values.phone,
        company: values.company,
        account_type: values.accountType,
      },
    },
  });

  if (error) {
    const status = /already|registered|exists/i.test(error.message || "") ? 409 : 400;
    return json(res, status, { ok: false, error: error.message || "Could not create customer account." });
  }
  if (!data.user) return json(res, 400, { ok: false, error: "Could not create customer account." });

  const profile = await upsertProfile(data.user, values);
  if (!data.session) {
    return json(res, 202, {
      ok: true,
      pendingConfirmation: true,
      message: "Check your email to confirm the account, then log in.",
    });
  }

  const customer = shapeCustomer(profile);
  setCustomerCookie(req, res, customer);
  return json(res, 201, { ok: true, customer: publicCustomer(customer) });
}

async function loginCustomer(req, res, body) {
  const email = normalizeEmail(body.email);
  const password = String(body.password || "");
  const { data, error } = await authClient().auth.signInWithPassword({ email, password });
  if (error || !data.user) {
    return json(res, 401, { ok: false, error: "Email or password is incorrect." });
  }

  let profile = await profileById(data.user.id);
  if (!profile) {
    profile = await upsertProfile(data.user, {
      email,
      name: clean(data.user.user_metadata?.name) || email,
      phone: clean(data.user.user_metadata?.phone),
      company: clean(data.user.user_metadata?.company),
      accountType: clean(data.user.user_metadata?.account_type) === "business" ? "business" : "personal",
      businessProfile: null,
    });
  }

  await adminClient()
    .from("customer_profiles")
    .update({ last_login_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq("id", data.user.id);

  const customer = shapeCustomer({ ...profile, last_login_at: new Date().toISOString() });
  setCustomerCookie(req, res, customer);
  return json(res, 200, { ok: true, customer: publicCustomer(customer) });
}

async function maybeRequireCustomer(req, res) {
  if (!isConfigured()) return null;
  const session = readCustomerSession(req);
  if (!session || session.source !== "supabase") return null;

  const profile = await profileById(session.sub);
  if (!profile || profile.active === false) {
    json(res, 401, { ok: false, error: "This customer account is no longer active." });
    return false;
  }
  return shapeCustomer(profile);
}

module.exports = {
  isConfigured,
  loginCustomer,
  maybeRequireCustomer,
  registerCustomer,
};
