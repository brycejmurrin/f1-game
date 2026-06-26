/* Apex 26 — ALBERT PARK circuit definition (data only).
   Registered on the global TrackDefs list; consumed by the js/tracks.js engine
   (palette resolved there from `night`, geometry from js/circuits.js or `segs`). */
(function () {
  "use strict";
  (window.TrackDefs = window.TrackDefs || []).push(
  {
    id: "albert_park",
    reverse: true,  // GPS trace is backwards vs real racing direction (auto-audit)
    name: "ALBERT PARK",
    gp: "Australian GP",
    country: "Australia",
    night: false,
    theme: "green",
    lengthKm: 5.3,
    baseHW: 7,
    // Parkland reaches far in every direction (flat 225-ha park around the lake),
    // so push the green terrain ribbon well out — no bare grey void to the horizon
    // behind the lake / treelines / CBD-across-the-water.
    // Keep the terrain ribbon hugging the track (~110 m) so it does NOT flood the
    // whole infield with green and bury the lake; beyond it the engine floor plane
    // (parkland green) and the lake water slabs take over.
    terrainOuter: 110,
    pal: { zenith: [0.22, 0.44, 0.82], horizon: [0.76, 0.79, 0.82], grass: [0.28, 0.50, 0.24], runoff: [0.48, 0.42, 0.32], fogDensity: 0.0012, sunDir: [0.6666666666666667, 0.6666666666666667, 0.33333333333333337], sun: [1, 0.95, 0.8], sunColor: [1, 0.93, 0.78] },
    segs: [
      { t: 0, l: 300 }, { t: 50, l: 100 }, { t: -50, l: 90 }, { t: 65, l: 80 }, { t: 0, l: 200 }, { t: 80, l: 90 },
      { t: -90, l: 100 }, { t: 60, l: 90 }, { t: 0, l: 260 }, { t: 80, l: 90 }, { t: 0, l: 200 }, { t: 70, l: 80 },
    ],
    // Gentle parkland undulation: slight rise through the T11-T15 lakeside section,
    // then a dip back through the T1-T4 approach — mirrors Melbourne's actual terrain.
    elevations: [{ s: 0.12, halfM: 340, rise: 7 }, { s: 0.55, halfM: 300, rise: -5 }],
    scenery: function (api) {
      const { out, n, px, pz, pyMin, place, prop, backdrop, groundPlane, groundYAt,
              every, hash, onTrack,
              grandstand, building, tower, tree, palm, bush, hedge, billboard, gantry,
              marshalPost, fence, guardrail, tyreWall, anchor, vadd, addBox,
              addCyl, addCone, addFrustum, addPrism, addPyramid,
              forestEdge, cityFront } = api;
      const k = (s) => Math.round(s * n) % n;

      // ---- Palette (Melbourne lakeside parkland, bright day) ----
      const GRASS  = [0.32, 0.62, 0.28];
      const WATER  = [0.20, 0.45, 0.62];
      const WHITE  = [0.92, 0.92, 0.92], RED = [0.80, 0.15, 0.15];
      const SHELL  = [0.46, 0.47, 0.52], CROWD = [0.70, 0.60, 0.55];
      // Night-ready: bright warm window colour for CBD towers (glows at night)
      const CBD_WIN_LIT = [0.82, 0.78, 0.52];   // warm amber — lit office windows
      const CBD_WIN_DAY = [0.55, 0.65, 0.80];   // cool glass reflection (day)

      // ---- Track centre (for skyline / lake placement reference) ----
      let cx = 0, cz = 0;
      for (let i = 0; i < n; i++) { cx += px[i]; cz += pz[i]; }
      cx /= n; cz /= n;

      // ====================================================================
      // ALBERT PARK LAKE — the large Y-shaped artificial lake the circuit WRAPS
      // AROUND. It fills the INFIELD (interior of the lap), centred on the track
      // centroid (cx,cz). Built as a field of flat water slabs tiled across the
      // interior and seated AT terrain level (never floating) so it reads clearly
      // as a single broad body of dark blue-green water. Two small islands break
      // it up (Gunn / Mud islands). Concrete barriers run tight to the water on
      // the back/lakeside leg of the lap.
      // ====================================================================
      const WATER_DEEP = [0.16, 0.28, 0.32];   // dark blue-green lake body
      const WATER_MID  = [0.18, 0.30, 0.34];   // (brief reference tone)
      const WATER_EDGE = [0.22, 0.36, 0.40];   // lighter shimmer near the shore

      // Nearest road node to an arbitrary infield point — used to seat water at
      // the LOCAL terrain height there (so slabs sit on the ground, not floating).
      const nearestK = (wx, wz) => {
        let best = 0, bd = Infinity;
        for (let i = 0; i < n; i++) {
          const d = (px[i] - wx) * (px[i] - wx) + (pz[i] - wz) * (pz[i] - wz);
          if (d < bd) { bd = d; best = i; }
        }
        return { k: best, dist: Math.sqrt(bd) };
      };
      // Lay a flat water slab centred on world (wx,wz), seated just below the
      // local terrain surface so its top reads at ground level. Skips any slab
      // that would overlap the tarmac (so water never paints over the road).
      // Flat lake surface seated at a FIXED level just above the engine floor
      // plane (which sits at pyMin - 0.6). pyMin - 0.3 keeps the water visible
      // above the floor everywhere, reading as one continuous flat lake.
      const LAKE_Y = pyMin - 0.3;
      const waterSlab = (wx, wz, sx, sz, col) => {
        if (onTrack(wx, wz, Math.max(sx, sz) * 0.5 + 2)) return;
        addBox(out, [wx, LAKE_Y - 2, wz], [sx, 4, sz], col);  // 4 m thick, top at LAKE_Y
      };

      // ---- Lake body: tile the infield around the centroid in a broad Y ----
      // Central basin (over the centroid), then three lobes reaching out toward
      // the surrounding lap, with the lakeside (back) leg getting water right up
      // to the barrier. Slab grid is dense enough to read as continuous water.
      const LAKE = [
        // [worldX, worldZ, sizeX, sizeZ, tone]
        // central broad basin
        [ -6,  -39, 360, 300, WATER_DEEP],
        [-150,  -39, 240, 260, WATER_DEEP],
        [ 140,  -39, 240, 260, WATER_DEEP],
        // northern lobe (toward the CBD shore / s≈0.0 leg)
        [ -40, -230, 280, 220, WATER_DEEP],
        [-180, -210, 200, 200, WATER_MID ],
        [ 120, -210, 200, 200, WATER_MID ],
        // eastern arm (toward s≈0.30 leg)
        [ 230,  -90, 200, 220, WATER_MID ],
        [ 260,   60, 180, 200, WATER_MID ],
        // southern / lakeside lobe (back leg of the lap, s≈0.55–0.70)
        [ -30,  150, 300, 220, WATER_DEEP],
        [-200,  140, 220, 220, WATER_MID ],
        [ 170,  140, 200, 200, WATER_MID ],
        [ -80,  300, 260, 200, WATER_EDGE],
        [-260,  250, 200, 180, WATER_EDGE],
        [ 110,  290, 200, 180, WATER_EDGE],
        // western arm (toward s≈0.85 leg)
        [-260,  -90, 200, 220, WATER_MID ],
        [-300,   60, 180, 200, WATER_EDGE],
      ];
      for (const [wx, wz, sx, sz, col] of LAKE) waterSlab(wx, wz, sx, sz, col);

      // ---- Two small islands (Gunn + Mud) — low green domes in the water ----
      for (const [wx, wz, r] of [[-80, -10, 34], [120, 120, 26]]) {
        if (onTrack(wx, wz, r + 4)) continue;
        const y = LAKE_Y - 0.1;   // sit on the lake surface
        addFrustum(out, [wx, y, wz], r, r * 0.6, 2.2, [0.24, 0.46, 0.24], 8);
        addCone(out, [wx, y + 2.2, wz], r * 0.6, 2.0, [0.22, 0.44, 0.22], 8);
        // a couple of reeds / a tree clump on the island
        addCone(out, [wx + r * 0.2, y + 2.5, wz], 4, 8, [0.20, 0.42, 0.22], 6);
      }

      // ---- Moored rowboats + kayaks along the lakeside (back-leg shore) ----
      for (let j = 0; j < 8; j++) {
        const a = anchor((k(0.55 + j * 0.018) + j * 11) % n, -1, 16 + hash(j * 7) * 14);
        if (onTrack(a.c[0], a.c[2], 3)) continue;
        addBox(out, vadd(a.c, a.u, 0.6), [1.8, 1.0, 8.5], [0.88, 0.85, 0.80], [a.r, a.u, a.t]);
        if (hash(j * 11) > 0.5)
          addCyl(out, vadd(a.c, a.t, -0.5), 0.08, 5.2, [0.40, 0.35, 0.28], 4, [a.r, a.u, a.t]);
      }
      void WATER_MID;

      // ====================================================================
      // MELBOURNE CBD SKYLINE — clustered ACROSS THE LAKE on the far (N/NE)
      // shore, framed OVER THE WATER. The lake fills the infield (centred on the
      // centroid); the CBD sits BEYOND its northern shore at world z≈-450…-700,
      // so from the southern / lakeside leg of the lap (s≈0.55–0.70, z≈+600…+850)
      // you look NORTH across the water to the towers — the signature view.
      //   The whole cluster is anchored off the pit-straight nodes (s≈0.0 / 0.9 /
      //   0.95) whose `side` rays reach into the north zone; each tower's anchor
      //   lands across the lake, never on the near grass.
      //   Heroes: Australia 108 (tallest, dark slab + gold starburst) and Eureka
      //   (blue glass body + gold crown + red stripe), plus Rialto (twin dark
      //   towers) and a band of anonymous cool blue-grey glass boxes.
      // ====================================================================
      const SKY_GLASS = [0.42, 0.50, 0.60];      // cool blue-grey reflective glass
      const SKY_GLASS_D = [0.30, 0.36, 0.46];    // darker glass slab
      const GOLD = [0.85, 0.70, 0.25];           // Eureka crown / 108 starburst gold

      // Custom hero builder: a tall glass slab body with a coloured cap.
      // bw = base width/depth (m), bh = body height (m). capH=crown height, capCol
      // tints the top section; stripe adds a thin red band just below the crown.
      const heroTower = (s, side, dist, bw, bh, opts) => {
        const a = anchor(k(s), side, dist), b = [a.r, a.u, a.t];
        if (onTrack(a.c[0], a.c[2], bw)) return null;
        const body = opts.body || SKY_GLASS;
        addFrustum(out, a.c, bw * 0.5, bw * 0.42, bh, body, opts.seg || 4, b);
        if (opts.stripe) {
          addBox(out, vadd(a.c, a.u, bh - opts.capH - 4), [bw * 0.86, 2.5, bw * 0.86],
                 [0.82, 0.16, 0.16], b);
        }
        if (opts.capCol) {
          addFrustum(out, vadd(a.c, a.u, bh - opts.capH), bw * 0.43, bw * 0.34,
                     opts.capH, opts.capCol, opts.seg || 4, b);
        }
        return a;
      };

      // ---- Anonymous mid-rise glass mass — the blurred backdrop band, spread
      //      along the whole north shore arc (west→east) across the water ----
      // Each entry: [anchorS, anchorSide, distBase] — picked so the building lands
      // beyond the lake's north shore (z≈-440…-720).
      const CBD_BAND = [];
      for (let i = 0; i < 16; i++) {     // west wing
        CBD_BAND.push([0.0, 1, 150 + i * 11, i]);
      }
      for (let i = 0; i < 14; i++) {     // centre
        CBD_BAND.push([0.9, -1, 150 + i * 12, i + 20]);
      }
      for (let i = 0; i < 14; i++) {     // east wing
        CBD_BAND.push([0.95, -1, 150 + i * 12, i + 40]);
      }
      for (const [s, side, dist, seed] of CBD_BAND) {
        const w = 16 + hash(seed * 3) * 14;
        const h = 70 + hash(seed * 11) * 150;
        const wallCol = [0.34 + hash(seed * 5) * 0.10, 0.42 + hash(seed * 2) * 0.08, 0.54 + hash(seed * 4) * 0.06];
        const winCol = (hash(seed * 19) > 0.45) ? CBD_WIN_LIT : CBD_WIN_DAY;
        building(k(s), side, dist, w, h, w, {
          wall: wallCol, window: winCol, floor: 6,
          setback: hash(seed * 13) > 0.50, roof: hash(seed * 17) > 0.60,
        });
      }

      // ---- AUSTRALIA 108 — the actual tallest (~317 m): tall slender DARK
      //      glass slab with a gold "starburst" near the top. Centre-front of the
      //      cluster (lands x≈+65, z≈-540) — reads tallest over the water. ----
      {
        const bw = 32, bh = 317;
        const a = heroTower(0.9, -1, 280, bw, bh, {
          body: SKY_GLASS_D, seg: 4, capCol: [0.22, 0.27, 0.36], capH: 22 });
        if (a) {
          const b = [a.r, a.u, a.t];
          addBox(out, vadd(a.c, a.u, bh * 0.72), [bw * 0.62, 26, bw * 0.62], GOLD, b);
          for (const o of [-bw * 0.40, bw * 0.40]) {
            addBox(out, vadd(vadd(a.c, a.t, o), a.u, bh * 0.72), [bw * 0.18, 34, bw * 0.12], GOLD, b);
          }
          for (const o of [-bw * 0.40, bw * 0.40]) {
            addBox(out, vadd(vadd(a.c, a.r, o), a.u, bh * 0.72), [bw * 0.12, 34, bw * 0.18], GOLD, b);
          }
          addCyl(out, vadd(a.c, a.u, bh), 0.4, 26, [0.3, 0.3, 0.32], 4, b);   // antenna spire
        }
      }

      // ---- EUREKA TOWER (~297 m): blue glass body + signature GOLD crown cap +
      //      thin red stripe — the standout, most identifiable landmark. Just
      //      east of Australia 108 (lands x≈+150, z≈-620). ----
      {
        const bw = 36, bh = 297;
        const a = heroTower(0.9, -1, 160, bw, bh, {
          body: [0.24, 0.36, 0.56],   // deep blue glass body
          seg: 4, capCol: GOLD, capH: 44, stripe: true });
        if (a) {
          const b = [a.r, a.u, a.t];
          addBox(out, vadd(vadd(a.c, a.t, bw * 0.24), a.u, bh - 20), [bw * 0.56, 30, bw * 0.56], GOLD, b);
          addCyl(out, vadd(a.c, a.u, bh + 18), 0.35, 18, [0.3, 0.3, 0.32], 4, b);
        }
      }

      // ---- RIALTO TOWERS — two conjoined dark blue/grey glass towers (west
      //      wing, lands x≈-230, z≈-600) ----
      for (const [s, side, dist, dh] of [[0.0, 1, 170, 0], [0.0, 1, 185, -16]]) {
        heroTower(s, side, dist, 26, 235 + dh, {
          body: [0.28, 0.33, 0.43], seg: 4, capCol: [0.20, 0.24, 0.32], capH: 10 });
      }
      // ---- A few anonymous tall glass mid-rises flanking the heroes ----
      for (const [s, side, dist, bw, bh] of [
        [0.0, 1, 240, 28, 210], [0.95, -1, 200, 26, 200], [0.0, 1, 300, 24, 180],
        [0.95, -1, 270, 28, 225], [0.9, -1, 220, 30, 195], [0.95, -1, 330, 26, 185],
      ]) {
        heroTower(s, side, dist, bw, bh, {
          body: SKY_GLASS, seg: 4, capCol: [0.24, 0.30, 0.40], capH: 8 });
      }

      // ---- Far-horizon silhouette band — distant CBD depth layer behind the
      //      heroes (further north still, across the water) ----
      for (let i = 0; i < 14; i++) {
        const f = i / 13;
        const bh = 55 + hash(i * 13) * 130;   // 55–185 m tower heights
        const bw = 28 + hash(i * 9) * 24;      // 28–52 m wide
        // alternate west / centre / east anchors so the far band spans the arc
        const fam = [[0.0, 1, 360], [0.9, -1, 360], [0.95, -1, 380]][i % 3];
        backdrop(k(fam[0]), fam[1], fam[2] + f * 120,
                 [bw, bh, 26],
                 [0.40 + hash(i * 7) * 0.06, 0.46 + hash(i * 3) * 0.05, 0.56 + hash(i * 11) * 0.06]);
      }

      // ====================================================================
      // PARKLAND HORIZON — rounded green mound backdrop, both sides.
      // backdrop() auto-detects green-dominant colour → renders as organic
      // stacked-frustum mounds rather than flat slabs.  Replaces old flat
      // [120,18,100] slab loop.  Placed at dist 160–240 m so they sit well
      // behind forestEdge treelines and don't clip them.
      // ====================================================================
      every(100, (kk) => {
        for (const side of [-1, 1]) {
          // Skip the CBD / lake side (s≈0.34–0.60 L) so mounds don't fight the
          // skyline now clustered across the lake on side -1, nor float on water.
          if (side === -1 && kk >= k(0.32) && kk <= k(0.62)) continue;
          const dist = 165 + hash(kk * 6 + side) * 60;
          const w    = 130 + hash(kk * 11 + side) * 60;  // 130–190 m footprint (wider, fewer)
          const h    =  24 + hash(kk * 17 + side) * 16;  // 24–40 m mound height
          // Green-dominant: col[1] > col[0] and col[1] > col[2]*1.05
          backdrop(kk, side, dist, [w, h, 90], [0.18, 0.38 + hash(kk * 23 + side) * 0.06, 0.20]);
        }
      });

      // ====================================================================
      // PARKLAND TREE LINES — lush dense broadleaf + native foliage
      // Albert Park is renowned for its leafy green parkland character.
      //
      // ALL foliage placed via forestEdge() which accounts for canopy radius
      // so no tree/pine canopy can clip through barriers or fences.
      // Gap values are set to stay clear of the outermost barrier/fence/stand.
      //
      // Circuit zones (approximate, from visual + real-layout reference):
      //   s=0.00–0.10  main straight + pit lane → grandstands both sides
      //   s=0.10–0.27  fast sweeps T1–T4 → light forest parkland
      //   s=0.27–0.65  LAKESIDE — LHS is lake shore; RHS parkland, CBD beyond
      //   s=0.65–0.85  southern park loop — dense eucalyptus / native trees
      //   s=0.85–1.00  pit approach straight
      // ====================================================================

      // ---- Main straight LHS (pit wall side) — sparse, behind grandstand ----
      // grandstand at gap=12, fence at gap=9 → forestEdge gap 20 keeps clear
      forestEdge(0.00, 0.10, -1, 20, {
        density: 0.45, hMin: 8, hMax: 14,
        col: [0.16, 0.36, 0.16], col2: [0.20, 0.42, 0.18], pineFrac: 0.30,
      });

      // ---- Main straight RHS — grandstands + hospitality, tight parkland strip ----
      // grandstand at gap=14, fence at gap=10 → forest at gap 22
      forestEdge(0.00, 0.10, 1, 22, {
        density: 0.40, hMin: 7, hMax: 12,
        col: [0.17, 0.38, 0.17], col2: [0.21, 0.43, 0.19], pineFrac: 0.25,
      });

      // ---- Fast sweeps T1–T4 (s=0.10–0.27), both sides — lush parkland ----
      // hedges removed; forestEdge with gap 16 (fence at 9–10 → 7m clearance for canopy)
      forestEdge(0.10, 0.27, -1, 16, {
        density: 0.65, hMin: 9, hMax: 15,
        col: [0.17, 0.40, 0.18], col2: [0.21, 0.45, 0.20], pineFrac: 0.35,
      });
      forestEdge(0.10, 0.27, 1, 18, {
        density: 0.60, hMin: 8, hMax: 14,
        col: [0.18, 0.41, 0.18], col2: [0.22, 0.46, 0.20], pineFrac: 0.30,
      });

      // ---- Lakeside RHS (s=0.27–0.65) — parkland strip between track and CBD ----
      // grandstand at gap=14–16; forest behind at gap 26 to stay clear
      forestEdge(0.27, 0.65, 1, 26, {
        density: 0.50, hMin: 9, hMax: 16,
        col: [0.18, 0.40, 0.18], col2: [0.22, 0.44, 0.20], pineFrac: 0.20,
      });

      // ---- Lakeside LHS (s=0.27–0.65) — shore-line Morton Bay figs + eucalyptus ----
      // guardrail at gap=3, grandstands at gap=16; forest well back at gap 32
      // so canopy inner edge stays beyond the stand shell (~gap+15m outer face)
      forestEdge(0.27, 0.65, -1, 32, {
        density: 0.70, hMin: 10, hMax: 18,
        col: [0.20, 0.44, 0.20], col2: [0.24, 0.48, 0.22], pineFrac: 0.20,
      });

      // ---- Southern park loop (s=0.65–0.85) — dense native/eucalyptus ----
      forestEdge(0.65, 0.85, -1, 16, {
        density: 0.75, hMin: 10, hMax: 18,
        col: [0.19, 0.43, 0.19], col2: [0.23, 0.47, 0.21], pineFrac: 0.25,
      });
      forestEdge(0.65, 0.85, 1, 18, {
        density: 0.70, hMin: 9, hMax: 16,
        col: [0.20, 0.44, 0.20], col2: [0.24, 0.48, 0.22], pineFrac: 0.28,
      });

      // ---- Pit approach (s=0.85–1.00) — both sides, lighter canopy ----
      forestEdge(0.85, 1.00, -1, 16, {
        density: 0.50, hMin: 8, hMax: 13,
        col: [0.17, 0.39, 0.17], col2: [0.21, 0.43, 0.19], pineFrac: 0.30,
      });
      forestEdge(0.85, 1.00, 1, 22, {
        density: 0.45, hMin: 7, hMax: 12,
        col: [0.18, 0.40, 0.18], col2: [0.22, 0.44, 0.20], pineFrac: 0.25,
      });

      // ---- Additional native tree clusters at chicane complex (s=0.75–0.82) ----
      // Botanical garden character — taller specimens, rich greens, both sides
      forestEdge(0.75, 0.82, -1, 20, {
        density: 0.80, hMin: 12, hMax: 20,
        col: [0.21, 0.45, 0.20], col2: [0.25, 0.49, 0.23], pineFrac: 0.15,
      });
      forestEdge(0.75, 0.82, 1, 22, {
        density: 0.75, hMin: 11, hMax: 18,
        col: [0.22, 0.46, 0.21], col2: [0.26, 0.50, 0.24], pineFrac: 0.18,
      });

      // ====================================================================
      // EXPLICIT ALBERT PARK TREE MIX — the parkland is a VERIFIED blend of:
      //   • Canary Island date PALMS  → palm()  (lakeside / Beaconsfield avenues)
      //   • eucalyptus / river red GUMS → tree() (large native canopies, blue-green,
      //     evergreen, the dominant native specimen incl. the Corroboree Tree)
      //   • London PLANES → tree() (deciduous avenue — autumn tint in March)
      // Greens stay lush; planes carry a light autumn tint; gums stay evergreen.
      // All placed via the canopy-aware helpers; gaps keep clear of fences/stands.
      // ====================================================================
      const GUM   = [0.22, 0.42, 0.26];   // eucalyptus blue-green (cool, native)
      const GUM2  = [0.26, 0.46, 0.30];
      const PLANE = [0.30, 0.48, 0.22];   // London plane fresh green
      const AUTUMN = [0.62, 0.46, 0.18];  // plane-tree autumn tint
      const PALMF = [0.21, 0.47, 0.25];   // palm frond green

      // ---- Gum + plane parkland avenues (both sides, around the lap) ----
      every(34, (kk) => {
        for (const side of [-1, 1]) {
          // keep clear of the lake water on the lakeside (s≈0.32–0.62 L)
          if (side === -1 && kk >= k(0.32) && kk <= k(0.62)) continue;
          const r = hash(kk * 43 + side * 2.1);
          const dist = 22 + hash(kk * 57 + side) * 30;
          if (r < 0.55) {
            // large native gum canopy (broad, blue-green)
            tree(kk, side, dist, 14 + hash(kk * 61 + side) * 8,
                 (hash(kk * 7 + side) > 0.5) ? GUM2 : GUM);
          } else if (r < 0.82) {
            // London plane — autumn tint on some specimens (March race)
            tree(kk, side, dist, 11 + hash(kk * 12 + side) * 6,
                 (hash(kk * 17 + side) > 0.62) ? AUTUMN : PLANE);
          } else {
            // scattered date palm among the avenue
            palm(kk, side, dist, 12 + hash(kk * 9 + side) * 5, PALMF);
          }
        }
      });

      // ---- Canary Island date PALM avenues — the signature lakeside feature ----
      // Lakeside Drive stretch (s≈0.50–0.60 L) framing the dramatic water section.
      for (let j = 0; j < 12; j++) {
        const kk = (k(0.50) + j * 2) % n;
        palm(kk, -1, 26 + hash(kk * 9 + j) * 10, 13 + hash(kk * 12 + j) * 4, PALMF);
      }
      // Pit straight + Beaconsfield-style avenue palms (R side, near grandstands)
      for (let j = 0; j < 4; j++) {
        palm((k(0.0) + j * 3) % n, 1, 26 + j * 9, 14 + hash(j * 3) * 3, PALMF);
        palm((k(0.94) + j * 3) % n, 1, 26 + j * 9, 13 + hash(j * 5) * 3, PALMF);
      }
      // Lakeside palm avenue on the far approach (s≈0.42–0.46 L), set back over grass
      for (let j = 0; j < 6; j++) {
        const kk = (k(0.42) + j * 2) % n;
        palm(kk, -1, 30 + hash(kk * 5 + j) * 8, 13 + hash(kk * 4 + j) * 4, PALMF);
      }

      // ---- Big specimen river red gums (botanical character, southern park) ----
      for (let j = 0; j < 7; j++) {
        const kk = (k(0.68) + j * 4) % n;
        tree(kk, (j % 2 ? 1 : -1), 24 + hash(kk * 6 + j) * 16,
             17 + hash(kk * 8 + j) * 7, (hash(kk * 3 + j) > 0.5) ? GUM : GUM2);
      }

      // ---- Rowing boathouses + aquatic structures (s≈0.40 L) ----
      // gap=60 keeps inner face well clear of road; boathouses add lakeside character
      for (let j = 0; j < 2; j++) {
        building(k(0.40 + j * 0.04), -1, 60 + j * 12, 16, 8, 28, {
          wall: [0.86, 0.88, 0.86], window: [0.22, 0.52, 0.72], floor: 3 });
      }
      // Lakeside Recreation Reserve + stadium (s≈0.62–0.68 L)
      for (let j = 0; j < 2; j++) {
        building(k(0.63 + j * 0.05), -1, 62 + j * 8, 18, 10, 32, {
          wall: [0.82, 0.84, 0.86], window: [0.28, 0.53, 0.73], floor: 3 });
      }

      // ====================================================================
      // GRANDSTANDS — main straight + signature corners (crowd-tinted)
      // ====================================================================
      grandstand(0.00, -1, 12, 90, SHELL, CROWD);   // main grandstand, pit straight L
      grandstand(0.07, -1, 14, 60, SHELL, CROWD);   // extended pit-straight bank L
      grandstand(0.04,  1, 14, 55, SHELL, CROWD);   // Turn 1-2 sweep R
      grandstand(0.12,  1, 16, 48, SHELL, CROWD);   // Turn 3 exit bank R
      grandstand(0.30, -1, 16, 50, SHELL, CROWD);   // lakeside spectator bank L
      grandstand(0.55, -1, 16, 55, SHELL, CROWD);   // Lakeside Drive bank L
      grandstand(0.62,  1, 14, 60, SHELL, CROWD);   // spectator grandstand R
      grandstand(0.66,  1, 16, 45, SHELL, CROWD);   // adjoining spectator bank R
      grandstand(0.78, -1, 14, 45, SHELL, CROWD);   // chicane complex L
      grandstand(0.90,  1, 18, 50, SHELL, CROWD);   // fan-hill grandstand R
      grandstand(0.95, -1, 14, 48, SHELL, CROWD);   // pit-approach bank L
      grandstand(0.20,  1, 16, 46, SHELL, CROWD);   // fast section R
      grandstand(0.45, -1, 16, 44, SHELL, CROWD);   // lakeside bank L

      // ---- Pit building + garages: long low white box row, dark roof (s≈0.0 R) ----
      building(k(0.0), 1, 5, 14, 9, 180, { wall: [0.86, 0.87, 0.88], window: [0.18, 0.22, 0.28], floor: 4 });
      {
        const a = anchor(k(0.0), 1, 12);
        addBox(out, vadd(a.c, a.u, 9.6), [18, 0.8, 190], [0.30, 0.32, 0.34], [a.r, a.u, a.t]);
      }
      // marquee tent caps beside the s≈0.62 grandstand — at dist≥42, clear of stand
      for (let j = 0; j < 3; j++) {
        const a = anchor(k(0.62), 1, 42 + j * 10);
        if (onTrack(a.c[0], a.c[2], 6)) continue;
        // White tent body + coloured prism ridge roof
        addBox(out, vadd(a.c, a.u, 2.2), [11.0, 4.0, 11.0], WHITE, [a.r, a.u, a.t]);
        addPrism(out, vadd(a.c, a.u, 4.8), [11.0, 2.0, 11.0],
                 [[0.20, 0.44, 0.72], [0.86, 0.28, 0.18], [0.90, 0.78, 0.24]][j % 3],
                 [a.r, a.u, a.t]);
      }

      // ---- Paddock freight containers near pit entry (s≈0.97 L) ----
      // Stacked containers: each is a solid box with a thin lid strip so they
      // read as real containers rather than anonymous blocks.
      for (let j = 0; j < 4; j++) {
        const gap = 18 + j * 7;
        const CCOL = [[0.70, 0.28, 0.22], [0.28, 0.38, 0.64], [0.78, 0.76, 0.36], [0.52, 0.53, 0.56]][j];
        const a = anchor(k(0.97), -1, gap);
        if (onTrack(a.c[0], a.c[2], 4)) continue;
        // Main container body
        addBox(out, vadd(a.c, a.u, 1.5), [6.2, 3.0, 12.2], CCOL, [a.r, a.u, a.t]);
        // Corrugation cap strip (slightly darker roof)
        addBox(out, vadd(a.c, a.u, 3.2), [6.4, 0.3, 12.6],
               [CCOL[0] * 0.8, CCOL[1] * 0.8, CCOL[2] * 0.8], [a.r, a.u, a.t]);
        // Door-end detail (narrow darker band)
        addBox(out, vadd(vadd(a.c, a.t, 6.3), a.u, 1.5), [6.2, 3.0, 0.4],
               [CCOL[0] * 0.7, CCOL[1] * 0.7, CCOL[2] * 0.7], [a.r, a.u, a.t]);
      }

      // ---- Lakeside grass fan banking / hill (s≈0.90 R) ----
      // Replaced flat stacked slabs with a frustrated mound that reads as a
      // grassy hill/embankment.  Outer backdrop mound behind a low foreground ridge.
      {
        const a = anchor(k(0.90), 1, 34);
        if (!onTrack(a.c[0], a.c[2], 8)) {
          addFrustum(out, a.c, 18, 8, 6.5, GRASS, 7, [a.r, a.u, a.t]);
          addCone(out, vadd(a.c, a.u, 6.5), 8, 3.5, [0.26, 0.52, 0.24], 7, [a.r, a.u, a.t]);
        }
        // Second slightly-offset mound for depth
        const a2 = anchor(k(0.91), 1, 42);
        if (!onTrack(a2.c[0], a2.c[2], 8)) {
          addFrustum(out, a2.c, 14, 5, 5.0, [0.26, 0.50, 0.24], 7, [a2.r, a2.u, a2.t]);
          addCone(out, vadd(a2.c, a2.u, 5.0), 5, 2.5, [0.28, 0.54, 0.26], 7, [a2.r, a2.u, a2.t]);
        }
      }

      // ====================================================================
      // KERBS + run-off framing at corner apexes / chicanes
      // ====================================================================
      for (const [s, side] of [[0.04, 1], [0.06, -1], [0.30, 1], [0.62, 1],
                                [0.78, -1], [0.78, 1], [0.80, -1], [0.97, 1]]) {
        place(k(s), side, 2, [0.5, 0.25, 6], side > 0 ? RED : WHITE);
        place(k(s), side, 7, [10, 0.1, 12], GRASS); // grass run-off framing
      }

      // ====================================================================
      // TRACKSIDE FURNITURE — catch fences, armco guardrails, tyre walls,
      // marshal posts.
      // ====================================================================
      fence(0.00, 0.09, -1,  9, 4.0, [0.74, 0.76, 0.80]);
      fence(0.04, 0.14,  1, 10, 3.6, [0.74, 0.76, 0.80]);
      fence(0.60, 0.70,  1,  9, 3.6, [0.74, 0.76, 0.80]);
      fence(0.76, 0.82, -1,  9, 3.6, [0.74, 0.76, 0.80]);

      guardrail(0.42, 0.58, -1, 3.0, [0.85, 0.18, 0.16]);
      guardrail(0.20, 0.30,  1, 3.0, [0.90, 0.90, 0.92]);
      guardrail(0.85, 0.95,  1, 3.0, [0.90, 0.90, 0.92]);

      tyreWall(0.77, 0.80,  1, 3.5, RED);
      tyreWall(0.78, 0.81, -1, 3.5, WHITE);

      for (const [s, side] of [[0.05, 1], [0.30, 1], [0.55, -1],
                                [0.62, 1], [0.78, -1], [0.90, 1]]) {
        marshalPost(k(s), side, 6);
      }

      // ====================================================================
      // PIT / PADDOCK precinct — control tower, motorhomes, support trucks
      // ====================================================================
      tower(k(0.02), 1, 26, 12, 26, { col: [0.80, 0.82, 0.85], seg: 4,
        cap: true, capCol: [0.20, 0.24, 0.30], mast: 8 });
      for (let j = 0; j < 6; j++) {
        const kk = (k(0.0) + j * 8) % n;
        building(kk, 1, 34, 12, 7 + hash(j * 3) * 3, 14, {
          wall: [[0.86, 0.87, 0.88], [0.30, 0.40, 0.60], [0.70, 0.30, 0.25],
                 [0.80, 0.78, 0.40], [0.55, 0.55, 0.58], [0.20, 0.55, 0.50]][j % 6],
          window: [0.18, 0.22, 0.28], floor: 4 });
      }
      for (let j = 0; j < 5; j++) {
        const a = anchor((k(0.0) + j * 10) % n, 1, 56 + hash(j * 7) * 8);
        if (onTrack(a.c[0], a.c[2], 6)) continue;
        addBox(out, vadd(a.c, a.u, 2.0), [4, 4, 13], [0.90, 0.90, 0.92], [a.r, a.u, a.t]);
        addBox(out, vadd(vadd(a.c, a.u, 1.6), a.t, 8), [3.6, 3.2, 4], [0.30, 0.32, 0.40], [a.r, a.u, a.t]);
      }
      building(k(0.04), 1, 48, 20, 12, 30, { wall: [0.82, 0.84, 0.86], window: [0.30, 0.38, 0.50], floor: 3 });
      {
        const ap = anchor(k(0.01), -1, 22);
        addCyl(out, ap.c, 0.18, 18, [0.28, 0.32, 0.38], 4, [ap.r, ap.u, ap.t]);
        addBox(out, vadd(ap.c, ap.u, 18), [3.0, 1.5, 0.3], [0.80, 0.18, 0.18], [ap.r, ap.u, ap.t]);
      }

      // ====================================================================
      // PARKLAND STREET LIGHTING — slim aluminium poles, warm lantern heads.
      // Lantern colour [0.96, 0.93, 0.70] glows at night / reads as chrome day.
      // All posts at dist ≥ 11 m from road edge (beyond fence/guardrail at 3–10 m).
      // ====================================================================
      const LAMP_COL = [0.96, 0.93, 0.70];
      const POLE_COL = [0.35, 0.35, 0.37];

      // Zone A — main straight (s=0.0–0.10, both sides)
      for (let j = 0; j < 10; j++) {
        for (const side of [-1, 1]) {
          const a = anchor((k(0.0) + j * 12) % n, side, 11);
          if (onTrack(a.c[0], a.c[2], 1)) continue;
          addCyl(out, a.c, 0.13, 7.5, POLE_COL, 5, [a.r, a.u, a.t]);
          addBox(out, vadd(a.c, a.u, 7.5), [0.8, 0.5, 1.8], LAMP_COL, [a.r, a.u, a.t]);
        }
      }
      // Zone B — parkland east corridor (s=0.12–0.28, both sides)
      for (let j = 0; j < 14; j++) {
        for (const side of [-1, 1]) {
          const a = anchor((k(0.12) + j * 11) % n, side, 11);
          if (onTrack(a.c[0], a.c[2], 1)) continue;
          addCyl(out, a.c, 0.12, 8.0, POLE_COL, 5, [a.r, a.u, a.t]);
          addBox(out, vadd(a.c, a.u, 8.0), [0.8, 0.5, 1.8], LAMP_COL, [a.r, a.u, a.t]);
        }
      }
      // Zone C — lakeside Drive (s=0.42–0.60, L side only — R is water)
      for (let j = 0; j < 16; j++) {
        const a = anchor((k(0.42) + j * 10) % n, -1, 11);
        if (onTrack(a.c[0], a.c[2], 1)) continue;
        addCyl(out, a.c, 0.12, 8.5, POLE_COL, 5, [a.r, a.u, a.t]);
        addBox(out, vadd(a.c, a.u, 8.5), [0.9, 0.5, 2.0], LAMP_COL, [a.r, a.u, a.t]);
      }
      // Zone D — southern park + chicane exit (s=0.70–0.90, both sides)
      for (let j = 0; j < 18; j++) {
        for (const side of [-1, 1]) {
          const a = anchor((k(0.70) + j * 10) % n, side, 11);
          if (onTrack(a.c[0], a.c[2], 1)) continue;
          addCyl(out, a.c, 0.12, 7.5, POLE_COL, 5, [a.r, a.u, a.t]);
          addBox(out, vadd(a.c, a.u, 7.5), [0.8, 0.5, 1.8], LAMP_COL, [a.r, a.u, a.t]);
        }
      }

      // ====================================================================
      // PARKLAND AMENITIES — event marquees, colourful hospitality tents
      // ====================================================================
      for (const [s, side, cnt] of [[0.65, 1, 3], [0.32, -1, 3], [0.88, 1, 2], [0.12, -1, 2]]) {
        for (let j = 0; j < cnt; j++) {
          const a = anchor((k(s) + j * 8) % n, side, 46 + j * 12);
          if (onTrack(a.c[0], a.c[2], 6)) continue;
          addBox(out, vadd(a.c, a.u, 2.0), [11, 4.0, 11],
                 [0.93, 0.93, 0.94], [a.r, a.u, a.t]);
          addPrism(out, vadd(a.c, a.u, 4.8), [11, 1.8, 11],
                   [[0.86, 0.30, 0.20], [0.20, 0.46, 0.70], [0.90, 0.80, 0.26]][j % 3],
                   [a.r, a.u, a.t]);
        }
      }

      // ====================================================================
      // BILLBOARDS + start gantry + sponsor hoardings
      // ====================================================================
      billboard(k(0.30),  1, 18, 14, 5, [0.20, 0.40, 0.70]);
      billboard(k(0.55), -1, 16, 14, 5, [0.86, 0.30, 0.20]);
      billboard(k(0.12),  1, 16, 12, 4.5, [0.90, 0.80, 0.20]);
      billboard(k(0.45), -1, 18, 12, 4.5, [0.20, 0.60, 0.45]);
      billboard(k(0.70),  1, 16, 12, 4.5, [0.80, 0.30, 0.50]);
      billboard(k(0.85), -1, 16, 12, 4.5, [0.30, 0.45, 0.70]);
      gantry(0.0,  7.5, [0.30, 0.32, 0.36]);
      gantry(0.50, 7.0, [0.25, 0.27, 0.32]);

      void prop; void cx; void cz; void WATER; void pyMin; void bush; void hedge; void cityFront; void addPyramid;
    },
  }
  );
})();
