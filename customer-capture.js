(function () {
  "use strict";
  const copies = window.CubicHelpCopy;
  if (!copies) return;
  const language = () =>
    window.CubicI18n?.language || document.documentElement.lang || "en";
  const copy = () => copies[language()] || copies.en;
  const track = (n) => window.CubicAnalytics?.event(n);
  const rtl = () => ["ar", "ur"].includes(language());
  const path = location.pathname;
  if (path === "/privacy.html") {
    const p = document.createElement("p");
    p.setAttribute("translate", "no");
    p.className = "cs-notice";
    const render = () => {
      p.textContent = copy()[17];
      p.lang = language();
      p.dir = rtl() ? "rtl" : "ltr";
    };
    render();
    document.querySelector("main")?.append(p);
    document.addEventListener("cubic:languagechange", render);
    return;
  }
  const inline = document.querySelector("[data-contact-form]");
  if (!inline) {
    // Never interrupt an active request, account, tracking or private status workflow.
    if (
      /(?:ship|service-request|profile|account-help|track|request-status|callback)\.html$/.test(
        path,
      ) ||
      path.startsWith("/auth/")
    )
      return;
    // Every other public page gets a link to the dedicated contact page. No pop-up.
    const link = document.createElement("a");
    link.className = "cs-help-trigger";
    link.href = "/contact.html";
    link.setAttribute("translate", "no");
    const render = () => {
      link.textContent = copy()[0];
      link.lang = language();
      link.dir = rtl() ? "rtl" : "ltr";
    };
    render();
    document.addEventListener("cubic:languagechange", render);
    document.querySelector("main")?.append(link);
    return;
  }
  // Contact page: the follow-up form lives in the page itself.
  const host = inline;
  const sms = window.CubicSmsConsent;
  if (!sms) return;
  const smsCopy = () => sms.copies[language()] || sms.copies.en;
  host.dataset.capture = "";
  host.setAttribute("translate", "no");
  host.className = "cs-help cs-help-inline";
  host.innerHTML =
    '<h2 id="csHelpTitle"></h2><p data-copy="2"></p><form><label><span data-copy="3"></span><input name="name" autocomplete="name" maxlength="100"></label><label><span data-copy="4"></span><input name="email" type="email" autocomplete="email" required maxlength="254" dir="ltr"></label><label><span data-sms="phone"></span><input name="phone" type="tel" autocomplete="tel" maxlength="50" dir="ltr"></label><div class="cs-sms-consent"><label class="cs-help-check"><input name="smsConsent" type="checkbox"><span data-sms="consent"></span></label><p class="cs-help-small"><a data-privacy href="/privacy.html#sms" data-copy="11"></a> · <a data-terms href="/service-terms.html#sms" data-sms="terms"></a></p></div><label><span data-copy="6"></span><select name="branch"><option value="" data-copy="7"></option></select></label><label><span data-copy="5"></span><textarea name="details" rows="3" maxlength="1500"></textarea></label><div hidden aria-hidden="true"><input name="website" tabindex="-1" autocomplete="off"></div><p class="cs-help-small" data-copy="9"></p><button class="cs-help-submit" type="submit" data-copy="8"></button></form><p role="status" aria-live="polite" class="cs-help-result" tabindex="-1" hidden></p>';
  const form = host.querySelector("form"),
    result = host.querySelector('[role="status"]');
  let statusIndex = null,
    requestId = crypto.randomUUID(),
    submitted = false;
  function render() {
    const c = copy();
    host.lang = language();
    host.dir = rtl() ? "rtl" : "ltr";
    host.querySelector("h2").textContent = c[1];
    host
      .querySelectorAll("[data-copy]")
      .forEach((el) => (el.textContent = c[Number(el.dataset.copy)]));
    host.querySelectorAll("[data-sms]").forEach((el) => {
      el.textContent = smsCopy()[el.dataset.sms];
    });
    host.querySelector("[data-privacy]").href =
      "/privacy.html?lang=" + encodeURIComponent(language()) + "#sms";
    host.querySelector("[data-terms]").href =
      "/service-terms.html?lang=" + encodeURIComponent(language()) + "#sms";
    if (statusIndex !== null) result.textContent = c[statusIndex];
  }
  render();
  document.addEventListener("cubic:languagechange", render);
  track("callback_open");
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
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const phone = form.elements.phone;
    phone.setCustomValidity("");
    const digits = phone.value.replace(/\D/g, "");
    if ((phone.value && !(/^\+?[\d().\s-]+$/.test(phone.value.trim()) &&
        (phone.value.trim().startsWith("+") ? /^[1-9]\d{7,14}$/.test(digits) : /^1?\d{10}$/.test(digits)))) ||
        (form.elements.smsConsent.checked && !phone.value.trim())) {
      phone.setCustomValidity(smsCopy().invalidPhone);
    }
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
        marketing: false,
        smsConsent: form.elements.smsConsent.checked,
        smsConsentVersion: sms.version,
        attribution: window.CubicAnalytics?.attribution() || {},
      });
      const r = await fetch("/api/crm-lead", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(b),
      });
      const data = await r.json();
      if (!r.ok || !data.ok) throw new Error("save");
      if (data.preferencesToken && !b.website)
        window.CubicAnalytics?.saved("email_help", requestId, b.branch || "");
      submitted = true;
      statusIndex = 12;
      form.hidden = true;
    } catch {
      statusIndex = 13;
      track("form_error");
    } finally {
      result.hidden = false;
      render();
      button.disabled = false;
      form.removeAttribute("aria-busy");
      if (submitted) result.focus?.();
    }
  });
  form.elements.phone.addEventListener("input", () => form.elements.phone.setCustomValidity(""));
  form.elements.smsConsent.addEventListener("change", () => form.elements.phone.setCustomValidity(""));
})();
