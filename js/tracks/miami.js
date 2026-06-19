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
      // Pastel low-rise haze backdrop ring — flat tropical skyline pushed
      // far back so nothing walls in the camera. No mountains.
      // ===================================================================
      for (let i = 0; i < 34; i++) {
        const k = K(i / 34);
        const side = (i % 2) ? 1 : -1;
        const col = PASTELS[i % PASTELS.length];
        backdrop(k, side, 240 + hash(i * 5) * 200,
          [22 + hash(i * 3) * 26, 26 + hash(i * 11) * 60, 22],
          [col[0] * 0.7 + 0.25, col[1] * 0.7 + 0.25, col[2] * 0.7 + 0.25]);
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
        place(k, -1, 16, [22, 9, 120], WHITE);
        place(k, -1, 14, [1.0, 6, 116], GLASS);   // glass-grey face band
        place(k, -1, 16, [22.4, 1.5, 120], GREYWHITE); // flat roof cap
      }

      // ===================================================================
      // s 0.06 R mid — T1 grandstand: tiered seating + bright crowd flecks
      // ===================================================================
      grandstand(0.06, 1, 12, 90, GREYWHITE, CORAL);
      grandstand(0.08, 1, 12, 70, GREYWHITE, TEAL);

      // ===================================================================
      // s 0.15 both near — concrete barriers + debris fence
      // ===================================================================
      wall(0.13, 0.19, 1, 3, 1.2, CONCRETE);
      wall(0.13, 0.19, -1, 3, 1.2, CONCRETE);
      fence(0.13, 0.19, 1, 3.5, 3.5, [0.78, 0.80, 0.82]);

      // ===================================================================
      // s 0.20 L mid — palm tree cluster
      // ===================================================================
      for (let i = 0; i < 9; i++) {
        const k = K(0.20 + (i % 3) * 0.004);
        palm(k, -1, 14 + (i % 3) * 7 + hash(i) * 4, 8 + hash(i * 7) * 5,
          (i % 2) ? PALM_GREEN : PALM_DARK);
      }

      // ===================================================================
      // s 0.30 R near — MIA MARINA: flat painted "water" slab with white
      // yacht boxes standing on it (the gimmick: they obviously don't float).
      // ===================================================================
      {
        const k = K(0.30);
        groundPlane(k, 1, 6, [150, 110], [0.15, 0.45, 0.60]); // painted water
        // yacht boxes sitting on the flat slab
        for (let i = 0; i < 7; i++) {
          const a = anchor(k, 1, 22 + (i % 3) * 24);
          const off = (i - 3) * 18 + hash(i * 9) * 6;
          const c = vadd(a.c, a.t, off);
          const len = 12 + hash(i * 3) * 8;
          addBox(out, vadd(c, a.u, 1.4), [5, 2.8, len], WHITE, [a.r, a.u, a.t]); // hull
          addBox(out, vadd(c, a.u, 3.6), [3.6, 2.0, len * 0.55], GREYWHITE, [a.r, a.u, a.t]); // cabin
          addBox(out, vadd(c, a.u, 5.2), [2.0, 1.4, len * 0.3], GLASS, [a.r, a.u, a.t]); // upper deck
        }
      }

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
      for (let i = 0; i < 5; i++) {
        const k = K(0.46 + i * 0.006);
        const col = PASTELS[i % PASTELS.length];
        building(k, -1, 30 + (i % 2) * 18, 16, 14 + (i % 3) * 8, 16,
          { wall: col, window: GLASS, floor: 4 });
      }

      // ===================================================================
      // s 0.50 R mid — palm rows + low signage boxes (T11 braking zone)
      // ===================================================================
      for (let i = 0; i < 8; i++) palm(K(0.50 + i * 0.004), 1, 12 + (i % 2) * 6, 9, PALM_GREEN);
      billboard(K(0.50), 1, 6, 18, 9, CORAL);
      billboard(K(0.52), 1, 6, 16, 8, TEAL);

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

      // ===================================================================
      // s 0.90 R mid — paddock/team-building cluster: clean white box blocks
      // ===================================================================
      for (let i = 0; i < 5; i++) {
        const k = K(0.90 + i * 0.008);
        building(k, 1, 26 + (i % 2) * 16, 18, 12 + (i % 2) * 6, 22,
          { wall: WHITE, window: GLASS, floor: 3 });
      }
      for (let i = 0; i < 4; i++) palm(K(0.91 + i * 0.006), 1, 14, 8, PALM_GREEN);

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
