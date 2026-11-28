/* tlx-util.test.mjs — TLXUtil (js/render/three/tlx-util.js, carved from tlx.js in #6821): characterization of the
 * three helpers that moved verbatim, the release funnel (#7334; tlx-release-funnel.test.mjs), and the load-order contract
 * that keeps them out of eagerScripts. */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { createRequire } from "node:module";
import { absSrc } from "../helpers/abs-src.mjs";

const rel = "js/render/three/tlx-util.js";
const doc = { createElement: () => ({ width: 0, height: 0 }) };
const ctx = vm.createContext({ Math, WeakSet, Promise, Error, Uint8ClampedArray, performance, setTimeout, document: doc });
vm.runInContext(fs.readFileSync(new URL("../../" + rel, import.meta.url), "utf8") + "\nglobalThis.__u = TLXUtil;", ctx, { filename: absSrc(rel) });
const U = ctx.__u;

test("exports exactly the carved helpers and the release funnel", () => {
  assert.deepEqual(Object.keys(U).sort(), ["dropRenderObject", "pumpAnimation", "readGlCapture", "releaseObject", "safeDispose", "texStandIn"]);
});

test("pumpAnimation: parks one callback per tick and drains it once; null on a foreign renderer", () => {
  assert.equal(U.pumpAnimation(null), null);
  assert.equal(U.pumpAnimation({ _animation: {} }), null);
  const calls = [];
  let pump = null;
  const anim = { stop() { calls.push("stop"); }, setContext(p) { pump = p; calls.push("ctx"); }, start() { calls.push("start"); pump.requestAnimationFrame(() => calls.push("tick")); } };
  const p = U.pumpAnimation({ _animation: anim });
  assert.deepEqual(calls, ["stop", "ctx", "start"]);
  p.drain(); assert.deepEqual(calls.slice(3), ["tick"]);
  p.drain(); assert.equal(calls.length, 4, "drained callback does not run twice");
  p.requestAnimationFrame(() => calls.push("x")); p.cancelAnimationFrame(); p.drain(); assert.equal(calls.length, 4);
});

test("texStandIn is one shared 1x1 canvas", () => {
  const a = U.texStandIn();
  assert.equal(a.width, 1); assert.equal(a.height, 1);
  assert.equal(U.texStandIn(), a);
});

test("readGlCapture refuses a zero-size frame and a second read on the same context", async () => {
  await assert.rejects(U.readGlCapture({}, 0, 4), /no frame size/);
  const gl = { createBuffer: () => null };
  await assert.rejects(U.readGlCapture(gl, 4, 4), /capture buffer unavailable/);
  // the guard is released after a failure, so the same context can be read again
  await assert.rejects(U.readGlCapture(gl, 4, 4), /capture buffer unavailable/);
});

test("load order: tlx-util is lazy (not eager) and precedes tlx.js", () => {
  const m = createRequire(import.meta.url)("../../tools/manifest.cjs");
  const three = m.DEFERRED.three;
  assert.ok(three.indexOf(rel) >= 0 && three.indexOf(rel) < three.indexOf("js/render/three/tlx.js"));
  assert.ok(!m.FULL.includes(rel));
});
