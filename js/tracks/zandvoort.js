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
      // Tan body, marram-green caps via opts.forest skirt + bush/hedge below.
      // A CONTINUOUS, overlapping belt wraps the WHOLE lap on BOTH sides — no
      // gap-skipping — so the sand reads as an unbroken dune ridge. Low seg (7)
      // keeps the dense belt affordable. ---
      const sand = [0.80, 0.74, 0.56], sandDk = [0.70, 0.64, 0.46];
      const sandLt = [0.86, 0.80, 0.62];
      const marramG = [0.34, 0.50, 0.26], marramT = [0.66, 0.62, 0.40];
      // Inner dune wall: overlapping organic mounds hugging the verge on BOTH
      // sides the WHOLE lap (no gap-skip) — low seg (7) to afford the belt.
      every(32, (k) => {
        for (const side of [-1, 1]) {
          const a = anchor(k, side, 22 + hash(k * 72 + side) * 22);
          const h = 6 + hash(k * 73 + side) * 9;        // LOW dune mounds
          mountain(a.c[0], a.c[2], a.c[1], 30 + hash(k * 74 + side) * 18, h, {
            seg: 7, seed: k * 13 + side, rough: 0.5, snowline: 2,  // >1 = no snow
            forest: marramG, rock: sandDk, snow: sand,
          });
        }
      });
      // Mid dune ridge: a second overlapping band of cheap sandy peaks set back,
      // filling between the inner mounds so the belt never breaks from the
      // cockpit. peak() (clean pyramid) is far lighter than mountain().
      every(22, (k) => {
        for (const side of [-1, 1]) {
          const a = anchor(k, side, 50 + hash(k * 81 + side) * 30);
          if (onTrack(a.c[0], a.c[2], 12)) continue;
          peak(a.c[0], a.c[2], a.c[1], 34 + hash(k * 83 + side) * 24,
               10 + hash(k * 82 + side) * 12,
               hash(k * 84 + side) < 0.5 ? sand : sandLt);
        }
      });
      // Far dune ridges as a continuous sandy backdrop on the horizon.
      every(48, (k) => {
        for (const side of [-1, 1]) {
          const a = anchor(k, side, 150 + hash(k * 42 + side) * 90);
          if (onTrack(a.c[0], a.c[2], 14)) continue;
          peak(a.c[0], a.c[2], pyMin, 60 + hash(k * 43 + side) * 50,
               14 + hash(k * 44 + side) * 12, sand);
        }
      });
      // Marram grass tufts hugging the verge (low organic green/tan greenery).
      every(13, (k) => {
        for (const side of [-1, 1]) {
          if (hash(k * 51 + side) > 0.62) continue;
          bush(k, side, 10 + hash(k * 52 + side) * 16,
               hash(k * 53 + side) < 0.5 ? marramG : marramT);
        }
      });
      hedge(0.18, 0.40, 1, 10, 1.4, marramT);   // dune-ridge marram band (Hunserug)
      hedge(0.32, 0.56, -1, 12, 1.4, marramG);
      hedge(0.58, 0.78, 1, 11, 1.4, marramG);
      hedge(0.62, 0.88, -1, 13, 1.4, marramT);

      // --- Orange-clad Dutch grandstands at the banked corners and pit straight.
      // crowd colour = fanatic Verstappen orange. ---
      const shell = [0.36, 0.38, 0.42], shellLt = [0.40, 0.41, 0.46];
      const orange = [0.95, 0.45, 0.05];
      grandstand(0.02, 1, 11, 30, shellLt, orange); // main stand R (pit straight)
      grandstand(0.04, 1, 9, 30, shell, orange);    // Tarzan hairpin R
      grandstand(0.07, -1, 10, 28, shell, orange);  // Tarzan exit L
      grandstand(0.12, -1, 9, 30, shell, orange);   // Hugenholtz approach L
      grandstand(0.14, -1, 9, 34, shell, orange);   // Hugenholtz T3 banked L
      grandstand(0.17, 1, 10, 28, shellLt, orange); // Hugenholtz exit R
      grandstand(0.50, -1, 12, 30, shell, orange);  // Scheivlak inner L
      grandstand(0.88, 1, 10, 30, shell, orange);   // Luyendyk approach R
      grandstand(0.92, 1, 9, 34, shell, orange);    // Arie Luyendyk final banked R
      grandstand(0.95, 1, 10, 30, shellLt, orange); // Luyendyk exit R
      grandstand(0.96, -1, 11, 30, shellLt, orange); // pit-straight L
      grandstand(0.98, -1, 10, 28, shell, orange);  // pit-straight L exit

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
      for (const s of [0.20, 0.34, 0.50, 0.62, 0.78]) {
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
      every(60, (k) => {
        const side = hash(k * 8) < 0.5 ? -1 : 1;
        const a = anchor(k, side, hw[k] + 110 + hash(k * 7) * 30);
        if (onTrack(a.c[0], a.c[2], 12)) return;
        const cols = [[0.85, 0.25, 0.20], [0.20, 0.45, 0.70], [0.90, 0.85, 0.30], [0.20, 0.60, 0.40]];
        const b = [a.r, a.u, a.t];
        // a short row of huts along the dune base
        for (let i = -1; i <= 1; i++) {
          const hutCol = cols[Math.floor(hash(k * 9 + i * 3) * 4) % 4];
          addBox(out, vadd(vadd(a.c, a.u, 2), a.t, i * 7), [5, 4, 5], hutCol, b);
        }
      });
    },
  }
  );
})();
