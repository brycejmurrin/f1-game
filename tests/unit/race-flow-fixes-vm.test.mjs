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
 *     (RaceControl.finishDelay, by design); an AI whose reliability failure was
 *     already drawn used to be classified — and scored — from that snapshot.
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
 *   - EXITS (round-3 hunt 2-F1..F3): a flag under the pause kept its tools (lt-open, photo mode) into RACE AGAIN;
 *     QUIT left the pit WORK garage over the title; NEXT ROUND -> quali -> BACK x3 kept the old race's HUD.
 *
 * Run: node --test tests/unit/race-flow-fixes-vm.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import vm from "node:vm";

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

test("the only human retiring retires every AI whose failure was already drawn", async () => {
  const g = await createGame({ track: "monza" });
  try {
    const G = g.G;
    g.apex.setInput({ throttle: true, steer: 0 });   // the player must cross the line for a distance-keyed DNF to fire
    g.step(60 * 5);
    const ai = G.cars.filter((c) => !c.human && !c.retired);
    const doomed = ai[3];
    doomed.dnfAt = 0.99; doomed.dnfWhy = "gearbox";   // drawn, but beyond where the race now stops
    G.player.dnfAt = 0.0001; G.player.dnfWhy = "engine";
    for (let i = 0; i < 60 * 10 && G.state === "race"; i++) g.step(1);
    assert.equal(G.state, "results", "the race ends once its only human is out");
    assert.equal(doomed.retired, true, "a drawn failure is met, not scored past");
    assert.equal(doomed.dnf, "gearbox");
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
  const { readFileSync } = await import("node:fs");
  const src = readFileSync(new URL("../../js/game.js", import.meta.url), "utf8");
  const body = src.slice(src.indexOf("async function startRaceBody()"), src.indexOf("async function startRaceBody()") + 6000);
  assert.match(body, /const sessionOk = await ensureRaceSession\(\);/);
  assert.match(body, /if \(!sessionOk\) \{ loadingScreen\.stop\(\); quitToMenu\(\); announce\("RACE MODULES FAILED TO LOAD — RETRY", 3, "info"\); return false; \}/);
  assert.ok(body.indexOf("if (!sessionOk)") < body.indexOf("await ensureAudio()"), "the abort comes before anything starts the race");
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
    await settle(() => G.state !== "results", 15000);
    assert.equal(G.state, "menu", "precondition: openQualiBody ran (the sheet's state)");
    assert.equal($("quali").hidden, false, "precondition: the qualifying sheet is up");
    // q-back -> rs-cancel -> the picker's BACK reaches #overlay, which is no .screen: the HUD showed through its 36 % wash.
    assert.equal(G.els.hud.hidden, true);
    assert.equal(G.els.lights.hidden, true);
  } finally { g.close(); }
});
