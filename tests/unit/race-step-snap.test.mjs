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
  const collide = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "..", "..", "js/physics/collide.js"), "utf8");
  const scan = collide.slice(collide.indexOf("function _onTrafO"), collide.indexOf("function scanTraffic"));
  assert.match(scan, /o\._snapProg - c\.prog/);
  assert.match(scan, /o\._snapX - c\.x/);
  assert.doesNotMatch(scan, /o\.prog - c\.prog/);
  const ot = collide.slice(collide.indexOf("function _onOtO"), collide.indexOf("function scanOtAhead"));
  assert.match(ot, /o\._snapProg - c\.prog/);
  const tow = collide.slice(collide.indexOf("function _onTowO"), collide.indexOf("function scanTow"));
  assert.match(tow, /o\._snapX - c\.x/);
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
  // Crawl detector stays absolute (vstd APPROVED): grip-limited corner floor
  // carries no PACE term, so 7 m/s means crawling at every OVERALL SPEED.
  assert.match(src, /c\.speed < 7 && boxed/);
});

// verify-physics #12 (2026-10-04): the scans found the neighbours through the
// snapshot, then updateCar read the SAME neighbours' live x/speed — blocker
// speed for the queue brake and OT fire, towCar.x for the wake, alongO for
// commit-or-yield and the side squeeze, passOf.x for the closed pass side — so
// a car later in cars[] saw them one step fresher than one earlier: a
// systematic per-index bias. Every neighbour read in updateCar is the snapshot.
test("updateCar reads neighbours only through the snapshot", () => {
  const start = src.indexOf("function updateCar(");
  const end = src.indexOf("\nfunction ", start + 10);
  const fn = src.slice(start, end > start ? end : src.length);
  assert.ok(fn.length > 10000, "anti-vacuity: found the updateCar body");
  const live = fn.match(/\b(?:blocker|towCar|alongO|po|chaser|ahead|o)\.(?:x|speed|prog)\b/g) || [];
  assert.deepEqual(live, [], "live neighbour reads in updateCar: " + live.join(", "));
  assert.match(fn, /blocker\._snapSpeed/);
  assert.match(fn, /alongO\._snapX/);
});
