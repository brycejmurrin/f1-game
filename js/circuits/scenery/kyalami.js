/* Apex 26 — KYALAMI scenery (data only), split out of js/circuits/kyalami.js.
   LAZY_SCENERY (tools/manifest.cjs): no <script> tag. game.js fetches the ONE
   circuit a session builds; all 40 together were 1,083 KB of the boot wall for
   a player who races one of them. Body moved verbatim — see tools/manifest.cjs
   and tests/unit/load-order.test.mjs for the lockstep. */
"use strict";
(window.TrackScenery = window.TrackScenery || {})["kyalami"] =
  function (api) {
      const { out, MAT, n, pyMin, hash, every, anchor, vadd, onTrack, px, pz, seat,
        tree, bush, ridge, building, grandstandEx, spectatorHill, sponsorHoarding,
        broadcastCompound, gantry, marshalPost, motorhome,
        fence, guardrail, tyreWall, groundPatch, modelGroup,
        addBox, addCyl, addFrustum, forestEdge } = api;
      const K = (s) => Math.round(s * n) % n;

      const THORN = [0.24, 0.36, 0.20], THORN_D = [0.19, 0.30, 0.17];
      const GUM = [0.20, 0.34, 0.22];
      const SCRUB = [0.44, 0.40, 0.22], SCRUB_D = [0.36, 0.34, 0.19];
      const EARTH = [0.62, 0.44, 0.28];
      const BRICK = [0.58, 0.36, 0.27], BRICK_D = [0.48, 0.29, 0.22];
      const IRON = [0.72, 0.71, 0.68], OXIDE = [0.56, 0.26, 0.18];
      const DUMP = [0.76, 0.70, 0.48];          // cyanided reef sand

      // -side, matching the fleet idiom (albert_park:608, estoril:195,
      // interlagos:171, madrid, shanghai all write `const IN = -side`):
      // +1 along a.r points AT the track. This file had the sign inverted, so
      // everything built through it faced away — garages, race-control windows
      // and all five iron terraces, whose rows step `inw * (5.4 - t * 1.35)`
      // while y rises: with the wrong sign they climb TOWARD the tarmac and
      // the terrace rakes backwards.
      const IN = (side) => -side;

      // 1. HIGHVELD VELD — flat-topped acacia thorn trees scattered over open
      //    golden grass, plus the ranks of imported blue-gum along the
      //    boundary. Sparse and low: the veld reads as open, never wooded.
      const openArea = (s) => (s >= 0.92 || s <= 0.10) || (s >= 0.36 && s <= 0.48);
      every(30, (k) => {
        const s = k / n;
        if (openArea(s)) return;
        const h = hash(k * 31);
        if (h < 0.42) return;
        const a = anchor(k, h < 0.5 ? -1 : 1, 14 + h * 12);
        const b = [a.r, a.u, a.t];
        const ht = 5 + h * 3, spread = 7 + h * 3;
        out._mat = MAT.WOOD;
        seat.cyl(out, a.c, 0.28, ht * 0.62, [0.34, 0.26, 0.18], 5, b);
        for (const dr of [-1, 1])                    // the low fork
          addBox(out, vadd(vadd(a.c, a.u, ht * 0.68), a.r, dr * spread * 0.22),
            [spread * 0.44, 0.7, 0.22], [0.34, 0.26, 0.18], b);
        out._mat = MAT.FOLIAGE;
        addBox(out, vadd(a.c, a.u, ht * 0.80), [spread, 0.9, spread],
          h < 0.6 ? THORN : THORN_D, b);
        addBox(out, vadd(a.c, a.u, ht * 0.94), [spread * 0.6, 0.7, spread * 0.6],
          h < 0.6 ? THORN_D : THORN, b);
        out._mat = 0;
      });
      every(24, (k) => {
        const h = hash(k * 97 + 23);
        if (h < 0.48) return;
        bush(k, h < 0.72 ? -1 : 1, 7 + h * 6, h < 0.6 ? SCRUB : SCRUB_D);
      });
      // Blue-gum windbreak rows on the boundary — tall, narrow, in lines.
      every(20, (k) => {
        const s = k / n;
        if (openArea(s)) return;
        const side = (Math.floor(k / 20) % 2) ? 1 : -1;
        tree(k, side, 52 + (k % 3) * 4, 18 + hash(k * 7) * 6, GUM, { crown: "columnar" });
      });
      for (const [id, s, side, d, w, l] of [
        ["kyalami-earth-crowthorne", 0.115, -1, 26, 22, 90],
        ["kyalami-earth-esses", 0.330, 1, 30, 18, 70],
        ["kyalami-earth-leeukop", 0.590, -1, 34, 20, 76],
        ["kyalami-earth-barbecue", 0.250, 1, 28, 16, 62],  // worn walkway on the descent
        ["kyalami-earth-climb", 0.470, 1, 44, 20, 80],     // laterite approach below the climb terrace
      ]) groundPatch(K(s), side, d, [w, 0.16, l], EARTH, { id, samples: 6 });

      {
        const a = anchor(K(0.982), 1, 16), b = [a.r, a.u, a.t];
        const bays = 12, pitch = 7.4, len = bays * pitch, inw = IN(1);
        modelGroup("kyalami-pit-block", {
          center: vadd(a.c, a.u, 7), size: [20, 15, len + 6], basis: b,
        }, (stage) => {
          stage._mat = MAT.BRICK;
          seat.box(stage, a.c, [12, 7.6, len], BRICK, b);
          stage._mat = MAT.CONCRETE;
          for (let i = 0; i < bays; i++) {           // garage bays and lintels
            const p = vadd(vadd(a.c, a.t, (i - (bays - 1) / 2) * pitch), a.r, inw * 5.9);
            seat.box(stage, p, [0.5, 4.6, 5.6], [0.17, 0.19, 0.21], b);
            seat.box(stage, vadd(p, a.u, 4.6), [0.7, 0.5, 6.4], [0.80, 0.78, 0.74], b);
          }
          stage._mat = MAT.METAL;
          const eave = vadd(vadd(a.c, a.u, 8.0), a.r, inw * 9.0);
          for (let i = 0; i <= bays; i++) {
            const p = vadd(vadd(a.c, a.t, (i - bays / 2) * pitch), a.r, inw * 9.0);
            seat.cyl(stage, p, 0.13, 8.0, [0.66, 0.65, 0.62], 6, b);
            addBox(stage, vadd(vadd(p, a.u, 7.4), a.r, -inw * 1.6),
              [3.4, 0.16, 0.16], [0.66, 0.65, 0.62], b);   // knee brace
          }
          addBox(stage, vadd(vadd(a.c, a.u, 8.3), a.r, inw * 3.2), [12.4, 0.35, len + 4], IRON, b);
          addBox(stage, vadd(eave, a.u, 0.15), [0.5, 0.9, len + 4], OXIDE, b);
          // Corrugated deck over the block itself — ribs, not a smooth slab.
          for (let i = 0; i * 1.5 < len + 4; i++) {
            const p = vadd(a.c, a.t, -(len + 4) / 2 + i * 1.5 + 0.75);
            addBox(stage, vadd(vadd(p, a.u, 8.05), a.r, inw * 3.2), [12.4, 0.30, 0.8], [0.62, 0.62, 0.60], b);
          }
          stage._mat = 0;
        }, { required: true });
      }
      {
        const a = anchor(K(0.999), 1, 20), b = [a.r, a.u, a.t], inw = IN(1);
        modelGroup("kyalami-race-control", {
          center: vadd(a.c, a.u, 15), size: [20, 34, 18], basis: b,
        }, (stage) => {
          stage._mat = MAT.BRICK;
          seat.box(stage, a.c, [12, 13, 14], BRICK_D, b);
          stage._mat = MAT.CONCRETE;
          for (let f = 1; f <= 3; f++) {
            seat.box(stage, vadd(vadd(a.c, a.u, f * 3.8), a.r, inw * 6.1),
              [0.4, 1.9, 12], [0.16, 0.20, 0.24], b);                    // window band
            seat.box(stage, vadd(vadd(a.c, a.u, f * 3.8 + 2.0), a.r, inw * 7.2),
              [2.6, 0.35, 12.8], [0.84, 0.82, 0.78], b);                 // sun louvre
          }
          seat.box(stage, vadd(a.c, a.u, 13), [13.5, 0.5, 15.5], [0.84, 0.82, 0.78], b);
          stage._mat = MAT.METAL;
          for (const [dr, dt] of [[-2.2, -2.2], [2.2, -2.2], [-2.2, 2.2], [2.2, 2.2]])
            seat.cyl(stage, vadd(vadd(vadd(a.c, a.r, dr), a.t, dt), a.u, 13.5), 0.16, 13, [0.60, 0.60, 0.58], 5, b);
          for (let i = 0; i < 5; i++)                 // lattice mast bracing
            addBox(stage, vadd(a.c, a.u, 15 + i * 2.5), [4.6, 0.13, 4.6], [0.60, 0.60, 0.58], b);
          seat.box(stage, vadd(a.c, a.u, 26.5), [5.2, 1.4, 5.2], OXIDE, b);
          stage._mat = 0;
        }, { required: true });
      }
      gantry(0.0, 8.5, [0.15, 0.15, 0.18]);
      gantry(0.968, 8.0, [0.15, 0.15, 0.18]);
      for (let i = 0; i < 4; i++) {
        building(K(0.925 + i * 0.013), 1, 38, 25, 9, 19,
          { kind: "chevron", wall: [0.84, 0.80, 0.72], window: [0.32, 0.34, 0.38], floor: 4.5 });
      }
      every(46, (k) => {
        const s = k / n, h = hash(k * 71 + 31);
        if (!(s > 0.90 || s < 0.05) || h < 0.54) return;
        motorhome(k, 1, 54 + h * 10, 10, 4, 6, { wall: [0.68 + h * 0.22, 0.68, 0.68] });
      });
      broadcastCompound(K(0.916), 1, 70, { vans: 3, dishes: 2, mastH: 9 });
      sponsorHoarding(0.950, 0.050, -1, 7, { h: 2.4, step: 12,
        palette: [[0.94, 0.72, 0.14], [0.16, 0.44, 0.26], [0.86, 0.22, 0.16], [0.20, 0.20, 0.22]] });

      const CROWD = [[0.86, 0.84, 0.80], [0.20, 0.24, 0.34], [0.72, 0.24, 0.20],
                     [0.24, 0.44, 0.30], [0.90, 0.72, 0.24], [0.42, 0.36, 0.32]];
      const ironTerrace = (id, k, side, dist, bays, opts) => {
        opts = opts || {};
        const rows = opts.rows || 6, pitch = 6.2, len = bays * pitch;
        const a = anchor(k, side, dist), b = [a.r, a.u, a.t], inw = IN(side);
        const backH = 2.0 + rows * 1.15;
        modelGroup(id, {
          center: vadd(a.c, a.u, (backH + 5) / 2), size: [16, backH + 6, len + 3], basis: b,
        }, (stage) => {
          stage._mat = MAT.CONCRETE;
          for (let t = 0; t < rows; t++) {           // stepped terracing
            const lat = inw * (5.4 - t * 1.35), y = t * 1.15;
            seat.box(stage, vadd(vadd(a.c, a.r, lat), a.u, y), [1.35, 1.15, len], [0.74, 0.72, 0.67], b);
            seat.box(stage, vadd(vadd(a.c, a.r, lat), a.u, y + 1.15), [1.15, 0.45, len - 1.5],
              (t % 2) ? [0.62, 0.60, 0.56] : [0.68, 0.66, 0.62], b);
            stage._mat = MAT.FABRIC;
            for (let j = 0; j * 0.85 < len - 2; j++) {
              const h2 = hash(k * 31 + t * 97 + j * 13);
              if (h2 < 0.42) continue;
              seat.box(stage, vadd(vadd(vadd(a.c, a.r, lat), a.t, -len / 2 + 1 + j * 0.85), a.u, y + 1.6),
                [0.5, 0.9, 0.42], CROWD[Math.floor(h2 * 97) % CROWD.length], b);
            }
            stage._mat = MAT.CONCRETE;
          }
          stage._mat = MAT.METAL;
          for (let i = 0; i <= bays; i++) {          // raked red-oxide trusses
            const p = vadd(a.c, a.t, (i - bays / 2) * pitch);
            seat.cyl(stage, vadd(p, a.r, -inw * 6.0), 0.17, backH + 4.6, OXIDE, 5, b);
            seat.cyl(stage, vadd(p, a.r, inw * 5.4), 0.15, backH + 1.4, OXIDE, 5, b);
            addBox(stage, vadd(vadd(p, a.r, -inw * 0.3), a.u, backH + 3.0),
              [11.8, 0.16, 0.16], OXIDE, b);
            addBox(stage, vadd(vadd(p, a.r, -inw * 0.3), a.u, backH + 2.0),
              [11.8, 0.14, 0.14], OXIDE, b);
          }
          // Corrugated sheeting, laid rib by rib so the roof reads as iron.
          for (let i = 0; i * 1.4 < len; i++) {
            const p = vadd(a.c, a.t, -len / 2 + i * 1.4 + 0.7);
            addBox(stage, vadd(vadd(p, a.r, -inw * 0.3), a.u, backH + 3.6),
              [12.6, 0.28, 0.75], (i % 2) ? IRON : [0.65, 0.64, 0.61], b);
          }
          stage._mat = 0;
        });
      };
      ironTerrace("kyalami-terrace-main", K(0.005), -1, 13, 15, { rows: 7 });
      ironTerrace("kyalami-terrace-crowthorne", K(0.078), -1, 20, 10, { rows: 6 });
      ironTerrace("kyalami-terrace-leeukop", K(0.565), -1, 22, 8, { rows: 5 });
      grandstandEx(0.950, -1, 12, 80, null, null,
        { livery: "sandstone", roof: "flat", endWalls: true, h: 9 });

      groundPatch(K(0.078), 1, 6, [40, 0.18, 54], EARTH,
        { id: "kyalami-crowthorne-gravel", samples: 8 });
      tyreWall(0.060, 0.098, 1, 5, [0.86, 0.20, 0.18]);
      spectatorHill(0.10, 0.18, -1, 16, { rows: 4, rise: 1.2, depth: 1.9, density: 0.44, step: 8 });
      marshalPost(K(0.072), -1, 10);

      groundPatch(K(0.255), -1, 5, [26, 0.18, 34], EARTH,
        { id: "kyalami-barbecue-gravel", samples: 6 });
      tyreWall(0.240, 0.272, -1, 4, [0.20, 0.40, 0.85]);
      marshalPost(K(0.250), 1, 9);
      spectatorHill(0.230, 0.290, 1, 16, { rows: 3, rise: 1.0, depth: 1.8, density: 0.34, step: 9 });

      groundPatch(K(0.565), 1, 5, [26, 0.18, 34], EARTH,
        { id: "kyalami-leeukop-gravel", samples: 6 });
      marshalPost(K(0.558), -1, 9);

      groundPatch(K(0.885), -1, 5, [28, 0.18, 36], EARTH,
        { id: "kyalami-final-gravel", samples: 6 });
      tyreWall(0.868, 0.902, -1, 4, [0.85, 0.78, 0.20]);
      ironTerrace("kyalami-terrace-final", K(0.885), 1, 18, 9, { rows: 5 });
      marshalPost(K(0.880), 1, 9);

      spectatorHill(0.42, 0.52, 1, 16, { rows: 3, rise: 1.0, depth: 1.8, density: 0.36, step: 9 });
      ironTerrace("kyalami-terrace-climb", K(0.470), 1, 30, 10, { rows: 6 });

      for (const [s0, s1] of [[0.11, 0.23], [0.28, 0.40], [0.46, 0.55], [0.60, 0.86]]) {
        guardrail(s0, s1, -1, 8, [0.80, 0.81, 0.83]);
        guardrail(s0, s1,  1, 8, [0.80, 0.81, 0.83]);
      }
      guardrail(0.94, 0.06, 1, 4.0, [0.85, 0.85, 0.88]);
      fence(0.95, 0.06, -1, 9, 4, [0.74, 0.76, 0.80]);
      for (const s of [0.15, 0.32, 0.44, 0.62, 0.74, 0.90]) {
        marshalPost(K(s), hash(K(s)) < 0.5 ? -1 : 1, 9);
      }

      const cx = px.reduce((a, b) => a + b, 0) / n, cz = pz.reduce((a, b) => a + b, 0) / n;
      let rad = 0;
      for (let i = 0; i < n; i++) rad = Math.max(rad, Math.hypot(px[i] - cx, pz[i] - cz));
      for (const [extra, count, len, w, hMin, hVar, col] of [
        [150, 40, 180, 50, 10, 6, [0.40, 0.38, 0.22]],
        [280, 32, 250, 70, 20, 12, [0.34, 0.34, 0.24]],
        [440, 24, 320, 92, 36, 20, [0.38, 0.40, 0.40]],
      ]) {
        for (let i = 0; i < count; i++) {
          const a = i / count * 6.2832, h = hash(i * 7 + extra);
          const r = rad + extra + h * 36;
          const tx = cx + Math.cos(a) * r, tz = cz + Math.sin(a) * r;
          if (onTrack(tx, tz, 34)) continue;
          ridge(tx, tz, pyMin, a + 1.5708, len, w, hMin + h * hVar, col);
        }
      }
      for (const [ang, r, baseR, topR, h] of [
        [0.55, 1.00, 150, 78, 44], [0.86, 1.16, 118, 62, 34],
        [1.18, 0.94, 132, 68, 39], [1.62, 1.22,  96, 48, 28],
      ]) {
        const rr = rad + 300 * r;
        const tx = cx + Math.cos(ang) * rr, tz = cz + Math.sin(ang) * rr;
        if (onTrack(tx, tz, baseR + 20)) continue;
        out._mat = MAT.SAND;
        addFrustum(out, [tx, pyMin - 1, tz], baseR, topR, h, DUMP, 7, null);
        addFrustum(out, [tx, pyMin - 1 + h, tz], topR, topR * 0.94, 1.2, [0.68, 0.63, 0.44], 7, null);
        out._mat = 0;
      }
      {
        const k = K(0.55);
        for (let i = 0; i < 9; i++) {
          building(k, 1, 320 + i * 24, 16, 26 + (i % 4) * 12, 16,
            { kind: "podium", wall: [0.62 + i * 0.012, 0.64 + i * 0.012, 0.70], window: [0.54, 0.56, 0.62] });
        }
      }

      {
        const a = anchor(K(0.34), -1, 210);
        const b = [a.r, a.u, a.t];
        modelGroup("kyalami-headgear", {
          center: vadd(a.c, a.u, 20), size: [26, 48, 68], basis: b,
        }, (stage) => {
          stage._mat = MAT.METAL;
          const legs = [[-6, -6], [6, -6], [-6, 6], [6, 6]];
          for (const [dx, dz] of legs)
            seat.cyl(stage, vadd(vadd(a.c, a.r, dx), a.t, dz), 0.5, 30, [0.42, 0.38, 0.34], 6, b);
          for (let i = 1; i <= 5; i++) {
            const y = i * 5;
            addBox(stage, vadd(a.c, a.u, y), [12.6, 0.24, 0.24], [0.44, 0.40, 0.36], b);
            addBox(stage, vadd(a.c, a.u, y), [0.24, 0.24, 12.6], [0.44, 0.40, 0.36], b);
            addBox(stage, vadd(a.c, a.u, y - 2.5), [13.6, 0.20, 0.20], [0.40, 0.36, 0.33], b);
          }
          seat.box(stage, vadd(a.c, a.u, 30), [14, 4.5, 14], [0.48, 0.44, 0.40], b);
          // Two sheave wheels side by side, axles across the frame.
          for (const dz of [-3.2, 3.2])
            addCyl(stage, vadd(vadd(a.c, a.u, 36.6), a.t, dz), 4.2, 0.9,
              [0.34, 0.31, 0.28], 12, [a.r, a.t, a.u]);
          stage._mat = MAT.CONCRETE;
          seat.box(stage, a.c, [16, 10, 16], [0.56, 0.46, 0.38], b);   // winder house
          stage._mat = MAT.RUST;
          // Conveyor incline out to the dump: a leaning gantry on trestles.
          for (let i = 0; i < 5; i++) {
            const p = vadd(a.c, a.t, 10 + i * 4.2);
            seat.cyl(stage, p, 0.24, 6 + i * 1.6, [0.46, 0.34, 0.26], 5, b);
            addBox(stage, vadd(p, a.u, 6.6 + i * 1.6), [2.4, 1.0, 4.6], [0.50, 0.38, 0.28], b);
          }
          stage._mat = 0;
        });
      }
      {
        const a = anchor(K(0.70), 1, 96), b = [a.r, a.u, a.t];
        modelGroup("kyalami-windpump", {
          center: vadd(a.c, a.u, 9), size: [34, 22, 24], basis: b,
        }, (stage) => {
          stage._mat = MAT.METAL;
          for (const [dr, dt] of [[-1.9, -1.9], [1.9, -1.9], [-1.9, 1.9], [1.9, 1.9]])
            seat.cyl(stage, vadd(vadd(a.c, a.r, dr), a.t, dt), 0.11, 12.5, [0.55, 0.54, 0.52], 5, b);
          for (let i = 1; i <= 4; i++) {
            addBox(stage, vadd(a.c, a.u, i * 2.6), [4.0, 0.10, 0.10], [0.55, 0.54, 0.52], b);
            addBox(stage, vadd(a.c, a.u, i * 2.6), [0.10, 0.10, 4.0], [0.55, 0.54, 0.52], b);
          }
          const hub = vadd(vadd(a.c, a.u, 13.4), a.t, -1.4);
          addCyl(stage, hub, 0.55, 0.4, [0.60, 0.58, 0.55], 10, [a.r, a.t, a.u]);
          for (let i = 0; i < 12; i++) {
            const ang = i * 0.5236;
            const mid = vadd(vadd(hub, a.r, Math.cos(ang) * 1.8), a.u, Math.sin(ang) * 1.8);
            addBox(stage, mid, [Math.abs(Math.cos(ang)) * 2.6 + 0.5,
              Math.abs(Math.sin(ang)) * 2.6 + 0.5, 0.14], [0.72, 0.71, 0.68], b);
          }
          addBox(stage, vadd(vadd(a.c, a.u, 13.4), a.t, 3.4), [0.12, 2.2, 3.6], [0.70, 0.68, 0.64], b);
          stage._mat = MAT.RUST;
          // Corrugated dam — ribs around the drum, the way the panels bolt up.
          seat.cyl(stage, vadd(a.c, a.r, 9.5), 5.2, 2.6, [0.52, 0.44, 0.34], 12, b);
          stage._mat = MAT.CONCRETE;
          seat.cyl(stage, vadd(vadd(a.c, a.r, 9.5), a.u, 2.6), 5.0, 0.2, [0.30, 0.36, 0.34], 12, b);
          stage._mat = 0;
        });
      }
      {
        const a = anchor(K(0.965), 1, 66);
        const b = [a.r, a.u, a.t], inw = IN(1);
        modelGroup("kyalami-clubhouse", {
          center: vadd(a.c, a.u, 7), size: [34, 16, 48], basis: b,
        }, (stage) => {
          stage._mat = MAT.BRICK;
          seat.box(stage, a.c, [14, 7.5, 38], BRICK, b);
          seat.box(stage, vadd(vadd(a.c, a.r, -inw * 9), a.t, -14), [5, 3.2, 10], BRICK_D, b);
          stage._mat = MAT.ROOF;
          seat.prism(stage, vadd(a.c, a.u, 7.5), [15.2, 2.6, 39], [0.50, 0.28, 0.22], b);
          stage._mat = MAT.CONCRETE;
          // Stoep: raised floor, square brick piers, and a shading lean-to.
          seat.box(stage, vadd(a.c, a.r, inw * 10.5), [7.5, 0.6, 38], [0.78, 0.75, 0.70], b);
          for (let i = 0; i < 8; i++) {
            const p = vadd(vadd(vadd(a.c, a.t, (i - 3.5) * 5.2), a.r, inw * 13.4), a.u, 0.6);
            seat.box(stage, p, [0.7, 3.4, 0.7], BRICK_D, b);
          }
          stage._mat = MAT.METAL;
          addBox(stage, vadd(vadd(a.c, a.u, 4.4), a.r, inw * 10.5), [8.0, 0.3, 38], IRON, b);
          stage._mat = 0;
        });
      }
      // Camera masts.
      for (const [s, side, gap] of [[0.030, -1, 26], [0.078, -1, 40], [0.565, -1, 28], [0.885, 1, 26]]) {
        const a = anchor(K(s), side, gap);
        addCyl(out, a.c, 0.20, 17, [0.22, 0.22, 0.25], 6, [a.r, a.u, a.t]);
        addBox(out, vadd(a.c, a.u, 17.4), [1.4, 0.6, 2.8], [0.94, 0.92, 0.82], [a.r, a.u, a.t]);
      }
      for (const [s0, s1] of [[0.12, 0.34], [0.5, 0.9]]) {
        for (const side of [-1, 1])
          forestEdge(s0, s1, side, 18, { density: 0.30, hMin: 6, hMax: 11, pineFrac: 0.08, col: GUM, col2: THORN });
      }
    };
