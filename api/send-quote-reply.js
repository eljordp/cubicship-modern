const requiredFields = ["to", "subject", "message"];
const { requireUser } = require("./_portal-auth");

function json(res, status, body) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(body));
}

function clean(value) {
  return String(value || "").trim();
}

function isEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    return json(res, 405, { ok: false, error: "Method not allowed" });
  }

  const user = await requireUser(req, res);
  if (!user) return;

  let body = {};
  try {
    body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};
  } catch (error) {
    return json(res, 400, { ok: false, error: "Request body must be valid JSON." });
  }
  const missing = requiredFields.filter((field) => !clean(body[field]));
  if (missing.length) {
    return json(res, 400, { ok: false, error: `Missing required fields: ${missing.join(", ")}` });
  }

  const to = clean(body.to);
  if (!isEmail(to)) {
    return json(res, 400, { ok: false, error: "Customer email is not valid." });
  }

  if (!process.env.RESEND_API_KEY || !process.env.QUOTE_FROM_EMAIL) {
    return json(res, 501, {
      ok: false,
      error: "Email sending is not configured yet. Add RESEND_API_KEY and QUOTE_FROM_EMAIL in Vercel.",
    });
  }

  const from = process.env.QUOTE_FROM_EMAIL;
  const replyTo = process.env.QUOTE_REPLY_TO || "info@cubicship.com";
  const subject = clean(body.subject);
  const text = clean(body.message);
  const operatorName = clean(user.name) || "Cubic Ship";
  const operatorEmail = clean(user.email);
  const html = text
    .split(/\n{2,}/)
    .map((paragraph) => `<p>${escapeHtml(paragraph).replace(/\n/g, "<br>")}</p>`)
    .join("");

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to,
      reply_to: replyTo,
      subject,
      text,
      html: `${html}<p style="color:#64748b;font-size:12px">Sent by ${escapeHtml(operatorName)}${operatorEmail ? ` (${escapeHtml(operatorEmail)})` : ""} through the Cubic Ship operator portal.</p>`,
    }),
  });

  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    return json(res, response.status, {
      ok: false,
      error: result.message || "Email provider rejected the request.",
    });
  }

  return json(res, 200, { ok: true, id: result.id || null });
};
