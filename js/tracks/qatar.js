/* Apex 26 — QATAR circuit definition (data only).
   Registered on the global TrackDefs list; consumed by the js/tracks.js engine
   (palette resolved there from `night`, geometry from js/circuits.js or `segs`). */
(function () {
  "use strict";
  (window.TrackDefs = window.TrackDefs || []).push(
  {
    id: "qatar",
    name: "QATAR",
    gp: "Qatar GP",
    country: "Qatar",
    night: true,
    theme: "desert",
    lengthKm: 5.4,
    baseHW: 8,
    pal: { horizon: [0.18, 0.14, 0.06], zenith: [0.05, 0.04, 0.12], sunColor: [0.80, 0.65, 0.35], ambientSky: [0.28, 0.22, 0.16], ambientGround: [0.22, 0.14, 0.08], fogColor: [0.16, 0.10, 0.06], fogDensity: 0.0025, concrete: [0.28, 0.26, 0.24], runoff: [0.24, 0.22, 0.2], grass: [0.20, 0.42, 0.22] },
    segs: [
      { t: 0, l: 300 }, { t: -60, l: 90 }, { t: 80, l: 100 }, { t: -70, l: 90 }, { t: 60, l: 90 }, { t: 0, l: 300 },
      { t: -80, l: 100 }, { t: 70, l: 90 }, { t: 0, l: 400 }, { t: -60, l: 90 }, { t: 70, l: 90 }, { t: 0, l: 300 },
    ],
    // Losail: gentle desert undulation through the far hairpin section.
    elevations: [{ s: 0.55, halfM: 380, rise: 5 }],
    scenery: function (api) {
      const { out, n, px, pz, pyMin, hash, vadd, every, onTrack, groundYAt,
        place, prop, backdrop, anchor, addBox, addCyl, addFrustum, addPrism, addPyramid,
        palm, grandstand, building, fence, wall, mountain, guardrail, tyreWall,
        billboard, marshalPost, gantry, tower, bush, along } = api;
      const K = (s) => Math.round(s * n) % n;

      // ---- Palette (NIGHT desert, from the brief) ----
      // Sand/dune colors: warm tan (desert ground), tan highlights, dark shadows for depth
      const DUNE = [0.76, 0.64, 0.46], DUNE_N = [0.56, 0.48, 0.36];
      const SAND = [0.64, 0.52, 0.36], SAND_D = [0.45, 0.36, 0.24];   // warm tan for night desert
      const SEAT = [0.16, 0.16, 0.19], STEEL = [0.13, 0.13, 0.16], PALE = [0.95, 0.95, 0.92];
      const FLOOD = [0.97, 0.97, 0.93], GREY = [0.42, 0.43, 0.47];
      const SKYLINE = [0.55, 0.70, 0.80];
      const DARKGLASS = [0.30, 0.34, 0.40], WHITEROOF = [0.90, 0.90, 0.88];
      const FROND = [0.12, 0.28, 0.12];  // darker fronds for night
      const AD = [   // billboard / sponsor hoarding face tones
        [0.85, 0.18, 0.16], [0.16, 0.36, 0.72], [0.92, 0.74, 0.14],
        [0.10, 0.62, 0.42], [0.90, 0.90, 0.88], [0.62, 0.18, 0.55],
      ];

      // ---- Floodlight tower: tall dark pole topped by a bright white lamp box.
      // The defining "Qatar night" motif — repeated densely around the lap. ----
      const floodTower = (k, side, gap, h) => {
        const a = anchor(k, side, gap), b = [a.r, a.u, a.t];
        addCyl(out, a.c, 0.45, h, STEEL, 6, b);
        // tapered cap section near the top for a finished look
        addCyl(out, vadd(a.c, a.u, h - 4), 0.62, 3.0, STEEL, 6, b);
        // horizontal cross-truss carrying the lamp banks
        addBox(out, vadd(a.c, a.u, h - 1.4), [7.6, 0.4, 0.5], STEEL, b);
        // three lamp boxes across the truss — bright white lit faces
        for (const dx of [-2.6, 0, 2.6]) {
          const lc = vadd(vadd(a.c, a.u, h - 0.6), a.r, dx);
          addBox(out, lc, [2.3, 1.8, 1.7], FLOOD, b);
        }
        addBox(out, vadd(a.c, a.u, h + 0.6), [7.4, 0.4, 1.6], FLOOD, b); // upper lit edge
      };

      // ---- Glowing light pool on the ground beneath a mast (lit-ribbon read). ----
      const lightPool = (k, side, gap, r) => {
        const a = anchor(k, side, gap), b = [a.r, a.u, a.t];
        addCyl(out, vadd(a.c, a.u, 0.04), r, 0.08, [0.40, 0.40, 0.37], 8, b);
      };

      // ---- Catch-fence + guardrail run helper (track furniture). ----
      const sandWedge = (k, side, gap, w, h) => {
        const a = anchor(k, side, gap), b = [a.r, a.u, a.t];
        addFrustum(out, a.c, w * 0.6, w * 0.24, h, DUNE, 7, b);
        addFrustum(out, vadd(a.c, a.u, h * 0.5), w * 0.32, w * 0.06, h * 0.5, DUNE_N, 7, b);
      };

      // ---- CONTINUOUS sand-dune RING: a closed band of overlapping low organic
      // dunes wrapping the whole lap. Three concentric rings build desert depth:
      // inner smooth tan, middle undulating dunes, outer hazy distant range. --
      (function duneRing() {
        let cx = 0, cz = 0;
        for (let i = 0; i < n; i++) { cx += px[i]; cz += pz[i]; }
        cx /= n; cz /= n;
        let rad = 0;
        for (let i = 0; i < n; i++) rad = Math.max(rad, Math.hypot(px[i] - cx, pz[i] - cz));
        // [extraDist, ringRadiusFudge, baseW, baseH, count, sand, dark]
        for (const [extra, wMin, hMin, count, sand, dark] of [
          [160, 120, 6, 52, SAND, SAND_D],     // inner: close smooth dunes
          [280, 160, 11, 48, DUNE, DUNE_N],    // middle: undulating ridge band
          [400, 220, 18, 36, SAND_D, [0.38, 0.30, 0.18]], // outer: distant hazy range
        ]) {
          const ring = rad + extra;
          for (let i = 0; i < count; i++) {
            const a = i / count * 6.2832 + hash(i * 3 + extra) * 0.18;
            const h = hash(i * 7 + extra);
            const rr = ring + (hash(i * 5 + extra) - 0.5) * extra * 0.5;
            mountain(cx + Math.cos(a) * rr, cz + Math.sin(a) * rr, pyMin,
                     wMin + h * wMin * 0.9, hMin + h * hMin * 0.7,
                     { seg: 7, seed: i * 4 + extra, rough: 0.42, snowline: 1.4,
                       forest: sand, rock: dark, snow: dark });
          }
        }
      })();

      // ================= START / FINISH STRAIGHT =================
      // Pit building (L, close): record-length sleek white slab (1000+ m) + thin smart glass.
      // Modern minimalist design with deep glass stripe reading as sleek control room.
      building(K(0.00), -1, 1.5, 15, 12, 160, { wall: [0.96, 0.96, 0.94], window: [0.35, 0.40, 0.48], floor: 3.5 });
      // Upper paddock / hospitality deck stacked back behind the pit roof.
      building(K(0.01), -1, 16, 12, 8.5, 130, { wall: [0.93, 0.93, 0.90], window: [0.32, 0.38, 0.46], floor: 3 });
      // Pit garage roll-up door band along the pit lane edge (dark panels).
      (function pitGarages() {
        let i = 0;
        along(0.0, 0.10, 6, (k) => {
          const col = (i % 2) ? [0.20, 0.20, 0.23] : [0.30, 0.30, 0.33];
          place(k, -1, 3, [0.5, 4.5, 5.0], col);
          i++;
        });
      })();
      wall(0.96, 0.06, -1, 3, 1.0, [0.85, 0.85, 0.85]);  // pit wall

      // Start gantry spanning the straight (timing / lights) + scoring tower.
      gantry(0.012, 7.5, [0.12, 0.12, 0.14]);
      tower(K(0.985), -1, 8, 26, { col: [0.18, 0.18, 0.21], cap: true, capCol: FLOOD });

      // Main Grandstand (R, close): the hero — long smooth pale crescent stepped
      // slab with modern minimalist design. Built as a chain of overlapping curved sections.
      (function crescentStand() {
        for (let i = 0; i < 9; i++) {
          const s = 0.950 + i * 0.012;
          // Brighter white shell reading against black night sky
          grandstand(s % 1, 1, 15, 55, [0.88, 0.88, 0.86], [0.18, 0.18, 0.22]);  // shell + crowd
        }
        // bright white curved roof fascia with clean support pylons
        for (let i = 0; i < 9; i++) {
          const a = anchor(K((0.950 + i * 0.012) % 1), 1, 22), b = [a.r, a.u, a.t];
          addBox(out, vadd(a.c, a.u, 24), [18, 3.6, 70], [0.96, 0.96, 0.94], b);  // bright roof
          addBox(out, vadd(a.c, a.u, 12), [0.9, 24, 0.9], [0.92, 0.92, 0.90], b); // support pylon
          // sponsor band across the roof fascia front face
          addBox(out, vadd(vadd(a.c, a.u, 25), a.r, -8.5), [0.7, 2.0, 42], AD[i % AD.length], b);
        }
      })();

      // Start/finish floodlight towers, both sides + ground light pools.
      // Dense cluster of towers defining the "Qatar night" aesthetic.
      for (const s of [0.0, 0.01, 0.02, 0.03, 0.04, 0.05]) {
        for (const side of [-1, 1]) {
          floodTower(K(s), side, 38 + hash(K(s) * 7) * 4, 33 + hash(K(s) * 11) * 3);
          lightPool(K(s), side, 10, 9 + hash(K(s) * 5));
        }
      }
      // Pit-straight sponsor hoardings along both verges (low, behind barrier).
      (function straightAds() {
        let i = 0;
        along(0.86, 0.12, 22, (k) => {
          billboard(k, 1, 5, 9, 3.2, AD[i % AD.length]);
          i++;
        });
      })();

      // ================= TURN 1 — NORTH GRANDSTAND (s 0.06, R) =================
      // Heavy-braking zone, prime overtake — large stepped grandstand + tyre wall.
      grandstand(0.053, 1, 20, 95, [0.44, 0.45, 0.50], [0.18, 0.18, 0.21]);
      grandstand(0.070, 1, 20, 65, [0.44, 0.45, 0.50], [0.18, 0.18, 0.21]);
      for (let i = 0; i < 7; i++) {
        const a = anchor(K((0.053 + i * 0.012) % 1), 1, 26), b = [a.r, a.u, a.t];
        addBox(out, vadd(a.c, a.u, 24), [17, 3.0, 68], [0.92, 0.92, 0.90], b); // bright roof
      }
      tyreWall(0.04, 0.085, 1, 5, [0.90, 0.86, 0.20]);   // T1 outside tyre stack
      floodTower(K(0.06), 1, 34, 31);
      floodTower(K(0.08), 1, 34, 31);
      floodTower(K(0.05), -1, 34, 31);
      marshalPost(K(0.05), -1, 6);
      billboard(K(0.065), 1, 6, 12, 3.8, AD[0]);

      // ================= PALM CLUSTER (s 0.10, L far) =================
      // Scattered tall palms with dark fronds reading against the night sky.
      for (let i = 0; i < 14; i++) {
        const k = (K(0.10) + i * Math.round(n * 0.004)) % n;
        palm(k, -1, 45 + hash(k * 5) * 28, 8 + hash(k * 9) * 2.5, FROND);
        if (hash(k * 13) > 0.45) bush(k, -1, 32 + hash(k * 17) * 16, [0.32, 0.34, 0.18]);
      }

      // ================= T2/T3 PAIRED GRANDSTANDS (s 0.18, R) =================
      // Paired mid-sized spectator stands on right-hand corners.
      grandstand(0.162, 1, 22, 52, [0.44, 0.45, 0.50], [0.18, 0.18, 0.21]);
      grandstand(0.183, 1, 22, 52, [0.44, 0.45, 0.50], [0.18, 0.18, 0.21]);
      grandstand(0.204, 1, 22, 52, [0.44, 0.45, 0.50], [0.18, 0.18, 0.21]);
      for (const s of [0.162, 0.183, 0.204]) {
        const a = anchor(K(s), 1, 27), b = [a.r, a.u, a.t];
        addBox(out, vadd(a.c, a.u, 17), [15, 2.4, 58], [0.92, 0.92, 0.90], b);
      }
      floodTower(K(0.18), -1, 32, 29);
      floodTower(K(0.20), 1, 32, 29);
      guardrail(0.14, 0.24, 1, 4, [0.78, 0.78, 0.80]);
      marshalPost(K(0.19), 1, 6);
      billboard(K(0.21), 1, 6, 11, 3.4, AD[2]);

      // ================= LOW SAND DUNES (s 0.28, L far) =================
      for (let i = 0; i < 11; i++) {
        const k = (K(0.28) + i * Math.round(n * 0.007)) % n;
        sandWedge(k, -1, 56 + i * 14, 44 + hash(k) * 30, 3 + hash(k * 5) * 3);
      }
      marshalPost(K(0.30), -1, 6);

      // ================= TURNS 4-6 SWEEP — open desert flats (s 0.40, both) ===
      for (let i = 0; i < 8; i++) {
        const k = (K(0.36) + i * Math.round(n * 0.009)) % n;
        for (const side of [-1, 1]) sandWedge(k, side, 90 + i * 20, 50, 3);
      }
      floodTower(K(0.40), -1, 38, 32);
      floodTower(K(0.42), 1, 38, 32);
      floodTower(K(0.44), -1, 38, 32);
      lightPool(K(0.40), -1, 12, 9);
      lightPool(K(0.42), 1, 12, 9);
      guardrail(0.36, 0.50, -1, 4, [0.78, 0.78, 0.80]);
      marshalPost(K(0.43), 1, 6);
      // green artificial-grass verge accents framing the sweep
      for (let i = 0; i < 6; i++) {
        const k = (K(0.38) + i * Math.round(n * 0.011)) % n;
        for (const side of [-1, 1]) place(k, side, 2.0, [3.0, 0.25, 9], [0.20, 0.42, 0.22]);
      }

      // ================= DISTANT LUSAIL / DOHA SKYLINE (s 0.45–0.60, L far) ====
      // Thin pale tower silhouettes low on the horizon. Modern glittering Doha skyline
      // with varied heights, tapered spires, and warm beacon glows reading as pinpricks.
      (function skyline() {
        for (const sBase of [0.46, 0.50, 0.54, 0.58]) {
          for (let i = 0; i < 14; i++) {
            const off = (i - 7) * 28 + hash(i * 11 + sBase * 100) * 12;
            const distVar = 540 + hash(i * 5 + sBase * 70) * 160;
            const a = anchor(K(sBase), -1, distVar);
            const c = vadd(a.c, a.r, off), b = [a.r, a.u, a.t];
            const w = 5.5 + hash(i * 3 + sBase) * 6.5;
            const h = 25 + hash(i * 7 + sBase * 30) * 125;
            // Main tower slab — slightly cooler tone reading as silhouette
            addBox(out, c, [w, h, w], [0.58, 0.72, 0.82], b);
            // Tapered spire crown on tall towers (modern architectural flourish)
            if (h > 100) {
              addPyramid(out, vadd(c, a.u, h * 0.48 + 8), [w * 0.9, 16, w * 0.9], [0.60, 0.74, 0.84], b);
            }
            // warm beacon/navigation lights at the spire tip
            const beaconH = h + (h > 100 ? 8 : 1);
            addBox(out, vadd(c, a.u, beaconH), [1.8, 4.5, 1.8], [1.0, 0.92, 0.70], b);
          }
        }
      })();

      // ================= MARSHAL / TIMING HUTS (s 0.62, R mid) =================
      for (let i = 0; i < 5; i++) {
        const k = (K(0.62) + i * 2) % n;
        place(k, 1, 26 + i * 5, [4, 4, 5], PALE);
        place(k, 1, 26 + i * 5, [4.4, 0.6, 5.4], [0.55, 0.18, 0.16]); // red roof cap (approx)
      }
      marshalPost(K(0.61), 1, 6);
      marshalPost(K(0.66), -1, 6);
      floodTower(K(0.60), 1, 34, 30);
      floodTower(K(0.64), -1, 34, 30);
      guardrail(0.58, 0.68, 1, 4, [0.78, 0.78, 0.80]);
      billboard(K(0.63), -1, 6, 10, 3.2, AD[3]);

      // ================= REPEATING MASTS + CATCH FENCE (s 0.68–0.82, both) =====
      fence(0.66, 0.84, 1, 6, 3.4, [0.66, 0.68, 0.72]);
      fence(0.66, 0.84, -1, 6, 3.4, [0.66, 0.68, 0.72]);
      guardrail(0.66, 0.84, 1, 3.2, [0.78, 0.78, 0.80]);
      guardrail(0.66, 0.84, -1, 3.2, [0.78, 0.78, 0.80]);
      for (const s of [0.70, 0.74, 0.78]) {
        floodTower(K(s), 1, 34, 30);
        floodTower(K(s + 0.01), -1, 34, 30);
        lightPool(K(s), 1, 11, 8);
      }
      tyreWall(0.70, 0.74, -1, 5, [0.85, 0.16, 0.16]);
      marshalPost(K(0.76), 1, 6);
      billboard(K(0.72), 1, 6, 10, 3.2, AD[1]);
      billboard(K(0.80), -1, 6, 10, 3.2, AD[4]);

      // ================= SPARSE PALM ROW + SAND FLATS (s 0.86, L far) =========
      // Scattered palms near the end of the lap with low desert vegetation.
      for (let i = 0; i < 15; i++) {
        const k = (K(0.84) + i * Math.round(n * 0.005)) % n;
        palm(k, -1, 38 + i * 6, 7.2 + hash(k * 3) * 3, FROND);
        if (hash(k * 21) > 0.50) bush(k, -1, 28 + hash(k * 23) * 14, [0.30, 0.32, 0.16]);
      }
      marshalPost(K(0.88), 1, 6);

      // ================= TURN 16 GRANDSTAND + PIT ENTRY (s 0.95, R) ===========
      // Final corner before pit entry — returning onto start/finish straight.
      grandstand(0.93, 1, 17, 75, [0.44, 0.45, 0.50], [0.18, 0.18, 0.21]);
      grandstand(0.952, 1, 17, 55, [0.44, 0.45, 0.50], [0.18, 0.18, 0.21]);
      for (const s of [0.93, 0.952]) {
        const a = anchor(K(s), 1, 24), b = [a.r, a.u, a.t];
        addBox(out, vadd(a.c, a.u, 18), [15, 2.4, 60], [0.92, 0.92, 0.90], b);
      }
      tyreWall(0.91, 0.945, 1, 5, [0.90, 0.86, 0.20]);
      floodTower(K(0.95), 1, 32, 29);
      floodTower(K(0.97), -1, 32, 29);
      marshalPost(K(0.94), -1, 6);
      billboard(K(0.92), 1, 6, 12, 3.6, AD[5]);

      // ---- Scattered palms behind the runoff (desert planting), denser. ----
      every(95, (k) => {
        for (const side of [-1, 1]) {
          if (hash(k * 17 + side * 3) <= 0.58) {
            palm(k, side, 22 + hash(k * 19 + side) * 24, 6 + hash(k * 23 + side) * 4, FROND);
          }
        }
      });

      // ---- Desert scrub: low tan/olive bushes scattered across the sand verge,
      // sparse vegetation between the verge and dune ring for authentic desert appearance. ----
      every(55, (k) => {
        for (const side of [-1, 1]) {
          if (hash(k * 29 + side * 7) <= 0.65) {
            const a = anchor(k, side, 28 + hash(k * 31 + side) * 56), b = [a.r, a.u, a.t];
            const s = 1.6 + hash(k * 37 + side) * 1.8;
            // Mix of tan and muted green tones for natural scrub appearance
            const scrubCol = hash(k * 41 + side) < 0.55 ? [0.48, 0.44, 0.28] : [0.28, 0.34, 0.18];
            addFrustum(out, a.c, s, s * 0.38, s * 0.85, scrubCol, 6, b);
          }
        }
      });

      // ---- Scattered floodlight towers + light pools densely ringing the lap (Qatar signature). ----
      // Tall dark poles with bright white lamp boxes — the defining lighting aesthetic.
      every(200, (k) => {
        const side = hash(k * 9) < 0.5 ? -1 : 1;
        floodTower(k, side, 36 + hash(k * 11) * 14, 30 + hash(k * 13) * 4);
        lightPool(k, side, 11, 8.5 + hash(k * 17) * 1.5);
      });

      // ---- Continuous bright green artificial-grass verge band hugging both edges,
      // the signature moisture-control strip framing the lit asphalt ribbon (prevents sand creep). ----
      every(40, (k) => {
        for (const side of [-1, 1]) {
          // Bright muted green reading as maintained synthetic grass
          place(k, side, 2.0, [3.2, 0.25, 8], [0.20, 0.42, 0.22]);
        }
      });

      // Sand-creep wedges — flat tan aprons simulating sand drifting onto the verge
      for (const [s, side] of [[0.06, 1], [0.07, 1], [0.08, -1], [0.40, -1], [0.42, 1], [0.43, -1], [0.44, 1], [0.92, 1], [0.94, -1], [0.95, 1], [0.96, -1]]) {
        const a = anchor(K(s), side, 14), b = [a.r, a.u, a.t];
        addBox(out, vadd(a.c, a.u, 0.15), [8, 0.3, 12], [0.72, 0.64, 0.48], b);
      }
    },
  }
  );
})();
