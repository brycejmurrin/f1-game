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

      // ---------------------------------------------------------------
      // 2. MAIN START/FINISH TERRACING  (0.005, -1, 20)
      //    A long pale-concrete run facing the pit lane, ROOFLESS for most of
      //    its length with one covered centre bay over the line; hoarding
      //    along the full base, armco at the track edge, a camera mast at
      //    each end.
      // ---------------------------------------------------------------
      grandstandEx(0.0000, -1, 20, 130, null, null,
        { roof: "flat", roofCol: CONC, fasciaCol: CONC_ALT, tiers: 2, h: 14 });
      grandstandEx(0.9600, -1, 20, 110, null, null,
        { roof: "none", fasciaCol: CONC_ALT, h: 12 });
      grandstandEx(0.0340, -1, 20, 110, null, null,
        { roof: "none", fasciaCol: CONC_ALT, h: 12 });
      terrace(0.9180, 0.9520, -1, 19, TERR);
      sponsorHoarding(0.9350, 0.0620, -1, 13);
      guardrail(0.9300, 0.0700, -1, 10, ARMCO);
      cameraTower(K(0.9430), -1, 17);
      cameraTower(K(0.0560), -1, 17);
      groundPatch(K(0.0050), -1, 15, slab(26, 150), OCHRE_PALE);

      // ---------------------------------------------------------------
      // 3. PIT + PADDOCK BLOCK  (0.010, +1, 8)
      //    The only dense built mass on the circuit: a low flat-roofed garage
      //    row, the taller control tower above the grid, motorhome rows
      //    behind, armco on the pit-wall line.
      // ---------------------------------------------------------------
      guardrail(0.9300, 0.0720, 1, 8, ARMCO);
      groundPatch(K(0.0050), 1, 10, slab(44, 200), TARMAC);
      for (let i = 0; i < 10; i++) {                        // garage row
        const s = 0.9540 + i * 0.0080;
        building(K(s), 1, 11, 20, 7.5, 14,
          { wall: WHITEWASH, roof: [0.62, 0.60, 0.57] });
      }
      building(K(0.0120), 1, 12, 24, 16, 16,
        { wall: CONC, roof: [0.55, 0.54, 0.52] });          // control tower
      tower(K(0.0100), 1, 36, 6, 24);
      for (let i = 0; i < 8; i++)                           // paddock motorhomes
        motorhome(K(0.9530 + i * 0.0092), 1, 34, 11, 4.4, 17,
          { wall: [0.86 + hash(i * 13) * 0.08, 0.86, 0.88] });
      for (let i = 0; i < 6; i++)
        motorhome(K(0.9610 + i * 0.0092), 1, 54, 10, 4.2, 15,
          { wall: [0.80 + hash(i * 29) * 0.12, 0.80, 0.82] });
      fence(0.9380, 0.0620, 1, 74, 3, CONC_ALT);
      groundPatch(K(0.0050), 1, 28, slab(46, 190), DUST);

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
        bush(K(0.0230 + i * 0.0055), -1, 86 + hash(i * 19) * 20, SCRUB);

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
        bush(K(0.0600 + i * 0.0048), 1, 24 + hash(i * 23) * 22, SCRUB);

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
        if (h > 0.72) bush(K(s), -1, d - 12, SCRUB);
      }
      groundPatch(K(0.1040), -1, 40, slab(70, 200), OCHRE);
      groundPatch(K(0.1240), -1, 112, slab(60, 160), OCHRE_PALE);
      for (let i = 0; i < 10; i++)
        bush(K(0.0880 + i * 0.0058), -1, 26 + hash(i * 41) * 14, SCRUB);

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
        bush(K(0.2820 + i * 0.0036), -1, 48 + hash(i * 23) * 26, SCRUB);
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
      groundPatch(K(0.3563), 1, 30, slab(40, 110), DUST);
      for (let i = 0; i < 5; i++)
        bush(K(0.3480 + i * 0.0055), 1, 44 + hash(i * 31) * 16, SCRUB);

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
        bush(K(0.4180 + i * 0.0050), 1, 38 + hash(i * 29) * 30, SCRUB);
      groundPatch(K(0.4600), 1, 54, slab(70, 240), OCHRE);
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
      groundPatch(K(0.5228), -1, 40, slab(40, 130), DUST);
      for (let i = 0; i < 8; i++)
        bush(K(0.5060 + i * 0.0048), -1, 44 + hash(i * 37) * 18, SCRUB);

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
      groundPatch(K(0.6300), -1, 56, slab(80, 230), OCHRE_PALE);
      for (let i = 0; i < 12; i++)
        bush(K(0.6020 + i * 0.0048), -1, 32 + hash(i * 31) * 20, SCRUB);

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
      groundPatch(K(0.7123), -1, 54, slab(36, 150), DUST);

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
      groundPatch(K(0.9517), 1, 26, slab(34, 120), TARMAC);

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
        bush(k, side, dist, h < 0.60 ? SCRUB : OLIVE_D);
        if (h > 0.86) bush(k, side, dist + 9 + h * 6, SCRUB);
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
  };
