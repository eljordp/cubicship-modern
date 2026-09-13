const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const locationsDir = path.join(root, "locations");

const locations = require("../assets/locations.json");

function esc(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function pageFor(location) {
  const title = `${location.market} DHL Shipping & Business Services | CubicShip`;
  const description = `Start DHL shipping, print and pack, mailbox, notary, and business-service requests for the ${location.market} CubicShip serviced DHL Express location.`;
  const url = `https://cubicship.com/locations/${location.slug}.html`;
  const statusLabel = location.openingSoon ? "Opening soon" : `${location.rating} Google rating${location.reviews ? ` from ${location.reviews} reviews` : ""}`;
  const phoneLink = location.tel ? `<a href="tel:${location.tel}">${esc(location.phone)}</a>` : `<span>${esc(location.phone)}</span>`;
  const schema = {
    "@context": "https://schema.org",
    "@type": "LocalBusiness",
    "@id": `${url}#location`,
    name: location.name,
    url,
    image: "https://cubicship.com/og-image.png",
    address: location.address,
    telephone: location.tel || undefined,
    parentOrganization: {
      "@type": "Organization",
      name: "CubicShip",
      url: "https://cubicship.com/",
    },
    areaServed: [location.market],
    makesOffer: [
      { "@type": "Offer", itemOffered: { "@type": "Service", name: "DHL Express shipping assistance" } },
      { "@type": "Offer", itemOffered: { "@type": "Service", name: "Print and pack counter services" } },
      { "@type": "Offer", itemOffered: { "@type": "Service", name: "Mailbox, document, and notary support" } },
      { "@type": "Offer", itemOffered: { "@type": "Service", name: "Business print and display services" } },
    ],
  };

  const requestHref = location.openingSoon ? "../dhl-locations.html" : `../ship.html?location=${encodeURIComponent(location.id)}`;
  const requestLabel = location.openingSoon ? "Find an open counter" : "Start DHL request";
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${esc(title)}</title>
  <meta name="description" content="${esc(description)}">
  <link rel="canonical" href="${url}">
  <meta property="og:title" content="${esc(title)}">
  <meta property="og:description" content="${esc(description)}">
  <meta property="og:url" content="${url}">
  <meta property="og:image" content="https://cubicship.com/og-image.png">
  <meta name="twitter:card" content="summary_large_image">
  <script src="/analytics.js" defer></script>
  <script src="/_vercel/insights/script.js" defer></script>
  <script type="application/ld+json">${JSON.stringify(schema)}</script>
  <style>
    :root { --navy:#071428; --navy-2:#0e223a; --orange:#f47d30; --green:#63bd4e; --ink:#111827; --muted:#647084; --line:#dbe2eb; --bg:#f5f7fb; --white:#fff; }
    * { box-sizing: border-box; }
    body { margin:0; font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; color:var(--ink); background:var(--bg); }
    a { color:inherit; text-decoration:none; }
    .nav { display:flex; align-items:center; justify-content:space-between; gap:24px; padding:18px 6vw; background:rgba(255,255,255,.96); border-bottom:1px solid var(--line); position:sticky; top:0; z-index:5; }
    .brand { display:flex; align-items:center; gap:0; font-weight:900; font-size:22px; }
    .brand img { width:42px; height:42px; border-radius:10px; margin-right:12px; }
    .brand span:first-of-type { color:var(--orange); }
    .brand span:last-of-type { color:var(--green); }
    .nav-links { display:flex; gap:24px; align-items:center; font-weight:800; color:#526074; }
    .nav-links a:hover { color:var(--orange); }
    .btn { display:inline-flex; align-items:center; justify-content:center; min-height:48px; padding:0 22px; border-radius:8px; font-weight:900; border:1px solid transparent; }
    .btn-primary { background:var(--orange); color:white; box-shadow:0 12px 28px rgba(244,125,48,.24); }
    .btn-secondary { background:white; border-color:var(--line); color:var(--navy); }
    .hero { background:linear-gradient(135deg, rgba(7,20,40,.96), rgba(14,34,58,.92)), url("https://images.unsplash.com/photo-1586528116311-ad8dd3c8310d?auto=format&fit=crop&w=1800&q=80") center/cover; color:white; padding:74px 6vw 62px; }
    .hero-inner { max-width:1120px; margin:0 auto; display:grid; grid-template-columns:minmax(0,1.35fr) minmax(320px,.65fr); gap:34px; align-items:end; }
    .eyebrow { color:#ffb36f; text-transform:uppercase; letter-spacing:.18em; font-weight:900; font-size:13px; margin-bottom:14px; }
    h1 { font-size:clamp(40px,6vw,72px); line-height:.98; margin:0 0 20px; letter-spacing:0; max-width:900px; }
    .lead { font-size:20px; line-height:1.65; color:#dbe4f0; margin:0; max-width:780px; }
    .hero-actions { display:flex; gap:14px; flex-wrap:wrap; margin-top:30px; }
    .proof { background:rgba(255,255,255,.08); border:1px solid rgba(255,255,255,.18); border-radius:8px; padding:24px; backdrop-filter:blur(12px); }
    .proof strong { display:block; font-size:34px; color:#ffd15c; margin-bottom:6px; }
    .proof p { margin:0 0 18px; color:#d6deea; line-height:1.55; }
    .wrap { max-width:1120px; margin:0 auto; padding:54px 6vw; }
    .grid { display:grid; grid-template-columns:1fr 1fr; gap:22px; }
    .card { background:white; border:1px solid var(--line); border-radius:8px; padding:28px; box-shadow:0 18px 40px rgba(15,23,42,.06); }
    .card h2, .card h3 { margin:0 0 14px; color:var(--navy); letter-spacing:0; }
    .card p { color:var(--muted); line-height:1.65; margin:0 0 16px; }
    .service-list { display:grid; gap:12px; margin-top:18px; }
    .service-list div { border:1px solid var(--line); border-radius:8px; padding:16px; font-weight:850; background:#fbfcff; }
    .details { display:grid; gap:14px; }
    .detail { padding:16px; background:#f8fafc; border:1px solid var(--line); border-radius:8px; }
    .detail small { display:block; text-transform:uppercase; letter-spacing:.12em; color:#778398; font-weight:900; margin-bottom:6px; }
    .detail b, .detail a, .detail span { color:var(--navy); font-size:18px; font-weight:900; }
    .route { background:var(--navy); color:white; }
    .route .wrap { padding-top:46px; padding-bottom:46px; }
    .route h2 { margin:0 0 12px; font-size:34px; color:white; }
    .route p { color:#d6deea; line-height:1.65; max-width:780px; }
    .route-steps { display:grid; grid-template-columns:repeat(4,1fr); gap:14px; margin-top:24px; }
    .route-steps div { border:1px solid rgba(255,255,255,.18); border-radius:8px; padding:18px; background:rgba(255,255,255,.06); }
    .route-steps b { color:#ffb36f; display:block; margin-bottom:8px; }
    footer { padding:32px 6vw; background:#06101f; color:#aab6c8; text-align:center; }
    @media (max-width:480px) { .nav { padding:14px; gap:12px; flex-wrap:wrap; } .brand { font-size:20px; } .btn { padding:0 14px; } .hero-inner { min-width:0; } h1 { overflow-wrap:anywhere; } }
    @media (max-width:850px) {
      .nav { align-items:flex-start; }
      .nav-links { display:none; }
      .hero-inner, .grid, .route-steps { grid-template-columns:1fr; }
      h1 { font-size:42px; }
    }
  </style>
</head>
<body>
  <nav class="nav">
    <a class="brand" href="../index.html" aria-label="CubicShip home"><img src="../logo.png" alt="CubicShip logo"><span>Cubic</span><span>Ship</span></a>
    <div class="nav-links">
      <a href="../dhl-locations.html">DHL Locations</a>
      <a href="../business-services.html">Business Services</a>
      <a href="../services.html">Services</a>
      <a href="../track.html">Track</a>
    </div>
    <a class="btn btn-primary" href="${requestHref}">${requestLabel}</a>
  </nav>

  <header class="hero">
    <div class="hero-inner">
      <div>
        <div class="eyebrow">CubicShip serviced DHL location</div>
        <h1>DHL Express shipping in ${esc(location.market)}.</h1>
        <p class="lead">${location.openingSoon ? "This counter is opening soon. Please choose an active location for shipping today." : "Bring your documents or packages for packing, paperwork and DHL Express help. Start online without an account and show your request code at this counter."}</p>
        <div class="hero-actions">
          <a class="btn btn-primary" href="${requestHref}">${requestLabel}</a>
          <a class="btn btn-secondary" href="${esc(location.map)}" target="_blank" rel="noopener">Open Google listing</a>
        </div>
      </div>
      <aside class="proof">
        <strong>${esc(statusLabel)}</strong>
        <p>${esc(location.review)}</p>
        <p>${esc(location.address)}</p>
      </aside>
    </div>
  </header>

  <main>
    <section class="wrap grid">
      <article class="card">
        <h2>Services at this location.</h2>
        <p>Get help preparing documents and packages for international shipping. Ask this counter to confirm availability and pricing for any additional service you need.</p>
        <div class="service-list">
          <div>DHL Express shipping assistance</div>
          <div>International documents and packages</div>
          <div>Print, pack, mailbox, and document help</div>
          <div>Business signs, labels, flyers, and counter services</div>
          <div>Ask about notary and other business services</div>
        </div>
      </article>
      <aside class="card">
        <h2>Location details.</h2>
        <div class="details">
          <div class="detail"><small>Address</small><b>${esc(location.address)}</b></div>
          <div class="detail"><small>Phone</small>${phoneLink}</div>
          <div class="detail"><small>Google listing</small><a href="${esc(location.map)}" target="_blank" rel="noopener">Open this location on Google Maps</a></div>
          <div class="detail"><small>Hours and last DHL collection</small><a href="${esc(location.map)}" target="_blank" rel="noopener">Check current hours on Google Maps</a><p style="margin:10px 0 0">${location.openingSoon ? "Opening date to be confirmed. Use an active counter for current shipments." : "Call before traveling to confirm today’s hours and last collection. DHL collection may finish before the counter closes."}</p></div>
          <div class="detail"><small>Online request</small><a href="${requestHref}">${requestLabel}</a></div>
        </div>
      </aside>
    </section>

    <section class="route">
      <div class="wrap">
        <h2>Before you visit.</h2>
        <p>Bring your items, the receiver’s address and contact details, and your request code if you started online. Staff will confirm what paperwork your shipment needs.</p>
        <div class="route-steps">
          <div><b>1. Start online</b><span>Request a quote or prepare a DHL drop-off. No account needed.</span></div>
          <div><b>2. Save your code</b><span>Your request is sent to the counter you selected.</span></div>
          <div><b>3. Confirm and ship</b><span>Staff checks the details, packing, price and delivery estimate before you book.</span></div>
          <div><b>4. Track delivery</b><span>Use the carrier tracking number after your shipment is created.</span></div>
        </div>
      </div>
    </section>
  </main>

  <footer>
    <p>CubicShip supports serviced DHL Express partner locations with shipping, counter-service, and business workflow tools.</p>
  </footer>
</body>
</html>
`;
}

function writeLocationPages() {
  fs.mkdirSync(locationsDir, { recursive: true });
  for (const location of locations) {
    fs.writeFileSync(path.join(locationsDir, `${location.slug}.html`), pageFor(location));
  }
}

function updateSitemap() {
  const baseUrls = [
    ["/", "weekly", "1.0"],
    ["/quote.html", "weekly", "0.9"],
    ["/ship.html", "weekly", "0.9"],
    ["/dhl-locations.html", "weekly", "0.9"],
    ["/services.html", "monthly", "0.8"],
    ["/business-services.html", "weekly", "0.9"],
    ["/print-pack.html", "monthly", "0.8"],
    ["/business-signage.html", "monthly", "0.8"],
    ["/track.html", "monthly", "0.7"],
  ];
  const locationUrls = locations.map((location) => [`/locations/${location.slug}.html`, "weekly", location.openingSoon ? "0.6" : "0.85"]);
  const urlEntries = [...baseUrls, ...locationUrls].map(([url, freq, priority]) => `  <url>
    <loc>https://cubicship.com${url}</loc>
    <changefreq>${freq}</changefreq>
    <priority>${priority}</priority>
  </url>`).join("\n");
  fs.writeFileSync(path.join(root, "sitemap.xml"), `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urlEntries}
</urlset>
`);
}

function updateLocationHub() {
  const hubPath = path.join(root, "dhl-locations.html");
  let html = fs.readFileSync(hubPath, "utf8");
  for (const location of locations) {
    html = html.replace(
      new RegExp(`href="${location.map.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}" target="_blank" rel="noopener"`, "g"),
      `href="locations/${location.slug}.html"`
    );
  }
  html = html.replace(/Open on Google Maps -&gt;/g, "View location page -&gt;");
  html = html.replace(
    "Tap a card to open its Google Maps listing, or tap a phone number to call the location. Each location can support DHL shipping plus practical Cubic business services like print, pack, mailbox, notary, documents, and counter help.",
    "Tap a card to open the CubicShip page for that serviced DHL location. Each page connects the matching Google listing, phone number, request flow, and practical Cubic business services like print, pack, mailbox, notary, documents, and counter help."
  );
  fs.writeFileSync(hubPath, html);
}

writeLocationPages();
updateSitemap();
updateLocationHub();
console.log(`Generated ${locations.length} location pages and refreshed sitemap/location hub.`);
