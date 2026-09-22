/* Apex 26 — JEREZ scenery (data only), split out of js/circuits/jerez.js.
   LAZY_SCENERY (tools/manifest.cjs): no <script> tag.

   Brief: docs/tracks/jerez.md. Dry Andalusian country outside Jerez de la
   Frontera — bleached ochre earth, olive-grey scrub, hard high-contrast light,
   pale concrete terracing as the one built landmark. The outfield stays open:
   the horizon is visible almost everywhere, and there is NEVER a continuous
   tree line. Every spectatorHill here overrides the emitter's default GREEN
   `grass` with ochre earth, and every terrace overrides `conc`/`concAlt` with
   sun-bleached pale concrete — the defaults are northern-European and read
   flatly wrong under this sun.

   Block -> brief §4 row map (s, side, dist):
     1  palette + helpers                      (§2 palette, §6 modelling notes)
     2  0.005  -1 20  main start/finish terracing, roofless but one covered bay
     3  0.010  +1  8  pit + paddock block (the only dense built mass)
     4  0.045  -1 32  Expo '92 braking zone: terrace steps + spectator hill
     5  0.0663 +1 14  T1 Curva Expo '92 infield apex (nothing tall)
     6  0.110  -1 45  open country T1 -> Michelin, loose olive scatter
     7  0.1447 -1 24  Curva Michelin stand complex running toward Sito Pons
     8  0.3043 -1 38  T4, start of the climb: natural banking, no seating
     9  0.3563 +1 18  Curva Sito Pons broadcast compound
    10  0.3842 -1 22  Curva Dry Sack, highest point of the lap
    11  0.460  +1 50  descent ridges away from Dry Sack (§3 elevation)
    12  0.5228 -1 28  Turn 7 left, standing room only
    13  0.6300 -1 65  far outfield: olive field rows + one white farm
    14  0.7123 -1 26  Curva Angel Nieto, terracing returns
    15  0.8417 -1 22  Peluqui, into the stadium bowl
    16  0.9177 -1 20  Curva Ferrari, terracing unbroken from Peluqui
    17  0.9517 +1 12  final right onto the pit straight
    18  circuit-wide: guardrail, marshal posts, sparse scrub, start gantry

   Every stand block also carries its BACK-OF-HOUSE (§4 gives the trackside
   face only): concourse apron, kiosk line, flag masts, a service block and the
   dusty spectator park behind it. That depth is what stops 150 m of terracing
   reading as a cardboard flat on empty ground, and a parked car is 24 verts.
   Everything placed past the barriers is clearance-checked here (clear(),
   scrub(), carPark(), kiosks()) rather than left to the scenery guard to cull:
   this infield folds back across itself, so a flat distance walks onto tarmac
   several times a lap. Keep it that way — verify-track must read
   `suppressed 0, invalid 0` with NO guard-drop line. */
"use strict";
(window.TrackScenery = window.TrackScenery || {})["jerez"] =
  function (api) {
      const { n, hash, every, anchor, onTrack, terrainYAt,
        tree, palm, bush, building, tower, grandstandEx,
        spectatorHill, terrace, guardrail, fence, tyreWall, marshalPost,
        cameraTower, broadcastCompound, billboard, sponsorHoarding, gantry,
        motorhome, groundPatch, runoffApron, place, ridge,
        modelGroup, vadd, addBox, addCyl, addFrustum, MAT } = api;

      // ---------------------------------------------------------------
      // 1. PALETTE + HELPERS  (§2 bleached, §6 sparse olive / pale concrete)
      // ---------------------------------------------------------------
      const { K } = api;            // the contract's frac -> node index (normalised for negatives)

      const OCHRE      = [0.74, 0.64, 0.45];   // bare pale earth
      const OCHRE_PALE = [0.82, 0.73, 0.55];   // sun-struck dust
      const DUST       = [0.67, 0.57, 0.40];
      const TARMAC     = [0.34, 0.33, 0.32];   // paddock apron
      const CONC       = [0.82, 0.80, 0.74];   // bleached terracing
      const CONC_ALT   = [0.73, 0.71, 0.65];
      const WHITEWASH  = [0.92, 0.90, 0.84];   // Andalusian farm white
      const OLIVE      = [0.34, 0.37, 0.26];   // olive canopy
      const OLIVE_D    = [0.28, 0.31, 0.22];
      const SCRUB      = [0.45, 0.45, 0.32];   // low grey-green scrub
      const ARMCO      = [0.80, 0.80, 0.82];
      const TYRE_CAP   = [0.86, 0.34, 0.18];

      // Bleached-earth terracing / banking option blocks, reused everywhere.
      const TERR  = { conc: CONC, concAlt: CONC_ALT, rows: 10, rise: 1.45, depth: 2.5 };
      const TERR_LO = { conc: CONC, concAlt: CONC_ALT, rows: 6, rise: 1.4, depth: 2.5 };
      const HILL  = { grass: OCHRE, riser: DUST, rows: 5, rise: 1.2, density: 0.45 };
      const HILL_BARE = { grass: OCHRE, riser: DUST, rows: 4, rise: 1.1, density: 0.06 };
      // groundPatch wants a vec3; these are flat slabs of bare earth, not grass.
      const slab = (w, d) => [w, 0.16, d];

      // A single olive: short, wide, never in a rank.
      const olive = (k, side, dist, h) =>
        tree(k, side, dist, h, hash(k * 7 + dist) < 0.5 ? OLIVE : OLIVE_D);

      // Scrub that never argues with the guard. Jerez's infield folds back on
      // itself, so a scatter written as a flat distance walks onto tarmac in
      // three or four places a lap and the guard silently drops it. Try the
      // wanted distance, then step outward; give up rather than be dropped.
      const scrub = (k, side, dist, col) => {
        for (let j = 0; j < 4; j++) {
          const d = dist + j * 12;
          const a = anchor(k, side, d);
          if (onTrack(a.c[0], a.c[2], 10)) continue;
          bush(k, side, d, col || SCRUB);
          return;
        }
      };

      // One metre in lap fracs (~4.43 km lap) — the concourse rows below are
      // written in metres because that is how a car park is spaced. Node
      // spacing is coarser than a car, so ranks step 6.5 m along the track.
      const M = 1 / 4430;

      const clear = (k, side, dist, m) => {
        const a = anchor(k, side, dist);
        return !onTrack(a.c[0], a.c[2], m === undefined ? 10 : m);
      };

      // Dusty spectator car park — the thing that is ACTUALLY behind terracing
      // in Andalusia, and 24 verts a car. Hash-gapped so it never reads as a
      // grid, and every car is clearance-checked rather than left to the guard.
      const CAR = [[0.85, 0.85, 0.86], [0.70, 0.69, 0.68], [0.52, 0.14, 0.12],
                   [0.22, 0.25, 0.31], [0.86, 0.82, 0.58], [0.33, 0.34, 0.36]];
      const carPark = (f0, side, d0, cols, ranks, seed) => {
        for (let i = 0; i < cols; i++) {
          const k = K(f0 + i * 6.5 * M);
          for (let r = 0; r < ranks; r++) {
            const d = d0 + r * 6;
            const h = hash(i * 17 + r * 83 + seed);
            if (h < 0.22) continue;                 // a car park is never full
            if (!clear(k, side, d, 11)) continue;
            place(k, side, d, [4.6, 1.5, 2.2], CAR[(i + r * 2 + seed) % 6]);
          }
        }
      };

      // Concourse kiosks / catering cabins behind a stand: white and pale sand,
      // jittered off the concourse line.
      const kiosks = (f0, side, dist, count, seed) => {
        for (let i = 0; i < count; i++) {
          const k = K(f0 + i * 17 * M);
          const h = hash(i * 29 + seed);
          if (h < 0.18) continue;
          const d = dist + h * 4;
          if (!clear(k, side, d, 11)) continue;
          place(k, side, d, [3.6, 2.9, 3.2],
            h < 0.55 ? WHITEWASH : [0.87, 0.83, 0.71]);
        }
      };

      // ---------------------------------------------------------------
      // RE-KEYED THROUGH sl(). The start line moved onto a straight (def
      // startFrac) because the grid had been laid through a 43 m corner, and
      // sceneryStartFrac holds the rest of this file on its real corners —
      // Dry Sack and the stadium section must not travel with the line. The
      // pit complex and its terracing belong AT the line, so these two blocks
      // alone are shifted; sl(f) is the authored frac that lands at the line.
      // 1 - def._sceneryShift, baked by buildCenterline before scenery() runs, at
      // the 4 dp the props were placed against (a literal 0.1264 until 2026-09-22:
      // the unrounded value flips a few K() nodes at Brands Hatch, so the rounding
      // keeps today's geometry while a retuned startFrac still moves the props).
      const SL = Math.round((1 - api.def._sceneryShift) * 1e4) / 1e4;
      const sl = (f) => (f + SL) % 1;

      // 2. MAIN START/FINISH TERRACING  (0.005, -1, 20)
      //    A long pale-concrete run facing the pit lane, ROOFLESS for most of
      //    its length with one covered centre bay over the line; hoarding
      //    along the full base, armco at the track edge, a camera mast at
      //    each end.
      // ---------------------------------------------------------------
      grandstandEx(sl(0.0000), -1, 20, 130, null, null,
        { roof: "flat", roofCol: CONC, fasciaCol: CONC_ALT, tiers: 2, h: 14 });
      grandstandEx(sl(0.9600), -1, 20, 110, null, null,
        { roof: "none", fasciaCol: CONC_ALT, h: 12 });
      grandstandEx(sl(0.0340), -1, 20, 110, null, null,
        { roof: "none", fasciaCol: CONC_ALT, h: 12 });
      terrace(sl(0.9180), sl(0.9520), -1, 19, TERR);
      sponsorHoarding(sl(0.9350), sl(0.0620), -1, 13);
      guardrail(sl(0.9300), sl(0.0700), -1, 10, ARMCO);
      cameraTower(K(sl(0.9430)), -1, 17);
      cameraTower(K(sl(0.0560)), -1, 17);
      groundPatch(K(sl(0.0050)), -1, 15, slab(26, 150), OCHRE_PALE);
      billboard(K(sl(0.0020)), -1, 25, 20, 6, [0.86, 0.84, 0.78]);
      //   ... and what is BEHIND it. A stand on bleached nothing reads like a
      //   model on a table, so the outfield gets the concourse it feeds from:
      //   dust apron, kiosk line, two flag masts, a services block, then the
      //   spectator park out on the flat.
      groundPatch(K(sl(0.0050)), -1, 58, slab(56, 260), DUST);
      kiosks(sl(0.9560), -1, 52, 12, 5);
      tower(K(sl(0.9700)), -1, 50, 1.1, 15);
      tower(K(sl(0.0400)), -1, 50, 1.1, 15);
      building(K(sl(0.9880)), -1, 57, 14, 5.5, 26,   // services block; the
        { wall: WHITEWASH, roof: [0.55, 0.34, 0.24] }); // road returns at ~60
      carPark(sl(0.9620), -1, 78, 26, 4, 3);

      // ---------------------------------------------------------------
      // 3. PIT + PADDOCK BLOCK  (0.010, +1, 8)
      //    The only dense built mass on the circuit: a low flat-roofed garage
      //    row, the taller control tower above the grid, motorhome rows
      //    behind, armco on the pit-wall line.
      // ---------------------------------------------------------------
      guardrail(sl(0.9300), sl(0.0720), 1, 8, ARMCO);
      groundPatch(K(sl(0.0050)), 1, 10, slab(44, 200), TARMAC);
      for (let i = 0; i < 10; i++) {                        // garage row
        const s = sl(0.9540 + i * 0.0080);
        building(K(s), 1, 11, 20, 7.5, 14,
          { wall: WHITEWASH, roof: [0.62, 0.60, 0.57] });
      }
      building(K(sl(0.0120)), 1, 12, 24, 16, 16,
        { wall: CONC, roof: [0.55, 0.54, 0.52] });          // control tower
      tower(K(sl(0.0100)), 1, 36, 6, 24);
      // Motorhomes belong to the paddock, so they key through sl() like the
      // rest of this block (they were left raw by the re-key and parked
      // themselves half a lap away, out in the T4 infield). Both rows now sit
      // INSIDE the perimeter fence: past ~46 m the guard eats them.
      for (let i = 0; i < 8; i++)                           // paddock motorhomes
        motorhome(K(sl(0.9730 + i * 0.0068)), 1, 27, 11, 4.4, 17,
          { wall: [0.86 + hash(i * 13) * 0.08, 0.86, 0.88] });
      for (let i = 0; i < 6; i++)
        motorhome(K(sl(0.9800 + i * 0.0068)), 1, 39, 10, 4.2, 15,
          { wall: [0.80 + hash(i * 29) * 0.12, 0.80, 0.82] });
      // Paddock perimeter. Jerez's infield is only ~45 m deep here before the
      // circuit folds back across it, so the fence hugs the motorhome rows
      // instead of standing off at paddock-boundary distance; anything past
      // ~46 m is culled as on-track for two thirds of the pit straight.
      fence(sl(0.9600), sl(0.0440), 1, 44, 3, CONC_ALT);
      for (let i = 0; i < 9; i++) {                        // freight containers
        const k = K(sl(0.9660 + i * 0.0060));
        if (!clear(k, 1, 20, 10)) continue;
        place(k, 1, 20, [2.6, 2.6, 6.0],
          hash(i * 7) < 0.5 ? [0.72, 0.70, 0.66] : [0.64, 0.62, 0.58]);
      }
      palm(K(sl(0.0060)), 1, 22, 12, OLIVE_D);             // paddock gate
      palm(K(sl(0.0180)), 1, 22, 11, OLIVE);
      groundPatch(K(sl(0.0050)), 1, 28, slab(46, 190), DUST);

      // ---------------------------------------------------------------
      // 4. EXPO '92 BRAKING ZONE  (0.045, -1, 32)
      //    Open terrace steps cut into the natural rise with the hill
      //    continuing behind them, one camera mast. Bare pale ochre ground —
      //    groundPatch, not grass.
      // ---------------------------------------------------------------
      terrace(0.0280, 0.0620, -1, 30, TERR_LO);
      spectatorHill(0.0240, 0.0680, -1, 52, HILL);
      cameraTower(K(0.0475), -1, 26);
      groundPatch(K(0.0400), -1, 12, slab(22, 120), OCHRE);
      groundPatch(K(0.0520), -1, 36, slab(40, 110), DUST);
      runoffApron(K(0.0520), -1, 11, 34, OCHRE_PALE);
      for (let i = 0; i < 7; i++)
        scrub(K(0.0230 + i * 0.0055), -1, 86 + hash(i * 19) * 20, SCRUB);
      kiosks(0.0300, -1, 60, 7, 11);                        // behind the steps
      carPark(0.0300, -1, 78, 16, 3, 7);
      groundPatch(K(0.0420), -1, 84, slab(52, 150), DUST);

      // ---------------------------------------------------------------
      // 5. T1 — CURVA EXPO '92, INFIELD APEX  (0.0663, +1, 14)
      //    Tyre wall against the barrier, marshal post, one billboard angled
      //    at the braking zone. NOTHING TALL: the horizon must stay visible
      //    over the infield.
      // ---------------------------------------------------------------
      tyreWall(0.0580, 0.0790, 1, 12, TYRE_CAP);
      marshalPost(K(0.0663), 1, 16);
      billboard(K(0.0600), 1, 17, 12, 4.5, [0.88, 0.82, 0.32]);
      groundPatch(K(0.0663), 1, 20, slab(40, 90), OCHRE);
      for (let i = 0; i < 8; i++)
        scrub(K(0.0600 + i * 0.0048), 1, 24 + hash(i * 23) * 22, SCRUB);

      // ---------------------------------------------------------------
      // 6. OPEN COUNTRY, T1 -> MICHELIN  (0.110, -1, 45)
      //    Scattered bush and a LOOSE scatter of olive-grey tree, never a
      //    continuous rank, on flat ochre. Empty to the horizon behind it.
      // ---------------------------------------------------------------
      for (let i = 0; i < 20; i++) {
        const s = 0.0840 + i * 0.0032;
        const h = hash(i * 17 + 3);
        if (h < 0.40) continue;
        const d = 40 + h * 34;
        const a = anchor(K(s), -1, d);
        if (onTrack(a.c[0], a.c[2], 10)) continue;
        olive(K(s), -1, d, 5.4 + h * 2.4);
        if (h > 0.72) scrub(K(s), -1, d - 12, SCRUB);
      }
      groundPatch(K(0.1040), -1, 40, slab(70, 200), OCHRE);
      groundPatch(K(0.1240), -1, 112, slab(60, 160), OCHRE_PALE);
      for (let i = 0; i < 10; i++)
        scrub(K(0.0880 + i * 0.0058), -1, 26 + hash(i * 41) * 14, SCRUB);

      // ---------------------------------------------------------------
      // 7. CURVA MICHELIN -> SITO PONS STAND COMPLEX  (0.1447, -1, 24)
      //    The larger permanent stand complex, terrace filling between the
      //    bays, hoarding at the base, armco and tyre wall at the edge.
      // ---------------------------------------------------------------
      grandstandEx(0.1447, -1, 23, 150, null, null,
        { roof: "cantilever", roofCol: CONC, fasciaCol: CONC_ALT, tiers: 2, h: 14 });
      grandstandEx(0.1800, -1, 23, 130, null, null,
        { roof: "none", fasciaCol: CONC_ALT, h: 12 });
      grandstandEx(0.2160, -1, 24, 120, null, null,
        { roof: "none", fasciaCol: CONC_ALT, h: 12 });
      terrace(0.1580, 0.1740, -1, 22, TERR);
      terrace(0.1940, 0.2100, -1, 23, TERR);
      terrace(0.2280, 0.2720, -1, 24, TERR_LO);
      sponsorHoarding(0.1320, 0.2600, -1, 14);
      guardrail(0.1260, 0.2680, -1, 10, ARMCO);
      tyreWall(0.1340, 0.1600, -1, 11, TYRE_CAP);
      cameraTower(K(0.1690), -1, 21);
      marshalPost(K(0.2280), -1, 16);
      groundPatch(K(0.1900), -1, 50, slab(44, 220), DUST);
      //   DEPTH. 150 m of terracing with open country immediately behind it
      //   reads as a flat; the complex gets its back-of-house — concourse
      //   apron, kiosk line, the support paddock's truck row, two whitewashed
      //   service blocks, flag masts, and the park that fills the rest.
      kiosks(0.1400, -1, 54, 16, 13);
      for (let i = 0; i < 7; i++) {                         // support paddock
        const k = K(0.1480 + i * 0.0090);
        if (!clear(k, -1, 68, 14)) continue;
        motorhome(k, -1, 68, 10, 4.2, 15,
          { wall: [0.84 + hash(i * 19) * 0.08, 0.84, 0.86] });
      }
      building(K(0.1620), -1, 84, 16, 6, 28,
        { wall: WHITEWASH, roof: [0.55, 0.34, 0.24] });
      building(K(0.2180), -1, 82, 14, 5, 20,
        { wall: WHITEWASH, roof: [0.58, 0.37, 0.26] });
      tower(K(0.1500), -1, 52, 1.1, 15);
      tower(K(0.2500), -1, 52, 1.1, 15);
      carPark(0.1560, -1, 100, 30, 4, 17);
      groundPatch(K(0.2000), -1, 104, slab(70, 260), OCHRE_PALE);

      // ---------------------------------------------------------------
      // 8. T4, START OF THE CLIMB  (0.3043, -1, 38)
      //    Natural banking with NO built seating — earth and scrub, a thin
      //    guardrail line, one marshal post.
      // ---------------------------------------------------------------
      spectatorHill(0.2860, 0.3260, -1, 36, HILL_BARE);
      guardrail(0.2740, 0.3400, -1, 11, ARMCO);
      marshalPost(K(0.3043), -1, 15);
      groundPatch(K(0.3043), -1, 46, slab(54, 160), OCHRE);
      for (let i = 0; i < 14; i++)
        scrub(K(0.2820 + i * 0.0036), -1, 48 + hash(i * 23) * 26, SCRUB);
      for (let i = 0; i < 6; i++) {
        const s = 0.2880 + i * 0.0075;
        const d = 66 + hash(i * 41) * 30;
        const a = anchor(K(s), -1, d);
        if (!onTrack(a.c[0], a.c[2], 10)) olive(K(s), -1, d, 5.0 + hash(i * 5) * 2);
      }

      // ---------------------------------------------------------------
      // 9. CURVA SITO PONS, INFIELD  (0.3563, +1, 18)
      //    Broadcast compound with a camera tower beside it, serving the
      //    whole upper loop; tyre wall on the apex side.
      // ---------------------------------------------------------------
      broadcastCompound(K(0.3563), 1, 20);
      cameraTower(K(0.3470), 1, 18);
      tyreWall(0.3460, 0.3700, 1, 12, TYRE_CAP);
      marshalPost(K(0.3620), 1, 17);
      groundPatch(K(0.3520), 1, 30, slab(26, 70), DUST);
      for (let i = 0; i < 5; i++)
        scrub(K(0.3480 + i * 0.0055), 1, 44 + hash(i * 31) * 16, SCRUB);

      // ---------------------------------------------------------------
      // 10. CURVA DRY SACK  (0.3842, -1, 22) — the slow right at the top of
      //     the climb, HIGHEST POINT OF THE LAP and the best-attended corner
      //     outside the stadium. Stepped terrace plus a grandstand block,
      //     deep tyre wall, marshal post, billboard at the braking zone.
      // ---------------------------------------------------------------
      terrace(0.3640, 0.3800, -1, 21, TERR);
      terrace(0.3880, 0.4020, -1, 21, TERR);
      grandstandEx(0.3842, -1, 30, 125, null, null,
        { roof: "cantilever", roofCol: CONC, fasciaCol: CONC_ALT, tiers: 2, h: 14 });
      spectatorHill(0.3620, 0.4060, -1, 54, HILL);
      tyreWall(0.3700, 0.4000, -1, 11, TYRE_CAP);
      guardrail(0.3580, 0.4140, -1, 9, ARMCO);
      marshalPost(K(0.3900), -1, 15);
      billboard(K(0.3720), -1, 18, 16, 5.5, [0.88, 0.86, 0.80]);
      cameraTower(K(0.3960), -1, 20);
      sponsorHoarding(0.3660, 0.4020, -1, 13);
      groundPatch(K(0.3842), -1, 76, slab(40, 170), OCHRE_PALE);
      palm(K(0.4000), -1, 26, 11, OLIVE);
      palm(K(0.3660), -1, 26, 10, OLIVE_D);
      //   Best-attended corner outside the stadium: catering behind the steps,
      //   the overflow park on the flat above, masts on the skyline.
      kiosks(0.3680, -1, 68, 9, 23);
      carPark(0.3660, -1, 98, 22, 4, 29);
      groundPatch(K(0.3860), -1, 106, slab(64, 210), DUST);
      tower(K(0.3700), -1, 64, 1.1, 16);
      tower(K(0.4020), -1, 64, 1.1, 16);
      for (let i = 0; i < 5; i++) {
        const a = anchor(K(0.3600 + i * 0.0140), -1, 146);
        if (onTrack(a.c[0], a.c[2], 37)) continue;
        const ang = Math.atan2(a.t[2], a.t[0]);
        ridge(a.c[0], a.c[2], terrainYAt(a.c[0], a.c[2]) - 1.6, ang,
          62, 26, 6 + hash(i * 17) * 4, DUST);
      }

      // ---------------------------------------------------------------
      // 11. DESCENT AWAY FROM DRY SACK  (0.460, +1, 50)
      //     Bare ridge running parallel to the track with sparse bush — the
      //     FALL OF THE LAND is the landmark, not any prop. ridge() takes
      //     world x/z and a scalar heading; the long axis is +ang, so take it
      //     from the node tangent and set the ridge well back (its footprint
      //     half-extent is tested against the tarmac).
      // ---------------------------------------------------------------
      for (let i = 0; i < 7; i++) {
        const s = 0.4240 + i * 0.0165;
        const a = anchor(K(s), 1, 62);
        // ridge() tests its own footprint half-extent against the tarmac and
        // drops the whole landform; on this tight infield that is a silent
        // hole, so pre-check with the same margin and simply skip.
        if (onTrack(a.c[0], a.c[2], 37)) continue;
        const ang = Math.atan2(a.t[2], a.t[0]);
        ridge(a.c[0], a.c[2], terrainYAt(a.c[0], a.c[2]) - 1.2, ang,
          58, 24, 7 + hash(i * 13) * 5, DUST);
      }
      for (let i = 0; i < 18; i++)
        scrub(K(0.4180 + i * 0.0050), 1, 38 + hash(i * 29) * 30, SCRUB);
      groundPatch(K(0.4600), 1, 50, slab(46, 140), OCHRE);
      guardrail(0.4180, 0.5020, 1, 12, ARMCO);

      // ---------------------------------------------------------------
      // 12. TURN 7 LEFT  (0.5228, -1, 28)
      //     Guardrail and tyre wall, a LOW spectator hill with standing room
      //     only, one marshal post.
      // ---------------------------------------------------------------
      guardrail(0.5040, 0.5460, -1, 10, ARMCO);
      tyreWall(0.5100, 0.5360, -1, 11, TYRE_CAP);
      spectatorHill(0.5060, 0.5420, -1, 26,
        { grass: OCHRE, riser: DUST, rows: 3, rise: 1.05, density: 0.55 });
      marshalPost(K(0.5228), -1, 16);
      if (clear(K(0.5560), -1, 142, 20)) {                   // lone cortijo
        building(K(0.5560), -1, 142, 12, 5.5, 18,
          { wall: WHITEWASH, roof: [0.55, 0.33, 0.23] });
        place(K(0.5600), -1, 138, [6, 3, 8], [0.80, 0.77, 0.70]);
        olive(K(0.5520), -1, 134, 5.6);
      }
      groundPatch(K(0.5228), -1, 40, slab(40, 130), DUST);
      for (let i = 0; i < 8; i++)
        scrub(K(0.5060 + i * 0.0048), -1, 44 + hash(i * 37) * 18, SCRUB);

      // ---------------------------------------------------------------
      // 13. FAR OUTFIELD, THE QUIETEST STRETCH  (0.6300, -1, 65)
      //     Widely spaced olive in FIELD ROWS and a single white farm set
      //     well back. Horizon unbroken above it: nothing here is tall.
      // ---------------------------------------------------------------
      for (let row = 0; row < 4; row++) {
        const d = 66 + row * 19;
        for (let i = 0; i < 9; i++) {
          const s = 0.5960 + i * 0.0078;
          const h = hash(i * 11 + row * 97);
          if (h < 0.24) continue;
          const a = anchor(K(s), -1, d);
          if (onTrack(a.c[0], a.c[2], 12)) continue;
          olive(K(s), -1, d, 4.6 + h * 1.9);
        }
      }
      building(K(0.6300), -1, 104, 20, 7, 13,
        { wall: WHITEWASH, roof: [0.55, 0.34, 0.24] });     // white farm
      place(K(0.6365), -1, 108, [9, 4.5, 7], WHITEWASH);    // outbuilding
      place(K(0.6250), -1, 100, [5, 3.2, 11], [0.78, 0.74, 0.66]);
      palm(K(0.6270), -1, 94, 12, OLIVE_D);
      //   A sherry bodega beyond the farm — long whitewashed shed under a
      //   terracotta roof, walled yard, water tower. Low and set well back so
      //   the horizon stays unbroken above it (§6).
      building(K(0.6540), -1, 132, 16, 6.5, 52,
        { wall: WHITEWASH, roof: [0.56, 0.33, 0.23] });
      building(K(0.6660), -1, 128, 12, 5, 24,
        { wall: WHITEWASH, roof: [0.56, 0.33, 0.23] });
      tower(K(0.6600), -1, 150, 2.4, 13);                   // water tower
      for (let i = 0; i < 10; i++) {                        // yard wall
        const k = K(0.6460 + i * 8 * M);
        if (clear(k, -1, 112, 12)) place(k, -1, 112, [1.0, 2.2, 7.0], WHITEWASH);
      }
      for (let row = 0; row < 3; row++) {
        const d = 152 + row * 15;
        for (let i = 0; i < 11; i++) {
          const k = K(0.6380 + i * 15 * M);
          if (hash(i * 23 + row * 53) < 0.18) continue;
          if (!clear(k, -1, d, 12)) continue;
          olive(k, -1, d, 4.4 + hash(i * 9 + row) * 1.4);
        }
      }
      for (let row = 0; row < 7; row++) {                   // vine rows
        const d = 92 + row * 5.5;
        for (let i = 0; i < 9; i++) {
          const k = K(0.6700 + i * 11 * M);
          if (!clear(k, -1, d, 12)) continue;
          place(k, -1, d, [1.1, 1.1, 8.5], [0.33, 0.36, 0.26]);
        }
      }
      groundPatch(K(0.6700), -1, 104, slab(46, 120), [0.88, 0.86, 0.80]);
      groundPatch(K(0.6560), -1, 124, slab(76, 190), OCHRE_PALE);
      groundPatch(K(0.6300), -1, 56, slab(80, 230), OCHRE_PALE);
      for (let i = 0; i < 12; i++)
        scrub(K(0.6020 + i * 0.0048), -1, 32 + hash(i * 31) * 20, SCRUB);

      // ---------------------------------------------------------------
      // 14. CURVA ANGEL NIETO  (0.7123, -1, 26)
      //     Terrace returns as the stadium section opens up, with hoarding
      //     and a camera tower; guardrail and tyre wall at the edge.
      // ---------------------------------------------------------------
      terrace(0.6960, 0.7360, -1, 25, TERR);
      sponsorHoarding(0.6920, 0.7420, -1, 14);
      cameraTower(K(0.7060), -1, 23);
      guardrail(0.6860, 0.7500, -1, 10, ARMCO);
      tyreWall(0.7000, 0.7280, -1, 11, TYRE_CAP);
      marshalPost(K(0.7180), -1, 16);
      spectatorHill(0.6940, 0.7400, -1, 60, HILL_BARE);
      groundPatch(K(0.7123), -1, 54, slab(36, 150), DUST);
      kiosks(0.6980, -1, 58, 10, 31);
      carPark(0.7000, -1, 76, 22, 3, 37);

      // ---------------------------------------------------------------
      // 15. PELUQUI, INTO THE STADIUM BOWL  (0.8417, -1, 22)
      //     Continuous permanent terrace wrapping the outside, a grandstand
      //     on the highest bank, billboard above the run-off.
      // ---------------------------------------------------------------
      terrace(0.7520, 0.8140, -1, 23, TERR_LO);   // bowl wrap from Angel Nieto
      terrace(0.8180, 0.8720, -1, 21, TERR);
      grandstandEx(0.8417, -1, 36, 140, null, null,
        { roof: "cantilever", roofCol: CONC, fasciaCol: CONC_ALT, tiers: 2, h: 15 });
      sponsorHoarding(0.8140, 0.8780, -1, 13);
      billboard(K(0.8290), -1, 17, 18, 6, [0.86, 0.84, 0.78]);
      guardrail(0.8100, 0.8860, -1, 10, ARMCO);
      tyreWall(0.8260, 0.8580, -1, 11, TYRE_CAP);
      runoffApron(K(0.8417), -1, 11, 30, OCHRE_PALE);
      marshalPost(K(0.8480), -1, 16);
      cameraTower(K(0.8680), -1, 24);
      //   The bowl's back-of-house: one continuous concourse from Angel Nieto
      //   to Ferrari, then the main spectator park on the outside of it.
      groundPatch(K(0.8000), -1, 56, slab(46, 300), DUST);
      kiosks(0.7700, -1, 54, 14, 41);
      tower(K(0.8000), -1, 54, 1.1, 15);
      building(K(0.7900), -1, 72, 14, 5, 22,
        { wall: WHITEWASH, roof: [0.57, 0.36, 0.25] });
      carPark(0.7660, -1, 84, 30, 4, 43);

      // ---------------------------------------------------------------
      // 16. CURVA FERRARI  (0.9177, -1, 20)
      //     Terracing UNBROKEN from Peluqui — terrace and grandstand,
      //     hoarding at the base, tyre wall and marshal post at the edge.
      // ---------------------------------------------------------------
      terrace(0.8740, 0.9260, -1, 20, TERR);
      grandstandEx(0.9177, -1, 34, 135, null, null,
        { roof: "none", fasciaCol: CONC_ALT, tiers: 2, h: 13 });
      sponsorHoarding(0.8760, 0.9300, -1, 13);
      tyreWall(0.9040, 0.9300, -1, 11, TYRE_CAP);
      marshalPost(K(0.9177), -1, 15);
      cameraTower(K(0.8880), -1, 24);
      groundPatch(K(0.9177), -1, 58, slab(34, 170), DUST);
      kiosks(0.8800, -1, 54, 9, 47);
      building(K(0.9000), -1, 70, 14, 5.5, 24,
        { wall: CONC, roof: [0.55, 0.53, 0.50] });
      carPark(0.8820, -1, 80, 20, 3, 53);
      tower(K(0.9280), -1, 56, 1.1, 15);

      // ---------------------------------------------------------------
      // 17. FINAL RIGHT ONTO THE PIT STRAIGHT  (0.9517, +1, 12)
      //     Pit-exit guardrail merging in, paddock building mass and
      //     motorhome rows immediately behind it, marshal post on the apex.
      // ---------------------------------------------------------------
      guardrail(0.9420, 0.9740, 1, 12, ARMCO);
      marshalPost(K(0.9517), 1, 14);
      building(K(0.9450), 1, 32, 22, 9, 15,
        { wall: CONC, roof: [0.58, 0.56, 0.53] });
      for (let i = 0; i < 5; i++)
        motorhome(K(0.9330 + i * 0.0075), 1, 48, 10, 4.2, 15,
          { wall: [0.82 + hash(i * 17) * 0.10, 0.82, 0.84] });
      groundPatch(K(0.9517), 1, 20, slab(20, 56), TARMAC);

      // ---------------------------------------------------------------
      // 18. CIRCUIT-WIDE — continuous armco, marshal posts and a very sparse
      //     scrub scatter. Deliberately NO tree line anywhere (§6): the lone
      //     olives below are hash-gated hard so they never rank up, and the
      //     outfield stays open with the horizon visible.
      // ---------------------------------------------------------------
      for (const side of [-1, 1]) guardrail(0.0, 1.0, side, 13, ARMCO);

      for (let i = 0; i < 12; i++) marshalPost(Math.round((i / 12) * n) % n, 1, 17);

      every(22, (k) => {
        const h = hash(k * 37 + 11);
        if (h < 0.44) return;
        const side = h < 0.74 ? -1 : 1;
        const dist = 21 + h * 28;
        const a = anchor(k, side, dist);
        if (onTrack(a.c[0], a.c[2], 9)) return;
        scrub(k, side, dist, h < 0.60 ? SCRUB : OLIVE_D);
        if (h > 0.86) scrub(k, side, dist + 9 + h * 6, SCRUB);
      });

      // Very occasional lone olive / palm — hash-gated so the spacing can
      // never close up into a rank.
      every(55, (k) => {
        const h = hash(k * 53 + 7);
        if (h < 0.62) return;
        const side = h < 0.86 ? -1 : 1;
        const dist = 46 + h * 32;
        const a = anchor(k, side, dist);
        if (onTrack(a.c[0], a.c[2], 12)) return;
        if (h > 0.955) palm(k, side, dist, 10 + h * 3, OLIVE_D);
        else olive(k, side, dist, 5.2 + h * 2.2);
      });

      gantry(0.0, 8, CONC);
      gantry(0.0345, 7.5, CONC_ALT);

      // ── EL OVNI ──────────────────────────────────────────────────────────
      // Jerez's one unmistakable building, and it was missing. The brief's own
      // summary ends "pale concrete terracing is the built landmark", which is
      // true of every Spanish circuit of the period and true of none of them
      // the way this thing is: a white disc on a single stem standing in the
      // infield, so plainly a flying saucer that nobody has called it anything
      // else since 1986. Photograph the stadium section from any angle and it
      // is in the frame.
      //
      // Infield at s 0.75, 50 m out: measured 57.5 m to the nearest other road
      // node, which a 28 m disc needs (0.73 and 0.78 both come within 20-32 m
      // of the lap folding back, and 0.70 within 1.8 m).
      {
        const a = anchor(K(0.75), 1, 50);
        const b = [a.r, a.u, a.t];
        const R = 14, STEM = 13;                      // 28 m across, deck 13 m up
        const OVNI_W = [0.93, 0.93, 0.91], OVNI_S = [0.80, 0.80, 0.78];
        const OVNI_G = [0.16, 0.22, 0.28];
        modelGroup("jerez-ovni", {
          center: vadd(a.c, a.u, STEM * 0.62), size: [R * 2 + 2, STEM + 9, R * 2 + 2], basis: b,
        }, (stage) => {
          stage._mat = MAT.CONCRETE;
          addCyl(stage, a.c, 3.4, STEM, OVNI_S, 12, b);                     // the stem
          addBox(stage, a.c, [9, 0.6, 9], OVNI_S, b);                       // plinth
          // Underside cone, glazed drum, overhanging roof disc — the three
          // pieces that make the silhouette read as a saucer and not a tank.
          addFrustum(stage, vadd(a.c, a.u, STEM - 3.2), R * 0.42, R * 0.92, 3.2, OVNI_S, 16, b);
          stage._mat = MAT.GLASS;
          addCyl(stage, vadd(a.c, a.u, STEM), R * 0.92, 3.6, OVNI_G, 16, b);
          stage._mat = MAT.CONCRETE;
          addCyl(stage, vadd(a.c, a.u, STEM + 3.6), R, 1.1, OVNI_W, 16, b); // the brim
          addFrustum(stage, vadd(a.c, a.u, STEM + 4.7), R * 0.8, R * 0.3, 2.4, OVNI_W, 16, b);
          stage._mat = MAT.METAL;
          addCyl(stage, vadd(a.c, a.u, STEM + 7.1), 0.16, 4.5, [0.55, 0.56, 0.58], 5, b);
          stage._mat = 0;
        }, { required: true });
      }
  };
