# CLAUDE.md — Travel Planner

Repo guide for future Claude Code sessions. This is a **$0, AI-first Cloudflare web app**: a
no-build static SPA + `/api/*` Pages Functions + a shared domain core + a D1 database + a remote
MCP server, all fronted by Cloudflare Access and shipped through a hardened GitHub flow built for
**safe parallel sessions**. Full rationale lives in `ai-first_project_initialisation.md`.

> **Status:** the data model is intentionally a placeholder. The only entity is the generic
> `entries` list (cols: `title, note, status, due`). It exists so the whole pipeline is verifiable.
> Replace it / add real travel lists when ready — see **Add a list** below.

## Data map (where things live)

| Concern | File |
|---|---|
| Domain logic (validation, audit, CRUD engine) — **single source of truth** | `shared/core.js` |
| Browser API (`/api/*`) — thin adapters over the core | `functions/api/**` |
| Auth gate (require Access identity, fail-closed) | `functions/_middleware.js` |
| Demo-mode switch (mock only when `!DB && DEMO_API=1`) | `functions/api/_middleware.js`, `functions/api/_mock.js` |
| SPA shell / router / markdown wiki | `public/index.html`, `public/app.js`, `public/styles.css` |
| Design language / taste contract (brand, fonts, palette, tokens thesis) — **read before any UI change** | `DESIGN.md` |
| App metadata, releases, wiki content | `public/data/**` |
| D1 schema (idempotent) | `schema.sql` |
| One-off ALTERs | `migrations/NNN_*.sql` |
| MCP server (operate by talking to Claude) | `worker-mcp/**` |
| CI / deploy | `.github/workflows/**` |
| CI gate (parses data, checks wiki) | `scripts/validate-data.mjs` |

**Invariant:** business rules live ONLY in `shared/core.js`. Both the browser API and the MCP
worker import it, so the UI and Claude can never disagree. Never duplicate logic into a route.

## Scoping model

Every row is scoped by two free-text keys: `space` and `list`. Here: **`space` = a trip**
(e.g. `tokyo-2026`), **`list` = a category** within it (e.g. `itinerary`, `lodging`, `todos`).

## Add a list (the ~6-line change)

1. **`shared/core.js`** — add a `FLAT_SPECS.<name>` entry + named wrappers (`list<X>`, `create<X>`, …).
2. **`functions/api/<name>/[[path]].js`** — copy `functions/api/entries/[[path]].js`, swap the imports.
3. **`functions/api/_mock.js`** — add a branch so previews don't 404.
4. **`schema.sql`** — add the `<name>` table + `<name>_audit` + index (copy the `entries` block).
5. *(optional)* **`worker-mcp/src/mcp.js`** — add MCP tools wrapping the new wrappers.
6. *(optional)* **`public/data/app.json`** — add the list to `lists[]` so it shows on Home.

If a table change is an `ALTER` (not a new table), put it in `migrations/NNN_*.sql`, apply it to
prod before merging, and mirror the final shape into `schema.sql`. Additive only.

## Parallel sessions — the workflow (read before pushing)

The governance exists so several Claude Code sessions can run at once without clobbering the live
site. **Never push to `main`. Never force-push.** (`.claude/settings.json` blocks the dangerous
git verbs; the server-side `protect-main` ruleset is the real backstop.)

- **One task = one branch = one PR.**
  - `content/<short-name>` — changes under `public/data/**` or docs.
  - `code/<short-name>` — everything else (`shared/**`, `functions/**`, `worker-mcp/**`, `public/*.js|css|html`, `schema.sql`, `.github/**`). Mixed → `code/`.
- **Push only via** `scripts/pr-safe-push.sh <branch>` (ff-only, refuses `main`/flags, never `--force`).
- Open a PR. CI runs `validate` (required) and posts a **demo-mode preview** link. Merge is the only
  path to production. **Merge commits only** (squash/rebase are disabled) so release-note links stay valid.
- **PR description = four lines:** `what/why` · `What's New? y/n` · `migration none/NNN` · `worker redeploy? y/n`.
- **Conflicts in append-style files** (`releases.json`, `wiki/index.json`): keep BOTH entries, then
  `node scripts/validate-data.mjs`, commit the merge, push.

### Running sessions concurrently with git worktrees

So two local sessions never share a working tree:

```
git worktree add ../travel_planner-feat-a -b code/feat-a
git worktree add ../travel_planner-feat-b -b content/feat-b
```

Open a separate Claude Code session in each directory. Each has its own branch/checkout; they push
independent PRs. Remove when merged: `git worktree remove ../travel_planner-feat-a`.

## Local dev

- **Pages + API:** `npx --yes wrangler@4 pages dev public --d1 DB=travel-planner-db` (add
  `--binding DEV_EMAIL=you@example.com` to simulate an identity locally). Seed a local DB first:
  `npx --yes wrangler@4 d1 execute travel-planner-db --local --file=./schema.sql`.
- **MCP worker:** `cd worker-mcp && npm run dev` (uses `src/dev.js`, no auth) → `http://localhost:8787/mcp`.
  Smoke it: `npm run smoke`. (A *remote* D1 can't combine with a Durable Object in `wrangler dev` —
  use a local D1 for dev.)
- **Validate before pushing:** `node scripts/validate-data.mjs`.

## Operate it from Claude (MCP)

Once the worker is deployed and connected:
`claude mcp add --transport http travel-planner https://<worker>.<sub>.workers.dev/mcp`
Then ask Claude to list/add/edit/delete entries. Tools are thin wrappers over `shared/core.js`.

## Verified stack versions (mid-2026)

`agents@^0.17.0`, `@modelcontextprotocol/sdk@^1.29.0` (use `registerTool`, not the deprecated
`server.tool`), `wrangler@^4.105`, `jose@^6.2.3`, `zod@^4.4.3`. SQLite Durable Objects
(`new_sqlite_classes`) and the rate-limit binding (`period` ∈ {10,60}) are free-tier.

## Hard rules

- **Never attach a payment method to Cloudflare.** Free tier errors instead of billing.
- **Never commit a secret.** The only secret is the Cloudflare API token; it lives only in GitHub
  repo secrets. Identity values (`TEAM_DOMAIN`, `POLICY_AUD`, account id, D1 id) are not secrets.
- **Previews never get a `DB` binding** — they must run on demo data.
