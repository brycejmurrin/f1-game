/* drill-lines-vm.test.mjs — LEARN's Racing Lines drill (js/learn-drills/lines.js, #6559 step 10, #6551 §3).
 * 1. Pure: the medal stages (bronze all three cones, silver the right answer, gold a better run on the winner).
 * 2. Source: only begin() names the racing line (placement); sample, score and the widget never do.
 * 3. VM: the helper's pursuit driver clips each cone within 1.5 m; the runs match tests/data/learn-drill-refs.json;
 *    LATE exits faster than EARLY (the lesson, pinned to the model); a second LATE run on the same seed scores
 *    bit-identically with the same medal; the answer lifts the stage to silver and the store keeps it.
 * The arc-swap guard for this drill lives in tests/unit/curvature-contract-vm.test.mjs.
 * Run: node --test tests/unit/drill-lines-vm.test.mjs */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { absSrc } from "../helpers/abs-src.mjs";
import { linesDrill, refRun, REFS } from "../helpers/lines-drill-vm.mjs";

const SRC = readFileSync(absSrc("js/learn-drills/lines.js"), "utf8");
const refs = JSON.parse(readFileSync(REFS, "utf8")).lines;
const plain = v => JSON.parse(JSON.stringify(v));

function pure() {
  const ctx = vm.createContext({ console, Math, Object, Array, Number, String, Map, Set, Error });
  vm.runInContext(readFileSync(absSrc("js/learn-drills/registry.js"), "utf8"), ctx, { filename: absSrc("js/learn-drills/registry.js") });
  vm.runInContext(SRC, ctx, { filename: absSrc("js/learn-drills/lines.js") });
  return ctx;
}

test("stages: bronze = all three counted, silver = the right answer, gold = a later, closer, faster run on the winner", () => {
  const LD = vm.runInContext("LinesDrill", pure());
  const run = (variant, gateS, miss = 1, counted = true) => ({ variant, gateS, miss, counted });
  const three = [run("early", 25), run("geometric", 24.5), run("late", 24)];
  assert.equal(LD.stageOf({ runs: three.slice(0, 2), answer: null }), 0);
  assert.equal(LD.stageOf({ runs: [...three.slice(0, 2), run("late", 20, 2, false)], answer: null }), 0, "an uncounted run is no apex");
  assert.equal(LD.winner(three), "late");
  assert.equal(LD.stageOf({ runs: three, answer: null }), 1);
  assert.equal(LD.stageOf({ runs: three, answer: { pick: "early", after: 3 } }), 1, "the wrong answer stays bronze");
  assert.equal(LD.stageOf({ runs: three, answer: { pick: "late", after: 3 } }), 2);
  assert.equal(LD.stageOf({ runs: [...three, run("late", 23.9, 0.7)], answer: { pick: "late", after: 3 } }), 2, "0.7 m is not within 0.5 m");
  assert.equal(LD.stageOf({ runs: [...three, run("late", 24.1, 0.3)], answer: { pick: "late", after: 3 } }), 2, "slower than the best LATE");
  assert.equal(LD.stageOf({ runs: [...three, run("late", 23.9, 0.3)], answer: { pick: "late", after: 3 } }), 3);
  assert.equal(LD.stageOf({ runs: [...three.slice(0, 2), run("late", 23.9, 0.3), run("late", 24)], answer: { pick: "late", after: 4 } }), 2,
    "the gold run comes after the answer");
});

test("the drill registers on the racing-line lesson: a solo Monza Time Trial on the apex goal", () => {
  const ctx = pure(), d = vm.runInContext("DrillRegistry.get('lines')", ctx);
  assert.equal(d.lesson, "racing-line");
  assert.equal(d.goal, "apex");
  assert.deepEqual(plain(d.setup), { flow: "gp", session: "tt", track: "monza", weather: "dry", changeable: false, grid: "tier", duel: false, dirtyAir: "classic", wind: "off" });
  assert.deepEqual(plain(d.medals), refs.tiers, "the card's tiers are the reference stages");
  assert.equal(vm.runInContext("LinesDrill.define() === DrillRegistry.get('lines')", ctx), true, "define is idempotent");
});

test("source: the racing line is read only by begin() (placement); nothing reads curvature", () => {
  assert.doesNotMatch(SRC, /curvature\s*\(|\.curv\b|lineRoadK|DrivingLine\./, "no arc table or driving-line read");
  const begin = SRC.slice(SRC.indexOf("function begin("), SRC.indexOf("\n  }\n", SRC.indexOf("function begin(")));
  assert.equal((SRC.match(/TrackLine\.\w+\(/g) || []).length, 1, "one TrackLine call in the file");
  assert.match(begin, /TrackLine\.at\(/, "…and it is begin()'s placement");
});

let run = null;
before(async () => { run = await linesDrill(); });
after(() => { if (run) run.close(); });

test("each cone counts within 1.5 m, the runs match the references and LATE exits faster than EARLY", () => {
  const { LD, G } = run;
  const Tracks = vm.runInContext("TrackLine", run.g.ctx);
  for (const v of LD.VARIANTS) {
    assert.equal(Math.sign(Tracks.at(G.track, run.turnS + v.off).x), LD.INSIDE, `${v.id}: the cone is on the side the racing line apexes`);
  }
  const rows = [];
  for (const [k, id] of ["early", "geometric", "late"].entries()) {
    if (k) assert.ok(run.retry(), "RETRY back to the checkpoint");
    const { result } = run.drive(id);
    assert.ok(result, id + " finished");
    assert.equal(result.clean, true, id + ": " + result.reason);
    rows.push(refRun(LD));
  }
  assert.deepEqual(rows, refs.runs, "the reference runs (node tests/helpers/lines-drill-vm.mjs --write)");
  const by = Object.fromEntries(rows.map(r => [r.variant, r]));
  assert.ok(by.late.vExit > by.early.vExit, `exit LATE ${by.late.vExit} > EARLY ${by.early.vExit} m/s`);
  assert.equal(LD.winner(LD.book().runs), "late");
  assert.equal(run.host.state().result.medal, "bronze", "all three apexes: bronze");
});

test("two LATE runs on one seed: the same score and medal; the right answer makes it silver, saved", () => {
  const { LD, host } = run;
  const first = LD.book().runs.at(-1);
  assert.ok(run.retry());
  const again = run.drive("late").result;
  assert.deepEqual(plain(LD.book().runs.at(-1)), plain(first), "the rerun is bit-identical");
  assert.equal(again.medal, "bronze");
  assert.equal(LD.answer("geometric"), true, "the question opens once all three apexes count");
  assert.equal(LD.answer("late"), false, "one answer per launch");
  assert.equal(LD.book().answer.pick, "geometric", "the first answer stands");
  host.end("quit");   // a fresh launch, a fresh book
});

test("a fresh launch: the right answer after three cones lifts the stage to silver, kept by the medal store", async () => {
  run.close();
  run = await linesDrill();
  const { LD } = run;
  for (const [k, id] of ["early", "geometric", "late"].entries()) { if (k) run.retry(); run.drive(id); }
  assert.equal(LD.answer("late"), true);
  run.retry();
  const r = run.drive("late").result;
  assert.equal(r.value, 2);
  assert.equal(r.medal, "silver");
  const saved = JSON.parse(vm.runInContext('localStorage.getItem("apex26.learnMedals.v1")', run.g.ctx))["lines|classic"];
  assert.deepEqual(saved && { best: saved.best, medal: saved.medal }, { best: 2, medal: "silver" });
});
