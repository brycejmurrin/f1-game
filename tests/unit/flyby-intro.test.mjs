/* FLYBY INTRO LIFECYCLE — how raceIntro / the menu build prepare, plan, cancel
 * and hand over the flyby (js/game.js through the extracted intro modules).
 *
 * Split out of tests/unit/flyby-shots.test.mjs (2026-10-19, test review #2952
 * R1-10): none of these builds a circuit, they read game.js source and run
 * its functions in small vm harnesses, so they run beside the real-VM file in
 * parallel instead of behind it.
 */
import { test } from "node:test";
import assert from "node:assert";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { gameSource } from "../helpers/game-source.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

const RACE_ENTRY_PROFILE_STUB = {
  spanAsync: async (_n, fn) => fn(),
  span: (_n, fn) => fn(),
  mark: () => {},
  lap: () => {},
  beginUi: () => {},
  setProgressSink: () => {},
};

test("the menu build warms its shaders BEFORE the slow extras (lamp pre-bake, flyby plans)", () => {
  // The lamp pre-bake (seconds of slices) ran before the warm frames: a RACE! tap
  // mid-bake met cold shaders and the loading screen's flyby froze on its first frames.
  const game = gameSource();
  const i = game.indexOf("async function menuFinish(current, key)"), body = game.slice(i, game.indexOf("\n}\n", i));
  assert.ok(i > 0, "menuFinish exists");
  const warm = body.indexOf("_menuGate.warm = 2"), lamp = body.indexOf("menuLampBake(current)"), plan = body.indexOf("FlybySeq.planSteps(");
  assert.ok(warm > 0 && warm < lamp && lamp < plan, "car assets -> warm -> lamp bake -> flyby plans");
  assert.match(body, /if \(lit && await menuIdle\(current\)\) \{ warmPrograms\("\|lit"\); FlybySeq\.reset\(\); _menuGate\.warm = 2; \}/, "and warm again once a baked (dark) world is in — only then, under its own tag");
  // THE PROGRAM WARM IS REQUESTED WITH THE HIDDEN FRAMES, both times: the first
  // hidden present starts it while the player reads the sheet, so the warm at
  // the lights finds its programs built (17 s of held card after the flyby
  // under SwiftShader before this; see warmPrograms).
  assert.match(body, /if \(await menuIdle\(current\)\) \{ warmPrograms\(\); FlybySeq\.reset\(\); _menuGate\.warm = 2; \}/, "the first warm pair requests the program warm first");
  assert.match(game, /const warmPrograms = \(tag = ""\) => \{ try \{ if \(gfx\.warm\) \{ const k = menuKey\(trackIdx\); _warmKey = k; if \(!_warmed\.has\(k \+ tag\)\) \{ _warmed\.add\(k \+ tag\); gfx\.warm\(\); return true; \} \} \}/, "warmPrograms is the guarded request (GLX/WGX have no warm), remembers the world it was for, and asks once per world per session");
  // …and the lights skip their own request for that world: with every program
  // built, compileAsync(scene) still walked the race scene for 7.5 s and linked
  // nothing (scratch/ld-link-probe.mjs, 2026-09-28).
  const srb = game.slice(game.indexOf("async function startRaceBody()"), game.indexOf("const sessionEntry ="));
  assert.match(srb, /RaceEntryProfile\.requestWarm\(gfx, _warmKey === menuKey\(trackIdx\)\)/,
    "startRaceBody warms only a world the menu did not");
  assert.match(fs.readFileSync(path.join(ROOT, "js/perf/race-entry-profile.js"), "utf8"),
    /function requestWarm\(gfx, alreadyWarmed\) \{[\s\S]*?gfx\.warm\(\)/,
    "requestWarm still gates gfx.warm() on the un-warmed world");
  assert.match(game, /const planned = world && _menuFly && _menuFly\.track === track && _menuFly\.key === _menuGate\.ready/);
});

test("RACE! before the menu's build: prepare under the card, then drive out and fly", () => {
  const game = gameSource();
  const i = game.indexOf("function raceIntro(go)"), body = game.slice(i, game.indexOf("\n}\n", i));
  assert.match(body, /if \(!built && !menuWorld\(\) && introBuild\(go\)\) return;/, "no world: raceIntro diverts to the build");
  const j = game.indexOf("function introBuild(go)"), ib = game.slice(j, game.indexOf("\n}\n", j));
  const handoff = game.slice(game.indexOf("function afterGarageOut("), game.indexOf("function studioOpen("));
  const b = ib.indexOf("studioOpen(n, info0)"), l = ib.indexOf("loadTrackStepped(idx, live)"), p = ib.indexOf("introPrepare(live, key, info0, n, true)");
  const h = ib.indexOf("afterGarageOut(n, key, go, prepared, live)");
  assert.ok(l > 0 && p > l && b > p && h > b, "build and plans precede the outgoing animation and afterGarageOut handoff");
  assert.match(ib, /_menuGate\.ready = key; _menuGate\.track = track;/, "the build is keyed like the menu's, so menuWorld() sees it");
  assert.match(handoff, /_introKey = key; raceIntro\(go\)/, "the hand-over marks itself, so a failed build falls back to the card instead of looping");
  assert.match(ib, /reduce-motion still builds then plays the garage-out before the card and the flyby/,
    "reduced motion still builds + the garage-out at its tuned pace, then card + flyby (loadingScreen.run no longer gates it)");
  assert.match(game, /_mq = [^;]*matchMedia\("\(prefers-reduced-motion: reduce\)"\)/, "…and motionReduced still reads the OS flag");
  assert.match(game, /function motionReduced\(\) \{\s*return !!\(_mq && _mq\.matches\)/);
  const pa = ib.indexOf("prepareMenuCarAssets(");
  assert.ok(pa > l && p > pa && b > p, "assets precede overlapping plans/shaders, both settle before drive-out");
  assert.match(handoff, /try \{ _introKey = key; raceIntro\(go\); \} catch \(e\) \{[^}]*loadingScreen\.stop\(\); go\(\); \}/, "a throw in raceIntro never strands the timer-less build card");
  assert.equal((ib.match(/await awaitIntroWarm\(live\)/g) || []).length, 1, "the old scene releases compilation before rebuilding");
  assert.match(ib, /introPrepare\(live, key, info0, n, true\)/, "new-world compilation settles through the shared preparation barrier");
});

test("intro builds cancel at async boundaries and never fly over pending compilation", async () => {
  const game = gameSource();
  // Slice only the cancel + await helper + introBuild — ship's introWarm(go) is a
  // separate race-start path (loading-card.test.mjs) and must not shadow the helper.
  const a = game.indexOf("function cancelIntro()"), b = game.indexOf("\nfunction introWarm(go)", a);
  for (const mode of ["ready", "slow", "quit", "supersede", "settings", "plan-cancel", "timeout", "old-timeout", "fetch-fail"]) {
    let resolveScenery, rejectScenery, now = 0, warming = mode === "old-timeout", slices = 0;
    const events = [];
    const c = { trackIdx: 0, track: {}, state: "menu", _introRun: 0, _introKey: "", _introSkip: 0, _menuFly: null, flybyShots: null, reloadFlybyShots() {},
      RaceEntryProfile: RACE_ENTRY_PROFILE_STUB,
      _menuGate: { generation: 0, warm: 0 }, flybyBuildTimer: 0, settings: "one",
      entrySettings: () => c.settings, menuKey: () => "world", motionReduced: () => false, titleIfBare: () => {},
      clearTimeout() {}, setTimeout: f => f(), requestAnimationFrame: f => f(),
      performance: { now: () => now }, loadingInfo: () => ({}),
      loadingScreen: { prep: () => { c._ph = "prep"; events.push("prep"); }, building: () => { c._ph = "build"; events.push("build"); }, garage: () => { c._ph = "garage"; events.push("garage"); },
        stop: () => { c._ph = ""; events.push("stop"); }, phase: () => c._ph || "", nextFlyMs: () => 24000 },
      ensureScenery: () => new Promise((r, j) => { resolveScenery = r; rejectScenery = j; }),
      loadTrackStepped: async (idx, liveNow) => { events.push("load"); return liveNow(); }, prepareMenuCarAssets: async () => {}, _atmo: { prebakeLamps: () => null },
      warmPrograms: () => { warming = mode !== "ready" && mode !== "plan-cancel"; }, gfx: { warming: () => warming },
      menuSlice: async () => {
        now += 1000; slices++;
        if (mode === "slow" && now >= 20000) warming = false;
        // Model render's successful garage present after compilation releases
        // the backend; merely opening the studio no longer uncovers it.
        if (c.setupPreviewOn && !warming) c.studioShown();
        if (mode === "supersede" || mode === "plan-cancel") c.cancelIntro();
        if (mode === "settings") c.settings = "two";
      },
      FlybySeq: { reset() {}, setDuration: () => events.push("duration"), DEFAULT: [], vary: () => [],
        // A real planner step consumes CPU before the async cancellation boundary.
        planSteps: () => () => { now += 4; return mode !== "plan-cancel" || slices > 0; } },
      raceIntro: () => { assert.equal(warming, false, mode + ": never start unseen shots"); events.push("intro"); },
      quitToMenu: () => { c.cancelIntro(); c.loadingScreen.stop(); events.push("recover"); },
      announce: () => events.push("message"), Log: { warn() {} },
      // The studio drive-out, on in every mode: no path may leave the garage preview up.
      LoadingScreen: { SHORT_FLY_MS: 12000 }, headlessMode: false, document: { hidden: false, addEventListener() {} },   // introNow()'s visibility ledger registers at load
      setupPreviewOn: false, setupCam: { startDriveOut: () => 5000, stopDriveOut() {}, driveOutLeft: () => Math.max(0, 5000 - now) } };
    vm.createContext(c); vm.runInContext(game.slice(a, b), c);
    c.introBuild(() => events.push("go"));
    if (mode === "quit") c.quitToMenu();
    if (mode === "fetch-fail") rejectScenery(new Error("offline")); else resolveScenery();
    for (let i = 0; i < 250; i++) await Promise.resolve();
    const success = mode === "ready" || mode === "slow";
    assert.equal(events.includes("intro"), success, mode);
    assert.equal(!!c._menuFly, success, mode + ": no stale plan committed");
    assert.equal(c.setupPreviewOn, false, mode + ": the studio drive-out is closed");
    // A warm already pending at RACE! draws nothing, so prep scrim covers it (studioOpen); otherwise the garage, never the race card.
    assert.equal(events[0], "prep", mode + ": cold preparation opens on prep scrim (race card hidden)");
    assert.equal(events.includes("garage"), success, mode + ": only successful preparation starts outgoing motion");
    if (mode === "quit" || mode === "old-timeout") assert.equal(events.includes("load"), false, mode);
    if (mode.includes("timeout") || mode === "fetch-fail") {
      assert.ok(events.includes("recover") && events.includes("message"), mode + ": recover visibly");
      assert.equal(events.includes("go"), false, "recovery must not start an unsafe race");
    }
  }
  for (const name of ["quitToMenu", "clearMenuScreens"]) {
    assert.match(game.slice(game.indexOf("function " + name + "()"), game.indexOf("function " + name + "()") + 100), /cancelIntro\(\)/);
  }
});

test("cold intros await compilation before drive-out and cut directly afterward; cancellation, failure and skip omit motion", async () => {
  const game = gameSource();
  const planStart = game.indexOf("async function introPlan(");
  const handoff = game.slice(game.indexOf("function afterGarageOut("), game.indexOf("function studioOpen("));
  for (const flow of ["introBuild", "introWarm"]) for (const mode of ["ready", "cancel", "skip", "fail"]) for (const authored of [false, true]) {
    const start = game.indexOf("function " + flow + "(go)");
    const source = handoff + game.slice(planStart, game.indexOf("// A ready, warm world", planStart)) + game.slice(start, game.indexOf("\n}\n", start) + 2);
    let finishGarage, finishWarm, failWarm, warmWait, steps = 0, now = 0, warming = false;
    const events = [], savedShots = [{ id: "authored" }];
    const c = { trackIdx: 0, track: {}, state: "menu", _introRun: 0, _introKey: "", _introSkip: 0, _menuFly: null, flybyShots: null,
      RaceEntryProfile: RACE_ENTRY_PROFILE_STUB,
      _menuGate: { generation: 0, warm: 0 }, flybyBuildTimer: 0, _studio: null, _warmKey: "", gfx: { warm() {}, warming: () => warming },
      entrySettings: () => "settings", menuKey: () => "world", motionReduced: () => false,
      clearTimeout() {}, setTimeout: f => f(), performance: { now: () => now }, introNow: () => now, requestAnimationFrame: f => { c._menuGate.warm--; f(); },
      loadingInfo: () => ({}), loadingScreen: { nextFlyMs: () => 24000, stop() {}, building: (info, skip) => { c.skip = skip; } },
      studioSkip: n => { c._introSkip = n; }, introCover: (info, n) => c.loadingScreen.building(info, () => c.studioSkip(n)),
      studioOpen() { assert.equal(warming, false, "no outgoing motion before compilation settles"); c._studio = {}; events.push("out"); },
      studioDone: () => new Promise(r => { finishGarage = r; }), studioClose() { if (c._studio) { events.push("close"); c._studio = null; } },
      ensureScenery: async () => {}, loadTrackStepped: async () => true, prepareMenuCarAssets: async () => {}, _atmo: { prebakeLamps: () => null },
      awaitIntroWarm: async live => { if (warming) await warmWait; return live(); },
      warmPrograms: () => { events.push("warm"); warming = true; warmWait = new Promise((r, j) => { finishWarm = () => { warming = false; r(); }; failWarm = j; }); return true; },
      menuSlice: async () => { assert.equal(events.includes("out"), false, "plans complete before outgoing motion"); now += 32; },
      FlybySeq: { reset() {}, setDuration() {}, DEFAULT: [], vary: () => [],
        planSteps: (track, shots) => { if (authored) assert.strictEqual(shots, savedShots); return () => { events.push("plan"); return ++steps >= 3; }; } },
      raceIntro: () => events.push(c._introSkip === c._introRun ? "skip" : "intro"), titleIfBare() {},
      quitToMenu: () => { c.state = "menu"; c._introRun++; events.push("recover"); }, announce() {}, Log: { warn() {} } };
    c.reloadFlybyShots = () => { c.flybyShots = authored ? savedShots : null; };
    vm.createContext(c); vm.runInContext(source, c);
    assert.equal(c[flow](() => {}), true);
    for (let i = 0; i < 30; i++) await Promise.resolve();
    assert.equal(steps, 3); assert.equal(warming, true); assert.equal(events.includes("out"), false);
    assert.equal(c._menuFly, null, "pending compilation retains ownership");
    if (mode === "cancel") c._introRun++;
    if (mode === "skip") c.skip();
    if (mode === "fail") failWarm(new Error("compile failed")); else finishWarm();
    for (let i = 0; i < 30; i++) await Promise.resolve();
    if (mode === "ready") {
      assert.equal(events.includes("out"), true); assert.equal(events.includes("intro"), false);
      const preparedEvents = events.length;
      finishGarage();
      for (let i = 0; i < 30; i++) await Promise.resolve();
      assert.deepEqual(events.slice(preparedEvents), ["close", "intro"], "the final outgoing pose cuts straight to the flyby without another plan or warm");
    } else {
      assert.equal(events.includes("out"), false, "abandoned or skipped preparation never starts deferred motion");
      assert.equal(events.includes("intro"), false);
      assert.equal(events.includes("skip"), mode === "skip");
      if (mode === "fail") assert.equal(events.includes("recover"), true);
    }
  }
});

test("raceIntro reuses identically authored prepared shots but honours edits made after planning", () => {
  const game = gameSource();
  const body = game.slice(game.indexOf("function raceIntro(go)"));
  const start = body.indexOf("  reloadFlybyShots();"), end = body.indexOf("  _menuFly = null;", start);
  const source = body.slice(start, end);
  for (const edited of [false, true]) {
    const shots = [{ id: "authored", dur: 1 }], track = {};
    const c = { world: true, track, _menuGate: { ready: "world" }, _menuFly: { key: "world", track, shots }, flybyShots: null };
    c.reloadFlybyShots = () => { c.flybyShots = JSON.parse(JSON.stringify(shots)); if (edited) c.flybyShots[0].dur = 2; };
    vm.createContext(c); vm.runInContext(source, c);
    assert.equal(c.flybyShots === shots, !edited, "unchanged authored lists retain their plan cache identity");
    assert.equal(c.flybyShots[0].dur, edited ? 2 : 1, "the latest authored settings remain authoritative");
  }
});

test("every flyby run opens on a CUT: FlybySeq.reset() before the run and before hidden warm frames", () => {
  const game = gameSource();
  const i = game.indexOf("function raceIntro(go)"), body = game.slice(i, game.indexOf("\n}\n", i));
  assert.ok(body.indexOf("FlybySeq.reset();") > 0 && body.indexOf("FlybySeq.reset();") < body.indexOf("loadingScreen.run("), "raceIntro resets the sequencer before run()");
  const f = game.indexOf("async function menuFinish(current, key)"), fin = game.slice(f, game.indexOf("\n}\n", f));
  assert.equal((fin.match(/FlybySeq\.reset\(\); _menuGate\.warm = 2;/g) || []).length, 2, "both of menuFinish's warm passes");
});

test("the world key includes the grid size, and a failed build does not keep the old id", () => {
  const game = gameSource();
  assert.match(game, /const menuKey = \(idx\) => \[idx, raceTimeOfDay, raceWeather, fieldSize\(\)\]\.join\("\|"\);/);
  assert.equal((game.match(/\[(trackIdx|want|idx), (raceTimeOfDay|tod), (raceWeather|weather)\]\.join\("\|"\)/g) || []).length, 0, "every menu key goes through menuKey()");
  assert.match(game, /track = null; builtTrackId = null;/, "a build that throws must force the next loadTrack to rebuild");
  assert.match(game, /const menuBlank = \(state === "menu" && !setupPreviewOn && !homeTrack && \(!track \|\| !loadingScreen\.active\(\) \|\| !menuWorld\(\)\)\)\s*\|\| \(\(loadingScreen\.phase\(\) === "build" \|\| loadingScreen\.phase\(\) === "busy"\) && !setupPreviewOn\);/, "the no-world card shows no stale circuit, nor a build/busy card over the results");
});

function introOverlapDeferred() {
  let resolve, reject;
  const promise = new Promise((r, j) => { resolve = r; reject = j; });
  return { promise, resolve, reject };
}
function introOverlapHarness({ cold = true, planThrows = false, cancelDuringPlan = false, lampSlices = 0, lampThrows = false, existingWarm = false, lampFactory = null } = {}) {
  const game = gameSource();
  const start = game.indexOf("async function introPrepare(");
  assert.ok(start >= 0, "production preparation barrier exists");
  const source = game.slice(start, game.indexOf("\n}\n", start) + 2);
  const plan = introOverlapDeferred(), warm = introOverlapDeferred(), events = [];
  let wanted = true, result, error, settled = false, planCurrent, warmCurrent, pendingWarm = existingWarm, lampSteps = 0;
  const lampWaits = [];
  const fly = { key: "world", shots: [{ id: "test-shot" }] };
  const c = {
    RaceEntryProfile: RACE_ENTRY_PROFILE_STUB,
    _menuGate: { warm: 0 }, gfx: { warming: () => pendingWarm },
    _atmo: { prebakeLamps() {
      assert.equal(pendingWarm, false, "light inputs cannot mutate while an old compile owns the scene");
      events.push("lamps:inputs");
      if (lampFactory) return lampFactory();
      if (!lampSlices) return null;
      return budget => {
        assert.equal(budget, 3, "lamp CPU work is sliced");
        events.push("lamps:step"); lampSteps++;
        if (lampThrows) throw new Error("lamp slice failed");
        return lampSteps >= lampSlices;
      };
    } },
    setTimeout(fn, ms) { assert.equal(ms, 8); lampWaits.push(fn); },
    introPlan: async current => {
      events.push("plan:start"); planCurrent = current;
      if (cancelDuringPlan) wanted = false;
      if (planThrows) throw new Error("planning failed immediately");
      return plan.promise;
    },
    warmPrograms() { events.push("warm:request"); },
    FlybySeq: { reset() { events.push("camera:reset"); } },
    requestAnimationFrame(fn) { c._menuGate.warm--; fn(); },
    awaitIntroWarm: async current => { events.push("warm:wait"); warmCurrent = current; await warm.promise; return current(); },
    introNow: () => Date.now(),   // the intro's hidden-time-frozen clock (game.js); the sandbox is never hidden
  };
  vm.createContext(c); vm.runInContext(source, c);
  const done = c.introPrepare(() => wanted, "world", {}, 1, cold).then(
    value => { settled = true; result = value; },
    reason => { settled = true; error = reason; });
  const drain = async () => { for (let i = 0; i < 30; i++) await Promise.resolve(); };
  return { c, plan, warm, fly, events, done, drain,
    cancel() { wanted = false; }, result: () => result, error: () => error,
    lampSteps: () => lampSteps, lampWaits, releaseExistingWarm() { pendingWarm = false; warm.resolve(); },
    settled: () => settled, planLive: () => planCurrent(), warmLive: () => warmCurrent && warmCurrent() };
}

test("cold intro planning and compilation overlap and both must finish before readiness", async () => {
  for (const first of ["plan", "warm"]) {
    const h = introOverlapHarness();
    await h.drain();
    assert.equal(h.events.filter(e => e === "warm:request").length, 1,
      "shader preparation starts while planning remains unresolved");
    assert.equal(h.events.includes("warm:wait"), true);
    assert.equal(h.settled(), false);
    h[first].resolve(first === "plan" ? h.fly : undefined); await h.drain();
    assert.equal(h.settled(), false, first + " alone cannot open the garage");
    h[first === "plan" ? "warm" : "plan"].resolve(h.fly); await h.done;
    assert.equal(h.error(), undefined);
    assert.strictEqual(h.result().fly, h.fly);
    assert.equal(h.events.filter(e => e === "warm:request").length, 1);
  }
});

test("intro preparation that already owns compilation does not request another warm", async () => {
  const h = introOverlapHarness({ cold: false });
  await h.drain();
  assert.equal(h.events.includes("warm:request"), false);
  assert.equal(h.events.includes("camera:reset"), false);
  assert.equal(h.events.includes("warm:wait"), true);
  h.plan.resolve(h.fly); h.warm.resolve(); await h.done;
  assert.strictEqual(h.result().fly, h.fly);
});

test("an intro canceled before shader kickoff never requests a stale warm", async () => {
  const h = introOverlapHarness({ cancelDuringPlan: true });
  await h.drain();
  assert.equal(h.events.includes("warm:request"), false);
  assert.equal(h.events.includes("warm:wait"), false);
  h.plan.resolve(h.fly); await h.done;
  assert.equal(h.result(), null);
});

test("cancellation during overlapped preparation retires both continuations", async () => {
  const h = introOverlapHarness();
  await h.drain(); h.cancel();
  assert.equal(h.planLive(), false);
  assert.equal(h.warmLive(), false);
  h.plan.resolve(h.fly); h.warm.resolve(); await h.done;
  assert.equal(h.result(), null);
  assert.equal(h.events.filter(e => e === "warm:request").length, 1);
});

test("immediate planning failure prevents shader kickoff and is handled", async () => {
  const h = introOverlapHarness({ planThrows: true });
  await h.done;
  assert.match(h.error().message, /planning failed immediately/);
  assert.equal(h.settled(), true);
});

test("failure in either preparation branch retires its sibling and handles late rejection", async () => {
  for (const failed of ["plan", "warm"]) {
    const h = introOverlapHarness();
    await h.drain();
    h[failed].reject(new Error(failed + " failed")); await h.done;
    assert.equal(h.error().message, failed + " failed");
    assert.equal(h.planLive(), false);
    assert.equal(h.warmLive(), false);
    // Promise.all must keep a rejection handler on the abandoned sibling.
    h[failed === "plan" ? "warm" : "plan"].reject(new Error("late sibling failure"));
    await h.drain();
    assert.equal(h.error().message, failed + " failed");
    assert.equal(h.events.filter(e => e === "warm:request").length, 1);
  }
});

test("skipped shot planning still waits for required shader preparation", async () => {
  const h = introOverlapHarness();
  await h.drain(); h.plan.resolve(null); await h.drain();
  assert.equal(h.settled(), false);
  h.warm.resolve(); await h.done;
  assert.equal(h.result().fly, null, "a skip omits shots but preserves readiness");
});

test("night lamp preparation overlaps shaders but readiness waits for its final slice", async () => {
  const h = introOverlapHarness({ lampSlices: 3 });
  await h.drain();
  assert.ok(h.events.indexOf("lamps:inputs") < h.events.indexOf("warm:request"), "resolve light inputs before the new shader warm");
  assert.equal(h.lampSteps(), 1);
  assert.equal(h.events.includes("warm:wait"), true);
  h.plan.resolve(h.fly); h.warm.resolve(); await h.drain();
  assert.equal(h.settled(), false, "finished plans and shaders do not skip a partial night bake");
  h.lampWaits.shift()(); await h.drain();
  assert.equal(h.lampSteps(), 2); assert.equal(h.settled(), false);
  h.lampWaits.shift()(); await h.done;
  assert.strictEqual(h.result().fly, h.fly);
  assert.equal(h.lampSteps(), 3);
  assert.equal(h.events.filter(e => e === "warm:request").length, 1, "lamp completion does not request another traversal");
});

test("warm-ready garage preparation finishes partial lamps without another shader request", async () => {
  const h = introOverlapHarness({ cold: false, lampSlices: 2 });
  await h.drain(); h.plan.resolve(h.fly); h.warm.resolve(); await h.drain();
  assert.equal(h.events.includes("warm:request"), false);
  assert.equal(h.settled(), false);
  h.lampWaits.shift()(); await h.done;
  assert.equal(h.lampSteps(), 2); assert.strictEqual(h.result().fly, h.fly);
});

test("existing compilation releases the scene before lamp inputs are resolved", async () => {
  const h = introOverlapHarness({ existingWarm: true, lampSlices: 1 });
  await h.drain();
  assert.equal(h.events.includes("lamps:inputs"), false);
  assert.equal(h.events.includes("plan:start"), false);
  assert.equal(h.events.includes("warm:request"), false);
  h.releaseExistingWarm(); await h.drain();
  assert.equal(h.events.includes("lamps:inputs"), true);
  h.plan.resolve(h.fly); await h.done;
  assert.equal(h.lampSteps(), 1);
});

test("canceling a lamp slice cannot run or install its queued continuation", async () => {
  const h = introOverlapHarness({ lampSlices: 3 });
  await h.drain(); h.cancel();
  h.plan.resolve(h.fly); h.warm.resolve(); h.lampWaits.shift()(); await h.done;
  assert.equal(h.lampSteps(), 1, "no stale second step is executed");
  assert.equal(h.result(), null);
});

test("lamp failure retires planning and shader continuations with no unhandled late failure", async () => {
  const h = introOverlapHarness({ lampSlices: 3, lampThrows: true });
  await h.done;
  assert.match(h.error().message, /lamp slice failed/);
  assert.equal(h.planLive(), false);
  h.plan.reject(new Error("late planner failure")); h.warm.reject(new Error("late compile failure"));
  await h.drain();
  assert.equal(h.lampSteps(), 1);
});

test("prepared night lamps make the actual synchronous flyby bake a cache hit", async () => {
  let now = 0;
  const track = {}, lights = [0, 8, 0, 1, 1, 1, 8, 0, -1, 0, 1, 0.5, 0.1, 0, 0];
  const context = vm.createContext({
    Log: { info() {}, warn() {} }, performance: { now: () => ++now },
    G: { track, gfx: { hasLampBake: true, mobileTier: true } },
    LT: { lampBake: 1, tailLightEmit: 0, lampNearClamp: 4, floodDay: 0 },
    applyLightTune() {}, isFloodActiveSession: () => true, buildTrackLights: () => lights,
  });
  vm.runInContext(fs.readFileSync(path.join(ROOT, "js/lighting/lamp-bake.js"), "utf8"), context);
  const atmo = fs.readFileSync(path.join(ROOT, "js/lighting/atmosphere.js"), "utf8");
  const start = atmo.indexOf("function prebakeLamps()");
  vm.runInContext(atmo.slice(start, atmo.indexOf("\n}\n", start) + 2), context);
  const lamps = vm.runInContext("LampBake", context);
  const h = introOverlapHarness({ lampFactory: () => context.prebakeLamps() });
  await h.drain(); h.plan.resolve(h.fly); h.warm.resolve(); await h.drain();
  for (let i = 0; i < 100 && !h.settled(); i++) {
    assert.ok(h.lampWaits.length, "unfinished lamp work has a scheduled slice");
    h.lampWaits.shift()(); await h.drain();
  }
  assert.equal(h.settled(), true); assert.equal(h.error(), undefined);
  assert.strictEqual(track._lights, lights);
  const before = lamps.gen(); assert.equal(before, 1, "sliced preparation installed exactly one bake");
  const baked = lamps.forTrack(track, track._lights, 4, undefined, true, lamps.budget(context.G.gfx));
  assert.ok(baked);
  assert.equal(lamps.gen(), before, "flyby settings reuse the prepared bake without rebuilding");
  assert.equal(h.events.filter(e => e === "warm:request").length, 1);
});

function introPlanBudgetHarness({ stepMs = 20, yieldMs = 10000, shotCount = 11, interrupt = null, interruptAtStep = 0 } = {}) {
  const game = gameSource();
  const start = game.indexOf("async function introPlan(");
  const source = game.slice(start, game.indexOf("\n}\n", start) + 2);
  let now = 0, steps = 0, yields = 0, wanted = true;
  const c = {
    _introSkip: 0, _menuFly: null, track: {}, trackIdx: 0, flybyShots: null,
    performance: { now: () => now }, reloadFlybyShots() {},
    loadingScreen: { nextFlyMs: () => 24000 },
    FlybySeq: {
      DEFAULT: [], vary: () => Array.from({ length: shotCount }, (_, i) => ({ id: 'shot-' + i })), setDuration() {},
      planSteps: () => () => {
        steps++; now += stepMs;
        if (steps === interruptAtStep) {
          if (interrupt === "cancel") wanted = false;
          if (interrupt === "skip") c._introSkip = 1;
        }
        return steps >= shotCount;
      },
    },
    menuSlice: async () => {
      yields++; now += yieldMs;
      if (interrupt === "cancel") wanted = false;
      if (interrupt === "skip") c._introSkip = 1;
    },
  };
  vm.createContext(c); vm.runInContext(source, c);
  return { run: () => c.introPlan(() => wanted, "world", {}, 1),
    steps: () => steps, yields: () => yields, elapsed: () => now };
}

test("intro planning completes every cheap shot despite long compiler delays between slices", async () => {
  const h = introPlanBudgetHarness();
  const fly = await h.run();
  assert.ok(fly);
  assert.equal(h.steps(), 11, "all 11 shot plans finish; shader waits do not exhaust planner CPU budget");
  assert.equal(h.yields(), 10);
  assert.equal(h.elapsed(), 100220, "100 seconds of artificial waiting cost only 220ms of planning");
});

test("intro planning retains an 800ms active work budget and yields only when more work is allowed", async () => {
  const h = introPlanBudgetHarness({ stepMs: 200, shotCount: 20 });
  assert.ok(await h.run(), "a partial plan remains usable by the later flyby warmer");
  assert.equal(h.steps(), 4, "800ms of active work stops further planning");
  assert.equal(h.yields(), 3, "no unnecessary timer after the CPU budget is exhausted");
});

test("one indivisible expensive shot cannot trigger another step beyond the planning budget", async () => {
  const h = introPlanBudgetHarness({ stepMs: 1000, shotCount: 20 });
  assert.ok(await h.run());
  assert.equal(h.steps(), 1);
  assert.equal(h.yields(), 0);
});

test("intro planning rechecks cancellation after a delayed yield; a garage skip keeps planning (the flyby still flies it)", async () => {
  const h = introPlanBudgetHarness({ interrupt: "cancel" });
  assert.equal(await h.run(), null, "cancel");
  assert.equal(h.steps(), 1, "cancel: obsolete work stops before another shot");
  assert.equal(h.yields(), 1);
  const s = introPlanBudgetHarness({ interrupt: "skip" });
  assert.ok(await s.run(), "skip: a tap in the garage ends the drive-out only — the plan is still the flyby's");
  assert.equal(s.steps(), 11, "skip: every shot is still planned");
});

// Append beside the existing introOverlapHarness tests. No fixture edits needed.
test("finished cold compilation retires hidden frames while shot planning is still pending", async () => {
  const h = introOverlapHarness();
  // Simulate RAF callbacks while compilation withholds actual world renders.
  h.c.requestAnimationFrame = fn => fn();
  await h.drain();
  assert.equal(h.c._menuGate.warm, 2);
  h.warm.resolve(); await h.drain();
  assert.equal(h.c._menuGate.warm, 0, "no expensive hidden world frame while the remaining planner finishes");
  assert.equal(h.settled(), false, "retiring warm frames does not bypass planning readiness");
  h.plan.resolve(h.fly); await h.done;
  assert.strictEqual(h.result().fly, h.fly);
});

test("an obsolete cold compilation cannot retire its successor's hidden frame allowance", async () => {
  const h = introOverlapHarness();
  h.c.requestAnimationFrame = fn => fn();
  await h.drain(); h.cancel();
  h.c._menuGate.warm = 2; // a newer owner has queued its own hidden frames
  h.warm.resolve(); await h.drain();
  assert.equal(h.c._menuGate.warm, 2);
  h.plan.resolve(h.fly); await h.done;
  assert.equal(h.result(), null);
  assert.equal(h.c._menuGate.warm, 2);
});

test("a noncold preparation branch cannot retire another owner's hidden frames", async () => {
  const h = introOverlapHarness({ cold: false });
  h.c._menuGate.warm = 2;
  await h.drain(); h.warm.resolve(); await h.drain();
  assert.equal(h.c._menuGate.warm, 2);
  h.plan.resolve(h.fly); await h.done;
  assert.equal(h.c._menuGate.warm, 2);
});


test("intro planning batches cheap shots without per-shot timer latency", async () => {
  const h = introPlanBudgetHarness({ stepMs: 0.25, yieldMs: 32 });
  assert.ok(await h.run());
  assert.equal(h.steps(), 11);
  assert.equal(h.yields(), 0, "eleven cheap steps fit in one 3ms slice");
  assert.equal(h.elapsed(), 2.75);
});

test("intro planning yields after 3ms active batches, excluding delayed timers", async () => {
  const h = introPlanBudgetHarness({ stepMs: 1, yieldMs: 10000 });
  assert.ok(await h.run());
  assert.equal(h.steps(), 11);
  assert.equal(h.yields(), 3, "three batches of three and one final batch of two");
  assert.equal(h.elapsed(), 30011, "yield time spends neither active budget");
});

test("intro planning checks ownership between cheap steps in one batch; a garage skip does not cancel it", async () => {
  const h = introPlanBudgetHarness({ stepMs: 0.25, interrupt: "cancel", interruptAtStep: 2 });
  assert.equal(await h.run(), null, "cancel");
  assert.equal(h.steps(), 2);
  assert.equal(h.yields(), 0, "cancellation needs no additional work or timer");
  const s = introPlanBudgetHarness({ stepMs: 0.25, interrupt: "skip", interruptAtStep: 2 });
  assert.ok(await s.run(), "skip: planning runs to the end");
  assert.equal(s.steps(), 11);
});

test("intro planning still yields after every indivisible 50ms cold shot", async () => {
  const h = introPlanBudgetHarness({ stepMs: 50, yieldMs: 32 });
  assert.ok(await h.run());
  assert.equal(h.steps(), 11);
  assert.equal(h.yields(), 10);
  assert.equal(h.elapsed(), 870);
});

function menuPlanBatchHarness({ stepMs = 1, yieldMs = 32, shotCount = 11, cancelAtStep = 0, cancelAtYield = 0 } = {}) {
  const game = gameSource();
  const start = game.indexOf("async function menuFinish(");
  const source = game.slice(start, game.indexOf("\n}\n", start) + 2);
  let now = 0, steps = 0, yields = 0, wanted = true, warms = 0;
  const c = {
    track: {}, trackIdx: 0, _menuFly: null, _menuGate: { warm: 0 },
    performance: { now: () => now }, prepareMenuCarAssets: async () => {},
    menuIdle: async current => current(), menuLampBake: async () => false,
    warmPrograms: () => { warms++; return false; },
    loadingScreen: { nextFlyMs: () => 24000 },
    FlybySeq: {
      DEFAULT: [], vary: () => Array.from({ length: shotCount }, (_, i) => ({ id: 'shot-' + i })),
      reset() {}, setDuration() {},
      planSteps: () => () => {
        steps++; now += stepMs;
        if (steps === cancelAtStep) wanted = false;
        return steps >= shotCount;
      },
    },
    menuSlice: async () => {
      yields++; now += yieldMs;
      if (yields === cancelAtYield) wanted = false;
    },
  };
  vm.createContext(c); vm.runInContext(source, c);
  return { run: () => c.menuFinish(() => wanted, "world"), c,
    steps: () => steps, yields: () => yields, elapsed: () => now, warms: () => warms };
}

test("menu planning batches cheap shots but gives queued world warming one render opportunity", async () => {
  const h = menuPlanBatchHarness({ stepMs: 0.25 });
  await h.run();
  assert.equal(h.steps(), 11);
  assert.equal(h.yields(), 1, "one render opportunity, not a timer per shot");
  assert.equal(h.elapsed(), 34.75);
  assert.equal(h.c._menuFly.shots.length, 11);
  assert.equal(h.warms(), 1);
  assert.equal(h.c._menuGate.warm, 2, "existing hidden-frame allowance is preserved even when no compile is requested");
});

test("menu planning yields at 3ms active batches despite long timer delays", async () => {
  const h = menuPlanBatchHarness({ yieldMs: 10000 });
  await h.run();
  assert.equal(h.steps(), 11);
  assert.equal(h.yields(), 3);
  assert.equal(h.elapsed(), 30011);
  assert.equal(h.c._menuFly.shots.length, 11);
});

test("menu planning checks ownership between cheap steps and never publishes abandoned plans", async () => {
  const h = menuPlanBatchHarness({ stepMs: 0.25, cancelAtStep: 2 });
  await h.run();
  assert.equal(h.steps(), 2);
  assert.equal(h.yields(), 0);
  assert.equal(h.c._menuFly, null);
});

test("menu planning rechecks ownership after yielding before any more shot work", async () => {
  const h = menuPlanBatchHarness({ cancelAtYield: 1 });
  await h.run();
  assert.equal(h.steps(), 3);
  assert.equal(h.yields(), 1);
  assert.equal(h.c._menuFly, null);
});

test("menu planning retains full completion beyond the intro's 800ms active budget", async () => {
  const h = menuPlanBatchHarness({ stepMs: 200 });
  await h.run();
  assert.equal(h.steps(), 11);
  assert.equal(h.yields(), 10, "each indivisible expensive shot yields on its own");
  assert.equal(h.elapsed(), 2520);
  assert.equal(h.c._menuFly.shots.length, 11);
});


test("menu planning rechecks ownership after its final warm rendering opportunity", async () => {
  const h = menuPlanBatchHarness({ stepMs: 0.25, cancelAtYield: 1 });
  await h.run();
  assert.equal(h.steps(), 11);
  assert.equal(h.yields(), 1);
  assert.equal(h.c._menuFly, null, "the old plan is not published after a new request takes ownership");
});
