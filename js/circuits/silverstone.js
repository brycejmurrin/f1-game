/* Apex 26 — SILVERSTONE circuit definition (data only).
   Registered on the global TrackDefs list; consumed by the js/tracks.js engine
   (palette resolved there from `night`, geometry from js/circuits.js or `segs`). */
(function () {
  "use strict";
  (window.TrackDefs = window.TrackDefs || []).push(
  {
    id: "silverstone",
    reverse: false, // direction switched to real-world CW/CCW (was auto-audit reverse:true)
    startFrac: 0.6400, // GPS-derived (OpenF1 2025, conf=0.370)
    name: "SILVERSTONE",
    gp: "British GP",
    country: "UK",
    night: false,
    theme: "green",
    sceneryTheme: "permanent",
    lengthKm: 5.9,
    sunAzimBias: 0.28,   // high-summer northern sun, gentle SW tilt over the old airfield
    baseHW: 8,
    sceneryCoordinates: "racing",
    // Broad, level former-airfield ground. Keep the ribbon wide enough to ground
    // the close stands/aprons without reaching the distant farmland models.
    terrainOuter: 110,
    flatTerrain: true,
    dressingExclusions: [
      { kinds: ["foliage", "lamps", "floodlights"], s0: 0.18, s1: 0.28 },
      { kinds: ["foliage", "lamps"], s0: 0.42, s1: 0.52, side: 1 },
    ],
    // British overcast (ATM.britishOvercast) — pale grey-blue sky, lush grass, soft fog.
    pal: { zenith: [0.55, 0.62, 0.72], horizon: [0.72, 0.76, 0.82], grass: [0.16, 0.40, 0.18], runoff: [0.48, 0.46, 0.42], fog: [0.68, 0.72, 0.78], fogDensity: 0.0020, sunDir: [0.42010419876354255, 0.5521369469463703, 0.7201786264517872], sun: [0.92, 0.94, 0.96], sunColor: [0.92, 0.94, 0.96], ambientSky: [0.58, 0.62, 0.70], ambientGround: [0.30, 0.34, 0.28] },
    segs: [
      { t: 0, l: 260 }, { t: 60, l: 120 }, { t: -50, l: 90 }, { t: 80, l: 80 }, { t: -150, l: 160 }, { t: 0, l: 120 },
      { t: -70, l: 90 }, { t: 120, l: 150 }, { t: 40, l: 100 }, { t: 0, l: 160 }, { t: 70, l: 130 }, { t: -55, l: 70 },
      { t: 60, l: 70 }, { t: -55, l: 70 }, { t: 50, l: 70 }, { t: 0, l: 300 }, { t: 75, l: 110 }, { t: -40, l: 90 },
      { t: 95, l: 90 }, { t: 60, l: 90 },
    ],
    // Source-trace fractions mapping to racing s≈0.12 (rise) and s≈0.55 (dip).
    elevations: [
      { s: 0.76, halfM: 420, rise: 7 },
      { s: 0.19, halfM: 480, rise: -7 },
    ],
    // Silverstone camber. An old airfield: nothing is steeply banked, but Copse,
    // Becketts and Stowe all carry enough camber to be taken at the speeds they
    // are — 3.5-4.5°, with the Luffield/Woodcote loop a touch flatter.
    bankZones: [
      { frac: 0.0267, angleDeg: 4.0, widthM: 110 },   // Copse
      { frac: 0.2122, angleDeg: 3.5, widthM: 190 },   // Becketts
      { frac: 0.3723, angleDeg: 4.5, widthM: 150 },   // Stowe
      { frac: 0.5359, angleDeg: 3.5, widthM: 150 },   // Vale/Club
      { frac: 0.7064, angleDeg: 4.0, widthM: 200 },
      { frac: 0.8001, angleDeg: 3.5, widthM: 200 },   // Luffield
      { frac: 0.9199, angleDeg: 3.0, widthM: 100 },
    ],
    scenery: function (api) {
      const { out, MAT, n, px, pz, pyMin, place, prop, backdrop, every, onTrack, hash, pal,
              grandstand, building, motorhome, hedge, tree, bush, billboard, gantry, mountain, anchor, vadd, addBox,
              pine, marshalPost, fence, guardrail, tyreWall, addCyl, addCone, addPrism, addFrustum, along,
              tower, forestEdge, ATM, modelGroup, overheadSpan, groundPatch,
              groundedSegments, recordBarrier, circuitKit,
              signBoard, seat, cantilever, addPyramid } = api;
      const k = (s) => Math.round(s * n) % n;

      if (circuitKit) {
        circuitKit.pitBuilding({
          id: "kit:silverstone:pit-building", frac: 0.97,
          side: 1, gap: 180, size: [18, 10, 72], garages: 12, required: true,
        });
        // Set-back Wing hospitality and paddock logistics deepen the event campus
        // without closing the view down the pit straight.
        circuitKit.hospitality({
          id: "kit:silverstone:wing-hospitality", frac: 0.465,
          side: 1, gap: 76, size: [20, 9, 58], modules: 6,
        });
        circuitKit.serviceCompound({
          id: "kit:silverstone:paddock-service", frac: 0.935,
          side: 1, gap: 92, size: [30, 5, 54], vehicles: 10,
        });
        circuitKit.cameraCrane({
          id: "kit:silverstone:camera-crane", frac: 0.30,
          side: -1, gap: 45, size: [6, 16, 6], required: true,
        });
      }

      // 2. British overcast sky + lusher grass (ATM.britishOvercast).
      if (ATM && ATM.britishOvercast) Object.assign(pal, ATM.britishOvercast);

      // ---- Palette (English-countryside green / overcast) ----
      const COPSE  = [0.12, 0.36, 0.16];   // dark-green tree copses / hedgerows
      const COPSE2 = [0.16, 0.40, 0.18];   // slightly lighter broadleaf
      const PINEG  = [0.10, 0.30, 0.14];   // conifer needle green
      const GRASS  = (ATM && ATM.britishOvercast && ATM.britishOvercast.grass) || [0.16, 0.40, 0.18];
      const WHITE  = [0.92, 0.92, 0.92];
      const RED    = [0.85, 0.15, 0.15];
      const STEEL  = [0.55, 0.56, 0.60];
      const CONC   = [0.74, 0.75, 0.76];
      const TARMAC = [0.22, 0.22, 0.24];
      // Airfield asphalt apron — former runway concrete, slightly lighter than racing line
      const APRON  = (ATM && ATM.britishOvercast && ATM.britishOvercast.runoff) || [0.48, 0.46, 0.42];
      // emissive-window tones (bright warm amber for lit interiors)
      const LIT_WIN = [0.95, 0.82, 0.40];  // warm amber — Wing/tower lit windows
      const LIT_COOL = [0.70, 0.85, 0.95]; // cool blue-white — upper control room

      // ---- LOW distant Northamptonshire treeline backdrop (flat — no snow) ----
      every(110, (kk) => {
        for (const side of [-1, 1]) {
          backdrop(kk, side, 195 + hash(kk * 6 + side) * 60, [150, 15, 150], [0.16, 0.30, 0.16]);
          backdrop(kk, side, 260 + hash(kk * 9 + side) * 70, [170, 12, 170], [0.14, 0.28, 0.15]);
        }
      });

      // two overlapping rings of low green rises — dense enough to read as a wall
      let cx = 0, cz = 0;
      for (let i = 0; i < n; i++) { cx += px[i]; cz += pz[i]; }
      cx /= n; cz /= n;
      let rad = 0;
      for (let i = 0; i < n; i++) rad = Math.max(rad, Math.hypot(px[i] - cx, pz[i] - cz));
      // Northamptonshire is FLAT former-airfield land — big sky, low horizon.
      // These rings read as a distant WOODLAND treeline, not hills, so heights
      // are kept low (were 18-40 m, which looked like mountains).
      for (const [extra, count, wMin, hMin, hVar, fc, rc] of [
        [270, 20, 180,  9, 6, [0.16, 0.36, 0.18], [0.22, 0.40, 0.22]],
        [370, 18, 220, 11, 7, [0.14, 0.32, 0.16], [0.20, 0.36, 0.20]],
        [470, 16, 260, 14, 8, [0.12, 0.28, 0.14], [0.18, 0.34, 0.18]],
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

      // ---- Hedgerow-gridded flat farmland + perimeter hedgerows ----
      // INNER ring: the clipped hedges that actually back onto the spectator
      // enclosures — close enough to read from the car as the edge of the
      // circuit's own grounds rather than as distant farmland. Hangar Straight
      // (0.18-0.28) is deliberately left without an inner hedge.
      hedge(0.60, 0.64, -1, 30, 2.6, COPSE);   // Village/Loop infield boundary
      hedge(0.60, 0.64,  1, 34, 2.6, COPSE);   // Village outer enclosure
      hedge(0.86, 0.94, -1, 32, 2.4, COPSE);   // Woodcote infield
      hedge(0.08, 0.12,  1, 38, 2.4, COPSE);   // Maggotts outer enclosure
      hedge(0.34, 0.38,  1, 36, 2.4, COPSE);   // Vale/Club outer
      hedge(0.70, 0.76,  1, 30, 2.4, COPSE);   // Aintree / Wellington
      hedge(0.76, 0.82, -1, 33, 2.4, COPSE);   // Brooklands infield
      // OUTER ring: the original farmland boundaries, still well beyond the
      // enclosures so the patchwork keeps its depth.
      hedge(0.20, 0.28,  1, 105, 2.4, COPSE);
      hedge(0.18, 0.22, -1, 120, 2.4, COPSE);
      // Outer farmland hedgerow grid — second ring of field strips
      hedge(0.02, 0.08, -1, 150, 2.2, COPSE);
      hedge(0.28, 0.32, -1, 165, 2.2, COPSE);
      hedge(0.48, 0.52, -1, 155, 2.2, COPSE);
      hedge(0.66, 0.70, -1, 160, 2.2, COPSE);
      // Cross-field hedgerows (grid perpendicular lines — deeper farmland patchwork)
      hedge(0.10, 0.20, -1, 150, 2.2, COPSE2);
      hedge(0.42, 0.52, -1, 140, 2.2, COPSE2);
      hedge(0.70, 0.80,  1, 150, 2.2, COPSE2);
      hedge(0.24, 0.34, -1, 160, 2.2, COPSE2);

      // ---- Oak copses (Chapel/Cheese Copse, s≈0.15 L; scattered elsewhere) ----
      // Named Silverstone copses — dense broadleaf patches using forestEdge for
      // canopy-safe placement. gap = outer clearance; forestEdge adds canopy radius.
      // Hangar Straight (≈0.18–0.28) kept OPEN — no dense outfield belt there.
      // The copses are the circuit's OWN trees, not distant farmland — Chapel
      // and Cheese Copse stand just past the run-off, and the Village/Loop and
      // Luffield woods crowd the infield. They used to sit 64-114 m out, which
      // from the car put every leaf beyond the fog and left the trackside bare.
      forestEdge(0.14, 0.17, -1, 30, { density: 0.8, hMin: 9, hMax: 14, col: COPSE,  col2: COPSE2, pineFrac: 0.1  }); // Chapel/Cheese Copse
      forestEdge(0.61, 0.64,  1, 26, { density: 0.75,hMin: 8, hMax: 13, col: COPSE,  col2: COPSE2, pineFrac: 0.15 }); // Village-side copse
      forestEdge(0.69, 0.71, -1, 24, { density: 0.8, hMin: 9, hMax: 13, col: COPSE,  col2: COPSE2, pineFrac: 0.1  }); // Loop infield copse
      forestEdge(0.44, 0.47, -1, 62, { density: 0.7, hMin: 9, hMax: 13, col: COPSE,  col2: COPSE2, pineFrac: 0.15 }); // behind the Wing paddock
      forestEdge(0.77, 0.80,  1, 28, { density: 0.75,hMin: 8, hMax: 13, col: COPSE,  col2: COPSE2, pineFrac: 0.1  }); // Brooklands outer
      forestEdge(0.89, 0.92, -1, 26, { density: 0.7, hMin: 8, hMax: 12, col: COPSE2, col2: COPSE,  pineFrac: 0.2  }); // Woodcote area
      forestEdge(0.34, 0.36,  1, 44, { density: 0.65,hMin: 8, hMax: 12, col: COPSE,  col2: COPSE2, pineFrac: 0.2  }); // Vale outfield copse
      forestEdge(0.57, 0.60, -1, 34, { density: 0.65,hMin: 9, hMax: 13, col: COPSE,  col2: COPSE2, pineFrac: 0.1  }); // Farm curve infield copse
      // Scattered broadleaf fringe past the enclosures. This used to be ONE
      // full-lap belt at a flat 48 m: a continuous treeline the whole way round,
      // parked far enough out to be fog. It is now per-sector, so the trees sit
      // in the visible band where Silverstone really has them (the infields and
      // the Wellington/Luffield perimeter) and stay away — or away entirely —
      // where the airfield is genuinely open.
      for (const [s0, s1, side, gap, dens] of [
        [0.96, 0.10, -1, 26, 0.08],   // National straight infield / Copse inside
        [0.02, 0.09,  1, 34, 0.06],   // Copse outfield, past the run-off
        [0.10, 0.18, -1, 34, 0.07],   // Maggotts/Becketts infield
        [0.30, 0.42, -1, 30, 0.08],   // Stowe > Vale infield
        [0.30, 0.42,  1, 46, 0.05],   // Vale/Club outfield, beyond the stands
        [0.52, 0.60,  1, 40, 0.06],   // Abbey/Farm outer
        [0.60, 0.76, -1, 24, 0.10],   // Village > Aintree infield woods
        [0.64, 0.76,  1, 34, 0.07],   // Wellington outer
        [0.76, 0.96,  1, 26, 0.09],   // Brooklands > Woodcote perimeter belt
        [0.80, 0.95, -1, 30, 0.07],   // Luffield infield
      ]) forestEdge(s0, s1, side, gap, { density: dens, hMin: 7, hMax: 12, col: COPSE, col2: COPSE2, pineFrac: 0.25 });
      // Hangar Straight (0.18-0.28) gets NO near fringe on either side — the
      // open airfield vista between the hangars is the point of the place.

      // 1. Vast airfield run-off aprons at the signature fast corners.
      // Former runway slabs — wide, low, forgiving asphalt beyond the verge.
      for (const [id, s, side, gap, size] of [
        ["copse", 0.04, 1, 4, [38, 0.28, 58]],
        ["maggotts-left", 0.12, -1, 4, [34, 0.28, 50]],
        ["maggotts-right", 0.12, 1, 4, [32, 0.28, 48]],
        ["stowe", 0.30, 1, 5, [42, 0.28, 64]],
        ["club", 0.40, 1, 4, [36, 0.28, 54]],
        ["abbey", 0.55, 1, 5, [40, 0.28, 60]],
      ]) groundPatch(k(s), side, gap, size, APRON, {
        id: `silverstone-runoff-${id}`, samples: 6,
      });

      // ---- Big grandstands at the signature corners ----
      // Silverstone's stands sit right on top of the run-off apron, not out in
      // the fields — gaps here are the front-row clearance beyond the road edge.
      // Every stand is built as a STRAIGHT chord along the tangent at its own
      // node, so length is the real constraint once they move in: a 70-90 m
      // block at 18-22 m clearance swings its far end out over a doubling-back
      // stretch of the lap. Silverstone's stands are separate blocks anyway, so
      // the hero enclosures are split into adjacent 40-50 m sections.
      // Copse corner — large main straight view
      grandstand(0.032, 1, 18, 42,  [0.44, 0.45, 0.50], [0.52, 0.30, 0.28]);
      grandstand(0.048, 1, 18, 42,  [0.44, 0.45, 0.50], [0.52, 0.30, 0.28]);
      // Maggotts/Becketts complex
      grandstand(0.114, -1, 18, 40, [0.44, 0.45, 0.50], [0.48, 0.32, 0.30]);
      grandstand(0.128, -1, 18, 40, [0.44, 0.45, 0.50], [0.48, 0.32, 0.30]);
      // Stowe — large sweeping stand
      grandstand(0.292, 1, 16, 44,  [0.44, 0.45, 0.50], [0.54, 0.28, 0.28]);
      grandstand(0.309, 1, 16, 44,  [0.44, 0.45, 0.50], [0.54, 0.28, 0.28]);
      // Club — fast corner seating
      grandstand(0.392, 1, 12, 46,  [0.44, 0.45, 0.50], [0.52, 0.30, 0.28]);
      grandstand(0.410, 1, 12, 46,  [0.44, 0.45, 0.50], [0.52, 0.30, 0.28]);
      // The Loop — hairpin seating (both sides)
      grandstand(0.66, -1, 14, 44,  [0.44, 0.45, 0.50], [0.48, 0.32, 0.30]);
      grandstand(0.67,  1, 16, 42,  [0.42, 0.44, 0.48], [0.46, 0.30, 0.28]);
      // Brooklands/Luffield — signature view
      grandstand(0.843, -1, 14, 44, [0.44, 0.45, 0.50], [0.52, 0.30, 0.28]);
      grandstand(0.858, -1, 14, 44, [0.44, 0.45, 0.50], [0.52, 0.30, 0.28]);
      // Abbey (fast) — wide run-off viewing
      grandstand(0.544, 1, 22, 42,  [0.44, 0.45, 0.50], [0.48, 0.32, 0.30]);
      grandstand(0.558, 1, 22, 42,  [0.44, 0.45, 0.50], [0.48, 0.32, 0.30]);
      // Maggotts secondary stand (larger complex)
      grandstand(0.10,  1, 20, 46,  [0.42, 0.44, 0.48], [0.50, 0.30, 0.28]);
      // Chapel corner — fans favourite viewpoint
      grandstand(0.17, -1, 20, 46,  [0.44, 0.45, 0.50], [0.48, 0.32, 0.30]);

      // 4. Broad spectator fields: secondary stand ranks fill the famous viewing
      // bowls, while Hangar Straight itself remains deliberately open. These sat
      // 42-52 m back and read as distant scenery; a second rank at 26-34 m sits
      // BEHIND the front stands above and still reads as a stepped enclosure.
      for (const [s, side, gap, len, crowd] of [
        [0.105, -1, 34, 44, [0.50, 0.28, 0.26]], // Maggotts approach
        [0.145,  1, 30, 46, [0.46, 0.30, 0.30]], // Becketts exit
        [0.285,  1, 32, 46, [0.54, 0.28, 0.26]], // Stowe entry
        [0.325, -1, 26, 46, [0.48, 0.30, 0.28]], // Vale
        [0.815, -1, 28, 46, [0.52, 0.28, 0.26]], // Brooklands approach
        [0.875, -1, 26, 46, [0.48, 0.30, 0.30]], // Luffield/Woodcote
      ]) grandstand(s, side, gap, len, [0.42, 0.44, 0.48], crowd);

      // 4b. The rest of the named Silverstone enclosures. Every British GP
      // grandstand has a name on the ticket, and the lap was missing most of
      // them — Village, Vale, Farm, Aintree, Woodcote and the National-straight
      // Copse/Becketts pair. Modest lengths so the lap reads as a ring of
      // separate stands rather than one continuous wall of seating.
      for (const [s, side, gap, len, crowd] of [
        [0.020,  1, 14, 46, [0.48, 0.30, 0.30]], // Copse entry (National straight)
        [0.155, -1, 14, 44, [0.50, 0.28, 0.26]], // Becketts inner
        [0.345,  1, 14, 62, [0.52, 0.30, 0.28]], // Vale
        [0.375, -1, 16, 44, [0.46, 0.30, 0.30]], // Vale inner
        [0.575, -1, 16, 48, [0.50, 0.30, 0.26]], // Farm curve
        [0.620,  1, 13, 56, [0.54, 0.28, 0.28]], // Village
        [0.635, -1, 15, 42, [0.46, 0.32, 0.30]], // Village inner
        [0.715,  1, 14, 50, [0.48, 0.30, 0.28]], // Aintree
        [0.790, -1, 15, 46, [0.52, 0.28, 0.26]], // Brooklands entry
        [0.905, -1, 15, 58, [0.50, 0.30, 0.28]], // Woodcote
        [0.940,  1, 16, 52, [0.48, 0.32, 0.30]], // National straight (old pits side)
      ]) grandstand(s, side, gap, len, [0.43, 0.44, 0.49], crowd);

      // ---- The Wing building (s≈0.43–0.47 R) — four grounded atomic bays ----
      // Four overlapping 64 m bays follow the pit-straight ground/heading and
      // restore the full ~240 m body, glazing and roof treatment without one
      // long chord crossing the road. Each required group declares complete bounds.
      {
        const wingFracs = [0.435, 0.445, 0.455, 0.465];
        for (let i = 0; i < wingFracs.length; i++) {
          const a = anchor(k(wingFracs[i]), 1, 16);
          const b = [a.r, a.u, a.t];
          modelGroup(`silverstone-wing-facade-${i + 1}`, {
            center: vadd(a.c, a.u, 6.7), size: [24, 13.4, 64], basis: b,
          }, (stage) => {
            stage._mat = MAT.CONCRETE;
            TrackGeom.addBox(stage, vadd(a.c, a.u, 5.5), [20, 11, 64], [0.86, 0.86, 0.88], b);
            stage._mat = MAT.GLASS;
            TrackGeom.addBox(stage, vadd(a.c, a.u, 7.8), [20.2, 3.8, 62], [0.10, 0.14, 0.22], b);
            TrackGeom.addBox(stage, vadd(a.c, a.u, 7.8), [18, 3.2, 60], LIT_WIN, b);
            stage._mat = MAT.METAL;
            TrackGeom.addBox(stage, vadd(a.c, a.u, 12.7), [24, 1.4, 64], [0.90, 0.92, 0.96], b);
          }, { required: true });
        }
      }

      // Wing grandstand (behind pit building, s≈0.46 R)
      grandstand(0.46, 1, 12, 110, [0.48, 0.50, 0.54], [0.60, 0.24, 0.24]);

      // ---- The Wing: control tower rising from the building roofline (s≈0.44 R) ----
      // Placed at dist=32, anchored cleanly off track — uses tower() composite helper
      {
        const tDist = 32;
        const ta = anchor(k(0.44), 1, tDist);
        const b = [ta.r, ta.u, ta.t];
        modelGroup("silverstone-control-tower", {
          center: vadd(ta.c, ta.u, 19.5), size: [7, 39, 7], basis: b,
        }, (stage) => {
          stage._mat = MAT.CONCRETE;
          TrackGeom.addFrustum(stage, ta.c, 3, 2, 26, [0.82, 0.83, 0.86], 8, b);
          stage._mat = MAT.GLASS;
          TrackGeom.addBox(stage, vadd(ta.c, ta.u, 26), [5, 3, 5], [0.10, 0.14, 0.20], b);
          TrackGeom.addBox(stage, vadd(ta.c, ta.u, 27), [4.4, 1.8, 4.4], LIT_COOL, b);
          stage._mat = MAT.METAL;
          // Mast STANDS ON the lit control-room box (top at 27 + 1.8/2 = 27.9);
          // it used to start at 29, hovering 1.1 m clear of the roof it rises from.
          TrackGeom.addCyl(stage, vadd(ta.c, ta.u, 27.9), 0.16, 11, [0.32, 0.32, 0.34], 4, b);
          TrackGeom.addCyl(stage, vadd(ta.c, ta.u, 38.9), 0.28, 0.5, [0.90, 0.20, 0.20], 6, b);
          TrackGeom.addBox(stage, vadd(ta.c, ta.u, 13.5), [4.6, 1.2, 4.6], LIT_WIN, b);
        }, { required: true });
      }

      // flag-mast cluster on the Wing apron
      {
        const a = anchor(k(0.455), 1, 10);
        for (const o of [-30, -10, 10, 30]) {
          addCyl(out, vadd(a.c, a.t, o), 0.14, 14, [0.54, 0.55, 0.60], 5, [a.r, a.u, a.t]);
          // small flag cap coloured alternately
          addBox(out, vadd(vadd(a.c, a.t, o), a.u, 14), [2.4, 1.0, 1.4],
                 o < 0 ? RED : [0.20, 0.38, 0.70], [a.r, a.u, a.t]);
        }
      }

      // low pit-lane wall along the start straight in front of the Wing
      groundedSegments({
        id: "silverstone-pit-wall",
        points: [0.44, 0.4475, 0.455, 0.4625, 0.47, 0.4775, 0.485, 0.4925, 0.50].map((s) => ({
          k: k(s), side: 1, dist: 4,
        })),
        width: 0.6, height: 1.2, color: CONC,
      });
      recordBarrier(0.44, 0.50, 1, 4);

      // BRDC clubhouse set back (s≈0.48 R) — pale historical building
      building(k(0.48), 1, 28, 22, 9, 20, { wall: [0.76, 0.76, 0.72], window: [0.18, 0.24, 0.30] });

      // ---- Lamp posts along the pit straight and around The Wing ----
      // Double-arm floodlight columns — distinctive at circuits (white/silver poles, twin heads)
      {
        // pit straight lamp posts (s 0.44–0.50, right side at dist≈6)
        for (const [sLamp, distLamp] of [
          [0.44, 8], [0.445, 8], [0.45, 8], [0.455, 8], [0.46, 8],
          [0.465, 8], [0.47, 8], [0.475, 8], [0.48, 8], [0.485, 8],
        ]) {
          const la = anchor(k(sLamp), 1, distLamp);
          if (onTrack(la.c[0], la.c[2], 1.2)) continue;
          // lamp column
          addCyl(out, la.c, 0.18, 12, [0.72, 0.74, 0.78], 6, [la.r, la.u, la.t]);
          // Crossarm and twin lamp heads. The arm's LONG axis has to run along
          // the tangent, because that is the axis the heads are offset on — as
          // [5.0, 0.28, 0.28] it spanned 5 m laterally and the two heads hung
          // 2.2 m away from anything (the float-audit cantilever signature).
          addBox(out, vadd(la.c, la.u, 11.8), [0.28, 0.28, 5.4], [0.70, 0.72, 0.76], [la.r, la.u, la.t]);
          addBox(out, vadd(vadd(la.c, la.t, -2.2), la.u, 11.6), [1.8, 0.6, 1.0], LIT_WIN, [la.r, la.u, la.t]);
          addBox(out, vadd(vadd(la.c, la.t,  2.2), la.u, 11.6), [1.8, 0.6, 1.0], LIT_WIN, [la.r, la.u, la.t]);
        }
        // Copse corner lamp posts (s 0.02–0.07, right side)
        for (const [sLamp, distLamp] of [[0.03, 8], [0.05, 8], [0.07, 8]]) {
          const la = anchor(k(sLamp), 1, distLamp);
          if (onTrack(la.c[0], la.c[2], 1.2)) continue;
          addCyl(out, la.c, 0.18, 12, [0.72, 0.74, 0.78], 6, [la.r, la.u, la.t]);
          addBox(out, vadd(la.c, la.u, 11.8), [0.26, 0.26, 4.9], [0.70, 0.72, 0.76], [la.r, la.u, la.t]);
          addBox(out, vadd(vadd(la.c, la.t, -2.0), la.u, 11.6), [1.6, 0.5, 0.9], LIT_WIN, [la.r, la.u, la.t]);
          addBox(out, vadd(vadd(la.c, la.t,  2.0), la.u, 11.6), [1.6, 0.5, 0.9], LIT_WIN, [la.r, la.u, la.t]);
        }
      }

      // ---- National pit straight (s≈0.0) garages + pit wall + paddock ----
      building(k(0.97), 1, 6, 12, 8, 90, { wall: [0.82, 0.83, 0.85], window: [0.20, 0.24, 0.28], floor: 4 });
      // paddock support buildings / hospitality units set back behind the pits —
      // motorhome() gives the real two-tier team-unit body + awning canopy
      // instead of a flat building() office-block mass.
      for (const [s, d, w, h, ln, col] of [
        [0.95, 40, 14, 7, 34, [0.76, 0.76, 0.72]],
        [0.99, 44, 16, 6, 30, [0.72, 0.74, 0.76]],
        [0.92, 38, 12, 6, 26, [0.78, 0.77, 0.73]],
      ]) motorhome(k(s), 1, d, w, h, ln, { wall: col, window: [0.28, 0.32, 0.36] });
      // marquee / hospitality tents (white prism roofs) in the paddock
      for (const [s, d, tCol] of [
        [0.94, 60, [0.92, 0.93, 0.94]],
        [0.96, 72, [0.90, 0.91, 0.92]],
        [0.98, 64, [0.92, 0.93, 0.94]],
        [0.90, 58, [0.90, 0.91, 0.92]],
        [0.88, 66, [0.88, 0.90, 0.92]],  // extra tent
        [0.86, 54, [0.92, 0.91, 0.90]],  // extra tent
      ]) {
        const a = anchor(k(s), 1, d);
        addBox(out, vadd(a.c, a.u, 1.8), [14, 3.5, 18], tCol, [a.r, a.u, a.t]);
        // addPrism anchors at its BASE — at +5.1 the roof floated 1.55 m above
        // the 3.55 m wall top. seat.prism states the intent instead.
        seat.prism(out, vadd(a.c, a.u, 3.55), [14, 2.6, 18], [0.96, 0.97, 0.98], [a.r, a.u, a.t]);
        // marquee lit interior
        addBox(out, vadd(a.c, a.u, 2.2), [12, 2.8, 16], LIT_WIN, [a.r, a.u, a.t]);
      }

      // ---- Catch fencing behind the grandstands at the signature corners ----
      fence(0.02, 0.08,  1,  9, 4.5, [0.74, 0.76, 0.80]);
      fence(0.28, 0.34,  1, 12, 4.5, [0.74, 0.76, 0.80]);
      fence(0.38, 0.44,  1,  9, 4.5, [0.74, 0.76, 0.80]);
      fence(0.83, 0.90, -1, 10, 4.5, [0.74, 0.76, 0.80]);
      fence(0.53, 0.58,  1, 12, 4.5, [0.74, 0.76, 0.80]);
      fence(0.64, 0.70, -1, 11, 4.5, [0.74, 0.76, 0.80]);  // The Loop

      // ---- Armco guardrails lining fast sweeps + tyre-wall stacks at apexes ----
      guardrail(0.05, 0.10,  1, 5, [0.82, 0.82, 0.84]);
      guardrail(0.16, 0.22, -1, 5, [0.82, 0.82, 0.84]);
      guardrail(0.50, 0.56,  1, 6, [0.82, 0.82, 0.84]);
      guardrail(0.72, 0.78,  1, 5, [0.82, 0.82, 0.84]);  // The Loop exit
      tyreWall(0.038, 0.05,  1, 3.5, RED);
      tyreWall(0.295, 0.31,  1, 3.5, [0.2, 0.4, 0.8]);
      tyreWall(0.395, 0.41,  1, 3.5, [0.9, 0.6, 0.1]);
      tyreWall(0.655, 0.67, -1, 3.5, RED);
      tyreWall(0.84, 0.855, -1, 3.5, [0.2, 0.4, 0.8]);

      // ---- Marshal posts dotted around the lap ----
      for (const [s, side] of [[0.05, 1], [0.13, -1], [0.20, -1], [0.31, 1], [0.41, 1],
                               [0.55, 1], [0.66, -1], [0.78, 1], [0.86, -1], [0.95, 1],
                               [0.22, 1], [0.48, -1], [0.60, 1]]) {
        marshalPost(k(s), side, 4);
      }

      // ---- Advertising hoardings around the major corners + pit straight ----
      billboard(k(0.04),  1, 20, 12, 4.5, [0.18, 0.52, 0.28]);
      billboard(k(0.40),  1, 20, 14, 5.0, [0.85, 0.28, 0.18]);
      billboard(k(0.66), -1, 18, 12, 4.5, [0.18, 0.38, 0.68]);
      billboard(k(0.85), -1, 20, 14, 5.0, [0.88, 0.52, 0.08]);
      billboard(k(0.13), -1, 22, 12, 4.5, [0.78, 0.18, 0.28]);
      billboard(k(0.55),  1, 14, 14, 5.0, [0.18, 0.38, 0.68]);  // Abbey
      billboard(k(0.54), -1, 14, 14, 5.0, [0.86, 0.28, 0.18]);
      billboard(k(0.30),  1, 22, 14, 5.0, [0.18, 0.38, 0.68]);  // Stowe

      // ---- Pine windbreak rows (airfield perimeter) + outer broadleaf copse belts ----
      // Windbreaks: mix of conifer/broadleaf at mid-distances using forestEdge.
      // pineFrac=0.6 gives the classic Silverstone mixed-hedgerow/conifer windbreak feel.
      // Hangar Straight (0.18–0.28) deliberately skipped — open airfield vista.
      forestEdge(0.14, 0.17,  1, 68, { density: 0.35, hMin: 9, hMax: 15, col: PINEG, col2: COPSE2, pineFrac: 0.6 }); // Maggotts right (pre-Hangar)
      forestEdge(0.29, 0.42,  1, 74, { density: 0.35, hMin: 9, hMax: 15, col: PINEG, col2: COPSE2, pineFrac: 0.6 }); // Stowe right (post-Hangar)
      forestEdge(0.58, 0.68, -1, 64, { density: 0.35, hMin: 9, hMax: 15, col: PINEG, col2: COPSE2, pineFrac: 0.55}); // Abbey/Loop left
      forestEdge(0.78, 0.90, -1, 70, { density: 0.35, hMin: 9, hMax: 15, col: PINEG, col2: COPSE2, pineFrac: 0.6 }); // Luffield left
      // These two belts break mid-run. At 130-140 m out they leave the outfield and
      // come back over the lap on the far side (s≈0.06-0.08 lands on the National
      // straight; s≈0.47-0.52 lands on the start/finish complex), where their
      // canopies grew through the guardrails and lighting masts standing there.
      forestEdge(0.05, 0.061, -1, 122, { density: 0.3, hMin: 9, hMax: 14, col: PINEG, col2: COPSE2, pineFrac: 0.55}); // Maggotts far side
      forestEdge(0.078, 0.12, -1, 122, { density: 0.3, hMin: 9, hMax: 14, col: PINEG, col2: COPSE2, pineFrac: 0.55});
      forestEdge(0.44, 0.468,  1, 128, { density: 0.3, hMin: 9, hMax: 14, col: PINEG, col2: COPSE2, pineFrac: 0.6 }); // behind The Wing
      // Outer broadleaf copse belts (the named Silverstone landscape copses)
      // Maggotts outer belt ends before Hangar Straight; Stowe belt starts after.
      forestEdge(0.14, 0.17, -1, 82, { density: 0.4, hMin: 9, hMax: 14, col: COPSE, col2: COPSE2, pineFrac: 0.15 }); // Maggotts outer (pre-Hangar)
      forestEdge(0.49, 0.497, 1, 96, { density: 0.4, hMin: 9, hMax: 14, col: COPSE, col2: COPSE2, pineFrac: 0.15 }); // Wing outer belt
      forestEdge(0.516, 0.53, 1, 96, { density: 0.4, hMin: 9, hMax: 14, col: COPSE, col2: COPSE2, pineFrac: 0.15 }); //  (breaks over the pit complex)
      forestEdge(0.71, 0.75,  1, 78, { density: 0.4,  hMin: 9, hMax: 14, col: COPSE, col2: COPSE2, pineFrac: 0.2  }); // Aintree outer copse
      forestEdge(0.61, 0.65, -1, 86, { density: 0.35, hMin: 9, hMax: 13, col: COPSE, col2: COPSE2, pineFrac: 0.15 }); // Village outer belt
      forestEdge(0.35, 0.39, -1, 112, { density: 0.3,  hMin: 9, hMax: 13, col: COPSE, col2: COPSE2, pineFrac: 0.2  }); // Vale outer field copse
      // Very thin Hangar Straight fringe only — silhouette hangars need sky behind them
      forestEdge(0.18, 0.28,  1, 160, { density: 0.08, hMin: 7, hMax: 10, col: COPSE, col2: COPSE2, pineFrac: 0.3 });
      forestEdge(0.18, 0.28, -1, 160, { density: 0.08, hMin: 7, hMax: 10, col: COPSE, col2: COPSE2, pineFrac: 0.3 });

      // ---- Low farm sheds on the flat outfield (hangars live on Hangar Straight below) ----
      for (const [s, side, d, w, h, ln] of [
        [0.50,  1, 145, 24, 5, 34],
        [0.74,  1, 150, 20, 5, 26],
        [0.08,  1, 165, 20, 5, 28],
        [0.62,  1, 160, 18, 5, 24],
        [0.36, -1, 155, 22, 5, 30],
        [0.82,  1, 155, 20, 5, 24],
      ]) {
        const a = anchor(k(s), side, d);
        if (!onTrack(a.c[0], a.c[2], 18)) {
          addBox(out, vadd(a.c, a.u, h * 0.4), [w, h * 0.8, ln], [0.56, 0.54, 0.50], [a.r, a.u, a.t]);
          addPrism(out, vadd(a.c, a.u, h * 0.8 + h * 0.2), [w, h * 0.4, ln], [0.46, 0.44, 0.42], [a.r, a.u, a.t]);
        }
      }

      // ---- Red/white kerb accent boxes + paved run-off framing at apexes ----
      for (const [s, side] of [[0.04, 1], [0.12, -1], [0.12, 1], [0.30, 1], [0.40, 1], [0.55, 1], [0.66, -1], [0.85, -1]]) {
        place(k(s), side, 2, [0.5, 0.3, 8], side > 0 ? RED : WHITE);
        place(k(s), side, 9, [12, 0.1, 14], CONC);
      }
      // Extra kerb at The Wing area
      place(k(0.45), 1, 2, [0.4, 0.28, 6], RED);
      place(k(0.45), 1, 8, [11, 0.1, 10], CONC);

      // ---- Pit garage bays: 10 evenly spaced garage boxes along the pit lane ----
      {
        for (let i = 0; i < 10; i++) {
          const gapStep = 14;
          const dist = 6 + i * gapStep;
          const gb = anchor(k(0.97), 1, dist);
          if (!onTrack(gb.c[0], gb.c[2], 4)) {
            // garage box
            addBox(out, vadd(gb.c, gb.u, 4.5), [10, 9, 15], [0.46, 0.48, 0.50], [gb.r, gb.u, gb.t]);
            // garage door aperture (dark rectangle on track-facing inner face)
            addBox(out, vadd(vadd(gb.c, gb.u, 5), gb.r, -5.2),
                   [0.2, 7, 12], [0.18, 0.18, 0.20], [gb.r, gb.u, gb.t]);
          }
        }
      }

      // ---- Copse corner near-side tree cluster ----
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

      // ---- Pit control tower near the start gantry ----
      building(k(0.01), 1, 8, 9, 5, 11, { wall: [0.76, 0.75, 0.70], window: [0.26, 0.30, 0.34] });

      // ---- Maggotts/Becketts infield tree cluster ----
      {
        const maggFracs = [0.110, 0.120, 0.130];
        const maggDists = [85, 95, 100];
        const maggH = [12, 14, 13];
        for (let i = 0; i < maggFracs.length; i++) {
          tree(k(maggFracs[i]), 1, maggDists[i], maggH[i], COPSE);
        }
      }

      // ---- Brooklands section: darker outer trees + banking suggestion ----
      for (let i = 0; i < 5; i++) {
        const s = 0.80 + i * 0.012;
        tree(k(s), -1, 85 + hash(k(s) * 17) * 20, 11 + hash(k(s) * 19) * 5, [0.16, 0.32, 0.14]);
        tree(k(s), -1, 65 + hash(k(s) * 23) * 25, 10 + hash(k(s) * 29) * 6, [0.14, 0.30, 0.13]);
      }

      // ---- Additional outer signage along the main straight ----
      // Low sponsors/sector boards on the outer wall beyond pit lane
      for (const [s, col] of [
        [0.49, [0.20, 0.40, 0.72]], [0.51, [0.85, 0.20, 0.20]],
        [0.52, [0.95, 0.75, 0.10]], [0.53, [0.20, 0.40, 0.72]],
      ]) {
        billboard(k(s), -1, 20, 10, 4.0, col);
      }

      // =======================================================================
      // BESPOKE AIRFIELD & FARMLAND LANDMARKS — local models from raw primitives
      // =======================================================================

      // --- WWII curved-roof aircraft hangar: a corrugated barrel roof (a
      //     horizontal octagon cylinder laid along the tangent, its lower half
      //     hidden inside the hall) over a rectangular hall with big sliding
      //     doors on both gable ends. The Silverstone airfield signature.
      function hangar(kk, side, dist, w, bodyH, ln) {
        const a = anchor(kk, side, dist);
        if (onTrack(a.c[0], a.c[2], Math.max(w, ln) * 0.5 + 6)) return;
        const b = [a.r, a.u, a.t];
        out._mat = MAT.CONCRETE;
        addBox(out, vadd(a.c, a.u, bodyH / 2), [w, bodyH, ln], [0.60, 0.60, 0.58], b);   // hall
        out._mat = MAT.RUST;
        addCyl(out, vadd(vadd(a.c, a.u, bodyH), a.t, -ln / 2), w / 2, ln,
               [0.52, 0.53, 0.55], 8, [a.r, a.t, a.u]);                                   // barrel roof
        out._mat = MAT.METAL;
        for (const end of [-1, 1]) {
          addBox(out, vadd(vadd(a.c, a.u, bodyH * 0.45), a.t, end * (ln / 2 + 0.05)),
                 [w * 0.9, bodyH * 0.9, 0.3], [0.30, 0.31, 0.33], b);                     // sliding doors
          addBox(out, vadd(vadd(a.c, a.u, bodyH * 0.45), a.t, end * (ln / 2 + 0.12)),
                 [0.2, bodyH * 0.9, 0.1], [0.50, 0.50, 0.52], b);                         // door split
        }
        out._mat = 0;
      }

      // --- Northamptonshire farm barn: barn-red body, pitched roof, hay-loft door
      //     and a corrugated grain silo alongside.
      function barn(kk, side, dist) {
        const a = anchor(kk, side, dist);
        if (onTrack(a.c[0], a.c[2], 20)) return;
        const b = [a.r, a.u, a.t];
        out._mat = MAT.WOOD;
        addBox(out, vadd(a.c, a.u, 3), [10, 6, 16], [0.52, 0.24, 0.18], b);              // body
        out._mat = MAT.RUST;
        addPrism(out, vadd(a.c, a.u, 6), [10.4, 3.4, 16], [0.34, 0.20, 0.16], b);        // pitched roof
        out._mat = MAT.WOOD;
        addBox(out, vadd(vadd(a.c, a.u, 3.5), a.t, 8.05), [4, 4, 0.3], [0.30, 0.16, 0.12], b); // door
        out._mat = MAT.METAL;
        addCyl(out, vadd(a.c, a.r, -side * 8), 2.2, 9, [0.72, 0.72, 0.74], 10, b);        // silo
        addCone(out, vadd(vadd(a.c, a.r, -side * 8), a.u, 9), 2.4, 2.2, [0.60, 0.60, 0.62], 10, b);
        out._mat = 0;
      }

      // --- Heritage Spitfire on a plinth: raised fuselage, elliptical wings, nose
      //     cone, tail fin/plane and a glazed canopy. RAF-airfield history display.
      function heritagePlane(kk, side, dist) {
        const a = anchor(kk, side, dist);
        if (onTrack(a.c[0], a.c[2], 16)) return;
        const b = [a.r, a.u, a.t], green = [0.24, 0.32, 0.20], grey = [0.50, 0.52, 0.55];
        const body = vadd(a.c, a.u, 3.4);
        out._mat = MAT.METAL;
        addCyl(out, a.c, 0.5, 3.0, grey, 6, b);                                          // plinth pole
        addBox(out, body, [1.4, 1.4, 9], green, b);                                      // fuselage
        addCone(out, vadd(body, a.t, 4.5), 0.7, 2.2, [0.40, 0.16, 0.14], 6, [a.r, a.t, a.u]); // spinner nose
        addBox(out, body, [12, 0.4, 2.6], green, b);                                     // wings
        addBox(out, vadd(vadd(body, a.t, -3.8), a.u, 1.2), [0.3, 2.4, 1.8], green, b);   // tail fin
        addBox(out, vadd(body, a.t, -3.8), [4, 0.3, 1.4], green, b);                     // tailplane
        out._mat = MAT.GLASS;
        addBox(out, vadd(body, a.u, 1.0), [1.0, 0.7, 2.0], [0.30, 0.42, 0.50], b);       // canopy
        out._mat = 0;
      }

      // --- Start-light gantry cluster spanning the National straight: twin masts,
      //     a typed overhead span and five red start-light boxes.
      function startGantryCluster(s) {
        const kb = k(s), L = anchor(kb, -1, 2.4), R = anchor(kb, 1, 2.4);
        const bL = [L.r, L.u, L.t], H = 8;
        overheadSpan({
          id: "silverstone-start-gantry", frac: s, clearance: H,
          thickness: 0.7, depth: 1.4, supportGap: 2, supportWidth: 0.8,
          color: [0.16, 0.17, 0.20], required: true,
        });
        out._mat = MAT.METAL;
        addCyl(out, L.c, 0.4, H, [0.20, 0.21, 0.24], 6, bL);
        addCyl(out, R.c, 0.4, H, [0.20, 0.21, 0.24], 6, [R.r, R.u, R.t]);
        const beam = vadd([px[kb], api.py[kb], pz[kb]], L.u, H + 0.35);
        for (let i = 0; i < 5; i++)
          TrackGeom.addBox(out, vadd(vadd(beam, L.u, -1.2), L.r, (i - 2) * 1.6),
                           [0.9, 1.2, 0.9], [0.65, 0.10, 0.10], bL);
        out._mat = 0;
      }

      // 3. Open Hangar Straight (≈0.18–0.28): mid-distance barrel hangar silhouettes
      // on the former WWII airfield apron — reads against open sky, not forest wall.
      hangar(k(0.19),  1,  95, 28, 8, 36);
      hangar(k(0.21), -1, 100, 26, 7, 34);
      hangar(k(0.24),  1, 105, 30, 8, 40);
      hangar(k(0.26), -1,  98, 24, 7, 32);
      hangar(k(0.275), 1, 112, 22, 7, 30);
      // Far outfield hangars elsewhere (Wing / Loop / Maggotts far).
      hangar(k(0.52),  1, 150, 24, 7, 32);
      hangar(k(0.72),  1, 155, 22, 7, 30);
      hangar(k(0.08), -1, 160, 22, 7, 28);
      // Northamptonshire farm barns + grain silos gridding the fields.
      barn(k(0.30), -1, 165);
      barn(k(0.62), -1, 170);
      barn(k(0.86),  1, 160);
      // Heritage Spitfire on a plinth — airfield history display near the paddock.
      heritagePlane(k(0.50), 1, 120);
      // Rich start-light gantry cluster spanning the National straight.
      startGantryCluster(0.995);

      // 5. Former-runway remnant beside Hangar Straight. A single broad slab and
      // sparse threshold bars read as airfield heritage without building a wall
      // against the intentionally open rural horizon.
      groundPatch(k(0.235), 1, 64, [28, 0.16, 190], [0.36, 0.37, 0.38], {
        id: "silverstone-heritage-runway", samples: 8,
      });
      for (const d of [69, 75, 81, 87]) {
        place(k(0.235), 1, d, [1.4, 0.12, 14], [0.84, 0.84, 0.80]);
      }

      // 6. Event service roads: narrow, subdued asphalt links behind the Wing,
      // National paddock and the Luffield camping fields.
      for (const [id, s, side, gap, len] of [
        ["wing",     0.475, 1, 44, 92],
        ["paddock",  0.930, 1, 46, 84],
        ["camping",  0.775, 1, 40, 110],
        ["infield",  0.320, -1, 38, 120],
        ["stowe",    0.290,  1, 42, 96],
      ]) groundPatch(k(s), side, gap, [8, 0.12, len], [0.28, 0.29, 0.30], {
        id: `silverstone-service-road-${id}`, samples: 7,
      });

      // 7. British GP camping fields: three bounded, atomic clusters of white
      // caravans and small coloured tents, well behind the Luffield perimeter.
      for (let field = 0; field < 3; field++) {
        const s = 0.735 + field * 0.045;
        const a = anchor(k(s), 1, 56 + field * 12);
        const b = [a.r, a.u, a.t];
        modelGroup(`silverstone-camping-field-${field + 1}`, {
          center: vadd(a.c, a.u, 2.8), size: [54, 5.6, 58], basis: b,
        }, (stage) => {
          for (let i = 0; i < 8; i++) {
            const row = i < 4 ? -1 : 1;
            const slot = i % 4;
            const c = vadd(vadd(a.c, a.r, row * (9 + hash(field * 31 + i) * 4)),
                           a.t, (slot - 1.5) * 12);
            const tent = (i + field) % 3 === 0;
            if (tent) {
              stage._mat = MAT.FABRIC;
              // addPrism is BASE-anchored: pitching it at +1.35 left every tent
              // hovering half its own height above the field.
              TrackGeom.addPrism(stage, c, [4.8, 2.7, 6.5],
                                 i % 2 ? [0.78, 0.20, 0.18] : [0.20, 0.38, 0.62], b);
            } else {
              stage._mat = MAT.METAL;
              TrackGeom.addBox(stage, vadd(c, a.u, 1.25), [3.2, 2.5, 6.8],
                               [0.88, 0.88, 0.84], b);
              stage._mat = MAT.GLASS;
              TrackGeom.addBox(stage, vadd(vadd(c, a.u, 1.45), a.r, -1.62),
                               [0.12, 0.8, 2.2], [0.22, 0.30, 0.36], b);
            }
          }
        });
      }

      // =======================================================================
      // 8. NEAR-BAND EVENT DRESSING (8-40 m)
      // Silverstone is a former airfield: wide, flat, big sky. What fills that
      // emptiness on a race weekend is not landscape but INFRASTRUCTURE — a
      // continuous ribbon of hoardings, debris fencing, spectator mounds,
      // marshal posts, TV towers and hospitality standing on the run-off aprons.
      // Everything below lives inside 40 m of the road edge, where it actually
      // reads from the cockpit, and the horizon above stays open.
      // =======================================================================

      const BANK   = [0.34, 0.42, 0.24];   // packed-earth spectator mound
      const BANK2  = [0.20, 0.44, 0.20];   // grassed terrace tread
      const SPONSOR = [
        [0.85, 0.16, 0.14], [0.12, 0.36, 0.70], [0.94, 0.76, 0.10],
        [0.10, 0.52, 0.30], [0.92, 0.92, 0.94], [0.16, 0.18, 0.22],
      ];
      // Muted British-summer crowd tones. Saturated primaries here read as a
      // stripe of coloured blocks rather than people at 20-30 m, which is where
      // these banks sit — the engine's own CROWD_DAY pack is similarly damped.
      const CROWD_C = [
        [0.52, 0.30, 0.28], [0.28, 0.32, 0.46], [0.62, 0.60, 0.56],
        [0.26, 0.40, 0.30], [0.44, 0.32, 0.42], [0.60, 0.48, 0.30],
        [0.36, 0.38, 0.42], [0.50, 0.46, 0.38],
      ];

      // --- Trackside advertising hoarding: the continuous board line that backs
      //     every run-off at a modern GP. Two prims per panel run, so a full
      //     sector of it costs almost nothing but changes the read completely.
      function hoardingLine(s0, s1, side, gap) {
        along(s0, s1, 12, (kk, spacing) => {
          const p = anchor(kk, side, gap);
          if (onTrack(p.c[0], p.c[2], 1.4)) return;
          const b = [p.r, p.u, p.t];
          const col = SPONSOR[Math.floor(hash(kk * 3.1 + side) * SPONSOR.length) % SPONSOR.length];
          addBox(out, vadd(p.c, p.u, 0.85), [0.25, 1.7, spacing], col, b);        // panel face
          addBox(out, vadd(p.c, p.u, 1.78), [0.40, 0.20, spacing], WHITE, b);     // white top rail
        });
      }

      // --- Terraced spectator mound: three earth steps rising AWAY from the
      //     track with a speckled crowd blanket on each tread. Silverstone's
      //     general-admission banks, not seating — low enough to keep the
      //     horizon, dense enough to read as people rather than landform.
      //     Walked with along() and re-anchored at every node: a single anchor
      //     stretched over 60-70 m of a corner is a chord, and its ends lift off
      //     the ground (docs/SCENERY-GROUNDING.md, "one ground sample reused").
      //     seat.box() then puts each step's UNDERSIDE on that local ground, so
      //     a step can never hover the way a hand-computed centre does.
      function crowdMound(s0, s1, side, gap, rise) {
        const steps = 3;
        along(s0, s1, 7, (kk, spacing) => {
          const a = anchor(kk, side, gap);
          if (onTrack(a.c[0], a.c[2], 3)) return;
          const b = [a.r, a.u, a.t];
          for (let i = 0; i < steps; i++) {
            const h = rise * (i + 1) / steps;
            const foot = vadd(a.c, a.r, side * (1.8 + i * 3.4));
            seat.box(out, foot, [3.4, h, spacing], i === steps - 1 ? BANK2 : BANK, b);
            // spectators standing on the tread, ~20% gaps so it speckles
            const bodies = Math.max(2, Math.round(spacing / 2.0));
            for (let j = 0; j < bodies; j++) {
              const hh = hash(kk * 2.3 + i * 7.1 + j * 1.7 + side);
              if (hh > 0.72) continue;   // ~28% gaps so the bank speckles
              const off = ((j + 0.5) / bodies - 0.5) * (spacing - 1.2) + (hh - 0.5) * 0.5;
              const c = vadd(vadd(foot, a.t, off), a.u, h + 0.55);
              addBox(out, vadd(c, a.r, side * (hh - 0.5) * 1.2),
                     [0.5, 1.1, 0.45], CROWD_C[Math.floor(hh * 61) % CROWD_C.length], b);
            }
          }
        });
      }

      // --- TV camera tower: a slim lattice mast with a railed platform and a
      //     camera head on a real arm (cantilever emits the member, so the head
      //     can never be left hovering beside a bare pole).
      function tvTower(s, side, gap, h) {
        const a = anchor(k(s), side, gap), b = [a.r, a.u, a.t];
        if (onTrack(a.c[0], a.c[2], 4)) return;
        out._mat = MAT.METAL;
        for (const [dr, dt] of [[-1, -1], [-1, 1], [1, -1], [1, 1]]) {
          const leg = vadd(vadd(a.c, a.r, dr * 0.9), a.t, dt * 0.9);
          seat.cyl(out, vadd(leg, a.u, -0.4), 0.11, h + 0.4, STEEL, 4, b);
        }
        for (let i = 1; i <= 3; i++)   // lattice bracing rings
          addBox(out, vadd(a.c, a.u, h * i / 4), [2.1, 0.14, 2.1], STEEL, b);
        seat.box(out, vadd(a.c, a.u, h), [3.0, 0.22, 3.0], [0.40, 0.42, 0.46], b);   // platform deck
        addBox(out, vadd(a.c, a.u, h + 0.75), [3.1, 0.10, 3.1], [0.62, 0.64, 0.68], b); // hand rail
        out._mat = 0;
        cantilever(out, vadd(a.c, a.u, h + 0.6), 1.5, -side,
                   [0.7, 0.5, 1.1], [0.14, 0.15, 0.18], STEEL, b);                   // camera + arm
      }

      // --- Trackside marshal / recovery point: a low bunker, a fire-tender bay
      //     and a crane pad. Grouped so a rejected footprint drops all of it.
      function marshalBay(id, s, side, gap) {
        const a = anchor(k(s), side, gap), b = [a.r, a.u, a.t];
        modelGroup(`silverstone-marshal-bay-${id}`, {
          center: vadd(a.c, a.u, 2.2), size: [10, 4.4, 22], basis: b,
        }, (stage) => {
          stage._mat = MAT.CONCRETE;
          TrackGeom.addBox(stage, vadd(a.c, a.u, 1.3), [5.0, 2.6, 8], [0.80, 0.81, 0.83], b);
          stage._mat = MAT.METAL;
          TrackGeom.addBox(stage, vadd(a.c, a.u, 2.75), [5.6, 0.3, 8.6], [0.95, 0.55, 0.08], b);
          // recovery tractor parked alongside
          const v = vadd(vadd(a.c, a.t, 8), a.r, side * 0.5);
          TrackGeom.addBox(stage, vadd(v, a.u, 1.0), [2.4, 2.0, 5.2], [0.90, 0.62, 0.10], b);
          TrackGeom.addBox(stage, vadd(v, a.u, 2.4), [2.0, 0.9, 2.2], [0.24, 0.28, 0.34], b);
        });
      }

      // ---- Trackside layering, from the tarmac outward: hoardings at 9.5 m
      //      (mounted on the barrier line), debris fence at 11.5, then the stands
      //      from 12 and the mounds from 20. Hangar Straight is skipped
      //      throughout — its whole character is empty grass to the horizon.
      for (const [s0, s1, side] of [
        [0.97, 0.09,  1], [0.97, 0.09, -1],   // Copse / National straight
        [0.09, 0.18, -1], [0.09, 0.18,  1],   // Maggotts > Chapel
        [0.28, 0.35,  1], [0.28, 0.35, -1],   // Stowe > Vale
        [0.36, 0.43,  1], [0.36, 0.43, -1],   // Club
        [0.44, 0.52, -1],                      // pit straight, opposite the Wing
        [0.53, 0.60,  1], [0.53, 0.60, -1],   // Abbey / Farm
        [0.60, 0.72,  1], [0.60, 0.72, -1],   // Village / Loop / Aintree
        [0.76, 0.86, -1], [0.76, 0.86,  1],   // Brooklands / Luffield
        [0.86, 0.96, -1], [0.88, 0.96,  1],   // Woodcote > National
      ]) hoardingLine(s0, s1, side, 9.5);

      // ---- Debris fencing behind the hoardings, all the way round the
      //      spectator sectors. fence() indexes its geometry for the foliage
      //      guard but does NOT tighten the driving limit, so the circuit still
      //      drives with its airfield-sized run-off.
      for (const [s0, s1, side] of [
        [0.96, 0.10,  1], [0.96, 0.10, -1],
        [0.09, 0.18, -1], [0.30, 0.35,  1],
        [0.35, 0.43,  1], [0.35, 0.43, -1],
        [0.53, 0.60, -1], [0.60, 0.72,  1],
        [0.60, 0.72, -1], [0.76, 0.86, -1],
        [0.86, 0.96, -1],
      ]) fence(s0, s1, side, 11.5, 5.0, [0.74, 0.76, 0.80]);

      // ---- Spectator mounds: the grass banks that ring the infield and the
      //      outside of the slower corners. Kept off Hangar Straight and off the
      //      fast Copse/Stowe entries, where the run-off is genuinely empty.
      for (const [s0, s1, side, gap, rise] of [
        [0.024, 0.042, -1, 20, 3.6],   // Copse infield bank
        [0.068, 0.084,  1, 24, 3.2],   // Copse exit outer
        [0.128, 0.146, -1, 26, 3.4],   // Becketts infield
        [0.306, 0.326,  1, 24, 3.8],   // Stowe outer bank
        [0.347, 0.365, -1, 22, 3.4],   // Vale infield
        [0.408, 0.424, -1, 20, 3.2],   // Club infield
        [0.556, 0.576,  1, 30, 3.6],   // Abbey outer bank
        [0.597, 0.615, -1, 22, 3.4],   // Farm infield
        [0.652, 0.670,  1, 22, 3.6],   // The Loop outer
        [0.726, 0.746, -1, 20, 3.4],   // Aintree / Wellington infield
        [0.796, 0.814,  1, 22, 3.4],   // Brooklands outer
        [0.856, 0.874,  1, 20, 3.6],   // Luffield outer
        [0.915, 0.935, -1, 22, 3.4],   // Woodcote infield
      ]) crowdMound(s0, s1, side, gap, rise);

      // ---- TV camera towers at the signature vantage points.
      for (const [s, side, gap, h] of [
        [0.045,  1, 22, 11], [0.125, -1, 22, 12], [0.235, 1, 26, 13],
        [0.305,  1, 24, 12], [0.405,  1, 18, 11], [0.475, -1, 20, 13],
        [0.555,  1, 26, 12], [0.665, -1, 20, 11], [0.845, -1, 20, 12],
        [0.915, -1, 22, 11],
      ]) tvTower(s, side, gap, h);

      // ---- Marshal / recovery bays behind the run-off at the high-risk points.
      for (const [id, s, side, gap] of [
        ["copse", 0.055, 1, 26], ["becketts", 0.150, -1, 24],
        ["stowe", 0.320, 1, 28], ["club", 0.420, 1, 22],
        ["abbey", 0.575, 1, 30], ["loop", 0.680, -1, 22],
        ["brooklands", 0.795, -1, 24], ["woodcote", 0.895, -1, 24],
      ]) marshalBay(id, s, side, gap);

      // ---- Corner boards and braking markers — the small, close furniture that
      //      gives a straight a sense of speed. gap 7-8 sits just past the verge.
      for (const [s, side, num] of [
        [0.030,  1,  9], [0.105, -1, 10], [0.145,  1, 12], [0.290,  1, 15],
        [0.345, -1, 16], [0.395,  1, 17], [0.545,  1,  1], [0.605, -1,  3],
        [0.650, -1,  4], [0.705,  1,  6], [0.775, -1,  7], [0.855, -1,  8],
      ]) signBoard(k(s), side, 7.5, "corner", num);
      for (const [s, side] of [
        [0.020,  1], [0.270,  1], [0.375,  1], [0.535,  1], [0.640, -1], [0.765, -1],
      ]) for (let i = 3; i >= 1; i--) signBoard(k(s - i * 0.006), side, 8, "braking", i);

      // ---- More marshal posts: a manned post roughly every 300 m, which is
      //      what an FIA circuit actually carries.
      for (const [s, side] of [[0.02, -1], [0.09, 1], [0.16, 1], [0.25, -1],
                               [0.28, 1], [0.35, -1], [0.44, 1], [0.52, -1],
                               [0.58, -1], [0.63, 1], [0.71, -1], [0.74, 1],
                               [0.82, 1], [0.90, 1], [0.92, -1], [0.98, -1]]) {
        marshalPost(k(s), side, 8);
      }

      // ---- Extra tyre-wall stacks at the remaining apexes.
      tyreWall(0.115, 0.128, -1, 3.5, [0.9, 0.6, 0.1]);
      tyreWall(0.165, 0.176, -1, 3.5, [0.2, 0.4, 0.8]);
      tyreWall(0.545, 0.558,  1, 3.5, [0.9, 0.6, 0.1]);
      tyreWall(0.615, 0.628,  1, 3.5, RED);
      tyreWall(0.775, 0.788, -1, 3.5, [0.2, 0.4, 0.8]);
      tyreWall(0.905, 0.918, -1, 3.5, RED);

      // ---- Hospitality / tented village pulled onto the near aprons. The
      //      British GP's paddock club and team units line the pit straight and
      //      the Brooklands complex, not the far fields.
      for (const [s, side, d, w, ln, tCol] of [
        [0.505, 1, 30, 12, 16, [0.92, 0.93, 0.94]],
        [0.520, 1, 32, 12, 16, [0.90, 0.91, 0.92]],
        [0.535, 1, 30, 12, 16, [0.92, 0.91, 0.90]],
        [0.800, 1, 34, 12, 16, [0.90, 0.91, 0.92]],
        [0.820, 1, 36, 12, 16, [0.92, 0.93, 0.94]],
        [0.700, 1, 32, 12, 16, [0.90, 0.90, 0.92]],
        [0.160, 1, 36, 12, 16, [0.92, 0.92, 0.93]],
        [0.330, 1, 38, 12, 16, [0.90, 0.92, 0.93]],
      ]) {
        const a = anchor(k(s), side, d), b = [a.r, a.u, a.t];
        if (onTrack(a.c[0], a.c[2], 14)) continue;
        out._mat = MAT.FABRIC;
        seat.box(out, a.c, [w, 3.2, ln], tCol, b);
        seat.prism(out, vadd(a.c, a.u, 3.2), [w, 2.2, ln], [0.96, 0.97, 0.98], b);
        out._mat = 0;
        addBox(out, vadd(a.c, a.u, 1.7), [w - 1.6, 2.6, ln - 2], LIT_WIN, b);
      }

      // ---- Media/timing cabins and toilet/concession blocks behind the stands.
      for (const [s, side, d, w, h, ln] of [
        [0.060,  1, 30, 6, 3.2, 12], [0.135, -1, 32, 6, 3.2, 10],
        [0.300,  1, 34, 7, 3.4, 14], [0.410,  1, 26, 6, 3.2, 12],
        [0.560,  1, 34, 6, 3.2, 12], [0.670, -1, 26, 6, 3.2, 10],
        [0.810, -1, 30, 7, 3.4, 14], [0.890, -1, 30, 6, 3.2, 12],
        [0.955,  1, 28, 6, 3.2, 12],
      ]) {
        const a = anchor(k(s), side, d), b = [a.r, a.u, a.t];
        if (onTrack(a.c[0], a.c[2], 10)) continue;
        out._mat = MAT.CONCRETE;
        seat.box(out, a.c, [w, h, ln], [0.80, 0.80, 0.78], b);
        out._mat = MAT.METAL;
        seat.prism(out, vadd(a.c, a.u, h), [w + 0.4, 0.9, ln], [0.46, 0.48, 0.52], b);
        out._mat = 0;
        addBox(out, vadd(vadd(a.c, a.u, h * 0.6), a.r, -side * (w / 2 + 0.05)),
               [0.12, h * 0.4, ln - 3], [0.26, 0.32, 0.38], b);
      }

      // ---- Helicopter pad on the infield apron — the British GP's shuttle
      //      traffic is part of the place. Pad, marking bars and a parked
      //      airframe, all grounded on the same anchor.
      {
        const s = 0.375, side = -1;
        groundPatch(k(s), side, 34, [30, 0.14, 30], [0.30, 0.31, 0.33], {
          id: "silverstone-helipad", samples: 6,
        });
        const a = anchor(k(s), side, 46), b = [a.r, a.u, a.t];
        if (!onTrack(a.c[0], a.c[2], 16)) {
          for (const [dr, dt, sz] of [[0, -2.6, [7, 0.06, 1.2]], [0, 2.6, [7, 0.06, 1.2]],
                                      [0, 0, [1.2, 0.06, 6]]])
            addBox(out, vadd(vadd(a.c, a.u, 0.22), a.t, dt), sz, [0.92, 0.92, 0.90], b), void dr;
          out._mat = MAT.METAL;
          seat.cyl(out, a.c, 0.14, 1.1, [0.30, 0.31, 0.34], 5, b);                       // skid strut
          addBox(out, vadd(a.c, a.u, 1.6), [1.8, 1.5, 6.4], [0.18, 0.30, 0.52], b);      // cabin
          addBox(out, vadd(vadd(a.c, a.u, 1.9), a.t, -5.2), [0.5, 0.5, 4.6], [0.18, 0.30, 0.52], b); // tail boom
          addBox(out, vadd(vadd(a.c, a.u, 2.6), a.t, -7.0), [0.16, 1.6, 0.6], [0.86, 0.86, 0.88], b); // fin
          addBox(out, vadd(a.c, a.u, 2.6), [0.5, 0.5, 0.5], [0.40, 0.42, 0.46], b);      // rotor head
          for (const ang of [0, Math.PI / 2]) {
            const rr = [a.r[0] * Math.cos(ang) + a.t[0] * Math.sin(ang), a.r[1],
                        a.r[2] * Math.cos(ang) + a.t[2] * Math.sin(ang)];
            addBox(out, vadd(a.c, a.u, 2.8), [11, 0.12, 0.5], [0.24, 0.25, 0.28], [rr, a.u, a.t]);
          }
          out._mat = 0;
        }
      }

      // ---- Airfield-heritage windsock beside the helipad and at the runway
      //      remnant: two masts, an orange cone each. Small, but it is the one
      //      prop that says "this used to be an aerodrome".
      for (const [s, side, d] of [[0.385, -1, 30], [0.245, 1, 34]]) {
        const a = anchor(k(s), side, d), b = [a.r, a.u, a.t];
        if (onTrack(a.c[0], a.c[2], 4)) continue;
        out._mat = MAT.METAL;
        seat.cyl(out, vadd(a.c, a.u, -0.4), 0.13, 8.4, [0.72, 0.72, 0.74], 5, b);
        out._mat = MAT.FABRIC;
        addCone(out, vadd(vadd(a.c, a.u, 8.0), a.t, 3.4), 0.85, 3.4,
                [0.95, 0.45, 0.10], 7, [a.r, [-a.t[0], -a.t[1], -a.t[2]], a.u]);
        out._mat = 0;
      }

      // ---- Flagpole avenue along the National straight — the BRDC row of
      //      national flags that fronts the old pit complex.
      {
        const a = anchor(k(0.965), 1, 22), b = [a.r, a.u, a.t];
        for (let i = -4; i <= 4; i++) {
          const c = vadd(a.c, a.t, i * 7);
          out._mat = MAT.METAL;
          seat.cyl(out, vadd(c, a.u, -0.4), 0.11, 10.4, [0.86, 0.87, 0.90], 5, b);
          out._mat = 0;
          addBox(out, vadd(vadd(c, a.u, 8.6), a.t, 1.3), [0.08, 1.2, 2.2],
                 SPONSOR[((i + 4) % SPONSOR.length + SPONSOR.length) % SPONSOR.length], b);
        }
      }

      // silence unused-guard lint helpers (destructured but not called directly)
      void GRASS; void TARMAC; void prop; void tower; void bush;
      void gantry; void building; void addFrustum; void addPyramid;
    },
  }
  );
})();
