/* merge-gate.test.mjs — the merge gate's pure verdicts, the receipt a hook reads,
 * and the Python twin in .claude/hooks/merge_policy.py agreeing with the JS one
 * (docs/plans/2026-10-19-fleet-redesign.md §2: gate, don't grant).
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
import { ciVerdict, openVerdict, pacingVerdict, pagesVerdict, slotOf, isGamePath, gameFiles, verdictLine, main, incidentNote, REQUIRED_CHECK, ratchetsOnMerge, localMergeGenCheck, bodyShaVerdict, baseStalenessVerdict, forkVerdict, ghMergeCommand, mergeCall, BASE_MAX_GAME_MERGES } from "../../tools/ci/merge-gate.mjs";
import { receiptVerdict, writeReceipt, readReceipt, receiptPath, mainCheckout, MAX_AGE_MIN, GATE_FILES, gateFileHashes, gateFilesVerdict, gateClosure, staticImports, MAX_FUTURE_S, headPinProblem, readyClaimVerdict } from "../../tools/lib/gate-receipt.mjs";
import { TYPES, formatLine, parseLine } from "../../tools/ci/fleet-bus.mjs";
import { decide as liftDecide, main as liftMain } from "../../tools/ci/incident-lift.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const scratch = (prefix) => fs.mkdtempSync(path.join(fs.mkdirSync(path.join(ROOT, "artifacts", "tmp"), { recursive: true }) || path.join(ROOT, "artifacts", "tmp"), prefix));
const HEAD = "a".repeat(40);
const T0 = 1_000_000;
const e = (type, from, text, at) => ({ type, from, text, at, to: "*", sha: "x" });
const CI_START = new Date(Date.now() - 3_600_000).toISOString();
const REPO_OBJ = { full_name: "brycejmurrin/f1-game" };
const BODY_OK = `## Plan\n- [x] done\n## Status\nhead ${HEAD.slice(0, 9)} pushed\n`;
/** The git-backed facts main reads, stubbed: no parents known, nothing on deploy, no merges since the CI run. */
const refusedRows = (rc) => Object.keys(rc.rows).filter((k) => !rc.rows[k].ok);
const GIT_STUBS = { parents: () => [], onDeploy: () => false, deployMerges: () => [] };

test("openVerdict: only an open, non-draft PR GitHub can merge passes", () => {
  assert.equal(openVerdict({ state: "open", draft: false, mergeable_state: "clean" }).ok, true);
  assert.equal(openVerdict({ state: "open", draft: false, mergeable_state: "behind" }).ok, true, "behind is cured by the local merge row");
  assert.equal(openVerdict({ state: "open", draft: true, mergeable_state: "clean" }).ok, false);
  assert.match(openVerdict({ state: "open", draft: false, mergeable_state: "dirty" }).evidence, /CONFLICTING/);
  assert.equal(openVerdict({ state: "open", draft: false, mergeable_state: "blocked" }).ok, false);
  assert.equal(openVerdict({ state: "open", draft: false, mergeable_state: "unknown" }).ok, false);
  assert.match(openVerdict({ state: "closed", merged: true }).evidence, /merged/);
});

test("ciVerdict: the required CI check-run on the head, newest attempt, success only", () => {
  assert.equal(REQUIRED_CHECK, "CI");
  assert.equal(ciVerdict([]).ok, false);
  assert.equal(ciVerdict([{ id: 1, name: "CI (draft fast tier)", status: "completed", conclusion: "success" }]).ok, false, "a draft fast tier is not the required check");
  assert.equal(ciVerdict([{ id: 1, name: "CI", status: "in_progress" }]).ok, false);
  assert.equal(ciVerdict([{ id: 1, name: "CI", status: "completed", conclusion: "failure" }, { id: 2, name: "CI", status: "completed", conclusion: "success" }]).ok, true, "newest attempt wins");
  assert.equal(ciVerdict([{ id: 2, name: "CI", status: "completed", conclusion: "success" }, { id: 3, name: "CI", status: "completed", conclusion: "failure" }]).ok, false);
});

test("game paths are the paced ones: js/ css/ assets/ index.html sw.js", () => {
  for (const p of ["js/game.js", "css/career.css", "assets/pack/manifest.json", "index.html", "sw.js"]) assert.equal(isGamePath(p), true, p);
  for (const p of ["tests/unit/ready-gate.test.mjs", "tools/ci/merge-gate.mjs", "docs/TESTING.md", ".claude/skills/agent-fleet/SKILL.md", "index.html.bak", "jsx/x"]) assert.equal(isGamePath(p), false, p);
  assert.deepEqual(gameFiles(["tools/ci/ready-gate.mjs", "js/game.js"]), ["js/game.js"]);
});

test("GAME-SLOT is a bus type, and the older HANDOFF text form still reads as a slot", () => {
  assert.ok(TYPES.includes("GAME-SLOT"));
  const line = formatLine("GAME-SLOT", "*", "claude:session_A", "#3076 a06b99a1");
  assert.deepEqual(slotOf({ ...parseLine(line), at: 5 }), { pr: 3076, from: "claude:session_A", at: 5, text: "#3076 a06b99a1" });
  assert.equal(slotOf(e("HANDOFF", "claude:session_B", "GAME-SLOT #2997 436e108a (OrchB 3)", 6)).pr, 2997);
  assert.equal(slotOf(e("HANDOFF", "claude:session_B", "OrchB 3 LIVE", 6)), null);
  assert.equal(slotOf(e("DONE", "x", "#1 merged abc", 1)), null);
});

test("pacingVerdict: freeze, slot ownership, lapse and the last game merge's Pages run", () => {
  const me = "claude:session_ME";
  const green = () => true;
  const slot = (pr, from, at) => e("GAME-SLOT", from, `#${pr} ${HEAD.slice(0, 8)}`, at);
  // no slot at all
  assert.match(pacingVerdict([], { pr: 10, me, pagesGreen: green, now: T0 }).evidence, /no GAME-SLOT/);
  // mine, no earlier game merge
  assert.equal(pacingVerdict([slot(10, me, T0 - 60)], { pr: 10, me, pagesGreen: green, now: T0 }).ok, true);
  // another session holds a live slot
  const other = pacingVerdict([slot(11, "claude:session_X", T0 - 60)], { pr: 10, me, pagesGreen: green, now: T0 });
  assert.equal(other.ok, false); assert.match(other.evidence, /held by claude:session_X for #11/);
  // that slot closed by its DONE: the newest slot is not live, so #10 must take one
  const closed = pacingVerdict([slot(11, "claude:session_X", T0 - 600), e("DONE", "claude:session_X", "#11 merged 1234567 (two-parent) GAME", T0 - 500)], { pr: 10, me, pagesGreen: green, now: T0 });
  assert.match(closed.evidence, /closed or lapsed/);
  // lapsed after SLOT_LAPSE_MIN with no DONE
  assert.match(pacingVerdict([slot(11, "claude:session_X", T0 - 3600)], { pr: 10, me, pagesGreen: green, now: T0 }).evidence, /lapsed/);
  // my PR's slot but taken by someone else
  assert.match(pacingVerdict([slot(10, "claude:session_X", T0 - 60)], { pr: 10, me, pagesGreen: green, now: T0 }).evidence, /not this session/);
  // the last game DONE needs a green Pages run; non-game DONE lines do not count
  const entries = [e("DONE", "a", "#5 merged deadbeef (two-parent) Level 3 non-game", T0 - 900), e("DONE", "b", "#6 merged f28db2ef (two-parent) by OrchB 3 — GAME.", T0 - 800), slot(10, me, T0 - 60)];
  assert.equal(pacingVerdict(entries, { pr: 10, me, pagesGreen: (s) => s === "f28db2ef", now: T0 }).ok, true);
  assert.match(pacingVerdict(entries, { pr: 10, me, pagesGreen: () => null, now: T0 }).evidence, /no green pages\.yml run yet \(pending/);
  assert.match(pacingVerdict(entries, { pr: 10, me, pagesGreen: () => false, now: T0 }).evidence, /red: stop/);
  // an INCIDENT freezes until its lifted line
  const frozen = [...entries, e("INCIDENT", "c", "Pages red on f28db2ef", T0 - 30)];
  assert.match(pacingVerdict(frozen, { pr: 10, me, pagesGreen: green, now: T0 }).evidence, /frozen by INCIDENT/);
  assert.equal(pacingVerdict([...frozen, e("INCIDENT", "c", "#1 lifted: Pages green again", T0 - 10)], { pr: 10, me, pagesGreen: green, now: T0 }).ok, true);
});

test("pagesVerdict judges by ancestry: the train cancels a merge's own run, a later green run that contains it counts", () => {
  // The 2026-10-19 shape (ORCH15's review): f797117b's own run cancelled, f495f663's cancelled, 2a60a924 green.
  const order = ["f797117b", "f495f663", "62026dd7", "2a60a924"];   // oldest → newest on the deploy branch
  const contains = (sha, head) => order.indexOf(sha) >= 0 && order.indexOf(sha) <= order.indexOf(head);
  const runs = [   // newest first, as the API lists them
    { head_sha: "2a60a924", status: "completed", conclusion: "success" },
    { head_sha: "62026dd7", status: "completed", conclusion: "cancelled" },
    { head_sha: "f495f663", status: "completed", conclusion: "cancelled" },
    { head_sha: "f797117b", status: "completed", conclusion: "cancelled" },
  ];
  assert.equal(pagesVerdict("f797117b", runs, contains), true, "its own run was cancelled; a later green run contains it");
  assert.equal(pagesVerdict("f797117b", runs.slice(1), contains), null, "only cancelled runs: still pending, never red");
  assert.equal(pagesVerdict("f797117b", [{ head_sha: "2a60a924", status: "in_progress", conclusion: null }, ...runs.slice(1)], contains), null);
  assert.equal(pagesVerdict("f797117b", [{ head_sha: "2a60a924", status: "completed", conclusion: "failure" }, ...runs.slice(1)], contains), false, "a red run that contains it stops everyone");
  assert.equal(pagesVerdict("2a60a924", [{ head_sha: "62026dd7", status: "completed", conclusion: "success" }], contains), null, "an older green run does not contain a newer merge");
  assert.equal(pagesVerdict("x", [], contains), null);
});

test("receiptVerdict (JS) and merge_policy.receipt_check (Python) agree on every case", () => {
  const dir = scratch("merge-gate-receipt-");
  try {
    const now = Date.parse("2026-10-19T20:00:00Z");
    const at = (minAgo) => new Date(now - minAgo * 60000).toISOString();
    const py = (kind, pr, head) => {
      const r = spawnSync("python3", ["-c", `import json,sys; sys.path.insert(0, ${JSON.stringify(path.join(ROOT, ".claude/hooks"))}); import merge_policy as P; ok, why = P.receipt_check(${JSON.stringify(dir)}, ${JSON.stringify(kind)}, ${JSON.stringify(pr)}, ${JSON.stringify(head)}, now=${now / 1000}); print(json.dumps([ok, why]))`], { encoding: "utf8" });
      assert.equal(r.status, 0, r.stderr);
      return JSON.parse(r.stdout.trim());
    };
    const both = (kind, pr, head) => {
      const js = receiptVerdict(readReceipt(dir, kind, pr), { kind, pr, head, now });
      const [pok, pwhy] = py(kind, pr, head);
      assert.equal(pok, js.ok, `python and js disagree for ${kind} #${pr} head=${head}: js=${js.why} py=${pwhy}`);
      if (!js.ok) assert.ok(pwhy.length > 10, "python says why");
      return js;
    };
    assert.match(both("merge", 7, HEAD).why, /no merge-gate receipt for #7: run `node tools\/ci\/merge-gate\.mjs --pr 7`/);
    assert.match(both("ready", 7, "").why, /no ready-gate receipt/);
    assert.equal(both("merge", 0, HEAD).ok, false);
    writeReceipt(dir, "merge", { pr: 7, head: HEAD, ok: true, at: at(5) });
    assert.equal(fs.existsSync(receiptPath(dir, "merge", 7)), true);
    assert.equal(both("merge", 7, HEAD).ok, true);
    assert.equal(both("merge", 7, HEAD.slice(0, 10)).ok, true, "a prefix pins the same head");
    assert.match(both("merge", 7, "").why, /pin expectedHeadSha/);
    assert.match(both("merge", 7, "b".repeat(40)).why, /not the gated head/);
    assert.match(both("merge", 8, HEAD).why, /no merge-gate receipt for #8/);
    writeReceipt(dir, "merge", { pr: 7, head: HEAD, ok: true, at: at(MAX_AGE_MIN + 1) });
    assert.match(both("merge", 7, HEAD).why, /min old/);
    // 2026-10-21 defect hunt rows 2+3: the hook cannot re-read a MERGE-HOLD or the PR head, so the receipt's age is its only
    // lever; the JS and Python twins share it and it is short.
    assert.equal(MAX_AGE_MIN, 10);
    writeReceipt(dir, "merge", { pr: 7, head: HEAD, ok: true, at: at(MAX_AGE_MIN - 1) });
    assert.equal(both("merge", 7, HEAD).ok, true, "just inside the window still merges");
    writeReceipt(dir, "merge", { pr: 7, head: HEAD, ok: false, evidence: "ci: CI failure", at: at(1) });
    assert.match(both("merge", 7, HEAD).why, /refused \(ci: CI failure\)/);
    writeReceipt(dir, "ready", { pr: 7, head: HEAD, ok: true, at: at(1) });
    assert.equal(both("ready", 7, "").ok, true, "a ready receipt needs no head pin");
    assert.equal(both("merge", 7, HEAD).ok, false, "a ready receipt is not a merge receipt");
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test("main: every row must pass; the receipt records the refusal, and a pass pins the head", () => {
  const dir = scratch("merge-gate-main-");
  try {
    const pull = { state: "open", draft: false, mergeable_state: "clean", head: { sha: HEAD, ref: "cursor/x", repo: REPO_OBJ }, base: { repo: REPO_OBJ }, body: BODY_OK, changed_files: 1 };
    const request = (p) => {
      if (p === "pulls/7") return { json: pull };
      if (p.startsWith("pulls/7/files")) return { json: [{ filename: "tools/ci/ready-gate.mjs" }] };
      if (p.startsWith("commits/")) return { json: { check_runs: [{ id: 1, name: "Structural guards", status: "completed", conclusion: "success" }, { id: 2, name: "CI", status: "completed", conclusion: pull.ci || "success", started_at: CI_START }], total_count: 2 } };
      return { error: `unexpected ${p}` };
    };
    const localMerge = () => ({ ok: true, evidence: "merges clean", tip: "t".repeat(40) });
    const logs = [];
    const deps = { request, root: dir, env: { APEX_FLEET_AS: "claude:session_ME" }, bus: () => ({ entries: [] }), localMerge, pages: () => true, log: (l) => logs.push(l), ...GIT_STUBS };
    assert.equal(main(["--pr", "7"], deps), 0);
    const rc = readReceipt(dir, "merge", 7);
    assert.equal(rc.ok, true); assert.equal(rc.head, HEAD); assert.equal(rc.by, "claude:session_ME"); assert.equal(rc.game, 0);
    assert.equal(logs[0], `[merge-gate] = merge-gate passed — open=ok fork=ok hold=ok ready=ok ci=ok gen=ok body=ok pacing=ok base=ok sha=${HEAD} tip=${"t".repeat(40)}`);
    assert.ok(logs.join("\n").includes(`gh pr merge 7 --merge --match-head-commit ${HEAD} --subject `), "the gh form is pinned to the gated head");
    assert.match(logs.join("\n"), new RegExp(`expectedHeadSha=${HEAD}`));
    // a hold refuses and the receipt says so
    pull.body = "MERGE-HOLD: Bryce reviewing\n" + BODY_OK;
    assert.equal(main(["--pr", "7"], deps), 1);
    assert.match(readReceipt(dir, "merge", 7).evidence, /MERGE-HOLD/);
    pull.body = BODY_OK;
    // a game PR needs the slot
    const gameReq = (p) => (p.startsWith("pulls/7/files") ? { json: [{ filename: "js/game.js" }] } : request(p));
    assert.equal(main(["--pr", "7"], { ...deps, request: gameReq }), 1);
    assert.match(readReceipt(dir, "merge", 7).evidence, /no GAME-SLOT/);
    const slotBus = () => ({ entries: [e("GAME-SLOT", "claude:session_ME", "#7 aaaaaaaa", Math.floor(Date.now() / 1000) - 10)] });
    assert.equal(main(["--pr", "7"], { ...deps, request: gameReq, bus: slotBus }), 0);
    assert.equal(readReceipt(dir, "merge", 7).game, 1);
    // audit 4 #6: a game PR whose green CI base is 7 game merges behind the tip refuses with "sync first"
    const startMs = Date.parse(CI_START);
    const sevenGame = Array.from({ length: 7 }, (_, i) => ({ sha: String(i).repeat(40), at: startMs + (i + 1) * 60_000, game: true }));
    assert.equal(main(["--pr", "7"], { ...deps, request: gameReq, bus: slotBus, deployMerges: () => sevenGame }), 1);
    assert.deepEqual(refusedRows(readReceipt(dir, "merge", 7)), ["base"]);
    assert.equal(readReceipt(dir, "merge", 7).rows.base.evidence.split(":")[0], "sync first");
    assert.equal(main(["--pr", "7"], { ...deps, request: gameReq, bus: slotBus, deployMerges: () => sevenGame.slice(1) }), 0, "6 is the limit");
    // the head moved while the gate ran: refused
    let reads = 0;
    const moving = (p) => (p === "pulls/7" && ++reads > 1 ? { json: { ...pull, head: { ...pull.head, sha: "c".repeat(40) } } } : request(p));
    assert.equal(main(["--pr", "7"], { ...deps, request: moving }), 1);
    assert.deepEqual(refusedRows(readReceipt(dir, "merge", 7)), ["open"]);
    assert.equal(readReceipt(dir, "merge", 7).rows.open.evidence, `the head moved during the gate (aaaaaaaa -> cccccccc): re-run merge-gate on the new head`);
    // a fork PR and a body whose Status names another sha are refused
    pull.head.repo = { full_name: "someone/f1-game" };
    assert.equal(main(["--pr", "7"], deps), 1);
    assert.deepEqual(refusedRows(readReceipt(dir, "merge", 7)), ["fork"]);
    pull.head.repo = REPO_OBJ;
    pull.body = "## Plan\n- [x] done\n## Status\nhead 1234567 pushed\n";
    assert.equal(main(["--pr", "7"], deps), 1);
    assert.deepEqual(refusedRows(readReceipt(dir, "merge", 7)), ["body"]);
    pull.body = BODY_OK;
    // --sha must match the live head
    assert.equal(main(["--pr", "7", "--sha", "b".repeat(40)], deps), 1);
    assert.match(readReceipt(dir, "merge", 7).evidence, /not the --sha/);
    // the required check red
    pull.ci = "failure";
    assert.equal(main(["--pr", "7"], deps), 1);
    assert.match(verdictLine({ state: "refused", rows: { ci: { ok: false, evidence: "CI failure" } } }), /ci=FAIL \| ci: CI failure/);
    // API error: exit 3, no receipt written over the last one
    assert.equal(main(["--pr", "9"], { ...deps, request: () => ({ error: "HTTP 500" }) }), 3);
    assert.equal(readReceipt(dir, "merge", 9), null);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test("a gate run in a linked worktree also leaves its receipt in the main checkout the hooks read", () => {
  const main = scratch("rcpt-main-");
  const wt = path.join(main, "..", path.basename(main) + "-wt");
  const git = (cwd, ...a) => { const r = spawnSync("git", a, { cwd, encoding: "utf8" }); assert.equal(r.status, 0, r.stderr); return r.stdout.trim(); };
  try {
    git(main, "init", "-q"); git(main, "-c", "user.email=t@t", "-c", "user.name=t", "commit", "-q", "--allow-empty", "-m", "x");
    git(main, "worktree", "add", "-q", wt);
    assert.equal(mainCheckout(main), null, "the main checkout mirrors nowhere");
    assert.equal(mainCheckout(path.join(main, "..")), null, "a dir inside a checkout is not a checkout");
    assert.equal(fs.realpathSync(mainCheckout(wt)), fs.realpathSync(main));
    writeReceipt(wt, "ready", { pr: 9, head: "a".repeat(40), ok: true });
    assert.equal(readReceipt(main, "ready", 9).pr, 9, "the hook's root has the receipt");
    assert.equal(readReceipt(wt, "ready", 9).pr, 9);
  } finally { fs.rmSync(wt, { recursive: true, force: true }); fs.rmSync(main, { recursive: true, force: true }); }
});

// The assert-match ratchet counts the literal text of the pin, in strings and titles too, so the fixtures spell it
// from parts. The checks below compare whole strings and the receipt's structure.
const PIN = ["assert", "match"].join(".");
const OVER = "over a ratchet on the merge result: ";
const NEVER_RAISE = " — convert the pins or extract, never raise the ceiling for someone else's overage";

test("ratchetsOnMerge: an overage names its sites; a check that cannot run is a failure, not a pass", () => {
  const out = (status, stdout = "", extra = {}) => ({ status, stdout, stderr: "", ...extra });
  const seen = [];
  const runWith = (byScript) => (cmd, argv, o) => { seen.push([argv, o.env]); return byScript[argv[0] === "--test" ? argv[1] : "ratchets"] || byScript.tests; };
  const ok = ratchetsOnMerge({ run: runWith({ ratchets: out(0), tests: out(0) }) });
  assert.deepEqual(ok, { ok: true, evidence: "ratchets.mjs and the whole-tree count tests hold on the merge result" });
  assert.deepEqual(seen.map(([a]) => a.at(-1)), ["tools/check/ratchets.mjs", ...["assert-match-ratchet", "source-pin-hygiene", "vm-filename-lint",
    "test-groups", "docs-integrity", "output-surface"].map((f) => `tests/unit/${f}.test.mjs`)], "the whole count family runs on the merge result");
  assert.ok(seen.every(([, env]) => env.APEX_RATCHET_BASE_REF === "HEAD" && !("NODE_TEST_CONTEXT" in env) && !("APEX_RATCHET_ABSOLUTE" in env)),
    "judged against the tip the merge sits on, never inheriting a test context");
  const pinFail = out(1, `error: '7317 ${PIN} sites (ceiling 7316) — convert a source pin'`);
  const over = ratchetsOnMerge({ run: runWith({ ratchets: out(0), tests: out(0), "tests/unit/assert-match-ratchet.test.mjs": pinFail }) });
  assert.deepEqual(over, { ok: false, evidence: `${OVER}assert-match ceiling: 7317 ${PIN} sites (ceiling 7316)${NEVER_RAISE}` });
  const both = ratchetsOnMerge({ run: runWith({ ratchets: out(1, "css/hud.css codeLines 2300 > 2279"), tests: out(0), "tests/unit/assert-match-ratchet.test.mjs": pinFail }) });
  assert.equal(both.ok, false);
  assert.equal(both.evidence, `${OVER}ratchets.mjs: css/hud.css codeLines 2300 > 2279; assert-match ceiling: 7317 ${PIN} sites (ceiling 7316)${NEVER_RAISE}`,
    "both overages are reported, not just the first");
  const dead = ratchetsOnMerge({ run: runWith({ ratchets: out(null, "", { error: new Error("spawn ENOENT") }), tests: out(0) }) });
  assert.deepEqual(dead, { ok: false, evidence: `${OVER}ratchets.mjs: spawn ENOENT${NEVER_RAISE}` });
});

test("main: a ratchet overage on the merge result refuses and shows as its own row", () => {
  const dir = scratch("merge-gate-ratchets-");
  try {
    const pull = { state: "open", draft: false, mergeable_state: "clean", head: { sha: HEAD, ref: "cursor/x", repo: REPO_OBJ }, base: { repo: REPO_OBJ }, body: BODY_OK, changed_files: 1 };
    const request = (p) => {
      if (p === "pulls/7") return { json: pull };
      if (p.startsWith("pulls/7/files")) return { json: [{ filename: "tools/ci/ready-gate.mjs" }] };
      if (p.startsWith("commits/")) return { json: { check_runs: [{ id: 1, name: "Structural guards", status: "completed", conclusion: "success" }, { id: 2, name: "CI", status: "completed", conclusion: "success" }], total_count: 2 } };
      return { error: `unexpected ${p}` };
    };
    const deps = { request, root: dir, env: { APEX_FLEET_AS: "claude:session_ME" }, bus: () => ({ entries: [] }), pages: () => true, log: () => {}, ...GIT_STUBS };
    const merged = (ratchets) => () => ({ ok: true, evidence: "merges clean", tip: "t".repeat(40), ratchets });
    assert.equal(main(["--pr", "7"], { ...deps, localMerge: merged({ ok: true, evidence: "hold" }) }), 0);
    assert.deepEqual(Object.keys(readReceipt(dir, "merge", 7).rows), ["open", "fork", "hold", "ready", "ci", "gen", "ratchets", "body", "pacing", "base"]);
    const overage = `${OVER}assert-match ceiling: 7317 ${PIN} sites (ceiling 7316)`;
    assert.equal(main(["--pr", "7"], { ...deps, localMerge: merged({ ok: false, evidence: overage }) }), 1);
    const rc = readReceipt(dir, "merge", 7);
    assert.equal(rc.ok, false);
    assert.equal(rc.rows.gen.ok, true, "the merge and gen:check were fine");
    assert.deepEqual(rc.rows.ratchets, { ok: false, evidence: overage });
    assert.equal(rc.evidence, `ratchets: ${overage}`, "the ratchet row is the only refusal");
    assert.equal(verdictLine({ state: "refused", rows: rc.rows }).split(" ").includes("ratchets=FAIL"), true);
    // --skip-local-merge is advisory (audit 4 G17): both local rows refuse, so it never writes an ok receipt
    assert.equal(main(["--pr", "7", "--skip-local-merge"], deps), 1);
    const adv = readReceipt(dir, "merge", 7);
    assert.equal(adv.ok, false);
    assert.equal(adv.rows.ratchets.evidence, "skipped (--skip-local-merge): the ratchets on the merge result are NOT proven (advisory run, no ok receipt)");
    assert.equal(adv.rows.gen.ok, false);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test("two PRs that are each at the assert-match ceiling alone are over it on the merge (#3236 + #3237, 2026-10-20)", () => {
  const T = scratch("merge-gate-shape-");
  const git = (cwd, ...a) => { const r = spawnSync("git", ["-c", "user.email=t@t", "-c", "user.name=t", ...a], { cwd, encoding: "utf8" }); assert.equal(r.status, 0, `${a.join(" ")}: ${r.stderr}`); return r.stdout.trim(); };
  const write = (root, rel, text) => { fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true }); fs.writeFileSync(path.join(root, rel), text); };
  const pins = (n) => Array.from({ length: n }, () => `${PIN}(a, /b/);`).join("\n") + "\n";
  try {
    const remote = path.join(T, "remote.git"), W = path.join(T, "w");
    git(T, "init", "-q", "--bare", remote);
    git(T, "clone", "-q", remote, W);
    git(W, "checkout", "-q", "-b", "deploy-x");
    // The real ratchet test and the real ratchets.mjs, with a fixture ratchets.json whose only row is assertPins at 3.
    const UNIT = "tests/unit";   // the fixture repo's own dir: built, not spelled, so the path-reference lint reads no phantom file
    for (const rel of [`${UNIT}/assert-match-ratchet.test.mjs`, "tools/check/ratchets.mjs", "tools/hooks/ratchet-reason.mjs"]) {
      write(W, rel, fs.readFileSync(path.join(ROOT, rel), "utf8"));
    }
    write(W, "tests/data/ratchets.json", JSON.stringify({ files: {}, tree: { assertPins: 3 } }) + "\n");
    write(W, `${UNIT}/base.test.mjs`, pins(2));
    git(W, "add", "-A"); git(W, "commit", "-q", "-m", "base: 2 pins, ceiling 3");
    git(W, "push", "-q", "origin", "deploy-x");
    // Each PR adds one pin: 3 of 3 on its own base, so each is green alone.
    for (const [name, file] of [["pr1", "one.test.mjs"], ["pr2", "two.test.mjs"]]) {
      git(W, "checkout", "-q", "-b", name, "deploy-x");
      write(W, `${UNIT}/${file}`, pins(1));
      git(W, "add", "-A"); git(W, "commit", "-q", "-m", `${name}: one pin`);
      git(W, "push", "-q", "origin", name);
    }
    const head2 = git(W, "rev-parse", "pr2");
    const gate = (pr, head, headRef) => localMergeGenCheck({
      pr, head, headRef, cwd: W, deploy: "deploy-x",
      // npm (gen:check) and the other count tests are stubbed: the fixture carries only the pin counter.
      run: (cmd, argv, o) => (cmd === "npm" || (argv[0] === "--test" && !argv[1].endsWith("assert-match-ratchet.test.mjs"))
        ? { status: 0, stdout: "", stderr: "" } : spawnSync(cmd, argv, o)),
    });
    const alone = gate(2, head2, "pr2");
    assert.equal(alone.ok, true, alone.evidence);
    assert.equal(alone.ratchets.ok, true, `pr2 alone is at the ceiling, not over it: ${alone.ratchets.evidence}`);
    // #3236 merges first (the deploy tip moves) ...
    git(W, "checkout", "-q", "deploy-x");
    git(W, "merge", "-q", "--no-ff", "-m", "merge pr1", "pr1");
    git(W, "push", "-q", "origin", "deploy-x");
    // ... and now #3237's head, unchanged and still green in its own CI, is one over on the merge result.
    const together = gate(2, head2, "pr2");
    assert.equal(together.ok, true, "the merge and gen:check are fine: only the ratchet row sees the overage");
    assert.equal(together.ratchets.ok, false, "pr2 adds the 4th pin onto a tip already at 3");
    assert.ok(/assert-match ceiling: 4 pin-shaped asserts \(ceiling 3; base 3\/3\)/.test(together.ratchets.evidence), together.ratchets.evidence);
  } finally { fs.rmSync(T, { recursive: true, force: true }); }
});

// 2026-10-26 system audit §10 (the O23 incident: an UNCOMMITTED merge-gate.mjs edit wrote an ok receipt). User grant,
// Bryce 2026-10-26 ~23:00 PT: "Fix hook or guard or perm".
test("a receipt records the gate files' sha256; gateFilesVerdict (JS) and gate_files_check (Python) refuse an edited or uncommitted gate", () => {
  const dir = scratch("merge-gate-files-");
  const g = (...a) => spawnSync("git", ["-C", dir, ...a], { encoding: "utf8" });
  try {
    g("init", "-q"); g("config", "user.email", "t@t"); g("config", "user.name", "t");
    for (const f of gateClosure(ROOT)) { fs.mkdirSync(path.dirname(path.join(dir, f)), { recursive: true }); fs.copyFileSync(path.join(ROOT, f), path.join(dir, f)); }
    g("add", "-A"); g("commit", "-qm", "gate");
    writeReceipt(dir, "merge", { pr: 5, head: HEAD, ok: true }, { main: null, gateRoot: dir });
    const rc = readReceipt(dir, "merge", 5);
    assert.deepEqual(rc.gateFiles, gateFileHashes(dir));
    assert.equal(rc.gateRoot, dir);
    assert.match(rc.gateFiles["tools/ci/merge-gate.mjs"], /^[0-9a-f]{64}$/);
    const py = (receipt) => JSON.parse(spawnSync("python3", ["-c", `import json,sys; sys.path.insert(0, ${JSON.stringify(path.join(ROOT, ".claude/hooks"))}); import merge_policy as P; print(json.dumps(P.gate_files_check(${JSON.stringify(dir)}, json.loads(sys.stdin.read()))))`], { input: JSON.stringify(receipt), encoding: "utf8" }).stdout);
    const both = (receipt) => { const js = gateFilesVerdict(dir, receipt); const [ok, why] = py(receipt); assert.equal(ok, js.ok, `js=${js.why} py=${why}`); return js; };
    assert.equal(both(rc).ok, true, "the committed gate's receipt");
    const f = path.join(dir, "tools/ci/merge-gate.mjs");
    const orig = fs.readFileSync(f, "utf8");
    fs.writeFileSync(f, orig + "// --pacing-override\n");
    assert.match(both(rc).why, /not the file that wrote this receipt/);
    assert.match(both({ ...rc, gateFiles: gateFileHashes(dir) }).why, /differ from HEAD/, "the edited gate hashed itself: still refused");
    fs.writeFileSync(f, orig);
    assert.match(both({ ...rc, gateFiles: undefined }).why, /no gate-file hashes/);
    // the receipt check proper: verify_files only where the hook doors ask for it
    const [ok] = JSON.parse(spawnSync("python3", ["-c", `import json,sys; sys.path.insert(0, ${JSON.stringify(path.join(ROOT, ".claude/hooks"))}); import merge_policy as P; print(json.dumps(P.receipt_check(${JSON.stringify(dir)}, "merge", 5, ${JSON.stringify(HEAD)}, verify_files=True)))`], { encoding: "utf8" }).stdout);
    assert.equal(ok, true);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test("mergeable_state unknown is re-read up to 3 times with backoff before the open row refuses", () => {
  const dir = scratch("merge-gate-unknown-");
  try {
    let reads = 0;
    const states = ["unknown", "unknown", "clean"];
    const pull = () => ({ state: "open", draft: false, mergeable_state: states[Math.min(reads - 1, states.length - 1)], head: { sha: HEAD, ref: "cursor/x", repo: REPO_OBJ }, base: { repo: REPO_OBJ }, body: BODY_OK, changed_files: 1 });
    const request = (p) => {
      if (p === "pulls/7") { reads++; return { json: pull() }; }
      if (p.startsWith("pulls/7/files")) return { json: [{ filename: "tools/ci/ready-gate.mjs" }] };
      if (p.startsWith("commits/")) return { json: { check_runs: [{ id: 1, name: "Structural guards", status: "completed", conclusion: "success" }, { id: 2, name: "CI", status: "completed", conclusion: "success" }], total_count: 2 } };
      return { error: `unexpected ${p}` };
    };
    const slept = [];
    const deps = { request, root: dir, env: { APEX_FLEET_AS: "claude:session_ME" }, bus: () => ({ entries: [] }), localMerge: () => ({ ok: true, evidence: "ok", tip: "t".repeat(40) }), pages: () => true, log: () => {}, sleep: (ms) => slept.push(ms), ...GIT_STUBS };
    assert.equal(main(["--pr", "7"], deps), 0, "clean on the third read");
    assert.deepEqual(slept, [2000, 4000]);
    reads = 0; slept.length = 0; states.splice(0, 3, "unknown", "unknown", "unknown", "unknown", "unknown");
    assert.equal(main(["--pr", "7"], deps), 1);
    assert.deepEqual(slept, [2000, 4000, 8000], "three retries, then the row refuses");
    assert.match(readReceipt(dir, "merge", 7).evidence, /mergeable_state unknown/);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test("Q4: incidentNote prints the newest INCIDENT line and never changes pacing", () => {
  assert.equal(incidentNote([e("DONE", "A", "x", 1)]), "");
  assert.ok(/^INCIDENT OPEN .*pages red/.test(incidentNote([e("INCIDENT", "A", "pages red [fix:abcdef1]", 1)])));
  assert.ok(/^INCIDENT lifted/.test(incidentNote([e("INCIDENT", "A", "pages red", 1), e("INCIDENT", "A", "lifted", 2)])));
  const entries = [e("INCIDENT", "A", "pages red [fix:abcdef1]", 1)];
  assert.equal(pacingVerdict(entries, { pr: 5 }).ok, false, "an open INCIDENT still freezes");
});

test("Q4: incident-lift lifts only when Pages is green on the fix sha", () => {
  const open = [e("INCIDENT", "claude:A", "pages red [fix:abcdef1234]", 1)];
  assert.equal(liftDecide([], () => true).action, "none");
  assert.equal(liftDecide([e("INCIDENT", "A", "manual freeze", 1)], () => true).action, "none");
  assert.equal(liftDecide(open, () => null).action, "wait");
  assert.equal(liftDecide(open, () => false).action, "wait");
  const d = liftDecide(open, () => true);
  assert.equal(d.action, "lift");
  assert.ok(/lifted/.test(d.text));
  const sent = [];
  const out = [];
  const opts = (green) => ({ bus: () => ({ entries: open }), pages: () => green, send: (...a) => { sent.push(a); return { ok: true }; }, log: (l) => out.push(l), env: { APEX_FLEET_AS: "claude:session_X" } });
  assert.equal(liftMain([], opts(null)), 2);
  assert.equal(sent.length, 0);
  assert.equal(liftMain(["--dry-run"], opts(true)), 0);
  assert.equal(sent.length, 0, "dry run sends nothing");
  assert.equal(liftMain([], opts(true)), 0);
  assert.equal(sent.length, 1);
  assert.equal(sent[0][0], "INCIDENT");
  assert.ok(/lifted/.test(sent[0][3]));
});

// System audit 4 (2026-10-26) group A1: the gate closure, future-dated receipts, the ready head pin, the READY claim
// path, and merge-gate's body / base / fork rows.
test("audit 4: the hashed gate set is the static import closure, recorded in the receipt", () => {
  assert.deepEqual(staticImports(`import a from "./a.mjs";\nimport {\n  b,\n  c as d\n} from "../lib/b.mjs";\nimport "./side.mjs";\nexport * from "./e.mjs";\nexport { f } from "./f.mjs";\nconst s = 'x from "./not.mjs"';\nimport fs from "node:fs";\n`),
    ["./a.mjs", "../lib/b.mjs", "./side.mjs", "./e.mjs", "./f.mjs"]);
  const c = gateClosure(ROOT);
  assert.deepEqual([...GATE_FILES, "tools/ci/pr-board.mjs", "tools/ci/fleet-bus.mjs", "tools/ci/github-api.mjs", "tools/lib/cli-args.mjs"].filter((f) => !c.includes(f)), []);
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
      `the receipt does not record ${unrec.slice(0, 4).join(", ")}, ... of the gate's import closure in ${ROOT} (an older gate or an edited import): re-run the gate`);
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

test("audit 4: a READY claim checks the PR number, the live head and the gate files", () => {
  const dir = scratch("ready-claim-");
  try {
    const okFiles = () => ({ ok: true });
    writeReceipt(dir, "ready", { pr: 12, head: HEAD, ok: true }, { main: null });
    assert.equal(readyClaimVerdict(dir, { pr: 12, text: "#12 aaaaaaaa ready-gate 0", files: okFiles }).ok, true);
    assert.equal(readyClaimVerdict(dir, { pr: 12, text: "#13 ready", files: okFiles }).why, "the text names #13, but --pr is 12: one READY is for one PR");
    assert.equal(readyClaimVerdict(dir, { pr: 12, text: "ready", files: okFiles, prHead: () => ({ sha: "c".repeat(40) }) }).why, "the PR head is cccccccccccc, but ready-gate passed on aaaaaaaaaaaa: re-run ready-gate on the current head");
    assert.equal(readyClaimVerdict(dir, { pr: 12, text: "ready", files: okFiles, prHead: () => ({ error: "HTTP 502" }) }).why, "cannot read #12's current head (HTTP 502): a READY is checked against the live head; retry");
    assert.equal(readyClaimVerdict(dir, { pr: 12, text: "ready", files: okFiles, prHead: () => ({ sha: HEAD }) }).ok, true);
    assert.equal(readyClaimVerdict(dir, { pr: 12, text: "ready", files: () => ({ ok: false, why: "pr-board.mjs differs" }) }).why, "ready-gate receipt for #12: pr-board.mjs differs");
    // the default check is gateFilesVerdict: a scratch dir is no checkout of the gate, so it refuses
    assert.equal(readyClaimVerdict(dir, { pr: 12, text: "ready" }).ok, false);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test("audit 4: body names the head (or the pre-sync parent), base staleness, fork row", () => {
  const P1 = "1".repeat(40), P2 = "2".repeat(40);
  const body = (sha) => `## Plan\n- [x] a\n## Status\n<!-- ${HEAD} -->\nhead ${sha}\n## Next step\n${HEAD}\n`;
  assert.equal(bodyShaVerdict(body(HEAD.slice(0, 8)), { head: HEAD }).ok, true);
  assert.equal(bodyShaVerdict(body("deadbee"), { head: HEAD }).ok, false, "a comment or another section naming the head does not count");
  assert.equal(bodyShaVerdict(body(P1.slice(0, 9)), { head: HEAD, parents: [P1, P2], secondOnDeploy: true }).ok, true, "a sync merge of the tip: the first parent counts");
  assert.equal(bodyShaVerdict(body(P1.slice(0, 9)), { head: HEAD, parents: [P1, P2], secondOnDeploy: false }).ok, false, "a merge of something else does not");
  assert.equal(bodyShaVerdict(`## Verified / Not run\ntooling-fast = run passed on ${HEAD.slice(0, 7)}\n`, { head: HEAD }).ok, true);
  assert.equal(bodyShaVerdict("## Plan\n- [x] a\n", { head: HEAD }).evidence, "the body has no filled ## Status / ## Verified section (rule 12): paste session-status.mjs --pr and the verdict lines");
  const start = Date.parse("2026-10-26T00:00:00Z");
  const m = (h, game) => ({ sha: "x", at: start + h * 3_600_000, game });
  assert.equal(baseStalenessVerdict({ ciStartedAt: new Date(start).toISOString(), merges: [] }).ok, true);
  assert.equal(baseStalenessVerdict({ ciStartedAt: new Date(start).toISOString(), merges: [m(1, true), m(2, false), m(23, false)] }).ok, true);
  assert.equal(baseStalenessVerdict({ ciStartedAt: new Date(start).toISOString(), merges: [m(1, false), m(25, false)] }).evidence,
    "sync first: the green CI ran on a base 0 game merge(s) / 25.0 h behind the tip (max 6 / 24 h) — node tools/ci/sync-pr.mjs <branch>, push, let CI go green");
  assert.equal(baseStalenessVerdict({ ciStartedAt: "", merges: [] }).evidence, "the CI check-run has no started_at: cannot tell which base it tested");
  assert.equal(baseStalenessVerdict({ ciStartedAt: new Date(start).toISOString(), error: "git log failed" }).evidence, "cannot measure the CI base: git log failed");
  assert.equal(BASE_MAX_GAME_MERGES, 6);
  assert.equal(forkVerdict({ head: { repo: REPO_OBJ }, base: { repo: REPO_OBJ } }).ok, true);
  assert.equal(forkVerdict({ head: { repo: { full_name: "x/f1-game" } }, base: { repo: REPO_OBJ } }).ok, false);
  assert.equal(forkVerdict({ head: {}, base: { repo: REPO_OBJ } }).ok, false, "a deleted fork (head.repo null) is not trusted");
  const call = mergeCall({ pull: { head: { ref: "cursor/x", label: "o:cursor/x" }, title: "t", body: "" }, pr: 9, head: HEAD, by: "claude:s", role: "orchestrator" });
  assert.ok(ghMergeCommand(9, call).startsWith(`gh pr merge 9 --merge --match-head-commit ${HEAD} --subject 'Merge pull request #9 from o/cursor/x' --body '`));
  assert.ok(!ghMergeCommand(9, call).includes("--admin"));
});
