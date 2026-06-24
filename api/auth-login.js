const {
  authenticate,
  json,
  normalizeEmail,
  publicUser,
  readBody,
  setSessionCookie,
} = require("./_portal-auth");
const { consumeRateLimit, sendRateLimited } = require("./_rate-limit");

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

  const ipLimit = consumeRateLimit(req, {
    scope: "portal-login-ip",
    limit: 30,
    windowMs: 15 * 60 * 1000,
  });
  if (!ipLimit.allowed) {
    return sendRateLimited(res, ipLimit, "Too many login attempts. Wait a few minutes and try again.");
  }

  const accountLimit = consumeRateLimit(req, {
    scope: "portal-login-account",
    identity: normalizeEmail(body.email),
    limit: 8,
    windowMs: 15 * 60 * 1000,
  });
  if (!accountLimit.allowed) {
    return sendRateLimited(res, accountLimit, "Too many login attempts for this account. Wait a few minutes and try again.");
  }

  const user = await authenticate(body.email, body.password);
  if (!user) {
    return json(res, 401, { ok: false, error: "Email or password is incorrect." });
  }

  setSessionCookie(req, res, user);
  return json(res, 200, { ok: true, user: publicUser(user) });
};
