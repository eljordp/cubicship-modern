(() => {
  const $ = (id) => document.getElementById(id),
    form = $("serviceForm"),
    params = new URLSearchParams(location.search),
    requestId = crypto.randomUUID();
  const showError = (m) => {
    $("serviceError").textContent = m;
    $("serviceError").hidden = !m;
  };
  try {
    const draft = JSON.parse(
      sessionStorage.getItem("cubicServiceDraft") || "null",
    );
    if (draft) {
      $("name").value = draft.name || "";
      $("details").value = draft.details || "";
      $(String(draft.contact || "").includes("@") ? "email" : "phone").value =
        draft.contact || "";
      sessionStorage.removeItem("cubicServiceDraft");
    }
  } catch {}
  function mode() {
    const print = $("service").value !== "other";
    $("printFields").hidden = !print;
    $("printFields")
      .querySelectorAll("input,select")
      .forEach((i) => (i.disabled = !print));
    $("requestTitle").textContent = print
      ? "Request a print quote."
      : "Ask your counter.";
  }
  if (["printing", "business-print", "other"].includes(params.get("service")))
    $("service").value = params.get("service");
  mode();
  $("service").addEventListener("change", mode);
  fetch("/assets/locations.json")
    .then((r) => {
      if (!r.ok) throw Error();
      return r.json();
    })
    .then((items) => {
      items
        .filter((x) => !x.openingSoon)
        .forEach((x) =>
          $("locationId").add(new Option(x.city + ", " + x.state, x.id)),
        );
      if (params.get("location")) {
        $("locationId").value = params.get("location");
        if (!$("locationId").value)
          showError("That branch is unavailable. Choose an active counter.");
      }
    })
    .catch(() => {
      showError("Locations could not load. Refresh or call your counter.");
      $("serviceSend").disabled = true;
    });
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    showError("");
    $("serviceSend").disabled = true;
    try {
      const response = await fetch("/api/service-request", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...Object.fromEntries(new FormData(form)),
            requestId,
          }),
        }),
        data = await response.json();
      if (!response.ok || !data.ok)
        throw Error(data.error || "Could not confirm your request.");
      $("serviceCode").textContent = data.shipment.number;
      $("serviceBranch").textContent = data.shipment.locationName;
      $("serviceStatus").href = data.shipment.statusUrl;
      $("serviceCard").hidden = true;
      $("serviceReceipt").hidden = false;
      $("serviceReceipt").focus();
    } catch (error) {
      showError(error.message);
    } finally {
      $("serviceSend").disabled = false;
    }
  });
})();
