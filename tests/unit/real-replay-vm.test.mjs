// REAL REPLAY (js/race/real-replay.js) in the real game VM on the real Baku build — the engine.
//
// The highlights: the script's passes, stops, retirements, flags, fastest lap and radio in one
// time-ordered list, and the reel cut from it. RealRace.launch({watch}) turns the field into puppets
// posed from traces on the countdown frame, the camera on the DRIVE AS seat, follows any car, runs at
// any speed, parks a car whose data ends, and hands the order to the results. JUMP IN, terminal
// classification and the recorded flags / weather / tyre sets. Split by concern (M1-15): the frame
// fit is real-replay-frame-fit, BROADCAST real-replay-broadcast, the transport UI and seeks
// real-replay-transport, audio focus real-replay-audio-focus.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { createGame } = require("../../tools/lib/game-vm.cjs");
import { ROOT, host, scriptIn, line, transportReplay, watchEnvironment } from "../helpers/real-replay-fixtures.mjs";
import { absSrc } from "../helpers/abs-src.mjs";

test("the highlights list every moment of the race in time order, and the reel keeps the cuts", async () => {
  const g = await createGame({ track: "baku" });
  try {
    const R = vm.runInContext("RealReplay", g.ctx);
    const { D, script } = scriptIn(g);
    assert.equal(script.v, D.SCRIPT_V);
    assert.ok(script.t0 > 0 && script.fastest && script.fastest.num === 63 && script.fastest.lap === 49, "the fastest lap: Russell's 49th");
    const list = R.highlightsFor(script);
    const kinds = {};
    for (const h of list) kinds[h.kind] = (kinds[h.kind] || 0) + 1;
    assert.deepEqual(host(kinds), { pass: 128, pit: 36, out: 7, sc: 2, green: 2, fastest: 1, radio: 27 });
    for (let i = 1; i < list.length; i++) assert.ok(list[i].t >= list[i - 1].t, "time order");
    const first = list.find((h) => h.kind === "pass");
    assert.equal(first.text, "PIA PASSES LEC FOR P2"); assert.equal(first.lap, 1); assert.ok(first.t > 10 && first.t < 20);
    const nor = list.find((h) => h.kind === "out" && /^NOR/.test(h.text));
    assert.equal(nor.text, "NOR OUT · TURN 1"); assert.equal(nor.lap, 36);
    const sc = list.filter((h) => h.kind === "sc");
    assert.deepEqual(host(sc.map((h) => h.lap)), [31, 36]);
    assert.ok(sc[0].t > 3000 && sc[0].t < 3400, "the first safety car half an hour in: " + sc[0].t);
    const rus = list.find((h) => h.kind === "pit" && /^RUS/.test(h.text));
    assert.equal(rus.text, "RUS PITS · SOFT"); assert.equal(rus.lap, 31);
    const radio = list.find((h) => h.kind === "radio");
    assert.ok(/^https:\/\/livetiming\.formula1\.com\//.test(radio.url) && radio.text === "RADIO · PIA" && radio.lap === 4);
    const reel = R.reelFor(list);
    assert.ok(reel.every((h) => h.kind !== "radio"), "the reel is the pictures; the radio plays as it comes");
    assert.ok(reel.filter((h) => h.kind === "pit").every((h) => h.pos <= 8), "only the front-runners' stops make the cut");
    assert.ok(reel.length > 60 && reel.length < list.length, "a reel of " + reel.length);
    for (let i = 1; i < reel.length; i++) assert.ok(reel[i].kind !== reel[i - 1].kind || reel[i].t - reel[i - 1].t >= R.HOLD_S, "no two cuts of one kind inside a hold");
  } finally { g.close(); }
});

test("WATCH: the field becomes puppets on the countdown frame, the camera on the seat; follow, speed, a car whose data ends, the flag", async () => {
  const g = await createGame({ track: "baku", storage: { tyreWear: "real" } });
  try {
    const { G } = g;
    const RR = vm.runInContext("RealRace", g.ctx);
    const { script } = scriptIn(g);
    const traces = { frame: "track", cars: { 63: line(-14, 50, 0, -5, 200), 16: line(-22, 48, 1, -5, 200), 18: line(-30, 45, -1, -5, 60) } };
    const savedCamera = G.camMode;
    const staged = RR.launch(script, { seat: "LEC", watch: true, camera: "heli", traces, startLap: 1 });
    assert.deepEqual(host(staged), { trackId: "baku", laps: 51, seat: "LEC", startLap: 1, watch: true, reel: false });
    await g.settle(() => G.track && G.track.def && G.track.def.id === "baku" && (G.state === "count" || G.state === "race"), 8000);
    g.step(2);   // the countdown frame arms the director, which starts the replay
    let st = RR.status();
    assert.equal(st.watch, true); assert.equal(st.armed, true);
    assert.ok(st.replay && st.replay.follow === "LEC" && st.replay.cars === 3, JSON.stringify(st.replay));
    assert.equal(G.player.code, "LEC", "the camera and HUD are on the seat");
    assert.equal(G.camMode, 6, "WATCH uses the requested aerial camera");
    assert.equal(G.store.get("camMode", savedCamera), savedCamera, "WATCH does not overwrite the driving camera");
    G.setCamMode(11);
    assert.equal(G.store.get("camMode", savedCamera), savedCamera, "manual WATCH camera changes also stay session-only");
    assert.ok(G.cars.every((c) => !c.human), "nobody drives");
    const by = (code) => G.cars.find((c) => c.code === code);
    assert.ok(RR.replay().owns(by("RUS")) && RR.replay().owns(by("LEC")) && RR.replay().owns(by("HAM")), "every car is the replay's");
    assert.ok(by("HAM").retired, "a car with no data is parked");
    g.apex.go();
    g.step(60);   // one second of the race at 1x
    st = RR.status();
    assert.ok(Math.abs(st.replay.T - 1) < 0.05, "the clock: " + st.replay.T);
    assert.ok(Math.abs(by("RUS").s - 36) < 2 && by("RUS").lap === 1, "Russell 50 m/s from 14 m behind the line: s=" + by("RUS").s + " lap=" + by("RUS").lap);
    assert.ok(Math.abs(by("LEC").s - 26) < 2 && Math.abs(by("LEC").x - 1) < 0.01, "Leclerc on his line");
    assert.ok(Math.abs(by("RUS").speed - 50) < 1, "the trace's speed: " + by("RUS").speed);
    assert.ok(by("RUS").px != null && by("RUS").pz != null, "a world pose");
    // Follow by code and up the order; the speed steps.
    assert.equal(RR.replay().follow("RUS"), "RUS");
    assert.equal(G.player.code, "RUS");
    assert.equal(RR.replay().follow(+1), "LEC", "down the order");
    assert.equal(RR.replay().setSpeed(4), 4);
    g.step(60);
    st = RR.status();
    assert.ok(Math.abs(st.replay.T - 5) < 0.1, "four seconds more at 4x: " + st.replay.T);
    // Stroll's data ends at 60 s: at 8x, 60 frames = 8 s a second — past 63 s he is parked where he stopped.
    RR.replay().setSpeed(8);
    g.step(60 * 8);
    st = RR.status();
    assert.ok(st.replay.T > 63, "T=" + st.replay.T);
    assert.equal(by("STR").retired, true);
    assert.ok(Math.abs(by("STR").prog - (-30 + 45 * 60)) < 1, "parked where the data ended: " + by("STR").prog);
    assert.equal(by("RUS").retired, false);
    // The flag: the winner's data ends at 200 s; a few seconds later the results take the order.
    // Nobody DROVE it: the followed car (G.player) gets no YOUR RACE card — the
    // sheet reads RealRace.status().watch, still live while endRace builds it.
    // (The badge half of that gate is pinned in ui-sheets-audit.test.mjs: here
    // the followed car reads retired at the flag, so forRace is empty anyway.)
    RR.replay().seek(205);
    g.step(5 * 60 / 8 + 60);
    assert.equal(G.state, "results");
    const personal = (el) => (el.children || []).some((e) => e.className === "res-personal" && /YOUR RACE/.test((e.children || []).map((x) => x.textContent).join(" ")));
    assert.equal(personal(G.els.resultsTable), false, "a watched replay draws no YOUR RACE card");
    g.step(1);
    assert.equal(RR.replay().isRunning(), false, "the replay stopped with the director at the results");
    assert.equal(RR.status().armed, false);
    assert.equal(G.camMode, savedCamera, "leaving WATCH restores the driving camera");
  } finally { g.close(); }
});

test("WATCH official finishers and disqualifications survive the full game's result settlement", async () => {
  const g = await createGame({ track: "baku", storage: { tyreWear: "real" } });
  try {
    const { G } = g, RR = vm.runInContext("RealRace", g.ctx), regs = vm.runInContext("SportingRegs", g.ctx);
    const { script } = scriptIn(g);
    const officialDsq = script.drivers.find((d) => d.code === "LEC");
    officialDsq.dsq = true; officialDsq.dnf = true; officialDsq.pos = null;
    const traces = { frame: "track", cars: { 63: line(-14, 50, 0, -5, 30), 16: line(-22, 48, 1, -5, 30) } };
    const previousCars = G.cars;
    RR.launch(script, { seat: "RUS", watch: true, camera: "side", traces });
    await g.settle(() => G.cars !== previousCars && G.track && G.track.def && G.track.def.id === "baku" && (G.state === "count" || G.state === "race"), 8000);
    g.step(2); g.apex.go();
    const winner = G.cars.find((c) => c.code === "RUS"), dsq = G.cars.find((c) => c.code === "LEC");
    assert.equal(G.pits.twoCompoundApplies(), true, "this dry full-distance race exercises the simulator's compound rule");
    assert.equal(regs.compoundShort(winner.tyreLog), true, "position puppets have only the simulated grid tyre, not their real stops");
    winner.penalty = 10;
    RR.replay().seek(30); g.step(60 * 8);
    assert.equal(G.state, "results");
    assert.equal(winner.finished, true); assert.equal(winner.retired, false);
    assert.equal(!!winner.dsq, false, "a real winner cannot be disqualified by the replay's simulated tyre log");
    assert.equal(winner.dnf, null); assert.equal(winner.finPos, 1);
    assert.equal(winner.penalty, 0, "simulator penalties cannot change the published finish clock");
    const publishedWinner = script.drivers.find((d) => d.pos === 1), lastLap = publishedWinner.lapsDone - 1;
    assert.equal(winner.finishT, publishedWinner.lapStart[lastLap] + publishedWinner.laps[lastLap]);
    assert.equal(!!dsq.dsq, true, "the published disqualification must survive simulator settlement");
    assert.equal(dsq.retired, false); assert.equal(dsq.finished, false);
    const classification = G.els.resultsTable.children.find((n) => n.getAttribute("role") === "list"
      && n.getAttribute("aria-label") === "Race classification");
    assert.ok(classification, "published results expose the named race classification");
    const rows = classification.children.filter((n) => String(n.className).split(" ").includes("res-row"));
    assert.equal(rows.length, G.cars.length, "every official car retains one classification row");
    const text = (row) => row.children.map((n) => n.textContent).join(" ");
    assert.match(text(rows.find((row) => /LEC/.test(text(row)))), /DSQ/);
    assert.doesNotMatch(text(rows.find((row) => /RUS/.test(text(row)))), /DSQ|DNF/);
  } finally { g.close(); }
});

test("JUMP IN with the positions loaded drops each car exactly where its trace says", async () => {
  const g = await createGame({ track: "baku", storage: { tyreWear: "real" } });
  try {
    const { G } = g;
    const RR = vm.runInContext("RealRace", g.ctx);
    const { script } = scriptIn(g);
    const lead = script.drivers.find((d) => d.pos === 1);
    const t0 = lead.lapStart[2];   // the start of real lap 3
    const total = 5899;
    const traces = { frame: "track", cars: { 63: line(-14, 50, 0.5, -5, 400), 16: line(-22, 48, -1.5, -5, 400) } };
    RR.launch(script, { seat: "HAM", traces, startLap: 3 });
    await g.settle(() => G.track && G.track.def && G.track.def.id === "baku" && (G.state === "count" || G.state === "race"), 8000);
    // Observe the director's placement before the AI starts moving toward its
    // racing line. A different recorded timestamp can put it on a corner where
    // even the first driven frames legitimately change its lateral position.
    G.realRace.update(0); G.realRace.update(0);
    const st = RR.status();
    assert.equal(st.watch, false); assert.equal(st.placed, true);
    assert.equal(G.state, "race", "green at once");
    assert.ok(st.handover > 3.5 && st.handover <= 4, "the seat car is the AI's for four seconds: " + st.handover);
    const by = (code) => G.cars.find((c) => c.code === code);
    const want = -14 + 50 * t0;
    assert.ok(Math.abs(by("RUS").prog - want) < 60, "Russell at his trace's progress (a frame on): " + by("RUS").prog + " vs " + want);
    assert.equal(by("RUS").lap, Math.floor(want / G.track.total) + 1);
    assert.ok(Math.abs(by("RUS").x - 0.5) < 0.1 && Math.abs(by("LEC").x + 1.5) < 0.1, "placed on their recorded lines: " + by("RUS").x + " " + by("LEC").x);
    assert.equal(G.cars.filter((c) => c.human).length, 0, "nobody is human yet: the seat car is driven for the player");
    assert.equal(G.player.local, true, "but the camera and HUD are on it");
    assert.ok(G.player.speed > 0.3 * 80, "at speed: " + G.player.speed);
    g.step(60 * 4.2);
    assert.equal(RR.status().handover, 0);
    assert.equal(G.player.human, true, "the wheel is the player's after the hand-over");
    assert.equal(G.cars.filter((c) => c.human).length, 1);
    assert.ok(G.track.total > total - 10 && G.track.total < total + 10);
  } finally { g.close(); }
});

test("JUMP IN samples published trace time when a timing gap separates it from the pace clock", async () => {
  const g = await createGame({ track: "baku", storage: { tyreWear: "real" } });
  try {
    const { G } = g, RR = vm.runInContext("RealRace", g.ctx);
    const { script } = scriptIn(g);
    // A restart/timing gap moves the absolute feed clock, without changing the
    // lap durations used to calibrate the simulated field's pace.
    for (const d of script.drivers) d.lapStart = d.lapStart.map((t, i) => t != null && i >= 2 ? t + 45 : t);
    const at = RR.fieldAt(script, 3);
    const published = Math.min(...script.drivers.map(d => d.lapStart[2]).filter(Number.isFinite));
    assert.ok(published - at.t0 > 40, "the fixture exercises different position and pace clocks");
    const traces = { frame: "track", cars: { 63: line(-14, 50, 0.5, -5, 400) } };
    RR.launch(script, { seat: "HAM", traces, startLap: 3 });
    await g.settle(() => G.track && G.track.def && G.track.def.id === "baku" && (G.state === "count" || G.state === "race"), 8000);
    g.step(2);
    const car = G.cars.find((c) => c.code === "RUS");
    const want = -14 + 50 * published, old = -14 + 50 * at.t0;
    assert.ok(Math.abs(car.prog - want) < 60, "the car is at the published instant: " + car.prog + " vs " + want);
    assert.ok(Math.abs(car.prog - old) > 1900, "the synthetic clock would drop the car over two kilometres early");
    assert.equal(car.lap, Math.floor(want / G.track.total) + 1);
    assert.ok(Math.abs(G.raceT - RR.status().K * at.t0) < 0.1,
      "the simulated race clock retains its existing pace calibration");
  } finally { g.close(); }
});

test("WATCH snaps after posing on mid-race entry and seek, and releases camera ownership on restart", () => {
  const ctx = vm.createContext({ M4: { clamp: (v, a, b) => Math.max(a, Math.min(b, v)) },
    Log: { info() {}, warn() {} },
    CamModes: { CAM_MODES: [{ id: "cockpit" }, { id: "heli" }] },
    Tracks: { sample: (_track, s, out) => { out.p = [s, 0, 0]; out.t = [1, 0, 0]; out.r = [0, 0, 1]; out.hw = 7; } } });
  vm.runInContext(fs.readFileSync(path.join(ROOT, "js/race/real-replay.js"), "utf8"), ctx, { filename: absSrc("js/race/real-replay.js") });
  const R = vm.runInContext("RealReplay", ctx), snaps = [], writes = [];
  const car = { code: "RUS" }, driver = { code: "RUS", num: 63, pos: 1, lapStart: [0, 10] };
  const G = { track: { total: 1000 }, cars: [car], state: "race", camMode: 0,
    followCar: (c) => { G.player = c; }, snapGameCam: () => snaps.push(G.player.prog),
    setCamMode: (m, opts) => { G.camMode = m; writes.push(opts.persist); } };
  const replay = R.create(G);
  const options = { script: { drivers: [driver] }, traces: { frame: "track", cars: { 63: line(0, 50, 0, 0, 30) } },
    seats: new Map([[car, driver]]), startLap: 2, camera: "heli" };
  assert.equal(replay.start(options), true);
  assert.equal(snaps.at(-1), 500, "entry snap sees lap 2, not the grid");
  replay.seek(20);
  assert.equal(snaps.at(-1), 1000, "seek snap sees the new pose");
  assert.equal(car.rPrevPx, car.px, "seek clears render interpolation from the previous position");
  replay.start(options);
  replay.stop();
  assert.equal(G.camMode, 0, "re-entry retains the original driving camera");
  assert.ok(writes.every((persist) => persist === false), "temporary camera writes never persist");
  assert.equal(replay.start({ ...options, camera: "unknown" }), true);
  assert.equal(G.camMode, 0, "unknown camera leaves the driving view usable");
  replay.stop();
});

test("WATCH final results use published finish and DNF evidence rather than position download endings", () => {
  const { replay, G, cars, drivers, options } = transportReplay();
  drivers[0].laps = [10, 10]; drivers[0].lapsDone = 2;
  drivers[1].dnf = true; drivers[1].laps = [8]; drivers[1].lapsDone = 1;
  G.endRace = (order) => { G.order = order; };
  replay.seek(30); replay.tick(7);
  assert.equal(cars[0].finished, true);
  assert.equal(cars[0].retired, false);
  assert.equal(cars[0].dnf, null);
  assert.equal(cars[0].finishT, 20);
  assert.equal(cars[0].lap, 3);
  assert.equal(cars[1].finished, false);
  assert.equal(cars[1].retired, true);
  assert.equal(cars[1].dnf, "dnf");
  assert.equal(cars[1].lap, 2);
  assert.equal(G.order[0], cars[0]);
  // Incomplete timing without a classification is never awarded a finish.
  drivers[1].dnf = false; drivers[1].pos = null;
  replay.start(options); replay.tick(37);
  assert.equal(cars[1].finished, false);
  assert.equal(cars[1].retired, false);
  assert.equal(cars[1].dnf, null);
  replay.stop();
});

test("WATCH with a missing, empty or truncated winner trace completes on usable positions and preserves official order", () => {
  for (const winner of [undefined, { t: [], prog: [], x: [] }, line(0, 50, 0, 0, 5)]) {
    const { replay, G, cars, drivers, options } = transportReplay();
    drivers[0].laps = [10, 10]; drivers[0].lapsDone = 2;
    drivers[1].laps = [12, 12]; drivers[1].lapStart = [0, 12]; drivers[1].lapsDone = 2;
    const traces = { frame: "track", cars: { 2: line(0, 45, 0, 0, 30) } };
    if (winner) traces.cars[1] = winner;
    G.endRace = (order) => { G.order = order; };
    assert.equal(replay.start({ ...options, traces, follow: drivers[0].code }), true);
    assert.equal(replay.status().follow, winner && winner.t.length ? drivers[0].code : drivers[1].code,
      "a failed selected-driver download falls back to a car with usable positions");
    replay.tick(15);
    assert.equal(replay.status().finished, false, "another driver's usable positions outlive the winner download");
    replay.tick(22);
    assert.equal(replay.status().finished, true);
    assert.equal(G.order[0], cars[0], "the winner's failed download never changes the published winner");
    assert.equal(cars[0].finished, true); assert.equal(cars[0].retired, false);
    assert.equal(cars[1].finished, true); assert.equal(cars[1].dnf, null);
    replay.stop();
    assert.equal(replay.start({ ...options, traces: { frame: "track", cars: {} } }), false, "an empty field cannot begin an endless replay");
  }
});

test("WATCH terminal classification preserves DNS and DSQ without inventing accidents", () => {
  for (const kind of ["dns", "dsq"]) {
    const { replay, G, cars, drivers } = transportReplay();
    drivers[1].dnf = true; drivers[1][kind] = true;
    G.endRace = () => {};
    replay.tick(37);
    assert.equal(cars[1].finished, false);
    assert.equal(cars[1].retired, kind === "dns");
    assert.equal(cars[1].dnf, kind === "dns" ? "dns" : null);
    assert.equal(!!cars[1].dsq, kind === "dsq");
    replay.stop();
  }
});

test("WATCH terminal results use published driver identities while retaining roster seat preferences", () => {
  const { replay, G, cars, drivers } = transportReplay();
  const team = { id: "current-team" };
  Object.assign(cars[0], { code: "OLD", name: "Current Roster Driver", driverId: "current-team:1", team });
  Object.assign(drivers[0], { code: "HIS", name: "Historical Driver" });
  Object.assign(cars[1], { code: "KEP", name: "Kept Roster Driver" });
  Object.assign(drivers[1], { code: " ", name: null });
  G.teamIdx = 3; G.driverIdx = 1;
  G.endRace = (order) => { G.order = order; };
  replay.tick(37);
  assert.equal(G.order[0], cars[0]);
  assert.equal(cars[0].code, "HIS"); assert.equal(cars[0].name, "Historical Driver");
  assert.equal(cars[0].driverId, "current-team:1"); assert.equal(cars[0].team, team);
  assert.equal(G.teamIdx, 3); assert.equal(G.driverIdx, 1);
  assert.equal(cars[1].code, "KEP"); assert.equal(cars[1].name, "Kept Roster Driver", "missing feed names preserve the readable roster fallback");
  replay.stop();
});

test("WATCH seeks restore recorded flags immediately, and a paused red never restarts the puppet field", async () => {
  const { g, G, RR, replay } = await watchEnvironment();
  try {
    g.apex.go(); replay.setPaused(true);
    replay.seek(15); assert.equal(g.apex.caution().level, 3);
    replay.seek(35); assert.equal(g.apex.caution().level, 0);
    replay.seek(15); assert.equal(g.apex.caution().level, 3, "rewind restores the passed safety car before a frame");
    replay.seek(28); assert.equal(g.apex.caution().level, 0, "recorded end time wins over the inclusive lap window");
    replay.seek(45); assert.equal(g.apex.caution().level, 4);
    const car = G.player, pose = [car.prog, car.lap, car.px, car.pz], clock = replay.status().T;
    g.step(15 * 60);
    assert.equal(G.state, "race", "recorded red has no live-drive countdown");
    assert.equal(replay.status().T, clock); assert.equal(replay.status().paused, true);
    assert.deepEqual([car.prog, car.lap, car.px, car.pz], pose, "pause preserves the recorded pose past the live red timeout");
    assert.equal(g.apex.caution().level, 4);
    replay.seek(75); assert.equal(g.apex.caution().level, 0);
    replay.seek(45); assert.equal(g.apex.caution().level, 4, "a recorded red can be watched twice");
    G.quitToMenu(); assert.equal(g.apex.caution().level, 0, "leaving WATCH releases its flag owner");
  } finally { g.close(); }
});

test("WATCH entry and paused seeks take weather from the recording, independent of completed future rain", async () => {
  for (const startLap of [1, 20]) {
    const { g, G, replay } = await watchEnvironment(startLap);
    try {
      assert.ok(Math.abs(replay.status().T - (startLap - 1) * 10) < 0.05);
      assert.equal(G.raceWeather, startLap === 1 ? "dry" : "rain", "entry already has the recorded weather");
      g.apex.go(); replay.setPaused(true);
      const weather = () => ({ chip: G.raceWeather, wetness: G.trackWetness(), rendered: G.frame.wetness });
      replay.seek(15); const first = weather();
      assert.equal(first.chip, "rain"); assert.equal(first.wetness, 1);
      replay.seek(200); g.step(1);
      replay.seek(15); assert.deepEqual(weather(), first, "future footage cannot change the earlier snapshot");
      replay.seek(5); assert.equal(G.raceWeather, "dry"); assert.equal(G.trackWetness(), 0);
      assert.equal(G.frame.wetness, 0, "road presentation is restored before the seek paints");
      replay.seek(15); assert.deepEqual(weather(), first);
      assert.equal(G.weatherArc, null, "live weather arcs do not own a recorded sky");
      assert.equal(replay.status().paused, true);
      G.quitToMenu();
    } finally { g.close(); }
  }
});

test("WATCH takes its recorded flag ownership through the normal starting countdown", async () => {
  const { g, G, RR, script, traces, replay } = await watchEnvironment(3);
  try {
    for (let entry = 0; entry < 2; entry++) {
      if (entry) {
        const previousCar = G.cars[0];
        RR.launch(script, { seat: "RUS", watch: true, camera: "heli", traces, startLap: 3 });
        await g.settle(() => G.cars[0] !== previousCar && G.state === "count", 8000);
        g.step(2);
      }
      assert.equal(G.state, "count"); assert.equal(g.apex.caution().level, 3, "a repeated launch takes flag ownership afresh");
      replay.setPaused(true); const clock = replay.status().T;
      g.step(10 * 60);   // let the real starting lights finish, without go()
      assert.equal(G.state, "race"); assert.equal(replay.status().T, clock);
      assert.equal(g.apex.caution().level, 3);
    }
    replay.seek(35); assert.equal(g.apex.caution().level, 0);
    g.step(60); assert.equal(g.apex.caution().level, 0);
    G.quitToMenu();
  } finally { g.close(); }
});

test("WATCH seeks and playing show recorded sets including a same-compound restop", async () => {
  const { g, G, replay, script } = await watchEnvironment(1, 400, "off");
  try {
    const d = script.drivers.find((d) => d.code === "RUS");
    d.stints = [{ from: 1, to: 31, c: "MEDIUM" }, { from: 32, to: 36, c: "SOFT" }, { from: 37, to: 51, c: "SOFT" }];
    g.apex.go(); replay.setPaused(true);
    const c = G.cars.find((c) => c.code === "RUS");
    replay.seek(315); assert.equal(c.tyre.code, "S"); assert.equal(c.tyreStints, 2);
    const log = c.tyreLog;
    replay.seek(316); assert.equal(c.tyreLog, log, "same stint preserves metadata identity");
    replay.seek(365); assert.equal(c.tyre.code, "S"); assert.equal(c.tyreStints, 3); assert.equal(c.pitStops, 2);
    assert.notEqual(c.tyreLog, log);
    replay.seek(305); assert.equal(c.tyre.code, "M"); assert.equal(c.tyreStints, 1); assert.equal(c.pitStops, 0);
    replay.seek(309.9); replay.setPaused(false); replay.tick(0.2);
    assert.equal(c.tyre.code, "S"); assert.equal(c.tyreStints, 2);
    G.quitToMenu();
  } finally { g.close(); }
});
