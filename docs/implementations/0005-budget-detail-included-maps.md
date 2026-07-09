# 0005 — Budget depth, step detail, included-costs, map links & doc reconciliation

> **Status:** 🚧 In progress (started 2026-07-09). One numbered record per effort — see
> [`README.md`](README.md) for the index. Updated in place as each milestone PR merges.

## Context

After living with the shipped app (0003 + 0004), the user found the budget page shallow, the timeline
missing a per-step detail view, no way to mark a cost as "already covered by another ticket," and the
coordinate model awkward. They also flagged that a lot of project docs are still **generic scaffold
text** from `ai-first_project_initialisation.md` (README, CLAUDE.md, the empty GitHub About) and never
caught up to the fact that this is now a real Travel Planner. Finally, they asked for a **standing
convention**: every effort ends by re-aligning the "glue" docs with the decisions actually shipped.

**Outcome:** a Budget page that splits *estimated vs actual* "where it goes" and shows *cost per person*;
clickable **step/stay detail pages**; an **"included in another ticket"** toggle that hides a cost and
drops it from the budget; **Google-Maps-URL-first** locations; and a project whose docs finally describe
the travel planner it has become.

## The Reconciliation convention (new, standing)

**Every effort's final milestone is a Reconciliation pass.** Before an effort is marked shipped, bring
the "glue" artifacts in line with the decisions that landed: `CLAUDE.md`, `DESIGN.md`, the `MEMORY`
journal, `README.md`, `public/data/app.json`, this `docs/implementations/` record + index, and the
**GitHub About** (description/topics/homepage). This keeps the project's self-description true after each
approved+built change, instead of drifting back toward the generic scaffold. Future plans (0006+) must
include this as their last milestone.

## Locked decisions

| Topic | Decision |
|---|---|
| Included-cost flag | **Plain on/off toggle** (`included` boolean) on **steps + activities**. On → cost hidden on card + detail (small "included" chip) and the row is excluded from all budget math. No caption field. |
| Budget "where it goes" | **Estimated / Actual toggle**; core returns both `byCategory` (est) + `byCategoryActual`; client toggles with no re-query. |
| Budget insights | New **"Budget Insights"** block with **cost per person**, `PEOPLE = 2` constant (future-configurable via a `travellers` field). Per-person for est / actual / projected. |
| Coordinates | **`map_url` primary, lat/lng legacy fallback.** New writes store a Google Maps URL (researched place link, or coord-derived best estimate); lat/lng columns kept so existing rows still resolve. Non-destructive. |
| France data | **Research + set real Google Maps place links** for the ~13 France steps/activities via a one-off CI update. |
| Delivery | One `code/*` or `content/*` branch per milestone, `pr-safe-push.sh`, 4-line PR desc, CI `validate`, merge-commit; auto-merge once `validate` passes. |

## Milestone / PR train

| # | Branch | Lands | Dep | Worker | Status |
|---|---|---|---|---|---|
| M1 | `content/plan-0005` | This record + README index row + the Reconciliation convention | — | n | 🚧 |
| M2 | `code/budget-engine` | Migration `001_included` (ALTER, prod-first) + `included` on both specs + `setIncluded` + `computeBudget` (exclude included, `byCategoryActual`, per-person); MCP `included` + `set_included` | — | y | ⏳ |
| M3 | `code/step-detail` | `#/trip/<slug>/step/<id>` + `viewStep` + linked step titles + `included` toggle + hide-cost-when-included | M2 | n | ⏳ |
| M4 | `code/budget-ui` | Estimated/Actual toggle + "Budget Insights" cost-per-person | M2 | n | ⏳ |
| M5 | `code/maps-primary` | Flip 3 `mapsUrl` mirrors to `map_url`-first + `cleanMapUrl` + MCP `set_map_url` + wizard stores `map_url` + seed `map_url` | — | y | ⏳ |
| M5-ops | *throwaway CI branch* | Real Google Maps place links for France (`UPDATE`) | M5 | — | ⏳ |
| M6 | `code/reconcile-0005` | Reconciliation pass + `releases.json` v0.5.0 + README ✅ + MEMORY + GitHub About | ALL | y | ⏳ |

Status legend: ✅ shipped · 🚧 in progress · ⏳ pending.

## Per-milestone detail

### M2 — budget engine + `included` (the only migration)
- `migrations/001_included.sql`: `ALTER TABLE steps ADD COLUMN included TEXT NOT NULL DEFAULT '0';` (+ activities). **Applied to prod via CI before merge** (else `createStep` INSERT 500s); mirrored into `schema.sql` CREATE blocks (copy the `packed` line).
- `shared/core.js`: `{ name:"included", clean:cleanBool }` on `FLAT_SPECS.steps`/`.activities`; `setIncluded` router (mirrors `setBooking`); `computeBudget` guard `if (row.included === "1") return;` at the top of `acc`; parallel actual category accumulators → `byCategoryActual`; `PEOPLE=2` → `perPersonEst/Actual/Projected`. `tripOverview` zeroes `eur` for included rows.
- `worker-mcp/src/mcp.js`: `included` in `STEP_FIELDS`/`ACTIVITY_FIELDS` + a `set_included` tool.

### M3 — step detail (+ included UI)
- Route + `viewStep(slug,id)` modelled on `viewActivity`; stay → info + nested activities (`activityCardHTML`); travel → leg details; reuse `attachmentsHTML("step",…)` + `vtName` morph.
- Link the step-card titles; add the `included` toggle to step + activity detail; gate `costHTML` on the card + detail when `included==="1"` (show an "included" chip).

### M4 — budget UI
- Estimated/Actual toggle by the "Where it goes" heading (consume `byCategory` / `byCategoryActual`); new "Budget Insights" block with per-person (est/actual/projected) from the core fields.

### M5 — maps `map_url`-primary
- Flip all three `mapsUrl`/`rowMapsUrl` mirrors → `safeUrl(map_url)` first, coord-derived fallback; fix the stale "OSM" comment; add `cleanMapUrl` (http(s)-only); wizard stores the pasted link into `map_url`; seed `map_url` in `_mock.js`; MCP `set_map_url` (keep `set_coordinate` as the estimate path).
- **M5-ops:** throwaway CI branch `UPDATE`s real Google Maps place URLs for `space='france-2026'`.

### M6 — Reconciliation pass
README rewrite; CLAUDE.md (drop placeholder Status, fix data map / scoping / MCP examples, document `included` + `map_url`-primary + migrations-in-play + this convention); `core.js` header demote `entries`; `app.json` (drop `lists[]`, add tagline); DESIGN.md status refresh; remove stray `DESIGNv0.1.md` + dangling wiki mentions; `releases.json` v0.5.0; README index ✅ + this Outcome; MEMORY update; `gh repo edit` About.

## Verification

- Per-PR `node scripts/validate-data.mjs` + phone preview.
- Migration confirmed on prod before M2 merge; `schema.sql` mirrors it.
- `GET /api/budget/<slug>` returns `byCategoryActual` + per-person; an `included` row vanishes from every total/category.
- Adversarial review workflow over the 0005 client+core diff before the final merge.

## Outcome

_(filled in at M6 as milestones land.)_
