// skidmarks-cadence.test.mjs — tyre marks are laid per SECOND of laying, not
// per rendered frame.
//
// WHY THIS EXISTS. stamp() was a 5-FRAME countdown with no dt: at the same
// speed a 144 Hz display packed marks 2.4x denser than 60 fps and a throttled
// 30 fps device left sparse dashes — while the particle emitters beside it in
// render() were already rate·dt gated. The cadence is now 5/60 s of laying.
// Run: node --test tests/unit/skidmarks-cadence.test.mjs   (npm run test:tooling-fast)
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { seedLog } from "../helpers/seed-log.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const SRC = fs.readFileSync(path.join(ROOT, "js/fx/skidmarks.js"), "utf8");

function make() {
  const ctx = vm.createContext({ Float32Array, Array, Math });
  seedLog(ctx);   // needs a contextified object
  const SkidMarks = vm.runInContext(SRC + ";SkidMarks", ctx);
  return SkidMarks.create();
}
const IDENT = (() => { const m = new Float32Array(16); m[0] = m[5] = m[10] = m[15] = 1; return m; })();
function count(skids) {
  let n = -1;
  skids.draw({ drawSkidBatch: (_verts, vertCount) => { n = vertCount / 6; return true; } }, [0, 0, 0]);
  return n;
}
function laidOver(seconds, hz) {
  const skids = make();
  const dt = 1 / hz, frames = Math.round(seconds * hz);
  for (let i = 0; i < frames; i++) skids.stamp(IDENT, true, dt);
  return count(skids);
}

test("two seconds of laying leaves the same trail at 30, 60 and 144 Hz", () => {
  const expected = 2 / (5 / 60);   // 24 stamps
  for (const hz of [30, 60, 144]) {
    const n = laidOver(2, hz);
    assert.ok(Math.abs(n - expected) <= 1, `${hz} Hz laid ${n} marks in 2 s; expected ~${expected} (frame-counted code gave ${2 * hz / 5})`);
  }
});

test("rain re-seeds only newly visible drops when the governor sheds less", () => {
  const moves = [];
  const c2d = {
    clearRect() {}, beginPath() {}, moveTo(x, y) { moves.push([x, y]); },
    lineTo() {}, stroke() {},
  };
  const canvas = { width: 0, height: 0, style: {}, getContext: () => c2d };
  let shed = 1, random = 0.5;
  const rngMath = Object.create(Math);
  rngMath.random = () => random;
  const ctx = vm.createContext({
    Math: rngMath, Float32Array, Uint8Array,
    document: { createElement: () => canvas, body: { appendChild() {} } },
    window: { innerWidth: 100, innerHeight: 100 },
    LightTune: { LT: { rainCount: 4, rainStreak: 1, rainWind: 0 } },
    PerfGov: { autoShed: () => shed },
  });
  seedLog(ctx);
  const rain = vm.runInContext(fs.readFileSync(path.join(ROOT, "js/fx/particles.js"), "utf8") + ";Particles", ctx);
  rain.rainSeed(false);
  rain.rainDraw(0.01, 0, true);
  assert.equal(moves.length, 2, "shed level 1 draws half the seeded rain");
  moves.length = 0;
  random = 0.75;
  shed = 0;
  rain.rainDraw(0.01, 0, true);
  assert.equal(moves.length, 4);
  assert.ok(moves[2][1] > 70 && moves[3][1] > 70,
    `returning drops used stale hidden positions: ${JSON.stringify(moves)}`);
});

test("the first stamp of a slide lands at once, and lifting off re-arms it", () => {
  const skids = make();
  skids.stamp(IDENT, true, 1 / 60);
  assert.equal(count(skids), 1, "no delay before the first mark of a slide");
  skids.stamp(IDENT, false, 1 / 60);   // grip returns
  skids.stamp(IDENT, true, 1 / 60);
  assert.equal(count(skids), 2, "the next slide starts with a mark too");
});

test("a caller that passes no dt is charged one nominal frame per call", () => {
  const skids = make();
  for (let i = 0; i < 10; i++) skids.stamp(IDENT, true);
  assert.equal(count(skids), 2, "ten nominal frames = the old five-frame cadence");
});
