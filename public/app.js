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
  check: '<path d="M5 12.5 10 17.5 19 6.5"/>',
  image: '<rect x="3.5" y="5" width="17" height="14" rx="2.5"/><circle cx="8.8" cy="10" r="1.5"/><path d="M4 17l4.3-4.3a1.8 1.8 0 0 1 2.5 0L15 17M13.5 14.2l1.6-1.6a1.8 1.8 0 0 1 2.5 0L20.5 14.2"/>',
  trash: '<path d="M4 7h16M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2M6.5 7l.9 12.1a2 2 0 0 0 2 1.9h5.2a2 2 0 0 0 2-1.9L19.5 7M10 11v6M14 11v6"/>',
  undo:  '<path d="M9 7 4.5 11.5 9 16M4.5 11.5H14a5 5 0 0 1 0 10h-2.5"/>',
  plus:  '<path d="M12 5v14M5 12h14"/>'
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
    return "https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent(row.lat + "," + row.lng);
  return safeUrl(row.map_url);
}
function fmtDate(d) { if (!d) return ""; const p = String(d).split("-"); if (p.length !== 3) return String(d);
  const m = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"]; return (+p[2]) + " " + (m[(+p[1]) - 1] || p[1]); }
// A stable, CSS-ident-safe view-transition-name for an activity (shared by the timeline title + detail h1).
function vtName(id) { return "act-" + String(id == null ? "" : id).replace(/[^A-Za-z0-9_-]/g, "-"); }
// Format an ISO tombstone timestamp (the `deleted` column) into a short, human "9 Jul 2026, 14:05".
function fmtDeleted(iso) {
  if (!iso) return "";
  const d = new Date(iso); if (isNaN(d.getTime())) return String(iso);
  const m = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  const pad = n => (n < 10 ? "0" + n : String(n));
  return d.getDate() + " " + (m[d.getMonth()] || "") + " " + d.getFullYear() + ", " + pad(d.getHours()) + ":" + pad(d.getMinutes());
}

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
  // Attachments (M9): photo metadata; bytes are served separately by /api/image. Group live rows by
  // parent so a card/detail view can look up its photos in O(1). Degrades to [] if unbound/unavailable.
  let attachments = [];
  try { const d = await api("attachments/" + encodeURIComponent(slug) + "/attachments"); attachments = (d && d.rows) || []; } catch {}
  const byParent = {};
  attachments.filter(a => !a.deleted)
    .sort((a, b) => (Number(a.sort_order) || 0) - (Number(b.sort_order) || 0))
    .forEach(a => { const k = a.parent_type + ":" + a.parent_id; (byParent[k] = byParent[k] || []).push(a); });
  state.trip[slug] = { trip, steps, activities, byStep, unassigned, attachments, byParent };
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
  } else if (d.input === "date" || d.input === "time") { // native picker (single-tap; value already ISO / HH:MM)
    ctrl = document.createElement("input");
    ctrl.type = d.input;
    ctrl.className = "edit-input"; ctrl.value = cur;
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
  else if (d.input === "date" || d.input === "time") { ctrl.addEventListener("change", commit); ctrl.addEventListener("blur", commit); }
  else { ctrl.addEventListener("blur", commit); }                     // input + textarea commit on blur

  btn.replaceWith(ctrl);
  ctrl.focus();
  if (d.input === "decimal" && ctrl.select) ctrl.select();            // pre-select numeric value for quick replace
  // Open the native picker on the SAME tap (select/date/time) — otherwise focus alone leaves it closed (the old two-tap).
  if (d.input === "select" || d.input === "date" || d.input === "time") { try { ctrl.showPicker && ctrl.showPicker(); } catch (e) {} }
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
  const estDisplay = (a.cost_est != null && a.cost_est !== "")
    ? '<span class="cost mono est muted">est ' + esc(money(a.cost_est, a.cost_ccy)) + "</span>"
    : '<span class="add-actual est">+ est</span>';
  const estHTML = editable(estDisplay, { entity: "activities", list: "activities", id: a.id, field: "cost_est", input: "decimal", value: a.cost_est });
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

// ---- attachments / photos (M9) ---------------------------------------------
// A reusable "Photos" strip for a step or activity. Reads the pre-grouped byParent map off the cached
// trip bundle (loadTrip), so no per-card fetch. `opts.compact` -> the calm card affordance (up to 3
// thumbs + a small add tile); otherwise the full detail-view section (all thumbs, captions, add button).
// Bytes stream from /api/image/<slug>/<id>; images are lazy + fixed 1:1 aspect (no layout shift).
// Wiring is delegated once in bindPhotos(); container data-* carry slug/parent so handlers stay generic.
function attachmentsHTML(parentType, parentId, slug, opts) {
  opts = opts || {};
  const compact = !!opts.compact;
  const bundle = state.trip[slug];
  const byParent = (bundle && bundle.byParent) || {};
  const rows = byParent[parentType + ":" + parentId] || [];
  const shown = compact ? rows.slice(0, 3) : rows;
  const extra = rows.length - shown.length;

  const thumb = (r) => {
    const src = "api/image/" + encodeURIComponent(slug) + "/" + encodeURIComponent(r.id);
    const cap = r.caption == null ? "" : String(r.caption);
    const del = '<button type="button" class="thumb-del" data-act="photo-del" data-id="' + esc(r.id) +
      '" aria-label="Delete photo">×</button>';
    const capHTML = (!compact && cap) ? '<figcaption class="thumb-cap">' + esc(cap) + "</figcaption>" : "";
    return '<figure class="thumb">' +
      '<a class="thumb-link" href="' + esc(src) + '" target="_blank" rel="noopener" aria-label="' +
        (cap ? esc(cap) : "View photo") + '">' +
        '<img loading="lazy" src="' + esc(src) + '" alt="' + esc(cap) + '"></a>' +
      del + capHTML + "</figure>";
  };
  const thumbs = shown.map(thumb).join("");
  const moreHTML = (compact && extra > 0) ? '<span class="thumb-more" aria-hidden="true">+' + esc(String(extra)) + "</span>" : "";

  const upload =
    '<input type="file" class="photo-input" accept="image/*" multiple hidden tabindex="-1" aria-hidden="true">' +
    '<button type="button" class="photo-upload-btn" data-act="photo-add">' + icon("image") +
      "<span>Add photo" + (compact ? "" : "s") + "</span></button>";
  const uploadWrap = '<div class="photo-upload">' + upload + "</div>";
  const attrs = ' data-slug="' + esc(slug) + '" data-ptype="' + esc(parentType) + '" data-pid="' + esc(parentId) + '"';

  if (compact) {
    return '<div class="photos compact' + (rows.length ? "" : " empty") + '"' + attrs + '>' +
      '<div class="thumbs">' + thumbs + moreHTML + uploadWrap + "</div>" +
      '<div class="photo-msg" role="status" hidden></div>' +
    "</div>";
  }
  return '<section class="photos"' + attrs + '>' +
    "<h2>Photos</h2>" +
    (thumbs ? '<div class="thumbs">' + thumbs + "</div>" : "") +
    uploadWrap +
    '<div class="photo-msg" role="status" hidden></div>' +
  "</section>";
}
// Map an upload failure to a friendly, non-technical line. 503 = KV not yet enabled (graceful degrade).
function photoErrMsg(status, err) {
  if (status === 503) return "Photo uploads aren’t set up yet.";
  if (status === 413) return "That image is too large (max 5 MB).";
  if (status === 415) return "That file type isn’t supported — use JPEG, PNG, WebP, GIF or HEIC.";
  if (status === 401) return "Please sign in again to upload.";
  return err || "Upload failed. Please try again.";
}
function photoMsg(wrap, text) {
  const el = wrap && wrap.querySelector(".photo-msg");
  if (!el) return;
  el.textContent = text || ""; el.hidden = !text;
}
async function uploadPhotos(input) {
  const wrap = input.closest(".photos");
  if (!wrap) return;
  const slug = wrap.dataset.slug, ptype = wrap.dataset.ptype, pid = wrap.dataset.pid;
  const files = Array.prototype.slice.call(input.files || []);
  if (!files.length || !slug || !pid) { input.value = ""; return; }
  photoMsg(wrap, "");
  const btn = wrap.querySelector(".photo-upload-btn");
  const label = btn && btn.querySelector("span");
  const restore = label ? label.textContent : "";
  if (btn) btn.disabled = true;
  if (label) label.textContent = "Uploading…";
  let ok = 0, lastErr = "";
  for (const file of files) {
    const fd = new FormData();
    fd.append("file", file);
    try {
      // FormData upload — bypass api() (which forces JSON). Same "api/" base as every other call.
      const r = await fetch("api/image/" + encodeURIComponent(slug) + "/" + encodeURIComponent(ptype) + "/" + encodeURIComponent(pid),
        { method: "POST", body: fd });
      if (r.ok) { ok++; }
      else { let b = null; try { b = await r.json(); } catch {} lastErr = photoErrMsg(r.status, b && b.error); }
    } catch { lastErr = "Upload failed. Check your connection."; }
  }
  input.value = "";                                   // reset so the same file can be re-picked
  if (ok > 0) { invalidateTrip(slug); vt(route); return; }   // re-render picks up the new rows
  if (btn) btn.disabled = false;
  if (label) label.textContent = restore;
  photoMsg(wrap, lastErr || "Upload failed.");
}
async function deletePhoto(btn) {
  const wrap = btn.closest(".photos");
  if (!wrap) return;
  const slug = wrap.dataset.slug, id = btn.dataset.id;
  if (!slug || !id) return;
  btn.disabled = true;
  try {
    await api("attachments/" + encodeURIComponent(slug) + "/attachments/" + encodeURIComponent(id), { method: "DELETE" });
    // Optimistically drop it from the cached bundle, then re-render from cache (works offline of a refetch).
    const b = state.trip[slug];
    if (b) {
      b.attachments = (b.attachments || []).filter(r => String(r.id) !== String(id));
      Object.keys(b.byParent || {}).forEach(k => { b.byParent[k] = b.byParent[k].filter(r => String(r.id) !== String(id)); });
    }
    vt(route);
  } catch { btn.disabled = false; photoMsg(wrap, "Couldn’t delete photo."); }
}
let _photosBound = false;
function bindPhotos() {                                // one delegated pair of listeners for all photo strips
  if (_photosBound) return; _photosBound = true;
  document.addEventListener("click", (e) => {
    const add = e.target.closest("[data-act='photo-add']");
    if (add) { const w = add.closest(".photos"); const inp = w && w.querySelector(".photo-input"); if (inp) inp.click(); return; }
    const del = e.target.closest("[data-act='photo-del']");
    if (del) { e.preventDefault(); deletePhoto(del); }
  });
  document.addEventListener("change", (e) => {
    const inp = e.target.closest(".photo-input");
    if (inp) uploadPhotos(inp);
  });
}

function stepCardHTML(s, rate, acts, slug) {
  const st = s.booking_status || "Idea";
  const chip = editable('<span class="chip status-' + esc(st) + '">' + esc(st) + "</span>",
    { entity: "steps", list: "flow", id: s.id, field: "booking_status", input: "select", value: st, options: "Idea|Planned|Booked|Confirmed" });
  // Estimate + actual are both editable (null -> a subtle "+ est" / "+ actual" affordance).
  const estDisplay = (s.cost_est != null && s.cost_est !== "")
    ? '<span class="cost mono est muted">est ' + esc(money(s.cost_est, s.cost_ccy)) + "</span>"
    : '<span class="add-actual est">+ est</span>';
  const estHTML = editable(estDisplay, { entity: "steps", list: "flow", id: s.id, field: "cost_est", input: "decimal", value: s.cost_est });
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
  // Dates & times are tap-to-edit inline (native picker); empty -> a subtle affordance.
  const editDate = (field, val, empty) => editable(
    (val != null && val !== "") ? esc(fmtDate(val)) : '<span class="add-actual">' + empty + "</span>",
    { entity: "steps", list: "flow", id: s.id, field: field, input: "date", value: val });
  const editTime = (field, val, empty) => editable(
    (val != null && val !== "") ? '<span class="mono">' + esc(val) + "</span>" : '<span class="add-actual">' + empty + "</span>",
    { entity: "steps", list: "flow", id: s.id, field: field, input: "time", value: val });

  if (s.kind === "travel") {
    const mode = MODE_ICON[s.transport] || "plane";
    const when = '<span class="leg-when">' +
      '<span class="muted">dep</span> ' + editDate("depart", s.depart, "+ date") + " " + editTime("depart_time", s.depart_time, "+ time") +
      ' <span class="muted">· arr</span> ' + editDate("arrive", s.arrive, "+ date") + " " + editTime("arrive_time", s.arrive_time, "+ time") + "</span>";
    return '<li class="step travel">' +
      '<span class="marker travel" aria-hidden="true">' + icon(mode) + "</span>" +
      '<div class="leg">' +
        '<div class="leg-top"><span class="leg-title">' + esc(s.title || s.location) + "</span>" + chip + "</div>" +
        '<div class="leg-sub">' + (s.carrier ? '<span class="mono">' + esc(s.carrier) + "</span> " : "") + when + "</div>" +
        '<div class="step-meta">' + costHTML + maplink + booklink + "</div>" +
        attachmentsHTML("step", s.id, slug, { compact: true }) +
      "</div></li>";
  }
  const nights = '<span class="stay-when">' +
    editDate("arrive", s.arrive, "+ check-in") + " " + editTime("arrive_time", s.arrive_time, "+ time") +
    ' <span class="muted">→</span> ' +
    editDate("depart", s.depart, "+ check-out") + " " + editTime("depart_time", s.depart_time, "+ time") + "</span>";
  const actsHTML = (acts && acts.length)
    ? '<ul class="acts">' + acts.map(a => activityCardHTML(a, rate, slug)).join("") + "</ul>" : "";
  return '<li class="step stay">' +
    '<span class="marker stay" aria-hidden="true"></span>' +
    '<div class="step-card">' +
      '<div class="step-head">' + icon("stay", "step-kind") + '<span class="step-title">' + esc(s.title || s.location) + "</span>" + chip + "</div>" +
      '<div class="step-sub">' + nights + (s.accom_name ? ' <span>· ' + esc(s.accom_name) + "</span>" : "") + "</div>" +
      '<div class="step-meta">' + costHTML + maplink + booklink + "</div>" +
      attachmentsHTML("step", s.id, slug, { compact: true }) +
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
  const hint = '<p class="tl-hint muted">Tap a cost, status, date or time to edit it inline. Use “add step” to build your timeline — or ask Claude.</p>';
  const body = steps.length
    ? '<ol class="tl">' + steps.map((s, i) => stepInserterHTML(i) + stepCardHTML(s, rate, byStep[s.id], slug)).join("") + stepInserterHTML(steps.length) + "</ol>"
    : '<div class="tl-empty"><p class="muted">No steps yet — start building your trip.</p>' +
      '<button type="button" class="btn insert-btn-lg" data-insert-step="0">' + icon("plus") + "Add your first step</button></div>";
  // Activities whose parent step no longer exists get their own group so they're never dropped.
  const unassignedHTML = (unassigned && unassigned.length)
    ? '<section class="unassigned"><h2 class="unassigned-title">Unassigned</h2>' +
      '<ul class="acts acts-loose">' + unassigned.map(a => activityCardHTML(a, rate, slug)).join("") + "</ul></section>"
    : "";
  view().innerHTML =
    '<div class="trip-hero"><div class="hero-top">' +
        '<a class="back" href="#/">' + icon("pin") + "All trips</a>" +
        '<a class="trash-link" href="#/trip/' + encodeURIComponent(slug) + '/trash">' + icon("trash") + "Trash</a>" +
      "</div>" +
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
  const estDisplay = (a.cost_est != null && a.cost_est !== "")
    ? '<span class="cost mono est muted">' + esc(money(a.cost_est, a.cost_ccy)) + "</span>"
    : '<span class="add-actual">+ est</span>';
  const estHTML = editable(estDisplay, { entity: "activities", list: "activities", id: a.id, field: "cost_est", input: "decimal", value: a.cost_est });
  const act = a.cost_actual;
  const actDisplay = (act != null && act !== "")
    ? '<span class="cost mono">' + esc(money(act, a.cost_ccy)) +
      (eurEquiv(act, a.cost_ccy, rate) ? ' <span class="muted">' + esc(eurEquiv(act, a.cost_ccy, rate)) + "</span>" : "") + "</span>"
    : '<span class="add-actual">+ actual</span>';
  const actCtrl = editable(actDisplay, { entity: "activities", list: "activities", id: a.id, field: "cost_actual", input: "decimal", value: act });
  const dayDisplay = (a.day != null && a.day !== "") ? esc(fmtDate(a.day)) : '<span class="add-actual">+ date</span>';
  const dayHTML = editable(dayDisplay, { entity: "activities", list: "activities", id: a.id, field: "day", input: "date", value: a.day });

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
  const photos = attachmentsHTML("activity", a.id, slug, {});

  view().innerHTML = '<div class="sheet">' + head +
    '<div class="panel detail">' +
      '<h1 class="detail-title" style="view-transition-name:' + esc(vtName(a.id)) + '">' + esc(a.title || a.location) + "</h1>" +
      '<div class="detail-context muted">in ' + esc(parentTitle) + "</div>" +
      meta + notes + photos +
    "</div></div>";
  motion(an => an.animate(".detail-meta, .notes, .photos", { opacity: [0, 1], translateY: [8, 0], delay: an.stagger(60), duration: 340, ease: "out(3)" }));
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

// ---- trash (M10): restore or permanently delete soft-deleted steps / activities / packing ----
// Each group hits its own `/trash` list (rows carry a populated `deleted` timestamp). Restore un-deletes
// a row; "Delete forever" hard-purges it (steps cascade to their activities + photos — extra confirm).
// All mutations invalidate the trip cache so the timeline reflects a restore. Everything esc'd.
const TRASH_GROUPS = [
  { key: "steps",      label: "Steps",      entity: "steps",      list: "flow" },
  { key: "activities", label: "Activities", entity: "activities", list: "activities" },
  { key: "packing",    label: "Packing",    entity: "packing",    list: "packing" }
];
async function viewTrash(slug) {
  markActive(null);
  view().innerHTML = '<div class="panel"><p class="muted">Loading trash…</p></div>';
  const { trip } = await loadTrip(slug);
  if (!trip) { view().innerHTML = '<div class="panel"><h1>Trip not found</h1><p class="muted"><a href="#/">← All trips</a></p></div>'; return; }
  const tripHref = "#/trip/" + encodeURIComponent(slug);
  const title = trip.title || slug;
  const hero = '<div class="trip-hero"><a class="back" href="' + esc(tripHref) + '">' +
      '<span class="chev" aria-hidden="true">‹</span> Back to ' + esc(title) + "</a>" +
      '<h1><span class="trash-title-ico">' + icon("trash") + "</span>Trash</h1>" +
      '<div class="muted">Restore an item, or delete it forever.</div></div>';

  // Fetch all three trash lists in parallel; a failed list degrades to empty (never blocks the others).
  const groups = TRASH_GROUPS.map(g => Object.assign({}, g, { rows: [] }));
  const results = await Promise.all(groups.map(async g => {
    try { const d = await api(g.entity + "/" + encodeURIComponent(slug) + "/" + g.list + "/trash"); return (d && d.rows) || []; }
    catch { return []; }
  }));
  groups.forEach((g, i) => { g.rows = results[i]; });

  const itemHTML = (g, r) => {
    const when = fmtDeleted(r.deleted);
    return '<li class="trash-item" data-id="' + esc(r.id) + '">' +
      '<div class="trash-item-main">' +
        '<span class="trash-item-title">' + esc(r.title || r.location || "(untitled)") + "</span>" +
        (when ? '<span class="trash-when muted mono">deleted ' + esc(when) + "</span>" : "") +
      "</div>" +
      '<div class="trash-actions">' +
        '<button type="button" class="trash-btn restore" data-act="restore" data-group="' + esc(g.key) + '" data-id="' + esc(r.id) + '">' +
          icon("undo") + "Restore</button>" +
        '<button type="button" class="trash-btn purge" data-act="purge" data-group="' + esc(g.key) + '" data-id="' + esc(r.id) + '">' +
          icon("trash") + "Delete forever</button>" +
      "</div></li>";
  };
  const sectionHTML = (g) => '<section class="trash-section"><h2 class="trash-h">' + esc(g.label) +
      '<span class="trash-count mono">' + esc(String(g.rows.length)) + "</span></h2>" +
      (g.rows.length
        ? '<ul class="trash-list">' + g.rows.map(r => itemHTML(g, r)).join("") + "</ul>"
        : '<p class="muted trash-empty">Nothing here.</p>') +
    "</section>";

  function paint() {
    const total = groups.reduce((s, g) => s + g.rows.length, 0);
    const body = total === 0
      ? '<div class="trash-allempty"><p class="muted">Trash is empty.</p>' +
          '<p class="muted"><a href="' + esc(tripHref) + '">← Back to ' + esc(title) + "</a></p></div>"
      : groups.map(sectionHTML).join("");
    view().innerHTML = hero + '<div class="panel trash">' + body + "</div>";
    const panel = view().querySelector(".trash");
    if (panel) panel.addEventListener("click", onClick);
    motion(a => a.animate(".trash-item", { opacity: [0, 1], translateY: [6, 0], delay: a.stagger(30), duration: 300, ease: "out(3)" }));
  }

  async function onClick(e) {
    const btn = e.target.closest("[data-act]");
    if (!btn) return;
    const act = btn.dataset.act, g = groups.find(x => x.key === btn.dataset.group), id = btn.dataset.id;
    if (!g || !id) return;
    const url = g.entity + "/" + encodeURIComponent(slug) + "/" + g.list + "/" + encodeURIComponent(id);
    if (act === "restore") {
      btn.disabled = true;
      try {
        await api(url + "/restore", { method: "POST" });
        g.rows = g.rows.filter(r => String(r.id) !== String(id));
        invalidateTrip(slug);
        vt(paint);
      } catch { btn.disabled = false; }
    } else if (act === "purge") {
      const msg = g.key === "steps"
        ? "Delete this step forever?\n\nThis also permanently removes its activities and photos. This cannot be undone."
        : "Delete this item forever?\n\nThis cannot be undone.";
      if (!confirm(msg)) return;
      btn.disabled = true;
      try {
        await api(url + "/purge", { method: "DELETE" });
        g.rows = g.rows.filter(r => String(r.id) !== String(id));
        invalidateTrip(slug);
        vt(paint);
      } catch { btn.disabled = false; }
    }
  }

  paint();
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

// ---- guided wizards (M5 steps, M6 activities) ------------------------------
const TRANSPORTS_UI = ["plane", "train", "bus", "ferry", "car", "other"];
const BOOKINGS_UI = ["Idea", "Planned", "Booked", "Confirmed"];
const CCYS_UI = ["EUR", "THB"];
const YESNO_UI = ["no", "yes"];

// Extract coordinates from a pasted Google Maps URL or a bare "lat, lng". Returns {lat,lng} (strings,
// so the server's cleanLat/cleanLng validate them) or null. Short goo.gl / maps.app.goo.gl links can't
// be resolved in-page under CSP connect-src 'self' -> null (the UI hints to paste the full link/coords).
function parseLatLng(text) {
  const s = String(text == null ? "" : text).trim();
  if (!s) return null;
  const N = "(-?\\d{1,3}(?:\\.\\d+)?)";
  const pats = [
    new RegExp("@" + N + "," + N),                                    // /maps/@48.8566,2.3522,14z
    new RegExp("[?&](?:q|query|ll|destination)=" + N + "%2C" + N, "i"), // ?query=48.85%2C2.35
    new RegExp("[?&](?:q|query|ll|destination)=" + N + "," + N, "i"),   // ?query=48.85,2.35
    new RegExp("^" + N + "\\s*,\\s*" + N + "$")                        // bare "48.8566, 2.3522"
  ];
  for (let k = 0; k < pats.length; k++) {
    const m = s.match(pats[k]);
    if (m) {
      const lat = Number(m[1]), lng = Number(m[2]);
      if (isFinite(lat) && isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180) return { lat: m[1], lng: m[2] };
    }
  }
  return null;
}

function selIn(name, opts, cur) {
  return '<select class="wz-in" name="' + esc(name) + '">' +
    opts.map(o => '<option value="' + esc(o) + '"' + (String(o) === String(cur) ? " selected" : "") + ">" + esc(o) + "</option>").join("") + "</select>";
}
function readInputs(el, st) { el.querySelectorAll("[name]").forEach(i => { st[i.name] = i.value; }); }
function wzField(label, inner, hintHtml) {
  return '<label class="wz-field"><span class="wz-label">' + esc(label) + (hintHtml || "") + "</span>" + inner + "</label>";
}
function wzText(name, val, ph) {
  return '<input class="wz-in" name="' + esc(name) + '" value="' + esc(val || "") + '"' + (ph ? ' placeholder="' + esc(ph) + '"' : "") + " />";
}
function wzDate(name, val) { return '<input class="wz-in" type="date" name="' + esc(name) + '" value="' + esc(val || "") + '" />'; }
function wzTime(name, val) { return '<input class="wz-in" type="time" name="' + esc(name) + '" value="' + esc(val || "") + '" />'; }

// A pane = { title, html(state), read?(bodyEl,state)->errMsg|null, mount?(bodyEl,{state,advance}) }.
// read() pulls the pane's inputs into state (+ optional validation) before advancing. onCreate(state)
// runs the POST(s) and returns a Promise; createLabel names the final button.
function openWizard(opts) {
  const panes = opts.panes; let idx = 0; const state = opts.state || {};
  const overlay = document.createElement("div");
  overlay.className = "wizard-overlay";
  overlay.innerHTML =
    '<div class="wizard-sheet" role="dialog" aria-modal="true" aria-label="' + esc(opts.title) + '">' +
      '<div class="wizard-head"><span class="wizard-title">' + esc(opts.title) + "</span>" +
        '<button type="button" class="icon-btn wizard-close" aria-label="Close">✕</button></div>' +
      '<div class="wizard-body"></div>' +
      '<div class="wizard-err" role="alert" hidden></div>' +
      '<div class="wizard-foot">' +
        '<button type="button" class="btn ghost wizard-back">Back</button>' +
        '<span class="wizard-progress muted mono"></span>' +
        '<button type="button" class="btn wizard-next">Next</button>' +
      "</div></div>";
  document.body.appendChild(overlay);
  const Q = s => overlay.querySelector(s);
  const bodyEl = Q(".wizard-body"), errEl = Q(".wizard-err"), backBtn = Q(".wizard-back"), nextBtn = Q(".wizard-next"), progEl = Q(".wizard-progress");
  const onKey = e => { if (e.key === "Escape") close(); };
  function close() { overlay.remove(); document.removeEventListener("keydown", onKey); }
  document.addEventListener("keydown", onKey);
  overlay.addEventListener("mousedown", e => { if (e.target === overlay) close(); });
  Q(".wizard-close").addEventListener("click", close);
  const showErr = m => { if (m) { errEl.textContent = m; errEl.hidden = false; } else { errEl.hidden = true; errEl.textContent = ""; } };
  const advance = () => nextBtn.click();
  function render() {
    showErr(null);
    const pane = panes[idx];
    bodyEl.innerHTML = '<div class="wizard-pane"><h3 class="pane-title">' + esc(pane.title) + "</h3>" + pane.html(state) + "</div>";
    progEl.textContent = (idx + 1) + " / " + panes.length;
    backBtn.disabled = idx === 0;
    nextBtn.textContent = idx === panes.length - 1 ? (opts.createLabel || "Create") : "Next";
    if (pane.mount) pane.mount(bodyEl, { state, advance });
    const f = bodyEl.querySelector("input,select,textarea,.kind-opt");
    if (f && f.focus) f.focus();
  }
  backBtn.addEventListener("click", () => { if (idx > 0) { const p = panes[idx]; if (p.read) p.read(bodyEl, state); idx--; render(); } });
  nextBtn.addEventListener("click", async () => {
    const pane = panes[idx];
    const err = pane.read ? pane.read(bodyEl, state) : null;
    if (err) { showErr(err); return; }
    if (idx < panes.length - 1) { idx++; render(); return; }
    nextBtn.disabled = true; nextBtn.textContent = "Saving…";
    try { await opts.onCreate(state); close(); }
    catch (e) { nextBtn.disabled = false; nextBtn.textContent = opts.createLabel || "Create"; showErr((e && e.message) || "Couldn’t save"); }
  });
  render();
  return { close };
}

function openStepWizard(slug, insertIndex, steps) {
  const prev = insertIndex > 0 ? steps[insertIndex - 1] : null;
  const next = insertIndex < steps.length ? steps[insertIndex] : null;
  const prevEnd = prev ? (prev.depart || prev.arrive) : null;
  const nextStart = next ? (next.arrive || next.depart) : null;
  const hintEnd = prevEnd ? '<span class="field-hint"> · prev ends ' + esc(fmtDate(prevEnd)) + "</span>" : "";
  const hintStart = nextStart ? '<span class="field-hint"> · next starts ' + esc(fmtDate(nextStart)) + "</span>" : "";

  const kindPane = {
    title: "What are you adding?",
    html: () => '<div class="kind-choice">' +
      '<button type="button" class="kind-opt" data-kind="stay">' + icon("stay") + "<span>Stay</span><small>Somewhere you sleep</small></button>" +
      '<button type="button" class="kind-opt" data-kind="travel">' + icon("plane") + "<span>Travel</span><small>Getting from A to B</small></button>" +
      "</div>",
    mount: (el, w) => el.querySelectorAll(".kind-opt").forEach(b => b.addEventListener("click", () => { w.state.kind = b.dataset.kind; w.advance(); })),
    read: (el, st) => st.kind ? null : "Pick Stay or Travel."
  };
  const corePane = {
    title: "Details",
    html: (st) => st.kind === "stay"
      ? wzField("Place *", wzText("place", st.place, "e.g. Paris")) +
        wzField("Check-in", wzDate("arrive", st.arrive), hintEnd) +
        wzField("Check-out", wzDate("depart", st.depart), hintStart) +
        wzField("Accommodation", wzText("accom_name", st.accom_name, "hotel / apartment (optional)"))
      : wzField("From", wzText("from", st.from, "e.g. Brussels")) +
        wzField("To", wzText("to", st.to, "e.g. Paris")) +
        wzField("Transport", selIn("transport", TRANSPORTS_UI, st.transport || "plane")) +
        wzField("Carrier", wzText("carrier", st.carrier, "airline / operator (optional)")) +
        wzField("Depart", wzDate("depart", st.depart) + wzTime("depart_time", st.depart_time), hintEnd) +
        wzField("Arrive", wzDate("arrive", st.arrive) + wzTime("arrive_time", st.arrive_time), hintStart),
    read: (el, st) => {
      readInputs(el, st);
      if (st.kind === "stay" && !(st.place || "").trim()) return "A place name is required.";
      if (st.kind === "travel" && !(st.from || "").trim() && !(st.to || "").trim()) return "Enter at least a From or To.";
      return null;
    }
  };
  const optPane = {
    title: "Optional extras",
    html: (st) =>
      wzField("Estimated cost", wzText("cost_est", st.cost_est, "0") + " " + selIn("cost_ccy", CCYS_UI, st.cost_ccy || "EUR")) +
      wzField("Booking status", selIn("booking_status", BOOKINGS_UI, st.booking_status || "Idea")) +
      wzField("Booking link", wzText("booking_url", st.booking_url, "https://…")) +
      wzField("Location", wzText("coords", st.coords, "paste a Google Maps link or lat, lng"), '<span class="field-hint"> · powers the map link</span>') +
      wzField("Note", '<textarea class="wz-in" name="note" rows="3">' + esc(st.note || "") + "</textarea>"),
    read: (el, st) => { readInputs(el, st); return null; }
  };
  const reviewPane = {
    title: "Review",
    html: (st) => {
      const rows = [];
      const add = (k, v) => { if (v) rows.push('<div class="rev-row"><span class="rev-k">' + esc(k) + '</span><span class="rev-v">' + esc(v) + "</span></div>"); };
      add("Type", st.kind === "stay" ? "Stay" : "Travel");
      if (st.kind === "stay") { add("Place", st.place); add("Check-in", st.arrive); add("Check-out", st.depart); add("Accommodation", st.accom_name); }
      else {
        add("From", st.from); add("To", st.to); add("Transport", st.transport); add("Carrier", st.carrier);
        add("Depart", [st.depart, st.depart_time].filter(Boolean).join(" ")); add("Arrive", [st.arrive, st.arrive_time].filter(Boolean).join(" "));
      }
      if (st.cost_est && String(st.cost_est).trim()) add("Cost", String(st.cost_est).trim() + " " + (st.cost_ccy || "EUR"));
      add("Status", st.booking_status);
      const ll = parseLatLng(st.coords);
      if (st.coords) add("Location", ll ? (ll.lat + ", " + ll.lng) : "⚠ couldn’t read coordinates — paste a full link or lat, lng");
      add("Note", st.note);
      return '<div class="rev">' + (rows.join("") || '<p class="muted">Nothing to review.</p>') + "</div>";
    }
  };
  openWizard({
    title: insertIndex >= steps.length ? "Add a step" : "Insert a step",
    panes: [kindPane, corePane, optPane, reviewPane],
    createLabel: "Add step",
    onCreate: (st) => createStepFromWizard(slug, insertIndex, steps, st)
  });
}

async function createStepFromWizard(slug, insertIndex, steps, st) {
  const body = { kind: st.kind, cost_ccy: st.cost_ccy || "EUR", booking_status: st.booking_status || "Idea" };
  if (st.kind === "stay") {
    const place = (st.place || "").trim();
    body.title = place; body.location = place;
    if (st.accom_name) body.accom_name = st.accom_name;
    if (st.arrive) body.arrive = st.arrive;
    if (st.depart) body.depart = st.depart;
  } else {
    const from = (st.from || "").trim(), to = (st.to || "").trim();
    const routeName = (from && to) ? (from + " → " + to) : (from || to);
    body.title = routeName; body.location = routeName;
    if (st.transport) body.transport = st.transport;
    if (st.carrier) body.carrier = st.carrier;
    if (st.depart) body.depart = st.depart;
    if (st.depart_time) body.depart_time = st.depart_time;
    if (st.arrive) body.arrive = st.arrive;
    if (st.arrive_time) body.arrive_time = st.arrive_time;
  }
  if (st.cost_est && String(st.cost_est).trim() !== "") body.cost_est = String(st.cost_est).trim();
  if (st.booking_url) body.booking_url = st.booking_url;
  if (st.note) body.note = st.note;
  const ll = parseLatLng(st.coords);
  if (ll) { body.lat = ll.lat; body.lng = ll.lng; }

  const res = await api("steps/" + encodeURIComponent(slug) + "/flow", {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body)
  });
  // Reposition only when inserting before the end. New row appended at MAX+10; slot it between neighbors
  // with an integer midpoint, re-spacing the whole list if the gap is exhausted. (Skipped in demo: no id.)
  const newId = res && res.row && res.row.id;
  if (newId && insertIndex < steps.length) {
    const prevS = insertIndex > 0 ? Number(steps[insertIndex - 1].sort_order) : 0;
    const nextS = Number(steps[insertIndex].sort_order);
    const patch = (id, so) => api("steps/" + encodeURIComponent(slug) + "/flow/" + encodeURIComponent(id),
      { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ sort_order: so }) });
    if (isFinite(prevS) && isFinite(nextS) && nextS - prevS >= 2) {
      await patch(newId, Math.floor((prevS + nextS) / 2));
    } else {
      const order = steps.slice(); order.splice(insertIndex, 0, { id: newId });
      for (let i = 0; i < order.length; i++) await patch(order[i].id, (i + 1) * 10);
    }
  }
  invalidateTrip(slug);
  vt(route);
}

function stepInserterHTML(index) {
  return '<li class="tl-insert"><button type="button" class="insert-btn" data-insert-step="' + index + '">' + icon("plus") + "add step</button></li>";
}

let _wizardsBound = false;
function bindWizards() {
  if (_wizardsBound) return; _wizardsBound = true;
  document.addEventListener("click", async (e) => {
    const stepBtn = e.target.closest("[data-insert-step]");
    if (stepBtn) {
      e.preventDefault();
      const slug = tripSlugFromHash(); if (!slug) return;
      const idx = parseInt(stepBtn.dataset.insertStep, 10) || 0;
      const t = await loadTrip(slug);
      openStepWizard(slug, idx, (t && t.steps) || []);
    }
  });
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
    if (parts[2] === "trash") return viewTrash(decodeURIComponent(parts[1]));
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
  bindPhotos();
  bindWizards();
  route();
})();
