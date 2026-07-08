// Thin adapter over shared/core.js — the timeline steps. Copied from entries/[[path]].js.
//   GET    /api/steps/<slug>/flow                 -> list steps (timeline order)
//   POST   /api/steps/<slug>/flow  {kind,title,…} -> add a step
//   POST   /api/steps/<slug>/flow/seed {rows:[]}   -> one-time seed
//   PATCH  /api/steps/<slug>/flow/<id> {...}        -> edit
//   DELETE /api/steps/<slug>/flow/<id>              -> soft-delete
import { json, userEmail, parsePath, fail } from "../_lib.js";
import { listSteps, createStep, patchStep, deleteStep, seedSteps } from "../../../shared/core.js";

function ctx(request, env, params) { const p = parsePath(params); return { email: userEmail(request, env), space: p[0], list: p[1], seg: p[2] }; }
async function body(request) { try { return { body: await request.json() }; } catch { return { error: json({ error: "invalid JSON body" }, 400) }; } }

export async function onRequestGet({ request, env, params }) {
  const c = ctx(request, env, params);
  if (!c.email) return json({ error: "unauthenticated" }, 401);
  if (!env || !env.DB) return json({ error: "DB binding not configured" }, 500);
  if (!c.space || !c.list) return json({ error: "expected /api/steps/<slug>/flow" }, 400);
  try { return json(await listSteps(env, { space: c.space, list: c.list }, c.email)); } catch (e) { return fail(e); }
}
export async function onRequestPost({ request, env, params }) {
  const c = ctx(request, env, params);
  if (!c.email) return json({ error: "unauthenticated" }, 401);
  if (!env || !env.DB) return json({ error: "DB binding not configured" }, 500);
  const r = await body(request); if (r.error) return r.error;
  try {
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
  try { return json(await deleteStep(env, { space: c.space, list: c.list, id: c.seg }, c.email)); } catch (e) { return fail(e); }
}
