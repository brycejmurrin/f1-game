/* Apex 26 — ANDERSTORP scenery (data only), split out of js/circuits/anderstorp.js.
   LAZY_SCENERY (tools/manifest.cjs): no <script> tag.

   Scandinavian Raceway — a working airfield in the Smaland pine forest.
   Brief: docs/tracks/anderstorp.md. Numbered blocks below map to its §4 rows:

     0  palette + lap-position helpers (§2 northern light, §3 DEAD FLAT)
     1  forest shell + armco shell, runway corridor cut out   (§4 0.020/0.150/0.245, §5)
     2  start/finish complex                                   (§4 0.005 +1)
     3  pit-straight outside: colonnade pine + hoarding        (§4 0.020 -1)
     4  Turn 1: grey sand, tyres, camera tower                 (§4 0.045 -1)
     5  infield paddock: corrugated rank + motorhomes          (§4 0.095 +1)
     6  pine right up to the armco                             (§4 0.150 -1)
     7  Turns 2-3 Sodra Kurvan: mown infield, low hill         (§4 0.185 +1)
     8  back into the trees: flag/timing hut                   (§4 0.245 -1)
     9  Turn 4 Opel Kurvan: hoarding, tyres, low hill          (§4 0.330 -1)
    10  infield scrub between the loops                        (§4 0.400 +1)
    11  Turn 5: long constant radius                           (§4 0.480 -1)
    12  Turn 6 — ONTO THE RUNWAY, the corridor opens           (§4 0.556 +1, §6)
    13  airfield apron: hangars, flying club, parked aircraft  (§4 0.640 +1)
    14  runway far side: mown grass to a distant treeline      (§4 0.740 -1)
    15  end of the apron: sheds, concrete gives way            (§4 0.820 +1)
    16  Turn 7 — off the runway, the corridor narrows          (§4 0.860 -1)
    17  Turn 8: long banked final corner onto the pit straight (§4 0.920 -1)

   Nothing taller than a treetop, nothing grand: low timber and corrugated.
   Depth comes from RANKS — front row, second rank, then pine receding into
   northern haze — not from height. Pines are instanced and cost no prop
   verts, so the forest is built out of pine, never out of forestEdge bulk. */
"use strict";
(window.TrackScenery = window.TrackScenery || {})["anderstorp"] =
  function (api) {
      const { out,
        n, hash, every, anchor, onTrack,
        pine, tree, bush, forestEdge,
        building, grandstandEx, spectatorHill, terrace,
        guardrail, fence, tyreWall,
        marshalPost, cameraTower, billboard, sponsorHoarding, gantry,
        motorhome, groundPatch, runoffApron, place } = api;

      // ---------------------------------------------------------------- 0.
      // Lap-position helper + the cool northern palette. Pine is dark and
      // desaturated; sand run-off is pale grey (wet concrete), never golden.
      const K = (s) => Math.round(s * n) % n;
      const pick = (h, arr) => arr[Math.min(arr.length - 1, Math.floor(h * arr.length))];

      const PINE      = [0.09, 0.20, 0.13];   // Scots pine canopy, deep + cold
      const PINE_D    = [0.07, 0.16, 0.11];   // shaded rank behind
      const PINE_L    = [0.12, 0.25, 0.16];   // sunlit crown
      const PINE_O    = [0.13, 0.22, 0.12];   // older stand, olive-tinged
      const PINE_B    = [0.10, 0.17, 0.19];   // far rank, blue-shifted by haze
      const PINE_F    = [0.12, 0.18, 0.22];   // furthest rank, nearly sky colour
      const SPRUCE    = [0.07, 0.17, 0.15];   // spruce mixed into the pine
      const BIRCH     = [0.36, 0.46, 0.25];   // pale birch breaking the green
      const SCRUB     = [0.24, 0.33, 0.18];   // thin birch/scrub in the infield
      const BUSH      = [0.16, 0.26, 0.14];
      const JUNIPER   = [0.20, 0.28, 0.20];
      const GRASS     = [0.31, 0.41, 0.22];   // mown airfield grass
      const GRASS_M   = [0.35, 0.45, 0.24];   // freshly cut, lighter
      const GRASS_S   = [0.40, 0.43, 0.27];   // sandy grass at the field edge
      const SAND      = [0.60, 0.61, 0.59];   // PALE GREY run-off
      const SAND_D    = [0.53, 0.55, 0.54];   // damper grey beyond the apron
      const CONCRETE  = [0.63, 0.64, 0.62];   // aged apron
      const CONC_W    = [0.68, 0.69, 0.66];   // bleached slab
      const CONC_D    = [0.55, 0.56, 0.55];   // oil-stained hardstanding
      const HARDSTAND = [0.52, 0.53, 0.52];   // paddock hardstanding
      const ARMCO     = [0.76, 0.78, 0.80];
      const PAINT     = [0.80, 0.80, 0.76];   // faded runway markings
      const PAINT_Y   = [0.72, 0.65, 0.31];   // faded airfield yellow
      const CORR_BLUE = [0.36, 0.45, 0.52];   // faded ribbed metal
      const CORR_CREAM= [0.76, 0.73, 0.63];
      const CORR_SILV = [0.58, 0.60, 0.61];   // dull silver-grey hangar
      const CORR_RUST = [0.47, 0.37, 0.30];   // streaked, weathered rank
      const CORR_GRN  = [0.31, 0.38, 0.33];
      const FALU      = [0.42, 0.17, 0.13];   // faluröd — the Swedish barn red
      const FALU_D    = [0.33, 0.14, 0.11];
      const TRIM      = [0.88, 0.87, 0.83];   // white corner/window trim
      const TIMBER    = [0.45, 0.36, 0.26];
      const WHITEGREY = [0.80, 0.80, 0.79];   // race control
      const STEEL     = [0.55, 0.57, 0.58];
      const ALU       = [0.73, 0.75, 0.76];   // light-aircraft skin
      const AC_RED    = [0.62, 0.20, 0.18];
      const AC_BLUE   = [0.25, 0.35, 0.53];
      const DRUM      = [0.30, 0.38, 0.30];
      const ORANGE    = [0.70, 0.40, 0.14];   // recovery vehicle
      const TYRE_K    = [0.18, 0.20, 0.22];
      const TYRE_R    = [0.70, 0.16, 0.14];

      const NEAR_PINE = [PINE, PINE_L, PINE_O];
      const MID_PINE  = [PINE_D, SPRUCE, PINE];
      const FAR_PINE  = [PINE_D, PINE_B, SPRUCE];

      // The runway corridor. Inside it the forest and the armco stand back;
      // everywhere else the pine is on top of you. That contrast is the lap.
      const RW0 = 0.545, RW1 = 0.875;
      const onRunway = (s) => s > RW0 && s < RW1;

      // The lap folds back on itself twice, so anything set far off the
      // verge can land on ANOTHER part of the circuit. Every deep rank and
      // every outfield structure is clearance-checked before it is emitted.
      const clear = (k, side, d, r) => {
        const a = anchor(k, side, d);
        return !onTrack(a.c[0], a.c[2], r === undefined ? 10 : r);
      };
      const farPine = (k, side, d, ht, col) => { if (clear(k, side, d)) pine(k, side, d, ht, col); };
      const farTree = (k, side, d, ht, col) => { if (clear(k, side, d, 12)) tree(k, side, d, ht, col); };

      // A parked light aircraft, drawn as four ground-anchored boxes: cabin,
      // high wing, tailplane and fin, the tail set ~6 m aft of the wing.
      const aircraft = (s, gap, skin) => {
        place(K(s), 1, gap, [1.5, 2.1, 6.0], skin);              // fuselage
        place(K(s), 1, gap, [10.6, 0.55, 1.4], skin);            // high wing
        place(K(s - 0.0016), 1, gap, [3.4, 0.45, 0.9], skin);    // tailplane
        place(K(s - 0.0016), 1, gap, [0.35, 2.3, 1.6], AC_RED);  // fin
      };

      // Distance boards on the approach to a braking zone: three white
      // boards stepping back from the corner, the way a marshal post does.
      const boards = (s0, side, gap, step) => {
        for (let i = 0; i < 3; i++) {
          place(K(s0 - (i + 1) * step), side, gap, [0.25, 1.7, 1.3], TRIM);
          place(K(s0 - (i + 1) * step), side, gap, [0.28, 0.35, 1.4], TYRE_K);
        }
      };

      // ---------------------------------------------------------------- 1.
      // FOREST + ARMCO SHELL. Dense ranks of tall bare-trunked Scots pine set
      // only a few metres back, canopy high enough that the trunks read as a
      // colonnade. SEVEN ranks now — the far ones cool towards the sky so the
      // wall of green has depth instead of being a flat curtain. The runway
      // corridor is cut out of every one of them.
      every(5, (k) => {
        const s = k / n;
        const h = hash(k * 37);
        const h2 = hash(k * 71 + 5);
        const h3 = hash(k * 101 + 13);
        for (const side of [-1, 1]) {
          // Runway: no pine on the apron side at all, and the far-side
          // treeline is pushed a long way out (block 14 handles it).
          if (onRunway(s)) continue;
          const near = 13 + h * 5;
          if (h > 0.18) {
            const a = anchor(k, side, near);
            if (!onTrack(a.c[0], a.c[2], 7)) {
              pine(k, side, near, 17 + h * 9, pick(h, NEAR_PINE));
            }
          }
          if (h2 > 0.24) pine(k, side, 22 + h2 * 7, 15 + h2 * 10, pick(h2, MID_PINE));
          if (h2 < 0.58) {
            const d = 16 + h2 * 4;
            if (clear(k, side, d, 8)) pine(k, side, d, 16 + h2 * 11, pick(h2, NEAR_PINE));
          }
          if (h2 > 0.62) farPine(k, side, 32 + h * 9, 14 + h * 9, pick(h, FAR_PINE));
          // Depth BEHIND the front row: four receding ranks, cooling off.
          if (h3 > 0.28) farPine(k, side, 45 + h3 * 13, 15 + h3 * 9, pick(h3, FAR_PINE));
          if (h3 > 0.52) farPine(k, side, 62 + h * 17, 14 + h2 * 10, PINE_B);
          if (h3 > 0.74) farPine(k, side, 86 + h2 * 24, 16 + h3 * 8, PINE_B);
          if (h3 > 0.90) farPine(k, side, 118 + h * 34, 18 + h * 8, PINE_F);
          if (h < 0.12) bush(k, side, 11 + h * 3, BUSH);
          if (h < 0.07) bush(k, side, 17 + h2 * 5, JUNIPER);
          // A few pale birch trunks at the edge so the green is not uniform.
          if (h > 0.93 && h2 < 0.34) farTree(k, side, 25 + h2 * 11, 9 + h2 * 4, BIRCH);
        }
      });

      // Bulk treeline behind the ranks, everywhere but the runway.
      forestEdge(0.875, 1.0, -1, 26, { col: PINE_D });
      forestEdge(0.0, 0.545, -1, 24, { col: PINE_D });
      forestEdge(0.875, 1.0, 1, 30, { col: PINE_D });
      forestEdge(0.0, 0.070, 1, 34, { col: PINE_D });
      forestEdge(0.210, 0.545, 1, 34, { col: PINE_D });

      // Armco. Continuous and close everywhere except the runway, where it
      // pulls right back and the whole corridor opens.
      guardrail(0.875, 1.0, -1, 9, ARMCO);
      guardrail(0.0, 0.545, -1, 9, ARMCO);
      guardrail(0.875, 1.0, 1, 11, ARMCO);
      guardrail(0.0, 0.545, 1, 12, ARMCO);
      guardrail(RW0, RW1, 1, 30, ARMCO);   // pulled back along the apron
      guardrail(RW0, RW1, -1, 34, ARMCO);  // pulled back along the grass

      // ---------------------------------------------------------------- 2.
      // 0.005 +1 — START/FINISH. Two low open-backed stands on the infield,
      // timber decking over a steel frame; race control squat behind them,
      // and behind THAT the working paddock — a rank of garages, a timing
      // hut and an annex, so the complex has three planes of depth.
      grandstandEx(0.988, 1, 14, 105, null, null);
      grandstandEx(0.030, 1, 14, 85, null, null);
      grandstandEx(0.062, 1, 16, 46, null, null);   // third, smaller block
      building(K(0.012), 1, 40, 14, 9, 34, { col: WHITEGREY });   // race control
      building(K(0.012), 1, 58, 10, 5.5, 22, { col: CORR_CREAM }); // annex behind
      building(K(0.031), 1, 44, 8, 10.5, 9, { col: WHITEGREY });   // timing tower
      building(K(0.045), 1, 42, 9, 5.0, 18, { col: FALU });        // timekeepers
      building(K(0.054), 1, 46, 7, 4.2, 12, { col: TIMBER });
      // Pit garages: a long low rank tucked in behind the stands.
      for (let i = 0; i < 6; i++) {
        building(K(0.970 + i * 0.0092), 1, 30, 9, 4.6, 15,
          { col: i % 2 ? CORR_CREAM : CORR_SILV });
      }
      groundPatch(K(0.005), 1, 3, [11, 0.18, 44], SAND);
      groundPatch(K(0.025), 1, 3, [11, 0.16, 44], SAND);
      groundPatch(K(0.984), 1, 22, [26, 0.20, 40], HARDSTAND);
      groundPatch(K(0.008), 1, 22, [26, 0.17, 40], HARDSTAND);
      groundPatch(K(0.032), 1, 22, [26, 0.20, 40], CONC_D);
      marshalPost(K(0.0), 1, 12);
      marshalPost(K(0.046), 1, 12);
      cameraTower(K(0.018), 1, 15);
      gantry(0.0, 8.5, [0.80, 0.80, 0.78]);
      fence(0.975, 0.050, 1, 30, 2.2, [0.62, 0.63, 0.62]);
      fence(0.958, 0.072, 1, 68, 1.8, [0.55, 0.57, 0.55]);   // paddock boundary
      // Flagpoles at the line — bare masts, national colours on the boards.
      for (let i = 0; i < 6; i++) place(K(0.994 + i * 0.0030), 1, 27, [0.30, 9.5, 0.30], TRIM);
      // TV compound tucked in behind race control.
      for (let i = 0; i < 3; i++) {
        const k = K(0.016 + i * 0.0080), g = 62 + (i % 2) * 5;
        if (clear(k, 1, g, 14)) motorhome(k, 1, g, 10, 3.6, 4.0, {});
      }
      place(K(0.022), 1, 70, [3.2, 3.2, 3.2], TRIM);        // satellite dish
      place(K(0.006), 1, 64, [2.0, 2.0, 5.0], STEEL);       // generator set
      billboard(K(0.982), 1, 17, 9, 3.6, [0.24, 0.36, 0.60]);
      billboard(K(0.040), 1, 17, 9, 3.6, [0.84, 0.82, 0.76]);

      // ---------------------------------------------------------------- 3.
      // 0.020 -1 — the cheap side of the pit straight: one run of armco, then
      // pine a few metres back, and one weathered hoarding breaking the green.
      // A second rank and a scatter of birch keep the colonnade from reading
      // as a single painted wall.
      for (let i = 0; i < 22; i++) {
        const s = 0.965 + i * 0.0042;
        const k = K(s);
        pine(k, -1, 11 + hash(k * 13) * 3, 18 + hash(k * 17) * 8, PINE);
      }
      for (let i = 0; i < 18; i++) {
        const s = 0.962 + i * 0.0050;
        const k = K(s);
        const h = hash(k * 53 + 9);
        pine(k, -1, 18 + h * 7, 16 + h * 9, h < 0.4 ? SPRUCE : PINE_D);
        if (h > 0.78) tree(k, -1, 14 + h * 4, 10 + h * 3, BIRCH);
      }
      sponsorHoarding(0.028, 0.056, -1, 11, {});
      sponsorHoarding(0.978, 0.996, -1, 12, {});
      billboard(K(0.010), -1, 12, 8, 3.2, [0.86, 0.84, 0.78]);

      // ---------------------------------------------------------------- 4.
      // 0.045 -1 — TURN 1. Pale grey sand run-off, tyre stack, forest right
      // behind it; camera tower outside so the corner shoots down the
      // straight. A marshal hut, a recovery truck and spare tyre stacks put
      // people into the picture behind the barrier.
      runoffApron(K(0.048), -1, 2, 30, SAND);
      runoffApron(K(0.062), -1, 2, 26, SAND);
      groundPatch(K(0.056), -1, 16, [16, 0.18, 26], SAND_D);
      tyreWall(0.038, 0.078, -1, 16, TYRE_R);
      tyreWall(0.028, 0.038, -1, 17, TYRE_K);
      marshalPost(K(0.050), -1, 20);
      marshalPost(K(0.068), -1, 20);
      cameraTower(K(0.070), -1, 24);
      building(K(0.058), -1, 26, 5, 3.6, 6, { col: FALU });   // marshal hut
      place(K(0.043), -1, 23, [2.4, 1.3, 5.2], ORANGE);        // recovery truck
      for (let i = 0; i < 4; i++) {
        place(K(0.066 + i * 0.0030), -1, 22, [1.8, 1.4, 1.8], TYRE_K);
      }
      boards(0.045, -1, 12, 0.0124);
      forestEdge(0.030, 0.095, -1, 22, { col: PINE });

      // ---------------------------------------------------------------- 5.
      // 0.095 +1 — INFIELD PADDOCK. A low corrugated rank in faded blue and
      // cream, single storey, with motorhomes nose-in on grey hardstanding.
      // This is the working part of the site and it looks it: a second and a
      // third rank of sheds behind the first, transporters, drums, a silo.
      groundPatch(K(0.100), 1, 24, [46, 0.18, 60], HARDSTAND);
      groundPatch(K(0.125), 1, 24, [40, 0.16, 54], HARDSTAND);
      groundPatch(K(0.148), 1, 26, [30, 0.20, 40], CONC_D);
      building(K(0.090), 1, 28, 12, 6.5, 30, { col: CORR_BLUE });
      building(K(0.108), 1, 28, 12, 6.0, 26, { col: CORR_CREAM });
      building(K(0.126), 1, 30, 11, 6.5, 22, { col: CORR_BLUE });
      building(K(0.144), 1, 30, 10, 5.5, 18, { col: CORR_RUST });
      // Second rank — the sheds you only see over the roofs of the first.
      building(K(0.096), 1, 58, 14, 7.5, 34, { col: CORR_SILV });
      building(K(0.122), 1, 58, 13, 7.0, 28, { col: CORR_GRN });
      building(K(0.142), 1, 56, 9, 5.0, 16, { col: FALU });
      building(K(0.112), 1, 80, 12, 6.0, 24, { col: CORR_CREAM });  // workshop
      for (let i = 0; i < 5; i++) {
        motorhome(K(0.094 + i * 0.011), 1, 48 + (i % 2) * 5, 9, 3.4, 4.2, {});
      }
      for (let i = 0; i < 4; i++) {   // transporters, parked square-on
        motorhome(K(0.132 + i * 0.0090), 1, 44 + (i % 2) * 4, 11, 3.8, 4.4, {});
      }
      place(K(0.104), 1, 40, [2.6, 2.6, 6.0], STEEL);        // fuel bowser
      place(K(0.118), 1, 42, [2.2, 1.1, 4.4], DRUM);
      for (let i = 0; i < 6; i++) {
        place(K(0.094 + i * 0.0080), 1, 37, [1.2, 1.0, 1.2], i % 2 ? DRUM : ORANGE);
      }
      place(K(0.136), 1, 66, [4.6, 11, 4.6], ALU);           // fuel silo
      place(K(0.136), 1, 74, [3.0, 7.5, 3.0], STEEL);
      fence(0.078, 0.166, 1, 22, 2.2, [0.58, 0.60, 0.58]);
      marshalPost(K(0.115), 1, 13);
      // Forest closing the paddock off at the back — the site is a clearing.
      for (let i = 0; i < 20; i++) {
        const k = K(0.072 + i * 0.0070);
        const h = hash(k * 131 + 27);
        farPine(k, 1, 96 + h * 30, 16 + h * 9, PINE_B);
        if (h > 0.45) farPine(k, 1, 134 + h * 40, 17 + h * 8, PINE_F);
      }

      // ---------------------------------------------------------------- 6.
      // 0.150 -1 — PINE RIGHT UP TO THE ARMCO. No run-off worth the name; the
      // shadow banding across the track is the dominant lighting effect here.
      for (let i = 0; i < 30; i++) {
        const s = 0.130 + i * 0.0028;
        const k = K(s);
        const h = hash(k * 29 + 3);
        pine(k, -1, 10.5 + h * 2.5, 19 + h * 9, h < 0.5 ? PINE : PINE_L);
        if (h > 0.45) pine(k, -1, 17 + h * 4, 16 + h * 8, PINE_D);
        if (h > 0.30) farPine(k, -1, 27 + h * 8, 15 + h * 9, SPRUCE);
        if (h > 0.70) farPine(k, -1, 42 + h * 12, 15 + h * 8, PINE_B);
      }
      marshalPost(K(0.160), -1, 13);
      bush(K(0.142), -1, 9, JUNIPER);
      bush(K(0.166), -1, 9, BUSH);

      // ---------------------------------------------------------------- 7.
      // 0.185 +1 — TURNS 2-3, SODRA KURVAN. The south loop opens out: mown
      // grass infield and a low bank (a metre or two — this site is FLAT).
      // The public side of the circuit: a commentary hut, a refreshment
      // shed, campers parked on the grass behind the bank.
      groundPatch(K(0.185), 1, 14, [48, 0.18, 62], GRASS);
      groundPatch(K(0.205), 1, 14, [44, 0.16, 56], GRASS);
      groundPatch(K(0.226), 1, 16, [34, 0.20, 44], GRASS_M);
      spectatorHill(0.172, 0.212, 1, 22, {});
      marshalPost(K(0.178), 1, 14);
      marshalPost(K(0.208), 1, 14);
      billboard(K(0.186), 1, 17, 9, 3.6, [0.86, 0.84, 0.78]);
      billboard(K(0.200), 1, 17, 9, 3.6, [0.78, 0.30, 0.22]);
      billboard(K(0.214), 1, 17, 9, 3.6, [0.24, 0.36, 0.60]);
      billboard(K(0.228), 1, 18, 8, 3.2, [0.82, 0.76, 0.34]);
      building(K(0.192), 1, 40, 6, 4.4, 8, { col: FALU });     // commentary hut
      building(K(0.216), 1, 38, 8, 3.8, 12, { col: TIMBER });  // refreshments
      building(K(0.204), 1, 54, 7, 4.0, 10, { col: FALU_D });
      for (let i = 0; i < 4; i++) {
        const k = K(0.190 + i * 0.0095), g = 40 + (i % 2) * 5;
        if (clear(k, 1, g, 14)) motorhome(k, 1, g, 7, 3.0, 3.6, {});
      }
      fence(0.166, 0.234, 1, 32, 1.8, [0.58, 0.60, 0.58]);
      for (let i = 0; i < 14; i++) {   // scattered pine closing the south loop
        const s = 0.168 + i * 0.0052;
        const k = K(s);
        const h = hash(k * 59 + 21);
        if (h < 0.25) continue;
        farPine(k, 1, 68 + h * 26, 15 + h * 9, pick(h, FAR_PINE));
        if (h > 0.70) farTree(k, 1, 46 + h * 14, 8 + h * 4, BIRCH);
      }

      // ---------------------------------------------------------------- 8.
      // 0.245 -1 — BACK INTO THE TREES. A small wooden flag/timing hut, a
      // woodpile and a gravel access track are the only human marks; the
      // forest does the rest of the work.
      forestEdge(0.225, 0.300, -1, 16, { col: PINE });
      building(K(0.245), -1, 16, 5, 4.0, 7, { col: TIMBER });
      building(K(0.268), -1, 18, 4, 3.2, 5, { col: FALU });
      place(K(0.256), -1, 17, [2.0, 1.6, 6.0], TIMBER);        // stacked cordwood
      place(K(0.262), -1, 17, [2.0, 1.4, 5.0], TIMBER);
      groundPatch(K(0.252), -1, 13, [7, 0.18, 34], HARDSTAND); // access track
      groundPatch(K(0.272), -1, 13, [7, 0.16, 34], HARDSTAND);
      marshalPost(K(0.252), -1, 12);
      marshalPost(K(0.282), -1, 12);
      for (let i = 0; i < 16; i++) {
        const s = 0.222 + i * 0.0050;
        const k = K(s);
        const h = hash(k * 67 + 31);
        pine(k, -1, 13 + h * 5, 18 + h * 9, h < 0.45 ? PINE : PINE_O);
        if (h > 0.55) farPine(k, -1, 24 + h * 9, 16 + h * 9, SPRUCE);
      }

      // ---------------------------------------------------------------- 9.
      // 0.330 -1 — TURN 4, OPEL KURVAN. Named for the sponsor: a hoarding run
      // on the outside, tyres in front of it, grey sand, then forest. A low
      // bank outside the barrier with a camera tower behind it, a scoreboard
      // shed and a marshal post on the bank.
      runoffApron(K(0.326), -1, 2, 28, SAND);
      runoffApron(K(0.344), -1, 2, 24, SAND);
      groundPatch(K(0.336), -1, 14, [14, 0.18, 26], SAND_D);
      tyreWall(0.318, 0.352, -1, 15, TYRE_R);
      sponsorHoarding(0.316, 0.356, -1, 19, {});
      sponsorHoarding(0.296, 0.312, -1, 17, {});
      spectatorHill(0.320, 0.350, -1, 26, {});
      cameraTower(K(0.336), -1, 36);
      marshalPost(K(0.324), -1, 14);
      marshalPost(K(0.348), -1, 14);
      building(K(0.356), -1, 30, 7, 5.5, 9, { col: CORR_BLUE });  // scoreboard
      building(K(0.310), -1, 32, 5, 3.6, 7, { col: FALU });       // marshal hut
      for (let i = 0; i < 3; i++) {
        place(K(0.352 + i * 0.0028), -1, 21, [1.8, 1.4, 1.8], TYRE_K);
      }
      billboard(K(0.366), -1, 16, 8, 3.2, [0.82, 0.76, 0.34]);
      boards(0.328, -1, 12, 0.0124);
      forestEdge(0.300, 0.380, -1, 30, { col: PINE_D });

      // --------------------------------------------------------------- 10.
      // 0.400 +1 — INFIELD SCRUB between the loops. Sandy grass, scattered
      // thin stuff rather than solid forest: the sightlines open up and you
      // can already see the hangars ahead. Patch colour breaks up so the
      // ground does not read as one flat card.
      groundPatch(K(0.395), 1, 26, [52, 0.18, 70], [0.42, 0.44, 0.28]);
      groundPatch(K(0.425), 1, 26, [46, 0.16, 64], [0.42, 0.44, 0.28]);
      groundPatch(K(0.380), 1, 30, [30, 0.20, 44], GRASS_S);
      groundPatch(K(0.448), 1, 28, [28, 0.17, 42], GRASS_S);
      for (let i = 0; i < 16; i++) {
        const s = 0.370 + i * 0.0055;
        const k = K(s);
        const h = hash(k * 19 + 7);
        if (h < 0.30) continue;
        if (h < 0.62) farTree(k, 1, 30 + h * 22, 6 + h * 4, SCRUB);
        else farPine(k, 1, 30 + h * 26, 11 + h * 6, PINE_D);
        if (h > 0.85) bush(k, 1, 24 + h * 10, BUSH);
        if (h > 0.40) farPine(k, 1, 74 + h * 30, 14 + h * 9, PINE_B);
      }
      marshalPost(K(0.404), 1, 15);
      bush(K(0.416), 1, 20, JUNIPER);
      bush(K(0.434), 1, 22, BUSH);

      // --------------------------------------------------------------- 11.
      // 0.480 -1 — TURN 5. Long constant-radius corner. Armco with a tyre
      // wall on the exit, forest close behind, a billboard at turn-in, and a
      // grey sand strip between kerb and barrier. A timing hut on the outside
      // and a second rank of spruce behind the near pine.
      runoffApron(K(0.470), -1, 2, 16, SAND);
      runoffApron(K(0.492), -1, 2, 16, SAND);
      runoffApron(K(0.510), -1, 2, 16, SAND);
      billboard(K(0.466), -1, 13, 8, 3.2, [0.84, 0.82, 0.76]);
      billboard(K(0.500), -1, 13, 8, 3.2, [0.30, 0.42, 0.66]);
      tyreWall(0.506, 0.534, -1, 13, TYRE_K);
      marshalPost(K(0.488), -1, 14);
      marshalPost(K(0.516), -1, 14);
      building(K(0.478), -1, 22, 5, 3.8, 7, { col: FALU });
      building(K(0.520), -1, 24, 6, 4.2, 9, { col: TIMBER });
      groundPatch(K(0.484), -1, 12, [12, 0.18, 30], SAND_D);
      groundPatch(K(0.506), -1, 12, [12, 0.20, 30], SAND_D);
      fence(0.450, 0.538, -1, 18, 1.6, [0.58, 0.60, 0.58]);
      for (let i = 0; i < 3; i++) {
        place(K(0.522 + i * 0.0026), -1, 19, [1.8, 1.4, 1.8], TYRE_K);
      }
      sponsorHoarding(0.452, 0.472, -1, 16, {});
      for (let i = 0; i < 18; i++) {
        const s = 0.444 + i * 0.0056;
        const k = K(s);
        const h = hash(k * 83 + 17);
        if (h > 0.35) farPine(k, -1, 21 + h * 7, 16 + h * 9, SPRUCE);
        if (h > 0.66) farPine(k, -1, 36 + h * 12, 15 + h * 9, PINE_B);
      }
      forestEdge(0.440, 0.545, -1, 20, { col: PINE });

      // --------------------------------------------------------------- 12.
      // 0.556 +1 — TURN 6, ONTO THE RUNWAY. The identifying feature of the
      // circuit: the surface widens, a concrete apron spreads to the infield
      // with faded edge markings, and the armco steps back (block 1). The
      // apron is laid as one long run of concrete groundPatch so the corridor
      // reads as a runway rather than a road with trees off it.
      // FOOTPRINT RULE: groundPatch is validated twice (declared box and
      // emitted box), so a long slab swung through a bend is rejected —
      // 30 m slabs for the first four steps out of T6, 44 m thereafter, and
      // alternating 0.17/0.20 thickness so abutting tops never co-plane.
      const APR0 = 0.564, APR1 = 0.850;
      for (let i = 0; i < 30; i++) {
        const s = APR0 + (i / 29) * (APR1 - APR0);
        const k = K(s);
        const th = (i & 1) ? 0.20 : 0.17;
        // Flare: the apron opens out over the first ~150 m of the corridor.
        const f = Math.min(1, 0.45 + i * 0.14);
        const ln = i < 4 ? 30 : 44;   // short slabs while T6 is still bending
        groundPatch(k, 1, 6, [26 * f, th, ln], CONCRETE);
        groundPatch(k, 1, 30, [24 * f, th, ln], CONCRETE);
        // Weathering: every third bay is a bleached or oil-darkened slab so
        // the concrete reads as poured in panels, not rolled as one sheet.
        if (i % 3 === 1) groundPatch(k, 1, 12, [9 * f, th + 0.02, ln - 8], CONC_W);
        if (i % 5 === 2) groundPatch(k, 1, 22, [8 * f, th + 0.02, ln - 10], CONC_D);
      }
      // Faded painted runway edge markings down the apron side.
      for (let i = 0; i < 26; i++) {
        const s = RW0 + 0.004 + (i / 25) * (RW1 - RW0 - 0.010);
        place(K(s), 1, 14, [1.6, 0.06, 9], PAINT);
      }
      // A second, outer edge line just inside the pulled-back armco, plus a
      // dashed centreline between the two — the runway's own geometry.
      for (let i = 0; i < 22; i++) {
        const s = RW0 + 0.008 + (i / 21) * (RW1 - RW0 - 0.020);
        place(K(s), 1, 27, [1.1, 0.06, 11], PAINT);
        place(K(s + 0.0035), 1, 20, [0.8, 0.06, 14], PAINT);
      }
      // Threshold bars at both ends of the runway corridor.
      for (const t of [0.570, 0.845]) {
        for (let j = 0; j < 6; j++) {
          place(K(t), 1, 7 + j * 4.2, [2.2, 0.06, 16], PAINT);
        }
      }
      marshalPost(K(0.560), 1, 26);
      cameraTower(K(0.566), 1, 34);
      billboard(K(0.552), 1, 22, 9, 3.6, [0.82, 0.80, 0.74]);
      billboard(K(0.578), 1, 24, 9, 3.6, [0.24, 0.36, 0.60]);
      // Aiming-point blocks and touchdown-zone bars: the marks that make a
      // strip of concrete read as a RUNWAY rather than a very wide car park.
      for (const t of [0.596, 0.820]) {
        place(K(t), 1, 10, [4.4, 0.06, 26], PAINT);
        place(K(t), 1, 24, [4.4, 0.06, 26], PAINT);
      }
      for (const t of [0.622, 0.664, 0.706, 0.748, 0.790]) {
        for (let j = 0; j < 2; j++) {
          place(K(t), 1, 9.5 + j * 2.8, [1.4, 0.06, 13], PAINT);
          place(K(t), 1, 23.0 + j * 2.8, [1.4, 0.06, 13], PAINT);
        }
      }
      // Runway edge lights: a low pale post every ~60 m down both sides of
      // the corridor, just inside the pulled-back armco.
      for (let i = 0; i < 22; i++) {
        const t = RW0 + 0.006 + (i / 21) * (RW1 - RW0 - 0.012);
        place(K(t), 1, 29, [0.36, 0.9, 0.36], TRIM);
        place(K(t), -1, 36, [0.36, 0.9, 0.36], TRIM);
      }
      place(K(0.574), 1, 36, [0.30, 8.5, 0.30], TRIM);     // windsock mast
      place(K(0.574), 1, 36, [1.0, 1.0, 3.6], ORANGE);     // sock, low on the mast

      // --------------------------------------------------------------- 13.
      // 0.640 +1 — AIRFIELD APRON PROPER. Two large corrugated hangars, dull
      // silver-grey, wide and low with the doors facing the runway; a third
      // set well back so the airfield has depth behind the front row; the
      // flying club and its little tower beside them; light aircraft parked
      // out on the concrete with their nose-in parking boxes painted under
      // them; fuel drums and crates along the hangar fronts.
      building(K(0.618), 1, 44, 30, 13, 52, { col: CORR_SILV });
      building(K(0.664), 1, 44, 30, 13, 52, { col: CORR_SILV });
      building(K(0.636), 1, 86, 26, 12, 46, { col: CORR_RUST });  // hangar 3, back
      building(K(0.690), 1, 46, 8, 14, 9, { col: TRIM });         // club tower
      building(K(0.700), 1, 42, 10, 6, 16, { col: CORR_CREAM });
      building(K(0.712), 1, 42, 10, 5.5, 14, { col: FALU });      // flying club
      building(K(0.676), 1, 84, 12, 6.5, 22, { col: CORR_GRN });  // maintenance
      building(K(0.606), 1, 82, 11, 6.0, 18, { col: CORR_CREAM });
      groundPatch(K(0.640), 1, 58, [60, 0.18, 84], CONCRETE);
      groundPatch(K(0.688), 1, 54, [38, 0.16, 64], CONCRETE);
      groundPatch(K(0.612), 1, 34, [14, 0.20, 44], CONC_D);   // taxiway stub
      groundPatch(K(0.656), 1, 34, [14, 0.17, 44], CONC_D);
      groundPatch(K(0.700), 1, 34, [14, 0.20, 44], CONC_W);
      fence(0.600, 0.730, 1, 40, 2.0, [0.60, 0.62, 0.60]);
      marshalPost(K(0.652), 1, 28);
      // Parked light aircraft, and the yellow parking boxes beneath them.
      aircraft(0.612, 34, ALU);
      aircraft(0.630, 35, AC_BLUE);
      aircraft(0.648, 34, ALU);
      aircraft(0.668, 35, [0.80, 0.78, 0.72]);
      aircraft(0.706, 34, ALU);
      aircraft(0.596, 35, [0.78, 0.76, 0.70]);
      aircraft(0.722, 34, AC_BLUE);
      for (let i = 0; i < 4; i++) {   // glider trailers, nose to tail
        place(K(0.734 + i * 0.0042), 1, 38, [2.2, 1.9, 7.4], ALU);
      }
      for (const s of [0.612, 0.630, 0.648, 0.668, 0.706]) {
        place(K(s), 1, 32, [12, 0.06, 0.5], PAINT_Y);
        place(K(s - 0.0022), 1, 32, [12, 0.06, 0.5], PAINT_Y);
      }
      // Hangar-front clutter: drums, crates, a fuel bowser, a tug.
      for (let i = 0; i < 8; i++) {
        place(K(0.604 + i * 0.0130), 1, 41, [1.2, 1.0, 1.2], i % 3 ? DRUM : ORANGE);
      }
      place(K(0.622), 1, 41, [2.4, 2.2, 5.4], STEEL);   // fuel bowser
      place(K(0.682), 1, 41, [1.8, 1.4, 3.0], ORANGE);  // tug
      place(K(0.694), 1, 60, [4.2, 9.0, 4.2], ALU);     // avgas tank
      // Pine closes the airfield off at the back — far enough that the
      // corridor still reads open, near enough that it is not sky behind.
      for (let i = 0; i < 22; i++) {
        const s = 0.580 + i * 0.0130;
        const k = K(s);
        const h = hash(k * 97 + 43);
        farPine(k, 1, 118 + h * 40, 16 + h * 9, PINE_B);
        if (h > 0.45) farPine(k, 1, 150 + h * 50, 17 + h * 8, PINE_F);
      }

      // --------------------------------------------------------------- 14.
      // 0.740 -1 — RUNWAY'S FAR SIDE. Flat mown grass running a long way out
      // to a DISTANT treeline: the one place on the lap where the pine is not
      // on top of you. Everything here is beyond 60 m and stays there — a
      // sparse boundary line of pine, a red barn out in the field, a windsock
      // and a few strip markers. Do not close this in.
      for (let i = 0; i < 12; i++) {
        groundPatch(K(RW0 + (i / 11) * (RW1 - RW0)), -1, 10, [82, (i & 1) ? 0.20 : 0.17, 122], GRASS);
      }
      for (let i = 0; i < 9; i++) {   // mown bands, lighter, further out
        groundPatch(K(RW0 + 0.012 + (i / 8) * (RW1 - RW0 - 0.024)), -1, 94,
          [46, (i & 1) ? 0.20 : 0.17, 120], GRASS_M);
      }
      for (let i = 0; i < 26; i++) {
        const s = RW0 + (i / 25) * (RW1 - RW0);
        const k = K(s);
        const h = hash(k * 23 + 11);
        if (h < 0.35) continue;
        farPine(k, -1, 72 + h * 14, 16 + h * 8, PINE_D);
      }
      for (let i = 0; i < 24; i++) {   // the treeline itself, receding
        const s = RW0 + 0.006 + (i / 23) * (RW1 - RW0 - 0.012);
        const k = K(s);
        const h = hash(k * 149 + 19);
        farPine(k, -1, 128 + h * 40, 16 + h * 9, PINE_B);
        if (h > 0.40) farPine(k, -1, 176 + h * 60, 17 + h * 8, PINE_F);
      }
      forestEdge(RW0, RW1, -1, 96, { col: PINE_D });
      fence(RW0 + 0.010, RW1 - 0.010, -1, 60, 1.4, [0.56, 0.58, 0.55]);
      building(K(0.762), -1, 122, 16, 8, 26, { col: FALU });    // field barn
      building(K(0.780), -1, 124, 8, 5, 12, { col: FALU_D });
      place(K(0.772), -1, 118, [4.0, 10, 4.0], ALU);            // silo
      place(K(0.700), -1, 44, [0.30, 8.0, 0.30], TRIM);         // windsock mast
      place(K(0.700), -1, 44, [1.0, 1.0, 3.4], ORANGE);
      for (let i = 0; i < 14; i++) {   // grass-strip edge markers
        const s = RW0 + 0.014 + (i / 13) * (RW1 - RW0 - 0.028);
        place(K(s), -1, 50, [0.7, 0.55, 0.7], PAINT);
      }
      building(K(0.712), -1, 78, 8, 4.0, 12, { col: CORR_RUST });  // strip hut
      building(K(0.828), -1, 74, 7, 3.6, 10, { col: TIMBER });
      place(K(0.820), -1, 44, [0.30, 7.5, 0.30], TRIM);            // second sock
      place(K(0.820), -1, 44, [1.0, 1.0, 3.2], ORANGE);
      marshalPost(K(0.740), -1, 30);
      marshalPost(K(0.680), -1, 30);
      marshalPost(K(0.800), -1, 30);

      // --------------------------------------------------------------- 15.
      // 0.820 +1 — END OF THE APRON. A third, smaller corrugated shed with a
      // hoarding on its flank; the concrete gives way to grass as the
      // runway's width is taken back, in bleached slabs then sandy turf.
      building(K(0.820), 1, 36, 14, 7.5, 24, { col: CORR_BLUE });
      building(K(0.802), 1, 38, 9, 5.0, 14, { col: CORR_RUST });
      building(K(0.842), 1, 40, 7, 4.2, 10, { col: TIMBER });
      sponsorHoarding(0.808, 0.836, 1, 26, {});
      groundPatch(K(0.828), 1, 32, [20, 0.20, 40], CONC_W);
      groundPatch(K(0.836), 1, 10, [36, 0.18, 46], GRASS);
      groundPatch(K(0.846), 1, 10, [20, 0.16, 30], GRASS);
      groundPatch(K(0.856), 1, 14, [16, 0.20, 26], GRASS_S);
      for (let i = 0; i < 4; i++) {
        place(K(0.806 + i * 0.0060), 1, 33, [1.2, 1.0, 1.2], i % 2 ? DRUM : STEEL);
      }
      billboard(K(0.856), 1, 20, 9, 3.6, [0.78, 0.30, 0.22]);
      marshalPost(K(0.830), 1, 24);

      // --------------------------------------------------------------- 16.
      // 0.860 -1 — TURN 7, OFF THE RUNWAY. The corridor narrows again: armco
      // returns on both sides (block 1), tyres on the outside, and dense pine
      // closes back in over the braking point. Four ranks deep so the wall
      // arrives as a mass, not a fence.
      runoffApron(K(0.874), -1, 2, 24, SAND);
      runoffApron(K(0.888), -1, 2, 22, SAND);
      groundPatch(K(0.882), -1, 14, [14, 0.18, 26], SAND_D);
      tyreWall(0.868, 0.900, -1, 14, TYRE_R);
      marshalPost(K(0.866), -1, 13);
      marshalPost(K(0.894), -1, 13);
      cameraTower(K(0.882), -1, 26);
      building(K(0.898), -1, 24, 5, 3.6, 6, { col: FALU });
      boards(0.862, -1, 37, 0.0124);   // out on the runway, well back
      for (let i = 0; i < 24; i++) {
        const s = 0.872 + i * 0.0022;
        const k = K(s);
        const h = hash(k * 41 + 2);
        pine(k, -1, 20 + h * 6, 18 + h * 9, h < 0.5 ? PINE : PINE_L);
        pine(k, 1, 18 + h * 8, 17 + h * 8, PINE_D);
        if (h > 0.35) farPine(k, -1, 33 + h * 10, 16 + h * 9, SPRUCE);
        if (h > 0.55) farPine(k, 1, 31 + h * 11, 16 + h * 9, SPRUCE);
        if (h > 0.70) farPine(k, -1, 50 + h * 16, 15 + h * 9, PINE_B);
      }
      for (let i = 0; i < 3; i++) {
        place(K(0.900 + i * 0.0026), -1, 20, [1.8, 1.4, 1.8], TYRE_K);
      }

      // --------------------------------------------------------------- 17.
      // 0.920 -1 — TURN 8, the long slow banked sweep onto the pit straight.
      // Low timber terracing on the outside with a bank extending it,
      // billboards along the barrier, tyres and grey sand, forest behind.
      // The corner takes forever, so the outside gets a second stand, a
      // hospitality shed and a scoreboard to give the sweep landmarks.
      runoffApron(K(0.912), -1, 2, 26, SAND);
      runoffApron(K(0.932), -1, 2, 26, SAND);
      runoffApron(K(0.952), -1, 2, 22, SAND);
      groundPatch(K(0.922), -1, 13, [13, 0.18, 26], SAND_D);
      groundPatch(K(0.942), -1, 13, [13, 0.20, 26], SAND_D);
      tyreWall(0.906, 0.962, -1, 15, TYRE_K);
      grandstandEx(0.925, -1, 22, 110, null, null);
      grandstandEx(0.898, -1, 24, 52, null, null);
      terrace(0.955, 0.982, -1, 20, {});
      spectatorHill(0.900, 0.925, -1, 26, {});
      billboard(K(0.908), -1, 17, 9, 3.6, [0.84, 0.82, 0.76]);
      billboard(K(0.944), -1, 17, 9, 3.6, [0.30, 0.42, 0.66]);
      billboard(K(0.968), -1, 17, 9, 3.6, [0.84, 0.82, 0.76]);
      billboard(K(0.986), -1, 16, 8, 3.2, [0.78, 0.30, 0.22]);
      building(K(0.936), -1, 42, 9, 5.5, 16, { col: FALU });    // hospitality
      building(K(0.958), -1, 40, 7, 5.0, 10, { col: CORR_BLUE });// scoreboard
      building(K(0.916), -1, 44, 8, 4.5, 14, { col: TIMBER });
      for (let i = 0; i < 4; i++) {
        place(K(0.966 + i * 0.0035), -1, 30, [0.30, 8.5, 0.30], TRIM);
      }
      marshalPost(K(0.930), -1, 14);
      marshalPost(K(0.958), -1, 14);
      boards(0.908, -1, 12, 0.0110);
      for (let i = 0; i < 18; i++) {
        const s = 0.896 + i * 0.0056;
        const k = K(s);
        const h = hash(k * 113 + 7);
        farPine(k, -1, 56 + h * 20, 16 + h * 9, PINE_B);
        if (h > 0.50) farPine(k, -1, 84 + h * 28, 16 + h * 8, PINE_F);
      }
      forestEdge(0.895, 0.995, -1, 40, { col: PINE_D });
  };
