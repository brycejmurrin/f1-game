// ci-verdict — the required-check aggregator for path-skipped CI jobs.
// Cancelled needed jobs fail the aggregator (same as failure) — do not treat cancel as green.
import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { verdict, summary, ADVISORY } from "../../tools/ci/ci-verdict.mjs";

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

test("a deferred draft may publish a nonempty browser plan without running it", () => {
  const needs = { select: { result: "success", outputs: { any: "true" } }, selected: { result: "skipped" }, "selected-verdict": { result: "success" } };
  assert.equal(verdict(needs, { deferDraftBrowser: true }).ok, true);
  assert.equal(verdict(needs, { fullTier: true, deferDraftBrowser: true }).ok, false);
  assert.equal(verdict(needs).ok, false);
});

test("a failed or cancelled needed job fails the aggregator", () => {
  assert.equal(verdict({ guards: { result: "failure" } }).ok, false);
  assert.equal(verdict({ smoke: { result: "cancelled" } }).ok, false);
  assert.match(verdict({ smoke: { result: "cancelled" } }).bad[0], /cancelled/);
});

test("a green selected-verdict cannot waive a cancelled selected job", () => {
  const v = verdict({
    selected: { result: "cancelled" },
    "selected-verdict": { result: "success" },
    guards: { result: "success" },
  });
  assert.equal(v.ok, false);
  assert.ok(v.bad.some((s) => /selected: cancelled/.test(s)));
});

test("selected cancelled still fails when selected-verdict also failed", () => {
  const v = verdict({
    selected: { result: "cancelled" },
    "selected-verdict": { result: "failure" },
  });
  assert.equal(v.ok, false);
  assert.ok(v.bad.some((b) => /selected-verdict/.test(b)));
});

test("baseline-trial is blocking: failure fails CI", () => {
  assert.ok(!ADVISORY.has("baseline-trial"));
  const v = verdict({
    guards: { result: "success" },
    "baseline-trial": { result: "failure" },
  });
  assert.equal(v.ok, false);
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

// CV1 — an aggregator handed nothing must not read as green.
test("an empty needs payload, or one with no success at all, fails", () => {
  assert.equal(verdict({}).ok, false);
  assert.match(verdict({}).bad[0], /empty/);
  assert.equal(verdict(null).ok, false);
  assert.equal(verdict([]).ok, false);
  const allSkipped = verdict({ guards: { result: "skipped" }, smoke: { result: "skipped" }, "selected-verdict": { result: "skipped" } });
  assert.equal(allSkipped.ok, false);
  assert.match(allSkipped.bad[0], /no needed job succeeded/);
  // A baseline success is a real verification now.
  assert.equal(verdict({ "baseline-trial": { result: "success" } }).ok, true);
  // one real success among skips is still fine (path-filtered jobs)
  assert.equal(verdict({ guards: { result: "success" }, smoke: { result: "skipped" } }).ok, true);
});

test("CLI exits 2 when NEEDS is unset, empty or {} and 1 when everything was skipped", () => {
  const run = (env) => {
    const e = { ...process.env, ...env };
    if (env.NEEDS === undefined) delete e.NEEDS;
    try {
      execFileSync("node", ["tools/ci/ci-verdict.mjs", "--json"], { cwd: ROOT, encoding: "utf8", env: e, stdio: "pipe" });
      return 0;
    } catch (err) { return err.status; }
  };
  assert.equal(run({}), 2, "NEEDS unset");
  assert.equal(run({ NEEDS: "" }), 2, "NEEDS empty");
  assert.equal(run({ NEEDS: "{}" }), 2, "NEEDS {}");
  assert.equal(run({ NEEDS: JSON.stringify({ guards: { result: "skipped" }, smoke: { result: "skipped" } }) }), 1, "all skipped");
  assert.equal(run({ NEEDS: JSON.stringify({ guards: { result: "success" } }) }), 0);
});

// #2664: a job skipped by `if:` reports success, so a hollow full-tier run could read green.
test("REQUIRE_SUCCESS: a required job that was skipped or missing fails the aggregator; others may still skip", () => {
  const needs = { "guards-a": { result: "success" }, guards: { result: "success" }, select: { result: "success" }, smoke: { result: "skipped" }, "driving-model": { result: "skipped" } };
  assert.equal(verdict(needs).ok, true, "without a requirement a skip is a pass (draft fast tier)");
  const strict = verdict(needs, { require: ["guards-a", "guards", "select", "smoke"] });
  assert.equal(strict.ok, false);
  assert.deepEqual(strict.bad, ["smoke: required to succeed on a full-tier run, got skipped"]);
  assert.match(verdict(needs, { require: ["nope"] }).bad[0], /nope: required .* got missing/);
  assert.equal(verdict({ ...needs, smoke: { result: "success" } }, { require: ["smoke", "select"] }).ok, true, "driving-model may skip on the full tier");
});

test("the CLI reads REQUIRE_SUCCESS: the same needs JSON passes bare and fails strict (a replayed hollow draft-tier run)", () => {
  // shape of a real draft fast-tier run (run 39026875787: 8 jobs ran, smoke / sweeps / node-suites skipped)
  const needs = JSON.stringify({ "guards-a": { result: "success" }, "guards-b": { result: "success" }, "guards-c": { result: "success" }, guards: { result: "success" }, select: { result: "success" },
    smoke: { result: "skipped" }, sweeps: { result: "skipped" }, "node-suites": { result: "skipped" }, "selected-verdict": { result: "success" } });
  const run = (extra) => {
    try { execFileSync("node", ["tools/ci/ci-verdict.mjs"], { cwd: ROOT, env: { ...process.env, NEEDS: needs, ...extra }, stdio: "pipe" }); return 0; }
    catch (e) { return e.status; }
  };
  assert.equal(run({}), 0);
  assert.equal(run({ REQUIRE_SUCCESS: "guards-a,guards-b,guards-c,guards,select,smoke" }), 1);
});

test("only an explicit ready browser exemption permits skipped smoke and staged boot", () => {
  const passed = { result: "success" }, skipped = { result: "skipped" };
  const base = { select: { ...passed, outputs: { browser_exempt: "true" } }, guards: passed, smoke: skipped, "staged-boot": skipped };
  const run = (needs) => {
    const env = { ...process.env, NEEDS: JSON.stringify(needs), REQUIRE_SUCCESS: "select,guards,smoke,staged-boot" };
    try { execFileSync("node", ["tools/ci/ci-verdict.mjs"], { cwd: ROOT, env, stdio: "pipe" }); return 0; }
    catch (e) { return e.status; }
  };
  assert.equal(run(base), 0);
  for (const browser_exempt of [undefined, "false", "unknown"])
    assert.equal(run({ ...base, select: { ...passed, outputs: { browser_exempt } } }), 1);
  assert.equal(run({ ...base, guards: skipped }), 1);
  assert.equal(run({ ...base, smoke: undefined }), 1);
  assert.equal(run({ ...base, "staged-boot": { result: "cancelled" } }), 1);
  assert.equal(run({ ...base, select: { ...base.select, result: "failure" } }), 1);
});

test("ci.yml wiring (#2664): REQUIRE_SUCCESS only on a non-draft PR run, naming jobs ci-verdict needs; the draft fast tier is not named `CI`", async () => {
  const fs = await import("node:fs");
  const wf = fs.readFileSync(path.join(ROOT, ".github/workflows/ci.yml"), "utf8");
  const body = wf.split("\n  ci-verdict:\n")[1];
  const m = /REQUIRE_SUCCESS: \$\{\{ \(github\.event_name == 'pull_request' && !github\.event\.pull_request\.draft\) && '([^']+)' \|\| '' \}\}/.exec(body);
  assert.ok(m, "REQUIRE_SUCCESS must be set only when the run is a non-draft pull_request");
  const needs = body.split("needs:")[1].split("if:")[0];
  for (const j of m[1].split(",")) assert.match(needs, new RegExp(`- ${j}\\b`), `required job ${j} must be in ci-verdict's needs`);
  // #5403 part 1: a skipped selected-verdict (the selected gate's own verdict) must red a full-tier run.
  assert.deepEqual(m[1].split(","), ["guards-a", "guards-b", "guards-c", "guards-d", "guards", "select", "selected-verdict", "smoke", "staged-boot"]);
  assert.match(body, /'CI \(draft fast tier\)' \|\| 'CI' \}\}/, "a draft run's success must not carry the required name");
});

// #3507: a green CI must say which jobs executed and which were skipped.
test("summary lists executed vs skipped jobs and names the required set", () => {
  const needs = { guards: { result: "success" }, smoke: { result: "success" }, "node-suites": { result: "skipped" }, sweeps: { result: "skipped" } };
  const md = summary(verdict(needs, { require: ["guards", "smoke"] }), ["guards", "smoke"]);
  assert.ok(/Executed and passed \(2\):\*\* `guards`, `smoke`/.test(md));
  assert.ok(/NOT verified by this run:\*\* `node-suites`, `sweeps`/.test(md));
  assert.ok(/Required to have run \(2\)/.test(md));
  const red = summary(verdict({ ...needs, smoke: { result: "skipped" } }, { require: ["guards", "smoke"] }), ["guards", "smoke"]);
  assert.ok(/FAIL/.test(red));
  assert.ok(/smoke: required to succeed/.test(red));
});

// ---- #5241 G5 ----
import { rerunVerdict } from "../../tools/ci/ci-verdict.mjs";
test("nightly schedule NEEDS: a successful select with selected-verdict judging the plan passes ci-verdict", () => {
  const nightly = {
    guards: { result: "success" },
    select: { result: "success", outputs: { any: "true", reason: "infra", plan_reason: "all" } },
    selected: { result: "success" },
    "selected-verdict": { result: "success" },
    smoke: { result: "skipped" },
  };
  const v = verdict(nightly);
  assert.equal(v.ok, true);
  assert.deepEqual(v.bad, []);
});

test("push and pull_request: skipped selected-verdict after a successful select still fails closed (#5459)", () => {
  const needs = {
    guards: { result: "success" },
    select: { result: "success", outputs: { any: "true", reason: "infra" } },
    selected: { result: "success" },
    "selected-verdict": { result: "skipped" },
  };
  const v = verdict(needs);
  assert.equal(v.ok, false);
  assert.ok(v.bad.some((b) => /selected-verdict: skipped after a successful selection/.test(b)));
});

test("#5241 G5: a plan that said run and a job that skipped is not green", () => {
  const ok = { guards: { result: "success" }, select: { result: "success", outputs: { any: "true", any_node: "true" } },
    selected: { result: "success" }, "selected-verdict": { result: "success" }, "node-suites": { result: "success" } };
  assert.equal(verdict(ok, { fullTier: true }).ok, true);
  // the issue's crafted input: all three skipped was {"ok":true}
  const hollow = { ...ok, selected: { result: "skipped" }, "selected-verdict": { result: "skipped" }, "node-suites": { result: "skipped" } };
  const v = verdict(hollow, { fullTier: true });
  assert.equal(v.ok, false);
  assert.equal(v.bad.length, 3);
  assert.equal(verdict({ ...ok, "node-suites": { result: "skipped" } }).ok, true, "a draft / the train skips node-suites by design");
  assert.equal(verdict({ ...ok, "node-suites": { result: "skipped" } }, { fullTier: true }).ok, false);
  const empty = { ...ok, select: { result: "success", outputs: { any: "false", any_node: "false" } }, selected: { result: "skipped" }, "node-suites": { result: "skipped" } };
  assert.equal(verdict(empty, { fullTier: true }).ok, true, "an empty plan still skips legitimately; selected-verdict judges it");
});
test("#5241 G5: a CI green that needed a re-run is not ok until the PR names it (#5190, run 42730286157 attempt 2)", () => {
  assert.equal(rerunVerdict({ attempt: 1 }).ok, true);
  const r = rerunVerdict({ attempt: 2, previous: "failure", body: "## Plan\n- [x] done" });
  assert.equal(r.ok, false);
  assert.match(r.evidence, /rule 9/);
  assert.equal(rerunVerdict({ attempt: 2, previous: "", body: "" }).ok, false, "an unread previous attempt fails closed");
  assert.equal(rerunVerdict({ attempt: 2, previous: "cancelled" }).ok, true, "the designed dedupe is not a re-run of a red");
  assert.equal(rerunVerdict({ attempt: 2, previous: "failure", body: "## Verified\n- re-run: perf-hot-bench.test.mjs — runner noise, quarantined" }).ok, true);
  assert.equal(rerunVerdict({ attempt: 2, previous: "failure", body: "<!-- re-run: hidden -->" }).ok, false, "a comment names nothing");
});
