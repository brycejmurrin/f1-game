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
| **Night dry (TLX / webgl2, park + orbit)** | 16 frames captured (see grids below) |
| **Weather / TOD matrix** | **Pending** — blocked until shared PR *tools: shared shot tooling for circuit surveys* lands `wx` batch on `shot.mjs` / track-session and `.gitignore` exception for `artifacts/shots/tracks/**` |
| **Repo paths** | Frames staged at `artifacts/shots/tracks/singapore/*.jpg` (currently under root `artifacts/` gitignore; will commit after rebase on shared tooling PR) |

**Planned weather/lighting repeats (4 hero views × 7 modes, ~28 frames):** pit straight `s≈0`, Marina Bay Sands `s≈0.18`, Merlion `s≈0.58`, Flyer `s≈0.86` — `dry`, `wet`, `rain`, `overcast`, `fog` plus `dusk` / `dawn` / `night` via `__apex.weather()` + `setTimeOfDay()` ([`docs/DEBUG-HOOKS.md`](../../DEBUG-HOOKS.md)).

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

## Screenshot grids — Sector 1 (racing `s` 0.00–0.33, night dry)

Filenames under `artifacts/shots/tracks/singapore/` (committed after shared shot-tooling PR). PR body carries inline panels until then.

| Pit straight (orbit) | CBD towers (orbit) | CBD (park) |
|:---:|:---:|:---:|
| `01-pit-straight.jpg` | `02-cbd-towers.jpg` | `02-cbd-towers-drive.jpg` |

| Sheares underpass | Marina Bay Sands | Supertrees |
|:---:|:---:|:---:|
| `03-sheares-underpass.jpg` | `04-marina-bay-sands.jpg` | `05-supertrees.jpg` |

| Hotel / billboards |
|:---:|
| `06-hotel-billboards.jpg` |

## Sector 2 (`s` 0.33–0.68, night dry)

| Bay skyline | Fullerton | Merlion |
|:---:|:---:|:---:|
| `07-bay-skyline.jpg` | `08-fullerton.jpg` | `09-merlion.jpg` |

| Anderson Bridge | Esplanade |
|:---:|:---:|
| `10-anderson-bridge.jpg` | `11-esplanade.jpg` |

## Sector 3 (`s` 0.68–1.00, night dry)

| Padang | Helix Bridge | Singapore Flyer |
|:---:|:---:|:---:|
| `12-padang.jpg` | `13-helix-bridge.jpg` | `14-flyer.jpg` |

| Finish underpass |
|:---:|
| `15-finish-underpass.jpg` |

## Weather / lighting matrix (pending shared tooling)

| View | dry day | wet | rain | overcast | fog | dusk | dawn | night |
|------|---------|-----|------|----------|-----|------|------|-------|
| Pit `s≈0` | pending | pending | pending | pending | pending | pending | pending | captured |
| Sands `s≈0.18` | pending | pending | pending | pending | pending | pending | pending | captured |
| Merlion `s≈0.58` | pending | pending | pending | pending | pending | pending | pending | captured |
| Flyer `s≈0.86` | pending | pending | pending | pending | pending | pending | pending | captured |

After rebase: fill this table with `artifacts/shots/tracks/singapore/hero-*__{tod}-{wx}.jpg` frames (target 30–36 total).

## Survey backlog (post–wx tooling)

- [ ] Complete 4-hero × 7-mode matrix; log rain streaks, wet road darkening, fog vs building emissive balance.
- [ ] Orbit hero pack for Sands / Merlion / Flyer (park shots exist; orbit timed out on WGX without llvmpipe).
- [ ] Re-evaluate reflection strips with orbit regression shot at `s=0` day + night.
- [ ] Optional: merlion clip below severe threshold without raising `clip-baseline.json`.
