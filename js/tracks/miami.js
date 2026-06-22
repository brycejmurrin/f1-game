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
    pal: { zenith: [0.22, 0.5, 0.88], horizon: [0.74, 0.8, 0.86], grass: [0.20, 0.42, 0.18], runoff: [0.56, 0.48, 0.34], fogDensity: 0.001, sunDir: [0.3131803839972462, 0.7933903061263571, 0.521967306662077], sun: [1, 0.96, 0.82], sunColor: [1, 0.94, 0.8] },
    segs: [
      { t: 0, l: 300 }, { t: -60, l: 80 }, { t: 65, l: 70 }, { t: 0, l: 200 }, { t: 80, l: 90 }, { t: -90, l: 100 },
      { t: 70, l: 80 }, { t: 0, l: 400 }, { t: -80, l: 90 }, { t: 80, l: 90 }, { t: 0, l: 240 },
    ],
    // Hard Rock Stadium: gentle rise through the stadium section (overpass area).
    elevations: [{ s: 0.42, halfM: 280, rise: 4 }],
    scenery: function (api) {
      const {
        out, n, px, pz, pyMin, place, prop, backdrop, groundPlane, grandstand,
        building, tower, billboard, palm, bush, fence, wall, guardrail, tyreWall,
        marshalPost, gantry, anchor, addBox, addCyl, addPrism, addPyramid,
        addCone, addFrustum, vadd, hash, onTrack, every,
      } = api;
      const K = (s) => Math.round(s * n) % n;

      // Track centre + radius — for placing a clustered distant downtown that
      // reads as ONE skyline far off, instead of a chaotic ring on every node.
      let cx = 0, cz = 0;
      for (let i = 0; i < n; i++) { cx += px[i]; cz += pz[i]; }
      cx /= n; cz /= n;
      let rad = 0;
      for (let i = 0; i < n; i++) rad = Math.max(rad, Math.hypot(px[i] - cx, pz[i] - cz));

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
      // FAR HORIZON HAZE BAND — a thin, low, soft pastel band wrapping the whole
      // lap far back. Hazed (desaturated toward sky) so it reads as distance,
      // never walls in the camera. Continuous but cheap (one box per node-ish).
      // ===================================================================
      for (let i = 0; i < 96; i++) {
        const k = K(i / 96);
        const side = (i % 2) ? 1 : -1;
        const col = PASTELS[i % PASTELS.length];
        backdrop(k, side, 540 + hash(i * 5) * 260,
          [40 + hash(i * 3) * 30, 16 + hash(i * 11) * 30, 30],
          [col[0] * 0.42 + 0.50, col[1] * 0.42 + 0.50, col[2] * 0.42 + 0.52]);
      }

      // ===================================================================
      // MIAMI DOWNTOWN SKYLINE — a CLUSTER of modern glass towers grouped in
      // one place far beyond the track (NE of the centre, like a real distant
      // city) rather than scattered everywhere. Concentric rings of towers so
      // the cluster has depth; tallest in the middle. World-coord placement,
      // guarded by onTrack so nothing lands on a parallel stretch.
      // ===================================================================
      {
        const dx = 0.62, dz = -0.78;                 // skyline bearing from centre
        const ddist = Math.hypot(dx, dz);
        const ux = dx / ddist, uz = dz / ddist;      // unit direction to downtown
        const vx = -uz, vz = ux;                     // perpendicular (spread axis)
        const baseDist = rad + 360;                  // cluster centre offset
        const dcx = cx + ux * baseDist, dcz = cz + uz * baseDist;
        const TOWER_COLS = [GLASS, [0.62, 0.78, 0.84], [0.50, 0.66, 0.74],
          [0.72, 0.84, 0.90], [0.45, 0.62, 0.72]];
        for (let i = 0; i < 46; i++) {
          const h0 = hash(i * 13.1), h1 = hash(i * 7.7 + 2), h2 = hash(i * 3.3 + 5);
          // distribute in an elongated blob: spread sideways, depth in/out
          const spread = (h1 - 0.5) * 560;
          const depth = (h2 - 0.5) * 360;
          const tx = dcx + vx * spread + ux * depth;
          const tz = dcz + vz * spread + uz * depth;
          // centre-weighted height: tallest near the blob's middle
          const central = 1 - Math.min(1, (Math.abs(spread) / 280 + Math.abs(depth) / 220) * 0.5);
          const th = 70 + central * 150 + h0 * 60;
          const tw = 22 + h1 * 26;
          if (onTrack(tx, tz, tw * 0.7)) continue;
          const col = TOWER_COLS[i % TOWER_COLS.length];
          const settledY = pyMin - 2;
          // tapered glass tower
          addFrustum(out, [tx, settledY, tz], tw * 0.5, tw * 0.34, th, col, 5, null);
          // darker window-mullion core box for a banded read
          addBox(out, [tx, settledY + th * 0.5, tz], [tw * 0.6, th, tw * 0.6],
            [col[0] * 0.78, col[1] * 0.82, col[2] * 0.86], null);
          // bright glass cap + rooftop mast/antenna on the tallest
          addBox(out, [tx, settledY + th, tz], [tw * 0.42, tw * 0.5, tw * 0.42], WHITE, null);
          if (th > 150) addCyl(out, [tx, settledY + th + tw * 0.25, tz], 0.6, 16 + h0 * 18,
            [0.85, 0.85, 0.88], 4, null);
        }
        // a few mid-rise pastel blocks skirting the tower cluster, for layering
        for (let i = 0; i < 26; i++) {
          const h1 = hash(i * 9.9 + 11), h2 = hash(i * 4.4 + 13);
          const spread = (h1 - 0.5) * 720;
          const depth = 120 + h2 * 200;            // in front of the towers
          const tx = dcx + vx * spread - ux * depth;
          const tz = dcz + vz * spread - uz * depth;
          const tw = 26 + h1 * 22, th = 30 + h2 * 70;
          if (onTrack(tx, tz, tw * 0.7)) continue;
          const col = PASTELS[(i * 2) % PASTELS.length];
          addBox(out, [tx, pyMin - 2 + th * 0.5, tz], [tw, th, tw * 0.9],
            [col[0] * 0.66 + 0.26, col[1] * 0.66 + 0.26, col[2] * 0.66 + 0.26], null);
        }
      }

      // ===================================================================
      // s 0.00 R — HARD ROCK STADIUM: huge fully-enclosed elliptical bowl, the
      // hero landmark. A 360° ring of raked seating banks + an upper shell tier
      // crowned by a coral/teal rim, set well back behind the pit complex so it
      // towers over the start/finish. Built in world coords around its own
      // centre so it reads as one continuous oval structure.
      // ===================================================================
      {
        const a = anchor(K(0.0), 1, 96);             // bowl centre, set back R
        const r = a.r, u = a.u, t = a.t;
        const RA = 86, RB = 66;                       // ellipse radii (along t, along r)
        const segC = 40, by = a.c[1];
        for (let i = 0; i < segC; i++) {
          const ang = i / segC * 6.2832;
          const ca = Math.cos(ang), sa = Math.sin(ang);
          // point on ellipse, in track basis (t = long axis, r = depth axis)
          const ex = ca * RA, ez = sa * RB;
          const c = vadd(vadd([a.c[0], by, a.c[2]], t, ex), r, ez);
          // outward normal direction for orienting the bank to face inward
          const nx = t[0] * (ca * RB) + r[0] * (sa * RA);
          const nz = t[2] * (ca * RB) + r[2] * (sa * RA);
          const nl = Math.hypot(nx, nz) || 1;
          const fwd = [t[0] * (-sa), 0, t[2] * (-sa)]; // tangent along ring (approx)
          const rad2 = [nx / nl, 0, nz / nl];
          const tan = [-rad2[2], 0, rad2[0]];
          const h = 30 + (i % 3) * 3;
          const segW = 15;                            // chord segment width
          // lower raked seating bank (leaning slightly outward)
          addBox(out, vadd(vadd(c, u, h * 0.5), rad2, 5), [10, h, segW], GREYWHITE, [rad2, u, tan]);
          // upper shell tier
          addBox(out, vadd(vadd(c, u, h + 6), rad2, 7), [9, 12, segW - 1], WHITE, [rad2, u, tan]);
          // coral/teal crowning rim
          addBox(out, vadd(vadd(c, u, h + 13), rad2, 7), [9.6, 2.6, segW + 0.4],
            (i % 2) ? CORAL : TEAL, [rad2, u, tan]);
          // crowd flecks on the seating face (inner)
          if (i % 2 === 0)
            addBox(out, vadd(vadd(c, u, h * 0.55), rad2, -1), [1.2, h * 0.6, segW - 2],
              PASTELS[i % PASTELS.length], [rad2, u, tan]);
        }
        // floodlight masts on the rim at four "corners"
        for (let i = 0; i < 4; i++) {
          const ang = (i + 0.5) / 4 * 6.2832;
          const ex = Math.cos(ang) * RA, ez = Math.sin(ang) * RB;
          const c = vadd(vadd([a.c[0], by, a.c[2]], t, ex), r, ez);
          addCyl(out, vadd(c, u, 0), 0.8, 56, GREYWHITE, 5, [r, u, t]);
          addBox(out, vadd(c, u, 56), [10, 3, 3], WHITE, [r, u, t]);
        }
      }

      // s 0.00 L near — pit/paddock: long low flat white box block, glass faces,
      // plus a two-storey paddock club terrace behind it and a pit-wall.
      {
        const k = K(0.0);
        place(k, -1, 24, [22, 9, 120], WHITE);
        place(k, -1, 14, [1.0, 6, 116], GLASS);        // glass-grey face band
        place(k, -1, 24, [22.4, 1.5, 120], GREYWHITE);  // flat roof cap
        // paddock club: taller glassy terrace block set further back
        building(k, -1, 42, 26, 22, 120, { wall: WHITE, window: GLASS, floor: 6 });
        // low pit wall right at trackside (clearance kept off tarmac)
        wall(0.0, 0.05, -1, 2.2, 1.1, GREYWHITE);
      }
      // overhead start/finish gantry spanning the pit straight
      gantry(0.012, 7.0, CORAL);
      gantry(0.0, 6.6, [0.18, 0.20, 0.24]);
      // palms lining the pit straight, both sides
      for (let i = 0; i < 14; i++) {
        palm(K(0.0 + i * 0.006), -1, 9 + (i % 2) * 4, 8 + hash(i) * 4, PALM_GREEN);
        palm(K(0.0 + i * 0.006), 1, 46 + (i % 2) * 6, 9 + hash(i * 5) * 4, PALM_DARK);
      }
      // colourful sponsor billboards along the pit wall
      billboard(K(0.02), -1, 11, 16, 7, TEAL);
      billboard(K(0.035), -1, 11, 16, 7, CORAL);
      billboard(K(0.05), -1, 11, 16, 7, PINK);

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
      const WATER = [0.13, 0.46, 0.62];
      for (let m = 0; m < 4; m++) {
        const k = K(0.27 + m * 0.028);
        groundPlane(k, 1, 6, [170, 150], WATER);     // painted water
        // floating pontoon walkway strip across the slab (light grey)
        groundPlane(k, 1, 7, [150, 5], [0.62, 0.62, 0.60]);
        // yacht boxes sitting on the flat slab — denser, more rows, with masts
        for (let i = 0; i < 11; i++) {
          const a = anchor(k, 1, 16 + (i % 5) * 20);
          const off = (i - 5) * 15 + hash(i * 9 + m * 5) * 6;
          const c = vadd(a.c, a.t, off);
          const len = 10 + hash(i * 3 + m) * 11;
          const trim = (i % 2) ? TEAL : CORAL;
          addBox(out, vadd(c, a.u, 1.4), [5, 2.8, len], WHITE, [a.r, a.u, a.t]);              // hull
          addBox(out, vadd(c, a.u, 2.7), [5.2, 0.6, len], trim, [a.r, a.u, a.t]);             // waterline trim
          addBox(out, vadd(c, a.u, 3.8), [3.6, 2.2, len * 0.55], GREYWHITE, [a.r, a.u, a.t]); // cabin
          addBox(out, vadd(c, a.u, 5.6), [2.2, 1.5, len * 0.32], GLASS, [a.r, a.u, a.t]);     // bridge
          // mast / radar arch on the bigger boats
          if (len > 15) {
            addCyl(out, vadd(c, a.u, 6.4), 0.18, 7 + hash(i + m) * 4, GREYWHITE, 4, [a.r, a.u, a.t]);
            addBox(out, vadd(c, a.u, 7.0), [2.6, 0.4, 1.2], WHITE, [a.r, a.u, a.t]); // bimini
          }
        }
        // a couple of small tenders / jet skis dotted on the water
        for (let i = 0; i < 4; i++) {
          const a = anchor(k, 1, 10 + (i % 3) * 30);
          const c = vadd(a.c, a.t, (i - 2) * 26 + hash(i * 17 + m) * 8);
          addBox(out, vadd(c, a.u, 0.7), [1.6, 1.0, 3.2], (i % 2) ? CORAL : TEAL, [a.r, a.u, a.t]);
        }
      }
      // palms along the marina waterfront promenade
      for (let i = 0; i < 12; i++) palm(K(0.27 + i * 0.005), 1, 8 + (i % 2) * 4, 8, PALM_GREEN);

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

      // ===================================================================
      // LAP-WIDE TRACK FURNITURE — temporary-circuit feel: continuous concrete
      // barrier + catch fence behind it most of the way round, TecPro/tyre
      // walls on the tighter sections, armco on the open stretches, marshal
      // posts at intervals, and sponsor billboards on the long straights.
      // ===================================================================
      // continuous low concrete barriers + catch fence on the technical sectors
      for (const [s0, s1] of [[0.32, 0.42], [0.55, 0.62], [0.62, 0.72], [0.83, 0.90]]) {
        wall(s0, s1, 1, 3, 1.0, CONCRETE);
        wall(s0, s1, -1, 3, 1.0, CONCRETE);
        fence(s0, s1, 1, 3.4, 3.0, [0.80, 0.82, 0.84]);
      }
      // armco guardrail on the faster open straights
      guardrail(0.005, 0.05, 1, 3, GREYWHITE);
      guardrail(0.72, 0.80, -1, 3, GREYWHITE);
      // colourful tyre walls (coral / teal caps) at the chicane apexes
      tyreWall(0.63, 0.66, 1, 2.4, CORAL);
      tyreWall(0.66, 0.69, -1, 2.4, TEAL);
      tyreWall(0.155, 0.175, -1, 2.4, PINK);
      // marshal posts at regular intervals all around the lap (kept off tarmac)
      every(180, (k) => { if (!onTrack(px[k], pz[k], 9)) marshalPost(k, 1, 5); });
      // low shrubs / planters softening the trackside on the long straights
      for (let i = 0; i < 10; i++) {
        bush(K(0.72 + i * 0.006), -1, 6 + (i % 2) * 3, PALM_GREEN);
        bush(K(0.05 + i * 0.005), 1, 6 + (i % 2) * 3, PALM_DARK);
      }
      // a scatter of extra palms filling sparse infield-adjacent edges
      for (let i = 0; i < 24; i++) {
        const s = i / 24;
        const side = (i % 2) ? 1 : -1;
        palm(K(s + 0.002), side, 16 + hash(i * 31) * 14, 7 + hash(i * 13) * 4,
          (i % 2) ? PALM_GREEN : PALM_DARK);
      }

      // ===================================================================
      // ENHANCED HARD ROCK STADIUM — Hero landmark, 50% oversized for presence
      // ===================================================================
      {
        const a = anchor(K(0.0), 1, 96);
        const r = a.r, u = a.u, t = a.t;
        const RA = 125, RB = 95;                      // 45% larger (86→125, 66→95)
        const segC = 48, by = a.c[1];
        for (let i = 0; i < segC; i++) {
          const ang = i / segC * 6.2832;
          const ca = Math.cos(ang), sa = Math.sin(ang);
          const ex = ca * RA, ez = sa * RB;
          const c = vadd(vadd([a.c[0], by, a.c[2]], t, ex), r, ez);
          const nx = t[0] * (ca * RB) + r[0] * (sa * RA);
          const nz = t[2] * (ca * RB) + r[2] * (sa * RA);
          const nl = Math.hypot(nx, nz) || 1;
          const rad2 = [nx / nl, 0, nz / nl];
          const tan = [-rad2[2], 0, rad2[0]];
          const h = 42 + (i % 3) * 4;                // Taller seating sections (42 base)
          const segW = 18;
          // lower raked seating (reinforced from original)
          addBox(out, vadd(vadd(c, u, h * 0.5), rad2, 6), [11, h + 2, segW], GREYWHITE, [rad2, u, tan]);
          // upper shell tier — more prominent
          addBox(out, vadd(vadd(c, u, h + 9), rad2, 8), [10, 16, segW + 1], WHITE, [rad2, u, tan]);
          // coral/teal rim crown — wider, bolder
          addBox(out, vadd(vadd(c, u, h + 20), rad2, 8), [11, 3.2, segW + 1],
            (i % 2) ? CORAL : TEAL, [rad2, u, tan]);
          // crowd detail layer — enhanced colour variation
          if (i % 2 === 0)
            addBox(out, vadd(vadd(c, u, h * 0.6), rad2, 0), [1.5, h * 0.65, segW - 2],
              PASTELS[(i * 3) % PASTELS.length], [rad2, u, tan]);
          // secondary crowd detail for deeper visual richness
          if (i % 3 === 1)
            addBox(out, vadd(vadd(c, u, h * 0.45), rad2, 2), [0.8, h * 0.5, segW - 3],
              PASTELS[(i * 5 + 2) % PASTELS.length], [rad2, u, tan]);
        }
        // Prominent floodlight masts — increase to 6 for better presence
        for (let i = 0; i < 6; i++) {
          const ang = (i + 0.5) / 6 * 6.2832;
          const ex = Math.cos(ang) * RA, ez = Math.sin(ang) * RB;
          const c = vadd(vadd([a.c[0], by, a.c[2]], t, ex), r, ez);
          addCyl(out, vadd(c, u, 0), 1.0, 64, GREYWHITE, 6, [r, u, t]);
          addBox(out, vadd(c, u, 64), [12, 3.6, 4], WHITE, [r, u, t]);
          // light ring on mast
          addCyl(out, vadd(c, u, 62), 4.5, 1.2, [0.95, 0.90, 0.75], 8, [r, u, t]);
        }
        // Massive curved roof cap — frustum spanning the entire ellipse
        addFrustum(out, vadd([a.c[0], by, a.c[2]], u, 50), 110, 70, 16,
          [0.82, 0.84, 0.86], 48, [r, u, t]);
        // Roof underside detail stripe (darker band)
        addFrustum(out, vadd([a.c[0], by, a.c[2]], u, 49), 112, 72, 0.8,
          [0.55, 0.55, 0.57], 48, [r, u, t]);
      }

      // ===================================================================
      // ENHANCED MARINA — Richer water effect with more boats and depth
      // ===================================================================
      const WATER_DEEP = [0.08, 0.32, 0.48];
      for (let m = 0; m < 5; m++) {                 // Increased from 4 to 5 sections
        const k = K(0.26 + m * 0.026);
        // Layered water effect: shallow front → deep back
        groundPlane(k, 1, 5.5, [180, 160], WATER);
        groundPlane(k, 1, 6.8, [200, 180], WATER_DEEP);  // Second darker layer
        // pontoon walkway
        groundPlane(k, 1, 7, [160, 6], [0.68, 0.68, 0.66]);
        // More yachts per section (increased density)
        for (let i = 0; i < 14; i++) {
          const a = anchor(k, 1, 14 + (i % 6) * 22);
          const off = (i - 7) * 16 + hash(i * 11 + m * 7) * 8;
          const c = vadd(a.c, a.t, off);
          const len = 12 + hash(i * 4 + m) * 13;
          const trim = (i % 3 === 0) ? TEAL : ((i % 3 === 1) ? CORAL : PINK);
          // Enhanced yacht: larger hull + more detail
          addBox(out, vadd(c, a.u, 1.6), [6, 3.4, len], WHITE, [a.r, a.u, a.t]);
          addBox(out, vadd(c, a.u, 3.0), [6.4, 0.8, len], trim, [a.r, a.u, a.t]);
          addBox(out, vadd(c, a.u, 4.2), [4.2, 2.6, len * 0.58], GREYWHITE, [a.r, a.u, a.t]);
          addBox(out, vadd(c, a.u, 6.2), [2.6, 1.8, len * 0.36], GLASS, [a.r, a.u, a.t]);
          // Mast + arch detail on larger boats
          if (len > 16) {
            addCyl(out, vadd(c, a.u, 7.0), 0.22, 10 + hash(i + m) * 5, GREYWHITE, 5, [a.r, a.u, a.t]);
            addBox(out, vadd(c, a.u, 7.8), [3.2, 0.5, 1.6], WHITE, [a.r, a.u, a.t]);
          }
        }
        // More jet skis + tenders scattered
        for (let i = 0; i < 6; i++) {
          const a = anchor(k, 1, 8 + (i % 4) * 32);
          const c = vadd(a.c, a.t, (i - 3) * 28 + hash(i * 19 + m) * 10);
          addBox(out, vadd(c, a.u, 0.8), [2.0, 1.2, 3.8], (i % 2) ? CORAL : TEAL, [a.r, a.u, a.t]);
        }
      }
      // Marina perimeter palms — denser coverage
      for (let i = 0; i < 18; i++) {
        palm(K(0.26 + i * 0.0045), 1, 9 + (i % 3) * 3, 9 + hash(i * 7) * 3, PALM_GREEN);
      }

      // ===================================================================
      // ENHANCED GRANDSTANDS — More aggressive visual presence
      // ===================================================================
      // T1 expanded stands (bigger, bolder)
      for (let i = 0; i < 4; i++) {
        const s = 0.05 + i * 0.015;
        const side = (i % 2) ? 1 : -1;
        const col = [TEAL, CORAL, PINK, [0.90, 0.50, 0.70]][i];
        grandstand(s, side, 11, 95 + i * 5, GREYWHITE, col);
      }
      // Mid-lap stands (s 0.42–0.52) — enhanced
      for (let i = 0; i < 3; i++) {
        grandstand(0.43 + i * 0.035, -1, 13, 85 + i * 10, GREYWHITE,
          [PINK, TEAL, CORAL][i]);
      }
      // Back straight stands (s 0.77–0.85) — denser crowd
      for (let i = 0; i < 4; i++) {
        const s = 0.77 + i * 0.025;
        grandstand(s, -1, 12, 105 + i * 5, GREYWHITE, PASTELS[i % PASTELS.length]);
      }
      // Final corner stands (s 0.88–0.96)
      for (let i = 0; i < 2; i++) {
        grandstand(0.88 + i * 0.035, -1, 14, 80, GREYWHITE, [CORAL, TEAL][i]);
      }

      // ===================================================================
      // ULTRA-DENSE TROPICAL PALM COVERAGE — Miami aesthetic
      // ===================================================================
      // Core marina zone (s 0.26–0.38) — triple density
      every(12, (k) => {
        const s = k / n;
        if (s >= 0.26 && s <= 0.38) {
          const h = hash(k * 41 + 13);
          palm(k, -1, 11 + h * 8, 8 + h * 4, (h < 0.4) ? PALM_GREEN : PALM_DARK);
          palm(k, 1, 13 + h * 7, 8 + h * 4, (h < 0.6) ? PALM_GREEN : PALM_DARK);
          if (h < 0.7) {
            palm(k, (h < 0.35) ? -1 : 1, 18 + h * 5, 7 + h * 3, PALM_GREEN);
          }
        }
      });
      // Back straight zone (s 0.72–0.88) — high density
      every(16, (k) => {
        const s = k / n;
        if (s >= 0.72 && s <= 0.88) {
          const h = hash(k * 43 + 17);
          palm(k, -1, 10 + h * 6, 8 + h * 4, (h < 0.5) ? PALM_GREEN : PALM_DARK);
          palm(k, 1, 12 + h * 5, 7 + h * 3, PALM_GREEN);
        }
      });
      // General lap coverage — every technical section and straight
      every(25, (k) => {
        const h = hash(k * 47 + 19);
        const inTech = (k / n > 0.60 && k / n < 0.75);    // overpass zone
        const onStretch = (k / n < 0.12 || (k / n > 0.38 && k / n < 0.55));  // straights
        if (inTech || onStretch || h > 0.45) {
          const dist = 11 + h * 10;
          palm(k, (h < 0.5) ? -1 : 1, dist, 8 + h * 4, (h < 0.5) ? PALM_GREEN : PALM_DARK);
        }
      });

      // ===================================================================
      // HOSPITALITY CUBES — More pastel, more density, better placement
      // ===================================================================
      // T1 zone (s 0.04–0.12)
      for (let i = 0; i < 8; i++) {
        building(K(0.04 + i * 0.007), 1, 26 + (i % 2) * 12, 18, 15 + (i % 3) * 8, 18,
          { wall: PASTELS[i % PASTELS.length], window: GLASS, floor: 4 });
      }
      // Marina zone (s 0.32–0.42)
      for (let i = 0; i < 6; i++) {
        const col = [TEAL, CORAL, PINK, [0.92, 0.80, 0.40], [0.70, 0.85, 1.0], [1.0, 0.75, 0.55]][i];
        building(K(0.32 + i * 0.008), 1, 24 + (i % 2) * 14, 16, 14 + (i % 3) * 10, 18,
          { wall: col, window: GLASS, floor: 4 });
      }
      // Technical zone (s 0.55–0.70)
      for (let i = 0; i < 5; i++) {
        building(K(0.55 + i * 0.009), -1, 22 + (i % 2) * 16, 16, 14 + (i % 4) * 9, 18,
          { wall: PASTELS[(i + 1) % PASTELS.length], window: GLASS, floor: 4 });
      }

      // ===================================================================
      // ENHANCED TURNPIKE OVERPASSES — More structural drama
      // ===================================================================
      const overpass2 = (s, ang) => {
        const k = K(s);
        const aL = anchor(k, -1, 1), aR = anchor(k, 1, 1);
        const span = Math.hypot(aR.c[0] - aL.c[0], aR.c[2] - aL.c[2]) + 16;
        const mid = vadd(aL.c, [(aR.c[0] - aL.c[0]), 0, (aR.c[2] - aL.c[2])], 0.5);
        // Main deck — reinforced appearance
        addBox(out, vadd(mid, aL.u, 13), [span, 2.8, 16], CONCRETE, [aL.r, aL.u, aL.t]);
        addBox(out, vadd(mid, aL.u, 11.2), [span, 1.2, 16], [0.50, 0.50, 0.54], [aL.r, aL.u, aL.t]);
        // Dark underside shadow
        addBox(out, vadd(mid, aL.u, 10.6), [span, 0.8, 16],
          [0.24, 0.24, 0.26], [aL.r, aL.u, aL.t]);
        // Thick pillar boxes — four total (two inner, two outer)
        for (let pi = 0; pi < 4; pi++) {
          const pillarOff = (-1.5 + pi * 1) * span / 3;
          const p = anchor(k, pillarOff > 0 ? 1 : -1, 4);
          const pc = [mid[0] + aL.r[0] * pillarOff, mid[1], mid[2] + aL.r[2] * pillarOff];
          addBox(out, vadd(pc, aL.u, 5.5), [3.6, 11, 3.6], CONCRETE, [aL.r, aL.u, aL.t]);
          // Pillar cap (darker ring)
          addBox(out, vadd(pc, aL.u, 16.2), [4.2, 0.5, 4.2], [0.45, 0.45, 0.47], [aL.r, aL.u, aL.t]);
        }
      };
      overpass2(0.62);
      overpass2(0.67);

      // ===================================================================
      // BOLD MIAMI VICE BILLBOARDS — Saturated tropical palette
      // ===================================================================
      billboard(K(0.08), -1, 14, 14, 16, [0.0, 0.70, 0.80]);   // Bright teal
      billboard(K(0.18), 1, 15, 13, 15, [1.0, 0.40, 0.20]);    // Bright coral
      billboard(K(0.35), -1, 16, 14, 16, [0.95, 0.30, 0.60]);  // Hot pink
      billboard(K(0.48), 1, 15, 13, 15, [0.0, 0.75, 0.85]);    // Cyan
      billboard(K(0.65), -1, 14, 14, 16, [1.0, 0.55, 0.10]);   // Orange
      billboard(K(0.85), 1, 15, 13, 15, [0.20, 0.80, 0.75]);   // Turquoise
    },
  }
  );
})();
