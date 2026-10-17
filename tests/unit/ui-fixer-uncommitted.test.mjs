// ui-fixer-uncommitted.sh (retro 2026-10-17, H3): advisory UserPromptSubmit reminder to commit WIP.
import "../helpers/git-fixture-env.mjs"; // FIRST: scrubs the GIT_DIR & co. a git hook exports (#1807)
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const HOOK = path.join(ROOT, ".claude/hooks/ui-fixer-uncommitted.sh");

function rig(branch, ageSec) {
  fs.mkdirSync(path.join(ROOT, "artifacts"), { recursive: true });
  const dir = fs.mkdtempSync(path.join(ROOT, "artifacts", "ui-fixer-"));
  const date = `${Math.floor(Date.now() / 1000) - ageSec} +0000`;
  const g = (...a) => spawnSync("git", a, { cwd: dir, encoding: "utf8", env: { ...process.env, GIT_AUTHOR_DATE: date, GIT_COMMITTER_DATE: date } });
  g("init", "-q"); g("checkout", "-q", "-b", branch); g("config", "user.email", "t@t"); g("config", "user.name", "t");
  fs.mkdirSync(path.join(dir, ".claude/memory"), { recursive: true });
  fs.writeFileSync(path.join(dir, "a.css"), "a{}\n"); fs.writeFileSync(path.join(dir, ".claude/memory/m.md"), "m\n");
  g("add", "-A"); g("commit", "-qm", "init");
  const run = () => spawnSync("bash", [HOOK], { input: "{}", cwd: dir, encoding: "utf8", env: { ...process.env, CLAUDE_PROJECT_DIR: dir } });
  return { dir, run, edit: (f) => fs.writeFileSync(path.join(dir, f), "changed\n"), rm: () => fs.rmSync(dir, { recursive: true, force: true }) };
}

test("dirty cursor/* tree with an hour-old commit gets one reminder, then silence for 30 min", () => {
  const r = rig("cursor/x-1234", 7200);
  try {
    r.edit("a.css");
    const a = r.run();
    assert.equal(a.status, 0); assert.match(a.stdout, /commit WIP to the topic branch/);
    assert.equal(r.run().stdout, "", "debounced");
  } finally { r.rm(); }
});

test("silent: clean tree, fresh commit, other branch, or only synced memory dirty", () => {
  let r = rig("cursor/x-1234", 7200);
  try { assert.equal(r.run().stdout, "", "clean"); r.edit(".claude/memory/m.md"); assert.equal(r.run().stdout, "", "memory only"); } finally { r.rm(); }
  r = rig("cursor/x-1234", 60);
  try { r.edit("a.css"); assert.equal(r.run().stdout, "", "fresh commit"); } finally { r.rm(); }
  r = rig("feature/y", 7200);
  try { r.edit("a.css"); assert.equal(r.run().stdout, "", "not a cursor branch"); } finally { r.rm(); }
});
