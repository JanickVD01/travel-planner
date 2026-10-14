/* Trip map — crisp flat VECTOR map (d3-geo Mercator + d3.zoom). Two roles:
 *  - a calm, static faded backdrop behind the itinerary (ground dimmed via CSS; pins full-strength);
 *  - a foreground "Map view" that pans/zooms and whose pins are clickable (→ opens the step detail).
 * Gapless 50m land + topojson.mesh borders (no slivers). Colours come from CSS *classes*
 * (map-ocean / map-land / map-border / …, each `fill`/`stroke: var(--map-*)`) so the map re-tints with
 * the theme automatically on `data-theme` flip — no JS recolour. Geodata is self-hosted and fetched at
 * runtime (same-origin, under `connect-src 'self'`).
 *
 * No build, no framework — classic <script>, exposes window.TripMap. Idle until setup().
 * Ported from docs/implementations/0015-trip-globe/design/prototypes/atlas.js. */
// Label sizes (px, mirrors styles.css .atlas-label.*) + placement priority: lower = placed first.
// cw = average glyph width as a share of the font size (uppercase + letter-spacing for countries).
var LABEL_METRICS = {
  stop:    { fs: 12,   cw: 0.62, pri: 0 },
  trip:    { fs: 13,   cw: 0.68, pri: 1 },
  country: { fs: 12,   cw: 0.86, pri: 2 },
  region:  { fs: 10.5, cw: 0.56, pri: 3 }
};
window.TripMap = {
  async setup(mapEl, opts) {
    opts = opts || {};
    var onSelect = typeof opts.onSelect === "function" ? opts.onSelect : null;
    var svgNS = "http://www.w3.org/2000/svg";
    function el(parent, tag, attrs) { var e = document.createElementNS(svgNS, tag); for (var k in attrs) e.setAttribute(k, attrs[k]); parent.appendChild(e); return e; }

    var loaded = await Promise.all([
      fetch("vendor/geo/countries-50m.json").then(function (r) { return r.json(); }),
      fetch("vendor/geo/admin1-lite.json").then(function (r) { return r.json(); })
    ]);
    var c50 = loaded[0], a1 = loaded[1];
    var a1key = Object.keys(a1.objects)[0];
    var landFeat = topojson.feature(c50, c50.objects.land);
    var countriesFC = topojson.feature(c50, c50.objects.countries);
    var regionsFC = topojson.feature(a1, a1.objects[a1key]);
    var countryMesh = topojson.mesh(c50, c50.objects.countries, function (a, b) { return a !== b; });
    var regionMesh = topojson.mesh(a1, a1.objects[a1key], function (a, b) { return a !== b; });

    var svg = document.createElementNS(svgNS, "svg"); mapEl.appendChild(svg);
    var ocean = el(svg, "rect", { x: 0, y: 0, class: "map-ocean" });
    var scene = document.createElementNS(svgNS, "g"); svg.appendChild(scene);
    var gGround = document.createElementNS(svgNS, "g"); gGround.setAttribute("class", "map-ground"); scene.appendChild(gGround);
    var gPins = document.createElementNS(svgNS, "g"); gPins.setAttribute("class", "map-pins"); scene.appendChild(gPins);
    var labelsG = document.createElementNS(svgNS, "g"); labelsG.setAttribute("class", "atlas-labels"); svg.appendChild(labelsG);

    var projection = d3.geoMercator();
    var path = d3.geoPath(projection);

    var W = 0, H = 0, curT = d3.zoomIdentity;
    var dots = [], labelDefs = [], stays = [];
    // Trip regions on the map (0019): the provinces the trip's stays are in (found once per trip in
    // setTrip, never per redraw) + one label per trip region; focusRegion() emphasises one of them.
    var tripAreas = [], tripLabels = [], areaEls = [], focusId = null, extraTop = 0;
    var zoom = d3.zoom().scaleExtent([1, 3000]).on("zoom", function (ev) { applyZoom(ev.transform); });
    d3.select(svg).call(zoom);

    // Tap-to-select (interactive Map view only; the backdrop has pointer-events:none so this never fires
    // there). We hit-test the tap position against the stops in screen space rather than putting click
    // handlers on the dots — d3.zoom captures pointer events, so a position test is the robust path. A tap
    // that moved > a few px is treated as a pan, not a select.
    var downX = 0, downY = 0;
    svg.addEventListener("pointerdown", function (e) { downX = e.clientX; downY = e.clientY; });
    svg.addEventListener("pointerup", function (e) {
      if (!onSelect || !stays.length) return;
      var mdx = e.clientX - downX, mdy = e.clientY - downY;
      if (mdx * mdx + mdy * mdy > 36) return;                 // moved > 6px → a pan, not a tap
      var rect = svg.getBoundingClientRect();
      var px = e.clientX - rect.left, py = e.clientY - rect.top;
      var best = -1, bestD = Infinity;
      for (var i = 0; i < stays.length; i++) {
        var p = projection([+stays[i].lng, +stays[i].lat]);
        var sx = curT.x + p[0] * curT.k, sy = curT.y + p[1] * curT.k;   // scene point → screen (svg-local px)
        var d = (sx - px) * (sx - px) + (sy - py) * (sy - py);
        if (d < bestD) { bestD = d; best = i; }
      }
      var HIT = 28;                                            // px radius — covers the dot and its label
      if (best >= 0 && bestD <= HIT * HIT) onSelect(stays[best]);
    });

    function xy(s) { return projection([+s.lng, +s.lat]); }

    function legD() {
      var d = "";
      for (var i = 0; i < stays.length - 1; i++) {
        var a = xy(stays[i]), b = xy(stays[i + 1]);
        d += "M" + a[0] + "," + a[1] + "L" + b[0] + "," + b[1];
      }
      return d;
    }

    function build() {
      W = mapEl.clientWidth; H = mapEl.clientHeight;
      if (!W || !H) return;
      svg.setAttribute("width", W); svg.setAttribute("height", H); svg.setAttribute("viewBox", "0 0 " + W + " " + H);
      ocean.setAttribute("width", W); ocean.setAttribute("height", H);
      projection.fitExtent([[2, 2], [W - 2, H - 2]], { type: "Sphere" });

      [gGround, gPins, labelsG].forEach(function (g) { while (g.firstChild) g.removeChild(g.firstChild); });
      dots = []; labelDefs = [];

      el(gGround, "path", { d: path(d3.geoGraticule10()) || "", class: "map-grat", "stroke-width": 0.5, "vector-effect": "non-scaling-stroke" });
      el(gGround, "path", { d: path(landFeat) || "", class: "map-land" });
      el(gGround, "path", { d: path(regionsFC) || "", class: "map-land" });
      areaEls = tripAreas.map(function (a) {
        var pe = el(gGround, "path", { d: path(a.f) || "", class: "map-trip-area", "stroke-width": 1, "vector-effect": "non-scaling-stroke" });
        pe.setAttribute("data-regions", a.regions.join(" "));
        return pe;
      });
      el(gGround, "path", { d: path(countryMesh) || "", class: "map-border", "stroke-width": 0.7, "vector-effect": "non-scaling-stroke" });
      el(gGround, "path", { d: path(regionMesh) || "", class: "map-region", "stroke-width": 0.5, "vector-effect": "non-scaling-stroke" });
      el(gGround, "path", { d: legD(), class: "map-leg", "stroke-width": 1.4, "stroke-linecap": "round", "vector-effect": "non-scaling-stroke" });

      dots = stays.map(function (s) {
        var p = xy(s);
        return el(gPins, "circle", { cx: p[0], cy: p[1], r: 6.5, class: "map-dot", "stroke-width": 2, "vector-effect": "non-scaling-stroke" });
      });

      function addLabel(text, base, kind) {
        if (!text || !base || isNaN(base[0])) return;
        var t = el(labelsG, "text", { class: "atlas-label " + kind }); t.textContent = text;
        // Approximate on-screen box (labels are constant-size px, see styles.css .atlas-label.*), measured
        // once here so the per-frame collision pass in applyZoom stays cheap (no getBBox while panning).
        var m = LABEL_METRICS[kind] || LABEL_METRICS.region;
        labelDefs.push({ el: t, bx: base[0], by: base[1], kind: kind, w: text.length * m.fs * m.cw, fs: m.fs, pri: m.pri });
      }
      countriesFC.features.forEach(function (f) { addLabel(f.properties.name, path.centroid(f), "country"); });
      regionsFC.features.forEach(function (f) { addLabel(f.properties.name, path.centroid(f), "region"); });
      stays.forEach(function (s) { addLabel(s.title, xy(s), "stop"); });
      labelDefs.sort(function (a, b) { return a.pri - b.pri; });   // placement priority (see LABEL_METRICS)
      tripLabels.forEach(function (t) {                         // just below the middle of the region's stays
        var pts = t.stays.map(xy), x = 0, y = 0;
        pts.forEach(function (p) { x += p[0]; y += p[1]; });
        addLabel(t.text, [x / pts.length, y / pts.length], "trip");
        labelDefs[labelDefs.length - 1].regions = t.regions;
      });
      labelDefs.sort(function (a, b) { return a.pri - b.pri; });
      applyFocus();

      applyZoom(curT);
    }

    // Labels never overlap (owner, 2026-10-13: "all this text is way too crowded"): a greedy pass places them
    // in priority order — stay names, then trip regions, then countries, then provinces — and skips any whose
    // box would hit one already placed (or a pin). Provinces only show where there is room; zoom in for more.
    function applyZoom(t) {
      curT = t; scene.setAttribute("transform", t.toString());
      var k = t.k, placed = [], said = [], PAD = 2;
      // Region names win over a stay named the same ("Bangkok" stay in the "Bangkok" region): collect them first.
      labelDefs.forEach(function (d) {
        if (d.kind !== "trip") return;
        var ax = t.x + d.bx * k, ay = t.y + d.by * k;
        (d.el.textContent || "").toLowerCase().split(" · ").forEach(function (part) { said.push({ t: part, x: ax, y: ay, region: true }); });
      });
      dots.forEach(function (c, i) {
        c.setAttribute("r", 6.5 / k);                                  // constant ~6.5px on screen
        var p = xy(stays[i]), sx = t.x + p[0] * k, sy = t.y + p[1] * k;
        placed.push([sx - 6, sy - 6, sx + 6, sy + 6]);                 // pins stay readable: nothing sits on them (r 6.5)
      });
      var free = function (b) {
        for (var i = 0; i < placed.length; i++) { var q = placed[i]; if (b[0] < q[2] && b[2] > q[0] && b[1] < q[3] && b[3] > q[1]) return false; }
        return true;
      };
      labelDefs.forEach(function (d) {
        var ax = t.x + d.bx * k, ay = t.y + d.by * k;
        var vis = d.kind === "stop" || d.kind === "trip" ? true : d.kind === "country" ? (k >= 2.2 && k < 16) : (k >= 15);
        if (!vis || ax < -60 || ax > W + 60 || ay < -40 || ay > H + 60) { d.el.style.display = "none"; return; }
        // A stay / region name tries a few spots around its anchor before giving up (close pins block the first).
        // The same name already shown close by (two "Bangkok" stays, or a stay named like its region) says nothing new.
        var txt = (d.el.textContent || "").toLowerCase();
        if (d.kind === "stop") {
          var dup = said.some(function (q) { return q.t === txt && Math.abs(q.x - ax) < 90 && Math.abs(q.y - ay) < 60; });
          if (dup) { d.el.style.display = "none"; return; }
        }
        var spots = d.kind === "stop" ? [[0, -13], [0, 20], [d.w / 2 + 10, 4], [-d.w / 2 - 10, 4]]
          : d.kind === "trip" ? [[0, 24], [0, -30], [0, 40], [0, -46]] : [[0, 0]];
        for (var i = 0; i < spots.length; i++) {
          var x = ax + spots[i][0], y = ay + spots[i][1];
          var b = [x - d.w / 2 - PAD, y - d.fs * 0.95 - PAD, x + d.w / 2 + PAD, y + d.fs * 0.25 + PAD];   // text-anchor:middle, y = baseline
          if (free(b)) {
            placed.push(b); if (d.kind === "stop") said.push({ t: txt, x: ax, y: ay }); d.el.setAttribute("x", x); d.el.setAttribute("y", y);
            d.el.style.display = "";                                   // "" = CSS decides (stop labels: Map view / workspace only)
            return;
          }
        }
        d.el.style.display = "none";
      });
    }

    // Which provinces the trip touches, and one label per trip region (regions at the same spot share one).
    function indexTrip() {
      var byFeature = new Map(), byRegion = new Map();
      stays.forEach(function (s) {
        var pt = [+s.lng, +s.lat], f = null;
        for (var i = 0; i < regionsFC.features.length && !f; i++) if (d3.geoContains(regionsFC.features[i], pt)) f = regionsFC.features[i];
        if (f) {
          if (!byFeature.has(f)) byFeature.set(f, []);
          if (s.regionId && byFeature.get(f).indexOf(s.regionId) < 0) byFeature.get(f).push(s.regionId);
        }
        if (s.regionId) {
          if (!byRegion.has(s.regionId)) byRegion.set(s.regionId, { title: s.regionTitle || "", stays: [] });
          byRegion.get(s.regionId).stays.push(s);
        }
      });
      tripAreas = [];
      byFeature.forEach(function (regs, f) { tripAreas.push({ f: f, regions: regs }); });
      var groups = [];                                           // merge regions whose stays sit at the same spot
      byRegion.forEach(function (g, id) {
        var lat = 0, lng = 0;
        g.stays.forEach(function (s) { lat += +s.lat; lng += +s.lng; });
        lat /= g.stays.length; lng /= g.stays.length;
        var hit = groups.find(function (x) { return Math.abs(x.lat - lat) < 0.05 && Math.abs(x.lng - lng) < 0.05; });
        if (hit) {
          hit.regions.push(id);
          if (g.title && hit.titles.indexOf(g.title) < 0) hit.titles.push(g.title);
          hit.stays = hit.stays.concat(g.stays);
        } else groups.push({ lat: lat, lng: lng, regions: [id], titles: g.title ? [g.title] : [], stays: g.stays.slice() });
      });
      tripLabels = groups.filter(function (x) { return x.titles.length; })
        .map(function (x) { return { text: x.titles.join(" · "), regions: x.regions, stays: x.stays }; });
    }
    function applyFocus() {
      svg.classList.toggle("has-focus", !!focusId);
      areaEls.forEach(function (pe) {
        pe.classList.toggle("is-focus", !!focusId && (pe.getAttribute("data-regions") || "").split(" ").indexOf(focusId) >= 0);
      });
      labelDefs.forEach(function (d) { if (d.kind === "trip") d.el.classList.toggle("is-focus", !!focusId && d.regions.indexOf(focusId) >= 0); });
    }
    // The container can change size without a window resize (the 0020 side pane <-> the full-screen Map
    // tab): redraw at the new size before projecting anything.
    function ensureSize() { if (mapEl.clientWidth && mapEl.clientHeight && (mapEl.clientWidth !== W || mapEl.clientHeight !== H)) build(); }
    // Frame scene-space points (+ optional extra [[x0,y0],[x1,y1]] boxes), padding out the sticky chrome.
    function frame(pts, boxes, animate, maxK) {
      if (!pts.length && !(boxes && boxes.length)) return;
      var minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      pts.forEach(function (p) { minX = Math.min(minX, p[0]); maxX = Math.max(maxX, p[0]); minY = Math.min(minY, p[1]); maxY = Math.max(maxY, p[1]); });
      (boxes || []).forEach(function (b) { minX = Math.min(minX, b[0][0]); minY = Math.min(minY, b[0][1]); maxX = Math.max(maxX, b[1][0]); maxY = Math.max(maxY, b[1][1]); });
      var padT = extraTop || 118, padB = 56, padX = 64;   // 118 = top bar + sub-nav; setTopPad() overrides it
      // Floor the box at ~0.25° of map (scales with the screen): a fixed 5px floor capped the zoom on phones,
      // where the whole world is only ~390px wide at k=1 and a province is ~1px.
      var minBox = Math.max(W, H) / 1400;
      var bw = Math.max(maxX - minX, minBox), bh = Math.max(maxY - minY, minBox);
      var k = Math.max(1.2, Math.min((W - 2 * padX) / bw, (H - padT - padB) / bh, maxK || 320));
      var cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
      var tT = d3.zoomIdentity.translate(W / 2, padT + (H - padT - padB) / 2).scale(k).translate(-cx, -cy);
      var sel = d3.select(svg);
      if (animate) sel.transition().duration(900).call(zoom.transform, tT);
      else sel.call(zoom.transform, tT);
    }

    build();

    return {
      // Set / swap the trip's located stays ({lat,lng,title,stepId,regionId?,regionTitle?}, in trip order) and rebuild.
      setTrip: function (newStays) { stays = newStays || []; focusId = null; indexTrip(); build(); },
      // Frame ALL stops (overview / Map view). Pads for the sticky top-bar + sub-nav.
      fitAll: function (animate) { ensureSize(); frame(stays.map(xy), null, animate); },
      // Emphasise one trip region (its provinces + label) and frame it; null = the whole trip again (0019).
      focusRegion: function (id, animate) {
        ensureSize(); focusId = id || null; applyFocus();
        if (!focusId) { frame(stays.map(xy), null, animate); return; }
        var pts = stays.filter(function (s) { return s.regionId === focusId; }).map(xy);
        var boxes = tripAreas.filter(function (a) { return a.regions.indexOf(focusId) >= 0; }).map(function (a) { return path.bounds(a.f); });
        frame(pts, boxes, animate, 400);
      },
      focusedRegion: function () { return focusId; },
      // Top padding (px from the viewport top) when more chrome sits over the map (the Map view's region
      // chips); 0 = the default (top bar + sub-nav).
      setTopPad: function (px) { extraTop = Math.max(0, Number(px) || 0); },
      onResize: function () { build(); },
      // Has the container changed size since the last draw? (0020: pane <-> full screen)
      needsResize: function () { return !!(mapEl.clientWidth && mapEl.clientHeight) && (mapEl.clientWidth !== W || mapEl.clientHeight !== H); },
      // Emphasise one stop's pin (a hovered timeline card, 0020); null clears.
      highlightStop: function (stepId) {
        dots.forEach(function (c, i) { c.classList.toggle("is-hot", stepId != null && String(stays[i].stepId) === String(stepId)); });
      },
      destroy: function () { d3.select(svg).on(".zoom", null); if (svg.parentNode) svg.parentNode.removeChild(svg); }
    };
  }
};
