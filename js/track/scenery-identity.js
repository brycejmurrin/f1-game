/* Apex 26 — SceneryIdentity: the shared circuit-identity toolkit of the
   buildProps composite models — underpass portals, flood masts (+ ring),
   LED facade bands, concrete canyons, sail/gridshell canopies, runoff
   aprons, banked kerb strips, bowl seat walls and pastel street rows.
   Split out of js/track/tracks.js buildProps; created once per build via
   SceneryIdentity.create(ctx) with the shared scenery ctx. anchor
   (SceneryNature), along (SceneryStructures) and building (SceneryCity)
   come via ctx — this module is created last.
   Load order: before js/track/tracks.js (which calls create() at build). */
const SceneryIdentity = (function () {
  "use strict";

  function create(ctx) {
    const { out, track, n, hw, px, py, pz, NIGHT,
            addBox, addCyl, addFrustum, RAW, rejBox, rejRad, blockAt,
            recordBarrier, onTrack, overheadSpan, every, hash, upOf, vadd,
            anchor, along, building, indexSolid } = ctx;

    // ── Shared scenery toolkit (identity pass) ──────────────────────────────
    // Cross-track composite helpers. Footprints that must stay OFF the racing
    // line use rejBox / full-box tests. Overhead decks that cars intentionally
    // pass under (gantry beam, underpass slab, sail/gridshell spanning the
    // track) emit via RAW.addBox so the guarded wrappers do not cull them.

    // Dark overhead portal: slab spanning the track + support piers off-edge.
    // opts: { h, thick, col, pierGap, pierW, depth }
    const underpassPortal = (s, opts) => {
      opts = opts || {};
      const k = Math.round(s * n) % n;
      const clearH = opts.h != null ? opts.h : 5.5;
      const thick = opts.thick != null ? opts.thick : 1.4;
      const col = opts.col || [0.10, 0.10, 0.12];
      const pierGap = opts.pierGap != null ? opts.pierGap : 1.4;
      const pierW = opts.pierW != null ? opts.pierW : 1.6;
      const depth = opts.depth != null ? opts.depth : 14;
      const r = [track.rx[k], track.ry[k], track.rz[k]];
      const t = [track.tx[k], track.ty[k], track.tz[k]];
      const u = upOf(track, k);
      const b = [r, u, t];
      // Piers sit beyond the road edge — full-footprint guard (not single-point).
      for (const side of [-1, 1]) {
        const a = anchor(k, side, pierGap + pierW / 2);
        const pierSz = [pierW, clearH + thick * 0.5, depth * 0.55];
        if (rejBox(a.c, pierSz, [a.r, a.u, a.t])) {
          console.warn(`[scenery] underpassPortal pier SUPPRESSED at s=${s} side=${side}`);
          continue;
        }
        addBox(out, vadd(a.c, a.u, pierSz[1] / 2), pierSz, col, [a.r, a.u, a.t]);
        blockAt(k, side, pierGap, depth * 0.25);
      }
      // Overhead slab intentionally spans tarmac (cars pass under) → RAW.
      const span = hw[k] * 2 + (pierGap + pierW) * 2 + 1.5;
      const slabC = [px[k] + u[0] * (clearH + thick / 2),
                     py[k] + u[1] * (clearH + thick / 2),
                     pz[k] + u[2] * (clearH + thick / 2)];
      overheadSpan({
        id: `underpass-${k}`, frac: s, clearance: clearH,
        thickness: thick, depth, span, color: col,
      });
      // Underside soffit — slightly lighter so the portal mouth reads.
      const soff = [Math.min(1, col[0] * 1.35 + 0.04), Math.min(1, col[1] * 1.35 + 0.04), Math.min(1, col[2] * 1.4 + 0.05)];
      RAW.addBox(out, [px[k] + u[0] * (clearH + 0.12), py[k] + u[1] * (clearH + 0.12), pz[k] + u[2] * (clearH + 0.12)],
                 [span * 0.96, 0.18, depth * 0.92], soff, b);
    };

    // Tall dual-arm cool-white flood mast + optional ground pool.
    // dist = metres beyond road edge (mast centre). opts: { h, cool, pool, arms }
    const floodMast = (k, side, dist, opts) => {
      opts = opts || {};
      const h = opts.h != null ? opts.h : 36;
      const cool = opts.cool !== false;
      const pool = opts.pool !== false;
      const arms = opts.arms != null ? opts.arms : 2;
      const poleCol = [0.14, 0.14, 0.17];
      const lens = cool
        ? (NIGHT ? [1.22, 1.28, 1.40] : [0.96, 1.00, 1.06])
        : (NIGHT ? [1.30, 1.18, 0.88] : [1.02, 0.96, 0.82]);
      const a = anchor(k, side, dist), b = [a.r, a.u, a.t];
      const foot = [2.8, h, 2.8];
      if (rejBox(a.c, foot, b)) {
        console.warn(`[scenery] floodMast SUPPRESSED at k=${k} side=${side}: dist=${dist}`);
        return;
      }
      addCyl(out, a.c, 0.45, h, poleCol, 6, b);
      const top = vadd(a.c, a.u, h);
      // Dual (or multi) arms reaching toward the track (−side along r).
      for (let i = 0; i < arms; i++) {
        const along = (i - (arms - 1) / 2) * 1.8;
        const arm = vadd(vadd(top, a.t, along), a.r, -side * 1.6);
        addBox(out, arm, [3.4, 0.35, 0.55], poleCol, b);
        addBox(out, vadd(arm, a.r, -side * 1.3), [1.6, 0.55, 1.1], lens, b);
      }
      // Crossbar / bank housing
      addBox(out, top, [1.2, 0.9, arms * 1.9 + 0.6], [0.22, 0.22, 0.26], b);
      if (pool) {
        const poolCol = cool ? [0.72, 0.78, 0.88] : [0.82, 0.78, 0.62];
        addBox(out, vadd(a.c, a.u, 0.10), [7.5, 0.18, 7.5], poolCol, b);
      }
      blockAt(k, side, dist - 0.6, 2);
    };

    // Ring of flood masts both sides every ~stepM metres. opts forwarded to floodMast;
    // opts.dist defaults to 14 (beyond edge).
    const floodMastRing = (stepM, opts) => {
      opts = opts || {};
      const dist = opts.dist != null ? opts.dist : 14;
      every(stepM || 55, (k) => {
        floodMast(k, -1, dist, opts);
        floodMast(k, 1, dist, opts);
      });
    };

    // Stacked emissive colour bands on a vertical shaft (Flame Towers / Sphere).
    // c = world centre of base, h = total height. opts: { r, bands, cols, seg, basis }
    const ledFacadeBands = (c, h, opts) => {
      opts = opts || {};
      const r0 = opts.r != null ? opts.r : 8;
      const bands = opts.bands != null ? opts.bands : 10;
      const cols = opts.cols || [[1.4, 0.35, 0.08], [1.5, 0.55, 0.12], [1.2, 0.18, 0.05], [1.6, 0.85, 0.20]];
      const seg = opts.seg != null ? opts.seg : 8;
      const basis = opts.basis || null;
      const bh = h / bands;
      // Guard widest frustum footprint once — if base covers track, skip all bands.
      if (rejRad(c, r0, h, basis)) {
        console.warn(`[scenery] ledFacadeBands SUPPRESSED at [${c[0]|0},${c[2]|0}]`);
        return;
      }
      for (let i = 0; i < bands; i++) {
        const t = i / Math.max(1, bands - 1);
        const rB = r0 * (1 - t * 0.55);
        const rT = r0 * (1 - (t + 1 / bands) * 0.55);
        const col = cols[i % cols.length];
        const mid = [c[0], c[1] + (i + 0.5) * bh, c[2]];
        addFrustum(out, mid, rB, Math.max(0.4, rT), bh * 0.92, col, seg, basis);
      }
    };

    // Pale grey Jersey / canyon wall with optional accent stripe boxes.
    // opts: { h, thick, col, stripeCol, stripeH, stripeEvery }
    const concreteCanyon = (s0, s1, side, gap, opts) => {
      opts = opts || {};
      const h = opts.h != null ? opts.h : 2.4;
      const thick = opts.thick != null ? opts.thick : 0.55;
      const col = opts.col || [0.72, 0.73, 0.76];
      const stripeCol = opts.stripeCol || null;
      const stripeH = opts.stripeH != null ? opts.stripeH : 0.35;
      const stripeEvery = opts.stripeEvery != null ? opts.stripeEvery : 2;
      recordBarrier(s0, s1, side, gap);
      let stripeI = 0;
      along(s0, s1, 5.5, (k, spacing) => {
        const p = anchor(k, side, gap);
        const sz = [thick, h, spacing];
        if (rejBox(p.c, sz, [p.r, p.u, p.t])) {
          console.warn(`[scenery] concreteCanyon SUPPRESSED at k=${k} side=${side}: gap=${gap}`);
          return;
        }
        addBox(out, vadd(p.c, p.u, h / 2), sz, col, [p.r, p.u, p.t]);
        if (stripeCol && (stripeI++ % stripeEvery === 0)) {
          addBox(out, vadd(p.c, p.u, h * 0.55), [thick + 0.08, stripeH, spacing * 0.55], stripeCol, [p.r, p.u, p.t]);
        }
      });
    };

    // Disc / ellipse sail canopy at world centre c with basis [r,u,t].
    // opts: { rad, h, col, ribs, thick } — ribs are radial struts under a thin disc.
    const sailCanopy = (c, basis, opts) => {
      opts = opts || {};
      const rad = opts.rad != null ? opts.rad : 18;
      const lift = opts.h != null ? opts.h : 14;
      const col = opts.col || [0.92, 0.90, 0.84];
      const ribs = opts.ribs != null ? opts.ribs : 8;
      const thick = opts.thick != null ? opts.thick : 0.55;
      const b = basis || [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
      const u = b[1], r = b[0], f = b[2];
      // Mast / hub under sail — guard footprint so the support never sits on tarmac.
      const hub = [c[0], c[1], c[2]];
      if (rejBox(hub, [3.5, lift, 3.5], b)) {
        console.warn(`[scenery] sailCanopy SUPPRESSED at [${c[0]|0},${c[2]|0}]`);
        return;
      }
      addCyl(out, hub, 0.55, lift, [0.28, 0.28, 0.32], 6, b);
      const crown = vadd(hub, u, lift);
      // Sail disc as a flat wide box (ellipse approximated by axis sizes).
      const rx = opts.rx != null ? opts.rx : rad;
      const rz = opts.rz != null ? opts.rz : rad * 0.72;
      // If the sail itself covers tarmac, still draw it via RAW (overhead veil).
      const sailC = vadd(crown, u, thick / 2);
      if (rejBox(sailC, [rx * 2, thick, rz * 2], b)) {
        RAW.addBox(out, sailC, [rx * 2, thick, rz * 2], col, b);
      } else {
        addBox(out, sailC, [rx * 2, thick, rz * 2], col, b);
      }
      for (let i = 0; i < ribs; i++) {
        const a = (i / ribs) * Math.PI * 2;
        const ox = Math.cos(a) * rx * 0.85, oz = Math.sin(a) * rz * 0.85;
        const tip = vadd(vadd(crown, r, ox), f, oz);
        const mid = [(crown[0] + tip[0]) / 2, (crown[1] + tip[1]) / 2 - 0.4, (crown[2] + tip[2]) / 2];
        addBox(out, mid, [0.22, 0.22, Math.hypot(ox, oz) || 1], [0.35, 0.35, 0.40], b);
      }
    };

    // LED lattice veil / gridshell canopy — arched node lattice over a span.
    // opts: { w, depth, h, cols, rows, ledCols, strutCol }
    const gridshellCanopy = (c, basis, opts) => {
      opts = opts || {};
      const w = opts.w != null ? opts.w : 40;
      const depth = opts.depth != null ? opts.depth : 28;
      const peakH = opts.h != null ? opts.h : 22;
      const cols = opts.cols != null ? opts.cols : 7;
      const rows = opts.rows != null ? opts.rows : 5;
      const ledCols = opts.ledCols || [[0.2, 1.1, 1.2], [1.2, 0.25, 0.7], [1.1, 0.85, 0.25]];
      const strutCol = opts.strutCol || [0.08, 0.09, 0.12];
      const b = basis || [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
      const r = b[0], u = b[1], f = b[2];
      // Support feet at the four corners — full-box guard.
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
        const foot = vadd(vadd(c, r, sx * w * 0.42), f, sz * depth * 0.42);
        if (rejBox(foot, [2.2, peakH * 0.4, 2.2], b)) {
          console.warn(`[scenery] gridshellCanopy foot SUPPRESSED`);
          return;
        }
        addCyl(out, foot, 0.5, peakH * 0.45, strutCol, 5, b);
      }
      for (let j = 0; j <= rows; j++) {
        const zt = j / rows - 0.5;
        let prev = null;
        for (let i = 0; i <= cols; i++) {
          const xt = i / cols - 0.5;
          const arch = Math.cos(xt * Math.PI) * 0.55 + 0.45;   // peak at centre
          const lift = peakH * arch * (0.75 + 0.25 * Math.cos(zt * Math.PI));
          const node = vadd(vadd(vadd(c, u, lift), r, xt * w), f, zt * depth);
          const col = ledCols[(i + j) % ledCols.length];
          // Lattice nodes may overhang the track — RAW when footprint hits tarmac.
          if (rejBox(node, [2.2, 1.2, 2.0], b)) RAW.addBox(out, node, [2.2, 1.2, 2.0], col, b);
          else addBox(out, node, [2.2, 1.2, 2.0], col, b);
          if (prev) {
            const mid = [(prev[0] + node[0]) / 2, (prev[1] + node[1]) / 2, (prev[2] + node[2]) / 2];
            const span = Math.hypot(node[0] - prev[0], node[1] - prev[1], node[2] - prev[2]) || 1;
            if (rejBox(mid, [0.35, 0.35, span], b)) RAW.addBox(out, mid, [0.35, 0.35, span], strutCol, b);
            else addBox(out, mid, [0.35, 0.35, span], strutCol, b);
          }
          prev = node;
        }
      }
    };

    // Wide low asphalt/gravel apron beyond the verge.
    // sz = [depth, thick, length] or number depth with default length.
    const runoffApron = (k, side, gap, sz, col) => {
      let depth, thick, len;
      if (Array.isArray(sz)) { depth = sz[0]; thick = sz[1] != null ? sz[1] : 0.35; len = sz[2] != null ? sz[2] : 24; }
      else { depth = sz || 18; thick = 0.35; len = 24; }
      const dist = gap + depth / 2;
      const a = anchor(k, side, dist), b = [a.r, a.u, a.t];
      const box = [depth, thick, len];
      if (rejBox(a.c, box, b)) {
        console.warn(`[scenery] runoffApron SUPPRESSED at k=${k} side=${side}: gap=${gap}`);
        return;
      }
      addBox(out, vadd(a.c, a.u, thick / 2), box, col || [0.42, 0.40, 0.38], b);
    };

    // Tilted red/white kerb ribbon + optional SAFER-style outer rail (Zandvoort bowls).
    // Track basis already banks with the road, so boxes read the bank tilt.
    // opts: { saferGap, safer, step, saferStep, kerbRed, kerbWht, saferCol }
    const bankedKerbStrip = (s0, s1, side, opts) => {
      opts = opts || {};
      const kerbRed = opts.kerbRed || [0.86, 0.12, 0.14];
      const kerbWht = opts.kerbWht || [0.94, 0.94, 0.92];
      const saferCol = opts.saferCol || [0.76, 0.78, 0.80];
      const saferGap = opts.saferGap != null ? opts.saferGap : 7.0;
      const doSafer = opts.safer !== false;
      let stripe = 0;
      along(s0, s1, opts.step || 3.2, (k, spacing) => {
        const col = (stripe++ & 1) ? kerbWht : kerbRed;
        const a = anchor(k, side, 1.35);
        if (onTrack(a.c[0], a.c[2], 1.1)) return;
        const b = [a.r, a.u, a.t];
        addBox(out, vadd(a.c, a.u, 0.16), [1.05, 0.26, spacing * 0.90], col, b);
        addBox(out, vadd(vadd(a.c, a.r, side * 0.38), a.u, 0.30),
               [0.32, 0.42, spacing * 0.90], col, b);
      });
      if (!doSafer) return;
      along(s0, s1, opts.saferStep || 4.0, (k, spacing) => {
        const a = anchor(k, side, saferGap);
        if (onTrack(a.c[0], a.c[2], 1.4)) return;
        const b = [a.r, a.u, a.t];
        addBox(out, vadd(a.c, a.u, 0.55), [0.58, 1.10, spacing * 0.94], saferCol, b);
        addBox(out, vadd(a.c, a.u, 1.14), [0.62, 0.12, spacing * 0.94], kerbRed, b);
        addCyl(out, vadd(a.c, a.r, side * 0.42), 0.10, 1.25,
               [0.34, 0.34, 0.37], 5, b);
      });
    };

    // Continuous eye-height seat/crowd wall (Foro Sol / baseball-bowl enclosure).
    // opts: { h, thick, shell, step, crowdCols }
    const bowlSeatWall = (s0, s1, side, gap, opts) => {
      opts = opts || {};
      const h = opts.h != null ? opts.h : 5.8;
      const thick = opts.thick != null ? opts.thick : 3.4;
      const shell = opts.shell || [0.55, 0.54, 0.56];
      const crowdCols = opts.crowdCols || [
        [0.92, 0.28, 0.55], [0.95, 0.45, 0.12], [0.18, 0.72, 0.42],
        [0.98, 0.82, 0.10], [0.94, 0.94, 0.92], [0.22, 0.42, 0.78], [0.90, 0.30, 0.24],
      ];
      // Solid seating mass — index it so foliage cannot grow through the bowl.
      indexSolid(s0, s1, side, gap - thick / 2, thick);
      along(s0, s1, opts.step || 7, (k, spacing) => {
        const p = anchor(k, side, gap);
        if (onTrack(p.c[0], p.c[2], thick / 2 + 2)) return;
        const bv = [p.r, p.u, p.t];
        addBox(out, vadd(p.c, p.u, h * 0.48), [thick, h * 0.95, spacing * 0.94], shell, bv);
        addBox(out, vadd(vadd(p.c, p.u, h * 0.55), p.r, -side * (thick * 0.38)),
               [0.55, h * 0.72, spacing * 0.88],
               crowdCols[Math.floor(hash(k * 11 + side) * crowdCols.length) % crowdCols.length], bv);
      });
    };

    // Sparse cream/ochre Med apartment boxes (Monaco canyon).
    // opts: { palette, minH, maxH, depth, step, lit, windowCol, window, floor }
    const pastelStreetRow = (s0, s1, side, gap, opts) => {
      opts = opts || {};
      const pal = opts.palette || [[0.92, 0.86, 0.72], [0.86, 0.72, 0.48]];
      const minH = opts.minH != null ? opts.minH : 12;
      const maxH = opts.maxH != null ? opts.maxH : 22;
      const depth = opts.depth != null ? opts.depth : 10;
      const step = opts.step != null ? opts.step : 40;
      const win = opts.window || [0.35, 0.42, 0.52];
      along(s0, s1, step, (k) => {
        const hv = hash(k * 5.3 + side * 0.9);
        const w = 10 + hv * 8;
        const h = minH + hash(k * 9.1 + side) * (maxH - minH);
        const g = gap + hash(k * 2.7) * 1.5;
        building(k, side, g, w, h, depth,
          { wall: pal[Math.floor(hash(k * 3.1) * pal.length) % pal.length],
            window: win, floor: opts.floor != null ? opts.floor : (3.5 + hv),
            lit: opts.lit !== false, windowCol: opts.windowCol || [0.95, 0.88, 0.55] });
      });
    };

    return { underpassPortal, floodMast, floodMastRing, ledFacadeBands,
             concreteCanyon, sailCanopy, gridshellCanopy, runoffApron,
             bankedKerbStrip, bowlSeatWall, pastelStreetRow };
  }

  return { create };
})();
