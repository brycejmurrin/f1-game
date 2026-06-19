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
    scenery: function (api) {
      const { out, n, px, py, pz, hw, pyMin, place, prop, backdrop, addBox, anchor, onTrack, ferrisWheel, building, tower, billboard, palm, fence, hash } = api;
      const K = (s) => Math.round(s * n) % n;

      // Neon night palette
      const WARM = [1.0, 0.78, 0.35];     // casino glow / gold
      const GOLD = [1.0, 0.62, 0.18];     // hot up-light
      const MAGENTA = [0.95, 0.15, 0.65];
      const CYAN = [0.15, 0.85, 0.95];
      const VIOLET = [0.55, 0.25, 0.95];  // neon purple
      const LIME = [0.55, 0.95, 0.30];    // neon green
      const LED = [0.95, 0.96, 1.0];      // white LED facade
      const DARKROCK = [0.18, 0.08, 0.07];
      const NEON = [MAGENTA, CYAN, VIOLET, LIME, WARM, GOLD];  // cycle for lit faces

      // --- Street-circuit furniture ---
      // The engine already emits a continuous dark barrier wall on both edges for
      // street circuits, so we don't add another full-lap wall here (that doubled
      // the vert cost). A few short debris-fence accents on the spectator stretches
      // are plenty for the street look without blanketing the whole 6.2 km lap.
      fence(0.0, 0.06, 1, 1.4, 3.6, [0.55, 0.56, 0.60]);             // pit/paddock straight
      fence(0.84, 0.90, -1, 1.4, 3.6, [0.55, 0.56, 0.60]);           // neon final straight

      // --- Distant red-rock desert silhouette (far, dark, no snow) ---
      let cx = 0, cz = 0;
      for (let i = 0; i < n; i++) { cx += px[i]; cz += pz[i]; }
      cx /= n; cz /= n;
      let trad = 0;
      for (let i = 0; i < n; i++) trad = Math.max(trad, Math.hypot(px[i] - cx, pz[i] - cz));
      const ring = trad + 520;
      const desertN = 18;   // fewer, wider boxes read the same as a distant silhouette
      for (let i = 0; i < desertN; i++) {
        const a = i / desertN * 6.2832, h = hash(i * 7 + 3);
        const mx = cx + Math.cos(a) * ring, mz = cz + Math.sin(a) * ring;
        if (onTrack(mx, mz, 60)) continue;
        addBox(out, [mx, pyMin + (24 + h * 30) / 2, mz], [300 + h * 220, 24 + h * 30, 200], DARKROCK);
      }

      // --- s 0.00 R near: pit/paddock grandstand — long low white-LED box block ---
      for (let i = 0; i < 5; i++) {
        place(K(0.0 + i * 0.012), 1, 14, [10, 7, 26], [0.30, 0.31, 0.36]);
        place(K(0.0 + i * 0.012), 1, 14, [10.6, 1.0, 27], LED);   // bright rim band
      }

      // --- s 0.05 L mid: illuminated billboard towers (magenta/cyan faces) ---
      billboard(K(0.05), -1, 30, 22, 13, MAGENTA);
      billboard(K(0.05), -1, 58, 18, 11, CYAN);

      // --- s 0.30 L near: MSG Sphere — big sphere faked as a ring-stacked dome, colour-cycling ---
      {
        const a = anchor(K(0.30), -1, 132);
        const rad = 56, hubY = a.c[1] + rad + 6;
        const vc = [[0.20, 0.40, 0.90], [0.90, 0.30, 0.60], MAGENTA, CYAN, WARM];
        // Coarser ring stack (5 rings x 10 segs, bigger panels) still reads as the
        // glowing colour-cycling dome at a fraction of the vert cost.
        for (let i = 1; i <= 5; i++) {
          const phi = (i / 6) * Math.PI, rr = rad * Math.sin(phi), yy = hubY + rad * Math.cos(phi);
          const seg = 10;
          for (let j = 0; j < seg; j++) {
            const th = (j / seg) * Math.PI * 2;
            addBox(out, [a.c[0] + rr * Math.cos(th), yy, a.c[2] + rr * Math.sin(th)],
              [12, 12, 12], vc[(i + j) % vc.length]);
          }
        }
        addBox(out, [a.c[0], hubY + rad, a.c[2]], [8, 8, 8], vc[0]);
      }

      // --- s 0.35 R mid: Venetian tower cluster — tall warm-cream stack, lit grid ---
      building(K(0.35), 1, 51, 38, 92, 38, { wall: [0.62, 0.58, 0.50], window: WARM, floor: 7 });
      building(K(0.36), 1, 81, 30, 70, 30, { wall: [0.60, 0.56, 0.48], window: WARM, floor: 7 });

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
      ferrisWheel(K(0.70), 1, 64, 60);
      billboard(K(0.71), 1, 34, 14, 9, CYAN);

      // --- s 0.74 L mid: Bellagio — long low elegant box + blue fountain-pool strip ---
      building(K(0.74), -1, 38, 64, 48, 34, { wall: [0.52, 0.50, 0.46], window: WARM, floor: 6 });
      place(K(0.74), -1, 20, [16, 0.6, 60], [0.10, 0.35, 0.70]);   // fountain pool sheen
      place(K(0.75), -1, 20, [12, 0.6, 40], [0.12, 0.45, 0.80]);

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

      // --- CONTINUOUS STRIP SKYLINE: a packed neon canyon lining BOTH sides of the
      //     long Strip straight (s ~0.49–0.81). A back wall of lit blocks gives a
      //     gapless skyline band; a mid row of taller lit casino slabs varies the
      //     rooftop line; cheap single-box masses keep it dense within the cap. ---
      {
        const s0 = 0.485, s1 = 0.815;
        const span = s1 - s0;
        const STEP = 0.0079;                 // ~48 m between masses; blocks 56 m wide → overlap, no gaps
        const wallCol = [[0.24, 0.22, 0.22], [0.22, 0.21, 0.23], [0.26, 0.23, 0.20]];
        let idx = 0;
        for (let s = s0; s <= s1; s += STEP, idx++) {
          const k = K(s);
          for (const side of [-1, 1]) {
            const h1 = hash(idx * 5 + (side > 0 ? 13 : 71));
            const h2 = hash(idx * 9 + (side > 0 ? 31 : 7));
            const neon = NEON[(idx + (side > 0 ? 3 : 0)) % NEON.length];
            // FAR continuous backdrop wall: one tall lit block, varied height — the
            // gapless skyline silhouette. Wide enough to overlap its neighbours.
            const fh = 64 + h1 * 96;
            backdrop(k, side, 168, [56, fh, 30], wallCol[idx % 3]);
            backdrop(k, side, 162, [58, 5.0, 24], neon);            // crowning neon band
            // MID lit casino slab — closer, warm-glow facade, varied rooftop line.
            const mh = 40 + h2 * 70;
            place(k, side, 96, [34, mh, 26], [0.20 + h1 * 0.12, 0.18, 0.18]);
            place(k, side, 90, [36, 4.0, 22], (idx % 2) ? WARM : neon);  // lit facade band
          }
        }
        // Sparser taller signature casino towers punched along the canyon (lit grid).
        for (let j = 0; j < 7; j++) {
          const s = s0 + (j + 0.5) / 7 * span, side = (j % 2) ? -1 : 1;
          building(K(s), side, 104, 40, 96 + hash(j * 17) * 60, 30,
            { wall: [0.22, 0.20, 0.20], window: (j % 2) ? WARM : CYAN, floor: 16 });
        }
        // Strip-side neon billboards + palms threaded along the canyon edge.
        for (let j = 0; j < 9; j++) {
          const s = s0 + (j + 0.3) / 9 * span, side = (j % 2) ? 1 : -1;
          billboard(K(s), side, 44, 14 + hash(j * 3) * 6, 9, NEON[j % NEON.length]);
          palm(K(s + 0.004), side, 22, 9 + hash(j * 23) * 4, LIME);
          palm(K(s - 0.004), -side, 22, 9 + hash(j * 29) * 4, LIME);
        }
      }

      // --- Denser palms + neon accents around the paddock / Sphere / Bellagio approaches ---
      for (const [s, side] of [[0.02, 1], [0.08, -1], [0.42, 1], [0.46, 1], [0.72, -1], [0.78, -1]]) {
        palm(K(s), side, 18, 10 + hash(s * 100) * 3, LIME);
        palm(K(s + 0.006), side, 22, 9 + hash(s * 131) * 3, LIME);
      }
      billboard(K(0.34), 1, 40, 16, 10, VIOLET);
      billboard(K(0.55), -1, 50, 16, 10, GOLD);
      billboard(K(0.67), 1, 38, 14, 9, LIME);

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
