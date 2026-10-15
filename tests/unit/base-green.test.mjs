// base-green.test.mjs — the one question the delta gate asks on a deploy push.
//
// tools/ci/base-green.sh says whether a sha was gated green (a completed,
// successful ci.yml or pages.yml run on that exact head_sha). Only `green`
// may narrow the node plan or the sweeps on a push: `red` and `unknown` run
// everything. Exercised against a fake `gh` on PATH, so every branch of the
// verdict is driven by a fixture rather than trusted.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const SCRIPT = path.join(ROOT, "tools/ci/base-green.sh");
const SHA = "0123456789abcdef0123456789abcdef01234567";

/** Run the script with a fake `gh` that prints `body` (or exits 1 when null). */
function run(body, sha = SHA, extraEnv = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "apex-base-green-"));
  try {
    const gh = path.join(dir, "gh");
    fs.writeFileSync(gh, body === null ? "#!/usr/bin/env bash\nexit 1\n" : `#!/usr/bin/env bash\ncat <<'EOF'\n${body}\nEOF\n`);
    fs.chmodSync(gh, 0o755);
    const r = spawnSync("bash", [SCRIPT, sha], {
      cwd: ROOT, encoding: "utf8",
      env: { ...process.env, PATH: `${dir}:${process.env.PATH}`, GITHUB_REPOSITORY: "o/r", GH_TOKEN: "x", ...extraEnv },
    });
    return { out: r.stdout.trim(), err: r.stderr, status: r.status };
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
}
const runs = (...rows) => JSON.stringify({ workflow_runs: rows.map(([path, status, conclusion]) => ({ path, status, conclusion })) });

test("green: a completed successful ci.yml or pages.yml run on the sha", () => {
  assert.equal(run(runs([".github/workflows/ci.yml", "completed", "success"])).out, "green");
  assert.equal(run(runs([".github/workflows/ci.yml", "completed", "failure"], [".github/workflows/pages.yml", "completed", "success"])).out, "green",
    "a later deploy of the same sha is a gate too");
});

test("red: runs exist, none succeeded — including a run of another workflow succeeding", () => {
  assert.equal(run(runs([".github/workflows/ci.yml", "completed", "failure"])).out, "red");
  assert.equal(run(runs([".github/workflows/ci.yml", "completed", "cancelled"], [".github/workflows/docs-guards.yml", "completed", "success"])).out, "red",
    "docs-guards is not the gate");
});

test("unknown: no gate run yet, an in-progress one, an API error, a bad body, no sha, no gh", () => {
  assert.equal(run(runs()).out, "unknown");
  assert.equal(run(runs([".github/workflows/ci.yml", "in_progress", null])).out, "unknown");
  assert.equal(run(null).out, "unknown", "API failure");
  assert.equal(run("not json").out, "unknown");
  assert.equal(run(runs([".github/workflows/ci.yml", "completed", "success"]), "").out, "unknown", "empty sha");
  assert.equal(run(runs([".github/workflows/ci.yml", "completed", "success"]), "0000000000000000000000000000000000000000").out, "unknown", "the null sha of a first push");
  const r = spawnSync("/bin/bash", [SCRIPT, SHA], { cwd: ROOT, encoding: "utf8", env: { PATH: "/nonexistent", GITHUB_REPOSITORY: "o/r" } });
  assert.equal(r.stdout.trim(), "unknown", "no gh on PATH");
  assert.equal(r.status, 0, "advisory: never a non-zero exit");
});

test("ci.yml: only `green` narrows the node plan and the sweeps on a push; the train and a PR need no lookup", () => {
  const ci = fs.readFileSync(path.join(ROOT, ".github/workflows/ci.yml"), "utf8");
  const plan = ci.slice(ci.indexOf("- name: Plan the slices for this diff"), ci.indexOf("- name: Pure-node unit suites"));
  assert.match(plan, /if \[ "\$\(bash tools\/ci\/base-green\.sh "\$\{PUSH_BEFORE:-\}"\)" = green \]; then\n\s+BASE="\$\{PUSH_BEFORE:-\}"/, "a push scopes only on a green previous tip");
  assert.match(plan, /if \[ "\$CALLED" = "true" \]; then\n\s+BASE="\$\{LIVE_BEFORE:-\}"/, "the train's base is the live commit, no lookup");
  assert.match(plan, /GH_TOKEN: \$\{\{ github\.token \}\}/);
  const nodeJob = ci.slice(ci.indexOf("\n  node-suites:\n"), ci.indexOf("\n  sweeps-parts:\n"));
  assert.match(nodeJob, /permissions:\n\s+contents: read\n\s+actions: read/, "base-green needs actions:read");
  // The sweeps job sits out the deploy push (its `if:`), so its circuit lane
  // needs no lookup: a pull request, or the train whose before_sha is live.
  const sweeps = ci.slice(ci.indexOf("\n  sweeps:\n"), ci.indexOf("\n  ship-filter:\n"));
  assert.match(sweeps, /if \[ "\$CALLED" = true \] \|\| \[ "\$EVENT" = pull_request \]; then SCOPE_OK=true; fi/);
  assert.doesNotMatch(sweeps, /bash tools\/ci\/base-green\.sh/, "the sweeps job never runs on a push; no lookup there");
});
