/* ready-gate.test.mjs — draft→ready requires tooling-fast / Structural guards
 * green on the tip (AGENTS.md §Concurrent PRs; evidence #1111 designer-canvas).
 *
 * Run: node --test tests/unit/ready-gate.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  GUARDS_A, GUARDS_B, GUARDS_JOB,
  guardsVerdict, localVerdict, evaluate, shaPrefixMatch, stampReadySha, newestByName,
} from "../../tools/ci/ready-gate.mjs";

const run = (name, status, conclusion, id = 1) => ({
  id, name, status, conclusion,
  completed_at: status === "completed" ? "2026-10-06T12:00:00Z" : null,
  started_at: "2026-10-06T11:00:00Z",
});

test("shaPrefixMatch accepts short/full mutual prefixes", () => {
  assert.equal(shaPrefixMatch("abcdef1", "abcdef1234567890"), true);
  assert.equal(shaPrefixMatch("abcdef1234567890", "abcdef1"), true);
  assert.equal(shaPrefixMatch("abcdef1", "abcdef2"), false);
  assert.equal(shaPrefixMatch("abc", "abcdef1"), false);
});

test("guardsVerdict: aggregator success is enough", () => {
  const v = guardsVerdict([run(GUARDS_JOB, "completed", "success")]);
  assert.equal(v.state, "passed");
  assert.equal(v.code, 0);
  assert.match(v.evidence, /Structural guards success/);
});

test("guardsVerdict: aggregator failure is a hard refuse", () => {
  const v = guardsVerdict([
    run(GUARDS_JOB, "completed", "failure"),
    run(GUARDS_A, "completed", "success", 2),
    run(GUARDS_B, "completed", "success", 3),
  ]);
  assert.equal(v.state, "failed");
  assert.equal(v.code, 1);
});

test("guardsVerdict: pending aggregator blocks ready", () => {
  const v = guardsVerdict([run(GUARDS_JOB, "in_progress", null)]);
  assert.equal(v.state, "pending");
  assert.equal(v.code, 1);
});

test("guardsVerdict: both tooling halves green when aggregator skipped", () => {
  const v = guardsVerdict([
    run(GUARDS_JOB, "completed", "skipped"),
    run(GUARDS_A, "completed", "success", 2),
    run(GUARDS_B, "completed", "success", 3),
  ]);
  assert.equal(v.state, "passed");
  assert.match(v.evidence, /tooling A/);
});

test("guardsVerdict: one red half fails even if the other is green", () => {
  const v = guardsVerdict([
    run(GUARDS_A, "completed", "success", 2),
    run(GUARDS_B, "completed", "failure", 3),
  ]);
  assert.equal(v.state, "failed");
  assert.match(v.evidence, /tooling B/);
});

test("guardsVerdict: no Structural guards check-runs → none", () => {
  assert.equal(guardsVerdict([run("CI", "completed", "success")]).state, "none");
  assert.equal(guardsVerdict([]).state, "none");
});

test("newestByName keeps the latest completed check-run per name", () => {
  const by = newestByName([
    { id: 1, name: GUARDS_JOB, status: "completed", conclusion: "failure", completed_at: "2026-10-06T10:00:00Z" },
    { id: 2, name: GUARDS_JOB, status: "completed", conclusion: "success", completed_at: "2026-10-06T12:00:00Z" },
  ]);
  assert.equal(by.get(GUARDS_JOB).conclusion, "success");
  assert.equal(by.get(GUARDS_JOB).id, 2);
});

test("localVerdict: stamp + passed log matching tip is green", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ready-gate-"));
  const stamp = path.join(dir, "tooling-fast-ready.sha");
  const log = path.join(dir, "tooling-fast-suite.log");
  const tip = "abcdef1234567890abcdef1234567890abcdef12";
  fs.writeFileSync(stamp, tip + "\n");
  fs.writeFileSync(log, "[tooling-fast] = run passed (10 passed, 0 failed)\n");
  const v = localVerdict(tip, { stampPath: stamp, logPath: log });
  assert.equal(v.state, "passed");
  assert.equal(v.code, 0);
});

test("localVerdict: stamp for another tip refuses", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ready-gate-"));
  const stamp = path.join(dir, "tooling-fast-ready.sha");
  const log = path.join(dir, "tooling-fast-suite.log");
  fs.writeFileSync(stamp, "1111111111111111111111111111111111111111\n");
  fs.writeFileSync(log, "[tooling-fast] = run passed (10 passed, 0 failed)\n");
  const v = localVerdict("abcdef1234567890abcdef1234567890abcdef12", { stampPath: stamp, logPath: log });
  assert.equal(v.state, "failed");
  assert.match(v.evidence, /≠ tip/);
});

test("localVerdict: failed suite log refuses even with matching stamp", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ready-gate-"));
  const stamp = path.join(dir, "tooling-fast-ready.sha");
  const log = path.join(dir, "tooling-fast-suite.log");
  const tip = "abcdef1";
  fs.writeFileSync(stamp, tip + "\n");
  fs.writeFileSync(log, "[tooling-fast] = run failed (9 passed, 1 failed)\n");
  assert.equal(localVerdict(tip, { stampPath: stamp, logPath: log }).state, "failed");
});

test("evaluate: CI success wins; CI failure refuses even with local stamp", () => {
  const tip = "abcdef1234567890abcdef1234567890abcdef12";
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ready-gate-"));
  const stamp = path.join(dir, "tooling-fast-ready.sha");
  const log = path.join(dir, "tooling-fast-suite.log");
  fs.writeFileSync(stamp, tip + "\n");
  fs.writeFileSync(log, "[tooling-fast] = run passed (1 passed, 0 failed)\n");
  const localOpts = { stampPath: stamp, logPath: log };

  const ok = evaluate({
    sha: tip,
    request: () => ({ json: { check_runs: [run(GUARDS_JOB, "completed", "success")] } }),
    localOpts,
  });
  assert.equal(ok.state, "passed");
  assert.equal(ok.source, "ci");

  const bad = evaluate({
    sha: tip,
    request: () => ({ json: { check_runs: [run(GUARDS_JOB, "completed", "failure")] } }),
    localOpts,
  });
  assert.equal(bad.state, "failed");
  assert.equal(bad.source, "ci");
  assert.equal(bad.code, 1);
});

test("evaluate: pending CI can be unblocked by a matching local stamp", () => {
  const tip = "abcdef1234567890abcdef1234567890abcdef12";
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ready-gate-"));
  const stamp = path.join(dir, "tooling-fast-ready.sha");
  const log = path.join(dir, "tooling-fast-suite.log");
  fs.writeFileSync(stamp, tip + "\n");
  fs.writeFileSync(log, "[tooling-fast] = run passed (1 passed, 0 failed)\n");
  const v = evaluate({
    sha: tip,
    request: () => ({ json: { check_runs: [run(GUARDS_JOB, "in_progress", null)] } }),
    localOpts: { stampPath: stamp, logPath: log },
  });
  assert.equal(v.state, "passed");
  assert.equal(v.source, "local");
});

test("evaluate: API error with no local stamp is unknown (exit 3)", () => {
  const v = evaluate({
    sha: "abcdef1234567890abcdef1234567890abcdef12",
    request: () => ({ error: "no token" }),
    localOpts: {
      stampPath: path.join(os.tmpdir(), "no-such-ready-stamp"),
      logPath: path.join(os.tmpdir(), "no-such-ready-log"),
      exists: () => false,
    },
  });
  assert.equal(v.state, "unknown");
  assert.equal(v.code, 3);
});

test("stampReadySha writes the tip", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ready-gate-"));
  const stamp = path.join(dir, "nested", "tooling-fast-ready.sha");
  assert.equal(stampReadySha("abcdef1234567890", { stampPath: stamp }), true);
  assert.equal(fs.readFileSync(stamp, "utf8").trim(), "abcdef1234567890");
});
