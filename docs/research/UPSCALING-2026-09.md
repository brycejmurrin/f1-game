# Can we fake resolution by generating pixels? (2026-09-09)

Research note, no code. The question: we already render the 3D view at a
fraction of the display resolution — can we *invent* the missing pixels well
enough that the player cannot tell?

Short answer: **yes, and the honest gain is smaller than it looks, because of
three things specific to this codebase.** The technique to reach for is a
spatial upscaler (FSR 1 or Snapdragon GSR), not a temporal one. What follows is
what is actually there today, what each option costs, and the two hard blockers
a naive port hits.

## 1. What we do today

`renderScale` (GLX `js/render/glx/glx.js`, and the same knob in WGX and TLX)
scales **the canvas backing store**:

```js
const w = Math.max(1, Math.round(cssW * dpr * renderScale));
canvas.width = w;                       // 0.5 … 1.0, driven by js/perf/governor.js
```

The canvas *element* keeps its CSS size, so the browser compositor stretches the
smaller backing store up to the box. That stretch is **plain bilinear, done by
the compositor, and we have no say in it.** It is the cheapest upscaler that
exists and also the blurriest. Everything below is a proposal to take that
stretch away from the compositor and do it ourselves.

Three facts about our situation that change the answer:

- **The HUD is a DOM overlay, not in-scene.** Only the 3D view softens; text,
  the tach and every menu stay pin-sharp at native resolution. In a normal
  engine, render scale blurs the UI too and the payoff for fixing it is much
  larger. Ours is already the good case.
- **The post chain already ends with FXAA at the reduced size**, writing
  straight to the default framebuffer (`js/render/glx/post.js`). An upscaler
  slots in exactly there, and FXAA is the correct *input* to it — AMD's
  guidance is that EASU wants an anti-aliased image.
- **There is already a sharpen** (`uSharpen`, an unsharp mask in
  `COMPOSITE_FS`). It runs at *render* resolution, i.e. before the stretch, which
  is the wrong side: most of what it recovers is then blurred away again.

## 2. The options, cheapest first

### A. Couple the existing sharpen to `renderScale` — ~0 ms

`uSharpen` is already a shipped uniform with a governor-driven scale beside it.
Raising it as `renderScale` falls costs nothing and recovers *some* crispness.
It is a half-measure by construction (sharpening before a bilinear stretch), and
AMD say so directly in the FSR deck: *"if sharpening is desired without FSR
upscaling, then FidelityFX CAS is recommended"* — an unsharp mask is not CAS and
will halo. Worth doing as a one-line experiment; not worth calling a solution.

### B. Snapdragon GSR 1 — one full-res pass

Qualcomm's [SGSR](https://github.com/SnapdragonGameStudios/snapdragon-gsr)
folds upscale and edge sharpening into a **single pass**, explicitly for mobile,
against FSR 1's two. BSD-3. For a game whose reference device is a phone that is
already over its frame budget, one pass beats two, and this is the option I
would build first.

### C. FSR 1 (EASU + RCAS) — two full-res passes

The reference spatial upscaler. Spatial-only: it needs **the image and nothing
else** — no history, no motion vectors, no depth
([demystified](https://jntesteves.pages.dev/posts/amd-fsr-demystified/)). It is
distributed as a "compute shader" but is only maths, and the RetroArch port
established it *"just works unmodified"* as an ordinary fragment pass on plain
OpenGL. MIT.

### D. Temporal upsampling (TAAU / FSR 2 / checkerboard) — don't

This is the one that genuinely *generates* pixels rather than interpolating
them, and it is the wrong project for us:

- it needs a **jittered projection** (Halton), a **history colour buffer**, and
  **per-pixel motion vectors**, which means every geometry shader gains a
  previous-frame MVP and every dynamic object (21 cars, wheels, the driving-line
  ribbon) gains a previous transform;
- we have depth but **no velocity buffer and no history** — this is a
  multi-week job across three backends, not a pass;
- and a racing game at 250 km/h is the **worst case for ghosting**: fast camera
  motion, thin high-contrast geometry (kerbs, wires, the line ribbon), exactly
  the content temporal reconstruction smears.

### E. Frame generation — no

"Generating pixels" can also mean generating whole *frames* (FSR 3). It buys
smoothness by **adding latency**, which is the one thing a driving game cannot
pay. Not a candidate.

## 3. The two blockers a naive port hits

**Blocker 1 — `textureGather` does not exist in WebGL2.** Stock EASU gathers
four texels per channel. `textureGather` is **OpenGL ES 3.1 / GLSL ES 3.10**;
WebGL2 is ES 3.0 / GLSL ES 3.00, and a 3.10 feature is a compile error. This is
not theoretical — the Babylon.js FSR PR
([thread](https://forum.babylonjs.com/t/using-amd-fsr-with-babylon-js/39326))
shipped **WebGPU-only for exactly this reason**. So:

- **GLX (WebGL2, our default renderer)** cannot run stock EASU. It must either
  expand each gather into four `texelFetch`es (slower) or use the bilinear-tap
  variant below (faster *and* portable — the happy convergence).
- **WGX (WebGPU)** has `textureGather` natively and could run the stock kernel.

**Blocker 2 — the stock cost is unaffordable on the device that needs it.**
Measured on an iPhone 12 by
[atyuwen](https://atyuwen.github.io/posts/optimizing-fsr/): stock **EASU 5.4 ms
+ RCAS 0.9 ms = 6.3 ms**, which the author calls "absolutely unacceptable". Our
reference phone is already at ~19.5 ms against a 15.8 ms budget. Adding 6.3 ms
would be a disaster, and would be *caused* by the feature meant to help.

The same article gets EASU to **1.8 ms** (total 2.7 ms gross, ~2.0 ms net after
the blit it replaces) with four changes, all of which apply to us:

1. **half precision** — `mediump` in GLSL ES, roughly 2× throughput on mobile;
2. **drop the deringing clamp** — "artifacts are barely noticeable";
3. **one kernel analysis instead of four** — interpolate the *inputs*, not the
   outputs;
4. **five bilinear taps + early-quit to plain bilinear on non-edge pixels** —
   the single biggest win (3.6 → 1.8 ms), because the shader turns out to be
   texture-bound, not ALU-bound. **This variant uses `texture()`, not
   `textureGather`, which is also how it dodges Blocker 1.**

## 4. What it would cost us structurally

Today `canvas.width` *is* the reduced size. Any upscaler means:

- canvas back to **full** `cssW * dpr`;
- scene + every post FBO stay at `renderScale`;
- FXAA resolves into an LDR texture instead of the screen;
- one (SGSR) or two (FSR) **full-resolution** passes write the default
  framebuffer.

Two consequences worth naming before anyone starts:

- **`resize()` and `createTargets()` currently derive everything from one
  size.** Splitting "render size" from "present size" touches all three
  backends and the governor's 0.02 dead-zone contract.
- **It makes the headless census slower and that is not a regression.** On the
  soft-blit legs `tlx.js` does a GPU readback + `putImageData` every frame at
  *canvas* size. Moving the canvas from 0.75 to full res enlarges that readback.
  Frame counts from a run before and after this change are not comparable — the
  same trap as comparing the census's two TLX legs without reading the `path:`
  row (AGENTS.md).

## 5. Recommendation

1. **Measure the problem before building the fix.** Capture the same scene at
   `renderScale` 1.0 / 0.75 / 0.5 (`__apex.renderScale()`, the RESOLUTION row in
   `js/ui/scale.js`) and decide whether the softness is even what a player
   notices, versus the frame budget. We have no such A/B on record, and the
   DOM-HUD point above means the loss is smaller than the usual intuition.
2. **If it is worth fixing: SGSR 1 in GLX first**, one pass, `mediump`,
   behind a flag that defaults OFF until it is measured on a real GPU.
   Software probes in this container cannot answer whether it pays — the same
   rule that governs every other renderer change here.
3. **Never ship it as an unconditional cost.** It should be gated on
   `renderScale < 1`: at 1.0 there is nothing to upscale and the pass is pure
   waste.
4. **Temporal reconstruction stays closed** unless someone first builds a
   motion-vector buffer for another reason.

## 6. Spike landed (2026-09-09) — GLX / WGX / TLX, flag OFF by default

Implements recommendation §5.2–5.3 across backends with one shared SGSR1 kernel
and the same fail-closed size split:

| Piece | Where |
|---|---|
| Flag | `localStorage apex26.spatialUpscale=1` or `?upscale=1`; `__apex.spatialUpscale(1\|0)` |
| Size split | GLX / WGX / TLX `resize()`: canvas = present (`css×dpr`); scene/post targets stay at `×renderScale` when the flag is on and scale &lt; ~1 |
| Pass | After FXAA (or composite→LDR), one fullscreen SGSR1 writes the present target (`glx/post.js`; WGX `present()` + `wgsl-post.js` `SGSR`; TLX `tlx-post` + `tsl-post`) |
| Shader | Adapted from Qualcomm SGSR1 mobile (`sgsr1_shader_mobile.frag`, BSD-3). Stock uses `textureGather` (ES 3.1) — **all ports emulate with four lod taps** (parity). WGSL renames GLSL `std` → `edgeStd` (reserved keyword). OperationMode RGBA, EdgeThreshold 8/255 |
| Gate | Pass runs only when flag on **and** `renderScale < 0.98` **and** the program/pipeline linked; otherwise behaviour is byte-identical to pre-spike |

**Not in this spike:** PerfGov auto-enable, temporal path, neural SR, frame gen. Settings UI ON/OFF row ships with the same flag. Real-GPU A/B still required before defaulting ON — SwiftShader cannot judge sharpness or cost.

## 7. Settings UI + WGX/TLX port (research, 2026-09-09)

Ask: put a menu control next to RESOLUTION, and make the same flag do something
on WGX and TLX. Surveyed against tip `111356f6` (GLX spike already on deploy).

**Update (2026-09-09):** Strategy A (§7.2) landed for WGX and TLX — shared SGSR1,
`setSpatialUpscale` / `wantSpatialUpscale` / present-size soft blit when active;
FXAA→`aaTex` (LDR) then SGSR→present. WGX hardware `bgra8unorm` uses a separate
`pFXAALdr` pipeline. Settings ON/OFF `UPSCALE` row is wired in `js/ui/scale.js`.

### 7.1 Backend surface (post-port)

| | GLX | WGX | TLX |
|---|---|---|---|
| Size model | **Split** when flag on: canvas = present (`css×dpr`), FBOs = `×renderScale` | same split | same split |
| Last fullscreen pass | FXAA → (optional SGSR) → default FB | FXAA → aaTex then SGSR → swapchain / soft present | FXAA → aaRT then SGSR → `#game` / soft blit |
| Soft present | optional HeadlessChrome blit | required on software; readback = present size when upscaling | `#game-soft` at present size when upscaling |
| `textureGather` | **no** (WebGL2) — 4× `textureLod` | **yes** — `SGSR_GATHER` preferred; 4-tap `SGSR` fallback / `apex26.spatialUpscaleGather=0` | TSL / WebGL2 polyfill; **unused** (shared taps) |
| Spatial API | `setSpatialUpscale` / `wantSpatialUpscale` / `getPresentSize` | same | same |

Historical touch points (landed):

- **WGX:** `js/render/webgpu/wgx.js` `resize` / `_ensureSoftPresent` / `present` FXAA+SGSR; `js/render/webgpu/wgsl-post.js` `SGSR` after FXAA in `PASS_ORDER`.
- **TLX:** `js/render/three/tlx.js` size split; `tlx-post.js` + `tsl-post.js` SGSR pass; soft blit reads the final present tex.

### 7.2 Three backend strategies

**A. Shared SGSR1 everywhere (same look, emulated gathers on GLX/TLX-GL)**

- Port the existing `SGSR_FS` maths to WGSL and TSL.
- One flag, one visual contract, one canary family.
- WGX *could* later swap the four taps for native `textureGather` without changing the flag.
- Cost: three size-splits + three post insertions; soft-present legs get more expensive at full present size (not a player path).

**B. Native per backend (WGX `textureGather` SGSR/FSR; TLX `texture().gather()`; GLX stays emulated)**

- Matches what Babylon did for FSR (WebGPU-only gather).
- Sharper / cheaper on real WebGPU; **parity risk** — three looks to A/B, and TLX AUTO on WebKit is often WebGL2 (polyfill gather, not the WGX path).
- FSR1 still wants two full-res passes (EASU+RCAS) — worse than SGSR on the phone that needs this (§3). Prefer SGSR kernel even if gathers are native.

**C. GLX + WGX now; TLX later**

- Cuts TLX soft-blit / `presentedTarget` hazards from the first PR.
- Leaves THREE.JS players on bilinear stretch while RESOLUTION is LOW/MED — the SETTINGS row would need an "unavailable on this renderer" state or a silent no-op (`active:false`).

### 7.3 Settings UI (independent of A/B/C)

RESOLUTION already owns the scale (`js/ui/scale.js`, `#pm-res` under `#pm-display-adv`). Upscale is a sibling preference:

| Choice | Shape | Store |
|---|---|---|
| **ON/OFF row** (fits `SettingRow`) | `‹ OFF ›` / `‹ ON ›` under RESOLUTION | keep `apex26.spatialUpscale` (`"1"`/`"0"`) — already written by GLX + `__apex` |
| Fold into RESOLUTION | e.g. `MED+SHARP` modes | conflates two axes; governor AUTO cannot mean "scale + upscale" without new semantics |
| GRAPHICS preset side-effect | ULTRA implies on | invisible; fights the "never unconditional cost" rule (§5.3) |

Recommended UI: **one `SettingRow` labelled `UPSCALE`**, values ON/OFF, default **OFF**, next to `#pm-res`. Leave the control enabled at HIGH — `active` stays false until scale drops (same gate as today). Wire in `js/ui/scale.js`, static DOM in `index.html` (shell-ids / a11y guards). Help text: sharpens the **3D** view only; HUD stays DOM-crisp; no effect at full resolution.

### 7.4 Recommendation

1. **Settings first (small, shippable alone):** ON/OFF `SettingRow` next to RESOLUTION, same `apex26.spatialUpscale` key, default OFF. Works for GLX immediately; WGX/TLX keep `available` until ported.
2. **Backend port: strategy A (shared SGSR1)** for WGX then TLX — one kernel, fail closed without letterboxing, soft-present at present size only when the flag is active. Do **not** introduce FSR1's second pass.
3. **Optional follow-up (landed 2026-09-09):** WGX-only `textureGather` fast path (`SGSR_GATHER`) preferred when the module links; `apex26.spatialUpscaleGather=0` forces 4-tap. Soft-present cost bench: `node docs/archive/tools/gfx/soft-present-bench.mjs`. Real-GPU A/B via `gpu-census.yml` with `apex26.resMode=med` ± `apex26.spatialUpscale=1` — still required before default ON.
4. **Still required before default ON:** device A/B at RESOLUTION MED/LOW — SwiftShader cannot judge (§6). Default remains **OFF**.

### 7.5 Out of scope (unchanged)

Temporal / frame-gen; PerfGov auto-enabling upscale; changing RESOLUTION mode labels; comparing census FPS across the size-split without reading the present `path:`.


### 7.6 Real-GPU A/B (2026-09-09)

Dispatched via push of `.github/gpu-census-request.json` (agent tokens lack `workflow_dispatch`).
macos-latest Metal, `resMode="med"` (scale 0.75) ± `spatialUpscale=1`:

| leg | WGX meanLuma | WGX fps | gpuErrors | bound |
|---|---|---|---|---|
| baseline | 79.3 | ~60 | 0 | yes |
| upscale | 79.3 | ~60 | 0 | yes |

Windows `anyHardware=false` (no player-GPU signal). Headless soft-present path — not headed sharpness.
**Default stays OFF.** Headed visual A/B still required before ON.

## Sources


- [AMD FidelityFX Super Resolution 1](https://gpuopen.com/fidelityfx-superresolution/) and the [integration deck](https://raw.githubusercontent.com/GPUOpen-Effects/FidelityFX-FSR/master/docs/FidelityFX-FSR-Overview-Integration.pdf) (MIT; "do not use RCAS without EASU")
- [FSR 1.0 demystified](https://jntesteves.pages.dev/posts/amd-fsr-demystified/) — the RetroArch fragment-shader port, spatial-only confirmation
- [Optimizing AMD FSR for Mobiles](https://atyuwen.github.io/posts/optimizing-fsr/) — the iPhone 12 numbers and the four optimisations
- [Snapdragon Game Super Resolution](https://github.com/SnapdragonGameStudios/snapdragon-gsr) and [Qualcomm's announcement](https://www.qualcomm.com/news/onq/2023/04/introducing-snapdragon-game-super-resolution) — single-pass, mobile-first
- [Babylon.js FSR thread](https://forum.babylonjs.com/t/using-amd-fsr-with-babylon-js/39326) — WebGPU-only because of `textureGather`
- [Khronos `textureGather`](https://registry.khronos.org/OpenGL-Refpages/es3.1/html/textureGather.xhtml) — ES 3.1, i.e. not WebGL2
- [Hajime-san/web-fsr](https://github.com/Hajime-san/web-fsr) — an existing WebGL port to read before writing one
- In-tree: `js/render/glx/{glx,post}.js` + `glsl-post.js` `SGSR_FS`; `js/render/webgpu/wgx.js` `_acquirePresentView` / FXAA; `js/render/three/{tlx,tlx-post,tsl-post}.js`; `js/ui/scale.js` `#pm-res`
