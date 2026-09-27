(function () {
  "use strict";
  const DEVICE_KEY = "cubicship:shipping-zip";
  const validZip = (value) => /^\d{5}$/.test(String(value || "").trim());
  function init(doc, browser, locations) {
    const select = doc.getElementById("locationId");
    if (!select || doc.getElementById("nearbyPicker")) return;
    select.parentElement.classList.add("nearby-field");
    const root = doc.createElement("div");
    root.id = "nearbyPicker";
    root.className = "nearby-picker";
    root.setAttribute("translate", "no");
    root.innerHTML = `<div class="nearby-controls"><div class="nearby-zip"><label for="nearbyZip" data-copy="Your US ZIP code"></label><div class="nearby-zip-row"><input id="nearbyZip" type="text" inputmode="numeric" autocomplete="postal-code" maxlength="5" dir="ltr"><button type="button" id="nearbyFind" data-copy="Find nearby"></button></div></div><button type="button" id="nearbyGeo" data-copy="Use my location"></button></div><p class="nearby-note" data-copy="Location access is optional. Your precise location stays in your browser."></p><p id="nearbyStatus" class="nearby-note" role="status" aria-live="polite" hidden></p><div id="nearbyResults" class="nearby-results"></div><div class="nearby-memory"><button type="button" id="nearbySave" disabled></button><button type="button" id="nearbyForget" data-copy="Forget saved ZIP" hidden></button><span id="nearbySaved" class="nearby-note" role="status" aria-live="polite"></span></div><p class="nearby-all" data-copy="Or choose from all locations"></p>`;
    select.before(root);
    const get = (id) => doc.getElementById(id);
    const zip = get("nearbyZip"), geo = get("nearbyGeo"), save = get("nearbySave"), forget = get("nearbyForget");
    const status = get("nearbyStatus"), memory = get("nearbySaved"), results = get("nearbyResults");
    let generation = 0, preferenceGeneration = 0, pointsPromise, ranked = [], sourceZip = "";
    let account = null, savedZip = "", busy = false, locating = false, autoOrigin = "";
    let statusCopy = "", statusParams = {}, memoryCopy = "";
    const t = (source, params = {}) => browser.CubicI18n?.t(source, params) || source.replace(/\{(\w+)\}/g, (_, key) => String(params[key] ?? ""));
    const text = (node, source, params) => { node.textContent = t(source, params); };
    function announce(source = "", params = {}) { statusCopy = source; statusParams = params; text(status, source, params); status.hidden = !source; }
    function savedMessage(source = "") { memoryCopy = source; text(memory, source); }
    const distance = (miles) => t("about {miles} mi", { miles: miles < 10 ? miles.toFixed(1) : Math.round(miles) });
    function renderMemory() {
      text(save, account ? "Save ZIP to my account" : "Save ZIP on this device");
      save.disabled = account === null || busy || !validZip(zip.value);
      forget.hidden = !savedZip;
      forget.disabled = busy;
    }
    function renderResults() {
      results.replaceChildren();
      ranked.slice(0, 3).forEach((branch) => {
        const button = doc.createElement("button");
        button.type = "button";
        button.className = "nearby-card";
        button.dataset.locationId = branch.id;
        button.setAttribute("aria-pressed", String(select.value === branch.id));
        const name = doc.createElement("strong"), address = doc.createElement("span"), miles = doc.createElement("span"), action = doc.createElement("span");
        name.textContent = branch.city + ", " + branch.state;
        address.textContent = branch.address;
        name.dir = address.dir = "ltr";
        miles.className = "nearby-distance";
        text(miles, sourceZip ? "{distance} · straight line from ZIP {zip}’s approximate center" : "{distance} · straight line from your location", { distance: distance(branch.miles), zip: sourceZip });
        action.className = "nearby-choice";
        text(action, select.value === branch.id ? "Selected location" : "Choose this location");
        button.append(name, address, miles, action);
        button.addEventListener("click", () => {
          select.value = branch.id;
          select.dispatchEvent(new browser.Event("change", { bubbles: true }));
        });
        results.append(button);
      });
    }
    function render() {
      root.querySelectorAll("[data-copy]").forEach((el) => text(el, el.dataset.copy));
      text(geo, locating ? "Finding your location…" : "Use my location");
      announce(statusCopy, statusParams); savedMessage(memoryCopy); renderMemory(); renderResults();
    }
    function cancel() { ++generation; locating = false; geo.disabled = false; text(geo, "Use my location"); }
    function rank(lat, lng, fromZip = "", approximate = false) {
      sourceZip = fromZip;
      // Limit suggestions to counters the existing request form can actually use.
      const options = new Set([...select.options].map((option) => option.value));
      ranked = browser.CubicLocationSearch.rankCounters(locations.filter((l) => !l.openingSoon && options.has(l.id)), lat, lng);
      renderResults();
      if (!ranked.length) announce("Distance results are unavailable. Browse the locations below.");
      else if (ranked[0].miles > 50) announce("The closest listed counter is {distance} away.", { distance: distance(ranked[0].miles) });
      else if (approximate) announce("Your device’s location is approximate; a ZIP code may give more useful results.");
      else announce("Choose a location below. You can change it anytime.");
    }
    function loadPoints() {
      if (!pointsPromise) {
        const controller = new browser.AbortController();
        const timeout = browser.setTimeout(() => controller.abort(), 10000);
        pointsPromise = browser.fetch("/assets/zip-centroids.json", { signal: controller.signal })
          .then((r) => { if (!r.ok) throw Error(); return r.json(); })
          .then((data) => { if (!data.points) throw Error(); return data.points; })
          .catch((e) => { pointsPromise = undefined; throw e; })
          .finally(() => browser.clearTimeout(timeout));
      }
      return pointsPromise;
    }
    async function find() {
      cancel();
      const request = generation, value = zip.value.trim();
      ranked = []; renderResults();
      if (!validZip(value)) { announce("Enter a five-digit US ZIP code."); zip.focus(); return; }
      announce("Finding counters near ZIP {zip}…", { zip: value });
      try {
        const points = await loadPoints();
        if (request !== generation) return;
        const point = points[value];
        if (!Array.isArray(point) || !browser.CubicLocationSearch.validPoint(...point)) {
          announce("We could not locate that ZIP. Check it or choose from all locations."); return;
        }
        rank(...point, value);
        const origin = get("senderPostal");
        if (origin && (!origin.value || origin.value === autoOrigin)) { origin.value = value; autoOrigin = value; }
      } catch {
        if (request === generation) announce("Nearby locations could not load. Choose from all locations or try again.");
      }
    }
    get("senderPostal")?.addEventListener("input", () => { autoOrigin = ""; });
    zip.addEventListener("input", () => { cancel(); ranked = []; renderResults(); announce(); renderMemory(); });
    zip.addEventListener("keydown", (event) => { if (event.key === "Enter") { event.preventDefault(); find(); } });
    get("nearbyFind").addEventListener("click", find);
    select.addEventListener("change", renderResults);
    geo.addEventListener("click", () => {
      cancel();
      const request = generation;
      if (!browser.navigator.geolocation) { announce("Location is not available in this browser. Enter a ZIP code, city or state instead."); return; }
      locating = true; geo.disabled = true; text(geo, "Finding your location…");
      announce("Allow location access to see nearby options, or enter your ZIP code.");
      const failed = (error) => {
        if (request !== generation) return;
        cancel();
        announce(error.code === 1 ? "Location access was not allowed. Enter your ZIP code or choose from all locations." : "We could not get your location. Enter your ZIP code or try again.");
      };
      try {
        browser.navigator.geolocation.getCurrentPosition((position) => {
          if (request !== generation) return;
          const { latitude, longitude, accuracy } = position.coords;
          if (!browser.CubicLocationSearch.validPoint(latitude, longitude)) { failed({}); return; }
          cancel(); rank(latitude, longitude, "", accuracy > 5000);
        }, failed, { enableHighAccuracy: false, timeout: 10000, maximumAge: 60000 });
      } catch { failed({}); }
    });
    async function loadPreference(reset = false) {
      const request = ++preferenceGeneration;
      if (reset) {
        cancel(); zip.value = ""; ranked = []; sourceZip = ""; savedZip = "";
        const origin = get("senderPostal");
        if (autoOrigin && origin?.value === autoOrigin) origin.value = "";
        autoOrigin = "";
        announce(); savedMessage(); renderResults();
      }
      const searchAtStart = generation;
      account = null; renderMemory();
      try {
        const response = await browser.fetch("/api/customer-me?preferences=shipping", { credentials: "same-origin", cache: "no-store" });
        if (request !== preferenceGeneration) return;
        if (response.status === 401) {
          account = false;
          try { savedZip = browser.localStorage.getItem(DEVICE_KEY) || ""; } catch { savedZip = ""; }
        } else {
          if (!response.ok) throw Error();
          const data = await response.json();
          if (request !== preferenceGeneration) return;
          account = true; savedZip = data.preferences?.zip || "";
        }
        if (!validZip(savedZip)) savedZip = "";
        if (savedZip && generation === searchAtStart && !zip.value) {
          zip.value = savedZip;
          savedMessage(account ? "Using your account’s saved ZIP." : "Using the ZIP saved on this device.");
          await find();
        }
      } catch {
        if (request === preferenceGeneration) { account = null; savedMessage("Saved ZIP is unavailable. You can still choose a location."); }
      }
      if (request === preferenceGeneration) renderMemory();
    }
    async function persist(clear = false) {
      if (account === null || busy) return;
      const value = clear ? "" : zip.value.trim(), owner = preferenceGeneration;
      if (!clear && !validZip(value)) { announce("Enter a five-digit US ZIP code."); return; }
      busy = true; renderMemory();
      try {
        if (account) {
          const response = await browser.fetch("/api/customer-me", { method: "PATCH", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ zip: value }) });
          if (!response.ok) throw Error();
        } else if (clear) browser.localStorage.removeItem(DEVICE_KEY);
        else browser.localStorage.setItem(DEVICE_KEY, value);
        if (owner !== preferenceGeneration) return;
        savedZip = value;
        savedMessage(clear ? "Saved ZIP removed." : account ? "ZIP saved to your account." : "ZIP saved on this device.");
      } catch {
        if (owner === preferenceGeneration) savedMessage("We could not save your ZIP. You can still choose a location.");
      } finally { busy = false; renderMemory(); }
    }
    save.addEventListener("click", () => persist());
    forget.addEventListener("click", () => persist(true));
    doc.addEventListener("cubic:languagechange", render);
    doc.addEventListener("cubic:customerchange", () => loadPreference(account !== null));
    render(); loadPreference();
    return { find, loadPreference };
  }
  if (typeof module !== "undefined" && module.exports) module.exports = { init, validZip };
  if (typeof window !== "undefined") {
    window.CubicLocationPicker = { init: (locations) => init(document, window, locations) };
    if (!document.getElementById("shippingForm") && document.getElementById("locationId")) {
      fetch("/assets/locations.json").then((r) => { if (!r.ok) throw Error(); return r.json(); })
        .then((locations) => window.CubicLocationPicker.init(locations)).catch(() => {});
    }
  }
})();
