/* Apex 26 — BAKU circuit definition (data only).
   Registered on the global TrackDefs list; consumed by the js/tracks.js engine
   (palette resolved there from `night`, geometry from js/circuits.js or `segs`). */
(function () {
  "use strict";
  (window.TrackDefs = window.TrackDefs || []).push(
  {
    id: "baku",
    name: "BAKU",
    gp: "Azerbaijan GP",
    country: "Azerbaijan",
    night: true,
    theme: "street_night",
    street: true,
    lengthKm: 6,
    baseHW: 6,
    pal: { horizon: [0.10, 0.12, 0.22], zenith: [0.04, 0.05, 0.14], sunColor: [0.72, 0.74, 0.88], ambientSky: [0.24, 0.26, 0.36], ambientGround: [0.20, 0.20, 0.28], fogColor: [0.08, 0.10, 0.18], fogDensity: 0.0016 },
    segs: [
      { t: 0, l: 200 }, { t: 90, l: 80 }, { t: -80, l: 70 }, { t: 0, l: 800 }, { t: 90, l: 80 }, { t: 0, l: 400 },
      { t: -70, l: 70 }, { t: 60, l: 60 }, { t: -55, l: 60 }, { t: 60, l: 60 }, { t: 0, l: 600 }, { t: -80, l: 80 },
    ],
    // Baku's castle section: the old-city hairpin climbs steeply through the
    // medieval walls (~14 m), then the circuit descends back to the corniche level.
    elevations: [{ s: 0.35, halfM: 560, rise: 14 }, { s: 0.58, halfM: 320, rise: -10 }],
    scenery: function (api) {
      const {
        out, n, place, prop, backdrop, groundPlane, building, tower, wall,
        fence, guardrail, tyreWall, grandstand, gantry, marshalPost, billboard,
        palm, anchor, along, every, onTrack, addBox, addCyl, addCone, addPrism,
        addFrustum, vadd, hash,
      } = api;
      const K = (s) => Math.round(s * n) % n;

      // ---- Dusk street palette ----
      const SAND = [0.62, 0.50, 0.34];        // Old-City sandstone
      const SAND_LIT = [0.85, 0.62, 0.30];    // uplit sandstone
      const GLASS = [0.20, 0.28, 0.40];       // cool modern glass
      const WIN_WARM = [0.95, 0.88, 0.55];    // warm lit windows
      const WIN_COOL = [0.6, 0.7, 0.95];      // cool lit windows
      const FLAME = [0.95, 0.35, 0.10];       // Flame Towers glow
      const DARK = [0.08, 0.09, 0.13];        // silhouette
      const DARK2 = [0.11, 0.12, 0.18];       // nearer hazed silhouette
      const CONCRETE = [0.30, 0.30, 0.34];
      const ARMCO = [0.74, 0.76, 0.82];       // steel guardrail
      const FENCE = [0.55, 0.58, 0.66];       // catch-fence mesh
      const SEA = [0.04, 0.06, 0.12];         // dark Caspian water
      const TARMAC_AD = [0.85, 0.20, 0.18];   // red ad accent
      const AZ_BLUE = [0.10, 0.45, 0.78];     // Azerbaijan flag blue

      // ===================================================================
      // Continuous low concrete walls + dark rail lining the whole lap
      // (street circuit, zero runoff). Both sides, kept tight to the edge.
      // ===================================================================
      // Walls line nearly the whole lap; left side skips the Caspian straight
      // (0.62→0.97) where the brief wants an open dark sea void, and the right
      // opens briefly (0.65→0.78) behind the Caspian-front tower cluster.
      wall(0.0, 0.65, 1, 2.0, 1.3, CONCRETE, 0.4);
      wall(0.82, 1.0, 1, 2.0, 1.3, CONCRETE, 0.4);
      wall(0.0, 0.62, -1, 2.0, 1.3, CONCRETE, 0.4);
      wall(0.97, 1.0, -1, 2.0, 1.3, CONCRETE, 0.4);

      // Debris catch-fence behind the concrete walls — the see-through wire mesh
      // that lines real street circuits. Set just beyond the wall clearance so it
      // never reaches the tarmac. Covers the city opening sector, both sides.
      fence(0.0, 0.35, 1, 2.6, 3.4, FENCE);
      fence(0.86, 1.0, 1, 2.6, 3.4, FENCE);
      fence(0.0, 0.32, -1, 2.6, 3.4, FENCE);
      // Armco guardrail on the Caspian straight (right side, behind the wall break).
      guardrail(0.63, 0.96, 1, 3.0, ARMCO);
      // Catch-fence along the Caspian straight, right side (behind the guardrail).
      fence(0.63, 0.95, 1, 4.0, 3.0, FENCE);

      // Floodlight poles / light towers for the night mood, denser around the lap.
      for (let i = 0; i < 22; i++) {
        const k = K(i / 22), side = (i % 2) ? 1 : -1, a = anchor(k, side, 5);
        addCyl(out, a.c, 0.25, 13, [0.22, 0.22, 0.25], 5, [a.r, a.u, a.t]);
        // angled lamp head + warm emissive bulb
        addBox(out, vadd(a.c, a.u, 13), [2.0, 0.5, 0.7], [0.30, 0.30, 0.34], [a.r, a.u, a.t]);
        addBox(out, vadd(vadd(a.c, a.u, 12.7), a.r, side * 0.8), [0.7, 0.4, 0.7], [1.0, 0.95, 0.7], [a.r, a.u, a.t]);
      }

      // Marshal posts spaced around the lap — orange-roofed flag points.
      for (let i = 0; i < 9; i++) marshalPost(K(0.05 + i * 0.105), (i % 2) ? 1 : -1, 3.0);

      // Distant dusk-haze silhouette band so the horizon never reads empty — TWO
      // ranks (near hazed + far dark) forming a near-continuous wrap of city
      // silhouette around the whole lap. onTrack guards against the infield.
      for (let i = 0; i < 24; i++) {
        const k = K(i / 24), side = (i % 2) ? 1 : -1;
        backdrop(k, side, 150 + hash(i * 5) * 90, [26 + hash(i * 7) * 22, 28 + hash(i * 11) * 50, 20], DARK2);
        backdrop(k, side, 280 + hash(i * 13) * 170, [32 + hash(i * 17) * 30, 44 + hash(i * 19) * 90, 24], DARK);
      }

      // ===================================================================
      // s 0.00 R near — GOVERNMENT HOUSE: ornate neoclassical twin-tower
      // sandstone palace, pit/start landmark. Characteristic Baku architecture.
      // ===================================================================
      {
        const k = K(0.0);
        const a = anchor(k, 1, 36);
        const b = [a.r, a.u, a.t];
        // Main palace mass — larger, more ornate
        place(k, 1, 36, [68, 32, 34], SAND);
        // Uplit decorative base band — stronger
        place(k, 1, 37, [70, 8, 36], SAND_LIT);
        // Twin ornamental corner towers (neo-classical style)
        for (const o of [-24, 24]) {
          const c = vadd(a.c, a.t, o);
          // Tower body
          addBox(out, vadd(c, a.u, 26), [14, 28, 14], SAND, b);
          // Tower cap — cupola/dome style
          addBox(out, vadd(c, a.u, 42), [11, 10, 11], SAND_LIT, b);
          addCone(out, vadd(c, a.u, 52), 6, 10, SAND_LIT, 8, b);
        }
        // Central entrance pavilion
        building(k, 1, 6, 42, 20, 26, { wall: SAND, window: WIN_WARM, floor: 4.5 });
        // Decorative gate/portico detail in front
        addBox(out, vadd(a.c, a.u, 2), [48, 6, 3], [0.78, 0.68, 0.50], b);
      }

      // ===================================================================
      // START/FINISH straight — pit complex (R, low), main grandstands +
      // crowd (L), and the start gantry spanning the track.
      // ===================================================================
      // Long low pit garage block on the right, ahead of Government House.
      for (let i = 0; i < 5; i++)
        building(K(0.95 + i * 0.012), 1, 5, 16, 9, 14, { wall: [0.20, 0.21, 0.26], window: WIN_COOL, floor: 3 });
      // Pit wall (low) + pit-lane separator on the right edge of the straight.
      wall(0.94, 0.02, 1, 1.0, 1.0, [0.85, 0.85, 0.88], 0.4);
      // Twin grandstands with crowd on the left of the main straight.
      grandstand(0.985, -1, 4, 70, [0.42, 0.36, 0.40], [0.50, 0.30, 0.34]);
      grandstand(0.05, -1, 4, 60, [0.42, 0.36, 0.40], [0.46, 0.30, 0.36]);
      // Start gantry across the line + a scoring gantry a little later.
      gantry(0.0, 7.5, [0.14, 0.14, 0.18]);
      gantry(0.96, 7.0, [0.14, 0.14, 0.18]);
      // Start-line banner billboards.
      billboard(0.01, 1, 9, 14, 5, FLAME);

      // s 0.04 L mid — plaza framed by low civic blocks + a small fountain plaza
      for (let i = 0; i < 3; i++)
        building(K(0.04), -1, 15 + i * 22, 26, 16 + i * 4, 22, { wall: [0.34, 0.33, 0.32], window: WIN_WARM });
      // plaza monument: slim lit obelisk
      {
        const a = anchor(K(0.045), -1, 12);
        addFrustum(out, vadd(a.c, a.u, 0), 1.4, 0.3, 16, SAND_LIT, 4, [a.r, a.u, a.t]);
      }

      // ===================================================================
      // s 0.12 both near — first 90 squeeze: tall flat grey wall boxes
      // ===================================================================
      for (const side of [-1, 1]) {
        place(K(0.12), side, 6, [6, 22, 40], [0.26, 0.26, 0.30]);
        place(K(0.12), side, 6, [6.2, 5, 40], SAND_LIT);
      }

      // ===================================================================
      // s 0.22 R far — FLAME TOWERS: three iconic tapered towers on a raised
      // tier far back, alternating warm/flame window bands + animated glow.
      // Most recognizable landmark of Baku's skyline — the flaming towers.
      // ===================================================================
      {
        const k = K(0.22);
        const a = anchor(k, 1, 180);
        const heights = [215, 240, 215];   // Approximate real heights (150/168/150 m scale)
        for (let t = 0; t < 3; t++) {
          const c = vadd(a.c, a.r, (t - 1) * 45);
          const H = heights[t];
          // tapered tower body — wider base for stability silhouette
          addFrustum(out, c, 18, 3.5, H, GLASS, 7, [a.r, a.u, a.t]);
          // Animated warm-lit window bands — denser pattern for night presence
          for (let b = 0; b < 8; b++) {
            const fr = b / 8;
            const r = 18 * (1 - fr) + 3.5 * fr;
            const isFlame = b % 2 === 0;
            addFrustum(out, vadd(c, a.u, fr * H), r * 1.04, r * 0.76, H * 0.05, isFlame ? FLAME : WIN_WARM, 7, [a.r, a.u, a.t]);
          }
          // Bright flame cap — conical termination
          addCone(out, vadd(c, a.u, H), 3.5, 16, FLAME, 7, [a.r, a.u, a.t]);
          // Large flame glow panel at the top — wider, more emissive appearance
          addBox(out, vadd(c, a.u, H + 4), [32, 14, 10], [1.0, 0.58, 0.12], [a.r, a.u, a.t]);
        }
      }

      // ===================================================================
      // s 0.30 L mid — mixed modern mid-rise: stacked glass boxes, lit grids
      // ===================================================================
      for (let i = 0; i < 4; i++)
        building(K(0.30), -1, 29 + i * 26, 22, 44 + (i % 2) * 22, 22, { wall: GLASS, window: WIN_COOL, floor: 4 });

      // ===================================================================
      // s 0.36 R near — OLD CITY wall: one CONTINUOUS crenellated sandstone
      // rampart wrapping the whole castle/Maiden-Tower stretch (no gaps),
      // uplit, with a dense packed old-town sprawl rising behind it.
      // ===================================================================
      wall(0.36, 0.56, 1, 10, 9, SAND, 1.2);                                  // unbroken Old City rampart
      // Enhanced crenellated cap with denser merlon pattern and stronger visual presence
      for (let p = 0; p < 10; p++) {
        const k = K(0.36 + p * 0.020);
        const a = anchor(k, 1, 10);
        // uplit footing band at base — stronger, wider
        addBox(out, vadd(a.c, a.u, 1.2), [4.2, 2.5, 40], SAND_LIT, [a.r, a.u, a.t]);
        // Very dense crenellations: narrower spacing for more medieval fortress look
        for (let j = 0; j < 16; j++) {
          const isRaised = j % 2 === 0;
          if (isRaised) {  // merlons (raised sections)
            addBox(out, vadd(vadd(a.c, a.t, (j - 7.5) * 3.6), a.u, 10.2), [2.6, 1.8, 2.0], SAND, [a.r, a.u, a.t]);
          }
          // embrasures (gaps between merlons) — leave open for shooting ports
        }
      }
      // Dense sandstone old-town behind the rampart: packed flat-roof houses
      // climbing the hill so the Old City reads as a solid mass, not a fence.
      // Much higher density for authentic medieval Icherisheher appearance.
      for (let i = 0; i < 24; i++) {
        const k = K(0.36 + (i % 8) * 0.024);
        const tier = 14 + (i % 5) * 12 + Math.floor(i / 8) * 16;
        const h = 6 + hash(i * 7) * 12;
        const w = 8 + hash(i * 5) * 10;
        const d = 9 + hash(i * 11) * 8;
        building(k, 1, tier - w / 2, w, h, d, { wall: i % 2 ? SAND : [0.68, 0.58, 0.42], window: WIN_WARM, floor: 3.2 });
      }
      // Additional foreground tower accents in old town — thicker minarets
      for (let i = 0; i < 5; i++) {
        const a = anchor(K(0.40 + i * 0.028), 1, 30 + hash(i * 13) * 16);
        addCyl(out, vadd(a.c, a.u, 6), 2.0, 16, SAND, 8, [a.r, a.u, a.t]);   // wider tower base
        addBox(out, vadd(a.c, a.u, 23), [4.5, 2.6, 4.5], SAND_LIT, [a.r, a.u, a.t]);  // stronger cap
      }
      // small domes / minaret silhouettes rising over the old town — more prominent
      for (let i = 0; i < 6; i++) {
        const a = anchor(K(0.39 + i * 0.030), 1, 44 + hash(i * 9) * 24);
        addCyl(out, a.c, 1.2, 16 + hash(i) * 10, SAND, 7, [a.r, a.u, a.t]);   // minaret shaft, taller
        addFrustum(out, vadd(a.c, a.u, 16 + hash(i) * 10), 1.8, 0.5, 4, SAND_LIT, 7, [a.r, a.u, a.t]);  // domed cap
      }

      // ===================================================================
      // s 0.42 L+R very near — CASTLE SECTION squeeze (~7.6m): tall close
      // walls both sides, claustrophobic climb with crenellated towers.
      // ===================================================================
      wall(0.42, 0.50, -1, 1.5, 11, SAND, 1.4);
      wall(0.42, 0.50, 1, 1.5, 11, SAND, 1.4);
      for (const side of [-1, 1]) {
        // uplit base band for castle walls
        const a = anchor(K(0.44), side, 1.5);
        addBox(out, vadd(a.c, a.u, 1.0), [2.2, 1.6, 20], SAND_LIT, [a.r, a.u, a.t]);
        // crenellated crown detail (merlon notches)
        for (let j = 0; j < 8; j++) {
          if (j % 2 === 0) {
            addBox(out, vadd(vadd(a.c, a.t, (j - 3.5) * 3.6), a.u, 11.2), [1.8, 1.2, 2.2], SAND, [a.r, a.u, a.t]);
          }
        }
      }
      // Gateway towers flanking the narrowest point
      {
        const a_l = anchor(K(0.46), -1, 1.5);
        const a_r = anchor(K(0.46), 1, 1.5);
        // corner towers
        addCyl(out, vadd(a_l.c, a_l.u, 10), 1.2, 12, SAND, 8, [a_l.r, a_l.u, a_l.t]);
        addCyl(out, vadd(a_r.c, a_r.u, 10), 1.2, 12, SAND, 8, [a_r.r, a_r.u, a_r.t]);
      }

      // ===================================================================
      // s 0.46 R near — crest past castle gate: chunky stone bastion box
      // ===================================================================
      {
        const k = K(0.46);
        place(k, 1, 20, [18, 16, 18], SAND);
        place(k, 1, 21, [19, 4, 19], SAND_LIT);
        const a = anchor(k, 1, 6);
        for (let j = 0; j < 4; j++)
          addBox(out, vadd(vadd(a.c, a.t, (j - 1.5) * 4.5), a.u, 16.6), [3, 1.6, 3], SAND, [a.r, a.u, a.t]);
      }

      // ===================================================================
      // s 0.52 L near — MAIDEN TOWER: iconic round stepped sandstone tower
      // Historic 12th-century structure with distinctive tapered silhouette.
      // ===================================================================
      {
        const k = K(0.52);
        const a = anchor(k, -1, 8);
        // Octagonal stepped base platform
        addCyl(out, vadd(a.c, a.u, 1.5), 11.5, 5, [0.60, 0.48, 0.34], 8, [a.r, a.u, a.t]);
        // Main cylindrical drum (the tower body) — tapers upward
        addCyl(out, vadd(a.c, a.u, 10), 9.5, 28, SAND, 12, [a.r, a.u, a.t]);
        // Intermediate banded section (uplit stonework)
        addFrustum(out, vadd(a.c, a.u, 20), 9.2, 8.8, 5, SAND_LIT, 12, [a.r, a.u, a.t]);
        addFrustum(out, vadd(a.c, a.u, 27), 8.6, 8, 3, SAND, 12, [a.r, a.u, a.t]);
        // Tapered upper tower — graceful cone to the spire
        addCone(out, vadd(a.c, a.u, 38), 7.5, 14, SAND_LIT, 12, [a.r, a.u, a.t]);
        // Decorative roof cap at the spire tip (characteristic feature)
        addBox(out, vadd(a.c, a.u, 52), [2.2, 2.8, 2.2], [0.94, 0.84, 0.64], [a.r, a.u, a.t]);
        // Subtle base platform rim
        addCyl(out, vadd(a.c, a.u, 4), 12, 0.8, [0.72, 0.62, 0.46], 10, [a.r, a.u, a.t]);
      }

      // ===================================================================
      // s 0.58 L far — seafront opens: boulevard promenade + palm row, low
      // landscaped green boxes (the Caspian seaside park).
      // Enhanced waterfront character with landscape terraces and pedestrian walkways.
      // ===================================================================
      // Terraced seafront parks: stacked, descending toward the water
      for (let i = 0; i < 6; i++) {
        const s = 0.58 + i * 0.018;
        const terraceDist = 16 + i * 10;
        place(K(s), -1, terraceDist, [16, 2.8 + i * 0.6, 16], [0.18, 0.32, 0.20]);
      }
      // palm-lined promenade down the seafront straight, left side — denser planting
      for (let i = 0; i < 22; i++) {
        const s = 0.58 + i * 0.018;
        palm(K(s), -1, 8 + (i % 3) * 2, 9 + hash(i * 3) * 3.5, [0.18, 0.44, 0.24]);
      }
      // Ornate promenade balustrade wall between the road and the sea — refined stonework
      wall(0.58, 0.96, -1, 5, 1.4, [0.76, 0.72, 0.64], 0.6);
      // Decorative balusters on the promenade wall — closer spaced for elegance
      for (let i = 0; i < 32; i++) {
        const s = 0.58 + i * 0.0118;
        const a = anchor(K(s), -1, 5.7);
        addCyl(out, vadd(a.c, a.u, 0.7), 0.16, 1.1, [0.80, 0.74, 0.62], 6, [a.r, a.u, a.t]);
      }

      // ===================================================================
      // s 0.65–0.95 — CASPIAN-FRONT straight (~2.2 km): open dark sea left,
      // lit modern skyline right.
      // Enhanced water presence, waterfront piers, and maritime character.
      // ===================================================================
      // Caspian Sea: broad water groundPlanes settled just below grade, left.
      // Multiple panels for continuous water coverage across the long straight.
      groundPlane(K(0.65), -1, 14, [300, 2.4, 340], SEA);
      groundPlane(K(0.75), -1, 14, [320, 2.4, 360], SEA);
      groundPlane(K(0.85), -1, 14, [300, 2.4, 340], SEA);
      groundPlane(K(0.92), -1, 14, [280, 2.4, 320], SEA);
      // Distant boats / breakwater silhouettes far out on the water — more varied
      for (let i = 0; i < 6; i++) {
        const a = anchor(K(0.65 + i * 0.055), -1, 110 + hash(i * 5) * 80);
        // Cargo vessel silhouettes
        addBox(out, vadd(a.c, a.u, 3), [14 + hash(i) * 8, 5 + hash(i * 2) * 3, 3.5], [0.10, 0.12, 0.18], [a.r, a.u, a.t]);
      }
      // Harbor/waterfront architecture: waterfront pavilions and terminal buildings
      for (let i = 0; i < 4; i++) {
        const s = 0.66 + i * 0.075;
        building(K(s), -1, 18, 14, 9, 14, { wall: [0.30, 0.34, 0.42], window: [0.60, 0.70, 0.95], floor: 3 });
      }
      // Pier/breakwater structures extending into the water
      for (let i = 0; i < 3; i++) {
        const s = 0.68 + i * 0.12;
        const a = anchor(K(s), -1, 12);
        addBox(out, vadd(a.c, a.u, 0.5), [2.5, 1.0, 40], [0.55, 0.54, 0.58], [a.r, a.u, a.t]);  // breakwater structure
      }
      // CONTINUOUS modern Caspian-front skyline: a packed unbroken band of lit
      // glass towers right, two rows (front mid-rise + taller back rank) so the
      // sea-side horizon reads as a solid wall of city from 0.63→0.97.
      for (let i = 0; i < 14; i++) {
        const s = 0.63 + i * 0.026;
        building(K(s), 1, 36 + hash(i * 3) * 18 - (18 + hash(i * 5) * 10) / 2, 18 + hash(i * 5) * 10, 50 + hash(i * 9) * 60, 18, { wall: GLASS, window: WIN_COOL, floor: 4 });
        if (i % 2 === 0)                                                       // taller back rank, every other slot
          building(K(s), 1, 80 + hash(i * 13) * 24 - (20 + hash(i * 17) * 12) / 2, 20 + hash(i * 17) * 12, 80 + hash(i * 19) * 70, 20, { wall: GLASS, window: WIN_WARM, floor: 5 });
      }

      // ===================================================================
      // s 0.78–0.86 R mid — cluster of glass Caspian-front towers, cool-blue lit
      // Iconic towers of Baku's modern skyline, each with lit window crown.
      // ===================================================================
      for (let i = 0; i < 9; i++) {
        const k = K(0.77 + i * 0.011);
        const baseW = 14 + (i % 2) * 4;
        const h = 85 + (i % 3) * 45;
        tower(k, 1, 52 + (i % 4) * 24, baseW, h, { col: GLASS, seg: 7, cap: true, capCol: i % 3 ? WIN_COOL : WIN_WARM });
      }

      // Illuminated billboards punctuating the long Caspian straight, right side.
      for (let i = 0; i < 5; i++) {
        billboard(K(0.65 + i * 0.065), 1, 9, 14, 6, i % 2 ? FLAME : AZ_BLUE);
      }

      // ===================================================================
      // s 0.97 both near — braking zone into T1: stacked tyre-wall barriers
      // with conveyor caps + striped barrier boxes.
      // ===================================================================
      tyreWall(0.955, 0.99, 1, 3.0, TARMAC_AD);
      tyreWall(0.955, 0.99, -1, 3.0, [0.9, 0.9, 0.92]);
      for (const side of [-1, 1]) {
        const a = anchor(K(0.97), side, 4);
        addBox(out, vadd(a.c, a.u, 1.0), [2, 0.3, 12], side > 0 ? TARMAC_AD : [0.9, 0.9, 0.92], [a.r, a.u, a.t]);
      }
      billboard(K(0.93), 1, 11, 18, 11, FLAME);
      billboard(K(0.99), -1, 8, 14, 8, WIN_COOL);

      // ================= OLD CITY WALL — denser medieval stone presence =================
      // Extra building() calls with medieval stone palette to thicken the Old City.
      {
        const STONE = [0.58, 0.52, 0.42];
        const oldCityData = [
          [0.41, 1, 28, 10, 10, 14],
          [0.44, 1, 32, 12, 14, 12],
          [0.48, 1, 24, 14,  8, 16],
          [0.51, 1, 36,  9, 18, 10],
        ];
        for (const [s, side, dist, w, h, d] of oldCityData) {
          building(K(s), side, dist, w, h, d, { wall: STONE, window: WIN_WARM, floor: 3 });
        }
      }

      // ================= PALACE OF THE SHIRVANSHAHS cluster (s≈0.50) =================
      // Low distinctive stone complex with crenellated parapet strips on top.
      // Enhanced with ornate towers and stronger architectural presence.
      {
        const PALACE = [0.72, 0.66, 0.54];
        const PALACE_DARK = [0.62, 0.56, 0.44];
        const k = K(0.50);
        // Main palace structure
        building(k, 1, 44, 22, 10, 28, { wall: PALACE, window: WIN_WARM, floor: 2 });
        // Enhanced crenellated parapet — denser merlon pattern
        const a = anchor(k, 1, 44), b = [a.r, a.u, a.t];
        for (let j = 0; j < 8; j++) {
          if (j % 2 === 0) {
            addBox(out, vadd(vadd(a.c, a.t, (j - 3.5) * 3.8), a.u, 10.8), [2.5, 1.8, 2.5], PALACE, b);
          }
        }
        // ornamental turrets at corners
        addCyl(out, vadd(vadd(a.c, a.t, -13), a.u, 9), 2.2, 8, PALACE_DARK, 8, b);
        addCyl(out, vadd(vadd(a.c, a.t, 13), a.u, 9), 2.2, 8, PALACE_DARK, 8, b);
        // flanking smaller wing building (east)
        building(K(0.505), 1, 36, 12, 7, 16, { wall: PALACE, window: WIN_WARM, floor: 2 });
        // ornamental archway detail on main façade
        addBox(out, vadd(a.c, a.u, 4), [20, 3, 1.5], [0.82, 0.76, 0.64], b);
      }

      // ================= CASPIAN SEA — additional groundPlane at harbour section =================
      // Supplement the existing sea planes with a more prominent water panel.
      groundPlane(K(0.68), -1, 18, [300, 2, 260], [0.12, 0.18, 0.28]);

      // ================= URBAN CANYON density — modern city sections =================
      // Taller buildings at s=0.0–0.20 and s=0.80–1.0 to tighten the street canyon.
      // Replaced place() with building() to properly respect track boundaries.
      {
        const CITY_GLASS = [0.30, 0.40, 0.55];
        const cityHeights = [40, 55, 70, 60, 80, 45, 65];
        for (let i = 0; i < 7; i++) {
          const s = 0.02 + i * 0.025;
          // Use building() with gap parameter instead of place() with distance
          building(K(s), -1, 16 + (i % 3) * 14, 14 + (i % 2) * 4, cityHeights[i], 14,
            { wall: GLASS, window: [0.32, 0.42, 0.52], floor: 4 });
        }
        // Right-side Caspian-front towers already handled in main section; skip duplication
      }

      // ================= SEAFRONT BILLBOARD (s≈0.15, Azeri colours) =================
      billboard(K(0.15), -1, 20, 14, 5, [0.85, 0.35, 0.10]);
    },
  }
  );
})();
