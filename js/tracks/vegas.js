/* Apex 26 — LAS VEGAS circuit definition (data only).
   Registered on the global TrackDefs list; consumed by the js/tracks.js engine
   (palette resolved there from `night`, geometry from js/circuits.js or `segs`). */
(function () {
  "use strict";
  (window.TrackDefs = window.TrackDefs || []).push(
  {
    id: "vegas",
    name: "LAS VEGAS",
    gp: "Las Vegas GP",
    country: "USA",
    night: true,
    theme: "street_night",
    lengthKm: 6.2,
    baseHW: 7,
    street: true,
    pal: { horizon: [0.1, 0.06, 0.16] },
    segs: [
      { t: 0, l: 140 }, { t: 90, l: 70 }, { t: -60, l: 60 }, { t: 60, l: 60 }, { t: 0, l: 120 }, { t: -60, l: 60 },
      { t: 70, l: 60 }, { t: -55, l: 60 }, { t: 0, l: 360 }, { t: 90, l: 80 }, { t: -50, l: 70 }, { t: 0, l: 900, t2: 0 },
      { t: -20, l: 200 }, { t: 90, l: 90 }, { t: -60, l: 60 }, { t: 70, l: 70 }, { t: 65, l: 120 },
    ],
    scenery: function (api) {
      const { out, track, def, theme, pal, n, ds, px, py, pz, hw, pyMin, place, prop, backdrop, groundPlane, groundYAt, addBox, every, onTrack, ferrisWheel, hash, upOf, cross, norm, lerp } = api;
      // Red rock formations (distant)
      for (let i = 0; i < 8; i++) {
        const k = Math.round((i / 8) * n) % n;
        const r = [track.rx[k], track.ry[k], track.rz[k]];
        const rock_h = 35 + hash(k * 47) * 45;
        const rock_d = 250 + hash(k * 49) * 150;
        for (const side of [-1, 1]) {
          const rx = px[k] + r[0] * side * rock_d, rz = pz[k] + r[2] * side * rock_d;
          if (onTrack(rx, rz, 95)) continue;
          addBox(out, [rx, py[k] + rock_h / 2, rz], [180, rock_h, 240], [0.65, 0.52, 0.38]);
        }
      }
      // Floodlight towers for night racing
      every(110, (k) => {
        for (const side of [-1, 1]) {
          const tower_d = hw[k] + 70 + hash(k * 51) * 25;
          place(k, side, tower_d, [2.2, 35, 2.2], [0.35, 0.35, 0.40]);
          for (let lt = 0; lt < 4; lt++) {
            place(k, side, tower_d + hash(k + lt * 3) * 7, [1.2, 1.8, 1.2], [0.90, 0.60, 0.10]);  // warm lights
          }
        }
      });
      // Sparse desert vegetation (occasional bushes)
      every(80, (k) => {
        for (const side of [-1, 1]) {
          if (hash(k * 53 + side) > 0.4) continue;
          const d = 50 + hash(k * 54) * 60;
          place(k, side, d, [2.0, 1.5, 2.0], [0.45, 0.38, 0.25]);
        }
      });
      // Power/utility infrastructure
      every(220, (k) => {
        const side = hash(k * 55) > 0.5 ? -1 : 1;
        place(k, side, hw[k] + 40, [6, 8, 6], [0.65, 0.62, 0.58]);
      });

      // MSG Sphere — distinctive multi-colour LED sphere east of the Strip
      const kc = Math.round(n * 0.50) % n;
      const r = [track.rx[kc], track.ry[kc], track.rz[kc]];
      const scx = px[kc] + r[0] * (hw[kc] + 148), scz = pz[kc] + r[2] * (hw[kc] + 148);
      const hubY = py[kc] + 58, rad = 52;
      const vc = [[0.9, 0.4, 0.05], [0.05, 0.75, 0.95], [0.9, 0.05, 0.85], [0.95, 0.9, 0.05]];
      for (let i = 1; i <= 6; i++) {
        const phi = (i / 7) * Math.PI, ringR = rad * Math.sin(phi), ringY = hubY + rad * Math.cos(phi);
        for (let j = 0; j < 14; j++) {
          const theta = (j / 14) * Math.PI * 2;
          addBox(out, [scx + ringR * Math.cos(theta), ringY, scz + ringR * Math.sin(theta)], [7, 7, 7], vc[(i + j) % 4]);
        }
      }
      addBox(out, [scx, hubY + rad, scz], [7, 7, 7], vc[0]);
      addBox(out, [scx, hubY - rad, scz], [7, 7, 7], vc[2]);
      // Strip hotel towers visible from pit area (Bellagio, Caesars Palace, Paris)
      const khot = Math.round(n * 0.08) % n;
      const khr = [track.rx[khot], track.ry[khot], track.rz[khot]];
      for (let i = 0; i < 4; i++) {
        const h = 40 + i * 20, d = 140 + i * 30;
        const hx = px[khot] + khr[0] * d, hz = pz[khot] + khr[2] * d;
        const tone = [0.8, 0.75, 0.7, 0.65][i];
        addBox(out, [hx, py[khot] + h / 2, hz], [30 + i * 8, h, 30 + i * 8], [tone, tone * 0.95, tone * 0.9]);
      }
    },
  }
  );
})();
