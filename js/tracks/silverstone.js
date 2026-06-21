/* Apex 26 — SILVERSTONE circuit definition (data only).
   Registered on the global TrackDefs list; consumed by the js/tracks.js engine
   (palette resolved there from `night`, geometry from js/circuits.js or `segs`). */
(function () {
  "use strict";
  (window.TrackDefs = window.TrackDefs || []).push(
  {
    id: "silverstone",
    name: "SILVERSTONE",
    gp: "British GP",
    country: "UK",
    night: false,
    theme: "green",
    lengthKm: 5.9,
    baseHW: 8,
    pal: { zenith: [0.3, 0.42, 0.62], horizon: [0.66, 0.72, 0.78], grass: [0.2, 0.46, 0.18], fogDensity: 0.0016, sunDir: [0.42010419876354255, 0.5521369469463703, 0.7201786264517872], sun: [0.88, 0.91, 1], sunColor: [0.84, 0.88, 0.96] },
    segs: [
      { t: 0, l: 260 }, { t: 60, l: 120 }, { t: -50, l: 90 }, { t: 80, l: 80 }, { t: -150, l: 160 }, { t: 0, l: 120 },
      { t: -70, l: 90 }, { t: 120, l: 150 }, { t: 40, l: 100 }, { t: 0, l: 160 }, { t: 70, l: 130 }, { t: -55, l: 70 },
      { t: 60, l: 70 }, { t: -55, l: 70 }, { t: 50, l: 70 }, { t: 0, l: 300 }, { t: 75, l: 110 }, { t: -40, l: 90 },
      { t: 95, l: 90 }, { t: 60, l: 90 },
    ],
    elevations: [{ s: 0.62, halfM: 360, rise: 9 }],
    scenery: function (api) {
      const { out, n, px, pz, pyMin, place, prop, backdrop, every, onTrack, hash,
              grandstand, building, hedge, tree, bush, billboard, gantry, mountain, anchor, vadd, addBox,
              tower, pine, marshalPost, fence, guardrail, tyreWall, addCyl, addCone, addPrism, along } = api;
      const k = (s) => Math.round(s * n) % n;

      // ---- Palette (English-countryside green / overcast) ----
      const COPSE = [0.18, 0.38, 0.20];   // dark-green tree copses / hedgerows
      const COPSE2 = [0.22, 0.42, 0.22];  // slightly lighter broadleaf
      const PINEG = [0.16, 0.32, 0.18];   // conifer needle green
      const GRASS = [0.30, 0.55, 0.25];
      const WHITE = [0.92, 0.92, 0.92], RED = [0.85, 0.15, 0.15];
      const STEEL = [0.55, 0.56, 0.60], CONC = [0.74, 0.75, 0.76];
      const TARMAC = [0.22, 0.22, 0.24];

      // ---- LOW distant Northamptonshire treeline backdrop (flat — no snow) ----
      // Dense unbroken band wrapping every node, both sides — no gaps.
      every(38, (kk) => {
        for (const side of [-1, 1]) {
          backdrop(kk, side, 195 + hash(kk * 6 + side) * 60, [150, 15, 150], [0.22, 0.34, 0.20]);
          backdrop(kk, side, 260 + hash(kk * 9 + side) * 70, [170, 12, 170], [0.20, 0.31, 0.19]);
        }
      });
      // very low, soft organic green rises far out (snowline > 1 = never snowy),
      // placed as a CONTINUOUS ring from track centre so the horizon never breaks.
      let cx = 0, cz = 0;
      for (let i = 0; i < n; i++) { cx += px[i]; cz += pz[i]; }
      cx /= n; cz /= n;
      let rad = 0;
      for (let i = 0; i < n; i++) rad = Math.max(rad, Math.hypot(px[i] - cx, pz[i] - cz));
      // two overlapping rings of low green rises — dense enough to read as a wall
      for (const [extra, count, wMin, hMin, hVar, fc, rc] of [
        [270, 42, 180, 20, 14, [0.22, 0.40, 0.22], [0.28, 0.44, 0.26]],
        [370, 36, 220, 24, 14, [0.18, 0.36, 0.20], [0.24, 0.40, 0.24]],
        [470, 30, 260, 28, 16, [0.16, 0.32, 0.18], [0.22, 0.38, 0.22]],
      ]) {
        const ring = rad + extra;
        const span = 2 * Math.PI * ring / count;
        for (let i = 0; i < count; i++) {
          const a = (i / count + hash(i + extra) * 0.05) * 6.2832, h = hash(i * 7 + extra);
          mountain(cx + Math.cos(a) * ring, cz + Math.sin(a) * ring, pyMin,
                   Math.max(wMin + h * 120, span * 1.5), hMin + h * hVar,
                   { snowline: 2, seg: 7, seed: i * 13 + extra, forest: fc, rock: rc });
        }
      }

      // ---- Hedgerow-gridded flat farmland (s≈0.60) + perimeter hedgerows ----
      // denser farmland grid — long low green strips wrapping most of the lap
      hedge(0.58, 0.66, -1, 70, 2.4, COPSE);
      hedge(0.58, 0.66, 1, 85, 2.4, COPSE);
      hedge(0.20, 0.30, 1, 95, 2.2, COPSE);
      hedge(0.85, 0.95, -1, 80, 2.2, COPSE);
      hedge(0.06, 0.14, 1, 105, 2.2, COPSE);   // outside Copse → Maggotts
      hedge(0.32, 0.40, 1, 100, 2.3, COPSE);   // Stowe → Club outfield
      hedge(0.66, 0.74, 1, 90, 2.2, COPSE);    // beyond The Loop
      hedge(0.74, 0.84, -1, 95, 2.2, COPSE);   // Brooklands approach
      hedge(0.16, 0.24, -1, 110, 2.2, COPSE);  // far infield copse line

      // ---- Oak copses (Chapel/Cheese Copse, s≈0.15 L; scattered elsewhere) ----
      const copse = (s, side, dist) => {
        for (let j = 0; j < 5; j++) {
          const kk = (k(s) + j) % n;
          tree(kk, side, dist + hash(kk * 3 + j) * 16, 9 + hash(kk * 5 + j) * 5, COPSE);
        }
        bush(k(s), side, dist - 4, COPSE);
      };
      copse(0.15, -1, 90);
      copse(0.62, 1, 75);
      copse(0.70, -1, 70);
      copse(0.24, 1, 110);   // Stowe outfield copse
      copse(0.45, -1, 100);  // far side of The Wing infield
      copse(0.78, 1, 95);    // Brooklands outfield
      copse(0.90, -1, 85);   // Luffield / Woodcote approach
      // denser single oaks around the airfield perimeter
      every(95, (kk) => {
        for (const side of [-1, 1]) {
          if (hash(kk * 21 + side) > 0.62) continue;
          tree(kk, side, 55 + hash(kk * 22 + side) * 75, 8 + hash(kk * 24 + side) * 5, COPSE);
          if (hash(kk * 31 + side) > 0.7) bush(kk, side, 48 + hash(kk * 33 + side) * 20, COPSE);
        }
      });

      // ---- Big grandstands at the signature corners ----
      grandstand(0.04, 1, 12, 70, [0.46, 0.47, 0.52], [0.55, 0.32, 0.30]); // Copse
      grandstand(0.12, -1, 14, 55, [0.46, 0.47, 0.52], [0.50, 0.34, 0.32]); // Maggotts/Becketts
      grandstand(0.30, 1, 16, 75, [0.46, 0.47, 0.52], [0.58, 0.30, 0.30]); // Stowe
      grandstand(0.40, 1, 12, 80, [0.46, 0.47, 0.52], [0.55, 0.32, 0.30]); // Club
      grandstand(0.66, -1, 14, 45, [0.46, 0.47, 0.52], [0.50, 0.34, 0.32]); // The Loop
      grandstand(0.85, -1, 14, 55, [0.46, 0.47, 0.52], [0.55, 0.32, 0.30]); // Brooklands/Luffield
      grandstand(0.07, 1, 13, 55, [0.46, 0.47, 0.52], [0.52, 0.32, 0.32]); // Copse exit (fast)
      grandstand(0.13, 1, 15, 50, [0.46, 0.47, 0.52], [0.55, 0.30, 0.30]); // Becketts outfield
      grandstand(0.55, 1, 16, 60, [0.46, 0.47, 0.52], [0.50, 0.34, 0.32]); // Abbey (fast)
      grandstand(0.88, -1, 13, 48, [0.46, 0.47, 0.52], [0.58, 0.30, 0.30]); // Luffield exit

      // ---- The Wing: long low pit/paddock building with a thin roof blade (s≈0.45 R) ----
      // sweeping white-grey slab, far longer than tall, dark glazing band
      building(k(0.45), 1, 4, 16, 12, 200, {
        wall: [0.80, 0.81, 0.84], window: [0.16, 0.20, 0.26], floor: 5 });
      // thin cantilevered roof fin running the length of the building
      {
        const a = anchor(k(0.45), 1, 12);
        addBox(out, vadd(a.c, a.u, 13.2), [22, 0.7, 210], [0.86, 0.88, 0.92], [a.r, a.u, a.t]);
      }
      // tall stepped Wing grandstands flanking it (s≈0.46 R)
      grandstand(0.46, 1, 11, 90, [0.50, 0.51, 0.56], [0.58, 0.30, 0.30]);
      // BRDC clubhouse set back (s≈0.48 R)
      building(k(0.48), 1, 28, 24, 9, 20, { wall: [0.78, 0.78, 0.74], window: [0.20, 0.26, 0.32] });

      // ---- Advertising hoardings (Abbey run-off s≈0.55 R) ----
      billboard(k(0.55), 1, 18, 14, 5, [0.86, 0.30, 0.20]);
      billboard(k(0.30), 1, 22, 14, 5, [0.20, 0.40, 0.70]);

      // ---- The Wing detail: control tower, pit garages, podium block ----
      // slim control/race-control tower rising off the Wing roofline (s≈0.45 R)
      tower(k(0.45), 1, 30, 9, 26, { col: [0.82, 0.83, 0.86], seg: 6, cap: true, capCol: [0.18, 0.22, 0.28], mast: 8 });
      // a second flag-mast cluster on the Wing apron
      {
        const a = anchor(k(0.455), 1, 9);
        for (const o of [-26, -13, 0, 13, 26]) {
          addCyl(out, vadd(a.c, a.t, o), 0.12, 12, [0.55, 0.56, 0.6], 4, [a.r, a.u, a.t]);
        }
      }
      // low pit-lane wall along the start straight in front of the Wing
      {
        const a = anchor(k(0.46), 1, 2.5);
        addBox(out, vadd(a.c, a.u, 0.6), [0.6, 1.2, 120], CONC, [a.r, a.u, a.t]);
      }

      // ---- National pit straight (s≈0.0) garages + pit wall + paddock ----
      building(k(0.97), 1, 6, 12, 8, 90, { wall: [0.82, 0.83, 0.85], window: [0.22, 0.26, 0.30], floor: 5 });
      // paddock support buildings / hospitality units set back behind the pits
      for (const [s, d, w, h, ln, col] of [
        [0.95, 40, 14, 7, 34, [0.78, 0.78, 0.74]],
        [0.99, 44, 16, 6, 30, [0.74, 0.76, 0.78]],
        [0.92, 38, 12, 6, 26, [0.80, 0.79, 0.75]],
      ]) building(k(s), 1, d, w, h, ln, { wall: col, window: [0.30, 0.34, 0.38] });
      // marquee / hospitality tents (white prism roofs) in the paddock
      for (const [s, d] of [[0.94, 60], [0.96, 72], [0.98, 64], [0.90, 58]]) {
        const a = anchor(k(s), 1, d);
        addBox(out, vadd(a.c, a.u, 1.6), [12, 3.2, 16], [0.90, 0.91, 0.92], [a.r, a.u, a.t]);
        addPrism(out, vadd(a.c, a.u, 4.4), [12, 2.4, 16], [0.95, 0.96, 0.97], [a.r, a.u, a.t]);
      }

      // ---- Catch fencing behind the grandstands at the signature corners ----
      fence(0.02, 0.08, 1, 9, 4.5, [0.74, 0.76, 0.80]);   // Copse
      fence(0.28, 0.34, 1, 12, 4.5, [0.74, 0.76, 0.80]);  // Stowe
      fence(0.38, 0.44, 1, 9, 4.5, [0.74, 0.76, 0.80]);   // Club / Vale
      fence(0.83, 0.90, -1, 10, 4.5, [0.74, 0.76, 0.80]); // Brooklands/Luffield
      fence(0.53, 0.58, 1, 12, 4.5, [0.74, 0.76, 0.80]);  // Abbey

      // ---- Armco guardrails lining fast sweeps + tyre-wall stacks at apexes ----
      guardrail(0.05, 0.10, 1, 5, [0.84, 0.84, 0.86]);    // Copse exit run
      guardrail(0.16, 0.22, -1, 5, [0.84, 0.84, 0.86]);   // Becketts complex L
      guardrail(0.50, 0.56, 1, 6, [0.84, 0.84, 0.86]);    // Abbey approach
      tyreWall(0.038, 0.05, 1, 3.5, RED);                 // Copse apex
      tyreWall(0.295, 0.31, 1, 3.5, [0.2, 0.4, 0.8]);     // Stowe apex
      tyreWall(0.395, 0.41, 1, 3.5, [0.9, 0.6, 0.1]);     // Club apex
      tyreWall(0.655, 0.67, -1, 3.5, RED);                // The Loop apex
      tyreWall(0.84, 0.855, -1, 3.5, [0.2, 0.4, 0.8]);    // Brooklands apex

      // ---- Marshal posts dotted around the lap (orange-roofed) ----
      for (const [s, side] of [[0.05, 1], [0.13, -1], [0.20, -1], [0.31, 1], [0.41, 1],
                               [0.55, 1], [0.66, -1], [0.78, 1], [0.86, -1], [0.95, 1]]) {
        marshalPost(k(s), side, 4);
      }

      // ---- More advertising hoardings around the major corners ----
      billboard(k(0.04), 1, 20, 12, 4.5, [0.20, 0.55, 0.30]);
      billboard(k(0.40), 1, 20, 14, 5, [0.85, 0.30, 0.20]);
      billboard(k(0.66), -1, 18, 12, 4.5, [0.20, 0.40, 0.70]);
      billboard(k(0.85), -1, 20, 14, 5, [0.90, 0.55, 0.10]);
      billboard(k(0.13), -1, 22, 12, 4.5, [0.80, 0.20, 0.30]);

      // ---- Start gantry over Woodcote / start-finish ----
      gantry(0.0, 7.5, [0.30, 0.32, 0.36]);

      // ---- Pine windbreak rows + scattered broadleaf copses (airfield perimeter) ----
      // dense conifer windbreaks behind the far hedgerows
      for (const [s0, s1, side, dist] of [
        [0.14, 0.24, 1, 130], [0.32, 0.42, 1, 135], [0.58, 0.68, -1, 125], [0.78, 0.90, -1, 130],
      ]) {
        along(s0, s1, 22, (kk) => {
          if (hash(kk * 17 + side) > 0.5) {
            pine(kk, side, dist + hash(kk * 19 + side) * 30, 11 + hash(kk * 23) * 6, PINEG);
          } else {
            tree(kk, side, dist + hash(kk * 19 + side) * 30, 10 + hash(kk * 23) * 5, COPSE2);
          }
        });
      }
      // a few dense broadleaf copse clumps further out (the named Silverstone copses)
      const bigCopse = (s, side, dist, count) => {
        for (let j = 0; j < count; j++) {
          const kk = (k(s) + j * 2) % n;
          tree(kk, side, dist + hash(kk * 7 + j) * 22 - 11, 9 + hash(kk * 11 + j) * 6,
               hash(kk + j) > 0.5 ? COPSE : COPSE2);
        }
      };
      bigCopse(0.18, -1, 120, 7);   // Chapel/Cheese copse beyond Becketts
      bigCopse(0.50, 1, 110, 6);    // infield copse behind The Wing
      bigCopse(0.72, 1, 115, 6);    // beyond The Loop
      bigCopse(0.62, -1, 130, 5);

      // ---- Flat farmland: hedgerow-gridded field strips (airfield outline) ----
      // long straight hedgerows further out, gridding the flat fields
      hedge(0.10, 0.20, -1, 150, 2.0, COPSE);
      hedge(0.42, 0.52, -1, 140, 2.0, COPSE);
      hedge(0.70, 0.80, 1, 150, 2.0, COPSE);
      hedge(0.24, 0.34, -1, 160, 2.0, COPSE);

      // ---- Low farm sheds / airfield hangars dotted on the flat outfield ----
      for (const [s, side, d, w, h, ln] of [
        [0.22, -1, 150, 22, 6, 30], [0.50, 1, 145, 24, 5, 34], [0.74, 1, 150, 20, 5, 26],
      ]) {
        const a = anchor(k(s), side, d);
        if (!onTrack(a.c[0], a.c[2], 18)) {
          addBox(out, vadd(a.c, a.u, h * 0.4), [w, h * 0.8, ln], [0.62, 0.60, 0.55], [a.r, a.u, a.t]);
          addPrism(out, vadd(a.c, a.u, h * 0.8 + h * 0.2), [w, h * 0.4, ln], [0.50, 0.48, 0.45], [a.r, a.u, a.t]);
        }
      }

      // ---- Red/white kerb accent boxes + green run-off framing at apexes ----
      for (const [s, side] of [[0.04, 1], [0.12, -1], [0.12, 1], [0.30, 1], [0.40, 1], [0.55, 1], [0.66, -1], [0.85, -1]]) {
        place(k(s), side, 2, [0.4, 0.25, 6], side > 0 ? RED : WHITE);
        place(k(s), side, 7, [10, 0.1, 12], GRASS); // run-off / grass framing slab
      }

      // silence unused-guard lint helpers
      void onTrack; void WHITE; void prop; void TARMAC; void STEEL; void addCone;
    },
  }
  );
})();
