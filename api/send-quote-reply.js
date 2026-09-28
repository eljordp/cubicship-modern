const crypto = require("node:crypto");
const { requireUser, json, readBody } = require("./_portal-auth");
const { isDemoUser } = require("./_demo-data");
const { db, checked, originAllowed, leadFor } = require("./_crm");
module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST")
    return json(res, 405, { ok: false, error: "Method not allowed" });
  const user = await requireUser(req, res);
  if (!user) return;
  if (isDemoUser(user) || !originAllowed(req))
    return json(res, 403, {
      ok: false,
      error: "Use an authorized staff account on CubicShip.",
    });
  try {
    const b = await readBody(req),
      to = String(b.to || "")
        .trim()
        .toLowerCase();
    if (
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to) ||
      to.length > 254 ||
      !String(b.subject || "").trim() ||
      !String(b.message || "").trim()
    )
      return json(res, 400, {
        ok: false,
        error: "A valid customer email, subject and message are required.",
      });
    let query = db()
      .from("crm_leads")
      .select("id,contact:crm_contacts!inner(email)")
      .eq("contact.email", to)
      .order("created_at", { ascending: false })
      .limit(1);
    if (user.role !== "owner")
      query = query.eq("branch_id", user.locationId || "__none__");
    const rows = await checked(query);
    let id = rows[0]?.id;
    if (!id) {
      const r = await checked(
        db().rpc("crm_ingest", {
          p: {
            source_key:
              "staff-email:" +
              crypto
                .createHash("sha256")
                .update((user.locationId || "owner") + ":" + to)
                .digest("hex"),
            email: to,
            source: "staff_email",
            branch_id: user.locationId || "",
            language: "en",
            title: "Staff quote reply",
          },
        }),
      );
      id = r.id;
    }
    const lead = await leadFor(id, user);
    if (!lead)
      return json(res, 403, {
        ok: false,
        error: "This request belongs to another branch.",
      });
    const result = await require("./_crm-email")(lead, user, {
      ...b,
      requestId: b.requestId || crypto.randomUUID(),
    });
    return json(res, 200, result);
  } catch (e) {
    console.error("Quote reply failed", e.code || "send");
    return json(res, 503, {
      ok: false,
      error: e.code
        ? "Could not save the email history. Please try again."
        : e.message || "Email could not be sent.",
    });
  }
};
