// #6822: one home for the material-pack scale/mip rules and the sun-shadow strength.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { absSrc } from "../helpers/abs-src.mjs";

const read = (p) => fs.readFileSync(new URL("../../" + p, import.meta.url), "utf8");

function load(files, extra = {}) {
  const ctx = vm.createContext({ window: undefined, console, Log: { warn() {} }, ...extra });
  for (const f of files) vm.runInContext(read(f) + "\n;globalThis.__x=(globalThis.__x||{});", ctx, { filename: absSrc(f) });
  return ctx;
}

test("Assets.matScale is always numeric: [0,-1,\"3\",NaN] -> [0,0,3,0]", () => {
  const ctx = load(["js/render/shared/assets.js"]);
  const { matScale, mipCount } = vm.runInContext("Assets", ctx);
  assert.deepEqual([0, -1, "3", NaN].map(matScale), [0, 0, 3, 0]);
  assert.equal(matScale(undefined), 0);
  assert.equal(mipCount(1024), 11);
  assert.equal(mipCount(1), 1);
});

test("the backends no longer restate the scale / mip / shadow-fade rules", () => {
  for (const f of ["js/render/glx/glx.js", "js/render/webgpu/wgx.js", "js/render/three/tsl-lit.js"]) {
    const s = read(f);
    assert.ok(!/\+sc\[i\] > 0/.test(s), f + ": scale rule pasted");
    assert.ok(!/\(_kl - 0\.28\) \/ 0\.14/.test(s), f + ": shadow fade pasted");
    assert.match(s, /sunShadowStrength/, f + " reads PostCommon.sunShadowStrength");
  }
  assert.match(read("js/render/three/tsl-lit.js"), /const _tk = \(id\) => PostCommon\.knob\(_tuneT, id\)/);
});

test("PostCommon.sunShadowStrength: key fade, MOON SHADOWS floor, TUNE_DEFS defaults", () => {
  const ctx = load(["js/lighting/knobs.js", "js/render/shared/post-common.js"]);
  const P = vm.runInContext("PostCommon", ctx);
  const day = { sunColor: [1, 0.9, 0.8] }, night = { sunColor: [0.1, 0.1, 0.1] };
  assert.equal(P.sunShadowStrength(day, null), 1.15);                     // shadowStr def, full fade
  assert.equal(P.sunShadowStrength(night, null), 0);                      // dim key, no moonGate
  assert.equal(P.sunShadowStrength({ ...night, moonGate: 1 }, null), 1.15 * 0.25);
  assert.equal(P.sunShadowStrength(day, { shadowStr: 2 }), 2);
  const mid = P.sunShadowStrength({ sunColor: [0.35, 0, 0] }, null);       // h = 0.5 -> smoothstep 0.5
  assert.ok(Math.abs(mid - 1.15 * 0.5) < 1e-9);
});
