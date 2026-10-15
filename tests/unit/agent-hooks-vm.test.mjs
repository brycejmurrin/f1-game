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

/* A stepped in-session switch drops the old world (dropTrackWorld: track = null)
 * and builds the new one over many rAF frames. race() + go() in one breath (the
 * gfx-probe shape) forces state "race" over that null window, and tickBody used
 * to run update() → checkRetirements → `track.total` of null every frame: 8 such
 * frames and LoopHealth stopped the loop for good (bug hunt 3 K1/X2/X3). Own
 * handle: the browser's stepped build needs a non-VM user agent, and render()
 * needs the GLX stub to return frustum planes, neither of which the shared page
 * above should inherit. */
test("a stepped race switch under go() keeps the loop alive and step() safe while the world is null", async () => {
  const h = await createGame({ track: "monza" });
  try {
    const P = Array.from({ length: 6 }, () => [0, 0, 0, 1]);
    h.ctx.GLX.makeFrustumPlanes = () => P;
    Object.defineProperty(h.sandbox.navigator, "userAgent", { value: "Mozilla/5.0 Chrome/128.0", configurable: true });
    const A = h.apex, LH = h.ctx.LoopHealth;
    let now = h.sandbox.performance.now();
    const frame = async () => { now += 16.7; h.pumpFrame(now); h.flushTimers(true); await new Promise((r) => setImmediate(r)); };
    A.go(); A.jump(0.05, 60, 0);
    for (let i = 0; i < 5; i++) await frame();
    const f0 = LH.state().faults;
    let done = null, nullFrames = 0, stepThrew = null;
    Promise.resolve(A.race("spa")).then(() => { done = "ok"; }, (e) => { done = "rej " + e.message; });
    A.go();                                    // forces state "race" while the start is in flight
    for (let k = 0; k < 3000 && !done; k++) {
      if (!h.G.track && h.G.state === "race") {
        nullFrames++;
        if (stepThrew === null) { try { A.step(1 / 60, 1); stepThrew = false; } catch (e) { stepThrew = e.message; } }
      }
      await frame();
    }
    assert.equal(done, "ok", "the switch reaches the grid");
    gt(nullFrames, 0, "the switch really spanned frames with no world (else this test proves nothing)");
    assert.equal(stepThrew, false, "__apex.step() with no world is a no-op, not a TypeError");
    assert.equal(LH.state().faults, f0, "no frame faulted during the switch");
    assert.equal(LH.state().stopped, false);
    A.go(); A.jump(0.05, 60, 0);
    const s0 = h.G.player.s, frames0 = LH.state().frames;
    for (let i = 0; i < 60; i++) await frame();
    assert.equal(h.G.track.def.id, "spa");
    gt(h.G.player.s - s0, 10, "the loop still drives the car after the switch");
    assert.equal(LH.state().frames - frames0, 60, "every frame finished clean");
    assert.equal(LH.state().faults, f0);
  } finally { h.close(); }
});

/* jump() under updateCarAdvance's 20 m teleport threshold (the browser's pole
 * at Monza sits 14 m behind the line, and a rAF frame has already stamped
 * _prevS before the spec's jump(0)): with _prevS left at the old s the next step
 * banked the 14 m into prog a second time and crossed the line, lap 0 → 1
 * (bug hunt 3 K2b; offtrack.spec "prog tracks s" measured |dProg − dS| = 14). */
test("a short jump() across the line is not banked twice and counts no lap", async () => {
  await load("monza", 0.05, 0);
  const L = g.G.track.total;
  g.apex.setPhysics({ drift: 0 });
  g.apex.jump((L - 14) / L, 0, 0);            // stand 14 m behind the line, like pole
  g.apex.step(1 / 60, 1);                     // one frame: _prevS = here
  g.apex.jump(0, 60, 0);                      // 14 m across the line
  const p0 = g.apex.physState();
  for (let i = 0; i < 120; i++) { g.apex.setInput({ steer: 0, throttle: true }); g.apex.step(1 / 60, 1); }
  const p1 = g.apex.physState();
  g.apex.clearInput();
  const dProg = p1.prog - p0.prog, dS = p1.s - p0.s;
  gt(dS, 50, "drove forward");
  lt(Math.abs(dProg - dS), 1e-6, `prog follows s exactly (dProg ${dProg}, dS ${dS})`);
  assert.equal(p1.lap, p0.lap, "a teleport across the line is not a lap");
});

 test("world rejects invalid horizons before changing its delta sequence", async () => {
  await load();
  const a = g.apex.world({ detail: "full" });
  for (const horizonS of [NaN, Infinity, "abc", null, 0, -1])
    assert.equal(g.apex.world({ detail: "full", horizonS }).error, "BadArgumentError");
  assert.equal(g.apex.world({ detail: "full" }).seq, a.seq + 1);
});
 test("rivals across the line keep nearby road gaps with differing standings", async () => {
  await load();
  const p = g.G.player, L = g.G.track.total, c = g.G.cars.find(c => !c.isPlayer);
  const id = c.id != null ? c.id : g.G.cars.indexOf(c);
  for (const ahead of [true, false]) {
    p.lap = ahead ? 1 : 0; c.lap = ahead ? 0 : 1;
    p.s = ahead ? L - 5 : 5; c.s = ahead ? 5 : L - 5;
    p.prog = p.lap * L + p.s; c.prog = c.lap * L + c.s;
    const r = g.apex.world({ detail: "full" }).rivals.find(r => r.id === id);
    assert.equal(r.rel, ahead ? "ahead" : "behind"); assert.equal(r.gapM, 10);
  }
});
 test("aiPlace short line teleport does not count a lap; physical crossing does", async () => {
  await load("monza", .2, 0);
  const idx = g.G.cars.findIndex(c => !c.isPlayer), c = g.G.cars[idx], L = g.G.track.total;
  g.apex.aiPlace(idx, (L - 6) / L, 0, 0); g.apex.step(1 / 60);
  const lap = c.lap;
  g.apex.aiPlace(idx, 0, 0, 0); g.apex.step(1 / 60);
  assert.equal(c.lap, lap);
  g.apex.aiPlace(idx, (L - 1) / L, 60, 0); g.apex.step(.1);
  assert.equal(c.lap, lap + 1);
});
 test("rollout restores input and world delta cache on sampling exceptions", async () => {
  await load();
  const input = { steer: .1, throttle: true }; g.G._testInput = input;
  const a = g.apex.world({ detail: "brief" });
  const sample = g.ctx.Tracks.sample;
  g.ctx.Tracks.sample = () => { throw new Error("injected sample"); };
  try { assert.throws(() => g.apex.rollout({ seconds: .1, input: { brake: true } }), /injected sample/); }
  finally { g.ctx.Tracks.sample = sample; }
  assert.equal(g.G._testInput, input);
  assert.equal(g.apex.world({ detail: "brief" }).seq, a.seq + 1);
});

// #2172: world(), obs() and physState() read ONE slip budget (AgentView.slipBudget).
// world() used to estimate it from axEstSm / LONG_GRIP alone, which ignores the
// mods.braking pedal scaling player-forces bills, so with a strong-brake kit it
// reported more of the circle spent than obs()/physState() did.
test("world(), obs() and physState() report the same slip budget under hard braking with mods.braking > 1", async () => {
  await load("monza", 0.05, 80);
  const mods = g.G.player.mods;
  g.G.player.mods = Object.assign({}, mods, { braking: 1.4 });
  try {
    g.apex.setInput({ steer: 0, throttle: false, brake: true });
    g.apex.step(1 / 60, 20);
    const grip = g.apex.world().ego.grip, o = g.apex.obs(), p = g.apex.physState();
    gt(o.axFrac, 0.3, "the car is braking hard");
    assert.equal(o.axFrac, p.axFrac);
    assert.equal(o.slipFactor, p.slipFactor);
    assert.equal(grip.longUsedPct, Math.round(o.axFrac * 100), "world().ego.grip.longUsedPct");
    assert.ok(Math.abs(grip.slipFactor - o.slipFactor) < 0.006, `world slipFactor ${grip.slipFactor} vs obs ${o.slipFactor}`);
    assert.ok(Math.abs(o.slipFactor - Math.sqrt(1 - o.axFrac * o.axFrac)) < 0.002, "slipFactor is the whole-car circle of axFrac");
    // The driven axle's circle is a different quantity and keeps its own name.
    assert.equal(p.drivenSlip, +g.G.player.slipFactor.toFixed(3));
  } finally {
    g.G.player.mods = mods;
    g.apex.clearInput();
  }
});

// #2172: with no curated `turns`, world()/trackInfo() fall back to peakFracs —
// SMOOTHED curvature peaks, a different rule from __apex.corners()' raw peaks
// (agentview.js says so at peakFracs). Pin the fallback: it runs, it yields a
// sorted list of named corners, and it is not the raw-peak list.
test("a def without turns gets the smoothed-peak corner table, not __apex.corners()' raw peaks", async () => {
  const def = g.ctx.Tracks.LIST.find((t) => t.id === "imola");
  const turns = def.turns;
  assert.ok(Array.isArray(turns) && turns.length > 0, "imola ships a curated turn list");
  def.turns = undefined;
  try {
    await load("imola", 0.05, 60);
    const ti = g.apex.trackInfo();
    const fracs = ti.corners.map((c) => c.frac);
    gt(fracs.length, 5, "the fallback found the circuit's corners");
    lt(fracs.length, turns.length + 10);
    for (let i = 1; i < fracs.length; i++) gt(fracs[i], fracs[i - 1], "sorted, one corner per peak");
    for (const f of fracs) assert.ok(f >= 0 && f < 1, `frac ${f} in [0, 1)`);
    const raw = g.apex.corners();
    assert.notDeepEqual(JSON.parse(JSON.stringify(fracs)), JSON.parse(JSON.stringify(raw)),
      "peakFracs and corners() are documented as different rules");
  } finally {
    def.turns = turns;
  }
});
