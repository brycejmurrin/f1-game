/* TLX post P2 / audit #6 — fixed per-pair materials so present() does not
 * ping-pong shared .tex.value (WebGL2 re-uploads UBOs on each swap).
 * Source canaries only (~0.05 s); live pixel A/B is the gfx probe. */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");

test("tsl-post exposes fixed H/V blur and per-mip bloom materials with unique keys", () => {
  const src = read("js/render/three/tsl-post.js");
  assert.match(src, /const blurAOH = makeBlur\("tlx-post-blur-ao-h"\)/);
  assert.match(src, /const blurAOV = makeBlur\("tlx-post-blur-ao-v"\)/);
  assert.match(src, /const blurGRH = makeBlur\("tlx-post-blur-gr-h"\)/);
  assert.match(src, /const blurGRV = makeBlur\("tlx-post-blur-gr-v"\)/);
  assert.match(src, /makeDown\("tlx-post-down-" \+ \(di \+ 1\)\)/);
  assert.match(src, /makeUp\(true, "tlx-post-up-add-" \+ \(ui \+ 2\)\)/);
  assert.match(src, /makeUp\(false, "tlx-post-up-final"\)/);
  assert.match(src, /blurAOH, blurAOV, blurGRH, blurGRV/);
  assert.match(src, /downFixed/);
  assert.match(src, /upAddFixed, upFinalFixed/);
  // Shared swap materials remain for apex26.tlxPostFixedMats=0.
  assert.match(src, /const blurAO = makeBlur\("tlx-post-blur-ao"\)/);
  assert.match(src, /const blurGR = makeBlur\("tlx-post-blur-godray"\)/);
});

test("tlx-post present uses fixed mats by default and keeps a swap fallback", () => {
  const src = read("js/render/three/tlx-post.js");
  assert.match(src, /apex26\.tlxPostFixedMats/);
  assert.match(src, /let _fixedMats = true/);
  assert.match(src, /function bindFixedAO\(\)/);
  assert.match(src, /function bindFixedGR\(\)/);
  assert.match(src, /function bindFixedBloom\(\)/);
  // Fixed path: dir only, no .tex.value on the shared blurAO in the hot arm.
  const ao = src.slice(src.indexOf("runPass(P.ssao.mat, ssaoRT)"), src.indexOf("// 0b) Volumetric"));
  assert.match(ao, /_fixedMats && P\.blurAOH/);
  assert.match(ao, /runPass\(P\.blurAOH\.mat, ssaoBlurRT\)/);
  assert.match(ao, /runPass\(P\.blurAOV\.mat, ssaoRT\)/);
  assert.match(ao, /P\.blurAO\.tex\.value = ssaoRT\.texture/,
    "fallback arm must still swap when fixed mats are off");
  const bloom = src.slice(src.indexOf("runPass(P.bright.mat, bloomLv[0].rt)"), src.indexOf("// 3) composite"));
  assert.match(bloom, /P\.downFixed\[i - 1\]/);
  assert.match(bloom, /P\.upFinalFixed/);
  assert.match(bloom, /P\.upAddFixed\[i - 2\]/);
});
