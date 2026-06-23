/* Apex 26 — HUNGARORING circuit definition (data only).
   Registered on the global TrackDefs list; consumed by the js/tracks.js engine
   (palette resolved there from `night`, geometry from js/circuits.js or `segs`). */
(function () {
  "use strict";
  (window.TrackDefs = window.TrackDefs || []).push(
  {
    id: "hungaroring",
    name: "HUNGARORING",
    gp: "Hungarian GP",
    country: "Hungary",
    night: false,
    theme: "green",
    lengthKm: 4.4,
    baseHW: 7,
    pal: { zenith: [0.26, 0.44, 0.72], horizon: [0.74, 0.76, 0.76], grass: [0.26, 0.50, 0.22], runoff: [0.48, 0.44, 0.34], fogDensity: 0.0016, sunDir: [0.7401805851129838, 0.587790464648546, 0.3265502581380811], sun: [1, 0.88, 0.66], sunColor: [1, 0.86, 0.64] },
    segs: [
      { t: 0, l: 300 }, { t: 70, l: 90 }, { t: -50, l: 80 }, { t: 60, l: 80 }, { t: 0, l: 200 }, { t: -80, l: 100 },
      { t: 50, l: 80 }, { t: -60, l: 80 }, { t: 60, l: 80 }, { t: 70, l: 90 }, { t: 0, l: 200 }, { t: -90, l: 100 },
      { t: 70, l: 90 },
    ],
    // Undulating amphitheatre (~36 m): climb from Turn 1, long descent into the back.
    elevations: [{ s: 0.20, halfM: 280, rise: 7 }, { s: 0.55, halfM: 320, rise: -8 }],
    scenery: function (api) {
      const { out, n, ds, px, py, pz, pyMin, hash, every, place, prop, backdrop, groundPlane,
              mountain, peak, ridge, tree, pine, bush, hedge, grandstand, building, tower,
              billboard, gantry, marshalPost, fence, guardrail, tyreWall,
              anchor, addBox, addCyl, addCone, addFrustum, vadd, onTrack, groundYAt,
              forestEdge, along } = api;
      const K = (s) => Math.round(s * n) % n;

      // ---- Palette: dry Hungarian summer ----
      const GRASS  = [0.42, 0.55, 0.27];    // sun-baked grass
      const GRASS2 = [0.38, 0.52, 0.24];    // slightly richer mid-green
      const HILL   = [0.30, 0.48, 0.22];    // dark wooded hillside (strong green dominant)
      const HILL2  = [0.34, 0.52, 0.24];    // lighter hillside tone
      const AMPH   = [0.36, 0.50, 0.20];    // amphitheatre grassy banking (green-dom)
      const AMPH2  = [0.40, 0.54, 0.23];    // sunlit amphitheatre terrace
      const TREE   = [0.20, 0.34, 0.18];    // dark oak/tree masses
      const TREE2  = [0.26, 0.40, 0.20];    // mid tree green
      const SCRUB  = [0.46, 0.50, 0.28];    // dry scrub bush
      const HAZE   = [0.60, 0.62, 0.44];    // far haze-tinted hills
      const HAZE2  = [0.68, 0.68, 0.54];    // furthest hazed ridge
      const SHELL  = [0.46, 0.47, 0.50];    // grandstand back shell
      const SHELL2 = [0.40, 0.42, 0.46];    // darker shell
      const WHITE  = [0.90, 0.91, 0.93];
      const RED    = [0.82, 0.18, 0.18];
      const STEEL  = [0.66, 0.68, 0.72];
      const WATER  = [0.14, 0.28, 0.32];
      const PADDOCK = [0.55, 0.55, 0.57];
      const LAMP_POST = [0.28, 0.29, 0.30];
      const LAMP_HEAD = [0.96, 0.94, 0.84];
      const LAMP_ARM  = [0.34, 0.35, 0.36];
      // Crowd seating tints
      const CROWD = [[0.55, 0.32, 0.30], [0.50, 0.52, 0.58], [0.62, 0.58, 0.40], [0.48, 0.50, 0.54]];
      const WIN_WARM = [0.92, 0.78, 0.42];
      const WIN_COOL = [0.78, 0.84, 0.96];

      // ---- Track centre + radius ----
      let cx = 0, cz = 0;
      for (let i = 0; i < n; i++) { cx += px[i]; cz += pz[i]; }
      cx /= n; cz /= n;
      let rad = 0;
      for (let i = 0; i < n; i++) rad = Math.max(rad, Math.hypot(px[i] - cx, pz[i] - cz));

      // ====================================================================
      // DISTANT HORIZON — haze-tinted far hills ring the bowl
      // ====================================================================
      // Far ring: pyramid silhouette peaks at ~rad+460
      const ringFar = rad + 460;
      for (let i = 0; i < 20; i++) {
        const a = i / 20 * 6.2832, h = hash(i * 13 + 200);
        peak(cx + Math.cos(a) * ringFar, cz + Math.sin(a) * ringFar, pyMin,
             280 + h * 100, 28 + h * 16, HAZE);
      }
      // Furthest haze ridges (very low silhouette)
      const ringHorizon = rad + 640;
      for (let i = 0; i < 12; i++) {
        const a = i / 12 * 6.2832, h = hash(i * 17 + 400);
        ridge(cx + Math.cos(a) * ringHorizon, cz + Math.sin(a) * ringHorizon, pyMin,
              a + Math.PI / 2, 340 + h * 160, 190 + h * 100, 38 + h * 22, HAZE2);
      }

      // ====================================================================
      // MID-DISTANCE AMPHITHEATRE — the natural valley bowl walls
      // These are placed as backdrop() with green colours so they render as
      // ROUNDED ORGANIC MOUNDS, not flat boxes. They form the distinctive
      // green hillsides visible through the catch fences.
      // ====================================================================
      // Inner amphitheatre ring: staggered green backdrop mounds at ~rad+190–260
      // distributed around the circuit so the bowl feels enclosed all the way round.
      const amphPts = [
        [0.05, 1, 190], [0.10, -1, 210], [0.18, 1, 200], [0.25, -1, 195],
        [0.32,  1, 215], [0.40, -1, 200], [0.48,  1, 190], [0.55, -1, 205],
        [0.62,  1, 210], [0.70, -1, 195], [0.78,  1, 200], [0.85, -1, 210],
        [0.92,  1, 195], [0.97, -1, 200],
      ];
      for (const [s, side, dist] of amphPts) {
        const hh = hash(Math.round(s * n) * 11 + side * 3);
        // Wide, moderately tall green mounds — the classic Hungaroring hillside terracing.
        // Green-dominant colour triggers the rounded-hill frustum+dome rendering path.
        backdrop(K(s), side, dist, [130 + hh * 40, 32 + hh * 14, 120], AMPH);
      }

      // Second layer — slightly further back, alternating positions for depth
      const amphPts2 = [
        [0.08, 1, 265], [0.15, -1, 270], [0.22, 1, 255], [0.30, -1, 260],
        [0.38,  1, 270], [0.45, -1, 260], [0.52,  1, 265], [0.60, -1, 255],
        [0.67,  1, 270], [0.75, -1, 260], [0.82,  1, 255], [0.90, -1, 265],
      ];
      for (const [s, side, dist] of amphPts2) {
        const hh = hash(Math.round(s * n) * 17 + side * 5);
        backdrop(K(s), side, dist, [100 + hh * 50, 28 + hh * 10, 110], AMPH2);
      }

      // Outer treeline ridge: dark wooded hillsides that cap the mounds at ~rad+310
      const outerRidge = rad + 310;
      for (let i = 0; i < 16; i++) {
        const a = i / 16 * 6.2832, h = hash(i * 19 + 100);
        const tx = cx + Math.cos(a) * outerRidge;
        const tz = cz + Math.sin(a) * outerRidge;
        if (onTrack(tx, tz, 14)) continue;
        // Use addCone for individual tree-mass hilltops at the bowl crest
        addCone(out, [tx, pyMin, tz], 22 + h * 12, 20 + h * 12,
                h < 0.45 ? TREE : TREE2, 8, null);
      }

      // ====================================================================
      // STADIUM SECTION — Turns 1–4 cluster (the famous big bowl stands)
      // The Hungaroring's stadium section has huge banked grandstands on
      // both sides overlooking the hairpin and early corners.
      // ====================================================================
      // Grid stands (pit straight right, s~0): main T-shaped covered stand
      grandstand(0.00, 1,  9, 100, SHELL,  CROWD[1]);   // Grid 1 — closest to grid
      grandstand(0.00, 1, 28,  90, SHELL2, CROWD[0]);   // Grid 2 — behind Grid 1
      billboard(K(0.00), 1, 28, 26, 7, RED);
      // T1 grandstand: right side, spanning Turn 1 braking zone
      grandstand(0.06,  1,  9,  80, SHELL,  CROWD[0]);
      grandstand(0.06,  1, 26,  70, SHELL2, CROWD[2]);  // second tier behind T1
      // Turn 1 inside (Apex 1/2): classic Hungaroring banked inside stands
      grandstand(0.10, -1, 10,  60, SHELL,  CROWD[2]);
      grandstand(0.10, -1, 28,  52, SHELL2, CROWD[3]);  // banking behind apex stands
      // Turn 2-3 corridor, both sides — the stadium pinch
      grandstand(0.14,  1, 11,  50, SHELL,  CROWD[1]);
      grandstand(0.14, -1, 10,  48, SHELL2, CROWD[0]);

      // ====================================================================
      // SECTOR GRANDSTANDS — scattered stands throughout the back sections
      // ====================================================================
      grandstand(0.35, -1, 10, 48, SHELL,  CROWD[1]);   // Twisty sector L (Chicane)
      grandstand(0.40,  1, 11, 46, SHELL,  CROWD[0]);   // Twisty sector R
      grandstand(0.55, -1, 10, 50, SHELL,  CROWD[1]);   // Sector exit L
      grandstand(0.68, -1, 10, 44, SHELL,  CROWD[2]);   // Late-lap L
      grandstand(0.80,  1, 10, 40, SHELL,  CROWD[3]);   // Final approach R
      grandstand(0.90,  1, 10, 62, SHELL,  CROWD[0]);   // Club stand — final corner
      grandstand(0.90, -1, 11, 44, SHELL2, CROWD[1]);   // Inside final corner

      // ====================================================================
      // GRANDSTAND ACCENT STRIPS — lit fascia + concourse window detail
      // ====================================================================
      const FASCIA  = [0.94, 0.92, 0.84];
      const FASCIA2 = [0.78, 0.80, 0.82];
      const standAccent = (s, side, gap, len) => {
        const a = anchor(K(s), side, gap + 5);
        if (onTrack(a.c[0], a.c[2], len * 0.5)) return;
        const b = [a.r, a.u, a.t];
        addBox(out, vadd(a.c, a.u, 13.15), [0.3, 0.5, len + 2], FASCIA, b);
        addBox(out, vadd(a.c, a.u, 7.5), [0.2, 0.6, len - 2], FASCIA2, b);
      };
      standAccent(0.00, 1, 9,  100);
      standAccent(0.00, 1, 28,  90);
      standAccent(0.06, 1, 9,   80);
      standAccent(0.06, 1, 26,  70);
      standAccent(0.10, -1, 10, 60);
      standAccent(0.14,  1, 11, 50);
      standAccent(0.35, -1, 10, 48);
      standAccent(0.40,  1, 11, 46);
      standAccent(0.55, -1, 10, 50);
      standAccent(0.68, -1, 10, 44);
      standAccent(0.80,  1, 10, 40);
      standAccent(0.90,  1, 10, 62);

      // Grandstand lit-window concourse strips
      const gsLit = [
        { s: 0.00, side: 1, gap: 18, len: 96 },
        { s: 0.06, side: 1, gap: 14, len: 76 },
        { s: 0.10, side: -1, gap: 15, len: 56 },
        { s: 0.35, side: -1, gap: 15, len: 44 },
        { s: 0.55, side: -1, gap: 15, len: 46 },
        { s: 0.90, side: 1, gap: 15, len: 58 },
      ];
      for (const g of gsLit) {
        const k = K(g.s);
        const a = anchor(k, g.side, g.gap);
        addBox(out, vadd(a.c, a.u, 1.4), [0.22, 1.0, g.len - 4], WIN_WARM, [a.r, a.u, a.t]);
        addBox(out, vadd(a.c, a.u, 8.6), [0.22, 0.8, g.len - 6], WIN_COOL, [a.r, a.u, a.t]);
      }

      // ====================================================================
      // WOODED HILLSIDE TREELINES — forestEdge() covers the whole circuit
      // These represent the famous oak/pine hillsides visible from everywhere
      // on the Hungaroring. Gap=8 keeps all canopy behind the catch fences.
      // ====================================================================
      // Outside (side=1): continuous hillside — T1→T4 stadium valley wall
      forestEdge(0.0,  0.18, 1, 8, { density: 0.60, hMin: 9, hMax: 15,
                                      col: TREE, col2: TREE2, pineFrac: 0.40 });
      // Outside T4→T7: more open with slightly lighter greens
      forestEdge(0.18, 0.50, 1, 8, { density: 0.48, hMin: 7, hMax: 13,
                                      col: TREE2, col2: TREE, pineFrac: 0.32 });
      // Outside back sector: denser wooded hillside
      forestEdge(0.50, 1.00, 1, 8, { density: 0.52, hMin: 8, hMax: 14,
                                      col: TREE, col2: TREE2, pineFrac: 0.42 });

      // Inside (side=-1): tighter valley wall — more pines on inner slopes
      forestEdge(0.0,  0.12, -1, 8, { density: 0.55, hMin: 7, hMax: 13,
                                       col: TREE, col2: TREE2, pineFrac: 0.55 });
      forestEdge(0.14, 0.35, -1, 8, { density: 0.46, hMin: 8, hMax: 13,
                                       col: TREE2, col2: TREE, pineFrac: 0.38 });
      forestEdge(0.35, 0.55, -1, 8, { density: 0.54, hMin: 8, hMax: 14,
                                       col: TREE, col2: TREE2, pineFrac: 0.45 });
      forestEdge(0.55, 1.00, -1, 8, { density: 0.50, hMin: 7, hMax: 12,
                                       col: TREE2, col2: TREE, pineFrac: 0.38 });

      // Dry scrub close to the edge (gap=9, sparse)
      every(44, (kk) => {
        for (const side of [-1, 1]) {
          const s = hash(kk * 37 + side * 11);
          if (s < 0.62) continue;
          bush(kk, side, 9 + s * 10, SCRUB);
        }
      });

      // ====================================================================
      // LAMP POSTS — double-arm, every ~80 m, full circuit
      // ====================================================================
      every(80, (kk) => {
        for (const side of [-1, 1]) {
          const hh = hash(kk * 31 + side * 7);
          if (hh < 0.15) continue;
          const a = anchor(kk, side, 5);
          if (onTrack(a.c[0], a.c[2], 1.5)) continue;
          const b = [a.r, a.u, a.t];
          addCyl(out, a.c, 0.12, 10, LAMP_POST, 5, b);
          const armC = vadd(vadd(a.c, a.u, 9.6), a.r, side * 1.2);
          addBox(out, armC, [2.4, 0.18, 0.18], LAMP_ARM, b);
          const headC = vadd(vadd(a.c, a.u, 9.2), a.r, side * 2.2);
          addBox(out, headC, [1.0, 0.3, 0.7], LAMP_HEAD, b);
        }
      });
      // Extra lamp clusters at key braking zones
      for (const [s0, s1, side] of [[0.95, 0.08, 1], [0.52, 0.62, 1], [0.30, 0.44, -1]]) {
        let kk = K(s0);
        const kEnd = K(s1), step = Math.max(1, Math.round(50 / ds));
        for (let iter = 0; iter < n; iter++, kk = (kk + step) % n) {
          if (kk === kEnd) break;
          const a = anchor(kk, side, 5);
          if (onTrack(a.c[0], a.c[2], 1.5)) continue;
          const b = [a.r, a.u, a.t];
          addCyl(out, a.c, 0.12, 10, LAMP_POST, 5, b);
          const headC = vadd(vadd(a.c, a.u, 9.2), a.r, side * 1.8);
          addBox(out, headC, [1.0, 0.3, 0.7], LAMP_HEAD, b);
        }
      }

      // ====================================================================
      // TRACK FURNITURE — guardrails, catch fences, tyre walls
      // ====================================================================
      guardrail(0.00, 1.00,  1, 4.5, STEEL);  // outside armco, full lap
      guardrail(0.00, 1.00, -1, 4.5, STEEL);  // inside armco, full lap
      // Catch fences in front of busy spectator zones
      fence(0.95, 0.20,  1, 6.5, 7, STEEL);   // main straight + Turn 1
      fence(0.05, 0.18, -1, 6.5, 7, STEEL);   // stadium inside apex
      fence(0.30, 0.45, -1, 6.5, 7, STEEL);   // mid-sector inside
      fence(0.52, 0.62,  1, 6.5, 7, STEEL);   // twisty-sector stands
      // Tyre walls at high-risk braking points
      tyreWall(0.045, 0.075,  1, 5.5, RED);
      tyreWall(0.14,  0.17,  -1, 5.5, [0.95, 0.85, 0.15]);
      tyreWall(0.54,  0.57,   1, 5.5, [0.20, 0.40, 0.85]);

      // ====================================================================
      // MARSHAL POSTS
      // ====================================================================
      for (const [s, side] of [[0.05, 1], [0.12, -1], [0.16, -1], [0.30, -1],
                                [0.42, 1], [0.55, -1], [0.68, 1], [0.80, -1], [0.92, 1]]) {
        marshalPost(K(s), side, 5);
      }

      // ====================================================================
      // PIT COMPLEX (s=0, inside) + MAIN GRANDSTAND (s=0, outside)
      // ====================================================================
      // Main pit building: modern white concrete
      building(K(0.00), -1, 2, 14, 9, 70, { wall: WHITE, window: WIN_WARM, lit: true, floor: 4 });
      groundPlane(K(0.00), -1, 65, [120, 1.0, 130], PADDOCK);
      // Rear hospitality/paddock building
      building(K(0.03), -1, 32, 16, 10, 34, { wall: WHITE, window: WIN_WARM, lit: true, floor: 4 });
      // Comms/broadcast tower — vertical landmark
      tower(K(0.02), -1, 44, 8, 32, { col: [0.74, 0.76, 0.80], cap: [0.6, 0.62, 0.66], mast: true });
      // Pit wall + kerb trim
      place(K(0.02), -1, 3, [0.8, 1.3, 70], WHITE);
      place(K(0.02), -1, 2, [0.4, 0.3, 70], RED);
      // Start/finish gantry
      gantry(0.005, 7.5, [0.30, 0.32, 0.36]);

      // Pit building lit window detail
      {
        const aW = anchor(K(0.00), -1, 9);
        for (let wi = 0; wi < 6; wi++) {
          const tOff = (wi - 2.5) * 10;
          addBox(out, vadd(vadd(aW.c, aW.t, tOff), aW.u, 2.6),
                 [0.18, 1.6, 3.8], WIN_WARM, [aW.r, aW.u, aW.t]);
        }
        for (let wi = 0; wi < 6; wi++) {
          const tOff = (wi - 2.5) * 10;
          addBox(out, vadd(vadd(aW.c, aW.t, tOff), aW.u, 6.8),
                 [0.18, 1.6, 3.8], WIN_COOL, [aW.r, aW.u, aW.t]);
        }
      }

      // ====================================================================
      // ACCENT FEATURES — water pond, hedge row, Hungarian flags
      // ====================================================================
      // Water feature in the valley floor (gap=75 clears track)
      groundPlane(K(0.08), 1, 75, [80, 1.0, 60], WATER);
      // Dense hedge row along the pit complex fence line
      hedge(0.04, 0.11, 1, 32, 4, TREE);

      // Hungarian tricolour accent billboards (red/white/green)
      billboard(K(0.02), -1, 22, 10, 4, [0.20, 0.48, 0.20]);   // green band
      billboard(K(0.04),  1, 22, 10, 4, [0.85, 0.20, 0.20]);   // red band

      // ====================================================================
      // KERB ACCENTS at key corners
      // ====================================================================
      for (const [s, side] of [[0.06, 1], [0.12, -1], [0.40, 1], [0.55, -1], [0.90, 1]]) {
        place(K(s), side, 2, [0.4, 0.25, 6], side > 0 ? RED : WHITE);
        place(K(s), side, 7, [10, 0.08, 12], GRASS);
      }

      // ====================================================================
      // SPARSE CROWD ACCENTS on the natural amphitheatre banking
      // These small flat props read as spectators on the grass hillsides —
      // the Hungaroring's famous "free-range" viewing areas on the slopes.
      // ====================================================================
      every(35, (kk) => {
        for (const side of [-1, 1]) {
          const hh = hash(kk * 23 + side * 5);
          if (hh < 0.50) continue;   // sparser than before — hillside not rammed
          const base = 36 + hh * 24; // pushed further back (hillside distance)
          const col = CROWD[((kk + (side > 0 ? 1 : 0)) | 0) % CROWD.length];
          prop(kk, side, base, [12, 1.6 + hh * 1.0, 14], col);
        }
      });
    },
  }
  );
})();
