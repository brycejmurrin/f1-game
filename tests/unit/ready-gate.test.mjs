/* ready-gate.test.mjs — the worker's pre-flip check as behaviour: the Structural guards verdict, the local
 * tooling-fast stamp, the Plan parser (`land:` exempt), the memory marker, the PR shape (open draft, not
 * conflicting) and the CLI over a fake API and a captured receipt (AGENTS.md rule 12; evidence #1111).
 *
 * Run: node --test tests/unit/ready-gate.test.mjs
 */
import "../helpers/git-fixture-env.mjs"; // FIRST: scrubs the GIT_DIR & co. a git hook exports (#1807)
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import {
  GUARDS_A, GUARDS_B, GUARDS_C, GUARDS_D, GUARDS_JOB, guardsVerdict, newestByName, localVerdict, evaluate, shaPrefixMatch,
  stampReadySha, planVerdict, withPlan, memoryVerdict, withMemory, resolveSha, verdictLine, mergeableProblem, draftProblem, main,
} from "../../tools/ci/ready-gate.mjs";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..", "..");
const TMP = path.join(ROOT, "artifacts", "tmp");
fs.mkdirSync(TMP, { recursive: true });
const SHA = "a".repeat(40);
const run = (name, status, conclusion, id = 1) => ({ id, name, status, conclusion, started_at: "2026-10-06T11:00:00Z" });
const GREEN = { state: "passed", evidence: "Structural guards success", code: 0, sha: SHA, source: "ci" };

test("guardsVerdict: the aggregator decides; its shards are the fallback when it was cancelled/skipped; a red or running shard blocks", () => {
  assert.equal(guardsVerdict([run(GUARDS_JOB, "completed", "success")]).code, 0);
  assert.equal(guardsVerdict([run(GUARDS_JOB, "completed", "failure"), run(GUARDS_A, "completed", "success", 2)]).state, "failed");
  assert.equal(guardsVerdict([run(GUARDS_JOB, "in_progress", null)]).state, "pending");
  const shards = (d) => [run(GUARDS_JOB, "completed", "cancelled"), run(GUARDS_A, "completed", "success", 2), run(GUARDS_B, "completed", "success", 3), run(GUARDS_C, "completed", "success", 4), run(GUARDS_D, "completed", d, 5)];
  assert.equal(guardsVerdict(shards("success")).state, "passed");
  assert.equal(guardsVerdict(shards("failure")).state, "failed", "the fourth shard counts (2026-10-24)");
  assert.equal(guardsVerdict([...shards("success").slice(0, 4), run(GUARDS_D, "queued", null, 5)]).state, "pending");
  assert.equal(guardsVerdict([run(GUARDS_A, "completed", "failure"), run(GUARDS_B, "completed", "success", 2)]).state, "failed");
  assert.equal(guardsVerdict([run("CI", "completed", "success")]).state, "none");
  // WP-L8: A+B green with C/D missing is pending, never passed.
  const ab = guardsVerdict([run(GUARDS_JOB, "completed", "cancelled"), run(GUARDS_A, "completed", "success", 2), run(GUARDS_B, "completed", "success", 3)]);
  assert.deepEqual([ab.state, ab.code, ab.evidence], ["pending", 1, `${GUARDS_C}, ${GUARDS_D} missing (all four tooling shards must report)`]);
  assert.equal(guardsVerdict([run(GUARDS_A, "completed", "success"), run(GUARDS_B, "completed", "success", 2), run(GUARDS_C, "completed", "success", 3)]).state, "pending");
  assert.equal(guardsVerdict([run(GUARDS_C, "completed", "failure")]).state, "failed", "a red shard fails even when others are missing");
});

test("newestByName: the newest attempt per name wins; a skipped run never hides a real result (#3862)", () => {
  const by = newestByName([run(GUARDS_JOB, "completed", "failure", 1), run(GUARDS_JOB, "completed", "success", 2), run(GUARDS_JOB, "completed", "skipped", 3)]);
  assert.equal(by.get(GUARDS_JOB).id, 2);
  assert.equal(guardsVerdict([run(GUARDS_JOB, "completed", "success", 1), run(GUARDS_JOB, "completed", "skipped", 2)]).state, "passed");
  assert.equal(newestByName([{ ...run(GUARDS_JOB, "queued", null, 0), started_at: null }, run(GUARDS_JOB, "completed", "success", 1)]).get(GUARDS_JOB).id, 1, "a queued attempt without started_at cannot reuse an old pass");
});

test("shaPrefixMatch: mutual prefixes of at least 7 hex", () => {
  assert.equal(shaPrefixMatch("abcdef1", "abcdef1234567890"), true);
  assert.equal(shaPrefixMatch("abcdef1234567890", "abcdef1"), true);
  assert.equal(shaPrefixMatch("abcdef1", "abcdef2"), false);
  assert.equal(shaPrefixMatch("abc", "abcdef1"), false);
});

/** A stamp + suite log pair under a scratch dir; `tree` makes a tree stamp, the log carries the same tree. */
function stamp(dirPrefix, { sha = SHA, tree = "", log = "= run passed", logTree = tree } = {}) {
  const dir = fs.mkdtempSync(path.join(TMP, dirPrefix));
  const stampPath = path.join(dir, "ready.sha"), logPath = path.join(dir, "suite.log");
  stampReadySha(sha, { tree, stampPath });
  fs.writeFileSync(logPath, `${logTree ? `= tree ${logTree}\n` : ""}${log}\n`);
  return { dir, opts: { stampPath, logPath, treeOf: () => TREE } };
}
const TREE = "c".repeat(40);

test("localVerdict: a bare-sha stamp matches the tip by prefix; the suite log must say passed; a tree stamp must be the tip's tree and the log's run", () => {
  const cases = [
    [stamp("rg-ok-"), SHA, "passed"],
    [stamp("rg-other-", { sha: "b".repeat(40) }), SHA, "failed"],
    [stamp("rg-red-", { log: "= run passed\n= run failed" }), SHA, "failed"],
    [stamp("rg-nolog-", { log: "nothing" }), SHA, "none"],
    [stamp("rg-tree-", { tree: TREE }), SHA, "passed"],
    [stamp("rg-tree-moved-", { tree: "d".repeat(40) }), SHA, "failed"],
    [stamp("rg-tree-log-", { tree: TREE, logTree: "d".repeat(40) }), SHA, "none"],
  ];
  try {
    for (const [s, tip, state] of cases) assert.equal(localVerdict(tip, s.opts).state, state, localVerdict(tip, s.opts).evidence);
    assert.equal(localVerdict(SHA, { ...cases[0][0].opts, stampPath: path.join(TMP, "missing.sha") }).state, "none");
    assert.equal(localVerdict("not-a-sha", cases[0][0].opts).state, "none");
    assert.equal(stampReadySha("zz"), false); assert.equal(stampReadySha(SHA, { tree: "short", stampPath: "/nowhere" }), false);
  } finally { for (const [s] of cases) fs.rmSync(s.dir, { recursive: true, force: true }); }
});

test("a tree stamp agrees with the tip once exactly the verified edits are committed (work-tree-id)", async () => {
  const { workTreeId, commitTreeId } = await import("../../tools/lib/work-tree-id.mjs");
  const dir = fs.mkdtempSync(path.join(TMP, "ready-gate-tree-"));
  const g = (...a) => execFileSync("git", a, { cwd: dir, encoding: "utf8", stdio: "pipe" }).trim();
  try {
    g("init", "-q"); g("config", "user.email", "t@t"); g("config", "user.name", "t");
    fs.writeFileSync(path.join(dir, "a.js"), "1\n"); g("add", "-A"); g("commit", "-qm", "base");
    assert.equal(workTreeId(dir), commitTreeId("HEAD", dir), "a clean tree is HEAD's tree");
    fs.writeFileSync(path.join(dir, "a.js"), "2\n"); fs.writeFileSync(path.join(dir, "new.test.mjs"), "x\n");
    const dirty = workTreeId(dir);
    assert.notEqual(dirty, commitTreeId("HEAD", dir));
    g("add", "-A"); g("commit", "-qm", "the verified edits");
    const tip = g("rev-parse", "HEAD");
    assert.equal(commitTreeId("HEAD", dir), dirty, "commit exactly what was verified and the gate's comparison agrees");
    const s = stamp("rg-real-tree-", { sha: tip, tree: dirty });
    assert.equal(localVerdict(tip, { ...s.opts, treeOf: (sha) => commitTreeId(sha, dir) }).state, "passed");
    fs.rmSync(s.dir, { recursive: true, force: true });
  } finally { fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); }
});

test("evaluate: CI decides when it has; a pending/none CI falls back to a green local stamp; an API error with no stamp is exit 3", () => {
  const s = stamp("rg-eval-");
  const checks = (...runs) => () => ({ json: { check_runs: runs, total_count: runs.length } });
  try {
    assert.equal(evaluate({ sha: SHA, request: checks(run(GUARDS_JOB, "completed", "success")), localOpts: s.opts }).source, "ci");
    const red = evaluate({ sha: SHA, request: checks(run(GUARDS_JOB, "completed", "failure")), localOpts: s.opts });
    assert.deepEqual([red.state, red.code], ["failed", 1], "CI failure refuses even with a local stamp");
    const pending = evaluate({ sha: SHA, request: checks(run(GUARDS_JOB, "in_progress", null)), localOpts: s.opts });
    assert.deepEqual([pending.state, pending.source], ["passed", "local"]);
    const down = evaluate({ sha: SHA, request: () => ({ error: "HTTP 502" }), localOpts: s.opts });
    assert.deepEqual([down.state, down.source], ["passed", "local-fallback"]);
    const none = evaluate({ sha: SHA, request: () => ({ error: "HTTP 502" }), localOpts: { ...s.opts, stampPath: path.join(TMP, "missing.sha") } });
    assert.deepEqual([none.state, none.code], ["unknown", 3]);
    assert.equal(evaluate({ sha: SHA, localOnly: true, request: () => { throw new Error("no API in --local"); }, localOpts: s.opts }).source, "local");
    // pagination: a later page's error fails closed
    let page = 0;
    const paged = (p) => { page++; return p.includes("page=2") ? { error: "HTTP 500" } : { json: { check_runs: Array.from({ length: 100 }, (_, i) => run("x", "completed", "success", i)), total_count: 150 } }; };
    assert.equal(evaluate({ sha: SHA, request: paged, localOpts: { ...s.opts, stampPath: path.join(TMP, "missing.sha") } }).code, 3);
    assert.equal(page, 2);
  } finally { fs.rmSync(s.dir, { recursive: true, force: true }); }
});

const body = (plan) => `## Goal\nfix it\n\n## Plan\n${plan}\n\n## Status\n- [ ] not a plan item\n`;

test("planVerdict: ticked, struck, deferred and `land:` items close; unticked ones stay open; only the Plan section counts", () => {
  assert.deepEqual(planVerdict(body("- [x] a\n- [ ] ~~b~~ — dropped\n- [~] c\n- [ ] Deferred: d\n- [ ] land: flip ready, add `land`\n- [ ] **land:** bold")), { state: "done", items: 6, open: [] });
  const open = planVerdict(body("- [x] a\n- [ ] write the test\n- [ ] \n- [ ] READY to ORCH A via agent-msg"));
  assert.deepEqual([open.state, open.items, open.open], ["open", 4, ["write the test", "(empty item)"]], "the older `READY to` terminal item is still exempt");
  assert.equal(planVerdict(body("- [x] a\n<!-- - [ ] example in a comment -->")).state, "done", "HTML comments are not items");
  assert.equal(planVerdict("## Goal\nx\n").state, "none");
  assert.equal(planVerdict(body("prose only")).state, "none");
  const tpl = fs.readFileSync(path.join(ROOT, ".github/pull_request_template.md"), "utf8");
  assert.equal(planVerdict(tpl).state, "open", "the untouched template is open");
  const cursor = `## Plan\n- [ ] outer stale\n<!-- CURSOR_AGENT_PR_BODY_BEGIN -->\n## Plan\n- [x] agent ticked\n<!-- CURSOR_AGENT_PR_BODY_END -->`;
  assert.equal(planVerdict(cursor).state, "done", "Cursor's agent slice wins when it carries a Plan (#2899)");
});

test("planVerdict on edited bodies (moved from pr-body.test.mjs): a struck or deferred item closes, `**now:**` stays open", () => {
  const plan = "<!-- example:\n       - [x] done — sample\n       - [ ] todo -->\n- [ ] **now:** first step\n- [ ] second step\n- [x] third — sha";
  assert.deepEqual(planVerdict(body(plan)).open, ["**now:** first step", "second step"], "commented example items do not count");
  assert.deepEqual(planVerdict(body(plan.replace("- [ ] second step", "- [ ] ~~second step~~ — covered by #5"))).open.length, 1, "struck closes");
  assert.deepEqual(planVerdict(body(plan.replace("- [ ] second step", "- [~] second step"))).open.length, 1, "deferred closes");
});

test("withPlan: an open Plan turns a green tip into plan-open (exit 1); no Plan warns; red and no-PR pass through", () => {
  const v = withPlan(GREEN, body("- [ ] one\n- [ ] two\n- [ ] three\n- [ ] four"));
  assert.deepEqual([v.state, v.code], ["plan-open", 1]);
  assert.ok(v.evidence.startsWith('4 of 4 Plan item(s) open: "one", "two", "three", ...'), v.evidence);
  assert.equal(withPlan(GREEN, body("- [x] one")).code, 0);
  assert.ok(withPlan(GREEN, "## Goal\nx").planWarning);
  assert.equal(withPlan({ ...GREEN, state: "failed", code: 1 }, body("- [ ] x")).state, "failed");
  assert.equal(withPlan(GREEN, null), GREEN);
});

test("memoryVerdict / withMemory: .claude/memory/ edits need `memory-change: <reason>` or the label; a missing file list fails closed", () => {
  assert.equal(memoryVerdict(["js/core/log.js"]).state, "ok");
  assert.equal(memoryVerdict([".claude/memory/MEMORY.md"], { body: "touches memory" }).state, "memory-leak", "a bare word is no marker");
  assert.equal(memoryVerdict([".claude/memory/MEMORY.md"], { body: "memory-change:" }).state, "memory-leak", "a marker needs a reason");
  assert.equal(memoryVerdict([".claude/memory/MEMORY.md"], { body: "memory-change: retire a stale entry" }).state, "ok");
  assert.equal(memoryVerdict([".claude/memory/x.md"], { labels: ["Memory-Change"] }).state, "ok");
  assert.equal(memoryVerdict(["./.claude/memory/x.md"]).state, "memory-leak");
  assert.deepEqual([withMemory(GREEN, [".claude/memory/x.md"]).state, withMemory(GREEN, [".claude/memory/x.md"]).code], ["memory-leak", 1]);
  assert.equal(withMemory(GREEN, null, { filesError: "HTTP 500" }).state, "memory-unknown");
  assert.equal(withMemory(GREEN, null).code, 0, "no file list and no error: nothing to judge");
  assert.equal(withMemory({ ...GREEN, state: "failed", code: 1 }, [".claude/memory/x.md"]).state, "failed");
});

/** A fake GitHub for --pr runs: the PR, its files (paginated by `files`) and the head's check-runs. */
function github({ files = [{ filename: "js/core/log.js" }], pull = {}, checks = [run(GUARDS_JOB, "completed", "success")] } = {}) {
  const pr = { head: { sha: SHA, ref: "cursor/x" }, state: "open", draft: true, mergeable_state: "clean", body: body("- [x] done"), title: "t", labels: [], changed_files: files.length, ...pull };
  return (p) => {
    if (p === "pulls/7") return { json: pr };
    if (p.startsWith("pulls/7/files")) { const page = Number((p.match(/[?&]page=(\d+)/) || [])[1] || 1); return { json: files.slice((page - 1) * 100, page * 100) }; }
    if (p.startsWith("commits/")) return { json: { check_runs: checks, total_count: checks.length } };
    return { error: `unexpected ${p}` };
  };
}

test("resolveSha --pr: head, body, labels, draft/state and the full file list (both rename paths); a short or failed list is filesError", () => {
  const many = Array.from({ length: 150 }, (_, i) => ({ filename: `f${i}` }));
  const r = resolveSha({ pr: 7, request: github({ files: many, pull: { labels: [{ name: "run-ci" }], draft: false, state: "closed" } }) });
  assert.deepEqual([r.sha, r.pr, r.branch, r.labels, r.draft, r.state, r.files.length, r.filesError], [SHA, 7, "cursor/x", ["run-ci"], false, "closed", 150, null]);
  const ren = resolveSha({ pr: 7, request: github({ files: [{ filename: "docs/x.md", previous_filename: ".claude/memory/x.md" }] }) });
  assert.deepEqual(ren.files, ["docs/x.md", ".claude/memory/x.md"]);
  assert.ok(/incomplete files list: received 1 of 3/.test(resolveSha({ pr: 7, request: github({ files: [{ filename: "a" }], pull: { changed_files: 3 } }) }).filesError));
  const down = resolveSha({ pr: 7, request: (p) => (p === "pulls/7" ? github()(p) : { error: "HTTP 500" }) });
  assert.deepEqual([down.files, down.filesError], [null, "HTTP 500"]);
  assert.ok(/HTTP 404/.test(resolveSha({ pr: 7, request: () => ({ error: "HTTP 404" }) }).error));
  assert.ok(resolveSha({ pr: "x" }).error);
  assert.equal(resolveSha({ sha: "deadbeefcafe" }).sha, "deadbeefcafe", "a bare hex tip not in this clone passes through");
});

test("the PR shape: an open draft that is not conflicting; dirty refuses, unknown asks for a re-read, ready/closed have nothing to flip", () => {
  assert.equal(mergeableProblem("clean"), null); assert.equal(mergeableProblem("behind"), null);
  assert.equal(mergeableProblem("dirty").state, "dirty"); assert.equal(mergeableProblem("unknown").state, "unknown");
  assert.equal(draftProblem({ state: "open", draft: true }), null);
  assert.equal(draftProblem({ state: "open", draft: false }).state, "not-draft");
  assert.equal(draftProblem({ state: "closed", draft: false, merged: true }).state, "closed");
  assert.ok(verdictLine({ ...GREEN }).includes(`sha=${SHA} source=ci`), "the line carries the FULL sha (#2430)");
});

test("main --pr: green draft + closed Plan exits 0 and writes an ok receipt; each refusal exits 1 with a refused receipt; unknown re-reads; API error exits 3", () => {
  const s = stamp("rg-main-");
  const receipts = [], logs = [], slept = [];
  const deps = (request) => ({ request, judge: (a) => evaluate({ ...a, localOpts: s.opts }), receipt: (d) => receipts.push(d), sleep: (x) => slept.push(x), log: (...a) => logs.push(a.join(" ")) });
  try {
    assert.equal(main(["--pr", "7"], deps(github())), 0);
    assert.deepEqual(receipts.at(-1), { pr: 7, head: SHA, ok: true, evidence: "" });
    assert.ok(logs.at(-1).startsWith(`[ready-gate] = ready-gate passed — Structural guards success sha=${SHA}`), logs.at(-1));
    assert.equal(main(["--pr", "7"], deps(github({ pull: { body: body("- [ ] open") } }))), 1);
    assert.ok(receipts.at(-1).ok === false && receipts.at(-1).evidence.startsWith("plan-open:"), JSON.stringify(receipts.at(-1)));
    assert.equal(main(["--pr", "7"], deps(github({ files: [{ filename: ".claude/memory/x.md" }] }))), 1);
    assert.ok(receipts.at(-1).evidence.startsWith("memory-leak:"));
    assert.equal(main(["--pr", "7"], deps(github({ checks: [run(GUARDS_JOB, "completed", "failure")] }))), 1);
    assert.equal(main(["--pr", "7"], deps(github({ pull: { draft: false } }))), 1);
    assert.ok(receipts.at(-1).evidence.startsWith("not-draft:"));
    assert.equal(main(["--pr", "7"], deps(github({ pull: { mergeable_state: "dirty" } }))), 1);
    assert.ok(receipts.at(-1).evidence.startsWith("conflicting:"));
    const states = ["unknown", "unknown", "clean"];
    let reads = 0;
    const flaky = (p) => (p === "pulls/7" ? { json: { ...github()(p).json, mergeable_state: states[Math.min(reads++, 2)] } } : github()(p));
    assert.equal(main(["--pr", "7"], deps(flaky)), 0, "clean on the third read");
    assert.deepEqual(slept, [2, 4]);
    slept.length = 0; reads = 0; states.fill("unknown");
    assert.equal(main(["--pr", "7"], deps(flaky)), 1);
    assert.deepEqual(slept, [2, 4, 8], "three re-reads, then conflicting refuses");
    const n = receipts.length;
    assert.equal(main(["--pr", "7"], deps(() => ({ error: "HTTP 500" }))), 3);
    assert.equal(receipts.length, n, "no receipt on an API error");
    assert.equal(main(["--sha", SHA, "--local"], deps(() => { throw new Error("no API"); })), 0, "--local never calls GitHub");
    assert.equal(receipts.length, n, "no receipt without --pr");
  } finally { fs.rmSync(s.dir, { recursive: true, force: true }); }
});

test("ship-pr: runs ready-gate; a pass prints the MCP flip and the land label call, a refusal prints neither; nothing is flipped itself", async () => {
  const { main: ship, nextCalls } = await import("../../tools/ci/ship-pr.mjs");
  const out = [], seen = [];
  const go = (argv, code) => { out.length = 0; return [ship(argv, { run: (a) => (seen.push(a), code), log: (l) => out.push(l) }), out.join("\n")]; };
  let [rc, text] = go(["--pr", "7"], 0);
  assert.equal(rc, 0);
  assert.deepEqual(seen.at(-1), ["--pr", "7"]);
  const parts = ["update_pull_request", "pullNumber=7", "draft:false", "10 min", "re-run ready-gate", "gh api -X POST repos/brycejmurrin/f1-game/issues/7/labels -f 'labels[]=land'"];
  assert.deepEqual(parts.filter((x) => !text.includes(x)), [], "both calls and the receipt-age note are printed");
  [rc, text] = go(["--pr", "7"], 1);
  assert.equal(rc, 1);
  assert.deepEqual(parts.filter((x) => text.includes(x)), [], "a refusal prints neither call");
  [rc] = go(["--pr", "x; rm"], 0);
  assert.equal(rc, 1, "a non-numeric PR is a usage error");
  assert.equal(nextCalls(9, "o/r").length, 3);
});
