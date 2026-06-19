/* Apex 26 — MONZA circuit definition (data only).
   Registered on the global TrackDefs list; consumed by the js/tracks.js engine
   (palette resolved there from `night`, geometry from js/circuits.js or `segs`). */
(function () {
  "use strict";
  (window.TrackDefs = window.TrackDefs || []).push(
  {
    id: "monza",
    name: "MONZA",
    gp: "Italian GP",
    country: "Italy",
    night: false,
    theme: "green",
    lengthKm: 5.8,
    baseHW: 8,
    pal: {
      zenith:        [0.22, 0.42, 0.72],
      horizon:       [0.78, 0.68, 0.50],
      sun:           [1.0,  0.90, 0.62],
      sunColor:      [1.0,  0.88, 0.58],
      ambientSky:    [0.48, 0.50, 0.56],
      ambientGround: [0.26, 0.24, 0.18],
      fogColor:      [0.70, 0.66, 0.55],
      grass:         [0.20, 0.44, 0.18],
      sunDir:        [0.5, 0.55, 0.3],
    },
    segs: [
      { t: 0, l: 560 }, { t: 70, l: 55 }, { t: -75, l: 60 }, { t: 80, l: 220 }, { t: 0, l: 200 }, { t: -60, l: 55 },
      { t: 70, l: 70 }, { t: 75, l: 130 }, { t: 60, l: 120 }, { t: 0, l: 260 }, { t: -50, l: 55 }, { t: 65, l: 70 },
      { t: 0, l: 360 }, { t: 150, l: 220 },
    ],
    // Royal-park circuit is nearly flat — a gentle rise through the Lesmos.
    elevations: [{ s: 0.55, halfM: 320, rise: 7 }],
    scenery: function (api) {
      const { n, pyMin, place, prop, backdrop, groundPlane, every, onTrack, hash,
        pine, tree, hedge, ridge, building, tower, grandstand, billboard, px, pz } = api;
      const K = (s) => Math.round(s * n) % n;

      // --- Green royal park: continuous umbrella-pine / tree corridor ---
      // Tall narrow Italian umbrella pines lining the park almost the whole lap,
      // on BOTH sides — denser than before (~1.5-2x), only thin breathing gaps.
      every(22, (k) => {
        const h = hash(k * 31);
        if (h < 0.18) return;                       // thin gaps only
        const side = h < 0.55 ? -1 : 1;
        const d = 11 + h * 7;
        // pine() = tapered trunk + 3 stacked cones; tall + slim for umbrella look.
        pine(k, side, d, 20 + h * 12, [0.10, 0.30, 0.14]);
        // mirror a pine on the far side for a true two-sided corridor.
        if (h > 0.62) pine(k, -side, d + 3 + h * 4, 17 + h * 11, [0.09, 0.27, 0.13]);
      });
      // A second, set-back rank of pines forms the park-interior wall behind the verge.
      every(46, (k) => {
        const h = hash(k * 41 + 3);
        if (h < 0.48) return;
        const side = h < 0.5 ? -1 : 1;
        pine(k, side, 26 + h * 16, 22 + h * 13, [0.08, 0.26, 0.12]);
      });
      // Sunlit broadleaf verge trees scattered between the pines — denser.
      every(46, (k) => {
        const h = hash(k * 53 + 9);
        if (h < 0.42) return;
        tree(k, h < 0.66 ? -1 : 1, 13 + h * 9, 12 + h * 7, [0.18, 0.45, 0.20]);
        if (h > 0.82) tree(k, h < 0.9 ? 1 : -1, 18 + h * 8, 11 + h * 6, [0.22, 0.48, 0.22]);
      });
      // Clipped park treeline / hedge banding several sweeps, both sides, lap-wide.
      hedge(0.06, 0.18, -1, 22, 7, [0.12, 0.33, 0.16]);
      hedge(0.06, 0.18,  1, 22, 7, [0.12, 0.33, 0.16]);
      hedge(0.32, 0.46, -1, 24, 6, [0.13, 0.34, 0.17]);
      hedge(0.66, 0.78,  1, 24, 6, [0.13, 0.34, 0.17]);
      hedge(0.82, 0.94, -1, 26, 6, [0.12, 0.33, 0.16]);

      // --- s 0.00 L — Tribuna Centrale main grandstand on the pit straight ---
      grandstand(0.005, -1, 9, 150, [0.55, 0.58, 0.62], [0.74, 0.30, 0.26]);
      grandstand(0.965, -1, 9, 90, [0.55, 0.58, 0.62], [0.70, 0.28, 0.24]);
      // facing grandstand on the right of the pit straight
      grandstand(0.02, 1, 11, 110, [0.52, 0.55, 0.60], [0.72, 0.30, 0.26]);
      // red trim row fronting the stand
      prop(K(0.01), -1, 7, [3, 2, 120], [0.78, 0.18, 0.16]);
      // additional spectator grandstands around the lap (chicanes & Parabolica)
      grandstand(0.05, -1, 12, 70, [0.54, 0.57, 0.61], [0.70, 0.30, 0.26]);
      grandstand(0.30, 1, 13, 64, [0.53, 0.56, 0.60], [0.68, 0.28, 0.24]);
      grandstand(0.78, -1, 13, 72, [0.54, 0.57, 0.61], [0.70, 0.28, 0.24]);
      grandstand(0.91, 1, 14, 80, [0.53, 0.56, 0.60], [0.72, 0.30, 0.26]);

      // --- s 0.00 R — pit wall + slim white podium tower with red cap ---
      tower(K(0.0), 1, 12, 6, 44, { col: [0.90, 0.90, 0.88], cap: true, capCol: [0.78, 0.16, 0.14], mast: 6 });

      // --- s 0.04 R — Variante del Rettifilo chicane: kerb + gravel slab ---
      groundPlane(K(0.04), 1, 5, [22, 28], [0.78, 0.70, 0.52]);   // gravel trap tan
      billboard(K(0.04), 1, 8, 12, 5, [0.86, 0.84, 0.80]);

      // --- s 0.40 R far — Park lake (Villa Reale pond), reflective blue slab ---
      groundPlane(K(0.40), 1, 95, [180, 230], [0.30, 0.50, 0.70]);
      // second smaller ornamental lake on the left earlier in the lap
      groundPlane(K(0.24), -1, 90, [140, 170], [0.28, 0.48, 0.68]);

      // --- s 0.55 L far — old Sopraelevata banking ruin in the park backdrop ---
      // Weathered grey concrete + moss-green tilted ramp boxes as a ridge/prism row.
      for (let i = 0; i < 5; i++) {
        const k = K(0.50 + i * 0.018);
        backdrop(k, -1, 110 + i * 12, [34, 14 + (i % 2) * 4, 64], [0.62, 0.60, 0.58]);
        backdrop(k, -1, 150 + i * 12, [30, 9, 60], [0.35, 0.45, 0.30]);   // moss-green
      }

      // --- s 0.62 R far — glimpse of Villa Reale, cream neoclassical block ---
      building(K(0.62), 1, 100, 60, 26, 30, { wall: [0.86, 0.80, 0.66], window: [0.70, 0.64, 0.50] });

      // --- s 0.78 L+R — Variante Ascari chicane: gravel run-offs ---
      groundPlane(K(0.78), -1, 6, [26, 34], [0.78, 0.70, 0.52]);
      groundPlane(K(0.79), 1, 6, [24, 30], [0.78, 0.70, 0.52]);

      // --- s 0.90 L — Parabolica / Curva Alboreto: wide outer gravel slab ---
      groundPlane(K(0.90), -1, 8, [40, 90], [0.78, 0.70, 0.52]);

      // --- s 0.96 R far — distant low Milan skyline cluster ---
      const kmilan = K(0.96);
      for (let i = 0; i < 6; i++) {
        building(kmilan, 1, 210 + i * 26, 16, 34 + i * 9, 16,
          { wall: [0.60 + i * 0.02, 0.64 + i * 0.02, 0.70 + i * 0.02], window: [0.50, 0.54, 0.60] });
      }
      // --- CONTINUOUS royal-park forest backdrop ringing the WHOLE lap ---
      // Flat parkland: a LOW, dense, gapless green treeline band on the horizon
      // (no tall mountains). Built as overlapping ridge prisms in concentric rings
      // so the canopy reads as one unbroken forest wall all the way around.
      const cx = px.reduce((a, b) => a + b, 0) / n, cz = pz.reduce((a, b) => a + b, 0) / n;
      let rad = 0;
      for (let i = 0; i < n; i++) rad = Math.max(rad, Math.hypot(px[i] - cx, pz[i] - cz));
      // [extraRadius, count, ridgeLen, ridgeW, hMin, hVar, colour]
      for (const [extra, count, len, w, hMin, hVar, col] of [
        [150, 46, 96, 26, 9,  5, [0.16, 0.36, 0.20]],   // near treeline, taller, gapless
        [215, 40, 112, 30, 11, 7, [0.13, 0.33, 0.17]],  // mid forest band
        [285, 34, 134, 34, 13, 8, [0.11, 0.30, 0.15]],  // far hazed forest wall
      ]) {
        for (let i = 0; i < count; i++) {
          const a = i / count * 6.2832, h = hash(i * 7 + extra);
          const r = rad + extra + h * 30;
          const tx = cx + Math.cos(a) * r, tz = cz + Math.sin(a) * r;
          if (onTrack(tx, tz, 30)) continue;
          ridge(tx, tz, pyMin, a + 1.5708, len, w, hMin + h * hVar, col);
        }
      }
      // Scatter individual pine silhouettes along the near ring to break the
      // ridge tops into a tree-textured canopy edge (still low, flat parkland).
      for (let i = 0; i < 20; i++) {
        const a = i / 20 * 6.2832, h = hash(i * 11 + 5);
        const r = rad + 120 + h * 60;
        const tx = cx + Math.cos(a) * r, tz = cz + Math.sin(a) * r;
        if (onTrack(tx, tz, 30)) continue;
        ridge(tx, tz, pyMin, a, 22, 22, 16 + h * 10, [0.10, 0.28, 0.14]);
      }
    },
  }
  );
})();
