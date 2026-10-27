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
  untrustedEnv,
} from "../../tools/ci/merge-gate.mjs";
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

test("distanceVerdict: at most N game merges behind (default 2); an off-line merge-base counts everything walked", () => {
  assert.equal(MAX_BEHIND, 2);
  assert.equal(distanceVerdict(HISTORY, sha(3)).ok, true);
  assert.equal(distanceVerdict(HISTORY, sha(5)).ok, true, "exactly N passes");
  const over = distanceVerdict(HISTORY, sha(6));
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
    g(T, "init", "-q", "-b", "base"); write("README", "0\n"); g(T, "add", "-A"); g(T, "commit", "-qm", "root");
    const fork = g(T, "rev-parse", "HEAD");
    g(T, "checkout", "-q", "-b", "pr", "base"); write("tools/x.mjs", "pr\n"); g(T, "add", "-A"); g(T, "commit", "-qm", "the PR");
    const head = g(T, "rev-parse", "HEAD");
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
    assert.ok(/failed/.test(distanceFor({ head: "0".repeat(40), tip, cwd: T }).error), "an unknown head is an error, not a row");
  } finally { fs.rmSync(T, { recursive: true, force: true }); }
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

/** A fake GitHub plus fake merge and distance for the evaluator; `pull` and `checks` are mutable per case. */
function fakes() {
  const pull = { state: "open", draft: false, labels: [], head: { sha: HEAD, ref: "cursor/x" }, base: { ref: "deploy-x" }, body: "## Plan\n- [x] done\n- [ ] land: flip + label\n" };
  const checks = [{ id: 1, name: "Structural guards", status: "completed", conclusion: "success" }, { id: 2, name: "CI", app: GHA, status: "completed", conclusion: "success" }];
  const calls = [];
  const request = (p) => {
    if (p === "pulls/7") return { json: pull };
    if (p.startsWith("commits/")) return { json: { check_runs: checks, total_count: checks.length } };
    return { error: `unexpected ${p}` };
  };
  const localMerge = (a) => { calls.push(a); return { ok: true, evidence: "merges clean", tip: TIP, ratchets: { ok: true, evidence: "hold" } }; };
  const distance = ({ max }) => ({ row: { ok: max >= 1, evidence: `1 game merge(s) (max ${max})` }, mergeBase: sha(5) });
  return { pull, checks, calls, deps: { request, root: "/nowhere", localMerge, distance } };
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
