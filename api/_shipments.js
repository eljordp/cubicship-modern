const crypto = require("crypto");
const { get, put } = require("@vercel/blob");
const { isDemoUser, readDemoList, writeDemoList } = require("./_demo-data");

const SHIPMENTS_PATH = "portal/shipments.json";
const STATUSES = new Set([
  "submitted",
  "in_review",
  "payment_due",
  "ready_for_dropoff",
  "dropped_off",
  "completed",
  "issue",
  "voided",
]);

function clean(value) {
  return String(value || "").trim();
}

function upper(value) {
  return clean(value).toUpperCase();
}

async function streamToText(stream) {
  const chunks = [];
  const reader = stream.getReader();
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(Buffer.from(value));
  }
  return Buffer.concat(chunks).toString("utf8");
}

// Keep the original private path and format; conditional writes avoid a data migration.
// A baseline is attached to each read so updates can be merged without erasing other records.
const snapshots = new WeakMap();
const clone = (value) => JSON.parse(JSON.stringify(value));
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
async function readShipments(user = null) {
  if (isDemoUser(user)) return readDemoList("shipments");
  let result;
  try {
    result = await get(SHIPMENTS_PATH, { access: "private", useCache: false });
  } catch (error) {
    if (!/not found/i.test(String(error.message || ""))) throw error;
  }
  let shipments = [],
    etag = null;
  if (result) {
    if (result.statusCode !== 200 || !result.stream)
      throw new Error("Shipment store could not be read.");
    const data = JSON.parse(await streamToText(result.stream));
    if (!Array.isArray(data.shipments))
      throw new Error("Shipment store format is invalid.");
    shipments = data.shipments;
    etag = result.blob?.etag || result.headers?.get("etag");
    if (!etag)
      throw new Error(
        "Shipment store version is unavailable; no changes were made.",
      );
  }
  snapshots.set(shipments, { original: clone(shipments), etag });
  return shipments;
}
function conflict() {
  const error = new Error(
    "This request changed while you were editing. Refresh and try again.",
  );
  error.statusCode = 409;
  return error;
}
function mergeChanges(original, desired, current) {
  const before = new Map(original.map((x) => [x.id, x]));
  const next = new Map(current.map((x) => [x.id, clone(x)]));
  // Deletion is represented by existing deletedAt fields, never by omitting a record.
  for (const item of desired) {
    const old = before.get(item.id),
      latest = next.get(item.id);
    if (!old) {
      if (latest && !same(latest, item)) throw conflict();
      if (!latest) next.set(item.id, clone(item));
      continue;
    }
    if (same(old, item)) continue;
    if (!latest) throw conflict();
    for (const key of new Set([...Object.keys(old), ...Object.keys(item)])) {
      if (same(old[key], item[key])) continue;
      if (!same(latest[key], old[key]) && !same(latest[key], item[key]))
        throw conflict();
      if (item[key] === undefined) delete latest[key];
      else latest[key] = clone(item[key]);
    }
  }
  return [...next.values()];
}
async function writeShipments(shipments, user = null) {
  if (isDemoUser(user)) return writeDemoList("shipments", shipments);
  const baseline = snapshots.get(shipments);
  if (!baseline)
    throw new Error("Read the current shipment store before updating it.");
  for (let attempt = 0; attempt < 5; attempt++) {
    const current =
      attempt === 0
        ? baseline.current || baseline.original
        : await readShipments();
    const version = attempt === 0 ? baseline.etag : snapshots.get(current).etag;
    const merged = mergeChanges(baseline.original, shipments, current);
    try {
      const result = await put(
        SHIPMENTS_PATH,
        JSON.stringify({ shipments: merged }),
        {
          access: "private",
          addRandomSuffix: false,
          allowOverwrite: Boolean(version),
          ...(version ? { ifMatch: version } : {}),
          contentType: "application/json",
          cacheControlMaxAge: 60,
        },
      );
      snapshots.set(shipments, {
        original: clone(shipments),
        current: clone(merged),
        etag: result.etag,
      });
      return;
    } catch (error) {
      if (
        !/precondition|already exists|etag|condition.*failed/i.test(
          error.name + " " + error.message,
        )
      )
        throw error;
      if (attempt === 4) throw conflict();
    }
  }
}

function makeGenericNumber(existingShipments) {
  const date = new Date();
  const stamp = `${String(date.getFullYear()).slice(2)}${String(date.getMonth() + 1).padStart(2, "0")}${String(date.getDate()).padStart(2, "0")}`;
  const existing = new Set(
    existingShipments.map((shipment) => shipment.number),
  );

  for (let attempt = 0; attempt < 20; attempt += 1) {
    const code = crypto
      .randomBytes(3)
      .toString("hex")
      .slice(0, 4)
      .toUpperCase();
    const number = `CS${stamp}-${code}`;
    if (!existing.has(number)) return number;
  }
  return `CS${stamp}-${Date.now().toString(36).slice(-5).toUpperCase()}`;
}

function publicShipment(shipment) {
  return {
    id: shipment.id,
    number: shipment.number,
    status: shipment.status,
    voidedAt: shipment.voidedAt || null,
    voidedBy: shipment.voidedBy || "",
    voidReason: shipment.voidReason || "",
    deletedAt: shipment.deletedAt || null,
    deletedBy: shipment.deletedBy || "",
    deleteReason: shipment.deleteReason || "",
    customerId: shipment.customerId,
    customerName: shipment.customerName,
    customerEmail: shipment.customerEmail,
    customerPhone: shipment.customerPhone,
    locationId: shipment.locationId || "bridgeview",
    locationName: shipment.locationName || "Cubic Ship Bridgeview",
    locationEmail: shipment.locationEmail || "",
    serviceType: shipment.serviceType,
    recipientName: shipment.recipientName,
    destinationCountry: shipment.destinationCountry,
    destinationCity: shipment.destinationCity,
    destinationPostal: shipment.destinationPostal,
    pieces: shipment.pieces,
    weight: shipment.weight,
    dimensions: shipment.dimensions,
    contents: shipment.contents,
    declaredValue: shipment.declaredValue,
    shipmentValueProtection: shipment.shipmentValueProtection || "",
    notes: shipment.notes,
    estimate: shipment.estimate || {
      status: "pending_rates",
      label: "Estimated price pending",
      amount: "",
      currency: "USD",
      message:
        "Cubic Ship will calculate the estimated price once rates are connected.",
    },
    payment: shipment.payment || {
      status: "not_ready",
      amount: "",
      method: "counter",
      notes: "",
      updatedAt: null,
      paidAt: null,
      paidBy: "",
    },
    staffWorkflow: shipment.staffWorkflow || {
      nextAction: "",
      priority: "normal",
      assignedTo: "",
      checklist: [],
    },
    virtualNotary: shipment.virtualNotary || null,
    printDesign: shipment.printDesign || null,
    labelReference: shipment.labelReference || "",
    carrierTracking: shipment.carrierTracking || "",
    labelPdf: shipment.labelPdf || null,
    trackingReadyNotifiedAt: shipment.trackingReadyNotifiedAt || null,
    trackingReadyNotificationStatus:
      shipment.trackingReadyNotificationStatus || "",
    trackingReadyNotificationError:
      shipment.trackingReadyNotificationError || "",
    customerNotifiedAt: shipment.customerNotifiedAt || null,
    customerNotificationStatus: shipment.customerNotificationStatus || "",
    customerNotificationError: shipment.customerNotificationError || "",
    locationNotifiedAt: shipment.locationNotifiedAt || null,
    locationNotificationStatus: shipment.locationNotificationStatus || "",
    locationNotificationError: shipment.locationNotificationError || "",
    source: shipment.source || "customer_profile",
    intakeChannel: shipment.intakeChannel || "",
    requestKind: shipment.requestKind || "",
    handoff: shipment.handoff || "",
    packing: shipment.packing || "",
    intakeSubmittedAt: shipment.intakeSubmittedAt || null,
    branchIntake: shipment.branchIntake || null,
    sender: shipment.sender || null,
    receiver: shipment.receiver || null,
    shipmentType: shipment.shipmentType || "",
    requestedServiceLevel: shipment.requestedServiceLevel || "",
    readyDate: shipment.readyDate || "",
    packageDescription: shipment.packageDescription || "",
    staffNotes: shipment.staffNotes || "",
    createdAt: shipment.createdAt,
    updatedAt: shipment.updatedAt,
    verifiedAt: shipment.verifiedAt || null,
    verifiedBy: shipment.verifiedBy || "",
    auditLog: Array.isArray(shipment.auditLog)
      ? shipment.auditLog.slice(-12)
      : [],
  };
}

function sortNewestFirst(shipments) {
  return shipments
    .slice()
    .sort((a, b) =>
      String(b.createdAt || "").localeCompare(String(a.createdAt || "")),
    );
}

module.exports = {
  STATUSES,
  clean,
  makeGenericNumber,
  publicShipment,
  readShipments,
  sortNewestFirst,
  upper,
  writeShipments,
};
