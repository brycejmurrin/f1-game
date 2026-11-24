import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

// Each fixture is a setup a player can actually select in the sandbox.
const setups = {
  chassis: {view: "challenge", answer: "axle"},
  suspension: {view: "braking", geometry: "high", answer: "same"},
  deployment: {charge: 4},
  hybrid: {start: 4, brake: 350, clip: 250, deploy: 275},
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
    if (id === "chassis") {
      assert.equal(lesson.evaluate({...initial, view: "inspect", wheelbase: 3200, body: 850, answer: "pass"}).success, false);
      const edge = lesson.evaluate({...initial, view: "edge", answer: "pass"});
      assert.equal(edge.success, true);
      assert.deepEqual(Array.from(edge.metrics.slice(0, 2), row => row[1]), ["3,400 mm", "950 mm"]);
    }
    if (id === "suspension") {
      for (const rod of ["push", "pull"]) {
        for (const damping of ["low", "high"]) {
          for (let bump = 0; bump <= 30; bump++) {
            const {replay} = lesson.evaluate({...initial, rod, damping, bump});
            for (let i = 0; i <= 100; i++) {
              const {svg} = replay(i / 100);
              assert.equal(svg.indexOf("NaN"), -1);
              const piston = Number(svg.match(/<rect x="([0-9.]+)" y="[0-9.]+" width="6" height="8"/)?.[1]);
              assert.ok(piston >= 391 && piston + 6 <= 439, "the piston stays inside its cylinder");
            }
          }
        }
      }
    }
    if (id === "hybrid") {
      const {replay} = lesson.evaluate({...initial, start: 2, deploy: 350});
      assert.equal(replay(7 / 60).readout, "7.0 s · Deploy · 0.00 MJ · Store empty");
      const recovery = lesson.evaluate({...initial, budget: "6", deploy: 100, brake: 350, clip: 350});
      const values = Object.fromEntries(recovery.metrics);
      assert.ok(Number.parseFloat(values["Harvested this lap"]) < 6);
      assert.equal(values["Recharge blocked by allowance"], "0.00 MJ");
      assert.ok(Number.parseFloat(values["Recharge blocked by full store"]) > 0);
      assert.equal(recovery.replay(1).readout.split(" · ")[0], "60.0 s");
      assert.equal(values["Deployment time traded for super clipping"], "7 s · 0.70 MJ requested deployment");
    }
    if (id === "deployment") {
      const {replay, svg} = lesson.evaluate({...initial, curve: "overtake", gap: .95, charge: 4});
      assert.equal(replay(1).readout.split(" · ")[2], "100 kW delivered");
      const [chartX, chartY] = svg.match(/points="([^"]+)" fill="none" stroke="#65b7ff"/)[1].split(" ").at(-1).split(",").map(Number);
      const [, cursorX, cursorY] = replay(1).svg.match(/cx="([^"]+)" cy="([^"]+)"/).map(Number);
      assert.equal(chartX, cursorX);
      assert.ok(Math.abs(chartY - cursorY) < .0051);
    }
    if (id === "rain") {
      const slick = lesson.evaluate({...initial, line: "puddle", tyre: "slick"}).replay(.5);
      const wet = lesson.evaluate({...initial, line: "puddle", tyre: "wet"}).replay(.5);
      assert.notEqual(slick.readout, wet.readout);
      const entryShortfall = lesson.evaluate({...initial, line: "textured", tyre: "wet", water: 7, film: .1});
      assert.equal(entryShortfall.success, false);
      assert.ok(Number.parseFloat(entryShortfall.replay(0).readout.split(" · ")[2]) < 10);
      assert.notEqual(entryShortfall.replay(0).svg, entryShortfall.replay(.5).svg);
    }
    if (id === "pit-duel") {
      assert.equal(lesson.replay.steps, 2);
      assert.equal(lesson.evaluate({...initial, stop: 19}).success, false);
      assert.equal(lesson.evaluate({...initial, mode: "execution", stop: 19}).success, true);
      assert.equal(lesson.evaluate({...initial, ...setup, mode: "execution", stop: 19}).success, false);
    }
    if (id === "stint") {
      assert.equal(lesson.replay.first + lesson.replay.steps, 50);
      const {replay} = lesson.evaluate({...initial, fuel: 64.5});
      assert.equal(replay(1).readout, "Lap 50 · Incomplete · 0.00 kg fuel · 0.50 kg shortfall · no completed pace");
    }
  });
}
