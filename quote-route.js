(() => {
  const p = new URLSearchParams(location.search),
    service = p.get("service"),
    branch = p.get("location");
  let target = "";
  if (service === "dhl") target = "/ship.html?mode=quote";
  if (["printing", "business-print"].includes(service))
    target = "/service-request.html?service=" + encodeURIComponent(service);
  if (target && branch) target += "&location=" + encodeURIComponent(branch);
  if (target) location.replace(target);
})();
