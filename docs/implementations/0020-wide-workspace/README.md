# 0020 — Wide-screen workspace (laptop / desktop layout)

> **Status:** ✅ Shipped 2026-10-13 — M1 prototype (#65, closed unmerged) → B picked; M2 trip to-dos (#66), M3 layout B
> (#67), M4 reconcile (`content/0020-reconcile`). MCP to-do tools verified live on prod (see *Outcome*). See the [index](../README.md).

## Context

Owner feedback through the PostHog feedback tab (2026-10-13 13:34 UTC, desktop 1600 px):

> *"There's a lot of room for improvement in how we are utilizing screen space on a desktop browser or on a
> laptop browser view. We are only utilizing the middle section of the screen whereas we are not using the
> left and right sides of the screen. Please put some thought into how we could improve that view, but only
> on a laptop browser UI. Get some ideas because the eventual goal is that we get the right information at
> the right points in time in a structured overview. One idea, for example, could be that instead of putting
> the map behind our interface, we could shrink the map much smaller and have it on the left-hand side of the
> screen (or somewhere else on the screen, utilizing the other sections of our screen)."*

Today every page is one centred 760 px column (0018); on a 1600 px screen ≈ 840 px is only the faded map
backdrop (0015). Phones are fine and stay exactly as they are — this effort is **≥ 1200 px only**.

## Options (prototyped in M1)

| | Layout | What it gives | Cost / trade-off |
|---|---|---|---|
| **A** | **Map + timeline** — the map leaves the backdrop and becomes a live left pane (≈ 40 %); the timeline is the right column. The map **follows the timeline** (the region in view is framed) and a hovered card lights up its pin. | The owner's own idea; the map becomes useful while planning. | Uses the space for the map only — no new information. |
| **B** | **Planner workspace** — left: compact live map + a region navigator; centre: the timeline; right: **At a glance** (to book: steps still Idea / Planned · unplanned nights · budget vs target · packing progress). Selecting a step or region opens its **detail in the right pane** instead of leaving the timeline. | "The right information at the right point in time"; master–detail without losing your place. *(Recommended going in.)* | The most to build; phased below. |
| **C** | **Timeline + detail** — the timeline on the left, the selected step / region detail on the right with a small map above it. | Simple master–detail; the detail is always visible. | No overview panel; the map is small. |

## Prototype (M1) — how to try it

A **throwaway** PR (never merged, like the July 3-direction preview, PR #6) adds a layout switcher to the
real app — **Current · A · B · C**, bottom-left, shown only at ≥ 1200 px — on its **demo-mode preview**
(demo data, nothing saved). The behaviour is real enough to judge the feel (map pane follows scroll, pin
highlight, At a glance, detail-in-pane), but the code is prototype-grade: e.g. At a glance is computed in
the browser, which the real build would move into `shared/core.js` like every other rule.

## Milestones

| PR | Milestone | Migration | Worker redeploy | What's New |
|---|---|---|---|---|
| `content/0020-record` | **M1a — Record** (this file) + index row 🚧 — ✅ #64 | — | — | n |
| `code/0020-prototype` *(throwaway, preview only — closed unmerged)* | **M1b — Clickable prototype** of A / B / C | — | — | — |
| — | **Decision** — owner tries the prototype and picks (or mixes) a layout; logged here — ✅ B (see *Decision*) | — | — | — |
| `code/todos` | **M2 — Trip to-dos, end to end**: `FLAT_SPECS.todos` + wrappers (core), `migrations/004_todos.sql` (applied to prod via `migrate` **before merge**) + `schema.sql`, `/api/todos`, demo mock, MCP `list_todos` / `add_todo` / `edit_todo` / `toggle_todo` / `delete_todo` / `restore_todo` / `list_deleted_todos` / `purge_todo` (+ smoke), a **To-do tab** on every screen (owner), Trash "To-dos" group — ✅ #66 | **004** | **y** | y |
| `code/wide-workspace` | **M3 — Layout B in production** (≥ 1200 px): map pane + Regions panel (summary, regions, gaps) left · the timeline filling the middle · right pane At a glance (To-do · Unplanned · Packing) with step / region detail opening in it (condensed); map follows the scroll + pin hover; full-screen Map tab; **no notebook grid + no dashed underlines app-wide** (owner) — ✅ #67 (see *M3 notes*) | none | n | y |
| `content/0020-reconcile` | **M4 — Reconcile**; close prototype #65 unmerged — ✅ | none | n | n |

## Decision

**2026-10-13 — B · Planner workspace** (owner, after trying A / B / C on the prototype preview), with these
refinements (all **≥ 1200 px only**; phones unchanged):

| Refinement | What changes |
|---|---|
| **No notebook grid** | The squared-paper background (`body::before`) goes in the wide layout — plain paper. |
| **The middle fits its space** | The timeline column fills the space between the left and right panes — no capped, centred card. |
| **Regions live bottom-left** | The trip summary line + the region list (with the unplanned gaps in order) sit in the lower-left panel under the map; the summary + nights strip are removed from above the timeline. |
| **A condensed detail pane** | Step / region details in the right pane use tight rows (≈ 34 px instead of 44 px), smaller labels and section headings. |
| **No dashes under editable values** | The dashed underline goes; a soft tint on hover / focus marks a value as editable (desktop = mouse). |
| **A free-form to-do list** *(addition)* | The top of the right pane gets a real **To-do** list — add, tick off, rename, delete, done items folded away; **not tied to steps** ("an open space where to-dos can be added, checked off, consulted and managed at a high level"). Sits above Unplanned · Packing. **Editable through the MCP server** (owner): the real build adds a `todos` list in `shared/core.js` (`FLAT_SPECS.todos`: `title`, `done`, `sort_order`; soft-delete → Trash) + `schema.sql` + `/api/todos` + MCP tools `list_todos` / `add_todo` / `edit_todo` / `toggle_todo` / `delete_todo` (+ restore / purge), all thin wrappers over core like every list. |
| **At a glance = To-do · Unplanned · Packing** | "To book" and "Budget" are dropped from the pane (owner: drop To book; remove Budget for now). |
| **The Map tab stays full-screen** | Selecting Map still shows the full-screen interactive map (panes hidden) — the prototype first drew it at the side-pane size; fixed by redrawing when the map's container changes size. |

Regenerated prototype: [PR #65](https://github.com/JanickVD01/travel-planner/pull/65) (B only; switcher
Current · B). Settled for the build (owner, 2026-10-13): to-dos get **their own tab on every screen**; the notebook grid + the dashed
underlines go **everywhere** (phones too); A's **map follows the timeline** stays in B.

## M3 notes (2026-10-13)

Production port of the prototype's B, minus its scaffolding (no switcher, no A / C, no `?layout`):
- **Activation:** `matchMedia("(min-width: 1200px)")` → `body.ws` (+ `body.on-trip` from the router); flipping the
  width re-routes. Static `aside#ws-left` / `aside#ws-pane` in `index.html`.
- **No global render target:** `viewStep` / `viewRegion` / `viewActivity` take an optional `el`; the router
  (`wsRoute`) renders them into the pane and keeps the timeline in `#view`, re-rendering the middle only when
  its trip data changed (scroll kept). In the pane the detail `h1` carries **no** `view-transition-name` (it
  would duplicate the card's and abort the transition).
- **Map:** `map.js` `ensureSize()` / `needsResize()` (the container changes size between the pane and the
  full-screen Map tab without a window resize) + `highlightStop()`; `syncTripMap` pads the pane and refits on
  the way back from the Map tab.
- **App-wide:** the `body::before` grid is removed; `.editable` has no dashed underline (hover / focus tint, a
  real `:focus-visible` ring added); the notes box gets a solid hairline.
- The To-do tab shows the list in the middle, so the pane's At a glance omits it there (no duplicate list).
- Fixed on the way (PR 1): with 5 tabs the phone tab row scrolls — the current tab is now scrolled into view.

**Verification** (headless Chrome, demo data): `ws-check` at 1600 px — 27 checks (panes + geometry, the
middle fills its space, summary moved, At a glance sections, pane to-do add, a step opening in the pane with
the timeline intact + no scroll jump + no duplicate transition name + the card marked, condensed rows, editing
in the pane keeps the timeline's scroll, back → At a glance, Regions panel framing, follow-scroll, pin hover,
full-screen Map tab with a full-size drawing and the pane redraw on return, To-do / Budget tabs keep the panes,
a pin in the pane opens its stay in the pane, < 1200 px back to the column, phones without grid / dashes, no
errors). Every earlier suite (quick fixes, menu, M6, map regions, pinned tabs, to-dos, tree links) passes at
1100 + 390 px.

## Outcome

Shipped 2026-10-13. The owner's feedback ("we only use the middle of a laptop screen") went from three options →
a clickable throwaway prototype (#65) tried on a laptop → **layout B** with the owner's refinements → a clean
production build:
- **#66 — trip to-dos**, a free-form per-trip list, end to end: core `FLAT_SPECS.todos`, migration 004
  (applied to prod before merge), `/api/todos`, MCP `*_todo` tools, a **To-do tab** on every screen, Trash.
  Core verified against real SQLite (`node:sqlite`, 12 checks); the tab in headless Chrome at 1600 + 390 px.
- **#67 — the workspace (≥ 1200 px)**: map pane + Regions panel, the timeline filling the middle, At a glance /
  details in the right pane, the map following the scroll; app-wide plain paper + no dashed underlines.
  27 headless checks, run locally and against the deployed preview; every earlier suite still green.
- What's New v0.10.0 + v0.11.0. Reconcile: `CLAUDE.md` (status, data map, data model, MCP tools), `README.md`,
  `DESIGN.md` (in #67), `app.json` tagline, index ✅, GitHub About, the MEMORY journal.

**MCP verified live (2026-10-13, after an `/mcp` reconnect):** on thailand-2026 — `list_todos` (empty) →
`add_todo` (`td-…`, `done:"0"`) → `toggle_todo` (`done:"1"`, audit `updated_by` = the owner) → `delete_todo` →
`list_deleted_todos` (in Trash) → `purge_todo` → both lists empty again. Nothing left behind.

## Later changes

*(append-only, newest last — none yet)*
