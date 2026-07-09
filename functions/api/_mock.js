// In-memory, per-isolate demo store for previews / DB-less local dev. Mirrors the wire shapes of
// the real adapters; self-seeds a realistic Thailand trip so previews aren't empty. Edits evaporate.
// IMPORTANT: when you add an /api/* route, add a branch here too, or it 404s in previews.
import { computeBudget } from "../../shared/core.js";
const S = { entries: [], trips: [], steps: [], activities: [], packing: [], attachments: [] };
function j(o, s) { return new Response(JSON.stringify(o), { status: s || 200, headers: { "content-type": "application/json; charset=utf-8" } }); }
// A real (tiny) PNG so preview <img> tags served by /api/image resolve to actual bytes (no KV in previews).
const PNG_PLACEHOLDER = Uint8Array.from(atob("iVBORw0KGgoAAAANSUhEUgAAAAQAAAABCAYAAAD5PA/NAAAAC0lEQVR4nGNgQAMAABEAAe4mBk8AAAAASUVORK5CYII="), c => c.charCodeAt(0));

(function seed() {
  const now = "2026-07-08T00:00:00.000Z", by = "demo@example.com";
  const base = (extra) => Object.assign({ created_by: by, created_at: now, updated_by: by, updated_at: now, deleted: null }, extra);
  S.entries.push(base({ id: "en-demo-1", title: "Demo row — edits here are not saved", note: "Previews run on demo data.", status: "Open", due: null, sort_order: 10 }));

  S.trips.push(base({
    id: "tp-demo-1", title: "Thailand 2026", slug: "thailand-2026", home_ccy: "EUR",
    thb_per_eur: "39", budget_target_eur: "2000", start_date: "2026-11-03", end_date: "2026-11-24",
    note: "Bangkok · Chiang Mai · Ko Lanta", sort_order: 10
  }));

  const step = (i, o) => S.steps.push(base(Object.assign({ id: "st-demo-" + i, sort_order: i * 10, cost_ccy: "THB", booking_status: "Idea" }, o)));
  step(1, { kind: "travel", title: "Fly Brussels → Bangkok", location: "BRU → BKK", transport: "plane", carrier: "Thai Airways TG935",
    arrive: "2026-11-03", arrive_time: "15:40", cost_est: "620", cost_actual: "598", cost_ccy: "EUR", booking_status: "Confirmed", booking_url: "https://example.com/ticket" });
  step(2, { kind: "stay", title: "Bangkok", location: "Bangkok", accom_name: "Riva Surya Bangkok",
    map_url: "https://www.google.com/maps/search/?api=1&query=Riva+Surya+Bangkok", lat: "13.7590", lng: "100.4940",
    arrive: "2026-11-03", depart: "2026-11-07", cost_est: "12000", cost_actual: "11800", booking_status: "Booked", booking_url: "https://example.com/hotel" });
  step(3, { kind: "travel", title: "Overnight train Bangkok → Chiang Mai", location: "BKK → CNX", transport: "train", carrier: "SRT #13 Sleeper",
    depart: "2026-11-07", depart_time: "18:40", arrive: "2026-11-08", arrive_time: "07:15", cost_est: "1650", booking_status: "Booked", booking_url: "https://example.com/train" });
  step(4, { kind: "stay", title: "Chiang Mai", location: "Chiang Mai", accom_name: "Tamarind Village", lat: "18.7877", lng: "98.9931",
    arrive: "2026-11-08", depart: "2026-11-12", cost_est: "8000", booking_status: "Planned" });
  step(5, { kind: "travel", title: "Fly Chiang Mai → Krabi", location: "CNX → KBV", transport: "plane", carrier: "AirAsia FD3446",
    depart: "2026-11-12", depart_time: "11:20", arrive: "2026-11-12", arrive_time: "13:15", cost_est: "55", cost_actual: "52", cost_ccy: "EUR", booking_status: "Booked", booking_url: "https://example.com/ticket2" });
  step(6, { kind: "stay", title: "Ko Lanta", location: "Ko Lanta (via Krabi)", accom_name: "Pimalai Resort & Spa", lat: "7.6122", lng: "99.0405",
    arrive: "2026-11-12", depart: "2026-11-18", cost_est: "24000", booking_status: "Idea" });

  const act = (i, o) => S.activities.push(base(Object.assign({ id: "ac-demo-" + i, sort_order: i * 10, cost_ccy: "THB", booking_status: "Idea", needs_advance: "no" }, o)));
  act(1, { step_id: "st-demo-2", title: "Grand Palace & Wat Phra Kaew", location: "Bangkok",
    map_url: "https://www.google.com/maps/search/?api=1&query=Grand+Palace+Bangkok", lat: "13.7500", lng: "100.4914",
    day: "2026-11-04", cost_est: "500", needs_advance: "no", booking_status: "Idea" });
  act(2, { step_id: "st-demo-4", title: "Elephant Nature Park day visit", location: "Chiang Mai", lat: "19.2100", lng: "98.8590",
    day: "2026-11-09", cost_est: "2500", needs_advance: "yes", booking_status: "Confirmed", booking_url: "https://example.com/elephants" });
  act(3, { step_id: "st-demo-6", title: "Four Islands snorkel tour", location: "Ko Lanta", day: "2026-11-14",
    cost_est: "1800", needs_advance: "yes", booking_status: "Idea" });

  const pack = (i, o) => S.packing.push(base(Object.assign({ id: "pk-demo-" + i, sort_order: i * 10, packed: "0", category: null, qty: null, note: null }, o)));
  pack(1, { title: "Travel adapters", owner: "shared", packed: "0", category: "Tech" });
  pack(2, { title: "Sunscreen", owner: "demo@example.com", packed: "0", category: "Toiletries", qty: "2" });

  const att = (i, o) => S.attachments.push(base(Object.assign({ id: "at-demo-" + i, sort_order: i * 10, caption: null, content_type: "image/jpeg", size: null, pinned: "0" }, o)));
  att(1, { parent_type: "step", parent_id: "st-demo-2", kv_key: "att/thailand-2026/at-demo-1", caption: "Riva Surya rooftop pool", size: "184320", pinned: "1" });   // pinned -> Bangkok stay card shows this as its background
  att(2, { parent_type: "activity", parent_id: "ac-demo-1", kv_key: "att/thailand-2026/at-demo-2", caption: "Grand Palace at golden hour", size: "205112" });
})();

// Mirror core.js decorate (maps_url + eur) so the demo /overview shape matches production.
function mapsUrl(r) {
  if (r.map_url) return r.map_url;                          // stored Google Maps link wins (mirrors core.js)
  if (r.lat != null && r.lat !== "" && r.lng != null && r.lng !== "")
    return "https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent(r.lat + "," + r.lng);
  return null;
}
function toEur(amt, ccy, rate) { return (amt == null || amt === "") ? null : (ccy === "EUR" ? Number(amt) : Number(amt) / Number(rate)); }
function mockOverview() {
  const trip = S.trips[0] || null, rate = trip ? trip.thb_per_eur : null;
  const decorate = (r) => { const amt = (r.cost_actual != null && r.cost_actual !== "") ? r.cost_actual : r.cost_est; return Object.assign({}, r, { maps_url: mapsUrl(r), eur: toEur(amt, r.cost_ccy, rate) }); };
  const steps = S.steps.filter(s => !s.deleted), liveIds = new Set(steps.map(s => s.id));
  const activitiesByStep = {}, unassigned = [];
  S.activities.filter(a => !a.deleted).forEach(a => {
    const d = decorate(a);
    if (liveIds.has(a.step_id)) { (activitiesByStep[a.step_id] = activitiesByStep[a.step_id] || []).push(d); }
    else unassigned.push(d);
  });
  return { trip, steps: steps.map(decorate), activitiesByStep, unassigned };
}
// Run the SHARED computeBudget over the demo trip so previews prove the exact production math.
function mockBudget() {
  const trip = S.trips[0] || {};
  return Object.assign(
    computeBudget(trip.thb_per_eur, trip.budget_target_eur, S.steps, S.activities),
    { home_ccy: trip.home_ccy }
  );
}

// Demo create: mint an id + append to the in-memory store and echo {row}, so a wizard add is visible
// in previews (still non-persistent — the isolate resets). Mirrors the real route's 201 {row} shape.
let _demoSeq = 1000;
async function demoCreate(store, prefix, request) {
  let body = {}; try { body = await request.json(); } catch (e) {}
  const now = "2026-07-08T00:00:00.000Z";
  const max = store.reduce((m, r) => Math.max(m, Number(r.sort_order) || 0), 0);
  const row = Object.assign(
    { created_by: "demo@example.com", created_at: now, updated_by: "demo@example.com", updated_at: now, deleted: null },
    body, { id: prefix + "-demo-" + (++_demoSeq), sort_order: max + 10 }
  );
  store.push(row);
  return j({ row }, 201);
}

export async function handleMock(request, env) {
  const url = new URL(request.url), parts = url.pathname.replace(/^\/api\//, "").split("/").filter(Boolean);
  const isTrash = parts.indexOf("trash") >= 0;
  const last = parts[parts.length - 1];
  if (parts[0] === "me") return j({ email: "demo@example.com", isSuperAdmin: false, mock: true });
  if (parts[0] === "entries") { if (request.method === "GET") return j({ rows: S.entries }); return j({ ok: true, demo: true }); }
  if (parts[0] === "trips")   { if (request.method === "GET") return j({ rows: isTrash ? [] : S.trips }); return j({ ok: true, demo: true }); }
  if (parts[0] === "steps")   { if (request.method === "GET") return j({ rows: isTrash ? [] : S.steps }); if (request.method === "POST" && last === "flow") return demoCreate(S.steps, "st", request); return j({ ok: true, demo: true }); }
  if (parts[0] === "activities") { if (request.method === "GET") return j({ rows: isTrash ? [] : S.activities }); if (request.method === "POST" && last === "activities") return demoCreate(S.activities, "ac", request); return j({ ok: true, demo: true }); }
  if (parts[0] === "packing") { if (request.method === "GET") return j({ rows: isTrash ? [] : S.packing }); return j({ ok: true, demo: true }); }
  if (parts[0] === "attachments") { if (request.method === "GET") return j({ rows: isTrash ? [] : S.attachments }); return j({ ok: true, demo: true }); }
  if (parts[0] === "image") {   // GET -> real placeholder PNG bytes (no KV in previews); POST -> ok/demo (never touches KV)
    if (request.method === "GET") return new Response(PNG_PLACEHOLDER, { status: 200, headers: { "content-type": "image/png", "cache-control": "public, max-age=31536000, immutable" } });
    return j({ ok: true, demo: true });
  }
  if (parts[0] === "overview") { if (request.method === "GET") return j(mockOverview()); return j({ ok: true, demo: true }); }
  if (parts[0] === "budget") { if (request.method === "GET") return j(mockBudget()); return j({ ok: true, demo: true }); }
  return j({ ok: true, demo: true });     // unknown route degrades to ok, never 500
}
