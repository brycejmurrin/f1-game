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
      const { out, track, def, theme, pal, n, ds, px, py, pz, hw, pyMin, place, prop, backdrop, groundPlane, groundYAt, addBox, every, onTrack, ferrisWheel, hash, upOf, cross, norm, lerp } = api;
        every(16, (k) => {
          for (const side of [-1, 1]) {
            if (hash(k * 3 + side) > 0.35) continue;
            const s = hash(k * 2 + side);
            const h = 8 + s * 7, d = 14 + s * 12;
            place(k, side, d, [1.0, 1.2, 1.0], [0.22, 0.15, 0.08]);
            place(k, side, d, [3.2, h, 3.2], [0.1, 0.32, 0.12]);
          }
        });

      // Dense tree filler (Ardennes forest density)
      every(12, (k) => {
        for (const side of [-1, 1]) {
          for (let j = 0; j < 3; j++) {
            const d = 35 + hash(k * 27 + j) * 50;
            const s = hash(k * 29 + side + j);
            const h = 8 + s * 9;
            place(k, side, d, [1.0, 1.2, 1.0], [0.22, 0.15, 0.08]);   // trunk
            place(k, side, d, [3.0, h, 3.0], [0.08, 0.28, 0.10]);      // canopy
          }
        }
      });
      // Forested Ardennes ridgelines rising behind the treeline
      every(60, (k) => {
        for (const side of [-1, 1]) {
          backdrop(k, side, 170 + hash(k * 13 + side) * 120, [200, 50, 200], [0.16, 0.30, 0.18]);
        }
      });
      // Yellow marshal posts at trackside (a Spa staple), close but cleared
      every(46, (k) => {
        const side = hash(k * 33) < 0.5 ? -1 : 1;
        prop(k, side, 3, [1.4, 2.6, 1.4], [0.90, 0.78, 0.10]);
      });
      // Grass spectator banking with sparse crowd colour
      every(120, (k) => {
        const side = hash(k * 35) < 0.5 ? -1 : 1;
        prop(k, side, 6, [8, 5, 22], [0.18, 0.34, 0.16]);
        prop(k, side, 6, [8, 2, 20], [0.62, 0.4, 0.34]);
      });
    },
  }
  );
})();
