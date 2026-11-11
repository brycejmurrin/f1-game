import "../helpers/git-fixture-env.mjs"; // FIRST: fixture git must not see the caller's GIT_* (#1807)
import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { changeKind, changedSince } from "../../tools/ci/change-kind.mjs";

test("changeKind classifies docs, css, and code without a pull_request paths filter", () => {
  assert.equal(changeKind([]), "empty");
  assert.equal(changeKind(["docs/TESTING.md", "AGENTS.md"]), "docs");
  assert.equal(changeKind([".claude/skills/x/SKILL.md"]), "docs");
  assert.equal(changeKind(["css/hud.css"]), "css");
  assert.equal(changeKind(["css/hud.css", "README.md"]), "css");
  assert.equal(changeKind(["js/game.js"]), "code");
  assert.equal(changeKind(["css/hud.css", "js/ui/hud.js"]), "code");
});

test("a git mv keeps the rename source so a js/ file leaving for docs/ still classifies as code", () => {
  // Premise (ledger M36): --name-only would list only the destination (docs/),
  // and changeKind would answer "docs" — skipping code steps for a moved
  // source file. changedSince must feed both ends so the kind stays "code".
  // Use js/ui/hud.js (already pinned above) — not js/game.js — so this fixture
  // does not raise tree.rawGameReads (source-pin-hygiene).
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "apex-change-kind-"));
  const g = (...a) => execFileSync("git", a, { cwd: dir, encoding: "utf8", stdio: "pipe" }).trim();
  const src = "js/ui/hud.js";
  const dst = "docs/TESTING.md";
  try {
    g("init", "-q"); g("config", "user.email", "t@t"); g("config", "user.name", "t");
    fs.mkdirSync(path.join(dir, "js/ui"), { recursive: true });
    fs.mkdirSync(path.join(dir, "docs"), { recursive: true });
    // Body long enough for git's rename detector (same shape as changed-files.test).
    fs.writeFileSync(path.join(dir, src), "// body for rename detection\n".repeat(20));
    g("add", "-A"); g("commit", "-qm", "base");
    g("mv", src, dst);
    g("commit", "-qam", "moved a js/ file into docs/");
    const nameOnly = g("diff", "--name-only", "HEAD~1").split("\n").filter(Boolean);
    assert.deepEqual(nameOnly, [dst], "premise: --name-only loses the source");
    assert.equal(changeKind(nameOnly), "docs", "premise: destination alone looks docs-only");
    const paths = changedSince("HEAD~1", { cwd: dir });
    assert.deepEqual(paths.sort(), [dst, src].sort());
    assert.equal(changeKind(paths), "code", "rename source must keep the diff classified as code");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
});
