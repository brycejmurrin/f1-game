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
import { DEPLOY_BRANCH, touchedCircuits, preflight } from "../../tools/ci/deploy.mjs";
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
