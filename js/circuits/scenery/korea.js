/* Apex 26 — KOREA scenery (data only), split out of js/circuits/korea.js.
   LAZY_SCENERY (tools/manifest.cjs): no <script> tag. game.js fetches the ONE
   circuit a session builds.

   Brief: docs/tracks/korea.md. Reclaimed land beside the Yeongam tidal flats;
   half permanent circuit, half never-finished marina. The identity is EMPTINESS
   — wide grey asphalt run-off, salt-bleached fill, blank unglazed apartment
   shells on the infield, seawall and open water on the outfield. Dead flat: no
   relief is added anywhere. Deliberately NO tree line: bare fill reads correct.

   SIDE CONVENTION IS INVERTED: Korea runs ANTI-CLOCKWISE, so -1 is the INFIELD
   (pits, marina towers) and +1 is the OUTFIELD (seawall, open water).

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
        groundPatch, runoffApron, cityFront, waterBand, gantry,
        place, prop, backdrop } = api;

      const K = (s) => Math.round(s * n) % n;

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
      const PALE      = [0.84, 0.85, 0.85];  // permanent pit fascia
      const STEEL     = [0.72, 0.74, 0.76];  // pale grey stand steel
      const SEAWALL   = [0.58, 0.57, 0.54];  // concrete embankment
      const ESTUARY   = [0.38, 0.44, 0.46];  // flat hazy tidal water

      // Base ground: alternating bleached grass and bare fill, thinned hard so
      // it reads as patchy reclamation rather than a lawn.
      every(64, (k) => {
        const h = hash(k * 17 + 3);
        if (h < 0.42) return;
        const side = h < 0.71 ? -1 : 1;
        groundPatch(k, side, 16 + h * 26, [26 + h * 30, 0.30, 34 + h * 40],
          h < 0.58 ? FILL : SALT);
      });

      // ---------------------------------------------------------------------
      // 2. LAP BARRIER LINE — armco all the way round. Korea's run-off is wide
      //    grey asphalt, so the rail sits well back from the tarmac except in
      //    the walled stadium section, which blocks 14-17 pull in tight.
      // ---------------------------------------------------------------------
      guardrail(0.0, 1.0, -1, 13, RAIL);
      guardrail(0.0, 1.0,  1, 15, RAIL);

      // ---------------------------------------------------------------------
      // 3. s=0.005 / -1 / 12 — PIT AND PADDOCK COMPLEX.
      //    One long low flat-roofed building with a pale fascia, a motorhome
      //    row racked behind it, a camera tower on the start line. The only
      //    finished architecture on the lap: permanent and tidy.
      // ---------------------------------------------------------------------
      building(K(0.005), -1, 12, 20, 9.5, 190);
      building(K(0.055), -1, 12, 16, 7.0, 60);
      for (let i = 0; i < 6; i++) motorhome(K(0.968 + i * 0.011), -1, 40, 9, 4.2, 16);
      cameraTower(K(0.0), -1, 15);
      marshalPost(K(0.012), -1, 16);

      // ---------------------------------------------------------------------
      // 4. s=0.020 / +1 / 22 — MAIN GRANDSTAND facing the pit straight.
      //    Single permanent covered stand, sparsely filled, pale grey steel;
      //    sponsor hoarding along its base and flat estuary water behind the
      //    roofline. shell/crowd are COLOUR ARRAYS — null lets the emitter
      //    pick from def.standSet (a number there ships the mesh empty).
      // ---------------------------------------------------------------------
      grandstandEx(0.020, 1, 22, 180, null, null);
      sponsorHoarding(0.002, 0.050, 1, 18);
      waterBand(0.0, 0.10, 1, 300, 640, 26, ESTUARY);
      place(K(0.020), 1, 70, [40, 6, 14], STEEL);   // low support shed behind

      // ---------------------------------------------------------------------
      // 5. s=0.065 / +1 / 30 — TURN 1 EXIT. A wide grey asphalt apron rather
      //    than gravel, closed by tyres then armco at the far edge, with a
      //    marshal post set into the apron. The scale dwarfs the corner.
      // ---------------------------------------------------------------------
      runoffApron(K(0.062), 1, 8, 78, APRON);
      runoffApron(K(0.075), 1, 8, 62, APRON);
      tyreWall(0.048, 0.086, 1, 36, [0.86, 0.24, 0.20]);
      guardrail(0.046, 0.090, 1, 44, RAIL);
      marshalPost(K(0.066), 1, 22);

      // ---------------------------------------------------------------------
      // 6. s=0.083 / -1 / 15 — TURN 1-2 INFIELD. A marshal post and a lone
      //    billboard on bare fill, a thin scatter of bush clumps on bleached
      //    ground. Nothing else for a hundred metres.
      // ---------------------------------------------------------------------
      marshalPost(K(0.083), -1, 15);
      billboard(K(0.092), -1, 20, 14, 6, [0.86, 0.86, 0.84]);
      groundPatch(K(0.086), -1, 22, [70, 0.30, 90], SALT);
      for (let i = 0; i < 5; i++) {
        const h = hash(i * 53 + 7);
        bush(K(0.070 + i * 0.009), -1, 17 + h * 16, SCRUB);
      }

      // ---------------------------------------------------------------------
      // 7. s=0.190 / +1 / 45 — MID BACK STRAIGHT, the emptiest view on the
      //    lap: bleached ground running flat to a low rail, one distant mast
      //    breaking the skyline, water beyond. No stands, no trees, no crowd.
      //    This block is deliberately almost bare.
      // ---------------------------------------------------------------------
      groundPatch(K(0.175), 1, 45, [130, 0.30, 150], SALT);
      groundPatch(K(0.205), 1, 45, [120, 0.30, 140], FILL);
      tower(K(0.190), 1, 150, 3.2, 58);
      waterBand(0.13, 0.27, 1, 280, 640, 26, ESTUARY);

      // ---------------------------------------------------------------------
      // 8. s=0.300 / +1 / 25 — TURN 3, the heavy braking zone ending the long
      //    full-throttle run: temporary stand on the outside, huge apron,
      //    tyre wall on its far edge, camera tower on the approach.
      // ---------------------------------------------------------------------
      cameraTower(K(0.282), 1, 24);
      runoffApron(K(0.296), 1, 9, 86, APRON);
      runoffApron(K(0.312), 1, 9, 64, APRON);
      grandstandEx(0.300, 1, 25, 96, null, null);
      tyreWall(0.284, 0.322, 1, 42, [0.86, 0.24, 0.20]);
      guardrail(0.282, 0.326, 1, 50, RAIL);

      // ---------------------------------------------------------------------
      // 9. s=0.306 / -1 / 18 — INSIDE THE TURN 3 HAIRPIN. Broadcast compound
      //    of trucks and dishes plus a marshal post, sitting on open fill with
      //    nothing screening it.
      // ---------------------------------------------------------------------
      broadcastCompound(K(0.306), -1, 18);
      marshalPost(K(0.316), -1, 16);
      groundPatch(K(0.306), -1, 26, [60, 0.30, 70], FILL);

      // ---------------------------------------------------------------------
      // 10. s=0.430 / -1 / 20 — TURNS 4-6 INFIELD: scrub, scattered bush, a
      //     marshal post per corner. The unfinished apartment shells first
      //     show as grey slabs on this horizon, still distant.
      // ---------------------------------------------------------------------
      for (const s of [0.395, 0.430, 0.468]) {
        marshalPost(K(s), -1, 18);
        groundPatch(K(s), -1, 24, [66, 0.30, 80], SALT);
      }
      for (let i = 0; i < 8; i++) {
        const h = hash(i * 71 + 19);
        bush(K(0.385 + i * 0.012), -1, 20 + h * 20, SCRUB);
      }
      backdrop(K(0.430), -1, 300, [150, 34, 26], SHELL_D);
      backdrop(K(0.470), -1, 340, [120, 30, 24], SHELL_D);

      // ---------------------------------------------------------------------
      // 11. s=0.549 / +1 / 35 — TURN 7 OUTSIDE: armco hard against a raised
      //     seawall embankment, open water behind it. Hazy, no far shore.
      // ---------------------------------------------------------------------
      guardrail(0.510, 0.600, 1, 33, RAIL);
      // Segmented so the embankment follows the curve instead of cutting it.
      for (let i = 0; i < 8; i++) {
        prop(K(0.513 + i * 0.011), 1, 36, [10, 3.0, 62], SEAWALL);
      }
      waterBand(0.49, 0.63, 1, 70, 460, 24, ESTUARY);

      // ---------------------------------------------------------------------
      // 12. s=0.589 / -1 / 16 — TURN 8 INFIELD: a small uncovered stand with
      //     hoarding across its front, mostly empty seats, no back wall.
      // ---------------------------------------------------------------------
      grandstandEx(0.589, -1, 16, 58, null, null);
      sponsorHoarding(0.576, 0.604, -1, 13);
      marshalPost(K(0.600), -1, 17);

      // ---------------------------------------------------------------------
      // 13. s=0.663 / -1 / 22 — TURN 10: first close view of the marina that
      //     never happened. Blank apartment shells, unglazed, unlit, grey
      //     concrete, with a shuttered podium-level building at street height.
      // ---------------------------------------------------------------------
      cityFront(0.630, 0.700, -1, 22);
      building(K(0.663), -1, 20, 14, 6.5, 70);          // shuttered podium
      place(K(0.645), -1, 46, [22, 34, 20], SHELL);     // blank shell slab
      place(K(0.680), -1, 52, [18, 40, 18], SHELL_D);
      marshalPost(K(0.663), -1, 15);

      // ---------------------------------------------------------------------
      // 14. s=0.723 / +1 / 6 — TURNS 11-12, entry to the walled stadium
      //     section: armco backed by tyres tight to the track edge, marshal
      //     post in a cut-out. Sight lines shut down here.
      // ---------------------------------------------------------------------
      guardrail(0.700, 0.752, 1, 6, RAIL);
      tyreWall(0.700, 0.752, 1, 8.5, [0.20, 0.22, 0.26]);
      marshalPost(K(0.723), 1, 10);

      // ---------------------------------------------------------------------
      // 15. s=0.760 / -1 / 8 — TURN 14: tower blocks rise directly behind the
      //     barrier — blank frontage plus one tower carrying scaffold banding,
      //     close enough to read the empty window openings.
      // ---------------------------------------------------------------------
      guardrail(0.735, 0.800, -1, 8, RAIL);
      cityFront(0.736, 0.798, -1, 14);
      tower(K(0.760), -1, 26, 13, 44);
      place(K(0.748), -1, 30, [16, 28, 16], SHELL);
      place(K(0.782), -1, 34, [14, 33, 15], SHELL_D);

      // ---------------------------------------------------------------------
      // 16. s=0.797 / +1 / 10 — TURN 15: tyres across the wall face with
      //     hoarding running its full length; water glimpsed over the top of
      //     the barrier line.
      // ---------------------------------------------------------------------
      tyreWall(0.778, 0.818, 1, 11, [0.20, 0.22, 0.26]);
      sponsorHoarding(0.778, 0.818, 1, 12.5);
      guardrail(0.770, 0.826, 1, 9, RAIL);
      waterBand(0.75, 0.85, 1, 90, 420, 24, ESTUARY);

      // ---------------------------------------------------------------------
      // 17. s=0.864 / -1 / 10 — TURN 17, where the wall was moved back for
      //     visibility: armco set back behind a narrow apron strip, with a
      //     marshal post and camera tower in the gap.
      // ---------------------------------------------------------------------
      runoffApron(K(0.864), -1, 7, 34, APRON);
      guardrail(0.846, 0.882, -1, 26, RAIL);
      marshalPost(K(0.858), -1, 14);
      cameraTower(K(0.870), -1, 16);

      // ---------------------------------------------------------------------
      // 18. s=0.885 / +1 / 18 — FINAL TURN: the pedestrian footbridge over the
      //     track, a gantry-form structure carrying the circuit's one piece of
      //     local-architecture styling, with a billboard on its face, then the
      //     run back to the pit straight.
      // ---------------------------------------------------------------------
      gantry(0.885, 8.5, [0.78, 0.79, 0.80]);
      building(K(0.885), 1, 18, 12, 13, 16);            // stair/lift tower end
      building(K(0.885), -1, 16, 11, 12, 14);
      billboard(K(0.890), 1, 20, 16, 6, PALE);

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
