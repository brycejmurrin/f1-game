# Singapore (Marina Bay) — circuit survey

**Date:** 2026-10-14  
**Branch:** `cursor/singapore-survey-4545`  
**Brief:** [`docs/tracks/singapore.md`](../singapore.md)  
**Data:** `js/circuits/singapore.js` · `js/circuits/scenery/singapore.js` (lazy `TrackScenery.singapore`)

## Code map

| Layer | Role |
|--------|------|
| `js/circuits/singapore.js` | OSM centreline, `reverse: true` + `sceneryLapMirror: true`, night `street_night` palette, `dressingExclusions` (generic city vs `cityFront` overlap), sectors `[0.331, 0.68]`, 19 turn apexes |
| `js/circuits/scenery/singapore.js` | Landmarks (`modelGroup` required: Merlion, Parliament, Fullerton, Anderson), bay `waterBand`, portals (Sheares / finish underpass), `circuitKit` race control + pedestrian bridge, panel catch-fence, neon `cityFront` facades |
| `js/track/scenery/build-props.js` | `sceneryLapMirror` + `reverse`: k-keyed helpers remapped; `circuitKit` stays shift-only (see scenery header comments) |
| `tests/data/landmarks/singapore.json` | Required ids: `singapore-merlion`, `singapore-parliament-house`, `singapore-fullerton-hotel`, `singapore-anderson-bridge` |

**Themes / models:** `theme: street_night`, `sceneryTheme: street`, concrete verge (`terrainMat: CONCRETE`). Hero meshes: Marina Bay Sands, Supertrees, Esplanade domes, Helix, Flyer, Supreme Court + St Andrew’s, pit wave-roof hospitality block. Generic night city via `cityFront` + `backdrop` skyline band.

## Capture status

| Item | Status |
|------|--------|
| **Committed frames** | **36** JPEGs under `artifacts/shots/tracks/singapore/` (`git add -f`; max 1280px, q≈80, &lt;300 KB) |
| **Capture** | `shot.mjs --batch` with `--weather` + `--tod`; `--jpeg --present-timeout 90 --capture-retries 4 --wait 120` (SwiftShader default) |
| **Coverage** | 16 lap landmarks (night · dry) + 4 hero views (pit, Sands, Merlion, Flyer) with dawn/dusk/night and wet/rain/overcast/fog/storm |

## Offline audit (2026-10-14, post-fix tip)

```
node tools/track/verify-track.cjs singapore   → OK
node tools/track/audit-circuit.cjs singapore  → ok (buried 4/4, float 0, clip severe 1 at baseline, coplanar 7/7)
```

| Check | Result | Notes |
|--------|--------|--------|
| Centreline | 0 surface folds; min radius 5.51 m @ node 471 | |
| Float | 0 unsupported | |
| Ground | buried **4** (baseline), flatCoplanar 4 | Worst: bay reflection strips `singapore.js:302`, `floodMastRing` `singapore.js:714` |
| Clip | 1 severe @ racing `frac≈0.953` | `emitMerlion` addBox × addCone (within baseline cap 1) |
| Clip minor @ `frac≈0.000` | pit wave vs `start-light-cluster` overhead (~0.9 m) | Reported, not “fixed” (start-lights contract) |
| Props tris | ~314.8k | Night budget raised in spec (dense `cityFront`) |

## Findings (visual + audit)

### Strengths

- Night identity reads: cool zenith, emissive windows, neon billboards, bay water band + bumboats.
- Required landmarks present and grouped; anticlockwise lap + mirrored markings match real Marina Bay direction.
- Sheares / finish grade-aware `overheadSpan` portals; catch-fence panel run along walls.

### Issues (ranked)

| P | Issue | Evidence | Suggested fix |
|---|--------|----------|----------------|
| 1 | **Orbit views show neon “slabs” over the bay** | `01-pit-straight.jpg` (orbit); reflection strips loop `singapore.js` ~287–304 | Tighter water-only placement or lower emissive; needs per-strip terrain sample (survey after wx tooling) |
| 2 | **Merlion severe clip** (baseline) | `clip-audit` @ 0.953, addBox × addCone | Shrink head/jet overlap in `emitMerlion` (partial jet shorten applied) |
| 3 | **Buried reflection strips** (within baseline) | `ground-audit` line 302, up to ~0.67 m | Skip or seat on `terrainYAt` when quay &gt; water plane |
| 4 | **Pit wave vs start gantry** | minor clip @ 0.000 | Pit wave height reduced slightly; full fix risks start-light clearance |
| 5 | **Lamp dressing** | `dressingExclusions` lamps `s0:0,s1:1` | Intentional — street uses flood pools / building light, not track lamps |
| 6 | **Weather-specific (not yet shot)** | — | Re-run matrix after shared shot PR: rain road specular, fog vs `pal.fogDensity`, overcast flat CBD |

### Performance

- ~315k prop tris, ~335k total verts after instancing; heavy for SwiftShader batch capture — use `APEX_GL=llvmpipe` + `webgl2` for surveys; avoid WGX orbit on bay-facing fracs (black-frame / soft-present timeouts observed).

## Fixes applied this branch (singapore scenery only)

1. **Pit wave-roof hospitality** — slightly lower massing to ease overhead clash with start-light cluster (`singapore-pit-wave-roof`).
2. **Merlion jet** — shorter spout cones (less overlap with head geometry).

Bay reflection strip logic **unchanged** from deploy (loosening skip raised buried 4→5 and failed ground gate).

---

## Screenshot panels (36 frames)

Each cell: **view** · time of day · weather · camera.

| **pit straight** · night · dry · orbit<br/>![s1-pit-straight](../../../artifacts/shots/tracks/singapore/s1-pit-straight__night-dry__orbit.jpg) | **turn1 complex** · night · dry · park<br/>![s1-turn1-complex](../../../artifacts/shots/tracks/singapore/s1-turn1-complex__night-dry__park.jpg) | **sheares underpass** · night · dry · park<br/>![s1-sheares-underpass](../../../artifacts/shots/tracks/singapore/s1-sheares-underpass__night-dry__park.jpg) |
| :---: | :---: | :---: |
| **marina bay sands** · night · dry · park<br/>![s1-marina-bay-sands](../../../artifacts/shots/tracks/singapore/s1-marina-bay-sands__night-dry__park.jpg) | **supertrees** · night · dry · park<br/>![s1-supertrees](../../../artifacts/shots/tracks/singapore/s1-supertrees__night-dry__park.jpg) | **hotel billboards** · night · dry · park<br/>![s1-hotel-billboards](../../../artifacts/shots/tracks/singapore/s1-hotel-billboards__night-dry__park.jpg) |
| :---: | :---: | :---: |
| **bay skyline** · night · dry · park<br/>![s2-bay-skyline](../../../artifacts/shots/tracks/singapore/s2-bay-skyline__night-dry__park.jpg) | **fullerton hotel** · night · dry · park<br/>![s2-fullerton-hotel](../../../artifacts/shots/tracks/singapore/s2-fullerton-hotel__night-dry__park.jpg) | **merlion park** · night · dry · park<br/>![s2-merlion-park](../../../artifacts/shots/tracks/singapore/s2-merlion-park__night-dry__park.jpg) |
| :---: | :---: | :---: |
| **anderson bridge** · night · dry · park<br/>![s2-anderson-bridge](../../../artifacts/shots/tracks/singapore/s2-anderson-bridge__night-dry__park.jpg) | **esplanade** · night · dry · park<br/>![s2-esplanade](../../../artifacts/shots/tracks/singapore/s2-esplanade__night-dry__park.jpg) | **parliament house** · night · dry · park<br/>![s2-parliament-house](../../../artifacts/shots/tracks/singapore/s2-parliament-house__night-dry__park.jpg) |
| :---: | :---: | :---: |
| **helix bridge** · night · dry · park<br/>![s3-helix-bridge](../../../artifacts/shots/tracks/singapore/s3-helix-bridge__night-dry__park.jpg) | **singapore flyer** · night · dry · park<br/>![s3-singapore-flyer](../../../artifacts/shots/tracks/singapore/s3-singapore-flyer__night-dry__park.jpg) | **finish underpass** · night · dry · park<br/>![s3-finish-underpass](../../../artifacts/shots/tracks/singapore/s3-finish-underpass__night-dry__park.jpg) |
| :---: | :---: | :---: |
| **pit gantry** · night · dry · park<br/>![s3-pit-gantry](../../../artifacts/shots/tracks/singapore/s3-pit-gantry__night-dry__park.jpg) | **pit** · dawn · dry · park<br/>![hero-pit](../../../artifacts/shots/tracks/singapore/hero-pit__dawn-dry__park.jpg) | **pit** · dusk · dry · park<br/>![hero-pit](../../../artifacts/shots/tracks/singapore/hero-pit__dusk-dry__park.jpg) |
| :---: | :---: | :---: |
| **pit** · day · wet · park<br/>![hero-pit](../../../artifacts/shots/tracks/singapore/hero-pit__day-wet__park.jpg) | **pit** · day · rain · park<br/>![hero-pit](../../../artifacts/shots/tracks/singapore/hero-pit__day-rain__park.jpg) | **pit** · day · overcast · park<br/>![hero-pit](../../../artifacts/shots/tracks/singapore/hero-pit__day-overcast__park.jpg) |
| :---: | :---: | :---: |
| **sands** · dawn · dry · park<br/>![hero-sands](../../../artifacts/shots/tracks/singapore/hero-sands__dawn-dry__park.jpg) | **sands** · dusk · dry · park<br/>![hero-sands](../../../artifacts/shots/tracks/singapore/hero-sands__dusk-dry__park.jpg) | **sands** · day · wet · park<br/>![hero-sands](../../../artifacts/shots/tracks/singapore/hero-sands__day-wet__park.jpg) |
| :---: | :---: | :---: |
| **sands** · day · rain · park<br/>![hero-sands](../../../artifacts/shots/tracks/singapore/hero-sands__day-rain__park.jpg) | **sands** · day · fog · park<br/>![hero-sands](../../../artifacts/shots/tracks/singapore/hero-sands__day-fog__park.jpg) | **merlion** · dawn · dry · park<br/>![hero-merlion](../../../artifacts/shots/tracks/singapore/hero-merlion__dawn-dry__park.jpg) |
| :---: | :---: | :---: |
| **merlion** · dusk · dry · park<br/>![hero-merlion](../../../artifacts/shots/tracks/singapore/hero-merlion__dusk-dry__park.jpg) | **merlion** · night · dry · park<br/>![hero-merlion](../../../artifacts/shots/tracks/singapore/hero-merlion__night-dry__park.jpg) | **merlion** · day · wet · park<br/>![hero-merlion](../../../artifacts/shots/tracks/singapore/hero-merlion__day-wet__park.jpg) |
| :---: | :---: | :---: |
| **merlion** · day · storm · park<br/>![hero-merlion](../../../artifacts/shots/tracks/singapore/hero-merlion__day-storm__park.jpg) | **flyer** · dawn · dry · park<br/>![hero-flyer](../../../artifacts/shots/tracks/singapore/hero-flyer__dawn-dry__park.jpg) | **flyer** · dusk · dry · park<br/>![hero-flyer](../../../artifacts/shots/tracks/singapore/hero-flyer__dusk-dry__park.jpg) |
| :---: | :---: | :---: |
| **flyer** · night · dry · park<br/>![hero-flyer](../../../artifacts/shots/tracks/singapore/hero-flyer__night-dry__park.jpg) | **flyer** · day · overcast · park<br/>![hero-flyer](../../../artifacts/shots/tracks/singapore/hero-flyer__day-overcast__park.jpg) | **flyer** · day · fog · park<br/>![hero-flyer](../../../artifacts/shots/tracks/singapore/hero-flyer__day-fog__park.jpg) |
| :---: | :---: | :---: |

## Hero weather / lighting matrix

| View | dawn dry | dusk dry | night dry | wet | rain | overcast | fog | storm |
|------|----------|----------|-----------|-----|------|----------|-----|-------|
| Pit `s≈0` | captured | captured | sector orbit | captured | captured | captured | — | — |
| Sands `s≈0.18` | captured | captured | sector park | captured | captured | — | captured | — |
| Merlion `s≈0.58` | captured | captured | captured | captured | — | — | — | captured |
| Flyer `s≈0.86` | captured | captured | captured | — | — | captured | captured | — |


## Survey backlog (post–wx tooling)

- [ ] Complete 4-hero × 7-mode matrix; log rain streaks, wet road darkening, fog vs building emissive balance.
- [ ] Orbit hero pack for Sands / Merlion / Flyer (park shots exist; orbit timed out on WGX without llvmpipe).
- [ ] Re-evaluate reflection strips with orbit regression shot at `s=0` day + night.
- [ ] Optional: merlion clip below severe threshold without raising `clip-baseline.json`.
