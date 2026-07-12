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
        labelDefs.push({ el: t, bx: base[0], by: base[1], kind: kind });
      }
      countriesFC.features.forEach(function (f) { addLabel(f.properties.name, path.centroid(f), "country"); });
      regionsFC.features.forEach(function (f) { addLabel(f.properties.name, path.centroid(f), "region"); });
      stays.forEach(function (s) { addLabel(s.title, xy(s), "stop"); });

      applyZoom(curT);
    }

    function applyZoom(t) {
      curT = t; scene.setAttribute("transform", t.toString());
      var k = t.k;
      dots.forEach(function (c) { c.setAttribute("r", 6.5 / k); });   // constant ~6.5px on screen
      labelDefs.forEach(function (d) {
        var x = t.x + d.bx * k, y = t.y + d.by * k;
        d.el.setAttribute("x", x); d.el.setAttribute("y", y - (d.kind === "stop" ? 13 : 0));
        if (d.kind === "stop") return; // stop-label visibility is mode-driven via CSS; off-screen ones are clipped
        var vis = d.kind === "country" ? (k >= 2.2 && k < 16) : (k >= 15);
        d.el.style.display = (vis && x > -60 && x < W + 60 && y > -30 && y < H + 30) ? "" : "none";
      });
    }

    build();

    return {
      // Set / swap the trip's located stays ({lat,lng,title,stepId}, in trip order) and rebuild.
      setTrip: function (newStays) { stays = newStays || []; build(); },
      // Frame ALL stops (overview / Map view). Pads for the sticky top-bar + sub-nav.
      fitAll: function (animate) {
        var pts = stays.map(xy);
        if (!pts.length) return;
        var minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        pts.forEach(function (p) { minX = Math.min(minX, p[0]); maxX = Math.max(maxX, p[0]); minY = Math.min(minY, p[1]); maxY = Math.max(maxY, p[1]); });
        var padT = 118, padB = 56, padX = 64;
        var bw = Math.max(maxX - minX, 5), bh = Math.max(maxY - minY, 5);
        var k = Math.max(1.2, Math.min((W - 2 * padX) / bw, (H - padT - padB) / bh, 320));
        var cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
        var tT = d3.zoomIdentity.translate(W / 2, padT + (H - padT - padB) / 2).scale(k).translate(-cx, -cy);
        var sel = d3.select(svg);
        if (animate) sel.transition().duration(900).call(zoom.transform, tT);
        else sel.call(zoom.transform, tT);
      },
      onResize: function () { build(); },
      destroy: function () { d3.select(svg).on(".zoom", null); if (svg.parentNode) svg.parentNode.removeChild(svg); }
    };
  }
};
