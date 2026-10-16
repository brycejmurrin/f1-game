/* collide-wall-limits.test.mjs — TE-2 (round-2 hunt): the barrier clamp at the end of
 * Collide.resolveCollisions used Tracks.wallAt only, so a car shoved (or already) past
 * the PIT WALL or a GANTRY LEG kept that x for the rest of the step, until
 * WallClamp.apply pulled it back next tick (a one-frame glitch; for an AI its px/pz
 * were rebuilt from the unclamped x once). It now enforces the same limits.
 *
 * Run: node --test tests/unit/collide-wall-limits.test.mjs   (~10 s, one boot)
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import vm from "node:vm";

const require = createRequire(import.meta.url);
const { createGame } = require("../../tools/lib/game-vm.cjs");

let g = null, collide = null;
before(async () => {
  g = await createGame({ track: "monza" });
  await g.race("monza", "day", "dry");
  collide = vm.runInContext("Collide", g.ctx).create(g.G, { onEffect() {} });
});
after(() => { if (g) g.close(); });

// Two AI cars 30 m apart (no contact), the first placed at (s, x), the second mid-road.
function place(s, x) {
  const tr = g.G.track;
  const ais = g.G.cars.filter((c) => !c.human).slice(0, 2);
  const [a, b] = ais;
  for (const [c, cs, cx] of [[a, s, x], [b, s + 30, 0]]) {
    c.s = cs; c.x = cx; c.prog = cs; c.speed = 0; c.vLat = 0; c.finished = false;
    const w = g.G.worldFromTrack(cs, cx); c.px = w.x; c.pz = w.z;
  }
  return { a, b, tr };
}

test("pit wall: a car past the wall face is pulled back inside this step", () => {
  const tr = g.G.track, p = tr.pit;
  assert.ok(p && !p.painted, "monza has a pit complex");
  let k = -1;
  for (let i = 200; i < tr.n; i++) if (p.v[i] >= 0.98) { k = i + 10; break; }
  assert.ok(k > 0, "found a pit-wall node");
  const s = k / tr.n * tr.total, face = tr.hw[k] + p.bands.verge;
  const x0 = p.side * (face - 0.4);                       // beyond face - 1.1, still road side
  const wallAt = g.ctx.Tracks.wallAt(tr, s, p.side);
  assert.ok(wallAt > face - 0.4, `anti-vacuity: wallAt (${wallAt.toFixed(2)}) alone would leave the car at ${face - 0.4}`);
  const { a } = place(s, x0);
  collide.resolveCollisions([a, g.G.cars.filter((c) => !c.human)[1]], 1 / 60);
  assert.ok(a.x * p.side <= face - 1.1 + 1e-6, `x*side ${a.x * p.side} should be <= ${face - 1.1}`);
});

test("gantry leg: a car inside a post footprint is held off the leg", () => {
  const tr = g.G.track;
  assert.ok(tr.posts && tr.posts.length, "monza has gantry posts");
  const P = tr.posts[0];
  const x0 = P.side * (P.lat - 0.1);                      // overlapping the leg from the road side
  const lim = {};
  g.ctx.Tracks.postLimits(tr, P.s, x0, lim);
  const edge = P.side > 0 ? lim.r : lim.l;
  const wallAt = g.ctx.Tracks.wallAt(tr, P.s, P.side);
  assert.ok(wallAt > Math.abs(x0) && edge < Math.abs(x0), "anti-vacuity: only the post limit binds");
  const { a } = place(P.s, x0);
  collide.resolveCollisions([a, g.G.cars.filter((c) => !c.human)[1]], 1 / 60);
  assert.ok(Math.abs(a.x) <= edge + 1e-6, `|x| ${Math.abs(a.x)} should be <= ${edge}`);
  assert.ok(Number.isFinite(a.px) && Number.isFinite(a.pz));
});
