/* rescue-occupancy-vm.test.mjs — a rescue never lands on another car (#5775 R5).
 *
 * rescuePlayer keeps the car's arc position and used to set x = 0 blind: onto a car
 * stopped on the line (Monza, hunt 2026-11-18: shoved 1.76 m sideways in the same
 * step; Monaco: four rescues in 21 s, each ending nose to tail at 0 m/s). Now
 * Collide.rescueX picks centre, else a car's width to either side, clear of every car
 * within a length and a half of arc; the world position follows the chosen x.
 *
 * Run: node --test tests/unit/rescue-occupancy-vm.test.mjs
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { createGame } = require("../../tools/lib/game-vm.cjs");

let g = null;
before(async () => { g = await createGame({ track: "monza" }); });
after(() => { if (g) g.close(); });

test("Collide.rescueX: centre when clear, else a car's width aside, never onto a car", () => {
  const C = g.sandbox.Collide, L = 5000, W = C.WCAR, hw = 6;
  const me = { s: 100, x: 3 };
  assert.equal(C.rescueX(me, [me], L, hw), 0, "alone: the centre, as before");
  assert.equal(C.rescueX(me, [me, { s: 130, x: 0 }], L, hw), 0, "a car 30 m up the road does not move the rescue");
  const block = { s: 102, x: 0.3 };
  const x1 = C.rescueX(me, [me, block], L, hw);
  assert.ok(Math.abs(x1 - block.x) >= W, "clear of a car stopped on the line: " + x1);
  assert.ok(x1 > 0, "the side the car came off is tried first");
  const x2 = C.rescueX(me, [me, block, { s: 99, x: x1 }], L, hw);
  assert.ok(x2 < 0 && Math.abs(x2 - block.x) >= W, "that side taken too: the other side: " + x2);
  assert.ok(Math.abs(x2) + W / 2 < hw, "still on the road");
  const wrap = { s: 2, x: 3 };
  assert.ok(C.rescueX(wrap, [wrap, { s: L - 2, x: 0 }], L, hw) !== 0, "the arc window wraps at the line");
  assert.equal(C.rescueX(me, [me, { s: 101, x: 0, finished: true }], L, hw), 0, "a finished car has left the race");
});

test("rescuePlayer beside a car stopped on the line puts the player clear of it, world position matching", async () => {
  const A = g.apex, G = g.G;
  await g.race("monza");
  A.reset(0.3, 30, 0); A.headless(true); A.go();
  const p = G.player, L = G.track.total;
  const r = G.cars.find((c) => !c.human && !c.isPlayer);
  for (const o of G.cars) if (o !== p) { o.s = (p.s + L / 2) % L; o.prog = p.prog + L / 2; }
  r.s = (p.s + 2.5) % L; r.prog = p.prog + 2.5; r.x = 0; r.speed = 0;   // the hunt's Monza row: a car 2.5 m ahead on the line
  p.x = 4;
  G.rescuePlayer(p);
  assert.ok(Math.abs(p.x - r.x) >= g.sandbox.Collide.WCAR, "rescued clear of the stopped car, not onto it: x " + p.x);
  const smp = { p: [0, 0, 0], t: [0, 0, 1], r: [1, 0, 0], hw: 7 };
  g.sandbox.Tracks.sample(G.track, p.s, smp);
  const rl = Math.hypot(smp.r[0], smp.r[2]) || 1;
  const ex = smp.p[0] + smp.r[0] / rl * p.x, ez = smp.p[2] + smp.r[2] / rl * p.x;
  assert.ok(Math.hypot(p.px - ex, p.pz - ez) < 1e-6, "world position follows the chosen x");
  assert.equal(p.xVis, p.x, "the drawn offset matches");
  // Nothing in the way: the centre line, as before.
  r.s = (p.s + L / 2) % L; p.x = 4;
  G.rescuePlayer(p);
  assert.equal(p.x, 0, "clear road: rescued to the centre");
});
