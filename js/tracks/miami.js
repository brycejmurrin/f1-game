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
      const WATER = [0.13, 0.46, 0.62];
      const WATER_DEEP = [0.08, 0.32, 0.48];
      const PASTELS = [TEAL, CORAL, PINK, [0.75, 0.90, 1.0], [1.0, 0.85, 0.55]];

      // Shared overpass builder (used twice at s 0.62 and 0.67)
      const buildOverpass = (s) => {
        const k = K(s);
        const aL = anchor(k, -1, 1), aR = anchor(k, 1, 1);
        const span = Math.hypot(aR.c[0] - aL.c[0], aR.c[2] - aL.c[2]) + 16;
        const mid = vadd(aL.c, [(aR.c[0] - aL.c[0]), 0, (aR.c[2] - aL.c[2])], 0.5);
        // Main deck with underside shadow
        addBox(out, vadd(mid, aL.u, 13), [span, 2.8, 16], CONCRETE, [aL.r, aL.u, aL.t]);
        addBox(out, vadd(mid, aL.u, 11.2), [span, 1.2, 16], [0.50, 0.50, 0.54], [aL.r, aL.u, aL.t]);
        addBox(out, vadd(mid, aL.u, 10.6), [span, 0.8, 16], [0.24, 0.24, 0.26], [aL.r, aL.u, aL.t]);
        // Four pillar boxes for visual drama
        for (let pi = 0; pi < 4; pi++) {
          const pillarOff = (-1.5 + pi * 1) * span / 3;
          const sideDir = pillarOff > 0 ? 1 : -1;
          const p = anchor(k, sideDir, 4);
          const pc = [mid[0] + aL.r[0] * pillarOff, mid[1], mid[2] + aL.r[2] * pillarOff];
          addBox(out, vadd(pc, aL.u, 5.5), [3.6, 11, 3.6], CONCRETE, [aL.r, aL.u, aL.t]);
          addBox(out, vadd(pc, aL.u, 16.2), [4.2, 0.5, 4.2], [0.45, 0.45, 0.47], [aL.r, aL.u, aL.t]);
        }
      };

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
      // s 0.00 R — HARD ROCK STADIUM: massive elliptical bowl, Miami's hero
      // landmark. 360° raked seating + colourful coral/teal rim crown, with
      // 6 floodlight masts and a curved roof cap for dramatic presence. Reads as
      // one unified structure towering over the start/finish.
      // ===================================================================
      {
        const a = anchor(K(0.0), 1, 96);             // bowl centre, set back R
        const r = a.r, u = a.u, t = a.t;
        const RA = 125, RB = 95;                      // enlarged ellipse radii (45% bigger)
        const segC = 48, by = a.c[1];                 // more segments for detail
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
          const h = 42 + (i % 3) * 4;                // taller: 42–50 m sections
          const segW = 18;                            // wider chord segments
          // lower raked seating: reinforced appearance
          addBox(out, vadd(vadd(c, u, h * 0.5), rad2, 6), [11, h + 2, segW], GREYWHITE, [rad2, u, tan]);
          // upper shell tier — more prominent
          addBox(out, vadd(vadd(c, u, h + 9), rad2, 8), [10, 16, segW + 1], WHITE, [rad2, u, tan]);
          // coral/teal rim crown — bolder, wider
          addBox(out, vadd(vadd(c, u, h + 20), rad2, 8), [11, 3.2, segW + 1],
            (i % 2) ? CORAL : TEAL, [rad2, u, tan]);
          // crowd detail layer — enhanced colour variation
          if (i % 2 === 0)
            addBox(out, vadd(vadd(c, u, h * 0.6), rad2, 0), [1.5, h * 0.65, segW - 2],
              PASTELS[(i * 3) % PASTELS.length], [rad2, u, tan]);
          // secondary crowd detail for visual richness
          if (i % 3 === 1)
            addBox(out, vadd(vadd(c, u, h * 0.45), rad2, 2), [0.8, h * 0.5, segW - 3],
              PASTELS[(i * 5 + 2) % PASTELS.length], [rad2, u, tan]);
        }
        // 6 prominent floodlight masts (up from 4) — better visual drama
        for (let i = 0; i < 6; i++) {
          const ang = (i + 0.5) / 6 * 6.2832;
          const ex = Math.cos(ang) * RA, ez = Math.sin(ang) * RB;
          const c = vadd(vadd([a.c[0], by, a.c[2]], t, ex), r, ez);
          addCyl(out, vadd(c, u, 0), 1.0, 64, GREYWHITE, 6, [r, u, t]);      // mast
          addBox(out, vadd(c, u, 64), [12, 3.6, 4], WHITE, [r, u, t]);       // crossbeam
          addCyl(out, vadd(c, u, 62), 4.5, 1.2, [0.95, 0.90, 0.75], 8, [r, u, t]);  // light ring
        }
        // Massive curved roof cap spanning the bowl
        addFrustum(out, vadd([a.c[0], by, a.c[2]], u, 50), 110, 70, 16,
          [0.82, 0.84, 0.86], 48, [r, u, t]);
        // Roof underside shadow stripe
        addFrustum(out, vadd([a.c[0], by, a.c[2]], u, 49), 112, 72, 0.8,
          [0.55, 0.55, 0.57], 48, [r, u, t]);
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
      // s 0.05–0.12 R mid — T1 ZONE: prominent grandstands + pastel cubes + palms
      // ===================================================================
      // Four expanded grandstands (bigger, bolder)
      for (let i = 0; i < 4; i++) {
        const s = 0.05 + i * 0.015;
        const side = (i % 2) ? 1 : -1;
        const col = [TEAL, CORAL, PINK, [0.90, 0.50, 0.70]][i];
        grandstand(s, side, 11, 95 + i * 5, GREYWHITE, col);
      }
      // Dense pastel hospitality cubes behind the stands
      for (let i = 0; i < 8; i++) {
        building(K(0.04 + i * 0.007), 1, 26 + (i % 2) * 12, 18, 15 + (i % 3) * 8, 18,
          { wall: PASTELS[i % PASTELS.length], window: GLASS, floor: 4 });
      }
      // Palm tree line softening the zone
      for (let i = 0; i < 10; i++) palm(K(0.04 + i * 0.006), 1, 11 + (i % 2) * 5, 8 + hash(i) * 2, PALM_GREEN);

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
      // s 0.27 R — MIA MARINA: flat painted "water" slab with moored yachts
      // (the gimmick: they don't float, parked on the tarmac!). Waterfront reads
      // as a continuous turquoise "lake" with pontoons, jet skis, and palms.
      // ===================================================================
      for (let m = 0; m < 5; m++) {                    // 5 sections for continuity
        const k = K(0.27 + m * 0.026);
        // Layered water: shallow front, deeper back
        groundPlane(k, 1, 5.5, [180, 160], WATER);
        groundPlane(k, 1, 6.8, [200, 180], WATER_DEEP);  // darker deep layer
        // pontoon walkway strip (light grey concrete promenade)
        groundPlane(k, 1, 7, [160, 6], [0.68, 0.68, 0.66]);
        // Denser yachts: 14 per section (up from 11)
        for (let i = 0; i < 14; i++) {
          const a = anchor(k, 1, 14 + (i % 6) * 22);
          const off = (i - 7) * 16 + hash(i * 11 + m * 7) * 8;
          const c = vadd(a.c, a.t, off);
          const len = 12 + hash(i * 4 + m) * 13;      // bigger boats
          const trim = (i % 3 === 0) ? TEAL : ((i % 3 === 1) ? CORAL : PINK);
          // Enhanced yacht: larger hull + more detail
          addBox(out, vadd(c, a.u, 1.6), [6, 3.4, len], WHITE, [a.r, a.u, a.t]);
          addBox(out, vadd(c, a.u, 3.0), [6.4, 0.8, len], trim, [a.r, a.u, a.t]);  // waterline trim
          addBox(out, vadd(c, a.u, 4.2), [4.2, 2.6, len * 0.58], GREYWHITE, [a.r, a.u, a.t]);  // cabin
          addBox(out, vadd(c, a.u, 6.2), [2.6, 1.8, len * 0.36], GLASS, [a.r, a.u, a.t]);  // bridge
          // Mast + bimini on larger boats
          if (len > 16) {
            addCyl(out, vadd(c, a.u, 7.0), 0.22, 10 + hash(i + m) * 5, GREYWHITE, 5, [a.r, a.u, a.t]);
            addBox(out, vadd(c, a.u, 7.8), [3.2, 0.5, 1.6], WHITE, [a.r, a.u, a.t]);
          }
        }
        // More jet skis + tenders (6 per section)
        for (let i = 0; i < 6; i++) {
          const a = anchor(k, 1, 8 + (i % 4) * 32);
          const c = vadd(a.c, a.t, (i - 3) * 28 + hash(i * 19 + m) * 10);
          addBox(out, vadd(c, a.u, 0.8), [2.0, 1.2, 3.8], (i % 2) ? CORAL : TEAL, [a.r, a.u, a.t]);
        }
      }
      // Marina waterfront palms — denser, more tropical feel
      for (let i = 0; i < 18; i++) palm(K(0.26 + i * 0.0045), 1, 9 + (i % 3) * 3, 9 + hash(i * 7) * 3, PALM_GREEN);

      // s 0.32 R near — faux superyacht hospitality: long white multi-deck box
      {
        const k = K(0.32);
        const a = anchor(k, 1, 30);
        addBox(out, vadd(a.c, a.u, 5), [10, 10, 60], WHITE, [a.r, a.u, a.t]);
        addBox(out, vadd(a.c, a.u, 7), [10.4, 2.4, 56], TEAL, [a.r, a.u, a.t]); // glass band
        addBox(out, vadd(a.c, a.u, 11), [8, 4, 40], GREYWHITE, [a.r, a.u, a.t]); // top deck
      }

      // ===================================================================
      // s 0.43–0.52 L mid — stadium-lot zone: grandstands + pastel cubes + palms
      // ===================================================================
      // Three expanded mid-lap grandstands
      for (let i = 0; i < 3; i++) {
        grandstand(0.43 + i * 0.035, -1, 13, 85 + i * 10, GREYWHITE,
          [PINK, TEAL, CORAL][i]);
      }
      // Dense pastel hospitality cubes
      for (let i = 0; i < 6; i++) {
        const col = [TEAL, CORAL, PINK, [0.92, 0.80, 0.40], [0.70, 0.85, 1.0], [1.0, 0.75, 0.55]][i];
        building(K(0.44 + i * 0.008), -1, 24 + (i % 2) * 14, 16, 14 + (i % 3) * 10, 18,
          { wall: col, window: GLASS, floor: 4 });
      }
      // Palm screening
      for (let i = 0; i < 10; i++) palm(K(0.43 + i * 0.005), -1, 12 + (i % 2) * 4, 8 + hash(i * 3) * 2, PALM_GREEN);

      // ===================================================================
      // s 0.50–0.60 R mid — BRAKING ZONE: palms, billboards, hospitality cubes
      // ===================================================================
      // Dense palm screening on right
      for (let i = 0; i < 16; i++) palm(K(0.50 + i * 0.004), 1, 11 + (i % 3) * 6, 9 + hash(i) * 2, PALM_GREEN);
      // Sparse palms on left
      for (let i = 0; i < 6; i++) palm(K(0.55 + i * 0.005), -1, 12 + (i % 2) * 5, 8 + hash(i * 2) * 1, PALM_DARK);
      // Colourful sponsor billboards
      billboard(K(0.50), 1, 11, 18, 9, CORAL);
      billboard(K(0.52), 1, 10, 16, 8, TEAL);
      billboard(K(0.54), 1, 10, 16, 8, PINK);
      // Pastel hospitality cubes behind the braking zone
      for (let i = 0; i < 5; i++) {
        building(K(0.51 + i * 0.007), 1, 22 + (i % 2) * 16, 16, 16 + (i % 3) * 8, 16,
          { wall: PASTELS[(i + 1) % PASTELS.length], window: GLASS, floor: 4 });
      }

      // ===================================================================
      // s 0.62 & 0.67 both near — FLORIDA TURNPIKE OVERPASSES: grey concrete
      // deck spanning the track (drive-under) on four pillar boxes.
      // ===================================================================
      buildOverpass(0.62);
      buildOverpass(0.67);  // second overpass + crest over T14–15 chicane

      // ===================================================================
      // s 0.77–0.85 both — BACK STRAIGHT (DRS zone): dense grandstands + cubes
      // ===================================================================
      // Back straight stands — denser crowd coverage
      for (let i = 0; i < 4; i++) {
        const s = 0.77 + i * 0.025;
        grandstand(s, -1, 12, 105 + i * 5, GREYWHITE, PASTELS[i % PASTELS.length]);
      }
      // Hospitality cubes behind DRS stands
      for (let i = 0; i < 8; i++) {
        building(K(0.77 + i * 0.007), -1, 24 + (i % 2) * 16, 16, 15 + (i % 3) * 10, 16,
          { wall: PASTELS[(i + 1) % PASTELS.length], window: GLASS, floor: 4 });
      }
      // Palm screening on both sides
      for (let i = 0; i < 12; i++) {
        palm(K(0.76 + i * 0.006), (i % 2) ? 1 : -1, 12 + (i % 2) * 4, 8 + hash(i * 5) * 2, PALM_GREEN);
      }

      // ===================================================================
      // s 0.88–0.96 R — PADDOCK & FINAL CORNER: team buildings + grandstand + palms
      // ===================================================================
      // Team paddock buildings — mix of white + pastel
      for (let i = 0; i < 10; i++) {
        const k = K(0.88 + i * 0.008);
        building(k, 1, 17 + (i % 3) * 16, 18, 12 + (i % 3) * 7, 22,
          { wall: (i % 4) ? WHITE : PASTELS[i % PASTELS.length], window: GLASS, floor: 3 });
      }
      // Final corner grandstands
      for (let i = 0; i < 2; i++) {
        grandstand(0.88 + i * 0.035, -1, 14, 80, GREYWHITE, [CORAL, TEAL][i]);
      }
      // Palms around paddock
      for (let i = 0; i < 14; i++) {
        palm(K(0.88 + i * 0.006), (i % 2) ? 1 : -1, 12 + (i % 3) * 5, 8 + hash(i * 4) * 2,
          (i % 2) ? PALM_GREEN : PALM_DARK);
      }

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
      // TROPICAL PALM DENSITY LAYERS — Miami aesthetic
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
