/* Apex 26 — SILVERSTONE circuit definition (data only).
   Registered on the global TrackDefs list; consumed by the js/tracks.js engine
   (palette resolved there from `night`, geometry from js/circuits.js or `segs`). */
(function () {
  "use strict";
  (window.TrackDefs = window.TrackDefs || []).push(
  {
    id: "silverstone",
    reverse: true,  // GPS trace is backwards vs real racing direction (auto-audit)
    name: "SILVERSTONE",
    gp: "British GP",
    country: "UK",
    night: false,
    theme: "green",
    lengthKm: 5.9,
    baseHW: 8,
    pal: { zenith: [0.28, 0.38, 0.58], horizon: [0.54, 0.62, 0.68], grass: [0.20, 0.44, 0.18], fogDensity: 0.0014, sunDir: [0.42010419876354255, 0.5521369469463703, 0.7201786264517872], sun: [0.82, 0.86, 0.96], sunColor: [0.78, 0.82, 0.92] },
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
              pine, marshalPost, fence, guardrail, tyreWall, addCyl, addCone, addPrism, addFrustum, along,
              tower, forestEdge } = api;
      const k = (s) => Math.round(s * n) % n;

      // ---- Palette (English-countryside green / overcast) ----
      const COPSE  = [0.14, 0.34, 0.16];   // dark-green tree copses / hedgerows
      const COPSE2 = [0.18, 0.38, 0.18];   // slightly lighter broadleaf
      const PINEG  = [0.12, 0.28, 0.14];   // conifer needle green
      const GRASS  = [0.22, 0.48, 0.18];
      const WHITE  = [0.92, 0.92, 0.92];
      const RED    = [0.85, 0.15, 0.15];
      const STEEL  = [0.55, 0.56, 0.60];
      const CONC   = [0.74, 0.75, 0.76];
      const TARMAC = [0.22, 0.22, 0.24];
      // emissive-window tones (bright warm amber for lit interiors)
      const LIT_WIN = [0.95, 0.82, 0.40];  // warm amber — Wing/tower lit windows
      const LIT_COOL = [0.70, 0.85, 0.95]; // cool blue-white — upper control room

      // ---- LOW distant Northamptonshire treeline backdrop (flat — no snow) ----
      every(38, (kk) => {
        for (const side of [-1, 1]) {
          backdrop(kk, side, 195 + hash(kk * 6 + side) * 60, [150, 15, 150], [0.16, 0.30, 0.16]);
          backdrop(kk, side, 260 + hash(kk * 9 + side) * 70, [170, 12, 170], [0.14, 0.28, 0.15]);
        }
      });

      // ---- FLAT AIRFIELD HORIZON (no mountains — Silverstone is a former RAF
      // airfield, ~22 m total elevation; the land is genuinely flat). The old
      // concentric mountain() rings are deliberately removed. The low distant
      // treeline backdrops above carry the horizon; here we add an even lower,
      // very distant hedgerow/copse silhouette so the skyline reads as an open
      // English farmland horizon rather than a bare edge — but never as hills.
      every(46, (kk) => {
        for (const side of [-1, 1]) {
          // very low (8–12 m) far treeline — flat open-airfield horizon
          backdrop(kk, side, 360 + hash(kk * 11 + side) * 90, [190, 9, 190], [0.13, 0.26, 0.15]);
          backdrop(kk, side, 460 + hash(kk * 17 + side) * 110, [210, 8, 210], [0.12, 0.24, 0.15]);
        }
      });

      // ---- Hedgerow-gridded flat farmland + perimeter hedgerows ----
      hedge(0.60, 0.64, -1, 80, 2.6, COPSE);
      hedge(0.60, 0.64,  1, 95, 2.6, COPSE);
      hedge(0.20, 0.28,  1, 105, 2.4, COPSE);
      hedge(0.86, 0.94, -1, 90, 2.4, COPSE);
      hedge(0.08, 0.12,  1, 115, 2.4, COPSE);
      hedge(0.34, 0.38,  1, 110, 2.4, COPSE);
      hedge(0.70, 0.76,  1, 100, 2.4, COPSE);
      hedge(0.76, 0.82, -1, 105, 2.4, COPSE);
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
      forestEdge(0.14, 0.17, -1, 84, { density: 0.8, hMin: 9, hMax: 14, col: COPSE,  col2: COPSE2, pineFrac: 0.1  }); // Chapel/Cheese Copse
      forestEdge(0.61, 0.64,  1, 69, { density: 0.75,hMin: 8, hMax: 13, col: COPSE,  col2: COPSE2, pineFrac: 0.15 }); // Abbey-side copse
      forestEdge(0.69, 0.71, -1, 64, { density: 0.8, hMin: 9, hMax: 13, col: COPSE,  col2: COPSE2, pineFrac: 0.1  }); // Loop infield copse
      forestEdge(0.23, 0.26,  1, 104,{ density: 0.7, hMin: 8, hMax: 12, col: COPSE2, col2: COPSE,  pineFrac: 0.2  }); // Maggotts outfield
      forestEdge(0.44, 0.47, -1, 94, { density: 0.7, hMin: 9, hMax: 13, col: COPSE,  col2: COPSE2, pineFrac: 0.15 }); // Stowe far side
      forestEdge(0.77, 0.80,  1, 89, { density: 0.75,hMin: 8, hMax: 13, col: COPSE,  col2: COPSE2, pineFrac: 0.1  }); // Brooklands outer
      forestEdge(0.89, 0.92, -1, 79, { density: 0.7, hMin: 8, hMax: 12, col: COPSE2, col2: COPSE,  pineFrac: 0.2  }); // Woodcote area
      forestEdge(0.34, 0.36,  1, 114,{ density: 0.65,hMin: 8, hMax: 12, col: COPSE,  col2: COPSE2, pineFrac: 0.2  }); // Stowe outfield copse
      forestEdge(0.57, 0.60, -1, 104,{ density: 0.65,hMin: 9, hMax: 13, col: COPSE,  col2: COPSE2, pineFrac: 0.1  }); // Abbey infield copse
      // sparse scattered broadleaf fringe around the full perimeter (old airfield feel)
      forestEdge(0.0, 1.0, -1, 48, { density: 0.18, hMin: 7, hMax: 11, col: COPSE, col2: COPSE2, pineFrac: 0.25 });
      forestEdge(0.0, 1.0,  1, 48, { density: 0.18, hMin: 7, hMax: 11, col: COPSE, col2: COPSE2, pineFrac: 0.25 });

      // ---- Big grandstands at the signature corners ----
      // Copse corner — large main straight view
      grandstand(0.04,  1, 12, 80,  [0.44, 0.45, 0.50], [0.52, 0.30, 0.28]);
      // Maggotts/Becketts complex
      grandstand(0.12, -1, 14, 60,  [0.44, 0.45, 0.50], [0.48, 0.32, 0.30]);
      // Stowe — large sweeping stand
      grandstand(0.30,  1, 16, 85,  [0.44, 0.45, 0.50], [0.54, 0.28, 0.28]);
      // Club — fast corner seating
      grandstand(0.40,  1, 12, 90,  [0.44, 0.45, 0.50], [0.52, 0.30, 0.28]);
      // The Loop — hairpin seating (both sides)
      grandstand(0.66, -1, 14, 50,  [0.44, 0.45, 0.50], [0.48, 0.32, 0.30]);
      grandstand(0.67,  1, 16, 45,  [0.42, 0.44, 0.48], [0.46, 0.30, 0.28]);
      // Brooklands/Luffield — signature view
      grandstand(0.85, -1, 14, 65,  [0.44, 0.45, 0.50], [0.52, 0.30, 0.28]);
      // Abbey (fast) — wide run-off viewing
      grandstand(0.55,  1, 16, 70,  [0.44, 0.45, 0.50], [0.48, 0.32, 0.30]);
      // Maggotts secondary stand (larger complex)
      grandstand(0.10,  1, 18, 55,  [0.42, 0.44, 0.48], [0.50, 0.30, 0.28]);
      // Chapel corner — fans favourite viewpoint
      grandstand(0.17, -1, 14, 50,  [0.44, 0.45, 0.50], [0.48, 0.32, 0.30]);

      // ---- The Wing building (s≈0.45 R) — Silverstone's long metallic-silver
      // pit/paddock facade. The real Wing is powder-coated steel in Metallic
      // Silver (RAL 9006) + Anthracite Grey (RAL 7016) + Graphite Grey (RAL 2074):
      // a cool silver-grey frontispiece, NOT white masonry. ----
      const WING_SILVER = [0.66, 0.68, 0.72];  // RAL 9006 metallic silver
      const WING_ANTHR  = [0.40, 0.42, 0.46];  // RAL 7016 anthracite grey accent
      const WING_GRAPH  = [0.30, 0.31, 0.34];  // RAL 2074 graphite grey (lower band)
      // Long low silver slab. gap=4, w=20 → dist=14 from centre. Height 11m, length 240m.
      building(k(0.45), 1, 4, 20, 11, 240, {
        wall: WING_SILVER, window: [0.12, 0.16, 0.22], floor: 4 });

      // The undulating aerofoil roofline + cladding bands.
      {
        const a = anchor(k(0.45), 1, 14);
        // dark anthracite lower cladding band (continuous, wrapping the base)
        addBox(out, vadd(a.c, a.u, 2.4), [21, 4.4, 241], WING_ANTHR, [a.r, a.u, a.t]);
        // slim glazing strip just below the roofline — track-facing dark glass
        addBox(out, vadd(a.c, a.u, 7.6), [20, 5.2, 242], [0.10, 0.14, 0.22], [a.r, a.u, a.t]);
        // warm amber lit windows behind the glass (interior band, offset inward)
        addBox(out, vadd(a.c, a.u, 7.7), [18, 4.6, 238], LIT_WIN, [a.r, a.u, a.t]);

        // --- Undulating aerofoil roof: a continuous run of segmented silver
        // blades whose tops rise & fall like a wing, climbing toward the
        // last-corner end where the roof "points to the sky". Each segment is a
        // short box at a wing-profile height; consecutive heights overlap so the
        // silhouette reads as a smooth undulating ridge, not a flat blade. ---
        const SEG = 12, segLen = 240 / SEG;
        for (let i = 0; i < SEG; i++) {
          const t = i / (SEG - 1);
          // base climb toward one end + a sinusoidal undulation (the aerofoil waves)
          const climb = 11.5 + t * 5.5;                       // 11.5 → 17 m base ridge
          const wave  = Math.sin(t * Math.PI * 3.0) * 1.7;     // ±1.7 m undulation
          const topH  = climb + wave;
          const segOff = (i - (SEG - 1) / 2) * segLen;          // centred offset along facade
          // overlap segments slightly (segLen*1.18) for a continuous ridge
          addBox(out, vadd(vadd(a.c, a.t, segOff), a.u, topH - 0.9),
                 [25, 1.8, segLen * 1.18], WING_SILVER, [a.r, a.u, a.t]);
          // thin graphite underside/shadow line just below each blade
          addBox(out, vadd(vadd(a.c, a.t, segOff), a.u, topH - 2.0),
                 [24.2, 0.5, segLen * 1.12], WING_GRAPH, [a.r, a.u, a.t]);
        }
      }

      // Wing grandstand (behind pit building, s≈0.46 R)
      grandstand(0.46, 1, 12, 110, [0.48, 0.50, 0.54], [0.60, 0.24, 0.24]);

      // ---- The Wing: control tower rising from the building roofline (s≈0.44 R) ----
      // Placed at dist=32, anchored cleanly off track — uses tower() composite helper
      {
        const tDist = 32;
        // tower() uses dist as the centre distance (not gap like building)
        const ta = anchor(k(0.44), 1, tDist);
        if (!onTrack(ta.c[0], ta.c[2], 5)) {
          // Tapered shaft: base 6m wide → 4m at top, 26m tall
          addFrustum(out, ta.c, 3.0, 2.0, 26, [0.82, 0.83, 0.86], 8, [ta.r, ta.u, ta.t]);
          // control room glaze cap — dark glazing with emissive cool-blue interior
          addBox(out, vadd(ta.c, ta.u, 26), [5.0, 3.0, 5.0], [0.10, 0.14, 0.20], [ta.r, ta.u, ta.t]);
          addBox(out, vadd(ta.c, ta.u, 27.0), [4.4, 1.8, 4.4], LIT_COOL, [ta.r, ta.u, ta.t]);
          // antenna mast
          addCyl(out, vadd(ta.c, ta.u, 29.0), 0.16, 10, [0.32, 0.32, 0.34], 4, [ta.r, ta.u, ta.t]);
          // red aviation warning light at mast tip
          addCyl(out, vadd(ta.c, ta.u, 38.8), 0.28, 0.5, [0.90, 0.20, 0.20], 6, [ta.r, ta.u, ta.t]);
          // mid-tower emissive band (lit office floor ~13m up)
          addBox(out, vadd(ta.c, ta.u, 13.5), [4.6, 1.2, 4.6], LIT_WIN, [ta.r, ta.u, ta.t]);
        }
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
      {
        const a = anchor(k(0.46), 1, 2.5);
        if (!onTrack(a.c[0], a.c[2], 0.3)) {
          addBox(out, vadd(a.c, a.u, 0.6), [0.6, 1.2, 160], CONC, [a.r, a.u, a.t]);
        }
      }

      // BRDC clubhouse set back (s≈0.48 R) — pale historical building
      building(k(0.48), 1, 28, 22, 9, 20, { wall: [0.76, 0.76, 0.72], window: [0.18, 0.24, 0.30] });

      // ---- Old Pits / International complex (near Woodcote, Old Pit Straight) ----
      // Silverstone's two-paddock identity: the original 1950s-era pit & paddock
      // on the Old Pit Straight, a NEUTRAL-WHITE/concrete contrast to the silver
      // Wing. A low older pit building + a modest period grandstand.
      {
        const OLD_WHITE = [0.84, 0.84, 0.82];   // neutral aged white/concrete
        const OLD_TRIM  = [0.70, 0.70, 0.68];
        // long low original pit building (Old Pit Straight, s≈0.88 R)
        building(k(0.88), 1, 6, 14, 7, 70, { wall: OLD_WHITE, window: [0.22, 0.26, 0.30], floor: 3 });
        // a simple period grandstand opposite, modest size
        grandstand(0.88, 1, 9, 55, [0.62, 0.62, 0.60], [0.40, 0.42, 0.48]);
        // small International race-control box on the old straight
        const oa = anchor(k(0.90), 1, 16);
        if (!onTrack(oa.c[0], oa.c[2], 4)) {
          addBox(out, vadd(oa.c, oa.u, 5), [8, 10, 9], OLD_WHITE, [oa.r, oa.u, oa.t]);
          addBox(out, vadd(oa.c, oa.u, 8.5), [7, 2.2, 8], [0.14, 0.18, 0.24], [oa.r, oa.u, oa.t]); // glaze band
          addBox(out, vadd(oa.c, oa.u, 8.6), [6.2, 1.8, 7.2], LIT_WIN, [oa.r, oa.u, oa.t]);
          void OLD_TRIM;
        }
      }

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
          // crossarm and twin lamp heads
          addBox(out, vadd(la.c, la.u, 11.8), [5.0, 0.28, 0.28], [0.70, 0.72, 0.76], [la.r, la.u, la.t]);
          addBox(out, vadd(vadd(la.c, la.t, -2.2), la.u, 12.0), [1.8, 0.6, 1.0], LIT_WIN, [la.r, la.u, la.t]);
          addBox(out, vadd(vadd(la.c, la.t,  2.2), la.u, 12.0), [1.8, 0.6, 1.0], LIT_WIN, [la.r, la.u, la.t]);
        }
        // Copse corner lamp posts (s 0.02–0.07, right side)
        for (const [sLamp, distLamp] of [[0.03, 8], [0.05, 8], [0.07, 8]]) {
          const la = anchor(k(sLamp), 1, distLamp);
          if (onTrack(la.c[0], la.c[2], 1.2)) continue;
          addCyl(out, la.c, 0.18, 12, [0.72, 0.74, 0.78], 6, [la.r, la.u, la.t]);
          addBox(out, vadd(la.c, la.u, 11.8), [4.5, 0.26, 0.26], [0.70, 0.72, 0.76], [la.r, la.u, la.t]);
          addBox(out, vadd(vadd(la.c, la.t, -2.0), la.u, 12.0), [1.6, 0.5, 0.9], LIT_WIN, [la.r, la.u, la.t]);
          addBox(out, vadd(vadd(la.c, la.t,  2.0), la.u, 12.0), [1.6, 0.5, 0.9], LIT_WIN, [la.r, la.u, la.t]);
        }
      }

      // ---- National pit straight (s≈0.0) garages + pit wall + paddock ----
      building(k(0.97), 1, 6, 12, 8, 90, { wall: [0.82, 0.83, 0.85], window: [0.20, 0.24, 0.28], floor: 4 });
      // paddock support buildings / hospitality units set back behind the pits
      for (const [s, d, w, h, ln, col] of [
        [0.95, 40, 14, 7, 34, [0.76, 0.76, 0.72]],
        [0.99, 44, 16, 6, 30, [0.72, 0.74, 0.76]],
        [0.92, 38, 12, 6, 26, [0.78, 0.77, 0.73]],
      ]) building(k(s), 1, d, w, h, ln, { wall: col, window: [0.28, 0.32, 0.36] });
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
        addPrism(out, vadd(a.c, a.u, 5.1), [14, 2.6, 18], [0.96, 0.97, 0.98], [a.r, a.u, a.t]);
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

      // ---- Start gantry over start/finish ----
      gantry(0.0, 7.5, [0.28, 0.30, 0.34]);

      // ---- Discrete copses + sparse shelterbelt windbreaks (open farmland) ----
      // Silverstone sits on open airfield farmland — NOT a forest. The long
      // continuous windbreak belts are deliberately broken into SHORT, sparse
      // clumps (lower density, narrower fraction spans) so open grass/field gaps
      // show between them. Hedgerows (above) do most of the boundary work; these
      // are occasional conifer/broadleaf farm shelterbelts, not a tree wall.
      forestEdge(0.15, 0.18,  1, 124, { density: 0.24, hMin: 9, hMax: 15, col: PINEG, col2: COPSE2, pineFrac: 0.6 }); // Maggotts right shelterbelt
      forestEdge(0.34, 0.37,  1, 129, { density: 0.24, hMin: 9, hMax: 15, col: PINEG, col2: COPSE2, pineFrac: 0.6 }); // Stowe right shelterbelt
      forestEdge(0.60, 0.63, -1, 119, { density: 0.22, hMin: 9, hMax: 15, col: PINEG, col2: COPSE2, pineFrac: 0.55}); // Abbey/Loop left clump
      forestEdge(0.82, 0.85, -1, 124, { density: 0.24, hMin: 9, hMax: 15, col: PINEG, col2: COPSE2, pineFrac: 0.6 }); // Luffield left clump
      forestEdge(0.06, 0.09, -1, 134, { density: 0.22, hMin: 9, hMax: 14, col: PINEG, col2: COPSE2, pineFrac: 0.55}); // Maggotts far-side clump
      forestEdge(0.46, 0.49,  1, 139, { density: 0.22, hMin: 9, hMax: 14, col: PINEG, col2: COPSE2, pineFrac: 0.6 }); // behind The Wing clump
      // Outer broadleaf copses (the named Silverstone landscape copses — tight clumps)
      forestEdge(0.18, 0.20, -1, 114, { density: 0.3,  hMin: 9, hMax: 14, col: COPSE, col2: COPSE2, pineFrac: 0.15 }); // Maggotts outer copse
      forestEdge(0.50, 0.52,  1, 104, { density: 0.3,  hMin: 9, hMax: 14, col: COPSE, col2: COPSE2, pineFrac: 0.15 }); // Wing outer copse
      forestEdge(0.72, 0.74,  1, 109, { density: 0.28, hMin: 9, hMax: 14, col: COPSE, col2: COPSE2, pineFrac: 0.2  }); // Loop outer copse
      forestEdge(0.62, 0.64, -1, 124, { density: 0.26, hMin: 9, hMax: 13, col: COPSE, col2: COPSE2, pineFrac: 0.15 }); // Abbey outer copse
      forestEdge(0.36, 0.38, -1, 139, { density: 0.26, hMin: 9, hMax: 13, col: COPSE, col2: COPSE2, pineFrac: 0.2  }); // Stowe outer field copse
      forestEdge(0.25, 0.27,  1, 124, { density: 0.26, hMin: 9, hMax: 13, col: COPSE, col2: COPSE2, pineFrac: 0.2  }); // Maggotts outfield copse

      // ---- Low farm sheds / airfield hangars on the flat outfield ----
      for (const [s, side, d, w, h, ln] of [
        [0.22, -1, 150, 22, 6, 30],
        [0.50,  1, 145, 24, 5, 34],
        [0.74,  1, 150, 20, 5, 26],
        [0.08,  1, 165, 20, 5, 28],
        [0.62,  1, 160, 18, 5, 24],
        [0.36, -1, 155, 22, 5, 30],  // extra hangar
        [0.82,  1, 155, 20, 5, 24],  // extra hangar
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

      // silence unused-guard lint helpers (destructured but not called directly)
      void GRASS; void STEEL; void TARMAC; void prop; void WHITE; void tower; void addCone; void bush;
      void mountain; void px; void pz; void pyMin; void along; void pine;
    },
  }
  );
})();
