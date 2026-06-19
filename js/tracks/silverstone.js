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
      const { out, n, px, pz, pyMin, place, prop, backdrop, every, onTrack, hash,
              grandstand, building, hedge, tree, bush, billboard, gantry, mountain, anchor, vadd, addBox } = api;
      const k = (s) => Math.round(s * n) % n;

      // ---- Palette (English-countryside green / overcast) ----
      const COPSE = [0.18, 0.38, 0.20];   // dark-green tree copses / hedgerows
      const GRASS = [0.30, 0.55, 0.25];
      const WHITE = [0.92, 0.92, 0.92], RED = [0.85, 0.15, 0.15];

      // ---- LOW distant Northamptonshire treeline backdrop (flat — no snow) ----
      // Dense unbroken band wrapping every node, both sides — no gaps.
      every(38, (kk) => {
        for (const side of [-1, 1]) {
          backdrop(kk, side, 195 + hash(kk * 6 + side) * 60, [150, 15, 150], [0.22, 0.34, 0.20]);
          backdrop(kk, side, 260 + hash(kk * 9 + side) * 70, [170, 12, 170], [0.20, 0.31, 0.19]);
        }
      });
      // very low, soft organic green rises far out (snowline > 1 = never snowy),
      // placed as a CONTINUOUS ring from track centre so the horizon never breaks.
      let cx = 0, cz = 0;
      for (let i = 0; i < n; i++) { cx += px[i]; cz += pz[i]; }
      cx /= n; cz /= n;
      let rad = 0;
      for (let i = 0; i < n; i++) rad = Math.max(rad, Math.hypot(px[i] - cx, pz[i] - cz));
      // two overlapping rings of low green rises — dense enough to read as a wall
      for (const [extra, count, wMin, hMin, hVar, fc, rc] of [
        [270, 42, 180, 20, 14, [0.22, 0.40, 0.22], [0.28, 0.44, 0.26]],
        [370, 36, 220, 24, 14, [0.18, 0.36, 0.20], [0.24, 0.40, 0.24]],
        [470, 30, 260, 28, 16, [0.16, 0.32, 0.18], [0.22, 0.38, 0.22]],
      ]) {
        const ring = rad + extra;
        const span = 2 * Math.PI * ring / count;
        for (let i = 0; i < count; i++) {
          const a = (i / count + hash(i + extra) * 0.05) * 6.2832, h = hash(i * 7 + extra);
          mountain(cx + Math.cos(a) * ring, cz + Math.sin(a) * ring, pyMin,
                   Math.max(wMin + h * 120, span * 1.5), hMin + h * hVar,
                   { snowline: 2, seg: 7, seed: i * 13 + extra, forest: fc, rock: rc });
        }
      }

      // ---- Hedgerow-gridded flat farmland (s≈0.60) + perimeter hedgerows ----
      // denser farmland grid — long low green strips wrapping most of the lap
      hedge(0.58, 0.66, -1, 70, 2.4, COPSE);
      hedge(0.58, 0.66, 1, 85, 2.4, COPSE);
      hedge(0.20, 0.30, 1, 95, 2.2, COPSE);
      hedge(0.85, 0.95, -1, 80, 2.2, COPSE);
      hedge(0.06, 0.14, 1, 105, 2.2, COPSE);   // outside Copse → Maggotts
      hedge(0.32, 0.40, 1, 100, 2.3, COPSE);   // Stowe → Club outfield
      hedge(0.66, 0.74, 1, 90, 2.2, COPSE);    // beyond The Loop
      hedge(0.74, 0.84, -1, 95, 2.2, COPSE);   // Brooklands approach
      hedge(0.16, 0.24, -1, 110, 2.2, COPSE);  // far infield copse line

      // ---- Oak copses (Chapel/Cheese Copse, s≈0.15 L; scattered elsewhere) ----
      const copse = (s, side, dist) => {
        for (let j = 0; j < 5; j++) {
          const kk = (k(s) + j) % n;
          tree(kk, side, dist + hash(kk * 3 + j) * 16, 9 + hash(kk * 5 + j) * 5, COPSE);
        }
        bush(k(s), side, dist - 4, COPSE);
      };
      copse(0.15, -1, 90);
      copse(0.62, 1, 75);
      copse(0.70, -1, 70);
      copse(0.24, 1, 110);   // Stowe outfield copse
      copse(0.45, -1, 100);  // far side of The Wing infield
      copse(0.78, 1, 95);    // Brooklands outfield
      copse(0.90, -1, 85);   // Luffield / Woodcote approach
      // denser single oaks around the airfield perimeter
      every(95, (kk) => {
        for (const side of [-1, 1]) {
          if (hash(kk * 21 + side) > 0.62) continue;
          tree(kk, side, 55 + hash(kk * 22 + side) * 75, 8 + hash(kk * 24 + side) * 5, COPSE);
          if (hash(kk * 31 + side) > 0.7) bush(kk, side, 48 + hash(kk * 33 + side) * 20, COPSE);
        }
      });

      // ---- Big grandstands at the signature corners ----
      grandstand(0.04, 1, 12, 70, [0.46, 0.47, 0.52], [0.55, 0.32, 0.30]); // Copse
      grandstand(0.12, -1, 14, 55, [0.46, 0.47, 0.52], [0.50, 0.34, 0.32]); // Maggotts/Becketts
      grandstand(0.30, 1, 16, 75, [0.46, 0.47, 0.52], [0.58, 0.30, 0.30]); // Stowe
      grandstand(0.40, 1, 12, 80, [0.46, 0.47, 0.52], [0.55, 0.32, 0.30]); // Club
      grandstand(0.66, -1, 14, 45, [0.46, 0.47, 0.52], [0.50, 0.34, 0.32]); // The Loop
      grandstand(0.85, -1, 14, 55, [0.46, 0.47, 0.52], [0.55, 0.32, 0.30]); // Brooklands/Luffield
      grandstand(0.07, 1, 13, 55, [0.46, 0.47, 0.52], [0.52, 0.32, 0.32]); // Copse exit (fast)
      grandstand(0.13, 1, 15, 50, [0.46, 0.47, 0.52], [0.55, 0.30, 0.30]); // Becketts outfield
      grandstand(0.55, 1, 16, 60, [0.46, 0.47, 0.52], [0.50, 0.34, 0.32]); // Abbey (fast)
      grandstand(0.88, -1, 13, 48, [0.46, 0.47, 0.52], [0.58, 0.30, 0.30]); // Luffield exit

      // ---- The Wing: long low pit/paddock building with a thin roof blade (s≈0.45 R) ----
      // sweeping white-grey slab, far longer than tall, dark glazing band
      building(k(0.45), 1, 12, 16, 12, 200, {
        wall: [0.80, 0.81, 0.84], window: [0.16, 0.20, 0.26], floor: 5 });
      // thin cantilevered roof fin running the length of the building
      {
        const a = anchor(k(0.45), 1, 12);
        addBox(out, vadd(a.c, a.u, 13.2), [22, 0.7, 210], [0.86, 0.88, 0.92], [a.r, a.u, a.t]);
      }
      // tall stepped Wing grandstands flanking it (s≈0.46 R)
      grandstand(0.46, 1, 11, 90, [0.50, 0.51, 0.56], [0.58, 0.30, 0.30]);
      // BRDC clubhouse set back (s≈0.48 R)
      building(k(0.48), 1, 40, 24, 9, 20, { wall: [0.78, 0.78, 0.74], window: [0.20, 0.26, 0.32] });

      // ---- Advertising hoardings (Abbey run-off s≈0.55 R) ----
      billboard(k(0.55), 1, 18, 14, 5, [0.86, 0.30, 0.20]);
      billboard(k(0.30), 1, 22, 14, 5, [0.20, 0.40, 0.70]);

      // ---- Start gantry over Woodcote / start-finish ----
      gantry(0.0, 7.5, [0.30, 0.32, 0.36]);

      // ---- Red/white kerb accent boxes + green run-off framing at apexes ----
      for (const [s, side] of [[0.04, 1], [0.12, -1], [0.12, 1], [0.30, 1], [0.40, 1], [0.55, 1], [0.66, -1], [0.85, -1]]) {
        place(k(s), side, 2, [0.4, 0.25, 6], side > 0 ? RED : WHITE);
        place(k(s), side, 7, [10, 0.1, 12], GRASS); // run-off / grass framing slab
      }
      // silence unused-guard lint helpers
      void onTrack; void WHITE; void prop;
    },
  }
  );
})();
