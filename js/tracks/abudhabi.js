/* Apex 26 — ABU DHABI circuit definition (data only).
   Registered on the global TrackDefs list; consumed by the js/tracks.js engine
   (palette resolved there from `night`, geometry from js/circuits.js or `segs`). */
(function () {
  "use strict";
  (window.TrackDefs = window.TrackDefs || []).push(
  {
    id: "abudhabi",
    name: "ABU DHABI",
    gp: "Abu Dhabi GP",
    country: "UAE",
    night: true,
    theme: "desert",
    lengthKm: 5.3,
    baseHW: 8,
    pal: { horizon: [0.32, 0.16, 0.08], zenith: [0.10, 0.06, 0.24], sunColor: [0.90, 0.68, 0.38], ambientSky: [0.36, 0.28, 0.24], ambientGround: [0.32, 0.20, 0.12], fogColor: [0.22, 0.12, 0.06], fogDensity: 0.0020, sunDir: [0.55, 0.15, 0.32], concrete: [0.28, 0.27, 0.26], runoff: [0.24, 0.23, 0.22], grass: [0.20, 0.18, 0.14] },
    segs: [
      { t: 0, l: 300 }, { t: -60, l: 90 }, { t: 70, l: 80 }, { t: 0, l: 400 }, { t: 90, l: 100 }, { t: 0, l: 200 },
      { t: 60, l: 90 }, { t: 0, l: 300 }, { t: -80, l: 100 }, { t: 60, l: 80 }, { t: 90, l: 100 }, { t: -60, l: 80 },
    ],
    // Yas Marina underpass: the circuit dips below the Yas Hotel near the end of the lap.
    elevations: [{ s: 0.88, halfM: 160, rise: -4 }],
    scenery: function (api) {
      const { out, n, px, pz, pyMin, place, prop, groundPlane, addBox,
        anchor, onTrack, hash, vadd, building, tower, grandstand, billboard,
        gantry, palm, bush, hedge, addCyl, addCone, addFrustum, addPrism,
        fence, guardrail, tyreWall, marshalPost, wall, along } = api;
      const K = (s) => Math.round(s * n) % n;

      // ---- dusk-to-night marina palette ----
      const LED_TEAL = [0.20, 0.80, 0.90];
      const LED_MAG = [0.90, 0.20, 0.70];
      const LED_AMBER = [1.00, 0.60, 0.20];
      const LED_CYCLE = [LED_TEAL, LED_MAG, LED_AMBER];
      const WARM = [1.00, 0.72, 0.38];     // dock / base uplight
      const WIN = [0.70, 0.78, 0.95];      // cool lit windows
      const WIN_WARM = [1.00, 0.84, 0.58];  // warm lit windows (sunset side)
      const FLOOD = [1.0, 0.96, 0.82];    // floodlit white
      const SAND = [0.70, 0.55, 0.35];
      const SAND_DK = [0.52, 0.40, 0.26];  // shaded dune
      const WATER = [0.04, 0.06, 0.12];
      const FERRARI = [0.85, 0.08, 0.10];
      const DARK = [0.10, 0.10, 0.14];
      const DUSK = [0.30, 0.16, 0.20];     // deep sunset masonry

      // ===================================================================
      // Flat far horizon: desert-sand dune band ringing the lap (golden sands
      // with varied height to read as distant dune formations)
      // ===================================================================
      let cx = 0, cz = 0;
      for (let i = 0; i < n; i++) { cx += px[i]; cz += pz[i]; }
      cx /= n; cz /= n;
      let trad = 0;
      for (let i = 0; i < n; i++) trad = Math.max(trad, Math.hypot(px[i] - cx, pz[i] - cz));
      // four staggered dune bands = continuous desert backdrop with depth, no gaps
      for (const [extra, count, wMin, hMin, hVar, col] of [
        [350, 72, 240, 10, 10, SAND],
        [470, 64, 280, 14, 12, [0.68, 0.56, 0.38]],
        [600, 56, 320, 18, 14, SAND_DK],
        [740, 48, 360, 12, 10, [0.50, 0.40, 0.26]],
      ]) {
        const ring = trad + extra;
        for (let i = 0; i < count; i++) {
          const a = (i + 0.5 * (extra > 500 ? 1 : 0)) / count * 6.2832;
          const h = hash(i * 7 + extra);
          const h2 = hash(i * 13 + extra * 2);
          const mx = cx + Math.cos(a) * ring, mz = cz + Math.sin(a) * ring;
          const varH = hMin + h * hVar + (h2 - 0.5) * hVar * 0.5;
          addBox(out, [mx, pyMin + varH / 2, mz], [wMin + h * 180, varH, 180], col);
        }
      }

      // ===================================================================
      // CONTINUOUS Yas Island marina skyline: two rings of lit buildings
      // wrapping the lap. Modern resort aesthetic with warm uplighting.
      // Density reduced from 80→60 for performance; skip every 2nd building.
      // ===================================================================
      for (const [extra, N, jit] of [[200, 60, 60], [290, 50, 90]]) {
        const ring = trad + extra;
        for (let i = 0; i < N; i++) {
          const a = i / N * 6.2832, h = hash(i * 13 + extra), h2 = hash(i * 29 + extra + 11);
          const bx = cx + Math.cos(a) * (ring + (h - 0.5) * jit);
          const bz = cz + Math.sin(a) * (ring + (h - 0.5) * jit);
          const w = 20 + h * 28, d = 20 + h2 * 28, hh = 14 + h * 54;
          // Lighter facade colours — modern resort glass + white (not dusk/dark)
          const shellCol = (i % 4 === 0) ? [0.34, 0.37, 0.42] : [0.28, 0.30, 0.36];
          addBox(out, [bx, pyMin + hh / 2, bz], [w, hh, d], shellCol);
          const win = (i % 2) ? WIN : WIN_WARM;
          addBox(out, [bx, pyMin + hh - 5, bz], [w + 0.6, 9, d + 0.6], win);
          const bc = LED_CYCLE[i % 3];
          addBox(out, [bx, pyMin + hh + 2, bz], [3, 4, 3], bc);
        }
      }

      // ===================================================================
      // Mid-depth leisure structures: domes + low resort halls + warm lanterns
      // ===================================================================
      {
        const ring = trad + 350;
        const N = 38;
        for (let i = 0; i < N; i++) {
          const a = (i + 0.4) / N * 6.2832, h = hash(i * 17 + 3);
          const lx = cx + Math.cos(a) * ring, lz = cz + Math.sin(a) * ring;
          const w = 44 + h * 56;
          addBox(out, [lx, pyMin + 9, lz], [w, 18, w * 0.7], DARK);
          addBox(out, [lx, pyMin + 18, lz], [w * 0.5, 6, w * 0.4], WARM);
        }
      }

      // ===================================================================
      // s 0.00 both — pit straight: long low pit-garage box R, Main Grandstand
      // box-rows L, scoring gantry over the line
      // ===================================================================
      for (let i = 0; i < 6; i++) {
        place(K(0.0 + i * 0.012), 1, 12, [9, 6, 30], [0.30, 0.31, 0.36]);   // pit garages
        place(K(0.0 + i * 0.012), 1, 12, [9.4, 1.0, 30.4], FLOOD);          // lit fascia band
      }
      grandstand(0.0, -1, 6, 120, [0.22, 0.23, 0.30], [0.30, 0.34, 0.46]);
      grandstand(0.02, -1, 6, 90, [0.22, 0.23, 0.30], [0.30, 0.34, 0.46]);
      gantry(0.0, 9, DARK);

      // ===================================================================
      // s 0.05 L — Turn 1 + esses: marshal-light spectator banks
      // ===================================================================
      grandstand(0.05, -1, 8, 70, [0.20, 0.21, 0.27], [0.28, 0.32, 0.44]);
      billboard(K(0.05), -1, 10, 18, 11, LED_TEAL);

      // ===================================================================
      // s 0.18 R far — FERRARI WORLD: huge low red roof box + white/yellow logo
      // disc, desert behind
      // ===================================================================
      {
        const k = K(0.18);
        place(k, 1, 100, [180, 26, 150], FERRARI);               // vast red roof mass
        place(k, 1, 103, [184, 5, 154], [0.55, 0.05, 0.06]);     // shaded eave band
        const a = anchor(k, 1, 70);
        addCyl(out, vadd(a.c, a.u, 30), 22, 3, [0.95, 0.93, 0.85], 14, [a.r, a.u, a.t]);   // logo disc
        addCyl(out, vadd(a.c, a.u, 31.5), 11, 2, [1.00, 0.85, 0.10], 12, [a.r, a.u, a.t]); // yellow centre
      }

      // ===================================================================
      // s 0.28 both — NORTH HAIRPIN: curved sun-tower grandstand bowl
      // ===================================================================
      for (const side of [-1, 1]) {
        grandstand(0.28, side, 7, 90, [0.20, 0.21, 0.28], [0.30, 0.34, 0.46]);
        grandstand(0.30, side, 7, 70, [0.20, 0.21, 0.28], [0.30, 0.34, 0.46]);
      }

      // ===================================================================
      // s 0.34 both — back straight: thin LED light-tower boxes at intervals
      // (dark pole + bright cap), alternating sides
      // ===================================================================
      for (let i = 0; i < 13; i++) {
        const side = (i % 2) ? 1 : -1;
        tower(K(0.34 + i * 0.006), side, 16, 4, 34,
          { col: DARK, seg: 4, cap: true, capCol: FLOOD });
      }
      // extra floodlights ringing pit straight + hairpin for the night look
      for (let i = 0; i < 6; i++)
        tower(K(0.0 + i * 0.012), -1, 20, 4, 36, { col: DARK, seg: 4, cap: true, capCol: FLOOD });
      for (const side of [-1, 1])
        for (let i = 0; i < 3; i++)
          tower(K(0.27 + i * 0.014), side, 18, 4, 34, { col: DARK, seg: 4, cap: true, capCol: FLOOD });

      // ===================================================================
      // s 0.42 L — banked Turn 9: runoff + grandstand boxes
      // ===================================================================
      grandstand(0.42, -1, 9, 80, [0.20, 0.21, 0.28], [0.30, 0.34, 0.46]);
      place(K(0.42), -1, 32, [60, 0.4, 30], [0.20, 0.21, 0.22]);   // pale runoff apron

      // ===================================================================
      // s 0.55 R mid — MARINA opens: dark water planes + yacht fleet
      // White hulls with masts + mooring posts. Reduced density for performance.
      // ===================================================================
      for (let i = 0; i < 10; i++) groundPlane(K(0.52 + i * 0.030), 1, 14, [140, 1.2, 140], WATER);
      for (let i = 0; i < 24; i++) {
        const k = K(0.53 + (i % 12) * 0.020);
        const a = anchor(k, 1, 22 + (i % 4) * 10);
        const off = ((i % 6) - 2.5) * 9.0;
        const hc = vadd(a.c, a.t, off);
        const big = (i % 5 === 0) ? 1.5 : (i % 3 === 1 ? 1.2 : 1.0);
        // hull
        addBox(out, vadd(hc, a.u, 1.2 * big), [4.8 * big, 2.5 * big, 12 * big], [0.94, 0.95, 0.96], [a.r, a.u, a.t]);
        // mast
        addCyl(out, vadd(hc, a.u, 9.0 * big), 0.20, 12 * big, [0.86, 0.88, 0.92], 4, [a.r, a.u, a.t]);
        // warm reflection speck (water highlight)
        addBox(out, vadd(hc, a.u, 0.5), [5.2 * big, 0.4, 12.5 * big], [1.0, 0.85, 0.50], [a.r, a.u, a.t]);
        // cabin on larger boats
        if (big > 1.2) addBox(out, vadd(hc, a.u, 2.5 * big), [2.4 * big, 1.4 * big, 4.5 * big], [0.82, 0.84, 0.90], [a.r, a.u, a.t]);
      }
      // mooring posts and buoys (reduced from 14 to 10)
      for (let i = 0; i < 10; i++) {
        const k = K(0.54 + i * 0.033);
        const a = anchor(k, 1, 28 + (i % 3) * 7);
        // post
        addCyl(out, a.c, 0.35, 3.2, [0.72, 0.54, 0.28], 6, [a.r, a.u, a.t]);
        // top ring
        addBox(out, vadd(a.c, a.u, 3.5), [1.6, 0.8, 1.6], [0.85, 0.22, 0.12], [a.r, a.u, a.t]);
      }

      // ===================================================================
      // s 0.62 R mid — MARINA HOTEL cluster: modern white/glass resort slab +
      // warm base uplight, flanked by two shorter wings, prominent night lighting
      // ===================================================================
      building(K(0.62), 1, 25, 54, 60, 32, { wall: [0.20, 0.22, 0.30], window: WIN, floor: 6 });
      building(K(0.60), 1, 30, 36, 36, 26, { wall: [0.18, 0.20, 0.28], window: WIN_WARM, floor: 5 });
      building(K(0.64), 1, 30, 36, 40, 26, { wall: [0.18, 0.20, 0.28], window: WIN, floor: 5 });
      place(K(0.62), 1, 52, [58, 4.2, 9], [1.0, 0.80, 0.45]);   // prominent warm uplit base band
      place(K(0.60), 1, 46, [38, 3.5, 8], [0.98, 0.78, 0.42]);
      place(K(0.64), 1, 46, [38, 3.5, 8], [0.98, 0.78, 0.42]);

      // ===================================================================
      // s 0.70 R near — marina-side grandstand + amber dock-lamp dot row
      // ===================================================================
      grandstand(0.70, 1, 8, 80, [0.20, 0.21, 0.28], [0.30, 0.34, 0.46]);
      for (let i = 0; i < 8; i++) {
        const a = anchor(K(0.70), 1, 6 + i * 1.0);
        addCyl(out, vadd(a.c, a.t, (i - 4) * 7), 0.14, 5, [0.30, 0.25, 0.18], 4, [a.r, a.u, a.t]);
        addBox(out, vadd(vadd(a.c, a.t, (i - 4) * 7), a.u, 5), [1.2, 1.0, 1.2], WARM, [a.r, a.u, a.t]);
      }

      // ===================================================================
      // s 0.78 L — MARSA swept curve: long gentle grandstand chain, cool kerbs
      // ===================================================================
      grandstand(0.78, -1, 8, 100, [0.20, 0.21, 0.28], [0.30, 0.34, 0.46]);
      grandstand(0.80, -1, 8, 70, [0.20, 0.21, 0.28], [0.30, 0.34, 0.46]);

      // ===================================================================
      // s 0.88 OVER — W YAS HOTEL (hero): twin tall curved towers with sweeping
      // lattice arch spanning the track, colour-cycle LED-lit gridshell.
      // The iconic landmark of Yas Island, visible for many seconds.
      // ===================================================================
      {
        const k = K(0.88);
        const H = 105;  // tower height: tall to dominate the skyline
        // flanking twin curved towers with LED-grid shells
        for (const side of [-1, 1]) {
          const a = anchor(k, side, 16);
          // tapered tower core (frustum reads as curved tower when lit)
          addFrustum(out, a.c, 22, 16, H, [0.10, 0.11, 0.16], 8, [a.r, a.u, a.t]);
          // dark glass podium base
          addBox(out, vadd(a.c, a.u, 6), [38, 12, 44], [0.08, 0.09, 0.13], [a.r, a.u, a.t]);
          // warm uplit base band — the glowing accent
          addBox(out, vadd(a.c, a.u, 1.4), [41, 3.2, 47], [1.0, 0.78, 0.42], [a.r, a.u, a.t]);
          // emissive LED grid-shell facing the track (diagrid panels, reduced from 14×7 to 10×5 for perf)
          for (let gy = 0; gy < 10; gy++) for (let gx = 0; gx < 5; gx++) {
            const cc = vadd(vadd(a.c, a.u, 12 + gy * 7), a.t, (gx - 2) * 8.0);
            const col = LED_CYCLE[(gx + gy + k) % 3];
            addBox(out, vadd(cc, a.r, -side * 16.5), [0.6, 4.2, 5.2], col, [a.r, a.u, a.t]);
          }
          // wrap-around LED band on the side face (curved-shell read)
          for (let gy = 0; gy < 10; gy++) {
            const cc = vadd(a.c, a.u, 12 + gy * 7);
            const col = LED_CYCLE[(gy + k + 1) % 3];
            addBox(out, vadd(cc, a.t, side * 21.0), [0.6, 4.2, 4.4], col, [a.r, a.u, a.t]);
          }
          // crown cap + beacon (brighter emissive)
          addBox(out, vadd(a.c, a.u, H + 2), [20, 3.5, 24], [1.0, 0.98, 0.85], [a.r, a.u, a.t]);
          addBox(out, vadd(a.c, a.u, H + 5.5), [4, 5, 4], LED_MAG, [a.r, a.u, a.t]);
          // warm gold LED strip along roof line
          addBox(out, vadd(a.c, a.u, H - 1.5), [42, 1.4, 54], [1.0, 0.85, 0.35], [a.r, a.u, a.t]);
        }
        // SWEEPING CANOPY ARCH: two inward-leaning half-shells arching from
        // each tower toward the track. Reads as the iconic grid-shell spanning
        // overhead. Reduced complexity: 5 bands instead of 5, 8 steps instead of 10.
        for (const side of [-1, 1]) {
          const a = anchor(k, side, 16);
          for (let band = -2; band <= 2; band++) {
            const foff = band * 9.0;
            let prevPt = null;
            // reach from 16m out (tower) toward 4m off the edge
            for (let j = 0; j <= 8; j++) {
              const t = j / 8;
              const dist = 16 - t * 11;                      // 16 → 5m off the edge
              const ap = anchor(k, side, dist);
              const lift = 26 + Math.sin(t * Math.PI) * 26;  // smoother arc: 26→52→26m
              const c = vadd(vadd(ap.c, ap.u, lift), ap.t, foff);
              const col = LED_CYCLE[((j + Math.round(band) + side) % 3 + 3) % 3];
              addBox(out, c, [3.2, 1.5, 2.8], col, [ap.r, ap.u, ap.t]);
              // connection strut to previous point (reads as structural member)
              if (prevPt) {
                const mid = [(prevPt[0] + c[0]) / 2, (prevPt[1] + c[1]) / 2, (prevPt[2] + c[2]) / 2];
                addBox(out, mid, [3.0, 0.8, 1.2], [0.06, 0.07, 0.10], [ap.r, ap.u, ap.t]);
              }
              prevPt = c;
            }
          }
        }
        // reflecting pool at the hotel base + dock lighting
        groundPlane(K(0.87), 1, 12, [80, 1.2, 70], WATER);
        // marina water light reflection streaks (warm + cool)
        for (let i = 0; i < 6; i++) {
          const ak = anchor(K(0.53 + i * 0.035), 1, 22 + (i % 3) * 6);
          addBox(out, vadd(ak.c, ak.u, -0.2), [48, 0.35, 2.2], [1.0, 0.84, 0.42], [ak.r, ak.u, ak.t]);
          addBox(out, vadd(ak.c, ak.u, -0.5), [48, 0.35, 2.2], [0.45, 0.60, 0.80], [ak.r, ak.u, ak.t]);
        }
        // dock lights and water accents
        for (let i = 0; i < 6; i++) {
          const a = anchor(K(0.87), 1, 9 + i * 1.4);
          addBox(out, vadd(vadd(a.c, a.t, (i - 2.5) * 10), a.u, 0.4), [2.2, 0.5, 2.2], LED_AMBER, [a.r, a.u, a.t]);
          addBox(out, vadd(vadd(a.c, a.t, (i - 2.5) * 10), a.u, -0.3), [2.4, 0.25, 2.4], [1.0, 0.82, 0.40], [a.r, a.u, a.t]);
        }
      }

      // ===================================================================
      // s 0.95 both — final left-right: barriers funnel back, lit billboards
      // ===================================================================
      billboard(K(0.95), 1, 9, 16, 10, LED_MAG);
      billboard(K(0.95), -1, 9, 16, 10, LED_TEAL);
      grandstand(0.96, -1, 6, 80, [0.22, 0.23, 0.30], [0.30, 0.34, 0.46]);

      // extra grandstands ringing T1/T5/T9/T11 (makes the seating bowl complete)
      grandstand(0.08, -1, 8, 70, [0.20, 0.21, 0.28], [0.30, 0.34, 0.46]);
      grandstand(0.10, -1, 8, 60, [0.22, 0.23, 0.30], [0.30, 0.34, 0.46]);
      grandstand(0.22, -1, 8, 80, [0.20, 0.21, 0.28], [0.30, 0.34, 0.46]);
      grandstand(0.36, 1, 8, 60, [0.22, 0.23, 0.30], [0.30, 0.34, 0.46]);
      grandstand(0.48, -1, 8, 60, [0.20, 0.21, 0.28], [0.30, 0.34, 0.46]);
      grandstand(0.56, 1, 8, 70, [0.22, 0.23, 0.30], [0.30, 0.34, 0.46]);
      grandstand(0.83, -1, 8, 60, [0.20, 0.21, 0.28], [0.30, 0.34, 0.46]);
      grandstand(0.92, -1, 8, 80, [0.22, 0.23, 0.30], [0.30, 0.34, 0.46]);

      // second Yas Marina hotel group across the infield at s 0.44 R (the Radisson)
      // Modern resort architecture with prominence at night
      building(K(0.44), 1, 36, 42, 48, 28, { wall: [0.18, 0.20, 0.28], window: WIN, floor: 6 });
      building(K(0.45), 1, 37, 28, 34, 20, { wall: [0.16, 0.18, 0.26], window: WIN_WARM, floor: 5 });
      building(K(0.43), 1, 42, 32, 28, 22, { wall: [0.15, 0.17, 0.24], window: WIN, floor: 5 });
      place(K(0.44), 1, 30, [46, 3.2, 8], [1.0, 0.82, 0.46]);

      // more light towers along S1 back straight + marina sector
      for (let i = 0; i < 8; i++)
        tower(K(0.42 + i * 0.007), (i%2)?1:-1, 18, 4, 32, { col: DARK, seg: 4, cap: true, capCol: FLOOD });
      for (let i = 0; i < 6; i++)
        tower(K(0.56 + i * 0.008), 1, 16, 4, 30, { col: DARK, seg: 4, cap: true, capCol: FLOOD });

      // additional yacht mooring: 12 smaller boats behind the main marina fleet
      for (let i = 0; i < 12; i++) {
        const k = K(0.58 + (i % 6) * 0.024);
        const a = anchor(k, 1, 32 + (i % 2) * 14);
        const off = ((i % 4) - 1.5) * 9;
        const hc = vadd(a.c, a.t, off);
        // smaller hull
        addBox(out, vadd(hc, a.u, 1.0), [3.5, 2.0, 9], [0.90, 0.91, 0.93], [a.r, a.u, a.t]);
        // mast
        addCyl(out, vadd(hc, a.u, 7), 0.15, 10, [0.84, 0.85, 0.88], 4, [a.r, a.u, a.t]);
        // deck light reflection
        addBox(out, vadd(hc, a.u, 0.3), [4.0, 0.3, 9.5], LED_AMBER, [a.r, a.u, a.t]);
      }

      // ===================================================================
      // Palms scattered along the marina + pit areas — tropical accents
      // Strategic placement rather than dense clustering for performance
      // ===================================================================
      // Marina-facing palms (right side, moderate density)
      for (let i = 0; i < 42; i++) {
        const s = 0.48 + (i / 42) * 0.44;
        const side = (i % 3 === 0) ? 1 : ((i % 2) ? -1 : 1);
        const dist = 8 + hash(i * 5) * 7 + (i % 2);
        const h = 9 + hash(i * 3) * 5;
        const frond = (i % 4 === 0) ? [0.28, 0.55, 0.22] : [0.25, 0.55, 0.20];
        palm(K(s), side, dist, h, frond);
      }
      // pit straight palms (avenue flanking both sides)
      for (let i = 0; i < 14; i++) {
        const side = (i % 2) ? 1 : -1;
        const dist = 6 + hash(i * 9) * 5;
        palm(K(0.0 + i * 0.010), side, dist, 9 + hash(i * 7) * 2, [0.26, 0.56, 0.21]);
      }
      // Marsa curve palms (taller cluster, left side)
      for (let i = 0; i < 16; i++) {
        const dist = 8 + hash(i * 11) * 5;
        palm(K(0.78 + i * 0.009), -1, dist, 10 + hash(i * 3) * 3, [0.27, 0.57, 0.22]);
      }
      // pit-entry chicane palms (inner-infield accents)
      for (let i = 0; i < 12; i++) {
        const side = (i % 2) ? 1 : -1;
        const dist = 9 + hash(i * 7) * 5 + (i % 2);
        palm(K(0.92 + i * 0.007), side, dist, 8 + hash(i * 5) * 2, [0.26, 0.55, 0.20]);
      }

      // ===================================================================
      // CONTINUOUS TRACK FURNITURE — catch fences, guardrails, tyre walls,
      // marshal posts ringing the lap. Kept at safe clearance off the tarmac.
      // ===================================================================
      // Outer catch/debris fence running most of the lap (spectator protection)
      fence(0.03, 0.30, -1, 4.5, 4.5, [0.42, 0.45, 0.50]);
      fence(0.50, 0.86, 1, 4.5, 4.5, [0.42, 0.45, 0.50]);
      fence(0.30, 0.48, -1, 4.5, 4.0, [0.42, 0.45, 0.50]);
      // Pit-wall (solid concrete) along the start/finish straight, pit side
      wall(0.985, 0.07, 1, 3.0, 1.1, [0.80, 0.82, 0.86], 0.6);
      // Armco guardrails on the open runoff edges
      guardrail(0.05, 0.18, -1, 6, [0.75, 0.77, 0.80]);
      guardrail(0.32, 0.42, 1, 6, [0.75, 0.77, 0.80]);
      guardrail(0.90, 0.99, -1, 6, [0.75, 0.77, 0.80]);
      // Tyre-wall stacks at the tight corner exits (hairpin + final chicane)
      tyreWall(0.27, 0.31, 1, 5, LED_TEAL);
      tyreWall(0.27, 0.31, -1, 5, LED_AMBER);
      tyreWall(0.95, 0.985, 1, 5, LED_MAG);
      tyreWall(0.05, 0.085, -1, 5, LED_TEAL);
      // Marshal posts (orange roof + flag pole) spaced around the lap
      for (let i = 0; i < 14; i++) {
        const s = i / 14;
        marshalPost(K(s), (i % 2) ? 1 : -1, 7);
      }

      // ===================================================================
      // ADVERTISING — selective lit billboards around the circuit
      // ===================================================================
      {
        const ad = [LED_TEAL, LED_MAG, LED_AMBER, WIN];
        for (let i = 0; i < 12; i++) {
          const s = i / 12;
          const side = (i % 2) ? -1 : 1;
          billboard(K(s + 0.015), side, 11, 15, 8, ad[i % ad.length]);
        }
      }

      // ===================================================================
      // PIT / PADDOCK complex behind the pit wall (R of S/F straight):
      // modern garage block, motorhome row, fuel/tyre bays, paddock floodlights
      // ===================================================================
      {
        // long paddock apron
        place(K(0.02), 1, 40, [130, 0.5, 65], [0.20, 0.21, 0.23]);
        // team motorhome row (modern two-storey lit hospitality units)
        for (let i = 0; i < 10; i++) {
          const k = K(0.985 + i * 0.010);
          const wc = (i % 2) ? WIN : WIN_WARM;
          place(k, 1, 44, [16, 10, 18], [0.22, 0.23, 0.28]);
          place(k, 1, 44, [16.4, 2.6, 18.4], wc);          // lit window band
          place(k, 1, 44, [17, 1.6, 19], [0.12, 0.13, 0.16]); // roof cap
        }
        // pit-lane back wall + garage roof line (more prominent)
        for (let i = 0; i < 7; i++) {
          place(K(0.0 + i * 0.011), 1, 22, [11, 9, 30], [0.24, 0.25, 0.30]);
          place(K(0.0 + i * 0.011), 1, 22, [11.4, 1.4, 30.4], [1.0, 0.95, 0.80]); // roof fascia glow
        }
        // paddock floodlight masts (taller, more numerous)
        for (let i = 0; i < 7; i++)
          tower(K(0.99 + i * 0.010), 1, 50, 5, 32, { col: DARK, seg: 4, cap: true, capCol: FLOOD });
      }

      // ===================================================================
      // START GANTRY DETAIL — five red lights bar over the line + camera gantry
      // ===================================================================
      {
        const aL = anchor(K(0.0), -1, 7), aR = anchor(K(0.0), 1, 7);
        for (let j = 0; j < 5; j++) {
          const t = (j + 0.5) / 5;
          const bx = aL.c[0] + (aR.c[0] - aL.c[0]) * t;
          const bz = aL.c[2] + (aR.c[2] - aL.c[2]) * t;
          addBox(out, [bx, aL.c[1] + 8.5, bz], [1.6, 1.6, 0.8], [0.85, 0.10, 0.08], [aL.r, aL.u, aL.t]);
        }
        // a second photo/scoring gantry just before T1
        gantry(0.96, 9, DARK);
      }

      // ===================================================================
      // SUN-TOWER landmark at the North Hairpin (curved viewing tower)
      // ===================================================================
      {
        const k = K(0.28);
        const a = anchor(k, 1, 36);
        addFrustum(out, a.c, 14, 9, 40, [0.12, 0.13, 0.18], 10, [a.r, a.u, a.t]);
        addBox(out, vadd(a.c, a.u, 22), [30, 8, 12], WIN, [a.r, a.u, a.t]);   // glazed observation deck
        addBox(out, vadd(a.c, a.u, 42), [10, 4, 10], FLOOD, [a.r, a.u, a.t]); // lit crown
      }

      // ===================================================================
      // GRANDSTAND CROWN DETAIL — big-screen video walls + roof spotlights
      // on the main stands
      // ===================================================================
      for (const [s, side] of [[0.0, -1], [0.28, -1], [0.28, 1], [0.70, 1], [0.78, -1]]) {
        const a = anchor(K(s), side, 22);
        addBox(out, vadd(a.c, a.u, 20), [22, 12, 1.5], WIN, [a.r, a.u, a.t]);        // screen frame
        addBox(out, vadd(vadd(a.c, a.u, 20), a.r, side * 0.9), [19, 10, 0.6], LED_TEAL, [a.r, a.u, a.t]); // bright screen
      }

      // ===================================================================
      // ISLAND LANDSCAPING — hedges + shrubs + ornamental palm clusters
      // ===================================================================
      hedge(0.10, 0.18, -1, 12, 2.2, [0.16, 0.22, 0.14]);
      hedge(0.62, 0.74, 1, 13, 2.2, [0.16, 0.22, 0.14]);
      // low shrub clusters (reduced from 24 to 16 for perf)
      for (let i = 0; i < 16; i++) {
        const s = i / 16;
        bush(K(s), (i % 2) ? 1 : -1, 10 + hash(i * 13) * 6, [0.15, 0.21, 0.13]);
      }
      // palm clusters at corner apex (strategic placement)
      for (const s of [0.05, 0.18, 0.42, 0.55, 0.78, 0.95]) {
        for (let j = 0; j < 3; j++)
          palm(K(s + j * 0.005), (s < 0.5) ? -1 : 1, 12 + j * 2.2, 7 + hash(j * 3) * 4, [0.26, 0.56, 0.21]);
      }

      // ===================================================================
      // MARINA PROMENADE — hero mega-yacht + luxury pavilion tents + jetties
      // ===================================================================
      {
        // hero mega-yacht at marina mouth (s ~0.66)
        const k = K(0.66);
        const a = anchor(k, 1, 32);
        const hc = vadd(a.c, a.u, 2.8);
        // hull
        addBox(out, hc, [10, 5.5, 38], [0.96, 0.97, 0.98], [a.r, a.u, a.t]);
        // superstructure
        addBox(out, vadd(hc, a.u, 4.5), [8, 4.5, 25], [0.91, 0.92, 0.95], [a.r, a.u, a.t]);
        // bridge deck windows (lit)
        addBox(out, vadd(hc, a.u, 8), [6, 3.2, 14], [0.75, 0.82, 0.95], [a.r, a.u, a.t]);
        // mast
        addCyl(out, vadd(hc, a.u, 13), 0.28, 16, [0.87, 0.88, 0.92], 4, [a.r, a.u, a.t]);
        // water reflection highlight
        addBox(out, vadd(hc, a.u, 0.6), [11, 0.5, 40], [1.0, 0.86, 0.50], [a.r, a.u, a.t]);
        // deck lighting accent
        addBox(out, vadd(hc, a.u, 5.5), [2.4, 0.6, 8], [0.85, 0.85, 0.88], [a.r, a.u, a.t]);
        // white luxury pavilion tents (A-frame, reduced from 9 to 7)
        for (let i = 0; i < 7; i++) {
          const ak = anchor(K(0.56 + i * 0.020), 1, 19);
          addPrism(out, vadd(ak.c, ak.u, 3.5), [7, 4.8, 9], [0.96, 0.96, 0.98], [ak.r, ak.u, ak.t]);
          // tent lighting
          addBox(out, vadd(ak.c, ak.u, 2), [7.2, 0.8, 9.2], [1.0, 0.88, 0.60], [ak.r, ak.u, ak.t]);
        }
        // jetty fingers reaching into water (reduced from 6 to 5)
        for (let i = 0; i < 5; i++) {
          const jk = anchor(K(0.55 + i * 0.022), 1, 13);
          // jetty deck
          addBox(out, vadd(jk.c, jk.t, 0), [2.4, 0.6, 28], [0.32, 0.30, 0.28], [jk.r, jk.u, jk.t]);
          // jetty accent lighting
          addBox(out, vadd(jk.c, jk.t, 0), [1.2, 0.4, 28.2], [0.95, 0.82, 0.55], [jk.r, jk.u, jk.t]);
        }
      }
      // Palm avenue: start/finish straight entrance/exit (tall accent trees)
      for (let i = 0; i < 18; i++) {
        const s = 0.0 + (i / 18) * 0.15;
        const side = (i % 2) ? 1 : -1;
        palm(K(s), side, 20 + hash(i * 17) * 14, 11 + hash(i * 7) * 3, [0.25, 0.55, 0.20]);
      }
      for (let i = 0; i < 14; i++) {
        const s = 0.85 + (i / 14) * 0.15;
        const side = (i % 2) ? 1 : -1;
        palm(K(s), side, 20 + hash(i * 23) * 14, 11 + hash(i * 11) * 3, [0.25, 0.55, 0.20]);
      }

      // ---- Desert ridge backdrop at outer perimeter (darker/hazier distance) ----
      for (const [distOff, sandCol] of [
        [250, [0.65, 0.54, 0.38]],
        [310, [0.60, 0.50, 0.34]],
        [370, [0.54, 0.44, 0.28]],
        [430, [0.48, 0.38, 0.24]],  // far hazed dune range
      ]) {
        let cx2 = 0, cz2 = 0;
        for (let i = 0; i < n; i++) { cx2 += px[i]; cz2 += pz[i]; }
        cx2 /= n; cz2 /= n;
        let tr = 0;
        for (let i = 0; i < n; i++) tr = Math.max(tr, Math.hypot(px[i] - cx2, pz[i] - cz2));
        const ring = tr + distOff;
        for (let i = 0; i < 24; i++) {
          const ang = i / 24 * 6.2832;
          const rx = cx2 + Math.cos(ang) * ring, rz = cz2 + Math.sin(ang) * ring;
          const hVar = hash(i * 11 + distOff);
          addBox(out, [rx, pyMin + 2 + hVar * 6, rz], [180 + hVar * 80, 10 + hVar * 8, 90], sandCol);
        }
      }
    },
  }
  );
})();
