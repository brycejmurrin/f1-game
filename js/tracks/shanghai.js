/* Apex 26 — SHANGHAI circuit definition (data only).
   Registered on the global TrackDefs list; consumed by the js/tracks.js engine
   (palette resolved there from `night`, geometry from js/circuits.js or `segs`). */
(function () {
  "use strict";
  (window.TrackDefs = window.TrackDefs || []).push(
  {
    id: "shanghai",
    name: "SHANGHAI",
    gp: "Chinese GP",
    country: "China",
    night: false,
    theme: "modern",
    lengthKm: 5.5,
    baseHW: 8,
    pal: { zenith: [0.28, 0.4, 0.58], horizon: [0.64, 0.66, 0.66], grass: [0.26, 0.42, 0.22], runoff: [0.4, 0.4, 0.4], fog: [0.64, 0.66, 0.66], fogDensity: 0.002, sunDir: [0.597109775827013, 0.7349043394794006, 0.3215206485222378], sun: [0.96, 0.92, 0.84], sunColor: [0.94, 0.9, 0.82] },
    segs: [
      { t: 0, l: 400 }, { t: 50, l: 130 }, { t: 180, l: 200 }, { t: 50, l: 100 }, { t: 0, l: 250 }, { t: -90, l: 100 },
      { t: 0, l: 550 }, { t: -60, l: 90 }, { t: 60, l: 80 }, { t: -70, l: 90 }, { t: 70, l: 80 }, { t: 0, l: 200 },
    ],
    // Mostly flat — a mild rise on the long back straight.
    elevations: [{ s: 0.45, halfM: 360, rise: 6 }],
    scenery: function (api) {
      const { out, track, n, px, pz, py, hw, pyMin, hash, vadd,
        place, prop, backdrop, groundPlane, anchor, addBox, addCyl, addCone,
        addFrustum, addPrism, addPyramid, along,
        building, tower, grandstand, billboard, gantry, marshalPost,
        wall, fence, guardrail, tyreWall, tree, bush, hedge, pine, palm } = api;
      const K = (s) => Math.round(s * n) % n;

      // ---- Palette: hazy modern Tilke — concrete greys, white steel, marsh green ----
      const CONC  = [0.70, 0.72, 0.74];
      const WHITE = [0.90, 0.91, 0.92];
      const STEEL = [0.62, 0.64, 0.67];
      const SEAT  = [0.40, 0.42, 0.46];
      const DARK  = [0.30, 0.32, 0.36];
      const ASPH  = [0.50, 0.52, 0.54];
      const MARSH = [0.34, 0.45, 0.28];
      const MARSH_N = [0.28, 0.38, 0.24];
      const RED   = [0.82, 0.16, 0.14];
      const YELLOW = [0.90, 0.78, 0.16];
      const SKY   = [0.66, 0.68, 0.72];
      const SKY_HAZE = [0.72, 0.74, 0.77];
      const GLASS = [0.52, 0.60, 0.70];
      const GLASS_HAZE = [0.66, 0.71, 0.77];
      const WATER = [0.34, 0.46, 0.54];
      const TREE_G = [0.24, 0.40, 0.22];
      const CROWD = [0.62, 0.30, 0.30];
      const TARMAC = [0.26, 0.27, 0.29];
      const KERB_R = [0.80, 0.16, 0.14];
      const KERB_W = [0.90, 0.90, 0.90];
      // Pearl Tower salmon-pink terracotta
      const PEARL = [0.78, 0.62, 0.58];
      // Lit window colours (warm cream — simulate emissive fill from indoor daylight)
      const WIN_LIT   = [0.96, 0.92, 0.78];  // warm cream for prominent buildings
      const WIN_TOWER = [0.88, 0.90, 0.96];  // cooler blue-white for glass towers
      // Lamp post warm sodium glow (very bright amber for day-lit contrast)
      const LAMP_GLOW = [0.98, 0.86, 0.52];

      // ================= START / FINISH — WINGED PIT COMPLEX (s 0.00, L) =================
      // Long white pit/control building hugging the main straight.
      building(K(0.00), -1, 2, 18, 14, 150, { wall: WHITE, window: WIN_LIT, floor: 4 });
      building(K(0.98), -1, 2, 16, 11,  90, { wall: [0.84, 0.85, 0.87], window: WIN_LIT, floor: 3 });
      // Paddock / hospitality block set further back behind the pit building.
      building(K(0.99), -1, 40, 26,  9, 110, { wall: [0.80, 0.82, 0.84], window: WIN_LIT, floor: 3 });
      building(K(0.96), -1, 44, 20, 12,  60, { wall: WHITE, window: WIN_TOWER, floor: 4 });
      building(K(0.02), -1, 42, 22,  8,  70, { wall: [0.82, 0.83, 0.85], window: WIN_LIT, floor: 2 });

      // =================================================================================
      // SIGNATURE SUSPENDED TOWER-BRIDGES — the iconic Shanghai pit-straight landmark.
      //
      // Real layout: two pagoda-like towers on the LEFT side of the pit straight,
      // connected by skybridges to anchoring piers on the RIGHT side. Each tower is
      // a self-contained frustum column with cap; skybridges hang between left-tower
      // tops and right-side piers at matching heights. Structural pillars under each
      // bridge deck carry the load to ground.
      //
      // To avoid interpenetration we place every part at its own correctly-computed
      // height and keep all cylinders/boxes separated by at least their radius/half-
      // height. Skybridges are centred on the mid-point between left and right anchors
      // so they land cleanly on both sides.
      // =================================================================================
      (function wingedTowers() {
        const sLap  = 0.005;
        // Ground anchors on each side — dist=28 puts towers well behind the pit wall.
        const aL = anchor(K(sLap), -1, 28), bL = [aL.r, aL.u, aL.t];
        const aR = anchor(K(sLap),  1, 28), bR = [aR.r, aR.u, aR.t];

        // ── LEFT SIDE: primary tower (the taller of the pair) ──────────────────
        // tower() places a tapered frustum column with optional cap + mast.
        tower(K(sLap), -1, 28, 7.0, 70, { col: WHITE, seg: 8, cap: true, capCol: STEEL, mast: 10 });

        // ── LEFT SIDE: secondary tower staggered 12 m further back along the track ──
        // (uses a different node so anchor() places it correctly downstream)
        tower(K(0.008), -1, 28, 6.6, 66, { col: WHITE, seg: 8, cap: true, capCol: STEEL, mast:  8 });

        // ── RIGHT SIDE: single matching pier tower ──────────────────────────────
        tower(K(sLap),  1, 28, 6.4, 62, { col: WHITE, seg: 8, cap: true, capCol: STEEL, mast:  6 });

        // ── SKYBRIDGES ──────────────────────────────────────────────────────────
        // Bridge deck spans from just outside the left tower to just outside the
        // right pier.  We compute the mid-point between the two ground anchors and
        // place each bridge box centred there — this guarantees clean registration
        // on both sides regardless of track curvature.
        //
        // For each bridge level:
        //  • A pair of slim support cylinders rise from left-ground to bridge height,
        //    then from right-ground to bridge height (no cylinder penetrates the deck).
        //  • The bridge deck box sits at exactly that height.
        //  • A thin structural beam is placed 1.4 m BELOW the deck — not inside it.
        //
        // Heights chosen so they clear the tower cap (tower h=70, cap adds ~1.3 m,
        // so caps top out at ~71.3 m). Bridge lower deck = 44 m, upper deck = 56 m —
        // both well below tower tops so the towers frame the bridges from above.

        // World mid-point between the two ground anchors
        const mc = [
          (aL.c[0] + aR.c[0]) * 0.5,
          (aL.c[1] + aR.c[1]) * 0.5,
          (aL.c[2] + aR.c[2]) * 0.5,
        ];
        // Span in the right-direction: half the distance between the two anchors
        // (the box width should equal the full anchor-to-anchor distance).
        const spanR = Math.hypot(
          aR.c[0] - aL.c[0],
          aR.c[1] - aL.c[1],
          aR.c[2] - aL.c[2]
        );

        for (const hgt of [44, 56]) {
          // Left-side support pillars: rise from ground to just below the deck.
          // Two slim cylinders spaced ±3 m along the track direction for elegance.
          for (const tOff of [-3, 3]) {
            const pillarBase = vadd(aL.c, aL.t, tOff);
            addCyl(out, pillarBase, 0.7, hgt - 1.2, STEEL, 6, bL);
          }
          // Right-side pier pillars
          for (const tOff of [-3, 3]) {
            const pillarBase = vadd(aR.c, aR.t, tOff);
            addCyl(out, pillarBase, 0.7, hgt - 1.2, STEEL, 6, bR);
          }

          // Bridge deck: centred between the two anchor ground points, raised to hgt.
          // Width = spanR (anchor-to-anchor), depth = 10 m, height = 2.0 m.
          const deckC = [mc[0] + aL.u[0] * hgt, mc[1] + aL.u[1] * hgt, mc[2] + aL.u[2] * hgt];
          const bridgeCol = hgt === 44 ? GLASS : WHITE;
          addBox(out, deckC, [spanR, 2.0, 10], bridgeCol, bL);

          // Structural beam 1.8 m below the deck underside (deck centre - 1.0 - 1.8 = -2.8)
          const beamC = [mc[0] + aL.u[0] * (hgt - 2.8), mc[1] + aL.u[1] * (hgt - 2.8), mc[2] + aL.u[2] * (hgt - 2.8)];
          addBox(out, beamC, [spanR * 0.96, 0.5, 8.0], STEEL, bL);

          // Handrail strips along each long edge of the deck
          for (const zOff of [-4.6, 4.6]) {
            const railC = [deckC[0] + aL.t[0] * zOff, deckC[1] + aL.t[1] * zOff + 1.2, deckC[2] + aL.t[2] * zOff];
            addBox(out, railC, [spanR, 0.3, 0.25], STEEL, bL);
          }

          // Lit window strip in the bridge deck face (warm interior glow)
          const winC = [deckC[0] + aL.r[0] * (spanR * 0.25), deckC[1] + aL.r[1] * (spanR * 0.25), deckC[2] + aL.r[2] * (spanR * 0.25)];
          addBox(out, winC, [spanR * 0.5, 0.9, 0.4], WIN_LIT, bL);
        }

        // ── Lamp posts on each tower base (warm glow heads) ────────────────────
        for (const [aP, bP] of [[aL, bL], [aR, bR]]) {
          for (const tOff of [-8, 8]) {
            const postBase = vadd(aP.c, aP.t, tOff);
            addCyl(out, postBase, 0.12, 8.5, STEEL, 5, bP);
            addBox(out, vadd(postBase, aP.u, 8.6), [0.6, 0.3, 0.6], LAMP_GLOW, bP);
          }
        }
      })();

      // ---- Signature CURVED CANTILEVER MAIN GRANDSTAND + overhanging roof (L) ----
      // A long raked stand with a huge sweeping roof on a back wall of pillars that
      // cantilevers out over the seating toward the track.
      (function cantileverMain() {
        const segN = 9;            // segments stepping along the straight
        for (let i = 0; i < segN; i++) {
          const s = 0.018 + i * 0.012;
          const a = anchor(K(s), -1, 16), b = [a.r, a.u, a.t];
          // raked seating block
          addBox(out, vadd(vadd(a.c, a.u, 5), a.r, 7), [16, 11, 18], SEAT, b);
          addBox(out, vadd(vadd(a.c, a.u, 8.5), a.r, 1), [16, 3.5, 6], CROWD, b);
          // back support wall + columns
          addBox(out, vadd(vadd(a.c, a.u, 9), a.r, 18), [16, 19, 3], CONC, b);
          addCyl(out, vadd(vadd(a.c, a.u, 0), a.r, 16), 0.8, 18, STEEL, 6, b);
          // big overhanging cantilever roof slab
          addBox(out, vadd(vadd(a.c, a.u, 19), a.r, 4),  [16.5, 1.6, 30], WHITE, b);
          addBox(out, vadd(vadd(a.c, a.u, 18), a.r, -8), [16.5, 0.7,  6], STEEL, b);
          // leading-edge fascia of the roof
          addBox(out, vadd(vadd(a.c, a.u, 17.3), a.r, -10.5), [16.5, 1.8, 1.0], STEEL, b);
          // roof rib strip (steel grey perpendicular fin)
          addBox(out, vadd(vadd(a.c, a.u, 19), a.r, 4), [0.4, 2.8, 30], [0.55, 0.58, 0.62], b);
        }
      })();

      // Start gantry over the line.
      gantry(0.004, 9, STEEL);

      // ---- Pit wall + low garage boxes (R, near) red-edged ----
      wall(0.965, 0.05, 1, 3, 1.1, WHITE);
      place(K(0.99), 1, 10, [5, 2.4, 40], CONC);
      place(K(0.99), 1, 10, [5, 0.6, 40], RED);
      billboard(K(0.02), 1, 11, 16, 4.5, RED);
      billboard(K(0.97), 1, 11, 14, 4.0, YELLOW);

      // ---- Lamp posts down the pit straight — warm sodium heads ----
      along(0.00, 0.04, 18, (k) => {
        for (const side of [-1, 1]) {
          const a = anchor(k, side, 12), b = [a.r, a.u, a.t];
          addCyl(out, a.c, 0.1, 9.0, STEEL, 5, b);
          addBox(out, vadd(a.c, a.u, 9.1), [0.5, 0.25, 0.5], LAMP_GLOW, b);
        }
      });

      // ---- LAKES by the pit complex (groundPlane water patches) ----
      groundPlane(K(0.88), -1,  95, [180, 130], WATER);
      groundPlane(K(0.01), -1, 110, [150, 110], WATER);
      // Modern dock / jetty structures at the water edge
      place(K(0.90), -1,  85, [10, 1.0, 5], CONC);
      place(K(0.02), -1, 115, [11, 0.9, 5], [0.65, 0.68, 0.72]);
      // Smaller decorative water feature in the infield beyond T6
      groundPlane(K(0.32), -1, 220, [90, 65], [0.36, 0.48, 0.56]);

      // ---- Light-pool patches beside the lake (pale reflective slabs) ----
      // These sit on the ground just above the water plane and give a dawn/dusk
      // reflective quality in the day palette.
      (function lakePools() {
        const spots = [[K(0.89), -1, 70], [K(0.90), -1, 120], [K(0.00), -1, 100]];
        for (const [k, sd, d] of spots) {
          const a = anchor(k, sd, d), b = [a.r, a.u, a.t];
          addBox(out, a.c, [22, 0.18, 18], [0.58, 0.68, 0.78], b);
        }
      })();

      // ================= START GRANDSTAND TIERS (s 0.04, L) =================
      grandstand(0.04,  -1, 18, 130, [0.44, 0.45, 0.50], SEAT);
      grandstand(0.06,  -1, 22,  80, [0.42, 0.43, 0.48], SEAT);
      grandstand(0.025, -1, 26,  70, [0.43, 0.44, 0.49], SEAT);
      billboard(K(0.045), -1, 14, 16, 4.5, YELLOW);

      // ================= SNAIL T1–3 RUN-OFF SLAB (s 0.06, R) =================
      (function snailRunoff() {
        const a = anchor(K(0.065), 1, 6), b = [a.r, a.u, a.t];
        addBox(out, vadd(vadd(a.c, a.u, 0.15), a.r, 36), [80, 0.4, 120], ASPH, b);
      })();
      // Snail grandstands wrapping the coiling Turn 1–3 spiral.
      grandstand(0.05,  1, 95, 70, [0.43, 0.44, 0.49], SEAT);
      grandstand(0.085, 1, 85, 60, [0.43, 0.44, 0.49], SEAT);
      grandstand(0.10,  -1, 45, 60, [0.42, 0.43, 0.48], SEAT);
      grandstand(0.065, 1, 70, 60, [0.44, 0.45, 0.50], SEAT);
      grandstand(0.115, -1, 40, 50, [0.43, 0.44, 0.49], SEAT);
      grandstand(0.13,  1, 70, 50, [0.43, 0.44, 0.49], SEAT);
      billboard(K(0.07),  1, 56, 16, 5, YELLOW);
      billboard(K(0.095), 1, 44, 16, 5, RED);
      marshalPost(K(0.08), -1, 14);

      // ================= CONTINUOUS HAZY SHANGHAI SKYLINE (wraps whole lap) =================
      // backdrop() auto-detects tall buildings (sz[1]>26 && sz[1]>sz[2]) and adds
      // window bands + parapet so the skyline reads as glass towers, not flat planes.
      // Green-dominant colours render as organic mound silhouettes instead.
      (function skylineBand() {
        // Middle ring: foreground glass towers, crisp and blue-grey.
        for (let i = 0; i < 48; i++) {
          const k = K(i / 48);
          const side = (i % 2) ? 1 : -1;
          const h = 40 + hash(i * 11) * 80;
          const w = 18 + hash(i * 13) * 16;
          backdrop(k, side, 190 + hash(i * 5) * 40,
            [w, h, 22],
            [GLASS[0] + hash(i * 3) * 0.08, GLASS[1] + hash(i * 7) * 0.06, GLASS[2] + hash(i * 9) * 0.05]);
        }
        // Back ring: hazier mid-rise blocks receding into the mist.
        for (let i = 0; i < 40; i++) {
          const k = K(i / 40 + 0.013);
          const side = (i % 2) ? -1 : 1;
          const h = 38 + hash(i * 17 + 290) * 72;
          const w = 22 + hash(i * 19 + 290) * 20;
          backdrop(k, side, 260 + hash(i * 23) * 50,
            [w, h, 26],
            [0.65 + hash(i * 5) * 0.08, 0.67 + hash(i * 7) * 0.06, 0.70 + hash(i * 9) * 0.05]);
        }
        // Far ring: sky-haze silhouettes almost absorbed by fog.
        for (let i = 0; i < 32; i++) {
          const k = K(i / 32 + 0.025);
          const side = (i % 2) ? 1 : -1;
          const h = 44 + hash(i * 23 + 360) * 90;
          const w = 28 + hash(i * 29 + 360) * 24;
          backdrop(k, side, 330 + hash(i * 31) * 60,
            [w, h, 30],
            [SKY_HAZE[0], SKY_HAZE[1], SKY_HAZE[2]]);
        }
      })();

      // Denser PUDONG-STYLE feature cluster of tall glass towers behind T6 (s 0.30, L far),
      // modern Shanghai skyline with the iconic Pearl Tower landmark as centrepiece.
      (function pudongCluster() {
        const a = anchor(K(0.30), -1, 260), b = [a.r, a.u, a.t];
        const u = b[1];
        // Dense pack of towers framing the Pearl Tower
        for (let i = 0; i < 28; i++) {
          const off   = (i - 14) * 24 + (hash(i * 5) - 0.5) * 16;
          const depth = 20 + hash(i * 7) * 90;
          const h     = 70 + hash(i * 11) * 150;
          const w     = 11 + hash(i * 13) * 13;
          const col   = depth > 65 ? SKY_HAZE : (depth > 50 ? GLASS_HAZE : GLASS);
          // tapered glass tower
          addFrustum(out, vadd(vadd(vadd(a.c, a.r, off), a.t, depth), u, 0),
                     w / 2, w / 3.4, h, col, 5, b);
          // lit window band near top (~75% height)
          if (hash(i * 17) > 0.35) {
            const towerBase = vadd(vadd(vadd(a.c, a.r, off), a.t, depth), u, 0);
            addBox(out, vadd(towerBase, u, h * 0.74), [w * 0.85, h * 0.055, w * 0.85], WIN_TOWER, b);
          }
          // occasional glass spire cap — placed at tower apex, not overlapping the frustum
          if (hash(i * 17) > 0.3) {
            const towerTop = vadd(vadd(vadd(a.c, a.r, off), a.t, depth), u, h);
            addBox(out, vadd(towerTop, u, 6), [1.2, 12, 1.2], STEEL, b);
          }
        }

        // ── ORIENTAL PEARL TOWER ────────────────────────────────────────────────
        // Iconic Shanghai landmark: two main spheres on a tripod of three diagonal
        // columns, topped by a tall needle spire.
        //
        // Real structure layout (simplified):
        //   • Three angled columns rise from separate ground pads to ~280m height.
        //     They splay outward at the base and converge toward the top.
        //     We model them as VERTICAL cylinders spread in a triangle so they are
        //     clearly separated (no interpenetration) and read as a tripod.
        //   • Lower observation sphere: large, centred at ~118m.
        //   • Upper sphere: smaller, centred at ~350m (we scale to ~200m equivalent).
        //   • Spire: thin needle above the upper sphere.
        //
        // Heights and radii are scaled down ~35% to fit the scenery context.
        //
        // Clash-prevention strategy:
        //   - Each column occupies a distinct XZ position so no two overlap.
        //   - The lower sphere's bounding box starts ABOVE the column tops (we cut
        //     the columns shorter than the sphere base).
        //   - The upper sphere starts at a height clearly above the lower sphere top.
        //   - The connector between the spheres is a slim cylinder occupying only
        //     the gap between the two sphere edges.
        //   - The spire starts at the top edge of the upper sphere.

        // Base centre of the Pearl Tower (placed 50 m in from the Pudong cluster anchor)
        const pc = vadd(vadd(a.c, a.r, -2), a.t, 50);

        // Tripod columns: three cylinders spread in a triangle.
        // Each column occupies a distinct XZ position (±10 m in r, ±6 m in t).
        // Height 48 m — they stop BELOW the lower sphere base (sphere base = 54 m).
        const legH = 48;
        const legR = 2.2;
        const legCol = [0.74, 0.72, 0.70];
        // Three legs in a rough equilateral triangle footprint
        const legOffsets = [
          [-10,  0],   // left leg
          [  5, -9],   // right-front leg
          [  5,  9],   // right-back leg
        ];
        for (const [ro, to] of legOffsets) {
          const legBase = vadd(vadd(pc, a.r, ro), a.t, to);
          addCyl(out, legBase, legR, legH, legCol, 8, b);
        }

        // Ground base ring (wide frustum tying the three legs together at the bottom)
        addFrustum(out, pc, 14, 8, 8, [0.68, 0.66, 0.64], 12, b);

        // Lower observation sphere — bounding box: base at 54m, top at 54+30=84m.
        // Represented as a sphere-like box with rounded shape implied by the flat-
        // shader; we use an addBox + two addFrustum slabs to suggest a sphere.
        // Sphere centre: 69m  (= 54 + 15).
        const lSphBase = 54, lSphR = 15;
        // Main equatorial band
        addFrustum(out, vadd(pc, u, lSphBase + 2),         lSphR, lSphR,     lSphR * 1.6, PEARL, 12, b);
        // Lower cap
        addFrustum(out, vadd(pc, u, lSphBase),             lSphR * 0.7, lSphR, 4,          PEARL, 12, b);
        // Upper cap (tapering back in)
        addFrustum(out, vadd(pc, u, lSphBase + lSphR * 1.6 + 2), lSphR, lSphR * 0.7, 4,   PEARL, 12, b);
        // Lit observation band (warm window ring around the sphere equator)
        addFrustum(out, vadd(pc, u, lSphBase + lSphR * 0.8),
                   lSphR * 1.02, lSphR * 1.02, lSphR * 0.5, WIN_LIT, 12, b);

        // Connector column between the two spheres.
        // Lower sphere top = lSphBase + lSphR*1.6 + 4 + 4 ≈ 82m.
        // We start the connector at 84m (clear of the sphere) and end at 108m.
        const connBase = 84, connTop = 108;
        addCyl(out, vadd(pc, u, connBase), 3.2, connTop - connBase, [0.80, 0.70, 0.66], 8, b);
        // Connector balcony ring at mid-point
        addFrustum(out, vadd(pc, u, connBase + (connTop - connBase) * 0.5 - 1),
                   4.5, 4.5, 2.5, [0.74, 0.66, 0.62], 12, b);

        // Upper observation sphere — base at 108m, top at 108+20=128m.
        const uSphBase = connTop, uSphR = 10;
        addFrustum(out, vadd(pc, u, uSphBase + 2),         uSphR, uSphR,     uSphR * 1.6, [0.82, 0.68, 0.62], 10, b);
        addFrustum(out, vadd(pc, u, uSphBase),             uSphR * 0.7, uSphR, 4,          [0.80, 0.66, 0.60], 10, b);
        addFrustum(out, vadd(pc, u, uSphBase + uSphR * 1.6 + 2), uSphR, uSphR * 0.7, 4,   [0.80, 0.66, 0.60], 10, b);
        // Lit ring on the upper sphere
        addFrustum(out, vadd(pc, u, uSphBase + uSphR * 0.8),
                   uSphR * 1.03, uSphR * 1.03, uSphR * 0.4, WIN_LIT, 10, b);

        // Spire: starts at upper sphere top (~128 + 2 = 130m), rises 40m.
        // Slim cylinder + thin cone tip.
        const spireBase = uSphBase + uSphR * 1.6 + 4 + 2;   // clear of upper sphere top cap
        addCyl(out,  vadd(pc, u, spireBase),      0.9, 32, [0.88, 0.78, 0.72], 6, b);
        addCone(out, vadd(pc, u, spireBase + 32), 0.9, 12, [0.90, 0.82, 0.76], 6, b);
      })();

      // ================= MID-SECTOR GRANDSTAND (s 0.45, R) =================
      grandstand(0.45, 1, 16, 90, [0.43, 0.44, 0.49], SEAT);
      grandstand(0.47, 1, 20, 60, [0.42, 0.43, 0.48], SEAT);
      grandstand(0.42, 1, 18, 60, [0.44, 0.45, 0.50], SEAT);
      grandstand(0.50, 1, 16, 50, [0.43, 0.44, 0.49], SEAT);
      billboard(K(0.46), 1, 12, 16, 4.5, RED);
      marshalPost(K(0.45), 1, 12);

      // ================= MARSH / TREELINE (s 0.62, L far) =================
      (function marshline() {
        const a = anchor(K(0.62), -1, 70), b = [a.r, a.u, a.t];
        addBox(out, vadd(vadd(a.c, a.u, 0.2), a.r, 30), [60, 0.5, 140], MARSH, b);
        for (let i = 0; i < 12; i++) {
          const off  = (hash(i * 7) - 0.5) * 110;
          const dep  = 10 + hash(i * 5) * 50;
          const sz   = 3 + hash(i * 3) * 4;
          addBox(out, vadd(vadd(vadd(a.c, a.r, 30 + (hash(i * 11) - 0.5) * 40), a.t, off),
                 a.u, sz / 2 + 0.2), [sz, sz, sz], i % 2 ? MARSH_N : MARSH, b);
        }
      })();
      hedge(0.58, 0.66, -1, 24, 3.5, MARSH_N);

      // ================= LONG BACK STRAIGHT — open verges (s 0.78, R) =================
      fence(0.72, 0.88, 1, 8, 3.0, [0.70, 0.72, 0.76]);
      billboard(K(0.76), 1, 10, 18, 5, RED);
      billboard(K(0.82), 1, 10, 18, 5, YELLOW);
      billboard(K(0.79), 1, 10, 18, 5, RED);
      marshalPost(K(0.80), 1, 14);
      marshalPost(K(0.74), 1, 12);
      // small grandstand banks lining the long back straight
      grandstand(0.755, 1, 28, 70, [0.43, 0.44, 0.49], SEAT);
      grandstand(0.80,  1, 28, 70, [0.42, 0.43, 0.48], SEAT);
      grandstand(0.845, 1, 28, 60, [0.43, 0.44, 0.49], SEAT);
      // low treeline along the verges behind the stands
      hedge(0.72, 0.88, 1, 55, 3.2, MARSH_N);
      // sparse green verges
      for (let i = 0; i < 4; i++) {
        place((K(0.74) + i * Math.round(n * 0.014)) % n, 1, 36 + i * 8, [5, 0.9, 14], MARSH);
      }

      // Lamp posts along the back straight (one side, at regular intervals)
      along(0.72, 0.88, 35, (k) => {
        const a = anchor(k, -1, 14), b = [a.r, a.u, a.t];
        addCyl(out, a.c, 0.12, 9.5, STEEL, 5, b);
        addBox(out, vadd(a.c, a.u, 9.6), [0.55, 0.28, 0.55], LAMP_GLOW, b);
      });

      // ================= T14 HAIRPIN GRANDSTAND (s 0.90, L) =================
      grandstand(0.88,  -1, 18, 70, [0.44, 0.45, 0.50], SEAT);
      grandstand(0.905, -1, 22, 70, [0.43, 0.44, 0.49], SEAT);
      grandstand(0.93,  -1, 24, 50, [0.42, 0.43, 0.48], SEAT);
      // big run-off slab at the hairpin
      (function hairpinRunoff() {
        const a = anchor(K(0.90), 1, 6), b = [a.r, a.u, a.t];
        addBox(out, vadd(vadd(a.c, a.u, 0.15), a.r, 24), [56, 0.4, 70], ASPH, b);
      })();
      marshalPost(K(0.90), 1, 14);

      // ================= PIT ENTRY BUILDINGS (s 0.96, R) =================
      building(K(0.96), 1, 2, 12,  9, 50, { wall: [0.86, 0.87, 0.88], window: WIN_LIT, floor: 3 });
      building(K(0.94), 1, 2, 10,  7, 34, { wall: [0.84, 0.85, 0.87], window: WIN_LIT, floor: 2 });
      building(K(0.92), -1, 2, 12, 10, 40, { wall: WHITE, window: WIN_LIT, floor: 3 });

      // ---- Scattered marsh greenery + low treeline around the flat perimeter ----
      for (let k = 0; k < n; k += Math.max(1, Math.round(n / 50))) {
        for (const side of [-1, 1]) {
          const r = hash(k * 13 + side * 3);
          if (r > 0.65) continue;
          const d = 42 + hash(k * 7 + side) * 50;
          tree(k, side, d, 7 + hash(k * 17 + side) * 4, MARSH_N);
          if (hash(k * 23 + side) > 0.6) bush(k, side, d + 6, MARSH);
        }
      }

      // ================= TRACKSIDE FURNITURE — barriers, kerbs, signage (whole lap) =================
      guardrail(0.10, 0.42,  1, 5, STEEL);
      guardrail(0.50, 0.70, -1, 5, STEEL);
      guardrail(0.10, 0.42, -1, 6, STEEL);
      fence(0.12, 0.40, 1, 7, 3.2, [0.70, 0.72, 0.76]);
      fence(0.50, 0.70, -1, 7, 3.2, [0.70, 0.72, 0.76]);

      // Tyre walls protecting the heavy corners.
      tyreWall(0.885, 0.915, 1, 4, RED);
      tyreWall(0.06,  0.09,  1, 4, YELLOW);
      tyreWall(0.30,  0.33, -1, 5, RED);

      // Low red/white kerb-edge markers at apexes/exits.
      (function kerbs() {
        const spots = [
          [0.055, 0.075,  1], [0.085, 0.10,  1], [0.30, 0.32, -1],
          [0.46,  0.48,   1], [0.595, 0.61, -1], [0.895, 0.915, 1],
        ];
        for (const [s0, s1, sd] of spots) {
          let j = 0;
          along(s0, s1, 3.2, (k) => {
            place(k, sd, 3.0, [1.4, 0.22, 2.8], (j++) % 2 ? KERB_R : KERB_W);
          });
        }
      })();

      // Marshal posts + extra billboards spread around the lap.
      marshalPost(K(0.20), -1, 18);
      marshalPost(K(0.34), -1, 20);
      marshalPost(K(0.55),  1, 19);
      marshalPost(K(0.66), -1, 19);
      billboard(K(0.18),  1, 12, 14, 4, YELLOW);
      billboard(K(0.33), -1, 20, 16, 4.5, RED);
      billboard(K(0.55),  1, 14, 14, 4, RED);
      billboard(K(0.66), -1, 16, 14, 4, YELLOW);

      // ---- Crowd dabs on the existing grandstand banks ----
      (function crowds() {
        const spots = [
          [0.045, -1, 18], [0.06,  1, 70], [0.46, 1, 16],
          [0.80,   1, 22], [0.905,-1, 20], [0.10,-1, 30],
        ];
        for (const [s, sd, d] of spots) {
          const a = anchor(K(s), sd, d), b = [a.r, a.u, a.t];
          for (let i = 0; i < 5; i++) {
            const off = (i - 2) * 12;
            addBox(out, vadd(vadd(vadd(a.c, a.t, off), a.u, 6), a.r, 2),
                   [9, 2.2, 5], i % 2 ? CROWD : [0.50, 0.34, 0.40], b);
          }
        }
      })();

      // ---- Landscaping: avenues of trees behind stands + reeds near the lake ----
      hedge(0.90, 0.95, -1, 42, 3.0, TREE_G);
      for (let i = 0; i < 4; i++) {
        tree(K(0.90 + i * 0.012), -1, 42 + (i % 2) * 6, 7 + hash(i) * 3, TREE_G);
      }
      for (let i = 0; i < 5; i++) {
        palm(K(0.92 + i * 0.010), -1, 65, 6 + hash(i * 3) * 2, [0.30, 0.46, 0.26]);
      }
      // pines lining the back straight verge
      for (let i = 0; i < 8; i++) {
        pine(K(0.72 + i * 0.018), 1, 58 + (i % 2) * 5, 8 + hash(i * 5) * 4, TREE_G);
      }

      // ================= FORMAL GARDEN FEATURES — SNAIL T1 ZONE (s 0.05–0.10) =================
      (function formalGardens() {
        const topiaryFracs = [0.060, 0.090, 0.120];
        const topiarySides = [-1, 1, -1];
        for (let i = 0; i < topiaryFracs.length; i++) {
          const tk = K(topiaryFracs[i]);
          const at = anchor(tk, topiarySides[i], 50), bt = [at.r, at.u, at.t];
          addBox(out, vadd(at.c, at.u, 1.2), [5, 3.0, 5], [0.24, 0.38, 0.20], bt);
        }
      })();

      // ================= FORMAL TREE AVENUE (s 0.45–0.50) =================
      for (let j = 0; j < 4; j++) {
        const avS = 0.45 + j * 0.01;
        tree(K(avS), -1, 20 + j * 8, 7, [0.20, 0.40, 0.18]);
        tree(K(avS),  1, 20 + j * 8, 7, [0.20, 0.40, 0.18]);
      }

      // ---- Distant low hazy treeline ring (three overlapping bands, continuous) ----
      let cx = 0, cz = 0;
      for (let i = 0; i < n; i++) { cx += px[i]; cz += pz[i]; }
      cx /= n; cz /= n;
      let rad = 0;
      for (let i = 0; i < n; i++) rad = Math.max(rad, Math.hypot(px[i] - cx, pz[i] - cz));
      for (const [extra, count, wMin, hMin, hVar, col] of [
        [180,  52, 100,  7,  6, MARSH_N],
        [240,  46, 120, 10,  7, [0.26, 0.40, 0.22]],
        [310,  40, 140, 12,  8, [0.24, 0.38, 0.20]],
      ]) {
        const ring = rad + extra;
        const span = 2 * Math.PI * ring / count;
        for (let i = 0; i < count; i++) {
          const a = (i + (hash(i * 3 + extra) - 0.5) * 0.3) / count * 6.2832;
          const h = hash(i * 7 + extra);
          const x = cx + Math.cos(a) * ring, z = cz + Math.sin(a) * ring;
          const w = Math.max(wMin + h * 60, span * 1.5);
          addBox(out, [x, pyMin + (hMin + h * hVar) / 2, z], [w, hMin + h * hVar, 20], col, null);
        }
      }
    },
  }
  );
})();
