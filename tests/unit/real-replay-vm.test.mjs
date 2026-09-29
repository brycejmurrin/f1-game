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
    const staged = RR.launch(script, { seat: "LEC", watch: true, traces, startLap: 1 });
    assert.deepEqual(host(staged), { trackId: "baku", laps: 51, seat: "LEC", startLap: 1, watch: true, reel: false });
    await g.settle(() => G.track && G.track.def && G.track.def.id === "baku" && (G.state === "count" || G.state === "race"), 8000);
    g.step(2);   // the countdown frame arms the director, which starts the replay
    let st = RR.status();
    assert.equal(st.watch, true); assert.equal(st.armed, true);
    assert.ok(st.replay && st.replay.follow === "LEC" && st.replay.cars === 3, JSON.stringify(st.replay));
    assert.equal(G.player.code, "LEC", "the camera and HUD are on the seat");
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
    RR.replay().seek(205);
    g.step(5 * 60 / 8 + 60);
    assert.equal(G.state, "results");
    g.step(1);
    assert.equal(RR.replay().isRunning(), false, "the replay stopped with the director at the results");
    assert.equal(RR.status().armed, false);
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
