const {
  clearCustomerCookie,
  json,
} = require("./_customer-auth");

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    return json(res, 405, { ok: false, error: "Method not allowed" });
  }

  clearCustomerCookie(res);
  return json(res, 200, { ok: true });
};
