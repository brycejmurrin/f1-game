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
  // The failure this exists for, on real files: the count check is the only
  // thing standing between "the browser copy is redundant" and "nobody runs
  // these assertions". Exercised by asking the checker about a pair that is
  // deliberately mismatched rather than by trusting that it would notice.
  //
  // world-physics is that pair for real: 5 of its 6 tests are ported verbatim,
  // and the sixth reads document.getElementById("pm-rate") and dispatches an
  // input event, so it cannot be. It is NOT in TWINNED, and this pins why.
  const { declaredTests } = await import("../../tools/ci/select-budget.mjs");
  const spec = declaredTests("tests/specs/world-physics.spec.js");
  const twin = declaredTests("tests/unit/world-physics-vm.test.mjs");
  assert.notEqual(spec, twin,
    "world-physics's twin now declares as many tests as its spec — if the DOM slider test was ported " +
    "or split out, add the pair to TWINNED in tools/ci/twinned-specs.mjs and delete this test");
  assert.ok(!isTwinned("tests/specs/world-physics.spec.js"),
    "world-physics is only partially twinned and must keep gating in a browser");
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
