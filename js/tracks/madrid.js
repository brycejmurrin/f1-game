/* Apex 26 — MADRID circuit definition (data only).
   Registered on the global TrackDefs list; consumed by the js/tracks.js engine
   (palette resolved there from `night`, geometry from js/circuits.js or `segs`). */
(function () {
  "use strict";
  (window.TrackDefs = window.TrackDefs || []).push(
  {
    id: "madrid",
    name: "MADRID",
    gp: "Spanish GP",
    country: "Spain",
    night: false,
    theme: "modern",
    lengthKm: 5.5,
    baseHW: 7,
    // La Monumental: the signature ~24% banked stadium curve.
    banked: true,
    street: true,
    pal: { zenith: [0.24, 0.46, 0.78], horizon: [0.74, 0.74, 0.72], grass: [0.3, 0.42, 0.2], sunDir: [0.12094709553657013, 0.967576764292561, 0.22173634181704524], sun: [1, 0.99, 0.96], sunColor: [1, 0.98, 0.94] },
    segs: [
      { t: 0, l: 320 }, { t: 70, l: 70 }, { t: -65, l: 70 }, { t: 50, l: 120 }, { t: 0, l: 360 }, { t: 90, l: 80 },
      { t: -85, l: 70 }, { t: 90, l: 80 }, { t: 0, l: 140 }, { t: 180, l: 240, b: 0.42, w: 9 }, { t: 0, l: 80 }, { t: -60, l: 90, h: 6 },
      { t: 70, l: 90, h: -4 }, { t: -50, l: 80 }, { t: 80, l: 90 }, { t: 60, l: 130 },
    ],
    // ~26 m of relief: climb toward the high point at Turn 7, drop back to the pits.
    elevations: [{ s: 0.60, halfM: 300, rise: 12 }, { s: 0.85, halfM: 200, rise: -6 }],
    scenery: function (api) {
      const { out, n, px, py, pz, hw, pyMin, place, prop, hash, onTrack,
              mountain, grandstand, building, tower, tree, bush } = api;

      const WHITE = [0.90, 0.92, 0.94], GLASS = [0.62, 0.74, 0.82];
      const CONCRETE = [0.74, 0.75, 0.77], OLIVE = [0.42, 0.48, 0.30];

      // --- Sierra de Guadarrama: organic mountain RING pushed well out (centre-based) ---
      let cx = 0, cz = 0;
      for (let i = 0; i < n; i++) { cx += px[i]; cz += pz[i]; }
      cx /= n; cz /= n;
      let rad = 0;
      for (let i = 0; i < n; i++) rad = Math.max(rad, Math.hypot(px[i] - cx, pz[i] - cz));
      for (const [extra, wMin, hMin, count, col] of [
        [300, 220, 70, 24, [0.50, 0.55, 0.60]],   // near hazed ridge
        [560, 320, 150, 20, [0.55, 0.60, 0.66]],  // far high Sierra (snow-capped)
      ]) {
        const ring = rad + extra;
        for (let i = 0; i < count; i++) {
          const a = i / count * 6.2832, h = hash(i * 7 + extra);
          mountain(cx + Math.cos(a) * ring, cz + Math.sin(a) * ring, pyMin,
                   wMin + h * 120, hMin + h * 90,
                   { seed: i * 13 + extra, snowline: 0.75, rock: col,
                     forest: [0.40, 0.42, 0.38] });
        }
      }

      // --- La Monumental: the hero banked stadium curve, tall grandstands wrapping ~270° ---
      const kmono = Math.round(n * 0.75) % n;
      for (let i = -7; i <= 7; i++) {
        const k = ((kmono + i * Math.round(n / 40)) % n + n) % n;
        // tall tiered stands encircling the banked turn (both sides → wrap)
        grandstand(k / n, 1, 7, 30, [0.86, 0.87, 0.90], [0.50, 0.30, 0.30]);
        if (i % 2 === 0) grandstand(k / n, -1, 9, 30, [0.86, 0.87, 0.90], [0.52, 0.32, 0.32]);
      }
      // Monumental light towers — thin tall grey poles with bright caps
      for (let i = -6; i <= 6; i += 3) {
        const k = ((kmono + i * Math.round(n / 40)) % n + n) % n;
        tower(k, 1, hw[k] + 50, 3.2, 40, { col: [0.42, 0.43, 0.46], cap: true, capCol: [0.96, 0.96, 0.92] });
        tower(k, -1, hw[k] + 50, 3.2, 40, { col: [0.42, 0.43, 0.46], cap: true, capCol: [0.96, 0.96, 0.92] });
      }

      // --- IFEMA exhibition halls: huge clean white masses + glass window bands (≥150 m out) ---
      for (const [frac, side, w, h, d] of [
        [0.02, 1, 70, 18, 90], [0.02, -1, 64, 16, 80], [0.05, 1, 80, 16, 70],
      ]) {
        const k = Math.round(frac * n) % n;
        building(k, side, 160, w, h, d, { wall: WHITE, window: GLASS, floor: 5 });
      }
      // Modern IFEMA grandstands (s≈0.90) — white-shelled stepped stands
      for (const frac of [0.90, 0.92]) {
        grandstand(frac, 1, 10, 36, WHITE, [0.50, 0.30, 0.30]);
      }
      // Main grandstand + pit straight white stands (s≈0.00)
      grandstand(0.0, 1, 11, 44, WHITE, [0.48, 0.30, 0.30]);

      // --- Dry Castilian plains: straw-tan ground filler with sparse olive scrub ---
      const TAN = [0.78, 0.70, 0.48];
      for (let i = 0; i < n; i += 2) {
        for (const side of [-1, 1]) {
          if (hash(i * 31 + side) > 0.5) continue;
          const d = 26 + hash(i * 17 + side) * 70;
          const mx = px[i], mz = pz[i];
          if (onTrack(mx, mz, 18)) continue;
          // dry ground patch
          place(i, side, d, [6, 0.4, 6], TAN);
          const r = hash(i * 41 + side);
          if (r < 0.4) bush(i, side, d, OLIVE);
          else if (r < 0.7) tree(i, side, d + 3, 6 + hash(i * 53) * 5, OLIVE);
        }
      }

      // --- Concrete barrier furniture on the street sectors (low pale-grey posts) ---
      for (let i = 0; i < n; i += 5) {
        if (hash(i * 7) > 0.6) continue;
        place(i, 1, 1.5, [0.4, 1.0, 4.0], CONCRETE);
        place(i, -1, 1.5, [0.4, 1.0, 4.0], CONCRETE);
      }
    },
  }
  );
})();
