// Thin adapter over shared/core.js — attachment METADATA only. Image BYTES are handled SOLELY by
// /api/image/** (Workers KV); this route NEVER touches bytes. Creation happens through the image
// upload route (so a metadata row is never created without its bytes). Copied from activities/[[path]].js.
//   GET    /api/attachments/<slug>/attachments        -> list attachments (metadata)
//   PATCH  /api/attachments/<slug>/attachments/<id>   -> edit metadata (e.g. caption)
//   DELETE /api/attachments/<slug>/attachments/<id>   -> soft-delete
import { json, userEmail, parsePath, fail } from "../_lib.js";
import { listAttachments, patchAttachment, deleteAttachment } from "../../../shared/core.js";

function ctx(request, env, params) { const p = parsePath(params); return { email: userEmail(request, env), space: p[0], list: p[1], seg: p[2] }; }
async function body(request) { try { return { body: await request.json() }; } catch { return { error: json({ error: "invalid JSON body" }, 400) }; } }

export async function onRequestGet({ request, env, params }) {
  const c = ctx(request, env, params);
  if (!c.email) return json({ error: "unauthenticated" }, 401);
  if (!env || !env.DB) return json({ error: "DB binding not configured" }, 500);
  if (!c.space || !c.list) return json({ error: "expected /api/attachments/<slug>/attachments" }, 400);
  try { return json(await listAttachments(env, { space: c.space, list: c.list }, c.email)); } catch (e) { return fail(e); }
}
export async function onRequestPatch({ request, env, params }) {
  const c = ctx(request, env, params);
  if (!c.email) return json({ error: "unauthenticated" }, 401);
  if (!env || !env.DB) return json({ error: "DB binding not configured" }, 500);
  if (!c.seg) return json({ error: "expected /api/attachments/<slug>/attachments/<id>" }, 400);
  const r = await body(request); if (r.error) return r.error;
  try { return json(await patchAttachment(env, Object.assign({ space: c.space, list: c.list, id: c.seg }, r.body), c.email)); } catch (e) { return fail(e); }
}
export async function onRequestDelete({ request, env, params }) {
  const c = ctx(request, env, params);
  if (!c.email) return json({ error: "unauthenticated" }, 401);
  if (!env || !env.DB) return json({ error: "DB binding not configured" }, 500);
  if (!c.seg) return json({ error: "expected /api/attachments/<slug>/attachments/<id>" }, 400);
  try { return json(await deleteAttachment(env, { space: c.space, list: c.list, id: c.seg }, c.email)); } catch (e) { return fail(e); }
}
