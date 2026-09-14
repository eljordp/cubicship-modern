const fs = require("fs"),
  path = require("path");
const { esc, header, footer, page } = require("./site-layout");
const root = path.resolve(__dirname, ".."),
  locations = require("../assets/locations.json");
const write = (file, text) => {
  if(file.endsWith('.html') && !text.includes('name="robots" content="noindex"') && !text.includes('rel="canonical"')) {
    const url='https://cubicship.com/'+file;
    text=text.replace('</head>',`<link rel="canonical" href="${url}"><meta property="og:url" content="${url}"><meta property="og:site_name" content="CubicShip"><meta property="og:image" content="https://cubicship.com/og-image.png"></head>`);
  }
  const branch=locations.find(l=>file==='locations/'+l.slug+'.html');
  if(branch){const schema={"@context":"https://schema.org","@type":"LocalBusiness",name:branch.name,url:'https://cubicship.com/'+file,address:branch.address,telephone:branch.tel||undefined};text=text.replace('</head>','<script type="application/ld+json">'+JSON.stringify(schema)+'</script></head>');}
  fs.writeFileSync(path.join(root,file),text.replace(/[ \t]+$/gm, ""));
};
const intro = (tag, title, text) =>
  `<div class="cs-intro"><div class="cs-kicker">${tag}</div><h1>${title}</h1><p class="cs-lead">${text}</p></div>`;
const btn = (href, label, primary = false) =>
  `<a class="cs-btn ${primary ? "cs-primary" : ""}" href="${href}">${label}</a>`;
const card = (id, title, text, href, label) =>
  `<article class="cs-card" id="${id}"><h2>${title}</h2><p>${text}</p>${btn(href, label)}</article>`;
const services = [
  [
    "shipping",
    "DHL Express shipping",
    "Send international documents and packages with help preparing your shipment. Start without an account.",
    "/ship.html",
    "Start a DHL request",
  ],
  [
    "print",
    "Print, pack & paperwork",
    "Copies, scans, label printing and packing help. Ask your counter about materials and availability.",
    "/print-pack.html",
    "Explore print & pack",
  ],
  [
    "business-print",
    "Business print & display",
    "Request business cards, stickers, banners or signage, with artwork and design help if needed.",
    "/business-signage.html",
    "Explore business printing",
  ],
  [
    "freight-detail",
    "Freight & cargo",
    "Request a quote for larger loads, air freight or ocean shipping. Include dimensions, weight, route and timing.",
    "https://www.cognitoforms.com/CUBICPACKANDSHIP/GetAQuote",
    "Request a freight quote",
  ],
];
write(
  "services.html",
  page(
    "Services",
    "DHL shipping, printing, packing and practical counter support.",
    intro(
      "CubicShip services",
      "What can we help you with?",
      "Start with the service you need. Your chosen counter will confirm availability, price and timing.",
    ) +
      `<div class="cs-grid">${services.map((s) => card(...s)).join("")}</div><section class="cs-card"><h2>Other counter services</h2><p>Ask about <span id="passport">passport photos and document preparation</span>, <span id="dmv">Illinois vehicle paperwork</span>, <span id="payments">bill payment</span>, <span id="stasher">luggage storage</span> and <span id="notary">notary support</span>. Availability varies by location.</p><div class="cs-actions">${btn("/service-request.html?service=other", "Ask about a service")}${btn("/dhl-locations.html", "Find your counter")}</div></section>`,
  ),
);
write(
  "business-services.html",
  page(
    "Business services",
    "Shipping and print support for your business.",
    intro(
      "For your business",
      "Shipping and print help, close by.",
      "Send documents and products, prepare paperwork, or request branded print. Tell us what you need and when you need it.",
    ) +
      `<div class="cs-grid">${card("shipping", "Business shipping", "Use guest intake for a one-off shipment or your account for existing service orders.", "/ship.html", "Start shipping")}${card("printing", "Print & display", "Share your product, quantity, size, artwork and deadline for a tailored quote.", "/business-signage.html", "Choose print services")}</div><section class="cs-card"><h2>Work with your local counter</h2><p>Confirm the services available at your branch before visiting. Existing customers can view their orders in their account.</p><div class="cs-actions">${btn("/dhl-locations.html", "Find a counter", true)}${btn("/profile.html", "Customer account")}</div></section>`,
  ),
);
write(
  "print-pack.html",
  page(
    "Print, pack & paperwork",
    "Get help with printing, documents and preparing a parcel.",
    intro(
      "Print & pack",
      "Get your parcel and paperwork ready.",
      "Ask for copies, scans, label printing or packing help at your selected CubicShip counter.",
    ) +
      `<div class="cs-grid"><section class="cs-card"><h2>Printing & documents</h2><p>Tell us the page count, number of copies, color or black-and-white, paper size and deadline. Bring your file or share an artwork link.</p>${btn("/service-request.html?service=printing", "Start a print inquiry", true)}</section><section class="cs-card"><h2>Boxes & packing help</h2><p>Tell us what you are sending and whether it is fragile or unpacked. Staff will confirm available packing materials and charges.</p>${btn("/ship.html?mode=quote", "Ask about packing & shipping", true)}</section></div><details><summary>Do I need my own printer or box?</summary><p>You can request label printing and packing help. Confirm materials, file access and availability with the counter before visiting.</p></details><details><summary>How much does printing cost?</summary><p>Price depends on quantity, paper, color and finishing. The counter confirms the quote before work starts.</p></details>`,
  ),
);
write(
  "business-signage.html",
  page(
    "Business print & display",
    "Request a quote for business cards, stickers, banners and signage.",
    intro(
      "Business print & display",
      "Bring your business into print.",
      "Request cards, stickers, banners or signs. Your counter will confirm product availability and a quote after reviewing your specifications.",
    ) +
      `<div class="cs-grid"><section class="cs-card"><h2>Tell us what you need</h2><p>Choose a product and share the size, quantity, intended use, material or finish, and deadline. Include an artwork link or ask for design help.</p>${btn("/service-request.html?service=business-print", "Request a print quote", true)}</section><section class="cs-card"><h2>Review before production</h2><p>Staff will confirm availability, price, artwork requirements and turnaround. Ask about a proof and approve the agreed details before production.</p>${btn("/dhl-locations.html", "Find your counter")}</section></div><details><summary>Can you help with the design?</summary><p>Include design help in your inquiry. Staff will confirm what is available and any design charges before work starts.</p></details>`,
  ),
);
const hoursBlock = (l) =>
  `<h3>Store hours</h3>${l.hours?.length ? "<p>" + l.hours.map(esc).join("<br>") + "</p>" : "<p>" + esc(l.hoursNote || "Call to confirm current hours.") + "</p>"}<p class="cs-small"><a href="${esc(l.hoursSource || l.map)}">Google listing</a> · Checked ${esc(l.hoursCheckedAt || "date unavailable")}. Local times; holiday hours may differ.</p>${l.hoursNote && l.hours?.length ? '<p class="cs-small">' + esc(l.hoursNote) + "</p>" : ""}`;
const locCard = (l) =>
  `<article class="cs-card" data-search="${esc([l.city, l.state, l.market, l.address].join(" ").toLowerCase())}">${l.openingSoon ? '<span class="cs-tag">' + esc(l.availabilityLabel || "Opening soon") + "</span>" : ""}<h2>${esc(l.city)}, ${esc(l.state)}</h2><address>${esc(l.address)}</address><p class="cs-small">${l.hours?.length ? esc(l.hours[0]) : esc(l.availabilityLabel || "Call for hours")}</p><div class="cs-actions">${btn("/locations/" + l.slug + ".html", "Location details")}${l.tel ? btn("tel:" + l.tel, "Call") : ""}</div></article>`;
write(
  "dhl-locations.html",
  page(
    "Find a CubicShip counter",
    "Find a DHL Express shipping counter by city, state or ZIP.",
    intro(
      "Locations",
      "Find your counter.",
      "Search by city, state or the ZIP in a branch address. Confirm today’s hours and last DHL collection before traveling.",
    ) +
      `<section aria-label="Find locations"><label for="locationSearch">City, state or ZIP</label><input id="locationSearch" type="search" placeholder="For example: Dearborn, MI or 48126"><p id="locationCount" role="status" class="cs-small">${locations.length} locations</p><div id="emptyLocations" class="cs-notice" hidden>No matching branch. ZIP searches match the listed address, not distance. Try your city or state, or <button type="button" id="clearLocations" class="cs-btn">Show all locations</button>.</div><div class="cs-grid" id="locations">${locations.map(locCard).join("")}</div></section>`,
    `<script src="/locations-search.js" defer></script>`,
  ),
);
for (const l of locations) {
  const active = !l.openingSoon;
  write(
    "locations/" + l.slug + ".html",
    page(
      l.city + ", " + l.state + " DHL shipping",
      "DHL counter information, directions and shipping requests for " +
        l.market,
      intro(
        active
          ? "DHL Express counter"
          : esc(l.availabilityLabel || "Opening soon"),
        esc(l.city) + ", " + esc(l.state),
        active
          ? "Start a DHL request before you visit, or call the counter for help."
          : esc(
              l.hoursNote ||
                "This location is not accepting online requests. Choose an active counter for your shipment.",
            ),
      ) +
        `<div class="cs-grid"><section class="cs-card"><h2>${esc(l.name)}</h2><address>${esc(l.address)}</address><div class="cs-actions">${l.tel ? btn("tel:" + l.tel, "Call " + esc(l.phone), true) : ""}${btn(esc(l.map), "Directions & map")}</div>${hoursBlock(l)}${l.availabilityLabel === "Temporarily closed" ? "" : "<h3>Last DHL collection</h3><p>Call to confirm the DHL collection cutoff. It can be earlier than the store’s closing time.</p>"}</section><section class="cs-card"><h2>${active ? "Start before you visit" : "Find an active counter"}</h2><p>${active ? "Request a quote or prepare your drop-off details. No account needed. Staff confirms item acceptance, packing, price and delivery estimate." : "Online intake is unavailable at this branch. An active online counter can help you start a request now."}</p><div class="cs-actions">${btn(active ? "/ship.html?location=" + l.id : "/dhl-locations.html", active ? "Start DHL request" : "View active counters", true)}${active ? btn("/ship.html?mode=quote&location=" + l.id, "Quote first") : ""}</div></section></div>${active ? `<section class="cs-card"><h2>What to bring</h2><p>Your items, the recipient’s full address and contact details, a description and value of the contents, and your request reference if you started online. Ask the counter about identification and customs documents for your shipment.</p><p class="cs-small">Need printing, packing or another counter service? Availability varies. Confirm with this branch before traveling.</p>${btn("/service-request.html?service=other&location=" + l.id, "Ask this counter about a service")}</section>` : ""}`,
    ),
  );
}
write(
  "quote.html",
  page(
    "Choose a quote",
    "Choose DHL shipping, print or freight quote support.",
    intro(
      "Get a quote",
      "What do you need a price for?",
      "Choose the right request so your details reach the right team.",
    ) +
      `<div class="cs-grid">${card("dhl", "DHL documents & parcels", "Get a staff-reviewed quote without creating an account.", "/ship.html?mode=quote", "DHL quote")}${card("printing", "Print & signage", "Share your product, quantity, size and artwork needs.", "/service-request.html?service=printing", "Print inquiry")}${card("freight", "Freight & cargo", "Air, ocean and larger shipments. Opens our freight form with file upload.", "https://www.cognitoforms.com/CUBICPACKANDSHIP/GetAQuote", "Freight form")}</div>`,
    `<script src="/quote-route.js" defer></script>`,
  ),
);
write(
  "404.html",
  page(
    "Page not found",
    "Find shipping, locations or support.",
    intro(
      "Page not found",
      "Let’s get you back on track.",
      "This address may have changed. Choose one of the links below.",
    ) +
      `<div class="cs-actions">${btn("/ship.html", "Start shipping", true)}${btn("/dhl-locations.html", "Find a counter")}${btn("/track.html", "Track a shipment")}</div>`,
    "",
    true,
  ),
);
write(
  "privacy.html",
  page(
    "Privacy information",
    "How information provided through CubicShip requests is used.",
    intro(
      "Customer information",
      "Your information and your request.",
      "This page describes the data used by the current request service.",
    ) +
      `<section class="cs-card cs-narrow"><h2>Information you provide</h2><p>Shipping requests collect contact details, branch selection and shipment information. Preparing a drop-off also requires sender and receiver address details. Print inquiries collect the specifications and artwork links you choose to provide.</p><h2>How it is used</h2><p>CubicShip uses these details to review your request, contact you, prepare the service and allow authorized staff at the appropriate branch to process it. Staff may need to provide relevant shipment information to the carrier to complete shipping.</p><h2>Service providers</h2><p>The website uses Vercel hosting and storage, account infrastructure where configured, and email delivery services to operate these features. Separate freight forms and carrier tracking pages are operated by the provider shown when you follow the link.</p><h2>Accounts and request links</h2><p>Account sessions use cookies. A private request-status link grants access to that request’s status: keep it private. Website analytics may record page visits; do not put shipment or personal information into public links.</p><h2>Questions or corrections</h2><p>Contact <a href="mailto:info@cubicship.com">info@cubicship.com</a> or your selected counter to ask about your information, request a correction or discuss deletion. Include your request reference, and avoid emailing payment-card details or passwords.</p></section>`,
  ),
);
write(
  "service-terms.html",
  page(
    "Service information",
    "What to confirm before booking shipping or print services.",
    intro(
      "Before you book",
      "Know what your request means.",
      "Online intake starts a conversation with your counter. It does not by itself purchase or guarantee a service.",
    ) +
      `<section class="cs-card cs-narrow"><h2>Quotes and availability</h2><p>Staff must confirm item acceptance, service availability, price and timing. A pickup inquiry is not a scheduled collection. Contact the counter for urgent deadlines and to confirm hours.</p><h2>Charges and delivery</h2><p>Before paying, confirm transport, packing, optional protection and destination duties or taxes, including who pays each charge. Delivery estimates depend on the confirmed carrier service and destination.</p><h2>Printing</h2><p>Confirm product specifications, artwork or proof, total price and turnaround before production starts.</p><h2>Changes, cancellation and claims</h2><p>Ask your counter about the conditions that apply to the selected service before purchase. For an existing order, contact the counter with your reference or carrier tracking number. Carrier terms and any agreed service conditions determine the available options.</p>${btn("/dhl-locations.html", "Contact your counter")}</section>`,
  ),
);
// Apply the shared static shell to retained public pages; their own form logic stays intact.
for (const name of [
  "index.html",
  "about.html",
  "ship.html",
  "track.html",
  "profile.html",
  "qr-shipment.html",
]) {
  let html = fs.readFileSync(path.join(root, name), "utf8");
  html = html.replace(
    /<a class="(?:cs-skip|skip-link)"[^>]*>[\s\S]*?<\/a>/g,
    "",
  );
  html = html
    .replace(/<header\b[\s\S]*?<\/header>/i, header)
    .replace(/<footer\b[\s\S]*?<\/footer>/i, footer);
  if (!html.includes('href="/site.css"'))
    html = html.replace(
      "</head>",
      '<link rel="stylesheet" href="/site.css"><script src="/site.js" defer></script></head>',
    );
  html = html.replace(
    /document\.getElementById\(['"]navToggle['"]\)\.addEventListener/g,
    "document.getElementById('navToggle')?.addEventListener",
  );
  if (!/id="main"/.test(html)) html = html.replace("<main", '<main id="main"');
  if (name === "profile.html") html = html.replace(/const CUSTOMER_LOCATIONS = \[[\s\S]*?\];/, "const CUSTOMER_LOCATIONS = " + JSON.stringify(locations.filter(l => !l.openingSoon).map(l => ({id:l.id,name:l.city+", "+l.state}))) + ";");
  write(name, html);
}
const urls = [
  "/",
  "/about.html",
  "/ship.html",
  "/quote.html",
  "/services.html",
  "/business-services.html",
  "/print-pack.html",
  "/business-signage.html",
  "/dhl-locations.html",
  "/track.html",
  "/privacy.html",
  "/service-terms.html",
  ...locations.map((l) => "/locations/" + l.slug + ".html"),
];
write(
  "sitemap.xml",
  `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls.map((u) => `<url><loc>https://cubicship.com${u}</loc></url>`).join("")}</urlset>`,
);
console.log(
  "Built compact public pages and all " + locations.length + " branches.",
);
