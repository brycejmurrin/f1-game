/* lazy-bundles-prefetch.test.mjs — the lazy-bundle loaders under a flaky network.
 *
 * Pins five defects found by the 2026-10 render/boot hunt, each reproduced against
 * the REAL js/core/lazy-bundles.js + script-loader.js (a fake <script> that
 * evaluates the real repo file, or a synthetic one where the real file needs a
 * browser):
 *   - raceAssets() prefetches the selected circuit's scenery on EVERY boot; a failed
 *     circuit payload rejected ensureCircuit and painted the red overlay on the title;
 *   - a partial LAZY_RACE_SESSION / LAZY_AUDIO failure was never repaired (one
 *     global tested, the rest never loaded, the on-ready hook never ran);
 *   - ensureNet's retry re-injected the 14 script-level-const files;
 *   - a failed agent surface latched for the session;
 *   - a post-load hook that throws latched a rejected memo (RACE! dead until reload);
 *   - a scenery fetch that failed was indistinguishable from one that landed.
 * Run: node --test tests/unit/lazy-bundles-prefetch.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

const ROOT = new URL("../../", import.meta.url);
const read = (rel) => readFileSync(new URL(rel, ROOT), "utf8");
const manifest = createRequire(import.meta.url)("../../tools/manifest.cjs");
const loaderSrc = read("js/core/script-loader.js");
const bundlesSrc = read("js/core/lazy-bundles.js");

const tick = () => new Promise((r) => setTimeout(r, 0));

/* A page whose <script> tags are fed by `body(rel)` (the source to evaluate) and
   `failOnce` (srcs whose first request errors). Counts every injection per src. */
function world({ roster = {}, failOnce = [], body, globals = {}, deps = {} }) {
  const injected = new Map(), evalErrors = [], logged = [], fail = new Set(failOnce);
  const ctx = vm.createContext({
    console, Promise, setTimeout, clearTimeout, queueMicrotask, URLSearchParams, TextEncoder, TextDecoder,
    ApexRoster: {
      DEFERRED: {}, DEFERRED_EDGES: [], LAZY_AGENT: [], LAZY_EDGES: [], LAZY_RACE: [],
      LAZY_RACE_SESSION: [], LAZY_RACE_SESSION_EDGES: [], LAZY_AUDIO: [], LAZY_AUDIO_EDGES: [],
      LAZY_DATA: [], LAZY_DATA_EDGES: [], LAZY_NET: [], LAZY_NET_EDGES: [],
      SCENERY_DIR: "js/circuits/scenery", ...roster,
    },
    localStorage: { getItem() { return null; } },
    navigator: { userAgent: "apex-game-vm" },
    location: { search: "", hostname: "example.com" },
    Log: { warn() {}, info() {}, error(_ns, m) { logged.push(m); } },
    els: {},
    ...globals,
  });
  ctx.window = ctx;
  ctx.document = {
    createElement() { return { dataset: {}, remove() {} }; },
    head: { appendChild(el) {
      const rel = el.src.replace(/\?.*$/, "");
      injected.set(rel, (injected.get(rel) || 0) + 1);
      setTimeout(() => {
        if (fail.delete(rel)) { el.onerror(); return; }
        try { vm.runInContext(body(rel), ctx, { filename: rel }); }
        catch (e) { evalErrors.push(rel + ": " + e.message); }
        el.onload();
      }, 0);
    } },
  };
  vm.runInContext(loaderSrc + "\n" + bundlesSrc + "\nthis.ScriptLoader = ScriptLoader; this.LazyBundles = LazyBundles;", ctx);
  const sl = ctx.ScriptLoader.create();
  const lb = ctx.LazyBundles.create({ els: {}, loadBackendScripts: sl.load, getContext: () => ({}), ...deps });
  return { ctx, lb, injected, evalErrors, logged };
}

test("raceAssets: a circuit payload that cannot load never reaches the unhandled-rejection overlay", async () => {
  const rejections = [];
  const onRej = (e) => rejections.push(String((e && e.message) || e));
  process.on("unhandledRejection", onRej);
  try {
    // The offline / CDN-404 / stale-tab loader: every script request errors.
    const flaky = world({
      globals: { Tracks: { LIST: [{ id: "monza" }], circuitPayloadResident: () => false, hydrate: () => true } },
      body: () => "",
      deps: { applyLightTuneIfReady() {}, loadBackendScripts: async () => false, getContext: () => ({ trackIdx: 0 }) },
    });
    flaky.lb.raceAssets();
    await tick(); await tick(); await tick();
    await new Promise((r) => setTimeout(r, 50));   // unhandledRejection fires after the microtask drain
    assert.deepEqual(rejections, []);
  } finally { process.off("unhandledRejection", onRej); }
});

test("ensureRaceSession: a partial failure is repaired by the next call, and the hook runs once", async () => {
  let hooks = 0;
  const w = world({
    roster: { LAZY_RACE_SESSION: manifest.LAZY_RACE_SESSION, LAZY_RACE_SESSION_EDGES: manifest.LAZY_RACE_SESSION_EDGES },
    failOnce: ["js/race/engineer.js"],
    body: (rel) => read(rel),
    deps: { onRaceSessionReady() { hooks++; } },
  });
  vm.runInContext(read("js/core/mat4.js") + "\nthis.M4 = M4;", w.ctx);
  vm.runInContext(read("js/race/session-stub.js"), w.ctx);
  const stub = (g) => vm.runInContext(`${g}._stub`, w.ctx);
  assert.equal(await w.lb.ensureRaceSession(), false, "engineer.js failed once");
  assert.equal(hooks, 0, "no hook on an incomplete group");
  assert.equal(stub("RaceEngineer"), true);
  assert.equal(await w.lb.ensureRaceSession(), true, "the retry loads what is missing");
  assert.equal(hooks, 1);
  assert.equal(stub("RaceEngineer"), undefined, "engineer is now the real module");
  assert.equal(await w.lb.ensureRaceSession(), true);
  assert.equal(hooks, 1, "on-ready runs exactly once");
  assert.equal(w.injected.get("js/race/engineer.js"), 2);
  for (const f of manifest.LAZY_RACE_SESSION) {
    if (f !== "js/race/engineer.js") assert.equal(w.injected.get(f) || 0, 1, f + " was already real: no second inject");
  }
  assert.deepEqual(w.evalErrors, []);
});

for (const failing of ["js/net/lobby.js", "js/net/qr.js"]) {
  test(`ensureNet: a failed ${failing} retries without re-injecting the script-level consts that landed`, async () => {
    const w = world({
      roster: { LAZY_NET: manifest.LAZY_NET, LAZY_NET_EDGES: manifest.LAZY_NET_EDGES },
      failOnce: [failing],
      body: (rel) => read(rel),
      deps: { createNetwork: () => ({ wire() {} }) },
    });
    vm.runInContext(read("js/core/mat4.js") + "\nthis.M4 = M4;", w.ctx);
    assert.equal(await w.lb.ensureNet(), false);
    assert.equal(await w.lb.ensureNet(), true);
    assert.deepEqual(w.evalErrors, [], "no 'Identifier has already been declared'");
    for (const f of manifest.LAZY_NET) assert.equal(w.injected.get(f), f === failing ? 2 : 1, f);
  });
}

test("ensureAudio: a panel.js that failed after engine.js went real is loaded by the next call", async () => {
  let hooks = 0;
  const defs = {
    "js/audio/engine.js": "var GameAudio = { _stub: false, init() {}, setEnabled() {}, setMusicVolume() {}, setSfxVolume() {} };",
    "js/audio/panel.js": "var AudioPanel = { create() {} };",
  };
  const w = world({
    roster: { LAZY_AUDIO: Object.keys(defs), LAZY_AUDIO_EDGES: [["js/audio/engine.js", "js/audio/panel.js"]] },
    failOnce: ["js/audio/panel.js"],
    body: (rel) => defs[rel],
    globals: {
      GameAudio: { _stub: true, init() {} },
      AudioPanel: { init() {} },   // the title's unmarked stub
    },
    deps: { onAudioReady() { hooks++; } },
  });
  assert.equal(await w.lb.ensureAudio(), false);
  assert.equal(hooks, 0);
  assert.equal(await w.lb.ensureAudio(), true, "GameAudio was already real, panel.js was not");
  assert.equal(hooks, 1);
  assert.equal(await w.lb.ensureAudio(), true);
  assert.equal(hooks, 1, "onAudioReady runs once");
  assert.equal(w.injected.get("js/audio/engine.js"), 1);
  assert.equal(w.injected.get("js/audio/panel.js"), 2);
});

test("loadAgentSurface: a failed load does not latch; a complete one is memoised", async () => {
  let binds = 0;
  const files = ["fixture-agent-a.js", "fixture-agent-b.js"];
  const w = world({
    roster: { LAZY_AGENT: files, LAZY_EDGES: [] },
    failOnce: ["fixture-agent-b.js"],
    body: () => "",
    globals: { NetPlay: {}, NetLobby: {} },
    deps: { bindAgent() { binds++; }, createNetwork: () => ({ wire() {} }) },
  });
  await w.lb.loadAgentSurface();
  assert.equal(binds, 1);
  await w.lb.loadAgentSurface();   // METRICS asks again on its next open
  assert.equal(w.injected.get("fixture-agent-a.js"), 1, "a landed file is not re-injected");
  assert.equal(w.injected.get("fixture-agent-b.js"), 2, "the failed one is retried");
  await w.lb.loadAgentSurface();
  assert.equal(w.injected.get("fixture-agent-b.js"), 2, "now complete: memoised");
});

// A hook that throws must not latch a rejected promise: the call resolves false, the memo
// is cleared, and the next call (hook fixed) runs it again and reports true.
test("ensureAudio: a throwing onAudioReady resolves false, clears the memo, and is retried", async () => {
  let calls = 0, boom = true;
  const w = world({
    roster: { LAZY_AUDIO: ["js/audio/engine.js"], LAZY_AUDIO_EDGES: [] },
    body: () => "var GameAudio = { _stub: false, init() {}, setEnabled() {}, setMusicVolume() {}, setSfxVolume() {} };",
    globals: { GameAudio: { _stub: true, init() {} } },
    deps: { onAudioReady() { calls++; if (boom) throw new Error("panel exploded"); } },
  });
  assert.equal(await w.lb.ensureAudio(), false, "the throw is a miss, not a rejection");
  assert.equal(calls, 1);
  assert.ok(w.logged.some((m) => /panel exploded/.test(m)), "logged through Log.error");
  boom = false;
  assert.equal(await w.lb.ensureAudio(), true, "the memo was cleared: the retry runs the hook");
  assert.equal(calls, 2);
  assert.equal(w.injected.get("js/audio/engine.js"), 1, "the landed file is not re-injected");
  assert.equal(await w.lb.ensureAudio(), true);
  assert.equal(calls, 2, "fired once it succeeded: memoised from here");
});

test("ensureRaceSession: a throwing onRaceSessionReady resolves false and the next call runs the hook again", async () => {
  let calls = 0, boom = true;
  const w = world({
    roster: { LAZY_RACE_SESSION: ["js/race/pit-lane.js"], LAZY_RACE_SESSION_EDGES: [] },
    body: () => "var PitLane = { go() {} };",
    globals: { PitLane: { _stub: true } },
    deps: { onRaceSessionReady() { calls++; if (boom) throw new Error("session exploded"); } },
  });
  assert.equal(await w.lb.ensureRaceSession(), false);
  assert.equal(calls, 1);
  assert.ok(w.logged.some((m) => /session exploded/.test(m)));
  boom = false;
  assert.equal(await w.lb.ensureRaceSession(), true);
  assert.equal(calls, 2, "a hook that threw was not counted as fired");
  assert.equal(await w.lb.ensureRaceSession(), true);
  assert.equal(calls, 2);
});

test("ensureDataHub: a throwing DataHub.init resolves false and a later tap retries", async () => {
  const w = world({
    roster: { LAZY_DATA: ["js/data/hub.js"], LAZY_DATA_EDGES: [] },
    body: () => "const DataHub = { init() { if (++initCalls === 1) throw new Error('hub exploded'); } };",
    globals: { initCalls: 0 },
  });
  assert.equal(await w.lb.ensureDataHub(), false);
  assert.ok(w.logged.some((m) => /hub exploded/.test(m)));
  assert.equal(await w.lb.ensureDataHub(), true);
  assert.equal(vm.runInContext("initCalls", w.ctx), 2);
  assert.equal(w.injected.get("js/data/hub.js"), 1, "the const is not re-injected on retry");
});

test("ensureNet: a throwing createNetwork / wire resolves false and a later call retries", async () => {
  let wires = 0, boom = true;
  const w = world({
    roster: { LAZY_NET: ["js/net/lobby.js"], LAZY_NET_EDGES: [] },
    body: () => "var NetPlay = {}; var NetLobby = {};",
    deps: { createNetwork: () => ({ wire() { wires++; if (boom) throw new Error("wire exploded"); } }) },
  });
  assert.equal(await w.lb.ensureNet(), false);
  assert.ok(w.logged.some((m) => /wire exploded/.test(m)));
  boom = false;
  assert.equal(await w.lb.ensureNet(), true);
  assert.equal(wires, 2);
  assert.equal(await w.lb.ensureNet(), true);
  assert.equal(wires, 2, "wired once it succeeded");
});

// ensureScenery tells the caller whether the closure is resident: ONE fetch per
// ask (a failed script is a completed request with fallback scenery, and
// session-entry-vm holds that request to prove a start survives it), no
// negative cache, so the next ask fetches again.
test("ensureScenery: a failed fetch resolves false after one attempt; the next call fetches again; a landed one is true", async () => {
  let fetches = 0, land = false;
  const w = world({
    globals: { Tracks: { LIST: [{ id: "monza" }], circuitPayloadResident: () => true } },
    body: () => "",
    deps: {
      loadBackendScripts: async (files) => {
        fetches++;
        assert.deepEqual([...files], ["js/circuits/scenery/monza.js"]);   // spread: the VM realm's array
        if (land) { w.ctx.TrackScenery = { monza() {} }; return true; }
        return false;   // the real loader RESOLVES false on an error
      },
    },
  });
  assert.equal(await w.lb.ensureScenery(0), false, "not resident: the caller can tell");
  assert.equal(fetches, 1, "one attempt per ask: a held retry would hang a start (session-entry-vm)");
  assert.equal(await w.lb.ensureScenery(0), false);
  assert.equal(fetches, 2, "no negative cache: every ask fetches again");
  land = true;
  assert.equal(await w.lb.ensureScenery(0), true);
  assert.equal(fetches, 3);
  assert.equal(await w.lb.ensureScenery(0), true);
  assert.equal(fetches, 3, "resident: nothing to fetch");
});
