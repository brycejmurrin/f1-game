# Telemetry replay geometry

Silverstone is the first width-aware dataset. Other circuits retain feed-position replay without an invented road width. Runtime coverage is restricted to the 2023–2026 Silverstone layout; further datasets require validation before registration.

Source: [TUMFTM/racetrack-database](https://github.com/TUMFTM/racetrack-database/tree/e59595d1f3573b30d1ded6a08984935b957688e0), revision e59595d1f3573b30d1ded6a08984935b957688e0. TUM geometry and its derived JSON remain LGPL-3.0; both LGPL and incorporated GPL texts are under source/. Source coordinates derive from © OpenStreetMap contributors (https://www.openstreetmap.org/copyright); widths are satellite-image estimates, not surveyed or certified barrier positions. The upstream README, original CSVs, hashes and complete derivation inputs are retained. This does not relicense the rest of Apex.

The line uses TUM's minimum-curvature raceline, clamped to a nearest-normal 1.25 m centre-point clearance. Car glyphs are illustrative 6×2 m rectangles. The same line is used for every driver; no per-driver lateral position is inferred. Geometry follows metre coordinates without aspect-ratio distortion.

Start alignment and sector fractions were calibrated against OpenF1 session 9122, driver 1, lap 25. Similarity shape-registration RMS was 3.156 m; it is not a lateral-accuracy measurement. The geometry anchors constrain each lane's integrated speed to its own recorded sector/lap times. Matching those times is an enforced constraint, not independent validation. Laps with missing timing, speed coverage or gaps over 1.5 s have no estimated position. Up to 0.75 s of end-of-lap speed holding is permitted. Missing geometry falls back to timestamp-interpolated feed positions with gap handling.

The UI links here and identifies approximation, width availability and aligned comparison clocks. The expanded panel shares the chart clock and retains no separate animation loop. Geometry is fetched only for supported laps, with an abortable eight-second deadline. Leaving telemetry aborts loading, disconnects observation and removes the expanded dialog.

Rebuild the derived JSON with `node assets/telemetry/source/build.mjs`. The preserved calibration records the original alignment and source hashes. This rebuild does not re-estimate calibration or certify a new circuit layout.
