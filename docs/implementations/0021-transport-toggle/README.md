# 0021 — Show / hide transport on the timeline

> **Status:** ✅ Built 2026-10-25 on `code/transport-toggle` (one PR; ships on merge). Front-end only (`public/app.js`, `public/styles.css`) +
> release note + docs — no schema/migration/worker/core change. See [`README.md`](../README.md) for the index.

## Context

Owner request (2026-10-25): *"let me choose whether transport between steps is shown, so once the transport
is settled I can focus on just the trip itself — a toggle you switch on or off."*

## Decision

| Topic | Decision |
|---|---|
| Control | A **Transport** toggle button on the timeline's control row, next to Expand / Collapse all (same pill, 44 px, `aria-pressed`; icon-only on phones). Shown only when the trip has at least one travel leg. On a trip without regions (no depth chips) the row holds just this button. |
| Effect | Hides every **travel leg** (`.step.travel`) on the timeline, plus the "add step" inserter right before each hidden leg (so two inserters never stack). Pure view filter: no data changes, budget / region totals / nights strip / map are unchanged (the map never drew travel legs). |
| Persistence | A per-viewer, **per-trip** convenience in `localStorage` (`tp.transport.<slug>` = `"hide"`), like the tree collapse state — never data. Default: shown. |
| Re-render | Flips a `data-transport` attribute on the timeline list in place — no re-render, scroll kept, no map call. Works in the wide-screen workspace too (it renders the same timeline). |
| Telemetry | `transport_toggled { shown }`. |

## Milestones

| PR | Milestone | Migration | Worker redeploy | What's New |
|---|---|---|---|---|
| `code/transport-toggle` | **M1 — Record** (this file) + index row 🚧 — ✅ | — | — | — |
| `code/transport-toggle` | **M2 — Toggle**: button + `localStorage` pref + CSS filter; release note v0.12.0 — ✅ | none | n | y |
| `code/transport-toggle` | **M3 — Reconcile**: CLAUDE.md / README.md (v0.12), DESIGN.md decision log, index ✅ — ✅ | none | n | — |

## Verification (done 2026-10-25)

Headless Chrome on demo data (Node demo server + CDP) at 1100, 390 and 1600 px (workspace): with
`localStorage` cleared the button reads *Hide transport* (`aria-pressed="true"`) and all 4 travel legs show;
one click hides all 4 legs and 4 of the 11 inserters (7 left — no stacked pairs), sets `data-transport="hide"`
and stores `tp.transport.<slug>=hide`; a reload keeps it hidden; a second click restores everything and clears
the key. `transport_toggled { shown }` fires; no uncaught errors. Screenshots: phone shows the icon-only pill
(slashed plane, dashed when off); desktop shows *Transport* after *Collapse all*.

## Outcome

Built as specified: `transportToggleHTML` / `applyTransport` + one delegated click branch in `bindTree`
(`public/app.js`), a `noplane` icon, and a 4-line CSS filter (`.tl[data-transport="hide"]`, using `:has()` to
drop the inserter before each hidden leg). Release note v0.12.0 "Hide transport".
