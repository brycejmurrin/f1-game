---
name: webgl-debug
description: Diagnose WebGL2/GLX renderer issues — UBO not binding, lights wrong, shadow acne, bloom too strong, shader compile failures, GL_INVALID_OPERATION. Covers hdrMode(), lightState() UBO verification, std140 padding, uniform block binding, bufferSubData size, and Playwright probe patterns. Triggers - "UBO not working", "lights wrong", "shadow acne", "bloom too strong", "hdrMode", "WebGL error", "GL_INVALID_OPERATION", "shader compile failed", "uniform block", "instancing".
---

# Debug WebGL2 / GLX renderer issues

The renderer lives in `js/glx.js` (the `GLX` IIFE). It uses WebGL2 with a UBO
(`Lights` uniform block), shadow map, ACES tone-map, bloom, and lens flare.
Most rendering bugs fall into a small set of root causes — start with the probes
below before reading shader source.

## 1. Check HDR availability

```js
// In browser console or apex-eval:
GLX.hdrMode()   // true = WebGL2 HDR path active; false = fallback (SwiftShader or old GPU)
```

`false` means the WebGL2 context failed to create a float framebuffer — the HDR
composite pass is skipped and bloom/tone-map won't fire. This is normal under
SwiftShader in CI; it's a bug in production if a modern GPU returns `false`.

## 2. Verify the UBO is uploading correctly

`__apex.lightState()` reads the resolved lighting state *after* `applyRaceSettings`
and `setFrameLights` have run. Use it to confirm the CPU-side data is sane before
suspecting the GPU UBO:

```js
const ls = await page.evaluate(() => __apex.lightState());
// {
//   ambientSky:    [r,g,b]   → uAmbSky
//   ambientGround: [r,g,b]   → uAmbGround
//   sunColor:      [r,g,b]   → directional sun
//   numLights:     number    → active point lights fed to the UBO
//   sunY:          number    → sin(sun elevation)
//   builtNight:    bool
//   floodEmit:     number
// }
```

If `numLights > 0` but lights look wrong in-frame, the UBO upload or binding is
the likely culprit (see §4). If `numLights === 0` on a night track, the
`buildTrackLights` / `setFrameLights` guard is failing — check `track._night` and
the scene-dark condition in `game.js`.

## 3. Detect WebGL errors

```js
// In browser console, after a frame:
const gl = document.querySelector('canvas#game').getContext('webgl2');
gl.getError();   // 0 = GL_NO_ERROR; non-zero = error code

// Common codes:
// 1282 = GL_INVALID_OPERATION  (e.g. draw call while VAO mismatch, or bad UBO bind)
// 1281 = GL_INVALID_VALUE
// 1280 = GL_INVALID_ENUM
```

The game also exposes a convenience wrapper if wired up:

```js
__apex.glError?.()   // returns last gl.getError() or undefined if not wired
```

Check the **browser console** first — WebGL implementations log
`GL_INVALID_OPERATION` with the call site when debug extensions are active.
SwiftShader is especially verbose.

## 4. Check if the `Lights` uniform block is bound

After a frame has rendered, verify the UBO is bound to binding point 0:

```js
const gl  = document.querySelector('canvas#game').getContext('webgl2');
// Find the lit program — easiest via a known uniform name
// (GLX doesn't expose prog handles directly, so check binding indirectly)
// The binding should be 0 (set by uniformBlockBinding after link):
//   gl.uniformBlockBinding(litProg, blockIdx, 0)
// Verify:
//   gl.getActiveUniformBlockParameter(litProg, blockIdx,
//       gl.UNIFORM_BLOCK_BINDING)   → 0
```

If it returns anything other than `0`, `uniformBlockBinding` was not called after
the program was linked (e.g. program re-linked after a hot reload without
re-binding).

## 5. Common failure modes

### UBO std140 padding wrong

`vec3` arrays in std140 layout are padded to `vec4` stride — each element occupies
16 bytes, not 12. The `Lights` UBO uses `vec4` throughout (position, colour,
radius packed in `.xyz`/`.w`) to sidestep this. If you add a new field, use
`vec4` or account for the pad explicitly, otherwise the GPU reads the next field
as garbage.

### Binding point not set

`gl.uniformBlockBinding(litProg, blockIdx, 0)` **must** be called after
`gl.linkProgram`. If the program is re-created (e.g. after a shader hot-reload)
without re-calling `uniformBlockBinding`, the block silently defaults to binding
point 0 on some drivers but to an unbound slot on others.

### bufferSubData size mismatch

The `Lights` UBO is **1024 bytes** (256 floats: 32 lights × 8 floats each, plus
header). Uploading a buffer of the wrong size with `gl.bufferSubData` reads
beyond the allocation on some drivers and silently produces garbage on others. If
`numLights` looks correct but light positions are scrambled, verify the upload
size matches the `1024` constant in `glx.js` (`gl.bufferData(..., 1024, ...)`; the allocation is `_lightUBOData = new Float32Array(256)`).

### Shadow acne

The shadow map uses a slope-scale bias:

```glsl
float bias = sqrt(1.0 - ct * ct) / ct;          // tan(theta)
bias = clamp(bias, 0.0002, 0.002);
```

If acne appears on flat surfaces, the lower clamp (`0.0002`) is too small for the
shadow-map resolution in use. Raise it to `0.0005`. If Peter-Panning appears
(shadows detach from casters), the upper clamp (`0.002`) is too large — lower it.
Check the `uShadowBias` uniform in the lit shader.

### Bloom / tone-map not firing

Bloom requires `hdrMode() === true` (float framebuffer available). Under
SwiftShader it falls back to the LDR path — bloom is skipped and the scene looks
flat. In production, verify `GLX.hdrMode()` returns `true` after context
creation. If `false`, the WebGL2 context may have been created without
`preserveDrawingBuffer: false` or the GPU driver is capping float texture support.

## 6. Playwright probe pattern

Verify light state after a time-of-day switch:

```js
// In a Playwright spec:
const ls = await page.evaluate(() => __apex.lightState());
expect(ls.numLights).toBeGreaterThan(0);      // floodlights fired for night
expect(ls.ambientSky[0]).toBeLessThan(0.3);   // dark night sky
expect(ls.sunColor[0]).toBeLessThan(0.5);     // sun dimmed to moonlight
```

Verify HDR path in CI (SwiftShader returns false — assert it doesn't crash):

```js
const hdr = await page.evaluate(() => GLX.hdrMode());
// CI: hdr === false is expected; production GPU: assert hdr === true
```

Verify no WebGL error after a frame:

```js
await page.evaluate(() => __apex.step(1/60, 1));
const err = await page.evaluate(() => {
  const gl = document.querySelector('canvas#game').getContext('webgl2');
  return gl.getError();
});
expect(err).toBe(0);   // GL_NO_ERROR
```

## 7. Quick one-liners via apex-eval

```sh
# Check light state on a night track
node tools/apex-eval.mjs vegas "(a.setTimeOfDay('night'), a.lightState())" --raw

# Check HDR mode
node tools/apex-eval.mjs monza "GLX.hdrMode()" --raw

# Step one frame and read gl error (if glError is wired)
node tools/apex-eval.mjs monza "(a.step(1/60,1), a.glError?.())" --raw
```
