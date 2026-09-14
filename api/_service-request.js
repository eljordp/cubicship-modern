const crypto = require("crypto");
const { readBody, json } = require("./_customer-auth");
const {
  readShipments,
  writeShipments,
  makeGenericNumber,
} = require("./_shipments");
const { availableLocation } = require("./_locations");
const { onlineReceipt } = require("./_online-intake");
const { sendEmail } = require("./_email");
const { consumeRateLimit, sendRateLimited } = require("./_rate-limit");
const types = {
  printing: "Printing",
  "business-print": "Business Print & Display",
  other: "Counter Service Inquiry",
};
module.exports = async (req, res) => {
  if (req.method !== "POST")
    return json(res, 405, { ok: false, error: "Method not allowed." });
  const rate = consumeRateLimit(req, {
    scope: "service-request",
    limit: 10,
    windowMs: 15 * 60 * 1000,
  });
  if (!rate.allowed)
    return sendRateLimited(res, rate, "Please wait or call your counter.");
  let b;
  try {
    b = await readBody(req);
  } catch {
    return json(res, 400, { ok: false, error: "Invalid request." });
  }
  if (!b || typeof b !== "object" || Array.isArray(b))
    return json(res, 400, { ok: false, error: "Invalid request." });
  const branch = availableLocation(b.locationId);
  if (
    !branch ||
    !types[b.service] ||
    b.acknowledge !== "on" ||
    b.companyWebsite ||
    !/^[-a-f0-9]{36}$/.test(b.requestId || "")
  )
    return json(res, 400, {
      ok: false,
      error: "Choose an available counter and confirm your request.",
    });
  if (Object.values(b).some((v) => typeof v !== "string" || v.length > 3000))
    return json(res, 400, {
      ok: false,
      error: "Some request details are too long.",
    });
  if (
    !b.name?.trim() ||
    !b.details?.trim() ||
    !/^\S+@\S+\.\S+$/.test(b.email || "") ||
    String(b.phone || "").replace(/\D/g, "").length < 7
  )
    return json(res, 400, {
      ok: false,
      error: "Add your name, valid email, phone and request details.",
    });
  if (b.artwork) {
    try {
      if (!["https:", "http:"].includes(new URL(b.artwork).protocol))
        throw Error();
    } catch {
      return json(res, 400, {
        ok: false,
        error: "Use a complete https:// artwork link or leave it blank.",
      });
    }
  }
  try {
    const items = await readShipments(),
      email = b.email.trim().toLowerCase();
    const existing = items.find(
      (s) => s.onlineRequestId === b.requestId && s.customerEmail === email,
    );
    if (existing)
      return json(res, 200, { ok: true, shipment: onlineReceipt(existing) });
    const now = new Date().toISOString();
    const shipment = {
      id:
        "service_" +
        crypto
          .createHash("sha256")
          .update(b.requestId + email)
          .digest("hex")
          .slice(0, 32),
      number: makeGenericNumber(items),
      guestAccessToken: crypto.randomBytes(32).toString("hex"),
      onlineRequestId: b.requestId,
      customerId: "guest",
      customerName: b.name.trim(),
      customerEmail: email,
      customerPhone: b.phone,
      locationId: branch.id,
      locationName: branch.name,
      locationEmail: branch.email,
      serviceType: types[b.service],
      status: "submitted",
      source: "qr_counter_intake",
      intakeChannel: "online",
      requestKind: "service",
      contents: b.details,
      notes: [
        b.product && "Product: " + b.product,
        b.size && "Size: " + b.size,
        b.quantity && "Quantity: " + b.quantity,
        b.material && "Material / finish: " + b.material,
        b.artwork && "Artwork link: " + b.artwork,
        b.designHelp && "Design help: " + b.designHelp,
        b.deadline && "Deadline: " + b.deadline,
      ]
        .filter(Boolean)
        .join("\n"),
      printDesign:
        b.service !== "other"
          ? {
              productType: b.product || "",
              size: b.size || "",
              quantity: b.quantity || "",
              quality: b.material || "",
              artworkSource: b.artwork || "",
              designHelpNotes: b.designHelp || "",
              status: "quote_requested",
            }
          : null,
      createdAt: now,
      updatedAt: now,
      locationNotificationStatus: "pending",
      customerNotificationStatus: "pending",
      auditLog: [
        {
          at: now,
          action: "service_request_created",
          message: "Customer submitted a service inquiry.",
        },
      ],
    };
    items.push(shipment);
    await writeShipments(items);
    const notifications = await Promise.allSettled([
      sendEmail({
        to: branch.email,
        subject: `New ${types[b.service]} inquiry ${shipment.number}`,
        text: `${shipment.customerName}\n${email}\n${b.phone}\n\n${shipment.contents}\n${shipment.notes}\n\nReview at https://cubicship.com/branch-intake.html?location=${branch.id}`,
      }),
      sendEmail({
        to: email,
        subject: `CubicShip request ${shipment.number} received`,
        text: `Your ${types[b.service]} inquiry is saved for ${branch.name}.\nStaff must confirm availability, price and timing before work begins.\n\nPrivate status link: https://cubicship.com/request-status.html#${shipment.guestAccessToken}\n\nFor urgent requests, call ${branch.phone}.`,
      }),
    ]);
    try {
      const latest = await readShipments();
      const saved = latest.find((item) => item.id === shipment.id);
      if (saved) {
        for (const [index, recipient] of ["location", "customer"].entries()) {
          const result = notifications[index];
          const outcome = result.status === "fulfilled" ? result.value : { ok: false };
          saved[`${recipient}NotificationStatus`] = outcome.ok
            ? "sent"
            : outcome.skipped ? "email_not_configured" : "failed";
          if (outcome.ok) saved[`${recipient}NotifiedAt`] = new Date().toISOString();
        }
        await writeShipments(latest);
      }
    } catch {
      // The saved request remains accepted; pending metadata signals an unresolved delivery.
    }
    return json(res, 201, { ok: true, shipment: onlineReceipt(shipment) });
  } catch (error) {
    return json(res, error.statusCode === 409 ? 409 : 503, {
      ok: false,
      error:
        error.statusCode === 409
          ? "This request changed. Try again to retrieve its confirmation."
          : "We could not confirm your request. Try again or call your counter.",
    });
  }
};
