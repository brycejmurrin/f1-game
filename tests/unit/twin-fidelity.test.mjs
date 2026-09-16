// The ALWAYS-ON half of the fidelity gate. Running the mutants costs a spec
// run each; this costs milliseconds and catches the way such a matrix actually
// dies — a refactor moves the code, the `find` string stops matching, and every
// mutant silently becomes a no-op that reports PASS forever.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { MUTANTS, needleReport, parseTap, verdictFor } from "../../tools/check/twin-fidelity.mjs";

const MATRIX = JSON.parse(fs.readFileSync(new URL("../data/mutants.json", import.meta.url), "utf8"));

test("every gating mutant's needle still exists, exactly once, in its file", () => {
  const bad = needleReport().filter((r) => !r.ok);
  assert.deepEqual(bad, [], "a needle that no longer matches makes its mutant a silent no-op");
  assert.ok(MUTANTS.length > 0, "an empty matrix would pass vacuously");
});

test("every mutant is ASYMMETRIC — it must spare at least one test", () => {
  for (const m of MUTANTS) {
    const vals = Object.values(m.catchers);
    assert.ok(vals.some((v) => v === true), `${m.id} catches nothing`);
    assert.ok(vals.some((v) => v === false),
      `${m.id} reddens every test it names — a mutant that breaks everything proves only that the suite runs`);
    assert.ok(m.why && m.why.length > 40, `${m.id} needs a why`);
    assert.ok(fs.existsSync(new URL(`../../${m.spec}`, import.meta.url)), `${m.id} names a spec that does not exist`);
  }
});

test("the TAP parser reads both outcomes, which is what the verdict turns on", () => {
  const got = parseTap(["ok 1 - alpha", "not ok 2 - beta", "# pass 1"].join("\n"));
  assert.equal(got.get("alpha"), true);
  assert.equal(got.get("beta"), false);
});

test("a twin that sleeps through a mutant FAILS, and a missing test never reads as a pass", () => {
  const m = { id: "x", catchers: { a: true, b: false } };
  // The anti-vacuity case: this gate exists to fail here.
  const slept = verdictFor(m, new Map([["a", true], ["b", true]]));
  assert.equal(slept.find((r) => r.name === "a").ok, false, "a passing test under its own mutant is a HOLE");
  const caught = verdictFor(m, new Map([["a", false], ["b", true]]));
  assert.ok(caught.every((r) => r.ok));
  const absent = verdictFor(m, new Map([["b", true]]));
  assert.equal(absent.find((r) => r.name === "a").ok, false, "a test that never ran is not a pass");
});

test("the open questions keep their evidence rather than being deleted", () => {
  const open = MATRIX.openQuestions || [];
  assert.ok(open.length > 0, "the projection finding must not vanish silently");
  for (const q of open) {
    assert.ok(q.finding && q.measured && q.sowhat, `${q.id} must keep finding/measured/sowhat`);
    assert.ok(!MUTANTS.some((m) => m.id === q.id), `${q.id} cannot both gate and be open`);
  }
});
