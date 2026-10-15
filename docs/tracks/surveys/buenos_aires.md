# Buenos Aires (Autódromo Oscar y Juan Gálvez) — circuit survey

**Survey date:** 2026-10-14  
**Layout:** Classic No.6 (`classic: true`), clockwise, ~4.3 km  
**Brief:** `docs/tracks/buenos_aires.md`  
**Shots:** `../../../artifacts/shots/tracks/buenos_aires/` (30 JPEGs, q≈80, ≤1280 px wide)

## Code map

| Layer | Path |
|-------|------|
| Def | `js/circuits/buenos_aires.js` |
| Scenery | `js/circuits/scenery/buenos_aires.js` |
| Landmarks | `tests/data/landmarks/buenos_aires.json` |

## Fixes (this branch)

- `furniture.sparse: true` — removes kit plane-tree cluster coplanar (~5 m²).
- `dressingExclusions` foliage s 0.77–0.89 side −1 — hand plane avenue on back straight without kit overlap.
- Infield lake albedo slightly richer for Recta del Lago readability.

## Audit (post-fix)

`node tools/track/audit-circuit.cjs buenos_aires` — verify/float/clip/coplanar OK; coplanar 0; props ~188k tris.

**Deferred:** wet/rain/overcast/fog panels after shared shot tooling PR (re-capture 4 anchors only).

---

## Sector 1 — pit straight → T1 (dry, day unless noted)

| | | |
|:---:|:---:|:---:|
| ![Start / pit straight — park, day, dry](../../../artifacts/shots/tracks/buenos_aires/s1-start_day_park.jpg)<br>**s1-start** · park · day · dry | ![Turn 1 — park, day, dry](../../../artifacts/shots/tracks/buenos_aires/s1-t1_day_park.jpg)<br>**s1-t1** · park · day · dry | ![Plane avenue — park, day, dry](../../../artifacts/shots/tracks/buenos_aires/s1-avenue_day_park.jpg)<br>**s1-avenue** · park · day · dry |
| ![Mid sector 1 — park, day, dry](../../../artifacts/shots/tracks/buenos_aires/s1-mid_day_park.jpg)<br>**s1-mid** · park · day · dry | ![Main terrace — park, day, dry](../../../artifacts/shots/tracks/buenos_aires/lm-terrace-main_day_park.jpg)<br>**lm-terrace-main** · park · day · dry | ![Start — park, dusk, dry](../../../artifacts/shots/tracks/buenos_aires/lit-start_dusk_park.jpg)<br>**lit-start** · park · dusk · dry |
| ![Start — park, night, dry](../../../artifacts/shots/tracks/buenos_aires/lit-start_night_park.jpg)<br>**lit-start** · park · night · dry | | |

## Sector 2 — Curvón Salotto & esses (dry, day unless noted)

| | | |
|:---:|:---:|:---:|
| ![Curvón — park, day, dry](../../../artifacts/shots/tracks/buenos_aires/s2-curvon_day_park.jpg)<br>**s2-curvon** · park · day · dry | ![Inside Curvón — park, day, dry](../../../artifacts/shots/tracks/buenos_aires/s2-inside_day_park.jpg)<br>**s2-inside** · park · day · dry | ![Esses — park, day, dry](../../../artifacts/shots/tracks/buenos_aires/s2-esses_day_park.jpg)<br>**s2-esses** · park · day · dry |
| ![Hairpin crowd — park, day, dry](../../../artifacts/shots/tracks/buenos_aires/s2-hairpin_day_park.jpg)<br>**s2-hairpin** · park · day · dry | ![Curvón terrace — eye, day, dry](../../../artifacts/shots/tracks/buenos_aires/lm-terrace_day_eye.jpg)<br>**lm-terrace** · eye · day · dry | ![Curvón — orbit, day, dry](../../../artifacts/shots/tracks/buenos_aires/s2-curvon-orbit_day_orbit.jpg)<br>**s2-curvon-orbit** · orbit · day · dry |
| ![Curvón — park, dusk, dry](../../../artifacts/shots/tracks/buenos_aires/lit-curvon_dusk_park.jpg)<br>**lit-curvon** · park · dusk · dry | ![Curvón — park, night, dry](../../../artifacts/shots/tracks/buenos_aires/lit-curvon_night_park.jpg)<br>**lit-curvon** · park · night · dry | |

## Sector 3 — Recta del Lago → finish (dry, day unless noted)

| | | |
|:---:|:---:|:---:|
| ![Recta del Lago — park, day, dry](../../../artifacts/shots/tracks/buenos_aires/s3-lago_day_park.jpg)<br>**s3-lago** · park · day · dry | ![Confitería — park, day, dry](../../../artifacts/shots/tracks/buenos_aires/s3-confiteria_day_park.jpg)<br>**s3-confiteria** · park · day · dry | ![Talud gate — park, day, dry](../../../artifacts/shots/tracks/buenos_aires/s3-talud_day_park.jpg)<br>**s3-talud** · park · day · dry |
| ![Portico — park, day, dry](../../../artifacts/shots/tracks/buenos_aires/s3-portico_day_park.jpg)<br>**s3-portico** · park · day · dry | ![Control tower / finish — park, day, dry](../../../artifacts/shots/tracks/buenos_aires/s3-tower_day_park.jpg)<br>**s3-tower** · park · day · dry | ![Lago — park, dusk, dry](../../../artifacts/shots/tracks/buenos_aires/lit-lago_dusk_park.jpg)<br>**lit-lago** · park · dusk · dry |
| ![Lago — park, night, dry](../../../artifacts/shots/tracks/buenos_aires/lit-lago_night_park.jpg)<br>**lit-lago** · park · night · dry | ![Portico — park, dusk, dry](../../../artifacts/shots/tracks/buenos_aires/lit-portico_dusk_park.jpg)<br>**lit-portico** · park · dusk · dry | ![Portico — park, night, dry](../../../artifacts/shots/tracks/buenos_aires/lit-portico_night_park.jpg)<br>**lit-portico** · park · night · dry |

## Landmarks & context (dry, day)

| | | |
|:---:|:---:|:---:|
| ![Park lake — orbit, day, dry](../../../artifacts/shots/tracks/buenos_aires/lm-lake_day_orbit.jpg)<br>**lm-lake** · orbit · day · dry | ![Confitería — trackside, day, dry](../../../artifacts/shots/tracks/buenos_aires/lm-confiteria_day_trackside.jpg)<br>**lm-confiteria** · trackside · day · dry | ![Portico — cinematic, day, dry](../../../artifacts/shots/tracks/buenos_aires/lm-portico_day_cinematic.jpg)<br>**lm-portico** · cinematic · day · dry |
| ![Pit / tower — orbit, day, dry](../../../artifacts/shots/tracks/buenos_aires/lm-pit_day_orbit.jpg)<br>**lm-pit** · orbit · day · dry | ![Circuit map — orbit, day, dry](../../../artifacts/shots/tracks/buenos_aires/lm-map_day_orbit.jpg)<br>**lm-map** · orbit · day · dry | ![Apartment horizon — orbit, day, dry](../../../artifacts/shots/tracks/buenos_aires/lm-apt_day_orbit.jpg)<br>**lm-apt** · orbit · day · dry |

## Backlog

| P | Item | Status |
|---|------|--------|
| 1 | Kit plane coplanar | Fixed (`sparse`) |
| 2 | Back-straight double trees | Fixed (exclusion) |
| 3 | Lake contrast | Fixed (albedo) |
| 4 | Weather matrix (wet/rain/fog/overcast) | Deferred — shared shot PR |
| 5 | Night globe lamps weak (`def.night: false`) | Note; dusk/night TOD only |
| 6 | Confitería / lake world position UNCERTAIN | Document only |
