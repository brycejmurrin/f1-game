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
import { absSrc } from "../helpers/abs-src.mjs";

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
    Log: { warn() {}, info() {}, error() {} },
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
            setRadioFocusDb(v) { bag.focusApplied = v; (bag.order ||= []).push("focus"); },
            init() { bag.inits++; (bag.order ||= []).push("init"); },
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
      getContext: () => ({ store: { get: (k) => k === "radioFocusDb" ? (__bag.focus || 0) : 0.5 }, soundOn: true, camMode: 0 }),
      applyLightTuneIfReady() {},
      bindAgent() {}, createNetwork() { return { wire() {} }; },
      onAudioReady(once) { __bag.ready++; if (__bag.hook) __bag.hook(once); },
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
  assert.match(bundles, /scheduleIdle\(\(\) => \{ prefetchAudio\(\); \}, 12000\)/, "prefetch after typical title networkidle");
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

// #4219: every onAudioReady part in one task was a 787 ms LoAF on the macOS census.
// A part's entry records how many yields ran before it; consecutive parts must differ.
function partsHook(bag, throwOnce) {
  bag.runs = [];
  return (once) => {
    for (const key of ["radio", "announcer", "panel", "cues"]) {
      once(key, () => {
        bag.runs.push({ key, yields: bag.yields.filter((y) => y === "sched").length });
        if (key === throwOnce && !bag.threw) { bag.threw = true; throw new Error("test: part threw"); }
      });
    }
  };
}

test("onAudioReady parts each run after their own main-thread yield (#4219)", async () => {
  const bag = { ready: 0, yields: [], inits: 0 };
  bag.hook = partsHook(bag);
  const ctx = bootEnsure({ bag, hasBeenActive: true });
  assert.equal(await ctx.__ensure(), true);
  assert.deepEqual(bag.runs.map((r) => r.key), ["radio", "announcer", "panel", "cues"], "order kept");
  for (let i = 1; i < bag.runs.length; i++) {
    assert.ok(bag.runs[i].yields > bag.runs[i - 1].yields, bag.runs[i].key + " ran in the same task as " + bag.runs[i - 1].key);
  }
});

test("a part that throws is re-run alone on retry, the rest after it still yield (#4219)", async () => {
  const bag = { ready: 0, yields: [], inits: 0 };
  bag.hook = partsHook(bag, "announcer");
  const ctx = bootEnsure({ bag, hasBeenActive: true });
  assert.equal(await ctx.__ensure(), false, "the throw is a miss");
  assert.deepEqual(bag.runs.map((r) => r.key), ["radio", "announcer"]);
  assert.ok(bag.runs[1].yields > bag.runs[0].yields, "announcer ran in radio's task");
  bag.runs.length = 0;
  assert.equal(await ctx.__ensure(), true, "the retry completes");
  assert.deepEqual(bag.runs.map((r) => r.key), ["announcer", "panel", "cues"], "radio is latched: not re-run");
  for (let i = 1; i < bag.runs.length; i++) assert.ok(bag.runs[i].yields > bag.runs[i - 1].yields, bag.runs[i].key);
  assert.equal(await ctx.__ensure(), true);
  assert.equal(bag.runs.length, 3, "memoised once every part returned");
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
    Log: { warn() {}, info() {}, error() {} },
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
  assert.match(block, /setMusicVolume\(store\.get\("volMusic", 0\.7\)\)/);
  assert.match(block, /setSfxVolume\(store\.get\("volSfx", 0\.4\)\)/);
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


test("lazy engine restores latest focus choice before context init and before native panel binding", async () => {
  const bag = { ready: 0, yields: [], inits: 0, focus: 4, order: [] };
  const ctx = bootEnsure({ bag, forbidRic: true, hasBeenActive: true });
  const pending = ctx.__ensure(); bag.focus = 12;
  await pending;
  assert.equal(bag.focusApplied, 12, "choice changed during load reaches real engine");
  assert.ok(bag.order.indexOf("focus") >= 0);
  assert.ok(bag.order.indexOf("focus") < bag.order.indexOf("init"), "restore precedes first graph");
  assert.equal(bag.ready, 1, "panel ready hook still completes once");
});

// #6448: while the title stub is resident, a trusted activation gesture must
// construct and resume one AudioContext synchronously. The real engine then
// adopts that same context instead of building a second one.
const param = (v) => ({ value: v, setTargetAtTime() {}, setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {}, cancelScheduledValues() {} });
function audioNode() {
  const n = { gain: param(1), frequency: param(440), connect(t) { return t; }, disconnect() {}, start() {}, stop() {} };
  return n;
}
function bootPrimer(opts = {}) {
  const contexts = [];
  const listeners = [];
  const bag = { resumeSync: 0, resumeTotal: 0, inGesture: false };
  const listen = {
    addEventListener(type, fn) { listeners.push({ type, fn }); },
    removeEventListener(type, fn) {
      const i = listeners.findIndex((l) => l.type === type && l.fn === fn);
      if (i >= 0) listeners.splice(i, 1);
    },
  };
  const sb = {
    Math, console, Object, Array, Number, String, JSON, Map, Set, WeakMap, Promise, Date, Error,
    parseFloat, parseInt, isFinite, Float32Array, queueMicrotask,
    Log: { warn() {}, info() {}, error() {}, debug() {} },
    setTimeout() { return 1; }, clearTimeout() {}, requestIdleCallback() { return 0; },
    document: {
      hidden: false, documentElement: null,
      addEventListener: listen.addEventListener, removeEventListener: listen.removeEventListener,
      createElement() { return { dataset: {}, remove() {}, src: "" }; },
      head: { appendChild() {} }, getElementById() { return null; }, querySelectorAll() { return []; },
    },
    navigator: { userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)", userActivation: { hasBeenActive: false, isActive: true } },
    ApexRoster: {
      DEFERRED: {}, DEFERRED_EDGES: [], LAZY_AGENT: [], LAZY_EDGES: [],
      LAZY_RACE: [], LAZY_RACE_SESSION: [], LAZY_RACE_SESSION_EDGES: [],
      LAZY_AUDIO: ["js/audio/engine.js"], LAZY_AUDIO_EDGES: [],
      SCENERY_DIR: "", LAZY_SCENERY: [], LAZY_DATA: [], LAZY_DATA_EDGES: [],
      LAZY_NET: [], LAZY_NET_EDGES: [],
    },
    els: {},
    fetch: () => Promise.resolve({ ok: false, status: 404, arrayBuffer: () => Promise.resolve(new ArrayBuffer(8)) }),
  };
  Object.assign(sb, listen);
  sb.window = sb;
  if (opts.audio !== false) {
    function AC() {
      const ctx = {
        currentTime: 0, state: "suspended", sampleRate: 8000, destination: audioNode(),
        createGain: () => audioNode(),
        createBiquadFilter: () => audioNode(),
        createOscillator: () => audioNode(),
        createBufferSource: () => audioNode(),
        createDynamicsCompressor: () => Object.assign(audioNode(), { threshold: param(0), knee: param(0), ratio: param(0), attack: param(0), release: param(0) }),
        createBuffer: (ch, len, sr) => ({ sampleRate: sr, length: len, duration: len / sr, numberOfChannels: ch, getChannelData: () => new Float32Array(len) }),
        decodeAudioData(_ab, _ok, rej) { if (rej) rej(new Error("skip")); return Promise.reject(new Error("skip")); },
        resume() { bag.resumeTotal++; if (bag.inGesture) bag.resumeSync++; ctx.state = "running"; return Promise.resolve(); },
        close() { ctx.state = "closed"; return Promise.resolve(); },
        suspend() { ctx.state = "suspended"; return Promise.resolve(); },
      };
      contexts.push(ctx);
      return ctx;
    }
    sb.AudioContext = AC;
    sb.webkitAudioContext = AC;
    sb.OfflineAudioContext = function OfflineAudioContext() {
      const ctx = AC();
      ctx.offline = true;
      ctx.startRendering = () => Promise.resolve({ duration: 0.01 });
      return ctx;
    };
  }
  const v = vm.createContext(sb);
  vm.runInContext(src("js/audio/stub.js"), v, { filename: absSrc("js/audio/stub.js") });
  vm.runInContext(src("js/core/script-loader.js") + "\n" + src("js/core/lazy-bundles.js"), v, { filename: absSrc("js/core/lazy-bundles.js") });
  vm.runInContext(`
    LazyBundles.create({
      els, loadBackendScripts: ScriptLoader.create().load,
      getContext: () => ({ store: { get: (_k, d) => d }, soundOn: true, camMode: 0 }),
      applyLightTuneIfReady() {}, bindAgent() {}, createNetwork() { return { wire() {} }; },
      onAudioReady() {},
    });
  `, v, { filename: absSrc("js/core/lazy-bundles.js") });
  function fire(type, trusted) {
    const hits = listeners.filter((l) => l.type === type);
    bag.inGesture = true;
    for (const h of hits) h.fn({ isTrusted: trusted, type });
    bag.inGesture = false;
    return hits.length;
  }
  function loadEngine() {
    const files = ["js/core/mat4.js", "js/audio/tone-model.js", "js/audio/signal.js", "js/audio/soundtrack.js", "js/audio/radio-fx.js", "js/audio/mix-duck.js", "js/audio/engine.js"];
    for (const rel of files) vm.runInContext(src(rel).replace(/^const\b/gm, "var"), v, { filename: absSrc(rel) });
  }
  return { v, contexts, bag, fire, loadEngine };
}

test("a trusted title gesture primes one AudioContext and the engine adopts it (#6448)", () => {
  const { v, contexts, bag, fire, loadEngine } = bootPrimer();
  assert.equal(fire("pointerup", false), 1, "the activation listener is armed");
  assert.equal(contexts.length, 0, "an untrusted event does not construct a context");
  assert.equal(bag.resumeSync, 0, "an untrusted event does not resume");
  assert.equal(fire("pointerup", true), 1);
  assert.equal(contexts.length, 1, "one primer AudioContext created inside the trusted gesture");
  assert.equal(bag.resumeSync, 1, "resume() ran synchronously before the gesture handler returned");
  assert.equal(contexts[0].state, "running");
  const primed = contexts[0];
  loadEngine();
  const A = v.GameAudio;
  assert.equal(A._stub, undefined, "engine.js replaced the stub");
  A.init();
  assert.equal(contexts.length, 1, "createCtx adopted the primer instead of constructing a second context");
  assert.equal(A.context(), primed);
  assert.equal(bag.resumeTotal, 1, "adoption did not resume a second time");
  A.initOffline({ seconds: 0.05 });
  assert.equal(contexts.length, 2, "the offline path builds its own context");
  assert.equal(A.context() === primed, false, "offline render does not keep the live primer");
  assert.equal(contexts[1].offline, true);
});

test("a closed primer is left behind and createCtx builds a new context (#6448)", () => {
  const { v, contexts, fire, loadEngine } = bootPrimer();
  fire("touchend", true);
  assert.equal(contexts.length, 1);
  contexts[0].close();
  loadEngine();
  v.GameAudio.init();
  assert.equal(contexts.length, 2, "a closed primer is not adopted");
  assert.equal(v.GameAudio.context() === contexts[1], true);
  assert.equal(contexts[0].state, "closed");
});

test("the SOUND button primes inside the click, before ensure() settles (#6448)", () => {
  const { v, contexts, bag } = bootPrimer();
  const btn = { textContent: "SOUND OFF", setAttribute() {}, onclick: null };
  v.__btn = btn;
  vm.runInContext(`
    AudioPanel._ensure = () => new Promise(() => {});
    AudioPanel.create({ els: { soundbtn: __btn }, store: { set() {} }, soundOn: false });
  `, v, { filename: absSrc("js/audio/stub.js") });
  bag.inGesture = true;
  btn.onclick();
  bag.inGesture = false;
  assert.equal(contexts.length, 1, "stubClick constructed the primer before ensure()");
  assert.equal(bag.resumeSync, 1, "resume() ran synchronously inside the click");
  assert.equal(btn.textContent, "SOUND OFF", "the SOUND ON label still waits for the real panel");
});

test("no primer is created when AudioContext is unavailable (#6448)", () => {
  const { contexts, fire } = bootPrimer({ audio: false });
  assert.equal(fire("click", true), 1);
  assert.equal(contexts.length, 0);
  assert.equal(fire("keydown", true), 1);
  assert.equal(contexts.length, 0);
});

// OFFLINE RENDER GATE. GameAudio leaves the stub when engine.js lands, but
// LAZY_AUDIO keeps evaluating and onAudioReady runs its parts in later yielded
// tasks; tests/specs/engine-audio-offline.spec.js, gated on !_stub, had them land
// on its OfflineAudioContext mid-render on a slow runner (Pages 45917673481 on
// f0584547: rev=0.25 f0=243 vs scheduled 272.48). The render is a pure function
// of the schedule only once apex:audio:ready, marked after the last bundle step
// with no yield after it, has fired; every offline spec waits for it.
test("offline render specs wait for apex:audio:ready, marked after the last audio bundle step", async () => {
  const bundles = src("js/core/lazy-bundles.js");
  const at = bundles.indexOf('audioMark("apex:audio:ready")');
  const before = bundles.slice(bundles.indexOf("function ensureAudio()"), at);
  const after = bundles.slice(at, bundles.indexOf("return audioLoad;", at));
  const steps = ["loadBackendScripts(AUDIO_FILES", "deps.onAudioReady(", "audioReadyOnce(key, fn)", "CrowdAudio.bind(", "audioHooked = true"];
  assert.deepEqual({ at: at > 0, missing: steps.filter((s) => !before.includes(s)), yieldAfter: /await\b/.test(after) },
    { at: true, missing: [], yieldAfter: false }, "apex:audio:ready follows every bundle step and nothing yields after it");
  const { readdirSync } = await import("fs");
  const specs = readdirSync(path.join(ROOT, "tests/specs")).filter((f) => f.endsWith(".js"))
    .map((f) => [f, src("tests/specs/" + f)]).filter(([, s]) => s.includes("GameAudio.initOffline("));
  const bad = specs.filter(([, s]) => {
    const gate = s.indexOf('getEntriesByName("apex:audio:ready")');
    return !(gate > 0 && gate < s.indexOf("GameAudio.initOffline("));
  }).map(([f]) => f);
  assert.deepEqual({ found: specs.some(([f]) => f === "engine-audio-offline.spec.js"), bad },
    { found: true, bad: [] }, "every spec that builds an offline graph first waits for apex:audio:ready (not merely !GameAudio._stub)");
});
