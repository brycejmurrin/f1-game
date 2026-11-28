/* lazy-serial-scope.test.mjs — the serial lazy loaders (#7415, ledger #7387 rows 6 and 7).
 *
 * Row 6: loadBackendScripts made a fresh generation scope per CALL, and the serial
 * loaders call it once per file, so the "one legacy-worker timeout per load()" memo
 * (UpdateCheck.prepareLazyLoad scope.legacyController) never carried over: an
 * unresponsive controller cost 1500 ms per file (36 race-session files, 21 audio).
 * Now each serial RUN shares one scope; a new run asks afresh.
 * Row 7: loadAudioSerial fetched its wave one request at a time; it now preloads the
 * pending wave once, as loadRaceSessionSerial does.
 *
 * Run: node --test tests/unit/lazy-serial-scope.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFileSync } from "node:fs";
import { absSrc } from "../helpers/abs-src.mjs";

const read = (rel) => readFileSync(new URL("../../" + rel, import.meta.url), "utf8");
const AUDIO = ["js/audio/engine.js", "js/audio/mix-duck.js", "js/audio/panel.js"];

function audioRig() {
  const ev = [], scopes = [];
  const ctx = vm.createContext({
    Promise, setTimeout, clearTimeout, queueMicrotask,
    ApexRoster: {
      DEFERRED: {}, DEFERRED_EDGES: [], LAZY_AGENT: [], LAZY_EDGES: [], LAZY_RACE: [],
      LAZY_RACE_SESSION: [], LAZY_RACE_SESSION_EDGES: [],
      LAZY_AUDIO: AUDIO, LAZY_AUDIO_EDGES: [[AUDIO[0], AUDIO[1]], [AUDIO[1], AUDIO[2]]],
      LAZY_TRACK_BUILD: [], LAZY_TRACK_BUILD_EDGES: [],
      LAZY_DATA: [], LAZY_DATA_EDGES: [], LAZY_NET: [], LAZY_NET_EDGES: [],
      SCENERY_DIR: "js/circuits/scenery",
    },
    localStorage: { getItem() { return null; } },
    navigator: { userAgent: "Mozilla/5.0" },
    location: { search: "", hostname: "example.com" },
    performance: { mark() {} },
    Log: { warn() {}, info() {}, error() {} },
    els: {},
    UpdateCheck: { prepareLazyLoad: async (scope) => { scopes.push(scope); return true; }, blocksLazyLoad: () => false },
    GameAudio: { _stub: true, init() {}, setEnabled() {}, setMusicVolume() {}, setSfxVolume() {} },
    AudioPanel: { _stub: true, create() { return { init() {} }; } },
  });
  ctx.window = ctx;
  const pmsettings = { hidden: false };   // Settings open → settingsUiHot → loadAudioSerial
  ctx.document = {
    getElementById: (id) => (id === "pmsettings" ? pmsettings : null),
    activeElement: null,
    createElement: (tag) => ({ tag, dataset: {}, remove() {} }),
    head: {
      appendChild(el) {
        const rel = el.href ? el.href.replace(/\?.*$/, "") : el.src.replace(/\?.*$/, "");
        if (el.tag === "link") { ev.push("preload " + rel); return; }
        ev.push("inject " + rel);
        setTimeout(() => {
          if (rel.endsWith("engine.js")) ctx.GameAudio = { _stub: false, init() {}, setEnabled() {}, setMusicVolume() {}, setSfxVolume() {} };
          if (rel.endsWith("panel.js")) ctx.AudioPanel = { create() { return { init() {} }; } };
          el.onload();
        }, 0);
      },
    },
  };
  vm.runInContext(`${read("js/core/script-loader.js")}\n${read("js/core/lazy-bundles.js")}\n` +
    "this.ScriptLoader = ScriptLoader; this.LazyBundles = LazyBundles;", ctx, { filename: absSrc("js/core/lazy-bundles.js") });
  const sl = ctx.ScriptLoader.create();
  const lb = ctx.LazyBundles.create({ els: {}, loadBackendScripts: sl.load, getContext: () => ({}), onAudioReady() {} });
  return { ctx, ev, scopes, lb, sl };
}

test("row 7: the serial audio path preloads the whole pending wave once, before the first inject", async () => {
  const r = audioRig();
  assert.equal(await r.lb.ensureAudio(), true);
  const preloads = r.ev.filter((e) => e.startsWith("preload "));
  assert.deepEqual(preloads, AUDIO.map((f) => "preload " + f), "every pending file is preloaded exactly once");
  const firstInject = r.ev.findIndex((e) => e.startsWith("inject "));
  assert.ok(r.ev.slice(0, firstInject).length === AUDIO.length, "all preloads come before the first inject: " + r.ev.join(" | "));
  assert.deepEqual(r.ev.filter((e) => e.startsWith("inject ")), AUDIO.map((f) => "inject " + f), "evaluation stays serial, in edge order");
});

test("row 6: one serial audio run shares ONE generation scope across its per-file loads", async () => {
  const r = audioRig();
  assert.equal(await r.lb.ensureAudio(), true);
  assert.equal(r.scopes.length, AUDIO.length, "one worker check per file");
  assert.ok(r.scopes.every((s) => s && s === r.scopes[0]), "the same scope object for the whole run");
});

test("row 6: ScriptLoader.load uses opts.generationScope, and a fresh scope per call without it", async () => {
  const r = audioRig();
  const shared = {};
  const ok = async (files, opts) => {
    const p = r.sl.load(files, [], opts);
    await new Promise((res) => setTimeout(res, 5));
    return p;
  };
  assert.equal(await ok(["lazy/a.js"], { generationScope: shared }), true);
  assert.equal(await ok(["lazy/b.js"], { generationScope: shared }), true);
  assert.equal(r.scopes[0], shared); assert.equal(r.scopes[1], shared);
  assert.equal(await ok(["lazy/c.js"]), true);
  assert.equal(await ok(["lazy/d.js"]), true);
  assert.ok(r.scopes[2] !== shared && r.scopes[3] !== shared && r.scopes[2] !== r.scopes[3],
    "a plain load() keeps its own scope (the fallback never outlives the call)");
});

test("row 6: the legacy-controller memo carries across one serial run: one 1500 ms timeout, not one per file", async () => {
  // The real UpdateCheck.prepareLazyLoad contract (js/ui/update-check.js): an unresponsive
  // controller is remembered on the scope, and a scope that names it skips the check.
  const r = audioRig();
  let timeouts = 0;
  const legacy = {};
  r.ctx.UpdateCheck.prepareLazyLoad = async (scope) => {
    r.scopes.push(scope);
    if (scope && scope.legacyController === legacy) return true;
    timeouts++;   // would wait 1500 ms for a reply that never comes
    if (scope) scope.legacyController = legacy;
    return true;
  };
  assert.equal(await r.lb.ensureAudio(), true);
  assert.equal(timeouts, 1, "one timeout for the whole run of " + AUDIO.length + " files");
});

test("row 6: each loadRaceSessionSerial run passes one scope to every per-file load; the next run gets a new one", async () => {
  const files = ["js/race/duel.js", "js/race/spotter.js", "js/race/pit-lane.js"];
  const G = { "js/race/duel.js": "Duel", "js/race/spotter.js": "Spotter", "js/race/pit-lane.js": "PitLane" };
  const seen = [];
  let fail = true;
  const ctx = vm.createContext({
    ApexRoster: { DEFERRED: {}, DEFERRED_EDGES: [], LAZY_AGENT: [], LAZY_EDGES: [], LAZY_RACE: [],
      LAZY_RACE_SESSION: files, LAZY_RACE_SESSION_EDGES: [], LAZY_AUDIO: [], LAZY_AUDIO_EDGES: [],
      SCENERY_DIR: "", LAZY_SCENERY: [], LAZY_DATA: [], LAZY_DATA_EDGES: [], LAZY_NET: [], LAZY_NET_EDGES: [] },
    Duel: { _stub: true }, Spotter: { _stub: true }, PitLane: { _stub: true },
    window: {}, Tracks: { LIST: [] }, Log: { warn() {}, info() {}, error() {} }, els: {}, queueMicrotask,
    requestIdleCallback() { return 1; }, setTimeout() {}, clearTimeout() {},
    scheduler: { yield: () => Promise.resolve() },
    ScriptLoader: { preload: (f) => f.length },
    __load: async (f, edges, o) => {
      seen.push(o.generationScope);
      // First run: the last file fails, so the next ensureRaceSession is a new run.
      if (fail && f[0] === files[2]) { fail = false; return false; }
      for (const x of f) { ctx[G[x]] = { _stub: false }; if (o.ready(x)) o.loaded.add(x); }
      return true;
    },
  });
  vm.runInContext(read("js/core/lazy-bundles.js") + `
    const lb = LazyBundles.create({ els, loadBackendScripts: __load, getContext() {}, onRaceSessionReady() {} });
    globalThis.__ensure = lb.ensureRaceSession;`, ctx, { filename: absSrc("js/core/lazy-bundles.js") });
  assert.equal(await ctx.__ensure(), false);
  assert.equal(seen.length, 3);
  assert.ok(seen[0] && seen.every((s) => s === seen[0]), "one scope for the whole first run");
  assert.equal(await ctx.__ensure(), true, "the retry loads only what is missing");
  assert.equal(seen.length, 4);
  assert.ok(seen[3] && seen[3] !== seen[0], "a new run asks the worker afresh");
});
