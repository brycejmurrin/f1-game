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

// Run a step's shell with a fake `gh` on PATH that records its argv, refuses `pr create` when told to,
// and answers `issue list` with ISSUE_ROW: the step's BEHAVIOUR, not its text.
function runWithFakeGh(script, { refusePr, env = {} }) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "fake-gh-"));
  try {
    const log = path.join(dir, "gh.log");
    // One log line per call: a multi-line --body (#5520's template) is logged with its newlines escaped.
    fs.writeFileSync(path.join(dir, "gh"), `#!/usr/bin/env bash
line="GH_TOKEN=$GH_TOKEN $*"; printf '%s\\n' "\${line//$'\\n'/\\\\n}" >> "${log}"
case "$1 $2" in
  "pr create") ${refusePr ? 'echo "pull request create failed: GraphQL: GitHub Actions is not permitted to create or approve pull requests (createPullRequest)" >&2; exit 1' : "exit 0"} ;;
  "issue list") printf '%s' "$ISSUE_ROW"; exit 0 ;;
esac
exit 0
`, { mode: 0o755 });
    const r = spawnSync("bash", ["-c", `set -euo pipefail\n${script}`], { cwd: dir, encoding: "utf8",
      env: { ...process.env, PATH: `${dir}:${process.env.PATH}`, GITHUB_REPOSITORY: "o/r", GITHUB_SERVER_URL: "https://x", GITHUB_RUN_ID: "1",
        RUNNER_TEMP: dir, GIT_DIR: path.join(ROOT, ".git"), GITHUB_WORKSPACE: ROOT, ISSUE_ROW: "", PR_TOKEN: "", GH_TOKEN: "default", ...env } });
    const calls = fs.existsSync(log) ? fs.readFileSync(log, "utf8").trim().split("\n") : [];
    return { code: r.status, calls, out: r.stdout + r.stderr };
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
}
const verbsOf = (calls) => calls.map((c) => c.split(" ").slice(1, 3).join(" "));

test("fold workflows open their PR through open-bot-pr with LAND_TOKEN, after pushing the branch", () => {
  for (const [f, job, step, branch] of [
    ["ratchets-fold.yml", "fold", "Fold", "$FOLD_BRANCH"],
    ["changelog-fold.yml", "fold", "Fold", "bot/changelog-fold"],
    ["knowledge-gc.yml", "gc", "Archive stale notes and push the branch", "$GC_BRANCH"],
  ]) {
    const w = wf(f);
    assert.equal(w.permissions.issues, "write", `${f}: the refusal issue needs issues: write`);
    const steps = w.jobs[job].steps;
    const push = steps.find((st) => st.name === step);
    assert.ok(push.run.includes(`echo "branch=${branch}"`), `${f}: the push step names its branch as an output`);
    assert.doesNotMatch(push.run, /gh pr create/, `${f}: the PR opens in the shared action only`);
    const open = steps.find((st) => st.name === "Open the PR");
    assert.equal(open.uses, "./.github/actions/open-bot-pr");
    assert.equal(open.with["pr-token"], "${{ secrets.LAND_TOKEN }}", `${f}: the default token may not create PRs here (#5177)`);
    assert.equal(open.with.branch, `\${{ steps.${push.id}.outputs.branch }}`);
    assert.doesNotMatch(open.with["issue-title"], /run_id|RUN_ID|\$/, `${f}: a stable issue title, so one issue collects every refusal`);
    assert.equal(w.jobs[job].environment.name, "land");
  }
});

test("open-bot-pr: a refusal fails, dispatches CI and opens ONE issue; it re-pings only after a day", () => {
  const action = YAML.parse(fs.readFileSync(path.join(ROOT, ".github/actions/open-bot-pr/action.yml"), "utf8"));
  const run = action.runs.steps[0].run;
  const base = { BRANCH: "bot/x", PR_TITLE: "t", PR_BODY: "b", ISSUE_TITLE: "fold PR needs a hand (bot/x)", WHAT: "x fold" };
  const refused = runWithFakeGh(run, { refusePr: true, env: base });
  assert.equal(refused.code, 1, `a refused PR ends the job red\n${refused.out}`);
  assert.deepEqual(verbsOf(refused.calls), ["pr create", "workflow run", "issue list", "issue create"], refused.calls.join(" | "));
  assert.ok(refused.calls[3].includes("fold PR needs a hand (bot/x)"), refused.calls[3]);
  const old = new Date(Date.now() - 2 * 86400e3).toISOString(), fresh = new Date(Date.now() - 3600e3).toISOString();
  const stale = runWithFakeGh(run, { refusePr: true, env: { ...base, ISSUE_ROW: `42 ${old}` } });
  assert.equal(stale.code, 1);
  assert.deepEqual(verbsOf(stale.calls), ["pr create", "workflow run", "issue list", "issue comment"], "an issue older than a day is re-pinged");
  const quiet = runWithFakeGh(run, { refusePr: true, env: { ...base, ISSUE_ROW: `42 ${fresh}` } });
  assert.equal(quiet.code, 1);
  assert.deepEqual(verbsOf(quiet.calls), ["pr create", "workflow run", "issue list"], "an issue updated within the day is left alone");
  const ok = runWithFakeGh(run, { refusePr: false, env: base });
  assert.equal(ok.code, 0, ok.out);
  assert.deepEqual(verbsOf(ok.calls), ["pr create", "workflow run"], "a default-token PR starts no CI, so CI is dispatched");
  const land = runWithFakeGh(run, { refusePr: false, env: { ...base, PR_TOKEN: "pat" } });
  assert.equal(land.code, 0, land.out);
  assert.equal(land.calls.length, 1, "a LAND_TOKEN PR starts its own CI: no dispatch");
  assert.ok(land.calls[0].startsWith("GH_TOKEN=pat pr create --repo o/r --base claude/f1-game-project-26h3ng --head bot/x --title t --body "), land.calls[0]);
  // #5520: the one-line body is wrapped in the template (tests/unit/bot-pr-body.test.mjs runs it through the gate's parser).
  assert.ok(land.calls.join("\n").includes("## Plan"), "the PR opens with the template body");
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
