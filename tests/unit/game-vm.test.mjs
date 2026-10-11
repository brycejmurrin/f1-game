/* game-vm.test.mjs — the REAL js/game.js boots and drives in a Node VM.
 *
 * tools/lib/game-vm.cjs loads the full manifest order through game.js (renderer
 * stubbed, DOM inert, no browser) and hands back window.__apex. This file is
 * the harness's own contract: boot, race, drive, cross the line, and the JSON
 * hooks answer. The driving model's NUMBERS are pinned separately against the
 * browser-generated baseline in physics-characterization-vm.test.mjs.
 *
 * Run: node --test tests/unit/game-vm.test.mjs        (~3 s, one shared boot)
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { createGame } = require("../../tools/lib/game-vm.cjs");

const finite = (o, keys) => { for (const k of keys) assert.ok(Number.isFinite(o[k]), `${k} not finite: ${o[k]}`); };

let g;
before(async () => { g = await createGame({ track: "monza" }); });
after(() => { if (g) g.close(); });

test("boots to __apex with no script errors", () => {
  assert.ok(g.apex && typeof g.apex.step === "function", "__apex missing");
  assert.deepEqual(g.record.scripts.filter((s) => s.error), [], "an injected script threw");
  assert.deepEqual(g.record.rejections, [], "an unhandled rejection escaped boot");
  assert.ok(g.G && g.G.track && g.G.player, "the G façade was not captured");
  assert.equal(g.G.gfx.mirrorBegin, undefined, "the inert renderer must not advertise a mirror target");
});

test("failed automatic race boot releases harness resources", async () => {
  const before = process.listenerCount("unhandledRejection");
  await assert.rejects(createGame({ track: "not-a-circuit" }), (error) => {
    assert.match(error.message, /unknown circuit/);
    assert.deepEqual(error.resources, { closed: true, timers: 0, rafFrames: 0, rejectionListeners: 0 });
    return true;
  });
  assert.equal(process.listenerCount("unhandledRejection"), before);
});

test("nodeAt wraps fractions behind the start line and setPhysics rejects poisoned patches atomically", () => {
  const A = g.apex, before = JSON.stringify(A.tuning());
  assert.deepEqual(A.nodeAt(-0.002), A.nodeAt(0.998));
  for (const field of ["frontGrip", "playerGrip", "drift", "maxSlip", "roadFollow", "yawDamp", "pace", "maxTilt", "deadzone", "tiltCutoff"]) {
    for (const value of [NaN, Infinity, "3"]) assert.throws(() => A.setPhysics({ pace: 2, [field]: value }), /must be finite/);
  }
  assert.throws(() => A.setPhysics({ frontGrip: -1 }), /nonnegative/);
  assert.equal(JSON.stringify(A.tuning()), before, "invalid patch must not partially mutate tuning");
});

test("cameraState returns detached damping snapshots and separate render/simulation clocks", () => {
  const A = g.apex, first = A.cameraState(), expected = JSON.stringify(first);
  assert.equal(first.eye.length, 3); assert.equal(first.target.length, 3);
  assert.equal(first.previousAnchor.length, 2); assert.equal(first.nextAnchor.length, 2);
  for (const value of [...first.eye, ...first.target, first.fov, first.renderFrame, first.simulationTime, first.renderTime]) assert.ok(Number.isFinite(value));
  first.eye[0] = 100000; first.target[1] = -100000; first.previousAnchor[0] = 100000;
  assert.equal(JSON.stringify(A.cameraState()), expected, "editing a snapshot cannot change camera damping state");
  const cold = A.cameraState();
  g.step(1);
  const warm = A.cameraState();
  assert.ok(warm.simulationTime > cold.simulationTime);
  assert.equal(warm.renderFrame, cold.renderFrame, "VM sim ticks do not invent render frames");
});

test("reset clears caution holds and queued debris without changing same-seed rollout", () => {
  const A = g.apex;
  const physical = () => {
    const snapshot = A.physState();
    // Coaching state is a UI/session diagnostic, not the physical rollout.
    // Preserve every other diagnostic and all unrounded physics values.
    if (snapshot.driving && snapshot.driving.coach) delete snapshot.driving.coach;
    return JSON.stringify(snapshot);
  };
  A.headless(true);
  A.reset(0.1, 30, 0, 42);
  A.act({ steer: 0, throttle: true }, 1 / 60, 2);
  const cold = physical();
  g.G.holdCaution(3, "previous episode");
  A.act({}, 1 / 60, 1);
  assert.equal(A.caution().level, 3, "the hold was really active");
  const D = require("node:vm").runInContext("DebrisWorld", g.ctx);
  D.burst(3, 8);
  assert.equal(D.status().queued, 3, "real impact queue is populated before resetting");
  A.reset(0.1, 30, 0, 42);
  assert.equal(A.caution().level, 0);
  assert.equal(D.status().stepped, 0);
  assert.equal(D.status().spawned, 0);
  assert.equal(D.status().queued, 0);
  A.act({ steer: 0, throttle: true }, 1 / 60, 2);
  assert.equal(physical(), cold);
  assert.equal(A.caution().level, 0, "held SC does not return next tick");
  A.headless(false);
});

// SPLIT OUT OF THE CONTRACT ABOVE, and the wall moved 5 s -> 12 s. The four
// assertions above are real contracts; the wall is a wall-clock reading on a
// shared container, and bundling them meant a slow box reported "boot is
// broken" and hid whichever of the four actually mattered.
//
// 5000 ms was not a tolerance protecting anything here — it was inside the
// noise. Four successive boots in one process measured 6137 / 5053 / 4696 /
// 4906 ms total, so the budget failed about two runs in five, and it failed
// three deploys in a row on an idle box (loadavg 0.6). It also fails
// identically on trees that have not been touched, so it is not catching a
// change: bootMs falls 417 -> 75 as the JIT and the FS cache warm, while
// trackMs — the monza build, which is the actual cost — sits at 4.6-5.7 s
// whatever you do.
//
// 12 s is measured for headroom: twice the slowest cold boot observed. That
// still catches what this smoke test is for — a boot that hangs or turns
// pathological — without flipping on how busy the machine is. A real
// per-build budget needs a quiet, known box, which is what CI is for.
test("boot and track build do not hang", () => {
  assert.ok(g.bootMs + g.trackMs < 12000, `boot ${g.bootMs | 0} ms + track ${g.trackMs | 0} ms`);
});

test("race(monza) + go() + 60 throttle steps: finite physState, speed > 0", () => {
  const a = g.apex;
  assert.equal(a.info().track, "monza");
  assert.ok(g.record.meshes > 0, "Tracks.build never reached the renderer stub");
  const p0 = a.physState();
  a.setInput({ throttle: true, steer: 0 });
  g.step(60);
  a.clearInput();
  const p = a.physState();
  finite(p, ["s", "x", "speed", "slipDeg", "head", "prog", "lap"]);
  assert.ok(p.speed > 0, `speed ${p.speed}`);
  assert.ok(p.prog > p0.prog, `prog did not advance: ${p0.prog} -> ${p.prog}`);
});

test("crossing the lap line increments lap and wraps s", () => {
  const a = g.apex;
  g.step(120);                        // let the grid clear the line first
  const j = a.jump(0.985, 50, 0);
  assert.ok(j && j.total > 1000, "jump returned no lap length");
  const lap0 = a.physState().lap;
  a.setInput({ throttle: true, steer: 0 });
  let crossed = -1;
  for (let i = 0; i < 300 && crossed < 0; i++) {
    g.step(1);
    if (a.physState().lap !== lap0) crossed = i;
  }
  a.clearInput();
  const p = a.physState();
  assert.ok(crossed >= 0, "never crossed the line in 300 steps");
  assert.equal(p.lap, lap0 + 1);
  assert.ok(p.s < 200, `s did not wrap: ${p.s}`);
  assert.equal(a.timing().lap, lap0 + 1);
});

test("the JSON hooks answer: obs / act / probe / cars / setInput / reset", () => {
  const a = g.apex;
  const o = a.obs();
  assert.ok(o && typeof o === "object" && Object.keys(o).length > 10, "obs() empty");
  const r = a.act({ steer: 0.2, throttle: true }, 1 / 60, 3);
  finite(r, ["s", "x", "speed", "head"]);
  const pr = a.probe();
  finite(pr, ["x", "k", "hw", "speed", "s"]);
  const cars = a.cars();
  assert.ok(cars.length >= 2 && cars.some((c) => c.p), "cars() lacks a field with a player");
  for (const c of cars) finite(c, ["x", "prog", "speed"]);
  const reset = a.reset(0.25, 30, 0, 5);
  assert.ok(reset && Number.isFinite(reset.speed), "reset() did not return obs");
  assert.equal(a.seed(), 5);
  assert.equal(Math.round(a.physState().speed), 30);
});

// The whole gear/rpm block used to live inside `if (c.human)`, so every AI car
// spent the race at IDLE_RPM in gear 1 — dark rev lights, a stuck gear digit,
// and (once rivals had engine audio) twenty opponents droning at idle tape
// speed. The readout is a pure function of speed, so the guard is: after a
// stretch of racing, the cars that are MOVING are also REVVING.
test("every car's gear and rpm track its speed, not just the player's", () => {
  const a = g.apex;
  a.setInput({ throttle: true, steer: 0 });
  g.step(180);
  a.clearInput();
  const { IDLE_RPM } = g.G.PhysicsConsts || { IDLE_RPM: 5000 };
  const moving = g.G.cars.filter((c) => !c.human && (c.speed || 0) > 12);
  assert.ok(moving.length >= 5, `only ${moving.length} AI cars are up to speed`);
  assert.ok(moving.every((c) => c.rpm > IDLE_RPM),
    `an AI car is still pinned at idle: ${JSON.stringify(moving.map((c) => ({ v: c.speed | 0, rpm: c.rpm | 0 })).slice(0, 4))}`);
  assert.ok(moving.some((c) => c.gear > 1), "no AI car ever left first gear");
  // ...and the human's own readout is unchanged by that: still a real gear.
  const p = g.G.cars.find((c) => c.human);
  assert.ok(p.rpm > IDLE_RPM || p.speed < 12, "the player's own rpm regressed");
});

// ── the tyre-wear seam the AI instruments ride on ───────────────────────────
// The harness pins `tyreWear: "off"` (see the comment in game-vm.cjs) while
// js/game.js ships "light", so everything downstream of wear — AiDrive's
// stintPlan / pitNow / compoundFor / degCost and pits.think — is INERT here
// unless a caller asks. tools/check/ai-{pace,field,line,human}.mjs expose that
// as `--wear off|light|real` and default to off. These two tests are the
// contract under that flag: the default really is a no-op, and naming a level
// really does turn the model on. Without them the flag could parse, print
// "wear real", and change nothing.
test("the default seed pins tyre wear OFF (recorded AI numbers assume it)", () => {
  assert.equal(g.G.raceTyreWear, "off");
  assert.equal(g.G.tyres.on(), false, "wear is live on a default boot");
  g.step(120);
  assert.ok(g.G.cars.every((c) => !(c.tyreWear > 0)),
    "a car accumulated wear with the model off");
});

test("the default seed pins McLaren + empty sheet (characterization, not GarageDefaults)", () => {
  assert.equal(g.G.teamIdx, 2, "default VM seat must stay McLaren, not shipped Mercedes");
  const parts = g.G.store.get("parts.mclaren", { engine: "sentinel" });
  // JSON, not deepEqual: the value is a VM-realm object and is not === a host {}.
  assert.equal(JSON.stringify(parts), "{}", "empty sheet so signature McLaren parts cannot move physics");
});

test("the sim seed: pinned to 1 here, fresh per page load for a player, ?seed=N wins", async () => {
  // At a fixed 1 the first race after every page load was the same race. A
  // player's session boots from a fresh seed (js/game.js bootSeed); this
  // harness passes ?seed=1 so every VM run stays reproducible.
  const def = await createGame();
  const a = await createGame({ search: "" }), b = await createGame({ search: "" });
  const pinned = await createGame({ search: "?seed=42" });
  try {
    assert.equal(def.apex.seed(), 1, "the harness pins seed 1");
    const sa = a.apex.seed(), sb = b.apex.seed();
    assert.notEqual(sa, 1, "an unpinned, non-automated boot draws a fresh seed");
    assert.notEqual(sa, sb, `two page loads, two races: ${sa} vs ${sb}`);
    assert.equal(pinned.apex.seed(), 42, "?seed=42 pins it");
  } finally { def.close(); a.close(); b.close(); pinned.close(); }
});

test("opts.storage.tyreWear turns the model on — the seam --wear rides", async () => {
  const w = await createGame({ track: "monza", storage: { tyreWear: "real" } });
  try {
    assert.equal(w.G.raceTyreWear, "real");
    assert.ok(w.G.tyres.on(), "tyres.on() false after asking for real wear");
    w.apex.setInput({ throttle: true, steer: 0 });
    w.step(600);
    w.apex.clearInput();
    const worn = w.G.cars.filter((c) => (c.tyreWear || 0) > 0);
    assert.ok(worn.length >= 5,
      `only ${worn.length} cars accumulated any wear over 10 s of racing`);
  } finally { w.close(); }
});

// hunt3 4-F3: the driving line's forward (exit) sweep took the bare pace-5
// ACCEL, so below PACE 1 the ribbon expected the car to pull up to 2.1x harder
// than it can. A DISPLAY (ribbon + brake cue): fed what the car really pulls.
test("the driving line never gains speed faster than the car can accelerate at this pace", async () => {
  const A = g.apex, pace0 = A.tuning().pace;
  try {
    await g.race("monza");
    A.go();
    for (const pace of [1, 0.469]) {
      A.setPhysics({ pace });
      A.drivingLine("full");
      for (let i = 0; i < 3; i++) { A.step(1 / 60, 1); g.pumpFrame(); }
      const d = A.drivingLine(), ds = g.G.track.total / d.samples;
      assert.equal(d.built, "monza", "the line was rebuilt for this pace");
      let maxA = 0;
      for (let i = 1; i < d.samples; i++) {
        const v0 = d.speedAt((i - 1) * ds), v1 = d.speedAt(i * ds);
        maxA = Math.max(maxA, (v1 * v1 - v0 * v0) / (2 * ds));
      }
      assert.ok(maxA <= g.G.aTop() * 1.01, `pace ${pace}: the line gains ${maxA.toFixed(2)} m/s^2, the car pulls ${g.G.aTop()}`);
    }
  } finally { A.setPhysics({ pace: pace0 }); }
});
