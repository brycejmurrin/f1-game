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
   bilinear taps, behind a settings stop that defaults OFF until it is measured
   on a real GPU. Software probes in this container cannot answer whether it
   pays — the same rule that governs every other renderer change here.
3. **Never ship it as an unconditional cost.** It should be gated on
   `renderScale < 1`: at 1.0 there is nothing to upscale and the pass is pure
   waste.
4. **Temporal reconstruction stays closed** unless someone first builds a
   motion-vector buffer for another reason.

## Sources

- [AMD FidelityFX Super Resolution 1](https://gpuopen.com/fidelityfx-superresolution/) and the [integration deck](https://raw.githubusercontent.com/GPUOpen-Effects/FidelityFX-FSR/master/docs/FidelityFX-FSR-Overview-Integration.pdf) (MIT; "do not use RCAS without EASU")
- [FSR 1.0 demystified](https://jntesteves.pages.dev/posts/amd-fsr-demystified/) — the RetroArch fragment-shader port, spatial-only confirmation
- [Optimizing AMD FSR for Mobiles](https://atyuwen.github.io/posts/optimizing-fsr/) — the iPhone 12 numbers and the four optimisations
- [Snapdragon Game Super Resolution](https://github.com/SnapdragonGameStudios/snapdragon-gsr) and [Qualcomm's announcement](https://www.qualcomm.com/news/onq/2023/04/introducing-snapdragon-game-super-resolution) — single-pass, mobile-first
- [Babylon.js FSR thread](https://forum.babylonjs.com/t/using-amd-fsr-with-babylon-js/39326) — WebGPU-only because of `textureGather`
- [Khronos `textureGather`](https://registry.khronos.org/OpenGL-Refpages/es3.1/html/textureGather.xhtml) — ES 3.1, i.e. not WebGL2
- [Hajime-san/web-fsr](https://github.com/Hajime-san/web-fsr) — an existing WebGL port to read before writing one
