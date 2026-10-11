/* renderer-boot-timeout.test.mjs — a hung backend step must not leave a dead title.
 *
 * RendererBoot.start() awaits the XR probe, the backend script fetch and the
 * backend's create() (TLX: import("three/webgpu"), requestAdapter,
 * renderer.init → requestDevice) before any menu handler is wired; only
 * gpuAdapterAvailable had a cap. Each step now gives up after 8 s, the backend is
 * treated as unavailable and GLX takes the canvas. Time is a manual clock here.
 * Run: node --test tests/unit/renderer-boot-timeout.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFileSync } from "node:fs";

const src = readFileSync(new URL("../../js/render/renderer-boot.js", import.meta.url), "utf8");
const settle = () => new Promise((r) => setImmediate(r));

function boot({ stored = "three", gfxCreate, loadBackend, xrDetect } = {}) {
  const ls = new Map(stored ? [["apex26.gfxBackend", stored]] : []), ss = new Map();
  const timers = [], warns = [], calls = [];
  const ctx = vm.createContext({
    console, Promise,
    ApexRoster: { DEFERRED: { three: ["tlx.js"], webgpu: ["wgx.js"], webgl2: ["glx.js"] } },
    localStorage: { getItem: (k) => (ls.has(k) ? ls.get(k) : null), setItem: (k, v) => ls.set(k, String(v)), removeItem: (k) => ls.delete(k) },
    sessionStorage: { getItem: (k) => (ss.has(k) ? ss.get(k) : null), setItem: (k, v) => ss.set(k, String(v)), removeItem: (k) => ss.delete(k) },
    ApexXR: { bootPick: () => null, detect: xrDetect || (async () => {}) },
    navigator: { gpu: { requestAdapter: async () => ({}) } },
    location: { reload() { throw new Error("no reload expected"); } },
    document: { createElement: () => ({}), head: { appendChild() {} } },
    Event: class { constructor(type) { this.type = type; } },
    GLX: { init: () => { calls.push("GLX.init"); return true; } },
    Gfx: { create: gfxCreate || (async () => null) },
    Log: { warn: (_ns, ...m) => warns.push(m.join(" ")), info() {} },
    // Manual clock: the 8 s caps are fired by the test.
    setTimeout: (fn, ms) => { timers.push({ fn, ms, live: true }); return timers.length; },
    clearTimeout: (id) => { if (timers[id - 1]) timers[id - 1].live = false; },
  });
  ctx.window = ctx;
  ctx.dispatchEvent = () => true;
  vm.runInContext(src.replace(/^const\b/gm, "var"), ctx);
  const rb = vm.runInContext("RendererBoot", ctx).create({
    $: () => null, els: {}, canvas: {}, ensureDataHub() {},
    loadBackendScripts: loadBackend || (async (files) => { calls.push(...files); }),
  });
  const fire = (ms) => { for (const t of timers) if (t.live && t.ms === ms) { t.live = false; t.fn(); } };
  return { rb, ls, warns, calls, fire, timers };
}

test("a Gfx.create() that never settles resolves start() with GLX, canary left armed", async () => {
  const h = boot({ gfxCreate: () => new Promise(() => {}) });
  const started = h.rb.start();
  await settle();
  assert.equal(h.ls.get("apex26.gfxBackendProbe"), "three", "armed while create() is out");
  h.fire(8000);
  const r = await started;
  assert.equal(r.bound, false);
  assert.deepEqual(h.calls, ["tlx.js", "GLX.init"], "GLX took the canvas");
  assert.equal(h.warns.filter((m) => /backend three init gave no answer in 8 s/.test(m)).length, 1, "logged once");
  assert.equal(h.ls.get("apex26.gfxBackendProbe"), "three",
    "a hang is a strike candidate: the next boot's canary reverts it, so a hung device costs two boots, not every boot");
  assert.equal(h.ls.get("apex26.gfxBackend"), "three", "the pick itself is untouched");
});

test("a backend script fetch that never settles also falls through to GLX (network verdict: canary disarmed)", async () => {
  const h = boot({ loadBackend: (files) => (files.includes("tlx.js") ? new Promise(() => {}) : Promise.resolve()), gfxCreate: async () => { throw new Error("create must not run"); } });
  const started = h.rb.start();
  await settle();
  h.fire(8000);
  const r = await started;
  assert.equal(r.bound, false);
  assert.ok(h.warns.some((m) => /backend script fetch gave no answer/.test(m)));
  assert.equal(h.ls.has("apex26.gfxBackendProbe"), false, "a slow network must not strike the device");
});

test("an XR capability probe that never settles does not hold the boot", async () => {
  const h = boot({ stored: null, xrDetect: () => new Promise(() => {}) });
  const started = h.rb.start();
  await settle();
  h.fire(8000);
  const r = await started;
  assert.equal(r.gfx !== null && r.bound !== undefined, true, "start() resolved");
  assert.ok(h.warns.some((m) => /XR capability probe gave no answer/.test(m)));
});

test("steps that settle in time are untouched and leave no live timer", async () => {
  const h = boot({ gfxCreate: async () => ({ api: "three" }), loadBackend: async (files) => { h.calls.push(...files); } });
  const r = await h.rb.start();
  assert.equal(r.bound, true);
  assert.equal(r.gfx.api, "three");
  assert.deepEqual(h.warns, []);
  // A leaked 8 s timer would fire later and strike a healthy backend (or keep the page alive).
  // (The ms=0 timer is the deliberate one-shot kick (setTimeout(kick, 0)) in renderer-boot.js, not a cap.)
  const caps = h.timers.filter((t) => t.ms >= 1000);
  assert.ok(caps.length > 0, "premise: the caps were armed");
  assert.deepEqual(caps.filter((t) => t.live).map((t) => t.ms), [], "every cap was cleared on success");
});
