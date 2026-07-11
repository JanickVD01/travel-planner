# 0001 — UI design brief (`DESIGN.md` taste contract)

- **Status:** ✅ Shipped — PR #5, merged 2026-07-08.
- **Date:** 2026-07-08.
- **Artifact:** [`DESIGN.md`](../../../DESIGN.md) (repo root).

## Context

The app shipped as a deliberately generic $0 Cloudflare scaffold with a minimal shell (≈7 CSS tokens,
system font, generic-blue accent, dark-default). Before building the real travel-planner screens we
needed a durable statement of *visual intent* — the equivalent, for look-and-feel, of what
`shared/core.js` is for business logic — so every later UI decision has a reference to measure against.

## What we did

Interviewed the user for taste inputs, then ran a verified research sweep (font availability on
Fontsource, Airbnb + Polarsteps design DNA, three candidate directions, and taste guardrails) and
authored `DESIGN.md`.

## Decisions

- Adjectives: **Crisp & precise + Warm & editorial**. References: **Airbnb + Polarsteps**.
  Density: **Balanced**. Theme: **Light-primary** (flips the scaffold's dark default).
- A Fontsource-verified font shortlist, an OKLCH two-tier token thesis, NEVER/INSTEAD guardrails,
  WCAG 2.2 AA + mobile baselines, and three candidate directions to prototype next.

## Outcome

`DESIGN.md` merged (PR #5) and is pointed to from `CLAUDE.md`'s data map. Fed directly into
[0002](../0002-design-directions/).
