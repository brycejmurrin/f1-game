// validation-cli-sync-pr.test.mjs — bounded negative contracts: an invalid or uncovered
// request cannot report green. tools/ci/sync-pr.mjs: --plan reads cached refs only and never fetches, the failure path aborts a merge and says where the tree is, and the fast verify stages stop, time out and resume as named.
// Regrouped per tool out of validation-cli.test.mjs (#3043 T5-30), assertions unchanged.
// Run: node --test tests/unit/validation-cli-sync-pr.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { cachedPlan, returnTo, verifyStages, runStages, runStage, VERIFY_MODES } from "../../tools/ci/sync-pr.mjs";
import { alive as processAlive } from "../../tools/lib/process-tree.mjs";
import { cli, fixture } from "../helpers/validation-cli.mjs";

test("sync plan only reads cached refs, and does not invent conflict evidence", () => {
  const calls = [];
  const plan = cachedPlan("claude/demo", (args) => {
    calls.push(args);
    return { code: 0, out: args[0] === "rev-parse" ? "123456789abcdef" : args[0] === "log" ? "abc one" : "", err: "" };
  });
  assert.ok(calls.every((args) => ["rev-parse", "merge-base", "log"].includes(args[0])));
  assert.equal(plan.source, "cached-remote-refs");
  assert.equal(plan.conflictsChecked, false);
  assert.equal(plan.conflicts, null);
});

test("sync-pr's failure path aborts a merge in progress, checks the checkout, and says where the tree is", () => {
  // It logged "tree left on <sync branch>" and then ran an unchecked
  // `git checkout <startedOn>` — wrong when that worked, silent when it failed.
  const fake = (state) => {
    const calls = [];
    const g = (args) => {
      calls.push(args.join(" "));
      if (args[0] === "rev-parse" && args.includes("MERGE_HEAD")) return { code: state.merging ? 0 : 1, out: "", err: "" };
      if (args[0] === "merge" && args[1] === "--abort") { state.merging = false; return { code: 0, out: "", err: "" }; }
      if (args[0] === "checkout") {
        if (state.merging || state.refuse) return { code: 1, out: "", err: "error: you need to resolve your current index first" };
        state.on = args[1]; return { code: 0, out: "", err: "" };
      }
      if (args[0] === "branch") return { code: 0, out: state.on, err: "" };
      return { code: 0, out: "", err: "" };
    };
    return { g, calls };
  };
  const mid = { on: "sync-pr-x", merging: true };
  const a = fake(mid);
  const r1 = returnTo("claude/x", "sync-pr-x", a.g);
  assert.ok(a.calls.includes("merge --abort"), "a merge in progress is aborted before the checkout");
  assert.equal(r1.ok, true);
  assert.equal(r1.line, "working tree back on claude/x; the attempt is kept on branch sync-pr-x for inspection");
  const stuck = { on: "sync-pr-x", refuse: true };
  const r2 = returnTo("claude/x", "sync-pr-x", fake(stuck).g);
  assert.equal(r2.ok, false);
  assert.match(r2.line, /could NOT return to claude\/x .*the working tree is on sync-pr-x/);
});

test("sync --plan CLI never fetches or changes branches", (t) => {
  const dir = fixture(t), log = path.join(dir, "calls.jsonl"), fakeGit = path.join(dir, "git");
  fs.writeFileSync(fakeGit, `#!${process.execPath}\nimport fs from 'node:fs';
const args = process.argv.slice(2);
fs.appendFileSync(process.env.APEX_FAKE_GIT_LOG, JSON.stringify(args) + '\\n');
if (args[0] === 'rev-parse') console.log('123456789abcdef');
else if (args[0] === 'log') console.log('abc cached commit');
else if (args[0] !== 'merge-base') process.exit(90);
`, { mode: 0o755 });
  const result = cli("tools/ci/sync-pr.mjs", ["claude/demo", "--plan"], {
    PATH: dir + path.delimiter + process.env.PATH, APEX_FAKE_GIT_LOG: log,
  });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(JSON.parse(result.stdout).source, "cached-remote-refs");
  const calls = fs.readFileSync(log, "utf8").trim().split("\n").map(JSON.parse);
  assert.deepEqual(calls.map((args) => args[0]), ["rev-parse", "rev-parse", "merge-base", "log"]);
});

test("#2186: sync-pr's fast verify of a docs-only diff skips the VM suites, runs tooling-fast --jobs=3, and times every stage", () => {
  const suites = ["test:game-vm-a", "test:net-unit", "test:vm-page", "test:node-slow", "test:game-vm-b1", "test:game-vm-b2"];
  const fast = verifyStages({ verify: "fast", changed: ["docs/README.md"], circuits: [], suites });
  const names = fast.map((s) => s.name);
  assert.deepEqual(fast[0].args, ["tools/ci/tooling-fast.mjs", "--changed", "--jobs=3"], "fast = the branch's own diff only (#2186 follow-up)");
  assert.ok(!names.some((n) => /^test:game-vm-/.test(n)), names.join(" "));
  assert.ok(names.includes("test:net-unit"), "a cheap unscoped suite still runs");
  for (const st of fast) assert.ok(st.timeoutMs > 0 && st.timeoutMs <= 20 * 60e3, `${st.name} has a timeout inside the 30-min ceiling`);
  const full = verifyStages({ verify: "full", changed: ["docs/README.md"], circuits: ["spa"], suites });
  assert.deepEqual(full.map((s) => s.name), ["tooling-fast", ...suites, "verify-track:spa"], "full runs every suite");
  assert.deepEqual(full[0].args, ["tools/ci/tooling-fast.mjs", "--jobs=3"], "full runs the whole tooling-fast floor, no --changed");
  assert.deepEqual(verifyStages({ verify: "fast", changed: null, circuits: [], suites }).map((s) => s.name), ["tooling-fast", ...suites], "unknown diff runs every suite");
  assert.deepEqual(verifyStages({ verify: "none", changed: [], circuits: [], suites }), []);
  // mergeOnly (2026-11-10): a sync merge is verified for what the merge decided, not for the branch's whole diff.
  assert.deepEqual(verifyStages({ verify: "fast", changed: ["js/game.js"], circuits: ["spa", "monza"], suites, mergeOnly: [] }).map((s) => s.name), ["tooling-fast"], "a pure sync runs no node suite and no circuit");
  assert.deepEqual(verifyStages({ verify: "fast", changed: ["docs/README.md"], circuits: ["spa", "monza"], suites, mergeOnly: ["js/game.js", "js/circuits/scenery/spa.js"] }).map((s) => s.name),
    ["tooling-fast", ...suites, "verify-track:spa"], "an impure engine path brings the suites back, and only its own circuit");
  assert.deepEqual(verifyStages({ verify: "full", changed: [], circuits: ["spa"], suites, mergeOnly: [] }).map((s) => s.name), ["tooling-fast", ...suites, "verify-track:spa"], "full ignores the scope");
  assert.deepEqual(VERIFY_MODES, ["none", "fast", "full"]);
});

test("#2186: runStages stops at the first failure or timeout, names the stage, and resumes from it", () => {
  const stages = ["a", "b", "c"].map((name) => ({ name, cmd: "x", args: [], timeoutMs: 60e3 }));
  const ran = [];
  const r = runStages(stages, { run: (st) => { ran.push(st.name); return st.name === "b" ? 124 : 0; } });
  assert.deepEqual(ran, ["a", "b"]);
  assert.deepEqual({ ok: r.ok, failedAt: r.failedAt }, { ok: false, failedAt: "b" });
  assert.equal(r.error, "b timed out after 1 min");
  const again = [];
  assert.equal(runStages(stages, { from: "b", run: (st) => { again.push(st.name); return 0; } }).ok, true);
  assert.deepEqual(again, ["b", "c"], "--from skips the stages that passed");
  assert.equal(runStages(stages, { from: "zz", run: () => 0 }).error, "no stage named zz (stages: a, b, c)");
});

test("a stage timeout stops the stage with SIGTERM, so a runner that leads its own process groups can terminate them", () => {
  // The stage stands in for tooling-fast: it starts a detached grandchild and kills that group on SIGTERM.
  // SIGKILL (the old killSignal) never reaches the handler and leaves the grandchild running.
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "sync-stage-"));
  const pidFile = path.join(tmp, "grandchild.pid");
  const stage = path.join(tmp, "stage.cjs");
  fs.writeFileSync(stage, `const { spawn } = require("node:child_process"), fs = require("node:fs");
const gc = spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"], { detached: true, stdio: "ignore" });
fs.writeFileSync(${JSON.stringify(pidFile)}, String(gc.pid));
process.on("SIGTERM", () => {
  // Reap before exiting: PID 1 in a container may not reap an adopted zombie.
  // https://nodejs.org/api/child_process.html#event-exit
  gc.once("exit", () => process.exit(143));
  try { process.kill(-gc.pid, "SIGKILL"); } catch (_) { process.exit(143); }
});
setInterval(() => {}, 1000);`);
  let gcPid = 0;
  try {
    const code = runStage({ name: "t", cmd: process.execPath, args: [stage], timeoutMs: 1500 }, tmp);
    assert.equal(code, 124, "a timed-out stage reads as 124");
    gcPid = Number(fs.readFileSync(pidFile, "utf8"));
    assert.ok(gcPid > 0);
    // Container PID 1 may leave a killed grandchild as a zombie. Count only
    // a running process, as the project's process supervisors already do.
    const alive = () => processAlive(gcPid);
    const until = Date.now() + 3000;
    while (alive() && Date.now() < until) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 50);
    assert.equal(alive(), false, "the stage's own process groups were terminated, not left running");
  } finally {
    if (gcPid) try { process.kill(-gcPid, "SIGKILL"); } catch (_) { /* gone */ }
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});
