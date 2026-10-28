/* merge-gate.test.mjs — the landing gate's rows as behaviour: pure verdicts, the distance count from a fixture
 * history (pure and over a real git repo), the ratchets on a merge result, and the evaluator with a fake API,
 * fake merge and fake git (docs/plans/2026-10-27-orchestration-redesign.md §4.3), plus the ready receipt the hooks
 * still read (tools/lib/gate-receipt.mjs and its Python twin .claude/hooks/merge_policy.py).
 *
 * Run: node --test tests/unit/merge-gate.test.mjs
 */
import "../helpers/git-fixture-env.mjs"; // FIRST: scrubs the GIT_DIR & co. a git hook exports (#1807)
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import {
  REQUIRED_CHECK, CI_APP, HOLD_LABEL, MAX_BEHIND, ROWS, openVerdict, holdVerdict, planRow, ciVerdict, isGamePath, gameFiles,
  gameMergesBehind, distanceVerdict, baseHistory, distanceFor, ratchetsOnMerge, localMergeGenCheck, evaluate, rowLines, main,
  untrustedEnv, CI_WORKFLOW, TRUSTED_ROWS, ciSuitesFor, touchesGame,
} from "../../tools/ci/merge-gate.mjs";
import { parse as parseYAML } from "yaml";
import { receiptVerdict, writeReceipt, readReceipt, receiptPath, mainCheckout, MAX_AGE_MIN, GATE_FILES, gateFileHashes, gateFilesVerdict, gateClosure, staticImports, MAX_FUTURE_S, headPinProblem } from "../../tools/lib/gate-receipt.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const scratch = (prefix) => { const d = path.join(ROOT, "artifacts", "tmp"); fs.mkdirSync(d, { recursive: true }); return fs.mkdtempSync(path.join(d, prefix)); };
const HEAD = "a".repeat(40), TIP = "t".repeat(40);
const sha = (n) => String(n).repeat(40).slice(0, 40);
const GHA = { slug: "github-actions" };

test("openVerdict: only an open, non-draft PR passes", () => {
  assert.equal(openVerdict({ state: "open", draft: false }).ok, true);
  assert.equal(openVerdict({ state: "open", draft: true }).ok, false);
  assert.equal(openVerdict({ state: "closed", merged: true }).ok, false);
  assert.equal(openVerdict(null).ok, false);
});

test("holdVerdict: the `hold` label vetoes, in either API shape, case-insensitively", () => {
  assert.equal(HOLD_LABEL, "hold");
  assert.equal(holdVerdict([]).ok, true);
  assert.equal(holdVerdict([{ name: "run-ci" }, "land"]).ok, true);
  assert.equal(holdVerdict([{ name: "Hold" }]).ok, false);
  assert.equal(holdVerdict(["hold"]).ok, false);
});

test("planRow: open items refuse, a `land:` item is exempt, no Plan passes", () => {
  assert.equal(planRow("## Plan\n- [x] done\n- [ ] land: flip ready, add `land`\n").ok, true);
  const open = planRow("## Plan\n- [x] done\n- [ ] write the test\n- [ ] READY to ORCH A\n");
  assert.equal(open.ok, false);
  assert.ok(open.evidence.includes("1 of 3") && open.evidence.includes('"write the test"'), "an older `READY to` item is still exempt: " + open.evidence);
  assert.equal(planRow("## Goal\nx\n").ok, true);
});

test("ciVerdict: the required check-run on the head, newest attempt, success only", () => {
  assert.equal(REQUIRED_CHECK, "CI");
  assert.equal(ciVerdict([]).ok, false);
  assert.equal(ciVerdict([{ id: 1, name: "CI (draft fast tier)", status: "completed", conclusion: "success" }]).ok, false);
  assert.equal(ciVerdict([{ id: 1, name: "CI", app: GHA, status: "in_progress" }]).ok, false);
  assert.equal(ciVerdict([{ id: 1, name: "CI", app: GHA, status: "completed", conclusion: "failure" }, { id: 2, name: "CI", app: GHA, status: "completed", conclusion: "success" }]).ok, true, "newest attempt wins");
  assert.equal(ciVerdict([{ id: 2, name: "CI", app: GHA, status: "completed", conclusion: "success" }, { id: 3, name: "CI", app: GHA, status: "completed", conclusion: "failure" }]).ok, false);
});

test("game paths: js/ css/ assets/ index.html sw.js", () => {
  for (const p of ["js/game.js", "css/career.css", "assets/pack/manifest.json", "index.html", "sw.js", "./js/x.js"]) assert.equal(isGamePath(p), true, p);
  for (const p of ["tests/unit/ready-gate.test.mjs", "tools/ci/merge-gate.mjs", "docs/TESTING.md", "index.html.bak", "jsx/x"]) assert.equal(isGamePath(p), false, p);
  assert.deepEqual(gameFiles(["tools/ci/ready-gate.mjs", "js/core/log.js"]), ["js/core/log.js"]);
  assert.equal(touchesGame(["docs/WORKERS.md", "tools/ci/merge-gate.mjs", ".github/workflows/land.yml", "index.html.bak"]), false);
  assert.equal(touchesGame(["docs/a.md", "sw.js"]), true);
  assert.equal(touchesGame([]), false, "an empty diff touches nothing");
});

// A base's first-parent history, newest first: merges are counted only when their diff touches a game path.
const commit = (n, files, merge = true) => ({ sha: sha(n), parents: merge ? [sha(n + 1), sha(9)] : [sha(n + 1)], files });
const HISTORY = [commit(1, ["js/game.js"]), commit(2, ["docs/TESTING.md"]), commit(3, ["css/hud.css"]), commit(4, ["js/a.js"], false), commit(5, ["index.html"]), commit(6, ["js/b.js"])];

test("gameMergesBehind counts game merges between the tip and the merge-base; non-game merges and plain commits do not count", () => {
  assert.deepEqual(gameMergesBehind(HISTORY, sha(6)), { count: 3, shas: [sha(1), sha(3), sha(5)], reached: true });
  assert.deepEqual(gameMergesBehind(HISTORY, sha(1)), { count: 0, shas: [], reached: true }, "a PR based on the tip");
  assert.deepEqual(gameMergesBehind(HISTORY, sha(3)), { count: 1, shas: [sha(1)], reached: true });
  assert.equal(gameMergesBehind(HISTORY, "none").reached, false, "a merge-base off the first-parent line");
  assert.equal(gameMergesBehind(HISTORY, "none").count, 4);
});

test("distanceVerdict: at most N game merges behind (default 12); an off-line merge-base counts everything walked", () => {
  assert.equal(MAX_BEHIND, 12);
  assert.equal(distanceVerdict(HISTORY, sha(6)).ok, true, "3 behind passes the default");
  assert.ok(distanceVerdict(HISTORY, sha(6)).evidence.includes("(max 12)"));
  assert.equal(distanceVerdict(HISTORY, sha(3), 2).ok, true);
  assert.equal(distanceVerdict(HISTORY, sha(5), 2).ok, true, "exactly N passes");
  const over = distanceVerdict(HISTORY, sha(6), 2);
  assert.equal(over.ok, false);
  assert.ok(over.evidence.includes("3 game merge(s)") && over.evidence.includes("sync-pr"), over.evidence);
  assert.equal(distanceVerdict(HISTORY, sha(6), 3).ok, true, "--max-behind 3");
  assert.equal(distanceVerdict(HISTORY, sha(6), 0).ok, false);
  assert.equal(distanceVerdict(HISTORY, "none", 4).ok, true);
  assert.ok(distanceVerdict(HISTORY, "none", 4).evidence.includes("off the base's first-parent line"));
});

test("baseHistory / distanceFor over a real repo: first-parent merges with their first-parent diff, down to the merge-base", () => {
  const T = scratch("merge-gate-distance-");
  const g = (cwd, ...a) => { const r = spawnSync("git", ["-c", "user.email=t@t", "-c", "user.name=t", ...a], { cwd, encoding: "utf8" }); assert.equal(r.status, 0, `${a.join(" ")}: ${r.stderr}`); return r.stdout.trim(); };
  const write = (rel, text) => { fs.mkdirSync(path.dirname(path.join(T, rel)), { recursive: true }); fs.writeFileSync(path.join(T, rel), text); };
  const land = (name, rel) => { g(T, "checkout", "-q", "-b", name, "base"); write(rel, name + "\n"); g(T, "add", "-A"); g(T, "commit", "-qm", name); g(T, "checkout", "-q", "base"); g(T, "merge", "-q", "--no-ff", "-m", `merge ${name}`, name); };
  try {
    // Fixture paths reuse the names docs-integrity's SOURCE_EXEMPT already allows for this file.
    g(T, "init", "-q", "-b", "base"); write("README", "0\n"); write("js/b.js", "old\n"); g(T, "add", "-A"); g(T, "commit", "-qm", "root");
    const fork = g(T, "rev-parse", "HEAD");
    g(T, "checkout", "-q", "-b", "pr", "base"); write("tools/x.mjs", "pr\n"); write("js/b.js", "pr\n"); g(T, "add", "-A"); g(T, "commit", "-qm", "the PR");
    const head = g(T, "rev-parse", "HEAD");
    g(T, "checkout", "-q", "-b", "docs-pr", "base"); write("docs/a.md", "pr\n"); write("tools/x.mjs", "pr\n"); g(T, "add", "-A"); g(T, "commit", "-qm", "a docs and tools PR");
    const docsHead = g(T, "rev-parse", "HEAD");
    g(T, "checkout", "-q", "-b", "mover", "base"); write("tools/y.mjs", "old\n"); g(T, "rm", "-q", "js/b.js"); g(T, "add", "-A"); g(T, "commit", "-qm", "move a game file out of js/");
    const moverHead = g(T, "rev-parse", "HEAD");
    land("game-1", "js/a.js"); land("docs-1", "docs/a.md"); land("game-2", "css/a.css");
    write("tools/y.mjs", "direct\n"); g(T, "add", "-A"); g(T, "commit", "-qm", "direct commit");   // not a merge: never counts
    const tip = g(T, "rev-parse", "base");
    const h = baseHistory({ tip, mergeBase: fork, cwd: T });
    assert.equal(h.commits.length, 5, "direct, game-2, docs-1, game-1, root");
    assert.equal(h.commits.at(-1).sha, fork, "the merge-base closes the walk");
    assert.deepEqual(h.commits.filter((c) => c.parents.length > 1).map((c) => c.files), [["css/a.css"], ["docs/a.md"], ["js/a.js"]], "a merge's files are its first-parent diff");
    assert.deepEqual(h.commits[0].files, [], "plain commits carry no file list");
    const d = distanceFor({ head, tip, cwd: T });
    assert.equal(d.mergeBase, fork);
    assert.equal(d.row.ok, true, d.row.evidence);
    assert.ok(d.row.evidence.startsWith("2 game merge(s)"), d.row.evidence);
    assert.equal(distanceFor({ head, tip, cwd: T, max: 1 }).row.ok, false);
    const docs = distanceFor({ head: docsHead, tip, cwd: T, max: 0 });
    assert.equal(docs.mergeBase, fork);
    assert.deepEqual(docs.row, { ok: true, evidence: "no game files in this PR's diff (2 file(s)): distance not applied" }, "a PR touching no game path is not held to the distance");
    assert.equal(g(T, "-c", "diff.renames=true", "diff", "--name-only", fork, moverHead), "tools/y.mjs", "with rename detection git names only the destination");
    assert.equal(distanceFor({ head: moverHead, tip, cwd: T, max: 1 }).row.ok, false, "a rename out of js/ still touches js/ (--no-renames)");
    assert.ok(/failed/.test(distanceFor({ head: "0".repeat(40), tip, cwd: T }).error), "an unknown head is an error, not a row");
  } finally { fs.rmSync(T, { recursive: true, force: true }); }
});

test("distanceFor: 20 game merges behind refuses a game PR and passes a PR whose own diff touches no game path (fake git)", () => {
  const id = (i) => "f" + i.toString(16).padStart(39, "0");   // distinct fake shas
  const MB = id(999), TIP20 = id(0);
  const fakeGit = (prFiles, calls) => (args) => {
    calls.push(args[0]);
    const ok = (lines) => ({ status: 0, stdout: lines.join("\n") + "\n", stderr: "" });
    if (args[0] === "merge-base") return ok([MB]);
    if (args[0] === "diff") { assert.deepEqual(args, ["diff", "--no-renames", "--name-only", MB, HEAD], "the PR's own diff: merge-base..head, renames split"); return ok(prFiles); }
    if (args[0] === "rev-list") return ok([...Array.from({ length: 20 }, (_, i) => `${id(i)} ${i === 19 ? MB : id(i + 1)} ${id(500 + i)}`), `${MB} ${id(1000)}`]);
    if (args[0] === "diff-tree") return ok(["css/a.css"]);
    return { status: 1, stdout: "", stderr: `unexpected git ${args[0]}` };
  };
  const calls = [];
  const game = distanceFor({ head: HEAD, tip: TIP20, run: fakeGit(["docs/a.md", "js/a.js"], calls) });
  assert.equal(game.row.ok, false);
  assert.ok(game.row.evidence.startsWith("base is 20 game merge(s) ahead of the merge-base (max 12)"), game.row.evidence);
  assert.ok(calls.includes("rev-list"));
  calls.length = 0;
  const docs = distanceFor({ head: HEAD, tip: TIP20, run: fakeGit(["docs/WORKERS.md", "tools/ci/merge-gate.mjs", "tests/unit/merge-gate.test.mjs", ".github/workflows/land.yml"], calls) });
  assert.deepEqual(docs, { row: { ok: true, evidence: "no game files in this PR's diff (4 file(s)): distance not applied" }, mergeBase: MB });
  assert.deepEqual(calls, ["merge-base", "diff"], "no base walk for a PR that touches no game path");
  const broken = distanceFor({ head: HEAD, tip: TIP20, run: (a) => (a[0] === "merge-base" ? { status: 0, stdout: MB + "\n" } : { status: 128, stdout: "", stderr: "fatal: bad object" }) });
  assert.equal(broken.error, `diff ${MB.slice(0, 8)}..${HEAD.slice(0, 8)} failed: fatal: bad object`, "a failed diff is an error, never a pass");
});

// The assert-match ratchet counts the literal text of the pin, so the fixtures spell it from parts.
const PIN = ["assert", "match"].join(".");
const OVER = "over a ratchet on the merge result: ";
const NEVER_RAISE = " — convert the pins or extract, never raise the ceiling for someone else's overage";

test("ratchetsOnMerge: every count check runs on the merge result against the tip; an overage names its sites; a check that cannot run fails", () => {
  const out = (status, stdout = "", extra = {}) => ({ status, stdout, stderr: "", ...extra });
  const seen = [];
  const runWith = (byScript) => (cmd, argv, o) => { seen.push([argv, o.env]); return byScript[argv[0] === "--test" ? argv[1] : "ratchets"] || byScript.tests; };
  assert.deepEqual(ratchetsOnMerge({ run: runWith({ ratchets: out(0), tests: out(0) }) }), { ok: true, evidence: "ratchets.mjs and the whole-tree count tests hold on the merge result" });
  assert.deepEqual(seen.map(([a]) => a.at(-1)), ["tools/check/ratchets.mjs", ...["assert-match-ratchet", "source-pin-hygiene", "vm-filename-lint", "test-groups", "docs-integrity", "output-surface"].map((f) => `tests/unit/${f}.test.mjs`)]);
  assert.ok(seen.every(([, env]) => env.APEX_RATCHET_BASE_REF === "HEAD" && !("NODE_TEST_CONTEXT" in env) && !("APEX_RATCHET_ABSOLUTE" in env)));
  const pinFail = out(1, `error: '7317 ${PIN} sites (ceiling 7316) — convert a source pin'`);
  const both = ratchetsOnMerge({ run: runWith({ ratchets: out(1, "css/hud.css codeLines 2300 > 2279"), tests: out(0), "tests/unit/assert-match-ratchet.test.mjs": pinFail }) });
  assert.equal(both.evidence, `${OVER}ratchets.mjs: css/hud.css codeLines 2300 > 2279; assert-match ceiling: 7317 ${PIN} sites (ceiling 7316)${NEVER_RAISE}`, "both overages, not just the first");
  assert.deepEqual(ratchetsOnMerge({ run: runWith({ ratchets: out(null, "", { error: new Error("spawn ENOENT") }), tests: out(0) }) }), { ok: false, evidence: `${OVER}ratchets.mjs: spawn ENOENT${NEVER_RAISE}` });
});

test("two PRs each at the assert-match ceiling alone are over it on the merge result (#3236 + #3237, 2026-10-20)", () => {
  const T = scratch("merge-gate-shape-");
  const git = (cwd, ...a) => { const r = spawnSync("git", ["-c", "user.email=t@t", "-c", "user.name=t", ...a], { cwd, encoding: "utf8" }); assert.equal(r.status, 0, `${a.join(" ")}: ${r.stderr}`); return r.stdout.trim(); };
  const write = (root, rel, text) => { fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true }); fs.writeFileSync(path.join(root, rel), text); };
  const pins = (n) => Array.from({ length: n }, () => `${PIN}(a, /b/);`).join("\n") + "\n";
  try {
    const remote = path.join(T, "remote.git"), W = path.join(T, "w");
    git(T, "init", "-q", "--bare", remote); git(T, "clone", "-q", remote, W); git(W, "checkout", "-q", "-b", "deploy-x");
    const UNIT = "tests/unit";   // built, not spelled: the path-reference lint reads no phantom file
    for (const rel of [`${UNIT}/assert-match-ratchet.test.mjs`, "tools/check/ratchets.mjs", "tools/hooks/ratchet-reason.mjs"]) write(W, rel, fs.readFileSync(path.join(ROOT, rel), "utf8"));
    write(W, "tests/data/ratchets.json", JSON.stringify({ files: {}, tree: { assertPins: 3 } }) + "\n");
    write(W, `${UNIT}/base.test.mjs`, pins(2));
    git(W, "add", "-A"); git(W, "commit", "-q", "-m", "base: 2 pins, ceiling 3"); git(W, "push", "-q", "origin", "deploy-x");
    for (const [name, file] of [["pr1", "one.test.mjs"], ["pr2", "two.test.mjs"]]) {   // each adds one pin: 3 of 3 alone
      git(W, "checkout", "-q", "-b", name, "deploy-x"); write(W, `${UNIT}/${file}`, pins(1));
      git(W, "add", "-A"); git(W, "commit", "-q", "-m", `${name}: one pin`); git(W, "push", "-q", "origin", name);
    }
    const head2 = git(W, "rev-parse", "pr2");
    const gate = () => localMergeGenCheck({ pr: 2, head: head2, headRef: "pr2", cwd: W, base: "deploy-x",
      run: (cmd, argv, o) => (cmd === "npm" || (argv[0] === "--test" && !argv[1].endsWith("assert-match-ratchet.test.mjs")) ? { status: 0, stdout: "", stderr: "" } : spawnSync(cmd, argv, o)) });
    const alone = gate();
    assert.equal(alone.ok && alone.ratchets.ok, true, `pr2 alone is at the ceiling, not over it: ${alone.evidence} / ${alone.ratchets?.evidence}`);
    git(W, "checkout", "-q", "deploy-x"); git(W, "merge", "-q", "--no-ff", "-m", "merge pr1", "pr1"); git(W, "push", "-q", "origin", "deploy-x");
    const together = gate();
    assert.equal(together.ok, true, "the merge and gen:check are fine: only the ratchet row sees the overage");
    assert.equal(together.ratchets.ok, false, "pr2 adds the 4th pin onto a tip already at 3");
    assert.ok(/assert-match ceiling: 4 pin-shaped asserts \(ceiling 3; base 3\/3\)/.test(together.ratchets.evidence), together.ratchets.evidence);
  } finally { fs.rmSync(T, { recursive: true, force: true }); }
});

test("localMergeGenCheck: a gen:check failure and a conflict each return the fetched tip with the refusal (2026-10-27 23:20Z)", () => {
  const T = scratch("merge-gate-tip-");
  const git = (cwd, ...a) => { const r = spawnSync("git", ["-c", "user.email=t@t", "-c", "user.name=t", ...a], { cwd, encoding: "utf8" }); assert.equal(r.status, 0, `${a.join(" ")}: ${r.stderr}`); return r.stdout.trim(); };
  const write = (root, rel, text) => { fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true }); fs.writeFileSync(path.join(root, rel), text); };
  try {
    const remote = path.join(T, "remote.git"), W = path.join(T, "w");
    git(T, "init", "-q", "--bare", remote); git(T, "clone", "-q", remote, W); git(W, "checkout", "-q", "-b", "deploy-x");
    write(W, "docs/a.md", "base\n"); git(W, "add", "-A"); git(W, "commit", "-q", "-m", "base"); git(W, "push", "-q", "origin", "deploy-x");
    git(W, "checkout", "-q", "-b", "pr", "deploy-x"); write(W, "docs/a.md", "pr\n"); git(W, "add", "-A"); git(W, "commit", "-q", "-m", "the PR"); git(W, "push", "-q", "origin", "pr");
    const head = git(W, "rev-parse", "pr"), tip = git(W, "rev-parse", "deploy-x");
    const gate = (run) => localMergeGenCheck({ pr: 3, head, headRef: "pr", cwd: W, base: "deploy-x", run, ratchets: () => assert.fail("no ratchets after a refusal") });
    const gen = gate((cmd) => (cmd === "npm" ? { status: 1, stdout: "docs/agent-index.json is stale: run npm run gen", stderr: "" } : assert.fail(`unexpected ${cmd}`)));
    assert.equal(gen.ok, false);
    assert.equal(gen.error, undefined, "a refusal, not a git error");
    assert.equal(gen.tip, tip, "the tip is known once fetched: distance still evaluates on it");
    assert.ok(gen.evidence.startsWith(`gen:check fails on the merge onto ${tip.slice(0, 8)}: docs/agent-index.json is stale`), gen.evidence);
    git(W, "checkout", "-q", "deploy-x"); write(W, "docs/a.md", "tip\n"); git(W, "add", "docs/a.md"); git(W, "commit", "-q", "-m", "tip edits the same line"); git(W, "push", "-q", "origin", "deploy-x");
    const moved = git(W, "rev-parse", "deploy-x");
    const conflict = gate(() => assert.fail("gen:check never runs on a conflict"));
    assert.equal(conflict.ok, false);
    assert.equal(conflict.tip, moved);
    assert.ok(conflict.evidence.startsWith(`conflicts with the current tip ${moved.slice(0, 8)}: docs/a.md`), conflict.evidence);
  } finally { fs.rmSync(T, { recursive: true, force: true }); }
});

/** A fake GitHub plus fake merge and distance for the evaluator; `pull` and `checks` are mutable per case. */
function fakes() {
  const pull = { state: "open", draft: false, labels: [], head: { sha: HEAD, ref: "cursor/x" }, base: { ref: "deploy-x" }, body: "## Plan\n- [x] done\n- [ ] land: flip + label\n" };
  const checks = [{ id: 1, name: "Structural guards", status: "completed", conclusion: "success" }, { id: 2, name: "CI", app: GHA, status: "completed", conclusion: "success", check_suite: { id: 50 } }];
  const runs = [{ id: 500, check_suite_id: 50, path: ".github/workflows/ci.yml" }];
  const calls = [];
  const request = (p) => {
    if (p === "pulls/7") return { json: pull };
    if (p.startsWith("commits/")) return { json: { check_runs: checks, total_count: checks.length } };
    if (p.startsWith(`actions/workflows/ci.yml/runs?head_sha=${HEAD}`)) return { json: { workflow_runs: runs, total_count: runs.length } };
    return { error: `unexpected ${p}` };
  };
  const localMerge = (a) => { calls.push(a); return { ok: true, evidence: "merges clean", tip: TIP, ratchets: { ok: true, evidence: "hold" } }; };
  const distance = ({ max }) => ({ row: { ok: max >= 1, evidence: `1 game merge(s) (max ${max})` }, mergeBase: sha(5) });
  const fetchTip = (a) => { calls.push({ fetch: a }); return { tip: TIP }; };
  return { pull, checks, runs, calls, deps: { request, root: "/nowhere", localMerge, distance, fetchTip } };
}

test("evaluate: all rows in order; each failing row refuses on its own; the local rows wait for an open PR; API errors are errors, not rows", () => {
  const f = fakes();
  const v = evaluate({ pr: 7, ...f.deps });
  assert.equal(v.ok, true, JSON.stringify(v.rows));
  assert.deepEqual(Object.keys(v.rows), ROWS);
  assert.deepEqual([v.head, v.base, v.tip], [HEAD, "deploy-x", TIP]);
  assert.deepEqual(f.calls[0], { pr: 7, head: HEAD, headRef: "cursor/x", cwd: "/nowhere", base: "deploy-x" }, "the merge targets the PR's own base");
  f.pull.labels = [{ name: "hold" }];
  assert.deepEqual(ROWS.filter((k) => !evaluate({ pr: 7, ...f.deps }).rows[k].ok), ["hold"]);
  f.pull.labels = []; f.pull.body = "## Plan\n- [ ] still open\n";
  assert.deepEqual(ROWS.filter((k) => !evaluate({ pr: 7, ...f.deps }).rows[k].ok), ["plan"]);
  f.pull.body = ""; f.checks[1].conclusion = "failure";
  assert.deepEqual(ROWS.filter((k) => !evaluate({ pr: 7, ...f.deps }).rows[k].ok), ["ci"]);
  f.checks[1].conclusion = "success";
  assert.deepEqual(ROWS.filter((k) => !evaluate({ pr: 7, ...f.deps, maxBehind: 0 }).rows[k].ok), ["distance"]);
  const refused = evaluate({ pr: 7, ...f.deps, localMerge: () => ({ ok: false, evidence: "conflicts with the current tip", tip: TIP }) });
  assert.deepEqual(ROWS.filter((k) => !refused.rows[k].ok), ["gen", "ratchets"], "a refused merge leaves the ratchets unproven");
  f.pull.draft = true; f.calls.length = 0;
  const draft = evaluate({ pr: 7, ...f.deps });
  assert.deepEqual(ROWS.filter((k) => !draft.rows[k].ok), ["open", "gen", "ratchets", "distance"]);
  assert.equal(f.calls.length, 0, "no throw-away merge for a PR that is not open and ready");
  f.pull.draft = false;
  assert.deepEqual(ROWS.filter((k) => !evaluate({ pr: 7, sha: "b".repeat(40), ...f.deps }).rows[k].ok), ["open", "gen", "ratchets", "distance"], "--sha must be the current head");
  assert.equal(evaluate({ pr: 7, sha: HEAD.slice(0, 12), ...f.deps }).ok, true, "a prefix of the head is the head");
  assert.ok(/HTTP 500/.test(evaluate({ pr: 7, ...f.deps, request: () => ({ error: "HTTP 500" }) }).error));
  assert.ok(/fetch failed/.test(evaluate({ pr: 7, ...f.deps, localMerge: () => ({ ok: false, evidence: "fetch failed", error: true }) }).error));
});

test("evaluate: a gen:check or conflict refusal refuses on its own row, never masked as an error; no tip is a distance FAIL row (#3964, 2026-10-27)", () => {
  const f = fakes();
  // distanceFor's real shape: an empty tip fails its merge-base, which evaluate used to return as { error }.
  const strict = ({ tip, max }) => (tip ? { row: { ok: true, evidence: `0 game merge(s) (max ${max})` }, mergeBase: sha(5) } : { error: `merge-base of ${HEAD.slice(0, 8)} and  failed (shallow clone? fetch-depth: 0)` });
  const GEN_TIP = "abc" + "0".repeat(37);
  const genFail = () => ({ ok: false, evidence: `gen:check fails on the merge onto ${GEN_TIP.slice(0, 8)}: docs/agent-index.json drift`, tip: GEN_TIP });
  const v = evaluate({ pr: 7, ...f.deps, distance: strict, localMerge: genFail });
  assert.equal(v.error, undefined, v.error);
  assert.deepEqual([v.ok, v.waiting, v.tip], [false, false, GEN_TIP]);
  assert.deepEqual(ROWS.filter((k) => !v.rows[k].ok), ["gen", "ratchets"], "distance still evaluates on the refusal's tip");
  assert.ok(v.rows.gen.evidence.startsWith("gen:check fails"), v.rows.gen.evidence);
  const logs = [];
  assert.equal(main(["--pr", "7", "--sha", HEAD, "--check"], { ...f.deps, distance: strict, localMerge: genFail, log: (l) => logs.push(l) }), 2, "a refusal (exit 2), not an error (exit 1)");
  assert.ok(logs.some((l) => l.startsWith("= gate gen: FAIL gen:check fails")), logs.join("\n"));
  assert.equal(logs.at(-1), `= merge-gate refused — open=ok hold=ok plan=ok ci=ok gen=FAIL ratchets=FAIL distance=ok pr=#7 sha=${HEAD} tip=${GEN_TIP}`);
  const noTip = evaluate({ pr: 7, ...f.deps, distance: strict, localMerge: () => ({ ok: false, evidence: "conflicts with the current tip", tip: "" }) });
  assert.equal(noTip.error, undefined, noTip.error);
  assert.deepEqual(ROWS.filter((k) => !noTip.rows[k].ok), ["gen", "ratchets", "distance"]);
  assert.equal(noTip.rows.distance.evidence, "not evaluated: no tip");
  const trustedNoTip = evaluate({ pr: 7, ...f.deps, distance: strict, trusted: true, fetchTip: () => ({ tip: "" }) });
  assert.equal(trustedNoTip.error, undefined, trustedNoTip.error);
  assert.deepEqual(TRUSTED_ROWS.filter((k) => !trustedNoTip.rows[k].ok), ["distance"]);
});

test("main: one `= gate <row>:` line per row and a summary; exit 0 all ok, 2 a row failed, 1 usage/API error; --json writes the summary", () => {
  const f = fakes();
  const logs = [];
  const written = {};
  const deps = { ...f.deps, log: (l) => logs.push(l), write: (p, text) => { written[p] = JSON.parse(text); } };
  assert.equal(main(["--pr", "7", "--sha", HEAD, "--check"], deps), 0);
  assert.deepEqual(logs.slice(0, 7).map((l) => l.split(" ").slice(0, 4).join(" ")), ROWS.map((k) => `= gate ${k}: ok`));
  assert.ok(logs[7].startsWith("= merge-gate passed — open=ok hold=ok plan=ok ci=ok gen=ok ratchets=ok distance=ok pr=#7 sha=" + HEAD), logs[7]);
  logs.length = 0;
  assert.equal(main(["--pr", "7", "--max-behind", "0", "--json", "artifacts/g.json"], deps), 2);
  assert.ok(logs.some((l) => l.startsWith("= gate distance: FAIL")), logs.join("\n"));
  assert.ok(logs.at(-1).startsWith("= merge-gate refused —"));
  const j = written["/nowhere/artifacts/g.json"];
  assert.equal(j.ok, false); assert.equal(j.maxBehind, 0); assert.equal(j.rows.distance.ok, false);
  assert.equal(main(["--pr", "7", "--sha", "b".repeat(40)], deps), 2, "a stale --sha refuses");
  assert.equal(main([], deps), 1, "no --pr");
  assert.equal(main(["--pr", "7", "--max-behind", "x"], deps), 1, "bad --max-behind");
  assert.equal(main(["--pr", "7"], { ...deps, request: () => ({ error: "HTTP 502" }) }), 1, "API error");
  assert.ok(logs.at(-1).startsWith("= merge-gate error — PR #7: HTTP 502"));
  assert.deepEqual(rowLines({ ok: false, pr: 1, rows: { open: { ok: false, evidence: "PR is closed" } } }), ["= gate open: FAIL PR is closed", "= merge-gate refused — open=FAIL pr=#1 sha= tip="]);
});

// ---- the receipt the hooks still read (tools/lib/gate-receipt.mjs): ready-gate writes it before a draft→ready flip;
// .claude/hooks/merge_policy.py is its Python twin and the two must agree on every case. No tool writes a merge
// receipt any more (a session never merges), so the hook's merge door stays shut by design.
const PY = (code, input) => { const r = spawnSync("python3", ["-c", `import json,sys; sys.path.insert(0, ${JSON.stringify(path.join(ROOT, ".claude/hooks"))}); import merge_policy as P; ${code}`], { input, encoding: "utf8" }); assert.equal(r.status, 0, r.stderr); return JSON.parse(r.stdout.trim()); };

test("receiptVerdict (JS) and merge_policy.receipt_check (Python) agree: same PR and kind, ok, fresh; a merge pins its head", () => {
  const dir = scratch("gate-receipt-");
  try {
    const now = Date.parse("2026-10-19T20:00:00Z");
    const at = (minAgo) => new Date(now - minAgo * 60000).toISOString();
    const both = (kind, pr, head) => {
      const js = receiptVerdict(readReceipt(dir, kind, pr), { kind, pr, head, now });
      const [pok, pwhy] = PY(`print(json.dumps(P.receipt_check(${JSON.stringify(dir)}, ${JSON.stringify(kind)}, ${pr}, ${JSON.stringify(head)}, now=${now / 1000})))`);
      assert.equal(pok, js.ok, `python and js disagree for ${kind} #${pr}: js=${js.why} py=${pwhy}`);
      if (!js.ok) assert.ok(pwhy.length > 10, "python says why");
      return js;
    };
    assert.ok(/no ready-gate receipt for #7/.test(both("ready", 7, "").why));
    assert.equal(both("merge", 0, HEAD).ok, false);
    writeReceipt(dir, "ready", { pr: 7, head: HEAD, ok: true, at: at(5) });
    assert.equal(fs.existsSync(receiptPath(dir, "ready", 7)), true);
    assert.equal(both("ready", 7, "").ok, true, "a ready receipt needs no head pin");
    assert.equal(both("merge", 7, HEAD).ok, false, "a ready receipt is not a merge receipt");
    assert.equal(MAX_AGE_MIN, 10);
    writeReceipt(dir, "ready", { pr: 7, head: HEAD, ok: true, at: at(MAX_AGE_MIN + 1) });
    assert.ok(/min old/.test(both("ready", 7, "").why));
    writeReceipt(dir, "ready", { pr: 7, head: HEAD, ok: false, evidence: "plan-open: 1 of 3 Plan item(s) open", at: at(1) });
    assert.ok(/refused \(plan-open/.test(both("ready", 7, "").why));
    // WP-L4: the hook doors pass require_head for a ready flip — with no live head known, the receipt refuses.
    writeReceipt(dir, "ready", { pr: 7, head: HEAD, ok: true, at: at(1) });
    const [rok, rwhy] = PY(`print(json.dumps(P.receipt_check(${JSON.stringify(dir)}, "ready", 7, None, now=${now / 1000}, require_head=True)))`);
    assert.equal(rok, false);
    assert.match(rwhy, /live head is unknown/);
    assert.equal(PY(`print(json.dumps(P.receipt_check(${JSON.stringify(dir)}, "ready", 7, ${JSON.stringify(HEAD)}, now=${now / 1000}, require_head=True)))`)[0], true);
    // writeReceipt refuses "merge" (no tool writes one): the readers' merge case is a hand-written fixture of the
    // pure twin only. Since WP-L4 no hook door consults a merge receipt (tests/unit/bash-guard-hardening.test.mjs).
    fs.mkdirSync(path.dirname(receiptPath(dir, "merge", 7)), { recursive: true });
    fs.writeFileSync(receiptPath(dir, "merge", 7), JSON.stringify({ kind: "merge", pr: 7, head: HEAD, ok: true, at: at(1) }));
    assert.equal(both("merge", 7, HEAD.slice(0, 10)).ok, true, "a prefix pins the same head");
    assert.ok(/pin expectedHeadSha/.test(both("merge", 7, "").why));
    assert.ok(/not the gated head/.test(both("merge", 7, "b".repeat(40)).why));
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test("a receipt written from a linked worktree also lands in the main checkout the hooks read", () => {
  const main = scratch("rcpt-main-");
  const wt = path.join(main, "..", path.basename(main) + "-wt");
  const g = (cwd, ...a) => { const r = spawnSync("git", a, { cwd, encoding: "utf8" }); assert.equal(r.status, 0, r.stderr); return r.stdout.trim(); };
  try {
    g(main, "init", "-q"); g(main, "-c", "user.email=t@t", "-c", "user.name=t", "commit", "-q", "--allow-empty", "-m", "x");
    g(main, "worktree", "add", "-q", wt);
    assert.equal(mainCheckout(main), null);
    assert.equal(fs.realpathSync(mainCheckout(wt)), fs.realpathSync(main));
    writeReceipt(wt, "ready", { pr: 9, head: HEAD, ok: true });
    assert.equal(readReceipt(main, "ready", 9).pr, 9, "the hook's root has the receipt");
  } finally { fs.rmSync(wt, { recursive: true, force: true }); fs.rmSync(main, { recursive: true, force: true }); }
});

test("a receipt records the gate files' sha256; gateFilesVerdict (JS) and gate_files_check (Python) refuse an edited or uncommitted gate", () => {
  const dir = scratch("gate-files-");
  const g = (...a) => spawnSync("git", ["-C", dir, ...a], { encoding: "utf8" });
  try {
    g("init", "-q"); g("config", "user.email", "t@t"); g("config", "user.name", "t");
    for (const f of gateClosure(ROOT)) { fs.mkdirSync(path.dirname(path.join(dir, f)), { recursive: true }); fs.copyFileSync(path.join(ROOT, f), path.join(dir, f)); }
    g("add", "-A"); g("commit", "-qm", "gate");
    writeReceipt(dir, "ready", { pr: 5, head: HEAD, ok: true }, { main: null, gateRoot: dir });
    const rc = readReceipt(dir, "ready", 5);
    assert.deepEqual(rc.gateFiles, gateFileHashes(dir));
    const both = (receipt) => { const js = gateFilesVerdict(dir, receipt); const [ok, why] = PY(`print(json.dumps(P.gate_files_check(${JSON.stringify(dir)}, json.loads(sys.stdin.read()))))`, JSON.stringify(receipt)); assert.equal(ok, js.ok, `js=${js.why} py=${why}`); return js; };
    assert.equal(both(rc).ok, true, "the committed gate's receipt");
    const f = path.join(dir, "tools/ci/ready-gate.mjs");
    const orig = fs.readFileSync(f, "utf8");
    fs.writeFileSync(f, orig + "// edited\n");
    assert.ok(/not the file that wrote this receipt/.test(both(rc).why));
    assert.ok(/differ from HEAD/.test(both({ ...rc, gateFiles: gateFileHashes(dir) }).why), "the edited gate hashed itself: still refused");
    fs.writeFileSync(f, orig);
    assert.ok(/no gate-file hashes/.test(both({ ...rc, gateFiles: undefined }).why));
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test("untrustedEnv: the merge result's scripts get no token and no runner file-command path (land.yml gate)", () => {
  const env = untrustedEnv({
    PATH: "/usr/bin", HOME: "/home/runner", CI: "true", GITHUB_REPOSITORY: "o/r", GITHUB_SHA: "abc",
    GH_TOKEN: "x", GITHUB_TOKEN: "x", LAND_TOKEN: "x", NODE_AUTH_TOKEN: "x", ACTIONS_RUNTIME_TOKEN: "x", ACTIONS_ID_TOKEN_REQUEST_URL: "u",
    GITHUB_OUTPUT: "/o", GITHUB_ENV: "/e", GITHUB_PATH: "/p", GITHUB_STATE: "/s", GITHUB_STEP_SUMMARY: "/sum", SOME_SECRET: "x",
  });
  assert.deepEqual(Object.keys(env).sort(), ["CI", "GITHUB_REPOSITORY", "GITHUB_SHA", "HOME", "PATH"]);
});

// System audit 4 (2026-10-26) group A1, ported from the base on the 2026-10-27 sync: the gate closure, future-dated
// receipts, the ready head pin and the READY claim path (tools/lib/gate-receipt.mjs).
test("audit 4: the hashed gate set is the static import closure, recorded in the receipt", () => {
  assert.deepEqual(staticImports(`import a from "./a.mjs";\nimport {\n  b,\n  c as d\n} from "../lib/b.mjs";\nimport "./side.mjs";\nexport * from "./e.mjs";\nexport { f } from "./f.mjs";\nconst s = 'x from "./not.mjs"';\nimport fs from "node:fs";\n`),
    ["./a.mjs", "../lib/b.mjs", "./side.mjs", "./e.mjs", "./f.mjs"]);
  const c = gateClosure(ROOT);
  assert.deepEqual([...GATE_FILES, "tools/ci/github-api.mjs", "tools/lib/cli-args.mjs"].filter((f) => !c.includes(f)), []);
  assert.deepEqual(Object.keys(gateFileHashes(ROOT)).sort(), c);
  const dir = scratch("gate-closure-");
  try {
    writeReceipt(dir, "ready", { pr: 3, head: HEAD, ok: true }, { main: null });
    const rc = readReceipt(dir, "ready", 3);
    assert.deepEqual(rc.gateClosure, c, "the list rides in the receipt for the Python twin");
    assert.deepEqual(Object.keys(rc.gateFiles).sort(), c, "gateFiles maps every closure file");
    // a receipt that recorded only the three seeds (an older gate) is refused by the closure check
    const seeds = Object.fromEntries(GATE_FILES.map((f) => [f, rc.gateFiles[f]]));
    const unrec = c.filter((f) => !GATE_FILES.includes(f));
    assert.equal(gateFilesVerdict(ROOT, { ...rc, gateRoot: ROOT, gateFiles: seeds }).why,
      `the receipt does not record ${unrec.slice(0, 4).join(", ")}${unrec.length > 4 ? ", ..." : ""} of the gate's import closure in ${ROOT} (an older gate or an edited import): re-run the gate`);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test("audit 4: a future-dated receipt is refused; a ready receipt is pinned to the PR's current head", () => {
  const now = Date.parse("2026-10-26T20:00:00Z");
  const r = (sAhead, extra = {}) => ({ kind: "merge", pr: 7, head: HEAD, ok: true, at: new Date(now + sAhead * 1000).toISOString(), ...extra });
  assert.equal(MAX_FUTURE_S, 60);
  assert.equal(receiptVerdict(r(30), { kind: "merge", pr: 7, head: HEAD, now }).ok, true, "seconds of clock skew pass");
  const future = (s) => `the merge-gate receipt for #7 is dated ${s} s in the future (max 60): a receipt is written by the gate, never by hand; re-run the gate`;
  assert.equal(receiptVerdict(r(3600), { kind: "merge", pr: 7, head: HEAD, now }).why, future(3600));
  assert.equal(receiptVerdict(r(0, { at: "2099-01-01T00:00:00Z" }), { kind: "merge", pr: 7, head: HEAD, now }).why, future(Math.round((Date.parse("2099-01-01T00:00:00Z") - now) / 1000)));
  const ready = r(-60, { kind: "ready" });
  assert.equal(receiptVerdict(ready, { kind: "ready", pr: 7, now }).ok, true, "no head known: age and ok only");
  assert.equal(receiptVerdict(ready, { kind: "ready", pr: 7, head: HEAD.slice(0, 9), now }).ok, true);
  assert.equal(receiptVerdict(ready, { kind: "ready", pr: 7, head: "b".repeat(40), now }).why, "the PR head is bbbbbbbbbbbb, but ready-gate passed on aaaaaaaaaaaa: re-run ready-gate on the current head");
  assert.equal(headPinProblem(HEAD, HEAD.slice(0, 7)), "");
  assert.notEqual(headPinProblem(HEAD, "aaaa"), "", "under 7 hex never pins");
});

test("audit 4: gateFilesVerdict refuses a receipt whose gate-file hash differs from the checkout that wrote it", () => {
  const dir = scratch("ready-claim-");
  try {
    writeReceipt(dir, "ready", { pr: 12, head: HEAD, ok: true }, { main: null });
    const rp = receiptPath(dir, "ready", 12), receipt = JSON.parse(fs.readFileSync(rp, "utf8"));
    assert.equal(gateFilesVerdict(receipt.gateRoot, receipt, { run: () => ({ status: 0 }) }).ok, true, "the hashes writeReceipt took (git stubbed: this checkout may be dirty)");
    receipt.gateFiles["tools/ci/ready-gate.mjs"] = "0".repeat(64);
    assert.deepEqual(gateFilesVerdict(receipt.gateRoot, receipt), { ok: false,
      why: `tools/ci/ready-gate.mjs in ${receipt.gateRoot} is not the file that wrote this receipt: re-run the gate from this checkout` });
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test("CI not finished is WAIT, not FAIL: exit 3 only when every other row is ok (land.yml posts `gate` in_progress)", () => {
  assert.equal(ciVerdict([]).pending, true, "no CI check-run yet");
  assert.equal(ciVerdict([{ id: 1, name: "CI", app: GHA, status: "in_progress" }]).pending, true);
  assert.equal(ciVerdict([{ id: 1, name: "CI", app: GHA, status: "completed", conclusion: "failure" }]).pending, undefined, "a finished red CI refuses");
  const f = fakes();
  f.checks[1].status = "in_progress"; delete f.checks[1].conclusion;
  const logs = [];
  const deps = { ...f.deps, log: (l) => logs.push(l) };
  assert.equal(main(["--pr", "7", "--sha", HEAD, "--check"], deps), 3);
  assert.ok(logs.some((l) => l.startsWith("= gate ci: WAIT CI in_progress")), logs.join("\n"));
  assert.ok(logs.at(-1).startsWith("= merge-gate waiting — open=ok hold=ok plan=ok ci=WAIT"), logs.at(-1));
  f.pull.body = "## Plan\n- [ ] still open\n";
  logs.length = 0;
  assert.equal(main(["--pr", "7", "--sha", HEAD, "--check"], deps), 2, "a real refusal next to a waiting CI refuses");
  assert.ok(logs.at(-1).startsWith("= merge-gate refused —"), logs.at(-1));
});

test("ciVerdict: only the GitHub Actions app's `CI` counts; a same-named check from another app (or none) is ignored", () => {
  assert.equal(CI_APP, "github-actions");
  const forged = { id: 9, name: "CI", app: { slug: "some-app" }, status: "completed", conclusion: "success" };
  const bare = { id: 8, name: "CI", status: "completed", conclusion: "success" };
  assert.equal(ciVerdict([forged]).ok, false);
  assert.equal(ciVerdict([forged]).pending, true, "no CI from the Actions app yet is waiting");
  assert.equal(ciVerdict([bare]).ok, false, "a check-run with no app is not trusted");
  const red = { id: 2, name: "CI", app: GHA, status: "completed", conclusion: "failure" };
  assert.equal(ciVerdict([red, forged]).ok, false, "a newer forged success does not replace the real red");
  assert.equal(ciVerdict([red, { ...red, id: 3, conclusion: "success" }]).ok, true);
  const f = fakes();
  f.checks[1].app = { slug: "not-actions" };
  assert.deepEqual(ROWS.filter((k) => !evaluate({ pr: 7, ...f.deps }).rows[k].ok), ["ci"]);
});

// ---- WP-L3e: the ci row reads ci.yml's own `CI`, not any Actions check-run of that name -------------------------

test("ciVerdict pinned to ci.yml: a `CI` check-run in another workflow's suite is ignored, ci.yml's newest attempt decides", () => {
  assert.equal(CI_WORKFLOW, "ci.yml");
  const real = { id: 2, name: "CI", app: GHA, status: "completed", conclusion: "failure", check_suite: { id: 50 } };
  const rogue = { id: 9, name: "CI", app: GHA, status: "completed", conclusion: "success", check_suite: { id: 77 } };
  assert.equal(ciVerdict([real, rogue], "CI", CI_APP, new Set([50])).ok, false, "a newer green `CI` from another workflow does not hide ci.yml's red");
  assert.equal(ciVerdict([rogue], "CI", CI_APP, new Set([50])).pending, true, "no ci.yml `CI` yet is waiting");
  assert.equal(ciVerdict([real, { ...real, id: 3, conclusion: "success" }], "CI", CI_APP, new Set([50])).ok, true);
  const f = fakes();
  f.checks.push(rogue); f.checks[1].conclusion = "failure";
  assert.deepEqual(ROWS.filter((k) => !evaluate({ pr: 7, ...f.deps }).rows[k].ok), ["ci"], "evaluate pins the row to ci.yml's suites");
  f.checks[1].conclusion = "success"; f.runs[0].path = ".github/workflows/other.yml";
  assert.equal(evaluate({ pr: 7, ...f.deps }).rows.ci.pending, true, "a run whose path is not ci.yml contributes no suite");
});

test("ciSuitesFor: the ci.yml runs on the head (path re-checked, a ref suffix tolerated); an API error is an error", () => {
  const seen = [];
  const req = (p) => { seen.push(p); return { json: { workflow_runs: [{ check_suite_id: 1, path: ".github/workflows/ci.yml" }, { check_suite_id: 2, path: ".github/workflows/ci.yml@refs/heads/x" }, { check_suite_id: 3, path: ".github/workflows/land.yml" }] } }; };
  assert.deepEqual([...ciSuitesFor(HEAD, req).suites].sort(), [1, 2]);
  assert.equal(seen[0], `actions/workflows/ci.yml/runs?head_sha=${HEAD}&per_page=100`);
  assert.equal(ciSuitesFor(HEAD, () => ({ error: "HTTP 403" })).error, "HTTP 403");
});

// ---- WP-L2: --trusted runs no PR code; post takes open/hold/plan/ci/distance from it, never from the artifact -----

test("--trusted: only the rows no PR code decides, no throw-away merge, distance on the fetched tip", () => {
  assert.deepEqual([...TRUSTED_ROWS], ["open", "hold", "plan", "ci", "distance"]);
  const f = fakes();
  const v = evaluate({ pr: 7, ...f.deps, trusted: true });
  assert.equal(v.ok, true, JSON.stringify(v.rows));
  assert.deepEqual(Object.keys(v.rows), TRUSTED_ROWS);
  assert.equal(v.tip, TIP);
  assert.deepEqual(f.calls, [{ fetch: { pr: 7, head: HEAD, headRef: "cursor/x", cwd: "/nowhere", base: "deploy-x" } }], "a fetch only: localMerge (the PR's scripts) never runs");
  f.pull.body = "## Plan\n- [ ] still open\n";
  assert.deepEqual(TRUSTED_ROWS.filter((k) => !evaluate({ pr: 7, ...f.deps, trusted: true }).rows[k].ok), ["plan"]);
  f.pull.body = "";
  assert.deepEqual(TRUSTED_ROWS.filter((k) => !evaluate({ pr: 7, ...f.deps, trusted: true, maxBehind: 0 }).rows[k].ok), ["distance"]);
  assert.equal(evaluate({ pr: 7, ...f.deps, trusted: true, fetchTip: () => ({ error: "fetch deploy-x failed: x" }) }).error, "fetch deploy-x failed: x");
  const logs = [];
  assert.equal(main(["--pr", "7", "--sha", HEAD, "--trusted"], { ...f.deps, log: (l) => logs.push(l) }), 0);
  assert.equal(logs.at(-1), `= merge-gate passed — open=ok hold=ok plan=ok ci=ok distance=ok pr=#7 sha=${HEAD} tip=${TIP}`);
  f.checks[1].status = "in_progress";
  assert.equal(main(["--pr", "7", "--sha", HEAD, "--trusted"], { ...f.deps, log: () => {} }), 3, "CI running is waiting");
});

// ---- WP-L1 / WP-L3: land.yml's trust shape and its logic, read from the parsed workflow and executed ------------

const LAND = parseYAML(fs.readFileSync(path.join(ROOT, ".github/workflows/land.yml"), "utf8"));
const DEPLOY_BRANCH = "claude/f1-game-project-26h3ng";
const writes = (j) => j.permissions === "write-all" || Object.values(j.permissions || {}).some((v) => v === "write");
const usesSecret = (j) => /\bsecrets\./.test(JSON.stringify(j));
const runsRepoCode = (j) => (j.steps || []).some((st) => /actions\/checkout@/.test(st.uses || "") || /(^|[\s;(|&])(node|npm|npx)\s/m.test(st.run || ""));
const jobsWhere = (pred) => Object.keys(LAND.jobs).filter((k) => pred(LAND.jobs[k]));

/** A GitHub expression `${{ … }}` evaluated as JS: `==`/`!=`, `&&`/`||` returning operands, missing paths null. */
function ghExpr(src, github) {
  const inner = String(src).trim().replace(/^\$\{\{/, "").replace(/\}\}$/, "");
  const js = inner.replace(/!=/g, "!==").replace(/([^!=])==(?!=)/g, "$1===")
    .replace(/\bgithub((?:\.[\w-]+|\[\d+\])+)/g, (m, rest) => "ctx" + rest.replace(/\./g, "?.").replace(/\[/g, "?.["))
    .replace(/\.\*\.(\w+)/g, ".map?.((x) => x.$1)"); // object filter `labels.*.name`
  const format = (f, ...a) => f.replace(/\{(\d+)\}/g, (_, i) => String(a[i] ?? ""));
  const contains = (hay, x) => (Array.isArray(hay) ? hay.includes(x) : String(hay ?? "").includes(x));
  const startsWith = (a, b) => String(a ?? "").startsWith(b);
  const cancelled = () => false;
  return new Function("ctx", "format", "contains", "startsWith", "cancelled", "needs", `return (${js.replace(/\bneeds\./g, "needs?.")});`)(github, format, contains, startsWith, cancelled, github?.needs);
}

test("land.yml triggers: pull_request_target (never pull_request), workflow_run kept, check_suite gone", () => {
  const on = LAND.on;
  assert.equal(on.pull_request, undefined, "plain pull_request runs the PR's own copy of land.yml with its secrets");
  assert.deepEqual(on.pull_request_target, { types: ["labeled", "unlabeled", "ready_for_review", "converted_to_draft", "synchronize", "reopened"], branches: [DEPLOY_BRANCH] });
  assert.deepEqual(on.workflow_run, { workflows: ["CI", "Deploy to GitHub Pages"], types: ["completed"] }, "the CI / train re-gate stays");
  assert.deepEqual(Object.keys(on.workflow_dispatch.inputs), ["pr", "head", "attempt", "sync"], "the immediate re-gate: one PR, the head its budget counts against, the attempt; or an AUTO-SYNC sweep");
  assert.equal(on.repository_dispatch, undefined);
  assert.equal(on.check_suite, undefined, "check_suite never fires for Actions-made suites (0 runs in 14 days)");
  assert.deepEqual(LAND.permissions, {}, "the workflow-level token has no permissions; each job states its own");
});

test("land.yml: no job holding a write permission or a secret checks out or runs code; the PR-code legs are read-only", () => {
  assert.deepEqual(jobsWhere(writes), ["post", "arm", "retry"]);
  assert.deepEqual(jobsWhere(usesSecret), ["post", "arm", "sync"]);
  assert.deepEqual(jobsWhere(runsRepoCode), ["trusted-rows", "land-gate"], "only the read-only legs check out or run code");
  const readOnly = { contents: "read", "pull-requests": "read", checks: "read", actions: "read" };
  assert.deepEqual(LAND.jobs["land-gate"].permissions, readOnly);
  assert.deepEqual(LAND.jobs["trusted-rows"].permissions, readOnly);
  for (const name of jobsWhere(runsRepoCode)) {
    for (const st of LAND.jobs[name].steps) {
      if (/actions\/checkout@/.test(st.uses || "")) {
        assert.equal(st.with?.ref, "${{ env.DEPLOY_BRANCH }}", `${name}: checks out the deploy branch by name, never the PR head`);
        assert.equal(st.with?.["persist-credentials"], false, `${name}: no token left in .git/config`);
      }
      if (/actions\/setup-node@/.test(st.uses || "")) assert.equal(st.with?.cache, undefined, `${name}: no dependency cache (deploy-branch cache scope: poisoning)`);
    }
  }
  assert.deepEqual(LAND.jobs.post.needs, ["resolve", "trusted-rows", "land-gate"], "post reads the trusted rows next to the artifact");
});

test("land.yml concurrency (WP-L3a, c): noise labels run alone, CI re-gates never join the train's group, PR events cancel", () => {
  const group = (github) => ghExpr(LAND.concurrency.group, github);
  const prt = (action, label) => ({ event_name: "pull_request_target", run_id: 99, event: { action, label: label && { name: label }, pull_request: { number: 7 } } });
  assert.equal(group(prt("labeled", "needs-owner")), "land-noise-99", "a label other than land/hold cannot cancel or replace the PR's re-gate");
  assert.equal(group(prt("unlabeled", "priority")), "land-noise-99");
  assert.equal(group(prt("labeled", "land")), "land-7");
  assert.equal(group(prt("unlabeled", "hold")), "land-7");
  assert.equal(group(prt("synchronize")), "land-7");
  const wr = (head_branch, prs) => ({ event_name: "workflow_run", run_id: 5, event: { workflow_run: { head_branch, head_sha: "abc123", pull_requests: prs } } });
  assert.equal(group(wr("cursor/x", [{ number: 7 }])), "land-7", "a PR's CI re-gate queues behind that PR's events");
  assert.equal(group(wr(DEPLOY_BRANCH, [])), "land-tip");
  assert.equal(group(wr("fork-branch", [])), "land-sha-abc123", "a CI run naming no PR never shares land-tip");
  assert.equal(ghExpr(LAND.concurrency["cancel-in-progress"], prt("labeled", "land")), true);
  assert.equal(ghExpr(LAND.concurrency["cancel-in-progress"], wr("cursor/x", [{ number: 7 }])), false, "a CI or train re-gate never cancels");
});

test("land.yml write_gate (WP-L3b): AT is whole seconds and a same-second older status no longer blocks the write", () => {
  const resolveRun = LAND.jobs.resolve.steps.find((s) => s.id === "pick").run;
  const atLine = resolveRun.split("\n").find((l) => l.trim().startsWith("at=$("));
  const at = spawnSync("bash", ["-c", `${atLine}; echo "$at"`], { encoding: "utf8" }).stdout.trim();
  assert.equal(new Date(at).toISOString().replace(".000Z", "Z"), at, "ISO-8601 in whole seconds, like created_at");
  const postRun = LAND.jobs.post.steps.find((s) => s.id === "post").run;
  const start = postRun.indexOf("write_gate() {");
  const fn = postRun.slice(start, postRun.indexOf("\n}\n", start) + 3);
  const atS = postRun.split("\n").find((l) => l.startsWith("AT_S="));
  const stub = `gh() { local q="" a; while [ $# -gt 0 ]; do a=$1; shift; case "$a" in --method) echo POSTED; return 0 ;; --jq) q=$1; shift ;; esac; done; jq -r "$q" <<<"$FAKE"; }`;
  const runGate = (created) => {
    const fake = JSON.stringify(created ? [{ context: "gate", created_at: created }, { context: "CI", created_at: "2030-01-01T00:00:00Z" }] : []);
    const script = ["set -uo pipefail", "R=o/r; GITHUB_SERVER_URL=https://x; GITHUB_RUN_ID=1; GITHUB_STEP_SUMMARY=/dev/null", stub, atS, fn, "write_gate abc123 completed success title summary"].join("\n");
    const r = spawnSync("bash", ["-c", script], { encoding: "utf8", env: { ...process.env, AT: "2026-10-27T10:00:05Z", FAKE: fake } });
    assert.equal(r.status, 0, r.stderr);
    return r.stdout.trim().split("\n").at(-1);
  };
  assert.equal(runGate(null), "POSTED", "no gate status yet");
  assert.equal(runGate("2026-10-27T10:00:04Z"), "POSTED", "an older status is replaced");
  assert.equal(runGate("2026-10-27T10:00:05Z"), "POSTED", "same second as AT: the old string compare kept it (`Z` > `.`)");
  assert.notEqual(runGate("2026-10-27T10:00:06Z"), "POSTED", "a status newer than this run's read is kept");
});

// ---- the immediate re-gate: a gate passed on a tip that moved is re-dispatched at once, bounded per head ---------

/**
 * Runs one land.yml step script under bash with `gh` stubbed. GH_LOG records each call, a POSTed body as `body <json>`
 * and the token a PUT ran with as `token=<GH_TOKEN>`. Answers: FAKE_PR (or FAKE_PRS by number) for pulls/<n>,
 * FAKE_STATUSES (an array, or an object by sha) for commits/<sha>/statuses, FAKE_RUNS for …/runs?…, FAKE_CHECKS for
 * check-runs, FAKE_LANDS for `gh pr list`, PAUSED for the Dispatch issue, NOW_TIP for the deploy branch; GH_POST_RC
 * fails a POST and GH_PUT_FAIL (PR numbers) fails an update-branch with a 422. `files` are written under the cwd.
 */
function runStep(script, env, files = {}) {
  const stub = [
    `gh() { echo "gh $*" >> "$GH_LOG"; local q="" a data args=("$@");`,
    `  while [ $# -gt 0 ]; do a=$1; shift; case "$a" in --jq) q=$1; shift ;; esac; done;`,
    `  case " \${args[*]} " in`,
    `    *" --method POST "*) case " \${args[*]} " in *" --input "*) echo "body $(jq -c .)" >> "$GH_LOG" ;; esac; return "\${GH_POST_RC:-0}" ;;`,
    `    *" --method PUT "*) echo "token=\${GH_TOKEN:-}" >> "$GH_LOG"`,
    `      case " \${GH_PUT_FAIL:-} " in *" $(sed -n 's#.*/pulls/\\([0-9]*\\)/update-branch.*#\\1#p' <<<"\${args[*]}") "*) echo "gh: merge conflict (HTTP 422)" >&2; return 1 ;; esac`,
    `      echo '{"message":"Updating pull request branch."}'; return 0 ;;`,
    `    *"/issues"*) echo "\${PAUSED:-false}"; return 0 ;;`,
    `    *"/branches/"*) echo "\${NOW_TIP:-}"; return 0 ;;`,
    `    *" pr merge "*) return 0 ;;`,
    `    *" pr list "*) data=\${FAKE_LANDS:-[]} ;;`,
    `    *"/statuses"*) data=$(jq -c --arg h "$(sed -n 's#.*commits/\\([0-9a-f]*\\)/statuses.*#\\1#p' <<<"\${args[*]}")" 'if type == "object" then (.[$h] // []) else . end' <<<"\${FAKE_STATUSES:-[]}") ;;`,
    `    *"/check-runs"*) data=\${FAKE_CHECKS:-'{"check_runs":[]}'} ;;`,
    `    *"/runs?"*) data=\${FAKE_RUNS:-'{"workflow_runs":[]}'} ;;`,
    `    *) data=\${FAKE_PR:-'{}'}`,
    `       if [ -n "\${FAKE_PRS:-}" ]; then data=$(jq -c --arg n "$(sed -n 's#.*/pulls/\\([0-9]*\\).*#\\1#p' <<<"\${args[*]}")" '.[$n] // {}' <<<"$FAKE_PRS"); fi ;;`,
    `  esac`,
    `  if [ -n "$q" ]; then jq -r "$q" <<<"$data"; else echo "$data"; fi; }`,
  ].join("\n");
  const dir = fs.mkdtempSync(path.join(ROOT, "artifacts", "land-step-"));
  const logs = { GH_LOG: path.join(dir, "gh.log"), GITHUB_OUTPUT: path.join(dir, "out"), GITHUB_STEP_SUMMARY: path.join(dir, "summary") };
  for (const f of Object.values(logs)) fs.writeFileSync(f, "");
  for (const [rel, text] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
    fs.writeFileSync(path.join(dir, rel), text);
  }
  const r = spawnSync("bash", ["-c", `${stub}\n${script}`], { encoding: "utf8", cwd: dir,
    env: { ...process.env, GITHUB_REPOSITORY: "o/r", GITHUB_SERVER_URL: "https://github.com", GITHUB_RUN_ID: "1", DEPLOY_BRANCH,
      RETRY_MAX: String(LAND.env.RETRY_MAX), SYNC_MAX: String(LAND.env.SYNC_MAX), ...logs, ...env } });
  const out = Object.fromEntries(fs.readFileSync(logs.GITHUB_OUTPUT, "utf8").split("\n").filter(Boolean).map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)]));
  const calls = fs.readFileSync(logs.GH_LOG, "utf8").split("\n").filter(Boolean);
  const summary = fs.readFileSync(logs.GITHUB_STEP_SUMMARY, "utf8");
  fs.rmSync(dir, { recursive: true, force: true });
  return { ...r, out, calls, summary };
}
fs.mkdirSync(path.join(ROOT, "artifacts"), { recursive: true });
const HEAD7 = "a".repeat(40), TIP_A = "b".repeat(40), TIP_B = "c".repeat(40);
const pr7 = (o = {}) => JSON.stringify({ number: 7, state: "open", draft: false, base: { ref: DEPLOY_BRANCH }, head: { sha: HEAD7 }, auto_merge: null, created_at: "2026-10-27T10:00:00Z", labels: [{ name: "land" }], ...o });

test("land.yml retry: workflow_dispatch on the deploy branch only, in the PR's own group, never cancelling", () => {
  const disp = (ref, pr = "7") => ({ event_name: "workflow_dispatch", ref, run_id: 9, event: { inputs: { pr, head: HEAD7, attempt: "1" } } });
  assert.equal(ghExpr(LAND.jobs.resolve.if, disp(`refs/heads/${DEPLOY_BRANCH}`)), true);
  assert.equal(ghExpr(LAND.jobs.resolve.if, disp("refs/heads/cursor/x")), false, "a dispatch on another ref runs that ref's copy of this file: refused");
  assert.equal(ghExpr(LAND.concurrency.group, disp(`refs/heads/${DEPLOY_BRANCH}`)), "land-7", "queues with the PR's events and CI re-gates");
  assert.equal(ghExpr(LAND.concurrency["cancel-in-progress"], disp(`refs/heads/${DEPLOY_BRANCH}`)), false, "a dispatched re-gate never cancels the PR's CI re-gate");
  assert.ok(Number(LAND.env.RETRY_MAX) >= 1 && Number(LAND.env.RETRY_MAX) <= 5, "a small, finite budget per head");
});

test("land.yml retry job: actions write only, no checkout, no repo code, no secret; runs after post and arm", () => {
  const j = LAND.jobs.retry;
  assert.deepEqual(j.permissions, { actions: "write" });
  assert.deepEqual(j.needs, ["resolve", "post", "arm"]);
  assert.equal(runsRepoCode(j), false);
  assert.equal(usesSecret(j), false, "GITHUB_TOKEN: its workflow_dispatch is one of the two events it may start");
  const needs = (post, arm) => ({ needs: { resolve: { result: "success" }, post: { outputs: { retry: post } }, arm: { outputs: { retry: arm } } } });
  assert.equal(ghExpr(j.if, needs("[]", "")), false);
  assert.equal(ghExpr(j.if, needs("", "")), false, "post skipped");
  assert.equal(ghExpr(j.if, needs('[{"number":7}]', "")), true);
  assert.equal(ghExpr(j.if, needs("[]", '{"number":7}')), true);
});

test("land.yml arm: a tip that moved is the ONLY skip handed to retry; any other veto is not", () => {
  const run = LAND.jobs.arm.steps.find((s) => s.id === "arm").run;
  const ARM = JSON.stringify({ number: 7, head: HEAD7, tip: TIP_A });
  const go = (pr, now) => runStep(run, { ARM, FAKE_PR: pr, NOW_TIP: now, LAND_TOKEN: "", GITHUB_TOKEN: "t" });
  let r = go(pr7(), TIP_B);
  assert.equal(r.status, 0, r.stderr);
  assert.deepEqual(JSON.parse(r.out.retry), { number: 7, head: HEAD7 });
  assert.ok(!r.calls.some((c) => /pr merge/.test(c)), "never arms onto an ungated tip");
  r = go(pr7({ labels: [{ name: "land" }, { name: "hold" }] }), TIP_B);
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.out.retry, undefined, "`hold` set: no re-gate");
  r = go(pr7({ head: { sha: "d".repeat(40) } }), TIP_B);
  assert.equal(r.out.retry, undefined, "head moved: its push re-gates");
  r = go(pr7(), TIP_A);
  assert.equal(r.out.retry, undefined);
  assert.ok(r.calls.some((c) => c.includes(`pr merge 7 --repo o/r --auto --merge --match-head-commit ${HEAD7}`)), "same tip: arms as before");
});

test("land.yml post: the two tip moves (trusted-rows vs land-gate, verdict vs deploy tip) are handed to retry; other errors are not", () => {
  const run = LAND.jobs.post.steps.find((s) => s.id === "post").run;
  assert.match(run, /the deploy tip moved between trusted-rows[^\n]*\n\s*#[^\n]*\n\s*want_retry "\$n" "\$head"/,
    "the trusted-rows/land-gate tip split asks for a re-gate");
  assert.match(run, /elif \[ "\$now" != "\$tip" \]; then\n[^\n]*deploy tip moved since the gate measured[^\n]*\n\s*want_retry "\$n" "\$head"/,
    "a verdict whose tip is no longer the deploy tip asks for a re-gate");
  assert.equal((run.match(/^\s*want_retry "/gm) || []).length, 2, "no other branch asks for a re-gate");
  assert.equal((run.match(/retry=\$\(jq/g) || []).length, 1, "one append, inside want_retry");
  assert.match(run, /echo "retry=\$retry"/);
});

test("land.yml post (STALE TIP): success only onto the tip the gate measured; a moved tip writes pending, re-gates and disarms", () => {
  const run = LAND.jobs.post.steps.find((s) => s.id === "post").run;
  const ok0 = run.indexOf("0) #");
  assert.ok(ok0 > 0 && run.indexOf(`branches/$DEPLOY_BRANCH`, ok0) > ok0 && run.indexOf(`branches/$DEPLOY_BRANCH`, ok0) < run.indexOf("write_gate \"$head\" completed success", ok0),
    "the deploy tip is read after the verdict and before the success write");
  const line = `= merge-gate passed — open=ok hold=ok plan=ok ci=ok distance=ok pr=#7 sha=${HEAD7} tip=${TIP_A}`;
  const verdict = (code = 0) => ({ "verdicts/7.json": JSON.stringify({ number: 7, head: HEAD7, code, line, tip: TIP_A, out: "rows" }) });
  const env = (o = {}) => ({ GH_TOKEN: "t", DISARM_TOKEN: "lt", PRS: JSON.stringify([{ number: 7, head: HEAD7 }]), NOTASKED: "[]", DISARM: "[]",
    PAUSED: "false", AT: "2026-10-27T10:00:05Z", TRUSTED: JSON.stringify([{ number: 7, head: HEAD7, code: 0, line, tip: TIP_A }]),
    FAKE_PR: pr7(), FAKE_RUNS: JSON.stringify({ workflow_runs: [{ path: ".github/workflows/ci.yml", check_suite_id: 1 }] }),
    FAKE_CHECKS: JSON.stringify({ check_runs: [{ id: 1, app: { slug: "github-actions" }, check_suite: { id: 1 }, conclusion: "success" }] }), ...o });
  const bodies = (r) => r.calls.filter((c) => c.startsWith("body ")).map((c) => JSON.parse(c.slice(5)));
  const disarmed = (r) => r.calls.some((c) => c === "gh pr merge 7 --repo o/r --disable-auto");
  const armed = pr7({ auto_merge: { merge_method: "merge" } });

  let r = runStep(run, env({ NOW_TIP: TIP_A }), verdict());
  assert.equal(r.status, 0, r.stderr);
  assert.deepEqual(bodies(r).map((b) => b.state), ["success"], "the tip is unchanged: success");
  assert.deepEqual(JSON.parse(r.out.arm), { number: 7, head: HEAD7, tip: TIP_A });
  assert.equal(r.out.retry, "[]");
  assert.equal(disarmed(r), false);

  r = runStep(run, env({ NOW_TIP: TIP_B, FAKE_PR: armed }), verdict());
  assert.equal(r.status, 0, r.stderr);
  assert.deepEqual(bodies(r).map((b) => b.state), ["pending"], "#3982: a success measured on an older tip is never written");
  assert.match(bodies(r)[0].description, new RegExp(`deploy tip moved since the gate measured ${TIP_A.slice(0, 12)} \\(now ${TIP_B.slice(0, 12)}\\)`));
  assert.equal(r.out.arm, "", "nothing armed onto an ungated tip");
  assert.deepEqual(JSON.parse(r.out.retry), [{ number: 7, head: HEAD7 }], "re-gated at once through retry (RETRY_MAX per head)");
  assert.equal(disarmed(r), true, "an auto-merge armed earlier would fire on the next success: disarmed");

  r = runStep(run, env({ NOW_TIP: TIP_B }), verdict());
  assert.deepEqual(JSON.parse(r.out.retry), [{ number: 7, head: HEAD7 }]);
  assert.equal(disarmed(r), false, "not armed: nothing to disarm");

  r = runStep(run, env({ NOW_TIP: TIP_A, FAKE_PR: armed, TRUSTED: JSON.stringify([{ number: 7, head: HEAD7, code: 3, line: "= merge-gate waiting", tip: TIP_A }]) }), verdict());
  assert.deepEqual(bodies(r).map((b) => b.state), ["pending"]);
  assert.equal(disarmed(r), true, "any non-success write disarms an armed PR");
  assert.equal(r.out.retry, "[]", "CI still running is not a tip move");

  r = runStep(run, env({ NOW_TIP: TIP_B, FAKE_PR: armed, FAKE_STATUSES: JSON.stringify([{ context: "gate", created_at: "2026-10-27T10:00:09Z" }]) }), verdict());
  assert.deepEqual(bodies(r), [], "a newer verdict on the head is kept");
  assert.equal(disarmed(r), false, "and its run owns the arm state");
});

test("land.yml retry: dispatches each PR once on the deploy branch with attempt+1, and stops at RETRY_MAX", () => {
  const run = LAND.jobs.retry.steps[0].run;
  const go = (attempt, post, arm, extra = {}) => runStep(run, { ATTEMPT: attempt, POST_RETRY: post, ARM_RETRY: arm, ...extra });
  const item = JSON.stringify({ number: 7, head: HEAD7 });
  let r = go("0", `[${item}]`, item);
  assert.equal(r.status, 0, r.stderr);
  const posts = r.calls.filter((c) => c.includes("--method POST"));
  assert.equal(posts.length, 1, "post and arm naming one PR dispatch once");
  assert.equal(posts[0], `gh api --method POST repos/o/r/actions/workflows/land.yml/dispatches -f ref=${DEPLOY_BRANCH} -f inputs[pr]=7 -f inputs[head]=${HEAD7} -f inputs[attempt]=1`);
  r = go(String(Number(LAND.env.RETRY_MAX) - 1), "", item);
  assert.match(r.calls.find((c) => c.includes("--method POST")) || "", new RegExp(`inputs\\[attempt\\]=${LAND.env.RETRY_MAX}$`));
  r = go(String(LAND.env.RETRY_MAX), `[${item}]`, "");
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.calls.length, 0, "budget spent: nothing dispatched, the next train re-gates");
  r = go("junk; rm -rf /", `[${item}]`, "");
  assert.match(r.calls[0], /inputs\[attempt\]=1$/, "a malformed attempt counts as 0, never runs");
  r = go("0", `[${item}]`, "", { GH_POST_RC: "1" });
  assert.equal(r.status, 0, "a failed dispatch warns and leaves the next train to re-gate");
});

test("land.yml resolve: a dispatched re-gate is one PR, validated, and its budget resets when the head moved", () => {
  const run = LAND.jobs.resolve.steps.find((s) => s.id === "pick").run;
  const go = (env) => runStep(run, { EVENT: "workflow_dispatch", PR_NUMBER: "", RUN_CONCLUSION: "", RUN_BRANCH: "", RUN_REPO: "", RUN_SHA: "", CANDIDATES: "null", FAKE_PR: pr7(), ...env });
  let r = go({ IN_PR: "7", IN_HEAD: HEAD7, IN_ATTEMPT: "2" });
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.out.landable, "true");
  assert.deepEqual(JSON.parse(r.out.prs), [{ number: 7, head: HEAD7 }]);
  assert.equal(r.out.attempt, "2");
  r = go({ IN_PR: "7", IN_HEAD: "e".repeat(40), IN_ATTEMPT: "2" });
  assert.equal(r.out.attempt, "0", "a new head starts a new budget");
  r = go({ IN_PR: "7", IN_HEAD: HEAD7, IN_ATTEMPT: "2", FAKE_PR: pr7({ labels: [{ name: "land" }, { name: "hold" }] }) });
  assert.equal(r.out.landable, "false");
  assert.equal(JSON.parse(r.out.notasked)[0].why, "the `hold` label is set", "resolved like a label event: a hold turns gate red");
  r = go({ IN_PR: "7; echo pwned", IN_HEAD: "", IN_ATTEMPT: "0" });
  assert.notEqual(r.status, 0, "a non-numeric pr input is refused");
  r = go({ EVENT: "pull_request_target", PR_NUMBER: "7", IN_PR: "", IN_HEAD: "", IN_ATTEMPT: "" });
  assert.equal(r.out.attempt, "0", "every other event starts at 0");
});

// ---- AUTO-SYNC: the deploy tip merged into `land` PRs whose gate refused on distance alone, throttled -------------

const RESOLVE_RUN = LAND.jobs.resolve.steps.find((s) => s.id === "pick").run;
const hx = (c) => c.repeat(40);
const refusal = (rows, n = 7, h = HEAD7) => `= merge-gate refused — ${rows} pr=#${n} sha=${h} tip=${TIP_A}`;
const TRUSTED_DIST = "open=ok hold=ok plan=ok ci=ok distance=FAIL";
const FULL_DIST = "open=ok hold=ok plan=ok ci=ok gen=ok ratchets=ok distance=FAIL";

test("land.yml sync job (AUTO-SYNC): LAND_TOKEN only for the update-branch PUT, no checkout or repo code, read-only GITHUB_TOKEN, off under merge-pause", () => {
  const j = LAND.jobs.sync;
  assert.ok(j, "the sync job exists");
  assert.equal(j.needs, "resolve");
  assert.deepEqual(j.permissions, { "pull-requests": "read", issues: "read", statuses: "read", actions: "read" }, "GITHUB_TOKEN only reads");
  assert.equal(writes(j), false);
  assert.equal(runsRepoCode(j), false, "gh and jq only");
  assert.ok(!j.steps.some((st) => /actions\/checkout@/.test(st.uses || "")), "no actions/checkout");
  assert.equal(j.steps.length, 1);
  const st = j.steps[0];
  assert.equal(st.env.LAND_TOKEN, "${{ secrets.LAND_TOKEN }}");
  assert.equal((JSON.stringify(j).match(/secrets\./g) || []).length, 1, "LAND_TOKEN, in this one step's env, is the job's only secret");
  const puts = st.run.split("\n").filter((l) => /update-branch/.test(l) && /--method PUT/.test(l));
  assert.equal(puts.length, 1, "one update-branch call");
  assert.match(puts[0], /GH_TOKEN="\$LAND_TOKEN" gh api --method PUT "repos\/\$R\/pulls\/\$n\/update-branch" -f expected_head_sha="\$head"/,
    "LAND_TOKEN (a GITHUB_TOKEN push leaves the new head's CI awaiting approval), pinned to the head resolve read");
  assert.doesNotMatch(puts[0], /GITHUB_TOKEN|github\.token/);
  assert.match(st.run, /if \[ -z "\$\{LAND_TOKEN:-\}" \]; then[^]*?exit 0/, "no LAND_TOKEN: nothing synced, never a GITHUB_TOKEN fallback");
  assert.match(st.run, /labels=dispatch:merge-pause/, "merge-pause is re-read before acting");
  assert.ok(Number(LAND.env.SYNC_MAX) >= 1 && Number(LAND.env.SYNC_MAX) <= 5, "SYNC_MAX: a small throttle");
  const needs = (sync, paused) => ({ needs: { resolve: { outputs: { sync, paused } } } });
  assert.equal(ghExpr(j.if, needs('[{"number":7}]', "false")), true);
  assert.equal(ghExpr(j.if, needs('[{"number":7}]', "true")), false, "dispatch:merge-pause syncs nothing");
  assert.equal(ghExpr(j.if, needs("[]", "false")), false);
  assert.equal(ghExpr(j.if, needs("", "false")), false, "resolve skipped");
});

test("land.yml resolve distance_only: every row ok but distance, trusted-only or full, cut at 140 characters; anything else is not a candidate", () => {
  const start = RESOLVE_RUN.indexOf("distance_only() {");
  const fn = RESOLVE_RUN.slice(start, RESOLVE_RUN.indexOf("\n}\n", start) + 3);
  const ok = (d) => spawnSync("bash", ["-c", `${fn}\ndistance_only "$D"`], { encoding: "utf8", env: { ...process.env, D: d } }).status === 0;
  assert.equal(ok(refusal(TRUSTED_DIST)), true, "a trusted-only verdict names no gen/ratchets rows");
  assert.equal(ok(refusal(FULL_DIST)), true);
  assert.equal(ok(refusal(FULL_DIST, 4017).slice(0, 140)), true, "post cuts the status description at 140 characters");
  for (const rows of ["open=ok hold=ok plan=ok ci=ok gen=FAIL ratchets=ok distance=FAIL", "open=ok hold=ok plan=ok ci=ok ratchets=FAIL distance=FAIL",
    "open=ok hold=ok plan=ok ci=WAIT distance=FAIL", "open=ok hold=ok plan=FAIL ci=ok distance=FAIL", "open=ok hold=ok plan=ok ci=ok distance=ok",
    "open=ok hold=ok plan=ok distance=FAIL", "open=ok hold=ok plan=ok ci=ok newrow=ok distance=FAIL"]) {
    assert.equal(ok(refusal(rows)), false, rows);
  }
  assert.equal(ok(`= merge-gate passed — open=ok hold=ok plan=ok ci=ok distance=ok pr=#7 sha=${HEAD7}`), false);
  assert.equal(ok("= merge-gate not asked — the `hold` label is set"), false);
  assert.equal(ok(`= merge-gate error, will retry — ${refusal(TRUSTED_DIST)}`), false);
  assert.equal(ok(""), false);
});

test("land.yml resolve: a train or a sync=true dispatch lists the distance-only refusals (priority, then oldest); a dispatched sweep re-gates nothing", () => {
  const H = { 7: HEAD7, 8: hx("8"), 9: hx("9"), 10: hx("e"), 11: hx("f"), 12: hx("d"), 13: hx("c") };
  const pr = (n, o = {}) => ({ number: n, state: "open", draft: false, base: { ref: DEPLOY_BRANCH }, head: { sha: H[n], repo: { full_name: "o/r" } },
    auto_merge: null, created_at: `2026-10-27T${String(n).padStart(2, "0")}:00:00Z`, labels: [{ name: "land" }], ...o });
  const label = (...names) => ({ labels: names.map((name) => ({ name })) });
  const prs = { 7: pr(7), 8: pr(8, label("land", "priority")), 9: pr(9), 10: pr(10, label("land", "needs-decision")), 11: pr(11),
    12: pr(12, { head: { sha: H[12], repo: { full_name: "fork/r" } } }), 13: pr(13, label("land", "hold")) };
  const gate = (n, state, description) => [{ id: 100 + n, context: "gate", state, description }];
  const statuses = { [H[7]]: gate(7, "failure", refusal(TRUSTED_DIST, 7, H[7])), [H[8]]: gate(8, "failure", refusal(FULL_DIST, 8, H[8])),
    [H[9]]: gate(9, "failure", refusal("open=ok hold=ok plan=ok ci=ok gen=FAIL ratchets=ok distance=FAIL", 9, H[9])),
    [H[10]]: gate(10, "failure", refusal(TRUSTED_DIST, 10, H[10])), [H[11]]: gate(11, "pending", "= merge-gate waiting"),
    [H[12]]: gate(12, "failure", refusal(TRUSTED_DIST, 12, H[12])), [H[13]]: gate(13, "failure", refusal(TRUSTED_DIST, 13, H[13])) };
  const base = { EVENT: "workflow_run", RUN_BRANCH: DEPLOY_BRANCH, RUN_REPO: "o/r", RUN_CONCLUSION: "success", RUN_SHA: "", CANDIDATES: "null", PR_NUMBER: "",
    IN_PR: "", IN_HEAD: "", IN_ATTEMPT: "", IN_SYNC: "", FAKE_LANDS: JSON.stringify(Object.keys(prs).map((n) => ({ number: Number(n) }))),
    FAKE_PRS: JSON.stringify(prs), FAKE_STATUSES: JSON.stringify(statuses) };
  const want = [{ number: 8, head: H[8], gate: 108 }, { number: 7, head: H[7], gate: 107 }];

  let r = runStep(RESOLVE_RUN, base);
  assert.equal(r.status, 0, r.stderr);
  assert.deepEqual(JSON.parse(r.out.sync), want, "`priority` first, then oldest; gen=FAIL, needs-decision, a fork head and hold are not synced");
  assert.deepEqual(JSON.parse(r.out.prs), [{ number: 11, head: H[11] }], "a head whose gate is not failure is re-gated by the train as before");
  assert.match(r.stdout, /PR #9: gate is already failure/);
  assert.equal(JSON.parse(r.out.notasked)[0].number, 13);

  r = runStep(RESOLVE_RUN, { ...base, PAUSED: "true" });
  assert.equal(r.out.sync, "[]", "dispatch:merge-pause syncs nothing");

  r = runStep(RESOLVE_RUN, { ...base, EVENT: "workflow_dispatch", RUN_BRANCH: "", RUN_CONCLUSION: "", IN_SYNC: "true" });
  assert.equal(r.status, 0, r.stderr);
  assert.deepEqual(JSON.parse(r.out.sync), want, "a sweep by hand finds the same candidates");
  assert.equal(r.out.landable, "false", "and re-gates nothing");

  r = runStep(RESOLVE_RUN, { ...base, EVENT: "workflow_dispatch", RUN_BRANCH: "", RUN_CONCLUSION: "", IN_SYNC: "false" });
  assert.notEqual(r.status, 0, "without sync=true an empty pr input is refused as before");

  r = runStep(RESOLVE_RUN, { ...base, EVENT: "pull_request_target", PR_NUMBER: "7" });
  assert.equal(r.out.sync, "[]", "a label or push event never syncs");

  const disp = (inputs) => ({ event_name: "workflow_dispatch", ref: `refs/heads/${DEPLOY_BRANCH}`, run_id: 9, event: { inputs } });
  assert.equal(ghExpr(LAND.concurrency.group, disp({ pr: "", sync: "true" })), "land-sync", "a sweep never replaces a pending train re-gate in land-tip");
  assert.equal(ghExpr(LAND.concurrency.group, disp({ pr: "7", sync: "false" })), "land-7");
});

test("land.yml sync step: budget = SYNC_MAX minus the land PRs already in CI; LAND_TOKEN PUT pinned to the head; 422, busy, moved or re-gated heads skipped", () => {
  const run = LAND.jobs.sync.steps.find((s) => s.id === "sync").run;
  const H = { 7: HEAD7, 8: hx("8"), 9: hx("9"), 11: hx("f") };
  const pr = (n, o = {}) => ({ number: n, state: "open", draft: false, base: { ref: DEPLOY_BRANCH }, head: { sha: H[n], repo: { full_name: "o/r" } }, labels: [{ name: "land" }], ...o });
  const prs = (o = {}) => JSON.stringify({ 7: pr(7), 8: pr(8), 9: pr(9), ...o });
  const statuses = (o = {}) => JSON.stringify({ [H[7]]: [{ id: 107, context: "gate", state: "failure" }], [H[8]]: [{ id: 108, context: "gate", state: "failure" }],
    [H[9]]: [{ id: 109, context: "gate", state: "failure" }], ...o });
  const runs = (...heads) => JSON.stringify({ workflow_runs: [...heads.map((h) => ({ head_sha: h, display_title: "fix: x" })),
    { head_sha: H[9], display_title: "CI ignored: label priority" }] });
  const env = (o = {}) => ({ GH_TOKEN: "ghtok", LAND_TOKEN: "landtok", SYNC_MAX: "3", PAUSED: "false",
    SYNC: JSON.stringify([8, 7, 9].map((n) => ({ number: n, head: H[n], gate: 100 + n }))), FAKE_PRS: prs(), FAKE_STATUSES: statuses(),
    FAKE_RUNS: runs(H[11]), FAKE_LANDS: JSON.stringify([7, 8, 9, 11].map((n) => ({ number: n, headRefOid: H[n] }))), ...o });
  const tried = (r) => r.calls.filter((c) => / --method PUT /.test(c)).map((c) => Number(c.match(/pulls\/(\d+)\/update-branch/)[1]));

  let r = runStep(run, env());
  assert.equal(r.status, 0, r.stderr);
  assert.deepEqual(tried(r), [8, 7], "#11 already waits on CI: 3 - 1 = 2 syncs, in resolve's order (a `CI ignored` run is not counted)");
  r.calls.forEach((c, i) => {
    if (!/ --method PUT /.test(c)) return;
    const n = Number(c.match(/pulls\/(\d+)\//)[1]);
    assert.ok(c.endsWith(`-f expected_head_sha=${H[n]}`), "pinned to the head resolve read");
    assert.equal(r.calls[i + 1], "token=landtok", "the PUT runs with LAND_TOKEN, never GITHUB_TOKEN");
  });
  assert.equal(r.out.synced, "2");
  assert.match(r.summary, /budget spent/);

  r = runStep(run, env({ GH_PUT_FAIL: "8" }));
  assert.deepEqual(tried(r), [8, 7, 9], "a 422 (conflict, moved head) spends no budget");
  assert.equal(r.out.synced, "2");
  assert.match(r.summary, /#8: update-branch refused[^\n]*HTTP 422/, "logged in the step summary");

  r = runStep(run, env({ FAKE_RUNS: runs(H[8]) }));
  assert.deepEqual(tried(r), [7, 9], "a head whose own ci.yml run is still going is never synced (it counts as in flight)");
  assert.match(r.summary, /#8: not synced: a ci\.yml run/);

  r = runStep(run, env({ FAKE_PRS: prs({ 8: pr(8, { head: { sha: hx("a"), repo: { full_name: "o/r" } } }), 9: pr(9, { labels: [{ name: "land" }, { name: "hold" }] }) }),
    FAKE_STATUSES: statuses({ [H[7]]: [{ id: 999, context: "gate", state: "pending" }] }) }));
  assert.deepEqual(tried(r), [], "head moved (#8), gate re-posted since resolve (#7), hold set (#9)");
  assert.match(r.summary, /#8: not synced: its head moved/);
  assert.match(r.summary, /#7: not synced: its `gate` changed/);

  r = runStep(run, env({ SYNC_MAX: "1" }));
  assert.deepEqual(tried(r), [], "the land PRs already in CI fill the window");

  r = runStep(run, env({ LAND_TOKEN: "" }));
  assert.equal(r.status, 0);
  assert.deepEqual(tried(r), [], "no LAND_TOKEN: nothing synced, no GITHUB_TOKEN fallback");
  assert.match(r.summary, /LAND_TOKEN is not set/);

  r = runStep(run, env({ PAUSED: "true" }));
  assert.deepEqual(tried(r), [], "merge-pause re-read at the act");
});
