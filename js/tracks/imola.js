/* Apex 26 — IMOLA circuit definition (data only).
   Registered on the global TrackDefs list; consumed by the js/tracks.js engine
   (palette resolved there from `night`, geometry from js/circuits.js or `segs`). */
(function () {
  "use strict";
  (window.TrackDefs = window.TrackDefs || []).push(
  {
    id: "imola",
    name: "IMOLA",
    gp: "Emilia Romagna GP",
    country: "Italy",
    night: false,
    theme: "green",
    lengthKm: 4.9,
    baseHW: 7,
    pal: { zenith: [0.24, 0.44, 0.74], horizon: [0.72, 0.76, 0.74], grass: [0.24, 0.46, 0.16], runoff: [0.44, 0.42, 0.36], sunDir: [0.7874615506676528, 0.5468482990747588, 0.2843611155188746], sun: [1, 0.9, 0.65], sunColor: [1, 0.88, 0.62] },
    segs: [
      { t: 0, l: 450 }, { t: -90, l: 100 }, { t: 60, l: 90 }, { t: 0, l: 300 }, { t: -70, l: 90 }, { t: 60, l: 80 },
      { t: 80, l: 100 }, { t: 0, l: 400 }, { t: 80, l: 100 }, { t: -60, l: 80 }, { t: 0, l: 180 }, { t: 80, l: 90 },
      { t: -100, l: 110 },
    ],
    // Hilly Italian classic (~40 m): dip to Acque Minerali, climb to Piratella,
    // then the descent through the Rivazza.
    elevations: [{ s: 0.28, halfM: 300, rise: -6 }, { s: 0.52, halfM: 300, rise: 10 }, { s: 0.78, halfM: 240, rise: -5 }],
    scenery: function (api) {
      const { out, n, px, pz, pyMin, hash, every, place, prop, backdrop, groundPlane,
              addBox, vadd, anchor, mountain, tree, pine, hedge, bush,
              grandstand, building, billboard, marshalPost } = api;
      const K = (s) => Math.round(s * n) % n;

      // ---- Palette (Imola riverside parkland greens) ----
      const CANOPY = [0.20, 0.46, 0.22];   // sunlit deciduous canopy
      const WOODS  = [0.11, 0.30, 0.15];   // shaded woods
      const BANK   = [0.42, 0.63, 0.30];   // sunlit grass bank
      const RIVER  = [0.30, 0.42, 0.34];   // muted green-brown Santerno water
      const GRAVEL = [0.78, 0.70, 0.52];   // pale tan gravel
      const RED    = [0.82, 0.16, 0.14];
      const WHITE  = [0.92, 0.92, 0.90];

      // ---- Encircling WOODED IMOLA HILLS — CONTINUOUS green ring, no snow (snowline > 1) ----
      // Centre-based ring so peaks sit on the horizon, not in the infield.
      // Counts are sized so neighbouring peaks overlap (touch) — an unbroken wooded wall.
      let cx = 0, cz = 0;
      for (let i = 0; i < n; i++) { cx += px[i]; cz += pz[i]; }
      cx /= n; cz /= n;
      let rad = 0;
      for (let i = 0; i < n; i++) rad = Math.max(rad, Math.hypot(px[i] - cx, pz[i] - cz));
      const ranges = [
        // near low wooded hills — wMin sized so w*0.62 < extra-8 (guard won't fire)
        { extra: 230, wMin: 140, hMin: 38, hVar: 28, wVar: 80, count: 26, seg: 7,
          opts: { snowline: 2, forest: [0.13, 0.32, 0.16], rock: [0.30, 0.40, 0.26], col: [0.18, 0.36, 0.20] } },
        // mid wooded hills — fills the gaps behind the near ring
        { extra: 380, wMin: 220, hMin: 58, hVar: 40, wVar: 80, count: 20, seg: 7,
          opts: { snowline: 2, forest: [0.17, 0.38, 0.20], rock: [0.36, 0.46, 0.34], col: [0.21, 0.40, 0.23] } },
        // far hazed wooded ridges — paler green, still no snow; continuous backdrop
        { extra: 540, wMin: 320, hMin: 82, hVar: 52, wVar: 80, count: 16, seg: 7,
          opts: { snowline: 2, forest: [0.20, 0.42, 0.22], rock: [0.40, 0.48, 0.40], col: [0.24, 0.42, 0.26] } },
      ];
      for (const rg of ranges) {
        const ring = rad + rg.extra;
        for (let i = 0; i < rg.count; i++) {
          const a = (i + rg.extra * 0.004) / rg.count * 6.2832, h = hash(i * 7 + rg.extra);
          const w = rg.wMin + h * rg.wVar;
          mountain(cx + Math.cos(a) * ring, cz + Math.sin(a) * ring, pyMin,
                   w, rg.hMin + h * rg.hVar,
                   Object.assign({ seg: rg.seg, seed: i * 13 + rg.extra }, rg.opts));
        }
      }
      // Tiered dark-green box ridges settling behind the trackside treeline (Imola hills enclosing the back).
      every(70, (k) => {
        for (const side of [-1, 1]) {
          backdrop(k, side, 150 + hash(k * 13 + side) * 90, [190, 38, 190], [0.16, 0.34, 0.18]);
        }
      });

      // ---- DENSE PARKLAND: deciduous canopy + conifers walling both sides ----
      every(18, (k) => {
        for (const side of [-1, 1]) {
          const s = hash(k * 41 + side);
          if (s < 0.22) continue;
          const dist = 9 + s * 20, h = 9 + s * 8;
          if (s < 0.62) tree(k, side, dist, h, [0.18 + s * 0.06, 0.44, 0.21]);
          else pine(k, side, dist, h + 2, [0.10 + s * 0.04, 0.30, 0.15]);
        }
      });
      // Second, deeper rank of forest behind the first wall for thickness.
      every(30, (k) => {
        for (const side of [-1, 1]) {
          const s = hash(k * 67 + side * 5);
          if (s < 0.46) continue;
          const dist = 30 + s * 26, h = 12 + s * 8;
          if (s < 0.70) pine(k, side, dist, h + 2, WOODS);
          else tree(k, side, dist, h, [0.15 + s * 0.05, 0.40, 0.19]);
        }
      });
      // Sunlit broadleaf verge trees scattered between.
      every(70, (k) => {
        const h = hash(k * 53 + 9);
        if (h < 0.45) return;
        tree(k, h < 0.7 ? -1 : 1, 13 + h * 9, 11 + h * 6, CANOPY);
      });

      // ---- s 0.00 R — Santerno river: CONTINUOUS flat water slab paralleling the river run ----
      // Overlapping slabs from the pit straight through the run to Tosa, no gaps.
      for (let i = 0; i <= 10; i++) {
        const s = i * 0.018;            // 0.00 → 0.18, the river-side stretch
        groundPlane(K(s), 1, 15, [34, 90], RIVER);
      }
      groundPlane(K(0.00), 1, 16, [70, 220], RIVER);
      groundPlane(K(0.05), 1, 18, [60, 180], RIVER);
      // grassy bank between road and river, running the whole river stretch
      groundPlane(K(0.02), 1, 6, [16, 200], BANK);
      groundPlane(K(0.10), 1, 6, [16, 160], BANK);
      // tree line hugging the back run to Tosa (s≈0.20, right, mid)
      hedge(0.16, 0.26, 1, 26, 7, WOODS);

      // ---- s 0.00 L — Old pit building + main grandstand on the pit straight ----
      building(K(0.00), -1, 9, 16, 11, 130, { wall: [0.58, 0.60, 0.63], window: [0.34, 0.36, 0.40], floor: 5 });
      // red trim row fronting the old pit building
      prop(K(0.01), -1, 7, [2.5, 1.6, 120], RED);
      grandstand(0.965, -1, 10, 90, [0.55, 0.58, 0.62], RED);
      // packed start-straight stands opposite the pits (river side) + extra pit-straight stand
      grandstand(0.02, 1, 22, 80, [0.52, 0.55, 0.60], [0.78, 0.30, 0.22]);
      grandstand(0.93, -1, 10, 70, [0.55, 0.58, 0.62], RED);

      // ---- s 0.05 L — Tamburello chicane + Ayrton Senna memorial ----
      // green lawn with a small bronze statue box reading as the memorial
      groundPlane(K(0.05), -1, 8, [26, 30], BANK);
      place(K(0.05), -1, 14, [2, 3.2, 2], [0.45, 0.40, 0.30]);   // bronze Senna memorial
      tree(K(0.05), -1, 22, 12, CANOPY);
      // red/white kerb accents
      place(K(0.05), -1, 2, [0.4, 0.3, 7], RED);
      place(K(0.06), -1, 2, [0.4, 0.3, 7], WHITE);

      // ---- s 0.12 L — Villeneuve chicane kerbs + gravel trap beyond ----
      groundPlane(K(0.12), -1, 5, [24, 30], GRAVEL);
      place(K(0.12), -1, 2, [0.4, 0.3, 7], RED);
      place(K(0.13), -1, 2, [0.4, 0.3, 7], WHITE);

      // ---- s 0.28 L — Tosa tight hairpin: stepped grandstand + gravel run-off ----
      grandstand(0.28, -1, 12, 60, [0.52, 0.55, 0.60], RED);
      grandstand(0.31, -1, 12, 50, [0.54, 0.57, 0.61], [0.20, 0.42, 0.72]);
      groundPlane(K(0.28), -1, 6, [34, 40], GRAVEL);

      // ---- s 0.35 L+R far — Piratella blind hill-crest: dark wooded green walls ----
      for (const side of [-1, 1]) {
        backdrop(K(0.35), side, 70 + side * 6, [60, 30, 90], [0.14, 0.32, 0.17]);
        pine(K(0.35), side, 30, 13, WOODS);
        pine(K(0.36), side, 24, 12, WOODS);
      }

      // ---- s 0.50 R mid — Acque Minerali right-left in a green hollow: dense trees + fog ----
      for (let i = 0; i < 6; i++) {
        const k = K(0.48 + i * 0.012);
        pine(k, 1, 16 + hash(k * 9) * 14, 12 + hash(k * 5) * 6, WOODS);
        tree(k, 1, 30 + hash(k * 7) * 16, 11, WOODS);
      }
      // thin fog band lingering in the river-valley hollow
      groundPlane(K(0.50), 1, 10, [40, 60], [0.74, 0.78, 0.74]);

      // ---- s 0.60 L far — Wooded hills backdrop: tiered dark-green box ridges ----
      for (let i = 0; i < 4; i++) {
        backdrop(K(0.58 + i * 0.012), -1, 100 + i * 18, [120, 26 + i * 6, 80], [0.16, 0.34, 0.18]);
      }

      // ---- s 0.66 L+R near — Variante Alta chicane over a crest: tall sausage kerbs ----
      for (const side of [-1, 1]) {
        place(K(0.66), side, 2, [0.7, 0.5, 8], RED);
        place(K(0.67), side, 2, [0.7, 0.5, 8], WHITE);
      }
      bush(K(0.66), -1, 10, BANK);

      // ---- s 0.80 L mid — Rivazza double-left descent: grass banks, gravel, grandstand ----
      grandstand(0.80, -1, 12, 55, [0.52, 0.55, 0.60], RED);
      grandstand(0.84, -1, 12, 48, [0.54, 0.57, 0.61], [0.78, 0.30, 0.22]);
      groundPlane(K(0.80), -1, 6, [30, 50], GRAVEL);
      groundPlane(K(0.81), -1, 14, [40, 60], BANK);
      // shaded fog dip at Rivazza
      groundPlane(K(0.82), -1, 8, [30, 40], [0.74, 0.78, 0.74]);

      // ---- s 0.92 R near — Variante Bassa / pit approach kerbs back toward river ----
      place(K(0.92), 1, 2, [0.4, 0.3, 7], RED);
      place(K(0.93), 1, 2, [0.4, 0.3, 7], WHITE);
      groundPlane(K(0.92), 1, 16, [50, 120], RIVER);   // river rejoins by pit straight

      // ---- Advertising hoardings + marshal posts for rhythm ----
      billboard(K(0.28), -1, 16, 12, 5, [0.86, 0.30, 0.20]);
      billboard(K(0.80), -1, 16, 12, 5, [0.20, 0.40, 0.70]);
      every(130, (k) => {
        marshalPost(k, hash(k * 33) < 0.5 ? -1 : 1, 4);
      });

      // ---- thin cantilever roof blade over the old pit lane ----
      {
        const a = anchor(K(0.00), -1, 12);
        addBox(out, vadd(a.c, a.u, 12), [18, 0.7, 120], [0.66, 0.68, 0.70], [a.r, a.u, a.t]);
      }
    },
  }
  );
})();
