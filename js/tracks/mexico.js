/* Apex 26 — MEXICO CITY circuit definition (data only).
   Registered on the global TrackDefs list; consumed by the js/tracks.js engine
   (palette resolved there from `night`, geometry from js/circuits.js or `segs`). */
(function () {
  "use strict";
  (window.TrackDefs = window.TrackDefs || []).push(
  {
    id: "mexico",
    name: "MEXICO CITY",
    gp: "Mexican GP",
    country: "Mexico",
    night: false,
    theme: "modern",
    lengthKm: 4.3,
    baseHW: 8,
    pal: { zenith: [0.58, 0.74, 0.94], horizon: [0.72, 0.68, 0.60], grass: [0.34, 0.52, 0.26], runoff: [0.52, 0.38, 0.24], fogDensity: 0.0015, sunDir: [0.24111167647565865, 0.8639835073711102, 0.44203807353870755], sun: [1, 0.98, 0.88], sunColor: [1, 0.96, 0.86] },
    segs: [
      { t: 0, l: 300 }, { t: -90, l: 100 }, { t: 80, l: 90 }, { t: 0, l: 250 }, { t: 90, l: 100 }, { t: 0, l: 500 },
      { t: -60, l: 80 }, { t: 60, l: 70 }, { t: 0, l: 200 }, { t: 90, l: 100 }, { t: -130, l: 120 },
    ],
    // Stadium section: dips into the baseball/football stadium complex (Foro Sol)
    // then climbs back out through the banked Peraltada run — ~12 m real change.
    elevations: [{ s: 0.62, halfM: 260, rise: -7 }, { s: 0.74, halfM: 220, rise: 5 }],
    scenery: function (api) {
      const { out, n, place, backdrop, groundPlane,
              addBox, addCyl, addPrism, addFrustum, addCone, every, onTrack, hash, vadd, anchor, along,
              building, grandstand, billboard, tree, hedge, fence, palm, pine,
              guardrail, tyreWall, marshalPost, tower, gantry } = api;
      const K = (s) => Math.round(s * n) % n;

      // Festive Mexican palette
      const PINK = [0.92, 0.28, 0.55], ORANGE = [0.98, 0.55, 0.12], GREEN = [0.10, 0.55, 0.30];
      const SEATS = [0.46, 0.47, 0.52], CONCRETE = [0.72, 0.71, 0.68];
      const TREEGRN = [0.22, 0.40, 0.20], PARKGRN = [0.34, 0.52, 0.26];
      const fiesta = [PINK, ORANGE, GREEN, [0.98, 0.82, 0.10]];

      // Papel-picado / banner trim along a stand front (k,side, gap, length)
      const banners = (s, side, gap) => {
        const k = K(s);
        for (let i = -2; i <= 2; i++) {
          const kk = (k + i + n) % n;
          place(kk, side, gap, [0.4, 1.1, 6], fiesta[(kk + (i & 1)) % 4]);
        }
      };

      // Dense fan-colour crowd speckle on a raked stand face (small cube rows).
      // Enhanced for festive density: more rows, smaller boxes, higher colour ratio.
      const crowdSpeckle = (s, side, gap, len, rows, baseH) => {
        const k = K(s), span = Math.max(1, Math.round(len / 5.5));
        for (let i = -span; i <= span; i++) {
          const kk = (k + i + n) % n;
          for (let r = 0; r < rows; r++) {
            const p = anchor(kk, side, gap + 1.4 + r * 2.2);
            if (onTrack(p.c[0], p.c[2], 0.5)) continue;
            const lift = baseH + r * 1.8;
            const col = hash(kk * 17 + r * 5) > 0.35 ? fiesta[(kk * 3 + r) % 4] : SEATS;
            addBox(out, vadd(p.c, p.u, lift), [6.0, 1.6, 6.2], col, [p.r, p.u, p.t]);
          }
        }
      };

      // Floodlight mast: tall pole + angled lamp head, ringing the stadium.
      const lightMast = (k, side, dist, h) => {
        const p = anchor(k, side, dist);
        if (onTrack(p.c[0], p.c[2], 2)) return;
        addCyl(out, p.c, 0.45, h, [0.55, 0.56, 0.58], 6, [p.r, p.u, p.t]);
        addBox(out, vadd(p.c, p.u, h), [4.2, 1.4, 1.2], [0.30, 0.32, 0.36], [p.r, p.u, p.t]);
        for (let i = -1; i <= 1; i++)
          addBox(out, vadd(vadd(p.c, p.u, h + 0.2), p.r, side * i * 1.4), [1.0, 1.0, 0.9], [0.96, 0.96, 0.82], [p.r, p.u, p.t]);
      };

      // --- s=0.00 R near: main grandstand, tall stepped, festive banner trim ---
      grandstand(0.00, 1, 9, 120, SEATS, PINK);
      grandstand(0.00, 1, 24, 120, CONCRETE, GREEN);   // packed second tier behind
      crowdSpeckle(0.00, 1, 9, 120, 4, 2.5);  // MORE dense rows
      banners(0.00, 1, 8);
      grandstand(0.99, 1, 9, 70, SEATS, ORANGE);   // final-corner stand feeding main straight
      grandstand(0.97, 1, 24, 80, CONCRETE, PINK);
      crowdSpeckle(0.985, 1, 9, 70, 4, 2.5);  // MORE dense rows
      // start/finish gantry over the line + scoring board behind the main stand
      gantry(0.00, 8.5, [0.14, 0.14, 0.18]);
      billboard(K(0.005), 1, 7, 14, 5, fiesta[0]);
      {
        const a = anchor(K(0.00), 1, 40);
        addBox(out, vadd(a.c, a.u, 18), [22, 10, 2], [0.08, 0.08, 0.10], [a.r, a.u, a.t]);  // big scoreboard
        addBox(out, vadd(a.c, a.u, 6), [1.0, 12, 1.0], [0.3, 0.3, 0.34], [a.r, a.u, a.t]);  // scoreboard mast
      }

      // --- s=0.02 L near: pit/paddock block, low wide white flat-roof slab ---
      building(K(0.02), -1, 2, 16, 12, 60, { wall: [0.90, 0.90, 0.92],
               window: [0.30, 0.38, 0.44], floor: 3 });
      place(K(0.02), -1, 10, [17, 0.8, 60], [0.82, 0.82, 0.84]);   // flat roof slab
      // pit garage row in front of the paddock (low banded units) + paddock motorhomes behind
      for (const s of [0.005, 0.02, 0.035, 0.05]) {
        building(K(s), -1, 2.5, 7, 5, 14, { wall: [0.93, 0.93, 0.95], window: [0.22, 0.26, 0.30], floor: 2 });
      }
      for (const s of [0.01, 0.03, 0.05]) {
        building(K(s), -1, 22, 14, 9 + hash(K(s)) * 4, 16,
                 { wall: hash(K(s) * 5) > 0.5 ? [0.86, 0.40, 0.30] : [0.30, 0.42, 0.62],
                   window: [0.55, 0.58, 0.62], floor: 2 });
      }
      // control tower at start of pit straight
      tower(K(0.04), -1, 6, 9, 26, { col: [0.82, 0.82, 0.86], cap: true, capCol: [0.20, 0.22, 0.26], mast: 7 });
      marshalPost(K(0.06), 1, 6);

      // --- s=0.06 R far: park tree line along the long straight (denser, leafy park) ---
      hedge(0.04, 0.12, 1, 28, 3.2, TREEGRN);
      for (const s of [0.04, 0.052, 0.064, 0.076, 0.088, 0.100, 0.112]) {
        const k = K(s);
        tree(k, 1, 28 + hash(k) * 20, 10 + hash(k * 3) * 6, TREEGRN);
        tree(k, 1, 48 + hash(k * 5) * 22, 9 + hash(k * 7) * 6, [0.26, 0.44, 0.22]);
        tree(k, 1, 70 + hash(k * 9) * 24, 8 + hash(k * 11) * 5, TREEGRN);
        tree(k, 1, 90 + hash(k * 25) * 20, 9 + hash(k * 27) * 5, PARKGRN);  // extra layer
      }

      // --- s=0.12 R near: Turn 1 grandstand + bold red/white kerb ---
      grandstand(0.12, 1, 9, 80, SEATS, GREEN);
      grandstand(0.12, 1, 24, 80, CONCRETE, ORANGE);   // packed back tier at Turn 1
      crowdSpeckle(0.12, 1, 9, 80, 3, 2.5);  // dense crowds at Turn 1
      const kerb = (s, side, len) => {
        const k = K(s);
        place(k, side, 2, [0.5, 0.16, len], [0.82, 0.16, 0.16]);
        place(k, side, 3.4, [2.6, 0.16, len], [0.94, 0.94, 0.94]);
      };
      kerb(0.12, 1, 9); kerb(0.115, -1, 8);

      // --- s=0.20 both mid: Moises Solana esses, low thin seating boxes + crowds ---
      for (const side of [-1, 1]) {
        grandstand(0.20, side, 8, 48, [0.50, 0.50, 0.54], side < 0 ? ORANGE : PINK);
        crowdSpeckle(0.20, side, 8, 48, 2, 1.5);  // crowd speckle on Solana stands
      }
      kerb(0.20, -1, 7); kerb(0.205, 1, 7);

      // --- CONTINUOUS Mexico City skyline: an unbroken band of building()s
      //     wrapping the far side of the lap. Two depth ranks (front + back) laid
      //     node-by-node so there are no gaps. ---
      const cityBand = (s0, s1, side, step) => {
        along(s0, s1, step, (k) => {
          for (let c = 0; c < 2; c++) {                 // two staggered depth ranks
            const d = (c === 0 ? 150 : 210) + hash(k * 72 + c) * 60 + (k & 1) * 10;
            const p = anchor(k, side, d);
            if (onTrack(p.c[0], p.c[2], 12)) continue;
            const tone = 0.60 + hash(k * 73 + c) * 0.16;
            const h = 26 + hash(k * 74 + c) * 60, w = 12 + hash(k * 75 + c) * 12;
            building(k, side, d - w / 2, w, h, w, { wall: [tone, tone * 0.97, tone * 0.92],
                     window: [tone * 0.66, tone * 0.70, tone * 0.74], floor: 6 });
          }
        });
      };
      // Far side (-1) wraps the long bend through Solana / city / park / lucha.
      cityBand(0.22, 0.50, -1, 26);
      cityBand(0.58, 0.72, -1, 26);
      // Right side fills the far rank opposite the stadium / final sector.
      cityBand(0.30, 0.46, 1, 30);

      // --- s=0.42 R near: Horquilla hairpin, grey runoff, kerb, small fan stand ---
      groundPlane(K(0.42), 1, 5, [60, 1.0, 50], [0.40, 0.40, 0.43]);   // grey runoff
      kerb(0.42, 1, 10);
      grandstand(0.42, 1, 7, 40, [0.50, 0.50, 0.54], ORANGE);
      banners(0.42, 1, 6);

      // --- s=0.55 both mid: park greenery + sports facility low boxes ---
      groundPlane(K(0.55), -1, 24, [200, 1.2, 160], PARKGRN);  // larger, greener park plane
      for (const s of [0.510, 0.530, 0.550, 0.570, 0.590]) {
        const k = K(s);
        building(k, -1, 28 + hash(k) * 32, 24, 9 + hash(k * 3) * 5, 20, { wall: [0.86, 0.86, 0.84],
                 window: [0.40, 0.46, 0.50], floor: 2 });
        tree(k, 1, 26 + hash(k * 5) * 22, 9 + hash(k * 7) * 5, TREEGRN);
        tree(k, 1, 46 + hash(k * 13) * 20, 8 + hash(k * 17) * 5, PARKGRN);
        tree(k, 1, 65 + hash(k * 19) * 18, 7 + hash(k * 21) * 4, TREEGRN);  // extra tree layer
      }

      // --- s=0.66 R far: lucha-libre tribute statue (masked wrestler box on plinth) ---
      {
        const k = K(0.66), d = 36;
        const p = anchor(k, 1, d);
        addBox(out, vadd(p.c, p.u, 1.5), [4, 3, 4], [0.55, 0.55, 0.58], [p.r, p.u, p.t]);  // plinth
        addBox(out, vadd(p.c, p.u, 6), [2.2, 6, 1.6], [0.30, 0.42, 0.85], [p.r, p.u, p.t]); // body (blue suit)
        addBox(out, vadd(p.c, p.u, 9.6), [1.6, 1.6, 1.6], [0.95, 0.20, 0.30], [p.r, p.u, p.t]); // masked head (red)
        place(k, 1, d - 4, [3, 0.2, 6], ORANGE);   // accent base
      }

      // ====== HERO: FORO SOL BASEBALL STADIUM (s≈0.72–0.88) ======
      // Tall encircling concrete bowl the track threads through — raked tiers,
      // dense fan-colour crowd, cantilever roof rim, banner ring, floodlights.
      // The iconic enclosed corridor packed with tens of thousands of fans.
      const stadiumBowl = (s0, s1, side) => {
        along(s0, s1, 7, (k) => {
          // 4 raked concrete tiers stepping back & up — taller & closer together for density
          for (let t = 0; t < 4; t++) {
            const sh = anchor(k, side, 11 + t * 7.5);
            if (onTrack(sh.c[0], sh.c[2], 0.5)) continue;
            addBox(out, vadd(sh.c, sh.u, 7 + t * 9.5), [18, 22 + t * 2.5, 14], CONCRETE, [sh.r, sh.u, sh.t]);
          }
          // VERY dense crowd seat-rows filling the rake facing the corridor
          for (let r = 0; r < 7; r++) {
            const sp = anchor(k, side, 9 + r * 2.2);
            if (onTrack(sp.c[0], sp.c[2], 0.5)) continue;
            const col = hash(k * 19 + r * 7) > 0.38 ? fiesta[(k * 3 + r) % 4] : SEATS;
            addBox(out, vadd(sp.c, sp.u, 3 + r * 2.1), [7.2, 1.5, 6.5], col, [sp.r, sp.u, sp.t]);
          }
          // cantilever roof rim lip over the top tier
          const rf = anchor(k, side, 23);
          if (!onTrack(rf.c[0], rf.c[2], 0.5)) {
            addBox(out, vadd(rf.c, rf.u, 42), [22, 1.4, 14], [0.84, 0.86, 0.90], [rf.r, rf.u, rf.t]);
            // Roof bowl cap: addFrustum closing the bowl ceiling
            addFrustum(out, vadd(rf.c, rf.u, 43.5), 11, 7, 4, [0.78, 0.80, 0.84], 8, [rf.r, rf.u, rf.t]);
          }
        });
      };
      // both bowls hug the slow corridor, threaded by the track
      stadiumBowl(0.72, 0.88, -1);
      stadiumBowl(0.72, 0.88, 1);
      // floodlight masts crowning the bowl rim, ringing the stadium — taller
      for (const s of [0.73, 0.77, 0.81, 0.85]) {
        lightMast(K(s), -1, 27, 42); lightMast(K(s), 1, 27, 42);
      }
      // EXTRA festive banner rings at multiple levels inside the bowl
      for (const s of [0.72, 0.75, 0.79, 0.83, 0.87]) {
        banners(s, -1, 10); banners(s, 1, 10);
      }
      fence(0.72, 0.88, -1, 6, 3.4, [0.80, 0.82, 0.85]);
      fence(0.72, 0.88, 1, 6, 3.4, [0.80, 0.82, 0.85]);
      tyreWall(0.755, 0.775, -1, 4, ORANGE);
      tyreWall(0.795, 0.815, 1, 4, PINK);
      kerb(0.78, -1, 8); kerb(0.80, 1, 8);

      // --- s=0.88 L near: Foro Sol exit gap, bright opening between bowls ---
      place(K(0.88), -1, 12, [12, 18, 8], [0.98, 0.94, 0.80]);   // bright opening — taller
      billboard(K(0.88), 1, 8, 14, 6, fiesta[1]);

      // --- s=0.92 R near: Peraltada / Estadio stand on faint banked edge ---
      grandstand(0.92, 1, 9, 100, SEATS, PINK);
      grandstand(0.92, 1, 24, 100, CONCRETE, GREEN);   // packed Peraltada back tier
      crowdSpeckle(0.92, 1, 9, 100, 4, 2.5);  // denser crowds
      lightMast(K(0.91), 1, 32, 38); lightMast(K(0.95), 1, 32, 38);  // taller lights
      banners(0.92, 1, 9);  // more banners
      // faint banked kerb edge through the Peraltada/Estadio corners
      for (const s of [0.90, 0.93, 0.96]) {
        const k = K(s);
        place(k, 1, 2.5, [2.0, 0.5, 8], [0.78, 0.74, 0.70]);   // low banked kerb edge
        place(k, 1, 2, [0.5, 0.14, 8], [0.82, 0.16, 0.16]);
      }

      // --- Catch fence + scattered park trees & festive flags around the lap ---
      fence(0.10, 0.16, 1, 6, 3.2, [0.80, 0.82, 0.84]);
      // enhanced crowd speckle on key stands
      crowdSpeckle(0.42, 1, 7, 40, 2, 2.0);  // Horquilla hairpin crowds
      // guardrails lining the long start/finish straight + Solana run
      guardrail(0.04, 0.11, 1, 4.5, [0.86, 0.86, 0.90]);
      guardrail(0.04, 0.11, -1, 4.5, [0.86, 0.86, 0.90]);
      guardrail(0.30, 0.40, -1, 5, [0.86, 0.86, 0.90]);
      // marshal posts ringing the lap at key corners
      for (const s of [0.12, 0.20, 0.30, 0.42, 0.55, 0.66, 0.90]) marshalPost(K(s), 1, 6);
      // billboards along the long straight + infield approaches
      billboard(K(0.07), 1, 12, 12, 5, fiesta[2]);
      billboard(K(0.09), 1, 14, 12, 5, fiesta[3]);
      billboard(K(0.33), -1, 16, 14, 5, fiesta[1]);
      billboard(K(0.46), 1, 10, 10, 4, fiesta[0]);
      // palms & park trees clustering the infield & verges
      for (const s of [0.05, 0.08, 0.55, 0.60, 0.92, 0.97]) {
        palm(K(s), 1, 18 + hash(K(s)) * 10, 9 + hash(K(s) * 3) * 4, GREEN);
      }
      every(22, (k) => {
        for (const side of [-1, 1]) {
          if (hash(k * 91 + side) > 0.55) continue;
          const d = 26 + hash(k * 92 + side) * 50;
          const p = anchor(k, side, d);
          if (onTrack(p.c[0], p.c[2], 9)) continue;
          tree(k, side, d, 8 + hash(k * 94 + side) * 5,
               hash(k * 96 + side) > 0.5 ? TREEGRN : PARKGRN);
        }
      });
      // flag poles with festive flags
      every(60, (k) => {
        const side = hash(k * 31) > 0.5 ? 1 : -1, d = 14 + hash(k * 32) * 8;
        const p = anchor(k, side, d);
        if (onTrack(p.c[0], p.c[2], 8)) return;
        addCyl(out, p.c, 0.18, 9, [0.85, 0.85, 0.85], 5, [p.r, p.u, p.t]);
        addBox(out, vadd(p.c, p.u, 8), [2.4, 1.4, 0.2], fiesta[k % 4], [p.r, p.u, p.t]);
      });

      // --- Distant hazed skyline ring: CONTINUOUS pale washed city band (high-altitude haze) ---
      every(35, (k) => {
        for (const side of [-1, 1]) {
          const d = 360 + hash(k * 82 + side) * 110 + (k & 1) * 20;
          backdrop(k, side, d,
                   [100, 28 + hash(k * 83 + side) * 32, 45], [0.62, 0.65, 0.70]);  // more pale, cooler high-altitude tone
        }
      });

      // --- Aztec stepped pyramid accent at s≈0.40–0.50 (infield monument) ---
      {
        const pA = anchor(K(0.45), -1, 55);
        if (!onTrack(pA.c[0], pA.c[2], 14)) {
          const pb = [pA.r, pA.u, pA.t];
          const STONE = [0.68, 0.60, 0.44];
          // Three stacked boxes, each smaller — stepped pyramid silhouette
          addBox(out, vadd(pA.c, pA.u, 2),  [20, 4, 20], STONE, pb);  // base level
          addBox(out, vadd(pA.c, pA.u, 6),  [14, 4, 14], STONE, pb);  // mid level
          addBox(out, vadd(pA.c, pA.u, 10), [8,  4, 8],  STONE, pb);  // top level
        }
      }

      // --- Cactus / arid vegetation: saguaro-style every 20m on outer side ---
      every(20, (k) => {
        for (const side of [1, -1]) {
          if (hash(k * 57 + side) > 0.65) continue;
          const d = 30 + hash(k * 63 + side) * 30;
          const p = anchor(k, side, d);
          if (onTrack(p.c[0], p.c[2], 8)) continue;
          const h = 5 + hash(k * 67 + side) * 3;
          // Tall saguaro trunk
          addCyl(out, p.c, 1.2, h, [0.25, 0.38, 0.18], 6, [p.r, p.u, p.t]);
          // Horizontal cross-arm near the top
          addBox(out, vadd(p.c, p.u, h * 0.7), [4.5, 1.0, 1.2], [0.25, 0.38, 0.18], [p.r, p.u, p.t]);
        }
      });

      // --- Mexico City skyline at altitude: 12+ buildings at 220–320m distance for horizon depth ---
      for (let i = 0; i < 12; i++) {
        const f = i / 12;
        const k = K(f);
        const side = i % 2 === 0 ? -1 : 1;
        const d = 240 + hash(i * 29) * 120;
        const h = 45 + hash(i * 37) * 60;
        const w = 18 + hash(i * 53) * 16;
        const p = anchor(k, side, d);
        if (!onTrack(p.c[0], p.c[2], 20))
          building(k, side, d - w / 2, w, h, w,
            { wall: [0.54, 0.56, 0.62], window: [0.32, 0.38, 0.50], floor: 7 });
      }

      // --- Peraltada banked corner Mexican flag strips (s≈0.88–0.95) ---
      // Green, white, red banner accents at the outer grandstand area
      for (let i = 0; i < 5; i++) {
        const f = 0.88 + i * 0.015;
        const k = K(f);
        place(k, 1, 16, [0.4, 6, 14], [0.12, 0.56, 0.24]);   // green banner
        place(k, 1, 19, [0.4, 6, 14], [0.92, 0.92, 0.90]);    // white banner
        place(k, 1, 22, [0.4, 6, 14], [0.80, 0.14, 0.18]);    // red banner
      }
    },
  }
  );
})();
