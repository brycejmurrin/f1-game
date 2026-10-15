# Day + rain/storm “night sky” — fleet survey (2026-10-15)

**Ask:** Korea survey (PR #1891) reported `tod=day` with `weather=rain` or `storm` reading like a **night** sky. Determine Korea-only vs global; fix only in circuit files if local, else document for Lighting (PR #1883).

**Verdict:** **Global** — shared weather/atmosphere + sky shader behaviour on every circuit tested. **Not** fixable in `js/circuits/korea.js` (or any single circuit file).

**Evidence shots:** `artifacts/shots/tracks/weather-night-survey/` (force-added). Captured with `shot.mjs --jpeg --present-timeout 90 --capture-retries 4 --wait 120`, SwiftShader default (no `APEX_GL`), `cam=orbit`, `frac=0.1`, `tod=day`.

Raw image base (this branch):  
`https://raw.githubusercontent.com/brycejmurrin/f1-game/cursor/weather-night-sky-0cd8/artifacts/shots/tracks/weather-night-survey/`

## Root cause (shared lighting — Lighting lane)

| Mechanism | Where | What happens on `day` + `rain`/`storm` |
|---|---|---|
| Wet weather stack | `js/lighting/atmosphere.js` ~385–414 | After the explicit-**day** base sky is built (~233–253), `wxWet()` raises `_cloudBase` (+0.32 wet / +0.52 rain), mutes `sunColor` / `frameSky.sunColor`, lifts ambient slightly, and pulls `fogColor` toward a grey deck. `raceTimeOfDay` stays `"day"`; `frameSky.stars` stays `0`. |
| Storm extra darken | `js/lighting/atmosphere.js` ~418–429 | `wxStorm()` further multiplies zenith ×0.7 and horizon ×0.78, thickens fog, and scales `frame.exposure` ×0.86 — a **deliberate** “cloudburst murk” on top of the rain profile (`profiles.js` maps `storm` → `rain` preset key). |
| Overcast sky draw | `js/render/three/tsl-sky.js` ~477–488 | High `cloud` drives `overcast`; zenith/horizon mix toward a flat grey ceiling. Night lid tint applies only when `stars ≥ 0.5` (`nightSky` gate ~181, ~473). |
| Circuit data | `js/circuits/korea.js` | `night: false`, normal `pal` — no weather/sky override. Same preset pattern as the fleet (`korea\|day\|rain` in `js/lighting/presets.js`). |

Korea survey JPEGs named `*__night-rain.jpg` were **`tod: day`** in the batch job; the filename suffix was misleading (see PR #1891 survey §“Hero — night / rain”). Logical TOD in capture metadata is `day` / `rain` or `storm`.

### Sky luminance check (upper 25% of frame, SwiftShader)

Mean RGB of sky band — **day+storm** approaches **night** darkness on several tracks; **day+rain** is a dark overcast day, not as black as real `night|dry`.

| Track | day dry | day rain | day storm | night dry (ref) |
|---|---:|---:|---:|---:|
| bahrain | 76, 94, 137 | 33, 59, 117 | 18, 35, 97 | (night circuit; use monza ref) |
| korea | 49, 96, 166 | 44, 88, 156 | 23, 55, 132 | 16, 16, 16 (survey key-pit) |
| monza | 29, 85, 126 | 29, 72, 125 | 16, 45, 106 | **5, 16, 4** (captured ref) |
| spa | 75, 105, 108 | 64, 86, 102 | 46, 65, 87 | — |
| suzuka | 58, 96, 110 | 32, 62, 93 | 18, 38, 75 | — |
| shanghai | 62, 96, 138 | 42, 78, 132 | 24, 52, 111 | — |

## Korea (orbit 0.1)

| | | |
|---|---|---|
| ![korea day dry](https://raw.githubusercontent.com/brycejmurrin/f1-game/cursor/weather-night-sky-0cd8/artifacts/shots/tracks/weather-night-survey/korea__day-dry.jpg) | ![korea day rain](https://raw.githubusercontent.com/brycejmurrin/f1-game/cursor/weather-night-sky-0cd8/artifacts/shots/tracks/weather-night-survey/korea__day-rain.jpg) | ![korea day storm](https://raw.githubusercontent.com/brycejmurrin/f1-game/cursor/weather-night-sky-0cd8/artifacts/shots/tracks/weather-night-survey/korea__day-storm.jpg) |
| day · dry | day · rain | day · storm |

## Bahrain

| | | |
|---|---|---|
| ![bahrain day dry](https://raw.githubusercontent.com/brycejmurrin/f1-game/cursor/weather-night-sky-0cd8/artifacts/shots/tracks/weather-night-survey/bahrain__day-dry.jpg) | ![bahrain day rain](https://raw.githubusercontent.com/brycejmurrin/f1-game/cursor/weather-night-sky-0cd8/artifacts/shots/tracks/weather-night-survey/bahrain__day-rain.jpg) | ![bahrain day storm](https://raw.githubusercontent.com/brycejmurrin/f1-game/cursor/weather-night-sky-0cd8/artifacts/shots/tracks/weather-night-survey/bahrain__day-storm.jpg) |
| day · dry | day · rain | day · storm |

## Spa

| | | |
|---|---|---|
| ![spa day dry](https://raw.githubusercontent.com/brycejmurrin/f1-game/cursor/weather-night-sky-0cd8/artifacts/shots/tracks/weather-night-survey/spa__day-dry.jpg) | ![spa day rain](https://raw.githubusercontent.com/brycejmurrin/f1-game/cursor/weather-night-sky-0cd8/artifacts/shots/tracks/weather-night-survey/spa__day-rain.jpg) | ![spa day storm](https://raw.githubusercontent.com/brycejmurrin/f1-game/cursor/weather-night-sky-0cd8/artifacts/shots/tracks/weather-night-survey/spa__day-storm.jpg) |
| day · dry | day · rain | day · storm |

## Suzuka

| | | |
|---|---|---|
| ![suzuka day dry](https://raw.githubusercontent.com/brycejmurrin/f1-game/cursor/weather-night-sky-0cd8/artifacts/shots/tracks/weather-night-survey/suzuka__day-dry.jpg) | ![suzuka day rain](https://raw.githubusercontent.com/brycejmurrin/f1-game/cursor/weather-night-sky-0cd8/artifacts/shots/tracks/weather-night-survey/suzuka__day-rain.jpg) | ![suzuka day storm](https://raw.githubusercontent.com/brycejmurrin/f1-game/cursor/weather-night-sky-0cd8/artifacts/shots/tracks/weather-night-survey/suzuka__day-storm.jpg) |
| day · dry | day · rain | day · storm |

## Monza (+ night dry reference)

| | | |
|---|---|---|
| ![monza day dry](https://raw.githubusercontent.com/brycejmurrin/f1-game/cursor/weather-night-sky-0cd8/artifacts/shots/tracks/weather-night-survey/monza__day-dry.jpg) | ![monza day rain](https://raw.githubusercontent.com/brycejmurrin/f1-game/cursor/weather-night-sky-0cd8/artifacts/shots/tracks/weather-night-survey/monza__day-rain.jpg) | ![monza day storm](https://raw.githubusercontent.com/brycejmurrin/f1-game/cursor/weather-night-sky-0cd8/artifacts/shots/tracks/weather-night-survey/monza__day-storm.jpg) |
| day · dry | day · rain | day · storm |
| ![monza night dry ref](https://raw.githubusercontent.com/brycejmurrin/f1-game/cursor/weather-night-sky-0cd8/artifacts/shots/tracks/weather-night-survey/monza__night-dry-ref.jpg) | | |
| **night · dry** (reference — true night gate) | | |

## Shanghai

| | | |
|---|---|---|
| ![shanghai day dry](https://raw.githubusercontent.com/brycejmurrin/f1-game/cursor/weather-night-sky-0cd8/artifacts/shots/tracks/weather-night-survey/shanghai__day-dry.jpg) | ![shanghai day rain](https://raw.githubusercontent.com/brycejmurrin/f1-game/cursor/weather-night-sky-0cd8/artifacts/shots/tracks/weather-night-survey/shanghai__day-rain.jpg) | ![shanghai day storm](https://raw.githubusercontent.com/brycejmurrin/f1-game/cursor/weather-night-sky-0cd8/artifacts/shots/tracks/weather-night-survey/shanghai__day-storm.jpg) |
| day · dry | day · rain | day · storm |

## Recommended fix owner

Lighting lane (PR #1883): rebalance **day** rain/storm presets and/or soften the storm zenith/horizon/exposure stack so `day` stays recognisably daytime under SwiftShader and hardware. Related backlog: `docs/BUGS.md` M37 (`*|day|*` stamps missing for rain/overcast/fog).

## Verified

- `node tools/shot/shot.mjs --batch artifacts/weather-night-survey-batch.json` — 18/18 JPEGs + capture JSON (SwiftShader).
- `npm run test:guards` — on push commit.
