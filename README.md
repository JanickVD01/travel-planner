# Travel Planner

A $0, AI-first web app on Cloudflare: a no-build static SPA + `/api/*` Pages Functions + a shared
domain core + a D1 (SQLite) database + a remote MCP server, fronted by Cloudflare Access and shipped
through a hardened GitHub flow designed for **safe parallel Claude Code sessions**.

The data model is an intentional placeholder right now (a generic `entries` list) — the point of
this skeleton is that all the *connections* (GitHub, Cloudflare, Access, MCP) and the safe
multi-session workflow are wired up, so you can build the rest without leaving Claude Code.

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

## Setup status

In-repo scaffolding is complete. The outward-facing setup (Wrangler login, D1 create, Pages project
+ bindings, Cloudflare Access, GitHub repo + secrets + branch protection, CI, MCP deploy + connect)
is a guided runbook — see `ai-first_project_initialisation.md` §6, or just ask Claude Code to
continue the setup.

## Working in this repo

See **`CLAUDE.md`** for the data map, the add-a-list recipe, and the parallel-session workflow
(branch → PR → gated demo preview → deterministic merge; never push to `main`).
