/* Apex 26 — LAS VEGAS circuit definition (data only).
   Registered on the global TrackDefs list; consumed by the js/tracks.js engine
   (palette resolved there from `night`, geometry from js/circuits.js or `segs`). */
(function () {
  "use strict";
  (window.TrackDefs = window.TrackDefs || []).push(
  {
    id: "vegas",
    name: "LAS VEGAS",
    gp: "Las Vegas GP",
    country: "USA",
    night: true,
    theme: "street_night",
    lengthKm: 6.2,
    baseHW: 7,
    street: true,
    pal: { horizon: [0.28, 0.12, 0.32], zenith: [0.08, 0.04, 0.14], sunColor: [0.65, 0.50, 0.88], ambientSky: [0.42, 0.28, 0.50], ambientGround: [0.50, 0.25, 0.38], fogColor: [0.22, 0.10, 0.26], fogDensity: 0.0030, sunDir: [0.75, 0.20, 0.12] },
    segs: [
      { t: 0, l: 140 }, { t: 90, l: 70 }, { t: -60, l: 60 }, { t: 60, l: 60 }, { t: 0, l: 120 }, { t: -60, l: 60 },
      { t: 70, l: 60 }, { t: -55, l: 60 }, { t: 0, l: 360 }, { t: 90, l: 80 }, { t: -50, l: 70 }, { t: 0, l: 900, t2: 0 },
      { t: -20, l: 200 }, { t: 90, l: 90 }, { t: -60, l: 60 }, { t: 70, l: 70 }, { t: 65, l: 120 },
    ],
    // Las Vegas Strip: the tunnel section under Las Vegas Boulevard dips below
    // road level near the T14 hairpin complex.
    elevations: [{ s: 0.65, halfM: 240, rise: -4 }],
    scenery: function (api) {
      const { out, n, px, py, pz, hw, pyMin, place, prop, backdrop, addBox, addCyl,
        addFrustum, anchor, vadd, onTrack, building, tower, billboard,
        grandstand, marshalPost, gantry, palm, fence, wall, guardrail, tyreWall, hash, addCone, addPrism } = api;
      const K = (s) => Math.round(s * n) % n;

      // Helper: Ferris Wheel — tall rotating observation wheel with lit cabins.
      // Uses anchor() so it sits on terrain instead of floating.
      const ferrisWheel = (k, side, dist, radius) => {
        const a = anchor(k, side, dist);
        const b = [a.r, a.u, a.t];
        const baseC = a.c;
        // Central axle column from ground to hub height
        addCyl(out, baseC, 1.8, radius, [0.20, 0.20, 0.22], 8, b);
        // Outer rim ring represented by 16 slim vertical struts around the perimeter
        for (let i = 0; i < 16; i++) {
          const angle = (i / 16) * 6.2832;
          // Position around wheel in the right/forward plane
          const rimX = a.r[0] * Math.cos(angle) * radius + a.t[0] * Math.sin(angle) * radius;
          const rimZ = a.r[2] * Math.cos(angle) * radius + a.t[2] * Math.sin(angle) * radius;
          const rimY = radius * 0.5; // mid-height of the rim
          const strutBase = [baseC[0] + rimX, baseC[1] + rimY, baseC[2] + rimZ];
          // Lit gondola cab at each spoke end
          const cabCol = (i % 4 === 0) ? [0.15, 0.90, 1.00] :
                         (i % 4 === 1) ? [1.00, 0.20, 0.80] :
                         (i % 4 === 2) ? [1.00, 0.85, 0.20] : [0.30, 1.00, 0.80];
          addBox(out, [strutBase[0], strutBase[1], strutBase[2]], [2.0, 2.0, 2.0], cabCol, b);
        }
        // Bright white LED rim band at hub height (visible from distance)
        addCyl(out, vadd(baseC, a.u, radius * 0.5), radius * 0.92, 2.0, [0.95, 0.98, 1.00], 20, b);
        // Support legs: two A-frame legs from ground out to base of column
        for (const legSide of [-1, 1]) {
          const legOff = radius * 0.38;
          const legBase = [
            baseC[0] + a.r[0] * legSide * legOff,
            baseC[1],
            baseC[2] + a.r[2] * legSide * legOff
          ];
          addCyl(out, legBase, 0.9, radius * 0.55, [0.22, 0.22, 0.25], 5, b);
        }
      };

      // Neon night palette — hyper-saturated Vegas colours
      const WARM = [1.0, 0.85, 0.45];     // casino gold glow / tungsten uplighting
      const GOLD = [1.0, 0.70, 0.20];     // hotter gold spotlights
      const MAGENTA = [1.0, 0.10, 0.70]; // hot neon magenta
      const CYAN = [0.20, 0.90, 1.00];    // bright neon cyan / aqua
      const VIOLET = [0.75, 0.20, 1.00];  // vivid neon purple / indigo
      const LIME = [0.60, 1.00, 0.35];    // neon lime green
      const ROSE = [1.00, 0.25, 0.55];    // hot rose / pink
      const BLUE = [0.25, 0.55, 1.00];    // neon blue
      const RED = [1.00, 0.15, 0.25];     // neon red
      const LED = [0.98, 0.98, 1.0];      // bright white LED facade / pixel lights
      const DARKROCK = [0.16, 0.06, 0.05];
      const NEON = [MAGENTA, CYAN, VIOLET, LIME, WARM, GOLD, ROSE, BLUE, RED];  // expanded palette

      // --- Street-circuit furniture: concrete walls, fences, marshal posts ---
      // The engine emits a continuous dark barrier on both edges for street circuits.
      // Add concrete top-rail accents, debris fences, and marshal posts to dress it.
      fence(0.0, 0.07, 1, 1.4, 3.6, [0.55, 0.56, 0.60]);             // pit/paddock straight
      fence(0.83, 0.91, -1, 1.4, 3.6, [0.55, 0.56, 0.60]);          // neon final straight
      guardrail(0.16, 0.21, 1, 1.0, [0.80, 0.80, 0.84]);            // T5 hard-right armco
      guardrail(0.45, 0.49, -1, 1.0, [0.80, 0.80, 0.84]);          // T12 onto the Strip
      tyreWall(0.305, 0.345, -1, 1.2, MAGENTA);                     // Sphere chicane apex
      tyreWall(0.955, 0.985, 1, 1.2, CYAN);                        // Harmon chicane apex
      // Marshal posts dotted around the lap (off the tarmac via clearance guard)
      for (const [s, side] of [[0.12, 1], [0.22, -1], [0.33, 1], [0.49, -1],
                               [0.62, 1], [0.78, -1], [0.92, 1]]) {
        marshalPost(K(s), side, 4.5);
      }
      // Start/finish + DRS gantries spanning the track
      gantry(0.005, 9.5, [0.12, 0.12, 0.16]);
      gantry(0.50, 8.5, [0.12, 0.12, 0.16]);                       // DRS detection on Strip
      gantry(0.80, 8.5, [0.12, 0.12, 0.16]);

      // --- Distant red-rock desert silhouette (far, dark, no snow) ---
      let cx = 0, cz = 0;
      for (let i = 0; i < n; i++) { cx += px[i]; cz += pz[i]; }
      cx /= n; cz /= n;
      let trad = 0;
      for (let i = 0; i < n; i++) trad = Math.max(trad, Math.hypot(px[i] - cx, pz[i] - cz));
      const ring = trad + 520;
      const desertN = 20;   // fewer, wider boxes read the same as a distant silhouette
      for (let i = 0; i < desertN; i++) {
        const a = i / desertN * 6.2832, h = hash(i * 7 + 3);
        const mx = cx + Math.cos(a) * ring, mz = cz + Math.sin(a) * ring;
        if (onTrack(mx, mz, 60)) continue;
        addBox(out, [mx, pyMin + (24 + h * 30) / 2, mz], [300 + h * 220, 24 + h * 30, 200], DARKROCK);
      }

      // --- DISTANT NIGHT SKYLINE RING: a far band of lit highrise blocks all the way
      //     around, so wherever you look there's a glowing city horizon (not empty). ---
      {
        const sky = trad + 300;
        const skyN = 56;
        for (let i = 0; i < skyN; i++) {
          const a = i / skyN * 6.2832, h = hash(i * 11 + 17), h2 = hash(i * 23 + 5);
          const mx = cx + Math.cos(a) * sky, mz = cz + Math.sin(a) * sky;
          if (onTrack(mx, mz, 80)) continue;
          const bh = 50 + h * 130, bw = 34 + h2 * 30, bd = 34 + h2 * 26;
          // Tower body lifted off pure black (city ambient/neon spill) so it
          // reads as a lit highrise, not a black plane.
          addBox(out, [mx, pyMin + bh / 2, mz], [bw, bh, bd], [0.20, 0.18, 0.26]);
          // Stacked lit window bands up the whole tower so it glows, not just a
          // crown — the floors twinkle like a real night skyline.
          const floors = Math.max(4, Math.round(bh / 12));
          const fh = bh / floors;
          const neon = NEON[i % NEON.length];
          for (let f = 1; f < floors; f++) {
            const wc = hash(i * 7 + f * 3) < 0.4 ? [0.06, 0.06, 0.09] : neon;
            addBox(out, [mx, pyMin + (f + 0.5) * fh, mz], [bw * 1.02, fh * 0.5, bd * 1.02], wc);
          }
          addBox(out, [mx, pyMin + bh - 3, mz], [bw * 1.03, 5, bd * 1.03], neon);   // bright crown
        }
      }

      // --- LAMP POST ROWS: freestanding tall poles along the Strip and key sections ---
      // Tall Vegas-style cobra-head lamp posts at ~30 m intervals, set 12 m from the edge.
      // Each post: a dark grey cylinder mast topped with a bright white-warm LED head box.
      // These are the primary source of "track surface lit up" effect on the foreground.
      // Posts appear on both sides from the pit straight all the way around the Strip.
      const lampPost = (k, side, dist) => {
        const a = anchor(k, side, dist), b = [a.r, a.u, a.t];
        // Slim mast
        addCyl(out, a.c, 0.22, 12, [0.28, 0.28, 0.32], 5, b);
        // Cobra-arm angled box reaching over the track
        const armPt = vadd(a.c, a.u, 12);
        addBox(out, vadd(armPt, b[2], -side * 1.5), [0.2, 0.2, 3.0], [0.30, 0.30, 0.34], b);
        // Bright LED luminaire head — slightly warm white, large to cast a visual pool
        const headPt = vadd(vadd(armPt, b[2], -side * 3.0), a.u, -0.3);
        addBox(out, headPt, [2.8, 0.5, 1.8], [0.98, 0.95, 0.82], b);
      };

      // Lamp posts along the pit straight / paddock sector (s 0.00–0.10)
      for (let s = 0.01; s <= 0.09; s += 0.018) {
        lampPost(K(s), -1, 11);
        lampPost(K(s + 0.009), 1, 11);
      }
      // Lamp posts around T1–T5 sector (s 0.10–0.28)
      for (let s = 0.10; s <= 0.27; s += 0.022) {
        lampPost(K(s), (s < 0.18 ? 1 : -1), 12);
      }
      // Lamp posts along the full Strip (s 0.48–0.82) — both sides, denser
      for (let s = 0.48; s <= 0.82; s += 0.016) {
        lampPost(K(s), -1, 13);
        lampPost(K(s + 0.008), 1, 13);
      }
      // Lamp posts on the final straight / Harmon approach (s 0.83–0.97)
      for (let s = 0.83; s <= 0.97; s += 0.020) {
        lampPost(K(s), 1, 12);
        lampPost(K(s + 0.010), -1, 12);
      }

      // --- LIGHT-POOL PATCHES: thin bright ground slabs simulating floodlight spill ---
      // Placed at regular intervals along the Strip centreline and at key corners.
      // Very thin (h = 0.18 m), wide boxes sitting just above road height — they
      // represent the bright lit asphalt visible under tall lamp columns and casino
      // floodlighting. Warm white to simulate LED wash, not fluorescent cold.
      {
        // Strip light pools — every ~50 m, alternating sides so pools don't fight
        const poolCols = [[0.80, 0.78, 0.65], [0.75, 0.73, 0.60], [0.82, 0.76, 0.62]];
        let pi = 0;
        for (let s = 0.48; s <= 0.82; s += 0.024, pi++) {
          const a = anchor(K(s), 0, 0);
          // Wide pool slab at track level (thin box, sits on the ground plane)
          addBox(out, [a.c[0], a.c[1] + 0.1, a.c[2]], [16, 0.18, 22], poolCols[pi % 3], [a.r, a.u, a.t]);
        }
        // Pit-straight light pools
        for (let s = 0.01; s <= 0.08; s += 0.030) {
          const a = anchor(K(s), 0, 0);
          addBox(out, [a.c[0], a.c[1] + 0.1, a.c[2]], [14, 0.18, 20], [0.78, 0.76, 0.64], [a.r, a.u, a.t]);
        }
        // Final straight light pools
        for (let s = 0.83; s <= 0.96; s += 0.030) {
          const a = anchor(K(s), 0, 0);
          addBox(out, [a.c[0], a.c[1] + 0.1, a.c[2]], [14, 0.18, 20], [0.80, 0.77, 0.64], [a.r, a.u, a.t]);
        }
        // Neon-reflected colour pools flanking the Strip barriers (saturated, low)
        // The wet-look pavement reflects neon from casino signs. Keep vivid but thin.
        for (let j = 0; j < 14; j++) {
          const s = 0.485 + j / 14 * 0.330;
          const side = (j % 2) ? 1 : -1;
          const a = anchor(K(s), side, 2.4);
          const poolNeon = NEON[(j * 3 + (side > 0 ? 1 : 0)) % NEON.length];
          // Scale down vivid neon so pool doesn't wash everything out
          const dimN = [poolNeon[0] * 0.55, poolNeon[1] * 0.55, poolNeon[2] * 0.55];
          addBox(out, vadd(a.c, a.u, 0.12), [5.0, 0.2, 16], dimN, [a.r, a.u, a.t]);
        }
      }

      // --- s 0.00 R near: pit/paddock — pit garages + grandstand + crew structures + neon accents ---
      for (let i = 0; i < 6; i++) {
        place(K(0.0 + i * 0.011), 1, 13, [10, 7, 24], [0.32, 0.33, 0.38]);   // garage block
        place(K(0.0 + i * 0.011), 1, 13, [10.6, 1.0, 25], LED);              // bright rim band
        place(K(0.0 + i * 0.011), 1, 13, [10.4, 4.5, 6], NEON[i % NEON.length]); // team sign (neon colored)
      }
      grandstand(0.035, 1, 28, 82, [0.28, 0.29, 0.34], [0.42, 0.44, 0.58]); // paddock stand (brighter)
      grandstand(0.07, -1, 26, 72, [0.26, 0.27, 0.32], [0.45, 0.40, 0.52]); // opposite stand
      // pit-lane light masts — bright LED headlights (supplement engine's generic posts)
      for (let i = 0; i < 4; i++) {
        const a = anchor(K(0.01 + i * 0.012), 1, 9);
        addCyl(out, a.c, 0.28, 15, [0.35, 0.35, 0.38], 6, [a.r, a.u, a.t]);
        addBox(out, vadd(a.c, a.u, 15), [3.5, 1.2, 1.2], LED, [a.r, a.u, a.t]); // bright light head
      }

      // --- s 0.05 L mid: illuminated billboard towers (magenta/cyan faces) ---
      billboard(K(0.05), -1, 30, 22, 13, MAGENTA);
      billboard(K(0.05), -1, 58, 18, 11, CYAN);
      building(K(0.10), -1, 40, 30, 78, 30, { wall: [0.20, 0.19, 0.22], window: ROSE, floor: 8 });
      building(K(0.14), 1, 36, 26, 64, 26, { wall: [0.22, 0.20, 0.20], window: CYAN, floor: 8 });

      // --- s 0.30 L near: MSG Sphere --- iconic 366-ft LED sphere ---
      // Placed 145 m from road edge to ensure no clipping. The Sphere sits on the
      // terrain at the anchor point. Base radius 66 m, built from stacked frustum bands.
      {
        // Use anchor to get terrain-grounded base position
        const a = anchor(K(0.30), -1, 145);
        const rad = 66;
        // baseY: start bands from terrain level (a.c[1]) so the Sphere rests on the ground
        const baseY = a.c[1];
        // Sphere display palette: ultra-bright, saturated LEDs
        const sphereColors = [
          [0.10, 0.35, 1.00],  // ultra-bright blue
          [0.35, 0.70, 1.00],  // cyan-blue glow
          [1.00, 0.20, 0.85],  // hot magenta (led pure)
          [0.20, 0.95, 1.00],  // neon cyan (bright)
          [1.00, 0.80, 0.15],  // golden yellow LED
          [1.00, 1.00, 1.00],  // pure white LED
          [1.00, 0.25, 0.50],  // hot rose LED
          [0.30, 0.50, 1.00],  // royal blue
          [0.95, 0.15, 0.95],  // violet LED
          [0.15, 1.00, 1.00],  // full aqua/cyan
        ];
        // Support structure base: a short wide frustum pedestal so the sphere
        // doesn't appear to float — matches real Sphere's concrete base/exoskeleton
        addFrustum(out, [a.c[0], baseY, a.c[2]], rad * 0.32, rad * 0.28, rad * 0.18,
          [0.25, 0.25, 0.28], 16, null);
        // 12 horizontal frustum bands forming the sphere profile
        const bands = 12;
        for (let i = 0; i < bands; i++) {
          const t0 = i / bands, t1 = (i + 1) / bands;
          const phi0 = t0 * Math.PI, phi1 = t1 * Math.PI;
          const rB = rad * Math.sin(phi0), rT = rad * Math.sin(phi1);
          const yB = baseY + rad * (1 - Math.cos(phi0));
          const hB = rad * (Math.cos(phi0) - Math.cos(phi1));
          addFrustum(out, [a.c[0], yB, a.c[2]], Math.max(rB, 2), Math.max(rT, 2),
            Math.max(hB, 1), sphereColors[i % sphereColors.length], 24, null);
        }
        // Bright LED content bands — animated content effect
        for (let i = 0; i < 6; i++) {
          const yy = baseY + rad * (0.45 + i * 0.2);
          const cylRad = rad * (0.85 - i * 0.04);
          const contentCol = sphereColors[(i * 2 + i) % sphereColors.length];
          addCyl(out, [a.c[0], yy, a.c[2]], cylRad, 3.5, contentCol, 24, null);
        }
        // Bright equatorial band
        addCyl(out, [a.c[0], baseY + rad * 0.5, a.c[2]], rad * 0.88, 5.0, LED, 28, null);
      }

      // --- s 0.35 R mid: Venetian tower cluster ---
      // Pushed to dist 49/78 so it stays clear of any nearby section (safe gap).
      building(K(0.35), 1, 49, 40, 98, 40, { wall: [0.64, 0.60, 0.52], window: [1.0, 0.85, 0.35], floor: 8 });
      building(K(0.36), 1, 78, 32, 75, 32, { wall: [0.62, 0.58, 0.50], window: [0.98, 0.80, 0.30], floor: 8 });
      // Campanile tower: pushed slightly farther (dist 92) to avoid sitting behind
      // the Venetian block which starts at 49+20 = 69 from edge.
      tower(K(0.345), 1, 92, 18, 60, { col: [0.58, 0.54, 0.46], seg: 6, cap: true, capCol: [1.0, 0.82, 0.20], mast: true });
      place(K(0.35), 1, 32, [28, 1.8, 8], [1.0, 0.85, 0.25]); // golden uplighting on Venetian

      // --- s 0.45 R far: extra red-rock silhouette ---
      backdrop(K(0.45), 1, 240, [180, 30, 120], DARKROCK);

      // --- s 0.50 L mid: Strip casino wall — Mirage/Caesars tall towers ---
      // Dist raised to 65/100 to keep inner face well clear; each building ~48 wide
      // so its inner face is at 65 m — safe from any parallel straight at ~55 m.
      building(K(0.50), -1, 65, 44, 125, 42, { wall: [0.32, 0.28, 0.26], window: WARM, floor: 9 });
      building(K(0.52), -1, 100, 34, 92, 32, { wall: [0.30, 0.27, 0.25], window: WARM, floor: 9 });

      // --- s 0.58 L mid: Caesars Palace — wide cream box, dramatic gold up-lights ---
      building(K(0.58), -1, 46, 62, 75, 46, { wall: [0.68, 0.64, 0.56], window: [1.0, 0.85, 0.40], floor: 8 });
      place(K(0.58), -1, 28, [44, 2.4, 8], [1.0, 0.88, 0.30]);   // bright golden uplighting
      place(K(0.58), -1, 20, [50, 1.2, 10], [0.95, 0.75, 0.15]); // secondary glow band
      // MGM Grand — tallest structure on the Strip, brilliant gold-lit
      building(K(0.54), 1, 72, 52, 145, 52, { wall: [0.28, 0.26, 0.24], window: [0.98, 0.80, 0.18], floor: 10 });
      place(K(0.54), 1, 38, [58, 2.0, 10], [1.0, 0.82, 0.12]); // intense golden floodlighting
      // Welcome to Las Vegas sign billboard
      billboard(K(0.60), -1, 50, 24, 14, [0.98, 0.88, 0.15]);

      // --- s 0.64 L near: Paris Las Vegas — Eiffel replica tower ---
      // The Paris tower at night is illuminated with warm golden/amber lights.
      // Moved to dist=68 (base 26 wide → inner face at 68 m) and kept clear of
      // the Caesars block (dist 46+31=77 outer face). No overlap since dist 68 < 77.
      // The tower primitive uses a frustum so no rectangular clipping concern.
      tower(K(0.64), -1, 68, 22, 130, { col: [0.55, 0.48, 0.35], seg: 4, cap: true, capCol: [1.0, 0.85, 0.4], mast: true });
      place(K(0.64), -1, 30, [10, 1.6, 10], [1.0, 0.80, 0.25]);  // bright golden uplighting
      place(K(0.64), -1, 50, [14, 0.7, 14], [0.95, 0.75, 0.20]); // secondary golden pool
      // Emissive lit windows on the Paris hotel base (lower block)
      building(K(0.63), -1, 50, 36, 55, 34, { wall: [0.62, 0.58, 0.48], window: [1.0, 0.82, 0.30], floor: 7 });

      // --- s 0.70 R near: High Roller observation wheel (world's tallest) ---
      // Moved to dist=85 (was 75) to ensure wheel rim (radius 65 m) does not clip
      // the road edge: inner reach = 85 − 65 = 20 m beyond road edge — safe.
      ferrisWheel(K(0.70), 1, 85, 65);
      billboard(K(0.71), 1, 36, 16, 10, CYAN);
      // LINQ promenade base structure under the wheel
      building(K(0.70), 1, 48, 36, 18, 28, { wall: [0.24, 0.24, 0.28], window: [0.15, 0.80, 1.00], floor: 4 });
      // Wheel base pool lighting
      place(K(0.70), 1, 34, [24, 0.7, 24], [0.15, 0.45, 0.65]);
      place(K(0.70), 1, 28, [20, 0.5, 20], [0.10, 0.30, 0.50]);

      // --- s 0.74 L mid: Bellagio Hotel & Casino ---
      // Dist raised to 40 (was 36); w=60 so inner face at 40 m — no overlap with
      // the Eiffel sector (different s values, different world position).
      building(K(0.74), -1, 40, 60, 55, 40, { wall: [0.58, 0.55, 0.50], window: [1.0, 0.85, 0.40], floor: 7 });
      place(K(0.74), -1, 22, [80, 2.0, 10], [1.0, 0.75, 0.20]); // base illumination
      // Fountain pools — bright with underwater LED lighting (blue/white/cyan)
      place(K(0.74), -1, 26, [20, 1.0, 70], [0.15, 0.50, 0.95]);   // main fountain pool (bright)
      place(K(0.75), -1, 26, [16, 0.8, 52], [0.10, 0.60, 1.00]);   // secondary bright pool
      // Fountain jet columns (tall thin lit structures simulating water streams)
      for (let i = 0; i < 8; i++) {
        const a = anchor(K(0.74 + i * 0.003), -1, 30);
        const jetCols = [CYAN, [0.15, 0.50, 1.00], LED, [0.30, 0.85, 1.00], BLUE, MAGENTA, [0.20, 0.90, 0.95], ROSE];
        const jetCol = jetCols[i % jetCols.length];
        addBox(out, vadd(a.c, a.u, 9), [0.8, 18, 0.8], jetCol, [a.r, a.u, a.t]);
      }

      // --- s 0.85 both near: Final neon gates ---
      for (const [side, col1, col2] of [[-1, MAGENTA, CYAN], [1, CYAN, MAGENTA]]) {
        billboard(K(0.85), side, 26, 20, 12, col1);
        billboard(K(0.87), side, 26, 18, 11, col2);
        billboard(K(0.89), side, 26, 16, 10, [col1[2], col1[0], col1[1]]); // rotated hue
        // Extra accent lighting at base level and mid-height
        place(K(0.86), side, 16, [10, 1.4, 10], col1);
        place(K(0.88), side, 20, [12, 1.0, 8], col2);
      }

      // --- s 0.95 R near: Harmon Ave chicane grandstands ---
      for (let i = 0; i < 4; i++) {
        place(K(0.95 + i * 0.006), 1, 24, [22, 8 + i * 3, 14], [0.16, 0.16, 0.20]);
        place(K(0.95 + i * 0.006), 1, 24, [22.4, 0.8, 14.5], LED);   // crowd-light fleck band
      }
      grandstand(0.965, 1, 20, 70, [0.18, 0.18, 0.22], [0.50, 0.40, 0.55]);  // chicane main stand
      grandstand(0.90, -1, 22, 60, [0.18, 0.18, 0.22], [0.45, 0.40, 0.55]);  // opposite

      // --- CONTINUOUS STRIP SKYLINE CANYON (s ~0.49–0.81): packed neon walls on both sides ---
      {
        const s0 = 0.485, s1 = 0.815;
        const span = s1 - s0;
        const STEP = 0.0075;                 // ~40 m between masses
        const wallCol = [[0.20, 0.18, 0.20], [0.18, 0.16, 0.20], [0.22, 0.20, 0.18]];
        let idx = 0;
        for (let s = s0; s <= s1; s += STEP, idx++) {
          const k = K(s);
          for (const side of [-1, 1]) {
            const h1 = hash(idx * 5 + (side > 0 ? 13 : 71));
            const h2 = hash(idx * 9 + (side > 0 ? 31 : 7));
            const neon = NEON[(idx + (side > 0 ? 4 : 1)) % NEON.length];
            const neon2 = NEON[(idx * 3 + (side > 0 ? 5 : 2)) % NEON.length];
            // FAR backdrop wall: tall blocks forming a gapless skyline
            const fh = 75 + h1 * 110;
            backdrop(k, side, 180, [48, fh, 28], wallCol[idx % 3]);
            backdrop(k, side, 175, [50, 6.0, 24], neon);             // top neon band
            // MID lit casino slab — warm casino interiors + neon accents
            const mh = 50 + h2 * 75;
            place(k, side, 102, [32, mh, 26], [0.24 + h1 * 0.12, 0.18, 0.18]);
            place(k, side, 96, [34, 5.0, 22], (idx % 2) ? WARM : neon2);  // varied lighting
            place(k, side, 96, [34, 2.0, 22], LED);                        // LED line
          }
        }
        // Tall signature casino towers punched along the canyon
        for (let j = 0; j < 8; j++) {
          const s = s0 + (j + 0.5) / 8 * span, side = (j % 2) ? -1 : 1;
          const windowCol = [WARM, CYAN, MAGENTA, GOLD, VIOLET][j % 5];
          building(K(s), side, 110, 46, 115 + hash(j * 17) * 70, 34,
            { wall: [0.22, 0.20, 0.20], window: windowCol, floor: 17 });
        }
        // Strip-side neon billboards + palms
        for (let j = 0; j < 10; j++) {
          const s = s0 + (j + 0.3) / 10 * span, side = (j % 2) ? 1 : -1;
          billboard(K(s), side, 50, 18 + hash(j * 3) * 6, 11, NEON[(j + 2) % NEON.length]);
          palm(K(s + 0.004), side, 26, 12 + hash(j * 23) * 4, LIME);
          palm(K(s - 0.004), -side, 26, 11 + hash(j * 29) * 4, LIME);
        }
        // Emissive lit-window facade strips along the Strip canyon mid-level
        // These small bright boxes represent casino hotel windows and neon signs
        // clustered at street level — making the immediate foreground look lit up.
        for (let j = 0; j < 16; j++) {
          const s = s0 + j / 16 * span;
          const side = (j % 2) ? 1 : -1;
          const a = anchor(K(s), side, 22);
          const winNeon = NEON[(j * 5 + 3) % NEON.length];
          // Street-level illuminated sign / marquee band
          addBox(out, vadd(a.c, a.u, 4.5), [6.0, 2.5, 0.5], winNeon, [a.r, a.u, a.t]);
          // Mid-level window band accent
          const winWarm = (j % 3 === 0) ? WARM : (j % 3 === 1) ? LED : GOLD;
          addBox(out, vadd(a.c, a.u, 9.0), [6.0, 1.8, 0.5], winWarm, [a.r, a.u, a.t]);
        }
      }

      // --- Denser palms + neon accents around the paddock / Sphere / Bellagio approaches ---
      for (const [s, side] of [[0.02, 1], [0.08, -1], [0.42, 1], [0.46, 1], [0.72, -1], [0.78, -1],
                               [0.20, -1], [0.27, 1], [0.38, -1], [0.95, -1]]) {
        palm(K(s), side, 18, 10 + hash(s * 100) * 3, LIME);
        palm(K(s + 0.006), side, 22, 9 + hash(s * 131) * 3, LIME);
      }
      billboard(K(0.34), 1, 40, 16, 10, VIOLET);
      billboard(K(0.55), -1, 50, 16, 10, GOLD);
      billboard(K(0.67), 1, 38, 14, 9, LIME);
      billboard(K(0.18), 1, 34, 14, 9, ROSE);
      billboard(K(0.26), -1, 36, 14, 9, BLUE);

      // --- Mid-band casino facades around the Sphere sector + paddock to fill gaps ---
      building(K(0.22), 1, 60, 30, 72, 28, { wall: [0.20, 0.19, 0.22], window: VIOLET, floor: 8 });
      building(K(0.28), -1, 70, 34, 84, 30, { wall: [0.22, 0.20, 0.22], window: BLUE, floor: 8 });
      building(K(0.40), -1, 64, 28, 66, 26, { wall: [0.20, 0.19, 0.20], window: ROSE, floor: 8 });

      // --- Extra near red-rock desert outcrops (dark, denser silhouette layer) ---
      for (let j = 0; j < 6; j++) {
        const a = j / 6 * 6.2832 + 0.4, h = hash(j * 13 + 5);
        const mx = cx + Math.cos(a) * (ring - 180), mz = cz + Math.sin(a) * (ring - 180);
        if (onTrack(mx, mz, 60)) continue;
        addBox(out, [mx, pyMin + (18 + h * 22) / 2, mz], [180 + h * 140, 18 + h * 22, 140], DARKROCK);
      }
      // Neon finish arch/halo at s≈0.98 — bright magenta circle framing the finish line
      {
        const k = K(0.98);
        const a = anchor(k, 0, 0);
        // Main arch ring
        addCyl(out, vadd(a.c, a.u, 9), 9.5, 1.0, MAGENTA, 14, [a.r, a.u, a.t]);
        // Secondary accent ring—alternating neon color
        addCyl(out, vadd(a.c, a.u, 6), 8, 0.6, CYAN, 14, [a.r, a.u, a.t]);
      }
    },
  }
  );
})();
