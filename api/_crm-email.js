const crypto = require("node:crypto");
const { db, checked } = require("./_crm");
module.exports = async function send(lead, user, b) {
  const subject = String(b.subject || "").trim(),
    message = String(b.message || "").trim();
  if (
    !/^[0-9a-f-]{36}$/i.test(b.requestId || "") ||
    !subject ||
    subject.length > 160 ||
    !message ||
    message.length > 6000
  )
    throw new Error("Enter a subject and message (up to 6,000 characters).");
  if (!process.env.RESEND_API_KEY || !process.env.QUOTE_FROM_EMAIL)
    throw new Error("Email sending is not configured.");
  const key = "email:" + lead.id + ":" + b.requestId;
  const digest = crypto
    .createHash("sha256")
    .update(lead.contact.email + "\n" + subject + "\n" + message)
    .digest("hex");
  let entry = await checked(
    db().from("crm_activities").select("*").eq("event_key", key).maybeSingle(),
  );
  if (entry) {
    if (entry.metadata.digest !== digest)
      throw new Error(
        "This send attempt has different content. Reopen the request before composing another email.",
      );
    if (entry.metadata.status === "accepted")
      return { ok: true, status: "accepted" };
    if (Date.now() - Date.parse(entry.created_at) > 23 * 3600000)
      throw new Error(
        "This earlier send needs manual review before retrying. Check the email provider first.",
      );
  } else {
    const r = await db()
      .from("crm_activities")
      .insert({
        lead_id: lead.id,
        event_key: key,
        kind: "email",
        actor: user.name || user.email,
        body: subject + "\n\n" + message,
        metadata: { status: "pending", digest },
      })
      .select("*")
      .single();
    if (r.error) {
      if (r.error.code === "23505")
        throw new Error(
          "This send is already processing. Refresh the request.",
        );
      throw r.error;
    }
    entry = r.data;
  }
  try {
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      signal: AbortSignal.timeout(15000),
      headers: {
        Authorization: "Bearer " + process.env.RESEND_API_KEY,
        "Content-Type": "application/json",
        "Idempotency-Key": key,
      },
      body: JSON.stringify({
        from: process.env.QUOTE_FROM_EMAIL,
        to: lead.contact.email,
        reply_to: process.env.QUOTE_REPLY_TO || "info@cubicship.com",
        subject,
        text: message,
      }),
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) {
      await checked(
        db()
          .from("crm_activities")
          .update({
            metadata: { digest, status: "failed", http_status: r.status },
          })
          .eq("id", entry.id),
      );
      throw new Error(
        "The email provider did not accept this message. Check the timeline before retrying.",
      );
    }
    await checked(
      db()
        .from("crm_activities")
        .update({
          metadata: { digest, status: "accepted", provider_id: data.id },
        })
        .eq("id", entry.id),
    );
    return { ok: true, status: "accepted" };
  } catch (e) {
    if (e.name === "TimeoutError" || e.name === "AbortError")
      throw new Error(
        "Delivery status is uncertain. Refresh the timeline; retrying the same message is protected against duplicates for 23 hours.",
      );
    throw e;
  }
};
