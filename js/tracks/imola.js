/* Apex 26 — IMOLA circuit definition (data only).
   Registered on the global TrackDefs list; consumed by the js/tracks.js engine
   (palette resolved there from `night`, geometry from js/circuits.js or `segs`). */
(function () {
  "use strict";
  (window.TrackDefs = window.TrackDefs || []).push(
  {
    id: "imola",
    reverse: false, // direction switched to real-world CW/CCW (was auto-audit reverse:true)
    startFrac: 0.4950, // GPS-derived (OpenF1 2025, conf=0.383)
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
      { kinds: ["foliage", "lamps", "floodlights"], s0: 0, s1: 1 },
    ],
    pal: { zenith: [0.24, 0.44, 0.74], horizon: [0.80, 0.72, 0.56], grass: [0.24, 0.46, 0.16], runoff: [0.44, 0.42, 0.36], sunDir: [0.7874615506676528, 0.5468482990747588, 0.2843611155188746], sun: [1, 0.9, 0.65], sunColor: [1, 0.88, 0.62] },
    segs: [
      { t: 0, l: 450 }, { t: 90, l: 100 }, { t: -60, l: 90 }, { t: 0, l: 300 }, { t: 70, l: 90 }, { t: -60, l: 80 },
      { t: -80, l: 100 }, { t: 0, l: 400 }, { t: -80, l: 100 }, { t: 60, l: 80 }, { t: 0, l: 180 }, { t: -80, l: 90 },
      { t: 100, l: 110 },
    ],
    // Elevations are source-trace fractions. These map to racing fractions
    // 0.34 Piratella, 0.48 Acque Minerali, 0.64 Variante Alta and 0.80 Rivazza.
    elevations: [
      { s: 0.835, halfM: 380, rise: 14 },
      { s: 0.975, halfM: 260, rise: -10 },
      { s: 0.135, halfM: 360, rise: 16 },
      { s: 0.295, halfM: 320, rise: -14 },
    ],
    scenery: function (api) {
      const { out, MAT, n, px, pz, pyMin, hash, every, place, prop, backdrop,
              groundPatch, waterSurface, modelGroup,
              groundYAt, onTrack, addBox, addCyl, addCone, addPrism, addFrustum, vadd, anchor,
              along, mountain, tree, pine, hedge, bush,
              grandstand, building, motorhome, tower, billboard, marshalPost, gantry,
              fence, guardrail, tyreWall, wall,
              forestEdge } = api;
      const K = (s) => Math.round(s * n) % n;
      const terrainPatch = (id, s, side, gap, size, col, opts) =>
        groundPatch(K(s), side, gap, [size[0], 0.18, size[1]], col,
          Object.assign({ id, samples: Math.max(3, Math.ceil(size[0] / 10)) }, opts));
      const riverSurface = (id, s, side, gap, size, col, opts) =>
        waterSurface(K(s), side, gap, [size[0], 0.16, size[1]], col,
          Object.assign({ id }, opts));

      // ---- Palette (Imola riverside parkland: rich greens, warm Italian earth, Santerno blues) ----
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

      // ---- Encircling WOODED IMOLA HILLS — thinned to free verts for riverside / hollow ----
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

      // ---- SECTION-BY-SECTION TREELINE (no global full-circuit passes) ----
      // Emilia parkland: deciduous-heavy mid-lap; riverbank poplars on +1 pit run.

      // Pit straight + Tamburello approach (wraps around 0) — left standside mixed;
      // right riverside = willow/poplar (no pine wall).
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

      // ---- TOP-1: Continuous Santerno riverside (pit → Tamburello → Villeneuve, +1) ----
      // Overlapping water + bank strips so the river reads as one ribbon at race speed.
      const SANTERNO = [
        [0.94, 20, [52, 130]], [0.97, 20, [55, 140]], [0.00, 20, [58, 160]],
        [0.03, 20, [56, 150]], [0.06, 20, [54, 145]], [0.09, 20, [52, 140]],
        [0.12, 19, [50, 130]], [0.15, 18, [48, 120]], [0.18, 18, [46, 100]],
      ];
      SANTERNO.forEach(([s, gap, sz], i) =>
        riverSurface(`santerno-water-${i}`, s, 1, gap, sz, RIVER, { required: true }));
      const SANTERNO_BANK = [
        [0.95, 9,  [12, 120]], [0.00, 9,  [12, 140]], [0.04, 9,  [12, 130]],
        [0.08, 10, [12, 120]], [0.12, 10, [11, 110]], [0.16, 10, [11, 90]],
      ];
      SANTERNO_BANK.forEach(([s, gap, sz], i) =>
        terrainPatch(`santerno-bank-${i}`, s, 1, gap, sz, BANK));

      // ---- Piratella hill-crest backdrop: staggered compact mounds ----
      backdrop(K(0.34), -1, 72, [40, 28, 58], [0.12, 0.28, 0.14]);
      backdrop(K(0.36), -1, 90, [36, 34, 54], [0.10, 0.24, 0.12]);
      backdrop(K(0.35),  1, 68, [38, 26, 56], [0.13, 0.30, 0.15]);
      backdrop(K(0.38), -1, 58, [32, 22, 48], [0.11, 0.26, 0.13]);

      // ---- TOP-2: Acque Minerali valley — dark hollow floor + mist bands ----
      terrainPatch("acque-mist-0", 0.45,  1, 14, [48, 80], [0.72, 0.78, 0.74]);
      terrainPatch("acque-mist-1", 0.48,  1, 16, [46, 78], [0.74, 0.80, 0.76]);
      terrainPatch("acque-mist-2", 0.51,  1, 15, [44, 72], [0.70, 0.76, 0.72]);
      terrainPatch("acque-mist-3", 0.54,  1, 14, [42, 65], [0.73, 0.79, 0.75]);
      terrainPatch("acque-mist-4", 0.48, -1, 12, [36, 55], [0.71, 0.77, 0.73]);
      // Extra dark canopy walls for the enclosed park-in-the-loop read
      backdrop(K(0.46),  1, 42, [34, 20, 50], [0.08, 0.20, 0.10]);
      backdrop(K(0.50),  1, 48, [36, 24, 52], [0.07, 0.18, 0.09]);
      backdrop(K(0.54), -1, 40, [32, 18, 48], [0.09, 0.22, 0.11]);

      // ---- Variante Alta: wooded hill ridges (tighter crest silhouette) ----
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
        addCone(out, vadd(ac.c, ac.u, tH + 2.4), 2.5, 7, [0.44, 0.34, 0.28], 7, [ac.r, ac.u, ac.t]);
        for (let qi = 0; qi < 2; qi++) {
          const ofs = (qi === 0) ? ac.r : ac.t;
          for (const sg of [-1, 1]) {
            addBox(out, vadd(vadd(ac.c, ac.u, tH + 0.9), ofs, sg * 2.0), [0.6, 1.2, 0.25], WIN_LIT, [ac.r, ac.u, ac.t]);
          }
        }
      }

      // ---- Pit building + main grandstand ----
      building(K(0.00), -1, 1, 16, 11, 130, { wall: [0.58, 0.60, 0.63], window: WIN_LIT, floor: 5, lit: true });
      prop(K(0.01), -1, 7, [2.5, 1.6, 120], RED);
      grandstand(0.965, -1, 10, 90, [0.55, 0.58, 0.62], RED);
      grandstand(0.02,  1, 22, 80, [0.52, 0.55, 0.60], [0.78, 0.30, 0.22]);
      grandstand(0.93, -1, 10, 70, [0.55, 0.58, 0.62], RED);

      // ---- Tamburello chicane + Senna memorial ----
      terrainPatch("tamburello-lawn", 0.05, -1, 12, [18, 20], BANK);
      place(K(0.05), -1, 14, [2, 3.2, 2], [0.45, 0.40, 0.30]);
      place(K(0.05), -1, 2, [0.4, 0.3, 7], RED);
      place(K(0.06), -1, 2, [0.4, 0.3, 7], WHITE);
      {
        const am = anchor(K(0.07), -1, 8);
        addBox(out, vadd(am.c, am.u, 1.25), [3, 2.5, 0.4], [0.90, 0.90, 0.88], [am.r, am.u, am.t]);
      }

      // ---- Villeneuve chicane kerbs + gravel trap ----
      terrainPatch("villeneuve-gravel", 0.12, -1, 5, [24, 30], GRAVEL);
      place(K(0.12), -1, 2, [0.4, 0.3, 7], RED);
      place(K(0.13), -1, 2, [0.4, 0.3, 7], WHITE);

      // ---- Tosa tight hairpin: grandstands + gravel ----
      grandstand(0.28, -1, 12, 60, [0.52, 0.55, 0.60], RED);
      grandstand(0.31, -1, 12, 50, [0.54, 0.57, 0.61], [0.20, 0.42, 0.72]);
      terrainPatch("tosa-gravel", 0.28, -1, 6, [34, 40], GRAVEL);

      // ---- TOP-3: Variante Alta — tall sausage kerbs + crest vegetation ----
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

      // ---- Rivazza double-left: gravel apron + grass amphitheatre banks ----
      grandstand(0.80, -1, 12, 55, [0.52, 0.55, 0.60], RED);
      grandstand(0.84, -1, 12, 48, [0.54, 0.57, 0.61], [0.78, 0.30, 0.22]);
      terrainPatch("rivazza-gravel-0", 0.79, -1, 6, [32, 55], GRAVEL);
      terrainPatch("rivazza-gravel-1", 0.81, -1, 7, [34, 58], GRAVEL);
      terrainPatch("rivazza-bank-0", 0.80, -1, 18, [40, 62], BANK);
      terrainPatch("rivazza-bank-1", 0.83, -1, 22, [38, 58], BANK);
      terrainPatch("rivazza-bank-2", 0.82,  1, 16, [28, 40], BANK);

      // ---- Italian town buildings at Variante Alta / Rivazza ----
      const TOWN_POS = [
        [0.60, -1, 85,  14, 18],
        [0.63, -1, 92,  12, 22],
        [0.66, -1, 100, 16, 15],
        [0.70, -1, 88,  13, 25],
        [0.74, -1, 95,  15, 20],
      ];
      for (const [s, side, dist, bw, bh] of TOWN_POS) {
        building(K(s), side, dist, bw, bh, bw * 0.8, { wall: bh > 20 ? TERRA2 : STONE3, window: WIN_LIT, floor: 3, lit: true });
      }

      // ---- Variante Bassa / pit approach: kerbs (river already continuous above) ----
      place(K(0.92), 1, 2, [0.4, 0.3, 7], RED);
      place(K(0.93), 1, 2, [0.4, 0.3, 7], WHITE);

      // ---- Marshal posts ----
      every(110, (k) => {
        marshalPost(k, hash(k * 37) < 0.5 ? -1 : 1, 5);
      });

      // ---- Cantilever roof blade over old pit lane ----
      {
        const a = anchor(K(0.00), -1, 12);
        addBox(out, vadd(a.c, a.u, 12), [18, 0.7, 120], [0.66, 0.68, 0.70], [a.r, a.u, a.t]);
      }

      // ---- Start/finish overhead gantry ----
      gantry(0.00, 7.5, [0.14, 0.14, 0.17]);
      gantry(0.965, 7.0, [0.18, 0.18, 0.20]);

      // ---- Pit / paddock complex (left of pit straight) ----
      building(K(0.97), -1, 18, 14, 7, 90, { wall: PITWALL, window: WIN_LIT, floor: 4, lit: true });
      building(K(0.90), -1, 20, 22, 9, 40, { wall: [0.66, 0.67, 0.70], window: WIN_LIT, floor: 4, roof: true, lit: true });
      building(K(0.94), -1, 46, 30, 12, 34, { wall: STONE, window: WIN_LIT, floor: 4, lit: true });
      {
        const aA = anchor(K(0.92), -1, 56);
        addCyl(out, aA.c, 2.0, 13, [0.60, 0.56, 0.48], 8, [aA.r, aA.u, aA.t]);
        const aB = anchor(K(0.92), -1, 63);
        addCyl(out, aB.c, 1.6, 11, [0.78, 0.74, 0.60], 8, [aB.r, aB.u, aB.t]);
      }
      tower(K(0.99), -1, 16, 9, 22, { col: [0.78, 0.80, 0.82], cap: true, capCol: [0.2, 0.2, 0.24], mast: 6 });
      wall(0.95, 0.06, -1, 2, 1.0, PITWALL, 0.5);

      // ---- Hillside old town with church (far left of pit straight / T1) ----
      {
        const at = anchor(K(0.02), -1, 110);
        const r = at.r, u = at.u, t = at.t;
        const baseY = groundYAt(K(0.02), 110);
        const base = [at.c[0], baseY, at.c[2]];
        const put = (alongM, outM, rise, w, h, d, col) => {
          const foot = vadd(vadd(vadd(base, t, alongM), r, -outM), u, rise);
          addBox(out, vadd(foot, u, h / 2), [w, h, d], col, [r, u, t]);
          // Roof sits ON the wall box (which spans foot .. foot+h). addPrism
          // anchors at its BASE, so the +1.0 left every village roof hovering.
          addPrism(out, vadd(foot, u, h), [w, 2.6, d], TERRA, [r, u, t]);
        };
        for (let i = 0; i < 6; i++) {
          const h2 = hash(i * 17 + 5);
          put(-80 + i * 28, h2 * 22, 3 + h2 * 6, 16 + h2 * 5, 10 + h2 * 6, 14 + h2 * 3, h2 < 0.5 ? STONE : STONE2);
        }
        for (let i = 0; i < 4; i++) {
          const h2 = hash(i * 31 + 9);
          put(-40 + i * 36, 46 + h2 * 30, 12 + h2 * 8, 18 + h2 * 6, 11 + h2 * 5, 16, h2 < 0.5 ? STONE2 : CONC);
        }
        const churchFoot = vadd(vadd(vadd(base, t, 55), r, -42), u, 18);
        addBox(out, vadd(churchFoot, u, 8), [18, 16, 28], STONE2, [r, u, t]);
        addPrism(out, vadd(churchFoot, u, 17), [18, 5.5, 28], TERRA, [r, u, t]);
        addBox(out, vadd(churchFoot, u, 6), [18, 2.5, 0.4], WIN_LIT, [r, u, t]);
        const towerFoot = vadd(churchFoot, t, 22);
        const campH = 28;
        addCyl(out, towerFoot, 1.8, campH, STONE, 8, [r, u, t]);
        addBox(out, vadd(towerFoot, u, campH), [5.5, 2.2, 5.5], STONE2, [r, u, t]);
        addCone(out, vadd(towerFoot, u, campH + 2.2), 2.8, 8, [0.44, 0.34, 0.28], 7, [r, u, t]);
        for (const sg of [-1, 1]) {
          addBox(out, vadd(vadd(towerFoot, u, campH + 0.8), r, sg * 2.2), [0.5, 1.0, 0.3], WIN_LIT, [r, u, t]);
        }
      }

      // ---- Grandstands at marquee corners ----
      grandstand(0.99, -1, 11, 60, [0.50, 0.53, 0.58], CROWD_C);
      grandstand(0.05,  1, 20, 70, [0.52, 0.55, 0.60], CROWD_B);
      grandstand(0.07, -1, 16, 56, [0.54, 0.56, 0.60], CROWD_A);
      grandstand(0.27,  1, 16, 44, [0.52, 0.55, 0.60], CROWD_B);
      grandstand(0.51,  1, 16, 60, [0.52, 0.55, 0.60], CROWD_A);
      grandstand(0.54,  1, 18, 46, [0.54, 0.57, 0.61], CROWD_C);
      grandstand(0.82, -1, 14, 64, [0.52, 0.55, 0.60], CROWD_B);

      // ---- Track furniture: fences, guardrails, tyre walls ----
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

      // ---- Billboards at key viewing areas ----
      billboard(K(0.05),  1, 18, 14, 5, [0.86, 0.16, 0.14]);
      billboard(K(0.12), -1, 16, 12, 5, [0.20, 0.40, 0.70]);
      billboard(K(0.27),  1, 18, 12, 5, [0.90, 0.80, 0.20]);
      billboard(K(0.51),  1, 20, 14, 5, [0.86, 0.30, 0.20]);
      billboard(K(0.66), -1, 16, 12, 5, [0.20, 0.44, 0.70]);
      billboard(K(0.82), -1, 18, 12, 5, [0.86, 0.16, 0.14]);
      billboard(K(0.95),  1, 16, 12, 5, [0.90, 0.80, 0.20]);

      // ---- Trackside hospitality + paddock marquee ----
      motorhome(K(0.49), 1, 30, 20, 6, 16, { wall: PITWALL, window: WIN_LIT });
      {
        const a = anchor(K(0.92), -1, 30);
        addBox(out, vadd(a.c, a.u, 2.2), [16, 4.4, 12], [0.90, 0.90, 0.88], [a.r, a.u, a.t]);
        addPrism(out, vadd(a.c, a.u, 5.8), [16, 2.8, 12], [0.94, 0.94, 0.92], [a.r, a.u, a.t]);
      }

      // ---- Lamp posts along pit straight and corner exits ----
      along(0.95, 0.10, 18, (k) => {
        const p = anchor(k, -1, 8);
        if (onTrack(p.c[0], p.c[2], 0.5)) return;
        addCyl(out, p.c, 0.12, 8.5, [0.58, 0.60, 0.62], 5, [p.r, p.u, p.t]);
        addBox(out, vadd(p.c, p.u, 8.5), [0.5, 0.45, 0.5], LAMP_COL, [p.r, p.u, p.t]);
      });
      along(0.30, 0.38, 20, (k) => {
        const p = anchor(k, -1, 7);
        if (onTrack(p.c[0], p.c[2], 0.5)) return;
        addCyl(out, p.c, 0.12, 8.0, [0.58, 0.60, 0.62], 5, [p.r, p.u, p.t]);
        addBox(out, vadd(p.c, p.u, 8.0), [0.5, 0.45, 0.5], LAMP_COL, [p.r, p.u, p.t]);
      });
      along(0.84, 0.92, 22, (k) => {
        const side = hash(k * 11) < 0.5 ? -1 : 1;
        const p = anchor(k, side, 7);
        if (onTrack(p.c[0], p.c[2], 0.5)) return;
        addCyl(out, p.c, 0.12, 8.0, [0.58, 0.60, 0.62], 5, [p.r, p.u, p.t]);
        addBox(out, vadd(p.c, p.u, 8.0), [0.5, 0.45, 0.5], LAMP_COL, [p.r, p.u, p.t]);
      });

      // ====================================================================
      // BESPOKE ENRICHMENT — Ayrton Senna memorial, Italian cypress, a stone
      // Santerno footbridge and terraced hillside stands. LOCAL to this closure.
      // ====================================================================

      // ── Italian cypress — the tall dark columnar spire that flanks Imola's
      //    wooded hillsides and the memorial park. ──
      const CYP = [0.11, 0.28, 0.15], CYP_D = [0.08, 0.22, 0.12];
      function cypress(k, side, dist, h) {
        const a = anchor(k, side, dist);
        const b = [a.r, a.u, a.t];
        const col = hash(k * 7 + side) < 0.5 ? CYP : CYP_D;
        out._mat = MAT.WOOD;
        addCyl(out, a.c, 0.20, h * 0.16, [0.30, 0.22, 0.14], 5, b);
        out._mat = MAT.FOLIAGE;
        addCone(out, vadd(a.c, a.u, h * 0.10), 1.35, h * 0.58, col, 6, b);
        addCone(out, vadd(a.c, a.u, h * 0.44), 1.00, h * 0.42, col, 6, b);
        addCone(out, vadd(a.c, a.u, h * 0.70), 0.65, h * 0.32, col, 6, b);
        out._mat = 0;
      }
      // Sparse Italian cypress punctuation only (deciduous hollow owns mid-lap).
      for (const [s0, side, gap, cnt] of [[0.32, -1, 24, 3], [0.52, 1, 26, 2], [0.64, -1, 32, 3], [0.82, -1, 20, 3]]) {
        for (let i = 0; i < cnt; i++) cypress(K(s0 + i * 0.010), side, gap + (i % 2) * 3, 13 + hash(i * 5 + s0 * 40) * 6);
      }

      // ── Ayrton Senna memorial park (Tamburello, s~0.07 L) — bronze figure on
      //    a stone plinth, three tricolour flag poles, a semicircle of tributes. ──
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

      // ── Stone footbridge over the Santerno (riverside, s~0.10 R) — piers,
      //    an arched deck prism and low parapet walls. ──
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

      // ── Terraced hillside tifosi bowls at Tosa & Rivazza — bespoke stepped
      //    crowd walls stacking up the natural banking (cheap slab + speckle). ──
      const IM_SHELL_A = [0.53, 0.55, 0.59], IM_SHELL_B = [0.48, 0.50, 0.55];
      const IM_CROWD = [[0.82, 0.24, 0.20], [0.86, 0.84, 0.80], [0.24, 0.42, 0.70], [0.72, 0.62, 0.30]];
      function tieredBowl(s, side, gap, len, tiers) {
        const k = K(s);
        const g0 = anchor(k, side, gap);
        if (onTrack(g0.c[0], g0.c[2], len * 0.4)) return;
        for (let t = 0; t < tiers; t++) {
          const a = anchor(k, side, gap + t * 5.4);
          const b = [a.r, a.u, a.t];
          const h = 2.8 + t * 3.1;
          out._mat = MAT.CONCRETE;
          addBox(out, vadd(a.c, a.u, h * 0.5), [5.0, h, len], t % 2 ? IM_SHELL_A : IM_SHELL_B, b);
          out._mat = MAT.FABRIC;
          addBox(out, vadd(a.c, a.u, h + 0.8), [4.3, 1.5, len], IM_CROWD[t % 4], b);
          out._mat = 0;
          addBox(out, vadd(a.c, a.u, h + 1.75), [4.6, 0.3, len + 1], [0.92, 0.90, 0.82], b);
          const cnt = Math.min(14, Math.floor(len / 6));
          out._mat = MAT.FABRIC;
          for (let c = 0; c < cnt; c++) {
            if (hash(k * 3 + t * 29 + c) < 0.45) continue;
            const off = (c / (cnt - 1) - 0.5) * (len - 4);
            addBox(out, vadd(vadd(a.c, a.t, off), a.u, h + 1.25), [1.8, 0.6, 1.2], IM_CROWD[(c + t) % 4], b);
          }
          out._mat = 0;
        }
        const aR = anchor(k, side, gap + (tiers - 0.5) * 5.4);
        out._mat = MAT.METAL;
        addBox(out, vadd(aR.c, aR.u, 2.8 + tiers * 3.1 + 1.5), [6.8, 0.45, len + 2],
               [0.20, 0.20, 0.24], [aR.r, aR.u, aR.t]);
        out._mat = 0;
      }
      tieredBowl(0.285, -1, 16, 60, 4);   // Tosa hairpin bank
      // Rivazza plunge amphitheatre — longer, higher tiers for the downhill beat
      tieredBowl(0.795, -1, 14, 68, 5);
      tieredBowl(0.835, -1, 18, 52, 4);
      tieredBowl(0.51, 1, 22, 48, 3);     // Acque Minerali (kept lighter — hollow is the hero)

      // ====================================================================
      // AUTHENTIC HERO-SECTOR DRESS PASS — five bounded additions that deepen
      // the park circuit without closing the driver's sightline to each apex.
      // ====================================================================

      // 1) Santerno park woodland: irregular veteran broadleaf groves and low
      // understory at Piratella / Acque Minerali, set behind the first treeline.
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

      // 2) Historic Autodromo race office: a restrained stucco-and-terracotta
      // pavilion behind the old pit approach, with an arcade and timing turret.
      (function historicRaceOffice() {
        const a = anchor(K(0.905), -1, 40);
        const b = [a.r, a.u, a.t], base = a.c;
        modelGroup("imola-historic-race-office", {
          center: vadd(base, a.u, 8), size: [34, 18, 38], basis: b,
        }, (stage) => {
          stage._mat = MAT.STONE;
          addBox(stage, vadd(base, a.u, 3.5), [26, 7, 30], [0.88, 0.82, 0.70], b);
          addPrism(stage, vadd(base, a.u, 8.4), [28, 3.2, 32], TERRA, b);
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
          addPrism(stage, vadd(turret, a.u, 14.2), [8, 2.4, 9], TERRA, b);
          stage._mat = MAT.METAL;
          addBox(stage, vadd(vadd(turret, a.r, -3.6), a.u, 9.5),
                 [0.25, 2.2, 5.4], WIN_LIT, b);
          stage._mat = 0;
        }, { required: true });
      })();

      // 3) Piratella hillside homes: a sparse stepped line of warm villas whose
      // terracotta roofs break the treeline, rather than forming a city wall.
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
        cypress(K(s + 0.005), side, gap + w + 5, 12 + (i % 3) * 2);
      });

      // 4) Tamburello remembrance garden: a low tribute wall behind the Senna
      // sculpture, with plaque bays and Italian event flags kept above eye-line.
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

      // 5) Layered period-circuit safety furniture: inner armco plus a set-back
      // catch fence at the three event-heavy exteriors. The fence remains open
      // mesh, preserving views to the memorial, hollow and Rivazza crowd banks.
      guardrail(0.015, 0.145, -1, 2.8, [0.76, 0.77, 0.79]);
      fence(0.015, 0.145, -1, 6.8, 4.2, [0.58, 0.61, 0.62]);
      guardrail(0.43, 0.56, 1, 2.8, [0.74, 0.75, 0.77]);
      fence(0.43, 0.49, 1, 6.5, 4.0, [0.56, 0.59, 0.60]);
      guardrail(0.775, 0.86, -1, 2.8, [0.76, 0.77, 0.79]);
    },
  }
  );
})();
