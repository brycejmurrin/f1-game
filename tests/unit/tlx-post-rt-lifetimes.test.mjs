/* #7229 (#7219 R5/R6/R7): TLX post render-target lifetimes. Source-shape canaries plus a node simulation of the
 * capture-RT shed; the live gate is CI's gfx-probe --tlx-webgpu --lavapipe (gpuErrors 0), not this file. */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const post = fs.readFileSync(path.join(ROOT, "js/render/three/tlx-post.js"), "utf8");
const aa = fs.readFileSync(path.join(ROOT, "js/render/three/tsl-aa.js"), "utf8");

function body(src, startMarker, endMarker) {
  const a = src.indexOf(startMarker), b = src.indexOf(endMarker, a);
  assert.ok(a >= 0 && b > a, "markers found: " + startMarker);
  return src.slice(a, b);
}

test("R6: cinemaPost's live path allocates no closure", () => {
  const fn = body(post, "function cinemaPost(", "// have* is this frame's gate");
  assert.doesNotMatch(fn, /=>/, "no arrow literal in cinemaPost");
  assert.doesNotMatch(fn, /\bnext\s*\(/);
  assert.equal((fn.match(/cur === cineA \? cineB : cineA/g) || []).length, 2);
});

test("R5: capture RTs are shed after SHED_FRAMES presents AND CAP_HOLD_MS since the last request", () => {
  assert.match(post, /let cap8RT = null, cap8Idle = 0, fxaaCapIdle = 0/);
  assert.match(post, /const CAP_HOLD_MS = 30000/);
  assert.match(body(post, "function cap8(", "if (!rt || !rt.texture"), /cap8Idle = 0; cap8T = capNow\(\)/, "reset before the 8-bit early return");
  assert.match(body(post, "function captureTarget()", "rtSetSize(fxaaCaptureRT"), /fxaaCapIdle = 0; fxaaCapT = capNow\(\)/);
  assert.match(post, /dropRT\(cap8RT\); cap8RT = null/);
  assert.match(post, /dropRT\(fxaaCaptureRT\); fxaaCaptureRT = null/);
});

test("R5: shed simulation — one capture then 10 presents and the hold holds nothing; a per-frame requester keeps cap8RT", () => {
  const SHED_FRAMES = Number(/const SHED_FRAMES = (\d+)/.exec(post)[1]);
  const HOLD = Number(/const CAP_HOLD_MS = (\d+)/.exec(post)[1]);
  let now = 0;
  const mk = () => ({ rt: null, idle: 0, t: 0 });
  const capture = (c) => { c.idle = 0; c.t = now; if (!c.rt) c.rt = {}; };
  const present = (c) => { now += 16; if (c.rt && ++c.idle >= SHED_FRAMES && now - c.t >= HOLD) { c.rt = null; c.idle = 0; } };
  const once = mk(); capture(once);
  for (let i = 0; i < 10; i++) present(once);
  assert.ok(once.rt, "a pending read may still name it: held inside the wall-clock window");
  now += HOLD;
  for (let i = 0; i < 10; i++) present(once);
  assert.equal(once.rt, null, "one-off capture RT shed");
  const soft = mk();
  for (let i = 0; i < 3000; i++) { capture(soft); present(soft); }
  assert.ok(soft.rt, "soft present keeps the RT");
});

test("R7: TAA history resize goes through ctx.rtSetSize so rtResizes counts it", () => {
  assert.match(post, /ownRT, rtSetSize, trackMaterial/);
  assert.match(aa, /ctx\.rtSetSize\(hist\[0\], w, h\); ctx\.rtSetSize\(hist\[1\], w, h\)/);
});

/* #7420: the bloom up-passes keep their additive blend under the scene's ssrTag MRT. present() runs the post chain
 * with the MRT still set; three's WebGPU pipeline takes each attachment's blend from MRTNode.getBlendMode(texture.name)
 * and only "output" maps to the material blend. The live A/B is the GPU census. */
const tsl = fs.readFileSync(path.join(ROOT, "vendor/three-0.187.0/three.tsl.min.js"), "utf8");
const gpu = fs.readFileSync(path.join(ROOT, "vendor/three-0.187.0/three.webgpu.min.js"), "utf8");
test("every bloom level target is named \"output\" before it joins bloomLv", () => {
  const fn = body(post, "function ensureBloom()", "return nLv > 0;");
  const name = fn.indexOf('rt.texture.name = "output"'), push = fn.indexOf("bloomLv.push({ rt");
  assert.ok(name > 0, "ensureBloom names the level texture");
  assert.ok(push > name, "named before it is pushed (every level, both formats)");
  assert.match(fn, /const rt = bloom11 \?[^\n]*\n[\s\S]*rt\.texture\.name = "output"/, "the name follows the one makeRT line");
});

test("the up-passes that need the blend still draw into bloomLv targets", () => {
  assert.match(post, /runPass\(up\.mat, bloomLv\[i - 1\]\.rt, i > 1\)/);
});

test("vendor three: MRT keeps material blend only for the \"output\" name", () => {
  // MRTNode constructor: blendModes = { output: <MaterialBlending mode> }; getBlendMode(name) falls back to NoBlending.
  assert.match(tsl, /this\.blendModes=\{output:(\w+)\}/, "default blend map keys \"output\" only");
  assert.match(tsl, /getBlendMode\(e\)\{return this\.blendModes\[e\]\|\|\w+\}/, "lookup by attachment name with a fallback");
  // WebGPU pipeline: the per-attachment blend comes from mrt.getBlendMode(texture.name).
  assert.match(gpu, /getBlendMode\(n\.name\)/, "pipeline keys blend by the attachment texture's name");
});
