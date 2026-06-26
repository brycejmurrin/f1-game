/* Apex 26 — IMOLA circuit definition (data only).
   Registered on the global TrackDefs list; consumed by the js/tracks.js engine
   (palette resolved there from `night`, geometry from js/circuits.js or `segs`). */
(function () {
  "use strict";
  (window.TrackDefs = window.TrackDefs || []).push(
  {
    id: "imola",
    reverse: true,  // GPS trace is backwards vs real racing direction (auto-audit)
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
              grandstand, building, tower, billboard, marshalPost, gantry,
              fence, guardrail, tyreWall, wall,
              forestEdge } = api;
      const K = (s) => Math.round(s * n) % n;

      // ---- Palette (Imola riverside parkland: rich greens, warm Italian earth, Santerno blues) ----
      const CANOPY2 = [0.17, 0.44, 0.19];
      const WOODS   = [0.10, 0.28, 0.14];
      const WOODS2  = [0.13, 0.32, 0.16];
      const BANK    = [0.44, 0.65, 0.28];
      const RIVER   = [0.26, 0.40, 0.54];
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
      // Tifosi-red crowd: Imola's grandstands are a sea of Ferrari red, so the
      // dominant crowd tone is warm red, with tricolour green/white accents.
      const CROWD_A = [0.74, 0.24, 0.20];   // Ferrari red dominant
      const CROWD_B = [0.66, 0.30, 0.26];   // brick red
      const CROWD_C = [0.70, 0.34, 0.24];   // warm red-orange
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

      // ---- Monte Castellaccio: forested hill INSIDE the loop ----
      // The infield is a wooded rise (downy oak + hornbeam), not flat tarmac.
      // Placed off the centroid toward the Acque Minerali side so it reads behind
      // the park trees rather than dead-centre. mountain() self-culls if it would
      // reach the ribbon, so keep it modest and well inside.
      {
        const mx = cx + (px[K(0.50)] - cx) * 0.42;
        const mz = cz + (pz[K(0.50)] - cz) * 0.42;
        mountain(mx, mz, pyMin, 150, 34,
                 { seg: 8, seed: 777, snowline: 2,
                   forest: [0.12, 0.30, 0.15], rock: [0.26, 0.36, 0.22], col: [0.15, 0.34, 0.18] });
      }

      // ---- SECTION-BY-SECTION TREELINE (no global full-circuit passes) ----
      // Each section is covered once per side at moderate density to stay within
      // SwiftShader budget for the 25-frame blank-scan test (180 s total).

      // Pit straight + Tamburello approach (wraps around 0)
      forestEdge(0.88, 1.00, -1, 5, { density: 0.45, hMin: 10, hMax: 16,
        col: [0.08, 0.24, 0.12], col2: [0.16, 0.40, 0.18], pineFrac: 0.60 });
      forestEdge(0.88, 1.00,  1, 8, { density: 0.40, hMin: 9, hMax: 14,
        col: [0.09, 0.26, 0.13], col2: [0.17, 0.40, 0.19], pineFrac: 0.45 });

      // Tamburello chicane through Villeneuve — mixed park broadleaf (holm/downy
      // oak, hornbeam) with cedars as tall accents only. The inside treeline is
      // split to leave a clearing (0.020–0.105) around the Senna memorial, and set
      // back to dist 18 so the woods frame it rather than bury it.
      forestEdge(0.00,  0.020, -1, 18, { density: 0.46, hMin: 11, hMax: 18,
        col: [0.10, 0.26, 0.12], col2: [0.18, 0.40, 0.20], pineFrac: 0.28 });
      forestEdge(0.105, 0.14,  -1, 18, { density: 0.46, hMin: 11, hMax: 18,
        col: [0.10, 0.26, 0.12], col2: [0.18, 0.40, 0.20], pineFrac: 0.28 });
      forestEdge(0.00, 0.14,  1, 5, { density: 0.38, hMin: 10, hMax: 16,
        col: WOODS, col2: [0.18, 0.40, 0.20], pineFrac: 0.22 });

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

      // Acque Minerali valley — the famous tree-lined park: mature mixed
      // broadleaf (downy oak, hornbeam, holm oak) with cedars as tall accents.
      forestEdge(0.42, 0.58, -1, 5, { density: 0.42, hMin: 12, hMax: 20,
        col: [0.10, 0.26, 0.12], col2: [0.18, 0.40, 0.20], pineFrac: 0.30 });
      forestEdge(0.42, 0.58,  1, 5, { density: 0.46, hMin: 13, hMax: 21,
        col: [0.09, 0.24, 0.11], col2: [0.20, 0.42, 0.20], pineFrac: 0.32 });
      // Warm ginkgo / liquidambar accents scattered through the park.
      for (let i = 0; i < 6; i++) {
        const f = 0.43 + i * 0.024;
        tree(K(f), (i % 2) ? 1 : -1, 14 + (i % 3) * 4, 13 + (i % 4), [0.55, 0.50, 0.18]);
      }

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

      // ---- Santerno river: a continuous channel hugging the Tamburello wall ----
      // The real Santerno runs immediately behind the bare concrete wall at
      // Tamburello (no tyre barrier). Modelled as a narrow water strip pressed
      // against the wall (side +1), a low grass embankment between, and a
      // tree-lined FAR bank of broadleaves so it reads as a riverbank, not a lake.
      const RIVER2 = [0.22, 0.36, 0.50];
      // Grass embankment hard against the wall.
      groundPlane(K(0.00), 1, 5, [10, 230], BANK);
      groundPlane(K(0.08), 1, 5, [10, 200], BANK);
      groundPlane(K(0.15), 1, 5, [10, 140], BANK);
      // The water channel just beyond the embankment, kept as a continuous run.
      groundPlane(K(0.00), 1, 16, [24, 230], RIVER);
      groundPlane(K(0.08), 1, 16, [22, 200], RIVER2);
      groundPlane(K(0.15), 1, 15, [20, 140], RIVER);
      // Far (outer) bank: a slim grass shoulder then a row of riverside broadleaves.
      groundPlane(K(0.00), 1, 41, [8, 230], BANK);
      for (let i = 0; i <= 10; i++) {
        const f = 0.005 + i * 0.014;
        tree(K(f), 1, 46 + (i % 3) * 4, 12 + (i % 4),
             (i % 3 === 0) ? [0.12, 0.30, 0.15] : (i % 3 === 1) ? [0.18, 0.40, 0.20] : [0.14, 0.34, 0.17]);
      }

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

      // (The lone Variante Alta campanile was removed — Imola's bell towers belong
      //  to the town cluster; the Rocca Sforzesca + church campanile now anchor the
      //  hillside-town silhouette near T1, see below.)

      // ---- Pit building + main grandstand ----
      building(K(0.00), -1, 1, 16, 11, 130, { wall: [0.58, 0.60, 0.63], window: WIN_LIT, floor: 5, lit: true });
      prop(K(0.01), -1, 7, [2.5, 1.6, 120], RED);
      grandstand(0.965, -1, 10, 90, [0.55, 0.58, 0.62], RED);
      grandstand(0.02,  1, 22, 80, [0.52, 0.55, 0.60], [0.78, 0.30, 0.22]);
      grandstand(0.93, -1, 10, 70, [0.55, 0.58, 0.62], RED);

      // ---- Tamburello chicane + Senna memorial ----
      groundPlane(K(0.05), -1, 8, [26, 30], BANK);
      place(K(0.05), -1, 2, [0.4, 0.3, 7], RED);
      place(K(0.06), -1, 2, [0.4, 0.3, 7], WHITE);
      // Tree-shaded clearing on the inside of Tamburello (the Parco delle Acque
      // Minerali). Park broadleaves set well BACK so they frame, not bury, the
      // memorial which sits in the open clearing closer to the track.
      tree(K(0.030), -1, 34, 14, [0.16, 0.38, 0.18]);
      tree(K(0.095), -1, 36, 15, [0.12, 0.30, 0.15]);
      tree(K(0.100), -1, 30, 13, [0.20, 0.42, 0.20]);
      // ---- Ayrton Senna seated bronze statue on a pale marble plinth ----
      // (Stefano Pierotti, 1997). Seated figure suggested from primitives:
      // marble plinth → hips/thighs → torso → head → bowed arms. Surrounded by
      // flowers/flags left by fans.
      {
        // Bronze reads warm/dark; a touch deeper so the figure separates from the
        // pale marble and the surrounding grass under the bright spring sun.
        const BRONZE  = [0.34, 0.24, 0.13];
        const BRONZE2 = [0.28, 0.20, 0.11];
        const MARBLE  = [0.88, 0.86, 0.82];
        const MARBLE2 = [0.82, 0.80, 0.76];
        const sm = anchor(K(0.06), -1, 10);
        const b = [sm.r, sm.u, sm.t];
        // The figure faces the track (+sm.t is "ahead" along the lap; the statue
        // looks across the road). All box `c` args are CENTRES.
        const F = (lat, fwd, up) => vadd(vadd(vadd(sm.c, sm.r, lat), sm.t, fwd), sm.u, up);
        // ---- Two-tier marble plinth: narrow so the figure dominates ----
        addBox(out, F(0, 0, 0.35), [1.1, 0.70, 1.1], MARBLE2, b);   // base block
        addBox(out, F(0, 0, 0.80), [0.85, 0.20, 0.85], MARBLE, b);  // cap slab
        const seat = 0.90;   // marble top — the figure sits here, knees forward (+t)
        // ---- Seated figure (~2.0 m tall incl. head) ----
        // Thighs flat on the seat, projecting forward.
        addBox(out, F(0, 0.22, seat + 0.13), [0.46, 0.24, 0.66], BRONZE, b);
        // Shins hanging down off the front edge.
        for (const sg of [-1, 1]) addBox(out, F(sg * 0.13, 0.52, seat - 0.22), [0.18, 0.62, 0.20], BRONZE2, b);
        // Pelvis / lower torso block sitting on the thighs.
        addBox(out, F(0, -0.04, seat + 0.42), [0.40, 0.34, 0.34], BRONZE, b);
        // Upper torso, leaning slightly forward (head bowed, contemplative).
        addBox(out, F(0, 0.05, seat + 0.78), [0.44, 0.46, 0.32], BRONZE, b);
        // Shoulders.
        addBox(out, F(0, 0.07, seat + 1.04), [0.56, 0.16, 0.30], BRONZE2, b);
        // Arms: upper arms down the sides, forearms reaching forward to rest on knees.
        for (const sg of [-1, 1]) {
          addBox(out, F(sg * 0.30, 0.07, seat + 0.78), [0.14, 0.40, 0.16], BRONZE2, b);  // upper arm
          addBox(out, F(sg * 0.26, 0.30, seat + 0.58), [0.14, 0.14, 0.40], BRONZE2, b);  // forearm to knee
        }
        // Neck + bowed head (head pitched forward over the chest).
        addCyl(out, F(0, 0.06, seat + 1.09), 0.10, 0.08, BRONZE, 7, b);
        addFrustum(out, F(0, 0.12, seat + 1.17), 0.19, 0.17, 0.24, BRONZE, 9, b);
        // ---- Tributes at the base: flowers, tricolour + Tifosi-red notes ----
        const accents = [
          [ 0.50, 0.42, RED], [-0.50, 0.46, [0.10, 0.45, 0.16]], [ 0.18, 0.60, WHITE],
          [-0.22, 0.56, RED], [ 0.00, 0.66, [0.86, 0.16, 0.14]], [ 0.34, 0.30, [0.92, 0.86, 0.30]],
        ];
        for (const [lat, fwd, col] of accents) addBox(out, F(lat, fwd, 0.85), [0.15, 0.22, 0.15], col, b);
        // Small Brazilian-flag accent on a thin pole, set back and to the side so
        // it frames rather than crosses the figure.
        const pole = vadd(vadd(sm.c, sm.t, -1.15), sm.r, -1.0);
        addCyl(out, pole, 0.04, 2.6, [0.30, 0.30, 0.32], 5, b);
        addBox(out, vadd(vadd(pole, sm.u, 2.2), sm.r, -0.48), [0.95, 0.6, 0.05], [0.10, 0.50, 0.22], b);
      }

      // ---- Villeneuve chicane kerbs + gravel trap ----
      groundPlane(K(0.12), -1, 5, [24, 30], GRAVEL);
      place(K(0.12), -1, 2, [0.4, 0.3, 7], RED);
      place(K(0.13), -1, 2, [0.4, 0.3, 7], WHITE);

      // ---- Tosa tight hairpin: grandstands + gravel ----
      grandstand(0.28, -1, 12, 60, [0.52, 0.55, 0.60], RED);
      grandstand(0.31, -1, 12, 50, [0.54, 0.57, 0.61], [0.20, 0.42, 0.72]);
      groundPlane(K(0.28), -1, 6, [34, 40], GRAVEL);
      // Roland Ratzenberger memorial — a modest stone stele with a bronze plaque,
      // at the Tosa hairpin infield (not his crash site, as in reality).
      {
        const rm = anchor(K(0.285), -1, 18);
        const rb = [rm.r, rm.u, rm.t];
        addBox(out, vadd(rm.c, rm.u, 0.20), [1.1, 0.40, 0.9], STONE2, rb);   // base
        addBox(out, vadd(rm.c, rm.u, 1.10), [0.7, 1.5, 0.30], STONE, rb);     // stele
        addBox(out, vadd(vadd(rm.c, rm.u, 1.25), rm.t, 0.16), [0.46, 0.66, 0.06], [0.40, 0.30, 0.18], rb); // bronze plaque
        addBox(out, vadd(vadd(rm.c, rm.u, 0.20), rm.t, 0.6), [0.30, 0.20, 0.30], RED, rb); // floral accent at base
      }

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

      // ---- Variante Bassa / pit approach: Santerno returns alongside the wall ----
      place(K(0.92), 1, 2, [0.4, 0.3, 7], RED);
      place(K(0.93), 1, 2, [0.4, 0.3, 7], WHITE);
      groundPlane(K(0.92), 1, 5,  [10, 120], BANK);
      groundPlane(K(0.92), 1, 16, [26, 120], RIVER);
      groundPlane(K(0.92), 1, 43, [8, 120], BANK);
      for (let i = 0; i <= 5; i++) {
        tree(K(0.905 + i * 0.013), 1, 48 + (i % 2) * 4, 12 + (i % 3),
             (i % 2) ? [0.18, 0.40, 0.20] : [0.13, 0.32, 0.16]);
      }

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
        // Rocca Sforzesca: the town's 14th-century crenellated stone fortress,
        // a stout battlemented keep with corner towers anchoring the skyline.
        const ROCCA = [0.74, 0.70, 0.60];
        const ROCCA2 = [0.68, 0.64, 0.55];
        const roccaFoot = vadd(vadd(vadd(base, t, -70), r, -64), u, 16);
        addBox(out, vadd(roccaFoot, u, 9), [22, 18, 22], ROCCA, [r, u, t]);        // keep body
        // Battlement merlons around the top edge (crenellation).
        for (let mi = -2; mi <= 2; mi++) {
          for (const sg of [-1, 1]) {
            addBox(out, vadd(vadd(vadd(roccaFoot, u, 19), t, mi * 4.4), r, sg * 10), [1.4, 2.4, 1.4], ROCCA2, [r, u, t]);
          }
        }
        // Four round corner towers, taller than the keep.
        for (const sr of [-1, 1]) for (const st of [-1, 1]) {
          const tf = vadd(vadd(roccaFoot, r, sr * 11), t, st * 11);
          addCyl(out, tf, 3.0, 26, ROCCA, 8, [r, u, t]);
          addCone(out, vadd(tf, u, 26), 3.6, 4.5, TERRA, 8, [r, u, t]);
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
      building(K(0.49), 1, 30, 20, 6, 16, { wall: PITWALL, window: WIN_LIT, floor: 3, roof: true, lit: true });
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
