/* Apex 26 — IMOLA circuit definition (data only).
   Registered on the global TrackDefs list; consumed by the js/tracks.js engine
   (palette resolved there from `night`, geometry from js/circuits.js or `segs`). */
(function () {
  "use strict";
  (window.TrackDefs = window.TrackDefs || []).push(
  {
    id: "imola",
    name: "IMOLA",
    gp: "Emilia Romagna GP",
    country: "Italy",
    night: false,
    theme: "green",
    lengthKm: 4.9,
    baseHW: 7,
    pal: { zenith: [0.24, 0.44, 0.74], horizon: [0.80, 0.72, 0.56], grass: [0.24, 0.46, 0.16], runoff: [0.44, 0.42, 0.36], sunDir: [0.7874615506676528, 0.5468482990747588, 0.2843611155188746], sun: [1, 0.9, 0.65], sunColor: [1, 0.88, 0.62] },
    segs: [
      { t: 0, l: 450 }, { t: -90, l: 100 }, { t: 60, l: 90 }, { t: 0, l: 300 }, { t: -70, l: 90 }, { t: 60, l: 80 },
      { t: 80, l: 100 }, { t: 0, l: 400 }, { t: 80, l: 100 }, { t: -60, l: 80 }, { t: 0, l: 180 }, { t: 80, l: 90 },
      { t: -100, l: 110 },
    ],
    // Hilly Italian classic (~40 m): dip to Acque Minerali, climb to Piratella,
    // then the descent through the Rivazza.
    elevations: [{ s: 0.28, halfM: 300, rise: -6 }, { s: 0.52, halfM: 300, rise: 10 }, { s: 0.78, halfM: 240, rise: -5 }],
    scenery: function (api) {
      const { out, n, px, pz, pyMin, hash, every, place, prop, backdrop, groundPlane,
              groundYAt, onTrack, addBox, addCyl, addCone, addPrism, addFrustum, vadd, anchor,
              along, mountain, tree, pine, hedge, bush,
              grandstand, building, tower, billboard, marshalPost, gantry,
              fence, guardrail, tyreWall, wall,
              forestEdge } = api;
      const K = (s) => Math.round(s * n) % n;

      // ---- Palette (Imola riverside parkland: rich greens, warm Italian earth, Santerno blues) ----
      const CANOPY  = [0.21, 0.48, 0.21];   // sunlit deciduous canopy — warm spring green
      const CANOPY2 = [0.17, 0.44, 0.19];   // slightly deeper mid-canopy variant
      const WOODS   = [0.10, 0.28, 0.14];   // shaded woods — deep forest
      const WOODS2  = [0.13, 0.32, 0.16];   // mid-shadow forest layer
      const BANK    = [0.44, 0.65, 0.28];   // sunlit grass bank — warm hillside
      const RIVER   = [0.26, 0.40, 0.54];   // blue-green Santerno water — cooler tone
      const GRAVEL  = [0.80, 0.72, 0.50];   // pale tan gravel — classic pit/runoff
      const RED     = [0.82, 0.16, 0.14];   // traditional kerb red
      const WHITE   = [0.92, 0.92, 0.90];   // kerb white
      const STONE   = [0.74, 0.70, 0.60];   // warm Italian stucco
      const STONE2  = [0.80, 0.74, 0.62];   // lighter stucco / rendered plaster
      const TERRA   = [0.66, 0.34, 0.22];   // terracotta roof
      const CONC    = [0.62, 0.63, 0.66];   // concrete grey
      const PITWALL = [0.86, 0.86, 0.84];   // white pit/paddock wall
      const TERRA2  = [0.78, 0.58, 0.42];   // warm sandstone
      const STONE3  = [0.88, 0.82, 0.72];   // pale limestone
      const TYRE    = [0.10, 0.10, 0.11];   // black rubber
      const CROWD_A = [0.62, 0.34, 0.30];   // warm crowd colour
      const CROWD_B = [0.30, 0.40, 0.66];   // blue crowd
      const CROWD_C = [0.70, 0.62, 0.30];   // gold crowd

      // Night-ready: emissive warm window colour and lamp glow colour
      const WIN_LIT  = [0.94, 0.82, 0.48];   // warm amber lit window (emissive-reads night)
      const LAMP_COL = [0.88, 0.78, 0.50];   // warm sodium lamp head

      // ---- Encircling WOODED IMOLA HILLS — CONTINUOUS green ring, no snow (snowline > 1) ----
      let cx = 0, cz = 0;
      for (let i = 0; i < n; i++) { cx += px[i]; cz += pz[i]; }
      cx /= n; cz /= n;
      let rad = 0;
      for (let i = 0; i < n; i++) rad = Math.max(rad, Math.hypot(px[i] - cx, pz[i] - cz));
      const ranges = [
        // near low wooded hills
        { extra: 230, wMin: 140, hMin: 38, hVar: 28, wVar: 80, count: 26, seg: 7,
          opts: { snowline: 2, forest: [0.13, 0.32, 0.16], rock: [0.30, 0.40, 0.26], col: [0.18, 0.36, 0.20] } },
        // mid wooded hills
        { extra: 380, wMin: 220, hMin: 58, hVar: 40, wVar: 80, count: 20, seg: 7,
          opts: { snowline: 2, forest: [0.17, 0.38, 0.20], rock: [0.36, 0.46, 0.34], col: [0.21, 0.40, 0.23] } },
        // far hazed wooded ridges
        { extra: 540, wMin: 320, hMin: 82, hVar: 52, wVar: 80, count: 16, seg: 7,
          opts: { snowline: 2, forest: [0.20, 0.42, 0.22], rock: [0.40, 0.48, 0.40], col: [0.24, 0.42, 0.26] } },
      ];
      for (const rg of ranges) {
        const ring = rad + rg.extra;
        for (let i = 0; i < rg.count; i++) {
          const a = (i + rg.extra * 0.004) / rg.count * 6.2832, h = hash(i * 7 + rg.extra);
          const w = rg.wMin + h * rg.wVar;
          mountain(cx + Math.cos(a) * ring, cz + Math.sin(a) * ring, pyMin,
                   w, rg.hMin + h * rg.hVar,
                   Object.assign({ seg: rg.seg, seed: i * 13 + rg.extra }, rg.opts));
        }
      }

      // ---- PARKLAND TREELINE: use forestEdge() for guaranteed no-clip placement ----
      // forestEdge auto-positions each tree so the canopy inner edge = gap from road edge.
      // Primary near treeline — mixed deciduous/conifer all the way round the circuit.
      // gap=4 is the minimum safe clearance past the road edge + any barriers.
      forestEdge(0.00, 1.00, -1, 4, { density: 0.72, hMin: 9, hMax: 15,
        col:  [0.09, 0.26, 0.13],   // pine: deep park green
        col2: [0.18, 0.44, 0.20],   // deciduous: warm mid-green
        pineFrac: 0.50 });
      forestEdge(0.00, 1.00,  1, 4, { density: 0.68, hMin: 8, hMax: 14,
        col:  [0.10, 0.28, 0.14],
        col2: [0.20, 0.46, 0.21],
        pineFrac: 0.45 });

      // Second rank — slightly deeper, taller trees for a layered woodland canopy.
      // gap=16 keeps the back-rank well behind the front rank.
      forestEdge(0.00, 1.00, -1, 18, { density: 0.50, hMin: 12, hMax: 19,
        col:  [0.08, 0.22, 0.11],
        col2: [0.14, 0.38, 0.17],
        pineFrac: 0.60 });
      forestEdge(0.00, 1.00,  1, 18, { density: 0.46, hMin: 11, hMax: 18,
        col:  [0.09, 0.24, 0.12],
        col2: [0.15, 0.36, 0.16],
        pineFrac: 0.55 });

      // Third rank — tall mature woodland mass for depth/silhouette.
      forestEdge(0.00, 1.00, -1, 40, { density: 0.30, hMin: 15, hMax: 22,
        col:  [0.07, 0.20, 0.10],
        col2: [0.12, 0.32, 0.14],
        pineFrac: 0.65 });
      forestEdge(0.00, 1.00,  1, 40, { density: 0.28, hMin: 14, hMax: 21,
        col:  [0.08, 0.22, 0.11],
        col2: [0.11, 0.30, 0.13],
        pineFrac: 0.60 });

      // Low understory shrubs dotted along the verge — kept well clear with bush() (compact).
      every(38, (k) => {
        const s = hash(k * 29 + 3);
        if (s < 0.50) return;
        bush(k, s < 0.8 ? -1 : 1, 6 + s * 7, [0.17 + s * 0.08, 0.42, 0.19]);
      });

      // ---- Denser forest at Tamburello approach & exit — gap=5 keeps canopy clear ----
      forestEdge(0.88, 1.00, -1, 5, { density: 0.85, hMin: 10, hMax: 16,
        col: [0.08, 0.24, 0.12], col2: [0.15, 0.38, 0.18], pineFrac: 0.60 });
      forestEdge(0.88, 1.00,  1, 5, { density: 0.80, hMin: 10, hMax: 15,
        col: [0.09, 0.26, 0.13], col2: [0.16, 0.40, 0.19], pineFrac: 0.55 });
      forestEdge(0.00, 0.12, -1, 5, { density: 0.85, hMin: 10, hMax: 16,
        col: [0.08, 0.24, 0.12], col2: [0.15, 0.38, 0.18], pineFrac: 0.60 });
      forestEdge(0.00, 0.12,  1, 5, { density: 0.80, hMin: 10, hMax: 15,
        col: [0.09, 0.26, 0.13], col2: [0.16, 0.40, 0.19], pineFrac: 0.55 });

      // ---- Piratella blind hill-crest (s≈0.33-0.42): dense wooded enclosure ----
      forestEdge(0.33, 0.42, -1, 5, { density: 0.90, hMin: 11, hMax: 17,
        col: WOODS, col2: WOODS2, pineFrac: 0.70 });
      forestEdge(0.33, 0.42,  1, 5, { density: 0.88, hMin: 11, hMax: 16,
        col: WOODS, col2: WOODS2, pineFrac: 0.65 });
      // Piratella hill-crest far-field: staggered wooded mounds (backdrop auto-rounds
      // green cols → frustum+cone organic mounds). Widths kept ≤48 m so the frustum
      // base radius (~24 m) stays compact and doesn't dominate the horizon as a slab.
      backdrop(K(0.34), -1, 72, [40, 28, 58], [0.14, 0.32, 0.17]);
      backdrop(K(0.36), -1, 90, [36, 34, 54], [0.12, 0.28, 0.14]);
      backdrop(K(0.35),  1, 68, [38, 26, 56], [0.15, 0.34, 0.18]);
      backdrop(K(0.37),  1, 86, [34, 32, 50], [0.13, 0.30, 0.15]);

      // ---- Acque Minerali valley (s≈0.46-0.56): misty hollow with deeper forestEdge ----
      // REPLACED individual pine/tree at dist 16-34 (clipping risk) with forestEdge.
      forestEdge(0.45, 0.57,  1, 5, { density: 0.88, hMin: 12, hMax: 18,
        col: [0.07, 0.22, 0.10], col2: [0.12, 0.32, 0.14], pineFrac: 0.65 });
      forestEdge(0.45, 0.57, -1, 5, { density: 0.70, hMin: 10, hMax: 16,
        col: [0.08, 0.24, 0.12], col2: [0.13, 0.33, 0.15], pineFrac: 0.55 });
      // Misty valley floor — gap raised to 18 to stay clear of road+forestEdge front rank
      groundPlane(K(0.48),  1, 18, [44, 70], [0.77, 0.81, 0.77]);
      groundPlane(K(0.51),  1, 16, [40, 58], [0.75, 0.79, 0.75]);
      groundPlane(K(0.54),  1, 14, [36, 50], [0.76, 0.80, 0.76]);
      // A few scrubby bushes at the valley margins (bush is compact, gap=7 safe)
      every(28, (k) => {
        const s2 = hash(k * 83 + 5);
        if (s2 < 0.45 || k < K(0.45) || k > K(0.57)) return;
        bush(k, 1, 7 + s2 * 5, [0.14, 0.36, 0.16]);
      });

      // ---- Variante Alta chicane (s≈0.64-0.70): mixed woodland on crest ----
      forestEdge(0.62, 0.72, -1, 4, { density: 0.80, hMin: 9, hMax: 14,
        col: WOODS, col2: CANOPY2, pineFrac: 0.55 });
      forestEdge(0.62, 0.72,  1, 4, { density: 0.75, hMin: 9, hMax: 14,
        col: WOODS, col2: CANOPY2, pineFrac: 0.50 });

      // ---- Rivazza descent (s≈0.76-0.88): dense side-forest on the bowl ----
      forestEdge(0.76, 0.89, -1, 4, { density: 0.78, hMin: 10, hMax: 16,
        col: WOODS, col2: WOODS2, pineFrac: 0.60 });
      forestEdge(0.76, 0.89,  1, 4, { density: 0.72, hMin: 9, hMax: 15,
        col: WOODS, col2: WOODS2, pineFrac: 0.55 });

      // ---- s 0.00 R — Santerno river: CONTINUOUS water & banks along pit straight ----
      // River runs on the right side from pit straight (s≈0.00) → Tosa (s≈0.28).
      // groundPlane gap > 4 required; these sit well past the tarmac edge.
      groundPlane(K(0.00), 1, 20, [60, 200], RIVER);   // main basin at start
      groundPlane(K(0.05), 1, 20, [55, 170], RIVER);   // mid-basin
      groundPlane(K(0.10), 1, 20, [55, 150], RIVER);   // at Tamburello
      groundPlane(K(0.15), 1, 18, [50, 130], RIVER);   // approaching Villeneuve
      // Grassy banks between tarmac and water — gap must clear road edge + bank width
      groundPlane(K(0.02), 1, 9,  [12, 180], BANK);    // start straight bank
      groundPlane(K(0.08), 1, 10, [12, 140], BANK);    // Tamburello bank
      groundPlane(K(0.13), 1, 10, [11, 110], BANK);    // Villeneuve bank
      // Riverside treeline from pit straight to Tosa — willows & poplars along the
      // Santerno bank. forestEdge() places organic tree silhouettes; gap=18 keeps
      // them clear of the bank groundPlanes and the river water.
      forestEdge(0.02, 0.28, 1, 18, { density: 0.55, hMin: 9, hMax: 14,
        col: WOODS, col2: [0.16, 0.40, 0.18], pineFrac: 0.25 });

      // ---- s 0.00 L — Old pit building + main grandstand on the pit straight ----
      building(K(0.00), -1, 1, 16, 11, 130, { wall: [0.58, 0.60, 0.63], window: WIN_LIT, floor: 5, lit: true });
      // red trim row fronting the old pit building
      prop(K(0.01), -1, 7, [2.5, 1.6, 120], RED);
      grandstand(0.965, -1, 10, 90, [0.55, 0.58, 0.62], RED);
      // packed start-straight stands opposite the pits + extra stand
      grandstand(0.02, 1, 22, 80, [0.52, 0.55, 0.60], [0.78, 0.30, 0.22]);
      grandstand(0.93, -1, 10, 70, [0.55, 0.58, 0.62], RED);

      // ---- s 0.05 L — Tamburello chicane + Ayrton Senna memorial ----
      groundPlane(K(0.05), -1, 8, [26, 30], BANK);
      place(K(0.05), -1, 14, [2, 3.2, 2], [0.45, 0.40, 0.30]);   // bronze Senna memorial
      // red/white kerb accents
      place(K(0.05), -1, 2, [0.4, 0.3, 7], RED);
      place(K(0.06), -1, 2, [0.4, 0.3, 7], WHITE);

      // ---- Senna memorial plaque at Tamburello chicane (s≈0.07) ----
      {
        const am = anchor(K(0.07), -1, 8);
        addBox(out, vadd(am.c, am.u, 1.25), [3, 2.5, 0.4], [0.90, 0.90, 0.88], [am.r, am.u, am.t]);
      }

      // ---- s 0.12 L — Villeneuve chicane kerbs + gravel trap beyond ----
      groundPlane(K(0.12), -1, 5, [24, 30], GRAVEL);
      place(K(0.12), -1, 2, [0.4, 0.3, 7], RED);
      place(K(0.13), -1, 2, [0.4, 0.3, 7], WHITE);

      // ---- s 0.28 L — Tosa tight hairpin: stepped grandstand + gravel run-off ----
      grandstand(0.28, -1, 12, 60, [0.52, 0.55, 0.60], RED);
      grandstand(0.31, -1, 12, 50, [0.54, 0.57, 0.61], [0.20, 0.42, 0.72]);
      groundPlane(K(0.28), -1, 6, [34, 40], GRAVEL);

      // ---- s 0.58-0.70 L far — Wooded hill ridges behind Variante Alta / campanile.
      //      Four staggered mounds at increasing distance; widths kept ≤52 m so each
      //      mound reads as a distinct hill rather than a uniform green plane.
      //      The town buildings (TOWN_POS loop below) sit in front of these ridges.
      backdrop(K(0.59), -1,  80, [44, 22, 58], [0.16, 0.34, 0.18]);
      backdrop(K(0.61), -1,  96, [48, 26, 64], [0.14, 0.30, 0.16]);
      backdrop(K(0.64), -1, 112, [46, 30, 60], [0.15, 0.32, 0.17]);
      backdrop(K(0.67), -1, 128, [42, 28, 56], [0.13, 0.28, 0.15]);
      // Classic Imola campanile (bell tower) visible above treeline.
      // Placed at dist=120 off-track left; cylinder base sits at ground, cone sits
      // directly atop the cylinder at height=32 (so no gap / no floating spire).
      {
        const ac = anchor(K(0.64), -1, 120);
        const towerH = 30;
        addCyl(out, ac.c, 2.0, towerH, STONE2, 8, [ac.r, ac.u, ac.t]);          // shaft — base at ground
        addBox(out, vadd(ac.c, ac.u, towerH), [5.0, 2.4, 5.0], STONE, [ac.r, ac.u, ac.t]);      // belfry cap
        addCone(out, vadd(ac.c, ac.u, towerH + 2.4), 2.5, 7, [0.44, 0.34, 0.28], 7, [ac.r, ac.u, ac.t]); // spire — sits on cap
        // Lit belfry windows — four narrow bright slots (two on each axis)
        for (let qi = 0; qi < 2; qi++) {
          const ofs = (qi === 0) ? ac.r : ac.t;
          for (const sg of [-1, 1]) {
            addBox(out, vadd(vadd(ac.c, ac.u, towerH + 0.9), ofs, sg * 2.0), [0.6, 1.2, 0.25], WIN_LIT, [ac.r, ac.u, ac.t]);
          }
        }
      }

      // ---- s 0.66 L+R near — Variante Alta chicane over a crest: sausage kerbs + vegetation ----
      for (const side of [-1, 1]) {
        place(K(0.66), side, 2, [0.7, 0.5, 8], RED);
        place(K(0.67), side, 2, [0.7, 0.5, 8], WHITE);
      }
      bush(K(0.66), -1, 10, BANK);
      bush(K(0.66),  1, 12, [0.16, 0.36, 0.18]);

      // ---- s 0.78-0.86 L — Rivazza double-left descent: grass banks, gravel, grandstand + wooded sides ----
      grandstand(0.80, -1, 12, 55, [0.52, 0.55, 0.60], RED);
      grandstand(0.84, -1, 12, 48, [0.54, 0.57, 0.61], [0.78, 0.30, 0.22]);
      groundPlane(K(0.80), -1, 6, [30, 50], GRAVEL);
      groundPlane(K(0.81), -1, 20, [36, 55], BANK);    // gap raised to 20 to clear road+grandstand
      // shaded fog dip at Rivazza
      groundPlane(K(0.82), -1, 14, [26, 38], [0.74, 0.78, 0.74]);

      // ---- Italian town buildings at Variante Alta / Rivazza (s=0.60–0.80) ----
      // All windows use WIN_LIT for day warmth + night legibility.
      const TOWN_POS = [
        [0.60, -1, 85,  14, 18],
        [0.63, -1, 92,  12, 22],
        [0.66, -1, 100, 16, 15],
        [0.70, -1, 88,  13, 25],
        [0.74, -1, 95,  15, 20],
      ];
      for (const [s, side, dist, bw, bh] of TOWN_POS) {
        const tc = (bh > 20) ? TERRA2 : STONE3;
        building(K(s), side, dist, bw, bh, bw * 0.8, { wall: tc, window: WIN_LIT, floor: 3, lit: true });
      }

      // ---- s 0.92 R near — Variante Bassa / pit approach kerbs back toward river ----
      place(K(0.92), 1, 2, [0.4, 0.3, 7], RED);
      place(K(0.93), 1, 2, [0.4, 0.3, 7], WHITE);
      groundPlane(K(0.92), 1, 22, [44, 110], RIVER);   // river rejoins by pit straight (gap raised)

      // ---- Marshal posts for corner flagging ----
      every(110, (k) => {
        marshalPost(k, hash(k * 37) < 0.5 ? -1 : 1, 5);
      });

      // ---- thin cantilever roof blade over the old pit lane ----
      // Placed at dist=12 from road edge; the pit building is at dist=1 + w/2=9.
      // The roof sits at 11.5m above ground — clear of the building top (11m).
      {
        const a = anchor(K(0.00), -1, 12);
        addBox(out, vadd(a.c, a.u, 12), [18, 0.7, 120], [0.66, 0.68, 0.70], [a.r, a.u, a.t]);
      }

      // ============================================================
      //  ENRICHMENT — buildings, town backdrop, crowds, furniture
      // ============================================================

      // ---- Start/finish overhead gantry + scoring gantry into turn 1 ----
      gantry(0.00, 7.5, [0.14, 0.14, 0.17]);
      gantry(0.965, 7.0, [0.18, 0.18, 0.20]);

      // ---- Pit / paddock complex along the pit straight (left) ----
      building(K(0.97), -1, 18, 14, 7, 90, { wall: PITWALL, window: WIN_LIT, floor: 4, lit: true });
      building(K(0.90), -1, 20, 22, 9, 40, { wall: [0.66, 0.67, 0.70], window: WIN_LIT, floor: 4, roof: true, lit: true });
      building(K(0.94), -1, 46, 30, 12, 34, { wall: STONE, window: WIN_LIT, floor: 4, lit: true }); // paddock hospitality
      // fuel depot (tall cylindrical tanks) — two tanks side by side, not overlapping.
      // Tank A at dist=56, tank B offset +6m along t to avoid overlap.
      {
        const aA = anchor(K(0.92), -1, 56);
        addCyl(out, aA.c, 2.0, 13, [0.60, 0.56, 0.48], 8, [aA.r, aA.u, aA.t]);
        // Tank B shifted 5.5m along track direction to avoid cylinder intersection
        const aB = anchor(K(0.92), -1, 63);
        addCyl(out, aB.c, 1.6, 11, [0.78, 0.74, 0.60], 8, [aB.r, aB.u, aB.t]);
      }
      // race control / timing tower above the pits
      tower(K(0.99), -1, 16, 9, 22, { col: [0.78, 0.80, 0.82], cap: true, capCol: [0.2, 0.2, 0.24], mast: 6 });
      // pit wall separating pit lane from track
      wall(0.95, 0.06, -1, 2, 1.0, PITWALL, 0.5);

      // ============================================================
      //  HILLSIDE TOWN BACKDROP — Imola old town with church
      //  Placed as a cluster on far hill (left of pit straight / T1).
      // ============================================================
      {
        // Anchor to the hill behind the main straight, well off-track.
        // Use ONE consistent ground baseline + manual hill tiers so houses spread
        // along the basis don't drift off mismatched per-node terrain samples.
        const at = anchor(K(0.02), -1, 150);
        const r = at.r, u = at.u, t = at.t;
        const baseY = groundYAt(K(0.02), 150);
        const base = [at.c[0], baseY, at.c[2]];
        const put = (alongM, outM, rise, w, h, d, col) => {
          // Build the ground footing point, then lift by rise.
          // rise is the hillside elevation offset above the far-field baseline —
          // NOT an additional u-axis translation, so buildings sit on the slope.
          const foot = vadd(vadd(vadd(base, t, alongM), r, -outM), u, rise);
          addBox(out, vadd(foot, u, h / 2), [w, h, d], col, [r, u, t]);
          addPrism(out, vadd(foot, u, h + 1.0), [w, 2.6, d], TERRA, [r, u, t]); // terracotta hip roof
        };
        // lower tier: rows of town houses stepping UP the hill
        for (let i = 0; i < 6; i++) {
          const h2 = hash(i * 17 + 5);
          put(-80 + i * 28, h2 * 22, 3 + h2 * 6, 16 + h2 * 5, 10 + h2 * 6, 14 + h2 * 3, h2 < 0.5 ? STONE : STONE2);
        }
        // mid tier: larger buildings in the distance
        for (let i = 0; i < 4; i++) {
          const h2 = hash(i * 31 + 9);
          put(-40 + i * 36, 46 + h2 * 30, 12 + h2 * 8, 18 + h2 * 6, 11 + h2 * 5, 16, h2 < 0.5 ? STONE2 : CONC);
        }
        // ---- church: nave + bell tower (campanile) cleanly positioned ----
        // churchFoot is on the hillside baseline; rise=18 keeps it above the lower
        // tier houses (max rise≈9) without floating off into space.
        const churchFoot = vadd(vadd(vadd(base, t, 55), r, -42), u, 18);
        addBox(out, vadd(churchFoot, u, 8), [18, 16, 28], STONE2, [r, u, t]);        // nave
        addPrism(out, vadd(churchFoot, u, 16 + 1.0), [18, 5.5, 28], TERRA, [r, u, t]); // gable roof
        // Lit window bands on the nave facade
        addBox(out, vadd(churchFoot, u, 6), [18, 2.5, 0.4], WIN_LIT, [r, u, t]);

        // Town campanile: placed beside the nave (offset +22 along t so they don't overlap).
        // The base of the shaft anchors at churchFoot height — no additional rise needed.
        const towerFoot = vadd(churchFoot, t, 22);
        const campH = 28;
        addCyl(out, towerFoot, 1.8, campH, STONE, 8, [r, u, t]);                    // cylindrical shaft
        addBox(out, vadd(towerFoot, u, campH), [5.5, 2.2, 5.5], STONE2, [r, u, t]); // belfry block
        addCone(out, vadd(towerFoot, u, campH + 2.2), 2.8, 8, [0.44, 0.34, 0.28], 7, [r, u, t]); // spire
        // Lit belfry openings on tower
        for (const sg of [-1, 1]) {
          addBox(out, vadd(vadd(towerFoot, u, campH + 0.8), r, sg * 2.2), [0.5, 1.0, 0.3], WIN_LIT, [r, u, t]);
        }
      }

      // ============================================================
      //  GRANDSTANDS + CROWDS at the marquee corners
      // ============================================================
      grandstand(0.99, -1, 11, 60, [0.50, 0.53, 0.58], CROWD_C);
      grandstand(0.05,  1, 20, 70, [0.52, 0.55, 0.60], CROWD_B);
      // Tamburello / Variante Tamburello viewing bank stand (left, s≈0.07)
      grandstand(0.07, -1, 16, 56, [0.54, 0.56, 0.60], CROWD_A);
      // Tosa hairpin — extra stand + opposite-side terrace
      grandstand(0.27,  1, 16, 44, [0.52, 0.55, 0.60], CROWD_B);
      // Acque Minerali — packed natural amphitheatre stand on the right bank
      grandstand(0.51,  1, 16, 60, [0.52, 0.55, 0.60], CROWD_A);
      grandstand(0.54,  1, 18, 46, [0.54, 0.57, 0.61], CROWD_C);
      // Rivazza — big banked stand on the descent
      grandstand(0.82, -1, 14, 64, [0.52, 0.55, 0.60], CROWD_B);

      // ============================================================
      //  TRACK FURNITURE — fences, guardrails, tyre walls, billboards
      // ============================================================
      fence(0.96, 0.10, -1, 4, 4, [0.62, 0.64, 0.66]);
      fence(0.49, 0.56,  1, 4, 4, [0.62, 0.64, 0.66]);
      fence(0.79, 0.86, -1, 4, 4, [0.62, 0.64, 0.66]);
      // Armco guardrails lining the river-side run and fast sweeps
      guardrail(0.00, 0.18, 1, 3, [0.78, 0.78, 0.80]);
      guardrail(0.20, 0.30, -1, 3, [0.78, 0.78, 0.80]);
      guardrail(0.60, 0.70,  1, 3, [0.78, 0.78, 0.80]);
      // Tyre walls protecting the chicane apexes + hairpin outside
      tyreWall(0.05,  0.075, -1, 2, RED);
      tyreWall(0.115, 0.135, -1, 2, [0.20, 0.40, 0.70]);
      tyreWall(0.27,  0.295, -1, 2, RED);
      tyreWall(0.655, 0.675,  1, 2, [0.20, 0.40, 0.70]);
      tyreWall(0.79,  0.815, -1, 2, RED);
      tyreWall(0.915, 0.93,   1, 2, RED);

      // ---- Billboards / sponsor hoardings at key viewing areas ----
      billboard(K(0.05),  1, 18, 14, 5, [0.86, 0.16, 0.14]);   // Tamburello
      billboard(K(0.12), -1, 16, 12, 5, [0.20, 0.40, 0.70]);   // Villeneuve chicane
      billboard(K(0.27),  1, 18, 12, 5, [0.90, 0.80, 0.20]);   // Tosa hairpin
      billboard(K(0.51),  1, 20, 14, 5, [0.86, 0.30, 0.20]);   // Acque Minerali
      billboard(K(0.66), -1, 16, 12, 5, [0.20, 0.44, 0.70]);   // Variante Alta
      billboard(K(0.82), -1, 18, 12, 5, [0.86, 0.16, 0.14]);   // Rivazza
      billboard(K(0.95),  1, 16, 12, 5, [0.90, 0.80, 0.20]);   // pit straight

      // ---- Trackside hospitality / TV compound near Acque Minerali ----
      building(K(0.49), 1, 30, 20, 6, 16, { wall: PITWALL, window: WIN_LIT, floor: 3, roof: true, lit: true });
      // Paddock marquee tents at the paddock (s≈0.92, left)
      {
        const a = anchor(K(0.92), -1, 30);
        addBox(out, vadd(a.c, a.u, 2.2), [16, 4.4, 12], [0.90, 0.90, 0.88], [a.r, a.u, a.t]);
        addPrism(out, vadd(a.c, a.u, 4.4 + 1.4), [16, 2.8, 12], [0.94, 0.94, 0.92], [a.r, a.u, a.t]);
      }

      // ============================================================
      //  LAMP POSTS — Italian-style column lamps at regular intervals.
      //  Placed along pit straight (both sides) and major corner exits
      //  so the circuit reads at night and reads as "organised" by day.
      //  A slim cylinder post + small bright box head.
      // ============================================================
      // Pit straight lamp posts — left side only (right is the river)
      along(0.95, 0.10, 18, (k) => {
        const p = anchor(k, -1, 8);
        if (onTrack(p.c[0], p.c[2], 0.5)) return;
        addCyl(out, p.c, 0.12, 8.5, [0.58, 0.60, 0.62], 5, [p.r, p.u, p.t]);
        addBox(out, vadd(p.c, p.u, 8.5), [0.5, 0.45, 0.5], LAMP_COL, [p.r, p.u, p.t]);
      });
      // Tosa hairpin exit lamp posts (s≈0.30–0.38)
      along(0.30, 0.38, 20, (k) => {
        const side = -1;
        const p = anchor(k, side, 7);
        if (onTrack(p.c[0], p.c[2], 0.5)) return;
        addCyl(out, p.c, 0.12, 8.0, [0.58, 0.60, 0.62], 5, [p.r, p.u, p.t]);
        addBox(out, vadd(p.c, p.u, 8.0), [0.5, 0.45, 0.5], LAMP_COL, [p.r, p.u, p.t]);
      });
      // Rivazza exit lamp posts (s≈0.84–0.92)
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
