const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const locationsDir = path.join(root, "locations");

const locations = [
  {
    id: "dearborn",
    slug: "dearborn-dhl-shipping",
    city: "Dearborn",
    state: "MI",
    market: "Dearborn, MI",
    name: "Dearborn DHL Express Service Point",
    address: "6317 Schaefer Rd, Dearborn, MI 48126",
    phone: "(313) 254-2696",
    tel: "+13132542696",
    rating: "4.7",
    reviews: "28",
    map: "https://maps.app.goo.gl/2FtDw5cMd6kGKomW8?g_st=a",
    review: "Fast service and affordable rates.",
  },
  {
    id: "oak-park",
    slug: "oak-park-dhl-shipping",
    city: "Oak Park",
    state: "IL",
    market: "Oak Park and West Chicago, IL",
    name: "Oak Park DHL Express Service Point",
    address: "6200 Roosevelt Rd, Oak Park, IL 60304",
    phone: "(708) 665-3590",
    tel: "+17086653590",
    rating: "4.4",
    reviews: "27",
    map: "https://maps.app.goo.gl/SeGVkQijWaPfyisPA?g_st=a",
    review: "Highly recommend this location for any business or personal shipping needs!",
  },
  {
    id: "bridgeview",
    slug: "bridgeview-dhl-shipping",
    city: "Bridgeview",
    state: "IL",
    market: "Bridgeview, IL",
    name: "Cubic Ship Bridgeview DHL Express Service Point",
    address: "7327 W 87th St, Bridgeview, IL 60455",
    phone: "(708) 432-5600",
    tel: "+17084325600",
    rating: "4.0",
    reviews: "50",
    map: "https://maps.app.goo.gl/8aEgsLKWCDtxUxku6?g_st=a",
    review: "Fast service, friendly staff, clean and organized.",
  },
  {
    id: "oak-lawn",
    slug: "oak-lawn-dhl-shipping",
    city: "Oak Lawn",
    state: "IL",
    market: "Oak Lawn, IL",
    name: "Oak Lawn DHL Express Service Point",
    address: "9812 S Cicero Ave, Oak Lawn, IL 60453",
    phone: "(708) 741-7473",
    tel: "+17087417473",
    rating: "4.4",
    reviews: "13",
    map: "https://maps.app.goo.gl/aaFArcHWq8ZmpyvZ7?g_st=a",
    review: "Great customer service, also great prices for international shipping.",
  },
  {
    id: "buffalo",
    slug: "buffalo-dhl-shipping",
    city: "Buffalo",
    state: "NY",
    market: "Buffalo, NY",
    name: "Buffalo DHL Express Service Point",
    address: "2618 Main St, Buffalo, NY 14214",
    phone: "(716) 259-8115",
    tel: "+17162598115",
    rating: "5.0",
    reviews: "14",
    map: "https://maps.app.goo.gl/utm5ADkCSDxC1ns9A?g_st=a",
    review: "Very happy to have the DHL office so close to town.",
  },
  {
    id: "bethpage",
    slug: "bethpage-dhl-shipping",
    city: "Bethpage",
    state: "NY",
    market: "Bethpage, NY",
    name: "Bethpage DHL Express Service Point",
    address: "271 Broadway, Bethpage, NY 11714",
    phone: "(516) 433-4891",
    tel: "+15164334891",
    rating: "5.0",
    reviews: "9",
    map: "https://maps.app.goo.gl/6fRQJLtq1M44Aq1Z9?g_st=a",
    review: "The customer service is amazing and the store is clean.",
  },
  {
    id: "iselin",
    slug: "iselin-woodbridge-dhl-shipping",
    city: "Iselin",
    state: "NJ",
    market: "Iselin and Woodbridge, NJ",
    name: "Iselin Woodbridge DHL Express Service Point",
    address: "1214 Green St, Iselin, NJ 08830",
    phone: "(732) 379-4305",
    tel: "+17323794305",
    rating: "5.0",
    reviews: "117",
    map: "https://maps.app.goo.gl/YymTgErU5fMHAWBr6?g_st=a",
    review: "Very good experience and staff is very polite and helpful.",
  },
  {
    id: "milwaukee",
    slug: "milwaukee-dhl-shipping",
    city: "Milwaukee",
    state: "WI",
    market: "Milwaukee, WI",
    name: "Milwaukee DHL Express Service Point",
    address: "2609 W Morgan Ave, Milwaukee, WI 53221",
    phone: "(414) 252-0594",
    tel: "+14142520594",
    rating: "4.9",
    reviews: "16",
    map: "https://maps.app.goo.gl/VAHUdtYEytLqfWkv6?g_st=a",
    review: "Customer service was top-notch.",
  },
  {
    id: "wyncote",
    slug: "wyncote-dhl-shipping",
    city: "Wyncote",
    state: "PA",
    market: "Wyncote, PA",
    name: "Wyncote DHL Express Service Point",
    address: "1000 S Easton Rd Ste 270, Wyncote, PA 19095",
    phone: "(215) 277-3864",
    tel: "+12152773864",
    rating: "4.9",
    reviews: "74",
    map: "https://maps.app.goo.gl/gG6AtunP1mbG2RBH7?g_st=a",
    review: "Knowledge and kind staff made the experience a breeze.",
  },
  {
    id: "indianapolis",
    slug: "indianapolis-dhl-shipping",
    city: "Indianapolis",
    state: "IN",
    market: "Indianapolis, IN",
    name: "Indianapolis DHL Express Service Point",
    address: "3853 Georgetown Rd, Indianapolis, IN 46254",
    phone: "(317) 756-9544",
    tel: "+13177569544",
    rating: "4.6",
    reviews: "116",
    map: "https://maps.app.goo.gl/qMjYzf4sV1stV4wSA?g_st=a",
    review: "Super helpful with my very first DHL shipping experience.",
  },
  {
    id: "allentown-pa",
    slug: "allentown-pa-dhl-shipping",
    city: "Allentown",
    state: "PA",
    market: "Allentown, PA",
    name: "Allentown DHL Express Service Point",
    address: "717 Linden St, Allentown, PA 18101",
    phone: "(610) 773-6814",
    tel: "+16107736814",
    rating: "5.0",
    reviews: "6",
    map: "https://maps.app.goo.gl/WPtKNLxMjuMFSWas9?g_st=a",
    review: "Good customer service.",
  },
  {
    id: "farmington",
    slug: "farmington-mi-dhl-shipping",
    city: "Farmington",
    state: "MI",
    market: "Farmington, MI",
    name: "Farmington DHL Express Service Point",
    address: "31826 Grand River Ave, Farmington, MI 48336",
    phone: "(248) 482-8769",
    tel: "+12484828769",
    rating: "3.9",
    reviews: "11",
    map: "https://maps.app.goo.gl/9WiHRL9JZHvgFJFo6?g_st=a",
    review: "Amazing service at this DHL Service Point!",
  },
  {
    id: "northeast-philadelphia",
    slug: "northeast-philadelphia-dhl-shipping",
    city: "Philadelphia",
    state: "PA",
    market: "Northeast Philadelphia, PA",
    name: "Northeast Philadelphia DHL Express Service Point",
    address: "1900 Grant Ave Ste J, Philadelphia, PA 19115",
    phone: "(215) 437-7795",
    tel: "+12154377795",
    rating: "5.0",
    reviews: "31",
    map: "https://maps.app.goo.gl/M631Tj7AB8fijLe19?g_st=a",
    review: "The staff is super friendly, helpful, and knows exactly what they're doing.",
  },
  {
    id: "freeport",
    slug: "freeport-ny-dhl-shipping",
    city: "Freeport",
    state: "NY",
    market: "Freeport, NY",
    name: "Freeport DHL Express Service Point",
    address: "134 W Sunrise Hwy, Freeport, NY 11520",
    phone: "Phone coming soon",
    rating: "Opening soon",
    reviews: "",
    map: "https://maps.app.goo.gl/ugw8zrpgX8jCii1p6?g_st=i&utm_campaign=ac-im",
    review: "DHL Express Service Point opening soon. Reviews will be added once the counter is active.",
    openingSoon: true,
  },
  {
    id: "cleveland",
    slug: "cleveland-dhl-shipping",
    city: "Cleveland",
    state: "OH",
    market: "Cleveland, OH",
    name: "Cleveland DHL Express Service Point",
    address: "11512 Clifton Blvd, Cleveland, OH 44107",
    phone: "Phone coming soon",
    rating: "Opening soon",
    reviews: "",
    map: "https://maps.app.goo.gl/uEoXVEGgoJAzPP376?g_st=i&utm_campaign=ac-im",
    review: "DHL Express Service Point opening soon. Reviews will be added once the counter is active.",
    openingSoon: true,
  },
];

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
    <a class="btn btn-primary" href="../profile.html?account=business&service=dhl&location=${location.id}">Start request</a>
  </nav>

  <header class="hero">
    <div class="hero-inner">
      <div>
        <div class="eyebrow">CubicShip serviced DHL location</div>
        <h1>${esc(location.market)} DHL shipping and business counter services.</h1>
        <p class="lead">Start a DHL shipment request, prepare business printing, or get counter-service help through CubicShip, then route the work to the serviced ${esc(location.market)} location.</p>
        <div class="hero-actions">
          <a class="btn btn-primary" href="../profile.html?account=business&service=dhl&location=${location.id}">Start DHL request</a>
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
        <p>CubicShip is the online service layer for the branch. Customers can start the request online, then staff can verify details at the counter and continue the shipment or service workflow.</p>
        <div class="service-list">
          <div>DHL Express shipping assistance</div>
          <div>International documents and packages</div>
          <div>Print, pack, mailbox, and document help</div>
          <div>Business signs, labels, flyers, and counter services</div>
          <div>Notary and extra business-service request routing</div>
        </div>
      </article>
      <aside class="card">
        <h2>Location details.</h2>
        <div class="details">
          <div class="detail"><small>Address</small><b>${esc(location.address)}</b></div>
          <div class="detail"><small>Phone</small>${phoneLink}</div>
          <div class="detail"><small>Google listing</small><a href="${esc(location.map)}" target="_blank" rel="noopener">Open this location on Google Maps</a></div>
          <div class="detail"><small>Online request</small><a href="../profile.html?account=business&service=dhl&location=${location.id}">Send details to CubicShip</a></div>
        </div>
      </aside>
    </section>

    <section class="route">
      <div class="wrap">
        <h2>How CubicShip routes the work.</h2>
        <p>The goal is simple: less handwriting, cleaner information, and a faster handoff from customer request to branch service.</p>
        <div class="route-steps">
          <div><b>1. Customer starts</b><span>Choose DHL, print, pack, notary, mailbox, or business services.</span></div>
          <div><b>2. Location routes</b><span>The request carries the selected ${esc(location.market)} location.</span></div>
          <div><b>3. Staff verifies</b><span>The counter confirms sender, receiver, service, cost, and next step.</span></div>
          <div><b>4. Status updates</b><span>The customer and branch can keep the request history cleaner.</span></div>
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
    ["/dhl-locations.html", "weekly", "0.9"],
    ["/services.html", "monthly", "0.8"],
    ["/business-services.html", "weekly", "0.9"],
    ["/print-pack.html", "monthly", "0.8"],
    ["/business-signage.html", "monthly", "0.8"],
    ["/profile.html", "monthly", "0.8"],
    ["/platform.html", "monthly", "0.8"],
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
