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
      count + " location" + (count === 1 ? "" : "s");
    document.getElementById("emptyLocations").hidden = count !== 0;
  }
  input.addEventListener("input", filter);
  document.getElementById("clearLocations").addEventListener("click", () => {
    input.value = "";
    filter();
    input.focus();
  });
})();
