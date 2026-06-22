/* Apex 26 — JEDDAH circuit definition (data only).
   Registered on the global TrackDefs list; consumed by the js/tracks.js engine
   (palette resolved there from `night`, geometry from js/circuits.js or `segs`). */
(function () {
  "use strict";
  (window.TrackDefs = window.TrackDefs || []).push(
  {
    id: "jeddah",
    name: "JEDDAH",
    gp: "Saudi Arabian GP",
    country: "Saudi Arabia",
    night: true,
    theme: "street_night",
    street: true,
    barrierGap: 0.6,
    lengthKm: 6.2,
    baseHW: 6,
    pal: { horizon: [0.10, 0.08, 0.16], zenith: [0.05, 0.05, 0.15], sunColor: [0.65, 0.68, 0.82], ambientSky: [0.22, 0.22, 0.32], ambientGround: [0.20, 0.18, 0.24], fogColor: [0.08, 0.08, 0.14], fogDensity: 0.0018, concrete: [0.28, 0.27, 0.26], runoff: [0.25, 0.24, 0.22], grass: [0.2, 0.18, 0.14] },
    segs: [
      { t: 0, l: 700 }, { t: -80, l: 70 }, { t: 75, l: 60 }, { t: 0, l: 120 }, { t: -70, l: 65 }, { t: 70, l: 60 },
      { t: 0, l: 300 }, { t: 90, l: 80 }, { t: 0, l: 600 }, { t: 90, l: 80 }, { t: -65, l: 70 }, { t: 70, l: 70 },
    ],
    // Jeddah Corniche: the circuit grades down from the sweeping first sector
    // then recovers along the seafront — real circuit has ~12 m total change.
    elevations: [{ s: 0.30, halfM: 480, rise: -8 }, { s: 0.62, halfM: 400, rise: 6 }],
    scenery: function (api) {
      const { out, n, pyMin, place, backdrop, groundPlane,
        addBox, addCyl, addCone, addPrism, anchor, vadd, building, tower, billboard,
        grandstand, gantry, marshalPost, fence, guardrail, tyreWall, palm,
        onTrack, hash, every, recordBarrier } = api;
      const K = (s) => Math.round(s * n) % n;

      // Night Corniche palette: refined for warm amber/cool LED contrast
      const SEA = [0.02, 0.04, 0.08];        // deep black mirror water
      const SPANGLE = [1.0, 0.80, 0.40];     // warm amber reflections + path lamps
      const LED = [0.92, 0.96, 1.0];         // cool-white LED glow
      const WINWARM = [1.0, 0.84, 0.48];     // warm interior windows
      const WINCOOL = [0.58, 0.82, 1.0];     // cool glass tower windows
      const WINGOLD = [1.0, 0.76, 0.28];     // deep sodium/tungsten glow
      const WINTEAL = [0.42, 0.96, 0.94];    // bright teal accent glass
      const GREEN = [0.10, 0.56, 0.24];      // Saudi-green wall stripe
      const MAGENTA = [0.96, 0.28, 0.64];    // neon magenta accent
      const BARRIER = [0.32, 0.32, 0.35];    // grey concrete barrier
      const DARKPOLE = [0.09, 0.09, 0.12];   // dark pole base

      // --- Continuous grey barrier wall (visual; physics handled by street circuit code) ---
      // Overlapping long boxes at 13m spacing to ensure no visible gaps in the wall,
      // while staying within vertex budget. Reflective impact strips every 16m for
      // night-race safety markers. Physics boundary registered at barrierGap (0.6m).
      for (const side of [-1, 1]) {
        recordBarrier(0.0, (n - 1) / n, side, 0.6);
        every(13, (k) => {
          const a = anchor(k, side, 0.6), b = [a.r, a.u, a.t];
          addBox(out, vadd(a.c, a.u, 0.65), [0.5, 1.3, 15], BARRIER, b);
        });
      }
      // Reflective impact strips (bright marker zones) at regular intervals — reads as
      // safety lighting on the barrier edges under headlights
      every(16, (k) => {
        for (const side of [-1, 1]) {
          const a = anchor(k, side, 0.6), b = [a.r, a.u, a.t];
          addBox(out, vadd(a.c, a.u, 0.9), [0.45, 0.25, 6], [0.72, 0.70, 0.66], b);
        }
      });
      // Saudi-green accent stripe on the wall through the T1-3 complex (first sector visual)
      place(K(0.05), -1, 4, [4, 0.5, 60], GREEN);
      // Bright white stripe in the high-speed esses (T4-T12 safety marker)
      place(K(0.35), 1, 4, [3.5, 0.4, 50], [0.76, 0.76, 0.79]);

      // --- LED light towers ringing the whole lap (dark pole + bright cap pool) ---
      const lightTower = (k, side, dist) => {
        const a = anchor(k, side, dist), b = [a.r, a.u, a.t];
        addCyl(out, a.c, 0.5, 22, DARKPOLE, 5, b);
        addBox(out, vadd(a.c, a.u, 22), [3.2, 1.4, 3.2], LED);   // bright lamp head
        addBox(out, a.c, [2.4, 0.3, 2.4], LED);                  // light pool on tarmac base
      };
      for (let i = 0; i < 24; i++) {
        const s = i / 24;
        lightTower(K(s), (i % 2) ? 1 : -1, 9 + (i % 3) * 2);
      }

      // --- Tall floodlight MASTS for the night race: a crossed-truss tower carrying
      // a bank of glowing lamps, ringing the lap at a wider spacing than the LED
      // poles so the whole circuit is properly lit for the night GP. ---
      const floodMast = (k, side, dist) => {
        const a = anchor(k, side, dist), b = [a.r, a.u, a.t];
        if (onTrack(a.c[0], a.c[2], 4)) return;
        addCyl(out, a.c, 0.7, 34, [0.09, 0.09, 0.12], 5, b);                 // tall mast
        addBox(out, vadd(a.c, a.u, 30), [7, 0.8, 1.4], [0.10, 0.10, 0.13], b); // lamp gantry crossbar
        for (let j = -1; j <= 1; j++) {
          addBox(out, vadd(vadd(a.c, a.u, 31), a.r, side * j * 2.4), [1.8, 1.4, 1.0], LED, b); // lamp banks
        }
        addBox(out, a.c, [3.0, 0.25, 3.0], [0.5, 0.52, 0.6], b);             // light pool base
      };
      for (let i = 0; i < 14; i++) {
        floodMast(K(i / 14 + 0.02), (i % 2) ? -1 : 1, 16 + (i % 3) * 4);
      }

      // --- Palm trees: Corniche signature vegetation (coastal appearance) ---
      // Lit fronds against the night sky. Seaward row (lit, prominent) + inland row (darker).
      // Thinned but sufficient for tropical waterfront feel.
      const PALMFROND = [0.12, 0.44, 0.19];   // warm-lit green
      for (let i = 0; i < 60; i++) {
        const s = (i / 60);
        // Seaward (R) row: visible, lit
        const h = 6.5 + hash(i * 3) * 3.5;
        const dist = 6 + hash(i * 5) * 3;
        palm(K(s), 1, dist, h, PALMFROND);
        // Inland (L) row, sparser (every 2nd, darker frond)
        if (i % 2 === 0) {
          const h2 = 7 + hash(i * 11) * 3;
          palm(K(s + 0.008), -1, 8.5 + hash(i * 7) * 4, h2, [0.08, 0.36, 0.14]);
        }
      }
      // Warm uplight pools at the base of seaward palms (amber ambient)
      for (let i = 0; i < 24; i++) {
        const a = anchor(K(i / 24), 1, 6);
        if (onTrack(a.c[0], a.c[2], 1)) continue;
        addBox(out, vadd(a.c, a.u, 0.2), [1.2, 0.35, 1.2], [0.98, 0.78, 0.42]);
      }

      // --- Marshal posts: orange-roofed bunkers at corner exits around the lap ---
      for (const [s, side] of [[0.06, -1], [0.13, 1], [0.34, -1], [0.49, 1],
        [0.62, -1], [0.74, 1], [0.81, -1], [0.92, 1], [0.97, -1]]) {
        marshalPost(K(s), side, 1.2);
      }

      // --- Red Sea: continuous flat black water, track-aligned, sub-grade (mirror effect) ---
      // Three depth bands placed via anchor() to avoid parallel-stretch culling. Sitting
      // below pyMin reads as depth. Reflection spangles (warm + cool) animate the surface.
      for (let i = 0; i < 36; i++) {
        const k = K(i / 36);
        const a = anchor(k, 1, 110);              // near shore water (50-120m out)
        const b = [a.r, a.u, a.t];
        addBox(out, [a.c[0], pyMin - 0.5, a.c[2]], [260, 1.3, 95], SEA, b);
      }
      for (let i = 0; i < 32; i++) {
        const k = K(i / 32);
        const a = anchor(k, 1, 270);              // mid-depth water (150-280m out)
        const b = [a.r, a.u, a.t];
        addBox(out, [a.c[0], pyMin - 1.0, a.c[2]], [500, 1.8, 125], [0.025, 0.045, 0.095], b);
      }
      for (let i = 0; i < 24; i++) {
        const k = K(i / 24);
        const a = anchor(k, 1, 430);              // far horizon (far offshore)
        const b = [a.r, a.u, a.t];
        addBox(out, [a.c[0], pyMin - 1.3, a.c[2]], [750, 2.2, 150], [0.018, 0.035, 0.080], b);
      }
      // Reflection spangles (bright specks) on the water surface — mix of warm amber,
      // cool LED, and magenta accents. Reads as distant light reflections on black sea.
      for (let i = 0; i < 28; i++) {
        const s = (i / 28), side = 1;
        const dist = 75 + hash(i * 5) * 180;      // varied distances
        const a = anchor(K(s), side, dist);
        // Rotate spangle colors: mostly warm amber, some cool LED, occasional magenta
        const col = (i % 5 === 0) ? MAGENTA : (i % 5 === 1) ? [0.92, 0.96, 1.0] : SPANGLE;
        addBox(out, [a.c[0], pyMin + 0.3, a.c[2]], [6 + hash(i * 7) * 5, 0.25, 6 + hash(i * 11) * 5], col);
      }

      // --- s 0.20 R far: King Fahd's Fountain — elegant thin cool-white jet far offshore ---
      // One of the world's tallest fountains (260m+). Render as: slender water column
      // (2m dia) rising from the sea, crowned with a glowing cone. The pier base is dark.
      {
        const a = anchor(K(0.20), 1, 360);
        const b = [a.r, a.u, a.t];
        // Main jet: very thin (1.8m) tall column, glowing cool-white
        addCyl(out, [a.c[0], pyMin - 0.4, a.c[2]], 0.9, 250, LED, 6, b);
        // Spray crown: diffuse cone at the apex
        addCone(out, [a.c[0], pyMin + 250, a.c[2]], 6, 50, [0.94, 0.97, 1.0], 6, b);
        // Dark pier/base sitting just above water
        addCyl(out, [a.c[0], pyMin - 0.2, a.c[2]], 5, 2, [0.16, 0.18, 0.22], 6, b);
      }

      // --- s 0.00: START/FINISH gantry spanning the track ---
      gantry(0.0, 9, [0.12, 0.13, 0.17]);
      gantry(0.012, 7, [0.12, 0.13, 0.17]);   // second scoring gantry just downstream

      // --- s 0.00 L: PIT / PADDOCK — long pit building + garage band + paddock block ---
      for (let i = 0; i < 7; i++) {
        place(K(0.0 + i * 0.011), -1, 16, [12, 8, 28], [0.26, 0.27, 0.30]);   // pit garage mass
        place(K(0.0 + i * 0.011), -1, 16, [12.4, 1.0, 29], WINWARM);          // lit garage opening
        place(K(0.0 + i * 0.011), -1, 16, [12.4, 0.5, 29], LED);              // upper window strip
      }
      // pit wall (low) on the right of the pit lane = left of track edge
      for (let i = 0; i < 6; i++) {
        place(K(0.0 + i * 0.012), -1, 3.0, [0.4, 1.1, 26], [0.40, 0.41, 0.44]);
      }
      // paddock buildings + motorhomes set back behind the garages
      for (let i = 0; i < 5; i++) {
        const a = anchor(K(0.0 + i * 0.014), -1, 36), b = [a.r, a.u, a.t];
        if (onTrack(a.c[0], a.c[2], 14)) continue;
        addBox(out, vadd(a.c, a.u, 5), [24, 10, 22], [0.20, 0.21, 0.25], b);
        addBox(out, vadd(a.c, a.u, 6), [24.4, 0.9, 22.4], (i % 2) ? WINCOOL : WINWARM, b);
      }

      // --- s 0.00 R: MAIN GRANDSTAND — raked stands packed with crowd + roof ---
      grandstand(0.0, 1, 12, 70, [0.14, 0.15, 0.19], [0.55, 0.45, 0.40]);
      grandstand(0.02, 1, 12, 60, [0.13, 0.14, 0.18], [0.50, 0.42, 0.46]);
      // bright crowd-light band reading as a sea of phone lights
      for (let i = 0; i < 6; i++) {
        place(K(0.0 + i * 0.012), 1, 13, [12.4, 0.6, 22], LED);
      }

      // --- s 0.28 L mid: modern Jeddah skyline — lit-window high-rise cluster ---
      // Primary cluster of distinctive towers
      building(K(0.26), -1, 53, 34, 143, 34, { wall: [0.20, 0.21, 0.26], window: WINCOOL, floor: 9 });
      building(K(0.28), -1, 40, 40, 114, 36, { wall: [0.22, 0.22, 0.27], window: WINWARM, floor: 8 });
      building(K(0.30), -1, 77, 30, 174, 30, { wall: [0.18, 0.19, 0.24], window: WINCOOL, floor: 10 });
      tower(K(0.29), -1, 130, 26, 170, { col: [0.16, 0.17, 0.22], seg: 4, cap: true, capCol: LED, mast: true });
      building(K(0.27), -1, 62, 32, 156, 32, { wall: [0.19, 0.20, 0.25], window: WINTEAL, floor: 22 });
      building(K(0.31), -1, 38, 36, 125, 34, { wall: [0.21, 0.21, 0.27], window: WINGOLD, floor: 20 });
      tower(K(0.305), -1, 150, 22, 150, { col: [0.15, 0.16, 0.21], seg: 4, cap: true, capCol: MAGENTA, mast: true });
      // Additional accent towers for skyline depth and verticality
      tower(K(0.252), -1, 95, 20, 138, { col: [0.17, 0.18, 0.23], seg: 4, cap: true, capCol: LED, mast: false });
      tower(K(0.285), -1, 75, 24, 156, { col: [0.18, 0.19, 0.24], seg: 4, cap: true, capCol: [0.50, 0.80, 1.0], mast: true });
      tower(K(0.315), -1, 110, 22, 128, { col: [0.16, 0.17, 0.22], seg: 4, cap: true, capCol: SPANGLE, mast: false });

      // --- s 0.45 R mid: Marina / Jeddah Yacht Club — lit pontoons, sleek yacht hulls, mast spikes ---
      // Placed far out (30-50m) so no parallel-stretch culling. Sparse lineup (10 yachts)
      // for cleaner silhouette against the sea.
      for (let i = 0; i < 10; i++) {
        const k = K(0.41 + i * 0.0075);
        const dp = 36 + (i % 3) * 12;    // staggered depths
        const a = anchor(k, 1, dp), b = [a.r, a.u, a.t];
        if (onTrack(a.c[0], a.c[2], 8)) continue;
        // Low pontoon finger (dock)
        addBox(out, vadd(a.c, a.u, 0.4), [16, 0.8, 3.5], [0.28, 0.28, 0.30], b);
        // Sleek white yacht hull (tapered for elegance)
        const hullLen = 6 + (i % 3) * 1.5;
        addBox(out, vadd(a.c, a.u, 1.2), [2.8, 2.0, hullLen], [0.94, 0.94, 0.96], b);
        // Warm deck light strip + cool navigation light
        addBox(out, vadd(a.c, a.u, 2.2), [2.9, 0.35, hullLen], (i % 2) ? SPANGLE : WINCOOL, b);
        // Slender mast (0.2m dia, 14m tall)
        addCyl(out, vadd(a.c, a.u, 2.4), 0.2, 14, [0.88, 0.88, 0.92], 4, b);
        // Masthead light (small bright point)
        addBox(out, vadd(a.c, a.u, 10.0), [0.25, 0.6, 1.4], SPANGLE, b);
      }
      // Yacht club main building + annex (lit), set well back on the marina apron
      {
        const a = anchor(K(0.45), 1, 72), b = [a.r, a.u, a.t];
        if (!onTrack(a.c[0], a.c[2], 15)) {
          addBox(out, vadd(a.c, a.u, 3.2), [28, 5.5, 11], [0.25, 0.26, 0.29], b);
          addBox(out, vadd(a.c, a.u, 4.2), [28.3, 0.9, 11.3], WINWARM, b);
          addBox(out, vadd(a.c, a.u, 4.9), [28.3, 0.8, 11.3], WINGOLD, b);  // upper warm lit floor
        }
        const a2 = anchor(K(0.47), 1, 58), b2 = [a2.r, a2.u, a2.t];
        if (!onTrack(a2.c[0], a2.c[2], 12)) {
          addBox(out, vadd(a2.c, a2.u, 3.5), [22, 7.5, 9], [0.23, 0.24, 0.27], b2);
          addBox(out, vadd(a2.c, a2.u, 4.8), [22.3, 0.9, 9.3], WINCOOL, b2);
        }
      }

      // --- s 0.50 L near: banked T13 — light towers + packed grandstand R + tyre wall ---
      lightTower(K(0.50), -1, 10);
      lightTower(K(0.50), -1, 16);
      floodMast(K(0.51), 1, 26);
      grandstand(0.50, 1, 14, 55, [0.14, 0.15, 0.19], [0.52, 0.44, 0.42]);
      for (let i = 0; i < 4; i++) {
        place(K(0.50 + i * 0.008), 1, 15, [16.4, 0.7, 14], LED);    // crowd light band
      }
      // protective tyre wall stacks on the banked apex (gap clears the barrier line)
      tyreWall(0.485, 0.515, -1, 1.8, MAGENTA);

      // --- s 0.60 R mid: open Corniche lagoon & waterfront promenade ---
      // Lagoon water (darker than main Red Sea, sheltered) + path lighting along the edge.
      for (let i = 0; i < 12; i++) {
        const k = K(0.55 + i * 0.0075);
        const a = anchor(k, 1, 65);
        const b = [a.r, a.u, a.t];
        // Sheltered lagoon water (slightly warmer tint than open sea)
        addBox(out, [a.c[0], pyMin - 0.4, a.c[2]], [160, 1.1, 55], [0.05, 0.08, 0.14], b);
      }
      // Warm amber path-lamp dots along waterfront promenade (street lamps)
      for (let i = 0; i < 16; i++) {
        const a = anchor(K(0.55 + i * 0.0055), 1, 7);
        if (!onTrack(a.c[0], a.c[2], 0.8)) {
          addBox(out, vadd(a.c, a.u, 2.8), [1.4, 1.1, 1.4], [1.0, 0.81, 0.38]);  // warm path lamp
        }
      }

      // --- s 0.70 L mid: mid-rise hotel cluster + emissive signage + tower accent ---
      // Cluster of 2-3 mid-rise buildings (25-30 storeys) at various depths to create
      // a dense urban silhouette. Lit windows (warm/cool) + tall tower accent.
      building(K(0.68), -1, 51, 32, 65, 28, { wall: [0.22, 0.22, 0.26], window: WINWARM, floor: 8 });
      building(K(0.72), -1, 59, 28, 74, 26, { wall: [0.20, 0.21, 0.25], window: WINCOOL, floor: 9 });
      // Accent tower — tall, tapered, with a bright cap
      tower(K(0.70), -1, 88, 22, 100, { col: [0.18, 0.19, 0.24], seg: 4, cap: true, capCol: LED, mast: true });
      // Emissive billboards for night energy (neon palette mixed)
      billboard(K(0.70), -1, 28, 16, 11, GREEN);         // Saudi green
      billboard(K(0.71), -1, 54, 18, 10, SPANGLE);       // warm amber
      billboard(K(0.69), -1, 20, 17, 11, MAGENTA);       // magenta pop
      billboard(K(0.73), -1, 26, 16, 10, WINTEAL);       // teal accent

      // --- s 0.78-0.84: tight technical sector (T22-26) — bright sawtooth kerbs ---
      // Red/white alternating strips on both barriers for visual excitement in tight section.
      for (const side of [-1, 1]) {
        for (let i = 0; i < 8; i++) {
          const col = (i % 2) ? [0.92, 0.08, 0.08] : [0.96, 0.96, 0.97];  // red/white
          place(K(0.78 + i * 0.0075), side, 5, [5.5, 0.28, 2.8], col);
        }
      }

      // --- s 0.90 R near: grandstand bank + light towers funnel toward final run ---
      grandstand(0.89, 1, 14, 60, [0.15, 0.15, 0.19], [0.50, 0.43, 0.47]);
      for (let i = 0; i < 4; i++) {
        place(K(0.89 + i * 0.008), 1, 15, [16.4, 0.7, 14], LED);
      }
      lightTower(K(0.90), 1, 10);
      lightTower(K(0.93), -1, 10);
      floodMast(K(0.91), -1, 22);

      // --- Corner protection: tyre walls + guardrails at the tightest braking zones ---
      tyreWall(0.07, 0.10, -1, 1.8, GREEN);     // T1 complex
      tyreWall(0.79, 0.82, 1, 1.8, SPANGLE);    // tight technical sector
      guardrail(0.34, 0.38, -1, 1.6, [0.55, 0.56, 0.6]); // fast esses inner
      guardrail(0.96, 0.99, 1, 1.6, [0.55, 0.56, 0.6]);  // DRS run-in

      // --- s 0.94-0.99: final DRS straight into start/finish — emissive signage ---
      // Bright billboards on both sides to mark the final acceleration zone.
      billboard(K(0.95), 1, 24, 14, 10, GREEN);         // Saudi green
      billboard(K(0.96), -1, 24, 14, 9, SPANGLE);       // warm amber
      billboard(K(0.97), -1, 22, 15, 10, MAGENTA);      // magenta accent
      billboard(K(0.98), 1, 22, 14, 9, WINTEAL);        // teal accent

      // --- accent signage: 4 bold neon billboards around the Corniche ---
      // Strategic placements: seafront, city cluster, mid-lagoon, final sector
      billboard(K(0.10), 1,  16, 13, 8, [0.12, 0.68, 0.98]);    // cyan (seafront)
      billboard(K(0.30), -1, 20, 15, 8, [0.98, 0.32, 0.12]);    // orange (city)
      billboard(K(0.55), 1,  14, 13, 7, [0.92, 0.12, 0.68]);    // magenta (lagoon)
      billboard(K(0.75), -1, 18, 14, 7, [0.12, 0.68, 0.98]);    // cyan (final)

      // --- s 0.50: Corniche fountain / sculpture (landmark near the banked T13) ---
      // Public waterfront monument: cream-coloured column with a golden crown.
      {
        const sA = anchor(K(0.50), 1, 40), sBasis = [sA.r, sA.u, sA.t];
        if (!onTrack(sA.c[0], sA.c[2], 9)) {
          // Monument column (rendered in pale cream stone)
          addCyl(out, sA.c, 3.2, 22, [0.82, 0.78, 0.68], 8, sBasis);
          // Crown cap (gold/bronze finish)
          const sTop = vadd(sA.c, sA.u, 22);
          addCone(out, sTop, 5, 9, [0.94, 0.86, 0.64], 8, sBasis);
        }
      }

      // --- Urban canyon: buildings every 28m on both sides (city texture) ---
      // Sparse residential/commercial mix. Right-side ones are lit cooler (night glow);
      // left-side (toward the circuit) are darker to frame the track.
      every(28, (k) => {
        for (const side of [-1, 1]) {
          if (hash(k * 53 + side) > 0.68) continue;   // 32% placement density
          const dist = 48 + hash(k * 77 + side) * 28;
          const h = 28 + hash(k * 61 + side) * 28;
          const w = 15 + hash(k * 43 + side) * 14;
          const p = anchor(k, side, dist);
          if (onTrack(p.c[0], p.c[2], 10)) continue;
          const winCol = side > 0 ? [0.30, 0.42, 0.56] : [0.24, 0.28, 0.35]; // cool-right, dark-left
          building(k, side, dist, w, h, w * 0.85,
            { wall: [0.34, 0.31, 0.29], window: winCol, floor: 7 });
        }
      });

      // --- CONTINUOUS lit Jeddah skyline (inland L side) ---
      // Two-ring skyline: near mid-rise band (lit windows) + far high-rise towers (lit).
      // Placed to avoid gaps while respecting vertex budget. Skips stand frontages.
      const WINPAL = [WINWARM, WINCOOL, WINGOLD, WINTEAL];
      const WALLPAL = [[0.18, 0.19, 0.24], [0.20, 0.21, 0.26], [0.22, 0.22, 0.27], [0.16, 0.17, 0.22]];
      // Near band: ~20 mid-rise lit blocks (reduced from 30 for better performance)
      for (let i = 0; i < 20; i++) {
        const s = i / 20;
        // skip pit-straight (s ~0) and banked-stand (s ~0.5) frontages
        if (Math.abs(((s + 0.5) % 1) - 0.5) < 0.024) continue;
        if (Math.abs(((s - 0.5 + 0.5) % 1) - 0.5) < 0.024) continue;
        const r1 = hash(i * 13), r2 = hash(i * 29 + 3);
        const w = 28 + r1 * 18;        // wider, more visible
        const h = 24 + r2 * 32;        // shorter than before
        const dist = 48 + r1 * 20;
        const win = WINPAL[i % WINPAL.length];
        building(K(s), -1, dist - w / 2, w, h, w * 0.82, { wall: WALLPAL[i % 4], window: win, floor: 12 });
      }
      // Far high-rise band: ~16 tall towers (reduced from 22) for clear silhouette
      for (let i = 0; i < 16; i++) {
        const s = (i + 0.5) / 16;
        const r1 = hash(i * 17 + 7), r2 = hash(i * 41 + 1);
        const w = 20 + r1 * 12;
        const h = 80 + r2 * 100;       // taller than mid-rises
        const dist = 140 + i * 6 + r1 * 24;
        const win = WINPAL[(i + 1) % WINPAL.length];
        building(K(s), -1, dist - w / 2, w, h, w * 0.8, { wall: WALLPAL[(i + 2) % 4], window: win, floor: 24 });
      }
      // Cheap silhouette backdrop (dark profile) behind towers to prevent sky-gap
      for (let i = 0; i < 20; i++) {
        const s = i / 20;
        const w = 32 + hash(i * 11) * 20, h = 60 + hash(i * 7) * 70;
        backdrop(K(s), -1, 290 + (i % 4) * 16, [w, h, w], [0.13, 0.14, 0.19]);
      }
    },
  }
  );
})();
