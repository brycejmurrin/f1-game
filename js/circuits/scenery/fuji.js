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
     13 CEDAR PLATEAU (global forest, three ranks deep)
     14 BARRIERS, POSTS, CAMERAS (global furniture)

   Engine refusals (measured with tools/track/verify-track.cjs, not guessed):
   the infield inside ~16 m across s 0.700-0.716 is a no-place band (the lap
   folds back on itself at 300R), so the +1 guardrail and the +1 debris fence
   are emitted as spans that stop short of it rather than asking and being
   refused. Skyline backdrops only survive on the outfield side at >= 400 m.  */
"use strict";
(window.TrackScenery = window.TrackScenery || {})["fuji"] =
  function (api) {
      const { out, n, hash, every, anchor, onTrack, K, lapBounds, pyMin,
        tree, pine, bush, hedge, forestEdge,
        building, tower, motorhome, broadcastCompound, cameraTower,
        grandstandEx, terrace, bleacher, spectatorHill, scaffoldStand,
        guardrail, fence, tyreWall, marshalPost, gantry,
        billboard, sponsorHoarding, groundPatch, prop, backdrop,
        mountain } = api;

      // ── palette ──────────────────────────────────────────────────────────
      // Sugi cedar: dark and blue-shifted, not European park green. Four
      // tints so a rank of a thousand trees is not one flat colour.
      const SUGI    = [0.12, 0.27, 0.19];
      const SUGI_D  = [0.09, 0.21, 0.16];
      const SUGI_L  = [0.16, 0.33, 0.22];
      const SUGI_B  = [0.10, 0.23, 0.22];   // the blue-shifted far rank
      const SCRUB   = [0.19, 0.30, 0.19];
      // Modern dark-clad paddock.
      const CLAD    = [0.15, 0.16, 0.19];
      const CLAD_L  = [0.24, 0.25, 0.29];
      const CLAD_W  = [0.21, 0.20, 0.21];   // a warmer grey in the same family
      const GLASS   = [0.30, 0.42, 0.52];
      const STEEL   = [0.74, 0.76, 0.79];
      const CONC    = [0.66, 0.66, 0.64];
      const CONC_D  = [0.58, 0.58, 0.56];
      const GRAVEL  = [0.56, 0.53, 0.47];
      const RAIL    = [0.78, 0.78, 0.80];
      const ROOF    = [0.30, 0.31, 0.35];
      const ROOF_D  = [0.24, 0.25, 0.29];
      const TARMAC  = [0.30, 0.31, 0.33];
      const ASPH    = [0.25, 0.26, 0.28];
      // Muted garage-door bands: the frontage is one block, the doors are the
      // only thing that gives 35 identical bays a beat.
      const DOORS = [[0.62, 0.15, 0.14], [0.17, 0.26, 0.46], [0.80, 0.80, 0.78],
                     [0.13, 0.36, 0.28], [0.72, 0.53, 0.12], [0.28, 0.29, 0.33]];

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
      // Bays step in WHOLE NODES, not metres: `run` rounds each bay's centre to
      // the nearest ~4 m node, so metre-stepped 38 m bays landed 36-40 m apart
      // and a 0.97-length box overlapped its neighbour on every short pitch —
      // 18 same-facing coplanar facade pairs down the frontage (2026-09-22,
      // coplanar-audit --why). A node-exact pitch leaves the 3 % gap real.
      // Rounded UP (10 nodes, ~40 m): 33 bays still end where the 35 did, by
      // Turn 1; a 9-node pitch needs a 36th bay the guard refuses there.
      const GAR_S = 0.962, GAR_LEN = 1330;
      const GAR_N = Math.ceil(38 * n / TOTAL), GAR_STEP = GAR_N * TOTAL / n;
      const GAR_K = K(GAR_S) + (GAR_N >> 1);
      for (let i = 0, cnt = Math.floor(GAR_LEN / GAR_STEP); i < cnt; i++) {
        const k = (GAR_K + i * GAR_N) % n, h = hash(i * 7.3);
        // Garage box: w is the RADIAL depth, d the length down the road.
        building(k, 1, 12, 13, 8.4 + h * 0.5, GAR_STEP * 0.97,
          { wall: [CLAD, CLAD_L, CLAD_W][i % 3], window: GLASS, floor: 4.2, lit: false });
        // Door band across the face of each bay.
        prop(k, 1, 6.6, [0.4, 2.8, GAR_STEP * 0.60], DOORS[i % DOORS.length]);
        // Second storey / hospitality deck set back behind it.
        if (i % 2 === 0)
          building(k, 1, 27, 11, 12.6, GAR_STEP * 1.9,
            { wall: i % 4 ? CLAD_L : CLAD_W, window: GLASS, floor: 4.0, lit: false });
      }
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
      // Race control annex and the media centre, stepped back behind the tower
      // so the pit block has thickness instead of being a single facade.
      building(K(0.048), 1, 48, 20, 14, 64,
        { wall: CLAD_L, window: GLASS, floor: 3.9, lit: false });
      building(K(0.082), 1, 46, 16, 10, 50,
        { wall: CLAD_W, window: GLASS, floor: 3.9, lit: false });
      // Pit exit: the scrutineering bay closes the block  [0.960 +1 15]
      building(K(0.950), 1, 15, 12, 7.2, 36,
        { wall: CLAD_L, window: GLASS, floor: 3.6, lit: false });
      groundPatch(K(0.944), 1, 27, [26, 0.16, 54], TARMAC);

      // 2. THE MAIN STRAIGHT — GRANDSTAND WALL (-1)  [0.005 -1 20 · 0.060 -1 26]
      //    Capacity 110,000. A continuous two-tier wall of seating down the
      //    whole straight, with an open bank behind it for mass, then
      //    hospitality, back-of-house and car parks behind THAT.
      run(0.968, 1360, 152, (s, i) => {
        grandstandEx(s, -1, 20, 150, null, null,
          { tiers: 2, h: i % 3 === 1 ? 17.5 : 15, roof: "cantilever",
            roofCol: i % 3 === 1 ? ROOF_D : ROOF,
            fasciaCol: [CLAD, CLAD_L, CLAD_W][i % 3] });
      });
      run(0.985, 1180, 240, (s, i) => {
        const lo = W(s - 118 * SM), hi = W(s + 118 * SM);
        terrace(lo, hi, -1, 47, { rows: 9, rise: 1.55, depth: 2.7,
          density: i % 2 ? 0.44 : 0.54, conc: i % 2 ? CONC_D : CONC, concAlt: CONC_D });
      });
      // Hospitality over the start line, behind the terrace bank.
      building(K(0.016), -1, 74, 22, 16, 118,
        { wall: CLAD, window: GLASS, floor: 4.0, lit: false });
      building(K(0.062), -1, 76, 18, 12, 92,
        { wall: CLAD_L, window: GLASS, floor: 4.0, lit: false });
      // A set-back upper rank behind the terrace bank: the 110,000 reads as
      // seating stacked back from the wall, not one tall row.
      for (const t of [0.104, 0.152, 0.200]) {
        grandstandEx(t, -1, 78, 146, null, null,
          { tiers: 2, h: 17, roof: "cantilever", roofCol: ROOF_D, fasciaCol: CLAD_W });
      }
      // Back-of-house behind the seating wall: dark sheds and a service road.
      run(0.98, 1200, 150, (s, i) => {
        building(K(s), -1, 106, 16, 9 + hash(i * 3.1) * 3, 74,
          { wall: i % 2 ? CLAD_L : [0.34, 0.35, 0.37], window: GLASS, lit: false });
      });
      // Spectator car parks and the cedar edge closing off the outfield.
      for (const s of [0.028, 0.086, 0.146, 0.204])
        groundPatch(K(s), -1, 148, [52, 0.16, 96], ASPH);
      forestEdge(0.000, 0.238, -1, 196,
        { hMin: 14, hMax: 26, col: SUGI_D, col2: SUGI_B, pineFrac: 0.94, density: 0.16 });
      forestEdge(0.968, 0.999, -1, 196,
        { hMin: 14, hMax: 26, col: SUGI_D, col2: SUGI_B, pineFrac: 0.94, density: 0.16 });
      sponsorHoarding(0.965, 0.235, -1, 13.5, { h: 1.25, step: 9 });
      sponsorHoarding(0.975, 0.230, 1, 8.0, { h: 1.15, step: 9 });

      // 3. START GANTRY AND THE BIG SCREENS OVER THE STRAIGHT  [0.060 -1 26]
      gantry(0.004, 7.6, STEEL);
      gantry(0.128, 7.4, STEEL);
      gantry(0.196, 7.4, STEEL);
      gantry(0.232, 7.4, STEEL);
      for (const s of [0.040, 0.100, 0.180]) {
        billboard(K(s), -1, 30, 24, 11, [0.06, 0.07, 0.09], { style: "monopole" });
      }
      // Two big screens facing back up the straight, and a smaller pair
      // angled at the grandstand bank.
      billboard(K(0.022), -1, 36, 30, 14, [0.05, 0.06, 0.08], { style: "monopole" });
      billboard(K(0.148), -1, 34, 28, 13, [0.05, 0.06, 0.08], { style: "monopole" });
      for (const s of [0.070, 0.150]) {
        billboard(K(s), 1, 46, 20, 9, [0.08, 0.09, 0.11], { style: "monopole" });
      }
      cameraTower(K(0.008), -1, 34, { h: 13 });
      cameraTower(K(0.066), -1, 33, { h: 12 });
      cameraTower(K(0.120), -1, 34, { h: 12 });

      // 4. MOUNT FUJI  [0.120 — 900]
      //    The identifying object of the whole place: ONE very large, very
      //    distant snow-capped cone on the WESTERN skyline, dominating the
      //    view back down the straight.
      //
      //    A TRUE COMPASS BEARING, not the straight's outboard normal. The
      //    normal was the old idiom ("walk it out rather than guess a
      //    bearing") and it is not a guess that went wrong — it is the wrong
      //    quantity: it tracks the ROAD's heading, and at K(0.120) that
      //    points 321.2° (north-west, measured). The circuit is at
      //    35.3714 N 138.9267 E and the summit at 35.3581 N 138.7311 E, so
      //    the real mountain sits at 266.1° — 18.2 km almost due west, which
      //    is why this file's own header says "eastern foothills". 55° out is
      //    a whole quadrant of sky, and it put the cone off the shoulder of
      //    the view back down the straight instead of down the middle of it.
      //    docs/tracks/fuji.md said "due north" and was wrong too; fixed with
      //    this commit.
      //
      //    +X is WEST and +Z is NORTH (tools/track/import-circuit-path.mjs),
      //    so a bearing θ clockwise from north is (x, z) = (-sin θ, cos θ).
      const FUJI_BEARING = 266.1 * Math.PI / 180;
      const ux = -Math.sin(FUJI_BEARING), uz = Math.cos(FUJI_BEARING);
      // The world perpendicular to that sightline — what "along the range"
      // means for the Hoei bump and the flanking foothills below. It has to
      // rotate with the bearing, or they splay off a line the cone no longer
      // stands on.
      const tx = -uz, tz = ux;
      const fA = anchor(K(0.120), -1, 0);
      // Still short of the real 18.2 km: past ~10 km this circuit's fog
      // (0.0030) has eaten the cone entirely, so the distance is compressed
      // and the height with it — 1760 m at 9400 m subtends 10.6°, against
      // 10.0° for the real 3196 m of relief at 18.2 km. Same silhouette,
      // through half the fog.
      const FAR = 9400;
      const fx = fA.c[0] + ux * FAR, fz = fA.c[2] + uz * FAR;
      mountain(fx, fz, pyMin - 46, 6400, 1760, {
        seg: 28, seed: 11, rough: 0.085, snowline: 0.55,
        snow: [0.95, 0.96, 1.00], rock: [0.33, 0.32, 0.36], forest: [0.14, 0.24, 0.20],
      });
      // Hoei — the crater bump on the south-east flank, below the snowline and
      // the one thing that stops the cone reading as a generic triangle.
      mountain(fA.c[0] + ux * (FAR - 900) + tx * 1650,
        fA.c[2] + uz * (FAR - 900) + tz * 1650, pyMin - 44, 2300, 880,
        { seg: 18, seed: 23, rough: 0.13, snowline: 1.35,
          rock: [0.31, 0.30, 0.33], forest: [0.13, 0.23, 0.19] });
      // Foothills flanking it, low and dark, so the cone reads as the big one.
      for (const [along, dOut, w, h, sd] of [
        [-4200, 7200, 1500, 250, 3], [3900, 7000, 1350, 210, 5],
        [-7600, 6400, 1250, 180, 8], [7400, 6600, 1100, 165, 2],
        [-2100, 8300, 1700, 300, 14], [5600, 8100, 1450, 265, 17],
      ]) {
        mountain(fA.c[0] + ux * dOut + tx * along, fA.c[2] + uz * dOut + tz * along,
          pyMin - 34, w, h,
          { seg: 12, seed: sd, rough: 0.30, snowline: 1.4,
            forest: [0.13, 0.22, 0.18], rock: [0.30, 0.30, 0.31] });
      }
      // A low hazed ring of forested foothills closing the rest of the horizon.
      {
        const { cx, cz, radius } = lapBounds();
        for (let i = 0; i < 24; i++) {
          const h = hash(i * 13.9), a = (i + h * 0.5) / 24 * 6.2832;
          const rr = radius + 760 + h * 460;
          mountain(cx + Math.cos(a) * rr, cz + Math.sin(a) * rr, pyMin - 16,
            420 + h * 260, 76 + h * 64,
            { seg: 8, seed: i * 5 + 3, rough: 0.36, snowline: 1.6,
              forest: [0.13 + h * 0.03, 0.24 + h * 0.05, 0.19], rock: [0.30, 0.31, 0.30] });
        }
      }

      // 5. PADDOCK, THEN THE HOTEL AND MOTORSPORTS MUSEUM  [0.150 +1 40]
      run(0.030, 700, 52, (s, i) => {
        motorhome(K(s), 1, 44, 9, 4.6, 16,
          { accent: i % 3 === 0 ? [0.72, 0.16, 0.16] : CLAD_L, roof: true });
      });
      // A second row of team transporters parked behind the first.
      run(0.044, 560, 58, (s, i) => {
        motorhome(K(s), 1, 66, 8, 4.2, 15,
          { accent: i % 2 ? [0.20, 0.26, 0.52] : CLAD_W, roof: true });
      });
      broadcastCompound(K(0.088), 1, 62, { vans: 6, dishes: 3, spacing: 9 });
      // The 2022 hotel + museum block on the west side of the complex: a
      // distant built mass, not roadside detail.
      building(K(0.150), 1, 118, 34, 26, 96, { wall: CLAD, window: GLASS, floor: 3.8, lit: false });
      building(K(0.178), 1, 124, 30, 20, 74, { wall: CLAD_L, window: GLASS, floor: 3.8, lit: false });
      building(K(0.196), 1, 150, 26, 15, 60, { wall: [0.38, 0.39, 0.41], window: GLASS, lit: false });
      building(K(0.214), 1, 164, 22, 11, 54, { wall: CLAD_W, window: GLASS, floor: 3.8, lit: false });
      groundPatch(K(0.166), 1, 96, [38, 0.16, 74], ASPH);              // hotel car park
      for (const s of [0.058, 0.112, 0.168])
        groundPatch(K(s), 1, 40, [34, 0.16, 46], [0.30, 0.31, 0.33]);   // paddock tarmac
      // Ornamental cedar around the hotel forecourt.
      for (const [s, d] of [[0.140, 92], [0.158, 88], [0.186, 100], [0.206, 112]]) {
        tree(K(s), 1, d, 11, SUGI_L);
        pine(K(s), 1, d + 14, 17, SUGI_D, { slim: true });
      }

      // 6. TURN 1 — TGR CORNER (27R) AND 75R
      //    [0.230 -1 18 · 0.250 -1 14 · 0.282 +1 16]
      //    The prime overtaking spot: a stand over the braking zone, then wide
      //    tarmac run-off, a low bank and the first cedar rank beyond it.
      grandstandEx(0.230, -1, 18, 190, null, null,
        { tiers: 2, h: 14, roof: "cantilever", roofCol: ROOF, fasciaCol: CLAD });
      grandstandEx(0.208, -1, 19, 120, null, null,
        { tiers: 1, h: 11, roofCol: [0.32, 0.33, 0.37], fasciaCol: CLAD_L });
      // A third, taller block set back over the two — the braking zone is the
      // most-photographed corner here after the mountain.
      grandstandEx(0.216, -1, 52, 210, null, null,
        { tiers: 2, h: 18, roof: "cantilever", roofCol: ROOF_D, fasciaCol: CLAD_W });
      terrace(0.196, 0.234, -1, 84, { rows: 8, rise: 1.5, depth: 2.8, density: 0.4,
        conc: CONC_D, concAlt: CONC });
      // Spectator village behind the T1 bank: food units, toilets, a screen.
      for (const [s1, g, w, h1, d] of [[0.198, 114, 12, 5, 26], [0.216, 118, 14, 6, 30],
                                       [0.236, 112, 11, 5, 22], [0.254, 120, 13, 6, 28]])
        building(K(s1), -1, g, w, h1, d, { wall: CLAD_W, window: GLASS, lit: false });
      groundPatch(K(0.222), -1, 138, [40, 0.16, 90], ASPH);
      cameraTower(K(0.244), -1, 30, { h: 14 });
      billboard(K(0.224), -1, 26, 22, 10, [0.06, 0.07, 0.09], { style: "monopole" });
      // Wide tarmac run-off, then gravel, then the bank.
      for (const s of [0.238, 0.252, 0.266]) groundPatch(K(s), -1, 20, [30, 0.15, 34], TARMAC);
      for (const s of [0.246, 0.256, 0.266]) groundPatch(K(s), -1, 15, [26, 0.18, 30], GRAVEL);
      spectatorHill(0.252, 0.300, -1, 30, { rows: 6, rise: 1.5, depth: 3.0, grass: SCRUB, density: 0.4 });
      forestEdge(0.255, 0.310, -1, 46, { hMin: 13, hMax: 23, col: SUGI, col2: SUGI_D, pineFrac: 0.9, density: 0.2 });
      forestEdge(0.250, 0.320, -1, 86, { hMin: 16, hMax: 28, col: SUGI_D, col2: SUGI_B, pineFrac: 0.95, density: 0.18 });
      tyreWall(0.243, 0.268, -1, 13, [0.86, 0.20, 0.16]);
      // 75R drops away from the stands and the cedar closes in on the inside.
      forestEdge(0.272, 0.320, 1, 16, { hMin: 12, hMax: 21, col: SUGI, col2: SUGI_L, pineFrac: 0.9, density: 0.25 });
      forestEdge(0.276, 0.330, 1, 44, { hMin: 15, hMax: 26, col: SUGI_D, col2: SUGI, pineFrac: 0.95, density: 0.2 });
      hedge(0.272, 0.318, 1, 12, 1.5, SCRUB);
      marshalPost(K(0.262), -1, 13);
      marshalPost(K(0.292), 1, 13);

      // 7. COCA-COLA CORNER (80R) AND TOYOPET (100R)
      //    [0.372 -1 20 · 0.412 +1 24]
      sponsorHoarding(0.345, 0.400, -1, 12, { h: 1.3, step: 8 });
      sponsorHoarding(0.398, 0.446, 1, 14, { h: 1.2, step: 8 });
      terrace(0.358, 0.392, -1, 20, { rows: 7, rise: 1.5, depth: 2.7, density: 0.42, conc: CONC });
      bleacher(0.398, 0.418, -1, 22, { rows: 6, rise: 1.35, density: 0.32 });
      // Small spectator terrace service block and the corner's own screen.
      building(K(0.366), -1, 54, 14, 7, 34, { wall: CLAD_W, window: GLASS, lit: false });
      billboard(K(0.380), -1, 40, 16, 7, [0.72, 0.13, 0.14], { style: "monopole" });
      forestEdge(0.320, 0.372, -1, 34, { hMin: 13, hMax: 24, col: SUGI, col2: SUGI_D, pineFrac: 0.92, density: 0.2 });
      // Fully onto the conifer plateau: dense sugi both sides.
      forestEdge(0.325, 0.470, 1, 24, { hMin: 14, hMax: 25, col: SUGI, col2: SUGI_D, pineFrac: 0.94, density: 0.25 });
      forestEdge(0.400, 0.470, -1, 26, { hMin: 14, hMax: 25, col: SUGI_D, col2: SUGI, pineFrac: 0.94, density: 0.22 });
      forestEdge(0.330, 0.470, 1, 70, { hMin: 17, hMax: 30, col: SUGI_D, col2: SUGI_B, pineFrac: 0.96, density: 0.18 });
      forestEdge(0.320, 0.470, -1, 96, { hMin: 18, hMax: 31, col: SUGI_B, col2: SUGI_D, pineFrac: 0.97, density: 0.15 });
      marshalPost(K(0.372), -1, 13);
      marshalPost(K(0.418), 1, 13);

      // 8. ADVAN CORNER (30R) AND 120R  [0.470 -1 22 · 0.525 +1 30]
      //    Tight right with gravel on the outside; then 120R sweeping through
      //    the forest at its densest.
      for (const s of [0.468, 0.478, 0.488]) groundPatch(K(s), -1, 14, [24, 0.18, 28], GRAVEL);
      tyreWall(0.464, 0.492, -1, 20, [0.86, 0.20, 0.16]);
      bleacher(0.466, 0.486, -1, 34, { rows: 5, rise: 1.3, density: 0.28 });
      marshalPost(K(0.478), -1, 13);
      forestEdge(0.470, 0.530, -1, 30, { hMin: 15, hMax: 27, col: SUGI_D, col2: SUGI, pineFrac: 0.95, density: 0.25 });
      forestEdge(0.505, 0.600, 1, 30, { hMin: 16, hMax: 28, col: SUGI, col2: SUGI_D, pineFrac: 0.95, density: 0.3 });
      forestEdge(0.530, 0.620, -1, 24, { hMin: 15, hMax: 27, col: SUGI, col2: SUGI_L, pineFrac: 0.95, density: 0.3 });
      // A second rank further back, so the wall of cedar has depth.
      forestEdge(0.480, 0.640, 1, 62, { hMin: 17, hMax: 30, col: SUGI_D, col2: SUGI, pineFrac: 0.96, density: 0.2 });
      forestEdge(0.480, 0.640, -1, 58, { hMin: 17, hMax: 30, col: SUGI_D, col2: SUGI, pineFrac: 0.96, density: 0.2 });
      // And a third, hazier rank behind that: this is the densest forest on
      // the lap and it should not end at one treeline.
      forestEdge(0.490, 0.630, 1, 118, { hMin: 18, hMax: 32, col: SUGI_B, col2: SUGI_D, pineFrac: 0.97, density: 0.15 });
      forestEdge(0.490, 0.630, -1, 112, { hMin: 18, hMax: 32, col: SUGI_B, col2: SUGI_D, pineFrac: 0.97, density: 0.15 });
      marshalPost(K(0.540), 1, 13);
      marshalPost(K(0.596), -1, 13);

      // 9. 300R — LONG FAST RIGHT  [0.707 -1 28]
      //    The trees pull back for run-off and the mountain reappears over the
      //    treeline on the western side: no tall rank inside 60 m here.
      for (const s of [0.690, 0.702, 0.714]) groundPatch(K(s), -1, 16, [30, 0.18, 34], GRAVEL);
      for (const s of [0.686, 0.700, 0.716]) groundPatch(K(s), -1, 34, [36, 0.15, 40], TARMAC);
      spectatorHill(0.672, 0.724, -1, 28, { rows: 5, rise: 1.4, depth: 3.2, grass: SCRUB, density: 0.3 });
      forestEdge(0.640, 0.690, -1, 64, { hMin: 12, hMax: 20, col: SUGI_D, col2: SUGI, pineFrac: 0.9, density: 0.18 });
      forestEdge(0.726, 0.760, -1, 58, { hMin: 12, hMax: 20, col: SUGI_D, col2: SUGI, pineFrac: 0.9, density: 0.18 });
      forestEdge(0.640, 0.735, 1, 26, { hMin: 15, hMax: 26, col: SUGI, col2: SUGI_D, pineFrac: 0.95, density: 0.25 });
      bleacher(0.682, 0.712, -1, 50, { rows: 6, rise: 1.35, density: 0.3 });
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
      gantry(0.732, 6.9, [0.90, 0.74, 0.10]);            // the corner's sponsor arch
      for (const [s1, g] of [[0.733, 17], [0.741, 16], [0.749, 17]])
        prop(K(s1), 1, g, [1.7, 1.2, 4.2], [0.09, 0.09, 0.10]);   // stacked spares
      // Marshal hut and a tyre store behind the hairpin bank.
      building(K(0.744), 1, 38, 10, 5, 22, { wall: CLAD_W, window: GLASS, lit: false });
      prop(K(0.750), 1, 34, [3.4, 1.9, 9], [0.10, 0.10, 0.11]);
      forestEdge(0.716, 0.770, 1, 56, { hMin: 15, hMax: 27, col: SUGI_D, col2: SUGI, pineFrac: 0.95, density: 0.22 });

      // 11. THE 30R/45R FLICK — tree-lined and enclosed  [0.808 -1 18]
      forestEdge(0.762, 0.860, -1, 18, { hMin: 15, hMax: 27, col: SUGI, col2: SUGI_D, pineFrac: 0.95, density: 0.3 });
      forestEdge(0.762, 0.860, 1, 20, { hMin: 15, hMax: 27, col: SUGI_D, col2: SUGI, pineFrac: 0.95, density: 0.3 });
      forestEdge(0.766, 0.858, -1, 48, { hMin: 17, hMax: 30, col: SUGI_D, col2: SUGI, pineFrac: 0.96, density: 0.2 });
      forestEdge(0.768, 0.856, 1, 50, { hMin: 17, hMax: 30, col: SUGI_B, col2: SUGI_D, pineFrac: 0.96, density: 0.2 });
      forestEdge(0.770, 0.854, -1, 96, { hMin: 18, hMax: 31, col: SUGI_B, col2: SUGI_D, pineFrac: 0.97, density: 0.15 });
      hedge(0.770, 0.856, -1, 13, 1.7, SCRUB);
      marshalPost(K(0.808), -1, 14);
      marshalPost(K(0.838), 1, 14);

      // 12. GR SUPRA (25R) AND PANASONIC (12R)
      //     [0.877 +1 16 · 0.897 -1 14]
      //     The lap turns back toward the paddock, then the final slow right
      //     onto the straight with the grandstand wall resuming outside it.
      building(K(0.877), 1, 26, 14, 9, 44, { wall: CLAD_L, window: GLASS, lit: false });
      building(K(0.898), 1, 30, 13, 11, 52, { wall: CLAD, window: GLASS, lit: false });
      building(K(0.920), 1, 34, 15, 8, 40, { wall: [0.36, 0.37, 0.39], window: GLASS, lit: false });
      // Infield service yard behind them: the paddock coming back into view.
      building(K(0.862), 1, 46, 16, 10, 48, { wall: CLAD_W, window: GLASS, lit: false });
      building(K(0.936), 1, 52, 18, 12, 56, { wall: CLAD_L, window: GLASS, floor: 3.9, lit: false });
      groundPatch(K(0.905), 1, 22, [34, 0.16, 44], [0.30, 0.31, 0.33]);
      groundPatch(K(0.876), 1, 58, [30, 0.16, 62], ASPH);
      marshalPost(K(0.880), 1, 14);
      grandstandEx(0.897, -1, 14, 150, null, null,
        { tiers: 1, h: 12, roofCol: [0.31, 0.32, 0.36], fasciaCol: CLAD });
      grandstandEx(0.930, -1, 16, 160, null, null,
        { tiers: 2, h: 14, roofCol: ROOF, fasciaCol: CLAD_L });
      terrace(0.886, 0.944, -1, 42, { rows: 8, rise: 1.5, depth: 2.7, density: 0.45, conc: CONC });
      terrace(0.904, 0.952, -1, 70, { rows: 7, rise: 1.5, depth: 2.7, density: 0.4,
        conc: CONC_D, concAlt: CONC });
      // Depth behind the last corner's seating.
      building(K(0.912), -1, 84, 16, 9, 66, { wall: [0.34, 0.35, 0.37], window: GLASS, lit: false });
      forestEdge(0.860, 0.960, -1, 120, { hMin: 16, hMax: 28, col: SUGI_D, col2: SUGI_B, pineFrac: 0.95, density: 0.16 });
      tyreWall(0.888, 0.912, -1, 12, [0.86, 0.20, 0.16]);
      cameraTower(K(0.896), -1, 32, { h: 12 });
      billboard(K(0.884), -1, 30, 18, 8, [0.06, 0.07, 0.09], { style: "monopole" });

      // 13. THE CEDAR PLATEAU — ranks, not scatter. Tall, narrow, dark sugi at
      //     THREE distances over the whole back three quarters; the straight is
      //     built frontage and stays clear.
      const TINTS = [SUGI, SUGI_D, SUGI_L, SUGI_B];
      every(22, (k) => {
        const f = k / n;
        if (f < 0.245 || f > 0.965) return;
        const h = hash(k * 17.3);
        if (h < 0.20) return;
        for (const side of [-1, 1]) {
          const near = 30 + h * 20 + (side < 0 ? 5 : 0);
          const mid = 78 + hash(k * 5.1 + side) * 54;
          const far = 158 + hash(k * 2.7 + side) * 96;
          let j = 0;
          for (const dist of [near, mid, far]) {
            const a = anchor(k, side, dist);
            j++;
            if (onTrack(a.c[0], a.c[2], 9)) continue;
            pine(k, side, dist, 15 + h * 12 + j * 1.5,
              TINTS[(k + j * 2 + (side < 0 ? 1 : 0)) % 4], { slim: true });
          }
          if (h > 0.7) tree(k, side, near + 12, 9 + h * 5, SUGI_L);
          if (h > 0.82) bush(k, side, near - 10, SCRUB);
          if (h > 0.55) {
            const b = anchor(k, side, mid - 16);
            if (!onTrack(b.c[0], b.c[2], 8)) bush(k, side, mid - 16, SCRUB);
          }
        }
      });
      // Hazed cedar backdrop mass well beyond the ranks. The infield cannot
      // take these (measured: every +1 backdrop is refused), so they ring the
      // outfield only, out past 420 m where nothing else competes.
      for (let i = 0; i < 30; i++) {
        const f = 0.25 + (i / 30) * 0.72, k = K(f), h = hash(i * 9.7);
        backdrop(k, -1, 430 + h * 160,
          [110 + h * 70, 34 + h * 26, 80 + h * 40],
          [0.14 + h * 0.03, 0.26 + h * 0.05, 0.21 + h * 0.03]);
      }

      // 14. BARRIERS, POSTS AND CAMERAS — the continuous furniture pass.
      //     The +1 rail and fence stop short of the 300R no-place band rather
      //     than asking for props the engine will refuse.
      guardrail(0.0, 1.0, -1, 11, RAIL);
      guardrail(0.716, 0.700, 1, 11, RAIL);
      fence(0.25, 0.97, -1, 14.5, 2.4, [0.62, 0.63, 0.66]);
      fence(0.25, 0.698, 1, 14.5, 2.4, [0.62, 0.63, 0.66]);
      fence(0.718, 0.97, 1, 14.5, 2.4, [0.62, 0.63, 0.66]);
      fence(0.965, 0.240, -1, 16.0, 2.6, [0.62, 0.63, 0.66]);
      for (let i = 0; i < 10; i++) {
        const f = (i + 0.5) / 10;
        if (f > 0.02 && f < 0.23) continue;            // the straight has its own
        marshalPost(K(f), i % 2 ? 1 : -1, 13);
      }
  };
