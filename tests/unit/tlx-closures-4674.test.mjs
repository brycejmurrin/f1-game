/* #4674 (#3104 F5): the last per-frame closures on the TLX path stay hoisted — GC hygiene, no visual change. */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "../..");
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");
const body = (src, head) => {
  const i = src.indexOf(head);
  assert.ok(i >= 0, head);
  return src.slice(i);
};

test("TslFx.updateFrame allocates no closure and no fallback array", () => {
  const src = read("js/render/three/tsl-fx.js");
  const b = body(src, "function updateFrame(frame)");
  const fn = b.slice(0, b.indexOf("return { shadowMat"));
  assert.doesNotMatch(fn, /=>/, "no arrow closure in updateFrame");
  assert.doesNotMatch(fn, /\[\s*[\d.]+\s*,/, "no inline array literal in updateFrame");
  assert.match(src, /_AMB_SKY = Object\.freeze\(/);
  assert.match(src, /_AMB_GROUND = Object\.freeze\(/);
});

test("TlxPost.present reads knobs through the module-scope helper", () => {
  const src = read("js/render/three/tlx-post.js");
  assert.doesNotMatch(src, /const gk = \(id\)/);
  assert.doesNotMatch(src, /\bgk\("/);
  assert.match(src, /const _gk = \(T, id\) => PostCommon\.knob\(T, id\)/);
});

test("the hoisted fx knob helper keeps the null / missing / present semantics", () => {
  const src = read("js/render/three/tsl-fx.js");
  const m = src.match(/const _kn = (\(T, id, def\) => [^;]+);/);
  assert.ok(m);
  const kn = eval(m[1]);
  assert.equal(kn(null, "a", 1), 1);
  assert.equal(kn({}, "a", 1), 1);
  assert.equal(kn({ a: 0 }, "a", 1), 0);
});
