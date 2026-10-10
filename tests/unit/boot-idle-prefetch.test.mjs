// Boot / race-entry idle prefetch: LazyBundles.raceAssets, TrackBuildClient.idleWarm,
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
  // 3-F4 (round-3 hunt): the title no longer warms the build worker; only an
  // in-session track switch posts to it, and build() spawns it on first use.
  assert.doesNotMatch(src.replace(/\/\/.*$/gm, ""), /TrackBuildClient\.idleWarm/, "no build worker warm from raceAssets");
});

test("raceAssets microtask kicks scenery/worker; idle injects lights", async () => {
  const loader = read("js/core/script-loader.js");
  const bundles = read("js/core/lazy-bundles.js");
  const idles = [];
  let warmCalls = 0, lightLoads = 0;
  const ctx = vm.createContext({
    ApexRoster: {
      DEFERRED: {}, DEFERRED_EDGES: [], LAZY_AGENT: [], LAZY_EDGES: [],
      LAZY_RACE: ["js/lighting/presets.js"], LAZY_AUDIO: [], LAZY_AUDIO_EDGES: [],
      LAZY_RACE_SESSION: [], LAZY_RACE_SESSION_EDGES: [],
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
    TrackBuildClient: { idleWarm() { warmCalls++; } },
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
  assert.equal(warmCalls, 0, "microtask not yet drained");
  assert.equal(idles.length, 3, "lights + race-session + audio-prefetch on idle");
  const lightIdle = idles.find((i) => i.opts && i.opts.timeout === 2500);
  assert.ok(lightIdle, "lights idle at 2500ms");
  assert.ok(idles.some((i) => i.opts && i.opts.timeout === 2800), "race-session idle at 2800ms");
  assert.ok(idles.some((i) => i.opts && i.opts.timeout === 4500), "audio HTTP prefetch idle at 4500ms");
  await new Promise((r) => queueMicrotask(r));
  assert.equal(warmCalls, 0, "no idleWarm from the scenery microtask (3-F4)");
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

test("TrackBuildClient.idleWarm no-ops when build worker is off", () => {
  const src = read("js/track/build-client.js");
  assert.match(src, /function idleWarm\(\)/);
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
  assert.equal(main.TrackBuildClient.idleWarm(), null);
});

test("renderer-boot caps requestAdapter and idle-preloads three vendor", () => {
  const boot = read("js/render/renderer-boot.js");
  assert.match(boot, /Promise\.race\(\[\s*adapterP,/, "adapter probe is raced");
  // Hang cap must be seconds-scale: a 250 ms race loses to real CI adapters and
  // leaves unset backend undefined instead of "three" (render-boot / tlx-probes).
  assert.match(boot, /setTimeout\(\(\) => resolve\(null\), 4000\)/, "4 s adapter hang cap");
  assert.match(boot, /clearTimeout\(timer\)/, "clear hang timer when adapter settles first");
  assert.match(boot, /typeof setTimeout !== "function"/, "VM harness without timers still awaits adapter");
  assert.match(boot, /requestIdleCallback\(kick, \{ timeout: 800 \}\)/,
    "three modulepreload waits for an idle slice");
  assert.match(boot, /rel = "modulepreload"/);
});

test("Assets strip decode yields between layers", () => {
  const src = read("js/render/shared/assets.js");
  assert.match(src, /function _yieldDecode\(\)/);
  assert.match(src, /scheduler\.yield/);
  assert.match(src, /queueMicrotask/);
  assert.match(src, /if \(n\+\+\) await _yieldDecode\(\)/);
});
