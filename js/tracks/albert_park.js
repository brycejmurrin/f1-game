/* Apex 26 — ALBERT PARK circuit definition (data only).
   Registered on the global TrackDefs list; consumed by the js/tracks.js engine
   (palette resolved there from `night`, geometry from js/circuits.js or `segs`). */
(function () {
  "use strict";
  (window.TrackDefs = window.TrackDefs || []).push(
  {
    id: "albert_park",
    name: "ALBERT PARK",
    gp: "Australian GP",
    country: "Australia",
    night: false,
    theme: "green",
    lengthKm: 5.3,
    baseHW: 7,
    pal: { zenith: [0.22, 0.44, 0.82], horizon: [0.74, 0.78, 0.82], grass: [0.24, 0.5, 0.18], runoff: [0.48, 0.42, 0.32], fogDensity: 0.0012, sunDir: [0.6666666666666667, 0.6666666666666667, 0.33333333333333337], sun: [1, 0.95, 0.8], sunColor: [1, 0.93, 0.78] },
    segs: [
      { t: 0, l: 300 }, { t: 50, l: 100 }, { t: -50, l: 90 }, { t: 65, l: 80 }, { t: 0, l: 200 }, { t: 80, l: 90 },
      { t: -90, l: 100 }, { t: 60, l: 90 }, { t: 0, l: 260 }, { t: 80, l: 90 }, { t: 0, l: 200 }, { t: 70, l: 80 },
    ],
    scenery: function (api) {
      const { out, n, px, pz, pyMin, place, prop, backdrop, groundPlane, every, hash,
              grandstand, building, tree, palm, bush, billboard, gantry, anchor, vadd, addBox } = api;
      const k = (s) => Math.round(s * n) % n;

      // ---- Palette (Melbourne lakeside parkland, bright day) ----
      const GRASS = [0.32, 0.62, 0.28];
      const TREE = [0.16, 0.40, 0.20];
      const WATER = [0.20, 0.45, 0.62];
      const WHITE = [0.92, 0.92, 0.92], RED = [0.80, 0.15, 0.15];
      const SHELL = [0.46, 0.47, 0.52], CROWD = [0.70, 0.60, 0.55];

      // ---- Track centre (for skyline / lake placement reference) ----
      let cx = 0, cz = 0;
      for (let i = 0; i < n; i++) { cx += px[i]; cz += pz[i]; }
      cx /= n; cz /= n;

      // ====================================================================
      // ALBERT PARK LAKE — broad flat steel-blue slab to the L horizon, laid as
      // a CONTINUOUS water sheet wrapping the whole skyline side (s≈0.30–0.60 L)
      // ====================================================================
      groundPlane(k(0.45), -1, 70, [1100, 4, 1100], WATER);
      groundPlane(k(0.40), -1, 90, [700, 4, 700], [0.22, 0.47, 0.64]);
      groundPlane(k(0.55), -1, 80, [700, 4, 700], [0.22, 0.47, 0.64]);

      // ====================================================================
      // MELBOURNE CBD SKYLINE — CONTINUOUS dense band of blue-grey towers far
      // across the lake (s≈0.22–0.42 R), varied heights, packed shoulder-to-
      // shoulder with no gaps, backed by a faint unbroken silhouette ridge.
      // ====================================================================
      const CBD_WIN = [0.55, 0.65, 0.80];
      const CBD_N = 34, CBD_S0 = 0.21, CBD_S1 = 0.43;
      for (let i = 0; i < CBD_N; i++) {
        const f = i / (CBD_N - 1);
        const s = CBD_S0 + f * (CBD_S1 - CBD_S0);     // unbroken span across lake
        const dist = 200 + hash(i * 7) * 70;          // far behind the lake
        const w = 14 + hash(i * 3) * 12;              // wide enough to overlap → no gaps
        const h = 60 + hash(i * 11) * 130;            // tall, varied CBD profile
        building(k(s), 1, dist - w / 2, w, h, w, {
          wall: [0.30 + hash(i * 5) * 0.06, 0.36, 0.46], window: CBD_WIN, floor: 6,
        });
      }
      // continuous distant silhouette band behind the towers (overlapping → solid)
      for (let i = 0; i < 22; i++) {
        const f = i / 21;
        backdrop(k(CBD_S0 - 0.02 + f * (CBD_S1 - CBD_S0 + 0.04)), 1,
                 300 + hash(i * 5) * 110,
                 [28 + hash(i * 9) * 24, 40 + hash(i * 13) * 80, 20], [0.40, 0.46, 0.54]);
      }

      // ====================================================================
      // LOW distant Melbourne treeline backdrop, both sides (flat parkland)
      // ====================================================================
      every(80, (kk) => {
        for (const side of [-1, 1]) {
          backdrop(kk, side, 180 + hash(kk * 6 + side) * 70, [120, 18, 100], [0.18, 0.34, 0.20]);
        }
      });

      // ====================================================================
      // PARKLAND — DENSE broadleaf trees + bushes through the park (both sides)
      // ====================================================================
      every(28, (kk) => {
        for (const side of [-1, 1]) {
          if (hash(kk * 21 + side) > 0.78) continue;     // denser fill
          const dist = 24 + hash(kk * 22 + side) * 62;
          tree(kk, side, dist, 8 + hash(kk * 24 + side) * 6, TREE);
          if (hash(kk * 27 + side) > 0.5)               // second tree, staggered
            tree(kk, side, dist + 14 + hash(kk * 29 + side) * 18,
                 7 + hash(kk * 33 + side) * 6, TREE);
          if (hash(kk * 31 + side) > 0.55) bush(kk, side, dist - 5, TREE);
        }
      });
      // dense tree clusters at signature parkland spots (both sides)
      for (const [sc, cnt] of [[0.20, 8], [0.36, 7], [0.70, 7], [0.86, 6]]) {
        for (const side of [-1, 1]) {
          for (let j = 0; j < cnt; j++) {
            const kk = (k(sc) + j) % n;
            tree(kk, side, 22 + hash(kk * 3 + j + sc * 50) * 26,
                 8 + hash(kk * 5 + j) * 6, TREE);
            if (hash(kk * 7 + j) > 0.6) bush(kk, side, 18 + hash(kk * 9 + j) * 10, TREE);
          }
        }
      }

      // ---- Palm avenue along the fast Lakeside Drive section (s≈0.50–0.60 L) ----
      for (let j = 0; j < 18; j++) {
        const kk = (k(0.49) + j) % n;
        palm(kk, -1, 16 + hash(kk * 9 + j) * 10, 10 + hash(kk * 12 + j) * 6, [0.20, 0.46, 0.24]);
        if (hash(kk * 17 + j) > 0.5)
          palm(kk, -1, 30 + hash(kk * 19 + j) * 12, 9 + hash(kk * 23 + j) * 5, [0.20, 0.46, 0.24]);
      }
      // palm clusters by the pits/start and around grandstands as locale flavour
      for (let j = 0; j < 5; j++) {
        palm((k(0.0) + j) % n, 1, 16 + j * 6, 11 + hash(j * 3) * 3, [0.20, 0.46, 0.24]);
        palm((k(0.96) + j) % n, 1, 16 + j * 6, 11 + hash(j * 5) * 3, [0.20, 0.46, 0.24]);
        palm((k(0.62) + j) % n, 1, 40 + j * 6, 10 + hash(j * 7) * 3, [0.20, 0.46, 0.24]);
      }

      // ====================================================================
      // GRANDSTANDS — main straight + signature corners (crowd-tinted)
      // ====================================================================
      grandstand(0.00, -1, 12, 90, SHELL, CROWD);   // main grandstand, pit straight L
      grandstand(0.07, -1, 14, 60, SHELL, CROWD);   // extended pit-straight bank L
      grandstand(0.04, 1, 14, 55, SHELL, CROWD);    // Turn 1-2 sweep R
      grandstand(0.12, 1, 16, 48, SHELL, CROWD);    // Turn 3 exit bank R
      grandstand(0.30, -1, 16, 50, SHELL, CROWD);   // lakeside spectator bank L
      grandstand(0.55, -1, 16, 55, SHELL, CROWD);   // Lakeside Drive bank L
      grandstand(0.62, 1, 14, 60, SHELL, CROWD);    // spectator grandstand R
      grandstand(0.66, 1, 16, 45, SHELL, CROWD);    // adjoining spectator bank R
      grandstand(0.78, -1, 14, 45, SHELL, CROWD);   // chicane complex L
      grandstand(0.90, 1, 18, 50, SHELL, CROWD);    // fan-hill grandstand R

      // ---- Pit building + garages: long low white box row, dark roof (s≈0.0 R)
      building(k(0.0), 1, 5, 14, 9, 180, { wall: [0.86, 0.87, 0.88], window: [0.18, 0.22, 0.28], floor: 4 });
      {
        const a = anchor(k(0.0), 1, 12);
        addBox(out, vadd(a.c, a.u, 9.6), [18, 0.8, 190], [0.30, 0.32, 0.34], [a.r, a.u, a.t]); // dark roof slab
      }
      // marquee tent caps beside the s≈0.62 grandstand
      for (let j = 0; j < 3; j++) {
        const a = anchor(k(0.62), 1, 30 + j * 10);
        addBox(out, vadd(a.c, a.u, 5), [12, 0.6, 12], WHITE, [a.r, a.u, a.t]);
      }

      // ---- Paddock container-stack boxes near pit entry (s≈0.97 L) ----
      for (let j = 0; j < 4; j++) {
        place(k(0.97), -1, 16 + j * 5, [6, 3, 12],
              [[0.70, 0.30, 0.25], [0.30, 0.40, 0.60], [0.80, 0.78, 0.40], [0.55, 0.55, 0.58]][j]);
      }

      // ---- Lakeside grass fan banking / hill (s≈0.90 R) ----
      for (let j = 0; j < 4; j++) {
        place(k(0.90), 1, 17 + j * 8, [30, 2 + j * 1.5, 24], GRASS);
      }

      // ====================================================================
      // KERBS + run-off framing at corner apexes / chicanes
      // ====================================================================
      for (const [s, side] of [[0.04, 1], [0.06, -1], [0.30, 1], [0.62, 1],
                                [0.78, -1], [0.78, 1], [0.80, -1], [0.97, 1]]) {
        place(k(s), side, 2, [0.5, 0.25, 6], side > 0 ? RED : WHITE);
        place(k(s), side, 7, [10, 0.1, 12], GRASS); // grass run-off framing
      }

      // ---- Billboards + start gantry ----
      billboard(k(0.30), 1, 18, 14, 5, [0.20, 0.40, 0.70]);
      billboard(k(0.55), -1, 16, 14, 5, [0.86, 0.30, 0.20]);
      gantry(0.0, 7.5, [0.30, 0.32, 0.36]);

      void prop; void cx; void cz;
    },
  }
  );
})();
