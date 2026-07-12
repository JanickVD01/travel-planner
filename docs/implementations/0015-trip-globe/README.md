# 0015 — Trip globe: a visual map of the itinerary (research + design + prototype → production)

> **Status:** ✅ Shipped 2026-07-12 (PR #47). **Phase 1** (record + research + design + prototypes,
> 2026-07-11) chose the crisp flat-vector atlas; **Phase 2** (2026-07-12) shipped it into the real
> `public/` SPA — a still atlas backdrop behind the timeline (a pin per located stay) plus an interactive
> **Map view** whose pins open the stay's detail. Kept under this one effort (docs + code ⇒ a `code/`
> branch), per the owner. See the index — [`README.md`](../README.md) — and the data map in
> [`CLAUDE.md`](../../CLAUDE.md).

## Context

Every step and activity already stores `lat`/`lng` + a `map_url` ([`shared/core.js`](../../shared/core.js)
`FLAT_SPECS`), but today the app renders those only as Google-Maps **link-outs** ([`public/app.js`](../../public/app.js)
`mapsUrl`). The user wants to *see* the trip: a rotating Earth showing countries and their regions, a dot
per stop, and — as you scroll the timeline — the globe moving to focus the step you're looking at, so you
grasp the shape of the journey at a glance.

**Pivotal constraint:** the app's strict CSP — [`public/_headers`](../../public/_headers):
`default-src 'self'; script-src 'self'; img-src 'self' data: blob:; connect-src 'self'; …` — permits **no
CDN scripts, no external tiles/APIs, no `blob:` workers, no WASM**. `DESIGN.md` already ruled out live
Mapbox (§2, *"we render our own CSS spine instead"*) and third-party viz libs (§8). So the feature must be
**fully self-hosted, zero external calls at runtime**, added via the vendor pattern (a self-hosted file in
`public/vendor/`, classic `<script>`, like `anime.min.js`).

## Decision

| Topic | Decision |
|---|---|
| Phase this | Research → design → **prototype all three renders** → owner picks → (later) build. This record covers phase 1 only. |
| Renders to prototype | **A** orthographic globe (`d3-geo`, SVG — CSP-clean, ~50 KB); **B** WebGL 3D globe (`globe.gl`/`three.js`, solid material); **D** photoreal "Google Earth" globe (`globe.gl` + self-hosted NASA Blue Marble texture); **C** flat/tilted map (`d3-geo`, ~free once A exists). |
| Where prototypes live | `design/prototypes/` inside this folder, with a **copy of the real `_headers`** so `wrangler pages dev` tests under the identical CSP. They sit under `docs/` (never served by Pages) → can't leak to prod; pruned at reconcile. |
| Geodata | **Natural Earth (public domain)** admin-0 + admin-1, simplified with mapshaper. **Not GADM** (license bars redistribution). |
| Data model | Route = ordered **stay** coords (`sort_order`); **travel legs usually lack coords** → drawn as arcs between adjacent stays; activities become sub-dots when a stay is focused; missing coords skip gracefully. |

## Milestones

1. **Record first** — this file + index row (🚧).
2. **research.md** — libraries, geodata, UX patterns, CSP feasibility (+ citations).
3. **Prototype scaffold** — `design/prototypes/` (`_headers`, launcher, sample itineraries, vendored libs + geodata).
4. **Three prototypes** — A orthographic, C flat, B WebGL; same sample data + scroll-sync interaction.
5. **design.md + prototypes.md** — the proposal + the run/compare guide (scorecard for the owner).
6. **Preview & decide** — run under CSP; owner compares and records the pick (sign-off gate).
7. **Reconcile** — prune the throwaway runtime (heavy vendor/data), keep the written record + decision; flip ✅; note production is a separate effort.

## Verification

- **CSP fidelity (the real test):** each prototype serves with **zero CSP violations and zero external
  network requests** in DevTools.
- **Feature sanity:** countries + regions visible; dot per stop; arcs between legs; scroll focuses +
  pulses the current dot; click a dot scrolls to its card; `prefers-reduced-motion` disables fly/rotate;
  works at the 720px mobile breakpoint.
- No `public/` / schema / worker change — `node scripts/validate-data.mjs` stays green.

## Outcome (Phase 1)

Prototyped three renders under the real CSP; the WebGL/photoreal globes were rejected as "uncrisp"
(raster-texture blur) and the orthographic globe dropped in favour of a **crisp flat vector atlas**
(D3-geo Mercator, gapless Natural Earth 50m land + `topojson.mesh` internal borders, English
country/region labels). Final prototype (`design/prototypes/atlas.html` + `atlas.js` / `proto-app.*`):
a faded warm map **behind the timeline** (ground dimmed, pins full-strength) that pans to the tapped
step, plus a **Map view** with manual pan/zoom. Owner signed off 2026-07-12. Production follows in
Phase 2 (below), rolled into this same effort.

---

## Phase 2 — Production integration (rolled into 0015)

Graft the signed-off atlas into the real `public/` SPA. Locked decisions with the owner:

| Topic | Decision |
|---|---|
| Coordinates | **MCP backfill + browser capture.** Reuse the existing `set_coordinate` MCP tool to populate `lat`/`lng` for current trips; **and** the wizard starts saving `lat`/`lng` when a pasted maps link contains coords (today it saves only `map_url`). Stays without coords degrade gracefully (no pin). |
| Activation | The faded atlas appears **only when a trip has ≥1 located stay**; trips with none keep today's plain paper timeline. The **Map view** tab is always present (empty-state when no coords). |
| Interaction (adapted) | Real step cards **navigate** to a detail page, so the prototype's in-list pin-under-dot can't be literal. Instead `#trip-map` is a **fixed shell layer that persists across the timeline→detail View Transition**: timeline = fit-all overview; opening a stay pans the background to it; Map view = interactive. Still tap-driven, not scroll. |
| Governance | One effort (this record), one **`code/`** branch (`code/trip-globe`), one PR. No migration (`lat`/`lng` columns already exist), no worker redeploy (`set_coordinate` already exists). |
| Library | Ship the prototype's proven full `d3.min.js` (idle until `setup()`, immutable-cached) rather than a hand-trimmed no-build bundle. Theme re-tint is **pure CSS** (map coloured by `var(--map-*)` classes) — no JS observer. |

**New files:** `public/map.js` (ported from `design/prototypes/atlas.js`; `window.TripMap.setup(el, {onSelect}) → {setTrip, fitAll, onResize, destroy}`), `public/vendor/{d3.min.js, topojson-client.min.js}`, `public/vendor/geo/{countries-50m.json, admin1-lite.json}`. **Modified:** `public/index.html` (shell `#trip-map` + script includes), `public/app.js` (map lifecycle + `renderSubnav` "Map" tab + `trip/<slug>/map` route + wizard coord capture), `public/styles.css` (map layer + beige sheet + legs-as-cards + `--map-*` tokens + Map-view block, scoped under `body.map-bg`). `/vendor/*` already carries the immutable cache header (covers `geo/`); **no `_headers`/CSP change**.

### Phase 2 milestones (log — updated in place as each lands)

1. **Vendor + module** — ✅ 2026-07-12. Copied `d3.min.js`/`topojson-client.min.js` + `geo/{countries-50m,admin1-lite}.json` into `public/vendor/`; ported `atlas.js` → `public/map.js` (`setTrip`, `fitAll`, tap→`onSelect` hit-test; numeric-coerces string coords); added the shell `#trip-map` div + script includes to `index.html`. `node --check` clean. `public/vendor/README.md` documents the new assets.
2. **Timeline background** — ✅ 2026-07-12. `app.js`: persistent-map helpers (`ensureMap`/`tripMapStops`/`syncTripMap` + generation guard against nav races) driven from `viewTimeline` (fit-all) with a central hide in `route()`; the atlas only shows when a trip has ≥1 located stay (`body.map-bg`). `styles.css`: scoped map layer — theme-aware `--map-*` tokens, ground fade + full-strength pins, vignette, beige `#view` sheet (no backdrop-filter), legs-as-cards, transparent sub-nav.
3. **Interaction (settled after two owner rounds)** — ✅ 2026-07-12. *Round 1* (pan-to-stay on step-open) and *round 2* (per-card pin button that panned the backdrop) were both **tried and dropped** — the owner wanted the timeline to stay still ("I don't need my timeline to go flying around"). **Final:** the timeline/detail map is a **static, instant fit-all backdrop** with a visible pin per stay, not linked to the cards (`syncTripMap` is signature-guarded — one rebuild per trip, no focus). The interactivity lives entirely in **Map view**, where a pin is **clickable → opens that stop's step detail** (`map.js` position hit-test on `pointerup`, pan-guarded, → `onSelect` → `#/trip/<slug>/step/<id>`). Removed: the per-card pin button, `bindMapPins`, `focusIdxForStep`, `map.js` `focus`/active-dot.
4. **Map view tab** — ✅ 2026-07-12. `renderSubnav` "Map" tab + `trip/<slug>/map` route + `viewMap` (interactive foreground fit-all; empty-state when no coords) + `body.map-view` CSS (foreground z5 under the sticky top-bar/sub-nav, scroll-lock, stop labels shown).
5. **Coordinate capture** — ✅ 2026-07-12. Both wizard submit paths now also write `lat`/`lng` (via the existing `parseLatLng`) when the pasted location carries coordinates, so a UI-added stop pins on the map — not just `map_url`.
6. **Verify + reconcile + ship** — ✅ 2026-07-12. Owner reviewed light/dark + timeline/detail/Map view and signed off after the interaction settled + the detail back-header ("‹ Trip") white box was dropped under `body.map-bg`. Gates green (`node --check`; `validate-data`; a data-pipeline harness — real geodata parses, `geoPath` renders, all demo stops project on-canvas + the Map-view tap→select math resolves each stop; every asset 200 under the exact production CSP). Reconciled `CLAUDE.md`, `DESIGN.md`, this index, `releases.json` (v0.7.0). Kept the throwaway prototype's heavy runtime **out of version control** (WebGL `globe.gl` + earth textures, the rejected ortho/webgl/earth/flat approaches, the duplicated d3/topojson/geodata) — committed only the markdown record + the chosen atlas source (`atlas.html/js`, `proto-app.*`, `data.js`). Shipped via `scripts/pr-safe-push.sh` → PR #47.

## Outcome (Phase 2 — shipped)

The trip map is live in `public/`. On the timeline (and step/activity detail) a still, faded vector atlas
sits behind the content with a pin per located stay — no motion, not tied to the cards. The **Map** tab
opens the same atlas full-screen and interactive (pan/zoom); tapping a pin opens that stay's detail. The
map shows only when a trip has ≥1 stay with coordinates; coord-less trips keep the plain paper timeline and
the Map tab shows an empty-state. Coordinates arrive two ways: the add-stay wizard now also saves `lat`/`lng`
when a pasted Google-Maps link carries them, and the existing MCP `set_coordinate` backfills the rest.
Everything self-hosted (D3 + topojson + Natural Earth JSON under `public/vendor/`), zero external requests,
theme-aware via CSS — no migration, no worker redeploy.

**Follow-up (owner, when convenient):** authorize the `travel-planner` MCP connector and backfill
coordinates for the real trips' stays so their maps populate (until then those trips show the plain timeline).
