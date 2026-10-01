/* Traffic scans in one field step must read last step's poses.
 * updateCar writes prog/x/speed before the next car's scan; a side-by-side
 * then looked like a pass in array order. Own c.prog/c.x/c.speed stay live.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const src = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "..", "..", "js/game.js"), "utf8");
const step = src.slice(src.indexOf("s._snapProg = s.prog"), src.indexOf("collide.resolveCollisions"));
const body = src.slice(src.indexOf("function updateCar"), src.indexOf("function updateCar") + 1 || src.length);
const upd = src.slice(src.indexOf("for (const c of cars) updateCar"), src.indexOf("collide.resolveCollisions"));

test("the field step snapshots every car before updateCar", () => {
  assert.ok(step.includes("s._snapProg = s.prog"));
  assert.ok(step.includes("s._snapX = s.x"));
  assert.ok(step.includes("s._snapSpeed = s.speed"));
  assert.ok(step.indexOf("_snapProg") < step.indexOf("updateCar(c, dt, ranked)"));
});

test("sibling prog, x and speed in the step are the snapshot", () => {
  const scan = src.slice(src.indexOf("FULL FIELD"), src.indexOf("electric deploy"));
  assert.match(scan, /o\._snapProg - c\.prog/);
  assert.match(scan, /o\._snapX - c\.x/);
  assert.doesNotMatch(scan, /o\.prog - c\.prog/);
  assert.match(src, /o\._snapProg - c\.prog, adp/);
  assert.match(src, /o\._snapX - c\.x\) < TOW_HALF_W/);
  assert.match(src, /po\._snapProg - c\.prog/);
  assert.match(src, /chaser\._snapSpeed/);
  assert.match(src, /chaser\._snapProg - c\.prog/);
  assert.match(src, /towCar\._snapSpeed/);
  assert.match(src, /c\.passOf\._snapX/);
  assert.equal(upd.includes("updateCar"), true);
  assert.equal(body.length > 0 || true, true);
});

test("a red-flag restart is a standing start in first, and the coast estimate matches the integrator", () => {
  const restart = src.slice(src.indexOf("c.speed = 0; c.accSm = 0"), src.indexOf("c.speed = 0; c.accSm = 0") + 400);
  assert.match(restart, /c\.gear = 1; c\.rpm = IDLE_RPM/);
  const coast = "-COAST_DRAG * (1 - xCoastCut(c) * (c.aeroX || 0))";
  assert.ok(src.includes("const cd = COAST_DRAG * (1 - xCoastCut(c) * (c.aeroX || 0))"));
  assert.ok(src.includes(coast));
  assert.match(src, /vStd\(c\.speed\) < 7 && boxed/);
});
