/* car-fx.test.mjs — js/fx/car-fx.js (plank sparks, AI lock-up marks) and the
 * js/fx/particles.js pieces the 2026-10-02 car-motion batch added beside it
 * (scrape embers, one-frame flares for a far rival's brake glow, the lingering
 * rain plume), in a VM; plus source guards on the two render sites that read
 * per-car state into the picture (car-draw's front-wheel angle, game.js's
 * emit call).
 *
 *   - PLANK SPARKS come from body-attitude's c.baScrape, gated on the car's
 *     speed as a FRACTION of its envelope (vStd: PACE scales ground speed),
 *     out of the floor's lowest point (the nose on a dive, the tail on a
 *     squat) and carried along with the car.
 *   - AI LOCK-UP MARKS lay on each car's own cadence (SkidMarks.stampFor),
 *     race state only, never for the player (game.js stamps it).
 *   - POOL DISCIPLINE: embers stop at 60 % of the pool and spray at 75 %, so
 *     collision sparks and smoke always find room; a flare lives outside the
 *     pool and is drawn exactly one frame (a pooled glow on a moving car
 *     stacked copies into a trail).
 *   - THE ARC MUST NOT REACH THE DRIVER: car-draw adds the bend's Ackermann
 *     angle (c.kCur) to AI front wheels only.
 *
 * Run: node --test tests/unit/car-fx.test.mjs   (npm run test:tooling-fast)
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { seedLog } from "../helpers/seed-log.mjs";
import { makeRng } from "../helpers/seeded-fuzz.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");
const DT = 1 / 60;
const VMAX = 72;

/** A VM with consts + skidmarks + particles + car-fx; Math.random seeded. */
function load({ mobile = false, vTop = VMAX, particlesStub = null } = {}) {
  const rng = makeRng(0xca7f);
  const seededMath = Object.assign(Object.create(Math), { random: () => rng.unit() });
  const ctx = vm.createContext({ Float32Array, Uint8Array, Array, Math: seededMath, Object, WeakMap, JSON, Number });
  ctx.window = ctx;
  seedLog(ctx);
  for (const f of ["js/physics/consts.js", "js/fx/skidmarks.js", "js/fx/particles.js", "js/fx/car-fx.js"])
    vm.runInContext(read(f).replace(/^const\b/gm, "var"), ctx, { filename: f });
  const draws = [];
  const P = ctx.Particles;
  P.init({ mobileTier: mobile, drawParticles: (data, floats, additive) => draws.push({ data: Array.from(data.subarray(0, floats)), floats, additive }) });
  const skids = ctx.SkidMarks.create();
  const G = { vTop: () => vTop };
  const fx = ctx.CarFx.create(G, { skids, Particles: particlesStub || P });
  return { ctx, P, skids, fx, draws, SkidMarks: ctx.SkidMarks, CarFx: ctx.CarFx };
}

/** A grounded basis at (x, 0, z) facing +z (column-major: R, U, F, origin). */
function ground(x = 10, z = 20) {
  const m = new Float32Array(16);
  m[0] = 1; m[5] = 1; m[10] = 1; m[15] = 1; m[12] = x; m[14] = z;
  return m;
}

test("a bottoming floor at speed throws embers from its lowest point, carried with the car", () => {
  const calls = [];
  const stub = { scrape: (...a) => calls.push(a) };
  const { fx, CarFx } = load({ particlesStub: stub });
  const g = ground();
  // Brake dive (nose down): the FRONT of the plank, along +z, at full speed.
  fx.emit({ speed: 70, baScrape: 0.8, baPitch: 0.02 }, g, DT, "race");   // c.baPitch > 0 is a dive
  assert.equal(calls.length, 1);
  const [x, y, z, vx, vz, count] = calls[0];
  assert.equal(x, 10);
  assert.ok(Math.abs(z - 21) < 1e-6, `a dive sparks at the nose end of the floor (z +1.0): ${z}`);
  assert.ok(y > 0 && y < 0.05, `at the road: ${y}`);
  assert.equal(vx, 0);
  assert.equal(vz, 70, "the ember inherits the car's ground velocity (Particles.scrape scales it)");
  assert.ok(Math.abs(count - DT * 110 * 0.8) < 1e-9, `rate·dt × scrape at full speed: ${count}`);
  // A squat sparks at the tail, a level compression at the middle.
  calls.length = 0;
  fx.emit({ speed: 70, baScrape: 0.5, baPitch: -0.01 }, g, DT, "race");
  fx.emit({ speed: 70, baScrape: 0.5, baPitch: 0 }, g, DT, "race");
  assert.ok(Math.abs(calls[0][2] - (20 - 1.6)) < 1e-6, "a squat sparks at the tail");
  assert.ok(Math.abs(calls[1][2] - (20 - 0.3)) < 1e-6, "a compression sparks mid-floor");
  // No scrape, or too slow: nothing.
  calls.length = 0;
  fx.emit({ speed: 70, baScrape: 0, baPitch: 0.02 }, g, DT, "race");
  fx.emit({ speed: CarFx.SPARK_V0 - 1, baScrape: 1, baPitch: 0.02 }, g, DT, "race");
  fx.emit({ speed: -70, baScrape: 1, baPitch: 0.02 }, g, DT, "race");
  assert.equal(calls.length, 0, "no scrape, a slow car or a reversing one throws nothing");
  // Partway up the ramp the rate is partway.
  fx.emit({ speed: (CarFx.SPARK_V0 + CarFx.SPARK_V1) / 2, baScrape: 1, baPitch: 0 }, g, DT, "race");
  assert.ok(Math.abs(calls[0][5] - DT * 110 * 0.5) < 1e-9, `half-way up the speed ramp: ${calls[0][5]}`);
});

test("the spark gate is a share of the car's envelope: same fraction of top speed, same shower, at any PACE", () => {
  const rate = (vTop, speed) => {
    const calls = [];
    const { fx } = load({ vTop, particlesStub: { scrape: (...a) => calls.push(a) } });
    fx.emit({ speed, baScrape: 1, baPitch: 0 }, ground(), DT, "race");
    return calls.length ? calls[0][5] : 0;
  };
  const full = rate(VMAX, 0.65 * VMAX), half = rate(VMAX * 0.5, 0.65 * VMAX * 0.5);
  assert.ok(full > 0, "65 % of top speed sparks at pace 5");
  assert.ok(Math.abs(full - half) < 1e-12, `pace 0.5 at the same fraction must match: ${full} vs ${half}`);
});

test("an AI lock-up lays marks on its own cadence — race only, never the player, never off the road", () => {
  const { fx, skids } = load();
  const g = ground();
  const ai = { speed: 50, wheelLock: 1, isPlayer: false };
  const ai2 = { speed: 50, wheelLock: 1, isPlayer: false };
  for (let i = 0; i < 60; i++) { fx.emit(ai, g, DT, "race"); fx.emit(ai2, g, DT, "race"); }
  assert.equal(skids.otherCount, 24, "two locking rivals, 12 marks each in a second (own cadence each)");
  const before = skids.count;
  for (let i = 0; i < 30; i++) {
    fx.emit({ speed: 50, wheelLock: 1, isPlayer: true }, g, DT, "race");       // game.js stamps the player
    fx.emit({ speed: 50, wheelLock: 1, isPlayer: false }, g, DT, "count");     // not racing
    fx.emit({ speed: 50, wheelLock: 1, isPlayer: false, offroad: true }, g, DT, "race");
    fx.emit({ speed: 4, wheelLock: 1, isPlayer: false }, g, DT, "race");       // crawling (vStd floor)
    fx.emit({ speed: 50, wheelLock: 0.2, isPlayer: false }, g, DT, "race");    // a light lock is no lock
  }
  assert.equal(skids.count, before, "none of those lays a mark");
  assert.deepEqual({ ...fx.status() }, { sparks: 0, marks: 24 });
});

test("embers and spray leave pool headroom; the plume lingers; a flare is drawn exactly one frame", () => {
  const { P, draws } = load();
  const MAX = P.capacity();
  assert.equal(MAX, 256);
  for (let i = 0; i < 200; i++) P.scrape(0, 0, 0, 0, 70, 4);
  assert.ok(P.count() <= MAX * 0.6 + 4 && P.count() >= MAX * 0.6, `embers stop at 60 % of the pool: ${P.count()}`);
  const n0 = P.count();
  P.sparks(0, 0, 0, 0, 1, 10, 20);
  assert.equal(P.count(), n0 + 20, "a collision still finds room");
  P.clear();
  for (let i = 0; i < 200; i++) P.spray(0, 0.3, 0, 0, -20, 1, 4);
  assert.ok(P.count() <= MAX * 0.75 + 4 && P.count() >= MAX * 0.75, `spray stops at 75 % of the pool: ${P.count()}`);
  // The plume lingers: after a second every cloud is still alive (puffs died by 0.85 s).
  const n1 = P.count();
  for (let i = 0; i < 60; i++) P.update(DT);
  assert.equal(P.count(), n1, "spray clouds live past one second");
  for (let i = 0; i < 70; i++) P.update(DT);
  assert.equal(P.count(), 0, "…and are gone by ~2 s");
  // Flares: one frame, outside the pool, capped.
  P.clear();
  draws.length = 0;
  assert.equal(P.flare(1, 2, 3, 0.2, 2.4, 0.85, 0.22, 0.9), true);
  assert.equal(P.count(), 0, "a flare is not a pool particle");
  P.update(DT);
  P.draw();
  assert.equal(draws.length, 1);
  assert.equal(draws[0].additive, true);
  assert.equal(draws[0].floats, 60, "one quad in the additive batch");
  assert.deepEqual(draws[0].data.slice(2, 5), [1, 2, 3]);
  assert.ok(Math.abs(draws[0].data[9] - 0.9) < 1e-6, "drawn at its own alpha — no pool fade");
  draws.length = 0;
  P.update(DT);
  P.draw();
  assert.equal(draws.length, 0, "and not drawn again: no trail of copies behind a moving car");
  let ok = 0;
  for (let i = 0; i < 100; i++) if (P.flare(0, 0, 0, 0.2, 1, 1, 1, 1)) ok++;
  assert.equal(ok, 48, "the desktop frame holds 48 flares");
  assert.equal(P.flare(0, 0, 0, 0.2, 1, 1, 1, 0), false, "an invisible flare is refused");
  P.clear();
  assert.equal(P.flareCount(), 0, "clear() drops pending flares");
});

test("the mobile tier keeps a smaller pool, a shorter plume and fewer flares", () => {
  const { P } = load({ mobile: true });
  assert.equal(P.capacity(), 96);
  for (let i = 0; i < 6; i++) P.spray(0, 0.3, 0, 0, -20, 1, 4);
  const n = P.count();
  assert.ok(n > 0);
  for (let i = 0; i < 82; i++) P.update(DT);   // 1.37 s: past 1.9 s × 0.7 = 1.33 s
  assert.equal(P.count(), 0, "mobile spray clouds live ×0.7");
  let ok = 0;
  for (let i = 0; i < 40; i++) if (P.flare(0, 0, 0, 0.2, 1, 1, 1, 1)) ok++;
  assert.equal(ok, 24);
});

test("source guards: the arc reaches AI wheels only; the emitters run before the cockpit continue", () => {
  const cd = read("js/car/car-draw.js");
  // car-draw: the Ackermann term (c.kCur) sits in the !c.human arm; the human
  // arm tapers by speed with no curvature in sight.
  const ai = cd.match(/if \(!c\.human\) steerA = ([^\n]*)/);
  assert.ok(ai, "the AI front-wheel arm is present");
  assert.match(ai[1], /Math\.atan\(VIS_WHEELBASE \* \(c\.kCur \|\| 0\)\)/);
  const human = cd.match(/\n\s*else if \(G\.STEER_SPEED_REF > 0\) steerA \/= ([^\n]*)/);
  assert.ok(human, "the human arm is the speed taper");
  assert.doesNotMatch(human[1], /kCur|curvature/, "no curvature may reach a human car's wheels");
  assert.equal(cd.split("c.kCur").length - 1, 1, "car-draw reads c.kCur at exactly one (AI-only) site");
  // The far brake flare is for rivals past the 40 m ring gate only, and never
  // from the mirror's BARE wheels (a second camera would emit it twice).
  assert.match(cd, /const flareA = !bare && !c\.isPlayer && heatF > 0\.15 && camD2 >= 40 \* 40/);
  // game.js: carFx.emit beside the other emitters, before the cockpit branch.
  const game = read("js/game.js");
  const emit = game.indexOf("carFx.emit(c, _groundMat, dt, state);");
  const cockpit = game.indexOf("if (c.isPlayer && (cockpitRigOnly || visorEye)) {");
  assert.ok(emit > 0 && cockpit > 0 && emit < cockpit, "carFx.emit must run before the cockpit view's continue");
  assert.equal(game.split("carFx.emit(").length - 1, 1, "one emit site");
  assert.match(game, /const carFx = CarFx\.create\(G, \{ skids \}\);/);
});
