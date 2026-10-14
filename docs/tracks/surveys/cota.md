# COTA — circuit survey (2026-10-14)

**Branch:** `cursor/cota-survey-fc61` · **Live:** [brycejmurrin.github.io/f1-game](https://brycejmurrin.github.io/f1-game/)  
**Brief:** `docs/tracks/cota.md` · **Data:** `js/circuits/cota.js` · **Dressing:** `js/circuits/scenery/cota.js`

## Code map

| Layer | Role |
|--------|------|
| `js/circuits/cota.js` | OSM centreline, `pit: { side: -1 }`, `theme: "green"`, SRTM elevation, `terrainOuter: 60`, sectors/turns, palette, `dressingExclusions` for T1 sightline + tower cluster |
| `js/circuits/scenery/cota.js` | Lazy `TrackScenery.cota`: grandstands, Big Red, esses mounds, RV field, observation tower + Austin360, pit/paddock, barriers, `cityFront` haze skyline, `forestEdge` / mesquite |
| `js/track/tracks.js` | Registry entry (loads def + defers scenery) |
| `tests/data/landmarks/cota.json` | Required heroes: `cota-main-grandstand`, `cota-turn1-big-red`, `cota-amphitheater` |
| `tests/specs/cota-foundation.spec.js` | Terrain-under-road + required models (tower, gantries, amphitheater) |

**Lap fractions (racing frame, `startFrac` 0):** S1 main + T1 ≈ 0–0.18 · Esses ≈ 0.18–0.30 · Mid/back ≈ 0.30–0.62 · T12 + amphitheatre ≈ 0.62–0.80 · Triple-apex + finish ≈ 0.80–1.0.

## Theme and models

- **Palette:** Texas Hill Country day — dry grass, red soil, scrub/oak, `theme: "green"`, custom `pal` in def.
- **Hero landmarks:** Observation tower (251 ft tip, red veil) at s≈0.76–0.78; amphitheater stage; Turn 1 Big Red banks + lattice posts; main-stand red/white fascia.
- **Kit:** `tecpro` tyres, `panelled` fence, `truss` gantry; `furniture.lamp: "none"` (no generic lamp pass — hand lamps on main straight only).
- **Baked pack:** Kenney industrial/commercial models via generic `building()` / city band where used; circuit-specific geometry is mostly boxes + `modelGroup` heroes.

## Capture set (this pass)

- **Tooling:** `node tools/shot/shot.mjs` (stock CLI; `--tod` only). **30 frames** on disk under `artifacts/shots/tracks/cota/` (gitignored until shared `artifacts/shots/tracks/**` exception lands — use `git add -f` when committing).
- **Weather** (`wet`, `rain`, `overcast`, `fog`): **not captured** — blocked on shared PR *tools: shared shot tooling for circuit surveys* (`wx` batch + retries). **Time-of-day** variants (dawn/dusk/night dry) on **four anchors** only.
- **Supplement batch:** `capture-jobs-supplement.jsonl` (six day-dry sector frames) — run once in background on this branch.

### By sector (day · dry)

| | | |
|:---:|:---:|:---:|
| ![S1 main straight](../../../artifacts/shots/tracks/cota/anchor-main-000-day-dry.png) *s≈0.00 main* | ![S1 pit](../../../artifacts/shots/tracks/cota/sector-s1-pit-040-day-dry.png) *s≈0.04 pit* | ![S1 final](../../../artifacts/shots/tracks/cota/sector-s1-final-950-day-dry.png) *s≈0.95* |
| ![S2 Turn 1](../../../artifacts/shots/tracks/cota/anchor-t1-100-day-dry.png) *s≈0.10 T1* | ![S2 Esses](../../../artifacts/shots/tracks/cota/sector-s2-esses-220-day-dry.png) *s≈0.22* | ![S2 Big Red](../../../artifacts/shots/tracks/cota/sector-s2-bigred-108-day-dry.png) *s≈0.11* |
| ![S3 field](../../../artifacts/shots/tracks/cota/sector-s3-field-320-day-dry.png) *s≈0.32 RV field* | ![S3 back straight](../../../artifacts/shots/tracks/cota/sector-s3-back-500-day-dry.png) *s≈0.50* | ![S3 triple apex](../../../artifacts/shots/tracks/cota/sector-s3-triple-840-day-dry.png) *s≈0.84* |
| ![S4 crest](../../../artifacts/shots/tracks/cota/sector-s4-crest-550-day-dry.png) *s≈0.55* | ![S5 T12](../../../artifacts/shots/tracks/cota/anchor-t12-635-day-dry.png) *s≈0.63* | ![S5 hairpin exit](../../../artifacts/shots/tracks/cota/sector-s5-hairpin-exit-680-day-dry.png) *s≈0.68* |
| ![S6 tower](../../../artifacts/shots/tracks/cota/anchor-tower-780-day-dry.png) *s≈0.78* | ![S6 amphitheater](../../../artifacts/shots/tracks/cota/landmark-amphi-760-day-dry.png) *s≈0.76* | ![S6 tower eye](../../../artifacts/shots/tracks/cota/landmark-tower-eye-780-day-dry.png) *eye at tower* |
| ![Red stand](../../../artifacts/shots/tracks/cota/landmark-red-stand-650-day-dry.png) *s≈0.65* | ![Overview](../../../artifacts/shots/tracks/cota/overview-infield-420-day-dry.png) *infield orbit* | ![Start gantry](../../../artifacts/shots/tracks/cota/sector-s1-gantry-000-day-dry.png) *start lights* |

### By time of day (dry · four anchors)

| | | |
|:---:|:---:|:---:|
| ![Main day](../../../artifacts/shots/tracks/cota/anchor-main-000-day-dry.png) *main · day* | ![Main dusk](../../../artifacts/shots/tracks/cota/anchor-main-000-dusk-dry.png) *main · dusk* | ![Main dawn](../../../artifacts/shots/tracks/cota/anchor-main-000-dawn-dry.png) *main · dawn* |
| ![Main night](../../../artifacts/shots/tracks/cota/anchor-main-000-night-dry.png) *main · night* | ![T1 day](../../../artifacts/shots/tracks/cota/anchor-t1-100-day-dry.png) *T1 · day* | ![T1 dusk](../../../artifacts/shots/tracks/cota/anchor-t1-100-dusk-dry.png) *T1 · dusk* |
| ![T1 dawn](../../../artifacts/shots/tracks/cota/anchor-t1-100-dawn-dry.png) *T1 · dawn* | ![T1 night](../../../artifacts/shots/tracks/cota/anchor-t1-100-night-dry.png) *T1 · night* | ![T12 day](../../../artifacts/shots/tracks/cota/anchor-t12-635-day-dry.png) *T12 · day* |
| ![T12 dusk](../../../artifacts/shots/tracks/cota/anchor-t12-635-dusk-dry.png) *T12 · dusk* | ![T12 dawn](../../../artifacts/shots/tracks/cota/anchor-t12-635-dawn-dry.png) *T12 · dawn* | ![T12 night](../../../artifacts/shots/tracks/cota/anchor-t12-635-night-dry.png) *T12 · night* |
| ![Tower day](../../../artifacts/shots/tracks/cota/anchor-tower-780-day-dry.png) *tower · day* | ![Tower dusk](../../../artifacts/shots/tracks/cota/anchor-tower-780-dusk-dry.png) *tower · dusk* | ![Tower dawn](../../../artifacts/shots/tracks/cota/anchor-tower-780-dawn-dry.png) *tower · dawn* |
| ![Tower night](../../../artifacts/shots/tracks/cota/anchor-tower-780-night-dry.png) *tower · night* | *Weather matrix deferred* | *See follow-up after shared shot PR* |

### Weather / lighting backlog (capture + fixes)

| Issue | Severity | Notes |
|--------|----------|--------|
| **Weather matrix not shot** | Capture | Need shared `shot.mjs` `wx` batch + gitignore exception; re-run 4–6 anchors × `{wet,rain,overcast,fog}`. |
| **Night flood at tower/amphi** | Medium | `furniture.lamp: "none"`; plaza pool + tower read dark — flood pass or `lampPost` cluster (lighting-tuner). |
| **Night main straight** | Low | Hand `along(0.94,0.06)` lamps only; adequate for straight, not T1 hill terraces. |
| **Pit garage terrain** | Low | Relocated to s≈0.02 with `terrainYAt` + `seat.box` bays; ground-audit still reports ~5 m buried on bay glass (within fleet baseline). |
| **T1 hill height (physics)** | Deferred | Authored `rise: 18` vs ~40 m real — physics decision (`docs/tracks/cota.md`). |
| **Distant `cityFront`** | Low | Sparse Austin haze; one buried face from shared `city.js` (baseline). |
| **Rain/fog** | Unknown | Not validated until wx capture lands. |

## Ranked improvements

1. **After shared shot PR:** full weather grid on anchors + tower/amphi night wet/rain check (reflections, spray).
2. **Night lighting** at amphitheatre plaza (`s≈0.775`) — emissive windows exist on stage; add flood masts or enable themed lamp kit locally.
3. **Pit garage read** — optional art pass on `cota-pit-garages` modelGroup (bay doors) once terrain footing stable.
4. **T1 physics hill** — separate tune pass with `verify-track` + physics spec if product wants 133 ft crest.
5. **Register `cota-observation-tower` in `landmarks/cota.json`** — foundation spec already requires the model; registry parity only.

## Verification (this branch)

```text
node tools/track/verify-track.cjs cota          → OK
node tools/track/audit-circuit.cjs cota --json → ok:true (float 0, clip 0, ground within baseline)
```

**Not run:** `cota-foundation` browser spec (deferred until after screenshot batch; no tests during capture).

## Fixes applied (circuit-scoped)

- Pit garage: moved from lifted s≈0.97 monolith to terrain-footed bays on paddock straight (`cota-pit-garages` modelGroup).
- Turn 1 `spectatorHill`: `rise` 1.3 → 1.45 (0.19 m burial on outer row).
- Prior art retained: prism basis fix for Big Red / esses mounds; tower height 76.5 m; split main-straight upper grandstand bays.
