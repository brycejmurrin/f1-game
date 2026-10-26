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
import { ciVerdict, openVerdict, pacingVerdict, pagesVerdict, slotOf, isGamePath, gameFiles, verdictLine, main, REQUIRED_CHECK, ratchetsOnMerge, localMergeGenCheck } from "../../tools/ci/merge-gate.mjs";
import { receiptVerdict, writeReceipt, readReceipt, receiptPath, mainCheckout, MAX_AGE_MIN } from "../../tools/lib/gate-receipt.mjs";
import { TYPES, formatLine, parseLine } from "../../tools/ci/fleet-bus.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const scratch = (prefix) => fs.mkdtempSync(path.join(fs.mkdirSync(path.join(ROOT, "artifacts", "tmp"), { recursive: true }) || path.join(ROOT, "artifacts", "tmp"), prefix));
const HEAD = "a".repeat(40);
const T0 = 1_000_000;
const e = (type, from, text, at) => ({ type, from, text, at, to: "*", sha: "x" });

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
    const pull = { state: "open", draft: false, mergeable_state: "clean", head: { sha: HEAD, ref: "cursor/x" }, body: "## Plan\n- [x] done\n", changed_files: 1 };
    const request = (p) => {
      if (p === "pulls/7") return { json: pull };
      if (p.startsWith("pulls/7/files")) return { json: [{ filename: "tools/ci/ready-gate.mjs" }] };
      if (p.startsWith("commits/")) return { json: { check_runs: [{ id: 1, name: "Structural guards", status: "completed", conclusion: "success" }, { id: 2, name: "CI", status: "completed", conclusion: pull.ci || "success" }], total_count: 2 } };
      return { error: `unexpected ${p}` };
    };
    const localMerge = () => ({ ok: true, evidence: "merges clean", tip: "t".repeat(40) });
    const logs = [];
    const deps = { request, root: dir, env: { APEX_FLEET_AS: "claude:session_ME" }, bus: () => ({ entries: [] }), localMerge, pages: () => true, log: (l) => logs.push(l) };
    assert.equal(main(["--pr", "7"], deps), 0);
    const rc = readReceipt(dir, "merge", 7);
    assert.equal(rc.ok, true); assert.equal(rc.head, HEAD); assert.equal(rc.by, "claude:session_ME"); assert.equal(rc.game, 0);
    assert.match(logs.join("\n"), /= merge-gate passed — open=ok hold=ok ready=ok ci=ok gen=ok pacing=ok/);
    assert.match(logs.join("\n"), new RegExp(`expectedHeadSha=${HEAD}`));
    // a hold refuses and the receipt says so
    pull.body = "MERGE-HOLD: Bryce reviewing\n## Plan\n- [x] done\n";
    assert.equal(main(["--pr", "7"], deps), 1);
    assert.match(readReceipt(dir, "merge", 7).evidence, /MERGE-HOLD/);
    pull.body = "## Plan\n- [x] done\n";
    // a game PR needs the slot
    const gameReq = (p) => (p.startsWith("pulls/7/files") ? { json: [{ filename: "js/game.js" }] } : request(p));
    assert.equal(main(["--pr", "7"], { ...deps, request: gameReq }), 1);
    assert.match(readReceipt(dir, "merge", 7).evidence, /no GAME-SLOT/);
    const slotBus = () => ({ entries: [e("GAME-SLOT", "claude:session_ME", "#7 aaaaaaaa", Math.floor(Date.now() / 1000) - 10)] });
    assert.equal(main(["--pr", "7"], { ...deps, request: gameReq, bus: slotBus }), 0);
    assert.equal(readReceipt(dir, "merge", 7).game, 1);
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
    const pull = { state: "open", draft: false, mergeable_state: "clean", head: { sha: HEAD, ref: "cursor/x" }, body: "## Plan\n- [x] done\n", changed_files: 1 };
    const request = (p) => {
      if (p === "pulls/7") return { json: pull };
      if (p.startsWith("pulls/7/files")) return { json: [{ filename: "tools/ci/ready-gate.mjs" }] };
      if (p.startsWith("commits/")) return { json: { check_runs: [{ id: 1, name: "Structural guards", status: "completed", conclusion: "success" }, { id: 2, name: "CI", status: "completed", conclusion: "success" }], total_count: 2 } };
      return { error: `unexpected ${p}` };
    };
    const deps = { request, root: dir, env: { APEX_FLEET_AS: "claude:session_ME" }, bus: () => ({ entries: [] }), pages: () => true, log: () => {} };
    const merged = (ratchets) => () => ({ ok: true, evidence: "merges clean", tip: "t".repeat(40), ratchets });
    assert.equal(main(["--pr", "7"], { ...deps, localMerge: merged({ ok: true, evidence: "hold" }) }), 0);
    assert.deepEqual(Object.keys(readReceipt(dir, "merge", 7).rows), ["open", "hold", "ready", "ci", "gen", "ratchets", "pacing"]);
    const overage = `${OVER}assert-match ceiling: 7317 ${PIN} sites (ceiling 7316)`;
    assert.equal(main(["--pr", "7"], { ...deps, localMerge: merged({ ok: false, evidence: overage }) }), 1);
    const rc = readReceipt(dir, "merge", 7);
    assert.equal(rc.ok, false);
    assert.equal(rc.rows.gen.ok, true, "the merge and gen:check were fine");
    assert.deepEqual(rc.rows.ratchets, { ok: false, evidence: overage });
    assert.equal(rc.evidence, `ratchets: ${overage}`, "the ratchet row is the only refusal");
    assert.equal(verdictLine({ state: "refused", rows: rc.rows }).split(" ").includes("ratchets=FAIL"), true);
    // --skip-local-merge says so for BOTH local rows
    assert.equal(main(["--pr", "7", "--skip-local-merge"], deps), 0);
    assert.equal(readReceipt(dir, "merge", 7).rows.ratchets.evidence, "skipped (--skip-local-merge): the ratchets on the merge result are NOT proven");
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
