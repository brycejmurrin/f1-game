// ci-verdict — the required-check aggregator for path-skipped CI jobs.
// Cancelled needed jobs fail the aggregator (same as failure) — do not treat cancel as green.
import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { verdict, ADVISORY } from "../../tools/ci/ci-verdict.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

test("success and skipped needed jobs pass", () => {
  const v = verdict({
    guards: { result: "success" },
    "node-suites": { result: "skipped" },
    smoke: { result: "success" },
  });
  assert.equal(v.ok, true);
  assert.deepEqual(v.bad, []);
  assert.ok(v.passed.includes("guards"));
  assert.ok(v.skipped.includes("node-suites"));
});

test("a failed or cancelled needed job fails the aggregator", () => {
  assert.equal(verdict({ guards: { result: "failure" } }).ok, false);
  assert.equal(verdict({ smoke: { result: "cancelled" } }).ok, false);
  assert.match(verdict({ smoke: { result: "cancelled" } }).bad[0], /cancelled/);
});

test("selected cancelled is deferred when selected-verdict succeeded (clean-junit infra-retry)", () => {
  const v = verdict({
    selected: { result: "cancelled" },
    "selected-verdict": { result: "success" },
    guards: { result: "success" },
  });
  assert.equal(v.ok, true);
  assert.ok(v.skipped.some((s) => /selected: deferred to selected-verdict/.test(s)));
});

test("selected cancelled still fails when selected-verdict also failed", () => {
  const v = verdict({
    selected: { result: "cancelled" },
    "selected-verdict": { result: "failure" },
  });
  assert.equal(v.ok, false);
  assert.ok(v.bad.some((b) => /selected-verdict/.test(b)));
});

test("baseline-trial is advisory: failure does not fail CI", () => {
  assert.ok(ADVISORY.has("baseline-trial"));
  const v = verdict({
    guards: { result: "success" },
    "baseline-trial": { result: "failure" },
  });
  assert.equal(v.ok, true);
});

test("advisory cancelled still fails (run was interrupted)", () => {
  const v = verdict({ "baseline-trial": { result: "cancelled" } });
  assert.equal(v.ok, false);
});

test("CLI exits 0 on all-success NEEDS and 1 on failure", () => {
  const run = (needs) => {
    try {
      execFileSync("node", ["tools/ci/ci-verdict.mjs", "--json"], {
        cwd: ROOT,
        encoding: "utf8",
        env: { ...process.env, NEEDS: JSON.stringify(needs) },
      });
      return 0;
    } catch (e) {
      return e.status;
    }
  };
  assert.equal(run({ guards: { result: "success" } }), 0);
  assert.equal(run({ guards: { result: "failure" } }), 1);
});
