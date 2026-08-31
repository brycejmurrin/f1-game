/* Apex 26 — PAUL_RICARD scenery (data only), split out of js/circuits/paul_ricard.js.
   LAZY_SCENERY (tools/manifest.cjs): no <script> tag. game.js fetches the ONE
   circuit a session builds; all 40 together were 1,083 KB of the boot wall for
   a player who races one of them. Body moved verbatim — see tools/manifest.cjs
   and tests/unit/load-order.test.mjs for the lockstep. */
"use strict";
(window.TrackScenery = window.TrackScenery || {})["paul_ricard"] =
  function (api) {
      const { out, MAT, n, pyMin, hash, every, along, anchor, vadd, onTrack, px, pz,
        pine, tree, bush, ridge, building, grandstandEx, spectatorHill,
        broadcastCompound, billboard, gantry, marshalPost, motorhome,
        fence, guardrail, tyreWall, groundPatch, modelGroup, prop, runoffApron,
        cameraTower, sponsorHoarding, signBoard, terrainYAt,
        addBox, addCyl, addCone, addFrustum, addPrism } = api;
      const K = (s) => Math.round(s * n) % n;

      const PINE = [0.14, 0.30, 0.16], PINE_D = [0.11, 0.24, 0.14];
      const SCRUB = [0.36, 0.40, 0.22], SCRUB_D = [0.30, 0.34, 0.19];
      const BLUE = [0.36, 0.42, 0.66], RED = [0.62, 0.28, 0.26];
      const BLUE_D = [0.29, 0.34, 0.56], LINE = [0.90, 0.90, 0.88];
      const ALU = [0.76, 0.78, 0.80], WHITE = [0.94, 0.94, 0.92];

      for (const [id, s, side, w, l] of [
        ["pr-runoff-verrerie", 0.070, 1, 82, 150],
        ["pr-runoff-mistral", 0.440, -1, 70, 130],
        ["pr-runoff-signes", 0.565, 1, 92, 170],
        ["pr-runoff-beausset", 0.720, -1, 66, 120],
        ["pr-runoff-village", 0.905, 1, 64, 120],
      ]) {
        groundPatch(K(s), side, 4, [w * 0.30, 0.18, l], RED,
          { id: id + "-red", samples: 8 });
        groundPatch(K(s), side, 4 + w * 0.30, [w * 0.42, 0.18, l * 1.08], BLUE,
          { id: id + "-blue", samples: 8 });
        groundPatch(K(s), side, 4 + w * 0.72, [w * 0.28, 0.18, l * 1.14], BLUE_D,
          { id: id + "-blue-outer", samples: 8 });
      }

      // The corner patches alone leave the rest of the lap green, which is the
      // one thing Paul Ricard never is: the painted abrasive apron is
      // CONTINUOUS — every verge, every straight, the whole way round. Laid as
      // a run of flat aprons rather than one huge patch so each piece is
      // footprint-guarded and follows the (very slight) plateau relief. The
      // white cross-lines are the Blue Zone's lane markings, which is what
      // stops all that blue reading as a swimming pool from the air.
      for (const side of [-1, 1]) {
        let i = 0;
        along(0.0, 1.0, 15, (k, spacing) => {
          const seg = spacing * 1.05;   // slight overlap so the run reads unbroken
          runoffApron(k, side, 2.5, [9, 0.16, seg], RED);
          runoffApron(k, side, 11.5, [30, 0.14, seg], (i & 1) ? BLUE : BLUE_D);
          runoffApron(k, side, 41.5, [26, 0.12, seg], (i & 1) ? BLUE_D : [0.33, 0.38, 0.60]);
          runoffApron(k, side, 67.5, [22, 0.10, seg], (i & 1) ? [0.31, 0.36, 0.58] : BLUE_D);
          if (i % 3 === 0) {
            const a = anchor(k, side, 26);
            addBox(out, vadd(a.c, a.u, 0.22), [28, 0.10, 0.9], LINE, [a.r, a.u, a.t]);
          }
          // A second lane-line further out, offset in phase, so the Blue Zone
          // reads as a marked run-off surface and never as open water.
          if (i % 3 === 1) {
            const a = anchor(k, side, 58);
            addBox(out, vadd(a.c, a.u, 0.20), [20, 0.10, 0.9], LINE, [a.r, a.u, a.t]);
          }
          i++;
        });
      }

      const openRunoff = (s) =>
        (s >= 0.92 || s <= 0.10) || (s >= 0.20 && s <= 0.44) || (s >= 0.60 && s <= 0.78);
      every(30, (k) => {
        const s = k / n;
        if (openRunoff(s)) return;
        const h = hash(k * 31);
        if (h < 0.62) return;
        pine(k, h < 0.5 ? -1 : 1, 44 + h * 22, 8 + h * 5, h < 0.75 ? PINE : PINE_D);
      });
      every(26, (k) => {
        const h = hash(k * 97 + 23);
        if (h < 0.66) return;
        bush(k, h < 0.82 ? -1 : 1, 42 + h * 16, h < 0.75 ? SCRUB : SCRUB_D);
      });
      every(50, (k) => {
        const s = k / n;
        if (openRunoff(s)) return;
        const h = hash(k * 67 + 17);
        if (h < 0.72) return;
        tree(k, h < 0.5 ? -1 : 1, 64 + h * 30, 7 + h * 4, [0.26, 0.36, 0.20]);
      });

      for (const [i, s] of [0.950, 0.970, 0.990, 0.010].entries()) {
        const a = anchor(K(s), 1, 20);
        const b = [a.r, a.u, a.t];
        modelGroup(`paul-ricard-pit-bay-${i + 1}`, {
          center: vadd(a.c, a.u, 6), size: [22, 12, 38], basis: b,
        }, (stage) => {
          stage._mat = MAT.CONCRETE;
          // Garage slab — low, wide, deliberately featureless.
          addBox(stage, vadd(a.c, a.u, 3.4), [15, 6.8, 36], WHITE, b);
          stage._mat = MAT.GLASS;
          addBox(stage, vadd(vadd(a.c, a.r, -6.6), a.u, 3.2), [0.4, 3.6, 34],
            [0.16, 0.19, 0.26], b);
          stage._mat = MAT.METAL;
          for (let d = 0; d < 4; d++) {
            const off = (d - 1.5) * 8.6;
            addBox(stage, vadd(vadd(vadd(a.c, a.t, off), a.r, -7.3), a.u, 3.3),
              [0.5, 6.4, 1.0], [0.82, 0.83, 0.86], b);
          }
          addBox(stage, vadd(a.c, a.u, 7.2), [21, 0.55, 37], [0.90, 0.91, 0.92], b);
          addBox(stage, vadd(vadd(a.c, a.r, -10.2), a.u, 6.85),
            [0.55, 0.7, 37], [0.20, 0.34, 0.62], b);
          // Column comb under the overhang — slender, evenly spaced, no bracing.
          for (let c = 0; c < 5; c++) {
            const off = (c - 2) * 7.2;
            addCyl(stage, vadd(vadd(vadd(a.c, a.t, off), a.r, -9.4), a.u, 3.4),
              0.18, 6.8, [0.86, 0.87, 0.88], 6, b);
          }
          stage._mat = 0;
        }, { required: true });
      }
      {
        const a = anchor(K(0.992), 1, 26);
        const b = [a.r, a.u, a.t];
        modelGroup("paul-ricard-race-control", {
          center: vadd(a.c, a.u, 10), size: [16, 22, 20], basis: b,
        }, (stage) => {
          stage._mat = MAT.CONCRETE;
          addBox(stage, vadd(a.c, a.u, 7), [8, 14, 9], [0.90, 0.90, 0.88], b);
          stage._mat = MAT.GLASS;
          addBox(stage, vadd(vadd(a.c, a.r, -3), a.u, 15.6), [13, 4.2, 17],
            [0.18, 0.24, 0.34], b);
          stage._mat = MAT.METAL;
          addBox(stage, vadd(vadd(a.c, a.r, -3), a.u, 18.2), [14, 0.5, 18],
            [0.90, 0.91, 0.92], b);
          addBox(stage, vadd(vadd(a.c, a.r, -3), a.u, 13.2), [13.4, 0.5, 17.4],
            [0.20, 0.34, 0.62], b);
          addCyl(stage, vadd(a.c, a.u, 18.4), 0.14, 9, [0.86, 0.86, 0.88], 5, b);
          stage._mat = 0;
        }, { required: true });
      }
      // s=0.004, not 0.000: at node 0 exactly, the span's support footprint is
      // rejected and the START gantry silently never existed. One node further
      // on is clear, and 4 m along a 5.8 km lap is invisible.
      gantry(0.004, 9, [0.15, 0.15, 0.18]);
      gantry(0.965, 8.5, [0.15, 0.15, 0.18]);
      grandstandEx(0.005, -1, 12, 150, null, null,
        { livery: "alu", tiers: 2, roof: "flat", suites: true, endWalls: true, pylons: true });
      for (let i = 0; i < 4; i++) {
        building(K(0.918 + i * 0.013), 1, 40, 30, 9, 15,
          { kind: "slab", wall: [0.87, 0.87, 0.86], window: [0.30, 0.34, 0.42], floor: 4.5 });
      }
      every(46, (k) => {
        const s = k / n, h = hash(k * 71 + 31);
        if (!(s > 0.90 || s < 0.05) || h < 0.52) return;
        motorhome(k, 1, 58 + h * 10, 10, 4, 6, { wall: [0.66 + h * 0.24, 0.66, 0.68] });
      });
      broadcastCompound(K(0.908), 1, 76, { vans: 3, dishes: 2, mastH: 9 });
      for (const s of [0.975, 0.01, 0.03]) billboard(K(s), -1, 8, 12, 4.5, [0.20, 0.34, 0.70]);

      const bleacher = (s0, s1, side, gap, opts) => {
        opts = opts || {};
        const rows = opts.rows || 6, rise = opts.rise || 0.75, depth = opts.depth || 1.0;
        along(s0, s1, opts.step || 9, (k, spacing) => {
          const a = anchor(k, side, gap);
          const b = [a.r, a.u, a.t], seg = spacing * 0.94;
          // Scaffold rake: two tube legs per station carrying the whole tier.
          out._mat = MAT.METAL;
          for (const f of [0.25, 0.85]) {
            const back = f * rows * depth, up = f * rows * rise;
            addCyl(out, vadd(vadd(a.c, a.r, side * back), a.u, up * 0.5),
              0.09, up + 0.4, [0.62, 0.64, 0.68], 5, b);
          }
          // Diagonal brace — the giveaway that this is a temporary frame.
          addBox(out, vadd(vadd(a.c, a.r, side * rows * depth * 0.55),
            a.u, rows * rise * 0.55), [rows * depth * 1.2, 0.10, 0.10],
            [0.62, 0.64, 0.68], b);
          for (let r = 0; r < rows; r++) {
            const back = r * depth, up = 0.5 + r * rise;
            addBox(out, vadd(vadd(a.c, a.r, side * back), a.u, up),
              [depth, rise + 0.14, seg], r & 1 ? ALU : [0.71, 0.73, 0.76], b);
            // Thin, scattered crowd — a Paul Ricard grandstand is rarely full.
            const h = hash(k * 13 + r * 7);
            if (h < 0.70) continue;
            out._mat = MAT.FABRIC;
            addBox(out, vadd(vadd(vadd(a.c, a.r, side * back),
              a.t, (h - 0.5) * seg * 0.8), a.u, up + 0.55),
              [0.5, 0.9, 0.55], h < 0.8 ? [0.80, 0.34, 0.28] : [0.30, 0.40, 0.66], b);
            out._mat = MAT.METAL;
          }
          out._mat = 0;
        });
      };
      bleacher(0.055, 0.095, 1, 66, { rows: 8 });
      bleacher(0.545, 0.590, 1, 72, { rows: 8 });
      bleacher(0.890, 0.930, -1, 58, { rows: 7 });
      bleacher(0.700, 0.740, -1, 54, { rows: 6, step: 7 });
      bleacher(0.115, 0.150, -1, 52, { rows: 6, step: 8 });   // exit of the Verrerie esses
      bleacher(0.470, 0.505, -1, 56, { rows: 6, step: 8 });   // opposite the Mistral chicane
      spectatorHill(0.68, 0.76, 1, 60, { rows: 3, rise: 1.0, depth: 1.8, density: 0.34, step: 9 });
      for (const s of [0.070, 0.560, 0.905]) marshalPost(K(s), -1, 12);
      for (const s of [0.44, 0.72]) marshalPost(K(s), 1, 12);

      for (const [s0, s1] of [[0.11, 0.19], [0.45, 0.59], [0.79, 0.87]]) {
        guardrail(s0, s1, -1, 12, [0.80, 0.81, 0.83]);
        guardrail(s0, s1,  1, 12, [0.80, 0.81, 0.83]);
      }
      guardrail(0.94, 0.06, 1, 5.0, [0.85, 0.85, 0.88]);
      fence(0.95, 0.05, -1, 10, 4, [0.74, 0.76, 0.80]);
      for (const s of [0.15, 0.26, 0.34, 0.50, 0.64, 0.82]) {
        marshalPost(K(s), hash(K(s)) < 0.5 ? -1 : 1, 14);
      }

      const cx = px.reduce((a, b) => a + b, 0) / n, cz = pz.reduce((a, b) => a + b, 0) / n;
      let rad = 0;
      for (let i = 0; i < n; i++) rad = Math.max(rad, Math.hypot(px[i] - cx, pz[i] - cz));
      for (const [extra, count, len, w, hMin, hVar, col] of [
        [140, 40, 140, 44, 12, 7, [0.28, 0.34, 0.21]],
        [250, 32, 190, 60, 26, 15, [0.34, 0.35, 0.28]],
        [400, 24, 250, 80, 54, 32, [0.52, 0.50, 0.44]],   // pale limestone ridge
      ]) {
        for (let i = 0; i < count; i++) {
          const a = i / count * 6.2832, h = hash(i * 7 + extra);
          const r = rad + extra + h * 36;
          const tx = cx + Math.cos(a) * r, tz = cz + Math.sin(a) * r;
          if (onTrack(tx, tz, 34)) continue;
          ridge(tx, tz, pyMin, a + 1.5708, len, w, hMin + h * hVar, col);
        }
      }

      groundPatch(K(0.50), 1, 104, [86, 0.16, 240], [0.60, 0.60, 0.59],
        { id: "paul-ricard-airfield-apron", samples: 10 });
      groundPatch(K(0.50), 1, 196, [22, 0.16, 300], [0.44, 0.45, 0.46],
        { id: "paul-ricard-runway", samples: 10 });
      groundPatch(K(0.50), 1, 166, [30, 0.16, 280], [0.52, 0.52, 0.51],
        { id: "paul-ricard-taxiway", samples: 10 });
      for (let i = 0; i < 9; i++) {
        const a = anchor(K(0.40 + i * 0.025), 1, 196);
        addBox(out, vadd(a.c, a.u, 0.22), [1.2, 0.10, 14], LINE, [a.r, a.u, a.t]);
      }
      for (let i = 0; i < 10; i++) {
        const a = anchor(K(0.41 + i * 0.020), 1, 166);
        addBox(out, vadd(a.c, a.u, 0.22), [1.0, 0.10, 8], [0.86, 0.74, 0.18], [a.r, a.u, a.t]);
      }
      {
        const a = anchor(K(0.50), 1, 150);
        const b = [a.r, a.u, a.t];
        modelGroup("paul-ricard-aerodrome", {
          center: vadd(a.c, a.u, 8), size: [46, 20, 150], basis: b,
        }, (stage) => {
          // Three curved-roof hangars in a row, doors facing the apron.
          for (let i = 0; i < 3; i++) {
            const p = vadd(a.c, a.t, (i - 1) * 42);
            stage._mat = MAT.CONCRETE;
            addBox(stage, vadd(p, a.u, 4), [26, 8, 32], [0.80, 0.80, 0.78], b);
            stage._mat = MAT.METAL;
            // Barrel roof, laid along the hangar's length like a real Nissen span.
            addCyl(stage, vadd(vadd(p, a.u, 8), a.t, -16), 13, 32,
              [0.68, 0.70, 0.73], 10, [a.r, a.t, a.u]);
            // Full-width sliding door band on the apron face.
            addBox(stage, vadd(vadd(p, a.r, -13.1), a.u, 3.4), [0.3, 6.4, 28],
              [0.40, 0.43, 0.48], b);
          }
          stage._mat = 0;
        });
      }
      {
        const a = anchor(K(0.545), 1, 128);
        const b = [a.r, a.u, a.t];
        modelGroup("paul-ricard-airfield-tower", {
          center: vadd(a.c, a.u, 12), size: [12, 30, 12], basis: b,
        }, (stage) => {
          stage._mat = MAT.CONCRETE;
          addBox(stage, vadd(a.c, a.u, 8), [7, 16, 7], WHITE, b);
          stage._mat = MAT.GLASS;
          addFrustum(stage, vadd(a.c, a.u, 16), 4.2, 5.4, 4, [0.22, 0.30, 0.40], 8, b);
          stage._mat = MAT.METAL;
          addBox(stage, vadd(a.c, a.u, 20.4), [12, 0.5, 12], [0.86, 0.87, 0.90], b);
          addCyl(stage, vadd(a.c, a.u, 20), 0.10, 7, [0.86, 0.86, 0.88], 5, b);
          // Windsock on its own mast beside the tower — 16 m along the
          // tangent and 6 m across from the anchor's single ground sample.
          // TRAP B (docs/SCENERY-GROUNDING.md §2): resample the ground
          // actually under the mast rather than reusing a.c's height.
          const w = vadd(vadd(a.c, a.t, 16), a.r, -6);
          const wy = terrainYAt(w[0], w[2]);
          if (wy != null) w[1] = wy;
          addCyl(stage, w, 0.14, 9, [0.86, 0.86, 0.88], 6, b);
          addFrustum(stage, vadd(w, a.u, 8.4), 0.95, 0.35, 2.8,
            [0.92, 0.44, 0.14], 6, [a.r, a.t, a.u]);
          stage._mat = 0;
        }, { required: true });
      }
      for (let i = 0; i < 3; i++) {
        const a = anchor(K(0.465 + i * 0.022), 1, 118);
        const b = [a.r, a.u, a.t];
        modelGroup(`paul-ricard-lightplane-${i + 1}`, {
          center: vadd(a.c, a.u, 1.8), size: [12, 4, 9], basis: b,
        }, (stage) => {
          const body = vadd(a.c, a.u, 1.5);
          stage._mat = MAT.METAL;
          addBox(stage, body, [1.1, 1.1, 7], WHITE, b);
          addBox(stage, body, [10, 0.3, 1.5], WHITE, b);                       // high wing
          addBox(stage, vadd(vadd(body, a.t, -3.0), a.u, 0.9), [0.25, 1.8, 1.3],
            i % 2 ? [0.20, 0.34, 0.62] : [0.72, 0.24, 0.22], b);               // fin
          addBox(stage, vadd(body, a.t, -3.0), [3.2, 0.22, 1.0], WHITE, b);    // tailplane
          addCone(stage, vadd(body, a.t, 3.6), 0.5, 1.2, [0.30, 0.32, 0.36], 6,
            [a.r, a.t, a.u]);                                                  // spinner
          stage._mat = MAT.GLASS;
          addBox(stage, vadd(body, a.u, 0.55), [0.9, 0.5, 1.8], [0.28, 0.38, 0.46], b);
          stage._mat = 0;
        });
      }

      const windTurbine = (id, s, side, dist, h) => {
        const a = anchor(K(s), side, dist);
        const b = [a.r, a.u, a.t];
        if (onTrack(a.c[0], a.c[2], 46)) return;
        const HUB = [0.90, 0.90, 0.92], BLADE = [0.95, 0.95, 0.95];
        modelGroup(id, {
          center: vadd(a.c, a.u, h * 0.6), size: [h * 1.3, h * 1.7, h * 1.3], basis: b,
        }, (stage) => {
          stage._mat = MAT.METAL;
          // Tapered tubular tower.
          addFrustum(stage, a.c, 2.4, 1.15, h, WHITE, 9, b);
          const top = vadd(a.c, a.u, h);
          // Nacelle, with the rotor hub on a short spinner off its upwind face.
          addBox(stage, top, [2.6, 2.4, 6.2], HUB, b);
          const hub = vadd(top, a.t, -3.6);
          addCyl(stage, hub, 0.78, 1.3, HUB, 8, [a.r, a.t, a.u]);
          const bl = h * 0.46, phase = hash(dist * 3 + s * 90) * 1.2;
          for (let i = 0; i < 3; i++) {
            const ang = i * 2.0944 + phase, cA = Math.cos(ang), sA = Math.sin(ang);
            // dir is the blade's radial axis in the rotor plane; perp completes an
            // orthonormal basis with it and a.t (the rotor's own axis), so the
            // blade box can never shear into a non-finite vertex.
            const dir = [], perp = [];
            for (let ax = 0; ax < 3; ax++) {
              dir[ax] = a.r[ax] * cA + a.u[ax] * sA;
              perp[ax] = -a.r[ax] * sA + a.u[ax] * cA;
            }
            // Long thin blade: thin out of the rotor plane (a.t), some chord in it.
            addBox(stage, vadd(hub, dir, bl * 0.5 + 1.0), [0.4, bl, 0.9], BLADE,
              [a.t, dir, perp]);
          }
          stage._mat = 0;
        });
      };
      for (const [id, s, side, dist, h] of [
        ["pr-turbine-1", 0.150, -1, 170, 52],
        ["pr-turbine-2", 0.225, -1, 198, 46],
        ["pr-turbine-3", 0.315,  1, 190, 50],
        ["pr-turbine-4", 0.640, -1, 178, 54],
        ["pr-turbine-5", 0.760, -1, 160, 48],
        ["pr-turbine-6", 0.845,  1, 172, 50],
        ["pr-turbine-7", 0.055,  1, 184, 46],
        ["pr-turbine-8", 0.430, -1, 176, 48],
        ["pr-turbine-9", 0.905, -1, 158, 50],
      ]) windTurbine(id, s, side, dist, h);

      groundPatch(K(0.955), 1, 44, [76, 0.16, 200], [0.56, 0.56, 0.55],
        { id: "paul-ricard-paddock-apron", samples: 10 });
      for (let i = 0; i < 14; i++) {
        const a = anchor(K(0.925 + i * 0.008), 1, 52);
        addBox(out, vadd(a.c, a.u, 0.22), [64, 0.09, 0.5], LINE, [a.r, a.u, a.t]);
      }
      groundPatch(K(0.885), 1, 92, [40, 0.16, 40], [0.50, 0.50, 0.50],
        { id: "paul-ricard-helipad", samples: 6 });
      {
        const a = anchor(K(0.885), 1, 112);
        addFrustum(out, vadd(a.c, a.u, 0.24), 9, 9, 0.10, LINE, 14, [a.r, a.u, a.t]);
        addFrustum(out, vadd(a.c, a.u, 0.28), 7.6, 7.6, 0.10, [0.50, 0.50, 0.50], 14,
          [a.r, a.u, a.t]);
      }
      for (const s of [0.965, 0.985, 0.015]) {
        prop(K(s), -1, 5, [1.6, 1.4, 60], [0.92, 0.92, 0.90]);
      }
      for (let i = 0; i < 3; i++) signBoard(K(0.398 + i * 0.010), 1, 8, "braking", 3 - i);
      signBoard(K(0.052), -1, 8, "corner", 1);
      signBoard(K(0.560), -1, 9, "corner", 8);
      sponsorHoarding(0.935, 0.070, -1, 3.6, { h: 1.25, step: 10 });
      sponsorHoarding(0.400, 0.465, 1, 3.6, { h: 1.25, step: 11 });
      cameraTower(K(0.030), -1, 26, { h: 17 });
      cameraTower(K(0.565), 1, 84, { h: 20 });
      cameraTower(K(0.910), -1, 70, { h: 17 });

      {
        const VINE = [0.26, 0.36, 0.20], VINE_D = [0.21, 0.30, 0.17];
        const LAV = [0.44, 0.38, 0.62], LAV_D = [0.36, 0.31, 0.54];
        const SOIL = [0.72, 0.66, 0.52];
        for (const [id, s, side, gap, rows, kind] of [
          ["vine-north",  0.150, -1,  96, 18, 0],
          ["vine-east",   0.310,  1, 104, 16, 0],
          ["lav-south",   0.660, -1,  92, 16, 1],
          ["vine-west",   0.820,  1,  84, 14, 0],
          ["lav-north",   0.075,  1, 104, 12, 1],
          ["vine-far-n",  0.200, -1, 176, 14, 0],
          ["vine-far-s",  0.700, -1, 168, 12, 0],
          ["lav-east",    0.380,  1, 168, 12, 1],
          ["vine-mistral", 0.480, -1, 118, 14, 0],
          ["lav-west",    0.880,  1, 148, 10, 1],
          ["vine-verrerie", 0.110, -1, 130, 18, 0],
          ["lav-north-e",   0.170,  1, 124, 10, 1],
          ["lav-t2",        0.260,  1, 130, 12, 1],
          ["vine-signes",   0.590, -1, 128, 18, 0],
          ["vine-beausset", 0.735,  1, 112, 14, 0],
          ["lav-far-w",     0.860, -1, 152, 12, 1],
          ["vine-far-e",    0.340, -1, 150, 16, 0],
          ["vine-t2-out",   0.200,  1, 152, 12, 0],
          ["lav-signes-o",  0.610,  1, 150, 12, 1],
          ["vine-beau2",    0.780, -1, 122, 14, 0],
        ]) {
          // Bare tilled ground under the parcel, so rows sit on soil not grass.
          groundPatch(K(s), side, gap, [rows * 4.5, 0.15, 120], SOIL,
            { id: `paul-ricard-${id}-soil`, samples: 8 });
          for (let r = 0; r < rows; r++) {
            const a = anchor(K(s), side, gap + (r - rows / 2) * 4.2);
            const b = [a.r, a.u, a.t];
            if (onTrack(a.c[0], a.c[2], 4)) continue;
            const alt = (r & 1);
            if (kind === 0) {
              addBox(out, vadd(a.c, a.u, 0.95), [0.85, 1.5, 112],
                alt ? VINE : VINE_D, b);
              // TRAP B (docs/SCENERY-GROUNDING.md §2): the posts walk up to
              // 54 m along the tangent from a.c's single ground sample —
              // reusing that height stranded them up to ~2 m in the air on
              // this rolling plateau. Re-seat each post on the ground
              // actually under it; terrainYAt is null off the rendered
              // ribbon, where a.c's height is the best guess left.
              for (const t of [-54, -18, 18, 54]) {
                const pbase = vadd(a.c, a.t, t);
                const py_ = terrainYAt(pbase[0], pbase[2]);
                if (py_ != null) pbase[1] = py_;
                addCyl(out, vadd(pbase, a.u, 0.1), 0.07, 2.0,
                  [0.52, 0.44, 0.32], 4, b);
              }
            } else {
              addBox(out, vadd(a.c, a.u, 0.42), [1.5, 0.85, 108],
                alt ? LAV : LAV_D, b);
            }
          }
        }
        const a = anchor(K(0.235), -1, 90);
        const b = [a.r, a.u, a.t];
        const DRY = [0.72, 0.68, 0.58], DRY_D = [0.62, 0.58, 0.49];
        modelGroup("paul-ricard-cabanon", {
          center: vadd(a.c, a.u, 3), size: [10, 8, 14], basis: b,
        }, (stage) => {
          addBox(stage, vadd(a.c, a.u, 2.1), [6, 4.2, 8], DRY, b);
          addPrism(stage, vadd(a.c, a.u, 4.2), [6.6, 1.8, 8.6], [0.58, 0.40, 0.30], b);
          addBox(stage, vadd(vadd(a.c, a.r, -3.2), a.u, 1.5), [0.25, 2.2, 1.1],
            [0.34, 0.28, 0.22], b);                              // door
        });
        // The wall running off the cabanon, in irregular courses — its OWN
        // guarded run, not part of the cabanon group. The 14-course version
        // reached t≈48, i.e. ~34 m past the hut group's ±7 m bounds, so most
        // of the wall escaped the atomic footprint preflight the group exists
        // to provide; the per-box road guard then silently dropped courses
        // 7-13 (measured), shipping half a wall the code claimed was whole.
        // Seven courses is what has always actually shipped, and these bounds
        // cover exactly that run.
        modelGroup("paul-ricard-drywall", {
          center: vadd(vadd(a.c, a.t, 17.3), a.u, 0.75), size: [0.8, 2, 22], basis: b,
        }, (stage) => {
          for (let i = 0; i < 7; i++)
            addBox(stage, vadd(vadd(a.c, a.t, 8 + i * 3.1), a.u, 0.6 + (i & 1) * 0.1),
              [0.7, 1.2 + (i % 3) * 0.15, 3.0], (i & 1) ? DRY_D : DRY, b);
        });
      }
    };
