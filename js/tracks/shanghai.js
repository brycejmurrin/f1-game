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
      const CONC = [0.70, 0.72, 0.74], WHITE = [0.90, 0.91, 0.92], STEEL = [0.62, 0.64, 0.67];
      const SEAT = [0.40, 0.42, 0.46], DARK = [0.30, 0.32, 0.36];
      const ASPH = [0.50, 0.52, 0.54], MARSH = [0.34, 0.45, 0.28], MARSH_N = [0.28, 0.38, 0.24];
      const RED = [0.82, 0.16, 0.14], YELLOW = [0.90, 0.78, 0.16];
      const SKY = [0.66, 0.68, 0.72], SKY_HAZE = [0.72, 0.74, 0.77];
      const GLASS = [0.52, 0.60, 0.70], GLASS_HAZE = [0.66, 0.71, 0.77];
      const WATER = [0.34, 0.46, 0.54], TREE_G = [0.24, 0.40, 0.22];
      const CROWD = [0.62, 0.30, 0.30], TARMAC = [0.26, 0.27, 0.29];
      const KERB_R = [0.80, 0.16, 0.14], KERB_W = [0.90, 0.90, 0.90];
      const PEARL = [0.78, 0.62, 0.58];

      // ================= START / FINISH — WINGED PIT COMPLEX (s 0.00, L) =================
      // Long white pit/control building hugging the main straight.
      building(K(0.00), -1, 2, 18, 14, 150, { wall: WHITE, window: [0.30, 0.34, 0.40], floor: 4 });
      building(K(0.98), -1, 2, 16, 11, 90, { wall: [0.84, 0.85, 0.87], window: [0.28, 0.32, 0.38], floor: 3 });
      // Paddock / hospitality block set further back behind the pit building.
      building(K(0.99), -1, 40, 26, 9, 110, { wall: [0.80, 0.82, 0.84], window: [0.30, 0.34, 0.40], floor: 3 });
      building(K(0.96), -1, 44, 20, 12, 60, { wall: WHITE, window: GLASS, floor: 4 });
      building(K(0.02), -1, 42, 22, 8, 70, { wall: [0.82, 0.83, 0.85], window: [0.30, 0.34, 0.40], floor: 2 });

      // The two suspended tower-bridges — the instant Shanghai signature.
      // Iconic twin pagoda-like towers soaring over the pit straight, connected by
      // dramatic skybridges. These are the defining visual landmark of Shanghai.
      (function wingedTowers() {
        const sLap = 0.005;
        const aL = anchor(K(sLap), -1, 28), bL = [aL.r, aL.u, aL.t];
        const aR = anchor(K(sLap), 1, 28), bR = [aR.r, aR.u, aR.t];

        // LEFT SIDE: Two tall tapered pagoda towers flanking a central gap (team buildings).
        // Slimmer, taller proportions for more iconic pagoda-like silhouette.
        tower(K(sLap), -1, 28, 7.2, 72, { col: WHITE, seg: 8, cap: true, capCol: STEEL, mast: 8 });
        // Second tower (right-most on left side, staggered back)
        tower(K(0.008), -1, 28, 6.8, 74, { col: WHITE, seg: 8, cap: true, capCol: STEEL, mast: 8 });

        // RIGHT SIDE: Single anchoring tower across the track.
        tower(K(sLap), 1, 28, 6.6, 68, { col: WHITE, seg: 8, cap: true, capCol: STEEL, mast: 8 });

        // SKYBRIDGES: Two levels of suspended bridge decks — cleaner than three.
        for (const hgt of [44, 56]) {
          // left side support pillars (thinner for elegance)
          addCyl(out, vadd(aL.c, aL.u, 0), 1.1, hgt, STEEL, 8, bL);
          // main bridge deck spanning right
          const bridgeCol = hgt === 44 ? GLASS : WHITE;
          addBox(out, vadd(vadd(aL.c, aL.u, hgt), aL.r, 24), [48, 2.4, 11], bridgeCol, bL);
          // lower structural beam under the deck (thinner)
          addBox(out, vadd(vadd(aL.c, aL.u, hgt - 1.4), aL.r, 24), [48, 0.6, 9.5], STEEL, bL);
          // right side landing pillars
          addCyl(out, vadd(aR.c, aR.u, 0), 1.0, hgt - 3, STEEL, 8, bR);
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
          // raked seating block (crowd-coloured front face implied by tier colour)
          addBox(out, vadd(vadd(a.c, a.u, 5), a.r, 7), [16, 11, 18], SEAT, b);
          addBox(out, vadd(vadd(a.c, a.u, 8.5), a.r, 1), [16, 3.5, 6], CROWD, b);
          // back support wall + columns
          addBox(out, vadd(vadd(a.c, a.u, 9), a.r, 18), [16, 19, 3], CONC, b);
          addCyl(out, vadd(vadd(a.c, a.u, 0), a.r, 16), 0.8, 18, STEEL, 6, b);
          // big overhanging cantilever roof slab — tilts down toward the track
          addBox(out, vadd(vadd(a.c, a.u, 19), a.r, 4), [16.5, 1.6, 30], WHITE, b);
          addBox(out, vadd(vadd(a.c, a.u, 18), a.r, -8), [16.5, 0.7, 6], STEEL, b);
          // leading-edge fascia of the roof
          addBox(out, vadd(vadd(a.c, a.u, 17.3), a.r, -10.5), [16.5, 1.8, 1.0], STEEL, b);
          // roof rib strip segmenting the roof slab (steel grey perpendicular fin)
          addBox(out, vadd(vadd(a.c, a.u, 19), a.r, 4), [0.4, 2.8, 30], [0.55, 0.58, 0.62], b);
        }
      })();

      // Start gantry over the line.
      gantry(0.004, 9, STEEL);

      // ---- Pit wall + low garage boxes (R, near) red-edged ----
      wall(0.965, 0.05, 1, 3, 1.1, WHITE);
      place(K(0.99), 1, 10, [5, 2.4, 40], CONC);   // low garage box bank
      place(K(0.99), 1, 10, [5, 0.6, 40], RED); // red edge cap
      billboard(K(0.02), 1, 11, 16, 4.5, RED);
      billboard(K(0.97), 1, 11, 14, 4, YELLOW);

      // ---- LAKES by the pit complex and paddock (groundPlane water, distinctive Shanghai feature) ----
      // Large water feature behind the pit straight, adding to the modern circuit character.
      // Position away from tight track areas to avoid culling
      groundPlane(K(0.88), -1, 95, [180, 130], WATER);
      groundPlane(K(0.01), -1, 110, [150, 110], WATER);
      // Modern dock/jetty structures and landscaping nodes at the water edge
      place(K(0.90), -1, 85, [10, 1.0, 5], CONC);
      place(K(0.02), -1, 115, [11, 0.9, 5], [0.65, 0.68, 0.72]);  // light grey deck
      // Smaller decorative water feature in the infield beyond T6
      groundPlane(K(0.32), -1, 220, [90, 65], [0.36, 0.48, 0.56]);

      // ================= START GRANDSTAND TIERS (s 0.04, L) =================
      grandstand(0.04, -1, 18, 130, [0.44, 0.45, 0.50], SEAT);
      grandstand(0.06, -1, 22, 80, [0.42, 0.43, 0.48], SEAT);
      grandstand(0.025, -1, 26, 70, [0.43, 0.44, 0.49], SEAT);
      billboard(K(0.045), -1, 14, 16, 4.5, YELLOW);

      // ================= SNAIL T1–3 RUN-OFF SLAB (s 0.06, R) =================
      (function snailRunoff() {
        const a = anchor(K(0.065), 1, 6), b = [a.r, a.u, a.t];
        // huge flat pale-grey asphalt slab, just above grade
        addBox(out, vadd(vadd(a.c, a.u, 0.15), a.r, 36), [80, 0.4, 120], ASPH, b);
      })();
      // Snail grandstands wrapping the coiling Turn 1–3 spiral.
      // Increased gaps to avoid culling on the tight spiral
      grandstand(0.05, 1, 95, 70, [0.43, 0.44, 0.49], SEAT);
      grandstand(0.085, 1, 85, 60, [0.43, 0.44, 0.49], SEAT);
      grandstand(0.10, -1, 45, 60, [0.42, 0.43, 0.48], SEAT);
      // denser tiers wrapping the snail spiral
      grandstand(0.065, 1, 70, 60, [0.44, 0.45, 0.50], SEAT);
      grandstand(0.115, -1, 40, 50, [0.43, 0.44, 0.49], SEAT);
      grandstand(0.13, 1, 70, 50, [0.43, 0.44, 0.49], SEAT);
      billboard(K(0.07), 1, 56, 16, 5, YELLOW);
      billboard(K(0.095), 1, 44, 16, 5, RED);
      marshalPost(K(0.08), -1, 14);

      // ================= CONTINUOUS HAZY SHANGHAI SKYLINE (wraps whole lap) =================
      // One unbroken band of haze-greyed modern buildings ringing the entire lap —
      // varied heights, glass reflections, no gaps, receding into progressively hazier rows.
      (function skylineBand() {
        let sx = 0, sz = 0;
        for (let i = 0; i < n; i++) { sx += px[i]; sz += pz[i]; }
        sx /= n; sz /= n;
        let rd = 0;
        for (let i = 0; i < n; i++) rd = Math.max(rd, Math.hypot(px[i] - sx, pz[i] - sz));
        // Three concentric rings of tight-packed towers — front sharp, middle mixed, back hazed.
        for (const [extra, cnt, hMin, hVar, col] of [
          [210, 96, 36, 85, GLASS],        // front skyline row (glass-tinted)
          [290, 82, 42, 100, [0.68, 0.70, 0.73]],  // middle row (mixed glass/grey)
          [360, 70, 46, 110, SKY_HAZE],    // back hazed row (taller, greyer, foggier)
        ]) {
          const ring = rd + extra;
          for (let i = 0; i < cnt; i++) {
            const a = i / cnt * 6.2832;
            const jx = (hash(i * 5 + extra) - 0.5) * 20;
            const jz = (hash(i * 7 + extra) - 0.5) * 20;
            const x = sx + Math.cos(a) * ring + jx;
            const z = sz + Math.sin(a) * ring + jz;
            const h = hMin + hash(i * 11 + extra) * hVar;
            const w = 13 + hash(i * 13 + extra) * 14;
            addBox(out, [x, pyMin + h / 2, z], [w, h, w], col, null);
          }
        }
      })();
      // Denser PUDONG-STYLE feature cluster of tall glass towers behind T6 (s 0.30, L far),
      // modern Shanghai skyline with the iconic Pearl Tower landmark as centrepiece.
      (function pudongCluster() {
        const a = anchor(K(0.30), -1, 260), b = [a.r, a.u, a.t];
        const u = b[1];
        // Dense pack of towers framing the Pearl Tower
        for (let i = 0; i < 28; i++) {
          const off = (i - 14) * 24 + (hash(i * 5) - 0.5) * 16;
          const depth = 20 + hash(i * 7) * 90;
          const h = 70 + hash(i * 11) * 150;
          const w = 11 + hash(i * 13) * 13;
          const col = depth > 65 ? SKY_HAZE : (depth > 50 ? GLASS_HAZE : GLASS);
          // tapered glass tower — varied heights give density without clutter
          addFrustum(out, vadd(vadd(vadd(a.c, a.r, off), a.t, depth), u, 0),
                     w / 2, w / 3.4, h, col, 5, b);
          // occasional glass spire cap
          if (hash(i * 17) > 0.3)
            addBox(out, vadd(vadd(vadd(vadd(a.c, a.r, off), a.t, depth), u, h), u, 6),
                   [1.2, 12, 1.2], STEEL, b);
        }
        // ORIENTAL PEARL TOWER: iconic Shanghai landmark at the heart of Pudong.
        // Three spheres stacked on tripod legs, visible from the circuit.
        const pc = vadd(vadd(a.c, a.r, -2), a.t, 50);
        // Three diagonal tripod legs anchoring the structure
        for (const ld of [-10, 0, 10]) addCyl(out, vadd(pc, a.r, ld), 2.4, 88, [0.72, 0.70, 0.68], 8, b);
        // Lower sphere (largest)
        addBox(out, vadd(pc, u, 62), [32, 26, 32], PEARL, b);
        // Mid connector column
        addCyl(out, vadd(pc, u, 78), 3.8, 50, [0.78, 0.68, 0.62], 8, b);
        // Upper observation sphere
        addBox(out, vadd(pc, u, 128), [20, 20, 20], [0.80, 0.66, 0.60], b);
        // Top spire reaching high
        addCone(out, vadd(pc, u, 138), 3.2, 42, [0.86, 0.74, 0.68], 8, b);
      })();

      // ================= MID-SECTOR GRANDSTAND (s 0.45, R) =================
      grandstand(0.45, 1, 16, 90, [0.43, 0.44, 0.49], SEAT);
      grandstand(0.47, 1, 20, 60, [0.42, 0.43, 0.48], SEAT);
      grandstand(0.42, 1, 18, 60, [0.44, 0.45, 0.50], SEAT);
      grandstand(0.50, 1, 16, 50, [0.43, 0.44, 0.49], SEAT);
      billboard(K(0.46), 1, 12, 16, 4.5, RED);
      marshalPost(K(0.45), 1, 12);

      // ================= MARSH / TREELINE (s 0.62, L far) =================
      // Flat green strip with scattered green cubes — low distant marshland.
      (function marshline() {
        const a = anchor(K(0.62), -1, 70), b = [a.r, a.u, a.t];
        addBox(out, vadd(vadd(a.c, a.u, 0.2), a.r, 30), [60, 0.5, 140], MARSH, b);
        for (let i = 0; i < 12; i++) {
          const off = (hash(i * 7) - 0.5) * 110;
          const depth = 10 + hash(i * 5) * 50;
          const sz = 3 + hash(i * 3) * 4;
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
      grandstand(0.80, 1, 28, 70, [0.42, 0.43, 0.48], SEAT);
      grandstand(0.845, 1, 28, 60, [0.43, 0.44, 0.49], SEAT);
      // low treeline along the verges behind the stands — increased distance
      hedge(0.72, 0.88, 1, 55, 3.2, MARSH_N);
      // sparse green/grey verges — push further back
      for (let i = 0; i < 4; i++) {
        place((K(0.74) + i * Math.round(n * 0.014)) % n, 1, 36 + i * 8, [5, 0.9, 14], MARSH);
      }

      // ================= T14 HAIRPIN GRANDSTAND (s 0.90, L) =================
      // Curved bank of stepped grey boxes around the heavy-braking hairpin.
      grandstand(0.88, -1, 18, 70, [0.44, 0.45, 0.50], SEAT);
      grandstand(0.905, -1, 22, 70, [0.43, 0.44, 0.49], SEAT);
      grandstand(0.93, -1, 24, 50, [0.42, 0.43, 0.48], SEAT);
      // big run-off slab at the hairpin
      (function hairpinRunoff() {
        const a = anchor(K(0.90), 1, 6), b = [a.r, a.u, a.t];
        addBox(out, vadd(vadd(a.c, a.u, 0.15), a.r, 24), [56, 0.4, 70], ASPH, b);
      })();
      marshalPost(K(0.90), 1, 14);

      // ================= PIT ENTRY BUILDINGS (s 0.96, R) =================
      building(K(0.96), 1, 2, 12, 9, 50, { wall: [0.86, 0.87, 0.88], window: [0.28, 0.32, 0.38], floor: 3 });
      building(K(0.94), 1, 2, 10, 7, 34, { wall: [0.84, 0.85, 0.87], window: [0.28, 0.32, 0.38], floor: 2 });
      building(K(0.92), -1, 2, 12, 10, 40, { wall: WHITE, window: [0.30, 0.34, 0.40], floor: 3 });

      // ---- Scattered marsh greenery + low treeline around the flat perimeter ----
      // Increased minimum distance to avoid culling; sparser placement
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
      // Continuous armco guardrail + catch fence ringing most of the lap (set back
      // beyond the run-off so it never reaches the tarmac).
      guardrail(0.10, 0.42, 1, 5, STEEL);
      guardrail(0.50, 0.70, -1, 5, STEEL);
      guardrail(0.10, 0.42, -1, 6, STEEL);
      fence(0.12, 0.40, 1, 7, 3.2, [0.70, 0.72, 0.76]);
      fence(0.50, 0.70, -1, 7, 3.2, [0.70, 0.72, 0.76]);

      // Tyre walls protecting the heavy corners (hairpin entry, snail apex, T6).
      tyreWall(0.885, 0.915, 1, 4, RED);
      tyreWall(0.06, 0.09, 1, 4, YELLOW);
      tyreWall(0.30, 0.33, -1, 5, RED);

      // Low red/white kerb-edge markers set just beyond the verge at apexes/exits.
      (function kerbs() {
        const spots = [
          [0.055, 0.075, 1], [0.085, 0.10, 1], [0.30, 0.32, -1],
          [0.46, 0.48, 1], [0.595, 0.61, -1], [0.895, 0.915, 1],
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
      marshalPost(K(0.55), 1, 19);
      marshalPost(K(0.66), -1, 19);
      billboard(K(0.18), 1, 12, 14, 4, YELLOW);
      billboard(K(0.33), -1, 20, 16, 4.5, RED);
      billboard(K(0.55), 1, 14, 14, 4, RED);
      billboard(K(0.66), -1, 16, 14, 4, YELLOW);

      // ---- Crowd dabs on the existing grandstand banks (cheap warm colour) ----
      (function crowds() {
        const spots = [
          [0.045, -1, 18], [0.06, 1, 70], [0.46, 1, 16],
          [0.80, 1, 22], [0.905, -1, 20], [0.10, -1, 30],
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
      // Push hedges further back to reduce culling
      hedge(0.90, 0.95, -1, 42, 3.0, TREE_G);
      for (let i = 0; i < 4; i++) {
        tree(K(0.90 + i * 0.012), -1, 42 + (i % 2) * 6, 7 + hash(i) * 3, TREE_G);
      }
      for (let i = 0; i < 5; i++) {
        palm(K(0.92 + i * 0.010), -1, 65, 6 + hash(i * 3) * 2, [0.30, 0.46, 0.26]);
      }
      // pines lining the back straight verge — reduced density
      for (let i = 0; i < 8; i++) {
        pine(K(0.72 + i * 0.018), 1, 58 + (i % 2) * 5, 8 + hash(i * 5) * 4, TREE_G);
      }

      // ================= FORMAL GARDEN FEATURES — SNAIL T1 ZONE (s 0.05–0.10) =================
      // Light formal landscaping with spacing to avoid culling on the tight snail spiral
      (function formalGardens() {
        // Sparse topiary cubes marking the formal garden accent (not a dense hedge)
        const topiaryFracs = [0.060, 0.090, 0.120];
        const topiarySides = [-1, 1, -1];
        for (let i = 0; i < topiaryFracs.length; i++) {
          const tk = K(topiaryFracs[i]);
          const at = anchor(tk, topiarySides[i], 50), bt = [at.r, at.u, at.t];
          addBox(out, vadd(at.c, at.u, 1.2), [5, 3.0, 5], [0.24, 0.38, 0.20], bt);
        }
      })();

      // ================= FORMAL TREE AVENUE (s 0.45–0.50) =================
      // Aligned tree pairs replacing random scatter — formal Chinese garden avenue.
      for (let j = 0; j < 4; j++) {
        const avS = 0.45 + j * 0.01;
        tree(K(avS), -1, 20 + j * 8, 7, [0.20, 0.40, 0.18]);
        tree(K(avS), 1, 20 + j * 8, 7, [0.20, 0.40, 0.18]);
      }

      // ---- Distant low hazy treeline ring (three overlapping bands, continuous) ----
      let cx = 0, cz = 0;
      for (let i = 0; i < n; i++) { cx += px[i]; cz += pz[i]; }
      cx /= n; cz /= n;
      let rad = 0;
      for (let i = 0; i < n; i++) rad = Math.max(rad, Math.hypot(px[i] - cx, pz[i] - cz));
      for (const [extra, count, wMin, hMin, hVar, col] of [
        [180, 52, 100, 7,  6,  MARSH_N],
        [240, 46, 120, 10, 7,  [0.26, 0.40, 0.22]],
        [310, 40, 140, 12, 8,  [0.24, 0.38, 0.20]],
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
