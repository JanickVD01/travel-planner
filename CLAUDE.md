# CLAUDE.md — Travel Planner

Repo guide for future Claude Code sessions. This is a **$0, AI-first Cloudflare web app**: a
no-build static SPA + `/api/*` Pages Functions + a shared domain core + a D1 database + a remote
MCP server, all fronted by Cloudflare Access and shipped through a hardened GitHub flow built for
**safe parallel sessions**. Full rationale lives in `ai-first_project_initialisation.md`.

> **Status:** live (v0.7), in active use. The data model is real (see **Data model** below): a **trip**
> owns a metro **timeline** of `steps` (travel legs + stays), each stay nests `activities`, plus a
> `packing` list and photo `attachments`. A stay's `lat`/`lng` now also drive a **visual trip map**
> (self-hosted vector atlas): a still backdrop behind the timeline + an interactive **Map view** whose
> pins open a stay's detail (effort 0015). The generic `entries` list still exists but is now only the
> MCP smoke-test fixture. Full history in `docs/implementations/`.

## Data map (where things live)

| Concern | File |
|---|---|
| Domain logic (validation, audit, CRUD engine) — **single source of truth** | `shared/core.js` |
| Browser API (`/api/*`) — thin adapters over the core | `functions/api/**` |
| Auth gate (require Access identity, fail-closed) | `functions/_middleware.js` |
| Demo-mode switch (mock only when `!DB && DEMO_API=1`) | `functions/api/_middleware.js`, `functions/api/_mock.js` |
| SPA shell / router / views | `public/index.html`, `public/app.js`, `public/styles.css` |
| Trip map — self-hosted vector atlas (timeline backdrop + interactive Map view) | `public/map.js` (+ vendored `public/vendor/d3.min.js`, `topojson-client.min.js`, `vendor/geo/*` Natural Earth JSON) |
| Design language / taste contract (brand, fonts, palette, tokens thesis) — **read before any UI change** | `DESIGN.md` |
| Implementation history — one folder per effort (`NNNN-slug/README.md`; plan · decisions · outcome · later-changes log) | `docs/implementations/` |
| App metadata + release notes | `public/data/**` |
| D1 schema (idempotent) | `schema.sql` |
| One-off ALTERs | `migrations/NNN_*.sql` |
| MCP server (operate by talking to Claude) | `worker-mcp/**` |
| CI / deploy | `.github/workflows/**` |
| CI gate (parses `public/data/*.json`) | `scripts/validate-data.mjs` |

**Invariant:** business rules live ONLY in `shared/core.js`. Both the browser API and the MCP
worker import it, so the UI and Claude can never disagree. Never duplicate logic into a route.

## Scoping model

Every row is scoped by two free-text keys: `space` and `list`. **`space` = a trip** (its slug, e.g.
`france-2026`) and **`list` = the collection** within it: `flow` (timeline steps), `activities`,
`packing`, or `attachments`. Trip config rows themselves live at `space='app'`, `list='trips'`.

## Data model (real entities — `FLAT_SPECS` in `shared/core.js` + `schema.sql`)

- **trips** (`app`/`trips`) — `title`, `slug` (immutable, unique), `home_ccy`, `thb_per_eur`,
  `budget_target_eur`, `start_date`/`end_date`, `note`.
- **steps** (`<slug>`/`flow`) — `kind` travel|stay; `title`/`location`; **`map_url`** (primary location
  link) + `lat`/`lng` (legacy fallback); `arrive`/`depart` (+`_time`); `accom_name`; `transport`/`carrier`;
  `cost_est`/`cost_actual`/`cost_ccy`; `booking_status`/`booking_url`; **`included`** (`'1'` = cost covered
  by another ticket → hidden on the card + excluded from the budget); `note`.
- **activities** (`<slug>`/`activities`) — hung off a step via `step_id`; `day`, `needs_advance`,
  location/`map_url`, cost + booking + **`included`** + `note`.
- **packing** (`<slug>`/`packing`) — `owner` (`'shared'` | email), `packed`, `category`, `qty`.
- **attachments** (`<slug>`/`attachments`) — image metadata; bytes live in Workers KV (`IMAGES_KV`);
  **`pinned`** (`'1'` = this photo is its parent **stay**'s timeline-card background; ≤1 per parent,
  enforced by `setPinned` which un-pins siblings atomically).

Soft-delete is baked into every table (`deleted` column) → **Trash** (restore / delete-forever). **Money
math lives ONLY in `computeBudget`** (all EUR; excludes `included` rows; returns estimated *and* actual
category breakdowns + per-person figures, `PEOPLE=2`). **Locations:** a real Google Maps `map_url` wins;
`lat`/`lng` only derives a search link as a fallback (set via MCP `set_map_url`).

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
- **Conflicts in append-style files** (`releases.json`): keep BOTH entries, then
  `node scripts/validate-data.mjs`, commit the merge, push.
- **Start every effort with its record.** Before writing any code, create the effort's folder
  `docs/implementations/NNNN-slug/` (next ordinal) with its `README.md` record carrying the **milestone
  plan**, and add its index row (status 🚧). Update the record **in place** as each milestone lands. The
  committed record — not chat/memory — is the durable, trackable plan of record. Research notes and
  other per-effort artifacts live in the same folder. When a **shipped** effort is later changed by
  something too small to warrant a new numbered effort, append a dated **`## Later changes`** section to
  that effort's `README.md` (append-only) rather than editing its frozen Outcome — no separate file.
  (Front-of-effort companion to the Reconcile rule below; folder layout since effort 0014, convention
  since effort 0010.)
- **Reconcile at the end of every effort.** An effort's final milestone re-aligns the "glue" docs —
  this file, `DESIGN.md`, the `MEMORY` journal, `README.md`, `public/data/app.json`, the
  `docs/implementations/` index, and the **GitHub About** — with what actually shipped, so the project's
  self-description never drifts back toward the generic scaffold. (Convention since effort 0005.)

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
Then ask Claude to manage trips, steps, activities, packing and photos — `create_trip`,
`add_stay`/`add_travel`/`add_step`, `add_activity`, `edit_step`/`edit_activity`, `set_booking`,
`set_included`, `set_map_url`, `get_trip_overview`, `get_budget`, and the packing/attachment tools.
All are thin wrappers over `shared/core.js` (the same rules the browser API uses).

**On phones / the claude.ai app:** add a *custom connector* to the same `/mcp` URL instead of the CLI.
This requires `https://claude.ai/api/mcp/auth_callback` on the Access app's Managed OAuth **Allowed
redirect URIs** — without it, claude.ai's Dynamic Client Registration fails ("Couldn't register…"),
though the CLI still works via a loopback redirect. See `docs/implementations/0006-mcp-connector-redirect-uri/`.

## Verified stack versions (mid-2026)

`agents@^0.17.0`, `@modelcontextprotocol/sdk@^1.29.0` (use `registerTool`, not the deprecated
`server.tool`), `wrangler@^4.105`, `jose@^6.2.3`, `zod@^4.4.3`. SQLite Durable Objects
(`new_sqlite_classes`) and the rate-limit binding (`period` ∈ {10,60}) are free-tier.

## Hard rules

- **Never attach a payment method to Cloudflare.** Free tier errors instead of billing.
- **Never commit a secret.** The only secret is the Cloudflare API token; it lives only in GitHub
  repo secrets. Identity values (`TEAM_DOMAIN`, `POLICY_AUD`, account id, D1 id) are not secrets.
- **Previews never get a `DB` binding** — they must run on demo data.
