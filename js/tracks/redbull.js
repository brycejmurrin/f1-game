/* Apex 26 — RED BULL RING circuit definition (data only).
   Registered on the global TrackDefs list; consumed by the js/tracks.js engine
   (palette resolved there from `night`, geometry from js/circuits.js or `segs`). */
(function () {
  "use strict";
  (window.TrackDefs = window.TrackDefs || []).push(
  {
    id: "redbull",
    name: "RED BULL RING",
    gp: "Austrian GP",
    country: "Austria",
    night: false,
    theme: "green",
    lengthKm: 4.3,
    baseHW: 7,
    pal: { zenith: [0.26, 0.46, 0.8], horizon: [0.66, 0.76, 0.86], grass: [0.22, 0.52, 0.18], runoff: [0.42, 0.38, 0.3], fogDensity: 0.0012, sunDir: [0.59693248550091, 0.6446870843409829, 0.47754598840072804], sun: [1, 0.94, 0.82], sunColor: [1, 0.92, 0.8] },
    segs: [
      { t: 0, l: 280 }, { t: -90, l: 100, h: 12 }, { t: 90, l: 90 }, { t: -100, l: 110, h: 8 }, { t: 80, l: 90 }, { t: 0, l: 220, h: -10 },
      { t: -70, l: 80 }, { t: 80, l: 90 }, { t: 0, l: 480, h: -10 }, { t: 80, l: 100 }, { t: -60, l: 80 }, { t: 80, l: 90 },
    ],
    // Steep alpine circuit (~65 m top-to-bottom): climb out of Turn 1, long
    // descent through the back of the lap.
    elevations: [{ s: 0.10, halfM: 240, rise: 10 }, { s: 0.40, halfM: 320, rise: -8 }],
    scenery: function (api) {
      const { out, n, px, pz, py, pyMin, hw, ds, hash, every, prop, place, addBox, vadd, mountain, peak, ridge, pine, tree, bush, hedge, grandstand, building, tower, billboard, gantry, marshalPost, fence, guardrail, tyreWall, wall, anchor, along, addCyl, addCone, addPrism, addPyramid, addFrustum, onTrack, groundYAt } = api;

      // --- Styrian Alps: an unbroken ring wrapping the whole lap. A forested near
      // range (light snow on the tops) and a far range of snow-capped grey-blue
      // peaks. Overlapping organic colour-zoned summits, neighbours touching so the
      // wall reads as continuous with no gaps. Lower seg keeps the vert budget sane
      // across many more peaks.
      let cx = 0, cz = 0;
      for (let i = 0; i < n; i++) { cx += px[i]; cz += pz[i]; }
      cx /= n; cz /= n;
      let rad = 0;
      for (let i = 0; i < n; i++) rad = Math.max(rad, Math.hypot(px[i] - cx, pz[i] - cz));
      const ranges = [
        { extra: 260, wMin: 180, hMin: 64, hVar: 64, count: 44, seg: 8, opts: { forest: [0.18, 0.34, 0.20], rock: [0.34, 0.34, 0.30], snow: [0.92, 0.94, 0.98], snowline: 0.82 } },
        { extra: 360, wMin: 300, hMin: 130, hVar: 90,  count: 40, seg: 8, opts: { forest: [0.24, 0.38, 0.30], rock: [0.46, 0.48, 0.50], snow: [0.94, 0.95, 0.99], snowline: 0.58 } },
        { extra: 560, wMin: 360, hMin: 180, hVar: 120, count: 34, seg: 7, opts: { forest: [0.30, 0.42, 0.38], rock: [0.52, 0.54, 0.56], snow: [0.95, 0.96, 1.0], snowline: 0.46 } },
      ];
      for (const rg of ranges) {
        const ring = rad + rg.extra;
        // chord spacing between neighbours; widen each peak so feet overlap.
        const span = 2 * Math.PI * ring / rg.count;
        for (let i = 0; i < rg.count; i++) {
          const h = hash(i * 7 + rg.extra), j = hash(i * 19 + rg.extra + 3);
          const a = (i + (j - 0.5) * 0.35) / rg.count * 6.2832;   // jittered angle for an organic skyline
          const w = Math.max(rg.wMin + h * 130, span * 1.55);     // ensure neighbours touch
          mountain(cx + Math.cos(a) * ring, cz + Math.sin(a) * ring, pyMin,
                   w, rg.hMin + h * rg.hVar, Object.assign({ seg: rg.seg, seed: i * 13 + rg.extra }, rg.opts));
        }
      }

      // --- Mid/far layered forested ridges between the lap and the high peaks, so
      // the horizon reads as wave upon wave of Styrian pine slopes.
      {
        const ringR = rad + 180;
        for (let i = 0; i < 30; i++) {
          const h = hash(i * 23 + 71), a = i / 30 * 6.2832 + 0.1;
          ridge(cx + Math.cos(a) * ringR, cz + Math.sin(a) * ringR, pyMin,
                a + 1.5708, 150 + h * 120, 90 + h * 60, 30 + h * 30,
                [0.16 + h * 0.06, 0.30 + h * 0.06, 0.18 + h * 0.04]);
        }
      }

      // --- Dense pine forest blanketing the hills, both lining the lap and filling
      // the slopes behind the near grandstands. Three passes of varying spacing.
      every(7, (k) => {
        const s = hash(k * 41);
        if (s < 0.18) return;
        pine(k, s < 0.6 ? -1 : 1, 8 + s * 13, 9 + s * 9, [0.10, 0.26, 0.13]);
        const s2 = hash(k * 67 + 5);
        if (s2 > 0.45) pine(k, s2 < 0.7 ? -1 : 1, 20 + s2 * 22, 8 + s2 * 8, [0.11 + s2 * 0.06, 0.28, 0.14]);
        const s3 = hash(k * 91 + 13);
        if (s3 > 0.6) pine(k, s3 < 0.78 ? -1 : 1, 38 + s3 * 30, 11 + s3 * 9, [0.13 + s3 * 0.05, 0.30, 0.15]);
      });
      // A few broadleaf trees and low bushes near the edges for variety.
      every(26, (k) => {
        const s = hash(k * 53 + 9);
        if (s > 0.5) tree(k, s < 0.75 ? -1 : 1, 11 + s * 8, 7 + s * 5, [0.20 + s * 0.06, 0.42, 0.18]);
        const sb = hash(k * 31 + 4);
        if (sb > 0.55) bush(k, sb < 0.78 ? 1 : -1, 6 + sb * 4, [0.20, 0.40, 0.17]);
      });

      // ---------------- Track furniture (continuous, both sides) ----------------
      // Armco guardrail backed by catch fencing around the whole lap edge.
      guardrail(0.0, 1.0, -1, 3.2, [0.86, 0.86, 0.90]);
      guardrail(0.0, 1.0, 1, 3.2, [0.86, 0.86, 0.90]);
      fence(0.0, 1.0, -1, 4.2, 4.5, [0.74, 0.76, 0.80]);
      fence(0.0, 1.0, 1, 4.2, 4.5, [0.74, 0.76, 0.80]);

      // Big braking-zone tyre walls on the outside of the heavy stops (T1, T3, T4).
      const rbRed = [0.82, 0.10, 0.16], rbNavy = [0.10, 0.14, 0.40], rbYel = [0.95, 0.80, 0.10];
      tyreWall(0.08, 0.13, 1, 6.5, rbRed);    // outside Turn 1 (Niki Lauda)
      tyreWall(0.20, 0.25, 1, 6.5, rbYel);    // outside Turn 3 (Remus) crest
      tyreWall(0.32, 0.37, -1, 6.5, rbRed);   // outside Turn 4 (Schlossgold)
      tyreWall(0.72, 0.77, -1, 6.0, rbNavy);

      // Marshal posts spaced around the lap (orange-roofed huts + flag poles).
      for (const [s, side] of [[0.05, -1], [0.15, 1], [0.27, -1], [0.40, 1], [0.52, -1], [0.66, 1], [0.80, -1], [0.92, 1]]) {
        marshalPost(Math.round(n * s) % n, side, 5.5);
      }

      // Trackside advertising hoardings around the lap.
      for (const [s, side, col] of [
        [0.04, 1, rbRed], [0.12, 1, rbNavy], [0.18, -1, rbYel], [0.30, 1, rbRed],
        [0.44, -1, rbNavy], [0.58, 1, rbRed], [0.68, -1, rbYel], [0.82, 1, rbNavy], [0.88, -1, rbRed],
      ]) billboard(Math.round(n * s) % n, side, 7, 11, 3.4, col);

      // ---------------- The Wing — pit & paddock complex ----------------
      // Long low white pit building with a thin cantilevered roof blade.
      prop(0, -1, 6, [11, 8, 70], [0.92, 0.93, 0.95]);
      {
        const a = anchor(0, -1, 10);
        addBox(out, vadd(a.c, a.u, 11), [14, 0.7, 66], [0.86, 0.88, 0.92], [a.r, a.u, a.t]);   // roof blade
        // slim pillars under the blade
        for (let i = -2; i <= 2; i++) addCyl(out, vadd(a.c, a.t, i * 14), 0.3, 11, [0.7, 0.72, 0.76], 5, [a.r, a.u, a.t]);
      }
      // Paddock hospitality blocks behind the pits.
      building(0, -1, 26, 18, 9, 22, { wall: [0.88, 0.90, 0.93], window: [0.20, 0.30, 0.42], floor: 4, roof: true });
      building(0.04, -1, 26, 16, 7, 18, { wall: [0.80, 0.82, 0.86], window: [0.22, 0.32, 0.42], floor: 4 });
      building(0.96, -1, 26, 16, 8, 20, { wall: [0.86, 0.88, 0.92], window: [0.20, 0.30, 0.42], floor: 4, roof: true });
      // Race-control / media tower over the start.
      tower(0.01, -1, 18, 9, 26, { col: [0.80, 0.82, 0.86], cap: true, capCol: rbNavy, mast: 7 });

      // Start/finish gantry + a second scoring gantry down the straight.
      gantry(0.005, 7.5, [0.12, 0.13, 0.16]);
      gantry(0.045, 7.0, [0.12, 0.13, 0.16]);

      // ---------------- Signature landmarks ----------------
      // Giant charging-bull statue on the green hillside above the lower sector,
      // framed by a tall white archway (the Bull Plaza icon).
      {
        const kb = Math.round(n * 0.10) % n, a = anchor(kb, -1, 70);
        const white = [0.90, 0.90, 0.93], dark = [0.10, 0.10, 0.12];
        addBox(out, vadd(vadd(a.c, a.r, -11), a.u, 12), [3, 24, 3], white, [a.r, a.u, a.t]);   // arch posts
        addBox(out, vadd(vadd(a.c, a.r, 11), a.u, 12), [3, 24, 3], white, [a.r, a.u, a.t]);
        addBox(out, vadd(a.c, a.u, 24), [26, 3, 4.5], white, [a.r, a.u, a.t]);                 // lintel
        // pedestal
        addBox(out, vadd(a.c, a.u, 1.5), [12, 3, 7], [0.55, 0.56, 0.58], [a.r, a.u, a.t]);
        // bull body (lunging) + legs + head + horns
        addBox(out, vadd(a.c, a.u, 7), [13, 6.5, 5], dark, [a.r, a.u, a.t]);                   // body
        addBox(out, vadd(vadd(a.c, a.t, 7), a.u, 6), [4.5, 5, 3.5], dark, [a.r, a.u, a.t]);    // head
        addPrism(out, vadd(vadd(vadd(a.c, a.t, 9.5), a.u, 8.5), a.r, -1.4), [1, 2.6, 0.6], white, [a.t, a.u, a.r]); // horn L
        addPrism(out, vadd(vadd(vadd(a.c, a.t, 9.5), a.u, 8.5), a.r, 1.4), [1, 2.6, 0.6], white, [a.t, a.u, a.r]);  // horn R
        for (const o of [-4, 4]) for (const f of [-3.5, 4.5]) addBox(out, vadd(vadd(vadd(a.c, a.r, o), a.t, f), a.u, 2.5), [1.4, 5, 1.4], dark, [a.r, a.u, a.t]); // legs
      }

      // Sponsor / energy-drink towers — tall slim branded pylons by the start area
      // and at the stadium, with red-cap tops.
      tower(0.02, 1, 30, 6, 38, { col: rbNavy, seg: 6, cap: true, capCol: rbRed, mast: 6 });
      tower(0.94, 1, 28, 5.5, 34, { col: [0.92, 0.93, 0.95], seg: 6, cap: true, capCol: rbRed, mast: 5 });
      tower(0.50, -1, 34, 5, 30, { col: rbRed, seg: 6, cap: true, capCol: [0.95, 0.95, 0.97], mast: 5 });

      // Big freestanding sponsor billboards (oversized hoardings on the hills).
      billboard(Math.round(n * 0.22) % n, 1, 22, 22, 7, rbRed);
      billboard(Math.round(n * 0.62) % n, -1, 24, 20, 6, rbNavy);

      // ---------------- Grandstands with crowds ----------------
      // Concentrated at the start straight, the T3 (Remus) crest, the mid-sector
      // sweepers and the final stadium bowl. Red Bull red/navy seat blocks.
      const shell = [0.40, 0.41, 0.46];
      // Main straight (Stehtribüne / start) — a long banked run of stands.
      grandstand(0.985, 1, 8, 40, shell, rbRed);
      grandstand(0.005, 1, 8, 40, shell, rbNavy);
      grandstand(0.04, 1, 9, 30, shell, rbRed);
      grandstand(0.07, 1, 10, 26, shell, rbNavy);
      // Turn 1 / Niki Lauda climb.
      grandstand(0.11, 1, 9, 26, shell, rbRed);
      // Turn 3 (Remus) crest — the high point.
      grandstand(0.21, 1, 8, 30, shell, rbNavy);
      grandstand(0.25, 1, 9, 24, shell, rbRed);
      // Mid-sector descent sweepers.
      grandstand(0.34, -1, 8, 24, shell, rbRed);
      grandstand(0.50, -1, 8, 26, shell, rbNavy);
      grandstand(0.62, 1, 8, 22, shell, rbRed);
      // Final sector dropping into the stadium bowl.
      grandstand(0.72, -1, 8, 28, shell, rbRed);
      grandstand(0.76, -1, 9, 24, shell, rbNavy);
      grandstand(0.88, 1, 8, 34, shell, rbNavy);
      grandstand(0.92, 1, 9, 28, shell, rbRed);
      grandstand(0.95, 1, 10, 22, shell, rbNavy);

      // --- Meadow clearing foreground: pale gold/tan pastoral hedges both sides ---
      every(30, (k) => {
        for (const side of [-1, 1]) {
          if (hash(k * 113 + side) > 0.72) continue;
          const d = 20 + hash(k * 127 + side) * 20;
          const p = anchor(k, side, d);
          if (onTrack(p.c[0], p.c[2], 8)) return;
          hedge(k / n, k / n + 0.005, side, d, 0.8 + hash(k * 131 + side) * 0.4, [0.66, 0.62, 0.50]);
        }
      });

      // --- Remus corner crest landmark tower (s≈0.23) — golden tower, red cap ---
      {
        const rA = anchor(Math.round(n * 0.23) % n, 1, 16);
        addCyl(out, rA.c, 2.5, 42, [0.95, 0.85, 0.20], 8, [rA.r, rA.u, rA.t]);
        const rTop = vadd(rA.c, rA.u, 42);
        addCone(out, rTop, 3, 6, [0.92, 0.10, 0.16], 8, [rA.r, rA.u, rA.t]);
      }

      // --- Descent ridge emphasis at s=0.28–0.32 (back-sector drop) ---
      {
        for (let i = 0; i < 6; i++) {
          const f = 0.28 + i * 0.007;
          const k = Math.round(f * n) % n;
          for (const side of [-1, 1]) {
            const a = anchor(k, side, 60 + i * 8);
            ridge(a.c[0], a.c[2], pyMin,
                  Math.atan2(a.t[2], a.t[0]) + 1.5708,
                  80 + hash(k * 37 + side) * 50, 40 + hash(k * 53 + side) * 30, 18 + hash(k * 71 + side) * 12,
                  [0.14, 0.28, 0.16]);
          }
        }
      }

      // --- Orange Army billboard near stadium bowl (s≈0.87, Dutch orange) ---
      billboard(Math.round(n * 0.87) % n, -1, 12, 8, 4, [1.0, 0.65, 0.0]);

      // --- Styrian Alpine farmhouse silhouette (s≈0.55) ---
      building(Math.round(n * 0.55) % n, -1, 18, 12, 6, 15,
        { wall: [0.48, 0.50, 0.52], window: [0.30, 0.35, 0.40], floor: 2 });

      // --- Rocky outcrops: grey rock clusters at s=0.15, 0.40, 0.65 ---
      for (const [sf, rockSide] of [[0.15, 1], [0.40, -1], [0.65, 1]]) {
        const kR = Math.round(sf * n) % n;
        const aR = anchor(kR, rockSide, 30);
        if (!onTrack(aR.c[0], aR.c[2], 10))
          addBox(out, vadd(aR.c, aR.u, 1.5), [4, 3, 5], [0.42, 0.40, 0.38], [aR.r, aR.u, aR.t]);
      }
    },
  }
  );
})();
