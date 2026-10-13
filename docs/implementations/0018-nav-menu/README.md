# 0018 — Navigation menu + trip tabs at the top

> **Status:** 🚧 In review — M1–M3 ✅ in `code/nav-menu` (awaiting merge). Front-end only (`public/index.html`,
> `public/app.js`, `public/styles.css`, `public/tokens.css`) + docs — no schema/migration/worker/core change.
> See [`README.md`](../README.md) for the index.

## Context

Owner feedback through the PostHog feedback tab (2026-10-13, desktop 1600 px, triaged in
[0017 *Owner feedback fixes*](../0017-trip-hierarchy/)):

1. *"The hamburger menu doesn't do anything, so it should actually house the Home and What's New
   buttons."* — confirmed with two rage-click bursts on `#menu-toggle` in the replay. `.side.collapsed`
   only hides the sidebar at ≤ 720 px, so on desktop the button toggles a class with no visible effect,
   while a permanent 236 px left column holds just two links. On phones the same two links take a row
   above every page.
2. *"I have the feeling that Timeline, Map, Budget and Packing can actually stick to the top."* — the tabs
   are sticky, but at rest they sit **below** the trip hero (≈ 275 px down on desktop), while on the Map
   tab the hero is hidden so the same tabs sit right under the bar: they jump between tabs. (The sticky
   offset bugs — 7 px under the bar on desktop, fully under it on phones — were fixed in PR #55.)

## Decision

| Topic | Decision |
|---|---|
| Menu | The hamburger becomes a real **disclosure menu** on every width: a small floating panel under the bar with **Home** and **What's New** (`#side` → a popover; `aria-expanded`/`aria-controls` on the button). Closes on a link tap, Escape (focus back to the button), a tap outside, or any navigation. Floating chrome → the one tuned shadow (DESIGN §8). Links ≥ 44 px. |
| Sidebar | **Removed** as a permanent column on all widths (and the phone row). The content column is centred; `--maxw` 960 → 760 px so the column stays about as wide as before (was ≈ 676 px next to the sidebar, now ≈ 728 px) instead of stretching. |
| Trip tabs | On every trip page (Timeline, Map, Budget, Packing) the tabs come **first**, directly under the top bar, then the trip hero (‹ All trips · Trash, title, dates, note). Same position on all four tabs, already "at the top" before any scroll; still sticky. |
| Brand | Unchanged — the brand link stays the one-tap way home. |

## Milestones

| PR | Milestone | Migration | Worker redeploy | What's New |
|---|---|---|---|---|
| `code/nav-menu` | **M1 — Record** (this file) + index row 🚧 — ✅ | — | — | — |
| `code/nav-menu` | **M2 — Menu**: popover `#side`, button ARIA + close rules; drop the sidebar column + phone row; `--maxw` 760 — ✅ | none | n | y |
| `code/nav-menu` | **M3 — Tabs first** on Timeline / Map / Budget / Packing; DESIGN.md decision log; release note v0.8.2 — ✅ | none | n | y |

## Verification

Headless Chrome on demo data at 1600 and 390 px: the menu opens and closes (button, Escape, outside tap,
link), `aria-expanded` tracks it, focus moves in and back; no sidebar column; the content column width;
the tabs sit right under the bar at rest on all four tabs (same y); sticky still holds; no JS errors; the
existing tree-link and quick-fix checks still pass.

## Verification (done 2026-10-13)

Headless Chrome on demo data, 1600 + 390 px (`nav-check`): the menu is closed at load with no sidebar
column; the content column is centred (728 px at 1600); the button opens it just under the bar with
`aria-expanded="true"` and focus on **Home**; both links are 44 px; Escape closes and returns focus to the
button; the button toggles it closed; a tap outside closes it; the What's New link navigates, closes it and
is marked active. On Timeline / Map / Budget / Packing the tabs precede the hero and sit at the same y (the
map sheet lost its top padding so the Timeline matches); no uncaught errors. Implementation notes: the
panel's `top` is set from the bar's live bottom edge when it opens (so it hugs the bar even under the demo
banner); `.nav a` min-height 40 → 44 px.

## Outcome

*(to be written when the effort ships)*

## Later changes

*(append-only, newest last — none yet)*
