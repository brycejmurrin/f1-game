/* Apex 26 — IMOLA circuit definition (data only).
   Retired (`classic: true`): dropped from the calendar when Madrid joined for
   2026, and not among the venues contracted for 2027. Press mentions of Imola
   are as a contingency venue only, which is not a calendar slot. */
(function () {
  "use strict";
  (window.TrackDefs = window.TrackDefs || []).push(
  {
    id: "imola",
    revision: 2,
    classic: true,
    reverse: false, // real-world CW/CCW direction
    // Start/finish line. Snapped to the real one: coord 6.3 m off centreline; = trace vertex 0 (timing line).
    // A start line is always on a straight: docs/tracks/START-LINES.md.
    startFrac: 0.0000,
    sceneryStartFrac: 0.4950,
    // The pit complex (TrackPit) on the LEFT of the start straight, where
    // scenery/imola.js builds the Tilke pit blocks, Racetrack Tower and pit
    // wall (docs/tracks/imola.md: pits L, Partenza stands R). Without this the
    // engine built lane and garages on the default right, under the stands.
    pit: { side: -1 },
    sceneryCoordinates: "racing",
    name: "IMOLA",
    gp: "Emilia Romagna GP",
    country: "Italy",
    night: false,
    theme: "green",
    lengthKm: 4.9,
    tyreSeverity: 1.02,  // Classic permanent; Emilia-Romagna band ≈ calendar neutral (no 2026 rate)
    baseHW: 7,
    terrainOuter: 120,
    dressingExclusions: [
      // Bespoke parkland owns the full circuit. The hand-placed lamp runs own racing
      // 0.84–0.05 (pit straight) and 0.30–0.68; engine masts light 0.05–0.30 and 0.68–0.84.
      // Windows are SCENERY-frame (racing + `_sceneryShift` ≈ 0.4906; sceneryStartFrac 0.4950).
      { kinds: ["foliage"], s0: 0, s1: 1 },
      { kinds: ["lighting"], s0: 0.3306, s1: 0.5406 },
      { kinds: ["lighting"], s0: 0.7906, s1: 0.1706 },
    ],
    pal: { zenith: [0.24, 0.44, 0.74], horizon: [0.80, 0.72, 0.56], grass: [0.24, 0.46, 0.16], runoff: [0.44, 0.42, 0.36], sunDir: [0.7874615506676528, 0.5468482990747588, 0.2843611155188746], sun: [1, 0.9, 0.65], sunColor: [1, 0.88, 0.62] },
    // Measured from Verstappen's 2025 qualifying lap (OpenF1 9983) and checked against
    // Piastri's pole lap. Add the authored origin so the factory maps sample 0 back to the line.
    elevations: [14.942, 12.58, 8.327, 7.267, 4.761, 4.754, 7.953, 12.482,
      11.575, 14.077, 14.529, 14.47, 15.682, 14.691, 13.436, 13.741,
      11.766, 11.838, 10.599, 8.252, 5.825, 2.762, 0.173, -0.172,
      -0.137, -0.932, -0.607, -0.589, -0.479, -0.394, -0.177, -0.062,
      0.085, 0.278, 0.51, 0.969, 1.128, 1.363, 1.249, 1.434,
      1.274, 1.351, 1.206, 1.584, 1.76, 1.749, 2.062, 1.92,
      2.211, 2.18, 2.428, 2.876, 3.0, 4.127, 5.56, 6.747,
      9.476, 9.92, 11.744, 13.665, 17.656, 15.744, 16.65, 15.499]
      .map((rise, i) => ({ s: (i / 64 + 0.495) % 1, halfM: 152.21, rise })),
    // Soft banks: terrain fade (1−t) at the 10 m foundation shoulder left
    // centreline `gap` at 0.22–0.40 under 3–4° (foundation assert ≤ 0.18).
    // 1.5° keeps a readable cross-slope without knife-edge verge steps; hills
    // stay on `elevations`. Measured 2026-09-29 headless probe.
    bankZones: [
      { frac: 0.1905, angleDeg: 1.5, widthM: 60 },    // Villeneuve/Tosa link
      { frac: 0.3440, angleDeg: 1.5, widthM: 90 },    // Piratella
      { frac: 0.3703, angleDeg: 1.5, widthM: 90 },    // Acque Minerali
      { frac: 0.7874, angleDeg: 1.5, widthM: 70 },    // Rivazza 1
      { frac: 0.8456, angleDeg: 1.5, widthM: 110 },   // Rivazza 2
      { frac: 0.9737, angleDeg: 1.5, widthM: 120 },   // final sweep to the line
    ],

    // ── Per-circuit data (this def is its single home; the engine reads it off the built def) ──
    // sectors/turns: curated FIA-aligned sector splits + turn apexes as RACING-LAP
    // fractions (post startFrac/reverse), never fmap'd — tools/track/rotate-markings.cjs
    // re-seats turns when the start line moves.
    // FIA 2025 circuit map v3 (15 May): S1 115 m before T7/Tosa, S2 190 m
    // before T14/Variante Alta's first right. Built lap = 4870.753108900 m
    // after the #2209 chord slides (was 4871.249297939). Sector fractions
    // reseated by that 0.496 m so the metre gaps stay 115 and 190.
    // Nominal geometric anchors, not surveyed apex coordinates: T7 is the
    // full hairpin's half-heading point (.35812372), not either curvature
    // peak; T14 is the first right's local peak (.69293924). The FIA plan
    // numbers physical bends: T1 precedes Tamburello, T8 is the uphill right,
    // T11–13 are Acque Minerali. Never number by sorting curvature peaks.
    // Source: fia.com/system/files/decision-document/2025_imola_event_-_circuit_map_-_imola_2025.pdf
    sectors: [0.33451341, 0.65393090],
    // T7 (Tosa) is 19 m before the |k| peak on purpose: FIA Doc4 places S1
    // 115 m before Tosa, and circuit-corner-anchors pins (T7 - S1) * L = 115.
    turns: [0.0788, 0.1529, 0.1639, 0.1844, 0.2804, 0.2969, 0.35812372, 0.4392, 0.4834, 0.5204, 0.5674, 0.5904, 0.5999, 0.69293924, 0.6984, 0.8169, 0.8529, 0.8799, 0.9459],
    furniture: { tree: "cypress", fol: [0.24, 0.41, 0.21], lamp: "none" },  // columnar spires
    kit: { marshal: "cabin",     rail: "doubleArmco", fence: "leaning",   tyre: "stack",   board: "arched",    gantry: "box",        camera: "lattice",   hoarding: "panel" },
    standSet: ["crimson", "sandstone", "concrete"],  // Ferrari red over Imola's stone-and-terracotta town
    // Real centreline: OSM trace (bacinger/f1-circuits, ODbL) — [x,z] metres,
    // recentred, one lap, open loop. tools/track/import-circuit-path.mjs regenerates it.
    path: { len: 4904, pts: [[-326.4,356.3],[-293.7,356.8],[-90.1,400.5],[-17.4,408.2],[25,408.7],[237.5,389.6],[341.8,364.9],[354.8,356.3],[361,348.7],[362.9,341.5],[370.5,308.3],[376.1,297.7],[389.1,288.7],[485.1,239.8],[499.5,223.8],[654.4,-160.3],[656.2,-170.5],[656,-183],[639.6,-242.7],[639.6,-252.1],[644.9,-263.7],[650.9,-271.6],[834.3,-428.6],[839.6,-437.6],[841.5,-448.3],[839.2,-459.7],[832.4,-473.4],[823.7,-480.9],[813.7,-483.9],[798.4,-483.7],[502.7,-445.3],[469,-442.9],[419.2,-445.7],[383.2,-451],[334,-460.3],[283.6,-469.5],[257.5,-474.7],[241,-471.3],[228.5,-465.1],[212.4,-449.4],[196.1,-420],[171.2,-357.8],[165.4,-330.5],[163.6,-299.6],[168.4,-268.1],[204.5,-97.3],[204,-86.6],[198.9,-74.4],[177.9,-41.3],[150.4,1.5],[142.4,5.6],[131.7,6.7],[124.3,3.5],[83.6,-12.9],[71.1,-14.6],[-355.4,-11.8],[-359.5,-15.8],[-367.3,-29.2],[-370.2,-38],[-373,-39.6],[-394.9,-45.6],[-554.1,29.2],[-575.6,41.2],[-646.5,90.2],[-687.1,127.1],[-726.4,166.7],[-822.5,260.8],[-841.9,274.6],[-863,285],[-988.6,340.8],[-998.1,350],[-999.4,364.6],[-996.9,376.2],[-959,456.3],[-950.2,463.9],[-940.5,466.9],[-926.8,467.4],[-915.9,464.7],[-747.1,400.5],[-687.1,377.4],[-654.5,365.6],[-626.1,359.1],[-606.9,355.7]] },
  }
  );
})();
