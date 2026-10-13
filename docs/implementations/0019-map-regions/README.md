# 0019 — Trip regions on the map

> **Status:** ✅ Shipped 2026-10-13 (PR #60, deployed 12:38 UTC). Front-end only
> (`public/map.js`, `public/app.js`, `public/styles.css`) + docs — no schema/migration/worker/core change.
> Builds on [0015](../0015-trip-globe/) (the atlas) and [0017](../0017-trip-hierarchy/) (regions). See the
> [index](../README.md).

## Context

Owner feedback through the PostHog feedback tab (2026-10-13, on the Map tab): *"It would be nice on the map
if the region that was actually part of the trip is highlighted, or if we can actually see on the map which
regions we are looking at."* Today the atlas draws every province outline the same way and only the stay
pins + the route line say where the trip goes; the trip's regions (0017) never appear on the map.

## Decision

| Topic | Decision |
|---|---|
| What is highlighted | The **provinces the trip's stays are in** (Natural Earth admin-1, already vendored as `admin1-lite.json`), found with `d3.geoContains` per located stay — computed once per trip in `setTrip`, not per redraw. A province shared by two regions (Bangkok + Bangkok (return)) is drawn once and belongs to both. |
| Colour | One tone: the **`--rail` ink-blue** — the colour that already means "region" on the timeline (capsule markers, strip) — as a low-alpha wash + a thin edge, under the borders and pins. No new hue, no accent (DESIGN §8: one accent; colour = meaning). Theme-aware via CSS tokens like the rest of the atlas. |
| Naming the regions | A **trip-region label** per region (its title), placed just below the centre of its stays, visible at every zoom in both the backdrop and the Map view; regions at the same spot share one label ("Bangkok · Bangkok (return)"). |
| Which region am I looking at | In the **Map view**, a row of tonal chips under the tabs — **All · <each region with located stays>** in timeline order. A chip frames that region (its provinces + stays) and emphasises it (its provinces stronger, the others dimmed); **All** frames the whole trip again. The chip row only appears when the trip has regions with located stays. |
| Backdrop | The still timeline backdrop shows the same subtle wash + labels (it still never moves — 0015). |
| Limits | Shading needs the country in `admin1-lite` (France, Belgium, Thailand, USA, Japan today); elsewhere (e.g. Mexico) the labels still show, without shading. Stays without a region still pin as before. |
| Events | `map_region_focused` `{ all }` via `track()` (0017 M6). |

## Milestones

| PR | Milestone | Migration | Worker redeploy | What's New |
|---|---|---|---|---|
| `code/map-regions` | **M1 — Record** (this file) + index row 🚧 — ✅ | — | — | — |
| `code/map-regions` | **M2 — Atlas**: stays carry their region; trip-province wash + trip-region labels in `map.js`; `focusRegion(id)` — ✅ | none | n | y |
| `code/map-regions` | **M3 — Map view chips** + release note v0.9.1 + DESIGN.md decision log — ✅ | none | n | y |

## Verification

Headless Chrome on demo data, 1600 + 390 px: the demo trip's stays resolve to their provinces (shaded paths
exist, one per province, tagged with their regions); a label per trip region; the Map view shows All + one chip
per located region; a chip frames that region (the zoom changes; its stays are on screen) and marks its
provinces as focused, All resets; theme flip keeps the wash themed; pins still open their stay; no errors;
the earlier suites still pass.

## Verification (done 2026-10-13)

Headless Chrome on demo data, 1600 + 390 px (`map-check`, 19 checks): the backdrop shades one path per
trip province, tagged with its regions (Bangkok, North, Krabi), and draws a label per trip region with stays;
nothing is focused there. The Map view shows **All · Bangkok · North (Chiang Mai) · Krabi** (timeline
order, ≥ 44 px, above the map); Krabi presses its chip, marks only its provinces + label as focused and
zooms in on it (on screen), firing `map_region_focused {all:false}`; a pin tap still opens its stay;
re-entering the Map view starts at All; All resets focus + framing; leaving a region focused and going back
to the timeline re-frames the still backdrop to the whole trip, unfocused; a theme flip re-tints the wash.
No uncaught errors; the M6, quick-fix, menu and tree-link suites still pass at both widths.

Found + fixed along the way: the framing floor was a fixed 5 scene-px, which on a phone (the whole world is
≈ 390 px wide at k = 1) capped the zoom for small areas (a province, or a single-stay trip) at ≈ 50 — it is
now ≈ 0.25° of map, scaled to the screen; and the Map view frames below the region chips' measured bottom
edge (+ room for a pin label) instead of a fixed offset.

## Outcome

Shipped 2026-10-13 in PR #60 (after #59, which it builds on). The trip's provinces are washed in the region
blue with a label per region on both the still backdrop and the Map view, where tonal region chips frame and
emphasise one region; phone framing of small areas fixed on the way. What's New v0.9.1. Reconcile rode with
0017 M7 (`content/trip-hierarchy-reconcile`): `CLAUDE.md` status, `README.md`, `DESIGN.md` (decision log in
#60), index ✅.

## Later changes

- **2026-10-13 — Mexico shading: not wanted.** The owner confirmed province shading for countries missing
  from `admin1-lite.json` (e.g. Mexico for the 2027 trip) isn't needed; labels-only stays the behaviour there.
- **2026-10-13 — map labels never overlap** (`code/map-label-declutter`). Owner feedback on the 0020 workspace
  map pane: "all this text is way too crowded" — every province name was drawn regardless of space, piling onto
  stay and region names. `applyZoom` in `public/map.js` now places labels greedily in priority order — stay
  names, then trip regions, then countries, then provinces — skipping any whose box would hit an already-placed
  label or a pin (boxes estimated once per label from `LABEL_METRICS`, so panning stays cheap). Stay / region
  names try a few spots around their anchor before giving up (close pins like Ao Nang + Railay); a stay named
  like a nearby region or stay shows once (the region wins). Provinces only appear where there's room — zoom
  in for more. Verified headless (`label-check`, real rendered boxes, zero overlaps + every region labelled) in
  the workspace pane, the Map tab (whole trip, Krabi, zoomed further), the 1100 px backdrop and the phone Map tab.

