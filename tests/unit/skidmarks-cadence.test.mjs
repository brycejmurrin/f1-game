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
  // The shower is a streak FIELD drawn through the alpha particle batch: six
  // vertices of [cornerX, cornerY, x, y, z, r, g, b, size, alpha] a drop, size
  // 0 (the corners are pre-expanded), inside a box around the eye. No DOM: the
  // context has no document, so a canvas path would throw here.
  let shed = 1;
  const calls = [];
  const ctx = vm.createContext({
    Float32Array, Uint8Array, Array, Math, Object,
    LightTune: { LT: { rainCount: 4, rainStreak: 1, rainWind: 0, windDir: 0 } },
    PerfGov: { autoShed: () => shed },
  });
  seedLog(ctx);
  const rain = vm.runInContext(fs.readFileSync(path.join(ROOT, "js/fx/particles.js"), "utf8") + ";Particles", ctx);
  rain.init({ drawParticles: (data, floats, additive) => calls.push({ data: Array.from(data.subarray(0, floats)), floats, additive }) });
  rain.rainSeed(false);
  rain.rainShow(true);
  assert.ok(rain.rainActive());
  const eye = [100, 5, -30];
  rain.rainUpdate(0.01, eye, true);
  rain.draw();
  assert.equal(calls.length, 1, "one alpha batch, no additive batch");
  assert.equal(calls[0].floats, 2 * 6 * 10, "shed level 1 draws half the seeded rain");
  const drops = (c) => { const out = []; for (let i = 0; i < c.floats; i += 60) out.push(c.data.slice(i, i + 60)); return out; };
  for (const d of drops(calls[0])) {
    for (let v = 0; v < 6; v++) {
      const o = v * 10;
      assert.equal(d[o + 8], 0, "size 0: the shader adds nothing to the expanded corner");
      assert.ok(d[o + 9] > 0 && d[o + 9] <= 1, `alpha in (0, 1]: ${d[o + 9]}`);
      assert.ok(Math.abs(d[o + 2] - eye[0]) <= 15 && Math.abs(d[o + 4] - eye[2]) <= 15 && d[o + 3] - eye[1] > -5 && d[o + 3] - eye[1] < 8,
        `drop corner inside the box around the eye: ${d.slice(o + 2, o + 5)}`);
      for (let k = 0; k < 10; k++) assert.ok(Number.isFinite(d[o + k]), "no NaN in the batch");
    }
  }
  // Hidden drops do not advance while shedding; the returning tail is re-scattered.
  for (let i = 0; i < 200; i++) rain.rainUpdate(0.05, eye, true);   // 10 s: every shown drop has wrapped at least once
  calls.length = 0;
  shed = 0;
  rain.rainUpdate(0.01, eye, true);
  rain.draw();
  assert.equal(calls[0].floats, 4 * 6 * 10, "density returns when the governor recovers");
  for (const d of drops(calls[0])) {
    assert.ok(d[3] - eye[1] > -5 && d[3] - eye[1] < 8, `after 10 s every drop still sits inside the box (wrap): y ${d[3] - eye[1]}`);
  }
  // A moving camera: the apparent velocity rakes the streak toward the motion,
  // so the quad's long axis gains a horizontal component.
  calls.length = 0;
  rain.rainUpdate(0.02, [eye[0] + 1.2, eye[1], eye[2]], true);   // 60 m/s along +x
  rain.draw();
  let raked = 0;
  for (const d of drops(calls[0])) {
    const dx = Math.abs(d[2 + 20] - d[2]), dy = Math.abs(d[3 + 20] - d[3]);   // corner (-1,-1) vs (1,1): the diagonal
    if (dx > dy * 2) raked++;
  }
  assert.ok(raked >= 3, `at 60 m/s most streaks lie nearly horizontal (${raked}/4)`);
  rain.rainShow(false);
  calls.length = 0;
  rain.draw();
  assert.equal(calls.length, 0, "hidden: nothing drawn");
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
