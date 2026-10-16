/* renderer-boot-timeout.test.mjs — a hung backend step must not leave a dead title.
 *
 * RendererBoot.start() awaits the XR probe, the backend script fetch and the
 * backend's create() (TLX: import("three/webgpu"), requestAdapter,
 * renderer.init → requestDevice) before any menu handler is wired; only
 * gpuAdapterAvailable had a cap. Each step now gives up after BOOT_STEP_MS, the backend is
 * treated as unavailable and GLX takes the canvas. Time is a manual clock here.
 * Run: node --test tests/unit/renderer-boot-timeout.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFileSync } from "node:fs";

const src = readFileSync(new URL("../../js/render/renderer-boot.js", import.meta.url), "utf8");
const BOOT_STEP_MS = Number(src.match(/let ms = (\d+);/)?.[1] || 15000);
const settle = () => new Promise((r) => setImmediate(r));

function boot({ stored = "three", gfxCreate, loadBackend, xrDetect, noGLX = false, requestAdapter } = {}) {
  const ls = new Map(stored ? [["apex26.gfxBackend", stored]] : []), ss = new Map();
  const timers = [], warns = [], calls = [];
  const ctx = vm.createContext({
    console, Promise,
    ApexRoster: { DEFERRED: { three: ["tlx.js"], webgpu: ["wgx.js"], webgl2: ["glx.js"] } },
    localStorage: { getItem: (k) => (ls.has(k) ? ls.get(k) : null), setItem: (k, v) => ls.set(k, String(v)), removeItem: (k) => ls.delete(k) },
    sessionStorage: { getItem: (k) => (ss.has(k) ? ss.get(k) : null), setItem: (k, v) => ss.set(k, String(v)), removeItem: (k) => ss.delete(k) },
    ApexXR: { bootPick: () => null, detect: xrDetect || (async () => {}) },
    navigator: { gpu: { requestAdapter: requestAdapter || (async () => ({})) } },
    location: { reload() { throw new Error("no reload expected"); } },
    document: { createElement: () => ({}), head: { appendChild() {} } },
    Event: class { constructor(type) { this.type = type; } },
    GLX: noGLX ? {} : { init: () => { calls.push("GLX.init"); return true; } },
    RendererPicker: { showUnavailable() { calls.push("unavailable"); } },
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
  return { rb, ls, ss, warns, calls, fire, timers };
}

test("a Gfx.create() that never settles resolves start() with GLX, canary left armed", async () => {
  const h = boot({ gfxCreate: () => new Promise(() => {}) });
  const started = h.rb.start();
  await settle();
  assert.equal(h.ls.get("apex26.gfxBackendProbe"), "three", "armed while create() is out");
  h.fire(BOOT_STEP_MS);
  const r = await started;
  assert.equal(r.bound, false);
  assert.deepEqual(h.calls, ["tlx.js", "GLX.init"], "GLX took the canvas");
  const capSec = BOOT_STEP_MS / 1000;
  assert.equal(h.warns.filter((m) => m.startsWith(`backend three init gave no answer in ${capSec} s`)).length, 1, "logged once (the fallback warning quotes it as its reason)");
  assert.equal(h.ls.get("apex26.gfxBackendProbe"), "three",
    "a hang is a strike candidate: the next boot's canary reverts it, so a hung device costs two boots, not every boot");
  assert.equal(h.ls.get("apex26.gfxBackend"), "three", "the pick itself is untouched");
});

test("a backend script fetch that never settles also falls through to GLX (network verdict: canary disarmed)", async () => {
  const h = boot({ loadBackend: (files) => (files.includes("tlx.js") ? new Promise(() => {}) : Promise.resolve()), gfxCreate: async () => { throw new Error("create must not run"); } });
  const started = h.rb.start();
  await settle();
  h.fire(BOOT_STEP_MS);
  const r = await started;
  assert.equal(r.bound, false);
  assert.ok(h.warns.some((m) => /backend script fetch gave no answer/.test(m)));
  assert.equal(h.ls.has("apex26.gfxBackendProbe"), false, "a slow network must not strike the device");
});

test("an XR capability probe that never settles does not hold the boot", async () => {
  const h = boot({ stored: null, xrDetect: () => new Promise(() => {}) });
  const started = h.rb.start();
  await settle();
  h.fire(BOOT_STEP_MS);
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


test("missing GLX fallback script is bounded and failed fetch resolves unavailable", async () => {
  for (const fail of [false, true]) {
    const h = boot({ stored: "webgl2", noGLX: true,
      loadBackend: () => fail ? Promise.reject(new Error("offline")) : new Promise(() => {}) });
    const started = h.rb.start();
    await settle();
    if (!fail) h.fire(BOOT_STEP_MS);
    assert.equal(await started, null);
    assert.equal(h.timers.filter((t) => t.live && t.ms >= 1000).length, 0);
  }
});

// #2285: a WGX/TLX pick that lands on GLX must say WHY, on the console and in
// sessionStorage apex26.gfxFallbackWhy (read by __apex.diag().env.backendFallback).
// Each of these paths used to bind GLX with no gfxWgxFail and no warning.
const WHY = "apex26.gfxFallbackWhy";
test("a null adapter on a WGX pick falls back loudly", async () => {
  const h = boot({ stored: "webgpu", requestAdapter: async () => null });
  const r = await h.rb.start();
  assert.equal(r.bound, false);
  assert.match(h.ss.get(WHY) || "", /requestAdapter\(\) returned null/);
  assert.equal(h.warns.filter((m) => m.includes("WebGL2 instead of webgpu")).length, 1, "one warning names the pick");
});

test("a SLOW adapter on a WGX pick still tries WGX, and a refusal names the slow probe", async () => {
  // Measured: SwiftShader's first requestAdapter() took up to 3 s at loadavg 4
  // against the probe's 4 s cap; a miss used to skip WGX outright with no reason.
  let created = 0;
  const h = boot({ stored: "webgpu", requestAdapter: () => new Promise(() => {}), gfxCreate: async () => { created++; return null; } });
  const started = h.rb.start();
  await settle();
  h.fire(4000);
  await started;
  assert.ok(h.calls.includes("wgx.js") && created === 1, "a slow adapter is not an absent one: WGX gets its own try");
  assert.match(h.ss.get(WHY) || "", /webgpu create\(\) refused.*requestAdapter\(\) gave no answer in 4 s/);
  const ok = boot({ stored: "webgpu", requestAdapter: () => new Promise(() => {}), gfxCreate: async () => ({ api: "webgpu" }) });
  const s2 = ok.rb.start(); await settle(); ok.fire(4000);
  assert.equal((await s2).bound, true, "and binds when WGX answers");
});

test("a create() that refuses without its own reason still records one", async () => {
  const h = boot({ stored: "webgpu", gfxCreate: async () => null });
  await h.rb.start();
  assert.match(h.ss.get(WHY) || "", /webgpu create\(\) refused/);
});

test("a hung create() and a hung fetch name their step", async () => {
  const h = boot({ stored: "webgpu", gfxCreate: () => new Promise(() => {}) });
  const started = h.rb.start(); await settle(); h.fire(BOOT_STEP_MS); await started;
  assert.match(h.ss.get(WHY) || "", /backend webgpu init gave no answer/);
  const f = boot({ stored: "webgpu", loadBackend: () => new Promise(() => {}) });
  const s2 = f.rb.start(); await settle(); f.fire(BOOT_STEP_MS); await s2;
  assert.match(f.ss.get(WHY) || "", /backend script fetch gave no answer/);
});

test("an explicit WEBGL2 pick records no fallback, and a later bind clears an old one", async () => {
  const h = boot({ stored: "webgl2" });
  await h.rb.start();
  assert.equal(h.ss.get(WHY), undefined);
  const b = boot({ stored: "three", gfxCreate: async () => ({ api: "three" }) });
  b.ss.set(WHY, "stale");
  await b.rb.start();
  assert.equal(b.ss.get(WHY), undefined, "a bound pick clears the previous boot's reason");
});
