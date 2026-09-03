/* car-presentation-canary.test.mjs — field cars share the player's pose path.
 *
 * Two leftover presentation bugs made the pack feel delayed and "a different
 * car": (1) an xVis low-pass (16/s AI, 30/s player) plus a shadow pass that
 * damped again at 30/s, so meshes lagged the road frame on corner entry;
 * (2) AI drew the factory FULL mesh (baked wheels) on the chassis attitude
 * matrix, so tyres leaned with the body while the player's wheels stayed
 * planted on _groundMat.
 *
 * Authority is unchanged: the player integrates world px/pz; AI stays on
 * (s, x) and mirrors world metres after the step. TEAM_STYLE / garage-vs-
 * factory parts stay. This file only locks the presentation contract.
 *
 * Run: node --test tests/unit/car-presentation-canary.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");

test("render interpolates world px/pz for every car, not only humans", () => {
  const game = read("js/game.js");
  const pos = game.match(/function renderPosOf\([\s\S]*?\n\}/);
  const anc = game.match(/function playerAnchor\([\s\S]*?\n\}/);
  assert.ok(pos, "renderPosOf present");
  assert.ok(anc, "playerAnchor present");
  assert.match(pos[0], /if \(c\.px != null && c\.rPrevPx !== undefined\)/);
  assert.match(pos[0], /else if \(c\.px != null\)/);
  assert.doesNotMatch(pos[0], /c\.human && c\.px/);
  assert.match(anc[0], /if \(c\.px != null\)/);
  assert.doesNotMatch(anc[0], /c\.human && c\.px/);
});

test("xVis is a dump field — render and shadows do not damp it", () => {
  const game = read("js/game.js");
  assert.doesNotMatch(game, /damp\(\s*c\.xVis/);
  assert.doesNotMatch(game, /damp\([^;]*16,\s*dt\)/);
  const ground = game.match(/function currentCarGroundMat\([\s\S]*?function /);
  assert.ok(ground, "currentCarGroundMat present");
  assert.match(ground[0], /const renderX = cX;/);
  assert.doesNotMatch(ground[0], /damp\(/);
  const body = game.match(/c\.xVis = cX;[^\n]*\n\s*const renderX = cX;/);
  assert.ok(body, "body pass assigns xVis = cX and draws from cX");
});

test("AI world pose is mirrored after this step's (s, x) writes", () => {
  const game = read("js/game.js");
  const fn = game.match(/function updateCar\([\s\S]*?\nfunction rescuePlayer/);
  assert.ok(fn, "updateCar body present");
  const adv = fn[0].indexOf("if (!c.human) c.s = wrapS(c.s + c.speed * dt);");
  const mirror = fn[0].lastIndexOf("if (!c.human) {\n    const w = worldFromTrack(c.s, c.x, smp);");
  assert.ok(adv >= 0, "AI advances s in Frenet");
  assert.ok(mirror > adv, "px/pz mirror must follow the s advance (and rescue)");
  const coast = game.match(/function coast\([\s\S]*?\nfunction /);
  assert.ok(coast, "coast present");
  assert.match(coast[0], /worldFromTrack\(c\.s, c\.x, smp\)/);
  assert.doesNotMatch(coast[0], /c\.human && c\.px/);
});

test("visible procedural cars draw a body-only mesh and planted wheels", () => {
  const game = read("js/game.js");
  assert.match(game, /function teamBodyMesh\(team\)/);
  assert.match(game, /buildCarData\(team, \{ noWheels: true \}\)/);
  assert.match(game, /function getFieldWheelMeshes\(team\)/);
  // Field wheels resolve from the FACTORY setup, via the permanently cached
  // teamDecalState(team, false) — whose builder still derives from
  // Parts.getFactorySetup, pinned below.
  assert.match(game, /const vt = teamDecalState\(team, false\)\.parts/);
  assert.match(game, /const parts = Parts\.getVisualTiers\(setup, team\);/);
  assert.match(game, /const wm = c\.isPlayer \? getPlayerWheelMeshes\(\) : getFieldWheelMeshes\(c\.team\);/);
  const draw = game.match(
    /const body = carModelBuf \? null : \(c\.isPlayer \? playerBodyMesh\(c\.team\) : teamBodyMesh\(c\.team\)\);[\s\S]{0,400}drawPlayerWheels\(c, _groundMat/
  );
  assert.ok(draw, "body + wheels on _groundMat for every procedural car");
  assert.match(game, /if \(_hasLivePlayerShadow\) gfx\.castShadow\(teamMesh\(player\.team\)/);
  assert.match(game, /gfx\.castShadow\(teamMesh\(_shadowTeams\[i\]\), _shadowMats\[i\]\)/);
  assert.match(game, /gfx\.draw\(teamMesh\(player\.team\), tmpMat, _ghostOpts\)/);
});

test("orbit / agent-view read the mirrored world pose for the field", () => {
  const apex = read("js/agent/apex.js");
  const view = read("js/agent/agentview.js");
  assert.match(apex, /const cx = \(c\.px != null\) \? c\.px/);
  assert.match(apex, /const cz = \(c\.pz != null\) \? c\.pz/);
  assert.doesNotMatch(apex, /c\.human && c\.px != null/);
  assert.match(view, /if \(c\.px != null\) return \[c\.px, c\.pz\];/);
  assert.doesNotMatch(view, /c\.human && c\.px != null/);
});
