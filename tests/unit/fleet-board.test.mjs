// fleet-board — the backlog's derived state. The `claimed` label is computed
// from the claims board and open PR bodies, never set by hand, so the rules
// that compute it are pure and pinned here: which text names an issue, which
// PR body closes one, who holds what, which label writes follow, and the board
// body the phone reads. The gh calls are not run. Importing the module runs
// nothing (argv-guarded). Under a second.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { refsIn, closesIn, holders, labelPlan, renderBoard, readLabels, BOARD_MARKER } from "../../tools/ci/fleet-board.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const issue = (number, labels, title = `issue ${number}`) => ({ number, title, labels: labels.map((name) => ({ name })) });
const claim = (text, ageMin = 10, who = "Claude") => ({ text, ageMin, who, released: false });

test("a claim names issues by #n, not by fragments of words or entities", () => {
  assert.deepEqual(refsIn("#12 fix the hang, see #7"), [12, 7]);
  assert.deepEqual(refsIn("PR#12 and a&#39;b"), []);
  assert.deepEqual(refsIn("(#3) done"), [3]);
});

test("a PR body closes issues by GitHub's keywords only", () => {
  assert.deepEqual(closesIn("Closes #5\nfixes #6, Resolved: #7"), [5, 6, 7]);
  assert.deepEqual(closesIn("Refs #8, see #9"), []);
  assert.deepEqual(closesIn(null), []);
});

test("an issue is held by a live claim or an open PR; expired and released claims hold nothing", () => {
  const held = holders(
    [claim("#1 on it"), claim("#2 old", 25 * 60), { ...claim("#3 done"), released: true }],
    [{ number: 40, body: "Closes #4", draft: true }]);
  assert.deepEqual([...held.keys()].sort(), [1, 4]);
  assert.equal(held.get(4).pr, 40);
  assert.equal(held.get(4).draft, true);
});

test("label writes: claim adds `claimed`; release removes it and restores `ready` unless blocked", () => {
  const held = holders([claim("#1 mine")], []);
  const plan = labelPlan([issue(1, ["ready"]), issue(2, ["claimed"]), issue(3, ["claimed", "blocked"]), issue(4, ["claimed", "ready"]), issue(5, ["ready"])], held);
  const by = Object.fromEntries(plan.map((p) => [p.number, p]));
  assert.deepEqual(by[1].add, ["claimed"]);
  assert.match(by[1].comment, /Claimed — Claude: #1 mine/);
  assert.deepEqual([by[2].add, by[2].remove], [["ready"], ["claimed"]]);
  assert.deepEqual([by[3].add, by[3].remove], [[], ["claimed"]], "a blocked issue does not become ready");
  assert.deepEqual(by[4].add, [], "ready is not added twice");
  assert.equal(by[5], undefined, "an unclaimed ready issue needs no write");
  assert.deepEqual(labelPlan([issue(1, ["claimed"])], held), [], "an already-labelled held issue needs no write");
});

test("the board lists each issue in one section and starts with its marker", () => {
  const issues = [issue(1, ["ready"]), issue(2, ["ready"]), issue(3, ["blocked"])];
  const prs = [{ number: 9, title: "fix", body: "Closes #2", draft: false, updated_at: "2026-10-14T07:00:00Z" }];
  const held = holders([], prs);
  const body = renderBoard({ issues, prs, claims: [], held, now: Date.parse("2026-10-14T09:00:00Z") });
  assert.ok(body.startsWith(BOARD_MARKER));
  assert.match(body, /## Ready \(1\)\n- #1 /);
  assert.match(body, /## Claimed \(1\)\n- #2 issue 2 — PR #9/);
  assert.match(body, /## Blocked \(1\)\n- #3 /);
  assert.match(body, /#9 fix — 2 h ago · closes #2/);
});

test(".github/labels.json carries the backlog labels AGENTS.md §Backlog names, each with a colour and description", () => {
  const names = readLabels(ROOT).map((l) => l.name);
  for (const n of ["ready", "claimed", "blocked", "epic", "fleet-board", "bug"]) assert.ok(names.includes(n), `labels.json lacks ${n}`);
  assert.equal(new Set(names).size, names.length, "duplicate label names");
  const wf = fs.readFileSync(path.join(ROOT, ".github/workflows/fleet.yml"), "utf8");
  assert.match(wf, /node tools\/ci\/fleet-board\.mjs --apply/);
  assert.doesNotMatch(wf, /^\s+pull_request:/m, "no pull_request trigger: it would join every PR's ci-watch verdict");
  assert.doesNotMatch(wf, /^\s+push:/m, "no push trigger: a claims-board push runs the board's own tree, which has no workflow — who-is-on-it dispatches instead");
  assert.match(wf, /^\s+workflow_dispatch:/m);
});

function withLabels(t, labels) {
  fs.mkdirSync(path.join(ROOT, "scratch"), { recursive: true });
  const root = fs.mkdtempSync(path.join(ROOT, "scratch", "fleet-labels-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(root, ".github"));
  fs.writeFileSync(path.join(root, ".github/labels.json"), JSON.stringify(labels));
  return root;
}

test("label limits accept the exact boundaries, counting Unicode characters", (t) => {
  const labels = [{ name: "🚦".repeat(50), color: "aBc123", description: "🚦".repeat(100) }];
  assert.deepEqual(readLabels(withLabels(t, labels)), labels);
});

for (const [field, max] of [["name", 50], ["description", 100]]) {
  test(`label validation rejects an overlong ${field} in a later entry`, (t) => {
    const valid = { name: "ready", color: "aBc123", description: "Available work" };
    const invalid = { ...valid, [field]: "x".repeat(max + 1) };
    const root = withLabels(t, [valid, invalid]);
    assert.throws(() => readLabels(root), {
      message: `label ${JSON.stringify(invalid.name)}: ${field} must be ${max} characters or fewer (got ${max + 1})`,
    });
  });
}
