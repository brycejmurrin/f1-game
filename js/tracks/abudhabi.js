/* Apex 26 — ABU DHABI circuit definition (data only).
   Registered on the global TrackDefs list; consumed by the js/tracks.js engine
   (palette resolved there from `night`, geometry from js/circuits.js or `segs`). */
(function () {
  "use strict";
  (window.TrackDefs = window.TrackDefs || []).push(
  {
    id: "abudhabi",
    reverse: false, // direction switched to real-world CW/CCW (was auto-audit reverse:true)
    startFrac: 0.0750, // GPS-derived (OpenF1 2025, conf=0.401)
    name: "ABU DHABI",
    gp: "Abu Dhabi GP",
    country: "UAE",
    night: true,
    theme: "desert",
    lengthKm: 5.3,
    baseHW: 8,
    pal: { horizon: [0.32, 0.16, 0.08], zenith: [0.10, 0.06, 0.24], sunColor: [0.90, 0.68, 0.38], ambientSky: [0.36, 0.28, 0.24], ambientGround: [0.32, 0.20, 0.12], fogColor: [0.22, 0.12, 0.06], fogDensity: 0.0020, sunDir: [0.55, 0.15, 0.32], concrete: [0.28, 0.27, 0.26], runoff: [0.24, 0.23, 0.22], grass: [0.20, 0.18, 0.14] },
    segs: [
      { t: 0, l: 300 }, { t: 60, l: 90 }, { t: -70, l: 80 }, { t: 0, l: 400 }, { t: -90, l: 100 }, { t: 0, l: 200 },
      { t: -60, l: 90 }, { t: 0, l: 300 }, { t: 80, l: 100 }, { t: -60, l: 80 }, { t: -90, l: 100 }, { t: 60, l: 80 },
    ],
    // Yas Marina underpass: the circuit dips below the Yas Hotel near the end of the lap.
    elevations: [{ s: 0.88, halfM: 160, rise: -4 }],
    scenery: function (api) {
      const { out, MAT, n, px, py, pz, pyMin, place, prop, groundPlane, addBox,
        anchor, onTrack, hash, vadd, building, motorhome, tower, grandstand, billboard,
        gantry, palm, bush, hedge, addCyl, addCone, addFrustum, addPrism,
        fence, guardrail, tyreWall, marshalPost, wall, along,
        cityFront, forestEdge, backdrop, mountain, ferrisWheel,
        gridshellCanopy, underpassPortal } = api;
      const K = (s) => Math.round(s * n) % n;

      // ---- twilight/night marina palette ----
      const LED_TEAL  = [0.20, 0.85, 0.95];
      const LED_MAG   = [0.95, 0.18, 0.72];
      const LED_AMBER = [1.00, 0.62, 0.18];
      const LED_CYCLE = [LED_TEAL, LED_MAG, LED_AMBER];
      const WARM      = [1.00, 0.74, 0.40];    // dock / base uplight
      const WIN       = [0.72, 0.80, 0.97];    // cool lit windows (bluish glass)
      const WIN_WARM  = [1.00, 0.86, 0.58];    // warm lit windows
      const WIN_EMI   = [0.92, 0.96, 1.00];    // bright emissive window highlight
      const FLOOD     = [1.00, 0.97, 0.84];    // floodlight cap — warm white
      const POOL      = [0.98, 0.95, 0.78];    // light pool on ground under masts
      const POOL_SOFT = [0.82, 0.78, 0.55];    // softer secondary light spill
      const SAND      = [0.70, 0.55, 0.35];
      const SAND_DK   = [0.52, 0.40, 0.26];    // shaded dune
      const WATER     = [0.04, 0.06, 0.12];
      const FERRARI   = [0.85, 0.08, 0.10];
      const DARK      = [0.10, 0.10, 0.14];
      const DUSK      = [0.30, 0.16, 0.20];    // deep dusk masonry

      // ===================================================================
      // Flat far horizon: desert-sand dune band ringing the lap (golden sands
      // with varied height to read as distant dune formations).
      // Two bands instead of four: backdrop() + addBox count kept to ~80 total
      // so net geometry is well below the old 240-box version.
      // ===================================================================
      let cx = 0, cz = 0;
      for (let i = 0; i < n; i++) { cx += px[i]; cz += pz[i]; }
      cx /= n; cz /= n;
      let trad = 0;
      for (let i = 0; i < n; i++) trad = Math.max(trad, Math.hypot(px[i] - cx, pz[i] - cz));
      // Near dune crest band: organic rounded sand mounds (were flat rectangular
      // addBox slabs — hard boxy edges on the horizon). mountain() with the sand
      // colour in both zones + no snow gives smooth overlapping dune crests.
      {
        const ring = trad + 360;
        for (let i = 0; i < 36; i++) {
          const a = (i + 0.3) / 36 * 6.2832;
          const h = hash(i * 7 + 360), h2 = hash(i * 13 + 720);
          const mx = cx + Math.cos(a) * ring, mz = cz + Math.sin(a) * ring;
          const varH = 12 + h * 14 + (h2 - 0.5) * 6;
          mountain(mx, mz, pyMin, 300 + h * 200, varH,
                   { seg: 6, seed: i * 13 + 360, rough: 0.16, forest: SAND, rock: SAND, snowline: 2 });
        }
      }
      // Far dune backdrop — darker, hazier, fewer.
      {
        const ring = trad + 580;
        for (let i = 0; i < 28; i++) {
          const a = (i + 0.7) / 28 * 6.2832;
          const h = hash(i * 11 + 580);
          const mx = cx + Math.cos(a) * ring, mz = cz + Math.sin(a) * ring;
          const varH = 18 + h * 16;
          mountain(mx, mz, pyMin, 380 + h * 220, varH,
                   { seg: 6, seed: i * 17 + 580, rough: 0.18, forest: SAND_DK, rock: SAND_DK, snowline: 2 });
        }
      }

      // ===================================================================
      // Thin island skyline — sparse resort pockets only. Cull continuous
      // cityFront walls so dunes + Ferrari World red + Yas Hotel LEDs dominate
      // (open leisure island, not downtown strip). Marina sector left open
      // for hotel sightline (s≈0.52–0.74).
      // ===================================================================
      // Sparse resort pocket near Ferrari World approach (R) — short + spaced
      cityFront(0.12, 0.22, 1, 72, {
        minH: 10, maxH: 24, depth: 16, lit: true,
        palette: [[0.18, 0.20, 0.30], [0.22, 0.22, 0.32], [0.16, 0.18, 0.28]],
        windowCol: WIN_WARM, step: 55,
      });
      // Sparse inland pocket mid-lap (L) — kept short so dunes stay readable
      cityFront(0.36, 0.46, -1, 80, {
        minH: 10, maxH: 22, depth: 14, lit: true,
        palette: [[0.15, 0.17, 0.26], [0.18, 0.20, 0.28]],
        windowCol: WIN_EMI, step: 60,
      });
      // No cityFront opposite the marina or on the hotel approach — keeps the
      // yacht→hotel glow corridor and open island silhouette.

      // ===================================================================
      // Mid-depth resort backdrop — thinned to 8 slots, skipping marina + hotel
      // sectors so heroes read against dark sky / dunes.
      // ===================================================================
      {
        const slots = [0.04, 0.14, 0.24, 0.34, 0.44, 0.80, 0.92, 0.98];
        for (let i = 0; i < slots.length; i++) {
          const k = K(slots[i]);
          const side = (i % 2) ? 1 : -1;
          const h = hash(i * 17 + 3);
          const bh = 16 + h * 14;   // 16–30m — shorter than before
          const bw = 40 + h * 40;
          const col = i % 3 === 0 ? [0.14, 0.15, 0.20]
                    : i % 3 === 1 ? [0.16, 0.17, 0.22]
                                  : [0.12, 0.14, 0.19];
          backdrop(k, side, 110 + h * 40, [bw, bh, 26], col);
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
      grandstand(0.0, -1, 9, 90, [0.22, 0.23, 0.30], [0.30, 0.34, 0.46]);
      grandstand(0.02, -1, 9, 70, [0.22, 0.23, 0.30], [0.30, 0.34, 0.46]);
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
      // (dark pole + bright cap), alternating sides, with light pools below
      // ===================================================================
      for (let i = 0; i < 13; i++) {
        const side = (i % 2) ? 1 : -1;
        const tk = K(0.34 + i * 0.006);
        tower(tk, side, 16, 4, 34, { col: DARK, seg: 4, cap: true, capCol: FLOOD });
        // Primary light pool — bright oval disc on the ground under the mast
        const pa = anchor(tk, side, 16);
        addCyl(out, vadd(pa.c, pa.u, 0.1), 9, 0.25, POOL, 10, [pa.r, pa.u, pa.t]);
        // Softer halo ring around the pool
        addCyl(out, vadd(pa.c, pa.u, 0.05), 16, 0.12, POOL_SOFT, 10, [pa.r, pa.u, pa.t]);
      }
      // Extra floodlights ringing pit straight for night look — with pools
      for (let i = 0; i < 6; i++) {
        const tk = K(0.0 + i * 0.012);
        tower(tk, -1, 20, 4, 36, { col: DARK, seg: 4, cap: true, capCol: FLOOD });
        const pa = anchor(tk, -1, 20);
        addCyl(out, vadd(pa.c, pa.u, 0.1), 10, 0.25, POOL, 10, [pa.r, pa.u, pa.t]);
        addCyl(out, vadd(pa.c, pa.u, 0.05), 18, 0.12, POOL_SOFT, 10, [pa.r, pa.u, pa.t]);
      }
      // Hairpin floodlights — both sides with pools
      for (const side of [-1, 1])
        for (let i = 0; i < 3; i++) {
          const tk = K(0.27 + i * 0.014);
          tower(tk, side, 18, 4, 34, { col: DARK, seg: 4, cap: true, capCol: FLOOD });
          const pa = anchor(tk, side, 18);
          addCyl(out, vadd(pa.c, pa.u, 0.1), 9, 0.25, POOL, 10, [pa.r, pa.u, pa.t]);
        }

      // ===================================================================
      // s 0.42 L — banked Turn 9: runoff + grandstand boxes
      // ===================================================================
      grandstand(0.42, -1, 9, 80, [0.20, 0.21, 0.28], [0.30, 0.34, 0.46]);
      place(K(0.42), -1, 32, [60, 0.4, 30], [0.20, 0.21, 0.22]);   // pale runoff apron

      // ===================================================================
      // s 0.52–0.74 R — MARINA CORRIDOR: continuous dark water basin, yacht
      // hierarchy (mega + mid + slim), warm dock lamps, hotel glow sightline.
      // ===================================================================
      // Continuous overlapping water ribbon (basin, not scattered ponds)
      for (let i = 0; i < 18; i++)
        groundPlane(K(0.52 + i * 0.013), 1, 16, [170, 1.2, 130], WATER);
      // Outer water shelf for depth
      for (let i = 0; i < 10; i++)
        groundPlane(K(0.53 + i * 0.022), 1, 48, [100, 1.0, 90], WATER);

      // Yacht hierarchy — fewer, clearer sizes (slim → mid → mega at 0.66)
      for (let i = 0; i < 14; i++) {
        const k = K(0.53 + (i % 10) * 0.020);
        const a = anchor(k, 1, 24 + (i % 3) * 12);
        const off = ((i % 5) - 2) * 10.0;
        const hc = vadd(a.c, a.t, off);
        const big = (i % 7 === 0) ? 1.35 : (i % 3 === 1 ? 1.1 : 0.85);
        addBox(out, vadd(hc, a.u, 1.1 * big), [4.2 * big, 2.2 * big, 11 * big], [0.94, 0.95, 0.96], [a.r, a.u, a.t]);
        addCyl(out, vadd(hc, a.u, 8.0 * big), 0.18, 11 * big, [0.86, 0.88, 0.92], 4, [a.r, a.u, a.t]);
        addBox(out, vadd(hc, a.u, 0.4), [4.6 * big, 0.35, 11.5 * big], [1.0, 0.85, 0.50], [a.r, a.u, a.t]);
        if (big > 1.2)
          addBox(out, vadd(hc, a.u, 2.3 * big), [2.2 * big, 1.3 * big, 4.2 * big], [0.82, 0.84, 0.90], [a.r, a.u, a.t]);
      }
      // Mooring posts
      for (let i = 0; i < 8; i++) {
        const k = K(0.54 + i * 0.028);
        const a = anchor(k, 1, 30 + (i % 2) * 8);
        addCyl(out, a.c, 0.35, 3.2, [0.72, 0.54, 0.28], 6, [a.r, a.u, a.t]);
        addBox(out, vadd(a.c, a.u, 3.5), [1.6, 0.8, 1.6], [0.85, 0.22, 0.12], [a.r, a.u, a.t]);
      }

      // ===================================================================
      // s 0.62 R mid — MARINA HOTEL cluster (sightline target from yacht basin)
      // ===================================================================
      building(K(0.62), 1, 28, 48, 52, 28, { wall: [0.20, 0.22, 0.30], lit: true, windowCol: WIN_EMI, floor: 6 });
      building(K(0.60), 1, 34, 30, 32, 22, { wall: [0.18, 0.20, 0.28], lit: true, windowCol: WIN_WARM, floor: 5 });
      building(K(0.64), 1, 34, 30, 36, 22, { wall: [0.18, 0.20, 0.28], lit: true, windowCol: WIN_EMI, floor: 5 });
      {
        const aH = anchor(K(0.62), 1, 28 + 24);
        addBox(out, vadd(aH.c, aH.u, 54), [50, 7, 30], WIN_EMI, [aH.r, aH.u, aH.t]);
      }
      {
        const aW1 = anchor(K(0.60), 1, 34 + 15);
        addBox(out, vadd(aW1.c, aW1.u, 34), [32, 5, 24], WIN_WARM, [aW1.r, aW1.u, aW1.t]);
        const aW2 = anchor(K(0.64), 1, 34 + 15);
        addBox(out, vadd(aW2.c, aW2.u, 38), [32, 5, 24], WIN_EMI, [aW2.r, aW2.u, aW2.t]);
      }
      place(K(0.62), 1, 56, [52, 4.0, 8], [1.0, 0.82, 0.46]);
      place(K(0.60), 1, 50, [32, 3.2, 7], [0.98, 0.78, 0.44]);
      place(K(0.64), 1, 50, [32, 3.2, 7], [0.98, 0.78, 0.44]);

      // ===================================================================
      // s 0.70 R near — marina-side grandstand + amber dock-lamp row
      // ===================================================================
      grandstand(0.69, 1, 14, 35, [0.20, 0.21, 0.28], [0.30, 0.34, 0.46]);
      grandstand(0.72, 1, 14, 35, [0.20, 0.21, 0.28], [0.30, 0.34, 0.46]);
      for (let i = 0; i < 12; i++) {
        const lampK = K(0.68 + i * 0.004);
        const a = anchor(lampK, 1, 11);
        addCyl(out, a.c, 0.14, 5.5, [0.28, 0.24, 0.17], 4, [a.r, a.u, a.t]);
        addBox(out, vadd(a.c, a.u, 5.5), [1.4, 1.2, 1.4], WARM, [a.r, a.u, a.t]);
        addCyl(out, vadd(a.c, a.u, 0.08), 3.5, 0.15, [0.96, 0.82, 0.44], 8, [a.r, a.u, a.t]);
      }

      // Water reflection streaks + dock glow (hotel approach reads from basin)
      for (let i = 0; i < 8; i++) {
        const ak = anchor(K(0.53 + i * 0.028), 1, 22 + (i % 3) * 6);
        addBox(out, vadd(ak.c, ak.u, -0.2), [56, 0.35, 2.5], [1.0, 0.86, 0.44], [ak.r, ak.u, ak.t]);
        addBox(out, vadd(ak.c, ak.u, -0.5), [56, 0.30, 2.5], [0.45, 0.62, 0.84], [ak.r, ak.u, ak.t]);
      }

      // ===================================================================
      // s 0.78 L — MARSA swept curve: long gentle grandstand chain, cool kerbs
      // ===================================================================
      grandstand(0.78, -1, 8, 100, [0.20, 0.21, 0.28], [0.30, 0.34, 0.46]);
      grandstand(0.80, -1, 8, 70, [0.20, 0.21, 0.28], [0.30, 0.34, 0.46]);

      // ===================================================================
      // s 0.88 OVER — W YAS HOTEL (hero): twin towers + continuous LED gridshell
      // veil + monocoque bridge deck. Clear drive-under (elevation dip −4 m
      // already at s≈0.88). Towers sit well off the verge; lattice/bridge span.
      // ===================================================================
      {
        const k = K(0.88);
        const H = 100;
        // Flanking twin towers — far enough out that podium never clips tarmac
        for (const side of [-1, 1]) {
          const a = anchor(k, side, 30);
          const b = [a.r, a.u, a.t];
          out._mat = MAT.GLASS;
          addFrustum(out, a.c, 18, 14, H, [0.10, 0.11, 0.16], 8, b);
          addBox(out, vadd(a.c, a.u, 5), [26, 10, 34], [0.08, 0.09, 0.13], b);
          out._mat = 0;
          addBox(out, vadd(a.c, a.u, 1.2), [28, 2.8, 36], [1.0, 0.80, 0.44], b);
          addCyl(out, vadd(a.c, a.u, 0.12), 14, 0.22, POOL, 10, b);
          out._mat = MAT.GLASS;
          for (let fl = 0; fl < 5; fl++) {
            const fy = 16 + fl * 15;
            addBox(out, vadd(a.c, a.u, fy), [24, 3.5, 32], (fl % 2 === 0) ? WIN_EMI : WIN_WARM, b);
          }
          out._mat = 0;
          // Sparse wrap LED bands (gridshell is the primary veil — cut face spam)
          out._mat = MAT.METAL;
          for (let gy = 0; gy < 6; gy++) {
            const cc = vadd(a.c, a.u, 18 + gy * 12);
            const col = LED_CYCLE[(gy + (side > 0 ? 1 : 0)) % 3];
            addBox(out, vadd(cc, a.r, -side * 12), [0.7, 4.0, 8.0], col, b);
          }
          out._mat = 0;
          addBox(out, vadd(a.c, a.u, H + 2), [16, 3.5, 20], [1.0, 0.98, 0.88], b);
          addBox(out, vadd(a.c, a.u, H + 5.5), [4, 5, 4], LED_MAG, b);
          addBox(out, vadd(a.c, a.u, H - 1.5), [28, 1.5, 38], [1.0, 0.88, 0.38], b);
        }

        // Continuous LED gridshell spanning the racing line (centreline base)
        const basis = (() => {
          const a = anchor(k, 1, 0);
          return [a.r, a.u, a.t];
        })();
        const shellC = [px[k], py[k], pz[k]];
        if (typeof gridshellCanopy === "function") {
          // w large enough that corner feet sit beyond hw (~8 m) + clearance
          gridshellCanopy(shellC, basis, {
            w: 56, depth: 40, h: 34, cols: 9, rows: 6,
            ledCols: LED_CYCLE, strutCol: [0.06, 0.07, 0.10],
          });
          // Second shallower veil slightly ahead — reads as continuous shell
          const k2 = K(0.875);
          const a2 = anchor(k2, 1, 0);
          gridshellCanopy([px[k2], py[k2], pz[k2]], [a2.r, a2.u, a2.t], {
            w: 52, depth: 28, h: 30, cols: 7, rows: 5,
            ledCols: [LED_MAG, LED_TEAL, LED_AMBER], strutCol: [0.06, 0.07, 0.10],
          });
        } else {
          // TODO(shared): use gridshellCanopy — inline arch fallback
          for (const side of [-1, 1]) {
            const a = anchor(k, side, 18);
            out._mat = MAT.METAL;
            for (let band = -1; band <= 1; band++) {
              let prevPt = null;
              for (let j = 0; j <= 8; j++) {
                const t = j / 8;
                const dist = 18 - t * 12;
                const ap = anchor(k, side, dist);
                const lift = 28 + Math.sin(t * Math.PI) * 26;
                const c = vadd(vadd(ap.c, ap.u, lift), ap.t, band * 8);
                const col = (j >= 3 && j <= 5) ? FLOOD : LED_CYCLE[(j + band + 3) % 3];
                addBox(out, c, [3.5, 1.8, 3.0], col, [ap.r, ap.u, ap.t]);
                if (prevPt) {
                  const mid = [(prevPt[0] + c[0]) / 2, (prevPt[1] + c[1]) / 2, (prevPt[2] + c[2]) / 2];
                  addBox(out, mid, [3.0, 0.8, 1.2], [0.06, 0.07, 0.10], [ap.r, ap.u, ap.t]);
                }
                prevPt = c;
              }
            }
            out._mat = 0;
          }
        }

        // Monocoque bridge deck — clear drive-under soffit over the racing line
        if (typeof underpassPortal === "function") {
          underpassPortal(0.88, {
            h: 9.5, thick: 2.4, depth: 32, pierGap: 2.2, pierW: 2.0,
            col: [0.08, 0.09, 0.12],
          });
          underpassPortal(0.875, {
            h: 9.2, thick: 1.8, depth: 22, pierGap: 2.2, pierW: 1.8,
            col: [0.10, 0.11, 0.14],
          });
        } else {
          // TODO(shared): use underpassPortal — RAW span via wide place is unsafe;
          // leave elevation dip alone as the underpass cue.
        }

        // Reflecting pool at hotel base (R, clear of racing line)
        groundPlane(K(0.87), 1, 18, [70, 1.2, 55], WATER);
        // Hotel dock lights
        for (let i = 0; i < 7; i++) {
          const dockK = K(0.86 + i * 0.003);
          const da = anchor(dockK, 1, 10);
          addBox(out, vadd(da.c, da.u, 0.4), [2.4, 0.6, 2.4], LED_AMBER, [da.r, da.u, da.t]);
          addCyl(out, vadd(da.c, da.u, 0.08), 2.8, 0.12, [0.98, 0.88, 0.50], 7, [da.r, da.u, da.t]);
        }
      }

      // ===================================================================
      // s 0.95 both — final left-right: barriers funnel back, lit billboards
      // ===================================================================
      billboard(K(0.95), 1, 9, 16, 10, LED_MAG);
      billboard(K(0.95), -1, 9, 16, 10, LED_TEAL);
      grandstand(0.96, -1, 8, 80, [0.22, 0.23, 0.30], [0.30, 0.34, 0.46]);

      // extra grandstands ringing T1/T5/T9/T11 (makes the seating bowl complete)
      grandstand(0.08, -1, 8, 70, [0.20, 0.21, 0.28], [0.30, 0.34, 0.46]);
      grandstand(0.10, -1, 8, 60, [0.22, 0.23, 0.30], [0.30, 0.34, 0.46]);
      grandstand(0.22, -1, 8, 80, [0.20, 0.21, 0.28], [0.30, 0.34, 0.46]);
      grandstand(0.36, 1, 8, 60, [0.22, 0.23, 0.30], [0.30, 0.34, 0.46]);
      grandstand(0.48, -1, 8, 60, [0.20, 0.21, 0.28], [0.30, 0.34, 0.46]);
      grandstand(0.56, 1, 8, 70, [0.22, 0.23, 0.30], [0.30, 0.34, 0.46]);
      grandstand(0.83, -1, 8, 60, [0.20, 0.21, 0.28], [0.30, 0.34, 0.46]);
      grandstand(0.92, -1, 8, 60, [0.22, 0.23, 0.30], [0.30, 0.34, 0.46]);

      // Second hotel group at s 0.44 R (Radisson / Abu Dhabi circuit area)
      // Using lit:true for proper night window glow
      building(K(0.44), 1, 36, 42, 48, 28, { wall: [0.18, 0.20, 0.28], lit: true, windowCol: WIN_EMI, floor: 6 });
      building(K(0.45), 1, 37, 28, 34, 20, { wall: [0.16, 0.18, 0.26], lit: true, windowCol: WIN_WARM, floor: 5 });
      building(K(0.43), 1, 42, 32, 28, 22, { wall: [0.15, 0.17, 0.24], lit: true, windowCol: WIN_EMI, floor: 5 });
      place(K(0.44), 1, 30, [46, 3.2, 8], [1.0, 0.84, 0.48]);
      // Lit crown highlights on Radisson towers
      {
        const rA = anchor(K(0.44), 1, 36 + 21);
        addBox(out, vadd(rA.c, rA.u, 50), [44, 7, 30], WIN_WARM, [rA.r, rA.u, rA.t]);
      }

      // More light towers along S2 sector + marina — each with a light pool
      for (let i = 0; i < 8; i++) {
        const side = (i % 2) ? 1 : -1;
        const tk = K(0.42 + i * 0.007);
        tower(tk, side, 18, 4, 32, { col: DARK, seg: 4, cap: true, capCol: FLOOD });
        const pa = anchor(tk, side, 18);
        addCyl(out, vadd(pa.c, pa.u, 0.1), 8, 0.25, POOL, 10, [pa.r, pa.u, pa.t]);
        addCyl(out, vadd(pa.c, pa.u, 0.04), 14, 0.10, POOL_SOFT, 10, [pa.r, pa.u, pa.t]);
      }
      for (let i = 0; i < 6; i++) {
        const tk = K(0.56 + i * 0.008);
        tower(tk, 1, 16, 4, 30, { col: DARK, seg: 4, cap: true, capCol: FLOOD });
        const pa = anchor(tk, 1, 16);
        addCyl(out, vadd(pa.c, pa.u, 0.1), 8, 0.25, POOL, 10, [pa.r, pa.u, pa.t]);
      }

      // Additional slim yachts on the outer marina shelf (hierarchy: mega at 0.66
      // is the hero; these fill the far basin without cluttering the sightline)
      for (let i = 0; i < 8; i++) {
        const k = K(0.58 + (i % 6) * 0.024);
        const a = anchor(k, 1, 42 + (i % 2) * 12);
        const off = ((i % 4) - 1.5) * 9;
        const hc = vadd(a.c, a.t, off);
        addBox(out, vadd(hc, a.u, 1.0), [3.2, 1.8, 8], [0.90, 0.91, 0.93], [a.r, a.u, a.t]);
        addCyl(out, vadd(hc, a.u, 6.5), 0.14, 9, [0.84, 0.85, 0.88], 4, [a.r, a.u, a.t]);
        addBox(out, vadd(hc, a.u, 0.3), [3.6, 0.25, 8.5], LED_AMBER, [a.r, a.u, a.t]);
      }

      // ===================================================================
      // PALMS — using forestEdge() for sections near barriers so canopies
      // never clip through fence/wall geometry.
      // Bare palm() calls only where dist is safely large (20m+).
      // ===================================================================
      // Marina-facing palm avenue: forestEdge() handles barrier-safe placement.
      // gap=20 keeps canopy inner edge well clear of any barrier at ~4-5m.
      forestEdge(0.50, 0.74, 1, 20, {
        density: 0.45, hMin: 7, hMax: 11,
        col: [0.25, 0.55, 0.20], col2: [0.28, 0.57, 0.22],
        pineFrac: 0.0,  // all palms (broadleaf trees look like palms at distance)
      });
      // Marsa curve palms — forestEdge, left side
      forestEdge(0.78, 0.87, -1, 14, {
        density: 0.50, hMin: 9, hMax: 14,
        col: [0.27, 0.57, 0.22], col2: [0.24, 0.52, 0.18],
        pineFrac: 0.0,
      });
      // pit straight palms at safe distance (20m+) — no clipping risk
      for (let i = 0; i < 14; i++) {
        const side = (i % 2) ? 1 : -1;
        palm(K(0.0 + i * 0.010), side, 20 + hash(i * 9) * 6, 9 + hash(i * 7) * 2, [0.26, 0.56, 0.21]);
      }
      // pit-entry chicane palms at safe distance
      for (let i = 0; i < 12; i++) {
        const side = (i % 2) ? 1 : -1;
        palm(K(0.92 + i * 0.007), side, 20 + hash(i * 7) * 6, 8 + hash(i * 5) * 2, [0.26, 0.55, 0.20]);
      }
      // Palm avenue far side (well back from track)
      for (let i = 0; i < 18; i++) {
        const s = 0.0 + (i / 18) * 0.15;
        palm(K(s), (i % 2) ? 1 : -1, 22 + hash(i * 17) * 12, 11 + hash(i * 7) * 3, [0.25, 0.55, 0.20]);
      }
      for (let i = 0; i < 14; i++) {
        const s = 0.85 + (i / 14) * 0.12;
        palm(K(s), (i % 2) ? 1 : -1, 22 + hash(i * 23) * 12, 11 + hash(i * 11) * 3, [0.25, 0.55, 0.20]);
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
        // team motorhome row (modern two-storey lit hospitality units) — was 3
        // stacked raw boxes per unit; now the purpose-built motorhome() model
        // (slide-out awning, window ribbon, livery accent stripe).
        for (let i = 0; i < 10; i++) {
          const k = K(0.985 + i * 0.010);
          const wc = (i % 2) ? WIN : WIN_WARM;
          motorhome(k, 1, 36, 14, 8.5, 17, { window: wc, wall: [0.86, 0.87, 0.90],
            accent: (i % 2) ? [0.75, 0.10, 0.10] : [0.10, 0.30, 0.72] });
        }
        // pit-lane back wall + garage roof line (more prominent)
        for (let i = 0; i < 7; i++) {
          place(K(0.0 + i * 0.011), 1, 22, [11, 9, 30], [0.24, 0.25, 0.30]);
          place(K(0.0 + i * 0.011), 1, 22, [11.4, 1.4, 30.4], [1.0, 0.95, 0.80]); // roof fascia glow
        }
        // Paddock floodlight masts — taller, with large light pools below
        for (let i = 0; i < 7; i++) {
          const tk = K(0.99 + i * 0.010);
          tower(tk, 1, 50, 5, 32, { col: DARK, seg: 4, cap: true, capCol: FLOOD });
          const pa = anchor(tk, 1, 50);
          addCyl(out, vadd(pa.c, pa.u, 0.1), 12, 0.30, POOL, 12, [pa.r, pa.u, pa.t]);
          addCyl(out, vadd(pa.c, pa.u, 0.04), 22, 0.12, POOL_SOFT, 12, [pa.r, pa.u, pa.t]);
        }
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
      // Emissive observation deck + ground light pool at base
      // ===================================================================
      {
        const k = K(0.28);
        const a = anchor(k, 1, 36);
        out._mat = MAT.CONCRETE;
        addFrustum(out, a.c, 14, 9, 40, [0.12, 0.13, 0.18], 10, [a.r, a.u, a.t]);
        out._mat = MAT.GLASS;
        // Glazed observation deck — bright emissive lit glass at night
        addBox(out, vadd(a.c, a.u, 22), [30, 8, 12], WIN_EMI, [a.r, a.u, a.t]);
        out._mat = 0;
        // Lit crown beacon
        addBox(out, vadd(a.c, a.u, 42), [10, 5, 10], FLOOD, [a.r, a.u, a.t]);
        addBox(out, vadd(a.c, a.u, 47), [4, 4, 4], LED_TEAL, [a.r, a.u, a.t]);
        // Ground light pool at tower base
        addCyl(out, vadd(a.c, a.u, 0.10), 14, 0.20, POOL_SOFT, 10, [a.r, a.u, a.t]);
      }

      // ===================================================================
      // GRANDSTAND VIDEO WALLS — mounted flush on grandstand back wall,
      // not floating in air. Screen at a sensible height (6m) so it reads
      // as attached to the stand structure.
      // ===================================================================
      for (const [s, side] of [[0.0, -1], [0.28, -1], [0.28, 1], [0.70, 1], [0.78, -1]]) {
        const a = anchor(K(s), side, 18);
        // Screen frame — sits atop the grandstand at ~8m height
        addBox(out, vadd(a.c, a.u, 8), [20, 10, 1.5], WIN_EMI, [a.r, a.u, a.t]);
        // Bright screen face
        addBox(out, vadd(vadd(a.c, a.u, 8), a.r, side * 0.8), [17, 8, 0.8], LED_TEAL, [a.r, a.u, a.t]);
      }

      // ===================================================================
      // ISLAND LANDSCAPING — hedges + shrubs
      // Hedges kept at generous gap (12m+) so they don't clip barriers.
      // ===================================================================
      hedge(0.10, 0.18, -1, 12, 2.2, [0.16, 0.22, 0.14]);
      hedge(0.62, 0.74, 1, 13, 2.2, [0.16, 0.22, 0.14]);
      // low shrub clusters at safe distances
      for (let i = 0; i < 16; i++) {
        const s = i / 16;
        bush(K(s), (i % 2) ? 1 : -1, 12 + hash(i * 13) * 6, [0.15, 0.21, 0.13]);
      }
      // palm clusters at corner apex (strategic placement, safe distance)
      for (const s of [0.05, 0.18, 0.42, 0.55, 0.78, 0.95]) {
        for (let j = 0; j < 3; j++)
          palm(K(s + j * 0.005), (s < 0.5) ? -1 : 1, 18 + j * 2.5, 7 + hash(j * 3) * 4, [0.26, 0.56, 0.21]);
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
        // white luxury pavilion tents (A-frame)
        out._mat = MAT.FABRIC;
        for (let i = 0; i < 7; i++) {
          const ak = anchor(K(0.56 + i * 0.020), 1, 19);
          addPrism(out, vadd(ak.c, ak.u, 3.5), [7, 4.8, 9], [0.96, 0.96, 0.98], [ak.r, ak.u, ak.t]);
          // tent lighting
          addBox(out, vadd(ak.c, ak.u, 2), [7.2, 0.8, 9.2], [1.0, 0.88, 0.60], [ak.r, ak.u, ak.t]);
        }
        out._mat = MAT.WOOD;
        // jetty fingers reaching into water
        for (let i = 0; i < 5; i++) {
          const jk = anchor(K(0.55 + i * 0.022), 1, 13);
          // jetty deck
          addBox(out, vadd(jk.c, jk.t, 0), [2.4, 0.6, 28], [0.32, 0.30, 0.28], [jk.r, jk.u, jk.t]);
          // jetty accent lighting
          addBox(out, vadd(jk.c, jk.t, 0), [1.2, 0.4, 28.2], [0.95, 0.82, 0.55], [jk.r, jk.u, jk.t]);
        }
        out._mat = 0;
      }

      // ---- Desert ridge backdrop: track-relative backdrop() calls replace
      // the raw polar-angle box loop (was 96 addBox). backdrop() is track-aligned
      // so the large face always runs parallel to the road — prevents thin edges
      // cutting across the view. Two passes: mid-field ridge + far hazy horizon.
      // ----
      {
        // Mid-field low ridges — skip marina corridor (0.52–0.74) so water + hotel glow read
        const midSlots = [0.04, 0.12, 0.20, 0.28, 0.36, 0.44,
                          0.78, 0.86, 0.94];
        for (let i = 0; i < midSlots.length; i++) {
          const k = K(midSlots[i]);
          const side = (i % 2) ? 1 : -1;
          const h = hash(i * 11 + 250);
          const ridgeH = 10 + h * 10;
          const ridgeW = 220 + h * 120;
          backdrop(k, side, 200 + h * 80, [ridgeW, ridgeH, 100], [0.64, 0.52, 0.36]);
        }
        // Far hazy dune horizon
        const farSlots = [0.06, 0.18, 0.30, 0.42, 0.80, 0.92];
        for (let i = 0; i < farSlots.length; i++) {
          const k = K(farSlots[i]);
          const side = (i % 2) ? 1 : -1;
          const h = hash(i * 13 + 430);
          const ridgeH = 14 + h * 12;
          const ridgeW = 280 + h * 160;
          backdrop(k, side, 340 + h * 100, [ridgeW, ridgeH, 120], [0.50, 0.40, 0.26]);
        }
      }

      // ===================================================================
      // BESPOKE YAS-ISLAND LEISURE LANDMARKS — Formula Rossa coaster loop at
      // Ferrari World, the Etihad Arena dome, and an observation wheel. These
      // give the entertainment-island skyline its unmistakable silhouette.
      // ===================================================================

      // ── Formula Rossa coaster — red vertical loop + launch ramp ──────────
      // Built as a ring of red track segments in the vertical (lateral–up)
      // plane, fed by a rising launch ramp on support pylons. Sits between the
      // track and the Ferrari World roof mass (s 0.18 R).
      const coasterLoop = (k, side, gap) => {
        const a = anchor(k, side, gap), b = [a.r, a.u, a.t];
        out._mat = MAT.METAL;
        const R = 24, base = vadd(a.c, a.u, 2);
        let prev = null;
        for (let i = 0; i <= 26; i++) {
          const th = i / 26 * Math.PI * 2;
          const p = vadd(vadd(base, a.r, Math.sin(th) * R), a.u, R - Math.cos(th) * R);
          if (prev) {
            const mid = [(prev[0] + p[0]) / 2, (prev[1] + p[1]) / 2, (prev[2] + p[2]) / 2];
            addBox(out, mid, [1.3, 1.5, 1.6], FERRARI, b);
          }
          prev = p;
        }
        // rising launch ramp feeding the loop
        for (let i = 0; i < 12; i++) {
          const t = i / 11;
          const c = vadd(vadd(base, a.t, -34 + t * 28), a.u, t * t * 22);
          addBox(out, c, [1.5, 1.3, 3.2], FERRARI, b);
          if (i % 3 === 0) addCyl(out, [c[0], (a.c[1] + c[1]) / 2, c[2]], 0.45, c[1] - a.c[1], [0.70, 0.70, 0.72], 5, b);
        }
        // loop support columns
        for (const dz of [-R * 0.5, R * 0.5])
          addCyl(out, vadd(vadd(a.c, a.t, dz), a.u, R), 0.6, R * 2, [0.70, 0.70, 0.72], 6, b);
        out._mat = 0;
      };
      coasterLoop(K(0.185), 1, 58);

      // ── Etihad Arena — low domed entertainment arena ────────────────────
      const arena = (k, side, gap) => {
        const a = anchor(k, side, gap), b = [a.r, a.u, a.t];
        out._mat = MAT.METAL;
        addFrustum(out, a.c, 34, 30, 14, [0.20, 0.22, 0.30], 16, b);                     // drum
        out._mat = MAT.GLASS;
        addBox(out, vadd(a.c, a.u, 6), [70, 3, 62], WIN_WARM, b);                        // lit facade band
        out._mat = MAT.METAL;
        addFrustum(out, vadd(a.c, a.u, 14), 30, 11, 10, [0.24, 0.26, 0.34], 16, b);      // dome shoulder
        addCone(out, vadd(a.c, a.u, 24), 12, 6, [0.26, 0.28, 0.36], 16, b);              // dome cap
        out._mat = 0;
        addBox(out, vadd(a.c, a.u, 30), [3, 3, 3], LED_TEAL, b);                         // beacon
      };
      arena(K(0.50), -1, 110);

      // ── Observation wheel — Yas leisure-district landmark (one only; second
      // wheel at marina cluttered the hotel sightline)
      ferrisWheel(K(0.20), 1, 150, 34);
    },
  }
  );
})();
