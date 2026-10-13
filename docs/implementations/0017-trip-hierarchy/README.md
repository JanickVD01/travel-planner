# 0017 — Trip hierarchy timeline (Trip › Region › Location › Step)

> **Status:** 🚧 In progress — M1 ✅ + M2 ✅ (2026-10-13, PR #51). Migration 003 applied to prod D1 via the
> `migrate` workflow before merge (run 38371496790: 5 queries, success). M3 ✅ (PR #52). M4 ✅ (prod
> backfill of Thailand + France, owner-confirmed). M5 ✅ (PR 3, `code/trip-hierarchy-timeline`). M6–M7 pending. This record carries the full milestone plan and is **updated in place** as
> milestones land (like [0010](../0010-pinned-step-photo/)). See [`README.md`](../README.md) for the
> index and [`research.md`](research.md) for the codebase findings that shaped the design.

## Context

The timeline today is a single flat **step view**: travel legs and stays in `sort_order`, each with a lot
of detail (dates, times, status, duration). That is the right level for *executing* a trip, but not for
*planning* one. Planning is top-down:

- **France (short trip):** you pick a **region** — Provence — and within it the **location** (town) you
  stay in for 7 days; within that town you plan activities.
- **Thailand (longer trip):** Bangkok (a region; a few days, some activities) → Chiang Mai, up north (a
  region of its own) → Krabi, starting in **Ao Nang** and probably moving on to other locations in Krabi.

The owner's ask (2026-10-13): give the timeline **zoom levels** — a high-level **trip** view, a **region**
view, a **location** view and the existing **step** view — so you can zoom out while planning. Data-model
changes are allowed, provided existing data is migrated.

Before this effort nothing groups steps: there is no region, city or country concept anywhere in the
data, the API, the MCP worker or the UI (see [`research.md`](research.md)).

## Decisions

| Topic | Decision |
|---|---|
| Hierarchy | **Trip › Region › Location › Step › Activity.** Activities keep hanging off stays via `step_id` (unchanged). |
| Regions | **First-class rows** (owner's choice) — a new `regions` flat spec/table at `space=<trip slug>`, `list='regions'`. A region can exist **empty**, so you can plan "Bangkok 4n → North 4n → Krabi 6n" before booking any stay. Steps get a nullable **`region_id`** (free text, not an FK — same pattern as `activities.step_id`). |
| Locations | **Derived, not stored** (owner's choice). A location = a stay's town (`location` ‖ `title`, normalised: lower-case, accents stripped, parentheses dropped). Consecutive stays in the same region with the same town fold into one location (e.g. two hotels in Bangkok). Travel legs inside a region (Ao Nang → Railay ferry) belong to the region and sit between locations. |
| Ordering rule | **Step `sort_order` is the only record of chronology.** A region's position is derived from its member steps; a region's own `sort_order` (same number scale as steps) only places it while it has no live steps. The tree is a pure grouping of the existing step order, so it can never contradict the flat view. Steps without a region (e.g. the BKK → CNX train between regions) stay where they are. A region whose steps aren't next to each other shows as two blocks flagged `split` (allowed, surfaced). |
| Reordering | **`moveRegion` is the only way to reorder a region**: it moves the region's steps as one block and renumbers all live steps + empty regions to `(i+1)*10` in one `DB.batch` with audit rows. Creating a step with a `region_id` (no explicit `sort_order`) places it right after the region's last step. |
| Region dates & nights | **Derived in core from member stays** (nights = sum of stay nights, arrive = earliest, depart = latest). Planned values (`planned_nights`, `start_date`/`end_date`) show while the region is empty; once stays exist a quiet hint flags a mismatch ("planned 5 · booked 4"). Never recomputed in the UI. |
| Money | Per-region subtotals come from **`computeBudget`** (new `byRegion`), the only place money math lives. Existing callers unaffected. |
| Where the tree is built | A pure **`buildTripTree`** in `shared/core.js`, surfaced through `/api/overview/<slug>` (`composeOverview`). The browser can't import `shared/core.js` (Pages serves only `public/`), so the timeline switches to the overview endpoint; the demo mock runs the same core function. |
| Delete semantics | **Soft-deleting a region doesn't cascade** — its steps fall back to top level (like a deleted step's activities → Unassigned); restoring regroups them. **Purging a region** clears `region_id` on its steps in the same batch (audited) and **never deletes steps**. |
| UX | **Collapsible nested list** (owner's choice) on the existing metro rail: region headers and location rows expand/collapse in place. An **"Expand to"** control (Trip · Regions · Locations · Steps) sets every group to one depth in a tap — the four zoom views the owner asked for. **Trip** depth = a summary (total nights, regions, stays, dates) + a strip of regions sized by nights. A trip with no regions renders exactly as today. |
| Design contract | Region headers are a tonal `--paper-2` band with an **interchange-capsule marker** in the existing `--rail` blue; location rows use a ring marker. The zoom chips' active state is **tonal, not accent** (the subnav and stay markers already use the one accent per view). Taps ≥ 44 px, `aria-expanded` on toggles, motion = transform/opacity behind reduced-motion. |
| Unplanned gaps | **A gap in time is shown as a gap** (owner, 2026-10-13, during M4): when nothing is planned between the end of one plan and the start of the next, the timeline shows its own marker, e.g. "4 nights unplanned · 12 → 16 Dec", rather than hiding it inside a region's planned window. Computed in core (`buildTripTree`) from coverage: a stay covers arrive → depart, a travel leg covers depart → arrive, so an overnight train or flight is **not** a gap. A gap node sits between the items it separates (top level, or inside a region when both sides are in it), also appears in the trip strip, and adds to `totals.unplanned_nights`. Built in M5. |
| Map | **The map never re-frames on collapse/expand.** The 0015 decision stands (still backdrop; interactivity only in Map view). |
| Collapse state | `localStorage["tp.tree.<slug>"]` (try/catch) — a per-viewer convenience only, never data. |
| Migration of existing data | **Schema migration + guided backfill** (owner's choice). `migrations/003_region_id.sql` only adds structure. Then Claude proposes region names per prod trip (France: Paris / Provence; Thailand: Bangkok / Chiang Mai (North) / Krabi), **the owner confirms**, and the regions are written via the new MCP tools. Unassigned steps render fine meanwhile. |
| Governance | Branches `code/trip-hierarchy-core` → `-mcp` → `-timeline` → `-editing`, then `content/trip-hierarchy-reconcile`; one PR each via `scripts/pr-safe-push.sh`. **Migration 003** (creates `regions` *and* adds `steps.region_id`) is applied to prod via the `migrate` workflow **before PR 1 merges** — the table is created in the migration too, because `deploy-worker.yml` (triggers on `shared/**`) can race `deploy.yml`'s `schema.sql` re-apply. Worker redeploys: PR 1 (automatic) and PR 2. |

## Data model

**`regions`** (`<slug>`/`regions`, idCol `region_id`, prefix `rg`, soft-delete):

| column | cleaner | notes |
|---|---|---|
| `title` | — | the region's name, e.g. "Provence", "Krabi" (kept as `title` so Trash and generic code work unchanged) |
| `planned_nights` | `cleanQty`, nullable | planned length while stays aren't booked yet |
| `start_date` / `end_date` | `cleanDate`, nullable | optional planned window |
| `note` | — | free text |
| `sort_order` | engine | only places an **empty** region (see ordering rule) |

**`steps`** gains **`region_id`** (TEXT, nullable; `""`/`null` clears it) + index `idx_steps_region`.

`schema.sql` mirrors the final shape (`regions`, `regions_audit`, `idx_regions`, `steps.region_id`,
`idx_steps_region`); `migrations/003_region_id.sql` = `CREATE TABLE IF NOT EXISTS` for the new table/audit/
indexes first, the non-idempotent `ALTER TABLE steps ADD COLUMN region_id TEXT` last.

## Milestones

| PR | Milestone | Migration | Worker redeploy | What's New |
|---|---|---|---|---|
| 1 `code/trip-hierarchy-core` | **M1 — Record** *(this file)* + [`research.md`](research.md) + index row 🚧 — ✅ 2026-10-13 | — | — | n |
| 1 `code/trip-hierarchy-core` | **M2 — Core + schema**: `FLAT_SPECS.regions` + `steps.region_id`; `flatCreate` honours an explicit `sort_order`; `nextTimelineSlot`; region wrappers (`listRegions`, `createRegion`, `patchRegion`, `deleteRegion`, `restoreRegion`, `purgeRegionDeep`, `moveRegion`, `assignSteps`); pure `buildTripTree` + `composeOverview` (→ `tripOverview`); `computeBudget` `byRegion`; `schema.sql`; `migrations/003_region_id.sql`; `functions/api/regions/[[path]].js`; `_mock.js` uses `composeOverview` + demo regions (Bangkok ×2 stays, North, Krabi = Ao Nang → ferry → Railay, empty "Bangkok (return)") — ✅ 2026-10-13 (see *M2 verification* below) | **003, before merge** | y (auto) | n |
| 2 `code/trip-hierarchy-mcp` | **M3 — MCP**: `list_regions`, `add_region`, `edit_region`, `move_region`, `delete_region`, `restore_region`, `list_deleted_regions`, `purge_region`, `assign_steps_to_region`; `region_id` on `add_step`/`edit_step`/`add_stay`/`add_travel`; updated `get_trip_overview`/`get_budget` descriptions; smoke round-trip — ✅ 2026-10-13 (see *M3 verification*) | none | **y** | n |
| (ops) | **M4 — Guided backfill on prod**: `list_trips` + `get_trip_overview` → proposal table per trip → **owner confirms** → `add_region` + `assign_steps_to_region` → re-check (no `split_regions`, no loose stays). Rollback = `assign_steps_to_region(null)` + `delete_region`. Outcome logged here — ✅ 2026-10-13 (see *M4 outcome*) | none | n | n |
| 3 `code/trip-hierarchy-timeline` | **M5 — Timeline**: unplanned-gap nodes in core `buildTripTree` (+ strip + `totals.unplanned_nights`); `loadTrip` → `/api/overview`; tree render (`regionGroupHTML`, `locationRowHTML`, existing `stepCardHTML`); "Expand to" control; trip summary + nights strip; collapse state + one delegated `bindTree()` (no re-render, keeps scroll); CSS; inserters inside a region create the step there (`data-region` → `region_id`) — ✅ 2026-10-13 (see *M5 verification*) | none | n | n |
| 4 `code/trip-hierarchy-editing` | **M6 — Editing**: region sheet `#/trip/<slug>/region/<id>` (edit, member list, move earlier/later, delete); "Add region" wizard; region picker in step detail; step-wizard region default (tapped "+" → previous step's region); Trash "Regions" group; Budget "By region" — ⏳ | none | n | n |
| 5 `content/trip-hierarchy-reconcile` | **M7 — Reconcile**: `CLAUDE.md` (data model, scoping, MCP list), `DESIGN.md` (hierarchy timeline, interchange marker, tonal chips), `README.md`, `public/data/app.json`, `releases.json` v0.8.0, index ✅, MEMORY, GitHub About — ⏳ | none | n | **y** |

Each PR description uses the four-line format (`what/why` · `What's New? y/n` · `migration none/NNN` ·
`worker redeploy? y/n`).

## Verification

1. **Static:** `node --check` on every changed JS file; `node scripts/validate-data.mjs`.
2. **Pure tree on demo data** (no server): call `handleMock(new Request('http://x/api/overview/thailand-2026'))`
   from `node -e`. Expect: Bangkok = one location with 2 stays; Krabi = Ao Nang → ferry → Railay; the
   transfer legs between regions at top level; the empty "Bangkok (return)" last; `byRegion` sums to
   `totalEst`.
3. **Local D1:** apply `schema.sql` (plus `migrations/003` on an existing local DB); `wrangler pages dev
   public --d1 DB=travel-planner-db --binding DEV_EMAIL=…`. Region CRUD; inserting a step into a region
   lands inside its block; `move` renumbers; soft-delete → steps go top level, restore regroups; purge →
   `region_id` cleared on its steps.
4. **MCP:** `cd worker-mcp && npm run dev` + `npm run smoke`; `add_stay` with `region_id`;
   `assign_steps_to_region` reports `split_regions`.
5. **Demo preview:** all four depths; toggles keep scroll; state survives reload; map never moves;
   keyboard + `aria-expanded`; 44 px taps; light/dark; reduced motion; a trip with no regions renders as
   today.
6. **Prod:** migrate run log green before PR 1 merges; timeline still flat after merge; then M4 and a
   visual check.

## M2 verification (done 2026-10-13)

- **Static:** `node --check` on `shared/core.js`, `functions/api/_mock.js`, `functions/api/regions/[[path]].js`;
  `node scripts/validate-data.mjs` ✓; the MCP worker still bundles against the new core
  (`wrangler deploy --dry-run`, no deploy).
- **Pure tree on demo data** (`handleMock(.../api/overview/thailand-2026)`): Flight · **Bangkok** [one
  location, 2 stays, 4n] · Train · **North (Chiang Mai)** [4n, planned 5 → gap 1] · Flight · **Krabi**
  [Ao Nang 3n · ferry · Railay 3n] · **Bangkok (return)** [empty, planned 2, `insert_index` 9]; strip +
  totals as expected; `byRegion` sums to `totalEst` (±0.01 per-bucket rounding).
- **Migration 003 on a pre-0017 local DB** (scratch `--persist-to`): creates `regions`, `regions_audit`,
  `idx_regions`, `steps.region_id`, `idx_steps_region`; re-applying the new `schema.sql` afterwards is
  clean; a second run of 003 fails only on the `ALTER` (duplicate column) — as designed.
- **Local e2e** (`wrangler pages dev` on a fresh scratch D1, 30 checks, all ✓): regions append after steps;
  `PATCH region_id` to an unknown region → 404; a stay created with `region_id` lands right after the
  region's last step and folds into the same location via `normPlace` ("bangkok (Sukhumvit)" ≡ "Bangkok");
  an empty region shows `insert_index` + a planned strip segment, and its first stay takes its slot;
  region-less steps append after planned regions; `move` (before / to end) renumbers to `(i+1)*10`, leaves
  loose steps in place and merges a split region; moving relative to itself → 400; soft-delete → steps go
  top level, restore regroups; a no-gap insert renumbers and lands between its neighbours with unique
  `sort_order`s; `byRegion` = tree `eur` = hand-computed figure; `createRegion` with `before_region_id`
  places it; `patchRegion` ignores `sort_order`; purge clears `region_id` on its steps and deletes none.

## M3 verification (done 2026-10-13)

- **Static:** `node --check` on `worker-mcp/src/mcp.js` + `scripts/smoke.mjs`.
- **`npm run smoke`** against a local `wrangler dev src/dev.js` on a fresh scratch D1: the 9 region tools
  are registered; new self-cleaning round-trip `add_region` → `add_stay(region_id)` → `get_trip_overview`
  tree shows the region (2 nights, 1 stay) → `purge_region` (`steps_cleared: 1`) → `purge_step` ✓.
- **Backfill simulation over MCP** (scratch client, 15 checks ✓) on a flat pre-0017 France-shaped trip
  (BRU→Paris · Paris · →Avignon · Avignon · →Gordes · Gordes): `add_region` ×2 + `assign_steps_to_region`
  → tree `flight | Paris[Paris] | train | Provence[Avignon, drive, Gordes]`, Provence 5 nights = plan,
  `byRegion` correct; `missing` ids reported; `edit_step region_id` on the first leg → split detected,
  un-assign (`region_id: null`) → no split; unknown region → error; `move_region` before / to end;
  delete → `list_deleted_regions` → restore; `edit_region` title + clearing `planned_nights` (null);
  `add_region` with `before_region_id` places an empty region; `add_stay` into it takes its slot.

## M4 outcome — guided backfill on prod (2026-10-13)

The MCP connector was re-connected after PR #52 deployed (a session caches the tool list, so new tools
appear only after a reconnect). Read `list_trips` + `get_trip_overview`, which found three trips, all flat. Claude
proposed regions per trip; the owner decided:

- **Thailand 2026:** four regions, **Bangkok** (first stay) · **North (Chiang Mai)** · **Krabi** (Ao Nang;
  no planned window) · **Bangkok (return)** (final night), with the flights + night train left
  unassigned as transfers. Owner rejected "plan Krabi through 16 Dec to absorb the 12 → 16 Dec hole" in favour
  of **showing unplanned gaps explicitly** (new decision above; built in M5).
- **France 2026:** **Paris** · **Provence** (the Avignon stay + its day-trip activities); flights + TGV
  unassigned. A leftover test stay ("Lyon / Test Hotel Lyon", July, before the trip) was **soft-deleted** at
  the owner's request; its test activity now shows as unassigned.
- **Mexico 2027:** skipped for now (owner's choice).

Written via `add_region` (chronological) + `assign_steps_to_region`: every call returned `missing: []`,
`split_regions: []`. Re-checked with `get_trip_overview`: Thailand = flights · Bangkok [3n] · train ·
North [Chiang Mai 5n] · flight · Krabi [Ao Nang 7n] · Bangkok (return) [1n] · flights (16 nights, 4 regions);
France = flight · Paris [6n, €1,165 est] · TGV · Provence [Avignon 7n, €1,087 est] · flight. No splits, no loose
stays.

## M5 verification (done 2026-10-13)

- **Gap logic** (pure `buildTripTree`): demo → one gap "4 nights · 18 → 22 Nov" before the planned
  "Bangkok (return)"; a Thailand-prod-shaped fixture → exactly one gap 12 → 16 Dec (the 29 → 30 Nov
  night train is covered, not a gap); a gap between two stays of the same region sits inside it; a stay with
  no check-out claims no gap after it.
- **Demo-mode UI** (`wrangler pages dev public --binding DEMO_API=1`, headless Chrome over CDP at 390 px,
  light + dark, reduced motion): all four depths render as designed. Toggling keeps scroll at 0 → 0; state
  survives a reload (depth + a per-region override); every `aria-controls` target exists; `aria-pressed`
  tracks the depth; **no visible tap target < 44 px**; no horizontal scroll; the strip's Krabi segment
  switches Trip → Regions, opens Krabi and focuses its toggle; no JS errors. Every other view that reads
  `loadTrip` (step + activity detail with nested activities, Budget, Map, Packing, Trash) renders with no
  errors. One bug found and fixed in the process: the `.loc` list-item rule also matched the
  `.marker.loc` span (it overrode `position:absolute`); scoped to `li.loc`.
- **Static:** `node --check` (core, mock, app); `node scripts/validate-data.mjs` ✓.
- **Density pass** (owner, before merge: "use screen space efficiently"): no hint paragraph in the hierarchy view;
  full-width Show chips with no label row; slimmer region headers (title `--text-lg`, tighter padding);
  **one-line** travel legs at the Regions/Locations depths (ellipsised title, no wrapped chevron row); no
  inserter before the first item of a region/place (same slot as its header). Regions view of the demo trip
  ≈ 1 phone screen (was ≈ 1.5). Interaction checks re-run: unchanged, no tap target < 44 px, no JS errors.

## Outcome

*(to be written when the effort ships)*

## Later changes

*(append-only, newest last — none yet)*
