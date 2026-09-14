(() => {
  "use strict";
  const skip = document.querySelector(".cs-skip");
  if (skip)
    skip.addEventListener("click", (e) => {
      const main = document.getElementById("main");
      if (main) {
        e.preventDefault();
        main.tabIndex = -1;
        main.focus();
      }
    });
  const toggle = document.querySelector(".cs-toggle"),
    nav = document.querySelector(".cs-navigation");
  if (toggle && nav) {
    const close = () => {
      nav.classList.remove("cs-open");
      toggle.setAttribute("aria-expanded", "false");
    };
    toggle.addEventListener("click", () => {
      const open = toggle.getAttribute("aria-expanded") !== "true";
      toggle.setAttribute("aria-expanded", String(open));
      nav.classList.toggle("cs-open", open);
    });
    nav.addEventListener("click", (e) => {
      if (e.target.closest("a")) close();
    });
    document.addEventListener("keydown", (e) => {
      if (
        e.key === "Escape" &&
        toggle.getAttribute("aria-expanded") === "true"
      ) {
        close();
        toggle.focus();
      }
    });
    nav.querySelectorAll("a").forEach((a) => {
      if (new URL(a.href).pathname === location.pathname)
        a.setAttribute("aria-current", "page");
    });
  }
})();
