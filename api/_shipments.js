const crypto = require("crypto");
const { get, put } = require("@vercel/blob");
const { isDemoUser, readDemoList, writeDemoList } = require("./_demo-data");

const SHIPMENTS_PATH = "portal/shipments.json";
const STATUSES = new Set(["submitted", "in_review", "payment_due", "ready_for_dropoff", "dropped_off", "completed", "issue", "voided"]);

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

async function readShipments(user = null) {
  if (isDemoUser(user)) return readDemoList("shipments");
  try {
    const result = await get(SHIPMENTS_PATH, { access: "private", useCache: false });
    if (!result || result.statusCode !== 200 || !result.stream) return [];
    const data = JSON.parse(await streamToText(result.stream));
    return Array.isArray(data.shipments) ? data.shipments : [];
  } catch (error) {
    if (error && /not found/i.test(String(error.message || ""))) return [];
    throw error;
  }
}

async function writeShipments(shipments, user = null) {
  if (isDemoUser(user)) return writeDemoList("shipments", shipments);
  await put(SHIPMENTS_PATH, JSON.stringify({ shipments }, null, 2), {
    access: "private",
    allowOverwrite: true,
    contentType: "application/json",
    cacheControlMaxAge: 60,
  });
}

function makeGenericNumber(existingShipments) {
  const date = new Date();
  const stamp = `${String(date.getFullYear()).slice(2)}${String(date.getMonth() + 1).padStart(2, "0")}${String(date.getDate()).padStart(2, "0")}`;
  const existing = new Set(existingShipments.map((shipment) => shipment.number));

  for (let attempt = 0; attempt < 20; attempt += 1) {
    const code = crypto.randomBytes(3).toString("hex").slice(0, 4).toUpperCase();
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
      message: "Cubic Ship will calculate the estimated price once rates are connected.",
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
    trackingReadyNotificationStatus: shipment.trackingReadyNotificationStatus || "",
    trackingReadyNotificationError: shipment.trackingReadyNotificationError || "",
    customerNotifiedAt: shipment.customerNotifiedAt || null,
    customerNotificationStatus: shipment.customerNotificationStatus || "",
    customerNotificationError: shipment.customerNotificationError || "",
    locationNotifiedAt: shipment.locationNotifiedAt || null,
    locationNotificationStatus: shipment.locationNotificationStatus || "",
    locationNotificationError: shipment.locationNotificationError || "",
    source: shipment.source || "customer_profile",
    intakeChannel: shipment.intakeChannel || "",
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
    auditLog: Array.isArray(shipment.auditLog) ? shipment.auditLog.slice(-12) : [],
  };
}

function sortNewestFirst(shipments) {
  return shipments.slice().sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")));
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
