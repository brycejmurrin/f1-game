// @doc closing-refs (#5929): closing keywords in a PR body that target an OPEN pull request are flagged with their line, and ship-pr refuses before ready-gate.
import { test } from "node:test";
import assert from "node:assert/strict";
import { closingRefs, offendingRefs, checkPr, main } from "../../tools/ci/closing-refs.mjs";
import { main as ship } from "../../tools/ci/ship-pr.mjs";

const REPO = "brycejmurrin/f1-game";
const nums = (body) => closingRefs(body, REPO).map((r) => r.number);

test("GitHub's grammar: nine keywords, any case, optional colon, #N / owner/repo#N / URL; only the ref right after the keyword", () => {
  for (const kw of ["close", "closes", "closed", "fix", "fixes", "fixed", "resolve", "resolves", "resolved"]) {
    assert.deepEqual(nums(`${kw} #12`), [12], kw);
    assert.deepEqual(nums(`${kw.toUpperCase()}: #12`), [12], `${kw} upper with colon`);
  }
  assert.deepEqual(nums("#5599 (fix #5800)"), [5800], "#5750's body");
  assert.deepEqual(nums("(#5599, fix #5800 in flight)"), [5800], "#5904's body");
  assert.deepEqual(nums("Fix: #5800"), [5800], "a colon is still a keyword (GitHub docs)");
  assert.deepEqual(nums("Closes:#7"), [7]);
  assert.deepEqual(nums("fixes brycejmurrin/f1-game#9"), [9]);
  assert.deepEqual(nums("Resolves https://github.com/brycejmurrin/f1-game/pull/44"), [44]);
  assert.deepEqual(nums("Fixes #1, #2"), [1], "a bare second ref does not close");
  assert.deepEqual(nums("Resolves #10, resolves #123"), [10, 123]);
  assert.deepEqual(closingRefs("x\n  - fix #3 here", REPO)[0], { lineNo: 2, line: "- fix #3 here", keyword: "fix", number: 3, text: "fix #3" });
});

test("not keywords: another word between, a glued prefix, no #, another repo, a longer word", () => {
  for (const s of ["fixed by #5800", "see #5800", "#5800 (in flight)", "prefix #5", "suffix #5", "fixing #5", "closer #5",
    "fix 5800", "fix #5800abc", "fixes other/repo#5", "closes https://github.com/other/repo/issues/5", "enclosed #5", "fixups #5"]) {
    assert.deepEqual(nums(s), [], s);
  }
});

test("offendingRefs: only OPEN pull requests other than the PR itself; issues and closed PRs pass; one lookup per number", () => {
  const db = { 5800: { pr: true, open: true }, 5929: { pr: false, open: true }, 5000: { pr: true, open: false } };
  const calls = [];
  const lookup = (n) => (calls.push(n), db[n] || { pr: false, open: false });
  const body = "Closes #5929\nfix #5800 and fixes #5800\nfixed #5000\nfixes #77";
  const { bad } = offendingRefs(body, { self: 77, lookup });
  assert.deepEqual(bad.map((r) => [r.lineNo, r.number]), [[2, 5800], [2, 5800]]);
  assert.deepEqual(calls, [5929, 5800, 5000], "deduplicated, self skipped");
  assert.deepEqual(offendingRefs("fix #1", { lookup: () => ({ error: "HTTP 500" }) }), { error: "#1: HTTP 500" });
});

test("checkPr / CLI: names the exact line and refuses; an API error cannot judge (3)", () => {
  const getPr = () => ({ json: { body: "Plan\n- [x] #5599 (fix #5800)\nCloses #5929" } });
  const lookup = (n) => ({ pr: n === 5800, open: true });
  const c = checkPr(5904, { getPr, lookup });
  assert.equal(c.ok, false);
  assert.equal(c.lines.length, 1);
  assert.equal(c.lines[0], '#5904 line 2: "fix #5800" would CLOSE open PR #5800 on merge — reword (e.g. "fixed by #5800", "see #5800"); a colon does not defuse it\n    > - [x] #5599 (fix #5800)');
  const out = [];
  assert.equal(main(["--pr", "5904"], { getPr, lookup, log: (l) => out.push(l) }), 1);
  assert.equal(out.at(-1), "= closing-refs refused: #5904");
  assert.equal(main(["--pr", "5904"], { getPr: () => ({ error: "HTTP 401" }), lookup, log: () => {} }), 3);
  assert.equal(main(["--pr", "1"], { getPr: () => ({ json: { body: "fixed by #5800" } }), lookup, log: () => {} }), 0);
  assert.equal(main(["--pr", "x"], { log: () => {} }), 1, "usage");
});

test("--open scan: reports every open PR whose body closes another open PR, read-only", () => {
  const listOpen = () => ({ json: [{ number: 1, body: "fix #2" }, { number: 2, body: "see #1" }, { number: 3, body: "fixes #3" }] });
  const out = [];
  assert.equal(main(["--open"], { listOpen, lookup: (n) => ({ pr: n <= 3, open: true }), log: (l) => out.push(l) }), 1);
  assert.equal(out.filter((l) => /would CLOSE/.test(l)).length, 1);
  assert.equal(out.at(-1), "= closing-refs found: 1 ref(s) across 3 open PR(s)");
});

test("ship-pr runs closing-refs BEFORE ready-gate: an offending body never reaches the gate", () => {
  const ran = [], out = [];
  const rc = ship(["--pr", "9"], { run: (a) => (ran.push(a), 0), log: (l) => out.push(l), closing: () => ({ ok: false, lines: ["#9 line 1: \"fix #8\" would CLOSE open PR #8"] }) });
  assert.equal(rc, 1);
  assert.deepEqual(ran, [], "ready-gate not run");
  assert.deepEqual(out, ['#9 line 1: "fix #8" would CLOSE open PR #8', "ship refused #9: reword the closing keyword(s) above in the PR body (update_pull_request), then re-run ship-pr"]);
  assert.equal(ship(["--pr", "9"], { run: () => 0, log: () => {}, closing: () => ({ error: "HTTP 500" }) }), 3);
});
