// Pins for the 2026-10-18 gameplay skill-surface retest (#2866 scope).
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");

test("race-incidents-control: stuck discriminator and takeover test map", () => {
  const skill = read(".claude/skills/race-incidents-control/SKILL.md");
  assert.match(skill, /caution\(\)\.level/);
  assert.match(skill, /stuckT/);
  assert.match(skill, /ai-racecraft/);
  assert.match(skill, /incident-gate\.test\.mjs/);
  assert.match(skill, /race-control\.spec\.js.*no IncidentSim/);
  const wf = read(".claude/skills/race-incidents-control/references/workflow.md");
  assert.match(wf, /takeover is never handed back|never releases/i);
});

test("ai-racecraft: ratings map pins unit tests", () => {
  const skill = read(".claude/skills/ai-racecraft/SKILL.md");
  assert.match(skill, /otFireRate/);
  assert.match(skill, /ai-drive\.test\.mjs/);
  const stuck = read(".claude/skills/ai-racecraft/references/stuck.md");
  assert.match(stuck, /caution level 0/);
});

test("agent-view: buildCorners owner and lap-grade VM recipe", () => {
  const geom = read(".claude/skills/agent-view/references/track-geometry.md");
  assert.match(geom, /agentview-corners\.js/);
  assert.match(geom, /steepest.*grade|worstOverRoad/i);
  assert.match(geom, /Verified on monza/i);
  assert.match(geom, /interlagos/i);
});

test("season-mode and phone-browser retest anchors", () => {
  const season = read(".claude/skills/season-mode/SKILL.md");
  assert.match(season, /2026 REAL|REAL preset/i);
  assert.match(season, /normalize\(/);
  const phone = read(".claude/skills/phone-browser/SKILL.md");
  assert.match(phone, /browser_open|orientation/i);
  assert.match(phone, /landscape/i);
});

test("gameplay routing queries cover retest near-misses", () => {
  const season = JSON.parse(read("tests/data/skill-routing/queries/season-mode.json"));
  assert.ok(season.some((r) => /2026 REAL/i.test(r.query) && r.expect === "season-mode"));
  const incidents = JSON.parse(read("tests/data/skill-routing/queries/race-incidents-control.json"));
  assert.ok(incidents.some((r) => /takeover is never handed back/i.test(r.query)));
  const phone = JSON.parse(read("tests/data/skill-routing/queries/phone-browser.json"));
  assert.ok(phone.some((r) => /tunnel URL/i.test(r.query) && r.expect === "phone-browser"));
});
