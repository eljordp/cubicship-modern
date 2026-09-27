const {
  json,
  publicCustomer,
  requireCustomer,
  readBody,
} = require("./_customer-auth");
const supabaseCustomers = require("./_supabase-customer-store");
const { shippingPreferences } = require("./_shipping-preferences");

module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "private, no-store");
  if (!["GET", "PATCH"].includes(req.method)) {
    return json(res, 405, { ok: false, error: "Method not allowed" });
  }

  const supabaseCustomer = await supabaseCustomers.maybeRequireCustomer(req, res);
  if (supabaseCustomer === false) return;
  const customer = supabaseCustomer || await requireCustomer(req, res);
  if (!customer) return;
  if (req.method === "PATCH" || req.query?.preferences === "shipping") {
    try {
      let next;
      if (req.method === "PATCH") {
        // JSON-only, same-origin writes; the session determines the account.
        if (!/^application\/json(?:;|$)/i.test(req.headers["content-type"] || ""))
          return json(res, 415, { ok: false, error: "Request body must be valid JSON." });
        if (req.headers.origin && new URL(req.headers.origin).host !== req.headers.host)
          return json(res, 403, { ok: false, error: "Request failed." });
        const body = await readBody(req);
        if (typeof body.zip !== "string" || !/^(\d{5})?$/.test(body.zip.trim()))
          return json(res, 400, { ok: false, error: "Enter a five-digit US ZIP code." });
        next = { zip: body.zip.trim() };
      }
      return json(res, 200, { ok: true, preferences: await shippingPreferences(customer, next) });
    } catch {
      return json(res, 503, { ok: false, error: "Saved ZIP is unavailable. You can still choose a location." });
    }
  }
  return json(res, 200, { ok: true, customer: publicCustomer(customer) });
};
