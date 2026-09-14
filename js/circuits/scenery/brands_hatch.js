/* Apex 26 — BRANDS HATCH scenery (data only), split out of js/circuits/brands_hatch.js.
   LAZY_SCENERY (tools/manifest.cjs): no <script> tag.

   Brief: docs/tracks/brands_hatch.md. Every §4 row is implemented; the block
   that carries each one is named below.

     1. THE BOWL .............. rows 0.025/-1, 0.076/-1, 0.190/-1, 0.378/-1,
                               0.832/-1, 0.914/-1  (open grass banking, chalk)
     2. BRABHAM FRONTAGE ...... rows 0.005/-1, 0.014/-1  (main stand, retail
                               row, Paddock Hill Grandstand on the lip)
     3. THE INFIELD ........... rows 0.005/+1, 0.014/+1, 0.040/+1, 0.260/+1,
                               0.960/+1  (pits, Kentagon, paddock, Cooper
                               Straight, race control + start gantry)
     4. DRUIDS ................ rows 0.076/-1, 0.070/+1  (terracing + footbridge)
     5. THE WOODS ............. rows 0.378/-1, 0.430/-1, 0.461/+1, 0.532/-1,
                               0.636/+1, 0.760/-1  (Surtees -> Stirlings)
     6. FURNITURE ............. armco, catch fence, tyre walls, marshal posts,
                               cameras, hoardings — all rows
     7. KENT BACKDROP ......... §1/§2 downland beyond the circuit

   The two worlds are kept apart on purpose: WOODS_A (0.378) .. WOODS_B (0.845)
   is closed-in broadleaf with nothing built; everything outside it is the open
   bowl with spectators on grass. That contrast IS Brands Hatch (§6). */
"use strict";
(window.TrackScenery = window.TrackScenery || {})["brands_hatch"] =
  function (api) {
      const { n, hash, every, anchor, onTrack, out,
        tree, pine, bush, hedge, forestEdge,
        building, tower, grandstandEx, spectatorHill, terrace, bleacher,
        guardrail, fence, tyreWall, marshalPost, cameraTower, broadcastCompound,
        billboard, sponsorHoarding, gantry,
        place, ridge, addBox } = api;

      const K = (s) => Math.round(s * n) % n;

      // Kent broadleaf: oak/beech/chestnut, with a little conifer in the mix.
      const OAK   = [0.17, 0.34, 0.15];
      const OAK_D = [0.12, 0.25, 0.11];
      const OAK_L = [0.25, 0.43, 0.19];
      const CONIF = [0.11, 0.25, 0.16];
      const SCRUB = [0.20, 0.32, 0.16];
      // Built palette — chalk render, Kent brick, steel, tarmac.
      const CHALK = [0.86, 0.85, 0.79];
      const RENDER= [0.78, 0.77, 0.73];
      const BRICK = [0.52, 0.40, 0.34];
      const STEEL = [0.72, 0.74, 0.77];
      const DKGREY= [0.30, 0.32, 0.35];
      const ARMCO = [0.78, 0.78, 0.80];
      const ROOF  = [0.33, 0.35, 0.38];
      const GRAVEL= [0.60, 0.56, 0.47];
      const CHALKY= [0.80, 0.79, 0.71];
      const TYRE  = [0.86, 0.22, 0.18];

      // The GP loop leaves the bowl at Surtees and rejoins it at Stirlings.
      const WOODS_A = 0.378, WOODS_B = 0.845;
      const inWoods = (s) => s >= WOODS_A && s <= WOODS_B;

      /* ---------------------------------------------------------------- */
      /* 1. THE BOWL — open grass banking, no woodland. The amphitheatre    */
      /*    reads from the rim at the start line all the way round Clark.   */
      /*    Rows 0.025/-1, 0.076/-1, 0.190/-1, 0.378/-1, 0.832/-1, 0.914/-1 */
      /* ---------------------------------------------------------------- */

      // Paddock Hill: the bank falls with the track into the bottom of the dip.
      spectatorHill(0.008, 0.062, -1, 10, {});
      // The climb out and up to Druids — the amphitheatre's high point.
      spectatorHill(0.055, 0.105, -1, 14, {});
      // Graham Hill Bend, looking back up the hill at Druids.
      spectatorHill(0.168, 0.220, -1, 16, {});
      // Cooper Straight side of the bowl, then the run to Surtees: last of the
      // open banking before the loop escapes into the trees.
      spectatorHill(0.300, 0.395, -1, 20, {});
      // Stirlings: the trees give out and the bowl reopens.
      spectatorHill(0.826, 0.888, -1, 20, {});
      // Clark Curve, long right back onto the pit straight.
      spectatorHill(0.892, 0.948, -1, 16, {});

      // Terracing where the banks are steepest — Druids and Clark (rows
      // 0.076/-1 "terraced grass banking" and 0.914/-1 "terraced banking").
      terrace(0.064, 0.094, -1, 14, {});
      terrace(0.900, 0.940, -1, 16, {});
      terrace(0.180, 0.208, -1, 16, {});
      // A low bleacher run at the bottom of the Paddock Hill bank.
      bleacher(0.028, 0.050, -1, 12, {});
      bleacher(0.836, 0.868, -1, 21, {});

      // Chalk showing through the turf (§2) — bare scrapes on the banks.
      for (const s of [0.030, 0.072, 0.195, 0.360, 0.845, 0.920]) {
        place(K(s), -1, 15, [15, 0.28, 17], CHALKY);
      }

      // Sparse hedgerow-and-standard planting round the bowl rim: Kent field
      // boundaries, deliberately thin so the bowl stays open (§6).
      every(30, (k) => {
        const s = k / n;
        if (inWoods(s)) return;
        const h = hash(k * 37);
        if (h < 0.40) return;
        for (const side of [-1, 1]) {
          const dist = 46 + h * 26 + (side > 0 ? 10 : 0);
          const a = anchor(k, side, dist);
          if (onTrack(a.c[0], a.c[2], 9)) continue;
          tree(k, side, dist, 8 + h * 5, h < 0.6 ? OAK : OAK_L);
          if (h > 0.80) tree(k, side, dist + 12, 7 + h * 4, OAK_D);
        }
      });

      // Kent hedgerows beyond the banking — field boundaries, not scenery walls.
      // The bowl is tight, so these sit on the OUTSIDE only: a hedgerow run on
      // the infield would cross the far side of the loop and be guard-dropped.
      hedge(0.104, 0.166, -1, 44, 2.2, OAK_D);
      hedge(0.222, 0.296, -1, 46, 2.2, OAK_D);
      hedge(0.894, 0.952, -1, 42, 2.0, OAK_D);

      /* ---------------------------------------------------------------- */
      /* 2. BRABHAM STRAIGHT FRONTAGE (-1) — a CONTINUOUS built frontage:   */
      /*    main grandstand, retail units behind it, then the Paddock Hill  */
      /*    Grandstand right on the lip of the drop.                        */
      /*    Rows 0.005/-1 (18 m) and 0.014/-1 (12 m).                       */
      /* ---------------------------------------------------------------- */

      // Main grandstand run down Brabham Straight.
      grandstandEx(0.988, -1, 18, 118, null, null);
      // Paddock Hill Grandstand — end of the row, on the lip of the drop.
      // The single most-photographed viewpoint at the circuit.
      grandstandEx(0.016, -1, 12, 62, null, null);

      // Merchandise / retail units BEHIND the stands: a solid frontage, not
      // isolated boxes. Shallow units butted together along the straight.
      for (let s = 0.960; s < 1.026; s += 0.0075) {
        const k = K(s);
        const h = hash(k * 53);
        building(k, -1, 34, 11, 5.0 + h * 1.6, 13, {});
      }
      // Hospitality / office block anchoring the top of the retail row.
      building(K(0.972), -1, 50, 22, 9, 18, {});
      building(K(0.006), -1, 49, 18, 8, 16, {});

      // The Paddock Hill Bar, set INTO the grass bank at the bottom of the dip
      // (row 0.025/-1: bank + bar building, standing crowd on grass, no shell).
      building(K(0.026), -1, 13, 16, 5.5, 12, {});
      building(K(0.036), -1, 16, 12, 4.5, 10, {});

      // Crowd furniture on the open bank: flag poles and a scatter of marquees.
      for (const s of [0.020, 0.034, 0.048, 0.190, 0.900, 0.930]) {
        place(K(s), -1, 24, [3.0, 3.0, 3.0], CHALK);
      }

      /* ---------------------------------------------------------------- */
      /* 3. THE INFIELD (+1) — pits, Kentagon, paddock, Cooper Straight and  */
      /*    race control. This all sits INSIDE the loop and blocks the view  */
      /*    across to Cooper Straight from the main banks: that is correct.  */
      /*    Rows 0.005/+1, 0.014/+1, 0.040/+1, 0.260/+1, 0.960/+1.           */
      /* ---------------------------------------------------------------- */

      // Pit garages — a continuous run of bays down the inside of the straight.
      for (let s = 0.938; s < 1.032; s += 0.0068) {
        building(K(s), 1, 14, 9, 6.5, 15, {});
      }
      // Pit-lane rear wall / team offices above the bays.
      for (let s = 0.944; s < 1.026; s += 0.014) {
        building(K(s), 1, 27, 14, 8.5, 12, {});
      }

      // Race control / timing building, and the start gantry over the line.
      building(K(0.960), 1, 25, 20, 12, 17, {});
      tower(K(0.966), 1, 25, 5.5, 17, {});
      gantry(0.0, 7.2, STEEL);
      gantry(0.972, 6.8, DKGREY);

      // The KENTAGON — the circuit's bar/clubhouse, directly opposite the
      // Paddock Hill grandstand. A named landmark in its own right, so it gets
      // a real footprint and a roof lantern rather than a generic box.
      building(K(0.014), 1, 20, 19, 8.5, 19, {});
      tower(K(0.014), 1, 20, 4.0, 12.5, {});
      building(K(0.024), 1, 22, 13, 5.0, 12, {});

      // Paddock / team area, stepping down the hill behind the pits:
      // transporters, awnings, hospitality units.
      for (let s = 0.030; s < 0.072; s += 0.0075) {
        const k = K(s);
        const h = hash(k * 61);
        place(k, 1, 30 + h * 6, [3.6, 4.1, 15], h > 0.5 ? CHALK : STEEL); // transporter
        place(k, 1, 35 + h * 4, [2.6, 3.0, 7], DKGREY);                   // tractor unit
        if (h > 0.45) building(k, 1, 48, 12, 5.5, 11, {});
        place(k, 1, 41, [9, 3.4, 7], h > 0.5 ? RENDER : CHALK);   // awnings
      }
      broadcastCompound(K(0.050), 1, 58, {});

      // Cooper Straight runs back along the foot of the bowl UNDER the pit
      // buildings — keep this side built-up and close (row 0.260/+1, 12 m).
      for (let s = 0.215; s < 0.312; s += 0.0090) {
        const k = K(s);
        const h = hash(k * 71);
        building(k, 1, 12 + h * 3, 10, 5.5 + h * 3.5, 13, {});
      }
      building(K(0.246), 1, 28, 18, 9, 16, {});
      building(K(0.284), 1, 29, 16, 8, 15, {});
      // Paddock entrance beyond Clark Curve (row 0.914/-1 tail).
      building(K(0.905), 1, 30, 15, 6.5, 14, {});
      building(K(0.930), 1, 34, 13, 6.0, 12, {});

      /* ---------------------------------------------------------------- */
      /* 4. DRUIDS + PILGRIMS — the two spectator footbridges.              */
      /*    Rows 0.070/+1 (climb to Druids) and 0.430/-1 (Pilgrims Drop).    */
      /* ---------------------------------------------------------------- */

      function footbridge(s, deckCol) {
        const k = K(s);
        const L = anchor(k, -1, 7), R = anchor(k, 1, 7);
        const span = Math.hypot(R.c[0] - L.c[0], R.c[1] - L.c[1], R.c[2] - L.c[2]);
        const topY = Math.max(L.c[1], R.c[1]) + 6.6;
        const mid = [(L.c[0] + R.c[0]) / 2, topY, (L.c[2] + R.c[2]) / 2];
        addBox(out, mid, [span, 0.55, 2.8], deckCol, [L.r, L.u, L.t]);
        const t = L.t;
        for (const o of [-1.45, 1.45]) {
          addBox(out, [mid[0] + t[0] * o, mid[1] + 0.95, mid[2] + t[2] * o],
            [span, 1.3, 0.14], STEEL, [L.r, L.u, L.t]);
        }
        for (const e of [L, R]) {
          const h = Math.max(2, topY - e.c[1]);
          addBox(out, [e.c[0], e.c[1] + h / 2, e.c[2]], [1.7, h, 3.4], STEEL, [e.r, e.u, e.t]);
        }
        // Stair towers set back behind the barriers on each side.
        for (const side of [-1, 1]) {
          const a = anchor(k, side, 15);
          const h = Math.max(2.5, topY - a.c[1]);
          addBox(out, [a.c[0], a.c[1] + h / 2, a.c[2]], [3.0, h, 3.2], deckCol, [a.r, a.u, a.t]);
          addBox(out, [a.c[0], a.c[1] + h + 0.3, a.c[2]], [3.4, 0.5, 3.6], ROOF, [a.r, a.u, a.t]);
        }
      }

      footbridge(0.070, RENDER);   // public crossing to the infield at Druids
      footbridge(0.430, DKGREY);   // over Pilgrims Drop, on the way into the woods

      /* ---------------------------------------------------------------- */
      /* 5. THE WOODS — Surtees (0.378) through Hawthorns, Westfield,        */
      /*    Dingle Dell and Sheene, until the bowl reopens at Stirlings.     */
      /*    Mature broadleaf tight to the edge, armco and catch fence,       */
      /*    NOTHING built and no spectator terracing (rows 0.430, 0.461,     */
      /*    0.532, 0.636, 0.760).                                            */
      /* ---------------------------------------------------------------- */

      // Closed canopy either side, right up to the verge.
      forestEdge(0.382, WOODS_B, -1, 13, {});
      forestEdge(0.382, WOODS_B,  1, 13, {});

      // Standards inside the wood, in two ranks at different set-backs so the
      // edge does not read as a single line of trunks.
      every(13, (k) => {
        const s = k / n;
        if (!inWoods(s)) return;
        const h = hash(k * 29);
        // Depth into the trees: deepest through Dingle Dell (0.60..0.70),
        // thinning again from Dingle Dell Corner to Sheene (row 0.760/-1).
        const deep = s > 0.58 && s < 0.72;
        const thin = s > 0.745 ? (s - 0.745) / 0.100 : 0;
        for (const side of [-1, 1]) {
          if (h > 0.90 - thin * 0.45) continue;
          const near = 16 + h * 8;
          const a = anchor(k, side, near);
          if (!onTrack(a.c[0], a.c[2], 8)) {
            const col = h < 0.24 ? CONIF : (h < 0.62 ? OAK : OAK_L);
            if (h < 0.24) pine(k, side, near, 12 + h * 9, col);
            else tree(k, side, near, 9 + h * 7, col);
          }
          const far = 34 + h * 22 + (deep ? 8 : 0);
          const b = anchor(k, side, far);
          if (!onTrack(b.c[0], b.c[2], 8)) {
            tree(k, side, far, 10 + hash(k * 17 + side) * 8,
              hash(k * 13) < 0.5 ? OAK_D : OAK);
          }
          if (deep && h > 0.55) tree(k, side, far + 20, 11 + h * 6, OAK_D);
        }
      });

      // Undergrowth along the verge — bramble and hazel scrub at the edge.
      every(9, (k) => {
        const s = k / n;
        if (!inWoods(s)) return;
        const h = hash(k * 43);
        if (h < 0.42) return;
        bush(k, h < 0.71 ? -1 : 1, 12 + h * 5, h < 0.6 ? SCRUB : OAK_D);
      });

      // Hawthorn Hill / Hawthorns Bend: mature woodland TIGHT to the edge on
      // the inside (row 0.461/+1, 14 m). Extra close rank, nothing built.
      every(11, (k) => {
        const s = k / n;
        if (s < 0.446 || s > 0.492) return;
        const h = hash(k * 83);
        const a = anchor(k, 1, 14 + h * 4);
        if (onTrack(a.c[0], a.c[2], 7)) return;
        tree(k, 1, 14 + h * 4, 11 + h * 6, h < 0.5 ? OAK : OAK_D);
      });

      // Dingle Dell: the deepest point into the trees, the classic "in the
      // woods" frame of the GP loop (row 0.636/+1, 15 m).
      every(10, (k) => {
        const s = k / n;
        if (s < 0.608 || s > 0.668) return;
        const h = hash(k * 97);
        for (const side of [-1, 1]) {
          const d = 15 + h * 5;
          const a = anchor(k, side, d);
          if (onTrack(a.c[0], a.c[2], 7)) continue;
          tree(k, side, d, 13 + h * 7, h < 0.45 ? OAK_D : OAK);
        }
      });

      // Westfield Bend: small marshal post and a gravel trap on the outside
      // (row 0.532/-1, 12 m). The only furniture in the wood besides barriers.
      place(K(0.534), -1, 13, [24, 0.3, 30], GRAVEL);
      place(K(0.545), -1, 15, [20, 0.3, 22], GRAVEL);
      marshalPost(K(0.528), -1, 13);
      // Gravel at the other two places the GP loop needs it.
      place(K(0.468), 1, 14, [20, 0.3, 26], GRAVEL);
      place(K(0.646), 1, 15, [18, 0.3, 22], GRAVEL);

      /* ---------------------------------------------------------------- */
      /* 6. CIRCUIT FURNITURE — armco everywhere, catch fence through the    */
      /*    woods, debris fence in front of the public banks, tyre walls at   */
      /*    the corners that need them, marshal posts and camera positions.   */
      /* ---------------------------------------------------------------- */

      for (const side of [-1, 1]) guardrail(0.0, 1.0, side, 11, ARMCO);

      // Catch fence behind the armco in the woods — trees are close, so the
      // fence is what stops anything leaving the corridor.
      fence(WOODS_A, WOODS_B, -1, 12.4, 4.2, DKGREY);
      fence(WOODS_A, WOODS_B,  1, 12.4, 4.2, DKGREY);
      // Debris fence in front of the public banking round the bowl.
      fence(0.950, 1.060, -1, 12.0, 3.6, DKGREY);
      fence(0.060, 0.230, -1, 12.0, 3.6, DKGREY);
      fence(0.300, 0.380, -1, 12.0, 3.6, DKGREY);
      fence(0.826, 0.950, -1, 12.0, 3.6, DKGREY);
      // Pit wall side of the straight.
      fence(0.950, 1.045, 1, 11.5, 2.6, STEEL);

      // Tyre walls at the impact points.
      tyreWall(0.010, 0.040, -1, 12.5, TYRE);   // Paddock Hill exit
      tyreWall(0.068, 0.090, -1, 12.5, TYRE);   // Druids outside
      tyreWall(0.184, 0.206, -1, 12.5, TYRE);   // Graham Hill
      tyreWall(0.372, 0.392, -1, 12.5, TYRE);   // Surtees
      tyreWall(0.455, 0.478, 1, 12.5, TYRE);    // Hawthorns
      tyreWall(0.526, 0.548, -1, 12.5, TYRE);   // Westfield
      tyreWall(0.628, 0.650, 1, 12.5, TYRE);    // Dingle Dell
      tyreWall(0.826, 0.856, -1, 12.5, TYRE);   // Stirlings
      tyreWall(0.906, 0.930, -1, 12.5, TYRE);   // Clark Curve

      // Marshal posts at every named corner (Westfield's is placed above).
      for (const [s, side] of [[0.010, 1], [0.072, 1], [0.186, 1], [0.260, -1],
        [0.374, 1], [0.430, 1], [0.458, -1], [0.630, -1], [0.756, 1],
        [0.828, 1], [0.910, 1], [0.962, -1]]) {
        marshalPost(K(s), side, 13);
      }

      // Broadcast camera positions: the bowl viewpoints plus two in the trees.
      for (const [s, side] of [[0.014, -1], [0.076, -1], [0.190, -1],
        [0.378, -1], [0.532, 1], [0.636, -1], [0.832, -1], [0.914, -1]]) {
        cameraTower(K(s), side, 17, {});
      }

      // Sponsor hoardings — only where there is a crowd to read them, i.e. the
      // bowl. The woods carry none (row 0.430: "nothing built beyond here").
      sponsorHoarding(0.955, 1.045, -1, 11.6, {});
      sponsorHoarding(0.955, 1.045,  1, 11.6, {});
      sponsorHoarding(0.062, 0.108, -1, 11.6, {});
      sponsorHoarding(0.176, 0.216, -1, 11.6, {});
      sponsorHoarding(0.224, 0.310,  1, 11.6, {});
      sponsorHoarding(0.828, 0.946, -1, 11.6, {});

      billboard(K(0.028), -1, 30, 12, 5, CHALK);
      billboard(K(0.086), -1, 30, 12, 5, BRICK);
      billboard(K(0.268),  1, 34, 12, 5, CHALK);
      billboard(K(0.922), -1, 32, 14, 6, CHALK);

      /* ---------------------------------------------------------------- */
      /* 7. KENT BACKDROP — low chalk downland shoulders beyond the circuit. */
      /*    §1/§2: a natural amphitheatre, green with chalk showing through. */
      /* ---------------------------------------------------------------- */

      for (const [s, side, dist, len, wid, hgt] of [
        [0.130, -1, 620, 420, 130, 34],
        [0.300, -1, 640, 380, 120, 30],
        [0.560,  1, 600, 400, 130, 32],
        [0.700, -1, 620, 360, 120, 28],
        [0.900,  1, 600, 380, 130, 26],
      ]) {
        const a = anchor(K(s), side, dist);
        const ang = Math.atan2(a.t[0], a.t[2]);
        ridge(a.c[0], a.c[2], a.c[1] - 6, ang, len, wid, hgt, [0.22, 0.34, 0.19]);
      }
  };
