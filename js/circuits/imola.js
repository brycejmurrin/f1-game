/* Apex 26 — IMOLA circuit definition (data only). */
(function () {
  "use strict";
  (window.TrackDefs = window.TrackDefs || []).push(
  {
    id: "imola",
    reverse: false, // direction switched to real-world CW/CCW (was auto-audit reverse:true)
    // Start/finish line. Snapped to the real one: coord 6.3 m off centreline; = trace vertex 0 (timing line).
    // Was 0.4950, which put the line inside a corner — a start line is
    // always on a straight. See docs/tracks/START-LINES.md.
    startFrac: 0.0000,
    sceneryStartFrac: 0.4950,
    sceneryCoordinates: "racing",
    name: "IMOLA",
    gp: "Emilia Romagna GP",
    country: "Italy",
    night: false,
    theme: "green",
    lengthKm: 4.9,
    baseHW: 7,
    terrainOuter: 120,
    dressingExclusions: [
      // Bespoke parkland and selective lamps below own the full circuit.
      { kinds: ["foliage", "lighting"], s0: 0, s1: 1 },
    ],
    pal: { zenith: [0.24, 0.44, 0.74], horizon: [0.80, 0.72, 0.56], grass: [0.24, 0.46, 0.16], runoff: [0.44, 0.42, 0.36], sunDir: [0.7874615506676528, 0.5468482990747588, 0.2843611155188746], sun: [1, 0.9, 0.65], sunColor: [1, 0.88, 0.62] },
    segs: [
      { t: 0, l: 450 }, { t: 90, l: 100 }, { t: -60, l: 90 }, { t: 0, l: 300 }, { t: 70, l: 90 }, { t: -60, l: 80 },
      { t: -80, l: 100 }, { t: 0, l: 400 }, { t: -80, l: 100 }, { t: 60, l: 80 }, { t: 0, l: 180 }, { t: -80, l: 90 },
      { t: 100, l: 110 },
    ],
    elevations: [
      { s: 0.835, halfM: 380, rise: 14 },
      { s: 0.975, halfM: 260, rise: -10 },
      { s: 0.135, halfM: 360, rise: 16 },
      { s: 0.295, halfM: 320, rise: -14 },
    ],
    bankZones: [
      { frac: 0.1905, angleDeg: 3.0, widthM: 60 },    // Villeneuve/Tosa link
      { frac: 0.3440, angleDeg: 4.0, widthM: 90 },    // Piratella
      { frac: 0.3703, angleDeg: 3.5, widthM: 90 },    // Acque Minerali
      { frac: 0.7874, angleDeg: 4.0, widthM: 70 },    // Rivazza 1
      { frac: 0.8456, angleDeg: 4.0, widthM: 110 },   // Rivazza 2
      { frac: 0.9737, angleDeg: 3.0, widthM: 120 },   // final sweep to the line
    ],
    scenery: function (api) {
      const { out, MAT, n, px, pz, hw, pyMin, hash, every, place, prop, backdrop,
              groundPatch, waterSurface, modelGroup,
              groundYAt, onTrack, addBox, addCyl, addPrism, addFrustum, vadd, anchor,
              seat, foundation,
              along, mountain, tree, pine, hedge, bush,
              cypress, stonePine, plane, tieredBowl, terrace,
              grandstand, spectatorHill, building, motorhome, tower, billboard, marshalPost, gantry,
              fence, guardrail, tyreWall, wall, lampPost,
              forestEdge } = api;
      const K = (s) => Math.round(s * n) % n;
      const terrainPatch = (id, s, side, gap, size, col, opts) =>
        groundPatch(K(s), side, gap, [size[0], 0.18, size[1]], col,
          Object.assign({ id, samples: Math.max(3, Math.ceil(size[0] / 10)) }, opts));
      const riverSurface = (id, s, side, gap, size, col, opts) =>
        waterSurface(K(s), side, gap, [size[0], 0.16, size[1]], col,
          Object.assign({ id }, opts));

      const CANOPY2 = [0.17, 0.44, 0.19];
      const WOODS   = [0.10, 0.28, 0.14];
      const WOODS2  = [0.13, 0.32, 0.16];
      const BANK    = [0.44, 0.65, 0.28];
      const RIVER   = [0.30, 0.42, 0.34];   // Santerno: muted green-brown, not a blue pool
      const GRAVEL  = [0.80, 0.72, 0.50];
      const RED     = [0.82, 0.16, 0.14];
      const WHITE   = [0.92, 0.92, 0.90];
      const STONE   = [0.74, 0.70, 0.60];
      const STONE2  = [0.80, 0.74, 0.62];
      const TERRA   = [0.66, 0.34, 0.22];
      const CONC    = [0.62, 0.63, 0.66];
      const PITWALL = [0.86, 0.86, 0.84];
      const TERRA2  = [0.78, 0.58, 0.42];
      const STONE3  = [0.88, 0.82, 0.72];
      const CROWD_A = [0.62, 0.34, 0.30];
      const CROWD_B = [0.30, 0.40, 0.66];
      const CROWD_C = [0.70, 0.62, 0.30];
      const WIN_LIT  = [0.94, 0.82, 0.48];
      const LAMP_COL = [0.88, 0.78, 0.50];

      let cx = 0, cz = 0;
      for (let i = 0; i < n; i++) { cx += px[i]; cz += pz[i]; }
      cx /= n; cz /= n;
      let rad = 0;
      for (let i = 0; i < n; i++) rad = Math.max(rad, Math.hypot(px[i] - cx, pz[i] - cz));

      // Near low wooded hills (12 peaks — was 18)
      for (let i = 0; i < 12; i++) {
        const a = i / 12 * 6.2832, h = hash(i * 7 + 230);
        mountain(cx + Math.cos(a) * (rad + 230), cz + Math.sin(a) * (rad + 230), pyMin,
                 140 + h * 80, 38 + h * 28,
                 { seg: 6, seed: i * 13 + 230, snowline: 2,
                   forest: [0.13, 0.32, 0.16], rock: [0.30, 0.40, 0.26], col: [0.18, 0.36, 0.20] });
      }
      // Far hazed wooded ridges (8 peaks — was 14)
      for (let i = 0; i < 8; i++) {
        const a = (i + 0.4) / 8 * 6.2832, h = hash(i * 11 + 540);
        mountain(cx + Math.cos(a) * (rad + 540), cz + Math.sin(a) * (rad + 540), pyMin,
                 280 + h * 80, 78 + h * 50,
                 { seg: 6, seed: i * 17 + 540, snowline: 2,
                   forest: [0.20, 0.42, 0.22], rock: [0.40, 0.48, 0.40], col: [0.24, 0.42, 0.26] });
      }

      // Emilia parkland: deciduous-heavy mid-lap; riverbank poplars on +1 pit run.

      {
        const VINE     = [0.26, 0.36, 0.19];
        const VINE_DRY = [0.32, 0.40, 0.22];
        const SOIL     = [0.44, 0.34, 0.24];
        const POST     = [0.52, 0.44, 0.32];
        for (const [sf, side, gap, rows, len, ang] of [
          [0.235, -1, 104, 9, 74, 0.10],
          [0.300, -1, 138, 7, 60, -0.08],
          [0.415,  1,  96, 8, 66, 0.06],
          [0.470,  1, 132, 6, 52, -0.05],
          [0.600, -1, 112, 8, 70, 0.09],
          [0.665, -1, 148, 6, 56, -0.07],
        ]) {
          const kk = K(sf);
          const a0 = anchor(kk, side, gap);
          if (onTrack(a0.c[0], a0.c[2], 30)) continue;
          const b = [a0.r, a0.u, a0.t];
          for (let r = 0; r < rows; r++) {
            const a = anchor(kk + Math.round(r * ang * 10), side, gap + r * 6.5);
            if (onTrack(a.c[0], a.c[2], 24)) continue;
            const hv = hash(kk * 17 + r * 29);
            const rowLen = len * (0.86 + hv * 0.22);
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
      }

      forestEdge(0.88, 1.00, -1, 12, { density: 0.42, hMin: 10, hMax: 16,
        col: [0.08, 0.24, 0.12], col2: [0.16, 0.40, 0.18], pineFrac: 0.25 });
      forestEdge(0.88, 1.00,  1, 12, { density: 0.48, hMin: 10, hMax: 16,
        col: [0.14, 0.36, 0.16], col2: [0.20, 0.44, 0.20], pineFrac: 0.05 });

      // Tamburello chicane through Villeneuve — riverside deciduous hug continues +1
      forestEdge(0.00, 0.14, -1, 12, { density: 0.42, hMin: 10, hMax: 16,
        col: [0.08, 0.24, 0.12], col2: [0.16, 0.40, 0.18], pineFrac: 0.20 });
      forestEdge(0.00, 0.14,  1, 12, { density: 0.50, hMin: 10, hMax: 16,
        col: [0.12, 0.34, 0.15], col2: [0.18, 0.42, 0.19], pineFrac: 0.05 });

      // Villeneuve to Tosa — river fades; still mostly broadleaf
      forestEdge(0.14, 0.17, -1, 12, { density: 0.36, hMin: 9, hMax: 14,
        col: WOODS, col2: WOODS2, pineFrac: 0.15 });
      forestEdge(0.17, 0.22, -1, 12, { density: 0.36, hMin: 9, hMax: 14,
        col: WOODS, col2: WOODS2, pineFrac: 0.15 });
      forestEdge(0.22, 0.30, -1, 12, { density: 0.36, hMin: 9, hMax: 14,
        col: WOODS, col2: WOODS2, pineFrac: 0.15 });
      forestEdge(0.14, 0.30,  1, 20, { density: 0.38, hMin: 9, hMax: 14,
        col: [0.12, 0.32, 0.15], col2: [0.18, 0.40, 0.18], pineFrac: 0.08 });

      // Tosa → Piratella climb — dark deciduous tunnel (Parco Acque Minerali character)
      forestEdge(0.30, 0.42, -1, 5, { density: 0.48, hMin: 12, hMax: 18,
        col: [0.07, 0.20, 0.10], col2: [0.12, 0.28, 0.13], pineFrac: 0.0 });
      forestEdge(0.30, 0.42,  1, 5, { density: 0.44, hMin: 11, hMax: 17,
        col: [0.08, 0.22, 0.11], col2: [0.13, 0.30, 0.14], pineFrac: 0.0 });

      // Acque Minerali valley — enclosed dark broadleaf hollow (no pine wall)
      forestEdge(0.42, 0.58, -1, 5, { density: 0.50, hMin: 12, hMax: 18,
        col: [0.06, 0.18, 0.09], col2: [0.11, 0.26, 0.12], pineFrac: 0.0 });
      forestEdge(0.42, 0.58,  1, 5, { density: 0.52, hMin: 13, hMax: 19,
        col: [0.05, 0.16, 0.08], col2: [0.10, 0.24, 0.11], pineFrac: 0.0 });

      // Variante Alta crest — tighter wooded walls into the chicane
      forestEdge(0.58, 0.74, -1, 4, { density: 0.48, hMin: 11, hMax: 17,
        col: [0.08, 0.22, 0.11], col2: CANOPY2, pineFrac: 0.12 });
      forestEdge(0.58, 0.74,  1, 4, { density: 0.44, hMin: 10, hMax: 16,
        col: WOODS, col2: CANOPY2, pineFrac: 0.10 });

      // Rivazza descent — parkland into amphitheatre
      forestEdge(0.74, 0.88, -1, 4, { density: 0.38, hMin: 10, hMax: 15,
        col: WOODS, col2: WOODS2, pineFrac: 0.15 });
      forestEdge(0.74, 0.88,  1, 4, { density: 0.34, hMin: 9, hMax: 14,
        col: WOODS, col2: WOODS2, pineFrac: 0.12 });

      // Overlapping water + bank strips so the river reads as one ribbon at race speed.
      const SANTERNO = [
        [0.94, 20, [52, 130]], [0.97, 20, [55, 140]], [0.00, 20, [58, 160]],
        [0.03, 20, [56, 150]], [0.06, 20, [54, 145]], [0.09, 20, [52, 140]],
        [0.12, 19, [50, 130]], [0.15, 18, [48, 120]], [0.18, 18, [46, 100]],
      ];
      SANTERNO.forEach(([s, gap, sz], i) =>
        riverSurface(`santerno-water-${i}`, s, 1, gap, sz, RIVER, { required: true }));
      const SANTERNO_BANK = [
        // bank-3 is 40 m, not ~120 like its siblings: the Acque Minerali
        // return leg crosses the river valley ~0.3 m above this bank at
        // b ≈ −43/+28 m along it, and a longer patch reaches under that road
        // — the emitted-footprint guard (rightly) suppressed the whole group.
        [0.95, 9,  [12, 120]], [0.00, 9,  [12, 140]], [0.04, 9,  [12, 130]],
        [0.08, 10, [12, 40]], [0.12, 10, [11, 110]], [0.16, 10, [11, 90]],
      ];
      SANTERNO_BANK.forEach(([s, gap, sz], i) =>
        terrainPatch(`santerno-bank-${i}`, s, 1, gap, sz, BANK));

      backdrop(K(0.34), -1, 72, [40, 28, 58], [0.12, 0.28, 0.14]);
      backdrop(K(0.36), -1, 90, [36, 34, 54], [0.10, 0.24, 0.12]);
      backdrop(K(0.35),  1, 68, [38, 26, 56], [0.13, 0.30, 0.15]);
      backdrop(K(0.38), -1, 58, [32, 22, 48], [0.11, 0.26, 0.13]);

      terrainPatch("acque-mist-0", 0.45,  1, 14, [48, 80], [0.72, 0.78, 0.74]);
      terrainPatch("acque-mist-1", 0.48,  1, 16, [46, 78], [0.74, 0.80, 0.76]);
      terrainPatch("acque-mist-2", 0.51,  1, 15, [44, 72], [0.70, 0.76, 0.72]);
      terrainPatch("acque-mist-3", 0.54,  1, 14, [42, 65], [0.73, 0.79, 0.75]);
      terrainPatch("acque-mist-4", 0.48, -1, 12, [36, 55], [0.71, 0.77, 0.73]);
      // Extra dark canopy walls for the enclosed park-in-the-loop read
      backdrop(K(0.46),  1, 42, [34, 20, 50], [0.08, 0.20, 0.10]);
      backdrop(K(0.50),  1, 48, [36, 24, 52], [0.07, 0.18, 0.09]);
      backdrop(K(0.54), -1, 40, [32, 18, 48], [0.09, 0.22, 0.11]);

      backdrop(K(0.60), -1,  70, [44, 26, 58], [0.12, 0.28, 0.14]);
      backdrop(K(0.63), -1,  88, [48, 32, 62], [0.10, 0.24, 0.12]);
      backdrop(K(0.66), -1, 100, [46, 34, 60], [0.11, 0.26, 0.13]);
      backdrop(K(0.69), -1, 118, [42, 30, 56], [0.09, 0.22, 0.11]);
      backdrop(K(0.64),  1,  78, [38, 24, 52], [0.12, 0.28, 0.14]);
      // Classic Imola campanile (bell tower) visible above treeline
      {
        const ac = anchor(K(0.64), -1, 120);
        const tH = 30;
        addCyl(out, ac.c, 2.0, tH, STONE2, 8, [ac.r, ac.u, ac.t]);
        addBox(out, vadd(ac.c, ac.u, tH), [5.0, 2.4, 5.0], STONE, [ac.r, ac.u, ac.t]);
        seat.cone(out, vadd(ac.c, ac.u, tH + 1.2), 2.5, 7, [0.44, 0.34, 0.28], 7, [ac.r, ac.u, ac.t]);
        for (let qi = 0; qi < 2; qi++) {
          const ofs = (qi === 0) ? ac.r : ac.t;
          for (const sg of [-1, 1]) {
            addBox(out, vadd(vadd(ac.c, ac.u, tH + 0.9), ofs, sg * 2.0), [0.6, 1.2, 0.25], WIN_LIT, [ac.r, ac.u, ac.t]);
          }
        }
      }

      // The pit complex, as SIX blocks behind the pit wall rather than one
      // 130 m slab at gap 1. The single call emitted NOTHING — verified by
      // vertex count, which is identical with the line deleted — because it
      // failed both of building()'s guards at once:
      //   * gap 1 with w 16 puts the footprint centre at 1 + 16/2 = 9 and its
      //     padded half-width at 9.2, so the inner face crossed the road and
      //     rejBox suppressed it;
      //   * gap 1..17 also runs straight through the pit wall (gap 7) and the
      //     main grandstand (gap 10) already standing on this side, so
      //     massBlocked dropped it independently.
      // Neither guard is wrong — a pit building does not belong in front of
      // its own pit wall. Re-sited behind both, at a length each block clears.
      // This is why the roofline wordmark below floated: there was never any
      // roof under it.
      for (let i = 0; i < 6; i++) {
        building(K(0.9825 + i * 0.0070), -1, 20, 16, 11, 20,
                 { kind: "slab", wall: [0.58, 0.60, 0.63], window: WIN_LIT, floor: 5, lit: true });
      }
      prop(K(0.01), -1, 7, [2.5, 1.6, 120], RED);
      grandstand(0.965, -1, 10, 90, [0.55, 0.58, 0.62], RED);
      grandstand(0.02,  1, 22, 80, [0.52, 0.55, 0.60], [0.78, 0.30, 0.22]);
      grandstand(0.93, -1, 10, 70, [0.55, 0.58, 0.62], RED);

      terrainPatch("tamburello-lawn", 0.05, -1, 12, [18, 20], BANK);
      place(K(0.05), -1, 14, [2, 3.2, 2], [0.45, 0.40, 0.30]);
      place(K(0.05), -1, 2, [0.4, 0.3, 7], RED);
      place(K(0.06), -1, 2, [0.4, 0.3, 7], WHITE);
      {
        const am = anchor(K(0.07), -1, 8);
        addBox(out, vadd(am.c, am.u, 1.25), [3, 2.5, 0.4], [0.90, 0.90, 0.88], [am.r, am.u, am.t]);
      }

      terrainPatch("villeneuve-gravel", 0.12, -1, 5, [24, 30], GRAVEL);
      place(K(0.12), -1, 2, [0.4, 0.3, 7], RED);
      place(K(0.13), -1, 2, [0.4, 0.3, 7], WHITE);
      spectatorHill(0.113, 0.138, -1, 20, { rows: 3, rise: 1.1, depth: 2.0,
        density: 0.5, grass: BANK, crowd: [CROWD_A, CROWD_B, CROWD_C, WHITE] });

      grandstand(0.28, -1, 12, 60, [0.52, 0.55, 0.60], RED);
      grandstand(0.31, -1, 12, 50, [0.54, 0.57, 0.61], [0.20, 0.42, 0.72]);
      terrainPatch("tosa-gravel", 0.28, -1, 6, [34, 40], GRAVEL);

      for (const side of [-1, 1]) {
        place(K(0.645), side, 2.2, [1.0, 1.35, 9], RED);
        place(K(0.655), side, 2.2, [1.0, 1.35, 9], WHITE);
        place(K(0.665), side, 2.2, [1.0, 1.40, 10], RED);
        place(K(0.675), side, 2.2, [1.0, 1.40, 10], WHITE);
        place(K(0.685), side, 2.2, [0.95, 1.25, 8], RED);
      }
      bush(K(0.66), -1, 10, BANK);
      bush(K(0.66),  1, 12, [0.16, 0.36, 0.18]);
      bush(K(0.64), -1, 8, [0.14, 0.32, 0.15]);
      bush(K(0.68),  1, 9, [0.15, 0.34, 0.16]);

      grandstand(0.80, -1, 12, 55, [0.52, 0.55, 0.60], RED);
      terrainPatch("rivazza-gravel-0", 0.79, -1, 6, [32, 55], GRAVEL);
      terrainPatch("rivazza-gravel-1", 0.81, -1, 7, [34, 58], GRAVEL);
      terrainPatch("rivazza-bank-0", 0.80, -1, 18, [40, 62], BANK);
      terrainPatch("rivazza-bank-1", 0.83, -1, 22, [38, 58], BANK);
      terrainPatch("rivazza-bank-2", 0.82,  1, 16, [28, 40], BANK);

      const TOWN_POS = [
        [0.60, -1, 85,  14, 18, 12, "flat",    STONE3],
        [0.63, -1, 92,  12, 22, 20, "setback", TERRA2],
        [0.66, -1, 100, 16, 15, 22, "flat",    CONC],
        [0.70, -1, 88,  13, 25, 10, "taper",   STONE2],
        [0.74, -1, 95,  15, 20, 17, "setback", TERRA2],
      ];
      for (const [s, side, dist, bw, bh, bd, arch, wall] of TOWN_POS) {
        building(K(s), side, dist, bw, bh, bd, { wall, window: WIN_LIT, floor: 3, lit: true, arch });
      }

      place(K(0.92), 1, 2, [0.4, 0.3, 7], RED);
      place(K(0.93), 1, 2, [0.4, 0.3, 7], WHITE);

      every(110, (k) => {
        marshalPost(k, hash(k * 37) < 0.5 ? -1 : 1, 5);
      });

      {
        const a = anchor(K(0.00), -1, 12);
        addBox(out, vadd(a.c, a.u, 12), [18, 0.7, 120], [0.66, 0.68, 0.70], [a.r, a.u, a.t]);
      }

      gantry(0.00, 7.5, [0.14, 0.14, 0.17]);
      gantry(0.965, 7.0, [0.18, 0.18, 0.20]);

      const CRIMSON = [0.72, 0.10, 0.11];
      const wordmark = (a, y, len, blockH, cols) => {
        const b = [a.r, a.u, a.t];
        out._mat = MAT.METAL;
        addBox(out, vadd(a.c, a.u, y), [0.5, blockH, len], CRIMSON, b);
        out._mat = 0;
        // Two words of unequal length, gapped — the shape of the real name.
        let t = -len / 2 + 2.5;
        for (let i = 0; t < len / 2 - 2.5; i++) {
          const w = 0.9 + (i % 4) * 0.55;
          addBox(out, vadd(vadd(a.c, a.t, t + w / 2), a.u, y),
                 [0.18, blockH * 0.52, w], cols, b);
          t += w + ((i % 7 === 6) ? 2.6 : 0.75);   // wider break = word break
        }
      };
      wordmark(anchor(K(0.005), -1, 19.5), 11.3, 88, 2.6, [0.95, 0.94, 0.90]);

      // Paddock gate portal — two crimson piers carrying the same wordmark, set
      // well behind the pit block so the footprint never reaches the road.
      {
        const g = anchor(K(0.928), -1, 34), gb = [g.r, g.u, g.t];
        modelGroup("imola-paddock-gate", {
          center: vadd(g.c, g.u, 5.5), size: [4, 12, 26], basis: gb,
        }, (stage) => {
          stage._mat = MAT.CONCRETE;
          for (const sg of [-1, 1])
            addBox(stage, vadd(vadd(g.c, g.t, sg * 10), g.u, 4.6),
                   [2.2, 9.2, 2.2], STONE3, gb);
          stage._mat = MAT.METAL;
          addBox(stage, vadd(g.c, g.u, 9.9), [1.6, 2.4, 22], CRIMSON, gb);
          stage._mat = 0;
          for (let i = 0; i < 11; i++)
            addBox(stage, vadd(vadd(g.c, g.t, (i - 5) * 1.7), g.u, 9.9),
                   [0.2, 1.2, 0.75 + (i % 3) * 0.4], [0.95, 0.94, 0.90], gb);
        });
      }

      building(K(0.97), -1, 18, 14, 7, 90, { kind: "hall", wall: PITWALL, window: WIN_LIT, floor: 4, lit: true });
      building(K(0.90), -1, 20, 22, 9, 40, { kind: "chevron", wall: [0.66, 0.67, 0.70], window: WIN_LIT, floor: 4, lit: true });
      building(K(0.94), -1, 46, 30, 12, 34, { kind: "podium", wall: STONE, window: WIN_LIT, floor: 4, lit: true });
      {
        const aA = anchor(K(0.92), -1, 56);
        addCyl(out, aA.c, 2.0, 13, [0.60, 0.56, 0.48], 8, [aA.r, aA.u, aA.t]);
        const aB = anchor(K(0.92), -1, 63);
        addCyl(out, aB.c, 1.6, 11, [0.78, 0.74, 0.60], 8, [aB.r, aB.u, aB.t]);
      }
      (function raceControlTower() {
        const rcSide = -1;
        const a = anchor(K(0.99), rcSide, 16);
        const b = [a.r, a.u, a.t], base = a.c;
        const floors = 7, floorH = 3.85, shaftH = floors * floorH; // ~27 m
        const w = 9, d = 9;
        modelGroup("imola-race-control-tower", {
          center: vadd(base, a.u, 17), size: [13, 34, 13], basis: b,
        }, (stage) => {
          for (let f = 0; f < floors; f++) {
            const y0 = f * floorH;
            stage._mat = MAT.CONCRETE;
            addBox(stage, vadd(base, a.u, y0 + floorH * 0.5), [w, floorH - 0.5, d],
                   f % 2 ? [0.72, 0.74, 0.77] : [0.66, 0.68, 0.72], b);
            stage._mat = MAT.GLASS;
            addBox(stage, vadd(vadd(base, a.u, y0 + floorH * 0.62), a.r, rcSide * (w / 2 + 0.02)),
                   [0.06, floorH * 0.42, d * 0.86],
                   [0.32, 0.42, 0.54], b);
          }
          stage._mat = MAT.CONCRETE;
          const terraceY = shaftH;
          addBox(stage, vadd(base, a.u, terraceY + 0.5), [w + 2.4, 1.0, d + 2.4], [0.70, 0.72, 0.75], b);
          stage._mat = MAT.GLASS;
          addBox(stage, vadd(vadd(base, a.u, terraceY + 1.9), a.r, rcSide * (w / 2 + 1.1)),
                 [0.08, 2.2, d + 2.0], [0.34, 0.45, 0.58], b);
          stage._mat = MAT.METAL;
          addBox(stage, vadd(base, a.u, terraceY + 2.95), [w + 2.4, 0.12, d + 2.4], [0.30, 0.30, 0.32], b);
          // Rooftop race-director's cabin + antenna mast.
          stage._mat = MAT.CONCRETE;
          const cabH = 3.4;
          addBox(stage, vadd(base, a.u, terraceY + 3.0 + cabH / 2), [6.2, cabH, 6.2], [0.78, 0.80, 0.82], b);
          stage._mat = MAT.GLASS;
          addBox(stage, vadd(vadd(base, a.u, terraceY + 3.0 + cabH * 0.55), a.r, rcSide * 3.05),
                 [0.06, cabH * 0.55, 5.6], [0.30, 0.38, 0.50], b);
          stage._mat = MAT.METAL;
          addCyl(stage, vadd(base, a.u, terraceY + 3.0 + cabH), 0.16, 6.5, [0.30, 0.30, 0.32], 4, b);
          stage._mat = 0;
        }, { required: true });
      })();
      wall(0.95, 0.06, -1, 2, 1.0, PITWALL, 0.5);

      {
        const at = anchor(K(0.02), -1, 110);
        const r = at.r, u = at.u, t = at.t;
        const baseY = groundYAt(K(0.02), 110);
        const base = [at.c[0], baseY, at.c[2]];
        const footAt = (alongM, outM, rise) => {
          // Sample the ground at the building's OWN XZ. Walking `alongM` down
          // node-0's tangent is not the same as walking the curved centreline,
          // so an index estimate (K(0.02) + alongM/nodeSpacing) reads the
          // hillside tens of metres from where the hut actually lands — and
          // groundYAt's lateral argument is measured from the ROAD EDGE, not
          // from `base`. Resolve both by finding the nearest centreline node.
          const flat = vadd(vadd(base, t, alongM), r, -outM);
          let bk = 0, bd = Infinity;
          for (let k2 = 0; k2 < n; k2++) {
            const dd = (flat[0] - px[k2]) ** 2 + (flat[2] - pz[k2]) ** 2;
            if (dd < bd) { bd = dd; bk = k2; }
          }
          const gy = groundYAt(bk, Math.max(0, Math.sqrt(bd) - hw[bk]));
          const y = Number.isFinite(gy) ? gy : base[1];
          return { p: [flat[0], y + rise, flat[2]], gy: y };
        };
        const plinth = (f, w, d) => foundation(out, {
          center: f.p, size: [w * 1.08, d * 1.08], top: f.p[1],
          basis: [r, u, t], col: STONE, ground: f.gy, embed: 4,
        });
        const put = (alongM, outM, rise, w, h, d, col) => {
          const f = footAt(alongM, outM, rise);
          plinth(f, w, d);
          addBox(out, vadd(f.p, u, h / 2), [w, h, d], col, [r, u, t]);
          seat.prism(out, vadd(f.p, u, h), [w, 2.6, d], TERRA, [r, u, t]);
        };
        for (let i = 0; i < 6; i++) {
          const h2 = hash(i * 17 + 5);
          put(-80 + i * 28, h2 * 22, 3 + h2 * 6, 16 + h2 * 5, 10 + h2 * 6, 14 + h2 * 3, h2 < 0.5 ? STONE : STONE2);
        }
        for (let i = 0; i < 4; i++) {
          const h2 = hash(i * 31 + 9);
          put(-40 + i * 36, 46 + h2 * 30, 12 + h2 * 8, 18 + h2 * 6, 11 + h2 * 5, 16, h2 < 0.5 ? STONE2 : CONC);
        }
        const churchAt = footAt(55, 42, 18);
        const churchFoot = churchAt.p;
        plinth(churchAt, 18, 28);
        addBox(out, vadd(churchFoot, u, 8), [18, 16, 28], STONE2, [r, u, t]);
        // Nave box is CENTRED at +8 with height 16 → its top face is 16.
        seat.prism(out, vadd(churchFoot, u, 16), [18, 5.5, 28], TERRA, [r, u, t]);
        addBox(out, vadd(churchFoot, u, 6), [18, 2.5, 0.4], WIN_LIT, [r, u, t]);
        const towerFoot = vadd(churchFoot, t, 22);
        const campH = 28;
        plinth({ p: towerFoot, gy: churchAt.gy }, 6, 6);
        addCyl(out, towerFoot, 1.8, campH, STONE, 8, [r, u, t]);
        addBox(out, vadd(towerFoot, u, campH), [5.5, 2.2, 5.5], STONE2, [r, u, t]);
        // Belfry cap top = campH + half its 2.2 m height, not campH + 2.2.
        seat.cone(out, vadd(towerFoot, u, campH + 1.1), 2.8, 8, [0.44, 0.34, 0.28], 7, [r, u, t]);
        for (const sg of [-1, 1]) {
          addBox(out, vadd(vadd(towerFoot, u, campH + 0.8), r, sg * 2.2), [0.5, 1.0, 0.3], WIN_LIT, [r, u, t]);
        }
      }

      grandstand(0.99, -1, 11, 60, [0.50, 0.53, 0.58], CROWD_C);
      grandstand(0.05,  1, 20, 70, [0.52, 0.55, 0.60], CROWD_B);
      grandstand(0.07, -1, 16, 56, [0.54, 0.56, 0.60], CROWD_A);
      grandstand(0.27,  1, 16, 44, [0.52, 0.55, 0.60], CROWD_B);
      grandstand(0.51,  1, 16, 60, [0.52, 0.55, 0.60], CROWD_A);
      grandstand(0.54,  1, 18, 46, [0.54, 0.57, 0.61], CROWD_C);
      grandstand(0.82, -1, 14, 64, [0.52, 0.55, 0.60], CROWD_B);

      fence(0.96, 0.10, -1, 4, 4, [0.62, 0.64, 0.66]);
      fence(0.49, 0.56,  1, 4, 4, [0.62, 0.64, 0.66]);
      fence(0.79, 0.86, -1, 4, 4, [0.62, 0.64, 0.66]);
      guardrail(0.00, 0.18, 1, 3, [0.78, 0.78, 0.80]);
      guardrail(0.20, 0.30, -1, 3, [0.78, 0.78, 0.80]);
      guardrail(0.60, 0.70,  1, 3, [0.78, 0.78, 0.80]);
      tyreWall(0.05,  0.075, -1, 4, RED);
      tyreWall(0.115, 0.135, -1, 4, [0.20, 0.40, 0.70]);
      tyreWall(0.27,  0.295, -1, 4, RED);
      tyreWall(0.655, 0.675,  1, 4, [0.20, 0.40, 0.70]);
      tyreWall(0.79,  0.815, -1, 4, RED);
      tyreWall(0.915, 0.93,   1, 4, RED);

      billboard(K(0.05),  1, 18, 14, 5, [0.86, 0.16, 0.14]);
      billboard(K(0.12), -1, 16, 12, 5, [0.20, 0.40, 0.70]);
      billboard(K(0.27),  1, 18, 12, 5, [0.90, 0.80, 0.20]);
      billboard(K(0.51),  1, 20, 14, 5, [0.86, 0.30, 0.20]);
      billboard(K(0.66), -1, 16, 12, 5, [0.20, 0.44, 0.70]);
      billboard(K(0.82), -1, 18, 12, 5, [0.86, 0.16, 0.14]);
      billboard(K(0.95),  1, 16, 12, 5, [0.90, 0.80, 0.20]);

      const HOSPITALITY_POS = [
        [0.944, 34, [0.86, 0.16, 0.14]],
        [0.951, 37, [0.20, 0.40, 0.72]],
        [0.958, 40, [0.90, 0.80, 0.20]],
      ];
      for (const [s, gap, accent] of HOSPITALITY_POS) {
        motorhome(K(s), -1, gap, 18, 6, 14, { wall: PITWALL, window: WIN_LIT, accent });
      }
      {
        const a = anchor(K(0.92), -1, 30);
        addBox(out, vadd(a.c, a.u, 2.2), [16, 4.4, 12], [0.90, 0.90, 0.88], [a.r, a.u, a.t]);
        // Marquee body is CENTRED at 2.2 with height 4.4 → ridge starts at 4.4.
        seat.prism(out, vadd(a.c, a.u, 4.4), [16, 2.8, 12], [0.94, 0.94, 0.92], [a.r, a.u, a.t]);
      }

      along(0.95, 0.10, 18, (k) => {
        const p = anchor(k, -1, 8);
        if (onTrack(p.c[0], p.c[2], 0.5)) return;
        addCyl(out, p.c, 0.12, 8.5, [0.58, 0.60, 0.62], 5, [p.r, p.u, p.t]);
        const head = vadd(p.c, p.u, 8.5);
        addBox(out, head, [0.5, 0.45, 0.5], LAMP_COL, [p.r, p.u, p.t]);
        if (typeof lampPost === "function") lampPost({ pos: head, k, side: -1, kind: "halogen" });
      });
      along(0.30, 0.38, 20, (k) => {
        const p = anchor(k, -1, 7);
        if (onTrack(p.c[0], p.c[2], 0.5)) return;
        addCyl(out, p.c, 0.12, 8.0, [0.58, 0.60, 0.62], 5, [p.r, p.u, p.t]);
        const head = vadd(p.c, p.u, 8.0);
        addBox(out, head, [0.5, 0.45, 0.5], LAMP_COL, [p.r, p.u, p.t]);
        if (typeof lampPost === "function") lampPost({ pos: head, k, side: -1, kind: "halogen" });
      });
      along(0.84, 0.92, 22, (k) => {
        const side = hash(k * 11) < 0.5 ? -1 : 1;
        const p = anchor(k, side, 7);
        if (onTrack(p.c[0], p.c[2], 0.5)) return;
        addCyl(out, p.c, 0.12, 8.0, [0.58, 0.60, 0.62], 5, [p.r, p.u, p.t]);
        const head = vadd(p.c, p.u, 8.0);
        addBox(out, head, [0.5, 0.45, 0.5], LAMP_COL, [p.r, p.u, p.t]);
        if (typeof lampPost === "function") lampPost({ pos: head, k, side, kind: "halogen" });
      });

      const CYP = [0.11, 0.28, 0.15], CYP_D = [0.08, 0.22, 0.12];
      const cyp = (k, side, dist, h, slim) =>
        cypress(k, side, dist, h, hash(k * 7 + side) < 0.5 ? CYP : CYP_D,
                { slim: slim || 0.93 });
      // Sparse cypress punctuation on the wooded slopes (deciduous hollow owns mid-lap).
      for (const [s0, side, gap, cnt] of [[0.32, -1, 24, 3], [0.52, 1, 26, 2], [0.64, -1, 32, 3], [0.82, -1, 20, 3]]) {
        for (let i = 0; i < cnt; i++) cyp(K(s0 + i * 0.010), side, gap + (i % 2) * 3, 13 + hash(i * 5 + s0 * 40) * 6);
      }

      for (let i = 0; i < 14; i++) {
        cyp(K(0.300 + i * 0.0072), -1, 17, 14.5 + hash(i * 3.1) * 3.5, 0.86);
      }
      // Matching short rank flanking the Rivazza exit toward the paddock gate.
      for (let i = 0; i < 8; i++) {
        cyp(K(0.862 + i * 0.0068), -1, 15, 13.5 + hash(i * 5.7 + 2) * 3, 0.86);
      }

      const PINO = [0.16, 0.34, 0.17], PINO_D = [0.12, 0.28, 0.14];
      for (const [s, side, gap, h] of [
        [0.452, -1, 20, 17], [0.470,  1, 22, 19], [0.488, -1, 25, 16],
        [0.506,  1, 24, 18], [0.524, -1, 21, 20], [0.542,  1, 27, 17],
        [0.372, -1, 26, 18], [0.398,  1, 24, 16],
      ]) stonePine(K(s), side, gap, h, hash(s * 71) < 0.5 ? PINO : PINO_D,
                   { lean: 0.35, spread: 1.15 });

      // ── Pollarded plane avenue (platani) along the old-town approach. An
      //    Italian provincial road is lined with these, cut back to a disc
      //    every winter — a flat cylinder crown, not a cone, which is exactly
      //    why the tree()/pine() pair could never make this street.
      const PLAT = [0.20, 0.38, 0.19];
      for (let i = 0; i < 9; i++) {
        plane(K(0.596 + i * 0.0125), -1, 44, 13 + (i % 3) * 1.5, PLAT,
              { stages: 2, spread: 0.85 });
      }

      (function sennaMemorial() {
        const a = anchor(K(0.075), -1, 20);
        const b = [a.r, a.u, a.t], base = a.c;
        const bronze = [0.34, 0.30, 0.22], stone = [0.80, 0.78, 0.72];
        modelGroup("senna-memorial", {
          center: vadd(base, a.u, 5), size: [16, 11, 16], basis: b,
        }, (stage) => {
          // Lawn dais the memorial sits on.
          stage._mat = MAT.GRASS;
          addBox(stage, vadd(base, a.u, 0.15), [12, 0.3, 12], [0.30, 0.48, 0.24], b);
          // Stepped stone plinth.
          stage._mat = MAT.STONE;
          addBox(stage, vadd(base, a.u, 0.75), [4.5, 1.2, 4.5], stone, b);
          addBox(stage, vadd(base, a.u, 1.7),  [3.0, 0.9, 3.0], [0.86, 0.83, 0.76], b);
          // Abstract seated bronze figure (Senna, pensive) — legs, torso, head.
          stage._mat = MAT.METAL;
          addBox(stage, vadd(base, a.u, 2.5),  [1.8, 0.6, 1.4], bronze, b);
          addBox(stage, vadd(base, a.u, 3.3),  [1.2, 1.4, 1.0], bronze, b);
          addCyl(stage, vadd(base, a.u, 4.4),  0.42, 0.7, bronze, 7, b);
          // Three flag poles — Brazilian tricolour (green / yellow / blue).
          const flagCols = [[0.10, 0.55, 0.24], [0.94, 0.82, 0.16], [0.14, 0.30, 0.62]];
          for (let i = 0; i < 3; i++) {
            const p = vadd(vadd(base, a.t, (i - 1) * 3.0), a.r, -4);
            stage._mat = MAT.METAL;
            addCyl(stage, p, 0.12, 9, [0.85, 0.85, 0.87], 6, b);
            stage._mat = MAT.FABRIC;
            addBox(stage, vadd(vadd(p, a.u, 7.6), a.t, 1.1), [0.15, 1.3, 2.0], flagCols[i], b);
          }
          stage._mat = 0;
          // Semicircle of floral tributes at the foot.
          for (let i = 0; i < 7; i++) {
            const ang = (i / 6 - 0.5) * Math.PI;
            const p = vadd(vadd(base, a.t, Math.sin(ang) * 4), a.r, -Math.cos(ang) * 4 + 3);
            addBox(stage, vadd(p, a.u, 0.5), [0.7, 0.4, 0.7],
                   [[0.86, 0.20, 0.18], WHITE, [0.90, 0.80, 0.24]][i % 3], b);
          }
        }, { required: true });
      })();

      (function santernoBridge() {
        const a = anchor(K(0.10), 1, 26);
        const b = [a.r, a.u, a.t], base = a.c;
        const stone = [0.72, 0.68, 0.60];
        modelGroup("santerno-footbridge", {
          center: vadd(base, a.u, 3.5), size: [7, 7, 26], basis: b,
        }, (stage) => {
          stage._mat = MAT.STONE;
          // Two piers straddling the water.
          for (const sg of [-1, 1]) {
            addBox(stage, vadd(vadd(base, a.t, sg * 9), a.u, 2), [4, 4, 3], stone, b);
          }
          // Arched deck (triangular prism gives a humped span).
          addPrism(stage, vadd(base, a.u, 4.4), [5, 1.6, 22], [0.78, 0.74, 0.66], b);
          addBox(stage, vadd(base, a.u, 4.2), [5, 0.6, 22], stone, b);
          // Parapet walls both edges.
          for (const sg of [-1, 1])
            addBox(stage, vadd(vadd(base, a.r, sg * 2.2), a.u, 5.4), [0.5, 1.0, 22], [0.80, 0.76, 0.68], b);
          stage._mat = 0;
        }, { required: true });
      })();

      const IM_SHELL_A = [0.53, 0.55, 0.59], IM_SHELL_B = [0.48, 0.50, 0.55];
      const IM_CROWD = [[0.82, 0.24, 0.20], [0.86, 0.84, 0.80], [0.24, 0.42, 0.70], [0.72, 0.62, 0.30]];
      // 60 m of a 4.9 km lap ≈ 0.0122 of a lap.
      tieredBowl(0.279, 0.291, -1, 16, {   // Tosa hairpin bank — a real built stand, keeps its shell
        tiers: 4, tierDepth: 5.4, base: 2.8, rise: 3.1, step: 12,
        shell: [IM_SHELL_A, IM_SHELL_B], crowd: IM_CROWD,
        fascia: [0.92, 0.90, 0.82], roof: true, roofCol: [0.20, 0.20, 0.24],
        density: 0.55,
      });

      terrace(0.826, 0.851, -1, 13, {
        rows: 6, rise: 1.45, depth: 2.5, step: 9, density: 0.6,
        conc: [0.72, 0.70, 0.65], concAlt: [0.63, 0.61, 0.57],
        crowd: IM_CROWD, cut: true, cutCol: [0.50, 0.33, 0.21],
      });

      spectatorHill(0.788, 0.802, -1, 14, { rows: 5, rise: 1.3, depth: 2.2,
        density: 0.6, grass: BANK, crowd: [CROWD_A, CROWD_B, CROWD_C, WHITE] });
      spectatorHill(0.830, 0.840, -1, 18, { rows: 4, rise: 1.2, depth: 2.0,
        density: 0.55, grass: BANK, crowd: [CROWD_A, CROWD_B, CROWD_C, WHITE] });
      spectatorHill(0.505, 0.515, 1, 22, { rows: 3, rise: 1.1, depth: 1.8,
        density: 0.45, grass: BANK, crowd: [CROWD_A, CROWD_B, CROWD_C, WHITE] }); // Acque Minerali — kept lighter, the hollow is the hero

      const PARK_GROVES = [
        [0.345, -1, 22, 16], [0.372,  1, 25, 14],
        [0.438, -1, 24, 17], [0.468,  1, 28, 18],
        [0.505, -1, 26, 16], [0.538,  1, 30, 17],
      ];
      PARK_GROVES.forEach(([s, side, dist, h], i) => {
        tree(K(s), side, dist, h + hash(i * 19 + 71) * 3,
             i % 2 ? [0.12, 0.32, 0.15] : [0.09, 0.27, 0.12]);
        bush(K(s + 0.004), side, dist - 5,
             i % 2 ? [0.18, 0.40, 0.18] : [0.14, 0.35, 0.16]);
        bush(K(s - 0.004), side, dist + 4, [0.11, 0.30, 0.13]);
      });

      (function historicRaceOffice() {
        const a = anchor(K(0.905), -1, 40);
        const b = [a.r, a.u, a.t], base = a.c;
        modelGroup("imola-historic-race-office", {
          center: vadd(base, a.u, 8), size: [34, 18, 38], basis: b,
        }, (stage) => {
          stage._mat = MAT.STONE;
          addBox(stage, vadd(base, a.u, 3.5), [26, 7, 30], [0.88, 0.82, 0.70], b);
          // Body box is CENTRED at 3.5 with height 7 → top face at 7.
          seat.prism(stage, vadd(base, a.u, 7), [28, 3.2, 32], TERRA, b);
          // Shallow track-facing arcade: five pale piers and dark recessed bays.
          for (let i = 0; i < 5; i++) {
            const z = (i - 2) * 5.4;
            addBox(stage, vadd(vadd(vadd(base, a.r, -12.6), a.t, z), a.u, 2.3),
                   [0.7, 4.6, 0.8], STONE3, b);
            stage._mat = MAT.METAL;
            addBox(stage, vadd(vadd(vadd(base, a.r, -13.05), a.t, z + 2.2), a.u, 4.6),
                   [0.25, 1.4, 3.0], [0.22, 0.30, 0.32], b);
            stage._mat = MAT.STONE;
          }
          // Compact timing turret, intentionally below the nearby tree crowns.
          const turret = vadd(vadd(base, a.r, 7), a.t, -9);
          addBox(stage, vadd(turret, a.u, 6.5), [7, 13, 8], STONE2, b);
          // Turret box is CENTRED at 6.5 with height 13 → top face at 13.
          seat.prism(stage, vadd(turret, a.u, 13), [8, 2.4, 9], TERRA, b);
          stage._mat = MAT.METAL;
          addBox(stage, vadd(vadd(turret, a.r, -3.6), a.u, 9.5),
                 [0.25, 2.2, 5.4], WIN_LIT, b);
          stage._mat = 0;
        }, { required: true });
      })();

      const PIRATELLA_VILLAS = [
        [0.325, -1, 58, 13, 9, 14],
        [0.347, -1, 66, 15, 11, 16],
        [0.369, -1, 62, 12, 8, 13],
        [0.392, -1, 72, 16, 12, 17],
        [0.414, -1, 64, 13, 9, 15],
      ];
      PIRATELLA_VILLAS.forEach(([s, side, gap, w, h, d], i) => {
        building(K(s), side, gap, w, h, d, {
          wall: i % 3 === 0 ? STONE3 : (i % 3 === 1 ? TERRA2 : STONE2),
          window: WIN_LIT, floor: 3, roof: true, lit: true,
        });
        cyp(K(s + 0.005), side, gap + w + 5, 12 + (i % 3) * 2);
      });

      (function tamburelloTributeWall() {
        const a = anchor(K(0.082), -1, 32);
        const b = [a.r, a.u, a.t], base = a.c;
        modelGroup("imola-tamburello-tribute-wall", {
          center: vadd(base, a.u, 4.5), size: [10, 10, 24], basis: b,
        }, (stage) => {
          stage._mat = MAT.STONE;
          addBox(stage, vadd(base, a.u, 1.2), [1.2, 2.4, 18], [0.76, 0.74, 0.69], b);
          stage._mat = MAT.METAL;
          for (let i = 0; i < 5; i++) {
            addBox(stage, vadd(vadd(vadd(base, a.r, -0.66), a.t, (i - 2) * 3.2), a.u, 1.35),
                   [0.12, 0.9, 2.1], [0.30, 0.28, 0.24], b);
          }
          const tri = [[0.08, 0.48, 0.22], WHITE, [0.82, 0.14, 0.13]];
          for (let i = 0; i < 3; i++) {
            const p = vadd(vadd(base, a.r, 3.4), a.t, (i - 1) * 5.2);
            addCyl(stage, p, 0.10, 8, [0.76, 0.77, 0.79], 6, b);
            stage._mat = MAT.FABRIC;
            addBox(stage, vadd(vadd(p, a.u, 6.7), a.t, 0.9),
                   [0.14, 1.2, 1.8], tri[i], b);
            stage._mat = MAT.METAL;
          }
          stage._mat = 0;
        }, { required: true });
      })();

      guardrail(0.015, 0.145, -1, 2.8, [0.76, 0.77, 0.79]);
      fence(0.015, 0.145, -1, 6.8, 4.2, [0.58, 0.61, 0.62]);
      guardrail(0.43, 0.56, 1, 2.8, [0.74, 0.75, 0.77]);
      fence(0.43, 0.49, 1, 6.5, 4.0, [0.56, 0.59, 0.60]);
      guardrail(0.775, 0.88, -1, 2.8, [0.76, 0.77, 0.79]);
    },
  }
  );
})();
