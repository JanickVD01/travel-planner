// Require a Cloudflare Access identity on every /api/* request. Static assets are unaffected.
// Fail-closed: no identity -> 401 before any DB access. DEV_EMAIL only applies to local dev.
//
// Exception: demo mode (preview deployments). Previews live on a different *.pages.dev subdomain
// than the Access-gated production host, so they are public. When BOTH there is no DB binding AND
// DEMO_API=1, we let /api/* through to the demo-mode switch (functions/api/_middleware.js), which
// serves an in-memory mock. Production always has DB and never sets DEMO_API=1, so it stays
// fail-closed; and a prod that merely lost its DB binding (DEMO_API still unset) also stays 401.
export async function onRequest({ request, env, next }) {
  const url = new URL(request.url);
  if (url.pathname.startsWith("/api/")) {
    const demo = !(env && env.DB) && env && env.DEMO_API === "1";
    if (!demo) {
      const email = request.headers.get("Cf-Access-Authenticated-User-Email") || (env && env.DEV_EMAIL) || null;
      if (!email) return new Response(JSON.stringify({ error: "unauthenticated" }),
        { status: 401, headers: { "content-type": "application/json; charset=utf-8" } });
    }
  }
  return next();
}
