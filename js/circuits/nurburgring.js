/* Apex 26 — NÜRBURGRING (GP-Strecke) circuit definition (data only).
   Retired circuit (`classic: true`): last hosted the 2020 Eifel GP and is not on
   the current calendar. This is the modern 5.1 km Grand-Prix-Strecke, NOT the
   20.8 km Nordschleife — the upstream OSM dataset has no Nordschleife trace.
   Registered on the global TrackDefs list; consumed by the js/track/tracks.js
   engine (geometry from the OSM trace in js/track/geo-paths.js). */
(function () {
  "use strict";
  (window.TrackDefs = window.TrackDefs || []).push(
  {
    id: "nurburgring",
    classic: true,
    // Upstream trace de-1927 runs clockwise, matching the racing direction
    // (Castrol-S at T1 is a right), so no flip.
    reverse: false,
    // The trace's first vertex opens the 547 m pit straight; nudge the line a
    // little along it so the grid sits where it really does, short of the
    // Castrol-S braking zone. Not GPS-calibrated — OpenF1 has no Eifel data.
    startFrac: 0.02,
    name: "NURBURGRING",
    gp: "Eifel GP",
    country: "Germany",
    night: false,
    theme: "green",
    lengthKm: 5.1,
    baseHW: 7.5,
    sceneryCoordinates: "racing",
    // The Eifel hillside and the Mercedes-Arena bowl both need ground; stop
    // short of bridging the tight Arena foldback.
    terrainOuter: 100,
    dressingExclusions: [
      { kinds: ["foliage", "lamps"], s0: 0.94, s1: 0.10 },  // pit straight + Arena
      { kind: "foliage", s0: 0.60, s1: 0.68 },              // Dunlop-Kehre runoff
    ],
    // Cool, damp Eifel upland light — the Nürburgring is 600 m up and famously
    // grey. Muted sun, high haze, deep conifer green.
    pal: {
      zenith:        [0.38, 0.48, 0.60],
      horizon:       [0.66, 0.70, 0.72],
      sun:           [0.92, 0.93, 0.92],
      sunColor:      [0.92, 0.93, 0.92],
      ambientSky:    [0.50, 0.54, 0.58],
      ambientGround: [0.26, 0.28, 0.24],
      fogColor:      [0.62, 0.66, 0.68],
      fogDensity:    0.0030,
      grass:         [0.16, 0.36, 0.17],
      sunDir:        [0.50, 0.52, 0.42],
    },
    // Real Eifel relief: the lap drops away from the Arena through the Ford
    // Kurve, runs low through the back section and climbs hard back to the
    // Veedol chicane. Authored, not surveyed (bake-elevation needs network).
    elevations: [
      { s: 0.18, halfM: 340, rise: -8.0 },   // drop out of the Mercedes-Arena
      { s: 0.42, halfM: 460, rise: -12.0 },  // low ground through the back loop
      { s: 0.66, halfM: 380, rise: 6.0 },    // Dunlop-Kehre rise
      { s: 0.86, halfM: 420, rise: 11.0 },   // climb back to Veedol / the pits
    ],
    hwZones: [
      { s0: 0.100, s1: 0.180, hw: 6.2, ease: 0.012 },  // Mercedes-Arena complex
      { s0: 0.630, s1: 0.690, hw: 6.4, ease: 0.012 },  // Dunlop-Kehre
      { s0: 0.910, s1: 0.955, hw: 6.3, ease: 0.012 },  // Veedol chicane
    ],
    bankZones: [
      { frac: 0.055, angleDeg: 3.5, widthM: 110 },   // Castrol-S
      { frac: 0.300, angleDeg: 4.5, widthM: 140 },   // Ford Kurve
      { frac: 0.520, angleDeg: 3.0, widthM: 120 },   // Bit-Kurve
      { frac: 0.780, angleDeg: 4.0, widthM: 130 },   // Schumacher-S
    ],
    scenery: function (api) {
      const { out, MAT, n, pyMin, hash, every, along, anchor, vadd, onTrack,
        px, pz, pine, tree, bush, ridge, mountain, building, grandstandEx,
        spectatorHill, broadcastCompound, billboard, gantry, marshalPost, tower,
        motorhome, fence, guardrail, tyreWall, groundPatch, modelGroup,
        addBox, addCyl, addCone, addPrism } = api;
      const K = (s) => Math.round(s * n) % n;

      const FIR_D = [0.07, 0.22, 0.12], FIR = [0.09, 0.27, 0.14];
      const LEAF = [0.17, 0.40, 0.19], LEAF_D = [0.13, 0.33, 0.16];
      const GRAVEL = [0.62, 0.58, 0.48];

      // =====================================================================
      // 1. EIFEL CONIFER FOREST — spruce ranks walling the back half of the lap.
      // =====================================================================
      const openArena = (s) => (s >= 0.94 || s <= 0.20);
      every(20, (k) => {
        const s = k / n;
        if (openArena(s)) return;
        const h = hash(k * 31);
        if (h < 0.12) return;
        const side = h < 0.5 ? -1 : 1;
        pine(k, side, 9 + h * 7, 16 + h * 14, h < 0.4 ? FIR_D : FIR);
        if (h > 0.30) pine(k, -side, 11 + h * 8, 14 + h * 12, FIR);
      });
      every(32, (k) => {
        const s = k / n;
        if (openArena(s)) return;
        const h = hash(k * 53 + 9);
        if (h < 0.25) return;
        tree(k, h < 0.5 ? -1 : 1, 15 + h * 10, 10 + h * 7, h < 0.5 ? LEAF_D : LEAF);
        if (h > 0.66) pine(k, h > 0.84 ? -1 : 1, 30 + h * 16, 20 + h * 12, FIR_D);
      });
      every(52, (k) => {
        const s = k / n;
        if (openArena(s)) return;
        const h = hash(k * 67 + 17);
        if (h < 0.34) return;
        pine(k, h < 0.5 ? -1 : 1, 46 + h * 28, 23 + h * 15, FIR_D);
      });
      every(28, (k) => {
        const s = k / n;
        if (openArena(s)) return;
        const h = hash(k * 97 + 23);
        if (h < 0.58) return;
        bush(k, h < 0.78 ? -1 : 1, 6.5 + h * 4, [0.14, 0.31, 0.15]);
      });

      // =====================================================================
      // 2. MERCEDES-ARENA — the stadium-style bowl of grandstands wrapping the
      //    slow complex just after the start, the circuit's signature view.
      // =====================================================================
      grandstandEx(0.115, 1, 15, 108, null, null,
        { livery: "steel", tiers: 2, roof: "cantilever", suites: true, endWalls: true, pylons: true });
      grandstandEx(0.150, 1, 15, 96, null, null,
        { livery: "concrete", tiers: 2, roof: "cantilever", endWalls: true });
      grandstandEx(0.130, -1, 14, 90, null, null, { livery: "concrete", endWalls: true });
      spectatorHill(0.160, 0.200, -1, 14, { rows: 4, rise: 1.2, depth: 1.9, density: 0.52, step: 8 });
      {
        const winLit = [0.96, 0.88, 0.56];
        for (const [s, side, dist] of [[0.115, 1, 23], [0.150, 1, 23]]) {
          const a = anchor(K(s), side, dist);
          addBox(out, vadd(a.c, a.u, 10.2), [0.22, 1.4, 96], winLit, [a.r, a.u, a.t]);
        }
      }
      groundPatch(K(0.135), 1, 6, [34, 0.18, 44], GRAVEL,
        { id: "nurburgring-arena-gravel", samples: 7 });
      tyreWall(0.120, 0.155, 1, 5, [0.86, 0.20, 0.18]);
      marshalPost(K(0.140), -1, 10);

      // =====================================================================
      // 3. PIT COMPLEX, START/FINISH AND THE ring°BOULEVARD BLOCK
      // =====================================================================
      const pitWall = [0.86, 0.86, 0.85];
      for (let i = 0; i < 8; i++) {
        building(K(0.955 + i * 0.007), 1, 15, 16, 9, 11,
          { wall: pitWall, window: [0.28, 0.32, 0.40], floor: 4.5, roof: true });
      }
      tower(K(0.985), 1, 13, 6, 38, { col: [0.90, 0.90, 0.90], cap: true, capCol: [0.14, 0.14, 0.16], mast: 8 });
      gantry(0.0, 8.5, [0.15, 0.15, 0.18]);
      gantry(0.965, 8.0, [0.15, 0.15, 0.18]);
      grandstandEx(0.005, -1, 11, 150, null, null,
        { livery: "concrete", tiers: 2, roof: "cantilever", suites: true, endWalls: true, pylons: true });
      grandstandEx(0.960, -1, 11, 96, null, null, { livery: "steel", endWalls: true });

      // The big glass-and-steel complex behind the paddock (the ring°boulevard
      // development) — a long low slab with a curved roof, unmistakable from
      // the main straight.
      {
        const a = anchor(K(0.980), 1, 62);
        const b = [a.r, a.u, a.t];
        modelGroup("nurburgring-boulevard", {
          center: vadd(a.c, a.u, 9),
          size: [30, 18, 120],
          basis: b,
        }, (stage) => {
          addBox(stage, vadd(a.c, a.u, 7), [26, 14, 116], [0.74, 0.76, 0.80], b);
          addPrism(stage, vadd(a.c, a.u, 15.5), [27, 3.4, 117], [0.58, 0.60, 0.64], b);
          // Glazed frontage bands facing the circuit.
          const glass = [0.52, 0.64, 0.74];
          for (const hgt of [4.5, 9.5]) {
            addBox(stage, vadd(vadd(a.c, a.r, -12.5), a.u, hgt), [0.3, 2.6, 110], glass, b);
          }
        });
      }
      for (let i = 0; i < 4; i++) {
        building(K(0.930 + i * 0.014), 1, 38, 24, 12, 18,
          { wall: [0.80, 0.80, 0.82], window: [0.30, 0.34, 0.42], floor: 4.5, roof: true });
      }
      every(46, (k) => {
        const s = k / n, h = hash(k * 71 + 31);
        if (!(s > 0.90 || s < 0.04) || h < 0.52) return;
        motorhome(k, 1, 56 + h * 10, 10, 4, 6, { wall: [0.62 + h * 0.28, 0.62, 0.64] });
      });
      broadcastCompound(K(0.920), 1, 72, { vans: 3, dishes: 2, mastH: 9 });
      for (const s of [0.975, 0.005, 0.03]) billboard(K(s), -1, 8, 12, 4.5, [0.90, 0.86, 0.30]);

      // =====================================================================
      // 4. BACK-SECTION CORNERS — Dunlop-Kehre, Schumacher-S, Veedol.
      // =====================================================================
      groundPatch(K(0.660), -1, 6, [30, 0.18, 40], GRAVEL,
        { id: "nurburgring-dunlop-gravel", samples: 7 });
      tyreWall(0.645, 0.680, -1, 5, [0.20, 0.40, 0.85]);
      grandstandEx(0.665, 1, 17, 70, null, null, { livery: "steel", endWalls: true });
      marshalPost(K(0.655), 1, 9);

      groundPatch(K(0.785), 1, 5, [24, 0.18, 32], GRAVEL,
        { id: "nurburgring-schumacher-gravel", samples: 6 });
      grandstandEx(0.780, -1, 18, 60, null, null, { livery: "concrete" });
      marshalPost(K(0.790), -1, 9);

      groundPatch(K(0.930), -1, 5, [22, 0.18, 30], GRAVEL,
        { id: "nurburgring-veedol-gravel", samples: 6 });
      tyreWall(0.915, 0.950, -1, 4, [0.86, 0.20, 0.18]);
      marshalPost(K(0.935), 1, 9);

      // =====================================================================
      // 5. BOUNDARIES
      // =====================================================================
      for (const [s0, s1] of [[0.20, 0.29], [0.32, 0.50], [0.54, 0.63], [0.69, 0.77], [0.80, 0.90]]) {
        guardrail(s0, s1, -1, 7, [0.80, 0.81, 0.83]);
        guardrail(s0, s1,  1, 7, [0.80, 0.81, 0.83]);
      }
      guardrail(0.955, 0.045, 1, 4.0, [0.85, 0.85, 0.88]);
      fence(0.96, 0.04, -1, 9, 4, [0.74, 0.76, 0.80]);
      fence(0.10, 0.19, 1, 9, 4, [0.74, 0.76, 0.80]);
      fence(0.64, 0.69, 1, 9, 4, [0.74, 0.76, 0.80]);
      for (const s of [0.25, 0.37, 0.46, 0.57, 0.72, 0.84]) {
        marshalPost(K(s), hash(K(s)) < 0.5 ? -1 : 1, 8.5);
      }

      // =====================================================================
      // 6. EIFEL HILLS — forested uplands ringing the whole circuit. This is
      //    what makes the GP-Strecke read as a mountain circuit rather than a
      //    flat autodrome.
      // =====================================================================
      const cx = px.reduce((a, b) => a + b, 0) / n, cz = pz.reduce((a, b) => a + b, 0) / n;
      let rad = 0;
      for (let i = 0; i < n; i++) rad = Math.max(rad, Math.hypot(px[i] - cx, pz[i] - cz));
      for (const rg of [
        { extra: 240, wMin: 150, hMin: 44, hVar: 40, wVar: 70, count: 30, phase: 0.0,
          opts: { seg: 7, rough: 0.30, forest: [0.10, 0.30, 0.14], rock: [0.30, 0.33, 0.30], snowline: 2 } },
        { extra: 300, wMin: 300, hMin: 74, hVar: 56, wVar: 130, count: 24, phase: 0.5,
          opts: { seg: 7, rough: 0.32, forest: [0.13, 0.34, 0.17], rock: [0.36, 0.39, 0.37], snowline: 2 } },
        { extra: 440, wMin: 360, hMin: 104, hVar: 84, wVar: 140, count: 20, phase: 0.25,
          opts: { seg: 7, rough: 0.34, forest: [0.18, 0.40, 0.21], rock: [0.46, 0.49, 0.50], snowline: 2 } },
      ]) {
        const ring = rad + rg.extra;
        for (let i = 0; i < rg.count; i++) {
          const a = (i + rg.phase) / rg.count * 6.2832, h = hash(i * 7 + rg.extra);
          const rr = ring - rg.wMin * 0.18 + hash(i * 5 + rg.extra) * rg.wMin * 0.30;
          mountain(cx + Math.cos(a) * rr, cz + Math.sin(a) * rr, pyMin,
            rg.wMin + h * rg.wVar, rg.hMin + h * rg.hVar,
            Object.assign({ seed: i * 13 + rg.extra }, rg.opts));
        }
      }
      // Near treeline ridges settling the forest against the hills.
      every(58, (k) => {
        const s = k / n;
        if (openArena(s)) return;
        for (const side of [-1, 1]) {
          const h = hash(k * 13 + side);
          const tx = px[k], tz = pz[k];
          if (onTrack(tx, tz, 20)) continue;
          ridge(tx, tz, pyMin, 0, 100, 26, 16 + h * 8, [0.11, 0.28, 0.14]);
        }
      });

      // =====================================================================
      // 7. BESPOKE IDENTITY — the Dunlop bridge over the pit-straight approach
      //    and the hillside spectator banks the Eifel crowds actually stand on.
      // =====================================================================
      // The footbridge crossing the circuit near the Arena exit. Declared as a
      // single overhead span so its underside clearance is checked explicitly.
      {
        const clearance = 7.2;
        api.overheadSpan({
          id: "nurburgring-dunlop-bridge",
          frac: 0.215,
          clearance,
          thickness: 1.6,
          depth: 5,
          span: 26,
          supports: false,
          color: [0.60, 0.62, 0.66],
          required: true,
        });
        for (const side of [-1, 1]) {
          const a = anchor(K(0.215), side, 4.2);
          modelGroup(`nurburgring-dunlop-pier-${side < 0 ? "left" : "right"}`, {
            center: vadd(a.c, a.u, clearance / 2),
            size: [2.2, clearance, 3.4],
            basis: [a.r, a.u, a.t],
          }, (stage) => {
            addCyl(stage, a.c, 1.0, clearance, [0.54, 0.56, 0.60], 8, [a.r, a.u, a.t]);
          }, { required: true });
        }
      }
      // General-admission grass banks cut into the treeline on the back section.
      spectatorHill(0.36, 0.46, 1, 14, { rows: 3, rise: 1.0, depth: 1.8, density: 0.38, step: 9 });
      spectatorHill(0.70, 0.78, -1, 14, { rows: 3, rise: 1.0, depth: 1.8, density: 0.38, step: 9 });
      // Camp-style spectator clusters in the forest clearings.
      for (const [id, s, side] of [
        ["nurburgring-camp-north", 0.44, -1],
        ["nurburgring-camp-south", 0.74, 1],
      ]) {
        const a = anchor(K(s), side, 54);
        const b = [a.r, a.u, a.t];
        modelGroup(id, { center: vadd(a.c, a.u, 3.6), size: [22, 8, 40], basis: b }, (stage) => {
          const cols = [[0.82, 0.18, 0.15], [0.90, 0.88, 0.82], [0.22, 0.44, 0.26]];
          for (let i = 0; i < 6; i++) {
            const row = i % 2, off = (Math.floor(i / 2) - 1) * 12;
            const p = vadd(vadd(a.c, a.r, (row ? 1 : -1) * 5), a.t, off);
            addPrism(stage, vadd(p, a.u, 1.4), [5.2, 2.8, 6.2], cols[i % cols.length], b);
          }
          const flag = vadd(vadd(a.c, a.r, -7.5), a.t, 15);
          addCyl(stage, flag, 0.10, 8, [0.30, 0.30, 0.31], 6, b);
          addBox(stage, vadd(vadd(flag, a.u, 6.8), a.t, 1.4), [0.16, 1.8, 4.0], [0.85, 0.16, 0.14], b);
        });
      }
    },
  }
  );
})();
