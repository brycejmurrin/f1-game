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
  const needs = JSON.stringify({ "guards-a": { result: "success" }, "guards-b": { result: "success" }, guards: { result: "success" }, select: { result: "success" },
    smoke: { result: "skipped" }, sweeps: { result: "skipped" }, "node-suites": { result: "skipped" }, "selected-verdict": { result: "success" } });
  const run = (extra) => {
    try { execFileSync("node", ["tools/ci/ci-verdict.mjs"], { cwd: ROOT, env: { ...process.env, NEEDS: needs, ...extra }, stdio: "pipe" }); return 0; }
    catch (e) { return e.status; }
  };
  assert.equal(run({}), 0);
  assert.equal(run({ REQUIRE_SUCCESS: "guards-a,guards-b,guards,select,smoke" }), 1);
});

test("ci.yml wiring (#2664): REQUIRE_SUCCESS only on a non-draft PR run, naming jobs ci-verdict needs; the draft fast tier is not named `CI`", async () => {
  const fs = await import("node:fs");
  const wf = fs.readFileSync(path.join(ROOT, ".github/workflows/ci.yml"), "utf8");
  const body = wf.split("\n  ci-verdict:\n")[1];
  const m = /REQUIRE_SUCCESS: \$\{\{ \(github\.event_name == 'pull_request' && !github\.event\.pull_request\.draft\) && '([^']+)' \|\| '' \}\}/.exec(body);
  assert.ok(m, "REQUIRE_SUCCESS must be set only when the run is a non-draft pull_request");
  const needs = body.split("needs:")[1].split("if:")[0];
  for (const j of m[1].split(",")) assert.match(needs, new RegExp(`- ${j}\\b`), `required job ${j} must be in ci-verdict's needs`);
  assert.match(body, /'CI \(draft fast tier\)' \|\| 'CI' \}\}/, "a draft run's success must not carry the required name");
});
