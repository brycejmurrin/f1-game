/* Apex 26 — ZANDVOORT circuit definition (data only).
   Registered on the global TrackDefs list; consumed by the js/tracks.js engine
   (palette resolved there from `night`, geometry from js/circuits.js or `segs`). */
(function () {
  "use strict";
  (window.TrackDefs = window.TrackDefs || []).push(
  {
    id: "zandvoort",
    name: "ZANDVOORT",
    gp: "Dutch GP",
    country: "Netherlands",
    night: false,
    theme: "green",
    lengthKm: 4.3,
    baseHW: 7,
    // Hugenholtz + Arie Luyendyk: the two steeply banked corners get a raised
    // outer edge (the engine banks the highest-curvature corners).
    banked: true,
    pal: { zenith: [0.3, 0.44, 0.62], horizon: [0.72, 0.72, 0.68], grass: [0.42, 0.44, 0.24], runoff: [0.62, 0.54, 0.36], fog: [0.72, 0.72, 0.68], fogDensity: 0.0018, sunDir: [0.5597170785495562, 0.6492718111174852, 0.5149397122655918], sun: [1, 0.92, 0.76], sunColor: [1, 0.9, 0.74] },
    segs: [
      { t: 0, l: 260 }, { t: 75, l: 120, b: 0.16 }, { t: -50, l: 90 }, { t: 130, l: 150, b: 0.3 }, { t: 0, l: 180, h: 8 }, { t: 40, l: 110, h: -8 },
      { t: 60, l: 100 }, { t: -50, l: 90, h: 4 }, { t: 70, l: 90 }, { t: -60, l: 90 }, { t: 90, l: 90 }, { t: -50, l: 90 },
      { t: 50, l: 90 }, { t: 160, l: 160, b: 0.31, w: 8 },
    ],
    elevations: [{ s: 0.56, halfM: 300, rise: 8 }],
    scenery: function (api) {
      const { out, track, def, theme, pal, n, ds, px, py, pz, hw, pyMin, place, prop, backdrop, groundPlane, groundYAt, addBox, every, onTrack, ferrisWheel, hash, upOf, cross, norm, lerp } = api;
      // North Sea horizon: a single distant water strip far beyond the dunes.
      // Anchored well below pyMin (the lowest track point) and pushed far out so
      // it reads as a sliver on the horizon — never a flat plane floating into
      // the cockpit on the banked, elevation-changing sections. The foreground
      // beach slab was removed: the dune mounds below already cover the verge,
      // and a large near-grade plane is exactly what produced the wall.
      const ksea = Math.round(n * 0.4) % n;
      const kser = [track.rx[ksea], track.ry[ksea], track.rz[ksea]];
      const seaX = px[ksea] + kser[0] * 420, seaZ = pz[ksea] + kser[2] * 420;
      // 9m below the lowest track point, so even over a parallel stretch it
      // stays under the road — no onTrack rejection needed.
      addBox(out, [seaX, pyMin - 9, seaZ], [520, 3, 520], [0.10, 0.26, 0.42]);
      // Distant wind turbines (Dutch renewable energy). Guarded with onTrack so
      // a turbine projected perpendicular from one point never lands beside a
      // parallel stretch of this compact, winding circuit (the "pole in the road").
      for (let i = 0; i < 4; i++) {
        const k = Math.round((i / 4) * n) % n;
        const r = [track.rx[k], track.ry[k], track.rz[k]];
        const tx = px[k] + r[0] * 380, tz = pz[k] + r[2] * 380;
        if (onTrack(tx, tz, 90)) continue;
        addBox(out, [tx, py[k] + 60, tz], [6, 120, 6], [0.82, 0.82, 0.84]);  // turbine tower
        addBox(out, [tx, py[k] + 68, tz], [80, 4, 6], [0.8, 0.8, 0.78]);     // turbine blades
      }
      // Sand dunes hugging the circuit (Zandvoort runs through the dune belt)
      every(22, (k) => {
        for (const side of [-1, 1]) {
          if (hash(k * 71 + side) > 0.6) continue;
          const d = 28 + hash(k * 72 + side) * 40;
          prop(k, side, d, [18, 6 + hash(k * 73 + side) * 6, 18], [0.78, 0.72, 0.56]); // dune mound
          prop(k, side, d, [16, 1.4, 16], [0.62, 0.66, 0.40]);                          // marram grass
        }
      });
      // Sea of orange: Dutch grandstands packed with fans at the banked corners
      for (const frac of [0.12, 0.30, 0.50, 0.72, 0.90]) {
        const k = Math.round(frac * n) % n;
        const side = hash(k * 7) < 0.5 ? -1 : 1;
        prop(k, side, 8, [8, 10, 26], [0.36, 0.38, 0.42]);  // stand shell
        prop(k, side, 6, [8, 6, 24], [0.92, 0.46, 0.08]);   // orange crowd
      }
      // Beach huts along the seafront approach
      every(120, (k) => {
        const r = [track.rx[k], track.ry[k], track.rz[k]];
        const o = (hash(k * 8) < 0.5 ? -1 : 1) * (hw[k] + 120);
        const cx = px[k] + r[0] * o, cz = pz[k] + r[2] * o;
        if (onTrack(cx, cz, 12)) return;
        const hutCol = [[0.85, 0.25, 0.20], [0.20, 0.45, 0.70], [0.90, 0.85, 0.30]][Math.floor(hash(k * 9) * 3) % 3];
        addBox(out, [cx, py[k] + 1.6, cz], [5, 4, 5], hutCol);
      });
    },
  }
  );
})();
