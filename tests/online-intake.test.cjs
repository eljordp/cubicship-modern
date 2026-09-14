const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const path = require("node:path");
const {
  validateOnlineIntake,
  onlineReceipt,
} = require("../api/_online-intake");
function quote(overrides = {}) {
  return {
    intakeChannel: "online",
    requestId: "f2b3b068-6fe5-4991-b435-10f45191c022",
    locationId: "bridgeview",
    requestKind: "quote",
    handoff: "dropoff",
    packing: "needed",
    shipmentType: "package",
    acknowledge: "on",
    senderName: "Test Sender",
    senderEmail: "sender@example.com",
    senderPhone: "2025550123",
    senderPostal: "60455",
    senderCountry: "United States",
    receiverCity: "London",
    receiverCountry: "United Kingdom",
    contents: "Two cotton shirts",
    pieces: "1",
    weight: "2 lb",
    dimensions: "length: 10 in, width: 8 in, height: 4 in",
    notes: "Quote first",
    ...overrides,
  };
}
function harness(options = {}) {
  const state = { shipments: [], emails: [], writes: 0 };
  const json = (res, status, data) => {
    res.statusCode = status;
    res.end(JSON.stringify(data));
  };
  const mocks = {
    crypto: require("crypto"),
    "./_customer-auth": {
      clean: (v) => String(v || "").trim(),
      json,
      readBody: async (req) => req.body,
      publicCustomer: (x) => x,
      requireCustomer: async () => null,
    },
    "@vercel/blob": {},
    "./_shipments": {
      makeGenericNumber: () => `CSTEST-${state.shipments.length + 1}`,
      publicShipment: (x) => x,
      sortNewestFirst: (x) => x,
      readShipments: async () => structuredClone(state.shipments),
      writeShipments: async (items) => {
        if (options.failSave) throw Error("Storage unavailable");
        state.writes++;
        state.shipments = structuredClone(items);
      },
    },
    "./_email": {
      sendEmail: async (data) => {
        state.emails.push(data);
        if (options.failEmail) throw Error("Email unavailable");
        return { ok: true, id: "fake-notification" };
      },
    },
    "./_locations": require("../api/_locations"),
    "./_supabase-customer-store": { maybeRequireCustomer: async () => null },
    "./_rate-limit": {
      consumeRateLimit: () => ({
        allowed: !options.rateLimited,
        retryAfter: 60,
      }),
      sendRateLimited: (res, rate, message) =>
        json(res, 429, { ok: false, error: message }),
    },
    "./_online-intake": { validateOnlineIntake, onlineReceipt },
  };
  const module = { exports: {} };
  vm.runInNewContext(
    fs.readFileSync(
      path.join(__dirname, "../api/customer-shipments.js"),
      "utf8",
    ),
    {
      require: (name) => {
        if (!(name in mocks)) throw Error(name);
        return mocks[name];
      },
      module,
      exports: module.exports,
      URL,
      Date,
      Math,
      process: { env: {} },
      Buffer,
      console,
    },
  );
  return {
    state,
    handler: module.exports,
    async send(body) {
      const req = {
        url: "/api/customer-shipments?source=qr",
        method: "POST",
        headers: { host: "localhost" },
        body,
      };
      const res = {
        statusCode: 200,
        setHeader() {},
        end(text) {
          this.data = JSON.parse(text);
        },
      };
      await module.exports(req, res);
      return res;
    },
  };
}
module.exports = { harness, quote };
if (process.env.CUBIC_TEST_SERVER !== "1") {
  test("quote accepts minimal contact and destination without full receiver address", () =>
    assert.equal(validateOnlineIntake(quote()), ""));
  test("drop-off requires full contact/address details", () =>
    assert.match(
      validateOnlineIntake(quote({ requestKind: "dropoff" })),
      /Complete/,
    ));
  test("reject inactive and unknown branches, missing consent and invalid package values", () => {
    for (const patch of [
      { locationId: "freeport" },
      { locationId: "unknown" },
      { acknowledge: "" },
      { pieces: "-1" },
      { weight: "-2 lb" },
      { senderEmail: "wrong" },
      { length: "0" },
    ])
      assert.ok(validateOnlineIntake(quote(patch)), JSON.stringify(patch));
  });
  test("saved online quote returns code and routes package details to chosen branch", async () => {
    const h = harness();
    const res = await h.send(quote({ locationId: "dearborn" }));
    assert.equal(res.statusCode, 201);
    assert.equal(h.state.shipments[0].locationId, "dearborn");
    assert.equal(h.state.shipments[0].source, "qr_counter_intake");
    assert.equal(h.state.shipments[0].requestKind, "quote");
    assert.match(h.state.emails[0].text, /Two cotton shirts/);
    assert.match(h.state.emails[0].text, /dearborn/);
    assert.deepEqual(Object.keys(res.data.shipment).sort(), [
      "locationId",
      "locationName",
      "number",
      "status",
      "statusUrl",
    ]);
  });
  test("retries return existing receipt without duplicate order or notification", async () => {
    const h = harness();
    const a = await h.send(quote());
    const b = await h.send(quote());
    assert.equal(a.data.shipment.number, b.data.shipment.number);
    assert.equal(h.state.shipments.length, 1);
    assert.equal(h.state.emails.length, 2);
  });
  test("email outage retains saved request and returns confirmation", async () => {
    const h = harness({ failEmail: true });
    const r = await h.send(quote());
    assert.equal(r.statusCode, 201);
    assert.equal(h.state.shipments[0].status, "submitted");
    assert.equal(h.state.writes, 2);
  });
  test("storage failure cannot issue a successful confirmation or email", async () => {
    const h = harness({ failSave: true });
    await assert.rejects(h.send(quote()), /Storage/);
    assert.equal(h.state.emails.length, 0);
  });
  test("rate limit prevents storage and email side effects", async () => {
    const h = harness({ rateLimited: true });
    const r = await h.send(quote());
    assert.equal(r.statusCode, 429);
    assert.equal(h.state.writes, 0);
    assert.equal(h.state.emails.length, 0);
  });
  test("full drop-off tolerates a destination without postal code or receiver email", async () => {
    const h = harness();
    const r = await h.send(
      quote({
        requestKind: "dropoff",
        senderAddress1: "100 Test Street",
        senderCity: "Bridgeview",
        receiverName: "Test Receiver",
        receiverAddress1: "200 Test Street",
        receiverPhone: "442079460123",
        receiverPostal: "",
        receiverEmail: "",
      }),
    );
    assert.equal(r.statusCode, 201);
  });
  test("existing counter QR contract remains supported", async () => {
    const h = harness();
    const r = await h.send(
      quote({
        intakeChannel: "counter_qr",
        senderAddress1: "100 Test Street",
        senderCity: "Bridgeview",
        receiverName: "Test Receiver",
        receiverAddress1: "200 Test Street",
        receiverPhone: "442079460123",
        receiverPostal: "SW1A 1AA",
        receiverEmail: "receiver@example.com",
      }),
    );
    assert.equal(r.statusCode, 201);
    assert.equal(h.state.shipments[0].intakeChannel, "counter_qr");
    assert.ok(r.data.copyText);
  });
}
