/* overtake-mode.test.mjs — the 2026 OVERTAKE rule (js/race/overtake-mode.js)
 * and the two race-control rules that landed with it, in a VM.
 *
 * FIA 2026 F1 Sporting Regulations Section B, Iss. 07:
 *   B7.2.3(c)  under 1 s behind the car ahead at the Detection Line earns
 *              Overtake at the Activation Line (the timing line): an extra
 *              0.5 MJ, deployable at will over that following lap.
 *   B7.2.2(d)  low grip conditions disable Overtake (B7.1.2(b): partial aero).
 *   B5.13      under the Safety Car the field queues up behind it.
 *
 * Pure module rules — no game.js. The game-vm half (the detection line on a
 * real Monza lap) is Row 4 of tests/unit/physics-rows-vm.test.mjs.
 *
 * Run: node --test tests/unit/overtake-mode.test.mjs   (npm run test:tooling-fast)
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import { seedLog } from "../helpers/seed-log.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const src = (p) => readFileSync(join(ROOT, p), "utf8");

function load(extra = {}) {
  const ctx = vm.createContext({ Math, JSON, Object, Array, String, Number, isNaN, isFinite, console, window: {}, ...extra });
  ctx.window = ctx;
  seedLog(ctx);
  for (const f of ["js/physics/consts.js", "js/track/core/space.js", "js/race/overtake-mode.js", "js/race/race-control.js"])
    vm.runInContext(src(f), ctx, { filename: f });
  return { OM: vm.runInContext("OvertakeMode", ctx), RC: vm.runInContext("RaceControl", ctx), P: vm.runInContext("PhysicsConsts", ctx), ctx };
}

const L = 5000;
const track = (def = {}) => ({ total: L, def });
const car = (over = {}) => ({ s: 0, lap: 1, human: false, ...over });

test("0.5 MJ maps onto the battery unit: 1/8 of the 4 MJ Energy Store window", () => {
  const { OM, P } = load();
  assert.equal(P.OT_MJ, 0.5);
  assert.equal(P.ES_MJ, 4);
  assert.equal(OM.energy(), 0.125);
  assert.equal(OM.mj({ otE: 0.125 }), 0.5);
  assert.equal(OM.mj({ otE: 0 }), 0);
  assert.equal(P.OT_COOL_LO, undefined, "the timed lockout is gone");
});

test("crossed() is a wrap-safe forward crossing and ignores teleports and reverses", () => {
  const { OM } = load();
  assert.equal(OM.crossed(4490, 4510, 4500, L), true);
  assert.equal(OM.crossed(4500, 4510, 4500, L), false, "starting ON the line is not crossing it");
  assert.equal(OM.crossed(4490, 4500, 4500, L), true, "landing on it is");
  assert.equal(OM.crossed(4510, 4490, 4500, L), false, "backwards");
  assert.equal(OM.crossed(4990, 20, 10, L), true, "across the start line");
  assert.equal(OM.crossed(100, 4600, 4500, L), false, "a jump of more than half a lap is a teleport");
  assert.equal(OM.crossed(NaN, 10, 5, L), false);
});

test("the detection line defaults to 90 % of the lap and a circuit's otDetectFrac goes through TrackSpace", () => {
  const { OM } = load();
  assert.equal(OM.DETECT_FRAC, 0.9);
  assert.equal(OM.detectS(track()), 0.9 * L);
  // Authored in the same frame as every frac-keyed table: _sceneryShift applies.
  const def = { otDetectFrac: 0.8, _sceneryShift: 0.1 };
  assert.ok(Math.abs(OM.detectFrac(def) - 0.9) < 1e-12, "0.8 authored + 0.1 scenery shift");
  assert.ok(Math.abs(OM.detectFrac({ otDetectFrac: 0.95, _sceneryShift: 0.1 }) - 0.05) < 1e-12, "and wraps");
});

test("under 1 s at the detection line EARNS it; the timing line GRANTS it for one lap; unused, it expires", () => {
  const { OM } = load();
  const t = track(), c = car({ s: 4400 });
  OM.reset(c);
  OM.lines(c, t, 0.6, true);                  // seeds the trackers
  c.s = 4460; OM.lines(c, t, 0.6, true);
  assert.equal(c.otEarned, false, "not at the line yet");
  c.s = 4520; OM.lines(c, t, 0.6, true);
  assert.equal(c.otEarned, true, "0.6 s behind at the line");
  assert.equal(c.otE, 0, "nothing to spend before the timing line");
  assert.equal(OM.arm(c, true, true), false);

  c.s = 10; c.lap = 2; OM.lines(c, t, 5, true);
  assert.equal(c.otE, 0.125, "granted at the Activation Line");
  assert.equal(c.otEarned, false);
  assert.equal(OM.arm(c, true, true), true);

  // The next detection line with no car within a second: nothing earned, and
  // the unspent allowance lapses at the following timing line.
  c.s = 4400; OM.lines(c, t, 5, true); c.s = 4520; OM.lines(c, t, 5, true);
  assert.equal(c.otEarned, false);
  c.s = 5; c.lap = 3; OM.lines(c, t, 5, true);
  assert.equal(c.otE, 0, "a lap's allowance does not carry over");
});

test("1.0 s is not 'less than one second', and a closed detection (SC, low grip) earns nothing", () => {
  const { OM } = load();
  const t = track();
  for (const [gap, open, want] of [[0.99, true, true], [1.0, true, false], [0.3, false, false], [Infinity, true, false]]) {
    const c = car({ s: 4490 }); OM.reset(c); OM.lines(c, t, gap, open);
    c.s = 4510; OM.lines(c, t, gap, open);
    assert.equal(c.otEarned, want, `gap ${gap} open ${open}`);
  }
});

test("a car shoved back over the line and re-crossing is neither re-granted nor stripped", () => {
  const { OM } = load();
  const t = track(), c = car({ s: 4490, lap: 4 });
  OM.reset(c); OM.lines(c, t, 0.5, true);
  c.s = 4510; OM.lines(c, t, 0.5, true);
  c.s = 10; c.lap = 5; OM.lines(c, t, 0.5, true);
  assert.equal(c.otE, 0.125);
  c.s = 4995; c.lap = 4; OM.lines(c, t, 0.5, true);   // RaceControl.lineTransition's reverse
  c.s = 12; c.lap = 5; OM.lines(c, t, 0.5, true);     // …and the recross
  assert.equal(c.otE, 0.125, "still the one allowance");
});

test("spending: a full allowance lasts exactly otTimeFor(c) seconds; the human's button toggles, the AI's fire runs it out", () => {
  const { OM } = load();
  const dt = 1 / 60, push = 4.2;
  const h = car({ human: true, otE: 0.125 });
  assert.equal(OM.arm(h, true, true), true);
  assert.equal(OM.spend(h, dt, true, true, true, push), true, "the press starts it");
  assert.equal(h.otArmed, true, "armed was read before the press");
  assert.ok(h.otT > 0 && h.otE < 0.125);
  OM.arm(h, true, true);
  assert.equal(h.otArmed, false, "not 'ready' while deploying");
  let ticks = 1;
  for (; ticks < 60; ticks++) { OM.arm(h, true, true); OM.spend(h, dt, false, true, true, push); }
  const left = h.otE;
  OM.arm(h, true, true);
  OM.spend(h, dt, true, true, true, push);   // second press: stop, keep the rest
  assert.equal(h.otOn, false);
  assert.equal(h.otT, 0);
  assert.ok(Math.abs(h.otE - left) < 1e-12, "stopping costs nothing");
  assert.ok(Math.abs(OM.mj(h) - 0.5 * (1 - 1 / push)) < 1e-3, `one second spent of a ${push} s allowance (${OM.mj(h)} MJ left)`);

  // AI: one fire, then it runs to empty in otTimeFor seconds.
  const a = car({ otE: 0.125 });
  OM.arm(a, true, true);
  OM.spend(a, dt, true, true, true, push);
  let n = 1;
  while (a.otOn && n < 10000) { OM.arm(a, true, true); OM.spend(a, dt, false, true, true, push); n++; }
  assert.ok(Math.abs(n * dt - push) <= dt + 1e-9, `emptied in ${(n * dt).toFixed(3)} s`);
  assert.equal(a.otE, 0);
  assert.equal(OM.arm(a, true, true), false, "nothing left to arm");
});

test("below the speed floor the push pauses (not cancelled); a closed gate cancels it", () => {
  const { OM } = load();
  const c = car({ human: true, otE: 0.125 });
  OM.arm(c, true, true); OM.spend(c, 1 / 60, true, true, true, 4);
  const e = c.otE;
  OM.arm(c, true, false); OM.spend(c, 1 / 60, false, true, false, 4);
  assert.equal(c.otOn, true, "still switched on");
  assert.equal(c.otT, 0, "but not deploying — deployTaper sees no push");
  assert.equal(c.otE, e, "and not spending");
  OM.arm(c, false, true); OM.spend(c, 1 / 60, false, false, true, 4);
  assert.equal(c.otOn, false, "the Safety Car / low grip / the pit limiter switch it off");
});

// ── RaceControl: low grip and the Safety Car queue ──────────────────────────

function rcWith(weather, wetness) {
  const TyreModel = { treadFor: (w, x) => (Number.isFinite(x) ? (x >= 0.72 ? 2 : x >= 0.25 ? 1 : 0) : w === "rain" ? 2 : w === "wet" ? 1 : 0) };
  const { RC } = load({ TyreModel, DebrisWorld: { active: () => false, hazards: () => null } });
  const saved = new Map([["caution", true]]);
  const notes = [];
  const G = {
    state: "race", ranked: [{ lap: 3 }], raceWeather: weather, roadWetness: () => wetness,
    netPlay: { ownsRaceControl: () => true, active: false },
    store: { get: (k, d) => (saved.has(k) ? saved.get(k) : d), set: (k, v) => saved.set(k, v) },
    announce: (m) => { notes.push(m); return true; },
  };
  return { rc: RC.create(G), G, notes };
}

test("LOW GRIP (B7.2.2(d)): treaded-tyre conditions switch Overtake off and say so once", () => {
  const dry = rcWith("dry", 0);
  assert.equal(dry.rc.lowGrip(), false);
  assert.equal(dry.rc.otEnabled(), true);
  assert.equal(dry.rc.otDetectOpen(), true);
  dry.rc.update(0.1);
  assert.deepEqual(dry.notes, []);

  const wet = rcWith("wet", 0.5);
  assert.equal(wet.rc.lowGrip(), true);
  assert.equal(wet.rc.otEnabled(), false);
  assert.equal(wet.rc.otDetectOpen(), false);
  assert.equal(wet.rc.info().lowGrip, true, "the HUD reads the reason off info()");
  for (let i = 0; i < 5; i++) wet.rc.update(0.1);
  assert.deepEqual(wet.notes, ["LOW GRIP — OVERTAKE OFF"], "once, not every tick");
  wet.G.state = "results"; wet.rc.update(0.1); wet.G.state = "race"; wet.rc.update(0.1);
  assert.equal(wet.notes.length, 2, "and once again next race");
  // …the way the GAME starts the next race: reset(), never an update() outside
  // a race (updateCaution only runs in one). reset() did not clear the flag,
  // so RACE AGAIN in the wet lost the note (bug hunt 2026-09-29).
  wet.rc.reset(); wet.rc.update(0.1);
  assert.equal(wet.notes.length, 3, "reset() re-arms the note for the next race");

  // A weather arc drying the track below the intermediate threshold hands it back.
  wet.G.roadWetness = () => 0.2;
  assert.equal(wet.rc.otEnabled(), true);
});

test("SAFETY CAR QUEUE (B5.13): the leader runs SC pace, a car > 1 s adrift closes up faster, a queued car holds", () => {
  const { RC } = load();
  const vTop = 90, q = RC.SC_PACE * vTop;   // metres per second of SC-pace gap
  const leader = { prog: 10000 };
  const mk = (gapS, ahead) => ({ prog: ahead.prog - gapS * q });
  const p2 = mk(0.8, leader), p3 = mk(3, p2), p4 = mk(1.5, p3);
  const cars = [leader, p2, p3, p4];
  assert.equal(RC.scQueueFrac(leader, cars, 5000, leader, vTop), RC.SC_PACE, "the leader follows the SC");
  assert.equal(RC.scQueueFrac(p2, cars, 5000, leader, vTop), RC.SC_PACE, "inside 1 s: hold the queue");
  assert.equal(RC.scQueueFrac(p3, cars, 5000, leader, vTop), RC.SC_CATCH, "3 s adrift: the catch-up cap");
  const mid = RC.scQueueFrac(p4, cars, 5000, leader, vTop);
  assert.ok(Math.abs(mid - (RC.SC_PACE + RC.SC_CATCH) / 2) < 1e-9, `1.5 s: blended, no step to chatter on (${mid})`);
  assert.ok(RC.SC_CATCH > RC.SC_PACE);
  // Retired, finished and skipped (pit lane) cars are not the car you queue behind.
  const gone = { prog: p3.prog + 0.5 * q, retired: true };
  assert.equal(RC.scQueueFrac(p3, [...cars, gone], 5000, leader, vTop), RC.SC_CATCH);
  const lane = { prog: p3.prog + 0.5 * q };
  assert.equal(RC.scQueueFrac(p3, [...cars, lane], 5000, leader, vTop, (o) => o === lane), RC.SC_CATCH);
  assert.equal(RC.scQueueFrac(p3, [...cars, lane], 5000, leader, vTop), RC.SC_PACE, "unskipped, it is the car ahead");
  // Pace-free: the same field at half the OVERALL SPEED gives the same fractions.
  const half = cars.map((c) => ({ prog: leader.prog - (leader.prog - c.prog) / 2 }));
  assert.equal(RC.scQueueFrac(half[2], half, 5000, half[0], vTop / 2), RC.SC_CATCH);
});
