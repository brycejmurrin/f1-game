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

      // Night Corniche palette
      const SEA = [0.03, 0.05, 0.10];        // black mirror water
      const SPANGLE = [1.0, 0.78, 0.45];     // warm reflection / path lamps
      const LED = [0.90, 0.95, 1.0];         // cool-white LED tower glow
      const WINWARM = [1.0, 0.82, 0.50];     // lit windows warm
      const WINCOOL = [0.55, 0.80, 1.0];     // lit windows cool
      const WINGOLD = [1.0, 0.74, 0.30];     // deep warm sodium glow
      const WINTEAL = [0.40, 0.95, 0.92];    // bright teal glass tower
      const GREEN = [0.10, 0.55, 0.25];      // Saudi-green accents
      const MAGENTA = [0.95, 0.30, 0.65];    // neon waterfront accent
      const BARRIER = [0.30, 0.31, 0.34];    // grey concrete
      const DARKPOLE = [0.10, 0.10, 0.13];

      // --- Continuous grey barrier wall both sides (the walls ARE the circuit) ---
      // Custom coarse-stepped barrier: overlapping long boxes so the wall never opens a
      // gap, at a wider spacing than wall()'s fixed 6 m step to stay within the vert budget.
      // Physics boundary registered at the same 0.6m gap so the stop matches the visual.
      // Use (n-1)/n as s1 — s1=1.0 wraps k1 back to 0, making span=0 and covering nothing.
      for (const side of [-1, 1]) {
        recordBarrier(0.0, (n - 1) / n, side, 0.6);
        every(13, (k) => {
          const a = anchor(k, side, 0.6), b = [a.r, a.u, a.t];
          addBox(out, vadd(a.c, a.u, 0.65), [0.5, 1.3, 15], BARRIER, b);
        });
      }
      // Reflective barrier markers/impact strips on barriers (night safety lighting effect)
      every(16, (k) => {
        for (const side of [-1, 1]) {
          const a = anchor(k, side, 0.6), b = [a.r, a.u, a.t];
          addBox(out, vadd(a.c, a.u, 0.9), [0.45, 0.25, 6], [0.70, 0.68, 0.65], b);
        }
      });
      // Short debris fence on the tight technical final sector (kept brief for vert budget)
      fence(0.88, 0.95, 1, 1.3, 3.0, [0.50, 0.52, 0.56]);
      // Saudi-green accent stripe on the wall through the T1-3 complex
      place(K(0.05), -1, 4, [4, 0.5, 60], GREEN);
      // Additional white wall stripe markers in the high-speed esses
      place(K(0.35), 1, 4, [3.5, 0.4, 50], [0.75, 0.75, 0.78]);

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

      // --- Palm trees: the Corniche signature. Dense rows along both flanks for the
      // whole lap (warm-lit fronds against the night), thinning where stands/walls
      // sit close. Two passes at staggered phase so the rows feel continuous. ---
      const PALMFROND = [0.10, 0.42, 0.20];
      for (let i = 0; i < 70; i++) {
        const s = (i / 70);
        // skip the close stand/pit frontage so palms don't fight the grandstands
        const nearStand = Math.abs(((s + 0.5) % 1) - 0.5) < 0.02 ||
          Math.abs(((s - 0.5 + 0.5) % 1) - 0.5) < 0.02 ||
          Math.abs(((s - 0.9 + 0.5) % 1) - 0.5) < 0.02;
        if (!nearStand) {
          const h = 7 + hash(i * 3) * 4;
          palm(K(s), 1, 7 + hash(i * 5) * 4, h, PALMFROND);     // seaward row
        }
        if (i % 2 === 0 && !nearStand) {
          palm(K(s + 0.007), -1, 8 + hash(i * 7) * 5, 7 + hash(i * 11) * 4, PALMFROND); // inland row
        }
      }
      // Warm uplight spots at the base of seaward palms (amber pools)
      for (let i = 0; i < 30; i++) {
        const a = anchor(K(i / 30), 1, 7);
        if (onTrack(a.c[0], a.c[2], 1)) continue;
        addBox(out, vadd(a.c, a.u, 0.15), [1.0, 0.3, 1.0], SPANGLE);
      }

      // --- Marshal posts: orange-roofed bunkers at corner exits around the lap ---
      for (const [s, side] of [[0.06, -1], [0.13, 1], [0.34, -1], [0.49, 1],
        [0.62, -1], [0.74, 1], [0.81, -1], [0.92, 1], [0.97, -1]]) {
        marshalPost(K(s), side, 1.2);
      }

      // --- Red Sea: CONTINUOUS far flat black water — track-aligned seaward slabs
      // placed by anchor() so they only ever project to the R, never overlapping a
      // parallel stretch of the lap (which culled the old symmetric 1000m squares).
      // Sub-grade (settled below pyMin) so it reads as a flat black mirror plane. ---
      // Three depth layers: near water, mid water, far deep water for continuity
      for (let i = 0; i < 40; i++) {
        const k = K(i / 40);
        const a = anchor(k, 1, 120);              // near water edge
        const b = [a.r, a.u, a.t];
        addBox(out, [a.c[0], pyMin - 0.6, a.c[2]], [280, 1.5, 100], SEA, b);
      }
      for (let i = 0; i < 36; i++) {
        const k = K(i / 36);
        const a = anchor(k, 1, 280);              // centre 280 m out to sea
        const b = [a.r, a.u, a.t];
        addBox(out, [a.c[0], pyMin - 1.2, a.c[2]], [520, 2, 130], SEA, b);
      }
      for (let i = 0; i < 28; i++) {
        const k = K(i / 28);
        const a = anchor(k, 1, 450);              // far water horizon
        const b = [a.r, a.u, a.t];
        addBox(out, [a.c[0], pyMin - 1.4, a.c[2]], [800, 2.5, 160], [0.02, 0.04, 0.09], b);
      }
      // warm + neon reflection spangles dancing on the water (denser and more varied)
      for (let i = 0; i < 32; i++) {
        const s = (i / 32), side = 1;
        const dist = 80 + hash(i * 5) * 200;
        const a = anchor(K(s), side, dist);
        const col = (i % 4 === 0) ? MAGENTA : (i % 4 === 1) ? SPANGLE : (i % 4 === 2) ? LED : [1.0, 0.90, 0.55];
        addBox(out, [a.c[0], pyMin + 0.5, a.c[2]], [8 + hash(i * 7) * 6, 0.3, 8 + hash(i * 11) * 6], col);
      }

      // --- s 0.20 R far: King Fahd's Fountain — thin tall cool-white jet far offshore ---
      {
        const a = anchor(K(0.20), 1, 360);
        const b = [a.r, a.u, a.t];
        addCyl(out, [a.c[0], pyMin, a.c[2]], 2.2, 240, LED, 8, b);        // tall water column
        addCone(out, [a.c[0], pyMin + 240, a.c[2]], 4.5, 60, LED, 8, b);  // plume crown
        addCyl(out, [a.c[0], pyMin, a.c[2]], 6, 6, [0.18, 0.20, 0.24], 8, b); // dark base pier
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

      // --- s 0.45 R mid: Marina / Jeddah Yacht Club — pontoons + yacht hulls + mast
      // spikes. Placed via anchor() at >30 m out so the seaward footprints clear any
      // parallel stretch (the old place() calls at 18 m culled here). ---
      for (let i = 0; i < 12; i++) {
        const k = K(0.40 + i * 0.007);
        const dp = 34 + (i % 3) * 16;
        const a = anchor(k, 1, dp), b = [a.r, a.u, a.t];
        if (onTrack(a.c[0], a.c[2], 9)) continue;
        addBox(out, vadd(a.c, a.u, 0.5), [14, 0.9, 4], [0.30, 0.30, 0.32], b);   // pontoon finger
        // yacht hull + warm deck-light strip + mast spike
        const hl = 7 + (i % 4) * 2;
        addBox(out, vadd(a.c, a.u, 1.4), [3.2, 2.2, hl], [0.92, 0.93, 0.95], b); // white hull
        addBox(out, vadd(a.c, a.u, 2.5), [3.3, 0.4, hl], (i % 2) ? SPANGLE : WINTEAL, b); // running lights
        addCyl(out, vadd(a.c, a.u, 2.6), 0.18, 13, [0.85, 0.86, 0.9], 4, b);     // mast spike
        addBox(out, vadd(a.c, a.u, 9.0), [0.2, 0.6, 1.6], SPANGLE, b);           // masthead light
      }
      // Yacht club + office annex (lit), set well out on the marina apron
      {
        const a = anchor(K(0.45), 1, 70), b = [a.r, a.u, a.t];
        if (!onTrack(a.c[0], a.c[2], 16)) {
          addBox(out, vadd(a.c, a.u, 3), [30, 6, 12], [0.24, 0.25, 0.28], b);
          addBox(out, vadd(a.c, a.u, 4.5), [30.4, 0.9, 12.4], WINWARM, b);
          addBox(out, vadd(a.c, a.u, 5), [30.4, 0.9, 12.4], WINGOLD, b);
        }
        const a2 = anchor(K(0.47), 1, 56), b2 = [a2.r, a2.u, a2.t];
        if (!onTrack(a2.c[0], a2.c[2], 13)) {
          addBox(out, vadd(a2.c, a2.u, 4), [24, 8, 10], [0.22, 0.23, 0.27], b2);
          addBox(out, vadd(a2.c, a2.u, 5.5), [24.4, 0.9, 10.4], WINCOOL, b2);
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

      // --- s 0.60 R mid: open Corniche lagoon — warm amber path-lamp dots along the edge ---
      // Lagoon waters and waterfront path lighting
      for (let i = 0; i < 10; i++) {
        const k = K(0.55 + i * 0.008);
        const a = anchor(k, 1, 60);
        const b = [a.r, a.u, a.t];
        // Dark lagoon water inline with shoreline
        addBox(out, [a.c[0], pyMin - 0.5, a.c[2]], [150, 1.2, 50], [0.04, 0.06, 0.12], b);
      }
      // Warm amber path-lamp dots along the lagoon edge (brighter density)
      for (let i = 0; i < 12; i++) {
        const a = anchor(K(0.56 + i * 0.005), 1, 7);
        if (!onTrack(a.c[0], a.c[2], 1)) {
          addBox(out, vadd(a.c, a.u, 2.5), [1.2, 1.0, 1.2], SPANGLE);
        }
      }

      // --- s 0.70 L mid: mid-rise hotel/apartment boxes + emissive billboards + accent towers ---
      building(K(0.68), -1, 49, 30, 60, 28, { wall: [0.22, 0.22, 0.26], window: WINWARM, floor: 7 });
      building(K(0.72), -1, 57, 26, 72, 26, { wall: [0.20, 0.21, 0.25], window: WINCOOL, floor: 8 });
      tower(K(0.70), -1, 85, 20, 92, { col: [0.19, 0.20, 0.25], seg: 4, cap: true, capCol: LED, mast: false });
      billboard(K(0.70), -1, 30, 18, 11, GREEN);
      billboard(K(0.71), -1, 56, 16, 10, SPANGLE);
      billboard(K(0.69), -1, 22, 16, 10, MAGENTA);
      billboard(K(0.73), -1, 24, 18, 11, WINTEAL);

      // --- s 0.80 both near: tight technical sector — bright sawtooth kerb strips ---
      for (const side of [-1, 1]) {
        for (let i = 0; i < 6; i++) {
          place(K(0.78 + i * 0.006), side, 5, [6, 0.3, 3], (i % 2) ? [0.9, 0.1, 0.1] : [0.95, 0.95, 0.95]);
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

      // --- s 0.96 both near: walls + DRS straight back to start — extra fence + billboards ---
      billboard(K(0.96), 1, 26, 16, 10, GREEN);
      billboard(K(0.96), -1, 26, 14, 9, SPANGLE);
      billboard(K(0.94), -1, 24, 16, 10, MAGENTA);
      billboard(K(0.98), 1, 24, 15, 9, WINTEAL);

      // --- Red Sea deep water ground plane along the seaward (R) side ---
      // Multiple depth bands in cool/warm blues to evoke the actual Red Sea water
      // Warm shallow band
      for (let i = 0; i < 22; i++) {
        const k = K(i / 22);
        const a = anchor(k, 1, 180);
        addBox(out, [a.c[0], pyMin - 0.7, a.c[2]], [350, 1.4, 90], [0.10, 0.15, 0.28], [a.r, a.u, a.t]);
      }
      // Mid-depth cooler band
      for (let i = 0; i < 20; i++) {
        const k = K(i / 20);
        const a = anchor(k, 1, 260);
        addBox(out, [a.c[0], pyMin - 0.9, a.c[2]], [380, 1.6, 100], [0.06, 0.12, 0.24], [a.r, a.u, a.t]);
      }
      // Deep water band at horizon
      for (let i = 0; i < 18; i++) {
        const k = K(i / 18);
        const a = anchor(k, 1, 380);
        addBox(out, [a.c[0], pyMin - 1.0, a.c[2]], [450, 1.8, 120], [0.05, 0.10, 0.20], [a.r, a.u, a.t]);
      }

      // --- Saturated neon/LED signage billboards: 4 bold signs around the Corniche ---
      billboard(K(0.10), 1,  15, 14, 7, [0.10, 0.70, 1.0]);   // cyan — seafront sector
      billboard(K(0.30), -1, 18, 16, 8, [1.0, 0.30, 0.10]);   // orange — city sector
      billboard(K(0.55), 1,  12, 14, 7, [0.90, 0.10, 0.70]);  // magenta — mid Corniche
      billboard(K(0.75), -1, 16, 15, 7, [0.10, 0.70, 1.0]);   // cyan — final sector

      // --- Corniche fountain / public sculpture at s≈0.50 (mid-circuit landmark) ---
      {
        const sA = anchor(K(0.50), 1, 38), sBasis = [sA.r, sA.u, sA.t];
        if (!onTrack(sA.c[0], sA.c[2], 10)) {
          addCyl(out, sA.c, 3, 20, [0.80, 0.76, 0.68], 8, sBasis);               // monument column
          const sTop = vadd(sA.c, sA.u, 20);
          addCone(out, sTop, 4, 8, [0.92, 0.88, 0.72], 8, sBasis);               // cone cap
        }
      }

      // --- Urban canyon density: buildings every 24m both sides through city sections ---
      every(24, (k) => {
        for (const side of [-1, 1]) {
          if (hash(k * 53 + side) > 0.70) continue;
          const dist = 50 + hash(k * 77 + side) * 30;
          const h = 30 + hash(k * 61 + side) * 30;
          const w = 14 + hash(k * 43 + side) * 12;
          const p = anchor(k, side, dist);
          if (onTrack(p.c[0], p.c[2], 12)) continue;
          building(k, side, dist, w, h, w * 0.9,
            { wall: [0.35, 0.32, 0.30], window: [0.28, 0.38, 0.52], floor: 6 });
        }
      });

      // --- CONTINUOUS lit Jeddah skyline wrapping the WHOLE inland (L) side ---
      // Two depth rings of lit-window slabs placed at every node-step so the city
      // never opens a gap: a near mid-rise band + a far high-rise band, plus a
      // cheap far silhouette behind. Heights/colours varied by hash for richness.
      const WINPAL = [WINWARM, WINCOOL, WINGOLD, WINTEAL];
      const WALLPAL = [[0.18, 0.19, 0.24], [0.20, 0.21, 0.26], [0.22, 0.22, 0.27], [0.16, 0.17, 0.22]];
      // Near continuous band: ~30 lit blocks, slightly overlapping, low floor
      // counts to stay in budget. Skip the few nodes occupied by near-track stands.
      for (let i = 0; i < 30; i++) {
        const s = i / 30;
        // leave the pit-straight / banked-stand frontage (s ~0 and ~0.5) readable
        if (Math.abs(((s + 0.5) % 1) - 0.5) < 0.018) continue;
        if (Math.abs(((s - 0.5 + 0.5) % 1) - 0.5) < 0.018) continue;
        const r1 = hash(i * 13), r2 = hash(i * 29 + 3);
        const w = 26 + r1 * 16;
        const h = 26 + r2 * 38;
        const dist = 46 + r1 * 22;
        const win = WINPAL[i % WINPAL.length];
        building(K(s), -1, dist - w / 2, w, h, w * 0.85, { wall: WALLPAL[i % 4], window: win, floor: 14 });
      }
      // Far high-rise band: taller slimmer lit towers behind, continuous ring.
      for (let i = 0; i < 22; i++) {
        const s = (i + 0.5) / 22;
        const r1 = hash(i * 17 + 7), r2 = hash(i * 41 + 1);
        const w = 22 + r1 * 14;
        const h = 70 + r2 * 110;
        const dist = 130 + i * 4 + r1 * 26;
        const win = WINPAL[(i + 1) % WINPAL.length];
        building(K(s), -1, dist - w / 2, w, h, w * 0.8, { wall: WALLPAL[(i + 2) % 4], window: win, floor: 26 });
      }
      // Cheap far silhouette filler so no sky-gap shows between the lit towers.
      for (let i = 0; i < 30; i++) {
        const s = i / 30;
        const w = 30 + hash(i * 11) * 22, h = 50 + hash(i * 7) * 80;
        backdrop(K(s), -1, 280 + (i % 5) * 14, [w, h, w], [0.14, 0.15, 0.20]);
      }
    },
  }
  );
})();
