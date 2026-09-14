/* Apex 26 — DIJON scenery (data only), split out of js/circuits/dijon.js.
   LAZY_SCENERY (tools/manifest.cjs): no <script> tag.

   Real dressing for Circuit Dijon-Prenois, from docs/tracks/dijon.md §4.
   Block -> brief row:
     1  palette + helpers            (§2 warm dry Burgundy, pale limestone)
     2  s=0.005 +1  pit garage row, pit wall, fascia hoarding, marshal post
     3  s=0.020 -1  main grandstand, base hoarding, camera tower
     4  s=0.055 +1  paddock: motorhomes, service boxes, gravel apron, tower
     5  s=0.105 -1  bare outfield: close armco, angled billboard pair
     6  s=0.160 -1  spectator hill, boundary hedge, two isolated trees
     7  s=0.210 +1  Courbe de Pouas inside: tyre wall, marshal post, billboard
     8  s=0.240 -1  Pouas outside: run-off patch, armco, hill, horizon ridge
     9  s=0.300 +1  Combe de Pouilly drop: cut limestone ridge, hedge, trees
    10  s=0.365 -1  open valley: angled hedgerows, tree clumps, distant ridge
    11  s=0.420 +1  Double Droite de Villeroy: armco, tyre wall, timing box
    12  s=0.545 +1  esses: limestone spoil patch, hedge run, marshal, armco
    13  s=0.645 +1  Virage de la Bretelle: tyre wall, armco, camera tower
    14  s=0.725 -1  Parabolique outside: deep armco, tyre wall, hoarding, hill
    15  s=0.760 +1  Parabolique infield — deliberately empty
    16  s=0.880 +1  paddock entrance: apron, truck/motorhome park, building, hedge
    17  s=0.950 -1  approach to the line: second grandstand, hoarding, tower
    18  lap-wide  continuous armco, marshal chain, ISOLATED hillside trees
                  and hedgerow field boundaries (§6 open hillside, not forest) */
"use strict";
(window.TrackScenery = window.TrackScenery || {})["dijon"] =
  function (api) {
      const { n, hash, every, anchor, onTrack, terrainYAt,
        tree, bush, hedge, building, grandstandEx, spectatorHill,
        guardrail, fence, tyreWall, marshalPost, cameraTower,
        billboard, sponsorHoarding, motorhome, groundPatch, ridge } = api;

      // 1. PALETTE — dry summer Burgundy. Pale limestone, bleached grass,
      //    hedgerow much darker than the open slope. Nothing here is glossy:
      //    the facility is spartan and everything else is farmland.
      const K = (s) => Math.round(s * n) % n;
      const LIME   = [0.82, 0.78, 0.66];   // exposed limestone cutting
      const GRAVEL = [0.74, 0.71, 0.61];   // hardstanding / run-off
      const HEDGE  = [0.17, 0.29, 0.13];
      const HEDGE2 = [0.20, 0.33, 0.16];
      const FOL    = [0.24, 0.37, 0.19];
      const FOL_D  = [0.19, 0.31, 0.15];
      const SLOPE  = [0.33, 0.38, 0.23];   // dry grass hillside
      const ARMCO  = [0.78, 0.78, 0.80];
      const CAP    = [0.86, 0.32, 0.15];   // tyre-wall caps
      const WALL   = [0.87, 0.86, 0.82];   // rendered blockwork
      const STEEL  = [0.60, 0.62, 0.66];
      const GLASS  = [0.34, 0.42, 0.46];

      // Ridge takes WORLD x/z, so resolve the spot off an anchor first.
      const ridgeAt = (s, side, dist, ang, len, w, h, col) => {
        const a = anchor(K(s), side, dist);
        const x = a.c[0], z = a.c[2];
        ridge(x, z, terrainYAt(x, z) - 1.5, ang, len, w, h, col);
      };

      // 2. PIT LANE INFIELD (s 0.005, +1, 14) — a long, low open-front garage
      //    row under one flat roof, modelled as a rank of shallow bays. No
      //    grandstand above it: this is a permanent but spartan facility.
      for (let i = 0; i < 9; i++) {
        building(K(0.002 + i * 0.0052), 1, 14, 10, 4.8, 13,
          { kind: "hall", wall: WALL, window: GLASS, floor: 1 });
      }
      sponsorHoarding(0.000, 0.046, 1, 12.2, { h: 1.6, step: 7 });  // fascia
      guardrail(0.972, 1.000, 1, 8.5, ARMCO);                      // pit wall
      guardrail(0.000, 0.064, 1, 8.5, ARMCO);
      marshalPost(K(0.060), 1, 12);                                // exit end

      // 3. MAIN GRANDSTAND (s 0.020, -1, 12) — one open tier on a steel frame
      //    opposite the pits, half-full. shell/crowd are COLOURS: null lets
      //    the emitter pick a livery out of def.standSet.
      grandstandEx(0.020, -1, 12, 132, null, null,
        { livery: "steel", endWalls: false });
      sponsorHoarding(0.000, 0.056, -1, 10.4, { h: 1.5, step: 8 });
      cameraTower(K(0.004), -1, 18, { h: 13, col: STEEL });        // start line

      // 4. PADDOCK BEHIND THE GARAGES (s 0.055, +1, 32) — a motorhome row and
      //    two small service boxes on a pale gravel hardstanding, plus one
      //    camera tower overlooking the straight.
      groundPatch(K(0.050), 1, 26, [46, 0.16, 120], GRAVEL);
      for (let i = 0; i < 5; i++) {
        const h = hash(i * 29);
        motorhome(K(0.030 + i * 0.0088), 1, 32, 9, 4.0, 14,
          { wall: [0.74 + h * 0.16, 0.74 + h * 0.12, 0.76], window: GLASS });
      }
      building(K(0.070), 1, 34, 11, 4.4, 9,
        { kind: "hall", wall: WALL, window: GLASS, floor: 1 });
      building(K(0.080), 1, 30, 8, 3.8, 8,
        { kind: "hall", wall: WALL, window: GLASS, floor: 1 });
      cameraTower(K(0.054), 1, 22, { h: 14, col: STEEL });

      // 5. BARE OUTFIELD ALONG THE STRAIGHT (s 0.105, -1, 9) — armco tight to
      //    the edge, a billboard pair angled at the oncoming cars, then open
      //    mown grass. NO tree line: the ground stays readable to the valley.
      guardrail(0.068, 0.152, -1, 9, ARMCO);
      billboard(K(0.096), -1, 12, 10, 3.4, STEEL);
      billboard(K(0.112), -1, 12, 10, 3.4, WALL);

      // 6. SPECTATOR HILL (s 0.160, -1, 26) — a natural grass terrace, no
      //    structure, where the crowd stands for the run to the first corner.
      //    Hedge boundary behind it, two isolated trees breaking the skyline.
      spectatorHill(0.126, 0.196, -1, 24,
        { rows: 6, rise: 1.2, depth: 2.4, density: 0.55, grass: SLOPE });
      hedge(0.120, 0.204, -1, 48, 2.2, HEDGE);
      tree(K(0.138), -1, 54, 9.5, FOL);
      tree(K(0.188), -1, 50, 8.2, FOL_D);

      // 7. COURBE DE POUAS (s 0.210, +1, 10) — the fast right closing the
      //    straight, taken over a crest. The inside stays LOW so the corner
      //    disappears over the rise: tyre wall, marshal post, one billboard.
      tyreWall(0.198, 0.228, 1, 10, CAP);
      marshalPost(K(0.192), 1, 13);
      billboard(K(0.218), 1, 16, 8, 2.8, STEEL);
      guardrail(0.182, 0.244, 1, 11, ARMCO);

      // 8. OUTSIDE OF POUAS (s 0.240, -1, 22) — wide pale run-off, armco
      //    behind it, a hill rising away and a low ridge on the horizon.
      groundPatch(K(0.230), -1, 12, [30, 0.16, 110], GRAVEL);
      guardrail(0.194, 0.272, -1, 13, ARMCO);
      spectatorHill(0.214, 0.266, -1, 30,
        { rows: 5, rise: 1.3, depth: 2.4, density: 0.45, grass: SLOPE });
      ridgeAt(0.244, -1, 230, 0.55, 300, 54, 17, SLOPE);
      ridgeAt(0.168, -1, 340, 1.90, 340, 62, 20, [0.30, 0.35, 0.23]);

      // 9. THE DROP TOWARD THE COMBE DE POUILLY (s 0.300, +1, 34) — a CUT
      //    limestone face on the inside, exposed rock rather than grass, with
      //    a hedge along its top and a scattered tree or two.
      ridgeAt(0.292, 1, 74, 1.15, 96, 18, 8.5, LIME);
      ridgeAt(0.324, 1, 80, 1.45, 82, 16, 6.5, LIME);
      groundPatch(K(0.306), 1, 30, [18, 0.14, 70], LIME);
      hedge(0.272, 0.340, 1, 56, 2.0, HEDGE);
      tree(K(0.286), 1, 62, 8.6, FOL);
      tree(K(0.332), 1, 66, 7.4, FOL_D);
      bush(K(0.312), 1, 46, FOL_D);

      // 10. OPEN VALLEY ON THE LOW SIDE (s 0.365, -1, 44) — field boundaries
      //     drawn as hedge lines meeting at angles, isolated tree clumps and
      //     a distant ridge. NOTHING TALL: the circuit has to be visible from
      //     across this valley.
      hedge(0.332, 0.386, -1, 40, 1.9, HEDGE);
      hedge(0.350, 0.400, -1, 70, 1.7, HEDGE2);
      hedge(0.370, 0.414, -1, 100, 1.6, HEDGE);
      hedge(0.392, 0.436, -1, 62, 1.8, HEDGE2);
      for (const [s, d, h] of [[0.342, 56, 8.8], [0.345, 61, 6.9],
                               [0.374, 86, 9.4], [0.378, 91, 7.2],
                               [0.404, 74, 8.1], [0.406, 79, 6.4]]) {
        tree(K(s), -1, d, h, FOL);
      }
      bush(K(0.358), -1, 50, FOL_D);
      bush(K(0.398), -1, 66, FOL_D);
      ridgeAt(0.368, -1, 300, 0.15, 380, 70, 21, [0.31, 0.36, 0.23]);
      ridgeAt(0.336, -1, 360, 2.10, 340, 66, 18, [0.32, 0.37, 0.24]);

      // 11. DOUBLE DROITE DE VILLEROY (s 0.420, +1, 12) — the paired rights
      //     climbing away; armco through both, tyre wall on the second apex,
      //     marshal between them, a small timing box set back on the inside.
      guardrail(0.392, 0.474, 1, 12, ARMCO);
      guardrail(0.392, 0.474, -1, 13, ARMCO);
      tyreWall(0.406, 0.420, 1, 11, CAP);
      tyreWall(0.442, 0.464, 1, 11, CAP);
      marshalPost(K(0.430), 1, 15);
      building(K(0.424), 1, 26, 9, 4.2, 8,
        { kind: "hall", wall: WALL, window: GLASS, floor: 1 });

      // 12. THE ESSES (s 0.545, +1, 15) — pale limestone spoil on the inside
      //     where the cutting was made, a short hedge run, marshal and armco.
      groundPatch(K(0.545), 1, 15, [22, 0.15, 90], LIME);
      hedge(0.518, 0.576, 1, 32, 1.9, HEDGE);
      ridgeAt(0.552, 1, 40, 0.95, 70, 16, 6.0, LIME);
      marshalPost(K(0.556), 1, 16);
      guardrail(0.500, 0.600, 1, 14, ARMCO);
      guardrail(0.500, 0.600, -1, 14, ARMCO);

      // 13. VIRAGE DE LA BRETELLE (s 0.645, +1, 10) — the left where the
      //     extension rejoins the old circuit. The camera tower on the inside
      //     covers the Parabolique entry beyond it.
      tyreWall(0.632, 0.660, 1, 10, CAP);
      guardrail(0.612, 0.686, 1, 11, ARMCO);
      cameraTower(K(0.650), 1, 20, { h: 15, col: STEEL });
      marshalPost(K(0.666), 1, 14);

      // 14. OUTSIDE OF THE PARABOLIQUE (s 0.725, -1, 18) — deep armco with a
      //     tyre wall at the fastest point, hoarding behind it, and a
      //     spectator hill beyond that follows the curve.
      guardrail(0.684, 0.796, -1, 12, ARMCO);
      tyreWall(0.714, 0.744, -1, 14, CAP);
      sponsorHoarding(0.690, 0.792, -1, 18, { h: 1.7, step: 8 });
      spectatorHill(0.696, 0.788, -1, 27,
        { rows: 6, rise: 1.2, depth: 2.4, density: 0.50, grass: SLOPE });

      // 15. PARABOLIQUE INFIELD (s 0.760, +1, 24) — DELIBERATELY EMPTY. The
      //     sweep has to read as width and speed, so this is open grass with
      //     one marshal post on the long radius and a billboard pair.
      marshalPost(K(0.760), 1, 24);
      billboard(K(0.740), 1, 26, 9, 3.0, STEEL);
      billboard(K(0.786), 1, 26, 9, 3.0, WALL);

      // 16. PARABOLIQUE EXIT ONTO THE PIT STRAIGHT (s 0.880, +1, 20) — truck
      //     and motorhome park on a gravel apron, a building at the paddock
      //     entrance, hedge screening the boundary behind it.
      groundPatch(K(0.880), 1, 20, [34, 0.16, 110], GRAVEL);
      for (let i = 0; i < 4; i++) {
        const h = hash(i * 53 + 7);
        motorhome(K(0.856 + i * 0.0115), 1, 22, 9, 4.2, 15,
          { wall: [0.70 + h * 0.20, 0.70 + h * 0.16, 0.72], window: GLASS });
      }
      building(K(0.898), 1, 21, 10, 4.6, 9,
        { kind: "hall", wall: WALL, window: GLASS, floor: 1 });
      hedge(0.842, 0.920, 1, 42, 2.1, HEDGE);
      fence(0.842, 0.920, 1, 34, 2.0, STEEL);

      // 17. APPROACH TO THE LINE (s 0.950, -1, 14) — the second, smaller
      //     grandstand opposite the pit exit, hoarding along the guardrail,
      //     camera tower outside and a marshal post at the line.
      grandstandEx(0.950, -1, 14, 88, null, null,
        { livery: "steel", endWalls: false });
      sponsorHoarding(0.900, 0.986, -1, 11, { h: 1.5, step: 8 });
      cameraTower(K(0.964), -1, 20, { h: 13, col: STEEL });
      marshalPost(K(0.994), -1, 13);

      // 18. LAP-WIDE — continuous armco (Dijon is barriered nearly all the way
      //     round), a marshal chain, and the hillside itself. The trees are
      //     ISOLATED and clumped, never a continuous rank: a dense tree line
      //     would hide the valley the circuit is meant to be seen across.
      for (const side of [-1, 1]) guardrail(0.0, 1.0, side, 11, ARMCO);
      for (let i = 0; i < 10; i++) marshalPost(Math.round((i / 10) * n), -1, 12);

      every(30, (k) => {
        const h = hash(k * 37);
        if (h < 0.50) return;                       // half the slots, no more
        const side = hash(k * 71) < 0.5 ? -1 : 1;
        const dist = 34 + hash(k * 13) * 54;        // well back off the road
        const a = anchor(k, side, dist);
        if (onTrack(a.c[0], a.c[2], 10)) return;
        tree(k, side, dist, 6.8 + h * 5.2, h < 0.84 ? FOL : FOL_D);
        if (h > 0.88) tree(k, side, dist + 8, 5.4 + h * 3.2, FOL_D);  // clump
        if (h > 0.92) tree(k, side, dist - 6, 6.0 + h * 2.4, FOL);
        if (h > 0.80) bush(k, side, dist - 7, FOL_D);
      });

      // Hedgerow field boundaries out on the slope, in short angled runs so
      // they read as farmland edges rather than one continuous screen.
      for (const [s0, s1, side, gap] of [
        [0.062, 0.100,  1, 58], [0.116, 0.158,  1, 74],
        [0.228, 0.274,  1, 66], [0.448, 0.498, -1, 54],
        [0.468, 0.518,  1, 62], [0.558, 0.612, -1, 68],
        [0.598, 0.648, -1, 44], [0.666, 0.710,  1, 58],
        [0.700, 0.748,  1, 86], [0.794, 0.844, -1, 64],
        [0.810, 0.858,  1, 72], [0.918, 0.964,  1, 52],
        [0.470, 0.524, -1, 92], [0.298, 0.348, -1, 80],
        [0.140, 0.190,  1, 96], [0.256, 0.300,  1, 92],
        [0.344, 0.392,  1, 74], [0.404, 0.452,  1, 88],
        [0.520, 0.568, -1, 58], [0.626, 0.672, -1, 78],
        [0.736, 0.782,  1, 64], [0.756, 0.804,  1, 98],
        [0.860, 0.906, -1, 56], [0.036, 0.082, -1, 90],
        [0.084, 0.132, -1, 108], [0.196, 0.246, -1, 100],
        [0.286, 0.334,  1,  74], [0.432, 0.484, -1, 118],
        [0.560, 0.606,  1,  78], [0.680, 0.726, -1, 104],
        [0.808, 0.856, -1, 116], [0.888, 0.936,  1,  70],
        [0.612, 0.658,  1,  84], [0.372, 0.420,  1,  66],
        [0.160, 0.208,  1,  52], [0.492, 0.540,  1,  46],
        [0.320, 0.364, -1, 132], [0.652, 0.698,  1,  48],
        [0.766, 0.812, -1,  94], [0.934, 0.980,  1,  62],
      ]) hedge(s0, s1, side, gap, 1.7 + hash(Math.round(s0 * 1000)) * 0.6, HEDGE2);
  };
