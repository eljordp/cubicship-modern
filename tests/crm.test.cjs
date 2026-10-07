const test = require("node:test"),
  assert = require("node:assert/strict"),
  fs = require("node:fs"),
  vm = require("node:vm"),
  path = require("node:path");
const crm = require("../api/_crm");
const id = "11111111-1111-4111-8111-111111111111";
function harness() {
  const calls = [];
  let result = { data: [], error: null, count: 0 };
  let upsertResult;
  const query = new Proxy(
    {},
    {
      get: (target, key) =>
        key === "then"
          ? (resolve) => resolve(result)
          : (...args) => {
              calls.push([key, ...args]);
              if (key === "upsert" && upsertResult) return Promise.resolve(upsertResult);
              return query;
            },
    },
  );
  const module = { exports: {} };
  const requireMock = (name) =>
    name === "@supabase/supabase-js"
      ? { createClient: () => query }
      : name === "./_portal-auth"
        ? {
            json: (r, s, b) => {
              r.statusCode = s;
              r.body = b;
            },
            readBody: async (r) => r.body,
            readStaffUsers: async () => [],
            ownerUser: () => ({ id: "owner", role: "owner" }),
          }
        : name === "./_demo-data"
          ? { isDemoUser: (u) => u.demo === true }
          : require(
              require.resolve(name, {
                paths: [path.resolve(__dirname, "../api")],
              }),
            );
  vm.runInNewContext(
    fs.readFileSync(path.resolve(__dirname, "../api/_crm.js"), "utf8"),
    {
      module,
      require: requireMock,
      process: {
        env: {
          SUPABASE_URL: "https://example.invalid",
          SUPABASE_SERVICE_ROLE_KEY: "fixture",
          PORTAL_SESSION_SECRET: "fixture-secret",
        },
      },
      console,
      URL,
      Date,
      Buffer,
      AbortSignal,
      fetch: () => {
        throw Error("Unexpected fetch");
      },
    },
  );
  return {
    api: module.exports,
    calls,
    setResult: (r) => (result = r),
    setUpsertResult: (r) => (upsertResult = r),
    req: (body, method = "POST") => ({
      method,
      url: "/api/crm",
      body,
      headers: {
        host: "www.cubicship.com",
        origin: "https://www.cubicship.com",
      },
    }),
  };
}
test("analytics accepts only fixed event and page dimensions; strips query tokens", () => {
  assert.equal(
    crm.page("/ship.html?email=secret@example.com#private-token"),
    "/ship.html",
  );
  assert.equal(crm.page("/request-status.html"), "other");
  assert.equal(crm.page("/ar"), "/");
  assert.equal(crm.page("/users/secret@example.com"), "other");
  assert.equal(crm.language("secret@example.com"), "en");
  assert(!crm.EVENTS.has("customer_email"));
  assert(!crm.EVENTS.has("inquiry_saved"));
  assert.deepEqual(
    crm.attribution({
      source: "email@example.com",
      medium: "email",
      campaign: "sale?token=secret",
    }),
    { medium: "email" },
  );
});
test("shipment mapping excludes private links, recipient addresses and sentinel emails", () => {
  const s = {
    id: "one",
    customerEmail: "Person@Example.com",
    customerName: "Person",
    locationId: "bridgeview",
    crmLanguage: "es",
    guestAccessToken: "secret",
    receiver: { address1: "private" },
    labelPdf: { url: "private" },
    createdAt: "2026-09-27T01:00:00Z",
  };
  const r = crm.shipmentRecord(s);
  assert.equal(r.email, "person@example.com");
  assert.equal(r.source_key, "shipment:one");
  assert.equal(r.language, "es");
  assert(!JSON.stringify(r).includes("secret"));
  assert(!JSON.stringify(r).includes("private"));
  assert.equal(
    crm.shipmentRecord({ ...s, customerEmail: "counter-intake@cubicship.com" }),
    null,
  );
});
test("workflow validates dates, stages, values and branch reassignment", () => {
  const user = { role: "employee", locationId: "bridgeview" };
  assert.throws(() => crm.patchFor({ branch_id: "dearborn" }, user));
  assert.throws(() => crm.patchFor({ stage: "paid" }, user));
  assert.throws(() => crm.patchFor({ due_at: "not-a-date" }, user));
  assert.throws(() => crm.patchFor({ value: -1 }, user));
  assert.deepEqual(
    crm.patchFor({ stage: "won", due_at: null, value: "12.50" }, user),
    { stage: "won", due_at: null, value: 12.5 },
  );
});
test("public callback requires same-origin, valid email and explicit service purpose", async () => {
  const h = harness();
  for (const b of [
    { email: "bad", purpose: "service_follow_up", requestId: id },
    { email: "person@example.com", requestId: id },
  ]) {
    const res = { setHeader() {} };
    await h.api.publicHandler(h.req(b), res, "crm-lead");
    assert.equal(res.statusCode, 400);
  }
  const req = h.req({});
  req.headers.origin = "https://evil.example";
  const res = { setHeader() {} };
  await h.api.publicHandler(req, res, "crm-lead");
  assert.equal(res.statusCode, 403);
  assert.equal(h.calls.length, 0);
});
test("unknown/browser-forged confirmed events never increment analytics", async () => {
  const h = harness(),
    res = { setHeader() {} };
  await h.api.publicHandler(
    h.req({ event: "inquiry_saved" }),
    res,
    "crm-event",
  );
  assert.equal(res.statusCode, 400);
  assert.equal(h.calls.length, 0);
});
test("public capture fails closed during storage outage", async () => {
  const h = harness();
  h.setResult({ data: null, error: { code: "OFFLINE" } });
  const res = { setHeader() {} };
  await h.api.publicHandler(
    h.req({
      email: "person@example.com",
      purpose: "service_follow_up",
      requestId: id,
    }),
    res,
    "crm-lead",
  );
  assert.equal(res.statusCode, 503);
  assert.equal(res.body.ok, false);
});
test("callback sends marketing true only for an explicit boolean checkbox; retry key stable", async () => {
  const h = harness();
  h.setResult({ data: { contact_id: id }, error: null });
  const body = {
    email: "Person@Example.com",
    purpose: "service_follow_up",
    requestId: id,
    marketing: "on",
    language: "ar",
    website: "",
  };
  for (let i = 0; i < 2; i++) {
    const res = { setHeader() {} };
    await h.api.publicHandler(h.req(body), res, "crm-lead");
    assert.equal(res.statusCode, 200);
  }
  const calls = h.calls.filter((c) => c[0] === "rpc" && c[1] === "crm_ingest");
  assert.equal(calls.length, 2);
  assert.equal(calls[0][2].p.marketing, false);
  assert.equal(calls[0][2].p.source_key, calls[1][2].p.source_key);
  assert.equal(calls[0][2].p.language, "ar");
});
test("unsubscribe tokens are scoped, signed and tamper-resistant", () => {
  const h = harness(),
    token = h.api.tokenFor(id);
  assert.equal(h.api.tokenContact(token), id);
  assert.equal(
    h.api.tokenContact(token.slice(0, -1) + (token.endsWith("0") ? "1" : "0")),
    null,
  );
  assert.equal(h.api.tokenContact(id + ".bad"), null);
});
test("demo accounts cannot access live CRM and branch detail filters are mandatory", async () => {
  const h = harness();
  let res = { setHeader() {} };
  await h.api.staffHandler(h.req({}, "GET"), res, { demo: true });
  assert.equal(res.statusCode, 403);
  assert.equal(h.calls.length, 0);
  h.setResult({ data: null, error: null });
  const req = h.req({}, "GET");
  req.url = "/api/crm?action=detail&id=" + id;
  res = { setHeader() {} };
  await h.api.staffHandler(req, res, {
    role: "employee",
    locationId: "bridgeview",
  });
  assert.equal(res.statusCode, 404);
  assert(
    h.calls.some(
      (c) => c[0] === "eq" && c[1] === "branch_id" && c[2] === "bridgeview",
    ),
  );
});
test("branch managers cannot import leads into another branch", async () => {
  const h = harness(),
    req = h.req({
      rows: [
        {
          external_id: "1",
          email: "person@example.com",
          branch_id: "dearborn",
        },
      ],
    });
  req.url = "/api/crm?action=import";
  const res = { setHeader() {} };
  await h.api.staffHandler(req, res, {
    role: "manager",
    locationId: "bridgeview",
  });
  assert.equal(res.statusCode, 400);
  assert(!h.calls.some((c) => c[0] === "rpc"));
});
test("customer help has complete copy for 18 languages and optional unchecked SMS consent", () => {
  const box = { window: {} };
  vm.runInNewContext(
    fs.readFileSync(path.resolve(__dirname, "../customer-copy.js"), "utf8"),
    box,
  );
  const languages = require("../locales/languages.json");
  assert.equal(Object.keys(box.window.CubicHelpCopy).length, 18);
  for (const l of languages) {
    assert.equal(box.window.CubicHelpCopy[l.code].length, 18);
    assert(
      box.window.CubicHelpCopy[l.code].every(
        (s) => typeof s === "string" && s.trim(),
      ),
    );
  }
  const js = fs.readFileSync(
    path.resolve(__dirname, "../customer-capture.js"),
    "utf8",
  );
  assert(!/name="marketing"/.test(js));
  assert(js.includes('name="smsConsent" type="checkbox"'));
  assert(!/name="smsConsent"[^>]*(checked|required)/.test(js));
  const sms = require("../assets/sms-consent.json");
  assert.equal(Object.keys(sms.copies).length, 18);
  for (const l of languages) {
    const s = sms.copies[l.code];
    for (const name of ["phone", "consent", "terms", "invalidPhone"]) assert(s[name].trim());
    for (const word of ["CubicShip", "STOP", "HELP"]) assert(s.consent.includes(word));
  }
});
test("public build includes collection on public pages only and excludes CRM source/secrets", () => {
  const root = path.resolve(__dirname, "../public");
  for (const f of [
    "index.html",
    "ship.html",
    "services.html",
    "dhl-locations.html",
  ])
    assert(
      fs.readFileSync(path.join(root, f), "utf8").includes("/analytics.js"),
    );
  for (const f of ["request-status.html", "auth/callback.html"])
    assert(
      !fs.readFileSync(path.join(root, f), "utf8").includes("/analytics.js"),
    );
  assert(!fs.existsSync(path.join(root, ".env.crm.local")));
  assert(!fs.existsSync(path.join(root, "api/_crm.js")));
  assert(fs.existsSync(path.join(root, "crm-import-template.csv")));
});
test("contact page embeds the follow-up form; other pages link to it instead of a pop-up", () => {
  const root = path.resolve(__dirname, "../public");
  const contact = fs.readFileSync(path.join(root, "contact.html"), "utf8");
  assert(contact.includes("data-contact-form"));
  assert(contact.includes("/customer-capture.js"));
  assert(contact.includes('href="mailto:info@cubicship.com"'));
  assert(contact.includes('href="/dhl-locations.html"'));
  const config = require("../assets/contact.json");
  assert.equal(contact.includes('href="sms:'), Boolean(config.sms));
  for (const f of ["index.html", "services.html", "privacy.html"])
    assert(fs.readFileSync(path.join(root, f), "utf8").includes('href="/contact.html"'), f);
  const js = fs.readFileSync(path.resolve(__dirname, "../customer-capture.js"), "utf8");
  assert(!/showModal|<dialog/.test(js));
  assert(js.includes('link.href = "/contact.html"'));
  assert(fs.readFileSync(path.join(root, "sitemap.xml"), "utf8").includes("https://cubicship.com/contact.html"));
  assert(contact.includes('/sms-copy.js'));
  for (const page of ["privacy.html", "service-terms.html"]) {
    const html = fs.readFileSync(path.join(root, page), "utf8");
    assert(html.includes('id="sms"'));
    for (const word of ["STOP", "HELP", "SMS"]) assert(html.includes(word));
    assert(!html.includes("contracts@example.com"));
    assert(!html.includes("(222) 222-2222"));
  }
});

const smsVersion = require("../assets/sms-consent.json").version;
const smsBody = {
  requestId: id, email: "person@example.com", purpose: "service_follow_up",
  phone: "(708) 555-0123", smsConsent: true, smsConsentVersion: smsVersion,
  language: "en", marketing: false,
};
test("SMS opt-in records phone and displayed disclosure separately from email marketing", async () => {
  const h = harness();
  h.setResult({data: {id, contact_id: id}, error: null});
  const res = {setHeader() {}};
  await h.api.publicHandler(h.req(smsBody), res, "crm-lead");
  assert.equal(res.statusCode, 200);
  const p = h.calls.find(c => c[0] === "rpc" && c[1] === "crm_ingest")[2].p;
  assert.equal(p.phone, "+17085550123");
  assert.equal(p.marketing, false);
  const audit = h.calls.find(c => c[0] === "upsert");
  assert.equal(audit[1].metadata.opted_in, true);
  assert.equal(audit[1].metadata.phone_verified, false);
  assert.equal(audit[1].metadata.disclosure, require("../assets/sms-consent.json").copies.en.consent);
  assert.equal(audit[1].metadata.version, smsVersion);
  assert.equal(audit[1].metadata.channel, "sms");
  assert.equal(audit[2].onConflict, "event_key");
  assert.equal(audit[2].ignoreDuplicates, true);
});
test("SMS opt-in requires a real phone format and the displayed current version", async () => {
  for (const patch of [{phone:""}, {phone:"bad"}, {phone:"555"}, {phone:"+000000000"}, {smsConsentVersion:"old"}]) {
    const h = harness(), res = {setHeader() {}};
    await h.api.publicHandler(h.req({...smsBody, ...patch}), res, "crm-lead");
    assert.equal(res.statusCode, 400);
    assert.equal(h.calls.length, 0);
  }
});
test("an unchecked SMS box does not require a phone or grant SMS or email marketing consent", async () => {
  const h = harness();
  h.setResult({data:{id, contact_id:id}, error:null});
  const res = {setHeader() {}};
  await h.api.publicHandler(h.req({...smsBody, phone:"", smsConsent:false}), res, "crm-lead");
  assert.equal(res.statusCode, 200);
  const audit = h.calls.find(c => c[0] === "upsert")[1];
  assert.equal(audit.metadata.opted_in, false);
  assert.match(audit.body, /does not grant SMS consent/);
});
test("a forged checkbox string cannot create SMS consent", async () => {
  const h = harness();
  h.setResult({data:{id, contact_id:id}, error:null});
  const res = {setHeader() {}};
  await h.api.publicHandler(h.req({...smsBody, smsConsent:"true"}), res, "crm-lead");
  assert.equal(res.statusCode, 200);
  assert(!h.calls.some(c => c[0] === "upsert"));
});
test("SMS evidence failure never confirms success; retry keeps the same inquiry and audit key", async () => {
  const h = harness();
  h.setResult({data:{id, contact_id:id}, error:null});
  h.setUpsertResult({data:null, error:{code:"OFFLINE"}});
  const first = {setHeader() {}};
  await h.api.publicHandler(h.req(smsBody), first, "crm-lead");
  assert.equal(first.statusCode, 503);
  assert.equal(first.body.ok, false);
  h.setUpsertResult({data:null, error:null});
  const second = {setHeader() {}};
  await h.api.publicHandler(h.req(smsBody), second, "crm-lead");
  assert.equal(second.statusCode, 200);
  const ingests = h.calls.filter(c => c[0] === "rpc" && c[1] === "crm_ingest");
  assert.equal(ingests[0][2].p.source_key, ingests[1][2].p.source_key);
  const audits = h.calls.filter(c => c[0] === "upsert");
  assert.equal(audits[0][1].event_key, audits[1][1].event_key);
});
