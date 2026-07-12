# 0015 · Prototypes — run & compare

> Four runnable renderers for the [design](design.md), built to be compared live under the app's real
> CSP. **Throwaway**: they live under `docs/` (Pages never serves it). **Reconciled (0015 Phase 2):** only
> the chosen **atlas** source (`atlas.html/js`, `proto-app.*`, `data.js`) is kept in version control as the
> design snapshot; its heavy runtime deps (vendored d3/topojson, Natural Earth geodata) and the rejected
> ortho/webgl/earth/flat renderers + launcher were **left uncommitted** — the shipped version lives in
> `public/map.js`. So the commands below run only in a working tree that still has those local deps.

## Run

```bash
npx --yes wrangler@4 pages dev docs/implementations/0015-trip-globe/design/prototypes --port 8931 --ip 127.0.0.1
```

Open **http://127.0.0.1:8931/** → the launcher. Toggle **Thailand** (single country) vs **World** (four
continents) at the top; open **A / B / C**. The `prototypes/_headers` file makes `wrangler` serve under a
**copy of the production CSP** (`script-src 'self'`, no external hosts) — so anything that works here
works in the app.

## What each is

- **A · Orthographic globe** ([`ortho.js`](prototypes/ortho.js)) — `d3-geo` SVG sphere; rotates to each
  stop; countries (paper) + regions (hairline) + coral dots + dashed leg arcs; drag to spin. ~50 KB.
- **B · WebGL 3D globe** ([`webgl.js`](prototypes/webgl.js)) — `globe.gl`/`three.js`; atmosphere, lifted
  animated arcs, pulsing rings; default online texture **stripped** (solid material) so it stays CSP-clean. ~1.5 MB.
- **D · Earth (8K)** ([`earth.js`](prototypes/earth.js)) — the **app-integration preview**: an 8K
  self-hosted day texture (anisotropic-filtered for crispness), crisp HTML dot markers, **mode-aware legs**
  (plane = 3D arch, train = surface line), a **zoom-out → fly → zoom-in** camera, and the globe as a
  **full-bleed background** with steps on a frosted overlay panel. All imagery same-origin. ~1.5 MB engine + ~5 MB imagery.
- **C · Flat map** ([`flat.js`](prototypes/flat.js)) — `d3-geo` `geoNaturalEarth1`; the map pans/zooms to
  the active stop via a transform transition. Baseline. ~50 KB.

All three share the itinerary + scroll-sync harness ([`harness.js`](prototypes/harness.js)), so only the
renderer differs.

## What to look for

1. **Countries *and* regions** — are both legible without looking busy?
2. **Current-stop clarity** — does the active dot pulse while the others stay muted?
3. **Scroll sync** — scrolling the list turns/pans the map to the right stop; **click a dot** → the list
   scrolls to its card (no jump-to-wrong-card feedback bug).
4. **Single vs multi** — does the globe read well for **Thailand** (auto-framed) or is **C** clearer
   there? Does **World** show off arcs/rotation?
5. **Weight & feel** — perceived snappiness; does it match the crisp editorial brand?
6. **CSP (the real test)** — DevTools **Console** shows *no CSP violations*; **Network** shows *no
   external requests* (all same-origin). Especially check **B** (the WebGL bundle).

## Comparison scorecard  *(owner fills during review)*

| Criterion | A · Ortho | B · WebGL | D · Earth | C · Flat |
|---|---|---|---|---|
| Countries + regions clear |  |  |  |  |
| "Wow" / delight |  |  |  |  |
| Brand fit (Transit Line) |  |  |  |  |
| Reads well — Thailand |  |  |  |  |
| Reads well — World |  |  |  |  |
| Snappiness / weight |  |  |  |  |
| No CSP violations |  |  |  |  |

## Decision

_(to fill after review)_ — **Chosen approach:** … · **Why:** … · **Tweaks wanted before production:** …
