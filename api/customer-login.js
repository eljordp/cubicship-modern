const {
  authenticateCustomer,
  json,
  publicCustomer,
  readBody,
  setCustomerCookie,
} = require("./_customer-auth");
const supabaseCustomers = require("./_supabase-customer-store");

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
    return supabaseCustomers.loginCustomer(req, res, body);
  }

  const customer = await authenticateCustomer(body.email, body.password);
  if (!customer) {
    return json(res, 401, { ok: false, error: "Email or password is incorrect." });
  }

  setCustomerCookie(req, res, customer);
  return json(res, 200, { ok: true, customer: publicCustomer(customer) });
};
