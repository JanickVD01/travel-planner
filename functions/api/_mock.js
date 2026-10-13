// In-memory, per-isolate demo store for previews / DB-less local dev. Mirrors the wire shapes of
// the real adapters; self-seeds a realistic Thailand trip so previews aren't empty. Edits evaporate.
// IMPORTANT: when you add an /api/* route, add a branch here too, or it 404s in previews.
import { computeBudget, composeOverview } from "../../shared/core.js";
const S = { entries: [], trips: [], regions: [], steps: [], activities: [], packing: [], attachments: [], todos: [] };
function j(o, s) { return new Response(JSON.stringify(o), { status: s || 200, headers: { "content-type": "application/json; charset=utf-8" } }); }
// A real (tiny) PNG so preview <img> tags served by /api/image resolve to actual bytes (no KV in previews).
const PNG_PLACEHOLDER = Uint8Array.from(atob("iVBORw0KGgoAAAANSUhEUgAAAAQAAAABCAYAAAD5PA/NAAAAC0lEQVR4nGNgQAMAABEAAe4mBk8AAAAASUVORK5CYII="), c => c.charCodeAt(0));

(function seed() {
  const now = "2026-07-08T00:00:00.000Z", by = "demo@example.com";
  const base = (extra) => Object.assign({ created_by: by, created_at: now, updated_by: by, updated_at: now, deleted: null }, extra);
  S.entries.push(base({ id: "en-demo-1", title: "Demo row — edits here are not saved", note: "Previews run on demo data.", status: "Open", due: null, sort_order: 10 }));
  // 0020 PROTOTYPE: a free-form trip to-do list (no link to steps).
  [["Check passport validity (6 months)", "1"], ["Buy travel insurance", "0"], ["Book the Chiang Mai cooking class", "0"],
   ["Order Thai baht for arrival", "0"], ["Download offline maps", "0"]]
    .forEach(([title, done], i) => S.todos.push(base({ id: "td-demo-" + (i + 1), title: title, done: done, sort_order: (i + 1) * 10 })));

  S.trips.push(base({
    id: "tp-demo-1", title: "Thailand 2026", slug: "thailand-2026", home_ccy: "EUR",
    thb_per_eur: "39", budget_target_eur: "2000", start_date: "2026-11-03", end_date: "2026-11-24",
    note: "Bangkok · Chiang Mai · Krabi", sort_order: 10
  }));

  // Regions (effort 0017): Bangkok (2 stays -> one location), North (planned 5 vs booked 4 -> gap hint),
  // Krabi (Ao Nang -> ferry -> Railay: a travel leg INSIDE a region), and an empty planned return region.
  const region = (i, o) => S.regions.push(base(Object.assign({ id: "rg-demo-" + i, planned_nights: null, start_date: null, end_date: null, note: null }, o)));
  region(1, { title: "Bangkok", planned_nights: "4", sort_order: 20 });
  region(2, { title: "North (Chiang Mai)", planned_nights: "5", sort_order: 40 });
  region(3, { title: "Krabi", planned_nights: "6", note: "Start in Ao Nang, then Railay.", sort_order: 60 });
  region(4, { title: "Bangkok (return)", planned_nights: "2", start_date: "2026-11-22", end_date: "2026-11-24", note: "Last nights before the flight home.", sort_order: 80 });

  const step = (i, o) => S.steps.push(base(Object.assign({ id: "st-demo-" + i, sort_order: i * 10, cost_ccy: "THB", booking_status: "Idea", region_id: null }, o)));
  step(1, { kind: "travel", title: "Fly Brussels → Bangkok", location: "BRU → BKK", transport: "plane", carrier: "Thai Airways TG935",
    arrive: "2026-11-03", arrive_time: "15:40", cost_est: "620", cost_actual: "598", cost_ccy: "EUR", booking_status: "Confirmed", booking_url: "https://example.com/ticket" });
  step(2, { kind: "stay", title: "Bangkok", location: "Bangkok", accom_name: "Riva Surya Bangkok", region_id: "rg-demo-1",
    map_url: "https://www.google.com/maps/search/?api=1&query=Riva+Surya+Bangkok", lat: "13.7590", lng: "100.4940",
    arrive: "2026-11-03", depart: "2026-11-05", cost_est: "6000", cost_actual: "5900", booking_status: "Booked", booking_url: "https://example.com/hotel" });
  step(9, { sort_order: 25, kind: "stay", title: "Bangkok", location: "Bangkok", accom_name: "Ariyasom Villa", region_id: "rg-demo-1",
    lat: "13.7445", lng: "100.5562", arrive: "2026-11-05", depart: "2026-11-07", cost_est: "7000", booking_status: "Planned" });
  step(3, { kind: "travel", title: "Overnight train Bangkok → Chiang Mai", location: "BKK → CNX", transport: "train", carrier: "SRT #13 Sleeper",
    depart: "2026-11-07", depart_time: "18:40", arrive: "2026-11-08", arrive_time: "07:15", cost_est: "1650", booking_status: "Booked", booking_url: "https://example.com/train" });
  step(4, { kind: "stay", title: "Chiang Mai", location: "Chiang Mai", accom_name: "Tamarind Village", lat: "18.7877", lng: "98.9931", region_id: "rg-demo-2",
    arrive: "2026-11-08", depart: "2026-11-12", cost_est: "8000", booking_status: "Planned" });
  step(5, { kind: "travel", title: "Fly Chiang Mai → Krabi", location: "CNX → KBV", transport: "plane", carrier: "AirAsia FD3446",
    depart: "2026-11-12", depart_time: "11:20", arrive: "2026-11-12", arrive_time: "13:15", cost_est: "55", cost_actual: "52", cost_ccy: "EUR", booking_status: "Booked", booking_url: "https://example.com/ticket2" });
  step(6, { kind: "stay", title: "Ao Nang", location: "Ao Nang", accom_name: "Ao Nang Villa Resort", lat: "8.0326", lng: "98.8236", region_id: "rg-demo-3",
    arrive: "2026-11-12", depart: "2026-11-15", cost_est: "9000", booking_status: "Idea" });
  step(7, { sort_order: 65, kind: "travel", title: "Longtail boat Ao Nang → Railay", location: "Ao Nang → Railay", transport: "ferry", region_id: "rg-demo-3",
    depart: "2026-11-15", depart_time: "10:00", arrive: "2026-11-15", arrive_time: "10:20", cost_est: "200", booking_status: "Idea" });
  step(8, { sort_order: 70, kind: "stay", title: "Railay", location: "Railay", accom_name: "Railay Bay Resort", lat: "8.0115", lng: "98.8378", region_id: "rg-demo-3",
    arrive: "2026-11-15", depart: "2026-11-18", cost_est: "12000", booking_status: "Idea" });
  S.steps.sort((a, b) => a.sort_order - b.sort_order);   // the API lists in timeline order

  const act = (i, o) => S.activities.push(base(Object.assign({ id: "ac-demo-" + i, sort_order: i * 10, cost_ccy: "THB", booking_status: "Idea", needs_advance: "no" }, o)));
  act(1, { step_id: "st-demo-2", title: "Grand Palace & Wat Phra Kaew", location: "Bangkok",
    map_url: "https://www.google.com/maps/search/?api=1&query=Grand+Palace+Bangkok", lat: "13.7500", lng: "100.4914",
    day: "2026-11-04", cost_est: "500", needs_advance: "no", booking_status: "Idea" });
  act(2, { step_id: "st-demo-4", title: "Elephant Nature Park day visit", location: "Chiang Mai", lat: "19.2100", lng: "98.8590",
    day: "2026-11-09", cost_est: "2500", needs_advance: "yes", booking_status: "Confirmed", booking_url: "https://example.com/elephants" });
  act(3, { step_id: "st-demo-6", title: "Four Islands snorkel tour", location: "Ao Nang", day: "2026-11-14",
    cost_est: "1800", needs_advance: "yes", booking_status: "Idea" });

  const pack = (i, o) => S.packing.push(base(Object.assign({ id: "pk-demo-" + i, sort_order: i * 10, packed: "0", category: null, qty: null, note: null }, o)));
  pack(1, { title: "Travel adapters", owner: "shared", packed: "0", category: "Tech" });
  pack(2, { title: "Sunscreen", owner: "demo@example.com", packed: "0", category: "Toiletries", qty: "2" });

  const att = (i, o) => S.attachments.push(base(Object.assign({ id: "at-demo-" + i, sort_order: i * 10, caption: null, content_type: "image/jpeg", size: null, pinned: "0" }, o)));
  att(1, { parent_type: "step", parent_id: "st-demo-2", kv_key: "att/thailand-2026/at-demo-1", caption: "Riva Surya rooftop pool", size: "184320", pinned: "1" });   // pinned -> Bangkok stay card shows this as its background
  att(2, { parent_type: "activity", parent_id: "ac-demo-1", kv_key: "att/thailand-2026/at-demo-2", caption: "Grand Palace at golden hour", size: "205112" });
})();

// Run the SHARED composeOverview (decorate + grouping + the region/location tree) over the demo rows so
// the preview /overview is exactly the production shape and logic.
function mockOverview() {
  return composeOverview(S.trips[0] || null, S.regions, S.steps, S.activities);
}
// Run the SHARED computeBudget over the demo trip so previews prove the exact production math.
function mockBudget() {
  const trip = S.trips[0] || {};
  return Object.assign(
    computeBudget(trip.thb_per_eur, trip.budget_target_eur, S.steps, S.activities, S.regions),
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
  let sort = max + 10;
  // A step created INSIDE a region lands right after that region's last step (or takes an empty region's
  // slot) — a rough stand-in for core createStep's placement, so a demo add doesn't show as a split region.
  if (store === S.steps && body.region_id) {
    const members = S.steps.filter(s => s.region_id === body.region_id && !s.deleted);
    const reg = S.regions.find(r => r.id === body.region_id);
    if (members.length) sort = Math.max.apply(null, members.map(s => Number(s.sort_order) || 0)) + 1;
    else if (reg) sort = Number(reg.sort_order) || sort;
  }
  const row = Object.assign(
    { created_by: "demo@example.com", created_at: now, updated_by: "demo@example.com", updated_at: now, deleted: null },
    body, { id: prefix + "-demo-" + (++_demoSeq), sort_order: sort }
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
  if (parts[0] === "regions") { if (request.method === "GET") return j({ rows: isTrash ? [] : S.regions.filter(r => !r.deleted) }); if (request.method === "POST" && last === "regions") return demoCreate(S.regions, "rg", request); return j({ ok: true, demo: true }); }
  if (parts[0] === "steps")   { if (request.method === "GET") return j({ rows: isTrash ? [] : S.steps }); if (request.method === "POST" && last === "flow") return demoCreate(S.steps, "st", request); return j({ ok: true, demo: true }); }
  if (parts[0] === "activities") { if (request.method === "GET") return j({ rows: isTrash ? [] : S.activities }); if (request.method === "POST" && last === "activities") return demoCreate(S.activities, "ac", request); return j({ ok: true, demo: true }); }
  if (parts[0] === "todos") {   // 0020 PROTOTYPE: full in-memory CRUD so the to-do list really works on the preview
    const id = parts[3], row = id ? S.todos.find(r => r.id === id) : null;
    if (request.method === "GET") return j({ rows: S.todos.filter(r => !r.deleted) });
    if (request.method === "POST" && last === "todos") return demoCreate(S.todos, "td", request);
    if (request.method === "PATCH" && row) { let b = {}; try { b = await request.json(); } catch (e) {} ["title", "done"].forEach(k => { if (k in b) row[k] = String(b[k]); }); return j({ row }); }
    if (request.method === "DELETE" && row) { row.deleted = new Date().toISOString(); return j({ ok: true }); }
    return j({ ok: true, demo: true });
  }
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
