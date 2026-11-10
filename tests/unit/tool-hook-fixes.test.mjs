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
  const greps = [["--spec", "tests/specs/abudhabi-foundation.spec.js", "--grep", "pit stop"], ["--grep=a|b", "--spec", "tests/specs/smoke.spec.js"], ["--spec", "tests/specs/smoke.spec.js"]].map((a) => parseTestBgArgv(a).grep);
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

// Behavioural rows for the advisory hooks (W14): the real scripts on a throwaway repo under artifacts/.
function hookRepo(prefix) {
  const dir = fs.mkdtempSync(path.join(ROOT, "artifacts", prefix));
  spawnSync("git", ["init", "-q", dir]);
  const put = (rel, text) => { fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true }); fs.writeFileSync(path.join(dir, rel), text); };
  return { dir, put, rm: () => fs.rmSync(dir, { recursive: true, force: true }) };
}

test("post-edit.sh: a js/ file that does not parse is named; a new test file points at the generated coverage page", () => {
  const r = hookRepo("post-edit-");
  // fixture paths in a throwaway repo, spelled in parts so they never read as references into this tree
  const BAD = ["js", "bad.js"].join("/"), GOOD = ["js", "good.js"].join("/"), NEW = ["tests/unit", "new-thing.test.mjs"].join("/");
  try {
    r.put(BAD, "function (\n");
    r.put(NEW, "// new-thing — covers x.\n");
    r.put("docs/TESTING-COVERAGE.md", "| other.test.mjs | x |\n");
    const hook = (rel) => {
      const out = spawnSync("bash", [path.join(ROOT, ".claude/hooks/post-edit.sh")], { encoding: "utf8",
        input: JSON.stringify({ tool_name: "Edit", hook_event_name: "PostToolUse", tool_input: { file_path: path.join(r.dir, rel) } }) });
      assert.equal(out.status, 0, out.stderr);
      return out.stdout.trim() ? JSON.parse(out.stdout).hookSpecificOutput.additionalContext : "";
    };
    assert.match(hook(BAD), /bad\.js does not parse/);
    const t = hook(NEW);
    assert.match(t, /docs\/TESTING-COVERAGE\.md row/);
    assert.doesNotMatch(t, /docs\/TESTING\.md §5/, "the retired hand table");
    r.put(GOOD, "var x = 1;\n");
    assert.equal(hook(GOOD), "", "a clean edit says nothing");
  } finally { r.rm(); }
});

test("session-start.sh dry mode: names the bounded install and an open hatch, and changes nothing", () => {
  const r = hookRepo("session-start-");
  try {
    r.put("package.json", "{}\n"); r.put("package-lock.json", "{}\n"); r.put(".githooks/pre-commit", "#!/bin/sh\n");
    r.put(".claude/allow-protected", "");
    const out = spawnSync("bash", [path.join(ROOT, ".claude/hooks/session-start.sh")], { encoding: "utf8", timeout: 60000,
      env: { ...process.env, CLAUDE_PROJECT_DIR: r.dir, APEX_SESSION_START_DRY: "1", APEX_SKIP_SESSION_INSTALL: "" } });
    assert.equal(out.status, 0, out.stderr);
    assert.match(out.stdout, /^apex26 session-start: npm ci: would run \(dry\);/);
    assert.match(out.stdout, /hooksPath: would set \.githooks/);
    assert.match(out.stdout, /HATCH ACTIVE: \.claude\/allow-protected/);
    assert.ok(!fs.existsSync(path.join(r.dir, "node_modules")), "no install ran");
    assert.equal(spawnSync("git", ["-C", r.dir, "config", "--get", "core.hooksPath"], { encoding: "utf8" }).stdout.trim(), "", "no git config write");
    const src = fs.readFileSync(path.join(ROOT, ".claude/hooks/session-start.sh"), "utf8");
    assert.match(src, /timeout -k 5 120 npm ci/, "the install is bounded inside the 300 s hook");
  } finally { r.rm(); }
});
