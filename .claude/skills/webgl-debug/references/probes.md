# WebGL / GLX first probes

Load from the SKILL.md index. Failure modes and Playwright one-liners stay in
[failures.md](failures.md). Start here before reading shader source.

## 1. Check HDR availability

```js
GLX.hdrMode()   // boolean — true = WebGL2 HDR float-FBO path active
```

`false` means the WebGL2 context failed to create a float framebuffer — the HDR
composite pass is skipped and bloom/tone-map won't fire. This is normal under
SwiftShader in CI; it's a bug in production if a modern GPU returns `false`.

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
const gl = document.querySelector('canvas#game').getContext('webgl2');
gl.getError();   // 0 = GL_NO_ERROR; non-zero = error code

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

## 4. Point-light upload — uniform arrays, 15 floats per light

There is **no UBO**. `frame.lights` is a flat JS array of 15-float records:

```
[x, y, z,  r, g, b,  radius,  aimX, aimY, aimZ,  coneIn, coneOut,  bleed, volW, glareW]
```

`setFrameLights()` (game.js) culls to the nearest CAP lamps each frame
(`LT.lampCull` def 28 with traffic, else 32) and GLX
uploads plain uniform arrays (`uLightPos[i]`, `uLightCol[i]`, `uNumLights`,
plus per-lamp cone/volumetric/glare arrays for the god-ray pass). If light
positions look scrambled, the usual culprit is a record pushed with the wrong
field COUNT in `buildTrackLights` — every `lights.push(...)` must be exactly
15 values (`frame.lights.length` must be a multiple of 15).
