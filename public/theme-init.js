// Theme-before-paint: set data-theme before first paint to avoid a flash. Light is primary.
// Externalized from index.html so a strict CSP can use script-src 'self' (no inline scripts).
(function () {
  try {
    var t = localStorage.getItem("app-theme");
    if (t !== "light" && t !== "dark")
      t = (window.matchMedia && matchMedia("(prefers-color-scheme: dark)").matches) ? "dark" : "light";
    document.documentElement.setAttribute("data-theme", t);
  } catch (e) {
    document.documentElement.setAttribute("data-theme", "light");
  }
})();
