// needs-sync — the predicate behind "sync only when you must" (sync-pr.mjs, pr-board.mjs).
import "../helpers/git-fixture-env.mjs";
import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { decideSync, needsSync, exitCode, verdictLine, VERDICTS, gateRetestRefusal, gateMergeRefusal, unionTextConflicts, mergeCrossing } from "../../tools/ci/needs-sync.mjs";
import { mkTmpDir } from "../helpers/tmp-dir.mjs";

const T0 = "2026-10-16T08:00:00Z", T1 = "2026-10-16T09:00:00Z";

test("decideSync: up to date is no, even with a red", () => {
  assert.equal(decideSync({ behind: false, conflict: false, ci: "failure" }).verdict, "no");
});
test("decideSync: a conflict wins over everything", () => {
  assert.equal(decideSync({ behind: true, conflict: true, ci: "success" }).verdict, "conflict");
});
test("decideSync: red + tip moved after the run = stale-red", () => {
  assert.equal(decideSync({ behind: true, conflict: false, ci: "failure", runStartedAt: T0, tipNewestAt: T1 }).verdict, "stale-red");
});
test("decideSync: red but the tip is older than the run = no (the red is the branch's own)", () => {
  assert.equal(decideSync({ behind: true, conflict: false, ci: "failure", runStartedAt: T1, tipNewestAt: T0 }).verdict, "no");
});
test("decideSync: clean-behind green / running / unknown / none = no", () => {
  for (const ci of ["success", "in_progress", "queued", "unknown", "none", "cancelled"]) {
    assert.equal(decideSync({ behind: true, conflict: false, ci, runStartedAt: T0, tipNewestAt: T1 }).verdict, "no", ci);
  }
});
test("decideSync: a stray `distance` fact changes nothing (the verdict went with merge-gate's distance row, 2026-11-03)", () => {
  assert.equal(decideSync({ behind: true, conflict: false, ci: "success", runStartedAt: T0, tipNewestAt: T1, distance: true }).verdict, "no");
  assert.equal(decideSync({ behind: true, conflict: true, ci: "success", distance: true }).verdict, "conflict");
});
test("exit codes and verdict line", () => {
  assert.deepEqual(VERDICTS, ["conflict", "union-conflict", "stale-red", "retest-refused", "gate-refused", "tip-crossed", "tip-red", "no"]);
  assert.equal(exitCode({ ok: true, verdict: "tip-crossed" }), 0, "tip-crossed is a sync");
  assert.equal(exitCode({ ok: true, verdict: "gate-refused" }), 0, "gate-refused is a sync");
  assert.equal(exitCode({ ok: true, verdict: "union-conflict" }), 0, "union-conflict is a sync");
  assert.equal(exitCode({ ok: true, verdict: "retest-refused" }), 0, "retest-refused is a sync");
  assert.equal(exitCode({ ok: true, verdict: "tip-red" }), 1, "tip-red is not a sync");
  assert.equal(exitCode({ ok: true, verdict: "conflict" }), 0);
  assert.equal(exitCode({ ok: true, verdict: "stale-red" }), 0);
  assert.equal(exitCode({ ok: true, verdict: "no" }), 1);
  assert.equal(exitCode({ ok: false }), 3);
  assert.equal(verdictLine({ verdict: "stale-red" }), "= sync needed: stale-red");
});

// A real repo: deploy tip D, branch B behind it.
function repo(tipEdit, branchEdit) {
  const dir = mkTmpDir("needs-sync-");
  const g = (...a) => { const r = spawnSync("git", a, { cwd: dir, encoding: "utf8" }); assert.equal(r.status, 0, r.stderr); return r.stdout.trim(); };
  g("init", "-q", "-b", "deploy"); g("config", "user.email", "t@t"); g("config", "user.name", "t");
  fs.writeFileSync(path.join(dir, "f.txt"), "base\n"); g("add", "."); g("commit", "-qm", "base");
  g("checkout", "-qb", "pr"); fs.writeFileSync(path.join(dir, branchEdit[0]), branchEdit[1]); g("add", "."); g("commit", "-qm", "pr");
  g("checkout", "-q", "deploy"); fs.writeFileSync(path.join(dir, tipEdit[0]), tipEdit[1]); g("add", "."); g("commit", "-qm", "tip");
  g("update-ref", "refs/remotes/origin/deploy", "deploy"); g("update-ref", "refs/remotes/origin/pr", "pr");
  return (args) => { const r = spawnSync("git", args, { cwd: dir, encoding: "utf8" }); return { code: r.status, out: (r.stdout || "").trim(), err: (r.stderr || "").trim() }; };
}
const DEPLOY = "claude/f1-game-project-26h3ng";
const alias = (readGit) => (args) => readGit(args.map((a) => a.replace(`origin/${DEPLOY}`, "origin/deploy")));

test("needsSync on a real repo: disjoint edits are clean-behind = no", () => {
  const v = needsSync("pr", { fetch: false, offline: true, readGit: alias(repo(["a.txt", "a\n"], ["b.txt", "b\n"])) });
  assert.equal(v.ok, true); assert.equal(v.behind, true); assert.equal(v.conflict, false); assert.equal(v.verdict, "no");
});
test("needsSync on a real repo: the same line edited twice = conflict", () => {
  const v = needsSync("pr", { fetch: false, offline: true, readGit: alias(repo(["f.txt", "tip\n"], ["f.txt", "pr\n"])) });
  assert.equal(v.conflict, true); assert.equal(v.verdict, "conflict");
});
test("needsSync: an unresolvable ref is an error, not a verdict", () => {
  const v = needsSync("nope", { fetch: false, offline: true, readGit: alias(repo(["a.txt", "a\n"], ["b.txt", "b\n"])) });
  assert.equal(v.ok, false);
});
test("needsSync: API failure degrades to a note, never a stale-red", () => {
  const v = needsSync("pr", { fetch: false, readGit: alias(repo(["a.txt", "a\n"], ["b.txt", "b\n"])), request: () => ({ error: "HTTP 403" }) });
  assert.equal(v.verdict, "no"); assert.match(v.note, /unreadable/);
});
test("needsSync: a green clean-behind head reads only the ci.yml runs and the deploy tip's pages.yml run (no `gate` status read since 2026-11-03) = no", () => {
  const calls = [];
  const request = (p) => { calls.push(p); return { json: { workflow_runs: [] } }; };
  const v = needsSync("pr", { fetch: false, readGit: alias(repo(["a.txt", "a\n"], ["b.txt", "b\n"])), request });
  assert.equal(v.verdict, "no");
  assert.equal(v.distance, undefined, "no distance fact is reported");
  assert.deepEqual([...new Set(calls.map((p) => p.split("/runs?")[0]))].sort(), ["actions/workflows/ci.yml", "actions/workflows/pages.yml"], calls.join(" "));
});
test("needsSync: red head + newer tip commit = stale-red via the injected API", () => {
  const request = () => ({ json: { workflow_runs: [{ id: 7, path: ".github/workflows/ci.yml", status: "completed", conclusion: "failure", run_started_at: "2000-01-01T00:00:00Z" }] } });
  const v = needsSync("pr", { fetch: false, readGit: alias(repo(["a.txt", "a\n"], ["b.txt", "b\n"])), request });
  assert.equal(v.verdict, "stale-red");
});

// #5425: tip-red — the deploy tip is red on code, so a sync would import the red.
const pagesRun = (id, conclusion) => ({ id, head_sha: "1421575aec6a36eb2390e4731d87887f713ad13f", status: "completed", conclusion });
const tipApi = (run, jobs) => (p) => p.startsWith("actions/workflows/pages.yml/runs") ? { json: { workflow_runs: run ? [run] : [] } }
  : p.startsWith(`actions/runs/${run?.id}/jobs`) ? { json: { jobs } } : { json: { workflow_runs: [] } };
test("decideSync: a code-red tip is tip-red, over conflict and stale-red; not behind stays no", () => {
  const tip = { state: "code-red", evidence: "pages.yml run 9 on abc concluded failure on code: failed job(s) `ci / CI`" };
  assert.equal(decideSync({ behind: true, conflict: false, ci: "success", tip }).verdict, "tip-red");
  assert.equal(decideSync({ behind: true, conflict: true, tip }).verdict, "tip-red", "a conflict sync would import the red too");
  assert.equal(decideSync({ behind: true, conflict: false, ci: "failure", runStartedAt: "2026-11-10T00:00:00Z", tipNewestAt: "2026-11-11T00:00:00Z", tip }).verdict, "tip-red");
  assert.equal(decideSync({ behind: true, conflict: false, tip }).why, tip.evidence + ": do not sync onto a red tip; wait for the fix to land");
  assert.equal(decideSync({ behind: false, conflict: false, tip }).verdict, "no");
  for (const state of ["green", "platform", "none"]) assert.equal(decideSync({ behind: true, conflict: false, ci: "success", tip: { state, evidence: "x" } }).verdict, "no", state);
});
test("needsSync: the deploy tip red in a spec leg = tip-red; a publish-only (platform) failure = no", () => {
  const rg = () => alias(repo(["a.txt", "a\n"], ["b.txt", "b\n"]));
  const spec = needsSync("pr", { fetch: false, readGit: rg(), request: tipApi(pagesRun(9, "failure"), [{ name: "ci / Selected specs (change-aware gate) (selected-1)", conclusion: "failure" }, { name: "deploy", conclusion: "skipped" }]) });
  assert.equal(spec.verdict, "tip-red");
  assert.equal(spec.why, "pages.yml run 9 on 1421575a concluded failure on code: failed job(s) `ci / Selected specs (change-aware gate) (selected-1)`: do not sync onto a red tip; wait for the fix to land");
  assert.equal(exitCode(spec), 1);
  const platform = needsSync("pr", { fetch: false, readGit: rg(), request: tipApi(pagesRun(42880431465, "failure"), [{ name: "ci / CI", conclusion: "success" },
    { name: "deploy", conclusion: "failure", steps: [{ name: "Publish to Pages (retry)", conclusion: "failure" }, { name: "Pages publish failed (platform)", conclusion: "failure" }, { name: "Deploy verdict", conclusion: "failure" }] }]) });
  assert.equal(platform.verdict, "no", "run 42880431465 failed only in publish");
  const unread = needsSync("pr", { fetch: false, readGit: rg(), request: (p) => p.startsWith("actions/workflows/pages.yml") ? { error: "HTTP 502" } : { json: { workflow_runs: [] } } });
  assert.equal(unread.verdict, "no");
  assert.equal(unread.note, "deploy tip state unreadable (pages.yml runs on " + DEPLOY + ": HTTP 502): tip-red cannot be detected");
  assert.equal(needsSync("pr", { fetch: false, offline: true, readGit: rg() }).deployTip, null, "offline reads no API");
});
// A `cancelled` newest run that already had a failed job was red before the cancel (2026-11-11 mirror outage).
test("decideSync: cancelled + 1 failed job + tip moved = stale-red, and the why names the case", () => {
  const d = decideSync({ behind: true, conflict: false, ci: "cancelled", failedJobs: 1, runStartedAt: T0, tipNewestAt: T1 });
  assert.equal(d.verdict, "stale-red"); assert.match(d.why, /ci cancelled after 1 failed job\(s\)/);
});
test("decideSync: cancelled + 0 failed jobs = no (rule 8: a timeout until proven otherwise)", () => {
  const d = decideSync({ behind: true, conflict: false, ci: "cancelled", failedJobs: 0, runStartedAt: T0, tipNewestAt: T1 });
  assert.equal(d.verdict, "no"); assert.match(d.why, /0 failed jobs: a timeout until proven otherwise/);
});
test("decideSync: cancelled + failed job but the tip has not moved = no", () => {
  const d = decideSync({ behind: true, conflict: false, ci: "cancelled", failedJobs: 2, runStartedAt: T1, tipNewestAt: T0 });
  assert.equal(d.verdict, "no"); assert.match(d.why, /ci cancelled after 2 failed job\(s\) but the tip has not moved/);
});
test("decideSync: a failed-job count on a non-cancelled run changes nothing", () => {
  assert.equal(decideSync({ behind: true, conflict: false, ci: "success", failedJobs: 3, runStartedAt: T0, tipNewestAt: T1 }).verdict, "no");
  const d = decideSync({ behind: true, conflict: false, ci: "failure", runStartedAt: T0, tipNewestAt: T1 });
  assert.equal(d.verdict, "stale-red"); assert.match(d.why, /^ci\.yml is red/);
});

const cancelledRun = { id: 9, path: ".github/workflows/ci.yml", status: "completed", conclusion: "cancelled", run_started_at: "2000-01-01T00:00:00Z" };
const jobsApi = (pages) => (p) => {
  if (p.startsWith("actions/workflows/ci.yml/runs")) return { json: { workflow_runs: [cancelledRun] } };
  if (p.startsWith("actions/workflows/pages.yml/runs")) return { json: { workflow_runs: [] } }; // the deploy tip: no run, not red
  const m = p.match(/^actions\/runs\/9\/jobs\?per_page=100&page=(\d+)$/);
  assert.ok(m, p);
  const page = pages[Number(m[1]) - 1];
  return page.error ? page : { json: { jobs: page } };
};
test("needsSync: cancelled head with a failed job (second page) + newer tip = stale-red", () => {
  const full = Array.from({ length: 100 }, (_, i) => ({ id: i, conclusion: "cancelled" }));
  const v = needsSync("pr", { fetch: false, readGit: alias(repo(["a.txt", "a\n"], ["b.txt", "b\n"])), request: jobsApi([full, [{ conclusion: "failure" }, { conclusion: "success" }]]) });
  assert.equal(v.verdict, "stale-red"); assert.equal(v.failedJobs, 1); assert.match(v.why, /cancelled after 1 failed job/);
});
test("needsSync: cancelled head with zero failed jobs = no", () => {
  const v = needsSync("pr", { fetch: false, readGit: alias(repo(["a.txt", "a\n"], ["b.txt", "b\n"])), request: jobsApi([[{ conclusion: "cancelled" }, { conclusion: "success" }]]) });
  assert.equal(v.verdict, "no"); assert.equal(v.failedJobs, 0); assert.match(v.why, /rule 8/);
});
test("needsSync: a jobs read error keeps `no` and says why", () => {
  const v = needsSync("pr", { fetch: false, readGit: alias(repo(["a.txt", "a\n"], ["b.txt", "b\n"])), request: jobsApi([{ error: "HTTP 502" }]) });
  assert.equal(v.verdict, "no"); assert.match(v.why, /jobs are unreadable \(HTTP 502\)/); assert.match(v.note, /unreadable/);
});

// A green only on run_attempt > 1 after a red attempt: merge-gate's ci row refuses it, so needs-sync calls it red.
test("decideSync: retried green after a failed job + tip moved = stale-red, and the why names the attempt", () => {
  const d = decideSync({ behind: true, conflict: false, ci: "success", attempt: 2, retryFailedJobs: 3, runStartedAt: T0, tipNewestAt: T1 });
  assert.equal(d.verdict, "stale-red"); assert.equal(d.why, "ci green only on attempt 2 after 3 failed job(s) on the head and the tip has moved since that run started");
});
test("decideSync: retried green after a failed job but the tip has not moved = no", () => {
  const d = decideSync({ behind: true, conflict: false, ci: "success", attempt: 2, retryFailedJobs: 1, runStartedAt: T1, tipNewestAt: T0 });
  assert.equal(d.verdict, "no"); assert.equal(d.why, "behind with no conflict (ci green only on attempt 2 after 1 failed job(s) but the tip has not moved since): clean-behind is not a reason");
});
test("decideSync: retried green after a cancel-only attempt = no", () => {
  const d = decideSync({ behind: true, conflict: false, ci: "success", attempt: 2, retryFailedJobs: 0, runStartedAt: T0, tipNewestAt: T1 });
  assert.equal(d.verdict, "no"); assert.equal(d.why, "behind with no conflict (ci success on attempt 2; earlier attempts had no failed job): clean-behind is not a reason");
});
test("decideSync: first-attempt green = no (a stray retry count is ignored)", () => {
  assert.equal(decideSync({ behind: true, conflict: false, ci: "success", attempt: 1, retryFailedJobs: 5, runStartedAt: T0, tipNewestAt: T1 }).verdict, "no");
});

const retriedRun = { id: 11, path: ".github/workflows/ci.yml", status: "completed", conclusion: "success", run_attempt: 3, run_started_at: "2000-01-01T00:00:00Z" };
const attemptsApi = (byAttempt, calls = []) => (p) => {
  if (p.startsWith("actions/workflows/pages.yml/runs")) return { json: { workflow_runs: [] } }; // the deploy tip: no run, not red
  if (p.startsWith("commits/")) return { json: [] }; // the head's statuses: no `gate` status (#5554)
  if (p.startsWith("actions/runs/11/jobs")) return { json: { jobs: [] } }; // the recorded-base read (#5832): no tooling A job
  calls.push(p);
  if (p.startsWith("actions/workflows/ci.yml/runs")) return { json: { workflow_runs: [retriedRun] } };
  const m = p.match(/^actions\/runs\/11\/attempts\/(\d+)\/jobs\?per_page=100&page=1$/);
  assert.ok(m, p);
  const a = byAttempt[Number(m[1])];
  return a.error ? a : { json: { jobs: a } };
};
test("needsSync: green on attempt 3 after a timed_out job in attempt 1 + newer tip = stale-red", () => {
  const calls = [];
  const v = needsSync("pr", { fetch: false, readGit: alias(repo(["a.txt", "a\n"], ["b.txt", "b\n"])),
    request: attemptsApi({ 1: [{ conclusion: "timed_out" }, { conclusion: "failure" }], 2: [{ conclusion: "cancelled" }] }, calls) });
  assert.equal(v.verdict, "stale-red"); assert.equal(v.retryFailedJobs, 2); assert.equal(v.why, "ci green only on attempt 3 after 2 failed job(s) on the head and the tip has moved since that run started");
  assert.ok(calls.some((p) => p.includes("/attempts/2/")), "every earlier attempt is read");
});
test("needsSync: green on attempt 3 after cancel-only attempts = no", () => {
  const v = needsSync("pr", { fetch: false, readGit: alias(repo(["a.txt", "a\n"], ["b.txt", "b\n"])),
    request: attemptsApi({ 1: [{ conclusion: "cancelled" }], 2: [{ conclusion: "cancelled" }, { conclusion: "skipped" }] }) });
  assert.equal(v.verdict, "no"); assert.equal(v.retryFailedJobs, 0);
});
test("needsSync: an unreadable earlier attempt degrades like an unreadable CI read (no + note), never stale-red", () => {
  const v = needsSync("pr", { fetch: false, readGit: alias(repo(["a.txt", "a\n"], ["b.txt", "b\n"])),
    request: attemptsApi({ 1: { error: "HTTP 502" } }) });
  assert.equal(v.ok, true); assert.equal(v.verdict, "no"); assert.equal(v.retryFailedJobs, null);
  assert.equal(v.why, "behind with no conflict (ci success on attempt 3; its earlier attempts are unreadable (attempt 1: HTTP 502)): clean-behind is not a reason");
  assert.equal(v.note, "earlier attempts of run 11 unreadable (attempt 1: HTTP 502): a retried green counts as no");
});

// #5554: the gate's retest row refuses a green head and names a sync as the cure; needs-sync must agree.
// The description is the live one on #5546 head 0cbc46d1 (land.yml cuts the summary line at 140 chars).
const REFUSED = "= merge-gate refused — open=ok hold=ok plan=ok ci=ok config=ok raise=ok gen=ok ratchets=ok retest=FAIL pr=#5546 sha=0cbc46d14aced8e4a7bd6971";
const gate = (description, more = {}) => ({ context: "gate", state: "failure", description, creator: { login: "github-actions[bot]" }, ...more });
test("gateRetestRefusal: only the newest gate status, a bot-posted refusal whose retest row was really evaluated", () => {
  assert.deepEqual(gateRetestRefusal([gate(REFUSED)]), { refused: true, evidence: REFUSED });
  assert.equal(gateRetestRefusal([{ context: "other", state: "failure", description: REFUSED }, gate(REFUSED)]).refused, true, "other contexts are skipped");
  const waiting = "= merge-gate waiting — open=ok hold=ok plan=ok ci=WAIT config=ok raise=ok pr=#5546 sha=0cbc46d1 tip=fffc8268";
  assert.equal(gateRetestRefusal([gate(waiting, { state: "pending" }), gate(REFUSED)]).refused, false, "a newer re-gate supersedes the refusal");
  assert.equal(gateRetestRefusal([gate(REFUSED.replace("ci=ok", "ci=FAIL"))]).refused, false, "a red ci row leaves retest not evaluated");
  assert.equal(gateRetestRefusal([gate(REFUSED.replace("gen=ok", "gen=FAIL"))]).refused, false, "a red gen row leaves retest not evaluated");
  assert.equal(gateRetestRefusal([gate(REFUSED.replace("retest=FAIL", "retest=ok").replace("refused", "passed"), { state: "success" })]).refused, false);
  assert.equal(gateRetestRefusal([gate(REFUSED, { creator: { login: "someone" } })]).refused, false, "not the Actions bot");
  assert.equal(gateRetestRefusal([gate(REFUSED, { state: "pending" })]).refused, false);
  for (const none of [[], null, undefined, { workflow_runs: [] }]) assert.deepEqual(gateRetestRefusal(none), { refused: false, evidence: "" });
});
test("decideSync: a retest refusal with tip merges left = retest-refused; none left, not behind, a conflict or a red tip keep their verdicts", () => {
  const base = { behind: true, conflict: false, ci: "success", runStartedAt: T0, tipNewestAt: T1 };
  const d = decideSync({ ...base, retest: { refused: true, tipMerges: 2, commits: ["fffc8268aaaaaaaa", "0123456789abcdef"] } });
  assert.deepEqual(d, { verdict: "retest-refused", why: "the gate's retest row refused this head and 2 tip merge(s) since its CI run remain (fffc8268, 01234567): sync and push, so a fresh CI run tests this combination" });
  assert.deepEqual(decideSync({ ...base, retest: { refused: true, tipMerges: 0, commits: [] } }),
    { verdict: "retest-refused", why: "the gate's retest row refused this head and the head is still behind the tip it was re-tested on: sync and push, so a fresh CI run tests this combination" },
    "#5832: a retest FAIL on a head that is still behind is a sync, whatever this clone's window counts");
  assert.equal(decideSync({ ...base, retest: { refused: false, evidence: "" } }).why, "behind with no conflict (ci success): clean-behind is not a reason");
  assert.equal(decideSync({ ...base, retest: null }).verdict, "no");
  const refused = { refused: true, tipMerges: 1, commits: ["fffc8268"] };
  assert.equal(decideSync({ ...base, behind: false, retest: refused }).verdict, "no");
  assert.equal(decideSync({ ...base, conflict: true, retest: refused }).verdict, "conflict");
  assert.equal(decideSync({ ...base, tip: { state: "code-red", evidence: "x" }, retest: refused }).verdict, "tip-red");
});
// One green ci.yml run on the head, created at `createdAt`; the `gate` statuses come from `statusesOf(sha)`.
const greenApi = (createdAt, statusesOf, calls = []) => (p) => {
  calls.push(p);
  if (p.startsWith("actions/workflows/ci.yml/runs")) return { json: { workflow_runs: [{ id: 7, path: ".github/workflows/ci.yml", status: "completed", conclusion: "success", run_attempt: 1, created_at: createdAt, run_started_at: createdAt }] } };
  const m = /^commits\/([0-9a-f]{40})\/statuses/.exec(p);
  if (m) return { json: statusesOf(m[1]) };
  return { json: { workflow_runs: [], jobs: [] } };
};
test("needsSync (a): retest FAIL on the current head, the tip merged after its CI run = retest-refused, exit 0", () => {
  const calls = [];
  const v = needsSync("pr", { fetch: false, readGit: alias(repo(["a.txt", "a\n"], ["b.txt", "b\n"])), request: greenApi("2000-01-01T00:00:00Z", () => [gate(REFUSED)], calls) });
  assert.equal(v.verdict, "retest-refused");
  assert.equal(v.why, `the gate's retest row refused this head and 1 tip merge(s) since its CI run remain (${v.tip.slice(0, 8)}): sync and push, so a fresh CI run tests this combination`);
  assert.deepEqual(v.retest, { refused: true, evidence: REFUSED, tipMerges: 1, commits: [v.tip] });
  assert.equal(exitCode(v), 0);
  assert.equal(verdictLine(v), "= sync needed: retest-refused");
  assert.equal(calls.filter((p) => p === `commits/${v.head}/statuses?per_page=100`).length, 1, "the status read is on the current head");
});
test("needsSync (b): retest FAIL recorded on an OLDER head only = no", () => {
  const old = "0cbc46d14aced8e4a7bd6971f6fd2b344f668e0d";
  const v = needsSync("pr", { fetch: false, readGit: alias(repo(["a.txt", "a\n"], ["b.txt", "b\n"])), request: greenApi("2000-01-01T00:00:00Z", (sha) => (sha === old ? [gate(REFUSED)] : [])) });
  assert.notEqual(v.head, old);
  assert.equal(v.verdict, "no");
  assert.equal(v.why, "behind with no conflict (ci success): clean-behind is not a reason");
  assert.deepEqual(v.retest, { refused: false, evidence: "" });
});
test("needsSync (c): retest FAIL, the window counts no tip merge, but the head is behind = retest-refused (#5832)", () => {
  const v = needsSync("pr", { fetch: false, readGit: alias(repo(["a.txt", "a\n"], ["b.txt", "b\n"])), request: greenApi("2100-01-01T00:00:00Z", () => [gate(REFUSED)]) });
  assert.equal(v.verdict, "retest-refused");
  assert.equal(v.why, "the gate's retest row refused this head and the head is still behind the tip it was re-tested on: sync and push, so a fresh CI run tests this combination");
  assert.deepEqual(v.retest, { refused: true, evidence: REFUSED, tipMerges: 0, commits: [] });
  assert.equal(exitCode(v), 0);
});
test("needsSync: an unreadable gate status is a note, never a sync; a head that is not green reads no status", () => {
  const rg = () => alias(repo(["a.txt", "a\n"], ["b.txt", "b\n"]));
  const api = greenApi("2000-01-01T00:00:00Z", () => [gate(REFUSED)]);
  const v = needsSync("pr", { fetch: false, readGit: rg(), request: (p) => (p.startsWith("commits/") ? { error: "HTTP 502" } : api(p)) });
  assert.equal(v.verdict, "no");
  assert.equal(v.note, "gate status unreadable (HTTP 502): retest-refused and gate-refused cannot be detected");
  const calls = [];
  const red = needsSync("pr", { fetch: false, readGit: rg(), request: (p) => { calls.push(p); return p.startsWith("commits/") ? { json: [gate(REFUSED)] } : { json: { workflow_runs: [] } }; } });
  assert.equal(red.verdict, "no");
  assert.equal(calls.filter((p) => p.startsWith("commits/")).length, 0);
});

// #5832 (1): the run's merge ref sat on an OLDER tip although every tip commit predates the run (PR #5795, run
// 44481046227: merged onto e9f93c47 while the tip was already dec94440). The recorded base, not the clock, decides.
const guardsJob = { id: 501, name: "ci / Structural guards (tooling A)" };
const redApi = (base, startedAt = "2100-01-01T00:00:00Z") => (p) => {
  if (p.startsWith("actions/workflows/ci.yml/runs")) return { json: { workflow_runs: [{ id: 9, path: ".github/workflows/ci.yml", status: "completed", conclusion: "failure", run_attempt: 1, created_at: startedAt, run_started_at: startedAt }] } };
  if (p.startsWith("actions/runs/9/jobs")) return { json: { jobs: [guardsJob] } };
  if (p.startsWith("check-runs/501/annotations")) return { json: base ? [{ title: "apex-guards", message: `mode=changed base=${base}` }] : [] };
  return { json: { workflow_runs: [], jobs: [] } };
};
test("decideSync: red, the tip commit older than the run, but the run merged onto an older base = stale-red", () => {
  const f = { behind: true, conflict: false, ci: "failure", runStartedAt: T1, tipNewestAt: T0 };
  assert.equal(decideSync(f).verdict, "no", "the clock alone says not moved");
  assert.deepEqual(decideSync({ ...f, ciBase: "e9f93c47ee2bcf19aa11fadd4067022f09d71a16", baseMoved: true, baseMoves: 1 }),
    { verdict: "stale-red", why: "ci.yml is red on the head and the run merged onto e9f93c47, not the current tip (1 tip commit(s) past that base)" });
  assert.equal(decideSync({ ...f, ciBase: "e9f93c47ee2bcf19aa11fadd4067022f09d71a16", baseMoved: false, baseMoves: 0 }).verdict, "no");
});
test("needsSync: red head whose recorded base is behind the tip = stale-red, exit 0; recorded base = tip = no", () => {
  const rg = alias(repo(["a.txt", "a\n"], ["b.txt", "b\n"]));
  const oldBase = rg(["rev-parse", "origin/pr^"]).out, tipSha = rg(["rev-parse", "origin/deploy"]).out;
  const v = needsSync("pr", { fetch: false, readGit: rg, request: redApi(oldBase) });
  assert.equal(v.verdict, "stale-red");
  assert.equal(v.ciBase, oldBase);
  assert.equal(v.baseMoved, true);
  assert.equal(v.why, `ci.yml is red on the head and the run merged onto ${oldBase.slice(0, 8)}, not the current tip (1 tip commit(s) past that base)`);
  assert.equal(exitCode(v), 0);
  const same = needsSync("pr", { fetch: false, readGit: rg, request: redApi(tipSha) });
  assert.equal(same.verdict, "no", "the run already tested the current tip: the red is the branch's own");
  assert.equal(same.baseMoved, false);
  const none = needsSync("pr", { fetch: false, readGit: rg, request: redApi("") });
  assert.equal(none.verdict, "no", "no record: judged by time, as before");
  const gone = needsSync("pr", { fetch: false, readGit: rg, request: redApi("1".repeat(40)) });
  assert.equal(gone.verdict, "no");
  assert.ok(String(gone.note).includes("recorded base 11111111 is not in this clone: judged by time only"), gone.note);
});

// #5832 (2): the gate's own gen / ratchets rows. Live shape: land.yml cuts the summary line at 140 chars.
const GEN_FAIL = "= merge-gate refused — open=ok hold=ok plan=ok ci=ok base=ok config=ok raise=ok gen=FAIL ratchets=FAIL retest=FAIL pr=#5683 sha=0cbc46d1";
const RATCHETS_FAIL = "= merge-gate refused — open=ok hold=ok plan=ok ci=ok base=ok config=ok raise=ok gen=ok ratchets=FAIL retest=ok pr=#5778 sha=0cbc46d1";
test("gateMergeRefusal: the FAILed merge rows of a bot refusal with open and ci ok; anything else is none", () => {
  assert.deepEqual(gateMergeRefusal([gate(GEN_FAIL)]), { refused: true, rows: ["gen", "ratchets", "retest"], evidence: GEN_FAIL });
  assert.deepEqual(gateMergeRefusal([gate(RATCHETS_FAIL)]).rows, ["ratchets"]);
  assert.deepEqual(gateMergeRefusal([gate(REFUSED)]).rows, ["retest"]);
  assert.equal(gateMergeRefusal([gate(GEN_FAIL.replace("open=ok", "open=FAIL"))]).refused, false, "a draft leaves the merge rows not evaluated");
  assert.equal(gateMergeRefusal([gate(GEN_FAIL.replace("ci=ok", "ci=FAIL"))]).refused, false);
  assert.equal(gateMergeRefusal([gate(GEN_FAIL, { creator: { login: "someone" } })]).refused, false);
  assert.equal(gateMergeRefusal([gate(GEN_FAIL.replace("refused", "waiting"), { state: "pending" }), gate(GEN_FAIL)]).refused, false, "the newest gate status only");
  for (const none of [[], null, undefined]) assert.deepEqual(gateMergeRefusal(none), { refused: false, rows: [], evidence: "" });
});
test("decideSync: a gen or ratchets FAIL = gate-refused (behind, no conflict, tip not red)", () => {
  const base = { behind: true, conflict: false, ci: "success", runStartedAt: T1, tipNewestAt: T0 };
  assert.deepEqual(decideSync({ ...base, gate: { refused: true, rows: ["gen", "ratchets", "retest"] } }),
    { verdict: "gate-refused", why: "the gate refused this head on gen=FAIL ratchets=FAIL (the merge onto the tip): sync and push, so this head's CI tests the combination, then fix what it shows" });
  assert.equal(decideSync({ ...base, gate: { refused: true, rows: ["retest"] } }).verdict, "no", "retest alone is the retest-refused path");
  assert.equal(decideSync({ ...base, behind: false, gate: { refused: true, rows: ["gen"] } }).verdict, "no");
  assert.equal(decideSync({ ...base, conflict: true, gate: { refused: true, rows: ["gen"] } }).verdict, "conflict");
  assert.equal(decideSync({ ...base, tip: { state: "code-red", evidence: "x" }, gate: { refused: true, rows: ["gen"] } }).verdict, "tip-red");
});
test("needsSync: a green head the gate refused on gen / ratchets = gate-refused, exit 0 (#5683, #5778 shapes)", () => {
  for (const [d, rows] of [[GEN_FAIL, ["gen", "ratchets", "retest"]], [RATCHETS_FAIL, ["ratchets"]]]) {
    const v = needsSync("pr", { fetch: false, readGit: alias(repo(["a.txt", "a\n"], ["b.txt", "b\n"])), request: greenApi("2100-01-01T00:00:00Z", () => [gate(d)]) });
    assert.equal(v.verdict, "gate-refused", d);
    assert.deepEqual(v.gate.rows, rows);
    assert.equal(exitCode(v), 0);
    assert.equal(verdictLine(v), "= sync needed: gate-refused");
  }
});

// #5922: a merge=union path both sides appended to. git's union driver merges it (merge-tree clean); GitHub merges
// it as text, reports the PR dirty and never merges it, so needs-sync must name it.
function unionRepo(tipLog, prLog, { attr = "LOG.md merge=union\n", prOther = null } = {}) {
  const dir = mkTmpDir("needs-sync-union-");
  const g = (...a) => { const r = spawnSync("git", a, { cwd: dir, encoding: "utf8" }); assert.equal(r.status, 0, r.stderr); return r.stdout.trim(); };
  const w = (f, t) => fs.writeFileSync(path.join(dir, f), t);
  g("init", "-q", "-b", "deploy"); g("config", "user.email", "t@t"); g("config", "user.name", "t");
  w(".gitattributes", attr); w("LOG.md", "# log\n- one\n"); w("f.txt", "base\n"); g("add", "."); g("commit", "-qm", "base");
  g("checkout", "-qb", "pr"); if (prLog !== null) w("LOG.md", prLog); if (prOther) w(prOther[0], prOther[1]); g("add", "."); g("commit", "-qm", "pr");
  g("checkout", "-q", "deploy"); if (tipLog !== null) w("LOG.md", tipLog); else w("f.txt", "tip\n"); g("add", "."); g("commit", "-qm", "tip");
  g("update-ref", "refs/remotes/origin/deploy", "deploy"); g("update-ref", "refs/remotes/origin/pr", "pr");
  return (args) => { const r = spawnSync("git", args, { cwd: dir, encoding: "utf8" }); return { code: r.status, out: (r.stdout || "").trim(), err: (r.stderr || "").trim() }; };
}
const BASE_LOG = "# log\n- one\n";

test("decideSync: union-conflict sits after conflict and before stale-red; tip-red still wins", () => {
  const u = { behind: true, conflict: false, unionConflicts: ["docs/notes/CEILING-HISTORY.md"], ci: "success" };
  assert.equal(decideSync(u).verdict, "union-conflict");
  assert.match(decideSync(u).why, /CEILING-HISTORY\.md conflict as text/);
  assert.equal(decideSync({ ...u, conflict: true }).verdict, "conflict");
  assert.equal(decideSync({ ...u, ci: "failure", runStartedAt: T0, tipNewestAt: T1 }).verdict, "union-conflict");
  assert.equal(decideSync({ ...u, tip: { state: "code-red", evidence: "pages red" } }).verdict, "tip-red");
  assert.equal(decideSync({ ...u, behind: false }).verdict, "no");
  assert.equal(decideSync({ ...u, unionConflicts: [] }).verdict, "no");
});

test("needsSync: both sides append to a union file = union-conflict, exit 0 (merge-tree alone says clean)", () => {
  const rg = alias(unionRepo(BASE_LOG + "- tip\n", BASE_LOG + "- pr\n"));
  const v = needsSync("pr", { fetch: false, offline: true, readGit: rg });
  assert.equal(v.ok, true, v.error);
  assert.equal(v.conflict, false, "the union driver merges it");
  assert.deepEqual(v.unionConflicts, ["LOG.md"]);
  assert.equal(v.verdict, "union-conflict");
  assert.equal(exitCode(v), 0);
});

test("needsSync: a union file changed on one side only, or edits that merge as text, stay no", () => {
  const one = needsSync("pr", { fetch: false, offline: true, readGit: alias(unionRepo(null, BASE_LOG + "- pr\n")) });
  assert.deepEqual([one.verdict, one.unionConflicts], ["no", []]);
  const apart = needsSync("pr", { fetch: false, offline: true, readGit: alias(unionRepo("# LOG\n- one\n", BASE_LOG + "- pr\n")) });
  assert.deepEqual([apart.verdict, apart.unionConflicts], ["no", []], "non-overlapping hunks merge as text too");
});

test("needsSync: the same both-sides append on a path without merge=union is a plain conflict", () => {
  const v = needsSync("pr", { fetch: false, offline: true, readGit: alias(unionRepo(BASE_LOG + "- tip\n", BASE_LOG + "- pr\n", { attr: "# none\n" })) });
  assert.equal(v.verdict, "conflict");
});

test("unionTextConflicts: a union path deleted on one side counts; a merge-base failure is an error, not a verdict", () => {
  const rg = unionRepo(BASE_LOG + "- tip\n", BASE_LOG + "- pr\n");
  assert.deepEqual(unionTextConflicts("deploy", "pr", rg), { paths: ["LOG.md"] });
  const bad = unionTextConflicts("deploy", "pr", () => ({ code: 1, out: "", err: "boom" }));
  assert.deepEqual(bad.paths, []);
  assert.match(bad.error, /merge-base failed: boom/);
  const del = (args) => (args[0] === "rev-parse" && args.at(-1).startsWith("deploy:") ? { code: 1, out: "", err: "" } : rg(args));
  assert.deepEqual(unionTextConflicts("deploy", "pr", del), { paths: ["LOG.md"] });
});

// tip-crossed: a green draft behind a tip that moved a tree-wide number (#5975 re-seeded eagerCodeBytes; #5972, #5985,
// #5959, #5952 then failed merge-gate's ratchets row on the merge). No gate status needed: a draft never gets one.
const RAT_OVER = "over a ratchet on the merge result: ratchets.mjs: tree eagerCodeBytes 4018947 (ceiling 4018312)";
const crossedMerge = { ok: true, evidence: "merges clean onto 1a2b3c4d; gen:check and scenery catalog build 0", tip: "1a2b3c4d", ratchets: { ok: false, evidence: RAT_OVER }, retest: null };
const cleanMerge = { ok: true, evidence: "merges clean onto 1a2b3c4d; gen:check and scenery catalog build 0", tip: "1a2b3c4d", ratchets: { ok: true, evidence: "ratchets.mjs and the whole-tree count tests hold on the merge result" }, retest: null };

test("mergeCrossing: merge-gate's gen / ratchets rows of one local merge; an unreadable merge is no crossing", () => {
  assert.deepEqual(mergeCrossing(crossedMerge), { rows: ["ratchets"], evidence: RAT_OVER });
  assert.deepEqual(mergeCrossing(cleanMerge), { rows: [], evidence: "" });
  assert.deepEqual(mergeCrossing({ ok: false, evidence: "gen:check fails on the merge onto 1a2b3c4d: x", tip: "1a2b3c4d" }),
    { rows: ["gen"], evidence: "gen:check fails on the merge onto 1a2b3c4d: x" }, "ratchets behind a gen FAIL is not evaluated");
  assert.deepEqual(mergeCrossing({ ok: false, evidence: "fetch x failed: boom", tip: "", error: true }), { error: "fetch x failed: boom" });
  assert.deepEqual(mergeCrossing(null), { error: "no merge result" });
});
test("decideSync: a crossing merge on a green head = tip-crossed, after every other verdict", () => {
  const base = { behind: true, conflict: false, ci: "success", runStartedAt: T1, tipNewestAt: T0, merge: { rows: ["ratchets"], evidence: RAT_OVER } };
  const d = decideSync(base);
  assert.equal(d.verdict, "tip-crossed");
  assert.equal(d.why, `a local merge onto the tip fails merge-gate's ratchets=FAIL (${RAT_OVER}): the tip moved under this green head; sync and push, so its CI tests the combination, then fix what it shows`);
  assert.equal(decideSync({ ...base, merge: { rows: [], evidence: "" } }).verdict, "no");
  assert.equal(decideSync({ ...base, merge: null }).verdict, "no");
  assert.equal(decideSync({ ...base, ci: "in_progress" }).verdict, "no", "a green head only");
  assert.equal(decideSync({ ...base, behind: false }).verdict, "no");
  assert.equal(decideSync({ ...base, conflict: true }).verdict, "conflict");
  assert.equal(decideSync({ ...base, tip: { state: "code-red", evidence: "x" } }).verdict, "tip-red");
  assert.equal(decideSync({ ...base, gate: { refused: true, rows: ["ratchets"] } }).verdict, "gate-refused");
});
test("needsSync: a green draft whose local merge crosses a ratchet = tip-crossed, exit 0 (no gate status)", () => {
  const calls = [];
  const v = needsSync("pr", { fetch: false, readGit: alias(repo(["a.txt", "a\n"], ["b.txt", "b\n"])), request: greenApi("2100-01-01T00:00:00Z", () => []),
    mergeCheck: (a) => { calls.push(a); return crossedMerge; } });
  assert.equal(v.verdict, "tip-crossed");
  assert.deepEqual(v.merge, { rows: ["ratchets"], evidence: RAT_OVER });
  assert.equal(exitCode(v), 0);
  assert.equal(verdictLine(v), "= sync needed: tip-crossed");
  assert.equal(calls.length, 1);
  assert.equal(calls[0].head, v.head); assert.equal(calls[0].headRef, "pr"); assert.equal(calls[0].ciAt, null, "no retest row");
});
test("needsSync: a clean local merge stays no (clean-behind is not a reason)", () => {
  const v = needsSync("pr", { fetch: false, readGit: alias(repo(["a.txt", "a\n"], ["b.txt", "b\n"])), request: greenApi("2100-01-01T00:00:00Z", () => []), mergeCheck: () => cleanMerge });
  assert.equal(v.verdict, "no");
  assert.equal(exitCode(v), 1);
});
test("needsSync: an unreadable local merge is no sync verdict (fail safe) and names why", () => {
  const v = needsSync("pr", { fetch: false, readGit: alias(repo(["a.txt", "a\n"], ["b.txt", "b\n"])), request: greenApi("2100-01-01T00:00:00Z", () => []),
    mergeCheck: () => ({ ok: false, evidence: "worktree add failed: boom", tip: "1a2b3c4d", error: true }) });
  assert.equal(v.verdict, "no");
  assert.equal(exitCode(v), 1);
  assert.equal(v.merge, null);
  assert.equal(v.note, "the local merge onto the tip is unreadable (worktree add failed: boom): tip-crossed cannot be detected");
});
test("needsSync: the local merge runs only on a green head nothing else decided, never offline or unasked", () => {
  let n = 0;
  const mergeCheck = () => { n++; return crossedMerge; };
  const rg = () => alias(repo(["a.txt", "a\n"], ["b.txt", "b\n"]));
  assert.equal(needsSync("pr", { fetch: false, offline: true, readGit: rg(), mergeCheck }).verdict, "no");
  assert.equal(needsSync("pr", { fetch: false, readGit: rg(), request: greenApi("2100-01-01T00:00:00Z", () => [gate(RATCHETS_FAIL)]), mergeCheck }).verdict, "gate-refused");
  assert.equal(needsSync("pr", { fetch: false, readGit: alias(repo(["f.txt", "x\n"], ["f.txt", "y\n"])), request: greenApi("2100-01-01T00:00:00Z", () => []), mergeCheck }).verdict, "conflict");
  assert.equal(n, 0);
  assert.equal(needsSync("pr", { fetch: false, readGit: rg(), request: greenApi("2100-01-01T00:00:00Z", () => []) }).verdict, "no", "pr-board's call: no mergeCheck");
});
