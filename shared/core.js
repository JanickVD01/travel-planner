// Framework-agnostic domain core. Imported BY BOTH the Pages API (functions/api/_lib.js
// re-exports it) and the MCP worker (worker-mcp/src/mcp.js). No Request/Response/env coupling:
// every function is (env, args, actor) -> plain data | throw ServiceError.
//
// REAL ENTITIES: trips, regions, steps (flow), activities, packing, attachments — see FLAT_SPECS below.
// `entries` (cols: title, note, status, due) is a leftover generic example, kept ONLY as the MCP
// smoke-test fixture (worker-mcp `npm run smoke`); it is not part of the travel product.
// To add a new list: add a FLAT_SPECS entry + named wrappers below, a route file under
// functions/api/<x>/[[path]].js, a branch in functions/api/_mock.js, and (optional) MCP tools.

export const STATUSES = ["Open", "Doing", "Blocked", "Done"];
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// Domain error. `status` maps to an HTTP status in the Pages layer; `code` is optional and
// only set where a caller needs to branch (e.g. a conflict).
export class ServiceError extends Error {
  constructor(status, message, code) { super(message); this.name = "ServiceError"; this.status = status; this.code = code; }
}

// Identity helpers + the (optional) members gate. SUPER_ADMIN comes from env so it is never
// hard-coded; it short-circuits membership BEFORE any DB read, so you can never lock yourself out.
function normEmail(e) { return String(e == null ? "" : e).trim().toLowerCase(); }
export function superAdmin(env) { return normEmail(env && env.SUPER_ADMIN_EMAIL); }
export function isSuperAdmin(env, actor) { return normEmail(actor) === superAdmin(env) && !!superAdmin(env); }
export function assertActor(actor) {
  const a = normEmail(actor);
  if (!a) throw new ServiceError(401, "authentication required");
  return a;
}

// -- validators / coercers --------------------------------------------------
export function jsonArray(v) {
  let a = v; if (typeof v === "string") { try { a = JSON.parse(v); } catch { a = []; } }
  return Array.isArray(a) ? a.map(String).filter(s => s.length) : [];
}
export function cleanDate(v) { return (v && DATE_RE.test(String(v))) ? String(v) : null; }
export function cleanStatus(v) { return STATUSES.indexOf(String(v)) >= 0 ? String(v) : "Open"; }
export function mintId(prefix) { return prefix + "-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 6); }

// -- travel-domain cleaners (added incrementally; see docs/implementations/0003) ----
// numbers / money: stored full-precision as TEXT, rounded only at display.
export function cleanNumber(v) { const n = Number(v); return (v == null || v === "" || !Number.isFinite(n)) ? null : String(n); }
export function cleanMoney(v)  { const n = Number(v); return (v == null || v === "" || !Number.isFinite(n) || n < 0) ? null : String(n); }
// coordinates: one per step / activity; bounded per-axis so garbage -> null (never NaN).
function coordNum(v, min, max) { const n = Number(v); return (v == null || v === "" || !Number.isFinite(n) || n < min || n > max) ? null : String(n); }
export function cleanLat(v) { return coordNum(v, -90, 90); }
export function cleanLng(v) { return coordNum(v, -180, 180); }
// map_url is the PRIMARY location now (a real Google Maps link, or a coord-derived one). http(s) only
// -> a stored link can never carry a javascript:/data: scheme into an href. Garbage -> null.
export function cleanMapUrl(v) { return (v && /^https?:\/\//i.test(String(v))) ? String(v) : null; }
// enums: default to the safe/first value on anything unexpected (like cleanStatus).
export function cleanKind(v) { return String(v) === "travel" ? "travel" : "stay"; }            // default stay
const TRANSPORTS = ["plane", "train", "bus", "ferry", "car", "other"];
export function cleanTransport(v) { return (v == null || v === "") ? null : (TRANSPORTS.indexOf(String(v)) >= 0 ? String(v) : "other"); }
export const BOOKINGS = ["Idea", "Planned", "Booked", "Confirmed"];
export function cleanBooking(v) { return BOOKINGS.indexOf(String(v)) >= 0 ? String(v) : "Idea"; }  // default Idea
export const CCYS = ["THB", "EUR"];
export function cleanCcy(v)     { return CCYS.indexOf(String(v)) >= 0 ? String(v) : "THB"; }       // amount ccy, default THB
export function cleanHomeCcy(v) { return CCYS.indexOf(String(v)) >= 0 ? String(v) : "EUR"; }       // trip home ccy, default EUR
export function cleanTime(v) { return /^\d{2}:\d{2}$/.test(String(v)) ? String(v) : null; }        // HH:MM or null
export function cleanSlug(v) { const s = String(v == null ? "" : v).trim().toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, ""); return s || null; }
export function cleanYesNo(v) { return (v === "yes" || v === true) ? "yes" : "no"; }   // needs_advance flag, default no
// packing (M8): owner = 'shared' OR a person's email (lowercased); packed = '0'|'1' boolean; qty = int>=1 or null.
export function cleanOwner(v) { const s = String(v == null ? "" : v).trim().toLowerCase(); return (s === "" || s === "shared") ? "shared" : s; }
export function cleanBool(v) { return (v === true || v === 1 || v === "1" || v === "true" || v === "yes") ? "1" : "0"; }
export function cleanQty(v) { const n = Math.trunc(Number(v)); return (Number.isFinite(n) && n >= 1) ? String(n) : null; }
// attachments (M9): image BYTES live in Workers KV (env.IMAGES_KV); METADATA lives in D1. parent_type
// = which entity the photo hangs off (step|activity, default step); content_type is coerced through an
// image/* whitelist (anything else -> null); attachmentKey builds the KV key server-side from slug+id
// (never trust a client-supplied key -> no path traversal).
export function cleanParentType(v) { return String(v) === "activity" ? "activity" : "step"; }   // default step
const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif", "image/heic", "image/heif"];
export function cleanContentType(v) { return IMAGE_TYPES.indexOf(String(v)) >= 0 ? String(v) : null; }
export function attachmentKey(slug, id) { return "att/" + slug + "/" + id; }

// -- the generic flat-list engine: one implementation, many lists -----------
const FLAT_SPECS = {
  entries: {
    table: "entries", audit: "entries_audit", idCol: "entry_id", prefix: "en",
    cols: [
      { name: "title" },
      { name: "note" },
      { name: "status", clean: cleanStatus },
      { name: "due", clean: cleanDate, nullable: true }
    ]
  },
  // trips: registry + trip-wide config (space='app', list='trips'). `slug` is the space of its child rows.
  trips: {
    table: "trips", audit: "trips_audit", idCol: "trip_id", prefix: "tp", soft: true,
    cols: [
      { name: "title" },
      { name: "slug", clean: cleanSlug },
      { name: "home_ccy", clean: cleanHomeCcy },
      { name: "thb_per_eur", clean: cleanNumber, nullable: true },
      { name: "budget_target_eur", clean: cleanMoney, nullable: true },
      { name: "start_date", clean: cleanDate, nullable: true },
      { name: "end_date", clean: cleanDate, nullable: true },
      { name: "note", nullable: true }
    ]
  },
  // steps: the vertical timeline (space=<slug>, list='flow'). kind = travel|stay; sort_order IS the order.
  steps: {
    table: "steps", audit: "steps_audit", idCol: "step_id", prefix: "st", soft: true,
    cols: [
      { name: "kind", clean: cleanKind },
      { name: "title" },
      { name: "location" },
      { name: "map_url", clean: cleanMapUrl, nullable: true },
      { name: "lat", clean: cleanLat, nullable: true },
      { name: "lng", clean: cleanLng, nullable: true },
      { name: "arrive", clean: cleanDate, nullable: true },
      { name: "arrive_time", clean: cleanTime, nullable: true },
      { name: "depart", clean: cleanDate, nullable: true },
      { name: "depart_time", clean: cleanTime, nullable: true },
      { name: "accom_name", nullable: true },
      { name: "transport", clean: cleanTransport, nullable: true },
      { name: "carrier", nullable: true },
      { name: "cost_est", clean: cleanMoney, nullable: true },
      { name: "cost_actual", clean: cleanMoney, nullable: true },
      { name: "cost_ccy", clean: cleanCcy },
      { name: "booking_status", clean: cleanBooking },
      { name: "booking_url", nullable: true },
      { name: "included", clean: cleanBool },
      { name: "note", nullable: true },
      { name: "region_id", nullable: true }   // parent region id (free-text, not an FK; null = no region) — effort 0017
    ]
  },
  // regions: the planning layer above steps (space=<slug>, list='regions') — effort 0017. A region can
  // exist EMPTY (planned before any stay). Its position on the timeline is DERIVED from its member steps'
  // sort_order; its own sort_order (same scale as steps) only places it while it has no live steps.
  regions: {
    table: "regions", audit: "regions_audit", idCol: "region_id", prefix: "rg", soft: true,
    cols: [
      { name: "title" },
      { name: "planned_nights", clean: cleanQty, nullable: true },
      { name: "start_date", clean: cleanDate, nullable: true },
      { name: "end_date", clean: cleanDate, nullable: true },
      { name: "note", nullable: true }
    ]
  },
  // activities: things to do, hung off a step (space=<slug>, list='activities'). step_id is the
  // parent step id (free-text, not an FK). sort_order orders within a step.
  activities: {
    table: "activities", audit: "activities_audit", idCol: "activity_id", prefix: "ac", soft: true,
    cols: [
      { name: "step_id" },
      { name: "title" },
      { name: "location", nullable: true },
      { name: "map_url", clean: cleanMapUrl, nullable: true },
      { name: "lat", clean: cleanLat, nullable: true },
      { name: "lng", clean: cleanLng, nullable: true },
      { name: "day", clean: cleanDate, nullable: true },
      { name: "needs_advance", clean: cleanYesNo },
      { name: "cost_est", clean: cleanMoney, nullable: true },
      { name: "cost_actual", clean: cleanMoney, nullable: true },
      { name: "cost_ccy", clean: cleanCcy },
      { name: "booking_status", clean: cleanBooking },
      { name: "booking_url", nullable: true },
      { name: "included", clean: cleanBool },
      { name: "note", nullable: true }
    ]
  },
  // packing: the packing list, one row per item (space=<slug>, list='packing'). owner = 'shared' or a
  // person's email; packed = '0'|'1'; qty = int>=1 or null. Replaces the old to-do checklist.
  packing: {
    table: "packing", audit: "packing_audit", idCol: "packing_id", prefix: "pk", soft: true,
    cols: [
      { name: "title" },
      { name: "owner", clean: cleanOwner },
      { name: "packed", clean: cleanBool },
      { name: "category", nullable: true },
      { name: "qty", clean: cleanQty, nullable: true },
      { name: "note", nullable: true }
    ]
  },
  // todos: a free-form trip to-do list (space=<slug>, list='todos') — effort 0020. Not tied to steps;
  // done = '0'|'1'. Added / ticked off in the app (To-do tab, the wide-screen pane) and by Claude (MCP).
  todos: {
    table: "todos", audit: "todos_audit", idCol: "todo_id", prefix: "td", soft: true,
    cols: [
      { name: "title" },
      { name: "done", clean: cleanBool },
      { name: "note", nullable: true }
    ]
  },
  // attachments: photo metadata, one row per image (space=<slug>, list='attachments'). The bytes live
  // in KV (kv:true); parent_type+parent_id say which step/activity the photo belongs to. kv_key holds
  // the KV key (att/<slug>/<id>); it is rebuilt server-side, never trusted from a client.
  attachments: {
    table: "attachments", audit: "attachments_audit", idCol: "attachment_id", prefix: "at", soft: true, kv: true,
    cols: [
      { name: "parent_type", clean: cleanParentType },
      { name: "parent_id" },
      { name: "kv_key" },
      { name: "caption", nullable: true },
      { name: "content_type", clean: cleanContentType, nullable: true },
      { name: "size", clean: cleanQty, nullable: true },
      { name: "pinned", clean: cleanBool }   // '1' = this photo is the parent step's card background (one per parent)
    ]
  }
};

function cleanCol(c, v) {
  if (c.clean) return c.clean(v);
  if (c.nullable) return (v == null || v === "") ? null : String(v);
  return String(v == null ? "" : v);
}
function mapRow(spec, r) {
  const o = { id: r[spec.idCol], sort_order: r.sort_order };
  spec.cols.forEach(c => o[c.name] = r[c.name]);
  o.created_by = r.created_by; o.created_at = r.created_at; o.updated_by = r.updated_by; o.updated_at = r.updated_at;
  if (spec.soft) o.deleted = r.deleted || null;
  return o;
}
function detail(spec, args) { const d = {}; spec.cols.forEach(c => { if (Object.prototype.hasOwnProperty.call(args, c.name)) d[c.name] = args[c.name]; }); return d; }
function auditStmt(env, spec, space, list, id, op, det, actor, at) {
  return env.DB.prepare("INSERT INTO " + spec.audit + " (space,list," + spec.idCol + ",op,detail,actor,at) VALUES (?1,?2,?3,?4,?5,?6,?7)")
    .bind(space, list, id, op, det == null ? null : JSON.stringify(det), actor, at);
}

async function flatList(env, spec, { space, list, trash }, actor) {
  let where = "space=? AND list=?", order = "sort_order, " + spec.idCol;
  if (spec.soft) { where += trash ? " AND deleted IS NOT NULL" : " AND deleted IS NULL"; if (trash) order = "deleted DESC"; }
  const { results } = await env.DB.prepare(
    "SELECT * FROM " + spec.table + " WHERE " + where + " ORDER BY " + order
  ).bind(space, list).all();
  return { rows: (results || []).map(r => mapRow(spec, r)) };
}
async function flatCreate(env, spec, args, actor) {
  const { space, list } = args, now = new Date().toISOString(), id = mintId(spec.prefix);
  let sort;
  if (Number.isFinite(args.sort_order)) sort = args.sort_order | 0;   // caller-placed (e.g. a step inside a region)
  else {
    const max = await env.DB.prepare("SELECT COALESCE(MAX(sort_order),0) AS m FROM " + spec.table + " WHERE space=? AND list=?").bind(space, list).first();
    sort = (max && max.m ? max.m : 0) + 10;
  }
  const names = spec.cols.map(c => c.name), vals = spec.cols.map(c => cleanCol(c, args[c.name]));
  const sql = "INSERT INTO " + spec.table + " (space,list," + spec.idCol + "," + names.join(",") +
    ",sort_order,created_by,created_at,updated_by,updated_at) VALUES (" + names.map(() => "?").join(",") + ",?,?,?,?,?,?,?,?)";
  const ins = env.DB.prepare(sql);
  await env.DB.batch([
    ins.bind.apply(ins, [space, list, id].concat(vals).concat([sort, actor, now, actor, now])),
    auditStmt(env, spec, space, list, id, "create", detail(spec, args), actor, now)
  ]);
  return { row: mapRow(spec, { [spec.idCol]: id, sort_order: sort, ...Object.fromEntries(names.map((n, i) => [n, vals[i]])) }) };
}
async function flatPatch(env, spec, args, actor) {
  const { space, list } = args, id = args.id, now = new Date().toISOString(), sets = [], binds = [];
  spec.cols.forEach(c => { if (Object.prototype.hasOwnProperty.call(args, c.name)) { sets.push(c.name + "=?"); binds.push(cleanCol(c, args[c.name])); } });
  if (Number.isFinite(args.sort_order)) { sets.push("sort_order=?"); binds.push(args.sort_order | 0); }
  if (!sets.length) throw new ServiceError(400, "nothing to update");
  sets.push("updated_by=?"); binds.push(actor); sets.push("updated_at=?"); binds.push(now);
  const exists = await env.DB.prepare("SELECT " + spec.idCol + " FROM " + spec.table + " WHERE space=? AND list=? AND " + spec.idCol + "=?" + (spec.soft ? " AND deleted IS NULL" : "")).bind(space, list, id).first();
  if (!exists) throw new ServiceError(404, "not found");
  const upd = env.DB.prepare("UPDATE " + spec.table + " SET " + sets.join(", ") + " WHERE space=? AND list=? AND " + spec.idCol + "=?");
  await env.DB.batch([
    upd.bind.apply(upd, binds.concat([space, list, id])),
    auditStmt(env, spec, space, list, id, "update", detail(spec, args), actor, now)
  ]);
  return { ok: true, id };
}
async function flatDelete(env, spec, args, actor) {
  const { space, list, id } = args, now = new Date().toISOString();
  if (!spec.soft) {   // hard delete (e.g. entries): unrecoverable, detail=null
    await env.DB.batch([
      env.DB.prepare("DELETE FROM " + spec.table + " WHERE space=? AND list=? AND " + spec.idCol + "=?").bind(space, list, id),
      auditStmt(env, spec, space, list, id, "delete", null, actor, now)
    ]);
    return { ok: true, deleted: id };
  }
  // soft delete: set the tombstone and snapshot the full row into the audit so restore is possible.
  const row = await env.DB.prepare("SELECT * FROM " + spec.table + " WHERE space=? AND list=? AND " + spec.idCol + "=? AND deleted IS NULL").bind(space, list, id).first();
  if (!row) throw new ServiceError(404, "not found");
  const upd = env.DB.prepare("UPDATE " + spec.table + " SET deleted=?, updated_by=?, updated_at=? WHERE space=? AND list=? AND " + spec.idCol + "=?");
  await env.DB.batch([
    upd.bind(now, actor, now, space, list, id),
    auditStmt(env, spec, space, list, id, "delete", mapRow(spec, row), actor, now)
  ]);
  return { ok: true, deleted: id };
}
// Restore a soft-deleted row (clears the tombstone). Trash UI in a later milestone.
async function flatRestore(env, spec, args, actor) {
  const { space, list, id } = args, now = new Date().toISOString();
  const row = await env.DB.prepare("SELECT " + spec.idCol + " FROM " + spec.table + " WHERE space=? AND list=? AND " + spec.idCol + "=? AND deleted IS NOT NULL").bind(space, list, id).first();
  if (!row) throw new ServiceError(404, "not found in trash");
  const upd = env.DB.prepare("UPDATE " + spec.table + " SET deleted=NULL, updated_by=?, updated_at=? WHERE space=? AND list=? AND " + spec.idCol + "=?");
  await env.DB.batch([
    upd.bind(actor, now, space, list, id),
    auditStmt(env, spec, space, list, id, "restore", null, actor, now)
  ]);
  return { ok: true, restored: id };
}
// Hard delete forever (from trash). Snapshots the row; deletes KV bytes for kv-backed specs.
async function flatPurge(env, spec, args, actor) {
  const { space, list, id } = args, now = new Date().toISOString();
  const cond = spec.soft ? " AND deleted IS NOT NULL" : "";   // purge only from trash for soft specs
  const row = await env.DB.prepare("SELECT * FROM " + spec.table + " WHERE space=? AND list=? AND " + spec.idCol + "=?" + cond).bind(space, list, id).first();
  if (!row) throw new ServiceError(404, spec.soft ? "not found in trash" : "not found");
  await env.DB.batch([
    env.DB.prepare("DELETE FROM " + spec.table + " WHERE space=? AND list=? AND " + spec.idCol + "=?").bind(space, list, id),
    auditStmt(env, spec, space, list, id, "purge", mapRow(spec, row), actor, now)
  ]);
  if (spec.kv && row.kv_key && env.IMAGES_KV) { try { await env.IMAGES_KV.delete(row.kv_key); } catch {} }
  return { ok: true, purged: id };
}
async function flatSeed(env, spec, args, actor) {
  const { space, list } = args, rows = Array.isArray(args.rows) ? args.rows : [];
  const cnt = await env.DB.prepare("SELECT COUNT(*) AS c FROM " + spec.table + " WHERE space=? AND list=?").bind(space, list).first();
  if (cnt && cnt.c) return { seeded: false, reason: "already seeded" };
  const aud = await env.DB.prepare("SELECT COUNT(*) AS c FROM " + spec.audit + " WHERE space=? AND list=?").bind(space, list).first();
  if (aud && aud.c) return { seeded: false, reason: "previously seeded" };  // deleted rows stay deleted
  const now = new Date().toISOString(), names = spec.cols.map(c => c.name), stmts = [];
  rows.forEach((row, i) => {
    const id = mintId(spec.prefix), vals = spec.cols.map(c => cleanCol(c, row[c.name]));
    const sql = "INSERT OR IGNORE INTO " + spec.table + " (space,list," + spec.idCol + "," + names.join(",") +
      ",sort_order,created_by,created_at,updated_by,updated_at) VALUES (" + names.map(() => "?").join(",") + ",?,?,?,?,?,?,?,?)";
    const ins = env.DB.prepare(sql);
    stmts.push(ins.bind.apply(ins, [space, list, id].concat(vals).concat([(i + 1) * 10, actor, now, actor, now])));
  });
  stmts.push(auditStmt(env, spec, space, list, "*", "seed", { count: rows.length }, actor, now));
  await env.DB.batch(stmts);
  return { seeded: true, count: rows.length };
}

// Named wrappers the API + MCP import (one set per list).
export const listEntries   = (env, a, who) => flatList(env, FLAT_SPECS.entries, a, who);
export const createEntry   = (env, a, who) => flatCreate(env, FLAT_SPECS.entries, a, who);
export const patchEntry    = (env, a, who) => flatPatch(env, FLAT_SPECS.entries, a, who);
export const deleteEntry   = (env, a, who) => flatDelete(env, FLAT_SPECS.entries, a, who);
export const seedEntries   = (env, a, who) => flatSeed(env, FLAT_SPECS.entries, a, who);

// trips (registry + config).
export const listTrips     = (env, a, who) => flatList(env, FLAT_SPECS.trips, a, who);
// createTrip enforces slug uniqueness (slug is the space key of a trip's child rows).
export async function createTrip(env, a, who) {
  const slug = cleanSlug(a.slug != null && a.slug !== "" ? a.slug : a.title);
  if (slug && await tripBySlug(env, slug)) throw new ServiceError(409, "a trip with slug '" + slug + "' already exists", "conflict");
  return flatCreate(env, FLAT_SPECS.trips, Object.assign({}, a, { slug }), who);
}
// slug is immutable after create (renaming would orphan child rows scoped by the old slug).
export const patchTrip     = (env, a, who) => { const { slug, ...rest } = a; return flatPatch(env, FLAT_SPECS.trips, rest, who); };
export const deleteTrip    = (env, a, who) => flatDelete(env, FLAT_SPECS.trips, a, who);
export const restoreTrip   = (env, a, who) => flatRestore(env, FLAT_SPECS.trips, a, who);
export const purgeTrip     = (env, a, who) => flatPurge(env, FLAT_SPECS.trips, a, who);
export const seedTrips     = (env, a, who) => flatSeed(env, FLAT_SPECS.trips, a, who);

// steps (the timeline).
export const listSteps     = (env, a, who) => flatList(env, FLAT_SPECS.steps, a, who);
// createStep places the new step on the timeline (effort 0017): an explicit numeric sort_order wins;
// with a region_id it goes right after that region's last live step (or takes an empty region's slot);
// otherwise it's appended after every step AND every planned (empty) region.
export async function createStep(env, a, who) {
  if (Number.isFinite(a.sort_order)) return flatCreate(env, FLAT_SPECS.steps, a, who);
  const rid = regionIdOf(a.region_id);
  if (rid) {
    await assertLiveRegion(env, a.space, rid);
    const sort = await regionInsertSlot(env, a.space, a.list || LIST_FLOW, rid, who);
    return flatCreate(env, FLAT_SPECS.steps, Object.assign({}, a, { region_id: rid, sort_order: sort }), who);
  }
  const sort = await nextTimelineSlot(env, a.space, a.list || LIST_FLOW);
  return flatCreate(env, FLAT_SPECS.steps, Object.assign({}, a, { sort_order: sort }), who);
}
// patchStep: a non-empty region_id must name a live region ("" / null clears the assignment).
export async function patchStep(env, a, who) {
  if (Object.prototype.hasOwnProperty.call(a, "region_id")) {
    const rid = regionIdOf(a.region_id);
    if (rid) await assertLiveRegion(env, a.space, rid);
    a = Object.assign({}, a, { region_id: rid });
  }
  return flatPatch(env, FLAT_SPECS.steps, a, who);
}
export const deleteStep    = (env, a, who) => flatDelete(env, FLAT_SPECS.steps, a, who);
export const restoreStep   = (env, a, who) => flatRestore(env, FLAT_SPECS.steps, a, who);
export const purgeStep     = (env, a, who) => flatPurge(env, FLAT_SPECS.steps, a, who);
export const seedSteps     = (env, a, who) => flatSeed(env, FLAT_SPECS.steps, a, who);

// activities (things to do, hung off a step).
export const listActivities    = (env, a, who) => flatList(env, FLAT_SPECS.activities, a, who);
export const createActivity    = (env, a, who) => flatCreate(env, FLAT_SPECS.activities, a, who);
export const patchActivity     = (env, a, who) => flatPatch(env, FLAT_SPECS.activities, a, who);
export const deleteActivity    = (env, a, who) => flatDelete(env, FLAT_SPECS.activities, a, who);
export const restoreActivity   = (env, a, who) => flatRestore(env, FLAT_SPECS.activities, a, who);
export const purgeActivity     = (env, a, who) => flatPurge(env, FLAT_SPECS.activities, a, who);
export const seedActivities    = (env, a, who) => flatSeed(env, FLAT_SPECS.activities, a, who);

// packing (the packing list; replaces the old to-do checklist).
export const listPacking    = (env, a, who) => flatList(env, FLAT_SPECS.packing, a, who);
export const createPacking  = (env, a, who) => flatCreate(env, FLAT_SPECS.packing, a, who);
export const patchPacking   = (env, a, who) => flatPatch(env, FLAT_SPECS.packing, a, who);
export const deletePacking  = (env, a, who) => flatDelete(env, FLAT_SPECS.packing, a, who);
export const restorePacking = (env, a, who) => flatRestore(env, FLAT_SPECS.packing, a, who);
export const purgePacking   = (env, a, who) => flatPurge(env, FLAT_SPECS.packing, a, who);
export const seedPacking    = (env, a, who) => flatSeed(env, FLAT_SPECS.packing, a, who);
// PURE ownership filter for packing rows. actor is the current user's email.
//   scope 'mine'    -> rows this actor owns          scope 'partner' -> rows owned by some OTHER person (email, not shared)
//   scope 'shared'  -> rows owned by 'shared'         else (all/undefined) -> every row
// todos (a free-form trip to-do list, effort 0020).
export const listTodos    = (env, a, who) => flatList(env, FLAT_SPECS.todos, a, who);
export const createTodo   = (env, a, who) => flatCreate(env, FLAT_SPECS.todos, a, who);
export const patchTodo    = (env, a, who) => flatPatch(env, FLAT_SPECS.todos, a, who);
export const deleteTodo   = (env, a, who) => flatDelete(env, FLAT_SPECS.todos, a, who);
export const restoreTodo  = (env, a, who) => flatRestore(env, FLAT_SPECS.todos, a, who);
export const purgeTodo    = (env, a, who) => flatPurge(env, FLAT_SPECS.todos, a, who);
// attachments (photo metadata; bytes are handled only by /api/image/**, never here).
export const listAttachments    = (env, a, who) => flatList(env, FLAT_SPECS.attachments, a, who);
export const createAttachment   = (env, a, who) => flatCreate(env, FLAT_SPECS.attachments, a, who);
export const patchAttachment    = (env, a, who) => flatPatch(env, FLAT_SPECS.attachments, a, who);
export const deleteAttachment   = (env, a, who) => flatDelete(env, FLAT_SPECS.attachments, a, who);
export const restoreAttachment  = (env, a, who) => flatRestore(env, FLAT_SPECS.attachments, a, who);
export const purgeAttachment    = (env, a, who) => flatPurge(env, FLAT_SPECS.attachments, a, who);
export const seedAttachments    = (env, a, who) => flatSeed(env, FLAT_SPECS.attachments, a, who);

// Cascade hard-delete (M10): permanently remove a step AND everything hanging off it — its
// activities (by step_id) and every photo attachment on the step or on any of those activities.
// All DB deletes + purge-audit snapshots run in ONE env.DB.batch (atomic); KV image bytes are
// deleted only AFTER the batch commits (KV has no transaction with D1). Reads live children only
// (mirrors the trash UI). Works on a live OR trashed step. Returns counts for the caller.
export async function purgeStepDeep(env, { space, list, id }, actor) {
  const now = new Date().toISOString();
  const stepSpec = FLAT_SPECS.steps, actSpec = FLAT_SPECS.activities, attSpec = FLAT_SPECS.attachments;
  const step = await env.DB.prepare(
    "SELECT * FROM " + stepSpec.table + " WHERE space=? AND list=? AND " + stepSpec.idCol + "=?"
  ).bind(space, list, id).first();
  if (!step) throw new ServiceError(404, "not found");
  const { rows: acts } = await listActivities(env, { space, list: "activities" }, actor);
  const childActs = acts.filter(a => a.step_id === id);
  const childActIds = new Set(childActs.map(a => a.id));
  const { rows: atts } = await listAttachments(env, { space, list: "attachments" }, actor);
  const childAtts = atts.filter(x =>
    (x.parent_type === "step" && x.parent_id === id) ||
    (x.parent_type === "activity" && childActIds.has(x.parent_id))
  );
  const del = (spec, l, rowId) => env.DB.prepare(
    "DELETE FROM " + spec.table + " WHERE space=? AND list=? AND " + spec.idCol + "=?"
  ).bind(space, l, rowId);
  const stmts = [
    del(stepSpec, list, id),
    auditStmt(env, stepSpec, space, list, id, "purge", mapRow(stepSpec, step), actor, now)
  ];
  childActs.forEach(a => {
    stmts.push(del(actSpec, "activities", a.id));
    stmts.push(auditStmt(env, actSpec, space, "activities", a.id, "purge", a, actor, now));
  });
  childAtts.forEach(x => {
    stmts.push(del(attSpec, "attachments", x.id));
    stmts.push(auditStmt(env, attSpec, space, "attachments", x.id, "purge", x, actor, now));
  });
  await env.DB.batch(stmts);
  if (env.IMAGES_KV) {
    for (const x of childAtts) { if (x.kv_key) { try { await env.IMAGES_KV.delete(x.kv_key); } catch {} } }
  }
  return { ok: true, purged: id, activities: childActs.length, attachments: childAtts.length };
}

// -- regions (effort 0017): Trip › Region › Location › Step -------------------
// ORDERING RULE (one rule, so the views can never disagree): step sort_order is the ONLY record of
// chronology. A region's position is derived from its member steps; a region's own sort_order (same
// number scale as steps) only places it while it has no live steps. Steps without a region (e.g. a
// transfer between regions) keep their place. A region whose steps aren't contiguous shows as several
// blocks flagged `split` (allowed + surfaced). moveRegion is the only way to reorder a region.
const LIST_FLOW = "flow", LIST_REGIONS = "regions";
function regionIdOf(v) { const s = String(v == null ? "" : v).trim(); return s || null; }
const sortNum = (x) => Number(x.sort_order) || 0;
const byIdAsc = (a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);          // matches SQLite's binary ORDER BY
async function assertLiveRegion(env, space, id) {
  const r = await env.DB.prepare("SELECT region_id FROM regions WHERE space=? AND list=? AND region_id=? AND deleted IS NULL").bind(space, LIST_REGIONS, id).first();
  if (!r) throw new ServiceError(404, "region not found: " + id);
}
// PURE. The combined timeline sequence: live steps in (sort_order, id) order, with EMPTY live regions
// merged in at their own sort_order (a region wins a tie, so "+ add stay" in an empty region lands first).
// Each step item carries its EFFECTIVE region (null when unset or pointing at a deleted/missing region).
export function timelineItems(regions, steps) {
  const live = (regions || []).filter(r => !r.deleted), byId = new Map(live.map(r => [r.id, r]));
  const ss = (steps || []).filter(s => !s.deleted).slice().sort((a, b) => sortNum(a) - sortNum(b) || byIdAsc(a, b));
  const eff = (s) => (s.region_id && byId.has(s.region_id)) ? s.region_id : null;
  const used = new Set(ss.map(eff).filter(Boolean));
  const empties = live.filter(r => !used.has(r.id)).sort((a, b) => sortNum(a) - sortNum(b) || byIdAsc(a, b));
  const out = []; let j = 0;
  ss.forEach(s => {
    while (j < empties.length && sortNum(empties[j]) <= sortNum(s)) { const r = empties[j++]; out.push({ type: "region", id: r.id, sort_order: sortNum(r), row: r }); }
    out.push({ type: "step", id: s.id, sort_order: sortNum(s), region_id: eff(s), row: s });
  });
  while (j < empties.length) { const r = empties[j++]; out.push({ type: "region", id: r.id, sort_order: sortNum(r), row: r }); }
  return out;
}
// Append slot: after every step AND every region (deleted rows included, like flatCreate's MAX).
export async function nextTimelineSlot(env, space, list) {
  const a = await env.DB.prepare("SELECT COALESCE(MAX(sort_order),0) AS m FROM steps WHERE space=? AND list=?").bind(space, list || LIST_FLOW).first();
  const b = await env.DB.prepare("SELECT COALESCE(MAX(sort_order),0) AS m FROM regions WHERE space=? AND list=?").bind(space, LIST_REGIONS).first();
  return Math.max((a && a.m) || 0, (b && b.m) || 0) + 10;
}
async function loadTimeline(env, space, list, actor) {
  const { rows: regions } = await listRegions(env, { space }, actor);
  const { rows: steps } = await listSteps(env, { space, list: list || LIST_FLOW }, actor);
  return { regions, steps, items: timelineItems(regions, steps) };
}
// Renumber a timeline sequence to (i+1)*10. `ordered` may contain one {type:"new"} placeholder (a step
// about to be created) whose slot is returned. Non-empty regions get their first member's number so
// their own sort_order stays sensible if they're emptied later. Only CHANGED rows are written (+audit).
function renumberStmts(env, space, list, ordered, regions, actor, now) {
  const stmts = [], firstOf = {}; let slot = null;
  const updStep = env.DB.prepare("UPDATE steps SET sort_order=?, updated_by=?, updated_at=? WHERE space=? AND list=? AND step_id=?");
  const updReg = env.DB.prepare("UPDATE regions SET sort_order=?, updated_by=?, updated_at=? WHERE space=? AND list=? AND region_id=?");
  const regionTo = {};
  ordered.forEach((it, i) => {
    const n = (i + 1) * 10;
    if (it.type === "new") { slot = n; return; }
    if (it.type === "step") {
      if (it.region_id && firstOf[it.region_id] == null) firstOf[it.region_id] = n;
      if (it.sort_order !== n) {
        stmts.push(updStep.bind(n, actor, now, space, list, it.id));
        stmts.push(auditStmt(env, FLAT_SPECS.steps, space, list, it.id, "update", { sort_order: n }, actor, now));
      }
    } else regionTo[it.id] = n;
  });
  Object.keys(firstOf).forEach(rid => { regionTo[rid] = firstOf[rid]; });
  (regions || []).filter(r => !r.deleted).forEach(r => {
    const n = regionTo[r.id];
    if (n != null && sortNum(r) !== n) {
      stmts.push(updReg.bind(n, actor, now, space, LIST_REGIONS, r.id));
      stmts.push(auditStmt(env, FLAT_SPECS.regions, space, LIST_REGIONS, r.id, "update", { sort_order: n }, actor, now));
    }
  });
  return { stmts, slot };
}
// Where a new step for region `rid` goes: right after the region's last live step (midpoint to the next
// timeline item; renumber everything when there's no gap), or an empty region's own slot.
async function regionInsertSlot(env, space, list, rid, actor) {
  const { regions, items } = await loadTimeline(env, space, list, actor);
  let last = -1;
  items.forEach((it, i) => { if (it.type === "step" && it.region_id === rid) last = i; });
  if (last < 0) {                                  // empty region -> take its slot
    const r = items.find(it => it.type === "region" && it.id === rid);
    return r ? r.sort_order : nextTimelineSlot(env, space, list);
  }
  const prev = items[last].sort_order, next = items[last + 1];
  if (!next) return prev + 10;
  if (next.sort_order - prev >= 2) return Math.floor((prev + next.sort_order) / 2);
  const ordered = items.slice(0, last + 1).concat([{ type: "new" }], items.slice(last + 1));
  const now = new Date().toISOString();
  const { stmts, slot } = renumberStmts(env, space, list, ordered, regions, actor, now);
  if (stmts.length) await env.DB.batch(stmts);
  return slot;
}

export const listRegions    = (env, a, who) => flatList(env, FLAT_SPECS.regions, Object.assign({}, a, { list: LIST_REGIONS }), who);
// createRegion: appended at the end of the timeline; optional before_region_id / after_region_id moves it.
export async function createRegion(env, a, who) {
  const space = a.space, sort = await nextTimelineSlot(env, space);
  const res = await flatCreate(env, FLAT_SPECS.regions, Object.assign({}, a, { list: LIST_REGIONS, sort_order: sort }), who);
  if (regionIdOf(a.before_region_id) || regionIdOf(a.after_region_id)) {
    const mv = await moveRegion(env, { space, id: res.row.id, before_region_id: a.before_region_id, after_region_id: a.after_region_id }, who);
    res.order = mv.order;
  }
  return res;
}
// sort_order is NOT patchable on a region (moveRegion owns ordering).
export const patchRegion    = (env, a, who) => { const { sort_order, ...rest } = a; return flatPatch(env, FLAT_SPECS.regions, Object.assign(rest, { list: LIST_REGIONS }), who); };
// Soft delete does NOT cascade: member steps keep their region_id and fall back to top level (the region
// is no longer live); restoring the region regroups them.
export const deleteRegion   = (env, a, who) => flatDelete(env, FLAT_SPECS.regions, Object.assign({}, a, { list: LIST_REGIONS }), who);
export const restoreRegion  = (env, a, who) => flatRestore(env, FLAT_SPECS.regions, Object.assign({}, a, { list: LIST_REGIONS }), who);
// Purge (live or trashed): delete the region row AND clear region_id on every step that pointed at it
// (live or trashed) in ONE batch, with audits. Never deletes steps.
export async function purgeRegionDeep(env, { space, id }, actor) {
  const now = new Date().toISOString(), spec = FLAT_SPECS.regions, stepSpec = FLAT_SPECS.steps;
  const row = await env.DB.prepare("SELECT * FROM regions WHERE space=? AND list=? AND region_id=?").bind(space, LIST_REGIONS, id).first();
  if (!row) throw new ServiceError(404, "not found");
  const { results } = await env.DB.prepare("SELECT step_id, list FROM steps WHERE space=? AND region_id=?").bind(space, id).all();
  const members = results || [];
  const clr = env.DB.prepare("UPDATE steps SET region_id=NULL, updated_by=?, updated_at=? WHERE space=? AND list=? AND step_id=?");
  const stmts = [
    env.DB.prepare("DELETE FROM regions WHERE space=? AND list=? AND region_id=?").bind(space, LIST_REGIONS, id),
    auditStmt(env, spec, space, LIST_REGIONS, id, "purge", mapRow(spec, row), actor, now)
  ];
  members.forEach(m => {
    stmts.push(clr.bind(actor, now, space, m.list, m.step_id));
    stmts.push(auditStmt(env, stepSpec, space, m.list, m.step_id, "update", { region_id: null }, actor, now));
  });
  await env.DB.batch(stmts);
  return { ok: true, purged: id, steps_cleared: members.length };
}
// Move a region (all its steps, as ONE block) before/after another region; neither = to the end. Steps
// without a region keep their place; a split region is merged back into one block. Renumbers the whole
// timeline in one batch (only changed rows are written + audited).
export async function moveRegion(env, { space, list, id, before_region_id, after_region_id }, actor) {
  list = list || LIST_FLOW;
  const before = regionIdOf(before_region_id), after = regionIdOf(after_region_id);
  if (before && after) throw new ServiceError(400, "give before_region_id OR after_region_id, not both");
  if (before === id || after === id) throw new ServiceError(400, "a region can't move relative to itself");
  const { regions, items } = await loadTimeline(env, space, list, actor);
  if (!regions.some(r => r.id === id)) throw new ServiceError(404, "region not found: " + id);
  const ref = before || after;
  if (ref && !regions.some(r => r.id === ref)) throw new ServiceError(404, "region not found: " + ref);
  const owns = (it, rid) => (it.type === "step" && it.region_id === rid) || (it.type === "region" && it.id === rid);
  const block = items.filter(it => owns(it, id)), rest = items.filter(it => !owns(it, id));
  let at = rest.length;
  if (before) at = rest.findIndex(it => owns(it, before));
  else if (after) { let k = -1; rest.forEach((it, i) => { if (owns(it, after)) k = i; }); at = k + 1; }
  if (at < 0) at = rest.length;
  const ordered = rest.slice(0, at).concat(block, rest.slice(at));
  const now = new Date().toISOString();
  const { stmts } = renumberStmts(env, space, list, ordered, regions, actor, now);
  if (stmts.length) await env.DB.batch(stmts);
  const order = [];
  ordered.forEach(it => { const rid = it.type === "region" ? it.id : it.region_id; if (rid && order.indexOf(rid) < 0) order.push(rid); });
  return { ok: true, id, order };
}
// Assign steps to a region (region_id null/"" = un-assign). Membership only — does NOT reorder; reports
// any region that ends up split (non-contiguous) so the caller can follow up with moveRegion / edits.
export async function assignSteps(env, { space, list, region_id, step_ids }, actor) {
  list = list || LIST_FLOW;
  const rid = regionIdOf(region_id), ids = jsonArray(step_ids);
  if (!ids.length) throw new ServiceError(400, "step_ids required");
  if (rid) await assertLiveRegion(env, space, rid);
  const { regions, steps } = await loadTimeline(env, space, list, actor);
  const live = new Map(steps.map(s => [s.id, s]));
  const found = ids.filter(x => live.has(x)), missing = ids.filter(x => !live.has(x));
  const now = new Date().toISOString(), spec = FLAT_SPECS.steps, stmts = [];
  const upd = env.DB.prepare("UPDATE steps SET region_id=?, updated_by=?, updated_at=? WHERE space=? AND list=? AND step_id=?");
  found.forEach(sid => {
    stmts.push(upd.bind(rid, actor, now, space, list, sid));
    stmts.push(auditStmt(env, spec, space, list, sid, "update", { region_id: rid }, actor, now));
  });
  if (stmts.length) await env.DB.batch(stmts);
  const after = steps.map(s => found.indexOf(s.id) >= 0 ? Object.assign({}, s, { region_id: rid }) : s);
  const tree = buildTripTree(null, regions, after, [], null);
  const split_regions = Object.keys(tree.regions).filter(k => tree.regions[k].split);
  return { ok: true, assigned: found.length, missing, split_regions };
}

export function filterPacking(rows, actor, scope) {
  const list = Array.isArray(rows) ? rows : [];
  const a = String(actor == null ? "" : actor).toLowerCase();
  if (scope === "mine") return list.filter(r => r.owner === a);
  if (scope === "partner") return list.filter(r => String(r.owner || "").includes("@") && r.owner !== a);
  if (scope === "shared") return list.filter(r => r.owner === "shared");
  return list;
}

// Resolve a trip by slug -> its config row (registry lives at space='app', list='trips').
export async function tripBySlug(env, slug) {
  const { rows } = await flatList(env, FLAT_SPECS.trips, { space: "app", list: "trips" }, null);
  return rows.find(r => r.slug === slug) || null;
}
// Friendly step composites: compute title/location, derive depart from nights, then create.
export function addStay(env, a, who) {
  const place = a.place || a.location || a.title || "Stay";
  let depart = a.depart || null;
  if (!depart && a.arrive && Number.isFinite(Number(a.nights))) {
    const d = new Date(a.arrive + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() + Math.trunc(Number(a.nights)));
    if (!isNaN(d.getTime())) depart = d.toISOString().slice(0, 10);   // bad arrive -> leave depart null, don't throw
  }
  return createStep(env, Object.assign({}, a, { kind: "stay", title: a.title || place, location: place, depart }), who);
}
export function addTravel(env, a, who) {
  const from = a.from || "", to = a.to || "";
  const route = (from && to) ? (from + " → " + to) : (a.location || a.title || "Travel");
  return createStep(env, Object.assign({}, a, {
    kind: "travel", title: a.title || route, location: a.location || route, transport: a.transport || a.mode || null
  }), who);
}

// -- pure composites (only DB reads; no writes) -----------------------------
// Convert a stored amount to EUR. null/'' -> null; already-EUR passes through; else divide by rate.
export function toEur(amt, ccy, rate) {
  if (amt == null || amt === "") return null;
  return ccy === "EUR" ? Number(amt) : Number(amt) / Number(rate);
}
// "Open in maps" link: the stored map_url (a real Google Maps place link) wins; if absent we derive a
// coordinate search link from lat/lng as a best-estimate fallback. map_url is cleanMapUrl'd (http(s)).
// Mirrors public/app.js.
function rowMapsUrl(row) {
  if (row.map_url) return row.map_url;
  if (row.lat != null && row.lat !== "" && row.lng != null && row.lng !== "")
    return "https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent(row.lat + "," + row.lng);
  return null;
}
// -- the trip tree (effort 0017): Trip › Region › Location › Step ------------
// A location is DERIVED: a stay's town (location || title). normPlace is its grouping key — lower-case,
// accents stripped, parentheses dropped ("Ko Lanta (via Krabi)" -> "ko lanta"); a name with no Latin
// letters (e.g. Thai script) falls back to its trimmed lower-case form so it still groups.
export function normPlace(s) {
  const raw = String(s == null ? "" : s);
  const k = raw.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\([^)]*\)/g, " ").replace(/[^a-z0-9]+/g, " ").trim();
  return k || raw.trim().toLowerCase();
}
// Nights of a stay: whole UTC days arrive -> depart (never negative; 0 when either date is missing).
export function stayNights(s) {
  const a = cleanDate(s && s.arrive), d = cleanDate(s && s.depart);
  if (!a || !d) return 0;
  return Math.max(0, Math.round((Date.parse(d + "T00:00:00Z") - Date.parse(a + "T00:00:00Z")) / 864e5));
}
const minD = (x, y) => (!x ? (y || null) : !y ? x : (y < x ? y : x));
const maxD = (x, y) => (!x ? (y || null) : !y ? x : (y > x ? y : x));
const isTravel = (s) => s && s.kind === "travel";
// Fold a region block's step nodes into locations: consecutive stays with the same place key become one
// location node; a travel leg sits between locations (and breaks the fold).
function foldLocations(rid, nodes, stepById) {
  const out = []; let loc = null, locKey = null;
  nodes.forEach(n => {
    if (n.type === "gap") { out.push(n); loc = null; return; }   // an unplanned gap breaks the fold
    const s = stepById.get(n.id);
    if (isTravel(s)) { out.push(n); loc = null; return; }
    const key = normPlace(s.location || s.title);
    if (loc && key && key === locKey) {
      loc.children.push(n); loc.stay_ids.push(n.id); loc.nights += stayNights(s);
      loc.arrive = minD(loc.arrive, s.arrive); loc.depart = maxD(loc.depart, s.depart);
      return;
    }
    loc = { type: "location", key: "loc:" + rid + ":" + n.id, place: String(s.location || s.title || "").trim(),
      stay_ids: [n.id], arrive: s.arrive || null, depart: s.depart || null, nights: stayNights(s), children: [n] };
    locKey = key; out.push(loc);
  });
  return out;
}
// PURE. Group the trip's timeline into the hierarchy. Nodes reference rows by id (no data duplicated);
// every step node carries its global `index` in the live, sorted step list (what the UI's inserters use),
// and an empty region carries `insert_index` (where a first step would go). `budget` (computeBudget's
// result, optional) supplies each region's EUR subtotal — money math never happens here.
//   items:   [ {type:"region", region_id, segment, split, children:[location|step|gap], insert_index?}
//            | {type:"step", id, index} | {type:"gap", from, to, nights} ]
//   regions: { <id>: { title, arrive, depart, nights, stays, steps, locations, planned_nights, start_date,
//                      end_date, nights_gap, dates_outside, empty, split, eur:{est,actual}|null } }
//   strip:   [ {region_id|null, title, segment?, nights, planned, gap?} ]   (trip-level proportional strip)
//   totals:  { nights, unplanned_nights, regions, locations, stays, travel, start, end }
// UNPLANNED GAPS (owner decision, 0017): when nothing is planned between the end of one plan and the start
// of the next, a {type:"gap"} node sits between them — inside a region when both sides are in it, else at
// top level. Coverage: a stay covers arrive -> depart, a travel leg depart -> arrive (so an overnight train
// or flight is NOT a gap), a dated empty region its planned start -> end. A stay with no check-out date
// makes coverage unknown (no gap is claimed across it).
export function buildTripTree(trip, regions, steps, activities, budget) {
  const live = (regions || []).filter(r => !r.deleted);
  const seq = timelineItems(live, steps);
  const stepById = new Map(seq.filter(x => x.type === "step").map(x => [x.id, x.row]));
  const items = [], segs = {}; let cur = null, idx = 0, covered = null, unplanned = 0;
  const gapBefore = (start) => {
    if (!covered || !start || start <= covered) return null;
    const n = stayNights({ arrive: covered, depart: start });
    if (n <= 0) return null;
    unplanned += n;
    return { type: "gap", from: covered, to: start, nights: n };
  };
  seq.forEach(it => {
    if (it.type === "region") {                    // an empty (planned) region
      const s0 = cleanDate(it.row.start_date), e0 = cleanDate(it.row.end_date);
      const g = gapBefore(s0); if (g) items.push(g);
      segs[it.id] = (segs[it.id] || 0) + 1;
      items.push({ type: "region", region_id: it.id, segment: 1, split: false, children: [], insert_index: idx });
      if (e0 || s0) covered = maxD(covered, e0 || s0);
      cur = null; return;
    }
    const s = it.row, trav = isTravel(s);
    const start = trav ? (cleanDate(s.depart) || cleanDate(s.arrive)) : cleanDate(s.arrive);
    const end = trav ? (cleanDate(s.arrive) || cleanDate(s.depart)) : cleanDate(s.depart);
    const g = gapBefore(start);
    const node = { type: "step", id: it.id, index: idx++ };
    if (!it.region_id) { if (g) items.push(g); items.push(node); cur = null; }
    else if (cur && cur.region_id === it.region_id) { if (g) cur.children.push(g); cur.children.push(node); }
    else {
      if (g) items.push(g);
      segs[it.region_id] = (segs[it.region_id] || 0) + 1;
      cur = { type: "region", region_id: it.region_id, segment: segs[it.region_id], split: false, children: [node] };
      items.push(cur);
    }
    if (!trav && start && !end) covered = null;      // open-ended stay: coverage unknown from here
    else if (start || end) covered = maxD(covered, end || start);
  });
  items.forEach(b => {
    if (b.type !== "region") return;
    b.split = segs[b.region_id] > 1;
    b.children = foldLocations(b.region_id, b.children, stepById);
  });

  const byRegion = budget && budget.byRegion ? budget.byRegion : null;
  const summary = {};
  live.forEach(r => {
    const planned = (r.planned_nights == null || r.planned_nights === "") ? null : Number(r.planned_nights);
    summary[r.id] = {
      title: r.title, arrive: null, depart: null, nights: 0, stays: 0, steps: 0, locations: 0,
      planned_nights: planned, start_date: r.start_date || null, end_date: r.end_date || null,
      nights_gap: null, dates_outside: false, empty: true, split: (segs[r.id] || 0) > 1,
      eur: byRegion ? (byRegion[r.id] || { est: 0, actual: 0 }) : null
    };
  });
  seq.forEach(it => {
    if (it.type !== "step" || !it.region_id) return;
    const s = it.row, g = summary[it.region_id];
    g.steps++; g.empty = false;
    if (!isTravel(s)) { g.stays++; g.nights += stayNights(s); g.arrive = minD(g.arrive, s.arrive); g.depart = maxD(g.depart, s.depart || s.arrive); }
  });
  seq.forEach(it => {                              // a travel-only region: dates span its legs
    if (it.type !== "step" || !it.region_id) return;
    const s = it.row, g = summary[it.region_id];
    if (g.stays === 0) { g.arrive = minD(g.arrive, minD(s.depart, s.arrive)); g.depart = maxD(g.depart, maxD(s.arrive, s.depart)); }
  });
  items.forEach(b => { if (b.type === "region") summary[b.region_id].locations += b.children.filter(c => c.type === "location").length; });
  Object.keys(summary).forEach(k => {
    const g = summary[k];
    if (g.planned_nights != null && g.stays > 0) g.nights_gap = g.planned_nights - g.nights;
    if (g.stays > 0) g.dates_outside = !!((g.start_date && g.arrive && g.arrive < g.start_date) || (g.end_date && g.depart && g.depart > g.end_date));
  });

  const strip = []; let loose = null;
  const gapSeg = (gp) => ({ region_id: null, title: "Unplanned", nights: gp.nights, planned: false, gap: true });
  items.forEach(b => {
    if (b.type === "gap") { loose = null; strip.push(gapSeg(b)); return; }
    if (b.type === "region") {
      loose = null;
      const g = summary[b.region_id];
      const n = b.children.reduce((t, c) => t + (c.type === "location" ? c.nights : 0), 0);
      strip.push({ region_id: b.region_id, title: g.title, segment: b.segment, nights: g.stays > 0 ? n : (g.planned_nights || 0), planned: g.stays === 0 });
      b.children.forEach(c => { if (c.type === "gap") strip.push(gapSeg(c)); });   // a gap inside the region follows it
      return;
    }
    const s = stepById.get(b.id);
    if (isTravel(s)) return;
    if (!loose) { loose = { region_id: null, title: "Unassigned", nights: 0, planned: false }; strip.push(loose); }
    loose.nights += stayNights(s);
  });

  const all = Array.from(stepById.values());
  const totals = { nights: 0, unplanned_nights: unplanned, regions: live.length, locations: 0, stays: 0, travel: 0, start: null, end: null };
  all.forEach(s => {
    if (isTravel(s)) totals.travel++; else { totals.stays++; totals.nights += stayNights(s); }
    totals.start = minD(totals.start, minD(s.arrive, s.depart));
    totals.end = maxD(totals.end, maxD(s.arrive, s.depart));
  });
  Object.keys(summary).forEach(k => { totals.locations += summary[k].locations; });
  if (!totals.start && trip) totals.start = trip.start_date || null;
  if (!totals.end && trip) totals.end = trip.end_date || null;
  return { items, regions: summary, strip, totals };
}
// PURE. The read-only trip snapshot from already-loaded rows (the DB wrapper below and the demo mock
// both call this, so previews run the production logic). Each step/activity gains `maps_url` and `eur`
// (actual||est in EUR; 0 when included). Activities whose step_id matches no live step -> `unassigned`.
// `tree` is the region/location hierarchy; its EUR subtotals come from computeBudget (null without a rate).
export function composeOverview(trip, regions, steps, acts) {
  const rate = trip ? trip.thb_per_eur : null;
  const liveRegions = (regions || []).filter(r => !r.deleted);
  const liveSteps = (steps || []).filter(s => !s.deleted).slice().sort((a, b) => sortNum(a) - sortNum(b) || byIdAsc(a, b));
  const liveActs = (acts || []).filter(a => !a.deleted);
  const decorate = (r) => {
    const amt = (r.cost_actual != null && r.cost_actual !== "") ? r.cost_actual : r.cost_est;
    const eur = (r.included === "1" || r.included === 1) ? 0 : toEur(amt, r.cost_ccy, rate);   // included -> not counted
    return Object.assign({}, r, { maps_url: rowMapsUrl(r), eur });
  };
  const liveIds = new Set(liveSteps.map(s => s.id));
  const activitiesByStep = {}, unassigned = [];
  liveActs.forEach(a => {
    const d = decorate(a);
    if (liveIds.has(a.step_id)) { (activitiesByStep[a.step_id] = activitiesByStep[a.step_id] || []).push(d); }
    else unassigned.push(d);
  });
  let budget = null;
  try { budget = computeBudget(rate, trip ? trip.budget_target_eur : null, liveSteps, liveActs, liveRegions); }
  catch (e) { if (!(e instanceof ServiceError)) throw e; }          // no FX rate -> tree without EUR subtotals
  const tree = buildTripTree(trip, liveRegions, liveSteps, liveActs, budget);
  return { trip, regions: liveRegions, steps: liveSteps.map(decorate), activitiesByStep, unassigned, tree };
}
// DB-backed trip snapshot: { trip, regions, steps, activitiesByStep, unassigned, tree }.
export async function tripOverview(env, { space }, actor) {
  const trip = await tripBySlug(env, space);
  const { rows: regions } = await listRegions(env, { space }, actor);
  const { rows: steps } = await listSteps(env, { space, list: LIST_FLOW }, actor);
  const { rows: acts } = await listActivities(env, { space, list: "activities" }, actor);
  return composeOverview(trip, regions, steps, acts);
}
// Coordinate/booking routers: `target` picks the step vs activity spec. Thin over flatPatch so the
// UI and MCP share one code path. setCoordinate always sets both lat+lng.
export function setCoordinate(env, { target, space, list, id, lat, lng }, actor) {
  const spec = target === "step" ? FLAT_SPECS.steps : FLAT_SPECS.activities;
  return flatPatch(env, spec, { space, list, id, lat, lng }, actor);
}
export function setBooking(env, { target, space, list, id, booking_status, booking_url }, actor) {
  const spec = target === "step" ? FLAT_SPECS.steps : FLAT_SPECS.activities;
  const p = { space, list, id };
  if (booking_status !== undefined) p.booking_status = booking_status;
  if (booking_url !== undefined) p.booking_url = booking_url;
  return flatPatch(env, spec, p, actor);
}
// Mark a step/activity's cost as "included in another cost" (hidden on the card + dropped from budget).
export function setIncluded(env, { target, space, list, id, included }, actor) {
  const spec = target === "step" ? FLAT_SPECS.steps : FLAT_SPECS.activities;
  return flatPatch(env, spec, { space, list, id, included }, actor);
}
// Set the PRIMARY location link (a real Google Maps URL). cleanMapUrl rejects non-http(s).
export function setMapUrl(env, { target, space, list, id, map_url }, actor) {
  const spec = target === "step" ? FLAT_SPECS.steps : FLAT_SPECS.activities;
  return flatPatch(env, spec, { space, list, id, map_url }, actor);
}
// Pin (or unpin) one attachment as its parent's card background. "One pinned per parent" can't be a DB
// constraint here, so it's enforced in code: pinning also un-pins any sibling on the SAME parent, all in
// one atomic env.DB.batch (UPDATE + audit per row) — modeled on purgeStepDeep. Deleting/purging a pinned
// photo needs no cleanup (the flag lives on the row). `space` = trip slug; attachments are list='attachments'.
export async function setPinned(env, { space, id, pinned }, actor) {
  const want = cleanBool(pinned);                       // '1' | '0'
  const spec = FLAT_SPECS.attachments, now = new Date().toISOString();
  const { rows } = await listAttachments(env, { space, list: "attachments" }, actor);   // live rows only
  const target = rows.find(r => String(r.id) === String(id));
  if (!target) throw new ServiceError(404, "attachment not found");
  const setPin = (rowId, val) => {
    const upd = env.DB.prepare("UPDATE " + spec.table + " SET pinned=?, updated_by=?, updated_at=? WHERE space=? AND list=? AND " + spec.idCol + "=?");
    return [upd.bind(val, actor, now, space, "attachments", rowId), auditStmt(env, spec, space, "attachments", rowId, "update", { pinned: val }, actor, now)];
  };
  const stmts = setPin(id, want);
  if (want === "1") {   // exclusive pin: clear any currently-pinned sibling on the same parent
    rows.forEach(r => {
      if (String(r.id) !== String(id) && r.pinned === "1" && r.parent_type === target.parent_type && r.parent_id === target.parent_id) {
        stmts.push.apply(stmts, setPin(r.id, "0"));
      }
    });
  }
  await env.DB.batch(stmts);
  return { ok: true, id, pinned: want };
}

// -- budget (M7): the single source of truth for all money math -------------
// PURE. Given the trip's FX rate + target and the step/activity rows, compute every euro figure the
// UI shows. The UI must NEVER recompute money — it renders these numbers verbatim. All amounts are
// stored full-precision (cost_est/cost_actual as TEXT in cost_ccy); we convert to EUR via toEur and
// round ONLY at the very end so intermediate sums don't accumulate rounding error.
// Default party size for the per-person figures. TEMPORARY hard-code — a real per-trip `travellers`
// field is a future add; until then every total is split two ways.
const PEOPLE = 2;
// `regions` (optional, effort 0017) adds `byRegion: {<region id>|"none": {est, actual}}` — a step counts
// toward its live region, an activity toward its step's region; anything else is "none".
export function computeBudget(rate, target, steps, activities, regions) {
  const r = Number(rate);
  if (!isFinite(r) || r <= 0) throw new ServiceError(422, "no FX rate set", "no_rate");   // before any division
  const stepRows = Array.isArray(steps) ? steps : [];
  const actRows = Array.isArray(activities) ? activities : [];
  let totalEst = 0, totalActual = 0, estOfUnspent = 0;      // running EUR sums (non-null only)
  const catEst = { accommodation: 0, transport: 0, activities: 0 };   // estimated EUR by category
  const catAct = { accommodation: 0, transport: 0, activities: 0 };   // actual EUR by category
  const liveRegion = Array.isArray(regions) ? new Set(regions.filter(x => !x.deleted).map(x => x.id)) : null;
  const regionOfStep = {}; stepRows.forEach(s => { regionOfStep[s.id] = s.region_id || null; });
  const regKey = (rid) => (rid && (!liveRegion || liveRegion.has(rid))) ? rid : "none";
  const reg = {};                                            // EUR {est, actual} by region
  const acc = (row, isStep) => {
    if (row.included === "1" || row.included === 1) return;  // "included in another cost" -> excluded entirely
    const est = toEur(row.cost_est, row.cost_ccy, r);        // null when the source amount is null/''
    const act = toEur(row.cost_actual, row.cost_ccy, r);
    if (est != null) totalEst += est;
    if (act != null) totalActual += act;
    if (est != null && act == null) estOfUnspent += est;     // still-to-spend, valued at estimate
    const bucket = isStep ? (row.kind === "travel" ? "transport" : "accommodation") : "activities";
    if (est != null) catEst[bucket] += est;
    if (act != null) catAct[bucket] += act;
    if (est != null || act != null) {
      const k = regKey(isStep ? row.region_id : regionOfStep[row.step_id]);
      const g = reg[k] = reg[k] || { est: 0, actual: 0 };
      if (est != null) g.est += est;
      if (act != null) g.actual += act;
    }
  };
  stepRows.forEach(row => acc(row, true));
  actRows.forEach(row => acc(row, false));
  const t = (target == null || target === "") ? null : Number(target);
  const projectedSpend = totalActual + estOfUnspent;         // spent so far + estimate of what's left
  const remaining = t == null ? null : t - totalActual;      // target minus what's actually spent
  const projected = t == null ? null : t - totalActual - estOfUnspent;   // target minus projected spend
  const pct = t ? Math.round(projectedSpend / t * 100) : null;
  const over = t != null && projectedSpend > t;
  const r2 = (x) => (x == null ? null : Math.round(x * 100) / 100);   // round to 2dp at the end
  const cat = (o) => ({ accommodation: r2(o.accommodation), transport: r2(o.transport), activities: r2(o.activities) });
  return {
    rate: r, target: r2(t), home_ccy: null,
    totalEst: r2(totalEst), totalActual: r2(totalActual), estOfUnspent: r2(estOfUnspent),
    projectedSpend: r2(projectedSpend), remaining: r2(remaining), projected: r2(projected),
    pct, over,
    people: PEOPLE,
    perPersonEst: r2(totalEst / PEOPLE), perPersonActual: r2(totalActual / PEOPLE), perPersonProjected: r2(projectedSpend / PEOPLE),
    byCategory: cat(catEst), byCategoryActual: cat(catAct),
    byRegion: Object.fromEntries(Object.keys(reg).map(k => [k, { est: r2(reg[k].est), actual: r2(reg[k].actual) }]))
  };
}
// DB-backed budget for a trip: resolve the trip config, read its steps + activities, run the pure
// computeBudget, then stamp the trip's home_ccy onto the result.
export async function getBudget(env, { space }, actor) {
  const trip = await tripBySlug(env, space);
  if (!trip) throw new ServiceError(404, "trip not found: " + space);
  const { rows: steps } = await listSteps(env, { space, list: "flow" }, actor);
  const { rows: activities } = await listActivities(env, { space, list: "activities" }, actor);
  const { rows: regions } = await listRegions(env, { space }, actor);
  return Object.assign(
    computeBudget(trip.thb_per_eur, trip.budget_target_eur, steps, activities, regions),
    { home_ccy: trip.home_ccy }
  );
}
