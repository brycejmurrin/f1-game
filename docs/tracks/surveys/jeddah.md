# Jeddah Corniche — circuit survey (2026-10-14)

**Circuit id:** `jeddah` · **Theme:** `street_night` (`night: true`) · **Live:** https://brycejmurrin.github.io/f1-game/

**Capture status:** 15 baseline frames captured on the agent VM (`jeddah-*.png` in session artifacts). A **30–36 frame** pack under `artifacts/shots/tracks/jeddah/` (committed path) is **blocked** until the shared tooling PR lands (`tools: shared shot tooling for circuit surveys`: batch `weather` + `tod`, retries, `artifacts/shots/tracks/**` gitignore exception). **Weather / lighting matrix shots are deferred** — plan below; re-run after rebase.

## Code map

| Layer | Path | Role |
|--------|------|------|
| Def | `js/circuits/jeddah.js` | OSM centreline, `startFrac` 0.9625, street pit (`bays: false`), `bankZones` (T13 7°), `dressingExclusions` for hand scenery |
| Scenery | `js/circuits/scenery/jeddah.js` | Canyon, LEDs, sea/marina, heroes, Al-Balad roshan, neon fascia |
| Brief | `docs/tracks/jeddah.md` | Lap-position landmark table |
| Landmarks | `tests/data/landmarks/jeddah.json` | fountain, floating mosque, blue sail, golden twins, golden-tower hotel, flagpole |

**Sectors (racing `s`):** S/F 0 · T1 ~0.05 · Red Sea 0.15–0.20 · skyline ~0.28 · esses ~0.35 · marina ~0.45 · T13 ~0.50 · lagoon ~0.62 · hotels ~0.70 · technical ~0.78–0.86 · DRS ~0.96.

**`__apex` weather / time-of-day** (for post-rebase captures): `setTimeOfDay("dawn"|"day"|"dusk"|"night")`, `weather("dry"|"wet"|"rain"|"overcast"|"fog")` — see `docs/DEBUG-HOOKS.md`.

## Planned capture matrix (30–36 frames, after shared tooling)

| Group | Frames | Notes |
|--------|--------|--------|
| Sector sweep | 13 sectors × 2 TOD (`day`, `night`) | 26 — primary documentation |
| Golden hour | 4 sectors (`s20`, `s45`, `s50`, `s96`) × `dusk` | 4 |
| Weather on key views | 6 combos (`night` + `wet`/`rain`/`overcast`/`fog` on SF, fountain, T13, technical) | 6 |
| **Total** | | **36** |

Filename pattern: `artifacts/shots/tracks/jeddah/<slug>_<tod>_<weather>.png`.

## Baseline captures — by sector (day / default TOD, TLX)

Panel grid (3 per row). Files: session/PR artifacts until `artifacts/shots/tracks/jeddah/` is tracked.

| Frame | Frame | Frame |
|-------|-------|-------|
| `jeddah-00-sf-orbit.png` — S/F orbit; inland gap on terrain | `jeddah-00-sf-chase.png` — pit straight chase | `jeddah-05-t1-orbit.png` — T1 / Golden Tower |
| `jeddah-18-fountain-sea.png` — Red Sea corridor | `jeddah-20-fountain-chase.png` — fountain sector; plume often out of FOV | `jeddah-28-skyline.png` — Blue Sail skyline |
| `jeddah-35-esses-park.png` — flowing esses | `jeddah-45-marina.png` — marina / yachts | `jeddah-50-t13-bank.png` — banked T13; offshore monument |
| `jeddah-50-t13-trackside.png` — T13 trackside stands | `jeddah-62-lagoon.png` — lagoon palms | `jeddah-70-hotels.png` — hotel cluster |
| `jeddah-81-technical-park.png` — technical canyon (+ inland row this PR) | `jeddah-96-drs-orbit.png` — DRS straight | `jeddah-165-mosque.png` — **pre-fix** mosque at s≈0.165 |

## By weather / lighting (deferred)

| Condition | Planned key views | Known risks to check |
|-----------|-------------------|----------------------|
| `day` + `dry` | All sectors | Fountain/neon under-read; looks like generic street |
| `dusk` + `dry` | Fountain, marina, T13, DRS | Sky vs `pal.horizon` mismatch |
| `night` + `dry` | All sectors | Primary race identity — LED tunnel, neon fascia |
| `night` + `wet` / `rain` | S/F, esses | Reflective street shader vs SwiftShader |
| `night` + `overcast` / `fog` | Fountain, T13 | Fog density vs `fogDensity` 0.0018; lamp range |

**Blocked:** batch jobs cannot set `weather` on this branch; one-off `shot.mjs --tod night` timed out on `awaitSoftPresent` under concurrent CI load.

## Audit (node VM, this branch)

```text
verify-track jeddah: OK — surface folds 0
audit-circuit: float 0, clip 0, coplanar 3 (baseline), ground buried 0 / unsupported 4 (baseline), flatCoplanar 2 (improved from 3)
```

## Findings backlog

| P | Issue | Sector | Weather-specific? |
|---|--------|--------|-------------------|
| 1 | King Fahd Fountain weak in day orbit/chase | s≈0.20 | Yes — needs `night` + longer dist |
| 1 | Floating mosque lap position | was s≈0.165 | **Fixed** → s≈0.498 |
| 2 | Technical sector thin inland façade | s≈0.78–0.86 | **Fixed** — `cityFront` gap 64 m |
| 2 | Mosque plinth coplanar (256 m²) | hero | **Fixed** — deck +0.05 m |
| 3 | T13 offshore monument reads floating | s≈0.50 R | Water-plane seating needs `seat.box` pattern (prior attempt failed float-audit) |
| 3 | S/F inland `cityFront` terrain gap | s≈0 | Terrain bulge — gap tuning |
| 4 | Pit building vs real media centre scale | S/F | Def `bays: false` / 190 m window |

## Fixes in this PR (circuit files only)

1. `floatingMosque(K(0.498), 215)` — north-loop / marina sightline.
2. `cityFront(0.78, 0.86, -1, 64, …)` — technical sector inland row.
3. Mosque plinth/deck coplanar separation.

## Verification

```sh
node tools/track/verify-track.cjs jeddah
node tools/track/audit-circuit.cjs jeddah
```

Follow-up after shared tooling merge: rebase → run `scratch/jeddah-survey-40-jobs.json` (trim to 36) → refresh panels in this file → commit `artifacts/shots/tracks/jeddah/*.png`.
