const LiveryCrests = (function () {
  "use strict";

  function create(d) {
    const { css, fit, drawWordmark, teamShort, crestSpecFor, crestKey, legendOf, CREST_DISC, CREST_MARGIN, STROKE_MIN, TEXT_MIN } = d;

    const swMin = (f, k) => f.S(Math.max(STROKE_MIN, k));

    const OP_M = 0, OP_L = 1, OP_Z = 2;
    const _pathCache = new Map(), PATH_CACHE_MAX = 512;
    function parsePath(d) {
      let i = 0, cmd = "";
      const ops = [];
      let stuck = null;
      const num = () => {
        while (i < d.length && (d[i] === " " || d[i] === ",")) i++;
        const st = i;
        while (i < d.length && "-+.0123456789eE".indexOf(d[i]) >= 0) i++;
        return parseFloat(d.slice(st, i));
      };
      let guard = d.length * 4 + 16;
      while (i < d.length) {
        if (guard-- <= 0) { stuck = "tracePath: no progress in '" + d.slice(0, 40) + "' at " + i; break; }
        const c = d[i];
        if (c === " " || c === ",") { i++; continue; }
        if (c >= "A" && c <= "Z") { cmd = c; i++; }
        else if (!(c >= "0" && c <= "9") && "-+.".indexOf(c) < 0) { i++; continue; }
        if (cmd === "Z") { ops.push(OP_Z, 0, 0); cmd = ""; continue; }
        const before = i;
        const x = num(), y = num();
        if (i === before) { i++; continue; }
        if (!isFinite(x) || !isFinite(y)) continue;
        if (cmd === "M") { ops.push(OP_M, x, y); cmd = "L"; }
        else ops.push(OP_L, x, y);
      }
      if (stuck) Log.warn("car", stuck);
      return Float64Array.from(ops);
    }
    function tracePath(ctx, f, d) {
      let ops = _pathCache.get(d);
      if (!ops) {
        ops = parsePath(d);
        if (_pathCache.size >= PATH_CACHE_MAX) _pathCache.delete(_pathCache.keys().next().value);
        _pathCache.set(d, ops);
      }
      ctx.beginPath();
      for (let k = 0; k < ops.length; k += 3) {
        const op = ops[k];
        if (op === OP_Z) ctx.closePath();
        else if (op === OP_M) ctx.moveTo(f.X(ops[k + 1]), f.Y(ops[k + 2]));
        else ctx.lineTo(f.X(ops[k + 1]), f.Y(ops[k + 2]));
      }
    }

    function crestTraced(ctx, R, P, bare, teamId) {
      const spec = crestSpecFor(teamId);
      if (!spec) { crestGeneric(ctx, R, P, bare, teamId); return; }
      const f = fit(R, CREST_MARGIN);
      ctx.save();
      const disc = CREST_DISC[crestKey(teamId)];
      if (disc && P.plate) {
        ctx.fillStyle = css(P.plate);
        ctx.beginPath();
        ctx.arc(f.X(disc.cx), f.Y(disc.cy), f.S(disc.r), 0, Math.PI * 2);
        ctx.fill();
      }
      for (let i = 0; i < spec.d.length; i++) {
        const role = spec.roles[i] || "mark";
        if (role === "plate" && !P.plate) continue;
        let roleFill = P.mark;
        if (role === "plate") roleFill = P.plate;
        else if (role === "alt") roleFill = P.alt;
        else if (role === "part") roleFill = P.part || P.mark;
        ctx.fillStyle = css(roleFill);
        tracePath(ctx, f, spec.d[i]);
        ctx.fill("evenodd");
      }
      ctx.restore();
    }


    function crestMercedes(ctx, R, P, bare, teamId) {
      const f = fit(R, CREST_MARGIN);
      const cx = f.X(0.5), cy = f.Y(0.5), r = f.S(0.48), rin = f.S(0.39);
      ctx.save();
      ctx.fillStyle = css(P.part || P.mark);
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.arc(cx, cy, rin, 0, Math.PI * 2, true);
      ctx.fill("evenodd");
      ctx.fillStyle = css(P.mark);
      const tip = f.S(0.34), baseW = f.S(0.115);
      for (let i = 0; i < 3; i++) {
        const a = -Math.PI / 2 + i * (Math.PI * 2 / 3);
        const px = cx + Math.cos(a) * tip, py = cy + Math.sin(a) * tip;
        const bx = -Math.sin(a) * baseW, by = Math.cos(a) * baseW;
        ctx.beginPath();
        ctx.moveTo(px, py);
        ctx.lineTo(cx + bx, cy + by);
        ctx.lineTo(cx - bx, cy - by);
        ctx.closePath();
        ctx.fill();
      }
      ctx.beginPath(); ctx.arc(cx, cy, f.S(0.055), 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }

    function crestHaas(ctx, R, P, bare, teamId) {
      const f = fit(R, CREST_MARGIN);
      ctx.save();
      ctx.strokeStyle = css(P.alt);
      ctx.lineWidth = swMin(f, 0.085);
      ctx.beginPath();
      ctx.arc(f.X(0.5), f.Y(0.5), f.S(0.42), 0, Math.PI * 2);
      ctx.stroke();
      const xa = 0.27, xb = 0.38;
      const y0 = 0.26, y1 = 0.74;
      ctx.fillStyle = css(P.mark);
      ctx.fillRect(f.X(xa), f.Y(y0), f.S(xb - xa), f.S(y1 - y0));
      ctx.fillRect(f.X(1 - xb), f.Y(y0), f.S(xb - xa), f.S(y1 - y0));
      const h = y0 + (y1 - y0) * 0.33, d = (y1 - y0) * 0.18, t = (y1 - y0) * 0.24;
      ctx.beginPath();
      ctx.moveTo(f.X(xb), f.Y(h));
      ctx.lineTo(f.X(1 - xb), f.Y(h + d));
      ctx.lineTo(f.X(1 - xb), f.Y(h + d + t));
      ctx.lineTo(f.X(xb), f.Y(h + t));
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }

    function crestAudi(ctx, R, P, bare, teamId) {
      const f = fit(R, CREST_MARGIN);
      ctx.save();
      const inkFor = (i) => css(i % 2 ? (P.part || P.mark) : P.mark);
      const r = f.S(0.135), cy = f.Y(0.5), xs = [0.16, 0.3767, 0.5933, 0.81];
      ctx.lineWidth = swMin(f, 0.075);
      const ring = (i) => {
        ctx.strokeStyle = inkFor(i);
        ctx.beginPath();
        ctx.arc(f.X(xs[i]), cy, r, 0, Math.PI * 2);
        ctx.stroke();
      };
      for (let i = 0; i < 4; i++) ring(i);
      for (let i = 0; i < 3; i++) {
        const mid = (xs[i] + xs[i + 1]) / 2;
        ctx.save();
        ctx.beginPath();
        ctx.rect(f.X(mid - 0.055), f.Y(0.30), f.S(0.11), f.S(0.40));
        ctx.clip();
        ring(i % 2 === 0 ? i + 1 : i);
        ctx.restore();
      }
      ctx.restore();
    }

    function crestGeneric(ctx, R, P, bare, teamId) {
      const f = fit(R, CREST_MARGIN);
      const box = { x: f.X(0.06), y: f.Y(0.22), w: f.S(0.88), h: f.S(0.56) };
      ctx.save();
      ctx.strokeStyle = css(P.alt);
      ctx.lineWidth = swMin(f, 0.055);
      ctx.strokeRect(box.x, box.y, box.w, box.h);
      const legend = legendOf(teamId);
      const label = legend && legend.car ? String(legend.car).split(" ")[0].toUpperCase() : teamShort(teamId);
      drawWordmark(ctx, label, box, P.mark, { align: "center", pad: f.S(0.06) });
      ctx.restore();
    }

    const CRESTS = {
      mercedes: crestMercedes,
      ferrari: crestTraced,
      mclaren: crestTraced,
      redbull: crestTraced,
      alpine: crestTraced,
      racingbulls: crestTraced,
      haas: crestHaas,
      williams: crestTraced,
      audi: crestAudi,
      astonmartin: crestTraced,
      cadillac: crestTraced,
    };

    function emblemLetter(ctx, f, P, teamId, cx, cy, size) {
      const legend = legendOf(teamId);
      const name = legend && legend.car ? String(legend.car) : teamShort(teamId);
      const ch = (name.trim()[0] || "A").toUpperCase();
      drawWordmark(ctx, ch, { x: f.X(cx - size / 2), y: f.Y(cy - size / 2), w: f.S(size), h: f.S(size) }, P.alt, { align: "center", pad: 0 });
    }
    function poly(ctx, f, pts) {
      ctx.beginPath();
      pts.forEach(([u, v], i) => (i ? ctx.lineTo(f.X(u), f.Y(v)) : ctx.moveTo(f.X(u), f.Y(v))));
      ctx.closePath();
    }
    function emblemShield(ctx, R, P, bare, teamId) {
      const f = fit(R, CREST_MARGIN);
      ctx.save(); ctx.fillStyle = css(P.mark);
      poly(ctx, f, [[0.16, 0.10], [0.84, 0.10], [0.84, 0.50], [0.50, 0.92], [0.16, 0.50]]); ctx.fill();
      ctx.strokeStyle = css(P.alt); ctx.lineWidth = swMin(f, 0.05);
      poly(ctx, f, [[0.24, 0.40], [0.50, 0.58], [0.76, 0.40]]); ctx.stroke();
      emblemLetter(ctx, f, P, teamId, 0.5, 0.27, 0.26);
      ctx.restore();
    }
    function emblemRoundel(ctx, R, P, bare, teamId) {
      const f = fit(R, CREST_MARGIN);
      ctx.save(); ctx.fillStyle = css(P.mark);
      ctx.beginPath(); ctx.arc(f.X(0.5), f.Y(0.5), f.S(0.44), 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = css(P.alt); ctx.lineWidth = swMin(f, 0.05);
      ctx.beginPath(); ctx.arc(f.X(0.5), f.Y(0.5), f.S(0.34), 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = css(P.alt); ctx.fillRect(f.X(0.10), f.Y(0.46), f.S(0.80), f.S(0.08));
      ctx.fillStyle = css(P.mark); ctx.fillRect(f.X(0.36), f.Y(0.36), f.S(0.28), f.S(0.28));
      emblemLetter(ctx, f, P, teamId, 0.5, 0.5, 0.26);
      ctx.restore();
    }
    function emblemWings(ctx, R, P, bare, teamId) {
      const f = fit(R, CREST_MARGIN);
      ctx.save(); ctx.fillStyle = css(P.mark);
      for (const s of [-1, 1]) {
        for (let i = 0; i < 3; i++) {
          const y = 0.34 + i * 0.12, x0 = 0.5 + s * 0.16, x1 = 0.5 + s * (0.46 - i * 0.08);
          poly(ctx, f, [[x0, y], [x1, y - 0.06], [x1 - s * 0.05, y + 0.05], [x0, y + 0.08]]); ctx.fill();
        }
      }
      ctx.beginPath(); ctx.arc(f.X(0.5), f.Y(0.5), f.S(0.15), 0, Math.PI * 2); ctx.fill();
      emblemLetter(ctx, f, P, teamId, 0.5, 0.5, 0.18);
      ctx.restore();
    }
    function emblemArrow(ctx, R, P, bare, teamId) {
      const f = fit(R, CREST_MARGIN);
      ctx.save(); ctx.fillStyle = css(P.mark);
      poly(ctx, f, [[0.08, 0.22], [0.92, 0.50], [0.08, 0.78], [0.30, 0.50]]); ctx.fill();
      ctx.fillStyle = css(P.alt);
      poly(ctx, f, [[0.36, 0.42], [0.60, 0.50], [0.36, 0.58], [0.42, 0.50]]); ctx.fill();
      ctx.restore();
    }
    function emblemStar(ctx, R, P, bare, teamId) {
      const f = fit(R, CREST_MARGIN), pts = [];
      for (let i = 0; i < 10; i++) {
        const a = -Math.PI / 2 + i * Math.PI / 5, r = i % 2 ? 0.19 : 0.44;
        pts.push([0.5 + Math.cos(a) * r, 0.53 + Math.sin(a) * r]);
      }
      ctx.save(); ctx.fillStyle = css(P.mark); poly(ctx, f, pts); ctx.fill();
      emblemLetter(ctx, f, P, teamId, 0.5, 0.55, 0.2);
      ctx.restore();
    }
    function emblemBolt(ctx, R, P, bare, teamId) {
      const f = fit(R, CREST_MARGIN), pts = [];
      for (let i = 0; i < 6; i++) { const a = Math.PI / 6 + i * Math.PI / 3; pts.push([0.5 + Math.cos(a) * 0.45, 0.5 + Math.sin(a) * 0.45]); }
      ctx.save(); ctx.fillStyle = css(P.mark); poly(ctx, f, pts); ctx.fill();
      ctx.fillStyle = css(P.alt);
      poly(ctx, f, [[0.56, 0.14], [0.30, 0.54], [0.47, 0.54], [0.40, 0.86], [0.70, 0.42], [0.53, 0.42]]); ctx.fill();
      ctx.restore();
    }
    function emblemLaurel(ctx, R, P, bare, teamId) {
      const f = fit(R, CREST_MARGIN);
      ctx.save(); ctx.fillStyle = css(P.mark);
      for (const s of [-1, 1]) {
        for (let i = 0; i < 5; i++) {
          const a = Math.PI / 2 + s * (0.42 + i * 0.48), r = 0.36;
          const cx = 0.5 + Math.cos(a) * r, cy = 0.5 + Math.sin(a) * r, ta = a + s * (Math.PI / 2 - 0.5);
          const lx = Math.cos(ta) * 0.13, ly = Math.sin(ta) * 0.13, nx = -ly * 0.55, ny = lx * 0.55;
          poly(ctx, f, [[cx - lx, cy - ly], [cx + nx, cy + ny], [cx + lx, cy + ly], [cx - nx, cy - ny]]); ctx.fill();
        }
      }
      emblemLetter(ctx, f, P, teamId, 0.5, 0.5, 0.34);
      ctx.restore();
    }
    function emblemChevrons(ctx, R, P, bare, teamId) {
      const f = fit(R, CREST_MARGIN);
      ctx.save();
      for (let i = 0; i < 3; i++) {
        const y = 0.16 + i * 0.22;
        ctx.fillStyle = css(i === 1 ? P.alt : P.mark);
        poly(ctx, f, [[0.10, y + 0.20], [0.50, y], [0.90, y + 0.20], [0.90, y + 0.36], [0.50, y + 0.16], [0.10, y + 0.36]]); ctx.fill();
      }
      ctx.restore();
    }
    function emblemDiamond(ctx, R, P, bare, teamId) {
      const f = fit(R, CREST_MARGIN);
      ctx.save(); ctx.fillStyle = css(P.mark);
      poly(ctx, f, [[0.5, 0.04], [0.94, 0.5], [0.5, 0.96], [0.06, 0.5]]); ctx.fill();
      ctx.strokeStyle = css(P.alt); ctx.lineWidth = swMin(f, 0.04);
      poly(ctx, f, [[0.5, 0.16], [0.82, 0.5], [0.5, 0.84], [0.18, 0.5]]); ctx.stroke();
      emblemLetter(ctx, f, P, teamId, 0.5, 0.5, 0.30);
      ctx.restore();
    }
    function emblemGear(ctx, R, P, bare, teamId) {
      const f = fit(R, CREST_MARGIN), pts = [], n = 8;
      for (let i = 0; i < n * 4; i++) {
        const a = (i / (n * 4)) * Math.PI * 2, r = (i % 4) < 2 ? 0.48 : 0.37;
        pts.push([0.5 + Math.cos(a) * r, 0.5 + Math.sin(a) * r]);
      }
      ctx.save(); ctx.fillStyle = css(P.mark); poly(ctx, f, pts); ctx.fill();
      ctx.strokeStyle = css(P.alt); ctx.lineWidth = swMin(f, 0.04);
      ctx.beginPath(); ctx.arc(f.X(0.5), f.Y(0.5), f.S(0.27), 0, Math.PI * 2); ctx.stroke();
      emblemLetter(ctx, f, P, teamId, 0.5, 0.5, 0.28);
      ctx.restore();
    }
    function emblemCrown(ctx, R, P, bare, teamId) {
      const f = fit(R, CREST_MARGIN);
      ctx.save(); ctx.fillStyle = css(P.mark);
      poly(ctx, f, [[0.08, 0.80], [0.08, 0.30], [0.30, 0.56], [0.50, 0.18], [0.70, 0.56], [0.92, 0.30], [0.92, 0.80]]); ctx.fill();
      for (const [u, v] of [[0.08, 0.24], [0.50, 0.12], [0.92, 0.24]]) { ctx.beginPath(); ctx.arc(f.X(u), f.Y(v), f.S(0.07), 0, Math.PI * 2); ctx.fill(); }
      ctx.fillStyle = css(P.alt);
      ctx.fillRect(f.X(0.08), f.Y(0.66), f.S(0.84), f.S(0.07));
      for (const u of [0.26, 0.50, 0.74]) { ctx.beginPath(); ctx.arc(f.X(u), f.Y(0.56), f.S(0.045), 0, Math.PI * 2); ctx.fill(); }
      ctx.restore();
    }
    function emblemFlag(ctx, R, P, bare, teamId) {
      const f = fit(R, CREST_MARGIN), cols = 5, rows = 4, x0 = 0.20, y0 = 0.10, w = 0.72, h = 0.56;
      ctx.save(); ctx.fillStyle = css(P.mark);
      ctx.fillRect(f.X(0.08), f.Y(0.06), f.S(0.09), f.S(0.88));
      ctx.fillRect(f.X(x0), f.Y(y0), f.S(w), f.S(h));
      ctx.fillStyle = css(P.alt);
      for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
        if ((r + c) % 2) ctx.fillRect(f.X(x0 + (c * w) / cols), f.Y(y0 + (r * h) / rows), f.S(w / cols), f.S(h / rows));
      }
      ctx.restore();
    }
    function emblemFlame(ctx, R, P, bare, teamId) {
      const f = fit(R, CREST_MARGIN);
      ctx.save(); ctx.fillStyle = css(P.mark);
      poly(ctx, f, [[0.50, 0.96], [0.22, 0.86], [0.12, 0.62], [0.22, 0.36], [0.30, 0.52], [0.36, 0.20], [0.50, 0.04],
        [0.56, 0.30], [0.66, 0.16], [0.78, 0.40], [0.88, 0.62], [0.78, 0.86]]); ctx.fill();
      ctx.fillStyle = css(P.alt);
      poly(ctx, f, [[0.50, 0.88], [0.34, 0.80], [0.30, 0.64], [0.40, 0.48], [0.46, 0.60], [0.54, 0.40], [0.66, 0.60], [0.68, 0.78]]); ctx.fill();
      ctx.restore();
    }
    const EMBLEMS = Object.freeze({ shield: emblemShield, roundel: emblemRoundel, wings: emblemWings, arrow: emblemArrow, star: emblemStar,
      bolt: emblemBolt, laurel: emblemLaurel, chevrons: emblemChevrons, diamond: emblemDiamond,
      gear: emblemGear, crown: emblemCrown, flag: emblemFlag, flame: emblemFlame });
    const EMBLEM_IDS = Object.freeze(["team", ...Object.keys(EMBLEMS)]);

    const CREST_TONE_IDS = Object.freeze(["team", "swap", "mono"]);
    const CREST_FRAME_IDS = Object.freeze(["none", "disc", "shield", "badge", "ring"]);
    function tonePalette(P, tone) {
      if (tone === "swap") return Object.assign({}, P, { mark: P.alt, alt: P.mark });
      if (tone === "mono") return Object.assign({}, P, { alt: P.mark });
      return P;
    }
    const FRAME_PATH = {
      disc: (ctx, f) => { ctx.beginPath(); ctx.arc(f.X(0.5), f.Y(0.5), f.S(0.48), 0, Math.PI * 2); },
      ring: (ctx, f) => { ctx.beginPath(); ctx.arc(f.X(0.5), f.Y(0.5), f.S(0.46), 0, Math.PI * 2); },
      shield: (ctx, f) => poly(ctx, f, [[0.08, 0.04], [0.92, 0.04], [0.92, 0.52], [0.50, 0.97], [0.08, 0.52]]),
      badge: (ctx, f) => poly(ctx, f, [[0.16, 0.04], [0.84, 0.04], [0.96, 0.16], [0.96, 0.84], [0.84, 0.96], [0.16, 0.96], [0.04, 0.84], [0.04, 0.16]]),
    };
    const FRAME_INNER = { disc: [0.5, 0.5, 0.66], ring: [0.5, 0.5, 0.70], shield: [0.5, 0.42, 0.62], badge: [0.5, 0.5, 0.72] };
    function dressEmblem(fn, tone, frame) {
      const t = CREST_TONE_IDS.indexOf(tone) > 0 ? tone : null;
      const fr = Object.hasOwn(FRAME_PATH, frame || "") ? frame : null;
      if (!t && !fr) return fn;
      return function (ctx, R, P0, bare, teamId) {
        const P = t ? tonePalette(P0, t) : P0;
        if (!fr) return fn(ctx, R, P, bare, teamId);
        const f = fit(R, CREST_MARGIN);
        ctx.save();
        FRAME_PATH[fr](ctx, f);
        if (fr !== "ring" && t !== "mono") { ctx.fillStyle = css(P.alt); ctx.fill(); }
        ctx.strokeStyle = css(P.mark); ctx.lineWidth = swMin(f, fr === "ring" ? 0.06 : 0.035);
        ctx.stroke();
        ctx.restore();
        const [cu, cv, k] = FRAME_INNER[fr], s = f.S(k) / (1 - CREST_MARGIN * 2);
        fn(ctx, { x: f.X(cu) - s / 2, y: f.Y(cv) - s / 2, w: s, h: s }, P, bare, teamId);
      };
    }

    return { CRESTS, crestGeneric, tracePath, EMBLEMS, EMBLEM_IDS, CREST_TONE_IDS, CREST_FRAME_IDS, dressEmblem };
  }

  return { create };
})();
Object.freeze(LiveryCrests);
