// centreline-kinks.test.mjs — single-node centreline kinks tighter than the road half-width (#2209).
//
// kinkNodes() must flag a lone hard vertex on a long straight (R below hw) and nothing on a
// smooth arc or a real hairpin whose radius stays above hw. The pinned per-circuit counts in
// tests/data/centreline-kinks.json must match what the built circuits measure, so a regression
// (a new kink) fails here and a fix forces the pin down.
//
// Run: node --test tests/unit/centreline-kinks.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const { kinkNodes, nearestTurn } = require("../../tools/lib/centreline-kinks.cjs");
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const pinned = JSON.parse(fs.readFileSync(path.join(ROOT, "tests/data/centreline-kinks.json"), "utf8")).counts;

const loop = (pts, hw) => ({ n: pts.length, px: pts.map((p) => p[0]), pz: pts.map((p) => p[1]), hw: pts.map(() => hw) });

test("a lone hard vertex on a straight is a kink; a smooth arc is not", () => {
  // A 100 m-radius circle, 200 nodes: R ~ 100 everywhere.
  const circle = Array.from({ length: 200 }, (_, i) => [100 * Math.cos(i / 200 * 2 * Math.PI), 100 * Math.sin(i / 200 * 2 * Math.PI)]);
  assert.deepEqual(kinkNodes(loop(circle, 7)), []);
  // A rectangle with 4 m nodes: each corner is one node turning 90 deg over ~4 m chords: R ~ 2.5 m.
  const rect = [];
  for (let x = 0; x < 40; x += 4) rect.push([x, 0]);
  for (let z = 0; z < 20; z += 4) rect.push([40, z]);
  for (let x = 40; x > 0; x -= 4) rect.push([x, 20]);
  for (let z = 20; z > 0; z -= 4) rect.push([0, z]);
  const kinks = kinkNodes(loop(rect, 7));
  assert.equal(kinks.length, 4);
  assert.ok(kinks.every((k) => k.R < 7 && k.hw === 7));
  // The same corners are not kinks on a road narrower than the corner radius.
  assert.equal(kinkNodes(loop(rect, 2)).length, 0);
});

test("nearestTurn maps a lap fraction onto the 1-based apex list", () => {
  const def = { turns: [0.1, 0.4, 0.8] };
  assert.equal(nearestTurn(def, 0.41), 2);
  assert.equal(nearestTurn(def, 0.99), 1, "wraps around the start line");
  assert.equal(nearestTurn({}, 0.5), 0);
});

test("the pinned counts match the built circuits they name", () => {
  const { buildContext } = require("../../tools/lib/track-build-vm.cjs");
  const env = buildContext();
  for (const id of ["monza", "sochi", "monaco"]) {
    const def = env.Tracks.LIST.find((t) => t.id === id);
    assert.equal(kinkNodes(env.Tracks.build(def)).length, pinned[id] || 0, `${id}: run tools/track/centreline-kinks.cjs --update after fixing`);
  }
  assert.ok(Object.values(pinned).every((n) => Number.isInteger(n) && n > 0), "a fixed circuit leaves the file");
});
