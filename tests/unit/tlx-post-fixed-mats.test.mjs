/* TLX post P2 / audit #6 — fixed per-pair materials so present() does not
 * ping-pong shared .tex.value (WebGL2 re-uploads UBOs on each swap).
 * Source canaries only (~0.05 s); live pixel A/B is the gfx probe. */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
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

// Evaluate the actual shader's arithmetic for fixtures; this is a numeric
// contract check, not evidence of TSL compilation or GPU image quality.
function sharpenFixture(center, neighbors, limited) {
  class Node {
    constructor(value) { this.value = Array.isArray(value) ? value.slice() : [value]; }
    op(other, fn) { const b = other instanceof Node ? other.value : [other]; return new Node(this.value.map((v, i) => fn(v, b[b.length === 1 ? 0 : i]))); }
    add(b) { return this.op(b, (a, x) => a + x); }
    sub(b) { return this.op(b, (a, x) => a - x); }
    mul(b) { return this.op(b, (a, x) => a * x); }
    assign(b) { this.value = b.value.slice(); }
    greaterThan(b) { return this.value[0] > b; }
  }
  const c = new Node(center), vUV = new Node([0, 0]);
  const context = vm.createContext({ c, vUV,
    C: { sharpen: new Node(1), sharpenLimit: new Node(limited ? 1 : 0), reflTexel: { x: 1, y: 1 } },
    vec2: (x, y) => new Node([x, y]),
    caScene: (uv) => new Node(neighbors[uv.value[0] < 0 ? 0 : uv.value[0] > 0 ? 1 : uv.value[1] < 0 ? 2 : 3]),
    min: (a, b) => a.op(b, Math.min), max: (a, b) => a.op(b, Math.max),
    clamp: (a, lo, hi) => a.op(lo, Math.max).op(hi, Math.min),
    If: (condition, then) => { if (condition) then(); return { Else(otherwise) { if (!condition) otherwise(); } }; },
  });
  const source = read("js/render/three/tsl-post.js");
  const start = source.indexOf("        If(C.sharpen.greaterThan");
  const end = source.indexOf("        const aoV", start);
  vm.runInContext(source.slice(start, end), context);
  return c.value;
}

test("halo-limited sharpen is opt-in and bounds bright and dark edge extrema", () => {
  const white = [1, 1, 1], black = [0, 0, 0];
  assert.deepEqual(sharpenFixture(white, [black, black, black, black], true), white);
  assert.deepEqual(sharpenFixture(black, [white, white, white, white], true), black);
  assert.deepEqual(sharpenFixture(white, [black, black, black, black], false), [1.9, 1.9, 1.9]);
  assert.deepEqual(sharpenFixture(black, [white, white, white, white], false), [-0.9, -0.9, -0.9]);
  const mid = [0.5, 0.5, 0.5], ramp = [[0.4,0.4,0.4],[0.6,0.6,0.6],[0.5,0.5,0.5],[0.5,0.5,0.5]];
  assert.deepEqual(sharpenFixture(mid, ramp, true), mid);
  assert.match(read("js/render/three/tsl-post.js"), /sharpenLimit: uniform\(0\)/);
  assert.match(read("js/render/three/tlx-post.js"), /apex26\.tlxSharpenLimit.*=== "1" \? 1 : 0/);
});
