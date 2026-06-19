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
      const { n, px, pz, pyMin, place, prop, every, ferrisWheel, hash, mountain, pine, tree } = api;

      // Packed grandstand running along the track: taller back shell + a shorter
      // front tier of blue-clad fans (Suzuka's stands are always full).
      const blue = [0.26, 0.38, 0.64];
      const stand = (s, side, gap, len) => {
        const k = Math.round(s * n) % n;
        prop(k, side, gap + 1.5, [9, 10, len], [0.40, 0.41, 0.46]);  // back shell
        prop(k, side, gap, [8, 6, len - 3], blue);                   // crowd tier (front)
      };

      // --- Forested Mie-prefecture hills: three haze-depth rings of wooded
      // summits encircling the circuit (computed from the track centre). The
      // near rings are dense and OVERLAPPING — neighbouring peaks touch so the
      // horizon reads as one CONTINUOUS green forested wall with no gaps, not a
      // ring of separated cubes. No snow (Suzuka is wooded, not alpine).
      let cx = 0, cz = 0;
      for (let i = 0; i < n; i++) { cx += px[i]; cz += pz[i]; }
      cx /= n; cz /= n;
      let rad = 0;
      for (let i = 0; i < n; i++) rad = Math.max(rad, Math.hypot(px[i] - cx, pz[i] - cz));
      for (const [extra, wMin, wVar, hMin, hVar, count, seg, fc, rc] of [
        [170, 250, 70, 40, 40, 40, 7, [0.22, 0.40, 0.25], [0.32, 0.38, 0.29]],   // near base — overlapping continuous forest backdrop
        [300, 280, 90, 62, 52, 32, 7, [0.28, 0.46, 0.30], [0.38, 0.44, 0.34]],   // mid green ridge
        [470, 320, 110, 96, 70, 26, 8, [0.42, 0.53, 0.46], [0.46, 0.52, 0.46]],   // far hazed range
      ]) {
        const ring = rad + extra;
        for (let i = 0; i < count; i++) {
          const a = (i + extra * 0.004) / count * 6.2832, h = hash(i * 7 + extra);
          const x = cx + Math.cos(a) * ring, z = cz + Math.sin(a) * ring;
          mountain(x, z, pyMin, wMin + h * wVar, hMin + h * hVar, {
            seg, seed: i * 13 + extra, snowline: 1.1,   // Mie hills — wooded, not alpine
            forest: [fc[0] + h * 0.05, fc[1] + h * 0.04, fc[2] + h * 0.04], rock: rc,
          });
        }
      }

      // --- Motopia theme park + the giant Ferris wheel: the hero landmark that
      // instantly reads "Suzuka", on the outside of the main straight (Turn 1 side).
      ferrisWheel(Math.round(n * 0.07) % n, -1, 44, 26);
      const parkCol = [[0.86, 0.42, 0.40], [0.40, 0.62, 0.82], [0.90, 0.80, 0.36], [0.55, 0.78, 0.55]];
      for (let i = 0; i < 5; i++) {
        place(Math.round(n * 0.05) % n, -1, 38 + i * 12, [10 + i * 2, 7 + i * 3, 14], parkCol[i % 4]);
      }

      // --- Dense conifer stands lining BOTH green zones (proper cone trees) in
      // staggered double rows, with Sakura (cherry-blossom) broadleaves scattered
      // for seasonal pop against the green.
      every(24, (k) => {
        const s = hash(k * 41);
        if (s < 0.25) return;
        // inner row, both sides
        pine(k, -1, 9 + s * 9, 9 + s * 7, [0.13 + s * 0.06, 0.34, 0.16]);
        pine(k, 1, 9 + s * 9, 9 + s * 7, [0.12 + s * 0.07, 0.33, 0.15]);
        // staggered taller back row
        if (s > 0.45) {
          const b = hash(k * 71);
          pine(k, b < 0.5 ? -1 : 1, 20 + b * 14, 12 + b * 9, [0.11 + b * 0.05, 0.32, 0.15]);
        }
      });
      every(44, (k) => {
        const s = hash(k * 53);
        if (s < 0.4) return;
        tree(k, s < 0.7 ? -1 : 1, 11 + s * 8, 6 + s * 4, [0.94, 0.64, 0.72]);  // sakura
      });

      // --- Grandstands at the signature corners (lap-fractions from the brief).
      stand(0.15, 1, 8, 30);    // Esses
      stand(0.45, 1, 8, 26);    // Hairpin
      stand(0.62, -1, 8, 28);   // Spoon
      stand(0.84, 1, 7, 24);    // 130R
      stand(0.94, 1, 8, 26);    // Casio Triangle (final chicane) — both sides
      stand(0.94, -1, 8, 26);
    },
  }
  );
})();
