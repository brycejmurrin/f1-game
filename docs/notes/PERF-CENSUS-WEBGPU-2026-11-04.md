# Perf census on three's WebGPU backend (lavapipe), first measurements

Kind: measurement · Re-measure-by: 2027-01-15

Issue #4783, PR #4796. `node tools/gfx/pass-census.mjs monaco --webgpu --camera chase|helmet --frames 60 --warm 60`
and `node tools/gfx/res-scale-census.mjs --track monaco --webgpu`, run by `.github/workflows/perf-census-webgpu.yml`
on Mesa lavapipe (ubuntu-latest). Software skips batches (`skipBatches: true`), so these are not hardware numbers.
Bryce's iPhone path is this backend (D-013); until now every census pinned `apex26.tlxForceGL=1`.

## pass-census, calls and triangles per frame

| camera | run | output 640x360 | output 230x66 (mirror) | rt 256x256 | rt 512x512 (shadow) | total calls | total tris |
|---|---|---|---|---|---|---|---|
| chase | 1 | 32.7 / 157619 | - | 1 / 16824 | 0.1 / 7312 | 49.9 | 181771 |
| chase | 2 | 32.8 / 157748 | - | 1 / 16824 | 0.2 / 9770 | 50.1 | 184358 |
| helmet | 1 | 35.7 / 152936 | 10 / 115097 | 1 / 15496 | 0.1 / 7318 | 62.9 | 290863 |
| helmet | 2 | 35.9 / 153097 | 10 / 112055 | 1 / 15496 | 0.1 / 9770 | 63.2 | 290434 |

Cells are calls / triangles per frame. The small post targets (320x180 to 20x11, TLXPostLDR) are 1 to 7 calls each and 1 triangle.

**The counts are not exact between runs.** Main-pass calls move by 0.1 to 0.2 per frame, and the shadow target
(`rt 512x512`) fires on a different number of the 60 frames. So an EXACT gate on these would flake. The issue asked for
exact baselines on the "deterministic jump scenario"; on lavapipe the scenario is not frame-deterministic. A gate needs
either a fixed frame schedule (`--park` freezes the camera and pins tier and resolution) or a stated tolerance, which is
a decision for Bryce, not something to widen to get green.

## res-scale-census (scales 1, .9, .8, .7, .6, .5, .7, 1)

`rtResizes` stayed at 2 for the whole sweep, and the post target stayed 960x540 at every scale including 0.5. So either
`renderScale()` does not resize the post targets on the WebGPU path, or the sweep did not take effect on lavapipe. Not
yet told apart. Live textures: 27 at start, 28 at 0.9, 29 from 0.8 on, and still 29 after returning to 1. The issue's
check "textures after 1 to 0.6 to 1 equal the start" would fail (29 vs 27) on this data: two textures appear during the
sweep and stay.

## Not done yet (#4783)

- gpu-mem-census `--webgpu`: its allocation counters wrap WebGL calls. Needs a WebGPU `createTexture`/`createBuffer` wrapper (overlaps #4710).
- writeBuffer bytes per group, idle `createBindGroup`/`createBuffer`, shadow-target colour attachments (issue items 2 to 4).
- The gates themselves: need the determinism question above answered first.
