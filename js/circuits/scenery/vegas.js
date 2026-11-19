"use strict";
(window.TrackScenery = window.TrackScenery || {})["vegas"] =
  function (api) {
      const { K, lapBounds, out, MAT, seat, pyMin, place, backdrop, addBox, addCyl,
        addFrustum, groundPatch, along, anchor, vadd, onTrack, building, tower, billboard, grandstandEx, marshalPost, gantry, palm, fence, wall, guardrail, tyreWall, hash,
        cityFront, modelGroup, overheadSpan, waterSurface, circuitKit, broadcastCompound, cameraTower,
        bakedModel, terrainYAt, foundation } = api;

      const ferrisWheel = (k, side, dist, radius) => {
        const a = anchor(k, side, dist);
        const hub = vadd(a.c, a.u, radius + 5);
        modelGroup("vegas-high-roller", {
          center: hub,
          size: [10, radius * 2 + 14, radius * 2 + 14],
          basis: [a.r, a.u, a.t],
        }, (stage) => {
          const rim = [];
          const seg = 16;
          stage._mat = MAT.METAL;
          for (const along of [-4, 4]) {
            const foot = vadd(a.c, a.t, along);
            addBox(stage, vadd(foot, a.u, (radius + 5) / 2),
              [1.4, radius + 5, 1.4], [0.22, 0.22, 0.25], [a.r, a.u, a.t]);
          }
          const strut = (p0, p1, thick, col, ax) => {
            const d = [p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]];
            const len = Math.hypot(d[0], d[1], d[2]) || 1;
            const axis = [d[0] / len, d[1] / len, d[2] / len];
            const face = [
              a.r[1] * axis[2] - a.r[2] * axis[1],
              a.r[2] * axis[0] - a.r[0] * axis[2],
              a.r[0] * axis[1] - a.r[1] * axis[0],
            ];
            const o = ax || 0;
            addBox(stage,
              [(p0[0] + p1[0]) / 2 + a.r[0] * o, (p0[1] + p1[1]) / 2 + a.r[1] * o, (p0[2] + p1[2]) / 2 + a.r[2] * o],
              [thick, len, thick], col, [a.r, axis, face]);
          };
          for (let i = 0; i < seg; i++) {
            const ang = i / seg * 6.2832;
            rim.push(vadd(vadd(hub, a.t, Math.cos(ang) * radius), a.u, Math.sin(ang) * radius));
          }
          const HUB_R = 2.0;
          for (let i = 0; i < seg; i++) {
            const d = [rim[i][0] - hub[0], rim[i][1] - hub[1], rim[i][2] - hub[2]];
            const L = Math.hypot(d[0], d[1], d[2]) || 1;
            const root = [hub[0] + d[0] / L * HUB_R, hub[1] + d[1] / L * HUB_R,
                          hub[2] + d[2] / L * HUB_R];
            strut(root, rim[i], 0.28, [0.34, 0.36, 0.42], i % 2 ? 0.06 : -0.06);
            strut(rim[i], rim[(i + 1) % seg], 0.38, [0.82, 0.90, 1.00], i % 2 ? -0.06 : 0.06);
            const cabCol = [CYAN, MAGENTA, GOLD, LIME][i % 4];
            addBox(stage, vadd(rim[i], a.u, -1.2), [2.4, 2.2, 2.4], cabCol, [a.r, a.u, a.t]);
          }
          addBox(stage, hub, [3.5, 3.5, 3.5], [0.72, 0.78, 0.88], [a.r, a.u, a.t]);
        }, { required: true });
      };

      const WARM = [1.0, 0.85, 0.45];
      const GOLD = [1.0, 0.70, 0.20];
      const MAGENTA = [1.0, 0.10, 0.70];
      const CYAN = [0.20, 0.90, 1.00];
      const VIOLET = [0.75, 0.20, 1.00];
      const LIME = [0.60, 1.00, 0.35];
      const ROSE = [1.00, 0.25, 0.55];
      const BLUE = [0.25, 0.55, 1.00];
      const RED = [1.00, 0.15, 0.25];
      const LED = [0.98, 0.98, 1.0];
      const DARKROCK = [0.16, 0.06, 0.05];
      const NEON = [MAGENTA, CYAN, VIOLET, LIME, WARM, GOLD, ROSE, BLUE, RED];

      const LOT_ASPHALT = [0.10, 0.10, 0.12];
      const LOT_STRIPE = [0.86, 0.82, 0.44];
      const TUBE = [0.62, 0.63, 0.66], PLANK = [0.74, 0.75, 0.78];
      const LOT_FANS = [
        [0.11, 0.12, 0.16], [0.16, 0.16, 0.21], [0.13, 0.14, 0.18], [0.20, 0.19, 0.24],
        [0.11, 0.12, 0.16], [2.4, 2.2, 1.9], [0.34, 0.20, 0.30], [0.18, 0.22, 0.32],
      ];
      const lotBleacher = (id, s, side, gap, bays, opts) => {
        opts = opts || {};
        const rows = opts.rows || 7, pitch = 6.8, len = bays * pitch;
        const ribbon = opts.ribbon || NEON[Math.round(s * 31) % NEON.length];
        const k = K(s), a0 = anchor(k, side, gap + 8), b = [a0.r, a0.u, a0.t];
        const IN = -side;
        const topH = 2.2 + rows * 1.38;
        let hi = a0.c[1], lo = a0.c[1];
        for (const fr of [-8, -4, 0, 4, 8]) for (const ft of [-0.5, 0, 0.5]) {
          const q = vadd(vadd(a0.c, a0.r, fr), a0.t, ft * (len + 3)), g = terrainYAt(q[0], q[2]);
          if (g != null) { hi = Math.max(hi, g); lo = Math.min(lo, g); }
        }
        const lift = hi - a0.c[1] > 0.03 ? hi - a0.c[1] + 0.02 : 0;
        const a = Object.assign({}, a0, { c: vadd(a0.c, a0.u, lift) });
        modelGroup(id, {
          center: vadd(a.c, a.u, (topH + 2.5) / 2),
          size: [17, topH + 2.5, len + 4], basis: b,
        }, (stage) => {
          if (lift) foundation(stage, { center: a.c, size: [15.9, len + 2.9], top: a.c[1],
                                        basis: b, col: [0.30, 0.30, 0.33], embed: 0.3 });
          addBox(stage, vadd(a.c, a.u, 0.08), [16, 0.16, len + 3], LOT_ASPHALT, b);
          for (let i = 0; i * 2.8 < len + 2; i++)
            addBox(stage, vadd(vadd(a.c, a.t, -len / 2 - 1 + i * 2.8), a.r, IN * 6.6),
              [3.2, 0.04, 0.14], LOT_STRIPE, b);
          stage._mat = MAT.METAL;
          for (let i = 0; i <= bays; i++) {
            const p = vadd(a.c, a.t, (i - bays / 2) * pitch);
            seat.cyl(stage, vadd(p, a.r, IN * 5.0), 0.14, 2.2, TUBE, 5, b);
            seat.cyl(stage, vadd(p, a.r, -IN * 5.0), 0.16, topH, TUBE, 5, b);
            for (let y = 2.2; y < topH; y += 2.4)
              addBox(stage, vadd(p, a.u, y), [10.2, 0.11, 0.11], TUBE, b);
          }
          for (let t = 0; t < rows; t++) {
            const lat = IN * (4.5 - t * 1.28), y = 1.4 + t * 1.38;
            seat.box(stage, vadd(vadd(a.c, a.r, lat), a.u, y), [1.28, 0.14, len], PLANK, b);
            seat.box(stage, vadd(vadd(a.c, a.r, lat), a.u, y + 0.14), [0.9, 0.7, len - 1.4],
              [0.60, 0.61, 0.64], b);
            stage._mat = MAT.FABRIC;
            seat.box(stage, vadd(vadd(a.c, a.r, lat), a.u, y + 0.80),
              [0.58, 0.80, len - 2.2], LOT_FANS[0], b);
            const cnt = Math.min(13, Math.floor(len / 4.4));
            for (let j = 0; j < cnt; j++) {
              const h2 = hash(k * 19 + t * 53 + j * 41);
              if (h2 < 0.46) continue;
              seat.box(stage,
                vadd(vadd(vadd(a.c, a.r, lat + IN * 0.08), a.t,
                  (j / (cnt - 1) - 0.5) * (len - 4)), a.u, y + 1.06),
                [0.50, 1.12, 1.5], LOT_FANS[Math.floor(h2 * 53) % LOT_FANS.length], b);
            }
            stage._mat = MAT.METAL;
          }
          {
            const e = vadd(a.c, a.t, -(len / 2 + 2.0));
            seat.box(stage, vadd(vadd(e, a.r, -IN * 1.5), a.u, -0.1), [7.4, topH + 0.1, 3.4], [0.30, 0.31, 0.34], b);
            for (let f = 0; f * 2.4 < topH; f++)
              addBox(stage, vadd(vadd(e, a.r, -IN * 1.5), a.u, 1.2 + f * 2.4),
                [7.6, 0.16, 3.6], TUBE, b);
          }
          stage._mat = 0;
          addBox(stage, vadd(vadd(a.c, a.r, IN * 5.4), a.u, 1.6), [0.2, 1.5, len], ribbon, b);
          addBox(stage, vadd(vadd(a.c, a.r, IN * 5.5), a.u, 0.55), [0.12, 0.3, len],
            [0.06, 0.06, 0.09], b);
        });
      };

      const SL = Math.round((1 - api.def._sceneryShift) * 1e4) / 1e4;
      const sl = (f) => (((f + SL) % 1) + 1) % 1;

      fence(0.0, 0.07, 1, 1.4, 3.6, [0.55, 0.56, 0.60]);
      fence(0.83, 0.91, -1, 1.4, 3.6, [0.55, 0.56, 0.60]);
      guardrail(sl(0.080), sl(0.112), 1, 1.0, [0.80, 0.80, 0.84]);
      guardrail(sl(0.295), sl(0.335), -1, 1.0, [0.80, 0.80, 0.84]);
      tyreWall(sl(0.305), sl(0.345), -1, 1.2, MAGENTA);
      tyreWall(sl(0.955), sl(0.985), 1, 1.2, CYAN);
      for (const [s0, s1, side] of [
        [0.07, 0.30,  1], [0.30, 0.50,  1], [0.50, 0.72,  1], [0.72, 0.99,  1],
        [0.00, 0.121, -1], [0.192, 0.25, -1], [0.25, 0.48, -1], [0.48, 0.70, -1], [0.70, 0.83, -1],
        [0.91, 0.99, -1],
      ]) fence(s0, s1, side, 3.4, 3.6, [0.55, 0.56, 0.60]);
      for (const [s0, s1, side] of [
        [0.00, 0.32,  1], [0.34, 0.64,  1], [0.66, 0.98,  1],
        [0.02, 0.121, -1], [0.192, 0.33, -1], [0.35, 0.65, -1], [0.67, 0.97, -1],
      ]) wall(s0, s1, side, 2.4, 1.5,
              NEON[Math.round(s0 * 13) % NEON.length], 0.35);

      for (const [s, side] of [[0.12, 1], [0.22, -1], [0.33, 1], [0.49, -1],
                               [0.62, 1], [0.78, -1], [0.92, 1]]) {
        marshalPost(K(s), side, 4.5);
      }
      gantry(sl(0.005), 9.5, [0.12, 0.12, 0.16]);
      gantry(sl(0.50), 8.5, [0.12, 0.12, 0.16]);
      gantry(sl(0.80), 8.5, [0.12, 0.12, 0.16]);

      const { cx, cz, radius: trad } = lapBounds();
      const ring = trad + 680;
      const desertN = 12;
      for (let i = 0; i < desertN; i++) {
        const a = i / desertN * 6.2832, h = hash(i * 7 + 3), h2 = hash(i * 13 + 2);
        const mx = cx + Math.cos(a) * ring, mz = cz + Math.sin(a) * ring;
        if (onTrack(mx, mz, 60)) continue;
        const mh = 22 + h * 34, baseR = 120 + h2 * 90;
        const rock = [DARKROCK[0] * (0.9 + h * 0.4), DARKROCK[1] * (0.9 + h * 0.4), DARKROCK[2] * (0.95 + h * 0.5)];
        addFrustum(out, [mx, pyMin - 4, mz], baseR * 1.5, baseR * 0.95, mh * 0.42, [rock[0] * 1.1, rock[1] * 1.1, rock[2] * 1.1], 6);
        addFrustum(out, [mx, pyMin - 4 + mh * 0.30, mz], baseR, baseR * 0.58, mh * 0.7, rock, 6);
      }

      {
        const sky = trad + 300;
        const skyN = 44;
        const SKYWALL = [
          [0.72, 0.68, 0.58], [0.58, 0.62, 0.70], [0.66, 0.58, 0.50],
          [0.62, 0.66, 0.72], [0.70, 0.64, 0.56], [0.54, 0.58, 0.66],
        ];
        for (let i = 0; i < skyN; i++) {
          const a = i / skyN * 6.2832, h = hash(i * 11 + 17), h2 = hash(i * 23 + 5);
          const rr = sky + (hash(i * 31 + 9) - 0.5) * 160;
          const mx = cx + Math.cos(a) * rr, mz = cz + Math.sin(a) * rr;
          if (onTrack(mx, mz, 80)) continue;
          const slim = (i % 5 === 1) ? 0.62 : (i % 5 === 3) ? 1.18 : 1.0;
          const bh = 50 + h * 130, bw = (34 + h2 * 30) * slim, bd = (34 + h2 * 26) * (2.0 - slim * 0.5);
          const skin = SKYWALL[i % SKYWALL.length];
          const baseH = bh * 0.78;
          addBox(out, [mx, pyMin + baseH / 2, mz], [bw, baseH, bd], skin);
          const floors = Math.max(3, Math.round(baseH / 18));
          for (let f = 1; f < floors; f++) {
            addBox(out, [mx, pyMin + f * (baseH / floors), mz], [bw * 1.02, 0.9, bd * 1.02], [0.22, 0.20, 0.18]);
          }
          const crownCol = [skin[0] * 0.88, skin[1] * 0.88, skin[2] * 0.90];
          addBox(out, [mx, pyMin + baseH + (bh - baseH) / 2, mz],
            [bw * 0.72, bh - baseH, bd * 0.72], crownCol);
          const neon = NEON[i % NEON.length];
          addBox(out, [mx, pyMin + bh - 2, mz], [bw * 0.55, 3, bd * 0.55], neon);
          if (h > 0.55) {
            addCyl(out, [mx, pyMin + bh, mz], 0.4, 6 + h * 16, [0.5, 0.5, 0.56], 4);
            addBox(out, [mx, pyMin + bh + 6 + h * 16, mz], [1.2, 1.2, 1.2], RED);
          }
        }
      }

      const lampPost = (k, side, dist) => {
        const a = anchor(k, side, dist), b = [a.r, a.u, a.t];
        if (addCyl(out, a.c, 0.22, 12, [0.28, 0.28, 0.32], 5, b) === false) return;
        const armPt = vadd(a.c, a.u, 12);
        addBox(out, vadd(armPt, b[2], -side * 1.5), [0.2, 0.2, 3.0], [0.30, 0.30, 0.34], b);
        const headPt = vadd(vadd(armPt, b[2], -side * 3.0), a.u, -0.3);
        addBox(out, headPt, [2.8, 0.5, 1.8], [0.98, 0.95, 0.82], b);
      };

      for (let s = 0.965; s <= 1.045; s += 0.018) {
        lampPost(K(sl(s)), -1, 11);
        lampPost(K(sl(s + 0.009)), 1, 11);
      }
      for (let s = 0.055; s <= 0.115; s += 0.022) {
        lampPost(K(sl(s)), (s < 0.085 ? 1 : -1), 12);
      }
      for (let s = 0.48; s <= 0.82; s += 0.022) {
        lampPost(K(sl(s)), -1, 16);
        lampPost(K(sl(s + 0.011)), 1, 16);
      }
      for (let s = 0.83; s <= 0.97; s += 0.020) {
        lampPost(K(sl(s)), 1, 12);
        lampPost(K(sl(s + 0.010)), -1, 12);
      }

      {
        const stripNeon = (s0, s1, step, gap) => {
          let j = 0;
          for (let s = s0; s <= s1; s += step, j++) {
            const side = (j % 2) ? 1 : -1;
            const a = anchor(K(sl(s)), side, gap);
            const poolNeon = NEON[(j * 3 + (side > 0 ? 1 : 0)) % NEON.length];
            const dimN = [poolNeon[0] * 0.55, poolNeon[1] * 0.55, poolNeon[2] * 0.55];
            addBox(out, vadd(a.c, a.u, 0.12), [3.2, 0.18, 14], dimN, [a.r, a.u, a.t]);
          }
        };
        stripNeon(0.97, 1.04, 0.028, 3.2);
        for (let s = 0.485; s <= 0.815; s += 0.022) {
          const side = (Math.round(s * 50) % 2) ? 1 : -1;
          const a = anchor(K(sl(s)), side, 3.0);
          const poolNeon = NEON[Math.round(s * 40) % NEON.length];
          const dimN = [poolNeon[0] * 0.55, poolNeon[1] * 0.55, poolNeon[2] * 0.55];
          addBox(out, vadd(a.c, a.u, 0.12), [3.2, 0.18, 14], dimN, [a.r, a.u, a.t]);
        }
        for (let s = 0.83; s <= 0.96; s += 0.028) {
          const side = (Math.round(s * 40) % 2) ? 1 : -1;
          const a = anchor(K(sl(s)), side, 3.2);
          const poolNeon = NEON[Math.round(s * 37) % NEON.length];
          const dimN = [poolNeon[0] * 0.55, poolNeon[1] * 0.55, poolNeon[2] * 0.55];
          addBox(out, vadd(a.c, a.u, 0.12), [3.2, 0.18, 14], dimN, [a.r, a.u, a.t]);
        }
      }

      const grandPrixPlaza = (k, side, gap) => {
        const W = 42, LEN = 118, H = 38;
        const dist = gap + W / 2;
        const a = anchor(k, side, dist), b = [a.r, a.u, a.t];
        const GLASS = [0.14, 0.30, 0.46];
        const GLASS_LIT = [0.55, 0.85, 1.10];
        const FRAME = [0.22, 0.23, 0.27];
        modelGroup("vegas-grand-prix-plaza", {
          center: vadd(a.c, a.u, H / 2),
          size: [W + 4, H + 2, LEN + 4],
          basis: b,
        }, (stage) => {
          addBox(stage, vadd(a.c, a.u, 9), [W, 18, LEN], GLASS, b);
          addBox(stage, vadd(a.c, a.u, 18.4), [W + 0.6, 0.8, LEN + 0.6], FRAME, b);
          const l3 = LEN * 0.74;
          const c3 = vadd(vadd(a.c, a.r, side * 3), a.u, 24);
          addBox(stage, c3, [W * 0.82, 10, l3], GLASS, b);
          addBox(stage, vadd(vadd(a.c, a.r, side * 3), a.u, 29.2), [W * 0.82 + 0.5, 0.6, l3 + 0.5], FRAME, b);
          const l4 = LEN * 0.5;
          const c4 = vadd(vadd(a.c, a.r, side * 6), a.u, 32.5);
          addBox(stage, c4, [W * 0.6, 6, l4], GLASS_LIT, b);
          addBox(stage, vadd(vadd(a.c, a.r, side * 6), a.u, 36), [W * 0.62, 0.5, l4 + 1], FRAME, b);
          for (const off of [-l4 * 0.42, 0, l4 * 0.42])
            addBox(stage, vadd(vadd(vadd(a.c, a.r, side * 6), a.u, 37), a.t, off), [1.4, 1.6, 1.4], GLASS_LIT, b);
          for (const rs of [-1, 1])
            addBox(stage, vadd(vadd(a.c, a.r, rs * (W / 2 + 0.2)), a.u, 3), [0.6, 1.4, LEN], GLASS_LIT, b);
        }, { required: true });
      };
      grandPrixPlaza(K(sl(0.012)), -1, 34);
      grandstandEx(sl(0.05), 1, 20, 82, null, null,
        { livery: "darkSteel", tiers: 3, roof: "truss", suites: true, endWalls: true, pylons: true });
      lotBleacher("vegas-lot-bleacher-paddock", sl(0.0745), -1, 16, 9,
        { rows: 8, ribbon: MAGENTA });
      for (let i = 0; i < 4; i++) {
        const a = anchor(K(sl(0.01 + i * 0.012)), 1, 9);
        addCyl(out, a.c, 0.28, 15, [0.35, 0.35, 0.38], 6, [a.r, a.u, a.t]);
        addBox(out, vadd(a.c, a.u, 15), [3.5, 1.2, 1.2], LED, [a.r, a.u, a.t]);
      }
      if (circuitKit) {
        circuitKit.serviceCompound({
          id: "kit:vegas:paddock-service", frac: sl(0.022),
          side: -1, gap: 15, size: [22, 5, 34], vehicles: 8,
        });
      }
      broadcastCompound(K(sl(0.09)), 1, 44, { vans: 4, dishes: 3, mastH: 11 });
      cameraTower(K(sl(0.002)), -1, 34, { h: 20, boom: 1.4 });

      {
        const pads = [
          ["k_pitsoffice", 0.085, 1, 95, 2.4],
          ["k_pitsgarageclosed", 0.11, -1, 70, 2.4],
          ["k_tentlong", 0.20, -1, 72, 2.4],
        ];
        for (const [id, s, side, dist, sc] of pads) {
          const ks = K(sl(s));
          if (!bakedModel(id, ks, side, dist, { scale: sc }))
            building(ks, side, dist, 20, 16, 18,
              { kind: "tiered", wall: [0.16, 0.17, 0.20], window: [0.30, 0.38, 0.48], floor: 8, lit: true });
        }
        {
          const ks = K(sl(0.16));
          building(ks, 1, 64, 20, 67, 18,
            { kind: "tiered", wall: [0.16, 0.17, 0.20], window: [0.30, 0.38, 0.48], floor: 8, lit: true });
        }
      }

      building(K(sl(0.03)), -1, 58, 34, 128, 30, { kind: "notch", wall: [0.07, 0.08, 0.13], window: [0.10, 0.22, 0.42], floor: 11, lit: true });
      place(K(sl(0.03)), -1, 24, [10, 1.0, 26], [0.15, 0.30, 0.55]);
      building(K(sl(0.062)), -1, 64, 30, 90, 26, { kind: "screen", wall: [0.14, 0.14, 0.18], window: LED, floor: 15, lit: true });
      place(K(sl(0.062)), -1, 48, [2.5, 16, 30], LED);

      const BOH_WALL = [0.16, 0.17, 0.20];
      const BOH_WIN  = [0.30, 0.38, 0.48];
      building(K(sl(0.096)), -1, 58, 30, 46, 30, { kind: "twin", wall: BOH_WALL, window: BOH_WIN, floor: 8, lit: true });
      building(K(sl(0.136)), 1, 55, 26, 40, 26, { kind: "tiered", wall: BOH_WALL, window: BOH_WIN, floor: 8, lit: true });
      cityFront(0.12, 0.20, -1, 58, { minH: 6, maxH: 14, depth: 18, step: 32,
        palette: [[0.18, 0.18, 0.20], [0.19, 0.19, 0.20]], lit: true, windowCol: BOH_WIN });
      cityFront(0.12, 0.20,  1, 52, { minH: 6, maxH: 12, depth: 16, step: 32,
        palette: [[0.18, 0.18, 0.20], [0.17, 0.18, 0.21]], lit: true, windowCol: BOH_WIN });
      building(K(sl(0.26)), 1, 62, 30, 40, 28, { kind: "tiered", wall: BOH_WALL, window: BOH_WIN, floor: 8, lit: true });

      {
        const a = anchor(K(sl(0.445)), -1, 62);
        const b = [a.r, a.u, a.t];
        const COPPER = [0.55, 0.28, 0.18];
        const COPPER_D = [0.38, 0.18, 0.12];
        const WIN_C = [1.0, 0.72, 0.35];
        modelGroup("vegas-wynn-encore", {
          center: vadd(a.c, a.u, 55),
          size: [52, 118, 70],
          basis: b,
        }, (stage) => {
          seat.box(stage, a.c, [40, 12, 58], COPPER_D, b);
          for (const [toff, hgt] of [[-14, 96], [14, 88]]) {
            const c = vadd(vadd(a.c, a.t, toff), a.u, 12);
            seat.box(stage, c, [22, hgt, 28], COPPER, b);
            stage._mat = MAT.GLASS;
            addBox(stage, vadd(c, a.u, hgt * 0.45), [23, hgt * 0.72, 26], WIN_C, b);
            stage._mat = 0;
            addBox(stage, vadd(c, a.u, hgt + 1), [14, 3.5, 16], [1.0, 0.55, 0.22], b);
          }
          addBox(stage, vadd(vadd(a.c, a.r, -18), a.u, 8), [8, 1.2, 40], [1.0, 0.45, 0.18], b);
        }, { required: true });
      }

      {
        const a = anchor(K(sl(0.28)), 1, 125);
        const R = 78.5, H = 112;
        const baseY = a.c[1];
        const SPHERE = [0.10, 0.28, 0.42];
        const SPHERE_HI = [0.28, 0.72, 0.92];
        const SPHERE_EQ = [0.92, 0.28, 0.78];
        const RIB = [0.14, 0.16, 0.20];
        modelGroup("vegas-sphere", {
          center: [a.c[0], baseY + H / 2, a.c[2]],
          size: [R * 2.08, H * 1.04, R * 2.08],
        }, (stage) => {
          const P0 = 0.62, P1 = Math.PI - 0.12, bands = 14;
          const yAt = (ph) => baseY + H * (Math.cos(P0) - Math.cos(ph)) / (Math.cos(P0) - Math.cos(P1));
          for (let i = 0; i < bands; i++) {
            const ph0 = P0 + (P1 - P0) * i / bands, ph1 = P0 + (P1 - P0) * (i + 1) / bands;
            const mid = (ph0 + ph1) / 2;
            const tint = Math.abs(mid - Math.PI / 2) < 0.12 ? SPHERE_EQ : (i % 2 ? SPHERE_HI : SPHERE);
            addFrustum(stage, [a.c[0], yAt(ph0), a.c[2]], R * Math.sin(ph0), R * Math.sin(ph1),
              yAt(ph1) - yAt(ph0), tint, 28, null);
          }
          const eqY = yAt(Math.PI / 2);
          for (let m = 0; m < 12; m++) {
            const ang = (m / 12) * Math.PI * 2;
            const rr = R * 0.98;
            addBox(stage,
              [a.c[0] + Math.cos(ang) * rr, eqY, a.c[2] + Math.sin(ang) * rr],
              [2.2, H * 0.72, 2.2], RIB, null);
          }
          addCyl(stage, [a.c[0], yAt(P1) - 0.5, a.c[2]], R * Math.sin(P1) + 1.5, 1.5, SPHERE_HI, 16, null);
          seat.frustum(stage, [a.c[0], baseY, a.c[2]], R * Math.sin(P0) + 3, R * Math.sin(P0) + 1, 4.2,
            [0.18, 0.20, 0.24], 24, null);
          seat.box(stage, [a.c[0], baseY, a.c[2]], [R * 1.15, 1.6, R * 1.15], [0.28, 0.28, 0.32], null);
        }, { required: true });
        groundPatch(K(sl(0.292)), -1, 4.5, [10, 0.16, 42], [0.12, 0.55, 0.62],
          { id: "vegas-sphere-runoff-cyan", samples: 5 });
        groundPatch(K(sl(0.318)), -1, 5.0, [9, 0.15, 36], [0.18, 0.62, 0.32],
          { id: "vegas-sphere-runoff-lime", samples: 5 });
        groundPatch(K(sl(0.305)), -1, 5, [6, 0.22, 28], [0.15, 0.70, 0.75],
          { id: "vegas-sphere-runoff-cyan-inner", samples: 3 });
        groundPatch(K(sl(0.325)), -1, 6.5, [5, 0.18, 22], [0.25, 0.75, 0.35],
          { id: "vegas-sphere-runoff-lime-inner", samples: 3 });
        for (let p = 0; p < 6; p++) {
          const ps = 0.268 + p * 0.008;
          const pa = anchor(K(sl(ps)), 1, 38 + (p % 2) * 6);
          const pb = [pa.r, pa.u, pa.t];
          const ncol = NEON[p % NEON.length];
          addCyl(out, pa.c, 0.35, 9, [0.22, 0.22, 0.26], 5, pb);
          addBox(out, vadd(pa.c, pa.u, 9.2), [1.6, 1.4, 1.6], ncol, pb);
        }
        {
          const ca = anchor(K(sl(0.278)), 1, 48), cb = [ca.r, ca.u, ca.t];
          out._mat = MAT.FABRIC;
          addBox(out, vadd(ca.c, ca.u, 0.9), [4.5, 1.6, 48], LOT_FANS[0], cb);
          out._mat = 0;
        }
      }

      backdrop(K(sl(0.45)), 1, 240, [180, 30, 120], DARKROCK);

      building(K(sl(0.49)), -1, 68, 38, 92, 36, { kind: "twin", wall: [0.72, 0.66, 0.54], window: [1.0, 0.85, 0.35], floor: 9, lit: true });
      building(K(sl(0.505)), -1, 78, 30, 70, 30, { kind: "tiered", wall: [0.68, 0.62, 0.50], window: [0.98, 0.80, 0.30], floor: 8, lit: true });
      tower(K(sl(0.495)), -1, 82, 16, 62, { col: [0.62, 0.48, 0.36], seg: 6, cap: true, capCol: [1.0, 0.82, 0.20], mast: true });
      place(K(sl(0.49)), -1, 14, [8, 1.8, 28], [1.0, 0.85, 0.25]);

      ferrisWheel(K(sl(0.55)), -1, 132, 65);
      billboard(K(sl(0.56)), -1, 16, 16, 10, CYAN);
      building(K(sl(0.55)), -1, 38, 30, 18, 28, { kind: "screen", wall: [0.24, 0.24, 0.28], window: [0.15, 0.80, 1.00], floor: 4 });
      place(K(sl(0.55)), -1, 14, [22, 0.65, 22], [0.12, 0.38, 0.58]);
      overheadSpan({
        id: "vegas-flamingo-ped-bridge", frac: sl(0.548), clearance: 5.8,
        thickness: 0.42, depth: 3.2, span: 32, color: [0.34, 0.35, 0.38], supportGap: 3,
      });
      overheadSpan({
        id: "vegas-midstrip-ped-bridge", frac: sl(0.612), clearance: 6.4,
        thickness: 0.36, depth: 2.6, span: 26,
        color: [0.32, 0.33, 0.36], supportGap: 3,
      });

      {
        const a = anchor(K(sl(0.62)), 1, 72);
        const b = [a.r, a.u, a.t];
        const IVORY = [0.78, 0.74, 0.64];
        const IVORY_D = [0.62, 0.58, 0.48];
        const GOLD_UP = [1.0, 0.82, 0.38];
        modelGroup("vegas-caesars", {
          center: vadd(a.c, a.u, 40),
          size: [48, 86, 72],
          basis: b,
        }, (stage) => {
          seat.box(stage, a.c, [42, 18, 64], IVORY, b);
          seat.box(stage, vadd(a.c, a.u, 18), [38, 52, 58], IVORY_D, b);
          stage._mat = MAT.GLASS;
          addBox(stage, vadd(a.c, a.u, 42), [39.5, 40, 59.5], GOLD_UP, b);
          stage._mat = 0;
          seat.box(stage, vadd(a.c, a.u, 70), [34, 10, 50], IVORY, b);
          addBox(stage, vadd(a.c, a.u, 78), [28, 3.5, 44], GOLD_UP, b);
          addBox(stage, vadd(vadd(a.c, a.r, -20), a.u, 16), [2.2, 3.2, 58], GOLD_UP, b);
          addBox(stage, vadd(vadd(a.c, a.r, -19.2), a.u, 72), [1.4, 2.4, 46], GOLD_UP, b);
          for (const off of [-28, -14, 0, 14, 28])
            seat.cyl(stage, vadd(vadd(a.c, a.t, off), a.r, -20), 1.15, 16, IVORY, 8, b);
        }, { required: true });
        place(K(sl(0.62)), 1, 16, [8, 2.4, 44], [1.0, 0.88, 0.30]);
        place(K(sl(0.62)), 1, 14, [10, 1.2, 50], [0.95, 0.75, 0.15], 0.3);
      }

      {
        const a = anchor(K(sl(0.68)), 1, 70);
        const b = [a.r, a.u, a.t];
        const BEL = [0.78, 0.72, 0.60];
        const BEL_D = [0.68, 0.62, 0.50];
        const BEL_WIN = [0.55, 0.72, 0.88];
        modelGroup("vegas-bellagio", {
          center: vadd(a.c, a.u, 36),
          size: [48, 78, 120],
          basis: b,
        }, (stage) => {
          seat.box(stage, a.c, [40, 14, 108], BEL, b);
          seat.box(stage, vadd(a.c, a.u, 14), [36, 52, 100], BEL_D, b);
          stage._mat = MAT.GLASS;
          addBox(stage, vadd(a.c, a.u, 38), [37.2, 42, 101], BEL_WIN, b);
          stage._mat = 0;
          for (const off of [-40, -24, -8, 8, 24, 40]) {
            seat.cyl(stage, vadd(vadd(a.c, a.t, off), a.r, -19), 1.1, 12, BEL, 8, b);
          }
          addBox(stage, vadd(vadd(a.c, a.r, -19), a.u, 12.5), [1.6, 1.2, 96], [0.92, 0.86, 0.70], b);
          seat.box(stage, vadd(a.c, a.u, 66), [32, 8, 88], [0.62, 0.56, 0.46], b);
          addBox(stage, vadd(a.c, a.u, 72), [20, 2.5, 60], [1.0, 0.78, 0.28], b);
          addBox(stage, vadd(a.c, a.u, 75.2), [18, 2.0, 56], [1.0, 0.82, 0.35], b);
        }, { required: true });
        groundPatch(K(sl(0.68)), 1, 4, [3, 0.16, 95], [0.85, 0.62, 0.16],
          { id: "vegas-bellagio-apron", samples: 6 });
        for (let i = 0; i < 6; i++) {
          const s = 0.664 + i * 0.007;
          const ba = anchor(K(sl(s)), 1, 15);
          addCyl(out, ba.c, 0.18, 1.4, [0.55, 0.52, 0.48], 5, [ba.r, ba.u, ba.t]);
          addBox(out, vadd(ba.c, ba.u, 1.45), [0.55, 0.18, 0.55], [0.95, 0.85, 0.45], [ba.r, ba.u, ba.t]);
        }
      }
      const bellagioJets = 18;
      const jetCols = [LED, [0.55, 0.82, 0.95], CYAN, LED, [0.40, 0.70, 0.95], LED, [0.60, 0.88, 1.00], CYAN];
      for (let i = 0; i < bellagioJets; i++) {
        const s = 0.663 + (i / (bellagioJets - 1)) * 0.046;
        const a = anchor(K(sl(s)), 1, 26 + hash(i * 4.7) * 10);
        const jetH = 10 + hash(i * 9.3 + 2) * 18;
        addBox(out, vadd(a.c, a.u, jetH / 2), [1.0, jetH, 1.0], jetCols[i % jetCols.length], [a.r, a.u, a.t]);
      }
      waterSurface(K(sl(0.672)), 1, 18, [118, 1.4, 160], [0.04, 0.18, 0.32],
        { id: "vegas-bellagio-lake-east", required: true });
      waterSurface(K(sl(0.702)), 1, 18, [110, 1.4, 145], [0.04, 0.16, 0.30],
        { id: "vegas-bellagio-lake-west" });
      groundPatch(K(sl(0.685)), 1, 16, [22, 0.14, 96], [0.08, 0.28, 0.48],
        { id: "vegas-bellagio-pool-strip", samples: 6 });

      tower(K(sl(0.74)), -1, 74, 22, 130, { col: [0.55, 0.48, 0.35], seg: 4, cap: true, capCol: [1.0, 0.85, 0.4], mast: true });
      {
        const a = anchor(K(sl(0.74)), -1, 26);
        const b = [a.r, a.u, a.t];
        addBox(out, vadd(a.c, a.u, 0.65), [14, 1.3, 14], [0.95, 0.75, 0.20], b);
        const tw = anchor(K(sl(0.74)), -1, 74);
        const tb = [tw.r, tw.u, tw.t];
        out._mat = MAT.METAL;
        for (const y of [8, 22, 40]) {
          addBox(out, vadd(tw.c, tw.u, y), [14 - y * 0.08, 0.7, 14 - y * 0.08], [0.62, 0.52, 0.36], tb);
        }
        out._mat = 0;
        addBox(out, vadd(tw.c, tw.u, 132), [2.4, 4, 2.4], [1.0, 0.85, 0.35], tb);
      }
      building(K(sl(0.73)), -1, 24, 36, 55, 34, { wall: [0.72, 0.66, 0.54], window: [1.0, 0.82, 0.30], floor: 7 });
      {
        const a = anchor(K(sl(0.748)), -1, 38), b = [a.r, a.u, a.t];
        const RED   = [0.72, 0.12, 0.14], RED_D = [0.56, 0.09, 0.11];
        const GOLD  = [0.94, 0.74, 0.24], BLUE_RIB = [0.16, 0.22, 0.52];
        modelGroup("vegas-paris-balloon", {
          center: vadd(a.c, a.u, 9), size: [14, 22, 14], basis: b,
        }, (stage) => {
          seat.box(stage, a.c, [8, 3.2, 10], [0.20, 0.18, 0.22], b);
          addBox(stage, vadd(vadd(a.c, a.r, -4.0), a.u, 2.0), [0.4, 2.6, 8], GOLD, b);
          const bc = vadd(a.c, a.u, 3.6);
          const bands = [
            [0.0,  2.8,  5.0, 3.2, RED],
            [3.2,  5.0,  6.2, 3.0, GOLD],
            [6.2,  6.2,  5.4, 2.8, RED_D],
            [9.0,  5.4,  3.6, 2.6, GOLD],
            [11.6, 3.6,  1.2, 2.0, RED],
          ];
          for (const [y, r0, r1, h, col] of bands) {
            seat.frustum(stage, vadd(bc, a.u, y), r0, r1, h, col, 14, b);
          }
          for (let i = 0; i < 6; i++) {
            const ang = (i / 6) * Math.PI * 2;
            const rr = 5.8;
            addBox(stage, vadd(vadd(vadd(bc, a.r, Math.cos(ang) * rr),
                                     a.t, Math.sin(ang) * rr), a.u, 6.5),
                   [0.35, 6.0, 0.35], BLUE_RIB, b);
          }
          const gc = vadd(a.c, a.u, 2.4);
          seat.box(stage, gc, [3.2, 2.2, 3.2], [0.46, 0.30, 0.16], b);
          addBox(stage, vadd(gc, a.u, 2.3), [3.6, 0.35, 3.6], GOLD, b);
          stage._mat = MAT.METAL;
          for (const [dx, dz] of [[-1.4, -1.4], [1.4, -1.4], [-1.4, 1.4], [1.4, 1.4]]) {
            seat.cyl(stage, vadd(vadd(vadd(gc, a.r, dx), a.t, dz), a.u, 2.2),
                   0.06, 1.8, [0.62, 0.55, 0.34], 4, b);
          }
          stage._mat = 0;
        }, { required: true });
      }

      for (const [side, col1, col2] of [[-1, MAGENTA, CYAN], [1, CYAN, MAGENTA]]) {
        billboard(K(sl(0.85)), side, 26, 20, 12, col1);
        billboard(K(sl(0.87)), side, 26, 18, 11, col2);
        billboard(K(sl(0.89)), side, 26, 16, 10, [col1[2], col1[0], col1[1]]);
        place(K(sl(0.86)), side, 16, [10, 1.4, 10], col1);
        place(K(sl(0.88)), side, 20, [12, 1.0, 8], col2);
      }

      grandstandEx(sl(0.965), 1, 16, 70, null, null,
        { livery: "crimson", tiers: 2, roof: "cantilever", suites: true, endWalls: true });
      lotBleacher("vegas-lot-bleacher-harmon", sl(0.90), -1, 30, 9, { rows: 8, ribbon: CYAN });
      grandstandEx(sl(0.945), 1, 20, 40, null, null,
        { livery: "alu", tiers: 1, roof: "none" });
      building(K(sl(0.93)), 1, 22, 28, 52, 26, { wall: [0.22, 0.18, 0.24], window: VIOLET, floor: 7, lit: true });
      building(K(sl(0.97)), -1, 20, 26, 46, 24, { wall: [0.20, 0.18, 0.22], window: ROSE, floor: 7, lit: true });
      billboard(K(sl(0.94)), -1, 18, 18, 11, CYAN);
      billboard(K(sl(0.96)), 1, 17, 16, 10, MAGENTA);

      {
        const s0 = sl(0.485), s1 = sl(0.815);
        const span = ((s1 - s0) + 1) % 1 || (s1 - s0);

        const STEP = 0.009;
        const backdropCols = [[0.70, 0.64, 0.54], [0.58, 0.62, 0.70], [0.66, 0.56, 0.48]];
        let idx = 0;
        for (let s = 0.485; s <= 0.815; s += STEP, idx++) {
          const k = K(sl(s));
          for (const side of [-1, 1]) {
            const h1 = hash(idx * 5 + (side > 0 ? 13 : 71));
            const neon = NEON[(idx + (side > 0 ? 4 : 1)) % NEON.length];
            const fh = 80 + h1 * 100;
            backdrop(k, side, 185, [50, fh, 30], backdropCols[idx % 3]);
            backdrop(k, side, 168.5, [52, 7.0, 3], neon);
          }
        }

        const stripShop = (sRacing, side, gap) => {
          const k = K(sl(sRacing));
          const a = anchor(k, side, gap);
          const b = [a.r, a.u, a.t];
          const h = hash(Math.round(sRacing * 997) + (side > 0 ? 41 : 7));
          const neon = NEON[Math.floor(h * 97) % NEON.length];
          const along = 10 + h * 5;
          const depth = 3.2;
          const H = 10 + h * 4;
          const wall = [0.42, 0.36, 0.30];
          addBox(out, vadd(a.c, a.u, H / 2), [depth, H, along], wall, b);
          addBox(out, vadd(vadd(a.c, a.r, -side * (depth / 2 + 0.32)), a.u, H * 0.84),
            [0.45, 1.8, along * 0.94], neon, b);
          addBox(out, vadd(vadd(a.c, a.r, -side * (depth / 2 + 1.5)), a.u, 3.6),
            [2.6, 0.32, along * 0.9], neon, b);
          out._mat = MAT.GLASS;
          addBox(out, vadd(vadd(a.c, a.r, -side * (depth / 2 + 0.18)), a.u, 2.6),
            [0.22, 3.6, along * 0.72],
            [neon[0] * 0.7 + 0.2, neon[1] * 0.7 + 0.15, neon[2] * 0.7 + 0.15], b);
          out._mat = 0;
          const pyl = vadd(vadd(a.c, a.t, along * 0.52), a.r, -side * 0.35);
          addCyl(out, pyl, 0.32, 16, [0.16, 0.16, 0.18], 6, b);
          addBox(out, vadd(pyl, a.u, 12.5), [0.55, 8.5, 3.6], neon, b);
        };
        for (const [s, side, gap] of [
          [0.500, -1, 11.4], [0.512, 1, 11.7], [0.545, -1, 11.4], [0.558, 1, 11.7],
          [0.635, -1, 11.4], [0.648, 1, 11.7], [0.728, 1, 11.7],
          [0.755, -1, 11.4], [0.770, 1, 11.7],
        ]) stripShop(s, side, gap);
        for (const [s, side, col] of [
          [0.503, 1, MAGENTA], [0.546, 1, CYAN], [0.557, -1, WARM],
          [0.637, 1, MAGENTA], [0.715, -1, CYAN], [0.757, 1, VIOLET],
        ]) billboard(K(sl(s)), side, 16, 16, 11, col);
        for (const [s, side] of [[0.508, -1], [0.508, 1], [0.760, -1], [0.760, 1]]) {
          groundPatch(K(sl(s)), side, 8.0, [6, 0.14, 16], LOT_ASPHALT,
            { id: `vegas-strip-sidewalk-${side > 0 ? "r" : "l"}-${Math.round(s * 1000)}`, samples: 3 });
        }
        const casinoDayWall = [
          [0.74, 0.68, 0.56], [0.62, 0.58, 0.68], [0.70, 0.60, 0.48], [0.68, 0.66, 0.58],
          [0.58, 0.62, 0.70], [0.72, 0.64, 0.52], [0.66, 0.60, 0.54], [0.60, 0.56, 0.48],
        ];
        for (let j = 0; j < 8; j++) {
          const s = 0.485 + (j + 0.5) / 8 * 0.33, side = (j % 2) ? -1 : 1;
          const windowCol = [WARM, CYAN, MAGENTA, GOLD, VIOLET][j % 5];
          building(K(sl(s)), side, 68, 28, 120 + hash(j * 17) * 65, 36,
            { wall: casinoDayWall[j], window: windowCol, floor: 16, lit: true });
        }

        for (let j = 0; j < 8; j++) {
          const s = 0.485 + (j + 0.3) / 8 * 0.33, side = (j % 2) ? 1 : -1;
          billboard(K(sl(s)), side, 16, 16 + hash(j * 3) * 6, 10, NEON[(j + 2) % NEON.length]);
        }
        for (let j = 0; j < 22; j++) {
          const s = 0.485 + (j + 0.2) / 22 * 0.33, side = (j % 2) ? 1 : -1;
          palm(K(sl(s)), side, 22, 11 + hash(j * 23) * 4, LIME);
          if (j % 3 === 0)
            palm(K(sl(s + 0.004)), -side, 24, 10 + hash(j * 29) * 3, LIME);
        }
        for (let j = 0; j < 40; j++) {
          const s = 0.485 + (j + 0.6) / 40 * 0.33, side = (j % 2) ? -1 : 1;
          billboard(K(sl(s)), side, 9, 11 + hash(j * 7.3) * 5, 4.6, NEON[j % NEON.length]);
        }
        const vegasStandLiveries = ["scaffold", "alu", "crimson"];
        for (let j = 0; j < 10; j++) {
          const s = sl(0.485 + (j + 0.35) / 10 * 0.33), side = (j % 2) ? 1 : -1;
          if (j % 3 === 1) {
            lotBleacher(`vegas-lot-bleacher-${j}`, s, side, 42, 8,
              { rows: j > 5 ? 8 : 6 });
            continue;
          }
          grandstandEx(s, side, 42, 56, null, null, {
            livery: vegasStandLiveries[j % vegasStandLiveries.length],
            tiers: (j % 3 === 0) ? 2 : 1,
            roof: (j % 2) ? "truss" : "cantilever",
            endWalls: (j % 4) === 0,
            pylons: true,
          });
        }
      }

      for (const [s, side] of [[0.02, 1], [0.08, -1], [0.95, -1]]) {
        palm(K(sl(s)), side, 22, 10 + hash(s * 100) * 3, LIME);
        palm(K(sl(s + 0.006)), side, 26, 9 + hash(s * 131) * 3, LIME);
      }
      billboard(K(sl(0.34)), -1, 24, 16, 10, VIOLET);
      billboard(K(sl(0.58)), 1, 17, 16, 10, GOLD);
      billboard(K(sl(0.67)), 1, 16, 14, 9, LIME);
      billboard(K(sl(0.18)), 1, 18, 14, 9, ROSE);
      billboard(K(sl(0.26)), -1, 18, 14, 9, BLUE);

      for (let j = 0; j < 4; j++) {
        const a = j / 4 * 6.2832 + 0.4, h = hash(j * 13 + 5);
        const mx = cx + Math.cos(a) * (ring - 120), mz = cz + Math.sin(a) * (ring - 120);
        if (onTrack(mx, mz, 60)) continue;
        const mw = 140 + h * 100, mh = 10 + h * 14;
        addFrustum(out, [mx, pyMin, mz], mw * 0.5, mw * 0.3, mh, DARKROCK, 5, null);
      }
      overheadSpan({
        id: "vegas-finish-halo", frac: sl(0.98), clearance: 7.2,
        thickness: 0.8, depth: 1.4, color: MAGENTA, required: true,
      });

      {
        const k = K(sl(0.66));
        const aL = anchor(k, -1, 3.5), aR = anchor(k, 1, 3.5);
        const span = Math.hypot(aL.c[0] - aR.c[0], aL.c[2] - aR.c[2]) + 3;
        for (const [sd, a] of [[-1, aL], [1, aR]]) {
          const b = [a.r, a.u, a.t];
          out._mat = MAT.METAL;
          addBox(out, vadd(a.c, a.u, 6), [2.6, 12, 2.6], [0.10, 0.10, 0.14], b);
          out._mat = 0;
          addBox(out, vadd(a.c, a.u, 6), [2.8, 10, 0.8], sd > 0 ? CYAN : MAGENTA, b);
        }
        overheadSpan({
          id: "vegas-strip-gateway", frac: sl(0.66), clearance: 12.5,
          thickness: 1.4, depth: 1.8, span: span * 0.96,
          color: MAGENTA, required: true,
        });
      }
    };
