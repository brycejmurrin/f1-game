# Bahrain International Circuit — scenery survey (2026-10-14)

**Circuit id:** `bahrain` · **Theme:** `desert` · **Night GP:** yes  
**Live:** https://brycejmurrin.github.io/f1-game/ · **Brief:** `docs/tracks/bahrain.md`

## Capture status

| Item | Detail |
|------|--------|
| **Committed shots** | **10** JPEGs under `artifacts/shots/tracks/bahrain/` (night, dry) — full batch re-capture blocked in this VM by `black-scene-with-edge-content`; expand to 34-frame TOD + weather matrix after shared shot tooling PR |
| **Weather API** | `__apex.weather("dry"\|"wet"\|"rain"\|"overcast"\|"fog")` + `setTimeOfDay` — weather rows not captured yet |

## Code map

| Layer | Path |
|--------|------|
| Def | `js/circuits/bahrain.js` |
| Scenery | `js/circuits/scenery/bahrain.js` |
| Landmarks | `tests/data/landmarks/bahrain.json` |

## Panel grids — all committed shots (night · dry)

Relative image paths resolve from this file.

### Row 1 — Sector 1

| | | |
|:---:|:---:|:---:|
| ![S1 pit straight](../../../artifacts/shots/tracks/bahrain/s1-pit-straight-night-dry.jpg) **S1 pit straight** · dry · night | ![S1 T1](../../../artifacts/shots/tracks/bahrain/s1-t1-schumacher-night-dry.jpg) **S1 T1 Schumacher** · dry · night | ![Sakhir Tower](../../../artifacts/shots/tracks/bahrain/s1-sakhir-tower-night-dry.jpg) **S1 Sakhir Tower** · dry · night |

### Row 2 — Sector 2

| | | |
|:---:|:---:|:---:|
| ![S2 T4](../../../artifacts/shots/tracks/bahrain/s2-t4-university-night-dry.jpg) **S2 T4 University** · dry · night | ![S2 sweep](../../../artifacts/shots/tracks/bahrain/s2-t567-sweep-night-dry.jpg) **S2 T5–T7 sweep** · dry · night | ![S2 T8](../../../artifacts/shots/tracks/bahrain/s2-t8-hairpin-night-dry.jpg) **S2 T8 hairpin** · dry · night |

### Row 3 — Sector 3

| | | |
|:---:|:---:|:---:|
| ![S3 T10](../../../artifacts/shots/tracks/bahrain/s3-t10-beyon-night-dry.jpg) **S3 T9–10 Beyon** · dry · night | ![S3 final](../../../artifacts/shots/tracks/bahrain/s3-final-corner-night-dry.jpg) **S3 final corner** · dry · night | ![S3 midfield](../../../artifacts/shots/tracks/bahrain/s3-midfield-dunes-night-dry.jpg) **S3 midfield dunes** · dry · night |

### Row 4 — Driving view

| | | |
|:---:|:---:|:---:|
| ![S1 chase](../../../artifacts/shots/tracks/bahrain/s1-pit-chase-night-dry.jpg) **S1 pit chase cam** · dry · night | | |

## Audit & fix (this branch)

- `duneWedge` → `terrainYAt` footing; `ground-audit` **unsupported 0**
- `verify-track` / `audit-circuit` OK; coplanar 1 at baseline (`groundPatch` midfield)

## Weather / lighting backlog

| ID | Condition | Notes |
|----|-----------|--------|
| W-L1 | Night dry (captured) | Floods + LED tower read well |
| W-L2 | Day / dusk / dawn | Not captured — mast emissive vs sky TBD |
| W-L3 | Wet / rain / overcast / fog | Deferred — shared batch `weather()` |

## Verify

```sh
node tools/track/verify-track.cjs bahrain
node tools/track/audit-circuit.cjs bahrain
```
