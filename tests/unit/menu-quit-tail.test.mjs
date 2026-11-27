/* menu-quit-tail.test.mjs — MenuQuitTail.afterOverlay only needs the deps it reads.
 *
 * Run: node --test tests/unit/menu-quit-tail.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import { absSrc } from "../helpers/abs-src.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const SRC = readFileSync(join(ROOT, "js/perf/menu-quit-tail.js"), "utf8");

function load() {
  const calls = { setFlow: [], consume: 0, career: 0, tyre: null };
  const docEl = { dataset: { team: "mclaren" } };
  const ctx = {
    Object, Array, String, RegExp, location: { hash: "" },
    document: { documentElement: docEl },
    MenuTeardown: undefined,
  };
  const MenuQuitTail = vm.runInNewContext(SRC + "\n;MenuQuitTail", ctx, {
    filename: absSrc("js/perf/menu-quit-tail.js"),
  });
  const deps = {
    _doc: docEl,
    mirrorPass: { cancelPreparation() { calls.mirror = true; } },
    stormFx: { _ltNextT: 1, _thunderT: 2 },
    setFlow(v) { calls.setFlow.push(v); },
    session: "quali",
    tyres: { setLevel(v) { calls.tyre = v; } },
    raceTyreWear: 0.4,
    IncidentSim: { reset() { calls.inc = true; } },
    DebrisWorld: { reset() { calls.deb = true; } },
    SeasonCal: { load() { return { round: 0 }; }, hasProgress() { return false; }, rounds() { return 24; } },
    season: null,
    $() { return { hidden: true }; },
    refreshCareerButton() { calls.career++; },
    CustomTracks: { consumeTrackHash() { calls.consume++; } },
    ensureNet() { return Promise.resolve(false); },
    netLobby: { openFromUrl() {} },
  };
  MenuQuitTail.wire(deps);
  return { MenuQuitTail, deps, calls };
}

test("afterOverlay resets session flow without needing forgetGp or unused wire fields", () => {
  const { MenuQuitTail, deps, calls } = load();
  assert.equal("team" in deps._doc.dataset, true);
  MenuQuitTail.afterOverlay("ignored");
  assert.equal(calls.mirror, true);
  assert.equal(deps.stormFx._ltNextT, 0);
  assert.equal(deps.stormFx._thunderT, -1);
  assert.deepEqual(calls.setFlow, ["gp"]);
  assert.equal(deps.session, "race");
  assert.equal(calls.tyre, 0.4);
  assert.equal(calls.inc, true);
  assert.equal(calls.deb, true);
  assert.equal(calls.consume, 1);
  assert.equal(calls.career, 1);
  assert.equal("team" in deps._doc.dataset, false);
});

// MenuTeardown (js/perf/menu-teardown.js): endQuit releases QUIT two frames later. A new quit inside that
// window must keep its own QUIT bit, or software GL loses the readback cover mid-quit (#4550 B6 finding 2).
test("MenuTeardown: a stale endQuit release does not clear a newer quit's cover", () => {
  const raf = [];
  const ctx = {
    PerfGov: { softwareRaster: () => true },
    requestAnimationFrame: (fn) => raf.push(fn),
    setTimeout: () => 1, clearTimeout: () => {},
    performance: { now: () => 0 },
    document: { getElementById: () => null },
  };
  const MT = vm.runInNewContext(readFileSync(join(ROOT, "js/perf/menu-teardown.js"), "utf8") + "\n;MenuTeardown", ctx,
    { filename: absSrc("js/perf/menu-teardown.js") });
  const flush = () => { while (raf.length) raf.shift()(); };
  MT.beginQuit();
  assert.equal(MT.cover(), true);
  MT.endQuit();
  MT.beginQuit();   // a second quit before the two-frame release ran
  flush();
  assert.equal(MT.cover(), true, "the second quit keeps its QUIT bit");
  assert.equal(MT.quitReadbackDefer(), true);
  MT.endQuit();
  flush();
  assert.equal(MT.cover(), false, "its own endQuit still releases");
});

// quitToMenu(then) (F1 of RUNTIME-HUNT-MODES-2026-11-25): on software GL the tail is deferred, and `then`
// runs only once the tail and endQuit have, so a screen opened from it is not reset to flow "gp" by the tail.
test("MenuTeardown.deferQuitTail runs its continuation after the deferred tail", () => {
  const raf = [], timers = [], order = [];
  const ctx = {
    PerfGov: { softwareRaster: () => true },
    requestAnimationFrame: (fn) => raf.push(fn),
    setTimeout: (fn) => timers.push(fn), clearTimeout: () => {},
    performance: { now: () => 0 },
    document: { getElementById: () => null },
  };
  const MT = vm.runInNewContext(readFileSync(join(ROOT, "js/perf/menu-teardown.js"), "utf8") + "\n;MenuTeardown", ctx,
    { filename: absSrc("js/perf/menu-teardown.js") });
  MT.beginQuit();
  assert.equal(MT.deferQuitTail(() => order.push("tail"), () => order.push("then")), true);
  assert.deepEqual(order, [], "nothing runs in the click's task");
  while (raf.length || timers.length) { while (raf.length) raf.shift()(); while (timers.length) timers.shift()(); }
  assert.deepEqual(order, ["tail", "then"]);
});

// #6713: the Aero Lab drill's restore() runs BEFORE this tail, so the tail's gp/race reset overwrote the
// player's flow. keepFlow is one-shot: it shapes the next quit only, and every other quit keeps gp/race.
test("keepFlow: the next quit restores the kept flow/session, later quits reset to gp/race", () => {
  const { MenuQuitTail, deps, calls } = load();
  MenuQuitTail.keepFlow("career", "quali");
  deps.session = "race";
  MenuQuitTail.afterOverlay();
  assert.deepEqual(calls.setFlow, ["career"]);
  assert.equal(deps.session, "quali");
  MenuQuitTail.afterOverlay();
  assert.deepEqual(calls.setFlow, ["career", "gp"], "a plain quit after it is unchanged");
  assert.equal(deps.session, "race");
});

function element() {
  return { hidden: false, width: 0, height: 0, setAttribute() {}, append() {}, remove() {}, getContext: () => null };
}

test("Aero Lab drill: quitting returns the player to the flow and session they came from (#6713)", () => {
  const { MenuQuitTail, deps, calls } = load();
  const path = join(ROOT, "js/ui/learn-door.js");
  const levels = [];
  const ctx = {
    document: { createElement: element, body: { append() {} } },
    window: { matchMedia: () => ({ matches: false }) },
    DrivingLine: { STRIDE: 8 },
    Tracks: { LIST: [{ id: "bahrain" }, { id: "monza" }] },
    Wind: { level: () => levels.at(-1) ?? "calm", setLevel: (v) => levels.push(v) },
    UiExperience: { leavePracticePick() {} },
    Float32Array, MenuQuitTail,
  };
  const DrillRegistry = vm.runInNewContext(readFileSync(join(ROOT, "js/learn-drills/registry.js"), "utf8") + "\n;DrillRegistry", ctx, { filename: absSrc("js/learn-drills/registry.js") });
  ctx.DrillRegistry = DrillRegistry;
  ctx.AeroDrill = vm.runInNewContext(readFileSync(join(ROOT, "js/learn-drills/aero.js"), "utf8") + "\n;AeroDrill", ctx, { filename: absSrc("js/learn-drills/aero.js") });
  vm.runInNewContext(readFileSync(path, "utf8") + "\n;LearnDoor", ctx, { filename: absSrc("js/ui/learn-door.js") }).defineDrills();
  let goal = "none";
  const G = {
    state: "menu", netPlay: { active: () => false },
    flow: "career", session: "quali", trackIdx: 0, raceWeather: "wet", raceChangeable: true, raceGrid: "real",
    duel: true, raceDirtyAir: "modern",
    coach: { practiceGoal: () => goal, setPracticeGoal: (v) => { goal = v; } },
    startRace() { this.started = { flow: this.flow, session: this.session }; },
  };
  // The wired tail drives game.js's setFlow / session, which G.flow / G.session read in game.
  deps.setFlow = (v) => { calls.setFlow.push(v); G.flow = v; };
  Object.defineProperty(deps, "session", { get: () => G.session, set: (v) => { G.session = v; } });
  const drills = DrillRegistry.create(G, { setDirtyAir: () => {} });
  drills.launch("aero");
  assert.deepEqual(G.started, { flow: "gp", session: "race" }, "the drill races a GP");
  // quitToMenu: the host's end() restores first, then the (possibly deferred) tail.
  drills.end("quit");
  MenuQuitTail.afterOverlay();
  assert.equal(G.flow, "career");
  assert.equal(G.session, "quali");
  assert.deepEqual(calls.setFlow, ["career"], "the tail sets the player's flow, not gp");
});

test("keepFlow: a quit that throws before quit-session still consumes the kept flow", () => {
  const { MenuQuitTail, deps, calls } = load();
  MenuQuitTail.keepFlow("career", "quali");
  deps.mirrorPass = { cancelPreparation() { throw new Error("boom"); } };
  assert.throws(() => MenuQuitTail.afterOverlay());
  deps.mirrorPass = { cancelPreparation() {} };
  MenuQuitTail.afterOverlay();
  assert.deepEqual(calls.setFlow, ["gp"]);
  assert.equal(deps.session, "race");
});
