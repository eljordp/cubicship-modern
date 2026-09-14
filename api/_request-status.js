const crypto = require("crypto");
const { readShipments } = require("./_shipments");
const { readBody, json } = require("./_customer-auth");
const { consumeRateLimit, sendRateLimited } = require("./_rate-limit");
const { findLocation } = require("./_locations");
const labels = {
  submitted: "Request received",
  in_review: "Staff reviewing",
  payment_due: "Payment to confirm",
  ready_for_dropoff: "Ready for drop-off",
  dropped_off: "Received at counter",
  completed: "Counter processing completed",
  issue: "Contact your counter",
  voided: "Request cancelled",
};
module.exports = async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Referrer-Policy", "no-referrer");
  if (req.method !== "POST")
    return json(res, 405, {
      ok: false,
      error: "Use your private request-status link.",
    });
  const rate = consumeRateLimit(req, {
    scope: "guest-status",
    limit: 40,
    windowMs: 15 * 60 * 1000,
  });
  if (!rate.allowed)
    return sendRateLimited(res, rate, "Please wait before checking again.");
  let body;
  try {
    body = await readBody(req);
  } catch {
    return json(res, 400, { ok: false, error: "Invalid request." });
  }
  if (
    !body ||
    typeof body.token !== "string" ||
    !/^[a-f0-9]{64}$/.test(body.token)
  )
    return json(res, 404, {
      ok: false,
      error:
        "This private link is invalid. Check the link in your receipt or contact your counter.",
    });
  try {
    const items = await readShipments();
    const shipment = items.find(
      (s) =>
        !s.deletedAt &&
        typeof s.guestAccessToken === "string" &&
        s.guestAccessToken.length === 64 &&
        crypto.timingSafeEqual(
          Buffer.from(s.guestAccessToken),
          Buffer.from(body.token),
        ),
    );
    if (!shipment)
      return json(res, 404, {
        ok: false,
        error:
          "This request is unavailable. Contact your counter with your request reference.",
      });
    const branch = findLocation(shipment.locationId);
    return json(res, 200, {
      ok: true,
      request: {
        number: shipment.number,
        status: labels[shipment.status] || "Contact your counter",
        service: shipment.serviceType,
        createdAt: shipment.createdAt,
        updatedAt: shipment.updatedAt,
        branch: {
          name: branch.name,
          phone: branch.phone,
          tel: branch.tel,
          map: branch.map,
        },
        tracking: shipment.carrierTracking || "",
        handoff: shipment.handoff || "",
        message:
          shipment.status === "completed"
            ? shipment.requestKind === "service"
              ? "Counter processing is complete. Contact your counter to confirm collection or any remaining arrangements."
              : "Counter processing is complete. Check carrier tracking for delivery updates."
            : shipment.status === "issue"
              ? "Please contact your selected counter to discuss this request."
              : "Staff must confirm service, price and any pickup. For urgent deadlines, call your counter.",
      },
    });
  } catch {
    return json(res, 503, {
      ok: false,
      error:
        "Status is temporarily unavailable. Please try again or contact your counter.",
    });
  }
};
