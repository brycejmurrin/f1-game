/* Apex 26 — MONACO circuit definition (data only).
   Registered on the global TrackDefs list; consumed by the js/tracks.js engine
   (palette resolved there from `night`, geometry from js/circuits.js or `segs`). */
(function () {
  "use strict";
  (window.TrackDefs = window.TrackDefs || []).push(
  {
    id: "monaco",
    name: "MONACO",
    gp: "Monaco GP",
    country: "Monaco",
    night: false,
    theme: "street_day",
    lengthKm: 3.3,
    baseHW: 5,
    street: true,
    pal: { horizon: [0.55, 0.68, 0.82], grass: [0.36, 0.35, 0.34], runoff: [0.42, 0.41, 0.4], concrete: [0.24, 0.23, 0.22], fogDensity: 0.0014, sunDir: [0.22008805283522467, 0.8803522113408987, 0.4201681008672471], sun: [1, 0.98, 0.93], sunColor: [1, 0.97, 0.9] },
    segs: [
      { t: 0, l: 230 }, { t: 70, l: 75 }, { t: -25, l: 260, h: 14 }, { t: -70, l: 110 }, { t: 80, l: 80, w: 4.8 }, { t: 0, l: 90, h: -6 },
      { t: 80, l: 80, w: 4.8 }, { t: 160, l: 120, w: 4.5, h: -4 }, { t: 55, l: 80 }, { t: 45, l: 80 }, { t: -15, l: 260, h: -4 }, { t: 60, l: 70, w: 4.8 },
      { t: 0, l: 40 }, { t: -65, l: 60 }, { t: 65, l: 60 }, { t: -40, l: 100 }, { t: 70, l: 65, w: 4.8 }, { t: 0, l: 35 },
      { t: -70, l: 65 }, { t: 80, l: 70 }, { t: -70, l: 65 }, { t: 75, l: 70, w: 4.8 }, { t: 40, l: 120 },
    ],
    // Climb to Casino Square, then the plunge down through Mirabeau and the
    // tunnel toward the harbour (~42 m top-to-bottom). Street circuit: barriers,
    // not a wide terrain ribbon, so elevation was always safe here.
    elevations: [{ s: 0.27, halfM: 340, rise: 18 }, { s: 0.55, halfM: 220, rise: -10 }],
    scenery: function (api) {
      const { out, track, n, ds, px, py, pz, hw, pyMin, groundYAt, addBox, addPrism, addCyl, addCone, addFrustum, onTrack, hash, upOf, vadd, anchor, along, place, prop, building, tower, palm, tree, bush, hedge, grandstand, billboard, gantry, marshalPost, fence, guardrail, wall, cityFront, backdrop } = api;
      const K = (s) => Math.round(s * n) % n;

      // ── Colour palette ────────────────────────────────────────────────────
      // Mediterranean pastels: cream, terracotta, ochre, dusty rose, stone
      const CREAM  = [0.95, 0.90, 0.78];
      const TERRA  = [0.80, 0.45, 0.32];
      const OCHRE  = [0.85, 0.70, 0.45];
      const DUSTY  = [0.88, 0.82, 0.78];
      const STONE  = [0.78, 0.74, 0.62];
      const SAGE   = [0.72, 0.78, 0.68];
      const PASTELS = [CREAM, TERRA, OCHRE, DUSTY, STONE, SAGE,
                       [0.86, 0.78, 0.74], [0.78, 0.85, 0.82]];
      const WIN    = [0.20, 0.30, 0.36];
      const ARMCO  = [0.70, 0.72, 0.74];
      // Warm emissive window colour — reads as lit interior at dusk/night
      const WINLIT = [0.95, 0.88, 0.55];
      // Street lamp sodium-yellow cap
      const LAMP   = [1.0, 0.90, 0.60];

      // ── Continuous Armco lining both sides — tight street feel ───────────
      wall(0.0, 1.0, -1, 0.4, 0.8, ARMCO, 0.22);
      wall(0.0, 0.48, 1, 0.4, 0.8, ARMCO, 0.22);
      guardrail(0.02, 0.07, -1, 0.5, ARMCO);

      // ── SECTOR 1 — START / SAINTE DEVOTE CLIMB (s=0.00→0.08) ───────────
      // Left: stone buildings. Right: pit lane terrace + grandstand.
      cityFront(0.00, 0.07, -1, 8, {
        minH: 16, maxH: 32, depth: 18, step: 20,
        palette: [CREAM, DUSTY, STONE, OCHRE],
        lit: true, windowCol: WINLIT,
      });
      cityFront(0.00, 0.07,  1, 8, {
        minH: 14, maxH: 26, depth: 16, step: 22,
        palette: [STONE, CREAM, DUSTY],
        lit: true, windowCol: WINLIT,
      });

      // Sainte Devote chapel (s=0.05, R mid)
      {
        const k = K(0.05), a = anchor(k, 1, 18);
        if (!onTrack(a.c[0], a.c[2], 8)) {
          addBox(out, vadd(a.c, a.u, 4), [9, 8, 11], CREAM, [a.r, a.u, a.t]);
          addPrism(out, vadd(a.c, a.u, 9.2), [9.4, 3.2, 11.2], [0.32, 0.22, 0.20], [a.r, a.u, a.t]);
        }
      }

      // ── SECTOR 2 — BEAU RIVAGE HILLSIDE CLIMB (s=0.08→0.26) ─────────────
      // The hillside soars steeply on the LEFT (inland rock face). Dense cityFront
      // close in, then green/rocky hillside backdrop mounds, then far towers.
      // RIGHT side is close apartment facades.
      cityFront(0.08, 0.26, -1, 9, {
        minH: 20, maxH: 44, depth: 20, step: 20,
        palette: [CREAM, OCHRE, TERRA, DUSTY, SAGE],
        lit: true, windowCol: WINLIT,
      });
      cityFront(0.08, 0.26,  1, 9, {
        minH: 16, maxH: 34, depth: 18, step: 22,
        palette: [STONE, CREAM, DUSTY, OCHRE],
        lit: true, windowCol: WINLIT,
      });
      // Rocky/green hillside above the buildings — backdrop() with green renders
      // as organic rounded mounds, not boxy slabs. Three tiers for depth.
      for (let i = 0; i < 9; i++) {
        const k = K(0.09 + i * 0.019);
        const hv = hash(k * 3.1 + 7);
        backdrop(k, -1, 44 + hv * 16, [55 + hv * 25, 22 + hv * 18, 50],
                 [0.20 + hv * 0.05, 0.42 + hv * 0.06, 0.22]);
        backdrop(k, -1, 72 + hv * 20, [65 + hv * 30, 32 + hv * 22, 55],
                 [0.16 + hv * 0.04, 0.34 + hv * 0.05, 0.18]);
      }
      // Far towers on LEFT — set at 80m+, clear of hillside mounds.
      for (const [sf, ht] of [[0.10, 60], [0.15, 68], [0.20, 56], [0.24, 72]]) {
        const k = K(sf);
        const tDist = 84 + hash(k * 5) * 14;
        const a = anchor(k, -1, tDist);
        if (!onTrack(a.c[0], a.c[2], 10)) {
          tower(k, -1, tDist, 14 + hash(k * 3) * 4, ht,
            { col: PASTELS[K(sf) % PASTELS.length], cap: true, capCol: [0.55, 0.58, 0.56], mast: 5 });
          const bW = 14 + hash(k * 3) * 4;
          addBox(out, vadd(a.c, a.u, ht * 0.62), [bW * 1.15, ht * 0.14, bW * 1.15],
                 WINLIT, [a.r, a.u, a.t]);
        }
      }

      // ── CASINO DE MONTE-CARLO (s=0.20, L) ───────────────────────────────
      {
        const k = K(0.20), a = anchor(k, -1, 22);
        if (!onTrack(a.c[0], a.c[2], 26)) {
          const b = [a.r, a.u, a.t];
          addBox(out, vadd(a.c, a.u, 13), [44, 26, 30], CREAM, b);
          addBox(out, vadd(a.c, a.u, 28), [46, 4, 32], [0.30, 0.45, 0.38], b);
          for (const o of [-13, 13]) {
            addBox(out, vadd(vadd(a.c, a.t, o), a.u, 30), [9, 18, 9], [0.90, 0.85, 0.74], b);
            addPrism(out, vadd(vadd(a.c, a.t, o), a.u, 40.5), [9.2, 5, 9.2], [0.28, 0.42, 0.36], b);
          }
          // window bands + lit evening glow
          for (let f = 0; f < 4; f++) {
            addBox(out, vadd(a.c, a.u, 5 + f * 6), [44.4, 2.2, 30.4], WIN, b);
            addBox(out, vadd(a.c, a.u, 6.0 + f * 6), [44.6, 1.1, 30.6], WINLIT, b);
          }
          for (const o of [-8, 8]) {
            const lc = vadd(vadd(a.c, a.t, o), a.u, 0);
            addCyl(out, lc, 0.10, 5.5, [0.72, 0.74, 0.76], 5, b);
            addCyl(out, vadd(lc, a.u, 5.3), 0.55, 0.18, LAMP, 6, b);
          }
        }
      }

      // Casino Square gardens — formal hedges, palms, fountain
      hedge(0.195, 0.235, -1, 7, 1.6, [0.22, 0.42, 0.20]);
      for (let i = 0; i < 10; i++) {
        const k = K(0.20 + i * 0.0035);
        place(k, -1, 3, [3, 1.2, 4], [0.55, 0.55, 0.58]);
        prop(k, -1, 3, [2, 0.5, 2], [0.25, 0.45, 0.22]);
        palm(k, i % 2 ? 1 : -1, 4, 9, [0.25, 0.45, 0.22]);
      }
      {
        const k = K(0.215), a = anchor(k, -1, 14);
        if (!onTrack(a.c[0], a.c[2], 8)) {
          const b = [a.r, a.u, a.t];
          addCyl(out, vadd(a.c, a.u, 0.5), 3.0, 1.0, [0.70, 0.72, 0.76], 10, b);
          addCyl(out, vadd(a.c, a.u, 1.6), 0.5, 2.2, [0.78, 0.80, 0.84], 8, b);
          addCyl(out, vadd(a.c, a.u, 3.4), 1.2, 0.4, [0.85, 0.90, 0.96], 8, b);
        }
        for (let j = 0; j < 6; j++) bush(K(0.198 + j * 0.007), -1, 9 + (j % 2) * 3, [0.24, 0.44, 0.22]);
      }

      // ── SECTOR 3 — CASINO / MIRABEAU DESCENT (s=0.26→0.42) ─────────────
      cityFront(0.26, 0.42, -1, 9, {
        minH: 18, maxH: 40, depth: 20, step: 20,
        palette: [CREAM, DUSTY, OCHRE, TERRA, STONE],
        lit: true, windowCol: WINLIT,
      });
      cityFront(0.26, 0.42,  1, 9, {
        minH: 16, maxH: 32, depth: 18, step: 22,
        palette: [STONE, OCHRE, CREAM, DUSTY],
        lit: true, windowCol: WINLIT,
      });
      // Rocky scrub above the Mirabeau buildings — green/grey hillside backdrop.
      for (let i = 0; i < 7; i++) {
        const k = K(0.28 + i * 0.02);
        const hv = hash(k * 4.1 + 3);
        backdrop(k, -1, 46 + hv * 18, [60 + hv * 30, 18 + hv * 14, 48],
                 [0.22 + hv * 0.04, 0.40 + hv * 0.05, 0.24]);
      }

      // ── PRINCE'S PALACE / ROCK OF MONACO ────────────────────────────────
      // Iconic cream fortress at s≈0.17, inland dist=110m. Inner face of each
      // wing sits beyond the previous box so no interpenetration.
      {
        const k = K(0.17), a = anchor(k, -1, 110);
        if (!onTrack(a.c[0], a.c[2], 20)) {
          const b = [a.r, a.u, a.t];
          addFrustum(out, vadd(a.c, a.u, 32), 28, 20, 56, CREAM, 10, b);
          // Flanking ramparts (set beside tower, not inside it)
          addBox(out, vadd(vadd(a.c, a.r, -20), a.u, 24), [10, 44, 42], [0.92, 0.88, 0.82], b);
          addBox(out, vadd(vadd(a.c, a.r, 20),  a.u, 24), [10, 44, 42], [0.92, 0.88, 0.82], b);
          // Corner bastions at ±24m (outside rampart outer face of ±20+5=±25m)
          for (const sd of [-1, 1]) {
            addCyl(out, vadd(vadd(a.c, a.r, sd * 28), a.u, 52), 3.2, 16, [0.72, 0.70, 0.66], 7, b);
          }
          addBox(out, vadd(a.c, a.u, 4), [44, 1.6, 48], [0.86, 0.85, 0.82], b);
          // lit palace windows
          addBox(out, vadd(a.c, a.u, 22), [44.4, 5.0, 30.4], WINLIT, b);
        }
      }

      // Palace rock terraced gardens — dist stepped by 14m, well clear of palace
      for (let i = 0; i < 3; i++) {
        const k = K(0.18 + i * 0.015);
        const distT = 52 + i * 14;
        const a = anchor(k, -1, distT);
        if (!onTrack(a.c[0], a.c[2], 8)) {
          const b = [a.r, a.u, a.t];
          addBox(out, vadd(a.c, a.u, 2.4), [18 + i * 4, 3.6 + i * 0.6, 10], [0.86, 0.82, 0.74], b);
          for (let j = 0; j < 3; j++) {
            const pc = vadd(vadd(a.c, a.r, (j - 1) * 5), a.u, 0);
            addCone(out, vadd(pc, a.u, 4 + i * 0.5), 0.55, 1.6, [0.50, 0.62, 0.38], 4, b);
          }
        }
      }

      // ── FAIRMONT HAIRPIN HOTEL (s=0.40, R) ──────────────────────────────
      {
        const k = K(0.40);
        building(k, 1, 4, 20, 48, 30,
          { wall: [0.90, 0.88, 0.82], window: WIN, floor: 6, lit: true, windowCol: WINLIT, setback: true });
        building(K(0.385), 1, 5, 22, 40, 18,
          { wall: CREAM, window: WIN, floor: 6, lit: true, windowCol: WINLIT });
        building(K(0.415), 1, 5, 22, 42, 18,
          { wall: [0.88, 0.84, 0.76], window: WIN, floor: 6, lit: true, windowCol: WINLIT });
      }

      // ── SECTOR 4 — TUNNEL (s=0.51→0.585) ───────────────────────────────
      {
        const tunS = K(0.51), tunE = K(0.585);
        const tunLen = ((tunE - tunS) + n) % n;
        const step = Math.max(2, Math.round(8.0 / ds));
        const DARK = [0.26, 0.25, 0.30];
        for (let i = 0; i < tunLen; i += step) {
          const k = (tunS + i) % n;
          const r = [track.rx[k], track.ry[k], track.rz[k]];
          const t = [track.tx[k], track.ty[k], track.tz[k]];
          const u = upOf(track, k);
          const cw = hw[k] * 2 + 5;
          addBox(out, vadd([px[k], py[k], pz[k]], u, 6.4), [cw, 1.2, ds * step * 1.05], DARK, [r, u, t]);
          for (const sd of [-1, 1]) {
            const o = sd * (hw[k] + 1.5);
            addBox(out, vadd([px[k] + r[0] * o, py[k], pz[k] + r[2] * o], u, 3.2), [1.4, 6.4, ds * step * 1.05], [0.30, 0.29, 0.33], [r, u, t]);
          }
          if (i % (step * 2) === 0) {
            addBox(out, vadd([px[k], py[k], pz[k]], u, 6.0), [cw * 0.6, 0.2, ds * step * 0.6],
                   [0.94, 0.92, 0.80], [r, u, t]);
          }
        }
        for (const frac of [0.51, 0.585]) {
          const k = K(frac);
          const r = [track.rx[k], track.ry[k], track.rz[k]];
          const t = [track.tx[k], track.ty[k], track.tz[k]];
          const u = upOf(track, k);
          addBox(out, vadd([px[k], py[k], pz[k]], u, 3.8), [hw[k] * 2 + 7, 7.6, 1.8], [0.32, 0.31, 0.36], [r, u, t]);
        }
      }

      // ── SECTOR 5 — HARBOUR FRONT (s=0.585→0.98) ─────────────────────────
      // LEFT = harbour/sea. RIGHT = continuous inland apartment facades.
      // Coherent pastel cityFront on the RIGHT (inland side).
      cityFront(0.585, 0.98, 1, 9, {
        minH: 18, maxH: 38, depth: 20, step: 22,
        palette: [CREAM, DUSTY, OCHRE, TERRA, STONE, SAGE],
        lit: true, windowCol: WINLIT,
      });
      // Far backdrop towers behind harbour apartments — use backdrop() for these
      // distant landmarks so we get window-banded towers without full cityFront overdraw.
      for (let i = 0; i < 8; i++) {
        const k = K(0.60 + i * 0.048);
        const hv = hash(k * 2.9 + i);
        const h = 36 + hv * 32;
        backdrop(k, 1, 46 + hv * 18, [20 + hv * 12, h, 18], PASTELS[(i * 3) % PASTELS.length]);
      }

      // ── HARBOUR WATER & QUAY ─────────────────────────────────────────────
      const SEA = [0.10, 0.34, 0.55], SEA2 = [0.13, 0.40, 0.60];
      for (let i = 0; i < 6; i++) {
        const k = K(0.60 + i * 0.062), a = anchor(k, -1, 70);
        addBox(out, vadd(a.c, a.u, -1.2), [150, 0.8, 120], i % 2 ? SEA2 : SEA, [a.r, a.u, a.t]);
      }
      // Low stone quay wall between track and water
      wall(0.585, 0.99, -1, 1.0, 1.4, [0.74, 0.70, 0.62], 1.0);

      // ── YACHT BUILDER ─────────────────────────────────────────────────────
      const yacht = (yc, b, u, r, t, sc, hullCol) => {
        const HULL = hullCol || [0.97, 0.97, 0.99];
        const L = 22 * sc, W = 7 * sc;
        addBox(out, vadd(yc, u, 1.6 * sc), [W, 3.0 * sc, L], HULL, b);
        addBox(out, vadd(yc, u, 0.4 * sc), [W * 0.82, 1.2 * sc, L * 0.96], [0.20, 0.30, 0.40], b);
        addBox(out, vadd(vadd(yc, t, L * 0.46), u, 1.8 * sc), [W * 0.6, 2.0 * sc, L * 0.16], HULL, b);
        const sup = vadd(yc, t, -L * 0.06);
        addBox(out, vadd(sup, u, 4.2 * sc), [W * 0.78, 2.6 * sc, L * 0.55], [0.90, 0.91, 0.94], b);
        addBox(out, vadd(sup, u, 5.8 * sc), [W * 0.74, 1.0 * sc, L * 0.58], [0.40, 0.55, 0.70], b);
        addBox(out, vadd(sup, u, 6.8 * sc), [W * 0.6, 2.2 * sc, L * 0.40], [0.94, 0.95, 0.97], b);
        addBox(out, vadd(sup, u, 9.0 * sc), [W * 0.42, 1.8 * sc, L * 0.26], [0.84, 0.86, 0.90], b);
        addBox(out, vadd(sup, u, 11.6 * sc), [W * 0.5, 0.5 * sc, 0.6 * sc], [0.80, 0.82, 0.86], b);
        addCyl(out, vadd(sup, u, 12 * sc), 0.18 * sc, 5 * sc, [0.85, 0.85, 0.88], 4, b);
        addBox(out, vadd(vadd(yc, t, L * 0.30), u, 3.4 * sc), [W * 0.7, 0.7 * sc, 0.3 * sc], [0.85, 0.86, 0.9], b);
        // lit cabin windows
        addBox(out, vadd(sup, u, 5.9 * sc), [W * 0.75, 0.5 * sc, L * 0.59], WINLIT, b);
      };

      // packed marina rows — three ranks, near/mid/far
      for (let i = 0; i < 16; i++) {
        const s = 0.59 + i * 0.0245;
        const k = K(s);
        const rank = i % 3;
        const dist = 16 + rank * 16 + hash(k * 7) * 4;
        const a = anchor(k, -1, dist);
        if (onTrack(a.c[0], a.c[2], 12)) continue;
        const b = [a.r, a.u, a.t];
        const sc = 0.7 + hash(k * 9 + i) * 0.9;
        const hull = (i % 5 === 0) ? [0.18, 0.20, 0.26] : (i % 7 === 0) ? [0.85, 0.86, 0.9] : [0.97, 0.97, 0.99];
        yacht(vadd(a.c, a.r, -2 + (i % 3) * 4), b, a.u, a.r, a.t, sc, hull);
        if (i % 3 === 0) {
          const tc = vadd(vadd(a.c, a.r, -14), a.t, 8);
          addBox(out, vadd(tc, a.u, 0.9), [3.2, 1.2, 8], [0.92, 0.5, 0.3], b);
          addBox(out, vadd(tc, a.u, 1.8), [2.0, 0.8, 3.2], [0.95, 0.95, 0.97], b);
        }
      }
      // Additional curated yachts (harbour enhancement)
      for (let i = 0; i < 12; i++) {
        const s = 0.62 + i * 0.0205;
        const k = K(s);
        const rank = i % 3;
        const dist = 18 + rank * 20 + hash(k * 7) * 6;
        const a = anchor(k, -1, dist);
        if (onTrack(a.c[0], a.c[2], 14)) continue;
        const b = [a.r, a.u, a.t];
        const sc = 0.72 + hash(k * 11 + i) * 0.8;
        if (rank === 0) {
          const hull = (i % 4 === 0) ? [0.20, 0.22, 0.28] : [0.97, 0.97, 0.99];
          yacht(vadd(a.c, a.r, -4 + (i % 3) * 5), b, a.u, a.r, a.t, sc, hull);
          if (i % 2 === 0) {
            const tc = vadd(vadd(a.c, a.r, -16), a.t, 5);
            addBox(out, vadd(tc, a.u, 0.8), [3.6, 1.2, 7], [0.94, 0.52, 0.26], b);
            addBox(out, vadd(tc, a.u, 1.6), [2.1, 0.8, 2.8], [0.96, 0.96, 0.98], b);
          }
        } else if (rank === 1) {
          addBox(out, vadd(a.c, a.u, 4), [6 * sc, 5 * sc, 18 * sc], [0.92, 0.93, 0.96], b);
          addCyl(out, vadd(a.c, a.u, 10.5 * sc), 0.25 * sc, 6 * sc, [0.88, 0.88, 0.92], 4, b);
        } else {
          addCyl(out, vadd(a.c, a.u, 5), 0.2, 12 + hash(k * 5) * 5, [0.89, 0.89, 0.93], 3, b);
        }
      }
      // distant mast cluster + breakwater
      for (let i = 0; i < 10; i++) {
        const k = K(0.62 + i * 0.03), a = anchor(k, -1, 95 + hash(k) * 25);
        addCyl(out, vadd(a.c, a.u, 5), 0.25, 12 + hash(k * 3) * 6, [0.86, 0.86, 0.9], 4, [a.r, a.u, a.t]);
      }
      for (let i = 0; i < 6; i++) {
        const k = K(0.66 + i * 0.032), a = anchor(k, -1, 125);
        addBox(out, vadd(a.c, a.u, 0.5), [30, 2.6, 7], [0.70, 0.66, 0.58], [a.r, a.u, a.t]);
      }

      // ── QUAY BOLLARDS ─────────────────────────────────────────────────────
      {
        const BOLLARD = [0.74, 0.72, 0.70];
        const RING    = [0.68, 0.65, 0.60];
        for (let i = 0; i < 8; i++) {
          const k = K(0.61 + i * 0.012);
          const a = anchor(k, -1, 6 + (i % 2) * 1.5);
          if (!onTrack(a.c[0], a.c[2], 2.8)) {
            addCyl(out, vadd(a.c, a.u, 0), 0.28, 1.2, BOLLARD, 6, [a.r, a.u, a.t]);
            if (i % 2 === 0) addCyl(out, vadd(a.c, a.u, 0.9), 0.35, 0.24, RING, 7, [a.r, a.u, a.t]);
          }
        }
      }

      // ── TABAC / SWIMMING POOL SECTION (s=0.71→0.84) ─────────────────────
      // Tabac waterfront buildings (RIGHT/inland side already covered by cityFront above).
      // Swimming pool
      {
        const k = K(0.80), a = anchor(k, -1, 8);
        if (!onTrack(a.c[0], a.c[2], 10)) {
          const b = [a.r, a.u, a.t];
          addBox(out, vadd(a.c, a.u, 0.3), [14, 0.5, 22], [0.20, 0.60, 0.65], b);
          for (const o of [-7.4, 7.4]) addBox(out, vadd(vadd(a.c, a.r, o), a.u, 0.6), [1.4, 0.7, 23], [0.94, 0.94, 0.96], b);
          for (const o of [-11.4, 11.4]) addBox(out, vadd(vadd(a.c, a.t, o), a.u, 0.6), [16, 0.7, 1.4], [0.94, 0.94, 0.96], b);
          for (let j = 0; j < 4; j++) {
            const pc = vadd(vadd(a.c, a.r, -5 + (j % 2) * 10), a.t, -8 + j * 5);
            addCyl(out, vadd(pc, a.u, 1.3), 0.08, 2.6, [0.8, 0.8, 0.82], 4, b);
            addCone(out, vadd(pc, a.u, 3.0), 1.8, 0.8, j % 2 ? [0.9, 0.4, 0.35] : [0.95, 0.95, 0.97], 7, b);
          }
          addBox(out, vadd(vadd(a.c, a.r, 7.4), a.u, 2.2), [1.4, 0.4, 4], [0.85, 0.86, 0.88], b);
        }
      }
      // Waterfront terrace lips on Tabac stretch
      for (let i = 0; i < 5; i++) {
        const k = K(0.71 + i * 0.02);
        place(k, 1, 18, [20, 0.8, 1.2], [0.88, 0.86, 0.80]);
      }

      // ── RASCASSE / PADDOCK (s=0.87→0.95, R) ─────────────────────────────
      // Low paddock hospitality buildings — proper massing, not flat boxes.
      cityFront(0.87, 0.95, 1, 9, {
        minH: 10, maxH: 18, depth: 14, step: 24,
        palette: [CREAM, STONE, DUSTY, OCHRE],
        lit: true, windowCol: WINLIT,
      });
      guardrail(0.88, 0.95, 1, 1.0, ARMCO);

      // ── SECTOR 6 — RETURN / ANTONY NOGHES (s=0.95→1.00) ─────────────────
      cityFront(0.95, 1.00, -1, 9, {
        minH: 16, maxH: 30, depth: 18, step: 20,
        palette: [CREAM, DUSTY, STONE],
        lit: true, windowCol: WINLIT,
      });
      cityFront(0.95, 1.00, 1, 9, {
        minH: 14, maxH: 26, depth: 16, step: 22,
        palette: [STONE, CREAM, OCHRE],
        lit: true, windowCol: WINLIT,
      });

      // ── STREET LAMP POSTS (both sides, ~every 35–40m) ────────────────────
      for (let i = 0; i < 36; i++) {
        const s = i / 36;
        const k = K(s);
        const side = (i % 2 === 0) ? 1 : -1;
        if (s > 0.50 && s < 0.60) continue; // skip tunnel interior
        const aL = anchor(k, side, 1.8);
        if (onTrack(aL.c[0], aL.c[2], 1.2)) continue;
        const b = [aL.r, aL.u, aL.t];
        addCyl(out, aL.c, 0.09, 6.5, [0.68, 0.70, 0.72], 5, b);
        addCyl(out, vadd(aL.c, aL.u, 6.3), 0.65, 0.22, LAMP, 7, b);
        addBox(out, vadd(aL.c, aL.u, 0.1), [1.6, 0.06, 1.6], [0.92, 0.88, 0.72], b);
      }

      // Harbour-side lamp posts along the quay
      for (let i = 0; i < 14; i++) {
        const s = 0.585 + i * 0.029;
        const k = K(s);
        const aQ = anchor(k, -1, 2.4);
        if (onTrack(aQ.c[0], aQ.c[2], 1.2)) continue;
        const bQ = [aQ.r, aQ.u, aQ.t];
        addCyl(out, aQ.c, 0.09, 5.8, [0.70, 0.72, 0.74], 5, bQ);
        addCyl(out, vadd(aQ.c, aQ.u, 5.6), 0.55, 0.20, LAMP, 7, bQ);
        addBox(out, vadd(aQ.c, aQ.u, 0.1), [1.4, 0.06, 1.4], [0.90, 0.86, 0.68], bQ);
      }

      // ── PIT WALL & START GRANDSTAND (s=0.03, R) ──────────────────────────
      wall(0.0, 0.06, 1, 1.5, 1.0, [0.66, 0.67, 0.69], 0.6);
      place(K(0.03), 1, 10, [7, 9, 40], [0.55, 0.56, 0.60]);
      for (let i = 0; i < 5; i++) {
        const k = (K(0.02) + i * 2) % n;
        place(k, 1, 4, [0.4, 1.1, 5], [0.80, 0.80, 0.82]);
      }

      // ── PALMS ─────────────────────────────────────────────────────────────
      // Promenade palms along harbour railing
      for (let i = 0; i < 12; i++) {
        const k = K(0.59 + i * 0.029);
        palm(k, -1, 5, 8 + hash(k * 3) * 3, [0.25, 0.45, 0.22]);
      }
      // Extra harbour promenade density
      for (let i = 0; i < 8; i++) {
        const k = K(0.60 + i * 0.038);
        palm(k, -1, 6.5, 7 + hash(k * 11) * 3, [0.24, 0.45, 0.21]);
      }
      // Inland street palms (Beau Rivage / Mirabeau climb)
      for (let i = 0; i < 10; i++) {
        const k = K(0.06 + i * 0.045);
        palm(k, -1, 6, 7 + hash(k * 5) * 4, [0.24, 0.44, 0.21]);
      }

      // ── CYPRESS ACCENT TREES ──────────────────────────────────────────────
      {
        const CYPRESS = [0.16, 0.32, 0.14];
        for (const [sf, cnt] of [[0.20, 2], [0.80, 3]]) {
          for (let j = 0; j < cnt; j++) {
            const k = K(sf + j * 0.012);
            const side = (j & 1) ? -1 : 1;
            const dist = 10 + (j & 1) * 3;
            const a = anchor(k, side, dist);
            if (!onTrack(a.c[0], a.c[2], 2.8)) {
              addCyl(out, vadd(a.c, a.u, 0), 1.1, 17, CYPRESS, 5, [a.r, a.u, a.t]);
            }
          }
        }
      }

      // ── HILLSIDE SKYLINE TOWERS (far back, dist ≥ 65m) ───────────────────
      // These read as the high-rise Monaco residential towers above the city.
      for (const [sf, sd, ht] of [
        [0.12, -1, 70], [0.34, -1, 64], [0.74,  1, 66], [0.88, 1, 58], [0.50, -1, 62]
      ]) {
        const k = K(sf);
        const tDist = 68 + hash(k) * 18;
        const a = anchor(k, sd, tDist);
        if (!onTrack(a.c[0], a.c[2], 10)) {
          const bW = 14 + hash(k * 3) * 5;
          tower(k, sd, tDist, bW, ht, {
            col: PASTELS[K(sf) % PASTELS.length], cap: true,
            capCol: [0.55, 0.58, 0.56], mast: 6
          });
          addBox(out, vadd(a.c, a.u, ht * 0.60), [bW * 1.2, ht * 0.14, bW * 1.2],
                 WINLIT, [a.r, a.u, a.t]);
        }
      }

      // ── TRACK FURNITURE ───────────────────────────────────────────────────
      gantry(0.0, 7.0, [0.20, 0.22, 0.26]);
      gantry(0.235, 6.4, [0.22, 0.24, 0.28]);

      grandstand(0.64, -1, 8, 60, [0.55, 0.56, 0.60], [0.85, 0.30, 0.28]);
      grandstand(0.78, -1, 8, 48, [0.54, 0.55, 0.58], [0.30, 0.45, 0.80]);
      grandstand(0.25,  1, 7, 40, [0.56, 0.57, 0.60], [0.90, 0.80, 0.30]);
      grandstand(0.72,  1, 9, 36, [0.55, 0.55, 0.58], [0.85, 0.85, 0.88]);

      for (const [s, sd] of [[0.07, 1], [0.18, -1], [0.33, 1], [0.62, -1], [0.74, 1], [0.84, -1], [0.93, 1]]) {
        const col = [[0.85, 0.20, 0.20], [0.10, 0.30, 0.70], [0.95, 0.80, 0.10], [0.10, 0.55, 0.45]][K(s) % 4];
        billboard(K(s), sd, 2.5, 7, 3.2, col);
      }

      fence(0.66, 0.71, -1, 2.0, 3.2, [0.78, 0.80, 0.82]);
      fence(0.82, 0.87, -1, 2.0, 3.2, [0.78, 0.80, 0.82]);

      for (const [s, sd] of [[0.04, 1], [0.13, -1], [0.30, 1], [0.42, -1], [0.50, 1], [0.62, -1], [0.79, 1], [0.91, -1]]) {
        marshalPost(K(s), sd, 1.8);
      }

      guardrail(0.29, 0.34,  1, 0.5, ARMCO);
      guardrail(0.38, 0.43,  1, 0.5, ARMCO);
      guardrail(0.78, 0.84, -1, 0.5, ARMCO);
      guardrail(0.15, 0.19, -1, 0.4, ARMCO);
      guardrail(0.62, 0.68, -1, 0.4, ARMCO);
    },
  }
  );
})();
