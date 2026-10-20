/* Traffic scans in one field step must read last step's poses.
 * updateCar writes prog/x/speed before the next car's scan; a side-by-side
 * then looked like a pass in array order. Own c.prog/c.x/c.speed stay live.
 */
import { createRequire } from "node:module";
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const src = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "..", "..", "js/game.js"), "utf8");

// verify-physics #12 (2026-10-04): the scans found the neighbours through the
// snapshot, then updateCar read the SAME neighbours' live x/speed — blocker
// speed for the queue brake and OT fire, towCar.x for the wake, alongO for
// commit-or-yield and the side squeeze, passOf.x for the closed pass side — so
// a car later in cars[] saw them one step fresher than one earlier: a
// systematic per-index bias. Every neighbour read in updateCar is the snapshot.
test("updateCar reads neighbours only through the snapshot", () => {
  // updateCar AND its parts (the updateCar* helpers after it, PERF-HUNT-2 S1), up to rescuePlayer.
  const start = src.indexOf("function updateCar(");
  const end = src.indexOf("\nfunction rescuePlayer(", start + 10);
  const fn = src.slice(start, end > start ? end : src.length);
  assert.ok(fn.length > 10000, "anti-vacuity: found the updateCar body");
  const live = fn.match(/\b(?:blocker|towCar|alongO|po|chaser|ahead|o)\.(?:x|speed|prog)\b/g) || [];
  assert.deepEqual(live, [], "live neighbour reads in updateCar: " + live.join(", "));
  assert.match(fn, /blocker\._snapSpeed/);
  assert.match(fn, /alongO\._snapX/);
});

const require = createRequire(import.meta.url);
const { createGame } = require("../../tools/lib/game-vm.cjs");

async function orderedPair(reverse, liveNeighbourSpeed = false) {
  const g = await createGame({ track: "monza" });
  try {
    g.G.daily.stop();
    g.apex.headless(true);
    const pair = g.G.cars.filter(c => !c.isPlayer).slice(0, 2);
    for (const [i, c] of pair.entries()) {
      g.apex.aiPlace(g.G.cars.indexOf(c), 0.62 + i * 9 / g.G.track.total, i ? 40 : 44, 0);
      c.lap = 1; c.prog = g.G.track.total + c.s;
      // Negative control reproduces the old live-neighbour seam without
      // changing production source: snapshot writes no longer freeze speed.
      if (liveNeighbourSpeed) Object.defineProperty(c, "_snapSpeed", {
        configurable: true, get() { return this.speed; }, set(_) {},
      });
    }
    g.G.cars.splice(0, g.G.cars.length, ...(reverse ? pair.slice().reverse() : pair));
    g.apex.go();
    g.apex.step(1 / 60, 1);
    return Array.from(pair, c => ({ name: c.name, speed: c.speed, x: c.x, prog: c.prog,
      accSm: c.accSm }));
  } finally { g.close(); }
}

test("two-car queue decision is invariant to update order by stable identity", async () => {
  const forward = await orderedPair(false), reverse = await orderedPair(true);
  assert.equal(forward.length, 2);
  assert.notEqual(forward[0].name, forward[1].name);
  assert.deepEqual(reverse, forward);
});

test("queue fixture detects the live-neighbour speed regression", async () => {
  const forward = await orderedPair(false, true), reverse = await orderedPair(true, true);
  assert.notDeepEqual(reverse, forward, "negative control must expose an update-order bias");
});
