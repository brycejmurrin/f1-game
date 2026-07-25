---
name: webgl-debug
description: Diagnose WebGL2/GLX renderer issues — lights wrong, shadow acne or shimmer, bloom too strong, shader compile failures, GL_INVALID_OPERATION. Covers hdrMode(), lightState() verification, the uniform-array light upload, shadow bias/fade knobs, and Playwright probe patterns. Triggers - "lights wrong", "shadow acne", "shadow flicker", "bloom too strong", "hdrMode", "WebGL error", "GL_INVALID_OPERATION", "shader compile failed", "uniform array", "instancing".
---

# Debug WebGL2 / GLX renderer issues

The renderer lives in `js/render/glx.js` (the `GLX` IIFE). It uses WebGL2 with
uniform-array point lights, a 2048² sun shadow map (+ 512² PCSS blocker map),
ACES tone-map, bloom, and lens flare. Most rendering bugs fall into a small set
of root causes — start with the probes below before reading shader source.

## 1. Check HDR availability

```js
// In browser console or apex-eval:
GLX.hdrMode()   // true = WebGL2 HDR path active; false = fallback (SwiftShader or old GPU)
```

`false` means the WebGL2 context failed to create a float framebuffer — the HDR
composite pass is skipped and bloom/tone-map won't fire. This is normal under
SwiftShader in CI; it's a bug in production if a modern GPU returns `false`.

## 2. Verify the CPU-side light state

`__apex.lightState()` reads the resolved lighting state *after*
`applyRaceSettings` and `setFrameLights` have run (field-by-field reference:
see the **lighting-tuner** skill). Use it to confirm the CPU-side data is sane
before suspecting the GPU upload:

If `numLights > 0` but lights look wrong in-frame, check the light-record
layout (§4). If `numLights === 0` on a night track, the `buildTrackLights` /
`setFrameLights` guard is failing — check `track.def.night` and the scene-dark
condition in `game.js`.

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

## 5. Common failure modes

### Shadow acne / detached shadows

The lit shader combines a slope-scale bias with the SHADOW BIAS tuner knob
(`sampleShadow` in glx.js):

```glsl
float slopeBias = uShadowTexel * 1.5 * (sqrt(1.0 - c*c) / c);   // tan(theta)
float z = sc.z - clamp(slopeBias, 0.0005, 0.004) - uShadowBias * 0.5;
```

Acne on flat surfaces → raise the SHADOW BIAS slider (`uShadowBias`, TUNE_DEFS
def 0.001, max 0.005). Peter-Panning (shadows detach from feet) → lower it.
Do NOT hand-edit the clamp constants first; the tuner knob exists for this.

### Shadow shimmer / edge flicker while driving

The shadow box recentres in sBox/4 steps snapped on the LIGHT's right/up axes
so the texel grid stays world-stable (game.js shadow pass), and shadows fade
by receiver distance via `uShadowRange` (SHADOW DISTANCE knob) well inside the
box border. If edges shimmer again, check that the snap code still quantizes
in light space (not world XZ) and that the rebuild gate includes sunDir.

### Bloom / tone-map not firing

Bloom requires `hdrMode() === true` (float framebuffer available). Under
SwiftShader it falls back to the LDR path — bloom is skipped and the scene looks
flat. In production, verify `GLX.hdrMode()` returns `true` after context
creation.

## 6. Playwright probe pattern

Verify light state after a time-of-day switch:

```js
// In a Playwright spec:
const ls = await page.evaluate(() => __apex.lightState());
expect(ls.numLights).toBeGreaterThan(0);      // floodlights fired for night
expect(ls.ambientSky[0]).toBeLessThan(0.3);   // dark night sky
expect(ls.sunColor[0]).toBeLessThan(0.5);     // sun dimmed to moonlight
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
# Check HDR mode
node tools/apex-eval.mjs monza "GLX.hdrMode()" --raw

# Light state on a night track (full workflow: lighting-tuner skill)
node tools/apex-eval.mjs vegas "(a.setTimeOfDay('night'), a.lightState())" --raw
```
