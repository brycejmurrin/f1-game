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
      const { out, track, def, theme, pal, n, ds, px, py, pz, hw, pyMin, place, prop, backdrop, groundPlane, groundYAt, addBox, every, onTrack, ferrisWheel, hash, upOf, cross, norm, lerp } = api;
      // Park lakes
      for (let i = 0; i < 4; i++) {
        const k = Math.round((i / 4) * n) % n;
        const r = [track.rx[k], track.ry[k], track.rz[k]];
        const lx = px[k] + r[0] * (hw[k] + 120), lz = pz[k] + r[2] * (hw[k] + 120);
        if (onTrack(lx, lz, 95)) continue;  // keep the 180m water slab off parallel sections
        addBox(out, [lx, pyMin - 3, lz], [180, 1.6, 240], [0.1, 0.24, 0.4]);  // lake water
      }
      // Distant Milan towers
      const kmilan = Math.round(n * 0.4) % n;
      const kmr = [track.rx[kmilan], track.ry[kmilan], track.rz[kmilan]];
      for (let i = 0; i < 5; i++) {
        const h = 50 + i * 15, d = 280 + i * 30;
        const mx = px[kmilan] + kmr[0] * d, mz = pz[kmilan] + kmr[2] * d;
        if (onTrack(mx, mz, 14)) continue;
        addBox(out, [mx, py[kmilan] + h / 2, mz], [16, h, 16], [0.48 + i * 0.08, 0.46 + i * 0.08, 0.44 + i * 0.08]);
      }

      // Italian umbrella pines — taller and narrower than the generic green trees
      every(28, (k) => {
        const s = hash(k * 31);
        if (s < 0.40) return;
        const side = s < 0.70 ? -1 : 1, d = 10 + s * 5, h = 15 + s * 9;
        place(k, side, d, [1.2, 1.8, 1.2], [0.28, 0.19, 0.10]);
        place(k, side, d, [3.0, h, 3.0], [0.07, 0.27, 0.09]);
      });
      // Tribuna Centrale: main grandstand spanning the pit straight (white/cream
      // Italian classic). Built as oriented segments via prop() so each sits
      // alongside the track with its inner face cleared — never a wall across it.
      const ktc = Math.round(n * 0.01) % n;
      const seg = Math.max(1, Math.round(n * 0.006));
      for (let i = 0; i < 6; i++) {
        const k = (ktc + i * seg) % n;
        prop(k, -1, 10, [9, 22, 24], [0.85, 0.83, 0.78]);   // stand shell (9m deep)
        prop(k, -1, 8,  [9, 13, 22], [0.66, 0.42, 0.36]);   // crowd tiers
      }
      // Control tower with press centre, set back beyond the stand
      prop(ktc, -1, 16, [10, 40, 12], [0.95, 0.95, 0.97]);
      // Sopraelevata: weathered banking of the abandoned oval, looming in the park
      for (let i = 0; i < 5; i++) {
        const k = (Math.round(n * 0.42) + i * 4) % n;
        backdrop(k, 1, 120 + i * 10, [30, 16, 60], [0.55, 0.54, 0.50]);
      }
      // Grandstands at Curva Grande and the Parabolica. prop()'s sz is
      // [depth(perpendicular), height, length(along track)] — shallow + long so
      // the stand runs alongside the corner instead of jutting into it.
      for (const frac of [0.10, 0.46, 0.88]) {
        const k = Math.round(frac * n) % n;
        const side = hash(k * 5) < 0.5 ? -1 : 1;
        prop(k, side, 9, [8, 9, 30], [0.42, 0.42, 0.48]);
        prop(k, side, 7, [8, 5, 28], [0.66, 0.40, 0.34]);
      }
    },
  }
  );
})();
