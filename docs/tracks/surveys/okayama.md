# Okayama — circuit survey (2026-10-14)

Pacific GP / TI Circuit Aida. **36** survey JPEGs (`artifacts/shots/tracks/okayama/`, q80, ≤1280px, <300KB). Captures: `shot.mjs --jpeg --present-timeout 90 --capture-retries 4 --wait 120` (SwiftShader / TLX default).

## Sector anchors and time of day

| | | |
|:---:|:---:|:---:|
| ![Track select](../../../artifacts/shots/tracks/okayama/00-track-picker-still.jpg) | ![Dunlop bridge eye](../../../artifacts/shots/tracks/okayama/s1-dunlop-eye__day-dry.jpg) | ![Pit orbit](../../../artifacts/shots/tracks/okayama/s1-pit-orbit__day-dry.jpg) |
| Track select · dry · day | Dunlop bridge eye · dry · day | Pit orbit · dry · day |
| | | |
|:---:|:---:|:---:|
| ![Pit orbit](../../../artifacts/shots/tracks/okayama/s1-pit-orbit__dusk-dry.jpg) | ![Pit orbit](../../../artifacts/shots/tracks/okayama/s1-pit-orbit__night-dry.jpg) | ![Main stand trackside](../../../artifacts/shots/tracks/okayama/s1-stand-ts__day-dry.jpg) |
| Pit orbit · dry · dusk | Pit orbit · dry · night | Main stand trackside · dry · day |
| | | |
|:---:|:---:|:---:|
| ![Hairpin trackside](../../../artifacts/shots/tracks/okayama/s2-hairpin-ts__day-dry.jpg) | ![Turn 1 trackside](../../../artifacts/shots/tracks/okayama/s2-turn1-ts__day-dry.jpg) | ![Williams paddock orbit](../../../artifacts/shots/tracks/okayama/s2-williams-orbit__day-dry.jpg) |
| Hairpin trackside · dry · day | Turn 1 trackside · dry · day | Williams paddock orbit · dry · day |
| | | |
|:---:|:---:|:---:|
| ![Hobbs trackside](../../../artifacts/shots/tracks/okayama/s3-hobbs-ts__day-dry.jpg) | ![Last corner trackside](../../../artifacts/shots/tracks/okayama/s3-last-ts__day-dry.jpg) | — |
| Hobbs trackside · dry · day | Last corner trackside · dry · day | |

## Hero views — weather (day)

| | | |
|:---:|:---:|:---:|
| ![Dunlop bridge eye](../../../artifacts/shots/tracks/okayama/s1-dunlop-eye__day-fog.jpg) | ![Dunlop bridge eye](../../../artifacts/shots/tracks/okayama/s1-dunlop-eye__day-overcast.jpg) | ![Dunlop bridge eye](../../../artifacts/shots/tracks/okayama/s1-dunlop-eye__day-rain.jpg) |
| Dunlop bridge eye · fog · day | Dunlop bridge eye · overcast · day | Dunlop bridge eye · rain · day |
| | | |
|:---:|:---:|:---:|
| ![Dunlop bridge eye](../../../artifacts/shots/tracks/okayama/s1-dunlop-eye__day-wet.jpg) | ![Pit orbit](../../../artifacts/shots/tracks/okayama/s1-pit-orbit__day-fog.jpg) | ![Pit orbit](../../../artifacts/shots/tracks/okayama/s1-pit-orbit__day-overcast.jpg) |
| Dunlop bridge eye · wet · day | Pit orbit · fog · day | Pit orbit · overcast · day |
| | | |
|:---:|:---:|:---:|
| ![Pit orbit](../../../artifacts/shots/tracks/okayama/s1-pit-orbit__day-rain.jpg) | ![Pit orbit](../../../artifacts/shots/tracks/okayama/s1-pit-orbit__day-storm.jpg) | ![Pit orbit](../../../artifacts/shots/tracks/okayama/s1-pit-orbit__day-wet.jpg) |
| Pit orbit · rain · day | Pit orbit · storm · day | Pit orbit · wet · day |
| | | |
|:---:|:---:|:---:|
| ![Hairpin trackside](../../../artifacts/shots/tracks/okayama/s2-hairpin-ts__day-fog.jpg) | ![Hairpin trackside](../../../artifacts/shots/tracks/okayama/s2-hairpin-ts__day-overcast.jpg) | ![Hairpin trackside](../../../artifacts/shots/tracks/okayama/s2-hairpin-ts__day-rain.jpg) |
| Hairpin trackside · fog · day | Hairpin trackside · overcast · day | Hairpin trackside · rain · day |
| | | |
|:---:|:---:|:---:|
| ![Hairpin trackside](../../../artifacts/shots/tracks/okayama/s2-hairpin-ts__day-wet.jpg) | ![Turn 1 trackside](../../../artifacts/shots/tracks/okayama/s2-turn1-ts__day-fog.jpg) | ![Turn 1 trackside](../../../artifacts/shots/tracks/okayama/s2-turn1-ts__day-overcast.jpg) |
| Hairpin trackside · wet · day | Turn 1 trackside · fog · day | Turn 1 trackside · overcast · day |
| | | |
|:---:|:---:|:---:|
| ![Turn 1 trackside](../../../artifacts/shots/tracks/okayama/s2-turn1-ts__day-rain.jpg) | ![Turn 1 trackside](../../../artifacts/shots/tracks/okayama/s2-turn1-ts__day-wet.jpg) | ![Williams paddock orbit](../../../artifacts/shots/tracks/okayama/s2-williams-orbit__day-fog.jpg) |
| Turn 1 trackside · rain · day | Turn 1 trackside · wet · day | Williams paddock orbit · fog · day |
| | | |
|:---:|:---:|:---:|
| ![Williams paddock orbit](../../../artifacts/shots/tracks/okayama/s2-williams-orbit__day-overcast.jpg) | ![Williams paddock orbit](../../../artifacts/shots/tracks/okayama/s2-williams-orbit__day-rain.jpg) | ![Williams paddock orbit](../../../artifacts/shots/tracks/okayama/s2-williams-orbit__day-wet.jpg) |
| Williams paddock orbit · overcast · day | Williams paddock orbit · rain · day | Williams paddock orbit · wet · day |
| | | |
|:---:|:---:|:---:|
| ![Hobbs trackside](../../../artifacts/shots/tracks/okayama/s3-hobbs-ts__day-fog.jpg) | ![Hobbs trackside](../../../artifacts/shots/tracks/okayama/s3-hobbs-ts__day-overcast.jpg) | ![Hobbs trackside](../../../artifacts/shots/tracks/okayama/s3-hobbs-ts__day-rain.jpg) |
| Hobbs trackside · fog · day | Hobbs trackside · overcast · day | Hobbs trackside · rain · day |
| | | |
|:---:|:---:|:---:|
| ![Hobbs trackside](../../../artifacts/shots/tracks/okayama/s3-hobbs-ts__day-wet.jpg) |||
| Hobbs trackside · wet · day |||

## Fixes and audits

- Grandstand offsets 10→18 m (S/F), 20→22 m (Hobbs).
- `verify-track` / `audit-circuit` OK on branch tip.
