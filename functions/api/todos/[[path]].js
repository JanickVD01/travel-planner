// Thin adapter over shared/core.js — a free-form trip to-do list (effort 0020). Copied from packing/[[path]].js.
//   GET    /api/todos/<slug>/todos                    -> list to-dos
//   GET    /api/todos/<slug>/todos/trash              -> list soft-deleted (trashed) to-dos
//   POST   /api/todos/<slug>/todos  {title,done?,note?}  -> add a to-do
//   POST   /api/todos/<slug>/todos/<id>/restore        -> restore a trashed to-do
//   PATCH  /api/todos/<slug>/todos/<id> {...}          -> edit
//   DELETE /api/todos/<slug>/todos/<id>                -> soft-delete
//   DELETE /api/todos/<slug>/todos/<id>/purge          -> delete forever
import { json, userEmail, parsePath, fail } from "../_lib.js";
import { listTodos, createTodo, patchTodo, deleteTodo, restoreTodo, purgeTodo } from "../../../shared/core.js";

function ctx(request, env, params) { const p = parsePath(params); return { email: userEmail(request, env), space: p[0], list: p[1], seg: p[2], seg2: p[3] }; }
async function body(request) { try { return { body: await request.json() }; } catch { return { error: json({ error: "invalid JSON body" }, 400) }; } }

export async function onRequestGet({ request, env, params }) {
  const c = ctx(request, env, params);
  if (!c.email) return json({ error: "unauthenticated" }, 401);
  if (!env || !env.DB) return json({ error: "DB binding not configured" }, 500);
  if (!c.space || !c.list) return json({ error: "expected /api/todos/<slug>/todos" }, 400);
  try {
    if (c.seg === "trash") return json(await listTodos(env, { space: c.space, list: c.list, trash: true }, c.email));
    return json(await listTodos(env, { space: c.space, list: c.list }, c.email));
  } catch (e) { return fail(e); }
}
export async function onRequestPost({ request, env, params }) {
  const c = ctx(request, env, params);
  if (!c.email) return json({ error: "unauthenticated" }, 401);
  if (!env || !env.DB) return json({ error: "DB binding not configured" }, 500);
  try {
    if (c.seg2 === "restore") return json(await restoreTodo(env, { space: c.space, list: c.list, id: c.seg }, c.email));
    const r = await body(request); if (r.error) return r.error;
    return json(await createTodo(env, Object.assign({ space: c.space, list: c.list }, r.body), c.email), 201);
  } catch (e) { return fail(e); }
}
export async function onRequestPatch({ request, env, params }) {
  const c = ctx(request, env, params);
  if (!c.email) return json({ error: "unauthenticated" }, 401);
  if (!env || !env.DB) return json({ error: "DB binding not configured" }, 500);
  if (!c.seg) return json({ error: "expected /api/todos/<slug>/todos/<id>" }, 400);
  const r = await body(request); if (r.error) return r.error;
  try { return json(await patchTodo(env, Object.assign({ space: c.space, list: c.list, id: c.seg }, r.body), c.email)); } catch (e) { return fail(e); }
}
export async function onRequestDelete({ request, env, params }) {
  const c = ctx(request, env, params);
  if (!c.email) return json({ error: "unauthenticated" }, 401);
  if (!env || !env.DB) return json({ error: "DB binding not configured" }, 500);
  if (!c.seg) return json({ error: "expected /api/todos/<slug>/todos/<id>" }, 400);
  try {
    if (c.seg2 === "purge") return json(await purgeTodo(env, { space: c.space, list: c.list, id: c.seg }, c.email));
    return json(await deleteTodo(env, { space: c.space, list: c.list, id: c.seg }, c.email));
  } catch (e) { return fail(e); }
}
