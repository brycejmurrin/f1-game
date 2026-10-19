// Race-craft, VS FRIEND, radio queue, ERS, rolling-start hand-over and rescue in the real game VM.
// Split from mechanics-integration-vm.test.mjs (T3-16): each file boots its own game.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { createRequire } from "node:module";
import { absSrc } from "../helpers/abs-src.mjs";
const { createGame } = createRequire(import.meta.url)("../../tools/lib/game-vm.cjs");
let g;
before(async()=>{g=await createGame({track:"monza"});});
after(()=>g?.close());
async function tt() {
  g.G.daily.stop(); g.G.timeTrial=true; g.G.raceWeather="dry";
  await g.G.startRace(); g.apex.go(); g.apex.headless(true);
}

// RACE CRAFT is scored in career.js from fields only game.js writes, so the pure
// scorer passing (career-settle.test.mjs) says nothing about whether a driven
// race ever fills them in. This drives the real car into the real barriers and
// into a real rival and checks the counts — and, as much as the counts, that
// they DEBOUNCE: ten seconds against a wall is a handful of strikes, not 600,
// and one shunt is one hit rather than one per relaxation pass.
test("a driven race fills in the race-craft fields, debounced", async () => {
  const h = await createGame({ track: "monaco" });
  try {
    await h.race("monaco"); h.apex.go(); h.apex.headless(true);
    const p = h.G.player;
    assert.equal(p.hits, 0); assert.equal(p.hitSev, 0); assert.equal(p.wallHits, 0);

    // Ten seconds of full lock into Monaco's barriers.
    h.apex.jump(0.25, 40, 0);
    h.apex.setInput({ steer: 1, throttle: 1, brake: 0 });
    for (let i = 0; i < 600; i++) { if (p.speed < 25) p.speed = 25; h.apex.step(1 / 60); }
    h.apex.clearInput();
    assert.ok(p.wasOnWall, "the car must actually have reached the barrier");
    assert.ok(p.wallHits >= 1, "a wall strike must be counted");
    assert.ok(p.wallHits <= 20,
      `600 frames on the wall counted ${p.wallHits} strikes — the wasOnWall gate is not holding`);

    // A rival closing on the player: one shunt, graded by how hard it was.
    const rival = h.G.cars.find((c) => c !== p);
    h.apex.jump(0.4, 60, 0);
    for (let i = 0; i < 300 && !p.hits; i++) {
      rival.retired = false; rival.finished = false; rival.lap = p.lap;
      rival.prog = p.prog + 1.5; rival.s = p.s + 1.5; rival.x = p.x + 1.0;
      rival.speed = p.speed + 8;
      if (p.speed < 55) p.speed = 55;
      h.apex.step(1 / 60);
    }
    assert.equal(p.hits, 1, "car contact counts once, not once per relaxation pass");
    assert.ok(p.hitSev > 0 && p.hitSev <= 1, `severity is graded 0..1, got ${p.hitSev}`);
  } finally { h.close(); }
});

// VS FRIEND: a remote friend's car is c.human (setCarRole) and takes the human
// wall path, but the street-wall FEEDBACK — camera shake, the crash sound, the
// phone buzz, the pad rumble — belongs to THIS screen's car. It used to gate only
// the rumble on c.isPlayer, so every wall the friend clipped shook and buzzed the
// local player's device at full volume.
test("VS FRIEND: a remote human's street-wall strike does not fire the local player's feedback", async () => {
  const h = await createGame({ track: "monaco" });
  try {
    await h.race("monaco"); h.apex.go(); h.apex.headless(true);
    const G = h.G, p = G.player;
    G.soundOn = true;
    const Input = vm.runInContext("Input", h.ctx), GameAudio = vm.runInContext("GameAudio", h.ctx);
    const calls = { vibrate: 0, rumble: 0, collision: 0 };
    Input.vibrate = () => { calls.vibrate++; };
    Input.rumble = () => { calls.rumble++; };
    GameAudio.collision = () => { calls.collision++; };
    const k = G.cars.findIndex((c) => c !== p);
    const friend = G.cars[k];
    h.apex.carRole(k, { human: true, local: false });
    assert.ok(friend.human && !friend.local && !friend.isPlayer, "the friend is a remote human");
    h.apex.jump(0.75, 0, 0);   // the local car parked well away from the friend's wall
    h.apex.aiPlace(k, 0.25, 40, 0);
    h.apex.carInput(k, { steer: 1, throttle: 1, brake: 0 });
    let strikes = 0;
    for (let i = 0; i < 600; i++) {
      if (friend.speed < 25) friend.speed = 25;
      const was = friend.wasOnWall;
      h.apex.step(1 / 60);
      if (!was && friend.wasOnWall) strikes++;
    }
    h.apex.carInput(k, null);
    assert.ok(strikes >= 1, "the friend must actually have struck the barrier");
    assert.equal(p.hits | 0, 0, "the local car was never touched (no collideFx of its own)");
    assert.deepEqual({ ...calls }, { vibrate: 0, rumble: 0, collision: 0 },
      "a remote friend's wall strike must not buzz, rumble or crash-sound this device");

    // The LOCAL car's own strike still gets all of it.
    h.apex.jump(0.25, 40, 0);
    h.apex.setInput({ steer: 1, throttle: 1, brake: 0 });
    for (let i = 0; i < 600 && !(calls.vibrate && calls.rumble && calls.collision); i++) {
      if (p.speed < 25) p.speed = 25;
      h.apex.step(1 / 60);
    }
    h.apex.clearInput();
    assert.ok(p.wallHits >= 1, "the local car struck the barrier");
    assert.ok(calls.vibrate >= 1 && calls.rumble >= 1 && calls.collision >= 1,
      "the local player's wall strike keeps its buzz, rumble and crash sound: " + JSON.stringify(calls));
  } finally { h.close(); }
});

test("the radio queue keeps a burst in priority order, and drops only what would arrive too late", async () => {
  // THE BANNER IS A QUEUE, and it used to be ONE slot guarded by
  // `pri > queued.pri` — so a second message of EQUAL priority was not queued
  // behind the first, it was silently eaten. A lap that set a record and earned
  // a medal, a caution that armed a flag and a call in the same tick: one of
  // them simply never existed. announce() returns whether the line will be
  // heard, so what each verdict below asserts is a message the player gets.
  //
  // NOTE ON WHAT THIS CANNOT SEE: the DRAIN lives in tickBody(), the frame
  // loop, and __apex.step() calls update() — so the banner clock does not
  // advance here and no card ever expires. The enqueue side is the logic that
  // changed; the drain is `shift()` where it was `= null`.
  // Its OWN handle: the shared `g` carries whatever banner an earlier test
  // left up, and with no drain here that card never expires.
  const h = await createGame({ track: "monza" });
  try {
  await h.race("monza"); h.apex.go(); h.step(10);
  const A = (msg, kind) => h.G.announce(msg, 1, kind);
  assert.equal(A("FIRST", "info"), true, "an idle banner shows at once");
  assert.equal(A("SECOND", "info"), true, "…the next one waits its turn");
  assert.equal(A("THIRD", "info"), true,
    "a THIRD message of equal priority was the one the single slot ate");
  assert.equal(A("FOURTH", "info"), false,
    "two deep is the cap: under the floor a fourth card would land six seconds after its event");
  // A higher priority does not wait behind two reports — it takes the HEAD of
  // the queue, and NOBODY pays for it: the queue grows rather than evicting an
  // accepted line, whose caller was already told it would be heard.
  assert.equal(A("LIMITS", "warning"), true, "a warning must never be refused behind two info lines");
  // …and the engineer's pit call outranks the pit lane's own confirmations,
  // which is the whole point of the "box" kind: at "info" it lost to
  // "PIT ENTRY — LIMITER ON", so the confirmation that you HAD pitted beat the
  // call telling you to.
  assert.equal(A("BOX BOX BOX — H", "box"), true);
  // THE FLOOR, and the half of it a return value cannot show. Outranking the
  // card on screen no longer EVICTS it while it is inside ANN_MIN_S: the
  // banner still reads FIRST, and every one of those higher-priority lines is
  // waiting its turn rather than having blinked this one away.
  const shown = () => vm.runInContext('document.getElementById("announce-text").textContent', h.ctx);
  assert.equal(shown(), "FIRST", "a card inside its floor was evicted by a higher priority");
  assert.equal(A("5 SECOND PENALTY", "penalty-hit"), true, "…and the penalty is queued, not refused");
  assert.equal(shown(), "FIRST", "even a penalty waits out the floor — a card nobody can read is worth less");
  assert.equal(h.G.announceBusy, true);
  } finally { h.close(); }
});

test("ERS recovery needs the car moving: holding the brake or coasting at a standstill refills nothing", async () => {
  // Braking or coasting at 0 km/h used to recharge at the full rate — park in
  // the pit box, hold the brake, and the battery was full in ~10 s.
  await g.race("monza"); g.apex.go(); g.apex.headless(true);
  const p = g.G.player;
  g.apex.act({ throttle: false, brake: true, steer: 0 }, 1 / 60, 1);
  for (const inp of [{ throttle: false, brake: true, steer: 0 }, { throttle: false, brake: false, steer: 0 }]) {
    p.speed = 0; g.apex.setEnergy(0.3);
    for (let i = 0; i < 180; i++) { p.speed = 0; g.apex.act(inp, 1 / 60, 1); }
    assert.ok(Math.abs(p.energy - 0.3) < 1e-6, `${inp.brake ? "braking" : "coasting"} at a standstill recovered ${p.energy - 0.3}`);
  }
  // …and at speed it still recovers: a braking zone from 70 m/s pays the battery back.
  g.apex.setEnergy(0.3); p.speed = 70;
  g.apex.act({ throttle: false, brake: true, steer: 0 }, 1 / 60, 30);
  assert.ok(p.energy > 0.3, "braking from speed recovers energy: " + p.energy);
  g.G._testInput = null;
});

// ---- Rolling-start hand-over (R1: 01-F1, 03-F3) --------------------------------------------------------
// The AI never advances c.head, so the car took the wheel facing the heading it was DROPPED with: 93 deg off the
// road at Silverstone, wall within 15 steps. Drive the real game VM through the run-up and read the heading the
// step the player gets the wheel.
async function handoverErrDeg(game) {
  game.G.daily.stop(); game.G.timeTrial = true; game.G.raceWeather = "dry";
  await game.G.startRace();
  const p = game.G.player, Tr = vm.runInContext("Tracks", game.ctx);
  game.step(1);
  assert.equal(p.human, false, "armed: the AI drives the run-up");
  for (let i = 0; i < 900; i++) {
    const was = p.human;
    game.step(1);
    if (!was && p.human) {
      const smp = { p: [0, 0, 0], t: [0, 0, 1], r: [1, 0, 0], hw: 7 };
      Tr.sample(game.G.track, p.s, smp);
      const err = (p.head - Math.atan2(smp.t[0], smp.t[2])) * 180 / Math.PI;
      return { err: ((err + 540) % 360) - 180, vLat: p.vLat, yawRateCur: p.yawRateCur };
    }
  }
  assert.fail("the hand-over never happened");
}
test("flying-start hand-over: the car takes the wheel pointing along the road (Silverstone bends; Monza control)", async () => {
  const mz = await handoverErrDeg(g);
  assert.ok(Math.abs(mz.err) < 2, "straight run-up control: " + mz.err);
  const sv = await createGame({ track: "silverstone" });
  try {
    const r = await handoverErrDeg(sv);
    assert.ok(Math.abs(r.err) < 2, "silverstone hand-over heading is " + r.err.toFixed(1) + " deg off the tangent");
    assert.equal(r.vLat, 0); assert.equal(r.yawRateCur, 0);
  } finally { sv.close(); }
});

test("flying-start: a session quit mid-countdown does not stop the next time trial arming its rolling start", async () => {
  g.G.daily.stop(); g.G.timeTrial = false; g.G.raceWeather = "dry";
  await g.G.startRace();          // a GP: the gantry countdown, which FlyingStart.update() sees in "count"
  g.step(1);
  assert.equal(g.G.state, "count");
  g.G.quitToMenu();               // update() never runs in the menu, so only stop() can forget "count"
  g.G.timeTrial = true;
  await g.G.startRace();
  g.step(1);
  assert.equal(g.G.flyingStart.active(), true, "the next session's first countdown frame is a new start");
  assert.equal(g.G.player.human, false);
});

// 01-F2 (hunt2, decided): RECOVER / the auto-rescue is a free, speed-preserving re-centre, so in TT and QUALI it deletes the lap.
test("rescuePlayer deletes the lap in time trial and qualifying, not in a race and not for an AI car", async () => {
  await tt();
  const p = g.G.player;
  const flags = (c) => ({ inv: !!c.incidentInvalidLap, cut: !!c.qualiCut });
  const run = (c, session) => { g.G.session = session; c.incidentInvalidLap = false; c.qualiCut = false; g.G.rescuePlayer(c); return flags(c); };
  try {
    assert.deepEqual(run(p, "tt"), { inv: true, cut: false }, "time trial: the lap is invalid (no quali sheet to cut)");
    assert.deepEqual(run(p, "quali"), { inv: true, cut: true }, "qualifying: invalid AND no time on the sheet");
    assert.deepEqual(run(p, "race"), { inv: false, cut: false }, "a race has no lap-validity concept to add");
    p.human = false;   // the AI's role (a time trial has no rivals to borrow)
    assert.deepEqual(run(p, "tt"), { inv: false, cut: false }, "an AI car's rescue never touches lap validity");
  } finally { p.human = true; g.G.session = "race"; }
});

// 01-F5 (hunt2): handing a flipped human car back called G.rescuePlayer BEFORE the car left the takeover; the real
// rescuePlayer begins with incidentSim.release(c), which found the car still owned and ran handbackCar a second
// time (second demote, restored last-good pose, fallbacks++, a second "anomaly" log). The module whole in a VM,
// DebrisWorld stubbed, G a two-car world whose rescuePlayer does what game.js's does first: release(c).
test("a flipped human car handed back from a takeover is demoted once and is not counted as a fallback", async () => {
  const fsm = await import("node:fs"), pathm = await import("node:path"), { seedLog } = await import("../helpers/seed-log.mjs");
  const root = pathm.resolve(pathm.dirname(new URL(import.meta.url).pathname), "..", "..");
  const rd = (p) => fsm.readFileSync(pathm.join(root, p), "utf8");
  const demoted = [], logs = [];
  const flipped = { x: 0, z: 0, qx: 1, qy: 0, qz: 0, qw: 0, vx: 0, vz: 0, sleeping: true };   // up.y = -1: on its roof, at rest
  const DebrisWorld = { active: () => true, rapierReady: () => true, worldGen: () => 1, promoteCarDynamic: () => true,
    demoteCarKinematic: (i) => { demoted.push(i); }, carBodyPose: () => flipped };
  const ctx = vm.createContext({ Math, JSON, Object, Array, String, Number, Map, Set, Uint8Array, isNaN, isFinite, console, DebrisWorld,
    Tracks: { sample: () => {}, wallAt: () => 8 } });
  seedLog(ctx);
  for (const f of ["js/core/mat4.js", "js/physics/ai-drive.js", "js/physics/contact-geometry.js",
    "js/race/race-control.js", "js/physics/incident-sim.js"]) vm.runInContext(rd(f), ctx, { filename: absSrc(f) });
  const IncidentSim = vm.runInContext("IncidentSim", ctx);
  const mk = (s, human) => ({ px: 0, pz: 0, head: 0, speed: 40, s, x: 0, vLat: 0, yawRateCur: 0, prog: s, finished: false, retired: false, human });
  const cars = [mk(100, true), mk(103, false)];
  let sim, rescued = 0;
  const G = { cars, player: cars[0], track: { total: 5000 }, PACE: 1, vTop: () => 72, smp: {},
    trackFrom: () => ({ s: 100, x: 0 }), worldFromTrack: () => ({ x: 0, z: 0 }),
    rescuePlayer: (c) => { rescued++; sim.release(c); } };   // game.js rescuePlayer(): incidentSim.release(c) first
  sim = IncidentSim.create(G);
  sim.setFlags({ r2Airborne: true, r3Contact: false, c1Pileup: false });
  sim.notifyCar(cars[0], cars[1], 30);
  sim.preStep(1 / 60);
  assert.equal(sim.status().owned, 2, "both cars are in the takeover");
  for (let i = 0; i < 40 && sim.owns(cars[0]); i++) sim.postStep(1 / 60);   // settle on the roof -> handback
  assert.equal(sim.owns(cars[0]), false, "the human car was handed back");
  assert.equal(rescued, 1, "the inverted human car was rescued onto the road");
  assert.equal(demoted.filter((i) => i === 0).length, 1, "demoted to kinematic exactly once");
  assert.equal(sim.status().fallbacks, 0, "a clean settle is not an anomaly fallback");
  assert.equal(sim.status().handbacks, 2, "one clean handback per car in the window (the human and the AI)");
});
