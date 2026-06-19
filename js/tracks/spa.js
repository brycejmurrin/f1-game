/* Apex 26 — SPA circuit definition (data only).
   Registered on the global TrackDefs list; consumed by the js/tracks.js engine
   (palette resolved there from `night`, geometry from js/circuits.js or `segs`). */
(function () {
  "use strict";
  (window.TrackDefs = window.TrackDefs || []).push(
  {
    id: "spa",
    name: "SPA",
    gp: "Belgian GP",
    country: "Belgium",
    night: false,
    theme: "green",
    lengthKm: 7,
    baseHW: 8,
    pal: { zenith: [0.34, 0.44, 0.56], horizon: [0.6, 0.65, 0.66], grass: [0.12, 0.34, 0.14], runoff: [0.4, 0.4, 0.4], fog: [0.66, 0.7, 0.72], fogDensity: 0.0026, sunDir: [0.7141470886878855, 0.44326371022006683, 0.5417667569356373], sun: [0.98, 0.84, 0.64], sunColor: [0.9, 0.8, 0.62] },
    segs: [
      { t: 0, l: 120 }, { t: 170, l: 80, h: -4 }, { t: 0, l: 140, h: -18 }, { t: -40, l: 60, h: 6 }, { t: 50, l: 60, h: 14 }, { t: -30, l: 80, h: 16 },
      { t: 0, l: 480, h: 18 }, { t: 70, l: 90 }, { t: -60, l: 90, h: -6 }, { t: 50, l: 140, h: -12 }, { t: -90, l: 160, h: -10 }, { t: 40, l: 90 },
      { t: -50, l: 90 }, { t: 70, l: 110 }, { t: 0, l: 320, h: -6 }, { t: -30, l: 180 }, { t: 80, l: 70 }, { t: -85, l: 70 },
      { t: 30, l: 120 },
    ],
    // Eau Rouge dip, the Raidillon/Kemmel climb (the calendar's biggest, ~100 m
    // top-to-bottom), then the long descent back through the second sector.
    elevations: [{ s: 0.10, halfM: 280, rise: -6 }, { s: 0.17, halfM: 440, rise: 16 }, { s: 0.46, halfM: 520, rise: -8 }],
    scenery: function (api) {
      const { out, n, px, pz, pyMin, hash, every, prop, place, backdrop,
              addBox, vadd, anchor, mountain, pine, grandstand, building, marshalPost } = api;

      // --- Encircling Ardennes mountains: a near forested range with light snow
      // only on the highest tops, and a far hazed range. Centre-based ring so the
      // forested peaks sit on the horizon, not scattered across the infield.
      let cx = 0, cz = 0;
      for (let i = 0; i < n; i++) { cx += px[i]; cz += pz[i]; }
      cx /= n; cz /= n;
      let rad = 0;
      for (let i = 0; i < n; i++) rad = Math.max(rad, Math.hypot(px[i] - cx, pz[i] - cz));
      // Three concentric rings of organic peaks. Each ring is densely packed and
      // angularly offset from its neighbours so the summits OVERLAP into one
      // continuous forested wall with no gaps anywhere around the lap. Low `seg`
      // keeps each peak cheap so we can afford many. Snow only on the far tops.
      const ranges = [
        // near forested wall — wMin/wVar sized so max(w)*0.62 < extra-8 (guard won't fire)
        { extra: 280, wMin: 160, hMin: 56, hVar: 54, wVar: 80, count: 32, phase: 0.0,
          opts: { seg: 7, rough: 0.30, forest: [0.10, 0.32, 0.14], rock: [0.28, 0.32, 0.28], snow: [0.90, 0.93, 0.96], snowline: 1.2 } },
        // mid forested wall — offset to fill the seams of the near ring
        { extra: 290, wMin: 340, hMin: 92, hVar: 70, wVar: 150, count: 26, phase: 0.5,
          opts: { seg: 7, rough: 0.32, forest: [0.13, 0.36, 0.17], rock: [0.34, 0.38, 0.36], snow: [0.90, 0.93, 0.96], snowline: 0.92 } },
        // far hazed range — paler damp grey-green, light snow on the very tops
        { extra: 450, wMin: 380, hMin: 132, hVar: 110, wVar: 150, count: 22, phase: 0.0,
          opts: { seg: 7, rough: 0.34, forest: [0.18, 0.42, 0.20], rock: [0.46, 0.50, 0.50], snow: [0.92, 0.94, 0.97], snowline: 0.78 } },
      ];
      for (const rg of ranges) {
        const ring = rad + rg.extra;
        for (let i = 0; i < rg.count; i++) {
          const a = (i + rg.phase + rg.extra * 0.004) / rg.count * 6.2832, h = hash(i * 7 + rg.extra);
          // jitter the radius inward/outward so the wall has depth but never opens a gap
          const rr = ring - rg.wMin * 0.18 + hash(i * 5 + rg.extra) * rg.wMin * 0.30;
          mountain(cx + Math.cos(a) * rr, cz + Math.sin(a) * rr, pyMin,
                   rg.wMin + h * rg.wVar, rg.hMin + h * rg.hVar, Object.assign({ seed: i * 13 + rg.extra }, rg.opts));
        }
      }

      // --- Forested ridgelines settling behind the trackside treeline.
      every(64, (k) => {
        for (const side of [-1, 1]) {
          backdrop(k, side, 150 + hash(k * 13 + side) * 110, [200, 46, 200], [0.13, 0.30, 0.16]);
        }
      });

      // --- Dense Ardennes pine forest walling both sides of the track. Tighter
      // spacing and a low skip threshold so the woodland is continuous; a second
      // deeper rank thickens the wall behind the front line.
      every(44, (k) => {
        for (const side of [-1, 1]) {
          const s = hash(k * 41 + side);
          if (s < 0.26) continue;
          const dist = 8 + s * 20, h = 9 + s * 9;
          pine(k, side, dist, h, [0.09 + s * 0.05, 0.30, 0.14]);
          if (s > 0.70) pine(k, side, dist + 12 + s * 16, h + 3, [0.11 + s * 0.05, 0.28, 0.13]);
        }
      });
      // Fill the sparse stretches: a staggered front-line rank offset from the above.
      every(64, (k) => {
        for (const side of [-1, 1]) {
          const s = hash(k * 67 + side * 5 + 3);
          if (s < 0.58) continue;
          const dist = 6 + s * 10, h = 8 + s * 7;
          pine(k, side, dist, h, [0.10 + s * 0.04, 0.31, 0.15]);
        }
      });
      // Hero density at Eau Rouge / Raidillon (s≈0.05–0.10): crowd the climb with pines.
      every(12, (k) => {
        const s = k / n;
        if (s < 0.045 || s > 0.12) return;
        for (const side of [-1, 1]) {
          const r = hash(k * 53 + side);
          pine(k, side, 7 + r * 10, 10 + r * 10, [0.08 + r * 0.05, 0.31, 0.15]);
          if (r > 0.5) pine(k, side, 20 + r * 18, 13 + r * 9, [0.10 + r * 0.04, 0.28, 0.13]);
        }
      });

      // --- Modern pit/paddock building: long low white-grey mass on the pit straight.
      building(0, -1, 9, 14, 11, 64, { wall: [0.90, 0.91, 0.93], window: [0.40, 0.46, 0.50], floor: 5 });
      {
        // Thin cantilever roof blade over the pit lane.
        const a = anchor(0, -1, 20);
        addBox(out, vadd(a.c, a.u, 12.5), [16, 0.8, 60], [0.82, 0.84, 0.88], [a.r, a.u, a.t]);
      }
      // Lone weathered old pit building on the original Kemmel straight (s≈0.10, far left).
      building(Math.round(n * 0.10) % n, -1, 40, 12, 9, 40, { wall: [0.74, 0.72, 0.66], window: [0.34, 0.34, 0.32], floor: 4 });

      // --- Grandstands: La Source, Eau Rouge, Les Combes, Bus Stop, pit straight.
      const shell = [0.42, 0.43, 0.47];
      grandstand(0.00, 1, 8, 40, shell, [0.50, 0.52, 0.56]);   // main grandstand, pit straight
      grandstand(0.02, 1, 8, 26, shell, [0.62, 0.16, 0.16]);   // La Source hairpin
      grandstand(0.07, 1, 8, 28, shell, [0.20, 0.36, 0.62]);   // Eau Rouge / Raidillon
      grandstand(0.16, 1, 8, 30, shell, [0.50, 0.52, 0.56]);   // Les Combes
      grandstand(0.92, 1, 8, 28, shell, [0.46, 0.48, 0.52]);   // Bus Stop chicane

      // --- Yellow-capped marshal posts dotted around the lap.
      every(120, (k) => {
        const side = hash(k * 33) < 0.5 ? -1 : 1;
        marshalPost(k, side, 4);
      });
      // Extra marshal posts flanking pit entry (s≈0.97).
      marshalPost(Math.round(n * 0.97) % n, -1, 4);
      marshalPost(Math.round(n * 0.97) % n, 1, 4);

      // --- Eau Rouge: low concrete runoff wall boxes at the valley base (s≈0.06, left).
      {
        const kw = Math.round(n * 0.06) % n;
        place(kw, -1, 4, [1.0, 1.4, 22], [0.55, 0.55, 0.52]);
      }
    },
  }
  );
})();
