/* tool-hook-fixes.test.mjs — orchestration review 2026-10-29 fix 4: sync-pr/deploy merge staging, leftover sync branch,
   test-bg --grep, the stop-guard and protect-files hook papercuts, the generated sw.js required-lazy list. */
import "../helpers/git-fixture-env.mjs";
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { spawnSync, spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { commitMerge } from "../../tools/ci/deploy.mjs";
import { returnTo, leftoverAction, headMoved } from "../../tools/ci/sync-pr.mjs";
import { parseTestBgArgv, shQuote } from "../../tools/ci/test-bg.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const ok = (out = "") => ({ code: 0, out, err: "" });

test("commitMerge stages EVERY regenerated file before the merge commit", () => {
  const calls = [];
  commitMerge({ g: (a) => (calls.push(a.join(" ")), ok()) });
  assert.deepEqual(calls, ["add -A", "commit --no-edit -q"]);
});

test("a failed merge commit keeps the merge in progress and prints the recovery", () => {
  const calls = [];
  const g = (a) => { calls.push(a.join(" ")); return a[0] === "commit" ? { code: 1, out: "", err: "guards: cache miss" } : ok(); };
  let e;
  try { commitMerge({ g }); } catch (x) { e = x; }
  assert.ok(e && e.keepMerge, "flagged so sync-pr does not abort");
  assert.ok(["merge commit failed (guards: cache miss)", "MERGE_HEAD kept", "git add -A && git commit --no-edit"].every((t) => e.message.includes(t)), e.message);
  assert.ok(!calls.some((c) => c.startsWith("merge --abort")), "nothing aborted");
  const git = (a) => (calls.push("RT " + a.join(" ")), ok());
  const r = returnTo("main", "sync-pr-x", git, { keepMerge: true });
  assert.ok(r.line.includes("LEFT IN PROGRESS"));
  assert.ok(!calls.some((c) => c.startsWith("RT ")), "returnTo touches neither MERGE_HEAD nor the checkout");
});

test("leftoverAction: delete a dead sync branch, reuse one whose merge holds the tip, refuse one with unmerged own commits", () => {
  const g = (own, tipIn) => (a) => a[0] === "rev-list" ? ok(String(own)) : a[0] === "merge-base" ? { code: tipIn ? 0 : 1, out: "", err: "" } : { code: 1, out: "", err: "" };
  const acts = [[0, false], [2, true], [2, false]].map(([n, t]) => leftoverAction("sync-pr-x", "x", g(n, t)).action);
  assert.deepEqual(acts, ["delete", "resume", "refuse"]);
});

test("headMoved warns only on a real difference", () => {
  assert.deepEqual([headMoved("a", "a"), headMoved("a", "b"), headMoved("", "b")], [false, true, false]);
});

test("test-bg accepts --grep (both spellings) and quotes it for sh -c", () => {
  const greps = [["--spec", "tests/specs/abudhabi-foundation.spec.js", "--grep", "pit stop"], ["--grep=a|b", "smoke"], ["smoke"]].map((a) => parseTestBgArgv(a).grep);
  assert.deepEqual([...greps, shQuote("it's $x")], ["pit stop", "a|b", null, `'it'\\''s $x'`]);
});

test("sw.js's required-lazy list is GENERATED from LAZY_CAREER_UI (no hand-edited regex line)", () => {
    const r = spawnSync(process.execPath, ["tools/gen/gen-shell.mjs", "--check"], { cwd: ROOT, encoding: "utf8" });
  assert.equal(r.status, 0, r.stdout + r.stderr);
});

const protect = (command, cwd) => spawnSync("python3", [path.join(ROOT, ".claude/hooks/protect-files.py")], { input: JSON.stringify({ tool_name: "Bash", tool_input: { command }, cwd }), encoding: "utf8", cwd });

// protect-files reads Write/Edit only since 2026-11-03 (plan §4.7): the Bash-write classification test went with the shell parser.

test("protect-files: MAIN may edit shared-contract files under a subdirectory; linked worktrees remain protected", () => {
  // git prints --git-dir absolute but --git-common-dir relative ("../../.git")
  // from tools/gen/; the text compare read that as a linked worktree (2026-10-30).
  // ROOT itself may be linked: create both identities without touching the
  // real main checkout or depending on another session's worktree layout.
  fs.mkdirSync(path.join(ROOT, "artifacts"), { recursive: true });
  const fixture = fs.mkdtempSync(path.join(ROOT, "artifacts", "shared-contract-hook-"));
  const main = path.join(fixture, "main"), linked = path.join(fixture, "linked");
  fs.mkdirSync(main);
  const git = (...args) => {
    const r = spawnSync("git", ["-c", "user.name=Hook fixture", "-c", "user.email=fixture@example.invalid", ...args], { cwd: main, encoding: "utf8" });
    assert.equal(r.status, 0, r.stdout + r.stderr);
    return r.stdout.trim();
  };
  const files = ["tools/gen/gen-shell.mjs", "tools/manifest.cjs"];
  try {
    git("init", "-q");
    for (const file of files) {
      fs.mkdirSync(path.dirname(path.join(main, file)), { recursive: true });
      fs.writeFileSync(path.join(main, file), "fixture original\n");
    }
    git("add", "tools");
    git("commit", "-qm", "fixture");
    git("worktree", "add", "--quiet", "--detach", linked, "HEAD");
    const observed = [];
    for (const [checkout, root] of [["main", main], ["linked", linked]]) {
      for (const file of files) {
        const target = path.join(root, file);
        const r = spawnSync("python3", [path.join(ROOT, ".claude/hooks/protect-files.py")], {
          input: JSON.stringify({ tool_name: "Edit", tool_input: { file_path: target, old_string: "fixture original", new_string: "changed" } }),
          encoding: "utf8", cwd: root });
        observed.push({ checkout, file, status: r.status,
          sharedContract: /shared-contract file.*owned by the main/.test(r.stderr),
          unchanged: fs.readFileSync(target, "utf8") === "fixture original\n" });
      }
    }
    assert.deepEqual(observed, ["main", "linked"].flatMap((checkout) => files.map((file) => ({
      checkout, file, status: checkout === "main" ? 0 : 2,
      sharedContract: checkout === "linked", unchanged: true,
    }))), "only MAIN permits the proposed Edit; every fixture file stays unchanged");
  } finally { fs.rmSync(fixture, { recursive: true, force: true }); }
});

// stop-guard.sh was deleted 2026-11-03 with the local browser runs it watched (plan §4.2 / §4.7).
