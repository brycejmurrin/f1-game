// The flaky-test policy (AGENTS.md §Verification 9): a pass that needed a retry
// is a red unless its spec is in tests/data/flaky-quarantine.json, and every row
// there is a ledger entry — a spec that exists, an owner, a date, a reason. The
// verdict itself is a pure function (tests/helpers/flaky-policy.mjs), so this
// pins it without a browser; the reporter only reads it. Under a second.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadQuarantine, flakyVerdict, armed, QUARANTINE } from "../helpers/flaky-policy.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const FILE = JSON.parse(fs.readFileSync(QUARANTINE, "utf8"));

test("every quarantine row names a spec that exists and carries since/owner/why", () => {
  assert.ok(Array.isArray(FILE.quarantine), "quarantine must be a list");
  const seen = new Set();
  for (const row of FILE.quarantine) {
    assert.match(row.spec || "", /^tests\/specs\/.+\.spec\.js$/, `${JSON.stringify(row)}: spec must be a repo-relative tests/specs path`);
    assert.ok(fs.existsSync(path.join(ROOT, row.spec)), `${row.spec}: quarantined spec does not exist — delete the row`);
    assert.match(row.since || "", /^\d{4}-\d{2}-\d{2}$/, `${row.spec}: since must be an ISO date`);
    assert.ok((row.owner || "").length >= 8, `${row.spec}: owner names who fixes it`);
    assert.ok((row.why || "").length >= 40, `${row.spec}: why must say what was measured`);
    assert.ok(!seen.has(row.spec), `${row.spec}: listed twice`);
    seen.add(row.spec);
  }
});

test("the loader returns the quarantined spec paths, and an empty set for a missing file", () => {
  const q = loadQuarantine();
  for (const row of FILE.quarantine) assert.ok(q.has(row.spec));
  assert.equal(q.size, FILE.quarantine.length);
  assert.equal(loadQuarantine(path.join(ROOT, "scratch", "no-such-quarantine.json")).size, 0);
});

test("verdict: a quarantined flake is reported, an unlisted one blocks, none means pass", () => {
  // Fixture keys, not repo paths: the verdict is plain set membership on key().spec.
  const q = new Set(["fixture/known.spec.js"]);
  const known = { spec: "fixture/known.spec.js", title: "wobbles" };
  const fresh = { spec: "fixture/new.spec.js", title: "also wobbles" };
  assert.deepEqual(flakyVerdict([], q), { blocking: [], quarantined: [], fail: false });
  const spared = flakyVerdict([known], q);
  assert.equal(spared.fail, false);
  assert.deepEqual(spared.quarantined, [known]);
  const red = flakyVerdict([known, fresh], q);
  assert.equal(red.fail, true, "one unlisted flake is enough to fail the run");
  assert.deepEqual(red.blocking, [fresh]);
  assert.deepEqual(red.quarantined, [known]);
});

test("the switch is APEX_FAIL_ON_FLAKY=1 and nothing else", () => {
  assert.equal(armed({}), false);
  assert.equal(armed({ APEX_FAIL_ON_FLAKY: "0" }), false);
  assert.equal(armed({ APEX_FAIL_ON_FLAKY: "true" }), false);
  assert.equal(armed({ APEX_FAIL_ON_FLAKY: "1" }), true);
});

test("ci.yml arms the policy on every browser job that retries", () => {
  const yml = fs.readFileSync(path.join(ROOT, ".github/workflows/ci.yml"), "utf8");
  const workers = (yml.match(/^\s*APEX_WORKERS: 1$/gm) || []).length;
  const armedJobs = (yml.match(/^\s*APEX_FAIL_ON_FLAKY: 1$/gm) || []).length;
  assert.ok(workers > 0, "no browser job env block found");
  assert.equal(armedJobs, workers, "every APEX_WORKERS: 1 env block must also set APEX_FAIL_ON_FLAKY: 1");
});

test("the live reporter reads the verdict from the policy module, not from a CLI flag", () => {
  const rep = fs.readFileSync(path.join(ROOT, "tests/helpers/live-reporter.js"), "utf8");
  assert.match(rep, /from "\.\/flaky-policy\.mjs"/);
  assert.match(rep, /flakyVerdict\(/);
  const runner = fs.readFileSync(path.join(ROOT, "tools/ci/run-playwright.mjs"), "utf8");
  assert.ok(!/args\.push\("--fail-on-flaky-tests"\)/.test(runner), "the all-or-nothing Playwright flag must stay out of the argv");
});
