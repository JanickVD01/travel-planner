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
  if (!r.ok) throw new Error((body && body.error) || (path + " -> " + r.status));
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
  link:  '<path d="M9 15l6-6M10.5 6.5 12 5a4 4 0 0 1 6 6l-2 2M13.5 17.5 12 19a4 4 0 0 1-6-6l2-2"/>'
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
  let ctrl;
  if (d.input === "select") {
    ctrl = document.createElement("select");
    ctrl.className = "edit-select";
    (d.options || "").split("|").filter(Boolean).forEach(o => {
      const op = document.createElement("option");
      op.value = o; op.textContent = o; if (o === cur) op.selected = true;
      ctrl.appendChild(op);
    });
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
    if (d.input !== "select" && val !== "" && !isFinite(Number(val))) { revert("Not a number"); return; }
    settled = true; ctrl.disabled = true;                              // lock during write
    try {
      await api(d.entity + "/" + encodeURIComponent(slug) + "/" + d.list + "/" + encodeURIComponent(d.id),
        { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ [field]: val }) });
      invalidateTrip(slug);
      vt(route);                                                       // full re-render with new value
    } catch {
      settled = false; revert("Couldn’t save");                       // never crash — revert + inline msg
    }
  };
  const cancel = () => revert();
  ctrl.addEventListener("keydown", (e) => {
    if (e.key === "Enter") { e.preventDefault(); commit(); }
    else if (e.key === "Escape") { e.preventDefault(); cancel(); }
  });
  if (d.input === "select") { ctrl.addEventListener("change", commit); ctrl.addEventListener("blur", cancel); }
  else { ctrl.addEventListener("blur", commit); }

  btn.replaceWith(ctrl);
  ctrl.focus();
  if (d.input !== "select" && ctrl.select) ctrl.select();
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
function activityCardHTML(a, rate) {
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
  return '<li class="activity">' +
    '<span class="sub-marker" aria-hidden="true"></span>' +
    '<div class="act-card">' +
      '<div class="act-head"><span class="act-title">' + esc(a.title || a.location) + "</span>" + chip + flag + "</div>" +
      '<div class="act-meta">' + estHTML + actHTML + maplink + "</div>" +
    "</div></li>";
}

function stepCardHTML(s, rate, acts) {
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
    ? '<ul class="acts">' + acts.map(a => activityCardHTML(a, rate)).join("") + "</ul>" : "";
  return '<li class="step stay">' +
    '<span class="marker stay" aria-hidden="true"></span>' +
    '<div class="step-card">' +
      '<div class="step-head">' + icon("stay", "step-kind") + '<span class="step-title">' + esc(s.title || s.location) + "</span>" + chip + "</div>" +
      '<div class="step-sub">' + nights + (s.accom_name ? ' <span>· ' + esc(s.accom_name) + "</span>" : "") + "</div>" +
      '<div class="step-meta">' + costHTML + maplink + booklink + "</div>" +
      actsHTML +
    "</div></li>";
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
    ? '<ol class="tl">' + steps.map(s => stepCardHTML(s, rate, byStep[s.id])).join("") + "</ol>"
    : '<p class="muted">No steps yet. Ask Claude to add a stay or a travel leg.</p>';
  // Activities whose parent step no longer exists get their own group so they're never dropped.
  const unassignedHTML = (unassigned && unassigned.length)
    ? '<section class="unassigned"><h2 class="unassigned-title">Unassigned</h2>' +
      '<ul class="acts acts-loose">' + unassigned.map(a => activityCardHTML(a, rate)).join("") + "</ul></section>"
    : "";
  view().innerHTML =
    '<div class="trip-hero"><a class="back" href="#/">' + icon("pin") + "All trips</a>" +
      "<h1>" + esc(title) + "</h1>" + (range ? '<div class="muted mono">' + esc(range) + "</div>" : "") +
      (trip && trip.note ? '<div class="muted">' + esc(trip.note) + "</div>" : "") + "</div>" +
    '<div class="panel tl-panel">' + hint + body + unassignedHTML + "</div>";
  // signature entrance: stagger the markers in (reduced-motion + no-anime safe).
  motion(a => a.animate(".tl .step", { opacity: [0, 1], translateY: [8, 0], delay: a.stagger(45), duration: 380, ease: "out(3)" }));
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
  if (parts[0] === "trip" && parts[1]) return viewTimeline(parts[1]);
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
