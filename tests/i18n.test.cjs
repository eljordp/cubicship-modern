const test = require("node:test"),
  assert = require("node:assert/strict"),
  fs = require("node:fs"),
  path = require("node:path"),
  vm = require("node:vm");
const { resolveLanguage } = require("../i18n.js");
const { pages, skip, normalize } = require("../tools/i18n-catalog");
const { parseHTML } = require("linkedom");
const root = path.resolve(__dirname, "..");
const ctx = { window: {} };
vm.runInNewContext(
  fs.readFileSync(path.join(root, "public/locales/catalog.js"), "utf8"),
  ctx,
);
const { catalogs, sourceKeys } = ctx.window.CubicCatalog;
test("locale selection honors URL, saved choice, browser preferences and English fallback", () => {
  assert.equal(resolveLanguage("ar-EG", "es", ["en-US"]), "ar");
  assert.equal(resolveLanguage(null, "es-MX", ["ar"]), "es");
  assert.equal(resolveLanguage("xx", "broken", ["fr-FR", "ar-SA", "en"]), "ar");
  assert.equal(resolveLanguage(null, null, ["es-419"]), "es");
  assert.equal(resolveLanguage(null, null, ["zh-Hant", "fr"]), "en");
  assert.equal(resolveLanguage(null, null, []), "en");
});
test("Spanish and Arabic catalogs cover English keys with intact interpolation fields", () => {
  for (const lang of ["es", "ar"]) {
    assert.deepEqual(
      Object.keys(catalogs[lang]).sort(),
      Object.keys(catalogs.en).sort(),
    );
    for (const [key, en] of Object.entries(catalogs.en)) {
      assert.ok(catalogs[lang][key].trim(), key);
      assert.deepEqual(
        (catalogs[lang][key].match(/\{\w+\}/g) || []).sort(),
        (en.match(/\{\w+\}/g) || []).sort(),
        en,
      );
    }
  }
});
test("all customer pages publish the shared picker, locale assets, and stable select values", () => {
  for (const file of pages) {
    const html = fs.readFileSync(path.join(root, "public", file), "utf8"),
      { document } = parseHTML(html);
    assert.equal(
      document.querySelectorAll("[data-language-picker]").length,
      1,
      file,
    );
    assert.equal(
      document.querySelectorAll('script[src="/i18n.js"]').length,
      1,
      file,
    );
    assert.ok(
      document.querySelector('script[src="/locales/catalog.js"]'),
      file,
    );
    assert.equal(
      document.querySelectorAll("option:not([value])").length,
      0,
      file,
    );
    assert.equal(
      document.querySelectorAll('script[src$="shipping-i18n.js"]').length,
      0,
      file,
    );
    assert.equal(
      document.querySelectorAll("#langEn,#langEs,.language-choice").length,
      0,
      file,
    );
    for (const script of document.querySelectorAll(
      'script:not([src]):not([type="application/ld+json"])',
    ))
      assert.doesNotThrow(() => new vm.Script(script.textContent), file);
  }
});
test("static copy coverage excludes only brand names, identifiers, and preserved place names", () => {
  const untranslated = JSON.parse(
    fs.readFileSync(path.join(root, "public/locales/coverage.json")),
  );
  const allowed =
    /^(DHL|UPS|FedEx|USPS|©|Shopify,|Cubic Ship Bridgeview$|Oak Lawn Area$|McCook Area$|signer@email.com$|info@cubicship.com$|1$)|, [A-Z]{2}$|DHL Express Service Point$/;
  assert.deepEqual(
    untranslated.filter((s) => !allowed.test(s)),
    [],
  );
});
test("runtime handles blocked storage, language switching, dynamic text, and protected customer content", async () => {
  const { document, window } = parseHTML(
    '<html><head><title>Shipping request</title></head><body><p id="message">Get a quote first</p><p translate="no" id="customer">Documents</p><input id="field" value="Documents" placeholder="Your name"><a href="/ship.html?mode=quote#main">Ship</a><p id="bound"></p></body></html>',
  );
  const location = new URL("https://example.com/ship.html?lang=ar");
  const win = {
    document,
    location,
    navigator: { languages: ["es-MX"] },
    localStorage: {
      getItem() {
        throw Error("blocked");
      },
      setItem() {
        throw Error("blocked");
      },
    },
    history: { replaceState() {} },
    CubicCatalog: ctx.window.CubicCatalog,
  };
  const sandbox = {
    window: win,
    URL,
    URLSearchParams,
    Intl,
    MutationObserver: window.MutationObserver,
    CustomEvent: window.CustomEvent,
  };
  vm.runInNewContext(
    fs.readFileSync(path.join(root, "i18n.js"), "utf8"),
    sandbox,
  );
  assert.equal(win.CubicI18n.t("constructor"), "constructor");
  assert.equal(win.CubicI18n.t("__proto__"), "__proto__");
  assert.equal(document.documentElement.dir, "rtl");
  assert.equal(
    document.getElementById("message").textContent,
    "احصل على عرض سعر أولًا",
  );
  assert.equal(document.getElementById("customer").textContent, "Documents");
  assert.equal(document.getElementById("field").value, "Documents");
  assert.equal(
    document.getElementById("field").getAttribute("placeholder"),
    "اسمك",
  );
  win.CubicI18n.setLanguage("es");
  assert.equal(document.documentElement.dir, "ltr");
  assert.equal(
    document.getElementById("message").textContent,
    "Obtener una cotización primero",
  );
  assert.equal(
    document.querySelector("a").getAttribute("href"),
    "/ship.html?mode=quote&lang=es#main",
  );
  document.getElementById("message").textContent = "Sending…";
  await new Promise((r) => setTimeout(r, 0));
  assert.equal(document.getElementById("message").textContent, "Enviando…");
  win.CubicI18n.setText(
    document.getElementById("bound"),
    "Your requests, {name}.",
    { name: "<script>Documents</script>" },
  );
  assert.equal(document.getElementById("bound").querySelector("script"), null);
  win.CubicI18n.setLanguage("en");
  assert.equal(document.getElementById("message").textContent, "Sending…");
  assert.ok(
    document
      .getElementById("bound")
      .textContent.includes("<script>Documents</script>"),
  );
  assert.equal(document.getElementById("field").value, "Documents");
});

test("contextual sentences preserve their links and translate correctly when switching languages", () => {
  const { document, window } = parseHTML(
    fs.readFileSync(path.join(root, "public/privacy.html"), "utf8"),
  );
  // Linkedom has no select.value setter; the browser checks cover the real picker.
  document.querySelector("[data-language-picker]").remove();
  const win = {
    document,
    location: new URL("https://example.com/privacy.html?lang=ar"),
    navigator: { languages: ["en"] },
    localStorage: {
      getItem() {
        return null;
      },
      setItem() {},
    },
    history: { replaceState() {} },
    CubicCatalog: ctx.window.CubicCatalog,
  };
  vm.runInNewContext(fs.readFileSync(path.join(root, "i18n.js"), "utf8"), {
    window: win,
    URL,
    URLSearchParams,
    Intl,
    MutationObserver: window.MutationObserver,
    CustomEvent: window.CustomEvent,
  });
  const paragraph = document.querySelector(
    '[data-i18n-message="privacy.contact"]',
  );
  const link = paragraph.querySelector("a");
  assert.ok(paragraph.textContent.startsWith("للاستفسار عن بياناتك"));
  assert.equal(link.getAttribute("href"), "mailto:info@cubicship.com");
  win.CubicI18n.setLanguage("es");
  assert.ok(paragraph.textContent.startsWith("Contacte a"));
  win.CubicI18n.setLanguage("en");
  assert.ok(paragraph.textContent.startsWith("Contact info@cubicship.com"));
  assert.equal(paragraph.querySelector("a"), link);
});

test("every page title and description has a catalog entry, including entity-containing text", () => {
  for (const file of pages) {
    const { document } = parseHTML(
      fs.readFileSync(path.join(root, "public", file), "utf8"),
    );
    const title = normalize(document.title);
    assert.ok(sourceKeys[title.toLowerCase()], file + ": " + title);
    assert.ok(
      document
        .querySelector('meta[name="description"]')
        .hasAttribute("data-i18n-attrs"),
      file,
    );
  }
  const { document } = parseHTML(
    fs.readFileSync(
      path.join(root, "public/locations/bridgeview-dhl-shipping.html"),
      "utf8",
    ),
  );
  const note = [...document.querySelectorAll("p")].find((p) =>
    p.textContent.startsWith("Store hours from"),
  );
  const id = JSON.parse(note.getAttribute("data-i18n-text"))[0][1];
  assert.ok(catalogs.en[id].includes("MEA Pack&Ship"));
  assert.ok(catalogs.ar[id].startsWith("ساعات العمل"));
  const phone = document.querySelector('a[href^="tel:"] bdi');
  assert.equal(phone.dir, "ltr");
  assert.equal(phone.textContent, "(708) 432-5600");
});

test('language share pages expose localized metadata and an image without JavaScript', () => {
  for (const lang of ['ar', 'es']) {
    const {document} = parseHTML(fs.readFileSync(path.join(root, 'public', lang + '.html'), 'utf8'));
    assert.equal(document.documentElement.lang, lang);
    assert.equal(document.documentElement.dir, lang === 'ar' ? 'rtl' : 'ltr');
    assert.equal(document.querySelector('meta[property="og:url"]').content, 'https://cubicship.com/' + lang);
    assert.equal(document.querySelector('link[rel="canonical"]').href, 'https://cubicship.com/' + lang);
    const title = document.querySelector('meta[property="og:title"]').content;
    assert.match(title, lang === 'ar' ? /[\u0600-\u06ff]/ : /Envíos/);
    assert.ok(document.querySelector('meta[property="og:description"]').content);
    const image = document.querySelector('meta[property="og:image"]').content;
    assert.ok(fs.existsSync(path.join(root, 'public', new URL(image).pathname)));
    assert.equal(document.querySelector('meta[name="twitter:image"]').content, image);
    assert.equal(document.querySelector('[data-language-picker] option[selected]').value, lang);
  }
});

test('explicit share paths take precedence over saved language, but picker query can override them', () => {
  assert.equal(resolveLanguage(null, 'en', ['en'], '/ar'), 'ar');
  assert.equal(resolveLanguage(null, 'ar', ['ar'], '/es.html'), 'es');
  assert.equal(resolveLanguage('en', 'ar', ['ar'], '/es'), 'en');
  assert.equal(resolveLanguage(null, 'es', ['ar'], '/ship.html'), 'es');
});

test('pretranslated share pages switch back to English without leaving translated copy behind', () => {
  for (const lang of ['ar', 'es']) {
    const {document,window} = parseHTML(fs.readFileSync(path.join(root,'public',lang+'.html'),'utf8'));
    document.querySelector('[data-language-picker]').remove();
    const win = {document,location:new URL('https://cubicship.com/'+lang),navigator:{languages:['en']},localStorage:{getItem:()=> 'en',setItem(){}},history:{replaceState(){}},CubicCatalog:ctx.window.CubicCatalog};
    vm.runInNewContext(fs.readFileSync(path.join(root,'i18n.js'),'utf8'),{window:win,URL,URLSearchParams,Intl,MutationObserver:window.MutationObserver,CustomEvent:window.CustomEvent});
    assert.equal(document.documentElement.lang,lang);
    win.CubicI18n.setLanguage('en');
    for(const el of document.querySelectorAll('[data-i18n-text]')) {
      for(const [index,id] of JSON.parse(el.getAttribute('data-i18n-text'))) {
        assert.equal(el.childNodes[index].textContent.trim(),catalogs.en[id],id);
      }
    }
    assert.equal(document.querySelector('meta[property="og:title"]').content,'DHL Express Shipping & Business Services | CubicShip');
  }
});
