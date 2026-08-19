/* Apex 26 — CIRCUIT DE NEVERS MAGNY-COURS definition (data only).
   Retired circuit (`classic: true`): last French GP 2008.
   Geometry from the OSM trace in js/track/geo-paths.js. */
(function () {
  "use strict";
  (window.TrackDefs = window.TrackDefs || []).push(
  {
    id: "magny_cours",
    classic: true,
    // Upstream fr-1960 already runs clockwise, matching the racing direction.
    reverse: false,
    startFrac: 0.99,
    name: "MAGNY-COURS",
    gp: "French GP",
    country: "France",
    night: false,
    theme: "green",
    lengthKm: 4.4,
    baseHW: 7.5,
    sceneryCoordinates: "racing",
    terrainOuter: 115,
    dressingExclusions: [
      { kinds: ["foliage"], s0: 0.93, s1: 0.08 },
      { kind: "foliage", s0: 0.40, s1: 0.50 },
    ],
    // Central-French farmland: soft, cool, slightly overcast light over green
    // fields — Magny-Cours never looked exotic and shouldn't here.
    pal: {
      zenith:        [0.32, 0.48, 0.70],
      horizon:       [0.74, 0.76, 0.72],
      sun:           [0.98, 0.96, 0.86],
      sunColor:      [0.98, 0.96, 0.86],
      ambientSky:    [0.50, 0.53, 0.57],
      ambientGround: [0.27, 0.29, 0.22],
      fogColor:      [0.72, 0.74, 0.72],
      grass:         [0.22, 0.44, 0.20],
      sunDir:        [0.42, 0.62, 0.36],
    },
    elevations: [
      { s: 0.24, halfM: 360, rise: 5.0 },
      { s: 0.52, halfM: 340, rise: -6.0 },
      { s: 0.80, halfM: 320, rise: 4.5 },
    ],
    hwZones: [
      { s0: 0.150, s1: 0.195, hw: 6.3, ease: 0.012 },  // Estoril
      { s0: 0.560, s1: 0.600, hw: 6.2, ease: 0.012 },  // Adelaide hairpin
      { s0: 0.900, s1: 0.945, hw: 6.4, ease: 0.012 },  // Lycée
    ],
    bankZones: [
      { frac: 0.060, angleDeg: 3.0, widthM: 110 },
      { frac: 0.400, angleDeg: 3.5, widthM: 130 },
      { frac: 0.780, angleDeg: 3.0, widthM: 120 },
    ],
    scenery: function (api) {
      const { out, MAT, n, pyMin, hash, every, along, anchor, vadd, onTrack, px, pz,
        pine, tree, bush, hedge, ridge, building, grandstandEx, spectatorHill,
        broadcastCompound, billboard, gantry, marshalPost, motorhome,
        fence, guardrail, tyreWall, groundPatch, modelGroup,
        cameraTower, sponsorHoarding, signBoard,
        addBox, addCyl, addCone, addPrism, addFrustum, forestEdge } = api;
      const K = (s) => Math.round(s * n) % n;

      const LEAF = [0.19, 0.44, 0.20], LEAF_D = [0.14, 0.35, 0.17];
      const POPLAR = [0.26, 0.48, 0.24], POPLAR_D = [0.20, 0.40, 0.20];
      const GRAVEL = [0.68, 0.62, 0.46];
      const PLOUGH = [0.36, 0.28, 0.20], STUBBLE = [0.62, 0.56, 0.30];
      const WHEAT = [0.44, 0.50, 0.24], COLZA = [0.72, 0.70, 0.20];
      const PASTURE = [0.26, 0.44, 0.20];
      const RENDER = [0.80, 0.79, 0.74], SLATE = [0.34, 0.35, 0.38];

      const openArea = (s) => (s >= 0.93 || s <= 0.08) || (s >= 0.40 && s <= 0.50);
      const poplar = (k, side, dist, h) => {
        const a = anchor(k, side, dist);
        const b = [a.r, a.u, a.t];
        out._mat = MAT.WOOD;
        addCyl(out, a.c, 0.20, h * 0.22, [0.44, 0.38, 0.30], 5, b);
        out._mat = MAT.FOLIAGE;
        const col = hash(k * 3 + dist) < 0.5 ? POPLAR : POPLAR_D;
        addFrustum(out, vadd(a.c, a.u, h * 0.14), 0.9, 1.5, h * 0.36, col, 6, b);
        addFrustum(out, vadd(a.c, a.u, h * 0.48), 1.5, 0.9, h * 0.34, col, 6, b);
        addCone(out, vadd(a.c, a.u, h * 0.80), 0.95, h * 0.26, col, 6, b);
        out._mat = 0;
      };
      for (const [s0, s1, side, dist, h] of [
        [0.10, 0.30, -1, 30, 17],
        [0.12, 0.32,  1, 34, 16],
        [0.34, 0.40,  1, 30, 18],
        [0.52, 0.62, -1, 32, 17],
        [0.55, 0.66,  1, 36, 16],
        [0.72, 0.88, -1, 30, 18],
        [0.74, 0.90,  1, 34, 17],
      ]) along(s0, s1, 12, (k) => poplar(k, side, dist, h + hash(k) * 1.5));
      every(30, (k) => {
        const s = k / n;
        if (openArea(s)) return;
        const h = hash(k * 31);
        if (h < 0.40) return;
        tree(k, h < 0.5 ? -1 : 1, 12 + h * 10, 11 + h * 7, h < 0.5 ? LEAF_D : LEAF);
      });
      every(48, (k) => {
        const s = k / n;
        if (openArea(s)) return;
        const h = hash(k * 67 + 17);
        if (h < 0.55) return;
        pine(k, h < 0.5 ? -1 : 1, 46 + h * 24, 16 + h * 8, [0.12, 0.30, 0.15]);
      });
      // Field hedges banding the outfield.
      hedge(0.12, 0.30, -1, 34, 3.4, [0.16, 0.34, 0.17]);
      hedge(0.34, 0.52, 1, 36, 3.4, [0.16, 0.34, 0.17]);
      hedge(0.62, 0.84, -1, 34, 3.4, [0.16, 0.34, 0.17]);
      for (const [id, s, side, gap, w, l, col] of [
        ["magny-field-plough-n", 0.20, -1, 74, 130, 190, PLOUGH],
        ["magny-field-wheat-n", 0.26, -1, 210, 150, 210, WHEAT],
        ["magny-field-colza-e", 0.44, 1, 76, 120, 200, COLZA],
        ["magny-field-stubble-e", 0.50, 1, 200, 160, 180, STUBBLE],
        ["magny-field-pasture-s", 0.72, -1, 72, 110, 190, PASTURE],
        ["magny-field-plough-s", 0.78, -1, 190, 150, 220, PLOUGH],
        ["magny-field-wheat-w", 0.90, 1, 96, 120, 170, WHEAT],
        ["magny-field-stubble-w", 0.14, 1, 190, 140, 200, STUBBLE],
        ["magny-field-colza-mid", 0.60, 1, 86, 100, 160, COLZA],
      ]) {
        groundPatch(K(s), side, gap, [w, 0.18, l], col, { id, samples: 9 });
      }
      for (const [s, side, gap] of [[0.20, -1, 84], [0.78, -1, 200]]) {
        for (let i = 0; i < 12; i++) {
          const a = anchor(K(s + (i - 6) * 0.004), side, gap);
          addBox(out, vadd(a.c, a.u, 0.22), [110, 0.09, 1.1],
            [0.30, 0.23, 0.16], [a.r, a.u, a.t]);
        }
      }
      const copse = (k0, side, dist0, cnt) => {
        for (let i = 0; i < cnt; i++) {
          const jk = k0 + (i - (cnt >> 1)) * 2;
          const jd = dist0 + ((i % 3) - 1) * 4 + hash(k0 * 13 + i) * 3;
          const h = 10 + hash(k0 * 7 + i * 5) * 6;
          tree(jk, side, jd, h, hash(k0 + i) < 0.5 ? LEAF : LEAF_D);
        }
      };
      copse(K(0.16), 1, 58, 6);
      copse(K(0.36), -1, 60, 7);
      copse(K(0.66), -1, 54, 6);
      copse(K(0.86), 1, 58, 6);
      groundPatch(K(0.34), -1, 96, [120, 0.18, 170], COLZA,
        { id: "magny-field-colza-n2", samples: 9 });
      groundPatch(K(0.64), -1, 92, [110, 0.18, 160], STUBBLE,
        { id: "magny-field-stubble-e2", samples: 9 });

      // 2. PIT COMPLEX — Magny-Cours was rebuilt in 1991 as the centrepiece of
      //    the Technopôle, a publicly funded motorsport industrial park, and it
      //    was built to look like one: pale render, a shallow CORRUGATED BARREL
      //    VAULT over the whole garage run, blue steel trim, and a squat
      //    two-storey control block instead of a tower. The place was a
      //    business park with a race track attached and never pretended
      //    otherwise, which is exactly why it never looked glamorous.
      //    Bay fractions run 0.985 -> 0.045: s≈0.955-0.975 is the tight
      //    foldback behind the short pit straight and rejects anything longer
      //    than ~16 m inside 40 m of setback.
      for (const [i, s] of [0.985, 0.005, 0.025, 0.045].entries()) {
        const a = anchor(K(s), 1, 17);
        const b = [a.r, a.u, a.t];
        modelGroup(`magny-cours-pit-bay-${i + 1}`, {
          center: vadd(a.c, a.u, 7), size: [24, 16, 40], basis: b,
        }, (stage) => {
          stage._mat = MAT.CONCRETE;
          addBox(stage, vadd(a.c, a.u, 3.6), [14, 7.2, 38], RENDER, b);
          stage._mat = 0;
          addBox(stage, vadd(vadd(a.c, a.r, -7.0), a.u, 2.8), [0.3, 5.0, 34],
            [0.22, 0.23, 0.26], b);                        // garage door band
          stage._mat = MAT.METAL;
          addCyl(stage, vadd(vadd(a.c, a.u, 7.2), a.t, -19), 8.2, 38,
            [0.72, 0.74, 0.78], 10, [a.r, a.t, a.u]);
          for (let rIdx = 0; rIdx < 5; rIdx++) {
            addCyl(stage, vadd(vadd(a.c, a.u, 7.2), a.t, (rIdx - 2) * 9.2),
              8.5, 0.35, [0.30, 0.42, 0.66], 10, [a.r, a.t, a.u]);
          }
          // Blue eaves gutter running the full length on the pit-lane side.
          addBox(stage, vadd(vadd(a.c, a.r, -8.2), a.u, 7.4), [0.6, 0.6, 38],
            [0.24, 0.38, 0.62], b);
          stage._mat = 0;
        }, { required: true });
      }
      // Control block: two low storeys with a flat roof and a blue fascia. No
      // tower — Magny-Cours never had one, and adding one would make it look
      // like every other circuit in this batch.
      {
        const a = anchor(K(0.996), 1, 30);
        const b = [a.r, a.u, a.t];
        modelGroup("magny-cours-control-block", {
          center: vadd(a.c, a.u, 6), size: [18, 16, 30], basis: b,
        }, (stage) => {
          stage._mat = MAT.CONCRETE;
          addBox(stage, vadd(a.c, a.u, 4.5), [12, 9, 26], RENDER, b);
          stage._mat = MAT.GLASS;
          addBox(stage, vadd(vadd(a.c, a.r, -6.1), a.u, 6.6), [0.35, 2.8, 24],
            [0.20, 0.28, 0.38], b);
          stage._mat = MAT.METAL;
          addBox(stage, vadd(a.c, a.u, 9.4), [13.5, 0.6, 27], SLATE, b);
          addBox(stage, vadd(vadd(a.c, a.r, -6.6), a.u, 8.9), [0.5, 0.7, 27],
            [0.24, 0.38, 0.62], b);
          // addCyl is BASE-anchored; the roof cap above tops out at 9.4+0.3=
          // 9.7, so a base of 13 left this mast 3.3 m clear of it (measured
          // via float-audit). Based at 9.5 (0.2 m into the roof) instead.
          addCyl(stage, vadd(vadd(a.c, a.t, 12), a.u, 9.5), 0.10, 8,
            [0.80, 0.80, 0.82], 5, b);
          stage._mat = 0;
        }, { required: true });
      }
      gantry(0.0, 8.5, [0.15, 0.15, 0.18]);
      gantry(0.968, 8.0, [0.15, 0.15, 0.18]);
      grandstandEx(0.005, -1, 11, 150, null, null,
        { livery: "navy", tiers: 2, roof: "flat", suites: true, endWalls: true, pylons: true });
      for (let i = 0; i < 4; i++) {
        building(K(0.925 + i * 0.013), 1, 40, 27, 10, 17,
          { kind: "podium", wall: RENDER, window: [0.32, 0.36, 0.44], floor: 4.5 });
      }
      every(46, (k) => {
        const s = k / n, h = hash(k * 71 + 31);
        if (!(s > 0.90 || s < 0.05) || h < 0.52) return;
        motorhome(k, 1, 56 + h * 10, 10, 4, 6, { wall: [0.64 + h * 0.26, 0.64, 0.66] });
      });
      broadcastCompound(K(0.916), 1, 72, { vans: 3, dishes: 2, mastH: 9 });
      for (const s of [0.975, 0.01, 0.03]) billboard(K(s), -1, 8, 12, 4.5, [0.20, 0.32, 0.66]);

      const vaultStand = (s0, s1, side, gap, opts) => {
        opts = opts || {};
        const rows = opts.rows || 7, rise = opts.rise || 0.8, depth = opts.depth || 1.2;
        const R = opts.span != null ? opts.span : 6.4;
        along(s0, s1, opts.step || 8, (k, spacing) => {
          const a = anchor(k, side, gap);
          const b = [a.r, a.u, a.t], seg = spacing * 0.95;
          out._mat = MAT.CONCRETE;
          for (let r = 0; r < rows; r++) {
            const back = r * depth, up = 0.6 + r * rise;
            addBox(out, vadd(vadd(a.c, a.r, side * back), a.u, up),
              [depth, rise + 0.2, seg], r & 1 ? [0.70, 0.70, 0.68] : [0.64, 0.64, 0.62], b);
            const h = hash(k * 29 + r * 7);
            if (h > 0.42) continue;
            out._mat = MAT.FABRIC;
            addBox(out, vadd(vadd(vadd(a.c, a.r, side * back),
              a.t, (h - 0.21) * seg * 0.8), a.u, up + rise * 0.5 + 0.55),
              [0.55, 1.0, 0.6],
              h < 0.14 ? [0.24, 0.36, 0.66] : h < 0.28 ? [0.88, 0.88, 0.84] : [0.78, 0.30, 0.24], b);
            out._mat = MAT.CONCRETE;
          }
          out._mat = MAT.METAL;
          const backTop = rows * depth;
          const roofY = 1.4 + rows * rise + 2.2;
          for (const f of [0.02, 0.98]) {
            const off = f * backTop;
            addCyl(out, vadd(vadd(a.c, a.r, side * off), a.u, roofY * 0.5),
              0.13, roofY, [0.60, 0.62, 0.66], 5, b);
          }
          // Tie beam across the legs — the "lattice truss" read.
          addBox(out, vadd(vadd(a.c, a.r, side * backTop * 0.5), a.u, roofY - 0.5),
            [backTop * 1.05, 0.16, 0.16], [0.60, 0.62, 0.66], b);
          const bays = 6;
          for (let j = 0; j < bays; j++) {
            const f = (j + 0.5) / bays, cam = (1 - (f * 2 - 1) * (f * 2 - 1)) * R * 0.42;
            addBox(out, vadd(vadd(a.c, a.r, side * (f * backTop * 1.06 - backTop * 0.03)),
              a.u, roofY + cam),
              [backTop * 1.06 / bays + 0.15, 0.28, seg],
              j & 1 ? [0.74, 0.76, 0.80] : [0.70, 0.72, 0.76], b);
          }
          // Blue eaves lip, the same trim as the pit vault and the sheds.
          addBox(out, vadd(vadd(a.c, a.r, -side * backTop * 0.04), a.u, roofY - 0.2),
            [0.4, 0.5, seg], [0.24, 0.38, 0.62], b);
          out._mat = 0;
        });
      };

      groundPatch(K(0.580), 1, 6, [34, 0.18, 44], GRAVEL,
        { id: "magny-adelaide-gravel", samples: 8 });
      tyreWall(0.564, 0.598, 1, 5, [0.86, 0.20, 0.18]);
      vaultStand(0.556, 0.606, -1, 18, { rows: 8 });        // Adelaide hairpin
      marshalPost(K(0.574), -1, 10);

      groundPatch(K(0.172), -1, 5, [26, 0.18, 34], GRAVEL,
        { id: "magny-estoril-gravel", samples: 6 });
      tyreWall(0.158, 0.188, -1, 4, [0.20, 0.40, 0.85]);
      vaultStand(0.152, 0.194, 1, 18, { rows: 6, span: 5.6 });   // Estoril
      marshalPost(K(0.166), 1, 9);

      groundPatch(K(0.920), 1, 5, [24, 0.18, 32], GRAVEL,
        { id: "magny-lycee-gravel", samples: 6 });
      tyreWall(0.906, 0.936, 1, 4, [0.85, 0.78, 0.20]);
      vaultStand(0.902, 0.942, -1, 17, { rows: 7 });        // Lycée, onto the pits
      marshalPost(K(0.914), -1, 9);

      spectatorHill(0.24, 0.34, 1, 15, { rows: 3, rise: 1.0, depth: 1.8, density: 0.38, step: 9 });
      spectatorHill(0.70, 0.80, -1, 15, { rows: 3, rise: 1.0, depth: 1.8, density: 0.38, step: 9 });

      for (const [s0, s1] of [[0.09, 0.15], [0.20, 0.40], [0.46, 0.55], [0.61, 0.89]]) {
        guardrail(s0, s1, -1, 8, [0.80, 0.81, 0.83]);
        guardrail(s0, s1,  1, 8, [0.80, 0.81, 0.83]);
      }
      guardrail(0.94, 0.06, 1, 4.0, [0.85, 0.85, 0.88]);
      fence(0.95, 0.06, -1, 9, 4, [0.74, 0.76, 0.80]);
      for (const s of [0.12, 0.28, 0.36, 0.48, 0.66, 0.84]) {
        marshalPost(K(s), hash(K(s)) < 0.5 ? -1 : 1, 9);
      }

      const cx = px.reduce((a, b) => a + b, 0) / n, cz = pz.reduce((a, b) => a + b, 0) / n;
      let rad = 0;
      for (let i = 0; i < n; i++) rad = Math.max(rad, Math.hypot(px[i] - cx, pz[i] - cz));
      for (const [extra, count, len, w, hMin, hVar, col] of [
        [120, 48, 150, 40, 10, 5, [0.20, 0.40, 0.20]],
        [220, 38, 200, 54, 16, 8, [0.17, 0.35, 0.18]],
        [360, 26, 260, 70, 26, 14, [0.24, 0.34, 0.26]],
      ]) {
        for (let i = 0; i < count; i++) {
          const a = i / count * 6.2832, h = hash(i * 7 + extra);
          const r = rad + extra + h * 34;
          const tx = cx + Math.cos(a) * r, tz = cz + Math.sin(a) * r;
          if (onTrack(tx, tz, 32)) continue;
          ridge(tx, tz, pyMin, a + 1.5708, len, w, hMin + h * hVar, col);
        }
      }

      {
        const a = anchor(K(0.34), 1, 46);
        const b = [a.r, a.u, a.t];
        modelGroup("magny-cours-ferme", {
          center: vadd(a.c, a.u, 8), size: [36, 20, 62], basis: b, required: true,
        }, (stage) => {
          const stone = [0.80, 0.78, 0.70];
          stage._mat = MAT.STONE;
          addBox(stage, vadd(a.c, a.u, 4.5), [12, 9, 26], stone, b);
          stage._mat = 0;
          addPrism(stage, vadd(a.c, a.u, 10.2), [12.4, 3.0, 26.4], SLATE, b);
          const barn = vadd(a.c, a.t, 20);
          stage._mat = MAT.WOOD;
          addBox(stage, vadd(barn, a.u, 4), [14, 8, 14], [0.68, 0.62, 0.54], b);
          stage._mat = MAT.RUST;
          addPrism(stage, vadd(barn, a.u, 9), [14.4, 2.6, 14.4], [0.40, 0.34, 0.30], b);
          stage._mat = MAT.METAL;
          const silo = vadd(vadd(a.c, a.r, -9), a.t, -14);
          addCyl(stage, silo, 2.6, 13, [0.84, 0.84, 0.82], 10, b);
          addCone(stage, vadd(silo, a.u, 13), 2.9, 3, [0.56, 0.56, 0.58], 10, b);
          // A second, squatter silo and the open-sided implement shed beside it.
          const silo2 = vadd(vadd(a.c, a.r, -9), a.t, -21);
          addCyl(stage, silo2, 2.1, 9, [0.78, 0.78, 0.76], 10, b);
          addCone(stage, vadd(silo2, a.u, 9), 2.4, 2.2, [0.52, 0.52, 0.54], 10, b);
          addBox(stage, vadd(vadd(a.c, a.r, 10), a.u, 3.2), [10, 0.4, 20],
            [0.52, 0.50, 0.48], b);
          for (const st of [-9, 0, 9]) {
            addCyl(stage, vadd(vadd(vadd(a.c, a.r, 14), a.t, st), a.u, 1.6),
              0.16, 3.2, [0.46, 0.44, 0.42], 5, b);
          }
          stage._mat = 0;
          // Round bales left out in the yard, which is where they always are.
          for (let i = 0; i < 5; i++) {
            const p = vadd(vadd(a.c, a.r, 6 + (i % 2) * 3), a.t, -26 + i * 3.4);
            addCyl(stage, vadd(p, a.u, 0.8), 0.85, 1.5, [0.76, 0.70, 0.44], 8,
              [a.r, a.t, a.u]);
          }
        });
      }
      {
        const a = anchor(K(0.62), 1, 235);
        const b = [a.r, a.u, a.t];
        modelGroup("magny-cours-bourg", {
          center: vadd(a.c, a.u, 9), size: [40, 30, 110], basis: b,
        }, (stage) => {
          stage._mat = MAT.STONE;
          for (let i = 0; i < 8; i++) {
            const h = hash(i * 11 + 3);
            const p = vadd(vadd(a.c, a.t, (i - 3.5) * 12), a.r, (h - 0.5) * 16);
            const bh = 5 + h * 2.5;
            addBox(stage, vadd(p, a.u, bh / 2), [8 + h * 3, bh, 9 + hash(i * 5) * 4],
              RENDER, b);
            addPrism(stage, vadd(p, a.u, bh), [9 + h * 3, 2.4, 10 + hash(i * 5) * 4],
              SLATE, b);
          }
          // Church: a short nave, a square tower and the spire on top of it.
          const ch = vadd(a.c, a.t, -30);
          addBox(stage, vadd(ch, a.u, 4.5), [10, 9, 18], RENDER, b);
          addBox(stage, vadd(vadd(ch, a.t, -11), a.u, 9), [7, 18, 7], RENDER, b);
          stage._mat = 0;
          addPrism(stage, vadd(ch, a.u, 9), [10.5, 3.0, 18.5], SLATE, b);
          addCone(stage, vadd(vadd(ch, a.t, -11), a.u, 18), 4.6, 13, SLATE, 4, b);
        });
      }
      for (let i = 0; i < 4; i++) {
        const a = anchor(K(0.062 + i * 0.016), 1, 30 + (i % 2) * 16);
        const b = [a.r, a.u, a.t];
        modelGroup(`magny-cours-technopole-${i + 1}`, {
          center: vadd(a.c, a.u, 4), size: [26, 12, 40], basis: b,
        }, (stage) => {
          stage._mat = MAT.CONCRETE;
          addBox(stage, vadd(a.c, a.u, 3.4), [18, 6.8, 34], RENDER, b);
          stage._mat = MAT.METAL;
          addBox(stage, vadd(a.c, a.u, 7.1), [19.5, 0.5, 35], SLATE, b);
          addBox(stage, vadd(vadd(a.c, a.r, -9.4), a.u, 6.6), [0.5, 0.6, 35],
            [0.24, 0.38, 0.62], b);
          stage._mat = 0;
          addBox(stage, vadd(vadd(a.c, a.r, -9.1), a.u, 2.6), [0.3, 4.2, 8],
            [0.24, 0.25, 0.28], b);                       // roller shutter
        });
      }
      // Signage and broadcast towers.
      signBoard(K(0.172), 1, 8, "corner", 5);
      signBoard(K(0.580), -1, 8, "corner", 12);
      signBoard(K(0.920), -1, 8, "corner", 16);
      for (let i = 0; i < 3; i++) signBoard(K(0.530 + i * 0.011), 1, 7.5, "braking", 3 - i);
      sponsorHoarding(0.940, 0.055, -1, 3.4, { h: 1.15, step: 10 });
      cameraTower(K(0.030), -1, 26, { h: 16 });
      cameraTower(K(0.172), 1, 28, { h: 15 });
      cameraTower(K(0.580), -1, 30, { h: 17 });
      cameraTower(K(0.920), -1, 26, { h: 15 });
      for (const [s0, s1] of [[0.1, 0.38], [0.52, 0.91]]) {
        for (const side of [-1, 1])
          forestEdge(s0, s1, side, 26, { density: 0.44, hMin: 9, hMax: 16, pineFrac: 0.05, col: POPLAR_D, col2: LEAF });
      }
    },
  }
  );
})();
