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
    pal: { horizon: [0.08, 0.10, 0.14], zenith: [0.03, 0.04, 0.09], ambientSky: [0.15, 0.16, 0.20], ambientGround: [0.12, 0.12, 0.14], fogColor: [0.10, 0.12, 0.16], fogDensity: 0.0015, concrete: [0.17, 0.17, 0.19], runoff: [0.24, 0.22, 0.2], grass: [0.20, 0.42, 0.22] },
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

      // ---- Floodlight tower: tall dark pole topped by bright white lamp array.
      // The defining "Qatar night" motif — pure white banks cut desert blackness. ----
      const floodTower = (k, side, gap, h) => {
        const a = anchor(k, side, gap), b = [a.r, a.u, a.t];
        // Slender dark tapered pole
        addCyl(out, a.c, 0.50, h, STEEL, 6, b);
        // tapered upper section for finished proportions
        addCyl(out, vadd(a.c, a.u, h - 3.5), 0.68, 3.5, STEEL, 6, b);
        // horizontal cross-truss carrying lamp banks (wider spread)
        addBox(out, vadd(a.c, a.u, h - 0.8), [8.4, 0.35, 0.45], STEEL, b);
        // Four bright lamp boxes across the truss — intense white lit faces
        for (const dx of [-3.2, -1.0, 1.0, 3.2]) {
          const lc = vadd(vadd(a.c, a.u, h - 0.3), a.r, dx);
          addBox(out, lc, [2.0, 2.2, 1.8], FLOOD, b);
        }
        // bright upper cap ledge casting light downward
        addBox(out, vadd(a.c, a.u, h + 0.9), [8.2, 0.3, 1.4], FLOOD, b);
      };

      // ---- Glowing light pool on the ground beneath a mast (bright lit white, Qatar signature). ----
      const lightPool = (k, side, gap, r) => {
        const a = anchor(k, side, gap), b = [a.r, a.u, a.t];
        addCyl(out, vadd(a.c, a.u, 0.04), r, 0.08, [0.88, 0.88, 0.85], 8, b);
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
          [160, 130, 7, 32, SAND, SAND_D],     // inner: close smooth dunes (reduced from 52)
          [280, 170, 12, 28, DUNE, DUNE_N],    // middle: undulating ridge band (reduced from 48)
          [400, 240, 20, 20, SAND_D, [0.38, 0.30, 0.18]], // outer: distant hazy range (reduced from 36)
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
      // Pit building (L, close): record-length sleek white slab + thin smart glass.
      // Modern minimalist desert design with pale walls reading clean against night sky.
      building(K(0.00), -1, 1.2, 16, 11, 165, { wall: [0.94, 0.94, 0.92], window: [0.32, 0.38, 0.46], floor: 3.6 });
      // Upper paddock / hospitality deck stacked back behind the pit roof.
      building(K(0.01), -1, 17, 13, 8, 135, { wall: [0.90, 0.90, 0.88], window: [0.30, 0.36, 0.44], floor: 3.2 });
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

      // Main Grandstand (R, close): the hero — long curved crescent stepped slab.
      // Modern sleek design reading as pale curved shell against black desert night.
      (function crescentStand() {
        for (let i = 0; i < 10; i++) {
          const s = 0.950 + i * 0.011;
          // Pale white shell reading clean against night sky
          grandstand(s % 1, 1, 16, 60, [0.86, 0.86, 0.84], [0.20, 0.20, 0.24]);  // shell + crowd
        }
        // bright white curved roof fascia with slim support pylons
        for (let i = 0; i < 10; i++) {
          const a = anchor(K((0.950 + i * 0.011) % 1), 1, 24), b = [a.r, a.u, a.t];
          addBox(out, vadd(a.c, a.u, 25), [16, 3.2, 75], [0.94, 0.94, 0.92], b);  // bright roof
          addBox(out, vadd(a.c, a.u, 12.5), [0.8, 25, 0.8], [0.90, 0.90, 0.88], b); // support pylon
          // sponsor band across the roof fascia front face
          addBox(out, vadd(vadd(a.c, a.u, 26), a.r, -9), [0.6, 1.8, 45], AD[i % AD.length], b);
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
      // Thin pale tower silhouettes low on the horizon. Modern Lusail skyline with
      // varied sleek tapered towers and cool teal beacon glow reading as distant pricks.
      (function skyline() {
        for (const sBase of [0.48, 0.52, 0.56]) {
          for (let i = 0; i < 12; i++) {
            const off = (i - 6) * 32 + hash(i * 13 + sBase * 100) * 14;
            const distVar = 580 + hash(i * 5 + sBase * 70) * 180;
            const a = anchor(K(sBase), -1, distVar);
            const c = vadd(a.c, a.r, off), b = [a.r, a.u, a.t];
            const w = 4.2 + hash(i * 3 + sBase) * 4.8;
            const h = 38 + hash(i * 7 + sBase * 30) * 140;  // taller, more dramatic
            // Main tower slab — cool teal reading as night-lit silhouette
            addBox(out, c, [w, h, w], [0.52, 0.68, 0.78], b);
            // Tapered spire crown on tall towers (sleek modern tapers)
            if (h > 110) {
              addPyramid(out, vadd(c, a.u, h * 0.50 + 6), [w * 0.85, 12, w * 0.85], [0.56, 0.70, 0.80], b);
            }
            // Cool teal beacon lights at tip (night navigation aesthetic)
            const beaconH = h + (h > 110 ? 6 : 0.5);
            addBox(out, vadd(c, a.u, beaconH), [1.4, 3.2, 1.4], [0.70, 0.88, 0.95], b);
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

      // ---- Scattered palms behind the runoff (desert planting), sparse. ----
      every(140, (k) => {
        for (const side of [-1, 1]) {
          if (hash(k * 17 + side * 3) <= 0.45) {
            palm(k, side, 24 + hash(k * 19 + side) * 26, 6.5 + hash(k * 23 + side) * 3.5, FROND);
          }
        }
      });

      // ---- Desert scrub: sparse low tan/olive bushes scattered across sand verge for
      // authentic desert appearance (not overly dense). ----
      every(80, (k) => {
        for (const side of [-1, 1]) {
          if (hash(k * 29 + side * 7) <= 0.48) {
            const a = anchor(k, side, 32 + hash(k * 31 + side) * 60), b = [a.r, a.u, a.t];
            const s = 1.8 + hash(k * 37 + side) * 1.6;
            // Mix of tan and muted green tones for natural scrub appearance
            const scrubCol = hash(k * 41 + side) < 0.55 ? [0.50, 0.46, 0.32] : [0.30, 0.36, 0.20];
            addFrustum(out, a.c, s, s * 0.40, s * 0.90, scrubCol, 6, b);
          }
        }
      });

      // ---- Scattered floodlight towers + light pools ringing the lap (Qatar signature). ----
      // Tall dark poles with bright white lamp boxes — the defining lighting aesthetic.
      every(280, (k) => {
        const side = hash(k * 9) < 0.5 ? -1 : 1;
        floodTower(k, side, 38 + hash(k * 11) * 12, 31 + hash(k * 13) * 3);
        lightPool(k, side, 12, 9 + hash(k * 17) * 1.2);
      });

      // ---- Continuous bright green artificial-grass verge band hugging both edges,
      // the signature moisture-control strip framing the lit asphalt ribbon (prevents sand creep). ----
      every(50, (k) => {
        for (const side of [-1, 1]) {
          // Bright muted green reading as maintained synthetic grass
          place(k, side, 1.8, [3.4, 0.28, 10], [0.22, 0.44, 0.24]);
        }
      });

      // Sand-creep wedges — flat tan aprons simulating sand drifting onto verge at high-speed corners
      for (const [s, side, w, d] of [
        [0.06, 1, 9, 14], [0.08, -1, 8, 12], [0.40, -1, 7, 11], [0.42, 1, 8, 13],
        [0.44, 1, 7, 10], [0.92, 1, 9, 15], [0.94, -1, 8, 12], [0.96, -1, 7, 11]
      ]) {
        const a = anchor(K(s), side, 13), b = [a.r, a.u, a.t];
        addBox(out, vadd(a.c, a.u, 0.12), [w, 0.25, d], [0.70, 0.62, 0.46], b);
      }
    },
  }
  );
})();
