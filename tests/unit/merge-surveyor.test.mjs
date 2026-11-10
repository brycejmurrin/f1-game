// merge-surveyor — tools/track/merge-surveyor.mjs, the track-surveyor hand-back as one script
// (plan §4.6): --dry-run prints the four steps in order without running one; the worktree
// lookup reads `git worktree list --porcelain`; a bad id or missing argument is usage (exit 2).
//
// Run: node --test tests/unit/merge-surveyor.test.mjs   (< 1 s)
import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { plan, worktreeFor } from "../../tools/track/merge-surveyor.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const TOOL = path.join(ROOT, "tools/track/merge-surveyor.mjs");
const run = (...args) => spawnSync(process.execPath, [TOOL, ...args], { cwd: ROOT, encoding: "utf8" });

test("plan: scope → merge --no-ff → verify-track → worktree remove, in that order", () => {
  const steps = plan("monza", "abc1234", "agent-x/monza", "/w/monza");
  assert.deepEqual(steps.map((s) => s[0]), ["scope", "merge", "verify", "cleanup"]);
  assert.deepEqual(steps[0][1], ["node", "tools/track/surveyor-scope.mjs", "monza", "abc1234", "agent-x/monza"]);
  assert.deepEqual(steps[1][1], ["git", "merge", "--no-ff", "--no-edit", "agent-x/monza"]);
  assert.deepEqual(steps[2][1], ["node", "tools/track/verify-track.cjs", "monza"]);
  assert.deepEqual(steps[3][1], ["git", "worktree", "remove", "/w/monza"]);
  assert.equal(plan("monza", "a", "b", null).length, 3, "no worktree → no cleanup step");
});

test("worktreeFor reads the porcelain listing", () => {
  const porcelain = "worktree /home/u/f1-game\nHEAD 1111\nbranch refs/heads/cursor/main-1\n\nworktree /home/u/f1-game/.claude/worktrees/agent-1\nHEAD 2222\nbranch refs/heads/worktree-agent-1\n\n";
  assert.equal(worktreeFor("worktree-agent-1", porcelain), "/home/u/f1-game/.claude/worktrees/agent-1");
  assert.equal(worktreeFor("cursor/main-1", porcelain), "/home/u/f1-game");
  assert.equal(worktreeFor("nope", porcelain), null);
});

test("--dry-run prints the plan and runs nothing; usage on a bad call", () => {
  const r = run("monza", "0000000", "no-such-branch-xyz", "--dry-run");
  assert.equal(r.status, 0, r.stderr);
  const lines = r.stdout.trim().split("\n");
  assert.match(lines[0], /^= plan scope: node tools\/track\/surveyor-scope\.mjs monza 0000000 no-such-branch-xyz$/);
  assert.match(lines[1], /^= plan merge: git merge --no-ff --no-edit no-such-branch-xyz$/);
  assert.match(lines[2], /^= plan verify: node tools\/track\/verify-track\.cjs monza$/);
  assert.match(lines[3], /^= plan cleanup: \(no worktree is checked out on no-such-branch-xyz\)$/);
  assert.equal(spawnSync("git", ["status", "--porcelain", "--", "js/circuits/monza.js"], { cwd: ROOT, encoding: "utf8" }).stdout.trim(), "", "nothing merged");
  assert.equal(run("Monza!", "a", "b").status, 2, "a bad circuit id is usage");
  assert.equal(run("monza").status, 2, "missing arguments");
  assert.equal(run("--help").status, 0);
});

// 2026-11-10: both tools validated the id with /^[a-z0-9-]+$/, which refused the
// seven circuits with an underscore — their hand-back could never run. The id is
// now checked against the manifest roster: every real id passes, an unknown one is usage.
test("an underscore circuit id is accepted; an id not in the roster is usage (merge-surveyor and surveyor-scope)", async () => {
  const { isCircuitId } = await import("../../tools/track/merge-surveyor.mjs");
  const { createRequire } = await import("node:module");
  const { CIRCUITS } = createRequire(import.meta.url)("../../tools/manifest.cjs");
  const underscored = CIRCUITS.filter((id) => id.includes("_"));
  assert.ok(underscored.includes("albert_park") && underscored.length >= 7, "the roster still carries underscore ids");
  for (const id of CIRCUITS) assert.ok(isCircuitId(id), id);
  assert.equal(isCircuitId("nosuch"), false);
  const r = run("albert_park", "0000000", "no-such-branch-xyz", "--dry-run");
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /^= plan verify: node tools\/track\/verify-track\.cjs albert_park$/m);
  assert.equal(run("nosuch", "0000000", "b", "--dry-run").status, 2, "an id not in the roster is usage");
  const SCOPE = path.join(ROOT, "tools/track/surveyor-scope.mjs");
  const head = spawnSync("git", ["rev-parse", "HEAD"], { cwd: ROOT, encoding: "utf8" }).stdout.trim();
  const sc = (id) => spawnSync(process.execPath, [SCOPE, id, head, head], { cwd: ROOT, encoding: "utf8" });
  const ok = sc("watkins_glen");
  assert.equal(ok.status, 0, ok.stderr);
  assert.match(ok.stdout, /= scope ok \(0 files, 0 outside watkins_glen\)/);
  assert.equal(sc("nosuch").status, 2);
  assert.equal(sc("Monza!").status, 2);
});
