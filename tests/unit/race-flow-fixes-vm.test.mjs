/* race-flow-fixes-vm.test.mjs — race-flow defects from the 2026-09-22 bug
 * hunt, each reproduced in the Node VM (tools/lib/game-vm.cjs) before the fix.
 *
 *   - RED FLAG: the red cap holds the field below the stuck-rescue gates, so
 *     every AI was "rescued" (kicked 1.2 → 11.8 m/s) every aiRescueDelay and a
 *     player holding throttle was teleported — 41 kicks and 3 player rescues in
 *     one 14 s procedure, measured on monza.
 *   - FINISHERS: coast() held its floor for one step and then scrubbed to 0, so
 *     every finisher parked ~160 m past the line on one shared line and the
 *     next car home rear-ended it at 14-29 m/s.
 *   - AI RESCUE (hunt 2026-09-30): the AI's off-track gate read `offT > 0.5`,
 *     the track-limits counter that resets to -2 every 1.2 s, so rescueT
 *     peaked at ~0.7 s and decayed — a beached AI was never rescued. It now
 *     shares the player's beachedAt() test.
 *   - HUMAN DNF: the only human retiring ends the race 2.2 s later
 *     (RaceControl.finishDelay, by design); an AI that had already PASSED its
 *     drawn failure retires with it, one that never reached it stays a runner.
 *   - LIGHTS (review 2026-10-04): RECOVER or a shift tapped on the grid stayed
 *     latched and fired on the first green frame — a free re-place at rescue
 *     speed, or 2nd gear with no drive. Input.clearDriveEdges() at lights-out.
 *   - SENTINEL: the race arms the crash sentinel and enters "count"; a track
 *     build finishing during the countdown disarmed it (gated on "race" only).
 *   - FIELD SECTORS: a car that reversed over a sector line and drove on timed
 *     the fragment as a sector — the player path's sectorValid, per car.
 *   - DROPPED SIM: a 5-step frame reported its whole leftover physAcc as
 *     dropped, sub-step remainder included — which carries, not drops.
 *   - WAITING FOR PLAYERS: the card re-shows every 3 s while a room waits for
 *     its shared start, and each re-show was a fresh squelch and voice line.
 *   - PIT GARAGE PAUSE (bug-hunt 3, 2026-10-10): WORK ON CAR freezes the race
 *     behind #carsetup without the pause card; a hidden tab / blur / rotate
 *     ran the FULL pause over it — the card stacked, QUIT left the garage
 *     open on the title, RESUME + RETURN TO RACE raced lock-less.
 *   - RESUME COUNTDOWN (2026-10-10, a behaviour change): RESUME restarted the
 *     sim on the frame it was tapped, mid-corner at race speed. A solo race
 *     now holds ~1.2 s on the start plate (3, 2, 1); a net race does not.
 *   - EXITS (round-3 hunt 2-F1..F3): a flag under the pause kept its tools (lt-open, photo mode) into RACE AGAIN;
 *     QUIT left the pit WORK garage over the title; NEXT ROUND -> quali -> BACK x3 kept the old race's HUD.
 *
 * Run: node --test tests/unit/race-flow-fixes-vm.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import vm from "node:vm";
import { readFileSync } from "node:fs";
import fs from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { gameSource } from "../helpers/game-source.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

const require = createRequire(import.meta.url);
const { createGame, settle } = require("../../tools/lib/game-vm.cjs");

test("a red flag holds the field: no stuck-rescue kicks for the AI, no rescue for a player on the throttle", async () => {
  const g = await createGame({ track: "monza" });
  try {
    const a = g.apex, G = g.G;
    a.caution(true);
    a.setInput({ throttle: true, steer: 0 });
    g.step(60 * 20);
    assert.equal(G.state, "race");
    // Isolate the hold: B6 seeds AI packing from raceIndex/seasonSeed, so a
    // live pack can shove the player off-line under the red cap and trip the
    // legitimate beached rescue. Spread the field on the line so this asserts
    // the red-only gate, not contact RNG.
    let aiN = 0;
    for (let i = 0; i < G.cars.length; i++) {
      const c = G.cars[i];
      if (c.human || c.retired) continue;
      a.aiPlace(i, (0.15 + aiN * 0.04) % 1, 2, (aiN % 2 ? 1 : -1) * 1.5);
      aiN++;
    }
    a.jump(0.12, 2, 0);
    G.player.rescueT = 0; G.player.wallT = 0; G.player.wasOnWall = false;
    G.player.wrongT = 0; G.player.wrongWay = false; G.player.offT = 0;
    G.applyCaution({ level: 4, cause: "RED FLAG", phase: "stopping", total: 16, sectors: [16, 0, 0], sinceT: 0 });
    const P = G.player;
    let kicks = 0, rescues = 0, lastRL = P.rescueLastT;
    const prev = new Map();
    for (let i = 0; i < 60 * 12; i++) {
      for (const c of G.cars) prev.set(c, c.speed);
      g.step(1);
      for (const c of G.cars) if (!c.human && !c.retired && c.speed - prev.get(c) > 5) kicks++;
      if (P.rescueLastT !== lastRL) { rescues++; lastRL = P.rescueLastT; }
    }
    assert.equal(kicks, 0, "an AI held by the red is not stuck");
    assert.equal(rescues, 0, "a player held by the red is not stuck");
  } finally { g.close(); }
});

test("finishers coast home at the floor and never collide with each other", async () => {
  const g = await createGame({ track: "monza" });
  try {
    const a = g.apex, G = g.G;
    g.step(60 * 3);
    const ai = G.cars.filter((c) => !c.human);
    const [A, B] = ai;
    for (const c of ai.slice(2)) a.retire(G.cars.indexOf(c));
    const L = G.track.total;
    a.jump(0.9, 0, 0);
    const s0 = L * 0.3;
    A.s = s0; A.x = 0; A.speed = 80; A.pitState = null; A.prog = G.player.prog + 3000; A.finished = true; A.finishT = G.raceT;
    const P0 = A.prog;
    let t = 0, contact = 0, placed = false;
    for (let i = 0; i < 60 * 9; i++) {
      if (!placed && t >= 3) {
        B.s = s0; B.x = A.x; B.speed = 80; B.prog = P0; B.pitState = null; B.finished = true; B.finishT = G.raceT; B.contactT = 0;
        placed = true;
      }
      g.step(1); t += 1 / 60;
      if (placed && (A.contactT > 0 || B.contactT > 0)) contact++;
    }
    assert.equal(contact, 0, "two finished cars are never in contact");
    assert.ok(A.speed > 1, `the first finisher still rolls at the floor (speed ${A.speed.toFixed(2)})`);
  } finally { g.close(); }
});

test("the only human retiring retires only the AI it had already PASSED the failure point of", async () => {
  const g = await createGame({ track: "monza" });
  try {
    const G = g.G;
    g.apex.setInput({ throttle: true, steer: 0 });   // the player must cross the line for a distance-keyed DNF to fire
    g.step(60 * 5);
    const ai = G.cars.filter((c) => !c.human && !c.retired);
    const unreached = ai[3], passed = ai[4];
    unreached.dnfAt = 0.99; unreached.dnfWhy = "gearbox";   // drawn, but never reached: the race stops far short of it
    passed.dnfAt = 0.00001; passed.dnfWhy = "hydraulics";   // already behind the car
    G.player.dnfAt = 0.0001; G.player.dnfWhy = "engine";
    // POST_FINISH_CAP: solo DNF waits for the field, then the race ends — ship
    // assertions (passed vs unreached) still hold once the cap fires.
    for (let i = 0; i < 60 * 90 && G.state === "race"; i++) g.step(1);
    assert.equal(G.state, "results", "the race ends once the post-finish cap passes with its only human out");
    assert.equal(passed.retired, true, "a failure the car had passed is met, not scored past");
    assert.equal(passed.dnf, "hydraulics");
    assert.equal(unreached.retired, false, "a failure it never reached is not invented at the flag (round-2 rules #2)");
    assert.equal(unreached.dnf, null);
  } finally { g.close(); }
});

test("AI auto-rescue: a car crawling in the run-off builds its rescue timer; one at race pace does not", async () => {
  const g = await createGame({ track: "monza" });
  try {
    await g.race("monza", "day", "dry");
    const a = g.apex;
    a.setPhysics({ pace: 1 });
    for (let i = 0; i < 180; i++) a.step(1 / 60, 1);   // raceT > 2
    const c = g.G.cars[3];
    a.aiPlace(3, 0.3, 11, 16);                           // deep in the grass, at the floor
    let peak = 0;
    for (let i = 0; i < 60 * 8; i++) { a.step(1 / 60, 1); peak = Math.max(peak, c.rescueT || 0); }
    assert.ok(peak > 1.0, `a beached AI's rescue timer accumulates (peak ${peak.toFixed(2)} s; ~0.7 s was the ceiling)`);
    assert.ok(Math.abs(c.x) < 9, "and the car is back on the road");
    a.aiPlace(3, 0.3, 45, 9);                            // just off the edge, at race pace
    let fast = 0;
    for (let i = 0; i < 60 * 2; i++) { a.step(1 / 60, 1); fast = Math.max(fast, c.rescueT || 0); }
    assert.ok(fast < 0.5, `a car rejoining at pace is not beached (peak ${fast.toFixed(2)} s)`);
  } finally { g.close(); }
});

test("a RECOVER or shift-up tapped during the start lights never fires at green", async () => {
  const g = await createGame({ track: "monza", storage: { manual: true } });
  try {
    const G = g.G;
    G.daily.stop(); G.timeTrial = false; G.practice = false;
    await G.startRace(); g.apex.headless(true);   // not g.race(): that presses go() and skips the lights
    assert.equal(G.state, "count", "on the grid");
    const P = G.player, x0 = P.x;
    g.step(90);   // a lamp or two in
    vm.runInContext('Input.remoteEvent("recover"); Input.remoteEvent("shiftUp")', g.ctx);   // keyboard R / paddle, same latch
    for (let i = 0; i < 60 * 10 && G.state === "count"; i++) g.step(1);
    assert.equal(G.state, "race", "lights out");
    g.step(2);
    assert.ok(P.speed < 1, `no free launch from a grid RECOVER (speed ${P.speed.toFixed(2)})`);
    assert.ok(Math.abs(P.x - x0) < 0.01, `the car is still on its grid box (x ${P.x.toFixed(3)}, was ${x0.toFixed(3)}; a rescue sets 0)`);
    assert.equal(P.gear, 1, "a shift tapped on the grid does not start the car in 2nd");
    // NEGATIVE CONTROL (RC1-22): the same two taps, now in the race, DO act. So the grid test above
    // is not green merely because these events never do anything — only because lights-out clears them.
    vm.runInContext('Input.remoteEvent("recover")', g.ctx);
    g.step(3);
    assert.ok(P.speed > 5 || Math.abs(P.x - x0) > 0.01, `a RECOVER tapped in the race re-places the car (speed ${P.speed.toFixed(2)}, x ${P.x.toFixed(3)})`);
  } finally { g.close(); }
});

test("a track build that ends during the countdown leaves the race's crash sentinel armed", async () => {
  const g = await createGame({ track: "monza" });
  try {
    const G = g.G;
    G.gfx.isMobile = true;   // the sentinel is mobile-only (PerfGov.sentinelArm)
    G.daily.stop(); G.timeTrial = false; G.practice = false;
    await G.startRace(); g.apex.headless(true);
    assert.equal(G.state, "count");
    const flag = () => g.sandbox.localStorage.getItem("apex26.raceActive");
    assert.equal(flag(), "1", "the race armed it");
    G.loadTrack(G.trackIdx);   // its finally ran with state "count" and disarmed the race's flag
    assert.equal(flag(), "1", "a build during the lights must not clear the race's own flag");
  } finally { g.close(); }
});

test("a car that reverses over a sector line never records the fragment as a field sector best", async () => {
  const g = await createGame({ track: "monza" });
  try {
    const a = g.apex, G = g.G;
    g.step(60);
    const ai = G.cars.filter((c) => !c.human);
    const c = ai[0];
    for (const o of ai.slice(1)) a.retire(G.cars.indexOf(o));
    const L = G.track.total, sec = G.track.def.sectors;
    const b1 = (sec && sec.length === 2 ? sec[0] : 1 / 3) * L;   // the S1/S2 line (game.js sectorAt)
    c.lap = 2; c.s = b1 + 2; c.x = 0; c.pitState = null; c.incidentInvalidLap = false;
    g.step(1);
    assert.equal(c._secIdx, 1, "in S2");
    for (let i = 0; i < 60 && c._secIdx !== 0; i++) { c.speed = -15; g.step(1); }
    assert.equal(c._secIdx, 0, "backed over the line into S1");
    c.s = b1 - 60; c.speed = 0;   // still S1: a few seconds from rest to the line
    for (let i = 0; i < 60 * 10 && c._secIdx !== 1; i++) g.step(1);
    assert.equal(c._secIdx, 1, "drove forward into S2 again");
    assert.ok(!(G.fieldSectorBests[0] < 10), `the fragment is not an S1 best (${G.fieldSectorBests[0]})`);
  } finally { g.close(); }
});

test("a backlogged frame reports only the whole steps it drops, never the remainder it carries", async () => {
  const g = await createGame({ track: "monza" });
  try {
    g.apex.headless(true);
    const Perf = vm.runInContext("PerfGov", g.ctx), DT = vm.runInContext("PhysicsConsts.FIXED_DT", g.ctx);
    const t0 = g.sandbox.performance.now() + 1000;
    g.pumpFrame(t0);
    g.pumpFrame(t0 + 500 * DT);    // half a step: physAcc now carries a remainder
    Perf.resetFrameStats();
    g.pumpFrame(t0 + 500 * DT + 250);   // the 0.25 s clamp: 5 steps run, the rest is backlog
    const dropped = Perf.frameStats().droppedSimS, k = dropped / DT;
    assert.equal(Perf.frameStats().physicsSteps, 5);
    assert.ok(k > 0.5, `a 0.25 s frame drops backlog (${dropped})`);
    assert.ok(Math.abs(k - Math.round(k)) < 1e-6, `dropped is whole steps, not the carried remainder (${k.toFixed(4)} steps)`);
  } finally { g.close(); }
});

test("WAITING FOR PLAYERS squelches and speaks on its first show, not on every 3 s refresh", async () => {
  const g = await createGame({ track: "monza" });
  try {
    const G = g.G;
    G.daily.stop(); G.timeTrial = false; G.practice = false;
    await G.startRace(); g.apex.headless(true);
    assert.equal(G.state, "count");
    G.netPlay.awaitingStart = () => true;   // a room still waiting for its shared start
    vm.runInContext("globalThis.__stings = 0; GameAudio.radioSting = ((f) => function (...a) { globalThis.__stings++; return f.apply(this, a); })(GameAudio.radioSting);", g.ctx);
    let t = g.sandbox.performance.now() + 1000;
    g.pumpFrame(t);
    for (let i = 0; i < 60 * 20; i++) g.pumpFrame(t += 1000 / 60);   // the card expires and re-shows in one frame, every ANN_MIN_S
    assert.equal(G.state, "count", "still waiting");
    assert.equal(g.sandbox.document.getElementById("announce").hidden, false, "the card is still up");
    assert.match(g.sandbox.document.getElementById("announce-text").textContent, /WAITING FOR PLAYERS/);
    assert.equal(g.sandbox.__stings, 1, "one squelch for the wait, not one per refresh");
  } finally { g.close(); }
});

// ---- WP-G flow fixes (code review 2026-10-09) --------------------------------

const drain = async (n = 50) => { for (let i = 0; i < n; i++) await new Promise((r) => setImmediate(r)); };

test("quitToMenu() during a race load cancels it: the body does not go on to count the grid down", async () => {
  const g = await createGame({ track: "monza", carMeshes: false });
  try {
    const G = g.G;
    G.quitToMenu();
    const round0 = G.raceRound;
    const started = G.startRace();   // SessionEntry hands startRaceBody its own `current`
    for (let i = 0; i < 18; i++) await Promise.resolve();
    G.quitToMenu();
    assert.equal(await started, false, "a canceled race body resolves false without rejecting");
    await drain();
    assert.equal(G.state, "menu", "the abandoned load must not undo the quit");
    assert.equal(G.raceRound, round0, "and must not count a race that never started");
  } finally { g.close(); }
});

test("a second startRace() after the first passed raceIndex++ joins it: one race, round +1, state stays count", async () => {
  const g = await createGame({ track: "monza", carMeshes: false });
  try {
    const G = g.G;
    G.quitToMenu();
    const round0 = G.raceRound;
    const first = G.startRace();
    for (let i = 0; i < 20; i++) await Promise.resolve();
    assert.equal(G.raceRound, round0 + 1, "the first body is past raceIndex++");
    const second = G.startRace();
    await Promise.allSettled([first, second]);
    await drain(80);
    assert.equal(second, first, "the in-flight request is shared, not restarted");
    assert.equal(G.state, "count", "the freshly started race survives its duplicate");
    assert.equal(G.raceRound, round0 + 1);
  } finally { g.close(); }
});

test("manual RECOVER does nothing to a car serving a pit stop; on the track it still puts the car back", async () => {
  const g = await createGame({ track: "monza" });
  try {
    const G = g.G, p = G.player;
    g.step(60 * 3);
    assert.equal(G.state, "race");
    // rescuePlayer() stamps rescueLastT; the pit-box hold moves x on its own, so x is no witness.
    p.rescueLastT = -1; p.pitState = "box"; p.speed = 0;
    vm.runInContext('Input.remoteEvent("recover")', g.ctx);
    g.step(1);
    assert.equal(p.rescueLastT, -1, "a boxed car is not rescued: x = 0 would strand it on the racing surface");
    p.pitState = null;
    vm.runInContext('Input.remoteEvent("recover")', g.ctx);
    g.step(1);
    assert.notEqual(p.rescueLastT, -1, "a car on the racing surface is still recovered");
  } finally { g.close(); }
});

test("startRaceBody aborts to the menu when the race-session bundle failed to load (source-level)", async () => {
  // The loader is a closure over game.js and game-vm's onScript hook never sees the shell's scripts, so a behavioural
  // stub of ensureRaceSession is not reachable from here. Pin the guard instead: the boolean is read, and a false
  // stops the loading screen, quits to the menu, tells the player and returns before the stubs can start a race.
  const src = gameSource();
  const body = src.slice(src.indexOf("async function startRaceBody()"), src.indexOf("async function startRaceBody()") + 6000);
  assert.match(body, /let sessionOk = await ensureRaceSession\(\);/);   // #2625: a `let`, so RETRY on the loading card can re-run the load
  assert.match(body, /if \(!sessionOk\) \{ loadingScreen\.stop\(\); quitToMenu\(\); announce\("RACE MODULES FAILED TO LOAD — RETRY", 3, "info"\); return false; \}/);
  assert.ok(body.indexOf("if (!sessionOk)") < body.indexOf("await ensureAudio()"), "the abort comes before anything starts the race");
});

test("RESUME holds a solo race ~1.2 s on the start plate, a pause cancels it, and a net race resumes at once", async () => {
  const g = await createGame({ track: "monza" });
  try {
    const G = g.G, $ = (id) => g.sandbox.document.getElementById(id), lights = $("lights");
    g.apex.headless(true);
    assert.equal(G.state, "race");
    let t = g.sandbox.performance.now() + 1000;
    const run = (s) => { for (let i = 0; i < Math.round(s * 60); i++) g.pumpFrame(t += 1000 / 60); };
    // setPaused stamps lastFrame from the real clock, as a browser's next rAF stamp
    // follows it; re-base the pumped clock there or the first frame is a 0.25 s gap.
    const resume = () => { $("pm-resume").onclick(); t = g.sandbox.performance.now(); };
    run(0.2);
    $("pausebtn").onclick(); run(0.1); resume();
    assert.equal(G.paused, false);
    let t0 = G.raceT;
    run(0.5);
    assert.equal(G.raceT, t0, "no physics step in the first 0.5 s after RESUME");
    assert.equal(lights.hidden, false, "the start plate carries the count");
    assert.equal(lights.dataset.count, "2", "3, 2, 1 at 0.4 s a beat");
    // A second pause mid-count cancels it cleanly; the next RESUME counts from 3 again.
    $("pausebtn").onclick();
    assert.equal(lights.hidden, true, "pausing drops the plate");
    run(0.1); resume();
    assert.equal(lights.dataset.count, "3");
    // RECOVER CAR (PR #1385's pause tile) is setPaused(false) and then the R-key edge:
    // the hold keeps that edge for its first live frame instead of clearing it as a pause does.
    const p = G.player, rescued = p.rescueLastT;
    vm.runInContext('Input.remoteEvent("recover")', g.ctx);
    run(1.1);
    assert.equal(G.raceT, t0, "still held at 1.1 s");
    run(0.3);
    assert.ok(G.raceT > t0, `the sim runs again after the count (raceT ${G.raceT} vs ${t0})`);
    assert.equal(lights.hidden, true, "the plate clears at the end of the count");
    assert.notEqual(p.rescueLastT, rescued, "a RECOVER pressed during the count lands when it ends");
    // A NETWORKED race runs on under the card and never holds.
    const active = G.netPlay.active;
    G.netPlay.active = () => true;
    try {
      $("pausebtn").onclick(); resume();
      t0 = G.raceT;
      run(0.2);
      assert.ok(G.raceT > t0, "a net race steps at once after RESUME");
    } finally { G.netPlay.active = active; }
  } finally { g.close(); }
});
test("a flag that falls under the pause closes the pause tools: no lt-open / photo mode / previewed night into RACE AGAIN (2-F1)", async () => {
  const g = await createGame({ track: "monza", carMeshes: false });
  try {
    const G = g.G, doc = g.sandbox.document, $ = (id) => doc.getElementById(id);
    g.step(30);
    assert.equal(G.state, "race");
    const tod0 = G.raceTimeOfDay;
    $("pausebtn").onclick();
    $("pm-lighting").onclick();   // SETTINGS > LIGHTING TUNER, then a preview and FREE CAMERA inside it
    G.setTimeOfDay(tod0 === "night" ? "day" : "night");
    $("pc-toggle").onclick();
    assert.ok(doc.body.classList.contains("lt-open") && G.photoMode, "precondition: the tuner and photo mode are up");
    assert.notEqual(G.raceTimeOfDay, tod0, "precondition: the preview moved the time of day");
    G.endRace();   // a VS FRIEND race runs on under the card: the rival's flag (or the host's RESULT) ends it
    assert.equal(G.state, "results");
    assert.equal(doc.body.classList.contains("lt-open"), false, "lt-open hides #hud, #pausebtn and every .touchbtn in the next race");
    assert.equal(G.photoMode, false, "photo mode's capture-phase key handler would eat WASD/arrows next race");
    assert.equal($("lighting").hidden, true);
    assert.equal(G.raceTimeOfDay, tod0, "the tuner's preview is not the next race's time of day");
  } finally { g.close(); }
});

test("QUIT from the pit WORK garage closes it at the title without starting the engine (2-F2)", async () => {
  const g = await createGame({ track: "monza", carMeshes: false });
  try {
    const sb = g.sandbox, G = g.G, $ = (id) => sb.document.getElementById(id);
    g.step(30);
    const p = G.player; p.pitState = "box"; p.pitT = 8; p.local = true;
    G.els.workBtn.onclick();   // WORK ON CAR from the box
    assert.ok(!$("carsetup").hidden && G.setupPreviewOn, "precondition: the pit garage is up");
    let starts = 0; const orig = sb.GameAudio.startEngine.bind(sb.GameAudio);
    sb.GameAudio.startEngine = (...a) => { starts++; return orig(...a); };
    G.soundOn = true;
    G.quitToMenu();   // the pause card's QUIT TO MENU (stacked by a hidden tab) and the rotate blocker's EXIT RACE
    assert.equal(G.state, "menu");
    assert.equal($("carsetup").hidden, true, "the garage must not stay over the title with RETURN TO RACE live");
    assert.equal(G.setupPreviewOn, false, "the turntable stops drawing (and the Home world is eligible again)");
    assert.equal(starts, 0, "no engine loop at the title");
  } finally { g.close(); }
});

test("championship NEXT ROUND -> qualifying sheet hides the finished race's HUD, so BACK x3 reaches a clean title (2-F3)", async () => {
  const g = await createGame({ track: "monza", carMeshes: false });
  try {
    const sb = g.sandbox, G = g.G, $ = (id) => sb.document.getElementById(id);
    g.step(10);
    G.flow = "season"; G.season = sb.SeasonCal.load();
    G.endRace();
    assert.equal(G.els.hud.hidden, false, "precondition: the results sheet keeps the HUD under its scrim");
    G.els.resNext.onclick();   // NEXT ROUND -> qualifying
    await g.settle(() => G.state !== "results", 15000);
    assert.equal(G.state, "menu", "precondition: openQualiBody ran (the sheet's state)");
    assert.equal($("quali").hidden, false, "precondition: the qualifying sheet is up");
    // q-back -> rs-cancel -> the picker's BACK reaches #overlay, which is no .screen: the HUD showed through its 36 % wash.
    assert.equal(G.els.hud.hidden, true);
    assert.equal(G.els.lights.hidden, true);
  } finally { g.close(); }
});

// ---- bug-hunt 2026-10-09 (W5 game) --------------------------------------------------------

const portraitPhone = (sandbox) => {   // only the rotate blocker's own query matches; every other query stays inert
  const noop = () => {};
  sandbox.matchMedia = (q) => ({ matches: /orientation: portrait/.test(q), media: q, onchange: null, addEventListener: noop, removeEventListener: noop, addListener: noop, removeListener: noop });
};

test("3.1 a race started on a portrait phone does not start the engine / rain under the rotate blocker", async () => {
  const g = await createGame({ track: "monza", onSandbox: portraitPhone });
  try {
    const G = g.G;
    G.daily.stop(); G.timeTrial = false; G.practice = false;
    const GA = vm.runInContext("GameAudio", g.ctx), seen = [];
    for (const k of ["startEngine", "startRain"]) { const f = GA[k]; GA[k] = function (...a) { seen.push(k + ":" + (G.paused ? "paused" : "live")); return f.apply(this, a); }; }
    G.raceWeather = "rain";
    await G.startRace(); g.apex.headless(true);
    assert.equal(G.state, "count");
    assert.equal(G.paused, true, "the rotate blocker paused the race");
    assert.ok(!seen.some((e) => /:paused$/.test(e)), `engine / rain were started while paused: ${seen}`);
  } finally { g.close(); }
});

test("3.2 a real race (Data Hub JUMP IN) is never diverted into a qualifying sheet when GRID = QUALIFYING LAP", async () => {
  const g = await createGame({ track: "monza" });
  try {
    const G = g.G;
    G.daily.stop(); G.timeTrial = false; G.practice = false;
    G.raceGrid = "quali";
    vm.runInContext(readFileSync(join(ROOT, "js/data/real-race-tab.js"), "utf8"), g.ctx);
    const Data = vm.runInContext("DataRealRace", g.ctx), Teams = vm.runInContext("Teams", g.ctx);
    const Tracks = vm.runInContext("Tracks", g.ctx), Real = vm.runInContext("RealRace", g.ctx);
    const fixture = JSON.parse(readFileSync(join(ROOT, "tests/fixtures/openf1-baku-2026-race.json"), "utf8"));
    const script = Data.build(fixture, (name) => Teams.LIST.find((t) => t.name === name) || null, Tracks.LIST);
    Real.launch(script, { seat: "STR" });
    await g.settle(() => G.track?.def?.id === "baku" && ["count", "race"].includes(G.state), 8000);
    assert.equal(Real.status().active, true, "the real race is staged");
    assert.ok(["count", "race"].includes(G.state), `the race started (state ${G.state})`);
    assert.equal(G.session, "race", "the session is the race itself, not a qualifying lap");
  } finally { g.close(); }
});

test("3.4 practice is per-session: quitToMenu and the top of startRace clear it before the loading card reads it", async () => {
  const g = await createGame({ track: "monza" });
  try {
    const G = g.G;
    G.daily.stop(); G.timeTrial = false;
    G.practice = true;
    assert.equal(G.practice, true);
    G.quitToMenu();
    assert.equal(G.practice, false, "a practice session quit from the pause menu is not the next GP's");
    G.practice = true;   // armed again, then a start request (the body clears it only after several awaits)
    const p = G.startRace();
    assert.equal(G.practice, false, "cleared synchronously, before loadingInfo() paints the card");
    await p;
  } finally { g.close(); }
});

test("3.5 quitToMenu after a time trial restores the race tyre model", async () => {
  const g = await createGame({ track: "monza", storage: { tyreWear: "real" } });
  try {
    const G = g.G;
    assert.equal(G.raceTyreWear, "real");
    await g.apex.tt("monza");   // awaitable: resolves when the time trial has started
    assert.equal(G.tyres.on(), false, "the time trial runs with the model off");
    G.quitToMenu();
    assert.equal(G.tyres.on(), G.raceTyreWear !== "off", "back at the menu the GP's tyre model is back");
    assert.equal(G.tyres.on(), true);
  } finally { g.close(); }
});

test("3.6 the derived MIXED-weather plan is cached until a setting it reads changes; a host's assigned plan survives settings applied after it", async () => {
  const g = await createGame({ track: "monza" });
  try {
    const G = g.G;
    G.raceChangeable = true; G.wxArcPlan = null;
    const a = G.wxArcPlan;
    assert.ok(a && a.to && a.dur > 0, "a changeable race has a plan");
    assert.equal(G.wxArcPlan, a, "published twice, the same {to, dur} object (what startChangeable arms is what lobby published)");
    G.raceLaps = G.raceLaps === 5 ? 3 : 5;
    const b = G.wxArcPlan;
    assert.notEqual(b, a, "a laps change re-derives (capPlanDur reads the laps)");
    assert.equal(G.wxArcPlan, b);
    G.raceWeather = G.raceWeather === "dry" ? "wet" : "dry";
    assert.notEqual(G.wxArcPlan, b, "a weather change re-derives (the target is never the starting weather)");
    G.trackIdx = G.trackIdx === 0 ? 1 : 0;
    const c = G.wxArcPlan;
    G.raceChangeable = false;
    assert.equal(G.wxArcPlan, null, "no plan when the chip is not MIXED");
    G.raceChangeable = true;
    assert.notEqual(G.wxArcPlan, c, "toggling the chip re-derives");
    // lobby.applySettings assigns the host's plan and THEN the weather / laps: it must not be wiped
    G.wxArcPlan = { to: "rain", dur: 200 };
    const host = G.wxArcPlan;
    G.raceWeather = "dry"; G.raceLaps = 7; G.trackIdx = 2; G.raceChangeable = true;
    assert.equal(G.wxArcPlan, host, "an assigned (host) plan is not a derived one");
    assert.deepEqual({ ...G.wxArcPlan }, { to: "rain", dur: 200 });
  } finally { g.close(); }
});

test("3.12 a finished or retired car's squeal / smoke / ERS cue state is zeroed by its early-out, not frozen at the last value", async () => {
  const g = await createGame({ track: "monza" });
  try {
    const a = g.apex, G = g.G;
    g.step(60 * 3);
    const [A, B] = G.cars.filter((c) => !c.human);
    const dirty = (c) => { c.skidIntensity = 0.8; c.wheelLock = 1; c.brakeDemand = 1; c.throttleDemand = 1; c.deploying = true; c.towing = 0.5; c.wake = 0.5; c.collideT = 0.35; };
    dirty(A); A.finished = true; A.finishT = G.raceT;
    a.retire(G.cars.indexOf(B)); dirty(B);
    g.step(1);
    for (const [name, c] of [["finished", A], ["retired", B]]) {
      assert.equal(c.skidIntensity, 0, `${name}: skidIntensity`);
      assert.equal(c.wheelLock, 0, `${name}: wheelLock`);
      assert.equal(c.brakeDemand, 0, `${name}: brakeDemand`);
      assert.equal(c.throttleDemand, 0, `${name}: throttleDemand`);
      assert.equal(c.deploying, false, `${name}: deploying`);
      assert.equal(c.towing, 0, `${name}: towing`);
      assert.equal(c.wake, 0, `${name}: wake`);
      assert.ok(c.collideT < 0.35, `${name}: collideT decays (${c.collideT})`);
    }
  } finally { g.close(); }
});

test("7.6 the AI's mistake-roll key for a braking zone just past the start line is wrapped, like its siblings", async () => {
  const g = await createGame({ track: "monza" });
  try {
    const G = g.G, a = g.apex, L = G.track.total;
    G.track.toTurnIn.fill(30 + L / G.track.n);   // a turn-in ~30 m ahead of the car, wherever it is (attackAt subtracts the offset within the cell)
    const i = G.cars.findIndex((c) => !c.human), c = G.cars[i];
    a.aiPlace(i, (L - 20) / L, 60, 0);   // 20 m before the line: s + toTurnIn runs 10 m past the lap's end
    c.zoneKey = -1; c.errT = 0;
    g.step(1);
    assert.ok(c.zoneKey >= 0, "the roll fires for a zone within a second of the car");
    assert.ok(c.zoneKey < L, `the key is an arc position on THIS lap (${c.zoneKey} of ${L.toFixed(0)}), not one past the line: the first corner would get two rolls per lap`);
  } finally { g.close(); }
});

test("3.11 race, Daily, race: stopping the Daily resumes the sim stream where it was, instead of rewinding it to the seed", async () => {
  const g = await createGame({ track: "monza" });
  try {
    const G = g.G;
    G.daily.stop();
    await G.startRace(); g.step(30);                 // race 1 spends draws off the stream
    const seed = G.simSeed(), pos = G.simSeed(undefined, true);
    assert.notEqual(pos, seed, "precondition: the stream has advanced past its start");
    G.quitToMenu();                                  // (quitToMenu stops a daily; none is active yet)
    assert.equal(G.simSeed(undefined, true), pos, "quitting the race does not touch the stream");
    G.daily.select();
    assert.notEqual(G.simSeed(), seed, "the Daily took the seed over");
    assert.equal(G.simSeed(undefined, true), G.simSeed(), "...and restarted the stream at the day's seed (a fair, repeatable lights-out hold)");
    G.daily.stop();
    assert.equal(G.simSeed(), seed, "the session seed is back");
    assert.equal(G.simSeed(undefined, true), pos, "...and so is the stream position: race 2 does not replay race 1's jitter");
    G.seed = seed;   // the setter's own contract is unchanged: it restarts the stream
    assert.equal(G.simSeed(undefined, true), seed);
  } finally { g.close(); }
});

test("3.10 pause-menu RESTART does not run the old race through the async start window", async () => {
  const g = await createGame({ track: "monza" });
  try {
    const G = g.G;
    G.daily.stop(); G.timeTrial = false; G.practice = false;
    await G.startRace(); g.apex.headless(true);
    g.apex.go(); g.step(120);
    assert.equal(G.state, "race");
    const carsBefore = G.cars, t0 = G.raceT;
    assert.ok(t0 > 1, "precondition: the old race is running");
    g.sandbox.document.getElementById("pm-restart").onclick();   // setPaused(false) + startRace(): the body is still awaiting
    assert.equal(G.cars, carsBefore, "precondition: the new field is not built yet");
    let t = g.sandbox.performance.now() + 1000;
    for (let i = 0; i < 30; i++) g.pumpFrame(t += 1000 / 60);
    assert.equal(G.cars, carsBefore, "still the old field (the body has not run a turn)");
    assert.equal(G.raceT, t0, "the old race's clock did not advance while the restart was loading");
    await g.settle(() => G.cars !== carsBefore && G.state === "count", 8000);
    assert.equal(G.state, "count", "the restart lands on the grid");
    assert.equal(G.raceT, 0);
    assert.equal(G.paused, false);
    assert.equal(G.frozen, false, "the body's own reset lifts the hold");
  } finally { g.close(); }
});

// 3.14 — the garage drive-out on the three routes that used to call startRaceCovered (card only, no garage-out, no flyby).
// The VM has no frame pump and flushes its timer queue by hand: drive both to the first garage frame (setupPreviewOn is
// what studioOpen raises for the drive-out) and assert that state is still "menu", i.e. before the countdown.
async function untilGarageOrGrid(g, max = 3000) {
  const G = g.G, seen = [];
  let t = g.sandbox.performance.now() + 1000, garage = false;
  for (let i = 0; i < max && !garage && G.state !== "count"; i++) {
    seen.push(G.state);
    await new Promise((r) => setImmediate(r));
    if (i % 3 === 0) g.pumpFrame(t += 16);
    g.flushTimers();
    garage = !!G.setupPreviewOn;
  }
  return { garage, state: G.state, seen };
}

test("3.14 qualifying: TO THE GRID plays the garage drive-out before the countdown (state menu, then the garage), not the card straight up", async () => {
  const g = await createGame({ track: "monza" });
  try {
    const G = g.G, doc = g.sandbox.document;
    G.daily.stop(); G.timeTrial = false; G.practice = false;
    G.quitToMenu();
    G.raceGrid = "quali";
    G.startRace();   // no classification yet: the sheet opens
    await g.settle(() => !doc.getElementById("quali").hidden, 4000);
    assert.equal(G.session, "quali");
    doc.getElementById("q-sim").onclick();
    doc.getElementById("q-go").onclick();
    const r = await untilGarageOrGrid(g);
    assert.equal(r.garage, true, `the garage drive-out ran (state ${r.state})`);
    assert.equal(r.state, "menu", "…while the session is still in the menu, before the countdown");
    assert.equal(G.session, "race", "TO THE GRID is the race, not another qualifying lap");
  } finally { g.close(); }
});

test("3.14 qualifying: DRIVE plays the garage drive-out too, and stays the one-lap session", async () => {
  const g = await createGame({ track: "monza" });
  try {
    const G = g.G, doc = g.sandbox.document;
    G.daily.stop(); G.timeTrial = false; G.practice = false;
    G.quitToMenu();
    G.raceGrid = "quali";
    G.startRace();
    await g.settle(() => !doc.getElementById("quali").hidden, 4000);
    doc.getElementById("q-drive").onclick();
    const r = await untilGarageOrGrid(g);
    assert.equal(r.garage, true, `the garage drive-out ran (state ${r.state})`);
    assert.equal(r.state, "menu");
    assert.equal(G.session, "quali");
  } finally { g.close(); }
});

test("3.14 season NEXT RACE with qualifying off: the garage drive-out, then the race; a headless page still starts at once", async () => {
  for (const headless of [false, true]) {
    const g = await createGame({ track: "monza", storage: { seasonCfg: { quali: false } } });
    try {
      const G = g.G, doc = g.sandbox.document;
      G.daily.stop(); G.timeTrial = false; G.practice = false;
      G.quitToMenu();
      G.seasonMode = true;
      await G.startRace();
      g.apex.go(); g.step(60);
      g.apex.park(0.9); g.apex.finishRace();
      assert.equal(G.state, "results");
      if (headless) g.apex.headless(true);
      doc.getElementById("res-next").onclick();
      const r = await untilGarageOrGrid(g);
      if (headless) {
        assert.equal(r.garage, false, "a headless page has no frames: no garage-out");
        assert.equal(r.state, "count", "…and starts at once, as the agent / dev callers always did");
      } else {
        assert.equal(r.garage, true, `the garage drive-out ran (state ${r.state})`);
        assert.equal(r.state, "menu");
        assert.equal(G.seasonMode, true, "the championship flow is kept (quitToMenu would have reset it)");
      }
    } finally { g.close(); }
  }
});

// Launch unification (bug-hunt 2): every session the player STARTS themselves plays garage drive-out, card, flyby. The routes below were
// audited route by route; the quick restarts (RACE AGAIN / TRY AGAIN, pause RESTART, WATCH) are pinned as quick on purpose.
test("launch: Data Hub JUMP IN (opts.intro) plays the garage drive-out before the countdown; a bare launch() still starts at once", async () => {
  for (const intro of [true, false]) {
    const g = await createGame({ track: "monza" });
    try {
      const G = g.G;
      g.sandbox.GLX.makeFrustumPlanes = () => null;   // the VM's stub returns [] (no planes): the menu grid's rivals would index into it
      G.daily.stop(); G.timeTrial = false; G.practice = false;
      G.quitToMenu();   // the hub is opened from the menu (createGame leaves a race running)
      vm.runInContext(readFileSync(join(ROOT, "js/data/real-race-tab.js"), "utf8"), g.ctx);
      const Data = vm.runInContext("DataRealRace", g.ctx), Teams = vm.runInContext("Teams", g.ctx);
      const Tracks = vm.runInContext("Tracks", g.ctx), Real = vm.runInContext("RealRace", g.ctx);
      const fixture = JSON.parse(readFileSync(join(ROOT, "tests/fixtures/openf1-baku-2026-race.json"), "utf8"));
      const script = Data.build(fixture, (name) => Teams.LIST.find((t) => t.name === name) || null, Tracks.LIST);
      Real.launch(script, { seat: "STR", intro });
      const r = await untilGarageOrGrid(g);
      if (intro) {
        assert.equal(r.garage, true, `JUMP IN played the garage drive-out (state ${r.state})`);
        assert.equal(r.state, "menu", "…before the countdown");
        assert.equal(Real.status().active, true, "the real race is staged under the intro");
      } else {
        assert.equal(r.garage, false, "a page probe calling launch() keeps its synchronous start");
        assert.equal(r.state, "count");
      }
    } finally { g.close(); }
  }
});

test("launch: a TIME TRIAL and the DAILY, started from RACE SETTINGS, play the garage drive-out; TRY AGAIN after a trial stays a quick restart", async () => {
  for (const daily of [false, true]) {
  const g = await createGame({ track: "monza" });
  try {
    const G = g.G, doc = g.sandbox.document;
    G.daily.stop(); G.practice = false;
    G.quitToMenu();
    G.flow = "gp"; G.session = "tt";
    if (daily) G.daily.select("2026-09-14");   // the title's DAILY: the picker's select(), then the same sheet and GO as any trial
    G.openRaceSettings("select");
    assert.equal(doc.getElementById("race-settings").hidden, false);
    doc.getElementById("rs-go").onclick();
    const r = await untilGarageOrGrid(g);
    assert.equal(r.garage, true, `the time trial's start played the garage drive-out (state ${r.state})`);
    assert.equal(r.state, "menu", "…before the countdown");
    assert.equal(G.session, "tt");
    await g.settle(() => G.state === "count" || G.state === "race", 20000);
    g.apex.go(); g.step(60);
    g.apex.finishRace();
    assert.equal(G.state, "results");
    doc.getElementById("res-next").onclick();   // TRY AGAIN: a quick restart, left as it was
    const q = await untilGarageOrGrid(g);
    assert.equal(q.garage, false, "TRY AGAIN plays no garage-out");
    assert.ok(q.state === "count" || q.state === "race", `…and starts at once (state ${q.state})`);
  } finally { g.close(); }
  }
});

// ---- R3-STATES / R3-STATES-3 (hunt3 train) --------------------------------
// The VM DOM has no markup, so its querySelectorAll(".screen") is empty and
// closeRaceSheets()' sweep would be inert: hand it the shell's own `.screen` list.
const SCREEN_IDS = [...fs.readFileSync(new URL("../../index.html", import.meta.url), "utf8").matchAll(/<[a-z]+\b[^>]*>/g)]
  .map((m) => m[0]).filter((t) => /\bclass="[^"]*\bscreen\b/.test(t)).map((t) => (/\bid="([^"]+)"/.exec(t) || [])[1]).filter(Boolean);
function withScreens(g) {
  const doc = g.sandbox.document, qsa = doc.querySelectorAll;
  doc.querySelectorAll = (sel) => (sel === ".screen" ? SCREEN_IDS.map((id) => doc.getElementById(id)) : qsa(sel));
  return doc;
}
test("the shell marks every pause-reachable sheet .screen (the sweep's contract)", () => {
  for (const id of ["pausemenu", "pmsettings", "standings", "howtoplay", "track-detail", "quali", "results", "race-settings", "carsetup"])
    assert.ok(SCREEN_IDS.includes(id), "#" + id + " is a .screen");
  assert.ok(SCREEN_IDS.includes("loading"), "#loading is one too — closeRaceSheets leaves it to loadingScreen.stop()");
});

test("QUIT over the pit-stop garage closes it: no turntable, no stale RETURN TO RACE on the title", async () => {
  const g = await createGame({ carMeshes: false, track: "monza" });
  try {
    const doc = withScreens(g), $ = (id) => doc.getElementById(id), G = g.G;
    g.step(30);
    G.paused = true; G.openGarage("pit"); g.flushTimers();   // openPitWork()'s two writes (it is gated on a car stopped in its box)
    assert.equal($("cs-done").textContent, "RETURN TO RACE");
    assert.equal(G.setupPreviewOn, true);
    $("pm-quit").click(); g.flushTimers();   // the pause card a hidden tab stacks over the garage
    assert.equal(G.state, "menu");
    assert.equal($("carsetup").hidden, true, "#carsetup goes with the race");
    assert.equal(G.setupPreviewOn, false, "the garage turntable no longer draws over the title");
    // The "pit" return path went too: DONE on that stale screen ran closePitWork()
    // in state "menu" (a dead race's player, the engine restarted).
    $("race-settings").hidden = true;
    $("cs-done").click(); g.flushTimers();
    assert.equal($("race-settings").hidden, false, "DONE takes the picker path (garageReturn reset), not RETURN TO RACE");
  } finally { g.close(); }
});

for (const sheet of ["pm-settings", "pm-standings", "pm-howto"]) {
  test(`the portrait blocker's EXIT under ${sheet.slice(3).toUpperCase()} leaves no race sheet over the title`, async () => {
    const g = await createGame({ carMeshes: false, track: "monza" });
    try {
      const doc = withScreens(g), $ = (id) => doc.getElementById(id), G = g.G;
      for (const id of SCREEN_IDS) $(id).hidden = true;   // the shell's start: every sheet down
      g.step(20); $("pausebtn").click();
      $(sheet).click();
      const open = { "pm-settings": "pmsettings", "pm-standings": "standings", "pm-howto": "howtoplay" }[sheet];
      assert.equal($(open).hidden, false, "#" + open + " is up");
      $("rotate-exit").click(); g.flushTimers();   // reachable over a sheet: only the pause CARD hides the blocker
      assert.equal(G.state, "menu");
      assert.equal($("overlay").hidden, false);
      for (const id of ["pmsettings", "standings", "howtoplay", "pausemenu", "results", "race-settings"])
        assert.equal($(id).hidden, true, "#" + id + " closed by the quit");
    } finally { g.close(); }
  });
}

test("NEXT ROUND's qualifying sheet hides the finished race's HUD", async () => {
  const g = await createGame({ carMeshes: false, track: "monza" });
  try {
    const doc = withScreens(g), $ = (id) => doc.getElementById(id), G = g.G;
    g.apex.go(); g.step(10); g.apex.finishRace();
    assert.equal(G.state, "results");
    assert.equal($("hud").hidden, false, "the results keep the race HUD");
    G.openQualiForNet(null);   // openQuali → openQualiBody, the transition res-next makes in a season
    await g.settle(() => G.session === "quali" && G.state === "menu" && !$("quali").hidden, 3000);
    assert.equal($("quali").hidden, false, "the sheet is up");
    assert.equal($("results").hidden, true);
    assert.equal($("hud").hidden, true, "no dead HUD under the menu-state sheet");
  } finally { g.close(); }
});

test("a red-flag restart breaks the instant-replay timeline (the re-grid is a teleport, not motion)", async () => {
  // Ring is a closure handle, never G.replayBuf (1a-F3): trap ReplayBuf.create.
  let rb = null;
  const g = await createGame({
    carMeshes: false, track: "monza",
    onSandbox: (sb) => {
      let mod;
      Object.defineProperty(sb, "ReplayBuf", { configurable: true, enumerable: true, get: () => mod,
        set: (v) => { mod = Object.assign({}, v, { create: (...a) => (rb = v.create(...a)) }); } });
    },
  });
  try {
    const G = g.G;
    assert.ok(rb, "ReplayBuf.create was trapped");
    let breaks = 0;
    const real = rb.breakTimeline;
    assert.equal(typeof real, "function", "ReplayBuf has the explicit break");
    rb.breakTimeline = (...a) => { breaks++; return real.apply(rb, a); };
    g.apex.setInput({ throttle: true });
    for (let i = 0; i < 100; i++) { g.step(2); rb.onTick(G.raceT, G.cars, G.state); }   // the ring samples from tick(), which step() bypasses
    assert.equal(breaks, 0);
    assert.equal(g.apex.redFlag().state, "count");
    assert.equal(breaks, 1, "redFlagRestart() marks the break before the next sample");
  } finally { g.close(); }
});

async function finishedPlayerWithRunner() {
  const g = await createGame({ track: "monza", carMeshes: false });
  const a = g.apex, G = g.G;
  a.headless(true);
  await a.race("monza", "default", "dry", { laps: 3 });
  a.go(); g.step(60);
  const L = G.track.total, P = G.player;
  const ai = G.cars.filter((c) => !c.human);
  for (const c of ai.slice(1)) a.retire(G.cars.indexOf(c));
  const slow = ai[0];
  slow.lap = 2; slow.s = L * 0.1; slow.prog = 2 * L + L * 0.1; slow.speed = 20; slow.x = 0; slow.dnfAt = null;
  a.jump((L - 40) / L, 80, 0); P.lap = 3; P.prog = 3 * L - 40;
  a.setInput({ throttle: true, steer: 0 });
  for (let i = 0; i < 60 * 20; i++) g.step(1);
  return { g, G, P, slow, pauseBtn: (id) => g.sandbox.document.getElementById(id) };
}

test("POST-FINISH (solo): the player's flag does not end the race while an AI is still running; SKIP settles it", async () => {
  const { g, G, P, slow, pauseBtn } = await finishedPlayerWithRunner();
  try {
    assert.equal(P.finished, true, "the player took the flag");
    assert.equal(slow.finished, false, "the AI is nowhere near its line");
    assert.equal(G.state, "race", "the race waits for the field instead of ending 2.2 s after the player");
    G.els.pausebtn.onclick();
    assert.equal(pauseBtn("pm-skip-results").hidden, false, "the pause card offers SKIP TO RESULTS while the field finishes");
    pauseBtn("pm-skip-results").onclick();
    assert.equal(G.state, "results", "SKIP calls endRace now");
    assert.equal(slow.finished, false, "the runner is classified by progress, as before");
  } finally { g.close(); }
});

test("POST-FINISH (solo): QUIT TO MENU after the flag settles the result first", async () => {
  const { g, G, P, pauseBtn } = await finishedPlayerWithRunner();
  try {
    assert.equal(G.state, "race");
    assert.ok(!P.finPos, "not classified yet");
    G.els.pausebtn.onclick();
    pauseBtn("pm-quit").onclick();
    assert.equal(P.finPos, 1, "endRace ran before the session was dropped: the career/season settlement is not lost");
    assert.equal(G.state, "menu");
  } finally { g.close(); }
});

test("PLAYER DNF (solo): the race keeps running for the field instead of ending 2.2 s later; the cap ends it as a short run", async () => {
  const g = await createGame({ track: "monza", carMeshes: false });
  try {
    const a = g.apex, G = g.G;
    a.headless(true);
    await a.race("monza", "default", "dry", { laps: 10 });
    a.go(); g.step(60);
    for (const c of G.cars) if (!c.human) c.dnfAt = null;
    a.retire(null);
    g.step(60 * 10);
    assert.equal(G.player.retired, true);
    assert.equal(G.state, "race", "10 s after the DNF the race is still on — rivals keep racing under the TV camera");
    g.step(60 * 80);
    assert.equal(G.state, "results", "POST_FINISH_CAP forces the end");
    assert.equal(G.cars.some((c) => c.finished && !c.retired), false, "nobody saw the flag: RaceControl.shortRun applies");
  } finally { g.close(); }
});


// ── THE PIT GARAGE HOLDS ITS OWN PAUSE (bug-hunt 3, 2026-10-10) ───────────────
// setPaused(true) leaves the garage's pause alone (as setPaused(false) already
// did), quitToMenu takes the garage down, closePitWork re-holds the wake lock.
// The lock mock is tests/specs/wake-lock.spec.js's: it auto-releases on hide.
// The two tests live here and not in wake-lock-vm.test.mjs because that file is
// the spec's TWIN and must declare exactly the spec's test count.
async function pitGarage(g) {
  const doc = g.sandbox.document, log = [];
  g.sandbox.navigator.wakeLock = {
    request: (type) => {
      log.push("request:" + type);
      let released = false;
      const listeners = {};
      const sentinel = {
        addEventListener: (ev, cb) => { listeners[ev] = cb; },
        release: () => { if (!released) { released = true; log.push("release"); if (listeners.release) listeners.release(); } return Promise.resolve(); },
      };
      doc.addEventListener("visibilitychange", () => { if (doc.hidden) sentinel.release(); });
      return Promise.resolve(sentinel);
    },
  };
  await g.race("bahrain", "day", "dry");
  assert.ok(await settle(() => log.includes("request:screen"), 4000), "the race holds the lock");
  // On the jacks by decree: PitLane.canWork reads pitState "box" with hold left
  // (pit-lane-vm drives the real stop; this is about the pause, not the lane).
  const car = g.G.cars.find((c) => c.local);
  car.pitState = "box"; car.pitT = 5;
  doc.getElementById("pausemenu").hidden = true;       // index.html ships the card hidden; the VM DOM does not parse the shell
  doc.getElementById("hud-work").onclick();            // WORK ON CAR (openPitWork)
  const tick = () => new Promise((r) => setImmediate(r));
  const visibility = async (hidden) => { doc.hidden = hidden; doc.dispatchEvent({ type: "visibilitychange" }); await tick(); };
  return { doc, log, car, tick, visibility, garage: doc.getElementById("carsetup"), card: doc.getElementById("pausemenu") };
}

test("a hidden tab under WORK ON CAR shows no pause card, stays the garage's pause, and QUIT takes the garage down", async () => {
  const g = await createGame({ storage: { trackId: "bahrain" } });
  try {
    const h = await pitGarage(g);
    assert.equal(h.garage.hidden, false, "precondition: the garage is up");
    assert.equal(g.G.paused, true, "precondition: the garage's own pause");
    assert.equal(h.card.hidden, true, "precondition: no card");
    await h.visibility(true);
    assert.equal(g.G.paused, true, "still paused");
    assert.equal(h.card.hidden, true, "no pause card over the garage");
    assert.equal(h.garage.hidden, false, "the garage is still the screen");
    await h.visibility(false);
    assert.equal(h.card.hidden, true, "nor after the return");
    assert.equal(g.G.paused, true, "the garage's pause survives the round trip");
    // Any path to quitToMenu takes the garage down with the race (PAUSE > QUIT; CONFIRM QUIT arms first).
    const q = h.doc.getElementById("pm-quit");
    q.click(); if (q.classList.contains("armed")) q.click();
    await h.tick();
    assert.equal(h.garage.hidden, true, "QUIT closes #carsetup");
    assert.equal(g.apex.info().state, "menu");
    assert.equal(h.log.at(-1), "release", "the lock is dropped with the race");
  } finally { g.close(); }
});

test("the garage's pause never drops the wake lock: the return to the tab re-holds it, and RETURN TO RACE races with it held", async () => {
  // Before: the hidden tab's setPaused(true) dropped the lock (wanted=false); RESUME from the stacked
  // card returned early under the garage, so nothing re-held it and RETURN TO RACE ran lock-less.
  const g = await createGame({ storage: { trackId: "bahrain" } });
  try {
    const h = await pitGarage(g);
    await h.visibility(true);                       // the platform releases the sentinel on hide (the mock does the same)
    assert.ok(await settle(() => h.log.length >= 2, 4000), "the release on hide");
    await h.visibility(false);                      // PlatformSession: `if (!document.hidden && raceWakeLock.wanted()) hold()`
    assert.ok(await settle(() => h.log.length >= 3, 4000), "the re-acquire on return (the lock was never un-wanted)");
    assert.deepEqual(h.log, ["request:screen", "release", "request:screen"]);
    h.doc.getElementById("cs-back").onclick();      // RETURN TO RACE: closePitWork's own hold coalesces with the held lock
    await h.tick();
    assert.deepEqual(h.log, ["request:screen", "release", "request:screen"], "held, not requested twice");
    assert.equal(g.G.paused, false, "racing again");
    assert.equal(h.garage.hidden, true);
    g.apex.finishRace();
    await h.tick();
    assert.equal(h.log.at(-1), "release", "and the race's end releases the lock RETURN TO RACE raced under");
  } finally { g.close(); }
});
