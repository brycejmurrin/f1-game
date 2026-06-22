/* Apex 26 — MADRID circuit definition (data only).
   Registered on the global TrackDefs list; consumed by the js/tracks.js engine
   (palette resolved there from `night`, geometry from js/circuits.js or `segs`). */
(function () {
  "use strict";
  (window.TrackDefs = window.TrackDefs || []).push(
  {
    id: "madrid",
    name: "MADRID",
    gp: "Spanish GP",
    country: "Spain",
    night: false,
    theme: "modern",
    lengthKm: 5.5,
    baseHW: 7,
    // La Monumental: the signature ~24% banked stadium curve.
    banked: true,
    street: true,
    pal: { zenith: [0.22, 0.48, 0.82], horizon: [0.74, 0.74, 0.72], grass: [0.3, 0.42, 0.2], sunDir: [0.12094709553657013, 0.967576764292561, 0.22173634181704524], sun: [1.0, 0.90, 0.65], sunColor: [1, 0.98, 0.94] },
    segs: [
      { t: 0, l: 320 }, { t: 70, l: 70 }, { t: -65, l: 70 }, { t: 50, l: 120 }, { t: 0, l: 360 }, { t: 90, l: 80 },
      { t: -85, l: 70 }, { t: 90, l: 80 }, { t: 0, l: 140 }, { t: 180, l: 240, b: 0.42, w: 9 }, { t: 0, l: 80 }, { t: -60, l: 90, h: 6 },
      { t: 70, l: 90, h: -4 }, { t: -50, l: 80 }, { t: 80, l: 90 }, { t: 60, l: 130 },
    ],
    // ~26 m of relief: climb toward the high point at Turn 7, drop back to the pits.
    elevations: [{ s: 0.60, halfM: 300, rise: 12 }, { s: 0.85, halfM: 200, rise: -6 }],
    scenery: function (api) {
      const { out, n, px, py, pz, hw, pyMin, place, prop, hash, onTrack,
              mountain, grandstand, building, tower, tree, bush, hedge,
              billboard, gantry, marshalPost, wall, fence, guardrail, tyreWall,
              addBox, addCyl, addCone, addPrism, anchor, vadd } = api;

      const WHITE = [0.90, 0.92, 0.94], GLASS = [0.62, 0.74, 0.82];
      const CONCRETE = [0.74, 0.75, 0.77], OLIVE = [0.42, 0.48, 0.30];
      const STEEL = [0.55, 0.58, 0.62], DKGLASS = [0.40, 0.52, 0.62];
      const STONE = [0.78, 0.76, 0.70], REDROOF = [0.55, 0.30, 0.26];

      // lap centre + radius (used for the concentric backdrop rings)
      let cx = 0, cz = 0;
      for (let i = 0; i < n; i++) { cx += px[i]; cz += pz[i]; }
      cx /= n; cz /= n;
      let rad = 0;
      for (let i = 0; i < n; i++) rad = Math.max(rad, Math.hypot(px[i] - cx, pz[i] - cz));

      // ── (1) FAR HORIZON: a faint hazy Sierra de Guadarrama ridge, low + distant only.
      //     Kept low-detail and behind the city so it reads only as depth on the skyline. ──
      for (const [extra, wMin, hMin, count, col, snowL] of [
        [880, 360, 150, 26, [0.55, 0.60, 0.66], 0.80],  // far Sierra, faint snow caps
        [1180, 440, 210, 22, [0.58, 0.62, 0.68], 0.72], // farthest hazed range
      ]) {
        const ring = rad + extra;
        for (let i = 0; i < count; i++) {
          const a = (i + (hash(i * 5 + extra) - 0.5) * 0.5) / count * 6.2832;
          const h = hash(i * 7 + extra), j = hash(i * 11 + extra);
          mountain(cx + Math.cos(a) * ring, cz + Math.sin(a) * ring, pyMin,
                   wMin + h * 160, hMin + j * 110,
                   { seg: 6, seed: i * 13 + extra, snowline: snowL, rock: col,
                     forest: [0.46, 0.50, 0.50] });
        }
      }

      // ── (2) MADRID CITY SKYLINE: the hero backdrop. Two concentric rings of towers
      //     and blocks of widely varied height + colour, evoking the Cuatro Torres /
      //     AZCA business district + dense urban mass. Anchored as world-coord towers
      //     so they ring the venue cleanly instead of scattering across the infield. ──
      const skyPal = [
        [0.66, 0.70, 0.76], [0.58, 0.64, 0.72], [0.72, 0.74, 0.76],
        [0.50, 0.58, 0.66], [0.78, 0.78, 0.80], [0.46, 0.54, 0.62],
        [0.68, 0.66, 0.62], [0.60, 0.68, 0.74],
      ];
      function cityTower(wx, wz, baseW, h, col, cap) {
        // settle to the lap low point so the tower foot reads as ground level
        const yb = pyMin;
        addBox(out, [wx, yb + h / 2, wz], [baseW, h, baseW], col);
        // window banding: thin darker insets up the face
        const bands = Math.max(2, Math.floor(h / 14));
        for (let b = 1; b < bands; b++) {
          const yy = yb + (b / bands) * h;
          addBox(out, [wx, yy, wz], [baseW * 1.01, 1.4, baseW * 1.01], DKGLASS);
        }
        if (cap) addBox(out, [wx, yb + h + 4, wz], [3, 8, 3], [0.85, 0.30, 0.25]); // antenna/mast tip
      }
      // inner dense ring — mid-rise urban blocks
      {
        const ring = rad + 380, count = 54;
        for (let i = 0; i < count; i++) {
          const a = i / count * 6.2832 + (hash(i * 3) - 0.5) * 0.04;
          const jr = (hash(i * 9) - 0.5) * 120;
          const wx = cx + Math.cos(a) * (ring + jr), wz = cz + Math.sin(a) * (ring + jr);
          if (onTrack(wx, wz, 30)) continue;
          const h = 26 + hash(i * 7) * 60;
          const w = 16 + hash(i * 13) * 22;
          cityTower(wx, wz, w, h, skyPal[i % skyPal.length], false);
        }
      }
      // outer ring — the tall landmark towers (Cuatro Torres flavour), some glass-capped
      {
        const ring = rad + 560, count = 30;
        for (let i = 0; i < count; i++) {
          const a = i / count * 6.2832 + (hash(i * 17) - 0.5) * 0.06;
          const jr = (hash(i * 23) - 0.5) * 160;
          const wx = cx + Math.cos(a) * (ring + jr), wz = cz + Math.sin(a) * (ring + jr);
          if (onTrack(wx, wz, 30)) continue;
          const h = 90 + hash(i * 5) * 150;       // genuine skyscrapers
          const w = 22 + hash(i * 11) * 18;
          cityTower(wx, wz, w, h, skyPal[(i + 3) % skyPal.length], hash(i * 19) > 0.45);
        }
      }
      // four signature super-towers grouped on one bearing (the "Cuatro Torres" cluster)
      {
        const a = 0.9, ring = rad + 700;
        const bx = cx + Math.cos(a) * ring, bz = cz + Math.sin(a) * ring;
        const perpx = -Math.sin(a), perpz = Math.cos(a);
        const hts = [240, 268, 252, 224];
        for (let i = 0; i < 4; i++) {
          const off = (i - 1.5) * 70;
          cityTower(bx + perpx * off, bz + perpz * off, 28, hts[i],
                    i % 2 ? [0.62, 0.70, 0.78] : [0.72, 0.74, 0.78], true);
        }
      }

      // ── (3) LA MONUMENTAL: the HERO banked stadium curve (s≈0.75). Tall tiered
      //     grandstands wrapping ~270° on BOTH sides, white shells, crowd, plus a ring
      //     of modern floodlight towers — the signature Las-Ventas-style stadium bowl. ──
      const kmono = Math.round(n * 0.75) % n;
      const step = Math.max(1, Math.round(n / 54));
      for (let i = -13; i <= 13; i++) {
        const k = ((kmono + i * step) % n + n) % n;
        grandstand(k / n, 1, 7, 30, [0.88, 0.89, 0.92], [0.50, 0.30, 0.30]);
        grandstand(k / n, -1, 9, 30, [0.88, 0.89, 0.92], [0.52, 0.32, 0.32]);
      }
      // floodlight towers — tall grey poles with bright lamp head, ringing both sides
      for (let i = -11; i <= 11; i += 2) {
        const k = ((kmono + i * step) % n + n) % n;
        for (const side of [1, -1]) {
          const A = anchor(k, side, hw[k] + 48);
          const base = A.c, top = vadd(base, A.u, 44);
          addCyl(out, vadd(base, A.u, 22), 0.95, 44, [0.40, 0.42, 0.46], 6, [A.r, A.u, A.t]);
          // lamp rig head — compact modern design
          addBox(out, vadd(top, A.u, 1.8), [8, 2.8, 2.8], [0.28, 0.30, 0.34], [A.r, A.u, A.t]);
          for (let g = -1; g <= 1; g++)
            addBox(out, vadd(vadd(top, A.u, 2.1), A.r, g * 2.5), [1.8, 1.4, 1.6], [0.98, 0.98, 0.88], [A.r, A.u, A.t]);
        }
      }

      // ── (4) IFEMA EXHIBITION HALLS: massive modern white boxes with glass window bands.
      //     The pit & paddock sit inside these large rectangular convention halls. ──
      //     Clean geometries, bright white walls, modern institutional aesthetic. ──
      for (const [frac, side, w, h, d, dist] of [
        [0.02, 1, 100, 26, 130, 168], [0.02, -1, 90, 24, 118, 158], [0.05, 1, 115, 24, 105, 178],
        [0.05, -1, 82, 21, 95, 160], [0.08, 1, 95, 25, 108, 168], [0.11, -1, 102, 22, 118, 171],
        [0.97, -1, 102, 24, 120, 173], [0.94, 1, 90, 22, 106, 168],
      ]) {
        const k = Math.round(frac * n) % n;
        building(k, side, dist - w / 2, w, h, d, { wall: WHITE, window: GLASS, floor: 4.5 });
        // Modern glass curtain strip along the front facade for extra glass sheen
        const A = anchor(k, side, dist - w / 2 - 3.5);
        if (!onTrack(A.c[0], A.c[2], 16))
          addBox(out, vadd(A.c, A.u, h * 0.45), [64, h * 0.6, 220], [0.30, 0.38, 0.48], [A.r, A.u, A.t]);
      }
      // modern IFEMA grandstands (s≈0.88–0.94) — white-shelled stepped stands
      for (const [frac, side] of [[0.88, 1], [0.90, 1], [0.92, 1], [0.94, 1], [0.90, -1], [0.93, -1]]) {
        grandstand(frac, side, 10, 36, WHITE, [0.50, 0.30, 0.30]);
      }

      // ── (5) PIT / PADDOCK COMPLEX along the start–finish straight (s≈0.97–0.06). ──
      // Main grandstands flanking the start line (hero viewpoint)
      grandstand(0.0, 1, 11, 50, WHITE, [0.48, 0.30, 0.30]);
      grandstand(0.0, -1, 11, 44, WHITE, [0.48, 0.30, 0.30]);
      grandstand(0.97, 1, 11, 42, WHITE, [0.48, 0.30, 0.30]);
      // Long low pit building (garages) on the right of the main straight
      for (let s = 0.985; s < 1.085; s += 0.013) {
        const f = s % 1;
        const k = Math.round(f * n) % n;
        const A = anchor(k, 1, hw[k] + 17);
        addBox(out, vadd(A.c, A.u, 5.2), [17, 10.4, 27], WHITE, [A.r, A.u, A.t]);         // garage block
        addBox(out, vadd(vadd(A.c, A.u, 10.7), A.t, 0), [17.5, 0.9, 27], [0.55, 0.62, 0.70], [A.r, A.u, A.t]); // roof beam
        addBox(out, vadd(vadd(A.c, A.u, 6), A.r, -8.8), [0.65, 6.2, 25], GLASS, [A.r, A.u, A.t]); // glass frontage
      }
      // Paddock motorhomes / hospitality units behind the pits (white + glass modern cubes)
      for (let s = 0.99; s < 1.06; s += 0.019) {
        const f = s % 1, k = Math.round(f * n) % n;
        const A = anchor(k, 1, hw[k] + 45);
        const h = 7.5 + hash(k * 3) * 4.5;
        addBox(out, vadd(A.c, A.u, h / 2), [15, h, 19], hash(k) > 0.5 ? WHITE : STEEL, [A.r, A.u, A.t]);
        addBox(out, vadd(A.c, A.u, h * 0.54), [15.2, 2.2, 19.2], DKGLASS, [A.r, A.u, A.t]);
      }

      // ── (6) START/SCORING GANTRY across the line + a second timing gantry at the
      //     pit exit (overhead structures spanning the track). ──
      gantry(0.0, 8.5, [0.20, 0.22, 0.26]);
      gantry(0.05, 7.5, [0.22, 0.24, 0.28]);

      // ── (7) TRACKSIDE BARRIERS & FURNITURE. Street sectors get tight concrete walls
      //     + catch fences; permanent loop has open guardrails. Colored tyre-walls
      //     mark the chicanes and technical entries. Billboards & marshal posts dotted. ──
      // Street-sector concrete walls down the early urban straights (both sides)
      wall(0.005, 0.087, 1, 1.4, 1.15, CONCRETE, 0.48);
      wall(0.005, 0.087, -1, 1.4, 1.15, CONCRETE, 0.48);
      wall(0.30, 0.40, 1, 1.5, 1.35, CONCRETE, 0.5);    // elevated urban sector
      wall(0.30, 0.40, -1, 1.5, 1.35, CONCRETE, 0.5);
      wall(0.47, 0.54, 1, 1.5, 1.4, [0.70, 0.70, 0.72], 0.58); // El Búnker retaining wall
      // Catch fences set behind the walls on street sectors (safety net reads)
      fence(0.005, 0.087, 1, 3.0, 2.9, [0.62, 0.64, 0.66]);
      fence(0.30, 0.40, -1, 3.0, 2.9, [0.62, 0.64, 0.66]);
      fence(0.47, 0.54, 1, 3.0, 2.9, [0.62, 0.64, 0.66]);
      // Permanent-loop guardrails (wider northern run-off sections)
      guardrail(0.54, 0.73, 1, 4.8, [0.80, 0.80, 0.82]);
      guardrail(0.54, 0.73, -1, 4.8, [0.80, 0.80, 0.82]);
      guardrail(0.86, 0.97, -1, 4.8, [0.80, 0.80, 0.82]);
      // Tyre walls protecting the chicane & corners (bright colored conveyor caps)
      tyreWall(0.075, 0.10, 1, 3, [0.90, 0.30, 0.20]);
      tyreWall(0.133, 0.162, -1, 3, [0.20, 0.40, 0.85]);
      tyreWall(0.50, 0.53, 1, 3, [0.95, 0.80, 0.15]);

      // Billboards & marshal posts spaced around the lap
      const adCols = [[0.90, 0.25, 0.20], [0.15, 0.45, 0.85], [0.95, 0.78, 0.15], [0.20, 0.65, 0.40], [0.85, 0.85, 0.88]];
      for (const [frac, side] of [
        [0.06, 1], [0.12, -1], [0.20, 1], [0.28, -1], [0.35, 1], [0.42, -1],
        [0.49, 1], [0.59, -1], [0.67, 1], [0.79, -1], [0.85, 1], [0.92, -1], [0.96, 1],
      ]) {
        const k = Math.round(frac * n) % n;
        billboard(k, side, 6, 9.5, 4.8, adCols[k % adCols.length]);
      }
      for (const [frac, side] of [
        [0.04, -1], [0.10, 1], [0.18, -1], [0.25, 1], [0.32, -1], [0.40, 1],
        [0.47, -1], [0.56, 1], [0.63, -1], [0.72, 1], [0.80, -1], [0.88, 1], [0.95, -1],
      ]) {
        const k = Math.round(frac * n) % n;
        marshalPost(k, side, 4);
      }

      // ── (8) URBAN GREENERY: clipped hedges & street trees along the avenues, plus a
      //     dry-plains scrub band behind the venue to read as the Castilian edge. ──
      hedge(0.09, 0.20, -1, 8, 1.6, [0.30, 0.42, 0.26]);
      hedge(0.22, 0.32, 1, 9, 1.6, [0.30, 0.42, 0.26]);
      hedge(0.85, 0.96, 1, 10, 1.6, [0.30, 0.42, 0.26]);
      // boulevard plane trees lining the street sectors (off-tarmac, terrain-anchored)
      for (let i = 0; i < n; i += 4) {
        const f = i / n;
        const inStreet = (f < 0.20) || (f > 0.28 && f < 0.55) || (f > 0.85);
        if (!inStreet) continue;
        for (const side of [-1, 1]) {
          if (hash(i * 13 + side) > 0.55) continue;
          const d = 14 + hash(i * 7 + side) * 8;
          if (onTrack(px[i] + 0, pz[i] + 0, 16)) continue;
          tree(i, side, d, 7 + hash(i * 5) * 4, [0.26, 0.40, 0.22]);
        }
      }

      // ── (9) DRY CASTILIAN PLAINS filler behind everything — straw-tan patches +
      //     olive scrub, sparse so the city/venue reads as the foreground. ──
      const TAN = [0.78, 0.70, 0.48];
      for (let i = 0; i < n; i += 4) {
        for (const side of [-1, 1]) {
          if (hash(i * 31 + side) > 0.60) continue;
          const d = 70 + hash(i * 17 + side) * 100;
          const k = ((i % n) + n) % n;
          const A = anchor(k, side, d);
          const mx = A.c[0], mz = A.c[2];
          if (onTrack(mx, mz, 20)) continue;
          const r = hash(i * 41 + side);
          if (r < 0.50) bush(k, side, d, OLIVE);
          else if (r < 0.78) tree(k, side, d, 5 + hash(i * 53) * 4, OLIVE);
        }
      }

      // ── (10) AIRPORT RUNWAY EDGE LIGHTS: s≈0.0–0.10, amber/white taxi-light dots ──
      // A row of small bright boxes at distance 80m, one side, every 15m
      for (let i = 0; i < 7; i++) {
        const f = i * 0.014;   // ~0.10 / 7 steps
        const k = Math.round(f * n) % n;
        const A = anchor(k, 1, 80);
        if (!onTrack(A.c[0], A.c[2], 4))
          addBox(out, vadd(A.c, A.u, 0.5), [0.5, 1.0, 0.5], [1.0, 0.80, 0.30], [A.r, A.u, A.t]);
      }

      // ── (11) MADRID IFEMA-AREA SKYLINE: 7 buildings at distance 250–350m ──
      for (let i = 0; i < 7; i++) {
        const f = 0.25 + i * 0.07;   // spread from s≈0.25 to s≈0.70
        const k = Math.round((f % 1) * n) % n;
        const dist = 250 + hash(i * 19) * 100;
        const h = 60 + hash(i * 31) * 40;
        const w = 20 + hash(i * 47) * 16;
        const A = anchor(k, -1, dist);
        if (!onTrack(A.c[0], A.c[2], 22))
          building(k, -1, dist - w / 2, w, h, w,
            { wall: [0.58, 0.56, 0.54], window: [0.32, 0.38, 0.48], floor: 8 });
      }

      // ── (12) WIDE PLAZA GEOMETRY: flat slabs at s≈0.45–0.55 (open IFEMA plaza) ──
      for (let i = 0; i < 5; i++) {
        const f = 0.45 + i * 0.025;
        const k = Math.round(f * n) % n;
        for (const side of [-1, 1]) {
          const dist = 30 + i * 4;
          const A = anchor(k, side, dist);
          if (!onTrack(A.c[0], A.c[2], 10))
            addBox(out, vadd(A.c, A.u, 0.15), [60, 0.3, 40], [0.58, 0.56, 0.54], [A.r, A.u, A.t]);
        }
      }

      // ── (13) SPANISH COLOUR ACCENT billboards near the pit straight ──
      billboard(Math.round(0.01 * n) % n, 1, 14, 12, 5, [0.85, 0.15, 0.12]);   // Spanish red
      billboard(Math.round(0.04 * n) % n, -1, 12, 12, 5, [0.92, 0.72, 0.08]);  // Spanish gold

      // ── (14) MADRID SKYLINE: additional modern towers + Cuatro Torres cluster
      //     Secondary mid-rise ring (40–70m typical Madrid commercial/residential)
      //     Plus a distinctive grouped super-towers cluster for visual landmark. ──
      // Secondary mid-rise ring providing urban frame depth
      {
        const ring = rad + 440, count = 38;
        for (let i = 0; i < count; i++) {
          const a = i / count * 6.2832 + (hash(i * 11) - 0.5) * 0.07;
          const jr = (hash(i * 13) - 0.5) * 130;
          const wx = cx + Math.cos(a) * (ring + jr), wz = cz + Math.sin(a) * (ring + jr);
          if (onTrack(wx, wz, 24)) continue;
          const h = 35 + hash(i * 6) * 55;
          const w = 19 + hash(i * 14) * 22;
          cityTower(wx, wz, w, h, skyPal[(i + 4) % skyPal.length], hash(i * 21) > 0.58);
        }
      }

      // ── (15) ENHANCED URBAN GREENERY: Madrid plane trees & formal hedges
      //     Clipped hedges mark sector transitions; avenue trees in key urban zones. ──
      hedge(0.10, 0.25, -1, 8, 1.8, [0.32, 0.44, 0.28]);     // northern approach hedge
      hedge(0.32, 0.42, 1, 10, 1.8, [0.32, 0.44, 0.28]);      // elevated urban sector hedge
      hedge(0.54, 0.62, -1, 9, 1.7, [0.32, 0.44, 0.28]);      // Búnker-to-Monumental edge
      // Street-front plane trees in sparse clusters (modern urban streetscape)
      for (let i = 0; i < n; i += 6) {
        const f = i / n;
        if ((f >= 0.08 && f <= 0.25) || (f >= 0.32 && f <= 0.55) || (f >= 0.88 && f <= 0.97)) {
          for (const side of [-1, 1]) {
            if (hash(i * 13 + side) > 0.68) continue;
            const d = 10 + hash(i * 7 + side) * 5;
            if (onTrack(px[i], pz[i], 14)) continue;
            tree(i, side, d, 5.5 + hash(i * 5) * 3, [0.28, 0.42, 0.24]);
          }
        }
      }

      // ── (16) MODERN ROOF CANOPIES: lightweight glass/steel structures
      //     Over select IFEMA grandstand areas (s≈0.88–0.94) — swept-roof prism canopies. ──
      for (const frac of [0.89, 0.91, 0.93]) {
        const k = Math.round(frac * n) % n;
        const A = anchor(k, 1, hw[k] + 28);
        if (!onTrack(A.c[0], A.c[2], 20)) {
          addPrism(out, vadd(A.c, A.u, 8), [36, 3.5, 32], [0.50, 0.62, 0.72], [A.r, A.u, A.t]);
        }
      }

      // ── (17) KERB & BARRIER ACCENT COLOURS: bright chicane entry/exit markings ──
      // Coloured tyre-wall caps at key braking/technical zones
      tyreWall(0.075, 0.10, 1, 3, [0.92, 0.28, 0.18]);        // T1 entry — red
      tyreWall(0.135, 0.165, -1, 3, [0.95, 0.75, 0.15]);      // T2 exit — yellow/gold
      tyreWall(0.70, 0.75, 1, 4, [0.90, 0.30, 0.20]);         // Monumental entry — red
    },
  }
  );
})();
