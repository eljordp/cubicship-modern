const { get } = require("@vercel/blob");
const { json } = require("./_customer-auth");
// A missing tiny probe is healthy (404 -> null). A suspended store returns 403.
// Never download customer records just to decide whether to display the form.
module.exports = async (req, res) => {
  if (req.method !== "GET") return json(res, 405, { ok: false });
  res.setHeader("Cache-Control", "public, max-age=30, s-maxage=30");
  try {
    await get("portal/intake-availability-probe.txt", {
      access: "private",
      useCache: false,
    });
    return json(res, 200, { available: true });
  } catch {
    return json(res, 503, { available: false });
  }
};
