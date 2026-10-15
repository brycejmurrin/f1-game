# Mont-Tremblant — circuit survey (2026-10-14)

**Circuit id:** `mont_tremblant`  
**Brief:** `docs/tracks/mont_tremblant.md`  
**Live:** [brycejmurrin.github.io/f1-game](https://brycejmurrin.github.io/f1-game/) (picker → MONT-TREMBLANT)

**Captures:** Re-shoot in progress ([#1862](https://github.com/brycejmurrin/f1-game/pull/1862)): `__wx-<weather>__tod-<time>.jpg` under [`artifacts/shots/tracks/mont_tremblant/`](../../../artifacts/shots/tracks/mont_tremblant/). Jobs: `docs/tracks/surveys/mont_tremblant-capture-jobs.json`.

```sh
node tools/shot/shot.mjs --batch artifacts/shots/tracks/mont_tremblant/capture-jobs.jsonl \
  --jpeg --present-timeout 120 --capture-retries 4 --wait 180
```

**Re-shoot status:** **14 / 36** (run 2 — day-dry sector frames through Bridge chase).

## Re-shoot panel grid (14 frames, run 2)

| ![Paddock orbit](../../../artifacts/shots/tracks/mont_tremblant/s1-01-paddock-orbit__wx-dry__tod-day.jpg) | ![Start grandstand (trackside)](../../../artifacts/shots/tracks/mont_tremblant/s1-02-start-stand__wx-dry__tod-day.jpg) | ![Turn 1 crest](../../../artifacts/shots/tracks/mont_tremblant/s1-03-turn1-crest__wx-dry__tod-day.jpg) |
| **Paddock orbit** · wx=dry · tod=day | **Start grandstand (trackside)** · wx=dry · tod=day | **Turn 1 crest** · wx=dry · tod=day |
| ![Ski mountain skyline](../../../artifacts/shots/tracks/mont_tremblant/s1-04-ski-skyline__wx-dry__tod-day.jpg) | ![Esses (chase)](../../../artifacts/shots/tracks/mont_tremblant/s1-05-esses-chase__wx-dry__tod-day.jpg) | ![Esses cutting (eye)](../../../artifacts/shots/tracks/mont_tremblant/s1-06-esses-tunnel__wx-dry__tod-day.jpg) |
| **Ski mountain skyline** · wx=dry · tod=day | **Esses (chase)** · wx=dry · tod=day | **Esses cutting (eye)** · wx=dry · tod=day |
| ![Downhill sweep](../../../artifacts/shots/tracks/mont_tremblant/s2-07-downhill-sweep__wx-dry__tod-day.jpg) | ![T4 spectator bank](../../../artifacts/shots/tracks/mont_tremblant/s2-08-t4-spectator-bank__wx-dry__tod-day.jpg) | ![T5 hardwood run-off](../../../artifacts/shots/tracks/mont_tremblant/s2-09-t5-hardwood__wx-dry__tod-day.jpg) |
| **Downhill sweep** · wx=dry · tod=day | **T4 spectator bank** · wx=dry · tod=day | **T5 hardwood run-off** · wx=dry · tod=day |
| ![Lac Ouimet](../../../artifacts/shots/tracks/mont_tremblant/s2-10-lac-ouimet__wx-dry__tod-day.jpg) | ![Carousel](../../../artifacts/shots/tracks/mont_tremblant/s2-11-carousel__wx-dry__tod-day.jpg) | ![The Hump (chase)](../../../artifacts/shots/tracks/mont_tremblant/s3-12-hump-chase__wx-dry__tod-day.jpg) |
| **Lac Ouimet** · wx=dry · tod=day | **Carousel** · wx=dry · tod=day | **The Hump (chase)** · wx=dry · tod=day |
| ![T8–T9 climbing 90°](../../../artifacts/shots/tracks/mont_tremblant/s3-14-climbing-90s__wx-dry__tod-day.jpg) | ![Bridge (chase)](../../../artifacts/shots/tracks/mont_tremblant/s3-15-bridge-chase__wx-dry__tod-day.jpg) | |
| **T8–T9 climbing 90°** · wx=dry · tod=day | **Bridge (chase)** · wx=dry · tod=day | |

## Legacy captures (pre–#1862 filenames)

## Code map

| Piece | Path | Role |
|--------|------|------|
| Centreline + metadata | `js/circuits/mont_tremblant.js` | OSM-stitched path (`path.len` 4243 m), `startFrac` 0.6465, `sceneryStartFrac` 0, `theme: "green"`, `terrainOuter` 110, `furniture.tree: "fir"`, `furniture.lamp: "none"`, 15 `turns[]` |
| Scenery closure | `js/circuits/scenery/mont_tremblant.js` | Armco, forest wall, esses tunnel, ski massif, Lac Ouimet, five `modelGroup` landmarks |
| Registry | `tests/data/landmarks/mont_tremblant.json` | Required model ids |
| Lighting | `js/lighting/presets.js` | Full grid; day dry donor from Montreal (`docs/LIGHTING.md`) |

**Frame debt:** `_sceneryShift` ≈ 0.28 — paddock/start use `sl()`; Hump, Bridge, Namerow, esses use authored `K(s)`.

**Harness:** `shot.mjs` batch supports `--tod dawn|day|dusk|night` and `--weather dry|wet|rain|overcast|fog|storm` (per-job `tod` / `weather` fields).

## Theme and models

Laurentian enclosure (armco + conifers), club-scale paddock, natural banks over bleachers, Lac Ouimet outfield water, ski-mountain skyline. Fir/pine instancing + hardwood at lit edges; five required landmarks per `landmarks/mont_tremblant.json`.

---

## By sector and landmarks — day dry (18 frames)

| | | |
|:---:|:---:|:---:|
| <br/>**Paddock orbit · day · dry**<br/>![Paddock orbit · day · dry](../../../artifacts/shots/tracks/mont_tremblant/s1-01-paddock-orbit__day-dry.jpg) | <br/>**Start grandstand (trackside) · day · dry**<br/>![Start grandstand (trackside) · day · dry](../../../artifacts/shots/tracks/mont_tremblant/s1-02-start-stand__day-dry.jpg) | <br/>**Turn 1 crest · day · dry**<br/>![Turn 1 crest · day · dry](../../../artifacts/shots/tracks/mont_tremblant/s1-03-turn1-crest__day-dry.jpg) |
| <br/>**Ski mountain skyline · day · dry**<br/>![Ski mountain skyline · day · dry](../../../artifacts/shots/tracks/mont_tremblant/s1-04-ski-skyline__day-dry.jpg) | <br/>**Esses (chase) · day · dry**<br/>![Esses (chase) · day · dry](../../../artifacts/shots/tracks/mont_tremblant/s1-05-esses-chase__day-dry.jpg) | <br/>**Esses cutting (eye) · day · dry**<br/>![Esses cutting (eye) · day · dry](../../../artifacts/shots/tracks/mont_tremblant/s1-06-esses-tunnel__day-dry.jpg) |
| <br/>**Downhill sweep · day · dry**<br/>![Downhill sweep · day · dry](../../../artifacts/shots/tracks/mont_tremblant/s2-07-downhill-sweep__day-dry.jpg) | <br/>**T4 spectator bank · day · dry**<br/>![T4 spectator bank · day · dry](../../../artifacts/shots/tracks/mont_tremblant/s2-08-t4-spectator-bank__day-dry.jpg) | <br/>**T5 hardwood run-off · day · dry**<br/>![T5 hardwood run-off · day · dry](../../../artifacts/shots/tracks/mont_tremblant/s2-09-t5-hardwood__day-dry.jpg) |
| <br/>**Lac Ouimet · day · dry**<br/>![Lac Ouimet · day · dry](../../../artifacts/shots/tracks/mont_tremblant/s2-10-lac-ouimet__day-dry.jpg) | <br/>**Carousel · day · dry**<br/>![Carousel · day · dry](../../../artifacts/shots/tracks/mont_tremblant/s2-11-carousel__day-dry.jpg) | <br/>**The Hump (chase) · day · dry**<br/>![The Hump (chase) · day · dry](../../../artifacts/shots/tracks/mont_tremblant/s3-12-hump-chase__day-dry.jpg) |
| <br/>**T8–T9 climbing 90° · day · dry**<br/>![T8–T9 climbing 90° · day · dry](../../../artifacts/shots/tracks/mont_tremblant/s3-14-climbing-90s__day-dry.jpg) | <br/>**Bridge (chase) · day · dry**<br/>![Bridge (chase) · day · dry](../../../artifacts/shots/tracks/mont_tremblant/s3-15-bridge-chase__day-dry.jpg) | <br/>**Namerow hairpin · day · dry**<br/>![Namerow hairpin · day · dry](../../../artifacts/shots/tracks/mont_tremblant/s3-16-namerow__day-dry.jpg) |
| <br/>**Paddock Bend · day · dry**<br/>![Paddock Bend · day · dry](../../../artifacts/shots/tracks/mont_tremblant/s3-17-paddock-bend__day-dry.jpg) | <br/>**Landmark: control tower · day · dry**<br/>![Landmark: control tower · day · dry](../../../artifacts/shots/tracks/mont_tremblant/lm-control-tower__day-dry.jpg) | <br/>**Landmark: Hump crest cabin · day · dry**<br/>![Landmark: Hump crest cabin · day · dry](../../../artifacts/shots/tracks/mont_tremblant/lm-hump-crest-cabin__day-dry.jpg) |

## By weather and time of day — hero views (18 frames)

Six anchors × three `tod`/`weather` pairs (`weather()` applied per batch group).

| | | |
|:---:|:---:|:---:|
| <br/>**Hero: bridge chase · day · overcast**<br/>![Hero: bridge chase · day · overcast](../../../artifacts/shots/tracks/mont_tremblant/wx-bridge__day-overcast.jpg) | <br/>**Hero: bridge chase · day · rain**<br/>![Hero: bridge chase · day · rain](../../../artifacts/shots/tracks/mont_tremblant/wx-bridge__day-rain.jpg) | <br/>**Hero: bridge chase · dusk · dry**<br/>![Hero: bridge chase · dusk · dry](../../../artifacts/shots/tracks/mont_tremblant/wx-bridge__dusk-dry.jpg) |
| <br/>**Hero: Carousel · day · overcast**<br/>![Hero: Carousel · day · overcast](../../../artifacts/shots/tracks/mont_tremblant/wx-carousel__day-overcast.jpg) | <br/>**Hero: Carousel · dusk · dry**<br/>![Hero: Carousel · dusk · dry](../../../artifacts/shots/tracks/mont_tremblant/wx-carousel__dusk-dry.jpg) | <br/>**Hero: Carousel · night · dry**<br/>![Hero: Carousel · night · dry](../../../artifacts/shots/tracks/mont_tremblant/wx-carousel__night-dry.jpg) |
| <br/>**Hero: esses tunnel · dawn · dry**<br/>![Hero: esses tunnel · dawn · dry](../../../artifacts/shots/tracks/mont_tremblant/wx-esses__dawn-dry.jpg) | <br/>**Hero: esses tunnel · day · fog**<br/>![Hero: esses tunnel · day · fog](../../../artifacts/shots/tracks/mont_tremblant/wx-esses__day-fog.jpg) | <br/>**Hero: esses tunnel · day · storm**<br/>![Hero: esses tunnel · day · storm](../../../artifacts/shots/tracks/mont_tremblant/wx-esses__day-storm.jpg) |
| <br/>**Hero: The Hump chase · day · fog**<br/>![Hero: The Hump chase · day · fog](../../../artifacts/shots/tracks/mont_tremblant/wx-hump__day-fog.jpg) | <br/>**Hero: The Hump chase · dusk · dry**<br/>![Hero: The Hump chase · dusk · dry](../../../artifacts/shots/tracks/mont_tremblant/wx-hump__dusk-dry.jpg) | <br/>**Hero: The Hump chase · night · dry**<br/>![Hero: The Hump chase · night · dry](../../../artifacts/shots/tracks/mont_tremblant/wx-hump__night-dry.jpg) |
| <br/>**Hero: Namerow hairpin · day · wet**<br/>![Hero: Namerow hairpin · day · wet](../../../artifacts/shots/tracks/mont_tremblant/wx-namerow__day-wet.jpg) | <br/>**Hero: Namerow hairpin · dusk · dry**<br/>![Hero: Namerow hairpin · dusk · dry](../../../artifacts/shots/tracks/mont_tremblant/wx-namerow__dusk-dry.jpg) | <br/>**Hero: Namerow hairpin · night · dry**<br/>![Hero: Namerow hairpin · night · dry](../../../artifacts/shots/tracks/mont_tremblant/wx-namerow__night-dry.jpg) |
| <br/>**Hero: paddock orbit · day · rain**<br/>![Hero: paddock orbit · day · rain](../../../artifacts/shots/tracks/mont_tremblant/wx-paddock__day-rain.jpg) | <br/>**Hero: paddock orbit · dusk · dry**<br/>![Hero: paddock orbit · dusk · dry](../../../artifacts/shots/tracks/mont_tremblant/wx-paddock__dusk-dry.jpg) | <br/>**Hero: paddock orbit · night · dry**<br/>![Hero: paddock orbit · night · dry](../../../artifacts/shots/tracks/mont_tremblant/wx-paddock__night-dry.jpg) |

### Weather / lighting backlog

| Issue | Notes |
|--------|--------|
| Night track lamps | `furniture.lamp: "none"` — night heroes rely on preset ambient only |
| Montreal donor presets | Fog/rain/overcast may not match Laurentian sky (`docs/LIGHTING.md`) |
| Storm + fog in esses | Verify rain particles and exposure in hero frames |

## Findings (geometry + dress)

| Severity | Topic | Evidence |
|----------|--------|----------|
| Low | Clip T5/Carousel | `clip-audit` 1 severe @ frac 0.473 (baseline cap 1); bush×trunk — triaged T5 understory, still at cap |
| Fixed | Paddock Bend vans | `motorhome()` low on grade → `terrainYAt` hand-seat boxes (same as pit apron) |
| Info | Tree guard drops | `verify-track`: suppressed tree=14 (fold guard) |
| Info | Props tris | 208396 tris post-fix, within ratchet |
| Watch | Start orbit framing | Orbit through `grandstandEx` shell — camera choice, not missing mesh |

### Ranked improvements (circuit-scoped)

1. Done — Paddock Bend van footing.  
2. Done — 36-frame survey with official `shot.mjs` weather/TOD batch.  
3. Clip 0.473 — further bush winnow if baseline tightens.  
4. Montreal donor / lamp policy when look-survey opens.

## Verification

```text
node tools/track/verify-track.cjs mont_tremblant
→ OK mont_tremblant (surface folds 0, tree guard drops 14)

node tools/track/audit-circuit.cjs mont_tremblant
→ ok true; float 0; clip severe 1/1; coplanar 0; ground buried 1 (within baseline)
```
