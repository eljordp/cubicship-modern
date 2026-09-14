const { availableLocation } = require("./_locations");
const clean = (value) => String(value || "").trim();

function validateOnlineIntake(body) {
  if (!body || typeof body !== "object" || Array.isArray(body))
    return "Request must be an object.";
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      clean(body.requestId),
    )
  )
    return "Please refresh the form and try again.";
  if (!availableLocation(body.locationId))
    return "Choose an available CubicShip counter.";
  if (!["quote", "dropoff"].includes(body.requestKind))
    return "Choose a quote or a drop-off request.";
  if (!["documents", "package"].includes(body.shipmentType))
    return "Choose documents or a package.";
  if (!["dropoff", "pickup-request"].includes(body.handoff))
    return "Choose how you will get the shipment to us.";
  if (!["unsure", "needed", "packed"].includes(body.packing))
    return "Choose whether you need packing help.";
  if (body.acknowledge !== "on")
    return "Confirm your request details before sending.";
  for (const [key, value] of Object.entries(body)) {
    if (typeof value !== "string") return "Request fields must be text.";
    const limit = key === "notes" ? 3000 : key === "contents" ? 1500 : 240;
    if (value.length > limit) return "One of the request fields is too long.";
  }
  const required = [
    "senderName",
    "senderPhone",
    "senderEmail",
    "senderPostal",
    "receiverCountry",
    "receiverCity",
    "contents",
  ];
  if (body.requestKind === "dropoff")
    required.push(
      "senderCountry",
      "senderAddress1",
      "senderCity",
      "receiverName",
      "receiverAddress1",
      "receiverPhone",
    );
  if (required.some((key) => !clean(body[key])))
    return "Complete the contact, destination and shipment details.";
  for (const key of ["senderEmail", "receiverEmail"]) {
    if (
      clean(body[key]) &&
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean(body[key]))
    )
      return "Enter a valid email address.";
  }
  for (const key of ["senderPhone", "receiverPhone"]) {
    if (clean(body[key]) && clean(body[key]).replace(/\D/g, "").length < 7)
      return "Enter a valid phone number, including the country code where needed.";
  }
  const pieces = Number(body.pieces);
  if (!Number.isInteger(pieces) || pieces < 1 || pieces > 999)
    return "Enter a valid number of pieces.";
  for (const key of ["length", "width", "height"]) {
    if (
      clean(body[key]) &&
      (!Number.isFinite(Number(body[key])) ||
        Number(body[key]) <= 0 ||
        Number(body[key]) > 10000)
    )
      return "Package measurements must be positive numbers.";
  }
  if (
    clean(body.weight) &&
    (!/^\d+(\.\d+)? (lb|kg)$/.test(body.weight) ||
      parseFloat(body.weight) <= 0 ||
      parseFloat(body.weight) > 100000)
  )
    return "Enter a valid weight.";
  return "";
}

function onlineReceipt(shipment) {
  return {
    number: shipment.number,
    status: shipment.status,
    locationId: shipment.locationId,
    locationName: shipment.locationName,
    ...(shipment.guestAccessToken
      ? { statusUrl: "/request-status.html#" + shipment.guestAccessToken }
      : {}),
  };
}
module.exports = { validateOnlineIntake, onlineReceipt };
