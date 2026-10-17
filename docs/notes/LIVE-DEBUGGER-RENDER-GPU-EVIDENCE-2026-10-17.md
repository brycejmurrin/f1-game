# Render evidence on a drawing runner, 2026-10-17

No player-facing change. This closes the real-GPU evidence gaps tracked by
#2572 and #1651. Timing numbers in this note come only from GitHub's
`macos-latest` Metal runner; software-renderer observations are labelled.

## Provenance

| item | revision |
|---|---|
| Race-entry attribution (slice 1, PR #571) | `d2375da1539c755761281a39410c3e1f5b7002dd` |
| Warm-gated flyby (slice 2, PR #575) | `e86df65a996ca2448308fff2c6eac114ca98d6dc` |
| Current deploy baseline for the render sweep | `3d1a8d547` |

The #1651 comparison uses the slice-1 commit as the before arm and the
slice-2 commit as the after arm, so both arms expose the same
`raceEntry.blockMs` and named-span instrumentation.

## Race-entry results

Measurement in progress. Each arm runs `gpu-census.yml` on `macos-latest`
with the player-facing menu entry and native presentation.

| circuit | backend | before slice 2: contiguous / total | after slice 2: contiguous / total | named-span delta |
|---|---|---:|---:|---|
| vegas | TLX / Metal | pending | pending | pending |
| spa | TLX / Metal | pending | pending | pending |

## TLX and GLX scenario matrix

Measurement in progress. The verdict requires a drawing frame and records
resource counts after warm-up, JavaScript errors, GPU errors, and whether a
context-loss recovery ends on a newly presented frame.

| scenario | TLX | GLX |
|---|---|---|
| bahrain/monaco rebuild A/B ×3 | pending | pending |
| context loss during build and backend switch | pending | pending |
| quality shed/restore with mirror, shadow and post live | pending | pending |
| visibility/pageshow and 844×390 ↔ 390×844 | pending | pending |
| night floodlights, mirror and material-pack toggles | pending | pending |

## Historical evidence excluded

The original live-debugger sweep remains useful functional evidence, but its
TLX resource rows were headless or SwiftShader and therefore are not counted
as real-GPU timing evidence here. Existing `gpu-census.yml` runs on unrelated
commits or circuits are also excluded: single-shot frame timing varies enough
that only matched arms on the requested revisions answer #1651.
