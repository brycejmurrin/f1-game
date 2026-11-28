/* #7232: TSL WebGPU hygiene. R2 sky cache retire unbinds C.tex before dispose; R3 MAT taps carry explicit
 * gradients; R4 dead uniformArray hedge gone. Each fails on the base tree. */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath, pathToFileURL } from "node:url";
import { installThreeGlobals } from "../helpers/fake-webgl2.mjs";
import { absSrc } from "../helpers/abs-src.mjs";
import { seedTlxUtil } from "../helpers/tlx-util-vm.mjs";

seedTlxUtil();   // TLX files release through TLXUtil at call time (#7334)

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "../..");
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");
installThreeGlobals();
globalThis.Log = globalThis.Log || { info() {}, warn() {}, error() {}, debug() {} };
const THREE = await import(pathToFileURL(path.join(ROOT, "vendor/three-0.187.0/three.webgpu.min.js")).href);
const TSL = THREE.TSL;

test("R2: sky retire rebinds the cache texture node off the disposed targets", () => {
  for (const f of ["js/render/three/tsl-chunks.js", "js/render/three/tsl-sky.js"]) vm.runInThisContext(read(f), { filename: absSrc(f) });
  for (const how of ["dispose"]) {
    const sky = globalThis.TLXShaders.sky(THREE, TSL, { chunks: globalThis.TLXShaders.chunks(THREE, TSL), cache: true, cacheSize: 0 });
    const disposed = new Set();
    const hooks = [];
    // The cache's texture node is the only `texture(...)` bound to an RT texture; find the RTs via dispose events.
    const origDispose = THREE.RenderTarget.prototype.dispose;
    THREE.RenderTarget.prototype.dispose = function () { disposed.add(this.texture); hooks.push(this); return origDispose.call(this); };
    let boundAfter;
    try {
      sky[how]();
    } finally { THREE.RenderTarget.prototype.dispose = origDispose; }
    assert.ok(disposed.size >= 2, "both cache render targets were disposed");
    boundAfter = sky.cacheState();
    // The placeholder is a fresh DataTexture, never one of the disposed RT textures (#7451: scalars, not the Texture).
    assert.equal(boundAfter.texIsPlaceholder, true, "C.tex.value is the placeholder, not a disposed texture");
    assert.equal(boundAfter.texW, 1, "bound to the 1x1 placeholder");
  }
});

test("R3 + R4: MAT taps carry explicit gradients; the dead uniformArray hedge is gone", () => {
  const src = read("js/render/three/tsl-lit.js");
  const taps = (re) => (src.match(re) || []).length;
  assert.deepEqual(
    [taps(/(matNormalNode|matAlbedoNode)\.sample\(uv\)\.grad\(uvDx, uvDy\)\.depth\(/g), taps(/(matNormalNode|matAlbedoNode)\.sample\(uv\)\.depth\(/g)],
    [2, 0], "both MAT taps use .grad, none is implicit");
  // The derivatives sit above each live/far/fade gate (the tap itself is emitted inside it on first use).
  for (const fn of ["applyMaterialTexNormal = ", "applyMaterialTex = "]) {
    const at = src.indexOf(fn);
    assert.equal(at > 0 && src.indexOf("const uvDx = dFdx(uv)", at) < src.indexOf("If(live.and(", at), true, `${fn}: derivatives precede the gate`);
  }
  assert.equal(taps(/matTexScale\.needsUpdate|matTexScale\.array \|\||r186/g), 0, "R4 leftovers");
});
