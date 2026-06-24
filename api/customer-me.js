const {
  json,
  publicCustomer,
  requireCustomer,
} = require("./_customer-auth");
const supabaseCustomers = require("./_supabase-customer-store");

module.exports = async function handler(req, res) {
  if (req.method !== "GET") {
    return json(res, 405, { ok: false, error: "Method not allowed" });
  }

  const supabaseCustomer = await supabaseCustomers.maybeRequireCustomer(req, res);
  if (supabaseCustomer === false) return;
  const customer = supabaseCustomer || await requireCustomer(req, res);
  if (!customer) return;
  return json(res, 200, { ok: true, customer: publicCustomer(customer) });
};
