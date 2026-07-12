# 0015 · Design — the trip globe

> The design proposal for the visual itinerary map. Reads on top of [`../research.md`](../research.md)
> (what exists) and the [effort record](../README.md). The three approaches it weighs are **runnable** —
> see [`prototypes/`](prototypes/index.html) and [`prototypes.md`](prototypes.md). Written 2026-07-11.

## The vision (restated)

A rotating Earth beside the itinerary that shows **where the trip goes** — countries and their regions,
a **dot per stop**, arcs for the legs — and that **moves to focus the step you're scrolling**, so the
shape of the journey (up, down, across) is legible at a glance. Bidirectional: scroll the list → the
globe turns and the current dot pulses; tap a dot → the list scrolls to that stop.

## 1. Rendering approach — decide from the prototypes

All three are $0, fully self-hosted, and pass the app's CSP. They differ in weight, "wow", and brand fit
(full analysis in [`../research.md`](../research.md) §1).

| | A · Orthographic | B · WebGL globe | D · Earth (texture) | C · Flat map |
|---|---|---|---|---|
| Stack | `d3-geo` SVG | `globe.gl`/`three.js` | `globe.gl` + Blue Marble | `d3-geo` SVG |
| Weight | ~50 KB | ~1.5 MB | ~1.5 MB + ~2.7 MB imagery | ~50 KB |
| Countries + regions | ✅ | ✅ | borders + photoreal terrain | ✅ |
| "3D wow" | moderate | high | highest (photoreal) | none |
| Brand fit (crisp/editorial) | strong | flashier | photoreal, off the flat brand | strong |
| CSP | clean | clean (solid material) | clean (texture self-hosted) | clean |

**Recommendation to validate:** **A (orthographic)** — delivers the globe, shows countries + regions,
stays tiny, matches the "Transit Line" brand with zero CSP friction. **B** if cinematic depth is worth
~30× the weight. **D** is the "Google Earth vibe" — photoreal blue oceans/terrain from a self-hosted NASA
Blue Marble texture; the most impressive and familiar, but the heaviest (~4 MB imagery) and the furthest
from the flat editorial brand. **C** is the honest baseline (and a responsive fallback for single-region
trips). The live comparison ([`prototypes.md`](prototypes.md)) settles it.

## 2. Layout & the scroll-sync interaction

- **Two layout models:** (a) *comparison* — sticky globe beside the scrolling list (A/B/C); (b) **app
  model (D)** — the globe is a **full-bleed background** and the steps overlay on a **frosted panel**
  (translucent + blur) so they stay readable while the map shifts behind them. The app model is the
  intended integration and reuses the pinned-photo readability idea (0011). Mobile: the panel becomes a
  bottom-weighted scrim over the background globe. Single **720px** breakpoint
  ([`styles.css`](../../../../public/styles.css)).
- **Active-step detection:** `IntersectionObserver` with a thin **trigger band** at viewport centre
  (not scroll events — cheaper, per the [NRK study](https://developer.chrome.com/blog/nrk-casestudy)).
- **Camera "flies":** moving A→B is a **zoom-out → travel over → zoom-in** choreography (pull back, arc
  across, descend) so it reads as flying there, not teleporting; **`jumpTo` (instant) under
  `prefers-reduced-motion`**. Orthographic = great-circle `d3.geoInterpolate` rotation; WebGL/Earth = a
  two-phase `pointOfView` (rise to a mid-point at altitude, then descend to the target).
- **Bidirectional + the one bug to avoid:** scroll → focus + pulse; click a dot → `scrollIntoView` its
  card. Both write one `activeStep`, **but** a programmatic scroll must not re-fire the observer and
  fight the animation — so the harness sets a **suppression flag** during programmatic scrolls (the
  documented feedback-loop fix; [`prototypes/harness.js`](prototypes/harness.js) `selectStep`).

## 3. Data-model fit (real app)

- The **route = the ordered `stay` coordinates** (`sort_order` in [`shared/core.js`](../../../../shared/core.js)).
- **Travel legs usually have no coords**, so a leg is the **arc between the adjacent stays**, styled by
  `transport`: **flight → a raised 3D arch** (dashed, animated in the travel direction); **train/road → a
  line hugging the surface** (rail-blue). Matches the seed data, where legs are route strings ("BRU →
  BKK") with no point of their own.
- A focused stay can reveal its **activities as sub-dots** (activities carry their own `lat`/`lng`).
- **Missing coordinates degrade gracefully** — no dot, no broken arc; the leg simply connects the next
  known points. (An MCP `set_map_url`/coord backfill helps but isn't required.)
- **Auto-frame to the trip's extent:** compute the stays' centroid + angular spread; zoom in for a
  single-country trip (reads like a regional map) and pull back for multi-continent. This is the honest
  answer to "a globe is only useful across continents" — the globe adapts instead of always showing the
  whole Earth.

## 4. Where it mounts in the SPA

The hash router rebuilds `#view` wholesale per route ([`public/app.js`](../../../../public/app.js)
`route()`), so a persistent globe instance must either live **outside `#view`** (a container that
survives navigation, updated on route change) or be **re-created** when the map view opens. Simplest
first cut: a **"Map" tab** in the trip subnav (`renderSubnav` notes adding a tab is a one-line push),
rendering the globe + the step list into `#view`; the globe is built on entry and torn down on leave.
A persistent side-panel globe on the timeline itself is a possible later enhancement.

Delivery follows the **vendor pattern**: the chosen library minified into
[`public/vendor/`](../../../../public/vendor) + the geodata into `public/data/geo/`, loaded via classic
`<script>` (like `anime.min.js`), no build step.

## 5. Brand, motion, accessibility

- **Palette** ([`tokens.css`](../../../../public/tokens.css)): warm paper ocean, `paper-2` land with
  hairline borders, **coral (`--accent`) stops**, transit-mode colors for legs (rail blue / flight coral
  / ferry teal / road amber). Matches `DESIGN.md`'s language and its §2 "render our own map" stance.
- **Motion:** animate only `transform`/`opacity`; everything behind `prefers-reduced-motion`
  (fly/rotate/dash all disabled → instant `jumpTo`, static end-state), per `DESIGN.md` §7.
- **Accessibility:** every stop reachable without scrolling (focusable cards + clickable dots writing the
  same `activeStep`); **information never lives only in the animation** — each card is self-contained
  (place, dates, country); avoid large luminance swings mid-scroll.

## 6. CSP & data pipeline

- **Runtime = zero external calls.** Library + geodata self-hosted; no tiles, no CDN, no keys — honoring
  [`public/_headers`](../../../../public/_headers) `script-src 'self'` / `connect-src 'self'` untouched.
  (Confirmed: the prototypes serve under a copy of that exact CSP.)
- **Geodata = Natural Earth (public domain).** Countries from world-atlas 110m (~108 KB); admin-1 regions
  from Natural Earth 10m, **filtered to the trip's countries + simplified with mapshaper** (the prototype
  ships a 117 KB lite file for 5 sample countries). **Not GADM** (its license bars redistribution). Prep
  is offline; nothing is fetched at runtime.
- **Real-app data note:** to keep the payload small, regions could be loaded **per trip** (only the
  countries a trip visits) rather than a global admin-1 blob.
- **Earth imagery (D only) — mind the license + crispness.** The prototype uses an **8K day map from
  Solar System Scope (CC BY 4.0 — requires attribution)** for a crisp Google-Earth look. The
  zero-attribution alternative is **NASA Blue Marble Next Generation (public domain)** at ≤5400×2700.
  Production picks on the weight/attribution tradeoff (~1.6 MB NASA vs ~4.5 MB 8K). Crispness also needs
  **`texture.anisotropy` = renderer max** — without it the globe blurs at grazing angles regardless of
  resolution (this was the main cause of the pixelation in the first pass). True tile-level sharpness on
  deep zoom isn't reachable self-hosted; frame the globe so it never over-zooms a single equirectangular image.

## 7. Open questions the prototypes settle

1. Orthographic (A) vs WebGL (B) — is the 3D depth worth ~1.5 MB and a flashier look, or does the crisp
   ~50 KB globe win on brand + weight?
2. Does the globe read well for the **single-country** case (Thailand) once auto-framed, or is a flat map
   (C) clearer there — i.e. do we want the globe always, or adaptive globe/flat?
3. Arc styling: great-circle "flight" arcs for everything, or per-`transport` (arc for air, straight for
   ground)?

## 8. Proposed production plan (the follow-up effort, after sign-off)

A rough shape, not this effort's work: (1) vendor the chosen lib + a data pipeline for per-trip geodata;
(2) a `TripMap` module reading the live `steps`/`activities`; (3) a "Map" subnav tab + mount/unmount around
`route()`; (4) the scroll-sync + bidirectional selection reusing the harness logic; (5) reduced-motion +
mobile + keyboard; (6) reconcile `DESIGN.md` §2/§8 (the "we render our own map" note gains its exception).
