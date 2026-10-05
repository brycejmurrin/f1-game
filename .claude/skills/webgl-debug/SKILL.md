---
name: webgl-debug
description: "Use when the user reports a blank/dark/black GLX canvas, lights wrong, shadow acne, bloom too strong/blown-out/missing (GPU path), HDR/hdrMode issues, WebGL/GLX errors, GL_INVALID_OPERATION, shader compile failures, uniform-array light bugs, instancing problems, or GLX renderer artifacts. Washed-out night → lighting-tuner; WebGPU → webgpu-debug; garbled PBR layer → asset-pack; shimmer while driving → playwright-probe."

---

# Debug WebGL2 / GLX renderer issues

The renderer lives in `js/render/glx/glx.js` (the `GLX` IIFE). It is NOT the
default backend (TLX is): it runs only when `apex26.gfxBackend` is `"webgl2"` or
TLX/WGX failed to init — confirm with `__apex.diag()` (`backendState`) before
debugging it. It uses WebGL2 with
interleaved point lights, a 2048² sun shadow map (1024² on mobile; its PCSS blocker pass is a
desktop-only 512² R32F blocker target; 512² is also the separate LAMP spot map),
ACES tone-map, bloom, and lens flare. Most rendering bugs fall into a small set
of root causes — start with the probes below before reading shader source.

## 1. Check HDR availability

```js
// In browser console or apex-eval:
GLX.hdrMode()   // boolean — true = WebGL2 HDR float-FBO path active
```

`false` means `postEnabled && colorType === HALF_FLOAT` failed (`glx/post.js`
`hdrOk`): either the post chain fell back to direct rendering (no bloom, no
composite at all), or `EXT_color_buffer_float` is absent so the chain runs on an
8-bit RGBA8 target (bloom and ACES still run, but nothing exceeds 1.0 to bloom
from). Record browser/device, extension availability, post-enabled state and FBO/init errors before calling this a regression; GPU age is not a capability test. `true` says nothing
about bloom strength: for over-bright/blown-out frames go to failures.md
"Bloom blows out the whole frame".

**Do not confuse with GPU timing:** when someone says HDR/GPU features are
"unsupported", they usually mean `__apex.gpuTimer().supported === false`
(`EXT_disjoint_timer_query_webgl2` absent — SwiftShader, many mobile GPUs). That
is unrelated to `hdrMode()`; bloom can still run when `hdrMode()` is true but
`gpuTimer` is unsupported.

## 2. Verify the CPU-side light state

`__apex.lightState()` reads the resolved lighting state *after*
`applyRaceSettings` and `setFrameLights` have run (field-by-field reference:
see the **lighting-tuner** skill). Use it to confirm the CPU-side data is sane
before suspecting the GPU upload:

If `numLights > 0` but lights look wrong in-frame, check the light-record
layout (§4). If `numLights === 0` on a night track, the `buildTrackLights` /
`setFrameLights` guard is failing — check `track.def.night` and the scene-dark
condition in `game.js`. **Monza has `night: false`** — for night floodlight
probes prefer `singapore` or `vegas` (both `night: true`).

## 3. Detect WebGL errors

```js
// In browser console, after a frame:
const gl = document.querySelector('canvas#game').getContext('webgl2');
gl.getError();   // 0 = GL_NO_ERROR; non-zero = error code

// Common codes:
// 1282 = GL_INVALID_OPERATION  (e.g. draw call while VAO mismatch)
// 1281 = GL_INVALID_VALUE
// 1280 = GL_INVALID_ENUM
```

Check the **browser console** first — WebGL implementations log
`GL_INVALID_OPERATION` with the call site when debug extensions are active.
SwiftShader is especially verbose.

**Mobile STANDARD tier:** on mobile UA without GRAPHICS: HIGH, car/lamp shadow
maps are not created but `game.js` still issues castShadow calls each frame.
If those casts do not no-op, they spam `GL_INVALID_OPERATION` every frame
(guarded by `tests/specs/webgl-probes.spec.js` — "mobile standard tier renders without
GL errors"). Symptom: "STANDARD is buggy and laggy while HIGH runs great".

HeadlessChrome GLX hides `#game` (opacity 0) and blits onto `#game-soft`.
A locator/`chrome_take_screenshot` of `#game` is that black gap; `readPixels`
and `GLX.awaitSoftPresent()` then `#game-soft` have the car. Do not treat a
black `#game` shot as a shader miss until you have checked the overlay.

## 4. Point-light upload — uniform arrays, 15 floats per light

There is **no UBO**. `frame.lights` is a flat JS array of 15-float records:

```
[x, y, z,  r, g, b,  radius,  aimX, aimY, aimZ,  coneIn, coneOut,  bleed, volW, glareW]
```

`setFrameLights()` (`js/lighting/frame-lights.js`) culls to the nearest CAP lamps each frame
(`LT.lampCull` def 40 with traffic, else `LightBudget.MAX` = 48) and GLX
uploads ONE interleaved `uLight[]` — 16 floats per lamp in a single
`uniform4fv`, not parallel arrays. (`uLightPos[i]`/`uLightCol[i]` survive only
in the god-ray pass, `glx/post.js`; grepping for them in the lit shader finds
nothing.) If light
positions look scrambled, the usual culprit is a record pushed with the wrong
field COUNT in `buildTrackLights` — every `lights.push(...)` must be exactly
15 values (`frame.lights.length` must be a multiple of 15).


---

## Load on demand

- Shadow acne (which shader chunk, uniforms, knobs), common failure modes, Playwright probe pattern, apex-eval one-liners → [references/failures.md](references/failures.md).
