# WGX shipped defect classes and the device-loss ladder

Load this when the world is missing, the road is NaN-white, bloom dropped, or
a real device shows a black screen.

## Three shipped defect classes (2026-08-17)

1. **Late sky erased the world.** Sky pipelines must use
   `depthCompare: "less-equal"` with `depthWriteEnabled: false` (GLX LEQUAL
   parity). With `"always"` + `skyLate` default-ON, the sky (depth 1.0, drawn
   AFTER the world) overwrote everything except cars/FX. Only the MSAA
   depth-resolve pipeline legitimately uses `"always"` (it fills depth).
   `tools/wgx-validate.mjs --static` asserts this without a browser.

2. **WGSL derivative uniformity — the NaN-white road.** Unlike GLSL, WGSL
   makes a `dpdx`/`dpdy`/`fwidth` call reached through a non-uniform branch
   or early return a `derivative_uniformity` error. Strict Dawn rejects the
   module (WGX silently falls back to GLX); warning-mode Dawn (phones)
   executes UNDEFINED derivatives where returns diverge — the road rendered
   NaN-white while grass/walls/cars looked fine. The shape that ships:
   `fs_main` takes ALL derivatives of varyings FIRST, in uniform flow
   (`fwWpos`, `fwTrk`), and threads the widths into the material helpers.
   Enforced by `tests/unit/webgpu-lifecycle.test.mjs` (helpers must contain
   no derivative calls). Never add a derivative inside `applyMaterial*`,
   `roadMarkings`, `matBumpHeight`, or `matTexUV`.

   SAA/clearcoat derivatives stay on geometric N (`topNgeo`). GLX uses
   post-bump `dFdx(N)`, which is illegal in WGSL after a material branch —
   that is a documented look gap, not a hoist miss.

3. **Spec-invalid resources.** WebGPU allows ONLY sample counts 1 and 4 —
   `MSAA_COUNT` is 4 (1 in lite); a 2 invalidates every MS pipeline.
   `rg11b10ufloat` is color-renderable only behind
   `rg11b10ufloat-renderable` — `create()` requests it when the adapter has
   it, else `POST_HDR_FORMAT` downgrades to `rgba16float`. Re-derive the
   format from the **device**, not the adapter. Bloom down/up pipelines must
   target `POST_HDR_FORMAT` (not `SCENE_FORMAT`) or a granted rg11b10
   feature becomes a color-format mismatch and bloom drops. `DEPTH_RESOLVE`
   must min samples 0–3 (the 4× leftover mined only 0 and 1).

`tools/wgx-validate.mjs --static` covers sky compare, no MSAA 2, bloom
`POST_HDR_FORMAT`, depth-resolve sample 3, and no leftover `fw1`.

## Device-loss escalation (black screen on real hardware)

Persisted per origin in `apex26.gfxWgxLevel`; one `device.lost` = one rung
up + one reload:

- rung 0 full — desktop (MSAA 4, timestamp-query, 2048 shadows)
- rung 1 lite — phone parity (MSAA 1, 1024 shadows). Phones/WebKit apply the
  lite stack immediately via `WGX_LITE = IS_MOBILE || IS_WEBKIT` while
  persisted `apex26.gfxWgxLevel` stays 0 on first launch; rung 1 is the
  device-loss escalation floor, not the stored key on first boot
  (`js/render/webgpu/wgx.js`)
- rung 2 minimal — lite + no post chain, DPR capped at 1
- loss on rung 2 → session-skip to GLX; the user's RENDERER pick is preserved

The ladder HEALS (5 clean sessions step a rung down; `apex26.gfxWgxOk`). An
explicit RENDERER re-pick clears it (`js/perf/renderer-picker.js` RESET RENDERER). JS
exceptions do NOT latch a dead canvas: 3 strikes (`JS_STRIKE_CAP`) surrender
to GLX with the reason in `apex26.gfxWgxFail`. A persistent black screen on
hardware means the ladder itself is broken — check those keys before
touching pipelines.

A misleading classic: `createBuffer failed, size (N) is too large` on a tiny
N is Chrome's LOST DEVICE error, not an allocation bug.
