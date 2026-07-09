# Travel Planner

A $0, AI-first web app on Cloudflare: a no-build static SPA + `/api/*` Pages Functions + a shared
domain core + a D1 (SQLite) database + a remote MCP server, fronted by Cloudflare Access and shipped
through a hardened GitHub flow designed for **safe parallel Claude Code sessions**.

A shared, mobile-first trip planner: organise a trip as a metro-style **timeline** of travel legs and
stays, nest **activities** under each stay, track a **budget** (estimated vs actual, in EUR from a THB
rate, with cost-per-person insights), keep a **packing list**, attach **photos**, and open any step or
activity as its own detail page — all editable in the browser *and* by talking to Claude through the
MCP server. Runs entirely on Cloudflare's free tier with no payment method attached.

## Architecture

```
Browser ──▶ Cloudflare Access (email + PIN) ──▶ Pages (public/ SPA + functions/api/*)
Claude  ──▶ Cloudflare Access (JWT)         ──▶ MCP Worker (worker-mcp/)
                                                      │
                          both import  shared/core.js │  (one set of rules)
                                                      ▼
                                            Cloudflare D1 (binding "DB")
```

- **No build step.** `public/` is plain HTML/CSS/vanilla-JS; `functions/` is bundled by Pages.
- **Fail-closed.** No identity → `401` before any DB access. Demo data only when `!DB && DEMO_API=1`.
- **Append-only audit.** Every table has a `*_audit` sibling recording actor + timestamp.

## Quickstart (local)

```bash
# 1. seed a local D1
npx --yes wrangler@4 d1 execute travel-planner-db --local --file=./schema.sql
# 2. run the site + API locally
npx --yes wrangler@4 pages dev public --d1 DB=travel-planner-db --binding DEV_EMAIL=you@example.com
# 3. (optional) run the MCP worker locally
cd worker-mcp && npm install && npm run dev   # http://localhost:8787/mcp
npm run smoke                                  # add -> list -> delete round-trip
# validate data before every push
node scripts/validate-data.mjs
```

## Status

Live (v0.5) and in active use. The whole stack is deployed — Pages + D1 + Workers KV + Cloudflare
Access + the MCP worker + CI — and the product has shipped across efforts recorded in
`docs/implementations/` (trips → metro timeline, activities, budget, packing, photo attachments,
step/activity detail pages, in-app creation wizards, and an "included in another ticket" cost flag).
The one-time outward-facing setup (Wrangler login, D1/KV create, Pages + bindings, Access, GitHub
secrets + branch protection, MCP connect) is captured in `ai-first_project_initialisation.md` §6.

## Working in this repo

See **`CLAUDE.md`** for the data map, the add-a-list recipe, and the parallel-session workflow
(branch → PR → gated demo preview → deterministic merge; never push to `main`).
