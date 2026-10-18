// tlx-anim-pump — three's per-frame tick runs once per DRAWN frame on WebGL2, and WebGPU is untouched.
//
// three r186 Renderer.init() starts its own window rAF loop (Animation: info.reset, nodeFrame.update ->
// frameId, inspector) beside the game loop: 2.04 rAF callbacks per drawn frame on TLX vs 1.04 on GLX
// (gpu-census 39071040057). On the WebGL2 backend (the phone's path) tlx.js swaps that loop's context
// for a pump that begin() drains; paired census 3+3 runs: 1.04-1.08 callbacks per frame, no slower.
// The WebGPU backend keeps three's own loop byte for byte (its raw p50 was not cleared by the census).
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const SRC = fs.readFileSync(path.join(ROOT, "js/render/three/tlx.js"), "utf8");

// The helper exactly as shipped, evaluated on its own.
function loadPump() {
  const m = /\n  function pumpAnimation\(r\) \{[\s\S]*?\n    return pump;\n  \}\n/.exec(SRC);
  assert.ok(m, "pumpAnimation is defined in tlx.js");
  return vm.runInNewContext(m[0] + "; pumpAnimation;");
}

// A stand-in for three r186's Animation (class `eb` in three.webgpu.min.js): start() ticks once now and
// re-requests through its context; stop() cancels through it.
function fakeAnimation(winRaf) {
  const a = { ticks: 0, _context: { requestAnimationFrame: winRaf, cancelAnimationFrame() {} }, _id: null };
  a.start = () => { const e = () => { a._id = a._context.requestAnimationFrame(e); a.ticks++; }; e(); };
  a.stop = () => { if (a._context) a._context.cancelAnimationFrame(a._id); a._id = null; };
  a.setContext = (c) => { a._context = c; };
  a.getContext = () => a._context;
  return a;
}

test("the pump parks three's tick and runs it once per drain, never through the window", () => {
  const pumpAnimation = loadPump();
  let windowCalls = 0;
  const anim = fakeAnimation(() => { windowCalls++; return 7; });
  anim.start();                                      // three's init()
  assert.equal(windowCalls, 1, "three's loop asked the window for a frame");
  const pump = pumpAnimation({ _animation: anim });
  assert.ok(pump && typeof pump.cb === "function", "the next tick is parked in the pump");
  assert.equal(windowCalls, 1, "after the swap the window is never asked again");
  const before = anim.ticks;
  for (let i = 0; i < 3; i++) pump.drain();         // what begin() does, 3 frames
  assert.equal(anim.ticks - before, 3, "one tick per drained frame");
  assert.equal(windowCalls, 1);
  anim.stop();                                       // three's stop() cancels through the pump
  assert.equal(pump.cb, null, "stop() clears the parked tick");
  pump.drain();
  assert.equal(anim.ticks - before, 3, "a drain after stop() runs nothing");
});

test("XRManager's save/restore of the context keeps the pump", () => {
  const pumpAnimation = loadPump();
  const anim = fakeAnimation(() => 1);
  anim.start();
  const pump = pumpAnimation({ _animation: anim });
  const saved = anim.getContext();                   // sessionstart
  anim.stop(); anim.setContext({ requestAnimationFrame: () => 2, cancelAnimationFrame() {} }); anim.start();
  anim.stop(); anim.setContext(saved); anim.start(); // sessionend
  assert.equal(anim.getContext(), pump);
  assert.equal(typeof pump.cb, "function", "the pump drives three again after the session");
});

test("a renderer without three's Animation is left alone", () => {
  const pumpAnimation = loadPump();
  assert.equal(pumpAnimation({}), null);
  assert.equal(pumpAnimation(null), null);
});

test("only the WebGL2 backend installs the pump; begin() drains it when present", () => {
  const install = SRC.match(/renderer\.__apexPump = pumpAnimation\(renderer\)/g) || [];
  assert.equal(install.length, 1, "one install site");
  assert.match(SRC, /if \(renderer\.backend && renderer\.backend\.isWebGLBackend\) renderer\.__apexPump = pumpAnimation\(renderer\);/,
    "WebGPU keeps three's own loop: the install is gated on isWebGLBackend");
  assert.match(SRC, /begin\(frame\) \{[\s\S]{0,400}?if \(renderer\.__apexPump\) renderer\.__apexPump\.drain\(\);/,
    "begin() drains the parked tick before the frame is drawn");
  const iife = SRC.indexOf("const TLX = (function () {"), fn = SRC.indexOf("function pumpAnimation(");
  assert.ok(iife >= 0 && fn > iife, "pumpAnimation lives inside the TLX IIFE, not on the global scope");
});
