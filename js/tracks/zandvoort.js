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
      const { out, n, px, py, pz, pyMin, hw, prop, backdrop, groundPlane,
              addBox, addCyl, anchor, vadd, onTrack, hash, every,
              mountain, peak, bush, hedge, grandstand, tower } = api;
      const K = (s) => Math.round(s * n) % n;

      // --- North Sea horizon: a single far, low blue water plane behind the
      // dunes (s≈0.45 L). Settled below grade and pushed way out so it reads as
      // a hazed sliver, never a wall rising into the cockpit. ---
      groundPlane(K(0.45), -1, 520, [900, 5, 900], [0.20, 0.42, 0.58]);

      // --- Low rolling sand dunes hemming the track (the Zandvoort dune belt).
      // Organic mountain()/peak() kept LOW and sandy, snowline > 1 so NO snow.
      // Tan body, marram-green caps via opts.forest skirt + bush/hedge below. ---
      const sand = [0.80, 0.74, 0.56], sandDk = [0.70, 0.64, 0.46];
      const marramG = [0.34, 0.50, 0.26], marramT = [0.66, 0.62, 0.40];
      every(34, (k) => {
        for (const side of [-1, 1]) {
          if (hash(k * 71 + side) > 0.62) continue;
          const a = anchor(k, side, 30 + hash(k * 72 + side) * 26);
          const h = 7 + hash(k * 73 + side) * 8;        // LOW dune mounds
          mountain(a.c[0], a.c[2], a.c[1], 26 + hash(k * 74 + side) * 16, h, {
            seed: k * 13 + side, rough: 0.5, snowline: 2,  // >1 = no snow
            forest: marramG, rock: sandDk, snow: sand,
          });
        }
      });
      // A few far dune ridges as a continuous sandy backdrop on the horizon.
      every(60, (k) => {
        for (const side of [-1, 1]) {
          if (hash(k * 41 + side) > 0.5) continue;
          const a = anchor(k, side, 150 + hash(k * 42 + side) * 90);
          if (onTrack(a.c[0], a.c[2], 14)) continue;
          peak(a.c[0], a.c[2], pyMin, 60 + hash(k * 43 + side) * 50,
               14 + hash(k * 44 + side) * 12, sand);
        }
      });
      // Marram grass tufts hugging the verge (low organic green/tan greenery).
      every(20, (k) => {
        for (const side of [-1, 1]) {
          if (hash(k * 51 + side) > 0.45) continue;
          bush(k, side, 12 + hash(k * 52 + side) * 14,
               hash(k * 53 + side) < 0.5 ? marramG : marramT);
        }
      });
      hedge(0.20, 0.34, 1, 10, 1.4, marramT);   // dune-ridge marram band (Hunserug)
      hedge(0.35, 0.48, -1, 12, 1.4, marramG);

      // --- Orange-clad Dutch grandstands at the banked corners and pit straight.
      // crowd colour = fanatic Verstappen orange. ---
      grandstand(0.04, 1, 9, 30, [0.36, 0.38, 0.42], [0.95, 0.45, 0.05]); // Tarzan hairpin R
      grandstand(0.14, -1, 9, 34, [0.36, 0.38, 0.42], [0.95, 0.45, 0.05]); // Hugenholtz T3 banked L
      grandstand(0.92, 1, 9, 34, [0.36, 0.38, 0.42], [0.95, 0.45, 0.05]); // Arie Luyendyk final banked R
      grandstand(0.96, -1, 11, 30, [0.40, 0.41, 0.46], [0.95, 0.45, 0.05]); // pit-straight L

      // --- Pit building: long low white-grey box with repeated garage bays. ---
      (() => {
        const a = anchor(K(0.00), -1, 12), b = [a.r, a.u, a.t];
        addBox(out, vadd(a.c, a.u, 3), [7, 6, 64], [0.86, 0.87, 0.90], b);
        for (let i = -3; i <= 3; i++)
          addBox(out, vadd(vadd(a.c, a.u, 3), a.t, i * 8), [7.4, 4, 1.2], [0.30, 0.32, 0.36], b);
      })();

      // --- Wind turbines on the seaward dune horizon (tower + 3-blade cap).
      // Guarded with onTrack so a perpendicular projection never lands on this
      // compact winding circuit's parallel stretch. ---
      for (const s of [0.20, 0.50, 0.78]) {
        const k = K(s), a = anchor(k, 1, 300), b = [a.r, a.u, a.t];
        if (onTrack(a.c[0], a.c[2], 60)) continue;
        tower(k, 1, 300, 7, 80, { col: [0.92, 0.92, 0.94], seg: 8 }); // white pole
        const hub = vadd(a.c, a.u, 80);
        addCyl(out, hub, 1.2, 2.4, [0.9, 0.9, 0.92], 6, b);          // nacelle
        for (let j = 0; j < 3; j++) {                                 // three blades
          const ang = j * 2.0944, dir = vadd(vadd([0,0,0], a.u, Math.cos(ang) * 30), a.r, Math.sin(ang) * 30);
          addBox(out, vadd(hub, dir, 0.5), [2, 30, 1.5], [0.94, 0.94, 0.96], b);
        }
      }

      // --- Beach huts: tiny low pastel box row at the dune base near the shore
      // (s≈0.50 R, seaward). ---
      every(110, (k) => {
        const a = anchor(k, hash(k * 8) < 0.5 ? -1 : 1, hw[k] + 120);
        if (onTrack(a.c[0], a.c[2], 12)) return;
        const cols = [[0.85, 0.25, 0.20], [0.20, 0.45, 0.70], [0.90, 0.85, 0.30], [0.20, 0.60, 0.40]];
        const hutCol = cols[Math.floor(hash(k * 9) * 4) % 4];
        addBox(out, vadd(a.c, a.u, 2), [5, 4, 5], hutCol, [a.r, a.u, a.t]);
      });
    },
  }
  );
})();
