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
     4  depth behind the wall (3 bands)        rows 0.090 0.330  (§6 enclosure)
     5  bulk forestEdge runs                   rows 0.020 0.330 0.776 0.897
     6  esses cutting / green tunnel           row  0.205
     7  ski mountain + wooded ridges (skyline) rows 0.150 0.560
     8  paddock: garages, motorhomes, camera   row  0.005
     9  start-line grandstand                  row  0.020
    10  Turn 1 on the crest                    row  0.181
    11  esses exit, gravel spill               row  0.255
    12  T4 apex + spectator bank               row  0.412
    13  T5 outside, hardwood run-off           row  0.456
    14  the Carousel                           row  0.503
    15  back straight / the Hump breathes      row  0.560
    16  T8-T9 climbing 90s                     row  0.626
    17  the Bridge abutments                   row  0.776
    18  Namerow hairpin                        row  0.836
    19  Paddock Bend onto the pit straight     row  0.897
    20  marshal posts around the lap           rows 0.181 0.255 0.330 0.503 0.626 0.836

   Season is NOT baked in: everything wooded is deep summer green and the
   lighting presets carry the autumn this place is famous for.

   COST MODEL (measured with tools/track/verify-track.cjs): `tree` is ~163 prop
   verts each, `bush` ~47, `ridge` ~28, `mountain` ~146; `pine`, `guardrail`,
   `fence`, `tyreWall`, `billboard` and `addBox` are instanced/batched and cost
   NO prop verts. So DEPTH is bought in pine and ridge, and hardwood — the
   expensive half of the mix — is spent where it is actually read: the lit
   forest EDGE and its understory, the esses, T5 and Namerow. */
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
      const PINE3 = [0.10, 0.23, 0.16];   // the band behind the wall
      const HARD  = [0.21, 0.38, 0.17];   // northern hardwood in full leaf
      const HARD2 = [0.25, 0.44, 0.20];
      const SCRUB = [0.16, 0.30, 0.14];
      const FERN  = [0.19, 0.34, 0.16];   // roadside undergrowth, lighter
      const CANOPY= [0.13, 0.27, 0.15];   // the ceiling over the cutting
      const ARMCO = [0.80, 0.80, 0.82];
      const TYRE  = [0.86, 0.84, 0.30];
      const DIRT  = [0.36, 0.30, 0.21];
      const ROCK  = [0.44, 0.43, 0.41];   // Laurentian granite in the cutting
      const ROCK2 = [0.38, 0.38, 0.37];
      const CONC  = [0.70, 0.68, 0.64];
      const ROOF  = [0.30, 0.33, 0.36];
      const HILL  = [0.15, 0.29, 0.17];   // wooded hill, near
      const HILL2 = [0.17, 0.30, 0.20];   // ...mid distance
      const HAZE  = [0.21, 0.32, 0.27];   // ...and hazed out on the horizon
      const TRAIL = [0.31, 0.42, 0.23];   // cut and grassed ski slopes, lighter
      const WIN   = [0.24, 0.30, 0.34];
      const GLASS = [0.28, 0.34, 0.38];
      const VAN_A = [0.90, 0.90, 0.92];
      const VAN_B = [0.82, 0.84, 0.87];

      const { K } = api;            // the contract's frac -> node index (normalised for negatives)
      const RAIL = 3.2;                   // armco gap: hard against the tarmac
      // Heading of the road at k, for world-space ridges/banks.
      const heading = (k, side, dist) => {
        const a = anchor((k + 4) % n, side, dist);
        const b = anchor((k - 4 + n) % n, side, dist);
        return Math.atan2(a.c[0] - b.c[0], a.c[2] - b.c[2]);
      };
      // Mid-road point at k lifted by dy, plus the road basis, so a box can
      // be laid ACROSS the road: addBox's size maps to [right, up, tangent].
      const overRoad = (k, dy) => {
        const a = anchor(k, 1, 0), l = anchor(k, -1, 0).c, r = a.c;
        return { c: [(l[0] + r[0]) / 2, (l[1] + r[1]) / 2 + dy, (l[2] + r[2]) / 2],
                 b: [a.r, a.u, a.t] };
      };
      const within = (k, s0, s1) => { const f = k / n; return f >= s0 && f <= s1; };

      // A big landform laid at 200 m+ can easily cover a DIFFERENT part of this
      // 4.1 km lap — the circuit folds back on itself hard, and the engine
      // silently DROPS any prop whose mass sits over the road (this file used
      // to lose one ridge off the back straight exactly that way). So every
      // world-space landform goes through the two helpers below: both road
      // edges are sampled once, at 3.9 m spacing, and a mass is stepped
      // further out until its footprint is clear of every one of them.
      const EDGE = [];
      for (let k = 0; k < n; k++) {
        const l = anchor(k, -1, 0).c, r = anchor(k, 1, 0).c;
        EDGE.push(l[0], l[2], r[0], r[2]);
      }
      const minEdge = (x, z) => {
        let m = Infinity;
        for (let i = 0; i < EDGE.length; i += 2) {
          const dx = EDGE[i] - x, dz = EDGE[i + 1] - z;
          const d = dx * dx + dz * dz;
          if (d < m) m = d;
        }
        return Math.sqrt(m);
      };
      // Clearance is measured on the DIAGONAL of the mass, not on its rotated
      // footprint: the engine's guard is stricter than a footprint test, and a
      // landform this size reads exactly the same 130 m further out.
      const ridgeAt = (k, side, dist, len, wid, h, col, dy) => {
        const rad = Math.hypot(len, wid) / 2 + 14;
        for (let t = 0; t < 8; t++) {
          const d = dist + t * 130;
          const a = anchor(k, side, d).c;
          if (minEdge(a[0], a[2]) < rad) continue;
          // Past the terrain grid terrainYAt is null; the road's own height at
          // k is a far better floor than absolute zero on a lap that climbs
          // and drops as hard as this one.
          const y = terrainYAt(a[0], a[2]);
          const y0 = y === null ? anchor(k, side, 0).c[1] : y;
          ridge(a[0], a[2], y0 + (dy === undefined ? -6 : dy),
                heading(k, side, d), len, wid, h, col);
          return true;
        }
        return false;
      };
      // Same idea for a summit: measured against this lap, a massif survives
      // once its centre clears the nearest tarmac by ~0.36 of its width.
      const massifAt = (k, side, dist, w, h, dy) => {
        for (let t = 0; t < 8; t++) {
          const d = dist + t * 220;
          const a = anchor(k, side, d).c;
          if (minEdge(a[0], a[2]) < w * 0.36) continue;
          const y = terrainYAt(a[0], a[2]);
          mountain(a[0], a[2], (y === null ? anchor(k, side, 0).c[1] : y) + dy, w, h, {});
          return true;
        }
        return false;
      };

      // Hardwood grows in STANDS, not salt-and-pepper: one hash per ~100 m of
      // lap decides whether this stretch of the edge is maple/birch or spruce.
      const stand = (k) => hash(Math.floor(k / 26) * 911 + 7);

      // ---------------------------------------------------------------- 2.
      // ARMCO. Continuous, both sides, the whole lap — there is nothing else
      // between a mistake and the trunks. (rows 0.090 / 0.330 / 0.456)
      for (const side of [-1, 1]) guardrail(0.0, 1.0, side, RAIL, ARMCO);
      // Doubled rail through the fastest, most exposed stretches.
      guardrail(0.300, 0.360, -1, RAIL + 1.6, ARMCO);   // downhill sweep, row 0.330
      guardrail(0.545, 0.600, -1, RAIL + 1.6, ARMCO);   // back straight, row 0.560
      guardrail(0.610, 0.660, 1, RAIL + 1.4, ARMCO);    // climbing 90s, row 0.626
      guardrail(0.820, 0.858, -1, RAIL + 1.5, ARMCO);   // Namerow, row 0.836

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
      // A grandstand or a spectator bank WANTS forest behind it, so the bands
      // below ignore CLEAR — except over the paddock apron, which is deep
      // enough to swallow them. Both the apron window in this file's own frame
      // and the one block 8 re-keys through sl() are held open, so the far
      // ranks stay out of the enclosure whichever way the line has moved.
      const paddock = (k) => {
        const f = k / n;
        return f >= 0.980 || f <= 0.068 || (f >= 0.690 && f <= 0.788);
      };

      // every(14) and a 15 m base, not every(9) and 4-7 m. THIS is the block
      // that made the circuit invisible — four ranks a side, starting inside the
      // verge, every 36 m of lap. The comment below calls it "ragged, not a
      // fence"; at 4 m it was a fence. Mont-Tremblant runs through forest, but
      // the trees begin past the barrier and the runoff.
      every(14, (k) => {
        const st = stand(k);
        for (const side of [-1, 1]) {
          if (blocked(k, side)) continue;
          const base = 15 + hash(k * 13 + (side + 2) * 91) * 4;     // 15-19 m
          const ranks = 3;
          for (let r = 0; r < ranks; r++) {
            const h = hash(k * 29 + r * 137 + (side + 2) * 61);
            if (r > 0 && h < 0.16) continue;            // ragged, not a fence
            const dist = base + r * 6.2 + h * 3.5;
            const a = anchor(k, side, dist);
            // 5 m of clearance, not 2.2: a trunk any closer to a fold of the
            // lap is what the engine's tree guard was dropping.
            if (onTrack(a.c[0], a.c[2], 5.0)) continue;
            // Hardwood takes the LIT edge inside a stand; spruce and fir hold
            // the rest and everything behind the first rank.
            const hw = r === 0 ? (st > 0.38 && h > 0.18)
                    : r === 1 ? (st > 0.50 && h > 0.55)
                    :           (st > 0.70 && h > 0.85);
            if (hw) tree(k, side, dist, 10 + h * 7, h < 0.55 ? HARD : HARD2);
            else    pine(k, side, dist, 11.5 + r * 1.8 + h * 12,
                         r === 0 ? (h < 0.4 ? PINE : PINE2) : (h < 0.5 ? PINE : PINE3));
          }
          // In a hardwood stand the wall has an UNDERSTORY too — young maple
          // and birch crowding the light at the rail, under the big trunks.
          const hu = hash(k * 311 + (side + 2) * 47);
          if (st > 0.46 && hu > 0.42) {
            const du = base + 1.4 + hu * 2.2;
            const au = anchor(k, side, du);
            if (!onTrack(au.c[0], au.c[2], 4.0))
              tree(k, side, du, 4.5 + hu * 3.5, hu < 0.7 ? HARD2 : HARD);
          }
          // Undergrowth at the foot of the wall: the ditch is never bare.
          const hb = hash(k * 7 + side);
          if (hb > 0.58) {
            const bd = base - 1.0;
            const ab = anchor(k, side, bd);
            if (!onTrack(ab.c[0], ab.c[2], 3.0)) bush(k, side, bd, hb > 0.82 ? FERN : SCRUB);
          }
        }
      });

      // ---------------------------------------------------------------- 4.
      // DEPTH BEHIND THE WALL. Four ranks of trunks with daylight behind them
      // read as a flat, and this lap is enclosed on BOTH sides for most of its
      // length — what sells the Laurentians is that the forest keeps going.
      // Three bands, each stepping back, lighter and taller, all in pine and
      // ridge so the depth is free in prop verts (see COST MODEL above).

      // Band A, 17-48 m: the body of the wood, still legible as trunks.
      every(11, (k) => {
        for (const side of [-1, 1]) {
          if (blocked(k, side)) continue;
          // Row 0.560: the outfield over the Hump is the ONE place the lap
          // breathes — block 15 sets the treeline there and this band keeps off.
          if (side === -1 && within(k, 0.546, 0.598)) continue;
          const h = hash(k * 53 + (side + 2) * 17);
          if (h < 0.09) continue;
          const ranks = h > 0.48 ? 3 : 2;
          for (let r = 0; r < ranks; r++) {
            const dist = 17.5 + r * 10.5 + h * 9;
            const a = anchor(k, side, dist);
            if (onTrack(a.c[0], a.c[2], 6)) continue;
            const g = hash(k * 97 + r * 31 + (side + 2) * 7);
            if (g > 0.78 && stand(k) > 0.44)
              tree(k, side, dist, 12 + g * 9, g < 0.89 ? HARD : HARD2);
            else
              pine(k, side, dist, 15 + r * 2.2 + h * 11, r % 2 ? PINE3 : PINE2);
          }
        }
      });

      // Band B, 55-125 m: canopy only — tall, sparse, hazier. This is the band
      // that shows over the near ranks from the crests.
      every(23, (k) => {
        for (const side of [-1, 1]) {
          if (paddock(k) && side === 1) continue;
          // Row 0.150 is skyline, not roadside: nothing in the middle distance
          // on the infield where the massif has to show over the T1 crest.
          if (side === 1 && within(k, 0.126, 0.188)) continue;
          const h = hash(k * 131 + (side + 2) * 37);
          if (h < 0.10) continue;
          for (let r = 0; r < 3; r++) {
            const g = hash(k * 191 + r * 59 + (side + 2) * 13);
            if (g < 0.15) continue;
            const dist = 56 + r * 24 + g * 18;
            const a = anchor(k, side, dist);
            if (onTrack(a.c[0], a.c[2], 8)) continue;
            pine(k, side, dist, 19 + r * 2.5 + g * 13, g < 0.5 ? PINE3 : PINE2);
          }
        }
      });

      // Band C, 200 m+: the wooded hills the circuit is cut into. Low masses,
      // graded near-to-far in colour so the distance reads, every one of them
      // footprint-checked against the folds of the lap (ridgeAt).
      for (let i = 0; i < 46; i++) {
        const f = (i + 0.5) / 46;
        const k = K(f);
        const side = i % 2 ? -1 : 1;
        const h = hash(i * 257 + 11);
        if (h < 0.12) continue;
        ridgeAt(k, side, 210 + h * 120, 300 + h * 180, 130 + h * 70,
                34 + h * 34, h < 0.5 ? HILL : HILL2, -8);
      }
      // A further, hazier tier so the horizon is not one hard step.
      for (let i = 0; i < 18; i++) {
        const k = K((i + 0.35) / 18);
        const side = i % 2 ? 1 : -1;
        const h = hash(i * 419 + 3);
        ridgeAt(k, side, 520 + h * 260, 620 + h * 320, 230 + h * 110,
                62 + h * 52, HAZE, -10);
      }

      // ---------------------------------------------------------------- 5.
      // BULK FOREST EDGE. Named by the brief where the treeline must read as
      // continuous and unbroken: it closes the moment the start stand ends
      // (row 0.020), runs the whole downhill sweep with nothing built at all
      // (row 0.330), walks up to both Bridge abutments (row 0.776), and holds
      // the outfield to the line past Paddock Bend (row 0.897).
      // GAP 15-19 m, not 4.0-5.5. A 2026-09-15 visual pass found the circuit
      // completely invisible behind these belts: a 4.5 m gap puts the trunks
      // inside the runoff, so the canopy fills the camera from every roadside
      // view. Mont-Tremblant is carved through forest, but the treeline stands
      // beyond the verge, not on it. `spacing` thins them from the 4 m default
      // (which was silently ignored before the forestEdge fix) to a woodland
      // that you can see the track through.
      forestEdge(0.036, 0.088, -1, 17, { spacing: 13 });
      forestEdge(0.290, 0.398, -1, 16, { spacing: 13 });
      forestEdge(0.430, 0.500, -1, 15, { spacing: 12 });
      forestEdge(0.505, 0.552, -1, 18, { spacing: 14 });
      forestEdge(0.660, 0.770, -1, 17, { spacing: 13 });
      forestEdge(0.660, 0.770, 1, 19, { spacing: 14 });
      forestEdge(0.782, 0.828, -1, 16, { spacing: 13 });
      forestEdge(0.782, 0.828, 1, 18, { spacing: 14 });
      forestEdge(0.900, 0.985, -1, 17, { spacing: 13 });

      // ---------------------------------------------------------------- 6.
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
        // The cut is through Laurentian granite: blasted rock steps out of the
        // bank where the earth has washed off it. Boxes, laid on the road
        // basis, so they step along the cutting instead of facing the camera.
        for (let i = 0; i < 9; i++) {
          const s = ES0 + 0.004 + ((i + 0.5) / 9) * (ES1 - ES0 - 0.008);
          const k = K(s);
          const h = hash(i * 173 + (side + 2) * 29);
          const a = anchor(k, side, 7.5 + h * 3.2);
          const y = terrainYAt(a.c[0], a.c[2]);
          if (y === null) continue;
          addBox(out, [a.c[0], y + 1.1 + h * 1.4, a.c[2]],
                 [2.6 + h * 2.2, 2.4 + h * 2.6, 5.0 + h * 4.0],
                 h < 0.5 ? ROCK : ROCK2, [a.r, a.u, a.t]);
        }
      }
      // every(13) and 16 m out. The original comment below said these sat
      // "right on top of the rail" at 4.6 m — accurate, and that is the defect:
      // the 2026-09-15 pass showed nothing of the circuit but trunks. The forest
      // stays; it stands back from the barrier now.
      every(13, (k) => {
        if (!within(k, ES0, ES1)) return;
        for (const side of [-1, 1]) {
          const h = hash(k * 41 + (side + 2) * 23);
          const dist = 16 + h * 4;                    // beyond the rail and the verge
          const a = anchor(k, side, dist);
          if (!onTrack(a.c[0], a.c[2], 1.0)) {
            tree(k, side, dist, 17 + h * 8, h < 0.5 ? HARD : HARD2);
          }
          const d2 = 23 + h * 5;
          const b = anchor(k, side, d2);
          if (!onTrack(b.c[0], b.c[2], 1.2)) pine(k, side, d2, 19 + h * 9, PINE);
          // Ferns and scrub hold the foot of the bank in the damp of the cut.
          if (h > 0.55) {
            const d3 = 5.6 + h * 1.2;
            const c = anchor(k, side, d3);
            if (!onTrack(c.c[0], c.c[2], 1.0)) bush(k, side, d3, h > 0.8 ? FERN : SCRUB);
          }
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
      // A second, thinner layer of crown a little higher and offset, so the
      // tunnel has a ragged underside rather than one flat lid.
      for (let i = 0; i < 11; i++) {
        const s = ES0 + 0.003 + ((i + 0.5) / 11) * (ES1 - ES0 - 0.006);
        const k = K(s);
        const h = hash(i * 211 + 5);
        const o = overRoad(k, 13.0 + h * 3.0);
        addBox(out, o.c, [12 + h * 9, 1.2 + h * 0.9, 6 + h * 4], CANOPY, o.b);
      }

      // ---------------------------------------------------------------- 7.
      // THE SKI MOUNTAIN (rows 0.150 and 0.560). Skyline, not roadside: world
      // x/z taken far off the infield shoulder so the mass sits over the crest
      // before Turn 1 and shows again above the treeline off the back straight.
      // The massif is not a cone — a summit, a lower north shoulder, and the
      // foothills STEPPED in front of it so the eye reads the distance.
      const mk = K(0.150);
      const mfar = anchor(mk, 1, 1450).c;
      mountain(mfar[0], mfar[2], terrainYAt(mfar[0], mfar[2]) - 30, 2300, 690, {});
      const mk2 = K(0.105);
      const mf2 = anchor(mk2, 1, 2100).c;
      mountain(mf2[0], mf2[2], terrainYAt(mf2[0], mf2[2]) - 25, 1500, 430, {});
      // The shoulder: a broader, lower mass set beside the summit so the
      // silhouette has a saddle in it instead of a single peak.
      massifAt(K(0.196), 1, 2000, 1850, 470, -28);
      // Lower wooded ridges stepped in front of the summit, near ones darker.
      for (let i = 0; i < 7; i++) {
        const k = K(0.108 + i * 0.016);
        const h = hash(i * 311);
        ridgeAt(k, 1, 480 + i * 105, 430 + h * 120, 150 + h * 60,
                74 + i * 9 + h * 34, i < 3 ? HILL : (i < 5 ? HILL2 : HAZE), -6);
      }
      // The base of the hill: two broad shoulders standing IN FRONT of the
      // summit in the lighter, yellower green of cut and grassed ski runs, so
      // the massif reads as the mountain the circuit is named after and not as
      // a green cone. (Painting trails onto the flank is not something this
      // emitter set can do — a slab on the face would read as a shelf — so the
      // colour break goes on a layer that is genuinely in front of it.)
      ridgeAt(K(0.138), 1, 900, 540, 210, 155, TRAIL, -6);
      ridgeAt(K(0.168), 1, 1010, 430, 180, 190, HILL2, -6);
      // And the same mass read from the back straight (row 0.560), where the
      // trees pull back and the lap finally breathes.
      const bk = K(0.560);
      const bfar = anchor(bk, -1, 1600).c;
      mountain(bfar[0], bfar[2], terrainYAt(bfar[0], bfar[2]) - 25, 1700, 470, {});
      for (let i = 0; i < 5; i++) {
        const k = K(0.534 + i * 0.020);
        const h = hash(i * 617);
        ridgeAt(k, -1, 430 + i * 130, 380 + h * 140, 130 + h * 60,
                52 + i * 11 + h * 26, i < 2 ? HILL : (i < 4 ? HILL2 : HAZE), -5);
      }

      // ---------------------------------------------------------------- 8.
      // RE-KEYED THROUGH sl(). The start line moved onto a straight (def
      // startFrac) because the grid had been laid through a 104 m corner, and
      // sceneryStartFrac holds the rest of this file on its real corners —
      // Namerow, the Esses and the ski-mountain framing must not travel with
      // the line. The paddock and the start-line stand belong AT the line, so
      // these two blocks alone are shifted.
      // 1 - def._sceneryShift, baked by buildCenterline before scenery() runs, at
      // the 4 dp the props were placed against (a literal 0.7166 until 2026-09-22:
      // the unrounded value flips a few K() nodes at Brands Hatch, so the rounding
      // keeps today's geometry while a retuned startFrac still moves the props).
      const SL = Math.round((1 - api.def._sceneryShift) * 1e4) / 1e4;
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
      // The wood starts again the moment the apron does: spruce closing the
      // back of the paddock so the clearing has a wall, not an horizon.
      every(12, (k) => {
        const f = k / n, s0 = sl(0.975), s1 = sl(0.066);
        const inw = s0 < s1 ? (f >= s0 && f <= s1) : (f >= s0 || f <= s1);
        if (!inw) return;
        const h = hash(k * 149);
        for (let r = 0; r < 2; r++) {
          const dist = 62 + r * 15 + h * 12;
          const a = anchor(k, 1, dist);
          if (onTrack(a.c[0], a.c[2], 7)) continue;
          pine(k, 1, dist, 17 + r * 3 + h * 10, r ? PINE3 : PINE2);
        }
      });

      // ---------------------------------------------------------------- 9.
      // START LINE OUTSIDE (row 0.020). One grandstand bank with armco hard in
      // front of it — one of only two real gaps in the treeline all lap.
      grandstandEx(sl(0.020), -1, 7, 110, null, null);
      guardrail(sl(0.008), sl(0.040), -1, 2.6, ARMCO);
      billboard(K(sl(0.038)), -1, 9, 9, 3, [0.80, 0.16, 0.16]);
      // Forest stands right behind the stand's back wall — the gap in the
      // treeline is the STAND, not a field.
      every(12, (k) => {
        const f = k / n, s0 = sl(0.010), s1 = sl(0.036);
        const inw = s0 < s1 ? (f >= s0 && f <= s1) : (f >= s0 || f <= s1);
        if (!inw) return;
        const h = hash(k * 157 + 3);
        for (let r = 0; r < 2; r++) {
          const dist = 34 + r * 13 + h * 9;
          const a = anchor(k, -1, dist);
          if (onTrack(a.c[0], a.c[2], 6)) continue;
          pine(k, -1, dist, 18 + r * 3 + h * 10, r ? PINE3 : PINE);
        }
      });

      // --------------------------------------------------------------- 10.
      // TURN 1, apex on the crest (row 0.181). Marshal post and a short tyre
      // wall inside; the billboard stays LOW so the blind downhill exit is not
      // given away from the approach.
      marshalPost(K(0.175), 1, 6);
      tyreWall(0.176, 0.190, 1, 5, TYRE);
      billboard(K(0.170), 1, 8, 6, 1.8, [0.18, 0.34, 0.72]);
      // Nothing tall on the crest itself: the exit stays blind. Scrub only.
      every(9, (k) => {
        if (!within(k, 0.178, 0.196)) return;
        const h = hash(k * 233);
        if (h < 0.45) return;
        const d = 5.0 + h * 2.0;
        const a = anchor(k, 1, d);
        if (onTrack(a.c[0], a.c[2], 2.0)) return;
        bush(k, 1, d, h > 0.78 ? FERN : SCRUB);
      });

      // --------------------------------------------------------------- 11.
      // ESSES EXIT (row 0.255). Dirt and gravel spill on the inside where cars
      // run wide, a marshal post, then mixed ranks straight back to the rail.
      groundPatch(K(0.255), 1, 7, [22, 0.30, 34], DIRT);
      groundPatch(K(0.266), 1, 9, [16, 0.26, 22], [0.42, 0.38, 0.31]);
      groundPatch(K(0.248), 1, 6, [10, 0.24, 16], [0.40, 0.35, 0.26]);
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

      // --------------------------------------------------------------- 12.
      // T4 INSIDE (row 0.412). Armco plus a tyre wall on the apex and a small
      // natural spectator bank further in; forest resumes right behind it.
      guardrail(0.400, 0.428, 1, 2.8, ARMCO);
      tyreWall(0.406, 0.420, 1, 5, TYRE);
      spectatorHill(0.399, 0.424, 1, 16, {});
      fence(0.398, 0.426, 1, 9.5, 2.2, [0.62, 0.64, 0.66]);   // debris fence below the bank
      marshalPost(K(0.404), 1, 7);
      every(12, (k) => {
        if (!within(k, 0.396, 0.428)) return;
        const h = hash(k * 43);
        for (let r = 0; r < 2; r++) {
          const dist = 34 + r * 14 + h * 10;
          const a = anchor(k, 1, dist);
          if (onTrack(a.c[0], a.c[2], 5)) continue;
          pine(k, 1, dist, 15 + r * 3 + h * 10, r ? PINE3 : PINE);
        }
      });

      // --------------------------------------------------------------- 13.
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
        if (h > 0.6) {
          const d = 3.8 + h * 0.8;
          const a = anchor(k, -1, d);
          if (!onTrack(a.c[0], a.c[2], 1.0)) bush(k, -1, d, FERN);
        }
      });

      // --------------------------------------------------------------- 14.
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
        for (let r = 0; r < 4; r++) {
          const dist = 4.2 + r * 5.5 + h * 2.4;
          const a = anchor(k, -1, dist);
          if (onTrack(a.c[0], a.c[2], 1.0)) continue;
          pine(k, -1, dist, 16 + r * 1.6 + h * 11, r % 2 ? PINE2 : PINE);
        }
      });

      // --------------------------------------------------------------- 15.
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

      // --------------------------------------------------------------- 16.
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
          for (let r = 0; r < 3; r++) {
            const dist = 4.2 + r * 5.0 + h * 2.2;
            const a = anchor(k, side, dist);
            if (onTrack(a.c[0], a.c[2], 1.0)) continue;
            pine(k, side, dist, 15 + r * 2.0 + h * 11, r % 2 ? PINE2 : PINE);
          }
        }
      });

      // --------------------------------------------------------------- 17.
      // THE BRIDGE (row 0.776). A service crossing: two squat building blocks
      // either side of the rail with the deck spanning between them, so the
      // road is framed and briefly darkened. forestEdge runs up to both (§4).
      const BR = K(0.776);
      building(BR, 1, 7.5, 9, 6.5, 14, { wall: CONC, roof: ROOF });
      building(BR, -1, 7.5, 9, 6.5, 14, { wall: CONC, roof: ROOF });
      const bdk = overRoad(BR, 7.2);
      addBox(out, bdk.c, [34, 1.8, 8.0], CONC, bdk.b);
      const bp = overRoad(BR, 8.7);
      addBox(out, bp.c, [34, 1.0, 8.8], ROOF, bp.b);
      // Wing walls stepping down off each abutment, upstream and downstream,
      // so the crossing sits in an embankment instead of on two loose blocks.
      for (const side of [-1, 1]) {
        for (const j of [-1, 1]) {
          for (let i = 0; i < 2; i++) {
            const k = (BR + j * (4 + i * 4) + n) % n;
            const a = anchor(k, side, 8.0 + i * 1.6);
            const y = terrainYAt(a.c[0], a.c[2]);
            if (y === null) continue;
            addBox(out, [a.c[0], y + 1.5 - i * 0.5, a.c[2]],
                   [2.2, 3.4 - i * 1.2, 7.0],
                   i ? ROCK : CONC, [a.r, a.u, a.t]);
          }
        }
      }
      guardrail(0.762, 0.792, 1, 3.0, ARMCO);
      guardrail(0.762, 0.792, -1, 3.0, ARMCO);
      marshalPost(K(0.766), 1, 9);

      // --------------------------------------------------------------- 18.
      // NAMEROW, the uphill hairpin (row 0.836). Tyre wall and marshal post on
      // the outside, a spectator hill on the natural bank above, tree ranks
      // over the top of the bank.
      tyreWall(0.828, 0.848, -1, 5, TYRE);
      marshalPost(K(0.832), -1, 9);
      spectatorHill(0.826, 0.852, -1, 15, {});
      fence(0.824, 0.854, -1, 8.5, 2.2, [0.62, 0.64, 0.66]);  // below the bank
      every(9, (k) => {
        if (!within(k, 0.820, 0.860)) return;
        const h = hash(k * 89);
        const dist = 32 + h * 12;
        const a = anchor(k, -1, dist);
        if (onTrack(a.c[0], a.c[2], 2)) return;
        tree(k, -1, dist, 12 + h * 8, h < 0.5 ? HARD : HARD2);
        if (h > 0.6) pine(k, -1, dist + 9, 16 + h * 8, PINE);
      });
      // Depth over the top of the bank, so the sweeper is framed by wood and
      // not by sky: two more ranks stepping back from the spectators.
      every(12, (k) => {
        if (!within(k, 0.814, 0.866)) return;
        const h = hash(k * 269 + 5);
        for (let r = 0; r < 2; r++) {
          const dist = 54 + r * 17 + h * 12;
          const a = anchor(k, -1, dist);
          if (onTrack(a.c[0], a.c[2], 7)) continue;
          pine(k, -1, dist, 19 + r * 3 + h * 11, r ? PINE3 : PINE2);
        }
      });

      // --------------------------------------------------------------- 19.
      // PADDOCK BEND onto the pit straight (row 0.897). Paddock side gets the
      // second stand, a motorhome or two behind the fence and a billboard on
      // the exit; the outfield stays forest right to the line (§4).
      grandstandEx(0.897, 1, 10, 84, null, null);
      fence(0.884, 0.934, 1, 8, 2.4, [0.62, 0.64, 0.66]);
      motorhome(K(0.906), 1, 26, 11, 4.6, 16, { wall: VAN_B, window: GLASS });
      motorhome(K(0.918), 1, 26, 11, 4.6, 16, { wall: VAN_A, window: GLASS });
      billboard(K(0.934), 1, 11, 9, 3, [0.82, 0.20, 0.14]);
      cameraTower(K(0.890), 1, 13, {});
      // ...and spruce closing behind the paddock enclosure again.
      every(12, (k) => {
        if (!within(k, 0.880, 0.936)) return;
        const h = hash(k * 307 + 9);
        for (let r = 0; r < 2; r++) {
          const dist = 46 + r * 16 + h * 11;
          const a = anchor(k, 1, dist);
          if (onTrack(a.c[0], a.c[2], 7)) continue;
          pine(k, 1, dist, 18 + r * 3 + h * 10, r ? PINE3 : PINE2);
        }
      });

      // --------------------------------------------------------------- 20.
      // MARSHAL POSTS. The only man-made punctuation for several hundred
      // metres through the fast downhill sweep (row 0.330), plus a sparse ring
      // elsewhere so the lap is always covered.
      for (const s of [0.306, 0.330, 0.354, 0.378]) marshalPost(K(s), -1, 6);
      for (const s of [0.062, 0.120, 0.220, 0.446, 0.700, 0.740, 0.870, 0.960])
        marshalPost(K(s), 1, 8);
  };
