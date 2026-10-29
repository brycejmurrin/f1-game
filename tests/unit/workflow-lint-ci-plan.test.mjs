/* workflow-lint-ci-plan.test.mjs — structural facts about .github/workflows/ci.yml, read from the PARSED YAML
 * (jobs → steps by name) rather than sliced out of the file text. Moved from base-green.test.mjs and
 * behind-ship.test.mjs, which sliced ci.yml between step-name strings (findings T1-08).
 *
 * Run: node --test tests/unit/workflow-lint-ci-plan.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import YAML from "yaml";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const CI = YAML.parse(fs.readFileSync(path.join(ROOT, ".github/workflows/ci.yml"), "utf8"));

const job = (id) => {
  assert.ok(CI.jobs[id], `ci.yml has job ${id}`);
  return CI.jobs[id];
};
const step = (jobId, name) => {
  const s = job(jobId).steps.find((x) => x.name === name);
  assert.ok(s, `ci.yml job ${jobId} has step "${name}"`);
  return s;
};

test("ci.yml: only `green` narrows the node plan on a push; the train and a PR need no lookup", () => {
  const plan = step("node-suites", "Plan the slices for this diff");
  assert.match(plan.run, /if \[ "\$\(bash tools\/ci\/base-green\.sh "\$\{PUSH_BEFORE:-\}"\)" = green \]; then\n\s+BASE="\$\{PUSH_BEFORE:-\}"/, "a push scopes only on a green previous tip");
  assert.match(plan.run, /if \[ "\$CALLED" = "true" \]; then\n\s+BASE="\$\{LIVE_BEFORE:-\}"/, "the train's base is the live commit, no lookup");
  assert.ok(plan.env.GH_TOKEN, "the plan step gets GH_TOKEN for base-green");
  assert.match(plan.env.GH_TOKEN, /github\.token/);
  assert.equal(job("node-suites").permissions.actions, "read", "base-green needs actions:read");
  assert.equal(job("node-suites").permissions.contents, "read");
});

test("ci.yml: the sweeps filter's circuit lane needs no base-green lookup", () => {
  // The sweeps job sits out the deploy push, so its circuit lane needs no lookup:
  // a pull request, or the train whose before_sha is live.
  const geo = step("select", "Does this diff touch the geometry?");
  assert.match(geo.run, /if \[ "\$CALLED" = true \] \|\| \[ "\$EVENT" = pull_request \]; then SCOPE_OK=true; fi/);
  assert.doesNotMatch(geo.run, /bash tools\/ci\/base-green\.sh/, "the geometry filter never looks up a base verdict");
});

test("ci.yml: behind-ship is a non-blocking PR-only step in the structural guards job", () => {
  const s = step("guards-b", "How far behind ship?");
  assert.match(s.run, /node tools\/ci\/behind-ship\.mjs/, "Structural guards (tooling B) must run behind-ship.mjs");
  assert.match(s.if, /github\.event_name == 'pull_request'/, "behind-ship is PR-only (ship-push already IS ship)");
  assert.notEqual(s["continue-on-error"], true,
    "do not paper over a real step failure with continue-on-error; the tool itself exits 0");
  assert.doesNotMatch(s.run, /::error/);
});

const wf = (f) => YAML.parse(fs.readFileSync(path.join(ROOT, ".github/workflows", f), "utf8"));

// Run a workflow's shell with a fake `gh` on PATH that records its argv and
// refuses `pr create` when told to: the step's BEHAVIOUR, not its text.
function runWithFakeGh(script, { refusePr, env = {} }) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "fake-gh-"));
  try {
    const log = path.join(dir, "gh.log");
    fs.writeFileSync(path.join(dir, "gh"), `#!/bin/sh
echo "$*" >> "${log}"
case "$1 $2" in
  "pr create") ${refusePr ? 'echo "pull request create failed: GraphQL: GitHub Actions is not permitted to create or approve pull requests (createPullRequest)" >&2; exit 1' : "exit 0"} ;;
  "issue list") exit 0 ;;
esac
exit 0
`, { mode: 0o755 });
    const r = spawnSync("bash", ["-c", `set -euo pipefail\n${script}`], { cwd: dir, encoding: "utf8",
      env: { ...process.env, PATH: `${dir}:${process.env.PATH}`, GITHUB_REPOSITORY: "o/r", GITHUB_SERVER_URL: "https://x", GITHUB_RUN_ID: "1", GIT_DIR: path.join(ROOT, ".git"), ...env } });
    const calls = fs.existsSync(log) ? fs.readFileSync(log, "utf8").trim().split("\n") : [];
    return { code: r.status, calls, out: r.stdout + r.stderr };
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
}

test("fold workflows FAIL when gh pr create is refused, and open one issue instead of a warning (audit3 #5)", () => {
  for (const [f, branch, extraEnv] of [
    ["ratchets-fold.yml", "bot/ratchets-fold-1", { FOLD_BRANCH: "bot/ratchets-fold-1" }],
    ["changelog-fold.yml", "bot/changelog-fold", {}],
  ]) {
    const w = wf(f);
    assert.equal(w.permissions.issues, "write", `${f}: the refusal issue needs issues: write`);
    const run = w.jobs.fold.steps.find((st) => st.name === "Fold").run;
    const at = run.indexOf("PR_TITLE=");
    assert.ok(at > 0, `${f}: the PR block starts at PR_TITLE=`);
    const tail = run.slice(at);
    const refused = runWithFakeGh(`echo folded > fold.log\n${tail}`, { refusePr: true, env: extraEnv });
    assert.equal(refused.code, 1, `${f}: a refused PR ends the job red\n${refused.out}`);
    const verbs = refused.calls.map((c) => c.split(" ").slice(0, 2).join(" "));
    assert.deepEqual(verbs, ["pr create", "workflow run", "issue list", "issue create"],
      `${f}: PR attempt, the branch's CI still dispatched, then ONE issue (${refused.calls.join(" | ")})`);
    assert.ok(refused.calls[3].includes(`fold PR needs a hand (${branch})`), refused.calls[3]);
    const ok = runWithFakeGh(`echo folded > fold.log\n${tail}`, { refusePr: false, env: extraEnv });
    assert.equal(ok.code, 0, `${f}: an opened PR ends green\n${ok.out}`);
    assert.deepEqual(ok.calls.map((c) => c.split(" ").slice(0, 2).join(" ")), ["pr create", "workflow run"]);
  }
});

test("selected-verdict reds a PR on a touched js dir with no coverage; the train only warns (ci-7d C7)", () => {
  assert.equal(job("select").outputs.coverage_gaps, "${{ steps.gaps.outputs.coverage_gaps }}");
  const gate = step("selected-verdict", "Every touched js dir has coverage");
  assert.equal(gate.env.GAPS, "${{ needs.select.outputs.coverage_gaps }}");
  const at = (GAPS, CALLED) => spawnSync("bash", ["-c", gate.run], { encoding: "utf8", env: { ...process.env, GAPS, CALLED } }).status;
  assert.equal(at("", "false"), 0, "no gap, no red");
  assert.equal(at("js/lonely", "false"), 1, "a PR with an uncovered js dir is red");
  assert.equal(at("js/lonely", "true"), 0, "the train warns only");
});
