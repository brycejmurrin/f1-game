// twinned-specs — the substitution the selected gate makes on 11 browser specs.
//
// Each of them is skipped on the blocking gate because a VM twin replays its
// assertions in a node group the Pages gate runs unconditionally. That is a
// real saving (123 browser tests of serialized SwiftShader) and a real risk:
// the moment a twin stops covering its spec, the spec is checked NOWHERE, and
// nothing about the failure says so — the gate just keeps passing.
//
// So the substitution is checked, not asserted. This runs on the fast gate.
// Run: node --test tests/unit/twinned-specs.test.mjs   (npm run test:tooling-fast)
import { test } from "node:test";
import { spawnSync } from "node:child_process";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { TWINNED, verify, gatedNodeFiles, ungatedNodeFiles, isTwinned } from "../../tools/ci/twinned-specs.mjs";
import { fit } from "../../tools/ci/select-specs.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

test("every twin still covers its spec, and still runs on a gate", () => {
  const { problems } = verify();
  assert.deepEqual(problems, [],
    "a spec is skipped on the blocking gate because a VM twin covers it, and that stopped being true");
});

test("the selected gate actually skips them, and says so", () => {
  const specs = [...Object.keys(TWINNED), "tests/specs/smoke.spec.js"];
  const r = fit(specs, 15);
  assert.deepEqual(r.selected, [], "a twinned spec was selected — the exclusion is not wired in");
  assert.deepEqual(r.coveredByVmTwin.map((x) => x.file).sort(), Object.keys(TWINNED).sort());
  for (const row of r.coveredByVmTwin)
    assert.ok(row.twin && row.tests > 0, `${row.file} must report its twin and its test count, not vanish quietly`);
});

test("a twin that loses a test is caught", async () => {
  // The failure this exists for: the count check is the only thing standing
  // between "the browser copy is redundant" and "nobody runs these assertions".
  // Exercised on a scratch pair rather than trusted — the same prove-it-bites
  // discipline tools/gen/move-tree.mjs uses for its sweep.
  const { declaredTests } = await import("../../tools/ci/select-budget.mjs");
  const dir = fs.mkdtempSync(path.join(process.env.TMPDIR || "/tmp", "apex-twin-"));
  try {
    const spec = path.join(dir, "a.spec.js"), twin = path.join(dir, "a.test.mjs");
    fs.writeFileSync(spec, 'test("one", () => {});\ntest("two", () => {});\n');
    fs.writeFileSync(twin, 'test("one", () => {});\n');
    const rel = (f) => path.relative(path.resolve(ROOT), f);
    assert.equal(declaredTests(rel(spec)), 2);
    assert.equal(declaredTests(rel(twin)), 1,
      "the counter must see the drift the check is built on");
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }

  // And the real pairs are all equal right now, which is what makes the
  // exclusion in select-specs sound rather than merely convenient.
  for (const { spec, twin, specTests, twinTests } of verify().rows)
    assert.equal(specTests, twinTests, `${spec} vs ${twin}`);
});

test("the gated-node set is derived from ci.yml, not copied", () => {
  // A hard-coded group name is wrong the day the job is edited. This pins that
  // the derivation reads the workflow — and that it resolves to real files.
  const files = gatedNodeFiles();
  assert.ok(files.size > 100, `gatedNodeFiles resolved only ${files.size} files — the ci.yml walk broke`);
  for (const twin of Object.values(TWINNED))
    assert.ok(files.has(twin), `${twin} is not in the derived gated set`);
  const ci = fs.readFileSync(path.join(ROOT, ".github/workflows/ci.yml"), "utf8");
  assert.ok(ci.includes("- name: Pure-node unit suites"),
    "the step the derivation reads was renamed — update gatedNodeFiles(), do not hard-code a group list");
});

test("the LOCAL runner skips twins too, says so, and never hands Playwright an empty list", async () => {
  // run-playwright.mjs is what every `npm run test:<group>` spawns, so this is
  // the half of the substitution the 2026-09-01 plan left unpaid: CI's gate
  // skipped the twins from day one, the local groups kept running them (the
  // `collisions` group is 32/32 twinned). partitionArgs is the one decision.
  const { partitionArgs } = await import("../../tools/ci/twinned-specs.mjs");
  const [twin] = Object.keys(TWINNED);
  const r = partitionArgs(["--workers=1", twin, "tests/specs/smoke.spec.js", "--timeout=900000"], {});
  assert.deepEqual(r.args, ["--workers=1", "tests/specs/smoke.spec.js", "--timeout=900000"], "flags and untwinned specs pass through in order");
  assert.deepEqual(r.dropped, [{ spec: twin, twin: TWINNED[twin] }], "the drop names both halves of the pair");
  assert.equal(r.nothingToRun, false);
  // Every spec a twin: run NOTHING. A bare `playwright test` runs the whole suite.
  const all = partitionArgs(["--workers=1", ...Object.keys(TWINNED)], {});
  assert.equal(all.nothingToRun, true);
  assert.deepEqual(all.args, ["--workers=1"]);
  // Two ways to keep the browser copies: the flag (consumed) and the CI env.
  assert.deepEqual(partitionArgs([twin, "--with-twinned"], {}).args, [twin]);
  assert.deepEqual(partitionArgs([twin], { APEX_WITH_TWINNED: "1" }).dropped, []);
  // The flag itself never reaches Playwright, which would reject it.
  assert.ok(!partitionArgs([twin, "--with-twinned"], {}).args.includes("--with-twinned"));
  // A no-spec invocation (flags only) is not "nothing to run" — it is Playwright's default.
  assert.equal(partitionArgs(["--project=render"], {}).nothingToRun, false);
});

test("a fully twinned group RUNS its twins, and an empty run never reports a pass", () => {
  // THE REGRESSION. The first cut of the local skip printed the reporter's own
  // terminal line — `= run passed  (0/0 done, 0 failed)` — when every spec
  // named had a twin, so that test-bg and verify-change would read the group
  // as green. They did, and so did a human: the `collisions` group is 32/32
  // twinned, and within hours of the skip landing `node tools/ci/test-bg.mjs
  // collisions` had been accepted as the gate for a change to the contact
  // solver, having executed nothing. The twins are in test:game-vm rather than
  // test:tooling-fast, so the cheap local gate had not covered them either.
  //
  // What this pins is not the wording but the ARITHMETIC: a verdict line that
  // claims a pass must have run something. `0/0 done` is the shape of the bug.
  const spec = "tests/specs/wake-lock.spec.js";       // the cheapest pair, ~4 s
  assert.ok(isTwinned(spec), `${spec} is no longer twinned — pick another pair`);
  const r = spawnSync(process.execPath, [path.join(ROOT, "tools/ci/run-playwright.mjs"), spec],
    { cwd: ROOT, encoding: "utf8", timeout: 180000 });
  const out = `${r.stdout || ""}${r.stderr || ""}`;
  const m = /= run (\w+)\s+\((\d+)\/(\d+) done, (\d+) failed\)/.exec(out);
  assert.ok(m, `no verdict line at all:\n${out.slice(-2000)}`);
  assert.equal(m[1], "passed", out.slice(-2000));
  assert.ok(+m[2] > 0 && +m[3] > 0,
    `the verdict claims ${m[2]}/${m[3]} done — a run that executed nothing must never read as a pass`);
  assert.equal(+m[4], 0);
  assert.equal(r.status, 0, `exit ${r.status}`);
  assert.ok(out.includes(TWINNED[spec]), "the twin that actually ran is named in the log");
  // And no browser: the whole point is that this cost seconds, not SwiftShader.
  assert.ok(!/\[playwright\] port=/.test(out), "a fully twinned group must not spawn Playwright");
});

/* ── THE UNGATED SET ──────────────────────────────────────────────────────
 *
 * gatedNodeFiles() answers "what runs before a publish". Its complement is the
 * interesting half, and it cost the project a blocked release train on
 * 2026-09-18: tests/unit/debris-hazard-hint.test.mjs is in `test:sweeps` only,
 * which is in neither tooling-fast nor ci.yml's "Pure-node unit suites", so a
 * float compared bit-for-bit failed every Pages publish from 01:44 while CI
 * stayed green and every local gate passed.
 *
 * deploy.mjs now runs that complement. These two tests are what keep it there:
 * the set must be derived (not a list that rots), and the deploy must actually
 * run it (not merely import it).
 */
test("the ungated set is derived, and is the exact complement of the gated one", () => {
  const gated = gatedNodeFiles();
  const ungated = ungatedNodeFiles();
  assert.ok(Array.isArray(ungated), "ungatedNodeFiles must return a list");
  for (const f of ungated)
    assert.equal(gated.has(f), false, `${f} is reported ungated but the Pages gate runs it — the two derivations disagree`);
  // Every node file in a topical group is in exactly one of the two halves.
  const groups = JSON.parse(fs.readFileSync(new URL("../../tests/groups.json", import.meta.url), "utf8"));
  for (const grp of Object.values(groups.groups || {})) {
    if ((grp.kind || "node") === "browser") continue;
    for (const f of grp.files || []) {
      if (f.startsWith("//")) continue;
      assert.ok(gated.has(f) || ungated.includes(f),
        `${f} is in a topical group but in neither the gated nor the ungated half — the split has a hole`);
    }
  }
});

test("every ungated file is inside test:sweeps — the assumption deploy.mjs rests on", () => {
  // deploy.mjs gates the publish by running test:sweeps WHEN the union can move
  // geometry (f6d8de2). That is the right shape — conditional, and derived from
  // pick-tests' own rules — and it rests on one thing being true: that the
  // files no other gate runs are all IN test:sweeps. Today all 14 are.
  //
  // Nothing else checks that. Add a node test file tomorrow to a group that is
  // in neither tooling-fast nor ci.yml's "Pure-node unit suites" nor
  // test:sweeps, and it runs in no gate before a publish AND is not picked up
  // by the conditional sweep — the same hole that blocked the release train on
  // 2026-09-18, in a place the fix for that does not reach. This names it.
  const groups = JSON.parse(fs.readFileSync(new URL("../../tests/groups.json", import.meta.url), "utf8"));
  const sweeps = new Set((groups.groups["test:sweeps"] || {}).files || []);
  const stranded = ungatedNodeFiles().filter((f) => !sweeps.has(f));
  assert.deepEqual(stranded, [],
    "these run in NO pre-publish gate and are not in test:sweeps either, so deploy.mjs's conditional sweep " +
    "cannot cover them: " + stranded.join(", ") + " — put each in a gated group, or in test:sweeps");
});
