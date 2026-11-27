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

test("R5: capture RTs are shed after SHED_FRAMES presents with no capture request", () => {
  assert.match(post, /let cap8RT = null, cap8Idle = 0, fxaaCapIdle = 0/);
  assert.match(body(post, "function cap8(", "return cap8RT;"), /cap8Idle = 0;/);
  assert.match(body(post, "function captureTarget()", "rtSetSize(fxaaCaptureRT"), /fxaaCapIdle = 0;/);
  assert.match(post, /cap8Idle = shedIdle\(false, cap8Idle, \(\) => \{ dropRT\(cap8RT\); cap8RT = null; \}\)/);
  assert.match(post, /fxaaCapIdle = shedIdle\(false, fxaaCapIdle, \(\) => \{ dropRT\(fxaaCaptureRT\); fxaaCaptureRT = null; \}\)/);
});

test("R5: shed simulation — one capture then 10 presents holds nothing; a per-frame requester keeps cap8RT", () => {
  const SHED_FRAMES = Number(/const SHED_FRAMES = (\d+)/.exec(post)[1]);
  const shedIdle = new Function("SHED_FRAMES", "return " + /function shedIdle\([^)]*\) \{[\s\S]*?\n    \}/.exec(post)[0].replace(/^function shedIdle/, "function"))(SHED_FRAMES);
  const mk = () => ({ rt: null, idle: 0 });
  const capture = (c) => { c.idle = 0; if (!c.rt) c.rt = {}; };
  const present = (c) => { if (c.rt) c.idle = shedIdle(false, c.idle, () => { c.rt = null; }); };
  const once = mk(); capture(once);
  assert.ok(once.rt);
  for (let i = 0; i < 10; i++) present(once);
  assert.equal(once.rt, null, "one-off capture RT shed");
  const soft = mk();
  for (let i = 0; i < 30; i++) { capture(soft); present(soft); }
  assert.ok(soft.rt, "soft present keeps the RT");
});

test("R7: TAA history resize goes through ctx.rtSetSize so rtResizes counts it", () => {
  assert.match(post, /ownRT, rtSetSize, trackMaterial/);
  assert.match(aa, /ctx\.rtSetSize\(hist\[0\], w, h\); ctx\.rtSetSize\(hist\[1\], w, h\)/);
});
