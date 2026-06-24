function clean(value) {
  return String(value || "").trim();
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function textToHtml(text) {
  return clean(text)
    .split(/\n{2,}/)
    .map((paragraph) => `<p>${escapeHtml(paragraph).replace(/\n/g, "<br>")}</p>`)
    .join("");
}

async function sendEmail({ to, subject, text }) {
  const recipient = clean(to);
  if (!recipient || !process.env.RESEND_API_KEY || !process.env.QUOTE_FROM_EMAIL) {
    return { ok: false, skipped: true };
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: process.env.QUOTE_FROM_EMAIL,
      to: recipient,
      reply_to: process.env.QUOTE_REPLY_TO || "info@cubicship.com",
      subject: clean(subject),
      text: clean(text),
      html: textToHtml(text),
    }),
  });

  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    return { ok: false, error: result.message || "Email provider rejected the request." };
  }
  return { ok: true, id: result.id || null };
}

module.exports = {
  sendEmail,
};
