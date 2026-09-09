# Spatial upscale follow-ups — design (2026-09-09)

Approved scope from post-ship next steps (UPSCALING-2026-09 §7.4 items 3–4 + soft-present cost). Parent deploy tip carries settings + shared 4-tap SGSR1 on GLX/WGX/TLX.

## Goals

1. **WGX `textureGather` fast path** — same `apex26.spatialUpscale` flag; GLX/TLX stay 4-tap.
2. **Soft-present cost measurement** — software path readback at present size with upscale ON vs OFF (container).
3. **Real-GPU A/B dispatch** — `gpu-census.yml` macos + windows with and without upscale at scale ≈0.75.
4. **Default stays OFF** — no PerfGov auto-enable; no flipping the SettingRow default.

## Design

### WGX gather

- Add a second WGSL SGSR source (`SGSR_GATHER`) where `gatherGreen` is `textureGather(srcTex, srcSamp, p, 1)` (green component), same texel order contract as the 4-tap emulator.
- `wgx.js` tries to create the gather pipeline first; on module/pipeline failure, fall back to existing 4-tap `pSGSR`. Fail-closed: `wantSpatialUpscale` still requires a linked pipeline.
- Optional pin `apex26.spatialUpscaleGather=0` forces 4-tap (A/B / defect escape). Default: prefer gather when it links.
- Canaries: allow `textureGather` only inside the gather SGSR string; keep asserting 4-tap path has no gather.

### Soft-present bench

- Small Node probe (or gfx-probe `--ls` matrix) recording soft-present / frame timings at `renderScale=0.75` with upscale 0 vs 1 on WGX (and TLX soft blit if cheap). Write JSON under `artifacts/`. Document path:` and that soft blit ≠ player headed FPS.

### Real GPU

- Dispatch `gpu-census.yml` with `images=macos-latest,windows-latest`, game checks on, two legs via `ls=` (upscale off baseline vs `apex26.spatialUpscale=1` + fixed scale if the harness supports it). Read Verdict; do **not** flip default ON from software or a single green census alone — report findings only.

### Out of scope

Default ON; TLX gather; FSR1; PerfGov auto; changing RESOLUTION labels.
