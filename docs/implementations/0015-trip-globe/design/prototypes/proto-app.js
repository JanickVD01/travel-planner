/* App-fidelity prototype driver: builds the real app chrome + timeline from the sample
 * trip (using the exact app markup), and drives the faded background map on TAP only
 * (no scroll). Reuses atlas.js (window.PROTO) as the map renderer. */
(function () {
  "use strict";

  // --- icons (verbatim from public/app.js ICONS) ---
  var ICONS = {
    plane: '<path d="M17.8 19.2 16 11l3.5-3.5a2.1 2.1 0 0 0-3-3L13 8 4.8 6.2a.5.5 0 0 0-.5.8L9 11l-2 2-2.5-.5a.5.5 0 0 0-.4.9L7 16l1.7 2.8a.5.5 0 0 0 .9-.4L9 16l2-2 3.9 4.7a.5.5 0 0 0 .9-.5z"/>',
    train: '<rect x="6" y="4" width="12" height="12.5" rx="3"/><path d="M6 11.5h12M8.5 20.5 7 22M15.5 20.5 17 22"/><circle cx="9.2" cy="13.7" r="1"/><circle cx="14.8" cy="13.7" r="1"/>',
    ferry: '<path d="M4 15.5 5.4 19a2 2 0 0 0 1.9 1.3h9.4A2 2 0 0 0 18.6 19L20 15.5M6 15.5V9h12v6.5M9.5 9V5.5h5V9"/>',
    bus: '<rect x="4" y="5" width="16" height="11.5" rx="3"/><path d="M4 11.5h16M7.5 20.5v-2M16.5 20.5v-2"/><circle cx="8" cy="14" r="1"/><circle cx="16" cy="14" r="1"/>',
    car: '<path d="M5 13.5 6.4 9A2 2 0 0 1 8.3 7.6h7.4A2 2 0 0 1 17.6 9L19 13.5V18h-2.5M5 18v-4.5M5 18h2.5"/><circle cx="8" cy="17.5" r="1.6"/><circle cx="16" cy="17.5" r="1.6"/>',
    stay: '<path d="M3.5 20.5V9L12 4l8.5 5v11.5M3.5 20.5h17M9.5 20.5v-5h5v5"/>',
    pin: '<path d="M12 21.5s6.5-6 6.5-10.5a6.5 6.5 0 0 0-13 0C5.5 15.5 12 21.5 12 21.5z"/><circle cx="12" cy="11" r="2.3"/>',
    trash: '<path d="M4 7h16M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2M6.5 7l.9 12.1a2 2 0 0 0 2 1.9h5.2a2 2 0 0 0 2-1.9L19.5 7M10 11v6M14 11v6"/>',
    plus: '<path d="M12 5v14M5 12h14"/>'
  };
  var MODE_ICON = { flight: "plane", rail: "train", bus: "bus", ferry: "ferry", road: "car" };
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function icon(name, cls) {
    return '<svg class="ico ' + (cls || "") + '" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + (ICONS[name] || ICONS.pin) + "</svg>";
  }

  var params = new URLSearchParams(location.search);
  var tripKey = window.TRIPS[params.get("trip")] ? params.get("trip") : "thailand";
  var trip = window.TRIPS[tripKey];

  // --- sidebar nav ---
  document.getElementById("nav").innerHTML =
    '<a href="#/" class="active" data-route="/">Home</a>' +
    '<a href="#/whats-new" data-route="/whats-new">What’s New</a>';

  // --- timeline markup (mirrors public/app.js stepCardHTML) ---
  function chip(status) { var st = status || "Idea"; return '<div class="step-status"><span class="chip status-' + esc(st) + '">' + esc(st) + "</span></div>"; }
  function durHTML(s) { return s.dur ? '<span class="step-dur">' + esc(s.dur) + "</span>" : ""; }
  var openChev = '<a class="step-open" aria-label="Open details">›</a>';

  function stepHTML(s, i) {
    if (s.kind === "travel") {
      return '<li class="step travel" data-idx="' + i + '">' +
        '<span class="marker travel" aria-hidden="true">' + icon(MODE_ICON[s.mode] || "plane") + "</span>" +
        '<div class="leg"><div class="leg-top"><a class="leg-title">' + esc(s.title) + "</a>" + durHTML(s) + openChev + "</div>" +
        '<div class="leg-sub"><span class="leg-when">' + esc(s.dates || "") + "</span></div>" + chip(s.status) + "</div></li>";
    }
    var media = s.photo ? '<img class="pin-media" alt="" decoding="async" src="' + esc(s.photo) + '">' : "";
    return '<li class="step stay" data-idx="' + i + '">' +
      '<span class="marker stay" aria-hidden="true"></span>' +
      '<div class="step-card' + (s.photo ? " pinned" : "") + '">' + media +
        '<div class="pin-body">' +
          '<div class="step-head">' + icon("stay", "step-kind") + '<a class="step-title">' + esc(s.title) + "</a>" + durHTML(s) + openChev + "</div>" +
          '<div class="step-sub"><span class="stay-when">' + esc(s.dates || "") + "</span></div>" + chip(s.status) +
        "</div></div></li>";
  }
  function inserter() { return '<li class="tl-insert"><button type="button" class="insert-btn">' + icon("plus") + "add step</button></li>"; }

  var body = "";
  trip.steps.forEach(function (s, i) { body += inserter() + stepHTML(s, i); });
  body += inserter();

  var hero = '<div class="trip-hero"><div class="hero-top">' +
    '<a class="back" href="#/">' + icon("pin") + "All trips</a>" +
    '<a class="trash-link" href="#/">' + icon("trash") + "Trash</a></div>" +
    "<h1>" + esc(trip.title) + "</h1>" + (trip.range ? '<div class="muted mono">' + esc(trip.range) + "</div>" : "") + "</div>";
  var subnav = '<nav class="subnav" aria-label="Trip sections">' +
    '<a href="#/" data-view="timeline" aria-current="page">Timeline</a>' +
    '<a href="#/" data-view="budget">Budget</a>' +
    '<a href="#/" data-view="packing">Packing</a>' +
    '<a href="#/" data-view="map">Map</a></nav>';
  var hint = '<p class="tl-hint muted">Tap a step to move the map to it.</p>';
  document.getElementById("view").innerHTML = hero + subnav + '<div class="panel tl-panel"><ol class="tl">' + body + "</ol></div>";

  // --- stays (map stops) ---
  var stays = [];
  trip.steps.forEach(function (s, i) { if (s.kind === "stay" && s.lat != null) stays.push({ stepIdx: i, stayIdx: stays.length, lat: s.lat, lng: s.lng, title: s.title }); });
  function stayIdxOfStep(i) { for (var k = 0; k < stays.length; k++) if (stays[k].stepIdx === i) return k; return -1; }
  function targetFor(i) {
    var s = trip.steps[i];
    if (s.kind === "stay" && s.lat != null) return { target: { lat: s.lat, lng: s.lng }, activeStay: stayIdxOfStep(i) };
    var prev = null, next = null;
    for (var p = i - 1; p >= 0; p--) if (trip.steps[p].kind === "stay" && trip.steps[p].lat != null) { prev = p; break; }
    for (var q = i + 1; q < trip.steps.length; q++) if (trip.steps[q].kind === "stay" && trip.steps[q].lat != null) { next = q; break; }
    var dest = next != null ? next : prev;
    if (dest == null) return null;
    var ds = trip.steps[dest];
    return { target: { lat: ds.lat, lng: ds.lng }, activeStay: stayIdxOfStep(dest) };
  }

  // --- map (tap-driven only) ---
  var mapEl = document.getElementById("trip-map");
  var reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  var stepEls = Array.prototype.slice.call(document.querySelectorAll("#view .step"));
  var controller = null, activeStep = -1;

  function setActive(i) { activeStep = i; stepEls.forEach(function (el) { el.classList.toggle("active", +el.dataset.idx === i); }); }
  // Screen position of a step's spine marker → the map aligns the stop's location there.
  function markerAnchor(i) {
    var el = null; stepEls.forEach(function (e) { if (+e.dataset.idx === i) el = e; });
    var m = el && el.querySelector(".marker");
    if (!m) return null;
    var r = m.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }
  function focusStep(i, animate) {
    setActive(i);
    // Travel legs are the LINES between stops, not locations — they don't move the map / drop a pin.
    if (trip.steps[i].kind !== "stay") return;
    var t = targetFor(i);
    if (controller && t) controller.focus(t.target, t.activeStay, animate && !reduced, markerAnchor(i));
  }
  // Timeline (faded background) <-> Map (full, interactive map of all stops).
  function setMode(mode) {
    document.body.classList.toggle("map-view", mode === "map");
    document.querySelectorAll(".subnav a[data-view]").forEach(function (a) {
      if (a.getAttribute("data-view") === mode) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current");
    });
    if (!controller) return;
    controller.onResize();
    if (mode === "map") controller.fitAll(true);
    else if (activeStep >= 0) focusStep(activeStep, false);
  }

  stepEls.forEach(function (el) {
    el.addEventListener("click", function (ev) { ev.preventDefault(); focusStep(+el.dataset.idx, true); });
  });

  var ctx = { stays: stays, reducedMotion: reduced, hooks: { selectStay: function (si) { var st = stays[si]; if (st) focusStep(st.stepIdx, true); } } };
  window.PROTO.setup(mapEl, ctx).then(function (c) {
    controller = c;
    var first = stays.length ? stays[0].stepIdx : 0;
    focusStep(first, false);
  });

  // --- chrome wiring ---
  document.getElementById("theme-toggle").addEventListener("click", function () {
    var t = document.documentElement.getAttribute("data-theme") === "light" ? "dark" : "light";
    document.documentElement.setAttribute("data-theme", t);
    try { localStorage.setItem("app-theme", t); } catch (e) {}
  });
  document.getElementById("menu-toggle").addEventListener("click", function () { document.getElementById("side").classList.toggle("collapsed"); });
  document.querySelectorAll(".proto-ctl button[data-trip]").forEach(function (b) {
    if (b.getAttribute("data-trip") === tripKey) b.classList.add("here");
    b.addEventListener("click", function () { var u = new URL(location.href); u.searchParams.set("trip", b.getAttribute("data-trip")); location.href = u.toString(); });
  });
  document.querySelectorAll(".subnav a[data-view]").forEach(function (a) {
    a.addEventListener("click", function (ev) { ev.preventDefault(); var v = a.getAttribute("data-view"); if (v === "map" || v === "timeline") setMode(v); });
  });
  window.addEventListener("resize", function () {
    if (!controller) return;
    controller.onResize();
    if (document.body.classList.contains("map-view")) controller.fitAll(false);
    else if (activeStep >= 0) focusStep(activeStep, false);
  });
})();
