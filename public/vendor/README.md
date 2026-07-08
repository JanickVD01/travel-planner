# Vendored runtime (self-hosted, no CDN)

- **anime.min.js** — Anime.js v4.5.0 UMD minified bundle. License: MIT © Julian Garnier
  (https://animejs.com). Sourced from the `animejs` npm package (`dist/bundles/anime.umd.min.js`).
  Loaded via a classic `<script>` in `index.html`; exposes the global `window.anime`
  (`anime.animate`, `anime.createTimeline`, `anime.stagger`, `anime.svg`, `anime.utils`, …).
  Self-hosted so a strict `script-src 'self'` CSP holds (see milestone M11).
