# WebGL failure modes, Playwright probe, apex-eval one-liners

Load from the SKILL.md index when the task needs this detail.

## Contents
- 5. Common failure modes
- 6. Playwright probe pattern
- 7. Quick one-liners via apex-eval (BROWSER-ONLY: each boots Chromium; not while a test-bg run is live)

## 5. Common failure modes

### Shadow acne / detached shadows

The lit shader combines a slope-scale bias with the SHADOW BIAS tuner knob
(`sampleShadow` in `js/render/glx/shaders/glsl-lit.js`):

```glsl
float slopeBias = t * 1.5 * (sqrt(1.0 - cosTheta * cosTheta) / cosTheta);
float biasTerm = clamp(slopeBias, 0.0005, 0.004) + uShadowBias * 0.5;
float z = sc.z - biasTerm * (uShadowRange / 80.0);   // static map only; the car map uses biasTerm * uCarBiasScale
```

`t` = `uShadowTexel` (1/SHADOW_SIZE; `SHADOW_SIZE` in `glx/shadow.js`, uploaded as `1/SHD.SIZE` in glx.js). Bias scales with SHADOW DISTANCE
(`uShadowRange`, def 80): acne that appears only after raising that knob is the
first thing to check. Chunk: `sampleShadow`, not `glsl-chunks.js`. Uniform
locations: `glx.js` ~920 list, uploads ~1852-1893 (`T.shadowBias`, `T.shadowRange`).
`tools/lighting/ab-lighting.mjs` catalog id `shadow.biasClamp` pins the clamp to ONE site
(BROWSER-ONLY run; `list` is static). Static, no browser: `node --test tests/unit/shadow-pass-depth.test.mjs`
(light-VP depth span; a too-tight near/far also reads as missing/odd shadows).

Acne on flat surfaces → raise the SHADOW BIAS slider (`uShadowBias`, TUNE_DEFS
def 0.001, **max 0.004**). Peter-Panning (shadows detach from feet) → lower it.
Do NOT hand-edit the clamp constants first; the tuner knob exists for this.

### Shadow shimmer / edge flicker while driving

The shadow box recentres in sBox/4 steps snapped on the LIGHT's right/up axes
so the texel grid stays world-stable (`js/render/shared/shadow-pass.js` sunPass), and shadows fade
by receiver distance via `uShadowRange` (SHADOW DISTANCE knob) well inside the
box border. If edges shimmer again, check that the snap code still quantizes
in light space (not world XZ) and that the rebuild gate includes sunDir.

### Bloom / tone-map not firing

`hdrMode()` is `postEnabled && colorType === HALF_FLOAT`. `false` with post up = 8-bit
target: bloom still runs but only from pixels >= threshold, so it reads flat. Post down
(`PST.enabled()` false) = no bloom/composite. Also check `PerfGov.autoTier() >= 4`
(game.js zeroes `po.bloom`) and GRAPHICS tier before blaming the shader.

### Bloom blows out the whole frame (night, HDR on) — tuner or shader?

Path: `game.js` ~7864-7995 picks `_bloom`/`_thresh` per time of day (night 0.55 / 0.97),
then `po.bloom = _bloom * LT.bloomMul`, `po.threshold = clamp(_thresh + LT.threshOff, 0.4, 1.2) * frame.exposure`,
`po.exposure = frame.exposure * LT.exposureMul` -> `glx/post.js` `present()` (bright-pass
`uThreshold`, mip chain, composite `uBloomAmt = bloom*1.25/(nLv-1)`, `uBloomKnee`, `uExposure`)
-> `shaders/glsl-post.js` BRIGHT_FS and COMPOSITE_FS (`c += bloomSample*uBloomAmt*bloomMask*uExposure`,
then HDR grade, then ACES). The knobs are the SAME registry on TLX/WGX (`js/lighting/knobs.js`).

1. Static, no browser: read the shipped values for the case.
   `grep -n -A30 '"singapore|night|dry"' js/lighting/presets.js | grep -E 'bloom|thresh|exposure'`
   (singapore night ships bloomMul 1.405, bloomKnee 0.72, exposureMul 0.8 — already a heavy look).
   Compare to defs in `js/lighting/knobs.js` (bloomMul 1, threshOff 0, bloomKnee 0.5, exposureMul 1).
   A preset/knob value far off def IS the tuner answer; fix by editing the profile (lighting-tuner).
2. BROWSER-ONLY: `node tools/shot/apex-eval.mjs singapore "(a.setTimeOfDay('night'), a.lightTune())" --raw --backend webgl2`
   — a stale `localStorage apex26.lightTune` outranks presets; then re-run with
   `lightTune({bloomMul:1,threshOff:0,bloomKnee:0.5,exposureMul:1})` and `GLX.hdrMode()`.
3. BROWSER-ONLY discriminator: same track/time on `--backend three` (TLX). Knobs and `po.*` are
   shared, so TLX fine + GLX blown out at identical knobs = GLX defect (post.js upload, BRIGHT_FS/COMPOSITE_FS,
   float target); both blown out = tuner/preset/game.js values. Knobs at def and still blown = shader.
4. Shader-side suspects when knobs are at def: `uBloomAmt` normalisation vs `nLv`, bright-pass fed an
   already-exposed or >1 clamped target, `uBloom` left bound to a stale `bloomLv[0]` when `doBloom` is false
   (should be `blackTex`), missing `uExposure` scale on the bloom term. Static guard:
   `node --test tests/unit/image-grade-shaders.test.mjs` (asserts grade order after bloom, before ACES).
5. Record for the next agent: backend, track|tod|weather key, `hdrMode()`, the `lightTune()` diff from def, and
   the TLX-vs-GLX result; verdict is "tuner/preset" (edit via lighting-tuner) or "GLX shader" (fix in glx/post.js / glsl-post.js).

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

HeadlessChrome: `#game` is opacity 0 and the blit is `#game-soft`. `getError()`
on `#game`'s WebGL context can be 0 while a locator screenshot of `#game` is
black. Await `GLX.awaitSoftPresent()` and read the overlay (or `readPixels`).

## 7. Quick one-liners via apex-eval (BROWSER-ONLY: each boots Chromium; not while a test-bg run is live)

```sh
# Check HDR mode (--backend webgl2 is REQUIRED: the default is TLX, and GLX.x() would answer for it)
node tools/shot/apex-eval.mjs monza "GLX.hdrMode()" --raw --backend webgl2

# Shadow acne at dawn: set dawn, read the live knobs (lightState has no shadow fields), then A/B the bias
node tools/shot/apex-eval.mjs monza "(a.setTimeOfDay('dawn'), a.lightTune())" --raw --backend webgl2
node tools/shot/apex-eval.mjs monza "(a.setTimeOfDay('dawn'), a.lightTune({shadowBias:0.003}))" --raw --backend webgl2

# Light state on a night track (Monza has night:false — use vegas/singapore)
node tools/shot/apex-eval.mjs vegas "(a.setTimeOfDay('night'), a.lightState())" --raw --backend webgl2
```

For wet-road screen-space reflections specifically,
`node tools/gfx/ssr-probe.mjs --track=<id> --debug=<gates|hitmiss|hitcol|mix>`
(`tools/README.md`).
