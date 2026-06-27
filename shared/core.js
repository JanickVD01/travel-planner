// Framework-agnostic domain core. Imported BY BOTH the Pages API (functions/api/_lib.js
// re-exports it) and the MCP worker (worker-mcp/src/mcp.js). No Request/Response/env coupling:
// every function is (env, args, actor) -> plain data | throw ServiceError.
//
// PLACEHOLDER ENTITY: `entries` is a generic example list (cols: title, note, status, due).
// It exists so the whole pipeline (API, preview, MCP, smoke test) is verifiable end-to-end.
// To add a real list later: add a FLAT_SPECS entry + named wrappers below, a route file under
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
  }
  // Add another list by adding a SPEC here, e.g.:
  // lodging: { table: "lodging", audit: "lodging_audit", idCol: "lodging_id", prefix: "lo",
  //           cols: [{name:"title"},{name:"address"},{name:"check_in",clean:cleanDate,nullable:true},
  //                  {name:"check_out",clean:cleanDate,nullable:true},{name:"status",clean:cleanStatus}] }
};

function cleanCol(c, v) {
  if (c.clean) return c.clean(v);
  if (c.nullable) return (v == null || v === "") ? null : String(v);
  return String(v == null ? "" : v);
}
function mapRow(spec, r) { const o = { id: r[spec.idCol], sort_order: r.sort_order }; spec.cols.forEach(c => o[c.name] = r[c.name]); return o; }
function detail(spec, args) { const d = {}; spec.cols.forEach(c => { if (Object.prototype.hasOwnProperty.call(args, c.name)) d[c.name] = args[c.name]; }); return d; }
function auditStmt(env, spec, space, list, id, op, det, actor, at) {
  return env.DB.prepare("INSERT INTO " + spec.audit + " (space,list," + spec.idCol + ",op,detail,actor,at) VALUES (?1,?2,?3,?4,?5,?6,?7)")
    .bind(space, list, id, op, det == null ? null : JSON.stringify(det), actor, at);
}

async function flatList(env, spec, { space, list }, actor) {
  const { results } = await env.DB.prepare(
    "SELECT * FROM " + spec.table + " WHERE space=? AND list=? ORDER BY sort_order, " + spec.idCol
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
  const exists = await env.DB.prepare("SELECT " + spec.idCol + " FROM " + spec.table + " WHERE space=? AND list=? AND " + spec.idCol + "=?").bind(space, list, id).first();
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
  await env.DB.batch([
    env.DB.prepare("DELETE FROM " + spec.table + " WHERE space=? AND list=? AND " + spec.idCol + "=?").bind(space, list, id),
    auditStmt(env, spec, space, list, id, "delete", null, actor, now)
  ]);
  return { ok: true, deleted: id };
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
