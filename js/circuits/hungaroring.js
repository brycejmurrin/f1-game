/* Apex 26 — HUNGARORING circuit definition (data only).
   Registered on the global TrackDefs list; consumed by the js/tracks.js engine
   (palette resolved there from `night`, geometry from js/circuits.js or `segs`). */
(function () {
  "use strict";
  (window.TrackDefs = window.TrackDefs || []).push(
  {
    id: "hungaroring",
    reverse: false, // direction switched to real-world CW/CCW (was auto-audit reverse:true)
    startFrac: 0.9825, // GPS-derived (OpenF1 2025, conf=0.185)
    name: "HUNGARORING",
    gp: "Hungarian GP",
    country: "Hungary",
    night: false,
    theme: "green",
    lengthKm: 4.4,
    baseHW: 7,
    sceneryCoordinates: "racing",
    // Bespoke treelines and circuit lamps own the bowl; suppress generic copies
    // that crowd the pit sightline and duplicate the day-only lighting furniture.
    dressingExclusions: [
      { kinds: ["foliage", "lamps", "floodlights"], s0: 0, s1: 1 },
    ],
    // Keep the terrain ribbon inside the compact foldbacks. The default 120 m
    // outer span chords from the raised T3 approach across the lower T2 basin.
    terrainOuter: 90,
    // ATM.dustyBowl — bleached straw-olive grass/runoff, warm hazy sky (baked into pal
    // so buildRoad/buildTerrain pick it up; scenery also Object.assigns for live lighting).
    pal: { zenith: [0.55, 0.62, 0.78], horizon: [0.78, 0.72, 0.58], fog: [0.72, 0.68, 0.55], fogDensity: 0.0022, grass: [0.42, 0.40, 0.22], runoff: [0.58, 0.50, 0.34], ambientSky: [0.62, 0.58, 0.50], ambientGround: [0.40, 0.36, 0.28], sunDir: [0.7401805851129838, 0.587790464648546, 0.3265502581380811], sun: [1.0, 0.94, 0.78], sunColor: [1.0, 0.94, 0.78] },
    segs: [
      { t: 0, l: 300 }, { t: 70, l: 90 }, { t: -50, l: 80 }, { t: 60, l: 80 }, { t: 0, l: 200 }, { t: -80, l: 100 },
      { t: 50, l: 80 }, { t: -60, l: 80 }, { t: 60, l: 80 }, { t: 70, l: 90 }, { t: 0, l: 200 }, { t: -90, l: 100 },
      { t: 70, l: 90 },
    ],
    // Undulating amphitheatre (~36 m): SF high → T1 plunge → climb mid → home.
    elevations: [
      { s: 0.00, halfM: 240, rise: 14 },   // SF plateau high
      { s: 0.12, halfM: 340, rise: -22 },  // T1 plunge / T2–4 basin low
      { s: 0.52, halfM: 380, rise: 16 },   // mid-sector climb crest (T10–11)
    ],
    // Hungaroring camber. T4 is the notably banked one (a genuinely dished left
    // that lets the cars carry speed downhill); the rest of the amphitheatre
    // sits on 3-3.5° of ordinary camber.
    bankZones: [
      { frac: 0.1888, angleDeg: 3.0, widthM: 100 },   // T1 downhill right
      { frac: 0.2961, angleDeg: 3.5, widthM: 150 },   // T2
      { frac: 0.3474, angleDeg: 6.0, widthM: 90 },    // T4 — the banked left
      { frac: 0.5197, angleDeg: 3.0, widthM: 170 },   // hilltop sweep
      { frac: 0.8506, angleDeg: 3.0, widthM: 70 },    // T11
      { frac: 0.9624, angleDeg: 3.5, widthM: 190 },   // final long right
    ],
    scenery: function (api) {
      const { out, MAT, n, ds, px, py, pz, pyMin, hash, every, place, prop, backdrop, groundPlane,
              mountain, peak, ridge, tree, pine, bush, hedge, grandstand, building, motorhome, tower,
              billboard, marshalPost, fence, guardrail, tyreWall,
              anchor, addBox, addCyl, addCone, addFrustum, addPrism, vadd, onTrack, groundYAt,
              seat, foundation, cantilever,
              forestEdge, along, modelGroup, overheadSpan, waterSurface, groundPatch, groundedSegments,
              recordBarrier, circuitKit, pal, ATM } = api;
      const K = (s) => Math.round(s * n) % n;

      // 1. Dry dusty Hungarian bowl — straw-olive grass/runoff, warm haze.
      if (ATM && ATM.dustyBowl) Object.assign(pal, ATM.dustyBowl);

      // ---- Palette: dry dusty bowl (straw-olive; amph still G-dominant for rounded mounds) ----
      const GRASS  = [0.46, 0.50, 0.26];    // sun-baked straw-olive grass
      const GRASS2 = [0.42, 0.46, 0.24];    // deeper straw verge
      const AMPH   = [0.48, 0.54, 0.28];    // amphitheatre banking — G-dom → rounded mound
      const AMPH2  = [0.54, 0.58, 0.32];    // sun-bleached terrace variant
      const TREE   = [0.28, 0.36, 0.18];    // dry oak / olive tree masses
      const TREE2  = [0.34, 0.42, 0.20];    // mid dusty canopy
      const SCRUB  = [0.52, 0.48, 0.28];    // dry scrub bush
      const HAZE   = [0.68, 0.64, 0.48];    // far haze-tinted hills (dustyBowl fog)
      const HAZE2  = [0.74, 0.70, 0.56];    // furthest hazed ridge
      const SHELL  = [0.46, 0.47, 0.50];    // grandstand back shell
      const SHELL2 = [0.40, 0.42, 0.46];    // darker shell
      const WHITE  = [0.90, 0.91, 0.93];
      const GREY   = [0.72, 0.74, 0.78];
      const RED    = [0.82, 0.18, 0.18];
      const STEEL  = [0.66, 0.68, 0.72];
      const WATER  = [0.14, 0.28, 0.32];
      const PADDOCK = [0.55, 0.55, 0.57];
      const LAMP_POST = [0.28, 0.29, 0.30];
      const LAMP_HEAD = [0.96, 0.94, 0.84];
      const LAMP_ARM  = [0.34, 0.35, 0.36];
      const CROWD = [[0.55, 0.32, 0.30], [0.50, 0.52, 0.58], [0.62, 0.58, 0.40], [0.48, 0.50, 0.54]];
      const WIN_WARM = [0.92, 0.78, 0.42];
      const WIN_COOL = [0.78, 0.84, 0.96];
      const ROOF_DK  = [0.20, 0.21, 0.24];  // covered tribune dark roof

      // ---- Track centre + radius ----
      let cx = 0, cz = 0;
      for (let i = 0; i < n; i++) { cx += px[i]; cz += pz[i]; }
      cx /= n; cz /= n;
      let rad = 0;
      for (let i = 0; i < n; i++) rad = Math.max(rad, Math.hypot(px[i] - cx, pz[i] - cz));

      // ====================================================================
      // DISTANT HORIZON — haze-tinted far peaks ring the bowl
      // ====================================================================
      const ringFar = rad + 460;
      for (let i = 0; i < 16; i++) {
        const a = i / 16 * 6.2832, h = hash(i * 13 + 200);
        peak(cx + Math.cos(a) * ringFar, cz + Math.sin(a) * ringFar, pyMin,
             280 + h * 100, 28 + h * 16, HAZE);
      }
      // Furthest haze ridges
      const ringHorizon = rad + 640;
      for (let i = 0; i < 10; i++) {
        const a = i / 10 * 6.2832, h = hash(i * 17 + 400);
        ridge(cx + Math.cos(a) * ringHorizon, cz + Math.sin(a) * ringHorizon, pyMin,
              a + Math.PI / 2, 340 + h * 160, 190 + h * 100, 38 + h * 22, HAZE2);
      }

      // ====================================================================
      // AMPHITHEATRE BOWL WALLS — straw-olive backdrop() rounded mounds
      // G-dominant colours still trigger the ROUNDED ORGANIC MOUND path
      // (frustum+dome), so banking reads as dusty hillsides, not boxes.
      // ====================================================================
      const amphPts = [
        [0.05, 1, 180], [0.15, -1, 195], [0.25, 1, 185],
        [0.35, -1, 190], [0.48,  1, 185], [0.58, -1, 195],
        [0.68,  1, 188], [0.78, -1, 192], [0.88,  1, 180],
        [0.92, -1, 190], [0.97,  1, 185], [0.02, -1, 195],
      ];
      for (const [s, side, dist] of amphPts) {
        const hh = hash(Math.round(s * n) * 11 + side * 3);
        backdrop(K(s), side, dist, [120 + hh * 40, 34 + hh * 14, 110], hh < 0.5 ? AMPH : AMPH2);
      }

      // Mid-ring tree-capped mounds at the amphitheatre bowl crest
      const ringMid = rad + 300;
      for (let i = 0; i < 14; i++) {
        const a = i / 14 * 6.2832, h = hash(i * 19 + 100);
        const tx = cx + Math.cos(a) * ringMid;
        const tz = cz + Math.sin(a) * ringMid;
        if (onTrack(tx, tz, 14)) continue;
        addCone(out, [tx, pyMin, tz], 20 + h * 10, 18 + h * 10,
                h < 0.45 ? TREE : TREE2, 7, null);
      }

      // ====================================================================
      // STADIUM SECTION — Turns 1–4 + mid-lap stands (s=0 main tribune is bespoke below)
      // ====================================================================
      billboard(K(0.00), 1, 38, 22, 6, RED);
      // T1 grandstand group: outside of Turn 1 braking zone
      grandstand(0.06,  1, 11,  70, SHELL,  CROWD[0]);
      // Stadium inside: Apex 1/2 banked stands inside Turn 1-2
      grandstand(0.10, -1, 10,  56, SHELL,  CROWD[2]);
      // Sector grandstands across the back of the circuit
      grandstand(0.12, -1, 10, 44, SHELL,  CROWD[2]);
      grandstand(0.35, -1, 12, 48, SHELL,  CROWD[1]);
      grandstand(0.40,  1, 13, 46, SHELL,  CROWD[0]);
      grandstand(0.55, -1, 10, 50, SHELL,  CROWD[1]);
      grandstand(0.68, -1, 10, 44, SHELL,  CROWD[2]);
      grandstand(0.80,  1, 10, 40, SHELL,  CROWD[3]);
      grandstand(0.90,  1, 10, 62, SHELL,  CROWD[0]);   // Club stand — final corner

      // ====================================================================
      // GRANDSTAND ACCENT STRIPS — lit fascia + concourse window bands
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
      standAccent(0.06, 1, 11,   70);
      standAccent(0.10, -1, 10, 56);
      standAccent(0.12, -1, 10, 44);
      standAccent(0.35, -1, 12, 48);
      standAccent(0.40,  1, 13, 46);
      standAccent(0.55, -1, 10, 50);
      standAccent(0.68, -1, 10, 44);
      standAccent(0.80,  1, 10, 40);
      standAccent(0.90,  1, 10, 62);

      // Grandstand lit-window concourse strips
      const gsLit = [
        { s: 0.06, side: 1, gap: 18, len: 66 },
        { s: 0.10, side: -1, gap: 15, len: 52 },
        { s: 0.35, side: -1, gap: 17, len: 44 },
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
      // WOODED HILLSIDE TREELINES — forestEdge() covers the full circuit
      // Gap=8 keeps all canopy safely behind the catch fences.
      // ====================================================================
      // Outside: continuous hillside, denser in the stadium section
      forestEdge(0.0,  0.18, 1, 8, { density: 0.58, hMin: 9, hMax: 15,
                                      col: TREE, col2: TREE2, pineFrac: 0.40 });
      forestEdge(0.18, 0.50, 1, 8, { density: 0.46, hMin: 7, hMax: 13,
                                      col: TREE2, col2: TREE, pineFrac: 0.32 });
      forestEdge(0.50, 1.00, 1, 8, { density: 0.50, hMin: 8, hMax: 14,
                                      col: TREE, col2: TREE2, pineFrac: 0.40 });
      // Inside: tighter valley wall
      forestEdge(0.0,  0.12, -1, 8, { density: 0.52, hMin: 7, hMax: 13,
                                       col: TREE, col2: TREE2, pineFrac: 0.55 });
      forestEdge(0.14, 0.35, -1, 8, { density: 0.44, hMin: 8, hMax: 13,
                                       col: TREE2, col2: TREE, pineFrac: 0.38 });
      forestEdge(0.35, 0.55, -1, 8, { density: 0.50, hMin: 8, hMax: 14,
                                       col: TREE, col2: TREE2, pineFrac: 0.42 });
      forestEdge(0.55, 1.00, -1, 8, { density: 0.46, hMin: 7, hMax: 12,
                                       col: TREE2, col2: TREE, pineFrac: 0.38 });

      // Dry scrub spots at the edge (gap=9, sparse)
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
          // Skip problematic zone at frac ~0.432 (intrudes 1.05m at road level)
          const frac = kk / n;
          if (Math.abs(frac - 0.432) < 0.01 && side === -1) continue;
          const a = anchor(kk, side, 8);
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
          // Skip problematic zone at frac ~0.432 (intrudes 1.05m)
          const frac = kk / n;
          if (Math.abs(frac - 0.432) < 0.01) continue;
          const a = anchor(kk, side, 8);
          if (onTrack(a.c[0], a.c[2], 1.5)) continue;
          const b = [a.r, a.u, a.t];
          addCyl(out, vadd(a.c, a.u, -0.4), 0.12, 10.4, LAMP_POST, 5, b);
          // cantilever() emits the arm with the head, so the head can never be
          // left hovering beside a bare pole (it was, 168 times).
          cantilever(out, vadd(a.c, a.u, 9.2), 1.8, side, [1.0, 0.3, 0.7], LAMP_HEAD, LAMP_POST, b);
        }
      }

      // ====================================================================
      // TRACK FURNITURE — guardrails, catch fences, tyre walls
      // ====================================================================
      // Permanent-circuit armco sits behind meaningful grass/asphalt runoff and
      // only protects occupied spectator sectors; the remaining bowl stays open.
      guardrail(0.95, 0.20,  1, 8, STEEL);  // main straight + Turn 1
      guardrail(0.30, 0.45, -1, 8, STEEL);  // mid-sector inside
      guardrail(0.52, 0.62,  1, 8, STEEL);  // twisty-sector stands
      // Catch fences in front of busy spectator zones
      fence(0.95, 0.20,  1, 10, 7, STEEL);   // main straight + Turn 1
      fence(0.30, 0.45, -1, 10, 7, STEEL);   // mid-sector inside
      fence(0.52, 0.62,  1, 10, 7, STEEL);   // twisty-sector stands
      // Tyre walls at high-risk braking points
      tyreWall(0.045, 0.075,  1, 9, RED);
      tyreWall(0.14,  0.17,  -1, 9, [0.95, 0.85, 0.15]);
      tyreWall(0.54,  0.57,   1, 9, [0.20, 0.40, 0.85]);

      // ====================================================================
      // MARSHAL POSTS
      // ====================================================================
      for (const [s, side] of [[0.05, 1], [0.12, -1], [0.16, -1], [0.30, -1],
                                [0.42, 1], [0.55, -1], [0.68, 1], [0.80, -1], [0.92, 1]]) {
        marshalPost(K(s), side, 8);
      }

      // ====================================================================
      // 3. MODERN s=0 PIT (L) + COVERED MAIN TRIBUNE (R) — 2024 rebuild silhouette
      // ====================================================================
      // Long low white/grey pit slab + tiered VIP terrace stacked on top (L).
      (function modernPit() {
        const a = anchor(K(0.00), -1, 20);
        const b = [a.r, a.u, a.t];
        modelGroup("hungaroring-pit-complex", {
          center: vadd(a.c, a.u, 7), size: [24, 15, 82], basis: b,
        }, (stage) => {
          stage._mat = MAT.CONCRETE;
          // Garage body — long low slab
          addBox(stage, vadd(a.c, a.u, 3.4), [11, 6.8, 78], WHITE, b);
          // Garage-door rhythm (dark bays)
          for (let i = -4; i <= 4; i++)
            addBox(stage, vadd(vadd(a.c, a.u, 2.6), a.t, i * 8.2), [11.4, 4.0, 1.1], [0.28, 0.30, 0.34], b);
          // Mid cladding band
          addBox(stage, vadd(a.c, a.u, 6.0), [11.6, 0.45, 78], GREY, b);
          // VIP terrace stacked on top
          addBox(stage, vadd(a.c, a.u, 8.6), [9.5, 3.6, 68], [0.88, 0.89, 0.92], b);
          stage._mat = MAT.METAL;
          addBox(stage, vadd(a.c, a.u, 10.7), [10.5, 0.4, 70], GREY, b);
          // Pit-lane canopy overhang toward the track (+r from left side)
          addBox(stage, vadd(vadd(a.c, a.r, 5.5), a.u, 7.0), [8, 0.4, 76], [0.82, 0.84, 0.88], b);
          stage._mat = 0;
          // Warm VIP glass strip facing the straight
          addBox(stage, vadd(vadd(a.c, a.r, 4.6), a.u, 9.0), [0.2, 1.8, 60], WIN_WARM, b);
          addBox(stage, vadd(vadd(a.c, a.r, 4.6), a.u, 4.2), [0.2, 1.4, 64], WIN_COOL, b);
        }, { required: true });
      })();
      groundPatch(K(0.00), -1, 65, [120, 1.0, 130], PADDOCK,
                  { id: "hungaroring-paddock", samples: 8 });
      // Rear hospitality — motorhome row behind the pit slab
      motorhome(K(0.03), -1, 34, 16, 8, 34, { wall: WHITE, window: WIN_WARM });
      tower(K(0.02), -1, 46, 8, 32, { col: [0.74, 0.76, 0.80], cap: [0.6, 0.62, 0.66], mast: 8 });
      // Pit wall + kerb trim
      const pitWallPoints = [];
      for (let i = 0; i <= 28; i++) {
        const s = (0.985 + i * 0.0025) % 1;
        pitWallPoints.push({ k: K(s), side: -1, dist: 8 });
      }
      groundedSegments({
        id: "hungaroring-pit-wall", points: pitWallPoints,
        width: 0.8, height: 1.3, color: WHITE,
      });
      groundedSegments({
        id: "hungaroring-pit-wall-trim",
        points: pitWallPoints.map((point) => Object.assign({}, point, { dist: 7.5 })),
        width: 0.35, height: 0.3, color: RED,
      });
      recordBarrier(0.985, 0.055, -1, 8);
      overheadSpan({
        id: "hungaroring-start-gantry", frac: 0.005, clearance: 7.05,
        thickness: 0.9, depth: 1.4, supportGap: 2.5,
        color: [0.30, 0.32, 0.36], required: true,
      });

      // Covered main tribune — big stepped wedge + dark roof box over pale seating (R).
      (function coveredMainTribune() {
        const len = 96;
        const boundsAnchor = anchor(K(0.00), 1, 56);
        const boundsBasis = [boundsAnchor.r, boundsAnchor.u, boundsAnchor.t];
        modelGroup("hungaroring-main-tribune", {
          center: vadd(boundsAnchor.c, boundsAnchor.u, 9), size: [28, 20, len + 6], basis: boundsBasis,
        }, (stage) => {
          for (let t = 0; t < 5; t++) {
            const a = anchor(K(0.00), 1, 45 + t * 4.2);
            const b = [a.r, a.u, a.t];
            const h = 2.4 + t * 2.6;
            stage._mat = MAT.CONCRETE;
            addBox(stage, vadd(a.c, a.u, h * 0.5), [5.2, h, len - t * 2], t % 2 ? SHELL : SHELL2, b);
            stage._mat = MAT.FABRIC;
            addBox(stage, vadd(a.c, a.u, h + 0.65), [4.6, 1.2, len - t * 2 - 2], CROWD[t % 4], b);
            stage._mat = 0;
            addBox(stage, vadd(a.c, a.u, h + 1.4), [4.9, 0.25, len - t * 2], [0.90, 0.88, 0.80], b);
          }
          // Dark roof canopy covering the wedge (cantilever toward track)
          const aR = anchor(K(0.00), 1, 53);
          stage._mat = MAT.METAL;
          addBox(stage, vadd(aR.c, aR.u, 16.2), [20, 0.9, len + 4], ROOF_DK, [aR.r, aR.u, aR.t]);
          // Leading-edge fascia
          addBox(stage, vadd(vadd(aR.c, aR.r, -8), aR.u, 15.4), [1.2, 1.6, len + 2], [0.32, 0.33, 0.36], [aR.r, aR.u, aR.t]);
          // Back shell wall behind the top tier
          const aB = anchor(K(0.00), 1, 67);
          stage._mat = MAT.CONCRETE;
          addBox(stage, vadd(aB.c, aB.u, 9), [3.5, 18, len], SHELL2, [aB.r, aB.u, aB.t]);
          stage._mat = 0;
          // Under-roof warm strip (reads occupied even in day)
          addBox(stage, vadd(aR.c, aR.u, 15.5), [14, 0.22, len - 4], [1.15, 1.00, 0.72], [aR.r, aR.u, aR.t]);
        }, { required: true });
      })();

      // ====================================================================
      // ACCENT FEATURES — water pond, hedge, Hungarian flags
      // ====================================================================
      // Water feature in the valley floor, beyond the compact T1/T2 foldback.
      waterSurface(K(0.08), 1, 75, [40, 1.0, 32], WATER,
                   { id: "hungaroring-lake", required: true });
      hedge(0.04, 0.11, 1, 32, 4, TREE);

      // Hungarian tricolour accent billboards (red/white/green)
      billboard(K(0.02), -1, 22, 10, 4, [0.20, 0.48, 0.20]);   // green
      billboard(K(0.04),  1, 22, 10, 4, [0.85, 0.20, 0.20]);   // red

      // ====================================================================
      // KERB ACCENTS at key corners
      // ====================================================================
      for (const [s, side] of [[0.06, 1], [0.12, -1], [0.40, 1], [0.55, -1], [0.90, 1]]) {
        groundPatch(K(s), side, 2, [0.4, 0.25, 6], side > 0 ? RED : WHITE,
                    { id: `hungaroring-kerb-${s}`, samples: 2 });
        groundPatch(K(s), side, 7, [10, 0.08, 12], GRASS,
                    { id: `hungaroring-runoff-${s}`, samples: 4 });
      }

      // ====================================================================
      // CROWD ON THE AMPHITHEATRE BANKING — the Hungaroring's famous grassy
      // "hill-viewing" slopes. Spectators sit ON the banking, so these are LOW
      // colour patches (a crowd blanket over the grass), NOT tall boxes — the
      // old 2-3 m slabs read as random blocks littering the hills. Kept sparse
      // and only on the inner amphitheatre stretches around the stadium/lake.
      // ====================================================================
      every(26, (kk) => {
        const sf = kk / n;
        // Stadium bowl (T1-4, s0-0.10) + the lake/amphitheatre back sweeps.
        const inBowl = sf < 0.12 || (sf > 0.32 && sf < 0.62) || sf > 0.88;
        if (!inBowl) return;
        // Skip problematic zone at frac ~0.42-0.44 (intrudes 1.05m at ground level)
        if (sf >= 0.42 && sf <= 0.44) return;
        for (const side of [-1, 1]) {
          const hh = hash(kk * 23 + side * 5);
          if (hh < 0.5) continue;
          const base = 40 + hh * 18;  // increased from 30 to clear road intrusion at frac ~0.432
          const col = CROWD[((kk + (side > 0 ? 1 : 0)) | 0) % CROWD.length];
          // Low, wide patch stepping up the slope — a distant crowd, not a slab.
          prop(kk, side, base, [10 + hh * 8, 0.35 + hh * 0.3, 12 + hh * 6], col);
        }
      });

      // ====================================================================
      // BESPOKE ENRICHMENT — terraced hillside stands packing the amphitheatre,
      // a trackside jumbotron, and the Budapest countryside beyond the bowl.
      // All models are LOCAL to this closure.
      // ====================================================================

      // ── Terraced hillside stand — the Hungaroring signature: stepped tiers of
      //    crowd rising up the natural banking, wrapping the bowl. Cheap slabs +
      //    a sparse speckle so it reads as a packed grandstand, not a block. ──
      const HG_SHELL_A = [0.48, 0.49, 0.52], HG_SHELL_B = [0.42, 0.43, 0.47];
      function terracedHillStand(s, side, gap, len, tiers) {
        const k = K(s);
        const g0 = anchor(k, side, gap);
        if (onTrack(g0.c[0], g0.c[2], len * 0.4)) return;
        for (let t = 0; t < tiers; t++) {
          const a = anchor(k, side, gap + t * 5.0);
          const b = [a.r, a.u, a.t];
          const h = 2.6 + t * 2.9;
          out._mat = MAT.CONCRETE;
          addBox(out, vadd(a.c, a.u, h * 0.5), [4.8, h, len], t % 2 ? HG_SHELL_A : HG_SHELL_B, b);
          out._mat = MAT.FABRIC;
          addBox(out, vadd(a.c, a.u, h + 0.75), [4.1, 1.4, len], CROWD[t % 4], b);
          out._mat = 0;
          addBox(out, vadd(a.c, a.u, h + 1.6), [4.4, 0.28, len + 1], [0.92, 0.90, 0.82], b);
          const cnt = Math.min(16, Math.floor(len / 6));
          out._mat = MAT.FABRIC;
          for (let c = 0; c < cnt; c++) {
            if (hash(k * 3 + t * 23 + c) < 0.45) continue;
            const off = (c / (cnt - 1) - 0.5) * (len - 4);
            addBox(out, vadd(vadd(a.c, a.t, off), a.u, h + 1.2), [1.7, 0.55, 1.1], CROWD[(c + t) % 4], b);
          }
          out._mat = 0;
        }
        // Slim roof canopy shading the top tier.
        const aR = anchor(k, side, gap + (tiers - 0.5) * 5.0);
        out._mat = MAT.METAL;
        addBox(out, vadd(aR.c, aR.u, 2.6 + tiers * 2.9 + 1.4), [6.4, 0.42, len + 2],
               [0.22, 0.23, 0.26], [aR.r, aR.u, aR.t]);
        out._mat = 0;
      }
      // A near-continuous wall of thin terraced stands ringing the amphitheatre —
      // packed tiers on the main bowl sweeps (vert-light; main tribune owns s=0).
      for (const [s, side, gap, len, tiers] of [
        [0.06, 1, 26, 64, 4],   // Turn 1 downhill hillside
        [0.12, -1, 22, 48, 3],  // inside the slow complex
        [0.20, 1, 26, 42, 3],
        [0.30, -1, 26, 40, 3],
        [0.40, 1, 28, 42, 3],
        [0.48, -1, 24, 40, 3],
        [0.58, 1, 24, 46, 3],
        [0.68, -1, 22, 42, 3],
        [0.78, 1, 24, 44, 3],
        [0.90, 1, 22, 54, 4],   // Club-corner hillside back to the line
      ]) terracedHillStand(s, side, gap, len, tiers);

      // ── Trackside jumbotron — a big screen on a truss frame facing the bowl. ──
      (function jumbotron() {
        const a = anchor(K(0.55), -1, 30);
        const b = [a.r, a.u, a.t], c = a.c;
        if (onTrack(c[0], c[2], 8)) return;
        out._mat = MAT.METAL;
        for (const sg of [-1, 1])                                   // two support legs
          addCyl(out, vadd(c, a.t, sg * 4.5), 0.5, 12, [0.24, 0.25, 0.28], 6, b);
        addBox(out, vadd(c, a.u, 12.5), [1.2, 6, 11], [0.20, 0.21, 0.24], b);   // truss frame
        out._mat = 0;
        addBox(out, vadd(vadd(c, a.r, -0.7), a.u, 12.5), [0.4, 5, 9.5], [0.05, 0.07, 0.12], b); // screen — stays FLAT (video screen)
      })();

      // ── Budapest countryside — a distant rural cluster (farmhouses + a white
      //    village church with a spire) on a hill beyond the far bank, plus
      //    dusty sunflower / wheat field patches on the plain. ──
      (function countryside() {
        const a = anchor(K(0.62), 1, 260);
        const b = [a.r, a.u, a.t], base = a.c;
        const wallC = [0.82, 0.78, 0.68], roofC = [0.56, 0.30, 0.22];
        // Scatter of farmhouses with pitched roofs.
        for (let i = 0; i < 6; i++) {
          const off = (i - 2.5) * 34, out2 = hash(i * 9) * 40;
          const f = vadd(vadd(base, a.t, off), a.r, out2);
          const w = 12 + hash(i * 7) * 6, hh = 7 + hash(i * 5) * 3;
          out._mat = MAT.STONE;
          addBox(out, vadd(f, a.u, hh * 0.5), [w, hh, w * 0.8], hash(i) < 0.5 ? wallC : [0.76, 0.72, 0.62], b);
          out._mat = MAT.ROOF;
          addPrism(out, vadd(f, a.u, hh + 1.6), [w, 3.2, w * 0.8], roofC, b);
          out._mat = 0;
        }
        // Village church: white nave + a tall spire.
        const cf = vadd(vadd(base, a.t, 20), a.r, 60);
        out._mat = MAT.STONE;
        addBox(out, vadd(cf, a.u, 8), [14, 16, 22], [0.90, 0.88, 0.82], b);
        out._mat = MAT.ROOF;
        addPrism(out, vadd(cf, a.u, 17), [14, 4, 22], roofC, b);
        const tf = vadd(cf, a.t, 13);
        out._mat = MAT.STONE;
        addBox(out, vadd(tf, a.u, 13), [5, 26, 5], [0.92, 0.90, 0.84], b);
        out._mat = MAT.METAL;
        addCone(out, vadd(tf, a.u, 26), 3.4, 12, roofC, 7, b);
        out._mat = 0;
      })();
      // Sunflower / wheat field patches on the open plain (dusty Hungarian gold).
      for (const [s, side, dist] of [[0.35, 1, 120], [0.45, -1, 130], [0.70, 1, 140], [0.25, -1, 115]]) {
        const k = K(s);
        const a = anchor(k, side, dist);
        if (onTrack(a.c[0], a.c[2], 30)) continue;
        groundPatch(k, side, dist, [90, 1.0, 80],
                    hash(k * 5) < 0.5 ? [0.78, 0.72, 0.36] : [0.72, 0.66, 0.34],
                    { id: `hungaroring-field-${s}`, samples: 6 });
      }

      // ====================================================================
      // AUTHENTIC DEPTH PASS — bounded hero-sector additions
      // ====================================================================

      // 1. Close bowl-viewing berms behind the T1/T2 and final-corner stands.
      // Low crowd blankets sit well back on the bank and preserve corner sightlines.
      for (const [s, side, dist, len] of [
        [0.075,  1, 92, 46], [0.115, -1, 88, 40], [0.905, 1, 86, 48],
      ]) {
        const k = K(s);
        const hh = hash(k * 41 + side * 17);
        backdrop(k, side, dist, [76 + hh * 18, 12 + hh * 4, len + 20], AMPH2);
        prop(k, side, 62 + hh * 8, [14, 0.45, len], CROWD[(k + (side > 0 ? 1 : 0)) % CROWD.length]);
      }

      // 2. A sparse second woodland layer on the quiet outer perimeter. Fixed
      // fractions create depth without closing the fast S2 driver sightlines.
      for (const [s, side, dist] of [
        [0.205, 1, 32], [0.235, 1, 42], [0.275, 1, 35],
        [0.715, -1, 34], [0.755, -1, 44], [0.825, -1, 36],
      ]) {
        const k = K(s), h = hash(k * 53 + side * 7);
        tree(k, side, dist, 10 + h * 5, h < 0.5 ? TREE : TREE2);
        pine(k, side, dist + 9, 12 + h * 5, TREE);
      }

      // 3–4. Deeper paddock/event operations and proper intervention points.
      // CircuitKit stages each complete facility atomically and rejects unsafe
      // footprints on this compact, tightly folded circuit.
      if (circuitKit) {
        circuitKit.hospitality({
          id: "kit:hungaroring:paddock-hospitality", frac: 0.012,
          side: -1, gap: 92, size: [18, 9, 38], modules: 5,
        });
        circuitKit.serviceCompound({
          id: "kit:hungaroring:paddock-service", frac: 0.035,
          side: -1, gap: 112, size: [26, 6, 34], vehicles: 7,
        });
        for (const [id, frac, side] of [
          ["t4", 0.285, -1], ["t11", 0.625, 1],
        ]) {
          circuitKit.marshalShelter({
            id: `kit:hungaroring:marshal-${id}`, frac, side,
            gap: 18, size: [6, 3, 5],
          });
        }
        circuitKit.recoveryBay({
          id: "kit:hungaroring:recovery-t12", frac: 0.705,
          side: 1, gap: 34, size: [13, 5, 18],
        });
      }

      // 5. Localised Buda/Cserhát-style relief beyond the eastern bowl edge.
      // A short, low ridge arc adds regional layering without making Hungary alpine.
      for (let i = 0; i < 5; i++) {
        const a = 0.15 + i * 0.16;
        const h = hash(730 + i * 29);
        const rr = rad + 390 + h * 45;
        ridge(cx + Math.cos(a) * rr, cz + Math.sin(a) * rr, pyMin,
              a + Math.PI / 2, 190 + h * 65, 105 + h * 35,
              22 + h * 10, i % 2 ? HAZE : HAZE2);
      }
    },
  }
  );
})();
