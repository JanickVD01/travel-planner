# 0009 — Mobile card polish: "Lodging" label + stacked title/dates/status

> **Status:** ✅ Shipped 2026-07-09 (PR #37). Live mobile feedback follow-up to
> [0008](0008-timeline-declutter-delete.md). One numbered record per effort — see
> [`README.md`](README.md) for the index.

## Context

Two phone-only nits from live use of the shipped timeline (0008):
1. The detail-view label **"Accommodation"** overflowed the narrow fixed label column (`.mlabel`,
   ~96px) on phones.
2. On a narrow screen each timeline line packed **title + status chip + `›`** onto one row, so the
   status wrapped to an awkward middle line.

## Decision

| Topic | Decision |
|---|---|
| Label | Rename the **display** label "Accommodation" → **"Lodging"** everywhere it's shown (step detail meta, budget "where it goes" breakdown, add-step wizard field + review). The `accom_name` **data field / column is unchanged** — display-only. |
| Line layout | Each timeline line now **stacks**: title (with the `›` open affordance) → dates → the status chip on its own row (`.step-status`, compact 34px tap target). Never wraps. |

## What shipped (`public/app.js`, `public/styles.css`)

- `stepCardHTML` (travel + stay): moved the status `chip` out of the head row into a new
  `<div class="step-status">` after the dates row; head row is now title + `openChev` only.
- CSS: `.step-status { margin-top: 5px }` + `.step-status .editable { min-height: 34px }`.
- Four display-label strings changed to "Lodging" (`mlabel`, budget `cats`, wizard field, wizard
  review summary).

## Verification

- **Static (done):** `node --check public/app.js` passes; zero "Accommodation" **labels** remain
  (`accom_name` data field intact); `.step-status` on both card kinds; `validate-data` passes.
- **On device (owner, live):** on a phone the detail "Lodging" row no longer overflows, and each
  timeline line reads title / dates / status with no wrapping. Tapping the status chip still opens its
  inline editor; tapping elsewhere on the line opens the detail.

## Outcome

Merged to main (PR #37); owner validating live (customer-feedback loop).
