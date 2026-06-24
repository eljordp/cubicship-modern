const {
  clean,
  json,
  publicCustomer,
  readBody,
  requireCustomer,
} = require("./_customer-auth");
const { get } = require("@vercel/blob");
const {
  makeGenericNumber,
  publicShipment,
  readShipments,
  sortNewestFirst,
  writeShipments,
} = require("./_shipments");
const { sendEmail } = require("./_email");
const { findLocation } = require("./_locations");
const supabaseCustomers = require("./_supabase-customer-store");
const { consumeRateLimit, sendRateLimited } = require("./_rate-limit");

const DEFAULT_BRANCH_PROOF_PIN = "CubicBranch2026";
const BRANCH_ACTIONS = new Set(["list", "start", "copied_to_cra", "complete", "issue", "note"]);

function safeFilename(value) {
  return clean(value || "label.pdf")
    .replace(/[^a-z0-9._-]+/gi, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 90) || "label.pdf";
}

async function streamToBuffer(stream) {
  const chunks = [];
  const reader = stream.getReader();
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(Buffer.from(value));
  }
  return Buffer.concat(chunks);
}

function qrPersonFrom(body, prefix) {
  return {
    name: clean(body[`${prefix}Name`]),
    company: clean(body[`${prefix}Company`]),
    phone: clean(body[`${prefix}Phone`]),
    email: clean(body[`${prefix}Email`]),
    address1: clean(body[`${prefix}Address1`]),
    address2: clean(body[`${prefix}Address2`]),
    city: clean(body[`${prefix}City`]),
    state: clean(body[`${prefix}State`]),
    postal: clean(body[`${prefix}Postal`]),
    country: clean(body[`${prefix}Country`]),
  };
}

function qrAddressLine(person) {
  return [
    person.address1,
    person.address2,
    [person.city, person.state, person.postal].filter(Boolean).join(", "),
    person.country,
  ].filter(Boolean).join("\n");
}

function qrLine(label, value) {
  return `${label}: ${value || "Not provided"}`;
}

function branchPinEnvKey(locationId) {
  return `BRANCH_PIN_${clean(locationId).replace(/[^a-z0-9]+/gi, "_").toUpperCase()}`;
}

function branchRequestUrl(location) {
  return `https://cubicship.com/branch-intake.html?location=${encodeURIComponent(location.id)}`;
}

function qrBranchEmail(location) {
  return clean(location.branchEmail) || clean(location.email);
}

function expectedBranchPin(locationId) {
  return clean(process.env[branchPinEnvKey(locationId)])
    || clean(process.env.BRANCH_INTAKE_PIN)
    || (process.env.VERCEL === "1" ? "" : DEFAULT_BRANCH_PROOF_PIN);
}

function branchProofPinActive(locationId) {
  return !clean(process.env[branchPinEnvKey(locationId)])
    && !clean(process.env.BRANCH_INTAKE_PIN)
    && process.env.VERCEL !== "1";
}

function branchPinIsValid(locationId, pin) {
  const expected = expectedBranchPin(locationId);
  return Boolean(expected && clean(pin) && clean(pin) === expected);
}

function isQrCounterIntake(shipment) {
  return shipment.source === "qr_counter_intake" || shipment.intakeChannel === "counter_qr";
}

function visibleBranchShipment(shipment) {
  const item = publicShipment(shipment);
  return {
    ...item,
    auditLog: Array.isArray(item.auditLog) ? item.auditLog.slice(-6) : [],
  };
}

function appendBranchStaffNote(shipment, note, by) {
  const cleaned = clean(note);
  if (!cleaned) return false;
  const nowLabel = new Date().toISOString().slice(0, 16).replace("T", " ");
  shipment.staffNotes = [clean(shipment.staffNotes), `${nowLabel} ${by}: ${cleaned}`].filter(Boolean).join("\n");
  return true;
}

function addBranchAudit(shipment, location, action, message) {
  const now = new Date().toISOString();
  shipment.auditLog = Array.isArray(shipment.auditLog) ? shipment.auditLog : [];
  shipment.auditLog.push({
    at: now,
    by: `branch-pin:${location.id}`,
    action,
    message,
  });
  shipment.auditLog = shipment.auditLog.slice(-40);
}

function applyBranchAction(shipment, location, action, body) {
  const now = new Date().toISOString();
  shipment.branchIntake = shipment.branchIntake || {};
  shipment.staffWorkflow = shipment.staffWorkflow || {};

  if (action === "start") {
    shipment.status = "in_review";
    shipment.branchIntake.startedAt = shipment.branchIntake.startedAt || now;
    shipment.staffWorkflow.nextAction = "Copy sender and receiver into CRA, then confirm package, value, service, and label at the counter.";
    addBranchAudit(shipment, location, "branch_intake_started", "Branch opened the QR intake and started CRA copy-paste.");
  }

  if (action === "copied_to_cra") {
    shipment.status = "in_review";
    shipment.branchIntake.copiedToCraAt = now;
    shipment.staffWorkflow.nextAction = "CRA entry started. Confirm package type, dimensions, value, service, payment, and label with the customer.";
    addBranchAudit(shipment, location, "branch_intake_copied_to_cra", "Sender and receiver details were copied into CRA.");
  }

  if (action === "complete") {
    shipment.status = "completed";
    shipment.branchIntake.completedAt = now;
    shipment.staffWorkflow.nextAction = "Counter intake completed.";
    addBranchAudit(shipment, location, "branch_intake_completed", "Branch marked the QR intake completed.");
  }

  if (action === "issue") {
    shipment.status = "issue";
    shipment.branchIntake.issueAt = now;
    shipment.staffWorkflow.nextAction = "Review issue note and resolve with customer or manager.";
    addBranchAudit(shipment, location, "branch_intake_issue", "Branch marked the QR intake as needing review.");
  }

  const noteAdded = appendBranchStaffNote(shipment, body.appendStaffNote || body.note, location.name);
  if (noteAdded) addBranchAudit(shipment, location, "branch_intake_note", "Branch added a note after submission.");

  shipment.updatedAt = now;
}

async function branchIntakesHandler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return json(res, 405, { ok: false, error: "Use POST for branch intake access." });
  }

  let body = {};
  try {
    body = await readBody(req);
  } catch (error) {
    return json(res, 400, { ok: false, error: "Request body must be valid JSON." });
  }

  const location = findLocation(body.locationId || body.location || body.branch);
  const action = clean(body.action || "list");
  if (!BRANCH_ACTIONS.has(action)) return json(res, 400, { ok: false, error: "Branch intake action is not valid." });

  const pinLimit = consumeRateLimit(req, {
    scope: "branch-intake-pin",
    identity: location.id,
    limit: 20,
    windowMs: 15 * 60 * 1000,
  });
  if (!pinLimit.allowed) {
    return sendRateLimited(res, pinLimit, "Too many branch PIN attempts. Wait a few minutes and try again.");
  }

  if (!branchPinIsValid(location.id, body.pin)) return json(res, 403, { ok: false, error: "Branch PIN is not valid or is not configured for this location." });

  const shipments = await readShipments();
  const scopedShipments = sortNewestFirst(shipments).filter((shipment) => (
    !shipment.deletedAt
    && isQrCounterIntake(shipment)
    && (shipment.locationId || "bridgeview") === location.id
  ));

  if (action === "list") {
    return json(res, 200, {
      ok: true,
      location,
      proofPinActive: branchProofPinActive(location.id),
      intakes: scopedShipments.slice(0, 80).map(visibleBranchShipment),
    });
  }

  const id = clean(body.id);
  const shipment = shipments.find((item) => item.id === id);
  if (!shipment || shipment.deletedAt || !isQrCounterIntake(shipment) || (shipment.locationId || "bridgeview") !== location.id) {
    return json(res, 404, { ok: false, error: "This branch intake was not found for the selected location." });
  }

  applyBranchAction(shipment, location, action, body);
  await writeShipments(shipments);

  const refreshed = sortNewestFirst(shipments).filter((item) => (
    !item.deletedAt
    && isQrCounterIntake(item)
    && (item.locationId || "bridgeview") === location.id
  ));

  return json(res, 200, {
    ok: true,
    location,
    proofPinActive: branchProofPinActive(location.id),
    shipment: visibleBranchShipment(shipment),
    intakes: refreshed.slice(0, 80).map(visibleBranchShipment),
  });
}

function qrStaffCopyBlock(shipment) {
  const sender = shipment.sender || {};
  const receiver = shipment.receiver || {};
  return [
    qrLine("CubicShip Order", shipment.number),
    qrLine("Location", shipment.locationName),
    qrLine("Intake Type", "Walk-in counter address intake"),
    "",
    "SHIPPER / SENDER",
    qrLine("Name", sender.name),
    qrLine("Company", sender.company),
    qrLine("Phone", sender.phone),
    qrLine("Email", sender.email),
    qrLine("Address", qrAddressLine(sender)),
    "",
    "RECEIVER",
    qrLine("Name", receiver.name),
    qrLine("Company", receiver.company),
    qrLine("Phone", receiver.phone),
    qrLine("Email", receiver.email),
    qrLine("Address", qrAddressLine(receiver)),
    "",
    "STAFF COMPLETES AT COUNTER",
    "Copy sender and receiver into CRA, then confirm package type, dimensions, declared value, service, payment, and label with the walk-in customer.",
  ].join("\n");
}

async function createQrShipment(req, res) {
  let body = {};
  try {
    body = await readBody(req);
  } catch (error) {
    return json(res, 400, { ok: false, error: "Request body must be valid JSON." });
  }

  if (clean(body.companyWebsite)) {
    return json(res, 400, { ok: false, error: "Request could not be submitted." });
  }

  const sender = qrPersonFrom(body, "sender");
  const receiver = qrPersonFrom(body, "receiver");
  const shipmentType = clean(body.shipmentType);
  const contents = clean(body.contents);
  const pieces = clean(body.pieces);

  if (!sender.country) return json(res, 400, { ok: false, error: "Shipper country is required." });
  if (!sender.name) return json(res, 400, { ok: false, error: "Shipper name is required." });
  if (!sender.address1) return json(res, 400, { ok: false, error: "Shipper street address is required." });
  if (!sender.city) return json(res, 400, { ok: false, error: "Shipper city is required." });
  if (!sender.postal) return json(res, 400, { ok: false, error: "Shipper ZIP/postal code is required." });
  if (!sender.phone) return json(res, 400, { ok: false, error: "Shipper phone is required." });
  if (!sender.email) return json(res, 400, { ok: false, error: "Shipper email is required." });
  if (!receiver.name) return json(res, 400, { ok: false, error: "Receiver name is required." });
  if (!receiver.country) return json(res, 400, { ok: false, error: "Receiver country is required." });
  if (!receiver.address1) return json(res, 400, { ok: false, error: "Receiver street address is required." });
  if (!receiver.city) return json(res, 400, { ok: false, error: "Receiver city is required." });
  if (!receiver.postal) return json(res, 400, { ok: false, error: "Receiver ZIP/postal code is required." });
  if (!receiver.phone) return json(res, 400, { ok: false, error: "Receiver phone is required." });
  if (!receiver.email) return json(res, 400, { ok: false, error: "Receiver email is required." });
  const shipments = await readShipments();
  const now = new Date().toISOString();
  const location = findLocation(body.locationId);
  const branchEmail = qrBranchEmail(location);
  const branchRequestLink = branchRequestUrl(location);
  const requestedServiceLevel = clean(body.requestedServiceLevel);
  const shipment = {
    id: `ship_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
    number: makeGenericNumber(shipments),
    status: "submitted",
    customerId: `qr_${Date.now().toString(36)}`,
    customerName: sender.name,
    customerEmail: sender.email || "counter-intake@cubicship.com",
    customerPhone: sender.phone,
    locationId: location.id,
    locationName: location.name,
    locationEmail: branchEmail,
    serviceType: "Counter Address Intake",
    recipientName: receiver.name,
    destinationCountry: receiver.country,
    destinationCity: receiver.city,
    destinationPostal: receiver.postal,
    pieces,
    weight: clean(body.weight),
    dimensions: clean(body.dimensions),
    contents,
    declaredValue: clean(body.declaredValue),
    shipmentValueProtection: clean(body.shipmentValueProtection),
    notes: clean(body.notes),
    source: "qr_counter_intake",
    intakeChannel: "counter_qr",
    intakeSubmittedAt: now,
    sender,
    receiver,
    shipmentType,
    requestedServiceLevel,
    readyDate: clean(body.readyDate),
    packageDescription: clean(body.packageDescription),
    estimate: {
      status: "pending_rates",
      label: "Counter continuation pending",
      amount: "",
      currency: "USD",
      message: "Customer submitted sender and receiver details from the in-store QR code. Staff will measure the package, confirm value/service, and create the label in CRA.",
    },
    payment: {
      status: "not_ready",
      amount: "",
      method: "counter",
      notes: "",
      updatedAt: null,
      paidAt: null,
      paidBy: "",
    },
    staffWorkflow: {
      nextAction: "Copy sender/receiver into CRA, then confirm package, value, service, and label with the walk-in customer",
      priority: "normal",
      assignedTo: "",
      checklist: ["copy_sender_receiver", "confirm_package", "confirm_value_service", "create_label_in_cra"],
    },
    virtualNotary: null,
    labelReference: "",
    carrierTracking: "",
    labelPdf: null,
    trackingReadyNotifiedAt: null,
    locationNotifiedAt: null,
    staffNotes: "",
    createdAt: now,
    updatedAt: now,
    verifiedAt: null,
    verifiedBy: "",
    auditLog: [
      {
        at: now,
        by: sender.email || sender.phone || "qr-counter-intake",
        action: "qr_intake_created",
        message: "Walk-in customer submitted sender and receiver details from the QR counter form.",
      },
    ],
  };

  shipments.push(shipment);
  const notification = await sendEmail({
    to: branchEmail,
    subject: `New QR request ${shipment.number} for ${location.name}`,
    text: `A walk-in customer submitted sender and receiver details from the CubicShip QR counter form.

${qrStaffCopyBlock(shipment)}

Open this branch's QR Requests screen:
${branchRequestLink}

Branch PIN required. This request also stays visible there after the email is sent.`,
  });

  if (notification.ok) {
    shipment.locationNotifiedAt = now;
    shipment.locationNotificationId = notification.id || null;
  } else if (notification.skipped) {
    shipment.locationNotificationStatus = "email_not_configured";
  } else {
    shipment.locationNotificationStatus = "failed";
    shipment.locationNotificationError = notification.error || "Notification failed.";
  }

  await writeShipments(shipments);
  return json(res, 201, { ok: true, shipment: publicShipment(shipment), copyText: qrStaffCopyBlock(shipment) });
}

module.exports = async function handler(req, res) {
  const url = new URL(req.url, `https://${req.headers.host || "cubicship.com"}`);
  if (req.method === "POST" && url.searchParams.get("source") === "qr") {
    return createQrShipment(req, res);
  }
  if (url.searchParams.get("source") === "branch-intakes") {
    return branchIntakesHandler(req, res);
  }

  const supabaseCustomer = await supabaseCustomers.maybeRequireCustomer(req, res);
  if (supabaseCustomer === false) return;
  const customer = supabaseCustomer || await requireCustomer(req, res);
  if (!customer) return;

  if (req.method === "GET") {
    const labelId = clean(url.searchParams.get("label"));
    const shipments = await readShipments();
    if (labelId) {
      const shipment = shipments.find((item) => item.id === labelId && item.customerId === customer.id);
      if (!shipment || !shipment.labelPdf?.pathname) return json(res, 404, { ok: false, error: "Label PDF was not found." });
      const blob = await get(shipment.labelPdf.pathname, { access: "private", useCache: false });
      if (!blob || blob.statusCode !== 200 || !blob.stream) return json(res, 404, { ok: false, error: "Label PDF was not found." });
      const buffer = await streamToBuffer(blob.stream);
      res.statusCode = 200;
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `inline; filename="${safeFilename(shipment.labelPdf.filename)}"`);
      res.end(buffer);
      return;
    }

    const mine = shipments.filter((shipment) => shipment.customerId === customer.id);
    return json(res, 200, {
      ok: true,
      customer: publicCustomer(customer),
      shipments: sortNewestFirst(mine).map(publicShipment),
    });
  }

  if (req.method === "POST") {
    let body = {};
    try {
      body = await readBody(req);
    } catch (error) {
      return json(res, 400, { ok: false, error: "Request body must be valid JSON." });
    }

    const serviceType = clean(body.serviceType || "DHL Label");
    const recipientName = clean(body.recipientName);
    const destinationCountry = clean(body.destinationCountry);
    const contents = clean(body.contents);
    const pieces = clean(body.pieces || "1");

    if (!recipientName) return json(res, 400, { ok: false, error: "Contact or recipient name is required." });
    if (!destinationCountry) return json(res, 400, { ok: false, error: "Destination, service area, or request category is required." });
    if (!contents) return json(res, 400, { ok: false, error: "Order details are required." });

    const shipments = await readShipments();
    const now = new Date().toISOString();
    const location = findLocation(body.locationId);
    const isShippingEstimate = serviceType === "DHL Label" || serviceType === "Freight / Cargo";
    const isBusinessPrint = serviceType === "Business Print & Display";
    const isPrintRequest = serviceType === "Printing" || isBusinessPrint;
    const estimate = {
      status: "pending_rates",
      label: isShippingEstimate ? "Estimated price pending" : (isPrintRequest ? "Print quote pending" : "Service review pending"),
      amount: "",
      currency: "USD",
      message: isShippingEstimate
        ? "Cubic Ship will calculate the estimated price once the area, carrier, weight, dimensions, and current rate table are confirmed."
        : (isPrintRequest
          ? "Cubic Ship will review the product, shape, size, quantity, material, quality, artwork, and design needs before confirming availability and quote."
          : "Cubic Ship staff will review the request details and confirm the next step, timing, and price if needed."),
    };
    const printDesign = isPrintRequest ? {
      designRoute: clean(body.designRoute),
      productType: clean(body.printProductType),
      shape: clean(body.printShape),
      size: clean(body.printSize),
      quantity: clean(body.printQuantity),
      quality: clean(body.printQuality),
      optionOrStyle: clean(body.printTemplateStyle),
      artworkSource: clean(body.artworkSource),
      designHelpNotes: clean(body.designHelpNotes),
      status: "quote_requested",
    } : null;
    const virtualNotary = serviceType === "Virtual Notary" ? {
      documentType: clean(body.notaryDocumentType || body.weight),
      preferredAppointment: clean(body.notaryAppointment || body.destinationCity),
      signerEmail: clean(body.notarySignerEmail || customer.email),
      signerCount: clean(body.notarySignerCount || body.pieces || "1"),
      identityReady: clean(body.notaryIdentityReady || ""),
      status: "request_received",
      staffNotes: "",
      appointmentConfirmedAt: "",
    } : null;
    const shipment = {
      id: `ship_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
      number: makeGenericNumber(shipments),
      status: "submitted",
      customerId: customer.id,
      customerName: customer.name,
      customerEmail: customer.email,
      customerPhone: clean(body.customerPhone || customer.phone),
      locationId: location.id,
      locationName: location.name,
      locationEmail: location.email,
      serviceType,
      recipientName,
      destinationCountry,
      destinationCity: clean(body.destinationCity),
      destinationPostal: clean(body.destinationPostal),
      pieces,
      weight: clean(body.weight),
      dimensions: clean(body.dimensions),
      contents,
      declaredValue: clean(body.declaredValue),
      notes: clean(body.notes),
      estimate,
      payment: {
        status: "not_ready",
        amount: "",
        method: "counter",
        notes: "",
        updatedAt: null,
        paidAt: null,
        paidBy: "",
      },
      staffWorkflow: {
        nextAction: serviceType === "Virtual Notary"
          ? "Review notary request"
          : (isPrintRequest ? "Review print quote, product details, and design path" : "Review customer order"),
        priority: "normal",
        assignedTo: "",
        checklist: [],
      },
      virtualNotary,
      printDesign,
      labelReference: "",
      carrierTracking: "",
      labelPdf: null,
      trackingReadyNotifiedAt: null,
      locationNotifiedAt: null,
      staffNotes: "",
      createdAt: now,
      updatedAt: now,
      verifiedAt: null,
      verifiedBy: "",
      auditLog: [
        {
          at: now,
          by: customer.email,
          action: "order_created",
          message: "Customer created a secured CubicShip service order.",
        },
      ],
    };

    shipments.push(shipment);
    const notification = await sendEmail({
      to: location.email,
      subject: `New Cubic Ship ticket ${shipment.number} needs attention`,
      text: `New customer service order needs attention.

Ticket: ${shipment.number}
Location: ${location.name}
Customer: ${shipment.customerName}
Phone: ${shipment.customerPhone || "Not provided"}
Email: ${shipment.customerEmail}
Service: ${shipment.serviceType}
Destination / service area: ${shipment.destinationCountry}${shipment.destinationCity ? `, ${shipment.destinationCity}` : ""}
Items / pieces: ${shipment.pieces}
Weight / quantity: ${shipment.weight || "Not provided"}
Dimensions / document count: ${shipment.dimensions || "Not provided"}
Order details: ${shipment.contents}
${shipment.printDesign ? `
Design path: ${shipment.printDesign.designRoute || "Not provided"}
Print item: ${shipment.printDesign.productType || "Not provided"}
Shape / cut: ${shipment.printDesign.shape || "Not provided"}
Size: ${shipment.printDesign.size || "Not provided"}
Quantity: ${shipment.printDesign.quantity || "Not provided"}
Material / quality: ${shipment.printDesign.quality || "Not provided"}
Option / style: ${shipment.printDesign.optionOrStyle || "Not provided"}
Artwork / file notes: ${shipment.printDesign.artworkSource || "Not provided"}
Graphic design notes: ${shipment.printDesign.designHelpNotes || "Not provided"}
` : ""}

Open the operator portal to review the ticket:
https://cubicship.com/portal.html`,
    });
    if (notification.ok) {
      shipment.locationNotifiedAt = now;
      shipment.locationNotificationId = notification.id || null;
    } else if (notification.skipped) {
      shipment.locationNotificationStatus = "email_not_configured";
    } else {
      shipment.locationNotificationStatus = "failed";
      shipment.locationNotificationError = notification.error || "Notification failed.";
    }
    await writeShipments(shipments);
    return json(res, 201, { ok: true, shipment: publicShipment(shipment) });
  }

  return json(res, 405, { ok: false, error: "Method not allowed" });
};
