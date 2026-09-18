/* Apex 26 — MOSPORT scenery (data only), split out of js/circuits/mosport.js.
   LAZY_SCENERY (tools/manifest.cjs): no <script> tag.

   Brief: docs/tracks/mosport.md. 450 acres of rolling Ontario drumlin farmland
   at Bowmanville, opened 1961 and never rebuilt. Mature MIXED woodland
   (broadleaf AND conifer, never a pine monoculture) on the outside of almost
   every corner, almost no run-off, club-scale buildings. Reads closer to
   Donington than to Fuji: fast, narrow, wooded and old.

   CLOCKWISE, so +1 (right of the centreline) is the INFIELD — paddock, pit
   block and Event Centre live there. -1 is the outside, and that is where the
   woodland lives.

   Block -> brief row (§4) map:
     1  palette + local helpers             (§2 atmosphere, §6 modelling notes)
     2  s 0.005  +1 13  pit block, motorhome row, broadcast, camera tower
     3  s 0.010  -1 18  start/finish stands, hoarding, gantry
     4  s 0.0183 -1 11  Turn One, the top of the descent
     5  s 0.0467 +1 16  Turn 1 infield — kept OPEN so the drop shows
     6  s 0.1483 -1 10  approach to Clayton, steepest pitch, footbridge
     7  s 0.1817 -1 14  Clayton Corner (T2), the plunging left
     8  s 0.2800 +1 18  Clayton -> Quebec, dark and enclosed both sides
     9  s 0.3117 -1 12  Quebec Corner (T3)
    10  s 0.4200 -1 22  the run down to Moss, lowest and most enclosed
    11  s 0.4817 +1 15  MOSS CORNER (T5a/5b), the double apex — signature
    12  s 0.5400 -1 20  Moss exit, the climb starts
    13  s 0.6600 -1 26  Mario Andretti Straightaway, the sky opens
    14  s 0.7400 +1 30  back-straight infield — drumlin farmland
    15  s 0.8017 -1 12  Turn 8, entry to the Esses, footbridge
    16  s 0.8817 -1 10  The Esses, the most claustrophobic stretch
    17  s 0.9183 +1 16  Whites Corner (T10) and the spectator tunnel
    18  s 0.9600 +1 34  the Event Centre
    19  whole lap: mixed-woodland scatter, sandy shoulders, continuous armco,
        marshal posts (§5, §6)

   Substitutions the emitter set forced (reported, not hidden):
   - CORRECTED 2026-09-17: the claim that "there is no `bridge` emitter in the
     scenery(api) contract" was FALSE, and it cost this circuit both of its
     bridges. `circuitKit.pedestrianBridge` is on the frozen 112-member
     contract and silverstone.js was already using `overheadSpan` directly.
     The two crossings (§4, 0.1483 and 0.7930) had abutment towers either side
     and open sky between them. They now span.
   - The Whites spectator TUNNEL is likewise a pair of `place()` portal
     headwalls plus a sunken `groundPatch` approach; nothing bores terrain.
   - `grandstandEx` crowd/shell are colour arrays, so the Moss "crowd" of §4
     row 0.4817 is a `spectatorHill` with a `terrace` on it, not a crowd flag.

   Emitter note (measured on this tree, not assumed): forestEdge's opts
   `spacing` is INERT — changing it 20 -> 200 moved the vertex count by zero.
   Cost scales with the s-RANGE (~76k verts per pass per full lap) and the
   `spacing` keys below are kept only to match the sibling circuits' idiom.
   Density is therefore controlled by how far each rank runs, which is why the
   deep rank of mixedWood() covers only the core of its range. */
"use strict";
(window.TrackScenery = window.TrackScenery || {})["mosport"] =
  function (api) {
      const { mountain, n, hash, every, anchor, onTrack, out, terrainYAt,
        tree, bush, hedge, forestEdge,
        building, grandstandEx, spectatorHill, terrace,
        guardrail, fence, tyreWall, marshalPost, cameraTower, broadcastCompound,
        billboard, sponsorHoarding, gantry, motorhome, groundPatch,
        place, ridge, circuitKit } = api;

      // ---------------------------------------------------------------------
      // 1. PALETTE + LOCAL HELPERS
      //    Bright North American summer: warmer and more saturated than
      //    Donington's overcast English green, but still a green theme.
      //    Two tree families on purpose — broadleaf maple/oak and dark
      //    blue-green spruce — because §6 forbids a pine monoculture.
      // ---------------------------------------------------------------------
      const K = (s) => Math.round(s * n) % n;

      const LEAF      = [0.24, 0.42, 0.18];   // mature broadleaf, full summer
      const LEAF_D    = [0.17, 0.31, 0.15];   // shaded depth of the wood
      const LEAF_L    = [0.33, 0.50, 0.22];   // sunlit maple crown
      const CONIF     = [0.12, 0.25, 0.19];   // spruce, dark and blue
      const CONIF_L   = [0.16, 0.31, 0.22];   // white pine, lighter
      const HEDGE_C   = [0.19, 0.32, 0.16];
      const GRASS     = [0.33, 0.45, 0.21];   // mown drumlin pasture
      const ROUGH     = [0.38, 0.43, 0.24];   // unmown field
      const SAND      = [0.66, 0.58, 0.42];   // dry sandy shoulder (§2)
      const ARMCO     = [0.76, 0.77, 0.78];
      const FENCE_C   = [0.58, 0.60, 0.60];
      const TYRE_R    = [0.62, 0.16, 0.14];
      const TYRE_Y    = [0.58, 0.54, 0.16];
      const WALL      = [0.82, 0.81, 0.77];   // pale club-scale cladding
      const WALL_2    = [0.72, 0.73, 0.71];
      const ROOF      = [0.40, 0.42, 0.44];
      const CONCRETE  = [0.64, 0.64, 0.62];
      const TARMACISH = [0.30, 0.30, 0.31];

      // Heading of the centreline at node k, for ridge() angles.
      // ridge()'s `ang` is a SCALAR heading, derived from two anchor() reads.
      const headingAt = (k) => {
        const a = anchor(k, 1, 0).c;
        const b = anchor((k + 4) % n, 1, 0).c;
        return Math.atan2(b[0] - a[0], b[2] - a[2]);
      };
      // Lay a ridge parallel to the track at (k, side, dist).
      const slopeRidge = (k, side, dist, len, w, h, col) => {
        const a = anchor(k, side, dist);
        const x = a.c[0], z = a.c[2];
        if (onTrack(x, z, 10)) return;
        ridge(x, z, terrainYAt(x, z) - h * 0.35, headingAt(k), len, w, h, col);
      };
      // One well-spaced parkland specimen — broadleaf only, jittered so a row
      // never lines up. Used where the brief asks for OPEN ground.
      const specimen = (k, side, dist, seed) => {
        const h = hash(k * 17 + seed);
        const d = dist + h * 9;
        const a = anchor(k, side, d);
        if (onTrack(a.c[0], a.c[2], 9)) return;
        tree(k, side, d, 9.0 + h * 7.0, h < 0.4 ? LEAF_L : (h < 0.75 ? LEAF : LEAF_D));
      };
      // One tree from the MIXED bush: roughly a third conifer, and the
      // conifers stand taller and narrower than the maples around them.
      const mixedTree = (k, side, dist, seed) => {
        const h = hash(k * 23 + seed);
        const d = dist + h * 7;
        const a = anchor(k, side, d);
        if (onTrack(a.c[0], a.c[2], 8)) return;
        if (h < 0.34) tree(k, side, d, 13.0 + h * 22.0, h < 0.17 ? CONIF : CONIF_L);
        else tree(k, side, d, 8.5 + h * 7.5, h < 0.62 ? LEAF : (h < 0.86 ? LEAF_L : LEAF_D));
      };
      // A mixed wood: broadleaf front rank, conifer rank behind it. Two
      // forestEdge passes at different gaps is the only way to mix species.
      const mixedWood = (s0, s1, side, gap, depth, sp) => {
        const q = (s1 - s0) * 0.25;
        forestEdge(s0, s1, side, gap, { col: LEAF, spacing: sp });
        forestEdge(s0 + q * 0.4, s1 - q * 0.4, side, gap + depth * 0.5, { col: CONIF, spacing: sp + 3 });
        forestEdge(s0 + q, s1 - q, side, gap + depth, { col: LEAF_D, spacing: sp + 5 });
      };
      // The 2011 pedestrian crossings at Turns 2 and 7 — the circuit's only
      // built verticals over the road. Abutments AND a deck: a bridge you can
      // see daylight through is not a bridge.
      const footbridge = (s, seed) => {
        const k = K(s);
        circuitKit.pedestrianBridge({ id: "kit:mosport:foot-" + seed, frac: s,
          clearance: 5.5, depth: 3, thickness: 0.9, required: true });
        place(k, 1, 12, [3.2, 6.5, 4.5], CONCRETE);
        place(k, -1, 12, [3.2, 6.5, 4.5], CONCRETE);
        place(K(s + 0.0015), 1, 16, [2.4, 3.0, 3.0], WALL_2);
        place(K(s - 0.0015), -1, 16, [2.4, 3.0, 3.0], WALL_2);
        specimen(K(s + 0.004), -1, 24, seed);
      };

      // ---------------------------------------------------------------------
      // 2. s 0.005 +1 13 — PIT BLOCK, PADDOCK, BROADCAST, CAMERA TOWER
      //    §4: ONE long low flat-roofed garage run, club scale, NO tower
      //    stack. A short motorhome row behind it. Highest point of the lap.
      //    building(k, side, gap, w, h, d, opts): w is ACROSS-track depth,
      //    d is the run ALONG the track, wall tint goes in opts.
      // ---------------------------------------------------------------------
      building(K(0.9890), 1, 13, 13, 5.6, 132, { col: WALL, roof: ROOF, flat: true });
      building(K(0.0320), 1, 17, 10, 4.4, 22, { col: WALL_2, roof: ROOF, flat: true });
      // Paddock apron behind the garages — gravel-grey club tarmac.
      groundPatch(K(0.0000), 1, 32, [36, 0.18, 104], TARMACISH);
      for (let i = 0; i < 4; i++)
        motorhome(K(0.9760 + i * 0.0125), 1, 28, 3.0, 3.2, 10.5, { wall: WALL });
      broadcastCompound(K(0.0180), 1, 27, { col: WALL_2 });
      cameraTower(K(0.0040), 1, 19, { h: 10.5 });
      // Paddock perimeter, not a spectator debris fence.
      fence(0.9500, 0.0540, 1, 28, 2.4, FENCE_C);
      marshalPost(K(0.0050), 1, 16);

      // ---------------------------------------------------------------------
      // 3. s 0.010 -1 18 — START/FINISH: TWO MODEST STEEL BANKS
      //    grandstandEx(s, side, gap, len, shell, crowd) — shell/crowd are
      //    COLOUR ARRAYS; null lets the emitter pick a livery.
      // ---------------------------------------------------------------------
      grandstandEx(0.0040, -1, 18, 68, null, null);
      grandstandEx(0.0300, -1, 18, 46, null, null);
      sponsorHoarding(0.9930, 0.0520, -1, 12.5);
      fence(0.9880, 0.0600, -1, 11.5, 3.0, FENCE_C);
      gantry(0.0020, 7.0, [0.80, 0.80, 0.78]);
      spectatorHill(0.9850, 0.0450, -1, 30, { h: 5.0, col: GRASS });

      // ---------------------------------------------------------------------
      // 4. s 0.0183 -1 11 — TURN ONE: the straight tips into the descent
      //    Almost no run-off (§5): armco hard on the outside, tyres at the
      //    apex, and the wood tight behind the barrier so it reads enclosed.
      // ---------------------------------------------------------------------
      guardrail(0.0120, 0.0560, -1, 11, ARMCO);
      tyreWall(0.0150, 0.0260, -1, 11.5, TYRE_R);
      marshalPost(K(0.0183), -1, 14);
      mixedWood(0.0130, 0.0650, -1, 16, 20, 11);
      groundPatch(K(0.0210), -1, 13, [7, 0.16, 46], SAND);

      // ---------------------------------------------------------------------
      // 5. s 0.0467 +1 16 — TURN 1 INFIELD: KEEP IT OPEN
      //    §4/§6: open mown grass falling away, a ridge running WITH the
      //    slope, a scatter of specimen trees. This is where the drop first
      //    shows, so nothing tall goes near the track edge.
      // ---------------------------------------------------------------------
      groundPatch(K(0.0467), 1, 22, [34, 0.16, 90], GRASS);
      slopeRidge(K(0.0480), 1, 74, 78, 22, 6.0, GRASS);
      slopeRidge(K(0.0900), 1, 96, 70, 18, 4.5, ROUGH);
      for (let i = 0; i < 7; i++) specimen(K(0.0300 + i * 0.0150), 1, 34 + (i % 3) * 13, 100 + i * 13);
      hedge(0.0650, 0.1150, 1, 52, 2.0, HEDGE_C);

      // ---------------------------------------------------------------------
      // 6. s 0.1483 -1 10 — APPROACH TO CLAYTON: the steepest pitch (§3)
      //    Armco and a continuous mixed wood. Nothing built. A pedestrian
      //    crossing (real: footbridge at Turn 2).
      // ---------------------------------------------------------------------
      guardrail(0.1050, 0.1750, -1, 10.5, ARMCO);
      mixedWood(0.1050, 0.1800, -1, 14, 22, 10);
      footbridge(0.1483, 11);
      groundPatch(K(0.1400), -1, 12, [6, 0.16, 60], SAND);
      marshalPost(K(0.1300), -1, 13);

      // ---------------------------------------------------------------------
      // 7. s 0.1817 -1 14 — CLAYTON CORNER (T2)
      //    A dramatic plunging left, 20 m of drop through the corner. Tyres
      //    on the outside, a spectator bank behind them in the trees.
      // ---------------------------------------------------------------------
      guardrail(0.1700, 0.2300, -1, 11, ARMCO);
      tyreWall(0.1740, 0.1930, -1, 12.0, TYRE_R);
      spectatorHill(0.1660, 0.2100, -1, 26, { h: 8.5, col: GRASS });
      marshalPost(K(0.1817), -1, 15);
      mixedWood(0.1780, 0.2450, -1, 17, 24, 11);
      fence(0.1680, 0.2150, -1, 15, 2.8, FENCE_C);

      // ---------------------------------------------------------------------
      // 8. s 0.2800 +1 18 — CLAYTON -> QUEBEC: dark and enclosed
      //    Woodland BOTH sides here, a small bank on the inside, continuous
      //    armco. The only stretch where the infield is allowed to close in.
      // ---------------------------------------------------------------------
      guardrail(0.2300, 0.3250, 1, 12, ARMCO);
      guardrail(0.2300, 0.3050, -1, 11, ARMCO);
      spectatorHill(0.2680, 0.2960, 1, 22, { h: 5.5, col: GRASS });
      mixedWood(0.2350, 0.3200, 1, 30, 22, 13);
      mixedWood(0.2250, 0.3050, -1, 15, 24, 11);
      marshalPost(K(0.2800), 1, 16);

      // ---------------------------------------------------------------------
      // 9. s 0.3117 -1 12 — QUEBEC CORNER (T3)
      //    Armco then tyres, marshal post, wood hard behind, one billboard on
      //    the exit fence.
      // ---------------------------------------------------------------------
      guardrail(0.2950, 0.3600, -1, 11, ARMCO);
      tyreWall(0.3050, 0.3220, -1, 12.0, TYRE_Y);
      marshalPost(K(0.3117), -1, 14);
      mixedWood(0.2980, 0.3700, -1, 14, 22, 10);
      fence(0.3000, 0.3500, -1, 15, 2.8, FENCE_C);
      billboard(K(0.3350), -1, 16, 9, 3.2, [0.74, 0.73, 0.70]);
      groundPatch(K(0.3150), -1, 13, [7, 0.16, 40], SAND);

      // ---------------------------------------------------------------------
      // 10. s 0.4200 -1 22 — THE RUN DOWN TO MOSS, still falling
      //     The lowest and most enclosed part of the lap. Continuous wood,
      //     sandy shoulder, one marshal post, nothing built.
      // ---------------------------------------------------------------------
      guardrail(0.3600, 0.4700, -1, 11.5, ARMCO);
      mixedWood(0.3600, 0.4700, -1, 18, 26, 11);
      groundPatch(K(0.4050), -1, 14, [8, 0.16, 70], SAND);
      groundPatch(K(0.4400), -1, 14, [8, 0.16, 56], SAND);
      marshalPost(K(0.4200), -1, 16);
      // Infield stays OPEN here too — §6: the drop must read.
      for (let i = 0; i < 5; i++) specimen(K(0.3800 + i * 0.0190), 1, 40 + (i % 2) * 16, 200 + i * 9);
      slopeRidge(K(0.4150), 1, 82, 72, 20, 5.0, ROUGH);

      // ---------------------------------------------------------------------
      // 11. s 0.4817 +1 15 — MOSS CORNER (T5a/5b), THE SIGNATURE
      //     The double-apex left Stirling Moss asked for when he saw the
      //     original single hairpin. Tyres on BOTH apexes, a spectator bank
      //     on the inside with a terrace standing in for the crowd, and a
      //     marshal post between the two apexes. The lowest point of the lap:
      //     45 m below the start line.
      // ---------------------------------------------------------------------
      tyreWall(0.4700, 0.4830, 1, 12.5, TYRE_R);
      tyreWall(0.4900, 0.5030, 1, 12.5, TYRE_R);
      spectatorHill(0.4640, 0.5120, 1, 20, { h: 9.0, col: GRASS });
      terrace(0.4750, 0.4990, 1, 21, { h: 5.5, col: CONCRETE });
      marshalPost(K(0.4865), 1, 15);
      fence(0.4620, 0.5150, 1, 15, 3.0, FENCE_C);
      sponsorHoarding(0.4700, 0.5050, 1, 13);
      guardrail(0.4640, 0.5200, -1, 11, ARMCO);
      tyreWall(0.4780, 0.4960, -1, 12.0, TYRE_Y);
      mixedWood(0.4600, 0.5250, -1, 18, 22, 12);

      // ---------------------------------------------------------------------
      // 12. s 0.5400 -1 20 — MOSS EXIT: THE CLIMB STARTS
      //     Armco, a low ridge carrying the ground up, the wood set BACK as
      //     the trees open out (§4).
      // ---------------------------------------------------------------------
      guardrail(0.5150, 0.6000, -1, 12, ARMCO);
      slopeRidge(K(0.5400), -1, 62, 76, 20, 6.0, GRASS);
      slopeRidge(K(0.5800), -1, 76, 68, 18, 4.5, ROUGH);
      forestEdge(0.5200, 0.6100, -1, 40, { col: LEAF, spacing: 15 });
      forestEdge(0.5400, 0.5950, -1, 58, { col: CONIF, spacing: 18 });
      marshalPost(K(0.5400), -1, 15);
      groundPatch(K(0.5500), -1, 15, [10, 0.16, 70], GRASS);

      // ---------------------------------------------------------------------
      // 13. s 0.6600 -1 26 — MARIO ANDRETTI STRAIGHTAWAY
      //     The fastest part of the lap, and climbing. Trees set BACK on both
      //     sides, hoarding on the fence, two billboards. The one place the
      //     sky opens (§4) — so nothing tall inside gap 26.
      // ---------------------------------------------------------------------
      guardrail(0.6000, 0.7400, -1, 12.5, ARMCO);
      guardrail(0.6000, 0.7400, 1, 13.5, ARMCO);
      fence(0.6100, 0.7300, -1, 17, 3.0, FENCE_C);
      sponsorHoarding(0.6200, 0.7000, -1, 15);
      billboard(K(0.6400), -1, 20, 11, 3.6, [0.76, 0.75, 0.72]);
      billboard(K(0.6950), -1, 20, 11, 3.6, [0.70, 0.72, 0.74]);
      forestEdge(0.6000, 0.7400, -1, 46, { col: LEAF, spacing: 17 });
      forestEdge(0.6300, 0.7150, -1, 64, { col: CONIF, spacing: 20 });
      marshalPost(K(0.6600), -1, 18);

      // ---------------------------------------------------------------------
      // 14. s 0.7400 +1 30 — BACK-STRAIGHT INFIELD: DRUMLIN FARMLAND
      //     Mown grass, a hedge field boundary, isolated trees, a shallow
      //     ridge. Rural and empty (§4) — the Ontario tell.
      // ---------------------------------------------------------------------
      groundPatch(K(0.7000), 1, 34, [46, 0.16, 120], GRASS);
      groundPatch(K(0.7800), 1, 40, [40, 0.16, 90], ROUGH);
      hedge(0.6500, 0.7900, 1, 30, 2.1, HEDGE_C);
      hedge(0.7100, 0.7700, 1, 62, 2.0, HEDGE_C);
      slopeRidge(K(0.7400), 1, 88, 88, 24, 5.0, ROUGH);
      slopeRidge(K(0.6800), 1, 108, 76, 20, 4.0, GRASS);
      for (let i = 0; i < 8; i++) specimen(K(0.6450 + i * 0.0190), 1, 44 + (i % 3) * 18, 300 + i * 11);
      marshalPost(K(0.7400), 1, 20);

      // ---------------------------------------------------------------------
      // 15. s 0.8017 -1 12 — TURN 8, ENTRY TO THE ESSES
      //     Tyres at the apex, marshal post, wood tight. A pedestrian
      //     crossing (real: footbridge at Turn 7).
      // ---------------------------------------------------------------------
      guardrail(0.7700, 0.8300, -1, 11, ARMCO);
      tyreWall(0.7940, 0.8110, -1, 12.0, TYRE_R);
      marshalPost(K(0.8017), -1, 14);
      mixedWood(0.7700, 0.8400, -1, 14, 22, 10);
      footbridge(0.7930, 27);
      groundPatch(K(0.8050), -1, 13, [7, 0.16, 44], SAND);

      // ---------------------------------------------------------------------
      // 16. s 0.8817 -1 10 — THE ESSES: the most claustrophobic stretch
      //     A downhill flick with the woods closed right in. Armco BOTH
      //     sides, tyres on the blind apex, nothing built.
      // ---------------------------------------------------------------------
      guardrail(0.8350, 0.9100, -1, 10.5, ARMCO);
      guardrail(0.8350, 0.9100, 1, 11.5, ARMCO);
      tyreWall(0.8740, 0.8900, -1, 11.5, TYRE_Y);
      mixedWood(0.8350, 0.9150, -1, 13, 20, 9);
      mixedWood(0.8400, 0.9050, 1, 16, 18, 11);
      marshalPost(K(0.8817), -1, 13);

      // ---------------------------------------------------------------------
      // 17. s 0.9183 +1 16 — WHITES CORNER (T10) AND THE SPECTATOR TUNNEL
      //     The last corner onto the pit straight, still climbing. Tyres
      //     inside, a stand and hoarding on the exit, marshal post at the
      //     apex. A spectator tunnel passes under the track here — built as
      //     two portal headwalls and a sunken approach apron.
      // ---------------------------------------------------------------------
      tyreWall(0.9100, 0.9270, 1, 12.5, TYRE_R);
      grandstandEx(0.9380, 1, 20, 54, null, null);
      sponsorHoarding(0.9250, 0.9600, 1, 14);
      marshalPost(K(0.9183), 1, 14);
      spectatorHill(0.9050, 0.9450, 1, 26, { h: 6.5, col: GRASS });
      fence(0.9000, 0.9600, 1, 16, 3.0, FENCE_C);
      // Tunnel portals, infield and outside.
      place(K(0.9183), 1, 15, [5.0, 3.2, 7.0], CONCRETE);
      place(K(0.9183), -1, 15, [5.0, 3.2, 7.0], CONCRETE);
      groundPatch(K(0.9183), 1, 24, [14, 0.18, 22], TARMACISH);
      // Outside of Whites is still wood, and still no run-off.
      guardrail(0.8950, 0.9700, -1, 11, ARMCO);
      mixedWood(0.8950, 0.9650, -1, 16, 20, 12);

      // ---------------------------------------------------------------------
      // 18. s 0.9600 +1 34 — THE EVENT CENTRE
      //     The site's ONE substantial public building (§6: nothing else is
      //     built). Long, low, flat-roofed hall set back inside the loop,
      //     visitor apron in front, hedge screening it from the track.
      // ---------------------------------------------------------------------
      building(K(0.9600), 1, 34, 22, 7.0, 58, { col: WALL, roof: ROOF, flat: true });
      building(K(0.9760), 1, 30, 10, 4.2, 16, { col: WALL_2, roof: ROOF, flat: true });
      groundPatch(K(0.9620), 1, 22, [22, 0.18, 52], TARMACISH);
      hedge(0.9440, 0.9860, 1, 17, 2.2, HEDGE_C);
      for (let i = 0; i < 4; i++) specimen(K(0.9500 + i * 0.0110), 1, 62, 400 + i * 7);

      // ---------------------------------------------------------------------
      // 19. WHOLE LAP — mixed-woodland scatter, base armco, marshal posts
      //     §1/§6: mature mixed woodland on the OUTSIDE of almost every
      //     corner; the infield stays open where the drop shows. The hash
      //     gate drops roughly half the candidates and the distance jitter
      //     breaks any rank, so the wood never reads as a planted row.
      // ---------------------------------------------------------------------
      every(23, (k) => {
        const s = k / n;
        const h = hash(k * 37 + 5);
        if (h < 0.46) return;
        for (const side of [-1, 1]) {
          // Infield stays OPEN where the descent has to read (§6).
          if (side > 0 && s > 0.015 && s < 0.145) continue;   // Turn 1 fall
          if (side > 0 && s > 0.345 && s < 0.465) continue;   // run to Moss
          if (side > 0 && s > 0.630 && s < 0.800) continue;   // farmland
          if (side > 0 && (s > 0.930 || s < 0.070)) continue; // paddock side
          const g = hash(k * 53 + (side > 0 ? 11 : 3));
          if (g < 0.26) continue;
          const dist = 22 + g * 24 + (side < 0 ? 4 : 12);
          const a = anchor(k, side, dist);
          if (onTrack(a.c[0], a.c[2], 10)) continue;
          mixedTree(k, side, dist, 600 + (side > 0 ? 7 : 0));
          if (g > 0.84) bush(k, side, dist - 7, LEAF_D);
        }
      });

      // Deep wood belts behind the near rank, so the outside of the lap has a
      // horizon of trees rather than a single planted line.
      forestEdge(0.0150, 0.1000, -1, 58, { col: CONIF, spacing: 24 });
      forestEdge(0.1700, 0.2800, -1, 58, { col: CONIF, spacing: 24 });
      forestEdge(0.3800, 0.4800, -1, 52, { col: LEAF_D, spacing: 23 });
      forestEdge(0.8300, 0.9400, -1, 56, { col: CONIF, spacing: 25 });
      forestEdge(0.2300, 0.3300, 1, 54, { col: CONIF, spacing: 26 });
      forestEdge(0.8500, 0.9000, 1, 46, { col: LEAF_D, spacing: 24 });

      // Drumlin field boundaries on the farmland side.
      hedge(0.1500, 0.2200, 1, 44, 2.0, HEDGE_C);
      hedge(0.5400, 0.6200, 1, 36, 2.0, HEDGE_C);
      hedge(0.8000, 0.8300, 1, 34, 2.0, HEDGE_C);

      // Almost no run-off anywhere (§5): armco IS the edge of the world.
      guardrail(0.0, 1.0, -1, 13.0, ARMCO);
      guardrail(0.055, 0.945, 1, 14.0, ARMCO);

      // Dry sandy shoulders rather than kerbing everywhere (§2).
      for (let i = 0; i < 9; i++) {
        const s = 0.02 + i * 0.105;
        groundPatch(K(s), -1, 12, [6, 0.14, 34], SAND);
      }

      // Posts on the eighths, skipping the ones already placed above.
      for (let i = 0; i < 8; i++) {
        const s = i / 8;
        if (s > 0.43 && s < 0.56) continue;
        marshalPost(K(s), 1, 18);
      }
        // ---------------------------------------------------------------- FAR HORIZON
      // A 2026-09-15 visual pass found this circuit's road rising and falling
      // through a pancake-flat green plane that met the sky at a hard edge —
      // the lap had relief and the WORLD had none, which is part of why the
      // elevation read as exaggerated: the road moved and nothing behind it did.
      // These are the Oak Ridges moraine — low WOODED RIDGES, not peaks. Mosport sits in
      // rolling Durham-County drumlin country: nothing sharp, nothing alpine,
      // just a soft horizon a few hundred feet up.
      // Placed off the lap by anchor() so they follow the circuit's own frame,
      // and seated on terrainYAt so they rise out of the ground rather than
      // float on it.
      const farHill = (frac, side, dist, w, h, dy) => {
        const a = anchor(K(frac), side, dist).c;
        const y = terrainYAt(a[0], a[2]);
        // snowline ABOVE the summit: the default is 0.62, which put snow and
        // rock on the top 38% of hills this size — Oak Ridges moraine, mixed Ontario bush
        // carries neither.
        mountain(a[0], a[2], (y === null ? a[1] : y) + dy, w, h,
          { rough: 0.20, snowline: 2, forest: [0.16, 0.30, 0.18] });
      };
      farHill(0.1, 1, 1178, 1967, 68, -32);
      farHill(0.3, -1, 1302, 1640, 58, -30);
      farHill(0.55, 1, 1426, 2132, 77, -35);
      farHill(0.78, -1, 1116, 1558, 52, -27);
      farHill(0.92, 1, 1240, 1804, 62, -31);
  };
