// deploy-tool — tools/ci/deploy.mjs is the one deploy command. Offline checks
// only: the branch name agrees with pick-tests' DEPLOY_BRANCH (the single
// source pages.yml is asserted against), the circuit-touch detector reads a
// real diff, preflight refuses what the protocol refuses, and --help exits 0
// without touching git. plan()/main() need the network and are not run here.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DEPLOY_BRANCH, touchedCircuits, preflight, ratchetMetrics, ratchetOverruns } from "../../tools/ci/deploy.mjs";
import { DEPLOY_BRANCH as PICK_BRANCH } from "../../tools/ci/pick-tests.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

test("deploy.mjs and pick-tests name the same deploy branch", () => {
  assert.equal(DEPLOY_BRANCH, PICK_BRANCH);
});

test("--help prints the usage block and exits 0", () => {
  const r = spawnSync("node", ["tools/ci/deploy.mjs", "--help"], { cwd: ROOT, encoding: "utf8" });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /--plan/);
  assert.match(r.stdout, /--pr/);
});

test("touchedCircuits reads circuit and scenery ids out of a diff", () => {
  const ids = touchedCircuits("HEAD~1");
  assert.ok(Array.isArray(ids));
  for (const id of ids) assert.match(id, /^[a-z_]+$/);
});

test("preflight returns a list of refusals, never throws", () => {
  const problems = preflight();
  assert.ok(Array.isArray(problems));
  for (const p of problems) assert.equal(typeof p, "string");
});

/* THE RATCHETS AUTO-CURE. tests/data/ratchets.json is derived, so a conflict in
 * it is arithmetic and not a disagreement — deploy.mjs takes theirs and re-runs
 * `ratchets.mjs --update` on the merged tree. What makes that safe to automate
 * is the budget: each side's raise against the MERGE BASE is a decision a human
 * made, and their SUM is the most the union can legitimately need. A merged
 * tree measuring more than that has duplicated something, and a bare --update
 * would ratchet the duplication in as the new floor. */
test("ratchetMetrics flattens both scopes and ignores non-numbers", () => {
  const m = ratchetMetrics({
    _doc: "prose, not a metric",
    files: { "js/game.js": { lines: 10, codeLines: 5, note: "skip me" } },
    tree: { shellNodes: { ceiling: 100, slack: 25 }, other: { slack: 3 } },
  });
  assert.deepEqual(m, { "js/game.js/lines": 10, "js/game.js/codeLines": 5, "(tree)/shellNodes": 100 });
});

test("the ratchet budget passes a real two-sided raise and refuses a duplicated merge", () => {
  // Today's actual numbers: base 10188, they raised to 10216 (+28), we raised
  // to 10206 (+18). The union measured 10234, which is exactly 10216 + 18.
  const base = { "js/game.js/lines": 10188 };
  const ours = { "js/game.js/lines": 10206 };
  const theirs = { "js/game.js/lines": 10216 };
  assert.deepEqual(ratchetOverruns(base, ours, theirs, { "js/game.js/lines": 10234 }), [],
    "the sum of two deliberate raises is exactly the budget, and is allowed");
  assert.deepEqual(ratchetOverruns(base, ours, theirs, { "js/game.js/lines": 10200 }), [],
    "under budget is fine too — a merge may drop lines");
  // One line more than both raises combined: a merge that duplicated something.
  const over = ratchetOverruns(base, ours, theirs, { "js/game.js/lines": 10235 });
  assert.equal(over.length, 1);
  assert.match(over[0], /js\/game\.js\/lines: union 10235 > 10216 \+ 18 = 10234/);

  // A metric only one side touched still gets its budget from that side.
  assert.deepEqual(ratchetOverruns({ a: 5 }, { a: 5 }, { a: 9 }, { a: 9 }), [], "their raise alone");
  assert.deepEqual(ratchetOverruns({ a: 5 }, { a: 8 }, { a: 5 }, { a: 8 }), [], "our raise alone");
  assert.equal(ratchetOverruns({ a: 5 }, { a: 8 }, { a: 5 }, { a: 9 }).length, 1, "one past ours");

  // A metric absent from any stage is skipped rather than guessed at: a NEW
  // ratchet added by one side has no base to measure a raise against.
  assert.deepEqual(ratchetOverruns({}, { b: 1 }, { b: 1 }, { b: 999 }), []);
});
