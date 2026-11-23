// mergeBase mid-merge: the base the merge commit will have, so a sync of a branch
// whose OWN change lowered a tree count is not refused by the slack rule (ownMin).
// Every repo here is a throwaway under os.tmpdir().
import "../helpers/git-fixture-env.mjs"; // FIRST: scrubs the GIT_DIR & co. a git hook exports (#1807)
import { test } from "node:test";
import assert from "node:assert/strict";
import cp from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { mergeBase } from "../../tools/check/ratchets.mjs";

test("mergeBase: during a merge it is the base the merge commit will have, not the branch's old base", async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "apex-mergebase-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const git = (...a) => cp.execFileSync("git", ["-c", "user.name=t", "-c", "user.email=t@t", "-c", "commit.gpgsign=false", ...a], { cwd: dir, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
  const commit = (file, msg) => { fs.writeFileSync(path.join(dir, file), msg); git("add", file); git("commit", "-q", "--no-verify", "-m", msg); return git("rev-parse", "HEAD"); };
  git("init", "-q", "-b", "pr");
  const base = commit("a.txt", "base");
  git("checkout", "-q", "-b", "tip");
  const tip = commit("b.txt", "tip moved on");
  git("checkout", "-q", "pr");
  commit("c.txt", "the PR's own change");
  const prev = process.env.APEX_RATCHETS_BASE;
  process.env.APEX_RATCHETS_BASE = "tip";
  t.after(() => { if (prev === undefined) delete process.env.APEX_RATCHETS_BASE; else process.env.APEX_RATCHETS_BASE = prev; });
  assert.equal(mergeBase(dir), base, "no merge in progress: the branch's merge-base");
  git("merge", "-q", "--no-commit", "--no-ff", "tip");
  assert.equal(mergeBase(dir), tip, "mid-sync: HEAD is still the old head, the base is the merged tip");
});
