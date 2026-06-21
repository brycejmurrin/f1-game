/* Apex 26 — ALBERT PARK circuit definition (data only).
   Registered on the global TrackDefs list; consumed by the js/tracks.js engine
   (palette resolved there from `night`, geometry from js/circuits.js or `segs`). */
(function () {
  "use strict";
  (window.TrackDefs = window.TrackDefs || []).push(
  {
    id: "albert_park",
    name: "ALBERT PARK",
    gp: "Australian GP",
    country: "Australia",
    night: false,
    theme: "green",
    lengthKm: 5.3,
    baseHW: 7,
    pal: { zenith: [0.22, 0.44, 0.82], horizon: [0.74, 0.78, 0.82], grass: [0.24, 0.5, 0.18], runoff: [0.48, 0.42, 0.32], fogDensity: 0.0012, sunDir: [0.6666666666666667, 0.6666666666666667, 0.33333333333333337], sun: [1, 0.95, 0.8], sunColor: [1, 0.93, 0.78] },
    segs: [
      { t: 0, l: 300 }, { t: 50, l: 100 }, { t: -50, l: 90 }, { t: 65, l: 80 }, { t: 0, l: 200 }, { t: 80, l: 90 },
      { t: -90, l: 100 }, { t: 60, l: 90 }, { t: 0, l: 260 }, { t: 80, l: 90 }, { t: 0, l: 200 }, { t: 70, l: 80 },
    ],
    // Gentle parkland undulation: slight rise through the T11-T15 lakeside section,
    // then a dip back through the T1-T4 approach — mirrors Melbourne's actual terrain.
    elevations: [{ s: 0.12, halfM: 340, rise: 7 }, { s: 0.55, halfM: 300, rise: -5 }],
    scenery: function (api) {
      const { out, n, px, pz, pyMin, place, prop, backdrop, groundPlane, groundYAt,
              every, hash, onTrack,
              grandstand, building, tower, tree, palm, bush, hedge, billboard, gantry,
              marshalPost, fence, guardrail, tyreWall, anchor, vadd, addBox,
              addCyl, addCone, addFrustum, addPyramid, addPrism } = api;
      const k = (s) => Math.round(s * n) % n;

      // ---- Palette (Melbourne lakeside parkland, bright day) ----
      const GRASS = [0.32, 0.62, 0.28];
      const TREE = [0.16, 0.40, 0.20];
      const WATER = [0.20, 0.45, 0.62];
      const WHITE = [0.92, 0.92, 0.92], RED = [0.80, 0.15, 0.15];
      const SHELL = [0.46, 0.47, 0.52], CROWD = [0.70, 0.60, 0.55];

      // ---- Track centre (for skyline / lake placement reference) ----
      let cx = 0, cz = 0;
      for (let i = 0; i < n; i++) { cx += px[i]; cz += pz[i]; }
      cx /= n; cz /= n;

      // ====================================================================
      // ALBERT PARK LAKE — broad flat steel-blue slab to the L horizon, laid as
      // a CONTINUOUS water sheet wrapping the whole skyline side (s≈0.30–0.60 L)
      // ====================================================================
      groundPlane(k(0.45), -1, 70, [1100, 4, 1100], WATER);
      groundPlane(k(0.40), -1, 90, [700, 4, 700], [0.22, 0.47, 0.64]);
      groundPlane(k(0.55), -1, 80, [700, 4, 700], [0.22, 0.47, 0.64]);
      // shoreline shimmer band + a couple of moored sail boats near the bank
      groundPlane(k(0.48), -1, 40, [420, 4, 50], [0.30, 0.55, 0.68]);
      for (let j = 0; j < 4; j++) {
        const a = anchor((k(0.46) + j * 20) % n, -1, 48 + hash(j * 5) * 30);
        if (onTrack(a.c[0], a.c[2], 4)) continue;
        addBox(out, vadd(a.c, a.u, 1.0), [2.2, 1.4, 6], [0.92, 0.92, 0.94], [a.r, a.u, a.t]); // hull
        addPrism(out, vadd(a.c, a.u, 5.5), [0.3, 7, 4.5], [0.96, 0.96, 0.97], [a.r, a.u, a.t]); // sail
      }

      // ====================================================================
      // MELBOURNE CBD SKYLINE — dense band of blue-grey towers far across the
      // lake (s≈0.20–0.46 R), varied heights / tapers, packed shoulder-to-
      // shoulder, with a few signature spires and a faint silhouette ridge.
      // ====================================================================
      const CBD_WIN = [0.55, 0.65, 0.80];
      const CBD_N = 46, CBD_S0 = 0.19, CBD_S1 = 0.47;
      for (let i = 0; i < CBD_N; i++) {
        const f = i / (CBD_N - 1);
        const s = CBD_S0 + f * (CBD_S1 - CBD_S0);     // unbroken span across lake
        const dist = 195 + hash(i * 7) * 95;          // far behind the lake, layered
        const w = 13 + hash(i * 3) * 14;              // wide enough to overlap → no gaps
        const h = 55 + hash(i * 11) * 150;            // tall, varied CBD profile
        const wallCol = [0.28 + hash(i * 5) * 0.08, 0.34 + hash(i * 2) * 0.05, 0.46];
        building(k(s), 1, dist - w / 2, w, h, w, {
          wall: wallCol, window: CBD_WIN, floor: 6,
          setback: hash(i * 13) > 0.6, roof: hash(i * 17) > 0.7,
        });
      }
      // a few taller landmark towers + spires (Eureka/Rialto feel) rising above
      for (const [s, dist, bw, th, mast] of [
        [0.27, 250, 26, 230, 36], [0.33, 235, 22, 205, 22],
        [0.39, 270, 24, 215, 0], [0.23, 255, 20, 175, 28]]) {
        tower(k(s), 1, dist, bw, th, { col: [0.30, 0.38, 0.50], seg: 6,
          cap: true, capCol: [0.20, 0.28, 0.40], mast });
      }
      // continuous distant silhouette band behind the towers (overlapping → solid)
      for (let i = 0; i < 26; i++) {
        const f = i / 25;
        backdrop(k(CBD_S0 - 0.03 + f * (CBD_S1 - CBD_S0 + 0.06)), 1,
                 320 + hash(i * 5) * 130,
                 [30 + hash(i * 9) * 26, 44 + hash(i * 13) * 90, 22], [0.40, 0.46, 0.54]);
      }
      // a low foreground city block layer across the lake (mid-rise, hazier)
      for (let i = 0; i < 20; i++) {
        const f = i / 19;
        const s = CBD_S0 - 0.01 + f * (CBD_S1 - CBD_S0 + 0.02);
        const w = 18 + hash(i * 31) * 16, h = 26 + hash(i * 37) * 40;
        building(k(s), 1, 165 + hash(i * 41) * 25, w, h, w, {
          wall: [0.40, 0.46, 0.55], window: [0.52, 0.60, 0.72], floor: 5 });
      }

      // ====================================================================
      // LOW distant Melbourne treeline backdrop, both sides (flat parkland)
      // ====================================================================
      every(80, (kk) => {
        for (const side of [-1, 1]) {
          backdrop(kk, side, 180 + hash(kk * 6 + side) * 70, [120, 18, 100], [0.18, 0.34, 0.20]);
        }
      });

      // ====================================================================
      // PARKLAND — DENSE broadleaf trees + bushes through the park (both sides)
      // ====================================================================
      every(28, (kk) => {
        for (const side of [-1, 1]) {
          if (hash(kk * 21 + side) > 0.78) continue;     // denser fill
          const dist = 24 + hash(kk * 22 + side) * 62;
          tree(kk, side, dist, 8 + hash(kk * 24 + side) * 6, TREE);
          if (hash(kk * 27 + side) > 0.5)               // second tree, staggered
            tree(kk, side, dist + 14 + hash(kk * 29 + side) * 18,
                 7 + hash(kk * 33 + side) * 6, TREE);
          if (hash(kk * 31 + side) > 0.55) bush(kk, side, dist - 5, TREE);
        }
      });
      // dense tree clusters at signature parkland spots (both sides)
      for (const [sc, cnt] of [[0.20, 8], [0.36, 7], [0.70, 7], [0.86, 6]]) {
        for (const side of [-1, 1]) {
          for (let j = 0; j < cnt; j++) {
            const kk = (k(sc) + j) % n;
            tree(kk, side, 22 + hash(kk * 3 + j + sc * 50) * 26,
                 8 + hash(kk * 5 + j) * 6, TREE);
            if (hash(kk * 7 + j) > 0.6) bush(kk, side, 18 + hash(kk * 9 + j) * 10, TREE);
          }
        }
      }

      // ---- Palm avenue along the fast Lakeside Drive section (s≈0.50–0.60 L) ----
      for (let j = 0; j < 18; j++) {
        const kk = (k(0.49) + j) % n;
        palm(kk, -1, 16 + hash(kk * 9 + j) * 10, 10 + hash(kk * 12 + j) * 6, [0.20, 0.46, 0.24]);
        if (hash(kk * 17 + j) > 0.5)
          palm(kk, -1, 30 + hash(kk * 19 + j) * 12, 9 + hash(kk * 23 + j) * 5, [0.20, 0.46, 0.24]);
      }
      // palm clusters by the pits/start and around grandstands as locale flavour
      for (let j = 0; j < 5; j++) {
        palm((k(0.0) + j) % n, 1, 16 + j * 6, 11 + hash(j * 3) * 3, [0.20, 0.46, 0.24]);
        palm((k(0.96) + j) % n, 1, 16 + j * 6, 11 + hash(j * 5) * 3, [0.20, 0.46, 0.24]);
        palm((k(0.62) + j) % n, 1, 40 + j * 6, 10 + hash(j * 7) * 3, [0.20, 0.46, 0.24]);
      }

      // ====================================================================
      // GRANDSTANDS — main straight + signature corners (crowd-tinted)
      // ====================================================================
      grandstand(0.00, -1, 12, 90, SHELL, CROWD);   // main grandstand, pit straight L
      grandstand(0.07, -1, 14, 60, SHELL, CROWD);   // extended pit-straight bank L
      grandstand(0.04, 1, 14, 55, SHELL, CROWD);    // Turn 1-2 sweep R
      grandstand(0.12, 1, 16, 48, SHELL, CROWD);    // Turn 3 exit bank R
      grandstand(0.30, -1, 16, 50, SHELL, CROWD);   // lakeside spectator bank L
      grandstand(0.55, -1, 16, 55, SHELL, CROWD);   // Lakeside Drive bank L
      grandstand(0.62, 1, 14, 60, SHELL, CROWD);    // spectator grandstand R
      grandstand(0.66, 1, 16, 45, SHELL, CROWD);    // adjoining spectator bank R
      grandstand(0.78, -1, 14, 45, SHELL, CROWD);   // chicane complex L
      grandstand(0.90, 1, 18, 50, SHELL, CROWD);    // fan-hill grandstand R
      grandstand(0.95, -1, 14, 48, SHELL, CROWD);   // pit-approach bank L
      grandstand(0.20, 1, 16, 46, SHELL, CROWD);    // fast section R
      grandstand(0.45, -1, 16, 44, SHELL, CROWD);   // lakeside bank L

      // ---- Pit building + garages: long low white box row, dark roof (s≈0.0 R)
      building(k(0.0), 1, 5, 14, 9, 180, { wall: [0.86, 0.87, 0.88], window: [0.18, 0.22, 0.28], floor: 4 });
      {
        const a = anchor(k(0.0), 1, 12);
        addBox(out, vadd(a.c, a.u, 9.6), [18, 0.8, 190], [0.30, 0.32, 0.34], [a.r, a.u, a.t]); // dark roof slab
      }
      // marquee tent caps beside the s≈0.62 grandstand
      for (let j = 0; j < 3; j++) {
        const a = anchor(k(0.62), 1, 30 + j * 10);
        addBox(out, vadd(a.c, a.u, 5), [12, 0.6, 12], WHITE, [a.r, a.u, a.t]);
      }

      // ---- Paddock container-stack boxes near pit entry (s≈0.97 L) ----
      for (let j = 0; j < 4; j++) {
        place(k(0.97), -1, 16 + j * 5, [6, 3, 12],
              [[0.70, 0.30, 0.25], [0.30, 0.40, 0.60], [0.80, 0.78, 0.40], [0.55, 0.55, 0.58]][j]);
      }

      // ---- Lakeside grass fan banking / hill (s≈0.90 R) ----
      for (let j = 0; j < 4; j++) {
        place(k(0.90), 1, 25 + j * 8, [30, 2 + j * 1.5, 24], GRASS);
      }

      // ====================================================================
      // KERBS + run-off framing at corner apexes / chicanes
      // ====================================================================
      for (const [s, side] of [[0.04, 1], [0.06, -1], [0.30, 1], [0.62, 1],
                                [0.78, -1], [0.78, 1], [0.80, -1], [0.97, 1]]) {
        place(k(s), side, 2, [0.5, 0.25, 6], side > 0 ? RED : WHITE);
        place(k(s), side, 7, [10, 0.1, 12], GRASS); // grass run-off framing
      }

      // ====================================================================
      // HEDGES + clipped treelines — continuous parkland borders framing the
      // racing surface (clearance-based, never on tarmac)
      // ====================================================================
      hedge(0.10, 0.18, 1, 9, 1.6, [0.18, 0.36, 0.16]);
      hedge(0.13, 0.20, -1, 10, 1.5, [0.18, 0.36, 0.16]);
      hedge(0.32, 0.40, 1, 11, 1.7, [0.17, 0.35, 0.16]);
      hedge(0.66, 0.74, -1, 9, 1.5, [0.18, 0.36, 0.16]);
      hedge(0.82, 0.90, 1, 10, 1.6, [0.17, 0.35, 0.16]);
      hedge(0.92, 0.99, -1, 9, 1.4, [0.18, 0.36, 0.16]);

      // ====================================================================
      // TRACKSIDE FURNITURE — catch fences, armco guardrails, tyre walls,
      // marshal posts. Spans use clearance gaps so faces never reach tarmac.
      // ====================================================================
      // catch fences behind the grandstand banks (spectator protection)
      fence(0.00, 0.09, -1, 9, 4.0, [0.74, 0.76, 0.80]);   // main straight L
      fence(0.04, 0.14, 1, 10, 3.6, [0.74, 0.76, 0.80]);   // T1-3 sweep R
      fence(0.60, 0.70, 1, 9, 3.6, [0.74, 0.76, 0.80]);    // spectator stand R
      fence(0.76, 0.82, -1, 9, 3.6, [0.74, 0.76, 0.80]);   // chicane L

      // armco guardrails on the fast lakeside / flowing edges
      guardrail(0.42, 0.58, -1, 3.0, [0.85, 0.18, 0.16]);  // Lakeside Drive L
      guardrail(0.20, 0.30, 1, 3.0, [0.90, 0.90, 0.92]);   // R sweep
      guardrail(0.85, 0.95, 1, 3.0, [0.90, 0.90, 0.92]);   // pit approach R

      // tyre-stack barriers at the tight chicane complex (street-section feel)
      tyreWall(0.77, 0.80, 1, 3.5, RED);                   // chicane outer R
      tyreWall(0.78, 0.81, -1, 3.5, WHITE);                // chicane outer L

      // marshal posts at signature corners
      for (const [s, side] of [[0.05, 1], [0.30, 1], [0.55, -1],
                                [0.62, 1], [0.78, -1], [0.90, 1]]) {
        marshalPost(k(s), side, 6);
      }

      // ====================================================================
      // PIT / PADDOCK precinct — control tower, garage roof detail, support
      // trucks and motorhomes behind the pit building (s≈0.0 → 0.05 R)
      // ====================================================================
      tower(k(0.02), 1, 26, 12, 26, { col: [0.80, 0.82, 0.85], seg: 4,
        cap: true, capCol: [0.20, 0.24, 0.30], mast: 8 });          // race control tower
      // paddock motorhome / hospitality row behind pits
      for (let j = 0; j < 6; j++) {
        const kk = (k(0.0) + j * 8) % n;
        building(kk, 1, 34, 12, 7 + hash(j * 3) * 3, 14, {
          wall: [[0.86, 0.87, 0.88], [0.30, 0.40, 0.60], [0.70, 0.30, 0.25],
                 [0.80, 0.78, 0.40], [0.55, 0.55, 0.58], [0.20, 0.55, 0.50]][j % 6],
          window: [0.18, 0.22, 0.28], floor: 4 });
      }
      // support trucks (cab + box trailer) parked in the paddock
      for (let j = 0; j < 5; j++) {
        const a = anchor((k(0.0) + j * 10) % n, 1, 56 + hash(j * 7) * 8);
        if (onTrack(a.c[0], a.c[2], 6)) continue;
        addBox(out, vadd(a.c, a.u, 2.0), [4, 4, 13], [0.90, 0.90, 0.92], [a.r, a.u, a.t]); // box
        addBox(out, vadd(vadd(a.c, a.u, 1.6), a.t, 8), [3.6, 3.2, 4], [0.30, 0.32, 0.40], [a.r, a.u, a.t]); // cab
      }

      // ====================================================================
      // PARKLAND extras — picnic/park structures, lamp posts, fan-zone tents,
      // and a sparse second tree layer for depth
      // ====================================================================
      // lamp posts along the main straight + pit approach
      for (let j = 0; j < 8; j++) {
        for (const side of [-1, 1]) {
          const a = anchor((k(0.0) + j * 14) % n, side, 8.5);
          if (onTrack(a.c[0], a.c[2], 1)) continue;
          addCyl(out, a.c, 0.12, 7, [0.30, 0.31, 0.34], 5, [a.r, a.u, a.t]);
          addBox(out, vadd(a.c, a.u, 7), [0.7, 0.4, 1.6], [0.95, 0.92, 0.7], [a.r, a.u, a.t]);
        }
      }
      // colourful fan-zone marquees behind the s≈0.62 + s≈0.30 stands
      for (const [s, side, cnt] of [[0.63, 1, 4], [0.31, -1, 3], [0.88, 1, 3]]) {
        for (let j = 0; j < cnt; j++) {
          const a = anchor((k(s) + j * 7) % n, side, 38 + j * 9);
          if (onTrack(a.c[0], a.c[2], 5)) continue;
          addBox(out, vadd(a.c, a.u, 1.8), [9, 3.6, 9],
                 [0.92, 0.92, 0.94], [a.r, a.u, a.t]);
          addPrism(out, vadd(a.c, a.u, 4.4), [9, 1.6, 9],
                   [[0.85, 0.30, 0.20], [0.20, 0.45, 0.70], [0.90, 0.80, 0.25]][j % 3],
                   [a.r, a.u, a.t]);
        }
      }
      // extra broadleaf depth layer further back in the parkland (both sides)
      every(40, (kk) => {
        for (const side of [-1, 1]) {
          if (hash(kk * 53 + side) > 0.55) continue;
          const dist = 70 + hash(kk * 57 + side) * 70;
          tree(kk, side, dist, 9 + hash(kk * 61 + side) * 7, TREE);
        }
      });

      // ====================================================================
      // BILLBOARDS + start gantry + sponsor hoardings
      // ====================================================================
      billboard(k(0.30), 1, 18, 14, 5, [0.20, 0.40, 0.70]);
      billboard(k(0.55), -1, 16, 14, 5, [0.86, 0.30, 0.20]);
      billboard(k(0.12), 1, 16, 12, 4.5, [0.90, 0.80, 0.20]);
      billboard(k(0.45), -1, 18, 12, 4.5, [0.20, 0.60, 0.45]);
      billboard(k(0.70), 1, 16, 12, 4.5, [0.80, 0.30, 0.50]);
      billboard(k(0.85), -1, 16, 12, 4.5, [0.30, 0.45, 0.70]);
      gantry(0.0, 7.5, [0.30, 0.32, 0.36]);
      gantry(0.50, 7.0, [0.25, 0.27, 0.32]);   // mid-lap timing gantry

      void prop; void cx; void cz;
    },
  }
  );
})();
