/* Apex 26 — RED BULL RING circuit definition (data only).
   Registered on the global TrackDefs list; consumed by the js/tracks.js engine
   (palette resolved there from `night`, geometry from js/circuits.js or `segs`). */
(function () {
  "use strict";
  (window.TrackDefs = window.TrackDefs || []).push(
  {
    id: "redbull",
    name: "RED BULL RING",
    gp: "Austrian GP",
    country: "Austria",
    night: false,
    theme: "green",
    lengthKm: 4.3,
    baseHW: 7,
    pal: { zenith: [0.26, 0.46, 0.8], horizon: [0.66, 0.76, 0.86], grass: [0.22, 0.52, 0.18], runoff: [0.42, 0.38, 0.3], fogDensity: 0.0012, sunDir: [0.59693248550091, 0.6446870843409829, 0.47754598840072804], sun: [1, 0.94, 0.82], sunColor: [1, 0.92, 0.8] },
    segs: [
      { t: 0, l: 280 }, { t: -90, l: 100, h: 12 }, { t: 90, l: 90 }, { t: -100, l: 110, h: 8 }, { t: 80, l: 90 }, { t: 0, l: 220, h: -10 },
      { t: -70, l: 80 }, { t: 80, l: 90 }, { t: 0, l: 480, h: -10 }, { t: 80, l: 100 }, { t: -60, l: 80 }, { t: 80, l: 90 },
    ],
    // Steep alpine circuit (~65 m top-to-bottom): climb out of Turn 1, long
    // descent through the back of the lap.
    elevations: [{ s: 0.10, halfM: 240, rise: 10 }, { s: 0.40, halfM: 320, rise: -8 }],
    scenery: function (api) {
      const { out, n, px, pz, pyMin, hash, every, prop, addBox, vadd, mountain, pine, grandstand, anchor } = api;

      // --- Styrian Alps: an unbroken ring wrapping the whole lap. A forested near
      // range (light snow on the tops) and a far range of snow-capped grey-blue
      // peaks. Overlapping organic colour-zoned summits, neighbours touching so the
      // wall reads as continuous with no gaps. Lower seg keeps the vert budget sane
      // across many more peaks.
      let cx = 0, cz = 0;
      for (let i = 0; i < n; i++) { cx += px[i]; cz += pz[i]; }
      cx /= n; cz /= n;
      let rad = 0;
      for (let i = 0; i < n; i++) rad = Math.max(rad, Math.hypot(px[i] - cx, pz[i] - cz));
      const ranges = [
        { extra: 150, wMin: 230, hMin: 64, hVar: 64, count: 44, seg: 8, opts: { forest: [0.18, 0.34, 0.20], rock: [0.34, 0.34, 0.30], snow: [0.92, 0.94, 0.98], snowline: 0.82 } },
        { extra: 360, wMin: 300, hMin: 130, hVar: 90,  count: 40, seg: 8, opts: { forest: [0.24, 0.38, 0.30], rock: [0.46, 0.48, 0.50], snow: [0.94, 0.95, 0.99], snowline: 0.58 } },
        { extra: 560, wMin: 360, hMin: 180, hVar: 120, count: 34, seg: 7, opts: { forest: [0.30, 0.42, 0.38], rock: [0.52, 0.54, 0.56], snow: [0.95, 0.96, 1.0], snowline: 0.46 } },
      ];
      for (const rg of ranges) {
        const ring = rad + rg.extra;
        // chord spacing between neighbours; widen each peak so feet overlap.
        const span = 2 * Math.PI * ring / rg.count;
        for (let i = 0; i < rg.count; i++) {
          const h = hash(i * 7 + rg.extra), j = hash(i * 19 + rg.extra + 3);
          const a = (i + (j - 0.5) * 0.35) / rg.count * 6.2832;   // jittered angle for an organic skyline
          const w = Math.max(rg.wMin + h * 130, span * 1.55);     // ensure neighbours touch
          mountain(cx + Math.cos(a) * ring, cz + Math.sin(a) * ring, pyMin,
                   w, rg.hMin + h * rg.hVar, Object.assign({ seg: rg.seg, seed: i * 13 + rg.extra }, rg.opts));
        }
      }

      // --- Dense pine forest lining the descending mid-sector (~2x).
      every(9, (k) => {
        const s = hash(k * 41);
        if (s < 0.22) return;
        pine(k, s < 0.6 ? -1 : 1, 7 + s * 11, 9 + s * 8, [0.13 + s * 0.05, 0.30, 0.15]);
        const s2 = hash(k * 67 + 5);
        if (s2 > 0.5) pine(k, s2 < 0.75 ? -1 : 1, 16 + s2 * 16, 8 + s2 * 7, [0.12 + s2 * 0.06, 0.29, 0.14]);
      });

      // --- The Wing (pit/paddock): long low white slab + a thin floating roof blade.
      prop(0, -1, 6, [11, 8, 64], [0.92, 0.93, 0.95]);
      {
        const a = anchor(0, -1, 10);
        addBox(out, vadd(a.c, a.u, 11), [13, 0.7, 60], [0.86, 0.88, 0.92], [a.r, a.u, a.t]);
      }

      // --- Charging-bull statue on a green hillside above the lower sector.
      {
        const kb = Math.round(n * 0.10) % n, a = anchor(kb, -1, 60);
        addBox(out, vadd(vadd(a.c, a.r, -8), a.u, 9), [2.5, 18, 2.5], [0.85, 0.85, 0.88], [a.r, a.u, a.t]);   // arch posts
        addBox(out, vadd(vadd(a.c, a.r, 8), a.u, 9), [2.5, 18, 2.5], [0.85, 0.85, 0.88], [a.r, a.u, a.t]);
        addBox(out, vadd(a.c, a.u, 18), [20, 2.5, 4], [0.85, 0.85, 0.88], [a.r, a.u, a.t]);                   // lintel
        addBox(out, vadd(a.c, a.u, 4), [11, 6, 4], [0.12, 0.12, 0.14], [a.r, a.u, a.t]);                      // bull body
        addBox(out, vadd(vadd(a.c, a.t, 5.5), a.u, 5.5), [4, 4, 3], [0.12, 0.12, 0.14], [a.r, a.u, a.t]);     // head
      }

      // --- Red Bull-branded grandstands at the start, T3 crest and stadium bowl.
      const rbRed = [0.82, 0.10, 0.16], rbNavy = [0.10, 0.14, 0.40], shell = [0.40, 0.41, 0.46];
      grandstand(0.00, 1, 8, 36, shell, rbRed);
      grandstand(0.06, 1, 9, 24, shell, rbNavy);
      grandstand(0.22, 1, 8, 26, shell, rbNavy);
      grandstand(0.28, 1, 9, 22, shell, rbRed);
      grandstand(0.50, -1, 8, 24, shell, rbNavy);
      grandstand(0.70, -1, 8, 26, shell, rbRed);
      grandstand(0.76, -1, 9, 22, shell, rbNavy);
      grandstand(0.95, 1, 8, 32, shell, rbNavy);
      grandstand(0.90, 1, 9, 24, shell, rbRed);
    },
  }
  );
})();
