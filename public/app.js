"use strict";
/* Travel Planner SPA — no build, no framework. Hash router + fetch helpers + an inline,
   XSS-safe markdown renderer (used by What's New). Per-app content lives in public/data/*.json. */

// ---- tiny helpers ----------------------------------------------------------
const $ = (sel, el) => (el || document).querySelector(sel);
const view = () => $("#view");
function esc(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}
const _cache = new Map();
async function fetchJSON(path) {                 // cached — for static data/*.json
  if (_cache.has(path)) return _cache.get(path);
  const r = await fetch(path, { headers: { accept: "application/json" } });
  if (!r.ok) throw new Error(path + " -> " + r.status);
  const j = await r.json(); _cache.set(path, j); return j;
}
async function api(path, opts) {                 // live — for /api/* (never cached)
  const r = await fetch("api/" + path, opts);
  let body = null; try { body = await r.json(); } catch {}
  if (!r.ok) {
    const e = new Error((body && body.error) || (path + " -> " + r.status));
    e.status = r.status; e.code = body && body.code;   // surface HTTP status + app error code (e.g. no_rate)
    throw e;
  }
  return body;
}

// ---- motion / view-transition helpers --------------------------------------
function prefersReducedMotion() { try { return matchMedia("(prefers-reduced-motion: reduce)").matches; } catch { return false; } }
// Wrap a DOM-updating render in a View Transition when supported + motion allowed; else render directly.
function vt(render) {
  if (typeof document.startViewTransition !== "function" || prefersReducedMotion()) return render();
  try { return document.startViewTransition(render); } catch { return render(); }
}
// Run an anime.js-driven animation only when the lib is present and motion is allowed; no-op otherwise.
function motion(run) {
  if (prefersReducedMotion() || !window.anime) return;
  try { run(window.anime); } catch {}
}

// ---- inline-SVG icons (currentColor; never emoji) --------------------------
const ICONS = {
  plane: '<path d="M17.8 19.2 16 11l3.5-3.5a2.1 2.1 0 0 0-3-3L13 8 4.8 6.2a.5.5 0 0 0-.5.8L9 11l-2 2-2.5-.5a.5.5 0 0 0-.4.9L7 16l1.7 2.8a.5.5 0 0 0 .9-.4L9 16l2-2 3.9 4.7a.5.5 0 0 0 .9-.5z"/>',
  train: '<rect x="6" y="4" width="12" height="12.5" rx="3"/><path d="M6 11.5h12M8.5 20.5 7 22M15.5 20.5 17 22"/><circle cx="9.2" cy="13.7" r="1"/><circle cx="14.8" cy="13.7" r="1"/>',
  ferry: '<path d="M4 15.5 5.4 19a2 2 0 0 0 1.9 1.3h9.4A2 2 0 0 0 18.6 19L20 15.5M6 15.5V9h12v6.5M9.5 9V5.5h5V9"/>',
  bus:   '<rect x="4" y="5" width="16" height="11.5" rx="3"/><path d="M4 11.5h16M7.5 20.5v-2M16.5 20.5v-2"/><circle cx="8" cy="14" r="1"/><circle cx="16" cy="14" r="1"/>',
  car:   '<path d="M5 13.5 6.4 9A2 2 0 0 1 8.3 7.6h7.4A2 2 0 0 1 17.6 9L19 13.5V18h-2.5M5 18v-4.5M5 18h2.5"/><circle cx="8" cy="17.5" r="1.6"/><circle cx="16" cy="17.5" r="1.6"/>',
  stay:  '<path d="M3.5 20.5V9L12 4l8.5 5v11.5M3.5 20.5h17M9.5 20.5v-5h5v5"/>',
  pin:   '<path d="M12 21.5s6.5-6 6.5-10.5a6.5 6.5 0 0 0-13 0C5.5 15.5 12 21.5 12 21.5z"/><circle cx="12" cy="11" r="2.3"/>',
  link:  '<path d="M9 15l6-6M10.5 6.5 12 5a4 4 0 0 1 6 6l-2 2M13.5 17.5 12 19a4 4 0 0 1-6-6l2-2"/>',
  check: '<path d="M5 12.5 10 17.5 19 6.5"/>'
};
function icon(name, cls) {
  const p = ICONS[name] || ICONS.pin;
  return '<svg class="ico ' + esc(cls || "") + '" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + p + "</svg>";
}
const MODE_ICON = { plane: "plane", train: "train", bus: "bus", ferry: "ferry", car: "car" };

// ---- money display (per-line only; authoritative totals come from /api/budget in M7) ----
function money(amt, ccy) {
  if (amt == null || amt === "") return ""; const n = Number(amt); if (!isFinite(n)) return "";
  return ccy === "EUR" ? ("€" + n.toFixed(2)) : ("฿" + Math.round(n).toLocaleString("en-US"));
}
function eurEquiv(amt, ccy, rate) {
  const r = Number(rate);
  if (amt == null || amt === "" || ccy === "EUR" || !isFinite(r) || r <= 0) return "";
  const n = Number(amt); if (!isFinite(n)) return "";
  return "≈ €" + (n / r).toFixed(2);
}
// Only http(s) URLs may be rendered into an href (esc() does NOT neutralize a javascript:/data: scheme).
function safeUrl(u) { return /^https?:\/\//i.test(String(u == null ? "" : u)) ? String(u) : ""; }
function mapsUrl(row) {
  if (row.lat != null && row.lat !== "" && row.lng != null && row.lng !== "")
    return "https://www.openstreetmap.org/?mlat=" + encodeURIComponent(row.lat) + "&mlon=" + encodeURIComponent(row.lng) + "#map=12/" + encodeURIComponent(row.lat) + "/" + encodeURIComponent(row.lng);
  return safeUrl(row.map_url);
}
function fmtDate(d) { if (!d) return ""; const p = String(d).split("-"); if (p.length !== 3) return String(d);
  const m = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"]; return (+p[2]) + " " + (m[(+p[1]) - 1] || p[1]); }
// A stable, CSS-ident-safe view-transition-name for an activity (shared by the timeline title + detail h1).
function vtName(id) { return "act-" + String(id == null ? "" : id).replace(/[^A-Za-z0-9_-]/g, "-"); }

// ---- self-contained markdown renderer (escapes raw HTML; no external lib) --
function renderMarkdown(src) {
  const lines = String(src || "").replace(/\r\n?/g, "\n").split("\n");
  let out = "", i = 0;
  const renderInline = (t) => {
    let s = esc(t);
    s = s.replace(/`([^`]+)`/g, (_, c) => "<code>" + c + "</code>");
    s = s.replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, '<a href="$2" rel="noopener" target="_blank">$1</a>');
    s = s.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
    s = s.replace(/(^|[^*])\*([^*\n]+)\*/g, "$1<em>$2</em>");
    return s;
  };
  while (i < lines.length) {
    let ln = lines[i];
    if (/^```/.test(ln)) { i++; let buf = [];
      while (i < lines.length && !/^```/.test(lines[i])) { buf.push(lines[i]); i++; }
      i++; out += "<pre><code>" + esc(buf.join("\n")) + "</code></pre>"; continue; }
    if (/^\s*$/.test(ln)) { i++; continue; }
    if (/^#{1,6}\s/.test(ln)) { const m = ln.match(/^(#{1,6})\s+(.*)$/);
      out += "<h" + m[1].length + ">" + renderInline(m[2]) + "</h" + m[1].length + ">"; i++; continue; }
    if (/^\s*([-*+])\s+/.test(ln)) { out += "<ul>";
      while (i < lines.length && /^\s*([-*+])\s+/.test(lines[i])) { out += "<li>" + renderInline(lines[i].replace(/^\s*([-*+])\s+/, "")) + "</li>"; i++; }
      out += "</ul>"; continue; }
    if (/^\s*\d+\.\s+/.test(ln)) { out += "<ol>";
      while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i])) { out += "<li>" + renderInline(lines[i].replace(/^\s*\d+\.\s+/, "")) + "</li>"; i++; }
      out += "</ol>"; continue; }
    if (/^>\s?/.test(ln)) { let buf = [];
      while (i < lines.length && /^>\s?/.test(lines[i])) { buf.push(lines[i].replace(/^>\s?/, "")); i++; }
      out += "<blockquote>" + renderInline(buf.join(" ")) + "</blockquote>"; continue; }
    if (/^(-{3,}|\*{3,}|_{3,})\s*$/.test(ln)) { out += "<hr/>"; i++; continue; }
    let buf = [ln]; i++;
    while (i < lines.length && !/^\s*$/.test(lines[i]) && !/^(#{1,6}\s|```|>\s?|\s*([-*+])\s+|\s*\d+\.\s+)/.test(lines[i])) { buf.push(lines[i]); i++; }
    out += "<p>" + renderInline(buf.join(" ")) + "</p>";
  }
  return out;
}

// ---- app state -------------------------------------------------------------
const state = { me: null, app: null, releases: null, trips: null, trip: {} };

async function loadMe() {
  try { state.me = await api("me"); } catch { state.me = { email: "", isSuperAdmin: false, mock: false }; }
  $("#who").textContent = state.me.email || "";
  $("#demo-banner").hidden = !state.me.mock;
}
async function loadTrips() {
  if (state.trips) return state.trips;
  try { const d = await api("trips/app/trips"); state.trips = (d && d.rows) || []; }
  catch { state.trips = []; }
  return state.trips;
}
async function loadTrip(slug) {
  if (state.trip[slug]) return state.trip[slug];
  const trips = await loadTrips();
  const trip = trips.find(t => t.slug === slug) || null;
  let steps = [];
  try { const d = await api("steps/" + encodeURIComponent(slug) + "/flow"); steps = (d && d.rows) || []; } catch {}
  let activities = [];
  try { const d = await api("activities/" + encodeURIComponent(slug) + "/activities"); activities = (d && d.rows) || []; } catch {}
  // Group live activities under their parent step; anything whose step_id matches no live step is "unassigned".
  const liveStepIds = new Set(steps.filter(s => !s.deleted).map(s => s.id));
  const byStep = {}, unassigned = [];
  activities.filter(a => !a.deleted).forEach(a => {
    if (liveStepIds.has(a.step_id)) (byStep[a.step_id] = byStep[a.step_id] || []).push(a);
    else unassigned.push(a);
  });
  state.trip[slug] = { trip, steps, activities, byStep, unassigned };
  return state.trip[slug];
}
function invalidateTrip(slug) { delete state.trip[slug]; }

// ---- inline edit (field-driven; whitelist grows in later milestones) -------
// Render a tappable control that swaps to an <input>/<select> on click. `displayHTML`
// is ALREADY-escaped display markup; `o.value` is the raw current value (esc'd into an attr).
function editable(displayHTML, o) {
  o = o || {};
  return '<button type="button" class="editable"' +
    ' data-entity="' + esc(o.entity) + '"' +
    ' data-list="'   + esc(o.list)   + '"' +
    (o.space ? ' data-space="' + esc(o.space) + '"' : "") +  // override the URL space (trips live at space='app', not the slug)
    ' data-id="'     + esc(o.id)     + '"' +
    ' data-field="'  + esc(o.field)  + '"' +
    ' data-input="'  + esc(o.input)  + '"' +
    ' data-value="'  + esc(o.value == null ? "" : o.value) + '"' +
    (o.options ? ' data-options="' + esc(Array.isArray(o.options) ? o.options.join("|") : o.options) + '"' : "") +
    ' aria-label="Edit ' + esc(o.field || "value") + '">' + displayHTML + "</button>";
}
function tripSlugFromHash() {
  const parts = (location.hash.replace(/^#/, "") || "/").split("/").filter(Boolean);
  return (parts[0] === "trip" && parts[1]) ? decodeURIComponent(parts[1]) : "";
}
function openEditor(btn) {
  if (document.querySelector(".edit-input, .edit-select")) return;   // one editor at a time
  const slug = tripSlugFromHash();
  if (!slug) return;
  const d = btn.dataset, field = d.field, cur = d.value || "";
  const pathSpace = d.space || slug;                  // trip-level fields patch under space='app'; child rows use the slug
  let ctrl;
  if (d.input === "select") {
    ctrl = document.createElement("select");
    ctrl.className = "edit-select";
    (d.options || "").split("|").filter(Boolean).forEach(o => {
      const op = document.createElement("option");
      op.value = o; op.textContent = o; if (o === cur) op.selected = true;
      ctrl.appendChild(op);
    });
  } else if (d.input === "textarea") {                 // multiline (e.g. notes)
    ctrl = document.createElement("textarea");
    ctrl.className = "edit-input edit-textarea"; ctrl.rows = 5; ctrl.value = cur;
  } else {
    ctrl = document.createElement("input");
    ctrl.type = "text"; ctrl.inputMode = "decimal";   // NEVER type=number (iOS)
    ctrl.className = "edit-input"; ctrl.value = cur;
  }
  ctrl.setAttribute("aria-label", btn.getAttribute("aria-label") || ("Edit " + field));

  let settled = false;                                  // guards blur/change/Enter double-fire
  const revert = (msg) => {
    if (settled) return; settled = true;
    ctrl.replaceWith(btn);
    if (msg) {
      const m = document.createElement("span");
      m.className = "edit-err"; m.setAttribute("role", "alert"); m.textContent = msg;
      btn.insertAdjacentElement("afterend", m);
      setTimeout(() => m.remove(), 4000);
    }
  };
  const commit = async () => {
    if (settled) return;
    const val = d.input === "select" ? ctrl.value : ctrl.value.trim();
    if (val === cur) { revert(); return; }                              // no change
    if (d.input === "decimal" && val !== "" && !isFinite(Number(val))) { revert("Not a number"); return; }
    settled = true; ctrl.disabled = true;                              // lock during write
    try {
      await api(d.entity + "/" + encodeURIComponent(pathSpace) + "/" + d.list + "/" + encodeURIComponent(d.id),
        { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ [field]: val }) });
      invalidateTrip(slug);
      vt(route);                                                       // full re-render with new value
    } catch {
      settled = false; revert("Couldn’t save");                       // never crash — revert + inline msg
    }
  };
  const cancel = () => revert();
  ctrl.addEventListener("keydown", (e) => {
    // textarea: Enter inserts a newline (never commits); Escape still cancels.
    if (e.key === "Enter" && d.input !== "textarea") { e.preventDefault(); commit(); }
    else if (e.key === "Escape") { e.preventDefault(); cancel(); }
  });
  if (d.input === "select") { ctrl.addEventListener("change", commit); ctrl.addEventListener("blur", cancel); }
  else { ctrl.addEventListener("blur", commit); }                     // input + textarea commit on blur

  btn.replaceWith(ctrl);
  ctrl.focus();
  if (d.input === "decimal" && ctrl.select) ctrl.select();            // pre-select numeric value for quick replace
}
let _editableBound = false;
function bindEditable() {                                // attach the ONE delegated listener once
  if (_editableBound) return; _editableBound = true;
  document.addEventListener("click", (e) => {
    const btn = e.target.closest(".editable");
    if (!btn || document.querySelector(".edit-input, .edit-select")) return;
    openEditor(btn);
  });
}

// ---- nav -------------------------------------------------------------------
function buildNav() {
  $("#nav").innerHTML =
    '<a href="#/" data-route="/">Home</a>' +
    '<a href="#/whats-new" data-route="/whats-new">What’s New</a>';
}
function markActive(route) {
  document.querySelectorAll("#nav a").forEach(a => a.classList.toggle("active", a.getAttribute("data-route") === route));
}

// ---- views -----------------------------------------------------------------
async function viewHome() {
  markActive("/");
  const title = (state.app && state.app.title) || "Travel Planner";
  view().innerHTML = '<div class="panel"><h1>' + esc(title) + '</h1><p class="muted">Loading trips…</p></div>';
  const trips = await loadTrips();
  let body;
  if (!trips.length) {
    body = '<p class="muted">No trips yet. Ask Claude to create one — e.g. <em>"Start a Thailand trip, 21 days, €2000, 39 baht to the euro."</em></p>';
  } else {
    body = '<div class="cards">' + trips.map(t => {
      const range = [fmtDate(t.start_date), fmtDate(t.end_date)].filter(Boolean).join(" – ");
      return '<a class="card trip-card" href="#/trip/' + esc(t.slug) + '">' +
        '<div class="row-title">' + esc(t.title || t.slug) + "</div>" +
        (range ? '<div class="row-note mono">' + esc(range) + "</div>" : "") +
        (t.note ? '<div class="row-note">' + esc(t.note) + "</div>" : "") + "</a>";
    }).join("") + "</div>";
  }
  view().innerHTML = '<div class="panel"><h1>' + esc(title) + "</h1>" + body + "</div>";
}

// A compact activity sub-card nested under its parent stay. cost_actual + booking_status are
// inline-editable (entity/list = activities); everything is esc'd; reuses money/eurEquiv/mapsUrl.
function activityCardHTML(a, rate, slug) {
  const st = a.booking_status || "Idea";
  const chip = editable('<span class="chip status-' + esc(st) + '">' + esc(st) + "</span>",
    { entity: "activities", list: "activities", id: a.id, field: "booking_status", input: "select", value: st, options: "Idea|Planned|Booked|Confirmed" });
  const estHTML = (a.cost_est != null && a.cost_est !== "")
    ? '<span class="cost mono est muted">est ' + esc(money(a.cost_est, a.cost_ccy)) + "</span>" : "";
  const act = a.cost_actual;
  const actDisplay = (act != null && act !== "")
    ? '<span class="cost mono">' + esc(money(act, a.cost_ccy)) +
      (eurEquiv(act, a.cost_ccy, rate) ? ' <span class="muted">' + esc(eurEquiv(act, a.cost_ccy, rate)) + "</span>" : "") + "</span>"
    : '<span class="add-actual">+ actual</span>';
  const actHTML = editable(actDisplay, { entity: "activities", list: "activities", id: a.id, field: "cost_actual", input: "decimal", value: act });
  const flag = a.needs_advance === "yes" ? '<span class="flag">' + icon("link") + "book ahead</span>" : "";
  const mu = mapsUrl(a);
  const maplink = mu ? '<a class="maplink" href="' + esc(mu) + '" target="_blank" rel="noopener">' + icon("pin") + "Map</a>" : "";
  // The TITLE (only) is a link to the activity detail view; status/cost stay inline-editable outside the link.
  const href = "#/trip/" + encodeURIComponent(slug || "") + "/activity/" + encodeURIComponent(a.id);
  const titleHTML = '<a class="act-title" href="' + esc(href) + '" style="view-transition-name:' + esc(vtName(a.id)) + '">' +
    esc(a.title || a.location) + "</a>";
  return '<li class="activity">' +
    '<span class="sub-marker" aria-hidden="true"></span>' +
    '<div class="act-card">' +
      '<div class="act-head">' + titleHTML + chip + flag + "</div>" +
      '<div class="act-meta">' + estHTML + actHTML + maplink + "</div>" +
    "</div></li>";
}

function stepCardHTML(s, rate, acts, slug) {
  const st = s.booking_status || "Idea";
  const chip = editable('<span class="chip status-' + esc(st) + '">' + esc(st) + "</span>",
    { entity: "steps", list: "flow", id: s.id, field: "booking_status", input: "select", value: st, options: "Idea|Planned|Booked|Confirmed" });
  // Estimate is read-only; ACTUAL cost is editable (null -> a subtle "+ actual" affordance).
  const estHTML = (s.cost_est != null && s.cost_est !== "")
    ? '<span class="cost mono est muted">est ' + esc(money(s.cost_est, s.cost_ccy)) + "</span>" : "";
  const act = s.cost_actual;
  const actDisplay = (act != null && act !== "")
    ? '<span class="cost mono">' + esc(money(act, s.cost_ccy)) +
      (eurEquiv(act, s.cost_ccy, rate) ? ' <span class="muted">' + esc(eurEquiv(act, s.cost_ccy, rate)) + "</span>" : "") + "</span>"
    : '<span class="add-actual">+ actual</span>';
  const actHTML = editable(actDisplay, { entity: "steps", list: "flow", id: s.id, field: "cost_actual", input: "decimal", value: act });
  const costHTML = estHTML + actHTML;
  const mu = mapsUrl(s);
  const maplink = mu ? '<a class="maplink" href="' + esc(mu) + '" target="_blank" rel="noopener">' + icon("pin") + "Map</a>" : "";
  const bl = safeUrl(s.booking_url);
  const booklink = bl ? '<a class="maplink" href="' + esc(bl) + '" target="_blank" rel="noopener">' + icon("link") + "Booking</a>" : "";

  if (s.kind === "travel") {
    const mode = MODE_ICON[s.transport] || "plane";
    const when = [s.depart_time ? "dep " + esc(s.depart_time) : "", s.arrive_time ? "arr " + esc(s.arrive_time) : ""].filter(Boolean).join(" · ");
    return '<li class="step travel">' +
      '<span class="marker travel" aria-hidden="true">' + icon(mode) + "</span>" +
      '<div class="leg">' +
        '<div class="leg-top"><span class="leg-title">' + esc(s.title || s.location) + "</span>" + chip + "</div>" +
        '<div class="leg-sub">' + (s.carrier ? '<span class="mono">' + esc(s.carrier) + "</span>" : "") +
          (when ? ' <span class="muted mono">' + when + "</span>" : "") + "</div>" +
        '<div class="step-meta">' + costHTML + maplink + booklink + "</div>" +
      "</div></li>";
  }
  const nights = (s.arrive && s.depart) ? '<span class="muted mono">' + esc(fmtDate(s.arrive)) + " → " + esc(fmtDate(s.depart)) + "</span>" : "";
  const actsHTML = (acts && acts.length)
    ? '<ul class="acts">' + acts.map(a => activityCardHTML(a, rate, slug)).join("") + "</ul>" : "";
  return '<li class="step stay">' +
    '<span class="marker stay" aria-hidden="true"></span>' +
    '<div class="step-card">' +
      '<div class="step-head">' + icon("stay", "step-kind") + '<span class="step-title">' + esc(s.title || s.location) + "</span>" + chip + "</div>" +
      '<div class="step-sub">' + nights + (s.accom_name ? ' <span>· ' + esc(s.accom_name) + "</span>" : "") + "</div>" +
      '<div class="step-meta">' + costHTML + maplink + booklink + "</div>" +
      actsHTML +
    "</div></li>";
}

// Shared per-trip sub-nav: a sticky, horizontally-scrollable chip-tab row. Adding a tab (e.g. Packing
// in M8) is a one-line push to `tabs`. `active` is the tab key; it gets aria-current="page".
function renderSubnav(slug, active) {
  const s = encodeURIComponent(slug);
  const tabs = [
    { key: "timeline", label: "Timeline", href: "#/trip/" + s },
    { key: "budget",   label: "Budget",   href: "#/trip/" + s + "/budget" },
    { key: "packing",  label: "Packing",  href: "#/trip/" + s + "/packing" }
  ];
  return '<nav class="subnav" aria-label="Trip sections">' +
    tabs.map(t => '<a href="' + t.href + '"' + (t.key === active ? ' aria-current="page"' : "") +
      ">" + esc(t.label) + "</a>").join("") + "</nav>";
}

async function viewTimeline(slug) {
  markActive(null);
  view().innerHTML = '<div class="panel"><p class="muted">Loading trip…</p></div>';
  const { trip, steps, byStep, unassigned } = await loadTrip(slug);
  if (!trip) { view().innerHTML = '<div class="panel"><h1>Trip not found</h1><p class="muted"><a href="#/">← All trips</a></p></div>'; return; }
  const rate = trip.thb_per_eur;
  const title = trip.title || slug;
  const range = [fmtDate(trip.start_date), fmtDate(trip.end_date)].filter(Boolean).join(" – ");
  const hint = '<p class="tl-hint muted">Tap a cost or status to edit it inline. To add or reorder steps, ask Claude.</p>';
  const body = steps.length
    ? '<ol class="tl">' + steps.map(s => stepCardHTML(s, rate, byStep[s.id], slug)).join("") + "</ol>"
    : '<p class="muted">No steps yet. Ask Claude to add a stay or a travel leg.</p>';
  // Activities whose parent step no longer exists get their own group so they're never dropped.
  const unassignedHTML = (unassigned && unassigned.length)
    ? '<section class="unassigned"><h2 class="unassigned-title">Unassigned</h2>' +
      '<ul class="acts acts-loose">' + unassigned.map(a => activityCardHTML(a, rate, slug)).join("") + "</ul></section>"
    : "";
  view().innerHTML =
    '<div class="trip-hero"><a class="back" href="#/">' + icon("pin") + "All trips</a>" +
      "<h1>" + esc(title) + "</h1>" + (range ? '<div class="muted mono">' + esc(range) + "</div>" : "") +
      (trip && trip.note ? '<div class="muted">' + esc(trip.note) + "</div>" : "") + "</div>" +
    renderSubnav(slug, "timeline") +
    '<div class="panel tl-panel">' + hint + body + unassignedHTML + "</div>";
  // signature entrance: stagger the markers in (reduced-motion + no-anime safe).
  motion(a => a.animate(".tl .step", { opacity: [0, 1], translateY: [8, 0], delay: a.stagger(45), duration: 380, ease: "out(3)" }));
}

// Budget view: authoritative EUR totals + a projected-vs-target meter + a category breakdown.
// Every money value from /api/budget is already EUR, 2dp — render verbatim (money() just adds the €).
async function viewBudget(slug) {
  markActive(null);
  view().innerHTML = '<div class="panel"><p class="muted">Loading budget…</p></div>';
  const { trip } = await loadTrip(slug);
  if (!trip) { view().innerHTML = '<div class="panel"><h1>Trip not found</h1><p class="muted"><a href="#/">← All trips</a></p></div>'; return; }

  const title = trip.title || slug;
  const range = [fmtDate(trip.start_date), fmtDate(trip.end_date)].filter(Boolean).join(" – ");
  const hero = '<div class="trip-hero"><a class="back" href="#/">' + icon("pin") + "All trips</a>" +
    "<h1>" + esc(title) + "</h1>" + (range ? '<div class="muted mono">' + esc(range) + "</div>" : "") +
    (trip.note ? '<div class="muted">' + esc(trip.note) + "</div>" : "") + "</div>";
  const shell = hero + renderSubnav(slug, "budget");

  // Trip-level inline edits — trips live at space='app', so pass space:"app" (see openEditor).
  const rateV = trip.thb_per_eur;
  const rateEd = editable((rateV != null && rateV !== "") ? esc(String(rateV)) : '<span class="add-actual">+ set rate</span>',
    { entity: "trips", list: "trips", space: "app", id: trip.id, field: "thb_per_eur", input: "decimal", value: rateV });
  const tgtV = trip.budget_target_eur;
  const tgtEd = editable((tgtV != null && tgtV !== "") ? esc(money(tgtV, "EUR")) : '<span class="add-actual">+ set target</span>',
    { entity: "trips", list: "trips", space: "app", id: trip.id, field: "budget_target_eur", input: "decimal", value: tgtV });

  // Fetch authoritative totals. A trip with no FX rate returns 422 no_rate — show a friendly prompt.
  let b = null, failCode = "", failMsg = "";
  try { b = await api("budget/" + encodeURIComponent(slug)); }
  catch (e) { failCode = e.code || ""; failMsg = e.message || ""; }

  if (!b) {
    const isNoRate = failCode === "no_rate" || /rate/i.test(failMsg);
    const panel = isNoRate
      ? '<div class="panel budget-norate">' +
          "<h2>Set your exchange rate to see the budget</h2>" +
          '<p class="muted">Estimates are stored in Thai baht. Enter how many baht equal one euro and the budget appears.</p>' +
          '<div class="cfg-row"><span class="cfg-label">Exchange rate</span>' +
            '<span class="cfg-val">' + rateEd + ' <span class="muted">฿ per €</span></span></div>' +
        "</div>"
      : '<div class="panel"><h2>Budget unavailable</h2><p class="muted">' + esc(failMsg || "Couldn’t load the budget.") + "</p></div>";
    view().innerHTML = shell + panel;
    return;
  }

  const homeC = b.home_ccy || "EUR";
  const hasTarget = b.target != null && Number(b.target) > 0;

  // ---- totals ----
  const tile = (label, val, cls) => '<div class="stat' + (cls ? " " + cls : "") + '">' +
    '<div class="stat-label">' + esc(label) + "</div><div class=\"stat-val mono\">" + esc(val) + "</div></div>";
  const totals = '<div class="stats">' +
    tile("Estimated", money(b.totalEst, homeC)) +
    tile("Actual", money(b.totalActual, homeC)) +
    (hasTarget ? tile("Remaining", money(b.remaining, homeC), Number(b.remaining) < 0 ? "neg" : "") : "") +
    (hasTarget ? tile("Projected", money(b.projectedSpend, homeC), b.over ? "neg" : "") : "") +
    "</div>";

  // ---- projected-vs-target meter (fill width set in JS after insert; no inline style attr) ----
  let meter = "";
  if (hasTarget) {
    const pct = b.pct == null ? 0 : b.pct;
    const vtext = "Projected spend " + money(b.projectedSpend, homeC) + " of " + money(b.target, homeC) + " target (" + pct + "%)";
    const cap = b.over
      ? '<div class="meter-cap over">Over by ' + esc(money(Number(b.projectedSpend) - Number(b.target), homeC)) + "</div>"
      : '<div class="meter-cap">' + esc(money(b.projected, homeC)) + " under target</div>";
    meter = '<div class="meter-block">' +
      '<div class="meter-top"><span class="meter-legend">Projected ' + esc(money(b.projectedSpend, homeC)) +
        " / " + esc(money(b.target, homeC)) + '</span><span class="meter-pct' + (b.over ? " over" : "") + '">' +
        esc(String(pct)) + "%</span></div>" +
      '<div class="meter' + (b.over ? " over" : "") + '" role="meter" aria-valuemin="0" aria-valuemax="' +
        esc(String(b.target)) + '" aria-valuenow="' + esc(String(b.projectedSpend)) + '" aria-valuetext="' + esc(vtext) + '">' +
        '<div class="meter-fill" id="budget-meter-fill" data-pct="' + esc(String(Math.min(100, pct))) + '"></div>' +
        '<div class="meter-mark" aria-hidden="true"></div>' +
      "</div>" + cap + "</div>";
  }

  // ---- category breakdown (estimated EUR); bar widths set in JS after insert ----
  const bc = b.byCategory || {};
  const cats = [["Accommodation", Number(bc.accommodation) || 0], ["Transport", Number(bc.transport) || 0], ["Activities", Number(bc.activities) || 0]];
  const maxCat = Math.max.apply(null, cats.map(c => c[1]).concat([0])) || 1;
  const denom = Number(b.totalEst) || cats.reduce((s, c) => s + c[1], 0) || 1;
  const catbars = '<div class="catbars">' + cats.map(c => {
    const w = Math.round(c[1] / maxCat * 100), share = Math.round(c[1] / denom * 100);
    return '<div class="catbar"><div class="catbar-label">' + esc(c[0]) + "</div>" +
      '<div class="catbar-track"><div class="catbar-fill" data-w="' + esc(String(w)) + '"></div></div>' +
      '<div class="catbar-val mono">' + esc(money(c[1], homeC)) + ' <span class="muted">' + esc(String(share)) + "%</span></div></div>";
  }).join("") + "</div>";

  const config = '<div class="budget-config">' +
    '<div class="cfg-row"><span class="cfg-label">Exchange rate</span>' +
      '<span class="cfg-val">' + rateEd + ' <span class="muted">฿ per €</span></span></div>' +
    '<div class="cfg-row"><span class="cfg-label">Budget target</span>' +
      '<span class="cfg-val">' + tgtEd + "</span></div></div>";

  view().innerHTML = shell +
    '<div class="panel budget">' +
      totals + meter +
      '<h2 class="cat-h">Where it goes <span class="muted">(estimated)</span></h2>' + catbars +
      config +
    "</div>";

  // Set base widths synchronously (must hold even with reduced motion / no anime), then animate.
  const mf = document.getElementById("budget-meter-fill");
  if (mf) { const w = Number(mf.dataset.pct) || 0; mf.style.width = w + "%"; }
  const fills = Array.prototype.slice.call(document.querySelectorAll(".catbar-fill"));
  fills.forEach(el => { el.style.width = (Number(el.dataset.w) || 0) + "%"; });
  motion(an => {
    if (mf) an.animate(mf, { width: ["0%", (Number(mf.dataset.pct) || 0) + "%"], duration: 640, ease: "out(3)" });
    fills.forEach((el, i) => an.animate(el, { width: ["0%", (Number(el.dataset.w) || 0) + "%"], duration: 560, delay: 80 + i * 70, ease: "out(3)" }));
  });
}

// Activity detail: a bottom-sheet-style view with an editable NOTES section. All values esc'd;
// editable() controls reuse the shared inline-edit plumbing (entity="activities").
async function viewActivity(slug, id) {
  markActive(null);
  view().innerHTML = '<div class="panel"><p class="muted">Loading…</p></div>';
  const { trip, steps, activities } = await loadTrip(slug);
  const back = "#/trip/" + encodeURIComponent(slug);
  const tripTitle = (trip && (trip.title || trip.slug)) || slug;
  const head = '<div class="sheet-head"><a class="back" href="' + esc(back) + '">' +
    '<span class="chev" aria-hidden="true">‹</span> ' + esc(tripTitle) + "</a></div>";
  const a = (activities || []).find(x => String(x.id) === String(id));
  if (!a) {
    view().innerHTML = '<div class="sheet">' + head +
      '<div class="panel detail"><h1>Activity not found</h1>' +
      '<p class="muted"><a href="' + esc(back) + '">← Back to ' + esc(tripTitle) + "</a></p></div></div>";
    return;
  }
  const rate = trip && trip.thb_per_eur;
  const parent = steps.find(s => String(s.id) === String(a.step_id));
  const parentTitle = parent ? (parent.title || parent.location || "Stay") : "Unassigned";

  const st = a.booking_status || "Idea";
  const statusCtrl = editable('<span class="chip status-' + esc(st) + '">' + esc(st) + "</span>",
    { entity: "activities", list: "activities", id: a.id, field: "booking_status", input: "select", value: st, options: "Idea|Planned|Booked|Confirmed" });
  const estHTML = (a.cost_est != null && a.cost_est !== "")
    ? '<span class="cost mono est muted">' + esc(money(a.cost_est, a.cost_ccy)) + "</span>"
    : '<span class="muted">—</span>';
  const act = a.cost_actual;
  const actDisplay = (act != null && act !== "")
    ? '<span class="cost mono">' + esc(money(act, a.cost_ccy)) +
      (eurEquiv(act, a.cost_ccy, rate) ? ' <span class="muted">' + esc(eurEquiv(act, a.cost_ccy, rate)) + "</span>" : "") + "</span>"
    : '<span class="add-actual">+ actual</span>';
  const actCtrl = editable(actDisplay, { entity: "activities", list: "activities", id: a.id, field: "cost_actual", input: "decimal", value: act });
  const dayHTML = (a.day != null && a.day !== "") ? esc(String(a.day)) : "—";

  const flag = a.needs_advance === "yes" ? '<span class="flag">' + icon("link") + "book ahead</span>" : "";
  const mu = mapsUrl(a);
  const maplink = mu ? '<a class="maplink" href="' + esc(mu) + '" target="_blank" rel="noopener">' + icon("pin") + "Map</a>" : "";
  const bl = safeUrl(a.booking_url);
  const booklink = bl ? '<a class="maplink" href="' + esc(bl) + '" target="_blank" rel="noopener">' + icon("link") + "Booking</a>" : "";
  const actionsHTML = (flag || maplink || booklink) ? '<div class="detail-actions">' + flag + maplink + booklink + "</div>" : "";

  const meta = '<div class="detail-meta">' +
    '<div class="mrow"><span class="mlabel">Day</span><span class="mval">' + dayHTML + "</span></div>" +
    '<div class="mrow"><span class="mlabel">Status</span><span class="mval">' + statusCtrl + "</span></div>" +
    '<div class="mrow"><span class="mlabel">Estimated</span><span class="mval">' + estHTML + "</span></div>" +
    '<div class="mrow"><span class="mlabel">Actual</span><span class="mval">' + actCtrl + "</span></div>" +
    actionsHTML + "</div>";

  const noteVal = a.note;
  const noteDisplay = (noteVal != null && String(noteVal).trim() !== "")
    ? '<span class="note-text">' + esc(noteVal).replace(/\n/g, "<br>") + "</span>"
    : '<span class="note-empty muted">Add notes…</span>';
  const noteCtrl = editable(noteDisplay, { entity: "activities", list: "activities", id: a.id, field: "note", input: "textarea", value: noteVal });
  const notes = '<section class="notes"><h2>Notes</h2><div class="notes-body">' + noteCtrl + "</div></section>";

  view().innerHTML = '<div class="sheet">' + head +
    '<div class="panel detail">' +
      '<h1 class="detail-title" style="view-transition-name:' + esc(vtName(a.id)) + '">' + esc(a.title || a.location) + "</h1>" +
      '<div class="detail-context muted">in ' + esc(parentTitle) + "</div>" +
      meta + notes +
    "</div></div>";
  motion(an => an.animate(".detail-meta, .notes", { opacity: [0, 1], translateY: [8, 0], delay: an.stagger(60), duration: 340, ease: "out(3)" }));
}

// ---- packing (M8): a shared checklist scoped by owner (Mine / Partner / Shared) ----
// The active filter is a module var so switching chips re-renders from the cached rows (no refetch).
let _packFilter = "all";
const PACK_SCOPES = [["all", "All"], ["mine", "Mine"], ["partner", "Partner"], ["shared", "Shared"]];
// Mirror shared/core.js filterPacking EXACTLY so the UI and Claude agree on what each scope means.
function packFilterRows(rows, actor, scope) {
  const list = Array.isArray(rows) ? rows : [];
  const a = String(actor == null ? "" : actor).toLowerCase();
  if (scope === "mine") return list.filter(r => r.owner === a);
  if (scope === "partner") return list.filter(r => String(r.owner || "").includes("@") && r.owner !== a);
  if (scope === "shared") return list.filter(r => r.owner === "shared");
  return list;
}
// A per-owner badge: 'shared' -> Shared; my email -> You; any other email -> Partner.
function ownerBadge(owner, actor) {
  const a = String(actor == null ? "" : actor).toLowerCase();
  if (owner === "shared") return '<span class="owner-badge shared">Shared</span>';
  if (owner === a) return '<span class="owner-badge you">You</span>';
  if (String(owner || "").includes("@")) return '<span class="owner-badge partner">Partner</span>';
  return "";
}
// Fetch (once) the packing rows for a trip and cache them on the trip object; drops soft-deleted tombstones.
async function loadPacking(slug) {
  const t = await loadTrip(slug);
  if (!t) return null;
  if (!t.packing) {
    let rows = [];
    try { const d = await api("packing/" + encodeURIComponent(slug) + "/packing"); rows = (d && d.rows) || []; } catch {}
    t.packing = rows.filter(r => !r.deleted);
  }
  return t;
}

function packItemHTML(r, actor) {
  const packed = r.packed === "1";
  const check = '<button type="button" class="pack-check" data-act="toggle" data-id="' + esc(r.id) +
    '" data-packed="' + (packed ? "1" : "0") + '" role="checkbox" aria-checked="' + (packed ? "true" : "false") +
    '" aria-label="Mark ' + esc(r.title || "item") + (packed ? " not packed" : " packed") + '">' +
    (packed ? icon("check", "pack-tick") : "") + "</button>";
  const titleHTML = editable('<span class="pack-title-text">' + esc(r.title || "") + "</span>",
    { entity: "packing", list: "packing", id: r.id, field: "title", input: "text", value: r.title });
  const qty = Number(r.qty);
  const qtyHTML = (isFinite(qty) && qty > 1) ? '<span class="pack-qty mono">×' + esc(String(qty)) + "</span>" : "";
  const del = '<button type="button" class="pack-del" data-act="del" data-id="' + esc(r.id) +
    '" aria-label="Delete ' + esc(r.title || "item") + '">×</button>';
  return '<div class="pack-item' + (packed ? " packed" : "") + '" data-id="' + esc(r.id) + '">' +
    check +
    '<div class="pack-body"><span class="pack-title">' + titleHTML + "</span>" +
      ownerBadge(r.owner, actor) + qtyHTML + "</div>" +
    del + "</div>";
}

async function viewPacking(slug) {
  markActive(null);
  view().innerHTML = '<div class="panel"><p class="muted">Loading packing…</p></div>';
  const t = await loadPacking(slug);
  const trip = t && t.trip;
  if (!trip) { view().innerHTML = '<div class="panel"><h1>Trip not found</h1><p class="muted"><a href="#/">← All trips</a></p></div>'; return; }
  const actor = (state.me && state.me.email) || "";
  const title = trip.title || slug;
  const range = [fmtDate(trip.start_date), fmtDate(trip.end_date)].filter(Boolean).join(" – ");
  const hero = '<div class="trip-hero"><a class="back" href="#/">' + icon("pin") + "All trips</a>" +
    "<h1>" + esc(title) + "</h1>" + (range ? '<div class="muted mono">' + esc(range) + "</div>" : "") +
    (trip.note ? '<div class="muted">' + esc(trip.note) + "</div>" : "") + "</div>";
  const shell = hero + renderSubnav(slug, "packing");

  const all = t.packing || [];
  const rows = packFilterRows(all, actor, _packFilter);

  // filter chips (with per-scope counts so an empty scope reads clearly)
  const chips = '<div class="pack-filters" role="tablist" aria-label="Filter packing list">' +
    PACK_SCOPES.map(([key, label]) => {
      const n = packFilterRows(all, actor, key).length;
      return '<button type="button" class="pack-chip' + (key === _packFilter ? " active" : "") + '"' +
        ' data-scope="' + esc(key) + '" role="tab" aria-selected="' + (key === _packFilter ? "true" : "false") + '">' +
        esc(label) + ' <span class="pack-count mono">' + esc(String(n)) + "</span></button>";
    }).join("") + "</div>";

  // add-row form
  const addForm = '<form class="pack-add" data-act="add" autocomplete="off">' +
    '<input class="pack-in pack-in-title" name="title" type="text" placeholder="Add an item…" aria-label="Item name" required>' +
    '<select class="pack-in pack-in-owner" name="owner" aria-label="Owner">' +
      '<option value="mine">Mine</option><option value="shared" selected>Shared</option></select>' +
    '<input class="pack-in pack-in-cat" name="category" type="text" placeholder="Category" aria-label="Category">' +
    '<input class="pack-in pack-in-qty" name="qty" type="text" inputmode="numeric" placeholder="Qty" aria-label="Quantity">' +
    '<button type="submit" class="pack-add-btn">Add</button></form>';

  // list, grouped by category (missing category -> "Other"); packed items sink within each group
  let listHTML;
  if (!rows.length) {
    listHTML = '<p class="muted pack-empty">' +
      (all.length ? "Nothing in this view. Try another filter." :
        "No items yet. Add one above, or ask Claude to build a packing list.") + "</p>";
  } else {
    const groups = new Map();
    rows.forEach(r => { const k = (r.category && String(r.category).trim()) || "Other"; (groups.get(k) || groups.set(k, []).get(k)).push(r); });
    const keys = Array.from(groups.keys()).sort((a, b) => (a === "Other") - (b === "Other") || a.localeCompare(b));
    listHTML = '<div class="pack-list">' + keys.map(k => {
      const items = groups.get(k).slice().sort((a, b) => (a.packed === "1") - (b.packed === "1") ||
        (Number(a.sort_order) || 0) - (Number(b.sort_order) || 0));
      return '<section class="pack-group"><h2 class="pack-group-h">' + esc(k) +
        '<span class="pack-count mono">' + esc(String(items.length)) + "</span></h2>" +
        items.map(r => packItemHTML(r, actor)).join("") + "</section>";
    }).join("") + "</div>";
  }

  view().innerHTML = shell + '<div class="panel packing">' + addForm + chips + listHTML + "</div>";

  // ---- wire up (delegated; rebound each render) ----
  const panel = view().querySelector(".packing");
  // filter chips: pure client-side, re-render from cache
  panel.querySelectorAll(".pack-chip").forEach(btn => btn.addEventListener("click", () => {
    _packFilter = btn.dataset.scope || "all";
    vt(() => viewPacking(slug));
  }));
  // toggle packed + delete (ignore clicks on inline-edit controls, handled globally)
  panel.addEventListener("click", async (e) => {
    if (e.target.closest(".editable, .edit-input, .edit-select")) return;
    const btn = e.target.closest("[data-act]");
    if (!btn || btn.tagName === "FORM") return;
    const id = btn.dataset.id, act = btn.dataset.act;
    if (act === "toggle") {
      const next = btn.dataset.packed === "1" ? "0" : "1";
      btn.disabled = true;
      try {
        await api("packing/" + encodeURIComponent(slug) + "/packing/" + encodeURIComponent(id),
          { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ packed: next }) });
        const row = (t.packing || []).find(r => String(r.id) === String(id));
        if (row) row.packed = next;
        vt(() => viewPacking(slug));
      } catch { btn.disabled = false; }
    } else if (act === "del") {
      btn.disabled = true;
      try {
        await api("packing/" + encodeURIComponent(slug) + "/packing/" + encodeURIComponent(id), { method: "DELETE" });
        t.packing = (t.packing || []).filter(r => String(r.id) !== String(id));
        vt(() => viewPacking(slug));
      } catch { btn.disabled = false; }
    }
  });
  // add form
  const form = panel.querySelector(".pack-add");
  if (form) form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const fd = new FormData(form);
    const titleV = String(fd.get("title") || "").trim();
    if (!titleV) return;
    const ownerSel = fd.get("owner");
    const body = { title: titleV, owner: ownerSel === "mine" ? actor : "shared" };
    const catV = String(fd.get("category") || "").trim(); if (catV) body.category = catV;
    const qtyV = String(fd.get("qty") || "").trim(); if (qtyV) body.qty = qtyV;
    const submit = form.querySelector(".pack-add-btn");
    if (submit) submit.disabled = true;
    try {
      await api("packing/" + encodeURIComponent(slug) + "/packing",
        { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      t.packing = undefined;                 // invalidate the cache -> loadPacking refetches
      vt(() => viewPacking(slug));
    } catch { if (submit) submit.disabled = false; }
  });
}

async function viewWhatsNew() {
  markActive("/whats-new");
  view().innerHTML = '<div class="panel"><h1>What’s New</h1><p class="muted">Loading…</p></div>';
  let rel = state.releases;
  if (!rel) { try { rel = state.releases = await fetchJSON("data/releases.json"); } catch { rel = { releases: [] }; } }
  const items = (rel && rel.releases) || [];
  const body = items.length ? items.map(r =>
    '<div class="card"><div class="row-title">' + esc(r.version || "") + " — " + esc(r.title || "") +
    '</div><div class="row-note mono">' + esc(r.date || "") + "</div>" +
    (r.notes ? '<div class="md">' + renderMarkdown(Array.isArray(r.notes) ? r.notes.map(n => "- " + n).join("\n") : r.notes) + "</div>" : "") +
    "</div>").join("") : '<p class="muted">No releases yet.</p>';
  view().innerHTML = '<div class="panel"><h1>What’s New</h1><div class="cards">' + body + "</div></div>";
}

// ---- router ----------------------------------------------------------------
function route() {
  const hash = location.hash.replace(/^#/, "") || "/";
  const parts = hash.split("/").filter(Boolean);   // "/" -> [], "/trip/x" -> ["trip","x"]
  if (parts.length === 0) return viewHome();
  if (parts[0] === "whats-new") return viewWhatsNew();
  if (parts[0] === "trip" && parts[1]) {
    if (parts[2] === "activity" && parts[3]) return viewActivity(decodeURIComponent(parts[1]), decodeURIComponent(parts[3]));
    if (parts[2] === "budget") return viewBudget(decodeURIComponent(parts[1]));
    if (parts[2] === "packing") return viewPacking(decodeURIComponent(parts[1]));
    return viewTimeline(parts[1]);
  }
  return viewHome();
}

// ---- boot ------------------------------------------------------------------
function setTheme(t) { document.documentElement.setAttribute("data-theme", t); try { localStorage.setItem("app-theme", t); } catch {} }
$("#theme-toggle").addEventListener("click", () => setTheme(document.documentElement.getAttribute("data-theme") === "light" ? "dark" : "light"));
$("#menu-toggle").addEventListener("click", () => $("#side").classList.toggle("collapsed"));
window.addEventListener("hashchange", () => vt(route));

(async function boot() {
  try { state.app = await fetchJSON("data/app.json"); } catch { state.app = { title: "Travel Planner" }; }
  $("#brand-title").textContent = (state.app && state.app.title) || "Travel Planner";
  document.title = $("#brand-title").textContent;
  await loadMe();
  buildNav();
  bindEditable();
  route();
})();
