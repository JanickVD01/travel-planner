# 0020 — Wide-screen workspace (laptop / desktop layout)

> **Status:** 🚧 In progress — **M1** (this record + a throwaway clickable prototype of three layouts) 🔧;
> waiting for the owner to try A / B / C on the prototype preview and pick one. See the [index](../README.md).

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
| `content/0020-record` | **M1a — Record** (this file) + index row 🚧 | — | — | n |
| `code/0020-prototype` *(throwaway, preview only — closed unmerged)* | **M1b — Clickable prototype** of A / B / C | — | — | — |
| — | **Decision** — owner tries the prototype and picks (or mixes) a layout; logged here | — | — | — |
| tbd | **M2 — Layout shell** (≥ 1200 px panes; the map moves out of the backdrop) | none | n | y |
| tbd | **M3 — Map follows the timeline** (region in view framed; hovered card → pin) | none | n | y |
| tbd | **M4 — At a glance** (B only; computed in core) | none | n | y |
| tbd | **M5 — Detail in the pane** (B / C) | none | n | y |
| tbd | **M6 — Reconcile** | none | n | n |

## Decision

*(pending — the owner tries the prototype first)*

## Outcome

*(to be written when the effort ships)*

## Later changes

*(append-only, newest last — none yet)*
