(function () {
  "use strict";
  const radians = (degrees) => degrees * Math.PI / 180;
  function milesBetween(lat1, lng1, lat2, lng2) {
    const dLat = radians(lat2 - lat1), dLng = radians(lng2 - lng1);
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(radians(lat1)) * Math.cos(radians(lat2)) * Math.sin(dLng / 2) ** 2;
    return 3958.7613 * 2 * Math.atan2(Math.sqrt(Math.min(1, a)), Math.sqrt(Math.max(0, 1 - a)));
  }
  function validPoint(lat, lng) {
    return Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;
  }
  function rankCounters(counters, lat, lng) {
    if (!validPoint(lat, lng)) return [];
    return counters.filter((c) => !c.closed && validPoint(c.lat, c.lng))
      .map((c) => ({ ...c, miles: milesBetween(lat, lng, c.lat, c.lng) }))
      .sort((a, b) => a.miles - b.miles || a.order - b.order);
  }

  const states = { illinois: "il", michigan: "mi", "new york": "ny", pennsylvania: "pa", "new jersey": "nj", wisconsin: "wi", indiana: "in", ohio: "oh" };
  function searchTerms(query) {
    let q = query.trim().toLowerCase();
    Object.entries(states).forEach(([name, code]) => { q = q.replace(new RegExp("\\b" + name + "\\b", "g"), code); });
    return q.split(/[\s,]+/).filter(Boolean);
  }
  function init(doc, browser) {
    const input = doc.getElementById("locationSearch");
    if (!input) return;
    const get = (id) => doc.getElementById(id);
    const list = get("locations"), nearestList = get("nearestLocations"), nearest = get("nearestSection"), otherHeading = get("otherHeading");
    const status = get("finderStatus"), count = get("locationCount"), empty = get("emptyLocations"), button = get("useLocation");
    const counters = [...doc.querySelectorAll("[data-search]")].map((card, order) => ({
      card, order, id: card.dataset.id, closed: card.dataset.closed === "true",
      lat: card.dataset.lat === undefined ? NaN : Number(card.dataset.lat),
      lng: card.dataset.lng === undefined ? NaN : Number(card.dataset.lng),
    }));
    let generation = 0, zipPromise;
    const bindings = new Map();
    const t = (source, params = {}) => browser.CubicI18n?.t(source, params) || source.replace(/\{(\w+)\}/g, (_, key) => String(params[key] ?? ""));
    function render(node, value) {
      const read = typeof value === "function" ? value : () => t(value);
      bindings.set(node, read);
      node.setAttribute?.("translate", "no");
      node.textContent = read();
    }
    doc.addEventListener?.("cubic:languagechange", () => bindings.forEach((read, node) => { node.textContent = read(); }));
    const distanceLabel = (miles) => miles < 0.1 ? t("less than 0.1 mi") : t("about {miles} mi", { miles: miles < 10 ? miles.toFixed(1) : Math.round(miles) });
    const visibleCount = () => counters.filter(({card}) => !card.hidden).length;
    const browseMessage = (query) => () => t(query ? "{count} locations matching your search." : "{count} locations available to browse.", { count: visibleCount() });
    function message(text = "") { render(status, text); status.hidden = !text; }
    function idle() { button.disabled = false; render(button, "Use my location"); }
    function restore() {
      nearest.hidden = true;
      otherHeading.hidden = true;
      counters.forEach(({ card }) => {
        list.appendChild(card);
        card.hidden = false;
        const distance = card.querySelector("[data-distance]");
        render(distance, "");
        distance.hidden = true;
      });
    }
    function filter(q) {
      restore();
      const terms = searchTerms(q);
      let visible = 0;
      counters.forEach(({ card }) => {
        card.hidden = !terms.every((term) => Object.values(states).includes(term)
          ? card.dataset.search.split(/[\s,]+/).includes(term)
          : card.dataset.search.includes(term));
        if (!card.hidden) visible++;
      });
      render(count, () => t(visible === 1 ? "{count} location" : "{count} locations", { count: visible }));
      empty.hidden = visible !== 0;
    }
    function showNearest(lat, lng, zip = null, extra = "") {
      const ranked = rankCounters(counters, lat, lng);
      if (!ranked.length) { filter(""); message("Distance results are unavailable. Browse the locations below."); return; }
      restore();
      ranked.forEach((c, i) => {
        (i < 3 ? nearestList : list).appendChild(c.card);
        const distance = c.card.querySelector("[data-distance]");
        render(distance, () => t(zip ? "{distance} · straight line from ZIP {zip}’s approximate center" : "{distance} · straight line from your location", { distance: distanceLabel(c.miles), ...(zip ? {zip} : {}) }));
        distance.hidden = false;
      });
      // Unranked/closed counters remain visible after the ranked locations.
      const ids = new Set(ranked.map((c) => c.id));
      counters.filter((c) => !ids.has(c.id)).forEach((c) => list.appendChild(c.card));
      nearest.hidden = false;
      otherHeading.hidden = counters.length <= 3;
      empty.hidden = true;
      render(count, () => t("{count} counters sorted by distance.", {count: ranked.length}));
      message(() => [ranked[0].miles > 50 ? t("The closest listed counter is {distance} away.", {distance: distanceLabel(ranked[0].miles)}) : "", zip ? t("Closest counters from ZIP {zip}’s approximate center.", {zip}) : t("Closest counters from your location."), extra ? t(extra) : ""].filter(Boolean).join(" "));
    }
    function loadZips() {
      if (!zipPromise) {
        const controller = new browser.AbortController();
        const timeout = browser.setTimeout(() => controller.abort(), 10000);
        zipPromise = browser.fetch("/assets/zip-centroids.json", { signal: controller.signal })
          .then((response) => { if (!response.ok) throw new Error("ZIP data unavailable"); return response.json(); })
          .then((data) => { if (!data.points) throw new Error("Invalid ZIP data"); return data.points; })
          .catch((error) => { zipPromise = undefined; throw error; })
          .finally(() => browser.clearTimeout(timeout));
      }
      return zipPromise;
    }
    async function search() {
      const request = ++generation, q = input.value.trim();
      idle();
      message();
      filter(q);
      if (!/^\d{5}$/.test(q)) { message(browseMessage(q)); return; }
      message(() => t("Finding counters near ZIP {zip}…", {zip: q}));
      try {
        const points = await loadZips();
        if (request !== generation) return;
        const point = points[q];
        if (!Array.isArray(point) || !validPoint(point[0], point[1])) {
          message("We could not locate that ZIP area. Showing any matching addresses. Try your city or state, or Use my location.");
          return;
        }
        showNearest(point[0], point[1], q);
      } catch (_) {
        if (request !== generation) return;
        message("ZIP distances could not load. Showing any matching addresses. Try your city or state, or Use my location.");
      }
    }
    input.addEventListener("input", search);
    get("clearLocations").addEventListener("click", () => {
      ++generation;
      idle(); input.value = ""; filter(""); message(browseMessage("")); input.focus();
    });
    button.addEventListener("click", () => {
      const request = ++generation;
      restore(); filter(input.value.trim());
      if (!browser.navigator.geolocation) {
        message("Location is not available in this browser. Enter a ZIP code, city or state instead."); return;
      }
      button.disabled = true; render(button, "Finding your location…");
      message("Your browser may ask to use your location. You can also search by ZIP code, city or state.");
      const failed = (error) => {
        if (request !== generation) return;
        idle();
        message(error.code === 1 ? "Location access was not allowed. Enter a ZIP code, city or state instead." : "We could not get your location. Enter a ZIP code, city or state, or try again.");
      };
      try {
        browser.navigator.geolocation.getCurrentPosition((position) => {
          if (request !== generation) return;
          const { latitude, longitude, accuracy } = position.coords;
          if (!validPoint(latitude, longitude)) { failed({}); return; }
          idle(); input.value = "";
          showNearest(latitude, longitude, null, accuracy > 5000 ? "Your device’s location is approximate; a ZIP code may give more useful results." : "");
        }, failed, { enableHighAccuracy: false, timeout: 10000, maximumAge: 60000 });
      } catch (_) { failed({}); }
    });
    get("finderControls").hidden = false;
    filter("");
  }
  if (typeof module !== "undefined" && module.exports) module.exports = { milesBetween, rankCounters, searchTerms, init };
  if (typeof window !== "undefined") window.CubicLocationSearch = { milesBetween, rankCounters, validPoint };
  if (typeof document !== "undefined") init(document, window);
})();
