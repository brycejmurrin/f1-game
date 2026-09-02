/* Apex 26 — BAHRAIN scenery (data only), split out of js/circuits/bahrain.js.
   LAZY_SCENERY (tools/manifest.cjs): no <script> tag. game.js fetches the ONE
   circuit a session builds; all 40 together were 1,083 KB of the boot wall for
   a player who races one of them. Body moved verbatim — see tools/manifest.cjs
   and tests/unit/load-order.test.mjs for the lockstep. */
"use strict";
(window.TrackScenery = window.TrackScenery || {})["bahrain"] =
  function (api) {
      const { out, MAT, n, px, pz, pyMin, hash, vadd,
        place, anchor, addBox, addCyl, addCone, addFrustum, addPyramid,
        bush, palm, acacia, terrace, grandstand, grandstandEx, building, cityFront, tower, billboard, overheadSpan, marshalPost,
        mountain, backdrop, fence, wall, guardrail, tyreWall,
        floodMast: apiFloodMast, floodMastRing, ledFacadeBands, cameraTower, broadcastCompound,
        modelGroup, groundPatch, bleacher, onTrack, every,
        circuitKit } = api;
      const K = (s) => Math.round(s * n) % n;

      if (circuitKit) {
        circuitKit.pitBuilding({
          id: "kit:bahrain:pit-operations", frac: 0.992, side: -1, gap: 24,
          size: [18, 11, 72], garages: 18, required: true,
        });
        circuitKit.hospitality({
          id: "kit:bahrain:hospitality", frac: 0.955, side: -1, gap: 100,
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
      // Grandstand / pit building colours: Bahrain's iconic pale cream + slate seats
      const SEAT        = [0.18, 0.18, 0.21];
      const SEAT_BLUE   = [0.14, 0.22, 0.42];
      const STEEL       = [0.16, 0.16, 0.19];
      const PIT_CREAM   = [0.91, 0.89, 0.84];  // cream-white for main pit building
      const STAND_CREAM = [0.84, 0.82, 0.76];  // slightly warm for grandstand shells
      // Floodlights: cool-white lens + cool pool (night-race drama)
      const FLOOD       = [1.10, 1.14, 1.22];
      const POOL        = [0.72, 0.78, 0.88];
      // Night-lit windows: warm amber (office glow), cool blue (control/tech rooms)
      const WIN_WARM    = [0.92, 0.80, 0.44];  // office/hospitality lit window — warm amber
      const WIN_COOL    = [0.52, 0.70, 0.94];  // timing/technical lit window — cool blue
      // Sakhir Tower: pale cream cylindrical shaft + full-height LED video façade
      const TOWER_CYL   = [0.84, 0.83, 0.79];
      const TOWER_PALE  = [0.85, 0.85, 0.80];
      const TOWER_LED   = [1.45, 1.28, 0.62];  // HDR warm LED rings (brighten for night read)
      // Night-race beacon: warm amber nav light + cool video-screen accent
      const BEACON_WARM = [0.98, 0.75, 0.35];
      const BEACON_COOL = [0.70, 0.88, 0.98];
      const TYRE_CAP    = [0.85, 0.13, 0.13];
      const BILLBOARD_LITE = [0.95, 0.93, 0.86];
      // Hospitality buildings: sandy desert palette with lit windows
      const HOSP_SAND   = [0.82, 0.78, 0.68];  // sandy beige hospitality exterior
      const HOSP_WARM   = [0.78, 0.74, 0.65];
      // Desert scrub: dried, dusty vegetation — warm ochre not green
      const SCRUB_DRY   = [0.46, 0.40, 0.24];  // dried desert scrub / dead grass
      const SCRUB_MID   = [0.52, 0.44, 0.28];  // mid-tone desert scrub

      let cx = 0, cz = 0;
      for (let i = 0; i < n; i++) { cx += px[i]; cz += pz[i]; }
      cx /= n; cz /= n;
      let rad = 0;
      for (let i = 0; i < n; i++) rad = Math.max(rad, Math.hypot(px[i] - cx, pz[i] - cz));

      for (const [extra, jit, wMin, hMin, count, forestCol, rockCol] of [
        [140, 55,  220, 24, 72, SAND_DARK,  SAND      ],  // near warm-sand band
        [340, 100, 300, 38, 60, SAND,       SAND_LIGHT],  // far lighter-horizon band
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

      const SKY_SIL  = [0.26, 0.29, 0.38];   // dark blue-grey tower silhouette (lifted so it reads)
      const SKY_SIL2 = [0.21, 0.24, 0.34];   // deeper varied tone
      (function manamaSkyline() {
        const clusters = [[0.22, 8, 1]];   // [arcStart, count, side]
        for (const [arc0, count, side] of clusters) {
          for (let i = 0; i < count; i++) {
            const sFrac = (arc0 + i * 0.024) % 1;
            const hf = hash(i * 7 + arc0 * 30), wf = hash(i * 3 + arc0 * 17);
            const dist = 560 + hash(i * 5 + arc0 * 70) * 200;
            const landmark = hash(i * 4.4 + arc0) > 0.86;
            const w = 8 + wf * 9, h = (landmark ? 90 : 40) + hf * 90, d = w * 1.3;
            backdrop(K(sFrac), side, dist, [w, h, d], hash(i * 11 + arc0) > 0.5 ? SKY_SIL : SKY_SIL2);
            if (landmark || hash(i * 13 + 1.7) > 0.5) {
              const a = anchor(K(sFrac), side, dist), bv = [a.r, a.u, a.t];
              addBox(out, vadd(a.c, a.u, h + 0.5), [1.8, 4.0, 1.8], BEACON_WARM, bv);  // aircraft beacon
            }
          }
        }
      })();

      const floodMast = (k, side, gap, h) => {
        const mastH = (h != null ? h : 36 + hash(k * 13) * 6); // 36–42 m when jittered
        if (typeof apiFloodMast === "function") {
          apiFloodMast(k, side, gap, { h: mastH, cool: true, pool: true });
          return;
        }
        const a = anchor(k, side, gap), b = [a.r, a.u, a.t];
        addCyl(out, a.c, 0.45, mastH, STEEL, 6, b);
        addBox(out, vadd(a.c, a.u, mastH), [5.4, 1.6, 2.2], FLOOD, b);
        addBox(out, vadd(a.c, a.u, 0.12), [8.0, 0.22, 8.0], POOL, b);
      };

      const duneWedge = (k, side, gap, w, h) => {
        const a = anchor(k, side, gap + w * 0.3);
        const seg = 5 + Math.floor(hash(k * 19 + side * 29) * 4);        // 5-8
        const rough = 0.20 + hash(k * 23 + side * 31) * 0.20;            // 0.2-0.4
        mountain(a.c[0], a.c[2], pyMin, w * 0.55, h, {
          seg, seed: k * 3 + side * 17,
          rough, snowline: 99,
          forest: DUNE, rock: SAND_DARK, snow: DUNE_LIT,
        });
      };

      // ── Three-pole light bank (cluster of tall cool-white masts) ─────────
      const lightBank = (k, side, gap) => {
        for (const off of [-6, 0, 6]) {
          const kk = (k + off + n) % n;
          floodMast(kk, side, gap, 36 + hash(kk * 3) * 6);
        }
      };

      const hospitality = (k, side, gap, w, h, d) => {
        building(k, side, gap, w, h, d,
          { wall: HOSP_SAND, window: WIN_WARM, lit: true, floor: 3 });
        // lit parapet strip: bright white ledge mimicking the real Bahrain hospitality roofline
        const a = anchor(k, side, gap + w / 2), b = [a.r, a.u, a.t];
        addBox(out, vadd(a.c, a.u, h + 0.55), [w * 1.05, 0.65, d * 1.02], FLOOD, b);
      };

      const accessBox = (k, side, gap, w, h, d) => {
        building(k, side, gap, w, h, d,
          { wall: [0.88, 0.87, 0.82], window: WIN_COOL, lit: true, floor: 2 });
      };

      building(K(0.00), -1,  2, 16, 14, 80,
        { kind: "slab", wall: PIT_CREAM, window: WIN_WARM, lit: true, floor: 4, setback: true });
      // Pit wall + start gantry
      wall(0.97, 0.04, -1, 3, 1.1, [0.85, 0.85, 0.85]);
      overheadSpan({
        id: "bahrain-start-gantry", frac: 0.005, clearance: 8.5,
        thickness: 0.9, depth: 1.6, supportGap: 2, color: STEEL, required: true,
      });
      grandstandEx(0.00,   1, 18, 140, STAND_CREAM, SEAT_BLUE,
        { tiers: 2, roof: "truss", suites: true, endWalls: true });
      grandstandEx(0.985,  1, 90,  80, STAND_CREAM, SEAT_BLUE,
        { roof: "cantilever", endWalls: true, pylons: true });
      // Second pit-side building: timing/media centre with cool lit windows
      building(K(0.01), -1, 2, 10, 9, 40,
        { kind: "hall", wall: [0.86, 0.85, 0.80], window: WIN_COOL, lit: true, floor: 3 });

      (function sakhirTower() {
        const kT = K(0.055);
        const a = anchor(kT, -1, 50), b = [a.r, a.u, a.t];
        const BASE = a.c;
        const TOWER_H = 40;   // ~10 storeys
        const TOWER_R = 6.6;
        // Core shaft: the structural mass behind the LED skin.
        addCyl(out, BASE, TOWER_R * 0.92, TOWER_H, TOWER_CYL, 12, b);
        if (typeof ledFacadeBands === "function") {
          ledFacadeBands(BASE, TOWER_H, {
            r: TOWER_R, bands: 10, seg: 12, basis: b,
            cols: [TOWER_LED, [1.05, 0.85, 1.15], BEACON_COOL, [1.30, 0.98, 0.35]],
          });
        } else {
          for (let i = 0; i < 8; i++) {
            addFrustum(out, vadd(BASE, b[1], 4 + (i / 7) * (TOWER_H - 8)), TOWER_R + 1.3, TOWER_R + 0.9, 1.1, TOWER_LED, 12, b);
          }
        }
        addBox(out, vadd(BASE, b[1], TOWER_H + 0.4), [TOWER_R + 0.8, 0.8, TOWER_R + 0.8], STAND_CREAM, b);
        addCyl(out, vadd(BASE, b[1], TOWER_H + 0.8), 0.4, 6.0, STEEL, 5, b);
        addCone(out, vadd(BASE, b[1], TOWER_H + 0.8), 3.4, 4.5, BEACON_WARM, 8, b);
        addBox(out, vadd(BASE, b[1], TOWER_H + 5.3), [2.6, 1.1, 2.6], BEACON_COOL, b);
        // Light pool at tower base
        addBox(out, vadd(BASE, b[1], 0.15), [16.0, 0.30, 16.0], POOL, b);
      })();

      cityFront(0.97, 0.05, -1, 30, {
        minH: 6, maxH: 14, depth: 18, step: 18,
        palette: [HOSP_SAND, HOSP_WARM, [0.80, 0.75, 0.64], [0.86, 0.82, 0.72]],
        lit: true, windowCol: WIN_WARM,
      });

      backdrop(K(0.00), 1, 160, [280, 16, 14], SAND_DARK);
      backdrop(K(0.97), 1, 180, [240, 18, 14], SAND);

      grandstandEx(0.05,   1, 24, 90, STAND_CREAM, SEAT_BLUE,
        { roof: "truss", suites: true, endWalls: true });
      grandstandEx(0.025,  1, 24, 60, null, null, { livery: "steel", roof: "flat", endWalls: true });
      grandstandEx(0.065,  1, 28, 72, null, null, { livery: "sandstone", roof: "cantilever", pylons: true });
      cameraTower(K(0.045), -1, 46, { h: 22 });
      // Inside of T1: access road + small pit buildings
      accessBox(K(0.03), -1, 36, 10, 6, 16);
      lightBank(K(0.06), 1, 36);
      floodMast(K(0.05), 1, 32, 40);
      floodMast(K(0.03), -1, 32, 38);
      billboard(K(0.07), -1, 10, 14, 4, [0.85, 0.12, 0.12]);
      billboard(K(0.08),  1, 10, 12, 3.5, [0.05, 0.45, 0.75]);
      billboard(K(0.10),  1, 11, 12, 4, [0.10, 0.30, 0.70]);
      tyreWall(0.045, 0.085, 1, 4, TYRE_CAP);
      fence(0.03, 0.09, -1, 7, 3.2, [0.70, 0.72, 0.76]);
      marshalPost(K(0.06), 1, 22);

      const UNI_LIVERY = ["steel", "alu"];
      for (const [i, ds, dGap, seLen, seatC] of [
        [0, -0.040, 26, 44, SEAT_BLUE],
        [1, -0.010, 24, 38, SEAT],
        [2,  0.025, 24, 42, SEAT_BLUE],
        [3,  0.060, 28, 38, SEAT],
      ]) {
        if (i % 2 === 0) {
          grandstandEx(0.18 + ds, 1, dGap, seLen, STAND_CREAM, seatC, { endWalls: true });
        } else {
          grandstandEx(0.18 + ds, 1, dGap, seLen, null, null,
            { livery: UNI_LIVERY[(i >> 1) % UNI_LIVERY.length], endWalls: true });
        }
      }
      billboard(K(0.15), 1, 11, 12, 4, [0.90, 0.55, 0.05]);
      floodMast(K(0.16), 1, 34, 39);

      // Perimeter ring (below) owns lap density; keep a few corner heroes only.
      // The left-hand hero sits at 0.195/18 m, not 0.20/30 m: the lap folds back
      // on itself at 0.20-0.21, so 30 m inside that fold is on the tarmac of the
      // next leg (rejBox dropped it every build).
      floodMast(K(0.195), -1, 18, 40);
      floodMast(K(0.20),  1, 30, 40);

      // Per-wedge setbacks: the 0.11-0.14 and 0.37 legs run 80-140 m to the left
      // of this stretch, so a uniform 64 + 14 i put wedges 0, 1 and 4 on those
      // legs (mountain()'s fit loop cannot shrink a foot that is over the road).
      const WEDGE_GAP = [85, 130, 92, 106, 90, 134];
      for (let i = 0; i < 6; i++) {
        const k = (K(0.27) + i * Math.round(n * 0.015)) % n;
        duneWedge(k, -1, WEDGE_GAP[i], 40 + hash(k) * 28, 3.5 + hash(k * 5) * 3);
      }

      for (const [s, gap, w, h] of [
        [0.095, 124, 54, 4.2],   // 82 put the foot on the 0.10 leg (100 m to the right); 31 m clear at 124
        [0.115, 104, 68, 5.0],
        [0.138, 126, 76, 5.8],
      ]) {
        duneWedge(K(s), 1, gap, w, h);
      }

      grandstandEx(0.24,  1, 24, 60, null, null, { livery: "sandstone", roof: "flat", endWalls: true });
      grandstandEx(0.26, -1, 26, 50, STAND_CREAM, SEAT, { roof: "truss", pylons: true });
      lightBank(K(0.25), -1, 34);
      lightBank(K(0.27),  1, 34);
      // T4 broadcast vantage — the second of the four hero cameraTower spots.
      cameraTower(K(0.235), -1, 40, { h: 20 });
      tyreWall(0.225, 0.255, 1, 4, TYRE_CAP);
      fence(0.22, 0.29, 1, 6, 3.2, [0.70, 0.72, 0.76]);
      billboard(K(0.23), -1, 11, 12, 4, [0.85, 0.12, 0.12]);
      billboard(K(0.27),  1, 11, 12, 4, [0.90, 0.55, 0.05]);
      marshalPost(K(0.24), -1, 24);
      for (let i = 0; i < 3; i++) {
        hospitality((K(0.255) + i * 5) % n, 1, 44 + i * 6, 11, 6, 14);
      }
      // Desert backdrop slab on the L (infield) side at T3 — fills horizon gap
      backdrop(K(0.24), -1, 120, [200, 14, 12], SAND_DARK);

      // Open desert left + grandstand right. Sparse dry scrub only — no green palms.
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
      floodMast(K(0.42), 1, 34, 38);
      floodMast(K(0.44), -1, 32, 37);
      tyreWall(0.405, 0.44, 1, 4, TYRE_CAP);
      fence(0.40, 0.46, -1, 7, 3.2, [0.70, 0.72, 0.76]);
      billboard(K(0.43), 1, 11, 12, 4, [0.05, 0.45, 0.75]);
      marshalPost(K(0.43), -1, 26);
      cameraTower(K(0.415), -1, 44, { h: 22 });

      for (let i = 0; i < 2; i++) {
        const k = (K(0.48) + i * Math.round(n * 0.022)) % n;
        for (const side of [-1, 1]) duneWedge(k, side, 96 + i * 26, 52, 3.8);
      }
      // Sparse organic dune mounds (mid-lap desert fill) — min gap 52 on far side
      for (let i = 0; i < 2; i++) {
        const k = (K(0.50) + Math.round(i * n * 0.020)) % n;
        for (const side of [-1, 1]) {
          duneWedge(k, side, 52 + i * 20, 34 + hash(k * 3 + side) * 22, 3.6 + hash(k * 5) * 2.0);
        }
      }
      grandstandEx(0.52,  1, 28, 52, null, null, { livery: "steel", roof: "flat" });
      lightBank(K(0.51), 1, 38);
      lightBank(K(0.54), -1, 38);
      marshalPost(K(0.50), -1, 26);
      // Desert accessory buildings: sandy compound structures (e.g. TV compound)
      building(K(0.50), -1, 44, 16, 8, 22,
        { kind: "hall", wall: [0.72, 0.67, 0.56], window: WIN_WARM, lit: true, floor: 2 });
      // Desert backdrop slab behind open section — fills the distant horizon
      backdrop(K(0.50), -1, 140, [260, 15, 12], SAND);

      for (let i = 0; i < 5; i++) {
        const k = (K(0.58) + i * 3) % n;
        marshalPost(k, -1, 28 + i * 3);
      }
      // Timing/control buildings: proper lit structures replacing bare `place()` cubes
      accessBox(K(0.62), -1, 36, 8, 5, 12);
      accessBox(K(0.65), -1, 32, 7, 4, 10);
      floodMast(K(0.60),  1, 34, 39);
      floodMast(K(0.66),  1, 32, 37);

      tyreWall(0.585, 0.62, 1, 4, TYRE_CAP);
      fence(0.58, 0.67, 1, 6, 3.2, [0.70, 0.72, 0.76]);
      grandstandEx(0.63,  1, 24, 50, STAND_CREAM, [0.16, 0.24, 0.42], { pylons: true, endWalls: true });
      billboard(K(0.60), -1, 12, 12, 4, [0.90, 0.55, 0.05]);
      billboard(K(0.64),  1, 11, 12, 4, [0.85, 0.12, 0.12]);
      for (let i = 0; i < 3; i++) {
        building((K(0.62) + i * 4) % n, -1, 42 + i * 6, 10, 6 + hash(i) * 3, 14,
          { kind: "podium", wall: [0.88, 0.87, 0.82], window: WIN_COOL, lit: true, floor: 3 });
      }
      // Mid-circuit desert compound: sandy-coloured infrastructure block
      building(K(0.55), -1, 42, 14, 8, 20,
        { kind: "hall", wall: [0.68, 0.62, 0.50], window: WIN_WARM, lit: true, floor: 2 });

      // Split around the 0.832 hairpin: on its inside the 8 m face is on the
      // fold's tarmac, so the run was suppressed there while the driving limit
      // was still recorded (a phantom wall the player could not see).
      fence(0.74, 0.826, 1, 8, 3.2, [0.70, 0.72, 0.76]);
      tyreWall(0.74, 0.826, 1, 8, TYRE_CAP);
      fence(0.838, 0.88, 1, 8, 3.2, [0.70, 0.72, 0.76]);
      tyreWall(0.838, 0.88, 1, 8, TYRE_CAP);
      guardrail(0.73, 0.90, -1, 8, [0.80, 0.80, 0.82]);
      floodMast(K(0.77),  1, 32, 40);
      floodMast(K(0.84),  1, 32, 39);
      floodMast(K(0.79), -1, 32, 38);
      lightBank(K(0.76), 1, 36);
      lightBank(K(0.86), 1, 36);
      grandstandEx(0.78, 1, 32, 32, null, null, { livery: "alu", endWalls: true });
      grandstandEx(0.82, 1, 34, 34, STAND_CREAM, SEAT_BLUE, { roof: "truss", suites: true });
      grandstandEx(0.86, 1, 32, 30, null, null, { livery: "steel", pylons: true });
      billboard(K(0.75), -1, 12, 14, 4, BILLBOARD_LITE);
      billboard(K(0.78),  1, 14, 14, 4, [0.05, 0.45, 0.75]);
      billboard(K(0.82), -1, 11, 12, 4, [0.85, 0.12, 0.12]);
      billboard(K(0.86), -1, 12, 12, 4, [0.10, 0.55, 0.30]);
      marshalPost(K(0.82),  1, 24);
      marshalPost(K(0.86), -1, 26);
      // Mid-straight scoring gantry
      overheadSpan({
        id: "bahrain-back-straight-gantry", frac: 0.81, clearance: 8.2,
        thickness: 0.9, depth: 1.6, supportGap: 2, color: STEEL, required: true,
      });
      // Back straight desert buildings (R/L far): sandy compound structures
      building(K(0.72), -1, 48, 14, 10, 22,
        { kind: "hall", wall: [0.72, 0.67, 0.56], window: WIN_WARM, lit: true, floor: 2 });
      building(K(0.90), -1, 46, 12, 8, 18,
        { kind: "hall", wall: [0.70, 0.65, 0.54], window: WIN_COOL, lit: true, floor: 2 });
      // Desert backdrop slabs along the back straight left (desert) side
      backdrop(K(0.75), -1, 130, [300, 16, 13], SAND_DARK);
      backdrop(K(0.85), -1, 150, [260, 18, 13], SAND);

      grandstandEx(0.925, 1, 34, 58, STAND_CREAM, SEAT_BLUE,
        { roof: "truss", suites: true, endWalls: true });
      floodMast(K(0.912), 1, 42, 40);
      floodMast(K(0.940), 1, 42, 40);
      billboard(K(0.925), 1, 20, 14, 4, BILLBOARD_LITE);
      // Fourth hero broadcast vantage — final corner onto the pit straight.
      cameraTower(K(0.918), -1, 40, { h: 20 });

      // Second pit building: media/control centre with cool lit windows
      building(K(0.95), -1, 2, 14, 10, 56,
        { kind: "slab", wall: [0.86, 0.85, 0.80], window: WIN_COOL, lit: true, floor: 4 });
      wall(0.92, 0.99, -1, 4, 1.0, [0.85, 0.85, 0.85]);

      for (let i = 0; i < 6; i++) {
        const k = (K(0.985) + i * 4) % n;
        hospitality(k, -1, 32 + (i % 2) * 6, 12, 7 + hash(k * 3) * 3, 16);
      }
      // Taller paddock office block: media/comms tower complex
      building(K(0.97), -1, 68, 22, 24, 28,
        { kind: "fin", wall: [0.78, 0.76, 0.70], window: WIN_COOL, lit: true, floor: 6 });
      tower(K(0.95), -1, 88, 5, 40,
        { col: TOWER_PALE, seg: 6, cap: true, capCol: FLOOD, mast: 6 });
      // Pit-lane furniture
      tyreWall(0.90, 0.98, -1, 5, TYRE_CAP);
      guardrail(0.985, 0.06, 1, 9, [0.80, 0.80, 0.82]);
      // Start-line advertising hoardings
      billboard(K(0.99), 1, 11, 13, 4, BILLBOARD_LITE);
      billboard(K(0.02), -1, 11, 12, 4, [0.10, 0.55, 0.30]);

      if (typeof every === "function") {
        // The engine's floodMastRing(55, {dist: 30}) hand-rolled from the same
        // every() pitch so three sites can move: at 0.114 R, 0.208 L and the
        // 0.832 hairpin R the 30 m anchor is on the fold of the corner (2-5 m
        // INTO the next leg) and rejBox dropped the mast every build. The first
        // two pull in to 12/16 m (8-10 m clear); the hairpin inside has no room
        // at any setback, so that mast stands at 0.822 / 20 m instead.
        const RING = [[1, 0.110, 0.118, 12], [-1, 0.204, 0.212, 16], [1, 0.828, 0.836, 20, 0.822]];
        every(55, (k) => {
          const f = k / n;
          for (const side of [-1, 1]) {
            let dist = 30, kk = k;
            for (const [rs, lo, hi, rd, rk] of RING) {
              if (side === rs && f >= lo && f <= hi) { dist = rd; if (rk != null) kk = K(rk); }
            }
            floodMast(kk, side, dist, 39);
          }
        });
      } else if (typeof floodMastRing === "function") {
        floodMastRing(55, { dist: 30, h: 39, cool: true, pool: true });
      } else {
        for (let k = 0; k < n; k += Math.max(1, Math.round(n / 18))) {
          const side = hash(k * 9) < 0.5 ? -1 : 1;
          const gap = 28 + hash(k * 11) * 18;
          floodMast(k, side, gap, 36 + hash(k * 13) * 6);
        }
      }

      fence(0.10, 0.16,  1, 7, 3.0, [0.70, 0.72, 0.76]);
      fence(0.66, 0.72, -1, 7, 3.0, [0.70, 0.72, 0.76]);

      // Dried ochre scrub + sand rocks only — green palms/oases culled for sand-island read.
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
        for (const [s0, s1] of [[0.10, 0.20], [0.60, 0.70]]) {
          let cnt = 0;
          for (let sf = s0; sf < s1; sf += 0.020) {
            const kk = K(sf);
            const a = anchor(kk, -1, 20 + hash(kk * 5) * 12), b = [a.r, a.u, a.t];
            addBox(out, vadd(a.c, a.u, 0.12), [5.5, 0.25, 9.5], SAND_RUNOFF, b);
            cnt++;
            if (cnt > 6) break;
          }
        }
      }

      for (const [s, side, dist, wBase, hBase] of [
        [0.20, -1, 120, 86, 10],   // T3 infield dune ridge
        [0.48,  1, 270, 96, 12],   // desert section right-side ridge (0.42 leg is 200 m out; 155 stood on it)
        [0.70, -1, 192, 90, 11],   // back straight left-side ridge
      ]) {
        const k = K(s);
        const a = anchor(k, side, dist + wBase * 0.3);
        mountain(a.c[0], a.c[2], pyMin, wBase * 0.55 + hash(k * 7) * 30,
          hBase + hash(k * 11) * 5,
          { seg: 7, seed: k * 5 + dist, rough: 0.28, snowline: 99,
            forest: SAND_DARK, rock: SAND, snow: DUNE_LIT });
      }
      // Additional dune ridges on the opposite side to balance the horizon
      for (const [s, side, dist] of [
        [0.35,  1, 196],   // 128 landed on the 0.55 leg (3 m clear); 60 m clear here
        [0.60, -1, 148],
        [0.90,  1, 96],    // was 0.88/118: on the 0.20 leg; 0.90 side has 60 m at 120
      ]) {
        const k = K(s);
        const a = anchor(k, side, dist + 24);
        mountain(a.c[0], a.c[2], pyMin, 44 + hash(k * 9) * 28,
          8 + hash(k * 13) * 4,
          { seg: 6, seed: k * 7 + dist, rough: 0.25, snowline: 99,
            forest: SAND, rock: SAND_LIGHT, snow: DUNE_LIT });
      }

      const windTower = (k, side, gap, h) => {
        const a = anchor(k, side, gap), b = [a.r, a.u, a.t];
        out._mat = MAT.STONE;
        addFrustum(out, a.c, 2.6, 1.9, h, HOSP_SAND, 4, b);          // tapered shaft
        const top = vadd(a.c, a.u, h);
        // four corner piers framing the wind-catch opening
        for (const dx of [-1.35, 1.35]) for (const dz of [-1.35, 1.35]) {
          addBox(out, vadd(vadd(vadd(top, a.r, dx), a.t, dz), a.u, 1.5), [0.55, 3.0, 0.55], PIT_CREAM, b);
        }
        addBox(out, vadd(top, a.u, 3.1), [3.6, 0.5, 3.6], STAND_CREAM, b);  // cap slab
        out._mat = 0;
        addBox(out, vadd(top, a.u, 1.5), [1.5, 1.3, 1.5], WIN_WARM, b);     // warm interior glow
      };

      const marquee = (k, side, gap, w, len) => {
        const a = anchor(k, side, gap), b = [a.r, a.u, a.t];
        out._mat = MAT.FABRIC;
        addBox(out, vadd(a.c, a.u, 1.7), [w, 3.4, len], PIT_CREAM, b);            // tent walls
        addBox(out, vadd(a.c, a.u, 2.6), [w * 1.02, 0.55, len * 1.005], WIN_WARM, b); // lit window band
        const bays = Math.max(2, Math.round(len / (w * 0.9)));
        for (let i = 0; i < bays; i++) {
          const off = (i - (bays - 1) / 2) * (len / bays);
          addPyramid(out, vadd(vadd(a.c, a.u, 3.4), a.t, off),
            [w * 0.98, 3.2, (len / bays) * 0.96], STAND_CREAM, b);
        }
        out._mat = 0;
      };

      // ── Grandstand video wall — dark frame + bright cool screen face ─────
      const videoWall = (k, side, gap, w, h) => {
        const a = anchor(k, side, gap), b = [a.r, a.u, a.t];
        out._mat = MAT.METAL;
        addBox(out, vadd(a.c, a.u, h / 2 + 5), [0.9, h, w], STEEL, b);                       // frame
        out._mat = MAT.GLASS;
        addBox(out, vadd(vadd(a.c, a.u, h / 2 + 5), a.r, side * -0.55), [0.4, h * 0.86, w * 0.9], BEACON_COOL, b); // screen
        out._mat = MAT.METAL;
        for (const dz of [-w * 0.4, w * 0.4]) addBox(out, vadd(vadd(a.c, a.u, 2.5), a.t, dz), [0.55, 5, 0.55], STEEL, b);
        out._mat = 0;
      };

      windTower(K(0.985), -1, 52, 16);
      windTower(K(0.02),  -1, 46, 14);
      windTower(K(0.255),  1, 60, 13);
      windTower(K(0.63),  -1, 56, 15);
      windTower(K(0.80),   1, 58, 14);
      // F1 Village marquees — back straight + T4 hospitality terrace.
      marquee(K(0.79),  1, 40, 12, 44);
      marquee(K(0.83),  1, 40, 11, 36);
      marquee(K(0.26),  1, 54, 12, 40);
      marquee(K(0.50), -1, 62, 11, 34);
      // Video walls facing the main and T1 grandstands.
      videoWall(K(0.02),  1, 40, 12, 7);
      videoWall(K(0.055), 1, 46, 11, 6.5);
      videoWall(K(0.81),  1, 40, 12, 7);
      videoWall(K(0.42),  1, 40, 11, 6.5);

      grandstandEx(0.68,  1, 26, 46, STAND_CREAM, SEAT_BLUE, { endWalls: true });
      grandstandEx(0.71,  1, 26, 40, null, null,
        { livery: "alu", roof: "flat", endWalls: true, h: 9 });
      grandstandEx(0.335, 1, 28, 42, null, null, { livery: "sandstone", roof: "flat" });

      // ── General-admission terracing behind the main straight ─────────────
      // Poured mass-concrete steps in the sandstone family, sitting between the
      // 140 m hero stand at gap 18 and the far pit-straight stand at gap 90. No
      // roof and no back shell: the form the venue actually uses for GA, and
      // the one open-seating silhouette Sakhir was missing between its cream
      // shells and its bare desert.
      //
      // Deliberately on the STRAIGHT, and that constraint is real rather than
      // aesthetic. along() hands a range emitter a CONSTANT nominal bay length
      // (step * ds, measured on the centreline), so a run placed far off the
      // road on the INSIDE of any curve gets bays longer than the arc they have
      // to fill and buries ~1.7 m of each into its neighbour. Both earlier
      // homes for this terrace — above the T1 stands, then behind the final
      // corner — were inside-of-curve at gap 58 and both failed the clip audit
      // for exactly that reason. Anything this deep and this far out belongs on
      // a straight until along() reports the arc length at the emitter's gap.
      terrace(0.996, 0.030, 1, 58,
        { rows: 6, rise: 1.4, depth: 2.6, step: 9, density: 0.5,
          conc: [0.76, 0.70, 0.57], concAlt: [0.68, 0.62, 0.50],
          crowd: [SEAT_BLUE, SEAT, [0.62, 0.58, 0.52], [0.40, 0.30, 0.24]] });

      const FROND     = [0.26, 0.34, 0.16];
      const FROND_DRY = [0.32, 0.36, 0.19];
      for (let i = 0; i < 10; i++) {
        const sf = 0.955 + i * 0.009;
        const k = K(sf), hv = hash(k * 83 + i * 3);
        palm(k, -1, 42 + (i % 2) * 4, 9 + hv * 4, hv < 0.5 ? FROND : FROND_DRY);
      }
      for (let i = 0; i < 7; i++) {
        const sf = 0.238 + i * 0.007;
        const k = K(sf), hv = hash(k * 97 + i * 5);
        palm(k, 1, 36 + (i % 2) * 5, 8.5 + hv * 3.5, hv < 0.45 ? FROND : FROND_DRY);
      }

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

      broadcastCompound(K(0.965), -1, 100, { vans: 4, dishes: 3, mastH: 10 });

      // ── THE DRAG STRIP ───────────────────────────────────────────────────
      // BIC is not one circuit, it is a motorsport COMPLEX: six tracks share
      // the site, and the 1.2 km quarter-mile drag strip is the one the locals
      // actually use every week. It runs parallel to the pit straight out past
      // the paddock, and from a car on the main straight it is the only thing
      // breaking the emptiness on that side — a second pale ribbon lying in the
      // sand with its own light tree and its own little stands.
      //
      // The circuit had no trace of it, which left the whole west side of the
      // lap reading as untouched desert when the real place is built up out
      // there. Guarded segment-by-segment with onTrack(): the strip is longer
      // than the straight it parallels, so its far ends run past the circuit's
      // own geometry and must not be drawn over tarmac.
      (function dragStrip() {
        const PREP   = [0.24, 0.23, 0.24];   // rubbered-in launch surface
        const LANE   = [0.30, 0.29, 0.30];
        const STRIPE = [0.88, 0.87, 0.82];
        const WALL   = [0.80, 0.79, 0.74];
        const GAP    = 178;                  // metres out past the paddock
        const S0 = 0.930, S1 = 0.050, STEPS = 26;
        const span = (S1 - S0 + 1) % 1;
        const pts = [];
        for (let i = 0; i <= STEPS; i++) {
          const sf = (S0 + span * (i / STEPS)) % 1;
          pts.push(anchor(K(sf), -1, GAP));
        }
        for (let i = 0; i < STEPS; i++) {
          const a = pts[i], nx = pts[i + 1];
          const b = [a.r, a.u, a.t];
          const seglen = Math.hypot(nx.c[0] - a.c[0], nx.c[2] - a.c[2]) + 0.6;
          const c = [(a.c[0] + nx.c[0]) / 2, (a.c[1] + nx.c[1]) / 2, (a.c[2] + nx.c[2]) / 2];
          if (onTrack(c[0], c[2], 34)) continue;
          // Rubber builds up toward the start line at the i=0 end.
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
              for (const [hgt, col] of LENS) {
                addBox(stage, vadd(vadd(st.c, st.r, lane), st.u, hgt),
                  [0.62, 0.5, 0.5], col, stb);
              }
            }
            stage._mat = 0;
          });
        }
        const tow = vadd(st.c, st.r, -20);
        if (!onTrack(tow[0], tow[2], 22)) {
          addBox(out, vadd(tow, st.u, 4.0), [7, 8, 9], [0.86, 0.85, 0.80], stb);
          addBox(out, vadd(tow, st.u, 6.6), [7.4, 2.0, 9.4], WIN_COOL, stb);
          addBox(out, vadd(tow, st.u, 8.3), [8, 0.5, 10], [0.72, 0.71, 0.68], stb);
        }
        for (let i = 2; i < 12; i += 2) {
          const p = pts[i], pb = [p.r, p.u, p.t];
          const sc = vadd(p.c, p.r, -22);
          if (onTrack(sc[0], sc[2], 20)) continue;
          for (let r = 0; r < 4; r++) {
            addBox(out, vadd(vadd(sc, p.r, -r * 1.5), p.u, 0.6 + r * 0.75),
              [1.4, 0.3, 40], [0.74, 0.72, 0.66], pb);
          }
        }
        // Its own flood masts — the strip runs at night like the GP does.
        for (const i of [3, 11, 18, 25]) {
          const p = pts[i], pb = [p.r, p.u, p.t];
          const fc = vadd(p.c, p.r, 18);
          if (onTrack(fc[0], fc[2], 24)) continue;
          addCyl(out, fc, 0.55, 28, [0.72, 0.72, 0.74], 6, pb);
          addBox(out, vadd(fc, p.u, 28.6), [4.4, 1.0, 1.6], FLOOD, pb);
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
      ]) {
        const k = K(sf), a = anchor(k, side, gap + w * 0.5), b = [a.r, a.u, a.t];
        if (onTrack(a.c[0], a.c[2], 30)) continue;
        const hv = hash(k * 41 + gap);
        // Two offset slabs make a stepped ledge rather than a single block.
        addBox(out, vadd(a.c, a.u, h * 0.5), [w, h, len],
          [0.60 + hv * 0.05, 0.55 + hv * 0.04, 0.45], b);
        addBox(out, vadd(vadd(a.c, a.u, h + 0.35), a.r, w * 0.16),
          [w * 0.62, 0.7, len * 0.74], [0.72 + hv * 0.06, 0.67, 0.55], b);
        // Scree skirt at the foot, where the blasted rock spilled.
        addBox(out, vadd(a.c, a.u, 0.22), [w * 1.22, 0.44, len * 1.1],
          [0.56, 0.50, 0.40], b);
      }

    };
