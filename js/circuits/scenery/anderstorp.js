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
    13  airfield apron: two hangars + flying club              (§4 0.640 +1)
    14  runway far side: mown grass to a distant treeline      (§4 0.740 -1)
    15  end of the apron: third shed, concrete gives way       (§4 0.820 +1)
    16  Turn 7 — off the runway, the corridor narrows          (§4 0.860 -1)
    17  Turn 8: long banked final corner onto the pit straight (§4 0.920 -1)

   Nothing taller than a treetop, nothing grand: low timber and corrugated. */
"use strict";
(window.TrackScenery = window.TrackScenery || {})["anderstorp"] =
  function (api) {
      const { n, hash, every, anchor, onTrack,
        pine, tree, bush, forestEdge,
        building, grandstandEx, spectatorHill, terrace,
        guardrail, fence, tyreWall,
        marshalPost, cameraTower, billboard, sponsorHoarding, gantry,
        motorhome, groundPatch, runoffApron, place } = api;

      // ---------------------------------------------------------------- 0.
      // Lap-position helper + the cool northern palette. Pine is dark and
      // desaturated; sand run-off is pale grey (wet concrete), never golden.
      const K = (s) => Math.round(s * n) % n;

      const PINE      = [0.09, 0.20, 0.13];   // Scots pine canopy, deep + cold
      const PINE_D    = [0.07, 0.16, 0.11];   // shaded rank behind
      const PINE_L    = [0.12, 0.25, 0.16];   // sunlit crown
      const SCRUB     = [0.24, 0.33, 0.18];   // thin birch/scrub in the infield
      const BUSH      = [0.16, 0.26, 0.14];
      const GRASS     = [0.31, 0.41, 0.22];   // mown airfield grass
      const SAND      = [0.60, 0.61, 0.59];   // PALE GREY run-off
      const CONCRETE  = [0.63, 0.64, 0.62];   // aged apron
      const HARDSTAND = [0.52, 0.53, 0.52];   // paddock hardstanding
      const ARMCO     = [0.76, 0.78, 0.80];
      const PAINT     = [0.80, 0.80, 0.76];   // faded runway markings
      const CORR_BLUE = [0.36, 0.45, 0.52];   // faded ribbed metal
      const CORR_CREAM= [0.76, 0.73, 0.63];
      const CORR_SILV = [0.58, 0.60, 0.61];   // dull silver-grey hangar
      const TIMBER    = [0.45, 0.36, 0.26];
      const WHITEGREY = [0.80, 0.80, 0.79];   // race control

      // The runway corridor. Inside it the forest and the armco stand back;
      // everywhere else the pine is on top of you. That contrast is the lap.
      const RW0 = 0.545, RW1 = 0.875;
      const onRunway = (s) => s > RW0 && s < RW1;

      // ---------------------------------------------------------------- 1.
      // FOREST + ARMCO SHELL. Dense ranks of tall bare-trunked Scots pine set
      // only a few metres back, canopy high enough that the trunks read as a
      // colonnade. Three ranks; the runway corridor is cut out of all of it.
      every(11, (k) => {
        const s = k / n;
        const h = hash(k * 37);
        const h2 = hash(k * 71 + 5);
        for (const side of [-1, 1]) {
          // Runway: no pine on the apron side at all, and the far-side
          // treeline is pushed a long way out (block 14 handles it).
          if (onRunway(s)) continue;
          const near = 13 + h * 5;
          if (h > 0.18) {
            const a = anchor(k, side, near);
            if (!onTrack(a.c[0], a.c[2], 7)) {
              pine(k, side, near, 17 + h * 9, h < 0.5 ? PINE : PINE_L);
            }
          }
          if (h2 > 0.24) pine(k, side, 22 + h2 * 7, 15 + h2 * 10, PINE_D);
          if (h2 > 0.62) pine(k, side, 32 + h * 9, 14 + h * 9, PINE_D);
          if (h < 0.12) bush(k, side, 11 + h * 3, BUSH);
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
      // timber decking over a steel frame; race control squat behind them.
      grandstandEx(0.988, 1, 14, 105, null, null);
      grandstandEx(0.030, 1, 14, 85, null, null);
      building(K(0.012), 1, 40, 14, 9, 34, { col: WHITEGREY });
      groundPatch(K(0.005), 1, 3, [11, 0.18, 44], SAND);
      groundPatch(K(0.025), 1, 3, [11, 0.16, 44], SAND);
      marshalPost(K(0.0), 1, 12);
      cameraTower(K(0.018), 1, 15);
      gantry(0.0, 8.5, [0.80, 0.80, 0.78]);
      fence(0.975, 0.050, 1, 30, 2.2, [0.62, 0.63, 0.62]);

      // ---------------------------------------------------------------- 3.
      // 0.020 -1 — the cheap side of the pit straight: one run of armco, then
      // pine a few metres back, and one weathered hoarding breaking the green.
      for (let i = 0; i < 22; i++) {
        const s = 0.965 + i * 0.0042;
        const k = K(s);
        pine(k, -1, 11 + hash(k * 13) * 3, 18 + hash(k * 17) * 8, PINE);
      }
      sponsorHoarding(0.028, 0.056, -1, 11, {});

      // ---------------------------------------------------------------- 4.
      // 0.045 -1 — TURN 1. Pale grey sand run-off, tyre stack, forest right
      // behind it; camera tower outside so the corner shoots down the straight.
      runoffApron(K(0.048), -1, 2, 30, SAND);
      runoffApron(K(0.062), -1, 2, 26, SAND);
      tyreWall(0.038, 0.078, -1, 16, [0.70, 0.16, 0.14]);
      marshalPost(K(0.050), -1, 20);
      cameraTower(K(0.070), -1, 24);
      forestEdge(0.030, 0.095, -1, 22, { col: PINE });

      // ---------------------------------------------------------------- 5.
      // 0.095 +1 — INFIELD PADDOCK. A low corrugated rank in faded blue and
      // cream, single storey, with motorhomes nose-in on grey hardstanding.
      // This is the working part of the site and it looks it.
      groundPatch(K(0.100), 1, 24, [46, 0.18, 60], HARDSTAND);
      groundPatch(K(0.125), 1, 24, [40, 0.16, 54], HARDSTAND);
      building(K(0.090), 1, 28, 12, 6.5, 30, { col: CORR_BLUE });
      building(K(0.108), 1, 28, 12, 6.0, 26, { col: CORR_CREAM });
      building(K(0.126), 1, 30, 11, 6.5, 22, { col: CORR_BLUE });
      for (let i = 0; i < 5; i++) {
        motorhome(K(0.094 + i * 0.011), 1, 48 + (i % 2) * 5, 9, 3.4, 4.2, {});
      }
      marshalPost(K(0.115), 1, 13);

      // ---------------------------------------------------------------- 6.
      // 0.150 -1 — PINE RIGHT UP TO THE ARMCO. No run-off worth the name; the
      // shadow banding across the track is the dominant lighting effect here.
      for (let i = 0; i < 30; i++) {
        const s = 0.130 + i * 0.0028;
        const k = K(s);
        const h = hash(k * 29 + 3);
        pine(k, -1, 10.5 + h * 2.5, 19 + h * 9, h < 0.5 ? PINE : PINE_L);
        if (h > 0.45) pine(k, -1, 17 + h * 4, 16 + h * 8, PINE_D);
      }
      marshalPost(K(0.160), -1, 13);

      // ---------------------------------------------------------------- 7.
      // 0.185 +1 — TURNS 2-3, SODRA KURVAN. The south loop opens out: mown
      // grass infield and a low bank (a metre or two — this site is FLAT).
      groundPatch(K(0.185), 1, 14, [48, 0.18, 62], GRASS);
      groundPatch(K(0.205), 1, 14, [44, 0.16, 56], GRASS);
      spectatorHill(0.172, 0.212, 1, 22, {});
      marshalPost(K(0.178), 1, 14);
      marshalPost(K(0.208), 1, 14);
      billboard(K(0.186), 1, 17, 9, 3.6, [0.86, 0.84, 0.78]);
      billboard(K(0.200), 1, 17, 9, 3.6, [0.78, 0.30, 0.22]);

      // ---------------------------------------------------------------- 8.
      // 0.245 -1 — BACK INTO THE TREES. A small wooden flag/timing hut, and
      // nothing else: the forest does the work.
      forestEdge(0.225, 0.300, -1, 16, { col: PINE });
      building(K(0.245), -1, 16, 5, 4.0, 7, { col: TIMBER });
      marshalPost(K(0.252), -1, 12);

      // ---------------------------------------------------------------- 9.
      // 0.330 -1 — TURN 4, OPEL KURVAN. Named for the sponsor: a hoarding run
      // on the outside, tyres in front of it, grey sand, then forest. A low
      // bank outside the barrier with a camera tower behind it.
      runoffApron(K(0.328), -1, 2, 28, SAND);
      runoffApron(K(0.344), -1, 2, 24, SAND);
      tyreWall(0.318, 0.352, -1, 15, [0.70, 0.16, 0.14]);
      sponsorHoarding(0.316, 0.356, -1, 19, {});
      spectatorHill(0.320, 0.350, -1, 26, {});
      cameraTower(K(0.336), -1, 36);
      marshalPost(K(0.324), -1, 14);
      forestEdge(0.300, 0.380, -1, 30, { col: PINE_D });

      // --------------------------------------------------------------- 10.
      // 0.400 +1 — INFIELD SCRUB between the loops. Sandy grass, scattered
      // thin stuff rather than solid forest: the sightlines open up and you
      // can already see the hangars ahead.
      groundPatch(K(0.395), 1, 26, [52, 0.18, 70], [0.42, 0.44, 0.28]);
      groundPatch(K(0.425), 1, 26, [46, 0.16, 64], [0.42, 0.44, 0.28]);
      for (let i = 0; i < 16; i++) {
        const s = 0.370 + i * 0.0055;
        const k = K(s);
        const h = hash(k * 19 + 7);
        if (h < 0.30) continue;
        if (h < 0.62) tree(k, 1, 30 + h * 22, 6 + h * 4, SCRUB);
        else pine(k, 1, 30 + h * 26, 11 + h * 6, PINE_D);
        if (h > 0.85) bush(k, 1, 24 + h * 10, BUSH);
      }
      marshalPost(K(0.404), 1, 15);

      // --------------------------------------------------------------- 11.
      // 0.480 -1 — TURN 5. Long constant-radius corner. Armco with a tyre
      // wall on the exit, forest close behind, a billboard at turn-in, and a
      // grey sand strip between kerb and barrier.
      runoffApron(K(0.474), -1, 2, 16, SAND);
      runoffApron(K(0.492), -1, 2, 16, SAND);
      runoffApron(K(0.510), -1, 2, 16, SAND);
      billboard(K(0.466), -1, 13, 8, 3.2, [0.84, 0.82, 0.76]);
      tyreWall(0.506, 0.534, -1, 13, [0.18, 0.20, 0.22]);
      marshalPost(K(0.488), -1, 14);
      forestEdge(0.440, 0.545, -1, 20, { col: PINE });

      // --------------------------------------------------------------- 12.
      // 0.556 +1 — TURN 6, ONTO THE RUNWAY. The identifying feature of the
      // circuit: the surface widens, a concrete apron spreads to the infield
      // with faded edge markings, and the armco steps back (block 1). The
      // apron is laid as one long run of concrete groundPatch so the corridor
      // reads as a runway rather than a road with trees off it.
      // The apron itself stops just inside the widen/narrow points so the
      // slabs never swing across the tarmac where the corridor turns.
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
      }
      // Faded painted runway edge markings down the apron side.
      for (let i = 0; i < 26; i++) {
        const s = RW0 + 0.004 + (i / 25) * (RW1 - RW0 - 0.010);
        place(K(s), 1, 14, [1.6, 0.06, 9], PAINT);
      }
      marshalPost(K(0.560), 1, 26);
      cameraTower(K(0.566), 1, 34);
      billboard(K(0.552), 1, 22, 9, 3.6, [0.82, 0.80, 0.74]);

      // --------------------------------------------------------------- 13.
      // 0.640 +1 — AIRFIELD APRON PROPER. Two large corrugated hangars, dull
      // silver-grey, wide and low with the doors facing the runway; the
      // flying club is the small shed beside them.
      building(K(0.618), 1, 44, 30, 13, 52, { col: CORR_SILV });
      building(K(0.664), 1, 44, 30, 13, 52, { col: CORR_SILV });
      building(K(0.700), 1, 42, 10, 6, 16, { col: CORR_CREAM });
      groundPatch(K(0.640), 1, 58, [60, 0.18, 84], CONCRETE);
      groundPatch(K(0.688), 1, 54, [38, 0.16, 64], CONCRETE);
      fence(0.600, 0.730, 1, 40, 2.0, [0.60, 0.62, 0.60]);
      marshalPost(K(0.652), 1, 28);

      // --------------------------------------------------------------- 14.
      // 0.740 -1 — RUNWAY'S FAR SIDE. Flat mown grass running a long way out
      // to a DISTANT treeline: the one place on the lap where the pine is not
      // on top of you. A sparse line of pine marks the field boundary.
      for (let i = 0; i < 12; i++) {
        groundPatch(K(RW0 + (i / 11) * (RW1 - RW0)), -1, 10, [82, (i & 1) ? 0.20 : 0.17, 122], GRASS);
      }
      for (let i = 0; i < 26; i++) {
        const s = RW0 + (i / 25) * (RW1 - RW0);
        const k = K(s);
        const h = hash(k * 23 + 11);
        if (h < 0.35) continue;
        pine(k, -1, 72 + h * 14, 16 + h * 8, PINE_D);
      }
      forestEdge(RW0, RW1, -1, 96, { col: PINE_D });
      marshalPost(K(0.740), -1, 30);

      // --------------------------------------------------------------- 15.
      // 0.820 +1 — END OF THE APRON. A third, smaller corrugated shed with a
      // hoarding on its flank; the concrete gives way to grass as the
      // runway's width is taken back.
      building(K(0.820), 1, 36, 14, 7.5, 24, { col: CORR_BLUE });
      sponsorHoarding(0.808, 0.836, 1, 26, {});
      groundPatch(K(0.836), 1, 10, [36, 0.18, 46], GRASS);
      groundPatch(K(0.846), 1, 10, [20, 0.16, 30], GRASS);
      marshalPost(K(0.830), 1, 24);

      // --------------------------------------------------------------- 16.
      // 0.860 -1 — TURN 7, OFF THE RUNWAY. The corridor narrows again: armco
      // returns on both sides (block 1), tyres on the outside, and dense pine
      // closes back in over the braking point.
      runoffApron(K(0.874), -1, 2, 24, SAND);
      runoffApron(K(0.888), -1, 2, 22, SAND);
      tyreWall(0.868, 0.900, -1, 14, [0.70, 0.16, 0.14]);
      marshalPost(K(0.866), -1, 13);
      cameraTower(K(0.882), -1, 26);
      for (let i = 0; i < 24; i++) {
        const s = 0.872 + i * 0.0022;
        const k = K(s);
        const h = hash(k * 41 + 2);
        pine(k, -1, 20 + h * 6, 18 + h * 9, h < 0.5 ? PINE : PINE_L);
        pine(k, 1, 18 + h * 8, 17 + h * 8, PINE_D);
      }

      // --------------------------------------------------------------- 17.
      // 0.920 -1 — TURN 8, the long slow banked sweep onto the pit straight.
      // Low timber terracing on the outside with a bank extending it,
      // billboards along the barrier, tyres and grey sand, forest behind.
      runoffApron(K(0.912), -1, 2, 26, SAND);
      runoffApron(K(0.932), -1, 2, 26, SAND);
      runoffApron(K(0.952), -1, 2, 22, SAND);
      tyreWall(0.906, 0.962, -1, 15, [0.18, 0.20, 0.22]);
      grandstandEx(0.925, -1, 22, 110, null, null);
      terrace(0.955, 0.982, -1, 20, {});
      spectatorHill(0.900, 0.925, -1, 26, {});
      billboard(K(0.908), -1, 17, 9, 3.6, [0.84, 0.82, 0.76]);
      billboard(K(0.944), -1, 17, 9, 3.6, [0.30, 0.42, 0.66]);
      billboard(K(0.968), -1, 17, 9, 3.6, [0.84, 0.82, 0.76]);
      marshalPost(K(0.930), -1, 14);
      forestEdge(0.895, 0.995, -1, 40, { col: PINE_D });
  };
