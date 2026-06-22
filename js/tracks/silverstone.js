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
    pal: { zenith: [0.32, 0.44, 0.64], horizon: [0.62, 0.68, 0.74], grass: [0.22, 0.48, 0.20], fogDensity: 0.0014, sunDir: [0.42010419876354255, 0.5521369469463703, 0.7201786264517872], sun: [0.86, 0.89, 0.98], sunColor: [0.82, 0.86, 0.94] },
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
              pine, marshalPost, fence, guardrail, tyreWall, addCyl, addCone, addPrism, addFrustum, along } = api;
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
      // denser farmland grid — long low green strips wrapping most of the lap (at safe distances)
      hedge(0.60, 0.64, -1, 80, 2.4, COPSE);   // far side beyond The Loop
      hedge(0.60, 0.64, 1, 95, 2.4, COPSE);    // near side
      hedge(0.20, 0.28, 1, 105, 2.2, COPSE);   // Maggotts outfield
      hedge(0.86, 0.94, -1, 90, 2.2, COPSE);   // Luffield / Woodcote far
      hedge(0.08, 0.12, 1, 115, 2.2, COPSE);   // far outside Copse
      hedge(0.34, 0.38, 1, 110, 2.3, COPSE);   // Stowe far field
      hedge(0.70, 0.76, 1, 100, 2.2, COPSE);   // beyond The Loop
      hedge(0.76, 0.82, -1, 105, 2.2, COPSE);  // Brooklands far approach
      hedge(0.18, 0.22, -1, 120, 2.2, COPSE);  // infield far copse line
      // Additional distant hedgerow grid for farmland depth
      hedge(0.02, 0.08, -1, 150, 2.1, COPSE);  // far side from pit straight
      hedge(0.28, 0.32, -1, 165, 2.1, COPSE);  // infield behind Stowe
      hedge(0.48, 0.52, -1, 155, 2.1, COPSE);  // far infield beyond The Wing
      hedge(0.66, 0.70, -1, 160, 2.1, COPSE);  // far side The Loop approach

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
      grandstand(0.04, 1, 12, 80, [0.46, 0.47, 0.52], [0.55, 0.32, 0.30]); // Copse — wide run-off
      grandstand(0.12, -1, 14, 60, [0.46, 0.47, 0.52], [0.50, 0.34, 0.32]); // Maggotts/Becketts
      grandstand(0.30, 1, 16, 85, [0.46, 0.47, 0.52], [0.58, 0.30, 0.30]); // Stowe — large stand
      grandstand(0.40, 1, 12, 90, [0.46, 0.47, 0.52], [0.55, 0.32, 0.30]); // Club — fast corner seating
      grandstand(0.66, -1, 14, 50, [0.46, 0.47, 0.52], [0.50, 0.34, 0.32]); // The Loop — hairpin seating
      grandstand(0.85, -1, 14, 65, [0.46, 0.47, 0.52], [0.55, 0.32, 0.30]); // Brooklands/Luffield — signature view
      grandstand(0.55, 1, 16, 70, [0.46, 0.47, 0.52], [0.50, 0.34, 0.32]); // Abbey (fast) — wide run-off viewing

      // ---- The Wing: long low pit/paddock building with a thin roof blade (s≈0.45 R) ----
      // sweeping white-grey slab, far longer than tall, minimal dark glazing on track side — Silverstone's signature
      building(k(0.45), 1, 4, 20, 11, 240, {
        wall: [0.84, 0.84, 0.86], window: [0.16, 0.20, 0.26], floor: 5 });
      // thin cantilevered roof fin running the length of the building (very prominent)
      {
        const a = anchor(k(0.45), 1, 13);
        if (addBox(out, vadd(a.c, a.u, 14), [24, 0.9, 240], [0.88, 0.90, 0.94], [a.r, a.u, a.t]) === false) {
          // fallback: roof blade suppressed, skip glazing band
        } else {
          // glazing band only if roof isn't clipped
          addBox(out, vadd(a.c, a.u, 6.2), [22, 8, 240], [0.12, 0.18, 0.26], [a.r, a.u, a.t]);
        }
      }
      // tall stepped Wing grandstand (s≈0.46 R) — the distinctive seating (single stand, less clutter)
      grandstand(0.46, 1, 12, 110, [0.50, 0.52, 0.56], [0.62, 0.26, 0.26]);
      // BRDC clubhouse set back (s≈0.48 R) — pale historical building, smaller/more modest
      building(k(0.48), 1, 28, 22, 9, 20, { wall: [0.78, 0.78, 0.74], window: [0.20, 0.26, 0.32] });

      // ---- Advertising hoardings (Abbey run-off s≈0.55 R) ----
      billboard(k(0.55), 1, 14, 14, 5, [0.86, 0.30, 0.20]);
      billboard(k(0.54), -1, 14, 14, 5, [0.20, 0.40, 0.70]);
      billboard(k(0.30), 1, 22, 14, 5, [0.20, 0.40, 0.70]);

      // ---- The Wing detail: control tower, pit garages, podium block ----
      // slim control/race-control tower rising off the Wing roofline (s≈0.45 R) — prominent landmark
      // Use addFrustum directly with onTrack guard to avoid tower() which is not in api
      {
        const a = anchor(k(0.45), 1, 32);
        if (!onTrack(a.c[0], a.c[2], 5)) {
          addFrustum(out, a.c, 5, 3.2, 28, [0.84, 0.85, 0.88], 8, [a.r, a.u, a.t]);
          // control room cap
          addBox(out, vadd(a.c, a.u, 28), [3.5, 2.2, 3.5], [0.16, 0.20, 0.26], [a.r, a.u, a.t]);
          // tall antenna mast
          addCyl(out, vadd(a.c, a.u, 30.5), 0.18, 8, [0.3, 0.3, 0.32], 4, [a.r, a.u, a.t]);
        }
      }
      // flag-mast cluster on the Wing apron (more visible, fewer posts = less clutter)
      {
        const a = anchor(k(0.455), 1, 10);
        for (const o of [-20, 0, 20]) {
          if (addCyl(out, vadd(a.c, a.t, o), 0.14, 14, [0.56, 0.57, 0.62], 5, [a.r, a.u, a.t]) === false) continue;
        }
      }
      // low pit-lane wall along the start straight in front of the Wing (guarded)
      {
        const a = anchor(k(0.46), 1, 2.5);
        if (!onTrack(a.c[0], a.c[2], 0.3)) {
          addBox(out, vadd(a.c, a.u, 0.6), [0.6, 1.2, 120], CONC, [a.r, a.u, a.t]);
        }
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

      // ---- Advertising hoardings around the major corners ----
      billboard(k(0.04), 1, 20, 12, 4.5, [0.20, 0.55, 0.30]);  // Copse corner
      billboard(k(0.40), 1, 20, 14, 5, [0.85, 0.30, 0.20]);    // Club corner
      billboard(k(0.66), -1, 18, 12, 4.5, [0.20, 0.40, 0.70]); // The Loop
      billboard(k(0.85), -1, 20, 14, 5, [0.90, 0.55, 0.10]);   // Brooklands
      billboard(k(0.13), -1, 22, 12, 4.5, [0.80, 0.20, 0.30]); // Maggotts

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
      // Former RAF airfield hangars and farm buildings — characteristic of Silverstone's setting
      for (const [s, side, d, w, h, ln] of [
        [0.22, -1, 150, 22, 6, 30], [0.50, 1, 145, 24, 5, 34], [0.74, 1, 150, 20, 5, 26],
        [0.08, 1, 165, 20, 5, 28], [0.62, 1, 160, 18, 5, 24],
      ]) {
        const a = anchor(k(s), side, d);
        if (!onTrack(a.c[0], a.c[2], 18)) {
          addBox(out, vadd(a.c, a.u, h * 0.4), [w, h * 0.8, ln], [0.62, 0.60, 0.55], [a.r, a.u, a.t]);
          addPrism(out, vadd(a.c, a.u, h * 0.8 + h * 0.2), [w, h * 0.4, ln], [0.50, 0.48, 0.45], [a.r, a.u, a.t]);
        }
      }

      // ---- Red/white kerb accent boxes + paved run-off framing at apexes ----
      // Generous red/white sawtooth kerbs + wide paved concrete run-off (former airfield spacing)
      for (const [s, side] of [[0.04, 1], [0.12, -1], [0.12, 1], [0.30, 1], [0.40, 1], [0.55, 1], [0.66, -1], [0.85, -1]]) {
        place(k(s), side, 2, [0.5, 0.3, 8], side > 0 ? RED : WHITE);
        place(k(s), side, 9, [12, 0.1, 14], CONC); // wide run-off / concrete apron slab
      }
      // Extra kerb emphasize at The Wing area
      place(k(0.45), 1, 2, [0.4, 0.28, 6], RED);
      place(k(0.45), 1, 8, [11, 0.1, 10], CONC);

      // ---- Pit garage bays: 5 evenly spaced garage boxes along the pit wall (s≈0.97 R) ----
      // These are placed via guarded addBox calls
      {
        for (let i = 0; i < 5; i++) {
          const dist = 6 + i * 6;
          const gb = anchor(k(0.97), 1, dist);
          if (!onTrack(gb.c[0], gb.c[2], 4)) {
            addBox(out, vadd(gb.c, gb.u, 4), [8, 8, 14], [0.48, 0.50, 0.52], [gb.r, gb.u, gb.t]);
          }
        }
      }


      // ---- Copse corner near-side tree cluster (denser, 50–70m) ----
      {
        for (let j = 0; j < 4; j++) {
          const kk = (k(0.04) + j) % n;
          tree(kk, 1, 55 + hash(kk * 7 + j) * 25, 11 + hash(kk * 11 + j) * 6, COPSE);
        }
        for (let j = 0; j < 3; j++) {
          const kk = (k(0.06) + j) % n;
          tree(kk, 1, 60 + hash(kk * 9 + j) * 18, 10 + hash(kk * 13 + j) * 5, COPSE);
        }
      }

      // ---- Pit control tower near the start gantry (modest building) ----
      building(k(0.01), 1, 8, 9, 5, 11, { wall: [0.78, 0.77, 0.72], window: [0.28, 0.32, 0.36] });

      // ---- Maggotts/Becketts infield tree cluster (s=0.11–0.13, R) ----
      {
        const maggFracs = [0.110, 0.120, 0.130];
        const maggDists = [85, 95, 100];
        const maggH = [12, 14, 13];
        for (let i = 0; i < maggFracs.length; i++) {
          tree(k(maggFracs[i]), 1, maggDists[i], maggH[i], COPSE);
        }
      }

      // ---- Brooklands section: slight banking simulation with darker outer trees ----
      // Historic high-speed banking (1930s original) — suggest it with tree density on outer edge
      for (let i = 0; i < 4; i++) {
        const s = 0.80 + i * 0.015;
        tree(k(s), -1, 85 + hash(k(s) * 17) * 20, 11 + hash(k(s) * 19) * 5, [0.20, 0.36, 0.18]);
        tree(k(s), -1, 65 + hash(k(s) * 23) * 25, 10 + hash(k(s) * 29) * 6, [0.18, 0.34, 0.16]);
      }

      // silence unused-guard lint helpers
      void onTrack; void WHITE; void prop; void TARMAC; void STEEL; void addCone;
    },
  }
  );
})();
