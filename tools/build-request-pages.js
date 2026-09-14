const fs = require("fs");
const { page } = require("./site-layout");
const field = (id, label, type = "text", required = false) =>
  `<div><label for="${id}">${label}</label><input id="${id}" name="${id}" type="${type}" maxlength="240" ${required ? "required" : ""}></div>`;
fs.writeFileSync(
  "service-request.html",
  page(
    "Request a service",
    "Send a print or counter-service inquiry without an account.",
    `<div class="cs-intro"><div class="cs-kicker">No account needed</div><h1 id="requestTitle">Ask your counter.</h1><p>Staff will confirm availability, price and timing before work starts.</p></div><section class="cs-card cs-narrow" id="serviceCard"><form id="serviceForm"><div class="cs-hp" aria-hidden="true"><label>Website<input name="companyWebsite" tabindex="-1" autocomplete="off"></label></div><div class="cs-grid"><div><label for="service">Service</label><select id="service" name="service"><option value="printing">Printing & paperwork</option><option value="business-print">Business print & display</option><option value="other">Another counter service</option></select></div><div><label for="locationId">Your counter</label><select id="locationId" name="locationId" required><option value="">Choose a counter</option></select></div></div><fieldset id="printFields"><legend>Print specifications (add what you know)</legend><div class="cs-grid">${field("product", "Product or document type")}${field("quantity", "Quantity")}${field("size", "Size or paper format")}${field("material", "Material, color or finish")}${field("artwork", "Artwork link (optional)", "url")}<div><label for="designHelp">Design help</label><select id="designHelp" name="designHelp"><option value="">Choose if needed</option><option>I have artwork ready</option><option>I need design help</option><option>Please advise</option></select></div></div><p class="cs-small">No artwork link? Describe the file below and staff will arrange how to receive it. Do not share private documents through a public link.</p></fieldset><label for="details">What do you need?</label><textarea id="details" name="details" maxlength="3000" required></textarea><div class="cs-grid">${field("deadline", "Requested deadline (optional)", "date")}${field("name", "Your name", "text", true)}${field("email", "Email", "email", true)}${field("phone", "Phone", "tel", true)}</div><p class="cs-small">Your details are used to handle this request. <a href="/privacy.html">Privacy information</a>.</p><label class="cs-check"><input type="checkbox" name="acknowledge" required>I understand staff must confirm the service, price and timing.</label><p id="serviceError" class="cs-error" role="alert" hidden></p><button id="serviceSend" class="cs-btn cs-primary" type="submit">Send inquiry</button></form></section><section class="cs-card cs-narrow" id="serviceReceipt" hidden tabindex="-1"><h2>Request received</h2><p id="serviceCode" class="cs-code"></p><p id="serviceBranch"></p><p>Save your private status link. For urgent requests, call your counter.</p><a id="serviceStatus" class="cs-btn cs-primary">View request status</a><p><a href="/service-request.html">Start another inquiry</a></p></section>`,
    `<script src="/service-request.js" defer></script><script src="/intake-availability.js" defer></script>`,
    true,
  ),
);
fs.writeFileSync(
  "request-status.html",
  page(
    "Request status",
    "View your request using the private link from your confirmation.",
    `<div class="cs-intro"><div class="cs-kicker">CubicShip request</div><h1>Check your request.</h1><p>This is your counter request status. Carrier delivery tracking becomes available after a shipment is created.</p></div><section class="cs-card cs-narrow"><p id="statusMessage" role="status">Open the private link from your confirmation to view a request. Older requests may require a call to the counter.</p><div id="statusDetails" hidden><h2 id="statusLabel"></h2><p id="statusNumber" class="cs-code"></p><dl id="statusFacts"></dl><p id="statusNote"></p><div class="cs-actions"><a id="statusCall" class="cs-btn cs-primary">Call your counter</a><a id="statusTracking" class="cs-btn" hidden>Open carrier tracking</a><button id="statusRefresh" class="cs-btn" type="button">Refresh status</button></div></div><p style="margin-top:20px"><a href="/dhl-locations.html">Find your counter</a> · <a href="/track.html">Carrier tracking</a></p></section>`,
    `<script src="/request-status.js" defer></script>`,
    true,
  ),
);
fs.writeFileSync(
  "account-help.html",
  page(
    "Account help",
    "Reset a password or request a new confirmation email.",
    `<div class="cs-intro"><div class="cs-kicker">Account help</div><h1>Get back into your account.</h1><p>Choose the email you need. You can also <a href="/ship.html">start a shipping request without an account</a>.</p></div><section class="cs-card cs-narrow"><form id="recoveryForm"><label for="recoveryEmail">Account email</label><input id="recoveryEmail" type="email" autocomplete="email" required maxlength="254"><label for="recoveryAction" style="margin-top:18px">How can we help?</label><select id="recoveryAction"><option value="reset">Reset my password</option><option value="resend">Resend confirmation email</option></select><p id="recoveryMessage" role="status" style="margin-top:18px"></p><button class="cs-btn cs-primary" id="recoverySend">Send email</button></form><p style="margin-top:20px"><a href="/profile.html">Back to sign in</a> · <a href="mailto:info@cubicship.com">Contact account support</a></p></section>`,
    `<script src="/account-help.js" defer></script>`,
    true,
  ),
);
fs.writeFileSync(
  "auth/callback.html",
  page(
    "Account link",
    "Verify your account link or request a new one.",
    `<section class="cs-card cs-narrow"><h1 id="callbackTitle">Checking your link.</h1><p id="callbackMessage" role="status">Please wait while we verify the account link.</p><form id="passwordForm" hidden><label for="newPassword">New password (at least 12 characters)</label><input id="newPassword" type="password" autocomplete="new-password" minlength="12" maxlength="128" required><label for="confirmPassword">Confirm new password</label><input id="confirmPassword" type="password" autocomplete="new-password" minlength="12" maxlength="128" required><button id="passwordSend" class="cs-btn cs-primary" style="margin-top:18px">Update password</button></form><div class="cs-actions"><a class="cs-btn" href="/profile.html">Sign in</a><a class="cs-btn" href="/account-help.html">Request a new email</a></div></section>`,
    `<script src="/account-callback.js" defer></script>`,
    true,
  ),
);
