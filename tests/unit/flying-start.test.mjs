// flying-start — qualifying and time trial begin at speed (js/race/flying-start.js),
// the Data Hub JUMP IN's rolling start: on the first countdown frame the player
// is dropped in on the road BEFORE the line at the AI's speed there, driven by
// the AI for HANDOVER_S with the count on the lights plate, then handed the
// wheel with road to spare, so the timed lap (from the line) is a flying lap.
// The real module in a vm with a G stub; under a second.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { absSrc } from "../helpers/abs-src.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");
// FlyingStart run-up scalars stay module-local; pin the documented values here.
const HANDOVER_S = 3, MARGIN_S = 2.5, MIN_RUN_M = 150, MAX_RUN_FRAC = 0.3;
function runUpMetres(vDrop, total) {
  const want = Math.max(MIN_RUN_M, (vDrop > 0 ? vDrop : 0) * (HANDOVER_S + MARGIN_S));
  return total > 0 ? Math.min(want, total * MAX_RUN_FRAC) : want;
}

// production only calls update() in "count" and "race" (game.js update(); never in the menu), so the rigs do too.
function rig({ session = "quali", timeTrial = false, practice = false, real = false, total = 5000, dropV = 60, LapRetry } = {}) {
  const plate = [], said = [], seated = [];
  let calibrated = 0;
  const ctx = {
    Math, Object, Log: { info() {} },
    Input: { calibrate: () => { calibrated++; } },
    Tracks: { sample: (tr, s, o) => { o.p = [0, 0, s]; o.t = [0, 0, 1]; o.r = [1, 0, 0]; return o; } },
    // seatOnRoad is the real one's contract: re-seed the pose from the road at the car's current s (stubbed tangent = +z)
    RealRace: { dropSpeed: () => dropV, seatOnRoad: (tr, c) => { seated.push(c.s); c.head = 0; } },
  };
  if (LapRetry) ctx.LapRetry = LapRetry;
  vm.createContext(ctx);
  vm.runInContext(read("js/race/flying-start.js") + "\n;globalThis.FlyingStart = FlyingStart;", ctx, { filename: absSrc("js/race/flying-start.js") });
  const player = { s: 4990, x: 2, speed: 0, lap: 0, prog: -14, human: true, local: true, isPlayer: true, launchOn: true, launch: {} };
  const G = {
    state: "menu", session, timeTrial, practice, player, track: { total },
    vTop: () => 80, wrapS: (s) => ((s % total) + total) % total,
    worldFromTrack: (s, x) => ({ x, z: s }),
    setCarRole: (c, human, local) => { c.human = human; c.local = local; c.isPlayer = local; },
    goRolling() { if (this.state !== "count") return false; this.state = "race"; return true; },
    handoverCount: (v) => plate.push(v),
    announce: (t) => said.push(t),
  };
  const fs_ = ctx.FlyingStart.create(G, { realRace: () => real, setPaused: "SP" });
  return { FS: ctx.FlyingStart, fs: fs_, G, player, plate, said, seated, calibrated: () => calibrated };
}

test("qualifying: the first countdown frame drops the car in at speed before the line, the AI driving", () => {
  const r = rig();
  r.G.state = "count";
  r.fs.update(1 / 60);            // the countdown is entered: armed, green at once
  assert.equal(r.G.state, "race", "no gantry: straight to green");
  assert.equal(r.player.speed, 60, "at the AI's drop speed for that piece of road");
  assert.equal(r.player.lap, 0);
  const run = runUpMetres(60, 5000);
  assert.equal(run, 60 * (HANDOVER_S + MARGIN_S), "hand-over plus margin, at speed");
  assert.equal(r.player.prog, -run, "before the line: the run-up is never timed");
  assert.equal(r.player.s, 5000 - run);
  assert.equal(r.player.x, 0);
  assert.equal(r.player.human, false, "the AI holds the wheel for the run-up");
  assert.equal(r.player.isPlayer, true, "…but the camera, HUD and audio stay on the player's car");
  assert.equal(r.player.launchOn, false, "no launch model on a car already at speed");
  assert.deepEqual(r.plate, [HANDOVER_S]);
  assert.match(r.said[0], /QUALIFYING · FLYING LAP/);
});

test("the hand-over counts down on the plate, then GO gives the wheel back and recalibrates", () => {
  const r = rig();
  r.G.state = "count"; r.fs.update(1 / 60);
  for (let i = 0; i < 60 * HANDOVER_S + 2; i++) r.fs.update(1 / 60);
  assert.equal(r.player.human, true);
  assert.equal(r.seated.length, 1, "the hand-over re-seeds the heading from the road at the current s");
  assert.deepEqual(r.plate.slice(0, 4), [3, 2, 1, "GO"]);
  assert.equal(r.calibrated(), 1, "the gantry's first lamp calibrated tilt; the hand-over does now");
  for (let i = 0; i < 60; i++) r.fs.update(1 / 60);
  assert.equal(r.plate[r.plate.length - 1], null, "the GO plate clears");
});

// Mutation hunt 2026-11-20: GO_HOLD_S 0.8→0.05 survived the 1 s clear check.
test("GO plate holds for 0.8 s after hand-over", () => {
  const r = rig();
  r.G.state = "count"; r.fs.update(1 / 60);
  for (let i = 0; i < 60 * HANDOVER_S + 2; i++) r.fs.update(1 / 60);
  assert.equal(r.plate[r.plate.length - 1], "GO");
  // 0.4 s later the plate must still say GO (a 0.05 s hold would already have cleared).
  for (let i = 0; i < Math.round(0.4 * 60); i++) r.fs.update(1 / 60);
  assert.equal(r.plate[r.plate.length - 1], "GO", "GO holds through 0.4 s");
  // Past 0.8 s the plate clears.
  for (let i = 0; i < Math.round(0.5 * 60); i++) r.fs.update(1 / 60);
  assert.equal(r.plate[r.plate.length - 1], null, "GO clears once the 0.8 s hold elapses");
});

test("time trial gets the same flying start; a race, practice and a Data Hub real race do not", () => {
  const tt = rig({ session: "tt", timeTrial: true, practice: true });   // game.js isPractice(): a time trial is always practice
  tt.G.state = "count"; tt.fs.update(1 / 60);
  assert.equal(tt.G.state, "race");
  assert.match(tt.said[0], /TIME TRIAL · FLYING LAP/);
  for (const opts of [{ session: "race" }, { session: "quali", practice: true }, { session: "quali", real: true }]) {
    const r = rig(opts);
    r.G.state = "count"; r.fs.update(1 / 60);
    assert.equal(r.G.state, "count", JSON.stringify(opts) + ": the gantry runs as before");
    assert.equal(r.player.speed, 0);
  }
});

test("RESTART re-arms: every new countdown is a new rolling start", () => {
  const r = rig();
  r.G.state = "count"; r.fs.update(1 / 60);
  r.fs.update(1 / 60);
  r.player.speed = 0; r.player.prog = 123;
  r.G.state = "count"; r.fs.update(1 / 60);   // race -> count, as pm-restart does
  assert.equal(r.G.state, "race");
  assert.equal(r.player.speed, 60);
  assert.ok(r.player.prog < 0);
});

test("stop() hands the wheel back at once (__apex.go() and quitting to the menu)", () => {
  const r = rig();
  r.G.state = "count"; r.fs.update(1 / 60);
  assert.equal(r.fs.active(), true);
  r.fs.stop();
  assert.equal(r.player.human, true);
  assert.equal(r.seated.length, 1, "…facing along the road, not the drop heading");
  assert.equal(r.fs.active(), false);
  assert.equal(r.plate[r.plate.length - 1], null);
});

test("a session quit mid-countdown (update() never runs in the menu) does not hide the next session's start", () => {
  const r = rig({ session: "race" });
  r.G.state = "count"; r.fs.update(1 / 60);          // a GP countdown, not wanted
  assert.equal(r.G.state, "count");
  r.G.state = "menu"; r.fs.stop();                   // quitToMenu() -> flyingStart.stop(); no update() in the menu
  r.G.session = "tt"; r.G.timeTrial = true;
  r.G.state = "count"; r.fs.update(1 / 60);          // the new time trial's first countdown frame
  assert.equal(r.G.state, "race", "armed: the first update after a quit-in-count is still a new start");
  assert.equal(r.fs.active(), true);
});

test("the run-up is clamped: never closer than the floor, never most of a short lap", () => {
  assert.equal(runUpMetres(5, 5000), MIN_RUN_M);
  assert.equal(runUpMetres(90, 1000), 1000 * MAX_RUN_FRAC);
  const floor = rig({ dropV: 5 });
  floor.G.state = "count"; floor.fs.update(1 / 60);
  assert.equal(floor.player.prog, -MIN_RUN_M, "live place uses the floor");
  const short = rig({ total: 1000, dropV: 90 });
  short.G.state = "count"; short.fs.update(1 / 60);
  assert.equal(short.player.prog, -(1000 * MAX_RUN_FRAC), "live place uses the lap frac cap");
});

test("the qualifying model is a flying lap too: no standing start charged", () => {
  const src = read("js/race/quali-model.js");
  assert.doesNotMatch(src, /standingLoss\(/, "both sides are flying laps now");
  // R3-RACE-INTEGRITY-1 (2026-10-10): simLap reads the PACE-anchored carLap(), still a flying lap.
  assert.match(src, /const base = carLap\(c, track, grip\);/);
  const apex = read("js/agent/apex.js");
  assert.match(apex, /go\(\) \{\n\s+if \(G\.flyingStart\) G\.flyingStart\.stop\(\);/);
});

// #6965 LAP RETRY: the drop callback fires once the car is placed AND green; rearm() runs the run-up again.
test("FlyingStart creates its RETRY LAP and captures once at the drop-in, after goRolling, with the car placed", () => {
  const drops = [], made = [];
  let r = null;
  const LapRetry = { create: (G, deps) => { made.push(deps); return { capture: () => drops.push({ state: r.G.state, prog: r.player.prog, human: r.player.human }) }; } };
  r = rig({ session: "tt", timeTrial: true, practice: true, LapRetry });
  assert.equal(made.length, 1);
  assert.equal(made[0].flyingStart, r.fs, "LapRetry is handed the instance that created it");
  assert.equal(made[0].setPaused, "SP", "…and game.js's setPaused");
  assert.equal(r.fs.retry, made.length && r.fs.retry, "exposed as .retry");
  r.G.state = "count"; r.fs.update(1 / 60);
  assert.equal(drops.length, 1);
  assert.equal(drops[0].state, "race", "captured in the frame count flipped to race");
  assert.ok(drops[0].prog < 0, "the car is already on the run-up");
  assert.equal(drops[0].human, false, "the AI holds the wheel at the capture");
  for (let i = 0; i < 60; i++) r.fs.update(1 / 60);
  assert.equal(drops.length, 1, "never again mid-race");
  assert.equal(rig().fs.retry, null, "no LapRetry loaded: no retry");
});

test("rearm() rebuilds the handover and counts HANDOVER_S again", () => {
  const r = rig({ session: "tt", timeTrial: true, practice: true });
  r.G.state = "count"; r.fs.update(1 / 60);
  for (let i = 0; i < 60 * HANDOVER_S + 2; i++) r.fs.update(1 / 60);
  assert.equal(r.fs.active(), false); assert.equal(r.player.human, true, "the wheel was handed over");
  r.player.s = 1234; r.player.prog = 800; r.player.speed = 10;   // a lap in progress
  const plateAt = r.plate.length;
  assert.equal(r.fs.rearm(), true);
  assert.equal(r.G.state, "race", "no countdown re-entry");
  assert.equal(r.fs.active(), true);
  assert.equal(r.player.human, false, "the AI drives the run-up again");
  assert.equal(r.player.prog, -runUpMetres(60, 5000), "placed at the same drop-in");
  assert.equal(r.plate[plateAt], HANDOVER_S, "the plate counts HANDOVER_S again");
  for (let i = 0; i < 60 * HANDOVER_S + 2; i++) r.fs.update(1 / 60);
  assert.equal(r.player.human, true);
  assert.deepEqual(r.plate.slice(plateAt, plateAt + 4), [3, 2, 1, "GO"]);
  assert.equal(r.said.filter((t) => t === "YOU HAVE CONTROL").length, 2);
});
