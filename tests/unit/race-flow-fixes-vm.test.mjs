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
 *
 * Run: node --test tests/unit/race-flow-fixes-vm.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import vm from "node:vm";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

const require = createRequire(import.meta.url);
const { createGame } = require("../../tools/lib/game-vm.cjs");

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
