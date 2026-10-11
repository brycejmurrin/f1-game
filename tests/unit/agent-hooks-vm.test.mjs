/* agent-hooks-vm.test.mjs — __apex contract checks that have NO browser copy
 * (so this is not a twin: tools/ci/twinned-specs.mjs pairs agent-view.spec.js
 * with agent-view-vm.test.mjs test for test, and these would break that count).
 * Each one pins a defect a VM probe of the hooks found on 2026-10-04:
 * rollout() ticking frozen frames after the flag, a lapped rival read as a
 * lap away, retired cars ranked ahead of the field, the scale hooks saving a
 * fraction as 40 %, renderScale() NaN, a stationary nextCorner.timeS of
 * thousands of seconds, and atmosphere() calling a storm night starry.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { createGame } = require("../../tools/lib/game-vm.cjs");

const gt = (a, b, m) => assert.ok(a > b, m || `${a} > ${b}`);
const lt = (a, b, m) => assert.ok(a < b, m || `${a} < ${b}`);
const truthy = (v, m) => assert.ok(v, m || `${JSON.stringify(v)} is not truthy`);

let g = null;
before(async () => { g = await createGame({ storage: { trackId: "monza" } }); });
after(() => { if (g) g.close(); });

async function load(trackId = "monza", frac = 0.05, speed = 60) {
  try { g.apex.clearInput(); } catch (_) {}
  try { g.apex.weather("dry"); g.apex.setTimeOfDay("day"); } catch (_) {}
  await g.race(trackId);
  g.apex.go();
  g.apex.jump(frac, speed, 0);
}
const FRAME_MS = 50;
let clock = 0;
function pump(n) {
  if (!clock) clock = g.sandbox.performance.now();
  for (let i = 0; i < n; i++) { clock += FRAME_MS; g.pumpFrame(clock); }
}

test("rollout stops at the flag instead of averaging frozen frames", async () => {
  await load("monza", 0.985, 80);
  g.apex.setLap(g.G.lapsTarget);
  const r = g.apex.rollout({ seconds: 20, input: { steer: 0, throttle: true } });
  assert.equal(r.terminal.reason, "finished");
  truthy(r.ran.stoppedEarly);
  lt(r.ran.ticks, r.ran.requestedTicks);
  lt(r.ran.seconds, 10);
  const again = g.apex.rollout({ seconds: 2 });
  assert.equal(again.ok, false);
  assert.equal(again.error, "RaceOverError");
});

test("rollout refuses a policyHz that is not positive", async () => {
  await load("monza", 0.05, 50);
  for (const policyHz of [0, -5]) {
    const r = g.apex.rollout({ seconds: 1, policyHz, policy: () => ({ throttle: true }) });
    assert.equal(r.error, "BadArgumentError");
  }
});

test("a lapped rival a few metres ahead on the road is ahead, not a lap away", async () => {
  await load("monza", 0.5, 50);
  const p = g.G.player, L = g.G.track.total;
  const c = g.G.cars.find((x) => !x.isPlayer);
  c.s = (p.s + 10) % L; c.lap = p.lap - 1; c.prog = c.lap * L - (L - c.s); c.x = p.x; c.speed = 30;
  const id = c.id != null ? c.id : g.G.cars.indexOf(c);
  const r = g.apex.world({ detail: "full" }).rivals.find((x) => x.id === id);
  truthy(r);
  assert.equal(r.rel, "ahead");
  lt(r.gapM, 15);
  assert.equal(r.lapsAhead, -1);
  assert.notEqual(r.threat, "clear");
});

test("same-lap rivals do not invent lapsAhead from nearest-prog wrap", async () => {
  // MCP survey B5: first-lap pack with |prog| > L/2 and lap:0 both sides used
  // to report rel:"behind" + lapsAhead:1. Standing is the lap counter.
  await load("spa", 0.5, 50);
  const p = g.G.player, L = g.G.track.total;
  const c = g.G.cars.find((x) => !x.isPlayer);
  p.lap = 0; p.s = 200; p.prog = 200;
  c.lap = 0; c.s = L - 800; c.prog = L - 800; c.x = p.x; c.speed = 30;
  const id = c.id != null ? c.id : g.G.cars.indexOf(c);
  const r = g.apex.world({ detail: "full" }).rivals.find((x) => x.id === id);
  truthy(r);
  assert.equal(r.lap, 0);
  assert.equal(r.lapsAhead, 0);
  assert.equal(r.rel, "ahead");
  gt(r.gapM, L / 2 - 50);
});

test("a retired car is classified behind the running field in every order hook", async () => {
  await load("monza", 0.5, 50);
  const p = g.G.player;
  const ahead = g.G.cars.find((x) => !x.isPlayer && x.prog > p.prog);
  truthy(ahead);
  ahead.retired = true;
  const pos = g.apex.world({ detail: "full" }).ego.pos;
  assert.equal(g.apex.field().player.pos, pos);
  assert.equal(g.apex.timing().pos, pos);
  const fs = g.apex.fieldState();
  assert.equal(fs[fs.length - 1].retired, true);
  ahead.retired = false;
});

test("scale hooks refuse a fraction instead of saving the floor", async () => {
  await load("monza", 0.05, 50);
  const before = g.apex.uiScale().stored;
  for (const [hook, v] of [["uiScale", 1.6], ["hudScale", 1.3], ["btnScale", 0], ["uiScale", "abc"]]) {
    assert.equal(g.apex[hook](v).ok, false, hook + "(" + v + ")");
  }
  assert.equal(g.apex.uiScale().stored, before);
  for (const v of [60, "auto", false]) assert.equal(g.apex.renderScale(v).ok, false, "renderScale(" + v + ")");
  assert.equal(g.apex.renderScale(0.75).scale != null, true);
});

test("nextCorner has no time-to-corner while stationary", async () => {
  await load("monza", 0.05, 0);
  assert.equal(g.apex.world({ detail: "full" }).nextCorner.timeS, null);
});

test("a rainy night does not claim a starry sky the cloud deck hides", async () => {
  await load();
  g.apex.setTimeOfDay("night");
  g.apex.weather("dry");
  pump(2);
  const clear = g.apex.atmosphere();
  assert.match(clear.brief, /stars out/);
  g.apex.weather("rain");
  pump(2);
  const wet = g.apex.atmosphere();
  gt(wet.cloudCover, clear.cloudCover);
  if (wet.cloudCover >= 0.6) assert.doesNotMatch(wet.brief, /stars out|moon up/);
  else assert.match(wet.brief, /stars out/);
  g.apex.weather("dry");
});

