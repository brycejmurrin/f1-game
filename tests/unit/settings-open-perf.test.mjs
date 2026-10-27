/* settings-open-perf.test.mjs — D·IP2: Settings open must not one-shot
 * LAZY_AUDIO eval; MenuSheetGate defers menuIdle / parks warm frames while
 * #pmsettings is open; SettingsNav / ScrollFade emit / coalesce so a phone
 * hitch budget can be asserted.
 * Run: node --test tests/unit/settings-open-perf.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { makeDom } from "../helpers/mini-dom.mjs";
import { absSrc } from "../helpers/abs-src.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");
const manifest = createRequire(import.meta.url)("../../tools/manifest.cjs");

test("SettingsNav.show marks apex:settings:show and apex:settings:shown", () => {
  const marks = [];
  const source = read("js/ui/settings-tabs.js").replace(/^const SettingsNav/m, "var SettingsNav");
  const dom = makeDom();
  dom.byId("audioset"); dom.byId("pm-audio"); dom.byId("pm-settings-index"); dom.byId("dlg-settings");
  const ctx = vm.createContext({
    document: dom.document, window: {},
    performance: { mark: (n) => marks.push(n) },
    setTimeout: (fn) => { fn(); return 1; }, clearTimeout() {},
    Log: { info() {}, warn() {} },
    GameAudio: { _stub: false },
  });
  vm.runInContext(source, ctx, { filename: absSrc("js/ui/settings-tabs.js") });
  ctx.SettingsNav.create(null, () => {});
  assert.ok(marks.includes("apex:settings:show"), "initial home show marks start");
  assert.ok(marks.includes("apex:settings:shown"), "initial home show marks end");
  marks.length = 0;
  ctx.SettingsNav.show("controls", false);
  assert.deepEqual(marks.filter((m) => m.startsWith("apex:settings:")), [
    "apex:settings:show", "apex:settings:shown",
  ]);
});

test("SettingsNav.show skips ScrollFade.refresh while the sheet is hidden", () => {
  const timers = [];
  let refreshes = 0;
  const dom = makeDom();
  const sheet = dom.byId("pmsettings");
  sheet.hidden = true;
  dom.byId("audioset"); dom.byId("pm-audio"); dom.byId("pm-settings-index"); dom.byId("dlg-settings");
  const ctx = vm.createContext({
    document: dom.document,
    window: { ScrollFade: { refresh() { refreshes++; } } },
    performance: { mark: () => {} },
    setTimeout: (fn, ms) => { timers.push({ fn, ms }); return timers.length; },
    clearTimeout(id) { if (id) timers[id - 1] = null; },
    Log: { info() {}, warn() {} },
  });
  vm.runInContext(read("js/ui/settings-tabs.js").replace(/^const SettingsNav/m, "var SettingsNav"), ctx, { filename: absSrc("js/ui/settings-tabs.js") });
  ctx.SettingsNav.create(null, () => {});
  ctx.SettingsNav.show("controls", false);
  assert.equal(timers.length, 0, "hidden sheet (boot and openSettings before unhide) does not arm refresh");
  assert.equal(refreshes, 0);
  sheet.hidden = false;
  ctx.SettingsNav.show("display", false);
  assert.equal(timers.length, 1);
  assert.equal(timers[0].ms, 48);
  timers[0].fn();
  assert.equal(refreshes, 1, "an in-sheet page change still refreshes once");
});

test("ensureAudio loads LAZY_AUDIO one file at a time while Settings is open", async () => {
  const loaderSrc = read("js/core/script-loader.js");
  const bundlesSrc = read("js/core/lazy-bundles.js");
  const files = ["js/audio/engine.js", "js/audio/panel.js"];
  const injected = [];
  const marks = [];
  // Settings hub open → settingsUiHot → loadAudioSerial (cold boot stays bulk).
  const pmsettings = { hidden: false };
  const ctx = vm.createContext({
    console, Promise, setTimeout, clearTimeout, queueMicrotask,
    ApexRoster: {
      DEFERRED: {}, DEFERRED_EDGES: [], LAZY_AGENT: [], LAZY_EDGES: [], LAZY_RACE: [],
      LAZY_RACE_SESSION: [], LAZY_RACE_SESSION_EDGES: [],
      LAZY_AUDIO: files,
      LAZY_AUDIO_EDGES: [["js/audio/engine.js", "js/audio/panel.js"]],
      LAZY_TRACK_BUILD: [], LAZY_TRACK_BUILD_EDGES: [],
      LAZY_DATA: [], LAZY_DATA_EDGES: [], LAZY_NET: [], LAZY_NET_EDGES: [],
      SCENERY_DIR: "js/circuits/scenery",
    },
    localStorage: { getItem() { return null; } },
    // Not game-vm: yields run (setTimeout 0 / 16) so serial awaits between files.
    navigator: { userAgent: "Mozilla/5.0" },
    location: { search: "", hostname: "example.com" },
    performance: { mark: (n) => marks.push(n) },
    Log: { warn() {}, info() {}, error() {} },
    els: {},
    GameAudio: { _stub: true, init() {}, setEnabled() {}, setMusicVolume() {}, setSfxVolume() {} },
    AudioPanel: { _stub: true, create() { return { init() {} }; } },
  });
  ctx.window = ctx;
  let inflight = 0, maxInflight = 0;
  ctx.document = {
    getElementById: (id) => (id === "pmsettings" ? pmsettings : null),
    activeElement: null,
    createElement() { return { dataset: {}, remove() {} }; },
    head: {
      appendChild(el) {
        if (el.rel === "preload" || el.rel === "prefetch") return;
        const rel = el.src.replace(/\?.*$/, "");
        injected.push(rel);
        inflight++;
        maxInflight = Math.max(maxInflight, inflight);
        setTimeout(() => {
          if (rel.endsWith("engine.js")) {
            ctx.GameAudio = { _stub: false, init() {}, setEnabled() {}, setMusicVolume() {}, setSfxVolume() {} };
          }
          if (rel.endsWith("panel.js")) {
            ctx.AudioPanel = { create() { return { init() {} }; } };
          }
          inflight--;
          el.onload();
        }, 0);
      },
    },
  };
  let readyHooks = 0;
  vm.runInContext(
    `${loaderSrc}\n${bundlesSrc}\nthis.ScriptLoader = ScriptLoader; this.LazyBundles = LazyBundles;`,
    ctx,
    { filename: absSrc("js/core/lazy-bundles.js") },
  );
  const sl = ctx.ScriptLoader.create();
  const lb = ctx.LazyBundles.create({
    els: {}, loadBackendScripts: sl.load, getContext: () => ({}),
    onAudioReady() { readyHooks++; },
  });
  assert.equal(await lb.ensureAudio(), true);
  assert.equal(readyHooks, 1);
  assert.deepEqual(injected, files, "both audio files inject");
  assert.equal(maxInflight, 1, "never two audio scripts evaluating at once under open Settings");
  assert.ok(marks.filter((m) => m === "apex:audio:chunk").length >= 2, "a mark per chunk");
  assert.ok(marks.includes("apex:settings:audio-deferred"));
  assert.ok(marks.includes("apex:audio:ready"));
});

test("ScrollFade skips title overlay regions while Settings is open", () => {
  const timers = [];
  const measured = [];
  const overlay = {
    id: "overlay", closest: (sel) => (sel === "#overlay" ? overlay : sel === "[hidden]" ? null : null),
    clientHeight: 100, clientWidth: 100, scrollHeight: 200, scrollWidth: 100, scrollTop: 0, scrollLeft: 0,
    classList: { toggle() {} }, style: { setProperty() {}, removeProperty() {} }, isConnected: true,
  };
  const index = {
    id: "pm-settings-index",
    closest: (sel) => (sel === "#pmsettings" ? pm : sel === "[hidden]" ? null : null),
    clientHeight: 100, clientWidth: 100, scrollHeight: 200, scrollWidth: 100, scrollTop: 0, scrollLeft: 0,
    classList: { toggle() {} }, style: { setProperty() {}, removeProperty() {} }, isConnected: true,
  };
  const pm = { id: "pmsettings", hidden: false };
  const live = [overlay, index];
  const win = { addEventListener() {} };
  const context = {
    Log: { info() {} },
    window: win,
    ResizeObserver: class { observe() {} unobserve() {} },
    MutationObserver: class { observe() {} disconnect() {} },
    document: {
      readyState: "complete",
      addEventListener() {},
      getElementById: (id) => (id === "pmsettings" ? pm : null),
      querySelectorAll: (sel) => (/hidden/.test(String(sel)) ? [] : live.slice()),
    },
    getComputedStyle: () => ({ overflowY: "auto", overflowX: "visible", paddingRight: "0" }),
    setTimeout: (fn) => { timers.push(fn); return timers.length; },
    clearTimeout() {},
  };
  // Intercept measure via clientHeight reads that paintAll always does.
  const wrap = (el) => {
    let h = el.clientHeight;
    Object.defineProperty(el, "clientHeight", {
      get() { measured.push(el.id); return h; },
    });
  };
  wrap(overlay); wrap(index);
  context.globalThis = context;
  vm.createContext(context);
  vm.runInContext(read("js/ui/scroll-fade.js"), context, { filename: absSrc("js/ui/scroll-fade.js") });
  const drain = () => { while (timers.length) timers.shift()(); };
  drain();
  measured.length = 0;
  assert.ok(win.ScrollFade, "ScrollFade exported on window");
  win.ScrollFade.refresh();
  drain();
  assert.ok(!measured.includes("overlay"), "title overlay not measured under open Settings");
  assert.ok(measured.includes("pm-settings-index"), "settings index still measured");
});

test("select-screen vt skips startViewTransition on coarse pointer (phone)", () => {
  const dom = makeDom();
  let vtCalls = 0;
  const sb = {
    Math, console, Object, Array, Number, String, JSON, Map, Set, Promise, Date, parseFloat, parseInt, isFinite,
    Log: { info() {}, warn() {}, debug() {}, error() {}, enabled: () => false },
    document: Object.assign(dom.document, {
      startViewTransition(run) { vtCalls++; run(); return { ready: Promise.resolve(), finished: Promise.resolve(), updateCallbackDone: Promise.resolve() }; },
      documentElement: { dataset: { motion: "on" } },
    }),
    matchMedia: (q) => ({ matches: /pointer:\s*coarse|hover:\s*none/.test(q) }),
    addEventListener() {}, removeEventListener() {},
    setTimeout: (fn) => { fn(); return 1; }, clearTimeout() {},
    getComputedStyle: () => ({ getPropertyValue: () => "", display: "flex", flexDirection: "row", gridTemplateColumns: "none", paddingTop: "0px", paddingBottom: "0px" }),
    innerWidth: 844, innerHeight: 390, requestAnimationFrame: () => 0,
    Tracks: { LIST: [{ id: "monza", name: "Monza", country: "Italy" }] },
    Teams: { LIST: [{ id: "ferrari", name: "Ferrari", color: [1, 0, 0], color2: [1, 1, 1], drivers: [{ name: "A", code: "AAA", num: 1 }] }] },
    Flags: { svg: () => "" },
    AppearanceOpts: { applyAll() {} },
    SeasonCal: { canRace: () => true, rounds: () => 0 },
    TrackMaps: { corners: () => [], direction: () => "CW", elevRange: () => 0, drsZones: () => [], aspect: () => 1.5, elevProfile: () => null, fitCanvas: () => ({ w: 100, h: 60 }), draw() {} },
  };
  sb.window = sb;
  vm.runInNewContext(read("js/ui/select-screen.js").replace(/^const\b/gm, "var"), sb, { filename: absSrc("js/ui/select-screen.js") });
  const $ = (id) => dom.byId(id);
  const G = {
    $, store: { get: (_k, d) => d, set() { return true; }, subscribe: () => () => {}, broken: null, rev: 0 },
    cssCol: () => "#000", fmtTime: String, ttBoard: () => [], tickUi() {}, scheduleFlybyTrack() {},
    getLiveryId: () => "default", getLiveries: (t) => [{ id: "default", c1: t.color, c2: t.color2 }],
    els: {
      select: $("select"), selTracks: $("sel-tracks"), selGo: $("sel-go"), selTitle: $("sel-title"),
      selTrackSection: $("sel-track-section"), selCircuitLabel: $("sel-circuit-label"),
      selPreviewMap: $("sel-preview-map"), selPreviewName: $("sel-preview-name"), selPreviewGp: $("sel-preview-gp"),
      selPreviewMeta: $("sel-preview-meta"), selPreviewRec: $("sel-preview-rec"), selTeams: $("sel-teams"),
    },
    trackIdx: 0, teamIdx: 0, driverIdx: 0, timeTrial: false, seasonMode: false, netRoom: false, daily: null, soundOn: false,
    announce() {}, buildSetup() {},
  };
  const menus = sb.Menus.create(G);
  let ran = false;
  menus.vt(() => { ran = true; });
  assert.equal(ran, true, "update runs immediately");
  assert.equal(vtCalls, 0, "no view-transition snapshot on a phone pointer");
});

test("MenuSheetGate.idle defers while Settings is open", async () => {
  const marks = [];
  const dom = {
    getElementById: (id) => (id === "pmsettings" ? { hidden: false } : null),
    activeElement: null,
  };
  const ctx = vm.createContext({
    performance: { now: () => 1000, mark: (n) => marks.push(n) },
    setTimeout: (fn) => { fn(); return 1; },
    document: dom,
    Object, Promise, WeakMap,
  });
  vm.runInContext(read("js/core/menu-sheet-gate.js"), ctx, { filename: absSrc("js/core/menu-sheet-gate.js") });
  const Gate = vm.runInContext("MenuSheetGate", ctx);
  assert.equal(Gate.open(dom), true);
  let ticks = 0;
  const current = () => (++ticks) < 4;
  const done = await Gate.idle(current, 0, () => 0, () => Promise.resolve());
  assert.equal(done, false, "abandons when current() goes false under an open sheet");
  assert.ok(marks.includes("apex:menu-prep:deferred"), "marks deferred prep while sheet open");
  dom.getElementById = () => null;
  ticks = 0;
  assert.equal(await Gate.idle(() => true, 0, () => 0, () => Promise.resolve()), true);
});

test("MenuSheetGate.open ignores door focus once the sheet is hidden (review F4)", () => {
  const sheet = { hidden: true };
  const dom = {
    getElementById: (id) => (id === "pmsettings" ? sheet : null),
    activeElement: { id: "mb-settings" },
  };
  const ctx = vm.createContext({
    performance: { mark() {} },
    setTimeout: (fn) => { fn(); return 1; },
    document: dom,
    Object, Promise, WeakMap, MutationObserver: class { observe() {} disconnect() {} },
  });
  vm.runInContext(read("js/core/menu-sheet-gate.js"), ctx, { filename: absSrc("js/core/menu-sheet-gate.js") });
  const Gate = vm.runInContext("MenuSheetGate", ctx);
  assert.equal(Gate.open(dom), false, "closed sheet + door focus is not open");
  sheet.hidden = false;
  assert.equal(Gate.open(dom), true, "visible sheet is open");
  const gate = { warm: 3, garageWarm: 0 };
  Gate.parkWarm(gate);
  assert.equal(gate.warm, 0);
  // Simulate close: sheet hides while focus stays on the door — must resume.
  sheet.hidden = true;
  let sync = null;
  class MO {
    constructor(fn) { sync = fn; }
    observe() {}
    disconnect() {}
  }
  ctx.MutationObserver = MO;
  const unwatch = Gate.watch(gate, { document: dom });
  assert.equal(typeof unwatch, "function");
  // watch() parks if already open; sheet is hidden so it should not park.
  assert.equal(gate.warm, 0);
  // Open then close via observer sync.
  sheet.hidden = false;
  sync();
  assert.equal(gate.warm, 0);
  assert.ok(Gate.parkedWarm(gate));
  sheet.hidden = true;
  sync();
  assert.equal(gate.warm, 3, "resumeWarm restores counters after close despite door focus");
  assert.equal(Gate.parkedWarm(gate), null);
  unwatch();
});

test("MenuSheetGate.parkWarm holds menu warm counters until resume", () => {
  const marks = [];
  const ctx = vm.createContext({
    performance: { mark: (n) => marks.push(n) },
    setTimeout: (fn) => { fn(); return 1; },
    document: { getElementById: () => null, activeElement: null },
    Object, Promise, WeakMap,
  });
  vm.runInContext(read("js/core/menu-sheet-gate.js"), ctx, { filename: absSrc("js/core/menu-sheet-gate.js") });
  const Gate = vm.runInContext("MenuSheetGate", ctx);
  const gate = { warm: 2, garageWarm: 1 };
  assert.equal(Gate.parkWarm(gate), true);
  assert.equal(gate.warm, 0);
  assert.equal(gate.garageWarm, 0);
  const held = Gate.parkedWarm(gate);
  assert.equal(held.warm, 2);
  assert.equal(held.garageWarm, 1);
  assert.ok(marks.includes("apex:menu-prep:parked"));
  assert.equal(Gate.resumeWarm(gate), true);
  assert.equal(gate.warm, 2);
  assert.equal(gate.garageWarm, 1);
  assert.ok(marks.includes("apex:menu-prep:resume"));
  assert.equal(Gate.parkedWarm(gate), null);
});

test("game.js menuIdle routes through MenuSheetGate (no inline idle loop)", () => {
  const src = read("js/game.js");
  assert.ok(src.includes("MenuSheetGate.idle(") && src.includes("MenuSheetGate.slice("));
  assert.ok(/async function menuIdle\(current\)\s*\{\s*return MenuSheetGate\.idle/.test(src),
    "thin menuIdle wrapper delegates to MenuSheetGate");
});

// Silence unused in case a future assert wants the roster length.
assert.ok(manifest.LAZY_AUDIO.length >= 2);
