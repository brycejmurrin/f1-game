// ci-guard-tools — CI guards born on 2026-10-15 (weather PR #1800, the Actions jam):
//  - tools/ci/ci-rerun.mjs refuses a superseded PR run (re-running one cancelled
//    the live run on the new head), a live run, a green run and a second re-run;
//  - .github/workflows/ci-cancel-on-close.yml joins ci.yml's PR concurrency group.
// Pure functions only, no network, no browser.
//
// Run: node --test tests/unit/ci-guard-tools.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { decide, prNumberOf } from "../../tools/ci/ci-rerun.mjs";

const run = (o = {}) => ({ id: 1, status: "completed", conclusion: "failure", event: "pull_request", head_sha: "aaaa1111", run_attempt: 1, pull_requests: [{ number: 7 }], ...o });

test("ci-rerun: a superseded PR run is refused (the #1800 trap)", () => {
  const v = decide(run({ conclusion: "cancelled", head_sha: "82e73b048" }), "8fca23f8d");
  assert.equal(v.ok, false);
  assert.match(v.reason, /superseded/);
});

test("ci-rerun: a live run, a green run, an unreadable PR head and a second attempt are refused", () => {
  assert.equal(decide(run({ status: "queued" }), "aaaa1111").ok, false);
  assert.equal(decide(run({ status: "in_progress" }), "aaaa1111").ok, false);
  assert.equal(decide(run({ conclusion: "success" }), "aaaa1111").ok, false);
  assert.equal(decide(run(), null).ok, false);
  assert.equal(decide(run({ run_attempt: 2 }), "aaaa1111").ok, false);
  assert.equal(decide(run({ run_attempt: 2 }), "aaaa1111", { again: true }).ok, true);
});

test("ci-rerun: a completed failed run on the current head is allowed; push/dispatch runs need no PR", () => {
  assert.equal(decide(run(), "aaaa1111").ok, true);
  assert.equal(decide(run({ event: "push", pull_requests: [] }), null).ok, true);
  assert.equal(decide(run({ event: "workflow_dispatch", pull_requests: [] }), null).ok, true);
  assert.equal(prNumberOf(run()), 7);
  assert.equal(prNumberOf(run({ pull_requests: [] })), null);
});

test("ci-cancel-on-close.yml joins ci.yml's PR concurrency group exactly", async () => {
  const fs = await import("node:fs");
  const path = await import("node:path");
  const { fileURLToPath } = await import("node:url");
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
  const ci = fs.readFileSync(path.join(root, ".github/workflows/ci.yml"), "utf8");
  const wf = fs.readFileSync(path.join(root, ".github/workflows/ci-cancel-on-close.yml"), "utf8");
  // ci.yml's group, for a pull_request event, falls through to `github.event.pull_request.head.ref`
  // after the `ci-` prefix; the cancel workflow must name that exact group or it cancels nothing.
  const ciGroup = /^\s+group: (ci-\$\{\{.*\}\})\s*$/m.exec(ci)?.[1] || "";
  assert.match(ciGroup, /^ci-\$\{\{ /, "ci.yml's top-level group still starts `ci-${{`");
  assert.match(ciGroup, /\|\| github\.event\.pull_request\.head\.ref \|\|/, "ci.yml still resolves a PR run to head.ref");
  assert.match(wf, /^\s+group: ci-\$\{\{ github\.event\.pull_request\.head\.ref \}\}\s*$/m);
  assert.match(wf, /^\s+cancel-in-progress: true\s*$/m);
  assert.match(wf, /types: \[closed\]/);
  assert.match(wf, /actions: write/);
  for (const st of ["queued", "in_progress", "pending", "waiting", "requested"])
    assert.match(wf, new RegExp(`\\b${st}\\b`), `straggler sweep covers live status ${st}`);
});
