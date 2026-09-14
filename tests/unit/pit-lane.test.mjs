/* pit-lane.test.mjs — the pit lane's pure geometry, in a VM.
 *
 * The state machine and the measured pit loss are a browser concern
 * (tests/specs/pit-lane.spec.js). What is checkable here is the part that has to
 * be right on all 42 circuits before anything is driven:
 *
 *  - the window WRAPS the start/finish line, because that is where every
 *    circuit's pit straight is. A naive `s >= a && s <= b` is wrong for every
 *    lane in the game, and would silently put the entry three quarters of a lap
 *    from the exit;
 *  - the lane is measured in METRES, not as a fraction of the lap, so Spa's
 *    7 km lap does not get a pit lane twice Monaco's;
 *  - a short circuit cannot be swallowed by its own pit lane;
 *  - the lane touches NO geometry. `hw`, both boundaries and the road mesh come
 *    out of `zoneOf` untouched, and the zone carries no width or side at all.
 *    Two earlier cuts did carry them: one forced the pit-side boundary open and
 *    put it through Monaco's buildings (lap distance jumped 250 m when a car ran
 *    wide), the other fitted the lane to existing room and found 2.4 m at Monza
 *    — the scenery's pit WALL — i.e. no lane anywhere. The lane is a state now.
 *
 * Run: node --test tests/unit/pit-lane.test.mjs   (npm run test:tooling-fast)
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import { seedLog } from "../helpers/seed-log.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

function load() {
  const ctx = vm.createContext({ Math, console, Object, Array, Number, JSON, isFinite, Float32Array });
  seedLog(ctx);
  ctx.window = ctx;
  // Tracks is only reached at call time (hwAt), and none of the pure geometry
  // below touches it — a stub keeps the VM honest about that.
  ctx.Tracks = { sample: () => { throw new Error("pure geometry must not sample the track"); } };
  vm.runInContext(readFileSync(join(ROOT, "js/core/mat4.js"), "utf8"), ctx, { filename: "mat4.js" });
  vm.runInContext(readFileSync(join(ROOT, "js/race/pit-lane.js"), "utf8"), ctx, { filename: "pit-lane.js" });
  return vm.runInContext("PitLane", ctx);
}
const P = load();

/** A built-track stand-in: n nodes, a constant half-width, a chosen length. */
function fakeTrack({ total = 5386, n = 1346, hw = 7, runoff = 9, def = {} } = {}) {
  const t = { total, n, def, hw: new Float32Array(n), barL: new Float32Array(n), barR: new Float32Array(n) };
  for (let k = 0; k < n; k++) { t.hw[k] = hw; t.barL[k] = hw + runoff; t.barR[k] = hw + runoff; }
  return t;
}

test("the window wraps the start/finish line", () => {
  const t = fakeTrack({ total: 5386 });
  const z = P.zoneOf(t);
  assert.ok(z.sIn > z.sOut, "entry must be BEFORE the line (a high s) and exit after it (a low one)");
  assert.equal(z.sIn, 5386 - P.ENTRY_M, "the entry sits ENTRY_M before the line");
  assert.equal(z.sOut, P.EXIT_M, "the exit sits EXIT_M after it");
  // Inside: just before the line, on the line, just after it.
  for (const s of [5386 - 10, 0, 5, P.EXIT_M - 1]) {
    assert.ok(P.inWindow(z, s, t.total), `s=${s} should be inside the wrapped window`);
  }
  // Outside: the whole rest of the lap.
  for (const s of [P.EXIT_M + 1, 1000, 2700, 5386 - P.ENTRY_M - 1]) {
    assert.ok(!P.inWindow(z, s, t.total), `s=${s} should be outside the window`);
  }
});

test("throughM runs 0 at the entry to lenM at the exit, across the wrap", () => {
  const t = fakeTrack({ total: 5386 });
  const z = P.zoneOf(t);
  assert.equal(P.throughM(z, z.sIn, t.total), 0);
  assert.ok(Math.abs(P.throughM(z, 0, t.total) - P.ENTRY_M) < 1e-6, "the line itself is ENTRY_M into the lane");
  assert.ok(Math.abs(P.throughM(z, z.sOut, t.total) - z.lenM) < 1e-6, "the exit is the full lane length in");
  // The box is between the two, and before the line (real boxes are).
  const box = P.throughM(z, z.sBox, t.total);
  assert.ok(box > 0 && box < z.lenM, "the box must be inside the lane");
  assert.ok(box < P.ENTRY_M, "the box sits before the start/finish line");
});

test("the lane is the same LENGTH on a long circuit and a short one", () => {
  // The whole reason it is measured in metres. As a fraction of the lap, Spa's
  // lane would be twice Monaco's — a pit lane is a building, not a share of a
  // circuit.
  const spa = P.zoneOf(fakeTrack({ total: 7004 }));
  const monaco = P.zoneOf(fakeTrack({ total: 3337 }));
  assert.equal(spa.lenM, monaco.lenM, "lane length must not scale with lap length");
  assert.equal(spa.lenM, P.ENTRY_M + P.EXIT_M);
});

test("a short circuit is not swallowed by its own pit lane", () => {
  // A 900 m test oval would otherwise get a 450 m lane — half the lap spent
  // under the limiter, which is not a pit stop, it is a different game.
  const z = P.zoneOf(fakeTrack({ total: 900 }));
  assert.ok(z.lenM <= 900 / 3 + 1e-6, `the window must stay inside a third of the lap, got ${z.lenM}`);
  assert.ok(z.lenM > 0);
});

test("a street circuit gets the lower speed limit", () => {
  const open = P.zoneOf(fakeTrack({ def: {} }));
  const street = P.zoneOf(fakeTrack({ def: { street: true } }));
  assert.equal(open.limitFrac, P.LIMIT_FRAC, "80 km/h of the envelope on a permanent circuit");
  assert.equal(street.limitFrac, P.LIMIT_FRAC_STREET, "60 km/h on a street circuit — Monaco, Singapore, Melbourne, Zandvoort");
  assert.ok(street.limitFrac < open.limitFrac);
});

test("a circuit def can override every field, and none does yet", () => {
  const z = P.zoneOf(fakeTrack({ total: 5000, def: { pitZone: { entryM: 200, exitM: 50, boxM: 60, boxS: 3, limitFrac: 0.2 } } }));
  assert.equal(z.lenM, 250);
  assert.equal(z.boxS, 3);
  assert.equal(z.limitFrac, 0.2);
  assert.equal(P.throughM(z, z.sBox, 5000), 200 - 60, "boxM is measured back from the line");
});

test("zoneOf reads the track but never writes it", () => {
  // The lane is a STATE, not a place (js/race/pit-lane.js explains what that
  // cost and why). Nothing here may touch geometry: an earlier cut forced the
  // pit-side boundary open and put it through Monaco's buildings, jumping lap
  // distance 250 m when a car ran wide.
  const t = fakeTrack({ hw: 7, runoff: 9 });
  const hwBefore = Float32Array.from(t.hw);
  const rBefore = Float32Array.from(t.barR);
  const lBefore = Float32Array.from(t.barL);
  P.zoneOf(t);
  assert.deepEqual([...t.hw], [...hwBefore], "`hw` must not move — the racing line, the road mesh and the AI all read it");
  assert.deepEqual([...t.barR], [...rBefore], "no boundary may move");
  assert.deepEqual([...t.barL], [...lBefore]);
});

test("the zone carries no lateral geometry at all", () => {
  // The guard against quietly re-growing a lane in space. If a width or a side
  // ever comes back, it needs the barrier story that killed the first attempt.
  const z = P.zoneOf(fakeTrack({}));
  for (const k of ["laneW", "side", "room", "ok"]) {
    assert.equal(k in z, false, `zone.${k} is lateral geometry and must not exist`);
  }
});

test("the box is a LENGTH of lane, not a point", () => {
  // Without a tolerance the latch is a knife edge on `at >= boxAt`: a driver
  // braking onto the mark stops centimetres short, the stop never fires, and the
  // car sits stationary in the pits forever. Measured exactly that way.
  assert.ok(P.BOX_TOL >= 4, "a box shorter than a car is a trap, not a box");
  const z = P.zoneOf(fakeTrack({}));
  assert.ok(P.BOX_TOL < P.throughM(z, z.sBox, 5386),
    "the tolerance must not reach back past the lane entry");
});

test("the stop needs the car to be genuinely stopped, not merely slow", () => {
  // Blowing through the box at the pit limit must MISS the stop, exactly as it
  // would in the real thing. The threshold is a fraction of the envelope so it
  // rides OVERALL SPEED like the limiter.
  assert.ok(P.BOX_SPEED_FRAC > 0 && P.BOX_SPEED_FRAC < P.LIMIT_FRAC,
    "the box threshold must be well under the pit limit, or a car at the limit would 'stop'");
});
