const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { parseHTML } = require("linkedom");
const acorn = require("acorn");
const walk = require("acorn-walk");
const root = path.resolve(__dirname, "..");
const pages = [
  "index.html",
  "about.html",
  "ship.html",
  "track.html",
  "profile.html",
  "qr-shipment.html",
  "services.html",
  "business-services.html",
  "print-pack.html",
  "business-signage.html",
  "dhl-locations.html",
  "quote.html",
  "404.html",
  "privacy.html",
  "service-terms.html",
  "service-request.html",
  "request-status.html",
  "account-help.html",
  "auth/callback.html",
  ...fs
    .readdirSync(path.join(root, "locations"))
    .filter((f) => f.endsWith(".html"))
    .map((f) => "locations/" + f),
];
const normalize = (s) => s.replace(/\s+/g, " ").trim();
const key = (s) =>
  "m_" +
  crypto.createHash("sha256").update(normalize(s)).digest("hex").slice(0, 12);
const skip =
  'script,style,svg,code,pre,address,[translate="no"],[data-no-translate],.cs-brand';
const attrs = ["placeholder", "aria-label", "title", "alt"];
function texts(document, add) {
  function visit(el) {
    if (el.nodeType === 3) {
      if (!el.parentElement?.closest(skip)) add(normalize(el.textContent));
    } else for (const child of el.childNodes || []) visit(child);
  }
  visit(document);
  for (const el of document.querySelectorAll("*")) {
    if (el.closest(skip)) continue;
    for (const attr of attrs)
      if (el.hasAttribute(attr)) add(normalize(el.getAttribute(attr)));
    if (
      el.matches(
        'meta[name="description"],meta[property="og:title"],meta[property="og:description"],meta[name="twitter:title"],meta[name="twitter:description"]',
      )
    )
      add(normalize(el.getAttribute("content")));
  }
}
function collect() {
  const values = new Set();
  const add = (s) => {
    if (s && /[A-Za-z]/.test(s) && !/^(https?:|mailto:|tel:|\/)/.test(s))
      values.add(s);
  };
  function js(source) {
    let ast;
    try {
      ast = acorn.parse(source, {
        ecmaVersion: "latest",
        sourceType: "script",
      });
    } catch {
      return;
    }
    walk.simple(ast, {
      Literal(n) {
        if (typeof n.value === "string") {
          if (n.value.includes("<") && n.value.includes(">"))
            texts(
              parseHTML("<html><body>" + n.value + "</body></html>").document,
              add,
            );
          else if (
            !/[{};=<>]|\\[wds]/.test(n.value) &&
            (n.value.includes(" ") || /^[A-Z][a-z]+[.!?…]?$/.test(n.value))
          )
            add(normalize(n.value));
        }
      },
      TemplateElement(n) {
        const s = n.value.cooked || "";
        if (s.includes("<"))
          texts(parseHTML("<html><body>" + s + "</body></html>").document, add);
      },
    });
  }
  for (const file of pages) {
    const { document } = parseHTML(
      fs.readFileSync(path.join(root, file), "utf8"),
    );
    texts(document, add);
    for (const s of document.querySelectorAll(
      'script:not([src]):not([type="application/ld+json"])',
    ))
      js(s.textContent);
  }
  for (const f of [
    "shipping.js",
    "location-picker.js",
    "request-status.js",
    "service-request.js",
    "account-help.js",
    "account-callback.js",
    "chat-widget.js",
    "intake-availability.js",
    ...fs
      .readdirSync(path.join(root, "api"))
      .filter((f) => f.endsWith(".js"))
      .map((f) => "api/" + f),
  ])
    js(fs.readFileSync(path.join(root, f), "utf8"));
  return [...values];
}
module.exports = { root, pages, normalize, key, skip, attrs, texts, collect };
if (require.main === module)
  fs.writeFileSync(
    path.join(root, "../i18n-strings.json"),
    JSON.stringify(collect(), null, 2),
  );
