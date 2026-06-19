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
    lengthKm: 6,
    baseHW: 6,
    pal: { horizon: [0.10, 0.12, 0.22], zenith: [0.04, 0.05, 0.14], sunColor: [0.72, 0.74, 0.88], ambientSky: [0.24, 0.26, 0.36], ambientGround: [0.20, 0.20, 0.28], fogColor: [0.08, 0.10, 0.18], fogDensity: 0.0016 },
    segs: [
      { t: 0, l: 200 }, { t: 90, l: 80 }, { t: -80, l: 70 }, { t: 0, l: 800 }, { t: 90, l: 80 }, { t: 0, l: 400 },
      { t: -70, l: 70 }, { t: 60, l: 60 }, { t: -55, l: 60 }, { t: 60, l: 60 }, { t: 0, l: 600 }, { t: -80, l: 80 },
    ],
    scenery: function (api) {
      const { out, n, place, prop, backdrop, building, tower, wall, billboard, anchor, addBox, addCyl, addFrustum, vadd, hash } = api;
      const K = (s) => Math.round(s * n) % n;

      // ---- Dusk street palette ----
      const SAND = [0.62, 0.50, 0.34];        // Old-City sandstone
      const SAND_LIT = [0.85, 0.62, 0.30];    // uplit sandstone
      const GLASS = [0.20, 0.28, 0.40];       // cool modern glass
      const WIN_WARM = [0.95, 0.88, 0.55];    // warm lit windows
      const WIN_COOL = [0.6, 0.7, 0.95];      // cool lit windows
      const FLAME = [0.95, 0.35, 0.10];       // Flame Towers glow
      const DARK = [0.08, 0.09, 0.13];        // silhouette
      const CONCRETE = [0.30, 0.30, 0.34];

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

      // Floodlight poles / light towers for the night mood, denser around the lap.
      for (let i = 0; i < 24; i++) {
        const k = K(i / 24), side = (i % 2) ? 1 : -1, a = anchor(k, side, 5);
        addCyl(out, a.c, 0.25, 12, [0.22, 0.22, 0.25], 5, [a.r, a.u, a.t]);
        addBox(out, vadd(a.c, a.u, 12), [1.6, 0.5, 0.6], [1.0, 0.95, 0.7], [a.r, a.u, a.t]);
      }

      // Distant dusk-haze silhouette band so the horizon never reads empty — denser,
      // a near-continuous wrap of overlapping silhouette boxes around the whole lap.
      for (let i = 0; i < 22; i++) {
        const k = K(i / 22), side = (i % 2) ? 1 : -1;
        backdrop(k, side, 240 + hash(i * 5) * 160, [30 + hash(i * 7) * 26, 36 + hash(i * 11) * 70, 22], DARK);
      }

      // ===================================================================
      // s 0.00 R near — GOVERNMENT HOUSE: wide ornate twin-tower sandstone
      // box, pit/start backdrop.
      // ===================================================================
      {
        const k = K(0.0);
        place(k, 1, 24, [64, 30, 30], SAND);
        place(k, 1, 24, [66, 6, 32], SAND_LIT);                 // warm uplit base band
        for (const o of [-22, 22]) {                            // twin corner towers
          const a = anchor(k, 1, 24);
          const c = vadd(a.c, a.t, o);
          addBox(out, vadd(c, a.u, 28), [12, 26, 12], SAND, [a.r, a.u, a.t]);
          addBox(out, vadd(c, a.u, 41), [9, 8, 9], SAND_LIT, [a.r, a.u, a.t]);
        }
        building(k, 1, 4, 40, 18, 24, { wall: SAND, window: WIN_WARM, floor: 4.5 });
      }

      // s 0.04 L mid — plaza framed by low civic blocks
      for (let i = 0; i < 3; i++)
        building(K(0.04), -1, 15 + i * 22, 26, 16 + i * 4, 22, { wall: [0.34, 0.33, 0.32], window: WIN_WARM });

      // ===================================================================
      // s 0.12 both near — first 90 squeeze: tall flat grey wall boxes
      // ===================================================================
      for (const side of [-1, 1]) {
        place(K(0.12), side, 6, [6, 22, 40], [0.26, 0.26, 0.30]);
        place(K(0.12), side, 6, [6.2, 5, 40], SAND_LIT);
      }

      // ===================================================================
      // s 0.22 R far — FLAME TOWERS: three tall tapered towers on a raised
      // tier far back, warm-lit window bands + animated flame glow (the icon).
      // ===================================================================
      {
        const k = K(0.22);
        const a = anchor(k, 1, 170);
        const heights = [150, 168, 150];
        for (let t = 0; t < 3; t++) {
          const c = vadd(a.c, a.r, (t - 1) * 42);
          const H = heights[t];
          // tapered tower body
          addFrustum(out, c, 17, 4, H, GLASS, 6, [a.r, a.u, a.t]);
          // warm-lit window bands climbing the flame
          for (let b = 0; b < 6; b++) {
            const fr = b / 6;
            const r = 17 * (1 - fr) + 4 * fr;
            addFrustum(out, vadd(c, a.u, fr * H), r * 1.02, r * 0.78, H * 0.06, b % 2 ? FLAME : WIN_WARM, 6, [a.r, a.u, a.t]);
          }
          // bright flame cap
          addFrustum(out, vadd(c, a.u, H), 4, 0.6, 10, FLAME, 6, [a.r, a.u, a.t]);
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
      for (let p = 0; p < 7; p++) {                                           // continuous crenellated cap + uplit footing
        const k = K(0.36 + p * 0.0285);
        const a = anchor(k, 1, 10);
        addBox(out, vadd(a.c, a.u, 1), [3, 2, 34], SAND_LIT, [a.r, a.u, a.t]);
        for (let j = 0; j < 12; j++)
          addBox(out, vadd(vadd(a.c, a.t, (j - 5.5) * 5), a.u, 9.6), [3, 1.4, 2.6], SAND, [a.r, a.u, a.t]);
      }
      // Dense sandstone old-town behind the rampart: packed flat-roof houses
      // climbing the hill so the Old City reads as a solid mass, not a fence.
      for (let i = 0; i < 9; i++) {
        const k = K(0.37 + (i % 5) * 0.034);
        const tier = 18 + (i % 3) * 16 + Math.floor(i / 5) * 22;
        const h = 9 + hash(i * 7) * 12;
        building(k, 1, tier - (13 + hash(i * 3) * 6) / 2, 13 + hash(i * 3) * 6, h, 13, { wall: i % 3 ? SAND : SAND_LIT, window: WIN_WARM, floor: 4.5 });
      }

      // ===================================================================
      // s 0.42 L+R very near — CASTLE SECTION squeeze (~7.6m): tall close
      // walls both sides, claustrophobic climb.
      // ===================================================================
      wall(0.42, 0.50, -1, 1.5, 11, SAND, 1.4);
      wall(0.42, 0.50, 1, 1.5, 11, SAND, 1.4);
      for (const side of [-1, 1]) {
        const a = anchor(K(0.44), side, 1.5);
        addBox(out, vadd(a.c, a.u, 0.8), [2, 1.4, 18], SAND_LIT, [a.r, a.u, a.t]);
      }

      // ===================================================================
      // s 0.46 R near — crest past castle gate: chunky stone bastion box
      // ===================================================================
      {
        const k = K(0.46);
        place(k, 1, 11, [18, 16, 18], SAND);
        place(k, 1, 11, [19, 4, 19], SAND_LIT);
        const a = anchor(k, 1, 6);
        for (let j = 0; j < 4; j++)
          addBox(out, vadd(vadd(a.c, a.t, (j - 1.5) * 4.5), a.u, 16.6), [3, 1.6, 3], SAND, [a.r, a.u, a.t]);
      }

      // ===================================================================
      // s 0.52 L near — MAIDEN TOWER: stout round stepped sandstone tower
      // ===================================================================
      {
        const k = K(0.52);
        const a = anchor(k, -1, 8);
        addCyl(out, vadd(a.c, a.u, 14), 8, 28, SAND, 10, [a.r, a.u, a.t]);     // main drum
        addCyl(out, vadd(a.c, a.u, 30), 9, 6, SAND_LIT, 10, [a.r, a.u, a.t]);  // uplit stepped crown
        addCyl(out, vadd(a.c, a.u, 4), 9, 8, SAND, 10, [a.r, a.u, a.t]);       // wider stepped base
      }

      // ===================================================================
      // s 0.58 L far — seafront opens: low boulevard rail + palm-row low boxes
      // ===================================================================
      for (let i = 0; i < 3; i++)
        place(K(0.58), -1, 30 + i * 16, [12, 6, 12], [0.14, 0.30, 0.18]);  // low green boxes

      // ===================================================================
      // s 0.65–0.95 — CASPIAN-FRONT straight (~2.2 km): sea void left,
      // sparse lit modern boxes right.
      // ===================================================================
      {
        const a = anchor(K(0.78), -1, 60);
        addBox(out, vadd(a.c, a.u, -1.5), [180, 1, 240], [0.05, 0.07, 0.13], [a.r, a.u, a.t]); // dark Caspian void
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
      // ===================================================================
      for (let i = 0; i < 7; i++) {
        const k = K(0.78 + i * 0.013);
        tower(k, 1, 56 + (i % 3) * 28, 16, 80 + (i % 2) * 50, { col: GLASS, seg: 6, cap: true, capCol: i % 2 ? WIN_COOL : WIN_WARM });
      }

      // ===================================================================
      // s 0.97 both near — braking zone into T1: tyre-wall + barrier boxes
      // ===================================================================
      for (const side of [-1, 1]) {
        const a = anchor(K(0.97), side, 4);
        for (let j = 0; j < 4; j++)
          addCyl(out, vadd(a.c, a.t, (j - 1.5) * 3), 1.0, 0.9, [0.10, 0.10, 0.11], 7, [a.r, a.u, a.t]);
        addBox(out, vadd(a.c, a.u, 1.0), [2, 0.3, 12], side > 0 ? [0.9, 0.2, 0.2] : [0.9, 0.9, 0.92], [a.r, a.u, a.t]);
      }
      billboard(K(0.99), 1, 11, 18, 11, FLAME);
      billboard(K(0.99), -1, 10, 16, 10, WIN_COOL);
    },
  }
  );
})();
