/* Apex 26 — OKAYAMA scenery (data only), split out of js/circuits/okayama.js.
   LAZY_SCENERY (tools/manifest.cjs): no <script> tag.

   TI Circuit Aida / Okayama International — the narrowest, most enclosed lap in
   the roster. Everything is pulled hard against the tarmac: broadleaf and bamboo
   to the barrier line, pale clay earth banks instead of gravel, low-rise club
   buildings instead of a Grand Prix paddock. Clockwise; +1 is the INFIELD.

   Brief: docs/tracks/okayama.md §4. Block -> row map:
     1-3   palette / full-lap enclosure  (§5 narrow lap, §6 keep the outfield close)
     4     s=0.005  +1  6   pit wall hoarding, marshal post, club control building
     5     s=0.015  -1  10  main grandstand, forest closing behind its top row
     6     s=0.070  -1  8   stands end: guardrail, forestEdge, ridge behind
     7     s=0.1172 -1  5   Turn 1 outside: tyreWall on a clay bank, cameraTower
     8     s=0.1172 +1  9   Turn 1 inside: marshalPost, billboard, clay apron
     9     s=0.1658 -1  7   Attwood curve: guardrail then an unbroken tree wall
    10     s=0.2107 +1  14  Williams corner infield: club pair + motorhome row
    11     s=0.2928 -1  6   Moss S first flick: dark forest to the guardrail
    12     s=0.3048 +1  9   Moss S second flick: spectatorHill, bush, billboard
    13     s=0.3372 -1  6   Hairpin: tyreWall on a clay cut, stepped bank, bamboo
    14     s=0.3992 +1  11  Revolver: marshalPost, sponsorHoarding, wooded infield
    15     s=0.4552 -1  9   climbing back section: forest both shoulders + ridges
    16     s=0.6322 -1  5   Hobbs: tyreWall, small stand on the bank, cameraTower
    17     s=0.6937 +1  10  Mike Knight: marshalPost, guardrail, trees both sides
    18     s=0.8678 +1  8   Last Corner: pit entry building, billboard, stand left
   Block 3b is not a brief row: it is the continuous second canopy that gives
   §6 ("keep the outfield close") a back edge between the corner blocks.

   Emitter notes measured with tools/track/verify-track.cjs on this def:
     * ridge() is a BACKGROUND emitter here — the scenery guard drops any ridge
       whose footprint comes within ~47 m of the road, so the clay cuts that hug
       the barrier are built with spectatorHill() in a clay colour and the
       ridges sit behind the forest (hill() pads the anchor by w/2 + h on top of
       a 62 m floor), which is what "ridge rising behind" wants anyway. The lap
       folds tight enough that the hairpin at s=0.3372 has track on every side
       within ~100 m and takes NO ridge at any width — that row asks for a
       tyreWall and a stepped bank, not a ridge, so nothing is lost. A dropped
       ridge is SILENT (no `suppressed` diagnostic): the only way to know one
       landed is the vert delta, ~28 per surviving ridge.
     * ridge()'s `ang` must be a finite heading; anchor().r is not one (it goes
       non-finite on straights and the prop validates out), so headingAt() takes
       it from two anchors.
     * motorhome() and groundPatch() are FINE on this def — the previous pass
       recorded them as "invalid at every combination", but that was a SIGNATURE
       error, not an emitter bug. motorhome(k, side, gap, w, h, d, opts) takes
       the opts object or nothing; groundPatch(k, side, gap, [w, h, d], col)
       needs its dimensions as ONE array — pass them as scalars and you get
       `invalid 1` while verify-track still prints OK. motorhome is 190 verts
       against the 227 of the place() box it replaces, so the Williams hauler
       row is now real motorhomes. groundPatch is only ~96 verts out in the
       background but ~600 hard against the road, because it conforms to the
       terrain there — so it is spent ONLY on the Turn 1 apex apron, which is
       the one row §4 actually names it for; the paddock tarmac stays a flat
       place() slab, and pushing it onto the tarmac aprons as well costs 8 k
       verts and suppresses one patch.
     * Ridge positions that DROP on this def whatever width or push-out distance
       they are given (the lap folds back inside 100 m at all of them, so there
       is track on the far side too) — do not retry these: s = 0.130, 0.170,
       0.190, 0.280, 0.296, 0.690 on -1, and 0.470, 0.560, 0.710 on +1. Every
       hill() call left in this file was checked one at a time and lands.
     * Measured prop-vert cost on this def, which is what the depth pass is
       budgeted against: tree 1680, bush 445, place box 227, cameraTower 610,
       forestEdge ~600 per 0.01 frac, sponsorHoarding ~360 per 0.01 frac,
       building 144 (!), ridge 28, billboard / marshalPost ~0 (instanced).
       grandstandEx, spectatorHill, fence, guardrail, tyreWall and hedge all
       come out NEGATIVE because the structure culls the props it intersects.
       So depth behind the front row is bought with forestEdge bands, ridges
       and buildings, never with more free-standing tree() calls. */
"use strict";
(window.TrackScenery = window.TrackScenery || {})["okayama"] =
  function (api) {
      const { n, hash, every, anchor, onTrack,
        tree, bush, hedge, forestEdge, building, grandstandEx, spectatorHill,
        guardrail, fence, tyreWall, marshalPost, cameraTower, billboard,
        sponsorHoarding, place, ridge, motorhome, groundPatch } = api;

      const K = (s) => ((Math.round(s * n) % n) + n) % n;

      // 1. PALETTE — warm humid green. Broadleaf canopies are heavy and dark,
      //    bamboo clumps are the light yellow-green, earth is pale clay. The
      //    canopy is a MIX, not one tone: camphor and evergreen oak read blue-
      //    green, deciduous crowns read warmer, new growth is nearly yellow,
      //    and a few dark sugi stand in as accents rather than a monoculture.
      const LEAF      = [0.19, 0.37, 0.17];
      const LEAF_D    = [0.13, 0.27, 0.14];
      const LEAF_L    = [0.26, 0.44, 0.20];
      const LEAF_M    = [0.22, 0.40, 0.18];
      const LEAF_Y    = [0.33, 0.49, 0.21];   // new growth, almost chartreuse
      const LEAF_B    = [0.16, 0.33, 0.20];   // evergreen oak, blue-green
      const BAMBOO    = [0.41, 0.53, 0.22];
      const BAMBOO_D  = [0.34, 0.46, 0.21];
      const CEDAR     = [0.12, 0.24, 0.18];   // sparse sugi accent only
      const SCRUB     = [0.22, 0.34, 0.18];
      const SCRUB_L   = [0.28, 0.40, 0.20];
      const GRASS     = [0.30, 0.44, 0.22];
      const GRASS_D   = [0.25, 0.38, 0.20];
      const CLAY      = [0.69, 0.61, 0.48];
      const CLAY_D    = [0.57, 0.49, 0.38];
      const CLAY_L    = [0.77, 0.70, 0.56];
      const CLAY_R    = [0.64, 0.52, 0.39];   // the rustier cut faces
      const SOIL      = [0.45, 0.38, 0.30];
      const ARMCO     = [0.80, 0.80, 0.82];
      const CLUB_WALL = [0.86, 0.86, 0.84];
      const WALL_CREAM= [0.88, 0.85, 0.76];
      const WALL_BEIGE= [0.80, 0.77, 0.70];
      const WALL_GREY = [0.72, 0.73, 0.75];
      const CLUB_ROOF = [0.34, 0.40, 0.46];
      const ROOF_BLUE = [0.25, 0.34, 0.48];
      const ROOF_GRN  = [0.23, 0.36, 0.30];
      const ROOF_RED  = [0.50, 0.26, 0.22];
      const ROOF_TIN  = [0.55, 0.57, 0.58];
      const STEEL     = [0.62, 0.64, 0.66];
      const CONC      = [0.66, 0.65, 0.62];
      const APRON     = [0.40, 0.40, 0.42];
      const APRON_L   = [0.46, 0.46, 0.47];
      const SHUTTER   = [[0.74, 0.20, 0.18], [0.20, 0.36, 0.64], [0.86, 0.72, 0.18],
                         [0.22, 0.50, 0.32], [0.82, 0.82, 0.84], [0.56, 0.24, 0.52]];
      const CRATE     = [[0.68, 0.30, 0.22], [0.26, 0.42, 0.56], [0.72, 0.68, 0.30],
                         [0.40, 0.52, 0.40], [0.78, 0.78, 0.76]];
      const CAR       = [[0.78, 0.78, 0.80], [0.16, 0.18, 0.22], [0.58, 0.16, 0.16],
                         [0.20, 0.34, 0.56], [0.64, 0.64, 0.66], [0.30, 0.44, 0.34]];
      // Canopy mix used by the full-lap tree wall and every clump behind it.
      const CANOPY    = [LEAF, LEAF_D, LEAF_M, LEAF_L, LEAF_B, LEAF_Y, LEAF_M, LEAF_D];

      // Wooded hillside behind the treeline. ridge() needs world x/z plus a
      // finite heading, and refuses to build within ~47 m of the road — so the
      // anchor is pushed out by half the ridge width plus its height.
      const headingAt = (k, side, dist) => {
        const a = anchor(k, side, dist), b = anchor((k + 4) % n, side, dist);
        return Math.atan2(b.c[0] - a.c[0], b.c[2] - a.c[2]);
      };
      const hill = (s, side, dist, len, w, h, col) => {
        const k = K(s), a = anchor(k, side, Math.max(dist, 62) + w * 0.5 + h);
        ridge(a.c[0], a.c[2], a.c[1], headingAt(k, side, dist), len, w, h,
          col || [0.28, 0.40, 0.23]);
      };
      // Pale clay cut hard against the barrier — spectatorHill is the only
      // near-track earth-bank emitter that survives the guard at these gaps.
      const clayCut = (s0, s1, side, gap, h, col) =>
        spectatorHill(s0, s1, side, gap, { h: h, col: col || CLAY, steps: 1 });

      // The lap folds back on itself inside 100 m in several places, so every
      // free-standing prop added by this pass is checked against the road
      // before it is emitted — that is what keeps `suppressed` at zero.
      const clear = (k, side, dist, pad) => {
        const a = anchor(k, side, dist);
        return Number.isFinite(a.c[0]) && Number.isFinite(a.c[2]) &&
          !onTrack(a.c[0], a.c[2], pad == null ? 6 : pad);
      };
      const box = (s, side, dist, dims, col) => {
        const k = K(s);
        if (!clear(k, side, dist, 5)) return;
        place(k, side, dist, dims, col);
      };
      // Low-rise club structure. building() is 144 verts here — by far the
      // cheapest way to add a DISTINCT silhouette, so the club estate is built
      // out of many small ones rather than a couple of big boxes.
      const bld = (s, side, dist, w, h, d, col, roof, floors) => {
        const k = K(s);
        if (!clear(k, side, dist, 7) || !clear(k, side, dist + w * 0.5, 7)) return;
        building(k, side, dist, w, h, d,
          { col: col, roof: roof, floors: floors == null ? 1 : floors });
      };
      // Marshal shelter: the small breeze-block hut that sits next to every
      // post on this circuit. Distinct enough to read, cheap enough to repeat.
      const hut = (s, side, dist, roof) =>
        bld(s, side, dist, 4.5, 3.0, 3.2, WALL_BEIGE, roof || ROOF_TIN, 1);

      // 2. FULL-LAP ENCLOSURE — armco right on the edge the whole way round
      //    (club course: barrier, not run-off) with a wire fence just behind it
      //    holding the trees back.
      for (const side of [-1, 1]) {
        guardrail(0.0, 1.0, side, 4, ARMCO);
        fence(0.0, 1.0, side, 7.5, 2.0, [0.46, 0.48, 0.44]);
      }

      // 3. THE TREE WALL — the identifying quality. Ranks start only ~9 m off
      //    the tarmac, hashed so trunks do not line up, with bamboo clumps and
      //    bush infill closing the sky gap at the foot. Crown colour is drawn
      //    from the CANOPY mix so no two neighbouring ranks share a tone.
      every(16, (k) => {
        const h0 = hash(k * 17 + 3);
        for (const side of [-1, 1]) {
          const h = hash(k * 29 + (side < 0 ? 101 : 211));
          if (h < 0.12) continue;                     // occasional gap
          const ranks = h > 0.81 ? 3 : 2;
          for (let r = 0; r < ranks; r++) {
            const hr = hash(k * 7 + r * 53 + (side < 0 ? 13 : 71));
            const dist = 9 + r * 7.5 + hr * 4.5;
            const a = anchor(k, side, dist);
            if (onTrack(a.c[0], a.c[2], 5)) continue;
            const bam = hr > 0.82;
            const sugi = !bam && hr > 0.78;
            tree(k, side, dist,
              bam ? 9 + hr * 5 : (sugi ? 13 + hr * 6 : 7.5 + hr * 6.5),
              bam ? (hr > 0.92 ? BAMBOO_D : BAMBOO)
                  : (sugi ? CEDAR
                          : CANOPY[(((k * 3 + r * 5 + (side < 0 ? 0 : 4)) % 8) + 8) % 8]));
          }
          if (h0 > 0.52) bush(k, side, 7 + h0 * 3, h0 > 0.8 ? SCRUB_L : SCRUB);
        }
      });

      // 3b. THE SECOND CANOPY — depth BEHIND the front rank. Every corner block
      //     below hangs its own deep band off the section it dresses; these two
      //     close the long stretches in between (Attwood-to-Moss, Revolver-to-
      //     the-climb), so the outfield treeline has a back edge nearly the
      //     whole way round instead of ending in sky wherever a block stops.
      //     forestEdge is the only affordable way to do this: a free-standing
      //     tree() is 1680 verts, a whole 0.01 frac of band is ~600 — which is
      //     also why the tree wall above drops its third rank more often than
      //     it used to. The bands replace it, and cover more ground.
      forestEdge(0.206, 0.262, -1, 29, { col: LEAF_B, h: 18, rows: 3 });
      forestEdge(0.372, 0.442, -1, 29, { col: LEAF_M, h: 18, rows: 3 });

      // 4. START/FINISH, PIT WALL (+1, 6 m) — hoarding at wall height, marshal
      //    post at the exit end, low two-storey club control building behind,
      //    and the club's pit lane: a shallow garage terrace of six shuttered
      //    bays, a timing box on the end, working clutter on the apron.
      sponsorHoarding(0.982, 0.062, 1, 6, { h: 1.15 });
      marshalPost(K(0.060), 1, 7);
      building(K(0.012), 1, 13, 26, 8.5, 12,
        { col: CLUB_WALL, roof: CLUB_ROOF, floors: 2 });
      building(K(0.040), 1, 14, 16, 6.0, 10,
        { col: CLUB_WALL, roof: CLUB_ROOF, floors: 2 });
      for (let i = 0; i < 6; i++)                     // paddock apron slabs
        place(K(0.006 + i * 0.010), 1, 20, [26, 0.08, 22], APRON);
      for (let i = 0; i < 6; i++) {                   // garage bays, one per shutter
        const s = 0.0165 + i * 0.0072;
        bld(s, 1, 9.5, 9.0, 4.4, 6.4, i & 1 ? WALL_CREAM : CLUB_WALL, ROOF_TIN, 1);
        box(s, 1, 9.2, [0.5, 3.0, 4.2], SHUTTER[i % SHUTTER.length]);
      }
      bld(0.0620, 1, 9.5, 8.0, 10.5, 5.0, WALL_GREY, ROOF_BLUE, 3);   // timing box
      cameraTower(K(0.0660), 1, 12);
      for (let i = 0; i < 5; i++)                     // tool carts on the pit wall
        box(0.020 + i * 0.0085, 1, 6.6, [1.6, 1.1, 0.9],
          i & 1 ? [0.82, 0.82, 0.84] : [0.30, 0.32, 0.36]);
      for (let i = 0; i < 4; i++)                     // tyre pallets on the apron
        box(0.0240 + i * 0.0095, 1, 17.5, [2.2, 1.3, 2.2], [0.12, 0.12, 0.13]);
      for (let i = 0; i < 6; i++)                     // paddock car park
        box(0.0180 + i * 0.0090, 1, 31, [4.3, 1.4, 1.9], CAR[i % CAR.length]);
      billboard(K(0.0300), 1, 11, 7, 2.4, [0.86, 0.20, 0.18]);
      billboard(K(0.0480), 1, 11, 7, 2.4, [0.18, 0.34, 0.66]);
      hedge(0.004, 0.060, 1, 30, 1.4, SCRUB);

      // 5. MAIN GRANDSTAND (-1, 10 m) — one modest covered bank, short, forest
      //    closing immediately behind its top row. Behind and beside it: the
      //    commentary box, a scoreboard, the sponsor run at the stand foot and
      //    a pair of open terraces where the covered bank runs out.
      grandstandEx(0.015, -1, 10, 110, null, null);
      forestEdge(0.985, 0.075, -1, 30, { col: LEAF, h: 12, rows: 2 });
      hill(0.030, -1, 62, 150, 34, 14, [0.27, 0.39, 0.22]);
      hill(0.010, -1, 62, 120, 26, 11, [0.29, 0.41, 0.23]);
      billboard(K(0.050), -1, 10, 9, 3.2, [0.78, 0.20, 0.18]);
      sponsorHoarding(0.996, 0.046, -1, 8, { h: 1.3 });
      bld(0.0330, -1, 26, 10.0, 9.0, 7.0, WALL_CREAM, ROOF_BLUE, 3);  // commentary
      bld(0.0080, -1, 24, 7.0, 4.0, 5.0, WALL_BEIGE, ROOF_GRN, 1);    // kiosk
      box(0.0430, -1, 12, [0.6, 5.0, 9.0], [0.14, 0.15, 0.17]);       // scoreboard
      billboard(K(0.0430), -1, 12, 8, 3.4, [0.95, 0.95, 0.92]);
      spectatorHill(0.000, 0.014, -1, 10, { h: 3.6, col: GRASS, steps: 2 });
      spectatorHill(0.055, 0.070, -1, 10, { h: 3.6, col: GRASS_D, steps: 2 });
      for (let i = 0; i < 4; i++)                     // marquees behind the bank
        box(0.0180 + i * 0.0110, -1, 21, [6.5, 2.8, 6.0],
          i & 1 ? [0.90, 0.90, 0.88] : [0.84, 0.86, 0.88]);

      // 6. STANDS END, s=0.070 (-1, 8 m) — trees take over at once: guardrail
      //    hard on the edge, forest one row back, ridge rising behind. Three
      //    bands now, stepping up in height, so the wall has real thickness.
      guardrail(0.068, 0.118, -1, 5, ARMCO);
      forestEdge(0.068, 0.120, -1, 9, { col: LEAF_D, h: 13, rows: 3 });
      forestEdge(0.066, 0.122, -1, 26, { col: LEAF_B, h: 17, rows: 3 });
      hill(0.090, -1, 62, 130, 30, 15, [0.26, 0.38, 0.22]);
      hill(0.076, -1, 62, 110, 24, 19, [0.24, 0.36, 0.21]);
      marshalPost(K(0.0800), -1, 8);
      hut(0.0800, -1, 12, ROOF_GRN);

      // 7. TURN 1 / FIRST CORNER, s=0.1172 (-1, 5 m) — downhill right into a
      //    pale clay cut with almost no run-off: tyres against the bank, green
      //    ridge above, camera tower on the bank shoulder. The cut is TERRACED
      //    now — a rust-coloured lower face, a pale bench above it — with the
      //    photographers' platform cut into the shoulder.
      tyreWall(0.104, 0.136, -1, 5, [0.84, 0.78, 0.22]);
      clayCut(0.100, 0.140, -1, 9, 6.5, CLAY);
      clayCut(0.102, 0.138, -1, 9, 3.0, CLAY_R);
      spectatorHill(0.098, 0.142, -1, 21, { h: 9.5, col: CLAY_L, steps: 2 });
      cameraTower(K(0.1172), -1, 15);
      cameraTower(K(0.1080), -1, 17);
      hill(0.1172, -1, 62, 120, 28, 16, [0.25, 0.37, 0.21]);
      forestEdge(0.096, 0.146, -1, 33, { col: LEAF_D, h: 18, rows: 3 });
      bld(0.1220, -1, 20, 5.5, 4.5, 4.0, WALL_GREY, ROOF_TIN, 1);   // photo platform
      box(0.1220, -1, 18.5, [3.0, 0.3, 5.0], STEEL);                // its deck
      for (let i = 0; i < 6; i++)                     // spare tyre stacks, mixed
        box(0.1055 + i * 0.0055, -1, 11.5, [1.8, 1.2, 1.8],
          i % 3 === 0 ? [0.86, 0.30, 0.16] : (i & 1 ? [0.14, 0.14, 0.15] : [0.84, 0.78, 0.22]));
      for (let i = 0; i < 7; i++) {
        const s = 0.104 + (i / 6) * 0.032, hh = hash(i * 61 + 9);
        bush(K(s), -1, 16 + hh * 2.5, hh > 0.6 ? SCRUB_L : SCRUB);
        tree(K(s), -1, 19 + hh * 6, 8 + hh * 5, hh > 0.6 ? BAMBOO : LEAF);
      }

      // 8. TURN 1 INSIDE, s=0.1172 (+1, 9 m) — marshal post, one billboard and
      //    pale clay spilling out from under the apex kerb, with the marshals'
      //    hut and a low hoarding behind the apron.
      marshalPost(K(0.1172), 1, 9);
      billboard(K(0.126), 1, 9, 8, 3.0, [0.16, 0.32, 0.62]);
      for (let i = 0; i < 5; i++)
        groundPatch(K(0.110 + i * 0.004), 1, 9, [7, 0.07, 7], i & 1 ? CLAY : CLAY_D);
      for (let i = 0; i < 3; i++)                     // the spill fades outward
        box(0.1105 + i * 0.0060, 1, 15.5, [6.0, 0.06, 6.0], i & 1 ? CLAY_L : CLAY);
      hut(0.1140, 1, 14, ROOF_BLUE);
      sponsorHoarding(0.112, 0.130, 1, 12, { h: 1.3 });
      hedge(0.106, 0.134, 1, 19, 1.5, SCRUB);

      // 9. ATTWOOD CURVE, s=0.1658 (-1, 7 m) — guardrail then an unbroken tree
      //    wall: ranks and bush infill to the barrier line, no sky gap. Four
      //    depth bands here; the circuit's works shed hides in the third.
      guardrail(0.145, 0.200, -1, 4, ARMCO);
      forestEdge(0.145, 0.200, -1, 7, { col: LEAF_D, h: 14, rows: 3 });
      forestEdge(0.145, 0.200, -1, 19, { col: LEAF, h: 16, rows: 2 });
      forestEdge(0.143, 0.202, -1, 31, { col: LEAF_B, h: 19, rows: 3 });
      hedge(0.145, 0.200, -1, 6, 1.6, SCRUB);
      bld(0.1760, -1, 27, 8.0, 4.2, 12.0, WALL_BEIGE, ROOF_TIN, 1);   // works shed
      box(0.1830, -1, 27, [5.0, 2.6, 2.6], CRATE[1]);
      marshalPost(K(0.1560), -1, 7);
      for (let i = 0; i < 10; i++) {
        const s = 0.145 + (i / 9) * 0.055, hh = hash(i * 37 + 5);
        tree(K(s), -1, 10 + hh * 3, 9 + hh * 6, hh > 0.7 ? BAMBOO : LEAF_D);
      }

      // 10. WILLIAMS CORNER, s=0.2107 (+1, 14 m) — the one building cluster on
      //     the lap: a low club facility pair and a motorhome row on the paddock
      //     apron (place() boxes — motorhome() validates out on this def), with
      //     a tree screen between them and the track. Raised here into a proper
      //     club estate: workshop, store, scrutineering shed, a container line,
      //     a gravel car park and the paddock hedge around the lot.
      building(K(0.2107), 1, 14, 22, 7.0, 14,
        { col: CLUB_WALL, roof: CLUB_ROOF, floors: 2 });
      building(K(0.2280), 1, 15, 17, 5.5, 11,
        { col: [0.80, 0.82, 0.80], roof: CLUB_ROOF, floors: 1 });
      for (let i = 0; i < 4; i++)
        place(K(0.2000 + i * 0.008), 1, 26, [22, 0.08, 20], APRON);
      for (let i = 0; i < 5; i++) {                   // team hauler row
        const k = K(0.1955 + i * 0.0090);
        motorhome(k, 1, 24, 11.5, 3.4, 3.1, {});
        place(k, 1, 28.5, [9.0, 2.6, 2.6], [0.74, 0.76, 0.80]);  // awning/trailer
      }
      bld(0.2180, 1, 16, 13.0, 5.0, 9.0, WALL_CREAM, ROOF_RED, 1);   // workshop
      bld(0.2390, 1, 15, 10.0, 4.2, 8.0, WALL_BEIGE, ROOF_TIN, 1);   // store
      bld(0.2480, 1, 17, 8.0, 3.8, 6.0, WALL_GREY, ROOF_GRN, 1);     // scrutineering
      bld(0.1900, 1, 18, 9.0, 4.6, 7.0, WALL_CREAM, ROOF_BLUE, 1);   // race office
      for (let i = 0; i < 5; i++)                     // container line behind
        box(0.2020 + i * 0.0085, 1, 40, [6.1, 2.6, 2.5], CRATE[i % CRATE.length]);
      for (let i = 0; i < 8; i++)                     // club car park
        box(0.2230 + (i >> 1) * 0.0090, 1, (i & 1) ? 33 : 38.5,
          [4.3, 1.4, 1.9], CAR[(i * 3) % CAR.length]);
      place(K(0.2260), 1, 36, [26, 0.07, 22], APRON_L);
      sponsorHoarding(0.196, 0.222, 1, 12, { h: 1.5 });
      billboard(K(0.2330), 1, 12, 8, 3.0, [0.90, 0.56, 0.16]);
      hedge(0.190, 0.252, 1, 30, 1.7, SCRUB_L);
      fence(0.190, 0.252, 1, 20, 2.4, [0.50, 0.52, 0.48]);
      forestEdge(0.194, 0.248, 1, 46, { col: LEAF_M, h: 17, rows: 3 });
      marshalPost(K(0.2420), 1, 12);
      for (let i = 0; i < 9; i++) {
        const s = 0.192 + (i / 8) * 0.050, hh = hash(i * 23 + 77);
        tree(K(s), 1, 8 + hh * 2.5, 8 + hh * 4, hh > 0.7 ? LEAF_B : LEAF);
        if (hh > 0.5) bush(K(s), 1, 6.5, SCRUB);
      }

      // 11. MOSS S, FIRST FLICK, s=0.2928 (-1, 6 m) — trees right up to the
      //     guardrail, forest dense and dark, marshal post in the only gap.
      //     A third band and two ridges give the darkness somewhere to go.
      guardrail(0.270, 0.300, -1, 4, ARMCO);
      forestEdge(0.270, 0.300, -1, 6, { col: LEAF_D, h: 15, rows: 3 });
      forestEdge(0.270, 0.300, -1, 18, { col: LEAF, h: 17, rows: 2 });
      forestEdge(0.266, 0.304, -1, 30, { col: LEAF_D, h: 20, rows: 3 });
      marshalPost(K(0.2928), -1, 7);
      hut(0.2870, -1, 11, ROOF_GRN);
      for (let i = 0; i < 8; i++) {
        const s = 0.270 + (i / 7) * 0.030, hh = hash(i * 43 + 19);
        bush(K(s), -1, 6.5 + hh, LEAF_D);
        tree(K(s), -1, 9 + hh * 3, 10 + hh * 6, hh > 0.85 ? CEDAR : LEAF_D);
      }

      // 12. MOSS S, SECOND FLICK, s=0.3048 (+1, 9 m) — low grass spectator
      //     bank, bush along its foot, billboard angled at the exit. The bank
      //     is stepped in two grades now with a stall row and a rail along the
      //     crest — this is where the club's spectators actually stand.
      spectatorHill(0.296, 0.326, 1, 9, { h: 4.5, col: GRASS });
      spectatorHill(0.294, 0.328, 1, 17, { h: 7.5, col: GRASS_D, steps: 3 });
      hedge(0.296, 0.326, 1, 7, 1.3, SCRUB);
      fence(0.294, 0.328, 1, 15, 1.2, [0.52, 0.54, 0.50]);
      for (let i = 0; i < 6; i++)
        bush(K(0.296 + (i / 5) * 0.030), 1, 7.5 + hash(i * 11 + 3) * 1.5, SCRUB);
      billboard(K(0.3130), 1, 9, 9, 3.2, [0.90, 0.84, 0.20]);
      billboard(K(0.2990), 1, 9, 7, 2.6, [0.20, 0.52, 0.30]);
      for (let i = 0; i < 3; i++)                     // stall row on the crest
        bld(0.2995 + i * 0.0085, 1, 25, 5.0, 3.0, 4.0,
          i & 1 ? WALL_CREAM : [0.90, 0.90, 0.88], i & 1 ? ROOF_RED : ROOF_BLUE, 1);
      forestEdge(0.290, 0.332, 1, 34, { col: LEAF_M, h: 16, rows: 3 });
      marshalPost(K(0.3220), 1, 10);

      // 13. HAIRPIN, s=0.3372 (-1, 6 m) — tyres on a pale clay cut, a stepped
      //     spectator bank in the slope above, bamboo clumps on the crest. The
      //     cut is now two-tone and terraced, and the crest carries a real
      //     bamboo band rather than a scatter of clumps. No ridge survives
      //     here at any width (see header) — the terraces do that job.
      tyreWall(0.322, 0.356, -1, 6, [0.86, 0.30, 0.16]);
      clayCut(0.320, 0.358, -1, 10, 7.0, CLAY);
      clayCut(0.322, 0.356, -1, 10, 3.2, CLAY_R);
      spectatorHill(0.324, 0.354, -1, 18, { h: 8.0, col: GRASS, steps: 3 });
      spectatorHill(0.322, 0.356, -1, 28, { h: 11.5, col: SOIL, steps: 2 });
      forestEdge(0.318, 0.360, -1, 38, { col: BAMBOO_D, h: 14, rows: 3 });
      forestEdge(0.316, 0.362, -1, 50, { col: LEAF_D, h: 19, rows: 3 });
      cameraTower(K(0.3372), -1, 14);
      for (let i = 0; i < 5; i++)                     // tyre bundles on the cut
        box(0.3245 + i * 0.0060, -1, 12.5, [1.8, 1.2, 1.8],
          i & 1 ? [0.14, 0.14, 0.15] : [0.86, 0.30, 0.16]);
      hut(0.3480, -1, 12, ROOF_TIN);
      for (let i = 0; i < 10; i++) {
        const s = 0.320 + (i / 9) * 0.038, hh = hash(i * 67 + 31);
        tree(K(s), -1, 28 + hh * 5, 11 + hh * 6, hh > 0.5 ? BAMBOO : BAMBOO_D);
        if (hh > 0.55) tree(K(s), -1, 35 + hh * 4, 10 + hh * 5, BAMBOO);
      }
      marshalPost(K(0.3480), -1, 8);

      // 14. REVOLVER, s=0.3992 (+1, 11 m) — marshal post and hoarding on the
      //     infield, tree stand behind: the infield here is wooded, not open.
      //     Two bands behind the stand and a pump house in the trees.
      marshalPost(K(0.3992), 1, 11);
      sponsorHoarding(0.386, 0.414, 1, 11, { h: 1.4 });
      forestEdge(0.380, 0.424, 1, 16, { col: LEAF, h: 14, rows: 3 });
      forestEdge(0.376, 0.428, 1, 28, { col: LEAF_B, h: 18, rows: 3 });
      bld(0.4080, 1, 21, 6.0, 3.6, 5.0, WALL_GREY, ROOF_GRN, 1);      // pump house
      box(0.4130, 1, 22, [2.4, 3.2, 2.4], STEEL);                     // water tank
      billboard(K(0.3890), 1, 12, 8, 3.0, [0.84, 0.20, 0.30]);
      hut(0.3930, 1, 15, ROOF_RED);
      for (let i = 0; i < 10; i++) {
        const s = 0.378 + (i / 9) * 0.048, hh = hash(i * 13 + 41);
        tree(K(s), 1, 14 + hh * 6, 9 + hh * 6, hh > 0.75 ? BAMBOO : LEAF);
        if (hh > 0.6) bush(K(s), 1, 12 + hh * 2, hh > 0.8 ? SCRUB_L : SCRUB);
      }

      // 15. CLIMBING BACK SECTION, s=0.4552 (-1, 9 m) — forest on both
      //     shoulders and ridges running with the track as it gains height.
      //     The ridge line now steps UP with the road (14 -> 26 m) and a second
      //     outfield band at 24 m keeps the far shoulder from thinning out.
      forestEdge(0.440, 0.620, -1, 9, { col: LEAF, h: 14, rows: 3 });
      forestEdge(0.440, 0.620, 1, 10, { col: LEAF_L, h: 13, rows: 2 });
      forestEdge(0.468, 0.600, -1, 25, { col: LEAF_B, h: 18, rows: 3 });
      hill(0.4552, -1, 62, 140, 30, 16, [0.27, 0.39, 0.22]);
      hill(0.5200, -1, 62, 150, 32, 20, [0.25, 0.37, 0.21]);
      hill(0.5900, -1, 62, 140, 30, 24, [0.24, 0.36, 0.21]);
      hill(0.5550, -1, 62, 120, 24, 14, [0.28, 0.40, 0.23]);
      hill(0.4850, -1, 62, 130, 28, 18, [0.26, 0.38, 0.22]);
      hill(0.6100, -1, 62, 130, 28, 26, [0.23, 0.35, 0.20]);
      marshalPost(K(0.5100), -1, 9);
      marshalPost(K(0.5700), 1, 9);
      hut(0.5100, -1, 13, ROOF_TIN);
      hut(0.5700, 1, 13, ROOF_GRN);
      bld(0.5400, -1, 22, 5.0, 3.2, 4.0, WALL_BEIGE, ROOF_TIN, 1);    // relay hut
      box(0.5430, -1, 23, [2.0, 2.4, 2.0], CONC);
      billboard(K(0.4900), -1, 10, 8, 3.0, [0.22, 0.44, 0.72]);
      billboard(K(0.5980), 1, 10, 8, 3.0, [0.88, 0.80, 0.22]);
      for (let i = 0; i < 14; i++) {
        const s = 0.440 + (i / 13) * 0.180, hh = hash(i * 19 + 7);
        bush(K(s), -1, 6.5 + hh * 2, hh > 0.7 ? SCRUB_L : SCRUB);
        bush(K(s), 1, 7 + hh * 2, LEAF_D);
        tree(K(s), hh > 0.5 ? 1 : -1, 8 + hh * 4, 9 + hh * 7,
          hh > 0.88 ? CEDAR : (hh > 0.82 ? BAMBOO : LEAF_D));
      }

      // 16. HOBBS CORNER, s=0.6322 (-1, 5 m) — the far hairpin at the top of
      //     the climb: tyres against an earth bank, a small stand on the bank
      //     above it, camera tower beside. A second open terrace next to the
      //     covered bank, a terraced cut below, and a bamboo crest behind.
      tyreWall(0.618, 0.650, -1, 5, [0.84, 0.78, 0.22]);
      clayCut(0.614, 0.654, -1, 9, 6.0, CLAY);
      clayCut(0.616, 0.652, -1, 9, 2.8, CLAY_R);
      grandstandEx(0.6322, -1, 20, 55, null, null);
      grandstandEx(0.6560, -1, 18, 34, null, null);
      spectatorHill(0.604, 0.616, -1, 18, { h: 6.5, col: GRASS_D, steps: 2 });
      cameraTower(K(0.6450), -1, 18);
      hill(0.6322, -1, 62, 120, 28, 20, [0.24, 0.36, 0.21]);
      hill(0.6480, -1, 62, 130, 30, 24, [0.23, 0.35, 0.20]);
      forestEdge(0.606, 0.664, -1, 34, { col: BAMBOO_D, h: 15, rows: 3 });
      forestEdge(0.614, 0.658, -1, 47, { col: LEAF_D, h: 20, rows: 3 });
      sponsorHoarding(0.626, 0.648, -1, 13, { h: 1.4 });
      bld(0.6380, -1, 30, 7.0, 4.0, 5.5, WALL_CREAM, ROOF_BLUE, 1);   // stand office
      marshalPost(K(0.6220), 1, 8);
      hut(0.6280, 1, 14, ROOF_RED);
      billboard(K(0.6400), 1, 10, 8, 3.0, [0.94, 0.94, 0.90]);
      for (let i = 0; i < 5; i++)
        place(K(0.6280 + i * 0.004), 1, 9, [7, 0.07, 7], i & 1 ? CLAY_D : CLAY);
      for (let i = 0; i < 3; i++)
        box(0.6300 + i * 0.0055, 1, 15.5, [6.0, 0.06, 6.0], i & 1 ? CLAY_L : CLAY);
      for (let i = 0; i < 5; i++)                     // tyre bundles on the cut
        box(0.6210 + i * 0.0060, -1, 11.5, [1.8, 1.2, 1.8],
          i & 1 ? [0.14, 0.14, 0.15] : [0.84, 0.78, 0.22]);
      for (let i = 0; i < 8; i++) {
        const s = 0.616 + (i / 7) * 0.038, hh = hash(i * 59 + 23);
        tree(K(s), -1, 32 + hh * 6, 10 + hh * 5, hh > 0.6 ? BAMBOO : LEAF);
        bush(K(s), 1, 6.5 + hh * 2, SCRUB);
      }

      // 17. MIKE KNIGHT, s=0.6937 (+1, 10 m) — marshal post, guardrail and
      //     tree ranks close on both sides all the way down the descent. The
      //     outfield gets a deep band and a ridge line; the infield stays a
      //     thin wooded strip, which is what makes the descent feel like a
      //     corridor rather than a clearing.
      marshalPost(K(0.6937), 1, 10);
      guardrail(0.665, 0.760, 1, 4, ARMCO);
      guardrail(0.665, 0.760, -1, 4, ARMCO);
      forestEdge(0.665, 0.775, 1, 8, { col: LEAF_D, h: 14, rows: 3 });
      forestEdge(0.665, 0.775, -1, 7, { col: LEAF_D, h: 15, rows: 3 });
      forestEdge(0.670, 0.762, -1, 22, { col: LEAF_B, h: 19, rows: 3 });
      hill(0.7400, -1, 62, 130, 28, 18, [0.26, 0.38, 0.22]);
      hut(0.6937, 1, 14, ROOF_TIN);
      billboard(K(0.7200), 1, 10, 8, 3.0, [0.84, 0.26, 0.20]);
      marshalPost(K(0.7500), -1, 9);
      for (let i = 0; i < 8; i++) {
        const s = 0.665 + (i / 7) * 0.110, hh = hash(i * 71 + 13);
        for (const side of [-1, 1]) {
          bush(K(s), side, 6.5 + hh * 1.5, LEAF_D);
          tree(K(s), side, 9 + hh * 3, 10 + hh * 6,
            hh > 0.78 ? BAMBOO : (side < 0 ? LEAF_D : LEAF));
        }
      }

      // 18. LAST CORNER (Michael Schumacher corner), s=0.8678 (+1, 8 m) — onto
      //     the straight: pit entry building and guardrail split on the infield,
      //     a billboard, and the stand reappearing ahead on the left. The pit
      //     entry now reads as a facility — scrutineering bay, weighbridge
      //     hut, a fenced compound — and the left-hand bank terraces up to the
      //     returning grandstand.
      building(K(0.8678), 1, 8, 18, 5.5, 10,
        { col: CLUB_WALL, roof: CLUB_ROOF, floors: 1 });
      guardrail(0.850, 0.905, 1, 5, ARMCO);
      guardrail(0.850, 0.985, -1, 5, ARMCO);
      billboard(K(0.8820), 1, 9, 9, 3.2, [0.20, 0.56, 0.32]);
      marshalPost(K(0.9000), 1, 9);
      grandstandEx(0.930, -1, 12, 70, null, null);
      forestEdge(0.800, 0.930, -1, 8, { col: LEAF, h: 14, rows: 3 });
      forestEdge(0.800, 0.860, 1, 12, { col: LEAF_L, h: 13, rows: 2 });
      forestEdge(0.818, 0.922, -1, 25, { col: LEAF_B, h: 18, rows: 3 });
      hill(0.8678, -1, 62, 130, 30, 15, [0.27, 0.39, 0.22]);
      hill(0.8200, -1, 62, 140, 32, 19, [0.25, 0.37, 0.21]);
      hill(0.9200, -1, 62, 120, 26, 13, [0.28, 0.40, 0.23]);
      bld(0.8880, 1, 9, 10.0, 4.4, 8.0, WALL_BEIGE, ROOF_TIN, 1);     // scrutineering
      bld(0.9080, 1, 10, 5.0, 3.2, 4.0, WALL_GREY, ROOF_GRN, 1);      // weighbridge
      bld(0.9380, 1, 12, 8.0, 6.5, 6.0, WALL_CREAM, ROOF_BLUE, 2);    // pit entry box
      fence(0.874, 0.948, 1, 18, 2.4, [0.50, 0.52, 0.48]);
      for (let i = 0; i < 4; i++)                     // compound clutter
        box(0.8940 + i * 0.0090, 1, 22, [5.0, 2.5, 2.4], CRATE[(i + 2) % CRATE.length]);
      sponsorHoarding(0.908, 0.948, -1, 9, { h: 1.35 });
      spectatorHill(0.900, 0.928, -1, 11, { h: 5.0, col: GRASS, steps: 2 });
      spectatorHill(0.898, 0.930, -1, 20, { h: 8.0, col: GRASS_D, steps: 3 });
      billboard(K(0.9480), -1, 10, 9, 3.2, [0.92, 0.72, 0.18]);
      hut(0.8560, -1, 12, ROOF_RED);
      for (let i = 0; i < 7; i++) {
        const s = 0.790 + (i / 6) * 0.140, hh = hash(i * 47 + 29);
        bush(K(s), -1, 6.5 + hh * 2, hh > 0.7 ? SCRUB_L : SCRUB);
        tree(K(s), -1, 9 + hh * 4, 9 + hh * 6, hh > 0.8 ? BAMBOO : LEAF);
      }
  };
