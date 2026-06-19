/* Apex 26 — COTA circuit definition (data only).
   Registered on the global TrackDefs list; consumed by the js/tracks.js engine
   (palette resolved there from `night`, geometry from js/circuits.js or `segs`). */
(function () {
  "use strict";
  (window.TrackDefs = window.TrackDefs || []).push(
  {
    id: "cota",
    name: "COTA",
    gp: "United States GP",
    country: "USA",
    night: false,
    theme: "green",
    lengthKm: 5.5,
    baseHW: 8,
    pal: { zenith: [0.24, 0.5, 0.84], horizon: [0.76, 0.7, 0.54], grass: [0.34, 0.4, 0.14], runoff: [0.6, 0.35, 0.2], ambientSky: [0.52, 0.58, 0.68], ambientGround: [0.28, 0.28, 0.24], sunDir: [0.5345224838248488, 0.5550810408950353, 0.6373152691757812], sun: [1, 0.9, 0.7], sunColor: [1, 0.88, 0.68] },
    segs: [
      { t: 0, l: 220, h: 30 }, { t: -120, l: 110, h: -6 }, { t: 0, l: 80, h: -22 }, { t: 60, l: 60 }, { t: -55, l: 60 }, { t: 60, l: 60 },
      { t: -55, l: 70 }, { t: 50, l: 70 }, { t: -40, l: 80 }, { t: -60, l: 90 }, { t: -120, l: 110 }, { t: 0, l: 460 },
      { t: -150, l: 130 }, { t: 70, l: 70 }, { t: -60, l: 70 }, { t: 80, l: 90 }, { t: 90, l: 160 }, { t: -130, l: 110 },
    ],
    // Turn 1: the calendar's most famous climb — ~30 m up in a few hundred metres.
    elevations: [{ s: 0.06, halfM: 320, rise: 12 }],
    scenery: function (api) {
      const { out, track, def, theme, pal, n, ds, px, py, pz, hw, pyMin, place, prop, backdrop, groundPlane, groundYAt, addBox, every, onTrack, ferrisWheel, hash, upOf, cross, norm, lerp } = api;
      // Oak/cedar tree coverage (scattered natural vegetation) - reduced density to avoid clustering
      every(60, (k) => {
        for (const side of [-1, 1]) {
          for (let j = 0; j < 2; j++) {
            const d = 35 + hash(k * 43 + j) * 50;
            const s = hash(k * 45 + side + j);
            const h = 6 + s * 7;
            place(k, side, d, [1.4, 1.6, 1.4], [0.32, 0.24, 0.14]);
            place(k, side, d, [3.8, h, 3.8], [0.28, 0.38, 0.16]);
          }
        }
      });
      // Floodlight towers (scattered for evening sessions)
      every(140, (k) => {
        for (const side of [-1, 1]) {
          if (hash(k * 47 + side) > 0.6) continue;
          const tower_d = hw[k] + 75 + hash(k * 49) * 30;
          place(k, side, tower_d, [2.0, 35, 2.0], [0.38, 0.38, 0.42]);
        }
      });
      // Observation tower support infrastructure
      const kobs = Math.round(n * 0.08) % n;
      const kobsr = [track.rx[kobs], track.ry[kobs], track.rz[kobs]];
      place(kobs, -1, hw[kobs] + 45, [8, 6, 8], [0.55, 0.50, 0.42]);  // support facility
      place(kobs, 1, hw[kobs] + 45, [6, 5, 6], [0.65, 0.60, 0.52]);   // utilities

      // observation tower at Turn 1 (251 ft / 76 m steel structure) - pushed further back to avoid clipping
      const kc = Math.round(n * 0.08) % n;
      const r = [track.rx[kc], track.ry[kc], track.rz[kc]];
      const tcx = px[kc] + r[0] * (hw[kc] + 90), tcy = groundYAt(kc, 90), tcz = pz[kc] + r[2] * (hw[kc] + 90);
      addBox(out, [tcx, tcy + 42, tcz], [4.5, 84, 4.5], [0.88, 0.88, 0.90]);
      addBox(out, [tcx - r[0] * 10, tcy + 84, tcz - r[2] * 10], [22, 4, 10], [0.88, 0.88, 0.90]);
      addBox(out, [tcx - r[0] * 16, tcy + 87, tcz - r[2] * 16], [10, 3, 8], [0.95, 0.44, 0.05]);
      // Red steel tube grandstand framework (COTA signature design element) - increased spacing to avoid overlaps
      for (let i = 0; i < 8; i++) {
        const k = (Math.round(n * 0.15) + i * Math.round(n / 8)) % n;
        const rk = [track.rx[k], track.ry[k], track.rz[k]];
        const tk = [track.tx[k], 0, track.tz[k]];
        const o = hw[k] + 22 + (i % 2) * 10;
        const gy = groundYAt(k, 22 + (i % 2) * 10);
        for (const side of [-1, 1]) {
          addBox(out, [px[k] + rk[0] * side * o, gy + 12, pz[k] + rk[2] * side * o],
                 [3, 24, 20], [0.95, 0.44, 0.05], [rk, [0, 1, 0], tk]);
        }
      }
      // Austin360 Amphitheater: curved canopy roof behind Turn 12
      const kamp = Math.round(n * 0.62) % n;
      const kar = [track.rx[kamp], track.ry[kamp], track.rz[kamp]];
      const ampX = px[kamp] + kar[0] * (hw[kamp] + 70), ampZ = pz[kamp] + kar[2] * (hw[kamp] + 70);
      const ampY = groundYAt(kamp, 70);
      if (!onTrack(ampX, ampZ, 30)) {
        addBox(out, [ampX, ampY + 18, ampZ], [48, 36, 30], [0.86, 0.84, 0.80]);
        addBox(out, [ampX, ampY + 38, ampZ], [54, 4, 36], [0.70, 0.72, 0.76]);
      }
      // Texas Hill Country ridgeline on the horizon
      every(80, (k) => {
        for (const side of [-1, 1]) {
          backdrop(k, side, 200 + hash(k * 8 + side) * 110, [180, 30, 180], [0.34, 0.34, 0.22]);
        }
      });
    },
  }
  );
})();
