"use strict";
(window.TrackScenery = window.TrackScenery || {})["kyalami"] =
  function (api) {
      const { K, lapBounds, out, MAT, n, pyMin, hash, every, anchor, vadd, onTrack, seat,
        tree, ridge, building, spectatorHill, sponsorHoarding,
        broadcastCompound, gantry, marshalPost, motorhome,
        fence, guardrail, tyreWall, groundPatch, modelGroup,
        addBox, addCyl, addFrustum, forestEdge,
        acacia, mountain, circuitKit, addPyramid, groundUnder, terrainYAt, floodMast } = api;

      const THORN = [0.24, 0.36, 0.20], THORN_D = [0.19, 0.30, 0.17];
      const GUM = [0.20, 0.34, 0.22];
      const SCRUB = [0.44, 0.40, 0.22], SCRUB_D = [0.36, 0.34, 0.19];
      const EARTH = [0.62, 0.44, 0.28];
      const BRICK = [0.58, 0.36, 0.27], BRICK_D = [0.48, 0.29, 0.22];
      const IRON = [0.72, 0.71, 0.68], OXIDE = [0.56, 0.26, 0.18];
      const DUMP = [0.78, 0.72, 0.52];

      const IN = (side) => -side;

      const SHIFT = api.def._sceneryShift || 0;
      const RACE = (m) => (((m / (n * api.ds) - SHIFT) % 1) + 1) % 1;

      const openArea = (s) => (s >= 0.90 || s <= 0.08) || (s >= 0.52 && s <= 0.64);
      every(30, (k) => {
        const s = k / n;
        if (openArea(s)) return;
        const h = hash(k * 31);
        if (h < 0.42) return;
        const side = h < 0.5 ? -1 : 1, dist = 16 + h * 14;
        const a = anchor(k, side, dist);
        if (onTrack(a.c[0], a.c[2], 8)) return;
        acacia(k, side, dist, 5.13 + h * 3, h < 0.6 ? THORN : THORN_D,
          { spread: 7 + h * 3, layers: h < 0.75 ? 2 : 1 });
      });
      every(24, (k) => {
        const h = hash(k * 97 + 23);
        if (h < 0.48) return;
        const s = k / n;
        if ((s >= 0.70 && s <= 0.78) || (s >= 0.48 && s <= 0.58) || s >= 0.93) return;
        const side = h < 0.72 ? -1 : 1, a = anchor(k, side, 7 + h * 6);
        if (onTrack(a.c[0], a.c[2], 3)) return;
        out._mat = MAT.FOLIAGE;
        addFrustum(out, vadd(a.c, a.u, -0.2), 1.5 + h * 0.8, 0.7, 0.75, h < 0.6 ? SCRUB : SCRUB_D, 5, [a.r, a.u, a.t]);
        out._mat = 0;
      });
      every(20, (k) => {
        const s = k / n;
        if (openArea(s)) return;
        const side = (Math.floor(k / 20) % 2) ? 1 : -1;
        const dist = 52 + (k % 3) * 4;
        const h = 18 + hash(k * 7) * 6;
        const a = anchor(k, side, dist);
        if (onTrack(a.c[0], a.c[2], 12)) return;
        tree(k, side, dist, h, GUM, { crown: "lobed" });
      });
      for (const [id, s, side, d, w, l] of [
        ["kyalami-earth-ingwe", 0.885, 1, 26, 22, 90],
        ["kyalami-earth-mineshaft", 0.670, -1, 30, 18, 70],
        ["kyalami-earth-clubhouse", 0.410, 1, 34, 20, 76],
        ["kyalami-earth-crocodiles", 0.750, -1, 28, 16, 62],
        ["kyalami-earth-climb", 0.530, -1, 44, 20, 80],
      ]) groundPatch(K(s), side, d, [w, 0.16, l], EARTH, { id, samples: 6 });

      {
        const a = anchor(K(RACE(20)), -1, 46), b = [a.r, a.u, a.t];
        const bays = 12, pitch = 7.4, len = bays * pitch, inw = IN(1);
        modelGroup("kyalami-pit-block", {
          center: vadd(a.c, a.u, 7), size: [20, 15, len + 6], basis: b,
        }, (stage) => {
          stage._mat = MAT.BRICK;
          seat.box(stage, a.c, [12, 7.6, len], BRICK, b);
          stage._mat = MAT.CONCRETE;
          for (let i = 0; i < bays; i++) {
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
              [3.4, 0.16, 0.16], [0.66, 0.65, 0.62], b);
          }
          addBox(stage, vadd(vadd(a.c, a.u, 8.3), a.r, inw * 3.2), [12.4, 0.35, len + 4], IRON, b);
          addBox(stage, vadd(eave, a.u, 0.15), [0.5, 0.9, len + 4], OXIDE, b);
          for (let i = 0; i * 1.5 < len + 4; i++) {
            const p = vadd(a.c, a.t, -(len + 4) / 2 + i * 1.5 + 0.75);
            addBox(stage, vadd(vadd(p, a.u, 8.05), a.r, inw * 3.2), [12.4, 0.30, 0.8], [0.62, 0.62, 0.60], b);
          }
          stage._mat = 0;
        }, { required: true });
      }
      {
        const a = anchor(K(RACE(-40)), -1, 46), b = [a.r, a.u, a.t], inw = IN(-1);
        modelGroup("kyalami-race-control", {
          center: vadd(a.c, a.u, 15), size: [20, 34, 18], basis: b,
        }, (stage) => {
          stage._mat = MAT.BRICK;
          seat.box(stage, a.c, [12, 13, 14], BRICK_D, b);
          stage._mat = MAT.CONCRETE;
          for (let f = 1; f <= 3; f++) {
            seat.box(stage, vadd(vadd(a.c, a.u, f * 3.8), a.r, inw * 6.1),
              [0.4, 1.9, 12], [0.16, 0.20, 0.24], b);
            seat.box(stage, vadd(vadd(a.c, a.u, f * 3.8 + 2.0), a.r, inw * 7.2),
              [2.6, 0.35, 12.8], [0.84, 0.82, 0.78], b);
          }
          seat.box(stage, vadd(a.c, a.u, 13), [13.5, 0.5, 15.5], [0.84, 0.82, 0.78], b);
          stage._mat = MAT.METAL;
          for (const [dr, dt] of [[-2.2, -2.2], [2.2, -2.2], [-2.2, 2.2], [2.2, 2.2]])
            seat.cyl(stage, vadd(vadd(vadd(a.c, a.r, dr), a.t, dt), a.u, 13.5), 0.16, 13, [0.60, 0.60, 0.58], 5, b);
          for (let i = 0; i < 5; i++)
            addBox(stage, vadd(a.c, a.u, 15 + i * 2.5), [4.6, 0.13, 4.6], [0.60, 0.60, 0.58], b);
          seat.box(stage, vadd(a.c, a.u, 26.5), [5.2, 1.4, 5.2], OXIDE, b);
          stage._mat = 0;
        }, { required: true });
      }
      gantry(RACE(0), 8.5, [0.15, 0.15, 0.18]);
      gantry(0.032, 8.0, [0.15, 0.15, 0.18]);
      for (const m of [-228, -170, -112, 115]) {
        building(K(RACE(m)), -1, 38, 25, 9, 19,
          { kind: "chevron", wall: [0.84, 0.80, 0.72], window: [0.32, 0.34, 0.38], floor: 4.5 });
      }
      for (const [m, gap, w] of [[-60, 78, 10], [-5, 82, 9], [60, 80, 10]]) {
        const h = hash(K(RACE(m)) * 71);
        motorhome(K(RACE(m)), -1, gap, w, 4, 6, { wall: [0.68 + h * 0.22, 0.68, 0.68] });
      }
      broadcastCompound(K(RACE(235)), -1, 70, { vans: 3, dishes: 2, mastH: 9 });
      sponsorHoarding(RACE(-220), RACE(220), 1, 7, { h: 2.4, step: 12,
        palette: [[0.94, 0.72, 0.14], [0.16, 0.44, 0.26], [0.86, 0.22, 0.16], [0.20, 0.20, 0.22]] });

      const CROWD = [[0.86, 0.84, 0.80], [0.20, 0.24, 0.34], [0.72, 0.24, 0.20],
                     [0.24, 0.44, 0.30], [0.90, 0.72, 0.24], [0.42, 0.36, 0.32]];
      const post = (stage, foot, rad, h, b) => {
        const gy = terrainYAt(foot[0], foot[2]);
        const drop = Number.isFinite(gy) ? Math.min(6, Math.max(0, foot[1] - gy + 0.2)) : 0;
        seat.cyl(stage, [foot[0], foot[1] - drop, foot[2]], rad, h + drop, OXIDE, 5, b);
      };
      const ironTerrace = (id, k, side, dist, bays, opts) => {
        opts = opts || {};
        const rows = opts.rows || 6, pitch = 6.2, len = bays * pitch;
        const a = anchor(k, side, dist), b = [a.r, a.u, a.t], inw = IN(side);
        const backH = 2.0 + rows * 1.15;
        modelGroup(id, {
          center: vadd(a.c, a.u, (backH + 5) / 2), size: [16, backH + 6, len + 3], basis: b,
        }, (stage) => {
          stage._mat = MAT.CONCRETE;
          for (let t = 0; t < rows; t++) {
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
          for (let i = 0; i <= bays; i++) {
            const p = vadd(a.c, a.t, (i - bays / 2) * pitch);
            post(stage, vadd(p, a.r, -inw * 6.0), 0.17, backH + 4.6, b);
            post(stage, vadd(p, a.r, inw * 6.2), 0.15, backH + 1.4, b);
            addBox(stage, vadd(vadd(p, a.r, -inw * 0.3), a.u, backH + 3.0),
              [11.8, 0.16, 0.16], OXIDE, b);
            addBox(stage, vadd(vadd(p, a.r, -inw * 0.3), a.u, backH + 2.0),
              [11.8, 0.14, 0.14], OXIDE, b);
          }
          for (let i = 0; i * 1.4 < len; i++) {
            const p = vadd(a.c, a.t, -len / 2 + i * 1.4 + 0.7);
            addBox(stage, vadd(vadd(p, a.r, -inw * 0.3), a.u, backH + 3.6),
              [12.6, 0.28, 0.75], (i % 2) ? IRON : [0.65, 0.64, 0.61], b);
          }
          stage._mat = 0;
        });
      };
      ironTerrace("kyalami-terrace-main", K(RACE(115)), 1, 36, 15, { rows: 7 });
      ironTerrace("kyalami-terrace-ingwe", K(0.922), 1, 20, 10, { rows: 6 });
      ironTerrace("kyalami-terrace-esses", K(0.435), -1, 22, 8, { rows: 5 });
      {
        const side = 1, dist = 36, kGS = K(RACE(20));
        const a = anchor(kGS, side, dist);
        if (!onTrack(a.c[0], a.c[2], 10)) {
          const b = [a.r, a.u, a.t], inw = IN(side);
          const bays = 12, pitch = 6.6, len = bays * pitch, rows = 6;
          const backH = 2.0 + rows * 1.15;
          const SAND = [0.78, 0.72, 0.58], SAND_D = [0.70, 0.64, 0.52];
          const emitMainGS = (stage) => {
            stage._mat = MAT.CONCRETE;
            seat.box(stage, a.c, [14, 0.5, len + 2], SAND_D, b);
            for (let t = 0; t < rows; t++) {
              const lat = inw * (5.6 - t * 1.4), y = 0.5 + t * 1.15;
              seat.box(stage, vadd(vadd(a.c, a.r, lat), a.u, y),
                [1.4, 1.15, len], t % 2 ? SAND : SAND_D, b);
              seat.box(stage, vadd(vadd(a.c, a.r, lat), a.u, y + 1.15),
                [1.2, 0.4, len - 1.5], [0.66, 0.62, 0.54], b);
              stage._mat = MAT.FABRIC;
              for (let j = 0; j * 1.2 < len - 2; j++) {
                const h2 = hash(kGS * 31 + t * 97 + j * 13);
                if (h2 < 0.48) continue;
                seat.box(stage, vadd(vadd(vadd(a.c, a.r, lat), a.t, -len / 2 + 1 + j * 1.2), a.u, y + 1.55),
                  [0.5, 0.85, 0.42], CROWD[Math.floor(h2 * 97) % CROWD.length], b);
              }
              stage._mat = MAT.CONCRETE;
            }
            for (const dt of [-len / 2 - 0.4, len / 2 + 0.4])
              seat.box(stage, vadd(vadd(vadd(a.c, a.t, dt), a.r, -inw * 0.4), a.u, -0.08),
                [12, backH + 1.28, 0.7], SAND_D, b);
            stage._mat = MAT.METAL;
            for (let i = 0; i <= bays; i++) {
              const p = vadd(a.c, a.t, (i - bays / 2) * pitch);
              seat.cyl(stage, vadd(p, a.r, -inw * 6.2), 0.18, backH + 4.8, OXIDE, 5, b);
              seat.cyl(stage, vadd(p, a.r, inw * 6.2), 0.15, backH + 1.6, OXIDE, 5, b);
              addBox(stage, vadd(vadd(p, a.r, -inw * 0.3), a.u, backH + 3.2),
                [12.2, 0.18, 0.18], OXIDE, b);
            }
            for (let i = 0; i * 1.4 < len; i++) {
              const p = vadd(a.c, a.t, -len / 2 + i * 1.4 + 0.7);
              addBox(stage, vadd(vadd(p, a.r, -inw * 0.3), a.u, backH + 3.8),
                [12.8, 0.28, 0.75], (i % 2) ? IRON : [0.65, 0.64, 0.61], b);
            }
            stage._mat = 0;
          };
          modelGroup("kyalami-main-grandstand", {
            center: vadd(a.c, a.u, (backH + 5) / 2), size: [18, backH + 8, len + 4], basis: b,
          }, emitMainGS, { required: true });
        }
      }

      const TURN = (i) => (((api.def.turns[i - 1] - SHIFT) % 1) + 1) % 1;

      groundPatch(K(TURN(16)), 1, 6, [28, 0.18, 54], EARTH,
        { id: "kyalami-ingwe-gravel", samples: 8 });
      tyreWall(TURN(16) - 0.008, TURN(16) + 0.008, 1, 35, [0.86, 0.20, 0.18]);
      marshalPost(K(TURN(16) - 0.006), -1, 10);

      groundPatch(K(TURN(13)), -1, 5, [12, 0.18, 34], EARTH,
        { id: "kyalami-crocodiles-gravel", samples: 6 });
      tyreWall(TURN(13) - 0.007, TURN(13) + 0.007, -1, 18, [0.20, 0.40, 0.85]);
      marshalPost(K(TURN(13) - 0.004), 1, 9);

      spectatorHill(0.715, 0.765, 1, 30, { rows: 2, rise: 0.95, depth: 1.6, density: 0.28, step: 11 });

      groundPatch(K(TURN(7)), 1, 5, [26, 0.18, 34], EARTH,
        { id: "kyalami-clubhouse-gravel", samples: 6 });
      marshalPost(K(TURN(7) + 0.004), -1, 9);

      groundPatch(K(TURN(2)), 1, 5, [28, 0.18, 36], EARTH,
        { id: "kyalami-crowthorne-gravel", samples: 6 });
      tyreWall(TURN(2) - 0.007, TURN(2) + 0.007, 1, 34, [0.85, 0.78, 0.20]);
      marshalPost(K(TURN(2) - 0.004), -1, 9);

      ironTerrace("kyalami-terrace-crowthorne", K(0.115), 1, 18, 9, { rows: 5 });

      spectatorHill(0.49, 0.57, 1, 32, { rows: 2, rise: 0.95, depth: 1.6, density: 0.30, step: 11 });
      ironTerrace("kyalami-terrace-climb", K(0.522), 1, 30, 10, { rows: 6 });

      for (const [s0, s1] of [[0.77, 0.89], [0.60, 0.72], [0.45, 0.54], [0.14, 0.40]]) {
        guardrail(s0, s1, -1, 8, [0.80, 0.81, 0.83]);
        guardrail(s0, s1,  1, 8, [0.80, 0.81, 0.83]);
      }
      guardrail(RACE(-270), RACE(110), -1, 4.0, [0.85, 0.85, 0.88]);
      fence(RACE(-224), RACE(270), 1, 9, 4, [0.74, 0.76, 0.80]);
      for (const s of [0.85, 0.68, 0.56, 0.38, 0.26, 0.10]) {
        marshalPost(K(s), hash(K(s)) < 0.5 ? -1 : 1, 9);
      }

      const { cx, cz, radius: rad } = lapBounds();
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
        addFrustum(out, [tx, pyMin - 1, tz], baseR, topR, h, DUMP, 4, null);
        addFrustum(out, [tx, pyMin - 1 + h, tz],
          topR, topR, 0.6, [0.72, 0.67, 0.48], 4, null);
        out._mat = 0;
      }
      {
        const k = K(0.45);
        for (let i = 0; i < 9; i++) {
          building(k, 1, 520 + i * 24, 16, 14 + (i % 4) * 5, 16,
            { kind: "podium", wall: [0.62 + i * 0.012, 0.64 + i * 0.012, 0.70], window: [0.54, 0.56, 0.62] });
        }
      }

      {
        const a = anchor(K(0.66), -1, 210);
        const b = [a.r, a.u, a.t];
        modelGroup("kyalami-headgear", {
          center: vadd(a.c, a.u, 20), size: [26, 48, 68], basis: b,
        }, (stage) => {
          stage._mat = MAT.METAL;
          stage._mat = MAT.CONCRETE;
          seat.box(stage, a.c, [16, 10, 16], [0.56, 0.46, 0.38], b);
          stage._mat = MAT.METAL;
          const legs = [[-6, -6], [6, -6], [-6, 6], [6, 6]];
          for (const [dx, dz] of legs)
            seat.cyl(stage, vadd(vadd(a.c, a.r, dx), a.t, dz), 0.5, 30, [0.42, 0.38, 0.34], 6, b);
          for (let i = 1; i <= 5; i++) {
            const y = i * 5;
            addBox(stage, vadd(a.c, a.u, y), [12.6, 0.28, 0.28], [0.44, 0.40, 0.36], b);
            addBox(stage, vadd(a.c, a.u, y), [0.28, 0.28, 12.6], [0.44, 0.40, 0.36], b);
            addBox(stage, vadd(a.c, a.u, y - 2.5), [13.6, 0.24, 0.24], [0.40, 0.36, 0.33], b);
          }
          seat.box(stage, vadd(a.c, a.u, 30), [14, 4.5, 14], [0.48, 0.44, 0.40], b);
          for (const dz of [-3.2, 3.2])
            addCyl(stage, vadd(vadd(a.c, a.u, 36.6), a.t, dz), 4.2, 0.9,
              [0.34, 0.31, 0.28], 12, [a.r, a.t, a.u]);
          stage._mat = MAT.RUST;
          for (let i = 0; i < 5; i++) {
            const p = vadd(a.c, a.t, 10 + i * 4.2);
            seat.cyl(stage, p, 0.24, 6 + i * 1.6, [0.46, 0.34, 0.26], 5, b);
            addBox(stage, vadd(p, a.u, 6.6 + i * 1.6), [2.4, 1.0, 4.6], [0.50, 0.38, 0.28], b);
          }
          stage._mat = 0;
        }, { required: true });
      }
      {
        const a = anchor(K(0.30), 1, 96), b = [a.r, a.u, a.t];
        modelGroup("kyalami-windpump", {
          center: vadd(a.c, a.u, 9), size: [28, 22, 20], basis: b,
        }, (stage) => {
          stage._mat = MAT.CONCRETE;
          seat.box(stage, a.c, [8.0, 0.5, 8.0], [0.62, 0.58, 0.50], b);
          stage._mat = MAT.METAL;
          seat.cyl(stage, a.c, 0.28, 14.0, [0.55, 0.54, 0.52], 6, b);
          for (const [dr, dt] of [[-1.9, -1.9], [1.9, -1.9], [-1.9, 1.9], [1.9, 1.9]])
            seat.cyl(stage, vadd(vadd(a.c, a.r, dr), a.t, dt), 0.12, 12.8, [0.55, 0.54, 0.52], 5, b);
          for (let i = 1; i <= 4; i++) {
            addBox(stage, vadd(a.c, a.u, i * 2.6), [4.2, 0.4, 0.4], [0.55, 0.54, 0.52], b);
            addBox(stage, vadd(a.c, a.u, i * 2.6), [0.4, 0.4, 4.2], [0.55, 0.54, 0.52], b);
          }
          const hub = vadd(a.c, a.u, 13.5);
          addCyl(stage, hub, 0.7, 0.55, [0.60, 0.58, 0.55], 10, [a.r, a.t, a.u]);
          for (let i = 0; i < 8; i++) {
            const ang = i * 0.7854;
            const mid = vadd(vadd(hub, a.r, Math.cos(ang) * 1.5), a.u, Math.sin(ang) * 1.5);
            addBox(stage, mid, [Math.abs(Math.cos(ang)) * 2.2 + 0.55,
              Math.abs(Math.sin(ang)) * 2.2 + 0.55, 0.18], [0.72, 0.71, 0.68], b);
          }
          addBox(stage, vadd(vadd(hub, a.t, 2.4), a.u, 0.1), [0.14, 1.6, 2.8], [0.70, 0.68, 0.64], b);
          stage._mat = MAT.RUST;
          const damFoot = vadd(vadd(a.c, a.r, 7.5), a.u, 0.35);
          seat.box(stage, vadd(vadd(a.c, a.r, 4.0), a.u, 0.3), [4.0, 0.35, 1.0], [0.50, 0.42, 0.32], b);
          seat.cyl(stage, damFoot, 4.6, 2.4, [0.52, 0.44, 0.34], 12, b);
          stage._mat = MAT.CONCRETE;
          seat.cyl(stage, vadd(damFoot, a.u, 2.4), 4.4, 0.2, [0.30, 0.36, 0.34], 12, b);
          stage._mat = 0;
        }, { required: true });
      }
      {
        const a = anchor(K(RACE(165)), -1, 66);
        const b = [a.r, a.u, a.t], inw = IN(-1);
        modelGroup("kyalami-clubhouse", {
          center: vadd(a.c, a.u, 7), size: [34, 16, 48], basis: b,
        }, (stage) => {
          stage._mat = MAT.BRICK;
          seat.box(stage, a.c, [14, 7.5, 38], BRICK, b);
          seat.box(stage, vadd(vadd(vadd(a.c, a.r, -inw * 9), a.t, -14), a.u, 0.35),
            [5, 3.2, 10], BRICK_D, b);
          stage._mat = MAT.ROOF;
          seat.prism(stage, vadd(a.c, a.u, 7.5), [15.2, 2.6, 39], [0.50, 0.28, 0.22], b);
          stage._mat = MAT.CONCRETE;
          seat.box(stage, vadd(vadd(a.c, a.r, inw * 10.5), a.u, 0.25),
            [7.5, 0.6, 38], [0.78, 0.75, 0.70], b);
          for (let i = 0; i < 8; i++) {
            const p = vadd(vadd(vadd(a.c, a.t, (i - 3.5) * 5.2), a.r, inw * 13.4), a.u, 0.85);
            seat.box(stage, p, [0.7, 3.4, 0.7], BRICK_D, b);
          }
          stage._mat = MAT.METAL;
          addBox(stage, vadd(vadd(a.c, a.u, 4.65), a.r, inw * 10.5), [8.0, 0.3, 38], IRON, b);
          stage._mat = 0;
        }, { required: true });
      }
      for (const [s, side, gap] of [[0.970, -1, 26], [0.922, -1, 40], [0.435, -1, 28], [0.115, 1, 26]]) {
        const a = anchor(K(s), side, gap);
        const b = [a.r, a.u, a.t];
        seat.cyl(out, a.c, 0.20, 17, [0.22, 0.22, 0.25], 6, b);
        addBox(out, vadd(a.c, a.u, 17.4), [1.4, 0.6, 2.8], [0.94, 0.92, 0.82], b);
      }
      for (const [s0, s1] of [[0.66, 0.88], [0.1, 0.5]]) {
        for (const side of [-1, 1])
          forestEdge(s0, s1, side, 40, { density: 0.22, hMin: 6, hMax: 10, pineFrac: 0, col: GUM, col2: THORN });
      }


      const VELD_T = [0.30, 0.38, 0.21];
      every(36, (k) => {
        const s = k / n;
        if (openArea(s) || (s >= 0.74 && s <= 0.81)) return;
        const h = hash(k * 53 + 11);
        if (h < 0.38) return;
        const dist = 66 + h * 24;
        acacia(k, 1, dist, 4.5 + h * 3, h < 0.7 ? VELD_T : THORN_D,
          { spread: 6 + h * 3.5, layers: h < 0.6 ? 2 : 1 });
        if (h > 0.62) acacia(k + 3, 1, dist + 7, 3.6 + h * 1.5, THORN, { spread: 4.5, layers: 1 });
      });

      const GUM_B = [0.27, 0.36, 0.33];
      for (const [s, rows, cols] of [[0.700, 3, 5], [0.495, 3, 4], [0.335, 4, 4], [0.210, 3, 5]]) {
        const k0 = K(s);
        for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
          const h = hash(k0 * 13 + r * 7 + c * 3);
          tree(k0 + c * 2, 1, 98 + r * 8 + (c % 2) * 2, 24 + h * 8, h < 0.5 ? GUM : GUM_B,
            { crown: "lobed", deadChance: 0 });
        }
      }

      const BANK = { rows: 3, rise: 0.95, depth: 1.6, density: 0.26, step: 12 };
      spectatorHill(0.899, 0.912, -1, 24, BANK);
      spectatorHill(0.822, 0.848, 1, 20, { ...BANK, rows: 2 });
      spectatorHill(0.600, 0.620, -1, 22, BANK);
      spectatorHill(0.575, 0.595, -1, 22, { ...BANK, density: 0.22 });

      if (circuitKit) {
        circuitKit.hospitality({ id: "kit:kyalami:hospitality-a", frac: RACE(20), side: -1, gap: 58,
          size: [16, 9, 44], modules: 5 });
        circuitKit.hospitality({ id: "kit:kyalami:hospitality-b", frac: RACE(-40), side: -1, gap: 58,
          size: [16, 9, 40], modules: 4 });
      }
      if (typeof floodMast === "function") {
        for (const [s, side, gap] of [
          [RACE(-120), -1, 36], [RACE(140), -1, 40], [RACE(-35), 1, 30], [RACE(75), 1, 34],
          [0.610, -1, 32], [0.590, -1, 36], [0.750, 1, 34],
        ]) floodMast(K(s), side, gap, { h: 38, cool: true, pool: false, arms: 2 });
      }
      building(K(0.955), 1, 150, 64, 15, 120,
        { kind: "hall", wall: [0.82, 0.80, 0.76], window: [0.30, 0.36, 0.42], floor: 5 });

      const WALLS = [[0.88, 0.84, 0.74], [0.82, 0.76, 0.64], [0.90, 0.88, 0.82], [0.74, 0.68, 0.58]];
      const ROOFS = [[0.56, 0.30, 0.22], [0.30, 0.30, 0.32], [0.62, 0.36, 0.26]];
      const estateHouse = (k, gap, w, d, wall, roof) => {
        const a = anchor(k, 1, gap + w / 2), b = [a.r, a.u, a.t];
        for (const [sx, sz] of [[-0.6, -0.6], [0.6, -0.6], [-0.6, 0.6], [0.6, 0.6], [0, 0]]) {
          const x = a.c[0] + a.r[0] * sx * w + a.t[0] * sz * d, z = a.c[2] + a.r[2] * sx * w + a.t[2] * sz * d;
          if (terrainYAt(x, z) != null) return;
        }
        if (onTrack(a.c[0], a.c[2], w + 6)) return;
        const g = groundUnder(a.c[0], a.c[2]);
        if (!Number.isFinite(g)) return;
        const foot = [a.c[0], g - 0.12, a.c[2]];
        out._mat = MAT.CONCRETE;
        seat.box(out, foot, [w, 3.32, d], wall, b);
        out._mat = MAT.ROOF;
        addPyramid(out, vadd(foot, a.u, 3.32), [w * 1.12, 2.0, d * 1.12], roof, b);
        out._mat = 0;
      };
      for (const [s0, s1] of [[0.65, 0.71], [0.14, 0.31]]) {
        every(30, (k) => {
          const s = k / n;
          if (s < s0 || s > s1) return;
          for (const [row, gap] of [[0, 152], [1, 180]]) {
            const h = hash(k * 17 + row * 41 + 5);
            if (h < 0.3) continue;
            estateHouse(k, gap + h * 6, 11 + h * 5, 9 + h * 3,
              WALLS[Math.floor(h * 97) % WALLS.length], ROOFS[Math.floor(h * 53) % ROOFS.length]);
          }
        });
      }
      for (let i = 0; i < 5; i++) {
        building(K(0.265 - i * 0.012), 1, 250 + (i % 2) * 26, 30, 12 + (i % 3) * 4, 26,
          { kind: i % 2 ? "clad" : "slab", wall: [0.74, 0.74, 0.72], window: [0.34, 0.42, 0.48], floor: 4 });
      }

      for (const [ang, w, h, seed] of [
        [2.35, 220, 34, 3], [3.05, 180, 26, 7], [3.85, 250, 40, 11], [4.70, 200, 30, 17], [5.45, 230, 36, 23],
      ]) {
        const rr = rad + 380 + hash(seed) * 60;
        mountain(cx + Math.cos(ang) * rr, cz + Math.sin(ang) * rr, pyMin, w, h,
          { rough: 0.55, seed, seg: 9, snowline: 2, rock: [0.50, 0.44, 0.36], forest: [0.34, 0.36, 0.21] });
      }

      for (const [id, s, d, l] of [
        ["kyalami-firebreak-south", 0.68, 84, 150], ["kyalami-firebreak-west", 0.24, 82, 170],
        ["kyalami-firebreak-north", 0.13, 70, 90],
      ]) groundPatch(K(s), -1, d, [9, 0.12, l], [0.15, 0.13, 0.11], { id, samples: 8 });
    };
