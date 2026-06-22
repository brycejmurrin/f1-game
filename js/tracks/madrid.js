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
              addBox, addCyl, addCone, addPrism, addPyramid, addFrustum,
              anchor, vadd, cityFront, forestEdge } = api;

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
      for (const [extra, wMin, hMin, count, col, snowL] of [
        [900, 360, 140, 24, [0.56, 0.60, 0.66], 0.82],
        [1200, 440, 200, 20, [0.60, 0.63, 0.68], 0.74],
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

      // ── (2) MADRID CITY SKYLINE ─────────────────────────────────────────────
      // Two rings of buildings represent Madrid's urban density, plus the iconic
      // Cuatro Torres business-district cluster. All buildings use LITWIN window
      // bands so the skyline glows legibly at dusk.
      const skyPal = [
        [0.66, 0.70, 0.76], [0.58, 0.64, 0.72], [0.72, 0.74, 0.76],
        [0.50, 0.58, 0.66], [0.78, 0.78, 0.80], [0.46, 0.54, 0.62],
        [0.68, 0.66, 0.62], [0.60, 0.68, 0.74],
      ];
      // Inner dense ring — mid-rise urban blocks (rad+440)
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
          // lit window banding — LITWIN so windows glow at night/dusk
          const bands = Math.max(2, Math.floor(h / 12));
          for (let b = 1; b < bands; b++) {
            const yy = yb + (b / bands) * h;
            addBox(out, [wx, yy, wz], [w * 1.01, 1.2, w * 1.01], LITWIN);
          }
        }
      }
      // Outer ring — tall landmark towers (rad+620)
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
          const bands = Math.max(3, Math.floor(h / 14));
          for (let b = 1; b < bands; b++) {
            const yy = yb + (b / bands) * h;
            addBox(out, [wx, yy, wz], [w * 1.01, 1.4, w * 1.01], LITWIN);
          }
          if (hash(i * 19) > 0.45)
            addBox(out, [wx, yb + h + 4, wz], [3, 8, 3], [0.85, 0.30, 0.25]);
        }
      }
      // Cuatro Torres — four iconic supertall glass towers on one bearing.
      // These are the most recognisable element of the Madrid skyline.
      {
        const a = 0.9, ring = rad + 760;
        const bx = cx + Math.cos(a) * ring, bz = cz + Math.sin(a) * ring;
        const perpx = -Math.sin(a), perpz = Math.cos(a);
        // Heights roughly matching real proportions: Torre PwC 236m, Torre de Cristal 249m,
        // Torre Espacio 224m, Torre Cepsa 248m
        const hts = [240, 268, 252, 224];
        for (let i = 0; i < 4; i++) {
          const off = (i - 1.5) * 72;
          const wx = bx + perpx * off, wz = bz + perpz * off;
          const h = hts[i], w = i % 2 ? 26 : 29;
          const yb = pyMin;
          // main shaft — alternating glass and concrete finishes
          addBox(out, [wx, yb + h / 2, wz], [w, h, w],
                 i % 2 ? [0.62, 0.70, 0.78] : [0.72, 0.74, 0.78]);
          // glazed curtain-wall face (south-facing)
          addBox(out, [wx, yb + h * 0.55, wz], [w * 1.01, h * 0.78, w * 0.12], LGLASS);
          // lit window floor-plate banding — warm for even i, cool for odd
          const bands = Math.max(4, Math.floor(h / 18));
          const winCol = i % 2 ? [0.60, 0.75, 1.0] : [0.95, 0.85, 0.55];
          for (let b = 1; b < bands; b++) {
            const yy = yb + (b / bands) * h;
            addBox(out, [wx, yy, wz], [w * 1.02, 1.6, w * 1.02], winCol);
          }
          // crown
          addBox(out, [wx, yb + h + 5, wz], [4, 10, 4], [0.85, 0.30, 0.25]);
          addCyl(out, [wx, yb + h + 15, wz], 0.28, 22, LAMPGREY, 5);
        }
      }

      // ── (3) LA MONUMENTAL: the HERO banked stadium bowl (s≈0.75). ───────────
      // Tall tiered grandstands wrapping ~270° on both sides, white shells,
      // plus a ring of modern floodlight towers (every 3 steps to avoid clipping).
      const kmono = Math.round(n * 0.75) % n;
      const step = Math.max(1, Math.round(n / 54));
      for (let i = -13; i <= 13; i++) {
        const k = ((kmono + i * step) % n + n) % n;
        grandstand(k / n, 1, 7, 30, [0.88, 0.89, 0.92], [0.50, 0.30, 0.30]);
        grandstand(k / n, -1, 9, 30, [0.88, 0.89, 0.92], [0.52, 0.32, 0.32]);
      }
      // Floodlight towers (every 3 steps = ~18 m spacing to avoid crowding)
      for (let i = -12; i <= 12; i += 3) {
        const k = ((kmono + i * step) % n + n) % n;
        for (const side of [1, -1]) {
          const A = anchor(k, side, hw[k] + 50);
          const base = A.c;
          if (onTrack(base[0], base[2], 3)) continue;
          const poleTop = vadd(base, A.u, 46);
          addCyl(out, vadd(base, A.u, 23), 0.85, 46, LAMPGREY, 6, [A.r, A.u, A.t]);
          addBox(out, vadd(poleTop, A.u, 1.5), [10, 2.2, 2.4], [0.28, 0.30, 0.34], [A.r, A.u, A.t]);
          for (let g = -1; g <= 1; g++)
            addBox(out, vadd(vadd(poleTop, A.u, 1.8), A.r, g * 3.0),
                   [1.9, 1.3, 1.5], AMBER, [A.r, A.u, A.t]);
          addBox(out, vadd(base, A.u, 0.05), [14, 0.12, 14], [0.88, 0.82, 0.68], [A.r, A.u, A.t]);
        }
      }

      // ── (4) IFEMA EXHIBITION HALLS: s≈0.85–0.15 ─────────────────────────────
      // The Feria de Madrid / IFEMA campus sits around the pit-straight and
      // paddock. Large horizontal white halls with glass-ribbon facades — the
      // defining architectural feature of this circuit. We use cityFront() for
      // a coherent continuous facade on both sides of the paddock zone, then
      // place individual landmark exhibition halls as building() anchors.
      //
      // IFEMA palette: bright white halls, blue glass, warm lit windows at dusk.
      const ifemaPal = [WHITE, [0.88, 0.90, 0.92], [0.85, 0.87, 0.90], OFFWHITE];
      const ifemaWin  = [0.70, 0.82, 0.94];   // cool blue glass ribbon (day)
      const ifemaLit  = [0.75, 0.88, 1.00];   // bright lit-glass (dusk/night)

      // Continuous IFEMA facade on the outside of the pit straight (right side)
      // gap=55 keeps it well clear of the street barriers (barrierOffset≈0.35)
      cityFront(0.87, 0.14, 1, 55, {
        minH: 18, maxH: 32, depth: 48,
        palette: ifemaPal,
        lit: true, windowCol: ifemaLit,
        floor: 5, step: 30,
      });
      // Continuous facade on the left side of the paddock (service/hotel zone)
      cityFront(0.90, 0.12, -1, 52, {
        minH: 16, maxH: 28, depth: 36,
        palette: ifemaPal,
        lit: true, windowCol: ifemaWin,
        floor: 5, step: 26,
      });

      // Landmark IFEMA signature halls — two extra-wide low halls that read as
      // the big exhibition pavilions. Gaps are generous to avoid barrier clipping.
      for (const [frac, side, w, h, d, gap] of [
        [0.93, 1,  90, 18, 120, 64],   // Hall 6 / main congress centre
        [0.97, 1,  80, 16, 105, 60],   // Hall 8 / north pavilion
        [0.03, 1,  85, 20, 115, 62],   // Hall 10 / south-east pavilion
        [0.07, 1,  75, 17,  96, 58],   // Hall 12 / terminal pavilion
        [0.94, -1, 70, 15,  88, 56],   // Hotel/hospitality on left side
        [0.98, -1, 75, 16,  92, 54],   // Conference annex
        [0.04, -1, 68, 18,  85, 52],   // Service building
      ]) {
        const k = Math.round(frac * n) % n;
        building(k, side, gap, w, h, d, {
          wall: WHITE, window: ifemaLit, lit: true,
          windowCol: ifemaLit, floor: 5,
        });
      }

      // IFEMA grandstands: permanent seated stands around the IFEMA oval (s≈0.87–0.94)
      for (const [frac, side, gap, len] of [
        [0.87, 1, 12, 44], [0.90, 1, 10, 38], [0.93, 1, 11, 40],
        [0.88, -1, 12, 36], [0.91, -1, 10, 34],
      ]) {
        grandstand(frac, side, gap, len, WHITE, [0.50, 0.30, 0.30]);
      }
      // Glass canopy over IFEMA grandstands — steel-and-glass prism roofs
      for (const [frac, side] of [[0.88, 1], [0.91, 1], [0.89, -1]]) {
        const k = Math.round(frac * n) % n;
        const A = anchor(k, side, hw[k] + 36);
        if (!onTrack(A.c[0], A.c[2], 20))
          addPrism(out, vadd(A.c, A.u, 16), [42, 3.5, 32], [0.52, 0.64, 0.74], [A.r, A.u, A.t]);
      }

      // ── (5) PIT / PADDOCK COMPLEX (s≈0.97–0.08) ────────────────────────────
      // Main grandstands flanking the start / finish line
      grandstand(0.0,   1,  11, 52, WHITE, [0.48, 0.30, 0.30]);
      grandstand(0.0,  -1,  11, 46, WHITE, [0.48, 0.30, 0.30]);
      grandstand(0.97,  1,  11, 44, WHITE, [0.48, 0.30, 0.30]);

      // Pit-garage building — long modular structure right of main straight.
      // gap=hw[k]+17 keeps it clear of the street armco. Modules butt together.
      for (let s = 0.986; s < 1.083; s += 0.011) {
        const f = s % 1;
        const k = Math.round(f * n) % n;
        const A = anchor(k, 1, hw[k] + 17);
        if (onTrack(A.c[0], A.c[2], 9)) continue;
        addBox(out, vadd(A.c, A.u, 5.0), [16, 10.0, 25], WHITE,    [A.r, A.u, A.t]);
        addBox(out, vadd(A.c, A.u, 10.2), [16.5, 0.8, 25], STEEL,  [A.r, A.u, A.t]);
        // glass-fronted team garage doors — lit interior tint
        addBox(out, vadd(vadd(A.c, A.u, 5.4), A.r, -8.2),
               [0.5, 5.8, 23], GLASS, [A.r, A.u, A.t]);
        // lit upper-floor window strip on garage building
        addBox(out, vadd(A.c, A.u, 9.0), [16.2, 1.2, 25.2], ifemaLit, [A.r, A.u, A.t]);
      }
      // Paddock motorhomes / hospitality behind the pits (right side, further back)
      for (let s = 0.992; s < 1.058; s += 0.018) {
        const f = s % 1, k = Math.round(f * n) % n;
        const A = anchor(k, 1, hw[k] + 42);
        if (onTrack(A.c[0], A.c[2], 8)) continue;
        const h = 7.5 + hash(k * 3) * 4.0;
        addBox(out, vadd(A.c, A.u, h / 2), [14, h, 18],
               hash(k) > 0.5 ? WHITE : OFFWHITE, [A.r, A.u, A.t]);
        addBox(out, vadd(A.c, A.u, h * 0.56), [14.2, 2.0, 18.2], DKGLASS, [A.r, A.u, A.t]);
        // lit top-floor strip — warm amber glow (team hospitality branding)
        addBox(out, vadd(A.c, A.u, h * 0.88), [14.4, 1.0, 18.4], LITWIN, [A.r, A.u, A.t]);
      }

      // ── (6) START/SCORING GANTRY + pit-exit timing gantry ───────────────────
      gantry(0.0, 8.5, [0.20, 0.22, 0.26]);
      gantry(0.05, 7.5, [0.22, 0.24, 0.28]);

      // ── (7) LAMP POSTS — street sectors + pit straight ───────────────────────
      // Main straight lamp posts (s≈0.97–0.10, both sides, every ~25 m)
      for (let s = 0.970; s < 1.105; s += 0.028) {
        const f = s % 1;
        const k = Math.round(f * n) % n;
        for (const side of [1, -1]) {
          const A = anchor(k, side, hw[k] + 5.5);
          if (onTrack(A.c[0], A.c[2], 2.5)) continue;
          addCyl(out, vadd(A.c, A.u, 5.5), 0.12, 11, LAMPGREY, 5, [A.r, A.u, A.t]);
          addBox(out, vadd(A.c, A.u, 11.4), [3.0, 0.5, 0.5], LAMPGREY, [A.r, A.u, A.t]);
          addBox(out, vadd(vadd(A.c, A.u, 11.2), A.r, side * 1.3),
                 [0.9, 0.6, 0.9], AMBER, [A.r, A.u, A.t]);
          addBox(out, vadd(A.c, A.u, 0.05), [5, 0.1, 5], [0.86, 0.80, 0.64], [A.r, A.u, A.t]);
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

      // ── (8) URBAN STREET CONTEXT (s≈0.10–0.75) ──────────────────────────────
      // The urban sectors pass through Madrid's street network. cityFront() gives
      // a coherent aligned street-wall on both sides. Uses generous gap values
      // (≥28 m from road edge) to stay well clear of barriers and fences.
      //
      // Sector A: turning complex after T1–T3 (s≈0.10–0.28) — tighter streets,
      // mixed residential/commercial facades.
      cityFront(0.10, 0.28,  1, 32, {
        minH: 12, maxH: 28, depth: 20,
        palette: [[0.75, 0.73, 0.69], [0.82, 0.80, 0.76], [0.70, 0.72, 0.68], [0.78, 0.76, 0.72]],
        lit: false, step: 20,
      });
      cityFront(0.10, 0.28, -1, 30, {
        minH: 10, maxH: 22, depth: 18,
        palette: [[0.73, 0.71, 0.67], [0.80, 0.78, 0.74], [0.68, 0.70, 0.66], [0.76, 0.74, 0.70]],
        lit: false, step: 18,
      });
      // Sector B: long urban straight + chicanes (s≈0.30–0.48) — Madrid boulevard
      // style: taller buildings, regular spacing, stone-clad lower floors.
      cityFront(0.30, 0.48,  1, 34, {
        minH: 16, maxH: 34, depth: 22,
        palette: [STONE, [0.76, 0.74, 0.70], [0.82, 0.80, 0.76], [0.68, 0.66, 0.62]],
        lit: false, step: 22,
      });
      cityFront(0.30, 0.48, -1, 32, {
        minH: 14, maxH: 30, depth: 20,
        palette: [[0.74, 0.72, 0.68], OFFWHITE, [0.80, 0.78, 0.74], [0.70, 0.68, 0.64]],
        lit: false, step: 20,
      });
      // Sector C: approach to La Monumental bowl (s≈0.55–0.72) — open plaza,
      // taller blocks receding to reveal the stadium.
      cityFront(0.55, 0.70,  1, 38, {
        minH: 18, maxH: 40, depth: 24,
        palette: [[0.66, 0.68, 0.72], [0.72, 0.70, 0.66], [0.64, 0.66, 0.70], [0.78, 0.76, 0.72]],
        lit: false, step: 24,
      });
      cityFront(0.55, 0.70, -1, 36, {
        minH: 16, maxH: 36, depth: 22,
        palette: [[0.70, 0.68, 0.64], [0.62, 0.64, 0.68], [0.76, 0.74, 0.70], [0.60, 0.62, 0.66]],
        lit: false, step: 22,
      });

      // ── (9) TRACKSIDE BARRIERS & FURNITURE ─────────────────────────────────
      // Street-sector concrete walls (urban straights, both sides)
      wall(0.005, 0.087,  1, 1.4, 1.15, CONCRETE, 0.48);
      wall(0.005, 0.087, -1, 1.4, 1.15, CONCRETE, 0.48);
      wall(0.30,  0.40,   1, 1.5, 1.35, CONCRETE, 0.5);
      wall(0.30,  0.40,  -1, 1.5, 1.35, CONCRETE, 0.5);
      wall(0.47,  0.54,   1, 1.5, 1.4, [0.70, 0.70, 0.72], 0.58);  // El Búnker retaining wall
      // Catch fences on street sectors
      fence(0.005, 0.087,  1, 3.0, 2.9, [0.62, 0.64, 0.66]);
      fence(0.30,  0.40,  -1, 3.0, 2.9, [0.62, 0.64, 0.66]);
      fence(0.47,  0.54,   1, 3.0, 2.9, [0.62, 0.64, 0.66]);
      // Permanent-loop guardrails (wider northern run-off sections)
      guardrail(0.54, 0.73,  1, 4.8, [0.80, 0.80, 0.82]);
      guardrail(0.54, 0.73, -1, 4.8, [0.80, 0.80, 0.82]);
      guardrail(0.86, 0.97, -1, 4.8, [0.80, 0.80, 0.82]);
      // Tyre walls: chicane & corner entries/exits
      tyreWall(0.075, 0.10,   1, 3, [0.90, 0.30, 0.20]);   // T1 entry — red
      tyreWall(0.133, 0.162, -1, 3, [0.20, 0.40, 0.85]);   // T2 exit — blue
      tyreWall(0.50,  0.53,   1, 3, [0.95, 0.80, 0.15]);   // street chicane — yellow
      tyreWall(0.70,  0.75,   1, 4, [0.90, 0.30, 0.20]);   // Monumental entry — red
      tyreWall(0.135, 0.165, -1, 3, [0.95, 0.75, 0.15]);   // T2 exit — yellow/gold

      // ── (10) BILLBOARDS & MARSHAL POSTS ────────────────────────────────────
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
      billboard(Math.round(0.01 * n) % n,  1, 14, 12, 5, [0.85, 0.15, 0.12]);  // red
      billboard(Math.round(0.04 * n) % n, -1, 12, 12, 5, [0.92, 0.72, 0.08]); // gold
      for (const [frac, side] of [
        [0.04, -1], [0.10, 1], [0.18, -1], [0.25, 1], [0.32, -1], [0.40, 1],
        [0.47, -1], [0.56, 1], [0.63, -1], [0.72, 1], [0.80, -1], [0.88, 1], [0.95, -1],
      ]) {
        const k = Math.round(frac * n) % n;
        marshalPost(k, side, 4);
      }

      // ── (11) URBAN GREENERY: clipped hedges, boulevard trees, forestEdge ──
      // Hedges: close to track in street sectors (within barrier zone)
      hedge(0.09, 0.20, -1, 8,  1.6, [0.30, 0.42, 0.26]);
      hedge(0.22, 0.32,  1, 9,  1.6, [0.30, 0.42, 0.26]);
      hedge(0.85, 0.96,  1, 10, 1.6, [0.30, 0.42, 0.26]);
      hedge(0.10, 0.25, -1, 8,  1.8, [0.32, 0.44, 0.28]);
      hedge(0.32, 0.42,  1, 10, 1.8, [0.32, 0.44, 0.28]);
      hedge(0.54, 0.62, -1, 9,  1.7, [0.32, 0.44, 0.28]);

      // forestEdge() in the open sections between urban zones and the stadium.
      // gap values large enough to clear all barriers + city-front buildings.
      forestEdge(0.48, 0.55, -1, 18, {
        density: 0.5, hMin: 6, hMax: 11,
        col: [0.30, 0.42, 0.24], col2: [0.36, 0.46, 0.28], pineFrac: 0.3,
      });
      forestEdge(0.72, 0.82,  1, 22, {
        density: 0.45, hMin: 7, hMax: 13,
        col: [0.28, 0.40, 0.22], col2: [0.34, 0.44, 0.26], pineFrac: 0.35,
      });
      forestEdge(0.72, 0.82, -1, 20, {
        density: 0.4, hMin: 6, hMax: 12,
        col: [0.30, 0.42, 0.24], col2: [0.32, 0.44, 0.26], pineFrac: 0.3,
      });

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

      // ── (12) DRY CASTILIAN PLAINS filler: straw-tan scrub + olive ───────────
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

      // ── (13) NEAR-VENUE URBAN CONTEXT: mid-rise ring at rad+280 ─────────────
      // Conference buildings + hotels immediately surrounding the IFEMA campus.
      // Kept modest in height (20–45 m) so they don't compete with grandstands.
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
          const bands = Math.max(2, Math.floor(h / 8));
          for (let b = 1; b < bands; b++) {
            const yy = yb + (b / bands) * h;
            addBox(out, [wx, yy, wz], [w * 1.01, 0.9, w * 1.01], LITWIN);
          }
        }
      }

      // ── (14) AIRPORT RUNWAY EDGE LIGHTS: s≈0.0–0.10 ────────────────────────
      // Slim amber taxi-light posts along the approach to the pit straight.
      for (let i = 0; i < 8; i++) {
        const f = i * 0.012;
        const k = Math.round(f * n) % n;
        const A = anchor(k, 1, 75);
        if (!onTrack(A.c[0], A.c[2], 4)) {
          addCyl(out, A.c, 0.08, 1.0, LAMPGREY, 4, [A.r, A.u, A.t]);
          addBox(out, vadd(A.c, A.u, 1.1), [0.45, 0.55, 0.45], AMBER, [A.r, A.u, A.t]);
        }
      }

      // ── (15) WIDE PLAZA PAVING: flat slabs at s≈0.45–0.54 ──────────────────
      // Open IFEMA plaza. Narrow in radial extent so they can't engulf the road.
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
    },
  }
  );
})();
