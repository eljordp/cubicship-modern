const { createClient } = require("@supabase/supabase-js");
const { readBody, json } = require("./_customer-auth");
const { consumeRateLimit, sendRateLimited } = require("./_rate-limit");
module.exports = async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST")
    return json(res, 405, { ok: false, error: "Method not allowed." });
  const rate = consumeRateLimit(req, {
    scope: "account-recovery",
    limit: 8,
    windowMs: 15 * 60 * 1000,
  });
  if (!rate.allowed)
    return sendRateLimited(
      res,
      rate,
      "Please wait before trying account recovery again.",
    );
  let b;
  try {
    b = await readBody(req);
  } catch {
    return json(res, 400, { ok: false, error: "Invalid request." });
  }
  if (!b || typeof b !== "object" || Array.isArray(b))
    return json(res, 400, { ok: false, error: "Invalid request." });
  const url = process.env.SUPABASE_URL,
    key = process.env.SUPABASE_ANON_KEY;
  if (!url || !key)
    return json(res, 503, {
      ok: false,
      error:
        "Online account recovery is unavailable. Contact info@cubicship.com for account help.",
    });
  const client = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const origin = (
    process.env.SITE_URL ||
    process.env.CUBICSHIP_SITE_URL ||
    "https://cubicship.com"
  ).replace(/\/$/, "");
  try {
    if (b.action === "verify") {
      if (typeof b.accessToken !== "string" || b.accessToken.length > 10000)
        return json(res, 400, {
          ok: false,
          error: "This link could not be verified.",
        });
      const { data, error } = await client.auth.getUser(b.accessToken);
      if (error || !data.user?.email_confirmed_at)
        return json(res, 400, {
          ok: false,
          error:
            "This confirmation link could not be verified. Request a new email.",
        });
      return json(res, 200, { ok: true });
    }
    if (b.action === "update-password") {
      if (
        typeof b.password !== "string" ||
        b.password.length < 12 ||
        b.password.length > 128
      )
        return json(res, 400, {
          ok: false,
          error: "Use a password with 12 to 128 characters.",
        });
      if (
        typeof b.accessToken !== "string" ||
        typeof b.refreshToken !== "string" ||
        b.accessToken.length > 10000 ||
        b.refreshToken.length > 10000
      )
        return json(res, 400, {
          ok: false,
          error: "This recovery link is invalid. Request a new one.",
        });
      const session = await client.auth.setSession({
        access_token: b.accessToken,
        refresh_token: b.refreshToken,
      });
      if (session.error || !session.data.user)
        return json(res, 400, {
          ok: false,
          error: "This recovery link has expired. Request a new one.",
        });
      const { error } = await client.auth.updateUser({ password: b.password });
      if (error)
        return json(res, 400, {
          ok: false,
          error:
            "Password could not be updated. Request a new recovery link and try again.",
        });
      await client.auth.signOut();
      return json(res, 200, {
        ok: true,
        message: "Password updated. You can now sign in.",
      });
    }
    if (
      !["reset", "resend"].includes(b.action) ||
      typeof b.email !== "string" ||
      b.email.length > 254 ||
      !/^\S+@\S+\.\S+$/.test(b.email)
    )
      return json(res, 400, {
        ok: false,
        error: "Enter a valid email address.",
      });
    const result =
      b.action === "reset"
        ? await client.auth.resetPasswordForEmail(b.email, {
            redirectTo: origin + "/auth/callback.html?flow=recovery",
          })
        : await client.auth.resend({
            type: "signup",
            email: b.email,
            options: { emailRedirectTo: origin + "/auth/callback.html" },
          });
    if (result.error && result.error.status === 429)
      return json(res, 429, {
        ok: false,
        error: "Please wait before requesting another email.",
      });
    if (result.error && result.error.status >= 500)
      return json(res, 503, {
        ok: false,
        error: "Email service is temporarily unavailable. Try again later.",
      });
    return json(res, 200, {
      ok: true,
      message:
        "If this account is eligible, an email will arrive with the next steps. Check your spam folder too.",
    });
  } catch {
    return json(res, 503, {
      ok: false,
      error:
        "Account recovery is temporarily unavailable. Please try again later.",
    });
  }
};
