# Telemetry position data research — 24 November 2026

Kind: design · Re-measure-by: 2027-02-24

The Data Hub already requests OpenF1 location samples alongside car telemetry for
selected fastest laps (`js/data/api.js`, `js/data/telemetry.js`). Its map is based
on timestamped X/Y samples, not just lap times. The new Track view makes that
existing playback accessible within the native telemetry popup on phones.

## Sources and limits

- [OpenF1 documentation](https://openf1.org/docs/): location and car channels are
  sampled at approximately 3.7 Hz. Location describes approximate progress around
  the circuit; it does **not reliably describe lateral placement**. Arbitrary
  coordinate origins and interpolation mean this is not a precise racing line.
  Historical data from 2023 onward is available without authentication; live data
  requires a subscription. Speed, throttle, brake, gear, RPM and DRS complement
  location. Preserve missing values (particularly DRS for 2026).
- [OpenF1 FAQ](https://openf1.org/): free requests are rate limited (3/second and
  30/minute). Keep the existing bounded lap queries, serialization and cache;
  avoid fetching a whole session for every driver just to enlarge the map.
- [FastF1](https://github.com/theOehrly/Fast-F1) is a Python analysis library, not
  a replacement browser endpoint. Its [Telemetry source documentation](https://raw.githubusercontent.com/theOehrly/Fast-F1/master/fastf1/core.py)
  describes position X/Y/Z, on/off-track status, computed distance and relative
  distance, plus provenance flags for car, position and interpolated samples.
  Coordinates expressed in tenths of metres do not imply ten-centimetre accuracy.

## Recommended follow-up

Use the existing OpenF1 position feed first. Surface sample coverage and stale or
missing location intervals, and distinguish observed samples from interpolated
playback and speed-integrated distance. Session position/gap, pit, stint and
weather feeds can add context without claiming precise wheel placement.

For deeper historical analysis, a separate FastF1 preprocessing/export service
could produce aligned position and distance data with provenance. That requires
hosting, caching and source-access review; it is not introduced by this UI change.
No paid live subscription, new credentials or server is required for Track view.
