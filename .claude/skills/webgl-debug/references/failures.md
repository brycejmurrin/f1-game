# WebGL failure modes, Playwright probe, apex-eval one-liners

Load from the SKILL.md index when the task needs this detail.

## 5. Common failure modes

### Shadow acne / detached shadows

The lit shader combines a slope-scale bias with the SHADOW BIAS tuner knob
(`sampleShadow` in `js/render/glx/shaders/glsl-lit.js`):

```glsl
float slopeBias = t * 1.5 * (sqrt(1.0 - cosTheta * cosTheta) / cosTheta);
float biasTerm = clamp(slopeBias, 0.0005, 0.004) + uShadowBias * 0.5;
float z = sc.z - biasTerm;
```

Acne on flat surfaces → raise the SHADOW BIAS slider (`uShadowBias`, TUNE_DEFS
def 0.001, **max 0.01**). Peter-Panning (shadows detach from feet) → lower it.
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

### Bloom too strong / scene milky

Tune via the **lighting-tuner** knobs (live or baked into `LightPresets`):
`bloomMul`, `threshOff`, `bloomKnee`, `exposureMul`. Reproduce at
`setTimeOfDay('dusk')` on a floodlit track and compare against shipped presets
for that `track|tod|weather` before editing shader code.

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

# Light state on a night track (Monza has night:false — use vegas/singapore)
node tools/apex-eval.mjs vegas "(a.setTimeOfDay('night'), a.lightState())" --raw
```

For wet-road screen-space reflections specifically,
`node tools/ssr-probe.mjs --track=<id> --debug=<gates|hitmiss|hitcol|mix>`
(`tools/README.md`).
