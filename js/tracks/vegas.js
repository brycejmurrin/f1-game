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
    pal: { horizon: [0.22, 0.08, 0.28], zenith: [0.04, 0.02, 0.10], sunColor: [0.55, 0.45, 0.80], ambientSky: [0.28, 0.18, 0.38], ambientGround: [0.32, 0.14, 0.24], fogColor: [0.18, 0.06, 0.22], fogDensity: 0.0025, sunDir: [0.8, 0.15, 0.1] },
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

      // Neon night palette
      const WARM = [1.0, 0.78, 0.35];     // casino glow / gold
      const GOLD = [1.0, 0.62, 0.18];     // hot up-light
      const MAGENTA = [0.95, 0.15, 0.65];
      const CYAN = [0.15, 0.85, 0.95];
      const VIOLET = [0.55, 0.25, 0.95];  // neon purple
      const LIME = [0.55, 0.95, 0.30];    // neon green
      const ROSE = [0.95, 0.30, 0.55];
      const BLUE = [0.20, 0.45, 0.95];
      const LED = [0.95, 0.96, 1.0];      // white LED facade
      const DARKROCK = [0.18, 0.08, 0.07];
      const NEON = [MAGENTA, CYAN, VIOLET, LIME, WARM, GOLD, ROSE, BLUE];  // cycle for lit faces

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

      // --- s 0.30 L near: MSG Sphere — big emissive orb faked as a stacked frustum dome ---
      {
        const a = anchor(K(0.30), -1, 138);
        const rad = 62, baseY = a.c[1] + 4;
        const vc = [[0.20, 0.40, 0.90], [0.90, 0.30, 0.60], MAGENTA, CYAN, WARM, ROSE];
        // 8 horizontal slabs sampled from a sphere profile → smooth glowing orb,
        // each a frustum band so the silhouette curves. Cheap + reads as the Sphere.
        const bands = 8;
        for (let i = 0; i < bands; i++) {
          const t0 = i / bands, t1 = (i + 1) / bands;
          const phi0 = t0 * Math.PI, phi1 = t1 * Math.PI;
          const rB = rad * Math.sin(phi0), rT = rad * Math.sin(phi1);
          const yB = baseY + rad * (1 - Math.cos(phi0));
          const hB = rad * (Math.cos(phi0) - Math.cos(phi1));
          addFrustum(out, [a.c[0], yB, a.c[2]], Math.max(rB, 1.5), Math.max(rT, 1.5),
            Math.max(hB, 0.5), vc[i % vc.length], 16, null);
        }
        // a few horizontal "screen content" bands for the colour-wash look
        for (let i = 0; i < 3; i++) {
          const yy = baseY + rad * (0.7 + i * 0.35);
          addCyl(out, [a.c[0], yy, a.c[2]], rad * 0.86, 3.0, vc[(i + 2) % vc.length], 16, null);
        }
      }

      // --- s 0.35 R mid: Venetian tower cluster — tall warm-cream stack, lit grid ---
      building(K(0.35), 1, 51, 38, 92, 38, { wall: [0.62, 0.58, 0.50], window: WARM, floor: 7 });
      building(K(0.36), 1, 81, 30, 70, 30, { wall: [0.60, 0.56, 0.48], window: WARM, floor: 7 });
      tower(K(0.345), 1, 92, 18, 60, { col: [0.55, 0.50, 0.42], seg: 6, cap: true, capCol: WARM }); // campanile

      // --- s 0.45 R far: extra red-rock silhouette already handled by ring; add a near low ridge ---
      backdrop(K(0.45), 1, 240, [180, 30, 120], DARKROCK);

      // --- s 0.50 L mid: Strip casino wall — Mirage/Caesars stacked warm-glow towers ---
      building(K(0.50), -1, 57, 46, 120, 40, { wall: [0.30, 0.27, 0.24], window: WARM, floor: 8 });
      building(K(0.52), -1, 93, 34, 86, 30, { wall: [0.28, 0.26, 0.24], window: WARM, floor: 8 });

      // --- s 0.58 L mid: Caesars Palace — wide ivory box, gold up-lights ---
      building(K(0.58), -1, 46, 60, 70, 44, { wall: [0.70, 0.66, 0.58], window: WARM, floor: 7 });
      place(K(0.58), -1, 30, [40, 2.0, 6], WARM);   // gold up-light strip at base

      // --- s 0.64 L near: Paris Las Vegas — Eiffel replica via tapered tower, amber spots ---
      tower(K(0.64), -1, 60, 26, 138, { col: [0.16, 0.14, 0.12], seg: 4, cap: true, capCol: WARM, mast: true });
      place(K(0.64), -1, 28, [10, 1.6, 10], WARM);  // amber spotlight pool

      // --- s 0.70 R near: High Roller observation wheel + cyan LED rim ---
      ferrisWheel(K(0.70), 1, 70, 62);
      billboard(K(0.71), 1, 34, 14, 9, CYAN);
      // wheel apron lit pool
      place(K(0.70), 1, 30, [20, 0.6, 20], [0.10, 0.35, 0.55]);

      // --- s 0.74 L mid: Bellagio — long low elegant box + blue fountain-pool strip ---
      building(K(0.74), -1, 38, 64, 48, 34, { wall: [0.52, 0.50, 0.46], window: WARM, floor: 6 });
      place(K(0.74), -1, 20, [16, 0.6, 60], [0.10, 0.35, 0.70]);   // fountain pool sheen
      place(K(0.75), -1, 20, [12, 0.6, 40], [0.12, 0.45, 0.80]);
      // fountain jets (thin lit verticals)
      for (let i = 0; i < 5; i++) {
        const a = anchor(K(0.74 + i * 0.004), -1, 24);
        addBox(out, vadd(a.c, a.u, 7), [0.6, 14, 0.6], [0.7, 0.85, 1.0], [a.r, a.u, a.t]);
      }

      // --- s 0.85 both near: Strip-side neon billboards flanking final straight ---
      for (const [side, col] of [[-1, MAGENTA], [1, CYAN]]) {
        billboard(K(0.85), side, 26, 16, 10, col);
        billboard(K(0.87), side, 26, 14, 9, side < 0 ? CYAN : MAGENTA);
      }

      // --- s 0.95 R near: Harmon Ave chicane grandstands — tiered dark boxes, bright flecks ---
      for (let i = 0; i < 4; i++) {
        place(K(0.95 + i * 0.006), 1, 24, [22, 8 + i * 3, 14], [0.16, 0.16, 0.20]);
        place(K(0.95 + i * 0.006), 1, 24, [22.4, 0.8, 14.5], LED);   // crowd-light fleck band
      }
      grandstand(0.965, 1, 20, 70, [0.18, 0.18, 0.22], [0.50, 0.40, 0.55]);  // chicane main stand
      grandstand(0.90, -1, 22, 60, [0.18, 0.18, 0.22], [0.45, 0.40, 0.55]);  // opposite

      // --- CONTINUOUS STRIP SKYLINE: a packed neon canyon lining BOTH sides of the
      //     long Strip straight (s ~0.49–0.81). A back wall of lit blocks gives a
      //     gapless skyline band; a mid row of taller lit casino slabs varies the
      //     rooftop line; cheap single-box masses keep it dense within the cap. ---
      {
        const s0 = 0.485, s1 = 0.815;
        const span = s1 - s0;
        const STEP = 0.0072;                 // ~44 m between masses; blocks overlap, no gaps
        const wallCol = [[0.24, 0.22, 0.22], [0.22, 0.21, 0.23], [0.26, 0.23, 0.20]];
        let idx = 0;
        for (let s = s0; s <= s1; s += STEP, idx++) {
          const k = K(s);
          for (const side of [-1, 1]) {
            const h1 = hash(idx * 5 + (side > 0 ? 13 : 71));
            const h2 = hash(idx * 9 + (side > 0 ? 31 : 7));
            const neon = NEON[(idx + (side > 0 ? 3 : 0)) % NEON.length];
            const neon2 = NEON[(idx * 2 + (side > 0 ? 5 : 1)) % NEON.length];
            // FAR continuous backdrop wall: one tall lit block, varied height — the
            // gapless skyline silhouette. Wide enough to overlap its neighbours.
            const fh = 64 + h1 * 110;
            backdrop(k, side, 178, [56, fh, 30], wallCol[idx % 3]);
            backdrop(k, side, 172, [58, 6.0, 24], neon);            // crowning neon band
            backdrop(k, side, 172, [58, 3.0, 24], LED);             // white LED stripe
            // MID lit casino slab — closer, warm-glow facade, varied rooftop line.
            const mh = 42 + h2 * 76;
            place(k, side, 100, [34, mh, 26], [0.20 + h1 * 0.12, 0.18, 0.18]);
            place(k, side, 94, [36, 5.0, 22], (idx % 2) ? WARM : neon2);  // lit facade band
            place(k, side, 94, [36, 2.0, 22], LED);                       // LED accent line
          }
        }
        // Sparser taller signature casino towers punched along the canyon (lit grid).
        for (let j = 0; j < 9; j++) {
          const s = s0 + (j + 0.5) / 9 * span, side = (j % 2) ? -1 : 1;
          building(K(s), side, 112, 40, 100 + hash(j * 17) * 70, 30,
            { wall: [0.22, 0.20, 0.20], window: (j % 2) ? WARM : CYAN, floor: 16 });
        }
        // Strip-side neon billboards + palms threaded along the canyon edge.
        for (let j = 0; j < 11; j++) {
          const s = s0 + (j + 0.3) / 11 * span, side = (j % 2) ? 1 : -1;
          billboard(K(s), side, 46, 14 + hash(j * 3) * 6, 9, NEON[j % NEON.length]);
          palm(K(s + 0.004), side, 22, 9 + hash(j * 23) * 4, LIME);
          palm(K(s - 0.004), -side, 22, 9 + hash(j * 29) * 4, LIME);
        }
        // Ground-level neon ground-reflection strips (dim emissive slabs near the
        // barrier) to imply the wet-look Strip shine. Kept off the tarmac via gap.
        for (let j = 0; j < 14; j++) {
          const s = s0 + j / 14 * span, side = (j % 2) ? 1 : -1;
          const a = anchor(K(s), side, 3.0);
          addBox(out, vadd(a.c, a.u, 0.1), [4, 0.2, 10], NEON[j % NEON.length], [a.r, a.u, a.t]);
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
    },
  }
  );
})();
