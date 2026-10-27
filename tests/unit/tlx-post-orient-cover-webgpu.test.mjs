/* Phone orientation cover (#3311) must stay off on three's WebGPU backend.
 * three r186 keeps a render target's viewport only when it differs from the
 * CANVAS drawing-buffer rect; the cover's logical rect equals the canvas, so the
 * scene filled the whole max(w,h) square while the post readers sampled the top
 * h/side of it: every camera stretched 844/390 = 2.16x vertically on an iPhone
 * (Bryce, 2026-10-26, TLX WebGPU). Executes the real gate from tlx-post.js. */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const FILE = path.join(ROOT, "js/render/three/tlx-post.js");
const SRC = fs.readFileSync(FILE, "utf8");

const START = SRC.indexOf("    // Not on WebGPU:") >= 0 ? SRC.indexOf("    // Not on WebGPU:") : SRC.indexOf("    if (ctx.fixedTargets && ctx.vp");
const END = SRC.indexOf("    const phys = fixed || orientCover;");

function gate({ webgpu, isMobile = true, fixedTargets = false }) {
  assert.ok(START > 0 && END > START, "the orient-cover gate moved: update this test");
  const viewports = [];
  const context = vm.createContext({
    THREE: {}, TSL: {},
    renderer: { backend: webgpu ? { isWebGPUBackend: true } : { isWebGLBackend: true } },
    ctx: { isMobile, fixedTargets, vp: null },
    window: { TLXShaders: { viewport: (_t, _s, o) => { viewports.push(o); return { enabled: true }; } } },
  });
  context.window.TLXShaders.viewport.enabled = true;
  const code = "var TLXShaders = window.TLXShaders; let viewportScope = null;\n" + SRC.slice(START, END) +
    "\nthis.out = { orientCover, fixed, phonePost };";
  vm.runInContext(code, context, { filename: path.join(ROOT, "js/render/three/tlx-post.js") });
  return { ...context.out, viewports: viewports.length };
}

test("phone WebGL keeps the #3311 orientation cover", () => {
  const r = gate({ webgpu: false });
  assert.equal(r.phonePost, true);
  assert.equal(r.orientCover, true, "the WebGL phone path still avoids the rotate realloc");
});

test("phone WebGPU does not use the orientation cover (stretched-frame regression)", () => {
  const r = gate({ webgpu: true });
  assert.equal(r.phonePost, true);
  assert.equal(r.orientCover, false, "WebGPU drops rt.viewport when it equals the canvas rect");
  assert.equal(r.viewports, 0, "no local square-cover viewport mapper on WebGPU");
});

test("desktop never builds the cover", () => {
  assert.equal(gate({ webgpu: true, isMobile: false }).orientCover, false);
  assert.equal(gate({ webgpu: false, isMobile: false }).orientCover, false);
});
