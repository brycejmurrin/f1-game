/* Apex 26 — COTA circuit definition (data only).
   Registered on the global TrackDefs list; consumed by the js/tracks.js engine
   (palette resolved there from `night`, geometry from js/circuits.js or `segs`). */
(function () {
  "use strict";
  (window.TrackDefs = window.TrackDefs || []).push(
  {
    id: "cota",
    reverse: false, // direction switched to real-world CW/CCW (was auto-audit reverse:true)
    startFrac: 0.5150, // GPS-derived (OpenF1 2025, conf=0.367)
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
    // Turn 1: the calendar's most famous climb — kept as the circuit's signature
    // rise but eased to ~3.2% grade so the chase-cam doesn't read it as a wall.
    elevations: [{ s: 0.06, halfM: 340, rise: 7 }],
    scenery: function (api) {
      const { out, MAT, n, px, pz, hw, pyMin, place, prop, addBox, addPrism, addPyramid, addCyl, addCone, addFrustum, every, along, onTrack, anchor, vadd, hash, grandstand, building, motorhome, billboard, gantry, marshalPost, fence, guardrail, tyreWall, wall, tree, bush, pine, mountain, forestEdge, cityFront, backdrop } = api;
      const K = (s) => Math.round(s * n) % n;

      // ======================= BESPOKE COTA MODELS =======================
      // -- Speckled crowd palette (casual Texan race-day colours) --
      const crowdCols = [
        [0.86, 0.28, 0.24], [0.24, 0.42, 0.78], [0.94, 0.82, 0.28],
        [0.90, 0.90, 0.92], [0.26, 0.62, 0.38], [0.82, 0.46, 0.20],
        [0.52, 0.30, 0.66], [0.16, 0.30, 0.52],
      ];
      // -- Bespoke: raked, PACKED crowd terrace on a slope (the amphitheatre hill) --
      // Stepped rows of speckled spectator boxes rising away from the track on a
      // concrete terrace shell — reads as a densely packed hillside grandstand.
      const crowdBank = (s, side, gap, len, rows, dens) => {
        const k = K(s), a = anchor(k, side, gap);
        if (onTrack(a.c[0], a.c[2], 8)) return;
        const bv = [a.r, a.u, a.t], step = 2.5, rise = 1.7;
        // terrace shell (concrete wedge) beneath the crowd
        out._mat = MAT.CONCRETE;
        addPrism(out, vadd(a.c, a.u, rows * rise * 0.5),
                 [rows * step, rows * rise, len], [0.40, 0.41, 0.45], [a.t, a.u, a.r]);
        out._mat = 0;
        const seats = Math.floor(len / (dens || 2.1));
        for (let r = 0; r < rows; r++) {
          const back = r * step, up = r * rise + 1.1;
          for (let c = 0; c < seats; c++) {
            const off = (c - seats / 2) * (dens || 2.1) + (hash(k * 7 + r * 13 + c) - 0.5) * 0.7;
            const p = vadd(vadd(vadd(a.c, a.r, back), a.u, up), a.t, off);
            addBox(out, p, [0.9, 1.1, 0.8], crowdCols[(r * 5 + c * 3) % crowdCols.length], bv);
          }
        }
      };

      // -- Bespoke: Austin360 Amphitheater — proscenium shell + PA towers + LED wall + lawn --
      const amphiStage = (s, side, dist) => {
        const k = K(s), a = anchor(k, side, dist), bv = [a.r, a.u, a.t];
        if (onTrack(a.c[0], a.c[2], 40)) return;
        // raised black stage deck
        out._mat = MAT.CONCRETE;
        addBox(out, vadd(a.c, a.u, 2.4), [28, 4.8, 22], [0.18, 0.18, 0.21], bv);
        out._mat = 0;
        // fan roof canopy — three tiered arcs stepping back over the stage
        out._mat = MAT.METAL;
        for (let i = 0; i < 3; i++) {
          addFrustum(out, vadd(vadd(a.c, a.u, 17 + i * 3), a.r, i * 5),
                     27 - i * 5, 23 - i * 5, 2.6, [0.82 - i * 0.06, 0.82 - i * 0.06, 0.86], 18, bv);
        }
        out._mat = 0;
        // proscenium back wall + big glowing LED video wall
        out._mat = MAT.CONCRETE;
        addBox(out, vadd(vadd(a.c, a.u, 11), a.r, -8), [2.2, 22, 30], [0.14, 0.14, 0.16], bv);
        out._mat = 0;
        addBox(out, vadd(vadd(a.c, a.u, 11), a.r, -6.8), [0.6, 13, 22], [0.32, 0.56, 0.88], bv);
        // PA line-array towers flanking the stage
        out._mat = MAT.METAL;
        for (const so of [-1, 1]) {
          const base = vadd(a.c, a.t, so * 17);
          addCyl(out, base, 0.55, 20, [0.12, 0.12, 0.14], 4, bv);
          for (let j = 0; j < 5; j++)
            addBox(out, vadd(base, a.u, 11 + j * 1.5), [1.7, 1.3, 2.6], [0.06, 0.06, 0.08], bv);
        }
        out._mat = 0;
        // packed lawn crowd OUTWARD of the stage (away from the track), speckled
        for (let r = 0; r < 6; r++)
          for (let c = 0; c < 22; c++) {
            const p = vadd(vadd(vadd(a.c, a.r, 8 + r * 3), a.u, 0.9),
                           a.t, (c - 11) * 2.1 + (hash(r * 31 + c) - 0.5));
            addBox(out, p, [0.8, 1.0, 0.7], crowdCols[(r * 7 + c) % crowdCols.length], bv);
          }
      };

      // -- Palette (Texas Hill Country, DAY) --
      const dryGrass  = [0.55, 0.62, 0.30];
      const scrub     = [0.28, 0.38, 0.22];   // muted — avoids vivid green
      const oak       = [0.24, 0.36, 0.18];
      const cedar     = [0.20, 0.30, 0.18];
      const redSoil   = [0.62, 0.34, 0.24];
      const redSteel  = [0.86, 0.20, 0.16];
      const white     = [0.92, 0.92, 0.94];
      const darkSteel = [0.32, 0.34, 0.40];
      const glass     = [0.40, 0.56, 0.66];
      const cotaBlue  = [0.16, 0.30, 0.52];
      // emissive warm window tint
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
      // Turn-12 hairpin braking-zone stand (s≈0.625, R)
      grandstand(0.625, 1, 14, 70, [0.38, 0.39, 0.44], [0.5, 0.5, 0.54]);
      // Triple-apex sweeper stand (s≈0.83, R)
      grandstand(0.83,  1, 16, 64, [0.40, 0.41, 0.46], [0.5, 0.5, 0.54]);
      // Extra deep main-straight upper tier behind the front stand (s≈0.02, R far)
      grandstand(0.02,  1, 30, 130, [0.30, 0.31, 0.36], [0.48, 0.48, 0.52]);

      // ---- Pit/paddock building cluster (s≈0.97–0.05, L) ----
      // long low pit garage block flanking the main straight
      building(K(0.97), -1, 12, 24, 8, 120, { wall: [0.84, 0.84, 0.86], window: glass, floor: 2, roof: [0.55, 0.56, 0.60] });
      // paddock hospitality / team motorhomes behind the pits — was a generic
      // office-block building() under a "motorhomes" comment; motorhome() is
      // the purpose-built two-tier team-unit body.
      motorhome(K(0.99), -1, 40, 30, 8, 60, { wall: [0.88, 0.88, 0.90], window: glass });
      motorhome(K(0.04), -1, 38, 26, 7, 44, { wall: [0.80, 0.80, 0.83], window: glass });
      // race-control / media tower at pit exit (s≈0.05, L) — set back 16m so inner face clear
      building(K(0.05), -1, 16, 16, 18, 22, { wall: cotaBlue, window: glass, floor: 5, roof: darkSteel });

      // ---- Turn 1 = Big Red only: red-soil climb + packed crowd + stands (no tower) ----
      // Signature silhouette is the uphill amphitheatre of dirt and fans — the
      // Observation Tower lives with the concert amphitheater at T16–18.
      {
        const k1 = K(0.10);
        const a1 = anchor(k1, 1, 16);
        addPrism(out, vadd(a1.c, a1.u, 4), [20, 12, 60], redSoil, [a1.t, a1.u, a1.r]);
        // large outer mound on the left side of the hill
        const a1L = anchor(k1, -1, 26);
        addPrism(out, vadd(a1L.c, a1L.u, 3), [28, 8, 72], [0.58, 0.36, 0.26], [a1L.t, a1L.u, a1L.r]);
        // extra red-soil apron on the climb apex (outside) — sells the Big Red bank
        const a1R = anchor(K(0.085), 1, 22);
        addPrism(out, vadd(a1R.c, a1R.u, 2.5), [16, 7, 48], redSoil, [a1R.t, a1R.u, a1R.r]);
      }

      // ---- Esses spectator viewing mounds (s≈0.18, both sides) ----
      const ke = K(0.18);
      const me = anchor(ke, -1, 32);
      addPrism(out, vadd(me.c, me.u, 2), [34, 6, 64], scrub, [me.t, me.u, me.r]);
      const me2 = anchor(ke, 1, 32);
      addPrism(out, vadd(me2.c, me2.u, 2), [34, 6, 64], scrub, [me2.t, me2.u, me2.r]);

      // ---- Turn-1 amphitheatre crowd hill — PACKED terraced fans on the famous climb ----
      // Sits behind/above the stock grandstands, reading as the wall of spectators
      // that lines COTA's Turn-1 hairpin hill. This is the T1 hero — not the tower.
      crowdBank(0.095, -1, 40, 110, 7, 2.0);
      crowdBank(0.135, -1, 46, 70, 6, 2.2);
      // Final-corner / main-straight packed terrace (s≈0.98, R)
      crowdBank(0.975, 1, 34, 120, 6, 2.2);

      // ---- Austin360 Amphitheater + Observation Tower (T16–18, s≈0.76–0.80, R) ----
      // Real COTA: 251 ft Miró Rivera tower sits ON the amphitheater — pale shaft
      // with a cascading red tube veil that forms the stage canopy. Not at Turn 1.
      amphiStage(0.76, 1, 68);

      // Observation Tower — pale shaft + red tube veil (no rainbow rings)
      {
        const kt = K(0.78);
        const at = anchor(kt, 1, 82), tb = [at.r, at.u, at.t];
        if (!onTrack(at.c[0], at.c[2], 36)) {
          const tBase = at.c;
          const pale = [0.86, 0.87, 0.90];
          const pale2 = [0.80, 0.81, 0.85];
          const deckH = 70;
          // pale elevator shaft in 3 tapered stages
          out._mat = MAT.METAL;
          addFrustum(out, tBase,                 4.6, 3.8, 28, pale,  8, tb);
          addFrustum(out, vadd(tBase, at.u, 28), 3.8, 3.2, 28, pale2, 8, tb);
          addFrustum(out, vadd(tBase, at.u, 56), 3.2, 2.6, 14, pale,  8, tb);
          // observation deck — pale ring + floor (red is reserved for the veil)
          const deckCen = vadd(tBase, at.u, deckH);
          addCyl(out, deckCen, 7.8, 2.2, pale2, 10, tb);
          addBox(out, vadd(tBase, at.u, deckH + 1.1), [13, 1.4, 13], white, tb);
          addCyl(out, vadd(tBase, at.u, deckH + 2.6), 6.4, 1.6, [0.74, 0.76, 0.82], 8, tb);
          addCone(out, vadd(tBase, at.u, deckH + 4.2), 3.8, 3.4, [0.68, 0.69, 0.74], 8, tb);
          addCyl(out, vadd(tBase, at.u, deckH + 7.8), 0.28, 8.0, pale2, 5, tb);
          addBox(out, vadd(tBase, at.u, deckH + 16.0), [0.6, 0.6, 0.6], [1.0, 0.82, 0.25], tb);
          out._mat = 0;
          // red tube veil — ~14 thin tubes on the amphitheater face, full height
          out._mat = MAT.METAL;
          for (let i = 0; i < 14; i++) {
            const tOff = (i - 6.5) * 0.85;
            const rOff = 3.2 + Math.abs(tOff) * 0.08;
            addCyl(out, vadd(vadd(tBase, at.r, rOff), at.t, tOff),
                   0.20, deckH - 2, redSteel, 5, tb);
          }
          // cascading canopy flare — tubes spill outward/down over the stage
          for (let i = 0; i < 11; i++) {
            const tOff = (i - 5) * 3.2;
            const flare = 10 + i * 0.35;
            const y = 18 - Math.abs(i - 5) * 0.8;
            addBox(out,
              vadd(vadd(vadd(tBase, at.r, flare), at.u, y), at.t, tOff),
              [14 + Math.abs(i - 5) * 1.2, 0.32, 0.38], redSteel, tb);
          }
          // lower veil ribs tying shaft to stage canopy
          for (let i = 0; i < 7; i++) {
            const tOff = (i - 3) * 4.0;
            addBox(out,
              vadd(vadd(vadd(tBase, at.r, 18), at.u, 8), at.t, tOff),
              [22, 0.28, 0.32], redSteel, tb);
          }
          out._mat = 0;
          // base plant room
          prop(kt, 1, 66, [14, 6, 16], [0.84, 0.84, 0.86]);
          // deck glass strip
          out._mat = MAT.GLASS;
          addBox(out, vadd(tBase, at.u, deckH + 0.5), [14.2, 0.7, 14.2], litWin, tb);
          out._mat = 0;
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

      // Velocity Tower + water tower culled — open Hill Country frame (Top-3 #3).

      // ---- Texas Hill Country ridgelines — LOW organic hills on the horizon ----
      // Use backdrop() for cheap rounded hill mounds instead of full mountain() meshes.
      // backdrop() auto-detects green-dominant colors and renders as frustum+cone mound,
      // costing ~2 primitives vs ~80 triangles per mountain() — critical for SwiftShader.
      // Place ~6 anchor points around the circuit for 3 depth layers.
      const hillAnchors = [
        // [s-frac, side, dist, width, height, depth, col]
        // Near ring — closest visible hills (150–200 m from road edge)
        [0.10, -1, 165, 280, 42, 60, [0.36, 0.44, 0.26]],
        [0.25,  1, 155, 260, 38, 55, [0.38, 0.46, 0.28]],
        [0.40, -1, 170, 300, 44, 65, [0.34, 0.42, 0.24]],
        [0.55,  1, 160, 270, 40, 58, [0.36, 0.44, 0.26]],
        [0.70, -1, 175, 290, 46, 62, [0.38, 0.46, 0.28]],
        [0.85,  1, 150, 260, 38, 55, [0.34, 0.42, 0.24]],
        // Mid ring — second layer adds depth (280–360 m out)
        [0.05, -1, 300, 350, 56, 70, [0.40, 0.48, 0.30]],
        [0.20,  1, 320, 380, 62, 75, [0.42, 0.50, 0.32]],
        [0.35, -1, 310, 360, 58, 72, [0.40, 0.48, 0.30]],
        [0.50,  1, 340, 400, 66, 80, [0.44, 0.52, 0.34]],
        [0.65, -1, 295, 340, 54, 68, [0.40, 0.48, 0.30]],
        [0.80,  1, 315, 370, 60, 74, [0.42, 0.50, 0.32]],
        // Far ring — misty horizon haze (480–560 m out)
        [0.15, -1, 500, 460, 76, 90, [0.44, 0.50, 0.36]],
        [0.45,  1, 520, 480, 80, 95, [0.46, 0.52, 0.38]],
        [0.75, -1, 510, 470, 78, 92, [0.44, 0.50, 0.36]],
      ];
      for (const [sf, side, dist, w, h, d, col] of hillAnchors) {
        backdrop(K(sf), side, dist, [w, h, d], col);
      }

      // ---- T1 hill climb ridge cues: earth mounds framing the famous uphill entry ----
      {
        const hillGrass = [0.40, 0.48, 0.26];
        // Staggered mounds on both sides of the climb — kept close so they read as earthworks
        for (const [sf, side, gapOff] of [
          [0.01, 1, 0], [0.02, -1, 4], [0.035, 1, 0], [0.045, -1, 6],
        ]) {
          const ah = anchor(K(sf), side, 34 + gapOff + hash(K(sf) * 3) * 14);
          addPrism(out, ah.c, [26, 9 + hash(K(sf) * 7) * 5, 44], hillGrass,
                   [ah.t, ah.u, ah.r]);
        }
      }

      // ================= AUSTIN DOWNTOWN — thinned haze (Hill Country first) =================
      // Short, sparse, far skyline so ridgelines + tower read; not a city wall.
      cityFront(0.38, 0.55, -1, 320, {
        minH: 28,
        maxH: 55,
        depth: 16,
        step: 48,
        lit: false,
        palette: [
          [0.52, 0.54, 0.62],
          [0.56, 0.58, 0.64],
          [0.48, 0.50, 0.58],
          [0.60, 0.60, 0.66],
          [0.50, 0.52, 0.60],
        ],
      });

      // ================== COHERENT TREELINES via forestEdge() ==================
      // Replace scattered individual trees with continuous treeline edges.
      // gap values are generous (16–24 m) to clear barriers and grandstands.
      // Colors deliberately muted (dark oak/cedar) — no vivid green.
      // density kept moderate (0.4–0.55) so step stays ≥4 m and count is bounded.

      // Main straight / pit entry approach (right side, back from buildings)
      forestEdge(0.88, 0.98,  1, 22, { density: 0.50, hMin: 7, hMax: 13, col: cedar, col2: oak,   pineFrac: 0.4 });

      // Turn 1 approach — left side treeline behind grandstands
      forestEdge(0.06, 0.16, -1, 32, { density: 0.45, hMin: 8, hMax: 14, col: oak,   col2: cedar, pineFrac: 0.55 });

      // Esses sector — both sides, set back behind the guardrails
      forestEdge(0.16, 0.28, -1, 20, { density: 0.50, hMin: 7, hMax: 12, col: cedar, col2: oak,   pineFrac: 0.45 });
      forestEdge(0.16, 0.28,  1, 20, { density: 0.45, hMin: 6, hMax: 11, col: oak,   col2: cedar, pineFrac: 0.35 });

      // Mid-circuit sector (s≈0.28–0.40, right side — dry Texas scrub)
      forestEdge(0.28, 0.42,  1, 18, { density: 0.35, hMin: 6, hMax: 10, col: [0.22, 0.34, 0.18], col2: [0.26, 0.36, 0.20], pineFrac: 0.30 });

      // Back straight (s≈0.40–0.62, both sides — sparse Texas live oaks)
      forestEdge(0.40, 0.55, -1, 24, { density: 0.45, hMin: 7, hMax: 12, col: oak,   col2: cedar, pineFrac: 0.50 });
      forestEdge(0.40, 0.62,  1, 18, { density: 0.40, hMin: 6, hMax: 11, col: cedar, col2: oak,   pineFrac: 0.40 });

      // T12 hairpin and amphitheatre approach (s≈0.62–0.72)
      forestEdge(0.62, 0.74, -1, 20, { density: 0.45, hMin: 7, hMax: 12, col: oak,   col2: cedar, pineFrac: 0.45 });
      forestEdge(0.72, 0.84, -1, 20, { density: 0.45, hMin: 7, hMax: 12, col: oak,   col2: cedar, pineFrac: 0.45 });

      // Final sweeper sector (s≈0.84–0.96, both sides)
      forestEdge(0.84, 0.96, -1, 18, { density: 0.45, hMin: 7, hMax: 12, col: oak,   col2: cedar, pineFrac: 0.45 });
      forestEdge(0.84, 0.92,  1, 20, { density: 0.35, hMin: 6, hMax: 10, col: cedar, col2: oak,   pineFrac: 0.35 });

      // ---- Start/finish gantry over the main straight (s≈0.00) ----
      gantry(0.00, 7.5, darkSteel);
      // scoring / DRS-detection gantry on the back straight (s≈0.50)
      gantry(0.50, 7.0, darkSteel);

      // ---- Catch fences behind the kerbs ----
      fence(0.00, 0.06,  1, 5, 3.4, [0.62, 0.64, 0.68]);   // main straight, R
      fence(0.94, 1.00,  1, 5, 3.4, [0.62, 0.64, 0.68]);   // final corner, R
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

      // ================== LAMP POSTS — main straight only (reduced for performance) ==================
      // COTA is a day-race circuit. Lamp posts are kept to the main straight only —
      // every 80 m (was 50 m) to reduce addCyl/addBox count under SwiftShader.
      along(0.94, 0.06, 80, (k) => {
        for (const side of [-1, 1]) {
          const pa = anchor(k, side, 5);
          if (onTrack(pa.c[0], pa.c[2], 1)) return;
          addCyl(out, pa.c, 0.18, 10, lampPost, 5, [pa.r, pa.u, pa.t]);
          addBox(out, vadd(pa.c, pa.u, 9.5), [0.14, 0.14, 2.8], lampPost, [pa.r, pa.u, pa.t]);
          addBox(out, vadd(vadd(pa.c, pa.t, -side * 1.2), pa.u, 9.0),
                 [0.6, 0.28, 1.2], lampHead, [pa.r, pa.u, pa.t]);
        }
      });
    },
  }
  );
})();
