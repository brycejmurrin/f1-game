/* Apex 26 — KOREA scenery (data only), split out of js/circuits/korea.js.
   LAZY_SCENERY (tools/manifest.cjs): no <script> tag. game.js fetches the ONE
   circuit a session builds.

   Brief: docs/tracks/korea.md. Reclaimed land beside the Yeongam tidal flats;
   half permanent circuit, half never-finished marina. The identity is EMPTINESS
   — wide grey asphalt run-off, salt-bleached fill, blank unglazed apartment
   shells on the infield, seawall and open water on the outfield. Dead flat —
   the def carries undulate:false (SRTM measures 0.00 m of relief) — so no
   relief is added anywhere. Deliberately NO tree line: bare fill reads correct.

   SIDE CONVENTION IS INVERTED: Korea runs ANTI-CLOCKWISE, so -1 is the INFIELD
   (pits, marina towers) and +1 is the OUTFIELD (seawall, open water).

   GEOMETRY NOTE (measured with tools/track/verify-track.cjs, not guessed): the
   layout folds back on itself hard enough that two lateral bands are OCCUPIED
   BY THE ROAD ITSELF and refuse every prop at every distance —
     s 0.0625..0.0655 on -1  (Turn 1-2 infield pinch)
     s 0.291 ..0.309  on +1  (Turn 3, the braking-zone apex)
   The Turn 3 band WIDENS with distance — clear to ~0.291/0.309 at 40 m out,
   but only to ~0.286/0.314 once you are 46 m or more from the white line.
   Every swept barrier below is split around those bands rather than run
   through them, which is why the front-half rails come in pairs. Do not
   "simplify" them back into single full-lap spans: that costs 11 culled
   segments on +1 and 3 on -1, and the barrier line ends up with a hole in it
   either way. Re-measure with verify-track after moving any of them.

   Block -> brief §4 row:
     1 palette/base fill    (§2, §6 salt-bleached reclaimed ground)
     2 lap barrier line     (§4 general, §6 wide asphalt run-off)
     3 s=0.005 -1  pit and paddock complex
     4 s=0.020 +1  main grandstand, hoarding, estuary behind
     5 s=0.065 +1  Turn 1 exit run-off apron
     6 s=0.083 -1  Turn 1-2 infield, bare fill
     7 s=0.190 +1  mid back straight — the emptiest view on the lap
     8 s=0.300 +1  Turn 3 braking zone
     9 s=0.306 -1  Turn 3 hairpin infield broadcast compound
    10 s=0.430 -1  Turns 4-6 infield scrub, shells first on the horizon
    11 s=0.549 +1  Turn 7 seawall and open water
    12 s=0.589 -1  Turn 8 small uncovered stand
    13 s=0.663 -1  Turn 10 — the marina that never happened
    14 s=0.723 +1  Turns 11-12 walled stadium entry
    15 s=0.760 -1  Turn 14 tower blocks behind the barrier
    16 s=0.797 +1  Turn 15 wall face
    17 s=0.864 -1  Turn 17 set-back barrier
    18 s=0.885 +1  final turn footbridge
    19 lap-wide marshal posts */
"use strict";
(window.TrackScenery = window.TrackScenery || {})["korea"] =
  function (api) {
      const { n, hash, every, anchor, onTrack,
        bush, guardrail, tyreWall, marshalPost, cameraTower, broadcastCompound,
        grandstandEx, sponsorHoarding, billboard, building, motorhome, tower,
        groundPatch, runoffApron, cityFront, waterBand, gantry, fence,
        place, prop, backdrop } = api;

      const { K } = api;            // the contract's frac -> node index (normalised for negatives)

      // ---------------------------------------------------------------------
      // 1. PALETTE — flat coastal light, low contrast, nothing saturated.
      //    Reclaimed fill and salt-bleached grass; concrete left unfinished.
      // ---------------------------------------------------------------------
      const RAIL      = [0.80, 0.81, 0.83];  // armco
      const APRON     = [0.40, 0.41, 0.42];  // grey asphalt run-off (not gravel)
      const FILL      = [0.52, 0.51, 0.45];  // bare reclaimed fill
      const SALT      = [0.47, 0.49, 0.39];  // salt-bleached sparse grass
      const SCRUB     = [0.37, 0.41, 0.31];  // low scrub clumps
      const SHELL     = [0.61, 0.61, 0.59];  // unfinished grey concrete
      const SHELL_D   = [0.53, 0.53, 0.52];  // shaded shell face
      const SHELL_F   = [0.58, 0.58, 0.58];  // hazed-out far rank of shells
      const PALE      = [0.84, 0.85, 0.85];  // permanent pit fascia
      const STEEL     = [0.72, 0.74, 0.76];  // pale grey stand steel
      const SEAWALL   = [0.58, 0.57, 0.54];  // concrete embankment
      const RIPRAP    = [0.49, 0.48, 0.46];  // armour rock at the waterline
      const ESTUARY   = [0.38, 0.44, 0.46];  // flat hazy tidal water
      const MESH      = [0.63, 0.65, 0.65];  // galvanised fence mesh
      const LOT       = [0.45, 0.45, 0.46];  // paddock / car-park asphalt
      const TYRE_R    = [0.86, 0.24, 0.20];  // open-run-off tyre stack
      const TYRE_K    = [0.20, 0.22, 0.26];  // stadium-section tyre stack

      // Base ground: alternating bleached grass and bare fill, thinned hard so
      // it reads as patchy reclamation rather than a lawn. The mix is biased by
      // lap position — grass survives on the seaward outfield of the front half,
      // while the back half around the marina site is scraped fill.
      every(64, (k) => {
        const h = hash(k * 17 + 3);
        if (h < 0.42) return;
        const f = k / n;
        const side = h < 0.71 ? -1 : 1;
        const bare = f > 0.60 && f < 0.95 ? h < 0.80 : h < 0.58;
        groundPatch(k, side, 16 + h * 26, [26 + h * 30, 0.30, 34 + h * 40],
          bare ? FILL : SALT);
      });

      // ---------------------------------------------------------------------
      // 2. LAP BARRIER LINE — armco all the way round. Korea's run-off is wide
      //    grey asphalt, so the rail sits well back from the tarmac except in
      //    the walled stadium section, which blocks 14-17 pull in tight.
      //    Split around the two road-occupied bands (see the header note).
      // ---------------------------------------------------------------------
      guardrail(0.000, 0.061, -1, 13, RAIL);
      guardrail(0.067, 1.000, -1, 13, RAIL);
      guardrail(0.000, 0.291,  1, 15, RAIL);
      guardrail(0.308, 1.000,  1, 15, RAIL);

      // ---------------------------------------------------------------------
      // 3. s=0.005 / -1 / 12 — PIT AND PADDOCK COMPLEX.
      //    One long low flat-roofed building with a pale fascia, a motorhome
      //    row racked behind it, a camera tower on the start line. The only
      //    finished architecture on the lap: permanent and tidy — and the only
      //    place on the lap with anything BEHIND the front row, so it is built
      //    in four ranks: pit wall, garages, motorhome paddock, freight yard.
      // ---------------------------------------------------------------------
      guardrail(0.000, 0.040, -1, 5.5, RAIL);          // pit wall, start->exit
      guardrail(0.962, 1.000, -1, 5.5, RAIL);
      building(K(0.005), -1, 12, 20, 9.5, 190, { wall: PALE });
      // Pit-exit block, split in two 30 m halves: one 60 m block's flat cap
      // (radius = half its length) reached the road, was culled whole, and
      // left its roof plant hanging 8 m up (float-audit, 2026-09-23).
      building(K(0.0524), -1, 12, 16, 7.0, 30, { wall: PALE });
      building(K(0.0577), -1, 12, 16, 7.0, 30, { wall: PALE });
      groundPatch(K(0.010), -1, 44, [56, 0.30, 230], LOT);   // paddock apron
      for (let i = 0; i < 6; i++) motorhome(K(0.968 + i * 0.011), -1, 40, 9, 4.2, 16);
      building(K(0.020), -1, 68, 18, 6.0, 74, { wall: STEEL });  // team units, 2nd rank
      building(K(0.985), -1, 66, 16, 5.5, 52, { wall: STEEL });
      for (let i = 0; i < 7; i++) {                     // freight containers, 3rd rank
        const h = hash(i * 37 + 11);
        place(K(0.972 + i * 0.010), -1, 84 + h * 10, [12, 2.6 + (h < 0.4 ? 2.6 : 0), 6],
          h < 0.5 ? STEEL : SEAWALL);
      }
      fence(0.955, 1.000, -1, 98, 3.4, MESH);           // paddock perimeter
      fence(0.000, 0.052, -1, 98, 3.4, MESH);
      cameraTower(K(0.0), -1, 15);
      marshalPost(K(0.012), -1, 16);

      // ---------------------------------------------------------------------
      // 4. s=0.020 / +1 / 22 — MAIN GRANDSTAND facing the pit straight.
      //    Single permanent covered stand, sparsely filled, pale grey steel;
      //    sponsor hoarding along its base and flat estuary water behind the
      //    roofline. shell/crowd are COLOUR ARRAYS — null lets the emitter
      //    pick from def.standSet (a number there ships the mesh empty).
      //    Depth behind the roofline: concourse units, boundary fence, then
      //    the flat grey coach park on made ground, then water.
      // ---------------------------------------------------------------------
      grandstandEx(0.020, 1, 22, 180, null, null);
      sponsorHoarding(0.002, 0.050, 1, 18);
      waterBand(0.0, 0.10, 1, 300, 640, 26, ESTUARY);
      place(K(0.020), 1, 70, [40, 6, 14], STEEL);   // low support shed behind
      for (let i = 0; i < 5; i++) {                 // concourse kiosks / WC units
        const h = hash(i * 29 + 5);
        place(K(0.002 + i * 0.012), 1, 82 + h * 8, [7, 3.2, 9], h < 0.5 ? PALE : STEEL);
      }
      fence(0.000, 0.058, 1, 96, 3.0, MESH);        // spectator boundary
      groundPatch(K(0.026), 1, 132, [150, 0.30, 190], LOT);  // coach / car park
      groundPatch(K(0.026), 1, 210, [110, 0.30, 160], FILL); // unmade overflow

      // ---------------------------------------------------------------------
      // 5. s=0.065 / +1 / 30 — TURN 1 EXIT. A wide grey asphalt apron rather
      //    than gravel, closed by tyres then armco at the far edge, with a
      //    marshal post set into the apron. The scale dwarfs the corner: the
      //    debris fence behind the rail is 50 m from the white line.
      // ---------------------------------------------------------------------
      runoffApron(K(0.062), 1, 8, 78, APRON);
      runoffApron(K(0.075), 1, 8, 62, APRON);
      tyreWall(0.048, 0.086, 1, 36, TYRE_R);
      guardrail(0.046, 0.090, 1, 44, RAIL);
      fence(0.044, 0.092, 1, 50, 3.6, MESH);
      marshalPost(K(0.066), 1, 22);

      // ---------------------------------------------------------------------
      // 6. s=0.083 / -1 / 15 — TURN 1-2 INFIELD. A marshal post and a lone
      //    billboard on bare fill, a thin scatter of bush clumps on bleached
      //    ground. Nothing else for a hundred metres.
      // ---------------------------------------------------------------------
      marshalPost(K(0.083), -1, 15);
      billboard(K(0.092), -1, 20, 14, 6, [0.86, 0.86, 0.84]);
      groundPatch(K(0.086), -1, 22, [70, 0.30, 90], SALT);
      groundPatch(K(0.104), -1, 40, [90, 0.30, 110], FILL);
      for (let i = 0; i < 5; i++) {
        const h = hash(i * 53 + 7);
        bush(K(0.070 + i * 0.009), -1, 17 + h * 16, SCRUB);
      }

      // ---------------------------------------------------------------------
      // 7. s=0.190 / +1 / 45 — MID BACK STRAIGHT, the emptiest view on the
      //    lap: bleached ground running flat to a low rail, one distant mast
      //    breaking the skyline, water beyond. No stands, no trees, no crowd.
      //    This block stays almost bare ON PURPOSE. The only thing added is the
      //    site boundary fence 85 m out, which measures the emptiness instead
      //    of filling it.
      // ---------------------------------------------------------------------
      groundPatch(K(0.175), 1, 45, [130, 0.30, 150], SALT);
      groundPatch(K(0.205), 1, 45, [120, 0.30, 140], FILL);
      fence(0.130, 0.270, 1, 85, 2.4, MESH);
      tower(K(0.190), 1, 150, 3.2, 58);
      waterBand(0.13, 0.27, 1, 280, 640, 26, ESTUARY);

      // ---------------------------------------------------------------------
      // 8. s=0.300 / +1 / 25 — TURN 3, the heavy braking zone ending the long
      //    full-throttle run: temporary stand on the outside, huge apron,
      //    tyre wall on its far edge, camera tower on the approach.
      //    The road itself occupies +1 across the apex (see the header note),
      //    so the tyre wall, the rail behind it and the debris fence behind
      //    that are each built as an APPROACH run and an EXIT run that stop
      //    short of the apex, each pulled in a little further than the last —
      //    which is also how the real thing reads, the apex side of the corner
      //    opening out into bare apron with nothing on it at all.
      // ---------------------------------------------------------------------
      cameraTower(K(0.282), 1, 24);
      runoffApron(K(0.296), 1, 9, 86, APRON);
      runoffApron(K(0.312), 1, 9, 64, APRON);
      grandstandEx(0.300, 1, 25, 96, null, null);
      tyreWall(0.262, 0.290, 1, 34, TYRE_R);
      tyreWall(0.310, 0.338, 1, 34, TYRE_R);
      guardrail(0.258, 0.288, 1, 44, RAIL);
      guardrail(0.309, 0.342, 1, 44, RAIL);
      fence(0.256, 0.286, 1, 46, 3.6, MESH);
      fence(0.314, 0.344, 1, 46, 3.6, MESH);
      marshalPost(K(0.292), 1, 28);

      // ---------------------------------------------------------------------
      // 9. s=0.306 / -1 / 18 — INSIDE THE TURN 3 HAIRPIN. Broadcast compound
      //    of trucks and dishes plus a marshal post, sitting on open fill with
      //    nothing screening it — the support paddock behind it is equally
      //    exposed, parked straight onto the reclaimed surface.
      // ---------------------------------------------------------------------
      broadcastCompound(K(0.306), -1, 18);
      marshalPost(K(0.316), -1, 16);
      groundPatch(K(0.306), -1, 26, [60, 0.30, 70], FILL);
      groundPatch(K(0.300), -1, 54, [70, 0.30, 90], LOT);
      for (let i = 0; i < 4; i++) {                  // support trucks, second rank
        const h = hash(i * 41 + 13);
        place(K(0.288 + i * 0.012), -1, 50 + h * 12, [11, 3.4, 5], h < 0.5 ? PALE : STEEL);
      }

      // ---------------------------------------------------------------------
      // 10. s=0.430 / -1 / 20 — TURNS 4-6 INFIELD: scrub, scattered bush, a
      //     marshal post per corner. The unfinished apartment shells first
      //     show as grey slabs on this horizon, still distant — four ranks of
      //     backdrop now, hazed and staggered, so it reads as a skyline that
      //     is still 2 km away rather than one flat card.
      //     (0.430 itself refuses a backdrop at every distance — road band.)
      // ---------------------------------------------------------------------
      for (const s of [0.395, 0.430, 0.468]) {
        marshalPost(K(s), -1, 18);
        groundPatch(K(s), -1, 24, [66, 0.30, 80], SALT);
      }
      for (let i = 0; i < 8; i++) {
        const h = hash(i * 71 + 19);
        bush(K(0.386 + i * 0.0115), -1, 20 + h * 20, SCRUB);
      }
      backdrop(K(0.405), -1, 300, [120, 30, 24], SHELL_D);
      backdrop(K(0.440), -1, 300, [150, 34, 26], SHELL_D);
      backdrop(K(0.470), -1, 340, [120, 30, 24], SHELL_D);
      backdrop(K(0.452), -1, 430, [180, 26, 24], SHELL_F);

      // ---------------------------------------------------------------------
      // 11. s=0.549 / +1 / 35 — TURN 7 OUTSIDE: armco hard against a raised
      //     seawall embankment, open water behind it. Hazy, no far shore.
      //     Two ranks: the concrete crest with its handrail, then the rock
      //     armour stepping down to the waterline.
      // ---------------------------------------------------------------------
      guardrail(0.510, 0.600, 1, 33, RAIL);
      // Segmented so the embankment follows the curve instead of cutting it.
      for (let i = 0; i < 8; i++) {
        prop(K(0.513 + i * 0.011), 1, 36, [10, 3.0, 62], SEAWALL);
      }
      fence(0.512, 0.598, 1, 41, 1.4, MESH);            // crest handrail
      for (let i = 0; i < 8; i++) {                     // rock armour below it
        const h = hash(i * 23 + 31);
        prop(K(0.514 + i * 0.011), 1, 50 + h * 4, [9, 1.5, 60], RIPRAP);
      }
      tower(K(0.560), 1, 190, 1.8, 16);                 // channel beacon offshore
      waterBand(0.49, 0.63, 1, 70, 460, 24, ESTUARY);

      // ---------------------------------------------------------------------
      // 12. s=0.589 / -1 / 16 — TURN 8 INFIELD: a small uncovered stand with
      //     hoarding across its front, mostly empty seats, no back wall — so
      //     the scaffold legs and the access track behind it are in full view.
      // ---------------------------------------------------------------------
      grandstandEx(0.589, -1, 16, 58, null, null);
      sponsorHoarding(0.576, 0.604, -1, 13);
      marshalPost(K(0.600), -1, 17);
      groundPatch(K(0.589), -1, 40, [70, 0.30, 90], LOT);
      place(K(0.578), -1, 38, [6, 3.0, 8], STEEL);      // stand plant / cabins
      place(K(0.600), -1, 38, [6, 2.6, 7], PALE);
      fence(0.570, 0.612, -1, 48, 2.6, MESH);

      // ---------------------------------------------------------------------
      // 13. s=0.663 / -1 / 22 — TURN 10: first close view of the marina that
      //     never happened. Blank apartment shells, unglazed, unlit, grey
      //     concrete, with a shuttered podium-level building at street height.
      //     THE landmark of the circuit, so it gets real depth: podium at the
      //     kerb, the front rank of slabs, a second rank stepped back and
      //     taller, two bare lift cores left standing above them, and the far
      //     edge of the development hazed out behind.
      // ---------------------------------------------------------------------
      cityFront(0.630, 0.700, -1, 22);
      building(K(0.663), -1, 20, 14, 6.5, 70, { wall: SHELL });   // shuttered podium
      building(K(0.690), -1, 20, 12, 5.5, 44, { wall: SHELL_D }); // second podium unit
      place(K(0.645), -1, 46, [22, 34, 20], SHELL);     // blank shell slab
      place(K(0.680), -1, 52, [18, 40, 18], SHELL_D);
      for (let i = 0; i < 5; i++) {                     // second rank, stepped back
        const h = hash(i * 61 + 23);
        place(K(0.628 + i * 0.019), -1, 78 + h * 34,
          [16 + h * 8, 30 + h * 18, 16 + h * 6], h < 0.5 ? SHELL_D : SHELL_F);
      }
      tower(K(0.657), -1, 96, 5.0, 52);                 // bare lift core
      tower(K(0.686), -1, 112, 4.4, 46);
      backdrop(K(0.665), -1, 260, [220, 38, 28], SHELL_F);
      groundPatch(K(0.663), -1, 64, [110, 0.30, 150], FILL);  // undeveloped plot
      marshalPost(K(0.663), -1, 15);

      // ---------------------------------------------------------------------
      // 14. s=0.723 / +1 / 6 — TURNS 11-12, entry to the walled stadium
      //     section: armco backed by tyres tight to the track edge, marshal
      //     post in a cut-out. Sight lines shut down here — the debris fence
      //     right behind the wall is what you actually see.
      // ---------------------------------------------------------------------
      guardrail(0.700, 0.752, 1, 6, RAIL);
      tyreWall(0.700, 0.752, 1, 8.5, TYRE_K);
      fence(0.698, 0.754, 1, 11, 4.0, MESH);
      marshalPost(K(0.723), 1, 10);

      // ---------------------------------------------------------------------
      // 15. s=0.760 / -1 / 8 — TURN 14: tower blocks rise directly behind the
      //     barrier — blank frontage plus one tower carrying scaffold banding,
      //     close enough to read the empty window openings. A second rank
      //     stands behind them so the wall of shells has thickness.
      // ---------------------------------------------------------------------
      guardrail(0.735, 0.800, -1, 8, RAIL);
      cityFront(0.736, 0.798, -1, 14);
      tower(K(0.760), -1, 26, 13, 44);
      place(K(0.748), -1, 30, [16, 28, 16], SHELL);
      place(K(0.782), -1, 34, [14, 33, 15], SHELL_D);
      for (let i = 0; i < 4; i++) {                     // second rank behind
        const h = hash(i * 67 + 29);
        place(K(0.740 + i * 0.017), -1, 56 + h * 26,
          [15 + h * 7, 26 + h * 16, 15], h < 0.5 ? SHELL_D : SHELL_F);
      }
      tower(K(0.772), -1, 70, 4.0, 40);                 // second bare core
      backdrop(K(0.768), -1, 250, [200, 34, 26], SHELL_F);

      // ---------------------------------------------------------------------
      // 16. s=0.797 / +1 / 10 — TURN 15: tyres across the wall face with
      //     hoarding running its full length; water glimpsed over the top of
      //     the barrier line.
      // ---------------------------------------------------------------------
      tyreWall(0.778, 0.818, 1, 11, TYRE_K);
      sponsorHoarding(0.778, 0.818, 1, 12.5);
      guardrail(0.770, 0.826, 1, 9, RAIL);
      fence(0.768, 0.828, 1, 14, 4.0, MESH);
      waterBand(0.75, 0.85, 1, 90, 420, 24, ESTUARY);

      // ---------------------------------------------------------------------
      // 17. s=0.864 / -1 / 10 — TURN 17, where the wall was moved back for
      //     visibility: armco set back behind a narrow apron strip, with a
      //     marshal post and camera tower in the gap.
      // ---------------------------------------------------------------------
      runoffApron(K(0.858), -1, 7, 30, APRON);
      runoffApron(K(0.870), -1, 7, 34, APRON);
      guardrail(0.846, 0.882, -1, 26, RAIL);
      fence(0.844, 0.884, -1, 31, 3.4, MESH);
      marshalPost(K(0.858), -1, 14);
      cameraTower(K(0.870), -1, 16);

      // ---------------------------------------------------------------------
      // 18. s=0.885 / +1 / 18 — FINAL TURN: the pedestrian footbridge over the
      //     track, a gantry-form structure carrying the circuit's one piece of
      //     local-architecture styling, with a billboard on its face, then the
      //     run back to the pit straight.
      // ---------------------------------------------------------------------
      gantry(0.885, 8.5, [0.78, 0.79, 0.80]);
      building(K(0.885), 1, 18, 12, 13, 16, { wall: PALE });   // stair/lift tower
      building(K(0.885), -1, 16, 11, 12, 14, { wall: PALE });
      billboard(K(0.890), 1, 20, 16, 6, PALE);
      groundPatch(K(0.900), 1, 38, [60, 0.30, 80], LOT);       // bridge forecourt

      // ---------------------------------------------------------------------
      // 19. LAP-WIDE MARSHAL POSTS — filling the gaps the brief rows leave, on
      //     the outfield side so they clear the wide asphalt run-off.
      // ---------------------------------------------------------------------
      for (const s of [0.135, 0.225, 0.360, 0.500, 0.640, 0.940]) {
        const k = K(s);
        const a = anchor(k, 1, 17);
        if (onTrack(a.c[0], a.c[2], 6)) continue;
        marshalPost(k, 1, 17);
      }
  };
