/* Apex 26 — COTA circuit definition (data only).
   Registered on the global TrackDefs list; consumed by the js/tracks.js engine
   (palette resolved there from `night`, geometry from js/circuits.js or `segs`). */
(function () {
  "use strict";
  (window.TrackDefs = window.TrackDefs || []).push(
  {
    id: "cota",
    name: "COTA",
    gp: "United States GP",
    country: "USA",
    night: false,
    theme: "green",
    lengthKm: 5.5,
    baseHW: 8,
    pal: { zenith: [0.24, 0.5, 0.84], horizon: [0.76, 0.7, 0.54], grass: [0.34, 0.4, 0.14], runoff: [0.6, 0.35, 0.2], ambientSky: [0.52, 0.58, 0.68], ambientGround: [0.28, 0.28, 0.24], sunDir: [0.5345224838248488, 0.5550810408950353, 0.6373152691757812], sun: [1, 0.9, 0.7], sunColor: [1, 0.88, 0.68] },
    segs: [
      { t: 0, l: 220, h: 30 }, { t: -120, l: 110, h: -6 }, { t: 0, l: 80, h: -22 }, { t: 60, l: 60 }, { t: -55, l: 60 }, { t: 60, l: 60 },
      { t: -55, l: 70 }, { t: 50, l: 70 }, { t: -40, l: 80 }, { t: -60, l: 90 }, { t: -120, l: 110 }, { t: 0, l: 460 },
      { t: -150, l: 130 }, { t: 70, l: 70 }, { t: -60, l: 70 }, { t: 80, l: 90 }, { t: 90, l: 160 }, { t: -130, l: 110 },
    ],
    // Turn 1: the calendar's most famous climb — ~30 m up in a few hundred metres.
    elevations: [{ s: 0.06, halfM: 320, rise: 12 }],
    scenery: function (api) {
      const { out, n, px, pz, hw, pyMin, place, prop, backdrop, groundYAt, addBox, addPrism, every, onTrack, anchor, vadd, hash, tower, grandstand, tree, bush, mountain } = api;
      const K = (s) => Math.round(s * n) % n;

      // -- Palette (Texas Hill Country, DAY) --
      const dryGrass = [0.55, 0.62, 0.30];
      const scrub = [0.38, 0.50, 0.28];
      const oak = [0.30, 0.42, 0.20];
      const cedar = [0.26, 0.36, 0.22];
      const redSoil = [0.62, 0.34, 0.24];
      const redSteel = [0.86, 0.20, 0.16];
      const white = [0.92, 0.92, 0.94];
      const concrete = [0.80, 0.80, 0.82];

      // ---- Main grandstand on the start/finish straight (s≈0.00, R) ----
      grandstand(0.00, 1, 8, 150, [0.34, 0.35, 0.40], [0.5, 0.5, 0.54]);
      // Opposite paddock-side stand on the main straight (s≈0.00, L)
      grandstand(0.985, -1, 16, 90, [0.36, 0.37, 0.42], [0.5, 0.5, 0.54]);
      // Final-corner stepped stand leading onto the main straight (s≈0.95, R)
      grandstand(0.95, 1, 9, 80, [0.36, 0.37, 0.42], [0.52, 0.5, 0.5]);
      // Turn-1 hill stand catching the climb (s≈0.11, L)
      grandstand(0.11, -1, 18, 60, [0.38, 0.39, 0.44], [0.52, 0.5, 0.5]);
      // Esses outside stand (s≈0.20, L)
      grandstand(0.20, -1, 16, 56, [0.40, 0.41, 0.46], [0.5, 0.5, 0.54]);
      // Back-straight grandstand (s≈0.46, L)
      grandstand(0.46, -1, 12, 70, [0.40, 0.41, 0.46], [0.5, 0.5, 0.54]);
      // Second back-straight stand further along (s≈0.54, L)
      grandstand(0.54, -1, 14, 60, [0.36, 0.37, 0.42], [0.52, 0.5, 0.5]);
      // Turn-12 hairpin braking-zone stand (s≈0.63, R)
      grandstand(0.625, 1, 14, 70, [0.38, 0.39, 0.44], [0.5, 0.5, 0.54]);
      // Triple-apex sweeper stand (s≈0.83, R)
      grandstand(0.83, 1, 16, 64, [0.40, 0.41, 0.46], [0.5, 0.5, 0.54]);

      // ---- Pit/paddock block (s≈0.02, L) ----
      prop(0.02 * n | 0, -1, 14, [26, 9, 90], [0.82, 0.82, 0.84]);

      // ---- 76 m Observation Tower — the hero at Turn 1 (s≈0.09, L far) ----
      const kt = K(0.085);
      tower(kt, -1, 70, 9, 64, { col: [0.88, 0.88, 0.90], seg: 6, cap: true, capCol: [0.55, 0.57, 0.62], mast: 12 });
      // small white support facility at the tower base
      prop(kt, -1, 64, [10, 7, 10], [0.86, 0.86, 0.88]);

      // ---- Uphill Turn 1: red-soil bank rising at the apex (s≈0.10, R mid) ----
      const k1 = K(0.10);
      const a1 = anchor(k1, 1, 14), b1 = [a1.r, a1.u, a1.t];
      addPrism(out, vadd(a1.c, a1.u, 5), [22, 10, 60], redSoil, [a1.t, a1.u, a1.r]);

      // ---- Esses spectator mounds flanking the track (s≈0.18, both, far) ----
      const ke = K(0.18);
      const me = anchor(ke, -1, 30), mr = [me.r, me.u, me.t];
      addPrism(out, vadd(me.c, me.u, 3), [40, 6, 70], scrub, [me.t, me.u, me.r]);
      const me2 = anchor(ke, 1, 30), mr2 = [me2.r, me2.u, me2.t];
      addPrism(out, vadd(me2.c, me2.u, 3), [40, 6, 70], scrub, [me2.t, me2.u, me2.r]);

      // ---- Austin360 Amphitheater: curved fan canopy behind Turn 12 (s≈0.64, R mid) ----
      const ka = K(0.64);
      const aa = anchor(ka, 1, 60), ab = [aa.r, aa.u, aa.t];
      if (!onTrack(aa.c[0], aa.c[2], 36)) {
        addBox(out, vadd(aa.c, aa.u, 12), [56, 24, 30], [0.78, 0.76, 0.72], ab);   // green-slope shell
        // curved canopy approximated by stepped panels fanning up
        for (let i = -2; i <= 2; i++) {
          addPrism(out, vadd(vadd(aa.c, aa.t, i * 12), aa.u, 24 + (2 - Math.abs(i)) * 2),
                   [16, 3, 26], [0.70, 0.72, 0.76], [aa.r, aa.u, aa.t]);
        }
      }

      // ---- Red-and-white grandstand framework / tower (s≈0.65, R far) ----
      const redFramework = (k, side, dist) => {
        const af = anchor(k, side, dist), fb = [af.r, af.u, af.t];
        if (onTrack(af.c[0], af.c[2], 24)) return;
        addBox(out, vadd(af.c, af.u, 16), [4, 32, 30], redSteel, fb);          // red lattice tower
        addBox(out, vadd(vadd(af.c, af.t, 14), af.u, 9), [4, 18, 22], redSteel, fb);
        addBox(out, vadd(vadd(af.c, af.t, -14), af.u, 9), [4, 18, 22], redSteel, fb);
        addBox(out, vadd(vadd(af.c, af.t, 7), af.u, 12), [6, 1, 18], white, fb); // white panels
        addBox(out, vadd(vadd(af.c, af.t, -7), af.u, 12), [6, 1, 18], white, fb);
      };
      redFramework(K(0.65), 1, 44);
      redFramework(K(0.65), 1, 76);     // a second red stand stacked behind the first
      redFramework(K(0.84), 1, 50);     // red framework at the triple-apex sweeper
      redFramework(K(0.30), 1, 60);     // red framework over the dry-grass field

      // ---- Scattered oak/cedar groves over dry grass (denser, mid-distance) ----
      every(40, (k) => {
        for (const side of [-1, 1]) {
          const r = hash(k * 13 + side);
          if (r > 0.72) continue;
          // a small cluster of 2-3 trees per hit, fanned out at varying distance
          const cnt = 2 + (hash(k * 31 + side) > 0.5 ? 1 : 0);
          for (let j = 0; j < cnt; j++) {
            const d = 26 + hash(k * 7 + side + j * 11) * 55;
            const h = 6 + hash(k * 17 + side + j * 9) * 7;
            tree(k, side, d, h, hash(k * 5 + j) > 0.5 ? oak : cedar);
          }
          if (hash(k * 23 + side) > 0.45) bush(k, side, 22 + hash(k * 3 + side) * 50, scrub);
          if (hash(k * 29 + side) > 0.6) bush(k, side, 30 + hash(k * 19 + side) * 40, oak);
        }
      });

      // ---- Texas Hill Country ridgelines — LOW organic hills on the horizon ----
      let cx = 0, cz = 0;
      for (let i = 0; i < n; i++) { cx += px[i]; cz += pz[i]; }
      cx /= n; cz /= n;
      let rad = 0;
      for (let i = 0; i < n; i++) rad = Math.max(rad, Math.hypot(px[i] - cx, pz[i] - cz));
      // CONTINUOUS Texas Hill Country backdrop: three overlapping rings of LOW
      // organic hills, spaced so wide bases overlap into an unbroken green/tan
      // band that wraps the WHOLE lap — no gaps, no snow, never tall.
      for (const [extra, wMin, hMin, count, col] of [
        [160, 220, 26, 44, dryGrass],                 // near continuous dry-green band
        [340, 280, 38, 38, [0.50, 0.54, 0.42]],       // mid tan-green band
        [540, 340, 50, 32, [0.46, 0.52, 0.46]],       // far hazed band
      ]) {
        const ring = rad + extra;
        for (let i = 0; i < count; i++) {
          // half-step alternation pulls each hill toward its neighbour's gap
          const a = (i + (i % 2) * 0.5) / count * 6.2832, h = hash(i * 7 + extra);
          mountain(cx + Math.cos(a) * ring, cz + Math.sin(a) * ring, pyMin,
                   wMin + h * 100, hMin + h * 20,
                   { seed: i * 3 + extra, snowline: 2, forest: col, rock: [col[0] * 0.92, col[1] * 0.9, col[2] * 0.82] });
        }
      }
    },
  }
  );
})();
