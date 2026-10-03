// mirror-lights — the rear-view mirror ranks its OWN lamps (FrameLights.viewLights).
//
// frame.lights is culled for the FORWARD camera, and that cull pushes lamps
// behind the camera down the ranking (lampBehindBias) — exactly the lamps a
// rear-view mirror shows. On a phone's 24-slot budget or a dense street grid
// they joined and left the forward set as the car moved, so the light in the
// mirror stepped (user report 2026-10-03: "the in-game mirror is flashing").
//
// A street circuit: lamps every 12-25 m on both sides of a straight, the car at
// 60 m/s and 60 fps. The metric is the mirror's lamp light (a smooth window
// over 0-120 m behind the car, so the window itself never steps) as a share of
// the same window with EVERY lamp at full strength; a frame-to-frame change of
// more than 10% of the light present is a visible flash. Pure: the real module in a vm with
// a clock and knob stubs. Under a second.
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
  const ctx = { performance: { now: () => clock.now }, Math, Float32Array, Uint32Array, Array, Object,
    LightKnobs: { LT: { lampWarmup: 0, lampFlicker: 0 } }, PerfGov: { tier: () => 0 } };
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

// Smooth 0-at-both-ends window over the 120 m behind the car.
const win = (dz) => (dz < 0 && dz > -120 ? Math.sin(Math.PI * -dz / 120) : 0);

function drive({ spacing, mobile, mirror }) {
  const { FL, clock } = load();
  const lamps = street(spacing), track = { _lights: lamps };
  const cars = new Array(10).fill({}), frame = {};
  const kept = [];
  for (let f = 0; f < 600; f++) {
    clock.now = f * 1000 / 60;
    const ez = 500 + f, eye = [0, 1.2, ez];   // 60 m/s at 60 fps
    FL.setFrameLights(frame, track, cars, eye, 1, [0, 0, 1], mobile);
    frame.tailStart = (frame.lights.length / 15) | 0; frame.tailCount = 0;
    let L = frame.lights;
    if (mirror) { const v = FL.viewLights(frame, eye, [0, 0, -1]); if (v) L = v.lights; }
    let sum = 0, ideal = 0;
    for (let i = 0; i < L.length; i += 15) sum += win(L[i + 2] - ez) * L[i + 3];
    for (let i = 0; i < lamps.length; i += 15) ideal += win(lamps[i + 2] - ez) * lamps[i + 3];
    kept.push(sum / ideal);
  }
  const s = kept.slice(30);   // past the entry ramp of the very first frame
  const jumps = s.slice(1).filter((v, i) => Math.abs(v - s[i]) / Math.max(0.05, (v + s[i]) / 2) > 0.10).length;
  return { kept: s.reduce((a, b) => a + b, 0) / s.length, jumps };
}

for (const [spacing, mobile] of [[25, 1], [12, 0], [12, 1]]) {
  test(`mirror light is steady: ${spacing} m lamps, ${mobile ? "phone (24 slots)" : "desktop"}`, () => {
    const fwd = drive({ spacing, mobile, mirror: false });
    const rear = drive({ spacing, mobile, mirror: true });
    assert.ok(fwd.jumps > 20, `the forward set must reproduce the flash in the mirror window (${fwd.jumps} jumps)`);
    assert.equal(rear.jumps, 0, `mirror-ranked lamps: no frame-to-frame step over 10% (was ${fwd.jumps})`);
    assert.ok(rear.kept > fwd.kept, `the mirror keeps more of its own light (${rear.kept.toFixed(2)} vs ${fwd.kept.toFixed(2)})`);
  });
}

test("the forward camera's lamps are unchanged by the viewLights refactor (bit-for-bit against the previous module)", () => {
  // The cull moved into _rankSet(state, …); the forward path must produce the
  // very same records it did before, with or without a mirror pass in between.
  const prev = path.join(ROOT, "tests/data/frame-lights.pre-viewlights.txt");
  assert.ok(fs.existsSync(prev), "baseline copy of the pre-refactor module");
  const mk = (src) => {
    const clock = { now: 0 };
    const ctx = { performance: { now: () => clock.now }, Math, Float32Array, Uint32Array, Array, Object,
      LightKnobs: { LT: { lampWarmup: 0, lampFlicker: 0.3 } }, PerfGov: { tier: () => 0 } };
    vm.createContext(ctx);
    vm.runInContext(read("js/render/shared/light-budget.js") + "\n;globalThis.LightBudget = LightBudget;", ctx);
    vm.runInContext(src + "\n;globalThis.FrameLights = FrameLights;", ctx);
    return { FL: ctx.FrameLights, clock };
  };
  const a = mk(fs.readFileSync(prev, "utf8")), b = mk(read("js/lighting/frame-lights.js"));
  const track = { _lights: street(12) }, cars = new Array(10).fill({});
  const fa = {}, fb = {};
  for (let f = 0; f < 300; f++) {
    a.clock.now = b.clock.now = f * 1000 / 60;
    const yaw = Math.sin(f / 40) * 0.6, eye = [Math.sin(f / 50) * 3, 1.2, 500 + f], fwd = [Math.sin(yaw), 0, Math.cos(yaw)];
    a.FL.setFrameLights(fa, track, cars, eye, [1, 0.9, 0.8], fwd, f > 150 ? 1 : 0);
    b.FL.setFrameLights(fb, track, cars, eye, [1, 0.9, 0.8], fwd, f > 150 ? 1 : 0);
    fb.tailStart = (fb.lights.length / 15) | 0; fb.tailCount = 0;
    b.FL.viewLights(fb, eye, [-fwd[0], 0, -fwd[2]]);   // a mirror pass between frames must not disturb it
    assert.deepEqual(Array.from(fb.lights), Array.from(fa.lights), `frame ${f}`);
  }
});

test("tail-light records ride along, and an uncut set needs no re-rank", () => {
  const { FL } = load();
  const frame = {}, cars = new Array(10).fill({});
  FL.setFrameLights(frame, { _lights: street(12) }, cars, [0, 1.2, 500], 1, [0, 0, 1], 1);
  const lamps = (frame.lights.length / 15) | 0;
  frame.lights.push(1, 2, 3, 4.5, 0.14, 0.1, 8, 0, -0.5, -0.87, 0.5, -0.2, 0.12, 0.25, 0.4);
  frame.tailStart = lamps; frame.tailCount = 1;
  const v = FL.viewLights(frame, [0, 1.2, 500], [0, 0, -1]);
  assert.equal(v.tailCount, 1);
  assert.equal(v.lights.length / 15, lamps + 1, "same fill budget: the forward set's lamps plus its tail-lights");
  assert.deepEqual(Array.from(v.lights.slice(v.tailStart * 15, v.tailStart * 15 + 3)), [1, 2, 3], "the tail-light record is carried over");
  const few = {};
  FL.setFrameLights(few, { _lights: street(1000) }, cars, [0, 1.2, 500], 1, [0, 0, 1], 0);
  assert.equal(FL.viewLights(few, [0, 1.2, 500], [0, 0, -1]), null, "every lamp already in frame.lights: nothing to re-rank");
});

test("the mirror pass swaps in its own lamps and puts the forward set back", () => {
  const src = read("js/render/shared/mirror-pass.js");
  assert.match(src, /FrameLights\.viewLights\(frame, _eye, _aim\)/);
  assert.match(src, /frame\.lights = sv\.lights; frame\.tailStart = sv\.tailStart; frame\.tailCount = sv\.tailCount;/,
    "restored in the same finally as the camera");
});
