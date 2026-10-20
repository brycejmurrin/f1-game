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
import { ciVerdict, openVerdict, pacingVerdict, pagesVerdict, slotOf, isGamePath, gameFiles, verdictLine, main, REQUIRED_CHECK } from "../../tools/ci/merge-gate.mjs";
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
