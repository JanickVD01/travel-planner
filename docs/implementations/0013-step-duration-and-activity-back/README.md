# 0013 — Timeline step duration + activity back-nav fix

> **Status:** ✅ Shipped 2026-07-10 (PR #44). Two front-end tweaks from live feedback. `public/app.js` +
> `public/styles.css` + docs only — no schema/migration/worker/core change. See [`README.md`](../README.md).

## Context

Two pieces of feedback:
1. **Back-nav bug.** Opening an activity then hitting "back" returns to the **trip home**, not to where
   the activity lives. Activities are opened from their parent **step's detail**
   ([public/app.js `activityCardHTML`](../../../public/app.js)), so back should return there. In
   `viewActivity` the `back` href is hard-coded to `#/trip/<slug>` regardless of the parent step.
2. **Duration.** Each timeline card should show **how long** you're there, so the trip is scannable at a
   glance: a **stay** → nights (from arrive→depart dates); a **travel** leg → travel time (from the
   depart/arrive date+times). Today the cards show the dates but never the span.

## Decision

| Topic | Decision |
|---|---|
| Back-nav | In `viewActivity`, compute `back` from the activity's parent step: `#/trip/<slug>/step/<step_id>` (and label the back link with the step title). If the activity is **unassigned** (its `step_id` matches no live step), fall back to the trip home. The "activity not found" branch keeps a trip-home back. |
| Duration | New pure helper `stepDuration(s)` in `app.js`: **stay** → `nightsBetween(arrive, depart)` → "N nights"; **travel** → datetime span `depart(+time) → arrive(+time)` → `fmtDur` ("2h 15m", "12h 35m", "1d 3h"). Returns "" when not computable (travel needs both date+time; stay needs both dates). |
| Placement | A small `.step-dur` pill next to the title on each timeline card (both `.leg-top` and `.step-head`); reads on the pinned-photo plate too (a `.step-card.pinned .step-dur` override). Scope kept to the **timeline** cards (the "scroll" the user scans); the detail view still shows the raw dates. |
| Reuse | No backend. Mirrors the existing `fmtDate` date-parsing style; uses `Date.UTC` (date-only math, no TZ drift). |

## What ships (`public/app.js`, `public/styles.css`)

- `app.js`: `nightsBetween`, `_dt` (date+time→epoch), `fmtDur`, `stepDuration` helpers (near `fmtDate`);
  `stepCardHTML` renders a `.step-dur` badge after the title in both branches; `viewActivity` back-nav
  restructured to target the parent step.
- `styles.css`: `.step-dur` (small tonal mono pill) + `.step-card.pinned .step-dur` (light-on-plate).
- `releases.json` note (What's New: y).

## Verification

- **Static:** `node --check public/app.js`; `node scripts/validate-data.mjs`.
- **Duration math:** unit-check `stepDuration` on samples — stay 2026-11-03→11-07 = "4 nights"; overnight
  train 11-07 18:40 → 11-08 07:15 = "12h 35m"; same-day flight 11:20→13:15 = "1h 55m"; missing time/date → "".
- **UI:** on the timeline, each stay shows "N nights" and each travel its travel time; open an activity →
  "back" returns to its parent step's detail (not the trip home); unassigned activity → back to trip.

## Outcome

Shipped via PR #44 (front-end + docs only; Pages deploy on merge). Timeline cards now carry a duration
pill (stays: "N nights"; travel: travel time), and opening an activity → "back" returns to its parent
step. Verified: `node --check` + `validate-data` green; `stepDuration` unit-checked on 9 samples
(stay/1-night/same-day/missing, overnight "12h 35m", same-day flight "1h 55m", multi-day "1d 3h", "45m",
no-times ""). Back-nav derives the parent-step href (unassigned → trip home).
