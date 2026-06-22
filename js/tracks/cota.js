/* Apex 26 — COTA circuit definition (data only).
   Registered on the global TrackDefs list; consumed by the js/tracks.js engine
   (palette resolved there from `night`, geometry from js/circuits.js or `segs`). */
(function () {
  "use strict";
  (window.TrackDefs = window.TrackDefs || []).push(
  {
    id: "cota",
    name: "COTA",
    gp: "United States GP",
    country: "USA",
    night: false,
    theme: "green",
    lengthKm: 5.5,
    baseHW: 8,
    pal: { zenith: [0.28, 0.54, 0.82], horizon: [0.74, 0.68, 0.52], grass: [0.36, 0.44, 0.20], runoff: [0.58, 0.38, 0.24], ambientSky: [0.50, 0.58, 0.66], ambientGround: [0.30, 0.30, 0.26], sunDir: [0.5345224838248488, 0.5550810408950353, 0.6373152691757812], sun: [1.0, 0.88, 0.62], sunColor: [1.0, 0.85, 0.55] },
    segs: [
      { t: 0, l: 220, h: 30 }, { t: -120, l: 110, h: -6 }, { t: 0, l: 80, h: -22 }, { t: 60, l: 60 }, { t: -55, l: 60 }, { t: 60, l: 60 },
      { t: -55, l: 70 }, { t: 50, l: 70 }, { t: -40, l: 80 }, { t: -60, l: 90 }, { t: -120, l: 110 }, { t: 0, l: 460 },
      { t: -150, l: 130 }, { t: 70, l: 70 }, { t: -60, l: 70 }, { t: 80, l: 90 }, { t: 90, l: 160 }, { t: -130, l: 110 },
    ],
    // Turn 1: the calendar's most famous climb — ~30 m up in a few hundred metres.
    elevations: [{ s: 0.06, halfM: 320, rise: 12 }],
    scenery: function (api) {
      const { out, n, px, pz, hw, pyMin, place, prop, addBox, addPrism, addCyl, addCone, addFrustum, every, along, onTrack, anchor, vadd, hash, grandstand, building, billboard, gantry, marshalPost, fence, guardrail, tyreWall, wall, tree, bush, pine, mountain } = api;
      const K = (s) => Math.round(s * n) % n;

      // -- Palette (Texas Hill Country, DAY) --
      const dryGrass  = [0.55, 0.62, 0.30];
      const scrub     = [0.38, 0.50, 0.28];
      const oak       = [0.30, 0.42, 0.20];
      const cedar     = [0.26, 0.36, 0.22];
      const redSoil   = [0.62, 0.34, 0.24];
      const redSteel  = [0.86, 0.20, 0.16];
      const white     = [0.92, 0.92, 0.94];
      const darkSteel = [0.32, 0.34, 0.40];
      const glass     = [0.40, 0.56, 0.66];
      const cotaBlue  = [0.16, 0.30, 0.52];
      // emissive warm window tint: simulates lit glass catching Texas sun
      const litWin    = [0.68, 0.72, 0.50];
      // lamp-post colours
      const lampPost  = [0.36, 0.36, 0.40];
      const lampHead  = [0.98, 0.94, 0.78];   // warm white sodium

      // ---- Main grandstand on the start/finish straight (s≈0.00, R) ----
      grandstand(0.00,  1,  8, 150, [0.34, 0.35, 0.40], [0.5, 0.5, 0.54]);
      // Opposite paddock-side stand on the main straight (s≈0.00, L)
      grandstand(0.985, -1, 16, 90, [0.36, 0.37, 0.42], [0.5, 0.5, 0.54]);
      // Final-corner stepped stand leading onto the main straight (s≈0.95, R)
      grandstand(0.95,  1,  9, 80, [0.36, 0.37, 0.42], [0.52, 0.5, 0.5]);
      // Turn-1 hill stand catching the climb (s≈0.07, L) — set back enough to clear road
      grandstand(0.07, -1, 14, 80, [0.42, 0.43, 0.48], [0.50, 0.50, 0.54]);
      // T1 hill stand mid-rise (s≈0.11, L)
      grandstand(0.11, -1, 18, 60, [0.38, 0.39, 0.44], [0.52, 0.5, 0.5]);
      // T1 amphitheatre upper tier (s≈0.13, L)
      grandstand(0.13, -1, 26, 64, [0.36, 0.37, 0.42], [0.5, 0.5, 0.54]);
      // Esses outside stand (s≈0.20, L)
      grandstand(0.20, -1, 16, 56, [0.40, 0.41, 0.46], [0.5, 0.5, 0.54]);
      // Esses-exit stand (s≈0.24, R)
      grandstand(0.24,  1, 18, 54, [0.38, 0.39, 0.44], [0.5, 0.5, 0.54]);
      // Back-straight grandstand (s≈0.46, L)
      grandstand(0.46, -1, 12, 70, [0.40, 0.41, 0.46], [0.5, 0.5, 0.54]);
      // Second back-straight stand (s≈0.54, L)
      grandstand(0.54, -1, 14, 60, [0.36, 0.37, 0.42], [0.52, 0.5, 0.5]);
      // Turn-12 hairpin braking-zone stand (s≈0.625, R)
      grandstand(0.625, 1, 14, 70, [0.38, 0.39, 0.44], [0.5, 0.5, 0.54]);
      // Triple-apex sweeper stand (s≈0.83, R)
      grandstand(0.83,  1, 16, 64, [0.40, 0.41, 0.46], [0.5, 0.5, 0.54]);
      // Extra deep main-straight upper tier behind the front stand (s≈0.02, R far)
      grandstand(0.02,  1, 30, 130, [0.30, 0.31, 0.36], [0.48, 0.48, 0.52]);
      // Back-sector stands for race viewing
      grandstand(0.47, -1, 18, 68, [0.38, 0.39, 0.44], [0.50, 0.50, 0.54]);
      grandstand(0.52,  1, 20, 60, [0.36, 0.37, 0.42], [0.52, 0.50, 0.50]);

      // ---- Pit/paddock building cluster (s≈0.97–0.05, L) ----
      // long low pit garage block flanking the main straight
      building(K(0.97), -1, 12, 24, 8, 120, { wall: [0.84, 0.84, 0.86], window: glass, floor: 2, roof: [0.55, 0.56, 0.60] });
      // paddock hospitality / team motorhomes behind the pits
      building(K(0.99), -1, 40, 30, 11, 60, { wall: [0.88, 0.88, 0.90], window: glass, floor: 3, roof: [0.5, 0.52, 0.56] });
      building(K(0.04), -1, 38, 26,  9, 44, { wall: [0.80, 0.80, 0.83], window: glass, floor: 2 });
      // race-control / media tower at pit exit (s≈0.05, L) — set back 16m so inner face clear
      building(K(0.05), -1, 16, 16, 18, 22, { wall: cotaBlue, window: glass, floor: 5, roof: darkSteel });
      // pit-lane low boundary wall along the straight (inside, R)
      wall(0.92, 0.10, 1, 3, 1.0, [0.90, 0.90, 0.92], 0.5);

      // ---- COTA Observation Tower — the iconic 77m red structure at Turn 1 (s≈0.085, L far) ----
      // Placed at 78 m from road edge so it never overlaps any parallel segment.
      // The three-frustum shaft stacks cleanly: each frustum's base is at the top
      // of the previous one (cumulative height offset via vadd(tBase, at.u, N)).
      // The observation deck cylinder, floor box and upper platform are sized so
      // the box (16 m) stays inside the cylinder ring (r=8.6 → 17.2 m diameter)
      // to avoid protrusion/clipping.  Railing posts fan in the at.r / at.t plane
      // (world track-right and track-forward axes) using cosine+sine — previously
      // only at.t was used for the radial offset, producing a collapsed line.
      const kt = K(0.085);
      const at = anchor(kt, -1, 78), tb = [at.r, at.u, at.t];
      const tBase = at.c;
      // tapered concrete/steel shaft in 3 stages (total 74 m to deck level)
      addFrustum(out, tBase,                         5.8, 4.6, 32, [0.80, 0.81, 0.85], 8, tb);
      addFrustum(out, vadd(tBase, at.u, 32),         4.6, 3.8, 32, [0.78, 0.79, 0.83], 8, tb);
      addFrustum(out, vadd(tBase, at.u, 64),         3.8, 2.8, 10, [0.76, 0.77, 0.81], 8, tb);
      // broad observation deck assembly (the iconic RED feature, r=8.5 m)
      const deckH = 74;
      const deckCen = vadd(tBase, at.u, deckH);
      addCyl(out, deckCen, 8.5, 2.4, redSteel, 10, tb);             // RED deck ring
      // deck floor: contained inside the ring (14 m < 17 m diameter) — no protrusion
      addBox(out, vadd(tBase, at.u, deckH + 1.2), [14, 1.6, 14], [0.92, 0.92, 0.94], tb);
      // upper viewing platform — raised 3 m above deck floor, slightly narrower
      addCyl(out, vadd(tBase, at.u, deckH + 2.8), 7.0, 1.8, [0.74, 0.76, 0.82], 8, tb);
      // crown cap (sits on top of upper platform — gap-free)
      addCone(out, vadd(tBase, at.u, deckH + 4.6), 4.2, 3.8, [0.65, 0.66, 0.70], 8, tb);
      // slender antenna mast above the cone apex
      addCyl(out, vadd(tBase, at.u, deckH + 8.4),  0.32, 9.0, redSteel, 5, tb);
      // aviation-warning beacon at mast tip (warm amber)
      addBox(out, vadd(tBase, at.u, deckH + 17.4), [0.7, 0.7, 0.7], [1.0, 0.82, 0.25], tb);
      // RED railing posts radiating around the deck edge in the at.r / at.t plane
      // (correct 2-D circle: both axes used with cosine and sine)
      for (let i = 0; i < 8; i++) {
        const ang = (i / 8) * 6.2832;
        const rPost = vadd(
          vadd(deckCen, at.r, Math.cos(ang) * 9.2),
          at.t, Math.sin(ang) * 9.2
        );
        addBox(out, [rPost[0], rPost[1] + 0.8, rPost[2]], [0.5, 1.4, 0.5], redSteel, tb);
      }
      // base facilities: control/mechanical room at tower base (gap=16 so inner face
      // is at 78-8=70 m out — safely away from the road; prop uses gap+sz[0]/2)
      prop(kt, -1, 62, [16, 7, 18], [0.84, 0.84, 0.86]);
      // emissive window strip on the deck band — simulates lit interior (day+night)
      addBox(out, vadd(tBase, at.u, deckH + 0.6), [15.5, 0.8, 15.5], litWin, tb);

      // ---- Uphill Turn 1: dramatic red-soil embankment — the amphitheatre climb ----
      // Frustum radii kept modest (20/10 m) so the guard doesn't cull them;
      // placed at 16 m from road edge to ensure clearance.
      const k1 = K(0.10);
      const a1 = anchor(k1, 1, 16);
      addPrism(out, vadd(a1.c, a1.u, 4), [20, 12, 60], redSoil, [a1.t, a1.u, a1.r]);
      // large outer mound on the left side of the hill
      const a1L = anchor(k1, -1, 26);
      addPrism(out, vadd(a1L.c, a1L.u, 3), [28, 8, 72], [0.58, 0.36, 0.26], [a1L.t, a1L.u, a1L.r]);

      // ---- Esses spectator viewing mounds (s≈0.18, both sides) ----
      const ke = K(0.18);
      const me = anchor(ke, -1, 32);
      addPrism(out, vadd(me.c, me.u, 2), [34, 6, 64], scrub, [me.t, me.u, me.r]);
      const me2 = anchor(ke, 1, 32);
      addPrism(out, vadd(me2.c, me2.u, 2), [34, 6, 64], scrub, [me2.t, me2.u, me2.r]);

      // ---- Austin360 Amphitheater: curved fan canopy behind Turn 12 (s≈0.64, R) ----
      const ka = K(0.64);
      const aa = anchor(ka, 1, 62), ab = [aa.r, aa.u, aa.t];
      if (!onTrack(aa.c[0], aa.c[2], 36)) {
        addBox(out, vadd(aa.c, aa.u, 12), [52, 22, 28], [0.78, 0.76, 0.72], ab);
        for (let i = -2; i <= 2; i++) {
          addPrism(out, vadd(vadd(aa.c, aa.t, i * 11), aa.u, 23 + (2 - Math.abs(i)) * 2),
                   [14, 3, 24], [0.70, 0.72, 0.76], [aa.r, aa.u, aa.t]);
        }
      }

      // ---- Red-and-white grandstand framework / tower (s≈0.65, R far) ----
      const redFramework = (k, side, dist) => {
        const af = anchor(k, side, dist), fb = [af.r, af.u, af.t];
        if (onTrack(af.c[0], af.c[2], 24)) return;
        addBox(out, vadd(af.c, af.u, 16),              [4, 32, 30], redSteel, fb);
        addBox(out, vadd(vadd(af.c, af.t,  14), af.u,  9), [4, 18, 22], redSteel, fb);
        addBox(out, vadd(vadd(af.c, af.t, -14), af.u,  9), [4, 18, 22], redSteel, fb);
        addBox(out, vadd(vadd(af.c, af.t,   7), af.u, 12), [6,  1, 18], white,    fb);
        addBox(out, vadd(vadd(af.c, af.t,  -7), af.u, 12), [6,  1, 18], white,    fb);
      };
      redFramework(K(0.65), 1, 46);
      redFramework(K(0.65), 1, 78);    // second red stand behind the first
      redFramework(K(0.84), 1, 52);    // red framework at the triple-apex sweeper
      redFramework(K(0.30), 1, 62);    // red framework over the dry-grass field

      // ---- Velocity Tower — iconic colourful Austin landmark (s≈0.36, R far) ----
      // Placed at 98 m from road to stay well clear of any parallel stretch.
      const kv = K(0.36), av = anchor(kv, 1, 98), vb = [av.r, av.u, av.t];
      if (!onTrack(av.c[0], av.c[2], 32)) {
        // steel lattice tower base with tapered profile (grounded via anchor)
        addFrustum(out, av.c,                   8.2, 6.5, 26, [0.32, 0.34, 0.38], 6, vb);
        // distinctive bright ORANGE band — the signature feature
        addFrustum(out, vadd(av.c, av.u, 26),   6.5, 5.8,  6, [0.96, 0.64, 0.12], 8, vb);
        // continuation of tower above orange band
        addFrustum(out, vadd(av.c, av.u, 32),   5.8, 4.0, 18, [0.32, 0.34, 0.38], 6, vb);
        // accent cap — burnt orange/red
        addCone(out, vadd(av.c, av.u, 50),       4.0, 5.2, [0.84, 0.38, 0.18], 8, vb);
        // thin antenna spire (starts flush at cone apex = 55.2 m)
        addCyl(out, vadd(av.c, av.u, 55.2),     0.28, 6.8, [0.30, 0.32, 0.36], 4, vb);
        // emissive orange accent strip around the orange band (day sun-catch effect)
        addBox(out, vadd(av.c, av.u, 28),       [13.5, 1.0, 13.5], [1.0, 0.70, 0.20], vb);
      }

      // ---- Texas water tower — classic regional silhouette landmark (s≈0.68, L far) ----
      const kw = K(0.68), aw = anchor(kw, -1, 112), wb = [aw.r, aw.u, aw.t];
      if (!onTrack(aw.c[0], aw.c[2], 36)) {
        // four tapered steel legs — spaced 3.6 m each way from centre
        for (const leg of [[-3.6, -3.6], [3.6, -3.6], [-3.6, 3.6], [3.6, 3.6]]) {
          addCyl(out, vadd(vadd(aw.c, aw.r, leg[0]), aw.t, leg[1]),
                 0.48, 21, [0.68, 0.70, 0.76], 4, wb);
        }
        // main cylindrical tank body (starts at top of legs)
        addFrustum(out, vadd(aw.c, aw.u, 21), 7.2, 7.0, 7, [0.82, 0.84, 0.88], 12, wb);
        // dome cap on tank
        addCone(out,   vadd(aw.c, aw.u, 28), 7.0, 4.8, [0.72, 0.74, 0.80], 12, wb);
      }

      // ---- Texas Hill Country ridgelines — LOW organic hills on the horizon ----
      let cx = 0, cz = 0;
      for (let i = 0; i < n; i++) { cx += px[i]; cz += pz[i]; }
      cx /= n; cz /= n;
      let rad = 0;
      for (let i = 0; i < n; i++) rad = Math.max(rad, Math.hypot(px[i] - cx, pz[i] - cz));

      // T1 hill climb ridge cues: earth mounds framing the famous uphill entry.
      // Small prisms anchored at a safe 36 m from road edge; modest width.
      {
        const hillGrass = [0.36, 0.44, 0.22];
        const hillPts = [[0.01, 1], [0.02, -1], [0.035, 1], [0.045, -1]];
        for (const [sf, side] of hillPts) {
          const ah = anchor(K(sf), side, 36 + hash(K(sf) * 3) * 18);
          addPrism(out, ah.c, [28, 10 + hash(K(sf) * 7) * 6, 46], hillGrass,
                   [ah.t, ah.u, ah.r]);
        }
      }

      // CONTINUOUS Texas Hill Country backdrop: three overlapping rings of rolling hills.
      for (const [extra, wMin, hMin, count, col] of [
        [150, 220, 24, 44, [0.42, 0.50, 0.28]],   // near ring: scrub-covered hills
        [340, 290, 38, 38, [0.48, 0.54, 0.40]],   // mid ring: tan-green transition
        [560, 350, 50, 32, [0.44, 0.50, 0.42]],   // far ring: hazy depth effect
      ]) {
        const ring = rad + extra;
        for (let i = 0; i < count; i++) {
          const a = (i + (i % 2) * 0.5) / count * 6.2832, h = hash(i * 7 + extra);
          const hillOpts = {
            seed: i * 3 + extra,
            snowline: 4,           // no snow (Texas Hill Country)
            forest: col,
            rock: [Math.max(0.42, col[0] * 0.87), Math.max(0.37, col[1] * 0.87), Math.max(0.30, col[2] * 0.78)]
          };
          mountain(cx + Math.cos(a) * ring, cz + Math.sin(a) * ring, pyMin,
                   wMin + h * 90, hMin + h * 20, hillOpts);
        }
      }

      // ================= AUSTIN DOWNTOWN SKYLINE (s 0.28–0.65, L far) =================
      // Iconic downtown Austin skyline visible from the south side of the circuit.
      // Increased minimum distance to 250 m so buildings sit well beyond any
      // parallel road segment.  Floor count derived from height for crisp window bands.
      // Emissive-warm window accent boxes simulate sun-lit glass on the day palette.
      {
        const AUSTIN_WALL  = [0.52, 0.54, 0.62];   // subtle steel blue-grey
        const AUSTIN_WIN   = [0.34, 0.44, 0.58];   // glass blue-green
        const AUSTIN_LIT   = [0.72, 0.76, 0.54];   // warm daytime reflective accent
        const skylineData = [
          // [s, side, dist, w, h]
          [0.29, -1, 260,  14,  58],   // west anchor tower
          [0.33, -1, 285,  20,  80],   // rising cluster
          [0.37, -1, 250,  18,  66],   // valley variation
          [0.41, -1, 295,  26, 125],   // tallest iconic tower (center)
          [0.45, -1, 270,  22,  96],   // secondary peak
          [0.50, -1, 255,  18,  74],   // descent
          [0.55, -1, 290,  20,  92],   // mid-band rise
          [0.60, -1, 240,  16,  70],   // taper
          [0.65, -1, 295,  24, 108],   // right edge tall
        ];
        for (const [s, side, dist, w, h] of skylineData) {
          const kb = K(s);
          building(kb, side, dist, w, h, w,
            { wall: AUSTIN_WALL, window: AUSTIN_WIN, floor: Math.round(h / 12) });
          // Sun-catch accent: bright warm strip near the top of each tower
          // (reads as reflective glazing in the Texas afternoon sun)
          const ab = anchor(kb, side, dist);
          if (!onTrack(ab.c[0], ab.c[2], w * 0.6)) {
            addBox(out, vadd(ab.c, ab.u, h * 0.85), [w * 1.02, h * 0.08, w * 1.02],
                   AUSTIN_LIT, [ab.r, ab.u, ab.t]);
          }
        }
      }

      // ---- Scattered oak/cedar groves over dry grass (denser, mid-distance) ----
      every(40, (k) => {
        for (const side of [-1, 1]) {
          const r = hash(k * 13 + side);
          if (r > 0.72) continue;
          const cnt = 2 + (hash(k * 31 + side) > 0.5 ? 1 : 0);
          for (let j = 0; j < cnt; j++) {
            const d = 28 + hash(k * 7 + side + j * 11) * 52;
            const h = 6 + hash(k * 17 + side + j * 9) * 7;
            const pick = hash(k * 5 + j);
            if (pick > 0.66) pine(k, side, d, h + 2, cedar);
            else tree(k, side, d, h, pick > 0.33 ? oak : cedar);
          }
          if (hash(k * 23 + side) > 0.45) bush(k, side, 22 + hash(k * 3 + side) * 48, scrub);
          if (hash(k * 29 + side) > 0.60) bush(k, side, 32 + hash(k * 19 + side) * 38, oak);
          if (hash(k * 41 + side) > 0.55) bush(k, side, 15 + hash(k * 11 + side) * 14, dryGrass);
        }
      });

      // ---- Texas scrub every 25 m for ground texture ----
      every(25, (kk) => {
        const rVal = hash(kk * 61);
        if (rVal > 0.78) return;
        const d = 18 + rVal * 24;
        bush(kk, 1, d, [0.32, 0.40, 0.22]);
        if (hash(kk * 73) > 0.68) {
          tree(kk, 1, d + 9 + hash(kk * 79) * 10, 6 + hash(kk * 83) * 3.5, [0.24, 0.38, 0.18]);
        }
      });

      // ---- Start/finish gantry over the main straight (s≈0.00) ----
      gantry(0.00, 7.5, darkSteel);
      // scoring / DRS-detection gantry on the back straight (s≈0.50)
      gantry(0.50, 7.0, darkSteel);

      // ---- Catch fences behind the kerbs ----
      fence(0.00, 0.06, 1,  5, 3.4, [0.62, 0.64, 0.68]);   // main straight, R
      fence(0.94, 1.00, 1,  5, 3.4, [0.62, 0.64, 0.68]);   // final corner, R
      fence(0.46, 0.62, -1, 6, 3.4, [0.62, 0.64, 0.68]);   // back straight, L
      fence(0.08, 0.14, -1, 8, 3.4, [0.62, 0.64, 0.68]);   // T1 hill, L

      // ---- Armco guardrails ----
      guardrail(0.15, 0.28,  1, 4, [0.80, 0.80, 0.82]);    // Esses, R
      guardrail(0.15, 0.28, -1, 4, [0.80, 0.80, 0.82]);    // Esses, L
      guardrail(0.78, 0.90,  1, 4, [0.80, 0.80, 0.82]);    // triple-apex sweeper, R
      guardrail(0.62, 0.70,  1, 5, [0.80, 0.80, 0.82]);    // T12 hairpin exit, R

      // ---- Tyre walls at the two big braking zones ----
      tyreWall(0.095, 0.135,  1, 6, redSteel);             // T1 apex outside
      tyreWall(0.61,  0.66,   1, 6, [0.95, 0.85, 0.1]);   // T12 hairpin
      tyreWall(0.30,  0.34,  -1, 6, [0.1, 0.5, 0.9]);     // mid-lap chicane

      // ---- Billboards / advertising hoardings ----
      billboard(K(0.07), -1, 14, 16, 6, redSteel);
      billboard(K(0.22),  1, 16, 18, 6, cotaBlue);
      billboard(K(0.40), -1, 18, 16, 6, [0.92, 0.5, 0.1]);
      billboard(K(0.50),  1, 18, 18, 6, [0.1, 0.6, 0.35]);
      billboard(K(0.70), -1, 16, 16, 6, redSteel);
      billboard(K(0.88),  1, 18, 16, 6, cotaBlue);

      // ---- Marshal posts at corner stations ----
      [0.04, 0.12, 0.20, 0.28, 0.43, 0.58, 0.64, 0.80, 0.90].forEach((s, i) => {
        marshalPost(K(s), (i % 2 ? 1 : -1), 7);
      });

      // ---- Distance-marker boards on the two big braking zones ----
      [50, 100, 150].forEach((m, i) => {
        const km = K(0.085 - m * 0.00018);
        place(km,  1, 9 + i, [1.0, 2.4, 0.4], white);
        const kh = K(0.60  - m * 0.00018);
        place(kh, -1, 9 + i, [1.0, 2.4, 0.4], white);
      });

      // ---- TV camera towers at scenic vantage points ----
      [[0.10, -1, 22], [0.50, 1, 24], [0.84, -1, 24]].forEach(([s, side, d]) => {
        const kc = K(s), ac = anchor(kc, side, d), cb = [ac.r, ac.u, ac.t];
        if (!onTrack(ac.c[0], ac.c[2], 18)) {
          addCyl(out, ac.c, 0.6, 11, darkSteel, 4, cb);
          addBox(out, vadd(ac.c, ac.u, 11), [2.4, 1.6, 1.6], [0.1, 0.1, 0.12], cb);
        }
      });

      // ---- Paddock car park rows (s≈0.55, L far) ----
      const kp = K(0.55), ap = anchor(kp, -1, 72), pb = [ap.r, ap.u, ap.t];
      if (!onTrack(ap.c[0], ap.c[2], 44)) {
        for (let row = -1; row <= 1; row++) {
          for (let col = -2; col <= 2; col++) {
            const c = vadd(vadd(ap.c, ap.t, col * 7), ap.r, row * 5);
            const tint = hash(row * 7 + col * 11);
            const carCol = [0.32 + tint * 0.46, 0.28 + hash(col * 13) * 0.36, 0.30 + hash(row * 17) * 0.40];
            addBox(out, vadd(c, ap.u, 0.7), [2.0, 1.3, 4.0], carCol, pb);
          }
        }
      }

      // ================== LAMP POSTS — night-ready circuit lighting ==================
      // COTA is a day track (night: false) but adding lamp posts makes the scene
      // night-ready and adds visual rhythm to the main straight and T1 area.
      // Lamp head boxes use a warm near-white colour; the pole is dark steel.
      // Posts placed at 5 m gap so inner face never reaches the tarmac.

      // Main straight lamp posts (both sides, every 50 m)
      along(0.92, 0.10, 50, (k) => {
        for (const side of [-1, 1]) {
          const pa = anchor(k, side, 5);
          if (onTrack(pa.c[0], pa.c[2], 1)) return;
          addCyl(out, pa.c, 0.18, 10, lampPost, 5, [pa.r, pa.u, pa.t]);
          // horizontal arm reaching back toward track
          addBox(out, vadd(pa.c, pa.u, 9.5),  [0.14, 0.14, 2.8], lampPost, [pa.r, pa.u, pa.t]);
          // lamp head at arm tip
          addBox(out, vadd(vadd(pa.c, pa.t, -side * 1.2), pa.u, 9.0),
                 [0.6, 0.28, 1.2], lampHead, [pa.r, pa.u, pa.t]);
        }
      });

      // T1 hill lamp posts (left side — the famous lit climb for evening races)
      along(0.06, 0.15, 55, (k) => {
        const pa = anchor(k, -1, 6);
        if (onTrack(pa.c[0], pa.c[2], 1)) return;
        addCyl(out, pa.c, 0.18, 11, lampPost, 5, [pa.r, pa.u, pa.t]);
        addBox(out, vadd(pa.c, pa.u, 10.5), [0.14, 0.14, 2.6], lampPost, [pa.r, pa.u, pa.t]);
        addBox(out, vadd(vadd(pa.c, pa.t, 1.0), pa.u, 10.0),
               [0.6, 0.28, 1.2], lampHead, [pa.r, pa.u, pa.t]);
      });

      // Back straight lamp posts (left side)
      along(0.40, 0.62, 55, (k) => {
        const pa = anchor(k, -1, 5);
        if (onTrack(pa.c[0], pa.c[2], 1)) return;
        addCyl(out, pa.c, 0.18, 10, lampPost, 5, [pa.r, pa.u, pa.t]);
        addBox(out, vadd(pa.c, pa.u, 9.5),  [0.14, 0.14, 2.6], lampPost, [pa.r, pa.u, pa.t]);
        addBox(out, vadd(vadd(pa.c, pa.t, 1.0), pa.u, 9.0),
               [0.6, 0.28, 1.2], lampHead, [pa.r, pa.u, pa.t]);
      });

      // ================== LIGHT-POOL PATCHES (decorative ground accent) ==================
      // Subtle bright ground patches beneath each lamp cluster on the main straight
      // (read as spill pools of light on the asphalt when viewed from above/cockpit).
      along(0.92, 0.10, 50, (k) => {
        for (const side of [-1, 1]) {
          const pa = anchor(k, side, 5);
          if (onTrack(pa.c[0], pa.c[2], 4)) return;
          // very flat slab, slightly brighter than surrounding terrain
          addBox(out, [pa.c[0], pa.c[1] + 0.05, pa.c[2]],
                 [4.0, 0.08, 4.0], [0.88, 0.86, 0.76], [pa.r, pa.u, pa.t]);
        }
      });
    },
  }
  );
})();
