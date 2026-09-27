const fs = require("node:fs");
const path = require("node:path");
const { parseHTML } = require("linkedom");
const { root, pages, normalize, key, skip, attrs } = require("./i18n-catalog");
const rows = fs
  .readFileSync(path.join(root, "locales/translations.tsv"), "utf8")
  .trim()
  .split("\n")
  .map((line) => line.split("\t"));
const catalogs = { en: {}, es: {}, ar: {} };
const sourceKeys = {};
const contextual = JSON.parse(
  fs.readFileSync(path.join(root, "locales/messages.json"), "utf8"),
);
for (const [id, translations] of Object.entries(contextual)) {
  for (const locale of ["en", "es", "ar"])
    catalogs[locale][id] = translations[locale];
}

for (const [en, es, ar] of rows) {
  if (!en || !es || !ar) throw Error("Incomplete translation: " + en);
  const id = key(en);
  if (catalogs.en[id] && (catalogs.es[id] !== es || catalogs.ar[id] !== ar))
    throw Error("Conflicting translation: " + en);
  catalogs.en[id] = en;
  catalogs.es[id] = es;
  catalogs.ar[id] = ar;
  sourceKeys[normalize(en).toLowerCase()] = id;
}
// Match case variants while storing stable, explicit message IDs in the output.
function lookup(source) {
  return sourceKeys[normalize(source).toLowerCase()];
}
function add(en, es, ar) {
  const id = key(en);
  catalogs.en[id] = en;
  catalogs.es[id] = es;
  catalogs.ar[id] = ar;
  sourceKeys[normalize(en).toLowerCase()] = id;
}
function derived(source) {
  if (lookup(source)) return;
  let m = source.match(/^(.*) \| CubicShip$/);
  if (m && lookup(m[1])) {
    const id = lookup(m[1]);
    add(
      source,
      catalogs.es[id] + " | CubicShip",
      catalogs.ar[id] + " | CubicShip",
    );
    return;
  }
  m = source.match(
    /^DHL counter information, directions and shipping requests for (.+)$/,
  );
  if (m) {
    add(
      source,
      "Información del mostrador DHL, indicaciones y solicitudes para " + m[1],
      "معلومات فرع DHL وموقعه وطلبات الشحن في " + m[1],
    );
    return;
  }
  m = source.match(/^Call ([+()0-9 \-]+)$/);
  if (m) {
    add(source, "Llamar " + m[1], "اتصل " + m[1]);
    return;
  }
  m = source.match(/^(.*) DHL shipping \| CubicShip$/);
  if (m) {
    add(
      source,
      m[1] + " · Envíos DHL | CubicShip",
      m[1] + " · شحن DHL | CubicShip",
    );
    return;
  }
  if (/^(Mon|Tue|Wed|Thu|Fri|Sat|Sun)[–:]|^Sun:/.test(source)) {
    const days = {
      Mon: ["lun", "الاثنين"],
      Tue: ["mar", "الثلاثاء"],
      Wed: ["mié", "الأربعاء"],
      Thu: ["jue", "الخميس"],
      Fri: ["vie", "الجمعة"],
      Sat: ["sáb", "السبت"],
      Sun: ["dom", "الأحد"],
      Closed: ["Cerrado", "مغلق"],
      AM: ["a. m.", "ص"],
      PM: ["p. m.", "م"],
    };
    add(
      source,
      source.replace(
        /Mon|Tue|Wed|Thu|Fri|Sat|Sun|Closed|AM|PM/g,
        (w) => days[w][0],
      ),
      source.replace(
        /Mon|Tue|Wed|Thu|Fri|Sat|Sun|Closed|AM|PM/g,
        (w) => days[w][1],
      ),
    );
  }
}
for (const title of [
  "Link needs attention.",
  "Choose a new password.",
  "Email confirmed.",
  "Password updated.",
])
  derived(title + " | CubicShip");
// HTML parsers may split entity references into adjacent text nodes. Browsers
// coalesce them, so catalog IDs must be attached after matching that structure.
function coalesce(node) {
  let previous;
  for (const child of [...node.childNodes]) {
    if (child.nodeType === 3 && previous?.nodeType === 3) {
      previous.textContent += child.textContent;
      child.remove();
    } else {
      coalesce(child);
      previous = child;
    }
  }
}
const missing = new Set();
for (const file of pages) {
  const dest = path.join(root, "public", file);
  const { document } = parseHTML(fs.readFileSync(dest, "utf8"));
  coalesce(document);
  for (const a of document.querySelectorAll('a[href^="tel:"]')) {
    const match = normalize(a.textContent).match(/^Call ([+()0-9 \-]+)$/);
    if (match) {
      a.textContent = "Call ";
      const number = document.createElement("bdi");
      number.className = "cs-phone-number";
      number.dir = "ltr";
      number.setAttribute("translate", "no");
      number.textContent = match[1];
      a.append(number);
    }
  }
  document
    .querySelectorAll(
      'script[src="/shipping-i18n.js"],script[src="shipping-i18n.js"],.language-choice,#langEn,#langEs',
    )
    .forEach((el) => el.remove());
  for (const el of document.querySelectorAll("option:not([value])"))
    el.setAttribute("value", el.textContent);
  function visit(el) {
    if (el.nodeType !== 1 && el.nodeType !== 9) return;
    if (el.nodeType === 1 && el.closest(skip)) return;
    const mappings = [];
    [...(el.tagName === "TEXTAREA" ? [] : el.childNodes)].forEach(
      (child, i) => {
        if (child.nodeType === 3) {
          const source = normalize(child.textContent);
          derived(source);
          const id = lookup(source);
          if (id) mappings.push([i, id]);
          else if (/[a-zA-Z]/.test(source)) missing.add(source);
        } else visit(child);
      },
    );
    if (mappings.length)
      el.setAttribute("data-i18n-text", JSON.stringify(mappings));
    if (el.nodeType !== 1) return;
    const mappingsAttrs = {};
    for (const attr of attrs) {
      const v = el.getAttribute(attr);
      if (v) {
        const id = lookup(v);
        if (id) mappingsAttrs[attr] = id;
        else missing.add(v);
      }
    }
    if (
      el.matches(
        'meta[name="description"],meta[property="og:title"],meta[property="og:description"],meta[name="twitter:title"],meta[name="twitter:description"]',
      )
    ) {
      const content = el.getAttribute("content") || "";
      derived(content);
      const id = lookup(content);
      if (id) mappingsAttrs.content = id;
    }
    if (Object.keys(mappingsAttrs).length)
      el.setAttribute("data-i18n-attrs", JSON.stringify(mappingsAttrs));
  }
  visit(document);
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = "/i18n.css";
  document.head.append(link);
  // Synchronous locale bootstrap precedes existing inline account scripts and establishes reading direction before body layout.
  for (const src of ["/locales/catalog.js", "/i18n.js"]) {
    const script = document.createElement("script");
    script.src = src;
    document.head.append(script);
  }
  const target = document.querySelector(".cs-header");
  if (target) {
    const label = document.createElement("label");
    label.className = "cs-language";
    label.setAttribute("translate", "no");
    label.innerHTML =
      '<span aria-hidden="true">文 / ع</span><select aria-label="Language / Idioma / اللغة" data-language-picker><option value="en" lang="en">English</option><option value="es" lang="es">Español</option><option value="ar" lang="ar">العربية</option></select>';
    target.append(label);
  }
  // Preserve identifiers and data supplied by customers or the counter.
  for (const el of document.querySelectorAll(
    '#requestCode,#generatedNumber,#statusNumber,#sideAddress,#receiptAddress,#receiptBranch,#sideName,#orderCode,#serviceCode,#serviceBranch,.ship-number,address,input[type="email"],input[type="tel"]',
  )) {
    el.setAttribute("translate", "no");
    el.setAttribute("dir", "ltr");
  }
  fs.writeFileSync(dest, document.toString());
}
fs.mkdirSync(path.join(root, "public/locales"), { recursive: true });
fs.writeFileSync(
  path.join(root, "public/locales/catalog.js"),
  "window.CubicCatalog=" +
    JSON.stringify({ catalogs, sourceKeys }).replace(/</g, "\\u003c") +
    ";\n",
);
fs.writeFileSync(
  path.join(root, "public/locales/coverage.json"),
  JSON.stringify([...missing], null, 2),
);
console.log(
  "Localized " +
    pages.length +
    " customer pages; " +
    rows.length +
    " messages in English, Spanish and Arabic.",
);
