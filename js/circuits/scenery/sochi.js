"use strict";
(window.TrackScenery = window.TrackScenery || {})["sochi"] =
  function (api) {
      const { K, lapBounds, out, MAT, n, pyMin, hash, every, along, anchor, vadd, onTrack,
        tree, bush, hedge, ridge, building, grandstandEx,
        broadcastCompound, billboard, gantry, marshalPost, motorhome,
        fence, guardrail, tyreWall, groundPatch, modelGroup,
        cameraTower, sponsorHoarding, signBoard, cypress, terrainYAt,
        addBox, addCyl, addCone, addFrustum } = api;

      const LEAF = [0.20, 0.44, 0.20], LEAF_D = [0.15, 0.36, 0.18];
      const GRAVEL = [0.68, 0.62, 0.48];
      const PLAZA = [0.78, 0.76, 0.74], PLAZA_D = [0.70, 0.69, 0.68];
      const WHITE = [0.93, 0.94, 0.96];
      const GLASS = [0.34, 0.46, 0.58];

      groundPatch(K(0.09), 1, 6, [120, 0.18, 260], PLAZA,
        { id: "sochi-medals-plaza", samples: 12 });

      {
        const a = anchor(K(0.18), 1, 175);
        const b = [a.r, a.u, a.t];
        modelGroup("sochi-fisht-stadium", {
          center: vadd(a.c, a.u, 22), size: [126, 52, 146], basis: b,
        }, (stage) => {
          stage._mat = MAT.CONCRETE;
          addFrustum(stage, a.c, 60, 54, 20, [0.80, 0.82, 0.86], 16, b);
          stage._mat = MAT.GLASS;
          const peakAt = (i) => 20 + (1 - (i / 4) ** 2) * 16;
          for (const sgn of [-1, 1]) {
            for (let i = 0; i < 5; i++) {
              const f = i / 4;
              const top = peakAt(i);
              const bottom = i < 4 ? peakAt(i + 1) : top - 2.2;
              addBox(stage, vadd(vadd(a.c, a.t, sgn * (26 + f * 30)), a.u, (top + bottom) / 2),
                [100 - f * 30, top - bottom, 22], [0.90, 0.93, 0.97], b);
            }
          }
          stage._mat = MAT.METAL;
          addCyl(stage, vadd(a.c, a.u, 20), 56, 2.2, [0.86, 0.88, 0.92], 16, b);
          stage._mat = 0;
        }, { required: true });
      }
      {
        const a = anchor(K(0.150), 1, 130);
        const b = [a.r, a.u, a.t];
        modelGroup("sochi-bolshoy-dome", {
          center: vadd(a.c, a.u, 14), size: [96, 30, 96], basis: b,
        }, (stage) => {
          addCyl(stage, a.c, 42, 16, [0.78, 0.80, 0.84], 14, b);
          addCyl(stage, vadd(a.c, a.u, 16), 34, 9, [0.86, 0.88, 0.92], 14, b);
        }, { required: true });
      }
      {
        const a = anchor(K(0.225), 1, 120);
        const b = [a.r, a.u, a.t];
        modelGroup("sochi-adler-arena", {
          center: vadd(a.c, a.u, 10), size: [56, 22, 110], basis: b,
        }, (stage) => {
          addBox(stage, vadd(a.c, a.u, 8), [48, 16, 104], [0.80, 0.83, 0.88], b);
          addBox(stage, vadd(a.c, a.u, 16.5), [52, 1.6, 108], [0.62, 0.66, 0.72], b);
          for (const hgt of [4.5, 11]) {
            addBox(stage, vadd(vadd(a.c, a.r, -24), a.u, hgt), [0.3, 3.0, 98], [0.46, 0.60, 0.74], b);
          }
        }, { required: true });
      }
      {
        const a = anchor(K(0.115), 1, 96);
        const b = [a.r, a.u, a.t];
        modelGroup("sochi-flame-tower", {
          center: vadd(a.c, a.u, 20), size: [16, 44, 16], basis: b,
        }, (stage) => {
          addCone(stage, a.c, 7, 34, [0.84, 0.82, 0.80], 10, b);
          addCyl(stage, vadd(a.c, a.u, 34), 1.2, 8, [0.90, 0.88, 0.84], 8, b);
          addCone(stage, vadd(a.c, a.u, 41), 2.2, 5, [0.98, 0.72, 0.28], 8, b);
        }, { required: true });
      }
      {
        const a = anchor(K(0.115), 1, 109);
        let top = -Infinity;
        for (const [dr, dt] of [[0, 0], [-35, -45], [35, -45], [-35, 45], [35, 45]]) {
          const y = terrainYAt(a.c[0] + a.r[0] * dr + a.t[0] * dt, a.c[2] + a.r[2] * dr + a.t[2] * dt);
          if (Number.isFinite(y)) top = Math.max(top, y);
        }
        if (top > -Infinity)
          addBox(out, vadd(a.c, a.u, top - a.c[1] + 0.15), [70, 0.5, 90],
            [0.30, 0.48, 0.66], [a.r, a.u, a.t]);
      }
      const JET_EMBED = 4;
      for (let i = 0; i < 5; i++) {
        const ang = i / 5 * 6.2832;
        const a = anchor(K(0.115), 1, 74 + Math.cos(ang) * 16);
        const p = vadd(a.c, a.t, Math.sin(ang) * 22);
        const h = 7 + hash(i * 7) * 5;
        addCyl(out, vadd(p, a.u, 3.5 - JET_EMBED), 0.22, h + JET_EMBED,
          [0.82, 0.90, 0.96], 5, [a.r, a.u, a.t]);
      }

      {
        const a = anchor(K(0.290), 1, 122);
        const b = [a.r, a.u, a.t];
        modelGroup("sochi-iceberg-palace", {
          center: vadd(a.c, a.u, 13), size: [72, 32, 116], basis: b,
        }, (stage) => {
          stage._mat = MAT.CONCRETE;
          addBox(stage, vadd(a.c, a.u, 7), [56, 14, 100], [0.84, 0.86, 0.90], b);
          stage._mat = MAT.GLASS;
          addBox(stage, vadd(vadd(a.c, a.r, -28.2), a.u, 8), [0.5, 8, 96], GLASS, b);
          stage._mat = MAT.METAL;
          for (let i = 0; i < 9; i++) {
            const f = (i - 4) / 4;
            const drop = (1 - f * f) * 6.5;
            addBox(stage, vadd(vadd(a.c, a.r, f * 30), a.u, 14 + drop),
              [8.2, 1.1, 108], i & 1 ? [0.88, 0.90, 0.94] : [0.80, 0.84, 0.90], b);
          }
          stage._mat = 0;
        }, { required: true });
      }

      {
        const a = anchor(K(0.062), 1, 58);
        const b = [a.r, a.u, a.t];
        modelGroup("sochi-olympic-rings", {
          center: vadd(a.c, a.u, 8), size: [6, 16, 34], basis: b,
        }, (stage) => {
          const cols = [
            [0.10, 0.36, 0.72], [0.14, 0.14, 0.16], [0.82, 0.16, 0.14],
            [0.94, 0.78, 0.10], [0.10, 0.56, 0.28],
          ];
          stage._mat = MAT.CONCRETE;
          addBox(stage, vadd(a.c, a.u, 2), [5, 4, 30], [0.80, 0.80, 0.82], b);
          stage._mat = MAT.METAL;
          for (let r = 0; r < 5; r++) {
            const top = r < 3;
            const cAlong = (top ? (r - 1) : (r - 3.5)) * 6.4;
            const cUp = 9.2 + (top ? 2.6 : 0);
            const hub = vadd(vadd(a.c, a.t, cAlong), a.u, cUp);
            addCyl(stage, vadd(vadd(a.c, a.t, cAlong), a.u, 2), 0.35, cUp - 1.5,
              [0.55, 0.56, 0.58], 6, b);
            addCyl(stage, vadd(hub, a.u, -0.8), 3.6, 1.6, [0.55, 0.56, 0.58], 8, b);
            for (let j = 0; j < 10; j++) {
              const ang = j / 10 * 6.2832, cA = Math.cos(ang), sA = Math.sin(ang);
              const dir = [], perp = [];
              for (let axis = 0; axis < 3; axis++) {
                dir[axis] = a.u[axis] * cA + a.t[axis] * sA;
                perp[axis] = a.t[axis] * cA - a.u[axis] * sA;
              }
              addBox(stage, vadd(hub, dir, 2.9), [0.7, 2.4, 0.85], cols[r],
                [a.r, dir, perp]);
            }
          }
          stage._mat = 0;
        }, { required: true });
      }

      groundPatch(K(0.230), 1, 6, [90, 0.18, 220], PLAZA,
        { id: "sochi-north-plaza", samples: 10 });
      groundPatch(K(0.030), -1, 6, [60, 0.18, 160], PLAZA,
        { id: "sochi-start-plaza", samples: 8 });
      for (const [s0, s1, side] of [[0.94, 0.30, 1], [0.96, 0.10, -1]]) {
        let i = 0;
        along(s0, s1, 16, (k, spacing) => {
          if (i++ % 2) return;
          groundPatch(k, side, 7, [46, 0.10, 2.2], PLAZA_D, { id: `sochi-plaza-strip-${k}-${side}`, samples: 6 });
        });
      }

      const STAND_SPANS = [[0.215, 0.295, 1], [0.510, 0.585, -1], [0.785, 0.855, 1]];
      const inStand = (s, side) => STAND_SPANS.some(([a, b, sd]) => sd === side && s >= a && s <= b);
      every(32, (k) => {
        const s = k / n;
        if (s <= 0.30 || s >= 0.90) return;
        const h = hash(k * 31);
        if (h < 0.40) return;
        const side = h < 0.5 ? -1 : 1;
        if (!inStand(s, side)) tree(k, side, 12 + h * 12, 10 + h * 7, h < 0.5 ? LEAF_D : LEAF);
        const side2 = h > 0.90 ? -1 : 1;
        if (h > 0.78 && !inStand(s, side2)) tree(k, side2, 30 + h * 18, 11 + h * 6, LEAF_D);
      });
      every(30, (k) => {
        const s = k / n;
        if (s <= 0.30 || s >= 0.90) return;
        const h = hash(k * 97 + 23);
        if (h < 0.58) return;
        bush(k, h < 0.75 ? -1 : 1, 7 + h * 5, [0.18, 0.38, 0.18]);
      });
      for (const [h0, h1] of [[0.02, 0.036], [0.077, 0.165], [0.180, 0.28]])
        hedge(h0, h1, 1, 24, 3.0, [0.17, 0.36, 0.18]);
      hedge(0.02, 0.28, -1, 22, 3.0, [0.17, 0.36, 0.18]);

      for (const [i, s] of [0.938, 0.958, 0.978, 0.998].entries()) {
        const a = anchor(K(s), -1, 16);
        const b = [a.r, a.u, a.t];
        modelGroup(`sochi-pit-bay-${i + 1}`, {
          center: vadd(a.c, a.u, 9), size: [24, 22, 46], basis: b,
        }, (stage) => {
          stage._mat = MAT.CONCRETE;
          addBox(stage, vadd(a.c, a.u, 0.9), [17, 1.8, 44], [0.82, 0.83, 0.86], b);
          stage._mat = MAT.GLASS;
          addBox(stage, vadd(a.c, a.u, 1.8 + 7.1), [16, 14.2, 44], [0.20, 0.28, 0.38], b);
          stage._mat = MAT.METAL;
          for (let f = 0; f < 5; f++) {
            addBox(stage, vadd(vadd(a.c, a.r, 8.6), a.u, 3.2 + f * 3.1),
              [1.9, 0.7, 45], WHITE, b);
          }
          addBox(stage, vadd(a.c, a.u, 16.6), [23, 0.7, 46], WHITE, b);
          addBox(stage, vadd(vadd(a.c, a.r, -11.3), a.u, 16.0), [0.6, 0.8, 46.4],
            [0.20, 0.36, 0.62], b);
          for (let c = 0; c < 5; c++) {
            addCyl(stage, vadd(vadd(vadd(a.c, a.t, (c - 2) * 8.8), a.r, -10.4), a.u, 8),
              0.17, 16.4, WHITE, 6, b);
          }
          stage._mat = 0;
        }, { required: true });
      }
      {
        const a = anchor(K(0.986), -1, 30);
        const b = [a.r, a.u, a.t];
        modelGroup("sochi-race-control", {
          center: vadd(a.c, a.u, 17), size: [18, 40, 18], basis: b,
        }, (stage) => {
          stage._mat = MAT.CONCRETE;
          addBox(stage, vadd(a.c, a.u, 12), [6.5, 24, 6.5], WHITE, b);
          stage._mat = MAT.GLASS;
          addFrustum(stage, vadd(a.c, a.u, 24), 5.0, 7.0, 6.5, [0.18, 0.26, 0.36], 6, b);
          stage._mat = MAT.METAL;
          addBox(stage, vadd(a.c, a.u, 31), [17, 0.8, 17], WHITE, b);
          addBox(stage, vadd(a.c, a.u, 30.2), [16, 0.6, 16], [0.20, 0.36, 0.62], b);
          addCyl(stage, vadd(a.c, a.u, 31), 0.13, 14, WHITE, 5, b);
          stage._mat = 0;
        }, { required: true });
      }
      gantry(0.0, 8.5, [0.15, 0.15, 0.18]);
      gantry(0.968, 8.0, [0.15, 0.15, 0.18]);
      grandstandEx(0.005, 1, 12, 150, null, null,
        { livery: "teal", tiers: 2, roof: "flat", suites: true, endWalls: true, pylons: true });
      for (let i = 0; i < 4; i++) {
        building(K(0.925 + i * 0.013), -1, 40, 24, 13, 24,
          { kind: i & 1 ? "drum" : "slab", wall: [0.88, 0.88, 0.90], window: [0.34, 0.40, 0.48], floor: 4.5 });
      }
      every(46, (k) => {
        const s = k / n, h = hash(k * 71 + 31);
        if (!(s > 0.90 || s < 0.05) || h < 0.52) return;
        motorhome(k, -1, 56 + h * 10, 10, 4, 6, { wall: [0.68 + h * 0.22, 0.68, 0.70] });
      });
      broadcastCompound(K(0.916), -1, 74, { vans: 3, dishes: 2, mastH: 9 });
      for (const s of [0.975, 0.01, 0.03]) billboard(K(s), 1, 8, 12, 4.5, [0.20, 0.34, 0.70]);

      const arcStand = (s0, s1, side, gap, opts) => {
        opts = opts || {};
        const rows = opts.rows || 8, rise = opts.rise || 0.82, depth = opts.depth || 1.25;
        const R = opts.span != null ? opts.span : 9.5, lift = opts.lift || 1.35;
        const stations = [];
        along(s0, s1, opts.step || 10, (k, spacing) => {
          stations.push({ k, spacing, a: anchor(k, side, gap) });
        });
        const rowAt = (st, back) => st && vadd(st.a.c, st.a.r, side * back);
        const apart = (p, q) => q ? Math.hypot(p[0] - q[0], p[2] - q[2]) : Infinity;
        stations.forEach(({ k, spacing, a }, si) => {
          const b = [a.r, a.u, a.t], seg = spacing * 0.95;
          out._mat = MAT.CONCRETE;
          for (let r = 0; r < rows; r++) {
            const back = r * depth, up = 0.6 + r * rise;
            const here = rowAt(stations[si], back);
            const near = Math.min(apart(here, rowAt(stations[si - 1], back)),
              apart(here, rowAt(stations[si + 1], back)));
            const rowSeg = Math.min(seg, near * 0.95);
            addBox(out, vadd(vadd(a.c, a.r, side * back), a.u, up),
              [depth, rise + 0.2, rowSeg], r & 1 ? [0.72, 0.73, 0.76] : [0.66, 0.67, 0.70], b);
            const h = hash(k * 19 + r * 5);
            if (h > 0.5) continue;
            out._mat = MAT.FABRIC;
            addBox(out, vadd(vadd(vadd(a.c, a.r, side * back),
              a.t, (h - 0.25) * rowSeg * 0.8), a.u, up + rise * 0.5 + 0.55),
              [0.55, 1.0, 0.6],
              h < 0.16 ? [0.86, 0.24, 0.20] : h < 0.32 ? [0.92, 0.92, 0.90] : [0.20, 0.40, 0.70], b);
            out._mat = MAT.CONCRETE;
          }
          out._mat = MAT.METAL;
          const segs = 8;
          const reach = (rows - 0.5) * depth;
          const squash = Math.min(1, (reach + R * 0.15) / (2 * R));
          for (let j = 0; j < segs; j++) {
            const t0 = j / segs * Math.PI, t1 = (j + 1) / segs * Math.PI;
            const mid = (t0 + t1) / 2;
            const across = (R - Math.cos(mid) * R) * squash;
            const up = 3.0 + Math.sin(mid) * R * lift;
            const chord = (Math.PI / segs) * R * lift * 1.15;
            const cM = Math.cos(mid), sM = Math.sin(mid);
            const dir = [], perp = [];
            for (let axis = 0; axis < 3; axis++) {
              dir[axis] = a.u[axis] * cM + a.r[axis] * side * sM;
              perp[axis] = a.r[axis] * side * cM - a.u[axis] * sM;
            }
            const c = vadd(vadd(a.c, a.r, side * (across - R * 0.15)), a.u, up);
            addBox(out, c, [0.34, chord, 0.34], WHITE, [perp, dir, a.t]);
            if (j % 2 === 0)
              addBox(out, vadd(c, a.u, 0.35), [1.9, 0.12, seg], [0.86, 0.90, 0.94], b);
          }
          out._mat = 0;
        });
      };
      arcStand(0.225, 0.285, 1, 18, { rows: 9 });
      arcStand(0.520, 0.575, -1, 18, { rows: 8 });
      arcStand(0.795, 0.845, 1, 16, { rows: 7, span: 8.5 });

      groundPatch(K(0.045), -1, 5, [26, 0.18, 34], GRAVEL,
        { id: "sochi-t1-gravel", samples: 6 });
      tyreWall(0.032, 0.062, -1, 4, [0.86, 0.20, 0.18]);
      marshalPost(K(0.048), 1, 10);

      groundPatch(K(0.255), -1, 5, [24, 0.18, 32], GRAVEL,
        { id: "sochi-t6-gravel", samples: 6 });
      tyreWall(0.240, 0.270, -1, 4, [0.20, 0.40, 0.85]);
      marshalPost(K(0.250), 1, 9);

      groundPatch(K(0.545), 1, 5, [24, 0.18, 32], GRAVEL,
        { id: "sochi-t13-gravel", samples: 6 });
      marshalPost(K(0.540), -1, 9);

      groundPatch(K(0.815), -1, 5, [24, 0.18, 32], GRAVEL,
        { id: "sochi-t17-gravel", samples: 6 });
      tyreWall(0.800, 0.830, -1, 4, [0.85, 0.78, 0.20]);
      marshalPost(K(0.810), 1, 9);

      for (const [s0, s1] of [[0.58, 0.79], [0.84, 0.92]]) {
        guardrail(s0, s1, -1, 6, [0.80, 0.81, 0.83]);
        guardrail(s0, s1,  1, 8, [0.80, 0.81, 0.83]);
      }
      guardrail(0.30, 0.50, -1, 7.5, [0.80, 0.81, 0.83]);
      guardrail(0.30, 0.50,  1, 7.5, [0.80, 0.81, 0.83]);
      guardrail(0.94, 0.06, -1, 4.0, [0.85, 0.85, 0.88]);
      fence(0.95, 0.06, 1, 9, 4, [0.74, 0.76, 0.80]);
      for (const s of [0.12, 0.18, 0.36, 0.46, 0.64, 0.74, 0.88]) {
        marshalPost(K(s), hash(K(s)) < 0.5 ? -1 : 1, 8.5);
      }

      const { cx, cz, radius: rad } = lapBounds();
      for (const [extra, count, len, w, hMin, hVar, col] of [
        [150, 22, 170, 50, 22, 14, [0.20, 0.36, 0.20]],
        [300, 22, 420, 90, 80, 50, [0.30, 0.38, 0.38]],
        [480, 18, 560, 130, 160, 110, [0.52, 0.58, 0.64]],
      ]) {
        for (let i = 0; i < count; i++) {
          const a = i / count * 6.2832, h = hash(i * 7 + extra);
          const r = rad + extra + h * 36;
          const tx = cx + Math.cos(a) * r, tz = cz + Math.sin(a) * r;
          if (onTrack(tx, tz, 34)) continue;
          ridge(tx, tz, pyMin, a + 1.5708, len, w, hMin + h * hVar, col);
        }
      }

      {
        let i = 0;
        along(0.92, 0.32, 42, (k) => {
          for (const side of [-1, 1]) {
            const a = anchor(k, side, side > 0 ? 12 : 10);
            const b = [a.r, a.u, a.t];
            out._mat = MAT.METAL;
            addCyl(out, a.c, 0.20, 20, WHITE, 8, b);
            addBox(out, vadd(a.c, a.u, 20.2), [0.34, 0.34, 4.6], [0.88, 0.89, 0.92], b);
            for (const o of [-1.8, 1.8])
              addBox(out, vadd(vadd(a.c, a.t, o), a.u, 19.9), [1.3, 0.5, 1.1],
                [0.96, 0.95, 0.88], b);
            out._mat = 0;
          }
          i++;
        });
      }
      signBoard(K(0.045), 1, 7, "corner", 1);
      signBoard(K(0.085), -1, 9, "corner", 2);
      signBoard(K(0.255), 1, 7, "corner", 6);
      signBoard(K(0.545), -1, 7, "corner", 13);
      signBoard(K(0.815), 1, 7, "corner", 17);
      sponsorHoarding(0.930, 0.075, 1, 7.0, { h: 1.2, step: 10 });
      cameraTower(K(0.085), 1, 68, { h: 20 });
      cameraTower(K(0.545), -1, 34, { h: 17 });
      cameraTower(K(0.815), 1, 30, { h: 17 });

      {
        const a = anchor(K(0.245), 1, 152);
        const b = [a.r, a.u, a.t];
        modelGroup("sochi-shayba-arena", {
          center: vadd(a.c, a.u, 12), size: [64, 26, 64], basis: b,
        }, (stage) => {
          stage._mat = MAT.CONCRETE;
          addCyl(stage, a.c, 29, 9, [0.82, 0.84, 0.88], 16, b);
          stage._mat = MAT.METAL;
          const band = [[0.90, 0.92, 0.95], [0.40, 0.54, 0.70], [0.86, 0.88, 0.92]];
          for (let i = 0; i < 4; i++) {
            const r0 = 30 - i * 1.3, r1 = 29.4 - i * 1.3;
            addFrustum(stage, vadd(a.c, a.u, 1.4 + i * 2.1), r0, r1, 2.0,
              band[i % band.length], 16, b);
          }
          stage._mat = MAT.GLASS;
          addFrustum(stage, vadd(a.c, a.u, 0.4), 29.6, 29.2, 3.4, [0.24, 0.34, 0.46], 16, b);
          stage._mat = MAT.METAL;
          addCyl(stage, vadd(a.c, a.u, 9), 25, 6, [0.88, 0.90, 0.94], 16, b);
          addCyl(stage, vadd(a.c, a.u, 15), 12, 3.4, [0.84, 0.86, 0.90], 12, b);
          stage._mat = 0;
        }, { required: true });
      }

      {
        const a = anchor(K(0.875), 1, 95);
        const b = [a.r, a.u, a.t];
        modelGroup("sochi-ice-cube", {
          center: vadd(a.c, a.u, 12), size: [52, 28, 52], basis: b,
        }, (stage) => {
          stage._mat = MAT.CONCRETE;
          addBox(stage, vadd(a.c, a.u, 0.6), [48, 1.2, 48], [0.82, 0.84, 0.88], b);
          stage._mat = MAT.GLASS;
          addBox(stage, vadd(a.c, a.u, 11), [44, 18, 44], [0.72, 0.86, 0.94], b);
          stage._mat = MAT.METAL;
          for (const o of [-21, 21]) {
            addBox(stage, vadd(vadd(a.c, a.t, o), a.u, 11), [46, 0.5, 0.5], WHITE, b);
            addBox(stage, vadd(vadd(a.c, a.r, o * 0.5), a.u, 11), [0.5, 0.5, 46], WHITE, b);
          }
          addBox(stage, vadd(a.c, a.u, 11), [46, 0.4, 46], [0.88, 0.90, 0.94], b);
          addBox(stage, vadd(a.c, a.u, 20.5), [48, 1.0, 48], WHITE, b);
          stage._mat = 0;
        }, { required: true });
      }

      {
        const a = anchor(K(0.008), 1, 62);
        const b = [a.r, a.u, a.t];
        modelGroup("sochi-olympic-park-station", {
          center: vadd(a.c, a.u, 10), size: [36, 22, 88], basis: b,
        }, (stage) => {
          stage._mat = MAT.CONCRETE;
          addBox(stage, vadd(a.c, a.u, 1.0), [32, 2.0, 80], [0.78, 0.80, 0.84], b);
          stage._mat = MAT.GLASS;
          addBox(stage, vadd(a.c, a.u, 8), [28, 12, 72], [0.55, 0.68, 0.80], b);
          stage._mat = MAT.METAL;
          addBox(stage, vadd(a.c, a.u, 15.2), [34, 0.7, 84], WHITE, b);
          for (let c = 0; c < 5; c++) {
            addCyl(stage, vadd(vadd(a.c, a.t, (c - 2) * 14), a.u, 1.0),
              0.22, 14.2, WHITE, 6, b);
          }
          addCyl(stage, vadd(vadd(a.c, a.t, 38), a.u, 1.0), 0.18, 18, WHITE, 5, b);
          addBox(stage, vadd(vadd(a.c, a.t, 38), a.u, 19.2), [1.4, 0.9, 0.4],
            [0.86, 0.18, 0.16], b);
          stage._mat = 0;
        }, { required: true });
      }

      const CYP = [0.16, 0.34, 0.20], CYP_D = [0.13, 0.29, 0.18];
      for (const [s0, s1, side, dist, h] of [
        [0.320, 0.395, -1, 15, 11],
        [0.330, 0.405,  1, 16, 11],
        [0.620, 0.700, -1, 15, 12],
        [0.635, 0.715,  1, 17, 11],
      ]) along(s0, s1, 12, (k) => cypress(k, side, dist, h + hash(k * 5) * 1.6,
        hash(k * 9) < 0.5 ? CYP : CYP_D, { slim: 0.85 }));
      for (const [id, s, side, gap] of [
        ["approach", 0.300, 1, 8], ["north", 0.235, 1, 32],
      ]) {
        groundPatch(K(s), side, gap, [10, 0.14, 44], [0.24, 0.42, 0.22],
          { id: `sochi-parterre-${id}`, samples: 5 });
        hedge(s - 0.018, s + 0.018, side, gap - 1.2, 0.9, [0.15, 0.34, 0.18]);
        hedge(id === "approach" ? 0.288 : s - 0.018, s + 0.018, side, gap + 9.5, 0.9, [0.15, 0.34, 0.18]);
      }
    };
