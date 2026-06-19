/* Apex 26 — HUNGARORING circuit definition (data only).
   Registered on the global TrackDefs list; consumed by the js/tracks.js engine
   (palette resolved there from `night`, geometry from js/circuits.js or `segs`). */
(function () {
  "use strict";
  (window.TrackDefs = window.TrackDefs || []).push(
  {
    id: "hungaroring",
    name: "HUNGARORING",
    gp: "Hungarian GP",
    country: "Hungary",
    night: false,
    theme: "green",
    lengthKm: 4.4,
    baseHW: 7,
    pal: { zenith: [0.26, 0.44, 0.72], horizon: [0.7, 0.74, 0.76], grass: [0.22, 0.46, 0.16], runoff: [0.48, 0.44, 0.34], fogDensity: 0.0016, sunDir: [0.7401805851129838, 0.587790464648546, 0.3265502581380811], sun: [1, 0.88, 0.66], sunColor: [1, 0.86, 0.64] },
    segs: [
      { t: 0, l: 300 }, { t: 70, l: 90 }, { t: -50, l: 80 }, { t: 60, l: 80 }, { t: 0, l: 200 }, { t: -80, l: 100 },
      { t: 50, l: 80 }, { t: -60, l: 80 }, { t: 60, l: 80 }, { t: 70, l: 90 }, { t: 0, l: 200 }, { t: -90, l: 100 },
      { t: 70, l: 90 },
    ],
    // Undulating amphitheatre (~36 m): climb from Turn 1, long descent into the back.
    elevations: [{ s: 0.20, halfM: 280, rise: 7 }, { s: 0.55, halfM: 320, rise: -8 }],
    scenery: function (api) {
      const { out, n, px, pz, pyMin, hash, every, place, prop, backdrop, groundPlane,
              mountain, peak, tree, grandstand, building, anchor, vadd, addBox } = api;
      const k = (s) => Math.round(s * n) % n;

      // ---- Dry Hungarian-summer palette ----
      const GRASS = [0.42, 0.55, 0.27];     // base sun-baked grass
      const BANK = [0.58, 0.62, 0.34];      // bleached spectator banking
      const TREE = [0.20, 0.34, 0.18];      // dark tree masses
      const HAZE = [0.62, 0.64, 0.46];      // far haze-tinted hills
      const SHELL = [0.46, 0.47, 0.50];     // grandstand back shell
      const WHITE = [0.90, 0.91, 0.93], RED = [0.82, 0.18, 0.18];
      const WATER = [0.16, 0.30, 0.32];     // dark blue-green pond

      // ---- Continuous low grassy amphitheatre ring wrapping the lap ----
      // organic dry-green hills, NO snow (snowline>1), neighbours overlapping so
      // the bowl reads as one unbroken grassy bank framing the whole circuit.
      let cx = 0, cz = 0;
      for (let i = 0; i < n; i++) { cx += px[i]; cz += pz[i]; }
      cx /= n; cz /= n;
      let rad = 0;
      for (let i = 0; i < n; i++) rad = Math.max(rad, Math.hypot(px[i] - cx, pz[i] - cz));
      // inner continuous grassy banking ring — dense, low, dry-green, no snow.
      // extra=160 ensures (wMin+wVar)*0.62 < extra-8=152 so the guard won't skip these.
      const ring0 = rad + 160;
      for (let i = 0; i < 40; i++) {
        const a = i / 40 * 6.2832, h = hash(i * 7);
        mountain(cx + Math.cos(a) * ring0, cz + Math.sin(a) * ring0, pyMin,
                 80 + h * 50, 16 + h * 8,
                 { seg: 7, seed: i * 13, snowline: 2, forest: GRASS, col: BANK, rock: [0.50, 0.54, 0.36] });
      }
      // second overlapping grassy ring (offset half a step) — fills any seam,
      // slightly taller for stepped-banking depth.
      const ring1 = rad + 230;
      for (let i = 0; i < 32; i++) {
        const a = (i + 0.5) / 32 * 6.2832, h = hash(i * 11 + 90);
        mountain(cx + Math.cos(a) * ring1, cz + Math.sin(a) * ring1, pyMin,
                 250 + h * 90, 24 + h * 12,
                 { seg: 8, seed: i * 17 + 5, snowline: 2, forest: GRASS, col: BANK, rock: [0.52, 0.55, 0.37] });
      }
      // far hazed ridge ring — continuous, warm haze tint, low forested horizon
      const ring2 = rad + 380;
      for (let i = 0; i < 28; i++) {
        const a = (i + 0.25) / 28 * 6.2832, h = hash(i * 11 + 300);
        peak(cx + Math.cos(a) * ring2, cz + Math.sin(a) * ring2, pyMin,
             260 + h * 120, 32 + h * 18, HAZE);
      }

      // ---- Continuous low stepped green banking lining the lap (the amphitheatre) ----
      every(60, (kk) => {
        for (const side of [-1, 1]) {
          const hh = hash(kk * 5 + side);
          backdrop(kk, side, 70 + hh * 60, [120, 14 + hh * 10, 120],
                   hh < 0.5 ? BANK : GRASS);
        }
      });

      // ---- Dark-green tree-cube clumps along the ridge lines (denser) ----
      every(24, (kk) => {
        for (const side of [-1, 1]) {
          const s = hash(kk * 17 + side);
          if (s < 0.30) continue;
          const dist = 44 + s * 64;
          tree(kk, side, dist, 8 + s * 5, TREE);
          if (s > 0.55) tree(kk, side, dist + 9 + s * 12, 9 + s * 4, TREE);
          if (s > 0.78) tree(kk, side, dist + 20 + s * 14, 8 + s * 5, TREE);
        }
      });
      // dense ridge treeline mass (s≈0.30 far L) and crest clumps (s≈0.62 far R)
      const clump = (s, side, dist) => {
        for (let j = 0; j < 5; j++) {
          const kk = (k(s) + j) % n;
          tree(kk, side, dist + hash(kk * 3 + j) * 18, 8 + hash(kk * 9 + j) * 5, TREE);
        }
      };
      clump(0.30, -1, 80);
      clump(0.62, 1, 90);

      // ---- s=0: new pit complex (L) facing the main covered grandstand (R) ----
      // Long low white/grey pit slab with a thin VIP terrace stacked on top.
      building(k(0.00), -1, 9, 14, 10, 70, { wall: WHITE, window: [0.36, 0.42, 0.48], floor: 5 });
      {
        const a = anchor(k(0.00), -1, 9);
        addBox(out, vadd(a.c, a.u, 11.5), [10, 2.6, 50], [0.80, 0.82, 0.86], [a.r, a.u, a.t]); // VIP terrace box
        addBox(out, vadd(a.c, a.u, 13.2), [14, 0.7, 64], [0.84, 0.86, 0.90], [a.r, a.u, a.t]); // roof blade
      }
      // pit wall + garage strip with red kerb trim
      place(k(0.02), -1, 3, [70, 1.3, 0.8], WHITE);
      place(k(0.02), -1, 2, [70, 0.3, 0.4], RED);
      // Main covered grandstand (R), big stepped wedge with dark roof
      grandstand(0.00, 1, 9, 90, SHELL, [0.50, 0.52, 0.58]);

      // ---- Turn 1 (s≈0.06): tall stacked spectator banking + pond in the basin ----
      grandstand(0.06, 1, 10, 50, SHELL, [0.55, 0.32, 0.30]);
      backdrop(k(0.06), 1, 40, [90, 22, 70], BANK);            // tall stepped banking
      groundPlane(k(0.08), 1, 70, [80, 1.0, 60], WATER);        // small lake in valley floor

      // ---- s≈0.12 L: grass amphitheatre hill dotted with tree clumps ----
      backdrop(k(0.12), -1, 36, [110, 18, 90], BANK);
      clump(0.12, -1, 50);

      // ---- s≈0.18 R: low grandstand bleacher facing the slow complex ----
      grandstand(0.18, 1, 11, 44, SHELL, [0.50, 0.52, 0.56]);

      // ---- Twisty middle sector: densely lined with stands + banking ----
      backdrop(k(0.30), -1, 40, [110, 16, 100], BANK);          // s≈0.30 banking under treeline
      grandstand(0.32, -1, 11, 34, SHELL, [0.50, 0.52, 0.56]);
      backdrop(k(0.40), 1, 44, [100, 16, 90], BANK);            // s≈0.40 mid-sector banking
      grandstand(0.40, 1, 12, 36, SHELL, [0.55, 0.32, 0.30]);
      grandstand(0.47, 1, 11, 30, SHELL, [0.50, 0.52, 0.56]);  // s≈0.47 infill stand
      backdrop(k(0.50), -1, 38, [100, 16, 90], BANK);
      grandstand(0.55, -1, 11, 40, SHELL, [0.50, 0.52, 0.56]); // s≈0.55 twisty-sector stand
      grandstand(0.58, 1, 12, 32, SHELL, [0.55, 0.32, 0.30]);  // s≈0.58 opposite stand
      clump(0.50, 1, 56);
      clump(0.58, -1, 60);
      backdrop(k(0.62), 1, 90, [140, 20, 120], HAZE);          // s≈0.62 distant haze hill
      grandstand(0.68, -1, 11, 34, SHELL, [0.50, 0.52, 0.56]); // s≈0.68 exit-of-sector stand
      clump(0.68, 1, 58);

      // ---- s≈0.75 L: open dry-green run-off bank ----
      backdrop(k(0.75), -1, 34, [110, 14, 90], GRASS);

      // ---- s≈0.90 R: approach grandstand leading back to the line ----
      grandstand(0.90, 1, 11, 50, SHELL, [0.55, 0.32, 0.30]);

      // ---- Red/white kerb accents + grass framing at key apexes ----
      for (const [s, side] of [[0.06, 1], [0.12, -1], [0.18, 1], [0.40, 1], [0.55, -1], [0.90, 1]]) {
        place(k(s), side, 2, [0.4, 0.25, 6], side > 0 ? RED : WHITE);
        place(k(s), side, 6, [10, 0.08, 12], GRASS);
      }
      void prop;
    },
  }
  );
})();
