# 0006 — claude.ai web/mobile connector: Managed-OAuth redirect-URI allowlist

> **Status:** ✅ Shipped 2026-07-09 (PR #33). Docs reconciliation merged, and the owner has added the
> Claude callback (`https://claude.ai/api/mcp/auth_callback`) to the Access app's Managed OAuth allowlist.
> One numbered record per effort — see [`README.md`](../README.md) for the index.

## Context

Using the MCP server from a **phone** is mandatory for the user. Adding the worker as a **custom
connector on claude.ai** fails immediately with *"Couldn't register with Travel Planner's sign-in
service … `ofid_…`"*, while the **Claude Code CLI connects to the identical URL fine**. Because the
claude.ai mobile apps inherit connectors by syncing from a working **web** connector, a broken web
connector means no phone access at all.

## Root cause (diagnosed from live probes + vendor docs)

The worker (`travel-planner-mcp.janickvandamme.workers.dev`) is fronted by a **Cloudflare Access
"Managed OAuth"** self-hosted app. The OAuth discovery chain is healthy — verified live:

- `GET/POST /mcp` → `401` with `WWW-Authenticate: Bearer … resource_metadata="…/.well-known/cloudflare-access-protected-resource/mcp"`
- `/.well-known/oauth-protected-resource[/mcp]` → `200`; authorization-server metadata → `200` and
  **advertises a `registration_endpoint`** (`…/cdn-cgi/access/oauth/registration`).

The failure is at **Dynamic Client Registration (DCR)**. Cloudflare Managed OAuth only lets a
dynamically-registered client use a `redirect_uri` that is on the app's **"Allowed redirect URIs"**
allowlist (`allowed_uris`), plus loopback/localhost via `allow_any_on_loopback`/`allow_any_on_localhost`.

- **Claude Code CLI** registers a **loopback** redirect (`http://127.0.0.1/callback`) → allowed by
  default → connects.
- **claude.ai web/Desktop/iOS/Android/Cowork** all register the hosted redirect
  **`https://claude.ai/api/mcp/auth_callback`** → **not** on the allowlist → Cloudflare rejects the DCR
  POST → *"Couldn't register."*

Sources: Cloudflare [Managed OAuth](https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/managed-oauth/)
(the `allowed_uris` allowlist + loopback toggles); Cloudflare [MCP server portals](https://developers.cloudflare.com/cloudflare-one/access-controls/ai-controls/mcp-portals/)
(portals need a **custom domain** → incompatible with our $0/workers.dev setup); Claude
[connector auth docs](https://claude.com/docs/connectors/building/authentication) + anthropics/claude-ai-mcp
[#410](https://github.com/anthropics/claude-ai-mcp/issues/410) (hosted surfaces share the one callback;
CLI uses loopback).

## Locked decisions

| Topic | Decision |
|---|---|
| Fix | **Config-only**: add `https://claude.ai/api/mcp/auth_callback` to the MCP Access app's **Managed OAuth → Allowed redirect URIs**. No worker code, no redeploy, no custom domain, still $0. |
| Keep CLI working | **Leave loopback/localhost clients enabled** (Claude Code registers `127.0.0.1`). |
| MCP Server Portal | **Rejected** — requires a custom domain (paid zone); breaks the $0/workers.dev constraint. |
| In-worker OAuth (`@cloudflare/workers-oauth-provider`) | **Documented fallback only** — robust but adds `OAUTH_KV` token storage + a consent handler and abandons the "no OAuth provider / no KV / no long-lived secret" auth model. Use only if the allowlist fix somehow doesn't resolve it. |
| Repo work | **Doc reconciliation** (this record + index; `ai-first_project_initialisation.md` §8.6; `travel-planner-requirements.md` §5.2; `CLAUDE.md`) so the allowlist step is never lost and the old "CLI is the only reliable path" wording is corrected. |

## The fix (owner, one-time, ~1 min)

Zero Trust → **Access controls → Applications** → the `…MCP` app for
`travel-planner-mcp.janickvandamme.workers.dev` → **Edit → Advanced settings → Managed OAuth** →
**Allowed redirect URIs** → add `https://claude.ai/api/mcp/auth_callback` → **Save**. (Optional IaC:
`PATCH` the access app's `oauth_configuration.dynamic_client_registration.allowed_uris` via the
Cloudflare API using the existing `CLOUDFLARE_API_TOKEN`; never commit the token.)

## Verification

1. **Web:** claude.ai → Connectors → Add custom connector (URL `…/mcp`, OAuth fields blank) → passes DCR
   → Access email one-time-PIN → **Connected** (no "Couldn't register").
2. **Tools:** a new chat lists the Travel Planner tools; "list my trips" returns **France 2026** +
   **Thailand 2026**.
3. **Phone (mandatory):** Claude iOS/Android app (same account) → connector synced → "show my Thailand
   trip" returns the itinerary.
4. **Regression:** Claude Code CLI still authenticates (loopback untouched).

## Outcome

Docs merged (PR #33) and the owner has allowlisted `https://claude.ai/api/mcp/auth_callback` on the
Access app's Managed OAuth. The claude.ai web/mobile connector can now complete Dynamic Client
Registration; the owner is validating the live phone connector (customer-feedback loop).
