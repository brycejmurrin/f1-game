/* Apex 26 — CIRCUIT DE BARCELONA-CATALUNYA definition (data only). Off-calendar (`classic: true`): the Spanish GP moved to the Madring for 2026, so Catalunya is p… */
(function () {
  "use strict";
  (window.TrackDefs = window.TrackDefs || []).push(
  {
    id: "catalunya",
    classic: true,
    reverse: false,
    // The trace opens on the 700 m main straight, and its first vertex IS the
    // start line — measured, not nudged.
    // Start/finish line. Snapped to the real one: coord 0.2 m off centreline; = trace vertex 0.
    // Was 0.03. That already measured straight (mean |k| 0.00036 over
    // 120 m) — it was on the wrong PART of the lap, not in a corner.
    // See docs/tracks/START-LINES.md.
    startFrac: 0.0000,
    sceneryStartFrac: 0.03,
    name: "CATALUNYA",
    gp: "Spanish GP",
    country: "Spain",
    night: false,
    theme: "modern",
    lengthKm: 4.7,
    baseHW: 7.5,
    sceneryCoordinates: "racing",
    terrainOuter: 115,
    dressingExclusions: [
      { kinds: ["foliage"], s0: 0.92, s1: 0.12 },  // pits + main straight
      { kind: "foliage", s0: 0.42, s1: 0.52 },              // the open infield bowl
    ],
    // Dry Catalan light: hard sun, bleached scrub, dusty ochre runoff.
    pal: {
      zenith:        [0.20, 0.42, 0.76],
      horizon:       [0.80, 0.80, 0.72],
      sun:           [1.0,  0.96, 0.80],
      sunColor:      [1.0,  0.95, 0.78],
      ambientSky:    [0.50, 0.54, 0.60],
      ambientGround: [0.30, 0.27, 0.20],
      fogColor:      [0.76, 0.74, 0.66],
      grass:         [0.30, 0.40, 0.19],
      runoff:        [0.62, 0.48, 0.32],
      sunDir:        [0.40, 0.70, 0.28],
    },
    elevations: [
      { s: 0.18, halfM: 380, rise: 7.0 },    // climb through Renault/Repsol
      { s: 0.44, halfM: 420, rise: 11.0 },   // high ground before Campsa
      { s: 0.62, halfM: 400, rise: -9.0 },   // Campsa drop toward La Caixa
      { s: 0.86, halfM: 360, rise: -6.0 },   // run down to the final chicane
    ],
    hwZones: [
      { s0: 0.290, s1: 0.335, hw: 6.4, ease: 0.012 },  // Seat / Wurth chicane
      { s0: 0.660, s1: 0.705, hw: 6.3, ease: 0.012 },  // La Caixa hairpin
      { s0: 0.905, s1: 0.955, hw: 6.5, ease: 0.012 },  // final chicane complex
    ],
    bankZones: [
      { frac: 0.060, angleDeg: 3.5, widthM: 120 },   // Elf (T1)
      { frac: 0.235, angleDeg: 4.0, widthM: 130 },   // Repsol
      { frac: 0.500, angleDeg: 4.5, widthM: 150 },   // Campsa
      { frac: 0.800, angleDeg: 3.0, widthM: 120 },   // Europcar
    ],
    scenery: function (api) {
      const { out, MAT, n, pyMin, hash, every, along, anchor, vadd, onTrack, px, pz,
        pine, tree, bush, hedge, ridge, building, grandstandEx, spectatorHill,
        broadcastCompound, billboard, gantry, marshalPost, motorhome,
        fence, guardrail, tyreWall, groundPatch, modelGroup,
        floodMast, sailCanopy, sponsorHoarding, seat, groundedSegments,
        addBox, addCyl, addCone } = api;
      const K = (s) => Math.round(s * n) % n;

      const PINE = [0.14, 0.31, 0.16], PINE_D = [0.11, 0.25, 0.14];
      const SCRUB = [0.33, 0.38, 0.20], SCRUB_D = [0.27, 0.32, 0.17];
      const GRAVEL = [0.70, 0.62, 0.46];
      const WHITE = [0.93, 0.92, 0.88], BONE = [0.86, 0.84, 0.78];
      const OCHRE = [0.76, 0.69, 0.55], SHADE = [0.66, 0.63, 0.58];

      function sunTerrace(s0, s1, side, gap, rows, step) {
        const SEATS = [[0.86, 0.85, 0.83], [0.72, 0.30, 0.24], [0.90, 0.78, 0.30]];
        let i = 0;
        along(s0, s1, step || 9, (k, spacing) => {
          const seg = spacing * 0.96;
          for (let t = 0; t < rows; t++) {
            const a = anchor(k, side, gap + t * 3.6);
            const b = [a.r, a.u, a.t];
            const h = 1.8 + t * 2.2;
            addBox(out, vadd(a.c, a.u, h * 0.5), [3.5, h, seg], t & 1 ? BONE : WHITE, b);
            addBox(out, vadd(a.c, a.u, h + 0.65), [2.7, 1.3, seg], SEATS[(i + t) % 3], b);
          }
          i++;
        });
      }

      const openInfield = (s) => (s >= 0.92 || s <= 0.12) || (s >= 0.42 && s <= 0.52);
      every(30, (k) => {
        const s = k / n;
        if (openInfield(s)) return;
        const h = hash(k * 31);
        if (h < 0.42) return;
        pine(k, h < 0.5 ? -1 : 1, 14 + h * 12, 11 + h * 7, h < 0.6 ? PINE : PINE_D);
      });
      every(22, (k) => {
        const s = k / n;
        if (openInfield(s)) return;
        const h = hash(k * 97 + 23);
        if (h < 0.40) return;
        bush(k, h < 0.72 ? -1 : 1, 7 + h * 6, h < 0.6 ? SCRUB : SCRUB_D);
        if (h > 0.80) bush(k, h > 0.90 ? -1 : 1, 13 + h * 8, SCRUB_D);
      });
      every(64, (k) => {
        const s = k / n;
        if (openInfield(s)) return;
        const h = hash(k * 67 + 17);
        if (h < 0.60) return;
        tree(k, h < 0.5 ? -1 : 1, 40 + h * 26, 9 + h * 6, [0.24, 0.36, 0.19]);
      });

      {
        const COLUMN = [0.88, 0.87, 0.84], GLASS = [0.30, 0.42, 0.50];
        for (let i = 0; i < 6; i++) {
          const s = 0.944 + i * 0.011;
          const a = anchor(K(s), 1, 20);
          const b = [a.r, a.u, a.t];
          modelGroup(`catalunya-pit-bay-${i + 1}`, {
            center: vadd(a.c, a.u, 8), size: [24, 16, 30], basis: b,
          }, (stage) => {
            stage._mat = MAT.CONCRETE;
            seat.box(stage, a.c, [16, 0.8, 28], BONE, b);
            addBox(stage, vadd(vadd(a.c, a.r, 2.0), a.u, 4.4), [11, 7.2, 28], WHITE, b);
            stage._mat = MAT.GLASS;
            addBox(stage, vadd(vadd(a.c, a.r, -3.6), a.u, 3.0), [0.5, 4.6, 27], GLASS, b);
            stage._mat = MAT.CONCRETE;
            // Slim columns holding the shade structure off the glass line.
            for (let d = 0; d < 5; d++)
              addCyl(stage, vadd(vadd(a.c, a.r, -6.6), a.t, (d - 2) * 6.4),
                0.24, 10.5, COLUMN, 8, b);
            for (let l = 0; l < 4; l++)
              addBox(stage, vadd(vadd(a.c, a.r, -6.2), a.u, 4.4 + l * 1.9),
                [3.6, 0.28, 29], l & 1 ? BONE : WHITE, b);
            // Roof slab floating above the louvres on a shadow gap.
            addBox(stage, vadd(vadd(a.c, a.r, -2.0), a.u, 11.3), [19, 0.55, 30], WHITE, b);
            addBox(stage, vadd(vadd(a.c, a.r, -11.2), a.u, 11.1), [0.7, 0.9, 30], SHADE, b);
            stage._mat = 0;
          }, { required: true });
        }
        const a = anchor(K(0.985), 1, 13);
        const b = [a.r, a.u, a.t];
        modelGroup("catalunya-race-control", {
          center: vadd(a.c, a.u, 18), size: [10, 44, 12], basis: b,
        }, (stage) => {
          stage._mat = MAT.CONCRETE;
          addBox(stage, vadd(a.c, a.u, 13), [5.0, 26, 7.5], WHITE, b);
          stage._mat = MAT.GLASS;
          addBox(stage, vadd(vadd(a.c, a.r, -2.2), a.u, 24.5), [5.4, 4.6, 9.0],
            [0.16, 0.24, 0.30], b);
          addBox(stage, vadd(vadd(a.c, a.r, -2.4), a.u, 24.5), [5.0, 3.6, 8.0],
            [0.92, 0.86, 0.60], b);
          stage._mat = MAT.CONCRETE;
          addBox(stage, vadd(vadd(a.c, a.r, -2.2), a.u, 27.3), [7.0, 0.6, 10.5], WHITE, b);
          stage._mat = MAT.METAL;
          for (let d = 0; d < 4; d++)
            addBox(stage, vadd(vadd(a.c, a.r, -2.4), a.u, 20.0 + d * 0.7),
              [5.6, 0.35, 8.4], d & 1 ? [0.86, 0.16, 0.14] : [0.92, 0.78, 0.14], b);
          addCyl(stage, vadd(a.c, a.u, 27.6), 0.14, 12, [0.42, 0.43, 0.46], 4, b);
          stage._mat = 0;
        }, { required: true });
      }
      gantry(0.0, 8.5, [0.15, 0.15, 0.18]);
      gantry(0.965, 8.0, [0.15, 0.15, 0.18]);
      grandstandEx(0.005, -1, 11, 180, null, null,
        { livery: "concrete", tiers: 2, roof: "cantilever", suites: true, endWalls: true, pylons: true });
      grandstandEx(0.055, -1, 12, 120, null, null, { livery: "crimson", endWalls: true });
      {
        const winLit = [0.97, 0.88, 0.54];
        // On the stand's back shell rather than inside the seating bowl.
        const a = anchor(K(0.005), -1, 22);
        addBox(out, vadd(a.c, a.u, 10.4), [0.22, 1.5, 160], winLit, [a.r, a.u, a.t]);
      }
      for (let i = 0; i < 4; i++) {
        building(K(0.920 + i * 0.014), 1, 40, 26, 11, 16,
          { kind: "fin", wall: [0.90, 0.89, 0.85], window: [0.34, 0.38, 0.44], floor: 4.5 });
      }
      every(46, (k) => {
        const s = k / n, h = hash(k * 71 + 31);
        if (!(s > 0.90 || s < 0.05) || h < 0.52) return;
        motorhome(k, 1, 58 + h * 10, 10, 4, 6, { wall: [0.64 + h * 0.26, 0.64, 0.66] });
      });
      broadcastCompound(K(0.912), 1, 76, { vans: 3, dishes: 2, mastH: 9 });
      for (const s of [0.975, 0.01, 0.03]) billboard(K(s), -1, 8, 12, 4.5, [0.90, 0.20, 0.16]);

      grandstandEx(0.065, 1, 20, 96, null, null,
        { livery: "orange", tiers: 2, roof: "cantilever", endWalls: true });
      sunTerrace(0.222, 0.262, -1, 19, 5);
      sunTerrace(0.492, 0.522, 1, 21, 5);
      sunTerrace(0.674, 0.708, -1, 19, 6);
      sunTerrace(0.826, 0.868, -1, 19, 6);
      sunTerrace(0.876, 0.912,  1, 18, 5);
      sunTerrace(0.916, 0.948, 1, 17, 5);
      for (const [s, side, gap] of [[0.690, -1, 33], [0.932, 1, 30], [0.845, -1, 33]]) {
        const a = anchor(K(s), side, gap);
        sailCanopy(a.c, [a.r, a.u, a.t],
          { rad: 15, rx: 9, rz: 17, h: 15, col: [0.94, 0.92, 0.86], ribs: 6, thick: 0.4 });
      }
      spectatorHill(0.30, 0.36, 1, 15, { rows: 3, rise: 1.0, depth: 1.8, density: 0.40, step: 9 });

      // Gravel + tyre walls at the heavy-braking corners.
      groundPatch(K(0.065), 1, 6, [40, 0.18, 54], GRAVEL,
        { id: "catalunya-t1-gravel", samples: 8 });
      tyreWall(0.050, 0.085, 1, 5, [0.86, 0.20, 0.18]);
      marshalPost(K(0.070), -1, 10);

      groundPatch(K(0.312), -1, 5, [24, 0.18, 32], GRAVEL,
        { id: "catalunya-chicane-gravel", samples: 6 });
      tyreWall(0.298, 0.328, -1, 4, [0.20, 0.40, 0.85]);
      marshalPost(K(0.315), 1, 9);

      groundPatch(K(0.685), 1, 5, [28, 0.18, 36], GRAVEL,
        { id: "catalunya-lacaixa-gravel", samples: 6 });
      tyreWall(0.668, 0.700, 1, 4, [0.85, 0.78, 0.20]);
      marshalPost(K(0.678), -1, 9);

      groundPatch(K(0.930), -1, 5, [26, 0.18, 34], GRAVEL,
        { id: "catalunya-final-gravel", samples: 6 });
      marshalPost(K(0.925), 1, 9);

      for (const [s0, s1] of [[0.10, 0.28], [0.34, 0.48], [0.53, 0.65], [0.72, 0.89]]) {
        guardrail(s0, s1, -1, 7, [0.80, 0.81, 0.83]);
        guardrail(s0, s1,  1, 7, [0.80, 0.81, 0.83]);
      }
      guardrail(0.94, 0.06, 1, 4.0, [0.85, 0.85, 0.88]);
      fence(0.95, 0.08, -1, 9, 4, [0.74, 0.76, 0.80]);
      fence(0.05, 0.09, 1, 9, 4, [0.74, 0.76, 0.80]);
      fence(0.67, 0.71, -1, 9, 4, [0.74, 0.76, 0.80]);
      for (const s of [0.16, 0.22, 0.40, 0.46, 0.56, 0.78, 0.86]) {
        marshalPost(K(s), hash(K(s)) < 0.5 ? -1 : 1, 8.5);
      }

      const cx = px.reduce((a, b) => a + b, 0) / n, cz = pz.reduce((a, b) => a + b, 0) / n;
      let rad = 0;
      for (let i = 0; i < n; i++) rad = Math.max(rad, Math.hypot(px[i] - cx, pz[i] - cz));
      for (const [extra, count, len, w, hMin, hVar, col] of [
        [130, 30, 150, 46, 14, 9, [0.42, 0.42, 0.26]],   // bleached near ridges
        [230, 26, 195, 60, 24, 14, [0.36, 0.37, 0.25]],
        [360, 22, 240, 74, 40, 24, [0.34, 0.36, 0.32]],  // hazed Montseny massif
      ]) {
        for (let i = 0; i < count; i++) {
          const a = i / count * 6.2832, h = hash(i * 7 + extra);
          const r = rad + extra + h * 34;
          const tx = cx + Math.cos(a) * r, tz = cz + Math.sin(a) * r;
          if (onTrack(tx, tz, 32)) continue;
          ridge(tx, tz, pyMin, a + 1.5708, len, w, hMin + h * hVar, col);
        }
      }

      for (const [s, side, gap] of [
        [0.030, -1, 24], [0.075, 1, 34], [0.245, -1, 30],
        [0.505, 1, 34], [0.700, -1, 36], [0.935, 1, 34],
      ]) floodMast(K(s), side, gap, { h: 40, cool: true, pool: false, arms: 3, light: false });

      for (const [i, s, gap] of [[0, 0.030, 46], [1, 0.045, 34], [2, 0.060, 46]]) {
        const a = anchor(K(s), 1, gap);
        const b = [a.r, a.u, a.t];
        modelGroup(`catalunya-paddock-club-${i + 1}`, {
          center: vadd(a.c, a.u, 7), size: [18, 14, 46], basis: b,
        }, (stage) => {
          stage._mat = MAT.CONCRETE;
          addBox(stage, vadd(a.c, a.u, 4.2), [12, 8.4, 42], WHITE, b);
          addBox(stage, vadd(a.c, a.u, 8.8), [14.5, 0.5, 44], BONE, b);      // roof deck
          stage._mat = MAT.GLASS;
          addBox(stage, vadd(vadd(a.c, a.r, -6.1), a.u, 5.6), [0.35, 2.4, 40],
            [0.34, 0.46, 0.56], b);
          stage._mat = MAT.METAL;
          // Pergola over the deck — every terrace here has one.
          for (let d = 0; d < 6; d++)
            addBox(stage, vadd(vadd(vadd(a.c, a.r, -1.5), a.t, (d - 2.5) * 7), a.u, 11.4),
              [11, 0.18, 0.5], SHADE, b);
          for (const t of [-1, 1])
            addCyl(stage, vadd(vadd(a.c, a.r, -6.8), a.t, t * 17), 0.18, 11.3, BONE, 6, b);
          stage._mat = 0;
        });
      }

      hedge(0.955, 0.045, -1, 16, 3.0, [0.18, 0.36, 0.18]);
      hedge(0.020, 0.075, 1, 15, 2.6, [0.19, 0.37, 0.19]);
      hedge(0.660, 0.715, -1, 15, 2.6, [0.19, 0.37, 0.19]);
      hedge(0.782, 0.822, 1, 15, 2.6, [0.19, 0.37, 0.19]);
      hedge(0.780, 0.820, -1, 15, 2.6, [0.18, 0.36, 0.18]);
      {
        const CYP = [0.13, 0.28, 0.15], CYP_D = [0.10, 0.22, 0.13];
        for (const [s0, side, gap] of [[0.960, -1, 21], [0.028, 1, 20], [0.680, -1, 21],
                                       [0.788, -1, 21], [0.806, 1, 20]]) {
          for (let i = 0; i < 7; i++) {
            const a = anchor(K(s0 + i * 0.006), side, gap + (i & 1) * 2.5);
            const b = [a.r, a.u, a.t];
            const h = 11 + hash(i * 13 + s0 * 100) * 4;
            addCyl(out, a.c, 0.20, h * 0.2, [0.34, 0.26, 0.18], 5, b);
            addCone(out, vadd(a.c, a.u, h * 0.12), 1.2, h * 0.62, i & 1 ? CYP : CYP_D, 6, b);
            addCone(out, vadd(a.c, a.u, h * 0.50), 0.85, h * 0.48, CYP, 6, b);
          }
        }
      }

      for (const [id, s, side, gap, offs] of [
        ["t1", 0.090, 1, 62], ["repsol", 0.215, -1, 58],
        ["campsa", 0.470, 1, 62],
        ["lacaixa", 0.645, -1, 58, [0, 1, 2, 3, 4]],
      ]) {
        const js = offs || [-2, -1, 0, 1, 2];
        for (let t = 0; t < 3; t++) {
          groundedSegments({
            id: `catalunya-terrace-${id}-${t + 1}`,
            points: js.map((j) => ({
              k: K(s + j * 0.010), side, dist: gap + t * 16,
            })),
            width: 11, height: 2.2 + t * 1.6,
            color: t & 1 ? OCHRE : [0.71, 0.66, 0.52],
          });
        }
      }
      // Sponsor boards down the main straight and around Turn 1.
      sponsorHoarding(0.955, 0.100, -1, 6.5, {
        h: 1.25, step: 10,
        palette: [[0.86, 0.16, 0.14], [0.94, 0.93, 0.88], [0.12, 0.32, 0.66], [0.96, 0.78, 0.10]],
      });
    },
  }
  );
})();
