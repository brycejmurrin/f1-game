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
    pal: { horizon: [0.22, 0.12, 0.04], zenith: [0.04, 0.03, 0.09], sunColor: [0.85, 0.70, 0.42], ambientSky: [0.28, 0.22, 0.14], ambientGround: [0.30, 0.20, 0.10], fogColor: [0.18, 0.10, 0.04], fogDensity: 0.0030, concrete: [0.28, 0.26, 0.24], runoff: [0.24, 0.22, 0.2], grass: [0.2, 0.18, 0.14] },
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
      const DUNE = [0.76, 0.64, 0.46], DUNE_N = [0.50, 0.41, 0.29];
      const SAND = [0.58, 0.47, 0.32], SAND_D = [0.40, 0.32, 0.21];   // dune-ring tones
      const SEAT = [0.16, 0.16, 0.19], STEEL = [0.13, 0.13, 0.16], PALE = [0.92, 0.92, 0.88];
      const FLOOD = [0.97, 0.97, 0.93], GREY = [0.42, 0.43, 0.47];
      const SKYLINE = [0.55, 0.70, 0.80];
      const DARKGLASS = [0.30, 0.34, 0.40], WHITEROOF = [0.85, 0.85, 0.82];
      const FROND = [0.14, 0.30, 0.14];
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
          addBox(out, lc, [1.9, 1.5, 1.4], FLOOD, b);
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
      // dunes wrapping the whole lap, computed from the track centre so it never
      // scatters into the infield or leaves gaps. Two concentric rings (inner low
      // tan, outer slightly taller darker) read as rolling desert with no snow. --
      (function duneRing() {
        let cx = 0, cz = 0;
        for (let i = 0; i < n; i++) { cx += px[i]; cz += pz[i]; }
        cx /= n; cz /= n;
        let rad = 0;
        for (let i = 0; i < n; i++) rad = Math.max(rad, Math.hypot(px[i] - cx, pz[i] - cz));
        // [extraDist, ringRadiusFudge, baseW, baseH, count, sand, dark]
        for (const [extra, wMin, hMin, count, sand, dark] of [
          [190, 130, 8, 46, SAND, SAND_D],    // inner low dune band, dense overlap
          [360, 200, 15, 36, SAND_D, DUNE_N], // outer taller hazed band
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
      // Pit building (L, close): record-length white slab + thin glass stripe.
      building(K(0.00), -1, 2, 14, 11, 150, { wall: PALE, window: DARKGLASS, floor: 4 });
      // Upper paddock / hospitality deck stacked back behind the pit roof.
      building(K(0.01), -1, 16, 11, 8, 120, { wall: WHITEROOF, window: DARKGLASS, floor: 3 });
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
      // slab. Built as a chain of overlapping curved sections sweeping the straight.
      (function crescentStand() {
        for (let i = 0; i < 8; i++) {
          const s = 0.955 + i * 0.012;
          grandstand(s % 1, 1, 16, 50, [0.80, 0.80, 0.76], SEAT);  // pale curved shell
        }
        // pale curved roof fascia + support pylons, reading as one smooth crescent
        for (let i = 0; i < 8; i++) {
          const a = anchor(K((0.955 + i * 0.012) % 1), 1, 21), b = [a.r, a.u, a.t];
          addBox(out, vadd(a.c, a.u, 23), [17, 2.6, 52], PALE, b);     // roof slab
          addBox(out, vadd(a.c, a.u, 12), [0.8, 22, 0.8], WHITEROOF, b); // front pylon
          // sponsor band across the roof fascia front face
          addBox(out, vadd(vadd(a.c, a.u, 24), a.r, -8), [0.6, 1.8, 40], AD[i % AD.length], b);
        }
      })();

      // Start/finish floodlight towers, both sides + ground light pools.
      for (const s of [0.0, 0.02, 0.04]) {
        for (const side of [-1, 1]) {
          floodTower(K(s), side, 40, 34);
          lightPool(K(s), side, 12, 10);
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
      // Heavy-braking zone, prime overtake — big stand + tyre wall + run-off.
      grandstand(0.055, 1, 22, 90, GREY, SEAT);
      grandstand(0.072, 1, 22, 60, GREY, SEAT);
      for (let i = 0; i < 6; i++) {
        const a = anchor(K((0.055 + i * 0.012) % 1), 1, 27), b = [a.r, a.u, a.t];
        addBox(out, vadd(a.c, a.u, 23), [16, 2.2, 50], WHITEROOF, b); // roof line
      }
      tyreWall(0.04, 0.085, 1, 5, [0.90, 0.86, 0.20]);   // T1 outside tyre stack
      floodTower(K(0.06), 1, 36, 32);
      floodTower(K(0.08), 1, 36, 32);
      floodTower(K(0.05), -1, 36, 32);
      marshalPost(K(0.05), -1, 6);
      billboard(K(0.06), 1, 6, 12, 3.6, AD[0]);

      // ================= PALM CLUSTER (s 0.10, L far) =================
      for (let i = 0; i < 11; i++) {
        const k = (K(0.10) + i * Math.round(n * 0.005)) % n;
        palm(k, -1, 40 + hash(k * 5) * 30, 7 + hash(k * 9) * 3, FROND);
        if (hash(k * 13) > 0.5) bush(k, -1, 28 + hash(k * 17) * 14, [0.34, 0.36, 0.20]);
      }

      // ================= T2/T3 PAIRED GRANDSTANDS (s 0.18, R) =================
      grandstand(0.165, 1, 24, 50, GREY, SEAT);
      grandstand(0.185, 1, 24, 50, GREY, SEAT);
      grandstand(0.205, 1, 24, 50, GREY, SEAT);
      for (const s of [0.165, 0.185, 0.205]) {
        const a = anchor(K(s), 1, 29), b = [a.r, a.u, a.t];
        addBox(out, vadd(a.c, a.u, 16), [14, 1.8, 44], WHITEROOF, b);
      }
      floodTower(K(0.18), -1, 34, 30);
      floodTower(K(0.20), 1, 34, 30);
      guardrail(0.14, 0.24, 1, 4, [0.78, 0.78, 0.80]);
      marshalPost(K(0.19), 1, 6);
      billboard(K(0.21), 1, 6, 10, 3.2, AD[2]);

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
      // Thin pale tower silhouettes low on the horizon, behind the dune ring,
      // spread across a wide arc with varied heights + beacon lights.
      (function skyline() {
        for (const sBase of [0.48, 0.52, 0.56]) {
          for (let i = 0; i < 12; i++) {
            const off = (i - 6) * 30 + hash(i * 11 + sBase * 100) * 14;
            const a = anchor(K(sBase), -1, 560 + hash(i * 5 + sBase * 70) * 150);
            const c = vadd(a.c, a.r, off), b = [a.r, a.u, a.t];
            const w = 6 + hash(i * 3 + sBase) * 7;
            const h = 30 + hash(i * 7 + sBase * 30) * 110;
            addBox(out, c, [w, h, w], SKYLINE, b);
            // tapered crown on the taller ones (Doha-style towers)
            if (h > 90) addPyramid(out, vadd(c, a.u, h * 0.5 + 6), [w, 14, w], SKYLINE, b);
            addBox(out, vadd(c, a.u, h * 0.5 + (h > 90 ? 14 : 1)), [1.6, 4, 1.6], FLOOD, b); // beacon
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
      for (let i = 0; i < 13; i++) {
        const k = (K(0.84) + i * Math.round(n * 0.006)) % n;
        palm(k, -1, 34 + i * 7, 6 + hash(k * 3) * 4, FROND);
        if (hash(k * 21) > 0.55) bush(k, -1, 26 + hash(k * 23) * 12, [0.34, 0.36, 0.20]);
      }
      marshalPost(K(0.88), 1, 6);

      // ================= TURN 16 GRANDSTAND + PIT ENTRY (s 0.95, R) ===========
      grandstand(0.93, 1, 18, 70, GREY, SEAT);
      grandstand(0.955, 1, 18, 50, GREY, SEAT);
      for (const s of [0.93, 0.955]) {
        const a = anchor(K(s), 1, 23), b = [a.r, a.u, a.t];
        addBox(out, vadd(a.c, a.u, 17), [14, 1.8, 44], WHITEROOF, b);
      }
      tyreWall(0.91, 0.945, 1, 5, [0.90, 0.86, 0.20]);
      floodTower(K(0.95), 1, 34, 30);
      floodTower(K(0.97), -1, 34, 30);
      marshalPost(K(0.94), -1, 6);
      billboard(K(0.92), 1, 6, 11, 3.4, AD[5]);

      // ---- Scattered palms behind the runoff (desert planting), denser. ----
      every(95, (k) => {
        for (const side of [-1, 1]) {
          if (hash(k * 17 + side * 3) <= 0.58) {
            palm(k, side, 22 + hash(k * 19 + side) * 24, 6 + hash(k * 23 + side) * 4, FROND);
          }
        }
      });

      // ---- Desert scrub: low tan/olive bushes scattered across the sand verge,
      // breaking up the flats between the dunes and the dune ring. ----
      every(60, (k) => {
        for (const side of [-1, 1]) {
          if (hash(k * 29 + side * 7) <= 0.6) {
            const a = anchor(k, side, 30 + hash(k * 31 + side) * 60), b = [a.r, a.u, a.t];
            const s = 1.4 + hash(k * 37 + side) * 1.6;
            addFrustum(out, a.c, s, s * 0.4, s * 0.8,
                       hash(k * 41 + side) < 0.5 ? [0.46, 0.42, 0.26] : [0.30, 0.36, 0.20], 6, b);
          }
        }
      });

      // ---- Scattered marshal-post light pools + extra masts ringing the lap. ----
      every(220, (k) => {
        const side = hash(k * 9) < 0.5 ? -1 : 1;
        floodTower(k, side, 40 + hash(k * 11) * 16, 28 + hash(k * 13) * 5);
        lightPool(k, side, 12, 8);
      });

      // ---- Continuous green artificial-grass verge band hugging both edges,
      // the signature anti-sand strip framing the lit asphalt ribbon. ----
      every(46, (k) => {
        for (const side of [-1, 1]) place(k, side, 2.0, [3.0, 0.2, 7], [0.20, 0.42, 0.22]);
      });
    },
  }
  );
})();
