// Guards tools/ci/remote-group.mjs and .github/workflows/browser-group.yml: one
// browser group on GitHub's runners, sharded, instead of 30-45 min of local
// SwiftShader. Pure parts only — no network, no dispatch.
// Run: node --test tests/unit/remote-group.test.mjs   (npm run test:tooling-fast)
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { browserGroups, planMatrix, parseWorkers, resolveWorkers, pickRun, failLines, groupVerdict, SHARD_CHOICES, WORKFLOW, USAGE } from "../../tools/ci/remote-group.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const SCRIPTS = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8")).scripts;
const YML = fs.readFileSync(path.join(ROOT, ".github/workflows", WORKFLOW), "utf8");

test("the browser groups are package.json's Playwright scripts, and only those", () => {
  const g = browserGroups(SCRIPTS);
  for (const name of ["ui", "tiny", "hooks", "input"]) assert.ok(g.includes(name), `test:${name} is a browser group`);
  assert.ok(!g.includes("tooling-fast"), "a node-only group is not dispatchable");
  assert.deepEqual(browserGroups({ "test:a": "node tools/ci/run-playwright.mjs x", "test:b": "node --test y", lint: "run-playwright.mjs" }), ["a"]);
});

test("plan: a real group and a listed shard count give the matrix; anything else is refused", () => {
  assert.deepEqual(planMatrix("ui", "4", SCRIPTS).matrix, [1, 2, 3, 4]);
  assert.deepEqual(planMatrix("ui", undefined, SCRIPTS).matrix, [1, 2, 3, 4], "4 by default");
  assert.deepEqual(planMatrix(" ui ", 2, SCRIPTS).matrix, [1, 2]);
  // The input is text from whoever dispatched: never a shell fragment, never an unknown script.
  for (const bad of ["ui; rm -rf /", "$(id)", "UI", "", null, "../ui", "tooling-fast", "nope"])
    assert.ok(planMatrix(bad, 4, SCRIPTS).error, JSON.stringify(bad));
  for (const bad of [0, 3, 5, 16, "x"]) assert.ok(planMatrix("ui", bad, SCRIPTS).error, `shards ${bad}`);
});

test("CLI: bare invoke / --help print usage — never 'not a group name: undefined'", () => {
  assert.match(USAGE, /^usage: node tools\/ci\/remote-group\.mjs <group>/);
  const run = (...args) => spawnSync(process.execPath, ["tools/ci/remote-group.mjs", ...args], {
    cwd: ROOT, encoding: "utf8",
  });
  const bare = run();
  assert.equal(bare.status, 3);
  assert.match(bare.stderr, /usage: node tools\/ci\/remote-group\.mjs <group>/);
  assert.doesNotMatch(bare.stderr + bare.stdout, /not a group name: undefined/);
  const help = run("--help");
  assert.equal(help.status, 0);
  assert.match(help.stdout, /usage: node tools\/ci\/remote-group\.mjs <group>/);
});

test("the workflow offers exactly the shard counts the planner accepts, and never interpolates an input into a shell line", () => {
  const opts = YML.match(/options: \[("\d+"(?:, "\d+")*)\]/);
  assert.ok(opts, "shards is a choice input");
  assert.deepEqual(JSON.parse("[" + opts[1] + "]").map(Number), SHARD_CHOICES);
  // Every `run:` line reads inputs through env, never `${{ inputs.… }}` in the command itself.
  const runs = YML.split("\n").filter((l) => /^\s+run: /.test(l));
  assert.ok(runs.length >= 3);
  for (const l of runs) assert.ok(!/\$\{\{\s*(inputs|github\.event)\./.test(l), `input interpolated into a shell line: ${l.trim()}`);
  assert.match(YML, /run: node tools\/ci\/remote-group\.mjs --plan/, "the group is validated before any runner is spent");
  assert.match(YML, /^permissions:\n  contents: read/m, "read-only token");
  assert.match(YML, /cancel-in-progress: true/, "a re-dispatch supersedes the old run");
  // The CLI finds a 204 dispatch's run by its name.
  assert.match(YML, /^run-name: "browser group \$\{\{ inputs\.group \}\} on /m);
});

test("workers: empty is left empty for parseWorkers; resolveWorkers fills the GL+group default", () => {
  assert.deepEqual(parseWorkers(""), { workers: "" });
  assert.deepEqual(parseWorkers(undefined), { workers: "" });
  assert.deepEqual(parseWorkers("1"), { workers: "1" });
  for (const bad of ["0", "9", "1.5", "x", "1; id", "$(id)"]) assert.ok(parseWorkers(bad).error, JSON.stringify(bad));
  assert.deepEqual(resolveWorkers("render", "llvmpipe", "", SCRIPTS), { workers: "1" });
  assert.deepEqual(resolveWorkers("physics-core", "llvmpipe", "", SCRIPTS), { workers: "2" });
  assert.deepEqual(resolveWorkers("physics-core", "llvmpipe", "3", SCRIPTS), { workers: "3" });
  assert.match(YML, /^\s+workers:\n/m, "the workflow takes a workers input");
  // Validated before any runner is spent; plan emits workers= for the shard jobs.
  assert.match(YML, /WORKERS: \$\{\{ inputs\.workers \}\}\n\s+GL: \$\{\{ inputs\.gl \}\}\n\s+run: node tools\/ci\/remote-group\.mjs --plan/);
  assert.match(YML, /workers: \$\{\{ steps\.plan\.outputs\.workers \}\}/);
  assert.match(YML, /\$\{WORKERS:\+"--workers=\$WORKERS"\}/);
  // Shard steps consume the plan output (not a hard-coded 1). APEX_WORKERS
  // also reads the same output — match the WORKERS: key only.
  assert.equal((YML.match(/^\s+WORKERS: \$\{\{ needs\.plan\.outputs\.workers \}\}/gm) || []).length, 2);
});

test("pickRun: the newest dispatch of THIS group on THIS branch since the dispatch", () => {
  const t0 = Date.parse("2026-09-30T12:00:00Z");
  const run = (id, over) => Object.assign({ id, event: "workflow_dispatch", head_branch: "b", created_at: "2026-09-30T12:00:05Z", display_title: "browser group ui on b (4 shards, llvmpipe)" }, over);
  const runs = [
    run(1, { created_at: "2026-09-30T11:40:00Z" }),                       // an older dispatch
    run(2, { display_title: "browser group input on b (4 shards, llvmpipe)" }),   // another group
    run(3, { head_branch: "other" }),                                      // another branch
    run(4, { event: "push" }),
    run(5), run(6, { created_at: "2026-09-30T12:00:09Z" }),
  ];
  assert.equal(pickRun(runs, { branch: "b", group: "ui", sinceMs: t0 }).id, 6);
  assert.equal(pickRun(runs, { branch: "b", group: "u", sinceMs: t0 }), null, "a prefix of a group is not that group");
  assert.equal(pickRun([], { branch: "b", group: "ui", sinceMs: t0 }), null);
  assert.equal(pickRun([run(7), run(8)], { branch: "b", group: "ui", sinceMs: t0 }).id, 8, "a same-second tie: the higher id");
  assert.equal(pickRun([run(8), run(7)], { branch: "b", group: "ui", sinceMs: t0 }).id, 8, "…in either listing order");
});

test("failLines: the reporter's failures from a shard log, Actions timestamps stripped", () => {
  const log = [
    "2026-09-30T11:33:03.2Z [11:33:03] + pass   12/42 specs/demo › case › ok (5.1s)",
    "2026-09-30T11:33:04.2Z [11:33:04] x FAIL   13/42 specs/demo › case › broken (8.0s)",
    "2026-09-30T11:35:25.9Z [11:35:25] = FAILURES 1:",
    "2026-09-30T11:35:25.9Z [11:35:25] = run failed  (42/42 done, 1 failed)",
  ].join("\n");
  assert.deepEqual(failLines(log), [
    "[11:33:04] x FAIL   13/42 specs/demo › case › broken (8.0s)",
    "[11:35:25] = FAILURES 1:",
    "[11:35:25] = run failed  (42/42 done, 1 failed)",
  ]);
  assert.deepEqual(failLines("all green\n= run passed"), []);
  assert.equal(failLines(Array(50).fill("x FAIL t").join("\n"), 8).length, 8);
});

test("groupVerdict: a red shard is a red even when the run is still going; cancelled is not green", () => {
  const job = (name, status, conclusion) => ({ name, status, conclusion });
  const plan = job("Plan shards", "completed", "success");
  const live = { status: "in_progress" };
  assert.equal(groupVerdict(live, [plan, job("ui (1/4)", "completed", "success"), job("ui (2/4)", "in_progress", null)]).done, false);
  assert.match(groupVerdict(live, [plan, job("ui (1/4)", "completed", "success"), job("ui (2/4)", "in_progress", null)]).line, /1\/2 shards done/);
  assert.equal(groupVerdict({ status: "completed", conclusion: "failure" }, [plan, job("ui (1/4)", "completed", "failure")]).code, 1);
  assert.equal(groupVerdict({ status: "completed", conclusion: "failure" }, [job("Plan shards", "completed", "failure")]).code, 1, "a refused plan is a red");
  assert.equal(groupVerdict({ status: "completed", conclusion: "cancelled" }, [plan]).code, 2);
  assert.equal(groupVerdict({ status: "completed", conclusion: "success" }, [plan, job("ui (1/4)", "completed", "success")]).code, 0);
});
