/* Apex 26 — MIAMI circuit definition (data only).
   Registered on the global TrackDefs list; consumed by the js/tracks.js engine
   (palette resolved there from `night`, geometry from js/circuits.js or `segs`). */
(function () {
  "use strict";
  (window.TrackDefs = window.TrackDefs || []).push(
  {
    id: "miami",
    reverse: false, // direction switched to real-world CW/CCW (was auto-audit reverse:true)
    name: "MIAMI",
    gp: "Miami GP",
    country: "USA",
    night: false,
    theme: "modern",
    lengthKm: 5.4,
    baseHW: 7,
    pal: { zenith: [0.22, 0.5, 0.88], horizon: [0.74, 0.8, 0.86], grass: [0.20, 0.42, 0.18], runoff: [0.56, 0.48, 0.34], fogDensity: 0.001, sunDir: [0.3131803839972462, 0.7933903061263571, 0.521967306662077], sun: [1, 0.96, 0.82], sunColor: [1, 0.94, 0.8] },
    segs: [
      { t: 0, l: 300 }, { t: 60, l: 80 }, { t: -65, l: 70 }, { t: 0, l: 200 }, { t: -80, l: 90 }, { t: 90, l: 100 },
      { t: -70, l: 80 }, { t: 0, l: 400 }, { t: 80, l: 90 }, { t: -80, l: 90 }, { t: 0, l: 240 },
    ],
    // Hard Rock Stadium: gentle rise through the stadium section (overpass area).
    elevations: [{ s: 0.42, halfM: 280, rise: 4 }],
    scenery: function (api) {
      const {
        out, n, px, pz, pyMin, place, prop, backdrop, groundPlane, grandstand,
        building, tower, billboard, palm, bush, fence, wall, guardrail, tyreWall,
        marshalPost, gantry, anchor, addBox, addCyl, addPrism, addPyramid,
        addCone, addFrustum, vadd, hash, onTrack, every, cityFront, forestEdge,
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
      const TEAL       = [0.20, 0.80, 0.78];
      const CORAL      = [1.0,  0.55, 0.45];
      const PINK       = [1.0,  0.65, 0.80];
      const WHITE      = [0.94, 0.95, 0.96];
      const GREYWHITE  = [0.80, 0.82, 0.84];
      const PALM_GREEN = [0.20, 0.55, 0.25];
      const PALM_DARK  = [0.16, 0.45, 0.20];
      const GLASS      = [0.55, 0.72, 0.78];
      const CONCRETE   = [0.70, 0.70, 0.72];
      const WATER      = [0.13, 0.46, 0.62];
      const WATER_DEEP = [0.08, 0.32, 0.48];
      const PASTELS    = [TEAL, CORAL, PINK, [0.75, 0.90, 1.0], [1.0, 0.85, 0.55]];
      // Night/emissive colours
      const LAMP_WARM  = [1.0,  0.92, 0.70];
      const FLOOD_WH   = [0.98, 0.97, 0.92];
      const WIN_AMBER  = [1.0,  0.88, 0.55];
      const WIN_COOL   = [0.68, 0.85, 1.0];

      // Miami skyline building palette — pastel tropical glass towers
      const SKY_PAL = [
        [0.62, 0.82, 0.88],   // glass-teal
        [0.88, 0.76, 0.62],   // warm sandstone
        [0.76, 0.88, 0.82],   // mint
        [0.94, 0.82, 0.68],   // peach
        [0.58, 0.74, 0.90],   // ice-blue
        [0.82, 0.90, 0.76],   // sage
      ];

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
        addBox(out, vadd(mid, aL.u, 13.2), [span, 2.8, 16], CONCRETE,               [aL.r, aL.u, aL.t]);
        addBox(out, vadd(mid, aL.u, 11.4), [span, 1.2, 16], [0.50, 0.50, 0.54],     [aL.r, aL.u, aL.t]);
        addBox(out, vadd(mid, aL.u, 10.8), [span, 0.8, 16], [0.24, 0.24, 0.26],     [aL.r, aL.u, aL.t]);
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
          // Pillar body — height 10.4 so top cap sits flush under the deck underside at 10.8
          addBox(out, vadd(pc, aL.u, 5.2),  [3.4, 10.4, 3.4], CONCRETE,              [aL.r, aL.u, aL.t]);
          // Pillar cap bracket — centred at 10.8 (deck underside)
          addBox(out, vadd(pc, aL.u, 10.6), [4.0,  0.4,  4.0], [0.45, 0.45, 0.47],  [aL.r, aL.u, aL.t]);
        }
        // Day: thin white road-marking stripe on the deck top
        addBox(out, vadd(mid, aL.u, 14.8), [span, 0.1, 1.2], WHITE,      [aL.r, aL.u, aL.t]);
        // Night / atmosphere: amber under-deck sodium lights (emissive look)
        addBox(out, vadd(mid, aL.u, 10.5), [span * 0.7, 0.3, 0.6], WIN_AMBER, [aL.r, aL.u, aL.t]);
      };

      // ===================================================================
      // MIAMI DOWNTOWN SKYLINE — backdrop() calls so the auto-window-band
      // code fires for every tower (isBld: h>26 && h>depth).
      // Kept to 36 total backdrop calls for SwiftShader performance budget.
      // COLOUR RULE: no entry may have g > r AND g > b*1.05 — that triggers
      // backdrop()'s green-terrain mound path instead of the building path.
      // ===================================================================
      {
        const SKY_COLS = [
          [0.62, 0.82, 0.88],   // glass-teal    (b>g: OK)
          [0.75, 0.86, 0.92],   // pale ice-blue (b>g: OK)
          [0.88, 0.76, 0.62],   // warm sandstone (r>g: OK)
          [0.84, 0.82, 0.90],   // lavender-blue  (b>g: OK)
          [0.94, 0.82, 0.68],   // peach          (r>g: OK)
          [0.58, 0.74, 0.90],   // sky-blue glass (b>g: OK)
          [0.85, 0.82, 0.76],   // warm stone     (r>g: OK)
          [0.68, 0.78, 0.85],   // steel-blue     (b>g: OK)
        ];
        // 24 tall skyscrapers — concentrated on main straight + T1 arc (s 0.9→0.2)
        // where the skyline is most visible. A few scatter around the far side.
        for (let i = 0; i < 24; i++) {
          const h0 = hash(i * 13.1 + 1), h1 = hash(i * 7.7 + 3), h2 = hash(i * 3.3 + 7);
          const kFrac = (i < 18)
            ? ((i / 18) * 0.30 + 0.90) % 1.0   // s 0.90 → 0.20 (main straight arc)
            : (i - 18) / 6 * 0.40 + 0.30;       // s 0.30 → 0.70 (far arc scatter)
          const k = K(kFrac);
          const side = (i % 3 === 2) ? -1 : 1;
          const dist = 500 + h0 * 300;           // 500–800 m — truly horizon-far
          const bW = 22 + h1 * 16;               // 22–38 m wide
          const bH = 60 + h0 * 100 + (i < 8 ? 60 : 0); // core towers taller
          const bD = 14 + h2 * 8;                // 14–22 m deep — ensures isBld fires
          backdrop(k, side, dist, [bW, bH, bD], SKY_COLS[i % SKY_COLS.length]);
        }
        // 12 mid-rise pastel blocks forming the streetscape skirt below the skyline.
        // Wider and shorter, positioned at medium distance.
        for (let i = 0; i < 12; i++) {
          const h0 = hash(i * 9.9 + 11), h1 = hash(i * 4.4 + 13), h2 = hash(i * 6.1 + 17);
          const kFrac = (i / 12 + 0.85) % 1.0;
          const k = K(kFrac);
          const side = (i % 2) ? 1 : -1;
          const dist = 360 + h0 * 180;           // 360–540 m
          const bW = 30 + h1 * 18;               // 30–48 m
          const bH = 32 + h2 * 38;               // 32–70 m (ensure bH > bD for isBld)
          const bD = 16 + h0 * 8;                // 16–24 m
          const col = PASTELS[(i * 2) % PASTELS.length];
          const lightened = [col[0] * 0.55 + 0.40, col[1] * 0.55 + 0.40, col[2] * 0.55 + 0.40];
          backdrop(k, side, dist, [bW, bH, bD], lightened);
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
          addBox(out, vadd(vadd(c, u, h * 0.5),  rad2,  6), [11, h + 2, segW], GREYWHITE, [rad2, u, tan]);
          // upper shell tier
          addBox(out, vadd(vadd(c, u, h + 9),    rad2,  8), [10, 16, segW + 1], WHITE,     [rad2, u, tan]);
          // coral/teal rim crown
          addBox(out, vadd(vadd(c, u, h + 20),   rad2,  8), [11, 3.2, segW + 1],
            (i % 2) ? CORAL : TEAL, [rad2, u, tan]);
          // crowd colour detail — lit so the stadium bowl reads at dusk
          if (i % 2 === 0)
            addBox(out, vadd(vadd(c, u, h * 0.6), rad2, 0), [1.5, h * 0.65, segW - 2],
              PASTELS[(i * 3) % PASTELS.length], [rad2, u, tan]);
          if (i % 3 === 1)
            addBox(out, vadd(vadd(c, u, h * 0.45), rad2, 2), [0.8, h * 0.5, segW - 3],
              PASTELS[(i * 5 + 2) % PASTELS.length], [rad2, u, tan]);
          // Interior concourse lighting strips (visible from inside the bowl)
          if (i % 4 === 0)
            addBox(out, vadd(vadd(c, u, h * 0.25), rad2, -1), [1.0, h * 0.3, segW - 4],
              [WIN_AMBER[0] * 0.75, WIN_AMBER[1] * 0.6, WIN_AMBER[2] * 0.2], [rad2, u, tan]);
        }
        // 6 floodlight masts — placed on the same ellipse ring as the bowl wall,
        // so they anchor to the stadium structure (not floating outside it).
        for (let i = 0; i < 6; i++) {
          const ang = (i + 0.5) / 6 * 6.2832;
          const ex = Math.cos(ang) * RA, ez = Math.sin(ang) * RB;
          const c = vadd(vadd([a.c[0], by, a.c[2]], t, ex), r, ez);
          addCyl(out, vadd(c, u, 0),  1.0, 64, GREYWHITE, 6, [r, u, t]); // mast shaft
          addBox(out, vadd(c, u, 64), [12, 3.6, 4], WHITE, [r, u, t]);    // crossbeam
          // Light ring — warm-white emissive tone for day and night reads
          addCyl(out, vadd(c, u, 62), 4.5, 1.2, FLOOD_WH, 8, [r, u, t]);
          // Light spill patch at base
          addBox(out, vadd(c, u, 0.05), [18, 0.2, 18], [0.96, 0.96, 0.88], [r, u, t]);
        }
        // Massive curved roof cap
        addFrustum(out, vadd([a.c[0], by, a.c[2]], u, 50), 110, 70, 16,
          [0.82, 0.84, 0.86], 48, [r, u, t]);
        // Roof underside shadow stripe
        addFrustum(out, vadd([a.c[0], by, a.c[2]], u, 49), 112, 72, 0.8,
          [0.55, 0.55, 0.57], 48, [r, u, t]);
        // Concourse level: a ring of teal hospitality units around the base
        for (let i = 0; i < 8; i++) {
          const ang = i / 8 * 6.2832;
          const ex = Math.cos(ang) * (RA - 20), ez = Math.sin(ang) * (RB - 20);
          const hc = vadd(vadd([a.c[0], by, a.c[2]], t, ex), r, ez);
          if (onTrack(hc[0], hc[2], 8)) continue;
          addBox(out, [hc[0], by + 5, hc[2]], [14, 10, 14],
            (i % 2) ? TEAL : CORAL, null);
          // lit awning band
          addBox(out, [hc[0], by + 10.5, hc[2]], [14.2, 1.0, 14.2],
            [WIN_AMBER[0] * 0.65, WIN_AMBER[1] * 0.5, WIN_AMBER[2] * 0.15], null);
        }
      }

      // ===================================================================
      // s 0.00 L near — pit lane & paddock building block.
      // All buildings get lit:true for dusk/night legibility.
      // ===================================================================
      {
        const k = K(0.0);
        place(k, -1, 24, [22, 9, 120], WHITE);
        place(k, -1, 14, [1.0, 6, 116], GLASS);
        place(k, -1, 24, [22.4, 1.5, 120], GREYWHITE);
        // paddock club terrace
        building(k, -1, 42, 26, 22, 120,
          { wall: WHITE, window: GLASS, floor: 6, lit: true, windowCol: WIN_AMBER });
        // pit wall
        wall(0.0, 0.05, -1, 2.2, 1.1, GREYWHITE);
      }

      // ===================================================================
      // START/FINISH GANTRIES — separated to avoid mutual clipping.
      // The dark scoring arch is at s=0.0.
      // The coral timing gantry is at s=0.014 (slightly further along).
      // ===================================================================
      gantry(0.0,   6.6, [0.18, 0.20, 0.24]);   // dark scoring arch (start line)
      gantry(0.014, 7.0, CORAL);                  // coral timing gantry

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

      // Palms lining the pit straight
      for (let i = 0; i < 14; i++) {
        palm(K(0.0 + i * 0.006), -1,  9 + (i % 2) * 4,  8 + hash(i)     * 4, PALM_GREEN);
        palm(K(0.0 + i * 0.006),  1, 46 + (i % 2) * 6,  9 + hash(i * 5) * 4, PALM_DARK);
      }
      // Sponsor billboards along the pit wall
      billboard(K(0.02),  -1, 11, 16, 7, TEAL);
      billboard(K(0.035), -1, 11, 16, 7, CORAL);
      billboard(K(0.05),  -1, 11, 16, 7, PINK);

      // ===================================================================
      // s 0.05–0.12 R mid — T1 ZONE: grandstands + cityFront facade + palms
      // ===================================================================
      for (let i = 0; i < 4; i++) {
        const s    = 0.05 + i * 0.015;
        const side = (i % 2) ? 1 : -1;
        const col  = [TEAL, CORAL, PINK, [0.90, 0.50, 0.70]][i];
        grandstand(s, side, 11, 95 + i * 5, GREYWHITE, col);
      }
      // Coherent pastel street facade on the right — hospitality buildings
      cityFront(0.04, 0.12, 1, 26, {
        minH: 12, maxH: 32, depth: 22, step: 20,
        palette: SKY_PAL, lit: true, windowCol: WIN_AMBER,
      });
      for (let i = 0; i < 10; i++) palm(K(0.04 + i * 0.006), 1, 11 + (i % 2) * 5, 8 + hash(i) * 2, PALM_GREEN);

      // ===================================================================
      // s 0.13–0.19 — concrete barriers + debris fence + forestEdge backing
      // ===================================================================
      wall(0.13, 0.19,  1, 3, 1.2, CONCRETE);
      wall(0.13, 0.19, -1, 3, 1.2, CONCRETE);
      fence(0.13, 0.19,  1, 3.5, 3.5, [0.78, 0.80, 0.82]);
      // Palm tree line behind the fence — gap >= fence dist + canopy radius to avoid clipping
      forestEdge(0.13, 0.19, 1, 8, {
        density: 0.5, hMin: 9, hMax: 14,
        col: PALM_GREEN, col2: PALM_DARK, pineFrac: 0.0,
      });

      // ===================================================================
      // s 0.20 L mid — PALM CLUSTER + pastel low-rise street facade
      // ===================================================================
      for (let i = 0; i < 18; i++) {
        const k = K(0.18 + (i % 6) * 0.004);
        palm(k, -1, 12 + (i % 4) * 7 + hash(i) * 4,   8 + hash(i * 7) * 5,
          (i % 2) ? PALM_GREEN : PALM_DARK);
        palm(K(0.18 + (i % 6) * 0.005), 1, 14 + (i % 3) * 6, 8 + hash(i * 3) * 4,
          (i % 2) ? PALM_DARK : PALM_GREEN);
      }
      cityFront(0.18, 0.26, -1, 28, {
        minH: 10, maxH: 26, depth: 20, step: 18,
        palette: [CORAL, PINK, TEAL, [1.0, 0.85, 0.60], GREYWHITE],
        lit: true, windowCol: WIN_AMBER,
      });

      // ===================================================================
      // s 0.27–0.38 R — MIA MARINA: painted-water "fake marina" + moored yachts.
      // The real Miami GP uses a fake marina with painted blue water and
      // yachts moored dockside.  We render this as groundPlane water slabs
      // (vivid teal-blue) set back behind the barriers, with small yachts
      // and a superyacht hospitality barge.  Palms line the marina promenade.
      // Crucially we use forestEdge() on the land side so palms never clip
      // through barriers.
      // ===================================================================

      // Painted marina water ground planes — these large slabs define the visual "sea"
      for (let m = 0; m < 5; m++) {
        const k = K(0.27 + m * 0.026);
        // Outer water slab (dark deep blue)
        groundPlane(k, 1, 7.0, [200, 180], WATER_DEEP);
        // Inner shallows / wake (brighter teal)
        groundPlane(k, 1, 5.5, [160, 140], WATER);
        // Pontoon walkway along the marina edge
        groundPlane(k, 1, 4.6, [160, 6], [0.68, 0.68, 0.66]);
      }

      // Moored yachts — 4 rows of boats with varied sizes and trim colours
      for (let m = 0; m < 5; m++) {
        const k = K(0.27 + m * 0.026);
        for (let i = 0; i < 10; i++) {
          const a = anchor(k, 1, 14 + (i % 5) * 18);
          const off = (i - 5) * 20 + hash(i * 11 + m * 7) * 10;
          const c = vadd(a.c, a.t, off);
          const len = 14 + hash(i * 4 + m) * 14;
          const trim = (i % 3 === 0) ? TEAL : ((i % 3 === 1) ? CORAL : PINK);
          // Hull: lifted 1.2 m above anchor (water surface level)
          addBox(out, vadd(c, a.u, 1.2),      [5.5, 2.8, len],        WHITE,     [a.r, a.u, a.t]);
          addBox(out, vadd(c, a.u, 2.6),      [5.8, 0.8, len],        trim,      [a.r, a.u, a.t]);
          addBox(out, vadd(c, a.u, 3.6),      [4.0, 2.2, len * 0.55], GREYWHITE, [a.r, a.u, a.t]);
          addBox(out, vadd(c, a.u, 5.4),      [2.4, 1.6, len * 0.34], GLASS,     [a.r, a.u, a.t]);
          // Mast and bimini arm for larger yachts
          if (len > 18) {
            addCyl(out, vadd(c, a.u, 6.2), 0.20, 10 + hash(i + m) * 5, GREYWHITE, 5, [a.r, a.u, a.t]);
            addBox(out, vadd(c, a.u, 7.0), [3.0, 0.4, 1.4], WHITE, [a.r, a.u, a.t]);
          }
          // Port running light (red) and starboard (green)
          addBox(out, vadd(vadd(c, a.r,  3.0), a.u, 2.8), [0.5, 0.5, 0.5], [0.15, 0.80, 0.25], [a.r, a.u, a.t]);
          addBox(out, vadd(vadd(c, a.r, -3.0), a.u, 2.8), [0.5, 0.5, 0.5], [0.90, 0.15, 0.15], [a.r, a.u, a.t]);
          // Cabin windows lit for dusk (porthole amber glow)
          addBox(out, vadd(c, a.u, 4.4), [4.1, 0.5, len * 0.54],
            [WIN_AMBER[0] * 0.6, WIN_AMBER[1] * 0.5, WIN_AMBER[2] * 0.15], [a.r, a.u, a.t]);
        }
        // Jet skis / tenders alongside the pontoon
        for (let i = 0; i < 4; i++) {
          const a = anchor(k, 1, 8 + (i % 3) * 28);
          const c = vadd(a.c, a.t, (i - 2) * 32 + hash(i * 19 + m) * 12);
          addBox(out, vadd(c, a.u, 0.7), [1.8, 1.0, 3.4], (i % 2) ? CORAL : TEAL, [a.r, a.u, a.t]);
        }
      }

      // Superyacht hospitality barge — iconic Miami GP feature.
      // dist=34 keeps it clear of the pontoon and barrier geometry.
      {
        const k = K(0.32);
        const a = anchor(k, 1, 34);
        addBox(out, vadd(a.c, a.u,  4), [12,  8, 64], WHITE,      [a.r, a.u, a.t]);
        addBox(out, vadd(a.c, a.u,  8), [12.4, 2.4, 60], TEAL,   [a.r, a.u, a.t]);
        addBox(out, vadd(a.c, a.u, 11), [9,  4, 44], GREYWHITE,   [a.r, a.u, a.t]);
        addBox(out, vadd(a.c, a.u, 16), [7,  3, 28], WHITE,       [a.r, a.u, a.t]);
        // Helipad circle on top deck
        addCyl(out, vadd(a.c, a.u, 19.5), 5.5, 0.5, [0.50, 0.52, 0.54], 12, [a.r, a.u, a.t]);
        addCyl(out, vadd(a.c, a.u, 20.1), 5.0, 0.3, [0.85, 0.10, 0.10], 12, [a.r, a.u, a.t]);
        // Lit porthole strip (2 decks)
        addBox(out, vadd(a.c, a.u,  5.6), [12.5, 0.9, 62],
          [WIN_AMBER[0] * 0.65, WIN_AMBER[1] * 0.5, WIN_AMBER[2] * 0.15], [a.r, a.u, a.t]);
        addBox(out, vadd(a.c, a.u,  9.2), [12.5, 0.7, 58],
          [WIN_AMBER[0] * 0.60, WIN_AMBER[1] * 0.45, WIN_AMBER[2] * 0.12], [a.r, a.u, a.t]);
        // Radar mast
        addCyl(out, vadd(a.c, a.u, 20.0), 0.18, 12, GREYWHITE, 4, [a.r, a.u, a.t]);
      }

      // Marina promenade palms — placed via forestEdge so no barrier clipping
      forestEdge(0.26, 0.38, 1, 5, {
        density: 0.6, hMin: 9, hMax: 14,
        col: PALM_GREEN, col2: PALM_DARK, pineFrac: 0.0,
      });

      // ===================================================================
      // s 0.43–0.52 L mid — STADIUM-LOT ZONE: grandstands + cityFront + palms
      // ===================================================================
      for (let i = 0; i < 3; i++) {
        grandstand(0.43 + i * 0.035, -1, 13, 85 + i * 10, GREYWHITE,
          [PINK, TEAL, CORAL][i]);
      }
      cityFront(0.42, 0.53, -1, 24, {
        minH: 14, maxH: 34, depth: 22, step: 20,
        palette: [TEAL, CORAL, PINK, [0.92, 0.80, 0.40], [0.70, 0.85, 1.0]],
        lit: true, windowCol: WIN_AMBER,
      });
      for (let i = 0; i < 10; i++) palm(K(0.43 + i * 0.005), -1, 12 + (i % 2) * 4, 8 + hash(i * 3) * 2, PALM_GREEN);

      // ===================================================================
      // s 0.50–0.60 R mid — BRAKING ZONE: palms + billboards + cityFront
      // ===================================================================
      for (let i = 0; i < 16; i++) palm(K(0.50 + i * 0.004),  1, 11 + (i % 3) * 6, 9 + hash(i)     * 2, PALM_GREEN);
      for (let i = 0; i < 6;  i++) palm(K(0.55 + i * 0.005), -1, 12 + (i % 2) * 5, 8 + hash(i * 2) * 1, PALM_DARK);
      billboard(K(0.50), 1, 11, 18, 9, CORAL);
      billboard(K(0.52), 1, 10, 16, 8, TEAL);
      billboard(K(0.54), 1, 10, 16, 8, PINK);
      cityFront(0.50, 0.60, 1, 22, {
        minH: 12, maxH: 28, depth: 20, step: 20,
        palette: SKY_PAL, lit: true, windowCol: WIN_AMBER,
      });

      // ===================================================================
      // s 0.635 & 0.685 — FLORIDA TURNPIKE OVERPASSES.
      // Moved from 0.62/0.67 to 0.635/0.685 to ensure maximum separation
      // from both the start gantry (s≈0) and the back straight billboards.
      // Pillar height fixed so tops sit flush under the deck (no penetration).
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
      // s 0.77–0.85 both — BACK STRAIGHT (DRS zone): grandstands + cityFront
      // ===================================================================
      for (let i = 0; i < 4; i++) {
        const s = 0.77 + i * 0.025;
        grandstand(s, -1, 20, 80, GREYWHITE, PASTELS[i % PASTELS.length]);   // gap 20 (was 12) so the chase cam never ends up inside the stand; shorter so they don't merge into one long wall
      }
      // Back-straight facades on the OUTER (spectator) side only. The +1 side
      // faces the narrow grass median shared with the final straight (~15 m of
      // grass), so no tall buildings go there — it would loom over / appear to
      // cover the parallel track from overhead. Median keeps grass + palms.
      cityFront(0.76, 0.86, -1, 34, {
        minH: 16, maxH: 38, depth: 22, step: 20,
        palette: SKY_PAL, lit: true, windowCol: WIN_AMBER,
      });
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
      // Paddock / team buildings sit on the OUTER (-1) side, behind the final-
      // corner grandstands (gap 22 clears the 14 m stands). The +1 side here
      // faces the same narrow median as the back straight, so it stays open.
      cityFront(0.87, 0.97, -1, 22, {
        minH: 10, maxH: 28, depth: 22, step: 18,
        palette: [WHITE, ...SKY_PAL], lit: true, windowCol: WIN_AMBER,
      });
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
        const inTech    = (k / n > 0.60 && k / n < 0.75);
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
