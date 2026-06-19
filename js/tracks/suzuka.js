/* Apex 26 — SUZUKA circuit definition (data only).
   Registered on the global TrackDefs list; consumed by the js/tracks.js engine
   (palette resolved there from `night`, geometry from js/circuits.js or `segs`). */
(function () {
  "use strict";
  (window.TrackDefs = window.TrackDefs || []).push(
  {
    id: "suzuka",
    name: "SUZUKA",
    gp: "Japanese GP",
    country: "Japan",
    night: false,
    theme: "green",
    lengthKm: 5.8,
    baseHW: 7,
    pal: { zenith: [0.28, 0.46, 0.72], horizon: [0.74, 0.74, 0.8], grass: [0.2, 0.44, 0.2], sunDir: [0.8846517369293829, 0.44232586846469146, 0.14744195615489716], sun: [1, 0.84, 0.58], sunColor: [1, 0.82, 0.55] },
    segs: [
      { t: 0, l: 440, h: -6 }, { t: 50, l: 120 }, { t: -35, l: 100, h: 6 }, { t: 45, l: 110, h: 6 }, { t: -30, l: 100, h: 4 }, { t: 55, l: 120 },
      { t: 60, l: 110 }, { t: 80, l: 120, h: -4 }, { t: 70, l: 120, h: -6 }, { t: 0, l: 300 }, { t: 45, l: 120, h: 6 }, { t: -20, l: 90 },
      { t: 40, l: 140 },
    ],
    // Rolling esses climb then the drop toward the Degners (~40 m of relief over
    // the lap). Kept clear of the figure-8 crossover at s≈0.81 (that's a bridge).
    elevations: [{ s: 0.20, halfM: 300, rise: 7 }, { s: 0.45, halfM: 260, rise: -5 }],
    bridges: [{ s: 0.811, halfM: 150, rise: 7 }],
    scenery: function (api) {
      const { out, track, def, theme, pal, n, ds, px, py, pz, hw, pyMin, place, prop, backdrop, groundPlane, groundYAt, addBox, every, onTrack, ferrisWheel, hash, upOf, cross, norm, lerp } = api;
            // Mt. Fuji silhouette (very distant, large)
            const kfuji = Math.round(n * 0.3) % n;
            const kfr = [track.rx[kfuji], track.ry[kfuji], track.rz[kfuji]];
            addBox(out, [px[kfuji] + kfr[0] * 400, py[kfuji] + 80, pz[kfuji] + kfr[2] * 400],
                   [180, 160, 120], [0.6, 0.58, 0.62]);  // Mount Fuji distant peak
            // Japanese countryside hills
            for (let i = 0; i < 4; i++) {
              const k = Math.round((i / 4) * n) % n;
              const r = [track.rx[k], track.ry[k], track.rz[k]];
              for (const side of [-1, 1]) {
                const hx = px[k] + r[0] * side * 240, hz = pz[k] + r[2] * side * 240;
                if (onTrack(hx, hz, 90)) continue;  // figure-8 crossover loops back near itself
                addBox(out, [hx, py[k] + 20, hz], [160, 40, 240], [0.3, 0.38, 0.24]);  // green hills
              }
            }

      ferrisWheel(Math.round(n * 0.06) % n, 1, 40, 24);

            // Sakura (cherry blossom) trees scattered among the green zones
            every(55, (k) => {
              const s = hash(k * 41);
              if (s < 0.45) return;
              const side = s < 0.72 ? -1 : 1, d = 11 + s * 7;
              place(k, side, d, [1.1, 1.3, 1.1], [0.32, 0.22, 0.12]);
              place(k, side, d, [3.8, 3.5 + s * 2, 3.8], [0.92, 0.55, 0.64]);
            });
            // Theme park area beside ferris wheel (recreational buildings)
            const ktp = Math.round(n * 0.05) % n;
            const ktpr = [track.rx[ktp], track.ry[ktp], track.rz[ktp]];
            for (let i = 0; i < 4; i++) {
              const h = 8 + i * 3, d = 60 + i * 12;
              addBox(out, [px[ktp] + ktpr[0] * d, py[ktp] + h / 2, pz[ktp] + ktpr[2] * d],
                     [24 + i * 6, h, 28], [0.6 + i * 0.05, 0.45 + i * 0.08, 0.3 + i * 0.04]);
            }
            // Grandstands at the Esses and the Spoon (always packed at Suzuka)
            for (const frac of [0.16, 0.40, 0.62, 0.84]) {
              const k = Math.round(frac * n) % n;
              const side = hash(k * 5) < 0.5 ? -1 : 1;
              prop(k, side, 9, [8, 9, 28], [0.42, 0.42, 0.48]);
              prop(k, side, 7, [8, 5, 26], [0.30, 0.40, 0.62]);   // blue-clad fans
            }
            // Forested Mie-prefecture hills beyond the park
            every(70, (k) => {
              for (const side of [-1, 1]) {
                backdrop(k, side, 200 + hash(k * 6 + side) * 100, [180, 44, 180], [0.18, 0.32, 0.20]);
              }
            });
    },
  }
  );
})();
