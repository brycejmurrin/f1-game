/* Apex 26 — ZOLDER scenery (data only), split out of js/circuits/zolder.js.
   LAZY_SCENERY (tools/manifest.cjs): no <script> tag.

   Brief: docs/tracks/zolder.md. Identity = pale sand under dark Scots pine,
   Belgian Limburg heath on old coal ground. Flat to gently undulating.

   Block -> brief row (§4) map:
     0  global      §2 palette: pale sand verges, dark pine mass, §5 sand run-off
                    0a verges  0b near pine  0c scrub  0d/0e forest edges
                    0d2 a SECOND canopy line 30 m behind each edge
                    0f armco   0g debris fence  0h marshal posts
                    0i DEPTH — the plantation running back behind the edge
                    0j sandy forest rides (firebreaks) cut through the wood
                    0k understory scrub + open sand heath seen through trunks
     1  s 0.005 +1  pit lane / garages / hoarding / pit-exit marshal
     2  s 0.015 -1  main-straight grandstand, camera tower, billboards, pine
     3  s 0.035 -1  Earste Chicane (T1) outside: sand run-off, tyres, hill
     4  s 0.042 +1  chicane exit infield: sand patch, marshal, rail, pine screen
     5  s 0.110 -1  long forestEdge — the wall of the outer loop
     6  s 0.180 +1  Sterrenwacht (T2): rail, marshal, small building in trees
     7  s 0.194 -1  Kanaalbocht (T3): sandy spoil ridge, rail + tyres, forest
     8  s 0.265 -1  forested motorhome park
     9  s 0.347 +1  Lucien Bianchi bocht (T4): rail+tyres, marshal, billboards
    10  s 0.433 -1  Villeneuve chicane (T5) + the memorial (restraint: one
                    small low building on a ground patch, nothing else)
    11  s 0.505 +1  infield service area: broadcast compound, motorhomes, shed
    12  s 0.567 -1  Kleine chicane (T6): tight, enclosed, pine right behind
    13  s 0.715 +1  Bolderberghaarspeldbocht (T7): hill, small stand, tyres
    14  s 0.863 +1  Terlamenbocht entry (T8): stand, rail, hoarding, marshal
    15  s 0.879 -1  Terlamenbocht exit (T9): tyres, camera tower, billboards
    16  s 0.924 +1  Jochen Rindt bocht (T10): paddock blocks, motorhomes
    17  s 0.60-0.70 / 0.74-0.85  §5 the fast sweepers through the pine
*/
"use strict";
(window.TrackScenery = window.TrackScenery || {})["zolder"] =
  function (api) {
      const { n, hash, every, anchor, onTrack, terrainYAt,
        pine, tree, bush, forestEdge,
        building, grandstandEx, spectatorHill,
        guardrail, fence, tyreWall, marshalPost, cameraTower,
        broadcastCompound, billboard, sponsorHoarding,
        motorhome, groundPatch, ridge } = api;

      const K = (s) => Math.round(s * n) % n;

      // --- palette -------------------------------------------------------
      // Scots pine: near-black green, barely any yellow in it.
      const PINE_A = [0.07, 0.17, 0.11];
      const PINE_B = [0.10, 0.22, 0.13];
      const PINE_C = [0.13, 0.26, 0.16];
      const PINES = [PINE_A, PINE_B, PINE_C];
      // Depth reads as haze, not as a new species: the far ranks lose contrast
      // towards the sky rather than turning blue.
      const PINE_FAR = [0.12, 0.21, 0.15];
      const PINE_FAR2 = [0.15, 0.24, 0.18];
      const BIRCH = [0.24, 0.36, 0.20];   // the odd self-seeded broadleaf
      const SCRUB = [0.30, 0.31, 0.19];   // heather / dry scrub
      // Sand: this is genuinely sand, not gravel. Bleached next to tarmac.
      const SAND = [0.82, 0.76, 0.61];
      const SAND_PALE = [0.88, 0.83, 0.70];
      const SAND_DUSK = [0.72, 0.66, 0.52];
      // Club-circuit buildings: plain, flat-roofed, unglamorous.
      const WHITE = [0.87, 0.88, 0.87];
      const GREY = [0.62, 0.64, 0.65];
      const CONCRETE = [0.72, 0.72, 0.70];
      const RAIL = [0.79, 0.80, 0.82];
      const TYRE_CAP = [0.90, 0.86, 0.28];
      const TYRE_CAP2 = [0.88, 0.88, 0.89];

      const pineCol = (h) => PINES[(h * 3) | 0] || PINE_B;
      const farCol = (h) => (h > 0.5 ? PINE_FAR2 : PINE_FAR);

      // --- placement guard -------------------------------------------------
      // The engine REFUSES a footprint that reaches the road, and Zolder folds
      // back on itself (the hairpin and the Terlamen loop run within a patch
      // width of their neighbours). Sample the footprint's near edge, centre
      // and far edge at three stations along its own depth before emitting, so
      // nothing is left asking. Used by every ground patch and loose building
      // that is not hand-placed against a named barrier.
      const STEP = 4.03;                      // metres per station (~4.01 km / n)
      const clear = (k, side, gap, w, d, pad) => {
        const dk = Math.max(1, Math.round(d * 0.5 / STEP));
        for (const ks of [k - dk, k, k + dk]) {
          const kk = ((Math.round(ks) % n) + n) % n;
          for (const off of [-w * 0.5, 0, w * 0.5]) {
            const g = gap + off;
            if (g < 5) return false;
            const a = anchor(kk, side, g);
            if (!a || onTrack(a.c[0], a.c[2], pad)) return false;
          }
        }
        return true;
      };
      // Lap windows where a named block below lays its own sand, barriers and
      // buildings. The global passes keep out: two sand traps fighting over the
      // same metre of ground is how a prop gets refused.
      const OWNED = [
        [0.930, 0.075],   // pit straight, start line and the Earste chicane
        [0.160, 0.225],   // Sterrenwacht + Kanaalbocht
        [0.250, 0.285],   // motorhome park apron
        [0.325, 0.372],   // Lucien Bianchi
        [0.395, 0.458],   // Villeneuve chicane and the memorial patch
        [0.472, 0.540],   // infield service area
        [0.542, 0.598],   // Kleine chicane
        [0.686, 0.748],   // Bolderberg hairpin
        [0.838, 0.900],   // Terlamenbocht
      ];
      const owned = (f) => OWNED.some(([a, b]) =>
        a <= b ? (f >= a && f <= b) : (f >= a || f <= b));

      // === 0. GLOBAL: the heath ==========================================
      // 0a. Pale sand verge patches scattered the whole way round. The run-off
      //     and verges reading pale IS the place; keep them wide and frequent.
      //     Two grades: a bleached apron close in, a duskier spread behind it.
      every(26, (k) => {
        const h = hash(k * 17 + 3);
        const f = k / n;
        if (owned(f)) return;
        for (const side of [-1, 1]) {
          const g = 12.0 + h * 7;
          const w = 11 + h * 11;
          const d = 22 + h * 20;
          if (!clear(k, side, g, w, d, 8)) continue;
          groundPatch(k, side, g, [w, 0.14, d], h < 0.5 ? SAND_PALE : SAND);
          // The spread behind: same sand, weathered, no hard edge to the heath.
          const g2 = g + w * 0.5 + 9 + h * 5;
          const w2 = 13 + h * 9;
          if (h > 0.34 && clear(k, side, g2, w2, d * 0.8, 9)) {
            groundPatch(k, side, g2, [w2, 0.13, d * 0.8], SAND_DUSK);
          }
        }
      });

      // 0b. The pine mass. Dark and dense, set back past the sand, thicker on
      //     the outer ring (-1) than on the infield (+1) where the paddock is.
      // every(13) and four ranks, not every(7) and seven. Same 2026-09-15 pass:
      // Zolder's forest closed over the track completely. It IS a forest circuit
      // in the Bosbergen woods, but you can see the Belgian trees from the
      // Belgian track.
      every(13, (k) => {
        const h = hash(k * 29 + 7);
        const h2 = hash(k * 53 + 11);
        for (const side of [-1, 1]) {
          const ranks = side < 0 ? 4 : 3;
          for (let r = 0; r < ranks; r++) {
            const jitter = hash(k * 7 + r * 131 + (side < 0 ? 0 : 401));
            if (jitter < 0.12) continue;
            const dist = (side < 0 ? 24 : 30) + r * 10 + jitter * 8;
            const a = anchor(k, side, dist);
            if (!a || onTrack(a.c[0], a.c[2], 8)) continue;
            // Plantation rank: the front row is shorter and the stand grows
            // into the crown behind it, which is what gives the wall a top.
            pine(k, side, dist, 13 + r * 0.9 + jitter * 9, pineCol(jitter));
          }
        }
        // A little scrub and the occasional birch at the wood's edge.
        if (h > 0.72) {
          const d = 17 + h * 6;
          const b = anchor(k, -1, d);
          if (b && !onTrack(b.c[0], b.c[2], 7)) bush(k, -1, d, SCRUB);
        }
        if (h2 > 0.86) {
          const a = anchor(k, -1, 21);
          if (a && !onTrack(a.c[0], a.c[2], 8)) tree(k, -1, 21, 8 + h2 * 4, BIRCH);
        }
      });

      // 0c. Heather / scrub clumps on the sand between the tarmac and the pine.
      every(19, (k) => {
        const h = hash(k * 97 + 5);
        if (h < 0.42) return;
        for (const side of [-1, 1]) {
          const d = 15 + h * 7;
          const a = anchor(k, side, d);
          if (!a || onTrack(a.c[0], a.c[2], 7)) continue;
          bush(k, side, d, h > 0.8 ? PINE_C : SCRUB);
        }
      });

      // 0d/0e. THE OUTER RING OF WOOD. Zolder sits inside a pine plantation: the
      //      -1 side is woodland almost the whole way round, broken only where
      //      the main-straight grandstand and the Villeneuve viewing bank are.
      //      forestEdge is what makes it read as a WALL rather than a scatter.
      //      (0d = outer ring, 0e = infield screen.)
      forestEdge(0.300, 0.420, -1, 24, { spacing: 11 });
      forestEdge(0.440, 0.540, -1, 32, { spacing: 13 });
      forestEdge(0.600, 0.700, -1, 24, { spacing: 11 });
      forestEdge(0.730, 0.850, -1, 26, { spacing: 11 });
      forestEdge(0.905, 0.950, -1, 30, { spacing: 13 });
      // Infield pine: the paddock and service areas are cut out of the same
      // plantation, so the +1 side is screened too wherever nothing is built.
      forestEdge(0.100, 0.168, 1, 30, { spacing: 13 });
      forestEdge(0.206, 0.330, 1, 28, { spacing: 13 });
      forestEdge(0.580, 0.690, 1, 28, { spacing: 13 });
      forestEdge(0.760, 0.850, 1, 30, { spacing: 13 });

      // 0d2. A SECOND CANOPY LINE behind each edge. One forestEdge is a
      //      facade: it has a front and nothing behind it, and at the speed the
      //      back section is taken you see straight past the ends of it. A
      //      second line set 30 m further back closes those sightlines and
      //      gives the wood a roof that carries on going.
      forestEdge(0.302, 0.418, -1, 56, { spacing: 18 });
      forestEdge(0.442, 0.538, -1, 64, { spacing: 18 });
      forestEdge(0.602, 0.698, -1, 56, { spacing: 18 });
      forestEdge(0.732, 0.848, -1, 58, { spacing: 18 });
      forestEdge(0.906, 0.948, -1, 62, { spacing: 18 });
      forestEdge(0.102, 0.166, 1, 62, { spacing: 18 });
      forestEdge(0.208, 0.328, 1, 60, { spacing: 18 });
      forestEdge(0.582, 0.688, 1, 60, { spacing: 18 });
      forestEdge(0.762, 0.848, 1, 62, { spacing: 18 });

      // 0f. Armco all the way round — Zolder is hemmed in, barriers are close.
      for (const side of [-1, 1]) guardrail(0.0, 1.0, side, 10.5, RAIL);

      // 0g. Debris fence behind the armco on the spectator side of the loop.
      fence(0.08, 0.30, -1, 15, 3.2, [0.58, 0.60, 0.60]);
      fence(0.40, 0.62, -1, 15, 3.2, [0.58, 0.60, 0.60]);

      // 0h. Marshal posts on the half-lap gaps the named rows do not cover.
      for (const s of [0.075, 0.145, 0.235, 0.300, 0.395, 0.470, 0.640, 0.780, 0.820]) {
        marshalPost(K(s), s < 0.5 ? -1 : 1, 13);
      }

      // 0i. DEPTH. Everything above stops at ~90 m and the wood would end in
      //     mid-air. It does not: the plantation runs back for hundreds of
      //     metres on every side of Zolder, and from the cockpit that depth is
      //     the difference between a painted wall and a forest. Pine is
      //     instanced, so these ranks are free in the prop-vert budget — the
      //     only thing that limits them is taste. Height climbs and contrast
      //     falls with distance; the gaps are real clearings, not noise.
      every(8, (k) => {
        for (const side of [-1, 1]) {
          const deep = side < 0 ? 7 : 5;
          for (let r = 0; r < deep; r++) {
            const j = hash(k * 13 + r * 197 + (side < 0 ? 0 : 733));
            if (j < 0.20) continue;               // clearings and rides
            const dist = (side < 0 ? 96 : 104) + r * 17 + j * 12;
            const a = anchor(k, side, dist);
            if (!a || onTrack(a.c[0], a.c[2], 11)) continue;
            pine(k, side, dist, 16 + r * 0.7 + j * 9,
              r < 2 ? pineCol(j) : farCol(j));
          }
        }
      });
      // The far skyline: a last, taller stand at the limit of sight, thinned
      // right out so it reads as canopy rather than as individual trunks.
      every(13, (k) => {
        for (const side of [-1, 1]) {
          for (let r = 0; r < 4; r++) {
            const j = hash(k * 19 + r * 311 + (side < 0 ? 57 : 907));
            if (j < 0.42) continue;
            const dist = 228 + r * 26 + j * 18;
            const a = anchor(k, side, dist);
            if (!a || onTrack(a.c[0], a.c[2], 12)) continue;
            pine(k, side, dist, 19 + j * 10, farCol(j));
          }
        }
      });

      // 0j. Sandy forest rides. Limburg plantation is cut by straight sand
      //     tracks, and they are the one thing that shows the wood has a floor:
      //     a pale slot running away from the circuit between the trunks.
      for (const [f, side] of [[0.128, -1], [0.292, -1], [0.372, 1], [0.512, -1],
                               [0.652, -1], [0.668, 1], [0.808, -1], [0.958, -1]]) {
        const k = K(f);
        const gap = 78;
        if (!clear(k, side, gap, 96, 8, 12)) continue;
        groundPatch(k, side, gap, [96, 0.13, 8], SAND_DUSK);
        // Scrub holds the edges of the ride where the light gets in.
        for (const off of [-30, 30]) {
          const b = anchor(k, side, gap + off);
          if (b && !onTrack(b.c[0], b.c[2], 10)) bush(k, side, gap + off, SCRUB);
        }
      }

      // 0k. UNDERSTORY AND HEATH. A plantation floor is not bare: dry heather
      //     and self-seeded scrub run along the drip line, and the wood opens
      //     every few hundred metres onto a patch of open sand heath that you
      //     see THROUGH the trunks. Both are what stop the pine reading as a
      //     single flat tone from the cockpit.
      every(11, (k) => {
        const h = hash(k * 191 + 27);
        const f = k / n;
        if (owned(f) || h < 0.46) return;
        for (const side of [-1, 1]) {
          const d = 26 + h * 16;
          const a = anchor(k, side, d);
          if (!a || onTrack(a.c[0], a.c[2], 9)) continue;
          bush(k, side, d, h > 0.82 ? PINE_C : SCRUB);
        }
      });
      // Open heath inside the wood: pale sand seen between the trunks.
      for (const [f, side] of [[0.088, -1], [0.152, 1], [0.238, -1], [0.318, 1],
                               [0.468, -1], [0.618, -1], [0.632, 1], [0.772, -1],
                               [0.796, 1], [0.884, -1]]) {
        const k = K(f);
        if (!clear(k, side, 62, 34, 40, 11)) continue;
        groundPatch(k, side, 62, [34, 0.13, 40], SAND_DUSK);
        for (let i = 0; i < 3; i++) {
          const j = hash(k * 7 + i * 59);
          const d = 50 + i * 12 + j * 6;
          const b = anchor(k, side, d);
          if (b && !onTrack(b.c[0], b.c[2], 10)) bush(k, side, d, SCRUB);
        }
        // A self-seeded birch on the clearing edge — the only broadleaf here.
        const t = anchor(k, side, 78);
        if (t && !onTrack(t.c[0], t.c[2], 10)) tree(k, side, 78, 9 + hash(k * 3) * 5, BIRCH);
      }

      // RE-KEYED THROUGH sl(). The start line moved onto a straight (def
      // startFrac) because the grid had been laid through a 176 m corner, and
      // sceneryStartFrac holds the rest of this file on its real corners — the
      // chicanes, the Villeneuve memorial and the pine sections must not travel
      // with the line. The pit block and main stand belong AT the line, so
      // these two blocks alone are shifted.
      const SL = 0.1562;                       // = 1 - def._sceneryShift
      const sl = (f) => (f + SL) % 1;

      // === 1. s 0.005 +1 14 — PIT LANE AND GARAGES =======================
      // A long low run of flat-roofed boxes. Plain white/grey. Functional.
      for (let i = 0; i < 13; i++) {
        const s = sl(0.958 + i * 0.0068);
        const h = hash(i * 41 + 9);
        building(K(s), 1, 14, 11, 4.6 + (h > 0.7 ? 1.6 : 0), 9.5,
          { wall: h < 0.55 ? WHITE : GREY });
      }
      // Team offices over the middle of the pit block.
      building(K(sl(0.012)), 1, 26, 34, 8.5, 14, { wall: WHITE });
      building(K(sl(0.034)), 1, 27, 22, 7.0, 13, { wall: GREY });
      // Continuous sponsor band along the pit wall.
      sponsorHoarding(sl(0.955), sl(0.060), 1, 11.5);
      // Pit exit marshal.
      marshalPost(K(sl(0.058)), 1, 13);
      marshalPost(K(sl(0.985)), 1, 13);
      // Pale apron in front of the garages.
      groundPatch(K(sl(0.005)), 1, 4.0, [17, 0.15, 34], CONCRETE);
      // The paddock behind the boxes: one concrete yard, trucks parked on it,
      // and the plantation closing it off. A club paddock — no hospitality.
      groundPatch(K(sl(0.010)), 1, 44, [34, 0.14, 108], CONCRETE);
      for (let i = 0; i < 6; i++) {
        const j = hash(i * 151 + 71);
        motorhome(K(sl(0.968 + i * 0.0092)), 1, 42 + j * 8, 10, 6.2 + j * 1.3, 13,
          { wall: j < 0.5 ? [0.88, 0.88, 0.87] : [0.83, 0.84, 0.85] });
      }
      // Scrutineering / race-control shed at the back of the yard.
      building(K(sl(0.024)), 1, 62, 16, 5.4, 22, { wall: GREY });
      for (let i = 0; i < 14; i++) {
        const j = hash(i * 157 + 13);
        pine(K(sl(0.952 + i * 0.0086)), 1, 78 + j * 16, 15 + j * 9, pineCol(j));
      }

      // === 2. s 0.015 -1 12 — MAIN STRAIGHT GRANDSTAND ===================
      grandstandEx(sl(0.012), -1, 12, 150, null, null);
      cameraTower(K(sl(0.0)), -1, 15);
      // A rank of billboards behind the stand.
      for (let i = 0; i < 5; i++) {
        billboard(K(0.968 + i * 0.011), -1, 34, 11, 4.2,
          i % 2 ? [0.82, 0.24, 0.20] : [0.16, 0.28, 0.55]);
      }
      // Dark pine closes the gap above the roofline.
      for (let i = 0; i < 16; i++) {
        const s = 0.950 + i * 0.0075;
        const j = hash(i * 61 + 13);
        pine(K(s), -1, 44 + j * 10, 17 + j * 7, pineCol(j));
      }

      // === 3. s 0.035 -1 22 — EARSTE CHICANE (T1) OUTSIDE ================
      // Wide bleached sand run-off, then tyres on armco, then the hill.
      // The trap is GRADED, not one slab: bleached where the cars leave the
      // tarmac, plain sand across the middle, weathered at the barrier — that
      // grading is what makes a sand trap read as sand and not as carpet.
      groundPatch(K(0.0352), -1, 6.0, [24, 0.16, 46], SAND_PALE);
      groundPatch(K(0.0300), -1, 4.0, [18, 0.15, 38], SAND_PALE);
      groundPatch(K(0.0410), -1, 4.0, [18, 0.15, 38], SAND);
      groundPatch(K(0.0352), -1, 17.0, [12, 0.15, 44], SAND_DUSK);
      guardrail(0.026, 0.050, -1, 22, RAIL);
      // Tyre bank in three runs: deep stack square to the entry, a thinner
      // line along the apex, a second deep stack on the exit kink.
      tyreWall(0.026, 0.032, -1, 21.4, TYRE_CAP2);
      tyreWall(0.028, 0.048, -1, 21.4, TYRE_CAP);
      tyreWall(0.044, 0.050, -1, 21.4, TYRE_CAP2);
      // Second line of armco behind the bank, then the hill, then the fence.
      guardrail(0.024, 0.052, -1, 26, RAIL);
      spectatorHill(0.026, 0.052, -1, 27);
      fence(0.022, 0.056, -1, 24, 3.6, [0.58, 0.60, 0.60]);
      marshalPost(K(0.0276), -1, 24);
      marshalPost(K(0.0470), -1, 24);
      for (let i = 0; i < 9; i++) {
        const s = 0.024 + i * 0.0034;
        const j = hash(i * 23 + 31);
        tree(K(s), -1, 40 + j * 9, 8 + j * 5, j > 0.6 ? BIRCH : PINE_C);
      }
      // The wood picks straight back up behind the bank.
      for (let i = 0; i < 18; i++) {
        const j = hash(i * 127 + 91);
        pine(K(0.020 + i * 0.0024), -1, 52 + j * 22, 16 + j * 9, pineCol(j));
      }

      // === 4. s 0.042 +1 16 — CHICANE EXIT, INFIELD ======================
      groundPatch(K(0.042), 1, 4.0, [14, 0.15, 28], SAND);
      if (clear(K(0.036), 1, 9.0, 12, 24, 7)) {
        groundPatch(K(0.036), 1, 9.0, [12, 0.15, 24], SAND_PALE);
      }
      groundPatch(K(0.044), 1, 15.0, [10, 0.14, 30], SAND_DUSK);
      marshalPost(K(0.044), 1, 15);
      guardrail(0.036, 0.052, 1, 16, RAIL);
      fence(0.034, 0.056, 1, 19, 3.2, [0.58, 0.60, 0.60]);
      // First rank of pine screening the paddock beyond.
      for (let i = 0; i < 10; i++) {
        const j = hash(i * 71 + 17);
        pine(K(0.034 + i * 0.0028), 1, 24 + j * 6, 14 + j * 6, pineCol(j));
      }
      for (let i = 0; i < 12; i++) {
        const j = hash(i * 137 + 59);
        const kk = K(0.030 + i * 0.0030), d = 36 + j * 20;
        const a = anchor(kk, 1, d);
        if (!a || onTrack(a.c[0], a.c[2], 9)) continue;   // the pit road is in here
        pine(kk, 1, d, 15 + j * 9, pineCol(j));
      }

      // === 5. s 0.110 -1 30 — THE LONG FOREST EDGE =======================
      // The dominant wall of the outer loop: trunks bare to head height,
      // canopy flat on top. Three depths of trunk, because a single rank at a
      // single distance is exactly what reads as wallpaper from the cockpit.
      forestEdge(0.062, 0.176, -1, 26, { spacing: 11 });
      forestEdge(0.066, 0.172, -1, 54, { spacing: 18 });
      for (let i = 0; i < 34; i++) {
        const s = 0.064 + i * 0.0033;
        const j = hash(i * 37 + 3);
        pine(K(s), -1, 19 + j * 5, 16 + j * 8, pineCol(j));
        if (j > 0.45) pine(K(s), -1, 33 + j * 9, 18 + j * 7, pineCol(1 - j));
        if (j > 0.80) bush(K(s), -1, 15, SCRUB);
        if (j > 0.30) pine(K(s), -1, 62 + j * 18, 18 + j * 8, farCol(j));
      }
      // A clearing with a keeper's hut, the only built thing on this stretch.
      if (clear(K(0.121), -1, 72, 26, 26, 11)) {
        groundPatch(K(0.121), -1, 72, [26, 0.14, 26], SAND_DUSK);
        building(K(0.121), -1, 72, 7, 3.4, 6, { wall: [0.55, 0.50, 0.42] });
      }

      // === 6. s 0.180 +1 16 — STERRENWACHT (T2) ==========================
      guardrail(0.170, 0.192, 1, 12, RAIL);
      marshalPost(K(0.1802), 1, 16);
      building(K(0.1802), 1, 30, 10, 6.0, 10, { wall: WHITE });   // small square, set back
      groundPatch(K(0.1802), 1, 19.0, [12, 0.15, 30], SAND_PALE);
      for (let i = 0; i < 12; i++) {
        const j = hash(i * 83 + 29);
        pine(K(0.166 + i * 0.0036), 1, 42 + j * 12, 15 + j * 8, pineCol(j));
      }

      // === 7. s 0.194 -1 20 — KANAALBOCHT (T3) ===========================
      // A low ridge of sandy spoil carries the boundary here.
      {
        const a = anchor(K(0.1938), -1, 62);
        if (a) {
          const y = terrainYAt ? terrainYAt(a.c[0], a.c[2]) : a.c[1];
          ridge(a.c[0], a.c[2], y, Math.atan2(a.t[2], a.t[0]), 74, 18, 5.0, SAND_DUSK);
        }
      }
      guardrail(0.184, 0.206, -1, 20, RAIL);
      tyreWall(0.188, 0.202, -1, 19.4, TYRE_CAP2);
      groundPatch(K(0.1938), -1, 4.0, [16, 0.15, 32], SAND_PALE);
      groundPatch(K(0.1938), -1, 15.0, [12, 0.14, 34], SAND);
      forestEdge(0.180, 0.214, -1, 40, { spacing: 13 });
      // The spoil is old coal ground: scrub takes it before the pine does.
      for (let i = 0; i < 8; i++) {
        const j = hash(i * 167 + 23);
        bush(K(0.182 + i * 0.0042), -1, 44 + j * 14, j > 0.6 ? PINE_C : SCRUB);
      }

      // === 8. s 0.265 -1 34 — FORESTED MOTORHOME PARK ====================
      groundPatch(K(0.265), -1, 30, [22, 0.16, 46], SAND_DUSK);
      for (let i = 0; i < 7; i++) {
        const j = hash(i * 59 + 43);
        motorhome(K(0.244 + i * 0.0072), -1, 33 + j * 14, 10, 6.5 + j * 1.5, 13,
          { wall: [0.88, 0.88, 0.87] });
      }
      for (let i = 0; i < 22; i++) {
        const j = hash(i * 101 + 19);
        pine(K(0.236 + i * 0.0032), -1, 30 + j * 26, 15 + j * 9, pineCol(j));
      }
      forestEdge(0.222, 0.300, -1, 22, { spacing: 11 });
      // The sand track in to the park, and a second row of vans under the pine.
      if (clear(K(0.258), -1, 62, 46, 10, 11)) {
        groundPatch(K(0.258), -1, 62, [46, 0.13, 10], SAND_DUSK);
      }
      for (let i = 0; i < 5; i++) {
        const j = hash(i * 173 + 31);
        motorhome(K(0.250 + i * 0.0080), -1, 68 + j * 10, 9, 5.8 + j * 1.2, 12,
          { wall: j < 0.5 ? [0.80, 0.81, 0.82] : [0.86, 0.86, 0.84] });
      }

      // === 9. s 0.347 +1 18 — LUCIEN BIANCHI BOCHT (T4) ==================
      guardrail(0.334, 0.362, 1, 18, RAIL);
      tyreWall(0.338, 0.358, 1, 17.4, TYRE_CAP);
      tyreWall(0.334, 0.340, 1, 17.4, TYRE_CAP2);
      marshalPost(K(0.356), 1, 20);
      billboard(K(0.330), 1, 24, 12, 4.5, [0.84, 0.78, 0.18]);
      billboard(K(0.338), 1, 24, 12, 4.5, [0.14, 0.30, 0.58]);
      groundPatch(K(0.347), 1, 4.0, [15, 0.15, 30], SAND);
      groundPatch(K(0.347), 1, 16.0, [11, 0.14, 34], SAND_DUSK);
      fence(0.330, 0.366, 1, 22, 3.2, [0.58, 0.60, 0.60]);

      // === 10. s 0.433 -1 24 — VILLENEUVE CHICANE (T5) ===================
      // Popular viewing on the outside; sand run-off; tyres on armco.
      // Sand graded the same way as T1, and the tyre bank doubled where the
      // cars arrive square at it.
      groundPatch(K(0.4333), -1, 4.0, [22, 0.16, 46], SAND_PALE);
      groundPatch(K(0.4270), -1, 4.0, [16, 0.15, 30], SAND_PALE);
      groundPatch(K(0.4400), -1, 4.0, [16, 0.15, 30], SAND);
      groundPatch(K(0.4333), -1, 15.0, [10, 0.14, 44], SAND_DUSK);
      guardrail(0.424, 0.446, -1, 18, RAIL);
      guardrail(0.420, 0.450, -1, 22, RAIL);
      tyreWall(0.426, 0.444, -1, 17.4, TYRE_CAP);
      tyreWall(0.424, 0.430, -1, 17.4, TYRE_CAP2);
      grandstandEx(0.4333, -1, 26, 62, null, null);
      spectatorHill(0.408, 0.424, -1, 26);
      fence(0.404, 0.424, -1, 22, 3.4, [0.58, 0.60, 0.60]);
      marshalPost(K(0.4270), -1, 21);
      for (let i = 0; i < 10; i++) {
        const j = hash(i * 67 + 5);
        pine(K(0.404 + i * 0.0052), -1, 44 + j * 12, 16 + j * 7, pineCol(j));
      }
      // Pine standing over the viewing bank and closing behind the stand.
      for (let i = 0; i < 16; i++) {
        const j = hash(i * 139 + 83);
        pine(K(0.400 + i * 0.0036), -1, 58 + j * 26, 17 + j * 9, pineCol(j));
      }
      // --- the memorial. One small low building on a ground patch, set back
      //     from the barrier. Unlit, unsignposted, nothing else. Restraint is
      //     the point: do NOT add lights, flags, billboards or a crowd here.
      groundPatch(K(0.4368), -1, 30, [8, 0.16, 10], CONCRETE);
      building(K(0.4368), -1, 31, 3.0, 2.2, 3.0, { wall: [0.80, 0.79, 0.76] });

      // === 11. s 0.505 +1 40 — INFIELD SERVICE AREA ======================
      groundPatch(K(0.505), 1, 34, [24, 0.15, 46], SAND_PALE);
      broadcastCompound(K(0.505), 1, 38);
      motorhome(K(0.492), 1, 40, 11, 7.0, 15, { wall: [0.90, 0.90, 0.89] });
      motorhome(K(0.518), 1, 41, 11, 7.0, 15, { wall: [0.84, 0.85, 0.86] });
      building(K(0.505), 1, 56, 18, 5.0, 12, { wall: GREY });
      building(K(0.488), 1, 57, 12, 4.2, 9, { wall: WHITE });
      for (let i = 0; i < 14; i++) {
        const j = hash(i * 79 + 23);
        pine(K(0.480 + i * 0.0040), 1, 66 + j * 14, 15 + j * 8, pineCol(j));
      }
      if (clear(K(0.505), 1, 74, 30, 12, 11)) {
        groundPatch(K(0.505), 1, 74, [30, 0.13, 12], SAND_DUSK);
      }

      // === 12. s 0.567 -1 20 — KLEINE CHICANE (T6) =======================
      // Tight and enclosed: the pine starts immediately beyond the barrier.
      // There is no room for a hill or a stand here, so the specificity has to
      // come from the barrier itself — armco, tyres, a marshal each side, and
      // a wood that is three ranks deep within forty metres of the kerb.
      guardrail(0.556, 0.580, -1, 14, RAIL);
      tyreWall(0.558, 0.578, -1, 13.4, TYRE_CAP2);
      tyreWall(0.556, 0.562, -1, 13.4, TYRE_CAP);
      tyreWall(0.574, 0.580, -1, 13.4, TYRE_CAP);
      guardrail(0.554, 0.582, 1, 13, RAIL);
      marshalPost(K(0.5667), -1, 16);
      marshalPost(K(0.5600), 1, 15);
      groundPatch(K(0.5667), -1, 4.0, [13, 0.15, 26], SAND_PALE);
      groundPatch(K(0.5580), -1, 4.0, [11, 0.15, 22], SAND);
      groundPatch(K(0.5760), -1, 4.0, [11, 0.15, 22], SAND);
      groundPatch(K(0.5667), -1, 13.0, [9, 0.14, 28], SAND_DUSK);
      fence(0.552, 0.584, -1, 17, 3.2, [0.58, 0.60, 0.60]);
      for (let i = 0; i < 16; i++) {
        const j = hash(i * 89 + 37);
        pine(K(0.548 + i * 0.0026), -1, 19 + j * 7, 16 + j * 8, pineCol(j));
        if (j > 0.5) pine(K(0.548 + i * 0.0026), -1, 31 + j * 8, 17 + j * 6, pineCol(1 - j));
        pine(K(0.548 + i * 0.0026), -1, 44 + j * 16, 18 + j * 8, farCol(j));
      }
      forestEdge(0.540, 0.600, -1, 18, { spacing: 11 });
      forestEdge(0.544, 0.596, -1, 40, { spacing: 13 });
      // Infield side is pine to the kerb as well — this corner is a slot.
      for (let i = 0; i < 12; i++) {
        const j = hash(i * 149 + 67);
        pine(K(0.550 + i * 0.0028), 1, 18 + j * 10, 15 + j * 8, pineCol(j));
      }

      // === 13. s 0.715 +1 22 — BOLDERBERGHAARSPELDBOCHT (T7) =============
      spectatorHill(0.702, 0.730, 1, 24);
      grandstandEx(0.7153, 1, 30, 48, null, null);
      guardrail(0.700, 0.734, 1, 22, RAIL);
      tyreWall(0.702, 0.732, 1, 21.2, TYRE_CAP);
      tyreWall(0.700, 0.706, 1, 21.2, TYRE_CAP2);
      marshalPost(K(0.730), 1, 24);
      marshalPost(K(0.700), -1, 16);
      billboard(K(0.694), 1, 24, 12, 4.5, [0.80, 0.26, 0.18]);
      // The outside of the hairpin runs within a patch width of the approach,
      // so the sand sits out past the barrier line — at gap 4 the engine
      // refused it and the run-off was simply missing.
      groundPatch(K(0.7153), -1, 12.0, [17, 0.15, 34], SAND_PALE);
      groundPatch(K(0.7080), -1, 12.0, [13, 0.14, 26], SAND);
      guardrail(0.698, 0.736, -1, 16, RAIL);
      tyreWall(0.704, 0.728, -1, 15.4, TYRE_CAP2);
      for (let i = 0; i < 12; i++) {
        const j = hash(i * 43 + 47);
        pine(K(0.690 + i * 0.0042), -1, 24 + j * 14, 16 + j * 8, pineCol(j));
      }
      for (let i = 0; i < 14; i++) {
        const j = hash(i * 181 + 29);
        pine(K(0.686 + i * 0.0040), -1, 46 + j * 24, 17 + j * 9, farCol(j));
      }

      // === 14. s 0.863 +1 18 — TERLAMENBOCHT ENTRY (T8) ==================
      grandstandEx(0.8628, 1, 20, 70, null, null);
      guardrail(0.852, 0.874, 1, 16, RAIL);
      sponsorHoarding(0.850, 0.876, 1, 13.5);
      marshalPost(K(0.8628), 1, 18);
      fence(0.848, 0.878, 1, 30, 3.4, [0.58, 0.60, 0.60]);
      if (clear(K(0.8628), 1, 44, 24, 40, 10)) {
        groundPatch(K(0.8628), 1, 44, [24, 0.14, 40], SAND_DUSK);
      }

      // === 15. s 0.879 -1 22 — TERLAMENBOCHT EXIT (T9) ===================
      // The last of the pine before the paddock reopens.
      guardrail(0.870, 0.892, -1, 20, RAIL);
      tyreWall(0.872, 0.890, -1, 19.4, TYRE_CAP2);
      tyreWall(0.870, 0.876, -1, 19.4, TYRE_CAP);
      cameraTower(K(0.8792), -1, 24);
      for (let i = 0; i < 4; i++) {
        billboard(K(0.868 + i * 0.0075), -1, 30, 11, 4.2,
          i % 2 ? [0.15, 0.32, 0.56] : [0.86, 0.84, 0.22]);
      }
      groundPatch(K(0.8792), -1, 14.0, [10, 0.14, 34], SAND_PALE);
      forestEdge(0.850, 0.910, -1, 38, { spacing: 13 });
      for (let i = 0; i < 14; i++) {
        const j = hash(i * 73 + 53);
        pine(K(0.848 + i * 0.0044), -1, 40 + j * 14, 16 + j * 8, pineCol(j));
      }
      for (let i = 0; i < 16; i++) {
        const j = hash(i * 191 + 11);
        pine(K(0.846 + i * 0.0042), -1, 58 + j * 26, 17 + j * 9, farCol(j));
      }

      // === 16. s 0.924 +1 16 — JOCHEN RINDT BOCHT (T10) ==================
      guardrail(0.912, 0.940, 1, 14, RAIL);
      marshalPost(K(0.938), 1, 16);
      sponsorHoarding(0.930, 0.958, 1, 12);
      for (let i = 0; i < 5; i++) {
        const j = hash(i * 107 + 61);
        building(K(0.906 + i * 0.0086), 1, 22 + j * 6, 14, 5.2, 11,
          { wall: j < 0.5 ? GREY : WHITE });
      }
      for (let i = 0; i < 6; i++) {
        const j = hash(i * 113 + 7);
        motorhome(K(0.908 + i * 0.0072), 1, 40, 10, 6.4 + j * 1.4, 14,
          { wall: j < 0.5 ? [0.89, 0.89, 0.88] : [0.80, 0.81, 0.83] });
      }
      groundPatch(K(0.9237), 1, 30, [30, 0.14, 70], CONCRETE);
      tyreWall(0.914, 0.922, 1, 13.4, TYRE_CAP);

      // === 17. §5 THE FAST SWEEPERS THROUGH THE PINE =====================
      // Between the Kleine chicane and the hairpin, and again out of Terlamen,
      // the circuit is a road through a plantation: no barriers to look at, no
      // stands, nothing but trunks going past at speed. That stretch needs the
      // pine ranked tight and close or it reads as empty, so it gets its own
      // pass rather than relying on the global scatter.
      for (const [s0, s1] of [[0.602, 0.688], [0.748, 0.836]]) {
        const steps = Math.round((s1 - s0) * 300);
        for (let i = 0; i < steps; i++) {
          const s = s0 + (i / steps) * (s1 - s0);
          const j = hash(i * 211 + 97);
          const j2 = hash(i * 223 + 41);
          for (const side of [-1, 1]) {
            const near = (side < 0 ? 16 : 17) + j * 7;
            const a = anchor(K(s), side, near);
            if (a && !onTrack(a.c[0], a.c[2], 8) && j > 0.14) {
              pine(K(s), side, near, 15 + j2 * 9, pineCol(j2));
            }
            if (j2 > 0.55) {
              const mid = 30 + j2 * 14;
              const b = anchor(K(s), side, mid);
              if (b && !onTrack(b.c[0], b.c[2], 9)) {
                pine(K(s), side, mid, 17 + j * 8, pineCol(1 - j));
              }
            }
          }
          if (j > 0.88) bush(K(s), -1, 13 + j2 * 4, SCRUB);
          if (j2 > 0.93) tree(K(s), 1, 22 + j * 8, 9 + j * 5, BIRCH);
        }
      }
      forestEdge(0.604, 0.686, 1, 46, { spacing: 13 });
      forestEdge(0.750, 0.834, -1, 48, { spacing: 13 });
  };
