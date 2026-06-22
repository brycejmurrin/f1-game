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

      // ---- Dry Hungarian-summer palette ----
      const GRASS  = [0.42, 0.55, 0.27];    // base sun-baked grass
      const GRASS2 = [0.48, 0.58, 0.30];    // lighter dry grass
      const BANK   = [0.56, 0.60, 0.32];    // bleached spectator banking
      const TREE   = [0.20, 0.34, 0.18];    // dark tree masses
      const TREE2  = [0.26, 0.40, 0.20];    // mid tree green
      const SCRUB  = [0.46, 0.50, 0.28];    // dry scrub bush
      const HAZE   = [0.60, 0.62, 0.44];    // far haze-tinted hills
      const HAZE2  = [0.68, 0.68, 0.54];    // furthest hazed ridge
      const SHELL  = [0.46, 0.47, 0.50];    // grandstand back shell
      const SHELL2 = [0.40, 0.42, 0.46];    // darker shell
      const WHITE  = [0.90, 0.91, 0.93];
      const RED    = [0.82, 0.18, 0.18];
      const STEEL  = [0.66, 0.68, 0.72];    // armco / fence steel
      const WATER  = [0.14, 0.28, 0.32];    // dark blue-green pond
      const PADDOCK = [0.55, 0.55, 0.57];   // paddock tarmac
      // Lamp post colours
      const LAMP_POST = [0.28, 0.29, 0.30]; // dark steel post
      const LAMP_HEAD = [0.96, 0.94, 0.84]; // warm sodium glow (day: reads as reflector)
      const LAMP_ARM  = [0.34, 0.35, 0.36]; // bracket
      // Crowd seating tints (varied so stands read as packed)
      const CROWD = [[0.55, 0.32, 0.30], [0.50, 0.52, 0.58], [0.62, 0.58, 0.40], [0.48, 0.50, 0.54]];
      // Lit window warmth for pit building / concourse strips
      const WIN_WARM = [0.92, 0.78, 0.42];
      const WIN_COOL = [0.78, 0.84, 0.96];

      // ---- Track centre + radius (used for horizon ring placement) ----
      let cx = 0, cz = 0;
      for (let i = 0; i < n; i++) { cx += px[i]; cz += pz[i]; }
      cx /= n; cz /= n;
      let rad = 0;
      for (let i = 0; i < n; i++) rad = Math.max(rad, Math.hypot(px[i] - cx, pz[i] - cz));

      // ---- Distant amphitheatre horizon ----
      // Hungaroring sits in a natural valley; gentle peaks ring the bowl.
      // Far ring: 20 haze-tinted pyramid peaks on the horizon.
      const ringFar = rad + 460;
      for (let i = 0; i < 20; i++) {
        const a = i / 20 * 6.2832, h = hash(i * 13 + 200);
        peak(cx + Math.cos(a) * ringFar, cz + Math.sin(a) * ringFar, pyMin,
             280 + h * 100, 28 + h * 16, HAZE);
      }
      // Furthest haze ridges (very sparse, low-silhouette)
      const ringHorizon = rad + 640;
      for (let i = 0; i < 12; i++) {
        const a = i / 12 * 6.2832, h = hash(i * 17 + 400);
        ridge(cx + Math.cos(a) * ringHorizon, cz + Math.sin(a) * ringHorizon, pyMin,
              a + Math.PI / 2, 340 + h * 160, 190 + h * 100, 38 + h * 22, HAZE2);
      }
      // Mid-distance ring of tree-topped hillocks — the amphitheatre bowl wall.
      // Kept far enough (rad+320) that onTrack(10) catches any near overlap.
      // These read as the characteristic valley hillsides, not close obstacles.
      const ringMid = rad + 320;
      for (let i = 0; i < 18; i++) {
        const a = i / 18 * 6.2832, h = hash(i * 19 + 100);
        const tx = cx + Math.cos(a) * ringMid;
        const tz = cz + Math.sin(a) * ringMid;
        if (onTrack(tx, tz, 14)) continue;
        // Low wide hillocks (modest height, wide base) — reads as rolling terrain
        // not isolated cones. Radius kept to ≤18 so they stay well clear of track.
        addCone(out, [tx, pyMin, tz], 18 + h * 10, 16 + h * 10,
                h < 0.4 ? TREE : TREE2, 7, null);
      }

      // ---- Distant banking terraces ----
      // Six strategic backdrop zones far back — never clip the track.
      const bankPts = [0.08, 0.22, 0.38, 0.52, 0.70, 0.88];
      for (const s of bankPts) {
        for (const side of [-1, 1]) {
          const hh = hash(Math.round(s * n) * 7 + side);
          backdrop(K(s), side, 165 + hh * 50, [110, 20 + hh * 8, 100], hh < 0.5 ? BANK : GRASS2);
        }
      }

      // ---- Sparse crowd accents on select banking zones ----
      every(30, (kk) => {
        for (const side of [-1, 1]) {
          const hh = hash(kk * 23 + side * 5);
          if (hh < 0.40) continue;
          const base = 32 + hh * 22;
          const col = CROWD[((kk + (side > 0 ? 1 : 0)) | 0) % CROWD.length];
          prop(kk, side, base, [14, 1.8 + hh * 1.2, 16], col);
        }
      });

      // ---- Natural amphitheatre treelines via forestEdge ----
      // forestEdge() guarantees the canopy inner edge starts at `gap` from the road
      // edge — no canopy ever pokes through a barrier/fence.
      // The catch fences run at gap=6.5; using gap=8 puts all foliage behind them.

      // Outside (side=1): continuous hillside treeline — the classic Hungaroring
      // valley wall glimpsed through the fences on the run from T1 → T4.
      forestEdge(0.0, 0.25, 1, 8, { density: 0.55, hMin: 8, hMax: 14,
                                     col: TREE, col2: TREE2, pineFrac: 0.45 });
      // Outside mid-sector (T4 → T7): open-feeling with slightly sparser treeline
      forestEdge(0.25, 0.50, 1, 8, { density: 0.45, hMin: 7, hMax: 12,
                                     col: TREE2, col2: TREE, pineFrac: 0.35 });
      // Outside back sector: amphitheatre wall of mixed oak/pine
      forestEdge(0.50, 1.00, 1, 8, { density: 0.50, hMin: 8, hMax: 13,
                                     col: TREE, col2: TREE2, pineFrac: 0.40 });

      // Inside (side=-1): tighter valley — more pines, darker greens
      forestEdge(0.0, 0.14, -1, 8, { density: 0.55, hMin: 7, hMax: 13,
                                      col: TREE, col2: TREE2, pineFrac: 0.55 });
      // Gap around pit complex (s=0.00 is pit building; covered by hedge below)
      forestEdge(0.14, 0.35, -1, 8, { density: 0.48, hMin: 8, hMax: 13,
                                       col: TREE2, col2: TREE, pineFrac: 0.40 });
      forestEdge(0.35, 0.55, -1, 8, { density: 0.52, hMin: 8, hMax: 14,
                                       col: TREE, col2: TREE2, pineFrac: 0.45 });
      forestEdge(0.55, 1.00, -1, 8, { density: 0.48, hMin: 7, hMax: 12,
                                       col: TREE2, col2: TREE, pineFrac: 0.38 });

      // Dry scrub close to the edge (~every 44 m, sparse) — pushed clear of fences
      // gap=9 keeps bush base (radius~1.6m) safely behind fence at gap=6.5
      every(44, (kk) => {
        for (const side of [-1, 1]) {
          const s = hash(kk * 37 + side * 11);
          if (s < 0.62) continue;
          bush(kk, side, 9 + s * 10, SCRUB);
        }
      });

      // ---- Lamp posts — night-ready + day character ----
      // Double-arm lamp posts every ~80 m on both sides of the full circuit.
      // Height 10 m; warm sodium-tinted head. Placed at gap=5 (just beyond armco).
      every(80, (kk) => {
        for (const side of [-1, 1]) {
          const hh = hash(kk * 31 + side * 7);
          if (hh < 0.15) continue;   // occasional gap for realism
          const a = anchor(kk, side, 5);
          if (onTrack(a.c[0], a.c[2], 1.5)) continue;
          const b = [a.r, a.u, a.t];
          // Post shaft
          addCyl(out, a.c, 0.12, 10, LAMP_POST, 5, b);
          // Outward-reaching arm
          const armC = vadd(vadd(a.c, a.u, 9.6), a.r, side * 1.2);
          addBox(out, armC, [2.4, 0.18, 0.18], LAMP_ARM, b);
          // Lamp head (warm emissive-tinted box)
          const headC = vadd(vadd(a.c, a.u, 9.2), a.r, side * 2.2);
          addBox(out, headC, [1.0, 0.3, 0.7], LAMP_HEAD, b);
        }
      });
      // Extra lamp clusters at key braking zones (Turn 1, twisty sector)
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

      // ---- Grandstand emissive accent strips (lit fascia) ----
      // Bright fascia strips on grandstand roof and front lip — floodlighting character.
      const FASCIA  = [0.94, 0.92, 0.84]; // warm near-white underlit fascia
      const FASCIA2 = [0.78, 0.80, 0.82]; // cooler secondary trim
      const standAccent = (s, side, gap, len) => {
        const a = anchor(K(s), side, gap + 5);
        if (onTrack(a.c[0], a.c[2], len * 0.5)) return;
        const b = [a.r, a.u, a.t];
        addBox(out, vadd(a.c, a.u, 13.15), [0.3, 0.5, len + 2], FASCIA, b);
        addBox(out, vadd(a.c, a.u, 7.5), [0.2, 0.6, len - 2], FASCIA2, b);
      };
      // Main straight and Turn 1 group
      standAccent(0.00, 1, 9,  100);
      standAccent(0.00, 1, 28,  90);
      standAccent(0.06, 1, 9,   62);
      // Sector stands
      standAccent(0.12, -1, 10, 44);
      standAccent(0.35, -1, 10, 48);
      standAccent(0.40,  1, 11, 46);
      standAccent(0.55, -1, 10, 50);
      standAccent(0.68, -1, 10, 44);
      standAccent(0.80,  1, 10, 40);
      standAccent(0.90,  1, 10, 62);

      // ---- Grandstand lit-window concourse strips (night legibility) ----
      // Amber + cool-white strips on the concourse level and upper deck rear,
      // so grandstands read as illuminated structures even in dusk light.
      const gsLit = [
        { s: 0.00, side: 1, gap: 18, len: 96 },   // pit-straight main stand back
        { s: 0.06, side: 1, gap: 14, len: 58 },   // Turn 1 stand back
        { s: 0.35, side: -1, gap: 15, len: 44 },  // twisty sector L
        { s: 0.55, side: -1, gap: 15, len: 46 },  // sector exit L
        { s: 0.90, side: 1, gap: 15, len: 58 },   // final sector R
      ];
      for (const g of gsLit) {
        const k = K(g.s);
        const a = anchor(k, g.side, g.gap);
        // Ground-floor concourse strip: warm amber
        addBox(out, vadd(a.c, a.u, 1.4), [0.22, 1.0, g.len - 4], WIN_WARM, [a.r, a.u, a.t]);
        // Upper deck rear: cooler press/broadcast tint
        addBox(out, vadd(a.c, a.u, 8.6), [0.22, 0.8, g.len - 6], WIN_COOL, [a.r, a.u, a.t]);
      }

      // ---- Continuous track furniture ----
      guardrail(0.00, 1.00,  1, 4.5, STEEL);  // outside armco, full lap
      guardrail(0.00, 1.00, -1, 4.5, STEEL);  // inside armco, full lap
      // Catch fences in front of busy spectator zones
      fence(0.95, 0.20,  1, 6.5, 7, STEEL);   // main straight + Turn 1
      fence(0.30, 0.45, -1, 6.5, 7, STEEL);   // mid-sector inside
      fence(0.52, 0.62,  1, 6.5, 7, STEEL);   // twisty-sector stands
      // Tyre walls at high-risk braking points
      tyreWall(0.045, 0.075,  1, 5.5, RED);
      tyreWall(0.14,  0.17,  -1, 5.5, [0.95, 0.85, 0.15]);
      tyreWall(0.54,  0.57,   1, 5.5, [0.20, 0.40, 0.85]);

      // ---- Marshal posts ----
      for (const [s, side] of [[0.05, 1], [0.16, -1], [0.30, -1], [0.42, 1],
                                [0.55, -1], [0.68, 1], [0.80, -1], [0.92, 1]]) {
        marshalPost(K(s), side, 5);
      }

      // ---- s=0: pit complex (L) + main grandstand (R) ----
      // Main pit building: white modern concrete, lit glazing for dusk legibility
      building(K(0.00), -1, 2, 14, 9, 70, { wall: WHITE, window: WIN_WARM, lit: true, floor: 4 });
      groundPlane(K(0.00), -1, 65, [120, 1.0, 130], PADDOCK);
      // Rear hospitality/paddock building
      building(K(0.03), -1, 32, 16, 10, 34, { wall: WHITE, window: WIN_WARM, lit: true, floor: 4 });
      // Comms tower — provides vertical landmark
      tower(K(0.02), -1, 44, 8, 32, { col: [0.74, 0.76, 0.80], cap: [0.6, 0.62, 0.66], mast: true });
      // Pit wall + kerb trim
      place(K(0.02), -1, 3, [0.8, 1.3, 70], WHITE);
      place(K(0.02), -1, 2, [0.4, 0.3, 70], RED);
      // Start/finish gantry
      gantry(0.005, 7.5, [0.30, 0.32, 0.36]);

      // ---- Pit building lit window detail (warm panes on facade) ----
      {
        const aW = anchor(K(0.00), -1, 9);
        // Ground-floor amber windows — pit lane facing
        for (let wi = 0; wi < 6; wi++) {
          const tOff = (wi - 2.5) * 10;
          addBox(out, vadd(vadd(aW.c, aW.t, tOff), aW.u, 2.6),
                 [0.18, 1.6, 3.8], WIN_WARM, [aW.r, aW.u, aW.t]);
        }
        // Upper-floor cool-white office light
        for (let wi = 0; wi < 6; wi++) {
          const tOff = (wi - 2.5) * 10;
          addBox(out, vadd(vadd(aW.c, aW.t, tOff), aW.u, 6.8),
                 [0.18, 1.6, 3.8], WIN_COOL, [aW.r, aW.u, aW.t]);
        }
      }

      // ---- Main covered grandstand — 2-tier R side ----
      grandstand(0.00, 1,  9, 100, SHELL,  CROWD[1]);
      grandstand(0.00, 1, 28,  90, SHELL2, CROWD[0]);
      billboard(K(0.00), 1, 28, 26, 7, RED);

      // ---- Key spectator zones: 8 strategic grandstands ----
      grandstand(0.06,  1, 9,  62, SHELL,  CROWD[0]);  // Turn 1
      grandstand(0.12, -1, 10, 44, SHELL,  CROWD[2]);  // Mid-section L
      grandstand(0.35, -1, 10, 48, SHELL,  CROWD[1]);  // Twisty sector L
      grandstand(0.40,  1, 11, 46, SHELL,  CROWD[0]);  // Twisty sector R
      grandstand(0.55, -1, 10, 50, SHELL,  CROWD[1]);  // Sector exit L
      grandstand(0.68, -1, 10, 44, SHELL,  CROWD[2]);  // Late-lap L
      grandstand(0.80,  1, 10, 40, SHELL,  CROWD[3]);  // Approach R
      grandstand(0.90,  1, 10, 62, SHELL,  CROWD[0]);  // Final sector R

      // ---- Accent features: hedge, pond, flags ----
      // Water feature in the valley floor — pushed back (gap=75) to clear the track
      groundPlane(K(0.08), 1, 75, [80, 1.0, 60], WATER);
      hedge(0.04, 0.11, 1, 32, 4, TREE);

      // Hungarian flag colour bands on the pit area billboards
      billboard(K(0.02), -1, 22, 10, 4, [0.20, 0.48, 0.20]);   // green
      billboard(K(0.04),  1, 22, 10, 4, [0.85, 0.20, 0.20]);   // red

      // ---- Kerb accents at key turns (red/white sill + grass apron) ----
      for (const [s, side] of [[0.06, 1], [0.12, -1], [0.40, 1], [0.55, -1], [0.90, 1]]) {
        place(K(s), side, 2, [0.4, 0.25, 6], side > 0 ? RED : WHITE);
        place(K(s), side, 7, [10, 0.08, 12], GRASS);
      }
    },
  }
  );
})();
