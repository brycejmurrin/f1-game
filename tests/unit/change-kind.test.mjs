import test from "node:test";
import assert from "node:assert/strict";
import { changeKind } from "../../tools/ci/change-kind.mjs";

test("changeKind classifies docs, css, and code without a pull_request paths filter", () => {
  assert.equal(changeKind([]), "empty");
  assert.equal(changeKind(["docs/TESTING.md", "AGENTS.md"]), "docs");
  assert.equal(changeKind([".claude/skills/x/SKILL.md"]), "docs");
  assert.equal(changeKind(["css/hud.css"]), "css");
  assert.equal(changeKind(["css/hud.css", "README.md"]), "css");
  assert.equal(changeKind(["js/game.js"]), "code");
  assert.equal(changeKind(["css/hud.css", "js/ui/hud.js"]), "code");
});
