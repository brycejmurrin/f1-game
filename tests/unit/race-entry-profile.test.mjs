/* race-entry-profile.test.mjs — RaceEntryProfile legs, marks, longtask ring.
 *
 * The freeze outside loadTrack is what PERF-OPTIONS-2026-09-16.md measured;
 * this module is the stopwatch that attributes it. Behaviour under test is
 * the profiler itself (would fail before the module existed): begin/lap/mark
 * order, synthetic longtasks sum into blockMs/maxBlockMs, notePresent records
 * warming then ready once, and tickFrame ends the window after ready.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const SRC = fs.readFileSync(path.join(ROOT, "js/perf/race-entry-profile.js"), "utf8");

function load(env = {}) {
  const sandbox = { console, performance: { now: () => env.now ?? 1000 }, ...env };
  sandbox.globalThis = sandbox;
  sandbox.window = sandbox;
  // IIFE assigns `const RaceEntryProfile` — promote to var so the sandbox sees it.
  vm.runInNewContext(SRC.replace(/^const\b/m, "var"), sandbox, { filename: "race-entry-profile.js" });
  return sandbox.RaceEntryProfile;
}

test("legs match the startRaceBody stopwatch shape", () => {
  let t = 1000;
  const P = load({ performance: { now: () => t } });
  P.begin("startRace");
  t = 1010; P.lap("scenery");
  t = 1050; P.lap("resets");
  t = 2050; P.lap("loadTrack");
  const legs = P.legs();
  assert.equal(legs.length, 3);
  assert.equal(legs[0].n, "scenery"); assert.equal(legs[0].ms, 10);
  assert.equal(legs[1].n, "resets"); assert.equal(legs[1].ms, 40);
  assert.equal(legs[2].n, "loadTrack"); assert.equal(legs[2].ms, 1000);
  const snap = P.snapshot().legs;
  assert.equal(snap.length, 3);
  assert.equal(snap[2].n, "loadTrack");
});

test("marks record handoff / warm / present readiness once", () => {
  let t = 0;
  const P = load({ performance: { now: () => t } });
  P.begin("startRace");
  t = 100; P.mark("handoff:raise");
  t = 200; P.notePresent(true);
  t = 250; P.notePresent(true);   // second warming: ignored
  t = 500; P.notePresent(false);
  t = 550; P.notePresent(false);  // second ready: ignored
  const names = P.snapshot().marks.map((m) => m.n);
  assert.ok(names.includes("begin:startRace"));
  assert.ok(names.includes("handoff:raise"));
  assert.equal(names.filter((n) => n === "present:warming").length, 1);
  assert.equal(names.filter((n) => n === "present:ready").length, 1);
});

test("synthetic longtasks feed blockMs and maxBlockMs", () => {
  const P = load();
  P.begin("startRace");
  P._injectTask(400, 10, "self");
  P._injectTask(1200, 50, "self");
  const s = P.snapshot();
  assert.equal(s.blockMs, 1600);
  assert.equal(s.maxBlockMs, 1200);
  assert.equal(s.longTasks.length, 2);
});

test("tickFrame ends the window two frames after present:ready", () => {
  const P = load();
  P.begin("startRace");
  assert.equal(P.armed(), true);
  P.notePresent(false);
  assert.equal(P.armed(), true);
  P.tickFrame();
  assert.equal(P.armed(), true);
  P.tickFrame();
  assert.equal(P.armed(), false);
  assert.ok(P.snapshot().marks.some((m) => m.n === "end"));
});

test("PerformanceObserver longtask entries are recorded when supported", () => {
  let cb = null;
  class FakePO {
    constructor(fn) { cb = fn; }
    observe() {}
    disconnect() { cb = null; }
  }
  FakePO.supportedEntryTypes = ["longtask"];
  const P = load({ PerformanceObserver: FakePO, performance: { now: () => 1000 } });
  P.begin("x");
  assert.equal(P.supported(), true);
  assert.ok(cb);
  cb({
    getEntries: () => [
      { startTime: 1005, duration: 800, name: "self" },
      { startTime: 100, duration: 50, name: "self" }, // before window — dropped
    ],
  });
  const s = P.snapshot();
  assert.equal(s.longTasks.length, 1);
  assert.equal(s.longTasks[0].ms, 800);
  P.end();
  assert.equal(P.armed(), false);
});

test("beginUi + afterPaint + continueWindow keep UI cover marks into startRace", async () => {
  let t = 0;
  const P = load({ performance: { now: () => t } });
  P.beginUi("uiStart");
  assert.equal(P.armed(), true);
  assert.ok(P.snapshot().marks.some((m) => m.n === "begin:uiStart"));
  t = 10;
  const painted = P.afterPaint();
  await painted;
  const names = P.snapshot().marks.map((m) => m.n);
  assert.ok(names.includes("ui:cover"));
  assert.ok(names.includes("ui:painted"));
  t = 20;
  P.continueWindow("startRace");
  const after = P.snapshot().marks.map((m) => m.n);
  assert.ok(after.includes("begin:uiStart"), "UI window not wiped");
  assert.ok(after.includes("ui:painted"), "cover→paint marks survive into startRace");
  assert.ok(after.includes("begin:startRace"));
  P.beginUi("uiStart");
  assert.ok(P.snapshot().marks.some((m) => m.n === "ui:tap"), "second tap while armed marks ui:tap");
});

test("manifest lists the module before quality-preset (load order)", () => {
  const man = fs.readFileSync(path.join(ROOT, "tools/manifest.cjs"), "utf8");
  const a = man.indexOf('"js/perf/race-entry-profile.js"');
  const b = man.indexOf('"js/perf/quality-preset.js"');
  assert.ok(a > 0 && b > a, "race-entry-profile must be in FULL ahead of quality-preset");
});

test("requestWarm / raiseHandoff / span / afterPresent keep game.js thin", () => {
  const P = load();
  P.begin("startRace");
  let warmed = 0;
  P.requestWarm({ warm() { warmed++; } }, false);
  assert.equal(warmed, 1);
  assert.ok(P.snapshot().marks.some((m) => m.n === "warm:request"));
  P.requestWarm({ warm() { warmed++; } }, true);
  assert.equal(warmed, 1);
  assert.ok(P.snapshot().marks.some((m) => m.n === "warm:skipped-menu"));
  let handoffs = 0, stops = 0;
  const screen = {
    phase: () => "handoff",
    handoff() { handoffs++; },
    stop() { stops++; },
  };
  P.raiseHandoff(screen);
  assert.equal(handoffs, 1);
  let ran = 0;
  P.span("warmCarAssets", () => { ran++; });
  assert.equal(ran, 1);
  const names = P.snapshot().marks.map((m) => m.n);
  assert.ok(names.includes("warmCarAssets:start"));
  assert.ok(names.includes("warmCarAssets:end"));
  P.afterPresent(screen, { warming: () => false });
  assert.equal(stops, 1);
  assert.ok(P.snapshot().marks.some((m) => m.n === "handoff:lower"));
});

test("afterPresent lowers handoff on ctxLost even while warming (race-start fail-fast)", () => {
  // Without this, a lost device left warming() true / begin() false and never
  // reached afterPresent — HUD Wave 3 surveys hung on "race start never completes".
  const P = load();
  P.begin("startRace");
  let stops = 0;
  const screen = { phase: () => "handoff", stop() { stops++; } };
  const gfx = {
    warming: () => true,
    backendState: () => ({ ctxLost: true }),
  };
  P.afterPresent(screen, gfx, true);
  assert.equal(stops, 1);
  assert.ok(P.snapshot().marks.some((m) => m.n === "handoff:lower-lost"));
});

const ENTRY_SRC = fs.readFileSync(path.join(ROOT, "js/race/session-entry.js"), "utf8");

test("hidden mirror preparation keeps the handoff up until its main present", () => {
  const P = load();
  P.begin("startRace");
  let stops = 0;
  const screen = { phase: () => "handoff", stop() { stops++; } };
  const gfx = { warming: () => false };
  P.afterPresent(screen, gfx, true);
  P.afterPresent(screen, gfx, true);
  assert.equal(stops, 0);
  assert.ok(!P.snapshot().marks.some((m) => m.n === "present:ready"));
  P.afterPresent(screen, gfx, false);
  assert.equal(stops, 1);
  assert.ok(P.snapshot().marks.some((m) => m.n === "handoff:lower"));
});

test("race-entry ticks pump input and network while holding physics and governor", () => {
  const source = fs.readFileSync(path.join(ROOT, "js/game.js"), "utf8");
  const start = source.indexOf("function tickBody(now) {");
  const end = source.indexOf("  if ((paused || UiExperience.resumeHolding(dt)) && !netPlay.active())", start);
  const calls = [];
  let preparing = true, warming = false;
  const ctx = {
    lastFrame: 100, paused: false, state: "count", _poseAt: null,
    mirrorPass: { preparing: () => preparing }, gfx: { warming: () => warming },
    PerfGov: { tick: dt => calls.push(["governor", dt]) },
    performance: { now: () => 260 },
    Input: { poll: () => calls.push("input"), clearEdges: () => calls.push("clear") },
    BrakeCue: { tick() {} }, onboard: { tick() {} },
    director: { tick() {} },
    netPlay: { tick: () => calls.push("network") },
    render: dt => calls.push(["render", dt]),
  };
  vm.runInNewContext(source.slice(start, end) + 'throw new Error("physics reached");\n}', ctx);
  ctx.tickBody(200);
  assert.deepEqual(calls, ["input", "network", "clear", ["render", 0]]);
  assert.equal(ctx.lastFrame, 260, "preparation time must not accumulate into the next tick");
  preparing = false;
  assert.throws(() => ctx.tickBody(276), /physics reached/);
  assert.ok(calls.some(call => Array.isArray(call) && call[0] === "governor" && call[1] === 16));
  preparing = true;
  calls.length = 0; warming = true;
  ctx.tickBody(300);
  assert.deepEqual(calls, ["input", "network", "clear"], "compiler keeps renderer ownership");
  warming = false; preparing = false;
  assert.throws(() => ctx.tickBody(316), /physics reached/);
  assert.ok(calls.some(call => Array.isArray(call) && call[0] === "governor"));
});

test("hiding or leaving the page cancels preparation when animation frames stop", () => {
  // Lifecycle listeners live in PlatformSession.wireLifecycle (extracted from game.js).
  const source = fs.readFileSync(path.join(ROOT, "js/ui/platform-session.js"), "utf8");
  const start = source.indexOf('document.addEventListener("visibilitychange", () => {');
  const end = source.indexOf("// LOSING FOCUS", start);
  assert.ok(start >= 0 && end > start, "PlatformSession wireLifecycle visibilitychange block");
  const handlers = {}, calls = [];
  const ctx = {
    document: { hidden: false, addEventListener: (name, fn) => { handlers[name] = fn; } },
    window: { addEventListener: (name, fn) => { handlers[name] = fn; } },
    G: { state: "count", netPlay: { active: () => false } },
    disarmProbeOnLeave() {},
    cancelMirrorPrep: () => calls.push("cancel"),
    setPaused: () => calls.push("pause"),
    PerfGov: { sentinelArm() {}, sentinelResume() {} },
    raceWakeLock: { wanted: () => false, hold() {} },
    clearInterval() {}, setInterval() { return 1; },
  };
  vm.runInNewContext(source.slice(start, end), ctx);
  handlers.visibilitychange();
  assert.deepEqual(calls, []);
  ctx.document.hidden = true;
  handlers.visibilitychange();
  assert.deepEqual(calls, ["cancel", "pause"]);
  calls.length = 0; ctx.document.hidden = false;
  handlers.pagehide();
  assert.deepEqual(calls, ["cancel"]);
});

function profileDeferred() {
  let resolve, reject;
  const promise = new Promise((r, j) => { resolve = r; reject = j; });
  return { promise, resolve, reject };
}

test("a superseded asynchronous preparation cannot mark the next entry", async () => {
  const P = load(), held = profileDeferred();
  P.begin("old");
  const pending = P.spanAsync("mirrorPrepare", () => held.promise);
  P.begin("new");
  held.resolve();
  await pending;
  assert.deepEqual(Array.from(P.snapshot().marks, m => m.n), ["begin:new"]);
});

function profileSessionHarness() {
  const observers = [], failures = [];
  class FakeObserver {
    constructor(callback) { this.callback = callback; this.disconnects = 0; observers.push(this); }
    observe() {}
    disconnect() { this.disconnects++; }
  }
  FakeObserver.supportedEntryTypes = ["longtask"];
  const P = load({ PerformanceObserver: FakeObserver, performance: { now: () => 1000 } });
  const context = {};
  vm.runInNewContext(ENTRY_SRC.replace(/^const\b/m, "var"), context,
    { filename: "js/race/session-entry.js" });
  const entry = context.SessionEntry.create();
  function start(key, { body = () => true, valid = () => true } = {}) {
    const held = profileDeferred(), entered = profileDeferred();
    const prepare = () => { entered.resolve(); return held.promise; };
    const fail = (e) => failures.push(e);
    const request = P.runSession(entry, key, prepare, body, valid, fail);
    return { request, entered: entered.promise, held, prepare, body, valid, fail };
  }
  const idle = { phase: () => "idle", stop() { assert.fail("no handoff to stop"); } };
  return { P, entry, observers, failures, start, idle };
}

test("runSession duplicates retain latch identity, marks, and a single observer", async () => {
  const h = profileSessionHarness(), a = h.start("same");
  const duplicate = () => h.P.runSession(h.entry, "same", a.prepare, a.body, a.valid, a.fail);
  assert.strictEqual(duplicate(), a.request, "duplicate before preparation shares the original promise");
  await a.entered;
  h.P.mark("keep-this-mark");
  assert.strictEqual(duplicate(), a.request, "duplicate during preparation shares the original promise");
  assert.equal(h.observers.length, 1);
  assert.equal(h.observers[0].disconnects, 0);
  assert.ok(h.P.snapshot().marks.some((m) => m.n === "keep-this-mark"));
  assert.equal(h.P.snapshot().marks.filter((m) => m.n === "begin:startRace").length, 1);
  a.held.resolve();
  assert.equal(await a.request, true);
  h.P.end();
});

test("runSession cancellation disconnects the observer without committing", async () => {
  const h = profileSessionHarness();
  let commits = 0;
  const a = h.start("cancel", { body: () => { commits++; } });
  await a.entered;
  h.entry.cancel(); a.held.resolve();
  assert.equal((await a.request).kind, "canceled");
  assert.equal(commits, 0);
  assert.equal(h.P.armed(), false);
  assert.equal(h.observers[0].disconnects, 1);
  assert.equal(h.failures.length, 0, "superseded cancellation does not invoke recovery");
});

test("an older prerequisite settlement cannot end or append marks to the newer window", async () => {
  const h = profileSessionHarness(), a = h.start("old");
  await a.entered;
  const b = h.start("new"); await b.entered;
  h.P.mark("new-owner");
  const before = h.P.snapshot().marks.map((m) => m.n);
  a.held.resolve();
  assert.equal((await a.request).kind, "canceled");
  assert.equal(h.P.armed(), true);
  assert.deepEqual(h.P.snapshot().marks.map((m) => m.n), before);
  assert.equal(h.observers.length, 2);
  assert.equal(h.observers[0].disconnects, 1);
  assert.equal(h.observers[1].disconnects, 0);
  b.held.resolve(); assert.equal(await b.request, true);
  assert.equal(h.P.snapshot().marks.filter((m) => m.n === "ensureScenery:end").length, 1);
  h.P.end();
});

test("an older rejected prerequisite cannot end the newer window", async () => {
  const h = profileSessionHarness(), a = h.start("old"); await a.entered;
  const b = h.start("new"); await b.entered;
  a.held.reject(new Error("old prerequisite failure"));
  assert.equal((await a.request).kind, "canceled");
  assert.equal(h.P.armed(), true);
  assert.equal(h.observers[1].disconnects, 0);
  assert.equal(h.failures.length, 0);
  b.held.resolve(); await b.request; h.P.end();
});

test("observer callbacks are conservatively scoped to the owning generation", async () => {
  // Synthetic callback delivery checks ownership, not browser scheduling behavior.
  const h = profileSessionHarness(), a = h.start("old"); await a.entered;
  const b = h.start("new"); await b.entered;
  const records = { getEntries: () => [{ startTime: 1000, duration: 75, name: "self" }] };
  h.observers[0].callback(records);
  assert.equal(h.P.snapshot().longTasks.length, 0);
  h.observers[1].callback(records);
  assert.equal(h.P.snapshot().longTasks.length, 1);
  assert.equal(h.P.snapshot().blockMs, 75);
  a.held.resolve(); await a.request;
  b.held.resolve(); await b.request; h.P.end();
});

test("successful completion waits for presentation even when no handoff exists", async () => {
  const h = profileSessionHarness(), a = h.start("success"); await a.entered;
  h.P.afterPresent(h.idle, { warming: () => false });
  h.P.afterPresent(h.idle, { warming: () => false });
  assert.equal(h.P.armed(), true);
  assert.equal(h.P.snapshot().marks.some((m) => m.n === "present:ready"), false,
    "menu presents during preparation cannot complete race-entry profiling");
  a.held.resolve(); assert.equal(await a.request, true);
  assert.equal(h.P.armed(), true, "promise completion is distinct from presentation");
  assert.ok(h.P.snapshot().marks.some((m) => m.n === "session:committed"));
  h.P.afterPresent(h.idle, { warming: () => true });
  h.P.afterPresent(h.idle, { warming: () => true });
  assert.equal(h.P.armed(), true);
  assert.equal(h.P.snapshot().marks.filter((m) => m.n === "present:warming").length, 1);
  h.P.afterPresent(h.idle, { warming: () => false });
  assert.equal(h.P.armed(), true, "first ready present retains the existing frame tail");
  h.P.afterPresent(h.idle, { warming: () => false });
  assert.equal(h.P.armed(), false);
  assert.equal(h.P.snapshot().marks.filter((m) => m.n === "present:ready").length, 1);
  assert.equal(h.observers[0].disconnects, 1);
});

test("a raised handoff observes ready presentation before an asynchronous body settles", async () => {
  const h = profileSessionHarness(), bodyHeld = profileDeferred(), bodyEntered = profileDeferred();
  let phase = "idle", stops = 0;
  const screen = {
    phase: () => phase,
    handoff() { phase = "handoff"; },
    stop() { phase = "idle"; stops++; },
  };
  const a = h.start("handoff", { body: () => {
    h.P.raiseHandoff(screen); bodyEntered.resolve(); return bodyHeld.promise;
  } });
  await a.entered; a.held.resolve(); await bodyEntered.promise;
  h.P.afterPresent(screen, { warming: () => true });
  assert.equal(stops, 0);
  h.P.afterPresent(screen, { warming: () => false });
  assert.equal(stops, 1);
  assert.equal(h.P.armed(), true);
  h.P.afterPresent(screen, { warming: () => false });
  assert.equal(h.P.armed(), false);
  bodyHeld.resolve(true); await a.request;
  assert.equal(h.P.armed(), false, "later success must not re-arm a completed window");
});

test("false commit, invalid settings, and failures release only their active observer", async () => {
  for (const mode of ["false", "invalid", "prepare-fails", "body-fails"]) {
    const h = profileSessionHarness();
    const a = h.start(mode, {
      valid: () => mode !== "invalid",
      body: () => {
        if (mode === "body-fails") throw new Error(mode);
        return mode === "false" ? false : true;
      },
    });
    await a.entered;
    if (mode === "prepare-fails") a.held.reject(new Error(mode)); else a.held.resolve();
    if (mode.endsWith("fails")) await assert.rejects(a.request, new RegExp(mode));
    else if (mode === "invalid") assert.equal((await a.request).kind, "canceled");
    else assert.equal(await a.request, false);
    assert.equal(h.P.armed(), false, mode);
    assert.equal(h.observers[0].disconnects, 1, mode);
    assert.equal(h.P.snapshot().marks.filter((m) => m.n === "end").length, 1, mode);
    assert.equal(h.failures.length, mode === "false" ? 0 : 1, mode + ": recovery runs once");
  }
});
