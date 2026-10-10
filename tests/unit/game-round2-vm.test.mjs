/* game-round2-vm.test.mjs — js/game.js findings of the round-2 hunt (2026-10-10), each
 * reproduced in the Node VM (tools/lib/game-vm.cjs) before its fix.
 *
 *   R4   BOOST was not gated by the pit limiter: the lane drained the battery.
 *   R5   the Detection Line EARNED an Overtake allowance inside the lane.
 *   I-03 the landscape lock quitToMenu dropped was never re-applied (still fullscreen).
 *   I-04 a launch that bypasses RACE! (Data Hub, Daily) never attached the gyro.
 *   I-07 a transient motion-permission rejection announced "switched to buttons".
 *   M5   a refused Data Hub / WATCH bundle said nothing.
 *   S1   a one-off GP's driven quali order outlived the GP (quitToMenu forgets it; a
 *        championship's order, and RACE AGAIN, keep it).
 *   S3   a STANDARD daily picked before the race-session bundle landed was prepared by
 *        the stub (a no-op): the bundle's hook prepares it.
 *   S4   the TT ghost car ran off the flying-start run-up clock.
 *   S6   quitToMenu mid-quali left `cars` trimmed to the player.
 *   CAM-1 a world-fixed TRACKSIDE / PIT WALL eye was damped in the CAR's frame.
 *   LT   the lightning bleach was not restored when the strike gate closed mid-flash.
 *   NET  openQuali's failed prepare quit without cancelling the lobby.
 *   DAILY a restored backup entry of the wrong shape threw in record().
 *
 * Run: node --test tests/unit/game-round2-vm.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import fs from "node:fs";
import vm from "node:vm";

const require = createRequire(import.meta.url);
const { createGame } = require("../../tools/lib/game-vm.cjs");

const ev = (g, src) => vm.runInContext(src, g.ctx);

test("R4: BOOST drains nothing and does not deploy while the pit limiter holds the car", async () => {
  const g = await createGame({ track: "monza" });
  try {
    const G = g.G, a = g.apex;
    await g.race("monza", "day", "dry", { laps: 5 });
    a.go(); a.setInput({ throttle: true, steer: 0 });
    g.step(120);
    const P = G.player, held = G.pits.held;
    P.boostOn = true; P.energy = 1;
    g.step(10);
    assert.equal(P.deploying, true, "control: BOOST deploys outside the lane");
    G.pits.held = () => true;   // the limiter holds every car
    try {
      g.step(5);
      const e0 = P.energy;
      g.step(30);
      assert.equal(P.deploying, false, "no deploy while the limiter holds the car");
      assert.ok(P.energy >= e0 - 1e-9, "and no battery drain in the lane (" + e0 + " -> " + P.energy + ")");
    } finally { G.pits.held = held; }
  } finally { g.close(); }
});

test("R5: the Detection Line cannot earn an Overtake while the pit limiter holds the car", async () => {
  const g = await createGame({ track: "monza" });
  try {
    const G = g.G, a = g.apex;
    await g.race("monza", "day", "dry", { laps: 5 });
    a.go(); a.setInput({ throttle: true, steer: 0 });
    ev(g, `globalThis.__otOpen = []; { const orig = OvertakeMode.lines;
      OvertakeMode = Object.assign({}, OvertakeMode, { lines(c, t, gap, open) { if (c.isPlayer) __otOpen.push(open); return orig.apply(this, arguments); } }); }`);
    g.step(10);
    const seen = (n) => ev(g, "__otOpen.splice(0)").slice(-n);
    const free = seen(5);
    assert.ok(free.length > 0 && free.every((o) => o === true), "control: detection is open outside the lane " + JSON.stringify(free));
    const held = G.pits.held;
    G.pits.held = () => true;
    try {
      g.step(10);
      const lane = seen(5);
      assert.ok(lane.length > 0 && lane.every((o) => o === false), "detection is shut in the lane " + JSON.stringify(lane));
    } finally { G.pits.held = held; }
  } finally { g.close(); }
});

test("LT: a flash cut short by the gate closing restores the saved ambient and exposure", async () => {
  const g = await createGame({ track: "monza" });
  try {
    const G = g.G, a = g.apex;
    g.step(30);
    assert.equal(G.isRaining(), false, "dry: the lightning gate is closed");
    G._ltBase = { ambientSky: [0.1, 0.11, 0.12], ambientGround: [0.2, 0.21, 0.22], exposure: 1 };
    for (let i = 0; i < 3; i++) { G.frame.ambientSky[i] = 0.9; G.frame.ambientGround[i] = 0.9; }
    G.frame.exposure = 1.5;
    G._ltFlash = 0.0011;   // the last frame of the decay
    a.snapCam(true);
    assert.equal(G._ltFlash, 0);
    assert.deepEqual([...G.frame.ambientSky], [0.1, 0.11, 0.12], "ambient sky back to the base");
    assert.deepEqual([...G.frame.ambientGround], [0.2, 0.21, 0.22]);
    assert.equal(G.frame.exposure, 1, "exposure back to the base");
  } finally { g.close(); }
});

test("S4: the TT ghost car waits for the first line crossing (lap 0 is the run-up)", () => {
  // render() cannot run its car/ghost draw in the VM (the culling planes come from GLX, stubbed
  // here: every frame faults at game.js _carCullPlanes), so this pins the gate in the source, next
  // to the HUD's own (hud.js: `(player.lap | 0) >= 1 ? ghost.timeAt(...)`).
  const src = fs.readFileSync(new URL("../../js/game.js", import.meta.url), "utf8");
  const line = src.split("\n").find((l) => /replayGhost\.at\(player\.lapTime\)/.test(l));
  assert.ok(line, "the ghost car lookup exists");
  assert.match(line, /\(player\.lap \| 0\) >= 1 \?/, "and runs only once the line has been crossed");
});

test("CAM-1: a world-fixed TRACKSIDE eye is not dragged down-track by the car-frame damper", async () => {
  const g = await createGame({ track: "monza" });
  try {
    const G = g.G, a = g.apex;
    a.setInput({ throttle: true, steer: 0 });
    g.step(240);
    assert.ok(G.player.speed > 10, "the car is moving");
    const modes = ev(g, "CamModes.CAM_MODES.map((m) => m.id)");
    G.setCamMode(modes.indexOf("trackside"), true);
    a.snapCam(true);
    const E0 = [...G.camEye];
    let drift = 0;
    for (let i = 0; i < 6; i++) {
      try { g.pumpFrame(1000 + i * 16.7); } catch (_) { /* the VM's draw stubs run dry after a few frames */ }
      drift = Math.max(drift, Math.hypot(G.camEye[0] - E0[0], G.camEye[2] - E0[2]));
    }
    assert.ok(drift < 0.1, "the eye stays on its post while the car passes (drift " + drift.toFixed(2) + " m; ~2.2 m when damped in the car's frame)");
  } finally { g.close(); }
});

test("S6: quitToMenu mid-quali gives the menu the whole field back", async () => {
  const g = await createGame({ track: "monza" });
  try {
    const G = g.G;
    ev(g, `globalThis.__auto = 0; ExtraRigs = Object.assign({}, ExtraRigs, { resetAuto() { __auto++; } })`);
    G.flow = "gp"; G.timeTrial = false; G.session = "quali";   // (timeTrial's setter writes the session)
    await G.startRace();
    assert.equal(G.cars.length, 1, "qualifying trims the grid to the player");
    G.quitToMenu();
    assert.equal(G.state, "menu");
    assert.ok(G.cars.length > 1, "the field is back (" + G.cars.length + ")");
    assert.equal(G.qualiSim(0).length, G.cars.length, "so the menu-time quali preview sees all of it");
    assert.equal(ev(g, "__auto"), 1, "the camera package's auto-cut state is reset on quit");
  } finally { g.close(); }
});

test("S1: quitToMenu forgets a one-off GP's quali order; a season's stays", async () => {
  const g = await createGame({ track: "monza" });
  try {
    const G = g.G;
    const SeasonCal = ev(g, "SeasonCal");
    const order = [{ id: "x", t: 80, human: true }];
    for (const [mode, kept] of [["gp", false], ["season", true]]) {
      G.flow = "gp";
      const s = G.season;
      s.qualiOrder = order; s.qualiTrack = "monza"; s.qualiMode = mode;
      SeasonCal.save(s);
      G.quitToMenu();
      assert.equal(!!G.season.qualiOrder, kept, mode + " order " + (kept ? "kept" : "forgotten") + " on quit");
    }
  } finally { g.close(); }
});

test("NET: a failed openQuali prepare cancels the lobby it was opened for", async () => {
  const g = await createGame({ track: "monza" });
  try {
    const G = g.G;
    let cancelled = 0;
    G.netLobby.cancel = () => { cancelled++; };
    ev(g, `Assets = Object.create(Assets, { modelsReady: { value: () => Promise.reject(new Error("scenery down")) } })`);   // ensureScenery (the PREPARE step) rejects
    await G.openQualiForNet(() => {});
    assert.equal(cancelled, 1, "quitToMenu cancelled the lobby (friendQualifying would gate every later quali save)");
  } finally { g.close(); }
});

test("I-03/I-04: a launch that bypasses RACE! re-asks for the gyro and re-locks landscape", async () => {
  const g = await createGame({ storage: { steerMode: "tilt" } });   // no boot race: its startRace would ask first
  try {
    const G = g.G;
    ev(g, `globalThis.__in = { gyro: 0, lock: 0 }; { const real = Input;
      Input = Object.create(real, { requestGyro: { value() { __in.gyro++; return real.requestGyro(); } },
                                    lockLandscape: { value() { __in.lock++; return real.lockLandscape(); } } }); }`);
    ev(g, "document.fullscreenElement = {}");
    G.flow = "gp"; G.session = "race";
    await G.startRace();
    assert.equal(ev(g, "__in.gyro"), 1, "startRace attached the gyro");
    assert.ok(ev(g, "__in.lock") >= 1, "and re-applied the landscape lock while fullscreen");
    await G.startRace();
    assert.equal(ev(g, "__in.gyro"), 1, "asked once, not on every start");
  } finally { g.close(); }
});

test("I-07: a transient motion-permission rejection does not claim a switch to buttons", async () => {
  const g = await createGame({ track: "monza", storage: { steerMode: "tilt" } });
  try {
    const G = g.G;
    ev(g, `DeviceOrientationEvent.requestPermission = () => Promise.reject(new Error("no user activation"))`);
    G.enableTilt();
    for (let i = 0; i < 5; i++) await Promise.resolve();
    const said = ev(g, `document.getElementById("audiostate").textContent`);
    assert.ok(!/switched/i.test(said), "no false 'switched' banner: " + said);
    assert.equal(G.getSteerMode(), "tilt", "and nothing was switched");
  } finally { g.close(); }
});

test("I-pm-calib: RECALIBRATE takes the zero a beat after the tap, not under the thumb", async () => {
  const g = await createGame({ track: "monza" });
  try {
    ev(g, `globalThis.__cal = 0; { const real = Input; Input = Object.create(real, { calibrate: { value() { __cal++; return real.calibrate(); } } }); }`);
    g.apex.setInput({ throttle: true, steer: 0 });
    g.step(30);
    ev(g, `document.getElementById("pm-calib")`).onclick();
    assert.equal(ev(g, "__cal"), 0, "nothing is zeroed at the instant of the tap");
    for (let i = 0; i < 5; i++) { await new Promise((r) => setTimeout(r, 80)); g.flushTimers(); }
    assert.equal(ev(g, "__cal"), 1, "the zero lands once the delay has passed");
  } finally { g.close(); }
});

test("M5: a refused Data Hub bundle announces it (door and WATCH)", async () => {
  const g = await createGame({ track: "monza" });
  try {
    const G = g.G;
    ev(g, `UpdateCheck = Object.assign({}, UpdateCheck, { blocksLazyLoad: () => true })`);   // every lazy load is refused
    G.quitToMenu();
    const said = () => ev(g, `document.getElementById("announce-text").textContent`);
    const settle = async () => { for (let i = 0; i < 40; i++) { await new Promise((r) => setTimeout(r, 10)); g.flushTimers(); } };
    ev(g, `document.getElementById("mb-data")`).onclick();
    await settle();
    assert.match(said(), /COULD NOT LOAD/, "the DATA door says why nothing opened");
  } finally { g.close(); }
});

test("S3: a STANDARD daily chosen before the race-session bundle landed is prepared when it lands", async () => {
  let deps = null;
  const g = await createGame({
    onSandbox: (sb) => {
      let v;
      Object.defineProperty(sb, "LazyBundles", { configurable: true, get: () => v, set: (x) => {
        v = x && typeof x.create === "function" ? Object.assign({}, x, { create(d) { deps = d; return x.create(d); } }) : x;
      } });
    },
  });
  try {
    const G = g.G;
    assert.ok(deps && typeof deps.onRaceSessionReady === "function", "the lazy-bundle hook is reachable");
    ev(g, `globalThis.__prep = 0; { const orig = SessionRecords.create;
      SessionRecords = Object.assign({}, SessionRecords, { create(Gm) { const r = orig.call(this, Gm); const p = r.prepareDaily; r.prepareDaily = () => { __prep++; return p(); }; return r; } }); }`);
    G.daily.select("2026-10-10", "standard");
    assert.equal(G.daily.current().class, "standard");
    deps.onRaceSessionReady();
    assert.equal(ev(g, "__prep"), 1, "the new records instance prepared the STANDARD tunables");
    G.daily.stop();
    deps.onRaceSessionReady();
    assert.equal(ev(g, "__prep"), 1, "no daily active: nothing to prepare");
  } finally { g.close(); }
});

test("DAILY: record() survives a restored entry of the wrong shape", async () => {
  const g = await createGame({ track: "monza" });
  try {
    const G = g.G;
    const day = "2026-10-10";
    const d = G.daily;
    d.select(day, "open");
    for (const bad of [5, "x", [1], { laps: "3", best: "fast", classes: { k: 7 } }, { laps: null, best: NaN, classes: [] }]) {
      G.store.set("daily.v1", { days: { [day]: bad }, streak: { count: 0, last: null } });
      const label = JSON.stringify(bad);
      let e;
      assert.doesNotThrow(() => { e = d.record(61.5, "k"); }, "bad entry " + label);
      assert.equal(e.laps, 1, "restarted from a clean count: " + label);
      assert.equal(e.best, 61.5);
      assert.equal(e.classes.k.laps, 1);
    }
    G.store.set("daily.v1", { days: { [day]: 5 }, streak: { count: 0, last: null } });
    assert.equal(d.today(), null, "today() treats a non-object entry as no entry");
    d.stop();
  } finally { g.close(); }
});
