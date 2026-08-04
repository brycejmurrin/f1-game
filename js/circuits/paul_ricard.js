/* Apex 26 — CIRCUIT PAUL RICARD definition (data only).
   Retired circuit (`classic: true`): last French GP 2022.
   Geometry from the OSM trace in js/track/geo-paths.js. */
(function () {
  "use strict";
  (window.TrackDefs = window.TrackDefs || []).push(
  {
    id: "paul_ricard",
    classic: true,
    // Upstream fr-1969 is drawn anti-clockwise, but the Grand Prix lap runs
    // CLOCKWISE, so this trace has to be flipped. The matching entry in
    // RACE_DIRECTION_OVERRIDES (tests/f1-track-accuracy.spec.js) orients the
    // reference the same way so the direction assertion still means something.
    reverse: true,
    // The trace's first vertex opens the pit straight; the 1044 m run at
    // source 0.52-0.70 is the Mistral, not the start. Not GPS-calibrated.
    startFrac: 0.03,
    name: "PAUL RICARD",
    gp: "French GP",
    country: "France",
    night: false,
    theme: "modern",
    lengthKm: 5.8,
    baseHW: 8,
    sceneryCoordinates: "racing",
    terrainOuter: 130,
    dressingExclusions: [
      { kinds: ["foliage", "lamps"], s0: 0.92, s1: 0.10 },  // pits
      // Paul Ricard's blue-and-red painted runoff is enormous and bare; the
      // generic foliage pass has no business standing in it.
      { kind: "foliage", s0: 0.20, s1: 0.44 },
      { kind: "foliage", s0: 0.60, s1: 0.78 },
    ],
    // High Provençal plateau: hard white light, bleached limestone, dry scrub.
    pal: {
      zenith:        [0.22, 0.44, 0.78],
      horizon:       [0.84, 0.82, 0.74],
      sun:           [1.0,  0.97, 0.84],
      sunColor:      [1.0,  0.96, 0.82],
      ambientSky:    [0.54, 0.56, 0.60],
      ambientGround: [0.34, 0.31, 0.24],
      fogColor:      [0.80, 0.78, 0.70],
      grass:         [0.34, 0.40, 0.21],
      runoff:        [0.42, 0.44, 0.62],   // the famous blue-tinted abrasive runoff
      sunDir:        [0.34, 0.78, 0.24],
    },
    // Le Castellet sits on a flat plateau — Paul Ricard is the flattest circuit
    // on this list by some way. Just enough relief to avoid a dead-flat ribbon.
    elevations: [
      { s: 0.30, halfM: 460, rise: 3.0 },
      { s: 0.66, halfM: 420, rise: -3.5 },
      { s: 0.88, halfM: 380, rise: 2.5 },
    ],
    hwZones: [
      { s0: 0.415, s1: 0.455, hw: 6.8, ease: 0.014 },  // Mistral chicane
      { s0: 0.700, s1: 0.745, hw: 6.6, ease: 0.012 },  // Le Beausset
      { s0: 0.880, s1: 0.930, hw: 6.6, ease: 0.012 },  // Pont / Le Village
    ],
    bankZones: [
      { frac: 0.070, angleDeg: 3.0, widthM: 130 },   // Verrerie
      { frac: 0.560, angleDeg: 4.0, widthM: 170 },   // Signes
      { frac: 0.640, angleDeg: 3.5, widthM: 160 },   // Bosch curve
    ],
    scenery: function (api) {
      const { out, n, pyMin, hash, every, anchor, vadd, onTrack, px, pz,
        pine, tree, bush, ridge, building, grandstandEx, spectatorHill,
        broadcastCompound, billboard, gantry, marshalPost, tower, motorhome,
        fence, guardrail, tyreWall, groundPatch, modelGroup, prop,
        addBox, addCyl, addCone, addPrism } = api;
      const K = (s) => Math.round(s * n) % n;

      const PINE = [0.14, 0.30, 0.16], PINE_D = [0.11, 0.24, 0.14];
      const SCRUB = [0.36, 0.40, 0.22], SCRUB_D = [0.30, 0.34, 0.19];
      const BLUE = [0.36, 0.42, 0.66], RED = [0.62, 0.28, 0.26];

      // =====================================================================
      // 1. THE BLUE-AND-RED RUNOFF — Paul Ricard's single most recognisable
      //    feature. Instead of gravel, the whole circuit is ringed by painted
      //    abrasive tarmac: blue on the outside, red closest to the limit.
      //    Painted as ground patches so they read flat, not as scenery.
      // =====================================================================
      for (const [id, s, side, w, l] of [
        ["pr-runoff-verrerie", 0.070, 1, 60, 130],
        ["pr-runoff-mistral", 0.440, -1, 54, 120],
        ["pr-runoff-signes", 0.565, 1, 66, 150],
        ["pr-runoff-beausset", 0.720, -1, 52, 110],
        ["pr-runoff-village", 0.905, 1, 50, 110],
      ]) {
        // Red band nearest the road, blue beyond it.
        groundPatch(K(s), side, 4, [w * 0.35, 0.18, l], RED,
          { id: id + "-red", samples: 8 });
        groundPatch(K(s), side, 4 + w * 0.35, [w * 0.65, 0.18, l * 1.1], BLUE,
          { id: id + "-blue", samples: 8 });
      }

      // =====================================================================
      // 2. PROVENÇAL SCRUB — low aleppo pine and dry brush beyond the runoff.
      //    Kept sparse and far back: the open plateau is the look.
      // =====================================================================
      const openRunoff = (s) =>
        (s >= 0.92 || s <= 0.10) || (s >= 0.20 && s <= 0.44) || (s >= 0.60 && s <= 0.78);
      every(30, (k) => {
        const s = k / n;
        if (openRunoff(s)) return;
        const h = hash(k * 31);
        if (h < 0.45) return;
        pine(k, h < 0.5 ? -1 : 1, 30 + h * 20, 9 + h * 6, h < 0.6 ? PINE : PINE_D);
      });
      every(26, (k) => {
        const h = hash(k * 97 + 23);
        if (h < 0.55) return;
        bush(k, h < 0.72 ? -1 : 1, 26 + h * 14, h < 0.6 ? SCRUB : SCRUB_D);
      });
      every(50, (k) => {
        const s = k / n;
        if (openRunoff(s)) return;
        const h = hash(k * 67 + 17);
        if (h < 0.60) return;
        tree(k, h < 0.5 ? -1 : 1, 56 + h * 30, 8 + h * 5, [0.26, 0.36, 0.20]);
      });

      // =====================================================================
      // 3. PIT COMPLEX — a long modern pit building with the big overhanging
      //    roof and the control tower at the line.
      // =====================================================================
      const pitWall = [0.90, 0.90, 0.88];
      for (let i = 0; i < 9; i++) {
        building(K(0.945 + i * 0.007), 1, 15, 16, 9, 11,
          { wall: pitWall, window: [0.28, 0.32, 0.40], floor: 4.5, roof: true });
      }
      tower(K(0.985), 1, 13, 6, 34, { col: [0.94, 0.94, 0.92], cap: true, capCol: [0.16, 0.30, 0.62], mast: 8 });
      gantry(0.0, 9, [0.15, 0.15, 0.18]);
      gantry(0.965, 8.5, [0.15, 0.15, 0.18]);
      grandstandEx(0.005, -1, 12, 150, null, null,
        { livery: "steel", tiers: 2, roof: "cantilever", suites: true, endWalls: true, pylons: true });
      grandstandEx(0.955, -1, 12, 90, null, null, { livery: "concrete", endWalls: true });
      {
        // s≈0.995, not 0.98: the pit-straight side narrows where the lap folds
        // back on itself earlier along the straight, and an 84 m canopy needs
        // ~30 m of setback there. Here 19 m clears comfortably.
        const a = anchor(K(0.995), 1, 19);
        modelGroup("paul-ricard-pit-canopy", {
          center: vadd(a.c, a.u, 11), size: [13, 1.6, 84], basis: [a.r, a.u, a.t],
        }, (stage) => {
          addBox(stage, vadd(a.c, a.u, 11.2), [12, 0.9, 84], [0.92, 0.92, 0.90], [a.r, a.u, a.t]);
          addBox(stage, vadd(a.c, a.u, 10.3), [11, 0.25, 82], [0.94, 0.90, 0.62], [a.r, a.u, a.t]);
        }, { required: true });
      }
      for (let i = 0; i < 4; i++) {
        building(K(0.918 + i * 0.013), 1, 40, 24, 12, 18,
          { wall: [0.84, 0.84, 0.84], window: [0.30, 0.34, 0.42], floor: 4.5, roof: true });
      }
      every(46, (k) => {
        const s = k / n, h = hash(k * 71 + 31);
        if (!(s > 0.90 || s < 0.05) || h < 0.52) return;
        motorhome(k, 1, 58 + h * 10, 10, 4, 6, { wall: [0.66 + h * 0.24, 0.66, 0.68] });
      });
      broadcastCompound(K(0.908), 1, 76, { vans: 3, dishes: 2, mastH: 9 });
      for (const s of [0.975, 0.01, 0.03]) billboard(K(s), -1, 8, 12, 4.5, [0.20, 0.34, 0.70]);

      // =====================================================================
      // 4. CORNER STANDS — sparse; Paul Ricard's crowd is small and the runoff
      //    pushes every stand a long way back.
      // =====================================================================
      grandstandEx(0.075, 1, 70, 80, null, null, { livery: "steel", endWalls: true });
      grandstandEx(0.565, 1, 76, 76, null, null, { livery: "concrete", endWalls: true });
      grandstandEx(0.910, -1, 62, 70, null, null, { livery: "steel", endWalls: true });
      spectatorHill(0.68, 0.76, 1, 60, { rows: 3, rise: 1.0, depth: 1.8, density: 0.34, step: 9 });
      for (const s of [0.070, 0.560, 0.905]) marshalPost(K(s), -1, 12);
      for (const s of [0.44, 0.72]) marshalPost(K(s), 1, 12);

      // =====================================================================
      // 5. BOUNDARIES — armco sits well beyond the painted runoff.
      // =====================================================================
      for (const [s0, s1] of [[0.11, 0.19], [0.45, 0.59], [0.79, 0.87]]) {
        guardrail(s0, s1, -1, 12, [0.80, 0.81, 0.83]);
        guardrail(s0, s1,  1, 12, [0.80, 0.81, 0.83]);
      }
      guardrail(0.94, 0.06, 1, 5.0, [0.85, 0.85, 0.88]);
      fence(0.95, 0.05, -1, 10, 4, [0.74, 0.76, 0.80]);
      for (const s of [0.15, 0.26, 0.34, 0.50, 0.64, 0.82]) {
        marshalPost(K(s), hash(K(s)) < 0.5 ? -1 : 1, 14);
      }

      // =====================================================================
      // 6. BACKDROP — the limestone massif of the Sainte-Baume beyond the
      //    plateau, with sparse pine on the near ridges.
      // =====================================================================
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

      // =====================================================================
      // 7. BESPOKE IDENTITY — the airfield. Paul Ricard's circuit wraps a live
      //    aerodrome, and the hangars and windsock are visible from the Mistral.
      // =====================================================================
      {
        const a = anchor(K(0.50), 1, 150);
        const b = [a.r, a.u, a.t];
        modelGroup("paul-ricard-aerodrome", {
          center: vadd(a.c, a.u, 6), size: [46, 14, 130], basis: b,
        }, (stage) => {
          // Three curved-roof hangars in a row.
          for (let i = 0; i < 3; i++) {
            const p = vadd(a.c, a.t, (i - 1) * 42);
            addBox(stage, vadd(p, a.u, 4), [26, 8, 32], [0.80, 0.80, 0.78], b);
            addPrism(stage, vadd(p, a.u, 9.6), [27, 3.4, 33], [0.66, 0.68, 0.70], b);
          }
          // Windsock mast at one end.
          const w = vadd(vadd(a.c, a.t, 62), a.r, -14);
          addCyl(stage, w, 0.14, 9, [0.86, 0.86, 0.88], 6, b);
          addCone(stage, vadd(w, a.u, 8.4), 0.9, 2.6, [0.92, 0.44, 0.14], 6, b);
        });
      }
      // Long white pit-lane speed / advertising walls along the straight, the
      // one place Paul Ricard shows colour against all that pale tarmac.
      // Kept at 5 m so they read as trackside hoarding in front of the stand
      // rather than sitting inside its footprint.
      for (const s of [0.965, 0.985, 0.015]) {
        prop(K(s), -1, 5, [1.6, 1.4, 60], [0.92, 0.92, 0.90]);
      }
      // Distance boards down the Mistral — the longest flat-out run on the lap.
      for (let i = 0; i < 4; i++) {
        const a = anchor(K(0.470 + i * 0.014), 1, 9);
        addBox(out, vadd(a.c, a.u, 1.5), [0.18, 1.4, 1.8], [0.94, 0.94, 0.90], [a.r, a.u, a.t]);
        addCyl(out, a.c, 0.09, 1.0, [0.25, 0.25, 0.28], 5, [a.r, a.u, a.t]);
      }
      // Camera/lighting masts.
      for (const [s, side, gap] of [[0.030, -1, 26], [0.565, 1, 84], [0.910, -1, 70]]) {
        const a = anchor(K(s), side, gap);
        addCyl(out, a.c, 0.20, 18, [0.22, 0.22, 0.25], 6, [a.r, a.u, a.t]);
        addBox(out, vadd(a.c, a.u, 18.4), [1.4, 0.6, 2.8], [0.94, 0.92, 0.82], [a.r, a.u, a.t]);
      }
    },
  }
  );
})();
