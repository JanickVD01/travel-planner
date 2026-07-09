# 0008 — Timeline declutter + Delete step

> **Status:** 🚧 In progress 2026-07-09 — code landed on `code/timeline-declutter-delete`; final
> sign-off is an on-device check on the CI demo preview. One numbered record per effort — see
> [`README.md`](README.md). (0006 = MCP-connector docs, 0007 = mobile copy-fix — concurrent branches.)

## Context

User feedback on the trip timeline:
1. **No way to delete a step** from the browser (deletion existed only via MCP / Trash).
2. **Cards showed too much** (cost, photos, map, carrier/accommodation, the activity list), hurting the
   overview. The user asked for each line to show **only** title, dates, and the status chip, with
   everything else in the step's **detail** view — and the **delete** control placed in that detail.

The step detail view (`viewStep`) already rendered every field + photos + activities, and delete was
fully plumbed (soft-delete `deleteStep`, `DELETE api/steps/<slug>/flow/<id>`, Trash restore) — so this
was an SPA-only change (no API/worker/core/schema/data change).

## Decision

| Topic | Decision |
|---|---|
| Line content | **Strict:** title link · editable dates · editable status chip · a `›` chevron. Cost, "+ actual", photos, map/booking links, carrier, accom_name, and the nested activity list + add-activity are **removed** from `stepCardHTML`. |
| Open detail | The **whole card** opens the detail on tap (`bindStepNav`, guarded to ignore `.editable`/links/buttons/inputs and active text selections — same guard style as 0007), plus the explicit `›` affordance. `data-href` on each `<li class="step">`. |
| Delete | **Soft-delete** (recoverable) via a "Delete step" button in the detail footer (`bindStepDelete` → `DELETE api/steps/<slug>/flow/<id>` → `invalidateTrip` → back to the timeline). A stay's activities become **Unassigned** and reunite on Restore; the confirm text says so. Permanent cascade stays behind Trash → "Delete forever". |

## What shipped (`public/app.js`, `public/styles.css`)

- `stepCardHTML` trimmed for both travel + stay branches; added `openChev` + `data-href`.
- New `bindStepNav()` / `bindStepDelete()` delegated handlers, wired in `boot()`.
- "Delete step" block appended to the `viewStep` panel (with the step's activity count for the confirm).
- CSS: `.step-open` chevron, `.step .leg/.step-card { cursor:pointer }`, `.detail-danger` + `.danger-btn`
  (mirrors the destructive `.trash-btn.purge`).
- Reconciliation: timeline hint reworded ("Tap a step to open its details; tap a status or date to edit
  inline"), `DESIGN.md` decision-log entry, this record + index row.

Left as harmless dead code (not on the card anymore): `attachmentsHTML`'s `compact` branch. Candidate
for a later cleanup sweep.

## Verification

- **Static (done):** `node --check public/app.js` passes; `data-href` on both cards; chevron + delete
  button present; `bindStepNav`/`bindStepDelete` defined and called; `node scripts/validate-data.mjs`
  passes.
- **On device / preview (pre-merge):** timeline shows *icon · title · dates · status · ›* only; tapping
  a line (background, title, or chevron) opens the detail with the full set + Delete step; tapping the
  status chip / a date on the card still opens its inline editor (no navigation); deleting a travel step
  returns to the timeline and the step appears in Trash → Restore works; deleting a stay with activities
  moves them to Unassigned and Restore reunites them.

## Outcome

_Pending on-device confirmation._ Flip the index row to ✅ + fill the PR number once verified and merged.
