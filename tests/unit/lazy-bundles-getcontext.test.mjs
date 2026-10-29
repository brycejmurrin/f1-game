/* lazy-bundles-getcontext.test.mjs — getContext before G exists (#3888 race).
 *
 * LazyBundles.create arms capture listeners immediately; if renderer boot aborts
 * before game.js assigns G, deps.getContext() throws ReferenceError on every tap.
 * ctxOrNull() must swallow that, and restoreOnEngine must not latch audioRestored
 * until the store is reachable.
 *
 * Run: node --test tests/unit/lazy-bundles-getcontext.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { absSrc } from "../helpers/abs-src.mjs";

const ROOT = new URL("../../", import.meta.url);
const read = (rel) => readFileSync(new URL(rel, ROOT), "utf8");
const manifest = createRequire(import.meta.url)("../../tools/manifest.cjs");
const loaderSrc = read("js/core/script-loader.js");
const bundlesSrc = read("js/core/lazy-bundles.js");

const tick = () => new Promise((r) => setTimeout(r, 0));

function world({ getContext, globals = {}, roster = {} } = {}) {
  const injected = new Map(), evalErrors = [];
  const ctx = vm.createContext({
    console, Promise, setTimeout, clearTimeout, queueMicrotask, URLSearchParams,
    ApexRoster: {
      DEFERRED: {}, DEFERRED_EDGES: [], LAZY_AGENT: [], LAZY_EDGES: [], LAZY_RACE: [],
      LAZY_RACE_SESSION: [], LAZY_RACE_SESSION_EDGES: [],
      LAZY_AUDIO: manifest.LAZY_AUDIO, LAZY_AUDIO_EDGES: manifest.LAZY_AUDIO_EDGES,
      LAZY_TRACK_BUILD: [], LAZY_TRACK_BUILD_EDGES: [],
      LAZY_DATA: [], LAZY_DATA_EDGES: [], LAZY_NET: [], LAZY_NET_EDGES: [],
      SCENERY_DIR: "js/circuits/scenery", ...roster,
    },
    localStorage: { getItem() { return null; } },
    navigator: { userAgent: "apex-game-vm", userActivation: { hasBeenActive: true } },
    location: { search: "", hostname: "example.com" },
    Log: { warn() {}, info() {}, error() {}, debug() {} },
    els: {},
    TrackBuildProps: { build() {} }, TrackModels: {}, TrackHiddenFaces: {},
    Tracks: { LIST: [{ id: "monza" }], circuitPayloadResident: () => true, hydrate: () => true },
    ...globals,
  });
  ctx.window = ctx;
  const listeners = [];
  ctx.addEventListener = (type, fn, capture) => { listeners.push({ type, fn, capture: !!capture }); };
  ctx.removeEventListener = (type, fn, capture) => {
    const cap = !!capture;
    for (let i = listeners.length - 1; i >= 0; i--) {
      const l = listeners[i];
      if (l.type === type && l.fn === fn && l.capture === cap) listeners.splice(i, 1);
    }
  };
  ctx.dispatchEvent = (ev) => {
    for (const { type, fn, capture } of listeners) {
      if (type === ev.type && capture) fn(ev);
    }
    for (const { type, fn, capture } of listeners) {
      if (type === ev.type && !capture) fn(ev);
    }
    return true;
  };
  ctx.document = {
    createElement() { return { dataset: {}, remove() {} }; },
    head: { appendChild(el) {
      if (el.rel === "prefetch" || el.rel === "preload") return;
      const rel = el.src.replace(/\?.*$/, "");
      injected.set(rel, (injected.get(rel) || 0) + 1);
      setTimeout(() => {
        try { vm.runInContext(el.__body || "", ctx, { filename: absSrc(rel) }); }
        catch (e) { evalErrors.push(rel + ": " + e.message); }
        el.onload();
      }, 0);
    } },
  };
  vm.runInContext(
    loaderSrc + "\n" + bundlesSrc + "\nthis.ScriptLoader = ScriptLoader; this.LazyBundles = LazyBundles;",
    ctx,
    { filename: absSrc("js/core/lazy-bundles.js") },
  );
  const sl = ctx.ScriptLoader.create();
  const lb = ctx.LazyBundles.create({
    els: {},
    loadBackendScripts: (files, edges, opts) => sl.load(files, edges, opts),
    applyLightTuneIfReady() {},
    onAudioReady() {},
    getContext,
  });
  return { ctx, lb, injected, evalErrors };
}

function tdError(name) {
  const err = new ReferenceError("Cannot access '" + name + "' before initialization");
  err.name = "ReferenceError";
  return err;
}

test("audio gesture listeners: getContext ReferenceError does not escape on click/keydown", async () => {
  const w = world({
    getContext: () => { throw tdError("G"); },
    globals: {
      GameAudio: {
        _stub: false,
        init() {},
        context: () => ({ state: "running" }),
      },
    },
  });
  const types = ["click", "keydown", "pointerup", "touchend"];
  for (const type of types) {
    assert.doesNotThrow(() => {
      w.ctx.dispatchEvent({ type, isTrusted: true, key: type === "keydown" ? "a" : undefined });
    }, type);
  }
  await tick();
  assert.deepEqual(w.evalErrors, []);
});

test("restoreOnEngine: a pre-G restore is retried once getContext returns a store", async () => {
  let restoreCalls = 0;
  const store = {
    get(k, def) {
      if (k === "volMusic") return 0.5;
      if (k === "volSfx") return 0.6;
      if (k === "radioFocusDb") return 0;
      if (k === "volRadio") return 0.8;
      return def;
    },
  };
  const G = { soundOn: true, store, camMode: 0, musicEnabled: true, radio: { setVolume() {} } };
  const engineSrc = `
    var GameAudio = {
      _stub: false,
      init() {},
      setEnabled(v) { globalThis.__enabled = v; },
      setMusicVolume() {}, setSfxVolume() {},
      context: () => ({ state: "suspended" }),
    };
  `;
  const panelSrc = "var AudioPanel = { create() {} };";
  const w = world({
    getContext: () => {
      restoreCalls++;
      if (restoreCalls <= 1) throw tdError("G");
      return G;
    },
    globals: {
      GameAudio: { _stub: true, init() {} },
      AudioPanel: { init() {} },
      CamModes: { CAM_MODES: [{ id: "chase" }] },
    },
    roster: {
      LAZY_AUDIO: ["js/audio/engine.js", "js/audio/panel.js"],
      LAZY_AUDIO_EDGES: [["js/audio/engine.js", "js/audio/panel.js"]],
    },
  });
  w.ctx.document.head.appendChild = function append(el) {
    if (el.rel === "prefetch" || el.rel === "preload") return;
    const rel = el.src.replace(/\?.*$/, "");
    el.__body = rel.endsWith("engine.js") ? engineSrc : panelSrc;
    setTimeout(() => {
      vm.runInContext(el.__body, w.ctx, { filename: absSrc(rel) });
      el.onload();
    }, 0);
  };

  assert.equal(await w.lb.ensureAudio(), true);
  assert.equal(w.ctx.__enabled, true, "restore runs once getContext succeeds during load");
  assert.ok(restoreCalls >= 2, "getContext was retried across ready callbacks");
});

test("raceAssets: getContext ReferenceError does not reject the scenery prefetch", async () => {
  const rejections = [];
  const onRej = (e) => rejections.push(String((e && e.reason && e.reason.message) || e));
  process.on("unhandledRejection", onRej);
  try {
    const w = world({
      getContext: () => { throw tdError("G"); },
      globals: { Tracks: { LIST: [{ id: "monza" }], circuitPayloadResident: () => false, hydrate: () => true } },
    });
    w.lb.raceAssets();
    await tick(); await tick(); await tick();
    await new Promise((r) => setTimeout(r, 50));
    assert.deepEqual(rejections, []);
  } finally {
    process.off("unhandledRejection", onRej);
  }
});
