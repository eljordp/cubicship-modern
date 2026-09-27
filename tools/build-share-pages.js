// Share crawlers do not run our language-selection JavaScript. Give each
// language its own URL and translated metadata in the initial HTML response.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { parseHTML } = require('linkedom');
const root = path.resolve(__dirname, '..', 'public');
const context = { window: {} };
vm.runInNewContext(fs.readFileSync(path.join(root, 'locales/catalog.js'), 'utf8'), context);
const { catalogs, languages, localeFiles } = context.window.CubicCatalog;
// Match the browser's single text node for escaped entities such as &amp;.
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
for (const definition of languages.filter((item) => item.code !== "en")) {
  const language = definition.code;
  if (localeFiles[language]) catalogs[language] = JSON.parse(fs.readFileSync(path.join(root, localeFiles[language].json), "utf8"));
  const { document } = parseHTML(fs.readFileSync(path.join(root, 'index.html'), 'utf8'));
  coalesce(document);
  const url = `https://cubicship.com/${language}`;
  document.documentElement.lang = language;
  document.documentElement.dir = definition.dir;
  // Preserve the original text mappings so the shared language picker keeps working.
  for (const el of document.querySelectorAll('[data-i18n-text]')) {
    for (const [index, id] of JSON.parse(el.getAttribute('data-i18n-text'))) {
      const node = el.childNodes[index];
      if (node?.nodeType === 3) node.textContent = node.textContent.replace(node.textContent.trim(), catalogs[language][id]);
    }
  }
  for (const el of document.querySelectorAll('[data-i18n-attrs]')) {
    for (const [attr, id] of Object.entries(JSON.parse(el.getAttribute('data-i18n-attrs')))) el.setAttribute(attr, catalogs[language][id]);
  }
  for (const el of document.querySelectorAll('[data-i18n-message]')) {
    const id = el.getAttribute('data-i18n-message');
    const slots = Object.fromEntries([...el.querySelectorAll('[data-i18n-slot]')].map(slot => [slot.getAttribute('data-i18n-slot'), slot]));
    el.replaceChildren(...catalogs[language][id].split(/(\{\w+\})/).filter(Boolean).map(part => slots[part.slice(1,-1)] || document.createTextNode(part)));
    el.removeAttribute('data-i18n-text');
  }
  document.querySelector('link[rel="canonical"]').href = url;
  document.querySelector('meta[property="og:url"]').content = url;
  const image = 'https://cubicship.com/assets/cubicship-dhl-service-point-hero.webp';
  for (const selector of ['meta[property="og:image"]', 'meta[property="og:image:secure_url"]', 'meta[name="twitter:image"]']) document.querySelector(selector).content = image;
  document.querySelector('meta[property="og:image:type"]').content = 'image/webp';
  document.querySelector('meta[property="og:image:width"]').content = '1942';
  document.querySelector('meta[property="og:image:height"]').content = '810';
  document.querySelector('meta[property="og:image:alt"]').content = document.title;
  const locale = document.createElement('meta');
  locale.setAttribute('property', 'og:locale');
  locale.content = definition.og;
  document.head.append(locale);
  document.querySelectorAll('[data-language-picker] option').forEach(option => {
    option.removeAttribute('selected');
    if (option.value === language) option.setAttribute('selected', '');
  });
  for (const a of document.querySelectorAll('a[href]')) {
    const href = a.getAttribute('href');
    const target = new URL(href, url);
    if (target.origin === 'https://cubicship.com' && (target.pathname === '/' || target.pathname.endsWith('.html'))) {
      target.searchParams.set('lang', language);
      a.setAttribute('href', target.pathname + target.search + target.hash);
    }
  }
  if (localeFiles[language]) {
    const script = document.createElement("script");
    script.src = localeFiles[language].script;
    document.querySelector('script[src="/i18n.js"]').before(script);
  }
  fs.writeFileSync(path.join(root, language + '.html'), document.toString());
}
console.log('Built ' + (languages.length - 1) + ' translated share pages with crawler-readable metadata.');
