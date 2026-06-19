/* Apex 26 — SILVERSTONE circuit definition (data only).
   Registered on the global TrackDefs list; consumed by the js/tracks.js engine
   (palette resolved there from `night`, geometry from js/circuits.js or `segs`). */
(function () {
  "use strict";
  (window.TrackDefs = window.TrackDefs || []).push(
  {
    id: "silverstone",
    name: "SILVERSTONE",
    gp: "British GP",
    country: "UK",
    night: false,
    theme: "green",
    lengthKm: 5.9,
    baseHW: 8,
    pal: { zenith: [0.3, 0.42, 0.62], horizon: [0.66, 0.72, 0.78], grass: [0.2, 0.46, 0.18], fogDensity: 0.0016, sunDir: [0.42010419876354255, 0.5521369469463703, 0.7201786264517872], sun: [0.88, 0.91, 1], sunColor: [0.84, 0.88, 0.96] },
    segs: [
      { t: 0, l: 260 }, { t: 60, l: 120 }, { t: -50, l: 90 }, { t: 80, l: 80 }, { t: -150, l: 160 }, { t: 0, l: 120 },
      { t: -70, l: 90 }, { t: 120, l: 150 }, { t: 40, l: 100 }, { t: 0, l: 160 }, { t: 70, l: 130 }, { t: -55, l: 70 },
      { t: 60, l: 70 }, { t: -55, l: 70 }, { t: 50, l: 70 }, { t: 0, l: 300 }, { t: 75, l: 110 }, { t: -40, l: 90 },
      { t: 95, l: 90 }, { t: 60, l: 90 },
    ],
    elevations: [{ s: 0.62, halfM: 360, rise: 9 }],
    scenery: function (api) {
      const { out, track, def, theme, pal, n, ds, px, py, pz, hw, pyMin, place, prop, backdrop, groundPlane, groundYAt, addBox, every, onTrack, ferrisWheel, hash, upOf, cross, norm, lerp } = api;
      // Hedgerows and oak copses around the old airfield perimeter
      every(20, (k) => {
        for (const side of [-1, 1]) {
          if (hash(k * 21 + side) > 0.55) continue;
          const d = 40 + hash(k * 22 + side) * 60;
          const h = 6 + hash(k * 24 + side) * 6;
          place(k, side, d, [1.2, 1.4, 1.2], [0.30, 0.22, 0.12]);
          place(k, side, d, [4.2, h, 4.2], [0.20, 0.40, 0.18]);
        }
      });
      // Spectator grandstands at the fast corners (Stowe / Copse / Maggotts)
      for (const frac of [0.18, 0.34, 0.58, 0.78]) {
        const k = Math.round(frac * n) % n;
        const side = hash(k * 5) < 0.5 ? -1 : 1;
        prop(k, side, 9, [8, 10, 30], [0.40, 0.42, 0.48]);   // stand shell
        prop(k, side, 7, [8, 6, 28], [0.66, 0.40, 0.34]);    // crowd
      }
      // Distant low Northamptonshire treeline
      every(80, (k) => {
        for (const side of [-1, 1]) {
          backdrop(k, side, 180 + hash(k * 6 + side) * 90, [180, 22, 180], [0.22, 0.36, 0.20]);
        }
      });

      // The Wing — curved pit-lane roof structure on the main straight (390m long, 1200 tonnes steel)
      for (let i = 0; i < 6; i++) {
        const k = (Math.round(n * 0.01) + i * 3) % n;
        const r = [track.rx[k], track.ry[k], track.rz[k]];
        const t = [track.tx[k], track.ty[k], track.tz[k]];
        const u = upOf(track, k);
        const rise = Math.sin((i / 5) * Math.PI) * 5;
        const scx = px[k] + r[0] * (hw[k] + 4), scy = py[k], scz = pz[k] + r[2] * (hw[k] + 4);
        // metallic silver polyester-coated steel panels (RAL 9006)
        addBox(out, [scx, scy + 12 + rise * 0.5, scz], [1.5, 24 + rise, 18], [0.75, 0.75, 0.78], [r, u, t]);
        addBox(out, [scx, scy + 25 + rise, scz], [36, 1.5, 20], [0.72, 0.72, 0.75], [r, u, t]);
        // support structures
        if (i > 0 && i < 5) {
          addBox(out, [scx - r[0] * 8, scy + 18 + rise * 0.3, scz - r[2] * 8], [2, 16, 4], [0.68, 0.68, 0.72], [r, u, t]);
          addBox(out, [scx + r[0] * 8, scy + 18 + rise * 0.3, scz + r[2] * 8], [2, 16, 4], [0.68, 0.68, 0.72], [r, u, t]);
        }
      }
    },
  }
  );
})();
