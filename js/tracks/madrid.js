/* Apex 26 — MADRID circuit definition (data only).
   Registered on the global TrackDefs list; consumed by the js/tracks.js engine
   (palette resolved there from `night`, geometry from js/circuits.js or `segs`). */
(function () {
  "use strict";
  (window.TrackDefs = window.TrackDefs || []).push(
  {
    id: "madrid",
    reverse: false, // direction switched to real-world CW/CCW (was auto-audit reverse:true)
    // TODO: startFrac not GPS-calibrated (defaults to 0)
    name: "MADRID",
    gp: "Spanish GP",
    country: "Spain",
    night: false,
    theme: "modern",
    lengthKm: 5.5,
    baseHW: 7,
    // La Monumental: the signature ~24° banked stadium curve. Authored as an
    // explicit fraction window (matches the seg b:0.42 rad ≈ 24°) so the bank
    // lands on the stadium bowl (banked:true auto-pick kept as a fallback).
    banked: true,
    bankZones: [
      { frac: 0.75, angleDeg: 24, widthM: 60 },   // La Monumental banked stadium curve
    ],
    street: true,
    pal: { zenith: [0.22, 0.48, 0.82], horizon: [0.74, 0.74, 0.72], grass: [0.3, 0.42, 0.2], sunDir: [0.12094709553657013, 0.967576764292561, 0.22173634181704524], sun: [1.0, 0.90, 0.65], sunColor: [1, 0.98, 0.94] },
    segs: [
      { t: 0, l: 320 }, { t: 70, l: 70 }, { t: -65, l: 70 }, { t: 50, l: 120 }, { t: 0, l: 360 }, { t: 90, l: 80 },
      { t: -85, l: 70 }, { t: 90, l: 80 }, { t: 0, l: 140 }, { t: 180, l: 240, b: 0.42, w: 9 }, { t: 0, l: 80 }, { t: -60, l: 90, h: 6 },
      { t: 70, l: 90, h: -4 }, { t: -50, l: 80 }, { t: 80, l: 90 }, { t: 60, l: 130 },
    ],
    // Gentle relief only: IFEMA is a near-flat urban plot, so the crest toward
    // Turn 7 is a subtle undulation (~3% grade), not the blind ramp a taller bump
    // reads as on the low chase-cam. Still climbs then drops back to the pits.
    elevations: [{ s: 0.60, halfM: 340, rise: 7 }, { s: 0.85, halfM: 240, rise: -4 }],
    scenery: function (api) {
      const { out, MAT, n, px, py, pz, hw, pyMin, place, prop, hash, onTrack,
              mountain, grandstand, building, motorhome, tower, tree, bush, hedge,
              billboard, gantry, marshalPost, wall, fence, guardrail, tyreWall,
              addBox, addCyl, addCone, addPrism, addPyramid, addFrustum,
              anchor, vadd, cityFront, backdrop, groundPlane,
              floodMast, underpassPortal } = api;

      // ── PALETTE ──────────────────────────────────────────────────────────────
      // Madrid: bright dry Mediterranean day. Warm whites, pale stone, blue sky,
      // olive-tinted greenery. Sunlit glass reads as bright ice-blue.
      const WHITE    = [0.92, 0.93, 0.94];   // clean modern concrete / grandstand shell
      const OFFWHITE = [0.88, 0.87, 0.84];   // slightly warm: pit wall, parade fence
      const GLASS    = [0.66, 0.78, 0.88];   // sunlit glass curtain wall (ice-blue in sun)
      const LGLASS   = [0.75, 0.85, 0.92];   // brightest highlight glass — reflective facade
      const CONCRETE = [0.74, 0.75, 0.77];   // bare concrete wall / retaining wall
      const OLIVE    = [0.42, 0.48, 0.30];   // dry Castilian scrub (olive-green)
      const STRAW    = [0.78, 0.70, 0.48];   // sun-bleached straw-tan dry plain
      const STRAW2   = [0.72, 0.64, 0.44];   // deeper straw / turned earth
      const STEEL    = [0.55, 0.58, 0.62];   // galvanised steel / roof beam
      const DKGLASS  = [0.34, 0.44, 0.58];   // deep blue tinted glass — dark faces of towers
      const LITWIN   = [0.80, 0.88, 0.98];   // emissive lit-window tint (near-white blue)
      const STONE    = [0.78, 0.76, 0.70];   // Madrid limestone / sandstone
      const AMBER    = [1.00, 0.78, 0.28];   // lamp post head / runway light
      const LAMPGREY = [0.36, 0.38, 0.42];   // lamp post shaft

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
      // Cuatro Torres business-district cluster.
      //
      // Inner ring: mid-rise blocks rendered as tapered frustum masses + a
      // glass-band layer so they read as real buildings not flat slabs.
      {
        const ring = rad + 440, count = 36;
        for (let i = 0; i < count; i++) {
          const a = i / count * 6.2832 + (hash(i * 3) - 0.5) * 0.04;
          const jr = (hash(i * 9) - 0.5) * 110;
          const wx = cx + Math.cos(a) * (ring + jr), wz = cz + Math.sin(a) * (ring + jr);
          if (onTrack(wx, wz, 28)) continue;
          const h = 26 + hash(i * 7) * 52;
          const w = 18 + hash(i * 13) * 16;
          const yb = pyMin;
          // Stepped massing: wide base + narrower upper section (less boxy)
          const h1 = h * 0.65, h2 = h - h1;
          const col = [0.62 + hash(i * 3) * 0.12, 0.64 + hash(i * 5) * 0.10, 0.68 + hash(i * 7) * 0.08];
          addFrustum(out, [wx, yb, wz], w * 0.55, w * 0.42, h1, col, 6);
          // upper setback block
          if (h2 > 4) {
            const col2 = [col[0] + 0.04, col[1] + 0.03, col[2] + 0.05];
            addFrustum(out, [wx, yb + h1, wz], w * 0.38, w * 0.28, h2, col2, 6);
          }
          // single glass-ribbon face band (much cheaper than per-floor banding)
          addBox(out, [wx, yb + h * 0.52, wz], [w * 0.62, h * 0.22, w * 0.08], LGLASS);
        }
      }
      // Outer ring: landmark towers with tapered glass profiles
      {
        const ring = rad + 600, count = 20;
        for (let i = 0; i < count; i++) {
          const a = i / count * 6.2832 + (hash(i * 17) - 0.5) * 0.06;
          const jr = (hash(i * 23) - 0.5) * 140;
          const wx = cx + Math.cos(a) * (ring + jr), wz = cz + Math.sin(a) * (ring + jr);
          if (onTrack(wx, wz, 28)) continue;
          const h = 90 + hash(i * 5) * 130;
          const w = 24 + hash(i * 11) * 16;
          const yb = pyMin;
          // Core frustum shaft — slight taper gives modern office-block silhouette
          const col = [0.54 + hash(i * 9) * 0.14, 0.58 + hash(i * 11) * 0.10, 0.64 + hash(i * 13) * 0.10];
          addFrustum(out, [wx, yb, wz], w * 0.55, w * 0.36, h * 0.82, col, 6);
          // Tapered glass crown (top 18% of height)
          addFrustum(out, [wx, yb + h * 0.82, wz], w * 0.36, w * 0.12, h * 0.18, LGLASS, 6);
          // Red beacon on very tall towers
          if (hash(i * 19) > 0.50)
            addCyl(out, [wx, yb + h + 2, wz], 0.22, 6, [0.85, 0.30, 0.25], 4);
        }
      }

      // Cuatro Torres — four iconic supertall glass towers on one bearing.
      // Torre PwC 236m, Torre de Cristal 249m, Torre Espacio 224m, Torre Cepsa 248m.
      // Rendered as frustum shafts + glass facets for a non-boxy silhouette.
      {
        const a = 0.9, ring = rad + 760;
        const bx = cx + Math.cos(a) * ring, bz = cz + Math.sin(a) * ring;
        const perpx = -Math.sin(a), perpz = Math.cos(a);
        const hts  = [240, 268, 252, 224];
        const cols = [
          [0.62, 0.70, 0.78],   // Torre PwC — steel/glass
          [0.74, 0.80, 0.88],   // Torre de Cristal — all-glass (bright)
          [0.68, 0.62, 0.58],   // Torre Espacio — warm granite cladding
          [0.58, 0.64, 0.72],   // Torre Cepsa — dark glass
        ];
        for (let i = 0; i < 4; i++) {
          const off = (i - 1.5) * 72;
          const wx = bx + perpx * off, wz = bz + perpz * off;
          const h = hts[i], w = i % 2 ? 24 : 28;
          const yb = pyMin;
          // Main shaft as tapered frustum — wider at base, slim at crown
          addFrustum(out, [wx, yb, wz], w * 0.56, w * 0.28, h * 0.88, cols[i], 8);
          // Glass crown (top 12%)
          addFrustum(out, [wx, yb + h * 0.88, wz], w * 0.28, w * 0.06, h * 0.12, LGLASS, 8);
          // Curtain-wall glass band on the main facade — single ribbon, not per-floor
          addBox(out, [wx, yb + h * 0.45, wz], [w * 0.58, h * 0.55, w * 0.10], GLASS);
          // Crown spire/antenna
          addCyl(out, [wx, yb + h + 1, wz], 0.22, 18, LAMPGREY, 4);
        }
      }

      // ── (3) LA MONUMENTAL: HERO continuous white stadium bowl (s≈0.68–0.84). ─
      // Nested white grandstand tiers wrap the banked curve so it reads as a
      // modern bullring envelope (official MADRING stadium, not Old City brick).
      // Long shells (Mexico Foro Sol pattern) keep the continuous silhouette
      // without stepping a short stand at every node. Flood masts ring the rim;
      // the Las Ventas brick arcade stays thin and set well behind.
      const kmono = Math.round(n * 0.75) % n;
      const step = Math.max(1, Math.round(n / 54));
      const BOWL_W = [0.90, 0.91, 0.93];
      const BOWL_CROWD = [0.48, 0.28, 0.28];
      // Continuous envelope: staggered long shells along the ~270° bank.
      for (const s of [0.70, 0.73, 0.76, 0.79, 0.82]) {
        for (const side of [1, -1]) {
          grandstand(s, side, 8,  72, BOWL_W, BOWL_CROWD);           // inner
          grandstand(s, side, 24, 72, [0.88, 0.89, 0.91], BOWL_CROWD); // mid
          grandstand(s, side, 42, 68, WHITE, BOWL_CROWD);              // rim
        }
      }
      // End-caps close the horseshoe at entry / exit.
      for (const s of [0.685, 0.835]) {
        for (const side of [1, -1]) {
          grandstand(s, side, 14, 48, BOWL_W, BOWL_CROWD);
          grandstand(s, side, 36, 48, WHITE, BOWL_CROWD);
        }
      }
      // Floodlight ring on the outer rim (cool-white dual-arm masts).
      for (let i = -12; i <= 12; i += 3) {
        const k = ((kmono + i * step) % n + n) % n;
        floodMast(k,  1, 56, { h: 42, cool: true, pool: true });
        floodMast(k, -1, 58, { h: 42, cool: true, pool: true });
      }
      // Soft white backdrop masses behind the rim (parapet / concourse).
      for (let i = -5; i <= 5; i += 2) {
        const k = ((kmono + i * step) % n + n) % n;
        for (const side of [1, -1]) {
          backdrop(k, side, 72, [40, 36, 10], [0.90, 0.91, 0.93]);
        }
      }

      // ── (4) IFEMA EXHIBITION HALLS: s≈0.85–0.15 ─────────────────────────────
      // The Feria de Madrid / IFEMA campus sits around the pit-straight and
      // paddock. Large horizontal white halls with glass-ribbon facades — the
      // defining architectural feature of this circuit. cityFront() gives a
      // coherent continuous facade on both sides of the paddock zone.
      const ifemaPal = [WHITE, [0.88, 0.90, 0.92], [0.85, 0.87, 0.90], OFFWHITE];
      const ifemaWin  = [0.70, 0.82, 0.94];   // cool blue glass ribbon (day)
      const ifemaLit  = [0.75, 0.88, 1.00];   // bright lit-glass (dusk/night)

      // Continuous IFEMA facade on the outside of the pit straight (right side)
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

      // Landmark IFEMA signature halls — wide low exhibition pavilions.
      // building() gives proper massing: plinth, stepped sections, window grid.
      for (const [frac, side, w, h, d, gap] of [
        [0.93, 1,  80, 18, 110, 64],   // Hall 6 / main congress centre
        [0.97, 1,  72, 16,  98, 60],   // Hall 8 / north pavilion
        [0.03, 1,  78, 20, 108, 62],   // Hall 10 / south-east pavilion
        [0.07, 1,  68, 17,  90, 58],   // Hall 12 / terminal pavilion
        [0.94, -1, 64, 15,  82, 56],   // Hotel/hospitality on left side
        [0.98, -1, 68, 16,  86, 54],   // Conference annex
        [0.04, -1, 62, 18,  80, 52],   // Service building
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
        const A = anchor(k, side, 36);
        if (!onTrack(A.c[0], A.c[2], 20))
          addPrism(out, vadd(A.c, A.u, 16), [42, 3.5, 32], [0.52, 0.64, 0.74], [A.r, A.u, A.t]);
      }

      // ── (5) PIT / PADDOCK COMPLEX (s≈0.97–0.08) ────────────────────────────
      // Main grandstands flanking the start / finish line
      grandstand(0.0,   1,  11, 52, WHITE, [0.48, 0.30, 0.30]);
      grandstand(0.0,  -1,  11, 46, WHITE, [0.48, 0.30, 0.30]);
      grandstand(0.97,  1,  11, 44, WHITE, [0.48, 0.30, 0.30]);

      // Pit-garage building — long modular structure right of main straight.
      for (let s = 0.986; s < 1.083; s += 0.011) {
        const f = s % 1;
        const k = Math.round(f * n) % n;
        const A = anchor(k, 1, 17);
        if (onTrack(A.c[0], A.c[2], 9)) continue;
        addBox(out, vadd(A.c, A.u, 5.0), [16, 10.0, 25], WHITE,    [A.r, A.u, A.t]);
        addBox(out, vadd(A.c, A.u, 10.2), [16.5, 0.8, 25], STEEL,  [A.r, A.u, A.t]);
        // glass-fronted team garage doors
        addBox(out, vadd(vadd(A.c, A.u, 5.4), A.r, -8.2),
               [0.5, 5.8, 23], GLASS, [A.r, A.u, A.t]);
        // lit upper-floor window strip
        addBox(out, vadd(A.c, A.u, 9.0), [16.2, 1.2, 25.2], ifemaLit, [A.r, A.u, A.t]);
      }
      // Paddock motorhomes / hospitality behind the pits — was a raw 3-box
      // stack (body/glass-band/lit-window-band); motorhome() gives the real
      // two-tier team-unit body + awning canopy.
      for (let s = 0.992; s < 1.058; s += 0.018) {
        const f = s % 1, k = Math.round(f * n) % n;
        const h = 7.5 + hash(k * 3) * 4.0;
        motorhome(k, 1, 35, 14, h, 18,
          { wall: hash(k) > 0.5 ? WHITE : OFFWHITE, window: LITWIN, accent: DKGLASS });
      }

      // ── (6) START/SCORING GANTRY + pit-exit timing gantry ───────────────────
      gantry(0.0, 8.5, [0.20, 0.22, 0.26]);
      gantry(0.05, 7.5, [0.22, 0.24, 0.28]);

      // ── (7) LAMP POSTS — street sectors + pit straight ───────────────────────
      for (let s = 0.970; s < 1.105; s += 0.028) {
        const f = s % 1;
        const k = Math.round(f * n) % n;
        for (const side of [1, -1]) {
          const A = anchor(k, side, 5.5);
          if (onTrack(A.c[0], A.c[2], 2.5)) continue;
          addCyl(out, vadd(A.c, A.u, 5.5), 0.12, 11, LAMPGREY, 5, [A.r, A.u, A.t]);
          addBox(out, vadd(A.c, A.u, 11.4), [3.0, 0.5, 0.5], LAMPGREY, [A.r, A.u, A.t]);
          addBox(out, vadd(vadd(A.c, A.u, 11.2), A.r, side * 1.3),
                 [0.9, 0.6, 0.9], AMBER, [A.r, A.u, A.t]);
          addBox(out, vadd(A.c, A.u, 0.05), [5, 0.1, 5], [0.86, 0.80, 0.64], [A.r, A.u, A.t]);
        }
      }
      // Street-sector lamp posts (s≈0.10–0.55, alternating sides)
      for (let s = 0.10; s < 0.55; s += 0.032) {
        const f = s % 1;
        const k = Math.round(f * n) % n;
        const side = (Math.round(s * 10) % 2 === 0) ? 1 : -1;
        const A = anchor(k, side, 5.0);
        if (onTrack(A.c[0], A.c[2], 2.5)) continue;
        addCyl(out, vadd(A.c, A.u, 5.5), 0.12, 11, LAMPGREY, 5, [A.r, A.u, A.t]);
        addBox(out, vadd(A.c, A.u, 11.4), [2.5, 0.5, 0.5], LAMPGREY, [A.r, A.u, A.t]);
        addBox(out, vadd(vadd(A.c, A.u, 11.2), A.r, side * 1.1),
               [0.8, 0.55, 0.8], AMBER, [A.r, A.u, A.t]);
        addBox(out, vadd(A.c, A.u, 0.05), [4, 0.1, 4], [0.86, 0.80, 0.64], [A.r, A.u, A.t]);
      }

      // ── (8) URBAN STREET CONTEXT (s≈0.10–0.68) ──────────────────────────────
      // cityFront() for coherent aligned street-walls on STREET sectors only.
      // Post-Monumental (s≈0.82–0.88) stays open as Valdebebas pelouse — no facade.
      //
      // Sector A: turning complex after T1–T3 (s≈0.10–0.28)
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
      // Sector B: long urban straight + chicanes (s≈0.30–0.48) — boulevard style
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
      // Sector C: approach to La Monumental — stop short so the bowl + pelouse
      // read as open permanent circuit, not continuous canyon.
      cityFront(0.55, 0.66,  1, 38, {
        minH: 18, maxH: 36, depth: 22,
        palette: [[0.66, 0.68, 0.72], [0.72, 0.70, 0.66], [0.64, 0.66, 0.70], [0.78, 0.76, 0.72]],
        lit: false, step: 24,
      });
      cityFront(0.55, 0.66, -1, 36, {
        minH: 16, maxH: 32, depth: 20,
        palette: [[0.70, 0.68, 0.64], [0.62, 0.64, 0.68], [0.76, 0.74, 0.70], [0.60, 0.62, 0.66]],
        lit: false, step: 22,
      });

      // Mid-distance city backdrop slabs — street sectors only (not pelouse).
      for (let i = 0; i < n; i += Math.max(1, Math.round(n / 18))) {
        const f = i / n;
        const inUrban = (f > 0.10 && f < 0.28) || (f > 0.30 && f < 0.48) || (f > 0.55 && f < 0.66);
        if (!inUrban) continue;
        for (const side of [1, -1]) {
          const bh = 40 + hash(i * 7 + side) * 40;
          backdrop(i, side, 72, [30, bh, 12], [0.62 + hash(i * 5) * 0.12, 0.64 + hash(i * 9) * 0.08, 0.68 + hash(i * 11) * 0.08]);
        }
      }

      // ── (9) NEAR-VENUE URBAN CONTEXT: mid-rise ring at rad+280 ─────────────
      // Conference buildings + hotels surrounding the IFEMA campus.
      // Use backdrop() so each mass gets auto window bands — no manual banding.
      {
        const ring = rad + 290, count = 24;
        for (let i = 0; i < count; i++) {
          const a = i / count * 6.2832 + (hash(i * 7) - 0.5) * 0.08;
          const jr = (hash(i * 19) - 0.5) * 70;
          const wx = cx + Math.cos(a) * (ring + jr), wz = cz + Math.sin(a) * (ring + jr);
          if (onTrack(wx, wz, 20)) continue;
          const h = 20 + hash(i * 11) * 26;
          const w = 20 + hash(i * 17) * 14;
          const yb = pyMin;
          const col = [0.66 + hash(i * 3) * 0.10, 0.68 + hash(i * 5) * 0.08, 0.70 + hash(i * 7) * 0.08];
          // Stepped massing: lower plinth + upper tower section
          addFrustum(out, [wx, yb, wz], w * 0.52, w * 0.40, h * 0.6, col, 5);
          if (h * 0.4 > 6) {
            const col2 = [col[0] + 0.05, col[1] + 0.04, col[2] + 0.06];
            addFrustum(out, [wx, yb + h * 0.6, wz], w * 0.36, w * 0.22, h * 0.4, col2, 5);
          }
          // single glass ribbon
          addBox(out, [wx, yb + h * 0.44, wz], [w * 0.50, h * 0.16, w * 0.06], GLASS);
        }
      }

      // ── (10) TRACKSIDE BARRIERS — hybrid street vs permanent rhythm ─────────
      // Street sectors: continuous pale concrete walls. Permanent / Monumental /
      // Valdebebas: open guardrail + runoff (no canyon walls).
      wall(0.005, 0.087,  1, 1.4, 1.15, CONCRETE, 0.48);
      wall(0.005, 0.087, -1, 1.4, 1.15, CONCRETE, 0.48);
      wall(0.10,  0.28,   1, 1.5, 1.25, CONCRETE, 0.48);
      wall(0.10,  0.28,  -1, 1.5, 1.25, CONCRETE, 0.48);
      wall(0.30,  0.48,   1, 1.5, 1.35, CONCRETE, 0.5);
      wall(0.30,  0.48,  -1, 1.5, 1.35, CONCRETE, 0.5);
      fence(0.005, 0.087,  1, 3.0, 2.9, [0.62, 0.64, 0.66]);
      fence(0.30,  0.48,  -1, 3.0, 2.9, [0.62, 0.64, 0.66]);
      // Permanent loop: open armco into Monumental + post-bowl pelouse
      guardrail(0.54, 0.86,  1, 4.8, [0.80, 0.80, 0.82]);
      guardrail(0.54, 0.86, -1, 4.8, [0.80, 0.80, 0.82]);
      guardrail(0.86, 0.97, -1, 4.8, [0.80, 0.80, 0.82]);
      tyreWall(0.075, 0.10,   1, 3, [0.90, 0.30, 0.20]);
      tyreWall(0.133, 0.162, -1, 3, [0.20, 0.40, 0.85]);
      tyreWall(0.50,  0.53,   1, 3, [0.95, 0.80, 0.15]);
      tyreWall(0.70,  0.75,   1, 4, [0.90, 0.30, 0.20]);
      tyreWall(0.135, 0.165, -1, 3, [0.95, 0.75, 0.15]);

      // ── (10b) EL BÚNKER retaining wall + MOTORWAY bridge landmarks ──────────
      // El Búnker: tall grey retaining face on the climb/drop (elev crest ~0.60).
      for (let f = 0.52; f <= 0.62; f += 0.018) {
        const k = Math.round(f * n) % n;
        const A = anchor(k, 1, 3.2);
        if (onTrack(A.c[0], A.c[2], 4)) continue;
        const h = 5.5 + hash(k * 3) * 3.5;
        addBox(out, vadd(A.c, A.u, h * 0.5), [1.4, h, 18], CONCRETE, [A.r, A.u, A.t]);
        // Cap beam + faint bunker-slot shadow band
        addBox(out, vadd(A.c, A.u, h + 0.25), [1.8, 0.45, 18], [0.62, 0.63, 0.65], [A.r, A.u, A.t]);
        addBox(out, vadd(vadd(A.c, A.u, h * 0.55), A.r, -0.55),
               [0.25, 0.9, 14], [0.42, 0.43, 0.45], [A.r, A.u, A.t]);
      }
      // Companion low retaining stub on the inside of the drop.
      wall(0.54, 0.60, -1, 2.2, 2.8, [0.70, 0.70, 0.72], 0.7);

      // Motorway overpass at the T1 chicane — cars pass under a pale deck.
      underpassPortal(0.085, {
        h: 6.2, thick: 1.6, depth: 22,
        col: [0.58, 0.59, 0.61], pierGap: 1.8, pierW: 2.0,
      });
      // Approach embankment slabs either side of the portal (motorway shoulders).
      for (const [frac, side] of [[0.075, 1], [0.075, -1], [0.095, 1], [0.095, -1]]) {
        const k = Math.round(frac * n) % n;
        const A = anchor(k, side, 14);
        if (onTrack(A.c[0], A.c[2], 8)) continue;
        addBox(out, vadd(A.c, A.u, 2.2), [10, 4.4, 16], [0.66, 0.66, 0.68], [A.r, A.u, A.t]);
      }

      // ── (11) BILLBOARDS & MARSHAL POSTS ────────────────────────────────────
      const adCols = [[0.90, 0.25, 0.20], [0.15, 0.45, 0.85], [0.95, 0.78, 0.15],
                      [0.20, 0.65, 0.40], [0.85, 0.85, 0.88]];
      for (const [frac, side] of [
        [0.06, 1], [0.12, -1], [0.20, 1], [0.28, -1], [0.35, 1], [0.42, -1],
        [0.49, 1], [0.59, -1], [0.67, 1], [0.79, -1], [0.85, 1], [0.92, -1], [0.96, 1],
      ]) {
        const k = Math.round(frac * n) % n;
        billboard(k, side, 6, 9.5, 4.8, adCols[k % adCols.length]);
      }
      billboard(Math.round(0.01 * n) % n,  1, 14, 12, 5, [0.85, 0.15, 0.12]);
      billboard(Math.round(0.04 * n) % n, -1, 12, 12, 5, [0.92, 0.72, 0.08]);
      for (const [frac, side] of [
        [0.04, -1], [0.10, 1], [0.18, -1], [0.25, 1], [0.32, -1], [0.40, 1],
        [0.47, -1], [0.56, 1], [0.63, -1], [0.72, 1], [0.80, -1], [0.88, 1], [0.95, -1],
      ]) {
        const k = Math.round(frac * n) % n;
        marshalPost(k, side, 4);
      }

      // ── (12) URBAN GREENERY: clipped hedges + sparse boulevard trees ────────
      // Castilian identity = straw scrub, not lush woodland. No forestEdge.
      hedge(0.09, 0.20, -1, 8,  1.4, OLIVE);
      hedge(0.22, 0.32,  1, 9,  1.4, OLIVE);
      hedge(0.85, 0.96,  1, 10, 1.4, OLIVE);

      // Boulevard plane trees in street zones only (sparse)
      for (let i = 0; i < n; i += 6) {
        const f = i / n;
        const inStreet = (f < 0.20) || (f > 0.28 && f < 0.50);
        if (!inStreet) continue;
        for (const side of [-1, 1]) {
          if (hash(i * 13 + side) > 0.45) continue;
          const d = 13 + hash(i * 7 + side) * 7;
          if (onTrack(px[i], pz[i], 16)) continue;
          tree(i, side, d, 6.0 + hash(i * 5) * 3.0, OLIVE);
        }
      }

      // ── (13) DRY CASTILIAN PLAINS: straw-tan open ground + sparse scrub ─────
      // Defining contrast: clean white IFEMA halls against WARM straw plains.
      // Broad slabs on open stretches + post-Monumental pelouse (s≈0.82–0.88).
      for (const [f0, f1, side, gap] of [
        [0.14, 0.30, -1, 22], [0.18, 0.28,  1, 28],
        [0.48, 0.56, -1, 26], [0.48, 0.54,  1, 30],
        [0.82, 0.90, -1, 20], [0.82, 0.88,  1, 24],
        [0.90, 0.98, -1, 22], [0.92, 0.98,  1, 36],
      ]) {
        for (let f = f0; f < f1; f += 0.025) {
          const k = ((Math.round(f * n) % n) + n) % n;
          const A = anchor(k, side, gap + 16);
          if (onTrack(A.c[0], A.c[2], 20)) continue;
          groundPlane(k, side, gap, [78, 100], hash(k * 7) < 0.5 ? STRAW : STRAW2);
        }
      }
      for (let i = 0; i < n; i += 4) {
        for (const side of [-1, 1]) {
          if (hash(i * 31 + side) > 0.55) continue;
          const d = 72 + hash(i * 17 + side) * 95;
          const k = ((i % n) + n) % n;
          const A = anchor(k, side, d);
          if (onTrack(A.c[0], A.c[2], 20)) continue;
          const r = hash(i * 41 + side);
          // Mostly dry straw-toned scrub; minority olive for variety.
          const col = r < 0.70 ? [0.62, 0.58, 0.40] : OLIVE;
          if (r < 0.55) bush(k, side, d, col);
          else if (r < 0.78) tree(k, side, d, 4.5 + hash(i * 53) * 3.5, col);
        }
      }

      // ── (14) AIRPORT RUNWAY EDGE LIGHTS: s≈0.0–0.10 ────────────────────────
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
      // Open IFEMA plaza. Low-profile stone pavers well clear of the road.
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

      // ── (16) THIN Las Ventas arcade — set well behind the white bowl so the
      //    modern stadium silhouette wins; brick is a secondary Las Ventas nod. ─
      const BRICK  = [0.60, 0.33, 0.25], BRICK_L = [0.68, 0.41, 0.31];
      const ARC_LANTERN = [0.98, 0.80, 0.42];
      function archBay(k, side, gap) {
        const A = anchor(k, side, gap);
        const b = [A.r, A.u, A.t], c = A.c;
        if (onTrack(c[0], c[2], 8)) return;
        // Slim pier + short arcade lintel (half the old height).
        out._mat = MAT.BRICK;
        addBox(out, vadd(c, A.u, 4.0), [1.6, 8, 1.6], BRICK, b);
        addBox(out, vadd(c, A.u, 8.4), [1.8, 1.0, 5.0], BRICK_L, b);
        addPrism(out, vadd(c, A.u, 9.4), [1.8, 1.0, 5.0], BRICK, b);
        out._mat = MAT.GLASS;
        addBox(out, vadd(c, A.u, 5.5), [0.3, 2.8, 3.6], ARC_LANTERN, b);
        out._mat = 0;
      }
      for (let i = -10; i <= 10; i += 4) {
        const k = ((kmono + i * step) % n + n) % n;
        for (const side of [1, -1]) archBay(k, side, 52);
      }

      // ── (17) BESPOKE: IFEMA CONVENTION-CENTRE HALLS — vast pavilions with the
      //    distinctive glazed sawtooth roofline + a glass entrance atrium. ────
      function expoHall(frac, side, gap, w, d, h) {
        const k = Math.round(frac * n) % n;
        const A = anchor(k, side, gap);
        const b = [A.r, A.u, A.t], c = A.c;
        if (onTrack(c[0], c[2], 20)) return;
        // Main hall mass + a bright glass clerestory band.
        out._mat = MAT.METAL;
        addBox(out, vadd(c, A.u, h * 0.5), [w, h, d], WHITE, b);
        out._mat = MAT.GLASS;
        addBox(out, vadd(c, A.u, h - 1.6), [w + 0.4, 2.2, d + 0.4], LGLASS, b);
        // Sawtooth roof: north-lit glazed monitor ridges across the span.
        const teeth = Math.max(4, Math.floor(w / 8));
        for (let t = 0; t < teeth; t++) {
          const off = (t / (teeth - 1) - 0.5) * (w - 4);
          out._mat = t % 2 ? MAT.METAL : MAT.GLASS;
          addPrism(out, vadd(vadd(c, A.r, off), A.u, h + 1.4), [w / teeth - 0.6, 2.8, d],
                   t % 2 ? STEEL : [0.70, 0.82, 0.94], b);
        }
        // Glass entrance atrium projecting toward the track.
        out._mat = MAT.GLASS;
        addBox(out, vadd(vadd(c, A.r, side * (w * 0.5 - 3)), A.u, 6), [8, 12, d * 0.5], GLASS, b);
        out._mat = MAT.METAL;
        addPrism(out, vadd(vadd(c, A.r, side * (w * 0.5 - 3)), A.u, 12.5), [8, 3, d * 0.5], STEEL, b);
        out._mat = 0;
      }
      expoHall(0.925, 1, hw[Math.round(0.925 * n) % n] + 70, 76, 100, 20);
      expoHall(0.045, 1, hw[Math.round(0.045 * n) % n] + 72, 82, 104, 22);
      expoHall(0.965, -1, hw[Math.round(0.965 * n) % n] + 66, 64, 88, 18);
    },
  }
  );
})();
