/* Apex 26 — ZANDVOORT circuit definition (data only).
   Registered on the global TrackDefs list; consumed by the js/track/tracks.js engine
   (palette resolved there from `night`, geometry from js/track/geo-paths.js or `segs`). */
(function () {
  "use strict";
  (window.TrackDefs = window.TrackDefs || []).push(
  {
    id: "zandvoort",
    reverse: false, // direction switched to real-world CW/CCW (was auto-audit reverse:true)
    // Start/finish line. Snapped to the real one: coord 0.4 m off centreline; = trace vertex 0 (timing line).
    // Was 0.3275. That already measured straight (mean |k| 0.00356 over
    // 120 m) — it was on the wrong PART of the lap, not in a corner.
    // See docs/tracks/START-LINES.md.
    startFrac: 0.0000,
    // Scenery / exclusions / boards are racing-from-THIS line (pits at 0,
    // Tarzan runoff ~0.04, Hugenholtz stand 0.135, Luyendyk 0.915 — T14
    // apex is 0.9105). The old start was 0.3275. Naming that as
    // sceneryStartFrac added _sceneryShift and parked the pit complex on
    // the Hunserug/Scheivlak stretch — same class as the bankZones bug
    // that put 19° on those sweeps while Hugenholtz ran flat. Do not
    // re-add it.
    name: "ZANDVOORT",
    gp: "Dutch GP",
    country: "Netherlands",
    night: false,
    theme: "green",
    lengthKm: 4.3,
    baseHW: 7,
    sceneryCoordinates: "racing",
    terrainOuter: 120,
    dressingExclusions: [
      // Keep the seaward dune openings clear so the authored North Sea and sand
      // glimpses remain legible instead of filling with generic trees and lamps.
      { kinds: ["foliage", "lighting"], s0: 0.25, s1: 0.80, side: 1 },
    ],
    // Hugenholtz + Arie Luyendyk: the two steeply banked corners get a raised
    // outer edge. Anchored to CURATED TURN APEXES, not lap fractions: the
    // fractions these were authored at predate the 7a173519 start-line
    // rotation, and compensating them by `_sceneryShift` landed both bowls on
    // the wrong corners — 19° on Scheivlak and 18° on Hunserug, both fast
    // sweeps, while Hugenholtz (28 m left hairpin) and Luyendyk (the final
    // corner) ran dead flat. Turn indices re-resolve through any future remap.
    // Real angles per circuitzandvoort.nl: Hugenholtz is T3 ("after two turns
    // that go right, the third corner goes left"), max 18°; Arie Luyendyk is
    // T14, the last corner, 15-18° / 32% max gradient.
    banked: true,
    bankZones: [
      { turn: 3,  angleDeg: 18, widthM: 140 },  // Hugenholtz banked LEFT hairpin
      { turn: 14, angleDeg: 19, widthM: 140 },  // Arie Luyendyk banked final RIGHT
      // The rest of the lap is not a bowl, but the dune circuit still carries
      // ordinary 3-4° camber — Tarzan most of all.
      { turn: 1,  angleDeg: 4.0, widthM: 200 },  // Tarzan
      { turn: 7,  angleDeg: 3.0, widthM: 110 },  // Hunserug-side sweep
      { turn: 11, angleDeg: 3.5, widthM: 140 },  // Hans Ernst chicane
    ],
    // Zandvoort is one of the narrowest circuits on the calendar and the infield
    // is tighter than the banked corners. s0/s1 are CONTROL-POINT index fractions
    // in SOURCE space; the racing-lap arc each lands on is in the comment.
    hwZones: [
      { s0: 0.7310, s1: 0.8081, hw: 6.0, ease: 0.012 },  // arc 0.395-0.432 infield esses
      { s0: 0.0142, s1: 0.0785, hw: 6.0, ease: 0.012 },  // arc 0.748-0.778 Hans Ernst
      { s0: 0.1745, s1: 0.2287, hw: 6.1, ease: 0.012 },  // arc 0.868-0.898 Kumho
    ],
    pal: { zenith: [0.28, 0.41, 0.60], horizon: [0.82, 0.78, 0.70], grass: [0.42, 0.50, 0.25], runoff: [0.60, 0.52, 0.34], fog: [0.74, 0.73, 0.70], fogDensity: 0.0024, sunDir: [0.5597170785495562, 0.6492718111174852, 0.5149397122655918], sun: [1, 0.94, 0.80], sunColor: [1, 0.9, 0.74] },
    segs: [
      { t: 0, l: 260 }, { t: 75, l: 120, b: 0.16 }, { t: -50, l: 90 }, { t: 130, l: 150, b: 0.3 }, { t: 0, l: 180, h: 8 }, { t: 40, l: 110, h: -8 },
      { t: 60, l: 100 }, { t: -50, l: 90, h: 4 }, { t: 70, l: 90 }, { t: -60, l: 90 }, { t: 90, l: 90 }, { t: -50, l: 90 },
      { t: 50, l: 90 }, { t: 160, l: 160, b: 0.31, w: 8 },
    ],
    elevations: [{ s: 0.56, halfM: 300, rise: 8 }],
    scenery: function (api) {
      const { out, MAT, n, px, py, pz, pyMin, hw, prop, backdrop, groundPlane, seat, track,
              addBox, addCyl, addPrism, addPyramid, addCone, addFrustum, anchor, vadd, onTrack, hash, every,
              along, runoffApron, bowlSeatWall,
              modelGroup, waterSurface, waterBand, groundPatch,
              mountain, peak, bush, hedge, grandstand, grandstandEx, tower, ferrisWheel,
              pine, tree, forestEdge,
              fence, guardrail, tyreWall, billboard, gantry, marshalPost, recordBarrier,
              circuitKit } = api;
      const K = (s) => Math.round(s * n) % n;

      // -----------------------------------------------------------------------
      // Palette constants — coastal North Sea dune landscape
      // -----------------------------------------------------------------------
      const sand      = [0.81, 0.75, 0.58];
      const sandDk    = [0.71, 0.65, 0.48];
      const sandLt    = [0.87, 0.81, 0.64];
      const marramG   = [0.33, 0.49, 0.24];   // marram grass green
      const marramT   = [0.67, 0.63, 0.41];   // marram grass tan
      const seaCol    = [0.18, 0.40, 0.56];   // North Sea blue-grey
      const beachCol  = [0.89, 0.83, 0.66];   // wet-sand beach
      const orange    = [0.96, 0.42, 0.02];   // Verstappen-orange crowd
      // shell/shellLt (two near-identical greys) retired: grandstandEx() now
      // sources each stand's shell colour from a STAND_SETS.zandvoort livery
      // instead (see the GRANDSTANDS block below).
      const fenceCol  = [0.74, 0.76, 0.80];
      const railRW    = [0.86, 0.20, 0.18];   // red/white armco
      const kerbRed   = [0.80, 0.14, 0.14];
      const kerbWht   = [0.92, 0.92, 0.92];
      const saferCol  = [0.76, 0.78, 0.80];   // SAFER foam face
      const gravel    = [0.62, 0.55, 0.42];
      const { bankedKerbStrip } = api;

      // -----------------------------------------------------------------------
      // North Sea horizon — typed water and terrain-conforming beach patches.
      // The old world-space slabs bypassed model diagnostics and could float
      // where the banked terrain ribbon dipped. These helpers keep water in its
      // reflective mesh and settle each sand strip onto the shared surface.
      // -----------------------------------------------------------------------
      // NOTE: left as discrete panels deliberately. waterBand was tried here
      // and is the WRONG tool: a band follows the circuit at a fixed offset, so
      // on a closed loop it draws a channel winding between the dunes rather
      // than an open sea. Bands suit a coastline the track runs ALONG (jeddah,
      // baku, montreal's river); an open sea wants one large plane instead.
      for (const [i, s] of [0.30, 0.38, 0.46, 0.54, 0.62, 0.70, 0.78].entries()) {
        waterSurface(K(s), 1, 310, [150, 0.8, 150], seaCol, {
          id: `north-sea-${i}`,
        });
        groundPatch(K(s), 1, 225, [72, 0.5, 105], beachCol, {
          id: `beach-band-${i}`,
          samples: 6,
        });
      }

      // -----------------------------------------------------------------------
      // DUNE BELT — the dominant visual.  The circuit weaves through the
      // Zandvoort dune belt; mounds should feel close, sandy and textured.
      //
      // Three sparse, broad layers. Dunes are low coastal landforms, not a
      // continuous ring of Alpine pyramids.
      //
      // All use anchor() so they sit on the terrain surface, never float.
      // mountain() baseY = a.c[1] (terrain-anchored ground Y at that lateral dist).
      // -----------------------------------------------------------------------

      // 1. Inner dune mounds — organic, rough, close
      // Mid-lap (Hunserug→Scheivlak) pulls in to 42–68 m so sand reads first;
      // elsewhere stays at the classic 80–110 m belt.
      every(55, (k) => {
        const frac = k / n;
        const midLap = frac >= 0.20 && frac <= 0.58;
        for (const side of [-1, 1]) {
          let dist = midLap
            ? 42 + hash(k * 72 + side) * 26     // 42–68 m — sand-first
            : 80 + hash(k * 72 + side) * 30;    // 80–110 m
          // This outer dune bank faces the nearby 43% foldback. Keep its broad
          // foot skirt behind the local ridge instead of spanning the lower road.
          if (side === 1 && frac >= 0.61 && frac <= 0.67) dist += 56;
          const a = anchor(k, side, dist);
          if (onTrack(a.c[0], a.c[2], 18)) continue;
          const h = (midLap ? 4 : 5) + hash(k * 73 + side) * (midLap ? 7 : 8);
          const w = (midLap ? 34 : 42) + hash(k * 74 + side) * (midLap ? 26 : 34);
          mountain(a.c[0], a.c[2], a.c[1], w, h, {
            seg: 10, seed: k * 13 + side, rough: 0.35, snowline: 2,
            forest: marramT, rock: sandDk, snow: sand,
          });
        }
      });

      // 1b. Extra close sand shoulders on the mid-lap dune weave
      every(42, (k) => {
        const frac = k / n;
        if (frac < 0.22 || frac > 0.56) return;
        for (const side of [-1, 1]) {
          if (hash(k * 88 + side) > 0.30) continue;
          const dist = 42 + hash(k * 89 + side) * 18;
          const a = anchor(k, side, dist);
          const w = 30 + hash(k * 90 + side) * 18;
          const h = 3 + hash(k * 91 + side) * 5;
          mountain(a.c[0], a.c[2], a.c[1], w, h, {
            seg: 10, seed: k * 17 + side, rough: 0.25, snowline: 2,
            forest: marramT, rock: sandDk, snow: sand,
          });
        }
      });

      // 2. Mid dune ridge band — slightly larger, set back further
      every(72, (k) => {
        for (const side of [-1, 1]) {
          const frac = k / n;
          let dist = 120 + hash(k * 81 + side) * 38;  // 120–158 m
          if (side === 1 && frac >= 0.61 && frac <= 0.67) dist += 70;
          const a = anchor(k, side, dist);
          if (onTrack(a.c[0], a.c[2], 18)) continue;
          const w = 58 + hash(k * 83 + side) * 42;
          const h = 8 + hash(k * 82 + side) * 10;
          mountain(a.c[0], a.c[2], a.c[1], w, h, {
            seg: 10, seed: k * 19 + side, rough: 0.28, snowline: 2,
            forest: marramT, rock: sandDk,
            snow: hash(k * 84 + side) < 0.5 ? sand : sandLt,
          });
        }
      });

      // 3. Far backdrop dunes — distant horizon, rooted at pyMin
      every(130, (k) => {
        for (const side of [-1, 1]) {
          const dist = 160 + hash(k * 42 + side) * 100;  // 160–260 m
          const a = anchor(k, side, dist);
          if (onTrack(a.c[0], a.c[2], 16)) continue;
          peak(a.c[0], a.c[2], pyMin, 110 + hash(k * 43 + side) * 70,
               10 + hash(k * 44 + side) * 10, sand);
        }
      });

      // -----------------------------------------------------------------------
      // COASTAL DUTCH PINES — dark conifers in dense clusters on dune slopes.
      // Use forestEdge() which guarantees no barrier clipping and handles
      // canopy-radius clearance automatically.
      // Zandvoort has scattered Scots pine stands on the inland dune backs —
      // mixed with open sand gaps.  pineFrac=0.85 gives mostly pines with some
      // broadleaf scrub.  Density 0.45 → sparse/gappy (authentic dune pine).
      // -----------------------------------------------------------------------
      const pineCol  = [0.16, 0.34, 0.12];   // dark coastal pine
      const pineCol2 = [0.20, 0.38, 0.14];   // slightly lighter broadleaf scrub

      // Inland-side dune pine belt — thinned mid-lap so sand + marram dominate
      forestEdge(0.22, 0.46,  1, 65, { density: 0.28, hMin: 6, hMax: 11,
                                       col: pineCol, col2: pineCol2, pineFrac: 0.88 });
      forestEdge(0.22, 0.46, -1, 52, { density: 0.24, hMin: 5, hMax: 10,
                                       col: pineCol, col2: pineCol2, pineFrac: 0.85 });
      forestEdge(0.56, 0.82,  1, 65, { density: 0.32, hMin: 6, hMax: 12,
                                       col: pineCol, col2: pineCol2, pineFrac: 0.80 });
      forestEdge(0.56, 0.82, -1, 48, { density: 0.26, hMin: 5, hMax: 10,
                                       col: pineCol, col2: pineCol2, pineFrac: 0.82 });
      // Thinner pine fringe on the approaches to the grandstand complex
      forestEdge(0.88, 0.99,  1, 28, { density: 0.28, hMin: 5, hMax: 9,
                                       col: pineCol, col2: pineCol2, pineFrac: 0.75 });

      // -----------------------------------------------------------------------
      // MARRAM GRASS — dense tufts along both verges for continuous dune-grass feel.
      // -----------------------------------------------------------------------
      every(6, (k) => {
        for (const side of [-1, 1]) {
          if (hash(k * 61 + side * 5) > 0.40) continue;   // ~60% density
          const baseX = 10 + hash(k * 62 + side) * 8;     // 10–18 m from verge
          const a = anchor(k, side, baseX);
          if (onTrack(a.c[0], a.c[2], 3)) continue;
          const tuft = hash(k * 63 + side) < 0.5 ? marramG : marramT;
          const b = [a.r, a.u, a.t];
          const cnt = 3 + (hash(k * 64 + side) < 0.4 ? 1 : 0);
          for (let i = 0; i < cnt; i++) {
            const off = (i - (cnt - 1) / 2) * 1.2;
            const h = 1.6 + hash(k * 65 + i + side) * 0.7;
            // addPrism anchors at its BASE (geom.js), so seat the tuft on the
            // sand itself — the old +u*0.6 was written as if the prism were
            // centre-anchored and lifted every tuft 0.6 m clear of the ground.
            addPrism(out, vadd(a.c, a.t, off), [0.7, h, 0.8], tuft, b);
          }
        }
      });

      // -----------------------------------------------------------------------
      // MARRAM HEDGE BANDS — thin clipped dune-grass fringe (sand shows through).
      // Mid-lap hedges are lower + further out so the sand-first read wins.
      // -----------------------------------------------------------------------
      hedge(0.10, 0.22, 1,  26, 1.6, marramT);
      hedge(0.22, 0.55, 1,  32, 1.1, marramT);   // mid-lap thin
      hedge(0.20, 0.58, -1, 28, 1.1, marramG);   // mid-lap thin
      hedge(0.55, 0.85, 1,  26, 1.5, marramG);
      hedge(0.65, 0.98, -1, 22, 1.5, marramT);
      hedge(0.80, 0.95, 1,  28, 1.4, marramG);

      // -----------------------------------------------------------------------
      // BUSH CLUMPS — low dune shrubs between tufts and hedges
      // -----------------------------------------------------------------------
      every(8, (k) => {
        for (const side of [-1, 1]) {
          if (hash(k * 51 + side) > 0.35) continue;   // ~65% density
          bush(k, side, 7 + hash(k * 52 + side) * 12,
               hash(k * 53 + side) < 0.5 ? marramG : marramT);
        }
      });

      // -----------------------------------------------------------------------
      // GRANDSTANDS — Orange Army Verstappen fans; Dutch GP sells out every year.
      // Positions chosen to not cluster (different s fractions, no duplicates).
      // Upgraded from the legacy grandstand() (one grey template, varying only
      // len + shell/shellLt — two near-identical greys) to grandstandEx(), which
      // rotates through STAND_SETS.zandvoort ("orange"/"alu"/"steel") so the
      // permanent main stands, bare-aluminium temporary bleachers and Oranje-
      // liveried decks read as different structures. `crowd` is passed
      // explicitly as `orange` throughout — every seat in the ground is packed
      // with Verstappen fans regardless of the stand's own material, so only
      // the structure varies, never the crowd tint.
      // -----------------------------------------------------------------------
      // MODULAR DUNE DECK — the form grandstandEx structurally cannot make.
      // Two thirds of Zandvoort's capacity is trucked in and bolted together for
      // the weekend: a Nussli-style steel frame standing straight on the sand,
      // seat decks clipped onto it, and NOTHING behind or above — no shell, no
      // roof, open lattice you can see the dune through. grandstandEx always
      // emits a 10 m back shell and (bar roof:"none") a slab, so every stand it
      // makes reads permanent. These read exactly as temporary, which is what
      // separates a dune circuit from a Tilke campus.
      const duneDeck = (id, s, side, gap, bays, opts) => {
        opts = opts || {};
        const rows = opts.rows || 7, pitch = 6.0, len = bays * pitch;
        const a = anchor(K(s), side, gap + 4), b = [a.r, a.u, a.t];
        const IN = -side;                       // +1 along a.r points at the track
        const topH = 1.4 + rows * 1.32;
        // Keep the front-face exclusion the grandstandEx call here used to
        // register, so the dune belt and marram bands still stop short of it.
        const half = (len / 2) / track.total;
        recordBarrier(s - half, s + half, side, gap);
        modelGroup(id, {
          center: vadd(a.c, a.u, topH * 0.55),
          size: [14, topH + 4.5, len + 3],
          basis: b,
        }, (stage) => {
          const TUBE = [0.62, 0.64, 0.67], DECK = [0.55, 0.57, 0.60];
          // Bolted frame: uprights at every bay line, plus one diagonal per bay.
          stage._mat = MAT.METAL;
          for (let i = 0; i <= bays; i++) {
            const p = vadd(a.c, a.t, (i - bays / 2) * pitch);
            seat.cyl(stage, vadd(p, a.r, IN * -4.2), 0.16, topH, TUBE, 6, b);
            seat.cyl(stage, vadd(p, a.r, IN * 0.2), 0.16, topH * 0.72, TUBE, 6, b);
            seat.cyl(stage, vadd(p, a.r, IN * 4.2), 0.16, topH * 0.34, TUBE, 6, b);
            addBox(stage, vadd(vadd(p, a.r, IN * -2), a.u, topH * 0.5),
              [4.8, 0.12, 0.12], TUBE, b);
            addBox(stage, vadd(vadd(p, a.r, IN * 2), a.u, topH * 0.26),
              [4.8, 0.12, 0.12], TUBE, b);
          }
          for (let t = 0; t < rows; t++) {
            const lat = IN * (4.0 - t * 1.25), y = 1.1 + t * 1.32;
            // Deck plate + the bright plastic seat bank clipped onto it. Seat
            // rows stay orange whatever the frame is: the Oranje army is the
            // constant at this circuit, the structure under it is not.
            stage._mat = MAT.METAL;
            seat.box(stage, vadd(vadd(a.c, a.r, lat), a.u, y), [1.3, 0.16, len], DECK, b);
            stage._mat = MAT.FABRIC;
            seat.box(stage, vadd(vadd(a.c, a.r, lat), a.u, y + 0.16),
              [1.0, 0.55, len - 1.2], orange, b);
            for (let j = 0; j * 0.95 < len - 2.5; j++) {
              const h2 = hash(K(s) * 13 + t * 71 + j * 23);
              if (h2 < 0.34) continue;
              seat.box(stage, vadd(vadd(vadd(a.c, a.r, lat), a.t, -len / 2 + 1.2 + j * 0.95),
                a.u, y + 0.71), [0.55, 0.95, 0.45],
                h2 > 0.72 ? orange : (h2 > 0.5 ? [0.94, 0.90, 0.82] : [0.20, 0.22, 0.28]), b);
            }
          }
          // Printed vinyl fascia across the front of the frame — the one solid
          // face on the whole structure, and where the sponsor branding lives.
          stage._mat = MAT.FABRIC;
          addBox(stage, vadd(vadd(a.c, a.r, IN * 4.4), a.u, 0.9),
            [0.12, 1.8, len], opts.fascia || [0.94, 0.92, 0.88], b);
          // Bolt-on stair tower at one end — always visible on a modular build.
          stage._mat = MAT.METAL;
          const st = vadd(vadd(a.c, a.t, len / 2 + 1.2), a.r, IN * -2.5);
          for (const off of [-1.3, 1.3])
            seat.cyl(stage, vadd(st, a.t, off), 0.14, topH, TUBE, 5, b);
          for (let f2 = 0; f2 < rows; f2++)
            addBox(stage, vadd(st, a.u, 1.1 + f2 * 1.32), [2.6, 0.1, 2.6], DECK, b);
          stage._mat = 0;
        });
      };

      grandstandEx(0.01,  1,  16, 36, null, orange,
        { livery: "steel", tiers: 2, roof: "cantilever", suites: true, endWalls: true, pylons: true }); // main pit straight R (largest, permanent grandstand)
      duneDeck("zandvoort-deck-tarzan", 0.05, 1, 14, 5,
        { rows: 7, fascia: [0.96, 0.42, 0.02] });   // Tarzan hairpin R
      grandstandEx(0.09, -1,  14, 26, null, orange,
        { livery: "orange", roof: "flat" }); // Tarzan exit L
      grandstandEx(0.135,-1,  28, 40, null, orange,
        { livery: "steel", tiers: 2, roof: "cantilever", endWalls: true }); // Hugenholtz banked L (gap 22→28: steeply banked, roof must clear)
      duneDeck("zandvoort-deck-hugenholtz", 0.18, 1, 16, 5,
        { rows: 6, fascia: [0.92, 0.90, 0.86] });   // Hugenholtz exit R
      grandstandEx(0.48, -1,  28, 34, null, orange,
        { livery: "orange", roof: "truss" }); // Scheivlak approach L (gap was 28 in previous pass)
      // Scheivlak R — trucked into the dune for the weekend, so it gets the bare
      // aluminium family and NO roof. Zandvoort's permanent concrete is confined
      // to the pit straight and the two banked corners; everything out in the
      // dunes is scaffold and modular seating, and a cantilever slab here was
      // the single detail making the mid-lap read like a permanent autodrome.
      grandstandEx(0.53,  1,  18, 28, null, orange,
        { livery: "alu", roof: "none", endWalls: true });
      // Masterbocht — previously the emptiest stretch of the lap (no stand of
      // any kind between Scheivlak and the Hans Ernst arena). A modern two-tier
      // stand fills the gap and gives the mid-lap sweep a spectator presence.
      grandstandEx(0.60, -1,  16, 44, null, orange,
        { livery: "steel", tiers: 2, roof: "cantilever", endWalls: true, pylons: true }); // Masterbocht L
      grandstandEx(0.865, 1,  42, 36, null, orange,
        { livery: "alu", roof: "none" }); // Luyendyk approach R (gap 36→42: banked corner clearance) — uncovered temporary bleacher
      grandstandEx(0.915, 1,  28, 80, null, orange,
        { livery: "orange", tiers: 2, roof: "cantilever", suites: true, endWalls: true, pylons: true }); // Arie Luyendyk banked R (massive) (gap 22→28: VERY banked, roof overhang)
      // Luyendyk exit R — the bolt-on extension to the banked stand next door.
      // A flat deck roof on scaffold, not the neighbour's cantilever: reading as
      // an ADDITION to the big stand is what makes the big stand look permanent.
      grandstandEx(0.96,  1,  28, 32, null, orange,
        { livery: "scaffold", roof: "flat", pylons: true }); // (gap 22→28: post-banked transition)
      duneDeck("zandvoort-deck-pitstraight", 0.97, -1, 22, 5,
        { rows: 6, fascia: [0.16, 0.20, 0.34] });   // pit straight L

      // -----------------------------------------------------------------------
      // HERO-SECTOR COASTAL SPECTACLE — five bounded, track-specific layers.
      // Keep the fast dune weave open at eye level: crowds sit on the outside
      // bowls, clubs remain behind the crest, and surf stays on the far beach.
      // -----------------------------------------------------------------------

      // 1. Orange Army dune bowls at the Scheivlak approach and the run toward
      // Kumho. Low shells read as spectator-covered dune banks without adding
      // roofs that would hide the banking or the next apex.
      bowlSeatWall(0.405, 0.445, -1, 22, {
        h: 5.5, thick: 2.2, shell: sandDk, step: 9,
        crowdCols: [orange, [1.00, 0.58, 0.08], [0.88, 0.24, 0.02]],
      });
      // THE ARENA — Hans Ernst chicane (racing frac ~0.735-0.78). In reality
      // this is a facing bowl: continuous stands enclosing BOTH sides of the
      // chicane (the Dutch GP's signature broadcast shot). Only the L wall
      // existed here previously, so the section read as one open grandstand
      // rather than an enclosed arena — the single highest-value fix in this
      // pass. Mirror the same wall onto the R side, same span/height/step, so
      // the two read as one facing bowl instead of a stand on an empty apron.
      bowlSeatWall(0.735, 0.775, -1, 24, {
        h: 5.0, thick: 2.0, shell: sand, step: 9,
        crowdCols: [orange, [1.00, 0.64, 0.10], [0.82, 0.20, 0.02]],
      });
      bowlSeatWall(0.735, 0.775, 1, 24, {
        h: 5.0, thick: 2.0, shell: sand, step: 9,
        crowdCols: [orange, [1.00, 0.64, 0.10], [0.82, 0.20, 0.02]],
      });

      // 2. Two compact beach-club terraces behind the seaward dune crest.
      // Each terrace is one guarded atomic model: boardwalk, low clubhouse,
      // windbreak and parasols all disappear together if the footprint is unsafe.
      for (const [idx, s, dist] of [[0, 0.34, 112], [1, 0.675, 118]]) {
        const a = anchor(K(s), 1, dist), b = [a.r, a.u, a.t];
        modelGroup(`zandvoort-beach-terrace-${idx}`, {
          center: vadd(a.c, a.u, 4.5),
          size: [30, 10, 38],
          basis: b,
        }, (stage) => {
          stage._mat = MAT.WOOD;
          addBox(stage, vadd(a.c, a.u, 0.45), [28, 0.9, 36], [0.66, 0.52, 0.34], b);
          stage._mat = MAT.CONCRETE;
          addBox(stage, vadd(vadd(a.c, a.r, 5), a.u, 2.6),
                 [14, 4.4, 18], [0.91, 0.89, 0.82], b);
          stage._mat = MAT.GLASS;
          addBox(stage, vadd(vadd(vadd(a.c, a.r, -2.2), a.u, 2.8), a.t, 0),
                 [0.5, 2.4, 14], [0.30, 0.53, 0.63], b);
          stage._mat = MAT.ROOF;
          addPrism(stage, vadd(vadd(a.c, a.r, 5), a.u, 4.8),
                   [14.8, 1.8, 19], idx ? [0.88, 0.40, 0.18] : [0.20, 0.48, 0.65], b);
          for (const off of [-12, 0, 12]) {
            stage._mat = MAT.METAL;
            addCyl(stage, vadd(vadd(a.c, a.t, off), a.u, 0.8),
                   0.10, 3.8, [0.48, 0.48, 0.46], 5, b);
            stage._mat = MAT.FABRIC;
            addCone(stage, vadd(vadd(a.c, a.t, off), a.u, 4.6),
                    3.2, 1.0, off === 0 ? orange : [0.94, 0.90, 0.72], 8, b);
          }
        });
      }

      // 3. Orange fan camps on two inland dune shoulders. Tents and flag poles
      // are enclosed by a conservative footprint and kept well behind barriers.
      for (const [idx, s, side] of [[0, 0.205, -1], [1, 0.815, -1]]) {
        const a = anchor(K(s), side, 44), b = [a.r, a.u, a.t];
        modelGroup(`zandvoort-orange-camp-${idx}`, {
          center: vadd(a.c, a.u, 3.5),
          size: [25, 8, 34],
          basis: b,
        }, (stage) => {
          for (let i = -2; i <= 2; i++) {
            const p = vadd(vadd(a.c, a.t, i * 6), a.r, (i & 1) ? 3 : -2);
            stage._mat = MAT.FABRIC;
            addPrism(stage, vadd(p, a.u, 1.4), [4.4, 2.8, 4.8],
                     i % 2 ? [0.94, 0.91, 0.82] : orange, b);
          }
          for (const off of [-13, 13]) {
            stage._mat = MAT.METAL;
            addCyl(stage, vadd(vadd(a.c, a.t, off), a.u, 0.5),
                   0.09, 6.0, [0.34, 0.34, 0.36], 5, b);
            stage._mat = MAT.FABRIC;
            addBox(stage, vadd(vadd(vadd(a.c, a.t, off), a.u, 5.6), a.r, -side * 0.8),
                   [0.12, 1.6, 2.4], orange, b);
          }
        });
      }

      // 4. Windswept crest vegetation: sparse Scots pine sentinels and marram
      // scrub define the inland dune backs while preserving open sand windows.
      for (const [s0, s1, side] of [[0.255, 0.365, -1], [0.615, 0.745, -1]]) {
        along(s0, s1, 34, (k) => {
          const seed = k * 137 + side;
          bush(k, side, 30 + hash(seed) * 7,
               hash(seed + 1) < 0.5 ? marramG : marramT);
          if (hash(seed + 2) < 0.46)
            pine(k, side, 42 + hash(seed + 3) * 8,
                 6.5 + hash(seed + 4) * 2.5, pineCol);
        });
      }

      // 5. North Sea surf lines between the beach patches and reflective water.
      // Thin, far-off guarded strips create wind-whipped white breakers at speed.
      for (const [idx, s] of [0.31, 0.43, 0.56, 0.69].entries()) {
        const a = anchor(K(s), 1, 258), b = [a.r, a.u, a.t];
        modelGroup(`zandvoort-surf-${idx}`, {
          center: vadd(a.c, a.u, 0.25),
          size: [48, 1.0, 7],
          basis: b,
        }, (stage) => {
          stage._mat = MAT.FLAT;
          addBox(stage, vadd(a.c, a.u, 0.20), [46, 0.35, 2.2], [0.86, 0.91, 0.91], b);
          addBox(stage, vadd(vadd(a.c, a.u, 0.12), a.r, 4.5),
                 [38, 0.22, 1.2], [0.72, 0.84, 0.87], b);
        });
      }

      // -----------------------------------------------------------------------
      // PIT BUILDING — deliberately MODEST. Zandvoort's is the smallest pit
      // complex on the calendar: a two-storey block barely taller than the
      // grandstand opposite, with the dune sitting right behind it. The details
      // that make it Zandvoort rather than Anygarage are the anthracite door
      // rhythm, the cantilevered timing/race-control box perched at the Tarzan
      // end (the only thing on the building that rises above the roof line) and
      // the brick-red plinth course the whole thing sits on.
      // -----------------------------------------------------------------------
      (() => {
        const a = anchor(K(0.00), -1, 12), b = [a.r, a.u, a.t];
        modelGroup("pit-building", {
          center: vadd(a.c, a.u, 4.6),
          size: [11, 12, 67],
          basis: b,
        }, (stage) => {
          stage._mat = MAT.STONE;
          addBox(stage, vadd(a.c, a.u, 0.45), [7.6, 0.9, 64.6], [0.52, 0.32, 0.26], b);
          stage._mat = MAT.CONCRETE;
          addBox(stage, vadd(a.c, a.u, 3.4), [7, 5.2, 64], [0.86, 0.87, 0.90], b);
          for (let i = -3; i <= 3; i++)
            addBox(stage, vadd(vadd(a.c, a.u, 3), a.t, i * 8),
                   [7.4, 4, 1.2], [0.30, 0.32, 0.36], b);
          stage._mat = MAT.METAL;
          addBox(stage, vadd(a.c, a.u, 6.3), [8.5, 0.5, 66], [0.80, 0.81, 0.84], b);
          // Race control / timing box — cantilevered over the pit lane at the
          // Tarzan end, glazed on the trackside face.
          const rc = vadd(vadd(a.c, a.t, 26), a.r, 1.6);
          stage._mat = MAT.CONCRETE;
          addBox(stage, vadd(rc, a.u, 8.2), [9.5, 3.4, 12], [0.90, 0.91, 0.93], b);
          stage._mat = 0;
          addBox(stage, vadd(vadd(rc, a.r, -4.7), a.u, 8.4), [0.25, 2.2, 11], [0.30, 0.53, 0.63], b);
          stage._mat = MAT.METAL;
          addBox(stage, vadd(rc, a.u, 10.1), [10.4, 0.4, 13], [0.78, 0.79, 0.82], b);
          for (const off of [-5, 5])
            addCyl(stage, vadd(vadd(vadd(rc, a.t, off), a.r, -4.2), a.u, 0.2), 0.2, 6.4,
                   [0.46, 0.48, 0.52], 6, b);
          stage._mat = 0;
        }, { required: true });
      })();

      // -----------------------------------------------------------------------
      // PADDOCK CLUB — 2020-21 rebuild. Zandvoort's return to the calendar
      // rebuilt the pit complex with a full paddock-club/hospitality block
      // behind the garages; the hand-built pit-building box above alone was
      // under-scaled against the real venue. Set well back beyond the garage
      // roofline so the two read as one enlarged complex, not a single slab.
      // -----------------------------------------------------------------------
      if (circuitKit) {
        circuitKit.hospitality({
          id: "kit:zandvoort:paddock-club", frac: 0.005, side: -1, gap: 30,
          size: [16, 9, 56], modules: 6, required: true,
        });
      }

      // -----------------------------------------------------------------------
      // ── THE RACE FESTIVAL: BIG WHEEL + FANZONE STAGE ─────────────────────
      // The Dutch GP is not a race weekend with entertainment attached, it is
      // a festival that happens to contain a race — dutchgp.com, F1.com and
      // visitzandvoort.com all lead with it. Two things carry that on sight
      // and the circuit had neither: the Ferris wheel, and the Fanzone Main
      // Stage where the DJ sets run between sessions. Both sit behind the
      // paddock side, so they read on the main-straight skyline above the
      // (deliberately modest) pit building without crowding it.
      // NO FERRIS WHEEL, deliberately. The Dutch GP does have one and it was
      // modelled here, but the shared ferrisWheel() emitter carries coplanar
      // geometry of its own: adding it took zandvoort from 3 same-facing
      // coplanar spots to 4 (and from 3 pairs to 15), and moving or resizing it
      // does not help because the fight is internal to the emitter. Fixing that
      // means changing a shared emitter used by Suzuka, Vegas and Montreal,
      // which is not a change to make from a circuit file. The Fanzone stage
      // below carries the festival read on its own.
      {
        const a = anchor(K(0.062), -1, 104), b = [a.r, a.u, a.t];
        const ORANJE = [0.96, 0.46, 0.06];
        const DARK   = [0.13, 0.13, 0.16];
        const TRUSS  = [0.72, 0.73, 0.76];
        modelGroup("zandvoort-fanzone-stage", {
          center: vadd(a.c, a.u, 9), size: [34, 22, 40], basis: b,
        }, (stage) => {
          // Deck, back wall and the LED screen that is the stage's real face.
          addBox(stage, vadd(a.c, a.u, 1.1), [16, 2.2, 30], DARK, b);
          addBox(stage, vadd(vadd(a.c, a.r, -7.4), a.u, 8.0), [1.6, 14, 30], DARK, b);
          addBox(stage, vadd(vadd(a.c, a.r, -6.4), a.u, 8.6), [0.5, 8.6, 22],
                 [0.30, 0.52, 0.86], b);
          // Truss roof on four legs — a festival stage is a box of scaffolding
          // with a roof, and the exposed truss is the whole silhouette.
          stage._mat = MAT.METAL;
          for (const [dr, dt] of [[-7.0, -14], [7.0, -14], [-7.0, 14], [7.0, 14]]) {
            addCyl(stage, vadd(vadd(a.c, a.r, dr), a.t, dt), 0.34, 15.5, TRUSS, 5, b);
          }
          for (let i = 0; i < 7; i++) {
            addBox(stage, vadd(vadd(a.c, a.t, (i - 3) * 4.7), a.u, 15.2),
                   [15.5, 0.42, 0.42], TRUSS, b);
          }
          addBox(stage, vadd(a.c, a.u, 16.0), [17, 0.5, 31], DARK, b);
          // PA stacks flanking the deck, and a lighting bar of orange cans.
          for (const dt of [-12.5, 12.5]) {
            for (let j = 0; j < 4; j++) {
              addBox(stage, vadd(vadd(a.c, a.t, dt), a.u, 4.0 + j * 1.7),
                     [2.0, 1.5, 2.8], [0.07, 0.07, 0.09], b);
            }
          }
          for (let i = 0; i < 9; i++) {
            addBox(stage, vadd(vadd(a.c, a.t, (i - 4) * 3.3), a.u, 13.4),
                   [0.7, 0.9, 0.7], i % 2 ? ORANJE : [0.95, 0.92, 0.86], b);
          }
          stage._mat = 0;
          // The crowd in front of it. Zandvoort's crowd is the most monochrome
          // in F1 — this is deliberately ONE colour, not a speckle.
          stage._mat = MAT.FABRIC;
          for (let r = 0; r < 7; r++) {
            for (let c = 0; c < 20; c++) {
              const hv = hash(r * 37 + c * 13);
              if (hv > 0.88) continue;
              addBox(stage, vadd(vadd(vadd(a.c, a.r, 6 + r * 2.6),
                                       a.t, (c - 9.5) * 1.7 + (hv - 0.5)), a.u, 0.9),
                     [0.7, 1.8, 0.6],
                     hv > 0.80 ? [0.95, 0.93, 0.88] : ORANJE, b);
            }
          }
          stage._mat = 0;
        });
      }

      // WIND TURBINES — seaward horizon landmark (North Sea wind farm silhouette).
      // Fixed: blades are built in track-right (a.r) and track-up (a.u) space
      // so they orbit the shaft axis correctly and don't lean into the ground.
      // -----------------------------------------------------------------------
      for (const s of [0.20, 0.34, 0.50, 0.62, 0.78]) {
        const k = K(s), a = anchor(k, 1, 300);
        if (onTrack(a.c[0], a.c[2], 60)) continue;
        tower(k, 1, 300, 7, 80, { col: [0.92, 0.92, 0.94], seg: 8 });   // white pole
        const hubPt = vadd(a.c, a.u, 80);                               // nacelle centre
        const b = [a.r, a.u, a.t];
        addCyl(out, vadd(hubPt, a.u, -1.2), 1.2, 2.4, [0.90, 0.90, 0.92], 6, b);  // nacelle
        // Three blades — each offset from hub in the (a.r, a.t) plane
        // (perpendicular to the tower shaft a.u), so they sit flat and don't clip ground
        for (let j = 0; j < 3; j++) {
          const ang = j * 2.0944;            // 0°, 120°, 240°
          const cs = Math.cos(ang), sn = Math.sin(ang);
          // Blade radiates from the hub in the ROTOR plane (track-right × up),
          // so the rotor reads edge-on from the road like a real turbine.
          const bldR = [a.r[0] * cs + a.u[0] * sn,
                        a.r[1] * cs + a.u[1] * sn,
                        a.r[2] * cs + a.u[2] * sn];
          const perp = [a.u[0] * cs - a.r[0] * sn,
                        a.u[1] * cs - a.r[1] * sn,
                        a.u[2] * cs - a.r[2] * sn];
          // blade center is 15m out from hub in blade direction
          const bldC = [hubPt[0] + bldR[0] * 15,
                        hubPt[1] + bldR[1] * 15,
                        hubPt[2] + bldR[2] * 15];
          // The 30 m span runs ALONG the blade, so each blade meets the nacelle.
          // As [2, 30, 1.5] the span sat on the basis' UP axis instead: a 30 m
          // vertical slab hanging 15 m out from the hub, attached to nothing —
          // nine of them, 65 m above the dunes.
          addBox(out, bldC, [30, 2, 1.5], [0.94, 0.94, 0.96], [bldR, perp, a.t]);
        }
      }

      // -----------------------------------------------------------------------
      // BEACH HUTS — pastel rows clustered at the seaward dune face (s≈0.3–0.7).
      // -----------------------------------------------------------------------
      every(40, (k) => {
        const lapFrac = k / n;
        const sideProb = lapFrac > 0.3 && lapFrac < 0.7 ? 0.7 : 0.3;
        const side = hash(k * 8) < sideProb ? 1 : -1;
        const dist = 140 + hash(k * 7) * 35;     // 140–175 m from verge
        const a = anchor(k, side, dist);
        if (onTrack(a.c[0], a.c[2], 16)) return;
        const cols = [[0.88, 0.26, 0.18], [0.18, 0.48, 0.72],
                      [0.92, 0.87, 0.28], [0.20, 0.62, 0.38]];
        const b = [a.r, a.u, a.t];
        const hutH = 4.2;
        const hutCount = 2 + Math.floor(hash(k * 10) * 2.5);
        for (let i = 0; i < hutCount; i++) {
          const hutCol = cols[Math.floor(hash(k * 9 + i * 3) * 4) % 4];
          const offset = (i - (hutCount - 1) / 2) * 7.5;
          // Center at a.c + u*(hutH/2) so base = a.c[1], no floating
          addBox(out, vadd(vadd(a.c, a.u, hutH / 2), a.t, offset),
                 [5.5, hutH, 5.5], hutCol, b);
          // A-frame roof prism on top of each hut. addPrism anchors at its BASE,
          // so the extra half-height floated every roof 0.8 m over its hut.
          addPrism(out, vadd(vadd(a.c, a.u, hutH), a.t, offset),
                   [5.8, 1.6, 5.8], [0.72, 0.34, 0.18], b);
        }
      });

      // -----------------------------------------------------------------------
      // SEA GLIMPSE SLIVERS — intermittent North Sea peeks over seaward dune crests.
      // Placed in gaps between closer mid-lap dunes so blue flashes through at speed.
      // -----------------------------------------------------------------------
      for (const [s, dist, w, h] of [
        [0.26, 132, 42, 2.2],
        [0.32, 148, 50, 2.6],
        [0.38, 138, 46, 2.4],
        [0.44, 155, 52, 2.8],
        [0.51, 142, 44, 2.2],
        [0.58, 160, 48, 2.5],
        [0.66, 150, 50, 2.6],
        [0.72, 145, 46, 2.3],
        [0.79, 165, 48, 2.4],
      ]) {
        const a = anchor(K(s), 1, dist);
        if (onTrack(a.c[0], a.c[2], 18)) continue;
        // Slightly raised so the patch peeks over the crest silhouette
        addBox(out, vadd(a.c, a.u, h * 0.45), [w, h, w * 0.65], seaCol, [a.r, a.u, a.t]);
      }
      // Two reflective water peeks (groundPlane) for stronger coastal silhouette beats
      groundPlane(K(0.40), 1, 175, [70, 1.0, 55], seaCol, true);
      groundPlane(K(0.70), 1, 185, [65, 1.0, 50], seaCol, true);

      // -----------------------------------------------------------------------
      // GRAVEL APRONS — tan runoff at Tarzan + Scheivlak (sand-first mid-lap beat)
      // -----------------------------------------------------------------------
      runoffApron(K(0.040),  1, 4.5, [16, 0.32, 28], gravel);  // Tarzan outer
      runoffApron(K(0.055), -1, 5.0, [14, 0.32, 22], gravel);  // Tarzan exit
      runoffApron(K(0.490), -1, 5.0, [18, 0.32, 30], gravel);  // Scheivlak approach
      runoffApron(K(0.520),  1, 5.5, [16, 0.32, 28], gravel);  // Scheivlak outer
      runoffApron(K(0.535), -1, 5.0, [14, 0.32, 24], gravel);  // Scheivlak exit

      // -----------------------------------------------------------------------
      // BANKED-CORNER VISUAL KIT — Hugenholtz (L) + Arie Luyendyk (R)
      // -----------------------------------------------------------------------
      bankedKerbStrip(0.115, 0.185, -1, { saferGap: 7.2, kerbRed, kerbWht, saferCol });
      bankedKerbStrip(0.120, 0.175,  1, { safer: false, kerbRed, kerbWht });
      bankedKerbStrip(0.885, 0.955,  1, { saferGap: 7.5, kerbRed, kerbWht, saferCol });
      bankedKerbStrip(0.890, 0.950, -1, { safer: false, kerbRed, kerbWht });

      // -----------------------------------------------------------------------
      // TRACK BARRIERS & FURNITURE
      // -----------------------------------------------------------------------

      // Catch / debris fencing in front of grandstands
      fence(0.00, 0.10, 1,  8.0, 4.2, fenceCol);
      fence(0.04, 0.09, -1, 8.0, 4.2, fenceCol);
      fence(0.11, 0.19, -1, 8.0, 4.2, fenceCol);
      fence(0.15, 0.19, 1,  8.0, 4.0, fenceCol);
      fence(0.48, 0.54, -1, 9.0, 4.0, fenceCol);
      fence(0.86, 0.99, 1,  8.0, 4.4, fenceCol);
      fence(0.94, 1.00, -1, 8.0, 4.2, fenceCol);
      recordBarrier(0.00, 0.10, 1, 8.0);
      recordBarrier(0.04, 0.09, -1, 8.0);
      recordBarrier(0.11, 0.19, -1, 8.0);
      recordBarrier(0.15, 0.19, 1, 8.0);
      recordBarrier(0.48, 0.54, -1, 9.0);
      recordBarrier(0.86, 0.99, 1, 8.0);
      recordBarrier(0.94, 1.00, -1, 8.0);

      // Steel armco guardrail on fast dune stretches
      guardrail(0.21, 0.33, 1,  5.0, railRW);
      guardrail(0.22, 0.31, -1, 5.0, [0.85, 0.86, 0.88]);
      guardrail(0.36, 0.47, 1,  6.0, [0.85, 0.86, 0.88]);
      guardrail(0.57, 0.66, -1, 5.0, railRW);
      guardrail(0.68, 0.80, 1,  5.0, [0.85, 0.86, 0.88]);
      guardrail(0.80, 0.86, -1, 5.0, railRW);

      // Tyre walls at corner exits (Tarzan, Hugenholtz, Scheivlak, Luyendyk)
      tyreWall(0.025, 0.065, 1,  4.6, [0.88, 0.42, 0.06]);
      tyreWall(0.125, 0.18,  -1, 4.8, [0.30, 0.30, 0.32]);
      tyreWall(0.48,  0.54,  -1, 5.2, [0.18, 0.40, 0.65]);
      tyreWall(0.90,  0.96,  1,  5.0, [0.86, 0.38, 0.04]);

      // Billboards / advertising hoardings
      const adCols = [[0.90, 0.20, 0.10], [0.10, 0.45, 0.75], [0.95, 0.55, 0.08],
                      [0.92, 0.86, 0.20], [0.20, 0.55, 0.35]];
      let adI = 0;
      every(110, (k) => {
        for (const side of [-1, 1]) {
          const a = anchor(k, side, 16);
          if (onTrack(a.c[0], a.c[2], 9)) continue;
          // Reverted to original gap=24 (the billboard-looking intrusions were actually beach pavilions)
          billboard(k, side, 24, 12, 4, adCols[(adI++) % adCols.length]);
        }
      });

      // Marshal posts
      for (const s of [0.05, 0.16, 0.29, 0.42, 0.55, 0.66, 0.79, 0.93]) {
        const side = hash(K(s) * 31) < 0.5 ? -1 : 1;
        marshalPost(K(s), side, 6.5);
      }

      // Start / finish and scoring gantries
      gantry(0.005, 7.5, [0.12, 0.13, 0.16]);
      gantry(0.99,  6.5, [0.14, 0.14, 0.18]);

      // -----------------------------------------------------------------------
      // VERSTAPPEN-ORANGE BUNTING — bright capsules on major grandstand fronts
      // -----------------------------------------------------------------------
      // Bunting hangs on the PERMANENT stands only — the modular decks that
      // replaced the 0.97 and 0.05 stands have no structure to string it from.
      for (const [s, side, buntDist] of [[0.01, 1, 16], [0.135, -1, 28], [0.915, 1, 28], [0.60, -1, 16]]) {
        const a = anchor(K(s), side, buntDist);
        if (onTrack(a.c[0], a.c[2], 6)) continue;
        const b = [a.r, a.u, a.t];
        const buntingCol = [0.96, 0.40, 0.02];
        const poleCol = [0.30, 0.31, 0.34];
        // Bunting HANGS from something. The capsules alone were 11 pennants a
        // side floating 6–9 m up in front of the stand, so string them on two
        // cables carried by a pole at each end of the run (±24.5 m along t,
        // just past the outermost capsule at ±22.5).
        for (const e of [-1, 1])
          addBox(out, vadd(vadd(a.c, a.u, 5.2), a.t, e * 24.5), [0.3, 10.4, 0.3], poleCol, b);
        for (const cableY of [7.9, 10.3])
          addBox(out, vadd(a.c, a.u, cableY), [0.14, 0.14, 49], poleCol, b);
        for (let i = -5; i <= 5; i++)
          addBox(out, vadd(vadd(a.c, a.u, 7.2), a.t, i * 4.5),
                 [0.7, 1.4, 2.6], buntingCol, b);
        for (let i = -5; i <= 5; i++)
          addBox(out, vadd(vadd(a.c, a.u, 9.6), a.t, i * 4.5),
                 [0.7, 1.4, 2.6], buntingCol, b);
      }

      // -----------------------------------------------------------------------
      // LAMP POSTS — circuit-perimeter lighting for night-readiness.
      // Placed every 35m around the full lap, both sides; clear of fences/stands.
      // Post: a slim cylinder.  Head: a warm-white floodlight box angled outward.
      // Emissive warm-white [1, 0.96, 0.82] reads as lit even in day context and
      // glows strongly at night.  Gap of 8m keeps posts outside barriers.
      // -----------------------------------------------------------------------
      {
        const lampCol   = [0.28, 0.28, 0.32];   // dark grey pole
        const lightHead = [1.00, 0.96, 0.82];   // warm-white luminaire (emissive)
        const armCol    = [0.32, 0.32, 0.36];
        every(35, (k) => {
          for (const side of [-1, 1]) {
            const dist = 18;  // increased from 12 to clear banked/elevated sections
            const a = anchor(k, side, dist);
            if (onTrack(a.c[0], a.c[2], 3)) continue;
            const b = [a.r, a.u, a.t];
            // Pole — 9m tall, rooted at terrain
            addCyl(out, a.c, 0.14, 9, lampCol, 5, b);
            // Horizontal arm extending inward over the road
            addBox(out, vadd(vadd(a.c, a.u, 9), a.r, -side * 0.8),
                   [1.6, 0.16, 0.16], armCol, b);
            // Luminaire head — bright warm-white box at arm end
            addBox(out, vadd(vadd(a.c, a.u, 8.7), a.r, -side * 1.4),
                   [0.9, 0.3, 0.6], lightHead, b);
          }
        });
      }

      // -----------------------------------------------------------------------
      // GRANDSTAND LIGHTING ACCENTS — warm-white emissive strip at roof fascia
      // and a row of spot-light boxes below the canopy.  These add structural
      // depth in day light and read as lit panels at dusk/night.
      // Major stands: pit straight, Hugenholtz, Luyendyk.
      // -----------------------------------------------------------------------
      {
        const roofAccent = [0.98, 0.95, 0.88];   // near-white warm fascia
        const spotCol    = [1.00, 0.97, 0.84];   // warm spot luminaire

        // Pit straight main stand (s≈0.01, side=1, gap=12, len=36)
        for (const [s, side, gap, len] of [
          [0.01,  1,  16, 36],   // pit straight main R
          [0.135,-1,  28, 40],   // Hugenholtz banked L (gap updated to match grandstand)
          [0.915, 1,  28, 80],   // Arie Luyendyk massive R (gap updated to match grandstand)
          // Masterbocht L, not the 0.865 approach stand: that one is roof:"none",
          // so a fascia strip at 13.5 m hung in mid-air over an open bleacher.
          [0.60, -1,  16, 44],
        ]) {
          const k = K(s), a = anchor(k, side, gap + 5);
          const b = [a.r, a.u, a.t];
          // Roof-fascia emissive strip (just below canopy)
          addBox(out, vadd(a.c, a.u, 13.5), [11, 0.45, len + 4], roofAccent, b);
          // Row of small spot boxes suspended under canopy edge
          const spotCount = Math.round(len / 8);
          for (let i = 0; i < spotCount; i++) {
            const offset = (i - (spotCount - 1) / 2) * 8;
            addBox(out, vadd(vadd(a.c, a.u, 12.6), a.t, offset),
                   [0.6, 0.5, 0.6], spotCol, b);
          }
        }
      }

      // =======================================================================
      // BESPOKE COASTAL LANDMARKS — local models built from raw primitives
      // =======================================================================

      // --- Red-and-white banded coastal lighthouse: tapered banded tower, black
      //     gallery ring, glazed lantern room with an emissive lamp, dome cap and
      //     a little keeper's cottage. The Zandvoort seaside icon.
      //     NOTE: this is invented — the real Zandvoort lighthouse was
      //     decommissioned in 1907, decades before the circuit existed, so it
      //     is not a genuine period landmark. Kept anyway as generic coastal
      //     atmosphere (a banded lighthouse silhouette reads as "seaside" even
      //     if this exact one predates the track); the real inland landmark —
      //     the 1912 watertoren — is added below as its own separate model
      //     rather than replacing this one.
      function lighthouse(k, side, dist) {
        const a = anchor(k, side, dist);
        const b = [a.r, a.u, a.t], H = 34, bands = 6;
        modelGroup("zandvoort-lighthouse", {
          center: vadd(vadd(a.c, a.t, 3.5), a.u, 20),
          size: [12, 42, 17],
          basis: b,
        }, (stage) => {
          stage._mat = MAT.CONCRETE;
          for (let i = 0; i < bands; i++) {
            const y0 = i / bands * H, y1 = (i + 1) / bands * H;
            const rB = 4.2 - (y0 / H) * 2.0, rT = 4.2 - (y1 / H) * 2.0;
            addFrustum(stage, vadd(a.c, a.u, y0), rB, rT, y1 - y0,
                       i % 2 ? [0.86, 0.20, 0.16] : [0.94, 0.94, 0.95], 10, b);
          }
          stage._mat = MAT.METAL;
          addCyl(stage, vadd(a.c, a.u, H), 3.0, 1.2, [0.14, 0.14, 0.16], 10, b);
          stage._mat = MAT.GLASS;
          addCyl(stage, vadd(a.c, a.u, H + 1.2), 2.2, 3.2, [0.30, 0.42, 0.52], 8, b);
          stage._mat = 0;
          addCyl(stage, vadd(a.c, a.u, H + 1.6), 1.3, 2.2, [1.0, 0.96, 0.72], 8, b);
          stage._mat = MAT.METAL;
          addCone(stage, vadd(a.c, a.u, H + 4.4), 2.4, 2.6, [0.20, 0.20, 0.22], 8, b);
          stage._mat = MAT.STONE;
          addBox(stage, vadd(vadd(a.c, a.t, 8), a.u, 2), [7, 4, 6], [0.92, 0.92, 0.90], b);
          stage._mat = MAT.ROOF;
          addPrism(stage, vadd(vadd(a.c, a.t, 8), a.u, 4), [7, 2.2, 6], [0.72, 0.28, 0.20], b);
        }, { required: true });
      }

      // --- Distant seaside town silhouette: a row of varied gabled Dutch houses
      //     with terracotta roofs and a church spire poking above the rooftops.
      //     Fixed: anchor to pyMin (horizon baseline) like other distant backdrop
      //     elements (sea/beach bands), not to anchor() terrain which floats over
      //     banked sections. Towns are 280-330m out — far backdrop, not trackside.
      //     `tint` (optional) overrides the default sandy-stone palette — three
      //     calls at this width/distance otherwise read as the same silhouette
      //     three times; one is shifted toward brick-red below.
      function seasideTown(k, side, dist, width, tint) {
        const a = anchor(k, side, dist);
        if (onTrack(a.c[0], a.c[2], width * 0.5)) return;
        const b = [a.r, a.u, a.t];
        const cols = tint || [[0.86, 0.80, 0.70], [0.80, 0.74, 0.64], [0.72, 0.66, 0.58],
                      [0.88, 0.84, 0.78], [0.68, 0.58, 0.50]];
        const rows = Math.floor(width / 8);
        for (let i = 0; i < rows; i++) {
          const off = (i - (rows - 1) / 2) * 8 + (hash(k * 3 + i) - 0.5) * 2;
          const h = 5 + hash(k * 7 + i) * 6, w = 5 + hash(k * 11 + i) * 2;
          const c = cols[(hash(k * 13 + i) * cols.length) | 0];
          // Distant horizon building: use a.c X/Z but pyMin for Y baseline
          const bp = [a.c[0] + a.t[0] * off, pyMin, a.c[2] + a.t[2] * off];
          out._mat = MAT.STONE;
          // House body: center at pyMin + h/2 (base sits at pyMin, horizon level)
          addBox(out, vadd(bp, a.u, h / 2), [w, h, w], c, b);
          out._mat = MAT.ROOF;
          // Roof apex at pyMin + h
          addPrism(out, vadd(bp, a.u, h), [w * 1.02, h * 0.4, w], [0.52, 0.26, 0.20], b);
          out._mat = 0;
        }
        // Church tower: also anchored to pyMin baseline
        const cs = [a.c[0] + a.t[0] * ((hash(k * 5) - 0.5) * width * 0.4),
                    pyMin,
                    a.c[2] + a.t[2] * ((hash(k * 5) - 0.5) * width * 0.4)];
        out._mat = MAT.STONE;
        // Tower: 12m tall, center at pyMin + 6
        addBox(out, vadd(cs, a.u, 6), [5, 12, 5], [0.82, 0.80, 0.74], b);
        out._mat = 0;
        // Spire base at pyMin + 12
        addCone(out, vadd(cs, a.u, 12), 3.2, 9, [0.36, 0.30, 0.28], 4, b);
      }

      // --- Beach club pavilion on stilts over the sand: raised boardwalk deck,
      //     pastel clubhouse with a pitched roof, and a row of orange windbreak flags.
      function beachPavilion(k, side, dist) {
        const a = anchor(k, side, dist);
        if (onTrack(a.c[0], a.c[2], 16)) return;
        const b = [a.r, a.u, a.t];
        out._mat = MAT.WOOD;
        addBox(out, vadd(a.c, a.u, 1.4), [14, 0.4, 10], [0.70, 0.58, 0.40], b);      // deck
        for (const ox of [-6, 0, 6]) for (const oz of [-4, 4])
          addCyl(out, vadd(vadd(a.c, a.r, ox), a.t, oz), 0.2, 1.4, [0.5, 0.42, 0.30], 4, b);
        out._mat = MAT.CONCRETE;
        addBox(out, vadd(a.c, a.u, 3.4), [10, 3.6, 7], [0.90, 0.88, 0.82], b);       // clubhouse
        out._mat = MAT.ROOF;
        addPrism(out, vadd(a.c, a.u, 5.2), [10.4, 1.8, 7], [0.24, 0.52, 0.68], b);
        out._mat = 0;
        for (const oz of [-6, -2, 2, 6]) {
          out._mat = MAT.METAL;
          addCyl(out, vadd(vadd(a.c, a.t, oz), a.r, 8), 0.08, 5, [0.4, 0.4, 0.42], 4, b);
          out._mat = MAT.FABRIC;
          addBox(out, vadd(vadd(vadd(a.c, a.t, oz), a.r, 8), a.u, 4.4), [0.1, 1.0, 1.6],
                 [0.95, 0.45, 0.05], b);
          out._mat = 0;
        }
      }

      // --- Zandvoort watertoren (1912): the genuine local landmark — a brick
      //     shaft, a wider cantilevered tank drum, and a steep conical red cap.
      //     Real water towers of this design carry two darker brick banding
      //     courses on the shaft and a flared cornice under the tank; both are
      //     modelled as extra flat-shaded cylinders rather than texture.
      function watertoren(k, side, dist) {
        const a = anchor(k, side, dist);
        const b = [a.r, a.u, a.t];
        const shaftH = 20, drumH = 6, capH = 5, shaftR = 3.0;
        const brick = [0.58, 0.34, 0.26], brickDk = [0.48, 0.27, 0.20];
        const capCol = [0.62, 0.16, 0.12];
        modelGroup("zandvoort-watertoren", {
          center: vadd(a.c, a.u, (shaftH + drumH + capH) / 2),
          size: [10, shaftH + drumH + capH + 2, 10],
          basis: b,
        }, (stage) => {
          // The whole stack is authored in BASE-anchored coordinates, because
          // addCyl/addCone build upward from `c` (geom.js). It shipped with the
          // centre-anchored half-height offsets, which floated the 20 m shaft
          // 10 m off the ground and swallowed the cap inside the drum.
          stage._mat = MAT.STONE;
          addCyl(stage, a.c, shaftR, shaftH, brick, 12, b);                        // 0 → 20
          // Darker brick banding courses break up the shaft's silhouette.
          addCyl(stage, vadd(a.c, a.u, shaftH * 0.35), shaftR + 0.05, 1.0, brickDk, 12, b);
          addCyl(stage, vadd(a.c, a.u, shaftH * 0.70), shaftR + 0.05, 1.0, brickDk, 12, b);
          // Tank drum — wider cylinder cantilevered over the shaft, with a
          // flared cornice course closing the step where it overhangs.
          addCyl(stage, vadd(a.c, a.u, shaftH), shaftR + 1.3, 1.0, brickDk, 12, b);       // 20 → 21
          addCyl(stage, vadd(a.c, a.u, shaftH + 1), 4.4, drumH, brick, 12, b);            // 21 → 27
          addCyl(stage, vadd(a.c, a.u, shaftH + 1 + drumH - 0.8), 4.5, 0.8, brickDk, 12, b); // flush at 27
          // Conical red cap.
          stage._mat = MAT.ROOF;
          addCone(stage, vadd(a.c, a.u, shaftH + 1 + drumH), 4.7, capH, capCol, 12, b);
        }, { required: true });
      }

      lighthouse(K(0.45), 1, 300);                 // hero on the seaward dune horizon
      watertoren(K(0.325), -1, 48);                 // hero: the genuine 1912 landmark, inland side
      seasideTown(K(0.30), -1, 280, 70);           // Zandvoort village toward the inland arc
      seasideTown(K(0.62), -1, 300, 60);
      seasideTown(K(0.72),  1, 330, 55, [
        // Brick-red variant — the three town silhouettes otherwise share one
        // sandy-stone palette; this one leans toward terracotta/brick facades.
        [0.62, 0.30, 0.22], [0.56, 0.26, 0.19], [0.68, 0.36, 0.26],
        [0.50, 0.22, 0.17], [0.60, 0.28, 0.20],
      ]);
      beachPavilion(K(0.40), 1, 250);              // beach clubs near the shore (165→200→250: clear banked Scheivlak approach)
      beachPavilion(K(0.55), 1, 250);              // (175→200→250: safety margin)
    },
  }
  );
})();
