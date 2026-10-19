/* dev-tools-vm.test.mjs — the JSON half of tests/specs/dev-tools.spec.js in the
 * Node VM. The results-panel, classification DOM and HUD-element shots stay in
 * tests/specs/dev-tools-dom.spec.js. Same assertions and thresholds; one boot
 * for the raced tests, a fresh boot for each pre-race test (the browser
 * reloads). 54 tests, matching the spec (tools/ci/twinned-specs.mjs).
 *
 * Run: node --test tests/unit/dev-tools-vm.test.mjs
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { createGame } = require("../../tools/lib/game-vm.cjs");

const closeTo = (r, e, d, m) => assert.ok(Math.abs(e - r) < Math.pow(10, -d) / 2, m || `${r} not within 10^-${d}/2 of ${e}`);

let g = null, cold = null;
before(async () => {
  g = await createGame({ storage: { trackId: "monza" } });
  cold = await createGame({ storage: { trackId: "monza" } });
});
after(() => { if (g) g.close(); if (cold) cold.close(); });

const A = () => g.apex;
async function load(track = "monza") { await g.race(track); }
async function parked(frac = 0.1, track = "monza") { await load(track); A().park(frac); }
async function virgin(fn, { race: racing = false } = {}) {
  // Catalog reads share one unraced boot. A call that races (or tt()) passes
  // {race: true} and gets its own, because the shared cold boot has to stay
  // pre-race for the later tests.
  if (!racing) return fn(cold.apex);
  const v = await createGame({ storage: { trackId: "monza" } });
  try { await fn(v.apex); }
  finally { v.close(); }
}

test("returns array with at least 20 circuits", async () => {
  await virgin((a) => {
    const list = a.tracks();
    assert.ok(Array.isArray(list));
    assert.ok(list.length >= 20);
  });
});

test("each entry has id, name, and sequential index", async () => {
  await virgin((a) => {
    const list = a.tracks();
    list.forEach((t, i) => {
      assert.equal(typeof t.id, "string");
      assert.equal(typeof t.name, "string");
      assert.equal(t.i, i);
    });
  });
});

test("bahrain is in the list", async () => {
  await virgin((a) => { assert.ok(a.tracks().some((t) => t.id === "bahrain")); });
});

test("returns at least 10 teams with engine field", async () => {
  await virgin((a) => {
    const list = a.teams();
    assert.ok(list.length >= 10);
    for (const t of list) {
      assert.equal(typeof t.id, "string");
      assert.equal(typeof t.engine, "string");
    }
  });
});

test("Mercedes team has engine 'Mercedes'", async () => {
  await virgin((a) => {
    const merc = a.teams().find((t) => t.id === "mercedes");
    assert.ok(merc);
    assert.equal(merc.engine, "Mercedes");
  });
});

test("loads a track by id and returns metadata", async () => {
  await virgin(async (a) => {
    const r = await a.race("spa");
    assert.equal(r.track, "spa");
    assert.equal(r.weather, "dry");
  }, { race: true });
});

test("returns false for unknown track id", async () => {
  await virgin(async (a) => { assert.equal(await a.race("notatrack"), false); }, { race: true });
});

test("race() with wet sets weather", async () => {
  await virgin(async (a) => {
    const r = await a.race("bahrain", "day", "wet");
    assert.equal(r.weather, "wet");
    assert.equal(a.weather(), "wet");
  }, { race: true });
});

test("transitions state to results", async () => {
  await parked(0.1);
  const r = A().finishRace();
  assert.notEqual(r, false);
  assert.equal(A().info().state, "results");
});

test("returns false when no race is loaded", async () => {
  await virgin((a) => { assert.equal(a.finishRace(), false); });
});

test("track is null before race loads", async () => {
  await virgin((a) => { assert.equal(a.info().track, null); });
});

test("returns track id and total after race starts", async () => {
  await load();
  const info = A().info();
  assert.equal(info.track, "monza");
  assert.ok(info.total > 0);
  assert.ok(info.n > 0);
});

test("state changes after finishRace()", async () => {
  await parked();
  A().finishRace();
  assert.equal(A().info().state, "results");
});

test("timeTrial and seasonMode are false in normal race", async () => {
  await load();
  const info = A().info();
  assert.equal(info.timeTrial, false);
  assert.equal(info.seasonMode, false);
});

test("tt() sets timeTrial:true", async () => {
  await virgin(async (a) => {
    await a.tt("monza");
    const info = a.info();
    assert.equal(info.timeTrial, true);
    assert.equal(info.track, "monza");
  }, { race: true });
});

test("returns current mode and available modes list", async () => {
  await load();
  const cam = A().camera();
  assert.equal(typeof cam.mode, "string");
  assert.ok(Array.isArray(cam.modes));
  assert.ok(cam.modes.includes("chase"));
  assert.ok(cam.modes.includes("cockpit"));
});

test("can switch to cockpit mode", async () => {
  await load();
  assert.equal(A().camera("cockpit").mode, "cockpit");
});

test("can switch back to chase mode", async () => {
  await load();
  A().camera("cockpit");
  assert.equal(A().camera("chase").mode, "chase");
});

test("returns false for unknown mode", async () => {
  await load();
  assert.equal(A().camera("unknown_mode"), false);
});

test("returns eye, tgt arrays and fov number", async () => {
  await parked();
  const s = A().camState();
  assert.ok(Array.isArray(s.eye));
  assert.equal(s.eye.length, 3);
  assert.ok(Array.isArray(s.tgt));
  assert.ok(Number.isFinite(s.fov), `s.fov must be a finite number`);
  assert.ok(s.fov > 0);
});

test("returns camMode, frozen, weather, state", async () => {
  await parked();
  const v = A().viewState();
  assert.equal(typeof v.camMode, "string");
  assert.equal(typeof v.frozen, "boolean");
  assert.equal(typeof v.weather, "string");
  assert.equal(typeof v.state, "string");
  assert.equal(typeof v.dbgCamActive, "boolean");
});

test("frozen is true after park()", async () => {
  await parked();
  assert.equal(A().viewState().frozen, true);
});

test("dbgCamActive is true after view({})", async () => {
  await parked();
  A().view({});
  assert.equal(A().viewState().dbgCamActive, true);
});

test("dbgCamActive is false after view('chase')", async () => {
  await parked();
  A().view({});
  A().view("chase");
  assert.equal(A().viewState().dbgCamActive, false);
});

test("returns current frozen state when called with no args", async () => {
  await parked();
  assert.equal(typeof A().freeze(), "boolean");
});

test("freeze(false) unfreezes; freeze(true) refreezes", async () => {
  await parked();
  assert.equal(A().freeze(), true);
  A().freeze(false);
  assert.equal(A().freeze(), false);
  A().freeze(true);
  assert.equal(A().freeze(), true);
});

test("returns true when HUD is visible during a race", async () => {
  await load();
  A().go();
  assert.equal(A().hud(), true);
});

test("hud(false) reports hidden", async () => {
  await load();
  A().go();
  assert.equal(A().hud(false), false);
});

test("hud(true) reports visible again", async () => {
  await load();
  A().go();
  A().hud(false);
  assert.equal(A().hud(true), true);
});

test("returns current weather string with no arg", async () => {
  await load();
  assert.ok(["dry", "wet"].includes(A().weather()));
});

test("setting 'wet' returns 'wet'", async () => {
  await load();
  assert.equal(A().weather("wet"), "wet");
  assert.equal(A().weather(), "wet");
});

test("toggling back to dry works", async () => {
  await load();
  A().weather("wet");
  assert.equal(A().weather("dry"), "dry");
});

test("returns x, angle, k, hw, speed, s after park()", async () => {
  await parked();
  const p = A().probe();
  assert.ok(p);
  for (const k of ["x", "angle", "k", "hw", "speed", "s"]) assert.ok(Number.isFinite(p[k]), `${k} must be a finite number`);
});

test("player is near centreline after park(0.1, 0)", async () => {
  await parked(0.1);
  assert.ok(Math.abs(A().probe().x) < 1);
});

test("returns required fields including lap and wrongWay", async () => {
  await parked();
  const ps = A().physState();
  assert.ok(ps);
  for (const k of ["s", "x", "speed", "lap", "rescueT"]) assert.ok(Number.isFinite(ps[k]), `${k} must be a finite number`);
  assert.equal(typeof ps.wrongWay, "boolean");
});

test("exposes combined-slip traction circle fields", async () => {
  await parked();
  const ps = A().physState();
  for (const k of ["axEstSm", "axFrac", "slipFactor"]) assert.ok(Number.isFinite(ps[k]), `${k} must be a finite number`);
  closeTo(ps.axFrac, 0, 1);
  closeTo(ps.slipFactor, 1, 1);
});

test("slipFactor drops when braking hard", async () => {
  await parked(0.2, "bahrain");
  A().jump(0.2, 70, 0);
  A().setInput({ throttle: false, brake: true });
  for (let i = 0; i < 30; i++) A().step(1 / 60);
  const ps = A().physState();
  assert.ok(ps.axFrac > 0);
  assert.ok(ps.slipFactor < 1);
  A().clearInput();
});

test("returns player car data when called with no index", async () => {
  await parked();
  const c = A().carAt();
  assert.ok(c);
  assert.equal(c.isPlayer, true);
  assert.ok(Number.isFinite(c.x), `c.x must be a finite number`);
  assert.ok(Number.isFinite(c.speed), `c.speed must be a finite number`);
  assert.equal(typeof c.wrongWay, "boolean");
});

test("carAt(0) returns first car in cars list", async () => {
  await parked();
  const c = A().carAt(0);
  assert.ok(c);
  assert.equal(c.id, 0);
});

test("carAt(999) returns null for out-of-range index", async () => {
  await parked();
  assert.equal(A().carAt(999), null);
});

test("finished field is false during a live race", async () => {
  await parked();
  assert.equal(A().carAt().finished, false);
});

test("returns array with at least 2 entries", async () => {
  await parked();
  const c = A().cars();
  assert.ok(Array.isArray(c));
  assert.ok(c.length >= 2);
});

test("exactly one car has p: true (the player)", async () => {
  await parked();
  assert.equal(A().cars().filter((x) => x.p).length, 1);
});

test("returns array of fractions for Monza", async () => {
  await parked();
  const c = A().corners();
  assert.ok(Array.isArray(c));
  assert.ok(c.length > 0);
  for (const f of c) { assert.ok(f >= 0); assert.ok(f < 1); }
});

test("returns world coords and tangent for fraction 0.5", async () => {
  await parked();
  const n = A().nodeAt(0.5);
  for (const k of ["x", "y", "z", "tx", "frac"]) assert.ok(Number.isFinite(n[k]), `${k} must be a finite number`);
});

test("returns barrier stats without NaN for Monza", async () => {
  await parked();
  const s = A().wallStats();
  assert.ok(s);
  assert.equal(s.anyNaN, false);
  assert.ok(s.minB > 0);
  assert.ok(s.n > 0);
});

test("repositions player car and returns physState", async () => {
  await load();
  A().go();
  A().jump(0.2, 60, 8);
  const result = A().resetPlayer();
  assert.notEqual(result, false);
  assert.ok(Number.isFinite(result.x), `result.x must be a finite number`);
  assert.ok(Math.abs(result.x) < 6);
});

test("returns empty object after clearing", async () => {
  await parked();
  A().meshToggle({ props: true });
  assert.equal(Object.keys(A().clearMeshes()).length, 0);
});

test("teleports player to the given lap fraction", async () => {
  await load();
  A().go();
  A().jump(0.75, 40, 0);
  const ps = A().physState();
  const total = A().info().total;
  assert.ok(ps.s > total * 0.7);
  assert.ok(ps.s < total * 0.8);
});

test("180° aim sets the car pointing backwards", async () => {
  await load();
  A().go();
  A().jump(0.2, 0, 0);
  const before = A().physState();
  A().aim(180);
  const after = A().physState();
  assert.ok(Math.abs(after.head - before.head) > 2.5);
});

test("single distance returns one reading", async () => {
  await parked();
  const s = A().scan(50);
  assert.ok(Number.isFinite(s.k), `s.k must be a finite number`);
  assert.ok(Number.isFinite(s.hw), `s.hw must be a finite number`);
});

test("array of distances returns one reading per entry", async () => {
  await parked();
  const r = A().scan([10, 30, 60, 100]);
  assert.ok(Array.isArray(r));
  assert.equal(r.length, 4);
});

test("setPhysics changes a param visible in tuning()", async () => {
  await parked();
  const before = A().tuning();
  A().setPhysics({ pace: 0.5 });
  const after = A().tuning();
  closeTo(after.pace, 0.5, 2);
  closeTo(after.wheelbase, before.wheelbase, 2);
});

test("setInput and clearInput work together", async () => {
  await load();
  A().go();
  A().setInput({ steer: 0.5, throttle: true, brake: false });
  A().step(1 / 60, 10);
  A().clearInput();
  const ps = A().physState();
  assert.ok(ps);
  assert.ok(Number.isFinite(ps.x));
});
