// Boot / race-entry idle prefetch: LazyBundles.raceAssets, TrackBuildClient spawn gating,
// renderer-boot adapter probe cap, Assets strip-decode yields.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import path from "path";
import vm from "vm";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const read = (rel) => readFileSync(path.join(root, rel), "utf8");

test("raceAssets schedules scenery on microtask and LAZY_RACE on idle", () => {
  const src = read("js/core/lazy-bundles.js");
  assert.match(src, /function scheduleIdle\(fn, timeoutMs\)/, "idle helper");
  assert.match(src, /requestIdleCallback\(fn, \{ timeout: ms \}\)/, "rIC with timeout");
  assert.match(src, /else setTimeout\(fn, Math\.min\(ms, 800\)\)/, "Safari timer fallback");
  assert.match(src, /function raceAssets\(\)/, "sync scheduler (not async await on critical path)");
  assert.match(src, /queueMicrotask\(kickScenery\)/, "scenery on microtask (game-vm rIC is a no-op)");
  assert.match(src, /scheduleIdle\(\(\) => \{ ensureLightPresets\(\); \}, 2500\)/, "lights on idle");
  assert.match(src, /function ensureLightPresets\(\) \{\s*if \(window\.LightPresets\) return/, "idle lights fetch is a no-op once the presets are resident");
  assert.doesNotMatch(src, /ensureCircuit\(deps\.getContext\(\)\.trackIdx\);\s*ensureScenery/,
    "no redundant ensureCircuit kick beside ensureScenery");
  // 3-F4 / R3-ASYNC-2: raceAssets may call idleWarm, but only with wantAgentSurface()
  // — a player's title never pays the TRACK_VM heap; build() still spawns on first use.
  assert.match(src.replace(/\/\/.*$/gm, ""), /TrackBuildClient\.idleWarm\(wantAgentSurface\(\)\)/,
    "agent-gated idleWarm from raceAssets");
});

test("raceAssets microtask kicks scenery; idle injects lights", async () => {
  const loader = read("js/core/script-loader.js");
  const bundles = read("js/core/lazy-bundles.js");
  const idles = [];
  let lightLoads = 0;
  const ctx = vm.createContext({
    ApexRoster: {
      DEFERRED: {}, DEFERRED_EDGES: [], LAZY_AGENT: [], LAZY_EDGES: [],
      LAZY_RACE: ["js/lighting/presets.js"], LAZY_AUDIO: [], LAZY_AUDIO_EDGES: [],
      LAZY_RACE_SESSION: [], LAZY_RACE_SESSION_EDGES: [],
      LAZY_TRACK_BUILD: [], LAZY_TRACK_BUILD_EDGES: [],
      // Avoid CIRCUITS_DIR + runInContext in this file (load-order scenery roster guard).
      SCENERY_DIR: "js/circuits/scenery", LAZY_SCENERY: [],
      LAZY_DATA: [], LAZY_DATA_EDGES: [], LAZY_NET: [], LAZY_NET_EDGES: [],
    },
    window: { __APEX_BUILD: "test", LightPresets: null },
    PitLane: { _stub: true },
    Tracks: {
      LIST: [{ id: "monza", custom: true, scenery: () => {} }],
      circuitPayloadResident: () => true,
      hydrate: () => true,
    },
    TrackScenery: { monza: () => {} },
    TrackBuildProps: { build() {} }, TrackModels: {}, TrackHiddenFaces: {},
    Assets: { modelsReady: () => Promise.resolve(0) },
    Log: { warn() {}, info() {} },
    els: { datahub: {} },
    queueMicrotask: (fn) => queueMicrotask(fn),
    requestIdleCallback(fn, opts) { idles.push({ fn, opts }); return idles.length; },
    setTimeout() { throw new Error("setTimeout fallback must not run when rIC exists"); },
    document: {
      createElement() { return { dataset: {}, remove() {} }; },
      head: { appendChild(node) {
        lightLoads++;
        queueMicrotask(() => {
          ctx.window.LightPresets = {};
          node.onload();
        });
      } },
    },
  });
  vm.runInContext(loader + "\n" + bundles + `
    const lb = LazyBundles.create({
      els, loadBackendScripts: ScriptLoader.create().load,
      getContext: () => ({ trackIdx: 0 }),
      applyLightTuneIfReady() {},
      bindAgent() {}, createNetwork() { return { wire() {} }; },
      onAudioReady() {},
    });
    globalThis.__raceAssets = lb.raceAssets;
  `, ctx);
  ctx.__raceAssets();
  assert.equal(idles.length, 3, "lights + race-session + audio-prefetch on idle");
  const lightIdle = idles.find((i) => i.opts && i.opts.timeout === 2500);
  assert.ok(lightIdle, "lights idle at 2500ms");
  assert.ok(idles.some((i) => i.opts && i.opts.timeout === 2800), "race-session idle at 2800ms");
  assert.ok(idles.some((i) => i.opts && i.opts.timeout === 4500), "audio HTTP prefetch idle at 4500ms");
  await new Promise((r) => queueMicrotask(r));
  assert.equal(lightLoads, 0, "lights not yet");
  await lightIdle.fn();
  await new Promise((r) => setTimeout(r, 0));
  assert.equal(lightLoads, 1, "LAZY_RACE injected on idle");
  assert.ok(ctx.window.LightPresets, "presets global set after inject");
});

// 3-F4: the default-ON build worker (multi-core, no stored key) imports all of
// TRACK_VM — every LAZY_CIRCUIT payload, ~1.36 MB, a ~20 MB heap — and only an
// in-session track switch (game.js loadTrackStepped, state race/count) posts to
// it. The title's idle prefetch must not spawn it.
test("the title's idle prefetch spawns no build worker on a multi-core device (3-F4)", async () => {
  const idles = [];
  let workers = 0;
  const ctx = vm.createContext({
    ApexRoster: {
      DEFERRED: {}, DEFERRED_EDGES: [], LAZY_AGENT: [], LAZY_EDGES: [],
      LAZY_RACE: [], LAZY_AUDIO: [], LAZY_AUDIO_EDGES: [],
      LAZY_RACE_SESSION: [], LAZY_RACE_SESSION_EDGES: [],
      LAZY_TRACK_BUILD: [], LAZY_TRACK_BUILD_EDGES: [],
      SCENERY_DIR: "js/circuits/scenery", LAZY_SCENERY: [],
      LAZY_DATA: [], LAZY_DATA_EDGES: [], LAZY_NET: [], LAZY_NET_EDGES: [],
      TRACK_VM: ["js/track/tracks.js"], TRACK_WORKER_EXTRA: [],
    },
    window: { __APEX_BUILD: "test", LightPresets: {} },
    navigator: { hardwareConcurrency: 4 },
    localStorage: { getItem: () => null, setItem() {} },   // no stored key: the worker's default is ON
    location: { href: "http://x/" }, URL,
    Worker: class { constructor() { workers++; } postMessage() {} terminate() {} },
    PitLane: { _stub: true },
    Tracks: { LIST: [{ id: "monza", custom: true, scenery: () => {} }], circuitPayloadResident: () => true, hydrate: () => true },
    TrackScenery: { monza: () => {} },
    TrackBuildProps: { build() {} }, TrackModels: {}, TrackHiddenFaces: {},
    Assets: { modelsReady: () => Promise.resolve(0) },
    Log: { warn() {}, info() {} },
    els: { datahub: {} },
    queueMicrotask: (fn) => queueMicrotask(fn),
    requestIdleCallback(fn, opts) { idles.push({ fn, opts }); return idles.length; },
    setTimeout(fn) { fn(); return 1; }, clearTimeout() {},
    document: {
      readyState: "complete", getElementById: () => null, addEventListener() {}, querySelectorAll: () => [],
      createElement() { return { dataset: {}, remove() {} }; },
      head: { appendChild(node) { queueMicrotask(() => node.onload && node.onload()); } },
    },
  });
  vm.runInContext(read("js/track/build-client.js").replace(/^const\b/gm, "var"), ctx);
  assert.equal(ctx.TrackBuildClient.enabled(), true, "the worker is default ON here, as on every multi-core phone");
  vm.runInContext(read("js/core/script-loader.js") + "\n" + read("js/core/lazy-bundles.js") + `
    const lb = LazyBundles.create({
      els, loadBackendScripts: ScriptLoader.create().load,
      getContext: () => ({ trackIdx: 0 }),
      applyLightTuneIfReady() {},
      bindAgent() {}, createNetwork() { return { wire() {} }; },
      onAudioReady() {},
    });
    lb.raceAssets();
  `, ctx);
  for (let i = 0; i < 4; i++) {
    await new Promise((r) => setImmediate(r));
    for (const idle of idles.splice(0)) { try { await idle.fn(); } catch (_) { /* a stubbed bundle may refuse; only the worker count matters */ } }
  }
  assert.equal(workers, 0, "no Worker is constructed at the title");
});

// 3-F4 / R3-ASYNC-2: idleWarm remains for the agent surface only; spawn() still
// refuses while the worker is off.
test("TrackBuildClient.idleWarm is agent-gated; spawn() no-ops when build worker is off", () => {
  const src = read("js/track/build-client.js");
  assert.match(src, /function idleWarm\(agentSurface\)/);   // R3-ASYNC-2: spawns only for the agent surface
  assert.match(src, /if \(!enabled\(\)\) return null/);
  assert.match(src, /requestIdleCallback\(kick, \{ timeout: 3000 \}\)/);
  const main = vm.createContext({
    localStorage: { getItem: () => "0", setItem() {} },
    document: { readyState: "complete", getElementById: () => null, addEventListener() {} },
    location: { href: "http://x/" },
    Worker: class { constructor() { throw new Error("must not spawn when off"); } },
    Log: { warn() {}, info() {} },
    performance: { now: () => 0 },
    requestIdleCallback(fn) { fn(); return 1; },
    setTimeout() {},
    URL,
  });
  vm.runInContext(read("js/track/build-client.js").replace(/^const\b/gm, "var"), main);
  assert.equal(typeof main.TrackBuildClient.idleWarm, "function");
  assert.equal(main.TrackBuildClient.idleWarm(true), null, "off: idleWarm reports nothing and does not spawn");
  assert.equal(main.TrackBuildClient.spawn(), null);
});

// Run the real gpuAdapterAvailable() (sliced out of renderer-boot.js by brace depth, then
// evaluated) against a fake navigator.gpu and fake timers, so the adapter race runs.
function adapterProbe({ requestAdapter, withTimers = true }) {
  const boot = read("js/render/renderer-boot.js");
  const at = boot.indexOf("let _adapterWhy");
  const fnAt = boot.indexOf("async function gpuAdapterAvailable()");
  assert.ok(at >= 0 && fnAt > at, "adapter probe not found in renderer-boot.js");
  let depth = 0, i = boot.indexOf("{", fnAt);
  for (; i < boot.length; i++) {
    if (boot[i] === "{") depth++;
    else if (boot[i] === "}" && --depth === 0) break;
  }
  const timers = [], cleared = [];
  const sandbox = { navigator: { gpu: { requestAdapter } }, Promise };
  if (withTimers) {
    sandbox.setTimeout = (fn, ms) => { timers.push({ fn, ms }); return timers.length; };
    sandbox.clearTimeout = (id) => { cleared.push(id); };
  }
  const ctx = vm.createContext(sandbox);
  vm.runInContext(boot.slice(at, i + 1) + "\nthis.probe = async () => ({ ok: await gpuAdapterAvailable(), slow: _adapterSlow, why: _adapterWhy });", ctx,
    { filename: "js/render/renderer-boot.js" });
  return { probe: ctx.probe, timers, cleared };
}

test("renderer-boot: a never-resolving requestAdapter hits the 4 s cap and reads as SLOW, not absent", async () => {
  const h = adapterProbe({ requestAdapter: () => new Promise(() => {}) });
  const p = h.probe();
  await new Promise((r) => setImmediate(r));
  assert.equal(h.timers.length, 1, "the hang timer was armed");
  assert.equal(h.timers[0].ms, 4000, "seconds-scale hang cap");
  h.timers[0].fn();
  const r = await p;
  assert.equal(r.ok, false);
  assert.equal(r.slow, true, "a slow adapter is not an absent one (#2285)");
  assert.deepEqual(h.cleared, [1], "the hang timer is cleared on the way out");
});

test("renderer-boot: an adapter that settles first wins, clears the timer, and null reads as absent", async () => {
  const good = adapterProbe({ requestAdapter: async () => ({}) });
  const g = await good.probe();
  assert.deepEqual({ ok: g.ok, slow: g.slow }, { ok: true, slow: false });
  assert.deepEqual(good.cleared, [1]);
  const none = adapterProbe({ requestAdapter: async () => null });
  const n = await none.probe();
  assert.deepEqual({ ok: n.ok, slow: n.slow }, { ok: false, slow: false });
  assert.match(n.why, /returned null/);
  const noTimers = adapterProbe({ requestAdapter: async () => ({}), withTimers: false });
  assert.equal((await noTimers.probe()).ok, true, "a VM harness without timers still awaits the adapter");
});

test("renderer-boot idle-preloads the three vendor island on an idle slice", () => {
  const boot = read("js/render/renderer-boot.js");
  assert.match(boot, /requestIdleCallback\(kick, \{ timeout: 800 \}\)/,
    "three modulepreload waits for an idle slice");
  assert.match(boot, /rel = "modulepreload"/);
});

test("Assets strip decode gives a future task a turn between successive layers", async () => {
  for (const schedulerAvailable of [true, false]) {
    const turns = [], decoded = [], closed = [];
    let uploads = 0, microtasks = 0, installed = 0;
    const defer = (kind) => new Promise((resolve) => turns.push({ kind, run: resolve }));
    const ctx = vm.createContext({
      Log: { info() {}, enabled: () => false },
      queueMicrotask(fn) { microtasks++; queueMicrotask(fn); },
      setTimeout(fn, delay) { assert.equal(delay, 0); turns.push({ kind: "timer", run: fn }); return turns.length; },
      ...(schedulerAvailable ? { scheduler: { yield: () => defer("scheduler") } } : {}),
      fetch: async (url) => url.endsWith("manifest.json")
        ? { ok: true, json: async () => ({ materials: { size: 1, albedo: "albedo.png",
          layers: [{ mat: 1, scale: 1 }, { mat: 2, scale: 1 }, { mat: 3, scale: 1 }] } }) }
        : { ok: true, blob: async () => ({ size: 3 }) },
      createImageBitmap: async (_, x, y) => { decoded.push(y); return { close() { closed.push(y); } }; },
    });
    const assets = vm.runInContext(read("js/render/shared/assets.js") + ";Assets", ctx);
    assets.init({ createTextureArray() { uploads++; return {}; }, setMaterialMaps() { installed++; } });
    const pending = assets.load();
    const settle = () => new Promise(setImmediate);
    await settle();
    assert.deepEqual(decoded, [1], "only the first layer may decode before another task runs");
    assert.equal(uploads, 0);
    for (const layer of [2, 3]) {
      assert.equal(turns.length, 1, "one continuation awaits a real task boundary");
      const turn = turns.shift();
      assert.equal(turn.kind, schedulerAvailable ? "scheduler" : "timer", "prefer scheduler; timer fallback must beat a microtask");
      turn.run(); await settle();
      assert.deepEqual(decoded, Array.from({ length: layer }, (_, i) => i + 1));
      if (layer === 2) assert.equal(uploads, 0, "do not upload a partially decoded strip");
    }
    assert.equal(await pending, true);
    assert.equal(microtasks, 0, "microtask-only continuation would drain all layers before the next task");
    assert.equal(uploads, 1); assert.equal(installed, 1);
    assert.deepEqual(closed, [1, 2, 3], "decoded owners close exactly once after the completed upload");
    assert.equal(turns.length, 0);
  }
});
