/* Apex 26 — HUNGARORING scenery (data only), split out of js/circuits/hungaroring.js.
   LAZY_SCENERY (tools/manifest.cjs): no <script> tag. game.js fetches the ONE
   circuit a session builds; all 40 together were 1,083 KB of the boot wall for
   a player who races one of them. Body moved verbatim — see tools/manifest.cjs
   and tests/unit/load-order.test.mjs for the lockstep. */
"use strict";
(window.TrackScenery = window.TrackScenery || {})["hungaroring"] =
  function (api) {
      const { out, MAT, n, ds, px, py, pz, pyMin, hash, every, place, prop, backdrop, groundPlane,
              mountain, peak, ridge, tree, pine, bush, hedge, grandstand, grandstandEx, spectatorHill,
              broadcastCompound, cameraTower, building, motorhome, tower,
              billboard, marshalPost, fence, guardrail, tyreWall,
              anchor, addBox, addCyl, addCone, addFrustum, addPrism, vadd, onTrack, groundYAt,
              seat, foundation, cantilever, lampPost,
              forestEdge, along, modelGroup, overheadSpan, waterSurface, groundPatch, groundedSegments,
              recordBarrier, circuitKit, pal, ATM } = api;
      const K = (s) => Math.round(s * n) % n;

      {
        const POP    = [0.34, 0.50, 0.24];
        const POP_L  = [0.42, 0.57, 0.28];
        const POP_BK = [0.46, 0.44, 0.38];
        const AKAC   = [0.44, 0.54, 0.30];
        const AKAC_D = [0.36, 0.47, 0.26];
        const BARK   = [0.34, 0.29, 0.23];

        for (const [s0, s1, side, gap] of [
          [0.075, 0.150, -1, 62],
          [0.245, 0.320,  1, 70],
          [0.470, 0.545, -1, 58],
          [0.665, 0.745,  1, 66],
          [0.840, 0.905, -1, 74],
        ]) {
          const span = (s1 - s0 + 1) % 1;
          const count = Math.max(8, Math.round(span * n * ds / 11));
          for (let i = 0; i < count; i++) {
            const sf = (s0 + span * (i / count)) % 1;
            const kk = K(sf), hv = hash(kk * 19 + i * 7);
            const a = anchor(kk, side, gap);
            if (onTrack(a.c[0], a.c[2], 18)) continue;
            const b = [a.r, a.u, a.t];
            const h = 17 + hv * 6;
            out._mat = MAT.WOOD;
            addCyl(out, a.c, 0.30, h * 0.30, POP_BK, 5, b);
            out._mat = MAT.FOLIAGE;
            addCone(out, vadd(a.c, a.u, h * 0.16), 1.75 + hv * 0.35, h * 0.42,
                    hv < 0.5 ? POP : POP_L, 6, b);
            addCone(out, vadd(a.c, a.u, h * 0.50), 1.45 + hv * 0.30, h * 0.36,
                    hv < 0.5 ? POP_L : POP, 6, b);
            addCone(out, vadd(a.c, a.u, h * 0.78), 1.00 + hv * 0.22, h * 0.28,
                    POP_L, 6, b);
            out._mat = 0;
          }
        }

        for (const [sf, side, gap] of [
          [0.045,  1, 54], [0.180, -1, 68], [0.215,  1, 50],
          [0.355, -1, 60], [0.420,  1, 72], [0.520,  1, 56],
          [0.600, -1, 64], [0.700, -1, 52], [0.775,  1, 58],
          [0.880,  1, 62], [0.940, -1, 56],
        ]) {
          const kk = K(sf);
          const trees = 3 + Math.floor(hash(kk * 23 + gap) * 4);
          for (let j = 0; j < trees; j++) {
            const hv = hash(kk * 31 + j * 13 + gap);
            const a = anchor(kk + Math.round((hv - 0.5) * 8),
                             side, gap + (hash(kk + j * 5) - 0.5) * 14);
            if (onTrack(a.c[0], a.c[2], 16)) continue;
            const b = [a.r, a.u, a.t];
            const h = 11 + hv * 5;
            out._mat = MAT.WOOD;
            // Bare trunk forking low — akác holds its crown high.
            addCyl(out, a.c, 0.34, h * 0.52, BARK, 5, b);
            addCyl(out, vadd(vadd(a.c, a.u, h * 0.42), a.r, 0.7),
                   0.20, h * 0.26, BARK, 4, b);
            out._mat = MAT.FOLIAGE;
            // Two or three offset lobes with gaps between — an open crown.
            const lobes = hv > 0.55 ? 3 : 2;
            for (let l = 0; l < lobes; l++) {
              const ang = (l / lobes) * 6.2832 + hv * 2;
              const rr = 1.5 + hv * 1.1;
              addCone(out,
                vadd(vadd(vadd(a.c, a.r, Math.cos(ang) * rr),
                          a.t, Math.sin(ang) * rr), a.u, h * 0.52 + l * 0.7),
                2.5 + hv * 1.3, h * 0.40, l % 2 ? AKAC : AKAC_D, 6, b);
            }
            out._mat = 0;
          }
        }
      }

      // 1. Dry dusty Hungarian bowl — straw-olive grass/runoff, warm haze.
      if (ATM && ATM.dustyBowl) Object.assign(pal, ATM.dustyBowl);

      const GRASS  = [0.46, 0.50, 0.26];    // sun-baked straw-olive grass
      const AMPH   = [0.48, 0.54, 0.28];    // amphitheatre banking — G-dom → rounded mound
      const AMPH2  = [0.54, 0.58, 0.32];    // sun-bleached terrace variant
      const TREE   = [0.28, 0.36, 0.18];    // dry oak / olive tree masses
      const TREE2  = [0.34, 0.42, 0.20];    // mid dusty canopy
      const SCRUB  = [0.52, 0.48, 0.28];    // dry scrub bush
      const HAZE   = [0.68, 0.64, 0.48];    // far haze-tinted hills (dustyBowl fog)
      const HAZE2  = [0.74, 0.70, 0.56];    // furthest hazed ridge
      const SHELL  = [0.46, 0.47, 0.50];    // grandstand back shell
      const SHELL2 = [0.40, 0.42, 0.46];    // darker shell
      const WHITE  = [0.90, 0.91, 0.93];
      const GREY   = [0.72, 0.74, 0.78];
      const RED    = [0.82, 0.18, 0.18];
      const STEEL  = [0.66, 0.68, 0.72];
      const WATER  = [0.14, 0.28, 0.32];
      const PADDOCK = [0.55, 0.55, 0.57];
      const LAMP_POST = [0.28, 0.29, 0.30];
      const LAMP_HEAD = [0.96, 0.94, 0.84];
      const LAMP_ARM  = [0.34, 0.35, 0.36];
      const CROWD = [[0.55, 0.32, 0.30], [0.50, 0.52, 0.58], [0.62, 0.58, 0.40], [0.48, 0.50, 0.54]];
      const WIN_WARM = [0.92, 0.78, 0.42];
      const WIN_COOL = [0.78, 0.84, 0.96];
      const ROOF_DK  = [0.20, 0.21, 0.24];  // covered tribune dark roof

      let cx = 0, cz = 0;
      for (let i = 0; i < n; i++) { cx += px[i]; cz += pz[i]; }
      cx /= n; cz /= n;
      let rad = 0;
      for (let i = 0; i < n; i++) rad = Math.max(rad, Math.hypot(px[i] - cx, pz[i] - cz));

      const ringFar = rad + 460;
      for (let i = 0; i < 16; i++) {
        const a = i / 16 * 6.2832, h = hash(i * 13 + 200);
        peak(cx + Math.cos(a) * ringFar, cz + Math.sin(a) * ringFar, pyMin,
             280 + h * 100, 28 + h * 16, HAZE);
      }
      // Furthest haze ridges
      const ringHorizon = rad + 640;
      for (let i = 0; i < 10; i++) {
        const a = i / 10 * 6.2832, h = hash(i * 17 + 400);
        ridge(cx + Math.cos(a) * ringHorizon, cz + Math.sin(a) * ringHorizon, pyMin,
              a + Math.PI / 2, 340 + h * 160, 190 + h * 100, 38 + h * 22, HAZE2);
      }

      const amphPts = [
        [0.05, 1, 180], [0.15, -1, 195], [0.25, 1, 185],
        [0.35, -1, 190], [0.48,  1, 185], [0.58, -1, 195],
        [0.68,  1, 188], [0.78, -1, 192], [0.88,  1, 180],
        [0.92, -1, 190], [0.97,  1, 185], [0.02, -1, 195],
      ];
      for (const [s, side, dist] of amphPts) {
        const hh = hash(Math.round(s * n) * 11 + side * 3);
        backdrop(K(s), side, dist, [120 + hh * 40, 34 + hh * 14, 110], hh < 0.5 ? AMPH : AMPH2);
      }

      // Mid-ring tree-capped mounds at the amphitheatre bowl crest
      const ringMid = rad + 300;
      for (let i = 0; i < 14; i++) {
        const a = i / 14 * 6.2832, h = hash(i * 19 + 100);
        const tx = cx + Math.cos(a) * ringMid;
        const tz = cz + Math.sin(a) * ringMid;
        if (onTrack(tx, tz, 14)) continue;
        addCone(out, [tx, pyMin, tz], 20 + h * 10, 18 + h * 10,
                h < 0.45 ? TREE : TREE2, 7, null);
      }

      billboard(K(0.00), 1, 38, 22, 6, RED);
      grandstandEx(0.06,  1, 11,  70, SHELL, CROWD[0],
                   { livery: "steel", tiers: 2, roof: "cantilever", suites: true, pylons: true });
      // Stadium inside: Apex 1/2 banked stands inside Turn 1-2
      grandstandEx(0.10, -1, 10,  56, SHELL, CROWD[2],
                   { livery: "concrete", tiers: 2, roof: "flat" });
      // Sector grandstands across the back of the circuit
      grandstandEx(0.12, -1, 10, 44, SHELL, CROWD[2],
                   { livery: "alu", tiers: 1, roof: "truss" });
      // s 0.12-0.30 was the clearest hole on the lap: no stand of any kind
      // across ~800 m of a documented, heavily tree-lined grandstand location.
      // Both new stands sit at generous `gap` so the deferred forestEdge() pass
      // (it reads the barrier/solid index built by grandstandEx's recordBarrier
      // + indexSolid AFTER this runs) frames them INSIDE the treeline rather
      // than growing trees through them.
      grandstandEx(0.155, 1, 24, 58, SHELL, CROWD[1],
                   { livery: "alu", tiers: 1, roof: "truss", endWalls: true });     // Turn 5 Mogyoród
      grandstandEx(0.255, -1, 22, 54, SHELL, CROWD[3],
                   { livery: "steel", tiers: 1, roof: "cantilever", suites: true }); // T6/7 Driving Centre chicane
      grandstandEx(0.40,  1, 13, 46, SHELL, CROWD[0],
                   { livery: "steel", tiers: 2, roof: "flat" });
      grandstandEx(0.55, -1, 10, 50, SHELL, CROWD[1],
                   { livery: "alu", tiers: 1, roof: "truss" });
      grandstandEx(0.90,  1, 10, 62, SHELL, CROWD[0],   // Club stand — final corner
                   { livery: "concrete", tiers: 2, roof: "cantilever", suites: true, endWalls: true });

      const FASCIA  = [0.94, 0.92, 0.84];
      const FASCIA2 = [0.78, 0.80, 0.82];
      const standAccent = (s, side, gap, len) => {
        const a = anchor(K(s), side, gap + 5);
        if (onTrack(a.c[0], a.c[2], len * 0.5)) return;
        const b = [a.r, a.u, a.t];
        addBox(out, vadd(a.c, a.u, 13.15), [0.3, 0.5, len + 2], FASCIA, b);
        addBox(out, vadd(a.c, a.u, 7.5), [0.2, 0.6, len - 2], FASCIA2, b);
      };
      standAccent(0.06, 1, 11,   70);
      standAccent(0.10, -1, 10, 56);
      standAccent(0.12, -1, 10, 44);
      standAccent(0.155, 1, 24, 58);
      standAccent(0.255, -1, 22, 54);
      standAccent(0.40,  1, 13, 46);
      standAccent(0.55, -1, 10, 50);
      standAccent(0.90,  1, 10, 62);

      // Grandstand lit-window concourse strips
      const gsLit = [
        { s: 0.06, side: 1, gap: 18, len: 66 },
        { s: 0.10, side: -1, gap: 15, len: 52 },
        { s: 0.155, side: 1, gap: 26, len: 54 },
        { s: 0.255, side: -1, gap: 24, len: 50 },
        { s: 0.55, side: -1, gap: 15, len: 46 },
        { s: 0.90, side: 1, gap: 15, len: 58 },
      ];
      for (const g of gsLit) {
        const k = K(g.s);
        const a = anchor(k, g.side, g.gap);
        addBox(out, vadd(a.c, a.u, 1.4), [0.22, 1.0, g.len - 4], WIN_WARM, [a.r, a.u, a.t]);
        addBox(out, vadd(a.c, a.u, 8.6), [0.22, 0.8, g.len - 6], WIN_COOL, [a.r, a.u, a.t]);
      }

      forestEdge(0.0,  0.18, 1, 8, { density: 0.58, hMin: 9, hMax: 15,
                                      col: TREE, col2: TREE2, pineFrac: 0.40 });
      forestEdge(0.18, 0.50, 1, 8, { density: 0.46, hMin: 7, hMax: 13,
                                      col: TREE2, col2: TREE, pineFrac: 0.32 });
      forestEdge(0.50, 1.00, 1, 8, { density: 0.50, hMin: 8, hMax: 14,
                                      col: TREE, col2: TREE2, pineFrac: 0.40 });
      // Inside: tighter valley wall
      forestEdge(0.0,  0.12, -1, 8, { density: 0.52, hMin: 7, hMax: 13,
                                       col: TREE, col2: TREE2, pineFrac: 0.55 });
      forestEdge(0.14, 0.35, -1, 8, { density: 0.44, hMin: 8, hMax: 13,
                                       col: TREE2, col2: TREE, pineFrac: 0.38 });
      forestEdge(0.35, 0.55, -1, 8, { density: 0.50, hMin: 8, hMax: 14,
                                       col: TREE, col2: TREE2, pineFrac: 0.42 });
      forestEdge(0.55, 1.00, -1, 8, { density: 0.46, hMin: 7, hMax: 12,
                                       col: TREE2, col2: TREE, pineFrac: 0.38 });

      // Dry scrub spots at the edge (gap=9, sparse)
      every(44, (kk) => {
        for (const side of [-1, 1]) {
          const s = hash(kk * 37 + side * 11);
          if (s < 0.62) continue;
          bush(kk, side, 9 + s * 10, SCRUB);
        }
      });

      every(80, (kk) => {
        for (const side of [-1, 1]) {
          const hh = hash(kk * 31 + side * 7);
          if (hh < 0.15) continue;
          const a = anchor(kk, side, 8);
          if (onTrack(a.c[0], a.c[2], 1.5)) continue;
          const b = [a.r, a.u, a.t];
          addCyl(out, a.c, 0.12, 10, LAMP_POST, 5, b);
          const armC = vadd(vadd(a.c, a.u, 9.6), a.r, side * 1.2);
          addBox(out, armC, [2.4, 0.18, 0.18], LAMP_ARM, b);
          const headC = vadd(vadd(a.c, a.u, 9.2), a.r, side * 2.2);
          addBox(out, headC, [1.0, 0.3, 0.7], LAMP_HEAD, b);
          if (typeof lampPost === "function")
            lampPost({ pos: headC, k: kk, side, kind: "halogen" });
        }
      });
      // Extra lamp clusters at key braking zones
      for (const [s0, s1, side] of [[0.95, 0.08, 1], [0.52, 0.62, 1], [0.30, 0.44, -1]]) {
        // Walk a COUNTED number of steps across the window. The old loop advanced
        // by `step` and broke only on kk === kEnd exactly — which a stride that
        // does not divide the window essentially never hits, so it ran its full
        // `n` iterations and wrapped the lap `step` times over, restacking lamps
        // on nodes it had already dressed. Those duplicates were byte-identical,
        // hence coplanar on every face, and were this circuit's whole z-fight
        // population as well as thousands of wasted verts.
        const k0 = K(s0), kEnd = K(s1), step = Math.max(1, Math.round(50 / ds));
        const arc = ((kEnd - k0) % n + n) % n;
        const count = Math.floor(arc / step);
        for (let i = 0; i < count; i++) {
          const kk = (k0 + i * step) % n;
          const a = anchor(kk, side, 8);
          if (onTrack(a.c[0], a.c[2], 1.5)) continue;
          const b = [a.r, a.u, a.t];
          addCyl(out, vadd(a.c, a.u, -0.4), 0.12, 10.4, LAMP_POST, 5, b);
          // cantilever() emits the arm with the head, so the head can never be
          // left hovering beside a bare pole (it was, 168 times).
          const headBase = vadd(a.c, a.u, 9.2);
          cantilever(out, headBase, 1.8, side, [1.0, 0.3, 0.7], LAMP_HEAD, LAMP_POST, b);
          const headC = vadd(headBase, a.r, -side * 1.8);
          if (typeof lampPost === "function")
            lampPost({ pos: headC, k: kk, side, kind: "halogen" });
        }
      }

      guardrail(0.95, 0.20,  1, 8, STEEL);  // main straight + Turn 1
      guardrail(0.30, 0.45, -1, 8, STEEL);  // mid-sector inside
      guardrail(0.52, 0.62,  1, 8, STEEL);  // twisty-sector stands
      // Catch fences in front of busy spectator zones
      fence(0.95, 0.20,  1, 10, 7, STEEL);   // main straight + Turn 1
      fence(0.30, 0.45, -1, 10, 7, STEEL);   // mid-sector inside
      fence(0.52, 0.62,  1, 10, 7, STEEL);   // twisty-sector stands
      // Tyre walls at high-risk braking points
      tyreWall(0.045, 0.075,  1, 9, RED);
      tyreWall(0.14,  0.17,  -1, 9, [0.95, 0.85, 0.15]);
      tyreWall(0.54,  0.57,   1, 9, [0.20, 0.40, 0.85]);

      for (const [s, side] of [[0.05, 1], [0.12, -1], [0.16, -1], [0.30, -1],
                                [0.42, 1], [0.55, -1], [0.68, 1], [0.80, -1], [0.92, 1]]) {
        marshalPost(K(s), side, 8);
      }

      (function modernPit() {
        const a = anchor(K(0.00), -1, 20);
        const b = [a.r, a.u, a.t];
        modelGroup("hungaroring-pit-complex", {
          center: vadd(a.c, a.u, 7), size: [24, 15, 82], basis: b,
        }, (stage) => {
          stage._mat = MAT.CONCRETE;
          // Garage body — long low slab
          addBox(stage, vadd(a.c, a.u, 3.4), [11, 6.8, 78], WHITE, b);
          const DOOR_N = 36, DOOR_PITCH = 78 / DOOR_N;
          for (let i = 0; i < DOOR_N; i++) {
            const off = (i - (DOOR_N - 1) / 2) * DOOR_PITCH;
            const technical = i >= DOOR_N - 4;
            addBox(stage, vadd(vadd(a.c, a.u, 2.6), a.t, off),
                   [11.4, 4.0, DOOR_PITCH * 0.55],
                   technical ? [0.20, 0.21, 0.25] : [0.28, 0.30, 0.34], b);
          }
          // Mid cladding band
          addBox(stage, vadd(a.c, a.u, 6.0), [11.6, 0.45, 78], GREY, b);
          // VIP terrace stacked on top
          addBox(stage, vadd(a.c, a.u, 8.6), [9.5, 3.6, 68], [0.88, 0.89, 0.92], b);
          stage._mat = MAT.METAL;
          addBox(stage, vadd(a.c, a.u, 10.7), [10.5, 0.4, 70], GREY, b);
          // Pit-lane canopy overhang toward the track (+r from left side)
          addBox(stage, vadd(vadd(a.c, a.r, 5.5), a.u, 7.0), [8, 0.4, 76], [0.82, 0.84, 0.88], b);
          stage._mat = 0;
          // Warm VIP glass strip facing the straight
          addBox(stage, vadd(vadd(a.c, a.r, 4.6), a.u, 9.0), [0.2, 1.8, 60], WIN_WARM, b);
          addBox(stage, vadd(vadd(a.c, a.r, 4.6), a.u, 4.2), [0.2, 1.4, 64], WIN_COOL, b);
          stage._mat = MAT.CONCRETE;
          addBox(stage, vadd(a.c, a.u, 11.15), [9.0, 0.3, 66], [0.86, 0.87, 0.90], b);
          stage._mat = MAT.METAL;
          addBox(stage, vadd(vadd(a.c, a.r, 4.2), a.u, 12.0), [0.15, 1.5, 66], [0.40, 0.60, 0.70], b);
          addBox(stage, vadd(vadd(a.c, a.r, -4.2), a.u, 12.0), [0.15, 1.5, 66], STEEL, b);
          for (const sgn of [-1, 1])
            addBox(stage, vadd(vadd(a.c, a.t, sgn * 33), a.u, 12.0), [8.4, 1.5, 0.15], STEEL, b);
        }, { required: true });
      })();
      groundPatch(K(0.00), -1, 65, [120, 1.0, 130], PADDOCK,
                  { id: "hungaroring-paddock", samples: 8 });
      // Rear hospitality — motorhome row behind the pit slab
      motorhome(K(0.03), -1, 34, 16, 8, 34, { wall: WHITE, window: WIN_WARM });
      (function timingBlock() {
        const a = anchor(K(0.02), -1, 46);
        const b = [a.r, a.u, a.t], c = a.c;
        if (onTrack(c[0], c[2], 9)) return;
        out._mat = MAT.CONCRETE;
        for (let f = 0; f < 3; f++) {
          addBox(out, vadd(c, a.u, 2.1 + f * 4.0), [10, 3.6, 17], f % 2 ? GREY : WHITE, b);
          out._mat = 0;
          // Continuous ribbon glazing — the banded fenestration of the period.
          addBox(out, vadd(vadd(c, a.r, 5.05), a.u, 2.6 + f * 4.0),
                 [0.18, 1.9, 15.5], f === 2 ? WIN_COOL : WIN_WARM, b);
          out._mat = MAT.CONCRETE;
        }
        // Stepped-back control deck on the roof.
        addBox(out, vadd(c, a.u, 15.4), [7.2, 3.2, 12], WHITE, b);
        out._mat = 0;
        addBox(out, vadd(vadd(c, a.r, 3.7), a.u, 15.6), [0.18, 2.0, 11], WIN_COOL, b);
        out._mat = MAT.METAL;
        addBox(out, vadd(c, a.u, 17.2), [8.0, 0.3, 12.8], GREY, b);
        // External stair cage on the far flank — open mesh landings on a spine.
        const st = vadd(c, a.t, 9.4);
        addBox(out, vadd(st, a.u, 8.5), [4.4, 17, 0.2], STEEL, b);
        for (let f = 0; f < 4; f++)
          addBox(out, vadd(st, a.u, 2.0 + f * 4.0), [4.6, 0.16, 2.4], STEEL, b);
        addCyl(out, vadd(st, a.r, 2.2), 0.11, 18, LAMP_POST, 5, b);
        out._mat = 0;
      })();
      broadcastCompound(K(0.045), -1, 68, { vans: 4, dishes: 2, mastH: 10 });
      // Pit wall + kerb trim
      const pitWallPoints = [];
      for (let i = 0; i <= 28; i++) {
        const s = (0.985 + i * 0.0025) % 1;
        pitWallPoints.push({ k: K(s), side: -1, dist: 8 });
      }
      groundedSegments({
        id: "hungaroring-pit-wall", points: pitWallPoints,
        width: 0.8, height: 1.3, color: WHITE,
      });
      groundedSegments({
        id: "hungaroring-pit-wall-trim",
        points: pitWallPoints.map((point) => Object.assign({}, point, { dist: 7.5 })),
        width: 0.35, height: 0.3, color: RED,
      });
      recordBarrier(0.985, 0.055, -1, 8);
      overheadSpan({
        id: "hungaroring-start-gantry", frac: 0.005, clearance: 7.05,
        thickness: 0.9, depth: 1.4, supportGap: 2.5,
        color: [0.30, 0.32, 0.36], required: true,
      });

      // Covered main tribune — big stepped wedge + dark roof box over pale seating (R).
      (function coveredMainTribune() {
        const len = 96;
        const boundsAnchor = anchor(K(0.00), 1, 56);
        const boundsBasis = [boundsAnchor.r, boundsAnchor.u, boundsAnchor.t];
        modelGroup("hungaroring-main-tribune", {
          center: vadd(boundsAnchor.c, boundsAnchor.u, 9), size: [28, 20, len + 6], basis: boundsBasis,
        }, (stage) => {
          for (let t = 0; t < 5; t++) {
            const a = anchor(K(0.00), 1, 45 + t * 4.2);
            const b = [a.r, a.u, a.t];
            const h = 2.4 + t * 2.6;
            stage._mat = MAT.CONCRETE;
            addBox(stage, vadd(a.c, a.u, h * 0.5), [5.2, h, len - t * 2], t % 2 ? SHELL : SHELL2, b);
            stage._mat = MAT.FABRIC;
            addBox(stage, vadd(a.c, a.u, h + 0.65), [4.6, 1.2, len - t * 2 - 2], CROWD[t % 4], b);
            stage._mat = 0;
            addBox(stage, vadd(a.c, a.u, h + 1.4), [4.9, 0.25, len - t * 2], [0.90, 0.88, 0.80], b);
          }
          // Dark roof canopy covering the wedge (cantilever toward track)
          const aR = anchor(K(0.00), 1, 53);
          stage._mat = MAT.METAL;
          addBox(stage, vadd(aR.c, aR.u, 16.2), [20, 0.9, len + 4], ROOF_DK, [aR.r, aR.u, aR.t]);
          // Leading-edge fascia
          addBox(stage, vadd(vadd(aR.c, aR.r, -8), aR.u, 15.4), [1.2, 1.6, len + 2], [0.32, 0.33, 0.36], [aR.r, aR.u, aR.t]);
          // Back shell wall behind the top tier
          const aB = anchor(K(0.00), 1, 67);
          stage._mat = MAT.CONCRETE;
          addBox(stage, vadd(aB.c, aB.u, 9), [3.5, 18, len], SHELL2, [aB.r, aB.u, aB.t]);
          stage._mat = 0;
          // Under-roof warm strip (reads occupied even in day)
          addBox(stage, vadd(aR.c, aR.u, 15.5), [14, 0.22, len - 4], [1.15, 1.00, 0.72], [aR.r, aR.u, aR.t]);
        }, { required: true });
      })();

      function tunnelStairhead(s, side) {
        const a = anchor(K(s), side, 16);
        if (onTrack(a.c[0], a.c[2], 6)) return;
        const b = [a.r, a.u, a.t];
        out._mat = MAT.CONCRETE;
        addBox(out, vadd(a.c, a.u, 1.1), [4.5, 2.2, 5.5], PADDOCK, b);        // kiosk block
        out._mat = 0;
        // Sunken stairwell mouth — dark opening set into the block's inner face.
        addBox(out, vadd(vadd(a.c, a.u, 1.0), a.r, -side * 2.1), [0.4, 1.9, 3.6], [0.06, 0.06, 0.08], b);
        out._mat = MAT.METAL;
        addBox(out, vadd(a.c, a.u, 2.35), [4.8, 0.15, 5.8], GREY, b);         // flat canopy
        for (const sgn of [-1, 1])
          addBox(out, vadd(vadd(a.c, a.u, 1.9), a.t, sgn * 2.6), [4.6, 0.9, 0.15], STEEL, b);  // handrails
        out._mat = 0;
      }
      tunnelStairhead(0.975, -1);   // start/finish straight, pit-exit end
      tunnelStairhead(0.028,  1);   // start/finish straight, Turn 1 end

      waterSurface(K(0.08), 1, 75, [40, 1.0, 32], WATER,
                   { id: "hungaroring-lake", required: true });
      hedge(0.04, 0.11, 1, 32, 4, TREE);

      // Hungarian tricolour accent billboards (red/white/green)
      billboard(K(0.02), -1, 22, 10, 4, [0.20, 0.48, 0.20]);   // green
      billboard(K(0.04),  1, 22, 10, 4, [0.85, 0.20, 0.20]);   // red

      for (const [s, side] of [[0.06, 1], [0.12, -1], [0.40, 1], [0.55, -1], [0.90, 1]]) {
        groundPatch(K(s), side, 2, [0.4, 0.25, 6], side > 0 ? RED : WHITE,
                    { id: `hungaroring-kerb-${s}`, samples: 2 });
        groundPatch(K(s), side, 7, [10, 0.08, 12], GRASS,
                    { id: `hungaroring-runoff-${s}`, samples: 4 });
      }

      every(26, (kk) => {
        const sf = kk / n;
        // Stadium bowl (T1-4, s0-0.10) + the lake/amphitheatre back sweeps.
        // frac~0.42-0.44 used to be excluded here for a reported terrain
        // intrusion at road level. DIAGNOSED: rebuilt this circuit headlessly
        // (tools/track/verify-track.cjs harness) with the skip removed and instrumented
        // every [scenery] SUPPRESSED warning — none fire anywhere near frac 0.43
        // for any gap this file actually uses (8m lamps, 40-58m crowd blanket).
        // A raycast against the built terrain mesh (mirroring the anchor()
        // terrainYAt lookup) also shows a normal monotonic downhill slope away
        // from the road there, no spike. The circuit already carries
        // `terrainOuter: 90` (see top of file) specifically to stop this
        // twisty-middle-sector terrain ribbon from chording across a nearby
        // fold-back — that fix was applied circuit-wide and evidently also
        // resolved this narrower band, leaving these three skips stale. Root
        // mechanism (terrain ribbons from geometrically-close-but-lap-distant
        // sections overlapping when a node's own outerW reaches far enough to
        // touch a taller nearby section — confirmed: the s≈0.56 crest, py≈13.7m,
        // sits only ~75-90m from this stretch in world space) lives in
        // js/track/core/mesh.js buildTerrain + js/track/tracks.js terrainYAt, both
        // engine files this task may not edit. No further js/track/ mitigation
        // needed here since the symptom no longer reproduces at this circuit's
        // gaps; if it resurfaces at a different gap, tightening `terrainOuter`
        // further (currently 90) is the circuit-data lever, at the cost of
        // thinning the ribbon on the wide, legitimate stretches too.
        const inBowl = sf < 0.12 || (sf > 0.32 && sf < 0.62) || sf > 0.88;
        if (!inBowl) return;
        for (const side of [-1, 1]) {
          const hh = hash(kk * 23 + side * 5);
          if (hh < 0.5) continue;
          const base = 40 + hh * 18;  // increased from 30 to clear road intrusion at frac ~0.432
          const col = CROWD[((kk + (side > 0 ? 1 : 0)) | 0) % CROWD.length];
          // Low, wide patch stepping up the slope — a distant crowd, not a slab.
          prop(kk, side, base, [10 + hh * 8, 0.35 + hh * 0.3, 12 + hh * 6], col);
        }
      });

      // The every(26) pass above explicitly excludes s 0.12-0.32 and 0.62-0.88 —
      // real crowds at Hungaroring thin out on the quiet hillside bands away
      // from the main viewing stretches, but they do not vanish outright the
      // way the hard exclusion makes them. A second, much sparser pass fills
      // just the two bands the brief calls out (0.12→0.30 and 0.62→0.78) with
      // occasional patches — roughly a fifth of the density of the main bowl —
      // so the furniture rhythm along the fence line doesn't go dead silent.
      every(38, (kk) => {
        const sf = kk / n;
        const inSparseBand = (sf > 0.12 && sf < 0.30) || (sf > 0.62 && sf < 0.78);
        if (!inSparseBand) return;
        for (const side of [-1, 1]) {
          const hh = hash(kk * 29 + side * 13 + 500);
          if (hh < 0.80) continue;   // sparse: ~1 in 5 nodes gets a patch
          const base = 30 + hh * 16;
          const col = CROWD[((kk + (side > 0 ? 1 : 0)) | 0) % CROWD.length];
          prop(kk, side, base, [7 + hh * 5, 0.3 + hh * 0.2, 8 + hh * 4], col);
        }
      });

      // ── Grass-bank hillside crowd terracing behind each grandstand — the
      //    Hungaroring signature: informal stepped earth risers rising up the
      //    natural banking, wrapping the bowl. This used to be a hand-rolled
      //    local terracedHillStand() (a mini shell+roof stand duplicating what
      //    spectatorHill() now provides as a shared model — see
      //    docs/archive/SCENERY-UPGRADE-PLAN.md §1.4/§2). Deleted in favour of
      //    spectatorHill(): real stepped risers + standing crowd, no shell/roof,
      //    the correct silhouette for "general-admission hillside", set well
      //    below its ~70 verts/m default (rows/density cut) since this rings
      //    most of the lap and is repeated-furniture budget, not one hero bank.
      const HG_RISER = [0.42, 0.43, 0.47];
      const hillHalf = (len) => (len / 2) / (n * ds);   // metres → lap-fraction half-span
      for (const [s, side, gap, len, rows] of [
        [0.06,  1, 32, 64, 3],   // Turn 1 downhill hillside
        [0.12, -1, 26, 48, 3],   // inside the slow complex
        [0.145, 1, 36, 40, 2],   // grass shoulder around the Turn 5 (Mogyoród) stand
        [0.19, -1, 30, 40, 2],   // inside hillside threading T5 into the chicane
        [0.225, 1, 34, 38, 2],   // grass shoulder around the T6/7 "Driving Centre" stand
        [0.27, -1, 28, 36, 2],   // trailing off toward T4
        [0.30, -1, 30, 40, 2],
        [0.40,  1, 34, 42, 2],
        [0.48, -1, 30, 40, 2],
        [0.58,  1, 30, 46, 2],
        [0.68, -1, 28, 42, 2],
        [0.78,  1, 30, 44, 2],
        [0.90,  1, 28, 54, 3],   // Club-corner hillside back to the line
      ]) {
        const half = hillHalf(len);
        spectatorHill(s - half, s + half, side, gap,
                      { rows, density: 0.35, step: 8, crowd: CROWD, grass: AMPH2, riser: HG_RISER });
      }

      const TERR_CONC = [0.72, 0.70, 0.64];   // sun-bleached poured concrete
      const TERR_RAIL = [0.60, 0.58, 0.53];
      function bowlTerrace(s, side, gap, len, rows) {
        const k = K(s);
        const probe = anchor(k, side, gap);
        if (onTrack(probe.c[0], probe.c[2], len * 0.4)) return;
        // Register the front face so the deferred forestEdge() pass frames the
        // terrace instead of planting the treeline through it — grandstandEx
        // did this for us at these three fractions before the swap.
        const half = (len / 2) / (n * ds);
        recordBarrier(s - half, s + half, side, gap);
        const CONC2 = [TERR_CONC[0] * 0.88, TERR_CONC[1] * 0.88, TERR_CONC[2] * 0.87];
        let topH = 0;
        for (let t = 0; t < rows; t++) {
          const a = anchor(k, side, gap + 1.2 + t * 2.3);
          const b = [a.r, a.u, a.t];
          const h = 1.1 + t * 1.35;
          topH = h;
          out._mat = MAT.CONCRETE;
          addBox(out, vadd(a.c, a.u, h * 0.5), [2.4, h, len], t % 2 ? TERR_CONC : CONC2, b);
          out._mat = MAT.METAL;
          addBox(out, vadd(a.c, a.u, h + 1.02), [0.13, 0.13, len - 1], TERR_RAIL, b);
          for (const sgn of [-1, 1])
            addCyl(out, vadd(vadd(a.c, a.t, sgn * (len * 0.5 - 3)), a.u, h),
                   0.07, 1.02, TERR_RAIL, 4, b);
          // Crowd is a SPARSE speckle over the row, never one box per seat.
          out._mat = MAT.FABRIC;
          const cnt = Math.min(11, Math.floor(len / 7));
          for (let c = 0; c < cnt; c++) {
            if (hash(k * 7 + t * 29 + c * 13) < 0.46) continue;
            const off = (c / Math.max(1, cnt - 1) - 0.5) * (len - 5);
            addBox(out, vadd(vadd(a.c, a.t, off), a.u, h + 0.6),
                   [1.8, 1.15, 1.6], CROWD[(c + t) % CROWD.length], b);
          }
          out._mat = 0;
        }
        const towers = Math.max(2, Math.round(len / 26));
        const a = anchor(k, side, gap + 1.2 + rows * 2.3);
        const b = [a.r, a.u, a.t];
        for (let i = 0; i < towers; i++) {
          const off = ((i + 0.5) / towers - 0.5) * (len - 8);
          const c0 = vadd(a.c, a.t, off);
          out._mat = MAT.CONCRETE;
          addBox(out, vadd(c0, a.u, (topH + 1.8) * 0.5), [3.4, topH + 1.8, 3.6], CONC2, b);
          out._mat = 0;
          addBox(out, vadd(vadd(c0, a.r, -side * 1.72), a.u, 1.5),
                 [0.3, 2.6, 1.8], [0.10, 0.10, 0.11], b);            // stair mouth
          out._mat = MAT.METAL;
          addBox(out, vadd(c0, a.u, topH + 1.9), [3.8, 0.18, 4.0], TERR_RAIL, b);
          out._mat = 0;
        }
      }
      bowlTerrace(0.35, -1, 12, 48, 7);   // mid-sector inside terrace
      bowlTerrace(0.68, -1, 10, 44, 6);   // back-of-the-bowl terrace
      bowlTerrace(0.80,  1, 10, 40, 6);   // outside the run to Turn 11

      // ── Trackside jumbotron — a big screen on a truss frame facing the bowl. ──
      (function jumbotron() {
        const a = anchor(K(0.55), -1, 30);
        const b = [a.r, a.u, a.t], c = a.c;
        if (onTrack(c[0], c[2], 8)) return;
        out._mat = MAT.METAL;
        for (const sg of [-1, 1])                                   // two support legs
          addCyl(out, vadd(c, a.t, sg * 4.5), 0.5, 12, [0.24, 0.25, 0.28], 6, b);
        addBox(out, vadd(c, a.u, 12.5), [1.2, 6, 11], [0.20, 0.21, 0.24], b);   // truss frame
        out._mat = 0;
        addBox(out, vadd(vadd(c, a.r, -0.7), a.u, 12.5), [0.4, 5, 9.5], [0.05, 0.07, 0.12], b); // screen — stays FLAT (video screen)
      })();

      cameraTower(K(0.065), -1, 42, { h: 16 });
      cameraTower(K(0.20),  -1, 44, { h: 14 });
      cameraTower(K(0.905),  -1, 40, { h: 14 });

      (function countryside() {
        const a = anchor(K(0.62), 1, 260);
        const b = [a.r, a.u, a.t], base = a.c;
        const wallC = [0.82, 0.78, 0.68], roofC = [0.56, 0.30, 0.22];
        for (let i = 0; i < 6; i++) {
          const off = (i - 2.5) * 34, out2 = hash(i * 9) * 40;
          const ai = anchor(K(0.62) + Math.round(off / ds), 1, 260 + out2);
          const bi = [ai.r, ai.u, ai.t], f = ai.c;
          const w = 12 + hash(i * 7) * 6, hh = 7 + hash(i * 5) * 3;
          out._mat = MAT.STONE;
          addBox(out, vadd(f, ai.u, hh * 0.5), [w, hh, w * 0.8], hash(i) < 0.5 ? wallC : [0.76, 0.72, 0.62], bi);
          out._mat = MAT.ROOF;
          addPrism(out, vadd(f, ai.u, hh), [w, 3.2, w * 0.8], roofC, bi);
          out._mat = 0;
        }
        // Village church: white nave + a tall spire.
        const cf = vadd(vadd(base, a.t, 20), a.r, 60);
        out._mat = MAT.STONE;
        addBox(out, vadd(cf, a.u, 8), [14, 16, 22], [0.90, 0.88, 0.82], b);
        out._mat = MAT.ROOF;
        addPrism(out, vadd(cf, a.u, 17), [14, 4, 22], roofC, b);
        const tf = vadd(cf, a.t, 13);
        out._mat = MAT.STONE;
        addBox(out, vadd(tf, a.u, 13), [5, 26, 5], [0.92, 0.90, 0.84], b);
        out._mat = MAT.METAL;
        addCone(out, vadd(tf, a.u, 26), 3.4, 12, roofC, 7, b);
        out._mat = 0;
      })();
      // Sunflower / wheat field patches on the open plain (dusty Hungarian gold).
      for (const [s, side, dist] of [[0.35, 1, 120], [0.45, -1, 130], [0.70, 1, 140], [0.25, -1, 115]]) {
        const k = K(s);
        const a = anchor(k, side, dist);
        if (onTrack(a.c[0], a.c[2], 30)) continue;
        groundPatch(k, side, dist, [90, 1.0, 80],
                    hash(k * 5) < 0.5 ? [0.78, 0.72, 0.36] : [0.72, 0.66, 0.34],
                    { id: `hungaroring-field-${s}`, samples: 6 });
      }

      for (const [s, side, dist, len] of [
        [0.075,  1, 92, 46], [0.115, -1, 88, 40], [0.905, 1, 86, 48],
      ]) {
        const k = K(s);
        const hh = hash(k * 41 + side * 17);
        backdrop(k, side, dist, [76 + hh * 18, 12 + hh * 4, len + 20], AMPH2);
        prop(k, side, 62 + hh * 8, [14, 0.45, len], CROWD[(k + (side > 0 ? 1 : 0)) % CROWD.length]);
      }

      for (const [s, side, dist] of [
        [0.205, 1, 32], [0.235, 1, 42], [0.275, 1, 35],
        [0.715, -1, 34], [0.755, -1, 44], [0.825, -1, 36],
      ]) {
        const k = K(s), h = hash(k * 53 + side * 7);
        tree(k, side, dist, 10 + h * 5, h < 0.5 ? TREE : TREE2);
        pine(k, side, dist + 9, 12 + h * 5, TREE);
      }

      if (circuitKit) {
        circuitKit.hospitality({
          id: "kit:hungaroring:paddock-hospitality", frac: 0.012,
          side: -1, gap: 92, size: [18, 9, 38], modules: 5,
        });
        circuitKit.serviceCompound({
          id: "kit:hungaroring:paddock-service", frac: 0.035,
          side: -1, gap: 112, size: [26, 6, 34], vehicles: 7,
        });
        for (const [id, frac, side] of [
          ["t4", 0.285, -1], ["t11", 0.625, 1],
        ]) {
          circuitKit.marshalShelter({
            id: `kit:hungaroring:marshal-${id}`, frac, side,
            gap: 18, size: [6, 3, 5],
          });
        }
        circuitKit.recoveryBay({
          id: "kit:hungaroring:recovery-t12", frac: 0.705,
          side: 1, gap: 34, size: [13, 5, 18],
        });
      }

      for (let i = 0; i < 5; i++) {
        const a = 0.15 + i * 0.16;
        const h = hash(730 + i * 29);
        const rr = rad + 390 + h * 45;
        ridge(cx + Math.cos(a) * rr, cz + Math.sin(a) * rr, pyMin,
              a + Math.PI / 2, 190 + h * 65, 105 + h * 35,
              22 + h * 10, i % 2 ? HAZE : HAZE2);
      }
    };
