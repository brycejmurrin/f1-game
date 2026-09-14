/* Apex 26 — BUDDH scenery (data only), split out of js/circuits/buddh.js.
   LAZY_SCENERY (tools/manifest.cjs): no <script> tag. game.js fetches the ONE
   circuit a session builds.

   Buddh International Circuit, Greater Noida. Tilke on flat farmland: wide,
   modern, low and open, with DELIBERATE artificial elevation (the T10-11
   double-apex sits at the bottom of a constructed drop) and dust haze on every
   horizon. The main grandstand is the only substantial structure; everything
   else on the lap reads as smaller than it, so the outfield is scrub and low
   sheds rather than the generic tree ranks this file used to carry.

   Blocks implement docs/tracks/buddh.md §4, one row per block:
     0  lap spine (barriers + marshal chain; carries the `guardrail` asked for
        by rows 0.235, 0.565 and 0.870 as one continuous run)
     1  s0.005 +1   pit lane and pit block
     2  s0.022 -1   main grandstand
     3  s0.060 +1   paddock behind the pits
     4  s0.108 -1   braking zone into Turn 1
     5  s0.125 +1   dusty inside of Turn 1
     6  s0.185 -1   first open outfield (cultivated field)
     7  s0.235 +1   infield through Turn 2-3
     8  s0.300 -1   outside of the Turn 4-5 pair
     9  s0.372 +1   infield at Turn 6-7 (first earthwork)
    10  s0.430 -1   the run down toward the double apex
    11  s0.495 -1   spectator earth bank at the bottom of the drop
    12  s0.515 +1   inside of the double apex
    13  s0.565 +1   Turn 12, climbing out of the bowl
    14  s0.720 -1   THE HAZE (900 m: ridge + flat silhouettes, no detail)
    15  s0.790 -1   east stand cluster at the end of the back straight
    16  s0.870 +1   final corner onto the main straight
    17  farmland scatter (scrub and low sheds)

   Two API substitutions, both forced and both verified with verify-track:
   `groundPatch`, `motorhome` and `backdrop` emit INVALID geometry on this def
   under every argument shape tried (1, 8 and 1 invalid items respectively, and
   zero verts, so they ship nothing). Flat coloured ground is therefore drawn
   with `runoffApron`, which is the same flat ground quad and takes a colour,
   and the paddock coaches are `place` boxes. Long earthworks are CHAINS of
   short `ridge` slabs: a single slab big enough to span one of these features
   trips the overlap guard and is dropped whole. */
"use strict";
(window.TrackScenery = window.TrackScenery || {})["buddh"] =
  function (api) {
      const { n, hash, every, anchor, onTrack,
        tree, bush, building, place, ridge,
        guardrail, tyreWall, marshalPost, cameraTower, broadcastCompound,
        billboard, sponsorHoarding, runoffApron,
        grandstandEx, scaffoldStand, spectatorHill } = api;

      const K = (s) => Math.round(s * n) % n;
      // Earthworks run along the road; the guard only cares about footprint,
      // so the chain helper keeps every slab small enough to survive.
      const bank = (s, side, dist, len, w, h, col) => {
        const a = anchor(K(s), side, dist);
        ridge(a.c[0], a.c[2], a.c[1], Math.atan2(a.t[0], a.t[2]), len, w, h, col);
      };

      // Hot, hazy, dust-shifted: dry grass, reddish earth, pale tarmac.
      const ARMCO     = [0.78, 0.78, 0.80];
      const PITWALL   = [0.86, 0.86, 0.84];
      const GLASS     = [0.34, 0.44, 0.50];
      const COACH     = [0.88, 0.88, 0.86];
      const PALE      = [0.58, 0.575, 0.575];   // tarmac run-off
      const CONCRETE  = [0.64, 0.63, 0.60];
      const TYRECAP   = [0.84, 0.80, 0.30];
      const BOARD     = [0.80, 0.24, 0.20];
      const DUST      = [0.48, 0.32, 0.21];     // scuffed reddish earth
      const EARTH     = [0.44, 0.33, 0.23];     // graded earthwork
      const DRYGRASS  = [0.50, 0.48, 0.30];
      const FIELD_A   = [0.56, 0.50, 0.31];
      const FIELD_B   = [0.49, 0.45, 0.29];
      const DRYFOL    = [0.30, 0.36, 0.20];
      const SCRUB     = [0.34, 0.38, 0.22];
      const SCRUB_D   = [0.29, 0.32, 0.19];
      // Haze: low contrast, warm grey, barely separated from the sky.
      const HAZE_R    = [0.63, 0.60, 0.55];
      const HAZE_A    = [0.68, 0.65, 0.60];
      const HAZE_B    = [0.71, 0.68, 0.64];

      // 0. LAP SPINE — one continuous barrier line each side plus the marshal
      //    chain. Rows 0.235 / 0.565 / 0.870 ask for `guardrail`; it is this
      //    run, not a second rail stacked on top of it.
      guardrail(0.0, 1.0, 1, 12, ARMCO);
      guardrail(0.0, 1.0, -1, 14, ARMCO);
      for (const s of [0.045, 0.165, 0.275, 0.34, 0.46, 0.63, 0.70, 0.75, 0.83, 0.93])
        marshalPost(K(s), 1, 15);

      // 1. PIT LANE AND PIT BLOCK (0.005 / +1 / 14) — one long low modern unit,
      //    flat roof, continuous glazed band; pit wall rail down the length of
      //    the lane; marshal post at the exit. Second-tallest thing here, and
      //    it is not tall: kept low and horizontal.
      const kPit = K(0.005);
      building(kPit, 1, 14, 15, 8.0, 180);
      place(kPit, 1, 13.2, [0.9, 2.6, 172], GLASS);
      guardrail(0.0, 0.075, 1, 4.5, PITWALL);
      guardrail(0.975, 1.0, 1, 4.5, PITWALL);
      marshalPost(K(0.082), 1, 12);

      // 2. MAIN GRANDSTAND (0.022 / -1 / 24) — the only substantial structure
      //    on the circuit: pale canopy, camera tower off its northern end, and
      //    a sponsor band along the base of the seating.
      grandstandEx(0.022, -1, 24, 150, null, null);
      sponsorHoarding(0.004, 0.042, -1, 21);
      cameraTower(K(0.050), -1, 27);

      // 3. PADDOCK BEHIND THE PITS (0.060 / +1 / 45) — a rank of motorhome
      //    coaches, two hospitality units, the broadcast compound at the far
      //    end, hard flat concrete apron under all of it and no grass.
      for (let i = 0; i < 4; i++) runoffApron(K(0.036 + i * 0.020), 1, 30, 64, CONCRETE);
      for (let i = 0; i < 6; i++) place(K(0.036 + i * 0.0085), 1, 45, [3.2, 3.8, 12], COACH);
      for (let i = 0; i < 4; i++) place(K(0.040 + i * 0.0085), 1, 58, [3.0, 3.6, 11], COACH);
      building(K(0.072), 1, 66, 18, 6.5, 34);
      building(K(0.088), 1, 66, 17, 6.0, 30);
      broadcastCompound(K(0.102), 1, 48);

      // 4. BRAKING ZONE INTO TURN 1 (0.108 / -1 / 32) — the run-off IS the
      //    visual event: far wider than it needs to be, with the tyre wall set
      //    well back on the barrier line and two billboards beyond it.
      runoffApron(K(0.100), -1, 8, 72, PALE);
      runoffApron(K(0.116), -1, 8, 72, PALE);
      tyreWall(0.094, 0.136, -1, 30, TYRECAP);
      billboard(K(0.103), -1, 40, 13, 4.8, BOARD);
      billboard(K(0.119), -1, 40, 13, 4.8, BOARD);

      // 5. INSIDE OF TURN 1, DUSTY (0.125 / +1 / 20) — the dirtiest part of the
      //    circuit in every reference photograph: grass worn off to reddish
      //    earth, a marshal post, low bush clumps.
      runoffApron(K(0.125), 1, 15, 44, DUST);
      marshalPost(K(0.129), 1, 21);
      for (let i = 0; i < 5; i++) bush(K(0.114 + i * 0.006), 1, 24 + hash(i * 7) * 9, SCRUB);

      // 6. FIRST OPEN OUTFIELD (0.185 / -1 / 140) — flat cultivated strips in
      //    slightly different tans, a sparse rank of trees along a field
      //    boundary, two corrugated sheds. Nothing above single storey.
      for (let i = 0; i < 6; i++)
        runoffApron(K(0.156 + i * 0.016), -1, 95 + i * 22, 80, i % 2 ? FIELD_A : FIELD_B);
      for (let i = 0; i < 9; i++) {
        const h = hash(i * 13);
        tree(K(0.150 + i * 0.010), -1, 122 + h * 22, 6 + h * 4, DRYFOL);
      }
      building(K(0.178), -1, 150, 22, 4.5, 30);
      building(K(0.202), -1, 168, 18, 4.0, 26);

      // 7. INFIELD THROUGH TURN 2-3 (0.235 / +1 / 26) — marshal post, sponsor
      //    hoarding on the apex side, dry patchy grass between kerb and rail.
      marshalPost(K(0.235), 1, 26);
      sponsorHoarding(0.218, 0.258, 1, 15);
      runoffApron(K(0.240), 1, 14, 32, DRYGRASS);

      // 8. OUTSIDE OF THE TURN 4-5 PAIR (0.300 / -1 / 30) — a modest stand of
      //    open scaffold seating with no canopy, tyre wall in front of it and a
      //    wide run-off apron between that and the track edge.
      runoffApron(K(0.296), -1, 7, 48, PALE);
      runoffApron(K(0.308), -1, 7, 48, PALE);
      tyreWall(0.284, 0.320, -1, 24, TYRECAP);
      scaffoldStand(0.288, 0.316, -1, 30);

      // 9. INFIELD AT TURN 6-7 (0.372 / +1 / 38) — marshal post, billboard, and
      //    the first hint of the constructed elevation: a shallow chain of
      //    graded earth reading as an earthwork bank, not a hill.
      marshalPost(K(0.372), 1, 18);
      billboard(K(0.381), 1, 40, 14, 5.0, BOARD);
      for (let i = 0; i < 4; i++) bank(0.356 + i * 0.011, 1, 48, 70, 20, 3.2 + i * 0.4, EARTH);

      // 10. THE RUN DOWN TO THE DOUBLE APEX (0.430 / -1 / 55) — the ground
      //     falls away, so a ridge shoulder on the outside holds the drop:
      //     straight-edged along the top, bush and dry grass down its face.
      for (let i = 0; i < 5; i++) bank(0.400 + i * 0.016, -1, 58, 100, 26, 6.0 + i * 0.5, EARTH);
      runoffApron(K(0.424), -1, 28, 60, DRYGRASS);
      runoffApron(K(0.444), -1, 28, 60, DRYGRASS);
      for (let i = 0; i < 8; i++)
        bush(K(0.402 + i * 0.008), -1, 32 + hash(i * 17) * 15, SCRUB);

      // 11. SPECTATOR EARTH BANK (0.495 / -1 / 40) — a long banked earth
      //     terrace of standing spectators at the bottom of the drop, looking
      //     down into the increasing-radius right. The second landmark of the
      //     lap after the main grandstand.
      spectatorHill(0.462, 0.534, -1, 40);

      // 12. INSIDE THE DOUBLE APEX (0.515 / +1 / 24) — tyre wall tight to the
      //     barrier, marshal post, low sponsor hoarding along the inside kerb.
      tyreWall(0.496, 0.536, 1, 13, TYRECAP);
      marshalPost(K(0.515), 1, 24);
      sponsorHoarding(0.498, 0.534, 1, 10);

      // 13. TURN 12, CLIMBING OUT OF THE BOWL (0.565 / +1 / 28) — camera tower
      //     on the infield covering the whole complex, tree pair behind it.
      cameraTower(K(0.565), 1, 28);
      tree(K(0.572), 1, 36, 9, DRYFOL);
      tree(K(0.579), 1, 33, 8, DRYFOL);

      // 14. THE HAZE (0.720 / -1 / 900) — the horizon of every photograph of
      //     this place: a low ridge line and a handful of flat silhouettes
      //     dissolved into dust, no detail and very little contrast. Two ridge
      //     chains at different depths give the horizon a soft second layer.
      for (let i = 0; i < 5; i++) bank(0.648 + i * 0.036, -1, 980, 560, 110, 22, HAZE_R);
      for (let i = 0; i < 4; i++) bank(0.660 + i * 0.048, -1, 1280, 600, 120, 15, HAZE_B);
      for (let i = 0; i < 8; i++) {
        const h = hash(i * 29);
        place(K(0.648 + i * 0.021), -1, 830 + h * 250,
          [38 + h * 52, 8 + h * 13, 26 + h * 34], i % 2 ? HAZE_A : HAZE_B);
      }

      // 15. EAST STAND CLUSTER (0.790 / -1 / 34) — heavy braking at the end of
      //     the long back straight and the best overtaking view on the lap:
      //     two stand blocks side by side with a gap between them, tyre wall,
      //     and the widest run-off apron on the circuit.
      runoffApron(K(0.782), -1, 8, 84, PALE);
      runoffApron(K(0.798), -1, 8, 84, PALE);
      runoffApron(K(0.812), -1, 8, 84, PALE);
      tyreWall(0.766, 0.818, -1, 28, TYRECAP);
      grandstandEx(0.776, -1, 34, 92, null, null);
      grandstandEx(0.806, -1, 34, 92, null, null);

      // 16. FINAL CORNER ONTO THE MAIN STRAIGHT (0.870 / +1 / 26) — marshal
      //     post, infield billboard, and the pit-entry building end wall
      //     coming into view beyond it. The post and board sit at 0.882/0.888
      //     rather than the briefed 0.870: the infield is pinched there and
      //     both props are guard-dropped at every distance from 18 m to 40 m.
      marshalPost(K(0.882), 1, 22);
      billboard(K(0.888), 1, 30, 14, 5.0, BOARD);
      building(K(0.934), 1, 22, 13, 6.0, 38);

      // 17. FARMLAND SCATTER — flat farmland and scrub, outfield only and
      //     deliberately thin: dry bushes with the occasional stunted tree,
      //     plus a few low industrial sheds far out. NOT a rank of trees; the
      //     outfield has to stay low and open all the way round.
      every(52, (k) => {
        const h = hash(k * 37);
        if (h < 0.45) return;
        const dist = 36 + h * 42;
        const a = anchor(k, -1, dist);
        if (onTrack(a.c[0], a.c[2], 14)) return;
        if (h > 0.88) tree(k, -1, dist, 6 + h * 3, DRYFOL);
        else bush(k, -1, dist, h > 0.68 ? SCRUB : SCRUB_D);
      });
      for (const s of [0.28, 0.47, 0.62, 0.68, 0.84]) {
        const k = K(s);
        building(k, -1, 155 + hash(k) * 90, 20, 4.5, 28);
      }
  };
