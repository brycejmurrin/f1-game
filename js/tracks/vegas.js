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
        addFrustum, anchor, vadd, onTrack, ferrisWheel, building, tower, billboard,
        grandstand, marshalPost, gantry, palm, fence, wall, guardrail, tyreWall, hash } = api;
      const K = (s) => Math.round(s * n) % n;

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
          const bh = 50 + h * 130;
          addBox(out, [mx, pyMin + bh / 2, mz], [34 + h2 * 30, bh, 34 + h2 * 26], [0.14, 0.13, 0.16]);
          // lit crown band so the far skyline twinkles
          addBox(out, [mx, pyMin + bh - 4, mz], [36 + h2 * 30, 5, 36 + h2 * 26], NEON[i % NEON.length]);
        }
      }

      // --- s 0.00 R near: pit/paddock — pit garages + grandstand + crew structures ---
      for (let i = 0; i < 6; i++) {
        place(K(0.0 + i * 0.011), 1, 13, [10, 7, 24], [0.30, 0.31, 0.36]);   // garage block
        place(K(0.0 + i * 0.011), 1, 13, [10.6, 1.0, 25], LED);              // bright rim band
        place(K(0.0 + i * 0.011), 1, 13, [10.4, 4.5, 6], NEON[i % NEON.length]); // team sign
      }
      grandstand(0.035, 1, 30, 80, [0.26, 0.27, 0.32], [0.40, 0.42, 0.55]); // paddock stand
      grandstand(0.07, -1, 24, 70, [0.24, 0.25, 0.30], [0.45, 0.38, 0.50]); // opposite stand
      // pit-lane light masts
      for (let i = 0; i < 4; i++) {
        const a = anchor(K(0.01 + i * 0.012), 1, 9);
        addCyl(out, a.c, 0.25, 14, [0.3, 0.3, 0.33], 5, [a.r, a.u, a.t]);
        addBox(out, vadd(a.c, a.u, 14), [3, 1, 1], LED, [a.r, a.u, a.t]);
      }

      // --- s 0.05 L mid: illuminated billboard towers (magenta/cyan faces) ---
      billboard(K(0.05), -1, 30, 22, 13, MAGENTA);
      billboard(K(0.05), -1, 58, 18, 11, CYAN);
      building(K(0.10), -1, 40, 30, 78, 30, { wall: [0.20, 0.19, 0.22], window: ROSE, floor: 8 });
      building(K(0.14), 1, 36, 26, 64, 26, { wall: [0.22, 0.20, 0.20], window: CYAN, floor: 8 });

      // --- s 0.30 L near: MSG Sphere — iconic 366-ft LED sphere, the world's largest ---
      // The Sphere is jaw-dropping at night: a massive glowing orb with cycling colours,
      // content, and spectacular LED displays. We render it as a large emissive dome
      // with 10 bands sampled from a perfect sphere profile. Brighter colours + more
      // varied hues make it read as the iconic landmark it is.
      {
        const a = anchor(K(0.30), -1, 145);
        const rad = 66, baseY = a.c[1] + 2;
        // Sphere display palette: blues, magentas, cyans, whites, golds — what you
        // actually see on the real Sphere's LED facade at night.
        const sphereColors = [
          [0.15, 0.25, 0.85],  // deep blue
          [0.30, 0.55, 1.00],  // bright cyan-blue
          [0.90, 0.20, 0.70],  // hot magenta
          [0.15, 0.80, 0.95],  // neon cyan
          [0.98, 0.75, 0.30],  // bright gold
          [1.00, 0.95, 0.85],  // almost white
          [0.95, 0.30, 0.60],  // hot pink
          [0.25, 0.35, 0.90],  // royal blue
          [0.85, 0.15, 0.85],  // violet
          [0.20, 0.90, 0.95],  // aqua
        ];
        // 10 horizontal frustum bands from sphere profile—reads as a smooth, seamless dome
        const bands = 10;
        for (let i = 0; i < bands; i++) {
          const t0 = i / bands, t1 = (i + 1) / bands;
          const phi0 = t0 * Math.PI, phi1 = t1 * Math.PI;
          const rB = rad * Math.sin(phi0), rT = rad * Math.sin(phi1);
          const yB = baseY + rad * (1 - Math.cos(phi0));
          const hB = rad * (Math.cos(phi0) - Math.cos(phi1));
          addFrustum(out, [a.c[0], yB, a.c[2]], Math.max(rB, 2), Math.max(rT, 2),
            Math.max(hB, 1), sphereColors[i % sphereColors.length], 20, null);
        }
        // Bright horizontal content stripes to simulate LED content running across the sphere
        for (let i = 0; i < 5; i++) {
          const yy = baseY + rad * (0.5 + i * 0.25);
          const cylRad = rad * (0.82 - i * 0.05);  // taper toward the top
          addCyl(out, [a.c[0], yy, a.c[2]], cylRad, 4.0, sphereColors[(i * 2 + 1) % sphereColors.length], 20, null);
        }
      }

      // --- s 0.35 R mid: Venetian tower cluster — tall warm-cream stack, lit grid ---
      building(K(0.35), 1, 51, 38, 92, 38, { wall: [0.62, 0.58, 0.50], window: WARM, floor: 7 });
      building(K(0.36), 1, 81, 30, 70, 30, { wall: [0.60, 0.56, 0.48], window: WARM, floor: 7 });
      tower(K(0.345), 1, 92, 18, 60, { col: [0.55, 0.50, 0.42], seg: 6, cap: true, capCol: WARM }); // campanile

      // --- s 0.45 R far: extra red-rock silhouette already handled by ring; add a near low ridge ---
      backdrop(K(0.45), 1, 240, [180, 30, 120], DARKROCK);

      // --- s 0.50 L mid: Strip casino wall — Mirage/Caesars tall towers with warm interior glow ---
      // These hotels have warm tungsten-style interior lighting mixed with neon signage accents
      building(K(0.50), -1, 60, 48, 125, 42, { wall: [0.32, 0.28, 0.26], window: WARM, floor: 9 });
      building(K(0.52), -1, 96, 36, 92, 32, { wall: [0.30, 0.27, 0.25], window: WARM, floor: 9 });

      // --- s 0.58 L mid: Caesars Palace — wide ivory box, gold up-lights ---
      building(K(0.58), -1, 46, 60, 70, 44, { wall: [0.70, 0.66, 0.58], window: WARM, floor: 7 });
      place(K(0.58), -1, 30, [40, 2.0, 6], WARM);   // gold up-light strip at base
      // MGM Grand — tall gold-windowed tower
      building(K(0.54), 1, 76, 50, 140, 50, { wall: [0.25, 0.23, 0.21], window: [0.95, 0.75, 0.20], floor: 9 });
      // Welcome to Las Vegas sign billboard
      billboard(K(0.60), -1, 48, 20, 12, [0.95, 0.80, 0.15]);

      // --- s 0.64 L near: Paris Las Vegas — Eiffel replica via tapered tower, amber spots ---
      tower(K(0.64), -1, 60, 26, 138, { col: [0.16, 0.14, 0.12], seg: 4, cap: true, capCol: WARM, mast: true });
      place(K(0.64), -1, 28, [10, 1.6, 10], WARM);  // amber spotlight pool

      // --- s 0.70 R near: High Roller observation wheel (world's tallest) + cyan LED underlit base ---
      // The High Roller wheel is 550 ft tall and lit up at night. At night it's especially
      // striking—each cabin glows from within, and the base is lit with cyan/white accents.
      ferrisWheel(K(0.70), 1, 75, 65);
      billboard(K(0.71), 1, 36, 16, 10, CYAN);
      // Wheel base pool lighting (the real wheel sits over a structure with LED pools)
      place(K(0.70), 1, 32, [24, 0.7, 24], [0.15, 0.45, 0.65]);
      place(K(0.70), 1, 26, [20, 0.5, 20], [0.10, 0.30, 0.50]);

      // --- s 0.74 L mid: Bellagio Hotel & Casino — iconic fountains with dramatic lighting ---
      // The Bellagio's famous fountains are lit with multiple colours at night. They're
      // reflected in the pool water below, creating a spectacular display. We show the
      // hotel mass and the lit fountain jets.
      building(K(0.74), -1, 38, 64, 50, 34, { wall: [0.55, 0.52, 0.48], window: WARM, floor: 6 });
      // Fountain pools—bright with underwater LED lighting (blue/white)
      place(K(0.74), -1, 22, [18, 0.8, 62], [0.12, 0.40, 0.75]);   // main fountain pool
      place(K(0.75), -1, 22, [14, 0.6, 44], [0.15, 0.50, 0.85]);   // secondary bright pool
      // Fountain jet columns (tall thin lit structures simulating water streams + lighting)
      for (let i = 0; i < 6; i++) {
        const a = anchor(K(0.74 + i * 0.0035), -1, 26);
        const jetCol = [CYAN, [0.10, 0.45, 0.85], LED, [0.2, 0.8, 1.0], BLUE, CYAN][i % 6];
        addBox(out, vadd(a.c, a.u, 8), [0.7, 16, 0.7], jetCol, [a.r, a.u, a.t]);
      }

      // --- s 0.85 both near: Final neon gates — vibrant billboards flanking the final straight ---
      // The approach to the finish is framed by huge neon marquees—classic Vegas style
      for (const [side, col1, col2] of [[-1, MAGENTA, CYAN], [1, CYAN, MAGENTA]]) {
        billboard(K(0.85), side, 28, 18, 11, col1);
        billboard(K(0.87), side, 28, 16, 10, col2);
        // Extra accent lighting at base level
        place(K(0.86), side, 18, [8, 1.2, 8], col1);
      }

      // --- s 0.95 R near: Harmon Ave chicane grandstands — tiered dark boxes, bright flecks ---
      for (let i = 0; i < 4; i++) {
        place(K(0.95 + i * 0.006), 1, 24, [22, 8 + i * 3, 14], [0.16, 0.16, 0.20]);
        place(K(0.95 + i * 0.006), 1, 24, [22.4, 0.8, 14.5], LED);   // crowd-light fleck band
      }
      grandstand(0.965, 1, 20, 70, [0.18, 0.18, 0.22], [0.50, 0.40, 0.55]);  // chicane main stand
      grandstand(0.90, -1, 22, 60, [0.18, 0.18, 0.22], [0.45, 0.40, 0.55]);  // opposite

      // --- CONTINUOUS STRIP SKYLINE CANYON (s ~0.49–0.81): packed neon walls on both sides ---
      // The Las Vegas Strip is a tight urban canyon at night with towering hotels on both
      // sides. The F1 car races through what reads as a narrow gap between massive lit
      // buildings. Far walls form a gapless skyline; mid row of taller casinos varies the
      // roofline. Heavy neon on every surface — marquees, window bands, signage.
      {
        const s0 = 0.485, s1 = 0.815;
        const span = s1 - s0;
        const STEP = 0.0055;                 // ~30 m between masses; ultra-dense canyon
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
            const fh = 70 + h1 * 120;
            backdrop(k, side, 180, [56, fh, 32], wallCol[idx % 3]);
            backdrop(k, side, 175, [60, 7.0, 26], neon);             // top neon band (brighter)
            backdrop(k, side, 175, [60, 3.5, 26], LED);              // bright LED accent
            // MID lit casino slab — warm casino interiors + neon accents
            const mh = 46 + h2 * 80;
            place(k, side, 104, [36, mh, 28], [0.22 + h1 * 0.13, 0.16, 0.16]);
            place(k, side, 98, [38, 5.5, 24], (idx % 3) ? WARM : neon2);  // varied lighting
            place(k, side, 98, [38, 2.2, 24], LED);                        // LED line
          }
        }
        // Tall signature casino towers punched along the canyon with bright neon windows
        for (let j = 0; j < 10; j++) {
          const s = s0 + (j + 0.5) / 10 * span, side = (j % 2) ? -1 : 1;
          const windowCol = [WARM, CYAN, MAGENTA, GOLD, VIOLET][j % 5];
          building(K(s), side, 115, 42, 110 + hash(j * 17) * 75, 32,
            { wall: [0.20, 0.18, 0.18], window: windowCol, floor: 18 });
        }
        // Strip-side neon billboards + palms threaded along the canyon edge.
        // Palms are lit with greenish backlight, creating depth and tropical vibes against the neon
        for (let j = 0; j < 12; j++) {
          const s = s0 + (j + 0.3) / 12 * span, side = (j % 2) ? 1 : -1;
          billboard(K(s), side, 48, 16 + hash(j * 3) * 7, 10, NEON[(j + 2) % NEON.length]);
          // Palms lit with bright green fronds, creating a tropical accent against the neon
          palm(K(s + 0.004), side, 24, 11 + hash(j * 23) * 5, LIME);
          palm(K(s - 0.004), -side, 24, 10 + hash(j * 29) * 5, LIME);
        }
        // Ground-level neon reflection strips (glowing thin slabs near the barrier)
        // imply the wet-look Strip shine and street-level neon glow from signs/casinos
        for (let j = 0; j < 16; j++) {
          const s = s0 + j / 16 * span, side = (j % 2) ? 1 : -1;
          const a = anchor(K(s), side, 2.8);
          const groundNeon = NEON[(j * 2 + (side > 0 ? 1 : 0)) % NEON.length];
          addBox(out, vadd(a.c, a.u, 0.15), [5, 0.25, 12], groundNeon, [a.r, a.u, a.t]);
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
