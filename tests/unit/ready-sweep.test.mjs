// ready-sweep — the stale-`ready` sweep (tools/ci/ready-sweep.mjs) over fixture issues and a fixture tree: which cites
// count, the four verdicts, the launchable count behind the cap row, the finding-verifier rows, and that the CLI only
// ever GETs. No network, no disk: `tree` and `api` are stand-ins. Every check is an exact equality.
import test from "node:test";
import assert from "node:assert/strict";
import { citesOf, citeState, sweepIssue, launchableReady, readyCapRow, verifierRows, sweep, render, readSweepState, main } from "../../tools/ci/ready-sweep.mjs";

const FILES = { "src/app.js": 100, "src/race/pit.js": 20, "kit/ci/old.mjs": 50, "main.html": 10 };
const tree = {
  exists: (rel) => rel in FILES || Object.keys(FILES).some((f) => f.startsWith(`${rel}/`)),
  lines: (rel) => FILES[rel] ?? -1,
};
const issue = (number, labels, body = "", on = {}) => ({ number, title: `Task ${number}`, body, labels, ...on });

test("a cite is a repo path with an optional line; a URL, a foreign first segment and a repeat are not", () => {
  const body = "At `src/app.js:42` and src/app.js:42 again, src/race/pit.js:5-9, (main.html:3), kit/ci/new-tool.mjs,\n"
    + "see https://github.com/o/r/blob/x/src/app.js:1 and and/or.js:3 <!-- src/app.js:7 -->";
  assert.deepEqual(citesOf(body, tree), [{ file: "src/app.js", line: 42 }, { file: "src/race/pit.js", line: 5 }, { file: "main.html", line: 3 }, { file: "kit/ci/new-tool.mjs", line: null }]);
  assert.deepEqual([{ file: "src/gone.js", line: 1 }, { file: "src/gone.js", line: null }, { file: "src/app.js", line: 100 }, { file: "src/app.js", line: 101 }, { file: "src/app.js", line: null }].map((c) => citeState(c, tree)),
    ["gone", "absent", "ok", "past-end", "ok"]);
});

test("verdicts: stale = every line-cite misses, drifted = some, ok = none, none = no line-cite; a bare absent path is never judged", () => {
  const v = (body) => { const r = sweepIssue(issue(1, ["ready"], body), tree); return [r.verdict, r.bad, r.judged]; };
  assert.deepEqual(v("src/gone.js:4 and src/app.js:900"), ["stale", 2, 2]);
  assert.deepEqual(v("src/gone.js:4 and src/app.js:9"), ["drifted", 1, 2]);
  assert.deepEqual(v("src/app.js:9, add kit/ci/new-tool.mjs"), ["ok", 0, 1]);
  assert.deepEqual(v("add kit/ci/new-tool.mjs; the menu is cramped"), ["none", 0, 0]);
});

test("launchable = dispatch rule 1 without its caps: one per batch, no member, nothing claimed/blocked/undecided/epic or with an open closing PR", () => {
  const members = "## Members\n- #11 — a\n- #12 — b\n";
  const issues = [issue(10, ["ready", "batch"], members), issue(11, ["ready", "batched"]), issue(12, ["ready"]), issue(13, ["ready"]), issue(14, ["ready", "claimed"]),
    issue(15, ["ready", "blocked"]), issue(16, ["ready", "needs-decision"]), issue(17, ["ready", "epic"]), issue(18, ["ready"]), issue(19, ["bug"]),
    issue(20, ["ready", "batch"], "## Members\n- #21 — c\n"), issue(21, ["ready", "batched"])];
  const prs = [{ number: 40, body: "Closes #18", labels: [] }, { number: 41, body: "Closes #21", labels: [] }];
  assert.deepEqual(launchableReady(issues, prs).map((i) => i.number), [10, 13]);
  assert.equal(readyCapRow({ ready: 12, launchable: 2, landed: 1 }), "ready over cap: 2 launchable of 12 ready vs 1 PRs landed in 7 d");
  assert.equal(readyCapRow({ ready: 12, launchable: 2, landed: 2, days: 14 }), "ready within cap: 2 launchable of 12 ready vs 2 PRs landed in 14 d");
});

test("the sweep, its printed lines and the finding-verifier rows", () => {
  const issues = [issue(1, ["ready"], "src/gone.js:4"), issue(2, ["ready"], "src/app.js:900 then src/app.js:9"), issue(3, ["ready"], "src/app.js:9"), issue(4, ["ready"], "words"), issue(5, ["bug"], "src/gone.js:1")];
  const r = sweep({ issues, prs: [], landed: 3 }, tree);
  assert.deepEqual(r.counts, { ready: 4, stale: 1, drifted: 1, ok: 1, none: 1, launchable: 4, landed: 3 });
  assert.deepEqual(render(r), [
    "STALE #1 1/1 line-cites: src/gone.js:4 gone  — Task 1",
    "DRIFTED #2 1/2 line-cites: src/app.js:900 past-end  — Task 2",
    "ready over cap: 4 launchable of 4 ready vs 3 PRs landed in 7 d",
    "= ready-sweep: 4 ready, 1 stale, 1 drifted, 1 ok, 1 with no line-cite",
  ]);
  assert.deepEqual(verifierRows(r.rows[1]), [
    "src/app.js:900 — issue #2 cites this line (past-end): Task 2",
    "src/app.js:9 — issue #2 cites this line (still inside the file): Task 2",
  ]);
});

test("the CLI reads with GETs only, pages issues, and reports an unreadable GitHub as exit 3", () => {
  const calls = [];
  const api = (p, opts) => {
    calls.push([p.replace(/^https:\/\/api\.github\.com\//, ""), opts?.method || "GET"]);
    if (p.startsWith("issues?")) return { json: [{ number: 1, title: "Task 1", body: "src/gone.js:4", labels: [{ name: "ready" }] }, { number: 9, title: "a PR", pull_request: {}, labels: [{ name: "ready" }] }] };
    if (p.startsWith("pulls?")) return { json: [] };
    if (p.includes("search/issues")) return { json: { total_count: 7 } };
    if (p === "issues/1") return { json: { number: 1, title: "Task 1", body: "src/gone.js:4", labels: [] } };
    return { error: "HTTP 404" };
  };
  const NOW = Date.parse("2026-11-10T12:00:00Z");
  assert.deepEqual(readSweepState({ api, now: NOW }).landed, 7);
  const out = [];
  assert.equal(main([], { api, log: (s) => out.push(s), now: () => NOW, tree }), 0);
  assert.deepEqual(out, ["STALE #1 1/1 line-cites: src/gone.js:4 gone  — Task 1", "ready within cap: 1 launchable of 1 ready vs 7 PRs landed in 7 d", "= ready-sweep: 1 ready, 1 stale, 0 drifted, 0 ok, 0 with no line-cite"]);
  assert.deepEqual(calls.at(-1), ["search/issues?q=repo%3Abrycejmurrin%2Ff1-game%20is%3Apr%20is%3Amerged%20merged%3A%3E%3D2026-11-03&per_page=1", "GET"]);
  assert.deepEqual([...new Set(calls.map((c) => c[1]))], ["GET"]);
  const one = [];
  assert.equal(main(["--issue", "1"], { api, log: (s) => one.push(s), tree }), 0);
  assert.deepEqual(one, ["src/gone.js:4 — issue #1 cites this line (gone): Task 1", "= ready-sweep: #1 stale, 1/1 line-cites do not land"]);
  const bad = [];
  assert.equal(main(["--issue", "2"], { api, log: (s) => bad.push(s), tree }), 3);
  assert.deepEqual(bad, ["ready-sweep: issues/2: HTTP 404"]);
  assert.equal(main(["--days", "0"], { api, log: () => {}, tree }), 1);
  assert.equal(main([], { api: () => ({ error: "HTTP 502" }), log: (s) => bad.push(s), now: () => NOW, tree }), 3);
  assert.equal(bad.at(-1), "ready-sweep: issues?state=open&per_page=100&page=1: HTTP 502");
});
