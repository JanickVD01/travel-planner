/* Pin-preview toolbar + mock-card renderer (THROWAWAY, effort 0010). External file because the app's
   CSP is `script-src 'self'` (no inline scripts). The card builder mirrors app.js `stepCardHTML`, plus
   the proposed `.pin-media` + `.pin-body` wrapper — it doubles as the reference for the M5 render path. */
(function () {
  "use strict";

  /* ---- icons (copied verbatim from app.js ICONS) ---- */
  var ICONS = {
    plane: '<path d="M17.8 19.2 16 11l3.5-3.5a2.1 2.1 0 0 0-3-3L13 8 4.8 6.2a.5.5 0 0 0-.5.8L9 11l-2 2-2.5-.5a.5.5 0 0 0-.4.9L7 16l1.7 2.8a.5.5 0 0 0 .9-.4L9 16l2-2 3.9 4.7a.5.5 0 0 0 .9-.5z"/>',
    train: '<rect x="6" y="4" width="12" height="12.5" rx="3"/><path d="M6 11.5h12M8.5 20.5 7 22M15.5 20.5 17 22"/><circle cx="9.2" cy="13.7" r="1"/><circle cx="14.8" cy="13.7" r="1"/>',
    stay:  '<path d="M3.5 20.5V9L12 4l8.5 5v11.5M3.5 20.5h17M9.5 20.5v-5h5v5"/>'
  };
  function icon(name, cls) {
    return '<svg class="ico ' + (cls || "") + '" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + (ICONS[name] || "") + "</svg>";
  }

  /* ---- sample photos as data: SVG (no external hosts; img-src 'self' data: allows this) ---- */
  function svgURI(svg) { return "data:image/svg+xml;utf8," + encodeURIComponent(svg); }
  var IMG = {
    // blown-out sky — the worst case for readability (lightest backdrop)
    bright: svgURI('<svg xmlns="http://www.w3.org/2000/svg" width="480" height="360"><defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#dcefff"/><stop offset="1" stop-color="#ffffff"/></linearGradient></defs><rect width="480" height="360" fill="url(#g)"/><circle cx="356" cy="80" r="52" fill="#fff7df"/><path d="M0 300 L120 232 L210 286 L320 214 L420 280 L480 250 L480 360 L0 360 Z" fill="#eef4ea"/></svg>'),
    // night — contrast only improves; risk is muddiness
    dark: svgURI('<svg xmlns="http://www.w3.org/2000/svg" width="480" height="360"><defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#0a0d1a"/><stop offset=".6" stop-color="#141a33"/><stop offset="1" stop-color="#20112a"/></linearGradient></defs><rect width="480" height="360" fill="url(#g)"/><circle cx="380" cy="70" r="30" fill="#f4efd8"/><ellipse cx="150" cy="330" rx="240" ry="90" fill="#3a2f5a" opacity="0.6"/><g fill="#ffffff" opacity="0.7"><circle cx="60" cy="60" r="1.5"/><circle cx="120" cy="110" r="1"/><circle cx="240" cy="50" r="1.3"/><circle cx="300" cy="120" r="1"/><circle cx="440" cy="150" r="1.4"/></g></svg>'),
    // high-frequency busy pattern — stress for "calm"
    busy: svgURI('<svg xmlns="http://www.w3.org/2000/svg" width="480" height="360"><defs><pattern id="p" width="26" height="26" patternTransform="rotate(35)" patternUnits="userSpaceOnUse"><rect width="26" height="26" fill="#c14a2f"/><rect width="13" height="26" fill="#2f7d79"/><circle cx="6" cy="6" r="5" fill="#e8b23a"/></pattern></defs><rect width="480" height="360" fill="url(#p)"/></svg>')
  };

  /* ---- card builder (mirrors app.js stepCardHTML + the proposed pin wrapper) ---- */
  function ed(inner) { return '<span class="editable" role="button" tabindex="0">' + inner + "</span>"; }
  function mono(t) { return '<span class="mono">' + t + "</span>"; }
  function addA(t) { return '<span class="add-actual">' + t + "</span>"; }
  function mut(t) { return '<span class="muted">' + t + "</span>"; }

  function stayWhen(tall) {
    return '<span class="stay-when">' +
      ed("Mar 14") + " " + ed(mono("15:00")) + " " + mut("→") + " " +
      ed("Mar 17") + " " + ed(tall ? mono("11:00") : addA("+ time")) + "</span>";
  }
  function legWhen() {
    return '<span class="leg-when">' +
      mut("dep") + " " + ed("Mar 14") + " " + ed(mono("08:30")) + " " +
      mut("· arr") + " " + ed("Mar 14") + " " + ed(mono("11:55")) + "</span>";
  }

  // opts: { kind:'stay'|'travel', mode, title, status, pinned, img:'bright'|'dark'|'busy', tall }
  function stepLi(o) {
    var status = o.status || "Booked";
    var chip = '<span class="chip status-' + status + '">' + status + "</span>";
    var openChev = '<a class="step-open" href="#" aria-label="Open details">›</a>';
    var media = o.pinned ? '<img class="pin-media" alt="" decoding="async" loading="lazy" src="' + IMG[o.img || "bright"] + '">' : "";

    if (o.kind === "travel") {
      var cardCls = "leg" + (o.pinned ? " pinned is-pinnable" : "");
      return '<li class="step travel">' +
        '<span class="marker travel" aria-hidden="true">' + icon(o.mode || "plane") + "</span>" +
        '<div class="' + cardCls + '">' + media +
          '<div class="pin-body">' +
            '<div class="leg-top"><a class="leg-title" href="#">' + o.title + "</a>" + openChev + "</div>" +
            '<div class="leg-sub">' + legWhen() + "</div>" +
            '<div class="step-status">' + chip + "</div>" +
          "</div></div></li>";
    }
    var stayCls = "step-card" + (o.pinned ? " pinned is-pinnable" : "");
    return '<li class="step stay">' +
      '<span class="marker stay" aria-hidden="true"></span>' +
      '<div class="' + stayCls + '">' + media +
        '<div class="pin-body">' +
          '<div class="step-head">' + icon("stay", "step-kind") + '<a class="step-title" href="#">' + o.title + "</a>" + openChev + "</div>" +
          '<div class="step-sub">' + stayWhen(o.tall) + "</div>" +
          '<div class="step-status">' + chip + "</div>" +
        "</div></div></li>";
  }
  function tl(lis) { return '<ol class="tl">' + lis.join("") + "</ol>"; }
  function cell(cap, li) { return '<div class="pp-cell"><p class="cap">' + cap + "</p>" + tl([li]) + "</div>"; }

  /* ---- render the three sections ---- */
  function render() {
    // In-context: a realistic thread, pinned + unpinned interleaved
    document.getElementById("pp-context").innerHTML = tl([
      stepLi({ kind: "travel", mode: "plane", title: "Brussels → Bangkok", status: "Confirmed", pinned: false }),
      stepLi({ kind: "stay", title: "Riva Surya, Bangkok", status: "Booked", pinned: true, img: "bright" }),
      stepLi({ kind: "travel", mode: "train", title: "Bangkok → Chiang Mai (sleeper)", status: "Planned", pinned: false }),
      stepLi({ kind: "stay", title: "Mountain lodge, Chiang Mai", status: "Booked", pinned: true, img: "dark", tall: true }),
      stepLi({ kind: "stay", title: "Beach bungalow, Koh Lanta", status: "Idea", pinned: false }),
      stepLi({ kind: "travel", mode: "plane", title: "Krabi → Brussels", status: "Idea", pinned: true, img: "busy" })
    ]);

    // Stress grid: rows = image type, cols = stay-short, stay-tall, travel-short, travel-tall
    var rows = [{ img: "bright", label: "Bright / blown-out sky" }, { img: "dark", label: "Night" }, { img: "busy", label: "Busy" }];
    var longTitle = "The Riverside Heritage House & Rooftop Garden Suites";
    var html = "";
    rows.forEach(function (r) {
      html += cell(r.label + " · stay", stepLi({ kind: "stay", title: "Riva Surya", pinned: true, img: r.img }));
      html += cell(r.label + " · stay (tall)", stepLi({ kind: "stay", title: longTitle, pinned: true, img: r.img, tall: true }));
      html += cell(r.label + " · travel", stepLi({ kind: "travel", mode: "plane", title: "Bangkok flight", pinned: true, img: r.img }));
      html += cell(r.label + " · travel (tall)", stepLi({ kind: "travel", mode: "train", title: "Bangkok → Chiang Mai overnight sleeper train", pinned: true, img: r.img, tall: true }));
    });
    document.getElementById("pp-grid").innerHTML = html;

    // Balanced vs Muted on the busy image
    document.getElementById("pp-compare").innerHTML =
      cell("Balanced", stepLi({ kind: "stay", title: "Night market stay", pinned: true, img: "busy" })) +
      '<div class="pp-cell" data-force-muted="1"><p class="cap">Muted</p>' +
        tl([stepLi({ kind: "stay", title: "Night market stay", pinned: true, img: "busy" })]) + "</div>";

    applyState();
  }

  /* ---- state: treatment + unpinned ---- */
  var state = { treat: "balanced", unpinned: false };
  function applyState() {
    var cards = document.querySelectorAll(".is-pinnable");
    cards.forEach(function (c) {
      var forceMuted = c.closest("[data-force-muted]");
      var img = c.querySelector(".pin-media");
      if (state.unpinned) {
        c.classList.remove("pinned", "pin-muted");
        if (img) img.style.display = "none";
      } else {
        c.classList.add("pinned");
        if (img) img.style.display = "";
        var muted = forceMuted || state.treat === "muted";
        c.classList.toggle("pin-muted", !!muted);
      }
    });
  }

  /* ---- WCAG contrast readout (worst case = pure-white photo behind the text) ---- */
  var SCRIM = [18, 15, 11];
  function lin(c) { c /= 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); }
  function lum(rgb) { return 0.2126 * lin(rgb[0]) + 0.7152 * lin(rgb[1]) + 0.0722 * lin(rgb[2]); }
  function hexRGB(h) { return [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)]; }
  function ratio(a, b) { var l1 = lum(a), l2 = lum(b), hi = Math.max(l1, l2), lo = Math.min(l1, l2); return (hi + 0.05) / (lo + 0.05); }
  function backdropOverWhite(alpha) { return SCRIM.map(function (s) { return s * alpha + 255 * (1 - alpha); }); }

  var ON_MEDIA = hexRGB("#FBFAF7"), ON_DIM = hexRGB("#E7E2D8");
  function updateReadout(floor) {
    var bg = backdropOverWhite(floor);
    var ct = ratio(ON_MEDIA, bg), cd = ratio(ON_DIM, bg);
    function set(idB, idV, val) {
      var b = document.getElementById(idB), v = document.getElementById(idV);
      b.textContent = val.toFixed(1) + ":1";
      var pass = val >= 4.5;
      v.textContent = pass ? "AA ✓" : "below AA";
      v.className = pass ? "pp-pass" : "pp-fail";
    }
    set("pp-c-title", "pp-c-title-v", ct);
    set("pp-c-dim", "pp-c-dim-v", cd);
  }

  /* ---- wire the toolbar ---- */
  function setTheme(t) {
    if (t === "system") document.documentElement.removeAttribute("data-theme");
    else document.documentElement.setAttribute("data-theme", t);
  }
  function press(group, matchAttr, val) {
    group.querySelectorAll("button").forEach(function (b) {
      b.setAttribute("aria-pressed", b.getAttribute(matchAttr) === val ? "true" : "false");
    });
  }

  function wire() {
    var themeG = document.getElementById("pp-theme");
    themeG.addEventListener("click", function (e) {
      var b = e.target.closest("button"); if (!b) return;
      setTheme(b.dataset.theme); press(themeG, "data-theme", b.dataset.theme);
    });

    var treatG = document.getElementById("pp-treat");
    treatG.addEventListener("click", function (e) {
      var b = e.target.closest("button"); if (!b) return;
      state.treat = b.dataset.treat; press(treatG, "data-treat", state.treat); applyState();
    });

    var floor = document.getElementById("pp-floor");
    floor.addEventListener("input", function () {
      var f = floor.value / 100, peak = Math.min(0.98, f + 0.10);
      document.documentElement.style.setProperty("--pin-floor", String(f));
      document.documentElement.style.setProperty("--pin-peak", String(peak));
      document.getElementById("pp-floor-val").textContent = f.toFixed(2);
      updateReadout(f);
    });

    var pos = document.getElementById("pp-pos");
    pos.addEventListener("input", function () {
      document.documentElement.style.setProperty("--pin-pos", "50% " + pos.value + "%");
      document.getElementById("pp-pos-val").textContent = pos.value + "%";
    });

    document.getElementById("pp-unpin").addEventListener("change", function (e) {
      state.unpinned = e.target.checked; applyState();
    });
  }

  render();
  wire();
  updateReadout(0.82);
})();
