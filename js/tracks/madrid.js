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
      const { out, track, def, theme, pal, n, ds, px, py, pz, hw, pyMin, place, prop, backdrop, groundPlane, groundYAt, addBox, every, onTrack, ferrisWheel, hash, upOf, cross, norm, lerp } = api;
        const kmono = Math.round(n * 0.65) % n;
        const kmr = [track.rx[kmono], track.ry[kmono], track.rz[kmono]];
        const kmu = upOf(track, kmono);
        for (let i = -3; i <= 3; i++) {
          const k = (kmono + i * Math.round(n / 20)) % n;
          // oriented + cleared so the white grandstand wraps the banked turn
          // alongside it instead of cutting across the apex (near face was ~2m in)
          prop(k, 1, 8, [10, 16, 26], [0.88, 0.88, 0.92]);
        }
        // Sierra mountain backdrop
        const kmtn = Math.round(n * 0.4) % n;
        const kmtnr = [track.rx[kmtn], track.ry[kmtn], track.rz[kmtn]];
        for (let i = 0; i < 4; i++) {
          const mtn_d = 280 + i * 60;
          const mx = px[kmtn] + kmtnr[0] * mtn_d, mz = pz[kmtn] + kmtnr[2] * mtn_d;
          if (onTrack(mx, mz, 155)) continue;
          addBox(out, [mx, py[kmtn] + 50, mz], [300, 100, 200], [0.5, 0.48, 0.52]);
        }
        // Spanish plains vegetation filler
        every(40, (k) => {
          for (const side of [-1, 1]) {
            if (hash(k * 57 + side) > 0.45) continue;
            const d = 30 + hash(k * 58 + side) * 50;
            const s = hash(k * 59 + side);
            const h = 5 + s * 5;
            place(k, side, d, [1.6, 1.6, 1.6], [0.30, 0.22, 0.12]);
            place(k, side, d, [3.5, h, 3.5], [0.26, 0.36, 0.16]);
          }
        });
        // Light towers (occasional)
        every(180, (k) => {
          const side = hash(k * 61) < 0.3 ? -1 : 1;
          place(k, side, hw[k] + 65, [1.8, 32, 1.8], [0.40, 0.40, 0.43]);
        });

      // Sierra de Guadarrama distant mountains
      for (let i = 0; i < 4; i++) {
        const k = Math.round((i / 4) * n) % n;
        const r = [track.rx[k], track.ry[k], track.rz[k]];
        const mtn_d = 280 + i * 60;
        const mx = px[k] + r[0] * mtn_d, mz = pz[k] + r[2] * mtn_d;
        if (onTrack(mx, mz, 155)) continue;
        addBox(out, [mx, py[k] + 50, mz], [300, 100, 200], [0.5, 0.48, 0.52]);  // distant mountains
      }
      // Spanish plains vegetation
      every(25, (k) => {
        for (const side of [-1, 1]) {
          const d = 120 + hash(k * side) * 60;
          place(k, side, d, [1.8, 1.8, 1.8], [0.32, 0.24, 0.14]);
          place(k, side, d, [3.8, 6 + hash(k) * 5, 3.8], [0.28, 0.38, 0.18]);
        }
      });
      // IFEMA-style modern grandstands with clean white roofs at key corners
      for (const frac of [0.14, 0.38, 0.82]) {
        const k = Math.round(frac * n) % n;
        const side = hash(k * 5) < 0.5 ? -1 : 1;
        prop(k, side, 10, [9, 11, 32], [0.80, 0.82, 0.86]);  // white shell
        prop(k, side, 8,  [9, 6, 30], [0.55, 0.30, 0.30]);   // crowd
        prop(k, side, 9,  [11, 2, 34], [0.90, 0.92, 0.95]);  // roof canopy
      }
    },
  }
  );
})();
