// Framework-agnostic domain core. Imported BY BOTH the Pages API (functions/api/_lib.js
// re-exports it) and the MCP worker (worker-mcp/src/mcp.js). No Request/Response/env coupling:
// every function is (env, args, actor) -> plain data | throw ServiceError.
//
// REAL ENTITIES: trips, steps (flow), activities, packing, attachments — see FLAT_SPECS below.
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
  const max = await env.DB.prepare("SELECT COALESCE(MAX(sort_order),0) AS m FROM " + spec.table + " WHERE space=? AND list=?").bind(space, list).first();
  const sort = (max && max.m ? max.m : 0) + 10;
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
export const createStep    = (env, a, who) => flatCreate(env, FLAT_SPECS.steps, a, who);
export const patchStep     = (env, a, who) => flatPatch(env, FLAT_SPECS.steps, a, who);
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
// Read-only trip snapshot: the trip config, its steps (timeline order), activities grouped by
// step_id, and an "unassigned" bucket for activities whose step_id matches no live step. Each step
// and activity gains a `maps_url` (lat/lng -> OSM, else map_url) and an `eur` value (actual||est,
// converted via the trip's thb_per_eur rate).
export async function tripOverview(env, { space }, actor) {
  const trip = await tripBySlug(env, space);
  const rate = trip ? trip.thb_per_eur : null;
  const { rows: steps } = await listSteps(env, { space, list: "flow" }, actor);
  const { rows: acts } = await listActivities(env, { space, list: "activities" }, actor);
  const decorate = (r) => {
    const amt = (r.cost_actual != null && r.cost_actual !== "") ? r.cost_actual : r.cost_est;
    const eur = (r.included === "1" || r.included === 1) ? 0 : toEur(amt, r.cost_ccy, rate);   // included -> not counted
    return Object.assign({}, r, { maps_url: rowMapsUrl(r), eur });
  };
  const liveIds = new Set(steps.map(s => s.id));
  const activitiesByStep = {}, unassigned = [];
  acts.forEach(a => {
    const d = decorate(a);
    if (liveIds.has(a.step_id)) { (activitiesByStep[a.step_id] = activitiesByStep[a.step_id] || []).push(d); }
    else unassigned.push(d);
  });
  return { trip, steps: steps.map(decorate), activitiesByStep, unassigned };
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
export function computeBudget(rate, target, steps, activities) {
  const r = Number(rate);
  if (!isFinite(r) || r <= 0) throw new ServiceError(422, "no FX rate set", "no_rate");   // before any division
  const stepRows = Array.isArray(steps) ? steps : [];
  const actRows = Array.isArray(activities) ? activities : [];
  let totalEst = 0, totalActual = 0, estOfUnspent = 0;      // running EUR sums (non-null only)
  const catEst = { accommodation: 0, transport: 0, activities: 0 };   // estimated EUR by category
  const catAct = { accommodation: 0, transport: 0, activities: 0 };   // actual EUR by category
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
    byCategory: cat(catEst), byCategoryActual: cat(catAct)
  };
}
// DB-backed budget for a trip: resolve the trip config, read its steps + activities, run the pure
// computeBudget, then stamp the trip's home_ccy onto the result.
export async function getBudget(env, { space }, actor) {
  const trip = await tripBySlug(env, space);
  if (!trip) throw new ServiceError(404, "trip not found: " + space);
  const { rows: steps } = await listSteps(env, { space, list: "flow" }, actor);
  const { rows: activities } = await listActivities(env, { space, list: "activities" }, actor);
  return Object.assign(
    computeBudget(trip.thb_per_eur, trip.budget_target_eur, steps, activities),
    { home_ccy: trip.home_ccy }
  );
}
