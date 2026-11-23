/* Apex 26 — QATAR circuit definition (data only). */
(function () {
  "use strict";
  (window.TrackDefs = window.TrackDefs || []).push(
  {
    id: "qatar",
    revision: 2,
    // The pit complex (TrackPit) on the driver's RIGHT of the main straight: the
    // FIA 2025 Qatar GP pit-lane drawing (doc 4, 27 Nov 2025, p.3) branches the
    // lane off the inside of T16 with the F1 garages beyond it — the infield of
    // this clockwise lap. It was -1 (left), the grandstand side.
    pit: { side: 1 },
    // The authored qatar-main-stand-* own the stand side of the pit straight;
    // with the pits flipped to +1 the engine's generic S/F stand landed on -1
    // at ~25 m, in front of them (and in the S/F orbit corridor). Zolder,
    // Monza, Sepang and Portimao precedent.
    ownPitStraight: true,
    reverse: false, // real-world CW/CCW direction
    // Start/finish line. Snapped to the real one: coord 0.3 m off centreline; = trace vertex 0.
    // A start line is always on a straight: docs/tracks/START-LINES.md.
    startFrac: 0.0000,
    sceneryStartFrac: 0.8000,
    name: "QATAR",
    gp: "Qatar GP",
    country: "Qatar",
    night: true,
    theme: "desert",
    sceneryTheme: "night-event",
    sceneryCoordinates: "racing",
    flatTerrain: true,
    terrainOuter: 120,
    dressingExclusions: [
      // Qatar owns its sparse palms/scrub; generic foliage muddies the open desert.
      { kind: "foliage", s0: 0, s1: 1 },
      // One lighting system: the ~200 Musco masts below (floodMastRing + S/F +
      // TV corners) own BOTH the look and the night pools. Suppress the generic
      // mast pass so short duplicate poles do not sit under the tall banks.
      { kind: "lamps", s0: 0, s1: 1 },
    ],
    lengthKm: 5.4,
    tyreSeverity: 1.60,  // Pirelli hardest C1–C3; 'one of the toughest' on tyres — near Austria outlier
    sunAzimBias: -0.30,   // art-directed day-sun yaw offset (rad, atmosphere.js); the real GP runs at night
    baseHW: 8,
    // Warm pal.runoff = tan sand beyond the green verge (brief / COL.desertSand)
    pal: { horizon: [0.08, 0.10, 0.14], zenith: [0.03, 0.04, 0.09], ambientSky: [0.15, 0.16, 0.20], ambientGround: [0.12, 0.12, 0.14], fogColor: [0.10, 0.12, 0.16], fogDensity: 0.0015, runoff: [0.72, 0.58, 0.38], grass: [0.48, 0.36, 0.22] },
    bankZones: [
      { frac: 0.0415, angleDeg: 3.0, widthM: 90 },
      { frac: 0.1914, angleDeg: 3.5, widthM: 110 },
      { frac: 0.4199, angleDeg: 4.0, widthM: 170 },
      { frac: 0.4636, angleDeg: 4.0, widthM: 140 },
      { frac: 0.6217, angleDeg: 3.0, widthM: 110 },
      { frac: 0.7404, angleDeg: 4.0, widthM: 180 },
      { frac: 0.8487, angleDeg: 3.5, widthM: 150 },
    ],
    // OpenF1 2024 qualifying, session 9646: Verstappen lap 21, checked
    // against Russell lap 23. Additive cosine coefficients in metres.
    // Offset converts racing-lap stations to this circuit's authoring origin.
    elevations: [
      0.86, -0.42, 0.56, -0.92, 1.12, -1.58, 1.49, -1.2,
      0.57, -1.28, 0.61, 0.04, 0.37, 0.94, 0.64, 0.55,
      0.08, 0.48, -0.01, 1.28, 0.43, 1.59, -0.51, 1.95,
      0.87, 2.1, -0.02, 1.56, 0.53, 2.73, 0.7, 0.45,
    ].map((rise, i) => ({ s: (i / 32 + 0.104663) % 1, halfM: 336.88, rise })),

    // ── Per-circuit data (this def is its single home; the engine reads it off the built def) ──
    // sectors/turns as RACING-LAP fractions (post startFrac/reverse), never
    // fmap'd — tools/track/rotate-markings.cjs re-seats turns when the start
    // line moves. turns: one apex (built-centreline curvature peak) per corner
    // of the FIA event-map numbering, turns[0] = T1. Source: FIA 2025 Qatar GP
    // Race Director doc 4 "Event Notes - Circuit Map. Pit Lane Drawing, ..."
    // (27 Nov 2025, 16 corners); the 2026 document is not out yet. T1 R, T2 L,
    // T3 R, T4 R, T5 R, T6 L, T7 R, T8 L, T9 R, T10 L, T11 L, T12 R, T13 R,
    // T14 R, T15 L, T16 R. sectors are NOT re-derived from that map (FIA: S1
    // 80 m before T6, S2 75 m before T12).
    sectors: [0.3, 0.65],
    turns: [0.1157, 0.1588, 0.2077, 0.2782, 0.3168, 0.3665, 0.4332, 0.4659, 0.5067, 0.5445, 0.6046, 0.6610, 0.6981, 0.7374, 0.7967, 0.8887],
    furniture: { tree: "palm",  fol: [0.28, 0.40, 0.18], lamp: "arm",   lc: [0.90, 0.95, 1.0], sparse: true },
    kit: { marshal: "container", rail: "wArmco",      fence: "panelled",  tyre: "airfence", board: "monopole", gantry: "portal",     camera: "monopole",  hoarding: "led" },
    standSet: ["sandstone", "steel", "concrete"],
    // Real centreline: OSM trace (bacinger/f1-circuits, ODbL) — [x,z] metres,
    // recentred, one lap, open loop. tools/track/import-circuit-path.mjs regenerates it.
    path: { len: 5427, pts: [[463.8,-299.9],[618.7,-16.3],[679.5,93.8],[683.5,114.4],[680.9,135.8],[673.2,152.4],[661,164.5],[642.3,175.5],[620.9,178.8],[600.7,175.2],[446.1,81.3],[431.3,77.2],[411.8,76.5],[389.4,83.1],[371.3,100],[361,118.5],[358.5,137.2],[362,272],[359.8,290.4],[354.3,306.2],[346.8,321.3],[336.2,333.8],[115.6,578.3],[103.5,588.2],[84.7,593.4],[66.6,594.8],[48.2,590.1],[33.8,581.6],[-31.7,519],[-39,505.8],[-42.3,487.6],[-41.6,471.8],[-37.2,456.4],[-27.7,442.5],[115.6,285],[121.8,273.6],[122.2,261.1],[118.9,250.1],[111.9,242],[101.5,235.4],[87.3,233.5],[77.3,236.4],[64.4,242.3],[-185.9,342.5],[-202.3,344.3],[-222.5,341.4],[-239.5,333.7],[-252.8,320.3],[-260.9,303.4],[-264.1,286.7],[-263.8,272],[-259,258],[-248.7,241.7],[-240.2,233.7],[-220.7,217.8],[-199,192.9],[-180.9,167.8],[-165.8,141.1],[-153.7,109.8],[-146.7,88.5],[-139.3,50.9],[-133.1,34.9],[-122.4,21.3],[-111,12.8],[-95.6,5.9],[46.7,-28.8],[59.1,-36.1],[68.7,-44.6],[74.2,-58.6],[76.4,-72.2],[73.9,-92.7],[58.4,-112.9],[31.9,-139.8],[-9,-170.9],[-51.7,-195.2],[-95.1,-210.7],[-138.5,-219.9],[-180.9,-223.6],[-227.2,-219.1],[-439.9,-195.5],[-459.3,-199.6],[-481.9,-210.3],[-499.1,-223.6],[-515.3,-245.6],[-564.7,-337.3],[-568.7,-353.2],[-568.7,-367.5],[-566.5,-382.5],[-556.2,-401.7],[-479.6,-525.3],[-470,-534.5],[-455.7,-541.1],[-441,-545.5],[-421.1,-544.7],[-176.6,-495.4],[-159.2,-495.4],[-141.9,-500.5],[-127.3,-510.6],[-116.9,-523.4],[53.3,-854.4],[67,-870.2],[82.5,-879.8],[104.9,-883.5],[121.8,-881.6],[139.8,-873.4],[155.3,-859.9]] },
  }
  );
})();
