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
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { TWINNED, verify, gatedNodeFiles, isTwinned } from "../../tools/ci/twinned-specs.mjs";
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
