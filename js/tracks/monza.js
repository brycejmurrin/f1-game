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
    pal: { zenith: [0.22, 0.42, 0.72], horizon: [0.7, 0.74, 0.7], grass: [0.2, 0.44, 0.18], sunDir: [0.8045379567659121, 0.5436067275445352, 0.2391869601195955], sun: [1, 0.88, 0.6], sunColor: [1, 0.86, 0.58] },
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
      // Tall narrow Italian umbrella pines lining the park nearly the whole lap.
      every(26, (k) => {
        const h = hash(k * 31);
        if (h < 0.30) return;                       // gaps for breathing room
        const side = h < 0.62 ? -1 : 1;
        const d = 11 + h * 7;
        // pine() = tapered trunk + 3 stacked cones; tall + slim for umbrella look.
        pine(k, side, d, 20 + h * 12, [0.10, 0.30, 0.14]);
        if (h > 0.78) pine(k, -side, d + 4, 17 + h * 9, [0.09, 0.27, 0.13]);
      });
      // Sunlit broadleaf verge trees scattered between the pines.
      every(70, (k) => {
        const h = hash(k * 53 + 9);
        if (h < 0.5) return;
        tree(k, h < 0.75 ? -1 : 1, 14 + h * 8, 12 + h * 6, [0.18, 0.45, 0.20]);
      });
      // Clipped park treeline / hedge banding the Curva Grande sweep both sides.
      hedge(0.08, 0.16, -1, 22, 7, [0.12, 0.33, 0.16]);
      hedge(0.08, 0.16,  1, 22, 7, [0.12, 0.33, 0.16]);

      // --- s 0.00 L — Tribuna Centrale main grandstand on the pit straight ---
      grandstand(0.005, -1, 9, 150, [0.55, 0.58, 0.62], [0.74, 0.30, 0.26]);
      grandstand(0.965, -1, 9, 90, [0.55, 0.58, 0.62], [0.70, 0.28, 0.24]);
      // red trim row fronting the stand
      prop(K(0.01), -1, 7, [3, 2, 120], [0.78, 0.18, 0.16]);

      // --- s 0.00 R — pit wall + slim white podium tower with red cap ---
      tower(K(0.0), 1, 12, 6, 44, { col: [0.90, 0.90, 0.88], cap: true, capCol: [0.78, 0.16, 0.14], mast: 6 });

      // --- s 0.04 R — Variante del Rettifilo chicane: kerb + gravel slab ---
      groundPlane(K(0.04), 1, 5, [22, 28], [0.78, 0.70, 0.52]);   // gravel trap tan
      billboard(K(0.04), 1, 6, 12, 5, [0.86, 0.84, 0.80]);

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
      // A faint distant treeline ringing the park (flat backdrop, not mountains).
      const cx = px.reduce((a, b) => a + b, 0) / n, cz = pz.reduce((a, b) => a + b, 0) / n;
      let rad = 0;
      for (let i = 0; i < n; i++) rad = Math.max(rad, Math.hypot(px[i] - cx, pz[i] - cz));
      for (let i = 0; i < 40; i++) {
        const a = i / 40 * 6.2832, r = rad + 200 + hash(i * 7) * 40;
        const tx = cx + Math.cos(a) * r, tz = cz + Math.sin(a) * r;
        if (onTrack(tx, tz, 30)) continue;
        ridge(tx, tz, pyMin, a + 1.5708, 80, 30, 12 + hash(i * 13) * 8, [0.14, 0.34, 0.18]);
      }
    },
  }
  );
})();
