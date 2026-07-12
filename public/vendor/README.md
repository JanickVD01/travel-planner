# Vendored runtime (self-hosted, no CDN)

- **anime.min.js** — Anime.js v4.5.0 UMD minified bundle. License: MIT © Julian Garnier
  (https://animejs.com). Sourced from the `animejs` npm package (`dist/bundles/anime.umd.min.js`).
  Loaded via a classic `<script>` in `index.html`; exposes the global `window.anime`
  (`anime.animate`, `anime.createTimeline`, `anime.stagger`, `anime.svg`, `anime.utils`, …).
  Self-hosted so a strict `script-src 'self'` CSP holds (see milestone M11).

- **d3.min.js** — D3 v7 UMD minified bundle. License: ISC © Mike Bostock (https://d3js.org).
  Powers the trip map (`map.js`): `d3-geo` (Mercator projection + `geoPath`/`geoGraticule10`),
  `d3-zoom` (pan/zoom + programmatic `zoom.transform`), and `d3-selection`/`d3-transition` for the
  fly-to animation. Exposes `window.d3`. Idle until `TripMap.setup()` runs (trip views only).
- **topojson-client.min.js** — TopoJSON client v3 UMD. License: ISC © Mike Bostock. Decodes the
  Natural Earth TopoJSON in `geo/` (`topojson.feature`, `topojson.mesh`). Exposes `window.topojson`.
- **geo/countries-50m.json**, **geo/admin1-lite.json** — Natural Earth vector geodata (**public
  domain**, https://www.naturalearthdata.com), converted to TopoJSON (world-atlas 50m land +
  countries; admin-1 regions, mapshaper-simplified). Fetched by `map.js` at runtime (same-origin,
  under `connect-src 'self'`). Under `/vendor/*` so they inherit the immutable cache header.
