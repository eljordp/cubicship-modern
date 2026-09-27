// Share crawlers do not run our language-selection JavaScript. Give each
// language its own URL and translated metadata in the initial HTML response.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { parseHTML } = require('linkedom');
const root = path.resolve(__dirname, '..', 'public');
const context = { window: {} };
vm.runInNewContext(fs.readFileSync(path.join(root, 'locales/catalog.js'), 'utf8'), context);
const { catalogs } = context.window.CubicCatalog;
for (const language of ['ar', 'es']) {
  const { document } = parseHTML(fs.readFileSync(path.join(root, 'index.html'), 'utf8'));
  const url = `https://cubicship.com/${language}`;
  document.documentElement.lang = language;
  document.documentElement.dir = language === 'ar' ? 'rtl' : 'ltr';
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
  document.querySelector('link[rel="canonical"]').href = url;
  document.querySelector('meta[property="og:url"]').content = url;
  const image = 'https://cubicship.com/assets/cubicship-dhl-service-point-hero.webp';
  for (const selector of ['meta[property="og:image"]', 'meta[property="og:image:secure_url"]', 'meta[name="twitter:image"]']) document.querySelector(selector).content = image;
  document.querySelector('meta[property="og:image:type"]').content = 'image/webp';
  document.querySelector('meta[property="og:image:width"]').content = '1942';
  document.querySelector('meta[property="og:image:height"]').content = '810';
  document.querySelector('meta[property="og:image:alt"]').content = language === 'ar' ? 'خدمات الشحن لدى CubicShip' : 'Servicios de envío de CubicShip';
  const locale = document.createElement('meta');
  locale.setAttribute('property', 'og:locale');
  locale.content = language === 'ar' ? 'ar_US' : 'es_US';
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
  fs.writeFileSync(path.join(root, language + '.html'), document.toString());
}
console.log('Built Arabic and Spanish share pages with crawler-readable metadata.');
