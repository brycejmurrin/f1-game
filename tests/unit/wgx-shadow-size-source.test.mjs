/* wgx-shadow-size-source — sun-map texel size has one source after the peel.
 *
 * WHY THIS EXISTS. WGXShadow.init owns SHADOW_SIZE for the depth texture.
 * wgx.js used to keep a second copy for frame UBO d[74] (PCF texel); those
 * could diverge. Also pins that car/lamp/model-stride leftovers stayed in
 * the shadow module, and that GLX shader comments no longer cite drifted
 * absolute line numbers for the AO / SSR / sky / lampSh gates (#3984). */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read = (rel) => fs.readFileSync(new URL(`../../${rel}`, import.meta.url), "utf8");

test("wgx.js PCF texel reads SHD.SHADOW_SIZE; no second SHADOW_SIZE const", () => {
  const src = read("js/render/webgpu/wgx.js");
  assert.match(src, /d\[74\]\s*=\s*1\s*\/\s*SHD\.SHADOW_SIZE/);
  assert.doesNotMatch(src, /const\s+SHADOW_SIZE\s*=/);
  assert.doesNotMatch(src, /const\s+CAR_SHADOW_SIZE\s*=/);
  assert.doesNotMatch(src, /const\s+CAR_SHADOW_ALLOC\s*=/);
  assert.doesNotMatch(src, /const\s+LAMP_SHADOW_SIZE\s*=/);
  assert.doesNotMatch(src, /const\s+SHADOW_MODEL_STRIDE\s*=/);
});

test("wgx-shadow.js owns SHADOW_SIZE and exposes it on the SHD handle", () => {
  const src = read("js/render/webgpu/wgx-shadow.js");
  assert.match(src, /const\s+SHADOW_SIZE\s*=\s*WGX_LITE\s*\?\s*1024\s*:\s*2048/);
  assert.match(src, /get\s+SHADOW_SIZE\s*\(\s*\)\s*\{\s*return\s+SHADOW_SIZE\s*;\s*\}/);
});

test("GLX shader gate comments do not cite drifted absolute line numbers", () => {
  const post = read("js/render/glx/shaders/glsl-post.js");
  const sky = read("js/render/glx/shaders/glsl-sky.js");
  const lit = read("js/render/glx/shaders/glsl-lit.js");
  assert.doesNotMatch(post, /multiplied by zero on line 199/);
  assert.doesNotMatch(post, /ssrGate\s*>\s*0\.001'\s*\(line 825\)/);
  assert.doesNotMatch(sky, /line 108 is mix/);
  assert.doesNotMatch(sky, /expensive part is line 109/);
  assert.doesNotMatch(sky, /stays live:\s*159 and 206/);
  assert.doesNotMatch(lit, /two readers — line 1096/);
  assert.match(post, /if\s*\(\s*uStrength\s*>\s*0\.0\s*\)/);
  assert.match(lit, /lampSh has exactly two readers/);
});
