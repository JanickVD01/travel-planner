/* Pin-plate preview (THROWAWAY, effort 0011). External file (CSP script-src 'self'). Renders stay
   cards with the real markup (.pin-media + .pin-body) so the linked styles.css + the candidate plate
   override in the page apply, and wires the shape/style/alpha/theme toggles + a live contrast readout. */
(function () {
  "use strict";

  var STAY = '<path d="M3.5 20.5V9L12 4l8.5 5v11.5M3.5 20.5h17M9.5 20.5v-5h5v5"/>';
  function icon(p, cls) {
    return '<svg class="ico ' + (cls || "") + '" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + p + "</svg>";
  }
  function svgURI(s) { return "data:image/svg+xml;utf8," + encodeURIComponent(s); }

  // Vivid sample photos (no filtering in the candidate treatment — these should look punchy).
  var IMG = {
    // green rocky shore under a bright sky — echoes the user's screenshot, but vivid
    vivid: svgURI('<svg xmlns="http://www.w3.org/2000/svg" width="480" height="360"><defs><linearGradient id="s" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#8fd3ff"/><stop offset="1" stop-color="#d7f0ea"/></linearGradient></defs><rect width="480" height="360" fill="url(#s)"/><ellipse cx="240" cy="250" rx="360" ry="150" fill="#2f8f6b"/><path d="M60 300 q60 -80 140 -60 q40 -70 120 -40 q70 -30 120 40 v120 H60 Z" fill="#1f6d4e"/><circle cx="120" cy="230" r="34" fill="#5a5148"/><circle cx="185" cy="250" r="26" fill="#6b6157"/><circle cx="150" cy="270" r="30" fill="#4c443c"/></svg>'),
    // bright hazy sky (near-white) — the readability worst case, but rendered vivid (no darkening)
    bright: svgURI('<svg xmlns="http://www.w3.org/2000/svg" width="480" height="360"><defs><linearGradient id="b" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#eaf4ff"/><stop offset="1" stop-color="#ffffff"/></linearGradient></defs><rect width="480" height="360" fill="url(#b)"/><circle cx="360" cy="80" r="54" fill="#fff6d8"/><path d="M0 305 L120 235 L215 288 L320 220 L430 285 L480 255 L480 360 L0 360 Z" fill="#dfeae0"/></svg>')
  };

  function ed(x) { return '<span class="editable" role="button" tabindex="0">' + x + "</span>"; }
  function mono(t) { return '<span class="mono">' + t + "</span>"; }
  function mut(t) { return '<span class="muted">' + t + "</span>"; }

  // mirrors app.js stepCardHTML (stay branch) + the pin wrapper
  function stayCard(title, img, status) {
    var when = '<span class="stay-when">' + ed("26 Nov") + " " + ed(mono("15:00")) + " " + mut("→") + " " +
      ed("29 Nov") + " " + ed(mono("11:00")) + "</span>";
    return '<li class="step stay">' +
      '<span class="marker stay" aria-hidden="true"></span>' +
      '<div class="step-card pinned">' +
        '<img class="pin-media" alt="" decoding="async" src="' + img + '">' +
        '<div class="pin-body">' +
          '<div class="step-head">' + icon(STAY, "step-kind") + '<a class="step-title" href="#">' + title + "</a>" +
            '<a class="step-open" href="#" aria-label="Open details">›</a></div>' +
          '<div class="step-sub">' + when + "</div>" +
          '<div class="step-status"><span class="chip status-' + status + '">' + status + "</span></div>" +
        "</div>" +
      "</div></li>";
  }

  function render() {
    document.getElementById("pp-grid").innerHTML =
      '<div class="pp-cell"><p class="cap">Vivid photo</p><ol class="tl">' + stayCard("Bangkok", IMG.vivid, "Confirmed") + "</ol></div>" +
      '<div class="pp-cell"><p class="cap">Bright photo (contrast worst case)</p><ol class="tl">' + stayCard("Chiang Mai", IMG.bright, "Booked") + "</ol></div>";
  }

  /* ---- WCAG contrast readout: worst case = plate tint over a pure-white photo ---- */
  var SCRIM = [18, 15, 11];
  function lin(c) { c /= 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); }
  function lum(r) { return 0.2126 * lin(r[0]) + 0.7152 * lin(r[1]) + 0.0722 * lin(r[2]); }
  function hex(h) { return [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)]; }
  function ratio(a, b) { var l1 = lum(a), l2 = lum(b), hi = Math.max(l1, l2), lo = Math.min(l1, l2); return (hi + 0.05) / (lo + 0.05); }
  var ON = hex("#FBFAF7"), DIM = hex("#E7E2D8");
  function readout(alpha) {
    var bg = SCRIM.map(function (s) { return s * alpha + 255 * (1 - alpha); });
    function set(b, v, val) {
      document.getElementById(b).textContent = val.toFixed(1) + ":1";
      var el = document.getElementById(v), pass = val >= 4.5;
      el.textContent = pass ? "AA ✓" : "below AA"; el.className = pass ? "pp-pass" : "pp-fail";
    }
    set("pp-c-title", "pp-c-title-v", ratio(ON, bg));
    set("pp-c-dim", "pp-c-dim-v", ratio(DIM, bg));
  }

  function press(group, attr, val) {
    group.querySelectorAll("button").forEach(function (b) { b.setAttribute("aria-pressed", b.getAttribute(attr) === val ? "true" : "false"); });
  }
  function cards() { return document.querySelectorAll(".step-card.pinned"); }

  function wire() {
    var themeG = document.getElementById("pp-theme");
    themeG.addEventListener("click", function (e) { var b = e.target.closest("button"); if (!b) return;
      if (b.dataset.theme === "system") document.documentElement.removeAttribute("data-theme");
      else document.documentElement.setAttribute("data-theme", b.dataset.theme);
      press(themeG, "data-theme", b.dataset.theme); });

    var shapeG = document.getElementById("pp-shape");
    shapeG.addEventListener("click", function (e) { var b = e.target.closest("button"); if (!b) return;
      cards().forEach(function (c) { c.classList.toggle("shape-bar", b.dataset.shape === "bar"); });
      press(shapeG, "data-shape", b.dataset.shape); });

    var styleG = document.getElementById("pp-style");
    styleG.addEventListener("click", function (e) { var b = e.target.closest("button"); if (!b) return;
      cards().forEach(function (c) { c.classList.toggle("frosted", b.dataset.style === "frosted"); });
      press(styleG, "data-style", b.dataset.style); });

    var alpha = document.getElementById("pp-alpha");
    alpha.addEventListener("input", function () { var a = alpha.value / 100;
      document.documentElement.style.setProperty("--pin-plate-alpha", String(a));
      document.getElementById("pp-a-val").textContent = a.toFixed(2);
      readout(a); });
  }

  render();
  wire();
  readout(0.72);
})();
