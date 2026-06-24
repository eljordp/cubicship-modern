const {
  clean,
  hashPassword,
  json,
  normalizeEmail,
  publicCustomer,
  readBody,
  readCustomers,
  setCustomerCookie,
  writeCustomers,
} = require("./_customer-auth");
const supabaseCustomers = require("./_supabase-customer-store");

function isEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    return json(res, 405, { ok: false, error: "Method not allowed" });
  }

  let body = {};
  try {
    body = await readBody(req);
  } catch (error) {
    return json(res, 400, { ok: false, error: "Request body must be valid JSON." });
  }

  if (supabaseCustomers.isConfigured()) {
    return supabaseCustomers.registerCustomer(req, res, body);
  }

  const name = clean(body.name);
  const email = normalizeEmail(body.email);
  const phone = clean(body.phone);
  const company = clean(body.company);
  const accountType = clean(body.accountType) === "business" ? "business" : "personal";
  const signupCode = clean(body.signupCode);
  const monthlyShipments = ["10", "20", "30"].includes(clean(body.monthlyShipments)) ? clean(body.monthlyShipments) : "";
  const sellingChannels = clean(body.sellingChannels);
  const productTypes = clean(body.productTypes);
  const password = String(body.password || "");

  if (!name) return json(res, 400, { ok: false, error: "Your name is required." });
  if (!isEmail(email)) return json(res, 400, { ok: false, error: "Enter a valid email address." });
  if (password.length < 8) return json(res, 400, { ok: false, error: "Password must be at least 8 characters." });
  if (accountType === "business") {
    if (!company) return json(res, 400, { ok: false, error: "Business name is required." });
    if (!signupCode) return json(res, 400, { ok: false, error: "Small business signup code is required." });
    if (!monthlyShipments) return json(res, 400, { ok: false, error: "Choose a monthly shipment tier: 10, 20, or 30 shipments." });
    const configuredCode = clean(process.env.SMALL_BUSINESS_SIGNUP_CODE);
    if (configuredCode && signupCode.toLowerCase() !== configuredCode.toLowerCase()) {
      return json(res, 403, { ok: false, error: "Small business signup code is not valid." });
    }
  }

  const customers = await readCustomers();
  if (customers.some((customer) => normalizeEmail(customer.email) === email)) {
    return json(res, 409, { ok: false, error: "An account with that email already exists." });
  }

  const customer = {
    id: `cust_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
    name,
    email,
    phone,
    company,
    accountType,
    businessProfile: accountType === "business" ? {
      signupCode,
      monthlyShipments,
      monthlyShipmentLabel: `${monthlyShipments} shipments/month`,
      sellingChannels,
      productTypes,
      discountProgram: "tailored_small_business",
      maxDiscountLabel: "Up to 70% off",
      reviewStatus: clean(process.env.SMALL_BUSINESS_SIGNUP_CODE) ? "code_verified" : "pending_review",
    } : null,
    active: true,
    passwordHash: hashPassword(password),
    createdAt: new Date().toISOString(),
    lastLoginAt: new Date().toISOString(),
  };

  customers.push(customer);
  await writeCustomers(customers);
  setCustomerCookie(req, res, customer);
  return json(res, 201, { ok: true, customer: publicCustomer(customer) });
};
