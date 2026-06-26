/* Apex 26 — ZANDVOORT circuit definition (data only).
   Registered on the global TrackDefs list; consumed by the js/tracks.js engine
   (palette resolved there from `night`, geometry from js/circuits.js or `segs`). */
(function () {
  "use strict";
  (window.TrackDefs = window.TrackDefs || []).push(
  {
    id: "zandvoort",
    reverse: true,  // GPS trace is backwards vs real racing direction (auto-audit)
    name: "ZANDVOORT",
    gp: "Dutch GP",
    country: "Netherlands",
    night: false,
    theme: "green",
    lengthKm: 4.3,
    baseHW: 7,
    // Hugenholtz + Arie Luyendyk: the two steeply banked corners get a raised
    // outer edge (the engine banks the highest-curvature corners).
    banked: true,
    pal: { zenith: [0.28, 0.41, 0.60], horizon: [0.82, 0.78, 0.70], grass: [0.57, 0.55, 0.39], runoff: [0.62, 0.54, 0.36], fog: [0.78, 0.76, 0.71], fogDensity: 0.0026, sunDir: [0.5597170785495562, 0.6492718111174852, 0.5149397122655918], sun: [1, 0.94, 0.80], sunColor: [1, 0.9, 0.74] },
    segs: [
      { t: 0, l: 260 }, { t: 75, l: 120, b: 0.16 }, { t: -50, l: 90 }, { t: 130, l: 150, b: 0.3 }, { t: 0, l: 180, h: 8 }, { t: 40, l: 110, h: -8 },
      { t: 60, l: 100 }, { t: -50, l: 90, h: 4 }, { t: 70, l: 90 }, { t: -60, l: 90 }, { t: 90, l: 90 }, { t: -50, l: 90 },
      { t: 50, l: 90 }, { t: 160, l: 160, b: 0.31, w: 8 },
    ],
    elevations: [{ s: 0.56, halfM: 300, rise: 8 }],
    scenery: function (api) {
      const { out, n, px, py, pz, pyMin, hw, prop, backdrop, groundPlane,
              addBox, addCyl, addPrism, addCone, addFrustum, anchor, vadd, onTrack, hash, every,
              mountain, peak, bush, hedge, grandstand, tower,
              pine, tree, forestEdge,
              fence, guardrail, tyreWall, billboard, gantry, marshalPost } = api;
      const K = (s) => Math.round(s * n) % n;

      // -----------------------------------------------------------------------
      // Palette constants — coastal North Sea dune landscape
      // -----------------------------------------------------------------------
      const sand      = [0.81, 0.75, 0.58];
      const sandDk    = [0.71, 0.65, 0.48];
      const sandLt    = [0.87, 0.81, 0.64];
      const marramG   = [0.45, 0.50, 0.34];   // marram grass — grey-green/silvery tussock
      const marramT   = [0.69, 0.64, 0.43];   // marram grass tan (bleached)
      const seaCol    = [0.18, 0.40, 0.56];   // North Sea blue-grey
      const beachCol  = [0.89, 0.83, 0.66];   // wet-sand beach
      const duneCol   = [0.82, 0.76, 0.58];   // dry dune fringe
      const orange    = [0.96, 0.42, 0.02];   // Verstappen-orange crowd
      const shell     = [0.36, 0.38, 0.42];
      const shellLt   = [0.40, 0.41, 0.46];
      const fenceCol  = [0.74, 0.76, 0.80];
      const railRW    = [0.86, 0.20, 0.18];   // red/white armco

      // -----------------------------------------------------------------------
      // Track centre + approximate lap radius (used for sea/beach placement)
      // -----------------------------------------------------------------------
      let cx0 = 0, cz0 = 0;
      for (let i = 0; i < n; i++) { cx0 += px[i]; cz0 += pz[i]; }
      cx0 /= n; cz0 /= n;
      let lapRad = 0;
      for (let i = 0; i < n; i++) lapRad = Math.max(lapRad, Math.hypot(px[i] - cx0, pz[i] - cz0));

      // -----------------------------------------------------------------------
      // North Sea horizon — flat sea / beach / dune-fringe bands.
      // Sea and beach stay as flat slabs (they ARE flat), but the dune-fringe
      // closest band is replaced with organic mountain() mounds for a sandy
      // ridge silhouette rather than a uniform boxy shelf.
      // -----------------------------------------------------------------------
      for (let i = 0; i < 14; i++) {
        const a = Math.PI * 0.50 + (i / 13) * Math.PI * 1.0;  // seaward arc
        const cosA = Math.cos(a), sinA = Math.sin(a);

        // Far sea — flat water plane, stays as low box
        const sx = cx0 + cosA * (lapRad + 700);
        const sz = cz0 + sinA * (lapRad + 700);
        if (!onTrack(sx, sz, 40))
          addBox(out, [sx, pyMin - 4.0, sz], [160, 6, 160], seaCol);

        // Mid beach sand band — flat (beaches are flat)
        const bx = cx0 + cosA * (lapRad + 510);
        const bz = cz0 + sinA * (lapRad + 510);
        if (!onTrack(bx, bz, 32))
          addBox(out, [bx, pyMin - 2.5, bz], [140, 5, 100], beachCol);

        // Near dune-fringe — organic mounds via peak() so dune shoulder
        // reads as undulating terrain, not a flat slab
        const dx = cx0 + cosA * (lapRad + 350);
        const dz = cz0 + sinA * (lapRad + 350);
        const dw = 55 + hash(i * 17 + 3) * 40;       // 55–95 m base width
        const dh = 10 + hash(i * 23 + 7) * 12;       // 10–22 m height
        if (!onTrack(dx, dz, dw * 0.75))
          peak(dx, dz, pyMin - 1.0, dw, dh,
               hash(i * 5) < 0.5 ? sand : sandLt);
      }

      // -----------------------------------------------------------------------
      // DUNE BELT — the dominant visual.  The circuit weaves through the
      // Zandvoort dune belt; mounds should feel close, sandy and textured.
      //
      // Three staggered rings:
      //   1. Inner verge mounds   — every 24m, 9–22m tall, tight to the road
      //   2. Mid ridge band       — every 18m, set back 60-90m, fills gaps
      //   3. Far backdrop peaks   — every 48m, distant horizon dunes
      //
      // All use anchor() so they sit on the terrain surface, never float.
      // mountain() baseY = a.c[1] (terrain-anchored ground Y at that lateral dist).
      // -----------------------------------------------------------------------

      // 1. Inner dune mounds — organic, rough, close
      every(24, (k) => {
        for (const side of [-1, 1]) {
          const dist = 40 + hash(k * 72 + side) * 30;   // 40–70 m from verge
          const a = anchor(k, side, dist);
          if (onTrack(a.c[0], a.c[2], 18)) continue;
          const h = 9 + hash(k * 73 + side) * 13;       // 9–22 m
          const w = 28 + hash(k * 74 + side) * 24;      // 28–52 m base radius
          mountain(a.c[0], a.c[2], a.c[1], w, h, {
            seg: 8, seed: k * 13 + side, rough: 0.6, snowline: 2,
            forest: marramT, rock: sandDk, snow: sand,
          });
        }
      });

      // 2. Mid dune ridge band — slightly larger, set back further
      every(18, (k) => {
        for (const side of [-1, 1]) {
          const dist = 60 + hash(k * 81 + side) * 38;   // 60–98 m
          const a = anchor(k, side, dist);
          if (onTrack(a.c[0], a.c[2], 18)) continue;
          const w = 32 + hash(k * 83 + side) * 28;      // 32–60 m
          const h = 14 + hash(k * 82 + side) * 16;      // 14–30 m
          peak(a.c[0], a.c[2], a.c[1], w, h,
               hash(k * 84 + side) < 0.5 ? sand : sandLt);
        }
      });

      // 3. Far backdrop dunes — distant horizon, rooted at pyMin
      every(48, (k) => {
        for (const side of [-1, 1]) {
          const dist = 160 + hash(k * 42 + side) * 100;  // 160–260 m
          const a = anchor(k, side, dist);
          if (onTrack(a.c[0], a.c[2], 16)) continue;
          peak(a.c[0], a.c[2], pyMin, 70 + hash(k * 43 + side) * 60,
               18 + hash(k * 44 + side) * 16, sand);
        }
      });

      // -----------------------------------------------------------------------
      // INLAND DUNE SCRUB — Zandvoort is OPEN GOLDEN DUNE, not a pine forest.
      // The real circuit weaves through bare blond-sand dunes with grey-green
      // marram and only OCCASIONAL low scrub/Scots-pine clumps on the inland
      // backs.  So: drop the dense dark pine belts; keep only very sparse, low,
      // muted-green clumps set well back, with big open sand gaps between.
      // -----------------------------------------------------------------------
      const pineCol  = [0.24, 0.34, 0.22];   // muted dune-pine / scrub (greyed)
      const pineCol2 = [0.34, 0.40, 0.28];   // dusty broadleaf scrub

      // A couple of thin, low, gappy inland scrub stands (far back, not a wall)
      forestEdge(0.30, 0.40,  1, 70, { density: 0.16, hMin: 4, hMax: 7,
                                       col: pineCol, col2: pineCol2, pineFrac: 0.55 });
      forestEdge(0.62, 0.74, -1, 66, { density: 0.14, hMin: 4, hMax: 7,
                                       col: pineCol, col2: pineCol2, pineFrac: 0.50 });

      // Extra bare dune mounds fill the sectors the pine belts used to occupy,
      // so the inland backdrop reads as rolling sand rather than empty flat.
      every(20, (k) => {
        const lf = k / n;
        if (!((lf > 0.22 && lf < 0.48) || (lf > 0.56 && lf < 0.84))) return;
        for (const side of [-1, 1]) {
          if (hash(k * 91 + side) > 0.5) continue;
          const dist = 50 + hash(k * 92 + side) * 40;
          const a = anchor(k, side, dist);
          if (onTrack(a.c[0], a.c[2], 18)) continue;
          peak(a.c[0], a.c[2], a.c[1], 30 + hash(k * 93 + side) * 26,
               11 + hash(k * 94 + side) * 14,
               hash(k * 95 + side) < 0.5 ? sand : sandLt);
        }
      });

      // -----------------------------------------------------------------------
      // MARRAM GRASS — dense tufts along both verges for continuous dune-grass feel.
      // Prisms anchored via anchor(): center at a.c + u*0.6 so base sits on ground.
      // Count 3-4 leaning prisms per tuft for organic clustering.
      // Spacing every 6m, ~60% density.
      // -----------------------------------------------------------------------
      every(6, (k) => {
        for (const side of [-1, 1]) {
          if (hash(k * 61 + side * 5) > 0.40) continue;   // ~60% density
          const baseX = 5 + hash(k * 62 + side) * 8;      // 5–13 m from verge
          const a = anchor(k, side, baseX);
          if (onTrack(a.c[0], a.c[2], 3)) continue;
          const tuft = hash(k * 63 + side) < 0.5 ? marramG : marramT;
          const b = [a.r, a.u, a.t];
          const cnt = 3 + (hash(k * 64 + side) < 0.4 ? 1 : 0);
          for (let i = 0; i < cnt; i++) {
            const off = (i - (cnt - 1) / 2) * 1.2;
            const h = 1.6 + hash(k * 65 + i + side) * 0.7;
            // Prism center at a.c + u*0.6 → base at a.c[1] (no float, no clip)
            addPrism(out, vadd(vadd(a.c, a.t, off), a.u, 0.6),
                     [0.7, h, 0.8], tuft, b);
          }
        }
      });

      // -----------------------------------------------------------------------
      // MARRAM HEDGE BANDS — continuous clipped dune-grass fringe along the verge.
      // Gap = 22 etc. means inner face is that far from road edge — safe clearance.
      // -----------------------------------------------------------------------
      hedge(0.10, 0.50, 1,  22, 1.8, marramT);
      hedge(0.20, 0.60, -1, 16, 1.8, marramG);
      hedge(0.55, 0.85, 1,  18, 1.8, marramG);
      hedge(0.65, 0.98, -1, 14, 1.8, marramT);
      hedge(0.80, 0.95, 1,  20, 1.8, marramG);

      // -----------------------------------------------------------------------
      // BUSH CLUMPS — low dune shrubs between tufts and hedges
      // -----------------------------------------------------------------------
      every(8, (k) => {
        for (const side of [-1, 1]) {
          if (hash(k * 51 + side) > 0.35) continue;   // ~65% density
          bush(k, side, 7 + hash(k * 52 + side) * 12,
               hash(k * 53 + side) < 0.5 ? marramG : marramT);
        }
      });

      // -----------------------------------------------------------------------
      // GRANDSTANDS — Orange Army Verstappen fans; Dutch GP sells out every year.
      // Positions chosen to not cluster (different s fractions, no duplicates).
      // -----------------------------------------------------------------------
      grandstand(0.01,  1,  12, 36, shellLt, orange); // main pit straight R (largest)
      grandstand(0.05,  1,   9, 28, shell,   orange); // Tarzan hairpin R
      grandstand(0.09, -1,  10, 26, shell,   orange); // Tarzan exit L
      grandstand(0.135,-1,  10, 40, shell,   orange); // Hugenholtz banked L
      grandstand(0.18,  1,  11, 32, shellLt, orange); // Hugenholtz exit R
      grandstand(0.48, -1,  24, 34, shell,   orange); // Scheivlak approach L
      grandstand(0.53,  1,  14, 28, shell,   orange); // Scheivlak R
      grandstand(0.865, 1,  22, 36, shell,   orange); // Luyendyk approach R
      grandstand(0.915, 1,  10, 80, shell,   orange); // Arie Luyendyk banked R (massive)
      grandstand(0.96,  1,  11, 32, shellLt, orange); // Luyendyk exit R
      grandstand(0.97, -1,  12, 34, shellLt, orange); // pit straight L

      // -----------------------------------------------------------------------
      // PIT BUILDING — long low white-grey structure with garage bay accents
      // -----------------------------------------------------------------------
      (() => {
        const a = anchor(K(0.00), -1, 12), b = [a.r, a.u, a.t];
        addBox(out, vadd(a.c, a.u, 3),   [7, 6, 64], [0.86, 0.87, 0.90], b);
        for (let i = -3; i <= 3; i++)
          addBox(out, vadd(vadd(a.c, a.u, 3), a.t, i * 8),
                 [7.4, 4, 1.2], [0.30, 0.32, 0.36], b);
        // Pit-lane roof overhang — flat slab above garage doors
        addBox(out, vadd(a.c, a.u, 6.3), [8.5, 0.5, 66], [0.80, 0.81, 0.84], b);
      })();

      // (Wind turbines removed — they aren't a signature Zandvoort feature and
      //  competed with the authentic dune + beach + North-Sea horizon.)

      // -----------------------------------------------------------------------
      // BEACH HUTS — pastel rows clustered at the seaward dune face (s≈0.3–0.7).
      // Fixed: use anchor() so hut bases sit on terrain, not a fixed pyMin offset.
      // every(40) → ~107 spaced cluster points around the lap; seaward-biased.
      // -----------------------------------------------------------------------
      every(40, (k) => {
        const lapFrac = k / n;
        const sideProb = lapFrac > 0.3 && lapFrac < 0.7 ? 0.7 : 0.3;
        const side = hash(k * 8) < sideProb ? 1 : -1;
        const dist = 140 + hash(k * 7) * 35;     // 140–175 m from verge
        const a = anchor(k, side, dist);
        if (onTrack(a.c[0], a.c[2], 16)) return;
        const cols = [[0.88, 0.26, 0.18], [0.18, 0.48, 0.72],
                      [0.92, 0.87, 0.28], [0.20, 0.62, 0.38]];
        const b = [a.r, a.u, a.t];
        const hutH = 4.2;
        const hutCount = 2 + Math.floor(hash(k * 10) * 2.5);
        for (let i = 0; i < hutCount; i++) {
          const hutCol = cols[Math.floor(hash(k * 9 + i * 3) * 4) % 4];
          const offset = (i - (hutCount - 1) / 2) * 7.5;
          // Center at a.c + u*(hutH/2) so base = a.c[1], no floating
          addBox(out, vadd(vadd(a.c, a.u, hutH / 2), a.t, offset),
                 [5.5, hutH, 5.5], hutCol, b);
          // A-frame roof prism on top of each hut
          addPrism(out, vadd(vadd(a.c, a.u, hutH + 0.8), a.t, offset),
                   [5.8, 1.6, 5.8], [0.72, 0.34, 0.18], b);
        }
      });

      // -----------------------------------------------------------------------
      // SEA GLIMPSE SLIVERS — blue peek over the dune ridge at several lap points
      // -----------------------------------------------------------------------
      for (const s of [0.35, 0.42, 0.68, 0.78]) {
        const a = anchor(K(s), 1, 190);
        if (!onTrack(a.c[0], a.c[2], 22))
          addBox(out, vadd(a.c, a.u, 1.2), [60, 3, 60], seaCol, [a.r, a.u, a.t]);
      }

      // -----------------------------------------------------------------------
      // TRACK BARRIERS & FURNITURE
      // -----------------------------------------------------------------------

      // Catch / debris fencing in front of grandstands
      fence(0.00, 0.10, 1,  6.0, 4.2, fenceCol);
      fence(0.04, 0.09, -1, 6.0, 4.2, fenceCol);
      fence(0.11, 0.19, -1, 5.5, 4.2, fenceCol);
      fence(0.15, 0.19, 1,  5.5, 4.0, fenceCol);
      fence(0.48, 0.54, -1, 6.5, 4.0, fenceCol);
      fence(0.86, 0.99, 1,  6.0, 4.4, fenceCol);
      fence(0.94, 1.00, -1, 6.0, 4.2, fenceCol);

      // Steel armco guardrail on fast dune stretches
      guardrail(0.21, 0.33, 1,  4.0, railRW);
      guardrail(0.22, 0.31, -1, 4.0, [0.85, 0.86, 0.88]);
      guardrail(0.36, 0.47, 1,  4.0, [0.85, 0.86, 0.88]);
      guardrail(0.57, 0.66, -1, 4.0, railRW);
      guardrail(0.68, 0.80, 1,  4.0, [0.85, 0.86, 0.88]);
      guardrail(0.80, 0.86, -1, 4.0, railRW);

      // Tyre walls at corner exits (Tarzan, Hugenholtz, Scheivlak, Luyendyk)
      tyreWall(0.025, 0.065, 1,  4.6, [0.88, 0.42, 0.06]);
      tyreWall(0.125, 0.18,  -1, 4.8, [0.30, 0.30, 0.32]);
      tyreWall(0.48,  0.54,  -1, 5.2, [0.18, 0.40, 0.65]);
      tyreWall(0.90,  0.96,  1,  5.0, [0.86, 0.38, 0.04]);

      // Billboards / advertising hoardings
      const adCols = [[0.90, 0.20, 0.10], [0.10, 0.45, 0.75], [0.95, 0.55, 0.08],
                      [0.92, 0.86, 0.20], [0.20, 0.55, 0.35]];
      let adI = 0;
      every(110, (k) => {
        for (const side of [-1, 1]) {
          const a = anchor(k, side, 16);
          if (onTrack(a.c[0], a.c[2], 9)) continue;
          billboard(k, side, 14, 12, 4, adCols[(adI++) % adCols.length]);
        }
      });

      // Marshal posts
      for (const s of [0.05, 0.16, 0.29, 0.42, 0.55, 0.66, 0.79, 0.93]) {
        const side = hash(K(s) * 31) < 0.5 ? -1 : 1;
        marshalPost(K(s), side, 6.5);
      }

      // Start / finish and scoring gantries
      gantry(0.005, 7.5, [0.12, 0.13, 0.16]);
      gantry(0.99,  6.5, [0.14, 0.14, 0.18]);

      // -----------------------------------------------------------------------
      // VERSTAPPEN-ORANGE BUNTING — bright capsules on major grandstand fronts
      // -----------------------------------------------------------------------
      for (const [s, side] of [[0.01, 1], [0.135, -1], [0.915, 1], [0.97, -1]]) {
        const a = anchor(K(s), side, 8);
        if (onTrack(a.c[0], a.c[2], 6)) continue;
        const b = [a.r, a.u, a.t];
        const buntingCol = [0.96, 0.40, 0.02];
        for (let i = -5; i <= 5; i++)
          addBox(out, vadd(vadd(a.c, a.u, 7.2), a.t, i * 4.5),
                 [0.7, 1.4, 2.6], buntingCol, b);
        for (let i = -5; i <= 5; i++)
          addBox(out, vadd(vadd(a.c, a.u, 9.6), a.t, i * 4.5),
                 [0.7, 1.4, 2.6], buntingCol, b);
      }

      // -----------------------------------------------------------------------
      // LAMP POSTS — circuit-perimeter lighting for night-readiness.
      // Placed every 35m around the full lap, both sides; clear of fences/stands.
      // Post: a slim cylinder.  Head: a warm-white floodlight box angled outward.
      // Emissive warm-white [1, 0.96, 0.82] reads as lit even in day context and
      // glows strongly at night.  Gap of 8m keeps posts outside barriers.
      // -----------------------------------------------------------------------
      {
        const lampCol   = [0.28, 0.28, 0.32];   // dark grey pole
        const lightHead = [1.00, 0.96, 0.82];   // warm-white luminaire (emissive)
        const armCol    = [0.32, 0.32, 0.36];
        every(35, (k) => {
          for (const side of [-1, 1]) {
            const dist = 8.5;
            const a = anchor(k, side, dist);
            if (onTrack(a.c[0], a.c[2], 3)) continue;
            const b = [a.r, a.u, a.t];
            // Pole — 9m tall, rooted at terrain
            addCyl(out, a.c, 0.14, 9, lampCol, 5, b);
            // Horizontal arm extending inward over the road
            addBox(out, vadd(vadd(a.c, a.u, 9), a.r, -side * 1.2),
                   [2.4, 0.16, 0.16], armCol, b);
            // Luminaire head — bright warm-white box at arm end
            addBox(out, vadd(vadd(a.c, a.u, 8.7), a.r, -side * 2.2),
                   [0.9, 0.3, 0.6], lightHead, b);
          }
        });
      }

      // -----------------------------------------------------------------------
      // GRANDSTAND LIGHTING ACCENTS — warm-white emissive strip at roof fascia
      // and a row of spot-light boxes below the canopy.  These add structural
      // depth in day light and read as lit panels at dusk/night.
      // Major stands: pit straight, Hugenholtz, Luyendyk.
      // -----------------------------------------------------------------------
      {
        const roofAccent = [0.98, 0.95, 0.88];   // near-white warm fascia
        const spotCol    = [1.00, 0.97, 0.84];   // warm spot luminaire

        // Pit straight main stand (s≈0.01, side=1, gap=12, len=36)
        for (const [s, side, gap, len] of [
          [0.01,  1,  12, 36],   // pit straight main R
          [0.135,-1,  10, 40],   // Hugenholtz banked L
          [0.915, 1,  10, 80],   // Arie Luyendyk massive R
          [0.865, 1,  22, 36],   // Luyendyk approach R
        ]) {
          const k = K(s), a = anchor(k, side, gap + 5);
          const b = [a.r, a.u, a.t];
          // Roof-fascia emissive strip (just below canopy)
          addBox(out, vadd(a.c, a.u, 13.5), [11, 0.45, len + 4], roofAccent, b);
          // Row of small spot boxes suspended under canopy edge
          const spotCount = Math.round(len / 8);
          for (let i = 0; i < spotCount; i++) {
            const offset = (i - (spotCount - 1) / 2) * 8;
            addBox(out, vadd(vadd(a.c, a.u, 12.6), a.t, offset),
                   [0.6, 0.5, 0.6], spotCol, b);
          }
        }
      }
    },
  }
  );
})();
