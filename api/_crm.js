const crypto = require("node:crypto");
const { createClient } = require("@supabase/supabase-js");
const { json, readBody, readStaffUsers, ownerUser } = require("./_portal-auth");
const { isDemoUser } = require("./_demo-data");
const locations = require("../assets/locations.json");
const smsConsent = require("../assets/sms-consent.json");
const LANGUAGES = new Set(
  require("../locales/languages.json").map((x) => x.code),
);
const STAGES = ["new", "contacted", "quote_sent", "follow_up", "won", "lost"];
const EVENTS = new Set([
  "page_view",
  "ship_click",
  "quote_click",
  "service_click",
  "locations_click",
  "call_click",
  "email_click",
  "directions_click",
  "freight_click",
  "account_click",
  "track_click",
  "language_change",
  "location_selected",
  "finder_search",
  "finder_geolocation",
  "form_start",
  "form_step",
  "shipment_step_1",
  "shipment_step_2",
  "shipment_step_3",
  "form_invalid",
  "form_submit_attempt",
  "form_error",
  "chat_open",
  "chat_handoff",
  "callback_open",
  "callback_dismiss",
]);
const text = (v, n = 200) =>
  typeof v === "string" ? v.trim().slice(0, n) : "";
const language = (v) => (LANGUAGES.has(v) ? v : "en");
const branch = (v) => (locations.some((l) => l.id === v) ? v : "");
const email = (v) => text(v, 254).toLowerCase();
const isEmail = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
function smsPhone(value) {
  const raw = text(value, 50);
  if (!raw || !/^\+?[\d().\s-]+$/.test(raw)) return "";
  const digits = raw.replace(/\D/g, "");
  if (raw.startsWith("+") && /^[1-9]\d{7,14}$/.test(digits)) return "+" + digits;
  if (/^\d{10}$/.test(digits)) return "+1" + digits;
  if (/^1\d{10}$/.test(digits)) return "+" + digits;
  return "";
}
const uuid = (v) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    v || "",
  );
function db() {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY)
    throw new Error("CRM unavailable");
  return createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    {
      auth: { persistSession: false, autoRefreshToken: false },
      global: {
        fetch: (url, opts) =>
          fetch(url, { ...opts, signal: AbortSignal.timeout(8000) }),
      },
    },
  );
}
async function checked(promise) {
  const { data, error } = await promise;
  if (error) throw error;
  return data;
}
function attribution(v) {
  const obj =
    typeof v === "string"
      ? (() => {
          try {
            return JSON.parse(v);
          } catch {
            return {};
          }
        })()
      : v;
  const out = {};
  // Campaign labels only: reject addresses, query strings and arbitrary URLs.
  for (const k of ["source", "medium", "campaign"])
    if (/^[\w .-]{1,80}$/.test(obj?.[k] || "") && !/\d{6,}/.test(obj[k]))
      out[k] = obj[k];
  return out;
}
function page(v) {
  const p = text(v, 120).split(/[?#]/)[0];
  if (
    /^\/(?:index|about|ship|services|business-services|print-pack|business-signage|dhl-locations|quote|track|privacy|service-terms|service-request|qr-shipment)\.html$/.test(
      p,
    )
  )
    return p;
  if (
    p === "/" ||
    [...LANGUAGES].some((l) => p === "/" + l || p === "/" + l + ".html")
  )
    return "/";
  if (locations.some((l) => p === "/locations/" + l.slug + ".html")) return p;
  return "other";
}
function originAllowed(req) {
  const o = req.headers?.origin;
  if (!o) return false;
  try {
    const u = new URL(o);
    return (
      u.origin === "https://www.cubicship.com" ||
      u.origin === "https://cubicship.com" ||
      (u.host === req.headers.host &&
        (u.protocol === "https:" || /^(localhost|127\.0\.0\.1):/.test(u.host)))
    );
  } catch {
    return false;
  }
}
async function limited(req, kind, limit, seconds) {
  const ip = String(
    req.headers["x-real-ip"] || req.headers["x-forwarded-for"] || "unknown",
  )
    .split(",")[0]
    .trim();
  const secret = process.env.PORTAL_SESSION_SECRET;
  if (!secret) throw new Error("CRM unavailable");
  // Short-lived keyed hashes only; raw IPs never enter the database.
  const key = crypto
    .createHmac("sha256", secret)
    .update(kind + ":" + new Date().toISOString().slice(0, 10) + ":" + ip)
    .digest("hex");
  return checked(
    db().rpc("crm_rate", { p_key: key, p_limit: limit, p_seconds: seconds }),
  );
}
function tokenFor(id) {
  return (
    id +
    "." +
    crypto
      .createHmac("sha256", process.env.PORTAL_SESSION_SECRET)
      .update("crm-unsubscribe:" + id)
      .digest("hex")
  );
}
function tokenContact(token) {
  const [id, sig] = text(token, 110).split(".");
  if (!uuid(id) || !sig || !process.env.PORTAL_SESSION_SECRET) return null;
  const expected = tokenFor(id).split(".")[1];
  return /^[a-f0-9]{64}$/.test(sig) &&
    crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))
    ? id
    : null;
}
async function publicHandler(req, res, action) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method === "GET" && action === "crm-lead") {
    try {
      await checked(db().from("crm_leads").select("id").limit(0));
      return json(res, 200, { available: true });
    } catch {
      return json(res, 503, { available: false });
    }
  }
  if (req.method !== "POST")
    return json(res, 405, { ok: false, error: "Method not allowed" });
  if (!originAllowed(req))
    return json(res, 403, { ok: false, error: "Open this form on CubicShip." });
  try {
    const b = await readBody(req);
    if (JSON.stringify(b).length > 6000)
      return json(res, 413, { ok: false, error: "Request too large" });
    if (action === "crm-event") {
      if (!EVENTS.has(b.event)) return json(res, 400, { ok: false });
      if (!(await limited(req, "events", 180, 60)))
        return json(res, 429, { ok: false });
      await checked(
        db().rpc("crm_count", {
          p_event: b.event,
          p_page: page(b.page),
          p_language: language(b.language),
          p_branch: branch(b.branch),
        }),
      );
      return json(res, 200, { ok: true });
    }
    if (action === "crm-unsubscribe") {
      const id = tokenContact(b.token);
      if (!id)
        return json(res, 400, { ok: false, error: "Invalid preference link." });
      await checked(
        db()
          .from("crm_contacts")
          .update({
            marketing_consent: false,
            unsubscribed_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq("id", id),
      );
      return json(res, 200, { ok: true });
    }
    if (action !== "crm-lead") return json(res, 404, { ok: false });
    if (b.website) return json(res, 200, { ok: true });
    if (
      !uuid(b.requestId) ||
      !isEmail(email(b.email)) ||
      b.purpose !== "service_follow_up"
    )
      return json(res, 400, {
        ok: false,
        error: "Please enter a valid email address.",
      });
    if (b.postal && !/^\d{5}(?:-\d{4})?$/.test(b.postal))
      return json(res, 400, { ok: false, error: "Check the ZIP code." });
    const phone = smsPhone(b.phone), smsOptIn = b.smsConsent === true;
    if ((b.phone && !phone) || (smsOptIn && !phone))
      return json(res, 400, { ok: false, error: "Please enter a valid phone number." });
    if (typeof b.smsConsent === "boolean" && b.smsConsentVersion !== smsConsent.version)
      return json(res, 400, { ok: false, error: "Reload the contact form and review the SMS consent." });
    if (!(await limited(req, "callback", 8, 3600)))
      return json(res, 429, { ok: false, error: "Please try again later." });
    const result = await checked(
      db().rpc("crm_ingest", {
        p: {
          source_key:
            "callback:" +
            crypto
              .createHash("sha256")
              .update(b.requestId + email(b.email))
              .digest("hex"),
          source: "website_callback",
          email: email(b.email),
          name: text(b.name, 100),
          phone,
          postal_code: text(b.postal, 10),
          language: language(b.language),
          branch_id: branch(b.branch),
          title: "Contact us request",
          details: text(b.details, 1500),
          attribution: attribution(b.attribution),
          marketing: b.marketing === true,
        },
      }),
    );
    if (typeof b.smsConsent === "boolean") {
      const locale = language(b.language);
      const disclosure = smsConsent.copies[locale].consent;
      // Separate SMS evidence from email marketing consent. Never confirm a
      // submission until this record is durable; retry preserves the original.
      await checked(
        db().from("crm_activities").upsert({
          lead_id: result.id,
          event_key: "sms-consent:" + result.id,
          kind: "consent",
          actor: "website visitor",
          body: smsOptIn
            ? "SMS opt-in submitted for " + phone + ".\n\n" + disclosure
            : "SMS opt-in was not selected. This request does not grant SMS consent.",
          metadata: {
            channel: "sms", opted_in: smsOptIn, phone,
            version: smsConsent.version, language: locale,
            disclosure, privacy_url: smsConsent.privacyUrl,
            terms_url: smsConsent.termsUrl, phone_verified: false,
          },
        }, { onConflict: "event_key", ignoreDuplicates: true }),
      );
    }
    return json(res, 200, {
      ok: true,
      preferencesToken: tokenFor(result.contact_id),
    });
  } catch (e) {
    console.error(
      "CRM public request failed",
      text(e.code, 30) || "unavailable",
    );
    return json(res, 503, {
      ok: false,
      error:
        "Could not save your request. Please try again or contact your counter.",
    });
  }
}
function shipmentRecord(s) {
  const address = email(s.customerEmail);
  if (!s.id || !isEmail(address) || address === "counter-intake@cubicship.com")
    return null;
  const notifications = {};
  for (const k of [
    "customerNotificationStatus",
    "locationNotificationStatus",
    "trackingReadyNotificationStatus",
    "locationNotifiedAt",
    "trackingReadyNotifiedAt",
  ])
    if (s[k]) notifications[k] = text(s[k], 80);
  return {
    source_key: "shipment:" + s.id,
    email: address,
    name: text(s.customerName),
    phone: text(s.customerPhone, 50),
    branch_id: branch(s.locationId),
    source:
      s.requestKind === "service" || s.printDesign
        ? "website_service"
        : "website_shipping",
    language: s.crmLanguage ? language(s.crmLanguage) : "unknown",
    title: text(s.serviceType || "Customer request"),
    details: [
      s.number,
      s.destinationCountry && "Destination: " + s.destinationCountry,
      s.contents,
      s.notes,
    ]
      .filter(Boolean)
      .join("\n")
      .slice(0, 4000),
    created_at: s.createdAt,
    source_status: text(s.status, 40),
    notifications,
    attribution: attribution(s.crmAttribution),
  };
}
async function syncShipments(items) {
  const records = items
    .map((s) => ({ s, p: shipmentRecord(s) }))
    .filter((x) => x.p);
  let saved = 0;
  for (let i = 0; i < records.length; i += 5) {
    await Promise.all(
      records.slice(i, i + 5).map(async ({ s, p }) => {
        const result = await checked(db().rpc("crm_ingest", { p }));
        const events = (Array.isArray(s.auditLog) ? s.auditLog : []).map(
          (a) => ({
            lead_id: result.id,
            event_key:
              "shipment-audit:" +
              crypto
                .createHash("sha256")
                .update(s.id + JSON.stringify(a))
                .digest("hex"),
            kind: "request_update",
            actor: text(a.by) || "system",
            body: text(a.message, 4000) || text(a.action),
            metadata: { action: text(a.action, 100) },
            ...(Number.isFinite(Date.parse(a.at))
              ? { created_at: new Date(a.at).toISOString() }
              : {}),
          }),
        );
        for (const [key, value] of Object.entries(p.notifications)) {
          if (!key.endsWith("Status")) continue;
          events.push({
            lead_id: result.id,
            event_key: "notification:" + s.id + ":" + key + ":" + value,
            kind: "notification",
            actor: "system",
            body: key.replace(/([A-Z])/g, " $1") + ": " + value,
            metadata: { status: value },
          });
        }
        for (let j = 0; j < events.length; j += 100)
          await checked(
            db()
              .from("crm_activities")
              .upsert(events.slice(j, j + 100), {
                onConflict: "event_key",
                ignoreDuplicates: true,
              }),
          );
      }),
    );
    saved += Math.min(5, records.length - i);
  }
  return saved;
}
async function syncChanged(items, old) {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) return;
  const before = new Map(
    old.map((s) => [s.id, JSON.stringify([shipmentRecord(s), s.auditLog])]),
  );
  const changed = items.filter(
    (s) => JSON.stringify([shipmentRecord(s), s.auditLog]) !== before.get(s.id),
  );
  if (!changed.length) return;
  try {
    await syncShipments(changed);
  } catch (e) {
    console.error(
      "CRM sync pending; recover with CRM Sync inquiries",
      text(e.code, 30) || "unavailable",
    );
  }
}
function scope(query, user) {
  return user.role === "owner"
    ? query
    : query.eq("branch_id", user.locationId || "__none__");
}
async function leadFor(id, user) {
  if (!uuid(id)) return null;
  return checked(
    scope(
      db().from("crm_leads").select("*,contact:crm_contacts(*)").eq("id", id),
      user,
    ).maybeSingle(),
  );
}
async function staffChoices(user) {
  const staff = (await readStaffUsers()).filter(
    (x) => x.active !== false && !isDemoUser(x),
  );
  const all = [ownerUser(), ...staff];
  return all
    .filter((x) => user.role === "owner" || x.locationId === user.locationId)
    .map((x) => ({
      id: x.id,
      name: x.name || x.email,
      locationId: x.locationId || "",
      role: x.role,
    }));
}
function patchFor(b, user) {
  const p = {};
  if ("stage" in b) {
    if (!STAGES.includes(b.stage)) throw new Error("Choose a valid stage.");
    p.stage = b.stage;
  }
  if ("assigned_to" in b) p.assigned_to = text(b.assigned_to, 120);
  if ("due_at" in b) {
    if (
      b.due_at !== null &&
      (!b.due_at || !Number.isFinite(Date.parse(b.due_at)))
    )
      throw new Error("Choose a valid follow-up time.");
    p.due_at = b.due_at === null ? null : new Date(b.due_at).toISOString();
  }
  if ("value" in b) {
    if (
      b.value !== null &&
      (!Number.isFinite(Number(b.value)) ||
        Number(b.value) < 0 ||
        Number(b.value) > 9999999999)
    )
      throw new Error("Enter a valid quote value.");
    p.value = b.value === null ? null : Number(b.value);
  }
  if ("branch_id" in b) {
    if (user.role !== "owner")
      throw new Error("Only the owner can move a lead.");
    if (b.branch_id && !branch(b.branch_id))
      throw new Error("Choose a valid branch.");
    p.branch_id = b.branch_id;
  }
  return p;
}
async function paged(query, cap = 5000) {
  const rows = [];
  for (let offset = 0; offset < cap; offset += 500) {
    const batch = await checked(
      query.range(offset, Math.min(offset + 499, cap - 1)),
    );
    rows.push(...batch);
    if (batch.length < 500) break;
  }
  return rows;
}
async function staffHandler(req, res, user) {
  res.setHeader("Cache-Control", "private, no-store");
  if (isDemoUser(user))
    return json(res, 403, {
      ok: false,
      error: "The live CRM is unavailable to demo accounts.",
    });
  const u = new URL(req.url, "https://cubicship.com");
  const action = u.searchParams.get("action") || "list";
  try {
    if (req.method === "GET") {
      if (action === "detail") {
        const lead = await leadFor(u.searchParams.get("id"), user);
        if (!lead)
          return json(res, 404, { ok: false, error: "Lead not found." });
        const [activities, history] = await Promise.all([
          checked(
            db()
              .from("crm_activities")
              .select("*")
              .eq("lead_id", lead.id)
              .order("created_at", { ascending: false })
              .limit(100),
          ),
          checked(
            scope(
              db()
                .from("crm_leads")
                .select("id,title,stage,created_at,source,branch_id")
                .eq("contact_id", lead.contact_id),
              user,
            )
              .order("created_at", { ascending: false })
              .limit(100),
          ),
        ]);
        return json(res, 200, { ok: true, lead, activities, history });
      }
      if (action === "metrics") {
        const days = 30,
          since = new Date(Date.now() - days * 86400000)
            .toISOString()
            .slice(0, 10);
        // Page-level analytics are owner-only; branch staff get their server-confirmed inquiry counts.
        let q = db()
          .from("crm_metrics")
          .select("*")
          .gte("day", since)
          .order("day", { ascending: false })
          .limit(5000);
        if (user.role !== "owner")
          q = q.eq("branch_id", user.locationId || "__none__");
        const pipeline = await paged(
          scope(
            db()
              .from("crm_leads")
              .select("stage,source,language,branch_id,value,attribution")
              .gte("created_at", since),
            user,
          ).limit(5000),
        );
        return json(res, 200, {
          ok: true,
          metrics: await paged(q),
          pipeline,
          days,
          limit: 5000,
        });
      }
      const offset = Math.max(
        0,
        Math.min(100000, parseInt(u.searchParams.get("offset")) || 0),
      );
      let q = scope(
        db()
          .from("crm_leads")
          .select(
            "*,contact:crm_contacts!inner(id,email,name,phone,postal_code,marketing_consent,consent_at,unsubscribed_at),emails:crm_activities(kind,metadata)",
            { count: "exact" },
          ),
        user,
      )
        .order("created_at", { ascending: false })
        .range(offset, offset + 99);
      if (STAGES.includes(u.searchParams.get("stage")))
        q = q.eq("stage", u.searchParams.get("stage"));
      if (u.searchParams.get("branch") && user.role === "owner")
        q = q.eq("branch_id", u.searchParams.get("branch"));
      if (u.searchParams.get("language"))
        q = q.eq(
          "language",
          u.searchParams.get("language") === "unknown"
            ? "unknown"
            : language(u.searchParams.get("language")),
        );
      if (u.searchParams.get("source"))
        q = q.eq("source", text(u.searchParams.get("source"), 50));
      if (u.searchParams.get("due") === "1")
        q = q
          .lte("due_at", new Date(Date.now() + 86400000).toISOString())
          .not("stage", "in", "(won,lost)");
      const search = text(u.searchParams.get("search"), 80).replace(
        /[^\p{L}\p{N}@. +_-]/gu,
        "",
      );
      if (search)
        q = q.or(
          "name.ilike.%" +
            search +
            "%,email.ilike.%" +
            search +
            "%,phone.ilike.%" +
            search +
            "%",
          { referencedTable: "contact" },
        );
      const r = await q;
      if (r.error) throw r.error;
      return json(res, 200, {
        ok: true,
        leads: r.data,
        total: r.count,
        offset,
        user: { name: user.name, role: user.role, id: user.id },
        staff: await staffChoices(user),
        locations: locations
          .filter((l) => user.role === "owner" || l.id === user.locationId)
          .map((l) => ({ id: l.id, name: l.city + ", " + l.state })),
      });
    }
    if (req.method !== "POST" && req.method !== "PATCH")
      return json(res, 405, { ok: false, error: "Method not allowed" });
    if (!originAllowed(req))
      return json(res, 403, { ok: false, error: "Open the CRM on CubicShip." });
    const b = await readBody(req);
    if (JSON.stringify(b).length > 150000)
      return json(res, 413, { ok: false, error: "Request too large." });
    if (action === "sync") {
      const all = await require("./_shipments").readShipments(user);
      const eligible = all.filter(
        (s) => user.role === "owner" || s.locationId === user.locationId,
      );
      const offset = Math.max(0, Number(b.offset) || 0),
        batch = eligible.slice(offset, offset + 50);
      const saved = await syncShipments(batch);
      return json(res, 200, {
        ok: true,
        saved,
        next: offset + 50 < eligible.length ? offset + 50 : null,
        total: eligible.length,
      });
    }
    if (action === "import") {
      if (!["owner", "manager"].includes(user.role))
        return json(res, 403, { ok: false, error: "Manager access required." });
      if (!Array.isArray(b.rows) || !b.rows.length || b.rows.length > 100)
        return json(res, 400, {
          ok: false,
          error: "Import 1–100 rows at a time.",
        });
      const records = b.rows.map((r, i) => {
        if (
          !text(r.external_id) ||
          !isEmail(email(r.email)) ||
          !branch(r.branch_id)
        )
          throw new Error(
            "Row " + (i + 1) + ": ID, valid email and branch are required.",
          );
        if (user.role !== "owner" && r.branch_id !== user.locationId)
          throw new Error("Import only your assigned branch.");
        return {
          source_key: "freight:" + text(r.external_id, 150),
          source: "external_freight",
          email: email(r.email),
          name: text(r.name),
          phone: text(r.phone, 50),
          branch_id: r.branch_id,
          language: language(r.language),
          title: text(r.title) || "Freight inquiry",
          details: text(r.details, 4000),
        };
      });
      let created = 0;
      for (const p of records) {
        const r = await checked(db().rpc("crm_ingest", { p }));
        if (r.created) created++;
      }
      return json(res, 200, {
        ok: true,
        created,
        existing: records.length - created,
      });
    }
    const lead = await leadFor(b.id, user);
    if (!lead) return json(res, 404, { ok: false, error: "Lead not found." });
    if (action === "email")
      return json(res, 200, await require("./_crm-email")(lead, user, b));
    if (action === "optout") {
      await checked(
        db()
          .from("crm_contacts")
          .update({
            marketing_consent: false,
            unsubscribed_at: new Date().toISOString(),
          })
          .eq("id", lead.contact_id),
      );
      await checked(
        db()
          .from("crm_activities")
          .insert({
            lead_id: lead.id,
            kind: "consent",
            actor: user.name || user.email,
            body: "Marketing consent withdrawn by staff at customer request.",
          }),
      );
      return json(res, 200, { ok: true });
    }
    if (action === "update") {
      if (!Number.isSafeInteger(b.version) || b.version < 1)
        throw new Error("Refresh this request before saving changes.");
      const patch = patchFor(b.patch || {}, user);
      if (patch.assigned_to) {
        const choices = await staffChoices(user);
        const assignee = choices.find((s) => s.id === patch.assigned_to);
        if (
          !assignee ||
          (assignee.role !== "owner" &&
            assignee.locationId !== (patch.branch_id ?? lead.branch_id))
        )
          throw new Error("Choose staff at the lead’s branch.");
      }
      if (
        patch.branch_id !== undefined &&
        patch.branch_id !== lead.branch_id &&
        !("assigned_to" in patch)
      )
        patch.assigned_to = "";
      const result = await db().rpc("crm_update", {
        p_id: lead.id,
        p_version: Number(b.version),
        p_branch: user.role === "owner" ? null : user.locationId,
        p_patch: patch,
        p_actor: user.name || user.email,
        p_note: text(b.note, 4000),
      });
      if (result.error?.message?.includes("version_conflict"))
        return json(res, 409, {
          ok: false,
          error: "Someone updated this lead. Refresh and try again.",
        });
      if (result.error) throw result.error;
      return json(res, 200, { ok: true, lead: result.data });
    }
    return json(res, 400, { ok: false, error: "Unknown action." });
  } catch (e) {
    console.error("CRM staff request failed", text(e.code, 30) || "validation");
    return json(res, e.code ? 503 : 400, {
      ok: false,
      error: e.code
        ? "CRM temporarily unavailable. Your original inquiries are safe; try Sync inquiries again."
        : text(e.message, 180) || "Request failed.",
    });
  }
}
module.exports = {
  publicHandler,
  staffHandler,
  syncChanged,
  syncShipments,
  shipmentRecord,
  attribution,
  language,
  page,
  patchFor,
  originAllowed,
  tokenContact,
  tokenFor,
  leadFor,
  db,
  checked,
  EVENTS,
  STAGES,
};
