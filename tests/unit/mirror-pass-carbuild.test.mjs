/* mirror-pass-carbuild — a mirror/PiP draw builds nothing (real CarDraw), the re-measure clock and the frozen-frame replay. No browser.
 * Split from mirror-pass.test.mjs (T3-16); the VM rig is tests/helpers/mirror-pass-rig.mjs. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { carDrawVm } from "../helpers/car-draw-vm.mjs";
import { read, boot } from "../helpers/mirror-pass-rig.mjs";

test("a mirror draw on a warmed field builds nothing: body-only mesh + the field wheels, never a whole car", () => {
  const v = carDrawVm();
  v.G.teamIdx = 0; v.G.driverIdx = 0;
  // The player at the front; the 21 rivals strung out behind it, 9 m apart.
  v.field((c, i) => (c.isPlayer ? 1000 : 1000 - 9 * i));
  v.carDraw.warmCarAssets();
  assert.ok(v.rec.builds.length > 0 && v.rec.builds.every(b => b.kind === "body"), "race entry warms bodies (no whole car)");
  const warmBuilds = v.rec.builds.length, warmWheels = v.rec.wheels;
  const mp = v.mirror();
  v.rec.draws.length = 0;
  v.draw(mp);
  assert.equal(mp.state().shown, true);
  assert.equal(mp.state().cars, 6, "FieldLod: the nearest 6 behind");
  assert.equal(v.rec.builds.length, warmBuilds, "a mirror draw builds no Car3D mesh");
  assert.equal(v.rec.wheels, warmWheels, "nor a wheel pair");
  const kinds = v.rec.draws.map(m => m.kind);
  assert.deepEqual(kinds.filter(k => k !== "wheel"), ["body", "body", "body", "body", "body", "body"], "one body-only mesh per rival");
  assert.equal(kinds.filter(k => k === "wheel").length, 24, "BARE wheels: the 4 rotating ones, no fixed layers / stripes / discs / rings");
  assert.ok(v.rec.draws.every(m => (m.kind === "wheel" ? m._field : true)), "the FIELD pair (getFieldWheelMeshes), the main pass's own");
  // Mid-race: the field reshuffles, so 6 DIFFERENT rivals are now the nearest.
  v.G.cars.forEach((c, i) => { if (!c.isPlayer) c.s = 1000 - 9 * (v.G.cars.length - i); });
  v.draw(mp);
  assert.equal(mp.state().cars, 6);
  assert.equal(v.rec.builds.length, warmBuilds, "a rival new to the mirror is a cache hit");
  // Night: the wheels take the main pass's night emissive, still nothing built.
  v.draw(mp, true);
  assert.equal(v.rec.builds.length, warmBuilds);
  assert.equal(v.rec.freed, 0, "nothing evicted from a bounded cache");
});

test("the broadcast PiP draws through the same meshes: its subject, its neighbours, the player's own body", () => {
  const v = carDrawVm();
  v.G.teamIdx = 2; v.G.driverIdx = 1;
  v.field((c, i) => 2000 - 9 * i);
  v.carDraw.warmCarAssets();
  const warm = v.rec.builds.length;
  const mp = v.mirror();
  v.classes.add("bc-on");
  for (const sub of [v.G.cars[7], v.G.cars[15], v.G.player]) {
    mp.setSubject(sub, "tcam");
    v.rec.draws.length = 0;
    v.draw(mp);
    assert.equal(mp.state().pip.shown, true);
    assert.ok(mp.state().cars >= 1);
    assert.equal(v.rec.builds.length, warm, "a PiP cut builds nothing (subject " + sub.code + ")");
    assert.ok(!v.rec.draws.some(m => m.kind === "whole"), "never a whole-car mesh");
  }
});

test("the shipped-before path, for contrast: teamMesh per mirror rival builds a whole car each", () => {
  // The counter above is only evidence if it can see the regression: the
  // previous drawCars body (teamMesh(c.team, c)) on the same warmed field.
  const v = carDrawVm();
  v.field((c, i) => (c.isPlayer ? 1000 : 1000 - 9 * i));
  v.carDraw.warmCarAssets();
  const warm = v.rec.builds.length;
  const mp = v.mirror({ drawCar: (c, m, paint) => v.G.gfx.draw(v.carDraw.teamMesh(c.team, c), m, paint) });
  v.draw(mp);
  const whole = v.rec.builds.slice(warm);
  assert.equal(whole.length, 6, "6 Car3D builds on the first mirror frame");
  assert.ok(whole.every(b => b.kind === "whole"));
});

const WHEEL_BASE = new Float32Array([0.8, 0.2, -0.3, 0, -0.1, 0.9, 0.15, 0, 0.4, -0.05, 0.85, 0, 14, 2, -9, 1]);
function wheelMatrices(v, draw) {
  v.rec.draws.length = v.rec.mats.length = 0;
  draw();
  return v.rec.mats.filter((_, i) => v.rec.draws[i].kind === "wheel");
}
// Independent geometry oracle: rotate each basis vector about the axle, then
// steer it, and transform that basis and the wheel centre into world space.
function expectedWheels(v, c, rear, front, frontsOnly = false, offset = 0, width = 1) {
  const radius = v.ctx.PhysicsConsts.WHEEL_STEER_VIS;
  let steer = Math.max(-1, Math.min(1, c.steerVis || 0)) * radius;
  if (!c.human) steer = Math.max(-radius, Math.min(radius, steer - Math.atan(3.3 * (c.kCur || 0))));
  else if (v.G.STEER_SPEED_REF > 0) steer /= 1 + Math.abs(c.speed || 0) * 95 / (v.G.vTop() * v.G.STEER_SPEED_REF);
  return v.carDraw.WHEELS.filter(w => !frontsOnly || w.front).map(w => {
    const spin = w.front ? front : rear, yaw = w.front ? steer : 0;
    const rotate = (x, y, z) => {
      const yy = y * Math.cos(spin) - z * Math.sin(spin);
      const zz = y * Math.sin(spin) + z * Math.cos(spin);
      return [x * Math.cos(yaw) + zz * Math.sin(yaw), yy, -x * Math.sin(yaw) + zz * Math.cos(yaw), 0];
    };
    const flat = w.front ? (c.flatSpot || 0) * 0.004 * (0.5 + 0.5 * Math.cos(front)) : 0;
    const local = new Float32Array([
      ...rotate(width, 0, 0), ...rotate(0, 1, 0), ...rotate(0, 0, 1),
      w.x + Math.sign(w.x) * (width - 1) * 0.16, w.y + flat, w.z + offset, 1,
    ]);
    return Array.from(new Float32Array(Array.from({ length: 16 }, (_, i) => {
      const row = i % 4, col = Math.floor(i / 4);
      return [0, 1, 2, 3].reduce((sum, k) => sum + WHEEL_BASE[k * 4 + row] * local[col * 4 + k], 0);
    })));
  });
}
function assertWheelMatrices(actual, expected, context) {
  assert.equal(actual.length, expected.length, context + ": rotating wheel count");
  for (let w = 0; w < actual.length; w++) for (let i = 0; i < 16; i++) {
    assert.ok(Math.abs(actual[w][i] - expected[w][i]) <= 2e-6,
      `${context}: wheel ${w}, matrix[${i}] = ${actual[w][i]}, expected ${expected[w][i]}`);
  }
}

test("wheel phases advance once before any view, and mirror/main/cockpit draws never touch traction state", () => {
  const v = carDrawVm();
  v.field((c, i) => 1000 - 9 * i);
  const c = v.G.player;
  c.steerVis = 0.4; c.flatSpot = 0.6;
  // Reading these would couple visual rotation back to the normalized slip
  // signal; writing them would let rendering change physics.
  for (const key of ["wheelSpin", "wheelSpinF"]) Object.defineProperty(c, key, {
    get() { assert.fail("render read physics " + key); },
    set() { assert.fail("render wrote physics " + key); },
  });
  const drawMain = () => v.carDraw.drawPlayerWheels(c, WHEEL_BASE, 0.02, {}, false, 0, 1);
  assertWheelMatrices(wheelMatrices(v, drawMain), expectedWheels(v, c, 0, 0), "never advanced");
  v.carDraw.advanceWheelPhases(0.02);
  const phase = (c.speed / 0.33) * 0.02;
  const mirror = wheelMatrices(v, () => v.carDraw.drawMirrorCar(c, WHEEL_BASE, {}, false));
  const main = wheelMatrices(v, drawMain);
  assertWheelMatrices(mirror, expectedWheels(v, c, phase, phase), "mirror first");
  assert.deepEqual(main, mirror, "the main view reads the phase already used by the second camera");
  assert.deepEqual(wheelMatrices(v, drawMain), main, "another draw does not integrate another frame");
  // Drive the real cockpit consumer (VISOR has no steering-wheel telemetry).
  Object.assign(v.ctx.CockpitOpts, { layout: () => ({ wheelS: 1, wheelY: 0, wheelZ: 0 }), interior: () => "carbon" });
  v.ctx.Car3D.cockpitMirrorGlass = () => [];
  const cockpit = () => v.carDraw.drawCockpitRig(c, WHEEL_BASE, 0.02, {}, true);
  assertWheelMatrices(wheelMatrices(v, cockpit), expectedWheels(v, c, phase, phase, true, 0.30, 1.4), "cockpit front wheels");
  assert.deepEqual(wheelMatrices(v, drawMain), main, "cockpit drawing leaves the shared phase unchanged");
});

test("wheel phases keep moving in mirror-only and offscreen frames, including lock-up, reverse and dt zero", () => {
  const v = carDrawVm();
  v.field((c, i) => 1000 - 9 * i);
  const c = v.G.cars[1];
  c.steerVis = -0.3; c.kCur = 0.025; c.flatSpot = 0.4;
  c.wheelSpin = 0.82; c.wheelSpinF = 0.27;
  const traction = [c.wheelSpin, c.wheelSpinF];
  let rear = 0, front = 0;
  const advance = (dt) => {
    rear = (rear + c.speed / 0.33 * dt) % (2 * Math.PI);
    front = (front + c.speed / 0.33 * dt * (1 - (c.wheelLock || 0))) % (2 * Math.PI);
    v.carDraw.advanceWheelPhases(dt);
  };
  const mirror = () => v.carDraw.drawMirrorCar(c, WHEEL_BASE, {}, false);
  advance(0.016);
  const first = wheelMatrices(v, mirror);
  assertWheelMatrices(first, expectedWheels(v, c, rear, front), "first mirror-only frame");
  advance(0.025);
  const second = wheelMatrices(v, mirror);
  assertWheelMatrices(second, expectedWheels(v, c, rear, front), "second mirror-only frame");
  assert.notDeepEqual(second, first, "a rival drawn only in the mirror still spins");
  advance(0.04); advance(0.013);   // fully offscreen: no draw in either view
  assertWheelMatrices(wheelMatrices(v, mirror), expectedWheels(v, c, rear, front), "offscreen re-entry");
  c.wheelLock = 1;
  const beforeLock = wheelMatrices(v, mirror);
  advance(0.02);
  const locked = wheelMatrices(v, mirror);
  assertWheelMatrices(locked, expectedWheels(v, c, rear, front), "locked fronts");
  assert.deepEqual(locked.slice(0, 2), beforeLock.slice(0, 2), "front rotation is frozen during a full lock");
  assert.notDeepEqual(locked.slice(2), beforeLock.slice(2), "rear rotation continues");
  c.wheelLock = 0.35; c.speed = -19;
  advance(0.02);
  const reverse = wheelMatrices(v, mirror);
  assertWheelMatrices(reverse, expectedWheels(v, c, rear, front), "reverse with partial lock");
  advance(0);
  assert.deepEqual(wheelMatrices(v, mirror), reverse, "a zero-dt frame does not advance");
  assert.deepEqual([c.wheelSpin, c.wheelSpinF], traction, "traction fields retain their physics values");
});

test("steering uses one sine/cosine pair per car while preserving all four wheel matrices", () => {
  for (const human of [false, true]) {
    const v = carDrawVm();
    v.field((c, i) => 1000 - 9 * i);
    const c = v.G.cars[1];
    Object.assign(c, { human, steerVis: -0.55, kCur: 0.018, speed: 72, wheelLock: 0.4, flatSpot: 0.7 });
    v.G.STEER_SPEED_REF = 45;
    v.carDraw.advanceWheelPhases(0.013);
    let trig = 0;
    const countedMath = Object.create(Math);
    countedMath.sin = (x) => { trig++; return Math.sin(x); };
    countedMath.cos = (x) => { trig++; return Math.cos(x); };
    v.ctx.Math = countedMath;
    const actual = wheelMatrices(v, () => v.carDraw.drawPlayerWheels(c, WHEEL_BASE, 0, {}, false, 0, 1, true));
    assert.equal(trig, 6, "four phase trig calls + one steering sine/cosine pair, human=" + human);
    const phase = c.speed / 0.33 * 0.013;
    assertWheelMatrices(actual, expectedWheels(v, c, phase, phase * 0.6), "steering, human=" + human);
  }
});

// The layout re-read runs on the CLOCK (500 ms), not every 30 frames — a frame
// count is not a clock (docs/notes/PERF-FINDINGS.md §2n) — and side() writes the
// <body> class and custom properties only when they change: each write
// invalidates style page-wide, and the layout is still almost every time.
test("the mirror re-measures on a 500 ms clock and leaves <body> alone when the side layout has not moved", () => {
  const box = (left, top, width, height) => ({ left, top, width, height, right: left + width, bottom: top + height });
  const h = boot({ mode: "on", boxes: { pausebtn: box(1226, 8, 44, 44) } });
  let reads = 0;
  const raw = h.frameEl.getBoundingClientRect;
  h.frameEl.getBoundingClientRect = () => { reads++; return raw(); };
  h.render();
  const first = reads;
  assert.ok(first > 0, "the first frame measures");
  assert.ok(h.classes.has("hud-mirror-side"));
  const w0 = { ...h.writes };
  for (let i = 0; i < 60; i++) h.render();
  assert.equal(reads, first, "60 frames inside 500 ms: no layout read (it was one every 30 FRAMES)");
  h.clock.t = 499; h.render();
  assert.equal(reads, first, "still inside the window");
  h.clock.t = 500; h.render();
  assert.ok(reads > first, "the clock re-measures");
  assert.deepEqual(h.writes, w0, "same layout: no class toggle, no custom-property write");
  // The layout moves: the new values are written.
  h.frameEl.getBoundingClientRect = () => { reads++; return { left: 400, top: 70, width: 400, height: 114, right: 800, bottom: 184 }; };
  h.clock.t = 1000; h.render();
  assert.equal(h.props["--mir-side-x"], "808.0px");
  assert.ok(h.writes.prop > w0.prop);
  // A state change still measures on the very next frame (no 500 ms wait).
  h.mp.setMode("off"); h.render();
  h.mp.setMode("on"); const r = reads; h.render();
  assert.ok(reads > r, "re-shown: measured at once");
  assert.ok(h.classes.has("hud-mirror-side"), "hiding cleared the class; showing re-applies it");
});

// L4: drawWorldMeshes recorded `b._mirMats` on EVERY non-frozen draw, the MAIN camera
// pass included. Per game frame the mirror pass runs first and the main pass second,
// so the next frame's frozen mirror pass replayed the FORWARD camera's cull pack
// (rear scenery alternating right/wrong at ~30 Hz) and the main pass copied every
// visible matrix for nothing. The block is executed straight from game.js's source.
test("a frozen mirror frame replays the MIRROR pass's pack, never the main camera's (L4)", () => {
  const src = read("js/game.js");
  const a = src.indexOf("const _pb = track.meshes.propBatches;");
  const z = src.indexOf("if (!envProbe) gfx.drawChunked(track.meshes.props", a);
  assert.ok(a > 0 && z > a, "the instanced-batch block is still where the test slices it");
  const run = new Function("frame", "gfx", "track", "_pbPlanes", "m", "envProbe", src.slice(a, z));
  const updates = [];
  const gfx = {
    drawInstanced() {},
    makeFrustumPlanes: (vp) => ({ tag: vp[0] }),
    // The cull packs ONE matrix whose first lane names the camera that culled it.
    cullInstances(b, planes) {
      b.visible = 1; b.packMatrices[0] = planes.tag;
      if (b.packColors) { b.packColors[0] = planes.tag; b.packColors[1] = 0.2; b.packColors[2] = 0.3; }
    },
    updateInstances(b, mats, n, cols) { updates.push({ tag: mats[0], n, col: cols && cols[0] }); },
  };
  const b = { visible: 0, packMatrices: new Float32Array(16 * 4), packColors: new Float32Array(12) };
  const track = { meshes: { propBatches: [b] } };
  const MIRROR = 2, MAIN = 1;
  const mirrorFrame = (freeze) => ({ viewProj: [MIRROR], mirrorLite: false, mirrorFreezeInstanced: freeze });
  const mainFrame = () => ({ viewProj: [MAIN] });   // mirror-pass leaves both flags undefined here
  run(mirrorFrame(false), gfx, track, [], {}, false);   // frame 1: mirror refreshes its pack
  run(mainFrame(), gfx, track, [], {}, false);          //          then the main camera culls
  assert.equal(b._mirMats[0], MIRROR, "the main pass must not overwrite the mirror's recorded pack");
  assert.equal(b._mirCols[0], MIRROR, "per-instance colours are frozen with the matrices");
  run(mirrorFrame(true), gfx, track, [], {}, false);    // frame 2: the mirror is frozen
  assert.deepEqual(updates, [{ tag: MIRROR, n: 1, col: MIRROR }], "the frozen frame replays mats+colours");
  // A main pass alone records nothing (no per-frame memcpy with the mirror off).
  const solo = { visible: 0, packMatrices: new Float32Array(16) };
  run(mainFrame(), gfx, { meshes: { propBatches: [solo] } }, [], {}, false);
  assert.equal(solo._mirMats, undefined, "the main pass does not copy into _mirMats");
});
