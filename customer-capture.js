(function () {
  "use strict";
  const copies = window.CubicHelpCopy;
  if (!copies) return;
  const language = () =>
    window.CubicI18n?.language || document.documentElement.lang || "en";
  const copy = () => copies[language()] || copies.en;
  const track = (n) => window.CubicAnalytics?.event(n);
  const safeGet = (k) => {
    try {
      return localStorage.getItem(k);
    } catch {
      return null;
    }
  };
  const suppress = (days) => {
    try {
      localStorage.setItem(
        "cubicHelpUntil",
        String(Date.now() + days * 86400000),
      );
    } catch {}
  };
  const path = location.pathname;
  if (path === "/privacy.html") {
    const p = document.createElement("p");
    p.setAttribute("translate", "no");
    p.className = "cs-notice";
    const render = () => {
      p.textContent = copy()[17];
      p.lang = language();
      p.dir = ["ar", "ur"].includes(language()) ? "rtl" : "ltr";
    };
    render();
    document.querySelector("main")?.append(p);
    document.addEventListener("cubic:languagechange", render);
    return;
  }
  // Never interrupt an active request, account, tracking or private status workflow.
  if (
    /(?:ship|service-request|profile|account-help|track|request-status|callback)\.html$/.test(
      path,
    ) ||
    path.startsWith("/auth/")
  )
    return;
  const host = document.createElement("div");
  host.dataset.capture = "";
  host.setAttribute("translate", "no");
  host.innerHTML =
    '<button type="button" class="cs-help-trigger"></button><dialog class="cs-help" aria-labelledby="csHelpTitle"><button type="button" class="cs-help-close">×</button><h2 id="csHelpTitle"></h2><p data-copy="2"></p><form><label><span data-copy="3"></span><input name="name" autocomplete="name" maxlength="100"></label><label><span data-copy="4"></span><input name="email" type="email" autocomplete="email" required maxlength="254" dir="ltr"></label><label><span data-copy="6"></span><select name="branch"><option value="" data-copy="7"></option></select></label><label><span data-copy="5"></span><textarea name="details" rows="2" maxlength="1500"></textarea></label><div hidden aria-hidden="true"><input name="website" tabindex="-1" autocomplete="off"></div><p class="cs-help-small" data-copy="9"></p><label class="cs-help-check"><input name="marketing" type="checkbox"><span data-copy="10"></span></label><a class="cs-help-small" data-privacy href="/privacy.html" data-copy="11"></a><button class="cs-help-submit" type="submit" data-copy="8"></button></form><p role="status" aria-live="polite" class="cs-help-result" hidden></p><button type="button" class="cs-help-optout" hidden data-copy="15"></button></dialog>';
  document.body.append(host);
  const dialog = host.querySelector("dialog"),
    form = host.querySelector("form"),
    trigger = host.querySelector(".cs-help-trigger"),
    close = host.querySelector(".cs-help-close"),
    result = host.querySelector('[role="status"]'),
    optout = host.querySelector(".cs-help-optout");
  let statusIndex = null,
    token = "",
    requestId = crypto.randomUUID(),
    lastFocus = null,
    submitted = false;
  function render() {
    const c = copy();
    host.lang = language();
    host.dir = ["ar", "ur"].includes(language()) ? "rtl" : "ltr";
    trigger.textContent = c[0];
    host.querySelector("h2").textContent = c[1];
    close.setAttribute("aria-label", c[14]);
    host
      .querySelectorAll("[data-copy]")
      .forEach((el) => (el.textContent = c[Number(el.dataset.copy)]));
    host.querySelector("[data-privacy]").href =
      "/privacy.html?lang=" + encodeURIComponent(language());
    if (statusIndex !== null) result.textContent = c[statusIndex];
  }
  render();
  document.addEventListener("cubic:languagechange", render);
  fetch("/assets/locations.json")
    .then((r) => r.json())
    .then((rows) => {
      for (const l of rows.filter((x) => !x.openingSoon && !x.closed)) {
        const o = document.createElement("option");
        o.value = l.id;
        o.textContent = l.city + ", " + l.state;
        form.elements.branch.append(o);
      }
    })
    .catch(() => {});
  function open(manual) {
    if (dialog.open) return;
    if (
      !manual &&
      (Date.now() < Number(safeGet("cubicHelpUntil")) ||
        document.querySelector(
          "dialog[open],input:focus,textarea:focus,select:focus",
        ))
    )
      return;
    lastFocus = document.activeElement;
    dialog.showModal();
    track("callback_open");
  }
  function dismiss() {
    dialog.close();
    suppress(submitted ? 90 : 30);
    track("callback_dismiss");
    lastFocus?.focus();
  }
  trigger.addEventListener("click", () => open(true));
  close.addEventListener("click", dismiss);
  dialog.addEventListener("cancel", (e) => {
    e.preventDefault();
    dismiss();
  });
  dialog.addEventListener("click", (e) => {
    if (e.target === dialog) {
      const r = dialog.getBoundingClientRect();
      if (
        e.clientX < r.left ||
        e.clientX > r.right ||
        e.clientY < r.top ||
        e.clientY > r.bottom
      )
        dismiss();
    }
  });
  let ready = false;
  function reveal() {
    if (ready && window.scrollY > 600 && !submitted) {
      open(false);
      window.removeEventListener("scroll", reveal);
    }
  }
  window.addEventListener("scroll", reveal, { passive: true });
  setTimeout(() => {
    ready = true;
    reveal();
  }, 30000);
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!form.reportValidity()) return;
    const button = form.querySelector('[type="submit"]');
    button.disabled = true;
    form.setAttribute("aria-busy", "true");
    try {
      const b = Object.fromEntries(new FormData(form));
      Object.assign(b, {
        requestId,
        language: language(),
        purpose: "service_follow_up",
        marketing: form.elements.marketing.checked,
        attribution: window.CubicAnalytics?.attribution() || {},
      });
      const r = await fetch("/api/crm-lead", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(b),
      });
      const data = await r.json();
      if (!r.ok || !data.ok) throw new Error("save");
      token = data.preferencesToken || "";
      if (token && !b.website) window.CubicAnalytics?.saved("email_help", requestId, b.branch || "");
      submitted = true;
      statusIndex = 12;
      form.hidden = true;
      optout.hidden = !b.marketing || !token;
      suppress(90);
    } catch {
      statusIndex = 13;
      track("form_error");
    } finally {
      result.hidden = false;
      render();
      button.disabled = false;
      form.removeAttribute("aria-busy");
    }
  });
  optout.addEventListener("click", async () => {
    optout.disabled = true;
    try {
      const r = await fetch("/api/crm-unsubscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      if (!r.ok) throw new Error("save");
      statusIndex = 16;
      optout.hidden = true;
    } catch {
      statusIndex = 13;
    } finally {
      optout.disabled = false;
      render();
    }
  });
})();
