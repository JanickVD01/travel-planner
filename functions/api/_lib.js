import { ServiceError } from "../../shared/core.js";
export function json(obj, status) {
  return new Response(JSON.stringify(obj), { status: status || 200, headers: { "content-type": "application/json; charset=utf-8" } });
}
// Identity from Cloudflare Access; falls back to env.DEV_EMAIL for local `wrangler pages dev` only.
export function userEmail(request, env) {
  return request.headers.get("Cf-Access-Authenticated-User-Email") || (env && env.DEV_EMAIL ? env.DEV_EMAIL : null);
}
export function parsePath(params) { return (params && params.path) || []; }   // e.g. ['tokyo-2026','itinerary','en-...']
export function fail(e) {
  if (e instanceof ServiceError || (e && typeof e.status === "number")) return json({ error: e.message, code: e.code }, e.status || 500);
  throw e;   // unexpected -> let Cloudflare surface a 500
}
export * from "../../shared/core.js";
