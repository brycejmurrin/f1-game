// LazyBundles.raceAssets at the title, through the REAL script-loader.js,
// lazy-bundles.js and build-client.js: what a PLAYER's boot spawns and fetches.
//   R3-ASYNC-2 — no track-build Worker at title idle (no player flow posts it a
//                build from the menu); the agent surface still warms it.
//   R3-PHONE-8 — the idle audio prefetch asks for the deploy's content-hash
//                key (the URL inject() will request), else `?v=<build>`.
// Run: node --test tests/unit/lazy-bundles-prefetch.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");

function boot({ agent = false, lazyV = null } = {}) {
  const idles = [], workers = [], links = [];
  const ctx = vm.createContext({
    ApexRoster: {
      DEFERRED: {}, DEFERRED_EDGES: [], LAZY_AGENT: [], LAZY_EDGES: [],
      LAZY_RACE: ["js/lighting/presets.js"], LAZY_AUDIO: ["js/audio/engine.js"], LAZY_AUDIO_EDGES: [],
      LAZY_RACE_SESSION: [], LAZY_RACE_SESSION_EDGES: [],
      SCENERY_DIR: "js/circuits/scenery", LAZY_SCENERY: [],
      LAZY_DATA: [], LAZY_DATA_EDGES: [], LAZY_NET: [], LAZY_NET_EDGES: [],
      TRACK_VM: ["js/track/core/geom.js"], TRACK_WORKER_EXTRA: [],
    },
    window: { __APEX_BUILD: 4100, LightPresets: {}, __TEST_MODE: agent },
    PitLane: { _stub: true },
    Tracks: { LIST: [{ id: "monza", custom: true, scenery: () => {} }], circuitPayloadResident: () => true },
    Assets: { modelsReady: () => Promise.resolve(0) },
    Log: { warn() {}, info() {}, debug() {} },
    els: { datahub: {} }, URL, Promise, Map, Set,
    queueMicrotask: (fn) => queueMicrotask(fn),
    requestIdleCallback(fn, opts) { idles.push({ fn, opts }); return idles.length; },
    setTimeout, clearTimeout,
    localStorage: { getItem: () => null, setItem() {} },
    location: { href: "https://apex.example/index.html", hostname: "apex.example", search: "" },
    navigator: { hardwareConcurrency: 8, userAgent: "phone" },
    Worker: class { constructor(u) { workers.push(u); } postMessage() {} terminate() {} },
    document: {
      readyState: "complete", querySelectorAll: () => [], querySelector: () => null,
      getElementById: (id) => (id === "apex-lazy-v" && lazyV ? { textContent: JSON.stringify(lazyV) } : null),
      createElement: () => ({ dataset: {}, remove() {} }),
      head: { appendChild(el) { links.push(el); } },
    },
  });
  vm.runInContext(read("js/core/script-loader.js") + "\n" + read("js/track/build-client.js") + "\n" + read("js/core/lazy-bundles.js") + `
    globalThis.__lb = LazyBundles.create({
      els, loadBackendScripts: ScriptLoader.create().load,
      getContext: () => ({ trackIdx: 0 }), applyLightTuneIfReady() {},
      bindAgent() {}, createNetwork() { return { wire() {} }; }, onAudioReady() {},
    });
  `, ctx);
  return { ctx, idles, workers, links };
}
async function drain(idles) {
  await new Promise((r) => setTimeout(r, 0));   // the scenery microtask
  for (let i = 0; i < idles.length; i++) await idles[i].fn();   // every idle callback, including ones queued meanwhile
  await new Promise((r) => setTimeout(r, 0));
}

test("a player's title idle spawns no track-build Worker (R3-ASYNC-2)", async () => {
  const { ctx, idles, workers } = boot({ agent: false });
  ctx.__lb.raceAssets();
  await drain(idles);
  assert.deepEqual(workers, [], "no Worker constructed by raceAssets()");
});

test("the agent surface still warms the worker at title idle", async () => {
  const { ctx, idles, workers } = boot({ agent: true });
  ctx.__lb.raceAssets();
  await drain(idles);
  assert.equal(workers.length, 1, "warmed for __apex track switches");
});

test("the idle audio prefetch asks for the content-hash key the loader will inject (R3-PHONE-8)", async () => {
  const hashed = boot({ lazyV: { "js/audio/engine.js": "abcdef012345" } });
  hashed.ctx.__lb.raceAssets();
  await drain(hashed.idles);
  assert.deepEqual(hashed.links.filter((l) => l.rel === "prefetch").map((l) => l.href), ["js/audio/engine.js?v=abcdef012345"]);
  assert.equal(vm.runInContext('ScriptLoader.url("js/audio/engine.js")', hashed.ctx), "js/audio/engine.js?v=abcdef012345");
  assert.equal(vm.runInContext('ScriptLoader.url("js/audio/panel.js")', hashed.ctx), "js/audio/panel.js?v=4100", "a file the map does not name keeps the build");
  const dev = boot();
  dev.ctx.__lb.raceAssets();
  await drain(dev.idles);
  assert.deepEqual(dev.links.filter((l) => l.rel === "prefetch").map((l) => l.href), ["js/audio/engine.js?v=4100"], "no map (dev shell): the build, as before");
});

test("a malformed or hostile map falls back to the build key", () => {
  for (const bad of ['{"js/core/log.js":"../../evil"}', "not json", '{"js/core/log.js":123}']) {
    const ctx = vm.createContext({ window: { __APEX_BUILD: 9 },
      document: { getElementById: () => ({ textContent: bad }) } });
    vm.runInContext(read("js/core/script-loader.js"), ctx);
    assert.equal(vm.runInContext('ScriptLoader.url("js/core/log.js")', ctx), "js/core/log.js?v=9", bad);
  }
});
