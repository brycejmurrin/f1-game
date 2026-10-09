/* lazy-audio-yield.test.mjs — LAZY_AUDIO ensureAudio yields off the title-tap turn;
 * awaiting still resolves to a ready engine; game-vm skips yield; no AudioContext
 * before activation (restoreOnEngine still gates on userActivation).
 * Run: node --test tests/unit/lazy-audio-yield.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import path from "path";
import vm from "vm";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const src = (rel) => readFileSync(path.join(ROOT, rel), "utf8");

function bootEnsure(opts) {
  const loader = src("js/core/script-loader.js");
  const bundles = src("js/core/lazy-bundles.js");
  const bag = opts.bag;
  const hold = { ctx: null };
  hold.ctx = vm.createContext({
    ApexRoster: {
      DEFERRED: {}, DEFERRED_EDGES: [], LAZY_AGENT: [], LAZY_EDGES: [],
      LAZY_RACE: [], LAZY_RACE_SESSION: [], LAZY_RACE_SESSION_EDGES: [],
      LAZY_AUDIO: ["js/audio/engine.js"], LAZY_AUDIO_EDGES: [],
      SCENERY_DIR: "", LAZY_SCENERY: [], LAZY_DATA: [], LAZY_DATA_EDGES: [],
      LAZY_NET: [], LAZY_NET_EDGES: [],
    },
    window: { __APEX_BUILD: "test" },
    navigator: {
      userAgent: opts.ua || "Mozilla/5.0 Chrome/128",
      userActivation: { hasBeenActive: !!opts.hasBeenActive },
    },
    GameAudio: {
      _stub: true,
      setEnabled() {}, setMusicVolume() {}, setSfxVolume() {},
      onInterrupted() {}, setCameraMix() {},
      init() { bag.inits++; },
      _interruptHook: () => null,
    },
    Log: { warn() {}, info() {} },
    els: {},
    scheduler: {
      yield() { bag.yields.push("sched"); return Promise.resolve(); },
    },
    setTimeout(fn, ms) {
      bag.yields.push("timer");
      return setTimeout(fn, ms);
    },
    queueMicrotask: (fn) => queueMicrotask(fn),
    requestIdleCallback() {
      if (opts.forbidRic) throw new Error("ensureAudio must not use rIC for completion");
      return 0;
    },
    document: {
      createElement() { return { dataset: {}, remove() {}, src: "" }; },
      head: {
        appendChild(node) {
          hold.ctx.GameAudio = {
            _stub: false,
            setEnabled() {}, setMusicVolume() {}, setSfxVolume() {},
            onInterrupted() {}, setCameraMix() {},
            init() { bag.inits++; },
          };
          queueMicrotask(() => node.onload());
        },
      },
    },
    __bag: bag,
  });
  vm.runInContext(loader + "\n" + bundles + `
    globalThis.__ensure = LazyBundles.create({
      els, loadBackendScripts: ScriptLoader.create().load,
      getContext: () => ({ store: { get: () => 0.5 }, soundOn: true, camMode: 0 }),
      applyLightTuneIfReady() {},
      bindAgent() {}, createNetwork() { return { wire() {} }; },
      onAudioReady() { __bag.ready++; },
    }).ensureAudio;
  `, hold.ctx);
  return hold.ctx;
}

test("ensureAudio source yields before load and before onAudioReady; skips under game-vm", () => {
  const bundles = src("js/core/lazy-bundles.js");
  assert.match(bundles, /function audioYieldToMain\(/, "yield helper");
  assert.match(bundles, /function audioIsGameVm\(/, "game-vm guard");
  assert.match(bundles, /apex-game-vm/, "UA mark matches startRaceBody / game-vm");
  assert.match(bundles, /scheduler\.yield/, "Scheduler API when present");
  assert.match(bundles, /setTimeout\(r, 0\)/, "Safari / no-scheduler fallback");
  assert.match(bundles, /setTimeout\(r, 16\)/, "paint yield waits one frame of wall time, not rAF");
  assert.doesNotMatch(bundles, /audioYieldToMain[\s\S]{0,400}requestAnimationFrame/,
    "paint yield must not wait on rAF (garage WebGL stalls frames)");
  assert.match(bundles, /await audioYieldToMain\("paint"\);\s*const ok = await loadBackendScripts\(AUDIO_FILES/,
    "paint yield before LAZY_AUDIO script eval");
  assert.match(bundles, /await audioYieldToMain\("task"\);\s*if \(typeof deps\.onAudioReady/,
    "task yield before onAudioReady / panel init");
  assert.match(bundles, /Do NOT evaluate LAZY_AUDIO here/, "raceAssets still does not eval audio on title idle (#1135)");
  assert.match(bundles, /el\.rel = "prefetch"/, "late idle HTTP prefetch only");
  assert.match(bundles, /scheduleIdle\(\(\) => \{ prefetchAudio\(\); \}, 4500\)/, "prefetch after typical title networkidle");
  const game = src("js/game.js");
  assert.match(game, /pointerdown", \(\) => \{ ensureAudio\(\); \}, \{ once: true, capture: true \}/,
    "gesture hook still calls ensureAudio exactly once (capture once)");
  assert.match(game, /keyKick/, "keyboard-first title still kicks ensureAudio");
});

test("await ensureAudio resolves after onAudioReady; yields once on real UA", async () => {
  const bag = { ready: 0, yields: [], inits: 0 };
  const ctx = bootEnsure({ bag, forbidRic: true, hasBeenActive: true });
  const p1 = ctx.__ensure();
  const p2 = ctx.__ensure();
  assert.equal(p1, p2, "gesture + awaiter share one memoised promise");
  const ok = await p1;
  assert.equal(ok, true);
  assert.equal(bag.ready, 1, "onAudioReady ran before resolve");
  assert.ok(!ctx.GameAudio._stub, "real engine bound");
  assert.ok(bag.inits >= 1, "restoreOnEngine called GameAudio.init under hasBeenActive");
  assert.deepEqual(bag.yields, ["sched", "timer", "sched"],
    "paint = yield+16ms timer; task = yield before onAudioReady");
});

test("game-vm UA skips yields but still completes ensureAudio", async () => {
  const bag = { ready: 0, yields: [], inits: 0 };
  const ctx = bootEnsure({
    bag,
    ua: "Mozilla/5.0 (X11; Linux x86_64) apex-game-vm",
    hasBeenActive: true,
  });
  assert.equal(await ctx.__ensure(), true);
  assert.equal(bag.ready, 1);
  assert.equal(bag.yields.length, 0, "apex-game-vm skips audioYieldToMain");
});

test("restoreOnEngine does not init without user activation", async () => {
  const bag = { ready: 0, yields: [], inits: 0 };
  const ctx = bootEnsure({ bag, hasBeenActive: false });
  assert.equal(await ctx.__ensure(), true);
  assert.equal(bag.inits, 0, "no AudioContext init before activation");
});

function bootEnsureWithRadio(opts) {
  const loader = src("js/core/script-loader.js");
  const bundles = src("js/core/lazy-bundles.js");
  const bag = opts.bag;
  const savedVol = opts.volRadio != null ? opts.volRadio : 0.15;
  const radio = {
    _v: opts.staleRadioVol != null ? opts.staleRadioVol : 0.8,
    setVolume(v) { this._v = v; bag.radioApplied = v; return v; },
    volume() { return this._v; },
  };
  const hold = { ctx: null };
  hold.ctx = vm.createContext({
    ApexRoster: {
      DEFERRED: {}, DEFERRED_EDGES: [], LAZY_AGENT: [], LAZY_EDGES: [],
      LAZY_RACE: [], LAZY_RACE_SESSION: [], LAZY_RACE_SESSION_EDGES: [],
      LAZY_AUDIO: ["js/audio/engine.js"], LAZY_AUDIO_EDGES: [],
      SCENERY_DIR: "", LAZY_SCENERY: [], LAZY_DATA: [], LAZY_DATA_EDGES: [],
      LAZY_NET: [], LAZY_NET_EDGES: [],
    },
    window: { __APEX_BUILD: "test" },
    navigator: {
      userAgent: opts.ua || "Mozilla/5.0 Chrome/128",
      userActivation: { hasBeenActive: !!opts.hasBeenActive },
    },
    GameAudio: {
      _stub: true,
      setEnabled() {}, setMusicVolume() {}, setSfxVolume() {}, radioLeadS: () => 0,
      onInterrupted() {}, setCameraMix() {},
      init() { bag.inits++; },
      _interruptHook: () => null,
    },
    Log: { warn() {}, info() {} },
    els: {},
    scheduler: { yield() { bag.yields = bag.yields || []; bag.yields.push("sched"); return Promise.resolve(); } },
    setTimeout(fn, ms) {
      bag.yields = bag.yields || [];
      bag.yields.push("timer");
      return setTimeout(fn, ms);
    },
    queueMicrotask: (fn) => queueMicrotask(fn),
    requestIdleCallback() { return 0; },
    document: {
      createElement() { return { dataset: {}, remove() {}, src: "" }; },
      head: {
        appendChild(node) {
          hold.ctx.GameAudio = {
            _stub: false,
            setEnabled() {}, setMusicVolume() {}, setSfxVolume() {}, radioLeadS: () => 0,
            onInterrupted() {}, setCameraMix() {},
            init() { bag.inits++; },
          };
          queueMicrotask(() => node.onload());
        },
      },
      hidden: false, addEventListener() {}, removeEventListener() {},
    },
    MutationObserver: function () { this.observe = () => {}; },
    __bag: bag,
  });
  vm.runInContext(loader + "\n" + bundles + `
    globalThis.__ensure = LazyBundles.create({
      els, loadBackendScripts: ScriptLoader.create().load,
      getContext: () => ({
        store: {
          get(k, d) {
            if (k === "volRadio") return ${JSON.stringify(savedVol)};
            if (k === "volMusic") return 0.5;
            if (k === "volSfx") return 0.2;
            return d;
          },
        },
        soundOn: true,
        camMode: 0,
        radio: globalThis.__testRadio,
      }),
      applyLightTuneIfReady() {},
      bindAgent() {}, createNetwork() { return { wire() {} }; },
      onAudioReady() { __bag.ready++; },
    }).ensureAudio;
    globalThis.__testRadio = null;
  `, hold.ctx);
  hold.ctx.__testRadio = radio;
  return { ctx: hold.ctx, radio, bag };
}

test("restoreOnEngine source restores volRadio alongside volMusic and volSfx", () => {
  const bundles = src("js/core/lazy-bundles.js");
  const block = bundles.slice(bundles.indexOf("function restoreOnEngine"), bundles.indexOf("function ensureAudio"));
  assert.match(block, /setMusicVolume\(store\.get\("volMusic"\)\)/);
  assert.match(block, /setSfxVolume\(store\.get\("volSfx"\)\)/);
  assert.match(block, /volRadio/);
  assert.match(block, /setVolume\(store\.get\("volRadio"/);
});

test("saved volRadio reaches G.radio when the real engine binds, before onAudioReady", async () => {
  const bag = { ready: 0, inits: 0 };
  const { ctx, radio } = bootEnsureWithRadio({ bag, volRadio: 0.15, staleRadioVol: 0.8, hasBeenActive: true });
  assert.equal(radio.volume(), 0.8, "precondition: stale in-memory radio level before panel init");
  assert.equal(await ctx.__ensure(), true);
  assert.equal(bag.ready, 1, "onAudioReady still runs after restore");
  assert.equal(radio.volume(), 0.15,
    "restoreOnEngine must apply apex26.volRadio before AudioPanel.init — engineer lines in the gap were loud");
  assert.equal(bag.radioApplied, 0.15);
});
