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
    name: "IMOLA",
    gp: "Emilia Romagna GP",
    country: "Italy",
    night: false,
    theme: "green",
    lengthKm: 4.9,
    baseHW: 7,
    pal: { zenith: [0.24, 0.44, 0.74], horizon: [0.80, 0.72, 0.56], grass: [0.24, 0.46, 0.16], runoff: [0.44, 0.42, 0.36], sunDir: [0.7874615506676528, 0.5468482990747588, 0.2843611155188746], sun: [1, 0.9, 0.65], sunColor: [1, 0.88, 0.62] },
    segs: [
      { t: 0, l: 450 }, { t: 90, l: 100 }, { t: -60, l: 90 }, { t: 0, l: 300 }, { t: 70, l: 90 }, { t: -60, l: 80 },
      { t: -80, l: 100 }, { t: 0, l: 400 }, { t: -80, l: 100 }, { t: 60, l: 80 }, { t: 0, l: 180 }, { t: -80, l: 90 },
      { t: 100, l: 110 },
    ],
    // Hilly Italian classic (~40 m): dip to Acque Minerali, climb to Piratella,
    // then the descent through the Rivazza.
    elevations: [{ s: 0.28, halfM: 300, rise: -6 }, { s: 0.52, halfM: 300, rise: 10 }, { s: 0.78, halfM: 240, rise: -5 }],
    scenery: function (api) {
      const { out, n, px, pz, pyMin, hash, every, place, prop, backdrop, groundPlane,
              groundYAt, onTrack, addBox, addCyl, addCone, addPrism, addFrustum, vadd, anchor,
              along, mountain, tree, pine, hedge, bush,
              grandstand, building, motorhome, tower, billboard, marshalPost, gantry,
              fence, guardrail, tyreWall, wall,
              forestEdge } = api;
      const K = (s) => Math.round(s * n) % n;

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

      // ---- Encircling WOODED IMOLA HILLS — two compact rings ----
      let cx = 0, cz = 0;
      for (let i = 0; i < n; i++) { cx += px[i]; cz += pz[i]; }
      cx /= n; cz /= n;
      let rad = 0;
      for (let i = 0; i < n; i++) rad = Math.max(rad, Math.hypot(px[i] - cx, pz[i] - cz));

      // Near low wooded hills (18 peaks)
      for (let i = 0; i < 18; i++) {
        const a = i / 18 * 6.2832, h = hash(i * 7 + 230);
        mountain(cx + Math.cos(a) * (rad + 230), cz + Math.sin(a) * (rad + 230), pyMin,
                 140 + h * 80, 38 + h * 28,
                 { seg: 7, seed: i * 13 + 230, snowline: 2,
                   forest: [0.13, 0.32, 0.16], rock: [0.30, 0.40, 0.26], col: [0.18, 0.36, 0.20] });
      }
      // Far hazed wooded ridges (14 peaks)
      for (let i = 0; i < 14; i++) {
        const a = (i + 0.4) / 14 * 6.2832, h = hash(i * 11 + 540);
        mountain(cx + Math.cos(a) * (rad + 540), cz + Math.sin(a) * (rad + 540), pyMin,
                 280 + h * 80, 78 + h * 50,
                 { seg: 7, seed: i * 17 + 540, snowline: 2,
                   forest: [0.20, 0.42, 0.22], rock: [0.40, 0.48, 0.40], col: [0.24, 0.42, 0.26] });
      }

      // ---- SECTION-BY-SECTION TREELINE (no global full-circuit passes) ----
      // Each section is covered once per side at moderate density to stay within
      // SwiftShader budget for the 25-frame blank-scan test (180 s total).

      // Pit straight + Tamburello approach (wraps around 0)
      forestEdge(0.88, 1.00, -1, 5, { density: 0.45, hMin: 10, hMax: 16,
        col: [0.08, 0.24, 0.12], col2: [0.16, 0.40, 0.18], pineFrac: 0.60 });
      forestEdge(0.88, 1.00,  1, 8, { density: 0.40, hMin: 9, hMax: 14,
        col: [0.09, 0.26, 0.13], col2: [0.17, 0.40, 0.19], pineFrac: 0.45 });

      // Tamburello chicane through Villeneuve
      forestEdge(0.00, 0.14, -1, 5, { density: 0.45, hMin: 10, hMax: 16,
        col: [0.08, 0.24, 0.12], col2: [0.16, 0.40, 0.18], pineFrac: 0.60 });
      forestEdge(0.00, 0.14,  1, 5, { density: 0.38, hMin: 9, hMax: 14,
        col: WOODS, col2: [0.16, 0.40, 0.18], pineFrac: 0.25 });

      // Villeneuve to Tosa
      forestEdge(0.14, 0.30, -1, 5, { density: 0.38, hMin: 9, hMax: 14,
        col: WOODS, col2: WOODS2, pineFrac: 0.50 });
      forestEdge(0.14, 0.30,  1, 5, { density: 0.32, hMin: 8, hMax: 13,
        col: WOODS, col2: WOODS2, pineFrac: 0.40 });

      // Tosa to Piratella climb
      forestEdge(0.30, 0.42, -1, 5, { density: 0.42, hMin: 11, hMax: 17,
        col: WOODS, col2: WOODS2, pineFrac: 0.65 });
      forestEdge(0.30, 0.42,  1, 5, { density: 0.36, hMin: 10, hMax: 16,
        col: WOODS, col2: WOODS2, pineFrac: 0.55 });

      // Acque Minerali valley
      forestEdge(0.42, 0.58, -1, 5, { density: 0.38, hMin: 10, hMax: 16,
        col: [0.08, 0.24, 0.12], col2: [0.13, 0.33, 0.15], pineFrac: 0.55 });
      forestEdge(0.42, 0.58,  1, 5, { density: 0.42, hMin: 12, hMax: 18,
        col: [0.07, 0.22, 0.10], col2: [0.12, 0.32, 0.14], pineFrac: 0.65 });

      // Variante Alta chicane
      forestEdge(0.58, 0.74, -1, 4, { density: 0.38, hMin: 9, hMax: 14,
        col: WOODS, col2: CANOPY2, pineFrac: 0.55 });
      forestEdge(0.58, 0.74,  1, 4, { density: 0.34, hMin: 9, hMax: 14,
        col: WOODS, col2: CANOPY2, pineFrac: 0.50 });

      // Rivazza descent
      forestEdge(0.74, 0.88, -1, 4, { density: 0.40, hMin: 10, hMax: 16,
        col: WOODS, col2: WOODS2, pineFrac: 0.60 });
      forestEdge(0.74, 0.88,  1, 4, { density: 0.36, hMin: 9, hMax: 15,
        col: WOODS, col2: WOODS2, pineFrac: 0.55 });

      // ---- Santerno river: water basins & grass banks (right of pit straight) ----
      groundPlane(K(0.00), 1, 20, [60, 200], RIVER);
      groundPlane(K(0.08), 1, 20, [55, 150], RIVER);
      groundPlane(K(0.15), 1, 18, [50, 130], RIVER);
      groundPlane(K(0.02), 1, 9,  [12, 180], BANK);
      groundPlane(K(0.10), 1, 10, [12, 120], BANK);

      // ---- Piratella hill-crest backdrop: staggered compact mounds ----
      backdrop(K(0.34), -1, 72, [40, 28, 58], [0.14, 0.32, 0.17]);
      backdrop(K(0.36), -1, 90, [36, 34, 54], [0.12, 0.28, 0.14]);
      backdrop(K(0.35),  1, 68, [38, 26, 56], [0.15, 0.34, 0.18]);

      // ---- Acque Minerali valley floor: misty ground planes ----
      groundPlane(K(0.48),  1, 18, [44, 70], [0.77, 0.81, 0.77]);
      groundPlane(K(0.52),  1, 16, [40, 58], [0.75, 0.79, 0.75]);

      // ---- Variante Alta: wooded hill ridges ----
      backdrop(K(0.60), -1,  82, [44, 22, 58], [0.16, 0.34, 0.18]);
      backdrop(K(0.64), -1, 108, [46, 30, 60], [0.15, 0.32, 0.17]);
      backdrop(K(0.68), -1, 128, [42, 28, 56], [0.13, 0.28, 0.15]);

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
      groundPlane(K(0.05), -1, 8, [26, 30], BANK);
      place(K(0.05), -1, 14, [2, 3.2, 2], [0.45, 0.40, 0.30]);
      place(K(0.05), -1, 2, [0.4, 0.3, 7], RED);
      place(K(0.06), -1, 2, [0.4, 0.3, 7], WHITE);
      {
        const am = anchor(K(0.07), -1, 8);
        addBox(out, vadd(am.c, am.u, 1.25), [3, 2.5, 0.4], [0.90, 0.90, 0.88], [am.r, am.u, am.t]);
      }

      // ---- Villeneuve chicane kerbs + gravel trap ----
      groundPlane(K(0.12), -1, 5, [24, 30], GRAVEL);
      place(K(0.12), -1, 2, [0.4, 0.3, 7], RED);
      place(K(0.13), -1, 2, [0.4, 0.3, 7], WHITE);

      // ---- Tosa tight hairpin: grandstands + gravel ----
      grandstand(0.28, -1, 12, 60, [0.52, 0.55, 0.60], RED);
      grandstand(0.31, -1, 12, 50, [0.54, 0.57, 0.61], [0.20, 0.42, 0.72]);
      groundPlane(K(0.28), -1, 6, [34, 40], GRAVEL);

      // ---- Variante Alta kerbs + vegetation ----
      for (const side of [-1, 1]) {
        place(K(0.66), side, 2, [0.7, 0.5, 8], RED);
        place(K(0.67), side, 2, [0.7, 0.5, 8], WHITE);
      }
      bush(K(0.66), -1, 10, BANK);
      bush(K(0.66),  1, 12, [0.16, 0.36, 0.18]);

      // ---- Rivazza double-left: grandstands, gravel, grass banks ----
      grandstand(0.80, -1, 12, 55, [0.52, 0.55, 0.60], RED);
      grandstand(0.84, -1, 12, 48, [0.54, 0.57, 0.61], [0.78, 0.30, 0.22]);
      groundPlane(K(0.80), -1, 6, [30, 50], GRAVEL);
      groundPlane(K(0.81), -1, 20, [36, 55], BANK);

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

      // ---- Variante Bassa / pit approach: river returns ----
      place(K(0.92), 1, 2, [0.4, 0.3, 7], RED);
      place(K(0.93), 1, 2, [0.4, 0.3, 7], WHITE);
      groundPlane(K(0.92), 1, 22, [44, 110], RIVER);

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
        const at = anchor(K(0.02), -1, 150);
        const r = at.r, u = at.u, t = at.t;
        const baseY = groundYAt(K(0.02), 150);
        const base = [at.c[0], baseY, at.c[2]];
        const put = (alongM, outM, rise, w, h, d, col) => {
          const foot = vadd(vadd(vadd(base, t, alongM), r, -outM), u, rise);
          addBox(out, vadd(foot, u, h / 2), [w, h, d], col, [r, u, t]);
          addPrism(out, vadd(foot, u, h + 1.0), [w, 2.6, d], TERRA, [r, u, t]);
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
      tyreWall(0.05,  0.075, -1, 2, RED);
      tyreWall(0.115, 0.135, -1, 2, [0.20, 0.40, 0.70]);
      tyreWall(0.27,  0.295, -1, 2, RED);
      tyreWall(0.655, 0.675,  1, 2, [0.20, 0.40, 0.70]);
      tyreWall(0.79,  0.815, -1, 2, RED);
      tyreWall(0.915, 0.93,   1, 2, RED);

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
    },
  }
  );
})();
