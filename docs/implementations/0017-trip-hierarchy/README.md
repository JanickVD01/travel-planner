# 0017 — Trip hierarchy timeline (Trip › Region › Location › Step)

> **Status:** 🚧 In progress — M1 ✅ + M2 ✅ (2026-10-13, PR #51). Migration 003 applied to prod D1 via the
> `migrate` workflow before merge (run 38371496790: 5 queries, success). M3 ✅ (PR #52). M4 ✅ (prod
> backfill of Thailand + France, owner-confirmed). M5 ✅ (PR 3, `code/trip-hierarchy-timeline`) + an M5 follow-up fix (`code/fix-tree-link-clicks`, see *M5 follow-up*) + owner feedback fixes (`code/feedback-quick-fixes`, see *Owner feedback fixes*). M6 ✅ (`code/trip-hierarchy-editing`, see *M6 verification*), M7 pending. This record carries the full milestone plan and is **updated in place** as
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
| UX | **Collapsible nested list** (owner's choice) on the existing metro rail: region headers and location rows expand/collapse in place. An **"Expand to"** control (Trip · Regions · Locations · Steps) sets every group to one depth in a tap — the four zoom views the owner asked for. **Trip** depth = a summary (total nights, regions, stays, dates) + a strip of regions sized by nights. *Revised in M6 (owner feedback):* the summary + strip show at every depth, so the **Trip chip is dropped** (it read as an empty page) — Show: Regions · Locations · Steps, plus **Expand all / Collapse all** on the same row. A trip with no regions renders exactly as today. |
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
| 4 `code/trip-hierarchy-editing` | **M6 — Editing**: region sheet `#/trip/<slug>/region/<id>` (edit, member list, move earlier/later, delete), opened from a "›" on each region header; "Add region" wizard; region picker in step detail; step-wizard region field (default: the inserter's region, else the previous step's); Trash "Regions" group; Budget "By region". **Plus owner feedback (2026-10-13):** drop the **Trip** chip (Show: Regions · Locations · Steps) and add **Expand all / Collapse all** to the chip row; **usage events** via `Analytics.capture` (`timeline_depth_set`, `tree_node_toggled`, `tree_expand_all`, `nights_strip_jump`, `step_opened`, `step_created`, `region_created` / `region_edited` / `region_moved` / `region_deleted`) — folded here from 0016 M8 — ✅ 2026-10-13 (see *M6 verification*) | none | n | y |
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

## M5 follow-up — links inside the tree were dead (2026-10-13)

Found the same morning from PostHog: in the first post-deploy replays the owner clicked a step's title and
its "›" five times with no navigation, and sent two feedback notes ("Clicking through no longer works on
the actual step within when you're on the regions view"; "Clicking on Ao Nang also doesn't seem to do
much"). **Cause:** `bindTree()` matched the Show chips with `closest("[data-depth]")`, but the tree root
`<ol id="tl-tree">` carries `data-depth` too, so *every* click inside the tree was handled as a chip click:
`preventDefault()` (no link in the tree could open — step title, "›", Maps/booking links) and
`ts.open = {}` (hand-opened regions/locations collapsed). Tapping empty card space still worked (it sets
`location.hash` in code). It hit every depth, not only Regions. **Fix:** match `.zoom-chip[data-depth]`.
Missed in M5 verification because those checks exercised toggles, chips and the strip but never clicked a
link inside the tree.

**Verification:** a headless-Chrome script on the demo trip (390 px) replaying the owner's sequence —
Regions → open a region + location → click a step title → back → Steps → click a "›" → Locations chip →
click the tree background. On `main`: the title/chevron don't navigate and the opened rows collapse. On the
fix: all pass, the opened region + location stay open after returning, the chips still set depth. (The
same PR removes the unused top-bar feedback button — see [0016](../0016-posthog-analytics/) M8.)

## M6 verification (done 2026-10-13)

**What shipped (`public/app.js`, `public/styles.css`; no backend change — M2's core + `/api/regions` already
carried every rule):**
- **Region sheet** `#/trip/<slug>/region/<id>` (a map-backdrop surface like step detail), opened from a "›"
  on each region header: editable title, planned nights, planned from/to, note; facts from the core tree
  (dates · nights · places · ≈ €) + the mismatch / split hints; **In this region** = its steps in timeline order
  (links) + "add to <region>"; **Move earlier / later** (`POST …/move` with `before_region_id` /
  `after_region_id` of the neighbouring region in timeline order; disabled at the ends); **Delete region**
  (soft-delete, confirm says its steps stay on the timeline without a region → back to the timeline).
- **Add region** wizard from an "add region" row at the end of the timeline (shown at every depth): name
  (required), planned nights, from/to, note → `POST regions/<slug>/regions` (appended at the end).
- **Region picker** in step detail (`region_id` select: "No region" + live regions; `editable` options now
  accept `value::label` so titles show while ids are stored) and a **Region** field in the step wizard
  (default: the inserter's region, else the previous step's), shown in the review.
- **Trash** gets a **Regions** group (first); purge warns that the steps stay, without a region.
- **Budget** gets **By region** bars (timeline order + "No region" when > 0) from `computeBudget.byRegion`,
  following the Estimated / Actual toggle.
- **Show** is Regions · Locations · Steps; a saved Trip depth opens at Regions. **Expand all / Collapse all**
  sits on the chip row (icon-only below 640 px, ≥ 44 px): Expand all = Steps depth, Collapse all = Regions
  depth; it offers Collapse all only when everything is open, and updates in place (focus kept).
- **Usage events** through `track()` (→ `Analytics.capture`, guarded; no-op in demo/preview), each with `trip`.

**Verification** (headless Chrome, demo trip, 1600 + 390 px, `m6-check` — 44 checks, each API write
captured and asserted, analytics stubbed to record events): the chips + a saved Trip depth; Expand/Collapse
all (depths, aria, focus, label flip after a hand-closed node); the region "›" (≥ 44 px) → sheet route,
facts, planned rows, member links, move-button states, map backdrop; title / planned-nights edits →
`PATCH regions/<slug>/regions/<id>`; Move later → `POST …/rg-demo-1/move {after_region_id: "rg-demo-2"}`;
member link → step + `step_opened{via:region}`; step picker options (`""=No region`, `rg-demo-3=Krabi`) →
`PATCH steps/…/flow/<id> {region_id}` incl. clearing; the wizard (name required) → `POST` with title +
planned nights, the new empty region appears; region inserter → wizard defaults to that region, review
shows it, the stay is created with `region_id`, `step_created{in_region, via:region_inserter}`; a plain
inserter defaults to the previous step's region; Trash Regions group first; Budget By region bars in
timeline order; tree links still navigate; every event fires; no uncaught errors. The quick-fix, menu and
tree-link suites still pass at both widths.

## Owner feedback fixes (2026-10-13)

The PostHog feedback tab collected seven notes in one session right after the M5 follow-up shipped
(11:18–11:25 UTC, desktop 1600 px); each was matched to its replay, the code, and demo-mode screenshots at
1600 and 390 px. Triage and the agreed split:

| Feedback | Cause | Where |
|---|---|---|
| "Ugly white bar behind the menu items on Packing" | the built map was never hidden off the itinerary surfaces (see [0015 *Later changes*](../0015-trip-globe/)); the sub-nav's frosted backing then stood out over it | **this PR** |
| "Clicking a region up top moves you to the first step" | `scrollIntoView` put the region header *under* the sticky top bar + sub-nav | **this PR** |
| "Timeline / Map / Budget / Packing can stick to the top" | sticky, but at `top:56px` under a 63 px bar (7 px hidden) and `top:0` on phones — fully **under** the 67 px bar | **this PR** (offsets); moving the tabs up is `code/nav-menu` |
| "The hamburger doesn't do anything" | `.side.collapsed` only hides the sidebar ≤ 720 px | `code/nav-menu` |
| "Nothing is shown at the Trip level" / "Collapse & Expand all" | Trip depth hides the whole tree by design | **M6**: drop the Trip chip; add Expand all / Collapse all to the chip row |
| "What's New is no longer populated" | newest entry is v0.7.0 (12 Jul); 0016/0017 never added theirs | `content/releases-v0.8` |
| "Highlight the trip's regions on the map" | new feature | its own effort |

Also from the replays: an uncaught `InvalidStateError: Transition was aborted… Viewport size changed` when
opening Map (prod, 11:19), and a rage click on a one-place region that needed two taps to show its stay.

**This PR (`code/feedback-quick-fixes`):**
- `#trip-map` hidden unless `body.map-bg`/`body.map-view` (Packing, Budget, Home, What's New, Trash).
- The sub-nav is frosted only while **stuck** over scrolled content (`.subnav.is-stuck`, toggled on scroll /
  view swap); at rest the pills sit straight on the page — no bar.
- `--topbar-h` is measured from the real top bar (`trackTopbar()`, ResizeObserver); `.subnav` and
  `.sheet-head` stick at it on every width (the phone `top:0` rule is gone), and
  `html { scroll-padding-top: --topbar-h + --subnav-h + 8px }` makes the strip jump (and focused inputs)
  land clear of both bars.
- `vt()` swallows the `ready` rejection of a skipped/aborted View Transition (the DOM update still runs;
  render errors still reject `finished`).
- `nodeOpen(…, parentKey)`: a region's **only** place follows a hand toggle of its region, so one tap shows
  the stay; depth chips keep their meaning (Locations depth still shows places closed).

**Verification** (headless Chrome, demo trip, 1600 + 390 px): the sub-nav sticks exactly under the bar
(63/63, 67/67); the strip jump puts the region header 8 px below the sub-nav; a one-place region opens to its
stay, a two-place region still opens to its places, Locations depth resets places to closed; the map is
hidden on Packing/Budget/Home and visible on Timeline + Map view; no tab backing at rest on Packing, frosted
once stuck on Budget and cleared again at the top; rapid route changes with motion on raise no uncaught
errors; the M5 follow-up link checks still pass.

## Outcome

*(to be written when the effort ships)*

## Later changes

*(append-only, newest last — none yet)*
