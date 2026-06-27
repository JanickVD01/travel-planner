// Require a Cloudflare Access identity on every /api/* request. Static assets are unaffected.
// Fail-closed: no identity -> 401 before any DB access. DEV_EMAIL only applies to local dev.
export async function onRequest({ request, env, next }) {
  const url = new URL(request.url);
  if (url.pathname.startsWith("/api/")) {
    const email = request.headers.get("Cf-Access-Authenticated-User-Email") || (env && env.DEV_EMAIL) || null;
    if (!email) return new Response(JSON.stringify({ error: "unauthenticated" }),
      { status: 401, headers: { "content-type": "application/json; charset=utf-8" } });
  }
  return next();
}
