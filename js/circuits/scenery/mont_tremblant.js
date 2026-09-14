/* Apex 26 — MONT-TREMBLANT scenery (data only), split out of js/circuits/mont_tremblant.js.
   LAZY_SCENERY (tools/manifest.cjs): no <script> tag.

   Brief: docs/tracks/mont_tremblant.md. Clockwise lap, +1 is the infield.
   ENCLOSURE IS THE IDENTITY: armco hard against the tarmac and conifer trunks
   3-7 m behind it is the DEFAULT everywhere; the built structures are the
   exceptions and each one is named by a §4 row.

   Block -> brief row:
     1  palette + helpers                      —
     2  continuous armco, both sides           rows 0.090 0.330 0.412 0.456 0.626
     3  default forest wall (the run-off)      rows 0.090 0.255 0.330 0.456 0.503 0.626
     4  bulk forestEdge runs                   rows 0.020 0.330 0.776 0.897
     5  esses cutting / green tunnel           row  0.205
     6  ski mountain + wooded ridge (skyline)  rows 0.150 0.560
     7  paddock: garages, motorhomes, camera   row  0.005
     8  start-line grandstand                  row  0.020
     9  Turn 1 on the crest                    row  0.181
    10  esses exit, gravel spill               row  0.255
    11  T4 apex + spectator bank               row  0.412
    12  T5 outside, hardwood run-off           row  0.456
    13  the Carousel                           row  0.503
    14  back straight / the Hump breathes      row  0.560
    15  T8-T9 climbing 90s                     row  0.626
    16  the Bridge abutments                   row  0.776
    17  Namerow hairpin                        row  0.836
    18  Paddock Bend onto the pit straight     row  0.897
    19  marshal posts around the lap           rows 0.181 0.255 0.330 0.503 0.626 0.836

   Season is NOT baked in: everything wooded is deep summer green and the
   lighting presets carry the autumn this place is famous for. */
"use strict";
(window.TrackScenery = window.TrackScenery || {})["mont_tremblant"] =
  function (api) {
      const { n, hash, every, anchor, onTrack, out,
        pine, tree, bush, forestEdge, building, grandstandEx, spectatorHill,
        guardrail, fence, tyreWall, marshalPost, cameraTower, billboard,
        motorhome, groundPatch, ridge, mountain, terrainYAt, addBox } = api;

      // ---------------------------------------------------------------- 1.
      // PALETTE + HELPERS. Deep summer green; the presets do the season.
      const PINE  = [0.09, 0.21, 0.13];   // spruce/fir, the Laurentian default
      const PINE2 = [0.12, 0.26, 0.15];
      const HARD  = [0.21, 0.38, 0.17];   // northern hardwood in full leaf
      const HARD2 = [0.25, 0.44, 0.20];
      const SCRUB = [0.16, 0.30, 0.14];
      const CANOPY= [0.13, 0.27, 0.15];   // the ceiling over the cutting
      const ARMCO = [0.80, 0.80, 0.82];
      const TYRE  = [0.86, 0.84, 0.30];
      const DIRT  = [0.36, 0.30, 0.21];
      const CONC  = [0.70, 0.68, 0.64];
      const ROOF  = [0.30, 0.33, 0.36];
      const HILL  = [0.15, 0.29, 0.17];
      const WIN   = [0.24, 0.30, 0.34];
      const GLASS = [0.28, 0.34, 0.38];
      const VAN_A = [0.90, 0.90, 0.92];
      const VAN_B = [0.82, 0.84, 0.87];

      const K = (s) => Math.round(s * n) % n;
      const RAIL = 3.2;                   // armco gap: hard against the tarmac
      // Heading of the road at k, for world-space ridges/banks.
      const heading = (k, side, dist) => {
        const a = anchor((k + 4) % n, side, dist);
        const b = anchor((k - 4 + n) % n, side, dist);
        return Math.atan2(a.c[0] - b.c[0], a.c[2] - b.c[2]);
      };
      // Mid-road point at k, lifted by dy — used for the canopy boxes.
      // Mid-road point at k lifted by dy, plus the road basis, so a box can
      // be laid ACROSS the road: addBox's size maps to [right, up, tangent].
      const overRoad = (k, dy) => {
        const a = anchor(k, 1, 0), l = anchor(k, -1, 0).c, r = a.c;
        return { c: [(l[0] + r[0]) / 2, (l[1] + r[1]) / 2 + dy, (l[2] + r[2]) / 2],
                 b: [a.r, a.u, a.t] };
      };
      const within = (k, s0, s1) => { const f = k / n; return f >= s0 && f <= s1; };

      // ---------------------------------------------------------------- 2.
      // ARMCO. Continuous, both sides, the whole lap — there is nothing else
      // between a mistake and the trunks. (rows 0.090 / 0.330 / 0.456)
      for (const side of [-1, 1]) guardrail(0.0, 1.0, side, RAIL, ARMCO);
      // Doubled rail through the fastest, most exposed stretches.
      guardrail(0.300, 0.360, -1, RAIL + 1.6, ARMCO);   // downhill sweep, row 0.330
      guardrail(0.545, 0.600, -1, RAIL + 1.6, ARMCO);   // back straight, row 0.560
      guardrail(0.610, 0.660, 1, RAIL + 1.4, ARMCO);    // climbing 90s, row 0.626

      // ---------------------------------------------------------------- 3.
      // THE FOREST WALL — the default dressing everywhere the table is silent.
      // Ranks start 3-7 m behind the rail and pack back from there: the trees
      // ARE the run-off. Thinned only where a built row needs the room.
      const CLEAR = [            // s windows kept open for structures
        [0.985, 1.000, 1], [0.000, 0.060, 1],   // paddock, row 0.005
        [0.012, 0.034, -1],                     // start-line stand, row 0.020
        [0.885, 0.930, 1],                      // Paddock Bend stand, row 0.897
        [0.400, 0.425, 1],                      // T4 spectator bank, row 0.412
        [0.828, 0.848, -1],                     // Namerow bank, row 0.836
      ];
      const blocked = (k, side) => {
        const f = k / n;
        for (const c of CLEAR) if (side === c[2] && f >= c[0] && f <= c[1]) return true;
        return false;
      };

      every(9, (k) => {
        for (const side of [-1, 1]) {
          if (blocked(k, side)) continue;
          const base = 4.2 + hash(k * 13 + (side + 2) * 91) * 2.8;   // 4-7 m
          const ranks = 4;
          for (let r = 0; r < ranks; r++) {
            const h = hash(k * 29 + r * 137 + (side + 2) * 61);
            if (r > 0 && h < 0.18) continue;            // ragged, not a fence
            const dist = base + r * 6.5 + h * 3.5;
            const a = anchor(k, side, dist);
            if (onTrack(a.c[0], a.c[2], 2.2)) continue;
            if (h < 0.62) pine(k, side, dist, 12 + h * 13, h < 0.31 ? PINE : PINE2);
            else          tree(k, side, dist, 9 + h * 7, h < 0.82 ? HARD : HARD2);
          }
          if (hash(k * 7 + side) > 0.66) {
            const bd = base - 0.8;
            const ab = anchor(k, side, bd);
            if (!onTrack(ab.c[0], ab.c[2], 1.2)) bush(k, side, bd, SCRUB);
          }
        }
      });

      // A second, deeper band so the wall has depth rather than being a single
      // rank of trunks with daylight behind it.
      every(17, (k) => {
        for (const side of [-1, 1]) {
          const h = hash(k * 53 + (side + 2) * 17);
          if (h < 0.25) continue;
          for (let r = 0; r < 2; r++) {
            const dist = 24 + r * 11 + h * 9;
            const a = anchor(k, side, dist);
            if (onTrack(a.c[0], a.c[2], 2)) continue;
            pine(k, side, dist, 14 + h * 12, h < 0.6 ? PINE : PINE2);
          }
        }
      });

      // ---------------------------------------------------------------- 4.
      // BULK FOREST EDGE. Named by the brief where the treeline must read as
      // continuous and unbroken: it closes the moment the start stand ends
      // (row 0.020), runs the whole downhill sweep with nothing built at all
      // (row 0.330), walks up to both Bridge abutments (row 0.776), and holds
      // the outfield to the line past Paddock Bend (row 0.897).
      forestEdge(0.036, 0.088, -1, 4.5, {});
      forestEdge(0.290, 0.398, -1, 4.5, {});
      forestEdge(0.430, 0.500, -1, 4.0, {});
      forestEdge(0.505, 0.552, -1, 5.0, {});
      forestEdge(0.660, 0.770, -1, 4.5, {});
      forestEdge(0.660, 0.770, 1, 5.5, {});
      forestEdge(0.782, 0.828, -1, 4.5, {});
      forestEdge(0.782, 0.828, 1, 5.5, {});
      forestEdge(0.900, 0.985, -1, 4.5, {});

      // ---------------------------------------------------------------- 5.
      // THE CUTTING AND THE ESSES (T2-T3, row 0.205). Earth banks either side,
      // trunks at arm's length, and crowns closing overhead: the tightest
      // enclosure on the lap, and it must read as a tunnel of green.
      const ES0 = 0.196, ES1 = 0.252;
      for (const side of [-1, 1]) {
        // Earth bank shouldering the rail.
        for (let i = 0; i < 7; i++) {
          const s = ES0 + ((i + 0.5) / 7) * (ES1 - ES0);
          const k = K(s);
          const a = anchor(k, side, 26);
          ridge(a.c[0], a.c[2], terrainYAt(a.c[0], a.c[2]) - 1.4,
                heading(k, side, 26), 34, 14, 4.2 + hash(i * 71) * 1.8, DIRT);
        }
      }
      every(7, (k) => {
        if (!within(k, ES0, ES1)) return;
        for (const side of [-1, 1]) {
          const h = hash(k * 41 + (side + 2) * 23);
          const dist = 4.6 + h * 1.6;                 // right on top of the rail
          const a = anchor(k, side, dist);
          if (!onTrack(a.c[0], a.c[2], 1.0)) {
            tree(k, side, dist, 17 + h * 8, h < 0.5 ? HARD : HARD2);
          }
          const d2 = 8 + h * 4;
          const b = anchor(k, side, d2);
          if (!onTrack(b.c[0], b.c[2], 1.2)) pine(k, side, d2, 19 + h * 9, PINE);
        }
      });
      // The ceiling: hardwood crowns leaning in over the cutting.
      for (let i = 0; i < 16; i++) {
        const s = ES0 + ((i + 0.5) / 16) * (ES1 - ES0);
        const k = K(s);
        const h = hash(i * 97);
        const o = overRoad(k, 9.5 + h * 2.5);
        addBox(out, o.c, [23 + h * 7, 1.5 + h * 1.1, 8 + h * 4], CANOPY, o.b);
      }

      // ---------------------------------------------------------------- 6.
      // THE SKI MOUNTAIN (rows 0.150 and 0.560). Skyline, not roadside: world
      // x/z taken far off the infield shoulder so the mass sits over the crest
      // before Turn 1 and shows again above the treeline off the back straight.
      const mk = K(0.150);
      const mfar = anchor(mk, 1, 1450).c;
      mountain(mfar[0], mfar[2], terrainYAt(mfar[0], mfar[2]) - 30, 2300, 690, {});
      const mk2 = K(0.105);
      const mf2 = anchor(mk2, 1, 2100).c;
      mountain(mf2[0], mf2[2], terrainYAt(mf2[0], mf2[2]) - 25, 1500, 430, {});
      // Lower wooded ridge stepped in front of the summit.
      for (let i = 0; i < 5; i++) {
        const k = K(0.115 + i * 0.021);
        const a = anchor(k, 1, 700 + i * 70).c;
        ridge(a[0], a[2], terrainYAt(a[0], a[2]) - 6,
              heading(k, 1, 700), 420, 150, 84 + hash(i * 311) * 40, HILL);
      }
      // And the same mass read from the back straight (row 0.560).
      const bk = K(0.560);
      const bfar = anchor(bk, -1, 1600).c;
      mountain(bfar[0], bfar[2], terrainYAt(bfar[0], bfar[2]) - 25, 1700, 470, {});
      for (let i = 0; i < 3; i++) {
        const k = K(0.540 + i * 0.024);
        const a = anchor(k, -1, 640 + i * 90).c;
        ridge(a[0], a[2], terrainYAt(a[0], a[2]) - 5,
              heading(k, -1, 640), 380, 130, 58 + hash(i * 617) * 26, HILL);
      }

      // ---------------------------------------------------------------- 7.
      // RE-KEYED THROUGH sl(). The start line moved onto a straight (def
      // startFrac) because the grid had been laid through a 104 m corner, and
      // sceneryStartFrac holds the rest of this file on its real corners —
      // Namerow, the Esses and the ski-mountain framing must not travel with
      // the line. The paddock and the start-line stand belong AT the line, so
      // these two blocks alone are shifted.
      const SL = 0.7166;                       // = 1 - def._sceneryShift
      const sl = (f) => (f + SL) % 1;

      // PADDOCK (row 0.005). Club scale: ONE long low garage/timing block, two
      // motorhomes parked behind it, one camera tower by the pit exit. This is
      // the only substantial built structure on the lap.
      building(K(sl(0.005)), 1, 14, 15, 7.5, 118, { wall: CONC, roof: ROOF, floor: 2, window: WIN });
      motorhome(K(sl(0.996)), 1, 30, 12, 5.0, 20, { wall: VAN_A, window: GLASS });
      motorhome(K(sl(0.016)), 1, 30, 12, 5.0, 18, { wall: VAN_B, window: GLASS });
      cameraTower(K(sl(0.042)), 1, 16, {});
      fence(sl(0.975), sl(0.062), 1, 11, 2.4, [0.62, 0.64, 0.66]);
      groundPatch(K(sl(0.005)), 1, 26, [52, 0.35, 96], [0.31, 0.31, 0.33]);

      // ---------------------------------------------------------------- 8.
      // START LINE OUTSIDE (row 0.020). One grandstand bank with armco hard in
      // front of it — one of only two real gaps in the treeline all lap.
      grandstandEx(sl(0.020), -1, 7, 110, null, null);
      guardrail(sl(0.008), sl(0.040), -1, 2.6, ARMCO);
      billboard(K(sl(0.038)), -1, 9, 9, 3, [0.80, 0.16, 0.16]);

      // ---------------------------------------------------------------- 9.
      // TURN 1, apex on the crest (row 0.181). Marshal post and a short tyre
      // wall inside; the billboard stays LOW so the blind downhill exit is not
      // given away from the approach.
      marshalPost(K(0.175), 1, 6);
      tyreWall(0.176, 0.190, 1, 5, TYRE);
      billboard(K(0.170), 1, 8, 6, 1.8, [0.18, 0.34, 0.72]);

      // --------------------------------------------------------------- 10.
      // ESSES EXIT (row 0.255). Dirt and gravel spill on the inside where cars
      // run wide, a marshal post, then mixed ranks straight back to the rail.
      groundPatch(K(0.255), 1, 7, [22, 0.30, 34], DIRT);
      groundPatch(K(0.266), 1, 9, [16, 0.26, 22], [0.42, 0.38, 0.31]);
      marshalPost(K(0.258), 1, 7);
      every(9, (k) => {
        if (!within(k, 0.250, 0.292)) return;
        const h = hash(k * 19);
        const dist = 4.2 + h * 2.4;
        const a = anchor(k, 1, dist);
        if (onTrack(a.c[0], a.c[2], 1.2)) return;
        if (h < 0.55) pine(k, 1, dist, 13 + h * 10, PINE);
        else tree(k, 1, dist, 10 + h * 6, HARD);
      });

      // --------------------------------------------------------------- 11.
      // T4 INSIDE (row 0.412). Armco plus a tyre wall on the apex and a small
      // natural spectator bank further in; forest resumes right behind it.
      guardrail(0.400, 0.428, 1, 2.8, ARMCO);
      tyreWall(0.406, 0.420, 1, 5, TYRE);
      spectatorHill(0.399, 0.424, 1, 16, {});
      marshalPost(K(0.404), 1, 7);
      every(12, (k) => {
        if (!within(k, 0.396, 0.428)) return;
        const h = hash(k * 43);
        const dist = 34 + h * 10;
        const a = anchor(k, 1, dist);
        if (onTrack(a.c[0], a.c[2], 2)) return;
        pine(k, 1, dist, 15 + h * 10, PINE);
      });

      // --------------------------------------------------------------- 12.
      // T5 OUTSIDE (row 0.456). Armco with hardwood ranks 4 m beyond it. No
      // gravel trap, no tarmac apron — the trees are the run-off.
      guardrail(0.444, 0.472, -1, 2.6, ARMCO);
      every(7, (k) => {
        if (!within(k, 0.442, 0.478)) return;
        const h = hash(k * 59);
        for (let r = 0; r < 2; r++) {
          const dist = 4.2 + r * 5.5 + h * 2.0;
          const a = anchor(k, -1, dist);
          if (onTrack(a.c[0], a.c[2], 1.0)) continue;
          tree(k, -1, dist, 13 + h * 8, r ? HARD2 : HARD);
        }
      });

      // --------------------------------------------------------------- 13.
      // THE CAROUSEL (row 0.503). Marshal post and a camera tower inside with
      // a billboard pair; the OUTSIDE is a solid wall of pine following the
      // whole arc.
      marshalPost(K(0.498), 1, 12);
      cameraTower(K(0.508), 1, 13, {});
      billboard(K(0.494), 1, 14, 8, 3, [0.88, 0.72, 0.12]);
      billboard(K(0.514), 1, 14, 8, 3, [0.14, 0.52, 0.28]);
      every(6, (k) => {
        if (!within(k, 0.478, 0.536)) return;
        const h = hash(k * 67);
        for (let r = 0; r < 3; r++) {
          const dist = 4.2 + r * 5.5 + h * 2.4;
          const a = anchor(k, -1, dist);
          if (onTrack(a.c[0], a.c[2], 1.0)) continue;
          pine(k, -1, dist, 16 + h * 11, r % 2 ? PINE2 : PINE);
        }
      });

      // --------------------------------------------------------------- 14.
      // BACK STRAIGHT OVER THE HUMP (row 0.560). The one place the lap
      // breathes: the trees pull back to ~22 m on the outfield so the ridge
      // and the mountain show above the treeline before the forest closes in.
      every(14, (k) => {
        if (!within(k, 0.548, 0.596)) return;
        const h = hash(k * 73);
        const dist = 22 + h * 12;
        const a = anchor(k, -1, dist);
        if (onTrack(a.c[0], a.c[2], 2)) return;
        pine(k, -1, dist, 13 + h * 9, PINE2);
        if (h > 0.7) bush(k, -1, dist - 9, SCRUB);
      });
      marshalPost(K(0.572), -1, 24);

      // --------------------------------------------------------------- 15.
      // T8-T9, the 90s climbing back up the hillside (row 0.626). Armco,
      // marshal post, tyre wall on the inside of the tighter one, pine packed
      // hard behind both rails.
      marshalPost(K(0.620), 1, 7);
      tyreWall(0.632, 0.646, 1, 5, TYRE);
      marshalPost(K(0.650), 1, 7);
      every(6, (k) => {
        if (!within(k, 0.608, 0.668)) return;
        for (const side of [-1, 1]) {
          const h = hash(k * 83 + (side + 2) * 29);
          for (let r = 0; r < 2; r++) {
            const dist = 4.2 + r * 5.0 + h * 2.2;
            const a = anchor(k, side, dist);
            if (onTrack(a.c[0], a.c[2], 1.0)) continue;
            pine(k, side, dist, 15 + h * 11, r ? PINE2 : PINE);
          }
        }
      });

      // --------------------------------------------------------------- 16.
      // THE BRIDGE (row 0.776). A service crossing: two squat building blocks
      // either side of the rail with the deck spanning between them, so the
      // road is framed and briefly darkened. forestEdge runs up to both (§4).
      const BR = K(0.776);
      building(BR, 1, 7.5, 9, 6.5, 14, { wall: CONC, roof: ROOF });
      building(BR, -1, 7.5, 9, 6.5, 14, { wall: CONC, roof: ROOF });
      const bd = overRoad(BR, 7.2);
      addBox(out, bd.c, [34, 1.8, 8.0], CONC, bd.b);
      const bp = overRoad(BR, 8.7);
      addBox(out, bp.c, [34, 1.0, 8.8], ROOF, bp.b);
      guardrail(0.762, 0.792, 1, 3.0, ARMCO);
      guardrail(0.762, 0.792, -1, 3.0, ARMCO);
      marshalPost(K(0.766), 1, 9);

      // --------------------------------------------------------------- 17.
      // NAMEROW, the uphill hairpin (row 0.836). Tyre wall and marshal post on
      // the outside, a spectator hill on the natural bank above, tree ranks
      // over the top of the bank.
      tyreWall(0.828, 0.848, -1, 5, TYRE);
      marshalPost(K(0.832), -1, 9);
      spectatorHill(0.826, 0.852, -1, 15, {});
      every(9, (k) => {
        if (!within(k, 0.820, 0.860)) return;
        const h = hash(k * 89);
        const dist = 32 + h * 12;
        const a = anchor(k, -1, dist);
        if (onTrack(a.c[0], a.c[2], 2)) return;
        tree(k, -1, dist, 12 + h * 8, h < 0.5 ? HARD : HARD2);
        if (h > 0.6) pine(k, -1, dist + 9, 16 + h * 8, PINE);
      });
      // Inside of the hairpin keeps the default wall hard against the rail.
      tyreWall(0.830, 0.844, 1, 5, TYRE);

      // --------------------------------------------------------------- 18.
      // PADDOCK BEND onto the pit straight (row 0.897). Paddock side gets the
      // second stand, a motorhome or two behind the fence and a billboard on
      // the exit; the outfield stays forest right to the line (§4).
      grandstandEx(0.897, 1, 10, 84, null, null);
      fence(0.884, 0.934, 1, 8, 2.4, [0.62, 0.64, 0.66]);
      motorhome(K(0.906), 1, 26, 11, 4.6, 16, { wall: VAN_B, window: GLASS });
      motorhome(K(0.918), 1, 26, 11, 4.6, 16, { wall: VAN_A, window: GLASS });
      billboard(K(0.934), 1, 11, 9, 3, [0.82, 0.20, 0.14]);
      cameraTower(K(0.890), 1, 13, {});

      // --------------------------------------------------------------- 19.
      // MARSHAL POSTS. The only man-made punctuation for several hundred
      // metres through the fast downhill sweep (row 0.330), plus a sparse ring
      // elsewhere so the lap is always covered.
      for (const s of [0.306, 0.330, 0.354, 0.378]) marshalPost(K(s), -1, 6);
      for (const s of [0.062, 0.120, 0.220, 0.446, 0.700, 0.740, 0.870, 0.960])
        marshalPost(K(s), 1, 8);
  };
