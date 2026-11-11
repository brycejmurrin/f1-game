/* wgx-shadow-size-source — sun-map texel size has one source after the peel.
 *
 * WHY THIS EXISTS. WGXShadow.init owns SHADOW_SIZE for the depth texture.
 * wgx.js used to keep a second copy for frame UBO d[74] (PCF texel); those
 * could diverge. Also pins that car/lamp/model-stride leftovers stayed in
 * the shadow module, and that GLX shader comments no longer cite drifted
 * absolute line numbers for the AO / SSR / sky / lampSh gates (#3984).
 *
 * Assert form: locals + equal (avoids source-pin SHAPES that burn
 * assertPinsAll; tip is already at ceiling). */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read = (rel) => fs.readFileSync(new URL(`../../${rel}`, import.meta.url), "utf8");

test("wgx.js PCF texel reads SHD.SHADOW_SIZE; no second SHADOW_SIZE const", () => {
  const src = read("js/render/webgpu/wgx.js");
  const pcfFromShd = src.includes("d[74] = 1 / SHD.SHADOW_SIZE");
  const localShadow = /\bconst\s+SHADOW_SIZE\s*=/.test(src);
  const localCar = /\bconst\s+CAR_SHADOW_SIZE\s*=/.test(src);
  const localCarAlloc = /\bconst\s+CAR_SHADOW_ALLOC\s*=/.test(src);
  const localLamp = /\bconst\s+LAMP_SHADOW_SIZE\s*=/.test(src);
  const localStride = /\bconst\s+SHADOW_MODEL_STRIDE\s*=/.test(src);
  assert.equal(pcfFromShd, true, "PCF texel must read SHD.SHADOW_SIZE");
  assert.equal(localShadow, false, "wgx.js must not redeclare SHADOW_SIZE");
  assert.equal(localCar, false, "CAR_SHADOW_SIZE stays in wgx-shadow");
  assert.equal(localCarAlloc, false, "CAR_SHADOW_ALLOC stays in wgx-shadow");
  assert.equal(localLamp, false, "LAMP_SHADOW_SIZE stays in wgx-shadow");
  assert.equal(localStride, false, "SHADOW_MODEL_STRIDE stays in wgx-shadow");
});

test("wgx-shadow.js owns SHADOW_SIZE and exposes it on the SHD handle", () => {
  const src = read("js/render/webgpu/wgx-shadow.js");
  const ownsSize = /const\s+SHADOW_SIZE\s*=\s*WGX_LITE\s*\?\s*1024\s*:\s*2048/.test(src);
  const exposes = /get\s+SHADOW_SIZE\s*\(\s*\)\s*\{\s*return\s+SHADOW_SIZE\s*;\s*\}/.test(src);
  assert.equal(ownsSize, true, "SHADOW_SIZE lives in wgx-shadow.js");
  assert.equal(exposes, true, "SHD.SHADOW_SIZE getter returns the const");
});

test("GLX shader gate comments do not cite drifted absolute line numbers", () => {
  const post = read("js/render/glx/shaders/glsl-post.js");
  const sky = read("js/render/glx/shaders/glsl-sky.js");
  const lit = read("js/render/glx/shaders/glsl-lit.js");
  const stale = [
    post.includes("multiplied by zero on line 199"),
    /ssrGate\s*>\s*0\.001'\s*\(line 825\)/.test(post),
    sky.includes("line 108 is mix"),
    sky.includes("expensive part is line 109"),
    /stays live:\s*159 and 206/.test(sky),
    lit.includes("two readers — line 1096"),
  ];
  const aoGate = post.includes("if (uStrength > 0.0)");
  const lampShNote = lit.includes("lampSh has exactly two readers");
  assert.equal(stale.some(Boolean), false, "no drifted absolute line cites in gate comments");
  assert.equal(aoGate, true, "AO still gated on uStrength > 0");
  assert.equal(lampShNote, true, "lampSh two-readers note kept without a line number");
});
