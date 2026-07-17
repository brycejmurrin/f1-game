# Image and Colour Grading Controls Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a professional HDR tonal grading stack with five tonal zones, Toe/Shoulder, and RGB Lift/Gamma/Gain to the LIGHTING TUNER, with WebGL2/WebGPU parity and a retuned F1-broadcast baseline.

**Architecture:** Extend `TUNE_DEFS` and the existing generated tuner UI, then add one shared grading stage conceptually mirrored in the WebGL2 GLSL and WebGPU WGSL composite shaders. Pack the 16 new scalar values into five aligned vectors, preserve every existing setting ID, and store the revised shipped look in the global lighting preset.

**Tech Stack:** Vanilla JavaScript IIFEs, WebGL2 GLSL ES 3.00, WebGPU WGSL, Node.js built-in test runner, Playwright, static GitHub Pages assets.

## Global Constraints

- Follow `docs/superpowers/specs/2026-07-17-image-colour-grading-controls-design.md`.
- Do not add dependencies, render passes, render targets, or texture reads.
- Do not replace ACES, add LUTs, or add an explicit sRGB/display-gamma conversion.
- New `TUNE_DEFS` defaults must be neutral; the revised broadcast look belongs in `LightPresets["*"]`.
- Preserve the meaning and persistence of `exposureMul`, `contrast`, `blackLift`, and `whitePoint`.
- Clamp every divisor and transcendental input so slider extremes cannot create NaN or infinity.
- WebGL2 and WebGPU must use the same constants, operation order, defaults, and control packing.
- Do not overwrite unrelated working-tree edits in `index.html`, `js/game.js`, track files, or tests.
- Do not commit unless the user explicitly requests it.
- Change `index.html` and `version.json` only once, after all JavaScript/CSS changes and baseline tuning are complete.

---

## File map

- Modify `js/game/lighting.js`: define new controls, ranges, labels, help, and internal section metadata.
- Modify `js/game.js`: render section headings inside an existing tuner group.
- Modify `css/style.css`: style tuner section headings.
- Create `tests/lighting-tuner-grade.spec.js`: verify UI organization, live values, clamping, persistence, Reset, and Copy Values.
- Modify `js/shaders/glx-shaders.js`: add packed grade uniforms and the HDR grade implementation.
- Modify `js/glx.js`: discover and upload the new WebGL uniforms.
- Create `tests/image-grade-shaders.test.mjs`: verify GLSL/WGSL contracts, neutral math, zone direction, and finite extremes.
- Modify `js/webgpu/wgsl-post.js`: expand `CompositeU` and mirror the HDR grade in WGSL.
- Modify `js/webgpu/wgx.js`: pack the five new vectors into the WebGPU uniform buffer.
- Modify `tests/webgpu-lifecycle.test.mjs`: verify the 224-byte layout, offsets, defaults, and extreme uploads.
- Create `tests/image-grade-visual.spec.js`: exercise actual rendered tonal and RGB behavior and guard the broadcast baseline.
- Modify `js/light-presets.js`: add the selected global broadcast-grade values.
- Modify `docs/LIGHTING-REF.md`: document the new controls, order, and packed WebGPU layout.
- Modify `index.html` and `version.json`: final synchronized cache/build bump.

---

### Task 1: Tuner registry and internal sections

**Files:**
- Modify: `js/game/lighting.js:149-167`
- Modify: `js/game.js:6028-6069`
- Modify: `css/style.css:140-176`
- Create: `tests/lighting-tuner-grade.spec.js`

**Interfaces:**
- Consumes: existing `TUNE_DEFS` records and generic `setLightTune(id, value)`.
- Produces: new IDs `blacks`, `shadows`, `midtones`, `highlights`, `whites`, `toe`, `shoulder`, `liftR/G/B`, `gammaR/G/B`, and `gainR/G/B`; optional `section: string` metadata.

- [ ] **Step 1: Write the failing Playwright coverage**

Create `tests/lighting-tuner-grade.spec.js` with a small boot helper and these assertions:

```js
// @ts-check
import { test, expect } from "@playwright/test";

async function openImageTuner(page) {
  await page.goto("/");
  await page.waitForFunction(() => window.__apex?.race, { timeout: 15_000 });
  await page.evaluate(() => window.__apex.race("bahrain"));
  await page.waitForFunction(() => window.__apex.info().track != null, { timeout: 20_000 });
  await page.evaluate(() => window.__apex.park(0.1));
  await page.locator("#pausebtn").click();
  await page.locator("#pm-lighting").click();
  await page.getByRole("tab", { name: "IMAGE & COLOUR" }).click();
}

test("IMAGE & COLOUR exposes ordered professional grading sections", async ({ page }) => {
  await openImageTuner(page);
  const headings = await page.locator('.lt-group[data-group="IMAGE & COLOUR"] .lt-section').allTextContents();
  expect(headings).toEqual(["TONAL RANGE", "RGB LIFT / GAMMA / GAIN", "COLOUR", "LENS & FINISH"]);
  for (const id of [
    "blacks", "shadows", "midtones", "highlights", "whites", "toe", "shoulder",
    "liftR", "liftG", "liftB", "gammaR", "gammaG", "gammaB", "gainR", "gainG", "gainB",
  ]) await expect(page.locator("#lt-in-" + id)).toBeVisible();
});

test("new grading controls clamp, persist, reset, and export", async ({ page }) => {
  await openImageTuner(page);
  await page.evaluate(() => window.__apex.lightTune({ shadows: 9, gammaG: 0.1, gainB: 1.25 }));
  expect(await page.evaluate(() => window.__apex.lightTune().shadows)).toBe(1);
  expect(await page.evaluate(() => window.__apex.lightTune().gammaG)).toBe(0.5);
  await page.reload();
  await page.waitForFunction(() => window.__apex?.race);
  await page.evaluate(() => window.__apex.race("bahrain"));
  await page.waitForFunction(() => window.__apex.info().track != null);
  expect(await page.evaluate(() => window.__apex.lightTune().gainB)).toBeCloseTo(1.25);
});
```

Extend the second test after reopening the tuner: click `#lt-copy`, assert the
textarea contains `"gainB": 1.25`, click `#lt-reset`, and assert the current
condition falls back to the shipped/default values.

- [ ] **Step 2: Run the new test and verify RED**

Run:

```bash
npx playwright test tests/lighting-tuner-grade.spec.js
```

Expected: FAIL because the new slider IDs and `.lt-section` headings do not exist.

- [ ] **Step 3: Add the registry records**

In `js/game/lighting.js`, keep `group: "IMAGE & COLOUR"` and assign `section`
only at section boundaries. Add the new controls with these exact ranges/defaults:

```js
{ id: "blacks",     label: "BLACKS",     group: "IMAGE & COLOUR", section: "TONAL RANGE", min: -1, max: 1, step: 0.01, def: 0, fmt: "signed", help: "Exposure of the deepest detail near black. Positive reveals it; negative crushes it. 0 is neutral." },
{ id: "shadows",    label: "SHADOWS",    group: "IMAGE & COLOUR", min: -1, max: 1, step: 0.01, def: 0, fmt: "signed", help: "Exposure of dark asphalt, tyres and unlit bodywork above the black point. 0 is neutral." },
{ id: "midtones",   label: "MIDTONES",   group: "IMAGE & COLOUR", min: -1, max: 1, step: 0.01, def: 0, fmt: "signed", help: "Exposure around middle grey: most paint, grass and track detail. 0 is neutral." },
{ id: "highlights", label: "HIGHLIGHTS", group: "IMAGE & COLOUR", min: -1, max: 1, step: 0.01, def: 0, fmt: "signed", help: "Exposure of bright bodywork, clouds and lamp pools below peak white. 0 is neutral." },
{ id: "whites",     label: "WHITES",     group: "IMAGE & COLOUR", min: -1, max: 1, step: 0.01, def: 0, fmt: "signed", help: "Exposure of the brightest HDR values feeding the ACES shoulder. Negative protects peaks; positive drives them harder. 0 is neutral." },
{ id: "toe",        label: "TOE",        group: "IMAGE & COLOUR", min: -1, max: 1, step: 0.01, def: 0, fmt: "signed", help: "Shapes the transition out of black. Positive deepens the toe; negative lifts it. 0 is neutral." },
{ id: "shoulder",   label: "SHOULDER",   group: "IMAGE & COLOUR", min: -1, max: 1, step: 0.01, def: 0, fmt: "signed", help: "Shapes highlight compression before ACES. Positive protects bright detail; negative expands it. 0 is neutral." },

{ id: "liftR", label: "LIFT · RED", group: "IMAGE & COLOUR", section: "RGB LIFT / GAMMA / GAIN", min: -0.15, max: 0.15, step: 0.0025, def: 0, fmt: "signed", help: "Red offset at the black end of the RGB grade. 0 is neutral." },
{ id: "liftG", label: "LIFT · GREEN", group: "IMAGE & COLOUR", min: -0.15, max: 0.15, step: 0.0025, def: 0, fmt: "signed", help: "Green offset at the black end of the RGB grade. 0 is neutral." },
{ id: "liftB", label: "LIFT · BLUE", group: "IMAGE & COLOUR", min: -0.15, max: 0.15, step: 0.0025, def: 0, fmt: "signed", help: "Blue offset at the black end of the RGB grade. 0 is neutral." },
{ id: "gammaR", label: "GAMMA · RED", group: "IMAGE & COLOUR", min: 0.5, max: 2, step: 0.01, def: 1, help: "Red-channel midpoint control. Above 1 lifts red midtones; below 1 deepens them. 1 is neutral." },
{ id: "gammaG", label: "GAMMA · GREEN", group: "IMAGE & COLOUR", min: 0.5, max: 2, step: 0.01, def: 1, help: "Green-channel midpoint control. Above 1 lifts green midtones; below 1 deepens them. 1 is neutral." },
{ id: "gammaB", label: "GAMMA · BLUE", group: "IMAGE & COLOUR", min: 0.5, max: 2, step: 0.01, def: 1, help: "Blue-channel midpoint control. Above 1 lifts blue midtones; below 1 deepens them. 1 is neutral." },
{ id: "gainR", label: "GAIN · RED", group: "IMAGE & COLOUR", min: 0.5, max: 1.5, step: 0.01, def: 1, help: "Red scale at the white end of the RGB grade. 1 is neutral." },
{ id: "gainG", label: "GAIN · GREEN", group: "IMAGE & COLOUR", min: 0.5, max: 1.5, step: 0.01, def: 1, help: "Green scale at the white end of the RGB grade. 1 is neutral." },
{ id: "gainB", label: "GAIN · BLUE", group: "IMAGE & COLOUR", min: 0.5, max: 1.5, step: 0.01, def: 1, help: "Blue scale at the white end of the RGB grade. 1 is neutral." },
```

Write complete user-facing help text explaining direction, affected tonal range,
and neutral value. Relabel `blackLift` to `BLACK FLOOR` and `whitePoint` to
`ACES WHITE SCALE`. Add `section: "COLOUR"` to Saturation and
`section: "LENS & FINISH"` to Vignette.

- [ ] **Step 4: Render section headings**

Track the current section while iterating each group in `buildLightTunePanel()`:

```js
let group = null, section = null, wrap = null;
// ...
if (d.group !== group) {
  group = d.group;
  section = null;
  // existing group wrapper creation
}
if (d.section && d.section !== section) {
  section = d.section;
  const sh = document.createElement("h4");
  sh.className = "lt-section";
  sh.textContent = section;
  wrap.appendChild(sh);
}
```

Style `.lt-section` as a compact sticky-safe divider distinct from `.adv-sec`:

```css
.lt-section {
  margin: 16px 0 7px;
  padding: 0 0 4px;
  color: rgba(255,255,255,.72);
  border-bottom: 1px solid rgba(255,255,255,.12);
  font-size: 10px;
  font-weight: 800;
  letter-spacing: .12em;
}
.lt-group .lt-section:first-of-type { margin-top: 6px; }
```

- [ ] **Step 5: Run UI coverage and lint diagnostics**

Run:

```bash
npx playwright test tests/lighting-tuner-grade.spec.js
```

Expected: PASS. Then inspect IDE diagnostics for `js/game/lighting.js`,
`js/game.js`, `css/style.css`, and the new spec; fix only introduced issues.

---

### Task 2: WebGL2 HDR grade

**Files:**
- Create: `tests/image-grade-shaders.test.mjs`
- Modify: `js/shaders/glx-shaders.js:1840-1958,2239-2242`
- Modify: `js/glx.js:237,1810-1829`

**Interfaces:**
- Consumes: `opts.tune` values produced by Task 1.
- Produces: GLSL uniforms `uTone0`, `uTone1`, `uLift`, `uGamma`, `uGain` and `applyHdrGrade(vec3)`.

- [ ] **Step 1: Write failing shader and reference-math tests**

Create `tests/image-grade-shaders.test.mjs`. Load the GLSL source with
`readFileSync`, assert the five packed uniforms exist, and include a JavaScript
reference evaluator with the same constants:

```js
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const GLSL = readFileSync(new URL("../js/shaders/glx-shaders.js", import.meta.url), "utf8");
const luma = (c) => c[0] * 0.2126 + c[1] * 0.7152 + c[2] * 0.0722;
const smooth = (a, b, x) => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

function zoneWeights(y) {
  const z = Math.log2(Math.max(y, 1e-6) / 0.18);
  return [
    1 - smooth(-5, -2.5, z),
    smooth(-5, -2.5, z) * (1 - smooth(-1.5, 0, z)),
    smooth(-2.5, -0.5, z) * (1 - smooth(0.5, 2.5, z)),
    smooth(0, 1.5, z) * (1 - smooth(3, 5, z)),
    smooth(2.5, 5, z),
  ];
}

test("tonal masks target ordered luminance ranges", () => {
  const dark = zoneWeights(0.01);
  const mid = zoneWeights(0.18);
  const bright = zoneWeights(4);
  assert.ok(dark[0] > dark[4]);
  assert.ok(mid[2] > mid[0] && mid[2] > mid[4]);
  assert.ok(bright[4] > bright[0]);
});

test("GLSL exposes the safe HDR grade contract", () => {
  for (const name of ["uTone0", "uTone1", "uLift", "uGamma", "uGain"])
    assert.match(GLSL, new RegExp(name));
  assert.match(GLSL, /applyHdrGrade/);
  assert.match(GLSL, /log2\\(max\\(/);
});
```

Add reference tests proving neutral LGG and zero zone/curve values preserve
representative HDR samples within `1e-6`, all min/max combinations stay finite,
and Lift/Gain channel changes primarily alter their matching channel.

- [ ] **Step 2: Run the Node test and verify RED**

Run:

```bash
node --test tests/image-grade-shaders.test.mjs
```

Expected: FAIL because the uniforms and `applyHdrGrade` do not exist.

- [ ] **Step 3: Add packed WebGL uniforms and uploads**

Append the five names to `compU = locs(...)` in `js/glx.js`, declare them in
`COMPOSITE_FS`, and upload complete neutral fallbacks:

```js
gl.uniform4f(compU.uTone0,
  CT?.blacks ?? 0, CT?.shadows ?? 0, CT?.midtones ?? 0, CT?.highlights ?? 0);
gl.uniform4f(compU.uTone1,
  CT?.whites ?? 0, CT?.toe ?? 0, CT?.shoulder ?? 0, 0);
gl.uniform3f(compU.uLift, CT?.liftR ?? 0, CT?.liftG ?? 0, CT?.liftB ?? 0);
gl.uniform3f(compU.uGamma, CT?.gammaR ?? 1, CT?.gammaG ?? 1, CT?.gammaB ?? 1);
gl.uniform3f(compU.uGain, CT?.gainR ?? 1, CT?.gainG ?? 1, CT?.gainB ?? 1);
```

Use the repository's ES2019-compatible style if optional chaining is not already
accepted in this file.

- [ ] **Step 4: Implement the safe HDR grade in GLSL**

Add `zoneWeights`, luminance-preserving Toe/Shoulder helpers, and
`applyHdrGrade`. Use Rec.709 linear weights `vec3(0.2126, 0.7152, 0.0722)`,
epsilon `1e-6`, the exact log-stop mask boundaries from the test, and:

```glsl
vec3 applyHdrGrade(vec3 c) {
  vec3 lift = uLift;
  vec3 gain = max(uGain, vec3(1e-3));
  vec3 invGamma = 1.0 / max(uGamma, vec3(1e-3));
  c = lift + (gain - lift) * pow(max(c, vec3(0.0)), invGamma);

  float y = max(dot(max(c, vec3(0.0)), vec3(0.2126, 0.7152, 0.0722)), 1e-6);
  vec4 w0; float wWhite;
  gradeZoneWeights(y, w0, wWhite);
  float stops = dot(w0, uTone0) + wWhite * uTone1.x;
  c *= exp2(clamp(stops, -4.0, 4.0));

  c = applyToeShoulder(c, uTone1.y, uTone1.z);
  return max(c, vec3(0.0));
}
```

Toe/Shoulder must be monotonic, luminance-based, identity at zero, and rescale
RGB by `newY / max(oldY, epsilon)`. Insert `c = applyHdrGrade(c);` after bloom
composition and immediately before `acesTonemap`.

- [ ] **Step 5: Run Node and WebGL smoke coverage**

Run:

```bash
node --test tests/image-grade-shaders.test.mjs
npm run test:smoke
```

Expected: both PASS and the composite shader compiles.

---

### Task 3: WebGPU parity and uniform packing

**Files:**
- Modify: `tests/webgpu-lifecycle.test.mjs:253-293`
- Modify: `js/webgpu/wgsl-post.js:374-535,828`
- Modify: `js/webgpu/wgx.js:1498-1530`

**Interfaces:**
- Consumes: the Task 2 constants, operation order, and `opts.tune` keys.
- Produces: 224-byte `CompositeU`, with floats 36–55 carrying the five new vectors.

- [ ] **Step 1: Change lifecycle expectations to RED**

Update the existing packed-uniform test:

```js
assert.match(POST_SOURCE, /COMPOSITE_UNIFORM_BYTES:\s*224/);
const compositeBuffer = h.buffers.find((buffer) => buffer.desc.size === 224);
// Defaults:
assert.deepEqual(composite.slice(36, 44), [0, 0, 0, 0, 0, 0, 0, 0]);
assert.deepEqual(composite.slice(44, 48), [0, 0, 0, 0]);
assert.deepEqual(composite.slice(48, 52), [1, 1, 1, 0]);
assert.deepEqual(composite.slice(52, 56), [1, 1, 1, 0]);
```

Add an extreme upload with all 16 values distinct and assert exact offsets:
`tone0` 36–39, `tone1` 40–43, `lift` 44–47, `gamma` 48–51, `gain` 52–55.

- [ ] **Step 2: Run lifecycle tests and verify RED**

Run:

```bash
npm run test:webgpu-lifecycle
```

Expected: FAIL because the buffer remains 144 bytes.

- [ ] **Step 3: Expand `CompositeU` and pack the values**

In `wgsl-post.js`, append:

```wgsl
tone0 : vec4<f32>,
tone1 : vec4<f32>,
lift  : vec4<f32>,
gamma : vec4<f32>,
gain  : vec4<f32>,
```

Update the layout comment and `COMPOSITE_UNIFORM_BYTES` to 224. In `wgx.js`,
write indices 36–55 with the same fallbacks used by WebGL.

- [ ] **Step 4: Port the GLSL helper exactly to WGSL**

Add `gradeZoneWeights`, Toe/Shoulder helpers, and:

```wgsl
fn applyHdrGrade(c_in : vec3<f32>) -> vec3<f32> {
  var c = U.lift.xyz
    + (max(U.gain.xyz, vec3<f32>(1e-3)) - U.lift.xyz)
    * pow(max(c_in, vec3<f32>(0.0)), 1.0 / max(U.gamma.xyz, vec3<f32>(1e-3)));
  // Same masks, stop clamp, luminance-preserving Toe/Shoulder as GLSL.
  return max(c, vec3<f32>(0.0));
}
```

Call it after bloom and before ACES, exactly matching WebGL.

- [ ] **Step 5: Extend the shader contract test for WGSL parity**

In `tests/image-grade-shaders.test.mjs`, load `js/webgpu/wgsl-post.js` and add
assertions that WGSL defines `applyHdrGrade`, uses `log2(max(` with the same
mask constants, and calls the helper after bloom composition and before
`acesTonemap`.

- [ ] **Step 6: Run parity contracts and lifecycle tests**

Run:

```bash
node --test tests/image-grade-shaders.test.mjs
npm run test:webgpu-lifecycle
```

Expected: PASS.

---

### Task 4: Rendered behavior and broadcast baseline

**Files:**
- Create: `tests/image-grade-visual.spec.js`
- Modify: `js/light-presets.js:20-23`

**Interfaces:**
- Consumes: fully working live controls from Tasks 1–3.
- Produces: measured rendered-behavior regressions and the global broadcast preset.

- [ ] **Step 1: Write rendered directional tests**

Create `tests/image-grade-visual.spec.js`. Reuse the boot pattern and screenshot
decode technique from `tests/lighting-ab.spec.js`. Return per-pixel RGB arrays,
then compare the same baseline pixel positions after a live control change:

```js
async function pixels(page) {
  const buf = await page.screenshot({ type: "jpeg", quality: 90, timeout: 60_000 });
  return page.evaluate(async (b64) => {
    const img = new Image();
    img.src = "data:image/jpeg;base64," + b64;
    await img.decode();
    const c = document.createElement("canvas");
    c.width = img.width; c.height = img.height;
    const cx = c.getContext("2d");
    cx.drawImage(img, 0, 0);
    return Array.from(cx.getImageData(0, 0, c.width, c.height).data);
  }, buf.toString("base64"));
}
```

Add tests that:

- set all new controls neutral and capture a stable parked Bahrain day frame
- set `shadows: 0.5`; assert the mean change among baseline dark pixels is at
  least twice the mean change among bright pixels
- set `highlights: 0.5`; assert the inverse relationship
- set `gainR: 1.2`; assert red changes more than green and blue
- set every new control to its minimum, then maximum, and assert the canvas
  remains renderable and `__apex.info().state === "race"`

- [ ] **Step 2: Run rendered tests before the global preset**

Run:

```bash
npx playwright test tests/image-grade-visual.spec.js
```

Expected: PASS with neutral defaults; no global regrade has been selected yet.

- [ ] **Step 3: Establish a measured broadcast starting preset**

Add these conservative starting values to `LightPresets["*"]`, preserving
`carGloss`:

```js
"*": {
  "carGloss": 0.35,
  "blacks": -0.06,
  "shadows": 0.04,
  "midtones": 0.03,
  "highlights": -0.06,
  "whites": -0.08,
  "toe": 0.05,
  "shoulder": 0.14,
  "liftR": 0.0,
  "liftG": 0.0,
  "liftB": 0.0,
  "gammaR": 1.0,
  "gammaG": 1.0,
  "gammaB": 1.0,
  "gainR": 1.01,
  "gainG": 1.0,
  "gainB": 0.99
}
```

- [ ] **Step 4: Capture and inspect the representative matrix**

Use fixed `park()`/`eyeAt()` camera positions and capture:

- Bahrain, day, dry
- Monaco, dawn, dry
- Silverstone, day, overcast
- Singapore, night, dry
- Spa, day, rain

Save before/after images under
`scratch/captures/playwright-probe/image-grade/{before,after}/`. Compare dark
asphalt/tyres/cockpit, cloud and lamp clipping, neutral barriers, and livery hue.
Adjust only `LightPresets["*"]` values until the approved broadcast criteria are
met. Do not hide a per-track lighting problem with a global extreme.

- [ ] **Step 5: Add broad baseline clipping guards**

In `tests/image-grade-visual.spec.js`, compute screenshot luminance and assert on
the representative matrix:

```js
expect(stats.blackClipFraction).toBeLessThan(0.08);
expect(stats.whiteClipFraction).toBeLessThan(0.03);
expect(stats.p95 - stats.p05).toBeGreaterThan(45);
```

Use RGB ≤ 1 for black clipping, RGB ≥ 254 for white clipping, and percentile
luminance from the decoded screenshot. If a scene legitimately contains large
letterbox/UI areas, hide the HUD and sample only the game viewport.

- [ ] **Step 6: Run grading and lighting tests**

Run:

```bash
npx playwright test tests/image-grade-visual.spec.js tests/lighting-ab.spec.js tests/lightstate.spec.js
```

Expected: PASS. Keep the final global values, not necessarily the starting values
from Step 3.

---

### Task 5: Documentation, cache bump, and integration verification

**Files:**
- Modify: `docs/LIGHTING-REF.md`
- Modify: `index.html`
- Modify: `version.json`
- Verify all files changed by Tasks 1–4

**Interfaces:**
- Consumes: the finalized shader layout, control IDs, and global preset.
- Produces: deploy-safe cache version and user/developer documentation.

- [ ] **Step 1: Update the lighting reference**

Document:

- the pre-ACES HDR grade order
- all 16 new IDs, ranges, and neutral values
- distinction between Blacks vs Black Floor and Whites vs ACES White Scale
- `section` metadata behavior
- `CompositeU` 224-byte offsets
- global baseline vs per-condition/local override precedence

- [ ] **Step 2: Run syntax and focused tests**

Run:

```bash
node --check js/game/lighting.js
node --check js/game.js
node --check js/glx.js
node --check js/shaders/glx-shaders.js
node --check js/webgpu/wgsl-post.js
node --check js/webgpu/wgx.js
node --check js/light-presets.js
node --test tests/image-grade-shaders.test.mjs
npm run test:webgpu-lifecycle
npx playwright test tests/lighting-tuner-grade.spec.js tests/image-grade-visual.spec.js
```

Expected: all PASS.

- [ ] **Step 3: Bump the cache exactly once**

Read the current build from `version.json`, increment it by one, replace every
asset `?v=<old>` in `index.html` with the new number, and update
`window.__APEX_BUILD` if present. Do not assume the number recorded when this plan
was written because unrelated work may have advanced it.

- [ ] **Step 4: Run integration guards**

Run:

```bash
npm run test:smoke
npm run test:webgl
npm run test:webgpu-lifecycle
npx playwright test tests/lighting-tuner-grade.spec.js tests/image-grade-visual.spec.js
```

Expected: all focused checks PASS.

- [ ] **Step 5: Inspect final diffs and diagnostics**

Confirm:

- `index.html` and `version.json` use one identical new build
- no unrelated user edits were reverted
- no stale 144-byte `CompositeU` comments or tests remain
- GLSL/WGSL constants and operation order match
- new files contain no placeholder help text
- IDE diagnostics show no newly introduced errors

- [ ] **Step 6: Report completion without committing**

Summarize changed controls, final global grade values, WebGL/WebGPU parity,
verification results, and any pre-existing unrelated failures. Commit and push
only if the user explicitly requests them.
