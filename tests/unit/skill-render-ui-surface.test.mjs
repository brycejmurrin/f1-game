// Pins for the 2026-10-18 render/UI/tooling skill-surface retest (#2860 scope).
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const SKILLS = path.join(ROOT, ".claude/skills");
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");

test("f1-animation-cameras: cut-jump owners, replay reposition, smoke CLI", () => {
  const skill = read(".claude/skills/f1-animation-cameras/SKILL.md");
  assert.match(skill, /references\/cut-jump\.md/);
  assert.match(skill, /skill-smoke\.mjs --skill f1-animation-cameras/);
  const replay = read(".claude/skills/f1-animation-cameras/references/replay-diagnosis.md");
  assert.match(replay, /reposition\(\)/);
  assert.doesNotMatch(replay, /real-replay\.js ~L341/);
  const cut = read(".claude/skills/f1-animation-cameras/references/cut-jump.md");
  assert.match(cut, /mode-switch\.js/);
  assert.match(cut, /camera-ride\.test\.mjs/);
});

test("survey-ui-matrix: parent-only layout-audit list/report", () => {
  const skill = read(".claude/skills/survey-ui-matrix/SKILL.md");
  assert.match(skill, /bash-guard\.sh/);
  assert.match(skill, /--list.*parent-only|--list` \/ `--report` too/s);
  assert.match(skill, /--scale=/);
});

test("renderer-debug: boot fallback path and GLX INVALID_OPERATION bisect", () => {
  const skill = read(".claude/skills/renderer-debug/SKILL.md");
  assert.match(skill, /renderer-boot\.js/);
  assert.match(skill, /GL_INVALID_OPERATION/);
  const glx = read(".claude/skills/renderer-debug/references/glx.md");
  assert.match(glx, /Bisect a `GL_INVALID_OPERATION`/);
});

test("lighting-tuner: Tracks.LIST and Chromium parent-only warning", () => {
  const skill = read(".claude/skills/lighting-tuner/SKILL.md");
  const chromium = skill.split("\n").findIndex((l) => /Chromium|parent session only/i.test(l));
  const tracks = skill.indexOf("Tracks.LIST");
  assert.ok(chromium >= 0 && tracks >= 0 && chromium < tracks,
    "parent-only Chromium warning should appear before the Tracks.LIST paragraph");
  assert.doesNotMatch(skill, /52 circuits/);
});

test("render/UI retest reference splits exist", () => {
  for (const rel of [
    ".claude/skills/js-debugger/references/tools.md",
    ".claude/skills/garage-parts-livery/references/before-pack.md",
    ".claude/skills/playwright-probe/references/recipes.md",
  ]) {
    assert.ok(fs.existsSync(path.join(ROOT, rel)), `missing ${rel}`);
  }
  const ui = read(".claude/skills/ui-menu-a11y/references/workflow.md");
  assert.match(ui, /key-binds\.js/);
});
