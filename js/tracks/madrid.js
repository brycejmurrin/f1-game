/* Apex 26 — MADRID / Madring circuit definition. */
(function () {
  "use strict";

  (window.TrackDefs = window.TrackDefs || []).push({
    id: "madrid",
    name: "MADRID",
    gp: "Spanish GP",
    country: "Spain",
    night: false,
    theme: "modern",
    // Hybrid venue: Madrid supplies its own street walls and open permanent-loop
    // armco instead of the engine's unconditional full-lap street barrier.
    street: false,
    flatTerrain: true,
    reverse: false,
    sceneryCoordinates: "racing",
    lengthKm: 5.5,
    baseHW: 7,
    terrainOuter: 56,
    banked: true,
    bankZones: [
      { frac: 0.75, angleDeg: 24, widthM: 180 },
    ],
    // Madrid owns its venue dressing. Generic city blocks and furniture obscure
    // the IFEMA/Monumental sightlines and were the source of the old road overlap.
    dressingExclusions: [
      { kinds: ["city", "foliage", "lamps", "floodlights"], s0: 0, s1: 1 },
    ],
    pal: {
      zenith: [0.30, 0.58, 0.90],
      horizon: [0.78, 0.79, 0.78],
      grass: [0.48, 0.48, 0.29],
      sunDir: [0.121, 0.968, 0.222],
      sun: [1.0, 0.91, 0.70],
      sunColor: [1.0, 0.98, 0.94],
    },
    segs: [
      { t: 0, l: 320 }, { t: 70, l: 70 }, { t: -65, l: 70 },
      { t: 50, l: 120 }, { t: 0, l: 360 }, { t: 90, l: 80 },
      { t: -85, l: 70 }, { t: 90, l: 80 }, { t: 0, l: 140 },
      { t: 180, l: 240, b: 0.42, w: 9 }, { t: 0, l: 80 },
      { t: -60, l: 90, h: 6 }, { t: 70, l: 90, h: -4 },
      { t: -50, l: 80 }, { t: 80, l: 90 }, { t: 60, l: 130 },
    ],
    // El Búnker is the high urban section; the following dip produces Madrid's
    // surveyed ~26 m range while La Monumental remains low and comparatively flat.
    elevations: [
      { s: 0.40, halfM: 520, rise: 18 },
      { s: 0.52, halfM: 360, rise: -8 },
    ],

    scenery: function (api) {
      const {
        out, n, px, pz, hw, pyMin, night, hash, anchor, vadd,
        modelGroup, overheadSpan, groundPatch, groundedSegments,
        addBox, addCyl, addPrism, addFrustum,
        mountain, floodMast, tree, bush, hedge,
        billboard, marshalPost, wall, fence, guardrail, tyreWall,
      } = api;

      const WHITE = [0.92, 0.93, 0.94];
      const OFFWHITE = [0.86, 0.86, 0.83];
      const GLASS = night ? [0.82, 0.90, 1.00] : [0.60, 0.76, 0.88];
      const DARK_GLASS = [0.30, 0.42, 0.56];
      const CONCRETE = [0.72, 0.73, 0.75];
      const STEEL = [0.46, 0.49, 0.54];
      const STONE = [0.76, 0.70, 0.54];
      const STRAW = [0.76, 0.68, 0.45];
      const STRAW_DARK = [0.67, 0.59, 0.39];
      const OLIVE = [0.40, 0.46, 0.28];
      const CROWD = [0.48, 0.25, 0.24];

      const at = (frac) => Math.round(frac * n) % n;
      const basis = (a) => [a.r, a.u, a.t];

      function venueGroup(id, frac, side, gap, size, required, emit) {
        const k = at(frac);
        const a = anchor(k, side, gap + size[0] / 2);
        const center = vadd(a.c, a.u, size[1] / 2);
        return modelGroup(id, { center, size, basis: basis(a) }, (stage) => {
          emit(stage, a, k);
        }, { required: !!required });
      }

      function ifemaHall(id, frac, side, gap, required) {
        venueGroup(id, frac, side, gap, [36, 25, 82], required, (stage, a) => {
          const b = basis(a);
          addBox(stage, vadd(a.c, a.u, 8), [32, 16, 74], WHITE, b);
          addBox(stage, vadd(a.c, a.u, 12.5), [32.4, 2.2, 74.4], GLASS, b);
          for (let i = -2; i <= 2; i++) {
            const roof = vadd(vadd(a.c, a.t, i * 13), a.u, 18);
            addPrism(stage, roof, [31, 3.2, 11], i % 2 ? STEEL : GLASS, b);
          }
          const entrance = vadd(vadd(a.c, a.r, -side * 11), a.u, 6);
          addBox(stage, entrance, [7, 12, 34], GLASS, b);
        });
      }

      function monumentalStand(id, frac, side, gap, required) {
        venueGroup(id, frac, side, gap, [22, 22, 34], required, (stage, a) => {
          const b = basis(a);
          for (let tier = 0; tier < 3; tier++) {
            const c = vadd(vadd(a.c, a.r, side * tier * 2.4), a.u, 3.0 + tier * 3.0);
            addBox(stage, c, [17 - tier * 1.8, 5.6, 31], tier === 1 ? CROWD : WHITE, b);
          }
          addPrism(stage, vadd(vadd(a.c, a.r, side * 4.0), a.u, 13.6),
            [18, 3.2, 33], WHITE, b);
          addBox(stage, vadd(vadd(a.c, a.r, -side * 7.5), a.u, 5.0),
            [1.0, 10, 33], OFFWHITE, b);
        });
      }

      function urbanBlock(id, frac, side, gap, w, h, d, col) {
        venueGroup(id, frac, side, gap, [w + 2, h + 4, d + 2], false, (stage, a) => {
          const b = basis(a);
          addBox(stage, vadd(a.c, a.u, h * 0.36), [w, h * 0.72, d], col, b);
          addBox(stage, vadd(vadd(a.c, a.r, side * 1.2), a.u, h * 0.79),
            [w * 0.72, h * 0.22, d * 0.82], OFFWHITE, b);
          addBox(stage, vadd(vadd(a.c, a.r, -side * (w * 0.5 - 0.3)), a.u, h * 0.48),
            [0.5, h * 0.55, d * 0.88], GLASS, b);
        });
      }

      // IFEMA's horizontal white exhibition halls frame the pit straight.
      ifemaHall("madrid-ifema-hall", 0.975, 1, 32, true);
      ifemaHall("madrid-ifema-hall-east", 0.035, 1, 34, false);
      ifemaHall("madrid-ifema-hall-west", 0.965, -1, 30, false);

      // Pits and paddock use bounded, terrain-seated modules rather than one long
      // floating slab that can chord across the start-line curve.
      for (let i = 0; i < 5; i++) {
        urbanBlock(`madrid-pit-${i}`, (0.985 + i * 0.014) % 1, 1, 8,
          12, 9 + (i % 2), 20, i % 2 ? OFFWHITE : WHITE);
      }

      // La Monumental: short atomic stand bays follow the 270-degree bank without
      // a long roof footprint sweeping across another part of the racing line.
      const standFracs = [0.69, 0.715, 0.74, 0.765, 0.79, 0.815];
      for (const side of [-1, 1]) {
        for (let i = 0; i < standFracs.length; i++) {
          const id = side === 1 && i === 2
            ? "madrid-monumental"
            : `madrid-monumental-${side < 0 ? "l" : "r"}-${i}`;
          monumentalStand(id, standFracs[i], side, 16, side === 1 && i === 2);
        }
      }
      for (const frac of [0.70, 0.74, 0.78, 0.82]) {
        const k = at(frac);
        floodMast(k, 1, 44, { h: 34, cool: true, pool: false });
        floodMast(k, -1, 44, { h: 34, cool: true, pool: false });
      }

      // The motorway bridge is explicit intentional overhead geometry. Supports
      // are separate bounded groups with their feet beyond the road edge.
      overheadSpan({
        id: "madrid-motorway-overpass",
        frac: 0.085,
        clearance: 6.2,
        thickness: 1.4,
        depth: 18,
        supportGap: 2.4,
        supportWidth: 1.2,
        color: CONCRETE,
        required: true,
      });
      overheadSpan({
        id: "madrid-start-gantry",
        frac: 0.0,
        clearance: 6.8,
        thickness: 0.8,
        depth: 1.8,
        supportGap: 2.0,
        color: STEEL,
      });
      for (const side of [-1, 1]) {
        venueGroup(`madrid-overpass-pier-${side}`, 0.085, side, 2.6,
          [1.4, 6.2, 16], false, (stage, a) => {
            addBox(stage, vadd(a.c, a.u, 3.1), [1.2, 6.2, 15], CONCRETE, basis(a));
          });
      }

      // El Búnker's retaining face samples every segment foot against terrain so
      // it follows the 18 m climb instead of floating at one endpoint.
      const bunkerPts = [];
      // Keep the samples close enough that a segment cannot chord across the
      // curving road between two distant terrain feet.
      for (let f = 0.43; f <= 0.54; f += 0.003)
        bunkerPts.push({ k: at(f), side: 1, dist: 4.5 });
      groundedSegments({
        id: "madrid-el-bunker",
        points: bunkerPts,
        width: 0.9,
        height: 6.5,
        color: CONCRETE,
      });

      // Compact urban street walls. Each block has complete bounds and remains
      // close enough to sit on the rendered 56 m terrain ribbon.
      const urbanRanges = [
        [0.11, 0.27, [0.76, 0.73, 0.68]],
        [0.30, 0.48, [0.70, 0.71, 0.72]],
        [0.55, 0.65, [0.72, 0.70, 0.66]],
      ];
      let blockId = 0;
      for (const [s0, s1, col] of urbanRanges) {
        for (let f = s0; f <= s1; f += 0.035) {
          for (const side of [-1, 1]) {
            const h = 12 + hash(blockId * 7 + side) * 16;
            const gap = f > 0.23 && f < 0.28 && side === 1 ? 28 : 18;
            urbanBlock(`madrid-urban-${blockId++}`, f, side, gap,
              14, h, 22, col);
          }
        }
      }

      // Cuatro Torres forms a restrained skyline cluster behind the urban sector.
      for (let i = 0; i < 4; i++) {
        const frac = 0.335 + i * 0.012;
        const h = [54, 68, 62, 58][i];
        venueGroup(`madrid-cuatro-torres-${i}`, frac, -1, 38,
          [17, h + 8, 17], false, (stage, a) => {
            const b = basis(a);
            addFrustum(stage, a.c, 7.4, 5.0, h, i === 1 ? GLASS : DARK_GLASS, 6, b);
            addFrustum(stage, vadd(a.c, a.u, h), 5.0, 1.6, 7, GLASS, 6, b);
            addCyl(stage, vadd(a.c, a.u, h + 7), 0.18, 4, STEEL, 5, b);
          });
      }

      // Warm terrain-conforming plazas and pelouse replace broad flat land boxes.
      for (const [frac, side, gap, col] of [
        [0.20, -1, 10, STRAW], [0.50, 1, 12, STRAW_DARK],
        [0.88, 1, 11, STRAW], [0.93, -1, 12, STONE],
      ]) {
        groundPatch(at(frac), side, gap, [28, 0.24, 48], col, {
          id: `madrid-ground-${frac}-${side}`,
          samples: 5,
        });
      }

      // Hybrid barrier rhythm: street/IFEMA sections are concrete; the permanent
      // Monumental loop uses open armco. Together they register a full-lap boundary.
      for (const side of [-1, 1]) {
        wall(0.86, 0.54, side, 1.8, 1.25, CONCRETE, 0.48);
        guardrail(0.54, 0.86, side, 4.8, [0.80, 0.81, 0.83]);
        fence(0.02, 0.50, side, 3.2, 2.7, [0.58, 0.60, 0.63]);
      }
      tyreWall(0.075, 0.105, 1, 3.2, [0.88, 0.25, 0.18]);
      tyreWall(0.13, 0.16, -1, 3.2, [0.18, 0.38, 0.82]);
      tyreWall(0.49, 0.525, 1, 3.2, [0.92, 0.74, 0.13]);

      // Sparse, deliberate furniture keeps the dry Castilian venue readable.
      hedge(0.12, 0.24, -1, 8, 1.3, OLIVE);
      hedge(0.84, 0.94, 1, 9, 1.3, OLIVE);
      for (const [frac, side] of [
        [0.05, 1], [0.18, -1], [0.34, 1], [0.47, -1],
        [0.59, 1], [0.67, -1], [0.86, 1], [0.94, -1],
      ]) {
        const k = at(frac);
        billboard(k, side, 7.5, 8, 4.2, side > 0 ? [0.88, 0.22, 0.16] : [0.14, 0.42, 0.82]);
        marshalPost(k, -side, 4.5);
        if (frac < 0.50) tree(k, side, 14, 6 + hash(k) * 2.5, OLIVE);
        else bush(k, side, 13, OLIVE);
      }

      // Low-detail Sierra de Guadarrama ring, intentionally grounded at the
      // universal horizon floor rather than pretending to be trackside terrain.
      let cx = 0, cz = 0;
      for (let i = 0; i < n; i++) { cx += px[i]; cz += pz[i]; }
      cx /= n;
      cz /= n;
      let radius = 0;
      for (let i = 0; i < n; i++)
        radius = Math.max(radius, Math.hypot(px[i] - cx, pz[i] - cz));
      for (let i = 0; i < 12; i++) {
        const angle = i / 12 * Math.PI * 2;
        mountain(
          cx + Math.cos(angle) * (radius + 900),
          cz + Math.sin(angle) * (radius + 900),
          pyMin - 1,
          300 + hash(i * 5) * 100,
          90 + hash(i * 11) * 55,
          { seg: 6, seed: i * 19, snowline: 1.2, rock: [0.55, 0.59, 0.65] },
        );
      }
    },
  });
})();
