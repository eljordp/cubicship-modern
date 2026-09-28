/* Existing Google Analytics + first-party aggregate counters. Never send customer fields. */
(function () {
  "use strict";
  if (window.CubicAnalytics) return;
  const languages = new Set(["en", "es", "ar", "pl", "hi", "gu", "ur", "zh-Hans", "fil", "bn", "my", "uk", "vi", "ht", "fr", "yo", "ig", "ha"]);
  const branches = new Set(["dearborn", "oak-park", "bridgeview", "oak-lawn", "buffalo", "bethpage", "iselin", "milwaukee", "wyncote", "indianapolis", "allentown-pa", "farmington", "northeast-philadelphia", "freeport", "cleveland"]);
  const events = new Set(["page_view", "ship_click", "quote_click", "service_click", "locations_click", "call_click", "email_click", "directions_click", "freight_click", "account_click", "track_click", "language_change", "location_selected", "finder_search", "finder_geolocation", "form_start", "form_step", "shipment_step_1", "shipment_step_2", "shipment_step_3", "form_invalid", "form_submit_attempt", "form_error", "chat_open", "chat_handoff", "callback_open", "callback_dismiss"]);
  const lang = () => {
    const value = window.CubicI18n?.language || document.documentElement.lang;
    return languages.has(value) ? value : "en";
  };
  const safeBranch = value => branches.has(value) ? value : "";
  const attribution = () => {
    let o = {};
    try {
      const q = new URLSearchParams(location.search);
      for (const k of ["source", "medium", "campaign"]) {
        const v = q.get("utm_" + k);
        if (v && /^[\w .-]{1,80}$/.test(v) && !/\d{6,}/.test(v)) o[k] = v;
      }
      if (Object.keys(o).length)
        sessionStorage.setItem("cubicAttribution", JSON.stringify(o));
      else o = JSON.parse(sessionStorage.getItem("cubicAttribution") || "{}");
    } catch {}
    return o;
  };
  attribution();
  const measurementId = "G-KQMJQ5RPNG";
  const optedOut = () => navigator.globalPrivacyControl === true || navigator.doNotTrack === "1";
  const googleEnabled = !["localhost", "127.0.0.1", "::1"].includes(location.hostname) && !optedOut();
  function safePageLocation() {
    const url = new URL(location.origin + location.pathname);
    const query = new URLSearchParams(location.search);
    if (/^[a-zA-Z-]{2,12}$/.test(query.get("lang") || "")) url.searchParams.set("lang", query.get("lang"));
    // Preserve ad attribution, without forwarding arbitrary URL fields or private hashes.
    for (const key of ["utm_source", "utm_medium", "utm_campaign", "utm_id", "utm_content", "utm_term"]) {
      const value = query.get(key);
      if (value && /^[\w .-]{1,100}$/.test(value) && !/\d{6,}/.test(value)) url.searchParams.set(key, value);
    }
    for (const key of ["gclid", "dclid", "gbraid", "wbraid", "fbclid"]) {
      const value = query.get(key);
      if (value && /^[a-zA-Z0-9_-]{1,250}$/.test(value)) url.searchParams.set(key, value);
    }
    return url.href;
  }
  function safeReferrer() {
    try { return new URL(document.referrer).origin + "/"; } catch { return ""; }
  }
  if (googleEnabled) {
    window.dataLayer = window.dataLayer || [];
    window.gtag = window.gtag || function () { window.dataLayer.push(arguments); };
    window.gtag("js", new Date());
    window.gtag("config", measurementId, {
      anonymize_ip: true,
      page_location: safePageLocation(),
      page_referrer: safeReferrer()
    });
    const script = document.createElement("script");
    script.async = true;
    script.src = "https://www.googletagmanager.com/gtag/js?id=" + measurementId;
    document.head.appendChild(script);
  }
  function googleEvent(name, params={}) {
    if (!googleEnabled || optedOut()) return;
    window.gtag("event", name, {
      send_to: measurementId, language: lang(),
      page_location: safePageLocation(), page_referrer: safeReferrer(), ...params
    });
  }
  const savedRequests = new Set();
  // Call only after the API confirms durable storage. Never on click/submit/validation.
  function saved(kind, requestId, branch="") {
    if (!["shipping", "service", "email_help", "account_order", "counter_intake"].includes(kind) || !requestId) return;
    const key = "cubicConversion:" + kind + ":" + requestId;
    if (savedRequests.has(key)) return;
    try { if (sessionStorage.getItem(key)) return; } catch {}
    googleEvent("generate_lead", {lead_source:"website", request_type:kind, location_id:safeBranch(branch)});
    savedRequests.add(key);
    try {sessionStorage.setItem(key, "1");} catch {}
  }
  const last = new Map();
  function event(name, branch = "") {
    if (!events.has(name)) return;
    branch = safeBranch(branch);
    if (navigator.globalPrivacyControl === true || navigator.doNotTrack === "1")
      return;
    const key = name + ":" + branch,
      now = Date.now();
    if (now - (last.get(key) || 0) < 1000) return;
    last.set(key, now);
    // GA config owns its page view; do not send a duplicate here.
    if (name !== "page_view") googleEvent(name, {location_id:safeBranch(branch)});
    const body = JSON.stringify({
      event: name,
      page: location.pathname,
      language: lang(),
      branch,
    });
    fetch("/api/crm-event", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
      keepalive: true,
    }).catch(() => {});
  }
  window.CubicAnalytics = { event, attribution, saved };
  event("page_view");
  document.addEventListener("cubic:languagechange", () =>
    event("language_change"),
  );
  const started = new WeakSet();
  document.addEventListener("focusin", (e) => {
    const f = e.target.closest("form");
    if (f && !f.closest("[data-capture]") && !started.has(f)) {
      started.add(f);
      event("form_start");
    }
  });
  document.addEventListener("invalid", () => event("form_invalid"), true);
  document.addEventListener(
    "submit",
    (e) => {
      if (!e.target.closest("[data-capture]")) event("form_submit_attempt");
      if (e.target.id === "chatServiceForm") event("chat_handoff");
    },
    true,
  );
  document.addEventListener("change", (e) => {
    if (e.target.matches("[data-language-picker]")) return;
    if (e.target.matches('#locationId,[name="locationId"]'))
      event("location_selected", e.target.value);
  });
  document.addEventListener("click", (e) => {
    const el = e.target.closest("a,button");
    if (!el) return;
    if (el.id === "useLocation") return event("finder_geolocation");
    if (el.id === "next" || el.id === "back") return event("form_step");
    if (el.matches(".chat-toggle")) return event("chat_open");
    const href = el.getAttribute("href");
    if (!href) return;
    if (href.startsWith("tel:")) return event("call_click");
    if (href.startsWith("mailto:")) return event("email_click");
    let u;
    try {
      u = new URL(href, location.origin);
    } catch {
      return;
    }
    if (/(^|\.)cognitoforms\.com$/.test(u.hostname))
      return event("freight_click");
    if (
      u.hostname === "maps.google.com" ||
      u.hostname === "maps.app.goo.gl" ||
      (u.hostname === "www.google.com" && u.pathname.startsWith("/maps"))
    )
      return event("directions_click");
    if (u.origin !== location.origin) return;
    const names = {
      "/ship.html":
        u.searchParams.get("mode") === "quote" ? "quote_click" : "ship_click",
      "/quote.html": "quote_click",
      "/service-request.html": "service_click",
      "/dhl-locations.html": "locations_click",
      "/profile.html": "account_click",
      "/track.html": "track_click",
    };
    if (names[u.pathname]) event(names[u.pathname]);
  });
  let finderTimer;
  document.addEventListener("input", (e) => {
    if (e.target.id === "locationSearch") {
      clearTimeout(finderTimer);
      finderTimer = setTimeout(() => event("finder_search"), 1000);
    }
  });
})();
