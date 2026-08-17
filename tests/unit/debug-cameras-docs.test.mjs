/* debug-cameras-docs.test.mjs — pin camera-doc claims to the live tree.
 *
 * The debug-cameras skill, framing.md, and docs/DEBUG-HOOKS.md camera
 * sections drifted from js/game/{apex,cameras,tables,cam-tune}.js (label
 * matching, centreline-lead chase, Monza T1 folklore, snapCam-vs-sky,
 * camState.roll). A doc that names a hook is not a contract unless something
 * fails when the source moves.
 *
 * Scope is mechanical: mode lists, matcher shape, return-field names,
 * markings apex, tuner knobs, shot.mjs cam tokens. Prose is not policed.
 *
 * Run: node --test tests/unit/debug-cameras-docs.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");

const SKILL = read(".claude/skills/debug-cameras/SKILL.md");
const FRAMING = read(".claude/skills/debug-cameras/references/framing.md");
const HOOKS = read("docs/DEBUG-HOOKS.md");
const APEX = read("js/game/apex.js");
const TABLES = read("js/game/tables.js");
const CAMERAS = read("js/game/cameras.js");
const TUNE = read("js/game/cam-tune.js");
const MARKINGS = read("js/track/markings.js");
const SHOT = read(".claude/skills/playwright-probe/shot.mjs");
const CAPTURE = read("tools/capture/apex-capture.mjs");

function camModeIds() {
  const ids = [];
  const block = TABLES.slice(TABLES.indexOf("const CAM_MODES"), TABLES.indexOf("];", TABLES.indexOf("const CAM_MODES")) + 2);
  for (const m of block.matchAll(/id:\s*"([a-z]+)"/g)) ids.push(m[1]);
  return ids;
}

test("skill cycle order matches CAM_MODES in tables.js", () => {
  const ids = camModeIds();
  assert.equal(ids.length, 13, "expected 13 CAM_MODES");
  const listed = SKILL.match(/```\n([a-z ]+)\n```/);
  assert.ok(listed, "SKILL.md must fence the cycle-order line");
  assert.equal(listed[1].trim().split(/\s+/).join(" "), ids.join(" "));
});

test("camera() matches id or index, not picker labels", () => {
  assert.match(APEX, /c\.id === String\(m\)\.toLowerCase\(\)/);
  assert.doesNotMatch(APEX, /c\.label === String\(m\)/);
  for (const doc of [SKILL, HOOKS]) {
    assert.doesNotMatch(doc, /id\*\*, \*\*label\*\*, or \*\*index/);
    assert.doesNotMatch(doc, /id, label, or index/);
  }
  assert.match(SKILL, /TV SIDE/);
  assert.match(HOOKS, /TV SIDE/);
});

test("camState / viewState docs include roll", () => {
  assert.match(APEX, /roll: 0, debug: true/);
  assert.match(APEX, /roll: G\.camRoll, debug: false/);
  for (const doc of [SKILL, FRAMING, HOOKS]) {
    assert.match(doc, /camState\(\).*roll/s);
  }
});

test("Monza T1 in framing.md is the markings.js Rettifilo apex", () => {
  const monza = MARKINGS.match(/monza:\s*\{[\s\S]*?turns:\s*\[([0-9.,\s]+)\]/);
  assert.ok(monza, "markings.js monza.turns");
  const t1 = parseFloat(monza[1].split(",")[0]);
  assert.equal(t1, 0.0962);
  assert.match(FRAMING, /0\.0962/);
  assert.doesNotMatch(FRAMING, /0\.016–0\.042|jump\(0\.035/);
});

test("camTune docs include cornerLead; defs have seven knobs", () => {
  const knobs = [...TUNE.matchAll(/id:\s*"(height|dist|side|pitch|yaw|fov|cornerLead)"/g)].map((m) => m[1]);
  assert.deepEqual([...new Set(knobs)], ["height", "dist", "side", "pitch", "yaw", "fov", "cornerLead"]);
  assert.match(HOOKS, /cornerLead:0/);
  assert.match(SKILL, /cornerLead/);
});

test("view() with no args is the whole-track aerial; sky() is not dbgCam", () => {
  const viewFn = APEX.slice(APEX.indexOf("view(opts)"), APEX.indexOf("eyeAt("));
  assert.match(viewFn, /opts === "chase"/);
  assert.match(viewFn, /opts = opts \|\| \{\}/);
  assert.match(HOOKS, /Call with no args for the\n\*\*whole-track aerial\*\*/);
  const skyFn = APEX.slice(APEX.indexOf("sky(frac"), APEX.indexOf("camera(m)"));
  assert.match(skyFn, /G\.dbgCam = null/);
  assert.match(skyFn, /G\.skyViewOverride = \{/);
  assert.match(HOOKS, /`sky\(\)` is different/);
});

test("shot.mjs and apex-capture cameras tokens match the docs", () => {
  assert.match(SHOT, /cam = park \| eye \| orbit \| cinematic \| trackside/);
  assert.match(FRAMING, /cam = park\|orbit\|eye\|cinematic\|trackside/);
  assert.match(CAPTURE, /const CAMS = \["chase","far","cockpit"/);
  assert.doesNotMatch(CAPTURE.match(/const CAMS = \[[^\]]+\]/)[0], /drift/);
});

test("cockpit / tcam datums in DEBUG-HOOKS match cameras.js", () => {
  assert.match(CAMERAS, /const COCKPIT_EYE_FWD = -0\.20, COCKPIT_EYE_UP = 0\.82/);
  assert.match(HOOKS, /−0\.20 \/ 0\.82 m/);
  assert.match(CAMERAS, /p\[1\] \+ 1\.46/);
  assert.match(HOOKS, /1\.46 m above the car/);
});
