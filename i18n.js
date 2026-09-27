(function (root) {
  "use strict";
  const supported = ["en", "es", "ar"];
  const normalize = (s) =>
    String(s || "")
      .replace(/\s+/g, " ")
      .trim();
  const base = (value) =>
    String(value || "")
      .toLowerCase()
      .split(/[-_]/)[0];
  function resolveLanguage(explicit, saved, languages = [], pathname = "") {
    const pathLanguage = pathname.match(/^\/(ar|es)(?:\.html)?\/?$/)?.[1];
    for (const value of [explicit, pathLanguage, saved, ...languages]) {
      const lang = base(value);
      if (supported.includes(lang)) return lang;
    }
    return "en";
  }
  if (typeof module === "object" && module.exports)
    module.exports = { resolveLanguage };
  if (!root.document || !root.CubicCatalog) return;
  const { document } = root,
    { catalogs, sourceKeys } = root.CubicCatalog;
  let saved;
  try {
    saved = root.localStorage.getItem("cubicship.language");
  } catch {}
  let locale = resolveLanguage(
    new URLSearchParams(root.location.search).get("lang"),
    saved,
    root.navigator.languages || [root.navigator.language],
    root.location.pathname,
  );
  const skip =
    'script,style,svg,code,pre,textarea,input,address,[translate="no"],[data-no-translate],.cs-brand,.chat-message.user';
  const textState = new WeakMap(),
    attrState = new WeakMap(),
    boundMessages = new WeakMap(),
    messageSlots = new WeakMap();
  function message(id, params = {}) {
    const text = Object.hasOwn(catalogs[locale], id)
      ? catalogs[locale][id]
      : Object.hasOwn(catalogs.en, id)
        ? catalogs.en[id]
        : String(id);
    return text.replace(/\{(\w+)\}/g, (_, name) =>
      params[name] === undefined
        ? "{" + name + "}"
        : "\u2068" + String(params[name]) + "\u2069",
    );
  }
  function t(source, params = {}) {
    return message(keyFor(source) || source, params);
  }
  function keyFor(source) {
    const s = normalize(source).toLowerCase();
    return Object.hasOwn(sourceKeys, s) ? sourceKeys[s] : undefined;
  }
  function text(node, id) {
    const current = node.textContent;
    let state = textState.get(node);
    // A later app update may replace the text inside an existing translated node.
    if (state && current !== state.rendered) {
      state = null;
      id = keyFor(current);
    }
    if (!state) {
      id =
        keyFor(current) ||
        (id &&
        Object.values(catalogs).some(catalog => normalize(current).toLowerCase() === normalize(catalog[id]).toLowerCase())
          ? id
          : null);
      if (!id) return;
      state = { id, original: catalogs.en[id] ? current.replace(current.trim(), catalogs.en[id]) : current };
    }
    const rendered =
      locale === "en"
        ? state.original
        : state.original.replace(state.original.trim(), message(state.id));
    state.rendered = rendered;
    textState.set(node, state);
    if (current !== rendered) node.textContent = rendered;
  }
  function attributes(el) {
    const configured = JSON.parse(el.getAttribute("data-i18n-attrs") || "{}");
    let states = attrState.get(el);
    if (!states) {
      states = {};
      attrState.set(el, states);
    }
    for (const name of [
      "placeholder",
      "aria-label",
      "title",
      "alt",
      ...(configured.content ? ["content"] : []),
    ]) {
      const current = el.getAttribute(name);
      if (current === null) continue;
      let state = states[name];
      if (state && state.rendered !== current) state = null;
      if (!state) {
        const id = keyFor(current) || configured[name];
        if (!id) continue;
        state = { id, original: catalogs.en[id] ? current.replace(current.trim(), catalogs.en[id]) : current };
      }
      const rendered = locale === "en" ? state.original : message(state.id);
      state.rendered = rendered;
      states[name] = state;
      if (current !== rendered) el.setAttribute(name, rendered);
    }
  }
  function renderContextual(el) {
    const id = el.getAttribute("data-i18n-message");
    if (!Object.hasOwn(catalogs[locale], id)) return false;
    let slots = messageSlots.get(el);
    if (!slots) {
      slots = {};
      for (const child of el.querySelectorAll("[data-i18n-slot]"))
        slots[child.getAttribute("data-i18n-slot")] = child;
      messageSlots.set(el, slots);
    }
    const nodes = catalogs[locale][id]
      .split(/(\{\w+\})/)
      .filter(Boolean)
      .map((part) =>
        slots[part.slice(1, -1)] && /^\{\w+\}$/.test(part)
          ? slots[part.slice(1, -1)]
          : document.createTextNode(part),
      );
    el.replaceChildren(...nodes);
    for (const slot of Object.values(slots)) translate(slot);
    return true;
  }
  function translate(scope) {
    const bound = boundMessages.get(scope);
    if (bound) {
      scope.textContent = t(bound.source, bound.params);
      return;
    }
    if (scope.nodeType === 3) {
      if (!scope.parentElement?.closest(skip)) text(scope);
      return;
    }
    if (scope.nodeType === 1 && /^(INPUT|TEXTAREA)$/.test(scope.tagName)) {
      attributes(scope);
      return;
    }
    if (scope.nodeType === 1 && scope.closest(skip)) return;
    if (scope.nodeType === 1) {
      if (scope.hasAttribute("data-i18n-message") && renderContextual(scope))
        return;
      attributes(scope);
      if (scope.tagName === "OPTION" && !scope.hasAttribute("value"))
        scope.setAttribute("value", scope.textContent);
      const mappings = JSON.parse(scope.getAttribute("data-i18n-text") || "[]");
      for (const [i, id] of mappings)
        if (scope.childNodes[i]?.nodeType === 3) text(scope.childNodes[i], id);
    }
    for (const child of [...(scope.childNodes || [])]) translate(child);
  }
  function setDocumentLanguage() {
    document.documentElement.lang = locale;
    document.documentElement.dir = locale === "ar" ? "rtl" : "ltr";
  }
  function localizeLinks() {
    for (const a of document.querySelectorAll("a[href]")) {
      const url = new URL(a.getAttribute("href"), root.location.href);
      if (
        url.origin !== root.location.origin ||
        url.pathname.startsWith("/api/") ||
        !/(\.html$|\/$)/.test(url.pathname)
      )
        continue;
      url.searchParams.set("lang", locale);
      a.setAttribute("href", url.pathname + url.search + url.hash);
    }
  }
  function apply() {
    observer?.disconnect();
    setDocumentLanguage();
    translate(document);
    for (const picker of document.querySelectorAll("[data-language-picker]"))
      picker.value = locale;
    localizeLinks();
    observe();
  }
  function setLanguage(value) {
    if (!supported.includes(value)) return;
    locale = value;
    try {
      root.localStorage.setItem("cubicship.language", locale);
    } catch {}
    const url = new URL(root.location.href);
    url.searchParams.set("lang", locale);
    root.history.replaceState(null, "", url.pathname + url.search + url.hash);
    apply();
    document.dispatchEvent(
      new CustomEvent("cubic:languagechange", { detail: { language: locale } }),
    );
  }
  let observer;
  function observe() {
    observer?.observe(document.documentElement, {
      subtree: true,
      childList: true,
      characterData: true,
      attributes: true,
      attributeFilter: ["placeholder", "aria-label", "title", "alt", "href"],
    });
  }
  function setText(el, source, params = {}) {
    boundMessages.set(el, { source, params });
    el.setAttribute("translate", "no");
    el.textContent = t(source, params);
  }
  root.CubicI18n = {
    t,
    message,
    setText,
    setLanguage,
    get language() {
      return locale;
    },
    formatDate(value, options) {
      return new Intl.DateTimeFormat(locale, options).format(new Date(value));
    },
  };
  setDocumentLanguage();
  function boot() {
    observer = new MutationObserver((records) => {
      observer.disconnect();
      for (const record of records) {
        if (record.type === "childList")
          for (const node of record.addedNodes) translate(node);
        else translate(record.target);
      }
      localizeLinks();
      observe();
    });
    document.addEventListener("change", (e) => {
      if (e.target.matches("[data-language-picker]"))
        setLanguage(e.target.value);
    });
    // Native browser validation follows the browser locale, not the chosen site locale.
    // Set only presentation messages; validity constraints and submitted values stay unchanged.
    document.addEventListener(
      "invalid",
      (event) => {
        const field = event.target,
          v = field.validity;
        if (!v || v.customError) return;
        let source = "Please enter a valid value.";
        if (v.valueMissing)
          source =
            field.type === "checkbox"
              ? "Please check this box to continue."
              : field.tagName === "SELECT" || field.type === "radio"
                ? "Please choose an option."
                : "Please complete this field.";
        else if (v.typeMismatch && field.type === "email")
          source = "Enter a valid email address.";
        else if (
          v.rangeUnderflow ||
          v.rangeOverflow ||
          v.stepMismatch ||
          v.badInput
        )
          source = "Please enter a valid number within the allowed range.";
        field.dataset.localeValidity = source;
        field.setCustomValidity(t(source));
      },
      true,
    );
    function clearLocaleValidity(event) {
      const field = event.target;
      const fields =
        field.type === "radio"
          ? [...document.querySelectorAll('input[type="radio"]')].filter(
              (x) => x.name === field.name && x.form === field.form,
            )
          : [field];
      for (const input of fields)
        if (input.dataset?.localeValidity) {
          input.setCustomValidity("");
          delete input.dataset.localeValidity;
        }
    }
    document.addEventListener("input", clearLocaleValidity, true);
    document.addEventListener("change", clearLocaleValidity, true);
    document.addEventListener(
      "reset",
      (event) => {
        for (const field of event.target.querySelectorAll(
          "[data-locale-validity]",
        )) {
          field.setCustomValidity("");
          delete field.dataset.localeValidity;
        }
      },
      true,
    );
    document.addEventListener("cubic:languagechange", () => {
      for (const field of document.querySelectorAll("[data-locale-validity]"))
        field.setCustomValidity(t(field.dataset.localeValidity));
    });
    apply();
  }
  if (document.readyState === "loading")
    document.addEventListener("DOMContentLoaded", boot, { once: true });
  else boot();
})(typeof window === "undefined" ? globalThis : window);
