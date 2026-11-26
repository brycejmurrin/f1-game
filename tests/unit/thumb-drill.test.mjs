// LEARN's THUMB DRILL (js/learn-drills/thumb-drill.js, #6927): the on-track scorer cuts each corner's window from the
// live input trace around the car's apex crossing and scores it with the trainer's own ThumbTrainer.score, so a
// scripted trace driven through a corner scores exactly what the off-track trainer gives the same inputs. A rewind
// drops what it undid; the line closes a lap. And the arc never reaches the driver: the drill reads no curvature or
// racing line and writes nothing to a car.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import vm from "node:vm";
import { absSrc } from "../helpers/abs-src.mjs";
import { gameSource } from "../helpers/game-source.mjs";

const require = createRequire(import.meta.url);
const src = rel => readFileSync(new URL("../../" + rel, import.meta.url), "utf8");

function load() {
  const ctx = vm.createContext({ Log: { info() {}, warn() {} } });
  for (const rel of ["js/ui/thumb-trainer.js", "js/learn-drills/thumb-drill.js"]) vm.runInContext(src(rel), ctx, { filename: absSrc(rel) });
  return vm.runInContext("({ ThumbTrainer, ThumbDrill })", ctx);
}
function vegas(TT, TD) {
  const { Tracks } = require("../../tools/lib/track-build-vm.cjs").buildContext({});
  const def = Tracks.LIST.find(d => d.id === "vegas");
  const total = 6200;
  return { def, total, marks: TD.apexes(def, total, TT.CORNERS) };
}
// Drive one corner at a steady 40 m/s, 60 Hz, with inputs from `inputs(u)` at script time u; t0 is the race clock at u=0.
function drive(TT, mark, name, inputs, t0 = 100) {
  const C = TT.script(name), v = 40, rows = [], lead = 1.2;
  for (let i = 0; ; i++) {
    const u = -lead + i / 60;
    if (u > C.dur + 0.3) break;
    const x = inputs(u, C);
    rows.push({ u, t: t0 + u, s: mark.s + (u - C.apex) * v, a: x.a, b: x.b, g: x.g });
  }
  return rows;
}
const onScript = (u, C) => ({ a: C.target(Math.max(0, u)), b: C.brake(Math.max(0, u)), g: C.gas(Math.max(0, u)) });

test("the 17 marks are the Vegas apexes in CORNERS order, inside the lap", () => {
  const { ThumbTrainer: TT, ThumbDrill: TD } = load();
  const { def, total, marks } = vegas(TT, TD);
  assert.equal(marks.length, 17);
  assert.equal(def.turns.length, 17);
  marks.forEach((m, i) => {
    assert.equal(m.name, "T" + (i + 1));
    assert.ok(m.s > 0 && m.s < total);
    if (i) assert.ok(m.s > marks[i - 1].s, m.name + " after " + marks[i - 1].name);
  });
  // The spec jumps to lap fraction 0.978 to drive T17 into the line: T17's apex must lie ahead of it.
  assert.ok(def.turns[16] > 0.978 + 1.2 * 45 / total, "T17 apex " + def.turns[16]);
});

for (const [name, label, inputs] of [
  ["T6", "on the script", onScript],
  ["T6", "arrow 0.3 s late, gas early", (u, C) => ({ a: C.target(Math.max(0, u - 0.3)), b: C.brake(Math.max(0, u)), g: C.gas(Math.max(0, u + 0.25)) })],
  ["T7", "a lift held on gas", (u, C) => ({ a: C.target(Math.max(0, u)), b: 0, g: 1 })],
  ["T15", "the flick", onScript],
]) {
  test(`${name} ${label}: the live score equals ThumbTrainer.score on the same window`, () => {
    const { ThumbTrainer: TT, ThumbDrill: TD } = load();
    const { total, marks } = vegas(TT, TD);
    const mark = marks.find(m => m.name === name);
    const rows = drive(TT, mark, name, inputs);
    const scorer = TD.createScorer(TT, [mark], total);
    const scored = rows.flatMap(r => scorer.step({ t: r.t, s: r.s, a: r.a, b: r.b, g: r.g }).scored);
    assert.equal(scored.length, 1, "one score per corner");
    const C = TT.script(name);
    // The window the trainer would have recorded: script time 0..dur. The apex crossing is interpolated between
    // frames, so the window lines up with the script to within float noise.
    const rec = rows.filter(r => r.u >= -1e-9 && r.u <= C.dur + 1e-9).map(r => ({ t: r.u, s: r.a, b: r.b, g: r.g }));
    const want = TT.score(name, rec);
    for (const k of ["all", "arrow", "brake", "gas"]) assert.ok(Math.abs(scored[0][k] - want[k]) < 0.02, `${k}: ${scored[0][k]} vs ${want[k]}`);
    assert.deepEqual([...scored[0].tips], [...want.tips]);
    if (label === "on the script") assert.ok(scored[0].all >= 0.95, "the script itself scores clean: " + scored[0].all);
  });
}

test("a rewind drops the open window and the corners after the car's new place", () => {
  const { ThumbTrainer: TT, ThumbDrill: TD } = load();
  const { total, marks } = vegas(TT, TD);
  const scorer = TD.createScorer(TT, marks, total);
  const t1 = marks[0], t2 = marks[1];
  // Drive from before T1 through T2 on a steady clock.
  let t = 10, s = t1.s - 150, done = [];
  while (s < t2.s + 120) { done.push(...scorer.step({ t, s, a: -1, b: 0, g: 1 }).scored); t += 1 / 60; s += 40 / 60; }
  assert.deepEqual([...done.map(d => d.name)], ["T1", "T2"]);
  // The coach puts the world back 10 s: the clock and the arc both jump back, to before T2.
  const r = scorer.step({ t: t - 10, s: t2.s - 50, a: 0, b: 0, g: 1 });
  assert.equal(r.jumped, true);
  assert.deepEqual([...scorer.results().keys()], ["T1"], "T2 was undone; T1 is still behind the car");
  assert.equal(scorer.pending().length, 0);
  // A teleport forward is a jump too: the corners it skipped were not driven.
  const fwdJump = scorer.step({ t: t - 9, s: marks[10].s + 20, a: 0, b: 0, g: 1 });
  assert.equal(fwdJump.jumped, true);
  assert.equal(fwdJump.scored.length, 0);
  assert.equal(scorer.pending().length, 0);
  // Rolling back a few metres (a spin, a reverse) is driving, not a teleport: the open window survives.
  const roll = TD.createScorer(TT, marks, total);
  let rt = 5, rs = t1.s - 100;
  while (rs < t1.s + 5) { roll.step({ t: rt, s: rs, a: -1, b: 0, g: 1 }); rt += 1 / 60; rs += 40 / 60; }
  assert.equal(roll.pending().length, 1, "T1's window is open");
  assert.equal(roll.step({ t: rt, s: rs - 0.5, a: 0, b: 0, g: 0 }).jumped, false);
  assert.equal(roll.pending().length, 1, "a 0.5 m roll-back keeps it");
  // A paused clock is not a jump.
  const p = scorer.step({ t: t - 9, s: marks[10].s + 20, a: 0, b: 0, g: 1 });
  assert.equal(p.jumped, false);
});

test("crossing the line closes the lap with its corners and their mean", () => {
  const { ThumbTrainer: TT, ThumbDrill: TD } = load();
  const { total, marks } = vegas(TT, TD);
  const last = marks[16];
  const scorer = TD.createScorer(TT, marks, total);
  let t = 50, s = last.s - 200, lap = null, scored = [];
  while (!lap) {
    const r = scorer.step({ t, s, a: -1, b: 0, g: 1 });
    scored.push(...r.scored);
    lap = r.lap || (t > 200 ? "none" : null);
    t += 1 / 60; s = (s + 40 / 60) % total;
  }
  assert.notEqual(lap, "none");
  assert.deepEqual([...lap.corners.map(c => c.name)], ["T17"]);
  assert.equal(lap.all, scored[0].all);
  assert.equal(scorer.results().size, 0, "the next lap starts empty");
});

test("T17's window runs past the line at speed: the lap waits for it, and the next lap starts empty", () => {
  const { ThumbTrainer: TT, ThumbDrill: TD } = load();
  const { total, marks } = vegas(TT, TD);
  const last = marks[16], C = TT.script("T17");
  assert.ok((total - last.s) / 70 < C.dur - C.apex, "at 70 m/s the line comes before T17's window closes");
  const scorer = TD.createScorer(TT, marks, total);
  let t = 50, s = last.s - 200, lap = null, crossed = null;
  for (let i = 0; i < 600 && !lap; i++) {
    const before = s;
    const r = scorer.step({ t, s, a: -1, b: 0, g: 1 });
    lap = r.lap;
    t += 1 / 60; s = (s + 70 / 60) % total;
    if (s < before && crossed == null) crossed = t;
  }
  assert.ok(lap, "the lap closes");
  assert.deepEqual([...lap.corners.map(c => c.name)], ["T17"]);
  assert.equal(scorer.results().size, 0);
});

test("the cue follows the script: approach, the apex, then the next corner's script (T14 into T15)", () => {
  const { ThumbTrainer: TT, ThumbDrill: TD } = load();
  const { total, marks } = vegas(TT, TD);
  const t6 = marks[5], C = TT.script("T6");
  const far = TD.cueAt(TT, marks, total, t6.s - 600, 40, 0, []);
  assert.equal(far.u, null);
  assert.equal(far.text, "Next: T6 ▶ big stop");
  const brakeZone = TD.cueAt(TT, marks, total, t6.s - (C.apex - 0.2) * 40, 40, 0, []);
  assert.equal(brakeZone.name, "T6");
  assert.equal(brakeZone.text, C.cues[0][1]);
  const exit = TD.cueAt(TT, marks, total, t6.s + 30, 40, 10 + (C.tOut - C.apex) + 0.1, [{ name: "T6", tApex: 10 }]);
  assert.equal(exit.text, "Exit: let the arrow go");
  // Past T14's exit with T15 under a second away, T15's own script takes the card.
  const t14 = marks[13], t15 = marks[14], C14 = TT.script("T14");
  const flick = TD.cueAt(TT, marks, total, t15.s - 20, 40, 10 + (C14.tOut - C14.apex) + 0.05, [{ name: "T14", tApex: 10 }]);
  assert.equal(flick.name, "T15");
  assert.ok(t15.s - t14.s < 60);
});

test("the arc never reaches the driver: no curvature or racing-line read, no write to a car", () => {
  const code = src("js/learn-drills/thumb-drill.js").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
  // Curvature (Tracks.curvature, road.curv), the driving or racing line, and the AI's drive law: none of them.
  assert.doesNotMatch(code, /curvature|\bcurv\b|DrivingLine|TrackLine|racing_?line|\.line\b|aiDrive/i, "thumb-drill.js reads the arc");
  // Assignments to the player or to any `c.` car field (comparisons and arrow functions excepted).
  assert.doesNotMatch(code, /\b(?:c|player|G\.player|car)\.\w+(?:\.\w+)*\s*(?:[-+*/]?=)(?!=|>)/, "thumb-drill.js writes a car field");
  // It reads inputs through Input's read-only levels, never a setter.
  for (const m of code.matchAll(/\bInput\.(\w+)/g)) assert.ok(["touchLevels", "brakeLevel", "throttleLevel"].includes(m[1]), "Input." + m[1]);
});

test("the drill is LAZY_LEARN, never the eager shell, and needs no game.js branch", () => {
  const manifest = require("../../tools/manifest.cjs");
  assert.ok(new Set(manifest.LAZY_LEARN).has("js/learn-drills/thumb-drill.js"));
  assert.ok(!new Set(manifest.FULL).has("js/learn-drills/thumb-drill.js"));
  assert.equal(gameSource().indexOf("ThumbDrill"), -1, "the drill stages and restores the session through G");
});
