/* Atlas — crisp flat VECTOR map (d3-geo Mercator + d3.zoom). Two roles:
 *  - faded background behind the timeline (ground layers dimmed; PINS full-strength);
 *  - foreground "Map view" (fitAll + manual pan/zoom).
 * Gapless 50m land + topojson.mesh borders (no slivers). Colours via CSS classes
 * (map-ocean/land/border/… driven by --map-* props) so it re-tints with the theme. */
window.PROTO = {
  label: "Atlas · flat vector map",
  async setup(mapEl, ctx) {
    var svgNS = "http://www.w3.org/2000/svg";
    function el(parent, tag, attrs) { var e = document.createElementNS(svgNS, tag); for (var k in attrs) e.setAttribute(k, attrs[k]); parent.appendChild(e); return e; }

    var c50 = await fetch("data/countries-50m.json").then(function (r) { return r.json(); });
    var a1 = await fetch("data/admin1-lite.json").then(function (r) { return r.json(); });
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

    var W = 0, H = 0, curT = d3.zoomIdentity, activeIdx = -1, lastTarget = null;
    var dots = [], labelDefs = [];
    var zoom = d3.zoom().scaleExtent([1, 3000]).on("zoom", function (ev) { applyZoom(ev.transform); });
    d3.select(svg).call(zoom);

    function legD() {
      var d = "";
      for (var i = 0; i < ctx.stays.length - 1; i++) {
        var a = projection([ctx.stays[i].lng, ctx.stays[i].lat]), b = projection([ctx.stays[i + 1].lng, ctx.stays[i + 1].lat]);
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

      dots = ctx.stays.map(function (s) {
        var p = projection([s.lng, s.lat]);
        return el(gPins, "circle", { cx: p[0], cy: p[1], r: 6.5, class: "map-dot", "stroke-width": 2, "vector-effect": "non-scaling-stroke" });
      });

      function addLabel(text, base, kind) {
        if (!base || isNaN(base[0])) return;
        var t = el(labelsG, "text", { class: "atlas-label " + kind }); t.textContent = text;
        labelDefs.push({ el: t, bx: base[0], by: base[1], kind: kind });
      }
      countriesFC.features.forEach(function (f) { addLabel(f.properties.name, path.centroid(f), "country"); });
      regionsFC.features.forEach(function (f) { addLabel(f.properties.name, path.centroid(f), "region"); });
      ctx.stays.forEach(function (s) { addLabel(s.title, projection([s.lng, s.lat]), "stop"); });

      applyZoom(curT);
    }

    function applyZoom(t) {
      curT = t; scene.setAttribute("transform", t.toString());
      var k = t.k;
      dots.forEach(function (c, i) { c.setAttribute("r", (i === activeIdx ? 8 : 6.5) / k); });
      labelDefs.forEach(function (d) {
        var x = t.x + d.bx * k, y = t.y + d.by * k;
        d.el.setAttribute("x", x); d.el.setAttribute("y", y - (d.kind === "stop" ? 13 : 0));
        if (d.kind === "stop") return; // visibility of stop labels is mode-driven via CSS; off-screen ones are clipped
        var vis = d.kind === "country" ? (k >= 2.2 && k < 16) : (k >= 15);
        d.el.style.display = (vis && x > -60 && x < W + 60 && y > -30 && y < H + 30) ? "" : "none";
      });
    }

    build();

    return {
      // anchor = {x,y} viewport point to place the stop at (the step's spine marker),
      // so the map pin sits exactly under that step's dot. Falls back to centre.
      focus: function (target, activeStay, animate, anchor) {
        activeIdx = activeStay; lastTarget = target;
        dots.forEach(function (c, i) { c.classList.toggle("active", i === activeStay); });
        var p = projection([target.lng, target.lat]);
        var ax = anchor ? anchor.x : W * 0.5, ay = anchor ? anchor.y : H * 0.42;
        var kf = 56;
        var tT = d3.zoomIdentity.translate(ax, ay).scale(kf).translate(-p[0], -p[1]);
        if (!animate) d3.select(svg).call(zoom.transform, tT);
        else d3.select(svg).transition().duration(1100).call(zoom.transform, tT);
      },
      // Frame ALL stops (Map view). Pads for the sticky top-bar + sub-nav.
      fitAll: function (animate) {
        var pts = ctx.stays.map(function (s) { return projection([s.lng, s.lat]); });
        if (!pts.length) return;
        var minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        pts.forEach(function (p) { minX = Math.min(minX, p[0]); maxX = Math.max(maxX, p[0]); minY = Math.min(minY, p[1]); maxY = Math.max(maxY, p[1]); });
        var padT = 118, padB = 56, padX = 64;
        var bw = Math.max(maxX - minX, 5), bh = Math.max(maxY - minY, 5);
        var k = Math.max(1.2, Math.min((W - 2 * padX) / bw, (H - padT - padB) / bh, 320));
        var cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
        var tT = d3.zoomIdentity.translate(W / 2, padT + (H - padT - padB) / 2).scale(k).translate(-cx, -cy);
        activeIdx = -1; dots.forEach(function (c) { c.classList.remove("active"); });
        if (animate) d3.select(svg).transition().duration(900).call(zoom.transform, tT);
        else d3.select(svg).call(zoom.transform, tT);
      },
      onResize: function () { build(); }
    };
  }
};
