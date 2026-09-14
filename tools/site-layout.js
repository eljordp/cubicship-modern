const esc = (value) =>
  String(value || "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const header = `<a class="cs-skip" href="#main">Skip to content</a><header class="cs-header"><a class="cs-brand" href="/"><img src="/logo-160.png" width="36" height="36" alt="">Cubic<span>Ship</span></a><button class="cs-toggle" type="button" aria-expanded="false" aria-controls="cs-navigation">Menu</button><nav id="cs-navigation" class="cs-navigation" aria-label="Main navigation"><a href="/ship.html">Ship</a><a href="/services.html">Services</a><a href="/dhl-locations.html">Locations</a><a href="/track.html">Track</a><a href="/profile.html">Account</a></nav></header>`;
const footer = `<footer class="cs-footer"><span>© 2026 Cubic Home Solutions</span><nav aria-label="Footer"><a href="/about.html">About</a><a href="/dhl-locations.html">Contact a counter</a><a href="/request-status.html">Request status</a><a href="/privacy.html">Privacy</a><a href="/service-terms.html">Service information</a></nav></footer>`;
function page(title, description, body, script = "", noindex = false) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)} | CubicShip</title><meta name="description" content="${esc(description)}">${noindex ? '<meta name="robots" content="noindex">' : ""}<link rel="icon" href="/favicon-64.png"><link rel="stylesheet" href="/site.css"><script src="/site.js" defer></script></head><body class="cs-page">${header}<main id="main" class="cs-main">${body}</main>${footer}${script}</body></html>`;
}
module.exports = { esc, header, footer, page };
