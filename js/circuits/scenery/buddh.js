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
     0  lap spine (barrier chain + marshal chain; carries the `guardrail`
        asked for by rows 0.235, 0.565 and 0.870 as one run each side)
     1  s0.005 +1   pit lane and pit block
     2  s0.022 -1   main grandstand (+ the dusty car park behind it)
     3  s0.060 +1   paddock behind the pits
     4  s0.108 -1   braking zone into Turn 1
     5  s0.125 +1   dusty inside of Turn 1
     6  s0.185 -1   first open outfield (cultivated field, worked in depth)
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
    17  farmland scatter (thin scrub, the occasional stunted tree)
    18  RURAL DEPTH — the 200-750 m band every front row sits in front of:
        brick kilns, a transmission-pylon line, bunded and burnt-off fields,
        field-boundary tree ranks and a village cluster

   Three API substitutions, all forced and all verified with verify-track:
   `groundPatch`, `motorhome` and `backdrop` emit INVALID geometry on this def
   under every argument shape tried (1, 8 and 1 invalid items respectively, and
   zero verts, so they ship nothing). Flat coloured ground is therefore drawn
   with `runoffApron`, which is the same flat ground quad and takes a colour,
   and coaches, kilns and village boxes are `place` boxes. Long earthworks are
   CHAINS of short `ridge` slabs: a single slab big enough to span one of these
   features trips the overlap guard and is dropped whole.

   Note on `place` guard drops: verify-track reports `place=8` with this
   callback EMPTIED, so those eight come from the def / theme layer, not from
   here. Nothing in this file can clear them. The scenery callback's own guard
   drops are zero, and the way they are held there is `clear()` — every prop in
   a depth band is pre-checked against the road instead of being offered to the
   overlap guard and silently eaten. */
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

      // Far-outfield props are anchored by arc position, so on a lap that
      // doubles back the anchor can land on another stretch of road and the
      // overlap guard silently eats the prop. Everything in the depth bands
      // below is pre-checked instead, which is what keeps guard drops from
      // this file at zero.
      const clear = (k, dist, r) => {
        const a = anchor(k, -1, dist);
        return !onTrack(a.c[0], a.c[2], r || 30);
      };
      // A raised field boundary: the low straight earth wall that divides
      // every plot on this plain. Short slabs, because a long one trips the
      // overlap guard and is dropped whole.
      const bund = (s2, dist, len) => {
        const k = K(s2);
        if (!clear(k, dist, 34)) return;
        bank(s2, -1, dist, len, 3.1, 1.2, BUND);
      };

      // Hot, hazy, dust-shifted: dry grass, reddish earth, pale tarmac.
      const ARMCO     = [0.78, 0.78, 0.80];
      const PITWALL   = [0.86, 0.86, 0.84];
      const GLASS     = [0.34, 0.44, 0.50];
      const FASCIA    = [0.87, 0.87, 0.85];
      const COACH     = [0.88, 0.88, 0.86];
      const PALE      = [0.58, 0.575, 0.575];   // tarmac run-off
      const CONCRETE  = [0.64, 0.63, 0.60];
      const TYRECAP   = [0.84, 0.80, 0.30];
      const BOARD     = [0.80, 0.24, 0.20];
      const DUST      = [0.48, 0.32, 0.21];     // scuffed reddish earth
      const DIRTRD    = [0.54, 0.42, 0.30];     // unmade farm track
      const EARTH     = [0.44, 0.33, 0.23];     // graded earthwork
      const DRYGRASS  = [0.50, 0.48, 0.30];
      const FIELD_A   = [0.56, 0.50, 0.31];
      const FIELD_B   = [0.49, 0.45, 0.29];
      const STUBBLE   = [0.61, 0.55, 0.35];     // cut, not yet fired
      const CROP      = [0.41, 0.45, 0.26];     // the few irrigated strips
      const BUND      = [0.47, 0.38, 0.27];     // raised field boundary
      const BURNT     = [0.33, 0.29, 0.22];     // stubble burnt off after harvest
      const DRYFOL    = [0.30, 0.36, 0.20];
      const SCRUB     = [0.34, 0.38, 0.22];
      const SCRUB_D   = [0.29, 0.32, 0.19];
      // Uttar Pradesh brickfields: kiln bodies, chimneys, stacked green brick.
      const KILN      = [0.45, 0.26, 0.19];
      const BRICK     = [0.52, 0.31, 0.23];
      const PYLON     = [0.56, 0.56, 0.55];
      const MUD       = [0.60, 0.52, 0.40];
      const MUD_D     = [0.52, 0.45, 0.34];
      const LIME      = [0.74, 0.72, 0.66];
      const CARS      = [[0.72, 0.72, 0.70], [0.46, 0.46, 0.48], [0.70, 0.66, 0.56]];
      // Haze: low contrast, warm grey, barely separated from the sky.
      const HAZE_R    = [0.63, 0.60, 0.55];
      const HAZE_A    = [0.68, 0.65, 0.60];
      const HAZE_B    = [0.71, 0.68, 0.64];
      const MID_A     = [0.58, 0.54, 0.46];     // the graded step into the haze
      const MID_B     = [0.62, 0.58, 0.51];

      // A Uttar Pradesh brick kiln: hard dust apron, a long low firing body,
      // the tapered chimney that is the only vertical on this plain, and two
      // stacks of green brick drying beside it. Six boxes, ~170 verts, and the
      // single most recognisable object in the landscape around Greater Noida.
      const kiln = (s, dist, h) => {
        const k = K(s);
        if (!clear(k, dist, 56)) return;
        runoffApron(k, -1, dist, 74, DUST);
        place(k, -1, dist, [15, 4.6, 46], KILN);
        place(K(s + 0.004), -1, dist + 2, [7.5, 5.0, 7.5], KILN);
        place(K(s + 0.004), -1, dist + 2, [3.3, h, 3.3], KILN);
        place(K(s - 0.006), -1, dist - 13, [6.5, 2.4, 11], BRICK);
        place(K(s + 0.010), -1, dist - 10, [5.5, 2.0, 9], BRICK);
      };
      // Transmission pylon: a wide footing and a thin mast. Two boxes read as
      // a tapered lattice at 300 m and cost 48 verts; a line of them is the
      // rhythm every photograph of this plain has behind the track.
      const pylon = (s, dist, h) => {
        const k = K(s);
        if (!clear(k, dist, 26)) return;
        place(k, -1, dist, [6.0, 5.5, 6.0], PYLON);
        place(k, -1, dist, [2.3, h, 2.3], PYLON);
      };

      // 0. LAP SPINE — a barrier line all the way round each side plus the
      //    marshal chain. Rows 0.235 / 0.565 / 0.870 ask for `guardrail`; it is
      //    this run, not a second rail stacked on top of it.
      //    The infield rail used to be a single 12 m run and lost EIGHT
      //    segments to the guard: the infield pinches at s0.12 and again
      //    through s0.86-0.88, where 12 m of offset puts the rail on the
      //    neighbouring stretch of road. It is now a chain that tucks to 6 m
      //    through both pinches, with a one-segment marshal gate at
      //    s0.869-0.872 where no offset from 2 m to 12 m survives. Guard drops
      //    from this file: zero.
      guardrail(0.0, 0.116, 1, 12, ARMCO);
      guardrail(0.116, 0.134, 1, 6, ARMCO);
      guardrail(0.134, 0.858, 1, 12, ARMCO);
      guardrail(0.858, 0.869, 1, 6, ARMCO);
      guardrail(0.872, 0.884, 1, 6, ARMCO);
      guardrail(0.884, 1.0, 1, 12, ARMCO);
      guardrail(0.0, 1.0, -1, 14, ARMCO);
      for (const s of [0.045, 0.165, 0.275, 0.34, 0.46, 0.63, 0.70, 0.75, 0.83, 0.93])
        marshalPost(K(s), 1, 15);

      // 1. PIT LANE AND PIT BLOCK (0.005 / +1 / 14) — one long low modern unit,
      //    flat roof, continuous glazed band; pit wall rail down the length of
      //    the lane; marshal post at the exit. Second-tallest thing here, and
      //    it is not tall: kept low and horizontal. The pale plinth in front
      //    of the dark glazing gives the block a second horizontal line, which
      //    is what stops 180 m of wall reading as one slab.
      const kPit = K(0.005);
      building(kPit, 1, 14, 15, 8.0, 180);
      place(kPit, 1, 13.2, [0.9, 2.6, 172], GLASS);
      place(kPit, 1, 12.6, [0.8, 1.1, 176], FASCIA);
      runoffApron(K(0.995), 1, 9, 120, CONCRETE);
      runoffApron(K(0.035), 1, 9, 120, CONCRETE);
      guardrail(0.0, 0.075, 1, 4.5, PITWALL);
      guardrail(0.975, 1.0, 1, 4.5, PITWALL);
      marshalPost(K(0.082), 1, 12);

      // 2. MAIN GRANDSTAND (0.022 / -1 / 24) — the only substantial structure
      //    on the circuit: pale canopy, camera tower off its northern end, and
      //    a sponsor band along the base of the seating.
      grandstandEx(0.022, -1, 24, 150, null, null);
      sponsorHoarding(0.004, 0.042, -1, 21);
      cameraTower(K(0.050), -1, 27);
      //    ...and the depth BEHIND it, which is the giveaway that this stand
      //    stands in a field: a graded dust concourse, then unsurfaced parking
      //    scraped straight onto the farmland, then the fields resume.
      runoffApron(K(0.012), -1, 62, 96, CONCRETE);
      runoffApron(K(0.034), -1, 62, 96, CONCRETE);
      for (let i = 0; i < 3; i++)
        runoffApron(K(0.006 + i * 0.018), -1, 104 + i * 26, 86, DUST);
      for (let i = 0; i < 22; i++) {
        const h = hash(i * 23);
        place(K(0.000 + i * 0.0026), -1, 96 + (i % 4) * 13 + h * 4,
          [1.9, 1.5, 4.4], CARS[i % 3]);
      }

      // 3. PADDOCK BEHIND THE PITS (0.060 / +1 / 45) — a rank of motorhome
      //    coaches, two hospitality units, the broadcast compound at the far
      //    end, hard flat concrete apron under all of it and no grass.
      for (let i = 0; i < 4; i++) runoffApron(K(0.036 + i * 0.020), 1, 30, 64, CONCRETE);
      for (let i = 0; i < 6; i++) place(K(0.036 + i * 0.0085), 1, 45, [3.2, 3.8, 12], COACH);
      for (let i = 0; i < 4; i++) place(K(0.040 + i * 0.0085), 1, 58, [3.0, 3.6, 11], COACH);
      building(K(0.072), 1, 66, 18, 6.5, 34);
      building(K(0.088), 1, 66, 17, 6.0, 30);
      broadcastCompound(K(0.102), 1, 48);
      //    Paddock service yard: generators, freight and the fuel bowser rank
      //    tucked behind the coaches. Low, white, and in straight lines.
      for (let i = 0; i < 5; i++)
        place(K(0.046 + i * 0.009), 1, 72, [2.6, 2.9, 7.5], COACH);

      // 4. BRAKING ZONE INTO TURN 1 (0.108 / -1 / 32) — the run-off IS the
      //    visual event: far wider than it needs to be, with the tyre wall set
      //    well back on the barrier line and two billboards beyond it. A third
      //    apron strip pushes the pale tarmac out past the tyre wall line,
      //    which is what the reference photographs actually show.
      runoffApron(K(0.100), -1, 8, 72, PALE);
      runoffApron(K(0.116), -1, 8, 72, PALE);
      runoffApron(K(0.108), -1, 22, 72, PALE);
      tyreWall(0.094, 0.136, -1, 30, TYRECAP);
      billboard(K(0.103), -1, 40, 13, 4.8, BOARD);
      billboard(K(0.119), -1, 40, 13, 4.8, BOARD);

      // 5. INSIDE OF TURN 1, DUSTY (0.125 / +1 / 20) — the dirtiest part of the
      //    circuit in every reference photograph: grass worn off to reddish
      //    earth, a marshal post, low bush clumps, and the unmade service track
      //    that cuts across the infield and keeps the dust moving.
      runoffApron(K(0.125), 1, 15, 44, DUST);
      runoffApron(K(0.140), 1, 19, 38, DUST);
      runoffApron(K(0.133), 1, 34, 56, DIRTRD);
      marshalPost(K(0.129), 1, 21);
      for (let i = 0; i < 5; i++) bush(K(0.114 + i * 0.006), 1, 24 + hash(i * 7) * 9, SCRUB);

      // 6. FIRST OPEN OUTFIELD (0.185 / -1 / 140) — flat cultivated strips in
      //    slightly different tans, a sparse rank of trees along a field
      //    boundary, two corrugated sheds. Nothing above single storey.
      //    Depth pass: the strips now run from 95 m out to 300 m in four tonal
      //    families (worked, stubble, fallow, one irrigated green), separated
      //    by raised BUNDS — the low straight earth walls that divide every
      //    field on this plain and are what makes farmland read as farmland
      //    rather than as open ground.
      for (let i = 0; i < 6; i++)
        runoffApron(K(0.156 + i * 0.016), -1, 95 + i * 22, 80, i % 2 ? FIELD_A : FIELD_B);
      for (let i = 0; i < 5; i++)
        runoffApron(K(0.150 + i * 0.019), -1, 232 + i * 17, 86,
          i === 2 ? CROP : (i % 2 ? STUBBLE : FIELD_A));
      for (let i = 0; i < 6; i++) bund(0.149 + i * 0.016, 118 + i * 29, 48);
      for (let i = 0; i < 9; i++) {
        const h = hash(i * 13);
        tree(K(0.150 + i * 0.010), -1, 122 + h * 22, 6 + h * 4, DRYFOL);
      }
      building(K(0.178), -1, 150, 22, 4.5, 30);
      building(K(0.202), -1, 168, 18, 4.0, 26);
      //    A mud-walled farmstead behind the sheds: three flat-roofed blocks
      //    around a swept yard, whitewash on one of them.
      runoffApron(K(0.192), -1, 206, 44, DUST);
      place(K(0.188), -1, 202, [9, 3.4, 13], MUD);
      place(K(0.196), -1, 210, [7, 3.0, 10], LIME);
      place(K(0.199), -1, 198, [6, 2.6, 8], MUD_D);

      // 7. INFIELD THROUGH TURN 2-3 (0.235 / +1 / 26) — marshal post, sponsor
      //    hoarding on the apex side, dry patchy grass between kerb and rail.
      marshalPost(K(0.235), 1, 26);
      sponsorHoarding(0.218, 0.258, 1, 15);
      runoffApron(K(0.240), 1, 14, 32, DRYGRASS);
      runoffApron(K(0.226), 1, 16, 30, DUST);

      // 8. OUTSIDE OF THE TURN 4-5 PAIR (0.300 / -1 / 30) — a modest stand of
      //    open scaffold seating with no canopy, tyre wall in front of it and a
      //    wide run-off apron between that and the track edge. Behind it there
      //    is nothing but a dust walkway and the fields: no back structure at
      //    all, which is exactly how this stand reads in photographs.
      runoffApron(K(0.296), -1, 7, 48, PALE);
      runoffApron(K(0.308), -1, 7, 48, PALE);
      tyreWall(0.284, 0.320, -1, 24, TYRECAP);
      scaffoldStand(0.288, 0.316, -1, 30);
      runoffApron(K(0.302), -1, 46, 60, DUST);
      for (let i = 0; i < 4; i++)
        runoffApron(K(0.286 + i * 0.016), -1, 78 + i * 24, 70, i % 2 ? FIELD_B : STUBBLE);

      // 9. INFIELD AT TURN 6-7 (0.372 / +1 / 38) — marshal post, billboard, and
      //    the first hint of the constructed elevation: a shallow chain of
      //    graded earth reading as an earthwork bank, not a hill. Scrub on the
      //    face keeps it from looking like a clean CAD berm.
      marshalPost(K(0.372), 1, 18);
      billboard(K(0.381), 1, 40, 14, 5.0, BOARD);
      for (let i = 0; i < 4; i++) bank(0.356 + i * 0.011, 1, 48, 70, 20, 3.2 + i * 0.4, EARTH);
      for (let i = 0; i < 5; i++)
        bush(K(0.358 + i * 0.009), 1, 38 + hash(i * 31) * 8, i % 2 ? SCRUB : SCRUB_D);

      // 10. THE RUN DOWN TO THE DOUBLE APEX (0.430 / -1 / 55) — the ground
      //     falls away, so a ridge shoulder on the outside holds the drop:
      //     straight-edged along the top, bush and dry grass down its face.
      for (let i = 0; i < 5; i++) bank(0.400 + i * 0.016, -1, 58, 100, 26, 6.0 + i * 0.5, EARTH);
      runoffApron(K(0.424), -1, 28, 60, DRYGRASS);
      runoffApron(K(0.444), -1, 28, 60, DRYGRASS);
      for (let i = 0; i < 8; i++)
        bush(K(0.402 + i * 0.008), -1, 32 + hash(i * 17) * 15, SCRUB);
      //     Behind the shoulder the plain simply carries on at the old level —
      //     the drop is cut INTO the farmland, so the fields sit on top of it.
      for (let i = 0; i < 4; i++)
        runoffApron(K(0.404 + i * 0.018), -1, 106 + i * 26, 78, i % 2 ? FIELD_A : STUBBLE);

      // 11. SPECTATOR EARTH BANK (0.495 / -1 / 40) — a long banked earth
      //     terrace of standing spectators at the bottom of the drop, looking
      //     down into the increasing-radius right. The second landmark of the
      //     lap after the main grandstand.
      spectatorHill(0.462, 0.534, -1, 40);
      //     ...and the depth behind it. The terrace is an earthwork with a
      //     dust apron and an access track along its back, and then the fields
      //     and a field-boundary tree line, so the bank reads as a thing built
      //     ON farmland rather than as a wall closing the view.
      runoffApron(K(0.480), -1, 74, 84, DUST);
      runoffApron(K(0.512), -1, 74, 84, DUST);
      runoffApron(K(0.496), -1, 96, 90, DIRTRD);
      for (let i = 0; i < 5; i++)
        runoffApron(K(0.466 + i * 0.018), -1, 128 + i * 27, 82, i % 2 ? FIELD_B : FIELD_A);
      for (let i = 0; i < 4; i++) bund(0.470 + i * 0.022, 150 + i * 30, 62);
      for (let i = 0; i < 5; i++) {
        const h = hash(i * 19);
        tree(K(0.470 + i * 0.016), -1, 142 + h * 20, 6 + h * 3.5, DRYFOL);
      }

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
      //     chains at different depths give the horizon a soft second layer,
      //     and a THIRD band at 520-680 m grades the step from the worked
      //     fields out to the haze instead of jumping straight to it.
      for (let i = 0; i < 5; i++) {
        if (!clear(K(0.652 + i * 0.038), 560, 90)) continue;
        bank(0.652 + i * 0.038, -1, 560, 170, 70, 9, MID_A);
      }
      for (let i = 0; i < 7; i++) {
        const h = hash(i * 11), d = 590 + h * 120, k = K(0.640 + i * 0.025);
        if (!clear(k, d, 46)) continue;
        place(k, -1, d, [22 + h * 30, 5 + h * 6, 16 + h * 20], i % 2 ? MID_A : MID_B);
      }
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
      //     Behind the two blocks: the dust concourse the crowd walks in on,
      //     an overflow parking scrape, and two corrugated compound sheds.
      //     Same trick as the main stand — it makes the stands look dropped
      //     onto a field, which is precisely what they are.
      runoffApron(K(0.780), -1, 66, 78, DUST);
      runoffApron(K(0.808), -1, 66, 78, DUST);
      runoffApron(K(0.794), -1, 104, 96, DIRTRD);
      for (let i = 0; i < 14; i++) {
        const h = hash(i * 41);
        place(K(0.766 + i * 0.0038), -1, 124 + (i % 3) * 12 + h * 4,
          [1.9, 1.5, 4.4], CARS[(i + 1) % 3]);
      }
      building(K(0.772), -1, 158, 20, 4.5, 28);
      building(K(0.816), -1, 164, 17, 4.0, 24);

      // 16. FINAL CORNER ONTO THE MAIN STRAIGHT (0.870 / +1 / 26) — marshal
      //     post, infield billboard, and the pit-entry building end wall
      //     coming into view beyond it. The post and board sit at 0.882/0.888
      //     rather than the briefed 0.870: the infield is pinched there and
      //     both props are guard-dropped at every distance from 10 m to 40 m
      //     (re-checked: the same pinch that tucks the rail to 6 m in block 0,
      //     and moving them back to 0.866/0.876 drops both again).
      marshalPost(K(0.882), 1, 22);
      billboard(K(0.888), 1, 30, 14, 5.0, BOARD);
      building(K(0.934), 1, 22, 13, 6.0, 38);

      // 17. FARMLAND SCATTER — flat farmland and scrub, outfield only and
      //     deliberately thin: dry bushes with the occasional stunted tree.
      //     NOT a rank of trees; the outfield has to stay low and open all the
      //     way round. Thinned from every(52)/h<0.45 to pay for block 18: the
      //     five generic far sheds that used to sit here are now the village
      //     and the brickfields, which say the same thing with an accent.
      every(58, (k) => {
        const h = hash(k * 37);
        if (h < 0.52) return;
        const dist = 36 + h * 42;
        const a = anchor(k, -1, dist);
        if (onTrack(a.c[0], a.c[2], 14)) return;
        if (h > 0.90) tree(k, -1, dist, 6 + h * 3, DRYFOL);
        else bush(k, -1, dist, h > 0.70 ? SCRUB : SCRUB_D);
      });

      // 18. RURAL DEPTH (250-750 m) — the band the theme's generic skyline
      //     would otherwise own. Everything here is chosen because it is
      //     specific to the Greater Noida plain and legible as a silhouette:
      //       - BRICK KILNS. The Yamuna-Hindon flats are a brickfield; the
      //         tapered kiln chimney is the only vertical for miles and it is
      //         in the background of every Indian GP photograph.
      //       - A PYLON LINE marching across the fields at a slight angle to
      //         the track, which gives the middle distance a rhythm.
      //       - BUNDED FIELDS carried all the way round, not just opposite
      //         the two briefed outfield rows.
      //       - A VILLAGE: flat-roofed mud and whitewash blocks in a clump,
      //         low enough to sit under the horizon.
      kiln(0.215, 300, 26);
      kiln(0.335, 372, 23);
      kiln(0.560, 340, 25);
      kiln(0.700, 430, 27);
      for (let i = 0; i < 9; i++) pylon(0.245 + i * 0.047, 256 + i * 26, 25 + hash(i * 53) * 5);
      for (let i = 0; i < 6; i++) pylon(0.700 + i * 0.043, 300 - i * 14, 24 + hash(i * 59) * 5);
      for (let i = 0; i < 14; i++) {
        const h = hash(i * 43);
        runoffApron(K(0.24 + i * 0.043), -1, 270 + h * 230, 96,
          h < 0.18 ? CROP : (i % 2 ? FIELD_B : STUBBLE));
      }
      for (let i = 0; i < 12; i++) bund(0.252 + i * 0.051, 296 + hash(i * 61) * 210, 62);
      for (let i = 0; i < 13; i++) {
        const h = hash(i * 47), d = 452 + (i % 4) * 30 + h * 22;
        const k = K(0.598 + i * 0.0075);
        if (!clear(k, d, 22)) continue;
        place(k, -1, d, [6 + h * 5, 2.8 + h * 1.6, 7 + h * 6],
          h > 0.66 ? LIME : (i % 2 ? MUD : MUD_D));
      }
      runoffApron(K(0.634), -1, 500, 120, DUST);
      //     Two more brickfields on the far side of the lap, and the pylon
      //     line closed across the gap between the two runs above.
      kiln(0.120, 356, 24);
      kiln(0.445, 318, 22);
      for (let i = 0; i < 3; i++) pylon(0.640 + i * 0.020, 262 + i * 20, 25 + hash(i * 71) * 4);
      //     Stubble burning. Wheat and paddy stubble is fired across this
      //     whole plain after harvest — it is where the haze on the horizon
      //     physically comes from, so the scorched plots belong in the same
      //     frame as it. Dark, hard-edged, and always next to a cut field.
      for (let i = 0; i < 9; i++) {
        const h = hash(i * 73), d = 250 + h * 260, k = K(0.205 + i * 0.062);
        if (!clear(k, d, 52)) continue;
        runoffApron(k, -1, d, 82, h > 0.55 ? BURNT : STUBBLE);
      }
      //     The 0.30-0.56 arc is all earthwork and spectator bank in front, so
      //     the farmland behind it needs its own strips and boundaries or the
      //     bowl reads as if it were cut out of nothing.
      for (let i = 0; i < 8; i++) {
        const h = hash(i * 79), d = 214 + i * 26 + h * 20, k = K(0.305 + i * 0.030);
        if (!clear(k, d, 52)) continue;
        runoffApron(k, -1, d, 88, h < 0.2 ? CROP : (i % 2 ? FIELD_A : FIELD_B));
      }
      for (let i = 0; i < 7; i++) bund(0.318 + i * 0.033, 232 + i * 28, 58);
      //     Field-boundary trees: a RANK, widely spaced, never a wood. On this
      //     plain the only trees are the ones left standing on a plot line.
      for (let i = 0; i < 11; i++) {
        const h = hash(i * 83), d = 236 + (i % 3) * 58 + h * 26;
        const k = K(0.262 + i * 0.058);
        if (!clear(k, d, 20)) continue;
        tree(k, -1, d, 6.5 + h * 4, DRYFOL);
      }
      for (let i = 0; i < 4; i++) {
        const h = hash(i * 67), d = 452 + h * 26, k = K(0.606 + i * 0.016);
        if (!clear(k, d, 18)) continue;
        tree(k, -1, d, 7 + h * 3, DRYFOL);
      }
  };
