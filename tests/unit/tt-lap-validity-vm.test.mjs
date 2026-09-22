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
