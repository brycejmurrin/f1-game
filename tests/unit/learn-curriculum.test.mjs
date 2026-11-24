import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

// Each fixture is a setup a player can actually select in the sandbox.
const setups = {
  chassis: {view: "inspect", answer: "axle"},
  suspension: {view: "braking", geometry: "high", answer: "same"},
  deployment: {charge: 4},
  hybrid: {start: 4, brake: 350, clip: 250},
  "brake-blend": {retained: 25, response: "fill"},
  "tyre-heat": {elapsed: 90, sliding: 70, load: 90},
  "racing-line": {apex: 55, straight: 500},
  rain: {line: "textured", tyre: "inter"},
  "pit-duel": {traffic: 0},
  stint: {finish: "hard", stopLap: 25, savingLaps: 4},
};
function cursor(x, y) {
  assert.ok(Number.isFinite(x) && Number.isFinite(y));
  return `<circle cx="${x}" cy="${y}"/>`;
}

for (const [id, setup] of Object.entries(setups)) {
  test(`Learn challenge starts open and accepts a reachable ${id} setup`, () => {
    const path = new URL("../../learn/" + id + "/lab.js", import.meta.url);
    let lesson;
    vm.runInNewContext(readFileSync(path, "utf8"), {LearnSandbox: {cursor, mount(value) { lesson = value; }}}, {filename: fileURLToPath(path)});
    const initial = Object.fromEntries(lesson.controls.map(control => [control.id, control.value]));
    for (const [key, value] of Object.entries(setup)) {
      const control = lesson.controls.find(item => item.id === key);
      assert.ok(control, key);
      if (control.options) assert.ok(control.options.some(option => option[0] === value), key);
      else {
        assert.ok(value >= control.min && value <= control.max, key);
        const steps = (value - control.min) / control.step;
        assert.ok(Math.abs(steps - Math.round(steps)) < 1e-8, key);
      }
    }
    const baseline = lesson.evaluate(initial);
    const solved = lesson.evaluate({...initial, ...setup});
    assert.equal(baseline.success, false);
    assert.equal(solved.success, true, solved.feedback);
    assert.notDeepEqual(solved.metrics, baseline.metrics);
    assert.ok(solved.explanation && solved.feedback && solved.svg);

    const replayState = id === "chassis" ? {...initial, view: "wake"} : initial;
    const input = lesson.replay.input?.(replayState);
    if (input) {
      const {min, max} = lesson.controls.find(control => control.id === input);
      assert.notEqual(lesson.evaluate({...replayState, [input]: min}).svg,
        lesson.evaluate({...replayState, [input]: max}).svg, "the replay drives the lesson's existing slider");
    } else {
      const {replay} = lesson.evaluate(replayState);
      const first = replay(0).svg;
      const sample = replay(.35).svg;
      assert.ok(first && sample && first !== sample, "playback changes the diagram across the run");
    }
    if (id === "hybrid") {
      const {replay} = lesson.evaluate({...initial, start: 2, deploy: 350});
      assert.equal(replay(7 / 60).readout, "7.0 s · Deploy · 0.00 MJ");
    }
    if (id === "deployment") {
      const {replay} = lesson.evaluate({...initial, curve: "overtake", gap: .95, charge: 4});
      assert.equal(replay(1).readout.split(" · ")[2], "100 kW delivered");
    }
    if (id === "rain") {
      const slick = lesson.evaluate({...initial, line: "puddle", tyre: "slick"}).replay(.5);
      const wet = lesson.evaluate({...initial, line: "puddle", tyre: "wet"}).replay(.5);
      assert.notEqual(slick.readout, wet.readout);
    }
  });
}
