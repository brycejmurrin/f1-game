/* Apex 26 — SINGAPORE circuit definition (data only).
   Registered on the global TrackDefs list; consumed by the js/tracks.js engine
   (palette resolved there from `night`, geometry from js/circuits.js or `segs`). */
(function () {
  "use strict";
  (window.TrackDefs = window.TrackDefs || []).push(
  {
    id: "singapore",
    name: "SINGAPORE",
    gp: "Singapore GP",
    country: "Singapore",
    night: true,
    theme: "street_night",
    lengthKm: 4.9,
    baseHW: 6,
    street: true,
    pal: { horizon: [0.08, 0.05, 0.14] },
    segs: [
      { t: 0, l: 160 }, { t: 60, l: 70 }, { t: -70, l: 70 }, { t: 55, l: 70 }, { t: 0, l: 220 }, { t: 90, l: 70 },
      { t: 0, l: 200 }, { t: 95, l: 70 }, { t: -90, l: 80 }, { t: 80, l: 60 }, { t: -60, l: 70 }, { t: 90, l: 90 },
      { t: 0, l: 180 }, { t: 90, l: 70 }, { t: 90, l: 70 }, { t: -85, l: 60 }, { t: 95, l: 80 },
    ],
    scenery: function (api) {
      const { out, track, def, theme, pal, n, ds, px, py, pz, hw, pyMin, place, prop, backdrop, groundPlane, groundYAt, addBox, every, onTrack, ferrisWheel, hash, upOf, cross, norm, lerp } = api;
            for (let i = 0; i < 8; i++) {
              const k = Math.round((i / 8) * n) % n;
              const r = [track.rx[k], track.ry[k], track.rz[k]];
              const h = 35 + hash(k * 31) * 65;
              const sx = px[k] + r[0] * (hw[k] + 160), sz = pz[k] + r[2] * (hw[k] + 160);
              if (onTrack(sx, sz, 20)) continue;
              addBox(out, [sx, py[k] + h / 2, sz], [28, h, 28], [0.35, 0.32, 0.38]);  // distant skyscrapers
            }
            // Tropical vegetation background
            every(18, (k) => {
              for (const side of [-1, 1]) {
                const d = 140 + hash(k * side) * 60;
                place(k, side, d, [2.2, 2.0, 2.2], [0.28, 0.35, 0.18]);
                place(k, side, d, [5.5, 8 + hash(k) * 6, 5.5], [0.18, 0.42, 0.2]);
              }
            });

      ferrisWheel(Math.round(n * 0.05) % n, 1, 46, 28);

            // Gardens by the Bay supertrees alongside the circuit
            const ks = Math.round(n * 0.30) % n;
            const stc = [[0.9, 0.1, 0.6], [0.1, 0.8, 0.95], [0.95, 0.78, 0.1]];
            for (let i = 0; i < 6; i++) {
              const k = (ks + i * 5) % n;
              const r = [track.rx[k], track.ry[k], track.rz[k]];
              const o = hw[k] + 28 + i * 9, h = 20 + i * 5;
              const scx = px[k] + r[0] * o, scz = pz[k] + r[2] * o;
              addBox(out, [scx, py[k] + h * 0.5, scz], [2.5, h, 2.5], [0.15, 0.18, 0.22]);
              addBox(out, [scx, py[k] + h + 4, scz], [12 + i * 2, 8, 12 + i * 2], [0.06, 0.38, 0.14]);
              addBox(out, [scx, py[k] + h + 0.5, scz], [14 + i * 2, 1.5, 14 + i * 2], stc[i % 3]);
            }
            // Marina Bay Sands: 3-tower hotel complex near start/finish area with connecting bridge
            const kmb = Math.round(n * 0.03) % n;
            const kmbr = [track.rx[kmb], track.ry[kmb], track.rz[kmb]];
            for (let i = -1; i <= 1; i++) {
              const tx = px[kmb] + kmbr[0] * (hw[kmb] + 120 + i * 18);
              const tz = pz[kmb] + kmbr[2] * (hw[kmb] + 120 + i * 18);
              const h = 57 + i * 3;  // tallest in middle
              addBox(out, [tx, py[kmb] + h / 2, tz], [20, h, 20], [0.92, 0.92, 0.95]);
            }
            const mbs_mid = px[kmb] + kmbr[0] * (hw[kmb] + 120);
            const mbz_mid = pz[kmb] + kmbr[2] * (hw[kmb] + 120);
            addBox(out, [mbs_mid, py[kmb] + 50, mbz_mid], [60, 5, 12], [0.85, 0.85, 0.88]); // roof bridge
    },
  }
  );
})();
