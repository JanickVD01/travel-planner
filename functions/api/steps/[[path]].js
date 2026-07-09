// Thin adapter over shared/core.js — the timeline steps. Copied from entries/[[path]].js.
//   GET    /api/steps/<slug>/flow                 -> list steps (timeline order)
//   GET    /api/steps/<slug>/flow/trash           -> list soft-deleted (trashed) steps
//   POST   /api/steps/<slug>/flow  {kind,title,…} -> add a step
//   POST   /api/steps/<slug>/flow/seed {rows:[]}   -> one-time seed
//   POST   /api/steps/<slug>/flow/<id>/restore     -> restore a trashed step
//   PATCH  /api/steps/<slug>/flow/<id> {...}        -> edit
//   DELETE /api/steps/<slug>/flow/<id>              -> soft-delete
//   DELETE /api/steps/<slug>/flow/<id>/purge        -> delete forever + cascade (activities + photos)
import { json, userEmail, parsePath, fail } from "../_lib.js";
import { listSteps, createStep, patchStep, deleteStep, restoreStep, purgeStepDeep, seedSteps } from "../../../shared/core.js";

function ctx(request, env, params) { const p = parsePath(params); return { email: userEmail(request, env), space: p[0], list: p[1], seg: p[2], seg2: p[3] }; }
async function body(request) { try { return { body: await request.json() }; } catch { return { error: json({ error: "invalid JSON body" }, 400) }; } }

export async function onRequestGet({ request, env, params }) {
  const c = ctx(request, env, params);
  if (!c.email) return json({ error: "unauthenticated" }, 401);
  if (!env || !env.DB) return json({ error: "DB binding not configured" }, 500);
  if (!c.space || !c.list) return json({ error: "expected /api/steps/<slug>/flow" }, 400);
  try {
    if (c.seg === "trash") return json(await listSteps(env, { space: c.space, list: c.list, trash: true }, c.email));
    return json(await listSteps(env, { space: c.space, list: c.list }, c.email));
  } catch (e) { return fail(e); }
}
export async function onRequestPost({ request, env, params }) {
  const c = ctx(request, env, params);
  if (!c.email) return json({ error: "unauthenticated" }, 401);
  if (!env || !env.DB) return json({ error: "DB binding not configured" }, 500);
  try {
    if (c.seg2 === "restore") return json(await restoreStep(env, { space: c.space, list: c.list, id: c.seg }, c.email));
    const r = await body(request); if (r.error) return r.error;
    if (c.seg === "seed") return json(await seedSteps(env, { space: c.space, list: c.list, rows: r.body.rows }, c.email));
    return json(await createStep(env, Object.assign({ space: c.space, list: c.list }, r.body), c.email), 201);
  } catch (e) { return fail(e); }
}
export async function onRequestPatch({ request, env, params }) {
  const c = ctx(request, env, params);
  if (!c.email) return json({ error: "unauthenticated" }, 401);
  if (!env || !env.DB) return json({ error: "DB binding not configured" }, 500);
  if (!c.seg) return json({ error: "expected /api/steps/<slug>/flow/<id>" }, 400);
  const r = await body(request); if (r.error) return r.error;
  try { return json(await patchStep(env, Object.assign({ space: c.space, list: c.list, id: c.seg }, r.body), c.email)); } catch (e) { return fail(e); }
}
export async function onRequestDelete({ request, env, params }) {
  const c = ctx(request, env, params);
  if (!c.email) return json({ error: "unauthenticated" }, 401);
  if (!env || !env.DB) return json({ error: "DB binding not configured" }, 500);
  if (!c.seg) return json({ error: "expected /api/steps/<slug>/flow/<id>" }, 400);
  try {
    if (c.seg2 === "purge") return json(await purgeStepDeep(env, { space: c.space, list: c.list, id: c.seg }, c.email));
    return json(await deleteStep(env, { space: c.space, list: c.list, id: c.seg }, c.email));
  } catch (e) { return fail(e); }
}
