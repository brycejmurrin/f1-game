// REAL REPLAY (js/race/real-replay.js) in the real game VM on the real Baku build.
//
// The frame fit: OpenF1's x/y for one of Russell's laps (a 2 Hz excerpt in the
// fixture) lands on the game's centreline within the road width, mirrored and
// turned as the feed's frame is, running the lap forward and 5.9 km long. The
// highlights: the v4 script's passes, stops, retirements, flags, fastest lap
// and radio in one time-ordered list, and the reel cut from it. The engine:
// RealRace.launch({watch}) turns the field into puppets posed from traces on the
// countdown frame, the camera on the DRIVE AS seat (nobody drives), follows any
// car, runs at any speed, parks a car whose data ends, and hands the order to
// the results when the winner's data does. And a JUMP IN with the positions
// loaded drops each car exactly where its trace says. ~6 s.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { createGame } = require("../../tools/lib/game-vm.cjs");

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const FIXTURE = JSON.parse(fs.readFileSync(path.join(ROOT, "tests/fixtures/openf1-baku-2026-race.json"), "utf8"));
const TOTAL_REAL = 6003;   // the real Baku lap, metres
const host = (v) => JSON.parse(JSON.stringify(v));   // VM objects into this realm for deepEqual

function scriptIn(g) {
  // The tab's builder in the game's own realm (Teams and Tracks are the game's).
  vm.runInContext(fs.readFileSync(path.join(ROOT, "js/data/real-race-tab.js"), "utf8"), g.ctx, { filename: "real-race-tab.js" });
  const D = vm.runInContext("DataRealRace", g.ctx);
  const Teams = vm.runInContext("Teams", g.ctx), Tracks = vm.runInContext("Tracks", g.ctx);
  const findTeam = (name) => Teams.LIST.find((t) => t.name === name) || null;
  return { D, script: D.build(FIXTURE, findTeam, Tracks.LIST) };
}
/** A synthetic track-frame trace: prog = p0 + v·t from t0 to t1 at 2 Hz (x constant). */
function line(p0, v, x, t0, t1) {
  const t = [], prog = [], xs = [];
  for (let tt = t0; tt <= t1 + 1e-9; tt += 0.5) { t.push(tt); prog.push(tt < 0 ? p0 : p0 + v * tt); xs.push(x); }
  return { t, prog, x: xs };
}

test("Russell's real lap lands on the game's Baku centreline: mirrored, turned, forward, 5.9 km", async () => {
  const g = await createGame({ track: "baku" });
  try {
    const R = vm.runInContext("RealReplay", g.ctx);
    const track = g.G.track;
    assert.ok(track && track.n > 1000 && Math.abs(track.total - TOTAL_REAL) < 150, "the game's Baku is the real length: " + track.total);
    const ex = FIXTURE.locationExcerpt;
    const pts = ex.rows.map((r) => [r[1] / 10, r[2] / 10]);
    const fit = R.fitFrame(track, pts);
    assert.ok(fit, "a fit");
    assert.ok(fit.rms < 7, "inside the road width (the fit pairs against a coarse centreline): rms " + fit.rms);
    assert.equal(fit.refl, -1, "OpenF1's frame is the mirror of the game's (+Y up, x/z ground)");
    // The trace as the engine keeps it: [t, x, y]* with t in seconds from lights out.
    const raw = Float32Array.from(ex.rows.flatMap((r) => [r[0] / 1000, r[1] / 10, r[2] / 10]));
    const tr = R.trackTrace(track, fit, raw);
    assert.equal(tr.n, ex.rows.length);
    const len = tr.prog[tr.n - 1] - tr.prog[0];
    assert.ok(len > 5700 && len < 6100, "one lap of progress: " + len);
    let back = 0;
    for (let i = 1; i < tr.n; i++) if (tr.prog[i] < tr.prog[i - 1] - 0.5) back++;
    assert.equal(back, 0, "never backwards");
    let worst = 0;
    for (let i = 0; i < tr.n; i++) worst = Math.max(worst, Math.abs(tr.x[i]));
    assert.ok(worst < 14, "the racing line stays near the road: " + worst);
    const at = R.sampleAt(tr, (raw[3 * 100] + raw[3 * 101]) / 2, {});
    assert.ok(at.speed > 25 && at.speed < 95, "a racing speed between two samples: " + at.speed);
    assert.ok(!at.before && !at.ended);
    assert.ok(R.sampleAt(tr, raw[0] - 5, {}).before, "before its data: on the grid");
    assert.ok(R.sampleAt(tr, tr.end + R.ENDED_S + 1, {}).ended, "after its data: stopped");
    // buildTraces fits on the winner's fastest lap when the whole race is there; with only this
    // excerpt on the winner it falls back to the first minutes after the start.
    const built = R.buildTraces(track, { drivers: [{ num: 63, pos: 1, code: "RUS", laps: [], lapStart: [] }] }, { cars: { 63: raw } });
    assert.ok(built && built.fit && built.byNum.get(63).n === tr.n);
  } finally { g.close(); }
});

test("the highlights list every moment of the race in time order, and the reel keeps the cuts", async () => {
  const g = await createGame({ track: "baku" });
  try {
    const R = vm.runInContext("RealReplay", g.ctx);
    const { script } = scriptIn(g);
    assert.equal(script.v, 4);
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
    const rows = G.els.resultsTable.children.filter((n) => String(n.className).split(" ").includes("res-row"));
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
    g.step(2);   // the countdown frame: a ROLLING start — the field is dropped in and the race is green at once
    const st = RR.status();
    assert.equal(st.watch, false); assert.equal(st.placed, true);
    assert.equal(G.state, "race", "green at once");
    assert.ok(st.handover > 3.5 && st.handover <= 4, "the seat car is the AI's for four seconds: " + st.handover);
    const by = (code) => G.cars.find((c) => c.code === code);
    const want = -14 + 50 * t0;
    assert.ok(Math.abs(by("RUS").prog - want) < 60, "Russell at his trace's progress (a frame on): " + by("RUS").prog + " vs " + want);
    assert.equal(by("RUS").lap, Math.floor(want / G.track.total) + 1);
    assert.ok(Math.abs(by("RUS").x - 0.5) < 0.1 && Math.abs(by("LEC").x + 1.5) < 0.1, "on their real lines (a driven frame on): " + by("RUS").x + " " + by("LEC").x);
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

test("WATCH snaps after posing on mid-race entry and seek, and releases camera ownership on restart", () => {
  const ctx = vm.createContext({ M4: { clamp: (v, a, b) => Math.max(a, Math.min(b, v)) },
    Log: { info() {}, warn() {} },
    CamModes: { CAM_MODES: [{ id: "cockpit" }, { id: "heli" }] },
    Tracks: { sample: (_track, s, out) => { out.p = [s, 0, 0]; out.t = [1, 0, 0]; out.r = [0, 0, 1]; out.hw = 7; } } });
  vm.runInContext(fs.readFileSync(path.join(ROOT, "js/race/real-replay.js"), "utf8"), ctx);
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

// ── BROADCAST (js/race/broadcast.js): the timing tower and the AUTO director ──
test("BROADCAST tower: the grid at lights out, the leader and gaps at the last line, the car out last, the fastest lap once it is set", async () => {
  const g = await createGame({ track: "baku" });
  try {
    const { script } = scriptIn(g);
    const B = vm.runInContext("Broadcast", g.ctx);
    const racing = script.drivers.filter((d) => !d.dns);
    const grid = host(B.towerAt(script, 0));
    assert.deepEqual(grid.map((r) => r.code), host(racing.slice().sort((a, b) => (a.grid || 99) - (b.grid || 99)).map((d) => d.code)), "before the first line the grid is the order");
    assert.ok(grid.every((r) => r.gap == null && !r.out), "no gaps and nobody out yet");
    // Just after the leader starts lap 32: 31 laps done at the front.
    const lead = script.drivers.find((d) => d.pos === 1);
    const T = lead.lapStart[31] + 1;
    const rows = host(B.towerAt(script, T));
    assert.equal(rows[0].code, "RUS"); assert.equal(rows[0].lap, 31); assert.equal(rows[0].gap, null);
    assert.ok(rows[1].gap > 0, "P2 carries a gap: " + rows[1].gap);
    assert.ok(rows[1].interval > 0 && Math.abs(rows[1].interval - rows[1].gap) < 1e-6, "P2's interval is its gap");
    const out = rows.filter((r) => r.out);
    assert.ok(out.some((r) => r.code === "STR"), "Stroll out on lap 8");
    assert.ok(rows.findIndex((r) => r.out) >= rows.length - out.length, "the cars out come last");
    for (let i = 2; i < rows.length; i++) {
      const a = rows[i - 1], b = rows[i];
      if (!a.out && !b.out && a.lap === b.lap && !a.down && !b.down && a.gap != null && b.gap != null) assert.ok(b.gap >= a.gap, "gaps grow down the tower at one line: " + a.code + " " + a.gap + " / " + b.code + " " + b.gap);
    }
    assert.ok(rows.filter((r) => !r.out).every((r) => /^[SMHIW]$/.test(r.tyre || "")), "every running car shows its tyre");
    assert.equal(B.fmtGap(rows[0], "gap"), "LEADER");
    assert.match(B.fmtGap(rows[1], "gap"), /^\+\d+\.\d$/);
    // The fastest lap turns purple only once it is set.
    const f = script.fastest;
    assert.ok(host(B.towerAt(script, f.t - 1)).every((r) => !r.fastest));
    assert.deepEqual(host(B.towerAt(script, f.t + 1)).filter((r) => r.fastest).map((r) => r.num), [f.num]);
  } finally { g.close(); }
});

test("BROADCAST towerAt: pools rows and skips rebuild when the timing-line sample is unchanged", async () => {
  const g = await createGame({ track: "baku" });
  try {
    const { script } = scriptIn(g);
    const B = vm.runInContext("Broadcast", g.ctx);
    const lead = script.drivers.find((d) => d.pos === 1);
    const T0 = lead.lapStart[31] + 1;
    const T1 = T0 + 0.2; // still between timing lines at 4 Hz tower tick
    const a = B.towerAt(script, T0);
    const snap = host(a);
    const b = B.towerAt(script, T1);
    assert.equal(b, a, "same pooled array when the discrete sample is unchanged");
    assert.equal(B.towerSample(script, T0), B.towerSample(script, T1), "sample key stable between crossings");
    assert.deepEqual(host(b), snap, "pooled rows keep the same tower content across a skipped rebuild");
    // Advance past the next leader crossing: sample and content must move.
    const T2 = lead.lapStart[32] + 1;
    assert.notEqual(B.towerSample(script, T0), B.towerSample(script, T2), "a new timing line changes the sample");
    const c = B.towerAt(script, T2);
    assert.equal(c, a, "still the module pool");
    assert.equal(c[0].lap, 32, "leader lap advances after the next crossing");
    assert.notDeepEqual(host(c).map((r) => r.lap), snap.map((r) => r.lap), "row content updates on a new sample");
  } finally { g.close(); }
});

test("BROADCAST director rules: the tightest battle up the order first, the next event by weight, never the same shot twice", async () => {
  const g = await createGame({ track: "baku" });
  try {
    const B = vm.runInContext("Broadcast", g.ctx);
    const cars = [{ key: "a", prog: 1000, speed: 60 }, { key: "b", prog: 970, speed: 60 }, { key: "c", prog: 600, speed: 60 }, { key: "d", prog: 590, speed: 60 }, { key: "e", prog: 400, speed: 60 }];
    const fights = host(B.battles(cars));
    assert.deepEqual(fights.map((x) => x.key), ["d", "b"], "0.17 s for P4 beats 0.5 s for P2; 3 s is no battle");
    const list = [{ t: 10, kind: "pit", num: 1 }, { t: 11, kind: "pass", num: 2 }, { t: 12, kind: "radio", num: 4 }, { t: 30, kind: "out", num: 3 }];
    assert.equal(B.nextEvent(list, 5, new Set(), 8).h.kind, "pass", "a pass outranks a stop in the same window");
    assert.equal(B.nextEvent(list, 5, new Set([1]), 8).h.kind, "pit", "shown once");
    assert.equal(B.nextEvent(list, 5, new Set(), 3), null, "nothing in the next 3 s");
    for (let n = 0; n < 6; n++) assert.notEqual(B.shotFor("pass", "side", n), "side");
  } finally { g.close(); }
});

test("BROADCAST battles: reuses one pooled array across calls (Director / PiP / ExtraRigs hot path)", async () => {
  const g = await createGame({ track: "baku" });
  try {
    const B = vm.runInContext("Broadcast", g.ctx);
    const cars = [{ key: "a", prog: 1000, speed: 60 }, { key: "b", prog: 970, speed: 60 }, { key: "c", prog: 600, speed: 60 }, { key: "d", prog: 590, speed: 60 }];
    const a = B.battles(cars);
    const snap = host(a);
    const b = B.battles(cars);
    assert.equal(b, a, "same pooled fights array");
    assert.deepEqual(host(b), snap, "content stable across reuse");
    assert.equal(b.length, 2);
    // Fewer battles: length shrinks without allocating a new array.
    const tight = [{ key: "a", prog: 1000, speed: 60 }, { key: "b", prog: 400, speed: 60 }];
    const c = B.battles(tight);
    assert.equal(c, a, "still the pool when the fight count drops");
    assert.equal(c.length, 0, "3 s gap is not a battle");
  } finally { g.close(); }
});

test("BROADCAST in WATCH (camera AUTO): the tower goes up, the director cuts to the car in the next event with a new shot, a follow key hands the picture over, the results take it down", async () => {
  const g = await createGame({ track: "baku", storage: { tyreWear: "real" } });
  try {
    const { G } = g;
    const RR = vm.runInContext("RealRace", g.ctx), R = vm.runInContext("RealReplay", g.ctx), CM = vm.runInContext("CamModes", g.ctx);
    const { script } = scriptIn(g);
    const traces = { frame: "track", cars: { 63: line(-14, 50, 0, -5, 400), 16: line(-22, 48, 1, -5, 400), 18: line(-30, 45, -1, -5, 60) } };
    const side = CM.CAM_MODES.findIndex((m) => m.id === "side");
    RR.launch(script, { seat: "LEC", watch: true, camera: "auto", traces, startLap: 1 });
    await g.settle(() => G.track && G.track.def && G.track.def.id === "baku" && (G.state === "count" || G.state === "race"), 8000);
    g.step(2);
    let bc = RR.status().replay.broadcast;
    assert.ok(bc && bc.auto && bc.tower, JSON.stringify(bc));
    assert.equal(G.camMode, side, "AUTO opens on the TV trackside shot");
    const doc = g.sandbox.document;
    assert.equal(doc.getElementById("bc-tower").hidden, false, "the tower is up");
    assert.ok(doc.body.classList.contains("bc-on"));
    g.apex.go();
    g.step(30);
    assert.ok(RR.status().replay.broadcast.rows >= 20, "a row per driver: " + RR.status().replay.broadcast.rows);
    // The next event with a traced car in it, a few seconds ahead.
    const codeOf = (num) => script.drivers.find((d) => d.num === num).code;
    const h = R.highlightsFor(script).find((x) => (x.num === 63 || x.num === 16) && ["pass", "pit", "out", "fastest"].includes(x.kind) && x.t > 20 && x.t < 380);
    assert.ok(h, "an event for Russell or Leclerc in the first 380 s");
    RR.replay().follow(h.num === 63 ? "LEC" : "RUS");   // on the OTHER car, so the cut is visible
    const before = RR.status().replay.broadcast;
    // The director's first cut comes SHOT_MIN_S after the opening shot: land the clock so the event is
    // still ahead then, inside its lead.
    RR.replay().seek(h.t - 9);
    g.step(60 * 7);
    bc = RR.status().replay.broadcast;
    assert.equal(bc.manual, false);
    assert.ok(bc.cuts > before.cuts, "the director cut: " + JSON.stringify(bc));
    assert.equal(RR.status().replay.follow, codeOf(h.num), "onto the car in the " + h.kind + " at " + h.t);
    assert.notEqual(bc.shot, "side", "with a new shot");
    // A follow key: the viewer has the picture, and the director waits.
    g.sandbox.dispatchEvent({ type: "keydown", code: "Period", repeat: false, target: null, preventDefault() {}, stopPropagation() {} });
    assert.equal(RR.status().replay.broadcast.manual, true);
    // UI-10 (hunt2): focus left on a transport button after a click kept the
    // replay keys dead. Its character keys now reach the replay; Space stays the
    // button's own, and a select keeps every key.
    const key = (code, target) => g.sandbox.dispatchEvent({ type: "keydown", code, repeat: false, target, preventDefault() {}, stopPropagation() {} });
    const inBar = (tagName, extra) => ({ tagName, ...extra, closest: (sel) => (sel === ".watch-transport" ? {} : null) });
    const sp0 = RR.status().replay.speed, paused0 = RR.status().replay.paused;
    key("Equal", inBar("BUTTON"));
    assert.ok(RR.status().replay.speed > sp0, "speed up from a focused transport button");
    key("Minus", inBar("INPUT", { type: "range" }));
    assert.equal(RR.status().replay.speed, sp0, "and down from the focused timeline");
    key("Space", inBar("BUTTON"));
    assert.equal(RR.status().replay.paused, paused0, "Space presses the focused button, never pauses on top of it");
    key("Equal", inBar("SELECT"));
    assert.equal(RR.status().replay.speed, sp0, "a focused select keeps its keys");
    // The flag: the results take the tower down with the replay.
    RR.replay().seek(405);
    g.step(60 * 8);
    assert.equal(G.state, "results");
    g.step(1);
    assert.equal(doc.getElementById("bc-tower").hidden, true, "the tower comes down");
    assert.ok(!doc.body.classList.contains("bc-on"));
  } finally { g.close(); }
});

test("BROADCAST PiP pick: the followed car's battle partner (the car BEHIND when sandwiched), else the car in the next event, never the followed car", async () => {
  const g = await createGame({ track: "baku" });
  try {
    const B = vm.runInContext("Broadcast", g.ctx);
    const pick = (fights, follow, ev, kind) => host(B.pipPick(fights, follow, ev, kind));
    const fights = [{ key: "b", ahead: "a", gapS: 0.4 }, { key: "c", ahead: "b", gapS: 0.6 }];
    assert.deepEqual(pick(fights, "a", null), { key: "b", cam: "tcam", kind: "battle" }, "the leader: the car on its tail");
    assert.deepEqual(pick(fights, "b", null), { key: "c", cam: "tcam", kind: "battle" }, "sandwiched: the car BEHIND, the threat");
    assert.deepEqual(pick(fights, "c", null), { key: "b", cam: "tcam", kind: "battle" }, "the chaser: the car it is hunting");
    assert.deepEqual(pick([], "a", "h", "pit"), { key: "h", cam: "chase", kind: "pit" }, "no battle: the car in the next event");
    assert.equal(pick([], "a", "a", "pass"), null, "never the followed car");
    assert.equal(pick([], "a", null), null);
    // With the running order: the inset is never empty while another car runs.
    const run = [{ key: "a" }, { key: "b" }, { key: "c" }];
    const pickR = (follow, ev, kind) => host(B.pipPick([], follow, ev, kind, run));
    assert.deepEqual(pickR("a", null), { key: "b", cam: "tcam", kind: "behind" }, "the leader: the car behind");
    assert.deepEqual(pickR("b", null), { key: "c", cam: "tcam", kind: "behind" });
    assert.deepEqual(pickR("c", null), { key: "b", cam: "chase", kind: "ahead" }, "last: the car ahead");
    assert.deepEqual(pickR("z", null), { key: "a", cam: "chase", kind: "leader" }, "the followed car is out: the leader");
    assert.deepEqual(pickR("a", "c", "pit"), { key: "c", cam: "chase", kind: "pit" }, "an event still outranks the fallback");
    assert.equal(host(B.pipPick([], "a", null, null, [{ key: "a" }])), null, "alone on track: no inset");
  } finally { g.close(); }
});

test("BROADCAST PiP in WATCH with no battle (3 s apart): the inset is still up, on the car behind", async () => {
  const g = await createGame({ track: "baku", storage: { tyreWear: "real" } });
  try {
    const { G } = g;
    const RR = vm.runInContext("RealRace", g.ctx);
    const { script } = scriptIn(g);
    const traces = { frame: "track", cars: { 63: line(-14, 50, 0, -5, 400), 16: line(-164, 50, 1, -5, 400) } };   // Leclerc 150 m = 3 s back
    RR.launch(script, { seat: "RUS", watch: true, camera: "side", traces, startLap: 1 });
    await g.settle(() => G.track && G.track.def && G.track.def.id === "baku" && (G.state === "count" || G.state === "race"), 8000);
    g.step(2);
    g.apex.go();
    g.step(60);
    const bc = RR.status().replay.broadcast;
    assert.ok(bc && bc.pip, "a PiP: " + JSON.stringify(bc));
    assert.equal(bc.pip.code, "LEC");
    assert.equal(bc.pip.label, "BEHIND · LEC");
    RR.replay().stop();
  } finally { g.close(); }
});

test("WATCH in-game AUTO: a picked shot hands the viewer the picture, AUTO hands it back at once; the commentary hears the replay", async () => {
  const g = await createGame({ track: "baku", storage: { tyreWear: "real" } });
  try {
    const { G } = g;
    const RR = vm.runInContext("RealRace", g.ctx), R = vm.runInContext("RealReplay", g.ctx);
    const { script } = scriptIn(g);
    const traces = { frame: "track", cars: { 63: line(-14, 50, 0, -5, 400), 16: line(-22, 48, 1, -5, 400) } };
    const heard = [];
    const rr = G.raceRadio, real = rr.replayEvent;
    rr.replayEvent = (h, a, b) => { heard.push({ kind: h.kind, a: a && a.code, b: b && b.code }); return real(h, a, b); };
    RR.launch(script, { seat: "RUS", watch: true, camera: "side", traces, startLap: 1 });
    await g.settle(() => G.track && G.track.def && G.track.def.id === "baku" && (G.state === "count" || G.state === "race"), 8000);
    g.step(2);
    const rp = RR.replay();
    assert.equal(rp.autoOn(), false, "a hub shot other than AUTO: the viewer's camera");
    assert.equal(rr.debug().watch, true, "the commentator is in WATCH mode");
    assert.equal(rp.setAuto(true), true);
    assert.equal(rp.autoOn(), true);
    g.apex.go();
    g.step(5);
    assert.equal(RR.status().replay.broadcast.manual, false, "AUTO is not read as a viewer change");
    rp.takePicture();
    assert.equal(rp.autoOn(), false, "a picked shot: the viewer has the picture");
    rp.setAuto(true);
    assert.equal(rp.autoOn(), true, "AUTO: the director at once, no 20 s wait");
    // A traced car's highlight at 1x: handed to the commentator, not captioned.
    const h = R.highlightsFor(script).find((x) => (x.num === 63 || x.num === 16) && ["pass", "pit", "out", "fastest"].includes(x.kind) && x.t > 20 && x.t < 380);
    assert.ok(h, "an event for Russell or Leclerc");
    rp.seek(h.t - 1);
    g.step(60 * 2);
    assert.ok(heard.some((e) => e.kind === h.kind && e.a === script.drivers.find((d) => d.num === h.num).code), JSON.stringify({ h, heard }));
    rp.stop();
    assert.equal(rr.debug().watch, false, "the WATCH is over for the commentator");
    assert.equal(rp.autoOn(), false);
  } finally { g.close(); }
});

test("BROADCAST PiP in WATCH: two cars 8 m apart put the partner in the inset (labelled, through the mirror pass); the results clear it", async () => {
  const g = await createGame({ track: "baku", storage: { tyreWear: "real" } });
  try {
    const { G } = g;
    const RR = vm.runInContext("RealRace", g.ctx), MP = vm.runInContext("MirrorPass", g.ctx);
    const { script } = scriptIn(g);
    const traces = { frame: "track", cars: { 63: line(-14, 50, 0, -5, 400), 16: line(-22, 50, 1, -5, 400) } };   // Leclerc 8 m behind Russell, same pace
    RR.launch(script, { seat: "RUS", watch: true, camera: "side", traces, startLap: 1 });
    await g.settle(() => G.track && G.track.def && G.track.def.id === "baku" && (G.state === "count" || G.state === "race"), 8000);
    g.step(2);
    g.apex.go();
    g.step(60);
    const bc = RR.status().replay.broadcast;
    assert.ok(bc && bc.pip, "a PiP: " + JSON.stringify(bc));
    assert.equal(bc.pip.code, "LEC", "the car on Russell's tail");
    assert.equal(bc.pip.label, "ONBOARD · LEC");
    const mp = MP.instance().state().pip;
    assert.equal(mp.code, "LEC", "the mirror pass has the subject");
    assert.equal(mp.cam, "tcam");
    // Follow Leclerc: the inset turns to the car he is hunting.
    RR.replay().follow("LEC");
    g.step(20);
    assert.equal(RR.status().replay.broadcast.pip.code, "RUS");
    RR.replay().seek(405);
    g.step(60 * 8);
    assert.equal(G.state, "results");
    g.step(1);
    assert.equal(MP.instance().state().pip.code, null, "the results clear the subject");
  } finally { g.close(); }
});

function transportReplay(extra = {}) {
  const ctx = vm.createContext({ M4: { clamp: (v, a, b) => Math.max(a, Math.min(b, v)) },
    Log: { info() {}, warn() {}, debug() {} },
    CamModes: { CAM_MODES: [{ id: "cockpit" }, { id: "side" }, { id: "heli" }] },
    Tracks: { sample: (_track, s, out) => { out.p = [s, 0, 0]; out.t = [1, 0, 0]; out.r = [0, 0, 1]; out.hw = 7; } }, ...extra });
  for (const file of ["js/race/broadcast.js", "js/race/real-replay.js"]) vm.runInContext(fs.readFileSync(path.join(ROOT, file), "utf8"), ctx);
  const cars = [{ code: "AAA" }, { code: "BBB" }], snaps = [];
  const drivers = [{ code: "AAA", num: 1, pos: 1, name: "Driver A", lapStart: [0, 10] }, { code: "BBB", num: 2, pos: 2, name: "Driver B", lapStart: [0] }];
  const G = { cars, track: { total: 1000 }, state: "race", camMode: 0, raceT: 0,
    followCar: (c) => { G.player = c; }, snapGameCam: () => snaps.push(G.player.prog),
    setCamMode: (m) => { G.camMode = m; } };
  const replay = vm.runInContext("RealReplay", ctx).create(G);
  const options = { script: { laps: 2, drivers, passes: [{ t: 12, lap: 1, by: 2, over: 1, pos: 1 }] },
    traces: { frame: "track", cars: { 1: line(0, 50, 0, 0, 30), 2: line(0, 45, 0, 0, 10) } },
    seats: new Map([[cars[0], drivers[0]], [cars[1], drivers[1]]]), follow: "AAA", camera: "auto" };
  replay.start(options);
  return { replay, G, cars, snaps, drivers, options };
}

test("WATCH transport pause holds the replay clock, and seek reposes ended and rewound drivers before snapping", () => {
  const { replay, cars, snaps } = transportReplay();
  replay.setPaused(true); replay.tick(5);
  assert.equal(replay.status().T, 0, "paused playback does not advance");
  replay.seek(20);
  assert.equal(cars[0].prog, 1000);
  assert.equal(cars[1].prog, 450, "a forward seek parks the stopped car at its final recorded position");
  assert.equal(cars[1].retired, true);
  assert.equal(cars[1].rPrevPx, cars[1].px, "ended car also clears the prior interpolation pose");
  assert.equal(snaps.at(-1), 1000, "camera resets after the new subject pose");
  replay.seek(5);
  assert.equal(cars[1].retired, false, "backward seek revives the car at that moment");
  replay.setPaused(false); replay.tick(10);
  assert.equal(cars[1].retired, true, "the rewound car can retire again");
  replay.seek(NaN); assert.equal(replay.status().T, 15, "invalid timeline values cannot corrupt the clock");
  replay.seek(999); assert.equal(replay.status().T, 30, "scrubbing is bounded by loaded positions");
  replay.stop();
});

test("WATCH follow lock survives director holds and event navigation, AUTO releases it, and restart clears playback state", () => {
  const { replay, G } = transportReplay();
  replay.setLocked(true);
  replay.tick(25);
  assert.equal(replay.status().follow, "AAA", "the selected driver stays locked beyond the old twenty-second hold");
  assert.equal(replay.status().broadcast.locked, true);
  replay.seek(0); replay.setPaused(true);
  assert.equal(replay.eventStep(1), "BBB PASSES AAA FOR P1");
  assert.equal(replay.status().T, 4, "event navigation gives eight seconds of context");
  assert.equal(replay.status().follow, "AAA", "event navigation preserves a locked subject");
  assert.equal(replay.status().paused, true, "scrubbing does not start paused playback");
  replay.setAuto(true);
  assert.equal(replay.status().broadcast.locked, false);
  assert.equal(replay.autoOn(), true);
  replay.stop();
  assert.equal(G.camMode, 0, "exit restores the player's driving camera");
  assert.equal(replay.status(), null);
});

test("WATCH paused seek repaints the timing tower and race clock without advancing the director", () => {
  const element = () => ({ children: [], dataset: {}, style: {}, textContent: "", classList: { add() {}, remove() {}, toggle() {} },
    appendChild(n) { this.children.push(n); return n; }, setAttribute() {}, addEventListener() {}, removeEventListener() {}, querySelector() { return null; } });
  const tower = element(), document = { body: element(), createElement: element, getElementById: (id) => id === "bc-tower" ? tower : null };
  const { replay, G, drivers } = transportReplay({ document });
  drivers[0].laps = [10, 10];
  replay.tick(0.1);
  assert.match(tower.children[0].textContent, /^LAP 1\/2/);
  replay.setPaused(true);
  const cuts = replay.status().broadcast.cuts;
  replay.seek(15);
  assert.match(tower.children[0].textContent, /^LAP 2\/2/);
  assert.equal(G.raceT, 15);
  assert.equal(replay.status().broadcast.cuts, cuts);
  assert.equal(replay.status().paused, true);
  replay.stop();
});

test("WATCH manual and automatic reel cuts release radio and reset timeline presentation before snapping", () => {
  for (const automatic of [false, true]) for (const locked of [false, true]) {
    const clips = [];
    const { replay, G, cars, options } = transportReplay({ Audio: class {
      constructor() { this.paused = true; clips.push(this); }
      play() { this.paused = false; return Promise.resolve(); }
      pause() { this.paused = true; }
    } });
    options.reel = true;
    options.script.passes = [{ t: 10, by: 1, over: 2 }, { t: 50, by: 2, over: 1 }];
    options.script.radio = [{ t: 11, num: 1, url: "https://example.test/radio.mp3" }];
    options.traces.cars = { 1: line(0, 50, 0, 0, 100), 2: line(0, 45, 0, 0, 100) };
    G.soundOn = true;
    const snaps = [], pip = [], hud = [];
    G.snapGameCam = (paint) => snaps.push({ paint, prog: G.player.prog, clock: G.raceT });
    G.setPip = (c) => pip.push(c);
    G.refreshHud = () => hud.push(G.raceT);
    replay.start(options);
    replay.setLocked(locked);
    replay.tick(9); // Opening lead-in starts at T=2: the first radio fires at 11.
    assert.equal(clips[0].paused, false);
    snaps.length = pip.length = hud.length = 0;
    if (automatic) replay.tick(5); else { replay.setPaused(true); replay.skip(); }
    assert.equal(replay.status().T, 42);
    assert.equal(clips[0].paused, true, "the previous segment's audio cannot cross a reel cut");
    assert.equal(G.raceT, 42, "HUD clock changes on the same cut");
    assert.equal(replay.status().follow, locked ? "AAA" : "BBB", "a cut respects a locked subject");
    assert.equal(snaps.at(-1).paint, false, "the cut snaps without forcing headless playback to render");
    assert.equal(snaps.at(-1).prog, locked ? 2100 : 1890);
    assert.equal(snaps.at(-1).clock, 42);
    assert.equal(hud.at(-1), 42);
    assert.ok(pip.includes(null), "the cut drops old broadcast/PiP history");
    for (const car of cars) assert.equal(car.rPrevPx, car.px, "interpolation starts at the new pose");
    assert.equal(replay.status().paused, !automatic, "a paused skip remains paused");
    replay.stop();
  }
});

test("WATCH: the pause card cuts a real team radio clip mid-sentence, as a hidden tab does", () => {
  // The game loop returns before update() while paused, so tick() — and the
  // replay clock — froze under the card while the HTMLAudio clip talked on.
  const clips = [], observers = [];
  const pause = { hidden: true };
  const document = { addEventListener() {}, getElementById: (id) => (id === "pausemenu" ? pause : null) };
  class MutationObserver {
    constructor(fn) { this.fn = fn; observers.push(this); }
    observe(el, o) { this.el = el; this.o = o; }
  }
  const { replay, G, options } = transportReplay({ document, MutationObserver, Audio: class {
    constructor() { this.paused = true; clips.push(this); }
    play() { this.paused = false; return Promise.resolve(); }
    pause() { this.paused = true; }
  } });
  options.script.radio = [{ t: 3, num: 1, url: "https://example.test/radio.mp3" }];
  G.soundOn = true;
  replay.start(options);
  replay.tick(3.5);
  assert.equal(clips.length, 1, "the clip fires at its moment");
  assert.equal(clips[0].paused, false);
  // What the browser does when setPaused(true) (Escape / blur / pad-lost) shows #pausemenu.
  const flip = (hidden) => { pause.hidden = hidden; for (const o of observers) if (o.el === pause) o.fn([]); };
  flip(false);
  assert.equal(clips[0].paused, true, "the clip stops with the game, not when it runs out");
  assert.equal(replay.status().paused, false, "the replay's own transport is untouched");
  flip(true);                              // RESUME: nothing restarts a stale clip
  assert.equal(clips[0].paused, true);
  replay.stop();
});

// ROTATE-BLOCK / PHOTO-MODE PAUSE HIDES THE CARD IN THE SAME TASK.
// setPaused(true) shows #pausemenu; syncRotateBlocker then sets
// els.pausemenu.hidden = active || photoMode because the blocker (or photo
// studio) owns the screen. MutationObserver callbacks run AFTER that task,
// so a gate on `if (!pause.hidden) cutClip()` sees the card already hidden
// and never cuts — the OpenF1 HTMLAudio clip talks over a frozen WATCH.
// Same blind spot #1029 fixed for radioVoice via setPaused → halt(); here
// the fix stays inside real-replay (G.paused survives the re-hide).
test("WATCH: a rotate-block pause that re-hides the card in the same task still cuts team radio", () => {
  const clips = [], observers = [], queued = [];
  const pause = { _hidden: true };
  Object.defineProperty(pause, "hidden", {
    get() { return this._hidden; },
    set(v) {
      this._hidden = !!v;
      for (const o of observers) if (o.el === pause) queued.push(o.fn);
    },
  });
  const document = { addEventListener() {}, getElementById: (id) => (id === "pausemenu" ? pause : null) };
  class MutationObserver {
    constructor(fn) { this.fn = fn; observers.push(this); }
    observe(el, o) { this.el = el; this.o = o; }
  }
  const { replay, G, options } = transportReplay({ document, MutationObserver, Audio: class {
    constructor() { this.paused = true; clips.push(this); }
    play() { this.paused = false; return Promise.resolve(); }
    pause() { this.paused = true; }
  } });
  options.script.radio = [{ t: 3, num: 1, url: "https://example.test/radio.mp3" }];
  G.soundOn = true;
  G.paused = false;
  replay.start(options);
  replay.tick(3.5);
  assert.equal(clips.length, 1, "precondition: a clip is on air");
  assert.equal(clips[0].paused, false);

  // setPaused(true, "rotate-block") then syncRotateBlocker(false), one task:
  G.paused = true;
  pause.hidden = false;                       // setPaused shows the card
  pause.hidden = true;                        // blocker / photo took the screen
  assert.equal(pause.hidden, true, "the card is gone by the end of the task");
  while (queued.length) queued.shift()();     // observers run now, seeing hidden
  assert.equal(clips[0].paused, true, "the clip stops — the observer never saw the card");
  assert.equal(replay.status().paused, false, "the replay's own transport is untouched");

  G.paused = false;
  pause.hidden = true;                        // RESUME: nothing restarts a stale clip
  while (queued.length) queued.shift()();
  assert.equal(clips[0].paused, true, "resume must not restart a stale clip");
  replay.stop();
});

test("WATCH OpenF1 team radio routes through GameAudioRadioFx.playWatchMedia (FX chain + duck)", () => {
  const ducks = [];
  const chain = [];
  const playWatchMedia = (url, o) => {
    chain.push({ url, volume: o && o.volume });
    ducks.push(true);
    return {
      chained: true,
      paused: false,
      ended: false,
      pause() { ducks.push(false); },
      play: () => Promise.resolve(),
      stop() { ducks.push(false); },
    };
  };
  const { replay, G, options } = transportReplay({
    Audio: class { play() { return Promise.resolve(); } pause() {} },
    GameAudioRadioFx: { playWatchMedia },
    GameAudio: { setRadioDuck: (on) => ducks.push(!!on) },
  });
  options.script.radio = [{ t: 3, num: 1, url: "https://example.test/radio.mp3" }];
  G.soundOn = true;
  G.radio = { volume: () => 0.8 };
  replay.start(options);
  replay.tick(3.5);
  assert.equal(chain.length, 1, "playWatchMedia is used instead of bare new Audio()");
  assert.equal(chain[0].url, "https://example.test/radio.mp3");
  assert.equal(chain[0].volume, 0.8);
  assert.ok(ducks.includes(true), "music duck latched for the clip");
  replay.stop();
  assert.ok(ducks.includes(false), "stop releases the duck");
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

test("WATCH toolbar exposes working pointer controls, honest event labels and photo ownership, then tears down", () => {
  function element(tag) {
    const listeners = {}, attrs = {};
    return { tagName: tag.toUpperCase(), dataset: {}, children: [], style: {}, hidden: false,
      classList: { add() {}, remove() {} },
      appendChild(n) { this.children.push(n); n.parentNode = this; return n; },
      remove() { if (this.parentNode) this.parentNode.children = this.parentNode.children.filter((n) => n !== this); },
      setAttribute(k, v) { attrs[k] = v; }, getAttribute(k) { return attrs[k]; },
      addEventListener(k, fn) { listeners[k] = fn; }, dispatch(k) { if (listeners[k]) listeners[k](); } };
  }
  const body = element("body"), doc = { body, createElement: element };
  const ctx = vm.createContext({ document: doc, CamModes: { CAM_MODES: [{ id: "chase", label: "CHASE" }, { id: "heli", label: "AERIAL" }] }, RealReplay: { LEAD_S: 8 } });
  vm.runInContext(fs.readFileSync(path.join(ROOT, "js/ui/watch-transport.js"), "utf8"), ctx);
  const W = vm.runInContext("WatchTransport", ctx), calls = [];
  const state = { T: 0, duration: 100, paused: false, speed: 1, follow: "AAA", broadcast: { auto: true, locked: false, manual: false } };
  const api = { describe: () => ({ name: "Test GP", drivers: [{ code: "AAA", name: "Alpha" }, { code: "BBB", name: "Beta" }], events: [{ t: 20, lap: 2, kind: "pass", text: "AAA PASSES BBB" }], speeds: [0.5, 1, 2] }),
    status: () => state, setPaused: (v) => { state.paused = v; }, setSpeed: (v) => { state.speed = v; },
    follow: (v) => { state.follow = v; }, setLocked: (v) => { state.broadcast.locked = v; },
    setAuto: () => { state.broadcast.auto = true; state.broadcast.locked = false; },
    seek: (v) => { state.T = v; }, eventStep: (v) => calls.push(["event", v]) };
  const G = { camMode: 0, setCamMode: (i, opts) => { G.camMode = i; calls.push(["camera", opts.persist]); }, snapGameCam: () => calls.push(["snap"]), openWatchPhoto: () => calls.push(["photo", state.paused]) };
  const ui = W.create(G, api); ui.start();
  const find = (key, parent = body) => parent.dataset.wt === key ? parent : parent.children.map((n) => find(key, n)).find(Boolean);
  assert.equal(find("play").getAttribute("aria-label"), "Pause replay");
  assert.equal(find("prev").disabled, true); assert.equal(find("next").disabled, false);
  assert.match(find("event").textContent, /^NEXT · L2/, "an upcoming moment is explicitly marked NEXT");
  find("play").dispatch("click"); assert.equal(state.paused, true);
  assert.equal(find("play").getAttribute("aria-label"), "Play replay");
  find("play").dispatch("click");
  find("speed").value = "2"; find("speed").dispatch("change"); assert.equal(state.speed, 2);
  find("driver").value = "BBB"; find("driver").dispatch("change");
  assert.equal(state.follow, "BBB"); assert.equal(state.broadcast.locked, true);
  find("camera").value = "heli"; find("camera").dispatch("change");
  assert.deepEqual(calls.slice(-2), [["camera", false], ["snap"]], "changing view is temporary and resets framing");
  find("seek").value = "30"; find("seek").dispatch("input"); find("seek").dispatch("change");
  assert.equal(state.T, 30); assert.equal(find("seek").getAttribute("aria-valuetext"), "0:30 of 1:40");
  assert.equal(find("next").disabled, true);
  find("prev").dispatch("click"); assert.deepEqual(calls.at(-1), ["event", -1]);
  find("auto").dispatch("click"); assert.equal(state.broadcast.locked, false);
  find("photo").dispatch("click"); assert.deepEqual(calls.at(-1), ["photo", false], "photo owner receives the original playing state");
  ui.stop(); assert.equal(body.children.length, 0, "session exit removes the controls");
});

// THE TIMELINE IS NOT A TICKER. paint() runs every 0.1 s and rewrote the range's
// aria-valuetext every time, so a screen reader parked on it re-read the clock
// each second of playback; the PLAY button said aria-pressed=paused ("Play
// replay, pressed") and painted red while paused. Write on change, hold the
// spoken value while the focused timeline plays, and no pressed state on PLAY.
test("WATCH transport: no aria-pressed on PLAY, and a focused, playing timeline is not re-announced", () => {
  function element(tag) {
    const attrs = {}, listeners = {};
    let writes = 0;
    return { tagName: tag.toUpperCase(), dataset: {}, children: [], style: {}, hidden: false,
      classList: { add() {}, remove() {} },
      appendChild(n) { this.children.push(n); n.parentNode = this; return n; },
      remove() { if (this.parentNode) this.parentNode.children = this.parentNode.children.filter((n) => n !== this); },
      setAttribute(k, v) { attrs[k] = v; writes++; }, getAttribute(k) { return k in attrs ? attrs[k] : null },
      get writes() { return writes; },
      addEventListener(k, fn) { listeners[k] = fn; }, dispatch(k) { if (listeners[k]) listeners[k](); } };
  }
  const body = element("body"), doc = { body, createElement: element, activeElement: null };
  const ctx = vm.createContext({ document: doc, RealReplay: { LEAD_S: 8 } });
  vm.runInContext(fs.readFileSync(path.join(ROOT, "js/ui/watch-transport.js"), "utf8"), ctx);
  const W = vm.runInContext("WatchTransport", ctx);
  const state = { T: 10, duration: 100, paused: true, speed: 1, follow: "AAA", broadcast: { auto: true, locked: false, manual: false } };
  const api = { describe: () => ({ name: "GP", drivers: [{ code: "AAA", name: "Alpha" }], events: [], speeds: [1] }), status: () => state,
    setPaused: (v) => { state.paused = v; }, setSpeed() {}, follow() {}, setLocked() {}, setAuto() {}, seek: (v) => { state.T = v; }, eventStep() {} };
  const ui = W.create({ camMode: 0 }, api); ui.start();
  const find = (key, parent = body) => parent.dataset.wt === key ? parent : parent.children.map((n) => find(key, n)).find(Boolean);
  const play = find("play"), seek = find("seek");
  assert.equal(play.getAttribute("aria-pressed"), null, "PLAY is an action whose label says what it does, not a toggle");
  assert.equal(play.getAttribute("aria-label"), "Play replay");
  const w0 = play.writes;
  ui.paint(); ui.paint();
  assert.equal(play.writes, w0, "an unchanged label is not rewritten every paint");
  play.dispatch("click");
  assert.equal(play.getAttribute("aria-label"), "Pause replay");
  doc.activeElement = seek;                     // a reader sits on the timeline while it plays
  const spoken = seek.getAttribute("aria-valuetext");
  state.T = 11; ui.paint(); state.T = 12; ui.paint();
  assert.equal(seek.getAttribute("aria-valuetext"), spoken, "the focused, playing timeline is not re-announced every second");
  play.dispatch("click");                       // paused: the value is live again
  assert.equal(seek.getAttribute("aria-valuetext"), "0:12 of 1:40");
  doc.activeElement = null; play.dispatch("click"); state.T = 13; ui.paint();
  assert.equal(seek.getAttribute("aria-valuetext"), "0:13 of 1:40", "focus elsewhere: it follows the clock");
  ui.stop();
});
