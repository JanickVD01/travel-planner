// Thin adapter over shared/core.js — trip regions (effort 0017). Copied from steps/[[path]].js.
//   GET    /api/regions/<slug>/regions                     -> list regions (live)
//   GET    /api/regions/<slug>/regions/trash               -> list soft-deleted (trashed) regions
//   POST   /api/regions/<slug>/regions {title,…,before_region_id?,after_region_id?} -> add a region
//   POST   /api/regions/<slug>/regions/<id>/restore        -> restore a trashed region
//   POST   /api/regions/<slug>/regions/<id>/move {before_region_id|after_region_id} -> reorder (neither = to the end)
//   PATCH  /api/regions/<slug>/regions/<id> {...}           -> edit (title, planned_nights, start/end_date, note)
//   DELETE /api/regions/<slug>/regions/<id>                 -> soft-delete (its steps fall back to top level)
//   DELETE /api/regions/<slug>/regions/<id>/purge           -> delete forever + clear region_id on its steps
import { json, userEmail, parsePath, fail } from "../_lib.js";
import { listRegions, createRegion, patchRegion, deleteRegion, restoreRegion, purgeRegionDeep, moveRegion } from "../../../shared/core.js";

function ctx(request, env, params) { const p = parsePath(params); return { email: userEmail(request, env), space: p[0], list: p[1], seg: p[2], seg2: p[3] }; }
async function body(request) { try { return { body: await request.json() }; } catch { return { error: json({ error: "invalid JSON body" }, 400) }; } }

export async function onRequestGet({ request, env, params }) {
  const c = ctx(request, env, params);
  if (!c.email) return json({ error: "unauthenticated" }, 401);
  if (!env || !env.DB) return json({ error: "DB binding not configured" }, 500);
  if (!c.space || !c.list) return json({ error: "expected /api/regions/<slug>/regions" }, 400);
  try {
    if (c.seg === "trash") return json(await listRegions(env, { space: c.space, trash: true }, c.email));
    return json(await listRegions(env, { space: c.space }, c.email));
  } catch (e) { return fail(e); }
}
export async function onRequestPost({ request, env, params }) {
  const c = ctx(request, env, params);
  if (!c.email) return json({ error: "unauthenticated" }, 401);
  if (!env || !env.DB) return json({ error: "DB binding not configured" }, 500);
  try {
    if (c.seg2 === "restore") return json(await restoreRegion(env, { space: c.space, id: c.seg }, c.email));
    const r = await body(request); if (r.error) return r.error;
    if (c.seg2 === "move") return json(await moveRegion(env, { space: c.space, id: c.seg, before_region_id: r.body.before_region_id, after_region_id: r.body.after_region_id }, c.email));
    return json(await createRegion(env, Object.assign({}, r.body, { space: c.space }), c.email), 201);
  } catch (e) { return fail(e); }
}
export async function onRequestPatch({ request, env, params }) {
  const c = ctx(request, env, params);
  if (!c.email) return json({ error: "unauthenticated" }, 401);
  if (!env || !env.DB) return json({ error: "DB binding not configured" }, 500);
  if (!c.seg) return json({ error: "expected /api/regions/<slug>/regions/<id>" }, 400);
  const r = await body(request); if (r.error) return r.error;
  try { return json(await patchRegion(env, Object.assign({}, r.body, { space: c.space, id: c.seg }), c.email)); } catch (e) { return fail(e); }
}
export async function onRequestDelete({ request, env, params }) {
  const c = ctx(request, env, params);
  if (!c.email) return json({ error: "unauthenticated" }, 401);
  if (!env || !env.DB) return json({ error: "DB binding not configured" }, 500);
  if (!c.seg) return json({ error: "expected /api/regions/<slug>/regions/<id>" }, 400);
  try {
    if (c.seg2 === "purge") return json(await purgeRegionDeep(env, { space: c.space, id: c.seg }, c.email));
    return json(await deleteRegion(env, { space: c.space, id: c.seg }, c.email));
  } catch (e) { return fail(e); }
}
