# 0015 · Research — what exists for a self-hosted, CSP-strict trip globe

> Companion to the [effort record](README.md) and the [design proposal](design/design.md). This is the
> "what already exists" half the owner asked for: rendering tech, open geodata, and the interaction
> patterns other apps use — all filtered through **this app's hard constraints**. Sources are linked
> inline. Written 2026-07-11.

## 0. The constraints that decide everything

Any map/globe here must live inside three non-negotiables, all pre-existing in the repo:

1. **Strict CSP** — [`public/_headers`](../../public/_headers):
   ```
   default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline';
   img-src 'self' data: blob:; font-src 'self'; connect-src 'self';
   base-uri 'self'; form-action 'self'; frame-ancestors 'none'; object-src 'none'
   ```
   Two mechanics do most of the ruling-out:
   - **WASM is blocked.** `WebAssembly.compile/instantiate` needs `script-src 'wasm-unsafe-eval'` (or legacy `'unsafe-eval'`); we have neither. → kills anything WASM-backed (CesiumJS).
   - **`blob:` workers are blocked.** The Worker-source CSP fallback chain is `worker-src → child-src → script-src → default-src`; with only `script-src 'self'` and no `blob:`, a Worker created from a `blob:` URL is refused. → this is MapLibre's default behaviour ([MapLibre CSP discussion #5509](https://github.com/maplibre/maplibre-gl-js/discussions/5509)).
   - **No external hosts at all.** `connect-src 'self'` blocks fetch/XHR to any tile/style/API server; `img-src` allows only same-origin + `data:`/`blob:`. → no Mapbox/Google/OSM tiles, no CDN scripts.
2. **$0** — no API keys, no billing, no paid tiles. (`CLAUDE.md`, `README.md`.)
3. **No build step** — `public/` is served as-is; `public/app.js` is a **classic script, not a module**
   ([`public/index.html`](../../public/index.html) `<script src="app.js">`). The one precedent for adding
   a library is a single self-hosted minified file in [`public/vendor/`](../../public/vendor) loaded via
   classic `<script>` (`anime.min.js`).

`DESIGN.md` already encoded a position on this: §2 *"Leave the live Mapbox map (needs their SDK/tiles/keys
— violates $0/no-deps; we render our own CSS spine instead)"*, and §8 bans a chart library for the same
reason. So a live tiled basemap is out by prior decision; **self-hosted vector geometry is the only path.**

## 1. Rendering libraries

| Library | Type | ~Size | License | WebGL / worker / WASM | Self-host offline? | Fits `script-src 'self'`? |
|---|---|---|---|---|---|---|
| **d3-geo (orthographic)** | SVG/Canvas 2D geo | ~30 KB (+topojson ~10 KB, +versor ~3 KB) | ISC | **none** | yes | **Cleanest — passes untouched** |
| **globe.gl / three-globe** | WebGL 3D globe | ~globe.gl + **three.js ~155 KB gz** | MIT | WebGL only; no worker/WASM | yes (must vendor/omit its default CDN texture) | **Yes**, once texture is local |
| **Cobe** | Stylized WebGL dotted globe | ~5 KB | MIT | WebGL; no worker/WASM | yes | Excellent — **but can't draw real country/region outlines** |
| **MapLibre GL JS + globe** | WebGL vector map | ~200–250 KB gz + PMTiles + a basemap file | BSD-3 | WebGL + **web worker**; no WASM | yes (PMTiles range-reads a local file) | **Awkward** — default `blob:` worker is blocked; needs `setWorkerUrl()` to a same-origin file + `img-src blob:` |
| **CesiumJS** | Full 3D geospatial engine | multi-MB | Apache-2.0 | WebGL + workers + **WASM** | possible but heavy; default imagery needs an ion token | **No** — WASM needs `'wasm-unsafe-eval'` |

**Detail on the two we'll prototype + the flat baseline:**

- **d3-geo orthographic** ([repo](https://github.com/d3/d3-geo), ISC) — pure JS to SVG paths or Canvas 2D
  via `geoPath`; `geoOrthographic()` gives the hemispherical globe; rotate by
  `projection.rotate([λ,φ,γ])` and redraw. Has everything: project `[lng,lat]`→`[x,y]` for dots,
  `geoInterpolate`/`LineString` through `geoPath` for great-circle arcs (auto-clipped to the visible
  hemisphere), `geoGraticule` for grid. [`topojson-client`](https://github.com/topojson/topojson-client)
  (ISC) decodes local TopoJSON; [`versor`](https://github.com/d3/versor) (ISC) gives smooth
  drag-to-rotate ([Observable demo](https://observablehq.com/@d3/versor-dragging)). **No workers, WASM,
  eval, or blob:** — the cleanest possible CSP fit. Cost: a 2D shaded disc (limited "3D wow"); global
  admin-1 in SVG is DOM-heavy → render to Canvas or use simplified data.
- **globe.gl** ([repo](https://github.com/vasturiano/globe.gl), [site](https://globe.gl/), MIT) over
  three-globe/three.js. Layer model maps 1:1 to the feature: **points** (dots), **arcs** (legs, with
  `arcDashLength`/`arcDashAnimateTime` for direction-of-travel), **polygons** from local GeoJSON
  (countries + admin-1). No workers/WASM/blob for rendering. **CSP gotcha:** its examples set
  `globeImageUrl` to a CDN texture — must vendor locally or run texture-less. three.js is ~155 KB gz on
  its own ([size discussion](https://github.com/pmndrs/react-three-fiber/discussions/812)). A UMD bundle
  can be vendored as one classic-script file (fits the no-build pattern).
- **Flat (d3-geo)** — same stack, swap the projection (`geoNaturalEarth1`/`geoMercator`). Clearest for
  single-region trips; nearly free to add once the orthographic prototype exists.
- **Ruled out:** **Cobe** (procedural dotted globe, no arbitrary GeoJSON → no real borders/regions);
  **CesiumJS** (WASM + ion token + multi-MB); **MapLibre+PMTiles** (real slippy basemap, self-hostable,
  but the heaviest to make CSP-clean with no build — `blob:` worker blocked, needs `setWorkerUrl()` to a
  vendored same-origin worker + `img-src blob: data:` + a tile-build step;
  [globe guide](https://github.com/maplibre/maplibre-gl-js/blob/main/developer-guides/globe.md),
  [PMTiles+CSP #4424](https://github.com/maplibre/maplibre-gl-js/discussions/4424)). Reserve MapLibre for
  if a true pan/zoom basemap ever becomes a priority and the CSP relaxations are acceptable.

## 2. Open geodata (countries + regions)

| Source | Coverage | License | Notes |
|---|---|---|---|
| **Natural Earth** | admin-0 countries + admin-1 states/provinces @ 110m/50m/10m | **Public domain** | [Terms](https://www.naturalearthdata.com/about/terms-of-use/): *"in the public domain … no permission needed."* Shapefiles → convert to Topo/GeoJSON. **Global admin-1 needs the 10m tier** ([~14 MB raw](https://www.naturalearthdata.com/downloads/10m-cultural-vectors/10m-admin-1-states-provinces/)) → **simplify with mapshaper**. |
| **world-atlas** | countries + land only (from NE) as TopoJSON | Public domain (NE) | [repo](https://github.com/topojson/world-atlas). `countries-110m.json` ≈ **108 KB**. **No admin-1.** Archived 2023 but the data is static → fine to vendor. |
| **geoBoundaries** | ADM0/1/2 | **CC BY 4.0** | Redistributable with attribution — a viable admin-1 alt if NE's regions are too coarse. |
| **GADM** | very detailed admin-1/2 | **Non-free** | [License](https://gadm.org/license.html): *"Redistribution or commercial use is not allowed without prior permission."* → **do not vendor.** |

**TopoJSON vs GeoJSON:** TopoJSON stores shared borders once + integer-quantizes → typically far smaller
(world countries 110m ≈ 108 KB Topo vs several hundred KB GeoJSON). Decode client-side with
`topojson-client`. Plan to **simplify** (mapshaper) to keep admin-1 lean.

## 3. Interaction & UX patterns

**Scrollytelling (the core pattern).** A sticky graphic reacts to a scrolling narrative column. The
reference impl is the [Mapbox storytelling template](https://github.com/mapbox/storytelling)
([demo](https://demos.mapbox.com/scrollytelling/)): chapters bound to camera views, active section
detected via **IntersectionObserver** (through [Scrollama](https://github.com/russellsamora/scrollama),
not scroll events — [NRK case study](https://developer.chrome.com/blog/nrk-casestudy) measured ~0.16 ms/frame
vs a 16.7 ms budget). Camera modes: **`flyTo`** (arc-out/in swoop — long jumps), **`easeTo`** (smooth —
short hops), **`jumpTo`** (instant — the reduced-motion fallback). Per-section layer opacity is the hook
for muting other dots and lighting the current one. Pinning = `position: sticky` + IntersectionObserver.

**Trip-viz precedents.** [Polarsteps](https://www.polarsteps.com/) draws the route on a world map and its
["Unpacked" year-in-review](https://news.polarsteps.com/news/polarsteps-unpacked-and-2025-travel-report-the-year-in-travel)
is the cinematic globe recap — a useful split between a *working map* and a *celebratory globe montage*.
Polarsteps explicitly **moved from straight segments to real routed paths** → straight/arc reads as
"planned," routed polylines as "what happened." [Google Earth Voyager/Studio](https://blog.google/products/earth/new-google-earth-creation-tools/)
("Present" mode) flies between placemarks. [Wanderlog](https://help.wanderlog.com/hc/en-us/sections/5154261209755--Map)
= mainstream convention: pins connected in order, **color/number by day/section**. Roadtrippers = routed
waypoints. Consensus visual language: **flights → arcs, ground → routed lines; order by date; current
stop saturated + larger, others muted.**

**Globe-specific interaction** — globe.gl gives, by prop: `pointOfView({lat,lng,altitude}, ms)` (fly-to;
altitude = zoom), orbit `controls.autoRotate`, `arcsData` + `arcDashAnimateTime` (direction), `ringsData`
(pulsing current dot), `showAtmosphere`. The [Shopify BFCM globe recreation](https://thenewstack.io/recreating-shopifys-bfcm-globe-using-react-globe-gl/)
is the copied aesthetic. **When a globe actually helps:** research
([flat vs globe](https://mapme.com/blog/flat-maps-vs-3d-globes-choosing-the-right-interactive-map/),
[VR task study](https://arxiv.org/abs/1908.02088)) says a globe helps only for **multi-continent** scope —
past ~zoom 6 there's no visible difference from a flat map, and globes add the **hidden-hemisphere**
problem (far-side stops need rotation) + GPU cost. → auto-frame to the trip; reserve the full globe for
multi-continent or a recap.

**Layout & a11y.** Desktop: sticky map beside the scrolling list. Mobile: sticky map on top + cards
beneath, or full-bleed map + swipeable bottom-sheet carousel. Non-negotiables from
[NRK](https://developer.chrome.com/blog/nrk-casestudy): honour **`prefers-reduced-motion`** (`flyTo`→
`jumpTo`, no auto-rotate); **never encode info only in the animation** (each card self-contained; keyboard/
screen-reader users navigate by step, not scroll); avoid big luminance jumps mid-scroll (flashing risk).

**Bidirectional sync + the one bug to plan for.** The closest documented build is this
[Svelte reactive scrolling map+list](https://dev.to/bryce/an-interactive-scrolling-map-list-in-svelte-34c3):
scroll → `flyTo` the active item + highlight; click a marker → `scrollIntoView` its card. **The critical
gotcha:** sharing ONE "active" store makes programmatic scroll (from a marker click) re-fire the scroll
observer → the map jumps to the wrong item. **Fix:** separate map-active vs list-active state and
**suppress the observer while a programmatic scroll animates** (guard flag/debounce). This is the #1
failure mode of the feature — designed around from day one.

## 4. Bottom line (feeds the design)

- Under the app's own CSP/$0/no-build rules, **d3-geo orthographic + Natural Earth TopoJSON is the only
  stack that satisfies every hard constraint with no relaxations** — and it still delivers a rotating
  globe with real countries + regions, dots, and great-circle arcs at ~50 KB.
- **globe.gl/three** is viable (CSP-clean once the texture is local) and gives more "wow" for ~155 KB+ gz
  — the tradeoff is weight and a flashier look vs the crisp editorial brand.
- **The prototypes exist to settle exactly that** weight/wow-vs-brand question live, under the real CSP,
  on a single-region trip and a multi-continent trip.
- The scroll-sync, camera choice (fly vs ease vs jump), route semantics (arc vs routed), muted/pulsing
  states, mobile layout, and reduced-motion behaviour are all well-trodden — captured in
  [`design/design.md`](design/design.md).
