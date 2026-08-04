/* Apex 26 — INDIANAPOLIS MOTOR SPEEDWAY (road course) definition (data only).
   Retired circuit (`classic: true`): last United States GP 2007.
   This is the F1 ROAD COURSE — the infield section joined to the oval's front
   straight, which F1 ran CLOCKWISE, opposite the oval's own direction.
   Geometry from the OSM trace in js/track/geo-paths.js. */
(function () {
  "use strict";
  (window.TrackDefs = window.TrackDefs || []).push(
  {
    id: "indianapolis",
    classic: true,
    // Upstream us-1909 already runs clockwise, matching the F1 lap.
    reverse: false,
    // The 647 m run opening the trace is the oval front straight — the pit
    // straight for the Grand Prix. Not GPS-calibrated.
    startFrac: 0.05,
    name: "INDIANAPOLIS",
    gp: "United States GP",
    country: "USA",
    night: false,
    theme: "modern",
    lengthKm: 4.2,
    baseHW: 8,
    sceneryCoordinates: "racing",
    // The Speedway is a walled bowl of grandstand; the terrain ribbon only has
    // to carry the infield, so keep it tight and let the stands do the work.
    terrainOuter: 90,
    // Nothing grows inside a motor speedway. Suppress the generic foliage pass
    // across the whole oval section — grass, tarmac and grandstand only.
    dressingExclusions: [
      { kinds: ["foliage", "lamps"], s0: 0.86, s1: 0.22 },
      { kind: "foliage", s0: 0.30, s1: 0.70 },
    ],
    // Flat Midwestern summer: high hazy sun, humid white horizon.
    pal: {
      zenith:        [0.28, 0.48, 0.76],
      horizon:       [0.84, 0.84, 0.80],
      sun:           [1.0,  0.97, 0.86],
      sunColor:      [1.0,  0.96, 0.84],
      ambientSky:    [0.54, 0.56, 0.60],
      ambientGround: [0.28, 0.28, 0.24],
      fogColor:      [0.82, 0.82, 0.80],
      grass:         [0.24, 0.44, 0.20],
      sunDir:        [0.34, 0.78, 0.26],
    },
    // The Speedway is famously, deliberately flat — it was built on Indiana
    // farmland and graded level. Only the faintest movement in the infield.
    elevations: [
      { s: 0.40, halfM: 300, rise: 1.8 },
      { s: 0.68, halfM: 280, rise: -1.5 },
    ],
    hwZones: [
      // The infield section is a normal road course and much narrower than the
      // 15 m oval it joins; hwZones can only narrow, so the 8 m base stays the
      // front straight and the banked Turn 1.
      { s0: 0.240, s1: 0.700, hw: 6.4, ease: 0.020 },
      { s0: 0.760, s1: 0.820, hw: 6.6, ease: 0.012 },
    ],
    bankZones: [
      // Turn 1 IS the oval's banked Turn 1 — 9 degrees, taken flat, and the
      // only real banking on the F1 lap.
      { frac: 0.115, angleDeg: 9.0, widthM: 320 },
      { frac: 0.880, angleDeg: 6.0, widthM: 200 },
    ],
    scenery: function (api) {
      const { out, MAT, n, pyMin, hash, every, along, anchor, vadd, onTrack,
        px, pz, tree, bush, ridge, building, grandstandEx, spectatorHill,
        broadcastCompound, billboard, gantry, marshalPost, motorhome,
        fence, guardrail, tyreWall, groundPatch, modelGroup, prop,
        floodMast, cameraTower, sponsorHoarding,
        addBox, addCyl, addCone, addPrism } = api;
      const K = (s) => Math.round(s * n) % n;

      const LEAF = [0.22, 0.44, 0.20], LEAF_D = [0.16, 0.36, 0.17];
      const CONC = [0.74, 0.73, 0.70];
      const SEAT = [[0.30, 0.42, 0.66], [0.86, 0.86, 0.84], [0.72, 0.20, 0.18]];

      // =====================================================================
      // 1. THE GRANDSTAND WALL — the Speedway's identity. Not a few stands
      //    dotted around a circuit: a CONTINUOUS two-and-three-tier wall of
      //    seating running the entire front straight and both oval turns,
      //    enclosing the track like a stadium. Nothing else on the calendar
      //    looks remotely like this.
      // =====================================================================
      // Outer wall — unbroken along the whole oval portion.
      for (let i = 0; i < 12; i++) {
        const s = 0.86 + i * 0.0283;   // wraps through 0 across the front straight
        grandstandEx(s % 1, 1, 13, 118, null, null, {
          livery: i % 3 === 0 ? "alu" : (i % 3 === 1 ? "concrete" : "darkSteel"),
          tiers: 3, roof: i % 4 === 0 ? "cantilever" : null,
          endWalls: false, pylons: i % 4 === 0,
        });
      }
      // Inner (infield) stands facing back across the front straight.
      for (let i = 0; i < 6; i++) {
        grandstandEx((0.90 + i * 0.030) % 1, -1, 13, 96, null, null, {
          livery: i % 2 ? "alu" : "concrete", tiers: 2, endWalls: false,
        });
      }
      // Terraced seating colour bands — blue/white/red bucket seats are what
      // makes an empty Speedway stand read as a Speedway stand.
      for (let i = 0; i < 22; i++) {
        const s = (0.86 + i * 0.0155) % 1;
        const a = anchor(K(s), 1, 15);
        out._mat = MAT.FABRIC;
        for (let t = 0; t < 3; t++) {
          addBox(out, vadd(vadd(a.c, a.r, t * 2.2), a.u, 4 + t * 2.6),
            [2.0, 0.9, 62], SEAT[(i + t) % 3], [a.r, a.u, a.t]);
        }
        out._mat = 0;
      }

      // =====================================================================
      // 2. THE PAGODA — the Speedway's control tower and the single most
      //    recognisable structure in American motor racing: a stack of
      //    diminishing glass tiers with overhanging eaves, over the start line.
      // =====================================================================
      {
        const a = anchor(K(0.005), -1, 30);
        const b = [a.r, a.u, a.t];
        modelGroup("indy-pagoda", {
          center: vadd(a.c, a.u, 26), size: [26, 58, 30], basis: b,
        }, (stage) => {
          // Solid base housing.
          addBox(stage, vadd(a.c, a.u, 5), [20, 10, 24], [0.80, 0.80, 0.82], b);
          // Five diminishing tiers, each with an overhanging eave — the
          // pagoda profile. Glass band on every tier.
          for (let t = 0; t < 5; t++) {
            const w = 17 - t * 2.2, d = 21 - t * 2.6;
            const y = 12 + t * 8;
            addBox(stage, vadd(a.c, a.u, y), [w, 6, d], [0.34, 0.44, 0.54], b);          // glazing
            addBox(stage, vadd(a.c, a.u, y + 3.6), [w + 3, 0.9, d + 3.4],
              [0.86, 0.86, 0.88], b);                                                    // eave
          }
          // Crowning mast.
          addCyl(stage, vadd(a.c, a.u, 52), 0.5, 10, [0.90, 0.90, 0.92], 8, b);
        }, { required: true });
      }

      // =====================================================================
      // 3. PIT LANE — the Speedway's pit boxes are open-fronted stalls under
      //    one long flat roof on slim posts, NOT the enclosed garage blocks
      //    every road course uses. Built from primitives for that reason.
      // =====================================================================
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

      // The YARD OF BRICKS — the preserved metre of original 1909 paving at
      // the start/finish line. A tiny detail, and the one every broadcast opens
      // with. Alternating brick tones across the track width.
      {
        const a = anchor(K(0.0), 0, 0);
        for (let i = 0; i < 14; i++) {
          const off = (i - 6.5) * 1.15;
          addBox(out, vadd(vadd(a.c, a.r, off), a.u, 0.03), [1.05, 0.06, 1.0],
            i % 2 ? [0.52, 0.28, 0.22] : [0.44, 0.24, 0.19], [a.r, a.u, a.t]);
        }
      }

      // Garage / paddock area in the infield behind the pits.
      for (let i = 0; i < 5; i++) {
        building(K(0.905 + i * 0.014), -1, 42, 26, 10, 20,
          { wall: [0.84, 0.84, 0.84], window: [0.30, 0.34, 0.42], floor: 4.5, roof: true });
      }
      every(46, (k) => {
        const s = k / n, h = hash(k * 71 + 31);
        if (!(s > 0.88 || s < 0.04) || h < 0.55) return;
        motorhome(k, -1, 62 + h * 10, 10, 4, 6, { wall: [0.70 + h * 0.2, 0.70, 0.72] });
      });
      broadcastCompound(K(0.895), -1, 78, { vans: 3, dishes: 2, mastH: 9 });
      for (const s of [0.97, 0.01, 0.04]) billboard(K(s), -1, 10, 14, 5, [0.20, 0.30, 0.60]);

      // =====================================================================
      // 4. THE INFIELD ROAD COURSE — a completely different world from the
      //    oval: low, open, grassy, with modest temporary furniture.
      // =====================================================================
      groundPatch(K(0.300), 1, 5, [26, 0.18, 34], [0.66, 0.62, 0.50],
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

      grandstandEx(0.300, -1, 22, 70, null, null, { livery: "scaffold", endWalls: true });
      grandstandEx(0.520, 1, 22, 66, null, null, { livery: "scaffold", endWalls: true });
      grandstandEx(0.680, -1, 22, 62, null, null, { livery: "alu", endWalls: true });

      // Sparse infield planting — the Speedway's golf course and service roads
      // occupy the middle, so a few ornamental clumps only.
      every(40, (k) => {
        const s = k / n;
        if (s < 0.28 || s > 0.72) return;
        const h = hash(k * 31);
        if (h < 0.55) return;
        tree(k, h < 0.5 ? -1 : 1, 34 + h * 20, 10 + h * 6, h < 0.5 ? LEAF_D : LEAF);
      });

      // =====================================================================
      // 5. BOUNDARIES — the oval has a solid concrete SAFER wall, the infield
      //    has ordinary armco. That contrast is worth showing.
      // =====================================================================
      for (const [s0, s1] of [[0.24, 0.70]]) {
        guardrail(s0, s1, -1, 6, [0.80, 0.81, 0.83]);
        guardrail(s0, s1,  1, 6, [0.80, 0.81, 0.83]);
      }
      // Oval retaining wall — a continuous white concrete barrier, not armco.
      along(0.80, 0.22, 9, (k) => {
        const a = anchor(k, 1, 1.4);
        addBox(out, vadd(a.c, a.u, 1.05), [0.6, 2.1, 9.6], [0.93, 0.93, 0.92], [a.r, a.u, a.t]);
      });
      fence(0.86, 0.18, 1, 12, 5, [0.74, 0.76, 0.80]);
      for (const s of [0.28, 0.36, 0.44, 0.58, 0.66, 0.74]) {
        marshalPost(K(s), hash(K(s)) < 0.5 ? -1 : 1, 8.5);
      }

      // =====================================================================
      // 6. BACKDROP — flat Indiana. No hills at all: a low treeline and the
      //    Speedway's own light towers are the whole horizon.
      // =====================================================================
      const cx = px.reduce((a, b) => a + b, 0) / n, cz = pz.reduce((a, b) => a + b, 0) / n;
      let rad = 0;
      for (let i = 0; i < n; i++) rad = Math.max(rad, Math.hypot(px[i] - cx, pz[i] - cz));
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
      // The Speedway's tall lattice light towers ringing the oval — the tallest
      // things for miles and a fixture of every wide shot. floodMast draws the
      // real article (pole, dual arms, lens bank, ground pool) and guards its own
      // footprint, which a hand-rolled cylinder-and-box pair does neither of.
      for (let i = 0; i < 9; i++) {
        floodMast(K((0.84 + i * 0.042) % 1), 1, 44, { h: 34, cool: true, arms: 3 });
      }
      // Broadcast platforms at the show corners.
      cameraTower(K(0.115), 1, 30, { h: 18 });
      cameraTower(K(0.500), -1, 26, { h: 15 });
    },
  }
  );
})();
