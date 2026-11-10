// The ALWAYS-ON half of the fidelity gate. Running the mutants costs a spec
// run each; this costs milliseconds and catches the way such a matrix actually
// dies — a refactor moves the code, the `find` string stops matching, and every
// mutant silently becomes a no-op that reports PASS forever.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import {
  MUTANTS, needleReport, parseTap, verdictFor, planFidelity, runFidelity,
  withMutant, makeShadowTree, sweepStaleShadows,
} from "../../tools/check/twin-fidelity.mjs";

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

test("twin-fidelity --help exits 0 without running mutants", () => {
  // --help used to fall through to the full mutation suite (~5 min of VM specs).
  const TOOL = fileURLToPath(new URL("../../tools/check/twin-fidelity.mjs", import.meta.url));
  const r = spawnSync(process.execPath, [TOOL, "--help"], { encoding: "utf8", timeout: 10000 });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /usage:.*twin-fidelity/);
  assert.doesNotMatch(r.stdout, /^PASS /m);
});

test("every named catcher is a real test title in the mutant's spec (a renamed test must not leave a dead name)", () => {
  for (const m of MUTANTS) {
    const src = fs.readFileSync(new URL(`../../${m.spec}`, import.meta.url), "utf8");
    for (const name of Object.keys(m.catchers)) {
      // titles are quoted in source; allow the three quote styles and escaped quotes inside
      const variants = [name, name.replace(/"/g, '\\"'), name.replace(/'/g, "\\'"), name.replace(/`/g, "\\`")];
      // a generated title (`... on ${track}`) matches by its template shape
      const templated = [...src.matchAll(/`([^`\n]*\$\{[^`\n]*)`/g)].some(([, t]) =>
        new RegExp("^" + t.split(/\$\{[^}]*\}/).map((x) => x.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join(".+") + "$").test(name));
      assert.ok(templated || variants.some((v) => src.includes(v)),
        `${m.id}: catcher "${name}" is not a test title in ${m.spec} — the verdict would read it as "never ran"`);
    }
  }
});

test("invalid fidelity selectors and flags fail before even checking needles", () => {
  let calls = 0;
  const forbidden = () => { calls++; throw new Error("must validate before any work"); };
  const dependencies = { needles: forbidden, mutate: forbidden, spec: forbidden };
  for (const args of [["m-wall-scrub-flatt"], [MUTANTS[0].id, "no-such-mutant"],
    ["--dray"], ["--dry=no"], ["-x"], ["--list", "--dry"], ["--dry", ""],
    ["--list", "no-such-mutant"]]) {
    assert.throws(() => runFidelity(args, dependencies), /unknown (mutant id|flag)|cannot be combined/);
  }
  assert.equal(calls, 0, "invalid requests must neither read needles nor patch files or launch specs");
});

test("fidelity planning preserves all-mutant, explicit selection, help, list and dry modes", () => {
  assert.deepEqual(planFidelity([]), { mode: "run", run: MUTANTS });
  assert.deepEqual(planFidelity([MUTANTS[0].id]).run, [MUTANTS[0]]);
  assert.equal(planFidelity(["-h"]).mode, "help");
  assert.equal(planFidelity(["--list"]).mode, "list");
  assert.equal(planFidelity(["--dry"]).mode, "dry");
  const forbidden = () => assert.fail("help/list/dry must not mutate or run specs");
  assert.equal(runFidelity(["--help"], { needles: forbidden, mutate: forbidden, spec: forbidden }), 0);
  assert.equal(runFidelity(["--list"], { needles: forbidden, mutate: forbidden, spec: forbidden }), 0);
  assert.equal(runFidelity(["--dry"], { needles: () => [], mutate: forbidden, spec: forbidden }), 0);
});

test("a valid fidelity selection runs only its declared mutant through the injected runner", () => {
  const selected = [];
  let current;
  const status = runFidelity([MUTANTS[0].id], {
    needles: () => [],
    mutate: (m, fn) => { selected.push(m.id); current = m; return fn(); },
    spec: (spec) => {
      assert.equal(spec, current.spec);
      return new Map(Object.entries(current.catchers).map(([name, mustFail]) => [name, !mustFail]));
    },
  });
  assert.equal(status, 0);
  assert.deepEqual(selected, [MUTANTS[0].id]);
});

test("the fidelity CLI reports an unknown selector as a caller error", () => {
  const TOOL = fileURLToPath(new URL("../../tools/check/twin-fidelity.mjs", import.meta.url));
  const r = spawnSync(process.execPath, [TOOL, "no-such-mutant"], { encoding: "utf8", timeout: 10000 });
  assert.equal(r.status, 1, r.stderr);
  assert.match(r.stderr, /unknown mutant id.*no-such-mutant/);
  assert.doesNotMatch(r.stdout, /0\/0|^PASS /m);
  assert.doesNotMatch(r.stderr, /\n\s+at /, "a typo needs no stack trace");
});

// Mutants used to be written into the REAL js/ file and restored in a `finally`
// that SIGINT or a spawn timeout skips — leaving broken product code in the tree.
// A run now mutates a shadow copy; the real file must be byte-identical while
// the mutant is live, not merely after the restore.
const ROOT = fileURLToPath(new URL("../..", import.meta.url));
const sha = (abs) => crypto.createHash("sha256").update(fs.readFileSync(abs)).digest("hex");

test("a run never modifies the real source — the mutant lives only in the shadow tree", () => {
  const m = MUTANTS[0];
  const real = path.join(ROOT, m.file);
  const before = sha(real);
  const seen = [];
  const log = console.log;
  console.log = () => {};
  let code;
  try {
    code = runFidelity([m.id], {
      spec: (spec, cwd) => {
        assert.equal(sha(real), before, "the REAL file changed while the mutant was applied");
        assert.notEqual(path.resolve(cwd), path.resolve(ROOT), "the spec must run inside the shadow tree");
        assert.equal(fs.readFileSync(path.join(cwd, m.file), "utf8"), fs.readFileSync(real, "utf8").replace(m.find, m.replace),
          "the shadow copy is the real file with exactly this mutant applied");
        assert.ok(fs.existsSync(path.join(cwd, spec)), "the spec resolves inside the shadow");
        seen.push(cwd);
        return new Map(Object.entries(m.catchers).map(([name, mustFail]) => [name, !mustFail]));
      },
    });
  } finally { console.log = log; }
  assert.equal(code, 0);
  assert.equal(seen.length, 1);
  assert.equal(sha(real), before);
  assert.ok(!fs.existsSync(seen[0]), "the shadow tree is removed after the run");
});

test("withMutant refuses to run without a shadow, or to write through a linked dir", () => {
  const m = MUTANTS[0];
  assert.throws(() => withMutant(m, () => 0), /shadow tree/);
  assert.throws(() => withMutant({ ...m, file: ["docs", "fixture.md"].join("/") }, () => 0, "/nonexistent"), /LINKED/);
});

test("a shadow left by a killed run is swept by the next one", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "twin-fidelity-"));
  try {
    fs.mkdirSync(path.join(root, "js"));
    fs.writeFileSync(path.join(root, "js", "a.js"), "const A = 1;\n");
    const deadPid = 2 ** 22 + 12345;            // above any pid_max: never alive
    const stale = path.join(root, "artifacts", "twin-fidelity", `tree-${deadPid}`);
    fs.mkdirSync(stale, { recursive: true });
    const t = makeShadowTree(root);
    assert.ok(!fs.existsSync(stale), "the dead run's shadow is gone");
    assert.equal(fs.readFileSync(path.join(t.dir, "js", "a.js"), "utf8"), "const A = 1;\n");
    assert.ok(!fs.lstatSync(path.join(t.dir, "js")).isSymbolicLink(), "code dirs are real copies");
    t.dispose();
    assert.deepEqual(sweepStaleShadows(root), []);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
