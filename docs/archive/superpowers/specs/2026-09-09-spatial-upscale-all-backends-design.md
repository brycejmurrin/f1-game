# Spatial upscale — settings + all backends

Approved 2026-09-09 ("Do both"): menu control + shared SGSR1 on GLX/WGX/TLX.

## Decision

- **UI:** `SettingRow` `UPSCALE` ON/OFF next to RESOLUTION (`#pm-res`), store `apex26.spatialUpscale` (`1`/`0`), default OFF.
- **Kernel:** same SGSR1 maths as GLX spike (four-tap gather emulation first; WGX native gather later optional).
- **Gate:** flag on ∧ `renderScale < 0.98` ∧ program/pipeline OK — else legacy coupled size (no letterbox).
- **API:** every backend exports `setSpatialUpscale` / `getSpatialUpscale` (+ internal want/present size). `__apex.spatialUpscale` already feature-detects.
- **Out:** FSR1 two-pass, default ON, PerfGov auto-enable, temporal.

Evidence/constraints: `docs/research/UPSCALING-2026-09.md` §6–7.
