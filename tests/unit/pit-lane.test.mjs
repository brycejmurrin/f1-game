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
function commitSession({ hw = 7, vTop = 60 } = {}) {
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
  vm.runInContext(readFileSync(join(ROOT, "js/core/mat4.js"), "utf8"), ctx, { filename: "mat4.js" });
  vm.runInContext(readFileSync(join(ROOT, "js/race/pit-lane.js"), "utf8"), ctx, { filename: "pit-lane.js" });
  const Pl = vm.runInContext("PitLane", ctx);
  const track = { total: 5386, n: 1346, def: {} };
  const said = [];
  const pits = Pl.create({
    track, vTop: () => vTop, lapsTarget: 25, raceWeather: "dry",
    announce: (m) => said.push(m),
    // spent() reads the CAR, not a constant: the cue's whole job is to stay
    // quiet on a fresh set and speak on a used one, and a stub that always
    // says 0 would let a broken cue pass every test below.
    tyres: { on: () => true, spent: (car) => (car && car.tyreWear) || 0, fit: () => {},
             classRecord: () => ({ id: "m", code: "M", life: 0.74, tread: 0 }),
             optionRecord: () => ({ id: "m", code: "M", life: 0.74, tread: 0 }) },
    cautionInfo: () => ({ level: 0 }),
  });
  const zone = Pl.zoneOf(track);
  // A car in the entry, on the pit side, at racing speed — i.e. committing.
  const car = (over) => ({
    local: true, human: true, speed: 40, lap: 3, s: zone.sIn + 20,
    x: hw * over * zone.side, offroad: false, wrongWay: false, rescueT: 0,
    tyre: { code: "M", tread: 0 }, pitState: "none",
  });
  return { Pl, pits, zone, car, said, hw, samples: () => samples };
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

test("you can only commit at the ENTRY, not anywhere in the window", () => {
  const { pits, zone, car } = commitSession();
  const late = car(0.95);
  late.s = zone.sIn + P.COMMIT_M + 30;   // past the entry road, racing the straight
  for (let i = 0; i < 20; i++) pits.update(late, 0.1);
  assert.equal(!!late.pitArmed, false, "a car hugging the pit wall mid-window called a stop");
});

test("only the LOCAL player steers itself in — the AI has a plan, a rival has an owner", () => {
  const { pits, car } = commitSession();
  for (const who of [{ local: false, human: false }, { local: false, human: true }]) {
    const c = Object.assign(car(0.95), who);
    for (let i = 0; i < 20; i++) pits.update(c, 0.1);
    assert.equal(!!c.pitArmed, false, "a non-local car steered itself into a stop");
  }
});

test("the commitment test is the only thing that samples the track, and reads only hw", () => {
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

test("it says ENTRY at the entry, and only while the entry road lasts", () => {
  const { pits, zone, car, Pl } = commitSession();
  const c = car(0);
  c.tyreWear = 0.9;
  c.s = zone.sIn + 20;                    // inside the entry road
  assert.equal(pits.cue(c).phase, "enter");
  assert.equal(pits.cue(c).text, "PIT ENTRY");
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
  assert.equal(pits.cue(c), null, "the cue kept talking after the stop was served");
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
