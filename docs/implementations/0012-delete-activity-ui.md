# 0012 — Delete an activity from the UI

> **Status:** ✅ Shipped 2026-07-10 (PR #43). Small missing-affordance fix. Front-end + docs only — no
> schema/migration/worker/core change. See [`README.md`](README.md) for the index.

## Context

Live feedback: **an activity ("action") can't be deleted from the UI.** The backend has supported it all
along — `deleteActivity` in `shared/core.js`, the API `DELETE /api/activities/<slug>/activities/<id>`
([functions/api/activities/[[path]].js:45-54](../../functions/api/activities/[[path]].js#L45-L54)),
the MCP `delete_activity` tool, and the **Trash** view already lists deleted activities
([public/app.js:1123-1126](../../public/app.js#L1123-L1126)). Only the **front-end affordance** was
missing: a step can be deleted from its detail ("Delete step", 0008) but an activity had no delete
button anywhere. Steps already model the pattern (`bindStepDelete`, `data-act="step-del"`).

## Decision

| Topic | Decision |
|---|---|
| Where | Two entry points, mirroring how steps behave. (1) A small **trash button on each activity card** in a step's detail list (`activityCardHTML`) — the direct "delete an action from a step". (2) A **"Delete activity" danger button** in the activity detail view (`viewActivity`), matching "Delete step" in the step detail. |
| Behavior | Soft-delete (→ Trash, restorable) via the existing API. Confirm dialog like `bindStepDelete`. One delegated handler `bindActivityDelete` (`data-act="activity-del"`). After delete: from the **activity detail** → navigate to the parent step (or trip root if unassigned); from the **step list** → re-render in place (`vt(route)`) so the row disappears. |
| Reuse | No new backend. Pure front-end: `activityCardHTML`, `viewActivity`, a `bindActivityDelete` sibling of `bindStepDelete`, and one `.act-del` CSS rule. |

## What shipped (`public/app.js`, `public/styles.css`)

- `activityCardHTML`: a `.act-del` trash button (`data-act="activity-del"`, `data-slug/-id/-step`) in `.act-head`.
- `viewActivity`: a `.detail-danger` "Delete activity" button appended after the photos section.
- `bindActivityDelete()` (wired in `boot`): confirm → `DELETE` → `invalidateTrip` → navigate-or-rerender.
- `styles.css`: `.act-del` (subtle icon button, ≥44px hit area, danger on hover).

## Verification

- **Static:** `node --check public/app.js`; `node scripts/validate-data.mjs`.
- **e2e (local D1):** `wrangler pages dev public` on a seeded local DB → create an activity via the API,
  `DELETE` it, confirm it drops from the live list and appears in the activities `/trash` list, and
  `restore` brings it back.
- **UI:** open a stay → delete an activity from the list (row disappears); open an activity → "Delete
  activity" returns to the step; both land in Trash and restore.

## Outcome

Shipped via PR #43 (front-end + docs only; Pages deploy on merge, no migration/worker). Verified: an
activity can now be deleted from a stay's activity list (trash button per card) and from the activity
detail ("Delete activity"). Backend round-trip proven on a local D1 — create → `DELETE` (soft) → drops
from the live list, appears in the activities `/trash` list → `restore` → back; `purge` empties it.
`node --check` + `validate-data` green. The UI wiring mirrors the shipped `bindStepDelete` pattern.
