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
import { browserGroups, planMatrix, parseWorkers, resolveWorkers, pickRun, failLines, groupVerdict, SHARD_CHOICES, WORKFLOW, USAGE,
  groupFiles, expectedSec, shardPlan, runShardArgs, liveRun, MAX_PIECES, SPEC_RE } from "../../tools/ci/remote-group.mjs";

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

test("the workflow reads its matrix from the plan input, has no plan job, and never interpolates an input into a shell line", () => {
  assert.doesNotMatch(YML, /^\s+plan:\n\s+name: Plan shards/m, "the plan job is gone: it was a second runner-queue wait in series");
  assert.match(YML, /include: \$\{\{ fromJSON\(inputs\.plan\)\.matrix \}\}/, "the matrix IS the plan");
  const def = YML.match(/^\s+plan:\n(?:.*\n){2,4}?\s+default: '(\{.*\})'/m);
  assert.ok(def, "the plan input has a JSON default for a hand dispatch");
  const d = JSON.parse(def[1]);
  assert.deepEqual(d, { matrix: [1, 2, 3, 4].map((shard) => ({ shard, total: 4 })) }, "…4 count shards, no lists");
  assert.ok(SHARD_CHOICES.includes(d.matrix.length));
  // Every `run:` line reads inputs through env, never `${{ inputs.… }}` in the command itself.
  const runs = YML.split("\n").filter((l) => /^\s+run: /.test(l));
  assert.ok(runs.length >= 2);
  for (const l of runs) assert.ok(!/\$\{\{\s*(inputs|github\.event)\./.test(l), `input interpolated into a shell line: ${l.trim()}`);
  assert.equal((YML.match(/run: node tools\/ci\/remote-group\.mjs --run-shard$/gm) || []).length, 2, "both GL steps run the one validated entry point");
  for (const k of ["GROUP", "PLAN", "SHARD", "TOTAL", "WORKERS", "GL"])
    assert.equal((YML.match(new RegExp(`^\\s+${k}: `, "gm")) || []).length, 2, `${k} reaches both shard steps through env`);
  assert.match(YML, /^permissions:\n  contents: read/m, "read-only token");
  assert.match(YML, /cancel-in-progress: true/, "a re-dispatch supersedes the old run");
  // The CLI finds a 204 dispatch's run by its name.
  assert.match(YML, /^run-name: "browser group \$\{\{ inputs\.group \}\} on /m);
});

const FAKE_SCRIPTS = {
  "test:plain": "node tools/ci/run-playwright.mjs tests/specs/render-boot.spec.js tests/specs/logging.spec.js tests/specs/boot-guard.spec.js tests/specs/hud-layout.spec.js",
  "test:proj": "node tools/ci/run-playwright.mjs --project=render --workers=4",
  "test:env": "APEX_X=1 node tools/ci/run-playwright.mjs tests/specs/render-boot.spec.js",
  "test:node": "node --test tests/unit/remote-group.test.mjs",
};
// A timings db: whole-run walls (s) on llvmpipe, MIN_SAMPLES of them each; the
// "fat" one is 600 s. The fixture names REAL spec files (docs-integrity: a
// source file may only name paths that exist) but its own numbers.
const walls = (sec, tests = 4) => ({ s: [1, 2, 3].map((i) => [`2026-10-0${i}T00:00:00Z`, "llvmpipe", sec, tests]) });
const FAKE_DB = { specs: { "tests/specs/render-boot.spec.js": walls(60), "tests/specs/logging.spec.js": walls(90), "tests/specs/boot-guard.spec.js": walls(30),
  "tests/specs/hud-layout.spec.js": walls(600, 20) } };

test("groupFiles: a plain file list (globs expanded) is packable; --project, an env prefix or a node group is not", () => {
  assert.deepEqual(groupFiles("plain", FAKE_SCRIPTS), ["tests/specs/boot-guard.spec.js", "tests/specs/hud-layout.spec.js", "tests/specs/logging.spec.js", "tests/specs/render-boot.spec.js"], "sorted, as specsOf returns them");
  assert.equal(groupFiles("proj", FAKE_SCRIPTS), null);
  assert.equal(groupFiles("env", FAKE_SCRIPTS), null);
  assert.equal(groupFiles("node", FAKE_SCRIPTS), null);
  assert.equal(groupFiles("nope", FAKE_SCRIPTS), null);
  // The real scripts: globbed groups expand to files that exist; render/xr/shimmer stay count-sharded.
  for (const g of ["circuits", "car"]) {
    const files = groupFiles(g, SCRIPTS);
    assert.ok(files && files.length >= 4, `${g} expands its glob`);
    for (const f of files) { assert.match(f, SPEC_RE); assert.ok(fs.existsSync(path.join(ROOT, f)), f); }
  }
  for (const g of ["render", "xr", "shimmer"]) assert.equal(groupFiles(g, SCRIPTS), null, `${g} keeps the count shard`);
});

test("expectedSec: the measured whole-run wall when a CI bucket has enough samples, else declared tests × rate", () => {
  assert.equal(expectedSec("tests/specs/hud-layout.spec.js", FAKE_DB), 600);
  assert.equal(expectedSec("tests/specs/render-boot.spec.js", FAKE_DB), 60);
  const cold = expectedSec("tests/specs/smoke.spec.js", { specs: {} });
  assert.ok(Number.isFinite(cold) && cold > 0, "a spec with no samples still gets a positive estimate");
});

test("shardPlan: LPT by measured time; a fat spec is cut into native --shard pieces that avoid sharing a runner; never more shards than units", () => {
  const p = shardPlan("plain", "4", FAKE_SCRIPTS, FAKE_DB);
  assert.equal(p.mode, "time");
  assert.deepEqual(p.matrix, [1, 2, 3, 4].map((shard) => ({ shard, total: 4 })));
  // share = 780/4 = 195; fat (600) → ceil(600/195) = 4 pieces of 150; each piece on its own shard.
  const pieces = p.shards.flat().filter((u) => typeof u !== "string");
  assert.equal(pieces.length, 4);
  assert.deepEqual(pieces.map((u) => u.shard).sort(), ["1/4", "2/4", "3/4", "4/4"]);
  for (const list of p.shards) assert.equal(list.filter((u) => typeof u !== "string").length, 1, "one piece per shard");
  assert.deepEqual(p.shards.flat().filter((u) => typeof u === "string").sort(), ["tests/specs/boot-guard.spec.js", "tests/specs/logging.spec.js", "tests/specs/render-boot.spec.js"], "every plain spec exactly once");
  assert.ok(Math.max(...p.load) - Math.min(...p.load) <= 90, `balanced: ${p.load}`);
  // Deterministic: the same inputs give the same plan (every reader must agree).
  assert.deepEqual(shardPlan("plain", "4", FAKE_SCRIPTS, FAKE_DB), p);
  // One shard: no split, one list.
  const one = shardPlan("plain", "1", FAKE_SCRIPTS, FAKE_DB);
  assert.deepEqual(one.matrix, [{ shard: 1, total: 1 }]);
  assert.equal(one.shards[0].length, 4);
  // Fewer units than shards: the matrix shrinks to the units (a 60 s spec is
  // not worth cutting into pieces under MIN_PIECE_SEC just to fill runners).
  const few = shardPlan("plain", "8", { "test:plain": "node tools/ci/run-playwright.mjs tests/specs/render-boot.spec.js tests/specs/boot-guard.spec.js" }, FAKE_DB);
  assert.equal(few.matrix.length, 2);
  assert.ok(few.shards.flat().every((u) => typeof u === "string"), "no pieces of a short spec");
  // Count mode for a group that is not a plain file list; refusals pass through.
  assert.equal(shardPlan("proj", "4", FAKE_SCRIPTS, FAKE_DB).mode, "count");
  assert.deepEqual(shardPlan("proj", "2", FAKE_SCRIPTS, FAKE_DB).matrix, [{ shard: 1, total: 2 }, { shard: 2, total: 2 }]);
  assert.ok(shardPlan("nope", "4", FAKE_SCRIPTS, FAKE_DB).error);
  assert.ok(shardPlan("plain", "3", FAKE_SCRIPTS, FAKE_DB).error, "3 is not a shard choice");
  // A real group: the plan covers every file of the group exactly once (pieces count as their file).
  const real = shardPlan("gfx", "4", SCRIPTS);
  const files = real.shards.flat().map((u) => (typeof u === "string" ? u : u.file));
  assert.deepEqual([...new Set(files)].sort(), groupFiles("gfx", SCRIPTS));
  for (const u of real.shards.flat()) if (typeof u !== "string") assert.ok(Number(u.shard.split("/")[1]) <= MAX_PIECES);
});

test("runShardArgs: the plan is untrusted text — every unit is checked against the group's script; count plans use --shard", () => {
  const plan = JSON.stringify(shardPlan("plain", "4", FAKE_SCRIPTS, FAKE_DB));
  const r = runShardArgs({ group: "plain", plan, shard: "2", total: "4", workers: "1" }, FAKE_SCRIPTS);
  assert.equal(r.mode, "time");
  assert.ok(r.runs.length >= 1 && r.runs.length <= 2);
  for (const u of r.runs) {
    assert.equal(u.cmd, "node");
    assert.equal(u.args[0], "tools/ci/run-playwright.mjs");
    assert.ok(u.args.includes("--timeout=900000") && u.args.includes("--workers=1"));
    for (const a of u.args.slice(1)) assert.ok(a.startsWith("--") || FAKE_SCRIPTS["test:plain"].includes(a), a);
  }
  const piece = r.runs.find((u) => u.args.some((a) => /^--shard=\d\/4$/.test(a)));
  assert.ok(piece, "the fat spec's piece runs as file --shard=j/k");
  assert.equal(piece.args.filter((a) => /\.spec\.js$/.test(a)).length, 1, "…alone");
  // Count mode: no plan lists → npm run test:<group> -- --shard=i/n (the group's own flags ride along).
  const c = runShardArgs({ group: "proj", plan: '{"matrix":[{"shard":1,"total":2},{"shard":2,"total":2}]}', shard: "2", total: "2", workers: "" }, FAKE_SCRIPTS);
  assert.deepEqual(c, { runs: [{ cmd: "npm", args: ["run", "test:proj", "--", "--timeout=900000", "--shard=2/2"] }], mode: "count" });
  assert.equal(runShardArgs({ group: "plain", plan: "", shard: "1", total: "4", workers: "" }, FAKE_SCRIPTS).mode, "count", "an empty plan is a count plan");
  // Refusals: a path outside the group, a shell-ish string, a piece beyond MAX_PIECES, a mismatched matrix, a bad shard, an unknown group, broken JSON.
  const bad = (shards, extra = {}) => runShardArgs({ group: "plain", plan: JSON.stringify({ matrix: [], shards }), shard: "1", total: String(shards.length), workers: "", ...extra }, FAKE_SCRIPTS);
  assert.ok(bad([["tests/specs/smoke.spec.js"]]).error, "a real spec, but outside the group");
  assert.ok(bad([["tests/specs/render-boot.spec.js; rm -rf /"]]).error);
  assert.ok(bad([["$(id)"]]).error);
  assert.ok(bad([[{ file: "tests/specs/hud-layout.spec.js", shard: "1/99" }]]).error, "too many pieces");
  assert.ok(bad([[{ file: "tests/specs/hud-layout.spec.js", shard: "5/4" }]]).error, "piece index past its count");
  assert.ok(bad([[{ file: "../x.spec.js", shard: "1/2" }]]).error);
  assert.ok(bad([["tests/specs/render-boot.spec.js"], ["tests/specs/logging.spec.js"]], { total: "4" }).error, "plan/matrix size mismatch");
  assert.ok(runShardArgs({ group: "plain", plan: "{nope", shard: "1", total: "1", workers: "" }, FAKE_SCRIPTS).error);
  assert.ok(runShardArgs({ group: "nope", plan: "", shard: "1", total: "1", workers: "" }, FAKE_SCRIPTS).error);
  assert.ok(runShardArgs({ group: "plain", plan: "", shard: "0", total: "4", workers: "" }, FAKE_SCRIPTS).error);
  assert.ok(runShardArgs({ group: "plain", plan: "", shard: "1", total: "4", workers: "1; id" }, FAKE_SCRIPTS).error);
  assert.ok(runShardArgs({ group: "proj", plan: JSON.stringify({ matrix: [], shards: [[]] }), shard: "1", total: "1", workers: "" }, FAKE_SCRIPTS).error, "a packed plan cannot drive a --project group");
  assert.deepEqual(bad([[]]), { empty: true, mode: "time" }, "an empty list is a no-op shard, not a red");
});

test("liveRun: a live run of THIS group on THIS sha is reused, else the newest green one; another sha, group or branch is not", () => {
  const run = (id, over) => Object.assign({ id, event: "workflow_dispatch", head_branch: "b", head_sha: "abc", status: "completed", conclusion: "success",
    created_at: `2026-10-14T12:00:0${id}Z`, display_title: "browser group ui on b (llvmpipe)" }, over);
  const runs = [run(1), run(2, { status: "in_progress", conclusion: null }), run(3, { head_sha: "def" }), run(4, { display_title: "browser group uix on b (llvmpipe)" }),
    run(5, { head_branch: "other" }), run(6, { conclusion: "failure" }), run(7, { event: "push" })];
  assert.deepEqual(liveRun(runs, { branch: "b", group: "ui", sha: "abc" }), { run: runs[1], kind: "live" });
  assert.deepEqual(liveRun(runs.filter((r) => r.id !== 2), { branch: "b", group: "ui", sha: "abc" }), { run: runs[0], kind: "green" }, "a red is not reused");
  assert.equal(liveRun(runs, { branch: "b", group: "ui", sha: "zzz" }), null, "a new sha dispatches");
  assert.equal(liveRun([], { branch: "b", group: "ui", sha: "abc" }), null);
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
  // Both shard steps hand the raw input to --run-shard through env; it resolves empty → the GL+group default.
  assert.equal((YML.match(/^\s+WORKERS: \$\{\{ inputs\.workers \}\}/gm) || []).length, 2);
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
