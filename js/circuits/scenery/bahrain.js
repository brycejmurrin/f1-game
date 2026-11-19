"use strict";
(window.TrackScenery = window.TrackScenery || {})["bahrain"] =
  function (api) {
      const { def, K, lapBounds, out, MAT, n, ds, pyMin, hash, vadd,
        place, anchor, addBox, addCyl, addFrustum, addPyramid, addMountain,
        bush, palm, acacia, terrace, grandstand, grandstandEx, building, cityFront, tower, billboard, overheadSpan, marshalPost,
        mountain, backdrop, fence, wall, guardrail, tyreWall,
        floodMast: apiFloodMast, floodMastRing, ledFacadeBands, cameraTower, broadcastCompound,
        modelGroup, groundPatch, onTrack, every, terrainYAt,
        circuitKit } = api;

      const wrapFrac = (f) => ((f % 1) + 1) % 1, wrap01 = wrapFrac;
      const shift = def._sceneryShift || 0;
      const SF = wrapFrac(-shift);
      const T1F = wrapFrac(def.turns[0] - shift);
      const FC = wrapFrac(def.turns[13] - shift);
      const T4F = wrapFrac(def.turns[3] - shift);

      if (circuitKit) {
        circuitKit.hospitality({
          id: "kit:bahrain:hospitality", frac: SF + 0.012, side: 1, gap: 100,
          size: [18, 9, 34], modules: 4, required: true,
        });
        circuitKit.serviceCompound({
          id: "kit:bahrain:service-compound", frac: 0.55, side: -1, gap: 70,
          size: [24, 6, 32], vehicles: 6, required: true,
        });
        circuitKit.serviceCompound({
          id: "kit:bahrain:back-straight-service", frac: 0.705, side: -1, gap: 76,
          size: [28, 6, 38], vehicles: 8, required: true,
        });
        circuitKit.recoveryBay({
          id: "kit:bahrain:back-straight-recovery", frac: 0.735, side: -1, gap: 58,
          size: [14, 5, 18], required: true,
        });
      }

      const SAND        = [0.62, 0.50, 0.34];
      const DUNE        = [0.74, 0.62, 0.44];
      const DUNE_LIT    = [0.70, 0.58, 0.40];
      const SAND_DARK   = [0.55, 0.44, 0.28];
      const SAND_LIGHT  = [0.75, 0.62, 0.42];
      const SEAT        = [0.18, 0.18, 0.21];
      const SEAT_BLUE   = [0.14, 0.22, 0.42];
      const STEEL       = [0.16, 0.16, 0.19];
      const PIT_CREAM   = [0.91, 0.89, 0.84];
      const STAND_CREAM = [0.84, 0.82, 0.76];
      const TRIBUNA_CREAM = [0.94, 0.91, 0.84];
      const TRIBUNA_BACK  = [0.88, 0.85, 0.78];
      const FLOOD       = [1.18, 1.06, 0.78];
      const POOL        = [0.90, 0.74, 0.42];
      const WIN_WARM    = [0.92, 0.80, 0.44];
      const WIN_COOL    = [0.52, 0.70, 0.94];
      const TOWER_CYL   = [0.84, 0.83, 0.79];
      const TOWER_PALE  = [0.85, 0.85, 0.80];
      const TOWER_LED   = [1.45, 1.28, 0.62];
      const BEACON_WARM = [0.98, 0.75, 0.35];
      const BEACON_COOL = [0.70, 0.88, 0.98];
      const TYRE_CAP    = [0.85, 0.13, 0.13];
      const BILLBOARD_LITE = [0.95, 0.93, 0.86];
      const HOSP_SAND   = [0.82, 0.78, 0.68];
      const HOSP_WARM   = [0.78, 0.74, 0.65];
      const SCRUB_DRY   = [0.46, 0.40, 0.24];
      const SCRUB_MID   = [0.52, 0.44, 0.28];

      const { cx, cz, radius: rad } = lapBounds();

      for (const [extra, jit, wMin, hMin, count, forestCol, rockCol] of [
        [140, 55,  220, 24, 72, SAND_DARK,  SAND      ],
        [340, 100, 300, 38, 60, SAND,       SAND_LIGHT],
      ]) {
        for (let i = 0; i < count; i++) {
          const a = i / count * 6.2832, h = hash(i * 7 + extra);
          const ring = rad + extra + (h - 0.5) * jit;
          const x = cx + Math.cos(a) * ring, z = cz + Math.sin(a) * ring;
          mountain(x, z, pyMin, wMin + h * 120, hMin + h * 22, {
            seg: 8, seed: i * 3 + extra,
            rough: 0.24, snowline: 9,
            forest: forestCol, rock: rockCol, snow: DUNE_LIT,
          });
        }
      }

      for (const [s, dist, w, h] of [
        [0.545, 430, 210, 34],
        [0.570, 500, 260, 46],
        [0.595, 450, 190, 31],
      ]) {
        const k = K(s), a = anchor(k, -1, dist);
        mountain(a.c[0], a.c[2], pyMin, w, h, {
          seg: 8, seed: Math.round(s * 10000),
          rough: 0.18, snowline: 99,
          forest: SAND_DARK, rock: SAND, snow: DUNE_LIT,
        });
      }

      const SKY_SIL  = [0.26, 0.29, 0.38];
      const SKY_SIL2 = [0.21, 0.24, 0.34];
      (function manamaSkyline() {
        const clusters = [[0.900, 6, -1, 0.014]];
        for (const [arc0, count, side, step] of clusters) {
          for (let i = 0; i < count; i++) {
            const sFrac = (arc0 + i * step) % 1;
            const hf = hash(i * 7 + arc0 * 30), wf = hash(i * 3 + arc0 * 17);
            const dist = 560 + hash(i * 5 + arc0 * 70) * 200;
            const landmark = hash(i * 4.4 + arc0) > 0.86;
            const w = 8 + wf * 9, h = (landmark ? 90 : 40) + hf * 90, d = w * 1.3;
            backdrop(K(sFrac), side, dist, [w, h, d], hash(i * 11 + arc0) > 0.5 ? SKY_SIL : SKY_SIL2);
            if (landmark || hash(i * 13 + 1.7) > 0.5) {
              const a = anchor(K(sFrac), side, dist), bv = [a.r, a.u, a.t];
              addBox(out, vadd(a.c, a.u, h + 0.5), [1.8, 4.0, 1.8], BEACON_WARM, bv);
            }
          }
        }
      })();

      const HEAD_FRAME = [0.58, 0.60, 0.63];
      const lampHead = (k, side, gap, mastH) => {
        const a = anchor(k, side, gap), b = [a.r, a.u, a.t];
        const toward = -side;
        const top = vadd(a.c, a.u, mastH);
        out._mat = MAT.METAL;
        addCyl(out, vadd(top, a.u, 0.45), 0.28, 1.0, HEAD_FRAME, 6, b);
        addBox(out, vadd(vadd(top, a.u, 1.65), a.r, toward * 0.2), [1.4, 0.4, 6.0], HEAD_FRAME, b);
        addBox(out, vadd(top, a.u, 3.1), [0.4, 2.5, 5.6], HEAD_FRAME, b);
        out._mat = 0;
        for (const y of [2.375, 3.525]) {
          for (const dz of [-1.85, 0, 1.85]) {
            addBox(out, vadd(vadd(vadd(top, a.u, y), a.r, toward * 0.375), a.t, dz),
              [0.35, 1.05, 1.6], FLOOD, b);
          }
        }
      };

      const floodMast = (k, side, gap, h, opts) => {
        if (h && typeof h === "object") { opts = h; h = opts.h; }
        const mastH = (h != null ? h : 38 + hash(k * 13) * 6);
        const wantPool = !!(opts && opts.pool);
        if (typeof apiFloodMast === "function") {
          const before = out.pos.length;
          apiFloodMast(k, side, gap, { h: mastH, cool: true, pool: wantPool, arms: 2 });
          if (out.pos.length === before) return false;
          lampHead(k, side, gap, mastH);
          return true;
        }
        const a = anchor(k, side, gap), b = [a.r, a.u, a.t];
        if (onTrack(a.c[0], a.c[2], 5)) return false;
        addCyl(out, a.c, 0.70, mastH, STEEL, 6, b);
        const top = vadd(a.c, a.u, mastH);
        for (const armOff of [-2.4, 2.4]) {
          const arm = vadd(vadd(top, a.t, armOff), a.r, -side * 2.0);
          addBox(out, arm, [4.2, 0.45, 0.70], STEEL, b);
          addBox(out, vadd(arm, a.r, -side * 1.5), [2.0, 0.70, 1.4], FLOOD, b);
        }
        addBox(out, top, [1.6, 1.1, 5.2], [0.22, 0.22, 0.26], b);
        if (wantPool) addBox(out, vadd(a.c, a.u, 0.14), [10.0, 0.22, 10.0], POOL, b);
        return true;
      };

      const duneBaseY = (x, z) => {
        const gy = terrainYAt(x, z);
        return gy != null && Number.isFinite(gy) ? gy : pyMin;
      };
      const duneWedge = (k, side, gap, w, h) => {
        const a = anchor(k, side, gap + w * 0.3);
        const ww = w * 0.55;
        if (onTrack(a.c[0], a.c[2], ww * 0.45 + 8)) return;
        const gy = duneBaseY(a.c[0], a.c[2]);
        const seg = 5 + Math.floor(hash(k * 19 + side * 29) * 4);
        const rough = 0.20 + hash(k * 23 + side * 31) * 0.20;
        addFrustum(out, [a.c[0], gy - 0.12, a.c[2]], ww * 0.62, ww * 0.42, Math.max(0.45, h * 0.18),
          DUNE, 9, null);
        addMountain(out, [a.c[0], gy, a.c[2]], ww * 0.5, h, {
          seg, seed: k * 3 + side * 17,
          rough, snowline: 99,
          forest: DUNE, rock: SAND_DARK, snow: DUNE_LIT,
        });
      };

      const lightBank = (k, side, gap) => {
        floodMast(k, side, gap, 36 + hash(k * 3) * 6, { pool: true });
      };

      const hospitality = (k, side, gap, w, h, d) => {
        building(k, side, gap, w, h, d,
          { wall: HOSP_SAND, window: WIN_WARM, lit: true, floor: 3 });
        const a = anchor(k, side, gap + w / 2), b = [a.r, a.u, a.t];
        addBox(out, vadd(a.c, a.u, h + 0.55), [w * 1.05, 0.65, d * 1.02], FLOOD, b);
      };

      const accessBox = (k, side, gap, w, h, d) => {
        building(k, side, gap, w, h, d,
          { wall: [0.88, 0.87, 0.82], window: WIN_COOL, lit: true, floor: 2 });
      };

      const sakhirTribuna = (id, s, side, gap, len, required) => {
        const depth = 15, h = 15;
        const a = anchor(K(s), side, gap + depth / 2), b = [a.r, a.u, a.t];
        if (onTrack(a.c[0], a.c[2], depth * 0.5 + 8)) return false;
        const toward = -side;
        return modelGroup(id, {
          center: vadd(a.c, a.u, (h + 2) / 2),
          size: [depth + 6, h + 4, len + 4],
          basis: b,
        }, (stage) => {
          stage._mat = 0;
          addBox(stage, vadd(a.c, a.u, h * 0.32), [depth, h * 0.64, len], TRIBUNA_CREAM, b);
          addBox(stage, vadd(vadd(a.c, a.r, -toward * (depth * 0.42)), a.u, h * 0.38),
            [1.1, h * 0.72, len * 0.98], TRIBUNA_BACK, b);
          for (let t = 0; t < 3; t++) {
            const lat = toward * (depth * 0.12 - t * 1.7);
            const y = 2.0 + t * 2.6;
            stage._mat = MAT.FABRIC;
            addBox(stage, vadd(vadd(a.c, a.r, lat), a.u, y),
              [2.2, 2.0, len * (0.93 - t * 0.02)], t === 1 ? SEAT : SEAT_BLUE, b);
          }
          stage._mat = MAT.METAL;
          addBox(stage, vadd(vadd(a.c, a.r, toward * 1.5), a.u, h + 0.35),
            [depth + 3.5, 0.7, len + 2], PIT_CREAM, b);
          addBox(stage, vadd(vadd(a.c, a.r, toward * (depth * 0.48)), a.u, h + 0.1),
            [0.3, 0.45, len * 0.9], FLOOD, b);
          stage._mat = 0;
          for (const dz of [-len * 0.48, len * 0.48]) {
            addBox(stage, vadd(vadd(a.c, a.t, dz), a.u, h * 0.42),
              [depth * 0.92, h * 0.78, 1.1], TRIBUNA_CREAM, b);
          }
          stage._mat = MAT.METAL;
          for (const dz of [-len * 0.32, 0, len * 0.32]) {
            addCyl(stage, vadd(vadd(a.c, a.r, toward * (depth * 0.38)), a.t, dz),
              0.22, h + 0.15, STEEL, 5, b);
          }
          stage._mat = 0;
        }, { required: !!required });
      };

      building(K(SF), 1,  2, 16, 14, 80,
        { kind: "slab", wall: PIT_CREAM, window: WIN_WARM, lit: true, floor: 4, setback: true });
      wall(SF - 0.03, SF + 0.04, 1, 3, 1.1, [0.85, 0.85, 0.85]);
      overheadSpan({
        id: "bahrain-start-gantry", frac: SF + 0.005, clearance: 8.5, startLights: true,
        thickness: 0.9, depth: 1.6, supportGap: 2, color: STEEL, required: true,
      });
      {
        const depth = 15, h = 15, len = 58, side = -1, gap = 18;
        const a = anchor(K(SF), side, gap + depth / 2), b = [a.r, a.u, a.t];
        if (!onTrack(a.c[0], a.c[2], depth * 0.5 + 8)) {
          const toward = -side;
          modelGroup("bahrain-main-tribuna", {
            center: vadd(a.c, a.u, (h + 2) / 2),
            size: [depth + 6, h + 4, len + 4],
            basis: b,
          }, (stage) => {
            stage._mat = 0;
            addBox(stage, vadd(a.c, a.u, h * 0.32), [depth, h * 0.64, len], TRIBUNA_CREAM, b);
            addBox(stage, vadd(vadd(a.c, a.r, -toward * (depth * 0.42)), a.u, h * 0.38),
              [1.1, h * 0.72, len * 0.98], TRIBUNA_BACK, b);
            for (let t = 0; t < 3; t++) {
              const lat = toward * (depth * 0.12 - t * 1.7);
              const y = 2.0 + t * 2.6;
              stage._mat = MAT.FABRIC;
              addBox(stage, vadd(vadd(a.c, a.r, lat), a.u, y),
                [2.2, 2.0, len * (0.93 - t * 0.02)], t === 1 ? SEAT : SEAT_BLUE, b);
            }
            stage._mat = MAT.METAL;
            addBox(stage, vadd(vadd(a.c, a.r, toward * 1.5), a.u, h + 0.35),
              [depth + 3.5, 0.7, len + 2], PIT_CREAM, b);
            addBox(stage, vadd(vadd(a.c, a.r, toward * (depth * 0.48)), a.u, h + 0.1),
              [0.3, 0.45, len * 0.9], FLOOD, b);
            stage._mat = 0;
            for (const dz of [-len * 0.48, len * 0.48]) {
              addBox(stage, vadd(vadd(a.c, a.t, dz), a.u, h * 0.42),
                [depth * 0.92, h * 0.78, 1.1], TRIBUNA_CREAM, b);
            }
            stage._mat = MAT.METAL;
            for (const dz of [-len * 0.32, 0, len * 0.32]) {
              addCyl(stage, vadd(vadd(a.c, a.r, toward * (depth * 0.38)), a.t, dz),
                0.22, h + 0.15, STEEL, 5, b);
            }
            stage._mat = 0;
          }, { required: true });
        }
      }
      sakhirTribuna("bahrain-main-tribuna-b", SF + 0.014, -1, 19, 52, false);
      grandstandEx(SF - 0.03, -1, 44, 48, STAND_CREAM, SEAT_BLUE,
        { roof: "cantilever", endWalls: true, pylons: true });
      building(K(SF + 0.016), 1, 2, 10, 9, 40,
        { kind: "hall", wall: [0.86, 0.85, 0.80], window: WIN_COOL, lit: true, floor: 3 });

      (function pitMotorhomes() {
        for (let i = 0; i < 7; i++) {
          const sf = (SF + 0.020 + i * 0.0055) % 1;
          const a = anchor(K(sf), 1, 26 + (i % 2) * 4), b = [a.r, a.u, a.t];
          if (onTrack(a.c[0], a.c[2], 12)) continue;
          const gy = terrainYAt(a.c[0], a.c[2]);
          const foot = a.c.slice();
          if (gy != null && Number.isFinite(gy)) foot[1] = gy - 0.06;
          const body = [0.78 + (i % 3) * 0.04, 0.74, 0.64];
          addBox(out, vadd(foot, a.u, 0.2), [5.8, 0.4, 9.5], [0.50, 0.48, 0.42], b);
          addBox(out, vadd(foot, a.u, 2.1), [5.0, 3.4, 8.8], body, b);
          addBox(out, vadd(foot, a.u, 4.0), [5.4, 0.45, 9.2], PIT_CREAM, b);
        }
      })();

      (function sakhirControlTower() {
        const a = anchor(K(SF + 0.008), 1, 38), b = [a.r, a.u, a.t];
        if (onTrack(a.c[0], a.c[2], 16)) return;
        const gy = terrainYAt(a.c[0], a.c[2]);
        const foot = a.c.slice();
        if (gy != null && Number.isFinite(gy)) foot[1] = gy - 0.1;
        modelGroup("bahrain-control-tower", {
          center: vadd(foot, a.u, 14), size: [12, 32, 12], basis: b,
        }, (stage) => {
          stage._mat = MAT.CONCRETE;
          addBox(stage, vadd(foot, a.u, 10), [6.5, 20, 6.5], STAND_CREAM, b);
          stage._mat = MAT.GLASS;
          addBox(stage, vadd(vadd(foot, a.r, -3.4), a.u, 18), [0.3, 8, 5.5], WIN_COOL, b);
          stage._mat = MAT.METAL;
          addBox(stage, vadd(foot, a.u, 20.4), [8.5, 0.6, 8.5], PIT_CREAM, b);
          addCyl(stage, vadd(foot, a.u, 20.6), 0.2, 7, STEEL, 5, b);
          addBox(stage, vadd(foot, a.u, 27.8), [1.4, 0.5, 1.4], BEACON_WARM, b);
          stage._mat = 0;
        }, { required: true });
      })();

      (function sakhirTower() {
        const kT = K(SF + 0.020);
        const a = anchor(kT, 1, 62), b = [a.r, a.u, a.t];
        const BASE = a.c;
        const TOWER_H = 42;
        const TOWER_R = 7.2;
        modelGroup("bahrain-sakhir-tower", {
          center: vadd(BASE, b[1], TOWER_H * 0.5),
          size: [TOWER_R * 2.6, TOWER_H + 6, TOWER_R * 2.6],
          basis: b,
        }, (stage) => {
          stage._mat = MAT.STONE;
          addCyl(stage, BASE, TOWER_R * 1.55, 3.2, STAND_CREAM, 12, b);
          addCyl(stage, vadd(BASE, b[1], 3.0), TOWER_R * 1.25, 2.4, PIT_CREAM, 12, b);
          addCyl(stage, vadd(BASE, b[1], 5.0), TOWER_R * 0.92, TOWER_H - 5.0, TOWER_CYL, 12, b);
          stage._mat = 0;
          if (typeof ledFacadeBands === "function") {
            ledFacadeBands(vadd(BASE, b[1], 5.0), TOWER_H - 5.0, {
              r: TOWER_R, bands: 12, seg: 12, basis: b,
              cols: [TOWER_LED, [1.05, 0.85, 1.15], BEACON_COOL, [1.30, 0.98, 0.35],
                     [0.55, 0.92, 1.20], TOWER_LED],
            });
          } else {
            for (let i = 0; i < 10; i++) {
              addFrustum(stage, vadd(BASE, b[1], 6 + (i / 9) * (TOWER_H - 10)),
                TOWER_R + 1.2, TOWER_R + 0.85, 1.05,
                [TOWER_LED, BEACON_COOL, [1.30, 0.98, 0.35]][i % 3], 12, b);
            }
          }
          stage._mat = MAT.METAL;
          addBox(stage, vadd(BASE, b[1], TOWER_H + 0.35),
            [TOWER_R * 1.7, 0.7, TOWER_R * 1.7], STAND_CREAM, b);
          addBox(stage, vadd(BASE, b[1], TOWER_H + 0.95),
            [TOWER_R * 1.35, 0.55, TOWER_R * 1.35], PIT_CREAM, b);
          addCyl(stage, vadd(BASE, b[1], TOWER_H + 1.3), 0.35, 4.2, STEEL, 5, b);
          addBox(stage, vadd(BASE, b[1], TOWER_H + 5.4), [1.8, 0.7, 1.8], BEACON_WARM, b);
          stage._mat = 0;
          const plaza = terrainYAt(BASE[0], BASE[2]);
          const plazaLift = (plaza != null ? plaza - BASE[1] : 0) + 0.15;
          addBox(stage, vadd(BASE, b[1], plazaLift), [18.0, 0.30, 18.0],
            [0.78, 0.74, 0.66], b);
        }, { required: true });
      })();

      cityFront(SF - 0.025, SF + 0.05, 1, 30, {
        minH: 6, maxH: 14, depth: 18, step: 18,
        palette: [HOSP_SAND, HOSP_WARM, [0.80, 0.75, 0.64], [0.86, 0.82, 0.72]],
        lit: true, windowCol: WIN_WARM,
      });


      grandstandEx(T1F - 0.004, -1, 30, 72, STAND_CREAM, SEAT_BLUE,
        { roof: "truss", suites: true, endWalls: true });
      grandstandEx(0.025,  1, 24, 60, null, null, { livery: "steel", roof: "flat", endWalls: true });
      grandstandEx(0.065,  1, 28, 72, null, null, { livery: "sandstone", roof: "cantilever", pylons: true });
      cameraTower(K(0.045), -1, 46, { h: 22 });
      {
        const a = anchor(K(T1F - 0.002), -1, 14), b = [a.r, a.u, a.t];
        if (!onTrack(a.c[0], a.c[2], 6)) {
          modelGroup("bahrain-schumacher-corner", {
            center: vadd(a.c, a.u, 2.4), size: [0.8, 5.2, 4.2], basis: b,
          }, (stage) => {
            stage._mat = MAT.METAL;
            addBox(stage, vadd(a.c, a.u, 2.2), [0.35, 4.4, 0.35], STEEL, b);
            addBox(stage, vadd(a.c, a.u, 4.6), [0.55, 1.6, 3.6], [0.12, 0.12, 0.14], b);
            stage._mat = MAT.GLASS;
            addBox(stage, vadd(vadd(a.c, a.r, 0.35), a.u, 4.6),
              [0.12, 1.2, 3.2], [0.85, 0.12, 0.12], b);
            stage._mat = 0;
          }, { required: true });
        }
      }
      accessBox(K(0.03), -1, 36, 10, 6, 16);
      lightBank(K(0.06), 1, 36);
      billboard(K(0.07), -1, 10, 14, 4, [0.85, 0.12, 0.12]);
      billboard(K(0.08),  1, 10, 12, 3.5, [0.05, 0.45, 0.75]);
      billboard(K(0.10),  1, 11, 12, 4, [0.10, 0.30, 0.70]);
      tyreWall(0.045, 0.085, 1, 4, TYRE_CAP);
      fence(0.03, 0.09, -1, 7, 3.2, [0.70, 0.72, 0.76]);
      marshalPost(K(0.06), 1, 22);

      const UNI = wrap01(SF + 0.185);
      const UNI_LIVERY = ["steel", "alu"];
      {
        const a = anchor(K(UNI), 1, 28), b = [a.r, a.u, a.t];
        if (!onTrack(a.c[0], a.c[2], 22)) {
          modelGroup("bahrain-university-grandstand", {
            center: vadd(a.c, a.u, 10), size: [24, 24, 58], basis: b,
          }, (stage) => {
            const slabs = [
              [0.0,  18, 5.0, 48, STAND_CREAM],
              [5.0,  16, 5.0, 42, [0.78, 0.76, 0.72]],
              [10.0, 14, 5.0, 36, [0.72, 0.70, 0.66]],
            ];
            stage._mat = MAT.CONCRETE;
            for (const [y0, w, h, len, col] of slabs) {
              addBox(stage, vadd(a.c, a.u, y0 + h * 0.5), [w, h, len], col, b);
              stage._mat = MAT.FABRIC;
              addBox(stage, vadd(vadd(a.c, a.r, -(w * 0.5 + 0.6)), a.u, y0 + h * 0.55),
                [1.2, h * 0.72, len * 0.92], SEAT_BLUE, b);
              stage._mat = MAT.CONCRETE;
            }
            stage._mat = MAT.METAL;
            addBox(stage, vadd(vadd(a.c, a.r, -4.0), a.u, 15.55),
              [18.5, 0.7, 42], PIT_CREAM, b);
            addBox(stage, vadd(vadd(a.c, a.r, -9.2), a.u, 15.2),
              [0.35, 0.5, 40], FLOOD, b);
            for (const t of [-16, 0, 16]) {
              addCyl(stage, vadd(vadd(a.c, a.r, -9.5), a.t, t),
                0.22, 15.4, STEEL, 5, b);
            }
            stage._mat = MAT.CONCRETE;
            for (const dz of [-24, 24]) {
              addBox(stage, vadd(vadd(a.c, a.t, dz), a.u, 7.5),
                [16, 14, 1.2], STAND_CREAM, b);
            }
            stage._mat = 0;
          }, { required: true });
        }
      }
      for (const [i, ds, dGap, seLen, seatC] of [
        [0, -0.040, 26, 32, SEAT_BLUE],
        [1, -0.010, 24, 38, SEAT],
        [2,  0.025, 24, 42, SEAT_BLUE],
        [3,  0.060, 28, 38, SEAT],
      ]) {
        if (i % 2 === 0) {
          grandstandEx(wrap01(UNI + ds), 1, dGap, seLen, STAND_CREAM, seatC, { endWalls: true });
        } else {
          grandstandEx(wrap01(UNI + ds), 1, dGap, seLen, null, null,
            { livery: UNI_LIVERY[(i >> 1) % UNI_LIVERY.length], endWalls: true });
        }
      }
      billboard(K(UNI - 0.03), 1, 11, 12, 4, [0.90, 0.55, 0.05]);
      lightBank(K(UNI + 0.005), 1, 28);

      const WEDGE_GAP = [85, 130, 92, 106, 90, 134];
      for (let i = 0; i < 6; i++) {
        const k = (K(0.27) + i * Math.round(n * 0.015)) % n;
        duneWedge(k, -1, WEDGE_GAP[i], 40 + hash(k) * 28, 3.5 + hash(k * 5) * 3);
      }

      for (const [s, gap, w, h] of [
        [0.095, 124, 54, 4.2],
        [0.115, 104, 68, 5.0],
        [0.138, 126, 76, 5.8],
      ]) {
        duneWedge(K(s), 1, gap, w, h);
      }

      grandstandEx(0.24,  1, 24, 60, null, null, { livery: "sandstone", roof: "flat", endWalls: true });
      grandstandEx(0.26, -1, 26, 50, STAND_CREAM, SEAT, { roof: "truss", pylons: true });
      lightBank(K(0.25), -1, 34);
      lightBank(K(0.27),  1, 34);
      cameraTower(K(T4F - 0.006), -1, 46, { h: 20 });
      tyreWall(wrap01(T4F - 0.004), wrap01(T4F + 0.012), -1, 4, TYRE_CAP);
      fence(wrap01(T4F - 0.010), wrap01(T4F + 0.030), -1, 6, 3.2, [0.70, 0.72, 0.76]);
      billboard(K(T4F - 0.012), 1, 11, 12, 4, [0.85, 0.12, 0.12]);
      billboard(K(T4F + 0.020), 1, 11, 12, 4, [0.90, 0.55, 0.05]);
      marshalPost(K(T4F + 0.004), -1, 24);

      for (let i = 0; i < 8; i++) {
        const k = (K(0.32) + Math.round(i * n * 0.010)) % n;
        const side = (i % 3 === 0) ? 1 : -1;
        const d = 22 + (i % 3) * 10 + hash(k * 7 + i) * 12;
        if (hash(k * 13 + i) > 0.35) bush(k, side, d, SCRUB_DRY);
      }
      lightBank(K(0.35), -1, 36);
      grandstandEx(0.37,  1, 26, 48, STAND_CREAM, SEAT_BLUE, { roof: "cantilever", pylons: true });
      grandstandEx(0.39, -1, 26, 38, null, null, { livery: "alu", endWalls: true });
      fence(0.34, 0.41, 1, 6, 3.0, [0.70, 0.72, 0.76]);
      billboard(K(0.36), -1, 12, 12, 4, [0.10, 0.30, 0.70]);

      grandstandEx(0.42,  1, 22, 64, STAND_CREAM, SEAT_BLUE,
        { roof: "truss", suites: true, endWalls: true });
      grandstandEx(0.40,  1, 24, 48, null, null, { livery: "sandstone", roof: "flat" });
      grandstandEx(0.44,  1, 24, 56, null, null, { livery: "alu", roof: "cantilever", endWalls: true });
      tyreWall(0.405, 0.44, 1, 4, TYRE_CAP);
      fence(0.40, 0.46, -1, 7, 3.2, [0.70, 0.72, 0.76]);
      billboard(K(0.43), 1, 11, 12, 4, [0.05, 0.45, 0.75]);
      marshalPost(K(0.43), -1, 26);
      cameraTower(K(0.415), -1, 44, { h: 22 });

      for (let i = 0; i < 2; i++) {
        const k = (K(0.48) + i * Math.round(n * 0.022)) % n;
        for (const side of [-1, 1]) duneWedge(k, side, 96 + i * 26, 52, 3.8);
      }
      for (let i = 0; i < 2; i++) {
        const k = (K(0.50) + Math.round(i * n * 0.020)) % n;
        for (const side of [-1, 1]) {
          duneWedge(k, side, 52 + i * 20, 34 + hash(k * 3 + side) * 22, 3.6 + hash(k * 5) * 2.0);
        }
      }
      {
        const a = anchor(K(0.520), 1, 38), b = [a.r, a.u, a.t];
        if (!onTrack(a.c[0], a.c[2], 18)) {
          modelGroup("bahrain-beyon-grandstand", {
            center: vadd(a.c, a.u, 8), size: [18, 16, 86], basis: b,
          }, (stage) => {
            const slabs = [
              [0.0,  14, 5.2, 78, STAND_CREAM],
              [5.2,  11, 4.6, 70, [0.78, 0.76, 0.72]],
            ];
            stage._mat = MAT.CONCRETE;
            for (const [y0, w, h, len, col] of slabs) {
              addBox(stage, vadd(a.c, a.u, y0 + h * 0.5), [w, h, len], col, b);
              stage._mat = MAT.FABRIC;
              addBox(stage, vadd(vadd(a.c, a.r, -(w * 0.5 + 0.6)), a.u, y0 + h * 0.55),
                [1.2, h * 0.72, len * 0.92], SEAT_BLUE, b);
              stage._mat = MAT.CONCRETE;
            }
            stage._mat = MAT.METAL;
            addBox(stage, vadd(a.c, a.u, 10.15), [12.5, 0.6, 72], PIT_CREAM, b);
            addBox(stage, vadd(vadd(a.c, a.r, -6.2), a.u, 9.7),
              [0.4, 0.7, 70], STEEL, b);
            for (const t of [-28, -10, 10, 28]) {
              addCyl(stage, vadd(vadd(a.c, a.r, -6.6), a.t, t),
                0.20, 9.8, STEEL, 5, b);
            }
            stage._mat = 0;
          }, { required: true });
        }
      }
      lightBank(K(0.505), -1, 34);
      lightBank(K(0.545), 1, 42);
      cameraTower(K(0.525), -1, 40, { h: 20 });
      billboard(K(0.530), 1, 14, 12, 4, [0.05, 0.45, 0.75]);
      marshalPost(K(0.500), -1, 26);
      marshalPost(K(0.535), 1, 28);
      backdrop(K(0.50), -1, 140, [260, 15, 12], SAND);

      for (let i = 0; i < 5; i++) {
        const k = (K(0.58) + i * 3) % n;
        marshalPost(k, -1, 28 + i * 3);
      }
      accessBox(K(0.62), -1, 36, 8, 5, 12);
      accessBox(K(0.65), -1, 32, 7, 4, 10);

      tyreWall(0.585, 0.62, 1, 4, TYRE_CAP);
      fence(0.58, 0.67, 1, 6, 3.2, [0.70, 0.72, 0.76]);
      grandstandEx(0.63,  1, 24, 50, STAND_CREAM, [0.16, 0.24, 0.42], { pylons: true, endWalls: true });
      billboard(K(0.60), -1, 12, 12, 4, [0.90, 0.55, 0.05]);
      billboard(K(0.64),  1, 11, 12, 4, [0.85, 0.12, 0.12]);
      for (let i = 0; i < 3; i++) {
        building((K(0.62) + i * 4) % n, -1, 42 + i * 6, 10, 6 + hash(i) * 3, 14,
          { kind: "podium", wall: [0.88, 0.87, 0.82], window: WIN_COOL, lit: true, floor: 3 });
      }
      building(K(0.55), -1, 42, 14, 8, 20,
        { kind: "hall", wall: [0.68, 0.62, 0.50], window: WIN_WARM, lit: true, floor: 2 });

      fence(0.805, 0.826, 1, 8, 3.2, [0.70, 0.72, 0.76]);
      tyreWall(0.805, 0.826, 1, 8, TYRE_CAP);
      fence(0.838, 0.88, 1, 8, 3.2, [0.70, 0.72, 0.76]);
      tyreWall(0.838, 0.88, 1, 8, TYRE_CAP);
      guardrail(0.73, 0.90, -1, 8, [0.80, 0.80, 0.82]);
      floodMast(K(0.79), -1, 32, 38);
      lightBank(K(0.86), 1, 36);
      grandstandEx(0.86, 1, 32, 30, null, null, { livery: "steel", pylons: true });
      billboard(K(0.75), -1, 12, 14, 4, BILLBOARD_LITE);
      billboard(K(0.82), -1, 11, 12, 4, [0.85, 0.12, 0.12]);
      billboard(K(0.86), -1, 12, 12, 4, [0.10, 0.55, 0.30]);
      marshalPost(K(0.82),  1, 24);
      marshalPost(K(0.86), -1, 26);
      overheadSpan({
        id: "bahrain-back-straight-gantry", frac: 0.81, clearance: 8.2,
        thickness: 0.9, depth: 1.6, supportGap: 2, color: STEEL, required: true,
      });
      building(K(0.72), -1, 48, 14, 10, 22,
        { kind: "hall", wall: [0.72, 0.67, 0.56], window: WIN_WARM, lit: true, floor: 2 });
      building(K(0.90), -1, 46, 12, 8, 18,
        { kind: "hall", wall: [0.70, 0.65, 0.54], window: WIN_COOL, lit: true, floor: 2 });

      grandstandEx(SF + 0.034, 1, 42, 36, null, null,
        { livery: "steel", roof: "flat", endWalls: true });
      floodMast(K(SF + 0.026), 1, 44, 40);
      floodMast(K(SF + 0.044), 1, 44, 40);
      billboard(K(SF - 0.022), 1, 20, 14, 4, BILLBOARD_LITE);
      cameraTower(K(FC + 0.012), -1, 40, { h: 20 });

      wall(SF - 0.038, SF + 0.018, -1, 4, 1.0, [0.85, 0.85, 0.85]);
      building(K(SF + 0.048), 1, 68, 22, 24, 28,
        { kind: "fin", wall: [0.78, 0.76, 0.70], window: WIN_COOL, lit: true, floor: 6 });
      tower(K(SF + 0.040), 1, 88, 5, 40,
        { col: TOWER_PALE, seg: 6, cap: true, capCol: FLOOD, mast: 6 });
      tyreWall(SF + 0.004, SF + 0.052, -1, 5, TYRE_CAP);
      guardrail(SF - 0.006, SF + 0.042, 1, 9, [0.80, 0.80, 0.82]);
      billboard(K(SF + 0.004), 1, 11, 13, 4, BILLBOARD_LITE);
      billboard(K(SF - 0.010), -1, 11, 12, 4, [0.10, 0.55, 0.30]);

      if (typeof every === "function") {
        const RING_GAP = 44, PIT0 = FC + 0.006;
        let alt = 0, hairpinDone = false;
        every(55, (k) => {
          const f = k / n;
          if (f >= PIT0 && f <= T1F) {
            for (const side of [-1, 1]) {
              const hairpin = side === 1 && f >= T1F - 0.0055;
              if (hairpin) {
                if (!hairpinDone) hairpinDone = floodMast(K(T1F - 0.0115), side, 20, 39) !== false;
                continue;
              }
              floodMast(k, side, 30, 39);
            }
            return;
          }
          const first = (alt++ % 2) ? 1 : -1;
          for (const side of [first, -first]) {
            const a = anchor(k, side, RING_GAP);
            if (onTrack(a.c[0], a.c[2], 8)) continue;
            if (floodMast(k, side, RING_GAP, 39)) break;
          }
        });
      } else if (typeof floodMastRing === "function") {
        floodMastRing(110, { dist: 44, h: 39, cool: true, pool: false });
      }

      fence(0.10, 0.16,  1, 7, 3.0, [0.70, 0.72, 0.76]);
      fence(0.66, 0.72, -1, 7, 3.0, [0.70, 0.72, 0.76]);

      for (let k = 0; k < n; k += Math.max(1, Math.round(n / 55))) {
        for (const side of [-1, 1]) {
          const r = hash(k * 41 + side * 7);
          if (r > 0.42) continue;
          const d = 18 + hash(k * 43 + side) * 22;
          if (r < 0.22) {
            bush(k, side, d, hash(k * 71 + side) > 0.5 ? SCRUB_DRY : SCRUB_MID);
          } else {
            place(k, side, d,
              [1.4 + hash(k * 47) * 2.0, 0.8 + hash(k * 53) * 1.4, 1.5 + hash(k * 59) * 1.8],
              SAND_DARK);
          }
        }
      }

      {
        const SAND_RUNOFF = [0.69, 0.59, 0.40];
        const SAND_ROCK   = [0.58, 0.48, 0.32];
        for (const [s0, s1, side, gapBase, maxCnt] of [
          [0.10, 0.20, -1, 20, 6],
          [0.22, 0.30, -1, 18, 5],
          [0.60, 0.70, -1, 20, 6],
        ]) {
          let cnt = 0;
          for (let sf = s0; sf < s1; sf += 0.020) {
            const kk = K(sf);
            const a = anchor(kk, side, gapBase + hash(kk * 5) * 12), b = [a.r, a.u, a.t];
            if (onTrack(a.c[0], a.c[2], 6)) continue;
            addBox(out, vadd(a.c, a.u, 0.12), [5.5, 0.25, 9.5], SAND_RUNOFF, b);
            if (hash(kk * 11) > 0.55) {
              addBox(out, vadd(a.c, a.u, 0.28), [2.2, 0.35, 2.0], SAND_ROCK, b);
            }
            cnt++;
            if (cnt > maxCnt) break;
          }
        }
      }


      const duneRidge = (x, z, w, h, opts) => {
        if (onTrack(x, z, w * 0.45 + 8)) return;
        const gy = duneBaseY(x, z);
        addFrustum(out, [x, gy - 0.12, z], w * 0.62, w * 0.42, Math.max(0.5, h * 0.18),
          opts.forest || DUNE, 9, null);
        addMountain(out, [x, gy, z], w * 0.5, h, opts);
      };
      for (const [s, side, dist, wBase, hBase] of [
        [0.20, -1, 120, 86, 10],
        [0.48,  1, 270, 96, 12],
        [0.70, -1, 192, 90, 11],
      ]) {
        const k = K(s);
        const a = anchor(k, side, dist + wBase * 0.3);
        duneRidge(a.c[0], a.c[2], wBase * 0.55 + hash(k * 7) * 30,
          hBase + hash(k * 11) * 5,
          { seg: 7, seed: k * 5 + dist, rough: 0.28, snowline: 99,
            forest: SAND_DARK, rock: SAND, snow: DUNE_LIT });
      }
      for (const [s, side, dist] of [
        [0.35,  1, 196],
        [0.60, -1, 148],
        [0.90,  1, 96],
      ]) {
        const k = K(s);
        const a = anchor(k, side, dist + 24);
        duneRidge(a.c[0], a.c[2], 44 + hash(k * 9) * 28,
          8 + hash(k * 13) * 4,
          { seg: 6, seed: k * 7 + dist, rough: 0.25, snowline: 99,
            forest: SAND, rock: SAND_LIGHT, snow: DUNE_LIT });
      }

      const windTower = (k, side, gap, h) => {
        const a = anchor(k, side, gap), b = [a.r, a.u, a.t];
        if (onTrack(a.c[0], a.c[2], 8)) return;
        const gy = terrainYAt(a.c[0], a.c[2]);
        const foot = a.c.slice();
        if (gy != null && Number.isFinite(gy)) foot[1] = gy - 0.12;
        out._mat = MAT.STONE;
        addFrustum(out, foot, 2.6, 1.9, h, HOSP_SAND, 4, b);
        const top = vadd(foot, a.u, h);
        for (const dx of [-1.35, 1.35]) for (const dz of [-1.35, 1.35]) {
          addBox(out, vadd(vadd(vadd(top, a.r, dx), a.t, dz), a.u, 1.5), [0.55, 3.0, 0.55], PIT_CREAM, b);
        }
        addBox(out, vadd(top, a.u, 3.1), [3.6, 0.5, 3.6], STAND_CREAM, b);
        out._mat = 0;
        addBox(out, vadd(top, a.u, 0.65), [1.5, 1.3, 1.5], WIN_WARM, b);
      };

      const marquee = (k, side, gap, w, len) => {
        const a = anchor(k, side, gap), b = [a.r, a.u, a.t];
        out._mat = MAT.FABRIC;
        addBox(out, vadd(a.c, a.u, 1.7), [w, 3.4, len], PIT_CREAM, b);
        addBox(out, vadd(a.c, a.u, 2.6), [w * 1.02, 0.55, len * 1.005], WIN_WARM, b);
        const bays = Math.max(2, Math.round(len / (w * 0.9)));
        for (let i = 0; i < bays; i++) {
          const off = (i - (bays - 1) / 2) * (len / bays);
          addPyramid(out, vadd(vadd(a.c, a.u, 3.4), a.t, off),
            [w * 0.98, 3.2, (len / bays) * 0.96], STAND_CREAM, b);
        }
        out._mat = 0;
      };

      const videoWall = (k, side, gap, w, h) => {
        const a = anchor(k, side, gap), b = [a.r, a.u, a.t];
        out._mat = MAT.METAL;
        addBox(out, vadd(a.c, a.u, h / 2 + 5), [0.9, h, w], STEEL, b);
        out._mat = MAT.GLASS;
        addBox(out, vadd(vadd(a.c, a.u, h / 2 + 5), a.r, side * -0.55), [0.4, h * 0.86, w * 0.9], BEACON_COOL, b);
        out._mat = MAT.METAL;
        for (const dz of [-w * 0.4, w * 0.4]) addBox(out, vadd(vadd(a.c, a.u, 2.5), a.t, dz), [0.55, 5, 0.55], STEEL, b);
        out._mat = 0;
      };

      windTower(K(SF + 0.060), -1, 58, 16);
      windTower(K(SF + 0.072),  1, 64, 14);
      windTower(K(0.63),  -1, 56, 15);
      windTower(K(0.80),   1, 58, 14);
      marquee(K(0.80),  1, 40, 12, 44);
      videoWall(K(SF + 0.012),  1, 40, 12, 7);
      videoWall(K(0.055), 1, 46, 11, 6.5);
      videoWall(K(0.81),  1, 40, 12, 7);
      videoWall(K(0.42),  1, 40, 11, 6.5);
      videoWall(K(0.518), -1, 32, 14, 7);

      grandstandEx(0.68,  1, 26, 46, STAND_CREAM, SEAT_BLUE, { endWalls: true });
      grandstandEx(0.335, 1, 28, 42, null, null, { livery: "sandstone", roof: "flat" });

      terrace(SF + 0.012, SF + 0.034, -1, 62,
        { rows: 6, rise: 1.4, depth: 2.6, step: 9, density: 0.5,
          conc: [0.76, 0.70, 0.57], concAlt: [0.68, 0.62, 0.50],
          crowd: [SEAT_BLUE, SEAT, [0.62, 0.58, 0.52], [0.40, 0.30, 0.24]] });

      const FROND     = [0.26, 0.34, 0.16];
      const FROND_DRY = [0.32, 0.36, 0.19];
      const ACACIA     = [0.34, 0.36, 0.20];
      const ACACIA_DRY = [0.40, 0.39, 0.23];
      for (const [sf, side, dist] of [
        [0.305, -1, 44], [0.365,  1, 52], [0.455, -1, 38],
        [0.525,  1, 46], [0.575, -1, 40], [0.655,  1, 42],
        [0.745, -1, 36], [0.805, -1, 50], [0.875, -1, 40],
      ]) {
        const k = K(sf), hv = hash(k * 71 + dist);
        const th = 5 + hv * 2.5;
        acacia(k, side, dist, th, hv < 0.5 ? ACACIA : ACACIA_DRY,
               { spread: th * (1.2 + hv * 0.5), layers: hv > 0.65 ? 2 : 1 });
      }

      broadcastCompound(K(SF - 0.02), 1, 100, { vans: 4, dishes: 3, mastH: 10 });

      for (let c = 0; c < 5; c++) {
        const rowPalms = c < 4 ? 3 : 2;
        for (let r = 0; r < rowPalms; r++) {
          const sf = SF + 0.004 + c * 0.008 + (hash(c * 5.3 + r * 1.9) - 0.5) * 0.003;
          const k = K(sf % 1), hv = hash(k * 61 + r * 7);
          if (hv < 0.25) continue;
          palm(k, 1, 121 + r * 7 + (hv - 0.5) * 3, 8 + hv * 4, hv < 0.6 ? FROND : FROND_DRY);
        }
      }

      (function dragStrip() {
        const PREP   = [0.24, 0.23, 0.24];
        const LANE   = [0.30, 0.29, 0.30];
        const STRIPE = [0.88, 0.87, 0.82];
        const WALL   = [0.80, 0.79, 0.74];
        const GAP    = 178;
        const S0 = SF - 0.065, S1 = SF + 0.055, STEPS = 26;
        const span = (S1 - S0 + 1) % 1;
        const pts = [];
        for (let i = 0; i <= STEPS; i++) {
          const sf = (S0 + span * (i / STEPS)) % 1;
          pts.push(anchor(K(sf), 1, GAP));
        }
        for (let i = 0; i < STEPS; i++) {
          const a = pts[i], nx = pts[i + 1];
          const b = [a.r, a.u, a.t];
          const seglen = Math.hypot(nx.c[0] - a.c[0], nx.c[2] - a.c[2]) + 0.6;
          const c = [(a.c[0] + nx.c[0]) / 2, (a.c[1] + nx.c[1]) / 2, (a.c[2] + nx.c[2]) / 2];
          if (onTrack(c[0], c[2], 34)) continue;
          const near = Math.max(0, 1 - i / (STEPS * 0.55));
          const surf = [
            LANE[0] + (PREP[0] - LANE[0]) * near,
            LANE[1] + (PREP[1] - LANE[1]) * near,
            LANE[2] + (PREP[2] - LANE[2]) * near];
          for (const lane of [-5.2, 5.2]) {
            addBox(out, vadd(vadd(c, a.r, lane), a.u, 0.10),
              [9.4, 0.18, seglen], surf, b);
          }
          addBox(out, vadd(c, a.u, 0.16), [0.5, 0.16, seglen], STRIPE, b);
          for (const sd of [-11.4, 11.4]) {
            addBox(out, vadd(vadd(c, a.r, sd), a.u, 0.55),
              [0.4, 1.1, seglen], WALL, b);
          }
        }
        const st = pts[1], stb = [st.r, st.u, st.t];
        if (!onTrack(st.c[0], st.c[2], 26)) {
          modelGroup("bahrain-drag-tree", {
            center: vadd(st.c, st.u, 3.4), size: [13, 8, 3], basis: stb,
          }, (stage) => {
            addBox(stage, vadd(st.c, st.u, 3.2), [1.0, 6.4, 0.6], [0.20, 0.20, 0.22], stb);
            const LENS = [
              [0.9,  [1.25, 0.62, 0.10]], [1.45, [1.25, 0.62, 0.10]],
              [2.35, [1.35, 0.72, 0.12]], [3.05, [1.35, 0.72, 0.12]],
              [3.75, [1.35, 0.72, 0.12]], [4.60, [0.25, 1.30, 0.35]],
              [5.35, [1.30, 0.18, 0.14]],
            ];
            stage._mat = MAT.METAL;
            for (const lane of [-5.2, 5.2]) {
              addBox(stage, vadd(vadd(vadd(st.c, st.r, lane), st.t, -0.45), st.u, 2.95),
                [0.4, 5.9, 0.4], [0.20, 0.20, 0.22], stb);
              for (const [hgt, col] of LENS) {
                addBox(stage, vadd(vadd(st.c, st.r, lane), st.u, hgt),
                  [0.62, 0.5, 0.5], col, stb);
              }
            }
            stage._mat = 0;
          });
        }
        const tow = vadd(st.c, st.r, 20);
        if (!onTrack(tow[0], tow[2], 22)) {
          addBox(out, vadd(tow, st.u, 4.0), [7, 8, 9], [0.86, 0.85, 0.80], stb);
          addBox(out, vadd(tow, st.u, 6.6), [7.4, 2.0, 9.4], WIN_COOL, stb);
          addBox(out, vadd(tow, st.u, 8.3), [8, 0.5, 10], [0.72, 0.71, 0.68], stb);
        }
        for (let i = 2; i < 12; i += 2) {
          const p = pts[i], pb = [p.r, p.u, p.t];
          const sc = vadd(p.c, p.r, 22);
          if (onTrack(sc[0], sc[2], 20)) continue;
          for (let r = 0; r < 4; r++) {
            addBox(out, vadd(vadd(sc, p.r, r * 1.5), p.u, 0.6 + r * 0.75),
              [1.4, 0.3, 40], [0.74, 0.72, 0.66], pb);
          }
        }
        for (const i of [3, 11, 18, 25]) {
          const p = pts[i], pb = [p.r, p.u, p.t];
          const fc = vadd(p.c, p.r, -18);
          if (onTrack(fc[0], fc[2], 24)) continue;
          const gy = terrainYAt(fc[0], fc[2]);
          if (gy != null && Number.isFinite(gy)) fc[1] = gy - 0.1;
          addCyl(out, fc, 0.55, 28, [0.72, 0.72, 0.74], 6, pb);
          addBox(out, vadd(fc, p.u, 28.5), [4.4, 1.0, 1.6], FLOOD, pb);
        }
      })();

      for (const [sf, side, gap, w, len, h] of [
        [0.135,  1, 82,  26,  46, 2.6],
        [0.225, -1, 96,  34,  62, 3.4],
        [0.345,  1, 74,  22,  38, 2.1],
        [0.475, -1, 88,  30,  54, 3.0],
        [0.605,  1, 92,  28,  50, 2.4],
        [0.705, -1, 78,  24,  42, 2.8],
        [0.845,  1, 86,  32,  58, 3.2],
        [0.585, -1, 66,  28,  50, 2.6],
        [0.665, -1, 70,  30,  56, 3.0],
        [0.775, -1, 68,  26,  44, 2.4],
      ]) {
        const k = K(sf), a = anchor(k, side, gap + w * 0.5), b = [a.r, a.u, a.t];
        if (onTrack(a.c[0], a.c[2], 30)) continue;
        const gy = terrainYAt(a.c[0], a.c[2]);
        const foot = a.c.slice();
        if (gy != null && Number.isFinite(gy)) foot[1] = gy + 0.45;
        const hv = hash(k * 41 + gap);
        addBox(out, vadd(foot, a.u, h * 0.5), [w, h, len],
          [0.60 + hv * 0.05, 0.55 + hv * 0.04, 0.45], b);
        addBox(out, vadd(vadd(foot, a.u, h + 0.35), a.r, w * 0.16),
          [w * 0.62, 0.7, len * 0.74], [0.72 + hv * 0.06, 0.67, 0.55], b);
        addBox(out, vadd(foot, a.u, 0.14), [w * 1.22, 0.44, len * 1.1],
          [0.56, 0.50, 0.40], b);
      }

      (function desertMidfieldDetail() {
        const ROAD = [0.42, 0.40, 0.36];
        const TECH = [0.72, 0.66, 0.52];
        if (typeof groundPatch === "function") {
          for (const [s0, s1, side, gap] of [
            [0.30, 0.38, -1, 48],
            [0.46, 0.54,  1, 55],
            [0.58, 0.66, -1, 52],
          ]) {
            const step = Math.max(1, Math.round(n * 0.014));
            let k = K(s0), guard = 0;
            while (guard++ < 30) {
              const f = k / n;
              const a = anchor(k, side, gap);
              if (!onTrack(a.c[0], a.c[2], 12)) {
                groundPatch(k, side, gap, [6.5, 0.12, Math.max(8, step * (ds || 4) * 0.85)], ROAD,
                  { id: `bahrain-svc-${k}-${side}`, samples: 2 });
              }
              if (f >= s1) break;
              k = (k + step) % n;
              if (k === K(s0)) break;
            }
          }
        }
        for (const [sf, side, gap, w, h, d] of [
          [0.33, -1, 62, 12, 5, 16],
          [0.49,  1, 68, 14, 6, 18],
          [0.61, -1, 66, 13, 5, 17],
        ]) {
          const a = anchor(K(sf), side, gap), b = [a.r, a.u, a.t];
          if (onTrack(a.c[0], a.c[2], 14)) continue;
          const gy = terrainYAt(a.c[0], a.c[2]);
          const foot = a.c.slice();
          if (gy != null && Number.isFinite(gy)) foot[1] = gy - 0.08;
          addBox(out, vadd(foot, a.u, h * 0.5), [w, h, d], TECH, b);
          addBox(out, vadd(foot, a.u, h + 0.15), [w * 1.04, 0.3, d * 1.01], PIT_CREAM, b);
        }
        for (let i = 0; i < 6; i++) {
          const sf = 0.42 + i * 0.028;
          const k = K(sf % 1), side = (i % 2) ? 1 : -1;
          const d = 48 + hash(k * 19 + i) * 18;
          if (hash(k * 23 + i) > 0.55) bush(k, side, d, SCRUB_DRY);
        }
      })();

    };
