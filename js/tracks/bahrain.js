/* Apex 26 — BAHRAIN circuit definition (data only).
   Registered on the global TrackDefs list; consumed by the js/tracks.js engine
   (palette resolved there from `night`, geometry from js/circuits.js or `segs`). */
(function () {
  "use strict";
  (window.TrackDefs = window.TrackDefs || []).push(
  {
    id: "bahrain",
    name: "BAHRAIN",
    gp: "Bahrain GP",
    country: "Bahrain",
    night: true,
    theme: "desert",
    lengthKm: 5.4,
    baseHW: 7,
    pal: { horizon: [0.1, 0.07, 0.1], concrete: [0.27, 0.26, 0.25], runoff: [0.24, 0.23, 0.22], grass: [0.19, 0.17, 0.14] },
    segs: [
      { t: 0, l: 520 }, { t: 90, l: 100 }, { t: -40, l: 80 }, { t: 70, l: 90 }, { t: 0, l: 240 }, { t: 80, l: 100 },
      { t: -30, l: 80 }, { t: 70, l: 100 }, { t: 0, l: 300 }, { t: 60, l: 90 }, { t: 0, l: 120 }, { t: 60, l: 110 },
    ],
    // Gentle mid-lap dip — the real circuit drops ~15 m below its high point.
    elevations: [{ s: 0.45, halfM: 340, rise: -7 }],
    scenery: function (api) {
      const { out, track, def, theme, pal, n, ds, px, py, pz, hw, pyMin, place, prop, backdrop, groundPlane, groundYAt, addBox, every, onTrack, ferrisWheel, hash, upOf, cross, norm, lerp } = api;
      // Date-palm clusters (the circuit's oasis planting), set back behind the runoff
      every(24, (k) => {
        for (const side of [-1, 1]) {
          if (hash(k * 17 + side) > 0.5) continue;
          const d = 12 + hash(k * 19 + side) * 22;
          const h = 6.5 + hash(k * 23 + side) * 4;
          prop(k, side, d, [0.9, h, 0.9], [0.34, 0.26, 0.14]);   // slender trunk
          prop(k, side, d, [5.0, 1.8, 5.0], [0.20, 0.34, 0.12]); // frond crown
        }
      });
      // Low sand-dune ridges far out on the flat-desert horizon. Pushed well
      // back and kept low so they read as a distant skyline, not tan walls
      // flanking the straights; darkened for the night race.
      every(120, (k) => {
        for (const side of [-1, 1]) {
          backdrop(k, side, 360 + hash(k * 7 + side) * 160, [220, 14, 220], [0.46, 0.39, 0.28]);
        }
      });
      // Floodlit grandstand banking opposite the pits (night race spectators).
      // Pushed to 24m+ inner-face clearance so stands read as distant spectator
      // banking rather than walls flanking the road.
      every(110, (k) => {
        const side = hash(k * 9) < 0.5 ? -1 : 1;
        prop(k, side, 26, [12, 12, 36], [0.30, 0.30, 0.36]);   // stand shell
        prop(k, side, 24, [12,  6, 34], [0.55, 0.30, 0.28]);   // crowd tier
      });

      // Sakhir Tower: 9-storey conical race control with LED facade, visible from grid start
      const ksc = Math.round(n * 0.01) % n;
      const kr = [track.rx[ksc], track.ry[ksc], track.rz[ksc]];
      const ksX = px[ksc] + kr[0] * (hw[ksc] + 45), ksY = py[ksc], ksZ = pz[ksc] + kr[2] * (hw[ksc] + 45);
      addBox(out, [ksX, ksY + 20, ksZ], [14, 40, 14], [0.95, 0.95, 0.97]); // main tower
      addBox(out, [ksX, ksY + 38, ksZ], [10, 8, 10], [0.1, 0.1, 0.12]);    // top section
      addBox(out, [ksX, ksY + 42, ksZ], [8, 4, 8], [0.9, 0.3, 0.05]);       // orange cap
      // Arch grandstand + minaret: a nod to the circuit's Islamic architecture
      const kc = Math.round(n * 0.52) % n;
      const r = [track.rx[kc], track.ry[kc], track.rz[kc]];
      const tl = Math.hypot(track.tx[kc], track.tz[kc]) || 1;
      const tn = [track.tx[kc] / tl, 0, track.tz[kc] / tl];
      const scx = px[kc] + r[0] * (hw[kc] + 30), scz = pz[kc] + r[2] * (hw[kc] + 30), bY = py[kc];
      addBox(out, [scx + tn[0] * (-14), bY + 14, scz + tn[2] * (-14)], [4, 28, 4], [0.84, 0.77, 0.55]);
      addBox(out, [scx + tn[0] * 14,   bY + 14, scz + tn[2] * 14  ], [4, 28, 4], [0.84, 0.77, 0.55]);
      addBox(out, [scx,                 bY + 29, scz                ], [38, 3, 5], [0.84, 0.77, 0.55]);
      addBox(out, [scx + tn[0] * 24,   bY + 22, scz + tn[2] * 24  ], [3.5, 44, 3.5], [0.92, 0.83, 0.64]);
      addBox(out, [scx + tn[0] * 24,   bY + 46, scz + tn[2] * 24  ], [7, 4, 7], [0.92, 0.65, 0.10]);
    },
  }
  );
})();
