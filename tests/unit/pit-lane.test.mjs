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
 *    out of `zoneOf` untouched, and the zone carries no WIDTH and no ROOM.
 *    Two earlier cuts did: one forced the pit-side boundary open and put it
 *    through Monaco's buildings (lap distance jumped 250 m when a car ran wide),
 *    the other fitted the lane to existing room and found 2.4 m at Monza — the
 *    scenery's pit WALL — i.e. no lane anywhere. The lane is a state now.
 *
 *    The zone DOES carry a `side` since the pit button was removed, and that is
 *    deliberate rather than a relapse. A side used only to read the DRIVER'S
 *    STEERING at the entry is not a lane in space: it moves no boundary, places
 *    nothing, and `inLane` is still a state and not a half-plane — which is the
 *    invariant that actually killed the first attempt, and the one asserted
 *    below. A `laneW` or a `room` would still be the relapse.
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
  // The pit complex model (TrackPit) is what PitLane reads its pitch and, on
  // a built track, its window and row from — loaded beside it, as the game does.
  vm.runInContext(readFileSync(join(ROOT, "js/track/core/pit.js"), "utf8"), ctx, { filename: "pit.js" });
  vm.runInContext(readFileSync(join(ROOT, "js/race/pit-lane.js"), "utf8"), ctx, { filename: "pit-lane.js" });
  return vm.runInContext("PitLane", ctx);
}
const P = load();
const TP = (() => {
  const ctx = vm.createContext({ Math, console, Object, Array, Number, JSON, isFinite, Float32Array });
  vm.runInContext(readFileSync(join(ROOT, "js/track/core/pit.js"), "utf8"), ctx, { filename: "pit.js" });
  return vm.runInContext("TrackPit", ctx);
})();

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

test("the zone carries no lane WIDTH and no ROOM — the two that killed cut one", () => {
  // The guard against quietly re-growing a lane in space. A width or a room
  // measurement is the relapse: the first needs the barrier story (it put
  // Monaco's boundary through the buildings), the second found 2.4 m at Monza
  // and therefore no lane anywhere.
  const z = P.zoneOf(fakeTrack({}));
  for (const k of ["laneW", "room", "ok"]) {
    assert.equal(k in z, false, `zone.${k} is lateral geometry and must not exist`);
  }
});

test("…but it DOES carry a side, and the side reads the driver rather than the road", () => {
  // Since the pit button was removed, a stop is called by steering in — so the
  // module has to know which way "in" is. That is not a lane in space, and this
  // is the pair of assertions that keeps the difference honest.
  const z = P.zoneOf(fakeTrack({}));
  assert.equal(z.side, P.PIT_SIDE, "+1 is where js/track/tracks.js puts the pit building");
  assert.equal(P.zoneOf(fakeTrack({ def: { pitZone: { side: -1 } } })).side, -1, "a circuit may say otherwise");
  assert.equal(P.zoneOf(fakeTrack({ def: { pitZone: { side: 7 } } })).side, P.PIT_SIDE, "and nonsense falls back");
  // The invariant that actually matters: inLane is a STATE. A half-plane test
  // is what made a beached car read as pitting and broke the auto-rescue.
  const src = readFileSync(join(ROOT, "js/race/pit-lane.js"), "utf8");
  const inLane = src.slice(src.indexOf("function inLane(c)"));
  assert.ok(/pitState === "lane"/.test(inLane.slice(0, 200)), "inLane stopped being a state");
  assert.ok(!/\.hw|_smp/.test(inLane.slice(0, 200)), "inLane grew a lateral test again");
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

// ── Committing to the stop, without a button ────────────────────────────────
// There is no pit control: you call a stop by holding the car on the pit side
// at the entry. The whole difficulty is telling that apart from a car that
// merely ran wide there — the exact failure the half-plane `inLane` had — so
// most of what follows is a way of NOT meaning it.

test("there is no pit control anywhere — the stop is a line you take", () => {
  const input = readFileSync(join(ROOT, "js/input/input.js"), "utf8");
  assert.ok(!/pitToggle|consumePitToggle|btn-pit/.test(input),
    "a pit control came back in the input layer");
  assert.ok(!/btn-pit/.test(readFileSync(join(ROOT, "index.html"), "utf8")),
    "the on-screen PIT button came back");
  assert.ok(!/"pit"|'pit'/.test(input), "a PIT keybind or gamepad bind came back");
});

test("the commitment gesture is deliberate to make and still possible to make", () => {
  assert.ok(P.COMMIT_S >= 0.3, "a shorter hold than this is a wobble, not a decision");
  assert.ok(P.COMMIT_S <= 1.2, "a longer one and the entry is gone before you have committed");
  assert.ok(P.LANE_W >= 2.5, "a lane narrower than a car is not a lane");
  assert.ok(P.LANE_W < 7, "the lane must not swallow the racing surface it sits beside");
  const z = P.zoneOf(fakeTrack({}));
  assert.ok(P.COMMIT_M < z.lenM, "the entry road must be shorter than the whole window");
  assert.ok(P.COMMIT_M < P.throughM(z, z.sBox, 5386),
    "committing AT the box is too late to have driven in");
});

// A live session whose track samples a constant half-width. `committing` is the
// ONE place this module samples the track, so a counting stub proves that too.
function commitSession({ hw = 7, vTop = 60, total = 5386 } = {}) {
  const ctx = vm.createContext({ Math, console, Object, Array, Number, JSON, isFinite, Float32Array });
  seedLog(ctx);
  ctx.window = ctx;
  let samples = 0;
  ctx.Tracks = { sample: (t, s2, out) => { samples++; out.hw = hw; return out; } };
  // Committing picks the set the crew will fit, which reaches both of these at
  // call time. Minimal stubs: the choice itself is tyre-model.test.mjs's job.
  ctx.TyreModel = { treadFor: () => 0, classForTread: () => null, lifeLaps: () => 30,
                    AI_CLASS: { medium: { life: 0.74 } } };
  ctx.Parts = { CATALOG: [{ id: "tyres", options: [{ id: "medium", cost: 0 }] }] };
  // The AI's planner, for think(): the plan fires on its lap and not before.
  ctx.AiDrive = { pitNow: (x) => (x.wrongTread ? "weather" : x.wear >= 1 ? "worn" : x.lapsToStop <= 0 && x.stopsLeft > 0 ? "plan" : ""),
                  compoundFor: () => "medium", STRAT: { CAUTION_REACH: 6 } };
  // The garage row order. Real Teams.LIST is 12 entries; the count is what sets
  // how wide the row is, so the stub carries the same number rather than a
  // convenient few — a row that fits at 4 teams and not at 12 is the bug.
  ctx.Teams = { LIST: ["mercedes", "ferrari", "mclaren", "redbull", "alpine",
                       "racingbulls", "haas", "williams", "audi", "astonmartin",
                       "cadillac", "custom"].map((id) => ({ id })) };
  vm.runInContext(readFileSync(join(ROOT, "js/core/mat4.js"), "utf8"), ctx, { filename: "mat4.js" });
  vm.runInContext(readFileSync(join(ROOT, "js/race/pit-lane.js"), "utf8"), ctx, { filename: "pit-lane.js" });
  const Pl = vm.runInContext("PitLane", ctx);
  const track = { total, n: 1346, def: {} };
  const said = [];
  const G = {
    track, vTop: () => vTop, lapsTarget: 25, raceWeather: "dry",
    announce: (m) => said.push(m),
    // spent() reads the CAR, not a constant: the cue's whole job is to stay
    // quiet on a fresh set and speak on a used one, and a stub that always
    // says 0 would let a broken cue pass every test below.
    tyres: { on: () => true, spent: (car) => (car && car.tyreWear) || 0, fit: () => {},
             classRecord: () => ({ id: "m", code: "M", life: 0.74, tread: 0 }),
             optionRecord: () => ({ id: "m", code: "M", life: 0.74, tread: 0 }),
             // How long a set lasts AT THE SETTING IN FORCE — what a strategy
             // plans against. The stub stands in for TyreModel's own, which
             // divides the nominal life by LEVELS[level]; this fixture runs at
             // `real` (1.0), so nominal is the right answer here.
             planLaps: (life, lapsTarget) => Math.max(4, (life || 0.88) * Math.max(1, lapsTarget || 1)) },
    cautionInfo: () => ({ level: 0 }),
    cars: [], ranked: [],
  };
  const pits = Pl.create(G);
  const zone = Pl.zoneOf(track);
  // A car in the entry, on the pit side, at racing speed — i.e. committing.
  const car = (over) => ({
    local: true, human: true, speed: 40, lap: 3, s: zone.sIn + 20,
    x: hw * over * zone.side, offroad: false, wrongWay: false, rescueT: 0,
    tyre: { code: "M", tread: 0 }, pitState: "none",
  });
  return { Pl, pits, zone, car, said, hw, G, samples: () => samples };
}

test("holding the line into the pits calls the stop", () => {
  const { pits, car, said } = commitSession();
  const c = car(0.9);
  // One tick short of the dwell: not yet committed. A pit stop must not be
  // something you fall into halfway through a corner-exit drift.
  pits.update(c, P.COMMIT_S * 0.8);
  assert.equal(!!c.pitArmed, false, "committed before the dwell elapsed");
  pits.update(c, P.COMMIT_S * 0.4);
  assert.equal(c.pitArmed, true, "holding the line did not call the stop");
  assert.equal(c.pitState, "lane", "the limiter must come on the same tick");
  assert.ok(said.some((m) => /LIMITER ON/.test(m)),
    `with no button to press, the limiter needs saying: ${said.join(" | ")}`);
});

test("a car that merely RUNS WIDE at the entry does not get pitted", () => {
  // The failure that killed the half-plane test, refused three ways over.
  const { pits, car } = commitSession();
  // 1. Not far enough over — a drift, not a line.
  const drift = car(P.COMMIT_FRAC - 0.15);
  for (let i = 0; i < 20; i++) pits.update(drift, 0.1);
  assert.equal(!!drift.pitArmed, false, "a drift toward the pit wall called a stop");
  // 2. Far enough, but not HELD — the dwell resets the moment the car comes back.
  const wobble = car(0.9);
  pits.update(wobble, P.COMMIT_S * 0.8);
  wobble.x = 0;
  pits.update(wobble, P.COMMIT_S * 0.8);
  assert.equal(!!wobble.pitArmed, false, "a transient run-wide called a stop");
  wobble.x = 0.9 * 7;
  pits.update(wobble, P.COMMIT_S * 0.8);
  assert.equal(!!wobble.pitArmed, false, "the dwell did not restart after the car came back");
  // 3. On the WRONG side. Running wide left is not a pit entry.
  const other = car(0.9); other.x = -other.x;
  for (let i = 0; i < 20; i++) pits.update(other, 0.1);
  assert.equal(!!other.pitArmed, false, "running wide away from the pits called a stop");
});

test("a spun, beached, reversing or parked car commits to nothing", () => {
  // The beached-car case from the module header, refused by construction: it is
  // what broke the auto-rescue when `inLane` was a half-plane.
  const { pits, car } = commitSession();
  for (const [name, over] of [["offroad", { offroad: true }], ["wrongWay", { wrongWay: true }],
                              ["rescuing", { rescueT: 2 }], ["parked", { speed: 0 }],
                              ["crawling", { speed: 3 }]]) {
    const c = Object.assign(car(0.95), over);
    for (let i = 0; i < 20; i++) pits.update(c, 0.1);
    assert.equal(!!c.pitArmed, false, `a ${name} car called a pit stop`);
  }
});

test("you can commit anywhere UP TO YOUR OWN BOX — the grid included", () => {
  // The rule used to be "the first COMMIT_M metres only": past the entry road
  // you were deemed to be racing the straight. That made a stop from a STANDING
  // START impossible, because the grid sits inside the window — TrackMesh puts
  // pole GRID_POLE_M before the line, so on any circuit whose entry runs longer
  // than that every car begins past the entry road. The bound is now your own
  // box, which is the only place the commitment has anything to mean.
  const { pits, zone, car } = commitSession();
  const L = 5386;
  const wrap = (v) => ((v % L) + L) % L;
  const boxAt = pits.boxThroughFor(car(0.95));

  // 1. Mid-window, well past the old entry road, with lane left in front.
  const mid = car(0.95);
  mid.s = wrap(zone.sIn + P.COMMIT_M + 30);
  for (let i = 0; i < 20; i++) pits.update(mid, 0.1);
  assert.equal(mid.pitArmed, true, "holding the line mid-window did not call the stop");

  // 2. From POLE. This is the case the old rule refused outright, and the one
  //    the anchoring in boxThroughFor exists to make reachable.
  const pole = car(0.95);
  pole.s = wrap(-P.GRID_POLE_M);
  const poleAt = P.throughM(zone, pole.s, L);
  assert.ok(poleAt > P.COMMIT_M,
    `the fixture must put the grid past the OLD entry road or this proves nothing (${poleAt})`);
  assert.ok(boxAt - poleAt >= P.COMMIT_CLEAR,
    `pole must have a commitment's run-up to its box: box ${boxAt}, pole ${poleAt}`);
  for (let i = 0; i < 20; i++) pits.update(pole, 0.1);
  assert.equal(pole.pitArmed, true, "a car on pole could not call a stop on lap 1");

  // 3. Past your own box there is nothing left to commit TO, so it is refused —
  //    and that refusal is what still keeps a car racing the straight out of the
  //    lane, together with the three guards above (far over the line, HELD, and
  //    moving forwards on the road), which this change did not touch.
  const late = car(0.95);
  late.s = wrap(zone.sIn + boxAt + 5);
  for (let i = 0; i < 20; i++) pits.update(late, 0.1);
  assert.equal(!!late.pitArmed, false, "a car already past its own box called a stop");
});

test("the box row sits as far forward as the window can hold it", () => {
  // What the user-visible ask reduces to: start further BACK on the grid and you
  // must still be able to call a stop on lap 1. The back of a 22-car grid is
  // GRID_POLE_M + 21 * 8 m before the line, which is the deepest any car starts
  // inside the window; every team's box has to be reachable from there.
  const { pits, zone, car } = commitSession();
  const L = 5386;
  const wrap = (v) => ((v % L) + L) % L;
  const backAt = P.throughM(zone, wrap(-(P.GRID_POLE_M + 21 * 8)), L);
  for (const t of ["mercedes", "haas", "custom"]) {
    const c = car(0.95); c.team = t;
    const boxAt = pits.boxThroughFor(c);
    assert.ok(boxAt - backAt >= P.COMMIT_CLEAR,
      `${t}'s box is unreachable from the back of the grid: box ${boxAt}, car ${backAt}`);
    assert.ok(boxAt <= zone.lenM - 20, `${t}'s box spilled out of the window: ${boxAt}`);
  }
});

test("only the LOCAL player steers itself in — the AI has a plan, a rival has an owner", () => {
  const { pits, car } = commitSession();
  for (const who of [{ local: false, human: false }, { local: false, human: true }]) {
    const c = Object.assign(car(0.95), who);
    for (let i = 0; i < 20; i++) pits.update(c, 0.1);
    assert.equal(!!c.pitArmed, false, "a non-local car steered itself into a stop");
  }
});

test("the spline is sampled only where a lateral answer is needed, and reads only hw", () => {
  // TWO places now ask where the car is across the road — the commitment test
  // and the box — and both are behind cheap rejections, so a car that is merely
  // in the window pays nothing. `hw` is still the only field read: the moment
  // this needs a boundary or a runoff it has become the lane in space that
  // killed cut one.
  const { pits, car, samples } = commitSession();
  const parked = Object.assign(car(0.95), { speed: 0 });
  for (let i = 0; i < 10; i++) pits.update(parked, 0.1);
  assert.equal(samples(), 0, "the cheap rejections must come before the spline sample");
  const c = car(0.95);
  pits.update(c, 0.1);
  assert.ok(samples() > 0, "a committing car must actually measure the road width");
});

test("info() reports the dwell, so a HUD can show the commitment filling", () => {
  // With no button there is no pressed state to draw; this is what replaces it.
  const { pits, car } = commitSession();
  const c = car(0.95);
  assert.equal(pits.info(c).commit, 0);
  pits.update(c, P.COMMIT_S * 0.5);
  const half = pits.info(c).commit;
  assert.ok(half > 0.3 && half < 0.8, `the dwell should read about half way, got ${half}`);
  assert.equal(pits.info(c).side, P.PIT_SIDE);
});

// ── The cue ─────────────────────────────────────────────────────────────────
// Removing the button made a stop a GESTURE, and a gesture nobody can see is
// not a control: the lane it asks you to aim at is 450 m of arc with nothing
// drawn on it. So the cue is load-bearing, and the thing it must get right is
// not "appear" but WHEN NOT TO — a PIT prompt on every lap is wallpaper, and a
// driver stops reading wallpaper.

test("the cue stays QUIET on a fresh set — it is not a permanent PIT sign", () => {
  const { pits, zone, car } = commitSession();
  const c = car(0);                       // on the racing line, not committing
  c.s = zone.sIn - 300;                   // approaching the window
  c.pitState = "none";
  assert.equal(pits.cue(c), null, "a car on a fresh set was told to box");
});

test("…and speaks once the set is used, counting the entry down in metres", () => {
  const { pits, zone, car, Pl } = commitSession();
  const c = car(0);
  c.s = zone.sIn - 300;
  c.tyreWear = 0.9;
  const cue = pits.cue(c);
  assert.ok(cue, "a used set got no cue at all");
  assert.equal(cue.phase, "near");
  assert.match(cue.text, /^PIT \d+m$/, `expected a metre countdown, got ${cue.text}`);
  assert.ok(cue.dist > 250 && cue.dist < 350, `countdown should be ~300 m, got ${cue.dist}`);
});

test("it says what to DO at the entry, and only while the entry road lasts", () => {
  // It used to read "PIT ENTRY", which names a place and assumes you already
  // know the gesture — and the gesture is the one thing nobody can guess,
  // because removing the button left nothing to find. The cue has to carry the
  // instruction instead.
  const { pits, zone, car, Pl } = commitSession();
  const c = car(0);
  c.tyreWear = 0.9;
  c.s = zone.sIn + 20;                    // inside the entry road
  assert.equal(pits.cue(c).phase, "enter");
  assert.match(pits.cue(c).text, /LANE/, "the entry cue must say what to do, not just where you are");
  c.s = zone.sIn + Pl.COMMIT_M + 60;      // past it, racing the straight
  assert.equal(pits.cue(c), null, "the cue outlived the entry road it points at");
});

test("it follows the car through the stop: armed, lane, box, then silence", () => {
  const { pits, zone, car } = commitSession();
  const c = car(0);
  c.tyreWear = 0.9; c.s = zone.sIn + 20;
  c.pitArmed = true;
  assert.equal(pits.cue(c).phase, "armed");
  c.pitArmed = false; c.pitState = "lane";
  const lane = pits.cue(c);
  assert.equal(lane.phase, "lane");
  assert.match(lane.text, /LIMIT/, "the lane phase must show the limit the driver is being held to");
  c.pitState = "box";
  assert.equal(pits.cue(c).phase, "box");
  c.pitState = "out";
  assert.match(pits.cue(c).text, /^EXIT \d+m$/, "the exit road used to be silence");
  c.pitState = "none"; c.tyreWear = 0;
  assert.equal(pits.cue(c), null, "the cue kept talking after the stop was served");
});

test("the exit road speaks: GO after the release, MERGE while a car is closing, else the metres to the end", () => {
  // The exit is where a serviced car rejoins at the limit into traffic at
  // racing speed, and the cue returned null for the whole of it.
  const { pits, zone, car, G } = commitSession();
  const c = car(0);
  c.tyreWear = 0.9; c.s = zone.sIn + 60; c.prog = 3000; c.speed = 20;
  c.pitState = "box"; c.pitT = 0.01;
  pits.update(c, 0.02);
  assert.equal(c.pitState, "out", "the hold did not release");
  assert.equal(pits.cue(c).phase, "served");
  assert.equal(pits.cue(c).text, "GO GO GO");
  pits.update(c, pits.servedS + 0.1);
  assert.notEqual(pits.cue(c).phase, "served", "GO GO GO must not outlive the release");
  const rival = { code: "VER", prog: c.prog - 60 * 2, speed: 60, pitState: "none" };   // 2 s back, closing
  G.cars = [c, rival];
  assert.equal(pits.cue(c).phase, "merge");
  assert.match(pits.cue(c).text, /MERGE — VER/, "the closing car must be NAMED");
  rival.prog = c.prog - 60 * 4;                                                       // 4 s back: not yet
  const out = pits.cue(c);
  assert.equal(out.phase, "out");
  assert.match(out.text, /^EXIT \d+m$/);
  assert.ok(out.dist > 0 && out.dist < zone.lenM, `the exit metres must be inside the lane: ${out.dist}`);
  assert.ok(out.frac >= 0 && out.frac <= 1, `the bar fill must be a fraction: ${out.frac}`);
  rival.prog = c.prog - 60 * 2; rival.pitState = "lane";                               // a car in the lane is no threat
  assert.equal(pits.cue(c).phase, "out");
});

test("the release says what the stop cost: the time held, the place you come out in, the places it cost", () => {
  const { pits, zone, car, G, said } = commitSession();
  const c = car(0), a = { prog: 1 }, b = { prog: 2 };
  c.tyreWear = 0.9; c.s = zone.sIn + 60;
  G.ranked = [c, a, b];
  pits.arm(c, true);                          // called from P1
  G.ranked = [a, b, c];                       // two cars went by while it was held
  c.pitState = "box"; c.pitT = 0.01;
  pits.update(c, 0.02);
  const line = said.find((m) => /^STOP /.test(m));
  assert.ok(line, `no stop summary in: ${said.join(" | ")}`);
  assert.match(line, /^STOP \d+\.\ds — P3, -2 PLACES$/);
  assert.ok(!said.some((m) => /TYRES ON/.test(m)), "GO GO GO at the START of the hold was a lie for the whole of it");
});

test("the armed cue names the compound the crew will fit", () => {
  const { pits, zone, car } = commitSession();
  const c = car(0);
  c.tyreWear = 0.9; c.s = zone.sIn + 20; c.pitArmed = true;
  c.pitNext = { code: "S" };
  assert.equal(pits.cue(c).text, "STAY IN LANE · BOX BOX — S");
  c.pitNext = null;
  assert.match(pits.cue(c).text, /^STAY IN LANE · BOX BOX — [A-Z]+$/, "with no choice made, the crew's own pick is named");
  // …and a stop that IS called is shown, whatever the wear gate thinks.
  c.tyreWear = 0;
  assert.equal(pits.cue(c).phase, "armed");
});

test("the first stop is taught in three lines — the road, the line, the gate — each once", () => {
  const { pits, zone, car, said, hw } = commitSession();
  const c = car(0);
  c.tyreWear = 0.9; c.s = zone.sIn + 20;
  pits.cue(c); pits.cue(c);
  assert.equal(said.filter((m) => /TAKE THE PIT ROAD/.test(m)).length, 1);
  c.pitState = "lane";                        // far from the box: the lane phase
  pits.cue(c); pits.cue(c);
  assert.equal(said.filter((m) => /STOP AT YOUR CREST/.test(m)).length, 1);
  const boxAt = pits.boxThroughFor(c);
  // Inside MOVE_M, which is where the gate line belongs: further out the cue is
  // still counting the box down and the driver is right to hold the fast lane.
  c.s = ((zone.sIn + boxAt - 20) % 5386 + 5386) % 5386;
  c.x = pits.laneCentre(hw, zone.side, c.s); c.speed = 6;
  assert.equal(pits.cue(c).phase, "near-box");
  pits.cue(c);
  assert.equal(said.filter((m) => /GLOWING GATE/.test(m)).length, 1);
});

test("worthStopping IS the cue's gate: the minimap's marker and the HUD's words read one function", () => {
  // The map paints its "P" in --you from PitLane.worthStopping and the HUD
  // paints the cue from PitLane.cue; if the two gates ever drifted, the map
  // would say "box" while the cue stayed quiet (or the reverse). So: for every
  // (wear, tread, caution) triple a car inside CUE_M can be in, one speaks
  // exactly when the other does — and the map's reach is the cue's.
  const { pits, zone, car, G } = commitSession();
  assert.equal(pits.cueM, 550, "the map's arc must start where the cue's countdown does");
  const c = car(0);
  c.pitState = "none"; c.s = zone.sIn - 300;
  let cases = 0, worth = 0;
  for (const wear of [0, 0.2, 0.35, 0.55, 0.9]) {
    for (const tread of [0, 1]) {
      for (const level of [0, 1, 2, 3, 4]) {
        c.tyreWear = wear; c.tyre = { code: "M", tread };
        G.cautionInfo = () => ({ level });
        const w = pits.worthStopping(c), q = pits.cue(c) != null;
        assert.equal(q, w, `wear ${wear}, tread ${tread}, caution ${level}: cue ${q} but worthStopping ${w}`);
        cases++; if (w) worth++;
      }
    }
  }
  assert.ok(worth > 0 && worth < cases, `the gate must open for some triples and not others (${worth}/${cases})`);
  // Each fact opens it alone: a used set, the wrong tread, a cheap stop under caution.
  G.cautionInfo = () => ({ level: 0 });
  c.tyreWear = 0.55; c.tyre = { code: "M", tread: 0 };
  assert.ok(pits.worthStopping(c), "a set at the wear threshold is worth a stop");
  c.tyreWear = 0; c.tyre = { code: "I", tread: 1 };
  assert.ok(pits.worthStopping(c), "an intermediate in the dry is worth a stop at any wear");
  c.tyre = { code: "M", tread: 0 }; c.tyreWear = 0.35; G.cautionInfo = () => ({ level: 2 });
  assert.ok(pits.worthStopping(c), "a part-used set under a safety car is a cheap stop");
  c.tyreWear = 0.2;
  assert.equal(pits.worthStopping(c), false, "…but not a nearly fresh one");
});

test("a fresh slick in the dry has nothing to say, used or not", () => {
  const { pits, zone, car } = commitSession();
  const c = car(0);
  c.s = zone.sIn - 200; c.tyreWear = 0;
  assert.equal(pits.cue(c), null, "dry weather, fresh slick: nothing to say");
  // …and the threshold is a real one, not "anything above zero".
  c.tyreWear = 0.2;
  assert.equal(pits.cue(c), null, "a barely-used set is not a reason to box");
});

test("only the LOCAL player gets a cue — nobody else has a HUD", () => {
  const { pits, zone, car } = commitSession();
  for (const who of [{ local: false, human: false }, { local: false, human: true }]) {
    const c = Object.assign(car(0), who);
    c.tyreWear = 0.9; c.s = zone.sIn - 200;
    assert.equal(pits.cue(c), null, "a non-local car was given a pit cue");
  }
});

test("the arrow has a side to point at, and it is the side you must steer to", () => {
  // The arrow IS the instruction — it is the only thing telling a driver which
  // way the lane they cannot see is.
  const { pits, zone, car, Pl } = commitSession();
  const c = car(0);
  assert.equal(pits.info(c).side, Pl.PIT_SIDE);
  assert.ok(Pl.PIT_SIDE === 1 || Pl.PIT_SIDE === -1, "the side must be a direction, not a magnitude");
});

// ── The painted lane and the modelled lane are the SAME line ────────────────

test("LANE_W agrees across the model and all three lit shaders", () => {
  // The lane is PAINTED, not built, so the stripe a driver steers at and the
  // boundary the commitment test uses live in four different files and four
  // different languages. If they drift, the game asks you to aim at a line that
  // is not where the model thinks it is — the worst kind of bug, because it
  // looks like bad driving. There is no shared constant to import across GLSL,
  // WGSL and TSL, so this is the thing that holds them together.
  const FILES = [
    "js/render/glx/shaders/glsl-lit.js",
    "js/render/webgpu/wgsl-chunks.js",
    "js/render/three/tsl-lit.js",
  ];
  // All THREE numbers, not just the width: the lane narrows on a tight circuit
  // (PitLane.laneWidth), so a backend that kept the flat width would paint the
  // stripe somewhere the model does not think the lane is.
  const WANT = { PIT_LANE_W: P.LANE_W, PIT_LANE_MIN: P.LANE_MIN, PIT_MIN_RACING: P.MIN_RACING };
  for (const file of FILES) {
    const src = readFileSync(join(ROOT, file), "utf8");
    for (const [name, want] of Object.entries(WANT)) {
      const m = src.match(new RegExp(`${name}\\s*[:=]\\s*(?:f32\\s*\\(\\s*)?([0-9.]+)`));
      assert.ok(m, `${file} has no ${name} — the lane is mis-painted on this backend`);
      assert.equal(Number(m[1]), want,
        `${file} has ${name} = ${m[1]} but PitLane says ${want} — a driver steering at the `
        + "stripe would miss the lane the model checks");
    }
  }
});

test("the lane yields to the racing surface, and only where it has to", () => {
  // Measured across all 51 built circuits: pit-window half-width runs 4.93 m
  // (Monaco) to 8.0 m. A flat 3.2 m lane leaves Monaco 6.7 m to race on — on
  // the one circuit where overtaking is already impossible.
  const road = (hw) => 2 * hw;
  const left = (hw) => road(hw) - P.laneWidth(hw);
  assert.ok(left(4.93) >= P.MIN_RACING - 1e-9, `Monaco keeps only ${left(4.93).toFixed(1)} m to race on`);
  assert.ok(P.laneWidth(4.93) < P.LANE_W, "Monaco's lane must narrow");
  // …and nowhere else. The next-narrowest circuits measured 6.0 m half-width.
  for (const hw of [6.0, 6.1, 7.0, 8.0]) {
    assert.equal(P.laneWidth(hw), P.LANE_W, `hw ${hw} should keep the full lane`);
    assert.ok(left(hw) > P.MIN_RACING, `hw ${hw} must keep more than the floor`);
  }
  // A pathologically narrow road still gets a lane a car can fit in.
  assert.equal(P.laneWidth(3), P.LANE_MIN);
  assert.ok(P.LANE_MIN > 2.0, "an F1 car is 2.0 m wide — the lane must exceed it");
});

test("the lane sits INSIDE the road, and the box sits inside the lane", () => {
  const hw = 7, side = P.PIT_SIDE;
  const edge = P.zoneOf(fakeTrack({})) && null;   // zone not needed; geometry is pure
  const S = commitSession({ hw });
  const e = S.pits.laneEdge(hw, side), c = S.pits.laneCentre(hw, side);
  assert.ok(Math.abs(e) < hw, "the painted line must be ON the road, not past its edge");
  assert.ok(Math.abs(c) < hw, "the lane centre must be on tarmac — that is what keeps the car off the grass");
  assert.ok(Math.abs(c) > Math.abs(e), "the lane centre is further out than its inner edge");
  assert.ok(Math.abs(hw - Math.abs(c)) > 1, "the lane centre must not sit on the outside edge line");
  assert.equal(Math.sign(e), side, "the lane is on the pit side");
});

// ── The lane is a PLACE to stop, not only a state ───────────────────────────
// The module header's KNOWN GAP, closed: a car held in the box used to sit on
// the racing line, because there was nowhere to put it. Painting the lane made
// somewhere. These pin the two halves of that — the AI is steered into it, and
// the box will not latch outside it — and, just as importantly, that neither
// half reached back into the geometry the two earlier cuts died on.

test("a car serving a stop is steered to the lane, and nobody else is", () => {
  const { pits, hw } = commitSession();
  const side = P.PIT_SIDE;
  const racing = { pitState: "none", x: 0 };
  assert.equal(pits.laneX(racing, hw, 1.5), 1.5, "a racing car's line was overridden");
  assert.equal(pits.laneX({ pitState: "out", x: 0 }, hw, -2), -2,
    "a serviced car must rejoin the racing line, not hold the lane to the exit");
  for (const st of ["lane", "box"]) {
    const c = { pitState: st, x: 0 };
    assert.equal(pits.laneX(c, hw, 1.5), pits.laneCentre(hw, side),
      `a car in state ${st} was not put in the lane`);
  }
  // The override is total, and that is the point: no bias, defence or
  // hold-line may pull a limited car back across the painted line.
  assert.equal(pits.laneX({ pitState: "lane", x: 0 }, hw, -(hw - 0.5)),
    pits.laneCentre(hw, side), "a bias toward the far side survived the override");
});

test("the box will not latch on the racing line", () => {
  // The visible half of the old gap. A car stopped on the line has not reached
  // its box — the crew is not standing there — so the stop does not happen.
  const mk = (place) => {
    const { pits, zone, hw } = commitSession();
    // AT ITS OWN BOX. zone.sBox is only the row's anchor INPUT now — the row is
    // positioned past the grid, so a car sitting on sBox is not at any box.
    const c = { local: true, human: true, pitArmed: true, pitState: "lane", speed: 0,
                x: 0, lap: 3, tyre: { code: "M", tread: 0 } };
    c.s = ((zone.sIn + pits.boxThroughFor(c)) % 5386 + 5386) % 5386;
    c.x = place === "line" ? 0 : pits.laneCentre(hw, zone.side, c.s) + (place === "off" ? 2.4 * zone.side : 0);
    pits.update(c, 0.1);
    return c;
  };
  assert.equal(mk("line").pitState, "lane", "a car stopped on the racing line served a stop");
  assert.equal(mk("box").pitState, "box", "a car stopped IN its box did not serve its stop");
  assert.equal(mk("box").pitStops, 1);
  // SQUARE IN IT, and this is the half the latch used to miss: `inBoxLat` only
  // asked that the car had REACHED the working lane, so a stop happened
  // anywhere from the corridor edge to the garage wall. A car 2.4 m off its own
  // box's centre is not parked in the bay and gets no crew.
  assert.equal(mk("off").pitState, "lane", "a car parked wide of its box still served a stop");
});

test("the lane's lateral tolerance is a car's worth, not a lane's", () => {
  // BOX_LAT exists because the painted line is the lane's INNER EDGE: a 2.0 m
  // car parked with its centre on it is half in, and asking for the centre
  // would be asking for precision the camera cannot show. It must not grow
  // into "anywhere on the road" — at Monaco's narrowed lane that is the whole
  // difference between a pit box and a free stop wherever you like.
  assert.ok(P.BOX_LAT > 0, "zero tolerance puts the box on a knife edge again");
  assert.ok(P.BOX_LAT <= P.LANE_MIN / 2,
    "a tolerance past the lane's half-width lets a car stop outside its own lane");
});

test("a narrow road cannot make the whole track a pit box", () => {
  // The lane plus its tolerance must never span the road: on a hw where it
  // would, the threshold goes negative and a car stopped on the racing line
  // serves a free stop. Monaco (the narrowest built circuit, hw 4.93) is well
  // clear; this pins the behaviour for a circuit authored tighter later.
  const { pits } = commitSession();
  const side = P.PIT_SIDE;
  for (const hw of [2.5, 3, 3.5, 4, 4.93, 7, 8]) {
    assert.equal(pits.inLaneLat({ x: 0 }, hw, side), false,
      `at hw ${hw} a car on the racing line read as being in the pit lane`);
    assert.equal(pits.inLaneLat({ x: (hw - 0.2) * side }, hw, side), true,
      `at hw ${hw} a car at the pit-side edge read as being outside the lane`);
  }
});

test("the lateral test is separate from inLane, which is still a state", () => {
  // The invariant that killed cut one: `inLane` must never become a half-plane,
  // or a car beached far off the road reads as pitting and the auto-rescue
  // breaks. The lateral question is a DIFFERENT function with a different name,
  // and that separation is the guard.
  const src = readFileSync(join(ROOT, "js/race/pit-lane.js"), "utf8");
  const inLane = src.slice(src.indexOf("function inLane(c)"));
  assert.ok(!/\.hw|_smp/.test(inLane.slice(0, 200)), "inLane grew a lateral test again");
  const { pits, hw } = commitSession();
  const side = P.PIT_SIDE;
  // Far off the road on the pit side: laterally past the lane, and still not
  // in it — because the state says no.
  assert.equal(pits.inLane({ pitState: "none", x: hw * 3 * side }), false);
  assert.equal(pits.inLaneLat({ x: hw * 3 * side }, hw, side), true,
    "the lateral test answers about position only — the state is inLane's job");
});

test("info() reports the lateral half, so a stop that will not latch is visible", () => {
  const { pits, zone, hw } = commitSession();
  const onLine = { local: true, s: zone.sBox, x: 0, pitState: "lane" };
  const inIt = { local: true, s: zone.sBox, x: hw * 0.95 * zone.side, pitState: "lane" };
  assert.equal(pits.info(onLine).inLaneLat, false);
  assert.equal(pits.info(inIt).inLaneLat, true);
  assert.equal(pits.info(inIt).inLane, true, "the state half must still read separately");
  // Outside the window there is no lateral answer to give, and no sample to pay
  // for: every car on the circuit would otherwise cost a spline read per frame.
  const away = pits.info({ local: true, s: zone.sIn - 400, x: 0 });
  assert.equal(away.inLaneLat, false);
  assert.equal(away.laneX, null, "a lane position outside the window is a number with no meaning");
});

test("info().laneX is the real lane centre here, not a nominal one", () => {
  // The number a driver, a spec or an agent aims the car at. A constant taken
  // at a nominal 7 m half-width would be wrong on most of the calendar: the
  // pit-window half-width runs 4.93 m at Monaco to 8.0 m at Spa, so the lane
  // centre moves over three metres across the 51 built circuits.
  for (const hw of [5, 7, 8]) {
    const { pits, zone } = commitSession({ hw });
    const at = pits.info({ local: true, s: zone.sBox, x: 0 });
    assert.equal(at.laneX, +pits.laneCentre(hw, zone.side).toFixed(2),
      `at hw ${hw} info() handed back a lane centre for a different road`);
    // …and it is a position a car can actually be put at and be in the lane.
    assert.equal(pits.inLaneLat({ x: at.laneX }, hw, zone.side), true,
      `aiming at laneX did not land in the lane at hw ${hw}`);
  }
});

test("the cue says which way when the box is coming and the car is not in the lane", () => {
  // A stop that silently does not happen is the cruellest thing this module
  // could ship: the driver did everything else right and gets no reason.
  const { pits, zone, hw } = commitSession();
  // 40 m short of THIS CAR'S box, not of zone.sBox. The nominal box is one
  // number for the whole field; where a car actually stops is its team's place
  // in the row, and the cue fires off that. Pinning the fixture to the nominal
  // one made this test a hostage of wherever the row happened to be anchored.
  const L = 5386;
  const boxAt = pits.boxThroughFor({ s: 0, x: 0 });
  const sFor = (d) => (((zone.sIn + boxAt - d) % L) + L) % L;
  const at = (over, d) => pits.cue({
    local: true, s: sFor(d == null ? 20 : d), x: hw * over * zone.side, speed: 20,
    pitState: "lane", tyre: { code: "M", tread: 0 }, tyreWear: 0.8, lap: 3,
  });
  assert.equal(at(0).text, zone.side > 0 ? "KEEP RIGHT" : "KEEP LEFT");
  assert.equal(at(0).phase, "keep");
  // …BUT NOT BEFORE IT IS TIME TO TAKE IT. Reported, with a screenshot of the
  // cue reading KEEP RIGHT at the top of the lane: "it's wrongly telling me to
  // stay right before it's my time to pull over." A driver running down the
  // fast lane with the box still 60 m away is doing the right thing, and the
  // ask rode the whole 90 m countdown. Now it waits for MOVE_M.
  const far = at(0, 60);
  assert.equal(far.phase, "lane", `60 m out is not the moment to move over: ${far.text}`);
  assert.ok(!/KEEP/.test(far.text), `no KEEP sign at 60 m: ${far.text}`);
  assert.match(far.text, /BOX \d+m/, `…but the metres are still counted: ${far.text}`);
  // IN the lane and closing: the one number a driver cannot work out is where
  // their own box is — there is no mark on the road, and each team's box sits
  // at its own place in the row, so it is not even a fixed distance from the
  // line. The speed limit is the thing they can already read off the HUD.
  assert.match(at(0.95).text, /PULL IN · \d+m/, `a car in the lane must be told where its box is: ${at(0.95).text}`);
  assert.equal(at(0.95).phase, "near-box");
  // Far from the box it is the limit that matters, not the line — a KEEP sign
  // for 300 m is the wallpaper the cue exists to avoid.
  const early = pits.cue({
    local: true, s: zone.sIn + 10, x: 0, speed: 20, pitState: "lane",
    tyre: { code: "M", tread: 0 }, tyreWear: 0.8, lap: 3,
  });
  assert.ok(/LIMIT/.test(early.text), `an early KEEP sign is wallpaper: ${early.text}`);
});

// ── A row of boxes, not one point ───────────────────────────────────────────
// Every car used to stop at the same arc position — and since the lane became a
// place, the same lateral one — so two cars pitting on the same lap shared a
// patch of tarmac.

test("each team has its own box, and teammates share one", () => {
  const { pits } = commitSession();
  const car = (team) => ({ team, s: 0, x: 0 });
  const mer = pits.boxThroughFor(car("mercedes"));
  const fer = pits.boxThroughFor(car("ferrari"));
  const mer2 = pits.boxThroughFor(car({ id: "mercedes" }));   // object form too
  assert.notEqual(mer, fer, "two teams were given the same box");
  assert.equal(Math.round(Math.abs(fer - mer)), P.BOX_PITCH, "boxes are one garage pitch apart");
  assert.equal(mer2, mer, "a team object and a team id must resolve to the same box");
  // A REAL TEAM HAS ONE BOX. Teammates sharing it is the thing that makes
  // stacking two cars in one window expensive, not a limitation to fix.
  assert.equal(pits.boxThroughFor(car("ferrari")), fer);
});

test("a car with no team still gets a reachable box, not row 0's", () => {
  // Synthetic and stubbed cars are everywhere (these tests, a net rival before
  // its team arrives). They must land somewhere driveable rather than in the
  // first garage on the list. "Equals the old anchor" used to be the assertion;
  // since the row moved past the grid, REACHABLE is the property that matters.
  const { pits, zone } = commitSession();
  const none = pits.boxThroughFor({ s: 0, x: 0 });
  const unknown = pits.boxThroughFor({ team: "nosuchteam", s: 0, x: 0 });
  assert.equal(none, unknown, "an unknown team and no team must agree");
  assert.notEqual(none, pits.boxThroughFor({ team: "mercedes", s: 0, x: 0 }),
    "a teamless car must not be parked in row 0's garage");
  assert.ok(none > P.COMMIT_M && none < zone.lenM - P.BOX_TOL,
    `a teamless box at ${none} is outside the window`);
  assert.equal(P.teamRow({ team: "nosuchteam" }), -1);
});

test("the whole row fits inside the window, at both ends", () => {
  // The earliest box must be past the entry road or it could never be committed
  // to; the latest must be short of the exit or it could never be reached. With
  // 12 teams at a 14 m pitch that is 154 m of boxes to fit.
  const { pits, zone } = commitSession();
  const ids = ["mercedes", "ferrari", "mclaren", "redbull", "alpine", "racingbulls",
               "haas", "williams", "audi", "astonmartin", "cadillac", "custom"];
  const at = ids.map((id) => pits.boxThroughFor({ team: id, s: 0, x: 0 }));
  for (const a of at) {
    assert.ok(a > P.COMMIT_M, `a box at ${a} m sits inside the entry road`);
    assert.ok(a < zone.lenM - P.BOX_TOL, `a box at ${a} m sits past the window exit`);
  }
  // …and it starts PAST THE GRID rather than straddling the old anchor, which
  // is the whole change: the grid sits inside the window (pole 14 m before the
  // line), so a row centred on the anchor left pole starting beyond most of it.
  const first = Math.min(...at);
  const poleThrough = P.throughM(zone, ((-14 % 5386) + 5386) % 5386, 5386);
  assert.ok(first > P.COMMIT_M + 20 - 1, `the row starts inside the entry road: ${first}`);
  // It cannot always clear pole — the window is only so long — but it must get
  // as close as the clamp allows rather than sitting centred on the anchor.
  const anchor = P.throughM(zone, zone.sBox, 5386);
  assert.ok(first > anchor - (at.length - 1) * P.BOX_PITCH / 2,
    `the row did not move forward at all: first ${first}, old first ${anchor - (at.length - 1) * P.BOX_PITCH / 2}`);
  assert.ok(poleThrough > 0, "pole must sit inside the window for this to be the right fix");
});

test("a short circuit cannot have its row spill out of its own window", () => {
  // The window is capped at a third of the lap, so on a short track the row has
  // to compress into whatever is left rather than run past the exit.
  const { pits, zone } = commitSession({ total: 900 });
  const ids = ["mercedes", "cadillac", "custom"];
  for (const id of ids) {
    const a = pits.boxThroughFor({ team: id, s: 0, x: 0 });
    assert.ok(a > 0 && a < zone.lenM, `box at ${a} m is outside a ${zone.lenM} m window`);
  }
});

test("moving a team's garage does not move its pit loss", () => {
  // The box position changes where you STOP. The distance through the window at
  // the limiter is unchanged, so what the stop costs is unchanged — which is
  // what keeps this a fidelity fix rather than a balance change.
  const { pits, zone } = commitSession();
  const a = pits.boxThroughFor({ team: "mercedes", s: 0, x: 0 });
  const b = pits.boxThroughFor({ team: "custom", s: 0, x: 0 });
  assert.notEqual(a, b, "the two ends of the row must actually differ");
  assert.equal(zone.lenM, P.zoneOf(fakeTrack({})).lenM, "the window length must not depend on a car");
});

// ── Where the lane opens is a property of the circuit ────────────────────────
// A flat 320 m was circuit-blind and measurably wrong: at Monza it put the
// entry inside Parabolica, where the commit gesture asks a driver to hold a
// lateral line mid-corner. entryRunM walks back from the line to where the last
// corner lets go. Curvature channel: surface (docs/PHYSICS.md).

/** A track whose curvature is 0 on the last `straightM` before the line and
 *  hard cornering before that — i.e. a pit straight of a known length. */
function trackWithStraight(straightM, total = 5386) {
  return { total, n: 1346, def: {},
           _straightM: straightM,
           hw: new Float32Array(1346).fill(7) };
}
function curvatureStub(track) {
  return (t, s) => {
    const L = t.total, v = ((s % L) + L) % L;
    const before = L - v;                       // metres back from the line
    return before <= t._straightM ? 0 : 0.02;   // straight, then a real corner
  };
}
/** PitLane in a VM whose Tracks.curvature describes one straight before the line. */
function laneOn(straightM, total = 5386) {
  const ctx = vm.createContext({ Math, console, Object, Array, Number, JSON, isFinite, Float32Array });
  seedLog(ctx);
  ctx.window = ctx;
  const track = trackWithStraight(straightM, total);
  ctx.Tracks = { sample: () => { throw new Error("entry geometry must not sample"); },
                 curvature: curvatureStub(track) };
  vm.runInContext(readFileSync(join(ROOT, "js/core/mat4.js"), "utf8"), ctx, { filename: "mat4.js" });
  vm.runInContext(readFileSync(join(ROOT, "js/race/pit-lane.js"), "utf8"), ctx, { filename: "pit-lane.js" });
  const Pl = vm.runInContext("PitLane", ctx);
  return { Pl, track, entry: Pl.entryRunM(track), zone: Pl.zoneOf(track) };
}

test("the lane opens where the last corner lets go, not at a fixed distance", () => {
  // The whole point: two circuits with different run-ins get different lanes.
  const short = laneOn(200), long = laneOn(600);
  assert.notEqual(short.entry, long.entry, "every circuit still gets the same entry");
  assert.ok(Math.abs(short.entry - 200) <= 8 + 1, `a 200 m straight gave a ${short.entry} m entry`);
  assert.equal(long.entry, P.ENTRY_M, "a long straight must cap at the longest a lane may be");
});

test("…and it never opens inside a corner, which is what this replaced", () => {
  // Sampled back from the line, every metre of the entry run must be road the
  // arc calls quiet. This is the assertion that would have caught Parabolica.
  const { track, entry } = laneOn(300);
  const k = curvatureStub(track);
  for (let d = 0; d < entry; d += 8) {
    assert.ok(Math.abs(k(track, ((-(d + 4)) % track.total + track.total) % track.total)) <= P.PIT_K,
      `the window opens ${d} m back, which is inside a corner`);
  }
});

test("a circuit with no straight still gets a lane, floored not vanished", () => {
  // Monaco's problem. A 40 m run-in must not give a 40 m pit lane — below a
  // floor it stops being a lane at all and the stop stops costing anything.
  const { entry, zone } = laneOn(40);
  assert.equal(entry, P.ENTRY_MIN, "a cornering run-in must floor at the shortest real lane");
  assert.ok(zone.lenM > P.ENTRY_MIN, "the window is the entry plus the exit");
});

test("pit loss now VARIES by circuit, which is the reason the lane is driven", () => {
  // The design's whole justification over a hardcoded penalty: real pit loss
  // runs 18-30 s and that spread decides one stop against two. With a flat
  // 320 m entry every circuit had the SAME lane and the spread did not exist.
  const lens = [120, 250, 400, 600].map((m) => laneOn(m).zone.lenM);
  assert.equal(new Set(lens).size > 1, true, `every circuit still has the same lane: ${lens}`);
  assert.ok(Math.max(...lens) - Math.min(...lens) > 100,
    `the spread is too small to change a strategy: ${lens}`);
  // …and it is monotone: a longer run-in is never a shorter lane.
  for (let i = 1; i < lens.length; i++) assert.ok(lens[i] >= lens[i - 1], `not monotone: ${lens}`);
});

test("a circuit may still override the entry by hand", () => {
  // The derived value is a DEFAULT. Authored per-circuit geometry (real lane
  // lengths) must still win, because the arc cannot know where a real pit lane
  // diverges — only where the road stops turning.
  const ctx = vm.createContext({ Math, console, Object, Array, Number, JSON, isFinite, Float32Array });
  seedLog(ctx);
  ctx.window = ctx;
  const track = trackWithStraight(600);
  track.def = { pitZone: { entryM: 275 } };
  ctx.Tracks = { sample: () => { throw new Error("no"); }, curvature: curvatureStub(track) };
  vm.runInContext(readFileSync(join(ROOT, "js/core/mat4.js"), "utf8"), ctx, { filename: "mat4.js" });
  vm.runInContext(readFileSync(join(ROOT, "js/race/pit-lane.js"), "utf8"), ctx, { filename: "pit-lane.js" });
  const Pl = vm.runInContext("PitLane", ctx);
  assert.equal(Pl.zoneOf(track).lenM, 275 + P.EXIT_M, "an authored entryM was ignored");
});

test("the entry read is the ONLY curvature this module does", () => {
  // Curvature channel: surface. It may decide WHERE the lane is, once per
  // circuit, and must never reach a driving car — so it belongs in zone
  // resolution and nowhere near update(), committing() or the box.
  const src = readFileSync(join(ROOT, "js/race/pit-lane.js"), "utf8");
  // CALLS, not mentions: the availability guard (`!Tracks.curvature`) names it
  // without reading it, and counting that as a read would make this assertion
  // about spelling rather than about the contract.
  const reads = src.split("\n").filter((l) => /Tracks\.curvature\s*\(/.test(l) && !/^\s*(\/\/|\*)/.test(l));
  assert.equal(reads.length, 1, `curvature is CALLED ${reads.length} times, not once: ${reads.join(" | ")}`);
  const fn = src.slice(src.indexOf("function entryRunM"), src.indexOf("function zoneOf"));
  assert.ok(/Tracks\.curvature/.test(fn), "the one read must be the entry scan");
});

test("the cue counts the box down and then says STOP HERE on it", () => {
  // The last instruction of the sequence, and the only one with no second
  // chance: miss the box and the stop does not happen at all.
  const { pits, zone, hw } = commitSession();
  const boxAt = pits.boxThroughFor({ local: true });
  // ON THE BOX'S OWN CENTRE, because STOP HERE now means the car is SQUARE in
  // the bay, not merely somewhere past the working lane's line.
  const at = (m) => {
    const s = ((zone.sIn + boxAt - m) % 5386 + 5386) % 5386;
    return pits.cue({
      local: true, s, x: pits.laneCentre(hw, zone.side, s), speed: 6,
      pitState: "lane", tyre: { code: "M", tread: 0 }, tyreWear: 0.8, lap: 3,
    });
  };
  const far = at(34), near = at(14), on = at(0);
  assert.match(far.text, /PULL IN · 3\dm/, `expected a countdown, got ${far.text}`);
  assert.match(near.text, /PULL IN · 1\dm/, `expected a countdown, got ${near.text}`);
  assert.equal(on.text, "STOP HERE");
  assert.equal(on.phase, "stop");
  // Further out than MOVE_M the metres are still counted, but the instruction
  // is the lane the car is already in — not PULL IN, and not KEEP.
  const early = at(70);
  assert.equal(early.phase, "lane", `70 m out is not PULL IN: ${early.text}`);
  assert.match(early.text, /BOX 7\dm/, `…and still a countdown: ${early.text}`);
  // CROOKED IN THE BAY is not a stop, and it says which problem it is: on the
  // right arc, inside the working lane, but not centred on the box.
  const off = pits.cue({
    local: true, s: ((zone.sIn + boxAt) % 5386 + 5386) % 5386,
    x: pits.laneCentre(hw, zone.side, (zone.sIn + boxAt) % 5386) + 2.4 * zone.side, speed: 6,
    pitState: "lane", tyre: { code: "M", tread: 0 }, tyreWear: 0.8, lap: 3,
  });
  assert.ok(off.phase === "square" || off.phase === "keep",
            `a car off its box centre is not told it has arrived: ${off.phase} "${off.text}"`);
  // …and it counts DOWN: a number that grows as you approach is worse than none.
  assert.ok(far.dist > near.dist, `the countdown ran backwards: ${far.dist} -> ${near.dist}`);
});

// ── The player's reference plan ─────────────────────────────────────────────
// planFor gives the PLAYER a plan too — the one the pit wall would run — and
// nothing executes it: think() keeps its human guard. The HUD reads it
// (planInfo), the gap chips read the rivals' (windowOf), and it is re-cut once
// a lap on the set that is on the car (replan).

test("a human's plan never arms a stop: think() is the AI's, whatever the plan says", () => {
  const { pits, zone, car } = commitSession();
  const c = car(0);
  c.s = zone.sIn - 300; c.lap = 12; c.pitStops = 0; c.tyreWear = 0.3;
  c.pitPlan = { stops: 1, seq: ["medium", "hard"], stints: [12, 13], lapsAt: [12] };
  assert.equal(pits.think(c), "", "a human car through think() must say nothing");
  assert.equal(!!c.pitArmed, false, "…and must not be armed");
  c.human = false; c.local = false;
  assert.notEqual(pits.think(c), "", "the same car as an AI does fire its plan");
});

test("planInfo reads the plan for the HUD: the stops, the next box lap, and the lap's state", () => {
  const { pits, zone, car } = commitSession();
  const c = car(0);
  c.s = zone.sIn - 300; c.pitStops = 0;
  c.pitPlan = { stops: 1, seq: ["medium", "hard"], stints: [12, 13], lapsAt: [12] };
  c.lap = 5;
  let i = pits.planInfo(c);
  assert.equal(i.state, "");
  assert.match(i.text, /^PLAN 1-STOP · BOX L12/);
  c.lap = 11; i = pits.planInfo(c);
  assert.equal(i.state, "soon"); assert.match(i.text, /^BOX NEXT LAP/);
  c.lap = 12; i = pits.planInfo(c);
  assert.equal(i.state, "now"); assert.match(i.text, /^BOX BOX BOX/);
  c.pitArmed = true; i = pits.planInfo(c);
  assert.equal(i.state, "", "a called stop carries no urgency of its own");
  c.pitArmed = false; c.pitStops = 1; i = pits.planInfo(c);
  assert.match(i.text, /DONE/, "the plan is served");
  c.pitPlan = { stops: 0, seq: ["hard"], stints: [25], lapsAt: [] }; c.pitStops = 0;
  assert.match(pits.planInfo(c).text, /NO STOP/);
  assert.equal(pits.planInfo({ local: true }), null, "no plan, nothing to paint");
});

test("windowOf names a rival's window for the gap chips: P<lap> within three laps, IN while stopping", () => {
  const { pits } = commitSession();
  const o = { pitPlan: { stops: 1, seq: ["medium", "hard"], stints: [12, 13], lapsAt: [12] }, pitStops: 0, lap: 8, pitState: "none" };
  assert.equal(pits.windowOf(o), "", "four laps out is not a window");
  o.lap = 9; assert.equal(pits.windowOf(o), "P12");
  o.lap = 12; assert.equal(pits.windowOf(o), "P12");
  o.lap = 13; assert.equal(pits.windowOf(o), "", "a missed window is not advertised");
  o.pitState = "lane"; assert.equal(pits.windowOf(o), "IN");
  assert.equal(pits.windowOf({ lap: 3 }), "", "no plan, no window");
});

test("lossS is the lane's net cost in seconds, and estimate agrees with it off a caution", () => {
  const { pits, car } = commitSession();
  const s = pits.lossS();
  assert.ok(s > 5 && s < 60, `a plausible pit loss: ${s}`);
  const est = pits.estimate(car(0));
  assert.ok(Math.abs(est.lossS - s) < 1e-9, `estimate's lossS is the same number off a caution (${est.lossS} vs ${s})`);
});
