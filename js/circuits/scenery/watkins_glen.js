/* Apex 26 — WATKINS_GLEN scenery (data only), split out of js/circuits/watkins_glen.js.
   LAZY_SCENERY (tools/manifest.cjs): no <script> tag. game.js fetches the ONE
   circuit a session builds; all 40 together were 1,083 KB of the boot wall for
   a player who races one of them. Body moved verbatim — see tools/manifest.cjs
   and tests/unit/load-order.test.mjs for the lockstep. */
"use strict";
(window.TrackScenery = window.TrackScenery || {})["watkins_glen"] =
  function (api) {
      const { out, MAT, n, pyMin, hash, every, anchor, vadd, onTrack, px, pz, seat,
        pine, tree, bush, ridge, grandstandEx, spectatorHill, sponsorHoarding,
        broadcastCompound, gantry, marshalPost, motorhome, waterBand,
        fence, guardrail, tyreWall, groundPatch, modelGroup,
        addBox, addCyl, addFrustum, forestEdge } = api;
      const K = (s) => Math.round(s * n) % n;

      // Autumn hardwood palette — maple/oak turning, with dark conifer behind.
      const MAPLE = [0.62, 0.24, 0.12], SCARLET = [0.70, 0.31, 0.10];
      const AMBER = [0.72, 0.50, 0.14], OAK = [0.48, 0.33, 0.15];
      const LEAF = [0.20, 0.42, 0.19], LEAF_D = [0.15, 0.34, 0.16];
      const FIR = [0.10, 0.26, 0.14];
      const BARK = [0.35, 0.32, 0.30];          // grey maple bark
      const GRAVEL = [0.66, 0.61, 0.48];
      const TIMBER = [0.46, 0.36, 0.26], WEATHERED = [0.56, 0.54, 0.50];

      const FALL = [MAPLE, SCARLET, AMBER, OAK];
      const maple = (k, side, dist, h, col) => {
        const a = anchor(k, side, dist), b = [a.r, a.u, a.t];
        out._mat = MAT.WOOD;
        seat.cyl(out, a.c, 0.22 + h * 0.012, h * 0.42, BARK, 5, b);
        out._mat = MAT.FOLIAGE;
        for (let i = 0; i < 3; i++) {
          const ang = i * 2.094 + hash(k + i) * 1.2, rr = h * 0.16;
          const p = vadd(vadd(vadd(a.c, a.u, h * (0.40 + i * 0.09)),
            a.r, Math.cos(ang) * rr), a.t, Math.sin(ang) * rr);
          seat.frustum(out, p, h * (0.30 - i * 0.06), h * (0.34 - i * 0.09), h * 0.26, col, 6, b);
        }
        seat.cone(out, vadd(a.c, a.u, h * 0.76), h * 0.24, h * 0.30, col, 6, b);
        out._mat = 0;
      };
      const openArea = (s) => (s >= 0.93 || s <= 0.08) || (s >= 0.24 && s <= 0.34);
      every(20, (k) => {
        const s = k / n;
        if (openArea(s)) return;
        const h = hash(k * 31);
        if (h < 0.14) return;
        const side = h < 0.5 ? -1 : 1;
        maple(k, side, 10 + h * 8, 13 + h * 9, FALL[Math.floor(h * 4) % 4]);
        if (h > 0.30) tree(k, -side, 12 + h * 9, 12 + h * 8, h < 0.55 ? LEAF_D : MAPLE);
      });
      every(30, (k) => {
        const s = k / n;
        if (openArea(s)) return;
        const h = hash(k * 53 + 9);
        if (h < 0.26) return;
        pine(k, h < 0.5 ? -1 : 1, 26 + h * 16, 18 + h * 12, FIR);
        if (h > 0.68) tree(k, h > 0.84 ? -1 : 1, 40 + h * 22, 13 + h * 8, OAK);
      });
      every(48, (k) => {
        const s = k / n;
        if (openArea(s)) return;
        const h = hash(k * 67 + 17);
        if (h < 0.36) return;
        pine(k, h < 0.5 ? -1 : 1, 52 + h * 28, 22 + h * 13, FIR);
      });
      every(26, (k) => {
        const s = k / n;
        if (openArea(s)) return;
        const h = hash(k * 97 + 23);
        if (h < 0.56) return;
        bush(k, h < 0.75 ? -1 : 1, 7 + h * 5, h < 0.68 ? [0.66, 0.28, 0.12] : [0.24, 0.32, 0.16]);
      });

      {
        const a = anchor(K(0.980), 1, 15), b = [a.r, a.u, a.t], inw = -1;
        const bays = 14, pitch = 6.6, len = bays * pitch;
        modelGroup("glen-pit-garages", {
          center: vadd(a.c, a.u, 5), size: [14, 12, len + 4], basis: b,
        }, (stage) => {
          stage._mat = MAT.CONCRETE;
          seat.box(stage, a.c, [11, 5.6, len], [0.76, 0.75, 0.72], b);
          for (let i = 0; i < bays; i++) {
            const p = vadd(vadd(a.c, a.t, (i - (bays - 1) / 2) * pitch), a.r, inw * 5.4);
            // Roll-up door: a corrugated shutter with its guide rails either side.
            seat.box(stage, p, [0.35, 4.2, 5.0], [0.34, 0.36, 0.38], b);
            for (const dz of [-2.7, 2.7])
              seat.box(stage, vadd(p, a.t, dz), [0.5, 4.4, 0.4], [0.66, 0.65, 0.62], b);
            seat.box(stage, vadd(p, a.u, 4.2), [0.6, 0.45, 5.6], [0.62, 0.61, 0.58], b);
          }
          // The roof IS the timing stand: a parapet and a pipe rail, nothing more.
          seat.box(stage, vadd(a.c, a.u, 5.6), [11.6, 0.35, len + 1], [0.68, 0.67, 0.64], b);
          seat.box(stage, vadd(vadd(a.c, a.u, 5.95), a.r, inw * 5.6), [0.4, 0.9, len + 1], [0.72, 0.71, 0.68], b);
          stage._mat = MAT.METAL;
          for (let i = 0; i <= bays; i++)
            seat.cyl(stage, vadd(vadd(vadd(a.c, a.t, (i - bays / 2) * pitch), a.r, inw * 5.4), a.u, 5.95),
              0.07, 1.1, [0.55, 0.56, 0.58], 5, b);
          addBox(stage, vadd(vadd(a.c, a.u, 7.0), a.r, inw * 5.4), [0.1, 0.1, len], [0.55, 0.56, 0.58], b);
          stage._mat = 0;
        }, { required: true });
      }
      {
        const a = anchor(K(0.999), 1, 17), b = [a.r, a.u, a.t];
        modelGroup("glen-timing-tower", {
          center: vadd(a.c, a.u, 12), size: [14, 30, 14], basis: b,
        }, (stage) => {
          stage._mat = MAT.METAL;
          const STL = [0.52, 0.53, 0.55];
          const legs = [[-3.2, -3.2], [3.2, -3.2], [-3.2, 3.2], [3.2, 3.2]];
          for (const [dr, dt] of legs)
            seat.cyl(stage, vadd(vadd(a.c, a.r, dr), a.t, dt), 0.19, 20, STL, 5, b);
          for (let i = 1; i <= 7; i++) {
            const y = i * 2.6;
            addBox(stage, vadd(a.c, a.u, y), [6.8, 0.15, 0.15], STL, b);
            addBox(stage, vadd(a.c, a.u, y), [0.15, 0.15, 6.8], STL, b);
            // One leaning member per face per bay — the X reads from a distance.
            addBox(stage, vadd(a.c, a.u, y - 1.3), [7.3, 0.12, 0.12], [0.46, 0.47, 0.49], b);
            addBox(stage, vadd(a.c, a.u, y - 1.3), [0.12, 0.12, 7.3], [0.46, 0.47, 0.49], b);
          }
          stage._mat = MAT.WOOD;
          seat.box(stage, vadd(a.c, a.u, 14), [8.4, 3.2, 8.4], [0.62, 0.58, 0.50], b);
          stage._mat = MAT.GLASS;
          seat.box(stage, vadd(vadd(a.c, a.u, 15.2), a.r, -4.3), [0.3, 1.5, 7.2], [0.22, 0.26, 0.30], b);
          stage._mat = MAT.METAL;
          seat.box(stage, vadd(a.c, a.u, 17.2), [9.0, 0.3, 9.0], [0.50, 0.51, 0.53], b);
          seat.cyl(stage, vadd(a.c, a.u, 17.5), 0.09, 9, [0.86, 0.86, 0.84], 5, b);   // flagpole
          stage._mat = 0;
        }, { required: true });
      }
      gantry(0.0, 8, [0.15, 0.15, 0.18]);
      gantry(0.968, 7.5, [0.15, 0.15, 0.18]);
      for (let i = 0; i < 3; i++) {
        // Paddock is open-sided tech sheds, not offices — low, wide and bare.
        const a = anchor(K(0.928 + i * 0.016), 1, 38), b = [a.r, a.u, a.t];
        modelGroup(`glen-tech-shed-${i}`, {
          center: vadd(a.c, a.u, 4), size: [18, 10, 30], basis: b,
        }, (stage) => {
          stage._mat = MAT.METAL;
          seat.box(stage, a.c, [14, 5.5, 26], [0.68, 0.68, 0.66], b);
          for (let j = 0; j * 1.5 < 26; j++)
            addBox(stage, vadd(vadd(a.c, a.t, -13 + j * 1.5 + 0.75), a.u, 5.75),
              [14.6, 0.3, 0.8], (j % 2) ? [0.72, 0.72, 0.70] : [0.62, 0.62, 0.60], b);
          stage._mat = 0;
        });
      }
      every(48, (k) => {
        const s = k / n, h = hash(k * 71 + 31);
        if (!(s > 0.90 || s < 0.05) || h < 0.55) return;
        motorhome(k, 1, 52 + h * 10, 10, 4, 6, { wall: [0.66 + h * 0.24, 0.66, 0.68] });
      });
      broadcastCompound(K(0.918), 1, 68, { vans: 2, dishes: 2, mastH: 9 });
      sponsorHoarding(0.955, 0.045, -1, 6.5, { h: 2.2, step: 10,
        palette: [[0.20, 0.28, 0.54], [0.82, 0.18, 0.16], [0.92, 0.90, 0.86], [0.18, 0.36, 0.24]] });

      const CROWD = [[0.30, 0.32, 0.36], [0.68, 0.24, 0.20], [0.84, 0.82, 0.78],
                     [0.22, 0.30, 0.48], [0.56, 0.44, 0.26], [0.20, 0.22, 0.24]];
      const bleacher = (id, k, side, dist, bays, rows) => {
        const pitch = 5.8, len = bays * pitch;
        const a = anchor(k, side, dist), b = [a.r, a.u, a.t], inw = -side;
        const topH = 1.0 + rows * 0.72;
        modelGroup(id, {
          center: vadd(a.c, a.u, topH * 0.6), size: [10, topH + 3, len + 2], basis: b,
        }, (stage) => {
          stage._mat = MAT.WOOD;
          for (let i = 0; i <= bays; i++) {
            const p = vadd(a.c, a.t, (i - bays / 2) * pitch);
            // A raked pair of posts per bay plus the stringer between them.
            seat.box(stage, vadd(p, a.r, -inw * 3.0), [0.28, topH, 0.28], TIMBER, b);
            seat.box(stage, vadd(p, a.r, inw * 3.0), [0.28, 1.0, 0.28], TIMBER, b);
            addBox(stage, vadd(vadd(p, a.r, 0), a.u, topH * 0.55), [6.4, 0.22, 0.22], TIMBER, b);
          }
          for (let t = 0; t < rows; t++) {
            const lat = inw * (2.7 - t * 0.9), y = 0.7 + t * 0.72;
            seat.box(stage, vadd(vadd(a.c, a.r, lat), a.u, y), [0.85, 0.16, len], WEATHERED, b);
            seat.box(stage, vadd(vadd(a.c, a.r, lat - inw * 0.45), a.u, y - 0.4),
              [0.16, 0.4, len], [0.48, 0.46, 0.42], b);            // foot board
            // Fall crowd in coats — bare planks read as a woodpile otherwise.
            stage._mat = MAT.FABRIC;
            for (let j = 0; j * 0.8 < len - 2; j++) {
              const h2 = hash(k * 23 + t * 71 + j * 41);
              if (h2 < 0.40) continue;
              seat.box(stage, vadd(vadd(vadd(a.c, a.r, lat), a.t, -len / 2 + 1 + j * 0.8), a.u, y + 0.16),
                [0.5, 0.95, 0.42], CROWD[Math.floor(h2 * 83) % CROWD.length], b);
            }
            stage._mat = MAT.WOOD;
          }
          // Guard rail across the back, which is all the structure there is.
          for (let i = 0; i <= bays; i++)
            seat.box(stage, vadd(vadd(a.c, a.t, (i - bays / 2) * pitch), a.r, -inw * 3.0),
              [0.2, topH + 1.0, 0.2], TIMBER, b);
          addBox(stage, vadd(vadd(a.c, a.u, topH + 0.9), a.r, -inw * 3.0), [0.3, 0.16, len], TIMBER, b);
          stage._mat = 0;
        });
      };
      bleacher("glen-bleacher-pit-a", K(0.010), -1, 12, 14, 8);
      bleacher("glen-bleacher-pit-b", K(0.955), -1, 12, 10, 7);
      bleacher("glen-bleacher-t1", K(0.090), -1, 18, 10, 7);
      bleacher("glen-bleacher-anvil", K(0.900), 1, 18, 11, 8);
      grandstandEx(0.030, -1, 13, 72, null, null,
        { livery: "scaffold", roof: "none", endWalls: true, h: 8 });

      groundPatch(K(0.090), 1, 6, [34, 0.18, 46], GRAVEL,
        { id: "watkins-t1-gravel", samples: 8 });
      tyreWall(0.074, 0.108, 1, 5, [0.86, 0.20, 0.18]);
      marshalPost(K(0.084), -1, 10);

      groundPatch(K(0.245), -1, 6, [30, 0.18, 42], GRAVEL,
        { id: "watkins-esses-gravel", samples: 7 });
      tyreWall(0.230, 0.262, -1, 5, [0.20, 0.40, 0.85]);
      spectatorHill(0.20, 0.30, 1, 15, { rows: 4, rise: 1.2, depth: 1.9, density: 0.46, step: 8 });
      marshalPost(K(0.250), 1, 9);

      groundPatch(K(0.615), 1, 5, [26, 0.18, 34], GRAVEL,
        { id: "watkins-boot-gravel", samples: 6 });
      marshalPost(K(0.610), -1, 9);

      groundPatch(K(0.900), -1, 5, [28, 0.18, 36], GRAVEL,
        { id: "watkins-anvil-gravel", samples: 6 });
      tyreWall(0.885, 0.918, -1, 4, [0.85, 0.78, 0.20]);
      marshalPost(K(0.894), 1, 9);

      spectatorHill(0.50, 0.60, -1, 16, { rows: 3, rise: 1.0, depth: 1.8, density: 0.38, step: 9 });
      spectatorHill(0.72, 0.80, 1, 16, { rows: 3, rise: 1.0, depth: 1.8, density: 0.38, step: 9 });

      for (const [s0, s1] of [[0.12, 0.22], [0.27, 0.42], [0.48, 0.58], [0.63, 0.88]]) {
        guardrail(s0, s1, -1, 7, [0.80, 0.81, 0.83]);
        guardrail(s0, s1,  1, 7, [0.80, 0.81, 0.83]);
      }
      guardrail(0.94, 0.06, 1, 4.0, [0.85, 0.85, 0.88]);
      fence(0.95, 0.06, -1, 9, 4, [0.74, 0.76, 0.80]);
      for (const s of [0.16, 0.36, 0.45, 0.55, 0.68, 0.82]) {
        marshalPost(K(s), hash(K(s)) < 0.5 ? -1 : 1, 9);
      }

      const cx = px.reduce((a, b) => a + b, 0) / n, cz = pz.reduce((a, b) => a + b, 0) / n;
      let rad = 0;
      for (let i = 0; i < n; i++) rad = Math.max(rad, Math.hypot(px[i] - cx, pz[i] - cz));
      waterBand(0.30, 0.46, -1, 250, 560, 20, [0.15, 0.28, 0.38], { id: "glen-seneca-lake" });
      const lakeC = anchor(K(0.38), -1, 380).c;
      const lakeAng = Math.atan2(lakeC[2] - cz, lakeC[0] - cx);
      for (const [extra, count, len, w, hMin, hVar, col] of [
        [120, 50, 120, 32, 16, 8, [0.20, 0.36, 0.18]],
        [210, 40, 165, 44, 26, 14, [0.24, 0.32, 0.17]],
        [340, 30, 230, 62, 44, 24, [0.28, 0.32, 0.24]],
      ]) {
        for (let i = 0; i < count; i++) {
          const a = i / count * 6.2832, h = hash(i * 7 + extra);
          if (extra < 200) {
            let d = Math.abs(a - lakeAng) % 6.2832;
            if (d > 3.1416) d = 6.2832 - d;
            if (d < 0.85) continue;
          }
          const r = rad + extra + h * 34;
          const tx = cx + Math.cos(a) * r, tz = cz + Math.sin(a) * r;
          if (onTrack(tx, tz, 32)) continue;
          ridge(tx, tz, pyMin, a + 1.5708, len, w, hMin + h * hVar, col);
        }
      }

      {
        const deck = 6.4, RED = [0.48, 0.19, 0.15], SHINGLE = [0.34, 0.30, 0.28];
        const spans = [
          ["watkins-footbridge", deck, 1.4, 5.2, 26, [0.46, 0.40, 0.32]],
          ["glen-bridge-wall", deck + 1.4, 3.0, 5.0, 24, RED],
          ["glen-bridge-eave", deck + 4.4, 0.5, 6.2, 26, RED],
          ["glen-bridge-mid", deck + 4.9, 0.5, 4.2, 25, SHINGLE],
          ["glen-bridge-ridge", deck + 5.4, 0.6, 2.0, 24, SHINGLE],
        ];
        for (const [id, clearance, thickness, depth, span, color] of spans) {
          api.overheadSpan({
            id, frac: 0.365, clearance, thickness, depth, span,
            supports: false, color, required: id === "watkins-footbridge",
          });
        }
        // Timber trestle bents and the gabled portal at each abutment.
        for (const side of [-1, 1]) {
          const a = anchor(K(0.365), side, 4.2), b = [a.r, a.u, a.t];
          modelGroup(`watkins-footbridge-pier-${side < 0 ? "left" : "right"}`, {
            center: vadd(a.c, a.u, (deck + 6) / 2),
            size: [4.0, deck + 6, 7.0],
            basis: b,
          }, (stage) => {
            stage._mat = MAT.WOOD;
            for (const dt of [-2.4, 0, 2.4])
              seat.cyl(stage, vadd(a.c, a.t, dt), 0.42, deck, [0.42, 0.36, 0.30], 6, b);
            for (const y of [deck * 0.35, deck * 0.72])
              addBox(stage, vadd(a.c, a.u, y), [0.9, 0.3, 5.6], [0.40, 0.34, 0.28], b);
            seat.box(stage, vadd(a.c, a.u, deck + 1.4), [1.2, 3.0, 6.0], RED, b);
            seat.prism(stage, vadd(a.c, a.u, deck + 4.4), [1.4, 1.6, 6.6], SHINGLE, b);
            stage._mat = 0;
          }, { required: true });
        }
      }
      {
        const a = anchor(K(0.66), -1, 52), b = [a.r, a.u, a.t];
        groundPatch(K(0.66), -1, 40, [34, 0.16, 60], [0.26, 0.22, 0.17],
          { id: "glen-bog-mud", samples: 6 });
        modelGroup("watkins-camp-boot", {
          center: vadd(a.c, a.u, 3), size: [40, 9, 58], basis: b,
        }, (stage) => {
          const cols = [[0.72, 0.28, 0.22], [0.88, 0.86, 0.80], [0.24, 0.40, 0.28], [0.30, 0.36, 0.56]];
          stage._mat = MAT.FABRIC;
          for (let i = 0; i < 7; i++) {
            const ang = i / 7 * 6.2832, rr = 11 + hash(i * 23) * 4;
            const p = vadd(vadd(a.c, a.r, Math.cos(ang) * rr), a.t, Math.sin(ang) * rr);
            seat.prism(stage, p, [4.4, 2.6, 5.4], cols[i % cols.length], b);
          }
          stage._mat = MAT.RUST;
          // The bus: a long charred body sitting nose-down on bare rims.
          const bus = vadd(vadd(a.c, a.r, 3), a.t, 15);
          seat.box(stage, vadd(bus, a.u, 0.6), [2.6, 2.6, 11], [0.24, 0.21, 0.19], b);
          seat.box(stage, vadd(bus, a.u, 3.2), [2.4, 0.35, 10.4], [0.30, 0.26, 0.22], b);
          for (const dt of [-4.0, 3.4]) for (const dr of [-1.35, 1.35])
            seat.cyl(stage, vadd(vadd(bus, a.t, dt), a.r, dr), 0.5, 0.35,
              [0.20, 0.19, 0.18], 8, [a.r, a.t, a.u]);
          stage._mat = MAT.WOOD;
          // Fire pit and the stack of pallets waiting to go on it.
          seat.cyl(stage, a.c, 1.9, 0.5, [0.30, 0.27, 0.24], 9, b);
          seat.cone(stage, vadd(a.c, a.u, 0.5), 1.3, 2.4, [0.70, 0.34, 0.12], 6, b);
          for (let i = 0; i < 4; i++)
            seat.box(stage, vadd(vadd(a.c, a.r, -7), a.u, i * 0.35), [2.2, 0.35, 2.2],
              [0.58, 0.50, 0.38], b);
          stage._mat = 0;
        });
      }
      {
        const a = anchor(K(0.28), 1, 92), b = [a.r, a.u, a.t];
        modelGroup("glen-dairy-farm", {
          center: vadd(a.c, a.u, 8), size: [28, 22, 48], basis: b,
        }, (stage) => {
          stage._mat = MAT.WOOD;
          seat.box(stage, a.c, [13, 5.5, 30], [0.52, 0.48, 0.44], b);
          stage._mat = MAT.ROOF;
          seat.prism(stage, vadd(a.c, a.u, 5.5), [13.4, 3.0, 30.4], [0.40, 0.38, 0.36], b);
          seat.prism(stage, vadd(a.c, a.u, 8.5), [7.6, 2.2, 30.4], [0.40, 0.38, 0.36], b);
          stage._mat = MAT.WOOD;
          seat.box(stage, vadd(vadd(a.c, a.t, -15.2), a.u, 6.5), [4.0, 1.4, 0.4], [0.36, 0.32, 0.28], b);
          stage._mat = MAT.CONCRETE;
          const silo = vadd(a.c, a.r, 10);
          seat.cyl(stage, silo, 2.6, 15, [0.30, 0.40, 0.34], 10, b);   // glazed tile
          stage._mat = MAT.METAL;
          seat.cone(stage, vadd(silo, a.u, 15), 2.9, 2.4, [0.66, 0.66, 0.64], 10, b);
          stage._mat = MAT.WOOD;
          // Split-rail fence running off along the pasture edge.
          for (let i = 0; i < 8; i++) {
            const p = vadd(vadd(a.c, a.r, -10), a.t, (i - 3.5) * 5);
            seat.box(stage, p, [0.2, 1.3, 0.2], [0.44, 0.38, 0.30], b);
            addBox(stage, vadd(p, a.u, 0.95), [0.14, 0.14, 5], [0.44, 0.38, 0.30], b);
          }
          stage._mat = 0;
        });
      }
      // A second camp, in a clearing on the climb out of the Boot.
      {
        const a = anchor(K(0.74), 1, 58), b = [a.r, a.u, a.t];
        modelGroup("watkins-camp-climb", {
          center: vadd(a.c, a.u, 3.4), size: [22, 9, 42], basis: b,
        }, (stage) => {
          const cols = [[0.72, 0.28, 0.22], [0.88, 0.86, 0.80], [0.24, 0.40, 0.28], [0.30, 0.36, 0.56]];
          stage._mat = MAT.FABRIC;
          for (let i = 0; i < 6; i++) {
            const row = i % 2, off = (Math.floor(i / 2) - 1) * 13;
            const p = vadd(vadd(a.c, a.r, (row ? 1 : -1) * 5), a.t, off);
            seat.prism(stage, p, [5.0, 2.8, 6.0], cols[i % cols.length], b);
          }
          stage._mat = MAT.METAL;
          // Period travel trailers — rounded aluminium, ribbed along the body.
          for (let i = 0; i < 2; i++) {
            const p = vadd(vadd(a.c, a.r, 8), a.t, (i - 0.5) * 18);
            seat.box(stage, p, [2.8, 2.5, 7], [0.80, 0.80, 0.78], b);
            addFrustum(stage, vadd(p, a.u, 2.5), 1.4, 1.0, 0.6, [0.86, 0.86, 0.84], 6, b);
            addBox(stage, vadd(p, a.u, 1.4), [3.0, 0.2, 6.6], [0.62, 0.62, 0.60], b);
          }
          stage._mat = 0;
        });
      }
      // Camera masts.
      for (const [s, side, gap] of [[0.030, -1, 26], [0.090, -1, 34], [0.900, 1, 30]]) {
        const a = anchor(K(s), side, gap);
        addCyl(out, a.c, 0.19, 16, [0.22, 0.22, 0.25], 6, [a.r, a.u, a.t]);
        addBox(out, vadd(a.c, a.u, 16.4), [1.3, 0.6, 2.6], [0.94, 0.92, 0.82], [a.r, a.u, a.t]);
      }
      for (const [s0, s1] of [[0.1, 0.22], [0.36, 0.91]]) {
        for (const side of [-1, 1])
          forestEdge(s0, s1, side, 10, { density: 0.74, hMin: 12, hMax: 22, pineFrac: 0.22, col: FIR, col2: OAK });
      }
      for (const side of [-1, 1])
        forestEdge(0.50, 0.66, side, 24, { density: 0.25, hMin: 16, hMax: 27, pineFrac: 0.42, col: FIR, col2: SCARLET });

      grandstandEx(0.108, -1, 14, 48, null, null,
        { livery: "alu", roof: "cantilever", endWalls: true, pylons: true, h: 9 });
      {
        const a = anchor(K(0.935), 1, 78), b = [a.r, a.u, a.t];
        const STONE = [0.54, 0.51, 0.46], SIGN = [0.24, 0.34, 0.26];
        modelGroup("glen-main-gate", {
          center: vadd(a.c, a.u, 3), size: [22, 8, 16], basis: b,
        }, (stage) => {
          stage._mat = MAT.CONCRETE;
          for (const dt of [-6.5, 6.5])
            seat.box(stage, vadd(a.c, a.t, dt), [1.4, 5.4, 1.4], STONE, b);   // fieldstone piers
          stage._mat = MAT.WOOD;
          seat.box(stage, vadd(a.c, a.u, 5.0), [0.35, 1.8, 13.4], SIGN, b);   // sign board over the drive
          seat.box(stage, vadd(a.c, a.u, 4.55), [0.55, 0.3, 13.4], WEATHERED, b);
          // The toll / ticket booth off to one side: a small gabled clapboard hut.
          const booth = vadd(a.c, a.t, 11);
          seat.box(stage, booth, [3.2, 2.8, 3.2], [0.58, 0.56, 0.50], b);
          seat.box(stage, vadd(vadd(booth, a.r, -1.7), a.u, 1.4), [0.2, 1.1, 1.2], SIGN, b);  // service window
          stage._mat = MAT.ROOF;
          seat.prism(stage, vadd(booth, a.u, 2.8), [3.6, 1.1, 3.6], [0.40, 0.36, 0.32], b);
          stage._mat = 0;
        });
      }
    };
