# Bahrain International Circuit — scenery survey (2026-10-14)

**Circuit id:** `bahrain` · **Theme:** `desert` / `sceneryTheme: desert` · **Night race:** yes  
**Evidence:** headless TLX night captures under `/opt/cursor/artifacts/bahrain-survey/` (this session), `node tools/track/audit-circuit.cjs bahrain`, live site https://brycejmurrin.github.io/f1-game/ (menu parity with local).

## Code map

| Layer | Path | Role |
|--------|------|------|
| Def | `js/circuits/bahrain.js` | OSM centreline (`path.len` 5419 m), `startFrac: 0`, `sceneryStartFrac: 0.2250`, `terrainMat: SAND`, bank zones, turns/sectors, desert palette, sparse palms, pit on +1 |
| Scenery | `js/circuits/scenery/bahrain.js` | LAZY closure; frame constants `SF` / `T1F` / `FC` align dressing to the real pit straight and T1 after the 2026-10 start-line move |
| Registry | `js/track/tracks.js` | Resolves def + lazy `TrackScenery.bahrain`, builds road/terrain/props via `buildProps` |
| Shared builders | `js/track/scenery/build-props.js`, `models.js`, `nature.js`, `structures.js` | `groundPatch`, `mountain`, `grandstandEx`, `modelGroup`, kits |
| Brief | `docs/tracks/bahrain.md` | Authoritative landmark table and geology notes |
| Landmarks | `tests/data/landmarks/bahrain.json` | Required heroes: Sakhir Tower, main tribuna, control tower, University stand, Schumacher marker, Beyon stand |

**Frame note:** All `s` fractions inside `scenery/bahrain.js` are in the **scenery** frame (`sceneryStartFrac` 0.225). Racing lap fractions (e.g. T1 ≈ 0.104) differ; the engine applies `_sceneryShift` when consuming def tables.

## Theme and models

- **Materials:** `terrainMat: SAND`; custom `pal` warm desert fog/sun; kerbs and runoff per def.
- **Furniture:** sparse palms, cool-white `arm` lamps (`furniture.lamp: "arm"`).
- **Kit:** `circuitKit` hospitality + service compounds + recovery bay on the back straight.
- **Hero `modelGroup` ids:** `bahrain-sakhir-tower`, `bahrain-main-tribuna`, `bahrain-control-tower`, `bahrain-university-grandstand`, `bahrain-schumacher-corner`, `bahrain-beyon-grandstand`, `bahrain-start-gantry`, drag-strip cluster (lanes, Christmas tree, launch bleachers).
- **Backdrop:** distant Manama silhouette on the NNE straight (T3–T4 sector); dual ring of `mountain()` dunes at lap bounds + mid-lap wedges.
- **Night:** custom `floodMast` + `lampHead` Musco-style grids; `lightBank` pools; LED bands on Sakhir Tower (`ledFacadeBands`).

## Survey captures

| Ref | File | What it shows |
|-----|------|----------------|
| S01 | `01-pit-straight.png` | Start/finish: main tribuna left, pit wall, flood masts, cream buildings |
| S02 | `02-t1-hairpin.png` | T1 (Schumacher): hairpin runoff, Sakhir Tower / T1 stand zone |
| S03 | `03-t4-complex.png` | University / T4 area, grandstand stack |
| S04 | `04-t5-7-sweep.png` | Fast sweep sector, dunes and fencing |
| S05 | `05-t8-hairpin.png` | T8 downhill hairpin runoff |
| S06 | `06-t10-complex.png` | T9–10 technical section, Beyon stand side |
| S07 | `07-final-corner.png` | Final right onto pit straight |
| S08 | `08-sakhir-tower-approach.png` | Pit-straight sightline toward T1 tower mass |
| S09 | `09-midfield-dunes.png` | Mid-lap desert horizon and dune rings |
| S10 | `10-chase-pit-straight.png` | Chase cam night race on main straight |
| S11–S12 | `11-circuit-picker-ui.jpg`, `12-circuit-detail-ui.jpg` | Generic circuit select / detail UI (same chrome as live; picker row not re-shot for Bahrain id this session) |

**Perf (headless):** `bahrain` build ≈244k total verts, 190k prop tris after strip (`audit-circuit` props check); single-scene shot boot ~18 s for 10 frames batch on SwiftShader — acceptable for a dense desert ring.

## Node-VM audit (baseline)

```
verify-track: OK — 0 surface folds, min node radius 5.39 m
float: 0 floating clusters
clip: 0 severe (baseline 0)
coplanar: 1 spot (baseline 1) — midfield `groundPatch` service roads overlap
ground: buried 19, unsupported 1 → **after fix:** unsupported 0 (still within baseline)
props tris: 190674 (identical to baseline)
guard drops: mountain=3 (dunes shrunk where footprint reached tarmac)
```

## Visual findings

1. **Strengths:** Night read is strong — flood masts, warm pools, and cream grandstands match the brief. Sakhir Tower and main tribuna sit on the correct straight (post–`startFrac` fix). Drag strip + Christmas tree on the paddock side reads clearly in pit-straight views. Limestone shelf boxes break up flat sand in the west midfield. Kerb colour pop is correct.
2. **Horizon busyness:** The outer `mountain()` ring (72+60 instances) plus mid-lap wedges make the desert feel rolling rather than “blasted limestone shelf + low scrub” from `docs/tracks/bahrain.md` §1. Not a bug — stylistic density.
3. **Floating dunes (fixed this PR):** `ground-audit` reported one **unsupported** `duneWedge` foot (~0.37 m) using `pyMin` instead of local terrain. Seating wedges on `terrainYAt` clears unsupported while staying inside the buried budget.
4. **Midfield service roads:** `desertMidfieldDetail` `groundPatch` strips show one **flatCoplanar** overlap (~4.2 m²) at baseline — low z-fight risk at driving distance; attempted spacing tweak worsened coplanar count, so left for a shared `groundPatch` lift pass.
5. **Suppressed mountains:** Three `mountain()` calls still hit the on-track guard (logged as `mountain=3`); acceptable shrink-to-fit behaviour.
6. **Live parity:** Deployed `version.json` / menu flow matches local; no folded road or missing landmark reported on the shipped build for this id.

## Ranked improvements (not all done here)

| Priority | Item | Risk | Notes |
|----------|------|------|-------|
| P1 | Done — terrain-foot `duneWedge` | Low | Clears unsupported prop cluster |
| P2 | Thin outer dune ring count or swap some `mountain()` for flat limestone shelves on west flank | Low–med | Closer to geological brief; watch `props-tris` ratchet |
| P3 | Resolve midfield `groundPatch` coplanar without widening overlap (engine `patchSeq` lift already exists; may need shorter segments per loop) | Med | Touch only `bahrain.js` scenery or accept baseline |
| P4 | Day-mode pass — cool lamp heads vs dead masts | Low | Lighting-tuner / shot comparison |
| P5 | Re-shoot picker with Bahrain row focused | None | QA doc only |

## Fixes in this survey branch

- `duneWedge`: base Y from `terrainYAt` (−0.12 m) instead of global `pyMin`, matching `windTower` / tech sheds — **unsupported 0**, `verify-track` OK, `bahrain-foundation` pass.

## Verify commands

```sh
node tools/track/verify-track.cjs bahrain
node tools/track/audit-circuit.cjs bahrain
node tools/track/ground-audit.cjs bahrain --why
npm test -- tests/specs/bahrain-foundation.spec.js
```
