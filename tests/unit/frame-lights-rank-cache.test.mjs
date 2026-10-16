/* frame-lights-rank-cache — distance/time budget for the nearest-CAP rebuild.
 *
 * At racing speed (~1 m/frame) the old 0.5 m eye eps rebuilt every frame, and
 * the mirror's viewLights then ranked the same baked set again. The cache now
 * reuses while the eye stays inside 3 m AND (standstill OR age < 80 ms), so a
 * 60 m/s drive re-ranks a few times a second, not every frame, with no
 * membership pop (entry ramp + geometric fade still apply on rebuild).
 *
 * Run: node --test tests/unit/frame-lights-rank-cache.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");

function load() {
  const clock = { now: 0 };
  const ctx = {
    performance: { now: () => clock.now },
    Math, Float32Array, Uint32Array, Array, Object,
    LightKnobs: { LT: { lampWarmup: 0, lampFlicker: 0, lampCull: 40, lampBehindBias: 5.25, lampCullFade: 0.35, lampReach: 1 } },
    PerfGov: { tier: () => 0 },
  };
  vm.createContext(ctx);
  vm.runInContext(read("js/render/shared/light-budget.js") + "\n;globalThis.LightBudget = LightBudget;", ctx);
  vm.runInContext(read("js/lighting/frame-lights.js") + "\n;globalThis.FrameLights = FrameLights;", ctx);
  return { FL: ctx.FrameLights, clock };
}

function street(spacing) {
  const L = [];
  for (let z = 0; z < 6000; z += spacing) for (const x of [-9, 9]) L.push(x, 8, z, 1, 0.9, 0.7, 40, 0, -1, 0, -1, 0, 0, 0, 1);
  return L;
}

test("at 60 m/s the forward rank reuses most frames (distance/time budget)", () => {
  const { FL, clock } = load();
  FL.resetRankStats();
  const track = { _lights: street(12) }, cars = new Array(10).fill({}), frame = {};
  for (let f = 0; f < 600; f++) {
    clock.now = f * 1000 / 60;                         // 60 fps wall clock
    const eye = [0, 1.2, 500 + f];                      // 1 m/frame = 60 m/s
    FL.setFrameLights(frame, track, cars, eye, 1, [0, 0, 1], 0);
  }
  const s = FL.rankStats();
  assert.ok(s.mainRebuilds > 0, "some rebuilds happen as the eye advances");
  assert.ok(s.mainReuses > s.mainRebuilds,
    `reuse should dominate at speed (reuses ${s.mainReuses} rebuilds ${s.mainRebuilds})`);
  // Old 0.5 m eps: ~600 rebuilds. New 5 m / 100 ms: ≤ ~120.
  assert.ok(s.mainRebuilds <= 150, `expected <<600 rebuilds, got ${s.mainRebuilds}`);
});

test("mirror viewLights shares the view heap — far fewer rebuilds than frames", () => {
  const { FL, clock } = load();
  FL.resetRankStats();
  const track = { _lights: street(12) }, cars = new Array(10).fill({}), frame = {};
  for (let f = 0; f < 600; f++) {
    clock.now = f * 1000 / 60;
    const eye = [0, 1.2, 500 + f];
    FL.setFrameLights(frame, track, cars, eye, 1, [0, 0, 1], 0);
    frame.tailStart = (frame.lights.length / 15) | 0; frame.tailCount = 0;
    FL.viewLights(frame, eye, [0, 0, -1]);
  }
  const s = FL.rankStats();
  assert.ok(s.viewReuses > s.viewRebuilds,
    `view reuse dominates (reuses ${s.viewReuses} rebuilds ${s.viewRebuilds})`);
  assert.ok(s.viewRebuilds <= 150, `view rebuilds ${s.viewRebuilds} should be << 600`);
});

test("a parked eye does not rebuild on the clock alone", () => {
  const { FL, clock } = load();
  FL.resetRankStats();
  const track = { _lights: street(12) }, cars = new Array(10).fill({}), frame = {};
  const eye = [0, 1.2, 500], fwd = [0, 0, 1];
  for (let f = 0; f < 120; f++) {
    clock.now = f * 1000 / 60;
    FL.setFrameLights(frame, track, cars, eye, 1, fwd, 0);
  }
  const s = FL.rankStats();
  assert.equal(s.mainRebuilds, 1, `standstill: one build then reuse (got ${s.mainRebuilds})`);
  assert.equal(s.mainReuses, 119);
});

test("mirror light stays flash-free under the new cache budget", () => {
  // Same metric as mirror-lights.test.mjs: >10% frame-to-frame step in the
  // rear window is a flash. The looser cache must not re-introduce it.
  const { FL, clock } = load();
  const lamps = street(12), track = { _lights: lamps }, cars = new Array(10).fill({}), frame = {};
  const win = (dz) => (dz < 0 && dz > -120 ? Math.sin(Math.PI * -dz / 120) : 0);
  const kept = [];
  for (let f = 0; f < 600; f++) {
    clock.now = f * 1000 / 60;
    const ez = 500 + f, eye = [0, 1.2, ez];
    FL.setFrameLights(frame, track, cars, eye, 1, [0, 0, 1], 0);
    frame.tailStart = (frame.lights.length / 15) | 0; frame.tailCount = 0;
    const v = FL.viewLights(frame, eye, [0, 0, -1]);
    const L = v ? v.lights : frame.lights;
    let sum = 0, ideal = 0;
    for (let i = 0; i < L.length; i += 15) sum += win(L[i + 2] - ez) * L[i + 3];
    for (let i = 0; i < lamps.length; i += 15) ideal += win(lamps[i + 2] - ez) * lamps[i + 3];
    kept.push(sum / ideal);
  }
  const s = kept.slice(30);
  const jumps = s.slice(1).filter((v, i) => Math.abs(v - s[i]) / Math.max(0.05, (v + s[i]) / 2) > 0.10).length;
  assert.equal(jumps, 0, `no >10% mirror-window step (got ${jumps})`);
});

// #2180: a switch to an unlit track (setFrameLights with no lamps) — or to any
// other world — must drop every strong reference to the old lamp array: _last,
// the lamp-set and all-lights keys, and both viewpoints' rank/entry caches.
test("a track switch releases the previous track's lamp array (#2180)", async () => {
  const v8 = await import("node:v8");
  v8.setFlagsFromString("--expose-gc");
  const gc = vm.runInNewContext("gc");
  const { FL, clock } = load();
  const cars = new Array(10).fill({});
  let ref;
  (() => {
    const lit = { _lights: street(12) };
    ref = new WeakRef(lit._lights);
    const frame = { perChunkLights: 1 };
    for (let f = 0; f < 5; f++) {
      clock.now = f * 16;
      FL.setFrameLights(frame, lit, cars, [0, 1.2, 500 + f], 1, [0, 0, 1], 0);
      FL.viewLights(frame, [0, 1.2, 500 + f], [0, 0, -1]);   // the mirror's own caches too
    }
  })();
  const day = { _lights: null };
  const frame = {};
  FL.setFrameLights(frame, day, cars, [0, 1.2, 0], 1, [0, 0, 1], 0);
  assert.equal(frame.lights, null);
  await new Promise((r) => setImmediate(r));   // WeakRef targets stay alive for the job that made them
  gc();
  assert.equal(ref.deref(), undefined, "FrameLights still pins the old track._lights");
});
