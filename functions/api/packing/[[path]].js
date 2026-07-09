// Thin adapter over shared/core.js — the packing list (replaces the old to-do checklist).
// Copied from activities/[[path]].js.
//   GET    /api/packing/<slug>/packing                    -> list packing items
//   POST   /api/packing/<slug>/packing  {title,owner,…}   -> add an item
//   POST   /api/packing/<slug>/packing/seed {rows:[]}      -> one-time seed
//   PATCH  /api/packing/<slug>/packing/<id> {...}          -> edit
//   DELETE /api/packing/<slug>/packing/<id>                -> soft-delete
import { json, userEmail, parsePath, fail } from "../_lib.js";
import { listPacking, createPacking, patchPacking, deletePacking, seedPacking } from "../../../shared/core.js";

function ctx(request, env, params) { const p = parsePath(params); return { email: userEmail(request, env), space: p[0], list: p[1], seg: p[2] }; }
async function body(request) { try { return { body: await request.json() }; } catch { return { error: json({ error: "invalid JSON body" }, 400) }; } }

export async function onRequestGet({ request, env, params }) {
  const c = ctx(request, env, params);
  if (!c.email) return json({ error: "unauthenticated" }, 401);
  if (!env || !env.DB) return json({ error: "DB binding not configured" }, 500);
  if (!c.space || !c.list) return json({ error: "expected /api/packing/<slug>/packing" }, 400);
  try { return json(await listPacking(env, { space: c.space, list: c.list }, c.email)); } catch (e) { return fail(e); }
}
export async function onRequestPost({ request, env, params }) {
  const c = ctx(request, env, params);
  if (!c.email) return json({ error: "unauthenticated" }, 401);
  if (!env || !env.DB) return json({ error: "DB binding not configured" }, 500);
  const r = await body(request); if (r.error) return r.error;
  try {
    if (c.seg === "seed") return json(await seedPacking(env, { space: c.space, list: c.list, rows: r.body.rows }, c.email));
    return json(await createPacking(env, Object.assign({ space: c.space, list: c.list }, r.body), c.email), 201);
  } catch (e) { return fail(e); }
}
export async function onRequestPatch({ request, env, params }) {
  const c = ctx(request, env, params);
  if (!c.email) return json({ error: "unauthenticated" }, 401);
  if (!env || !env.DB) return json({ error: "DB binding not configured" }, 500);
  if (!c.seg) return json({ error: "expected /api/packing/<slug>/packing/<id>" }, 400);
  const r = await body(request); if (r.error) return r.error;
  try { return json(await patchPacking(env, Object.assign({ space: c.space, list: c.list, id: c.seg }, r.body), c.email)); } catch (e) { return fail(e); }
}
export async function onRequestDelete({ request, env, params }) {
  const c = ctx(request, env, params);
  if (!c.email) return json({ error: "unauthenticated" }, 401);
  if (!env || !env.DB) return json({ error: "DB binding not configured" }, 500);
  if (!c.seg) return json({ error: "expected /api/packing/<slug>/packing/<id>" }, 400);
  try { return json(await deletePacking(env, { space: c.space, list: c.list, id: c.seg }, c.email)); } catch (e) { return fail(e); }
}
