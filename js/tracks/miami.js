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
      const TEAL      = [0.20, 0.80, 0.78];
      const CORAL     = [1.0,  0.55, 0.45];
      const PINK      = [1.0,  0.65, 0.80];
      const WHITE     = [0.94, 0.95, 0.96];
      const GREYWHITE = [0.80, 0.82, 0.84];
      const PALM_GREEN = [0.20, 0.55, 0.25];
      const PALM_DARK  = [0.16, 0.45, 0.20];
      const GLASS     = [0.55, 0.72, 0.78];
      const CONCRETE  = [0.70, 0.70, 0.72];
      const WATER     = [0.13, 0.46, 0.62];
      const WATER_DEEP = [0.08, 0.32, 0.48];
      const PASTELS   = [TEAL, CORAL, PINK, [0.75, 0.90, 1.0], [1.0, 0.85, 0.55]];
      // Night/emissive colours
      const LAMP_WARM = [1.0,  0.92, 0.70];
      const FLOOD_WH  = [0.98, 0.97, 0.92];
      const WIN_AMBER = [1.0,  0.88, 0.55];

      // ===================================================================
      // Shared overpass builder — used at s 0.635 and 0.685 (Turnpike zone).
      // FIXED: pushed both further into the Turnpike zone, away from the
      // start/finish gantry.  Pillars are now spaced only inside the
      // overpass deck footprint (pillar offset clamped to ±span*0.38 so they
      // never extend into the circuit's start sector).
      // ===================================================================
      const buildOverpass = (s) => {
        const k = K(s);
        const aL = anchor(k, -1, 1), aR = anchor(k, 1, 1);
        const span = Math.hypot(aR.c[0] - aL.c[0], aR.c[2] - aL.c[2]) + 16;
        const mid = vadd(aL.c, [(aR.c[0] - aL.c[0]), 0, (aR.c[2] - aL.c[2])], 0.5);
        // Main deck — concrete top, darker underside shadow band
        addBox(out, vadd(mid, aL.u, 13.2), [span, 2.8, 16], CONCRETE,   [aL.r, aL.u, aL.t]);
        addBox(out, vadd(mid, aL.u, 11.4), [span, 1.2, 16], [0.50, 0.50, 0.54], [aL.r, aL.u, aL.t]);
        addBox(out, vadd(mid, aL.u, 10.8), [span, 0.8, 16], [0.24, 0.24, 0.26], [aL.r, aL.u, aL.t]);
        // Two pillars per side — kept within ±38 % of the half-span so they
        // cannot drift into adjacent start-line geometry.
        const pillarReach = span * 0.38;
        for (let pi = 0; pi < 4; pi++) {
          // positions: -pillarReach, -pillarReach*0.33, +pillarReach*0.33, +pillarReach
          const t = [-1, -0.33, 0.33, 1][pi];
          const pillarOff = t * pillarReach;
          const pc = [
            mid[0] + aL.r[0] * pillarOff,
            mid[1],
            mid[2] + aL.r[2] * pillarOff,
          ];
          // Pillar body (height raised to just touch the deck underside)
          addBox(out, vadd(pc, aL.u, 5.5),  [3.4, 11,  3.4], CONCRETE,              [aL.r, aL.u, aL.t]);
          // Pillar cap (flush bracket under the deck)
          addBox(out, vadd(pc, aL.u, 11.2), [4.0,  0.4, 4.0], [0.45, 0.45, 0.47],  [aL.r, aL.u, aL.t]);
        }
        // Day: thin white road-marking stripe on the deck top
        addBox(out, vadd(mid, aL.u, 14.8), [span, 0.1, 1.2], WHITE, [aL.r, aL.u, aL.t]);
        // Night / atmosphere: amber under-deck sodium lights (emissive look)
        addBox(out, vadd(mid, aL.u, 10.5), [span * 0.7, 0.3, 0.6], WIN_AMBER, [aL.r, aL.u, aL.t]);
      };

      // ===================================================================
      // FAR HORIZON HAZE BAND — soft pastel ring wrapping the whole lap.
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
      // MIAMI DOWNTOWN SKYLINE — glass tower cluster far NE of the circuit.
      // ===================================================================
      {
        const dx = 0.62, dz = -0.78;
        const ddist = Math.hypot(dx, dz);
        const ux = dx / ddist, uz = dz / ddist;
        const vx = -uz, vz = ux;
        const baseDist = rad + 360;
        const dcx = cx + ux * baseDist, dcz = cz + uz * baseDist;
        const TOWER_COLS = [GLASS, [0.62, 0.78, 0.84], [0.50, 0.66, 0.74],
          [0.72, 0.84, 0.90], [0.45, 0.62, 0.72]];
        for (let i = 0; i < 46; i++) {
          const h0 = hash(i * 13.1), h1 = hash(i * 7.7 + 2), h2 = hash(i * 3.3 + 5);
          const spread = (h1 - 0.5) * 560;
          const depth  = (h2 - 0.5) * 360;
          const tx = dcx + vx * spread + ux * depth;
          const tz = dcz + vz * spread + uz * depth;
          const central = 1 - Math.min(1, (Math.abs(spread) / 280 + Math.abs(depth) / 220) * 0.5);
          const th = 70 + central * 150 + h0 * 60;
          const tw = 22 + h1 * 26;
          if (onTrack(tx, tz, tw * 0.7)) continue;
          const col = TOWER_COLS[i % TOWER_COLS.length];
          const settledY = pyMin - 2;
          // tapered glass tower
          addFrustum(out, [tx, settledY, tz], tw * 0.5, tw * 0.34, th, col, 5, null);
          // darker window-mullion core
          addBox(out, [tx, settledY + th * 0.5, tz], [tw * 0.6, th, tw * 0.6],
            [col[0] * 0.78, col[1] * 0.82, col[2] * 0.86], null);
          // bright glass cap
          addBox(out, [tx, settledY + th, tz], [tw * 0.42, tw * 0.5, tw * 0.42], WHITE, null);
          if (th > 150) addCyl(out, [tx, settledY + th + tw * 0.25, tz], 0.6, 16 + h0 * 18,
            [0.85, 0.85, 0.88], 4, null);
          // Lit windows emissive stripe (night reads as glowing tower)
          if (i % 3 !== 2)
            addBox(out, [tx, settledY + th * 0.55, tz], [tw * 0.62, th * 0.35, tw * 0.12],
              [WIN_AMBER[0] * 0.9, WIN_AMBER[1] * 0.7, WIN_AMBER[2] * 0.3], null);
        }
        // Mid-rise pastel blocks skirting the tower cluster
        for (let i = 0; i < 26; i++) {
          const h1 = hash(i * 9.9 + 11), h2 = hash(i * 4.4 + 13);
          const spread = (h1 - 0.5) * 720;
          const depth  = 120 + h2 * 200;
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
      // s 0.00 R — HARD ROCK STADIUM: massive elliptical bowl.
      // Anchor pushed to dist=100 (was 96) so the bowl edge stays well clear
      // of the start gantry legs (which sit at dist≈1.5 on each side).
      // Floodlight masts at the same ellipse ring, so they're also clear.
      // ===================================================================
      {
        const a = anchor(K(0.0), 1, 100);
        const r = a.r, u = a.u, t = a.t;
        const RA = 125, RB = 95;
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
          const h = 42 + (i % 3) * 4;
          const segW = 18;
          // lower raked seating
          addBox(out, vadd(vadd(c, u, h * 0.5), rad2, 6),  [11, h + 2, segW], GREYWHITE,  [rad2, u, tan]);
          // upper shell tier
          addBox(out, vadd(vadd(c, u, h + 9),   rad2, 8),  [10, 16, segW + 1], WHITE,      [rad2, u, tan]);
          // coral/teal rim crown
          addBox(out, vadd(vadd(c, u, h + 20),  rad2, 8),  [11, 3.2, segW + 1],
            (i % 2) ? CORAL : TEAL, [rad2, u, tan]);
          // crowd colour detail
          if (i % 2 === 0)
            addBox(out, vadd(vadd(c, u, h * 0.6), rad2, 0), [1.5, h * 0.65, segW - 2],
              PASTELS[(i * 3) % PASTELS.length], [rad2, u, tan]);
          if (i % 3 === 1)
            addBox(out, vadd(vadd(c, u, h * 0.45), rad2, 2), [0.8, h * 0.5, segW - 3],
              PASTELS[(i * 5 + 2) % PASTELS.length], [rad2, u, tan]);
        }
        // 6 floodlight masts — placed on the same ellipse ring as the bowl wall,
        // so they anchor to the stadium structure (not floating outside it).
        for (let i = 0; i < 6; i++) {
          const ang = (i + 0.5) / 6 * 6.2832;
          const ex = Math.cos(ang) * RA, ez = Math.sin(ang) * RB;
          const c = vadd(vadd([a.c[0], by, a.c[2]], t, ex), r, ez);
          addCyl(out, vadd(c, u, 0),  1.0, 64, GREYWHITE, 6, [r, u, t]); // mast shaft
          addBox(out, vadd(c, u, 64), [12, 3.6, 4], WHITE, [r, u, t]);   // crossbeam
          // Light ring — warm-white emissive tone for day and night reads
          addCyl(out, vadd(c, u, 62), 4.5, 1.2, FLOOD_WH, 8, [r, u, t]);
          // Light spill patch below the mast (emissive ground pool — bright circle)
          addBox(out, vadd(c, u, 0.05), [18, 0.2, 18], [0.96, 0.96, 0.88], [r, u, t]);
        }
        // Massive curved roof cap
        addFrustum(out, vadd([a.c[0], by, a.c[2]], u, 50), 110, 70, 16,
          [0.82, 0.84, 0.86], 48, [r, u, t]);
        // Roof underside shadow stripe
        addFrustum(out, vadd([a.c[0], by, a.c[2]], u, 49), 112, 72, 0.8,
          [0.55, 0.55, 0.57], 48, [r, u, t]);
      }

      // ===================================================================
      // s 0.00 L near — pit lane & paddock building block.
      // ===================================================================
      {
        const k = K(0.0);
        place(k, -1, 24, [22, 9, 120], WHITE);
        place(k, -1, 14, [1.0, 6, 116], GLASS);
        place(k, -1, 24, [22.4, 1.5, 120], GREYWHITE);
        // paddock club terrace
        building(k, -1, 42, 26, 22, 120, { wall: WHITE, window: GLASS, floor: 6 });
        // pit wall
        wall(0.0, 0.05, -1, 2.2, 1.1, GREYWHITE);
      }

      // ===================================================================
      // START/FINISH GANTRIES — separated further to avoid mutual clipping.
      // The timing gantry (coral) is at s=0.014 (was 0.012).
      // The dark scoring arch is at s=0.0.
      // Both are placed at the same s so the K() indices differ enough,
      // then a lamp post cluster marks the start line for night reads.
      // ===================================================================
      gantry(0.0,   6.6, [0.18, 0.20, 0.24]);   // dark scoring arch (start line)
      gantry(0.014, 7.0, CORAL);                  // coral timing gantry (slightly further back)

      // Lamp posts flanking the start line — both sides, every ~30 m along the pit straight
      for (let i = 0; i < 10; i++) {
        const k = K(0.0 + i * 0.006);
        // Right side lamp posts (stadium side)
        const aR = anchor(k, 1, 10);
        addCyl(out, aR.c, 0.18, 10, [0.68, 0.68, 0.70], 5, [aR.r, aR.u, aR.t]);
        addBox(out, vadd(aR.c, aR.u, 10.2), [3.0, 0.4, 0.4], [0.68, 0.68, 0.70], [aR.r, aR.u, aR.t]);
        addBox(out, vadd(aR.c, aR.u, 10.0), [1.6, 0.5, 1.2], LAMP_WARM, [aR.r, aR.u, aR.t]);
        // Left side lamp posts (pit side)
        const aL = anchor(k, -1, 10);
        addCyl(out, aL.c, 0.18, 10, [0.68, 0.68, 0.70], 5, [aL.r, aL.u, aL.t]);
        addBox(out, vadd(aL.c, aL.u, 10.2), [3.0, 0.4, 0.4], [0.68, 0.68, 0.70], [aL.r, aL.u, aL.t]);
        addBox(out, vadd(aL.c, aL.u, 10.0), [1.6, 0.5, 1.2], LAMP_WARM, [aL.r, aL.u, aL.t]);
      }

      // palms lining the pit straight
      for (let i = 0; i < 14; i++) {
        palm(K(0.0 + i * 0.006), -1, 9 + (i % 2) * 4,  8 + hash(i)     * 4, PALM_GREEN);
        palm(K(0.0 + i * 0.006),  1, 46 + (i % 2) * 6, 9 + hash(i * 5) * 4, PALM_DARK);
      }
      // sponsor billboards along the pit wall
      billboard(K(0.02),  -1, 11, 16, 7, TEAL);
      billboard(K(0.035), -1, 11, 16, 7, CORAL);
      billboard(K(0.05),  -1, 11, 16, 7, PINK);

      // ===================================================================
      // s 0.05–0.12 R mid — T1 ZONE: grandstands + pastel cubes + palms
      // ===================================================================
      for (let i = 0; i < 4; i++) {
        const s   = 0.05 + i * 0.015;
        const side = (i % 2) ? 1 : -1;
        const col  = [TEAL, CORAL, PINK, [0.90, 0.50, 0.70]][i];
        grandstand(s, side, 11, 95 + i * 5, GREYWHITE, col);
      }
      // Hospitality cubes with lit window bands
      for (let i = 0; i < 8; i++) {
        building(K(0.04 + i * 0.007), 1, 26 + (i % 2) * 12, 18, 15 + (i % 3) * 8, 18,
          { wall: PASTELS[i % PASTELS.length], window: GLASS, floor: 4 });
      }
      for (let i = 0; i < 10; i++) palm(K(0.04 + i * 0.006), 1, 11 + (i % 2) * 5, 8 + hash(i) * 2, PALM_GREEN);

      // ===================================================================
      // s 0.15 both near — concrete barriers + debris fence
      // ===================================================================
      wall(0.13, 0.19,  1, 3, 1.2, CONCRETE);
      wall(0.13, 0.19, -1, 3, 1.2, CONCRETE);
      fence(0.13, 0.19,  1, 3.5, 3.5, [0.78, 0.80, 0.82]);

      // ===================================================================
      // s 0.20 L mid — palm tree cluster + pastel low-rise buildings
      // ===================================================================
      for (let i = 0; i < 18; i++) {
        const k = K(0.18 + (i % 6) * 0.004);
        palm(k, -1, 12 + (i % 4) * 7 + hash(i) * 4,   8 + hash(i * 7) * 5,
          (i % 2) ? PALM_GREEN : PALM_DARK);
        palm(K(0.18 + (i % 6) * 0.005), 1, 14 + (i % 3) * 6, 8 + hash(i * 3) * 4,
          (i % 2) ? PALM_DARK : PALM_GREEN);
      }
      for (let i = 0; i < 6; i++) {
        building(K(0.19 + i * 0.007), -1, 32 + (i % 2) * 16, 16, 14 + (i % 3) * 9, 16,
          { wall: PASTELS[(i + 2) % PASTELS.length], window: GLASS, floor: 4 });
      }

      // ===================================================================
      // s 0.27 R — MIA MARINA: "water" slab + moored yachts.
      // Yachts: hull centre placed at u*1.6 (was 1.6 — kept, sits on the
      // water plane which is sub-grade so hulls visually float just above it).
      // Masts anchored from the hull base (u*7.0 above ground = mast foot).
      // Superyacht at s=0.32 set back to dist=32 (was 30) so it clears
      // the water boundary cleanly.
      // ===================================================================
      for (let m = 0; m < 5; m++) {
        const k = K(0.27 + m * 0.026);
        groundPlane(k, 1, 5.5, [180, 160], WATER);
        groundPlane(k, 1, 6.8, [200, 180], WATER_DEEP);
        groundPlane(k, 1, 7,   [160,   6], [0.68, 0.68, 0.66]); // pontoon walkway
        for (let i = 0; i < 14; i++) {
          const a = anchor(k, 1, 14 + (i % 6) * 22);
          const off = (i - 7) * 16 + hash(i * 11 + m * 7) * 8;
          const c = vadd(a.c, a.t, off);
          const len = 12 + hash(i * 4 + m) * 13;
          const trim = (i % 3 === 0) ? TEAL : ((i % 3 === 1) ? CORAL : PINK);
          // Hull: centre lifted 1.6 m above anchor (water surface level)
          addBox(out, vadd(c, a.u, 1.6),      [6,   3.4, len],        WHITE,     [a.r, a.u, a.t]);
          addBox(out, vadd(c, a.u, 3.0),      [6.4, 0.8, len],        trim,      [a.r, a.u, a.t]);
          addBox(out, vadd(c, a.u, 4.2),      [4.2, 2.6, len * 0.58], GREYWHITE, [a.r, a.u, a.t]);
          addBox(out, vadd(c, a.u, 6.2),      [2.6, 1.8, len * 0.36], GLASS,     [a.r, a.u, a.t]);
          // Mast base at top of cabin (u*7.0); bimini arm
          if (len > 16) {
            addCyl(out, vadd(c, a.u, 7.0), 0.22, 10 + hash(i + m) * 5, GREYWHITE, 5, [a.r, a.u, a.t]);
            addBox(out, vadd(c, a.u, 7.8), [3.2, 0.5, 1.6], WHITE, [a.r, a.u, a.t]);
          }
          // Port-side running light (red) and starboard (green) — emissive dots
          addBox(out, vadd(vadd(c, a.r,  3.4), a.u, 3.2), [0.5, 0.5, 0.5], [0.15, 0.80, 0.25], [a.r, a.u, a.t]);
          addBox(out, vadd(vadd(c, a.r, -3.4), a.u, 3.2), [0.5, 0.5, 0.5], [0.90, 0.15, 0.15], [a.r, a.u, a.t]);
        }
        // Jet skis / tenders
        for (let i = 0; i < 6; i++) {
          const a = anchor(k, 1, 8 + (i % 4) * 32);
          const c = vadd(a.c, a.t, (i - 3) * 28 + hash(i * 19 + m) * 10);
          addBox(out, vadd(c, a.u, 0.8), [2.0, 1.2, 3.8], (i % 2) ? CORAL : TEAL, [a.r, a.u, a.t]);
        }
      }
      // Marina waterfront palms
      for (let i = 0; i < 18; i++) palm(K(0.26 + i * 0.0045), 1, 9 + (i % 3) * 3, 9 + hash(i * 7) * 3, PALM_GREEN);

      // s 0.32 R near — superyacht hospitality: long white multi-deck box.
      // dist bumped to 32 (was 30) to avoid hull overlap with the pontoon.
      {
        const k = K(0.32);
        const a = anchor(k, 1, 32);
        addBox(out, vadd(a.c, a.u,  5), [10, 10, 60], WHITE,     [a.r, a.u, a.t]);
        addBox(out, vadd(a.c, a.u,  7), [10.4, 2.4, 56], TEAL,  [a.r, a.u, a.t]);
        addBox(out, vadd(a.c, a.u, 11), [8,  4, 40], GREYWHITE,  [a.r, a.u, a.t]);
        // Lit portholes / windows on the upper deck
        addBox(out, vadd(a.c, a.u,  8), [10.5, 0.8, 54], [WIN_AMBER[0]*0.7, WIN_AMBER[1]*0.6, WIN_AMBER[2]*0.2], [a.r, a.u, a.t]);
      }

      // ===================================================================
      // s 0.43–0.52 L mid — stadium-lot zone: grandstands + cubes + palms
      // ===================================================================
      for (let i = 0; i < 3; i++) {
        grandstand(0.43 + i * 0.035, -1, 13, 85 + i * 10, GREYWHITE,
          [PINK, TEAL, CORAL][i]);
      }
      for (let i = 0; i < 6; i++) {
        const col = [TEAL, CORAL, PINK, [0.92, 0.80, 0.40], [0.70, 0.85, 1.0], [1.0, 0.75, 0.55]][i];
        building(K(0.44 + i * 0.008), -1, 24 + (i % 2) * 14, 16, 14 + (i % 3) * 10, 18,
          { wall: col, window: GLASS, floor: 4 });
      }
      for (let i = 0; i < 10; i++) palm(K(0.43 + i * 0.005), -1, 12 + (i % 2) * 4, 8 + hash(i * 3) * 2, PALM_GREEN);

      // ===================================================================
      // s 0.50–0.60 R mid — BRAKING ZONE: palms, billboards, cubes
      // ===================================================================
      for (let i = 0; i < 16; i++) palm(K(0.50 + i * 0.004),  1, 11 + (i % 3) * 6, 9 + hash(i)     * 2, PALM_GREEN);
      for (let i = 0; i < 6;  i++) palm(K(0.55 + i * 0.005), -1, 12 + (i % 2) * 5, 8 + hash(i * 2) * 1, PALM_DARK);
      billboard(K(0.50), 1, 11, 18, 9, CORAL);
      billboard(K(0.52), 1, 10, 16, 8, TEAL);
      billboard(K(0.54), 1, 10, 16, 8, PINK);
      for (let i = 0; i < 5; i++) {
        building(K(0.51 + i * 0.007), 1, 22 + (i % 2) * 16, 16, 16 + (i % 3) * 8, 16,
          { wall: PASTELS[(i + 1) % PASTELS.length], window: GLASS, floor: 4 });
      }

      // ===================================================================
      // s 0.635 & 0.685 — FLORIDA TURNPIKE OVERPASSES (FIXED positions).
      // Moved from 0.62/0.67 to 0.635/0.685 to ensure maximum separation
      // from both the start gantry (s≈0) and the back straight billboards.
      // ===================================================================
      buildOverpass(0.635);
      buildOverpass(0.685);

      // Lamp posts lining the underpass approaches (both sides)
      for (let i = 0; i < 6; i++) {
        const sBase = 0.615 + i * 0.014;
        const aL = anchor(K(sBase), -1, 5);
        const aR = anchor(K(sBase),  1, 5);
        addCyl(out, aL.c, 0.16, 8.5, [0.65, 0.65, 0.67], 5, [aL.r, aL.u, aL.t]);
        addBox(out, vadd(aL.c, aL.u, 8.6), [0.4, 0.4, 2.2], [0.65, 0.65, 0.67], [aL.r, aL.u, aL.t]);
        addBox(out, vadd(aL.c, aL.u, 8.4), [1.4, 0.5, 1.0], LAMP_WARM, [aL.r, aL.u, aL.t]);
        addCyl(out, aR.c, 0.16, 8.5, [0.65, 0.65, 0.67], 5, [aR.r, aR.u, aR.t]);
        addBox(out, vadd(aR.c, aR.u, 8.6), [0.4, 0.4, 2.2], [0.65, 0.65, 0.67], [aR.r, aR.u, aR.t]);
        addBox(out, vadd(aR.c, aR.u, 8.4), [1.4, 0.5, 1.0], LAMP_WARM, [aR.r, aR.u, aR.t]);
      }

      // ===================================================================
      // s 0.77–0.85 both — BACK STRAIGHT (DRS zone): grandstands + cubes
      // ===================================================================
      for (let i = 0; i < 4; i++) {
        const s = 0.77 + i * 0.025;
        grandstand(s, -1, 12, 105 + i * 5, GREYWHITE, PASTELS[i % PASTELS.length]);
      }
      for (let i = 0; i < 8; i++) {
        building(K(0.77 + i * 0.007), -1, 24 + (i % 2) * 16, 16, 15 + (i % 3) * 10, 16,
          { wall: PASTELS[(i + 1) % PASTELS.length], window: GLASS, floor: 4 });
      }
      for (let i = 0; i < 12; i++) {
        palm(K(0.76 + i * 0.006), (i % 2) ? 1 : -1, 12 + (i % 2) * 4, 8 + hash(i * 5) * 2, PALM_GREEN);
      }
      // Stadium-style floodlights on the back straight (4 masts)
      for (let i = 0; i < 4; i++) {
        const a = anchor(K(0.77 + i * 0.025), (i % 2) ? 1 : -1, 22);
        addCyl(out, a.c,                0.55, 28, GREYWHITE, 6, [a.r, a.u, a.t]);
        addBox(out, vadd(a.c, a.u, 28), [8,   2.4, 2.8], [0.78, 0.80, 0.82], [a.r, a.u, a.t]);
        addCyl(out, vadd(a.c, a.u, 26), 2.8,  0.9, FLOOD_WH, 7, [a.r, a.u, a.t]);
        // light-pool patch at base
        addBox(out, vadd(a.c, a.u, 0.06), [12, 0.2, 12], [0.96, 0.96, 0.88], [a.r, a.u, a.t]);
      }

      // ===================================================================
      // s 0.88–0.96 R — PADDOCK & FINAL CORNER: team buildings + grandstand
      // ===================================================================
      for (let i = 0; i < 10; i++) {
        const k = K(0.88 + i * 0.008);
        building(k, 1, 17 + (i % 3) * 16, 18, 12 + (i % 3) * 7, 22,
          { wall: (i % 4) ? WHITE : PASTELS[i % PASTELS.length], window: GLASS, floor: 3 });
      }
      for (let i = 0; i < 2; i++) {
        grandstand(0.88 + i * 0.035, -1, 14, 80, GREYWHITE, [CORAL, TEAL][i]);
      }
      for (let i = 0; i < 14; i++) {
        palm(K(0.88 + i * 0.006), (i % 2) ? 1 : -1, 12 + (i % 3) * 5, 8 + hash(i * 4) * 2,
          (i % 2) ? PALM_GREEN : PALM_DARK);
      }

      // ===================================================================
      // s 0.96 both near — final-corner barrier walls
      // ===================================================================
      wall(0.94, 0.99,  1, 3, 1.2, CONCRETE);
      wall(0.94, 0.99, -1, 3, 1.2, CONCRETE);
      fence(0.94, 0.99,  1, 3.5, 3.2, [0.78, 0.80, 0.82]);

      // ===================================================================
      // LAP-WIDE TRACK FURNITURE — barriers, fences, guardrail, tyre walls,
      // marshal posts, shrubs, sponsor billboards.
      // ===================================================================
      for (const [s0, s1] of [[0.32, 0.42], [0.55, 0.635], [0.635, 0.72], [0.83, 0.90]]) {
        wall(s0, s1,  1, 3, 1.0, CONCRETE);
        wall(s0, s1, -1, 3, 1.0, CONCRETE);
        fence(s0, s1,  1, 3.4, 3.0, [0.80, 0.82, 0.84]);
      }
      guardrail(0.005, 0.05,  1, 3, GREYWHITE);
      guardrail(0.72,  0.80, -1, 3, GREYWHITE);
      // Tyre walls at chicane apexes
      tyreWall(0.645, 0.66,  1, 2.4, CORAL);
      tyreWall(0.66,  0.69, -1, 2.4, TEAL);
      tyreWall(0.155, 0.175, -1, 2.4, PINK);
      // Marshal posts
      every(180, (k) => { if (!onTrack(px[k], pz[k], 9)) marshalPost(k, 1, 5); });
      // Low shrubs
      for (let i = 0; i < 10; i++) {
        bush(K(0.72 + i * 0.006), -1, 6 + (i % 2) * 3, PALM_GREEN);
        bush(K(0.05 + i * 0.005),  1, 6 + (i % 2) * 3, PALM_DARK);
      }
      // Scatter palms on infield-adjacent edges
      for (let i = 0; i < 24; i++) {
        const s = i / 24;
        const side = (i % 2) ? 1 : -1;
        palm(K(s + 0.002), side, 16 + hash(i * 31) * 14, 7 + hash(i * 13) * 4,
          (i % 2) ? PALM_GREEN : PALM_DARK);
      }

      // ===================================================================
      // TROPICAL PALM DENSITY LAYERS
      // ===================================================================
      every(12, (k) => {
        const s = k / n;
        if (s >= 0.26 && s <= 0.38) {
          const h = hash(k * 41 + 13);
          palm(k, -1, 11 + h * 8, 8 + h * 4, (h < 0.4) ? PALM_GREEN : PALM_DARK);
          palm(k,  1, 13 + h * 7, 8 + h * 4, (h < 0.6) ? PALM_GREEN : PALM_DARK);
          if (h < 0.7) palm(k, (h < 0.35) ? -1 : 1, 18 + h * 5, 7 + h * 3, PALM_GREEN);
        }
      });
      every(16, (k) => {
        const s = k / n;
        if (s >= 0.72 && s <= 0.88) {
          const h = hash(k * 43 + 17);
          palm(k, -1, 10 + h * 6, 8 + h * 4, (h < 0.5) ? PALM_GREEN : PALM_DARK);
          palm(k,  1, 12 + h * 5, 7 + h * 3, PALM_GREEN);
        }
      });
      every(25, (k) => {
        const h = hash(k * 47 + 19);
        const inTech   = (k / n > 0.60 && k / n < 0.75);
        const onStretch = (k / n < 0.12 || (k / n > 0.38 && k / n < 0.55));
        if (inTech || onStretch || h > 0.45) {
          palm(k, (h < 0.5) ? -1 : 1, 11 + h * 10, 8 + h * 4,
            (h < 0.5) ? PALM_GREEN : PALM_DARK);
        }
      });

      // ===================================================================
      // BILLBOARD STRIP — Miami Vice saturated palette
      // ===================================================================
      billboard(K(0.08),  -1, 14, 14, 16, [0.0,  0.70, 0.80]);
      billboard(K(0.18),   1, 15, 13, 15, [1.0,  0.40, 0.20]);
      billboard(K(0.35),  -1, 16, 14, 16, [0.95, 0.30, 0.60]);
      billboard(K(0.48),   1, 15, 13, 15, [0.0,  0.75, 0.85]);
      billboard(K(0.65),  -1, 14, 14, 16, [1.0,  0.55, 0.10]);
      billboard(K(0.85),   1, 15, 13, 15, [0.20, 0.80, 0.75]);
    },
  }
  );
})();
