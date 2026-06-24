const {
  json,
  publicUser,
  requireUser,
} = require("./_portal-auth");

module.exports = async function handler(req, res) {
  if (req.method !== "GET") {
    return json(res, 405, { ok: false, error: "Method not allowed" });
  }

  const user = await requireUser(req, res);
  if (!user) return;
  return json(res, 200, { ok: true, user: publicUser(user) });
};
