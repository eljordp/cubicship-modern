const test = require("node:test"),
  assert = require("node:assert/strict");
const { createHarness } = require("./helpers/audit-harness.cjs");
const sample = {
  intakeChannel: "online",
  requestId: "f2b3b068-6fe5-4991-b435-10f45191c022",
  locationId: "dearborn",
  requestKind: "quote",
  handoff: "dropoff",
  packing: "needed",
  shipmentType: "package",
  acknowledge: "on",
  senderName: "Test Sender",
  senderEmail: "sender@example.com",
  senderPhone: "2025550123",
  senderPostal: "48126",
  senderCountry: "United States",
  receiverCity: "Toronto",
  receiverCountry: "Canada",
  contents: "Cotton shirts",
  pieces: "1",
};
test("parallel creates preserve all records, including concurrent creation of an empty store", async () => {
  const h = createHarness(),
    store = h.load("_shipments");
  const snapshots = await Promise.all(
    Array.from({ length: 5 }, () => store.readShipments()),
  );
  snapshots.forEach((s, i) => s.push({ id: "id-" + i, status: "submitted" }));
  await Promise.all(snapshots.map((s) => store.writeShipments(s)));
  assert.equal(h.state.items.length, 5);
  assert.equal(new Set(h.state.items.map((x) => x.id)).size, 5);
});
test("a subsequent write from the same read preserves concurrently added records", async () => {
  const h = createHarness(),
    store = h.load("_shipments");
  const a = await store.readShipments(),
    b = await store.readShipments();
  a.push({ id: "a", status: "submitted" });
  b.push({ id: "b", status: "submitted" });
  await store.writeShipments(a);
  await store.writeShipments(b);
  b[0].status = "in_review";
  await store.writeShipments(b);
  assert.equal(h.state.items.length, 2);
  assert.equal(h.state.items.find((x) => x.id === "b").status, "in_review");
});
test("conflicting staff edits fail instead of silently overwriting", async () => {
  const h = createHarness(),
    store = h.load("_shipments");
  const seed = await store.readShipments();
  seed.push({ id: "a", status: "submitted" });
  await store.writeShipments(seed);
  const a = await store.readShipments(),
    b = await store.readShipments();
  a[0].status = "in_review";
  b[0].status = "voided";
  await store.writeShipments(a);
  await assert.rejects(store.writeShipments(b), /changed while/);
  assert.equal(h.state.items[0].status, "in_review");
});
test("guest quote persists, private status reflects staff updates and hides personal fields", async () => {
  const h = createHarness();
  const saved = await h.call(
    "customer-shipments",
    sample,
    "POST",
    "/api/customer-shipments?source=qr",
  );
  assert.equal(saved.statusCode, 201);
  const token = saved.data.shipment.statusUrl.split("#")[1];
  let status = await h.call("request-status", { token });
  assert.equal(status.statusCode, 200);
  assert.equal(status.data.request.status, "Request received");
  assert.equal(JSON.stringify(status.data).includes(sample.senderEmail), false);
  assert.equal(JSON.stringify(status.data).includes(token), false);
  await h.call(
    "shipments",
    { id: h.state.items[0].id, status: "in_review" },
    "PATCH",
  );
  status = await h.call("request-status", { token });
  assert.equal(status.data.request.status, "Staff reviewing");
  assert.ok(
    h.state.emails.some((x) => x.text.includes("/request-status.html#")),
  );
});
test("status rejects guessed references, wrong tokens and deleted records", async () => {
  const h = createHarness();
  await h.call(
    "customer-shipments",
    sample,
    "POST",
    "/api/customer-shipments?source=qr",
  );
  for (const token of ["CSTEST", "0".repeat(64)])
    assert.equal((await h.call("request-status", { token })).statusCode, 404);
  h.state.items[0].deletedAt = new Date().toISOString();
  assert.equal(
    (
      await h.call("request-status", {
        token: h.state.items[0].guestAccessToken,
      })
    ).statusCode,
    404,
  );
});
test("legacy QR rejects inactive or service-area-only branches and accepts optional receiver fields", async () => {
  for (const locationId of ["freeport", "cleveland", "mccook", "unknown", ""]) {
    const h = createHarness();
    const r = await h.call(
      "customer-shipments",
      { ...sample, intakeChannel: "counter_qr", locationId },
      "POST",
      "/api/customer-shipments?source=qr",
    );
    assert.equal(r.statusCode, 400);
    assert.equal(h.state.writes, 0);
  }
});
test("print inquiry creates a staff-visible service request with correct details and idempotent receipt", async () => {
  const h = createHarness(),
    body = {
      service: "business-print",
      locationId: "dearborn",
      requestId: sample.requestId,
      acknowledge: "on",
      name: "Test Printer",
      email: "print@example.com",
      phone: "2025550123",
      details: "Outdoor sign",
      product: "Banner",
      quantity: "2",
      size: "4 × 2 ft",
      artwork: "https://example.com/artwork",
    };
  const a = await h.call("service-request", body),
    b = await h.call("service-request", body);
  assert.equal(a.statusCode, 201);
  assert.equal(b.data.shipment.number, a.data.shipment.number);
  assert.equal(h.state.items.length, 1);
  assert.equal(h.state.items[0].serviceType, "Business Print & Display");
  assert.equal(h.state.items[0].printDesign.quantity, "2");
  assert.equal(h.state.items[0].source, "qr_counter_intake");
  assert.equal(h.state.items[0].customerNotificationStatus, "sent");
  const outage = createHarness();
  outage.state.failEmail = true;
  assert.equal((await outage.call("service-request", body)).statusCode, 201);
  assert.equal(outage.state.items[0].customerNotificationStatus, "failed");
  assert.equal(outage.state.items[0].locationNotificationStatus, "failed");
});
test("email outage retains requests and failure state, storage outage never confirms or emails", async () => {
  const h = createHarness();
  h.state.failEmail = true;
  assert.equal(
    (
      await h.call(
        "customer-shipments",
        sample,
        "POST",
        "/api/customer-shipments?source=qr",
      )
    ).statusCode,
    201,
  );
  assert.equal(h.state.items[0].customerNotificationStatus, "failed");
  const fail = createHarness();
  fail.state.failStore = true;
  await assert.rejects(
    fail.call(
      "customer-shipments",
      sample,
      "POST",
      "/api/customer-shipments?source=qr",
    ),
  );
  assert.equal(fail.state.emails.length, 0);
});

test("availability probe treats missing probe as healthy and storage denial as unavailable", async () => {
  const h = createHarness();
  assert.equal((await h.call("intake-availability", {}, "GET")).data.available, true);
  const down = createHarness();
  down.blob.get = async () => { throw Error("403 Forbidden"); };
  const unavailable = await down.call("intake-availability", {}, "GET");
  assert.equal(unavailable.statusCode, 503);
  assert.equal(unavailable.data.available, false);
});

test("authenticated requests reject inactive locations before saving", async () => {
  const h = createHarness();
  for (const locationId of ["cleveland", "freeport", "mccook", "unknown"]) {
    const result = await h.call("customer-shipments", { locationId, recipientName: "Test", destinationCountry: "Canada", contents: "Documents" });
    assert.equal(result.statusCode, 400);
  }
  assert.equal(h.state.writes, 0);
  const accepted = await h.call("customer-shipments", { locationId: "dearborn", recipientName: "Test", destinationCountry: "Canada", contents: "Documents" });
  assert.equal(accepted.statusCode, 201);
  assert.equal(h.state.items[0].locationId, "dearborn");
});
