/* Apex 26 — telemetry canvas layers, frame compositing, delta chart and track map. */
const DataTelemetryRender = (function () {
  "use strict";

  function create({ cssColor }) {
    const { clamp, CHANNELS, PADL, PADR, PADY, chartX, chanNorm, sampleAt,
            distAtT, timeAtDist, locAt, locBounds, gapLimitMs, isGap, dcode } = DataTelemetryModel;

    // composite one frame: cached bases + moving cursor, car dots, delta, gauges
    function paintFrame(view) {
      const T = view.cursorT === null ? 0 : view.cursorT;
      const R = view.ratio || 1;
      const cg = view.chart.getContext("2d");
      const W = view.cw, H = view.ch;
      cg.setTransform(R, 0, 0, R, 0, 0);
      cg.clearRect(0, 0, W, H);
      cg.drawImage(view.chartBase, 0, 0, W, H);
      const X = chartX(view, T, W);
      cg.strokeStyle = "rgba(255,255,255,0.55)"; cg.lineWidth = 1;
      cg.beginPath(); cg.moveTo(X, PADY); cg.lineTo(X, H - PADY); cg.stroke();
      // a speed dot per lane at the cursor (extra lanes 3-4 too), reference last
      if (view.multi && view.visible.speed) {
        for (let i = 2; i < view.laps.length; i++) {
          const cm = sampleAt(view.laps[i].car, T);
          const fm = chanNorm(CHANNELS[0], cm, view);
          if (fm === null) continue;
          cg.fillStyle = cssColor(view.laneCols[i]);
          cg.beginPath(); cg.arc(X, H - PADY - fm * (H - 2 * PADY), 3, 0, Math.PI * 2); cg.fill();
        }
      }
      if (view.compare && view.visibleC.speed) {
        const c2 = sampleAt(view.compare.car, T);
        const f2 = chanNorm(CHANNELS[0], c2, view);
        if (f2 !== null) {
          cg.fillStyle = cssColor(view.colC);
          cg.beginPath(); cg.arc(X, H - PADY - f2 * (H - 2 * PADY), 3, 0, Math.PI * 2); cg.fill();
        }
      }
      if (view.visible.speed) {
        const c = sampleAt(view.primary.car, T);
        const f = chanNorm(CHANNELS[0], c, view);
        if (f !== null) {
          cg.fillStyle = view.compare ? cssColor(view.colP) : CHANNELS[0].color;
          cg.beginPath(); cg.arc(X, H - PADY - f * (H - 2 * PADY), 3.5, 0, Math.PI * 2); cg.fill();
        }
      }
      if (view.delta) {
        const dgx = view.delta.getContext("2d");
        const DW = view.dw, DH = view.dh;
        dgx.setTransform(R, 0, 0, R, 0, 0);
        dgx.clearRect(0, 0, DW, DH);
        dgx.drawImage(view.deltaBase, 0, 0, DW, DH);
        const dx = chartX(view, T, DW);
        dgx.strokeStyle = "rgba(255,255,255,0.55)"; dgx.lineWidth = 1;
        dgx.beginPath(); dgx.moveTo(dx, 0); dgx.lineTo(dx, DH); dgx.stroke();
      }
      if (view.map) {
        const mg = view.map.getContext("2d");
        const MW = view.mw, MH = view.mh;
        mg.setTransform(R, 0, 0, R, 0, 0);
        mg.clearRect(0, 0, MW, MH);
        if (view.onboard && view.mapT) {
          const here = locAt(view, view.primary, T);
          const ahead = locAt(view, view.primary, Math.min(view.tMax, T + 0.6));
          const p0 = mapPoint(view, here), p1 = mapPoint(view, ahead);
          const ang = Math.atan2(p1[1] - p0[1], p1[0] - p0[0]);
          const ZOOM = 2.6;
          mg.save();
          mg.translate(MW / 2, MH / 2);
          mg.scale(ZOOM, ZOOM);
          mg.rotate(-ang - Math.PI / 2);     // heading -> up
          mg.translate(-p0[0], -p0[1]);
          mg.drawImage(view.mapBase, 0, 0, MW, MH);
          // extra lanes first, reference last so it stays on top
          for (let i = view.laps.length - 1; i >= 0; i--)
            drawCarDot(mg, view, view.laps[i], T, cssColor(view.laneCols[i]), 1 / ZOOM);
          mg.restore();
        } else {
          mg.drawImage(view.mapBase, 0, 0, MW, MH);
          for (let i = view.laps.length - 1; i >= 0; i--)
            drawCarDot(mg, view, view.laps[i], T, cssColor(view.laneCols[i]), 1);
        }
      }
    }
    function drawCarDot(g, view, tel, t, fill, rscale) {
      const best = locAt(view, tel, t);
      if (!best) return;
      const p = mapPoint(view, best);
      const rs = rscale || 1, r = 5.5 * rs;
      g.strokeStyle = "rgba(0,0,0,0.65)"; g.lineWidth = 3.5 * rs;
      g.beginPath(); g.arc(p[0], p[1], r, 0, Math.PI * 2); g.stroke();
      g.fillStyle = fill; g.strokeStyle = "rgba(255,255,255,0.9)"; g.lineWidth = 1.5 * rs;
      g.beginPath(); g.arc(p[0], p[1], r, 0, Math.PI * 2); g.fill(); g.stroke();
    }

    // rebuild the cached static layers (chart traces + coloured track map + delta)
    function buildBases(view) {
      // Layout dims, never base.width: the offscreens allocate at layout x
      // ratio with a pre-transformed context, so the renderers keep speaking
      // layout px on a denser bitmap.
      renderTraces(view.chartBase.getContext("2d"), view.cw, view.ch, view);
      if (view.map) {
        computeMapTransform(view);
        renderMap(view.mapBase.getContext("2d"), view.mw, view.mh, view);
      }
      if (view.delta) renderDelta(view.deltaBase.getContext("2d"), view.dw, view.dh, view);
    }

    function renderTraces(g, W, H, view) {
      g.clearRect(0, 0, W, H);
      const X = function (t) { return chartX(view, t, W); };
      const Y = function (f) { return H - PADY - f * (H - 2 * PADY); };
      g.font = "10px system-ui, sans-serif";
      // an axis shows while either driver's line for its unit is visible
      function anyVis(id) { return view.visible[id] || (view.compare && view.visibleC[id]); }
      if (anyVis("speed")) {
        const step = view.speedMax > 260 ? 100 : (view.speedMax > 130 ? 50 : 25);
        g.textAlign = "right"; g.textBaseline = "middle";
        for (let v = step; v <= view.speedMax; v += step) {
          const y = Y(v / view.speedMax);
          g.strokeStyle = "rgba(255,255,255,0.09)"; g.lineWidth = 1;
          g.beginPath(); g.moveTo(PADL, y); g.lineTo(W - PADR, y); g.stroke();
          if (y < 17) continue;   // would collide with the km/h unit label
          g.fillStyle = "rgba(57,208,255,0.8)";
          g.fillText(String(v), PADL - 5, y);
        }
        g.textAlign = "left"; g.textBaseline = "top";
        g.fillStyle = "rgba(57,208,255,0.6)";
        g.fillText("km/h", 2, 3);
      }
      if (anyVis("rpm")) {
        g.textAlign = "left"; g.textBaseline = "middle";
        g.fillStyle = "rgba(192,132,252,0.65)";
        [4000, 8000, 12000].forEach(function (v) {
          if (v > view.rpmMax) return;
          const y = Y(v / view.rpmMax);
          if (y < 26) return;   // keep clear of the unit labels
          g.fillText(Math.round(v / 1000) + "k", PADL + 4, y);
        });
        g.textBaseline = "top";
        g.fillText("rpm", 2, 15);
      }
      if (anyVis("gear")) {
        g.textAlign = "right"; g.textBaseline = "middle";
        g.fillStyle = "rgba(246,210,0,0.7)";
        [2, 4, 6, 8].forEach(function (gr) { g.fillText("G" + gr, W - 2, Y(gr / 8)); });
      }
      if (anyVis("throttle") || anyVis("brake")) {
        g.textAlign = "right"; g.textBaseline = "middle";
        g.fillStyle = "rgba(63,185,80,0.55)";
        [25, 50, 75].forEach(function (p) { g.fillText(p + "%", W - PADR - 22, Y(p / 100)); });
      }
      g.textAlign = "left"; g.font = "9px system-ui, sans-serif";
      // sector dividers + labels
      if (view.sectors) {
        g.textBaseline = "top";
        const bounds = [0].concat(view.sectors).concat([view.tMax]);
        g.strokeStyle = "rgba(255,255,255,0.18)"; g.lineWidth = 1;
        view.sectors.forEach(function (sb) {
          const x = X(sb);
          g.setLineDash([3, 3]);
          g.beginPath(); g.moveTo(x, PADY); g.lineTo(x, H - PADY); g.stroke();
          g.setLineDash([]);
        });
        g.fillStyle = "rgba(255,255,255,0.4)";
        for (let s = 0; s < 3; s++) {
          const mid = X((bounds[s] + bounds[s + 1]) / 2);
          g.fillText("S" + (s + 1), mid - 6, PADY + 1);
        }
      }
      function line(car, ch, color, width) {
        g.beginPath();
        let started = false, prevY = 0;
        for (let i = 0; i < car.length; i++) {
          const f = chanNorm(ch, car[i], view);
          if (f === null) { started = false; continue; }
          const x = X(car[i].t), y = Y(f);
          if (!started) { g.moveTo(x, y); started = true; }
          else { if (ch.step) g.lineTo(x, prevY); g.lineTo(x, y); }
          prevY = y;
        }
        g.strokeStyle = color; g.lineWidth = width; g.lineJoin = "round"; g.stroke();
      }
      if (view.compare) {
        g.setLineDash([5, 4]);
        g.globalAlpha = 0.5;
        for (let k = CHANNELS.length - 1; k >= 1; k--) {
          const ch = CHANNELS[k];
          if (!view.visibleC[ch.id]) continue;
          if (ch.id === "drs") {
            // nudge the compare DRS strip below the primary's so both read
            g.save(); g.translate(0, 5);
            line(view.compare.car, ch, ch.color, Math.max(1.2, ch.w - 0.4));
            g.restore();
          } else {
            line(view.compare.car, ch, ch.color, Math.max(1.2, ch.w - 0.4));
          }
        }
        g.globalAlpha = 1;
        if (view.visibleC.speed) line(view.compare.car, CHANNELS[0], cssColor(view.colC), 1.8);
        g.setLineDash([]);
      }
      if (view.multi && view.visible.speed) {
        g.setLineDash([2, 3]);
        for (let i = 2; i < view.laps.length; i++) line(view.laps[i].car, CHANNELS[0], cssColor(view.laneCols[i]), 1.6);
        g.setLineDash([]);
      }
      for (let k = CHANNELS.length - 1; k >= 0; k--) {
        const ch = CHANNELS[k];
        if (!view.visible[ch.id]) continue;
        const col = (ch.id === "speed" && view.compare) ? cssColor(view.colP) : ch.color;
        line(view.primary.car, ch, col, ch.w);
      }
    }

    function deltaSamplesFor(view, lane) {
      const car = view.primary.car, out = [];
      let mn = 0, mx = 0;
      for (let i = 0; i < car.length; i++) {
        const t = car[i].t;
        const dP = distAtT(view.primary.cum, t);
        const dl = timeAtDist(lane.cum, dP) - t;
        out.push(dl);
        if (dl < mn) mn = dl; if (dl > mx) mx = dl;
      }
      return { d: out, mn: mn, mx: mx };
    }
    function renderDelta(g, W, H, view) {
      const pad = 6, car = view.primary.car;
      g.clearRect(0, 0, W, H);
      const others = view.laps.slice(1);
      const series = others.map(function (lane) { return deltaSamplesFor(view, lane); });
      let mn = 0, mx = 0;
      series.forEach(function (s) { if (s.mn < mn) mn = s.mn; if (s.mx > mx) mx = s.mx; });
      const span = Math.max(0.15, mx - mn);
      const X = function (t) { return chartX(view, t, W); };
      // The plot starts BELOW the title band: with every gap one way the zero
      // line sits at the top of the range, and it used to strike the title out.
      const top = 14;
      const Y = function (v) { return top + (mx - v) / span * (H - top - pad); };
      const y0 = Y(0);
      // zero line
      g.strokeStyle = "rgba(255,255,255,0.25)"; g.lineWidth = 1;
      g.beginPath(); g.moveTo(PADL, y0); g.lineTo(W - PADR, y0); g.stroke();
      const fill = series.length === 1;
      series.forEach(function (ds, si) {
        const laneCol = cssColor(view.laneCols[si + 1]);
        if (fill) {
          g.beginPath(); g.moveTo(X(0), y0);
          for (let i = 0; i < car.length; i++) g.lineTo(X(car[i].t), Y(ds.d[i]));
          g.lineTo(X(view.tMax), y0); g.closePath();
          g.fillStyle = "rgba(63,185,80,0.18)"; g.fill();
        }
        g.beginPath();
        let started = false;
        for (let i = 0; i < car.length; i++) {
          const x = X(car[i].t), y = Y(ds.d[i]);
          if (!started) { g.moveTo(x, y); started = true; } else g.lineTo(x, y);
        }
        g.strokeStyle = laneCol; g.lineWidth = 1.5; g.lineJoin = "round"; g.stroke();
      });
      g.fillStyle = "rgba(255,255,255,0.45)"; g.font = "9px system-ui, sans-serif";
      g.textBaseline = "top";
      // ONE LABEL, NAMING THE PRIMARY, whether there is one compare lane or
      // five. `series` is view.laps.slice(1) and every lane's delta is measured
      // against view.primary — so the single-lane branch naming the COMPARE car
      // described the reference backwards, and a reader taking the axis at its
      // word read every sign the wrong way round.
      g.fillText("GAP TO " + dcode(view.primary.d) + " (s) · +behind", PADL + 2, 2);
    }

    // screen transform for the track map (from the primary lap's x/y bounds)
    function computeMapTransform(view) {
      const b = locBounds(view.primary.loc);
      const W = view.mw, H = view.mh, pad = 14;
      const spanx = b.spanx, spany = b.spany;
      const sc = Math.min((W - 2 * pad) / spanx, (H - 2 * pad) / spany);
      view.mapT = { minx: b.minx, miny: b.miny, sc: sc, ox: (W - spanx * sc) / 2, oy: (H - spany * sc) / 2,
                    W: W, H: H, spanx: spanx, spany: spany };
    }
    function mapPoint(view, p) {
      const m = view.mapT;
      return [m.ox + (p.x - m.minx) * m.sc, m.H - (m.oy + (p.y - m.miny) * m.sc)];
    }

    // Would joining the last sample back to the first close a lap, or cut a chord
    // across the map? A fastest-lap window starts and ends at the line, so the two
    // ends sit within a few metres of each other; anything further apart is a
    // partial trace and must stay open rather than gain a fake straight.
    function closesLoop(view, loc) {
      if (!loc || loc.length < 8) return false;
      // Measured in TRACK units against the track's own span, not in canvas
      // pixels against the canvas height. The pixel scale is derived from the
      // bounds, so a pixel threshold moves whenever the bounds do — the same
      // physical gap passed in one session and failed in another, which is how a
      // fake closing straight appeared on one map and not the other.
      const dx = loc[0].x - loc[loc.length - 1].x, dy = loc[0].y - loc[loc.length - 1].y;
      const m = view.mapT;
      return Math.hypot(dx, dy) < Math.max(m.spanx, m.spany) * 0.18;
    }
    // one lap as a single polyline (used for the compare driver's flat-colour line)
    function strokeLap(g, view, loc) {
      const limit = gapLimitMs(loc);
      let open = false;
      g.beginPath();
      for (let i = 0; i < loc.length; i++) {
        const p = mapPoint(view, loc[i]);
        if (!open || (i > 0 && isGap(loc, i, limit))) { g.moveTo(p[0], p[1]); open = true; }
        else g.lineTo(p[0], p[1]);
      }
      if (closesLoop(view, loc)) g.closePath();
      g.stroke();
    }

    // track map from x/y, coloured by speed (slow = blue, fast = red)
    function renderMap(g, W, H, view) {
      const loc = view.primary.loc, car = view.primary.car;
      g.clearRect(0, 0, W, H);
      let vMax = 1;
      for (let i = 0; i < (car ? car.length : 0); i++) if ((car[i].speed || 0) > vMax) vMax = car[i].speed;
      function speedAtDate(date) {
        if (!car || !car.length) return null;
        let ci = 0;
        while (ci < car.length - 1 && car[ci].date < date) ci++;
        return car[ci].speed;
      }
      if (view.compare && view.compare.loc && view.compare.loc.length > 1) {
        g.lineWidth = 5; g.lineCap = "round"; g.lineJoin = "round";
        g.strokeStyle = cssColor(view.colC);
        strokeLap(g, view, view.compare.loc);
      }
      g.lineWidth = 3; g.lineCap = "round"; g.lineJoin = "round";
      const N = loc.length;
      const limit = gapLimitMs(loc);
      for (let i = 1; i <= N; i++) {
        const a = loc[i - 1], b2 = loc[i % N];
        if (i === N && !closesLoop(view, loc)) break;   // partial lap: leave it open
        if (i < N && isGap(loc, i, limit)) continue;    // coverage gap: no invented straight
        const v = speedAtDate(b2.date);
        const f = v === null ? 0.5 : clamp(v / vMax, 0, 1);
        const r = Math.round(255 * Math.min(1, f * 1.6));
        const b = Math.round(255 * Math.min(1, (1 - f) * 1.6));
        const gr = Math.round(180 * (1 - Math.abs(f - 0.5) * 2));
        g.strokeStyle = "rgb(" + r + "," + gr + "," + b + ")";
        const p0 = mapPoint(view, a), p1 = mapPoint(view, b2);
        g.beginPath(); g.moveTo(p0[0], p0[1]); g.lineTo(p1[0], p1[1]); g.stroke();
      }
      // sector-boundary ticks
      if (view.sectors) {
        g.fillStyle = "rgba(255,255,255,0.9)";
        g.strokeStyle = "rgba(0,0,0,0.6)"; g.lineWidth = 1;
        g.font = "9px system-ui, sans-serif"; g.textBaseline = "middle"; g.textAlign = "center";
        view.sectors.forEach(function (sb, idx) {
          const lp = locAt(view, view.primary, sb);
          if (!lp) return;
          const p = mapPoint(view, lp);
          g.beginPath(); g.arc(p[0], p[1], 3.5, 0, Math.PI * 2); g.fill(); g.stroke();
          g.fillStyle = "rgba(255,255,255,0.7)";
          g.fillText("S" + (idx + 2), p[0], p[1] - 9);
          g.fillStyle = "rgba(255,255,255,0.9)";
        });
        g.textAlign = "left";
      }
    }

    return { buildBases, paintFrame };
  }

  return { create };
})();
Object.freeze(DataTelemetryRender);
