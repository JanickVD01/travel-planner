# 0002 — Three design directions (mockups) → Direction C chosen

- **Status:** ✅ Decided. Mockups were throwaway — PR #6 closed **unmerged** 2026-07-08.
- **Date:** 2026-07-08.
- **Artifacts (never on `main`):** `public/design/{index,a,b,c}.html` + vendored fonts, on the closed
  `code/design-directions` branch / PR #6 preview only.

## Context

[0001](0001-ui-design-brief.md) fixed the brand, but the *visual direction* was still open. We built
three self-contained mockup pages, each rendering the **same** hardcoded Thailand itinerary
(timeline + budget + checklist), so the user could compare them side-by-side on a phone.

## What we did

Vendored the candidate variable fonts (OFL) and wrote three directions, each fully self-contained
(zero external requests) and verified against `DESIGN.md`, plus a gallery, shipped as a demo preview:

- **A "Gate & Stub"** — boarding-pass / ticket-stub.
- **B "Field Notes"** — travel journal (editorial serif + rubber-stamp status).
- **C "Transit Line"** — metro / route schematic.

## Decision (phone review)

- **Direction C "Transit Line" won.** Feedback: the mockups were **too busy at first glance** → the
  real product must use **progressive disclosure** (compact cards, detail-on-tap).
- Pinned type (Space Grotesk / Instrument Sans / Spline Sans Mono) + the warm coral C palette were
  recorded in `DESIGN.md`'s decision log. **A and B rejected.**
- Plus a concrete feature set (separate pages, screenshot uploads, coordinates, activity notes,
  soft-delete/trash, a packing list replacing the checklist) → carried into
  [0003](0003-feature-expansion.md).

## Outcome

PR #6 closed unmerged (mockups never enter `main`). The chosen direction + the feature plan flow into
`0003-feature-expansion.md`; `DESIGN.md` + the eventual `tokens.css` are the durable record.
