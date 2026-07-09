// The ONLY route that touches image BYTES. Bytes live in Workers KV (env.IMAGES_KV); metadata lives
// in D1 (attachments table, served by /api/attachments/**). Both the DB and the KV binding are guarded:
// with no KV namespace bound the app still deploys + runs — uploads just return a clean 503 and reads
// 503 — so we can ship this before a KV namespace exists (see wrangler.jsonc for how to enable it).
//   POST /api/image/<slug>/<parent_type>/<parent_id>   multipart field 'file' -> store bytes + create metadata row
//   GET  /api/image/<slug>/<attachment_id>             -> stream the bytes (immutable, long-cached)
import { json, userEmail, parsePath, fail } from "../_lib.js";
import { createAttachment, patchAttachment, deleteAttachment, cleanContentType, attachmentKey } from "../../../shared/core.js";

const MAX_BYTES = 5 * 1024 * 1024;   // 5 MB per image

export async function onRequestPost({ request, env, params }) {
  const email = userEmail(request, env);
  if (!email) return json({ error: "unauthenticated" }, 401);
  // Fail closed if either half of storage is missing (no bytes-store, or no metadata DB).
  if (!env || !env.DB || !env.IMAGES_KV) return json({ error: "photo uploads not configured yet" }, 503);
  const p = parsePath(params), slug = p[0], parent_type = p[1], parent_id = p[2];   // [slug, parent_type, parent_id]
  if (!slug || !parent_id) return json({ error: "expected /api/image/<slug>/<parent_type>/<parent_id>" }, 400);
  let form;
  try { form = await request.formData(); } catch { return json({ error: "expected multipart/form-data" }, 400); }
  const file = form.get("file");
  if (!file || typeof file.arrayBuffer !== "function") return json({ error: "missing 'file' part" }, 400);
  if (!cleanContentType(file.type)) return json({ error: "unsupported image type" }, 415);
  if (file.size > MAX_BYTES) return json({ error: "file too large (max 5MB)" }, 413);
  const caption = form.get("caption");
  try {
    // 1) create the metadata row (it mints the id) with a placeholder key.
    const { row } = await createAttachment(env, {
      space: slug, list: "attachments", parent_type, parent_id, kv_key: "",
      caption: caption == null ? null : String(caption), content_type: file.type, size: file.size
    }, email);
    const key = attachmentKey(slug, row.id);
    // 2) store the bytes. If this fails, roll the row back — never a metadata row without its bytes.
    try {
      await env.IMAGES_KV.put(key, await file.arrayBuffer(), { metadata: { contentType: file.type } });
    } catch (e) {
      try { await deleteAttachment(env, { space: slug, list: "attachments", id: row.id }, email); } catch {}
      return json({ error: "failed to store image" }, 502);
    }
    // 3) point the row at the real key now that the bytes are in place.
    await patchAttachment(env, { space: slug, list: "attachments", id: row.id, kv_key: key }, email);
    return json({ row: Object.assign({}, row, { kv_key: key }), url: "/api/image/" + slug + "/" + row.id }, 201);
  } catch (e) { return fail(e); }
}

export async function onRequestGet({ request, env, params }) {
  const email = userEmail(request, env);
  if (!email) return json({ error: "unauthenticated" }, 401);
  if (!env || !env.IMAGES_KV) return json({ error: "photo uploads not configured yet" }, 503);
  const p = parsePath(params), slug = p[0], id = p[1];   // [slug, attachment_id]
  if (!slug || !id) return json({ error: "expected /api/image/<slug>/<attachment_id>" }, 400);
  const key = attachmentKey(slug, id);   // REBUILD from slug+id — never trust a client-supplied key.
  const { value, metadata } = await env.IMAGES_KV.getWithMetadata(key, { type: "arrayBuffer" });
  if (value == null) return json({ error: "not found" }, 404);
  return new Response(value, {
    headers: {
      "content-type": (metadata && metadata.contentType) || "application/octet-stream",
      "cache-control": "public, max-age=31536000, immutable"
    }
  });
}
