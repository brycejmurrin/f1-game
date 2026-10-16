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

const gfxSeam = vm.runInNewContext(readFileSync(new URL("../../js/render/gfx.js", import.meta.url), "utf8") + ";Gfx");
function boot({ stored = "three", gfxCreate, loadBackend, xrDetect, noGLX = false, ownerProtocol = false, requestAdapter } = {}) {
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
    Gfx: { create: gfxCreate || (async () => null), ...(ownerProtocol ? { createInitOwner: gfxSeam.createInitOwner } : {}) },
    Log: { warn: (_ns, ...m) => warns.push(m.join(" ")), info() {} },
    // Manual clock: the 8 s caps are fired by the test.
    setTimeout: (fn, ms) => { timers.push({ fn, ms, live: true }); return timers.length; },
    clearTimeout: (id) => { if (timers[id - 1]) timers[id - 1].live = false; },
  });
  ctx.window = ctx;
  ctx.dispatchEvent = () => true;
  vm.runInContext(src.replace(/^const\b/gm, "var"), ctx);
  const rb = vm.runInContext("RendererBoot", ctx).create({
    $: () => null, els: {}, canvas: { getContext: () => ({}) }, ensureDataHub() {},
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

for (const claimed of [false, true]) test(`timed-out alternate relinquishes publication and prevents competing claim (alreadyClaimed=${claimed})`, async () => {
  let owner, finish;
  const h=boot({ownerProtocol:true,gfxCreate:async (_, opts)=>{
    owner=opts.initOwner;
    if(claimed) owner.canvas.getContext("webgpu");
    await new Promise(r=>{finish=r;});
    assert.equal(owner.canvas.getContext("webgpu"),null,"late continuation cannot claim canvas");
    return {backend:"three"};
  }});
  const pending=h.rb.start(); await settle(); h.fire(BOOT_STEP_MS); const result=await pending;
  assert.equal(owner.active,false);
  if(claimed) assert.equal(result,null,"claimed timeout refuses same-page binding"); else assert.equal(result.bound,false);
  assert.equal(h.calls.includes("GLX.init"),!claimed,"claimed canvas takes existing safe reload/refusal path");
  finish();await settle();assert.equal(result && result.bound,claimed ? null : false,"late backend never publishes");
});

test("known asynchronous GPU failure gets one compatibility card with explicit guarded recovery", async () => {
  const byId = new Map(), timers = [], prefs = new Map(), session = new Map(), sentinel = [], copied = [];
  let reloads = 0, focused = null, toggleLayer = null;
  const dialogs = [], layers = [];
  function append(child) {
    if (child.parentNode) child.parentNode.children = child.parentNode.children.filter((item) => item !== child);
    child.parentNode = this; this.children.push(child);
  }
  const doc = {
    body: { dataset: { race: "1" }, children: [], appendChild: append },
    querySelectorAll: () => dialogs.filter((dialog) => dialog.open),
    addEventListener(name, fn) { if (name === "toggle") toggleLayer = fn; },
    getElementById: (id) => byId.get(id) || null,
    createElement(tag) {
      const el = { tagName: tag.toUpperCase(), style: {}, dataset: {}, children: [], hidden: false,
        classList: { add() {}, remove() {} }, setAttribute(k, v) { this[k] = v; },
        appendChild: append, focus() { focused = this; },
        showPopover() { this.popped = true; layers.push(this); }, hidePopover() { this.popped = false; },
        matches(selector) { return selector === ":popover-open" && !!this.popped; } };
      Object.defineProperty(el, "id", { get() { return this._id; }, set(v) { this._id = v; byId.set(v, this); } });
      return el;
    },
  };
  const context = vm.createContext({
    console, Promise, Log: { info() {} },
    GameStore: { store: { raw: (k) => prefs.get(k) ?? null, rawSet: (k,v) => prefs.set(k,v), rawDel: (k) => prefs.delete(k) } },
    sessionStorage: { getItem: (k) => session.get(k) ?? null, removeItem: (k) => session.delete(k) },
    navigator: {}, PerfGov: { sentinelArm: (v) => sentinel.push(v) }, location: { reload() { reloads++; } },
    setTimeout(fn, delay) { timers.push({ fn, delay }); return timers.length; }, clearTimeout() {},
  });
  context.window = context;
  // The picker's production confirmation/reload policy is exercised, not a
  // hand-written imitation of the two-tap guard.
  vm.runInContext(readFileSync(new URL("../../js/perf/renderer-picker.js", import.meta.url), "utf8"), context);
  context.document = doc;
  const recovery = vm.runInContext(readFileSync(new URL("../../js/render/shared/compatibility-recovery.js", import.meta.url), "utf8") + ";GfxRecovery", context);
  let backend = { api: "webgpu" };
  const ui = recovery.create({ document: doc, backendState: () => backend, clipboard: async (text) => { copied.push(JSON.parse(text)); return true; } });
  const err = { message: "Instance dropped in popErrorScope", stack: "OperationError at vendor/three-0.186.1/three.webgpu.min.js:2:10" };
  assert.equal(ui.handle("rejection", new Error("fetch failed")), false);
  assert.equal(ui.handle("rejection", { message: err.message, stack: "app.js:1" }), false);
  assert.equal(ui.handle("rejection", err), true);
  const card = byId.get("gfx-recovery"), retry = card.children.find((e) => e.textContent === "USE WEBGL2 AND RELOAD");
  assert.equal(focused, retry);
  for (let i = 0; i < 8; i++) assert.equal(ui.handle("rejection", err), true);
  assert.equal(doc.body.children.length, 1, "errors do not multiply cards or steal focus");
  assert.equal(ui.state().occurrences, 9);
  const modal = doc.createElement("dialog"); modal.open = true; dialogs.push(modal); doc.body.appendChild(modal);
  toggleLayer({ target: modal, newState: "open" });
  assert.equal(card.parentNode, modal, "recovery is inside the modal, not inert behind it");
  assert.equal(layers[layers.length - 1], card, "recovery is promoted above a later modal");
  const otherPopover = doc.createElement("aside"); otherPopover.showPopover();
  toggleLayer({ target: otherPopover, newState: "open" });
  assert.equal(layers[layers.length - 1], card, "later popovers do not hide recovery");
  modal.open = false; toggleLayer({ target: modal, newState: "closed" });
  assert.equal(card.parentNode, doc.body, "closed dialog no longer owns the recovery card");
  assert.match(card.children[card.children.length - 1].children[1].style.cssText, /--fs-2/);
  card.children.find((e) => e.textContent === "DISMISS").onclick();
  ui.handle("rejection", err);
  assert.equal(card.hidden, true, "dismissed card stays dismissed despite repeated rejection");
  await card.children.find((e) => e.textContent === "COPY DIAGNOSTICS").onclick();
  assert.equal(copied[0].occurrences, 10);
  retry.onclick();
  assert.equal(prefs.has("apex26.gfxBackend"), false, "first in-race tap only arms");
  assert.equal(reloads, 0); assert.equal(retry.dataset.armed, "1");
  retry.onclick();
  assert.equal(prefs.get("apex26.gfxBackend"), "webgl2");
  assert.deepEqual(sentinel, [false]);
  assert.equal(retry.disabled, true);
  timers.find((t) => t.delay === 350).fn();
  assert.equal(reloads, 1);
  backend = { api: "webgl2" };
  assert.equal(ui.handle("rejection", err), false, "no universal GPU-failure classification");
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
