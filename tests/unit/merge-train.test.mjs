// merge-train: manifest, car picking, bisect history, the git fold and the purity proof the gate reads for a train/ PR (docs/notes/MERGE-TRAIN-2026-11-18.md).
import "../helpers/git-fixture-env.mjs"; // FIRST: scrubs the GIT_DIR & co. a git hook exports (#1807)
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import {
  TRAIN_MAX, TRAIN_PREFIX, CAR_ROWS, trainManifest, renderManifest, trainResult, trainBody, carCandidates, carVerdict,
  trainHistory, foldCars, verifyTrain, trainRow, trainDisposition, carMessage,
} from "../../tools/ci/merge-train.mjs";
import { evaluate, isProtectedConfigPath, isConfigPath } from "../../tools/ci/merge-gate.mjs";
import { planVerdict } from "../../tools/ci/ready-gate.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const DEPLOY = "claude/f1-game-project-26h3ng";
const sha = (c) => c.repeat(40);
const pull = (n, o = {}) => ({ number: n, state: "open", draft: false, labels: [{ name: "land" }], head: { sha: sha(String(n % 10)), ref: `claude/x-${n}`, repo: { full_name: "o/r" } }, base: { ref: DEPLOY, repo: { full_name: "o/r" } }, created_at: `2026-11-18T0${n % 10}:00:00Z`, ...o });

test("manifest round-trips and refuses malformed bodies", () => {
  const m = { base: sha("a"), cars: [{ pr: 5, head: sha("b"), ref: "claude/x" }, { pr: 7, head: sha("c"), ref: "claude/y" }] };
  assert.deepEqual(trainManifest(`text\n${renderManifest(m)}\nmore`), m);
  assert.equal(trainManifest("no marker"), null);
  assert.equal(trainManifest(renderManifest({ base: "abc", cars: m.cars })), null, "short base");
  assert.equal(trainManifest(renderManifest({ base: sha("a"), cars: [] })), null, "no cars");
  assert.equal(trainManifest(renderManifest({ base: sha("a"), cars: [m.cars[0], m.cars[0]] })), null, "duplicate car");
  assert.equal(trainManifest("<!-- merge-train {not json} -->"), null);
  assert.deepEqual(trainResult('<!-- merge-train-result {"outcome":"red","why":"CI failure"} -->'), { outcome: "red", why: "CI failure" });
  assert.equal(trainResult('<!-- merge-train-result {"outcome":"maybe"} -->'), null);
});

test("train body passes the gate's plan row and carries the manifest", () => {
  const cars = [{ pr: 5, head: sha("b"), ref: "r5" }, { pr: 7, head: sha("c"), ref: "r7" }];
  const body = trainBody({ base: sha("a"), cars, dropped: [{ pr: 9, why: "conflicts in a.js (sync-pr.mjs)" }] });
  assert.deepEqual(planVerdict(body), { state: "done", items: 3, open: [] });
  assert.deepEqual(trainManifest(body).cars.map((c) => c.pr), [5, 7]);
  const lines = body.split("\n");
  assert.deepEqual(lines.filter((l) => l.startsWith("- ")), ["- [x] #5 `bbbbbbbbbbbb` merged clean", "- [x] #7 `cccccccccccc` merged clean",
    "- [ ] land: CI green on this head, then `gate` (each car's own rows) arms it", "- #9: conflicts in a.js (sync-pr.mjs)"]);
});

test("carCandidates: land only, priority first then oldest, with an exact skip list", () => {
  const rows = [
    pull(13), pull(12, { labels: [{ name: "land" }, { name: "priority" }] }), pull(11),
    pull(14, { draft: true }), pull(15, { labels: [{ name: "land" }, { name: "hold" }] }),
    pull(16, { head: { sha: sha("6"), ref: `${TRAIN_PREFIX}x`, repo: { full_name: "o/r" } } }),
    pull(17, { head: { sha: sha("7"), ref: "f", repo: { full_name: "fork/r" } } }),
    pull(18), pull(19), pull(20, { labels: [] }),
  ];
  const r = carCandidates(rows, { exclude: new Set([`18@${sha("8")}`]), gateOk: new Set([19]) });
  assert.deepEqual(r.cars.map((c) => c.pr), [12, 11, 13]);
  assert.deepEqual(r.skipped, [
    { pr: 14, why: "draft" }, { pr: 15, why: "hold" }, { pr: 16, why: "a train itself" }, { pr: 17, why: "a fork" },
    { pr: 18, why: "alone in a red train at this head" }, { pr: 19, why: "its own gate already passed (it arms alone)" },
  ]);
});

test("carVerdict: every CAR_ROWS row must pass; base and the merge rows are the train's", () => {
  assert.deepEqual(CAR_ROWS, ["open", "hold", "plan", "ci", "config", "raise"]);
  const ok = (e = "") => ({ ok: true, evidence: e });
  const rows = { open: ok(), hold: ok(), plan: ok(), ci: ok(), base: { ok: false, pending: true, evidence: "tip red" }, config: ok(), raise: ok() };
  assert.deepEqual(carVerdict({ head: sha("a"), rows }, sha("a")), { ok: true, why: "" });
  assert.deepEqual(carVerdict({ head: sha("a"), rows: { ...rows, config: { ok: false, evidence: "needs config-ok" } } }, sha("a")), { ok: false, why: "config: needs config-ok" });
  assert.deepEqual(carVerdict({ head: sha("b"), rows }, sha("a")), { ok: false, why: "head moved to bbbbbbbb" });
  assert.deepEqual(carVerdict({ error: "boom" }), { ok: false, why: "gate error: boom" });
});

test("trainHistory bisects: a red train of n caps the next at floor(n/2); a lone red car is left out", () => {
  const now = Date.parse("2026-11-18T12:00:00Z");
  const car = (pr) => ({ pr, head: sha(String(pr % 10)) });
  assert.deepEqual(trainHistory([], { now }), { cap: TRAIN_MAX, exclude: new Set() });
  assert.equal(trainHistory([{ cars: [1, 2, 3, 4, 5].map(car), outcome: "red", closed: "2026-11-18T11:00:00Z" }], { now }).cap, 2);
  assert.equal(trainHistory([{ cars: [1, 2].map(car), outcome: "red", closed: "2026-11-18T11:00:00Z" }], { now }).cap, 1);
  const h = trainHistory([
    { cars: [car(3)], outcome: "stale", closed: "2026-11-18T11:50:00Z" },
    { cars: [car(1)], outcome: "red", closed: "2026-11-18T11:30:00Z" },
    { cars: [1, 2].map(car), outcome: "red", closed: "2026-11-18T11:00:00Z" },
    { cars: [car(9)], outcome: "red", closed: "2026-11-16T11:00:00Z" },
  ], { now });
  assert.deepEqual(h, { cap: 1, exclude: new Set([`1@${sha("1")}`]) }, "stale is skipped; a red older than 24 h does not count");
  assert.equal(trainHistory([{ cars: [car(1)], outcome: "merged", closed: "2026-11-18T11:55:00Z" }, { cars: [1, 2].map(car), outcome: "red", closed: "2026-11-18T11:00:00Z" }], { now }).cap, TRAIN_MAX, "a merged train resets the cap");
});

test("trainDisposition: stale when a car moved, red on CI or gate failure, else keep running", () => {
  const m = { base: sha("a"), cars: [{ pr: 5, head: sha("b") }, { pr: 7, head: sha("c") }] };
  const p = (h, o = {}) => ({ state: "open", head: { sha: h }, labels: [{ name: "land" }], ...o });
  const cars = new Map([[5, p(sha("b"))], [7, p(sha("c"))]]);
  assert.deepEqual(trainDisposition({ manifest: m, cars, ciConclusion: "", gate: "pending" }), { close: false });
  assert.deepEqual(trainDisposition({ manifest: m, cars, ciConclusion: "failure", gate: "" }), { close: true, outcome: "red", why: "CI failure on the train head" });
  assert.deepEqual(trainDisposition({ manifest: m, cars, ciConclusion: "success", gate: "failure" }).outcome, "red");
  assert.deepEqual(trainDisposition({ manifest: m, cars: new Map([[5, p(sha("d"))], [7, p(sha("c"))]]), ciConclusion: "failure" }), { close: true, outcome: "stale", why: "car #5 moved, closed or lost land" });
  assert.deepEqual(trainDisposition({ manifest: m, cars: new Map([[5, p(sha("b"), { state: "closed", merged_at: "x" })], [7, p(sha("c"))]]), ciConclusion: "success", gate: "success" }), { close: false }, "a car that landed alone is not a move");
});

// ---- git fixtures: a real repo, exact shas compared -------------------------------------------------------
const scratch = (prefix) => { const d = path.join(ROOT, "artifacts", "tmp"); fs.mkdirSync(d, { recursive: true }); return fs.mkdtempSync(path.join(d, prefix)); };
function repo() {
  const dir = scratch("merge-train-");
  const g = (...a) => { const r = spawnSync("git", a, { cwd: dir, encoding: "utf8", env: { ...process.env, GIT_AUTHOR_NAME: "t", GIT_AUTHOR_EMAIL: "t@t", GIT_COMMITTER_NAME: "t", GIT_COMMITTER_EMAIL: "t@t" } }); assert.equal(r.status, 0, r.stderr); return r.stdout.trim(); };
  g("init", "-q", "-b", "main");
  const write = (f, s) => fs.writeFileSync(path.join(dir, f), s);
  write("a.txt", "a\n"); write("b.txt", "b\n"); g("add", "."); g("commit", "-qm", "base");
  const base = g("rev-parse", "HEAD");
  const branch = (name, f, s) => { g("switch", "-qc", name, base); write(f, s); g("add", "."); g("commit", "-qm", name); return g("rev-parse", "HEAD"); };
  const h1 = branch("one", "c.txt", "one\n"), h2 = branch("two", "d.txt", "two\n"), h3 = branch("three", "c.txt", "three\n");
  g("switch", "-q", "main");
  return { dir, g, base, h1, h2, h3, rm: () => fs.rmSync(dir, { recursive: true, force: true }) };
}

test("foldCars merges clean cars in order, drops a conflicting one, and verifyTrain proves exactly that fold", () => {
  const r = repo();
  try {
    const cars = [{ pr: 1, head: r.h1, ref: "one" }, { pr: 3, head: r.h3, ref: "three" }, { pr: 2, head: r.h2, ref: "two" }];
    const f = foldCars({ base: r.base, cars, cwd: r.dir });
    assert.deepEqual(f.cars.map((c) => c.pr), [1, 2]);
    assert.deepEqual(f.dropped, [{ pr: 3, why: "conflicts in c.txt (sync-pr.mjs)" }]);
    const parents = r.g("rev-list", "--first-parent", "--parents", f.head, `^${r.base}`).split("\n").reverse().map((l) => l.split(" ").slice(1));
    assert.deepEqual(parents[0], [r.base, r.h1]);
    assert.equal(parents[1][1], r.h2);
    assert.equal(r.g("log", "-1", "--format=%s", f.head), "Merge pull request #2 from brycejmurrin/two");
    assert.equal(r.g("show", `${f.head}:c.txt`), "one");
    assert.equal(r.g("show", `${f.head}:d.txt`), "two");
    const ok = verifyTrain({ base: r.base, head: f.head, cars: f.cars, tip: r.base, cwd: r.dir });
    assert.deepEqual(ok, { ok: true, why: `${f.head.slice(0, 8)} is the clean fold of #1 #2 onto ${r.base.slice(0, 8)}` });
    assert.equal(verifyTrain({ base: r.base, head: f.head, cars: [...f.cars].reverse(), tip: r.base, cwd: r.dir }).ok, false, "order matters");
    assert.equal(verifyTrain({ base: r.base, head: f.head, cars: f.cars.slice(0, 1), tip: r.base, cwd: r.dir }).why, "head has 2 commit(s) past base on its first-parent line, the manifest names 1 car(s)");
    // max caps the train; an already-merged car is dropped with why
    assert.deepEqual(foldCars({ base: r.base, cars, cwd: r.dir, max: 1 }).cars.map((c) => c.pr), [1]);
    assert.deepEqual(foldCars({ base: r.h1, cars: cars.slice(0, 1), cwd: r.dir }).dropped, [{ pr: 1, why: "already on the tip" }]);
  } finally { r.rm(); }
});

test("verifyTrain refuses an extra change smuggled into a merge commit, and a base not on the deploy branch", () => {
  const r = repo();
  try {
    const cars = [{ pr: 1, head: r.h1, ref: "one" }];
    // a merge commit whose tree is NOT the clean merge (an extra file rides along)
    r.g("switch", "-qc", "evil", r.base); r.g("merge", "-q", "--no-ff", "--no-commit", r.h1);
    fs.writeFileSync(path.join(r.dir, "evil.txt"), "x\n"); r.g("add", "."); r.g("commit", "-qm", carMessage(cars[0]));
    const evil = r.g("rev-parse", "HEAD"); r.g("switch", "-q", "main");
    assert.deepEqual(verifyTrain({ base: r.base, head: evil, cars, tip: r.base, cwd: r.dir }), { ok: false, why: `commit ${evil.slice(0, 8)} (#1) is not the clean merge of its parents` });
    // a base that is some branch commit, not the deploy tip's history
    const f = foldCars({ base: r.h2, cars, cwd: r.dir });
    assert.deepEqual(verifyTrain({ base: r.h2, head: f.head, cars, tip: r.base, cwd: r.dir }), { ok: false, why: `base ${r.h2.slice(0, 8)} is not on the deploy branch` });
  } finally { r.rm(); }
});

test("trainRow: a pure train passes only when every car is open at its head, carries land and passes its own rows", () => {
  const manifest = { base: sha("a"), cars: [{ pr: 5, head: sha("b") }, { pr: 7, head: sha("c") }] };
  const ok = (e = "") => ({ ok: true, evidence: e });
  const rows = Object.fromEntries(CAR_ROWS.map((k) => [k, ok()]));
  const pulls = { 5: { head: { sha: sha("b"), ref: "r5" }, labels: [{ name: "land" }] }, 7: { head: { sha: sha("c"), ref: "r7" }, labels: [{ name: "land" }] } };
  const base = { manifest, head: sha("f"), headRef: "train/x", tip: sha("a"), verify: () => ({ ok: true, why: "pure" }), carPull: (n) => ({ json: pulls[n] }), carGate: (n, h) => ({ head: h, rows }) };
  assert.deepEqual(trainRow(base), { ok: true, evidence: "pure; every car passes open, hold, plan, ci, config and raise on its own" });
  assert.deepEqual(trainRow({ ...base, manifest: null }), { ok: false, evidence: "a train/ branch (train/x) with no valid merge-train manifest in its body" });
  assert.deepEqual(trainRow({ ...base, verify: () => ({ ok: false, why: "extra file" }) }), { ok: false, evidence: "train is not a pure merge of its cars: extra file" });
  const held = (n, h) => ({ head: h, rows: n === 7 ? { ...rows, hold: { ok: false, evidence: "hold set by brycejmurrin" } } : rows });
  assert.deepEqual(trainRow({ ...base, carGate: held }), { ok: false, evidence: "car rows: #7 hold: hold set by brycejmurrin" });
  assert.deepEqual(trainRow({ ...base, carPull: (n) => ({ json: n === 5 ? { ...pulls[5], labels: [] } : pulls[n] }) }), { ok: false, evidence: "car rows: #5 no longer carries land" });
  assert.deepEqual(trainRow({ ...base, carPull: (n) => ({ json: n === 5 ? { ...pulls[5], head: { sha: sha("d") } } : pulls[n] }) }), { ok: false, evidence: "car rows: #5 head moved to dddddddd" });
  assert.equal(trainRow({ ...base, carPull: (n) => ({ json: n === 5 ? { ...pulls[5], merged_at: "2026-11-18T10:00:00Z", labels: [] } : pulls[n] }) }).ok, true, "a car that landed alone at this head is fine");
});

test("merge-gate evaluate: a train/ PR's config and raise rows come from trainCheck, not its own diff", () => {
  const HEAD = sha("e");
  const request = (p) => {
    if (p === "pulls/42") return { json: { state: "open", draft: false, head: { sha: HEAD, ref: "train/20261118T1030-5-7" }, base: { ref: DEPLOY }, labels: [{ name: "land" }], body: "## Plan\n\n- [x] a\n", user: { login: "x" } } };
    if (p.startsWith("pulls/42/files")) throw new Error("a train's own diff is not read");
    if (p.includes("/check-runs")) return { json: { check_runs: [] } };
    if (p.includes("/runs")) return { json: { workflow_runs: [] } };
    if (p.startsWith("branches/")) return { json: { commit: { sha: sha("a") } } };
    return { json: [] };
  };
  const seen = [];
  const v = evaluate({ pr: 42, request, trusted: true, trainCheck: (a) => { seen.push(a.pr); return { ok: false, evidence: "car rows: #5 config: needs config-ok" }; } });
  assert.equal(v.error, undefined, v.error);
  assert.deepEqual(seen, [42]);
  assert.deepEqual(v.rows.config, { ok: false, evidence: "car rows: #5 config: needs config-ok" });
  assert.deepEqual(v.rows.raise, { ok: false, evidence: "not evaluated: the train's car rows refused (config row)" });
});

test("the train module is a protected gate path", () => {
  assert.equal(isProtectedConfigPath("tools/ci/merge-train.mjs"), true);
  assert.equal(isConfigPath("tools/ci/merge-train.mjs"), true);
});
