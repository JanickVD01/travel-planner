# Travel Planner — Feature-Expansion Implementation Plan

## Context

Phases 0–1 of the UI roadmap are done: `DESIGN.md` (the brand/taste contract, PR #5) and three
throwaway mockup directions (PR #6). The user reviewed them on their phone and decided:

- **Direction C "Transit Line" wins** (metro/route-schematic look), **but calmer** — the mockups
  showed "too much information at first sight," so the real product must use **progressive
  disclosure** (compact cards, detail-on-tap).
- Plus a concrete feature set that **extends** the prior spec (`travel-planner-requirements.md`):
  separate pages, screenshot uploads, structured coordinates, activity notes, soft-delete/trash,
  and a **packing list** replacing the to-do checklist.

**This plan** turns that into an executable train of small PRs that builds the *real* product on the
existing $0 scaffold, in the new skin. **Outcome:** a shared, mobile-first Thailand trip planner —
a metro-style **Timeline**, a **Budget** page, a **Packing** page, per-step/activity **screenshots**
and **map links**, **activity notes**, and **trash/restore** — all editable in the browser (light
edits) and by talking to Claude via MCP (primary add/reorder), staying **$0 forever, no payment
method**.

## Implementation history (new repo convention)

All implementation work — this one and every future effort — is recorded in a new committed folder
**`docs/implementations/`**, so the project carries its own history of what we built and why. Each
implementation is one numbered markdown record; the folder's `README.md` is the index.

```
docs/implementations/
  README.md                     # index: ordinal · title · date · status · PRs
  0001-ui-design-brief.md       # Phase 0 — DESIGN.md brand/taste contract      (shipped, PR #5)
  0002-design-directions.md     # Phase 1 — 3 mockups; Direction C chosen        (PR #6, throwaway)
  0003-feature-expansion.md     # THIS plan — the 12-milestone build             (in progress)
```

- **Records `0001`/`0002` are short retrospectives** (context → what was decided/built → outcome →
  links) of the design work already done this project. **`0003` is the full text of this plan.**
- **Convention going forward:** every distinct implementation gets the next `NNNN-slug.md` record;
  its **Status** in the README index is updated as its milestones ship (e.g. per-PR ticks). A new,
  separate effort later becomes `0004-…`, and so on.
- `CLAUDE.md`'s data map gains a pointer to `docs/implementations/` so future sessions discover it.
- This is created in **M1** below; the plan-mode working file
  (`~/.claude/plans/alright-here-is-my-lovely-creek.md`) is just the draft — `docs/implementations/
  0003-feature-expansion.md` is the canonical, committed copy.

## Locked decisions (this session)

| Topic | Decision |
|---|---|
| Visual direction | **Direction C "Transit Line"**, simplified for calm / progressive disclosure |
| Page model | **Separate client-rendered views** (Timeline / Budget / Packing / Activity detail / Trash) in the hash router, animated with the **same-document View Transitions API** (feature-detected, reduced-motion-guarded) — *not* separate HTML documents |
| Packing | Replaces the to-do checklist. Items are **shared or individual** (assigned to a person), each with a **packed** checkbox; **filter by owner** (Mine / Partner / Shared / All); optional category + quantity |
| Coordinates | **One central coordinate per step** (links to a region) + **one per activity**; set via MCP; rendered as an **"Open in Maps" link-out** (OSM/Google) |
| Screenshots | **Multiple images per step OR activity**, each captioned; uploader auto-recorded; stored in **Workers KV** (bytes) + D1 (metadata); **web-UI upload only** |
| Booking status | On **both** steps and activities (`Idea\|Planned\|Booked\|Confirmed`), shown as a chip. **No separate "to book" view** — inline chips only |
| Delete | **Soft-delete + Trash** (restore + delete-forever) for steps, activities, packing, attachments |
| Web edits | `cost_actual` + a light-edit whitelist editable inline; add/reorder steps stay MCP-only |

## Architecture decisions (with the why)

- **Image storage → Workers KV, not R2.** R2 requires a payment method even for its free tier
  (violates the hard "$0 / never attach a card" rule); base64-in-D1 is capped at 2 MB/row (too small
  for screenshots). **KV is card-free, holds raw bytes ≤ 25 MiB, 1 GB free.** Bytes live in KV under
  key `att/<slug>/<attachment_id>`; a metadata row lives in D1. Upload/serve via a Pages Function.
- **Maps → link-out** to `openstreetmap.org` / `google.com/maps` from `lat`/`lng`. Zero JS, no API
  key, no CSP relaxation, opens the phone's native map app. (Leaflet+OSM is a possible later add.)
- **"Separate pages" → SPA views** rendered by the existing hash router, wrapped in
  `document.startViewTransition()`. Cross-document transitions are unnecessary and would fight the
  no-build SPA + CSP.
- **Soft-delete with NO migration.** Every new entity is a **brand-new table**, so the `deleted`
  column is included in `CREATE TABLE` from the start and the generic soft-delete engine lands with
  the first `core.js` change. **Result: `migration none` across the entire train** — there is no
  `ALTER`, so the "migrate-before-merge" risk is eliminated. (`entries` is left untouched and keeps
  hard-delete.)
- **Invariant preserved:** all business logic stays in `shared/core.js`; the Pages API and the MCP
  worker remain thin wrappers over the same functions; the UI calls `/api/budget` for authoritative
  money math (never reimplements it). Binary I/O in the upload route is the one documented exception
  (metadata validation still lives in core).

---

## Data model (all new tables; `shared/core.js` + `schema.sql`)

**New cleaners** (add to `shared/core.js`, mirroring `cleanDate`/`cleanStatus` at `core.js:35-36`):
`cleanNumber`, `cleanMoney` (≥0), `cleanQty` (int ≥1), `cleanLat`/`cleanLng` (bounded), `cleanKind`
(travel|stay), `cleanBooking` (`BOOKINGS=[Idea,Planned,Booked,Confirmed]`), `cleanCcy`/`cleanHomeCcy`
(THB|EUR), `cleanTransport`, `cleanYesNo`, `cleanBool` (packed `'1'`/`'0'`), `cleanTime`, `cleanSlug`,
`cleanOwner` (`'shared'` | lowercased email), `cleanParentType` (step|activity), `cleanContentType`
(image/* whitelist → null rejects upstream).

Every content table also carries the engine columns `sort_order`, `created_by/at`, `updated_by/at`,
and **`deleted TEXT`** (ISO timestamp; NULL = live). `created_by` is the auto-recorded actor/uploader.
`deleted` is **not** a `cols` entry (so create/patch never touch it); it is driven only by
delete/restore/purge.

| Entity | space / list / idCol / prefix | Key columns (cleaner) |
|---|---|---|
| **trips** | `app` / `trips` / `trip_id` / `tp` | `title`, `slug`(cleanSlug), `home_ccy`(cleanHomeCcy), `thb_per_eur`(cleanNumber, null), `budget_target_eur`(cleanMoney, null), `start_date`/`end_date`(cleanDate, null), `note`(null) |
| **steps** | `<slug>` / `flow` / `step_id` / `st` | `kind`(cleanKind), `title`, `location`, `map_url`(null), **`lat`(cleanLat,null)**, **`lng`(cleanLng,null)**, `arrive`/`arrive_time`, `depart`/`depart_time`, `accom_name`(null), `transport`(cleanTransport,null), `carrier`(null), `cost_est`/`cost_actual`(cleanMoney,null), `cost_ccy`(cleanCcy), `booking_status`(cleanBooking), `booking_url`(null), `note`(null) |
| **activities** | `<slug>` / `activities` / `activity_id` / `ac` | `step_id`, `title`, `location`(null), `map_url`(null), **`lat`/`lng`**, `day`(cleanDate,null), `needs_advance`(cleanYesNo), `cost_est`/`cost_actual`(cleanMoney,null), `cost_ccy`(cleanCcy), `booking_status`(cleanBooking), `booking_url`(null), `note`(null — the **detail notes** field; TEXT is unbounded) |
| **attachments** | `<slug>` / `attachments` / `attachment_id` / `at` | `parent_type`(cleanParentType), `parent_id`, `kv_key`, `caption`(null), `content_type`(cleanContentType), `size`(cleanQty,null); uploader = `created_by` |
| **packing** | `<slug>` / `packing` / `packing_id` / `pk` | `title`, `owner`(cleanOwner: `'shared'`\|email), `packed`(cleanBool), `category`(null), `qty`(cleanQty,null), `note`(null) |

Indexes: `idx_<x> (space,list,sort_order)` per table, plus `idx_activities_step (space,list,step_id,
sort_order)` and `idx_attachments_parent (space,list,parent_type,parent_id,sort_order)`. Each table
gets a copied `<x>_audit` (from `schema.sql:26`). `entries` + `entries_audit` stay as-is (the MCP
smoke test depends on them).

**Engine changes in `shared/core.js`** (generic, land in M3):
- `mapRow` (`core.js:61`) also surfaces `created_by/at`, `updated_by/at`, and `deleted` (additive to
  the wire shape; existing `entries` consumers ignore the new keys).
- Soft-delete via a per-spec `soft:true` flag: `flatList` (`core.js:68`) gains a `trash` arg →
  `... AND deleted IS NULL` (live) or `AND deleted IS NOT NULL` (trash); `flatDelete` (`core.js:103`)
  becomes an `UPDATE … SET deleted=?` **and snapshots the full row into the audit `detail`** (today
  it writes `detail=null`, unrecoverable); new `flatRestore` (clears `deleted`), `flatPurge` (the old
  hard `DELETE` + snapshot, and for `kv:true` specs also `env.IMAGES_KV.delete(kv_key)` after the D1
  batch). `flatPatch` existence check gains `AND deleted IS NULL`. `entries` (no `soft`) keeps hard delete.
- Composite **pure** functions: `toEur(amt,ccy,rate)`, `computeBudget(rate,target,steps,activities)`
  (throws `422 no_rate` before any division), `getBudget(env,{space},actor)`, `tripOverview(...)`
  (steps in order + activities grouped by `step_id` with an **"Unassigned"** bucket for orphans, each
  amount pre-converted, each row carrying a `maps_url` from lat/lng), `attachmentKey(slug,id)`,
  `setBooking`/`setCoordinate` routers (step|activity), `filterPacking(rows,actor,scope)`,
  `purgeStepDeep` (cascade a step's activities + their KV bytes in one atomic D1 batch).

---

## Milestone / PR train

**Housekeeping first:** merge **PR #5** (`content/design-brief`, DESIGN.md) to `main`; **close PR #6**
(`code/design-directions`, throwaway mockups) **unmerged** — those pages never enter `main`.

Every PR: one `code/*` or `content/*` branch, pushed via `scripts/pr-safe-push.sh`, four-line
description (`what/why` · `What's New? y/n` · `migration none` · `worker redeploy? y/n`), CI `validate`
+ demo preview, phone review, merge-commit. `worker redeploy? = y` whenever `shared/**` or
`worker-mcp/**` changes. **Every new `/api/*` route ships its `_mock.js` branch in the same PR.**

| # | Branch | Lands | Dep | Worker |
|---|---|---|---|---|
| **M1** | `content/plan-of-record` | Create **`docs/implementations/`** (README index + records `0001`/`0002` retrospectives + `0003` = this full plan) + commit the untracked spec docs; DESIGN.md **decision log** records Direction C + pinned fonts/palette + feature decisions; `CLAUDE.md` data map points to the folder | — | n |
| **M2** | `code/design-foundation` | `public/tokens.css` (two-tier OKLCH, **light-primary** warm C palette), vendor fonts→`public/fonts/` + `public/vendor/anime.min.js`, restyle shell to the C skin, add `vt()`/`motion()` helpers, flip theme-boot default to light, home-screen meta | M1 | n |
| **M3** | `code/trips-steps-timeline` | cleaners + **soft-delete engine** + `trips`/`steps` specs+wrappers + schema tables + routes + `_mock` Thailand seed + MCP (`get/set_trip`, `list/add/edit_step`, `add_stay`/`add_travel`) + Home cards + **read-only metro Timeline** (compact) | M2 | **y** |
| **M4** | `code/inline-edit` | `editable()` + one delegated PATCH listener + `vt()` route nav; wire `cost_actual` → **the Phase-1 "done" criterion** | M3 | n |
| **M5** | `code/activities` | `activities` spec (+coords) + `tripOverview` + `/api/overview` + `_mock` + MCP (activities CRUD, `reorder/move_step`, `set_booking`, `set_coordinate`, `get_trip_overview`) + nested activity sub-cards (progressive disclosure) | M4 | **y** |
| **M6** | `code/activity-detail` | Activity detail view (`#/trip/<slug>/activity/<id>`, bottom-sheet on mobile) — editable **notes**, own map link, status; extend `editable()` whitelist | M5 | n |
| **M7** | `code/budget` | `computeBudget`/`getBudget` + `/api/budget` + `_mock` + MCP `get_budget`; **Budget page** (CSS meter red past 100%, category bars, per-step list); in-situ `thb_per_eur`/`budget_target`/cost edits; sub-nav goes live | M5 | **y** |
| **M8** | `code/packing` | `packing` spec + routes + `_mock` + MCP; **Packing page** — packed checkbox, **owner filter chips** (Mine/Partner/Shared/All), category/qty, browser add/check/edit | M7 | **y** |
| **M9** | `code/attachments` | **KV namespace + production-only binding**; `attachments` spec + `/api/image` upload+serve route (demo-guarded) + binary `_mock` branch + MCP metadata tools; **upload UI + gallery** on step/activity detail | M6 | **y** |
| **M10** | `code/trash` | **Trash view** (`#/trip/<slug>/trash`): soft-deleted steps/activities (+packing/attachments) with Restore + Delete-forever; wire restore/purge route verbs + `purgeStepDeep` + MCP `restore_*`/`purge_*`/`delete_step_deep` (engine already soft since M3 → **no migration**) | M5, M9 | **y** |
| **M11** | `code/harden-csp` | `public/_headers`: CSP (`default-src 'self'`; `img-src 'self' data: blob:`; …) + `nosniff`/Referrer-Policy + immutable cache for `/fonts` `/vendor` `/assets`. **LAST** — externalize the theme-boot script (or hash it); set dynamic bar widths via `element.style` (not inline `style="…"`) so `style-src 'self'` holds | ALL | n |
| **M12** | `content/release-notes` | `releases.json` + wiki topic + `MEMORY.md` journal | M11 | n |

**Thin end-to-end slice = M3 + M4.** Its "done" (the locked acceptance): *"Claude adds a stay from
the phone; it appears on the browser timeline; I edit its actual cost inline; it persists."*

Roadmap mapping: Phase 2 (design) = housekeeping + M1; Phase 3 (foundation) = M2; Phase 5 (build) =
M3–M10; Phase 6 (hardening) = M11–M12.

### Per-milestone detail (scope + end-to-end verification)

- **M1 — plan of record.** Create `docs/implementations/` with `README.md` (index table) + the three
  records (`0001`/`0002` short retrospectives, `0003` = this plan verbatim); commit the untracked spec
  docs (`travel-planner-requirements.md`, `next-session-prompt.md`); update DESIGN.md's decision log
  (Direction C won; pin fonts = Space Grotesk / Instrument Sans / Spline Sans Mono + the warm coral C
  palette; note the packing/maps/uploads/soft-delete/no-to-book decisions); add a `CLAUDE.md` data-map
  row pointing at `docs/implementations/`. *Verify:* `node scripts/validate-data.mjs` green; docs render
  on GitHub. Content-only, no runtime impact. Extract Direction C's `:root`/`[data-theme=dark]` into `public/tokens.css`
  (linked before `styles.css`); move the mockup fonts to `public/fonts/` + OFL; vendor
  `anime.min.js` locally (never a CDN — CSP needs `script-src 'self'`); restyle topbar/nav/`.panel`/
  `.card` onto tokens; add `vt(render)` (feature-detect + reduced-motion) and a `motion()` anime
  wrapper; **flip the theme-boot default to light** (per DESIGN.md §3). *Verify:* `wrangler pages dev
  public` renders the warm C shell, theme toggle flips both ways, fonts load from `'self'`, reduced-
  motion kills animation; phone preview is calm/legible; `validate-data.mjs` green.
- **M3 — trips/steps + timeline (read).** *Verify:* seed local D1 (`thb_per_eur=39`, target); `add_stay`
  via `npm run smoke`/MCP appears in `GET /api/steps/<slug>/flow` and on the timeline; phone preview
  renders the seeded metro timeline from `_mock.js`; existing `entries` smoke still passes.
- **M4 — inline edit (write).** `editable(value,{entity,list,id,field,ccy})` → click target with
  `data-*`; one delegated listener → `<input inputmode="decimal">`/`<select>`, commit on blur/change →
  `PATCH` → `invalidateTrip` → re-render in `vt()`. *Verify:* the locked criterion end-to-end against
  local D1; audit row shows actor + change; preview shows the demo banner and does not persist.
- **M5 — activities.** *Verify:* `add_activity` (MCP) nests under the right stay; `/api/overview` ==
  MCP `get_trip_overview`; an orphan `step_id` renders under **Unassigned**, never dropped.
- **M6 — activity detail.** *Verify:* tap sub-card → detail morphs in via `vt()`; edit notes → persists;
  back restores timeline scroll.
- **M7 — budget.** *Verify:* `GET /api/budget` gives `1560 THB → €40.00`, EUR passes through, totals per
  spec §7; flip the rate → live re-conversion; **extend `smoke.mjs` to assert MCP `get_budget` ==
  `/api/budget`** (parity); meter turns red > 100% on a phone.
- **M8 — packing.** *Verify:* add a "Mine" item in the browser → persists; filter chips narrow the list;
  toggle packed; an MCP-added item appears after `invalidateTrip`.
- **M9 — attachments.** *Verify:* `wrangler pages dev` with a local KV binding → upload from the phone
  camera roll → thumbnail → full view → delete; preview renders the mock gallery (a bundled
  placeholder/`data:`), never 500; confirm the upload route refuses to touch KV when `!env.DB ||
  !env.IMAGES_KV` (preview safety).
- **M10 — trash.** *Verify:* delete hides from timeline, Trash lists it, Restore returns it, Delete-
  forever purges it (and its KV bytes); `delete_step_deep` cascades children; each op audited.
- **M11 — CSP.** *Verify:* two-device pass with DevTools showing **zero CSP violations** while timeline
  motion, KV images, map link-outs, inline edits, and uploads all work. Ship report-only first if unsure.

---

## Client architecture (`public/app.js`)

**Routes** (introduce an explicit `trip` prefix; retire the placeholder `parts.length>=2 → viewList`):
`#/` (Home cards), `#/whats-new`, `#/wiki/<slug>` (keep), `#/trip/<slug>` (Timeline, default),
`#/trip/<slug>/budget`, `#/trip/<slug>/packing`, `#/trip/<slug>/activity/<id>`, `#/trip/<slug>/trash`.

- **View Transitions:** `route()` resolves a view fn, renders through `vt(render)` =
  `document.startViewTransition(render)` when supported and motion allowed, else calls `render()`
  directly. Card→detail morph uses a unique `view-transition-name` on the tapped sub-card + detail
  header, cleared after.
- **Per-trip sub-nav:** sticky chip-tab row (Timeline / Budget / Packing), `aria-current` on active,
  ≥44px targets, `env(safe-area-inset)` padding. Tabs appear as their milestones land — the app is
  shippable at every step (unbuilt routes fall back to Home).
- **Per-trip cache:** `state.trip[slug] = {trip, steps, activities, packing, attachments, budget}`,
  filled from `/api/overview/<slug>` (+ `/api/budget` lazily). Tab-switching is instant. Every
  successful write → `invalidateTrip(slug)` → re-render in `vt()`. `api()` stays uncached.
- **`editable()`** + one delegated listener: money uses `inputmode="decimal"` (not `type=number`),
  commit on blur/change; whitelist = `cost_est/cost_actual/cost_ccy/booking_status/booking_url/note`
  on steps & activities, `thb_per_eur`/`budget_target_eur` on the budget page, packing fields on the
  packing page. Title/kind/dates/location and add/reorder stay MCP-only.
- **Progressive disclosure (the "calmer" mandate):** Timeline cards are compact by default — title,
  `arrive→depart`, one map link, one status chip, one dual-currency cost line; activities show a count
  + top item, the rest reveal on tap; full detail (notes, attachments, own map) lives on the Activity
  detail route. Nothing secondary is on screen at first glance.

---

## Verification strategy

- **Per-PR:** `node scripts/validate-data.mjs` (CI-required); demo preview reviewed **on a phone**
  (Android Chrome + iOS Safari); local real path via `wrangler pages dev public --d1 DB=... --binding
  DEV_EMAIL=...` on a seeded local D1.
- **MCP == API parity:** `cd worker-mcp && npm run dev && npm run smoke`; extend the smoke to assert
  `get_budget` equals `/api/budget` (same `getBudget` ⇒ no divergence).
- **Two-device pass** at M4, M7, M9, M11: `inputmode` keypads, commit-on-blur, ≥44px targets, camera-
  roll upload, View-Transition morphs, safe-area sticky nav; have the 2nd user run an MCP edit from
  the Claude mobile app and confirm it shows in the other's browser (proves shared access + last-write
  -wins + audit attribution).
- **Preview safety (every PR that adds a route):** the route has a `_mock.js` branch; previews have no
  `DB`/`KV` binding and serve the mock; the `/api/image` route hard-guards `!env.DB || !env.IMAGES_KV`.
- **CSP last (M11):** written only once every origin is known; verify zero console violations on both
  phones while exercising edits, uploads, maps, and motion.

## Key risks (flat-model limits) & mitigations

- **No cascade:** soft-deleting a step orphans its activities → live reads hide the step;
  `tripOverview` shows orphans under **"Unassigned"** (never dropped); `delete_step` warns if children
  exist; `purgeStepDeep` cascades on hard-delete (children + KV bytes, one atomic D1 batch).
- **KV orphan bytes:** upload writes **KV then D1**; purge deletes **D1 batch then KV** → a served-404
  metadata row never happens; only invisible orphan bytes, rare, bounded by a **5 MiB per-file cap** +
  two-user volume (well inside 1 GB / 1000 writes-day).
- **Preview KV-leak:** KV binding lives only in the `production` env of `wrangler.jsonc` (never
  `preview`); the demo switch keys off `!env.DB`; the upload route also self-guards.
- **`flatSeed` "previously seeded" guard** (`core.js:116`): a non-empty audit blocks reseed — desired
  ("deleted rows stay deleted"); after clearing a list, add fresh rows via create, don't reseed.
- **Per-item packed** (not per-person): a shared item has one checkbox; `updated_by` records who
  toggled. Per-person state is out of scope (would need a join table the flat model can't express).
- **Half-set coordinate:** `set_coordinate` always sets both `lat`+`lng`; `maps_url` is emitted only
  when both are non-null (else falls back to `map_url`).

## Critical files

- `docs/implementations/` — **new** committed history folder (README index + `0001`–`0003` records);
  `0003-feature-expansion.md` is the canonical copy of this plan.
- `shared/core.js` — cleaners, the 5 new `FLAT_SPECS`, the soft-delete engine (`flatList` trash flag,
  `flatDelete`/`flatRestore`/`flatPurge`), `mapRow` extension, and the pure composites
  (`computeBudget`/`getBudget`/`tripOverview`/`setBooking`/`setCoordinate`/`purgeStepDeep`/`attachmentKey`).
- `schema.sql` — 5 new tables + `_audit` + indexes (idempotent; **no `migrations/NNN`**).
- `functions/api/<entity>/[[path]].js` — copy `entries/[[path]].js` per entity (+`overview`,`budget`);
  `functions/api/image/[[path]].js` — the KV upload+serve route (demo-guarded).
- `functions/api/_mock.js` — a demo Thailand seed + a branch per new route incl. the binary image `Response`.
- `worker-mcp/src/mcp.js` — the ~30 thin `registerTool` wrappers; KV binding added to `wrangler.jsonc`
  (production env only) and `worker-mcp/wrangler.jsonc`.
- `public/app.js` / `public/tokens.css` / `public/styles.css` / `public/index.html` — router + `vt()`,
  per-trip cache + `invalidateTrip`, `editable()`, all views, the C skin.

## What NOT to do

- No `ALTER` migrations (everything is new tables); never attach a payment method (KV, not R2); never
  push `main` / `--force`; never give a preview a `DB` or `KV` binding.
- Don't duplicate business logic into a route or the UI — money math comes from `/api/budget`.
- Don't merge `public/design/**` mockups to `main`; don't bundle the CSP into any earlier PR.
- Keep each core change and its MCP tools in the **same** PR (avoid a UI/Claude skew window).
