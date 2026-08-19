/* Apex 26 — AUTODROMO INTERNAZIONALE DEL MUGELLO definition (data only).
   Classic circuit (`classic: true`): hosted a single F1 race, the 2020 Tuscan GP.
   Geometry from the OSM trace in js/track/geo-paths.js. */
(function () {
  "use strict";
  (window.TrackDefs = window.TrackDefs || []).push(
  {
    id: "mugello",
    classic: true,
    // Upstream it-1914 already runs clockwise (San Donato at T1 is a right).
    reverse: false,
    // The trace opens on the 682 m main straight — Mugello's longest — and its
    // first vertex is the line itself.
    // Start/finish line. Snapped to the real one: v0 convention; T1 measured RIGHT, matches San Donato.
    // Was 0.05, which put the line inside a corner — a start line is
    // always on a straight. See docs/tracks/START-LINES.md.
    startFrac: 0.0000,
    sceneryStartFrac: 0.05,
    name: "MUGELLO",
    gp: "Tuscan GP",
    country: "Italy",
    night: false,
    theme: "green",
    lengthKm: 5.2,
    baseHW: 7.5,
    sceneryCoordinates: "racing",
    terrainOuter: 120,
    dressingExclusions: [
      { kinds: ["foliage"], s0: 0.92, s1: 0.10 },
      { kind: "foliage", s0: 0.36, s1: 0.46 },
    ],
    // Tuscan hill light: warm, golden, slightly hazy; cypress-dark greens.
    pal: {
      zenith:        [0.24, 0.44, 0.74],
      horizon:       [0.80, 0.76, 0.64],
      sun:           [1.0,  0.94, 0.74],
      sunColor:      [1.0,  0.93, 0.72],
      ambientSky:    [0.48, 0.51, 0.56],
      ambientGround: [0.30, 0.28, 0.20],
      fogColor:      [0.76, 0.72, 0.62],
      grass:         [0.24, 0.42, 0.19],
      sunDir:        [0.44, 0.64, 0.32],
    },
    elevations: [
      { s: 0.16, halfM: 340, rise: 10.0 },   // climb after San Donato
      { s: 0.34, halfM: 380, rise: -11.0 },  // drop to Casanova-Savelli
      { s: 0.52, halfM: 340, rise: 9.0 },    // up through the Arrabbiate
      { s: 0.74, halfM: 360, rise: -8.0 },   // down to Bucine
      { s: 0.92, halfM: 300, rise: 6.0 },    // rise onto the main straight
    ],
    hwZones: [
      { s0: 0.290, s1: 0.335, hw: 6.3, ease: 0.012 },  // Casanova-Savelli
      { s0: 0.620, s1: 0.660, hw: 6.4, ease: 0.012 },  // Correntaio
      { s0: 0.860, s1: 0.900, hw: 6.4, ease: 0.012 },  // Bucine
    ],
    bankZones: [
      { frac: 0.070, angleDeg: 4.0, widthM: 130 },   // San Donato
      { frac: 0.470, angleDeg: 5.0, widthM: 150 },   // Arrabbiata 1
      { frac: 0.520, angleDeg: 5.0, widthM: 140 },   // Arrabbiata 2
      { frac: 0.880, angleDeg: 4.5, widthM: 140 },   // Bucine
    ],
    scenery: function (api) {
      const { out, MAT, n, track, pyMin, hash, every, along, anchor, vadd, onTrack, px, pz, hw,
        indexSolid,
        pine, tree, bush, hedge, ridge, mountain, building, grandstandEx,
        spectatorHill, broadcastCompound, billboard, gantry, marshalPost,
        motorhome, fence, guardrail, tyreWall, groundPatch, modelGroup,
        cameraTower, sponsorHoarding, signBoard,
        addBox, addCyl, addCone, addPrism, addFrustum, forestEdge,
        terrainYAt, groundYAt,
        groundUnder,
      } = api;
      const K = (s) => Math.round(s * n) % n;

      // ── VINEYARDS AND CASALI — the other half of Tuscany ─────────────────
      // Mugello already plants the cypress and the olives, which is two of the
      // three things that make this landscape. The third was missing: the
      // hills are worked farmland, quilted with VINE ROWS and punctuated by
      // stone CASALI. Cypress and olive alone read as "somewhere warm"; add
      // the vine quilt and the farmhouses and it can only be Tuscany.
      //
      // Vine rows follow the Imola pattern, which measures clean on
      // coplanar-audit: the read is entirely in the repetition, so rows must be
      // parallel and evenly spaced, each stepping out and shearing slightly to
      // follow a contour, over bare tilled soil, with end posts on the wire.
      {
        const VINE     = [0.27, 0.37, 0.20];
        const VINE_DRY = [0.33, 0.41, 0.23];
        const SOIL     = [0.46, 0.35, 0.25];
        const POST     = [0.53, 0.45, 0.33];
        for (const [sf, side, gap, rows, len, ang] of [
          [0.115,  1,  98, 8, 68,  0.09],
          [0.180, -1, 132, 6, 54, -0.07],
          [0.310, -1, 104, 7, 62,  0.06],
          [0.455,  1, 126, 6, 58, -0.05],
          [0.585,  1,  96, 8, 66,  0.08],
          [0.720, -1, 118, 7, 60, -0.06],
          [0.865, -1, 100, 6, 52,  0.07],
        ]) {
          const kk = K(sf), a0 = anchor(kk, side, gap);
          if (onTrack(a0.c[0], a0.c[2], 30)) continue;
          for (let r = 0; r < rows; r++) {
            const a = anchor(kk + Math.round(r * ang * 10), side, gap + r * 6.5);
            if (onTrack(a.c[0], a.c[2], 24)) continue;
            const b = [a.r, a.u, a.t];
            const hv = hash(kk * 19 + r * 31);
            const rowLen = len * (0.85 + hv * 0.24);
            addBox(out, vadd(a.c, a.u, 0.06), [4.6, 0.12, rowLen], SOIL, b);
            out._mat = MAT.FOLIAGE;
            addBox(out, vadd(a.c, a.u, 1.05), [1.5, 1.5, rowLen],
                   hv < 0.5 ? VINE : VINE_DRY, b);
            out._mat = 0;
            out._mat = MAT.WOOD;
            for (const e of [-rowLen / 2, rowLen / 2]) {
              addCyl(out, vadd(a.c, a.t, e), 0.10, 2.0, POST, 4, b);
            }
            out._mat = 0;
          }
        }

        // Casali. A Tuscan farmhouse is a squat rectangular block of rough
        // stone under a shallow terracotta pitch with deep eaves, a square
        // tower end on the older ones, and — the giveaway — a pair of
        // cypresses at the gate.
        //
        // These were built once before and ABANDONED: wherever they went they
        // landed on the existing olive and cypress planting (clip-audit
        // 17 -> 18 severe, the spot list naming it addBox x addCone at frac
        // 0.64), and a circuit file had no way to say "this ground is taken".
        // indexSolid() is now on the scenery api and this is its first use:
        // reserve the footprint, and because foliage is deferred to after
        // def.scenery(), the roadside scatter and treelines route around it.
        const RENDER = [0.78, 0.71, 0.58], RENDER_D = [0.70, 0.63, 0.51];
        const TILE   = [0.62, 0.34, 0.22], TILE_D = [0.54, 0.29, 0.19];
        const CYP    = [0.14, 0.26, 0.15];
        for (const [sf, side, gap] of [
          [0.150, -1, 112], [0.385,  1, 108], [0.640, -1,  98], [0.800,  1, 116],
        ]) {
          const kk = K(sf), a = anchor(kk, side, gap);
          if (onTrack(a.c[0], a.c[2], 26)) continue;
          const b = [a.r, a.u, a.t];
          const hv = hash(kk * 43 + gap);
          const w = 12 + hv * 4, d = 15 + hv * 6, wallH = 7 + hv * 2;
          const halfFrac = (d * 0.5 + w * 1.1) / track.total;
          indexSolid(sf - halfFrac, sf + halfFrac, side, gap - 4, w * 2.0);
          out._mat = MAT.STONE;
          addBox(out, vadd(a.c, a.u, wallH * 0.5), [w, wallH, d],
                 hv < 0.5 ? RENDER : RENDER_D, b);
          out._mat = 0;
          addPrism(out, vadd(a.c, a.u, wallH), [w * 1.14, w * 0.27, d * 1.10],
                   hv < 0.5 ? TILE : TILE_D, b);
          if (hv > 0.45) {
            const tc = vadd(a.c, a.t, d * 0.5 + 3.8);
            out._mat = MAT.STONE;
            addBox(out, vadd(tc, a.u, wallH * 0.72), [7.5, wallH * 1.44, 7.5], RENDER_D, b);
            out._mat = 0;
            addPrism(out, vadd(tc, a.u, wallH * 1.44), [8.4, 2.0, 8.4], TILE_D, b);  // base-anchored: flush on the tower
          }
          // Shuttered windows, sparse and small — Tuscan walls are mostly wall.
          for (let i = -1; i <= 1; i++) {
            addBox(out, vadd(vadd(vadd(a.c, a.r, -w * 0.5), a.t, i * d * 0.28),
                             a.u, wallH * 0.62),
                   [0.16, 1.5, 1.0], [0.30, 0.34, 0.26], b);
          }
          // The cypress pair at the gate. Cones STACK rather than merge.
          out._mat = MAT.FOLIAGE;
          for (const t of [-w * 0.85, w * 0.85]) {
            const cc = vadd(vadd(a.c, a.t, t), a.r, -w * 0.7);
            cc[1] = groundUnder(cc[0], cc[2]) - 0.7;
            if (onTrack(cc[0], cc[2], 8)) continue;
            const ch = 12 + hash(kk + t) * 4;
            addCone(out, vadd(cc, a.u, ch * 0.10), 1.5, ch * 0.55, CYP, 6, b);
            addCone(out, vadd(cc, a.u, ch * 0.62), 1.15, ch * 0.38, CYP, 6, b);
          }
          out._mat = 0;
        }
      }

      const PINE = [0.12, 0.29, 0.15], PINE_D = [0.09, 0.23, 0.13];
      const LEAF = [0.20, 0.44, 0.20], LEAF_D = [0.15, 0.36, 0.17];
      const GRAVEL = [0.68, 0.61, 0.44];
      const CYP = [0.11, 0.27, 0.15], CYP_D = [0.08, 0.21, 0.12];
      const STONE = [0.82, 0.76, 0.62], TRAV = [0.88, 0.85, 0.76];
      const TERRA = [0.62, 0.33, 0.23], ROSSO = [0.80, 0.12, 0.10];
      const OLIVE = [0.44, 0.48, 0.34], VINE = [0.30, 0.40, 0.22];

      const openArea = (s) => (s >= 0.92 || s <= 0.10) || (s >= 0.36 && s <= 0.46);
      every(22, (k) => {
        const s = k / n;
        if (openArea(s)) return;
        const h = hash(k * 31);
        if (h < 0.24) return;
        const side = h < 0.5 ? -1 : 1;
        tree(k, side, 11 + h * 9, 12 + h * 9, h < 0.45 ? LEAF_D : LEAF);
        if (h > 0.55) pine(k, -side, 14 + h * 10, 15 + h * 10, PINE);
      });
      every(34, (k) => {
        const s = k / n;
        if (openArea(s)) return;
        const h = hash(k * 53 + 9);
        if (h < 0.35) return;
        tree(k, h < 0.5 ? -1 : 1, 30 + h * 18, 12 + h * 8, LEAF_D);
        if (h > 0.72) pine(k, h > 0.86 ? -1 : 1, 44 + h * 22, 18 + h * 10, PINE_D);
      });
      every(26, (k) => {
        const s = k / n;
        if (openArea(s)) return;
        const h = hash(k * 97 + 23);
        if (h < 0.55) return;
        bush(k, h < 0.75 ? -1 : 1, 7 + h * 5, [0.18, 0.38, 0.18]);
      });

      function cypress(k, side, dist, h) {
        const a = anchor(k, side, dist);
        // Overhang past the supporting body (cause class b) — via a MISSING
        // guard, not a geometric one: unlike every other placement helper in
        // this file, cypress() never checked onTrack(). The "cypress drive"
        // callers below vary `dist` per tree without checking it either, and
        // at k=661 dist=80/86 the anchor lands ON the tarmac: the engine's
        // road-safety guard (js/track/tracks.js ~2098) drops the trunk and
        // the two wider cones WHOLE (their footprint covers the road) but
        // spares the narrowest top cone, orphaning it 9-16 m up with nothing
        // left beneath it. Skip the whole tree instead.
        if (onTrack(a.c[0], a.c[2], 2)) return;
        const b = [a.r, a.u, a.t];
        const col = hash(k * 7 + side) < 0.5 ? CYP : CYP_D;
        out._mat = MAT.WOOD;
        addCyl(out, a.c, 0.22, h * 0.16, [0.30, 0.22, 0.14], 5, b);
        out._mat = MAT.FOLIAGE;
        addCone(out, vadd(a.c, a.u, h * 0.10), 1.45, h * 0.58, col, 6, b);
        addCone(out, vadd(a.c, a.u, h * 0.44), 1.10, h * 0.42, col, 6, b);
        addCone(out, vadd(a.c, a.u, h * 0.70), 0.70, h * 0.32, col, 6, b);
        out._mat = 0;
      }
      // Avenue up to the paddock, and ranks on the hillside above the Arrabbiate.
      for (let i = 0; i < 10; i++) cypress(K(0.955 + i * 0.005), 1, 46 + (i % 2) * 4, 15 + hash(i * 9) * 6);
      for (let i = 0; i < 8; i++) cypress(K(0.470 + i * 0.008), 1, 54 + (i % 2) * 5, 14 + hash(i * 5) * 6);
      for (let i = 0; i < 6; i++) cypress(K(0.180 + i * 0.008), -1, 50 + (i % 2) * 4, 13 + hash(i * 11) * 6);

      for (const [i, s] of [0.945, 0.963, 0.981, 0.999].entries()) {
        const a = anchor(K(s), 1, 16);
        const b = [a.r, a.u, a.t];
        modelGroup(`mugello-pit-bay-${i + 1}`, {
          center: vadd(a.c, a.u, 8), size: [22, 20, 42], basis: b,
        }, (stage) => {
          stage._mat = MAT.STONE;
          addBox(stage, vadd(a.c, a.u, 3.6), [14, 7.2, 40], STONE, b);
          for (let g = 0; g < 4; g++) {
            const off = (g - 1.5) * 9.4;
            const face = vadd(vadd(a.c, a.t, off), a.r, -7.1);
            addBox(stage, vadd(face, a.u, 3.6), [0.55, 7.2, 1.6], TRAV, b);
            for (let v = 0; v < 3; v++) {
              const w = 6.4 - v * 1.9;
              addBox(stage, vadd(vadd(vadd(a.c, a.t, off + 4.7), a.r, -7.2),
                a.u, 5.4 + v * 0.55), [0.45, 0.55, w], TRAV, b);
            }
          }
          stage._mat = 0;
          addBox(stage, vadd(vadd(a.c, a.r, -7.0), a.u, 2.6), [0.3, 4.6, 36],
            [0.20, 0.20, 0.22], b);                       // shaded garage openings
          stage._mat = MAT.CONCRETE;
          // Hospitality storey, set back behind a continuous rosso band.
          addBox(stage, vadd(vadd(a.c, a.r, 1.6), a.u, 9.6), [10, 5.2, 39], TRAV, b);
          addBox(stage, vadd(vadd(a.c, a.r, -3.3), a.u, 7.4), [1.2, 0.9, 40], ROSSO, b);
          stage._mat = MAT.GLASS;
          addBox(stage, vadd(vadd(a.c, a.r, -3.5), a.u, 9.8), [0.4, 3.2, 37],
            [0.20, 0.26, 0.32], b);
          stage._mat = 0;
          // Terracotta eave, oversailing on exposed timber brackets.
          addPrism(stage, vadd(vadd(a.c, a.r, -0.5), a.u, 12.2), [19, 1.9, 41], TERRA, b);
          stage._mat = MAT.WOOD;
          for (let c = 0; c < 5; c++) {
            addBox(stage, vadd(vadd(vadd(a.c, a.t, (c - 2) * 8.6), a.r, -6.8), a.u, 11.6),
              [5.5, 0.4, 0.5], [0.42, 0.30, 0.20], b);
          }
          stage._mat = 0;
        }, { required: true });
      }
      {
        const a = anchor(K(0.988), 1, 28);
        const b = [a.r, a.u, a.t];
        modelGroup("mugello-race-control", {
          center: vadd(a.c, a.u, 14), size: [14, 34, 14], basis: b,
        }, (stage) => {
          stage._mat = MAT.STONE;
          addBox(stage, vadd(a.c, a.u, 11), [7.5, 22, 7.5], TRAV, b);
          stage._mat = MAT.GLASS;
          addBox(stage, vadd(a.c, a.u, 24), [9, 4.4, 9], [0.20, 0.26, 0.32], b);
          stage._mat = 0;
          // Corner posts of the loggia, then the pantile cap.
          for (const sr of [-1, 1]) for (const st of [-1, 1]) {
            addBox(stage, vadd(vadd(vadd(a.c, a.r, sr * 4.4), a.t, st * 4.4), a.u, 24),
              [0.6, 4.6, 0.6], TRAV, b);
          }
          addBox(stage, vadd(a.c, a.u, 26.6), [10, 0.8, 10], ROSSO, b);
          addPrism(stage, vadd(a.c, a.u, 27.0), [10.5, 2.6, 10.5], TERRA, b);
          addCyl(stage, vadd(a.c, a.u, 29.6), 0.11, 8, [0.86, 0.86, 0.88], 5, b);
        }, { required: true });
      }
      gantry(0.0, 8.5, [0.15, 0.15, 0.18]);
      gantry(0.968, 8.0, [0.15, 0.15, 0.18]);
      grandstandEx(0.005, -1, 11, 160, null, null,
        { livery: "crimson", tiers: 2, roof: "cantilever", suites: true, endWalls: true, pylons: true });
      // Red trim band fronting the main stand — Ferrari's circuit, Ferrari's colour.
      {
        const a = anchor(K(0.005), -1, 8);
        addBox(out, vadd(a.c, a.u, 1.6), [2, 1.6, 150], [0.80, 0.14, 0.12], [a.r, a.u, a.t]);
      }
      for (let i = 0; i < 4; i++) {
        building(K(0.925 + i * 0.013), 1, 40, 28, 8, 20,
          { kind: "hall", wall: STONE, window: [0.30, 0.32, 0.36], floor: 4.5 });
      }
      every(46, (k) => {
        const s = k / n, h = hash(k * 71 + 31);
        if (!(s > 0.90 || s < 0.05) || h < 0.52) return;
        motorhome(k, 1, 56 + h * 10, 10, 4, 6, { wall: [0.66 + h * 0.24, 0.66, 0.68] });
      });
      broadcastCompound(K(0.916), 1, 74, { vans: 3, dishes: 2, mastH: 9 });
      for (const s of [0.975, 0.01, 0.03]) billboard(K(s), -1, 8, 12, 4.5, [0.86, 0.14, 0.12]);

      const terrazza = (s0, s1, side, gap, opts) => {
        opts = opts || {};
        const rows = opts.rows || 7, rise = opts.rise || 0.9, depth = opts.depth || 1.5;
        along(s0, s1, opts.step || 8, (k, spacing) => {
          const a = anchor(k, side, gap);
          const b = [a.r, a.u, a.t], seg = spacing * 0.95;
          out._mat = MAT.CONCRETE;
          // Painted band at the foot — repainted rosso/bianco every spring.
          addBox(out, vadd(a.c, a.u, 0.85), [0.7, 1.7, seg],
            (Math.round(k / 4) & 1) ? ROSSO : [0.93, 0.93, 0.90], b);
          for (let r = 0; r < rows; r++) {
            const back = 0.9 + r * depth, up = 0.9 + r * rise;
            addBox(out, vadd(vadd(a.c, a.r, side * back), a.u, up),
              [depth, rise + 0.25, seg], r & 1 ? [0.74, 0.72, 0.68] : [0.68, 0.66, 0.63], b);
            const h = hash(k * 23 + r * 3);
            if (h > 0.52) continue;
            out._mat = MAT.FABRIC;
            addBox(out, vadd(vadd(vadd(a.c, a.r, side * back),
              a.t, (h - 0.26) * seg * 0.8), a.u, up + rise * 0.5 + 0.55),
              [0.55, 1.0, 0.6],
              h < 0.3 ? [0.84, 0.16, 0.14] : [0.90, 0.88, 0.84], b);   // tifosi red
            out._mat = MAT.CONCRETE;
          }
          out._mat = MAT.METAL;
          const topBack = 0.9 + rows * depth, topUp = 0.9 + rows * rise;
          const railBase = vadd(a.c, a.r, side * topBack);
          const railGy = groundUnder(railBase[0], railBase[2]);
          const railUp = railGy != null ? railGy - a.c[1] + 1.3 : topUp + 1.0;
          addBox(out, vadd(railBase, a.u, railUp),
            [0.09, 0.09, seg], [0.72, 0.74, 0.76], b);
          out._mat = 0;
        });
      };

      groundPatch(K(0.070), 1, 6, [38, 0.18, 52], GRAVEL,
        { id: "mugello-san-donato-gravel", samples: 8 });
      tyreWall(0.055, 0.090, 1, 5, [0.86, 0.20, 0.18]);
      terrazza(0.048, 0.098, -1, 18, { rows: 9 });          // San Donato bowl
      marshalPost(K(0.075), -1, 10);

      groundPatch(K(0.312), 1, 5, [26, 0.18, 34], GRAVEL,
        { id: "mugello-casanova-gravel", samples: 6 });
      tyreWall(0.298, 0.328, 1, 4, [0.20, 0.40, 0.85]);
      terrazza(0.292, 0.334, -1, 18, { rows: 6 });          // Casanova-Savelli
      marshalPost(K(0.306), -1, 9);

      groundPatch(K(0.495), -1, 6, [30, 0.18, 40], GRAVEL,
        { id: "mugello-arrabbiata-gravel", samples: 7 });
      tyreWall(0.478, 0.512, -1, 5, [0.85, 0.78, 0.20]);
      marshalPost(K(0.500), 1, 9);

      groundPatch(K(0.880), -1, 5, [26, 0.18, 34], GRAVEL,
        { id: "mugello-bucine-gravel", samples: 6 });
      terrazza(0.858, 0.902, 1, 18, { rows: 8 });           // Bucine, onto the straight
      marshalPost(K(0.875), 1, 9);

      spectatorHill(0.16, 0.26, -1, 14, { rows: 3, rise: 1.1, depth: 1.8, density: 0.42, step: 9 });
      spectatorHill(0.62, 0.72, 1, 14, { rows: 3, rise: 1.1, depth: 1.8, density: 0.42, step: 9 });

      for (const [s0, s1] of [[0.10, 0.28], [0.34, 0.46], [0.53, 0.61], [0.67, 0.85]]) {
        guardrail(s0, s1, -1, 8, [0.80, 0.81, 0.83]);
        guardrail(s0, s1,  1, 8, [0.80, 0.81, 0.83]);
      }
      guardrail(0.94, 0.06, 1, 4.0, [0.85, 0.85, 0.88]);
      fence(0.95, 0.06, -1, 9, 4, [0.74, 0.76, 0.80]);
      for (const s of [0.14, 0.22, 0.40, 0.56, 0.70, 0.90]) {
        marshalPost(K(s), hash(K(s)) < 0.5 ? -1 : 1, 9);
      }

      const cx = px.reduce((a, b) => a + b, 0) / n, cz = pz.reduce((a, b) => a + b, 0) / n;
      let rad = 0;
      for (let i = 0; i < n; i++) rad = Math.max(rad, Math.hypot(px[i] - cx, pz[i] - cz));
      for (const rg of [
        { extra: 200, wMin: 170, hMin: 50, hVar: 44, wVar: 80, count: 28, phase: 0.0,
          opts: { seg: 7, rough: 0.30, forest: [0.14, 0.34, 0.17], rock: [0.40, 0.38, 0.32], snowline: 2 } },
        { extra: 300, wMin: 320, hMin: 84, hVar: 60, wVar: 130, count: 22, phase: 0.5,
          opts: { seg: 7, rough: 0.32, forest: [0.18, 0.38, 0.20], rock: [0.46, 0.44, 0.38], snowline: 2 } },
        { extra: 450, wMin: 380, hMin: 120, hVar: 90, wVar: 150, count: 18, phase: 0.25,
          opts: { seg: 7, rough: 0.34, forest: [0.24, 0.42, 0.26], rock: [0.54, 0.52, 0.48], snowline: 2 } },
      ]) {
        const ring = rad + rg.extra;
        for (let i = 0; i < rg.count; i++) {
          const a = (i + rg.phase) / rg.count * 6.2832, h = hash(i * 7 + rg.extra);
          const rr = ring - rg.wMin * 0.18 + hash(i * 5 + rg.extra) * rg.wMin * 0.30;
          mountain(cx + Math.cos(a) * rr, cz + Math.sin(a) * rr, pyMin,
            rg.wMin + h * rg.wVar, rg.hMin + h * rg.hVar,
            Object.assign({ seed: i * 13 + rg.extra }, rg.opts));
        }
      }

      {
        const a = anchor(K(0.500), 1, 110);
        const b = [a.r, a.u, a.t];
        modelGroup("mugello-casale", {
          center: vadd(a.c, a.u, 9), size: [30, 24, 44], basis: b,
        }, (stage) => {
          stage._mat = MAT.STONE;
          addBox(stage, vadd(a.c, a.u, 5.5), [16, 11, 22], STONE, b);
          addBox(stage, vadd(vadd(a.c, a.t, -8), a.u, 8.5), [9, 17, 9],
            [0.80, 0.74, 0.60], b);
          stage._mat = 0;
          addPrism(stage, vadd(a.c, a.u, 12.5), [16.6, 3.2, 22.6], TERRA, b);
          addPrism(stage, vadd(vadd(a.c, a.t, -8), a.u, 17), [9.8, 2.4, 9.8], TERRA, b);
          // Attached lower barn with an open cart arch.
          const p = vadd(a.c, a.t, 16);
          stage._mat = MAT.STONE;
          addBox(stage, vadd(p, a.u, 3), [12, 6, 12], [0.78, 0.72, 0.58], b);
          stage._mat = 0;
          addPrism(stage, vadd(p, a.u, 7), [12.4, 2.2, 12.4], [0.58, 0.32, 0.22], b);
          addBox(stage, vadd(vadd(p, a.r, -6.1), a.u, 2.2), [0.3, 4.0, 5], [0.20, 0.18, 0.16], b);
          // Shuttered window openings on the house face.
          for (let i = 0; i < 4; i++) {
            addBox(stage, vadd(vadd(vadd(a.c, a.t, (i - 1.5) * 5), a.r, -8.1), a.u, 6.5),
              [0.25, 1.9, 1.2], [0.30, 0.36, 0.28], b);
          }
        });
        for (let i = 0; i < 7; i++) {
          const dist = 74 + i * 6;
          cypress(K(0.494), 1, dist, 15 + hash(i * 3) * 4);
          cypress(K(0.506), 1, dist, 15 + hash(i * 5 + 1) * 4);
        }
      }

      {
        const a = anchor(K(0.235), -1, 118);
        const b = [a.r, a.u, a.t];
        modelGroup("mugello-pieve", {
          center: vadd(a.c, a.u, 12), size: [22, 32, 40], basis: b,
        }, (stage) => {
          stage._mat = MAT.STONE;
          addBox(stage, vadd(a.c, a.u, 4.5), [13, 9, 26], TRAV, b);           // nave
          addBox(stage, vadd(vadd(a.c, a.t, 16), a.u, 11), [7, 22, 7], TRAV, b); // campanile
          stage._mat = 0;
          addPrism(stage, vadd(a.c, a.u, 9.6), [13.6, 3.4, 26.6], TERRA, b);
          addPrism(stage, vadd(vadd(a.c, a.t, 16), a.u, 22.4), [7.6, 2.6, 7.6], TERRA, b);
          // Belfry openings — two dark arches on each face of the tower.
          for (const sr of [-1, 1]) {
            addBox(stage, vadd(vadd(vadd(a.c, a.t, 16), a.r, sr * 3.6), a.u, 19),
              [0.3, 3.0, 3.6], [0.16, 0.15, 0.14], b);
          }
          addBox(stage, vadd(vadd(a.c, a.r, -6.6), a.u, 4.6), [0.3, 4.2, 2.6],
            [0.22, 0.18, 0.15], b);                                          // west door
        });
        cypress(K(0.228), -1, 104, 16);
        cypress(K(0.243), -1, 104, 17);
      }

      for (const [s0, s1, side, gap, kind] of [
        [0.14, 0.26, 1, 62, "vine"],
        [0.44, 0.58, 1, 70, "vine"],
        [0.64, 0.76, -1, 58, "olive"],
        [0.80, 0.90, -1, 66, "vine"],
      ]) {
        const rows = kind === "vine" ? 9 : 6;
        const pitch = kind === "vine" ? 3.4 : 6.2;
        along(s0, s1, 11, (k, spacing) => {
          const a = anchor(k, side, gap);
          const b = [a.r, a.u, a.t];
          for (let r = 0; r < rows; r++) {
            const back = r * pitch;
            // TRAP B (docs/SCENERY-GROUNDING.md §2): anchor() samples the ground
            // at the ROAD EDGE, and these rows march up to 37 m back from it —
            // across a Tuscan hillside. Reusing a.c's height that far put the
            // back rows metres into the air. Re-seat each row on the ground
            // under it; terrainYAt is null off the rendered ribbon, where a.c
            // remains the best available guess.
            const base = vadd(a.c, a.r, side * back);
            const by = terrainYAt(base[0], base[2]);
            if (by != null) base[1] = by;
            if (kind === "vine") {
              out._mat = MAT.FOLIAGE;
              addBox(out, vadd(base, a.u, 0.85),
                [0.9, 1.5, spacing * 0.96], r & 1 ? VINE : [0.26, 0.36, 0.20], b);
              out._mat = 0;
            } else {
              const h = hash(k * 7 + r * 13);
              if (h < 0.45) continue;
              addCyl(out, vadd(base, a.u, 0.7),
                0.18, 1.4, [0.42, 0.36, 0.28], 5, b);
              out._mat = MAT.FOLIAGE;
              addFrustum(out, vadd(base, a.u, 1.4),
                1.5, 0.9, 2.2, OLIVE, 6, b);
              out._mat = 0;
            }
          }
        });
      }

      // Turn signage and broadcast towers.
      signBoard(K(0.070), -1, 8, "corner", 1);
      signBoard(K(0.312), -1, 8, "corner", 6);
      signBoard(K(0.495), 1, 8, "corner", 9);
      signBoard(K(0.880), 1, 8, "corner", 15);
      sponsorHoarding(0.930, 0.060, -1, 3.6, { h: 1.2, step: 10,
        palette: [ROSSO, [0.94, 0.92, 0.88], [0.10, 0.34, 0.20], [0.96, 0.76, 0.06]] });
      cameraTower(K(0.030), -1, 26, { h: 16 });
      cameraTower(K(0.072), -1, 30, { h: 18 });
      cameraTower(K(0.500), 1, 30, { h: 18 });
      cameraTower(K(0.880), 1, 28, { h: 16 });
      for (const [s0, s1] of [[0.12, 0.34], [0.48, 0.9]]) {
        for (const side of [-1, 1])
          forestEdge(s0, s1, side, 14, { density: 0.64, hMin: 11, hMax: 20, pineFrac: 0.45, col: PINE, col2: LEAF_D });
      }
      forestEdge(0.50, 0.68, 1, 30, { density: 0.22, hMin: 15, hMax: 24, pineFrac: 0.5, col: PINE_D, col2: LEAF_D });

      grandstandEx(0.074, -1, 36, 88, null, null,
        { livery: "crimson", tiers: 2, roof: "cantilever", suites: true,
          endWalls: true, pylons: true });
    },
  }
  );
})();
