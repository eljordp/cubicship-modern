(() => {
  const form = document.querySelector("#shippingForm,#serviceForm,#intakeForm,#shipmentForm");
  if (!form) return;
  const controls = [...form.querySelectorAll("input,select,textarea,button")];
  const original = new Map(controls.map((el) => [el, el.disabled]));
  let ready = false;
  const banner = document.createElement("div");
  banner.className = "cs-notice";
  banner.setAttribute("role", "status");
  banner.textContent = "Checking online request availability…";
  const main = document.querySelector("main");
  if (form.id === "shipmentForm") form.before(banner);
  else main.prepend(banner);
  const disable = () =>
    controls.forEach((el) => {
      if (el.id !== "locationId") el.disabled = true;
    });
  disable();
  form.addEventListener(
    "submit",
    (event) => {
      if (!ready) {
        event.preventDefault();
        event.stopImmediatePropagation();
      }
    },
    true,
  );
  fetch("/api/intake-availability", { cache: "no-store" })
    .then((r) => {
      if (!r.ok) throw Error();
      return r.json();
    })
    .then((data) => {
      if (!data.available) throw Error();
      ready = true;
      controls.forEach((el) => {
        if (el.id !== "locationId") el.disabled = original.get(el);
      });
      banner.remove();
    })
    .catch(() => {
      disable();
      banner.replaceChildren();
      const message = document.createElement("p");
      message.textContent =
        document.documentElement.lang === "es"
          ? "Las solicitudes en línea no están disponibles temporalmente. Llame a su mostrador para iniciar un envío o una consulta."
          : "Online requests are temporarily unavailable. Call your counter to start a shipment or service inquiry.";
      const link = document.createElement("a");
      link.href = "/dhl-locations.html";
      link.className = "cs-btn";
      link.textContent = "Find and call a counter";
      banner.append(message, link);
    });
})();
