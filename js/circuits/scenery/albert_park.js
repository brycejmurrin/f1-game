/* Apex 26 — ALBERT_PARK scenery (data only), split out of js/circuits/albert_park.js.
   LAZY_SCENERY (tools/manifest.cjs): no <script> tag. game.js fetches the ONE
   circuit a session builds; all 40 together were 1,083 KB of the boot wall for
   a player who races one of them. Body moved verbatim — see tools/manifest.cjs
   and tests/unit/load-order.test.mjs for the lockstep. */
"use strict";
(window.TrackScenery = window.TrackScenery || {})["albert_park"] =
  function (api) {
      const { out, n, px, pz, pyMin, place, prop, backdrop, waterSurface, groundPatch, modelGroup, groundYAt,
              every, hash, onTrack,
              grandstandEx, building, motorhome, tower, tree, palm, bush, hedge, billboard, gantry,
              marshalPost, fence, guardrail, tyreWall, anchor, vadd, addBox,
              addCyl, addCone, addFrustum, addPrism, addPyramid,
              forestEdge, cityFront, bowlSeatWall, MAT, circuitKit, seat,
              cameraTower, recordBarrier, track } = api;
      const k = (s) => Math.round(s * n) % n;

      if (circuitKit) {
        circuitKit.marshalShelter({
          id: "kit:albert_park:marshal-shelter", frac: 0.72,
          side: 1, gap: 20, size: [6, 3, 5], required: true,
        });
        circuitKit.recoveryBay({
          id: "kit:albert_park:recovery-bay", frac: 0.70,
          side: 1, gap: 32, size: [12, 5, 18], required: true,
        });
        circuitKit.trackSigns({
          id: "kit:albert_park:track-signs", frac: 0.88,
          side: 1, gap: 22, size: [3, 3, 42], count: 6, required: true,
        });
        circuitKit.hospitality({
          id: "kit:albert_park:lakeside-hospitality", frac: 0.635,
          side: 1, gap: 38, size: [20, 9, 38], modules: 5,
        });
        circuitKit.serviceCompound({
          id: "kit:albert_park:pit-entry-service", frac: 0.965,
          side: -1, gap: 42, size: [24, 6, 34], vehicles: 7,
        });
      }

      const GRASS  = [0.32, 0.62, 0.28];
      const WATER  = [0.20, 0.45, 0.62];
      const WHITE  = [0.92, 0.92, 0.92], RED = [0.80, 0.15, 0.15];
      {
        const a = anchor(k(0.145), 1, 62);
        if (!onTrack(a.c[0], a.c[2], 30)) {
          const b = [a.r, a.u, a.t];
          const PALE  = [0.86, 0.86, 0.84];
          const PALE_D = [0.74, 0.75, 0.74];
          const GLASS = [0.40, 0.52, 0.60];
          const TRIM  = [0.24, 0.40, 0.52];
          modelGroup("albert-msac", {
            center: vadd(a.c, a.u, 10), size: [46, 24, 108], basis: b,
          }, (stage) => {
            // Main hall, glazed along the park frontage.
            stage._mat = MAT.CONCRETE;
            addBox(stage, vadd(a.c, a.u, 5.6), [34, 11.2, 92], PALE, b);
            stage._mat = MAT.GLASS;
            addBox(stage, vadd(vadd(a.c, a.r, -17.2), a.u, 6.2), [0.6, 7.2, 78], GLASS, b);
            stage._mat = MAT.CONCRETE;
            addBox(stage, vadd(vadd(a.c, a.r, -17.6), a.u, 2.2), [0.5, 1.0, 80], TRIM, b);
            // The vault runs ALONG the 92 m hall, so its axis — addCyl's SECOND
            // basis vector, the one a vertical pole puts on a.u — must be a.t.
            // As [a.u, a.r, a.t] the axis was a.r and the tube extruded 92 m
            // sideways across the park instead of roofing the hall under it.
            addCyl(stage, vadd(a.c, a.u, 10.4), 8.2, 92, PALE_D, 12,
                   [a.u, a.t, a.r]);
            addBox(stage, vadd(a.c, a.u, 11.4), [36, 0.5, 93], PALE_D, b);
            // Diving hall — the tall blank box breaking the roofline.
            const dc = vadd(a.c, a.t, -38);
            addBox(stage, vadd(dc, a.u, 10.5), [26, 21, 24], PALE, b);
            addBox(stage, vadd(dc, a.u, 21.4), [27, 1.0, 25], PALE_D, b);
            addBox(stage, vadd(vadd(dc, a.r, -13.2), a.u, 14.5), [0.5, 8.0, 18], GLASS, b);
            // Entry canopy on slim columns at the near end.
            const ec = vadd(a.c, a.t, 44);
            addBox(stage, vadd(vadd(ec, a.r, -19), a.u, 4.6), [10, 0.5, 20], TRIM, b);
            for (const t of [-8, 0, 8]) {
              addCyl(stage, vadd(vadd(ec, a.r, -23), a.t, t), 0.24, 4.6, PALE_D, 6, b);
            }
            stage._mat = 0;
          });
        }
      }

      waterSurface(k(0.38), -1, 120, [860, 0.2, 860], [0.18, 0.38, 0.56],
                   { id: "albert-lake-west" });
      waterSurface(k(0.58), -1, 110, [820, 0.2, 820], [0.18, 0.38, 0.56],
                   { id: "albert-lake-east" });
      // Shoreline transition zones — lighter, shimmer-edge tones
      waterSurface(k(0.50), -1, 55, [340, 0.12, 48], [0.26, 0.48, 0.64],
                   { id: "albert-shore-east" });
      waterSurface(k(0.48), -1, 42, [380, 0.12, 60], [0.28, 0.52, 0.66],
                   { id: "albert-shore-west" });
      // Infield water wrap (interior of circuit perimeter) — muted mid-tone
      for (let i = 0; i < 4; i++) {
        const s = 0.30 + (i / 4) * 0.30;
        waterSurface(k(s), -1, 115 + i * 8, [220, 0.16, 170], [0.22, 0.38, 0.52],
                     { id: `albert-lake-infield-${i}` });
      }

      for (let j = 0; j < 6; j++) {
        const a = anchor((k(0.47 + j * 0.025) + j * 15) % n, -1, 54 + hash(j * 7) * 32);
        if (onTrack(a.c[0], a.c[2], 3)) continue;
        addBox(out, vadd(a.c, a.u, 0.8), [1.8, 1.0, 8.5], [0.88, 0.85, 0.80], [a.r, a.u, a.t]);
        if (hash(j * 11) > 0.5)
          addCyl(out, vadd(a.c, a.t, -0.5), 0.08, 5.2, [0.40, 0.35, 0.28], 4, [a.r, a.u, a.t]);
      }

      const lakeFountain = (kk, dist, scale) => {
        const p = anchor(kk, -1, dist), b = [p.r, p.u, p.t];
        if (onTrack(p.c[0], p.c[2], 6)) return;
        const c = [p.c[0], pyMin - 0.8, p.c[2]];
        const JET = [0.92, 0.95, 0.99];      // white spray
        modelGroup(`albert-lake-fountain-${kk}`, {
          center: vadd(c, p.u, 9 * scale),
          size: [34 * scale, 19 * scale, 34 * scale],
          basis: b,
        }, (stage) => {
          stage._mat = MAT.CONCRETE;
          addCyl(stage, c, 6 * scale, 0.7, [0.82, 0.84, 0.86], 18, b);
          stage._mat = 0;
          addCyl(stage, vadd(c, p.u, 0.7), 5.2 * scale, 0.35, [0.24, 0.50, 0.66], 18, b);
          addCone(stage, vadd(c, p.u, 1.0), 1.7 * scale, 11 * scale, JET, 10, b);
          addCone(stage, vadd(c, p.u, 8.5 * scale), 0.9 * scale, 7 * scale, JET, 8, b);
          addCone(stage, vadd(c, p.u, 13.5 * scale), 0.4 * scale, 4 * scale, JET, 6, b);
          for (let i = 0; i < 8; i++) {
            const a = i / 8 * 6.2832, rr = 3.6 * scale;
            const off = vadd(vadd(c, p.r, Math.cos(a) * rr), p.t, Math.sin(a) * rr);
            addCone(stage, vadd(off, p.u, 0.9), 0.55 * scale,
                    (4.5 + (i % 2) * 1.5) * scale, JET, 6, b);
          }
          for (const rr of [9, 12.5, 16]) {
            addFrustum(stage, vadd(c, p.u, 0.35), rr * scale, (rr + 0.5) * scale, 0.14,
                       [0.32, 0.54, 0.68], 22, b);
          }
        }, { required: true });
      };
      lakeFountain(k(0.46), 96, 1.4);    // hero fountain, mid-lake
      lakeFountain(k(0.56), 78, 0.85);   // smaller companion jet nearer shore

      for (const [s, dist, seed] of [[0.34, 68, 31], [0.47, 74, 47], [0.60, 66, 61]]) {
        const a = anchor(k(s), -1, dist), b = [a.r, a.u, a.t];
        modelGroup(`albert-shore-reeds-${seed}`, {
          center: vadd(a.c, a.u, 2.2),
          size: [15, 4.5, 15],
          basis: b,
        }, (stage) => {
          addFrustum(stage, vadd(a.c, a.u, 0.15), 6.2, 5.0, 0.45,
                     [0.24, 0.44, 0.22], 10, b);
          for (let j = 0; j < 7; j++) {
            const lateral = (hash(seed + j * 7) - 0.5) * 8;
            const along = (hash(seed + j * 11) - 0.5) * 8;
            const stem = vadd(vadd(a.c, a.r, lateral), a.t, along);
            addCyl(stage, vadd(stem, a.u, 0.35), 0.10, 2.1 + hash(seed + j * 13) * 1.2,
                   [0.34, 0.48, 0.20], 4, b);
            addCone(stage, vadd(stem, a.u, 2.1), 0.55, 1.0,
                    [0.42, 0.54, 0.24], 5, b);
          }
        });
      }

      {
        const a = anchor(k(0.50), -1, 40), b = [a.r, a.u, a.t];
        if (!onTrack(a.c[0], a.c[2], 4)) {
          out._mat = MAT.WOOD;
          addBox(out, vadd(a.c, a.u, 0.9), [3.2, 0.4, 34], [0.72, 0.66, 0.54], b); // deck
          for (const to of [-15, -5, 5, 15]) {                                     // piles
            addCyl(out, vadd(a.c, a.t, to), 0.16, 1.4, [0.42, 0.36, 0.28], 4, b);
          }
          out._mat = 0;
          // a rowing scull moored at the pier end
          addBox(out, vadd(vadd(a.c, a.t, 18), a.u, 0.7), [0.9, 0.5, 9], [0.90, 0.88, 0.82], b);
        }
      }

      for (const [s, dist, bw, th, mast, col] of [
        [0.42, 340, 28, 280, 48, [0.28, 0.36, 0.48]],  // Eureka-like — tallest + mast
        [0.46, 355, 32, 250,  0, [0.18, 0.20, 0.24]],  // Australia 108-like dark slab
        [0.38, 360, 24, 210, 22, [0.32, 0.40, 0.52]],  // western mid hero
        [0.50, 350, 22, 190, 18, [0.30, 0.38, 0.50]],  // eastern mid hero
        [0.44, 375, 20, 170, 12, [0.34, 0.42, 0.54]],  // depth filler behind Eureka
      ]) {
        tower(k(s), -1, dist, bw, th, { col, seg: 8,
          cap: true, capCol: [0.20, 0.26, 0.36], mast, mat: MAT.GLASS });
      }
      // Thin haze silhouette band — distant mid-rise depth, not a wall
      for (let i = 0; i < 6; i++) {
        const f = i / 5;
        const bh = 50 + hash(i * 13) * 70;
        const bw = 22 + hash(i * 9) * 18;
        backdrop(k(0.36 + f * 0.16), -1, 400 + hash(i * 5) * 50,
                 [bw, bh, 20],
                 [0.38 + hash(i * 7) * 0.06, 0.42 + hash(i * 3) * 0.05, 0.54 + hash(i * 11) * 0.05]);
      }
      for (let i = 0; i < 4; i++) {
        backdrop(k(0.35 + i * 0.055), -1, 455 + hash(80 + i) * 34,
                 [18 + hash(90 + i) * 12, 38 + hash(100 + i) * 28, 16],
                 [0.43, 0.47, 0.56]);
      }

      every(100, (kk) => {
        for (const side of [-1, 1]) {
          if (side === -1 && kk >= k(0.27) && kk <= k(0.65)) continue;
          const dist = 165 + hash(kk * 6 + side) * 60;
          const w    = 130 + hash(kk * 11 + side) * 60;  // 130–190 m footprint (wider, fewer)
          const h    =  24 + hash(kk * 17 + side) * 16;  // 24–40 m mound height
          // Green-dominant: col[1] > col[0] and col[1] > col[2]*1.05
          backdrop(kk, side, dist, [w, h, 90], [0.18, 0.38 + hash(kk * 23 + side) * 0.06, 0.20]);
        }
      });

      const EUC  = [0.30, 0.42, 0.28];   // grey-green eucalyptus
      const EUC2 = [0.34, 0.46, 0.30];   // slightly lighter canopy twin

      forestEdge(0.00, 0.10, -1, 11, {
        density: 0.45, hMin: 9, hMax: 16,
        col: EUC, col2: EUC2, pineFrac: 0,
      });

      forestEdge(0.00, 0.10, 1, 13, {
        density: 0.40, hMin: 8, hMax: 14,
        col: EUC, col2: EUC2, pineFrac: 0,
      });

      forestEdge(0.10, 0.27, -1, 9, {
        density: 0.60, hMin: 10, hMax: 17,
        col: EUC, col2: EUC2, pineFrac: 0,
      });
      forestEdge(0.10, 0.27, 1, 10, {
        density: 0.55, hMin: 9, hMax: 16,
        col: EUC, col2: EUC2, pineFrac: 0,
      });

      forestEdge(0.27, 0.65, 1, 13, {
        density: 0.45, hMin: 10, hMax: 17,
        col: EUC, col2: EUC2, pineFrac: 0,
      });

      forestEdge(0.27, 0.65, -1, 19, {
        density: 0.40, hMin: 11, hMax: 18,
        col: EUC, col2: EUC2, pineFrac: 0,
      });

      forestEdge(0.65, 0.85, -1, 9, {
        density: 0.70, hMin: 11, hMax: 19,
        col: EUC, col2: EUC2, pineFrac: 0,
      });
      forestEdge(0.65, 0.85, 1, 10, {
        density: 0.65, hMin: 10, hMax: 18,
        col: EUC, col2: EUC2, pineFrac: 0,
      });

      forestEdge(0.85, 1.00, -1, 9, {
        density: 0.45, hMin: 9, hMax: 15,
        col: EUC, col2: EUC2, pineFrac: 0,
      });
      forestEdge(0.85, 1.00, 1, 12, {
        density: 0.40, hMin: 8, hMax: 14,
        col: EUC, col2: EUC2, pineFrac: 0,
      });

      forestEdge(0.75, 0.82, -1, 11, {
        density: 0.70, hMin: 13, hMax: 20,
        col: EUC2, col2: [0.36, 0.48, 0.32], pineFrac: 0,
      });
      forestEdge(0.75, 0.82, 1, 12, {
        density: 0.65, hMin: 12, hMax: 19,
        col: EUC2, col2: [0.36, 0.48, 0.32], pineFrac: 0,
      });

      forestEdge(0.12, 0.25, 1, 27, {
        density: 0.30, hMin: 13, hMax: 20,
        col: EUC, col2: EUC2, pineFrac: 0,
      });
      forestEdge(0.68, 0.84, -1, 26, {
        density: 0.34, hMin: 14, hMax: 21,
        col: EUC, col2: EUC2, pineFrac: 0,
      });

      every(60, (kk) => {
        for (const side of [-1, 1]) {
          if (side === -1 && kk >= k(0.27) && kk <= k(0.65)) continue; // keep lake sightline open
          if (hash(kk * 53 + side) > 0.45) continue;
          const dist = 34 + hash(kk * 57 + side) * 44;
          tree(kk, side, dist, 13 + hash(kk * 61 + side) * 8, EUC);
        }
      });

      for (let j = 0; j < 10; j++) {
        const kk = (k(0.52) + j * 2) % n;
        palm(kk, -1, 15 + hash(kk * 9 + j) * 8, 12 + hash(kk * 12 + j) * 4, [0.21, 0.47, 0.25]);
      }
      const AVENUE = [0.30, 0.46, 0.22];
      for (let j = 0; j < 3; j++) {
        tree((k(0.0) + j * 3) % n, 1, 20 + j * 7, 13 + hash(j * 3) * 3, AVENUE);
        tree((k(0.94) + j * 3) % n, 1, 20 + j * 7, 12 + hash(j * 5) * 3, AVENUE);
      }

      const WBOARD = [0.75, 0.72, 0.62];
      const boathouse = (kk, side, gap, seed) => {
        const w = 16, wallH = 3.4, roofH = 1.8, d = 20;
        const a = anchor(kk, side, gap + w / 2), b = [a.r, a.u, a.t];
        modelGroup(`albert-boathouse-${seed}`, {
          center: vadd(a.c, a.u, (wallH + roofH) / 2),
          size: [w + 2, wallH + roofH + 0.4, d + 6],   // +6 on depth covers the ramp
          basis: b,
        }, (stage) => {
          stage._mat = MAT.WOOD;
          addBox(stage, vadd(a.c, a.u, wallH / 2), [w, wallH, d], WBOARD, b);
          addPrism(stage, vadd(a.c, a.u, wallH), [w + 0.8, roofH, d + 1.2],
                   [0.30, 0.28, 0.26], b);                       // pitched roof
          // Boat-bay door on the lake-facing wall
          addBox(stage, vadd(vadd(a.c, a.u, wallH * 0.42), a.r, -side * (w / 2 - 0.05)),
                 [0.15, wallH * 0.72, d * 0.55], [0.20, 0.19, 0.17], b);
          // Timber launch ramp down toward the water
          addBox(stage, vadd(vadd(a.c, a.u, -0.35), a.r, -side * (w / 2 + 3)),
                 [5.5, 0.3, 6], [0.55, 0.48, 0.36], b);
          stage._mat = 0;
          // A couple of upturned hulls resting beside the shed
          for (let i = 0; i < 2; i++) {
            const off = vadd(vadd(a.c, a.t, -d / 2 - 2 - i * 2.6), a.r, side * (2 + i * 1.5));
            addPrism(stage, vadd(off, a.u, 0.32), [1.5, 0.65, 7.2], [0.60, 0.30, 0.22], b);
          }
        });
      };
      boathouse(k(0.40), -1, 26, 0);
      boathouse(k(0.44), -1, 30, 1);

      {
        const kk = k(0.645), gapShell = 36;
        const a = anchor(kk, 1, gapShell), b = [a.r, a.u, a.t];
        modelGroup("albert-lakeside-stadium", {
          center: vadd(a.c, a.u, 4.0),
          size: [14, 9, 64],
          basis: b,
        }, (stage) => {
          // Slim single-tier stand shell along the pitch's far side
          addBox(stage, vadd(a.c, a.u, 1.6), [8, 3.2, 60], [0.90, 0.90, 0.91], b);
          const segN = 9;
          for (let i = 0; i < segN; i++) {
            const f = (i + 0.5) / segN - 0.5;              // -0.5 .. 0.5 along length
            const arc = 1 - f * f * 4;                      // parabolic arc profile
            const liftY = 4.4 + Math.max(0, arc) * 3.2;
            const off = f * 58;
            addBox(stage, vadd(vadd(a.c, a.t, off), a.u, liftY),
                   [9.5, 0.4, 60 / segN + 0.6], [0.94, 0.95, 0.97], b);
          }
          // Support pylons under the roof
          for (const off of [-24, -8, 8, 24]) {
            addCyl(stage, vadd(a.c, a.t, off), 0.3, 4.4, [0.60, 0.61, 0.63], 6, b);
          }
        }, { required: true, maxVertices: 6000 });
      }
      groundPatch(k(0.645), 1, 17, [30, 0.12, 66], [0.22, 0.50, 0.24],
                  { id: "albert-lakeside-stadium-pitch", samples: 8 });

      grandstandEx(0.00, -1, 14, 90, null, null,             // Brabham — hero main stand
        { livery: "steel", tiers: 2, roof: "cantilever", suites: true, endWalls: true, pylons: true });
      grandstandEx(0.07, -1, 14, 60, null, null,              // Fangio — pit-straight extension
        { livery: "pastel", roof: "flat" });
      grandstandEx(0.04,  1, 14, 55, null, null,               // Hill — Turn 1-2 sweep
        { livery: "alu", roof: "truss", pylons: true });
      grandstandEx(0.12,  1, 16, 48, null, null,               // Waite — Turn 3 exit
        { livery: "steel", roof: "cantilever" });
      grandstandEx(0.30, -1, 16, 50, null, null,               // lakeside spectator bank
        { livery: "pastel", roof: "flat" });
      grandstandEx(0.55, -1, 16, 55, null, null,               // Ricciardo — Lakeside Drive
        { livery: "steel", roof: "truss", endWalls: true });
      grandstandEx(0.62,  1, 14, 60, null, null,               // Webber — spectator grandstand
        { livery: "pastel", tiers: 2, roof: "cantilever", suites: true });
      grandstandEx(0.66,  1, 16, 45, null, null,               // adjoining spectator bank
        { livery: "alu", roof: "flat" });
      grandstandEx(0.78, -1, 14, 45, null, null,               // chicane complex
        { livery: "steel", roof: "cantilever" });
      grandstandEx(0.90,  1, 18, 50, null, null,               // fan-hill grandstand
        { livery: "alu", roof: "cantilever", pylons: true });
      grandstandEx(0.95, -1, 16, 48, null, null,               // pit-approach bank
        { livery: "pastel", roof: "flat" });
      grandstandEx(0.20,  1, 16, 46, null, null,               // fast-section stand
        { livery: "steel", roof: "cantilever" });
      grandstandEx(0.45, -1, 16, 44, null, null,               // lakeside bank
        { livery: "alu", roof: "truss" });

      bowlSeatWall(0.145, 0.205, -1, 18, {
        h: 4.8, thick: 3.2, shell: [0.50, 0.51, 0.54], step: 10,
        crowdCols: [[0.82, 0.22, 0.18], [0.92, 0.78, 0.24], [0.22, 0.46, 0.72]],
      });
      bowlSeatWall(0.755, 0.815, 1, 18, {
        h: 5.2, thick: 3.4, shell: [0.48, 0.49, 0.52], step: 9,
        crowdCols: [[0.86, 0.24, 0.18], [0.88, 0.86, 0.82], [0.18, 0.52, 0.36]],
      });

      {
        const aP = anchor(k(0.0), 1, 16), bP = [aP.r, aP.u, aP.t];
        modelGroup("albert-pit-complex", {
          center: vadd(aP.c, aP.u, 11),
          size: [26, 30, 190],
          basis: bP,
        }, (stage) => {
          const aG = anchor(k(0.0), 1, 12), bG = [aG.r, aG.u, aG.t];
          stage._mat = MAT.CONCRETE;
          addBox(stage, vadd(aG.c, aG.u, 3.6), [14, 7.2, 180], [0.88, 0.89, 0.91], bG);
          // Roller-door rhythm along the pit lane — 26 garages, the AGP count.
          const aD = anchor(k(0.0), 1, 5.4), bD = [aD.r, aD.u, aD.t];
          for (let i = 0; i < 26; i++) {
            const off = (i - 12.5) * 6.6;
            addBox(stage, vadd(vadd(aD.c, aD.u, 2.3), aD.t, off),
                   [0.5, 4.2, 4.4], [0.22, 0.24, 0.28], bD);
          }
          // Glazed media / team-office storey, set back above the garage roof.
          stage._mat = 0;
          addBox(stage, vadd(aP.c, aP.u, 9.2), [13, 3.6, 168], [0.24, 0.34, 0.44], bP);
          stage._mat = MAT.CONCRETE;
          addBox(stage, vadd(aP.c, aP.u, 11.4), [14.4, 0.8, 170], [0.90, 0.90, 0.92], bP);
          stage._mat = MAT.METAL;
          const PANELS = 24;
          for (let i = 0; i < PANELS; i++) {
            const f = (i + 0.5) / PANELS;
            const y = 12.6 + Math.sin(f * Math.PI * 3) * 1.5;
            addBox(stage, vadd(vadd(aP.c, aP.t, (f - 0.5) * 184), aP.u, y),
                   [22, 0.55, 184 / PANELS + 0.4], [0.80, 0.82, 0.85], bP);
          }
          // Race control, stepped up at the pit-exit end.
          const rc = vadd(aP.c, aP.t, 74);
          stage._mat = MAT.CONCRETE;
          addBox(stage, vadd(rc, aP.u, 9), [15, 18, 22], [0.84, 0.86, 0.88], bP);
          stage._mat = 0;
          addBox(stage, vadd(vadd(rc, aP.r, -7.4), aP.u, 15.5), [0.3, 3.2, 20],
                 [0.22, 0.32, 0.42], bP);
          stage._mat = MAT.METAL;
          addBox(stage, vadd(rc, aP.u, 18.4), [17, 0.7, 24], [0.30, 0.32, 0.36], bP);
          addCyl(stage, vadd(rc, aP.u, 18.7), 0.18, 9, [0.60, 0.62, 0.66], 5, bP);
          stage._mat = 0;
        }, { required: true });
      }
      // marquee tent caps beside the s≈0.62 grandstand — at dist 34/42/50, behind the stand line
      for (let j = 0; j < 3; j++) {
        const a = anchor(k(0.62), 1, 34 + j * 8);
        if (onTrack(a.c[0], a.c[2], 6)) continue;
        // White tent body + coloured prism ridge roof
        addBox(out, vadd(a.c, a.u, 2.2), [11.0, 4.0, 11.0], WHITE, [a.r, a.u, a.t]);
        seat.prism(out, vadd(a.c, a.u, 4.2), [11.0, 2.0, 11.0],
                 [[0.20, 0.44, 0.72], [0.86, 0.28, 0.18], [0.90, 0.78, 0.24]][j % 3],
                 [a.r, a.u, a.t]);
      }

      for (let j = 0; j < 4; j++) {
        const gap = 18 + j * 7;
        const CCOL = [[0.70, 0.28, 0.22], [0.28, 0.38, 0.64], [0.78, 0.76, 0.36], [0.52, 0.53, 0.56]][j];
        const a = anchor(k(0.97), -1, gap);
        if (onTrack(a.c[0], a.c[2], 4)) continue;
        // Main container body
        addBox(out, vadd(a.c, a.u, 1.5), [6.2, 3.0, 12.2], CCOL, [a.r, a.u, a.t]);
        // Corrugation cap strip (slightly darker roof)
        addBox(out, vadd(a.c, a.u, 3.2), [6.4, 0.3, 12.6],
               [CCOL[0] * 0.8, CCOL[1] * 0.8, CCOL[2] * 0.8], [a.r, a.u, a.t]);
        // Door-end detail (narrow darker band)
        addBox(out, vadd(vadd(a.c, a.t, 6.3), a.u, 1.5), [6.2, 3.0, 0.4],
               [CCOL[0] * 0.7, CCOL[1] * 0.7, CCOL[2] * 0.7], [a.r, a.u, a.t]);
      }

      {
        const a = anchor(k(0.90), 1, 34);
        if (!onTrack(a.c[0], a.c[2], 8)) {
          addFrustum(out, a.c, 18, 8, 6.5, GRASS, 7, [a.r, a.u, a.t]);
          addCone(out, vadd(a.c, a.u, 6.5), 8, 3.5, [0.26, 0.52, 0.24], 7, [a.r, a.u, a.t]);
        }
        // Second slightly-offset mound for depth
        const a2 = anchor(k(0.91), 1, 42);
        if (!onTrack(a2.c[0], a2.c[2], 8)) {
          addFrustum(out, a2.c, 14, 5, 5.0, [0.26, 0.50, 0.24], 7, [a2.r, a2.u, a2.t]);
          addCone(out, vadd(a2.c, a2.u, 5.0), 5, 2.5, [0.28, 0.54, 0.26], 7, [a2.r, a2.u, a2.t]);
        }
      }

      for (const [s, side, col] of [
        [0.030,  1, RED],   [0.035,  1, WHITE], [0.040,  1, RED],   [0.045,  1, WHITE],
        [0.050,  1, RED],   [0.055, -1, WHITE], [0.060, -1, RED],   [0.065, -1, WHITE],
        [0.070, -1, RED],   [0.075,  1, WHITE],
      ]) {
        place(k(s), side, 1.9, [0.55, 0.28, 7.5], col);
      }
      // Chicane complex (s≈0.76–0.82) — dense alternating kerbs
      for (const [s, side, col] of [
        [0.760, -1, RED],   [0.765, -1, WHITE], [0.770, -1, RED],   [0.775, -1, WHITE],
        [0.780,  1, RED],   [0.785,  1, WHITE], [0.790,  1, RED],   [0.795,  1, WHITE],
        [0.800, -1, RED],   [0.805, -1, WHITE], [0.810,  1, RED],   [0.815,  1, WHITE],
      ]) {
        place(k(s), side, 1.9, [0.55, 0.28, 7.0], col);
      }
      for (const [s, side, col] of [
        [0.180,  1, RED],   [0.185,  1, WHITE], [0.190,  1, RED],   [0.195,  1, WHITE],
        [0.220, -1, RED],   [0.225, -1, WHITE], [0.230, -1, RED],   [0.235, -1, WHITE],
        [0.250,  1, RED],   [0.255,  1, WHITE], [0.260,  1, RED],
      ]) {
        place(k(s), side, 1.9, [0.55, 0.28, 7.0], col);
      }
      for (const [s, side, col] of [
        [0.530, -1, RED],   [0.535, -1, WHITE], [0.540, -1, RED],   [0.545, -1, WHITE],
        [0.560, -1, RED],   [0.565, -1, WHITE], [0.570, -1, RED],
        [0.585,  1, RED],   [0.590,  1, WHITE], [0.595,  1, RED],   [0.600,  1, WHITE],
      ]) {
        place(k(s), side, 1.9, [0.55, 0.28, 7.0], col);
      }
      // Lighter mid-lap apex flashes + grass run-off framing
      for (const [s, side] of [[0.30, 1], [0.62, 1], [0.97, 1]]) {
        place(k(s), side, 2, [0.5, 0.25, 6], side > 0 ? RED : WHITE);
        groundPatch(k(s), side, 2, [10, 0.1, 12], GRASS,
                    { id: `albert-runoff-${s}-${side}`, samples: 5 });
      }
      // Grass run-off pads at T1 / chicane exits
      for (const [s, side] of [[0.04, 1], [0.06, -1], [0.78, -1], [0.78, 1], [0.80, -1]]) {
        groundPatch(k(s), side, 2, [10, 0.1, 12], GRASS,
                    { id: `albert-runoff-${s}-${side}`, samples: 5 });
      }

      const FAIRWAY = [0.30, 0.58, 0.24];
      const BUNKER  = [0.86, 0.79, 0.62];
      for (const [s, gap, w, len] of [
        [0.665, 42, 26, 60], [0.705, 46, 28, 70], [0.745, 44, 26, 65],
        [0.790, 40, 24, 60], [0.825, 42, 24, 55],
      ]) {
        groundPatch(k(s), -1, gap, [w, 0.12, len], FAIRWAY,
                    { id: `albert-golf-fairway-${s}`, samples: 6 });
      }
      groundPatch(k(0.70), -1, 74, [14, 0.10, 14], BUNKER,
                  { id: "albert-golf-bunker-1", samples: 3 });
      groundPatch(k(0.80), -1, 70, [12, 0.10, 12], BUNKER,
                  { id: "albert-golf-bunker-2", samples: 3 });

      const FENCE_COL = [0.74, 0.76, 0.80];
      const ARMCO    = [0.90, 0.90, 0.92];
      const ARMCO_R  = [0.85, 0.18, 0.16];

      // Main straight / T1 approach — catch fence both sides
      fence(0.00, 0.12, -1,  9, 4.0, FENCE_COL);
      fence(0.02, 0.14,  1, 10, 3.6, FENCE_COL);
      // T1–T4 armco (temporary street rails)
      guardrail(0.03, 0.12,  1, 2.8, ARMCO);
      guardrail(0.04, 0.10, -1, 2.8, ARMCO);
      // Lakeside Drive armco (red accent strip on L shore)
      guardrail(0.42, 0.58, -1, 3.0, ARMCO_R);
      // Mid parkland rail
      guardrail(0.20, 0.30,  1, 3.0, ARMCO);
      // Southern loop approach fence
      fence(0.60, 0.72,  1,  9, 3.6, FENCE_COL);
      // Chicane complex — dense temporary barriers both sides
      fence(0.74, 0.84, -1,  9, 3.6, FENCE_COL);
      fence(0.74, 0.84,  1,  9, 3.6, FENCE_COL);
      guardrail(0.75, 0.83, -1, 2.8, ARMCO);
      guardrail(0.75, 0.83,  1, 2.8, ARMCO);
      // Pit approach
      guardrail(0.85, 0.95,  1, 3.0, ARMCO);
      fence(0.90, 0.99, -1,  9, 3.6, FENCE_COL);

      tyreWall(0.04, 0.07,  1, 3.2, RED);
      tyreWall(0.05, 0.08, -1, 3.2, WHITE);
      tyreWall(0.77, 0.81,  1, 3.5, RED);
      tyreWall(0.78, 0.82, -1, 3.5, WHITE);

      fence(0.14, 0.42,  1,  9, 3.6, FENCE_COL);
      fence(0.14, 0.41, -1,  9, 3.6, FENCE_COL);
      fence(0.42, 0.60,  1,  9, 3.6, FENCE_COL);
      fence(0.59, 0.74, -1,  9, 3.6, FENCE_COL);
      fence(0.72, 0.75,  1,  9, 3.6, FENCE_COL);
      fence(0.84, 0.92,  1,  9, 3.6, FENCE_COL);
      fence(0.84, 0.90, -1,  9, 3.6, FENCE_COL);
      guardrail(0.15, 0.40, -1, 13, ARMCO);
      guardrail(0.60, 0.73,  1, 13, ARMCO);
      guardrail(0.86, 0.94, -1, 13, ARMCO);

      for (const [s, side] of [[0.05, 1], [0.30, 1], [0.55, -1],
                                [0.62, 1], [0.78, -1], [0.90, 1],
                                [0.18, -1], [0.24, 1], [0.36, -1],
                                [0.48, 1], [0.68, -1], [0.84, 1]]) {
        marshalPost(k(s), side, 6);
      }

      const parkDeck = (id, s, side, gap, bays, opts) => {
        opts = opts || {};
        const rows = opts.rows || 6, pitch = 6.8, len = bays * pitch;
        const a = anchor(k(s), side, gap + 4), b = [a.r, a.u, a.t];
        const IN = -side;                        // +1 along a.r points at the track
        const topH = 0.9 + rows * 1.3;
        const half = (len / 2) / track.total;
        recordBarrier(s - half, s + half, side, gap);
        modelGroup(id, {
          center: vadd(a.c, a.u, topH * 0.7),
          size: [14, topH + 12, len + 4],
          basis: b,
        }, (stage) => {
          const TUBE = [0.66, 0.67, 0.70], MAT_TIMBER = [0.58, 0.50, 0.38];
          // Timber ground mats — the park turf will not carry a stand directly.
          stage._mat = MAT.WOOD;
          seat.box(stage, a.c, [13, 0.35, len + 2], MAT_TIMBER, b);
          stage._mat = MAT.METAL;
          for (let i = 0; i <= bays; i++) {
            const p = vadd(a.c, a.t, (i - bays / 2) * pitch);
            seat.cyl(stage, vadd(p, a.r, IN * -4.4), 0.15, topH, TUBE, 6, b);
            seat.cyl(stage, vadd(p, a.r, IN * 4.2), 0.15, 1.6, TUBE, 6, b);
            addBox(stage, vadd(vadd(p, a.r, IN * -0.1), a.u, topH * 0.45),
                   [8.6, 0.12, 0.12], TUBE, b);
          }
          for (let t = 0; t < rows; t++) {
            const lat = IN * (3.9 - t * 1.3), y = 0.7 + t * 1.3;
            stage._mat = MAT.METAL;
            seat.box(stage, vadd(vadd(a.c, a.r, lat), a.u, y), [1.35, 0.14, len], TUBE, b);
            stage._mat = MAT.FABRIC;
            seat.box(stage, vadd(vadd(a.c, a.r, lat), a.u, y + 0.14),
                     [1.0, 0.5, len - 1.2], [0.30, 0.33, 0.38], b);
            // General admission, half-empty in practice — so this row is a
            // SPARSE speckle of standing clumps, never one box per seat. The
            // old ~1 m stride emitted a body slot for every seat on every row
            // of every deck; at the distance these are read from, a clump of
            // three is indistinguishable from three people, and this circuit is
            // already among the heaviest in the fleet. Clump width (1.6 m) is
            // what keeps the thinned run reading as full as the old one.
            const cnt = Math.min(12, Math.floor(len / 4.2));
            for (let j = 0; j < cnt; j++) {
              const h2 = hash(k(s) * 11 + t * 61 + j * 19);
              if (h2 < 0.42) continue;
              seat.box(stage, vadd(vadd(vadd(a.c, a.r, lat), a.t,
                       (j / (cnt - 1) - 0.5) * (len - 3.4)),
                       a.u, y + 0.64), [0.55, 0.95, 1.6],
                       [[0.84, 0.26, 0.20], [0.20, 0.44, 0.70], [0.92, 0.86, 0.34],
                        [0.90, 0.90, 0.88]][Math.floor(h2 * 97) % 4], b);
            }
          }
          const shadeLat = IN * -2.6, shadeY = topH + 3.4;
          stage._mat = MAT.METAL;
          for (let i = 0; i <= bays; i++)
            seat.cyl(stage, vadd(vadd(a.c, a.t, (i - bays / 2) * pitch), a.r, shadeLat),
                     0.13, shadeY, TUBE, 5, b);
          stage._mat = MAT.FABRIC;
          for (let i = 0; i < bays; i++)
            addPrism(stage, vadd(vadd(vadd(a.c, a.t, (i - (bays - 1) / 2) * pitch),
                     a.r, shadeLat), a.u, shadeY), [7.6, 1.5, pitch - 0.3],
                     [0.94, 0.94, 0.92], b);
          // Printed hoarding wrapping the frame's trackside face.
          addBox(stage, vadd(vadd(a.c, a.r, IN * 4.5), a.u, 1.1),
                 [0.12, 2.0, len], opts.fascia || [0.20, 0.42, 0.66], b);
          stage._mat = 0;
        });
      };
      for (const [id, s, side, gap, bays, fascia] of [
        ["albert-deck-jones",    0.235, -1, 15, 6, [0.20, 0.42, 0.66]],
        ["albert-deck-lakeside", 0.375,  1, 15, 6, [0.84, 0.26, 0.20]],
        ["albert-deck-shore",    0.415, -1, 16, 5, [0.92, 0.86, 0.34]],
        ["albert-deck-drive",    0.505,  1, 16, 6, [0.18, 0.52, 0.36]],
        ["albert-deck-south",    0.700, -1, 15, 6, [0.20, 0.42, 0.66]],
        ["albert-deck-approach", 0.855,  1, 15, 6, [0.84, 0.26, 0.20]],
      ]) parkDeck(id, s, side, gap, bays, { fascia });

      // Trackside sponsor hoardings on the fence line, every parkland sector.
      for (const [s, side] of [[0.17, -1], [0.22, 1], [0.34, -1], [0.40, 1],
                               [0.50, -1], [0.58, 1], [0.66, -1], [0.73, 1],
                               [0.82, -1], [0.92, 1]]) {
        billboard(k(s), side, 12, 11, 4.0,
                  [0.20 + hash(k(s) * 3.1) * 0.6, 0.34 + hash(k(s) * 5.3) * 0.4,
                   0.30 + hash(k(s) * 7.7) * 0.5]);
      }

      cameraTower(k(0.02), 1, 30, { h: 18, col: [0.62, 0.64, 0.68] });
      for (let j = 0; j < 6; j++) {
        const kk = (k(0.0) + j * 8) % n;
        const wall = [[0.86, 0.87, 0.88], [0.30, 0.40, 0.60], [0.70, 0.30, 0.25],
                      [0.80, 0.78, 0.40], [0.55, 0.55, 0.58], [0.20, 0.55, 0.50]][j % 6];
        const accent = [[0.70, 0.10, 0.10], [0.10, 0.20, 0.55], [0.85, 0.20, 0.15],
                        [0.75, 0.65, 0.10], [0.35, 0.35, 0.40], [0.10, 0.55, 0.45]][j % 6];
        motorhome(kk, 1, 34, 12, 7 + hash(j * 3) * 3, 14, { wall, window: [0.18, 0.22, 0.28], accent });
      }
      for (let j = 0; j < 5; j++) {
        const a = anchor((k(0.0) + j * 10) % n, 1, 56 + hash(j * 7) * 8);
        if (onTrack(a.c[0], a.c[2], 6)) continue;
        addBox(out, vadd(a.c, a.u, 2.0), [4, 4, 13], [0.90, 0.90, 0.92], [a.r, a.u, a.t]);
        addBox(out, vadd(vadd(a.c, a.u, 1.6), a.t, 8), [3.6, 3.2, 4], [0.30, 0.32, 0.40], [a.r, a.u, a.t]);
      }
      building(k(0.04), 1, 48, 20, 12, 30, { kind: "podium", wall: [0.82, 0.84, 0.86], window: [0.30, 0.38, 0.50], floor: 3, mat: MAT.CONCRETE });
      {
        const ap = anchor(k(0.01), -1, 22);
        addCyl(out, ap.c, 0.18, 18, [0.28, 0.32, 0.38], 4, [ap.r, ap.u, ap.t]);
        addBox(out, vadd(ap.c, ap.u, 18), [3.0, 1.5, 0.3], [0.80, 0.18, 0.18], [ap.r, ap.u, ap.t]);
      }

      const LAMP_COL = [0.96, 0.93, 0.70];
      const POLE_COL = [0.35, 0.35, 0.37];

      // Zone A — main straight (s=0.0–0.10, both sides)
      for (let j = 0; j < 10; j++) {
        for (const side of [-1, 1]) {
          const a = anchor((k(0.0) + j * 12) % n, side, 11);
          if (onTrack(a.c[0], a.c[2], 1)) continue;
          addCyl(out, a.c, 0.13, 7.5, POLE_COL, 5, [a.r, a.u, a.t]);
          addBox(out, vadd(a.c, a.u, 7.5), [0.8, 0.5, 1.8], LAMP_COL, [a.r, a.u, a.t]);
        }
      }
      // Zone B — parkland east corridor (s=0.12–0.28, both sides)
      for (let j = 0; j < 14; j++) {
        for (const side of [-1, 1]) {
          const a = anchor((k(0.12) + j * 11) % n, side, 11);
          if (onTrack(a.c[0], a.c[2], 1)) continue;
          addCyl(out, a.c, 0.12, 8.0, POLE_COL, 5, [a.r, a.u, a.t]);
          addBox(out, vadd(a.c, a.u, 8.0), [0.8, 0.5, 1.8], LAMP_COL, [a.r, a.u, a.t]);
        }
      }
      // Zone C — lakeside Drive (s=0.42–0.60, L shore — water + CBD beyond)
      for (let j = 0; j < 16; j++) {
        const a = anchor((k(0.42) + j * 10) % n, -1, 11);
        if (onTrack(a.c[0], a.c[2], 1)) continue;
        addCyl(out, a.c, 0.12, 8.5, POLE_COL, 5, [a.r, a.u, a.t]);
        addBox(out, vadd(a.c, a.u, 8.5), [0.9, 0.5, 2.0], LAMP_COL, [a.r, a.u, a.t]);
      }
      // Zone D — southern park + chicane exit (s=0.70–0.90, both sides)
      for (let j = 0; j < 18; j++) {
        for (const side of [-1, 1]) {
          const a = anchor((k(0.70) + j * 10) % n, side, 11);
          if (onTrack(a.c[0], a.c[2], 1)) continue;
          addCyl(out, a.c, 0.12, 7.5, POLE_COL, 5, [a.r, a.u, a.t]);
          addBox(out, vadd(a.c, a.u, 7.5), [0.8, 0.5, 1.8], LAMP_COL, [a.r, a.u, a.t]);
        }
      }

      for (const [s, side, cnt] of [[0.65, 1, 3], [0.32, -1, 3], [0.88, 1, 2], [0.12, -1, 2]]) {
        for (let j = 0; j < cnt; j++) {
          const a = anchor((k(s) + j * 8) % n, side, 46 + j * 12);
          if (onTrack(a.c[0], a.c[2], 6)) continue;
          addBox(out, vadd(a.c, a.u, 2.0), [11, 4.0, 11],
                 [0.93, 0.93, 0.94], [a.r, a.u, a.t]);
          seat.prism(out, vadd(a.c, a.u, 4.0), [11, 1.8, 11],
                   [[0.86, 0.30, 0.20], [0.20, 0.46, 0.70], [0.90, 0.80, 0.26]][j % 3],
                   [a.r, a.u, a.t]);
        }
      }

      billboard(k(0.30),  1, 18, 14, 5, [0.20, 0.40, 0.70]);
      billboard(k(0.55), -1, 16, 14, 5, [0.86, 0.30, 0.20]);
      billboard(k(0.12),  1, 16, 12, 4.5, [0.90, 0.80, 0.20]);
      billboard(k(0.45), -1, 18, 12, 4.5, [0.20, 0.60, 0.45]);
      billboard(k(0.70),  1, 16, 12, 4.5, [0.80, 0.30, 0.50]);
      billboard(k(0.85), -1, 16, 12, 4.5, [0.30, 0.45, 0.70]);
      gantry(0.0,  7.5, [0.30, 0.32, 0.36]);
      gantry(0.50, 7.0, [0.25, 0.27, 0.32]);

      void prop; void WATER; void pyMin; void bush; void hedge; void cityFront; void addPyramid;
    };
