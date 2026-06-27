// Production entry. Cloudflare Access sits in front of this Worker's hostname and injects a
// signed Cf-Access-Jwt-Assertion header; we verify it OFFLINE against the team JWKS and use the
// email inside as the audit actor. No OAuth provider, no KV, no long-lived secret.
import { AppMCP } from "./mcp.js";
import { createRemoteJWKSet, jwtVerify } from "jose";
export { AppMCP };
const mcpHandler = AppMCP.serve("/mcp");

// Cache the JWKS at module scope so its internal cache survives across invocations and
// transparently handles Access's ~6-week signing-key rotation.
let _jwks = null;
function getJwks(teamDomain) {
  if (!_jwks) _jwks = createRemoteJWKSet(new URL(teamDomain.replace(/\/+$/, "") + "/cdn-cgi/access/certs"));
  return _jwks;
}
function unauthorized(msg, status) {
  return new Response(JSON.stringify({ error: msg }), { status, headers: { "content-type": "application/json; charset=utf-8" } });
}

export default {
  async fetch(request, env, ctx) {
    if (!env.TEAM_DOMAIN || !env.POLICY_AUD) return unauthorized("MCP not configured: TEAM_DOMAIN/POLICY_AUD missing.", 503);
    const token = request.headers.get("Cf-Access-Jwt-Assertion");
    if (!token) return unauthorized("Cloudflare Access authentication required.", 401);
    let email;
    try {
      const { payload } = await jwtVerify(token, getJwks(env.TEAM_DOMAIN), {
        issuer: env.TEAM_DOMAIN.replace(/\/+$/, ""), audience: env.POLICY_AUD
      });
      email = payload.email || payload.common_name || payload.sub || "access-user";
    } catch { return unauthorized("Invalid or expired Cloudflare Access token.", 403); }
    if (env.MCP_RATE_LIMITER) {
      const { success } = await env.MCP_RATE_LIMITER.limit({ key: String(email) });
      if (!success) return unauthorized("Rate limit exceeded, slow down.", 429);
    }
    ctx.props = Object.assign({}, ctx.props, { email });   // becomes the audit actor (this.props.email)
    return mcpHandler.fetch(request, env, ctx);
  }
};
