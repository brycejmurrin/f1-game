/* race-session-lazy.test.mjs — LAZY_RACE_SESSION stub + ensureRaceSession. */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "fs";
import { createRequire } from "module";
import { fileURLToPath } from "url";
import path from "path";
import vm from "vm";
import { absSrc } from "../helpers/abs-src.mjs";
import { symbolSource } from "../helpers/game-source.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const require = createRequire(import.meta.url);
const src = (rel) => readFileSync(path.join(ROOT, rel), "utf8");

test("manifest keeps session-stub on FULL and pit-lane in LAZY_RACE_SESSION", () => {
  const m = require("../../tools/manifest.cjs");
  assert.ok(m.FULL.includes("js/race/session-stub.js"));
  assert.ok(!m.FULL.includes("js/race/pit-lane.js"));
  assert.ok(m.LAZY_RACE_SESSION.includes("js/race/pit-lane.js"));
  assert.ok(m.LAZY_RACE_SESSION.includes("js/race/race-radio.js"));
  assert.ok(m.FULL.includes("js/race/driving-coach.js"), "coach stays FULL for UiExperience");
});

test("session stub installs PitLane/Reliability and create() is inert", () => {
  const sb = {
    console,
    Log: { info() {}, warn() {}, debug() {} },
  };
  vm.runInNewContext(src("js/race/session-stub.js"), sb, { filename: absSrc("js/race/session-stub.js") });
  assert.equal(sb.PitLane._stub, true);
  assert.ok(sb.Reliability.isLevel("off"));
  assert.equal(sb.Reliability.isLevel("nope"), false);
  const pits = sb.PitLane.create({});
  assert.equal(pits.inLane({}), false);
  assert.equal(pits.laneUniform(), null);
  // RaceSettings.buildRaceSettings / wireRaceSettings (menu, before ensure).
  assert.equal(pits.pinnedStops(), null);
  assert.equal(typeof pits.setPinnedStops, "function");
  assert.equal(pits.lossS(), 0);
  const radio = sb.RaceRadio.create({});
  assert.equal(radio.callsResult(), false);
  assert.equal(radio.chat(), "normal");
  assert.equal(radio.comm(), "tv");
  assert.equal(sb.Damage.blank().hits, 0);
});

test("ensureRaceSession reinjects real PitLane and calls onRaceSessionReady", async () => {
  const loader = src("js/core/script-loader.js");
  const bundles = src("js/core/lazy-bundles.js");
  const loaded = [];
  const ctx = vm.createContext({
    ApexRoster: {
      DEFERRED: {}, DEFERRED_EDGES: [], LAZY_AGENT: [], LAZY_EDGES: [],
      LAZY_RACE: [], LAZY_RACE_SESSION: ["js/race/pit-lane.js"], LAZY_RACE_SESSION_EDGES: [],
      LAZY_AUDIO: [], LAZY_AUDIO_EDGES: [],
      SCENERY_DIR: "", LAZY_SCENERY: [], LAZY_DATA: [], LAZY_DATA_EDGES: [],
      LAZY_NET: [], LAZY_NET_EDGES: [],
    },
    window: { __APEX_BUILD: "test" },
    PitLane: { _stub: true, create: () => ({ _stub: true }) },
    Tracks: { LIST: [], circuitPayloadResident: () => true, hydrate: () => true },
    Log: { warn() {}, info() {} },
    els: {},
    __ready: 0,
    queueMicrotask: (fn) => queueMicrotask(fn),
    requestIdleCallback() { return 1; },
    setTimeout() {},
    document: {
      createElement() { return { dataset: {}, remove() {} }; },
      head: { appendChild(node) {
        loaded.push(node.src);
        // Simulate reinjection: drop stub flag.
        ctx.PitLane = { _stub: false, create: () => ({ real: true }) };
        queueMicrotask(() => node.onload());
      } },
    },
  });
  vm.runInContext(loader + "\n" + bundles + `
    const lb = LazyBundles.create({
      els, loadBackendScripts: ScriptLoader.create().load,
      getContext: () => ({}),
      applyLightTuneIfReady() {},
      bindAgent() {}, createNetwork() { return { wire() {} }; },
      onAudioReady() {},
      onRaceSessionReady() { __ready++; },
    });
    globalThis.__ensure = lb.ensureRaceSession;
  `, ctx);
  const ok = await ctx.__ensure();
  assert.equal(ok, true);
  assert.equal(ctx.__ready, 1);
  assert.equal(ctx.PitLane._stub, false);
  assert.ok(loaded.some((u) => String(u).includes("pit-lane.js")));
});

// #2625: a never-resolving file makes ScriptLoader call onSlow; the loading card's line changes.
test("ensureRaceSession slow load shows SLOW CONNECTION on the loading card", async () => {
  const loader = src("js/core/script-loader.js"), bundles = src("js/core/lazy-bundles.js"), card = src("js/ui/loading-card.js"), screen = src("js/ui/loading-screen.js");
  const gp = { textContent: "Please wait" }, root = { hidden: false };
  const ctx = vm.createContext({
    ApexRoster: { DEFERRED: {}, DEFERRED_EDGES: [], LAZY_AGENT: [], LAZY_EDGES: [], LAZY_RACE: [],
      LAZY_RACE_SESSION: ["js/race/pit-lane.js"], LAZY_RACE_SESSION_EDGES: [], LAZY_AUDIO: [], LAZY_AUDIO_EDGES: [],
      SCENERY_DIR: "", LAZY_SCENERY: [], LAZY_DATA: [], LAZY_DATA_EDGES: [], LAZY_NET: [], LAZY_NET_EDGES: [] },
    window: { __APEX_BUILD: "test", setTimeout, clearTimeout },
    PitLane: { _stub: true }, Tracks: { LIST: [], circuitPayloadResident: () => true, hydrate: () => true },
    Log: { warn() {}, info() {} }, els: {}, queueMicrotask, requestIdleCallback() { return 1; },
    UpdateCheck: { prepareLazyLoad: async () => true, blocksLazyLoad: () => false },
    setTimeout, clearTimeout,
    document: {
      getElementById: (id) => (id === "loading" ? root : id === "ld-gp" ? gp : null),
      createElement: () => ({ dataset: {}, remove() {} }),
      head: { appendChild() { /* never loads */ } },
    },
  });
  vm.runInContext(loader + "\nthis.ScriptLoader = ScriptLoader;\n" + card + "\n" + screen + "\nthis.LoadingScreen = LoadingScreen;", ctx);
  vm.runInContext(bundles + `
    const lb = LazyBundles.create({ els, loadBackendScripts: (f, e, o) => ScriptLoader.create().load(f, e, Object.assign({ slowMs: 30, deadlineMs: 5000 }, o)), getContext() {}, onRaceSessionReady() {} });
    globalThis.__ensure = lb.ensureRaceSession;`, ctx);
  void ctx.__ensure();
  await new Promise((r) => setTimeout(r, 120));
  assert.equal(gp.textContent, "SLOW CONNECTION — still loading…");
});

// #2625: on failure the card offers Retry and Back to menu.
test("LoadingScreen.failed shows Retry + Back to menu and resolves the choice", async () => {
  const screen = src("js/ui/loading-card.js") + "\n" + src("js/ui/loading-screen.js");
  const mk = () => {
    const els = {}, mkEl = () => { const e = { children: [], listeners: {}, textContent: "", appendChild(c) { e.children.push(c); }, remove() { e.removed = true; }, addEventListener(t, f) { e.listeners[t] = f; } }; return e; };
    els.loading = { hidden: false }; els["ld-gp"] = mkEl(); els["ld-text"] = mkEl();
    const ctx = vm.createContext({ document: { getElementById: (i) => els[i] || null, createElement: mkEl }, Log: { warn() {} } });
    vm.runInContext(screen + "\nthis.LoadingScreen = LoadingScreen;", ctx);
    return { ctx, els };
  };
  for (const [idx, want] of [[0, "retry"], [1, "back"]]) {
    const { ctx, els } = mk();
    const p = ctx.LoadingScreen.failed();
    const row = els["ld-text"].children[0];
    assert.deepEqual(row.children.map((b) => b.textContent), ["Retry", "Back to menu"]);
    assert.equal(els["ld-gp"].textContent, ctx.LoadingScreen.FAIL_TEXT);
    row.children[idx].listeners.click();
    assert.equal(await p, want);
  }
  const { ctx, els } = mk(); els.loading.hidden = true;
  assert.equal(await ctx.LoadingScreen.failed(), "back");
});

test("startRace retries the race-session load on Retry and quits to menu on Back", () => {
  const g = src("js/game.js");
  assert.match(g, /while \(!sessionOk && !stale\(\) && await LoadingScreen\.failed\(\) === "retry"\) sessionOk = await ensureRaceSession\(\)/);
  assert.match(g, /if \(!sessionOk\) \{ loadingScreen\.stop\(\); quitToMenu\(\)/);
});

// WP-G4 (review 2026-10-27 r2 F4): Career.markWeekendStarted() stamps
// season.startedRound, escrows planning and saves. It ran right after the first
// yield, so a failed session load + BACK, a save conflict or a lost GPU context
// locked the round's brief with no race run. Run the REAL startRaceBody in a VM
// with every dependency stubbed (game-vm UA: no yields) and read the stamp.
function runStartRaceBody({ sessionOk = true, conflict = false, ctxLost = false } = {}) {
  const season = { round: 5 }, log = [];
  const STOP = new Error("past the mark");
  const fn = () => {}, obj = new Proxy({}, { get: (t, k) => (k === "then" ? undefined : fn) });
  const ctx = vm.createContext({
    navigator: { userAgent: "Mozilla/5.0 apex-game-vm" }, window: { LightPresets: {} },
    RaceEntryProfile: obj, LoadingScreen: { failed: async () => "back" }, loadingScreen: obj,
    isCareer: () => true,
    Career: { conflicted: () => conflict, markWeekendStarted() { if (!conflict) season.startedRound = season.round; } },
    ensureRaceSession: async () => sessionOk, ensureAudio: async () => true, ensureLightPresets: async () => true,
    quitToMenu: () => log.push("quitToMenu"), quitToMenuAfterCtxLost: () => log.push("ctxLost"), announce: fn,
    radioVoice: obj, flow: "race", season, SeasonCal: { conflicted: () => false, canRace: () => true },
    resultsCam: obj, RaceCeremony: { resetLive: fn }, _roadReflectionTransition: {}, IncidentSim: obj, raceCtl: obj, wxArc: obj, DebrisWorld: obj,
    banner: obj, raceMessageHistory: null, announcer: {}, hud: {}, _menuGate: {},
    loadTrack: fn, trackIdx: 0, gfxContextLost: () => ctxLost, releaseFieldScratch: () => { throw STOP; },
  });
  vm.runInContext(symbolSource("async function startRaceBody()") + "\nglobalThis.__run = startRaceBody;", ctx, { filename: "vm-slice:startRaceBody" });
  return ctx.__run().then((v) => ({ v, season, log }), (e) => { if (e !== STOP) throw e; return { v: "built", season, log }; });
}

test("startRaceBody locks the career brief only once the session loaded, no conflict and the track built", async () => {
  let r = await runStartRaceBody({ sessionOk: false });
  assert.equal(r.v, false); assert.deepEqual(r.log, ["quitToMenu"]);
  assert.notEqual(r.season.startedRound, r.season.round, "session bundle failed + BACK: no race ran, the brief stays open");
  r = await runStartRaceBody({ conflict: true });
  assert.equal(r.v, false); assert.notEqual(r.season.startedRound, r.season.round, "save conflict: quit before the stamp");
  r = await runStartRaceBody({ ctxLost: true });
  assert.equal(r.v, false); assert.deepEqual(r.log, ["ctxLost"]);
  assert.notEqual(r.season.startedRound, r.season.round, "GPU context lost during the build: no race ran");
  r = await runStartRaceBody();
  assert.equal(r.v, "built"); assert.equal(r.season.startedRound, r.season.round, "a race that reaches makeCars locks the brief");
});
