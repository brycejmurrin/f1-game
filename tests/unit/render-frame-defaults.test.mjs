// #7141 (#6479 rows 2+4): one frame-defaults table and one software-renderer classifier for GLX and TLX/TSL.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { absSrc } from "../helpers/abs-src.mjs";

const read = (p) => fs.readFileSync(new URL("../../" + p, import.meta.url), "utf8");
const ctx = vm.createContext({ window: undefined, console, Log: { warn() {} } });
for (const f of ["js/lighting/knobs.js", "js/render/shared/post-common.js"])
  vm.runInContext(read(f) + "\n;", ctx, { filename: absSrc(f) });
const P = vm.runInContext("PostCommon", ctx);

test("software-renderer classifier: the union verdict over the six named renderers", () => {
  const soft = ["ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero)), SwiftShader driver)", "llvmpipe (LLVM 15.0.7, 256 bits)",
    "Mesa lavapipe", "Google SwiftShader Subzero", "Microsoft Basic Render Driver", "GDI Generic", "softpipe", "Software Rasterizer"];
  for (const n of soft) assert.equal(P.isSoftwareRenderer(n), true, n);
  // a bare "soft" (Microsoft's real D3D12 adapters, Apple GPUs) is hardware
  for (const n of ["ANGLE (Microsoft, NVIDIA GeForce RTX 4070 Direct3D11)", "Apple GPU", "Adreno (TM) 740", "", null, undefined])
    assert.equal(P.isSoftwareRenderer(n), false, String(n));
});

test("frame defaults: fogColor is the TLX value; a present field, even 0, wins", () => {
  assert.deepEqual([...P.FRAME_DEFAULTS.fogColor], [0.04, 0.04, 0.06]);
  assert.deepEqual([...P.frameDefault({}, "fogColor")], [0.04, 0.04, 0.06]);
  assert.deepEqual([...P.frameDefault(null, "skyZenith")], [0.18, 0.40, 0.78]);
  assert.equal(P.frameDefault({ cloud: 0 }, "cloud"), 0);
  assert.equal(P.frameDefault({ cloudSpeed: 0 }, "cloudSpeed"), 0);
  assert.equal(P.frameDefault({}, "cloudSpeed"), 1);
  assert.deepEqual([...P.frameDefault({ fogColor: [1, 0, 0] }, "fogColor")], [1, 0, 0]);
});

test("every defaulted frame field is produced by the game.js frame builder or atmosphere.js", () => {
  const src = read("js/game.js") + read("js/lighting/atmosphere.js");
  for (const k of Object.keys(P.FRAME_DEFAULTS))
    assert.match(src, new RegExp("\\b" + k + "\\s*[:=]"), k + " has a producer");
});

test("GLX, TLX and TSL read PostCommon, not their own copies; WGX stays frozen with its own fogColor", () => {
  for (const f of ["js/render/glx/glx.js", "js/render/three/tlx.js", "js/render/three/tsl-lit.js"]) {
    const s = read(f);
    assert.ok(!/swiftshader\|llvmpipe/.test(s), f + ": classifier regex pasted");
    assert.ok(!/\[0\.04, 0\.04, 0\.06\]/.test(s), f + ": fogColor default pasted");
  }
  assert.match(read("js/render/glx/glx.js"), /PostCommon\.isSoftwareRenderer/);
  assert.match(read("js/render/three/tlx.js"), /PostCommon\.isSoftwareRenderer/);
  assert.match(read("js/render/webgpu/wgx.js"), /\|\| \[0\.5,0\.6,0\.7\]/);   // D-049: the pin records the difference
});
