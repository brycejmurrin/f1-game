/* Apex 26 — INDIANAPOLIS scenery (data only), split out of js/circuits/indianapolis.js.
   LAZY_SCENERY (tools/manifest.cjs): no <script> tag. game.js fetches the ONE
   circuit a session builds; all 40 together were 1,083 KB of the boot wall for
   a player who races one of them. Body moved verbatim — see tools/manifest.cjs
   and tests/unit/load-order.test.mjs for the lockstep. */
"use strict";
(window.TrackScenery = window.TrackScenery || {})["indianapolis"] =
  function (api) {
      const { K, lapBounds, out, MAT, n, pyMin, hash, every, along, anchor, vadd, onTrack,
        px, pz, hw, tree, bush, ridge, building, grandstandEx, spectatorHill,
        broadcastCompound, billboard, gantry, marshalPost, motorhome,
        fence, guardrail, tyreWall, groundPatch, modelGroup, prop,
        floodMast, cameraTower, sponsorHoarding, signDigit,
        bleacher, scaffoldStand, seat, groundedSegments,
        addBox, addCyl, addCone, addPrism, addFrustum } = api;

      const LEAF = [0.22, 0.44, 0.20], LEAF_D = [0.16, 0.36, 0.17];
      const CONC = [0.74, 0.73, 0.70];
      const SEAT = [[0.30, 0.42, 0.66], [0.86, 0.86, 0.84], [0.72, 0.20, 0.18]];
      const SHELL = [0.78, 0.78, 0.76], SHELL2 = [0.70, 0.71, 0.73];
      const ROOF = [0.86, 0.86, 0.84];

      // Outer oval wall — skip the SF stretch where indy-main-stands owns the
      // continuous Paddock / Tower Terrace face (IMS facility map; front stretch
      // grandstands). Fabric seat overlays that used to ride the crowdBank
      // risers are gone: they were the flatCoplanar hotspots (38 m²).
      const OUTER_BAYS = 28, OUTER_SPAN = 0.28;
      const OUTER_RUN = 1100;
      const OUTER_BAY_LEN = OUTER_RUN / OUTER_BAYS;
      for (let i = 0; i < OUTER_BAYS; i++) {
        // Span 0.78..1.06(=0.06) was the old oval; keep mid-straight + T4 only.
        const s = 0.78 + i * (OUTER_SPAN / OUTER_BAYS);
        const g = Math.floor(i * 10 / OUTER_BAYS);
        const s01 = ((s % 1) + 1) % 1;
        // Leave SF (indy-main-stands), T1 bleachers, and the south bend alone.
        if (s01 < 0.10 || s01 > 0.90) continue;
        if (s01 >= 0.16 && s01 <= 0.26) continue;
        const gap = 18;
        grandstandEx(s01, 1, gap, Math.min(OUTER_BAY_LEN * 0.9, 40), null, null, {
          livery: g % 3 === 0 ? "alu" : (g % 3 === 1 ? "concrete" : "darkSteel"),
          tiers: 2, roof: g % 5 === 0 ? "cantilever" : null,
          endWalls: false, pylons: g % 5 === 0,
        });
      }
      // Inner (infield) stands facing back across the front straight.
      for (let i = 0; i < 8; i++) {
        const s = (0.92 + i * 0.018) % 1;
        if (s < 0.08 || s > 0.92) continue;
        grandstandEx(s, -1, 18, 36, null, null, {
          livery: i % 2 ? "alu" : "concrete", tiers: 2, endWalls: false,
        });
      }

      // Continuous main-straight stand — Paddock / Tower Terrace wall opposite
      // the Pagoda (IMS facility map; https://www.indianapolismotorspeedway.com/).
      // Positive rake: each tier steps further from the road and rises.
      (function indyMainStands() {
        const side = 1;
        const FACE = 48;
        const DEPTH = 18;
        const gap0 = 18;
        const a0 = anchor(K(0.0), side, gap0 + DEPTH * 0.4);
        if (onTrack(a0.c[0], a0.c[2], FACE * 0.3)) return;
        const b0 = [a0.r, a0.u, a0.t];
        modelGroup("indy-main-stands", {
          center: vadd(a0.c, a0.u, 9),
          size: [DEPTH * 0.8, 22, FACE + 6], basis: b0,
        }, (stage) => {
          // Three long bays along the tangent so the wall reads continuous.
          for (let bay = -1; bay <= 1; bay++) {
            const along = bay * (FACE * 0.34);
            for (let t = 0; t < 4; t++) {
              const a = anchor(K(0.0), side, gap0 + t * 4.2);
              const b = [a.r, a.u, a.t];
              const h = 1.8 + t * 2.2;
              const len = FACE * 0.30 - t * 1.0;
              const c = vadd(a.c, a.t, along);
              stage._mat = MAT.CONCRETE;
              seat.box(stage, vadd(c, a.u, h * 0.5), [3.6, h, len], t % 2 ? SHELL : SHELL2, b);
              // Bucket-seat bands: blue / white / red — the Speedway read.
              stage._mat = MAT.FABRIC;
              seat.box(stage, vadd(c, a.u, h + 0.5),
                [3.0, 0.95, len - 2.2], SEAT[(bay + t + 3) % 3], b);
              stage._mat = 0;
              seat.box(stage, vadd(c, a.u, h + 1.1),
                [3.3, 0.16, len - 0.8], ROOF, b);
            }
          }
          // Rear spine + cantilever lip (outer grandstand roof silhouette).
          const aR = anchor(K(0.0), side, gap0 + DEPTH * 0.55);
          stage._mat = MAT.CONCRETE;
          addBox(stage, vadd(aR.c, aR.u, 8.5), [2.4, 16, FACE * 0.9], SHELL2,
            [aR.r, aR.u, aR.t]);
          stage._mat = MAT.METAL;
          addBox(stage, vadd(aR.c, aR.u, 14.8), [DEPTH * 0.5, 0.6, FACE + 1], ROOF,
            [aR.r, aR.u, aR.t]);
          // Fascia stripe facing the track.
          addBox(stage, vadd(vadd(aR.c, aR.r, -side * 7.2), aR.u, 14.2),
            [0.3, 0.5, FACE * 0.85], [0.20, 0.28, 0.48], [aR.r, aR.u, aR.t]);
          stage._mat = 0;
        }, { required: true });
      })();

      {
        // Behind the pit complex, which keeps hw + 30 m here: at gap 30 the
        // 26 m-deep pagoda stood in the garages and was superseded. Gap 52
        // clears the neonTower ring that clipped the 26×30 m group AABB at
        // gap 46 (clip-audit 9.95 m @ frac 0.006).
        const a = anchor(K(0.005), -1, 62);
        const b = [a.r, a.u, a.t];
        modelGroup("indy-pagoda", {
          center: vadd(a.c, a.u, 26), size: [22, 58, 26], basis: b,
        }, (stage) => {
          // Solid base housing.
          addBox(stage, vadd(a.c, a.u, 5), [18, 10, 22], [0.80, 0.80, 0.82], b);
          for (let t = 0; t < 5; t++) {
            const w = 15 - t * 2.0, d = 18 - t * 2.2;
            const y = 12 + t * 6.85;
            // Glass sits on the storey face (halfW + 0.2): the old w*0.48
            // offset opened a >5 cm XZ gap on the upper, narrower storeys and
            // left two glass bands unsupported by 31–38 m (ground-audit).
            const halfW = (w - 1.2) * 0.5;
            addBox(stage, vadd(a.c, a.u, y + 0.175), [w - 1.2, 5.95, d - 1.2],
              [0.76, 0.77, 0.79], b);
            addBox(stage, vadd(vadd(a.c, a.r, halfW + 0.2), a.u, y + 0.2),
              [0.45, 2.2, d - 2.0], [0.26, 0.39, 0.52], b);
            addBox(stage, vadd(a.c, a.u, y + 3.6), [w + 2.5, 0.9, d + 2.8],
              [0.86, 0.86, 0.88], b);                                      // diminishing eave
          }
          addCyl(stage, vadd(a.c, a.u, 43.25), 0.5, 10, [0.90, 0.90, 0.92], 8, b);
        }, { required: true });
      }

      {
        const a = anchor(K(0.030), -1, 24);
        const b = [a.r, a.u, a.t];
        const AMBER = [1.0, 0.74, 0.12], PANEL = [0.07, 0.07, 0.08];
        const ORDER = [[1, 16], [4, 63], [55, 81], [44, 14], [23, 22],
                       [27, 31], [10, 77], [18, 24], [20, 3]];
        modelGroup("indy-scoring-pylon", {
          center: vadd(a.c, a.u, 17), size: [9, 40, 11], basis: b,
        }, (stage) => {
          // Poured base the shaft grows out of.
          addBox(stage, vadd(a.c, a.u, 1.1), [7.6, 2.2, 9.0], [0.78, 0.78, 0.76], b);
          addBox(stage, vadd(a.c, a.u, 2.5), [8.4, 0.6, 9.8], [0.86, 0.86, 0.84], b);
          // addFrustum's centre is its BASE: the shaft stands on the plinth
          // (2.8 m) and meets the cap at 31.8 m. Given its mid-height (17 m)
          // it ran 17-46 m, through the cap, over digits hung on nothing.
          addFrustum(stage, vadd(a.c, a.u, 2.8), 4.3, 3.2, 29, PANEL, 4, b);
          // Number panels down the track-facing face. Three columns, nine rows.
          const proud = 0.06;
          for (let r = 0; r < ORDER.length; r++) {
            const y = 27.5 - r * 2.55;
            // Row backing so the digits sit on a recessed dark field.
            addBox(stage, vadd(vadd(a.c, a.r, proud * 6), a.u, y),
              [0.25, 2.05, 7.6], [0.03, 0.03, 0.04], b);
            for (let cIdx = 0; cIdx < 3; cIdx++) {
              const num = ORDER[r][cIdx % 2] + (cIdx === 2 ? 40 : 0);
              const digs = String(num % 100).padStart(2, "0").split("").map(Number);
              const colC = vadd(vadd(vadd(a.c, a.r, proud * 6), a.u, y),
                a.t, (cIdx - 1) * 2.5);
              digs.forEach((d, i) => {
                const dc = vadd(colC, a.t, (i - 0.5) * 0.78);
                signDigit(dc, a.r, a.u, a.t, 0.62, 1.42, -proud, AMBER, d);
              });
            }
          }
          // Cap and beacon.
          addBox(stage, vadd(a.c, a.u, 31.8), [5.2, 0.9, 6.0], [0.80, 0.80, 0.82], b);
          // addCyl is base-anchored too: the mast stands on the cap's top
          // (32.25 m), the beacon on the mast.
          addCyl(stage, vadd(a.c, a.u, 32.25), 0.28, 3.6, [0.86, 0.86, 0.88], 6, b);
          addCyl(stage, vadd(a.c, a.u, 35.85), 0.42, 0.7, AMBER, 8, b);
        }, { required: true });
      }

      {
        const a = anchor(K(0.955), -1, 15);
        const b = [a.r, a.u, a.t];
        modelGroup("indy-pit-stalls", {
          center: vadd(a.c, a.u, 4), size: [12, 10, 120], basis: b,
        }, (stage) => {
          // The continuous roof.
          addBox(stage, vadd(a.c, a.u, 6.4), [10, 0.7, 118], [0.88, 0.88, 0.86], b);
          // Open stalls: a back wall and dividing fins, no fronts.
          addBox(stage, vadd(vadd(a.c, a.r, -4.6), a.u, 3), [0.5, 6, 118], CONC, b);
          for (let i = 0; i < 15; i++) {
            const p = vadd(a.c, a.t, (i - 7) * 8);
            addBox(stage, vadd(p, a.u, 3), [9, 6, 0.35], [0.82, 0.82, 0.80], b);
            addCyl(stage, vadd(p, a.r, 4.4), 0.16, 6.2, [0.70, 0.70, 0.72], 6, b);
          }
        }, { required: true });
      }
      gantry(0.0, 9.5, [0.15, 0.15, 0.18]);
      gantry(0.955, 9, [0.15, 0.15, 0.18]);

      {
        const lineK = K(0.0), a = anchor(lineK, 0, 0);
        const fullWidth = hw[lineK] * 2;
        const brickCount = Math.ceil(fullWidth);
        const brickWidth = fullWidth / brickCount;
        for (let i = 0; i < brickCount; i++) {
          const off = -fullWidth * 0.5 + brickWidth * (i + 0.5);
          addBox(out, vadd(vadd(a.c, a.r, off), a.u, 0.03), [brickWidth + 0.02, 0.06, 1.0],
            i % 2 ? [0.52, 0.28, 0.22] : [0.44, 0.24, 0.19], [a.r, a.u, a.t]);
        }
      }

      for (let row = 0; row < 3; row++) {
        const a = anchor(K(0.906 + row * 0.020), -1, 40 + row * 20);
        const b = [a.r, a.u, a.t];
        modelGroup(`indy-gasoline-alley-${row + 1}`, {
          center: vadd(a.c, a.u, 5), size: [18, 12, 68], basis: b,
        }, (stage) => {
          const WALL = [0.88, 0.88, 0.86], TRIM = [0.66, 0.16, 0.15];
          // The shed itself.
          addBox(stage, vadd(a.c, a.u, 3.4), [15, 6.8, 64], WALL, b);
          // Low-pitch roof deck, then the monitor spine standing proud of it.
          addBox(stage, vadd(a.c, a.u, 7.0), [15.8, 0.5, 65], [0.74, 0.74, 0.72], b);
          addBox(stage, vadd(a.c, a.u, 8.6), [5.6, 2.8, 60], WALL, b);
          addBox(stage, vadd(a.c, a.u, 10.2), [6.6, 0.45, 61], [0.70, 0.70, 0.68], b);
          for (const sgn of [-1, 1])
            addBox(stage, vadd(vadd(a.c, a.r, sgn * 2.7), a.u, 8.7),
              [0.25, 1.7, 57], [0.42, 0.48, 0.52], b);
          // Roll-up doors down the alley flank, with a red header band above.
          addBox(stage, vadd(vadd(a.c, a.r, -7.4), a.u, 6.2), [0.4, 0.9, 64], TRIM, b);
          for (let d = 0; d < 13; d++) {
            const p = vadd(a.c, a.t, (d - 6) * 4.8);
            addBox(stage, vadd(vadd(p, a.r, -7.5), a.u, 2.4),
              [0.35, 4.4, 3.5], d & 1 ? [0.72, 0.72, 0.74] : [0.64, 0.64, 0.66], b);
            // Bay number stencilled over each door.
            signDigit(vadd(vadd(p, a.r, -7.8), a.u, 5.4), a.r, a.u, a.t,
              0.5, 0.9, 0.1, [0.20, 0.20, 0.22], (row * 13 + d) % 10);
          }
        });
      }
      for (const [id, s, gap] of [["a", 0.916, 52], ["b", 0.916, 72]]) {
        groundPatch(K(s), -1, gap, [12, 0.16, 66], [0.56, 0.56, 0.55],
          { id: `indy-alley-${id}`, samples: 8 });
      }
      every(46, (k) => {
        const s = k / n, h = hash(k * 71 + 31);
        if (!(s > 0.88 || s < 0.04) || h < 0.55) return;
        motorhome(k, -1, 62 + h * 10, 10, 4, 6, { wall: [0.70 + h * 0.2, 0.70, 0.72] });
      });
      broadcastCompound(K(0.895), -1, 78, { vans: 3, dishes: 2, mastH: 9 });
      for (const s of [0.97, 0.01, 0.04]) billboard(K(s), -1, 10, 14, 5, [0.20, 0.30, 0.60]);

      groundPatch(K(0.300), 1, 8, [22, 0.18, 28], [0.66, 0.62, 0.50],
        { id: "indy-infield-gravel-a", samples: 6 });
      tyreWall(0.286, 0.316, 1, 4, [0.86, 0.20, 0.18]);
      marshalPost(K(0.305), -1, 9);

      groundPatch(K(0.500), -1, 5, [24, 0.18, 32], [0.66, 0.62, 0.50],
        { id: "indy-infield-gravel-b", samples: 6 });
      tyreWall(0.486, 0.516, -1, 4, [0.20, 0.40, 0.85]);
      marshalPost(K(0.494), 1, 9);

      groundPatch(K(0.660), 1, 5, [24, 0.18, 32], [0.66, 0.62, 0.50],
        { id: "indy-infield-gravel-c", samples: 6 });
      marshalPost(K(0.655), -1, 9);

      bleacher(0.292, 0.309, -1, 28, {
        rows: 8, step: 8, density: 0.44,
        plankCol: [0.66, 0.67, 0.70], frameCol: [0.58, 0.59, 0.62],
        crowd: [[0.30, 0.42, 0.66], [0.86, 0.86, 0.84], [0.72, 0.20, 0.18]],
      });
      scaffoldStand(0.512, 0.528, 1, 22, {
        rows: 6, step: 9, density: 0.40, legEvery: 1,   // every bay on its own legs: bays do not touch
        bench: [[0.30, 0.42, 0.66], [0.82, 0.80, 0.76]],
        crowd: [[0.86, 0.86, 0.84], [0.30, 0.42, 0.66], [0.72, 0.20, 0.18]],
      });
      bleacher(0.673, 0.688, -1, 22, {
        rows: 6, step: 8, density: 0.36,
        plankCol: [0.72, 0.72, 0.74], frameCol: [0.62, 0.63, 0.66],
        crowd: [[0.72, 0.20, 0.18], [0.86, 0.86, 0.84], [0.30, 0.42, 0.66]],
      });

      for (const [id, s, side, gap] of [
        ["1", 0.345, 1, 44], ["2", 0.430, -1, 48],
        ["3", 0.570, 1, 46], ["4", 0.628, -1, 42],
      ]) {
        groundPatch(K(s), side, gap, [26, 0.16, 30], [0.30, 0.52, 0.22],
          { id: `indy-green-${id}`, samples: 8 });
        // Bunker beside the green, not draped over it: overlapping patches
        // sit one 2 cm lift slot apart (ground-audit flatCoplanar).
        groundPatch(K(s), side, gap + 26.5, [11, 0.14, 14], [0.84, 0.79, 0.62],
          { id: `indy-bunker-${id}`, samples: 6 });
        const a = anchor(K(s), side, gap + 4);
        const b = [a.r, a.u, a.t];
        addCyl(out, vadd(a.c, a.u, -0.1), 0.05, 3.6, [0.94, 0.94, 0.92], 4, b);   // pin from grade (base at 1.1 hovered)
        addBox(out, vadd(vadd(a.c, a.u, 2.0), a.t, 0.5), [0.06, 0.5, 0.9],
          [0.90, 0.16, 0.14], b);
      }

      every(40, (k) => {
        const s = k / n;
        if (s < 0.28 || s > 0.72) return;
        const h = hash(k * 31);
        if (h < 0.55) return;
        // After the sparseness guard h is in [0.55, 1), so the old h<0.5
        // selectors were dead: every clump planted right, always LEAF, and
        // LEAF_D never rendered. 0.775 is the live range's midpoint.
        tree(k, h < 0.775 ? -1 : 1, 34 + h * 20, 10 + h * 6, h < 0.775 ? LEAF_D : LEAF);
      });

      for (const [s0, s1] of [[0.24, 0.70]]) {
        guardrail(s0, s1, -1, 6, [0.80, 0.81, 0.83]);
        guardrail(s0, s1,  1, 6, [0.80, 0.81, 0.83]);
      }
      // Oval retaining wall — a continuous white concrete barrier, not armco.
      // The slab length is along()'s own pitch, not a padded constant: 9.6 m
      // against a 9 m walk made every slab overlap its neighbour by 0.6 m, and
      // on the oval's straights the two inner faces are one plane — 20
      // same-facing coplanar pairs (2026-09-22). The pitch tiles exactly.
      along(0.80, 0.22, 9, (k, spacing) => {
        const a = anchor(k, 1, 1.4);
        addBox(out, vadd(a.c, a.u, 1.05), [0.6, 2.1, spacing], [0.93, 0.93, 0.92], [a.r, a.u, a.t]);
      });
      fence(0.86, 0.18, 1, 12, 5, [0.74, 0.76, 0.80]);
      for (const s of [0.28, 0.36, 0.44, 0.58, 0.66, 0.74]) {
        marshalPost(K(s), hash(K(s)) < 0.5 ? -1 : 1, 8.5);
      }

      const { cx, cz, radius: rad } = lapBounds();
      for (const [extra, count, len, w, hMin, hVar, col] of [
        [110, 46, 150, 34, 11, 4, [0.20, 0.40, 0.19]],
        [200, 36, 200, 44, 14, 5, [0.17, 0.35, 0.17]],
      ]) {
        for (let i = 0; i < count; i++) {
          const a = i / count * 6.2832, h = hash(i * 7 + extra);
          const r = rad + extra + h * 30;
          const tx = cx + Math.cos(a) * r, tz = cz + Math.sin(a) * r;
          if (onTrack(tx, tz, 32)) continue;
          ridge(tx, tz, pyMin, a + 1.5708, len, w, hMin + h * hVar, col);
        }
      }
      for (let i = 0; i < 9; i++) {
        floodMast(K((0.84 + i * 0.042) % 1), 1, 44, { h: 34, cool: true, arms: 3, light: false });
      }
      // Broadcast platforms at the show corners.
      cameraTower(K(0.115), 1, 30, { h: 18 });
      cameraTower(K(0.500), -1, 26, { h: 15 });

      spectatorHill(0.085, 0.150, -1, 26,
        { rows: 4, rise: 1.2, depth: 2.0, density: 0.66, step: 8 });

      // Turn 1 outside viewing — bleachers instead of grandstandEx so
      // crowdBank/rejBox on the banked bend cannot suppress the whole stand
      // (Stand H / J sector per indymotorspeedway.com road-course seating).
      bleacher(0.190, 0.210, 1, 18, {
        rows: 8, step: 9, density: 0.42,
        plankCol: [0.72, 0.72, 0.74], frameCol: [0.58, 0.59, 0.62],
        crowd: [[0.30, 0.42, 0.66], [0.86, 0.86, 0.84], [0.72, 0.20, 0.18]],
      });
      bleacher(0.214, 0.232, 1, 20, {
        rows: 6, step: 9, density: 0.38,
        plankCol: [0.70, 0.71, 0.74], frameCol: [0.60, 0.61, 0.64],
        crowd: [[0.86, 0.86, 0.84], [0.30, 0.42, 0.66], [0.72, 0.20, 0.18]],
      });
      // Infield mid-course bleacher (side +1 matches the gravel apron at 0.300).
      // Authored rise/setback are positive; world-space "beyond" is contaminated
      // here by the nearby oval ribbon, so do not flip side from a distance probe.
      bleacher(0.392, 0.408, 1, 24, {
        rows: 7, step: 8, density: 0.40,
        plankCol: [0.70, 0.71, 0.74], frameCol: [0.60, 0.61, 0.64],
        crowd: [[0.30, 0.42, 0.66], [0.86, 0.86, 0.84], [0.72, 0.20, 0.18]],
      });
    };
