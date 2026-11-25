// merge-train: manifest, car picking, bisect history, the git fold and the purity proof the gate reads for a train/ PR (docs/notes/MERGE-TRAIN-2026-11-18.md).
import "../helpers/git-fixture-env.mjs"; // FIRST: scrubs the GIT_DIR & co. a git hook exports (#1807)
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import {
  TRAIN_MAX, TRAIN_PREFIX, TRAIN_LABEL, CAR_ROWS, RESOLVE_CAP, newestRun, trainManifest, renderManifest, trainResult, trainBody,
  carCandidates, carVerdict, openTrainCarIds, boardedTrainOf, resolveLandable,
  trainHistory, foldCars, verifyTrain, trainRow, trainDisposition, carMessage, redOnRedTip, main,
  stuckGreen, retryAttempts, STUCK_GREEN_MIN, RETRY_MAX,
  readScreen, screenAccept, screenFold, screenMain, soloLane, landRunsInFlight, resnapVerdict, resnapTree, SCREEN_BUDGET_MS,
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
  const r = carCandidates(rows, { exclude: new Set([`18@${sha("8")}`]), solo: new Map([[19, "armed: auto-merge is on (it lands alone)"]]) });
  assert.deepEqual(r.cars.map((c) => c.pr), [12, 11, 13]);
  assert.deepEqual(r.skipped, [
    { pr: 14, why: "draft" }, { pr: 15, why: "hold" }, { pr: 16, why: "a train itself" }, { pr: 17, why: "a fork" },
    { pr: 18, why: "alone in a red train at this head" }, { pr: 19, why: "armed: auto-merge is on (it lands alone)" },
  ]);
});

// ---- #6055 merge-train starvation: resolve's 4-cap + cars arming alone ------------------------------------

test("#6055: resolveLandable keeps an open train in the 4-cap and drops its cars (fails on pre-fix sort+cap)", () => {
  assert.equal(RESOLVE_CAP, 4);
  const hx = (c) => c.repeat(40);
  // Five older cars fill the cap; the train is newest (land.yml's sort_by(.prio,.created,.number)|.[:4] drops it).
  const cars = [1, 2, 3, 4, 5].map((n) => ({
    number: n, head: hx(String(n)), prio: 1, created: `2026-11-20T0${n}:00:00Z`,
  }));
  const train = {
    number: 99, head: hx("9"), prio: 1, created: "2026-11-20T12:00:00Z", train: true,
    ref: `${TRAIN_PREFIX}20261120T1200-1-2-3-4-5`,
  };
  const trainCarIds = new Set(cars.map(c => `${c.number}@${c.head}`));
  const picked = resolveLandable([...cars, train], { trainCarIds, cap: RESOLVE_CAP });
  assert.deepEqual(picked.map((r) => r.number), [99], "open train is the only landable PR: cars of that train are not gated or armed alone");
  // A non-car land PR older than the train still yields after the train (prio, then age).
  const other = { number: 50, head: hx("5"), prio: 1, created: "2026-11-20T08:00:00Z" };
  assert.deepEqual(resolveLandable([...cars, other, train], { trainCarIds }).map((r) => r.number), [99, 50]);
  // priority still beats a non-train; a train still beats priority cars of its own set.
  const prioCar = { number: 2, head: hx("2"), prio: 0, created: "2026-11-20T01:00:00Z" };
  assert.deepEqual(resolveLandable([prioCar, train], { trainCarIds: new Set([`2@${hx("2")}`]) }).map((r) => r.number), [99]);
});

test("#6055: openTrainCarIds / boardedTrainOf read the open train manifest", () => {
  const body = trainBody({ base: sha("a"), cars: [{ pr: 5, head: sha("b"), ref: "r5" }, { pr: 7, head: sha("c"), ref: "r7" }] });
  const trains = [
    { number: 90, state: "open", head: { ref: `${TRAIN_PREFIX}x-5-7` }, body, labels: [{ name: "land" }, { name: TRAIN_LABEL }] },
    { number: 91, state: "closed", head: { ref: `${TRAIN_PREFIX}y` }, body },
    { number: 8, state: "open", head: { ref: "cursor/x" }, body: "not a train" },
  ];
  assert.deepEqual([...openTrainCarIds(trains)], [`5@${sha("b")}`, `7@${sha("c")}`]);
  assert.deepEqual([boardedTrainOf(5, sha("b"), trains), boardedTrainOf(7, sha("c"), trains), boardedTrainOf(5, sha("d"), trains), boardedTrainOf(5, sha("b"), [])], [90, 90, null, null]);
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
  assert.equal(TRAIN_MAX, 12, "Bryce 2026-11-18 ~19:50Z: bigger trains 5→10; #6528 (2026-11-25): 10→12, trains are the default lane");
  assert.deepEqual(trainHistory([], { now }), { cap: TRAIN_MAX, exclude: new Set() });
  const red = (n, closed = "2026-11-18T11:00:00Z") => ({ cars: Array.from({ length: n }, (_, i) => car(i + 1)), outcome: "red", closed });
  assert.equal(trainHistory([red(12)], { now }).cap, 6, "a red train of 12 halves to 6");
  assert.equal(trainHistory([red(10)], { now }).cap, 5, "a red train of 10 halves to 5");
  assert.equal(trainHistory([red(5, "2026-11-18T11:30:00Z"), red(10)], { now }).cap, 2, "then a red 5 halves to 2");
  assert.equal(trainHistory([red(2, "2026-11-18T11:45:00Z"), red(5, "2026-11-18T11:30:00Z"), red(10)], { now }).cap, 1, "then a red 2 halves to 1");
  assert.equal(trainHistory([{ cars: [1, 2, 3, 4, 5].map(car), outcome: "red", closed: "2026-11-18T11:00:00Z" }], { now }).cap, 2);
  assert.equal(trainHistory([{ cars: [1, 2].map(car), outcome: "red", closed: "2026-11-18T11:00:00Z" }], { now }).cap, 1);
  const h = trainHistory([
    { cars: [car(1)], outcome: "red", closed: "2026-11-18T11:30:00Z" }, // updated after the stale train closed
    { cars: [car(3)], outcome: "stale", closed: "2026-11-18T11:50:00Z" },
    { cars: [1, 2].map(car), outcome: "red", closed: "2026-11-18T11:00:00Z" },
    { cars: [car(9)], outcome: "red", closed: "2026-11-16T11:00:00Z" },
  ], { now });
  assert.deepEqual(h, { cap: TRAIN_MAX, exclude: new Set([`1@${sha("1")}`]) }, "a newer stale train resets capacity but keeps an unexpired single-head failure excluded");
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
  // PR #5809 (train #5814, run 44429435124): a cancelled CI run and no completed CI check-run closes the train
  const run = (status, conclusion) => ({ status, conclusion });
  assert.deepEqual(trainDisposition({ manifest: m, cars, ciConclusion: "", gate: "", ciRun: run("completed", "cancelled") }),
    { close: true, outcome: "stale", why: "the CI run on the train head was cancelled before its CI check completed" });
  assert.deepEqual(trainDisposition({ manifest: m, cars, ciConclusion: "", gate: "", ciRun: run("completed", "timed_out") }),
    { close: true, outcome: "red", why: "the CI run on the train head ended timed_out before its CI check completed" });
  assert.deepEqual(trainDisposition({ manifest: m, cars, ciConclusion: "", gate: "", ciRun: run("in_progress", "") }), { close: false });
  assert.deepEqual(trainDisposition({ manifest: m, cars, ciConclusion: "", gate: "", ciRun: run("completed", "success") }), { close: false }, "a green run waits for its gate");
  assert.deepEqual(trainDisposition({ manifest: m, cars, ciConclusion: "", gate: "", ciRun: null }), { close: false }, "an unreadable run keeps waiting");
  assert.deepEqual(trainDisposition({ manifest: m, cars, ciConclusion: "failure", gate: "", ciRun: run("completed", "cancelled") }), { close: true, outcome: "red", why: "CI failure on the train head" }, "a completed CI check wins");
  assert.deepEqual(newestRun({ workflow_runs: [{ id: 9, status: "completed", conclusion: "cancelled" }, { id: 12, status: "queued", conclusion: null }] }), { status: "queued", conclusion: "" });
  assert.equal(newestRun({ workflow_runs: [] }), null);
  assert.equal(newestRun(null), null);
});

test("T1 (train #6382): a gate success left unarmed closes the train stale; armed, fresh or still in budget keeps it", () => {
  const m = { base: sha("a"), cars: [{ pr: 5, head: sha("b") }] };
  const cars = new Map([[5, { state: "open", head: { sha: sha("b") }, labels: [{ name: "land" }] }]]);
  // #6382: gate success 22:52:32Z, arm failed on a 503 at 22:55Z; still open at 00:27Z when a person closed it.
  const gateAt = Date.parse("2026-11-24T22:52:32Z"), min = (n) => gateAt + n * 60_000;
  const d = (stuck) => trainDisposition({ manifest: m, cars, ciConclusion: "success", gate: "success", stuck });
  assert.deepEqual(trainDisposition({ manifest: m, cars, ciConclusion: "success", gate: "success" }), { close: false }, "no stuck inputs: as before");
  assert.deepEqual(d({ armed: false, gateAt, now: min(16) }), { close: true, outcome: "stale", why: "gate success at 2026-11-24T22:52:32.000Z is still unarmed after 16 min" });
  assert.equal(STUCK_GREEN_MIN, 15);
  assert.deepEqual(d({ armed: false, gateAt, now: min(15) }), { close: false }, "at 15 min it may still be arming");
  assert.deepEqual(d({ armed: true, gateAt, now: min(95) }), { close: false }, "an armed train is GitHub's to merge");
  assert.deepEqual(d({ armed: false, gateAt: NaN, now: min(95) }), { close: false }, "an unreadable gate time closes nothing");
  assert.deepEqual(d({ armed: false, gateAt, now: min(4), tipAt: min(2), attempts: RETRY_MAX }),
    { close: true, outcome: "stale", why: `gate success at 2026-11-24T22:52:32.000Z measured an older deploy tip and its head spent the retry budget (${RETRY_MAX} of ${RETRY_MAX})` });
  assert.deepEqual(d({ armed: false, gateAt, now: min(4), tipAt: min(2), attempts: RETRY_MAX - 1 }), { close: false }, "budget left: retry re-gates it");
  assert.deepEqual(d({ armed: false, gateAt, now: min(4), tipAt: min(2), attempts: null }), { close: false }, "unread dispatches: wait for the age rule");
  assert.deepEqual(d({ armed: false, gateAt, now: min(4), tipAt: min(-1), attempts: RETRY_MAX }), { close: false }, "tip unmoved since the success");
  assert.deepEqual(trainDisposition({ manifest: m, cars, ciConclusion: "success", gate: "pending", stuck: { armed: false, gateAt, now: min(95) } }), { close: false }, "only a success is a stuck green");
  assert.deepEqual(stuckGreen({ armed: false, gateAt, now: min(20) }).outcome, "stale", "stale, never red: no bisect");
  const land = fs.readFileSync(path.join(ROOT, ".github/workflows/land.yml"), "utf8");
  assert.equal(String(RETRY_MAX), /^ {2}RETRY_MAX: (\d+)$/m.exec(land)?.[1], "the builder's budget is land.yml's");
});

test("retryAttempts: the highest Land retry attempt for this PR at this head", () => {
  const H = sha("b"), runs = (...t) => ({ workflow_runs: t.map((display_title) => ({ display_title })) });
  assert.equal(retryAttempts(runs(`Land retry pr=6382 head=${H} attempt=1`, `Land retry pr=6382 head=${H} attempt=3`, `Land retry pr=6382 head=${sha("c")} attempt=2`, "Land stale sweep"), 6382, H), 3);
  assert.equal(retryAttempts(runs(`Land retry pr=6383 head=${H} attempt=3`), 6382, H), 0, "another PR's budget");
  assert.equal(retryAttempts(runs(`Land retry pr=6382 head=- attempt=2`), 6382, H), 2, "a hand dispatch with no head counts");
  assert.equal(retryAttempts(runs(`Land retry pr=6382 head=${sha("c")} attempt=3`), 6382, H), 0, "an older head's budget");
  assert.equal(retryAttempts({}, 6382, H), null);
});

test("main --build (T1): a train green and unarmed for 20 min is closed stale and the cars are rebuilt; an armed one waits", async () => {
  const m = { base: sha("a"), cars: [{ pr: 5, head: sha("b"), ref: "claude/x" }] };
  const now = Date.parse("2026-11-24T23:12:32Z");
  const run = async (auto_merge) => {
    const writes = [], logs = [];
    let opens = 0;
    const train = { number: 6382, head: { sha: sha("e"), ref: "train/x-5" }, body: renderManifest(m), auto_merge };
    const request = (p, o) => {
      if (o?.method) { writes.push({ p, ...o }); return { json: {} }; }
      if (p.startsWith("pulls?state=open")) return opens++ ? { error: "stop here" } : { json: [train] };
      if (p === "pulls/5") return { json: { state: "open", head: { sha: sha("b") }, labels: [{ name: "land" }] } };
      if (p.includes("check-runs?check_name=CI")) return { json: { check_runs: [{ app: { slug: "github-actions" }, status: "completed", conclusion: "success" }] } };
      if (p.includes("/statuses")) return { json: [{ context: "gate", state: "success", created_at: "2026-11-24T22:52:32Z" }] };
      return { error: `unexpected ${p}` };
    };
    const code = await main(["--build"], { request, log: (l) => logs.push(l), now });
    return { code, writes, logs };
  };
  const r = await run(null);
  const close = r.writes.find((w) => w.p === "pulls/6382");
  assert.ok(close, r.logs.join("\n"));
  assert.equal(close.body.state, "closed");
  assert.deepEqual(trainResult(close.body.body), { outcome: "stale", why: "gate success at 2026-11-24T22:52:32.000Z is still unarmed after 20 min" });
  assert.deepEqual(r.logs.filter((l) => l.startsWith("= merge-train closed")), ["= merge-train closed #6382 (stale): gate success at 2026-11-24T22:52:32.000Z is still unarmed after 20 min"]);
  const a = await run({ enabled_by: { login: "x" } });
  assert.equal(a.code, 0);
  assert.deepEqual(a.writes, [], "armed: GitHub merges it");
  assert.deepEqual(a.logs, ["= merge-train waiting — train #6382 is still running"]);
});

test("redOnRedTip: a red train on a red tip closes stale (no bisect); a red on a green or unknown tip stays red", () => {
  const red = { close: true, outcome: "red", why: "CI failure on the train head" };
  const d = redOnRedTip(red, { state: "code-red", evidence: "the tip e9f93c47's own unit gate fails" });
  assert.equal(d.outcome, "stale");
  assert.equal(d.tipRed, true);
  assert.equal(d.why, "CI failure on the train head, while the deploy tip was red (the tip e9f93c47's own unit gate fails): not the cars' red, no bisect");
  for (const state of ["green", "platform", "none", "unverified"]) assert.deepEqual(redOnRedTip(red, { state }), red, `${state} keeps the bisect`);
  assert.deepEqual(redOnRedTip(red, null), red);
  const stale = { close: true, outcome: "stale", why: "car #5 moved, closed or lost land" };
  assert.deepEqual(redOnRedTip(stale, { state: "code-red" }), stale);
  assert.deepEqual(redOnRedTip({ close: false }, { state: "code-red" }), { close: false });
  // trains #5822 (5) … #5827 (1), 2026-11-19: closed stale, they no longer halve the cap or exclude a lone car
  const now = Date.parse("2026-11-19T07:00:00Z"), car = (n) => ({ pr: n, head: sha(String(n)) });
  const closed = [{ cars: [car(1)], outcome: d.outcome, closed: "2026-11-19T06:23:00Z" }, { cars: [1, 2, 3, 4, 5].map(car), outcome: d.outcome, closed: "2026-11-19T04:24:00Z" }];
  assert.deepEqual(trainHistory(closed, { now }), { cap: TRAIN_MAX, exclude: new Set() });
});

test("main --build: a red train whose base the tip gate finds red is closed stale with why; a green base bisects", async () => {
  const base = sha("a");
  const m = { base, cars: [{ pr: 5, head: sha("b"), ref: "claude/x" }] };
  const train = { number: 90, head: { sha: sha("e"), ref: "train/x-5" }, body: renderManifest(m) };
  const run = async (gateState) => {
    const writes = [], gated = [];
    let opens = 0;
    const request = (p, o) => {
      if (o?.method) { writes.push({ p, ...o }); return { json: {} }; }
      if (p.startsWith("pulls?state=open")) return opens++ ? { error: "stop here" } : { json: [train] };
      if (p === "pulls/5") return { json: { state: "open", head: { sha: sha("b") }, labels: [{ name: "land" }] } };
      if (p.includes("check-runs?check_name=CI")) return { json: { check_runs: [{ app: { slug: "github-actions" }, status: "completed", conclusion: "failure" }] } };
      if (p.includes("/statuses")) return { json: [] };
      if (p.startsWith("actions/workflows/pages.yml/runs")) return { json: { workflow_runs: [{ id: 1, conclusion: "success", head_sha: sha("9") }] } };
      return { error: `unexpected ${p}` };
    };
    const tipCheck = ({ sha: s }) => { gated.push(s); return { state: gateState, sha: s, jobs: gateState === "code-red" ? ["boot-load-budget"] : [], evidence: `the tip ${s.slice(0, 8)}'s own unit gate ${gateState === "code-red" ? "fails" : "passed"}` }; };
    const code = await main(["--build"], { request, log: () => {}, tipCheck });
    return { code, writes, gated };
  };
  const r = await run("code-red");
  assert.deepEqual(r.gated, [base], "the tip gate runs on the train's base");
  const close = r.writes.find((w) => w.p === "pulls/90");
  assert.equal(trainResult(close.body.body).outcome, "stale");
  assert.equal(close.body.state, "closed");
  assert.equal(r.writes.find((w) => w.p.endsWith("/comments")).body.body.split("\n")[0],
    `merge-train: closed (stale) — CI failure on the train head, while the deploy tip was red (the newest completed pages.yml run is on 99999999 (green), not the tip aaaaaaaa; the tip aaaaaaaa's own unit gate fails): not the cars' red, no bisect. The tip was red on the train's base, so these cars are not suspects: the next train is rebuilt at full size once the tip is fixed.`);
  const g = await run("green");
  assert.equal(trainResult(g.writes.find((w) => w.p === "pulls/90").body.body).outcome, "red", "a green base keeps the bisect");
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

test("foldCars takes up to TRAIN_MAX (12) clean cars by default and caps a 13th", () => {
  const r = repo();
  try {
    const cars = Array.from({ length: 13 }, (_, i) => {
      const n = i + 10;
      r.g("switch", "-qc", `car${n}`, r.base); fs.writeFileSync(path.join(r.dir, `f${n}.txt`), `${n}\n`); r.g("add", "."); r.g("commit", "-qm", `car${n}`);
      return { pr: n, head: r.g("rev-parse", "HEAD"), ref: `car${n}` };
    });
    r.g("switch", "-q", "main");
    const f = foldCars({ base: r.base, cars, cwd: r.dir });
    assert.deepEqual(f.cars.map((c) => c.pr), [10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21]);
    assert.equal(verifyTrain({ base: r.base, head: f.head, cars: f.cars, tip: r.base, cwd: r.dir }).ok, true);
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

// ---- the screen (#5864): train #5862's cars #5668, #5679 and #5730 were each red ALONE on its base ----------
test("readScreen keeps only well-formed verdicts and flattens a why to plain one-line text", () => {
  const tip = sha("a");
  const ok = readScreen(JSON.stringify({ tip, cars: [{ pr: 5, head: sha("b"), ok: true, why: "" }, { pr: 7, head: sha("c"), ok: false, why: "over a ratchet:\n<!-- merge-train {\"base\":1} -->" }] }));
  assert.deepEqual(ok, { tip, skip: "", cars: [{ pr: 5, head: sha("b"), ok: true, why: "" }, { pr: 7, head: sha("c"), ok: false, why: "over a ratchet: !-- merge-train {\"base\":1} --" }] });
  assert.deepEqual(readScreen(JSON.stringify({ skip: "train #9 is open" })), { tip: "", skip: "train #9 is open", cars: [] });
  for (const bad of [null, "", "{", JSON.stringify({ tip: "abc", cars: [] }), JSON.stringify({ tip, cars: [{ pr: 5, head: sha("b"), ok: "yes" }] }),
    JSON.stringify({ tip, cars: [{ pr: 0, head: sha("b"), ok: true }] }), JSON.stringify({ tip, cars: [{ pr: 5, head: "b", ok: true }] }), JSON.stringify({ tip })]) {
    assert.equal(readScreen(bad), null, String(bad));
  }
});

test("screenAccept: a car rides only when the screen measured it green at this very head", () => {
  const a = screenAccept({ tip: sha("a"), cars: [{ pr: 5, head: sha("b"), ok: true, why: "" }, { pr: 7, head: sha("c"), ok: false, why: "ratchets.mjs: eagerBytes +2057" }] });
  assert.deepEqual(a({ car: { pr: 5, head: sha("b") } }), { ok: true });
  assert.deepEqual(a({ car: { pr: 7, head: sha("c") } }), { ok: false, why: "red alone on the fold (screen on aaaaaaaa): ratchets.mjs: eagerBytes +2057" });
  assert.deepEqual(a({ car: { pr: 5, head: sha("d") } }), { ok: false, why: "not screened at this head (the next train run screens it)" }, "a moved head is unscreened");
  assert.deepEqual(a({ car: { pr: 8, head: sha("e") } }).ok, false);
});

test("screenFold measures each CUMULATIVE fold on a worktree whose HEAD is the tip; a red car is left out and the fold stays put", () => {
  const r = repo();
  try {
    const seen = [], out = [];
    const check = ({ cwd }) => {
      seen.push({ head: spawnSync("git", ["rev-parse", "HEAD"], { cwd, encoding: "utf8" }).stdout.trim(), files: fs.readdirSync(cwd).filter((f) => f.endsWith(".txt")).sort() });
      return fs.existsSync(path.join(cwd, "d.txt")) ? { ok: false, evidence: "over a ratchet on the merge result: d.txt" } : { ok: true, evidence: "hold" };
    };
    let built = 0;
    const prepare = ({ cwd }) => { built++; fs.writeFileSync(path.join(cwd, "built.gen"), "x"); return { ok: true }; };
    const sf = screenFold({ tip: r.base, cwd: r.dir, check, prepare, out });
    const cars = [{ pr: 1, head: r.h1, ref: "one" }, { pr: 2, head: r.h2, ref: "two" }, { pr: 3, head: r.h3, ref: "three" }];
    // commit-tree stamps wall-clock dates: two folds a second apart differ in sha (run 44650842513). Pin the dates so the
    // sha equality below proves the same fold — same trees, parents and messages — not that both ran in one second.
    const env = { GIT_AUTHOR_DATE: "2026-11-18T00:00:00Z", GIT_COMMITTER_DATE: "2026-11-18T00:00:00Z" };
    const f = foldCars({ base: r.base, cars, cwd: r.dir, env, accept: sf.accept });
    sf.cleanup();
    assert.deepEqual(f.cars.map((c) => c.pr), [1]);
    assert.deepEqual(f.dropped, [{ pr: 2, why: "over a ratchet on the merge result: d.txt" }, { pr: 3, why: "conflicts in c.txt (sync-pr.mjs)" }]);
    assert.deepEqual(out, [{ pr: 1, head: r.h1, ok: true, why: "" }, { pr: 2, head: r.h2, ok: false, why: "over a ratchet on the merge result: d.txt" }]);
    assert.deepEqual(seen, [{ head: r.base, files: ["a.txt", "b.txt", "c.txt"] }, { head: r.base, files: ["a.txt", "b.txt", "c.txt", "d.txt"] }], "car 2 is measured on top of car 1");
    assert.equal(built, 2, "gen runs before each check (the built files are not in the tree)");
    assert.equal(r.g("show", `${f.head}:c.txt`), "one");
    assert.equal(fs.existsSync(path.join(r.dir, "artifacts", "merge-train", "screen-wt")), false, "the worktree is removed");
    // the build reads the screen's verdicts back and folds the very same train with no PR code
    const again = foldCars({ base: r.base, cars, cwd: r.dir, env, accept: screenAccept(readScreen(JSON.stringify({ tip: r.base, cars: out }))) });
    assert.equal(again.head, f.head);
  } finally { r.rm(); }
});

test("screenFold: a spent time budget leaves the rest unscreened, never green", () => {
  let t = 0;
  const sf = screenFold({ tip: sha("a"), cwd: ROOT, check: () => assert.fail("no check past the budget"), now: () => (t += 1000), budgetMs: 500 });
  assert.deepEqual(sf.accept({ car: { pr: 1, head: sha("b") }, tree: sha("c") }), { ok: false, why: "not screened (screen time budget spent)" });
});

test("main --build --screen-file: a missing or invalid screen opens no train; a skip waits", async () => {
  const dir = scratch("merge-train-screen-");
  try {
    const writes = [];
    const request = (p, o) => { if (o?.method) { writes.push(p); return { json: {} }; } if (p.startsWith("pulls?state=open")) return { json: [] }; return { error: `unexpected ${p}` }; };
    const logs = [];
    assert.equal(await main(["--build", "--screen-file", path.join(dir, "none.json")], { request, log: (l) => logs.push(l) }), 1);
    assert.equal(logs.at(-1), `= merge-train error — no valid screen verdict at ${path.join(dir, "none.json")} (the train-screen job failed?): no train opened`);
    fs.writeFileSync(path.join(dir, "skip.json"), JSON.stringify({ skip: "train #9 is open" }));
    assert.equal(await main(["--build", "--screen-file", path.join(dir, "skip.json")], { request, log: (l) => logs.push(l) }), 0);
    assert.equal(logs.at(-1), "= merge-train idle — the screen skipped (train #9 is open); the next run screens and builds");
    assert.deepEqual(writes, []);
    // --screen while a train is open writes a skip and measures nothing
    const open = (p) => (p.startsWith("pulls?state=open") ? { json: [{ number: 9, head: { ref: `${TRAIN_PREFIX}x` } }] } : { error: `unexpected ${p}` });
    const code = await screenMain({ out: path.join(dir, "s.json"), request: open, log: () => {}, check: () => assert.fail("no screen while a train is open"), gen: () => assert.fail("no gen") });
    assert.equal(code, 0);
    assert.deepEqual(readScreen(fs.readFileSync(path.join(dir, "s.json"), "utf8")), { tip: "", skip: "train #9 is open", cars: [] });
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

// ---- #6528: orphans board, trains are the default lane, stale line-count fragments are re-snapped on the fold ----

test("#6528: a green, unarmed land PR with no land run in flight is an orphan and boards (fails on the pre-fix 'arms alone' skip)", () => {
  const landing = [pull(44), pull(51, { auto_merge: { merge_method: "merge" } }), pull(52), pull(53)];
  const gate = (p) => (p.number === 53 ? "pending" : "success");
  const { solo, orphans } = soloLane(landing, { gate, runs: new Map([[52, 777]]) });
  assert.deepEqual([...orphans], [44], "#6444: gate success, auto_merge null, no land run = orphan");
  assert.deepEqual([...solo], [[51, "armed: auto-merge is on (it lands alone)"], [52, "its own gate passed and land run 777 is still in flight (it may arm alone)"]]);
  const r = carCandidates(landing, { solo });
  assert.deepEqual(r.cars.map((c) => c.pr), [53, 44], "oldest first: the orphan and the gate-pending PR both ride; nothing reads 'arms alone'");
  assert.deepEqual(r.skipped, [...solo].map(([pr, why]) => ({ pr, why })), "only the armed and the mid-arm PR are left out");
});

test("#6528: landRunsInFlight names a PR's queued/running land runs, never a deploy-branch run or the builder's own", () => {
  const pages = [{ workflow_runs: [
    { id: 1, status: "in_progress", pull_requests: [{ number: 6527 }], display_title: "Gardener carve 7" },
    { id: 2, status: "queued", pull_requests: [], display_title: "Land retry pr=6514 head=257abdec attempt=1" },
    { id: 3, status: "completed", pull_requests: [{ number: 6444 }], display_title: "x" },
    { id: 4, status: "in_progress", pull_requests: [], display_title: "Land" },
    { id: 5, status: "waiting", pull_requests: [{ number: 6600 }], display_title: "y" },
  ] }];
  assert.deepEqual([...landRunsInFlight(pages, { selfRun: "5" })], [[6527, 1], [6514, 2]]);
  // PR #6561 review: a workflow_run re-gate after a PR's CI names no PR and has no title; its head names it.
  const heads = [pull(61), pull(62), pull(63)];
  const wr = [{ workflow_runs: [
    { id: 8, status: "in_progress", pull_requests: [], display_title: "", head_sha: sha("1"), head_branch: "claude/other" },
    { id: 9, status: "queued", pull_requests: [], display_title: "", head_sha: sha("f"), head_branch: "claude/x-62" },
    { id: 10, status: "queued", pull_requests: [], display_title: "", head_sha: sha("e"), head_branch: DEPLOY },
  ] }];
  assert.deepEqual([...landRunsInFlight(wr, { heads })], [[61, 8], [62, 9]], "matched by head sha or PR branch; a deploy-branch run names none");
  assert.deepEqual([...soloLane(heads, { gate: () => "success", runs: landRunsInFlight(wr, { heads }) }).orphans], [63]);
});

test("PR #6561 review: planTrain reads every page of in-flight land runs and refuses a list too long to judge", async () => {
  const { planTrain, LAND_RUN_PAGES } = await import("../../tools/ci/merge-train.mjs");
  const seen = [];
  const full = { workflow_runs: Array.from({ length: 100 }, (_, i) => ({ id: i, status: "queued", pull_requests: [] })) };
  const request = (p) => {
    if (p.startsWith("pulls?")) return { json: [] };
    if (p.startsWith("actions/workflows/land.yml/runs")) { seen.push(p); return { json: full }; }
    return { json: [] };
  };
  const r = await planTrain({ request, cwd: ROOT });
  assert.deepEqual(r, { error: `land runs (queued): more than ${LAND_RUN_PAGES * 100}, refusing to judge orphans on a partial list` });
  assert.equal(seen.length, LAND_RUN_PAGES);
});

test("#6528: SCREEN_BUDGET_MS fits a TRAIN_MAX screen at the measured ~70 s a car (653 s for 9 cars, 2026-11-25 01:37Z)", () => {
  assert.ok(SCREEN_BUDGET_MS >= TRAIN_MAX * 70_000, `${SCREEN_BUDGET_MS} ms < ${TRAIN_MAX} cars × 70 s`);
  const yml = fs.readFileSync(path.join(ROOT, ".github/workflows/land.yml"), "utf8");
  const job = yml.slice(yml.indexOf("  train-screen:"), yml.indexOf("  train:\n"));
  const minutes = Number(/timeout-minutes: (\d+)/.exec(job)?.[1]);
  assert.ok(minutes * 60_000 >= SCREEN_BUDGET_MS + 5 * 60_000, `train-screen timeout ${minutes} min leaves no room for npm ci past the ${SCREEN_BUDGET_MS / 60_000}-min budget`);
});

test("#6528: resnapVerdict re-snaps only a moved base's slack; a genuine overage, someone else's, or a big one still fails", () => {
  const row = { file: "js/core/log.js", metric: "codeLines", slackMax: 219 };
  const no = (why) => ({ ok: false, why });
  const past = (over, own, slack, delta) => no(`over by ${over}, but the car grows it by ${own} since its merge base (slack ${slack} there) and its fragment carries ${delta}: growth past its own budget`);
  // #6522's shape: the car snapped a loose ceiling (slack 2) into a −2 delta; a sibling spent the slack.
  assert.deepEqual(resnapVerdict({ ...row, over: 2, own: 0, delta: -2, baseSlack: 2 }), { ok: true, why: "" });
  // grew 5 past a ceiling loose by 2 (delta +3), a sibling spent the 2: the car gets back its own 2, no more
  assert.deepEqual(resnapVerdict({ ...row, over: 2, own: 5, delta: 3, baseSlack: 2 }), { ok: true, why: "" });
  assert.deepEqual(resnapVerdict({ ...row, over: 3, own: 5, delta: 3, baseSlack: 2 }), past(3, 5, 2, 3));
  // a negative delta (its snap gave the base's slack away) is regained only up to its own growth: delta −8 + 10 = 2 = own
  assert.deepEqual(resnapVerdict({ ...row, over: 10, own: 2, delta: -8, baseSlack: 10 }), { ok: true, why: "" });
  assert.deepEqual(resnapVerdict({ ...row, over: 11, own: 2, delta: -8, baseSlack: 12 }), past(11, 2, 12, -8));
  // over its own ceiling at its head (own − delta 3 > slack 2): never laundered
  assert.deepEqual(resnapVerdict({ ...row, over: 3, own: 3, delta: 0, baseSlack: 2 }), past(3, 3, 2, 0));
  // a row the car did not grow, or a fold already over before it: someone else's overage
  assert.deepEqual(resnapVerdict({ ...row, over: 1, own: 0, delta: 0, baseSlack: 5 }), past(1, 0, 5, 0));
  assert.deepEqual(resnapVerdict({ ...row, over: 1, parentOver: 1, own: 4, delta: 0, baseSlack: 5 }), no("the fold was already over by 1 before this car: not its overage"));
  // the commit hook's own limits stay: past 40 lines, a slack-0 entry, a non-line metric, an unmeasurable growth
  assert.deepEqual(resnapVerdict({ ...row, over: 41, own: 100, delta: 0, baseSlack: 100 }), no("past the 40-line auto-raise"));
  assert.deepEqual(resnapVerdict({ ...row, slackMax: 0, over: 1, own: 1, delta: 0, baseSlack: 1 }), no("its entry carries slack 0 (exact) — never auto-raised"));
  assert.deepEqual(resnapVerdict({ ...row, metric: "gMembers", over: 1, own: 1, delta: 0, baseSlack: 1 }), no("gMembers is not a line count — never auto-raised"));
  assert.deepEqual(resnapVerdict({ ...row, over: 1, own: null, delta: 0, baseSlack: 1 }), no("its own growth since its merge base is unmeasurable"));
});

/** The fixture fragment of branch `y` (joined, so docs-integrity does not read it as a repo path). */
const Y_FRAG = ["tests/data/ratchets.d", "y.json"].join("/");
/** A repo whose ratchets.json holds g.js lines at 12 while g.js has 10 (slack 2). */
function ratchetRepo() {
  const dir = scratch("merge-train-rs-");
  const g = (...a) => { const r = spawnSync("git", a, { cwd: dir, encoding: "utf8", env: { ...process.env, GIT_AUTHOR_NAME: "t", GIT_AUTHOR_EMAIL: "t@t", GIT_COMMITTER_NAME: "t", GIT_COMMITTER_EMAIL: "t@t" } }); assert.equal(r.status, 0, r.stderr); return r.stdout.trim(); };
  const write = (f, s) => { fs.mkdirSync(path.dirname(path.join(dir, f)), { recursive: true }); fs.writeFileSync(path.join(dir, f), s); };
  const lines = (n, tag = "l") => Array.from({ length: n }, (_, i) => `${tag}${i}`).join("\n");
  g("init", "-q", "-b", "main");
  write("tests/data/ratchets.json", '{\n  "files": {\n    "g.js": {\n      "lines": 12\n    }\n  },\n  "tree": {}\n}\n');
  write("g.js", lines(10)); g("add", "."); g("commit", "-qm", "base");
  const base = g("rev-parse", "HEAD");
  const branch = (name, files) => { g("switch", "-qc", name, base); for (const [f, s] of Object.entries(files)) write(f, s); g("add", "-A"); g("commit", "-qm", name); return g("rev-parse", "HEAD"); };
  const body = (pre, post) => [pre, lines(10), post].filter(Boolean).join("\n");
  // X: +2 lines at the top, inside the slack (no fragment)
  const x = branch("x", { "g.js": body("x0\nx1", "") });
  // Y: edits the last line (no growth) and its commit hook snapped the loose ceiling: lines −2 (#6522's shape)
  const y = branch("y", { "g.js": lines(10).replace("l9", "Y9"), [Y_FRAG]: '{\n  "files": {\n    "g.js": {\n      "lines": -2\n    }\n  }\n}\n' });
  // W: +3 lines at the bottom with no fragment: over its OWN ceiling by 1 (13 > 12)
  const w = branch("w", { "g.js": body("", "w0\nw1\nw2") });
  g("switch", "-q", "main");
  return { dir, g, base, x, y, w, rm: () => fs.rmSync(dir, { recursive: true, force: true }) };
}

test("#6528: the fold re-snaps a fragment that is stale only because the base moved, and verifyTrain proves the re-snap", () => {
  const r = ratchetRepo();
  try {
    const cars = [{ pr: 1, head: r.x, ref: "x" }, { pr: 2, head: r.y, ref: "y" }];
    const f = foldCars({ base: r.base, cars, cwd: r.dir });
    assert.deepEqual(f.dropped, []);
    assert.deepEqual(f.cars.map((c) => [c.pr, c.resnapped || null]), [[1, null], [2, [{ file: "g.js", metric: "lines", over: 2 }]]]);
    // −2 + 2 nets to zero: the fragment is gone and the fold's g.js (12 lines) sits at ratchets.json's 12
    assert.equal(spawnSync("git", ["cat-file", "-e", `${f.head}:${Y_FRAG}`], { cwd: r.dir }).status, 128);
    assert.equal(r.g("show", `${f.head}:g.js`).split("\n").length, 12);
    assert.equal(r.g("log", "-1", "--format=%B", f.head).split("\n").at(-1), "ratchets re-snapped on the fold: g.js lines +2");
    assert.equal(verifyTrain({ base: r.base, head: f.head, cars, tip: r.base, cwd: r.dir }).ok, true, "the gate re-derives the re-snap");
    assert.equal(trainBody({ base: r.base, cars: f.cars }).split("\n").find((l) => l.startsWith("- [x] #2 ")), `- [x] #2 \`${r.y.slice(0, 12)}\` merged clean (ratchets re-snapped on the fold: g.js lines +2)`);
    // the plain merge (no re-snap) is NOT the fold the gate accepts: a train cannot skip or forge the re-snap
    const plain = r.g("merge-tree", "--write-tree", "--no-messages", f.head + "^1", r.y).split("\n")[0];
    assert.notEqual(plain, r.g("rev-parse", `${f.head}^{tree}`));
  } finally { r.rm(); }
});

test("#6528: a genuine overage (the car grows past its own budget) is not re-snapped: the tree stays the clean merge", () => {
  const r = ratchetRepo();
  try {
    const parent = foldCars({ base: r.base, cars: [{ pr: 1, head: r.x, ref: "x" }], cwd: r.dir }).head;
    const tree = r.g("merge-tree", "--write-tree", "--no-messages", parent, r.w).split("\n")[0];
    const git = (args, extra = {}) => spawnSync("git", args, { cwd: r.dir, encoding: "utf8", ...extra });
    const rs = resnapTree({ tree, parent, car: { pr: 3, head: r.w, ref: "w" }, base: r.base, git });
    assert.equal(rs.tree, tree, "no ceiling raised for an overage the car itself made");
    assert.deepEqual(rs.resnapped, []);
    assert.deepEqual(rs.refused, [{ file: "g.js", metric: "lines", over: 3, why: "over by 3, but the car grows it by 3 since its merge base (slack 2 there) and its fragment carries 0: growth past its own budget" }]);
    // and a car that never touched g.js is not handed someone else's overage either
    const none = resnapTree({ tree, parent, car: { pr: 9, head: r.base, ref: "z" }, base: r.base, git });
    assert.deepEqual([none.tree, none.resnapped, none.refused], [tree, [], []]);
  } finally { r.rm(); }
});
