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
              addBox, addCyl, addCone, addPrism, addPyramid, addFrustum, anchor, vadd } = api;

      // ── PALETTE ──────────────────────────────────────────────────────────────
      // Madrid: bright dry Mediterranean day. Warm whites, pale stone, blue sky,
      // olive-tinted greenery. Sunlit glass reads as bright ice-blue.
      const WHITE    = [0.92, 0.93, 0.94];   // clean modern concrete / grandstand shell
      const OFFWHITE = [0.88, 0.87, 0.84];   // slightly warm: pit wall, parade fence
      const GLASS    = [0.66, 0.78, 0.88];   // sunlit glass curtain wall (ice-blue in sun)
      const LGLASS   = [0.75, 0.85, 0.92];   // brightest highlight glass — reflective facade
      const CONCRETE = [0.74, 0.75, 0.77];   // bare concrete wall / retaining wall
      const OLIVE    = [0.42, 0.48, 0.30];   // dry Castilian scrub
      const STEEL    = [0.55, 0.58, 0.62];   // galvanised steel / roof beam
      const DKGLASS  = [0.34, 0.44, 0.58];   // deep blue tinted glass — dark faces of towers
      const LITWIN   = [0.80, 0.88, 0.98];   // emissive lit-window tint (near-white blue)
      const STONE    = [0.78, 0.76, 0.70];   // Madrid limestone / sandstone
      const AMBER    = [1.00, 0.78, 0.28];   // lamp post head / runway light
      const LAMPGREY = [0.36, 0.38, 0.42];   // lamp post shaft
      const REDROOF  = [0.55, 0.30, 0.26];   // terracotta tile (historic quarter)

      // ── TRACK CENTRE + RADIUS (used for encircling backdrop rings) ────────
      let cx = 0, cz = 0;
      for (let i = 0; i < n; i++) { cx += px[i]; cz += pz[i]; }
      cx /= n; cz /= n;
      let rad = 0;
      for (let i = 0; i < n; i++) rad = Math.max(rad, Math.hypot(px[i] - cx, pz[i] - cz));

      // ── (1) FAR HORIZON: hazy Sierra de Guadarrama ridge, low + distant. ──
      // Kept low-detail so it reads only as depth — not competing with the city.
      for (const [extra, wMin, hMin, count, col, snowL] of [
        [900, 360, 140, 24, [0.56, 0.60, 0.66], 0.82],   // mid Sierra, faint snow caps
        [1200, 440, 200, 20, [0.60, 0.63, 0.68], 0.74],  // farthest hazed range
      ]) {
        const ring = rad + extra;
        for (let i = 0; i < count; i++) {
          const a = (i + (hash(i * 5 + extra) - 0.5) * 0.5) / count * 6.2832;
          const hv = hash(i * 7 + extra), j = hash(i * 11 + extra);
          mountain(cx + Math.cos(a) * ring, cz + Math.sin(a) * ring, pyMin,
                   wMin + hv * 150, hMin + j * 100,
                   { seg: 6, seed: i * 13 + extra, snowline: snowL, rock: col,
                     forest: [0.46, 0.50, 0.50] });
        }
      }

      // ── (2) MADRID CITY SKYLINE: two concentric rings of towers + the
      //    Cuatro Torres super-cluster. Rings are separated enough (440 vs 600)
      //    that they do not overlap each other. cityTower is defined locally and
      //    uses LITWIN for window bands so lit windows glow at dusk/night. ──
      const skyPal = [
        [0.66, 0.70, 0.76], [0.58, 0.64, 0.72], [0.72, 0.74, 0.76],
        [0.50, 0.58, 0.66], [0.78, 0.78, 0.80], [0.46, 0.54, 0.62],
        [0.68, 0.66, 0.62], [0.60, 0.68, 0.74],
      ];
      // Inner dense ring — mid-rise urban blocks (rad+440). Window bands use
      // a brighter near-white blue so they read as lit glass in daylight too.
      {
        const ring = rad + 440, count = 48;
        for (let i = 0; i < count; i++) {
          const a = i / count * 6.2832 + (hash(i * 3) - 0.5) * 0.04;
          const jr = (hash(i * 9) - 0.5) * 110;
          const wx = cx + Math.cos(a) * (ring + jr), wz = cz + Math.sin(a) * (ring + jr);
          if (onTrack(wx, wz, 30)) continue;
          const h = 28 + hash(i * 7) * 58;
          const w = 16 + hash(i * 13) * 20;
          const yb = pyMin;
          addBox(out, [wx, yb + h / 2, wz], [w, h, w], skyPal[i % skyPal.length]);
          // window banding: bright lit-glass insets — emissive warmth at night
          const bands = Math.max(2, Math.floor(h / 12));
          for (let b = 1; b < bands; b++) {
            const yy = yb + (b / bands) * h;
            addBox(out, [wx, yy, wz], [w * 1.01, 1.2, w * 1.01], LITWIN);
          }
        }
      }
      // Outer ring — tall landmark towers (rad+620). Larger gaps between towers.
      {
        const ring = rad + 620, count = 26;
        for (let i = 0; i < count; i++) {
          const a = i / count * 6.2832 + (hash(i * 17) - 0.5) * 0.06;
          const jr = (hash(i * 23) - 0.5) * 150;
          const wx = cx + Math.cos(a) * (ring + jr), wz = cz + Math.sin(a) * (ring + jr);
          if (onTrack(wx, wz, 30)) continue;
          const h = 95 + hash(i * 5) * 140;
          const w = 22 + hash(i * 11) * 18;
          const yb = pyMin;
          addBox(out, [wx, yb + h / 2, wz], [w, h, w], skyPal[(i + 3) % skyPal.length]);
          // lit window banding — more bands on taller towers
          const bands = Math.max(3, Math.floor(h / 14));
          for (let b = 1; b < bands; b++) {
            const yy = yb + (b / bands) * h;
            addBox(out, [wx, yy, wz], [w * 1.01, 1.4, w * 1.01], LITWIN);
          }
          // antenna/mast cap on ~half the towers
          if (hash(i * 19) > 0.45)
            addBox(out, [wx, yb + h + 4, wz], [3, 8, 3], [0.85, 0.30, 0.25]);
        }
      }
      // Four signature super-towers: the "Cuatro Torres" cluster on one bearing.
      // Placed at rad+760 so they sit well behind the outer ring without overlap.
      {
        const a = 0.9, ring = rad + 760;
        const bx = cx + Math.cos(a) * ring, bz = cz + Math.sin(a) * ring;
        const perpx = -Math.sin(a), perpz = Math.cos(a);
        const hts = [240, 268, 252, 224];
        for (let i = 0; i < 4; i++) {
          const off = (i - 1.5) * 72;
          const wx = bx + perpx * off, wz = bz + perpz * off;
          const h = hts[i], w = i % 2 ? 26 : 29;
          const yb = pyMin;
          // main shaft
          addBox(out, [wx, yb + h / 2, wz], [w, h, w],
                 i % 2 ? [0.62, 0.70, 0.78] : [0.72, 0.74, 0.78]);
          // glass face layer on the south-facing side (emissive lit-glass look)
          addBox(out, [wx, yb + h * 0.55, wz], [w * 1.01, h * 0.78, w * 0.12], LGLASS);
          // horizontal floor-plate banding
          const bands = Math.max(4, Math.floor(h / 18));
          for (let b = 1; b < bands; b++) {
            const yy = yb + (b / bands) * h;
            addBox(out, [wx, yy, wz], [w * 1.02, 1.6, w * 1.02], LITWIN);
          }
          // crown / antenna
          addBox(out, [wx, yb + h + 5, wz], [4, 10, 4], [0.85, 0.30, 0.25]);
          addCyl(out, [wx, yb + h + 15, wz], 0.28, 22, LAMPGREY, 5);
        }
      }

      // ── (3) LA MONUMENTAL: the HERO banked stadium curve (s≈0.75). Tall tiered
      //     grandstands wrapping ~270° on BOTH sides, white shells, crowd, plus a ring
      //     of modern floodlight towers — the signature bowl. Floodlights are
      //     well-separated (every 2 steps) to avoid crowding and clipping. ──
      const kmono = Math.round(n * 0.75) % n;
      const step = Math.max(1, Math.round(n / 54));
      for (let i = -13; i <= 13; i++) {
        const k = ((kmono + i * step) % n + n) % n;
        grandstand(k / n, 1, 7, 30, [0.88, 0.89, 0.92], [0.50, 0.30, 0.30]);
        grandstand(k / n, -1, 9, 30, [0.88, 0.89, 0.92], [0.52, 0.32, 0.32]);
      }
      // Floodlight towers: tall grey poles (every 3 steps = adequate spacing).
      // Lamp head uses AMBER so night pools read as warm sodium light.
      for (let i = -12; i <= 12; i += 3) {
        const k = ((kmono + i * step) % n + n) % n;
        for (const side of [1, -1]) {
          const A = anchor(k, side, hw[k] + 50);
          const base = A.c;
          // skip if the anchor landed on the road (e.g. tight banked inside)
          if (onTrack(base[0], base[2], 3)) continue;
          const poleTop = vadd(base, A.u, 46);
          addCyl(out, vadd(base, A.u, 23), 0.85, 46, LAMPGREY, 6, [A.r, A.u, A.t]);
          // lamp rig cross-arm
          addBox(out, vadd(poleTop, A.u, 1.5), [10, 2.2, 2.4], [0.28, 0.30, 0.34], [A.r, A.u, A.t]);
          // three lamp heads — warm amber emissive tone
          for (let g = -1; g <= 1; g++)
            addBox(out, vadd(vadd(poleTop, A.u, 1.8), A.r, g * 3.0),
                   [1.9, 1.3, 1.5], AMBER, [A.r, A.u, A.t]);
          // ground light-pool patch — pale warm circle beneath tower
          addBox(out, vadd(base, A.u, 0.05), [14, 0.12, 14], [0.88, 0.82, 0.68], [A.r, A.u, A.t]);
        }
      }

      // ── (4) IFEMA EXHIBITION HALLS: large modern white convention halls on the
      //     pit/paddock side (s≈0.96–0.12). Each hall is a single clean building()
      //     call — NO extra overlapping glass curtain box (that was the old clipping
      //     culprit). Instead a slim glass-strip addBox is placed ONLY as a facade
      //     element that sits proud of the front face by a few centimetres (not a
      //     massive slab that engulfs the whole building). Halls are spaced at least
      //     one building-width apart along the track to prevent interpenetration. ──
      for (const [frac, side, w, h, d, gap] of [
        [0.02, 1,  95, 24, 115, 80],
        [0.02, -1, 85, 22, 108, 76],
        [0.06, 1, 105, 23,  98, 84],
        [0.06, -1, 78, 20,  90, 74],
        [0.09, 1,  88, 24, 102, 80],
        [0.12, -1, 96, 21, 112, 78],
        [0.97, -1, 96, 22, 112, 78],
        [0.94, 1,  86, 21, 100, 78],
      ]) {
        const k = Math.round(frac * n) % n;
        building(k, side, gap, w, h, d, { wall: WHITE, window: GLASS, floor: 4.5 });
        // slim glass-ribbon accent: stands just proud of front face — width matches
        // building depth, height only 40% of building so it reads as a ground-floor
        // atrium strip, NOT a sky-high curtain that overlaps the whole structure.
        const A = anchor(k, side, gap + w * 0.5);
        if (!onTrack(A.c[0], A.c[2], 8)) {
          addBox(out, vadd(A.c, A.u, h * 0.22),
                 [2.2, h * 0.42, d * 0.88], LGLASS, [A.r, A.u, A.t]);
        }
        // emissive window-strip on the upper floor band (lit interior look)
        if (!onTrack(A.c[0], A.c[2], 8)) {
          addBox(out, vadd(A.c, A.u, h * 0.78),
                 [2.4, h * 0.14, d * 0.80], LITWIN, [A.r, A.u, A.t]);
        }
      }
      // IFEMA grandstands (s≈0.87–0.94) — white-shelled stepped stands
      for (const [frac, side] of [[0.87, 1], [0.89, 1], [0.91, 1], [0.93, 1], [0.90, -1], [0.93, -1]]) {
        grandstand(frac, side, 10, 36, WHITE, [0.50, 0.30, 0.30]);
      }
      // Canopy over IFEMA grandstands — thin glass/steel prism roofs, raised enough
      // that they clear the grandstand shell top (grandstand shell is ~12 m high,
      // roof slab at ~13 m — canopy placed at 15 m to sit above that).
      for (const frac of [0.88, 0.91]) {
        const k = Math.round(frac * n) % n;
        const A = anchor(k, 1, hw[k] + 32);
        if (!onTrack(A.c[0], A.c[2], 20))
          addPrism(out, vadd(A.c, A.u, 16), [38, 3.2, 30], [0.52, 0.64, 0.74], [A.r, A.u, A.t]);
      }

      // ── (5) PIT / PADDOCK COMPLEX (s≈0.97–0.08): main straight heroes. ──
      // Main grandstands flanking the start line
      grandstand(0.0,  1,  11, 50, WHITE, [0.48, 0.30, 0.30]);
      grandstand(0.0, -1,  11, 44, WHITE, [0.48, 0.30, 0.30]);
      grandstand(0.97, 1,  11, 42, WHITE, [0.48, 0.30, 0.30]);
      // Long low pit-garage building on the right of the main straight.
      // Each garage module is set at hw[k]+17 — large enough to clear the wall
      // and well inside the IFEMA buildings (which sit at gap≥74). We use a
      // reduced forward step (0.011) so modules butt together neatly.
      for (let s = 0.986; s < 1.083; s += 0.011) {
        const f = s % 1;
        const k = Math.round(f * n) % n;
        const A = anchor(k, 1, hw[k] + 17);
        if (onTrack(A.c[0], A.c[2], 9)) continue;
        addBox(out, vadd(A.c, A.u, 5.0), [16, 10.0, 25], WHITE,          [A.r, A.u, A.t]); // garage block
        addBox(out, vadd(A.c, A.u, 10.2), [16.5, 0.8, 25], STEEL,        [A.r, A.u, A.t]); // roof beam
        addBox(out, vadd(vadd(A.c, A.u, 5.4), A.r, -8.2), [0.5, 5.8, 23], GLASS, [A.r, A.u, A.t]); // glass front
      }
      // Paddock motorhomes / hospitality behind the pits (right side, further back).
      for (let s = 0.992; s < 1.058; s += 0.018) {
        const f = s % 1, k = Math.round(f * n) % n;
        const A = anchor(k, 1, hw[k] + 42);
        if (onTrack(A.c[0], A.c[2], 8)) continue;
        const h = 7.5 + hash(k * 3) * 4.0;
        addBox(out, vadd(A.c, A.u, h / 2), [14, h, 18], hash(k) > 0.5 ? WHITE : OFFWHITE, [A.r, A.u, A.t]);
        addBox(out, vadd(A.c, A.u, h * 0.56), [14.2, 2.0, 18.2], DKGLASS, [A.r, A.u, A.t]);
        // lit top-floor strip
        addBox(out, vadd(A.c, A.u, h * 0.88), [14.4, 1.0, 18.4], LITWIN, [A.r, A.u, A.t]);
      }

      // ── (6) START/SCORING GANTRY + pit-exit timing gantry. ──
      gantry(0.0, 8.5, [0.20, 0.22, 0.26]);
      gantry(0.05, 7.5, [0.22, 0.24, 0.28]);

      // ── (7) LAMP POSTS — street sectors + pit straight.
      //     Standard modern LED column: slim steel shaft, bright white/warm head.
      //     Placed every ~25 m along both sides of the urban straights.
      //     Light-pool patch under each head gives day/night illumination read. ──
      // Main straight lamp posts (s≈0.97–0.10, both sides)
      for (let s = 0.970; s < 1.105; s += 0.028) {
        const f = s % 1;
        const k = Math.round(f * n) % n;
        for (const side of [1, -1]) {
          const A = anchor(k, side, hw[k] + 5.5);
          if (onTrack(A.c[0], A.c[2], 2.5)) continue;
          addCyl(out, vadd(A.c, A.u, 5.5), 0.12, 11, LAMPGREY, 5, [A.r, A.u, A.t]); // shaft
          addBox(out, vadd(A.c, A.u, 11.4), [3.0, 0.5, 0.5], LAMPGREY, [A.r, A.u, A.t]); // arm
          addBox(out, vadd(vadd(A.c, A.u, 11.2), A.r, side * 1.3),
                 [0.9, 0.6, 0.9], AMBER, [A.r, A.u, A.t]); // lamp head
          addBox(out, vadd(A.c, A.u, 0.05), [5, 0.1, 5], [0.86, 0.80, 0.64], [A.r, A.u, A.t]); // light pool
        }
      }
      // Street-sector lamp posts (s≈0.10–0.55, alternating sides every ~30 m)
      for (let s = 0.10; s < 0.55; s += 0.032) {
        const f = s % 1;
        const k = Math.round(f * n) % n;
        const side = (Math.round(s * 10) % 2 === 0) ? 1 : -1;
        const A = anchor(k, side, hw[k] + 5.0);
        if (onTrack(A.c[0], A.c[2], 2.5)) continue;
        addCyl(out, vadd(A.c, A.u, 5.5), 0.12, 11, LAMPGREY, 5, [A.r, A.u, A.t]);
        addBox(out, vadd(A.c, A.u, 11.4), [2.5, 0.5, 0.5], LAMPGREY, [A.r, A.u, A.t]);
        addBox(out, vadd(vadd(A.c, A.u, 11.2), A.r, side * 1.1),
               [0.8, 0.55, 0.8], AMBER, [A.r, A.u, A.t]);
        addBox(out, vadd(A.c, A.u, 0.05), [4, 0.1, 4], [0.86, 0.80, 0.64], [A.r, A.u, A.t]);
      }

      // ── (8) TRACKSIDE BARRIERS & FURNITURE. ──
      // Street-sector concrete walls (urban straights, both sides)
      wall(0.005, 0.087, 1, 1.4, 1.15, CONCRETE, 0.48);
      wall(0.005, 0.087, -1, 1.4, 1.15, CONCRETE, 0.48);
      wall(0.30, 0.40, 1, 1.5, 1.35, CONCRETE, 0.5);
      wall(0.30, 0.40, -1, 1.5, 1.35, CONCRETE, 0.5);
      wall(0.47, 0.54, 1, 1.5, 1.4, [0.70, 0.70, 0.72], 0.58);  // El Búnker retaining wall
      // Catch fences on street sectors
      fence(0.005, 0.087, 1, 3.0, 2.9, [0.62, 0.64, 0.66]);
      fence(0.30,  0.40, -1, 3.0, 2.9, [0.62, 0.64, 0.66]);
      fence(0.47,  0.54,  1, 3.0, 2.9, [0.62, 0.64, 0.66]);
      // Permanent-loop guardrails (wider northern run-off sections)
      guardrail(0.54, 0.73, 1, 4.8, [0.80, 0.80, 0.82]);
      guardrail(0.54, 0.73, -1, 4.8, [0.80, 0.80, 0.82]);
      guardrail(0.86, 0.97, -1, 4.8, [0.80, 0.80, 0.82]);
      // Tyre walls: chicane & corner entries/exits
      tyreWall(0.075, 0.10,  1, 3, [0.90, 0.30, 0.20]);   // T1 entry — red
      tyreWall(0.133, 0.162,-1, 3, [0.20, 0.40, 0.85]);   // T2 exit — blue
      tyreWall(0.50,  0.53,  1, 3, [0.95, 0.80, 0.15]);   // street chicane — yellow
      tyreWall(0.70,  0.75,  1, 4, [0.90, 0.30, 0.20]);   // Monumental entry — red

      // ── (9) BILLBOARDS & MARSHAL POSTS spaced around the lap. ──
      const adCols = [[0.90, 0.25, 0.20], [0.15, 0.45, 0.85], [0.95, 0.78, 0.15],
                      [0.20, 0.65, 0.40], [0.85, 0.85, 0.88]];
      for (const [frac, side] of [
        [0.06, 1], [0.12, -1], [0.20, 1], [0.28, -1], [0.35, 1], [0.42, -1],
        [0.49, 1], [0.59, -1], [0.67, 1], [0.79, -1], [0.85, 1], [0.92, -1], [0.96, 1],
      ]) {
        const k = Math.round(frac * n) % n;
        billboard(k, side, 6, 9.5, 4.8, adCols[k % adCols.length]);
      }
      // Spanish colour-accent billboards near pit straight
      billboard(Math.round(0.01 * n) % n, 1, 14, 12, 5, [0.85, 0.15, 0.12]);  // red
      billboard(Math.round(0.04 * n) % n, -1, 12, 12, 5, [0.92, 0.72, 0.08]); // gold
      for (const [frac, side] of [
        [0.04, -1], [0.10, 1], [0.18, -1], [0.25, 1], [0.32, -1], [0.40, 1],
        [0.47, -1], [0.56, 1], [0.63, -1], [0.72, 1], [0.80, -1], [0.88, 1], [0.95, -1],
      ]) {
        const k = Math.round(frac * n) % n;
        marshalPost(k, side, 4);
      }

      // ── (10) URBAN GREENERY: clipped hedges + street plane trees. ──
      hedge(0.09, 0.20, -1, 8, 1.6, [0.30, 0.42, 0.26]);
      hedge(0.22, 0.32,  1, 9, 1.6, [0.30, 0.42, 0.26]);
      hedge(0.85, 0.96,  1, 10, 1.6, [0.30, 0.42, 0.26]);
      // Enhanced hedges for sector transitions
      hedge(0.10, 0.25, -1, 8, 1.8, [0.32, 0.44, 0.28]);
      hedge(0.32, 0.42,  1, 10, 1.8, [0.32, 0.44, 0.28]);
      hedge(0.54, 0.62, -1, 9, 1.7, [0.32, 0.44, 0.28]);
      // Boulevard plane trees in urban zones
      for (let i = 0; i < n; i += 5) {
        const f = i / n;
        const inStreet = (f < 0.20) || (f > 0.28 && f < 0.55) || (f > 0.85);
        if (!inStreet) continue;
        for (const side of [-1, 1]) {
          if (hash(i * 13 + side) > 0.52) continue;
          const d = 13 + hash(i * 7 + side) * 7;
          if (onTrack(px[i], pz[i], 16)) continue;
          tree(i, side, d, 6.5 + hash(i * 5) * 3.5, [0.28, 0.42, 0.24]);
        }
      }

      // ── (11) DRY CASTILIAN PLAINS filler: straw-tan scrub + olive. ──
      for (let i = 0; i < n; i += 4) {
        for (const side of [-1, 1]) {
          if (hash(i * 31 + side) > 0.58) continue;
          const d = 72 + hash(i * 17 + side) * 95;
          const k = ((i % n) + n) % n;
          const A = anchor(k, side, d);
          if (onTrack(A.c[0], A.c[2], 20)) continue;
          const r = hash(i * 41 + side);
          if (r < 0.50) bush(k, side, d, OLIVE);
          else if (r < 0.78) tree(k, side, d, 5 + hash(i * 53) * 4, OLIVE);
        }
      }

      // ── (12) AIRPORT RUNWAY EDGE LIGHTS: s≈0.0–0.10, amber taxi-light dots.
      //     Slim posts anchored to ground (vadd on A.u so they sit on terrain). ──
      for (let i = 0; i < 8; i++) {
        const f = i * 0.012;
        const k = Math.round(f * n) % n;
        const A = anchor(k, 1, 75);
        if (!onTrack(A.c[0], A.c[2], 4)) {
          addCyl(out, A.c, 0.08, 1.0, LAMPGREY, 4, [A.r, A.u, A.t]); // post
          addBox(out, vadd(A.c, A.u, 1.1), [0.45, 0.55, 0.45], AMBER, [A.r, A.u, A.t]); // amber light
        }
      }

      // ── (13) NEAR-VENUE URBAN CONTEXT: a mid-rise ring at rad+280 (within
      //     sight from the pit straight) — conference buildings + hotels that
      //     immediately surround the IFEMA campus. Kept modest in height (20–45 m)
      //     so they don't compete visually with the grandstands. ──
      {
        const ring = rad + 280, count = 28;
        for (let i = 0; i < count; i++) {
          const a = i / count * 6.2832 + (hash(i * 7) - 0.5) * 0.08;
          const jr = (hash(i * 19) - 0.5) * 80;
          const wx = cx + Math.cos(a) * (ring + jr), wz = cz + Math.sin(a) * (ring + jr);
          if (onTrack(wx, wz, 22)) continue;
          const h = 18 + hash(i * 11) * 28;
          const w = 18 + hash(i * 17) * 16;
          const yb = pyMin;
          addBox(out, [wx, yb + h / 2, wz], [w, h, w], skyPal[(i + 2) % skyPal.length]);
          // window banding on near-venue buildings — LITWIN for readable lit windows
          const bands = Math.max(2, Math.floor(h / 8));
          for (let b = 1; b < bands; b++) {
            const yy = yb + (b / bands) * h;
            addBox(out, [wx, yy, wz], [w * 1.01, 0.9, w * 1.01], LITWIN);
          }
        }
      }

      // ── (14) WIDE PLAZA PAVING: flat slabs at s≈0.45–0.54 (open IFEMA plaza).
      //     Placed at ground level (no Y offset — anchor gives terrain height, so
      //     the slab top sits flush with the surrounding terrain rather than floating
      //     or digging below). Kept narrow in radial extent so they can't engulf
      //     the road even if a parallel section passes nearby. ──
      for (let i = 0; i < 5; i++) {
        const f = 0.46 + i * 0.022;
        const k = Math.round(f * n) % n;
        for (const side of [-1, 1]) {
          const dist = 28 + i * 4;
          const A = anchor(k, side, dist);
          if (!onTrack(A.c[0], A.c[2], 12))
            addBox(out, vadd(A.c, A.u, -0.1), [40, 0.25, 34], STONE, [A.r, A.u, A.t]);
        }
      }

      // ── (15) ADDITIONAL KERB ACCENT: T2 exit tyre-wall (yellow/gold) ──
      tyreWall(0.135, 0.165,-1, 3, [0.95, 0.75, 0.15]);  // T2 exit — yellow/gold
    },
  }
  );
})();
