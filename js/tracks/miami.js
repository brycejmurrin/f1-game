/* Apex 26 — MIAMI circuit definition (data only).
   Registered on the global TrackDefs list; consumed by the js/tracks.js engine
   (palette resolved there from `night`, geometry from js/circuits.js or `segs`). */
(function () {
  "use strict";
  (window.TrackDefs = window.TrackDefs || []).push(
  {
    id: "miami",
    name: "MIAMI",
    gp: "Miami GP",
    country: "USA",
    night: false,
    theme: "modern",
    lengthKm: 5.4,
    baseHW: 7,
    pal: { zenith: [0.22, 0.5, 0.88], horizon: [0.74, 0.8, 0.86], grass: [0.28, 0.5, 0.2], runoff: [0.56, 0.48, 0.34], fogDensity: 0.001, sunDir: [0.3131803839972462, 0.7933903061263571, 0.521967306662077], sun: [1, 0.96, 0.82], sunColor: [1, 0.94, 0.8] },
    segs: [
      { t: 0, l: 300 }, { t: -60, l: 80 }, { t: 65, l: 70 }, { t: 0, l: 200 }, { t: 80, l: 90 }, { t: -90, l: 100 },
      { t: 70, l: 80 }, { t: 0, l: 400 }, { t: -80, l: 90 }, { t: 80, l: 90 }, { t: 0, l: 240 },
    ],
    scenery: function (api) {
      const {
        out, n, place, prop, backdrop, groundPlane, grandstand, building,
        billboard, palm, fence, wall, anchor, addBox, addCyl, vadd, hash,
      } = api;
      const K = (s) => Math.round(s * n) % n;

      // ---- Miami pastel palette (bright tropical day) ----
      const TEAL = [0.20, 0.80, 0.78];
      const CORAL = [1.0, 0.55, 0.45];
      const PINK = [1.0, 0.65, 0.80];
      const WHITE = [0.94, 0.95, 0.96];
      const GREYWHITE = [0.80, 0.82, 0.84];
      const PALM_GREEN = [0.20, 0.55, 0.25];
      const PALM_DARK = [0.16, 0.45, 0.20];
      const GLASS = [0.55, 0.72, 0.78];
      const CONCRETE = [0.70, 0.70, 0.72];
      const PASTELS = [TEAL, CORAL, PINK, [0.75, 0.90, 1.0], [1.0, 0.85, 0.55]];

      // ===================================================================
      // CONTINUOUS pastel Miami skyline — a dense, gapless band of pastel
      // backdrop boxes wrapping nearly the whole lap on BOTH sides, pushed
      // far back so nothing walls in the camera. No mountains.
      // ===================================================================
      // Far hazed band: lower, softer, even further back (depth layer 1).
      for (let i = 0; i < 120; i++) {
        const k = K(i / 120);
        const side = (i % 2) ? 1 : -1;
        const col = PASTELS[i % PASTELS.length];
        backdrop(k, side, 420 + hash(i * 5) * 220,
          [26 + hash(i * 3) * 22, 20 + hash(i * 11) * 38, 24],
          [col[0] * 0.62 + 0.32, col[1] * 0.62 + 0.32, col[2] * 0.62 + 0.32]);
      }
      // Mid skyline band: taller, brighter, closer (depth layer 2). Continuous
      // — every node both sides, varied heights, no gaps.
      for (let i = 0; i < 132; i++) {
        const k = K(i / 132);
        const side = (i % 2) ? 1 : -1;
        const col = PASTELS[(i * 3 + 1) % PASTELS.length];
        const hh = 24 + hash(i * 7) * 70;
        backdrop(k, side, 240 + hash(i * 9) * 150,
          [20 + hash(i * 13) * 18, hh, 22],
          [col[0] * 0.72 + 0.22, col[1] * 0.72 + 0.22, col[2] * 0.72 + 0.22]);
      }
      // Near pastel high-rises: actual building()s forming the foreground city
      // skyline as a continuous ring — varied heights, bright tropical pastels.
      for (let i = 0; i < 80; i++) {
        const k = K(i / 80 + 0.003);
        const side = (i % 2) ? 1 : -1;
        const col = PASTELS[(i * 2 + 3) % PASTELS.length];
        const h = 22 + hash(i * 17) * 64;
        building(k, side, 150 + hash(i * 23) * 90 - (14 + hash(i * 5) * 8) / 2, 14 + hash(i * 5) * 8,
          h, 14 + hash(i * 29) * 6,
          { wall: col, window: GLASS, floor: 5 + (i % 3) });
      }

      // ===================================================================
      // s 0.00 R near — HARD ROCK STADIUM: huge curved bowl as a tiered ring
      // of grey-white boxes with coral/teal rim accents. Hero landmark.
      // ===================================================================
      {
        const k = K(0.0);
        const a = anchor(k, 1, 36);
        const RING = 18, segC = 26;
        for (let i = 0; i < segC; i++) {
          // wrap a half-bowl facing the track (angles -100°..+100°)
          const ang = (-1 + 2 * (i / (segC - 1))) * 1.75;
          const off = Math.sin(ang) * RING * 3.2;          // along the track
          const depth = (Math.cos(ang) * 0.5 + 0.5) * RING; // bowl curve away
          const c = vadd(vadd(a.c, a.t, off), a.r, depth);
          const h = 24 + Math.cos(ang) * 6;
          // tiered seating bank
          addBox(out, vadd(c, a.u, h / 2), [14, h, 11], GREYWHITE, [a.r, a.u, a.t]);
          // upper grey-white shell tier
          addBox(out, vadd(c, a.u, h + 4), [13, 8, 9], WHITE, [a.r, a.u, a.t]);
          // coral/teal rim accent crowning the bowl
          addBox(out, vadd(c, a.u, h + 9), [13.4, 2.2, 9.4],
            (i % 2) ? CORAL : TEAL, [a.r, a.u, a.t]);
        }
      }

      // s 0.00 L near — pit/paddock: long low flat white box block, glass faces
      {
        const k = K(0.0);
        place(k, -1, 24, [22, 9, 120], WHITE);
        place(k, -1, 14, [1.0, 6, 116], GLASS);   // glass-grey face band
        place(k, -1, 24, [22.4, 1.5, 120], GREYWHITE); // flat roof cap
      }
      // palms lining the pit straight, both sides
      for (let i = 0; i < 10; i++) {
        palm(K(0.0 + i * 0.007), -1, 9 + (i % 2) * 4, 8 + hash(i) * 4, PALM_GREEN);
        palm(K(0.0 + i * 0.007), 1, 40 + (i % 2) * 6, 9 + hash(i * 5) * 4, PALM_DARK);
      }

      // ===================================================================
      // s 0.06 R mid — T1 grandstand: tiered seating + bright crowd flecks
      // ===================================================================
      grandstand(0.06, 1, 12, 90, GREYWHITE, CORAL);
      grandstand(0.08, 1, 12, 70, GREYWHITE, TEAL);
      grandstand(0.10, 1, 14, 80, GREYWHITE, PINK);
      grandstand(0.06, -1, 16, 70, GREYWHITE, TEAL);
      // pastel hospitality cubes behind T1 stands
      for (let i = 0; i < 5; i++) {
        building(K(0.05 + i * 0.008), 1, 26 + (i % 2) * 14, 16, 16 + (i % 3) * 10, 16,
          { wall: PASTELS[i % PASTELS.length], window: GLASS, floor: 4 });
      }
      for (let i = 0; i < 7; i++) palm(K(0.04 + i * 0.006), 1, 10 + (i % 2) * 5, 8, PALM_GREEN);

      // ===================================================================
      // s 0.15 both near — concrete barriers + debris fence
      // ===================================================================
      wall(0.13, 0.19, 1, 3, 1.2, CONCRETE);
      wall(0.13, 0.19, -1, 3, 1.2, CONCRETE);
      fence(0.13, 0.19, 1, 3.5, 3.5, [0.78, 0.80, 0.82]);

      // ===================================================================
      // s 0.20 L mid — palm tree cluster
      // ===================================================================
      for (let i = 0; i < 18; i++) {
        const k = K(0.18 + (i % 6) * 0.004);
        palm(k, -1, 12 + (i % 4) * 7 + hash(i) * 4, 8 + hash(i * 7) * 5,
          (i % 2) ? PALM_GREEN : PALM_DARK);
        palm(K(0.18 + (i % 6) * 0.005), 1, 14 + (i % 3) * 6, 8 + hash(i * 3) * 4,
          (i % 2) ? PALM_DARK : PALM_GREEN);
      }
      // pastel low-rise band behind the palm cluster
      for (let i = 0; i < 6; i++) {
        building(K(0.19 + i * 0.007), -1, 32 + (i % 2) * 16, 16, 14 + (i % 3) * 9, 16,
          { wall: PASTELS[(i + 2) % PASTELS.length], window: GLASS, floor: 4 });
      }

      // ===================================================================
      // s 0.30 R near — MIA MARINA: flat painted "water" slab with white
      // yacht boxes standing on it (the gimmick: they obviously don't float).
      // ===================================================================
      // CONTINUOUS painted-water marina: a chain of slabs along the sweep so
      // the blue "water" reads as one unbroken body, packed with yacht boxes.
      for (let m = 0; m < 3; m++) {
        const k = K(0.28 + m * 0.03);
        groundPlane(k, 1, 6, [150, 130], [0.15, 0.45, 0.60]); // painted water
        // yacht boxes sitting on the flat slab — denser, more rows
        for (let i = 0; i < 9; i++) {
          const a = anchor(k, 1, 18 + (i % 4) * 22);
          const off = (i - 4) * 17 + hash(i * 9 + m * 5) * 6;
          const c = vadd(a.c, a.t, off);
          const len = 11 + hash(i * 3 + m) * 9;
          addBox(out, vadd(c, a.u, 1.4), [5, 2.8, len], WHITE, [a.r, a.u, a.t]); // hull
          addBox(out, vadd(c, a.u, 3.6), [3.6, 2.0, len * 0.55], GREYWHITE, [a.r, a.u, a.t]); // cabin
          addBox(out, vadd(c, a.u, 5.2), [2.0, 1.4, len * 0.3], GLASS, [a.r, a.u, a.t]); // upper deck
        }
      }
      // palms along the marina waterfront
      for (let i = 0; i < 8; i++) palm(K(0.28 + i * 0.006), 1, 8 + (i % 2) * 4, 8, PALM_GREEN);

      // s 0.32 R near — faux superyacht hospitality: long white multi-deck box
      {
        const k = K(0.32);
        const a = anchor(k, 1, 30);
        addBox(out, vadd(a.c, a.u, 5), [10, 10, 60], WHITE, [a.r, a.u, a.t]);
        addBox(out, vadd(a.c, a.u, 7), [10.4, 2.4, 56], TEAL, [a.r, a.u, a.t]); // glass band
        addBox(out, vadd(a.c, a.u, 11), [8, 4, 40], GREYWHITE, [a.r, a.u, a.t]); // top deck
      }

      // ===================================================================
      // s 0.45 L mid — stadium-lot grandstands + pastel hospitality cubes
      // ===================================================================
      grandstand(0.45, -1, 14, 80, GREYWHITE, PINK);
      grandstand(0.43, -1, 14, 70, GREYWHITE, TEAL);
      grandstand(0.47, -1, 16, 80, GREYWHITE, CORAL);
      for (let i = 0; i < 10; i++) {
        const k = K(0.44 + i * 0.006);
        const col = PASTELS[i % PASTELS.length];
        building(k, -1, 22 + (i % 3) * 18, 16, 14 + (i % 4) * 9, 16,
          { wall: col, window: GLASS, floor: 4 });
      }
      for (let i = 0; i < 8; i++) palm(K(0.43 + i * 0.005), -1, 11 + (i % 2) * 5, 8, PALM_GREEN);

      // ===================================================================
      // s 0.50 R mid — palm rows + low signage boxes (T11 braking zone)
      // ===================================================================
      for (let i = 0; i < 16; i++) palm(K(0.50 + i * 0.004), 1, 11 + (i % 3) * 6, 9, PALM_GREEN);
      for (let i = 0; i < 6; i++) palm(K(0.55 + i * 0.005), -1, 12 + (i % 2) * 5, 8, PALM_DARK);
      billboard(K(0.50), 1, 11, 18, 9, CORAL);
      billboard(K(0.52), 1, 10, 16, 8, TEAL);
      billboard(K(0.54), 1, 10, 16, 8, PINK);
      // pastel hospitality strip behind the braking zone
      for (let i = 0; i < 5; i++) {
        building(K(0.51 + i * 0.007), 1, 22 + (i % 2) * 16, 16, 16 + (i % 3) * 8, 16,
          { wall: PASTELS[(i + 1) % PASTELS.length], window: GLASS, floor: 4 });
      }

      // ===================================================================
      // s 0.62 both near — FLORIDA TURNPIKE OVERPASS: grey concrete deck box
      // spanning the track (drive-under) on pillar boxes.
      // ===================================================================
      const overpass = (s, ang) => {
        const k = K(s);
        const aL = anchor(k, -1, 1), aR = anchor(k, 1, 1);
        const span = Math.hypot(aR.c[0] - aL.c[0], aR.c[2] - aL.c[2]) + 16;
        const mid = vadd(aL.c, [(aR.c[0] - aL.c[0]), 0, (aR.c[2] - aL.c[2])], 0.5);
        // deck spanning across the track, lifted on the up axis
        addBox(out, vadd(mid, aL.u, 13), [span, 2.4, 14], CONCRETE, [aL.r, aL.u, aL.t]);
        addBox(out, vadd(mid, aL.u, 11.5), [span, 1.0, 14], [0.55, 0.55, 0.58], [aL.r, aL.u, aL.t]);
        // pillar boxes flanking
        for (const a of [aL, aR]) {
          const p = anchor(k, a === aL ? -1 : 1, 4);
          addBox(out, vadd(p.c, p.u, 6), [3, 12, 3], CONCRETE, [p.r, p.u, p.t]);
        }
      };
      overpass(0.62);
      overpass(0.67); // second overpass + crest over T14–15 chicane

      // ===================================================================
      // s 0.78 L mid — back-straight grandstands (DRS zone), dense crowd flecks
      // ===================================================================
      grandstand(0.78, -1, 12, 110, GREYWHITE, CORAL);
      grandstand(0.80, -1, 12, 80, GREYWHITE, PINK);
      grandstand(0.82, -1, 14, 90, GREYWHITE, TEAL);
      grandstand(0.78, 1, 16, 90, GREYWHITE, PINK);
      // pastel hospitality cubes behind the DRS stands + palms
      for (let i = 0; i < 6; i++) {
        building(K(0.77 + i * 0.007), -1, 26 + (i % 2) * 16, 16, 15 + (i % 3) * 9, 16,
          { wall: PASTELS[i % PASTELS.length], window: GLASS, floor: 4 });
      }
      for (let i = 0; i < 8; i++) palm(K(0.76 + i * 0.006), 1, 12 + (i % 2) * 5, 8, PALM_GREEN);

      // ===================================================================
      // s 0.90 R mid — paddock/team-building cluster: clean white box blocks
      // ===================================================================
      for (let i = 0; i < 10; i++) {
        const k = K(0.88 + i * 0.008);
        building(k, 1, 17 + (i % 3) * 16, 18, 12 + (i % 3) * 7, 22,
          { wall: (i % 4) ? WHITE : PASTELS[i % PASTELS.length], window: GLASS, floor: 3 });
      }
      for (let i = 0; i < 9; i++) palm(K(0.89 + i * 0.006), 1, 12 + (i % 2) * 4, 8, PALM_GREEN);
      for (let i = 0; i < 5; i++) palm(K(0.90 + i * 0.007), -1, 13 + (i % 2) * 5, 8, PALM_DARK);
      grandstand(0.92, -1, 14, 70, GREYWHITE, CORAL);

      // ===================================================================
      // s 0.96 both near — final-corner barrier walls flanking the run to S/F
      // ===================================================================
      wall(0.94, 0.99, 1, 3, 1.2, CONCRETE);
      wall(0.94, 0.99, -1, 3, 1.2, CONCRETE);
      fence(0.94, 0.99, 1, 3.5, 3.2, [0.78, 0.80, 0.82]);
    },
  }
  );
})();
