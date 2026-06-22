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
              fence, guardrail, tyreWall, wall } = api;
      const K = (s) => Math.round(s * n) % n;

      // ---- Palette (Imola riverside parkland: rich greens, warm Italian earth, Santerno blues) ----
      const CANOPY  = [0.21, 0.48, 0.21];   // sunlit deciduous canopy — warm spring green
      const WOODS   = [0.10, 0.28, 0.14];   // shaded woods — deep forest
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
      // Tiered dark-green box ridges settling behind the trackside treeline.
      every(70, (k) => {
        for (const side of [-1, 1]) {
          backdrop(k, side, 200 + hash(k * 13 + side) * 90, [110, 24, 90], [0.16, 0.34, 0.18]);
        }
      });

      // ---- DENSE PARKLAND: deciduous canopy + conifers walling both sides ----
      every(16, (k) => {
        for (const side of [-1, 1]) {
          const s = hash(k * 41 + side);
          if (s < 0.18) continue;
          const dist = 8 + s * 22, h = 10 + s * 9;
          if (s < 0.60) tree(k, side, dist, h, [0.17 + s * 0.08, 0.46, 0.20]);
          else pine(k, side, dist, h + 2, [0.08 + s * 0.05, 0.32, 0.14]);
        }
      });
      // Second, deeper rank of forest
      every(24, (k) => {
        for (const side of [-1, 1]) {
          const s = hash(k * 67 + side * 5);
          if (s < 0.38) continue;
          const dist = 28 + s * 30, h = 13 + s * 9;
          if (s < 0.68) pine(k, side, dist, h + 2, WOODS);
          else tree(k, side, dist, h, [0.14 + s * 0.06, 0.42, 0.18]);
        }
      });
      // Sunlit broadleaf verge trees scattered between
      every(55, (k) => {
        const h = hash(k * 53 + 9);
        if (h < 0.40) return;
        tree(k, h < 0.7 ? -1 : 1, 12 + h * 11, 12 + h * 7, [0.19 + h * 0.06, 0.47, 0.21]);
      });
      // Third, far rank: deep mature woodland mass
      every(36, (k) => {
        for (const side of [-1, 1]) {
          const s = hash(k * 91 + side * 13);
          if (s < 0.42) continue;
          const dist = 54 + s * 54;
          if (onTrack(px[k], pz[k], 0)) continue;
          if (s < 0.75) tree(k, side, dist, 15 + s * 10, [0.12 + s * 0.07, 0.38, 0.17]);
          else pine(k, side, dist, 17 + s * 9, [0.09, 0.28, 0.12]);
        }
      });
      // Low understory shrubs dotted along the verge
      every(38, (k) => {
        const s = hash(k * 29 + 3);
        if (s < 0.50) return;
        bush(k, s < 0.8 ? -1 : 1, 6 + s * 7, [0.17 + s * 0.08, 0.42, 0.19]);
      });

      // ---- Dense forest lining Tamburello approach (s≈0.05-0.10) and turn-in (s≈0.88-0.98) ----
      for (let i = 0; i < 36; i++) {
        const s = i / 36;
        if (s > 0.12 && s < 0.88) continue;
        const kk = K(s);
        for (const side of [-1, 1]) {
          const h2 = hash(kk * 81 + side + i);
          if (h2 < 0.30) continue;
          const dist = 9 + h2 * 12;
          if (h2 < 0.55) pine(kk, side, dist, 11 + h2 * 7, [0.09, 0.26, 0.13]);
          else tree(kk, side, dist, 10 + h2 * 6, [0.16, 0.40, 0.19]);
        }
      }

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
      // Dense riverside treeline from pit straight to Tosa hairpin
      hedge(0.02, 0.28, 1, 30, 9, WOODS);

      // ---- s 0.00 L — Old pit building + main grandstand on the pit straight ----
      building(K(0.00), -1, 1, 16, 11, 130, { wall: [0.58, 0.60, 0.63], window: WIN_LIT, floor: 5 });
      // red trim row fronting the old pit building
      prop(K(0.01), -1, 7, [2.5, 1.6, 120], RED);
      grandstand(0.965, -1, 10, 90, [0.55, 0.58, 0.62], RED);
      // packed start-straight stands opposite the pits + extra stand
      grandstand(0.02, 1, 22, 80, [0.52, 0.55, 0.60], [0.78, 0.30, 0.22]);
      grandstand(0.93, -1, 10, 70, [0.55, 0.58, 0.62], RED);

      // ---- s 0.05 L — Tamburello chicane + Ayrton Senna memorial ----
      groundPlane(K(0.05), -1, 8, [26, 30], BANK);
      place(K(0.05), -1, 14, [2, 3.2, 2], [0.45, 0.40, 0.30]);   // bronze Senna memorial
      tree(K(0.05), -1, 22, 12, CANOPY);
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

      // ---- s 0.35 L+R far — Piratella blind hill-crest: dark wooded green walls ----
      for (const side of [-1, 1]) {
        backdrop(K(0.35), side, 70 + side * 6, [60, 30, 90], [0.14, 0.32, 0.17]);
        pine(K(0.35), side, 30, 13, WOODS);
        pine(K(0.36), side, 24, 12, WOODS);
      }

      // ---- s 0.46-0.56 R — Acque Minerali: tree-lined valley with misty green hollow ----
      for (let i = 0; i < 10; i++) {
        const k = K(0.46 + i * 0.009);
        const h2 = hash(k * 7);
        if (i < 5) pine(k, 1, 16 + h2 * 18, 15 + h2 * 8, [0.07, 0.23, 0.11]);
        tree(k, 1, 32 + h2 * 20, 13 + h2 * 5, [0.12, 0.33, 0.14]);
        if (i > 1 && i < 8) bush(k, 1, 9 + h2 * 8, [0.14, 0.36, 0.16]);
      }
      // Misty valley floor
      groundPlane(K(0.48), 1, 18, [44, 70], [0.77, 0.81, 0.77]);
      groundPlane(K(0.51), 1, 16, [40, 58], [0.75, 0.79, 0.75]);
      groundPlane(K(0.54), 1, 14, [36, 50], [0.76, 0.80, 0.76]);

      // ---- s 0.58-0.70 L far — Wooded hills backdrop with the campanile tower rising ----
      for (let i = 0; i < 4; i++) {
        backdrop(K(0.58 + i * 0.012), -1, 100 + i * 18, [120, 26 + i * 6, 80], [0.16, 0.34, 0.18]);
      }
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
      bush(K(0.66), 1, 12, [0.16, 0.36, 0.18]);
      tree(K(0.65), -1, 20, 10, [0.15, 0.40, 0.18]);
      pine(K(0.68), 1, 18, 11, WOODS);

      // ---- s 0.78-0.86 L — Rivazza double-left descent: grass banks, gravel, grandstand + wooded sides ----
      grandstand(0.80, -1, 12, 55, [0.52, 0.55, 0.60], RED);
      grandstand(0.84, -1, 12, 48, [0.54, 0.57, 0.61], [0.78, 0.30, 0.22]);
      groundPlane(K(0.80), -1, 6, [30, 50], GRAVEL);
      groundPlane(K(0.81), -1, 20, [36, 55], BANK);    // gap raised to 20 to clear road+grandstand
      // shaded fog dip at Rivazza
      groundPlane(K(0.82), -1, 14, [26, 38], [0.74, 0.78, 0.74]);
      // woody enclosure on the descent
      pine(K(0.79), -1, 28, 12, WOODS);
      tree(K(0.82), 1, 25, 11, [0.12, 0.34, 0.16]);
      tree(K(0.85), 1, 20, 10, WOODS);

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
        building(K(s), side, dist, bw, bh, bw * 0.8, { wall: tc, window: WIN_LIT, floor: 3 });
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
      building(K(0.97), -1, 18, 14, 7, 90, { wall: PITWALL, window: WIN_LIT, floor: 4 });
      building(K(0.90), -1, 20, 22, 9, 40, { wall: [0.66, 0.67, 0.70], window: WIN_LIT, floor: 4, roof: true });
      building(K(0.94), -1, 46, 30, 12, 34, { wall: STONE, window: WIN_LIT, floor: 4 }); // paddock hospitality
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
      grandstand(0.05, 1, 20, 70, [0.52, 0.55, 0.60], CROWD_B);
      // Tamburello / Variante Tamburello viewing bank stand (left, s≈0.07)
      grandstand(0.07, -1, 16, 56, [0.54, 0.56, 0.60], CROWD_A);
      // Tosa hairpin — extra stand + opposite-side terrace
      grandstand(0.27, 1, 16, 44, [0.52, 0.55, 0.60], CROWD_B);
      // Acque Minerali — packed natural amphitheatre stand on the right bank
      grandstand(0.51, 1, 16, 60, [0.52, 0.55, 0.60], CROWD_A);
      grandstand(0.54, 1, 18, 46, [0.54, 0.57, 0.61], CROWD_C);
      // Rivazza — big banked stand on the descent
      grandstand(0.82, -1, 14, 64, [0.52, 0.55, 0.60], CROWD_B);

      // ============================================================
      //  TRACK FURNITURE — fences, guardrails, tyre walls, billboards
      // ============================================================
      fence(0.96, 0.10, -1, 4, 4, [0.62, 0.64, 0.66]);
      fence(0.49, 0.56, 1, 4, 4, [0.62, 0.64, 0.66]);
      fence(0.79, 0.86, -1, 4, 4, [0.62, 0.64, 0.66]);
      // Armco guardrails lining the river-side run and fast sweeps
      guardrail(0.00, 0.18, 1, 3, [0.78, 0.78, 0.80]);
      guardrail(0.20, 0.30, -1, 3, [0.78, 0.78, 0.80]);
      guardrail(0.60, 0.70, 1, 3, [0.78, 0.78, 0.80]);
      // Tyre walls protecting the chicane apexes + hairpin outside
      tyreWall(0.05, 0.075, -1, 2, RED);
      tyreWall(0.115, 0.135, -1, 2, [0.20, 0.40, 0.70]);
      tyreWall(0.27, 0.295, -1, 2, RED);
      tyreWall(0.655, 0.675, 1, 2, [0.20, 0.40, 0.70]);
      tyreWall(0.79, 0.815, -1, 2, RED);
      tyreWall(0.915, 0.93, 1, 2, RED);

      // ---- Billboards / sponsor hoardings at key viewing areas ----
      billboard(K(0.05), 1, 18, 14, 5, [0.86, 0.16, 0.14]);   // Tamburello
      billboard(K(0.12), -1, 16, 12, 5, [0.20, 0.40, 0.70]);  // Villeneuve chicane
      billboard(K(0.27), 1, 18, 12, 5, [0.90, 0.80, 0.20]);   // Tosa hairpin
      billboard(K(0.51), 1, 20, 14, 5, [0.86, 0.30, 0.20]);   // Acque Minerali
      billboard(K(0.66), -1, 16, 12, 5, [0.20, 0.44, 0.70]);  // Variante Alta
      billboard(K(0.82), -1, 18, 12, 5, [0.86, 0.16, 0.14]);  // Rivazza
      billboard(K(0.95), 1, 16, 12, 5, [0.90, 0.80, 0.20]);   // pit straight

      // ---- Trackside hospitality / TV compound near Acque Minerali ----
      building(K(0.49), 1, 30, 20, 6, 16, { wall: PITWALL, window: WIN_LIT, floor: 3, roof: true });
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
