// particles-dirty.test.mjs — rain-cell / pool dirty latch skips CPU expand and
// GPU upload when content is unchanged (static audit 2026-10-05 finding #4).
// Run: node --test tests/unit/particles-dirty.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { seedLog } from "../helpers/seed-log.mjs";
import { makeRng } from "../helpers/seeded-fuzz.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

function make(uploads) {
  const rng = makeRng(0xd117);
  const seededMath = Object.assign(Object.create(Math), { random: () => rng.unit() });
  const ctx = vm.createContext({
    Float32Array, Uint8Array, Array, Math: seededMath, Object,
    LightTune: { LT: { rainCount: 8, rainStreak: 1, rainWind: 0, windDir: 0, rainSpeed: 1, rainOpacity: 1 } },
    PerfGov: { autoShed: () => 0 },
  });
  seedLog(ctx);
  const P = vm.runInContext(fs.readFileSync(path.join(ROOT, "js/fx/particles.js"), "utf8") + ";Particles", ctx);
  P.init({
    drawParticles: (data, floats, additive, dirty) => {
      uploads.push({ floats, additive: !!additive, dirty: dirty !== false, data: data || null });
    },
  });
  return P;
}

test("parked rain expands at most ~30x/s (not every frame, not frozen) until the eye leaves the cell", () => {
  const uploads = [];
  const P = make(uploads);
  P.rainSeed(false);
  P.rainShow(true);
  P.resetStats();
  const eye = [100, 5, -30];
  P.rainUpdate(0.016, eye, true);
  P.draw();
  assert.equal(P.stats().expands, 1, "first wet frame expands");
  assert.ok(P.stats().uploadFloats > 0, "first wet frame uploads floats");
  const firstFloats = uploads[0].floats;
  assert.equal(uploads[0].dirty, true);

  uploads.length = 0;
  for (let i = 0; i < 30; i++) {
    P.rainUpdate(0.016, eye, true);   // drops fall, eye cell unchanged
    P.draw();
  }
  // bug-hunt 9.6: 30 frames x 16 ms = 0.48 s parked. The streaks must keep
  // falling (the old "expand once" froze them) but never re-expand per frame.
  const st = P.stats();
  assert.ok(st.skips >= 15, `most parked frames still skip expand (skips=${st.skips})`);
  assert.ok(st.expands >= 8 && st.expands <= 16, `parked rain re-expands ~30 Hz: ${st.expands} expands in 0.48 s`);
  assert.ok(uploads.some((u) => u.dirty === false), "skipped frames pass dirty=false");
  assert.ok(uploads.every((u) => u.floats === firstFloats), "re-issue keeps the last float count");

  uploads.length = 0;
  P.resetStats();
  P.rainUpdate(0.016, [eye[0] + 3, eye[1], eye[2]], true);   // leave 2 m rain cell
  P.draw();
  assert.equal(P.stats().expands, 1, "eye cell change expands again");
  assert.equal(uploads[0].dirty, true);
});

test("pool update dirties so moving smoke keeps uploading", () => {
  const uploads = [];
  const P = make(uploads);
  P.tyreSmoke(0, 0, 0, 1, 0, 1, 4);
  P.resetStats();
  P.update(0.016);
  P.draw();
  assert.equal(P.stats().expands, 1);
  P.update(0.016);
  P.draw();
  assert.equal(P.stats().expands, 2, "live pool particles re-expand every update");
  assert.ok(uploads.every((u) => u.dirty === true));
});
