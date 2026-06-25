/* Apex 26 — ABU DHABI circuit definition (data only).
   Registered on the global TrackDefs list; consumed by the js/tracks.js engine
   (palette resolved there from `night`, geometry from js/circuits.js or `segs`). */
(function () {
  "use strict";
  (window.TrackDefs = window.TrackDefs || []).push(
  {
    id: "abudhabi",
    reverse: true,  // GPS trace is backwards vs real racing direction (auto-audit)
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
      const { out, n, px, pz, pyMin, place, prop, groundPlane, addBox,
        anchor, onTrack, hash, vadd, building, tower, grandstand, billboard,
        gantry, palm, bush, hedge, addCyl, addCone, addFrustum, addPrism,
        fence, guardrail, tyreWall, marshalPost, wall, along,
        cityFront, forestEdge, backdrop } = api;
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
      // Near dune crest band: wide shallow ridges that read as rolling sand dunes
      {
        const ring = trad + 360;
        for (let i = 0; i < 36; i++) {
          const a = (i + 0.3) / 36 * 6.2832;
          const h = hash(i * 7 + 360);
          const h2 = hash(i * 13 + 720);
          const mx = cx + Math.cos(a) * ring, mz = cz + Math.sin(a) * ring;
          const varH = 12 + h * 14 + (h2 - 0.5) * 6;
          // Wide flat dune ridges: large sz[0] (along horizon), modest height
          addBox(out, [mx, pyMin + varH / 2, mz], [320 + h * 200, varH, 200], SAND);
        }
      }
      // Far dune backdrop — darker, hazier, fewer items
      {
        const ring = trad + 580;
        for (let i = 0; i < 28; i++) {
          const a = (i + 0.7) / 28 * 6.2832;
          const h = hash(i * 11 + 580);
          const mx = cx + Math.cos(a) * ring, mz = cz + Math.sin(a) * ring;
          const varH = 18 + h * 16;
          addBox(out, [mx, pyMin + varH / 2, mz], [400 + h * 200, varH, 240], SAND_DK);
        }
      }

      // ===================================================================
      // Yas Island skyline: cityFront() street-wall facades with lit windows
      // Wrap the far side of the circuit in a continuous resort/hotel streetscape.
      // Using cityFront() instead of scattered ring-boxes so buildings are ALIGNED,
      // CONTINUOUS, and properly lit for night/dusk legibility.
      // ===================================================================
      // Main Yas island hotel/resort strip — far right of the pit straight
      cityFront(0.15, 0.35, 1, 55, {
        minH: 22, maxH: 58, depth: 26, lit: true,
        palette: [[0.18, 0.20, 0.30], [0.22, 0.22, 0.32], [0.16, 0.18, 0.28], [0.20, 0.24, 0.34]],
        windowCol: WIN_WARM, step: 24,
      });
      // Marina/resort strip along the back section — left side
      cityFront(0.35, 0.55, -1, 52, {
        minH: 18, maxH: 44, depth: 22, lit: true,
        palette: [[0.15, 0.17, 0.26], [0.18, 0.20, 0.28], [0.20, 0.22, 0.30]],
        windowCol: WIN_EMI, step: 22,
      });
      // Yas island east side — opposite the marina
      cityFront(0.56, 0.76, -1, 50, {
        minH: 16, maxH: 42, depth: 22, lit: true,
        palette: [[0.14, 0.16, 0.24], [0.18, 0.19, 0.27], [0.16, 0.18, 0.26]],
        windowCol: WIN_WARM, step: 20,
      });
      // Final sector resort/hotel strip (approach to hotel)
      cityFront(0.76, 0.88, 1, 54, {
        minH: 20, maxH: 52, depth: 24, lit: true,
        palette: [[0.17, 0.19, 0.27], [0.20, 0.21, 0.30], [0.22, 0.22, 0.32]],
        windowCol: WIN_EMI, step: 22,
      });

      // ===================================================================
      // Mid-depth resort backdrop: use backdrop() at track nodes so buildings
      // are track-aligned and properly lit. backdrop() auto-adds window bands
      // for tall boxes and lifts night walls off black — replacing the raw
      // polar-angle box loop (was 56 addBox calls) with 16 backdrop() calls.
      // ===================================================================
      {
        // Sample evenly around the lap — every ~6% gives 16 points
        const slots = [0.02, 0.08, 0.14, 0.20, 0.26, 0.32, 0.38, 0.44,
                       0.50, 0.58, 0.64, 0.70, 0.77, 0.82, 0.89, 0.94];
        for (let i = 0; i < slots.length; i++) {
          const k = K(slots[i]);
          const side = (i % 2) ? 1 : -1;
          const h = hash(i * 17 + 3);
          const bh = 24 + h * 22;   // 24–46m — tall enough for backdrop() window bands
          const bw = 50 + h * 60;   // wide facade unit
          const col = i % 3 === 0 ? [0.14, 0.15, 0.20]
                    : i % 3 === 1 ? [0.16, 0.17, 0.22]
                                  : [0.12, 0.14, 0.19];
          // dist 95–130m back: far enough to not clash with cityFront street wall
          backdrop(k, side, 95 + h * 35, [bw, bh, 30], col);
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
      // s 0.55 R mid — MARINA opens: dark water planes + yacht fleet
      // White hulls with masts + mooring posts.
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
      // mooring posts and buoys
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
      // warm base uplight, flanked by two shorter wings.
      // Emissive lit window highlights: bright overlay so glass reads lit at night.
      // Using lit:true on building() for proper window glow effect.
      // ===================================================================
      building(K(0.62), 1, 25, 54, 60, 32, { wall: [0.20, 0.22, 0.30], lit: true, windowCol: WIN_EMI, floor: 6 });
      building(K(0.60), 1, 30, 36, 36, 26, { wall: [0.18, 0.20, 0.28], lit: true, windowCol: WIN_WARM, floor: 5 });
      building(K(0.64), 1, 30, 36, 40, 26, { wall: [0.18, 0.20, 0.28], lit: true, windowCol: WIN_EMI, floor: 5 });
      // Bright crown caps — lit top floors glow against the night sky
      {
        const aH = anchor(K(0.62), 1, 25 + 27);   // dist = gap + w/2
        addBox(out, vadd(aH.c, aH.u, 62), [56, 8, 34], WIN_EMI, [aH.r, aH.u, aH.t]);
      }
      {
        const aW1 = anchor(K(0.60), 1, 30 + 18);
        addBox(out, vadd(aW1.c, aW1.u, 38), [38, 6, 28], WIN_WARM, [aW1.r, aW1.u, aW1.t]);
        const aW2 = anchor(K(0.64), 1, 30 + 18);
        addBox(out, vadd(aW2.c, aW2.u, 42), [38, 6, 28], WIN_EMI, [aW2.r, aW2.u, aW2.t]);
      }
      place(K(0.62), 1, 52, [58, 4.2, 9], [1.0, 0.82, 0.46]);   // prominent warm uplit base band
      place(K(0.60), 1, 46, [38, 3.5, 8], [0.98, 0.78, 0.44]);
      place(K(0.64), 1, 46, [38, 3.5, 8], [0.98, 0.78, 0.44]);

      // ===================================================================
      // s 0.70 R near — marina-side grandstand + amber dock-lamp row
      // Each post is anchored individually so they sit on the ground correctly.
      // Light pools on the quayside below each lamp.
      // ===================================================================
      grandstand(0.70, 1, 8, 80, [0.20, 0.21, 0.28], [0.30, 0.34, 0.46]);
      for (let i = 0; i < 10; i++) {
        // Space posts along the track using slightly different K values
        const lampK = K(0.68 + i * 0.004);
        const a = anchor(lampK, 1, 7);
        // Dark steel post
        addCyl(out, a.c, 0.14, 5.5, [0.28, 0.24, 0.17], 4, [a.r, a.u, a.t]);
        // Warm amber lantern head
        addBox(out, vadd(a.c, a.u, 5.5), [1.4, 1.2, 1.4], WARM, [a.r, a.u, a.t]);
        // Small warm light pool on the dock below
        addCyl(out, vadd(a.c, a.u, 0.08), 3.5, 0.15, [0.96, 0.82, 0.44], 8, [a.r, a.u, a.t]);
      }

      // ===================================================================
      // s 0.78 L — MARSA swept curve: long gentle grandstand chain, cool kerbs
      // ===================================================================
      grandstand(0.78, -1, 8, 100, [0.20, 0.21, 0.28], [0.30, 0.34, 0.46]);
      grandstand(0.80, -1, 8, 70, [0.20, 0.21, 0.28], [0.30, 0.34, 0.46]);

      // ===================================================================
      // s 0.88 OVER — W YAS HOTEL (hero): twin tall curved towers with sweeping
      // LED-lit lattice arch spanning the track. Night-race hero landmark.
      // The iconic Yas Viceroy hotel straddles the circuit with a glowing LED
      // grid-shell canopy — teal/magenta/amber LEDs, lit glass facades.
      // ===================================================================
      {
        const k = K(0.88);
        const H = 105;  // tower height
        // Flanking twin curved towers
        for (const side of [-1, 1]) {
          const a = anchor(k, side, 16);
          // Tapered tower core — dark glass
          addFrustum(out, a.c, 22, 16, H, [0.10, 0.11, 0.16], 8, [a.r, a.u, a.t]);
          // Dark glass podium base
          addBox(out, vadd(a.c, a.u, 6), [38, 12, 44], [0.08, 0.09, 0.13], [a.r, a.u, a.t]);
          // Warm uplit base band
          addBox(out, vadd(a.c, a.u, 1.4), [41, 3.2, 47], [1.0, 0.80, 0.44], [a.r, a.u, a.t]);
          // Plaza light pool under each tower — large glowing oval on the ground
          addCyl(out, vadd(a.c, a.u, 0.12), 18, 0.25, POOL, 12, [a.r, a.u, a.t]);
          addCyl(out, vadd(a.c, a.u, 0.06), 32, 0.10, POOL_SOFT, 12, [a.r, a.u, a.t]);
          // Emissive lit floors — bright window bands at several heights
          for (let fl = 0; fl < 6; fl++) {
            const fy = 14 + fl * 14;
            const col = (fl % 2 === 0) ? WIN_EMI : WIN_WARM;
            addBox(out, vadd(a.c, a.u, fy), [36, 4, 42], col, [a.r, a.u, a.t]);
          }
          // LED grid-shell facing the track — larger, brighter panels
          for (let gy = 0; gy < 10; gy++) for (let gx = 0; gx < 5; gx++) {
            const cc = vadd(vadd(a.c, a.u, 12 + gy * 7), a.t, (gx - 2) * 8.0);
            const col = LED_CYCLE[(gx + gy + k) % 3];
            addBox(out, vadd(cc, a.r, -side * 16.5), [0.8, 5.0, 6.0], col, [a.r, a.u, a.t]);
          }
          // Wrap-around LED band on the side face
          for (let gy = 0; gy < 10; gy++) {
            const cc = vadd(a.c, a.u, 12 + gy * 7);
            const col = LED_CYCLE[(gy + k + 1) % 3];
            addBox(out, vadd(cc, a.t, side * 21.0), [0.8, 5.0, 5.0], col, [a.r, a.u, a.t]);
          }
          // Crown cap (bright) + magenta beacon
          addBox(out, vadd(a.c, a.u, H + 2), [20, 4, 24], [1.0, 0.98, 0.88], [a.r, a.u, a.t]);
          addBox(out, vadd(a.c, a.u, H + 6), [5, 6, 5], LED_MAG, [a.r, a.u, a.t]);
          // Warm gold LED strip along roof line
          addBox(out, vadd(a.c, a.u, H - 1.5), [42, 1.8, 54], [1.0, 0.88, 0.38], [a.r, a.u, a.t]);
        }
        // SWEEPING CANOPY ARCH — the iconic LED gridshell spanning over the track.
        // Stronger glow: larger node boxes, bright mid-arch strip colour.
        for (const side of [-1, 1]) {
          const a = anchor(k, side, 16);
          for (let band = -2; band <= 2; band++) {
            const foff = band * 9.0;
            let prevPt = null;
            for (let j = 0; j <= 8; j++) {
              const t = j / 8;
              const dist = 16 - t * 11;                      // 16 → 5m off track edge
              const ap = anchor(k, side, dist);
              const lift = 26 + Math.sin(t * Math.PI) * 28;  // arc peak ~54m
              const c = vadd(vadd(ap.c, ap.u, lift), ap.t, foff);
              // Mid-arch (t≈0.5) gets extra bright white; shoulders get colour cycle
              const col = (j >= 3 && j <= 5) ? FLOOD : LED_CYCLE[((j + Math.round(band) + side) % 3 + 3) % 3];
              addBox(out, c, [4.0, 2.0, 3.5], col, [ap.r, ap.u, ap.t]);
              // Dark structural strut between nodes
              if (prevPt) {
                const mid = [(prevPt[0] + c[0]) / 2, (prevPt[1] + c[1]) / 2, (prevPt[2] + c[2]) / 2];
                addBox(out, mid, [3.5, 0.9, 1.4], [0.06, 0.07, 0.10], [ap.r, ap.u, ap.t]);
              }
              prevPt = c;
            }
          }
        }
        // Reflecting pool at hotel base
        groundPlane(K(0.87), 1, 12, [80, 1.2, 70], WATER);
        // Marina water light-reflection streaks (warm + cool)
        for (let i = 0; i < 6; i++) {
          const ak = anchor(K(0.53 + i * 0.035), 1, 22 + (i % 3) * 6);
          addBox(out, vadd(ak.c, ak.u, -0.2), [52, 0.35, 2.5], [1.0, 0.86, 0.44], [ak.r, ak.u, ak.t]);
          addBox(out, vadd(ak.c, ak.u, -0.5), [52, 0.30, 2.5], [0.45, 0.62, 0.84], [ak.r, ak.u, ak.t]);
        }
        // Hotel dock lights — each as a separate anchor so spacing reads naturally
        for (let i = 0; i < 7; i++) {
          const dockK = K(0.86 + i * 0.003);
          const da = anchor(dockK, 1, 9);
          addBox(out, vadd(da.c, da.u, 0.4), [2.4, 0.6, 2.4], LED_AMBER, [da.r, da.u, da.t]);
          addBox(out, vadd(da.c, da.u, -0.2), [2.6, 0.22, 2.6], [1.0, 0.84, 0.42], [da.r, da.u, da.t]);
          // tiny dock light pool
          addCyl(out, vadd(da.c, da.u, 0.08), 2.8, 0.12, [0.98, 0.88, 0.50], 7, [da.r, da.u, da.t]);
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
      // PALMS — using forestEdge() for sections near barriers so canopies
      // never clip through fence/wall geometry.
      // Bare palm() calls only where dist is safely large (20m+).
      // ===================================================================
      // Marina-facing palm avenue: forestEdge() handles barrier-safe placement.
      // gap=14 keeps canopy inner edge well clear of any barrier at ~4-5m.
      forestEdge(0.50, 0.74, 1, 14, {
        density: 0.55, hMin: 8, hMax: 13,
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
        addFrustum(out, a.c, 14, 9, 40, [0.12, 0.13, 0.18], 10, [a.r, a.u, a.t]);
        // Glazed observation deck — bright emissive lit glass at night
        addBox(out, vadd(a.c, a.u, 22), [30, 8, 12], WIN_EMI, [a.r, a.u, a.t]);
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
        for (let i = 0; i < 7; i++) {
          const ak = anchor(K(0.56 + i * 0.020), 1, 19);
          addPrism(out, vadd(ak.c, ak.u, 3.5), [7, 4.8, 9], [0.96, 0.96, 0.98], [ak.r, ak.u, ak.t]);
          // tent lighting
          addBox(out, vadd(ak.c, ak.u, 2), [7.2, 0.8, 9.2], [1.0, 0.88, 0.60], [ak.r, ak.u, ak.t]);
        }
        // jetty fingers reaching into water
        for (let i = 0; i < 5; i++) {
          const jk = anchor(K(0.55 + i * 0.022), 1, 13);
          // jetty deck
          addBox(out, vadd(jk.c, jk.t, 0), [2.4, 0.6, 28], [0.32, 0.30, 0.28], [jk.r, jk.u, jk.t]);
          // jetty accent lighting
          addBox(out, vadd(jk.c, jk.t, 0), [1.2, 0.4, 28.2], [0.95, 0.82, 0.55], [jk.r, jk.u, jk.t]);
        }
      }

      // ---- Desert ridge backdrop: track-relative backdrop() calls replace
      // the raw polar-angle box loop (was 96 addBox). backdrop() is track-aligned
      // so the large face always runs parallel to the road — prevents thin edges
      // cutting across the view. Two passes: mid-field ridge + far hazy horizon.
      // ----
      {
        // Mid-field low ridges (dist 200–280m) — warm ochre desert floor
        const midSlots = [0.04, 0.12, 0.20, 0.28, 0.36, 0.44,
                          0.52, 0.60, 0.68, 0.76, 0.84, 0.92];
        for (let i = 0; i < midSlots.length; i++) {
          const k = K(midSlots[i]);
          const side = (i % 2) ? 1 : -1;
          const h = hash(i * 11 + 250);
          const ridgeH = 10 + h * 10;
          const ridgeW = 220 + h * 120;
          backdrop(k, side, 200 + h * 80, [ridgeW, ridgeH, 100], [0.64, 0.52, 0.36]);
        }
        // Far hazy dune horizon (dist 340–440m) — muted dusty tones
        const farSlots = [0.06, 0.18, 0.30, 0.42, 0.54, 0.66, 0.78, 0.90];
        for (let i = 0; i < farSlots.length; i++) {
          const k = K(farSlots[i]);
          const side = (i % 2) ? 1 : -1;
          const h = hash(i * 13 + 430);
          const ridgeH = 14 + h * 12;
          const ridgeW = 280 + h * 160;
          backdrop(k, side, 340 + h * 100, [ridgeW, ridgeH, 120], [0.50, 0.40, 0.26]);
        }
      }
    },
  }
  );
})();
