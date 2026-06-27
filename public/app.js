"use strict";
/* Travel Planner SPA — no build, no framework. Hash router + fetch helpers + an inline,
   XSS-safe markdown renderer that powers the in-app wiki. Per-app content lives in
   public/data/*.json, not here. */

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

// ---- self-contained markdown renderer (escapes raw HTML; no external lib) --
function renderMarkdown(src) {
  const lines = String(src || "").replace(/\r\n?/g, "\n").split("\n");
  let out = "", i = 0;
  // Inline formatting. esc() first so raw HTML can never survive; then code/links/bold/italic.
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
    if (/^```/.test(ln)) {                       // fenced code
      i++; let buf = [];
      while (i < lines.length && !/^```/.test(lines[i])) { buf.push(lines[i]); i++; }
      i++; out += "<pre><code>" + esc(buf.join("\n")) + "</code></pre>"; continue;
    }
    if (/^\s*$/.test(ln)) { i++; continue; }     // blank
    if (/^#{1,6}\s/.test(ln)) {                  // headings
      const m = ln.match(/^(#{1,6})\s+(.*)$/);
      out += "<h" + m[1].length + ">" + renderInline(m[2]) + "</h" + m[1].length + ">"; i++; continue;
    }
    if (/^\s*([-*+])\s+/.test(ln)) {             // unordered list
      out += "<ul>";
      while (i < lines.length && /^\s*([-*+])\s+/.test(lines[i])) { out += "<li>" + renderInline(lines[i].replace(/^\s*([-*+])\s+/, "")) + "</li>"; i++; }
      out += "</ul>"; continue;
    }
    if (/^\s*\d+\.\s+/.test(ln)) {               // ordered list
      out += "<ol>";
      while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i])) { out += "<li>" + renderInline(lines[i].replace(/^\s*\d+\.\s+/, "")) + "</li>"; i++; }
      out += "</ol>"; continue;
    }
    if (/^>\s?/.test(ln)) {                       // blockquote
      let buf = [];
      while (i < lines.length && /^>\s?/.test(lines[i])) { buf.push(lines[i].replace(/^>\s?/, "")); i++; }
      out += "<blockquote>" + renderInline(buf.join(" ")) + "</blockquote>"; continue;
    }
    if (/^(-{3,}|\*{3,}|_{3,})\s*$/.test(ln)) { out += "<hr/>"; i++; continue; } // rule
    // paragraph (gather consecutive non-blank, non-structural lines)
    let buf = [ln]; i++;
    while (i < lines.length && !/^\s*$/.test(lines[i]) && !/^(#{1,6}\s|```|>\s?|\s*([-*+])\s+|\s*\d+\.\s+)/.test(lines[i])) { buf.push(lines[i]); i++; }
    out += "<p>" + renderInline(buf.join(" ")) + "</p>";
  }
  return out;
}

// ---- app state -------------------------------------------------------------
const state = { me: null, app: null, wiki: null, releases: null };

async function loadMe() {
  try { state.me = await api("me"); } catch { state.me = { email: "", isSuperAdmin: false, mock: false }; }
  $("#who").textContent = state.me.email || "";
  $("#demo-banner").hidden = !state.me.mock;
}

// ---- nav -------------------------------------------------------------------
function buildNav() {
  const nav = $("#nav");
  let html = '<a href="#/" data-route="/">Home</a>';
  html += '<a href="#/whats-new" data-route="/whats-new">What’s New</a>';
  if (state.wiki && state.wiki.topics && state.wiki.topics.length) {
    const sections = {};
    state.wiki.topics.forEach(t => { (sections[t.section || "Guide"] = sections[t.section || "Guide"] || []).push(t); });
    Object.keys(sections).forEach(sec => {
      html += '<div class="section">' + esc(sec) + "</div>";
      sections[sec].forEach(t => { html += '<a href="#/wiki/' + esc(t.slug) + '" data-route="/wiki/' + esc(t.slug) + '">' + esc(t.icon || "") + " " + esc(t.title) + "</a>"; });
    });
  }
  nav.innerHTML = html;
}
function markActive(route) {
  document.querySelectorAll("#nav a").forEach(a => a.classList.toggle("active", a.getAttribute("data-route") === route));
}

// ---- views -----------------------------------------------------------------
function viewHome() {
  markActive("/");
  const lists = (state.app && state.app.lists) || [];
  let body = "";
  if (!lists.length) {
    body = '<p class="muted">No lists are configured yet. This is an empty but fully wired skeleton: ' +
      'sign-in (Cloudflare Access), the D1-backed API, demo previews, the MCP server, and the GitHub ' +
      'parallel-session flow are all in place.</p>' +
      '<p class="muted">Add a real list by following <strong>Add a list</strong> in <code>CLAUDE.md</code>, ' +
      'or just ask Claude through the MCP server.</p>';
  } else {
    body = '<div class="cards">' + lists.map(l =>
      '<a class="card" href="#/' + esc(l.space || "home") + "/" + esc(l.list) + '"><div class="row-title">' +
      esc(l.title || l.list) + '</div><div class="row-note">' + esc(l.summary || "") + "</div></a>").join("") + "</div>";
  }
  view().innerHTML = '<div class="panel"><h1>' + esc((state.app && state.app.title) || "Travel Planner") + "</h1>" + body + "</div>";
}

async function viewWhatsNew() {
  markActive("/whats-new");
  view().innerHTML = '<div class="panel"><h1>What’s New</h1><p class="muted">Loading…</p></div>';
  let rel = state.releases;
  if (!rel) { try { rel = state.releases = await fetchJSON("data/releases.json"); } catch { rel = { releases: [] }; } }
  const items = (rel && rel.releases) || [];
  const body = items.length ? items.map(r =>
    '<div class="card"><div class="row-title">' + esc(r.version || "") + " — " + esc(r.title || "") +
    '</div><div class="row-note">' + esc(r.date || "") + "</div>" +
    (r.notes ? '<div class="md">' + renderMarkdown(Array.isArray(r.notes) ? r.notes.map(n => "- " + n).join("\n") : r.notes) + "</div>" : "") +
    "</div>").join("") : '<p class="muted">No releases yet.</p>';
  view().innerHTML = '<div class="panel"><h1>What’s New</h1><div class="cards">' + body + "</div></div>";
}

async function viewWiki(slug) {
  markActive("/wiki/" + slug);
  view().innerHTML = '<div class="panel"><p class="muted">Loading…</p></div>';
  const topic = state.wiki && state.wiki.topics.find(t => t.slug === slug);
  if (!topic) { view().innerHTML = '<div class="panel"><h1>Not found</h1></div>'; return; }
  let md = "";
  try { const r = await fetch("data/wiki/" + topic.file); md = await r.text(); } catch { md = "*Could not load this topic.*"; }
  view().innerHTML = '<div class="panel md"><h1>' + esc(topic.title) + "</h1>" + renderMarkdown(md) + "</div>";
}

async function viewList(space, list) {
  markActive(null);
  view().innerHTML = '<div class="panel"><h1>' + esc(space) + " / " + esc(list) + '</h1><p class="muted">Loading…</p></div>';
  let data;
  try { data = await api("entries/" + encodeURIComponent(space) + "/" + encodeURIComponent(list)); }
  catch (e) { view().innerHTML = '<div class="panel"><h1>' + esc(space) + " / " + esc(list) + '</h1><p class="muted">' + esc(e.message) + "</p></div>"; return; }
  const rows = (data && data.rows) || [];
  const cards = rows.length ? rows.map(r =>
    '<div class="card"><div class="row-title">' + esc(r.title) +
    (r.status ? ' <span class="chip ' + esc(r.status) + '">' + esc(r.status) + "</span>" : "") + "</div>" +
    (r.note ? '<div class="row-note">' + esc(r.note) + "</div>" : "") +
    (r.due ? '<div class="row-note">Due ' + esc(r.due) + "</div>" : "") + "</div>").join("") :
    '<p class="muted">Empty list. Add rows via the MCP server or the API.</p>';
  view().innerHTML = '<div class="panel"><h1>' + esc(space) + " / " + esc(list) + '</h1><div class="cards">' + cards + "</div></div>";
}

// ---- router ----------------------------------------------------------------
function route() {
  const hash = location.hash.replace(/^#/, "") || "/";
  const parts = hash.split("/").filter(Boolean);   // "/" -> [], "/wiki/x" -> ["wiki","x"], "/a/b" -> ["a","b"]
  if (parts.length === 0) return viewHome();
  if (parts[0] === "whats-new") return viewWhatsNew();
  if (parts[0] === "wiki") return viewWiki(parts[1]);
  if (parts.length >= 2) return viewList(parts[0], parts[1]);
  return viewHome();
}

// ---- boot ------------------------------------------------------------------
function setTheme(t) { document.documentElement.setAttribute("data-theme", t); try { localStorage.setItem("app-theme", t); } catch {} }
$("#theme-toggle").addEventListener("click", () => setTheme(document.documentElement.getAttribute("data-theme") === "light" ? "dark" : "light"));
$("#menu-toggle").addEventListener("click", () => $("#side").classList.toggle("collapsed"));
window.addEventListener("hashchange", route);

(async function boot() {
  try { state.app = await fetchJSON("data/app.json"); } catch { state.app = { title: "Travel Planner", lists: [] }; }
  $("#brand-title").textContent = (state.app && state.app.title) || "Travel Planner";
  document.title = $("#brand-title").textContent;
  try { state.wiki = await fetchJSON("data/wiki/index.json"); } catch { state.wiki = { topics: [] }; }
  await loadMe();
  buildNav();
  route();
})();
