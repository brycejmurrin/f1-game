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
      // Tall slim towers either side of the straight, joined by flat bridge slabs
      // on thin pillars spanning over the pit straight.
      (function wingedTowers() {
        const sLap = 0.005;
        const aL = anchor(K(sLap), -1, 30), bL = [aL.r, aL.u, aL.t];
        const aR = anchor(K(sLap), 1, 30), bR = [aR.r, aR.u, aR.t];
        // Two tall tapered towers on the left (pit) side flanking a gap.
        tower(K(sLap), -1, 30, 7, 56, { col: WHITE, seg: 6, cap: true, capCol: STEEL, mast: 8 });
        tower(K(0.01), -1, 30, 7, 56, { col: WHITE, seg: 6, cap: true, capCol: STEEL, mast: 8 });
        // A matching tower across the track on the right to anchor the spanning bridge.
        tower(K(sLap), 1, 30, 7, 46, { col: WHITE, seg: 6, cap: true, capCol: STEEL });
        // Suspended bridge slabs spanning over the pit straight on thin pillars.
        for (const hgt of [34, 44]) {
          // thin support pillars rising on left tower line
          addCyl(out, vadd(aL.c, aL.u, 0), 1.1, hgt, STEEL, 6, bL);
          // flat bridge slab reaching out across the track toward the right
          addBox(out, vadd(vadd(aL.c, aL.u, hgt), aL.r, 24), [50, 3, 10], WHITE, bL);
          addBox(out, vadd(vadd(aL.c, aL.u, hgt - 1.6), aL.r, 24), [50, 0.8, 9], STEEL, bL);
        }
        // catwalk pillars landing on the right side
        addCyl(out, vadd(aR.c, aR.u, 0), 1.1, 44, STEEL, 6, bR);
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
      billboard(K(0.02), 1, 9, 16, 4.5, RED);
      billboard(K(0.97), 1, 9, 14, 4, YELLOW);

      // ---- LAKE by the pit complex (groundPlane water, L behind paddock) ----
      groundPlane(K(0.92), -1, 60, [200, 130], WATER);
      groundPlane(K(0.00), -1, 70, [160, 110], WATER);
      // small dock / jetty boxes at the water edge
      place(K(0.95), -1, 56, [10, 1.2, 4], CONC);

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
      grandstand(0.05, 1, 80, 70, [0.43, 0.44, 0.49], SEAT);
      grandstand(0.085, 1, 70, 60, [0.43, 0.44, 0.49], SEAT);
      grandstand(0.10, -1, 30, 60, [0.42, 0.43, 0.48], SEAT);
      // denser tiers wrapping the snail spiral
      grandstand(0.065, 1, 58, 60, [0.44, 0.45, 0.50], SEAT);
      grandstand(0.05, 1, 100, 80, [0.42, 0.43, 0.48], SEAT);
      grandstand(0.115, -1, 26, 50, [0.43, 0.44, 0.49], SEAT);
      grandstand(0.13, 1, 40, 50, [0.43, 0.44, 0.49], SEAT);
      billboard(K(0.07), 1, 50, 16, 5, YELLOW);
      billboard(K(0.095), 1, 38, 16, 5, RED);
      marshalPost(K(0.08), -1, 14);

      // ================= CONTINUOUS HAZY SHANGHAI SKYLINE (wraps whole lap) =================
      // One unbroken band of haze-greyed buildings ringing the far side of the
      // entire lap — varied heights, no gaps, receding into a back row.
      (function skylineBand() {
        let sx = 0, sz = 0;
        for (let i = 0; i < n; i++) { sx += px[i]; sz += pz[i]; }
        sx /= n; sz /= n;
        let rd = 0;
        for (let i = 0; i < n; i++) rd = Math.max(rd, Math.hypot(px[i] - sx, pz[i] - sz));
        // Two concentric rings of tight-packed towers — front sharper, back hazed.
        for (const [extra, cnt, hMin, hVar, col] of [
          [205, 90, 34, 80, SKY],          // front skyline row
          [285, 76, 40, 95, SKY_HAZE],     // back hazed row (taller, greyer)
        ]) {
          const ring = rd + extra;
          for (let i = 0; i < cnt; i++) {
            const a = i / cnt * 6.2832;
            const jx = (hash(i * 5 + extra) - 0.5) * 18;
            const jz = (hash(i * 7 + extra) - 0.5) * 18;
            const x = sx + Math.cos(a) * ring + jx;
            const z = sz + Math.sin(a) * ring + jz;
            const h = hMin + hash(i * 11 + extra) * hVar;
            const w = 12 + hash(i * 13 + extra) * 12;
            addBox(out, [x, pyMin + h / 2, z], [w, h, w], col, null);
          }
        }
      })();
      // Denser PUDONG-STYLE feature cluster of tall glass towers behind T6 (s 0.30, L far),
      // with a pearl-tower-like landmark (twin spheres on a tripod) as the centrepiece.
      (function pudongCluster() {
        const a = anchor(K(0.30), -1, 220), b = [a.r, a.u, a.t];
        const u = b[1];
        for (let i = 0; i < 20; i++) {
          const off = (i - 10) * 26 + (hash(i * 5) - 0.5) * 16;
          const depth = 20 + hash(i * 7) * 70;
          const h = 70 + hash(i * 11) * 140;
          const w = 11 + hash(i * 13) * 12;
          const col = depth > 55 ? GLASS_HAZE : GLASS;
          // tapered glass tower with a spire cap
          addFrustum(out, vadd(vadd(vadd(a.c, a.r, off), a.t, depth), u, 0),
                     w / 2, w / 3.4, h, col, 4, b);
          if (hash(i * 17) > 0.3)
            addBox(out, vadd(vadd(vadd(vadd(a.c, a.r, off), a.t, depth), u, h), u, 6),
                   [1.2, 12, 1.2], STEEL, b);
        }
        // Pearl-tower landmark: tripod legs, a big lower sphere, a smaller upper sphere, spire.
        const pc = vadd(vadd(a.c, a.r, -6), a.t, 30);
        for (const ld of [-5, 5]) addCyl(out, vadd(pc, a.r, ld), 1.6, 70, PEARL, 6, b);
        addBox(out, vadd(pc, u, 50), [22, 18, 22], PEARL, b);   // lower sphere (boxy approx)
        addCyl(out, vadd(pc, u, 60), 2.4, 36, PEARL, 6, b);
        addBox(out, vadd(pc, u, 100), [14, 14, 14], PEARL, b);  // upper sphere
        addCone(out, vadd(pc, u, 110), 2.2, 30, [0.86, 0.72, 0.66], 6, b); // spire
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
      grandstand(0.755, 1, 22, 70, [0.43, 0.44, 0.49], SEAT);
      grandstand(0.80, 1, 22, 70, [0.42, 0.43, 0.48], SEAT);
      grandstand(0.845, 1, 22, 60, [0.43, 0.44, 0.49], SEAT);
      // low treeline along the verges behind the stands
      hedge(0.72, 0.88, 1, 40, 3.2, MARSH_N);
      // sparse green/grey verges
      for (let i = 0; i < 6; i++) {
        place((K(0.74) + i * Math.round(n * 0.008)) % n, 1, 20 + i * 6, [6, 1.2, 18], MARSH);
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
      for (let k = 0; k < n; k += Math.max(1, Math.round(n / 60))) {
        for (const side of [-1, 1]) {
          const r = hash(k * 13 + side * 3);
          if (r > 0.6) continue;
          const d = 28 + hash(k * 7 + side) * 44;
          tree(k, side, d, 6 + hash(k * 17 + side) * 4, MARSH_N);
          if (hash(k * 23 + side) > 0.55) bush(k, side, d + 5, MARSH);
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
      marshalPost(K(0.20), -1, 12);
      marshalPost(K(0.34), -1, 14);
      marshalPost(K(0.55), 1, 13);
      marshalPost(K(0.66), -1, 13);
      billboard(K(0.18), 1, 10, 14, 4, YELLOW);
      billboard(K(0.33), -1, 16, 16, 4.5, RED);
      billboard(K(0.55), 1, 12, 14, 4, RED);
      billboard(K(0.66), -1, 14, 14, 4, YELLOW);

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
      hedge(0.90, 0.95, -1, 28, 3.0, TREE_G);
      for (let i = 0; i < 5; i++) {
        tree(K(0.90 + i * 0.008), -1, 30 + (i % 2) * 5, 7 + hash(i) * 3, TREE_G);
      }
      for (let i = 0; i < 6; i++) {
        palm(K(0.92 + i * 0.008), -1, 50, 6 + hash(i * 3) * 2, [0.30, 0.46, 0.26]);
      }
      // pines lining the back straight verge
      for (let i = 0; i < 10; i++) {
        pine(K(0.72 + i * 0.015), 1, 46 + (i % 2) * 5, 8 + hash(i * 5) * 4, TREE_G);
      }

      // ================= FORMAL GARDEN FEATURES — SNAIL T1 ZONE (s 0.05–0.10) =================
      // Dense formal hedging replacing sparse trees near the snail turn.
      (function formalGardens() {
        // Tight hedgerow walls on both sides of the snail approach.
        hedge(0.05, 0.10, -1, 18, 2.8, [0.24, 0.38, 0.20]);
        hedge(0.05, 0.10, 1, 30, 2.8, [0.24, 0.38, 0.20]);
        // Additional every(18) closer hedging for formal density.
        const snailSpots = [0.055, 0.065, 0.075, 0.085, 0.095, 0.100, 0.105, 0.110];
        for (let i = 0; i < snailSpots.length; i++) {
          const sk = K(snailSpots[i]);
          const a0 = anchor(sk, -1, 20), b0 = [a0.r, a0.u, a0.t];
          addBox(out, vadd(a0.c, a0.u, 1.4), [4, 2.8, 6], [0.24, 0.38, 0.20], b0);
          const a1 = anchor(sk, 1, 24), b1 = [a1.r, a1.u, a1.t];
          addBox(out, vadd(a1.c, a1.u, 1.4), [4, 2.8, 6], [0.24, 0.38, 0.20], b1);
        }
        // Ornamental topiary cubes alternating sides at s=0.06–0.12.
        const topiaryFracs = [0.060, 0.070, 0.080, 0.090, 0.105, 0.115];
        const topiarySides = [-1, 1, -1, 1, -1, 1];
        for (let i = 0; i < topiaryFracs.length; i++) {
          const tk = K(topiaryFracs[i]);
          const at = anchor(tk, topiarySides[i], 22), bt = [at.r, at.u, at.t];
          addBox(out, vadd(at.c, at.u, 1.2), [4, 2.4, 4], [0.26, 0.40, 0.22], bt);
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
