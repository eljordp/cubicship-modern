(function () {
  const faqs = [
    {
      label: "How do I start a shipment?",
      answer: "Create a customer profile, submit the shipment details, and bring the generated Cubic Ship ticket with your box. Staff uses that ticket to match your box to the DHL tracking/label created in the carrier system. Estimated price will show once Cubic connects the area-based rate data.",
      links: [{ label: "Open profile", href: "profile.html" }],
    },
    {
      label: "Can I request a service?",
      answer: "Yes. Use the service request option here for passport, DMV, printing, notary, payments, luggage storage, freight help, or another counter service.",
      request: true,
    },
    {
      label: "What services do you offer?",
      answer: "Cubic Ship handles DHL Express, domestic and international shipping, air/ocean/ground freight, passport services, office services, IL DMV services, payment services, money orders, luggage storage, virtual notary support, and document help.",
      links: [{ label: "View services", href: "services.html" }],
    },
    {
      label: "Where are you located?",
      answer: "Cubic Ship Bridgeview is at 7327 W 87th Street, Bridgeview, IL 60455. Call ahead if you need a specific service confirmed before coming in.",
      links: [{ label: "Call now", href: "tel:+17084325600" }],
    },
    {
      label: "How do I track a shipment?",
      answer: "Use the tracking page for DHL, UPS, FedEx, USPS, or freight references. If you only have a Cubic Ship ticket number, contact the counter team for help.",
      links: [{ label: "Track shipment", href: "track.html" }],
    },
    {
      label: "Do you help small businesses?",
      answer: "Yes. Cubic helps online shops, local sellers, home businesses, and small teams with DHL, packing, freight, document support, and business shipping rates based on volume, destination, service type, and carrier availability.",
      links: [{ label: "Business profile", href: "profile.html?account=business&offer=online-seller" }],
    },
    {
      label: "I sell online",
      answer: "Create a Small Business profile, tell Cubic where you sell online, and choose your expected 10, 20, or 30 shipments/month tier. The team can use that profile to review the best available shipping path for your shop.",
      links: [{ label: "Create profile", href: "profile.html?account=business&offer=online-seller" }],
    },
  ];

  function escapeHtml(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function resolveHref(href) {
    if (/^(https?:|mailto:|tel:)/i.test(href)) return href;
    const path = window.location.pathname.split("/").pop() || "index.html";
    if (path === "index.html" || !path.includes(".")) return href;
    return href;
  }

  function message(text, type = "bot") {
    return `<div class="chat-message ${type}">${text}</div>`;
  }

  function optionButtons() {
    return `<div class="chat-options">${faqs.map((faq, index) => `<button class="chat-option" type="button" data-faq="${index}">${escapeHtml(faq.label)}</button>`).join("")}</div>`;
  }

  function linkButtons(links) {
    if (!links || !links.length) return "";
    return `<div class="chat-links">${links.map((link, index) => `<a class="${index ? "secondary" : ""}" href="${escapeHtml(resolveHref(link.href))}">${escapeHtml(link.label)}</a>`).join("")}</div>`;
  }

  function serviceForm() {
    return `
      <form class="chat-form" id="chatServiceForm">
        <label>Name<input id="chatName" autocomplete="name" required></label>
        <label>Phone or Email<input id="chatContact" autocomplete="email" required></label>
        <label>Service
          <select id="chatService">
            <option>Passport services</option>
            <option>Office / print / scan</option>
            <option>IL DMV services</option>
            <option>Payments / money orders</option>
            <option>Luggage storage</option>
            <option>Virtual notary support</option>
            <option>Freight / container help</option>
            <option>Other counter service</option>
          </select>
        </label>
        <label>What do you need?<textarea id="chatDetails" required></textarea></label>
        <button class="chat-action" type="submit">Send Service Request</button>
      </form>
    `;
  }

  function init() {
    if (document.querySelector(".chat-widget")) return;
    const root = document.createElement("div");
    root.className = "chat-widget";
    root.innerHTML = `
      <button class="chat-toggle" type="button" aria-expanded="false" aria-label="Open Cubic Ship help">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4z"/></svg>
        <span>Help / FAQ</span>
      </button>
      <section class="chat-panel" aria-label="Cubic Ship help chat">
        <div class="chat-head">
          <div>
            <strong>Cubic Ship Help</strong>
            <span>Quick answers, service requests, and counter support.</span>
          </div>
          <button class="chat-close" type="button" aria-label="Close help">&times;</button>
        </div>
        <div class="chat-body" id="chatBody">
          ${message("Hi. What can we help you with? Choose a question or request a service.")}
          ${optionButtons()}
        </div>
        <div class="chat-foot">
          <a class="primary" href="tel:+17084325600">Call</a>
          <a href="mailto:info@cubicship.com">Email</a>
        </div>
      </section>
    `;
    document.body.appendChild(root);
    initSellerOffer();

    const toggle = root.querySelector(".chat-toggle");
    const close = root.querySelector(".chat-close");
    const body = root.querySelector("#chatBody");

    function setOpen(open) {
      root.classList.toggle("open", open);
      toggle.setAttribute("aria-expanded", String(open));
    }

    function resetOptions() {
      body.insertAdjacentHTML("beforeend", optionButtons());
      body.scrollTop = body.scrollHeight;
    }

    function showFaq(index) {
      const faq = faqs[index];
      if (!faq) return;
      body.insertAdjacentHTML("beforeend", message(escapeHtml(faq.label), "user"));
      body.insertAdjacentHTML("beforeend", message(escapeHtml(faq.answer)));
      if (faq.request) {
        body.insertAdjacentHTML("beforeend", serviceForm());
      } else {
        body.insertAdjacentHTML("beforeend", linkButtons(faq.links));
        resetOptions();
      }
      body.scrollTop = body.scrollHeight;
    }

    toggle.addEventListener("click", () => setOpen(!root.classList.contains("open")));
    close.addEventListener("click", () => setOpen(false));

    body.addEventListener("click", (event) => {
      const button = event.target.closest("[data-faq]");
      if (!button) return;
      showFaq(Number(button.getAttribute("data-faq")));
      button.closest(".chat-options")?.remove();
    });

    body.addEventListener("submit", (event) => {
      if (event.target.id !== "chatServiceForm") return;
      event.preventDefault();
      const name = root.querySelector("#chatName").value.trim();
      const contact = root.querySelector("#chatContact").value.trim();
      const service = root.querySelector("#chatService").value;
      const details = root.querySelector("#chatDetails").value.trim();
      const subject = encodeURIComponent(`Cubic Ship service request - ${service}`);
      const text = [
        "Service request from cubicship.com",
        "",
        `Name: ${name}`,
        `Phone or email: ${contact}`,
        `Service: ${service}`,
        "",
        "Details:",
        details,
      ].join("\n");
      window.location.href = `mailto:info@cubicship.com?subject=${subject}&body=${encodeURIComponent(text)}`;
      event.target.remove();
      body.insertAdjacentHTML("beforeend", message("Service request draft opened. Send the email, or call the counter if this is urgent."));
      body.insertAdjacentHTML("beforeend", linkButtons([{ label: "Call Cubic Ship", href: "tel:+17084325600" }, { label: "Email", href: "mailto:info@cubicship.com" }]));
      resetOptions();
    });
  }

  function initSellerOffer() {
    const path = window.location.pathname;
    const isHome = path === "/" || path.endsWith("/index.html") || path === "";
    let offerClosed = false;
    try {
      offerClosed = window.sessionStorage?.getItem("cubicSellerOfferClosed") === "1";
    } catch (error) {
      offerClosed = false;
    }
    if (!isHome || offerClosed) return;

    const offer = document.createElement("div");
    offer.className = "seller-offer";
    offer.hidden = true;
    offer.innerHTML = `
      <div class="seller-offer-panel" role="dialog" aria-modal="false" aria-labelledby="sellerOfferTitle">
        <div class="seller-offer-top">
          <button class="seller-offer-close" type="button" aria-label="Close online seller offer">&times;</button>
          <div class="seller-offer-kicker">Business Shipping</div>
          <h2 id="sellerOfferTitle">Ship more? Start before you arrive.</h2>
        </div>
        <div class="seller-offer-body">
          <p>Create one profile for DHL requests, files, and counter follow-up.</p>
          <ul class="seller-offer-list">
            <li>Add where you sell and what you ship.</li>
            <li>Choose a 10, 20, or 30 shipments/month tier.</li>
            <li>Let Cubic review the best shipping path for your business.</li>
          </ul>
          <div class="seller-offer-actions">
            <a class="primary" href="profile.html?account=business&offer=online-seller">Create Profile</a>
            <a class="secondary" href="tel:+17084325600">Call Cubic Ship</a>
          </div>
          <span class="seller-offer-disclaimer">Rates vary by volume, destination, shipment type, carrier, and service availability.</span>
        </div>
      </div>
    `;
    document.body.appendChild(offer);

    function closeOffer() {
      offer.hidden = true;
      try {
        window.sessionStorage?.setItem("cubicSellerOfferClosed", "1");
      } catch (error) {
        // Some embedded browsers block session storage; closing should still work.
      }
    }

    offer.querySelector(".seller-offer-close").addEventListener("click", closeOffer);
    offer.addEventListener("click", (event) => {
      if (event.target === offer) closeOffer();
    });
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && !offer.hidden) closeOffer();
    });
    let offerReady = false;
    function revealOffer() {
      if (!offerReady || window.scrollY < 600) return;
      offer.hidden = false;
      window.removeEventListener("scroll", revealOffer);
    }
    window.addEventListener("scroll", revealOffer, { passive: true });
    window.setTimeout(() => {
      offerReady = true;
      revealOffer();
    }, 6000);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
