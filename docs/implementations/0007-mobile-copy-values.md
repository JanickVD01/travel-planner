# 0007 — Mobile fix: long-press to copy a value

> **Status:** 🚧 In progress 2026-07-09 — code landed on `code/mobile-copy-values`; final sign-off is a
> real-device long-press check on the CI demo preview. One numbered record per effort — see
> [`README.md`](README.md) for the index. (0006 is the concurrent MCP-connector doc effort, PR #33.)

## Context

On a phone, long-pressing a displayed value (e.g. an **actual price**) to copy it did **not** raise the
OS Copy callout, and the resulting selection/active state **couldn't be dismissed** — the app was
blocked until the user hit browser Back.

**Root cause:** every inline-editable value was rendered as a real `<button class="editable">…</button>`
(helper `editable()` in `public/app.js`) so it could be tapped to edit. On iOS a `<button>`'s text is
non-selectable UA content, so a long-press fires the button's active state instead of a text selection +
Copy callout, and the state doesn't clear normally. No `user-select` / `-webkit-touch-callout` rule
existed in CSS, and there was no touch/selection JS — nothing re-enabled copying. Plain budget-summary
tiles (`<div class="stat-val">`) were unaffected, which is why "some values but not these" copied fine.

## Decision

Render editable values as **selectable text** while keeping quick-tap-to-edit — chosen over a custom
"long-press → toast" copy so the user gets the **native** Copy menu (and partial-select), matching
expectation. No visual, API, worker, or data change.

| Change | File |
|---|---|
| `editable()` renders `<span class="editable" role="button" tabindex="0">` instead of `<button>` | `public/app.js` |
| `bindEditable()` click handler bails when a text selection is active inside the value (copy, not edit); adds Enter/Space `keydown` activation (a span isn't a native button) | `public/app.js` |
| `.editable` gains `user-select: text` + `-webkit-touch-callout: default` + `touch-action: manipulation` (the last re-adds the no-double-tap-zoom tuning it used to inherit from `button, a`) | `public/styles.css` |
| Timeline hint now reads "…edit it inline (long-press to copy)" | `public/app.js` |

## Verification

- **Static (done):** `node --check public/app.js` passes; exactly one `class="editable"` (the helper);
  no leftover `button.editable`; `node scripts/validate-data.mjs` passes.
- **On device (pre-merge, on the demo preview):** long-press an actual cost → native selection +
  **Copy** appears → copy works → tapping empty space clears the selection (no stuck/blocked state).
- **Regression:** a quick tap still opens the inline editor and saves; Tab + Enter/Space opens the
  editor (a11y); drag-select doesn't open the editor (selection guard); budget tiles/notes unchanged.

## Outcome

_Pending on-device confirmation._ Flip the index row to ✅ + fill the PR number once verified and merged.
No `DESIGN.md` change (interaction refinement, no visual/token change); the in-app hint is the
user-facing reconciliation.
