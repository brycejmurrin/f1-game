/* Apex 26 — KYALAMI GRAND PRIX CIRCUIT definition (data only).
   Retired from F1 (`classic: true`): last South African GP 1993, on the 1992
   layout. The trace below is the 2016 rebuild's 4.5 km layout, run
   ANTICLOCKWISE as the real circuit is (`reverse: false`: the source trace's
   own order; T1 The Kink a flat-out right, T2 Crowthorne a left, T16 Ingwe the
   slow left onto the straight). It ran clockwise until 2026-11-18 (#5316
   CIRC2-05, Bryce's `decision: Kyalami A`). Source for direction, turn names,
   pit side and timing lines: SRO/IGTC 2023 Kyalami 9 Hour briefing notes,
   https://www.intercontinentalgtchallenge.com/documents/notice/3374/2023+Kyalami+9+hr+V1+Briefing+Notes.pdf
   (p. 8 circuit map, p. 9 pit-lane drawing).
   Geometry from the OSM trace in `path` below. */
(function () {
  "use strict";
  (window.TrackDefs = window.TrackDefs || []).push(
  {
    id: "kyalami",
    classic: true,
    // Layout revision 2: the anticlockwise lap. A saved Kyalami ghost, input
    // ghost or time-trial board row was recorded with revision 1 (clockwise)
    // in its comparable-class key, so it no longer matches and is never
    // replayed or compared; it stays in storage, untouched (js/track/core/def.js).
    revision: 4, // Leeukop approach and Mineshaft descent
    reverse: false,
    // The line on control node 0, 201 m (built arc) toward Ingwe from the old
    // node-1 line: the SRO pit-lane drawing puts S/F at the end of the pit
    // building with Ingwe 268 m back and The Kink 252 m on (Wikipedia: "a few
    // hundred metres after the start/finish line"). Node 0 is the only control
    // point in the 150-250 m band the build plan bounded (85-point trace).
    startFrac: 0,
    // The scenery (sceneryCoordinates "racing") stays keyed to the old line's
    // node; js/circuits/scenery/kyalami.js re-keyed its fracs f -> 1 - f.
    sceneryStartFrac: 0.01,
    name: "KYALAMI",
    gp: "South African GP",
    country: "South Africa",
    night: false,
    theme: "green",
    lengthKm: 4.5,
    tyreSeverity: 1.05,  // Moderate African permanent; slight above neutral
    baseHW: 7.5,
    sceneryCoordinates: "racing",
    // The pit complex (TrackPit): LEFT of the main straight in the
    // (anticlockwise) racing direction — the INFIELD, north of the straight,
    // as the SRO briefing's p. 9 pit-lane drawing has it: entry just after
    // Ingwe, exit before The Kink. On this forward lap engine and scenery
    // side agree: the paddock (scenery/kyalami.js) is built on -1 too.
    pit: { side: -1 },
    terrainOuter: 120,
    dressingExclusions: [
      { kinds: ["foliage"], s0: 0.90, s1: 0.08 },   // scenery frame (sceneryStartFrac)
      { kind: "foliage", s0: 0.52, s1: 0.64 },
    ],
    pal: {
      zenith:        [0.14, 0.36, 0.76],
      horizon:       [0.76, 0.76, 0.70],
      sun:           [1.0,  0.97, 0.86],
      sunColor:      [1.0,  0.96, 0.84],
      ambientSky:    [0.48, 0.52, 0.60],
      ambientGround: [0.34, 0.30, 0.20],
      fogColor:      [0.74, 0.74, 0.68],
      fogDensity:    0.0022,   // thin high-altitude air — long clear sightlines
      // Winter Highveld veld: red leads green, keeping the ground straw-gold
      // rather than drifting toward a lush European circuit palette.
      grass:         [0.48, 0.43, 0.20],
      runoff:        [0.60, 0.46, 0.32],
      sunDir:        [0.30, 0.82, 0.24],
    },
    elevations: [
      // 2020 Kyalami 9 Hour programme, p. 12: 43 m relief, highest at T10.
      // The 48-point Copernicus terrain sample on the modern route puts the
      // low on the run to Crowthorne and the broad crest above Mineshaft.
      // Smooth those features over their approaches; heights are relative.
      { s: 0.070, halfM: 480, rise: -14 },  // between The Kink and Crowthorne
      { s: 0.360, halfM: 340, rise:  10 },  // upper section toward Clubhouse
      // Paired 30 m SRTM and Copernicus terrain sections resolve the
      // Leeukop shoulder. The Mineshaft road loses about 29 m by lap 0.729.
      { s: 0.598, halfM: 460, rise:  29 },  // Leeukop, racing fraction 0.633
      { s: 0.800, halfM: 340, rise:  -4 },  // lower return through Crocodiles
    ],
    hwZones: [
      { s0: 0.230, s1: 0.275, hw: 6.3, ease: 0.012 },    // source-frame index (unchanged by the flip)
      { s0: 0.540, s1: 0.585, hw: 6.2, ease: 0.012 },
      { s0: 0.9281, s1: 0.9625, hw: 6.3, ease: 0.012 },  // T16 Ingwe (source-frame index)
    ],
    bankZones: [
      // By turn index (the corners the old frac windows re-seated onto, measured).
      { turn: 2, angleDeg: 4.0, widthM: 120 },   // T2 Crowthorne
      { turn: 11, angleDeg: 3.5, widthM: 130 },  // T11, after Leeukop (was frac 0.400)
      { turn: 6, angleDeg: 4.5, widthM: 140 },   // T6 Sunset (was frac 0.700)
    ],

    // ── Per-circuit data (this def is its single home; the engine reads it off the built def) ──
    // sectors/turns: curated FIA-aligned sector splits + turn apexes as RACING-LAP
    // fractions (post startFrac/reverse), never fmap'd — tools/track/rotate-markings.cjs
    // re-seats turns when the start line moves.
    // turns: the 16 SRO turns (briefing p. 8) on the built curvature peaks, lap
    // order: T1 The Kink (r ~500 m, flat), T2 Crowthorne, T3-4 Jukskei Sweep,
    // T5 Barbeque, T6 Sunset, T7 Clubhouse, T8-9 The Esses, T10 Leeukop, T11,
    // T12 Mineshaft, T13-14 The Crocodiles, T15 Cheetah, T16 Ingwe.
    // sectors: the SRO timing lines Int 1 (1470 m) and Int 2 (3253 m, "before
    // turn 12") of the stated 4522 m, as lap fractions; both on straights.
    sectors: [0.325, 0.719],
    turns: [0.0576, 0.1473, 0.1821, 0.2018, 0.2268, 0.3429, 0.4366, 0.4973, 0.5196, 0.6330, 0.6536, 0.7393, 0.8187, 0.8473, 0.8804, 0.9402],
    furniture: { tree: "acacia", fol: [0.33, 0.38, 0.21], lamp: "none", sparse: true },  // grey-green thorn; sparse keeps the veld open
    kit: { marshal: "cabin",     rail: "cable",       fence: "mesh",      tyre: "stack",   board: "panel",     gantry: "box",        camera: "lattice",   hoarding: "panel" },
    standSet: ["sandstone", "orange", "concrete"],  // bleached masonry, red-oxide iron, raw terracing
    // Real centreline: OSM trace (bacinger/f1-circuits, ODbL) — [x,z] metres,
    // recentred, one lap, open loop. tools/track/import-circuit-path.mjs regenerates it.
    // Kyalami Grand Prix Circuit — Johannesburg. Upstream za-1961, stated 4529 m, projected 4526 m, trace winding CW.
    path: { len: 4526, pts: [[-228.2,-209.2],[-395.3,-23.5],[-417.7,-6.6],[-698.7,176.4],[-730.5,202.9],[-736,215.7],[-732.2,231.7],[-721.2,242],[-714.3,246.8],[-615.5,266.2],[-600.3,274.1],[-586.9,285.9],[-551.7,354.2],[-529.6,373.5],[-472.3,407.3],[-460.9,409.8],[-446.7,407.3],[-436.7,399.4],[-356.3,286.2],[-167.1,24.8],[-147.8,6.2],[-122.6,-8.2],[-93.6,-18.3],[-67.6,-20.7],[-40.7,-16.9],[-13.8,-7.6],[6.9,6.2],[24.5,22.8],[133.6,176.8],[146.4,184.7],[160.9,189.6],[177.8,189.6],[194,183],[205.7,171.2],[335.9,-8.2],[342.1,-22],[344.5,-35.5],[344.5,-51.8],[342.8,-67.3],[338,-80.8],[322.8,-106.3],[317.9,-122.2],[316.9,-138.8],[319,-154.6],[323.8,-172.2],[332.1,-188.5],[342.1,-202.3],[351.4,-212.6],[371.4,-227.1],[382.1,-233],[514,-285.1],[527.8,-286.9],[606.5,-294.8],[718,-328.6],[730.4,-338],[736,-352.4],[735.3,-366.2],[726.6,-380.4],[685.6,-403.5],[661.4,-409.8],[640.4,-407.7],[352.8,-277.9],[331.1,-264.8],[306.6,-243.3],[286.9,-218.2],[272.1,-186],[265.4,-160.9],[252.6,-59],[240.9,-16.6],[209.9,53.9],[192.9,64.6],[173.3,62.5],[155.7,48],[132.2,-2.4],[110.8,-33.8],[88,-58.3],[45.9,-95.3],[4.5,-125],[-0.4,-138],[-1.7,-151.5],[-22.8,-375.3],[-30,-390.1],[-43.5,-394.2],[-58.7,-392.5],[-77.3,-376.6]] },
  }
  );
})();
