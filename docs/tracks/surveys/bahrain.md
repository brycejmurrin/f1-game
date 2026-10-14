# Bahrain International Circuit — scenery survey (2026-10-14)

**Circuit id:** `bahrain` · **Theme:** `desert` / `sceneryTheme: desert` · **Night GP:** yes  
**Live:** https://brycejmurrin.github.io/f1-game/ · **Brief:** `docs/tracks/bahrain.md`

## Capture status (2026-10-14)

| Item | Status |
|------|--------|
| **Planned panel set** | 34 frames — every sector landmark at **day**; **dusk / dawn / night** on six key views plus Sakhir Tower and back straight (see `artifacts/shots/tracks/bahrain/batch-jobs.json`, local only until shared `artifacts/shots/tracks/**` gitignore exception lands) |
| **Weather matrix** | **Deferred** — `dry` / `wet` / `rain` / `overcast` / `fog` batch capture waits on shared PR *tools: shared shot tooling for circuit surveys* (`__apex.weather()` in batch jobs + retries). Rebase this branch after that PR, re-run the weather rows in the backlog below. |
| **Evidence on this branch** | Nine **night** headless frames from an earlier successful `shot.mjs` pass (listed below; filenames under `artifacts/shots/tracks/bahrain/` when copied locally). New batch runs in this VM failed `black-scene-with-edge-content` on the pixel gate — same blocker the shared tooling PR addresses. |

**Engine API (for follow-up weather pass):** `__apex.setTimeOfDay("dawn"|"day"|"dusk"|"night")` and `__apex.weather("dry"|"wet"|"rain"|"overcast"|"fog")` (`js/agent/apex.js`).

## Code map

| Layer | Path | Role |
|--------|------|------|
| Def | `js/circuits/bahrain.js` | OSM centreline, `startFrac: 0`, `sceneryStartFrac: 0.2250`, `terrainMat: SAND`, bank zones, desert palette |
| Scenery | `js/circuits/scenery/bahrain.js` | LAZY closure; `SF` / `T1F` / `FC` frame constants for pit straight + T1 dressing |
| Registry | `js/track/tracks.js` | Def + `TrackScenery.bahrain` → `buildProps` |
| Landmarks | `tests/data/landmarks/bahrain.json` | Required heroes (Sakhir Tower, tribuna, control tower, University, Schumacher, Beyon) |

## Theme and models

- **Terrain:** `SAND`; warm fog/sun `pal`; sparse palms; cool `arm` lamps.
- **Heroes:** `bahrain-sakhir-tower`, `bahrain-main-tribuna`, `bahrain-control-tower`, `bahrain-university-grandstand`, `bahrain-schumacher-corner`, `bahrain-beyon-grandstand`, drag strip + Christmas tree, Manama backdrop on T3–T4 NNE leg.
- **Night identity:** Musco-style `floodMast` + `lampHead`, `lightBank` pools, LED façade on Sakhir Tower.

## Panel grids — by sector (night reference pass)

Filenames below match the committed panel set under `artifacts/shots/tracks/bahrain/` after the shared gitignore exception and re-capture land. PR description carries the actual PNGs until then.

### Sector 1 — pit straight & T1

| Frame | File | Caption |
|:---:|:---|:---|
| S1-A | `01-pit-straight.png` | Pit straight — tribuna, pits, floods |
| S1-B | `02-t1-hairpin.png` | T1 Schumacher — tower zone |
| S1-C | `08-sakhir-tower-approach.png` | Sakhir Tower sightline |

### Sector 2 — University & sweep

| Frame | File | Caption |
|:---:|:---|:---|
| S2-A | `03-t4-complex.png` | T4 University grandstands |
| S2-B | `04-t5-7-sweep.png` | T5–T7 fast sweep |
| S2-C | `05-t8-hairpin.png` | T8 downhill hairpin |

### Sector 3 — technical complex & finish

| Frame | File | Caption |
|:---:|:---|:---|
| S3-A | `06-t10-complex.png` | T9–10 Beyon side |
| S3-B | `07-final-corner.png` | Final corner |
| S3-C | `09-midfield-dunes.png` | Midfield dunes / horizon ring |

## Panel grids — lighting plan (pending re-capture)

Six **key views** (`s1-pit-straight`, `s1-t1-schumacher`, `s2-t4-university`, `s2-t567-sweep`, `s2-t8-hairpin`, `s3-t10-beyon`) plus `s1-sakhir-tower` and `s3-back-straight` get **dusk / dawn / night** rows in `batch-jobs.json`. After the shared shot PR, fill tables like:

| Day (dry) | Dusk (dry) | Night (dry) |
|:---:|:---:|:---:|
| `{view}-day.png` | `{view}-dusk.png` | `{view}-night.png` |

## Weather / lighting backlog (not fixed this PR)

| ID | View / condition | Finding | Fix scope |
|----|------------------|---------|-----------|
| W-L1 | Night — all sectors | Flood pools and LED tower read well; lamp heads visible at distance | None |
| W-L2 | Night — pit straight | Chase cam (`10-chase-pit-straight.png` in session artifacts) confirms race lighting; trackside slightly dark on paddock fence | Low — optional `lightBank` pool on one mast (scenery only) after day/night A/B |
| W-L3 | Day (not captured) | Cool-white masts may read as bare poles until lamps emissive — known desert theme behaviour | `lighting-tuner` / day pass after weather PR |
| W-L4 | Wet / rain / fog | **Not shot** — expect wetness on sand verges + fog density from `pal.fogDensity`; verify no pink runoff slabs return | Re-survey after `weather()` batch works |
| W-L5 | Midfield `groundPatch` | 1× flatCoplanar (~4.2 m²) service-road overlap at baseline | Engine `groundPatch` lift or shorter segments — do not loosen baseline |
| W-L6 | Dusk / dawn | **Not shot** — check Sakhir LED vs sky ambient mismatch | Visual pass post-rebase |

## Node-VM audit (this branch)

```
verify-track: OK — 0 surface folds
audit-circuit: ok — float 0, clip 0, coplanar 1 (baseline), ground within baseline, unsupported 0 after duneWedge fix
props tris: 190713 (Δ +39 vs prior baseline — dune footing only; props ratchet unchanged)
```

## Scenery fix (this PR)

- **`duneWedge`:** foot Y from `terrainYAt(…) − 0.12` instead of global `pyMin` — clears the single **unsupported** cluster (`ground-audit`).

## Ranked improvements (circuit-scoped)

| P | Item | Risk |
|---|------|------|
| 1 | Done — `duneWedge` terrain foot | Low |
| 2 | After shared shot PR — full 34-frame TOD + weather matrix | None (process) |
| 3 | Thin outer `mountain()` ring / more limestone shelves (west flank) | Med |
| 4 | Midfield `groundPatch` coplanar | Med (may need engine) |

## Verify

```sh
node tools/track/verify-track.cjs bahrain
node tools/track/audit-circuit.cjs bahrain
node tools/track/ground-audit.cjs bahrain --why
npm test -- tests/specs/bahrain-foundation.spec.js
```
