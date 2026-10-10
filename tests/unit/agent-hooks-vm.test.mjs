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


// ── round 2, B8 ─────────────────────────────────────────────────────────────

test("act() in a time trial ends the flying-start run-up: the wheel is the agent's", async () => {
  try { g.apex.clearInput(); } catch (_) {}
  const before = g.G.cars;
  assert.ok(g.apex.tt("monza", "day"), "tt() starts");
  await g.settle(() => g.G.cars !== before && g.G.state === "count", 4000);
  pump(3);   // the first countdown frame arms FlyingStart (it is a per-frame update)
  truthy(g.G.flyingStart.active(), "the run-up is armed after tt()");
  const o0 = g.apex.act({ steer: 0, throttle: true }, 1 / 60, 1);
  assert.equal(g.G.flyingStart.active(), false, "act() hands the run-up back");
  const v0 = o0.speed != null ? o0.speed : g.G.player.speed;
  g.apex.act({ steer: 0, throttle: true }, 1 / 60, 30);
  truthy(g.G.player.human, "the player car is human again");
  gt(g.G.player.speed, v0, "throttle input is obeyed (speed rises)");
  // restore a plain race for the tests after this one
  g.G.timeTrial = false;
});

test("reset() ends an armed flying-start run-up", async () => {
  try { g.apex.clearInput(); } catch (_) {}
  const before = g.G.cars;
  g.apex.tt("monza", "day");
  await g.settle(() => g.G.cars !== before && g.G.state === "count", 4000);
  pump(3);
  truthy(g.G.flyingStart.active());
  g.apex.reset(0.1, 40, 0);
  assert.equal(g.G.flyingStart.active(), false);
  truthy(g.G.player.human);
  g.G.timeTrial = false;
});

test("world().ego.pos for a retired player is the same running-then-retired rank as timing()", async () => {
  await load("monza", 0.5, 50);
  g.apex.retire();   // the player
  truthy(g.G.player.retired);
  const pos = g.apex.world({ detail: "full" }).ego.pos;
  gt(pos, 0, "never P0");
  assert.equal(pos, g.apex.timing().pos);
  assert.equal(pos, g.G.cars.length, "the lone retiree is classified last");
});

test("world({since}) reports a small move of a unit-range field (frac within 0.005), not a quarter-range deadband", async () => {
  await load("monza", 0.2, 60);
  const a = g.apex.world({ detail: "drive" });
  g.apex.step(1 / 60, 120);
  const full = g.apex.world({ detail: "drive" });
  gt(Math.abs(full.ego.frac - a.ego.frac), 0.005, "the run moved frac by more than the tolerance");
  g.apex.step(1 / 60, 1);
  const d = g.apex.world({ detail: "drive", since: full.seq });
  const now = g.apex.world({ detail: "drive" });
  // reconstruct from the delta chain: base `full`, plus whatever the delta carried
  const rec = d.ego && d.ego.frac !== undefined ? d.ego.frac : full.ego.frac;
  lt(Math.abs(rec - now.ego.frac), 0.0051, "the reconstructed frac is within 0.005 of the truth");
  // and a 120-frame hop on its own surfaces frac in the delta
  const b = g.apex.world({ detail: "drive" });
  g.apex.step(1 / 60, 120);
  const d2 = g.apex.world({ detail: "drive", since: b.seq });
  truthy(d2.ego && d2.ego.frac !== undefined, "a 120-frame move of frac is carried by the delta");
});

test("obs().axFrac and physState().axFrac agree, both preferring the stored value", async () => {
  await load("monza", 0.3, 50);
  g.G.player.axFrac = 0.42; g.G.player.axEstSm = 0;
  assert.equal(g.apex.obs().axFrac, 0.42);
  assert.equal(g.apex.physState().axFrac, 0.42);
  g.G.player.axFrac = undefined;
});

test("nodeAt(NaN) and other non-numbers answer {ok:false} instead of throwing", async () => {
  await load("monza", 0.3, 50);
  for (const bad of [NaN, undefined, "abc", Infinity, null]) {
    const r = g.apex.nodeAt(bad);
    assert.equal(r && r.ok, false, "nodeAt(" + String(bad) + ")");
  }
  assert.equal(typeof g.apex.nodeAt(0.45).k, "number");
  assert.equal(typeof g.apex.nodeAt(0).k, "number");
});
