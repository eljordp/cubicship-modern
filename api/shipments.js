const {
  clean,
  json,
  readBody,
  requireUser,
} = require("./_portal-auth");
const { get, put } = require("@vercel/blob");
const {
  STATUSES,
  publicShipment,
  readShipments,
  sortNewestFirst,
  writeShipments,
} = require("./_shipments");
const { sendEmail } = require("./_email");

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

async function sendLabelReadyEmail(shipment) {
  return sendEmail({
    to: shipment.customerEmail,
    subject: `Cubic Ship label uploaded for ticket ${shipment.number}`,
    text: `Your Cubic Ship label is ready.

Ticket: ${shipment.number}
Tracking: ${shipment.carrierTracking || "Tracking not recorded yet"}
Location: ${shipment.locationName || "Cubic Ship"}

Log in to your Cubic Ship Business Dashboard to download or print the label:
https://cubicship.com/profile.html

If anything changed, reply to this email or call Cubic Ship.`,
  });
}

async function sendCustomerUpdateEmail(shipment, user, reason = "status_update") {
  const paymentLine = shipment.payment?.status === "due"
    ? `\nPayment due: ${shipment.payment.amount || "Amount pending"}${shipment.payment.notes ? `\nPayment notes: ${shipment.payment.notes}` : ""}`
    : shipment.payment?.status === "paid"
      ? "\nPayment status: Paid"
      : "";
  const notaryLine = shipment.virtualNotary
    ? `\nVirtual notary status: ${shipment.virtualNotary.status || "request received"}${shipment.virtualNotary.appointmentConfirmedAt ? `\nAppointment: ${shipment.virtualNotary.appointmentConfirmedAt}` : ""}`
    : "";
  return sendEmail({
    to: shipment.customerEmail,
    subject: `Cubic Ship update for ticket ${shipment.number}`,
    text: `Your Cubic Ship service order has an update.

Ticket: ${shipment.number}
Service: ${shipment.serviceType}
Status: ${shipment.status || "in review"}
Location: ${shipment.locationName || "Cubic Ship"}${paymentLine}${notaryLine}
Tracking / reference: ${shipment.carrierTracking || shipment.labelReference || "Pending"}

Staff notes:
${shipment.staffNotes || "Cubic Ship is reviewing your order."}

Log in to your Cubic Ship Business Dashboard:
https://cubicship.com/profile.html

Updated by: ${user.name || user.email}
Reason: ${reason}`,
  });
}

function canSeeShipment(user, shipment) {
  if (user.role === "owner") return true;
  const assignedLocation = user.locationId || "bridgeview";
  return !shipment.locationId || shipment.locationId === assignedLocation;
}

function matchesQuery(shipment, query) {
  if (!query) return true;
  const haystack = [
    shipment.number,
    shipment.customerName,
    shipment.customerEmail,
    shipment.customerPhone,
    shipment.source,
    shipment.sender?.name,
    shipment.sender?.company,
    shipment.sender?.phone,
    shipment.sender?.email,
    shipment.sender?.address1,
    shipment.receiver?.name,
    shipment.receiver?.company,
    shipment.receiver?.phone,
    shipment.receiver?.email,
    shipment.receiver?.address1,
    shipment.recipientName,
    shipment.destinationCountry,
    shipment.destinationCity,
    shipment.carrierTracking,
    shipment.labelReference,
  ].join(" ").toLowerCase();
  return haystack.includes(query.toLowerCase());
}

module.exports = async function handler(req, res) {
  const user = await requireUser(req, res);
  if (!user) return;

  if (req.method === "GET") {
    const url = new URL(req.url, `https://${req.headers.host || "cubicship.com"}`);
    const labelId = clean(url.searchParams.get("label"));
    if (labelId) {
      const shipments = await readShipments(user);
      const shipment = shipments.find((item) => item.id === labelId);
      if (!shipment || !shipment.labelPdf?.pathname) return json(res, 404, { ok: false, error: "Label PDF was not found." });
      if (!canSeeShipment(user, shipment)) return json(res, 403, { ok: false, error: "This label belongs to another location." });
      const blob = await get(shipment.labelPdf.pathname, { access: "private", useCache: false });
      if (!blob || blob.statusCode !== 200 || !blob.stream) return json(res, 404, { ok: false, error: "Label PDF was not found." });
      const buffer = await streamToBuffer(blob.stream);
      res.statusCode = 200;
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `inline; filename="${safeFilename(shipment.labelPdf.filename)}"`);
      res.end(buffer);
      return;
    }

    const query = clean(url.searchParams.get("q"));
    const includeDeleted = user.role === "owner" && url.searchParams.get("includeDeleted") === "1";
    const shipments = await readShipments(user);
    const visibleShipments = shipments.filter((shipment) => includeDeleted || !shipment.deletedAt);
    return json(res, 200, {
      ok: true,
      shipments: sortNewestFirst(visibleShipments).filter((shipment) => canSeeShipment(user, shipment) && matchesQuery(shipment, query)).map(publicShipment),
    });
  }

  if (req.method === "PATCH") {
    let body = {};
    try {
      body = await readBody(req);
    } catch (error) {
      return json(res, 400, { ok: false, error: "Request body must be valid JSON." });
    }

    const id = clean(body.id);
    const shipments = await readShipments(user);
    const shipment = shipments.find((item) => item.id === id);
    if (!shipment) return json(res, 404, { ok: false, error: "Shipment was not found." });
    if (!canSeeShipment(user, shipment)) {
      return json(res, 403, { ok: false, error: "This ticket belongs to another location." });
    }

    const hadTracking = Boolean(clean(shipment.carrierTracking));
    const previousStatus = shipment.status;
    if ("labelReference" in body) shipment.labelReference = clean(body.labelReference);
    if ("carrierTracking" in body) shipment.carrierTracking = clean(body.carrierTracking);
    if ("staffNotes" in body) shipment.staffNotes = clean(body.staffNotes);
    if ("appendStaffNote" in body) {
      const note = clean(body.appendStaffNote);
      if (note) {
        const nowLabel = new Date().toISOString().slice(0, 16).replace("T", " ");
        const by = clean(user.name || user.email);
        shipment.staffNotes = [clean(shipment.staffNotes), `${nowLabel} ${by}: ${note}`].filter(Boolean).join("\n");
      }
    }
    if ("nextAction" in body || "priority" in body || "assignedTo" in body) {
      shipment.staffWorkflow = shipment.staffWorkflow || {};
      if ("nextAction" in body) shipment.staffWorkflow.nextAction = clean(body.nextAction);
      if ("priority" in body) shipment.staffWorkflow.priority = clean(body.priority || "normal");
      if ("assignedTo" in body) shipment.staffWorkflow.assignedTo = clean(body.assignedTo);
    }
    if ("paymentAmount" in body || "paymentMethod" in body || "paymentNotes" in body || body.markPaymentDue || body.markPaid) {
      shipment.payment = shipment.payment || {};
      if ("paymentAmount" in body) shipment.payment.amount = clean(body.paymentAmount);
      if ("paymentMethod" in body) shipment.payment.method = clean(body.paymentMethod || "counter");
      if ("paymentNotes" in body) shipment.payment.notes = clean(body.paymentNotes);
      if (body.markPaymentDue) {
        shipment.payment.status = "due";
        shipment.status = "payment_due";
      }
      if (body.markPaid || body.verifyDropoff) {
        shipment.payment.status = "paid";
        shipment.payment.paidAt = shipment.payment.paidAt || new Date().toISOString();
        shipment.payment.paidBy = user.email;
      }
      shipment.payment.updatedAt = new Date().toISOString();
      shipment.payment.updatedBy = user.email;
    }
    if ("notaryStatus" in body || "notaryAppointment" in body || "notaryStaffNotes" in body || "notaryIdentityStatus" in body) {
      shipment.virtualNotary = shipment.virtualNotary || {};
      if ("notaryStatus" in body) shipment.virtualNotary.status = clean(body.notaryStatus || "request_received");
      if ("notaryAppointment" in body) shipment.virtualNotary.appointmentConfirmedAt = clean(body.notaryAppointment);
      if ("notaryStaffNotes" in body) shipment.virtualNotary.staffNotes = clean(body.notaryStaffNotes);
      if ("notaryIdentityStatus" in body) shipment.virtualNotary.identityStatus = clean(body.notaryIdentityStatus);
      if (shipment.serviceType === "Virtual Notary" && shipment.status === "submitted") shipment.status = "in_review";
    }

    if (body.fileData) {
      const filename = safeFilename(body.filename || "label.pdf");
      const rawData = String(body.fileData || "");
      const base64 = rawData.includes(",") ? rawData.split(",").pop() : rawData;
      const buffer = Buffer.from(base64, "base64");
      if (!buffer.length || buffer.slice(0, 4).toString("utf8") !== "%PDF") {
        return json(res, 400, { ok: false, error: "The uploaded file must be a PDF label." });
      }
      if (buffer.length > 4.5 * 1024 * 1024) {
        return json(res, 413, { ok: false, error: "Label PDF must be smaller than 4.5 MB." });
      }
      const now = new Date().toISOString();
      const pathname = `portal/labels/${shipment.id}/${Date.now()}-${filename}`;
      await put(pathname, buffer, {
        access: "private",
        allowOverwrite: true,
        contentType: "application/pdf",
        cacheControlMaxAge: 60,
      });
      shipment.labelPdf = {
        pathname,
        filename,
        size: buffer.length,
        uploadedAt: now,
        uploadedBy: user.email,
      };
      if (shipment.status === "submitted") shipment.status = "ready_for_dropoff";
    }

    const requestedStatus = clean(body.status);
    if (requestedStatus) {
      if (!STATUSES.has(requestedStatus)) return json(res, 400, { ok: false, error: "Shipment status is not valid." });
      if (requestedStatus === "voided") {
        if (user.role !== "owner") return json(res, 403, { ok: false, error: "Owner access is required to void shipments." });
        const reason = clean(body.voidReason || body.deleteReason || body.appendStaffNote || body.staffNotes);
        if (!reason) return json(res, 400, { ok: false, error: "Add a reason before voiding this shipment." });
        shipment.voidedAt = shipment.voidedAt || new Date().toISOString();
        shipment.voidedBy = user.email;
        shipment.voidReason = reason;
      }
      if (!body.markPaymentDue && !body.verifyDropoff) shipment.status = requestedStatus;
    }
    if (shipment.carrierTracking && shipment.status === "submitted") {
      shipment.status = "ready_for_dropoff";
    }

    if (shipment.status !== "voided" && (shipment.carrierTracking || shipment.labelPdf) && !body.markPaymentDue && (!hadTracking || body.notifyCustomer || body.fileData) && !shipment.trackingReadyNotifiedAt) {
      const notification = body.fileData ? await sendLabelReadyEmail(shipment) : await sendEmail({
        to: shipment.customerEmail,
        subject: `Cubic Ship ticket ${shipment.number} is ready for drop-off`,
        text: `Your Cubic Ship ticket is ready for drop-off.

Ticket: ${shipment.number}
Tracking: ${shipment.carrierTracking}
Location: ${shipment.locationName || "Cubic Ship"}

DHL / the carrier system has generated the tracking number on the label. Bring your package to the selected Cubic Ship location and be ready to pay for the label and tracking at the counter.

If anything changed, reply to this email or call Cubic Ship.`,
      });
      if (notification.ok) {
        shipment.trackingReadyNotifiedAt = new Date().toISOString();
        shipment.trackingReadyNotificationId = notification.id || null;
      } else if (notification.skipped) {
        shipment.trackingReadyNotificationStatus = "email_not_configured";
      } else {
        shipment.trackingReadyNotificationStatus = "failed";
        shipment.trackingReadyNotificationError = notification.error || "Notification failed.";
      }
    }

    if (body.verifyDropoff) {
      shipment.status = "dropped_off";
      shipment.verifiedAt = new Date().toISOString();
      shipment.verifiedBy = user.email;
    }

    if (body.notifyCustomer && !body.fileData && (body.markPaymentDue || !(shipment.carrierTracking || shipment.labelPdf))) {
      const notification = await sendCustomerUpdateEmail(shipment, user, body.markPaymentDue ? "payment_due" : "staff_update");
      if (notification.ok) {
        shipment.customerNotifiedAt = new Date().toISOString();
        shipment.customerNotificationId = notification.id || null;
        shipment.customerNotificationStatus = "sent";
      } else if (notification.skipped) {
        shipment.customerNotificationStatus = "email_not_configured";
      } else {
        shipment.customerNotificationStatus = "failed";
        shipment.customerNotificationError = notification.error || "Notification failed.";
      }
    }

    shipment.updatedAt = new Date().toISOString();
    shipment.updatedBy = user.email;
    const statusChanged = previousStatus !== shipment.status;
    shipment.auditLog = Array.isArray(shipment.auditLog) ? shipment.auditLog : [];
    shipment.auditLog.push({
      at: shipment.updatedAt,
      by: user.email,
      action: shipment.status === "voided" && statusChanged ? "shipment_voided" : body.appendStaffNote ? "staff_note_added" : body.verifyDropoff ? "dropoff_confirmed" : body.fileData ? "label_pdf_uploaded" : body.markPaid ? "payment_marked_paid" : body.markPaymentDue ? "payment_due" : body.notifyCustomer ? "customer_notified" : statusChanged ? "status_changed" : "staff_update",
      message: shipment.status === "voided" && statusChanged ? `Owner voided shipment. Reason: ${shipment.voidReason || "No reason recorded."}` : body.appendStaffNote ? "Staff added a timestamped note." : body.verifyDropoff ? "Staff confirmed customer drop-off/payment." : body.fileData ? "Staff uploaded a label PDF for customer download." : body.markPaid ? "Staff marked manual/counter payment paid." : body.markPaymentDue ? "Staff marked manual/counter payment due." : body.notifyCustomer ? "Staff sent a customer update." : statusChanged ? `Staff changed shipment status from ${previousStatus || "blank"} to ${shipment.status}.` : "Staff updated shipment workflow, tracking, or notes.",
      ...(statusChanged ? { previousStatus, nextStatus: shipment.status } : {}),
    });
    await writeShipments(shipments, user);
    return json(res, 200, { ok: true, shipment: publicShipment(shipment) });
  }

  if (req.method === "DELETE") {
    if (user.role !== "owner") return json(res, 403, { ok: false, error: "Owner access is required to delete or void shipments." });
    const url = new URL(req.url, `https://${req.headers.host || "cubicship.com"}`);
    const id = clean(url.searchParams.get("id"));
    const mode = clean(url.searchParams.get("mode")) || "void";
    const reason = clean(url.searchParams.get("reason"));
    if (!id) return json(res, 400, { ok: false, error: "Shipment id is required." });
    if (!reason) return json(res, 400, { ok: false, error: "Add a reason before deleting or voiding this shipment." });
    const shipments = await readShipments(user);
    const shipment = shipments.find((item) => item.id === id);
    if (!shipment) return json(res, 404, { ok: false, error: "Shipment was not found." });
    if (!canSeeShipment(user, shipment)) return json(res, 403, { ok: false, error: "This ticket belongs to another location." });
    const now = new Date().toISOString();
    const previousStatus = shipment.status;
    shipment.status = "voided";
    shipment.voidedAt = shipment.voidedAt || now;
    shipment.voidedBy = user.email;
    shipment.voidReason = reason;
    if (mode === "delete") {
      shipment.deletedAt = now;
      shipment.deletedBy = user.email;
      shipment.deleteReason = reason;
    }
    shipment.updatedAt = now;
    shipment.updatedBy = user.email;
    shipment.auditLog = Array.isArray(shipment.auditLog) ? shipment.auditLog : [];
    shipment.auditLog.push({
      at: now,
      by: user.email,
      action: mode === "delete" ? "shipment_deleted_from_queue" : "shipment_voided",
      message: mode === "delete" ? `Owner deleted shipment from active queue. Reason: ${reason}` : `Owner voided shipment. Reason: ${reason}`,
      previousStatus,
      nextStatus: "voided",
    });
    await writeShipments(shipments, user);
    return json(res, 200, { ok: true, shipment: publicShipment(shipment) });
  }

  return json(res, 405, { ok: false, error: "Method not allowed" });
};
