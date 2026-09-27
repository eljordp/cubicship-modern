(() => {
  const input = document.getElementById("locationSearch"),
    cards = [...document.querySelectorAll("[data-search]")];
  function filter() {
    const q = input.value.trim().toLowerCase();
    let count = 0;
    cards.forEach((card) => {
      card.hidden = !card.dataset.search.includes(q);
      if (!card.hidden) count++;
    });
    document.getElementById("locationCount").textContent =
      window.CubicI18n?.t(count === 1 ? "{count} location" : "{count} locations", { count }) || String(count);
    document.getElementById("emptyLocations").hidden = count !== 0;
  }
  input.addEventListener("input", filter);
  document.addEventListener("cubic:languagechange", filter);
  filter();
  document.getElementById("clearLocations").addEventListener("click", () => {
    input.value = "";
    filter();
    input.focus();
  });
})();
