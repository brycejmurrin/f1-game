/* Apex 26 — FUJI scenery (data only), split out of js/circuits/fuji.js.
   LAZY_SCENERY (tools/manifest.cjs): no <script> tag. game.js fetches the ONE
   circuit a session builds.

   Brief: docs/tracks/fuji.md. A conifer plateau on the eastern foothills of
   Mount Fuji; 2005-present layout, clockwise, infield +1. Two things identify
   the place and nothing else has to: the 1.475 km pit straight (s 0.00-0.25,
   ONE continuous built frontage, not a row of objects) and the volcano itself.

   Block -> §4 brief rows implemented:
     1  MAIN STRAIGHT, PIT SIDE ........ 0.005 +1 12   0.960 +1 15
     2  MAIN STRAIGHT, GRANDSTAND WALL . 0.005 -1 20   0.060 -1 26
     3  START GANTRY & SCREENS ......... 0.060 -1 26
     4  MOUNT FUJI ..................... 0.120 --  900
     5  PADDOCK, HOTEL & MUSEUM ........ 0.150 +1 40
     6  TURN 1 / TGR / 75R ............. 0.230 -1 18   0.250 -1 14   0.282 +1 16
     7  COCA-COLA & TOYOPET ............ 0.372 -1 20   0.412 +1 24
     8  ADVAN & 120R ................... 0.470 -1 22   0.525 +1 30
     9  300R ........................... 0.707 -1 28
     10 DUNLOP HAIRPIN ................. 0.739 +1 12
     11 THE 30R/45R FLICK .............. 0.808 -1 18
     12 GR SUPRA & PANASONIC ........... 0.877 +1 16   0.897 -1 14
     13 CEDAR PLATEAU (global forest)
     14 BARRIERS, POSTS, CAMERAS (global furniture)                         */
"use strict";
(window.TrackScenery = window.TrackScenery || {})["fuji"] =
  function (api) {
      const { n, hash, every, anchor, onTrack, K, lapBounds, pyMin,
        tree, pine, bush, hedge, forestEdge,
        building, tower, motorhome, broadcastCompound, cameraTower,
        grandstandEx, terrace, bleacher, spectatorHill, scaffoldStand,
        guardrail, fence, tyreWall, marshalPost, gantry,
        billboard, sponsorHoarding, groundPatch, prop, backdrop,
        mountain } = api;

      // ── palette ──────────────────────────────────────────────────────────
      // Sugi cedar: dark and blue-shifted, not European park green.
      const SUGI    = [0.12, 0.27, 0.19];
      const SUGI_D  = [0.09, 0.21, 0.16];
      const SUGI_L  = [0.16, 0.33, 0.22];
      const SCRUB   = [0.19, 0.30, 0.19];
      // Modern dark-clad paddock.
      const CLAD    = [0.15, 0.16, 0.19];
      const CLAD_L  = [0.24, 0.25, 0.29];
      const GLASS   = [0.30, 0.42, 0.52];
      const STEEL   = [0.74, 0.76, 0.79];
      const CONC    = [0.66, 0.66, 0.64];
      const GRAVEL  = [0.56, 0.53, 0.47];
      const RAIL    = [0.78, 0.78, 0.80];

      const W = (s) => ((s % 1) + 1) % 1;              // wrap a lap fraction
      const TOTAL = 4554;                              // lap metres (def.lengthKm)
      const SM = 1 / TOTAL;                            // metres -> lap fraction
      // Walk a stretch of lap in metre steps, wrapping through s = 0.
      const run = (s0, lenM, stepM, fn) => {
        const cnt = Math.max(1, Math.round(lenM / stepM));
        for (let i = 0; i < cnt; i++) fn(W(s0 + (i + 0.5) * stepM * SM), i, cnt);
      };

      // 1. THE MAIN STRAIGHT — PIT SIDE (+1)  [0.005 +1 12 · 0.960 +1 15]
      //    1.475 km of ONE dark-clad block: garages, then the control tower,
      //    closing the loop at pit exit. Built as abutting units so the eye
      //    reads a frontage, not a sequence of sheds.
      const GAR_S = 0.962, GAR_LEN = 1330, GAR_STEP = 38;
      run(GAR_S, GAR_LEN, GAR_STEP, (s, i) => {
        const k = K(s), h = hash(i * 7.3);
        // Garage box: w is the RADIAL depth, d the length down the road.
        building(k, 1, 12, 13, 8.4 + h * 0.5, GAR_STEP * 0.97,
          { wall: i % 2 ? CLAD : CLAD_L, window: GLASS, floor: 4.2, lit: false });
        // Second storey / hospitality deck set back behind it.
        if (i % 2 === 0)
          building(k, 1, 27, 11, 12.6, GAR_STEP * 1.9,
            { wall: CLAD_L, window: GLASS, floor: 4.0, lit: false });
      });
      // Continuous fascia band along the garage roofline + the pit wall.
      run(GAR_S, GAR_LEN, 48, (s) => {
        prop(K(s), 1, 11.4, [1.1, 1.6, 47], CLAD);          // roof fascia
        prop(K(s), 1, 5.4, [0.5, 1.05, 47], [0.80, 0.80, 0.83]);  // pit wall
      });
      // The modern control tower over the start line, and the timing block.
      tower(K(0.028), 1, 30, 15, 36,
        { col: CLAD_L, glassCol: GLASS, deckCol: CLAD, cap: true, capCol: CLAD, seg: 8 });
      building(K(0.012), 1, 27, 14, 17, 46,
        { wall: CLAD, window: GLASS, floor: 4.0, lit: false });

      // 2. THE MAIN STRAIGHT — GRANDSTAND WALL (-1)  [0.005 -1 20 · 0.060 -1 26]
      //    Capacity 110,000. A continuous two-tier wall of seating down the
      //    whole straight, with an open bank behind it for mass.
      run(0.968, 1360, 152, (s, i) => {
        grandstandEx(s, -1, 20, 150, null, null,
          { tiers: 2, h: 15, roof: "cantilever", roofCol: [0.30, 0.31, 0.35],
            fasciaCol: i % 2 ? CLAD : CLAD_L });
      });
      run(0.985, 1180, 240, (s) => {
        const lo = W(s - 118 * SM), hi = W(s + 118 * SM);
        terrace(lo, hi, -1, 47, { rows: 9, rise: 1.55, depth: 2.7, density: 0.5,
          conc: CONC, concAlt: [0.58, 0.58, 0.56] });
      });
      // Back-of-house behind the seating wall: dark sheds and a service road.
      run(0.98, 1200, 150, (s, i) => {
        building(K(s), -1, 82, 16, 9 + hash(i * 3.1) * 3, 74,
          { wall: i % 2 ? CLAD_L : [0.34, 0.35, 0.37], window: GLASS, lit: false });
      });
      sponsorHoarding(0.965, 0.235, -1, 13.5, { h: 1.25, step: 9 });
      sponsorHoarding(0.975, 0.230, 1, 8.0, { h: 1.15, step: 9 });

      // 3. START GANTRY AND THE BIG SCREENS OVER THE STRAIGHT  [0.060 -1 26]
      gantry(0.004, 7.6, STEEL);
      gantry(0.128, 7.4, STEEL);
      gantry(0.232, 7.4, STEEL);
      for (const s of [0.040, 0.100, 0.180]) {
        billboard(K(s), -1, 30, 24, 11, [0.06, 0.07, 0.09], { style: "monopole" });
      }
      for (const s of [0.070, 0.150]) {
        billboard(K(s), 1, 46, 20, 9, [0.08, 0.09, 0.11], { style: "monopole" });
      }
      cameraTower(K(0.008), -1, 34, { h: 13 });
      cameraTower(K(0.120), -1, 34, { h: 12 });

      // 4. MOUNT FUJI  [0.120 — 900]
      //    The identifying object of the whole place: ONE very large, very
      //    distant snow-capped cone on the WESTERN skyline, dominating the
      //    view back down the straight. World XZ, so walk the straight's
      //    outboard normal out onto the horizon rather than guessing a bearing.
      const fA = anchor(K(0.120), -1, 0), fB = anchor(K(0.120), -1, 100);
      const ux = (fB.c[0] - fA.c[0]) / 100, uz = (fB.c[2] - fA.c[2]) / 100;
      const tx = fA.t[0], tz = fA.t[2];
      const FAR = 9400;
      const fx = fA.c[0] + ux * FAR, fz = fA.c[2] + uz * FAR;
      mountain(fx, fz, pyMin - 46, 6400, 1760, {
        seg: 28, seed: 11, rough: 0.085, snowline: 0.55,
        snow: [0.95, 0.96, 1.00], rock: [0.33, 0.32, 0.36], forest: [0.14, 0.24, 0.20],
      });
      // Foothills flanking it, low and dark, so the cone reads as the big one.
      for (const [along, dOut, w, h, sd] of [
        [-4200, 7200, 1500, 250, 3], [3900, 7000, 1350, 210, 5],
        [-7600, 6400, 1250, 180, 8], [7400, 6600, 1100, 165, 2],
      ]) {
        mountain(fA.c[0] + ux * dOut + tx * along, fA.c[2] + uz * dOut + tz * along,
          pyMin - 34, w, h,
          { seg: 12, seed: sd, rough: 0.30, snowline: 1.4,
            forest: [0.13, 0.22, 0.18], rock: [0.30, 0.30, 0.31] });
      }
      // A low hazed ring of forested foothills closing the rest of the horizon.
      {
        const { cx, cz, radius } = lapBounds();
        for (let i = 0; i < 18; i++) {
          const h = hash(i * 13.9), a = (i + h * 0.5) / 18 * 6.2832;
          const rr = radius + 780 + h * 420;
          mountain(cx + Math.cos(a) * rr, cz + Math.sin(a) * rr, pyMin - 16,
            420 + h * 260, 78 + h * 62,
            { seg: 8, seed: i * 5 + 3, rough: 0.36, snowline: 1.6,
              forest: [0.13 + h * 0.03, 0.24 + h * 0.05, 0.19], rock: [0.30, 0.31, 0.30] });
        }
      }

      // 5. PADDOCK, THEN THE HOTEL AND MOTORSPORTS MUSEUM  [0.150 +1 40]
      run(0.030, 620, 52, (s, i) => {
        motorhome(K(s), 1, 44, 9, 4.6, 16,
          { accent: i % 3 === 0 ? [0.72, 0.16, 0.16] : CLAD_L, roof: true });
      });
      broadcastCompound(K(0.088), 1, 62, { vans: 6, dishes: 3, spacing: 9 });
      // The 2022 hotel + museum block on the west side of the complex: a
      // distant built mass, not roadside detail.
      building(K(0.150), 1, 118, 34, 26, 96, { wall: CLAD, window: GLASS, floor: 3.8, lit: false });
      building(K(0.178), 1, 124, 30, 20, 74, { wall: CLAD_L, window: GLASS, floor: 3.8, lit: false });
      building(K(0.196), 1, 150, 26, 15, 60, { wall: [0.38, 0.39, 0.41], window: GLASS, lit: false });
      for (const s of [0.058, 0.112, 0.168])
        groundPatch(K(s), 1, 40, [34, 0.16, 46], [0.30, 0.31, 0.33]);   // paddock tarmac

      // 6. TURN 1 — TGR CORNER (27R) AND 75R
      //    [0.230 -1 18 · 0.250 -1 14 · 0.282 +1 16]
      //    The prime overtaking spot: a stand over the braking zone, then wide
      //    tarmac run-off, a low bank and the first cedar rank beyond it.
      grandstandEx(0.230, -1, 18, 190, null, null,
        { tiers: 2, h: 14, roof: "cantilever", roofCol: [0.30, 0.31, 0.35], fasciaCol: CLAD });
      grandstandEx(0.208, -1, 19, 120, null, null,
        { tiers: 1, h: 11, roofCol: [0.32, 0.33, 0.37], fasciaCol: CLAD_L });
      cameraTower(K(0.244), -1, 30, { h: 14 });
      for (const s of [0.246, 0.256, 0.266]) groundPatch(K(s), -1, 15, [26, 0.18, 30], GRAVEL);
      spectatorHill(0.252, 0.300, -1, 30, { rows: 6, rise: 1.5, depth: 3.0, grass: SCRUB, density: 0.4 });
      forestEdge(0.255, 0.310, -1, 46, { hMin: 13, hMax: 23, col: SUGI, col2: SUGI_D, pineFrac: 0.9, density: 0.2 });
      tyreWall(0.243, 0.268, -1, 13, [0.86, 0.20, 0.16]);
      // 75R drops away from the stands and the cedar closes in on the inside.
      forestEdge(0.272, 0.320, 1, 16, { hMin: 12, hMax: 21, col: SUGI, col2: SUGI_L, pineFrac: 0.9, density: 0.25 });
      hedge(0.272, 0.318, 1, 12, 1.5, SCRUB);
      marshalPost(K(0.262), -1, 13);

      // 7. COCA-COLA CORNER (80R) AND TOYOPET (100R)
      //    [0.372 -1 20 · 0.412 +1 24]
      sponsorHoarding(0.345, 0.400, -1, 12, { h: 1.3, step: 8 });
      terrace(0.358, 0.392, -1, 20, { rows: 7, rise: 1.5, depth: 2.7, density: 0.42, conc: CONC });
      bleacher(0.398, 0.418, -1, 22, { rows: 6, rise: 1.35, density: 0.32 });
      forestEdge(0.320, 0.372, -1, 34, { hMin: 13, hMax: 24, col: SUGI, col2: SUGI_D, pineFrac: 0.92, density: 0.2 });
      // Fully onto the conifer plateau: dense sugi both sides.
      forestEdge(0.325, 0.470, 1, 24, { hMin: 14, hMax: 25, col: SUGI, col2: SUGI_D, pineFrac: 0.94, density: 0.25 });
      forestEdge(0.400, 0.470, -1, 26, { hMin: 14, hMax: 25, col: SUGI_D, col2: SUGI, pineFrac: 0.94, density: 0.22 });
      marshalPost(K(0.372), -1, 13);
      marshalPost(K(0.418), 1, 13);

      // 8. ADVAN CORNER (30R) AND 120R  [0.470 -1 22 · 0.525 +1 30]
      //    Tight right with gravel on the outside; then 120R sweeping through
      //    the forest at its densest.
      for (const s of [0.468, 0.478, 0.488]) groundPatch(K(s), -1, 14, [24, 0.18, 28], GRAVEL);
      tyreWall(0.464, 0.492, -1, 20, [0.86, 0.20, 0.16]);
      forestEdge(0.470, 0.530, -1, 30, { hMin: 15, hMax: 27, col: SUGI_D, col2: SUGI, pineFrac: 0.95, density: 0.25 });
      forestEdge(0.505, 0.600, 1, 30, { hMin: 16, hMax: 28, col: SUGI, col2: SUGI_D, pineFrac: 0.95, density: 0.3 });
      forestEdge(0.530, 0.620, -1, 24, { hMin: 15, hMax: 27, col: SUGI, col2: SUGI_L, pineFrac: 0.95, density: 0.3 });
      // A second rank further back, so the wall of cedar has depth.
      forestEdge(0.480, 0.640, 1, 62, { hMin: 17, hMax: 30, col: SUGI_D, col2: SUGI, pineFrac: 0.96, density: 0.2 });
      forestEdge(0.480, 0.640, -1, 58, { hMin: 17, hMax: 30, col: SUGI_D, col2: SUGI, pineFrac: 0.96, density: 0.2 });
      marshalPost(K(0.478), -1, 13);
      marshalPost(K(0.540), 1, 13);

      // 9. 300R — LONG FAST RIGHT  [0.707 -1 28]
      //    The trees pull back for run-off and the mountain reappears over the
      //    treeline on the western side: no tall rank inside 60 m here.
      for (const s of [0.690, 0.702, 0.714]) groundPatch(K(s), -1, 16, [30, 0.18, 34], GRAVEL);
      spectatorHill(0.672, 0.724, -1, 28, { rows: 5, rise: 1.4, depth: 3.2, grass: SCRUB, density: 0.3 });
      forestEdge(0.640, 0.690, -1, 64, { hMin: 12, hMax: 20, col: SUGI_D, col2: SUGI, pineFrac: 0.9, density: 0.18 });
      forestEdge(0.726, 0.760, -1, 58, { hMin: 12, hMax: 20, col: SUGI_D, col2: SUGI, pineFrac: 0.9, density: 0.18 });
      forestEdge(0.640, 0.735, 1, 26, { hMin: 15, hMax: 26, col: SUGI, col2: SUGI_D, pineFrac: 0.95, density: 0.25 });
      cameraTower(K(0.706), -1, 36, { h: 13 });
      marshalPost(K(0.712), -1, 15);

      // 10. DUNLOP CORNER (15R) — the hairpin, slowest point of the lap
      //     [0.739 +1 12]
      marshalPost(K(0.739), 1, 12);
      tyreWall(0.730, 0.756, 1, 12, [0.90, 0.72, 0.10]);
      tyreWall(0.728, 0.758, -1, 15, [0.86, 0.20, 0.16]);
      for (const s of [0.734, 0.746]) groundPatch(K(s), -1, 16, [22, 0.18, 26], GRAVEL);
      bleacher(0.726, 0.752, 1, 24, { rows: 6, rise: 1.35, density: 0.35 });
      scaffoldStand(0.734, 0.756, -1, 30, { rows: 7, rise: 1.4, density: 0.3 });
      billboard(K(0.742), 1, 20, 14, 5, [0.90, 0.74, 0.10], { style: "monopole" });

      // 11. THE 30R/45R FLICK — tree-lined and enclosed  [0.808 -1 18]
      forestEdge(0.762, 0.860, -1, 18, { hMin: 15, hMax: 27, col: SUGI, col2: SUGI_D, pineFrac: 0.95, density: 0.3 });
      forestEdge(0.762, 0.860, 1, 20, { hMin: 15, hMax: 27, col: SUGI_D, col2: SUGI, pineFrac: 0.95, density: 0.3 });
      forestEdge(0.766, 0.858, -1, 48, { hMin: 17, hMax: 30, col: SUGI_D, col2: SUGI, pineFrac: 0.96, density: 0.2 });
      hedge(0.770, 0.856, -1, 13, 1.7, SCRUB);
      marshalPost(K(0.808), -1, 14);

      // 12. GR SUPRA (25R) AND PANASONIC (12R)
      //     [0.877 +1 16 · 0.897 -1 14]
      //     The lap turns back toward the paddock, then the final slow right
      //     onto the straight with the grandstand wall resuming outside it.
      building(K(0.877), 1, 26, 14, 9, 44, { wall: CLAD_L, window: GLASS, lit: false });
      building(K(0.898), 1, 30, 13, 11, 52, { wall: CLAD, window: GLASS, lit: false });
      building(K(0.920), 1, 34, 15, 8, 40, { wall: [0.36, 0.37, 0.39], window: GLASS, lit: false });
      groundPatch(K(0.905), 1, 22, [34, 0.16, 44], [0.30, 0.31, 0.33]);
      marshalPost(K(0.880), 1, 14);
      grandstandEx(0.897, -1, 14, 150, null, null,
        { tiers: 1, h: 12, roofCol: [0.31, 0.32, 0.36], fasciaCol: CLAD });
      grandstandEx(0.930, -1, 16, 160, null, null,
        { tiers: 2, h: 14, roofCol: [0.30, 0.31, 0.35], fasciaCol: CLAD_L });
      terrace(0.886, 0.944, -1, 42, { rows: 8, rise: 1.5, depth: 2.7, density: 0.45, conc: CONC });
      tyreWall(0.888, 0.912, -1, 12, [0.86, 0.20, 0.16]);
      cameraTower(K(0.896), -1, 32, { h: 12 });

      // 13. THE CEDAR PLATEAU — ranks, not scatter. Tall, narrow, dark sugi at
      //     two distances over the whole back three quarters; the straight is
      //     built frontage and stays clear.
      every(22, (k) => {
        const f = k / n;
        if (f < 0.245 || f > 0.965) return;
        const h = hash(k * 17.3);
        if (h < 0.22) return;
        for (const side of [-1, 1]) {
          const near = 30 + h * 20 + (side < 0 ? 5 : 0);
          const far = 78 + hash(k * 5.1 + side) * 54;
          for (const dist of [near, far]) {
            const a = anchor(k, side, dist);
            if (onTrack(a.c[0], a.c[2], 9)) continue;
            pine(k, side, dist, 15 + h * 12, h < 0.5 ? SUGI : SUGI_D, { slim: true });
          }
          if (h > 0.7) tree(k, side, near + 12, 9 + h * 5, SUGI_L);
          if (h > 0.82) bush(k, side, near - 10, SCRUB);
        }
      });
      // Hazed cedar backdrop mass well beyond the ranks.
      for (let i = 0; i < 22; i++) {
        const f = 0.25 + (i / 22) * 0.71, k = K(f), h = hash(i * 9.7);
        backdrop(k, i % 2 ? -1 : 1, 260 + h * 120,
          [90 + h * 50, 30 + h * 20, 70 + h * 30],
          [0.15 + h * 0.03, 0.27 + h * 0.05, 0.21 + h * 0.03]);
      }

      // 14. BARRIERS, POSTS AND CAMERAS — the continuous furniture pass.
      for (const side of [-1, 1]) {
        guardrail(0.0, 1.0, side, 11, RAIL);
        fence(0.25, 0.97, side, 14.5, 2.4, [0.62, 0.63, 0.66]);
      }
      fence(0.965, 0.240, -1, 16.0, 2.6, [0.62, 0.63, 0.66]);
      for (let i = 0; i < 10; i++) {
        const f = (i + 0.5) / 10;
        if (f > 0.02 && f < 0.23) continue;            // the straight has its own
        marshalPost(K(f), i % 2 ? 1 : -1, 13);
      }
  };
