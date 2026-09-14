/* Apex 26 — JEREZ scenery (data only), split out of js/circuits/jerez.js.
   LAZY_SCENERY (tools/manifest.cjs): no <script> tag.

   Brief: docs/tracks/jerez.md. Dry Andalusian country outside Jerez de la
   Frontera — bleached ochre earth, olive-grey scrub, hard high-contrast light,
   and pale concrete terracing as the one built landmark. The outfield stays
   open: the horizon is visible almost everywhere, and there is never a
   continuous tree line.

   Block -> brief §4 row map (s, side, dist):
     1  palette + helpers                      (§2 palette, §6 modelling notes)
     2  0.005 -1 20  main start/finish terracing
     3  0.010 +1  8  pit + paddock block (the only dense built mass)
     4  0.045 -1 32  Expo '92 braking zone: terrace + spectator hill
     5  0.0663 +1 14 T1 Curva Expo '92 infield apex
     6  0.110 -1 45  open country T1 -> Michelin
     7  0.1447 -1 24 Curva Michelin stand complex -> Sito Pons
     8  0.3043 -1 38 T4, start of the climb: natural banking only
     9  0.3563 +1 18 Curva Sito Pons broadcast compound
    10  0.3842 -1 22 Curva Dry Sack, highest point of the lap
    11  0.460 +1 50  descent ridge away from Dry Sack
    12  0.5228 -1 28 Turn 7 left
    13  0.6300 -1 65 far outfield: olive field rows + one white farm
    14  0.7123 -1 26 Curva Angel Nieto
    15  0.8417 -1 22 Peluqui, into the stadium bowl
    16  0.9177 -1 20 Curva Ferrari
    17  0.9517 +1 12 final right onto the pit straight
    18  circuit-wide: guardrail, marshal posts, sparse scrub, start gantry */
"use strict";
(window.TrackScenery = window.TrackScenery || {})["jerez"] =
  function (api) {
      const { n, hash, every, anchor, onTrack, terrainYAt,
        tree, palm, bush, building, tower, grandstandEx,
        spectatorHill, terrace, guardrail, fence, tyreWall, marshalPost,
        cameraTower, broadcastCompound, billboard, sponsorHoarding, gantry,
        motorhome, groundPatch, runoffApron, place, ridge } = api;

      // ---------------------------------------------------------------
      // 1. PALETTE + HELPERS  (§2 bleached, §6 sparse olive / pale concrete)
      // ---------------------------------------------------------------
      const K = (s) => Math.round(s * n) % n;

      const OCHRE      = [0.74, 0.64, 0.45];   // bare pale earth
      const OCHRE_PALE = [0.80, 0.71, 0.53];   // sun-struck dust
      const DUST       = [0.68, 0.58, 0.41];
      const CONCRETE   = [0.80, 0.78, 0.72];   // terracing, the built landmark
      const CONCRETE_D = [0.70, 0.68, 0.63];
      const WHITEWASH  = [0.90, 0.88, 0.82];   // Andalusian farm white
      const OLIVE      = [0.34, 0.37, 0.26];   // olive canopy
      const OLIVE_D    = [0.28, 0.31, 0.22];
      const SCRUB      = [0.44, 0.44, 0.31];   // low grey-green scrub
      const ARMCO      = [0.80, 0.80, 0.82];
      const TYRE_CAP   = [0.86, 0.34, 0.18];

      // A single olive: short, wide, never in a rank.
      const olive = (k, side, dist, h) =>
        tree(k, side, dist, h, hash(k * 7 + dist) < 0.5 ? OLIVE : OLIVE_D);

      // ---------------------------------------------------------------
      // 2. MAIN START/FINISH TERRACING  (0.005, -1, 20)
      //    Long roofless pale-concrete run facing the pit lane with one
      //    covered centre bay; hoarding along the base, armco at the edge,
      //    a camera mast at each end.
      // ---------------------------------------------------------------
      terrace(0.945, 0.052, -1, 19, undefined);
      grandstandEx(0.985, -1, 20, 120, null, null);   // covered centre bay
      grandstandEx(0.902, -1, 20, 105, null, null);
      grandstandEx(0.022, -1, 20, 105, null, null);
      sponsorHoarding(0.940, 0.058, -1, 13, undefined);
      guardrail(0.930, 0.070, -1, 10, ARMCO);
      cameraTower(K(0.9445), -1, 17, undefined);
      cameraTower(K(0.0545), -1, 17, undefined);
      groundPatch(K(0.005), -1, 15, 70, OCHRE_PALE, undefined);

      // ---------------------------------------------------------------
      // 3. PIT + PADDOCK BLOCK  (0.010, +1, 8)
      //    The only dense built mass on the circuit: a low flat-roofed garage
      //    row, the control tower above the grid, motorhomes behind.
      // ---------------------------------------------------------------
      guardrail(0.930, 0.072, 1, 8, ARMCO);
      for (let i = 0; i < 9; i++) {                   // garage row
        const s = 0.955 + i * 0.0085;
        building(K(s), 1, 9, 22, 7.5, 15, undefined);
      }
      building(K(0.012), 1, 11, 26, 17, 17, undefined);  // control tower block
      tower(K(0.010), 1, 34, 7, 26, undefined);
      for (let i = 0; i < 7; i++)                      // paddock motorhomes
        motorhome(K(0.958 + i * 0.011), 1, 34, undefined);
      for (let i = 0; i < 5; i++)
        motorhome(K(0.965 + i * 0.011), 1, 52, undefined);
      fence(0.940, 0.060, 1, 62, 3, CONCRETE_D);
      groundPatch(K(0.005), 1, 24, 90, DUST, undefined);

      // ---------------------------------------------------------------
      // 4. EXPO '92 BRAKING ZONE  (0.045, -1, 32)
      //    Open steps cut into the natural rise, hill continuing behind,
      //    one camera mast. Bare ochre ground, no grass.
      // ---------------------------------------------------------------
      terrace(0.030, 0.060, -1, 30, undefined);
      spectatorHill(0.026, 0.066, -1, 52, undefined);
      cameraTower(K(0.0475), -1, 26, undefined);
      groundPatch(K(0.045), -1, 34, 60, OCHRE, undefined);
      groundPatch(K(0.056), -1, 40, 52, DUST, undefined);
      runoffApron(K(0.052), -1, 11, 34, OCHRE_PALE);

      // ---------------------------------------------------------------
      // 5. T1 — CURVA EXPO '92, INFIELD APEX  (0.0663, +1, 14)
      //    Nothing tall: the horizon must stay visible over the infield.
      // ---------------------------------------------------------------
      tyreWall(0.058, 0.078, 1, 12, TYRE_CAP);
      marshalPost(K(0.0663), 1, 16);
      billboard(K(0.0605), 1, 17, 12, 4.5, [0.86, 0.80, 0.30]);
      groundPatch(K(0.0663), 1, 20, 46, OCHRE, undefined);
      for (let i = 0; i < 5; i++) bush(K(0.062 + i * 0.006), 1, 22 + i * 4, SCRUB);

      // ---------------------------------------------------------------
      // 6. OPEN COUNTRY, T1 -> MICHELIN  (0.110, -1, 45)
      //    Loose scatter of olive on flat ochre. Never a rank; empty to the
      //    horizon behind it.
      // ---------------------------------------------------------------
      for (let i = 0; i < 14; i++) {
        const s = 0.086 + i * 0.0042;
        const h = hash(i * 17 + 3);
        if (h < 0.38) continue;
        const d = 38 + h * 30;
        const a = anchor(K(s), -1, d);
        if (onTrack(a.c[0], a.c[2], 10)) continue;
        olive(K(s), -1, d, 5.5 + h * 2.4);
        if (h > 0.74) bush(K(s), -1, d - 11, SCRUB);
      }
      groundPatch(K(0.104), -1, 42, 110, OCHRE, undefined);
      groundPatch(K(0.124), -1, 56, 90, OCHRE_PALE, undefined);

      // ---------------------------------------------------------------
      // 7. CURVA MICHELIN -> SITO PONS STAND COMPLEX  (0.1447, -1, 24)
      //    The larger permanent stands, terrace filling between the bays.
      // ---------------------------------------------------------------
      grandstandEx(0.1447, -1, 23, 150, null, null);
      grandstandEx(0.1760, -1, 23, 130, null, null);
      grandstandEx(0.2080, -1, 24, 120, null, null);
      terrace(0.160, 0.176, -1, 22, undefined);
      terrace(0.192, 0.210, -1, 23, undefined);
      terrace(0.224, 0.250, -1, 24, undefined);
      sponsorHoarding(0.134, 0.252, -1, 14, undefined);
      guardrail(0.128, 0.262, -1, 10, ARMCO);
      tyreWall(0.136, 0.158, -1, 11, TYRE_CAP);
      cameraTower(K(0.1690), -1, 21, undefined);
      marshalPost(K(0.2260), -1, 16);
      groundPatch(K(0.190), -1, 46, 120, DUST, undefined);

      // ---------------------------------------------------------------
      // 8. T4, START OF THE CLIMB  (0.3043, -1, 38)
      //    Natural banking, no built seating: earth and scrub only.
      // ---------------------------------------------------------------
      spectatorHill(0.288, 0.324, -1, 36, undefined);
      guardrail(0.276, 0.338, -1, 11, ARMCO);
      marshalPost(K(0.3043), -1, 15);
      groundPatch(K(0.3043), -1, 40, 90, OCHRE, undefined);
      for (let i = 0; i < 9; i++)
        bush(K(0.286 + i * 0.0046), -1, 44 + hash(i * 23) * 22, SCRUB);
      for (let i = 0; i < 4; i++) {
        const s = 0.290 + i * 0.010;
        const d = 58 + hash(i * 41) * 24;
        const a = anchor(K(s), -1, d);
        if (!onTrack(a.c[0], a.c[2], 10)) olive(K(s), -1, d, 5.0 + hash(i * 5) * 2);
      }

      // ---------------------------------------------------------------
      // 9. CURVA SITO PONS, INFIELD  (0.3563, +1, 18)
      //    Broadcast compound serving the whole upper loop.
      // ---------------------------------------------------------------
      broadcastCompound(K(0.3563), 1, 20, undefined);
      cameraTower(K(0.3480), 1, 18, undefined);
      tyreWall(0.348, 0.368, 1, 12, TYRE_CAP);
      marshalPost(K(0.3620), 1, 17);
      groundPatch(K(0.3563), 1, 30, 64, DUST, undefined);

      // ---------------------------------------------------------------
      // 10. CURVA DRY SACK  (0.3842, -1, 22) — highest point of the lap,
      //     best-attended corner outside the stadium.
      // ---------------------------------------------------------------
      terrace(0.368, 0.398, -1, 21, undefined);
      grandstandEx(0.3842, -1, 30, 125, null, null);
      spectatorHill(0.366, 0.404, -1, 52, undefined);
      tyreWall(0.370, 0.400, -1, 11, TYRE_CAP);
      guardrail(0.360, 0.412, -1, 9, ARMCO);
      marshalPost(K(0.3900), -1, 15);
      billboard(K(0.3720), -1, 18, 16, 5.5, [0.88, 0.86, 0.80]);
      cameraTower(K(0.3960), -1, 20, undefined);
      groundPatch(K(0.3842), -1, 58, 90, OCHRE_PALE, undefined);
      palm(K(0.3990), -1, 24, 11, OLIVE);

      // ---------------------------------------------------------------
      // 11. DESCENT AWAY FROM DRY SACK  (0.460, +1, 50)
      //     The fall of the land is the landmark, not any prop: a bare ridge
      //     running parallel to the track with sparse scrub.
      // ---------------------------------------------------------------
      for (let i = 0; i < 4; i++) {
        const s = 0.430 + i * 0.024;
        const a = anchor(K(s), 1, 78);
        if (onTrack(a.c[0], a.c[2], 14)) continue;
        ridge(a.c[0], a.c[2], terrainYAt(a.c[0], a.c[2]), a.t || 0,
          150, 46, 11 + hash(i * 13) * 7, DUST);
      }
      for (let i = 0; i < 12; i++) {
        const s = 0.424 + i * 0.0072;
        bush(K(s), 1, 40 + hash(i * 29) * 26, SCRUB);
      }
      groundPatch(K(0.460), 1, 52, 130, OCHRE, undefined);
      guardrail(0.420, 0.500, 1, 12, ARMCO);

      // ---------------------------------------------------------------
      // 12. TURN 7 LEFT  (0.5228, -1, 28)
      //     Low hill, standing room only.
      // ---------------------------------------------------------------
      guardrail(0.505, 0.545, -1, 10, ARMCO);
      tyreWall(0.512, 0.534, -1, 11, TYRE_CAP);
      spectatorHill(0.508, 0.540, -1, 26, undefined);
      marshalPost(K(0.5228), -1, 16);
      groundPatch(K(0.5228), -1, 38, 70, DUST, undefined);

      // ---------------------------------------------------------------
      // 13. FAR OUTFIELD, THE QUIETEST STRETCH  (0.6300, -1, 65)
      //     Widely spaced olive in field rows and one white farm set well
      //     back. Horizon unbroken above it.
      // ---------------------------------------------------------------
      for (let row = 0; row < 3; row++) {
        const d = 62 + row * 20;
        for (let i = 0; i < 7; i++) {
          const s = 0.600 + i * 0.0092;
          const h = hash(i * 11 + row * 97);
          if (h < 0.22) continue;
          const a = anchor(K(s), -1, d);
          if (onTrack(a.c[0], a.c[2], 12)) continue;
          olive(K(s), -1, d, 4.8 + h * 1.8);
        }
      }
      building(K(0.6300), -1, 96, 20, 7, 13, undefined);   // white farm
      place(K(0.6360), -1, 100, [9, 4.5, 7], WHITEWASH);   // outbuilding
      palm(K(0.6270), -1, 88, 12, OLIVE_D);
      groundPatch(K(0.6300), -1, 58, 150, OCHRE_PALE, undefined);
      for (let i = 0; i < 8; i++)
        bush(K(0.606 + i * 0.0062), -1, 34 + hash(i * 31) * 18, SCRUB);

      // ---------------------------------------------------------------
      // 14. CURVA ANGEL NIETO  (0.7123, -1, 26) — terracing returns as the
      //     stadium section opens up.
      // ---------------------------------------------------------------
      terrace(0.698, 0.734, -1, 25, undefined);
      sponsorHoarding(0.694, 0.740, -1, 14, undefined);
      cameraTower(K(0.7060), -1, 23, undefined);
      guardrail(0.688, 0.748, -1, 10, ARMCO);
      tyreWall(0.702, 0.726, -1, 11, TYRE_CAP);
      marshalPost(K(0.7180), -1, 16);
      groundPatch(K(0.7123), -1, 48, 80, DUST, undefined);

      // ---------------------------------------------------------------
      // 15. PELUQUI, INTO THE STADIUM BOWL  (0.8417, -1, 22)
      //     Continuous permanent terracing wrapping the outside, a stand on
      //     the highest bank, billboard above the run-off.
      // ---------------------------------------------------------------
      terrace(0.822, 0.870, -1, 21, undefined);
      grandstandEx(0.8417, -1, 34, 140, null, null);
      sponsorHoarding(0.818, 0.876, -1, 13, undefined);
      billboard(K(0.8300), -1, 17, 18, 6, [0.86, 0.84, 0.78]);
      guardrail(0.812, 0.884, -1, 10, ARMCO);
      tyreWall(0.828, 0.856, -1, 11, TYRE_CAP);
      runoffApron(K(0.8417), -1, 11, 30, OCHRE_PALE);
      marshalPost(K(0.8480), -1, 16);

      // ---------------------------------------------------------------
      // 16. CURVA FERRARI  (0.9177, -1, 20) — terracing unbroken from Peluqui.
      // ---------------------------------------------------------------
      terrace(0.876, 0.938, -1, 20, undefined);
      grandstandEx(0.9177, -1, 32, 135, null, null);
      sponsorHoarding(0.878, 0.940, -1, 13, undefined);
      tyreWall(0.906, 0.930, -1, 11, TYRE_CAP);
      marshalPost(K(0.9177), -1, 15);
      cameraTower(K(0.8880), -1, 24, undefined);
      groundPatch(K(0.9177), -1, 52, 70, DUST, undefined);

      // ---------------------------------------------------------------
      // 17. FINAL RIGHT ONTO THE PIT STRAIGHT  (0.9517, +1, 12)
      //     Pit-exit armco merging in, paddock mass and motorhomes behind.
      // ---------------------------------------------------------------
      guardrail(0.944, 0.972, 1, 12, ARMCO);
      marshalPost(K(0.9517), 1, 14);
      building(K(0.9460), 1, 30, 24, 9, 16, undefined);
      for (let i = 0; i < 4; i++)
        motorhome(K(0.938 + i * 0.008), 1, 46, undefined);
      groundPatch(K(0.9517), 1, 26, 60, DUST, undefined);

      // ---------------------------------------------------------------
      // 18. CIRCUIT-WIDE — continuous armco, marshal posts, and a very
      //     sparse scrub scatter. Deliberately NO tree line anywhere: the
      //     outfield stays open and the horizon visible (§6).
      // ---------------------------------------------------------------
      for (const side of [-1, 1]) guardrail(0.0, 1.0, side, 13, ARMCO);

      for (let i = 0; i < 12; i++) marshalPost(Math.round((i / 12) * n) % n, 1, 17);

      every(24, (k) => {
        const h = hash(k * 37 + 11);
        if (h < 0.52) return;
        const side = h < 0.76 ? -1 : 1;
        const dist = 22 + h * 26;
        const a = anchor(k, side, dist);
        if (onTrack(a.c[0], a.c[2], 9)) return;
        bush(k, side, dist, h < 0.64 ? SCRUB : OLIVE_D);
      });

      // Very occasional lone olive/palm, hash-gated hard so it never ranks up.
      every(60, (k) => {
        const h = hash(k * 53 + 7);
        if (h < 0.70) return;
        const side = h < 0.88 ? -1 : 1;
        const dist = 44 + h * 30;
        const a = anchor(k, side, dist);
        if (onTrack(a.c[0], a.c[2], 12)) return;
        if (h > 0.955) palm(k, side, dist, 10 + h * 3, OLIVE_D);
        else olive(k, side, dist, 5.2 + h * 2.2);
      });

      gantry(0.0, 8, CONCRETE);
      gantry(0.0355, 7.5, CONCRETE_D);
  };
