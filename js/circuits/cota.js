/* Apex 26 — COTA circuit definition (data only).
   Registered on the global TrackDefs list; consumed by the js/track/tracks.js engine
   (palette resolved there from `night`, geometry from js/track/geo-paths.js or `segs`). */
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
    sceneryCoordinates: "racing",
    // COTA folds back tightly around the back straight. The shared 120 m ribbon
    // chords across that lower section; 48 m still carries the runoff and near
    // furniture while leaving distant Hill Country dressing on the safe floor.
    terrainOuter: 48,
    dressingExclusions: [
      { kind: "foliage", s0: 0.94, s1: 0.16 },          // pits + Big Red sightline
      { kinds: ["foliage"], s0: 0.72, s1: 0.86, side: 1 }, // tower/amphitheater
    ],
    pal: { zenith: [0.28, 0.54, 0.82], horizon: [0.74, 0.68, 0.52], grass: [0.36, 0.44, 0.20], runoff: [0.58, 0.38, 0.24], ambientSky: [0.50, 0.58, 0.66], ambientGround: [0.30, 0.30, 0.26], sunDir: [0.5345224838248488, 0.5550810408950353, 0.6373152691757812], sun: [1.0, 0.88, 0.62], sunColor: [1.0, 0.85, 0.55] },
    segs: [
      { t: 0, l: 220, h: 30 }, { t: -120, l: 110, h: -6 }, { t: 0, l: 80, h: -22 }, { t: 60, l: 60 }, { t: -55, l: 60 }, { t: 60, l: 60 },
      { t: -55, l: 70 }, { t: 50, l: 70 }, { t: -40, l: 80 }, { t: -60, l: 90 }, { t: -120, l: 110 }, { t: 0, l: 460 },
      { t: -150, l: 130 }, { t: 70, l: 70 }, { t: -60, l: 70 }, { t: 80, l: 90 }, { t: 90, l: 160 }, { t: -130, l: 110 },
    ],
    // Elevations are SOURCE-trace fractions. With startFrac=0.515 these map to
    // racing s≈0.108 (Big Red), 0.52 (back-straight crest), and 0.84 (sweepers).
    elevations: [
      { s: 0.6233, halfM: 420, rise: 18 },
      { s: 0.0350, halfM: 280, rise: 3 },
      { s: 0.3550, halfM: 240, rise: 2.5 },
    ],
    // COTA camber. Tilke built real banking into the uphill T1 and the long
    // multi-apex left before the back straight; the esses and the tight links
    // get ordinary 3-4° road camber.
    bankZones: [
      { frac: 0.0000, angleDeg: 5.0, widthM: 100 },   // uphill T1
      { frac: 0.3670, angleDeg: 4.0, widthM: 160 },
      { frac: 0.3852, angleDeg: 4.0, widthM: 170 },
      { frac: 0.5022, angleDeg: 3.0, widthM: 80 },
      { frac: 0.7035, angleDeg: 3.5, widthM: 160 },
      { frac: 0.8161, angleDeg: 4.5, widthM: 200 },   // the long multi-apex sweep
      { frac: 0.8430, angleDeg: 4.0, widthM: 120 },
    ],
    scenery: function (api) {
      const { out, MAT, n, ds, hw, place, addBox, addPrism, addCyl, addCone, addFrustum, along, onTrack, anchor, vadd, hash, modelGroup, overheadSpan, groundPatch, waterSurface, grandstand, grandstandEx, spectatorHill, bleacher, scaffoldStand, terrace, acacia, plane, cameraTower, building, motorhome, billboard, marshalPost, fence, guardrail, tyreWall, wall, forestEdge, cityFront, backdrop } = api;
      const K = (s) => Math.round(s * n) % n;

      // ======================= BESPOKE COTA MODELS =======================
      // -- Speckled crowd palette (casual Texan race-day colours) --
      const crowdCols = [
        [0.86, 0.28, 0.24], [0.24, 0.42, 0.78], [0.94, 0.82, 0.28],
        [0.90, 0.90, 0.92], [0.26, 0.62, 0.38], [0.82, 0.46, 0.20],
        [0.52, 0.30, 0.66], [0.16, 0.30, 0.52],
      ];
      // COTA's local crowdBank() is gone. It was a point-anchored concrete wedge
      // with ONE BOX PER SEAT on top — 1150-odd spectator cubes across its five
      // call sites, ~28 k verts, and a straight `len` mass that chorded across
      // the T1 climb and the T12 bowl instead of following them. The shared
      // library now carries the three forms those five calls were actually
      // reaching for, each a range emitter that walks the arc and each using
      // the banded-run-plus-speckle crowd discipline rather than a cube per
      // person. Helper below converts COTA's centre+length authoring into the
      // (s0, s1) ranges those emitters take.
      const mFrac = (m) => m / (ds * n);
      const span = (s, len) => [s - mFrac(len) / 2, s + mFrac(len) / 2];

      // -- Bespoke: Austin360 Amphitheater — proscenium shell + PA towers + LED wall + lawn --
      const amphiStage = (s, side, dist) => {
        const k = K(s), a = anchor(k, side, dist), bv = [a.r, a.u, a.t];
        const center = vadd(vadd(a.c, a.r, 8), a.u, 13);
        modelGroup("cota-amphitheater", {
          center, size: [52, 30, 56], basis: bv,
        }, (stage) => {
          // raised black stage deck
          stage._mat = MAT.CONCRETE;
          addBox(stage, vadd(a.c, a.u, 2.4), [28, 4.8, 22], [0.18, 0.18, 0.21], bv);
          stage._mat = 0;
          // fan roof canopy — three tiered arcs stepping back over the stage
          stage._mat = MAT.METAL;
          for (let i = 0; i < 3; i++) {
            addFrustum(stage, vadd(vadd(a.c, a.u, 17 + i * 3), a.r, i * 5),
                       27 - i * 5, 23 - i * 5, 2.6, [0.82 - i * 0.06, 0.82 - i * 0.06, 0.86], 18, bv);
          }
          stage._mat = 0;
          // proscenium back wall + big glowing LED video wall
          stage._mat = MAT.CONCRETE;
          addBox(stage, vadd(vadd(a.c, a.u, 11), a.r, -8), [2.2, 22, 30], [0.14, 0.14, 0.16], bv);
          stage._mat = 0;
          addBox(stage, vadd(vadd(a.c, a.u, 11), a.r, -6.8), [0.6, 13, 22], [0.32, 0.56, 0.88], bv);
          // PA line-array towers flanking the stage
          stage._mat = MAT.METAL;
          for (const so of [-1, 1]) {
            const base = vadd(a.c, a.t, so * 17);
            addCyl(stage, base, 0.55, 20, [0.12, 0.12, 0.14], 4, bv);
            for (let j = 0; j < 5; j++)
              addBox(stage, vadd(base, a.u, 11 + j * 1.5), [1.7, 1.3, 2.6], [0.06, 0.06, 0.08], bv);
          }
          stage._mat = 0;
          // packed lawn crowd OUTWARD of the stage (away from the track), speckled
          for (let r = 0; r < 6; r++)
            for (let c = 0; c < 22; c++) {
              const p = vadd(vadd(vadd(a.c, a.r, 8 + r * 3), a.u, 0.9),
                             a.t, (c - 11) * 2.1 + (hash(r * 31 + c) - 0.5));
              addBox(stage, p, [0.8, 1.0, 0.7], crowdCols[(r * 7 + c) % crowdCols.length], bv);
            }
        }, { required: true });
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

      // ---- Grandstands: THREE colour families instead of one grey box ----
      // STAND_SETS.cota = ["alu", "darkSteel", "sandstone"]. The real T1
      // bleachers are bare uncovered aluminium temp seating; the main
      // straight/pit cluster is dark permanent steel; the infield and back
      // straight stands run warm sandstone/tan. Passing shell/crowd as null
      // lets the named livery supply shell/roof/fascia/crowd in one go.

      // Main grandstand on the start/finish straight (s≈0.00, R) — the hero
      // stand: two raked tiers, glazed suites, closed end walls, roof pylons.
      grandstandEx(0.00, 1, 8, 150, null, null,
        { livery: "darkSteel", tiers: 2, roof: "cantilever", suites: true, endWalls: true, pylons: true });
      // Bespoke swept accent riding above the standard cantilever slab — the
      // real Miró Rivera roof is one continuous sweep, not a flat cap. A
      // shallow arc of tapering ribs that crowns at the stand's centre and
      // eases down to the standard roofline at both ends. Sits clear above
      // the cantilever (roofY+0.4 top) so it reads as an added upper sweep,
      // not a clipping double roof.
      {
        const kMain = K(0.00), segs_ = 10, roofY = 13 + 7.6; // matches tiers:2 (one 7.6 m tier lift)
        const aMain = anchor(kMain, 1, 8 + 5), mb = [aMain.r, aMain.u, aMain.t];
        for (let i = 0; i < segs_; i++) {
          const tt = (i + 0.5) / segs_ - 0.5;             // -0.5..0.5 along the 150 m stand
          const crown = Math.cos(tt * Math.PI) * 2.6;      // peaks at centre, 0 at the ends
          addBox(out, vadd(vadd(aMain.c, aMain.t, tt * 150), aMain.u, roofY + 1.1 + crown),
                 [11.6, 0.5, 150 / segs_ + 0.8], [0.30, 0.32, 0.37], mb);
        }
      }
      // Opposite paddock-side stand on the main straight (s≈0.00, L)
      grandstandEx(0.985, -1, 16, 90, null, null, { livery: "darkSteel", endWalls: true });
      // Final-corner stepped stand leading onto the main straight (s≈0.95, R)
      grandstandEx(0.95, 1, 9, 80, null, null, { livery: "darkSteel", endWalls: true });
      // Turn-1 hill stand catching the climb (s≈0.07, L) — bare aluminium
      // bleachers, uncovered (roof:"none") — set back enough to clear road.
      grandstandEx(0.07, -1, 14, 80, null, null, { livery: "alu", roof: "none" });
      // T1 hill stand mid-rise (s≈0.11, L) — uncovered alu
      grandstandEx(0.11, -1, 18, 60, null, null, { livery: "alu", roof: "none" });
      // T1 amphitheatre upper tier (s≈0.13, L) — uncovered alu
      grandstandEx(0.13, -1, 26, 64, null, null, { livery: "alu", roof: "none" });
      // The six infield/back-straight stands below all share the sandstone
      // family, and until now that colour was the ONLY thing distinguishing
      // them — six identical shells in one tan, which is precisely the
      // sameness the livery system was supposed to fix one level up. They are
      // not the same building in real life either: the pair at the Esses are
      // small bolt-together blocks, the back straight carries the biggest
      // covered stand outside the pit complex, and T15 is uncovered. Give each
      // the roof and deck it actually has.
      // Esses outside (s≈0.20, L) — low flat-capped block, closed ends.
      grandstandEx(0.20, -1, 16, 56, null, null,
        { livery: "sandstone", roof: "flat", endWalls: true, h: 9 });
      // Esses exit (s≈0.24, R) — open lattice roof on trackside pylons; the
      // ends stay open so the Esses stay visible through it from the outside.
      grandstandEx(0.24, 1, 18, 54, null, null,
        { livery: "sandstone", roof: "truss", pylons: true, h: 11 });
      // Back straight (s≈0.46, L) — the largest sandstone stand: two rakes
      // under a cantilever with a glazed suite band, closed at both ends.
      grandstandEx(0.46, -1, 12, 70, null, null,
        { livery: "sandstone", tiers: 2, roof: "cantilever", suites: true, endWalls: true, h: 12 });
      // Turn-12 hairpin braking zone (s≈0.625, R) — deep cantilever carried on
      // pylons over the crowd, the shape you want above a big stop.
      grandstandEx(0.625, 1, 14, 70, null, null,
        { livery: "sandstone", roof: "cantilever", pylons: true, endWalls: true, h: 12 });
      // Turn 15 (s≈0.685, R) — the corner between the T12 hairpin and the
      // T16-18 sweepers/amphitheatre gets its OWN stand rather than being
      // folded into the generic T12 (0.625) or back-straight (0.46) calls that
      // used to be the only cover here. Uncovered: it is the smallest of the
      // six and the one a Texas October actually leaves in the sun.
      grandstandEx(0.685, 1, 14, 55, null, null,
        { livery: "sandstone", roof: "none", h: 8 });
      // Triple-apex sweeper (s≈0.83, R) — truss roof plus suites, so it reads
      // tall and skeletal against the open sky behind the sweepers.
      grandstandEx(0.83, 1, 16, 64, null, null,
        { livery: "sandstone", roof: "truss", suites: true, endWalls: true, h: 11 });
      // Extra deep main-straight upper tier behind the front stand (s≈0.02, R far)
      grandstandEx(0.02, 1, 30, 130, null, null, { livery: "darkSteel", roof: "flat" });

      // ---- Pit/paddock building cluster (s≈0.97–0.05, L) ----
      // long low pit garage block flanking the main straight
      building(K(0.97), -1, 12, 24, 8, 120, { kind: "hall", wall: [0.84, 0.84, 0.86], window: glass, floor: 2 });
      // paddock hospitality / team motorhomes behind the pits — was a generic
      // office-block building() under a "motorhomes" comment; motorhome() is
      // the purpose-built two-tier team-unit body.
      motorhome(K(0.99), -1, 40, 30, 8, 60, { wall: [0.88, 0.88, 0.90], window: glass });
      motorhome(K(0.04), -1, 38, 26, 7, 44, { wall: [0.80, 0.80, 0.83], window: glass });
      // race-control / media tower at pit exit (s≈0.05, L) — set back 16m so inner face clear
      building(K(0.05), -1, 16, 16, 18, 22, { kind: "notch", wall: cotaBlue, window: glass, floor: 5 });

      // ---- 2026 dress pass: deeper paddock support campus (s≈0.01–0.04, L far) ----
      // Low team hospitality and scrutineering blocks sit behind the existing pit
      // lane buildings, adding depth without closing the driver's main-straight view.
      motorhome(K(0.012), -1, 72, 24, 7, 38, { wall: white, window: glass });
      building(K(0.035), -1, 70, 20, 6, 34, { kind: "hall",
        wall: [0.72, 0.74, 0.78], window: litWin, floor: 2, roof: cotaBlue,
      });

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

      // ---- Turn-1 amphitheatre crowd hill — PACKED bleachers on the famous climb ----
      // Sits behind/above the stock grandstands, reading as the wall of spectators
      // that lines COTA's Turn-1 hairpin hill. This is the T1 hero — not the tower.
      // BARE ALUMINIUM, uncovered, bolted together for the weekend: no back
      // shell, no fascia, no roof — planks on a frame with the legs showing
      // underneath, which is the whole reason grandstandEx (which always builds
      // a 12 m shell wall behind the crowd) is the wrong model for this hill.
      const ALU_FRAME = [0.70, 0.71, 0.75], ALU_PLANK = [0.78, 0.79, 0.82];
      const t1Rake = { rows: 8, rise: 1.45, setback: 2.1, step: 10,
                       frameCol: ALU_FRAME, plankCol: ALU_PLANK,
                       crowd: crowdCols, density: 0.62 };
      bleacher(...span(0.095, 110), -1, 40, t1Rake);
      bleacher(...span(0.135, 70), -1, 46,
        Object.assign({}, t1Rake, { rows: 7, density: 0.55 }));
      // Final-corner / main-straight packed terrace (s≈0.98, R). Not a bleacher:
      // this end of the straight is the paved Grand Plaza concourse, so it is
      // poured mass-concrete stepping with a retainer at the front — the one
      // permanent piece of open seating on the lap.
      terrace(...span(0.975, 120), 1, 34,
        { rows: 6, rise: 1.5, depth: 2.5, step: 9, crowd: crowdCols, density: 0.58,
          conc: [0.74, 0.72, 0.68], concAlt: [0.66, 0.64, 0.60] });

      // ---- Turn 1 hill — the real natural grass amphitheatre ----
      // The bleachers above are the built, temporary stands; behind and above
      // them the actual hill is informal grass-bank viewing, which is what
      // makes T1 famous. Set further back (gap 58) than the bleachers so it
      // reads as the hillside rising behind the built seating.
      spectatorHill(0.088, 0.118, -1, 58, { rows: 5, rise: 1.3, depth: 2.2, density: 0.55, grass: dryGrass });

      // ---- Austin360 Amphitheater + Observation Tower (T16–18, s≈0.76–0.80, R) ----
      // Real COTA: 251 ft Miró Rivera tower sits ON the amphitheater — pale shaft
      // with a cascading red tube veil that forms the stage canopy. Not at Turn 1.
      amphiStage(0.76, 1, 68);

      // Observation Tower — pale shaft + red tube veil (no rainbow rings)
      {
        const kt = K(0.78);
        const at = anchor(kt, 1, 82), tb = [at.r, at.u, at.t];
        const towerCenter = vadd(vadd(at.c, at.r, 12), at.u, 43);
        modelGroup("cota-observation-tower", {
          center: towerCenter, size: [58, 90, 42], basis: tb,
        }, (stage) => {
          const tBase = at.c;
          const pale = [0.86, 0.87, 0.90];
          const pale2 = [0.80, 0.81, 0.85];
          const deckH = 70;
          // pale elevator shaft in 3 tapered stages
          stage._mat = MAT.METAL;
          addFrustum(stage, tBase,                 4.6, 3.8, 28, pale,  8, tb);
          addFrustum(stage, vadd(tBase, at.u, 28), 3.8, 3.2, 28, pale2, 8, tb);
          addFrustum(stage, vadd(tBase, at.u, 56), 3.2, 2.6, 14, pale,  8, tb);
          // observation deck — pale ring + floor (red is reserved for the veil)
          const deckCen = vadd(tBase, at.u, deckH);
          addCyl(stage, deckCen, 7.8, 2.2, pale2, 10, tb);
          addBox(stage, vadd(tBase, at.u, deckH + 1.1), [13, 1.4, 13], white, tb);
          addCyl(stage, vadd(tBase, at.u, deckH + 2.6), 6.4, 1.6, [0.74, 0.76, 0.82], 8, tb);
          // Crown sized to the REAL tower: COTA publishes 251 ft (76.5 m) at
          // its highest point, with the observation deck 22 storeys up. The
          // deck sits at 70 m, which is right — but the crown then carried an
          // 8 m mast and a beacon at deckH+16, topping out around 86 m, i.e.
          // ~12% over the one dimension the venue actually states. Cone and
          // finial now land the tip at deckH + 6.5 = 76.5 m exactly.
          addCone(stage, vadd(tBase, at.u, deckH + 4.2), 3.8, 2.0, [0.68, 0.69, 0.74], 8, tb);
          addCyl(stage, vadd(tBase, at.u, deckH + 6.0), 0.24, 0.5, pale2, 5, tb);
          addBox(stage, vadd(tBase, at.u, deckH + 6.4), [0.5, 0.5, 0.5], [1.0, 0.82, 0.25], tb);
          stage._mat = 0;
          // red tube veil — ~14 thin tubes on the amphitheater face, full height
          stage._mat = MAT.METAL;
          for (let i = 0; i < 14; i++) {
            const tOff = (i - 6.5) * 0.85;
            const rOff = 3.2 + Math.abs(tOff) * 0.08;
            addCyl(stage, vadd(vadd(tBase, at.r, rOff), at.t, tOff),
                   0.20, deckH - 2, redSteel, 5, tb);
          }
          // Upper fan ribs widen beneath the deck, strengthening the tower's
          // unmistakable red-veil silhouette from the T16–18 sweepers.
          for (let i = 0; i < 9; i++) {
            const tOff = (i - 4) * 2.45;
            addBox(stage,
              vadd(vadd(vadd(tBase, at.r, 6.8 + Math.abs(i - 4) * 0.65),
                         at.u, deckH - 5.5), at.t, tOff),
              [9.5 + Math.abs(i - 4) * 1.3, 0.32, 0.34], redSteel, tb);
          }
          // cascading canopy flare — tubes spill outward/down over the stage
          for (let i = 0; i < 11; i++) {
            const tOff = (i - 5) * 3.2;
            const flare = 10 + i * 0.35;
            const y = 18 - Math.abs(i - 5) * 0.8;
            addBox(stage,
              vadd(vadd(vadd(tBase, at.r, flare), at.u, y), at.t, tOff),
              [14 + Math.abs(i - 5) * 1.2, 0.32, 0.38], redSteel, tb);
          }
          // lower veil ribs tying shaft to stage canopy
          for (let i = 0; i < 7; i++) {
            const tOff = (i - 3) * 4.0;
            addBox(stage,
              vadd(vadd(vadd(tBase, at.r, 18), at.u, 8), at.t, tOff),
              [22, 0.28, 0.32], redSteel, tb);
          }
          stage._mat = 0;
          // base plant room
          const plant = anchor(kt, 1, 73);
          addBox(stage, vadd(plant.c, plant.u, 2.2), [14, 6, 16], [0.84, 0.84, 0.86], [plant.r, plant.u, plant.t]);
          // deck glass strip
          stage._mat = MAT.GLASS;
          addBox(stage, vadd(tBase, at.u, deckH + 0.5), [14.2, 0.7, 14.2], litWin, tb);
          stage._mat = 0;
        }, { required: true });
      }

      // ---- Grand Plaza reflecting pool, beneath the Observation Tower ----
      // The tower (s≈0.78, R, base ~90 m out) stood over bare ground — the
      // real Grand Plaza is a paved concourse with a dark reflecting pool at
      // its centre. Pale concrete apron first (closer to the track, wider
      // footprint so it reads as the plaza floor), then the pool sitting
      // within it, further out toward the tower.
      groundPatch(K(0.775), 1, 14, [40, 0.14, 34], [0.72, 0.71, 0.68],
                  { id: "cota-plaza-apron", samples: 8 });
      waterSurface(K(0.775), 1, 32, [22, 0.3, 12], [0.06, 0.22, 0.24],
                   { id: "cota-plaza-pool" });

      // ---- 2026 dress pass: amphitheatre lawn bowl (s≈0.73–0.80, R) ----
      // Three low, raked earth terraces frame the stage/tower campus. They stay
      // below eye level near the circuit and rise only toward the concert lawn.
      for (const [sf, dist, width, rise, len] of [
        [0.735, 44, 24, 4.0, 54],
        [0.758, 50, 28, 5.0, 62],
        [0.798, 48, 26, 4.5, 56],
      ]) {
        const aa = anchor(K(sf), 1, dist);
        addPrism(out, vadd(aa.c, aa.u, rise * 0.35),
                 [width, rise, len], dryGrass, [aa.t, aa.u, aa.r]);
      }

      // ---- 2026 dress pass: packed hill spectators at COTA's braking heroes ----
      // Compact banks, well behind the existing barriers. Two braking zones,
      // two different structures: T1's outside is more of the same bolted
      // aluminium as the hill above it, while the T12 hairpin gets rented
      // tube-and-plank scaffolding — the stand that goes up for race week and
      // comes down after, benches instead of moulded seats and the standards
      // visible right through it.
      bleacher(...span(0.112, 54), 1, 48,
        Object.assign({}, t1Rake, { rows: 5, step: 10, density: 0.55 }));
      scaffoldStand(...span(0.642, 72), 1, 40,
        { rows: 5, rise: 1.3, setback: 2.0, step: 9, legEvery: 2,
          crowd: crowdCols, density: 0.55, bench: [white, cotaBlue, redSteel] });

      // ---- 2026 dress pass: Texas red/white/blue event ribbons at T12 ----
      // Sparse sponsor-scale boards color the braking-zone bowl without forming
      // a continuous wall or obscuring apex and distance-marker sightlines.
      billboard(K(0.615), 1, 32, 13, 4.2, redSteel);
      billboard(K(0.628), 1, 34, 13, 4.2, white);
      billboard(K(0.641), 1, 32, 13, 4.2, cotaBlue);

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

      // ---- Fan campground: RV/tailgating fields (s≈0.285–0.395, L) ----
      // s≈0.28–0.42 is the deadest stretch of the lap — no stands, no
      // billboards, just sparse trees and distant hills — and it's exactly
      // where COTA's real tailgating and RV camping fields sit on the Hill
      // Country side of the Esses/mid-lap section. A loose grid of small
      // gable tents and boxy RVs in varied hues sells the tailgate
      // atmosphere cheaply: each unit is one addPrism or addBox call, so
      // every unit self-guards its own footprint via the engine's
      // per-primitive rejBox test — no separate composite guard needed.
      {
        const tentCols = [
          [0.78, 0.22, 0.20], [0.20, 0.42, 0.70], [0.86, 0.78, 0.24],
          [0.30, 0.62, 0.34], [0.70, 0.42, 0.16], [0.46, 0.28, 0.60],
          [0.20, 0.58, 0.58], [0.82, 0.50, 0.62],
        ];
        const rvCols = [[0.90, 0.90, 0.88], [0.94, 0.92, 0.84], [0.86, 0.88, 0.90]];
        let camp = 0;
        along(0.285, 0.395, 15, (k) => {
          for (let row = 0; row < 3; row++) {
            const rowDist = 24 + row * 12;
            const jit = (hash(k * 5 + row * 11) - 0.5) * 5;
            const a = anchor(k, -1, rowDist + jit);
            const bv = [a.r, a.u, a.t];
            const h1 = hash(k * 7 + row * 3);
            if (row === 2 && h1 > 0.4) {
              // RV box, parked lengthwise along the field
              const col = rvCols[Math.floor(hash(k * 13 + row) * rvCols.length) % rvCols.length];
              addBox(out, vadd(a.c, a.u, 1.5), [2.5, 3.0, 8.0], col, bv);
            } else {
              // small gable tent — alternate ridge orientation for variety
              const swap = hash(k * 17 + row * 9) > 0.5;
              const basis = swap ? [a.t, a.u, a.r] : bv;
              const w = 2.6 + hash(k * 19 + row) * 0.8;
              const len_ = 1.8 + hash(k * 23 + row) * 0.7;
              addPrism(out, a.c, [w, 1.7 + hash(k * 29 + row) * 0.5, len_],
                       tentCols[(k + row * 5 + camp) % tentCols.length], basis);
            }
            camp++;
          }
        });
      }

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

      // ================== TEXAS SPECIES — the two trees that are NOT pines ======
      // Every tree at this circuit came out of forestEdge()'s pine/broadleaf
      // mix, which is a temperate-European canopy wearing a muted green. The
      // Hill Country reads the way it does because of two specific silhouettes
      // that mix cannot produce, and both just landed in the shared library.

      // Mesquite: a bare trunk forking low into one wide, flat, near-horizontal
      // crown, scattered so thin you see between every one of them. acacia() is
      // that form (same subfamily, same umbrella). This is deliberately placed
      // through s≈0.28–0.42 — the stretch this file's own campground comment
      // calls "the deadest stretch of the lap" — because open ground with a
      // dozen flat-topped trees on it IS the landscape, not a lack of one.
      const MESQUITE = [0.34, 0.40, 0.22], MESQ_D = [0.28, 0.34, 0.19];
      for (let i = 0; i < 16; i++) {
        const sf = 0.275 + i * 0.0095;
        const k = K(sf), h1 = hash(k * 37 + i * 5);
        const side = h1 < 0.45 ? 1 : -1;
        // Asymmetric on purpose, and measured rather than guessed. COTA folds
        // back on itself through here: anything past ~50 m to the LEFT lands on
        // the other leg of the lap and the on-track guard drops it outright
        // (six of these were dropped silently before this was probed). So the
        // left-side mesquite sits INSIDE the RV field's first row instead of
        // behind it — which is what a tailgate field looks like anyway, tents
        // pitched around the trees that were already there. The right side is
        // open ground and takes the deeper scatter.
        const dist = (side < 0 ? 15 : 28) + h1 * (side < 0 ? 6 : 24);
        const th = 5.5 + h1 * 3;
        acacia(k, side, dist, th, h1 < 0.5 ? MESQUITE : MESQ_D,
               { spread: th * (1.15 + h1 * 0.4), layers: h1 > 0.6 ? 2 : 1 });
      }

      // Live oak: broad, low, and cut back to a disc — a stacked-cylinder crown,
      // which is what plane() builds and what no cone-stack species can. Real
      // COTA plants them along the Grand Plaza concourse under the tower, so
      // that is the only place they go; scattering them round the lap would
      // undo the open sky the rest of this file works to keep.
      const LIVE_OAK = [0.26, 0.35, 0.20];
      for (let i = 0; i < 7; i++) {
        const sf = 0.752 + i * 0.008;
        const k = K(sf), h1 = hash(k * 29 + i * 11);
        plane(k, 1, 20 + (i % 2) * 7, 8 + h1 * 3.5, LIVE_OAK,
              { stages: h1 > 0.55 ? 2 : 1, spread: 0.85 + h1 * 0.3 });
      }

      // ---- COTA gantries: intentional overheads with validated clearance and feet ----
      const cotaGantry = (s, id, clearance) => {
        const k = K(s), supportGap = 4.5, supportWidth = 0.8, thick = 0.9;
        const ok = overheadSpan({
          id, frac: s, clearance, thickness: thick, depth: 1.4,
          supportGap, supportWidth,
          span: hw[k] * 2 + supportGap * 2 + supportWidth * 2,
          color: darkSteel, required: true,
        });
        if (!ok) return;
        for (const side of [-1, 1]) {
          const a = anchor(k, side, supportGap + supportWidth / 2);
          const mastH = clearance + thick;
          modelGroup(`${id}-support-${side < 0 ? "left" : "right"}`, {
            center: vadd(a.c, a.u, mastH / 2),
            size: [supportWidth, mastH, 1.4],
            basis: [a.r, a.u, a.t],
          }, (stage) => {
            stage._mat = MAT.METAL;
            addCyl(stage, a.c, supportWidth / 2, mastH, darkSteel, 6, [a.r, a.u, a.t]);
          }, { required: true });
        }
      };
      cotaGantry(0.00, "cota-start-gantry", 7.5);
      cotaGantry(0.50, "cota-drs-gantry", 7.0);

      // Ground-conforming runoff at COTA's two defining braking zones.
      groundPatch(K(0.108), 1, 1.2, [18, 0.16, 76], redSoil,
                  { id: "cota-t1-runoff", samples: 6 });
      groundPatch(K(0.63), 1, 1.2, [24, 0.16, 96], [0.48, 0.49, 0.51],
                  { id: "cota-t12-runoff", samples: 8 });

      // ---- Catch fences behind the kerbs ----
      fence(0.00, 0.06,  1, 5, 3.4, [0.62, 0.64, 0.68]);   // main straight, R
      fence(0.94, 1.00,  1, 5, 3.4, [0.62, 0.64, 0.68]);   // final corner, R
      fence(0.46, 0.62, -1, 6, 3.4, [0.62, 0.64, 0.68]);   // back straight, L
      fence(0.08, 0.14, -1, 8, 3.4, [0.62, 0.64, 0.68]);   // T1 hill, L
      wall(0.94, 0.06, -1, 2.2, 1.1, [0.72, 0.73, 0.76], 0.35); // pit wall

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

      // ---- Broadcast camera towers at scenic vantage points ----
      // Shared cameraTower() (lattice mast + railed platform + camera head on
      // a boom) replaces the old single-pole-and-box hand-roll; it self-guards
      // its full footprint via rejBox.
      [[0.10, -1, 22], [0.50, 1, 24], [0.84, -1, 24]].forEach(([s, side, d]) => {
        cameraTower(K(s), side, d, { h: 15, col: darkSteel });
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
