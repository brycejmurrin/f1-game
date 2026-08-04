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
    reverse: false,
    sceneryCoordinates: "racing",
    lengthKm: 5.5,
    baseHW: 7,
    terrainOuter: 56,
    banked: true,
    bankZones: [
      { frac: 0.75, angleDeg: 13.5, widthM: 180 }, // 24% grade = atan(0.24)
      // Ordinary road camber on the rest of the permanent loop — the bullring
      // bowl is the exception, not the rule.
      { frac: 0.0524, angleDeg: 3.0, widthM: 180 },
      { frac: 0.3990, angleDeg: 3.5, widthM: 110 },
      { frac: 0.5711, angleDeg: 3.0, widthM: 90 },
      { frac: 0.6557, angleDeg: 3.0, widthM: 180 },
      { frac: 0.9296, angleDeg: 3.0, widthM: 90 },
    ],
    // The generic city/furniture base layer carries most of the circuit's
    // density — the bespoke IFEMA halls and La Monumental bowl layer on top of
    // it, they don't replace it. Only carve their curated sightlines (the
    // exhibition-hall pit straight and the banked bullring sector); the old
    // road-overlap risk is handled by the guarded emitters, not exclusions.
    dressingExclusions: [
      { kinds: ["city", "foliage"], s0: 0.95, s1: 0.06 },
      { kinds: ["city", "foliage", "lamps", "floodlights"], s0: 0.68, s1: 0.83 },
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
      { t: 180, l: 240, w: 9 }, { t: 0, l: 80 },
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
        ridge, floodMast, tree, bush, hedge,
        billboard, marshalPost, wall, fence, guardrail, tyreWall,
        grandstandEx, cameraTower, broadcastCompound, sponsorHoarding,
      } = api;

      const WHITE = [0.92, 0.93, 0.94];
      const OFFWHITE = [0.86, 0.86, 0.83];
      const GLASS = night ? [0.82, 0.90, 1.00] : [0.60, 0.76, 0.88];
      const DARK_GLASS = [0.30, 0.42, 0.56];
      const CONCRETE = [0.72, 0.73, 0.75];
      const STEEL = [0.46, 0.49, 0.54];
      const STONE = [0.76, 0.70, 0.54];
      const MADRID_RED = [0.58, 0.22, 0.16];
      const ARCADE_DARK = [0.25, 0.14, 0.13];
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
            // Roof bays sit ON the hall (its box spans a.u 0..16). addPrism
            // anchors at its BASE, so 18 left a 2 m gap under every bay.
            const roof = vadd(vadd(a.c, a.t, i * 13), a.u, 16);
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
            // Depth tapers with the tier as well as width. The tiers overlap
            // vertically by design (5.6 tall on a 3.0 rise), so leaving all three
            // at depth 31 put their END faces on one plane -- same facing, zero
            // gap, over the whole overlap. Stepping the depth back reads as an
            // upper tier set in, which is what a real stand does anyway.
            const c = vadd(vadd(a.c, a.r, side * tier * 2.4), a.u, 3.0 + tier * 3.0);
            addBox(stage, c, [17 - tier * 1.8, 5.6, 31 - tier * 1.6], tier === 1 ? CROWD : WHITE, b);
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

      function avenueOffice(id, frac, side, gap, h) {
        venueGroup(id, frac, side, gap, [20, h + 5, 32], false, (stage, a) => {
          const b = basis(a);
          addBox(stage, vadd(a.c, a.u, h * 0.5), [17, h, 29], OFFWHITE, b);
          addBox(stage, vadd(vadd(a.c, a.r, -side * 8.7), a.u, h * 0.56),
            [0.7, h * 0.72, 26], DARK_GLASS, b);
          for (let bay = -2; bay <= 2; bay++) {
            const col = vadd(vadd(a.c, a.t, bay * 5.1), a.r, -side * 9.3);
            addBox(stage, vadd(col, a.u, 3.4), [0.65, 6.8, 0.65], STEEL, b);
          }
          addBox(stage, vadd(vadd(a.c, a.r, -side * 10.0), a.u, 7.1),
            [3.0, 0.7, 29], WHITE, b);
        });
      }

      function monumentalArcade(id, frac, side) {
        venueGroup(id, frac, side, 35, [20, 18, 36], false, (stage, a) => {
          const b = basis(a);
          addBox(stage, vadd(a.c, a.u, 4.5), [17, 9, 33], MADRID_RED, b);
          for (let bay = -3; bay <= 3; bay++) {
            const opening = vadd(vadd(a.c, a.t, bay * 4.2), a.r, -side * 8.7);
            addBox(stage, vadd(opening, a.u, 4.3), [0.7, 5.4, 2.4], ARCADE_DARK, b);
          }
          addBox(stage, vadd(a.c, a.u, 9.5), [18, 1.0, 34], WHITE, b);
          addBox(stage, vadd(a.c, a.u, 12.0), [15, 4.0, 31], CROWD, b);
          addPrism(stage, vadd(a.c, a.u, 15.0), [17, 2.2, 34], WHITE, b);
        });
      }

      // IFEMA's horizontal white exhibition halls frame the pit straight. The
      // real campus is a grid of ~12 giant sheds, so a deeper second rank keeps
      // the venue reading as a campus rather than three isolated boxes.
      ifemaHall("madrid-ifema-hall", 0.975, 1, 32, true);
      ifemaHall("madrid-ifema-hall-east", 0.035, 1, 34, false);
      ifemaHall("madrid-ifema-hall-west", 0.965, -1, 30, false);
      ifemaHall("madrid-ifema-hall-north", 0.945, -1, 38, false);
      ifemaHall("madrid-ifema-hall-northeast", 0.008, -1, 52, false);
      ifemaHall("madrid-ifema-hall-far", 0.075, 1, 42, false);

      // IFEMA's glazed south entrance and alternating roof lanterns make the
      // exhibition campus read as a public venue rather than anonymous sheds.
      venueGroup("madrid-ifema-south-entrance", 0.055, -1, 24,
        [30, 22, 50], false, (stage, a) => {
          const b = basis(a);
          addBox(stage, vadd(a.c, a.u, 6.5), [26, 13, 46], GLASS, b);
          addBox(stage, vadd(vadd(a.c, a.r, 8), a.u, 9.0), [9, 18, 44], WHITE, b);
          for (let i = -2; i <= 2; i++) {
            addPrism(stage, vadd(vadd(a.c, a.t, i * 8.5), a.u, 14.5),
              [25, 2.4, 7.2], i % 2 ? STEEL : WHITE, b);
          }
          addBox(stage, vadd(vadd(a.c, a.r, 14.0), a.u, 7.0),
            [3.0, 1.0, 34], MADRID_RED, b);
        });

      // Barajas backdrop — the venue's single most distinctive real-world fact
      // (it sits minutes from Adolfo Suárez Madrid-Barajas airport) and until
      // now nothing in the file referenced it. Floated far beyond the terrain
      // ribbon like the Sierra ridge below, so it never needs real terrain
      // grounding: a control tower silhouette plus one low-poly airliner on
      // approach, s≈0.02 L per the brief.
      {
        const TOWER_COL = [0.80, 0.81, 0.83];
        const TOWER_GLASS = night ? [0.85, 0.92, 1.00] : [0.55, 0.72, 0.86];
        venueGroup("madrid-barajas-tower", 0.02, -1, 590, [16, 44, 16], false, (stage, a) => {
          const b = basis(a);
          addFrustum(stage, a.c, 5.0, 3.0, 34, TOWER_COL, 8, b);       // tapered shaft
          addBox(stage, vadd(a.c, a.u, 36), [9, 4, 9], TOWER_GLASS, b); // glass cab
          addCyl(stage, vadd(a.c, a.u, 38), 0.35, 6, STEEL, 6, b);      // radar mast
          addBox(stage, vadd(a.c, a.u, 44.4), [1.6, 0.3, 1.6],
            night ? [1.6, 0.2, 0.16] : MADRID_RED, b);                  // beacon
        });

        const AIR_BODY = [0.82, 0.84, 0.87];
        const AIR_TAIL = MADRID_RED;
        venueGroup("madrid-barajas-airliner", 0.024, -1, 640, [40, 180, 40], false, (stage, a) => {
          const alt = 90;
          const centre = vadd(a.c, a.u, alt);
          // Fuselage cylinder: axis swapped onto the tangent so it flies level
          // and horizontal instead of standing on end (addCyl extrudes along
          // its basis[1]/"up" slot — here that's a.t).
          addCyl(stage, vadd(centre, a.t, -17), 1.7, 34, AIR_BODY, 8, [a.u, a.t, a.r]);
          // Wing prisms: one ridge spanning the full wingspan through the
          // fuselage centreline, chord along a.t, thickness along a.u.
          addPrism(stage, vadd(centre, a.u, -0.4), [4.2, 0.9, 26], AIR_BODY, [a.t, a.u, a.r]);
          // Tail fin: a vertical ridge near the tail.
          addPrism(stage, vadd(centre, a.t, -16.6), [0.6, 5.2, 4.2], AIR_TAIL, [a.r, a.u, a.t]);
        });
      }

      // Pit wall & main grandstand (brief s≈0.00 R) — the brief's very first
      // landmark, and until now there was no grandstand() call anywhere in the
      // file. The pit/paddock modules below already occupy side R at gap 8-22,
      // so the main stand is built facing them from the OPPOSITE side of the
      // straight (side L) — fans across from the pits, not stacked on top of
      // them. Two raked tiers + glazed suites + end walls reads as a proper
      // international-broadcast main grandstand instead of a grey slab.
      // Split into two bays rather than one 100 m stand. grandstandEx lays its
      // crowd risers as rigid boxes along ONE node's tangent, so a 100 m span
      // chords across a straight that is not actually straight — props-over-road
      // measured the riser 0.77 m over the tarmac. Two 46 m bays follow the
      // curvature and read as one continuous stand from trackside.
      // Kept to one 52 m bay. grandstandEx lays its crowd risers as rigid boxes
      // along ONE node's tangent, so the original 100 m span chorded across a
      // start "straight" that is not actually straight — props-over-road measured
      // the riser 0.77 m onto the tarmac.
      grandstandEx(0.00, -1, 10, 52, null, null,
        { livery: "steel", tiers: 2, roof: "cantilever", suites: true, endWalls: true, pylons: true });
      // T1 chicane stand, opposite the motorway overpass piers (brief s≈0.08).
      grandstandEx(0.085, -1, 16, 45, null, null,
        { livery: "concrete", tiers: 1, roof: "truss" });
      // El Búnker corner stand overlooking the retaining-wall drop (s≈0.50 L) —
      // terracotta rotates the third STAND_SETS.madrid family in.
      grandstandEx(0.50, -1, 20, 40, null, null,
        { livery: "terracotta", tiers: 1, roof: "flat", endWalls: true });

      // Pits and paddock use bounded, terrain-seated modules rather than one long
      // floating slab that can chord across the start-line curve.
      for (let i = 0; i < 5; i++) {
        urbanBlock(`madrid-pit-${i}`, (0.985 + i * 0.014) % 1, 1, 8,
          12, 9 + (i % 2), 20, i % 2 ? OFFWHITE : WHITE);
      }

      // La Monumental: a CONTINUOUS 270-degree bowl — contiguous 34 m stand
      // bays at ~34 m pitch (0.0062 lap frac) so the ring reads as one
      // unbroken white nested bowl from the aerial and trackside, per the
      // brief's hero-feature note, instead of six isolated bays.
      for (const side of [-1, 1]) {
        let i = 0;
        for (let f = 0.680; f <= 0.845; f += 0.0062, i++) {
          const id = side === 1 && i === 11
            ? "madrid-monumental"
            : `madrid-monumental-${side < 0 ? "l" : "r"}-${i}`;
          monumentalStand(id, f, side, 16, side === 1 && i === 11);
        }
      }
      // A thin Las Ventas-inspired arcade and crowd crown sits behind the white
      // bowl rim, adding Madrid identity without narrowing the banked sightline.
      for (let i = 0; i < 3; i++) {
        monumentalArcade(`madrid-monumental-arcade-${i}`, 0.705 + i * 0.05, 1);
      }
      for (const frac of [0.70, 0.74, 0.78, 0.82]) {
        const k = at(frac);
        floodMast(k, 1, 44, { h: 34, cool: true, pool: false });
        floodMast(k, -1, 44, { h: 34, cool: true, pool: false });
      }

      // Tunnel-mouth colour: the two portals below were thin trusses that read
      // as open spans a car glimpses through, not enclosed tunnel mouths — the
      // fix is a deeper deck plus a darker underside soffit trim (a second,
      // thinner overheadSpan flush against the main slab's underside).
      const TUNNEL_DARK = [0.08, 0.08, 0.10];

      // The motorway bridge is explicit intentional overhead geometry. Supports
      // are separate bounded groups with their feet beyond the road edge.
      overheadSpan({
        id: "madrid-motorway-overpass",
        frac: 0.085,
        clearance: 6.2,
        thickness: 2.0,
        depth: 11,
        supportGap: 2.4,
        supportWidth: 1.2,
        color: CONCRETE,
        required: true,
      });
      overheadSpan({
        id: "madrid-motorway-overpass-soffit",
        frac: 0.085,
        clearance: 6.2,
        thickness: 0.22,
        depth: 10.4,
        supportGap: 2.4,
        supportWidth: 1.2,
        color: TUNNEL_DARK,
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
      // A lightweight IFEMA access bridge marks the return from the permanent
      // loop while retaining generous clearance and narrow off-edge supports.
      overheadSpan({
        id: "madrid-ifema-access-bridge",
        frac: 0.885,
        clearance: 6.4,
        thickness: 1.6,
        depth: 10,
        supportGap: 2.8,
        supportWidth: 0.9,
        color: GLASS,
      });
      overheadSpan({
        id: "madrid-ifema-access-bridge-soffit",
        frac: 0.885,
        clearance: 6.4,
        thickness: 0.22,
        depth: 9.4,
        supportGap: 2.8,
        supportWidth: 0.9,
        color: TUNNEL_DARK,
      });
      for (const side of [-1, 1]) {
        venueGroup(`madrid-overpass-pier-${side}`, 0.085, side, 2.6,
          [1.4, 6.2, 16], false, (stage, a) => {
            addBox(stage, vadd(a.c, a.u, 3.1), [1.2, 6.2, 15], CONCRETE, basis(a));
          });
      }

      // El Búnker's retaining face samples every segment foot against terrain so
      // it follows the climb/drop instead of floating at one endpoint. Widened
      // to f=0.35-0.55 — the elevations table's actual climb/drop range — from
      // the old 0.43-0.54, which only covered the tail end of the real feature.
      const bunkerPts = [];
      // Keep the samples close enough that a segment cannot chord across the
      // curving road between two distant terrain feet.
      for (let f = 0.35; f <= 0.55; f += 0.003)
        bunkerPts.push({ k: at(f), side: 1, dist: 4.5 });
      groundedSegments({
        id: "madrid-el-bunker",
        points: bunkerPts,
        width: 0.9,
        height: 6.5,
        color: CONCRETE,
      });
      // Bunker-slot banding: 2-3 dark horizontal bands partway up the 6.5 m
      // face — the "bunker slot" look the brief names by name, which a single
      // flat CONCRETE wall doesn't deliver. Built the same way groundedSegments
      // does internally (consecutive anchor()-sampled segments), just offset
      // up the face instead of starting at ground level.
      function bunkerSlotBand(yBase, thick, col) {
        const pts = [];
        for (let f = 0.35; f <= 0.55; f += 0.006) pts.push(at(f));
        for (let i = 0; i < pts.length - 1; i++) {
          const a = anchor(pts[i], 1, 4.75);
          const b2 = anchor(pts[i + 1], 1, 4.75);
          const dx = b2.c[0] - a.c[0], dy = b2.c[1] - a.c[1], dz = b2.c[2] - a.c[2];
          const length = Math.hypot(dx, dy, dz) || 0.1;
          const mid = vadd([
            (a.c[0] + b2.c[0]) / 2, (a.c[1] + b2.c[1]) / 2, (a.c[2] + b2.c[2]) / 2,
          ], a.u, yBase + thick / 2);
          addBox(out, mid, [0.35, thick, length], col, basis(a));
        }
      }
      const SLOT_DARK = [0.14, 0.14, 0.15];
      bunkerSlotBand(2.2, 0.5, SLOT_DARK);
      bunkerSlotBand(3.8, 0.5, SLOT_DARK);
      bunkerSlotBand(5.2, 0.5, SLOT_DARK);

      // Compact urban street walls. Each block has complete bounds and remains
      // close enough to sit on the rendered 56 m terrain ribbon.
      // Ranges closed at 0.27-0.30 and 0.65-0.68 (was 0.27/0.30 and 0.65/0.68
      // seams where the city band dropped out and returned) so the urban
      // frontage holds continuously instead of flashing empty for two beats.
      const urbanRanges = [
        [0.11, 0.30, [0.76, 0.73, 0.68]],
        [0.30, 0.48, [0.70, 0.71, 0.72]],
        [0.55, 0.68, [0.72, 0.70, 0.66]],
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

      // Paired colonnaded office fronts define the wide public-road avenue.
      // Their deep setbacks preserve the fast urban-sector braking sightlines.
      for (let i = 0; i < 3; i++) {
        const frac = 0.175 + i * 0.025;
        avenueOffice(`madrid-avenue-left-${i}`, frac, -1, 24, 18 + i * 3);
        avenueOffice(`madrid-avenue-right-${i}`, frac + 0.006, 1, 26, 21 - i * 2);
      }

      // Cuatro Torres forms a restrained skyline cluster behind the urban
      // sector. Widened from 0.335-0.371 (3.6% of the lap — visible for one
      // blink) to 0.30-0.40 so the four towers hold in view for the length of
      // the urban sector instead of flashing past.
      for (let i = 0; i < 4; i++) {
        const frac = 0.30 + i * (0.10 / 3);
        const h = [54, 68, 62, 58][i];
        venueGroup(`madrid-cuatro-torres-${i}`, frac, -1, 38,
          [17, h + 8, 17], false, (stage, a) => {
            const b = basis(a);
            addFrustum(stage, a.c, 7.4, 5.0, h, i === 1 ? GLASS : DARK_GLASS, 6, b);
            addFrustum(stage, vadd(a.c, a.u, h), 5.0, 1.6, 7, GLASS, 6, b);
            addCyl(stage, vadd(a.c, a.u, h + 7), 0.18, 4, STEEL, 5, b);
          });
      }

      // Chamartín-style mid-rises bridge the scale between the avenue and the
      // Cuatro Torres silhouettes, creating a second deterministic depth layer.
      for (let i = 0; i < 9; i++) {
        const frac = 0.275 + i * 0.011;
        const side = i % 2 ? 1 : -1;
        const h = 30 + hash(900 + i * 13) * 18;
        urbanBlock(`madrid-skyline-midrise-${i}`, frac, side, 42 + (i % 2) * 5,
          13 + (i % 3), h, 17, i % 2 ? CONCRETE : OFFWHITE);
      }
      // A second depth rank behind the urban avenue: distant low-rise Madrid
      // rooftops so the skyline doesn't stop dead behind the first row.
      for (let i = 0; i < 8; i++) {
        const frac = 0.12 + i * 0.02;
        const side = i % 2 ? -1 : 1;
        const h = 16 + hash(950 + i * 17) * 12;
        urbanBlock(`madrid-backdrop-${i}`, frac, side, 58 + (i % 3) * 8,
          16 + (i % 4), h, 24, i % 2 ? OFFWHITE : [0.74, 0.71, 0.66]);
      }

      // Modern IFEMA grandstands on the return leg: stepped seating tiers under
      // a white canopy (brief s≈0.90 R), between the pelouse and the pit entry.
      function ifemaStand(id, frac, side) {
        venueGroup(id, frac, side, 14, [18, 17, 30], false, (stage, a) => {
          const b = basis(a);
          for (let tier = 0; tier < 4; tier++) {
            const c = vadd(vadd(a.c, a.r, side * tier * 2.0), a.u, 1.8 + tier * 2.2);
            addBox(stage, c, [12 - tier, 3.6, 27], tier % 2 ? CONCRETE : CROWD, b);
          }
          addBox(stage, vadd(vadd(a.c, a.r, side * 7.6), a.u, 6.2),
            [0.8, 12.4, 27], STEEL, b);
          addPrism(stage, vadd(vadd(a.c, a.r, side * 3.2), a.u, 13.0),
            [16, 2.6, 29], WHITE, b);
        });
      }
      ifemaStand("madrid-ifema-stand-0", 0.893, 1);
      ifemaStand("madrid-ifema-stand-1", 0.902, 1);
      ifemaStand("madrid-ifema-stand-2", 0.911, 1);

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

      // Race-infrastructure furniture — the circuit had almost none. A
      // hoarding run along the front of the new main grandstand, a second run
      // on the back straight, camera towers either side of T1, and one
      // broadcast compound tucked behind the IFEMA paddock.
      sponsorHoarding(0.00, 0.03, -1, 6, { h: 1.3 });
      sponsorHoarding(0.615, 0.645, 1, 6, { h: 1.3 });
      cameraTower(at(0.078), 1, 20, { h: 16 });
      cameraTower(at(0.75), -1, 56, { h: 18 });
      broadcastCompound(at(0.965), -1, 75, { vans: 3, dishes: 2, mastH: 9 });

      // Sparse, deliberate furniture keeps the dry Castilian venue readable.
      hedge(0.12, 0.24, -1, 8, 1.3, OLIVE);
      hedge(0.84, 0.94, 1, 9, 1.3, OLIVE);
      // Castilian scrub fields: sparse olive shrub scatter over the straw
      // plains (brief s≈0.20 L and s≈0.96 L) — clustered, never near the edge.
      for (let i = 0; i < 22; i++) {
        const f = 0.155 + hash(300 + i * 7) * 0.10;
        bush(at(f), -1, 13 + hash(310 + i * 3) * 26, OLIVE);
      }
      for (let i = 0; i < 16; i++) {
        const f = 0.905 + hash(400 + i * 7) * 0.07;
        bush(at(f), -1, 12 + hash(410 + i * 3) * 22, OLIVE);
      }
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

      // Low-detail Sierra de Guadarrama: a hazy blue-grey RIDGE line floated at
      // the horizon floor. Chained prism ridges replace the old green/snow-cone
      // mountains, which read as cartoon volcanoes against the dry plains —
      // the brief wants a low distant blue-grey range, not alpine summits.
      const SIERRA = [0.55, 0.60, 0.66];
      const SIERRA_FAR = [0.61, 0.66, 0.72];
      let cx = 0, cz = 0;
      for (let i = 0; i < n; i++) { cx += px[i]; cz += pz[i]; }
      cx /= n;
      cz /= n;
      let radius = 0;
      for (let i = 0; i < n; i++)
        radius = Math.max(radius, Math.hypot(px[i] - cx, pz[i] - cz));
      for (let i = 0; i < 16; i++) {
        const angle = i / 16 * Math.PI * 2;
        const R = radius + 1150 + hash(i * 3) * 180;
        const along = angle + Math.PI / 2 + (hash(i * 7) - 0.5) * 0.45;
        ridge(
          cx + Math.cos(angle) * R,
          cz + Math.sin(angle) * R,
          pyMin - 1,
          along,
          540 + hash(i * 5) * 260,
          170,
          52 + hash(i * 11) * 58,
          i % 2 ? SIERRA : SIERRA_FAR,
        );
      }
    },
  });
})();
