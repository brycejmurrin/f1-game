/* Apex 26 — MONZA circuit definition (data only).
   Registered on the global TrackDefs list; consumed by the js/tracks.js engine
   (palette resolved there from `night`, geometry from js/circuits.js or `segs`). */
(function () {
  "use strict";
  (window.TrackDefs = window.TrackDefs || []).push(
  {
    id: "monza",
    reverse: false, // direction switched to real-world CW/CCW (was auto-audit reverse:true)
    startFrac: 0.0125, // GPS-derived (OpenF1 2025, conf=0.316)
    name: "MONZA",
    gp: "Italian GP",
    country: "Italy",
    night: false,
    theme: "green",
    lengthKm: 5.8,
    // Bespoke landmarks below are authored against the racing lap used by the
    // Monza brief (0 = start/finish), not the unrotated source trace.
    sceneryCoordinates: "racing",
    // Keep the royal-park terrain under the deep forest ranks and hero models.
    terrainOuter: 120,
    dressingExclusions: [
      { kind: "foliage", s0: 0.93, s1: 0.07 },          // pits / Tribuna Centrale
      { kinds: ["foliage", "lamps"], s0: 0.20, s1: 0.27, side: -1 }, // west lake
      { kinds: ["foliage", "lamps"], s0: 0.37, s1: 0.43, side: 1 },  // Villa lake
      { kind: "foliage", s0: 0.49, s1: 0.59, side: -1 }, // banking ruin sightline
      { kind: "foliage", s0: 0.69, s1: 0.77 },           // flyover approaches
    ],
    sunAzimBias: 0.16,   // royal-park afternoon: western sun raking through the trees onto the Curva Grande
    baseHW: 8,
    // Monza hand-builds its own pit complex below (Tribuna Centrale, facing
    // stand, garages, tensile canopy, podium tower) — the engine's generic
    // 7-box pit/grandstand fallback in js/track/tracks.js is unconditional and
    // was landing directly on top of it. Opt out; nothing else in this file
    // depends on the fallback.
    ownPitStraight: true,
    pal: {
      zenith:        [0.20, 0.40, 0.70],
      horizon:       [0.76, 0.68, 0.52],
      sun:           [1.0,  0.92, 0.66],
      sunColor:      [1.0,  0.88, 0.58],
      ambientSky:    [0.46, 0.50, 0.56],
      ambientGround: [0.24, 0.23, 0.17],
      fogColor:      [0.68, 0.64, 0.54],
      grass:         [0.20, 0.44, 0.18],
      sunDir:        [0.5, 0.55, 0.3],
    },
    segs: [
      { t: 0, l: 560 }, { t: 70, l: 55 }, { t: -75, l: 60 }, { t: 80, l: 220 }, { t: 0, l: 200 }, { t: -60, l: 55 },
      { t: 70, l: 70 }, { t: 75, l: 130 }, { t: 60, l: 120 }, { t: 0, l: 260 }, { t: -50, l: 55 }, { t: 65, l: 70 },
      { t: 0, l: 360 }, { t: 150, l: 220 },
    ],
    // Source-trace coordinates: a shallow Roggia dip and modest Lesmo crest.
    // startFrac=0.0125 maps these to racing s≈0.30 and s≈0.48.
    elevations: [
      { s: 0.3125, halfM: 220, rise: -1.5 },
      { s: 0.4925, halfM: 340, rise: 4.5 },
    ],
    // Monza is a wide, fast park circuit but the three chicanes are deliberately
    // pinched — the Rettifilo most of all. hwZones can only narrow, so the 16 m
    // base stays the straights, Curva Grande and the Parabolica.
    // s0/s1 are CONTROL-POINT index fractions in SOURCE space; the racing-lap arc
    // each lands on is in the trailing comment.
    hwZones: [
      { s0: 0.0155, s1: 0.0949, hw: 6.8, ease: 0.012 },  // arc 0.003-0.024 Rettifilo
      { s0: 0.2821, s1: 0.3460, hw: 7.0, ease: 0.012 },  // arc 0.212-0.234 Roggia
      { s0: 0.5960, s1: 0.7315, hw: 7.2, ease: 0.012 },  // arc 0.524-0.572 Ascari
    ],
    // Monza camber. The Parabolica (Curva Alboreto) and both Lesmos are the
    // properly cambered corners — they are what let the whole corner be taken at
    // one steady, very high speed; Curva Grande and Ascari carry less.
    bankZones: [
      { frac: 0.0769, angleDeg: 3.0, widthM: 240 },   // Curva Grande
      { frac: 0.2964, angleDeg: 6.0, widthM: 140 },   // Lesmo 1
      { frac: 0.3456, angleDeg: 6.0, widthM: 80 },    // Lesmo 2
      { frac: 0.5443, angleDeg: 3.5, widthM: 110 },   // Ascari
      // Parabolica is capped at 4°: above that the dropped inner edge slides out
      // from under the apex kerb/apron props and the ground-over-road probe
      // starts reporting the verge sitting over the tarmac.
      { frac: 0.7355, angleDeg: 4.0, widthM: 300 },   // Parabolica
    ],
    scenery: function (api) {
      const { out, MAT, n, ds, pyMin, place, prop, backdrop, groundYAt, every,
        onTrack, hash, pine, tree, bush, hedge, ridge, forestEdge, building, motorhome, tower,
        cypress, stonePine, tieredBowl,
        grandstandEx, spectatorHill, broadcastCompound, billboard, gantry, marshalPost,
        wall, fence, guardrail, tyreWall,
        addBox, addCyl, addPrism, anchor, along, vadd,
        modelGroup, overheadSpan, waterSurface, waterBand, groundPatch, groundedSegments,
        px, pz } = api;
      const K = (s) => Math.round(s * n) % n;

      // Royal-park greens — warm Italian afternoon palette.
      const PINE_D = [0.08, 0.26, 0.12], PINE = [0.10, 0.30, 0.14], PINE_L = [0.13, 0.34, 0.17];
      const LEAF = [0.18, 0.45, 0.20], LEAF_L = [0.24, 0.50, 0.24], LEAF_D = [0.15, 0.38, 0.18];
      const GRAVEL = [0.68, 0.60, 0.42];

      // =====================================================================
      // 1. ROYAL PARK FOREST — broadleaf + umbrella-pine corridor.
      //    every() node-step approach keeps geometry within SwiftShader budget.
      //    Ranks A-D provide depth; Lesmo section adds extra close-canopy trees.
      // =====================================================================
      // The two ornamental lakes (s≈0.20-0.28, s≈0.36-0.42) and the Villa Reale
      // grounds (s≈0.58-0.66) are manicured formal parkland in real photos —
      // open lawns and specimen trees, not wild canopy. Deliberately excludes
      // Lesmo (0.43-0.54): those woods stay dense, they're a separate identity.
      const openParkland = (s) =>
        (s >= 0.19 && s <= 0.28) || (s >= 0.36 && s <= 0.42) || (s >= 0.58 && s <= 0.66);
      // Rank A — the umbrella pines themselves. Monza's near-verge signature is
      // the pino domestico: a long bare trunk under a flat parasol crown, which
      // is exactly why a 20 m tree can stand 10 m off the road here without
      // closing the sightline. pine()'s stacked conifer tiers — a spruce — were
      // the wrong species for the one tree every photograph of this circuit is
      // framed through, and they were also what made this rank read the same as
      // Spa's and Suzuka's. The deep ranks C/D below stay pine(): the far wall
      // of the park IS mixed conifer, and it wants the darker, taller mass.
      every(24, (k) => {
        const h = hash(k * 31);
        const thin = openParkland(k / n);
        if (h < (thin ? 0.78 : 0.08)) return;
        const side = h < 0.5 ? -1 : 1;
        stonePine(k, side, 10 + h * 6, 15 + h * 6, h < 0.3 ? PINE_D : PINE,
                  { spread: 0.68 + h * 0.14, lean: 0.3 });
        if (!thin && h > 0.25)
          stonePine(k, -side, 11 + h * 7, 14 + h * 6, PINE, { spread: 0.70, lean: 0.25 });
      });
      // Rank B — broadleaf trees interleaved with pines (oaks, maples, ashes).
      every(28, (k) => {
        const h = hash(k * 53 + 9);
        const thin = openParkland(k / n);
        if (h < (thin ? 0.80 : 0.15)) return;
        const side = h < 0.5 ? -1 : 1;
        tree(k, side, 12 + h * 8, 11 + h * 8, h < 0.4 ? LEAF_D : LEAF);
        if (!thin && h > 0.48) tree(k, -side, 13 + h * 9, 10 + h * 7, LEAF_L);
      });
      // Rank C — set-back taller pines (deep-park wall).
      every(36, (k) => {
        const h = hash(k * 41 + 3);
        const thin = openParkland(k / n);
        if (h < (thin ? 0.82 : 0.20)) return;
        const side = h < 0.5 ? -1 : 1;
        const hVar = 22 + h * 16 + (hash(k * 137) > 0.6 ? 4 : 0);
        pine(k, side, 24 + h * 18, hVar, PINE_D);
        if (!thin && h > 0.55) pine(k, -side, 30 + h * 16, 24 + h * 14, PINE_D);
      });
      // Rank D — outermost broadleaf rank blending to backdrop.
      every(55, (k) => {
        const h = hash(k * 67 + 17);
        const thin = openParkland(k / n);
        if (h < (thin ? 0.85 : 0.35)) return;
        tree(k, h < 0.5 ? -1 : 1, 42 + h * 30, 13 + h * 10, LEAF_D);
        if (!thin && h > 0.7) tree(k, h > 0.85 ? -1 : 1, 55 + h * 22, 11 + h * 8, LEAF);
      });
      // Low underbrush / shrubs along the verge for ground texture.
      every(24, (k) => {
        const h = hash(k * 97 + 23);
        if (h < 0.50) return;
        bush(k, h < 0.77 ? -1 : 1, 6.5 + h * 4,
             h < 0.66 ? [0.16, 0.36, 0.16] : [0.20, 0.42, 0.18]);
        if (h > 0.82) bush(k, h > 0.91 ? -1 : 1, 5 + h * 3, [0.18, 0.40, 0.17]);
      });
      // Clipped park hedge banding through several sweeps for a manicured edge.
      hedge(0.06, 0.18, -1, 20, 6, [0.12, 0.33, 0.16]);
      hedge(0.06, 0.18,  1, 21, 6, [0.12, 0.33, 0.16]);
      hedge(0.32, 0.46, -1, 22, 5, [0.13, 0.34, 0.17]);
      hedge(0.66, 0.78,  1, 22, 5, [0.13, 0.34, 0.17]);
      hedge(0.82, 0.94, -1, 24, 5, [0.12, 0.33, 0.16]);
      // Manicured lawn edges around the two lakes and the Villa Reale grounds
      // (the openParkland arc above): clipped hedge instead of thinned forest,
      // matching the formal-garden look real photos show there.
      hedge(0.19, 0.28, -1, 18, 4.5, [0.13, 0.35, 0.17]);   // west park lake
      hedge(0.36, 0.42,  1, 22, 4.5, [0.13, 0.35, 0.17]);   // Villa lake
      hedge(0.58, 0.66,  1, 24, 4.5, [0.13, 0.35, 0.17]);   // Villa Reale approach
      // Lesmo 1 & 2 (s≈0.43–0.54) — famous woodland curves: extra pines to
      // reinforce the canopy through these fast sweeps. A dedicated ~14 m rank
      // keeps the corridor dense without duplicating the four full-lap layers.
      every(14, (k) => {
        const s = k / n;
        if (s < 0.43 || s > 0.54) return;
        const h = hash(k * 13 + 7);
        pine(k, -1, 12 + h * 2, 14 + h * 10, PINE_D);
        pine(k,  1, 11 + h * 2, 13 + h *  9, PINE);
        if (h > 0.55) tree(k, -1, 16 + h * 3, 13 + h * 9, LEAF_D);
        if (h > 0.70) tree(k,  1, 15 + h * 3, 12 + h * 8, LEAF);
      });

      // =====================================================================
      // 2. PIT STRAIGHT / START–FINISH — grandstands, tifosi, podium, pit boxes
      //    Tribuna Centrale (main historic stand), facing stand, new modernized
      //    pit building with permanent roof, modernized grandstand islands.
      // =====================================================================
      // Tribuna Centrale — long stepped main grandstand (pit-side, left).
      // Historic stand built to seat 3000, now modernized with island design.
      // grandstandEx + STAND_SETS.monza ("crimson","concrete","steel") replaces
      // the flat 6-arg call so the three pit-straight stands read as distinct
      // structures instead of the same grey box repeated three times.
      grandstandEx(0.005, -1, 10, 160, null, null,
        { livery: "crimson", tiers: 2, roof: "cantilever", suites: true, endWalls: true, pylons: true });
      // Secondary lower stand behind Centrale (historic structure).
      grandstandEx(0.955, -1, 10, 110, null, null, { livery: "concrete", endWalls: true });
      // Facing grandstand across the straight (right side) — modernized.
      grandstandEx(0.02, 1, 12, 120, null, null, { livery: "steel", endWalls: true });
      // Red trim band fronting the main stand (Italian colors).
      prop(K(0.01), -1, 8, [2, 1.6, 130], [0.80, 0.16, 0.14]);
      // Accent green band (park integration) below red trim.
      prop(K(0.00), -1, 8.3, [1.8, 0.8, 128], [0.30, 0.54, 0.28]);

      // ── Lit window strips on the main grandstand back-shell (night-ready) ──
      // These bright amber bands read as interior lighting at dusk/night while
      // remaining plausible sun-lit glazing by day.
      {
        const winLit = [0.98, 0.88, 0.52];  // warm amber glow
        const gsA = anchor(K(0.005), -1, 17.5);
        // Upper window band
        addBox(out, vadd(gsA.c, gsA.u, 10.5), [0.22, 1.6, 158], winLit, [gsA.r, gsA.u, gsA.t]);
        // Lower window band
        addBox(out, vadd(gsA.c, gsA.u, 5.5),  [0.22, 1.2, 158], winLit, [gsA.r, gsA.u, gsA.t]);

        const gsB = anchor(K(0.955), -1, 17.5);
        addBox(out, vadd(gsB.c, gsB.u, 10.0), [0.22, 1.4, 108], winLit, [gsB.r, gsB.u, gsB.t]);

        const gsC = anchor(K(0.02), 1, 19.5);
        addBox(out, vadd(gsC.c, gsC.u, 9.5), [0.22, 1.4, 118], winLit, [gsC.r, gsC.u, gsC.t]);
      }

      // Pit building / garages along the pit wall (right side).
      // Modernized pit complex: refurbished garages with improved facilities.
      const pitWall = [0.86, 0.86, 0.84];
      for (let i = 0; i < 8; i++) {
        const s = 0.965 + i * 0.0085;
        building(K(s), 1, 14, 16, 9, 11,
          { wall: pitWall, window: [0.30, 0.34, 0.40], floor: 4.5, roof: true });
      }
      // New permanent tensile roofing structure over the pit building.
      // Atomic hero group: preflight the complete 72 m footprint before emitting
      // any roof geometry, so a foldback can never leave a partial canopy.
      {
        const aPit = anchor(K(0.99), 1, 18);
        const canopyCenter = vadd(aPit.c, aPit.u, 10.7);
        modelGroup("monza-pit-canopy", {
          center: canopyCenter,
          size: [5.4, 1.3, 72],
          basis: [aPit.r, aPit.u, aPit.t],
        }, (stage) => {
          addBox(stage, vadd(aPit.c, aPit.u, 11), [5.2, 0.8, 72],
            [0.86, 0.84, 0.80], [aPit.r, aPit.u, aPit.t]);
          addBox(stage, vadd(aPit.c, aPit.u, 10.2), [4.8, 0.25, 70],
            [0.96, 0.88, 0.56], [aPit.r, aPit.u, aPit.t]);
        }, { required: true });

        // Terrain-anchored columns remain wholly behind the pit building.
        for (let j = 0; j < 4; j++) {
          const s2 = 0.965 + j * 0.025;
          const a2 = anchor(K(s2), 1, 16);
          addCyl(out, a2.c, 0.35, 9, [0.72, 0.70, 0.68], 8, null);
        }
      }
      // Podium / timing tower at the line — iconic white tower with red cap.
      // Historic 1922 structure, recently modernized. Tall mast for timing/announcements.
      tower(K(0.0), 1, 13, 6, 46, { col: [0.92, 0.92, 0.90], cap: true, capCol: [0.78, 0.14, 0.12], mast: 8 });
      // Podium base platform (marble-look step for award ceremony).
      {
        const aPod = anchor(K(0.0), 1, 11);
        addBox(out, vadd(aPod.c, aPod.u, 1), [14, 0.8, 12], [0.88, 0.88, 0.90], [aPod.r, aPod.u, aPod.t]);
      }
      // Start gantry spanning the straight.
      gantry(0.0, 9, [0.14, 0.14, 0.17]);
      gantry(0.98, 8.5, [0.14, 0.14, 0.17]);

      // Pit-straight furniture: armco both sides, debris fence behind left stand.
      guardrail(0.93, 0.07, 1, 3.5, [0.85, 0.85, 0.88]);
      fence(0.95, 0.06, -1, 8, 4, [0.74, 0.76, 0.80]);
      // Sponsor billboards lining the main straight.
      for (const s of [0.94, 0.97, 0.015, 0.04]) billboard(K(s), -1, 7, 11, 4.5, [0.92, 0.88, 0.30]);
      for (const s of [0.95, 0.03]) billboard(K(s), 1, 26, 12, 5, [0.88, 0.84, 0.80]);

      // ── Lamp posts along the pit straight — night-ready / day-plausible ──
      // Placed on both sides of the straight (s=0.93..0.07). Slender dark poles
      // with a bright warm lamp head that reads as a luminaire day or night.
      along(0.93, 0.07, 28, (k) => {
        for (const side of [-1, 1]) {
          const gap = side < 0 ? 6 : 5;   // left slightly further (stand side)
          const ap = anchor(k, side, gap);
          // Pole — slender dark steel column, 10 m tall
          addCyl(out, ap.c, 0.12, 10, [0.18, 0.18, 0.20], 6, [ap.r, ap.u, ap.t]);
          // Horizontal arm stub
          addBox(out, vadd(ap.c, ap.u, 9.8), [side < 0 ? 1.8 : 1.8, 0.18, 0.18],
                 [0.18, 0.18, 0.20], [ap.r, ap.u, ap.t]);
          // Lamp head — warm white, slightly yellow-tinted
          addBox(out, vadd(vadd(ap.c, ap.r, side * 0.9), ap.u, 9.65),
                 [1.0, 0.45, 0.55], [0.98, 0.94, 0.72], [ap.r, ap.u, ap.t]);
        }
      });

      // =====================================================================
      // 3. CHICANES & PARABOLICA — gravel traps, kerb trim, tyre walls, stands
      // =====================================================================
      // Variante del Rettifilo (s~0.04) — heavy braking, big gravel, tyre wall.
      groundPatch(K(0.04), 1, 5, [24, 0.18, 34], GRAVEL,
        { id: "monza-rettifilo-gravel", samples: 6 });
      tyreWall(0.03, 0.055, 1, 4, [0.88, 0.20, 0.18]);
      // Rettifilo's permanent stand faces the heaviest braking zone on the lap:
      // an exposed steel truss roof over a single deep rake, closed at both ends.
      grandstandEx(0.05, -1, 12, 76, null, null,
        { livery: "crimson", roof: "truss", endWalls: true, pylons: true, h: 11 });
      marshalPost(K(0.045), 1, 10);

      // Variante della Roggia (s~0.30) — shaded chicane, gravel both sides, fog detail.
      groundPatch(K(0.30), -1, 6, [22, 0.18, 28], GRAVEL,
        { id: "monza-roggia-gravel-left", samples: 6 });
      groundPatch(K(0.305), 1, 5, [20, 0.18, 26], GRAVEL,
        { id: "monza-roggia-gravel-right", samples: 6 });
      tyreWall(0.29, 0.315, -1, 4, [0.20, 0.40, 0.85]);
      // Keep the stand compact and set back: crowdBank uses intentionally cheap
      // raw spectators, so its full footprint must stay clear of the chicane arc.
      // Roggia's stand is the oldest survivor on the lap — a squat poured-concrete
      // block with a flat slab cap, deliberately shorter than everything else so
      // the chicane keeps its shaded, enclosed feel.
      grandstandEx(0.30, 1, 20, 52, null, null,
        { livery: "concrete", roof: "flat", endWalls: true, h: 8 });
      // Thin drifting fog boxes under tree shade (Roggia's signature element).
      const fogCol = [0.76, 0.74, 0.68];   // warm tan-grey fog
      for (let i = 0; i < 3; i++) {
        const sf = 0.28 + i * 0.025;
        const kf = K(sf);
        const af = anchor(kf, hash(kf) < 0.5 ? -1 : 1, 25 + hash(kf * 3) * 15);
        addBox(out, vadd(af.c, af.u, 2.5), [14, 2.4, 22], fogCol, [af.r, af.u, af.t]);
      }
      marshalPost(K(0.31), -1, 9);
      // The Roggia — the irrigation ditch the chicane takes its name from. A
      // narrow murky-water strip parallel to the track past the gravel trap
      // and marshal post (not a lake): gap0/gap1 pinned close together for a
      // ditch-width band rather than a wide basin.
      waterBand(0.283, 0.317, -1, 32, 36, 4, [0.30, 0.35, 0.23], { id: "monza-roggia-ditch", required: true });

      // Lesmo 1 & 2 (s~0.45–0.52) — tight woodland curves, gravel + tyre.
      groundPatch(K(0.46), 1, 5, [18, 0.18, 26], GRAVEL,
        { id: "monza-lesmo-one-gravel", samples: 5 });
      groundPatch(K(0.51), 1, 5, [18, 0.18, 24], GRAVEL,
        { id: "monza-lesmo-two-gravel", samples: 5 });
      tyreWall(0.45, 0.47, 1, 4, [0.85, 0.78, 0.20]);
      marshalPost(K(0.48), 1, 9);

      // Variante Ascari (s~0.78) — triple chicane, gravel run-offs, grandstand.
      groundPatch(K(0.78), -1, 6, [28, 0.18, 40], GRAVEL,
        { id: "monza-ascari-gravel-left", samples: 7 });
      groundPatch(K(0.795), 1, 6, [24, 0.18, 32], GRAVEL,
        { id: "monza-ascari-gravel-right", samples: 6 });
      tyreWall(0.77, 0.80, -1, 4, [0.88, 0.20, 0.18]);
      // Ascari's stand is the modern one: two rakes under an open lattice roof on
      // trackside pylons, so it reads tall and light against the woodland behind.
      grandstandEx(0.78, -1, 14, 80, null, null,
        { livery: "steel", tiers: 2, roof: "truss", pylons: true, endWalls: true, h: 12 });
      marshalPost(K(0.785), 1, 9);

      // Parabolica / Curva Alboreto (s~0.88–0.93) — wide outer gravel, big arc stand.
      groundPatch(K(0.90), -1, 8, [50, 0.18, 110], GRAVEL,
        { id: "monza-parabolica-gravel", samples: 10 });
      grandstandEx(0.905, 1, 14, 96, null, null,
        { livery: "crimson", tiers: 2, roof: "cantilever", suites: true, endWalls: true });
      tyreWall(0.885, 0.92, -1, 6, [0.88, 0.20, 0.18]);
      marshalPost(K(0.91), 1, 11);
      // Sponsor hoardings around the Parabolica outside.
      for (const s of [0.87, 0.89, 0.91]) billboard(K(s), -1, 12, 13, 5, [0.90, 0.86, 0.30]);

      // Catch fences behind the major spectator zones.
      fence(0.03, 0.06, 1, 7, 4, [0.74, 0.76, 0.80]);
      fence(0.295, 0.32, 1, 8, 4, [0.74, 0.76, 0.80]);
      fence(0.77, 0.80, -1, 9, 4, [0.74, 0.76, 0.80]);
      fence(0.89, 0.93, 1, 9, 4, [0.74, 0.76, 0.80]);

      // Royal-park armco is the visible solid boundary between major runoff
      // zones. The shared helper grounds every segment and registers matching
      // collision, eliminating the old long stretches of scenery-only edge.
      for (const [s0, s1] of [
        [0.07, 0.28], [0.32, 0.44], [0.53, 0.76], [0.81, 0.88],
      ]) {
        guardrail(s0, s1, -1, 7, [0.80, 0.81, 0.83]);
        guardrail(s0, s1,  1, 7, [0.80, 0.81, 0.83]);
      }

      // Marshal posts sprinkled around the rest of the lap.
      for (const s of [0.12, 0.20, 0.38, 0.58, 0.66, 0.84, 0.96]) {
        marshalPost(K(s), hash(K(s)) < 0.5 ? -1 : 1, 8.5);
      }

      // =====================================================================
      // 4. SOPRAELEVATA — old steep banked-oval ruin landmark (s~0.50–0.58 L)
      //    80% gradient concrete bank built from a fan of leaning prism/box
      //    segments, weathered grey with cracks and moss-green streaks. Built
      //    1954, unused for decades, tree roots cracking the surface. Placed
      //    well off-track in the infield/park so it reads as a historic relic.
      // =====================================================================
      (function buildBanking() {
        const conc = [0.66, 0.64, 0.60], concDk = [0.54, 0.52, 0.49], moss = [0.36, 0.48, 0.32];
        const tierPoints = (dist) => {
          const points = [];
          for (let s = 0.50; s <= 0.58 + 1e-9; s += 0.01) {
            const arc = Math.sin(((s - 0.50) / 0.08) * Math.PI);
            points.push({ k: K(s), side: -1, dist: dist + arc * 10 });
          }
          return points;
        };
        // Three terrain-following steps preserve the steep oval silhouette while
        // sampling every endpoint instead of freezing a 120 m model to one Y.
        groundedSegments({
          id: "monza-banking-lower", points: tierPoints(68),
          width: 8.5, height: 4.5, color: concDk,
        });
        groundedSegments({
          id: "monza-banking-middle", points: tierPoints(75),
          width: 8.5, height: 8.5, color: conc,
        });
        groundedSegments({
          id: "monza-banking-upper", points: tierPoints(82),
          width: 8.5, height: 12.5, color: concDk,
        });
        groundedSegments({
          id: "monza-banking-moss", points: tierPoints(66.8),
          width: 0.8, height: 3.2, color: moss,
        });
        // Saplings and creeping bushes growing out of the abandoned banking's
        // cracked upper tier — nature reclaiming a structure unused for
        // decades. Anchored to the SAME terrain-following points as the tiers
        // above (not a fresh anchor()) so each plant sits on the actual bank
        // surface instead of a flat guess at one height.
        for (const p of tierPoints(80)) {
          const h = hash(p.k * 17 + 41);
          if (h < 0.55) continue;
          if (h < 0.80) bush(p.k, p.side, p.dist, [0.22, 0.40, 0.20]);
          else tree(p.k, p.side, p.dist, 4 + h * 3, LEAF_D);
        }
      })();

      // =====================================================================
      // 5. PARK STRUCTURES — Villa Reale, paddock buildings, ornamental lakes
      // =====================================================================
      // Villa Reale — cream neoclassical block in the park (s~0.62 R far).
      building(K(0.62), 1, 70, 64, 24, 30, { wall: [0.87, 0.81, 0.67], window: [0.70, 0.64, 0.50], floor: 6 });
      // ── Lit window bands on Villa Reale for night-ready depth ──
      {
        const aVR = anchor(K(0.62), 1, 70 + 32);  // face of building
        const winVR = [0.96, 0.86, 0.52];
        addBox(out, vadd(aVR.c, aVR.u, 9),  [0.28, 1.4, 62], winVR, [aVR.r, aVR.u, aVR.t]);
        addBox(out, vadd(aVR.c, aVR.u, 17), [0.28, 1.4, 62], winVR, [aVR.r, aVR.u, aVR.t]);
      }
      // Two flanking wings.
      building(K(0.605), 1, 72, 30, 16, 22, { wall: [0.85, 0.79, 0.65], window: [0.68, 0.62, 0.48] });
      building(K(0.635), 1, 72, 30, 16, 22, { wall: [0.85, 0.79, 0.65], window: [0.68, 0.62, 0.48] });

      // Paddock / hospitality buildings behind the pits (left, s~0.97–0.02).
      // Modern containerized/modular hospitality modules, white/light grey with dark windows.
      for (let i = 0; i < 4; i++) {
        const s = 0.93 + i * 0.022;
        building(K(s), -1, 40, 24, 12, 18,
          { wall: [0.80, 0.80, 0.82], window: [0.32, 0.36, 0.44], floor: 4.5, roof: true });
      }
      // ── Lit window bands on paddock hospitality buildings ──
      {
        const winPad = [0.92, 0.82, 0.46];  // warm golden amber
        for (let i = 0; i < 4; i++) {
          const s = 0.93 + i * 0.022;
          const aP = anchor(K(s), -1, 40 + 12);
          addBox(out, vadd(aP.c, aP.u, 5.5), [0.2, 1.0, 22], winPad, [aP.r, aP.u, aP.t]);
          addBox(out, vadd(aP.c, aP.u, 9.5), [0.2, 1.0, 22], winPad, [aP.r, aP.u, aP.t]);
        }
      }
      // Motorhome row in the paddock (was a single flat coloured box per unit).
      every(40, (k) => {
        const h = hash(k * 71 + 31);
        if (h < 0.5) return;
        const s = k / n;
        if (s > 0.10 && s < 0.90) return;   // only behind pit/paddock
        motorhome(k, -1, 55 + h * 10, 10, 4, 6, { wall: [0.6 + h * 0.3, 0.6, 0.62] });
      });

      // OB compound behind the paddock (s~0.98) — the flattest stretch of the
      // lap and set well behind the hospitality row (dist 52) and motorhome
      // camp (dist up to 65) so its van/dish/mast footprint clears both.
      // Every real F1 venue has satellite trucks and uplink dishes back here;
      // Monza had none.
      broadcastCompound(K(0.98), -1, 75, { vans: 3, dishes: 2, mastH: 9 });

      // Ornamental park lakes use the reflective water buffer and explicit model
      // intent; required diagnostics catch accidental suppression or bad sizing.
      waterSurface(K(0.40), 1, 95, [180, 0.18, 230], [0.30, 0.50, 0.70],
        { id: "monza-villa-lake", required: true });
      waterSurface(K(0.24), -1, 90, [140, 0.18, 170], [0.28, 0.48, 0.68],
        { id: "monza-west-park-lake", required: true });
      // A few lakeside broadleaf clusters.
      for (const [s, sd] of [[0.40, 1], [0.24, -1]]) {
        for (let i = 0; i < 4; i++) tree(K(s + (i - 2) * 0.01), sd, 70 + i * 8, 12 + i, LEAF_L);
      }

      // =====================================================================
      // 6. MILAN SKYLINE — distant faint towers on the horizon (s~0.96 R far)
      //    Hazed, cool-grey silhouette suggesting urban sprawl far from the park.
      // =====================================================================
      const kmilan = K(0.96);
      for (let i = 0; i < 7; i++) {
        building(kmilan, 1, 210 + i * 28, 16, 36 + i * 10, 16,
          { wall: [0.62 + i * 0.015, 0.66 + i * 0.015, 0.72 + i * 0.015], window: [0.52, 0.56, 0.62] });
      }
      // ── Milan skyline lit windows (warm night-ready haze) ──
      {
        const winMi = [0.88, 0.78, 0.46];
        for (let i = 0; i < 7; i++) {
          const h = 36 + i * 10;
          const aMi = anchor(kmilan, 1, 210 + i * 28 + 8);
          addBox(out, vadd(aMi.c, aMi.u, h * 0.55), [0.3, h * 0.08, 14], winMi, [aMi.r, aMi.u, aMi.t]);
          addBox(out, vadd(aMi.c, aMi.u, h * 0.28), [0.3, h * 0.06, 14], winMi, [aMi.r, aMi.u, aMi.t]);
        }
      }

      // =====================================================================
      // 7. CONTINUOUS FOREST BACKDROP — unbroken low canopy wall ringing the lap
      //    Multi-layer forest rings at 120m, 185m, 260m create immersive deep park.
      //    Represents the 688-hectare Parco di Monza's dense perimeter woodlands.
      // =====================================================================
      const cx = px.reduce((a, b) => a + b, 0) / n, cz = pz.reduce((a, b) => a + b, 0) / n;
      let rad = 0;
      for (let i = 0; i < n; i++) rad = Math.max(rad, Math.hypot(px[i] - cx, pz[i] - cz));
      // [extraRadius, count, ridgeLen, ridgeW, hMin, hVar, colour]
      for (const [extra, count, len, w, hMin, hVar, col] of [
        [120, 62, 90, 25, 10, 5.5, [0.16, 0.36, 0.20]],   // near treeline, dense
        [185, 52, 108, 28, 12, 6.5, [0.13, 0.33, 0.17]],  // mid forest band
        [260, 44, 128, 32, 14, 7.5, [0.11, 0.30, 0.15]],  // far hazed forest
      ]) {
        for (let i = 0; i < count; i++) {
          const a = i / count * 6.2832, h = hash(i * 7 + extra);
          const r = rad + extra + h * 28;
          const tx = cx + Math.cos(a) * r, tz = cz + Math.sin(a) * r;
          if (onTrack(tx, tz, 30)) continue;
          ridge(tx, tz, pyMin, a + 1.5708, len, w, hMin + h * hVar, col);
        }
      }

      // =====================================================================
      // 8. ENHANCED SCENERY — wooded hills backdrop, dense Lesmo canopy,
      //    improved Parabolica stands, Italian kerb colours, tifosi flags.
      // =====================================================================

      // 8a. Extra backdrop wooded hills — two near rings of ridge prisms
      //     at 80–110 m and 145–185 m beyond the track envelope, staggered
      //     so the park horizon looks organic and unbroken. Reuses cx/cz/rad
      //     computed in section 7.
      {
        // Near ring — warmer green (80–110 m out)
        for (let i = 0; i < 12; i++) {
          const ang = i / 12 * 6.2832, h = hash(i * 3 + 99);
          const r = rad + 80 + h * 24;
          const tx = cx + Math.cos(ang) * r, tz = cz + Math.sin(ang) * r;
          if (onTrack(tx, tz, 28)) continue;
          ridge(tx, tz, pyMin, ang + 1.5708, 30 + h * 16, 20 + h * 8,
                14 + h * 8, [0.14, 0.34, 0.16]);
        }
        // Mid ring — slightly darker/hazed (145–185 m out)
        for (let i = 0; i < 10; i++) {
          const ang = (i + 0.5) / 10 * 6.2832, h = hash(i * 7 + 199);
          const r = rad + 145 + h * 30;
          const tx = cx + Math.cos(ang) * r, tz = cz + Math.sin(ang) * r;
          if (onTrack(tx, tz, 32)) continue;
          ridge(tx, tz, pyMin, ang + 1.5708, 36 + h * 18, 24 + h * 10,
                16 + h * 10, [0.11, 0.29, 0.13]);
        }
      }

      // 8b. Expand Parabolica grandstand — two extra sections widening the arc.
      // The three sections STEP: the 0.905 hero is two-tier under a cantilever
      // with suites, entry (0.875) is a single rake on an open truss, exit
      // (0.935) drops again to a flat-capped block. Reading them left to right
      // gives the arc a rising-then-falling roofline instead of one shell
      // repeated three times in three colours.
      grandstandEx(0.875, 1, 14, 80, null, null,
        { livery: "concrete", roof: "truss", pylons: true, endWalls: true, h: 11 });
      grandstandEx(0.935, 1, 14, 80, null, null,
        { livery: "steel", roof: "flat", endWalls: true, h: 9 });
      // Support plinths underneath stands — placed at groundYAt so they don't float.
      for (const s of [0.875, 0.935]) {
        const kp = K(s);
        const ap = anchor(kp, 1, 20);
        // Plinth sits on the ground (ap.c is ground level), extends 1.2 m up.
        addBox(out, vadd(ap.c, ap.u, 0.6), [8, 1.2, 80], [0.58, 0.56, 0.54], [ap.r, ap.u, ap.t]);
      }
      // ── Lit window bands on Parabolica stands ──
      {
        const winPar = [0.98, 0.88, 0.52];
        for (const s of [0.875, 0.905, 0.935]) {
          const ap = anchor(K(s), 1, 21.5);
          addBox(out, vadd(ap.c, ap.u, 10.0), [0.22, 1.3, 94], winPar, [ap.r, ap.u, ap.t]);
        }
      }

      // 8c. Red/white Italian kerb stripes on start straight (pit-wall side, s=0.0–0.07).
      {
        const kerbR = [0.88, 0.16, 0.12], kerbW = [0.94, 0.94, 0.92];
        for (let i = 0; i < 18; i++) {
          const sFrac = i * (0.07 / 18);
          const k = K(sFrac);
          const a = anchor(k, -1, 4.5);
          const col = (i % 2 === 0) ? kerbR : kerbW;
          addBox(out, vadd(a.c, a.u, 0.25), [0.9, 0.5, 3.2], col, [a.r, a.u, a.t]);
        }
      }

      // 8d. Italian tifosi atmosphere — red banners near the start/finish.
      billboard(K(0.01), 1, 32, 16, 7, [0.92, 0.14, 0.12]);
      billboard(K(0.02), 1, 32, 16, 7, [0.92, 0.14, 0.12]);
      billboard(K(0.005), 1, 30, 15, 6, [0.94, 0.18, 0.16]);
      billboard(K(0.01), -1, 28, 12, 8, [0.90, 0.12, 0.10]);

      // 8e. Pine silhouette ring — adds natural texture to near canopy.
      for (let i = 0; i < 26; i++) {
        const a = i / 26 * 6.2832, h = hash(i * 11 + 5);
        const r = rad + 100 + h * 55;
        const tx = cx + Math.cos(a) * r, tz = cz + Math.sin(a) * r;
        if (onTrack(tx, tz, 30)) continue;
        ridge(tx, tz, pyMin, a, 20, 18, 14 + h * 10, PINE_D);
      }

      // 8f. Park furniture details — lake-edge vegetation clusters.
      for (const [s, sd, colL] of [[0.40, 1, LEAF_L], [0.24, -1, LEAF_L]]) {
        for (let i = 0; i < 5; i++) {
          const si = i - 2;
          tree(K(s + si * 0.01), sd, 72 + i * 8, 15 + i * 0.8, colL);
        }
      }

      // ── 8g. Track-perimeter lamp posts at key corner exits / chicane entries ──
      // A lighter presence than the pit-straight cluster — one post per marshal zone.
      for (const [s, side, gap] of [
        [0.04,  1, 9],   // Rettifilo exit right
        [0.30, -1, 8],   // Roggia left
        [0.48,  1, 9],   // Lesmo right
        [0.78,  1, 9],   // Ascari right
        [0.91,  1, 12],  // Parabolica right
      ]) {
        const k = K(s);
        const ap = anchor(k, side, gap);
        // Pole
        addCyl(out, ap.c, 0.14, 11, [0.18, 0.18, 0.20], 6, [ap.r, ap.u, ap.t]);
        // Lamp head — warm white
        addBox(out, vadd(ap.c, ap.u, 10.7), [1.1, 0.5, 0.6], [0.98, 0.94, 0.72], [ap.r, ap.u, ap.t]);
      }

      // =====================================================================
      // 9. BESPOKE ENRICHMENT — Italian cypress avenues, terraced tifosi bowls,
      //    Autodromo museum portico. All models are LOCAL to this closure.
      // =====================================================================

      // ── 9a. Italian cypress — the tall slim dark-green spire that lines
      //     Italian avenues (distinct columnar form vs. the umbrella pines).
      //     Monza's hand-rolled cypress() is gone: the shared api.cypress() is
      //     that model generalised (same trunk plus 1.45/1.10/0.70 cone stack),
      //     and it adds the sunk root stub and the per-instance tone shift the
      //     local one faked with a two-colour coin flip. CYP stays as the tone
      //     to pass in — the shared model darkens half the instances to within
      //     a rounding error of the old CYP_D. ──
      const CYP = [0.12, 0.29, 0.16];
      // Formal cypress avenue flanking the approach to the Villa Reale (s~0.60).
      for (let i = 0; i < 8; i++) {
        const s = 0.58 + i * 0.007;
        cypress(K(s), 1, 46 + (i % 2) * 3, 15 + hash(i * 9) * 5, CYP);
      }
      // Cypress rank punctuating the pit-straight backdrop and Parabolica bank.
      for (const [s0, side, gap] of [[0.955, -1, 30], [0.02, 1, 40], [0.90, 1, 34]]) {
        for (let i = 0; i < 5; i++)
          cypress(K(s0 + i * 0.006), side, gap + (i % 2) * 4,
                  14 + hash(i * 5 + s0 * 50) * 6, CYP);
      }

      // ── 9b. Terraced tifosi bowl — bespoke multi-tier crowd wall that steps
      //     up and back, packing spectators into a towering historic tribuna.
      //     Cheap: a few slabs + a light row of speckle cubes per tier. ──
      // Shell tone pairs echo grandstandEx's STAND_LIVERIES families (this bowl
      // predates grandstandEx and keeps its own bespoke tifosi-band styling, so
      // it borrows the same named-family idea rather than converting outright)
      // — matches STAND_SETS.monza ["crimson","concrete","steel"] so the five
      // bowls read as distinct stands instead of one grey shell five times.
      const SHELL_SETS = {
        crimson:  [[0.60, 0.44, 0.42], [0.48, 0.34, 0.32]],   // warm red-brick tint
        concrete: [[0.57, 0.58, 0.60], [0.51, 0.52, 0.55]],   // original tone (unchanged)
        steel:    [[0.50, 0.53, 0.58], [0.42, 0.45, 0.50]],   // cool grey
      };
      const TIFOSI = [[0.84, 0.26, 0.22], [0.88, 0.86, 0.82], [0.30, 0.40, 0.62], [0.72, 0.63, 0.30]];
      // The hand-rolled bowl that used to live here is now api.tieredBowl() —
      // this file is the model the shared one was generalised FROM, so the
      // geometry is unchanged (5.6 m tier depth, 3 + 3.3t riser, crowd band at
      // h+0.85, fascia at h+1.85, cantilever over the top tier). What DOES
      // change is that the shared version is a RANGE emitter walking the arc
      // with along(), where the local one froze one anchor and extruded a
      // straight `len` box off it — at the Parabolica (92 m through the
      // circuit's longest curve) that box chorded across the bowl it was
      // supposed to wrap. Monza's five bowls are authored as centre + length,
      // so convert metres → arc fraction once here rather than at five sites.
      const TOTAL_M = ds * n;
      const tifosiBowl = (s, side, gap, len, tiers, livery) => {
        const half = (len / 2) / TOTAL_M;
        tieredBowl(s - half, s + half, side, gap, {
          tiers, tierDepth: 5.6, base: 3, rise: 3.3,
          shell: SHELL_SETS[livery] || SHELL_SETS.concrete,
          crowd: TIFOSI, density: 0.55, roof: true, roofCol: [0.19, 0.19, 0.23],
          // 11 m bays: the local model's ONE box per tier is the cheapest a
          // bowl can be, and the shared emitter costs a set of bays instead.
          // A bay per ~11 m still tracks the Parabolica arc while keeping the
          // five bowls inside the park's vertex budget.
          step: 11,
        });
      };
      // A wall of tifosi at the start/finish and around the iconic Parabolica.
      // Livery family varies per stand (see SHELL_SETS above).
      tifosiBowl(0.905, 1, 26, 92, 4, "crimson");   // Parabolica outer — largest crowd
      tifosiBowl(0.02, 1, 40, 84, 4, "steel");      // facing the pit straight
      tifosiBowl(0.955, -1, 30, 78, 4, "concrete"); // behind Tribuna Centrale
      tifosiBowl(0.11, 1, 24, 64, 3, "crimson");    // Curva Grande sweep
      tifosiBowl(0.78, -1, 30, 70, 3, "steel");     // Ascari outer

      // ── 9c. Autodromo museum / podium building — a low classical block with a
      //     columned portico + pediment, evoking the historic 1922 buildings. ──
      (function museum() {
        const a = anchor(K(0.0), 1, 40);
        const b = [a.r, a.u, a.t], base = a.c;
        const wall = [0.90, 0.87, 0.78], trim = [0.82, 0.78, 0.68];
        // Main hall block.
        out._mat = MAT.STONE;
        addBox(out, vadd(base, a.u, 6), [26, 12, 16], wall, b);
        // Pediment roof (triangular prism running along the facade width).
        out._mat = MAT.CONCRETE;
        addPrism(out, vadd(base, a.u, 13.5), [26, 4, 16], trim, b);
        // Portico: a colonnade of 7 columns fronting the entrance.
        out._mat = MAT.STONE;
        for (let i = 0; i < 7; i++) {
          const off = (i - 3) * 3.4;
          const cp = vadd(vadd(base, a.t, off), a.r, -9);
          addCyl(out, cp, 0.5, 9.5, [0.94, 0.91, 0.83], 8, b);
        }
        // Portico entablature + pediment cap over the columns.
        addBox(out, vadd(vadd(base, a.r, -9), a.u, 10), [2.2, 1.4, 25], trim, b);
        out._mat = MAT.CONCRETE;
        addPrism(out, vadd(vadd(base, a.r, -9), a.u, 12), [2.2, 2.6, 25], wall, b);
        out._mat = MAT.GLASS;
        // Warm-lit window bays on the hall.
        for (let i = 0; i < 5; i++)
          addBox(out, vadd(vadd(base, a.t, (i - 2) * 4.5), a.u, 6), [0.2, 3, 2.2],
                 [0.96, 0.86, 0.52], [a.r, a.u, a.t]);
        out._mat = 0;
      })();

      // =====================================================================
      // 10. TOP-3 IDENTITY — Ascari Sopraelevata flyover, chicane kerb
      //     punctuation, Curva Grande pine wall.
      // =====================================================================

      // 10a. Ascari Sopraelevata flyover — tilted concrete bridge over the
      //     racing line ~s 0.70–0.76 (cars pass under). Distinct from the
      //     off-track banking ruin at s~0.53: this is the historic oval
      //     crossing the modern circuit on the Ascari approach.
      (function sopraelevataFlyover() {
        const conc = [0.66, 0.64, 0.60], concDk = [0.54, 0.52, 0.49];
        const bridgeS = 0.73, clearance = 6.8;
        // One declared crossing replaces four overlapping legacy portals. The
        // required span records its 6.8 m underside clearance explicitly.
        overheadSpan({
          id: "monza-sopraelevata-flyover",
          frac: bridgeS,
          clearance,
          thickness: 2.2,
          depth: 72,
          span: 28,
          // Supports are emitted and preflighted as the two required groups
          // below; disable the span helper's generic depth-sized support boxes.
          supports: false,
          color: concDk,
          required: true,
        });

        // Atomic, terrain-seated piers at the same footprints validated above.
        for (const side of [-1, 1]) {
          const a = anchor(K(bridgeS), side, 4.2);
          modelGroup(`monza-sopraelevata-pier-${side < 0 ? "left" : "right"}`, {
            center: vadd(a.c, a.u, clearance / 2),
            size: [2.4, clearance, 4],
            basis: [a.r, a.u, a.t],
          }, (stage) => {
            addCyl(stage, a.c, 1.2, clearance, concDk, 8, [a.r, a.u, a.t]);
          }, { required: true });
        }

        // The surviving oval banks rise from sampled terrain along both sides,
        // rather than sharing one midpoint height and floating over the approach.
        const points = (side) => {
          const result = [];
          for (let s = 0.695; s <= 0.765 + 1e-9; s += 0.01)
            result.push({ k: K(s), side, dist: 10 });
          return result;
        };
        groundedSegments({
          id: "monza-sopraelevata-wing-left",
          points: points(-1), width: 7.5, height: 8.5, color: conc,
        });
        groundedSegments({
          id: "monza-sopraelevata-wing-right",
          points: points(1), width: 7.5, height: 8.5, color: conc,
        });
      })();

      // 10b. Chicane red/white kerb punctuation — Rettifilo, Roggia, Ascari.
      //     Bright Italian sausage-kerb rhythm at the three heavy-braking zones
      //     (start-straight strip in 8c stays; these punch the chicanes).
      {
        const kerbR = [0.88, 0.16, 0.12], kerbW = [0.94, 0.94, 0.92];
        const strips = [
          [0.025, 0.055,  1],   // Variante del Rettifilo — right
          [0.028, 0.052, -1],   // Rettifilo — left
          [0.285, 0.320, -1],   // Variante della Roggia — left
          [0.290, 0.315,  1],   // Roggia — right
          [0.765, 0.805, -1],   // Variante Ascari — left
          [0.770, 0.800,  1],   // Ascari — right
        ];
        for (const [s0, s1, side] of strips) {
          let i = 0;
          along(s0, s1, 3.0, (k) => {
            const a = anchor(k, side, 4.2);
            addBox(out, vadd(a.c, a.u, 0.22), [0.95, 0.42, 2.6],
                   (i++ % 2 === 0) ? kerbR : kerbW, [a.r, a.u, a.t]);
          });
        }
      }

      // 10c. Curva Grande pine wall — densify the corridor both sides ~s 0.08–0.18
      //     so the fast sweep reads as a green tunnel at speed. The two INNER
      //     ranks are parasol pines (what actually lines this sweep); the two
      //     set-back ranks stay spruce, so the wall has a canopy layer over a
      //     dark understorey rather than one repeated silhouette four deep.
      every(14, (k) => {
        const s = k / n;
        if (s < 0.08 || s > 0.18) return;
        const h = hash(k * 19 + 11);
        stonePine(k, -1, 10 + h * 3, 14 + h * 6, h < 0.4 ? PINE_D : PINE, { spread: 0.72 });
        stonePine(k,  1, 10 + h * 3.5, 13 + h * 6, h < 0.5 ? PINE : PINE_D, { spread: 0.70 });
        if (h > 0.40) pine(k, -1, 20 + h * 4, 18 + h * 10, PINE_D);
        if (h > 0.50) pine(k,  1, 21 + h * 4, 17 + h * 9, PINE);
      });

      // 10d. General-admission crowd hills — Curva Grande and the Lesmo woods
      //     have dense forest but (until now) zero spectators; real fans stand
      //     on informal grass banks cut into the treeline, not in a grandstand.
      //     spectatorHill runs ~70 verts/m, so each stays to one side with
      //     reduced rows/density/step — a facility-sized cost, not a hero one.
      spectatorHill(0.08, 0.18, -1, 13, { rows: 3, rise: 1.0, depth: 1.8, density: 0.40, step: 9 });
      spectatorHill(0.43, 0.54,  1, 13, { rows: 3, rise: 1.0, depth: 1.8, density: 0.40, step: 9 });

      // =====================================================================
      // 11. ROYAL-PARK HERO LAYERS — deeper woodland, banking archaeology,
      //     tifosi camps, the old Vedano approach and braking-zone crowds.
      //     All additions stay in short hero sectors and well behind barriers.
      // =====================================================================

      // 11a. Sparse second-canopy sentinels close only Curva Grande and Lesmo.
      // The 30–38 m setback leaves the fast driver's sightline open; a coarse
      // 42 m cadence adds depth without another expensive continuous tree wall.
      every(42, (k) => {
        const s = k / n;
        const grande = s >= 0.09 && s <= 0.155;
        const lesmo = s >= 0.445 && s <= 0.525;
        if (!grande && !lesmo) return;
        const h = hash(k * 23 + 41);
        pine(k, -1, 30 + h * 6, 16 + h * 8, h < 0.5 ? PINE_D : PINE);
        tree(k, 1, 32 + h * 6, 13 + h * 7, h < 0.45 ? LEAF_D : LEAF);
        if (lesmo && h > 0.58)
          pine(k, h > 0.78 ? -1 : 1, 38 + h * 5, 18 + h * 7, PINE_D);
      });

      // 11b. Abandoned oval control hut above the surviving Sopraelevata tiers.
      // A faded scoring panel and concrete stair ribs make the ruin read as
      // motorsport archaeology rather than a generic retaining wall.
      building(K(0.545), -1, 94, 13, 9, 10, {
        wall: [0.57, 0.55, 0.51], window: [0.28, 0.30, 0.29], floor: 4.5,
      });
      billboard(K(0.545), -1, 91, 12, 4.5, [0.72, 0.68, 0.58]);
      for (let i = 0; i < 4; i++) {
        const a = anchor(K(0.515 + i * 0.018), -1, 87);
        addBox(out, vadd(a.c, a.u, 3.2), [1.1, 6.4, 5.5],
          i % 2 ? [0.53, 0.51, 0.48] : [0.61, 0.59, 0.55],
          [a.r, a.u, a.t]);
      }

      // 11c. Compact race-weekend camps in woodland clearings: striped ridge
      // tents, support vans and Italian flag markers. Each clearing is one
      // bounded atomic model, far enough out to preserve high-speed sightlines.
      function tifosiCamp(id, s, side, gap) {
        const a = anchor(K(s), side, gap);
        const b = [a.r, a.u, a.t];
        modelGroup(id, {
          center: vadd(a.c, a.u, 4),
          size: [24, 8, 44],
          basis: b,
        }, (stage) => {
          const tentCols = [
            [0.84, 0.16, 0.13], [0.92, 0.90, 0.82], [0.20, 0.48, 0.24],
          ];
          for (let i = 0; i < 6; i++) {
            const row = i % 2, alongOff = (Math.floor(i / 2) - 1) * 12;
            const across = (row ? 1 : -1) * 5;
            const p = vadd(vadd(a.c, a.r, across), a.t, alongOff);
            addPrism(stage, vadd(p, a.u, 1.5), [5.5, 3, 6.5],
              tentCols[i % tentCols.length], b);
          }
          for (let i = 0; i < 2; i++) {
            const p = vadd(vadd(a.c, a.r, 7.5), a.t, (i - 0.5) * 18);
            addBox(stage, vadd(p, a.u, 1.4), [3.2, 2.8, 7],
              [0.82, 0.82, 0.78], b);
          }
          const flagBase = vadd(vadd(a.c, a.r, -8), a.t, 17);
          addCyl(stage, flagBase, 0.10, 8, [0.30, 0.30, 0.31], 6, b);
          addBox(stage, vadd(vadd(flagBase, a.u, 6.8), a.t, 1.4),
            [0.16, 1.8, 4.2], [0.18, 0.58, 0.25], b);
        });
      }
      tifosiCamp("monza-tifosi-camp-curva-grande", 0.185, -1, 54);
      tifosiCamp("monza-tifosi-camp-ascari", 0.825, 1, 56);

      // 11d. Vedano-side historic entrance: a cream masonry arch and pediment
      // set deep behind Parabolica, suggesting the old park gateway without
      // creating an overhead obstruction on the racing circuit.
      {
        const a = anchor(K(0.945), 1, 58);
        const b = [a.r, a.u, a.t], stone = [0.84, 0.80, 0.70];
        modelGroup("monza-vedano-gate", {
          center: vadd(a.c, a.u, 7),
          size: [7, 14, 24],
          basis: b,
        }, (stage) => {
          addBox(stage, vadd(vadd(a.c, a.t, -9), a.u, 5), [6, 10, 4.2], stone, b);
          addBox(stage, vadd(vadd(a.c, a.t, 9), a.u, 5), [6, 10, 4.2], stone, b);
          addBox(stage, vadd(a.c, a.u, 10.2), [6, 2.2, 22], [0.77, 0.72, 0.62], b);
          addPrism(stage, vadd(a.c, a.u, 12.3), [6.4, 2.5, 23],
            [0.88, 0.84, 0.74], b);
        });
      }

      // 11e. Opposing, compact tifosi stands at the three major braking zones.
      // Their 28–32 m clearances keep marker boards and corner entry visible.
      // These are the CHEAP seats — race-week seating that goes up in April and
      // comes down in September. roof:"none" plus a back shell barely taller
      // than the top row is what separates them on the skyline from the roofed
      // permanent stands 20 m in front of them; without it Monza had six
      // identically-profiled shells and only the paint told them apart.
      grandstandEx(0.032, 1, 32, 54, null, null, { livery: "crimson", roof: "none", h: 7 });
      grandstandEx(0.295, -1, 28, 50, null, null, { livery: "concrete", roof: "none", h: 6.5 });
      grandstandEx(0.775, 1, 30, 58, null, null, { livery: "steel", roof: "none", h: 7 });
    },
  }
  );
})();
