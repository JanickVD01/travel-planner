# 0017 — Research notes (codebase exploration, 2026-10-13)

What the codebase looked like before this effort, and the facts that shaped the
[plan](README.md).

## Data layer

- **No grouping concept exists.** A word-boundary search for region / country / city / area across
  `shared/`, `schema.sql`, `migrations/`, `functions/`, `worker-mcp/src` and `public/app.js` finds
  nothing. The only hits are in the map's vendored geodata (`public/map.js`, `vendor/geo/admin1-lite.json`).
- **Order comes only from `sort_order`.**
  - `flatList` orders by `sort_order, <idCol>`.
  - `flatCreate` appends at `MAX(sort_order)+10` across the whole `(space, list)`, deleted rows included.
  - Nothing sorts by `arrive`.
  - The UI inserts mid-timeline by patching a midpoint `sort_order`, or renumbering to `(i+1)*10` when there's no gap (`public/app.js` ~L1583).
- **Parent links are free-text ids, never FKs.**
  - `activities.step_id` and `attachments.parent_id` are plain TEXT.
  - Rows that point at a missing parent are shown as "unassigned", both in `tripOverview` and in `loadTrip`.
  - Soft-deleting a step doesn't cascade. Only `purgeStepDeep` cascades, in one batch with audit rows.
- **Validation only coerces.** Cleaners fall back to safe defaults or `null`. The only thrown errors are 400 (nothing to update), 404, 409 (slug conflict) and 422 (`no_rate` in `computeBudget`).
- **Money math lives only in `computeBudget`.** It is pure: EUR only, excludes `included` rows, groups by category (transport / accommodation / activities) and computes per-person figures.
- **Migrations:**
  - A new table goes straight into the idempotent `schema.sql`. `deploy.yml` re-applies it on merge when it changed.
  - A new column needs `migrations/NNN_*.sql` (001 `included`, 002 `pinned`), applied to prod **before** merge via the `workflow_dispatch` `migrate.yml`.

## Delivery and deploy

- **The browser can't import `shared/core.js`.**
  - Pages serves only `public/`, and `app.js` is a classic, no-build script.
  - Logic therefore reaches the browser only as API output. The tree goes through `/api/overview/<slug>` (`tripOverview`), which the frontend doesn't call yet.
  - `functions/api/_mock.js` already imports core (`computeBudget`), so demo previews can run the real tree builder.
- **Deploy race on merge.**
  - `deploy.yml` re-applies `schema.sql` (only when it changed) and then deploys Pages.
  - `deploy-worker.yml` triggers on `worker-mcp/**` **or `shared/**`** and runs in parallel.
  - If the worker deploys before `schema.sql` is applied, MCP calls could hit a missing `regions` table. So migration 003 also creates the table (`CREATE TABLE IF NOT EXISTS`) and runs before merge.
- **Demo data** (`_mock.js`) has only `thailand-2026`: BRU→BKK flight · Bangkok · train · Chiang Mai · flight · "Ko Lanta (via Krabi)".
  - Mock PATCH and DELETE calls are no-ops; POST appends in memory.
  - The real `france-2026` (Paris + Provence) lives only in prod.
- **No tests exercise steps.** `npm run smoke` only covers `entries` (and a best-effort `get_budget`). The only CI gate is `scripts/validate-data.mjs`.

## UI

- **The timeline is flat.** `viewTimeline` renders `<ol class="tl">`, with `stepInserterHTML(i)` before each step and `stepCardHTML(s, …)` for each step. Activities only appear in the step detail view (since 0008).
- **Existing segmented control:** the Budget page's Estimated / Actual `.basis-toggle` / `.basis-chip`. It is 34 px tall, so it needs a 44 px variant for tap targets.
- **One accent per view.**
  - The active subnav tab (`styles.css` ~L409) and the stay markers already use `--accent`.
  - New zoom chips and region markers must therefore be tonal.
  - The unused `--rail` token (`tokens.css`) gives region markers an on-brand ink blue.
- **Map constraint (0015):** the owner explicitly rejected a backdrop map that pans or focuses with the timeline ("I don't need my timeline to go flying around"). Collapse and expand must never call `syncTripMap`.
- **Map API** (`public/map.js`): `setTrip`, `fitAll`, `onResize`, `destroy`. It only fits all stays and has no subset-highlighting API. Any per-region map work is out of scope.

## Environment

- The `travel-planner` MCP connector needs authentication in the Claude Code environment. The guided backfill (M4) has to wait until the owner authorises it via `/mcp` in an interactive session.
