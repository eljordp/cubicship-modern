(() => {
  const $ = (id) => document.getElementById(id),
    token = location.hash.slice(1);
  let lastRequest;
  function render(r) {
    $("statusMessage").textContent =
      "Keep this private link for future updates.";
    $("statusDetails").hidden = false;
    $("statusLabel").textContent = r.status;
    $("statusNumber").textContent = r.number;
    $("statusNote").textContent = r.message;
    $("statusFacts").replaceChildren();
    [
      ["Service", r.service],
      ["Counter", r.branch.name],
      [
        "Last update",
        new Date(r.updatedAt).toLocaleString(
          window.CubicI18n?.language || "en",
        ),
      ],
    ].forEach(([key, value]) => {
      const dt = document.createElement("dt"),
        dd = document.createElement("dd");
      dt.textContent = key;
      dd.textContent =
        key === "Service" ? window.CubicI18n?.t(value) || value : value;
      dd.setAttribute("translate", "no");
      $("statusFacts").append(dt, dd);
    });
    $("statusCall").hidden = !r.branch.tel;
    $("statusCall").href = "tel:" + r.branch.tel;
    if (window.CubicI18n)
      window.CubicI18n.setText($("statusCall"), "Call {phone}", {
        phone: r.branch.phone,
      });
    else $("statusCall").textContent = "Call " + r.branch.phone;
    $("statusTracking").hidden = !r.tracking;
    if (r.tracking)
      $("statusTracking").href =
        "/track.html?tracking=" + encodeURIComponent(r.tracking);
  }
  document.addEventListener("cubic:languagechange", () => {
    if (lastRequest) render(lastRequest);
  });
  async function refresh() {
    if (!/^[a-f0-9]{64}$/.test(token)) return;
    $("statusRefresh").disabled = true;
    $("statusMessage").textContent = "Checking request…";
    try {
      const response = await fetch("/api/request-status", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token }),
        }),
        data = await response.json();
      if (!response.ok || !data.ok)
        throw Error(data.error || "Could not load status.");
      lastRequest = data.request;
      render(lastRequest);
    } catch (error) {
      $("statusMessage").textContent = error.message;
    } finally {
      $("statusRefresh").disabled = false;
    }
  }
  $("statusRefresh").addEventListener("click", refresh);
  refresh();
})();
