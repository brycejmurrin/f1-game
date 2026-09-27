// A TIME TRIAL RECORD SET OFF THE CIRCUIT.
//
// The crossing at js/game.js gates `c.best`, the TT board, `G.ttRecord` and the
// stored ghost on ONE latch, `incidentInvalidLap` — set by IncidentSim, by the
// red-flag restart and by the coach. Track limits were not on that list. They
// had a ladder of their own instead: three warnings, then +5 s, which prices a
// cut against the race CLASSIFICATION. A time trial has no classification, so
// nothing priced it, and the cheapest way onto the board was to leave the
// circuit — a lap driven off-track replaced a 42 s record with 5 s, ghost and
// all, in a mode that exists to be a leaderboard.
//
// This drives the REAL detector rather than setting the flag: the car is put
// off the road and stepped until game.js's own 1.2 s threshold counts a cut, so
// the test cannot pass by agreeing with a constant. Two wheels over a kerb is
// still a lap, and the second case pins that.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { createGame } = require("../../tools/lib/game-vm.cjs");

async function timeTrial() {
  const g = await createGame({ track: "monza" });
  g.G.daily.stop();
  g.G.timeTrial = true;
  g.G.raceWeather = "dry";
  await g.G.startRace();
  g.apex.go();
  g.apex.headless(true);
  return g;
}

// jump(), not a hand-written pose. Setting `s`/`x` by hand leaves the heading
// and the world anchors where they were, and the car drove itself BACKWARDS
// over the line on the first try — the lap counter went down. jump() is the
// same path park() uses and is the only reposition this harness should make.
function armLap(g, lapTime) {
  const { G } = g;
  const p = G.player;
  g.apex.jump((G.track.total - 8) / G.track.total, 60, 0);
  p.lap = Math.max(p.lap, 1);
  p.lapTime = lapTime;
  p.offT = 0;
  return p;
}

function crossLine(g) {
  const p = g.G.player;
  const from = p.lap;
  for (let i = 0; i < 600 && p.lap === from; i++) g.apex.step(1 / 60, 1);
  assert.notEqual(p.lap, from, "the player never reached the line — the fixture moved");
}

// Drive off the road at half-distance and step until GAME.JS counts a cut.
// Returns the number of steps it took, so a threshold change shows up as a
// changed count rather than as a silent pass.
function cutOffTrack(g, maxSteps) {
  const p = g.G.player;
  const before = p.cuts | 0;
  g.apex.jump(0.5, 60, 40);
  let i = 0;
  for (; i < maxSteps && (p.cuts | 0) === before; i++) g.apex.step(1 / 60, 1);
  return { counted: (p.cuts | 0) > before, steps: i };
}

test("a time-trial lap with a counted cut sets no record and no ghost", async () => {
  const g = await timeTrial();
  const { G } = g;

  // A clean lap first, so the assertion below is about the SECOND lap being
  // refused rather than about nothing ever having been written.
  armLap(g, 42);
  crossLine(g);
  const p = G.player;
  assert.ok(isFinite(p.best) && p.best < 43, "a clean lap must still set the record");
  const cleanBest = p.best;
  const cleanRecord = G.ttRecord;
  assert.ok(isFinite(cleanRecord), "the time-trial record must have been written");

  const cut = cutOffTrack(g, 200);
  assert.ok(cut.counted, "the engine never counted a cut — this test is measuring nothing");
  assert.equal(p.incidentInvalidLap, true, "a counted cut must invalidate the time-trial lap");

  // A lap time no clean lap could touch, so an accepted one would be obvious.
  armLap(g, 5);
  assert.equal(p.incidentInvalidLap, true, "the latch must survive to the line");
  crossLine(g);
  assert.equal(p.best, cleanBest, "an off-track lap must not become the personal best");
  assert.equal(G.ttRecord, cleanRecord, "…nor the time-trial record");
  assert.equal(p.incidentInvalidLap, false, "the next lap starts clean");
});

test("a brief excursion under the cut threshold still sets a record", async () => {
  const g = await timeTrial();
  const { G } = g;
  armLap(g, 44);
  crossLine(g);
  const p = G.player;
  const before = p.best;
  assert.ok(isFinite(before));

  // Off the road for well under the 1.2 s game.js needs to count a cut.
  const cutsBefore = p.cuts | 0;
  g.apex.jump(0.5, 60, 40);
  for (let i = 0; i < 30; i++) g.apex.step(1 / 60, 1);   // 0.5 s
  assert.equal(p.cuts | 0, cutsBefore, "0.5 s off the road is not a cut — the threshold moved");
  assert.equal(p.incidentInvalidLap, false, "two wheels over a kerb is still a lap");

  armLap(g, before - 1);
  crossLine(g);
  assert.ok(p.best < before, "a clean-enough lap must still take the record");
});

test("time trial never applies the +5s track-limits ladder", async () => {
  // Bug hunt 2026-09-24 / defect ledger OPEN: four counted cuts announced a
  // race-classification +5s penalty in a mode with nothing to apply it to.
  const g = await timeTrial();
  const p = g.G.player;
  p.penalty = 0;
  p.cutWarn = 0;

  for (let n = 0; n < 4; n++) {
    const cut = cutOffTrack(g, 200);
    assert.ok(cut.counted, "cut " + (n + 1) + " must count");
    assert.equal(p.incidentInvalidLap, true, "each counted cut still invalidates the lap");
    // After a counted cut the car is parked at the -2 grace sentinel; jump
    // back on-track and step until grace clears so the next off-track counts.
    g.apex.jump(0.5, 60, 0);
    for (let i = 0; i < 180 && p.offT < 0; i++) g.apex.step(1 / 60, 1);
  }
  assert.equal(p.penalty, 0, "TT must not accrue race-classification seconds");
  assert.equal(p.cutWarn, 0, "the ladder still resets after the fourth cut");
  assert.ok((p.cuts | 0) >= 4, "lifetime cuts still accumulate");
});

async function race() {
  const g = await createGame({ track: "monza" });
  g.G.daily.stop();
  g.G.raceWeather = "dry";
  await g.G.startRace();
  g.apex.go();
  g.apex.headless(true);
  return g;
}

test("a race: 3rd strike is the black-and-white flag, 4th AND EACH ADDITIONAL +5s, no reset (FIA 2026)", async () => {
  // FIA 2026 F1 Penalty Guidelines, track limits (Race): "Lap Deleted /
  // Strike; 3rd offence – B/W; 4th and each additional – 5s"
  // (https://www.fia.com/sites/default/files/2026_f1_penalty_guidelines.pdf).
  // The ladder this replaced gave +10s on the 5th and then reset to warnings
  // (a pre-2026 reading), so the 6th cut was free.
  const g = await race();
  const p = g.G.player;
  p.penalty = 0; p.cutWarn = 0;
  const pens = [], warns = [];
  for (let n = 0; n < 6; n++) {
    const cut = cutOffTrack(g, 200);
    assert.ok(cut.counted, "cut " + (n + 1) + " must count");
    assert.equal(p.incidentInvalidLap, true, "cut " + (n + 1) + " deletes the race lap");
    pens.push(p.penalty); warns.push(p.cutWarn);
    g.apex.jump(0.5, 60, 0);
    for (let i = 0; i < 180 && p.offT < 0; i++) g.apex.step(1 / 60, 1);
  }
  assert.deepEqual(pens, [0, 0, 0, 5, 10, 15], "warnings, B/W on the 3rd, then +5s for every strike from the 4th");
  assert.deepEqual(warns, [1, 2, 3, 4, 5, 6], "the strike count never resets inside a race");
  assert.ok((p.cuts | 0) >= 6, "lifetime cuts still accumulate");
});

test("a race lap with a counted cut is DELETED — no best/last lap — but still counts for distance", async () => {
  // Same guidelines: "Lap Deleted / Strike". Before, only time trial and
  // qualifying invalidated a cut lap, so a race lap run off-track could be the
  // player's best and the fastest lap of the race.
  const g = await race();
  const { G } = g;
  armLap(g, 90);
  crossLine(g);
  const p = G.player;
  armLap(g, 88);
  crossLine(g);
  assert.ok(isFinite(p.best), "a clean race lap is timed");
  const cleanBest = p.best, cleanLast = p.lastLap;

  const cut = cutOffTrack(g, 200);
  assert.ok(cut.counted, "the engine never counted a cut");
  assert.equal(p.incidentInvalidLap, true, "a counted cut deletes the race lap");
  armLap(g, 5);   // a time no clean lap could touch
  const lapBefore = p.lap;
  crossLine(g);
  assert.equal(p.lap, lapBefore + 1, "the deleted lap still counts toward race distance");
  assert.equal(p.best, cleanBest, "a deleted lap is not the best lap");
  assert.equal(p.lastLap, cleanLast, "…nor a timed last lap");
  assert.equal(p.incidentInvalidLap, false, "the next lap starts clean");
});

