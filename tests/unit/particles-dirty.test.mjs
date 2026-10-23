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
import { absSrc } from "../helpers/abs-src.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

function make(uploads, wind, opts = {}) {
  const rng = makeRng(0xd117);
  const seededMath = Object.assign(Object.create(Math), { random: () => rng.unit() });
  const ctx = vm.createContext({
    Float32Array, Uint8Array, Array, Math: seededMath, Object,
    LightTune: { LT: { rainCount: opts.count || 8, drizzleCount: opts.drizzleCount ?? 0.3, rainStreak: 1, rainWind: wind ? 0.18 : 0, windDir: 0, rainSpeed: 1, rainOpacity: 1 } },
    PerfGov: { autoShed: () => 0 },
    Wind: { state: () => wind },
  });
  seedLog(ctx);
  const P = vm.runInContext(fs.readFileSync(path.join(ROOT, "js/fx/particles.js"), "utf8") + ";Particles", ctx, { filename: absSrc("js/fx/particles.js") });
  P.init({
    mobileTier: !!opts.mobile,
    drawParticles: (data, floats, additive, dirty) => {
      uploads.push({ floats, additive: !!additive, dirty: dirty !== false, data: data || null });
    },
  });
  return P;
}

test("continuous rainfall scales the bounded particle field and clears stale geometry at zero", () => {
  const uploads = [], P = make(uploads), eye = [100, 5, -30];
  P.rainSeed(false); P.rainShow(true);
  P.rainUpdate(0.016, eye, 1); P.draw();
  const full = uploads.at(-1).floats;
  P.rainUpdate(0.016, eye, 0.5); P.draw();
  assert.ok(uploads.at(-1).floats > 0 && uploads.at(-1).floats < full);
  uploads.length = 0;
  P.rainUpdate(0.016, eye, 0); P.draw();
  assert.equal(uploads.length, 0, "no previous field is submitted");
  P.rainUpdate(0.016, eye, 1); P.draw();
  assert.equal(uploads.at(-1).floats, full, "the field recovers within its original cap");
});

test("rain streaks drift with the actual race wind vector", () => {
  const centreX = (wx) => {
    const uploads = [], P = make(uploads, { on: true, wx, wz: 0 });
    P.rainSeed(false); P.rainShow(true);
    P.rainUpdate(0.05, [100, 5, -30], true); P.draw();
    const data = uploads[0].data;
    let x = 0;
    for (let v = 0; v < 6; v++) x += data[v * 10 + 2];
    return x / 6;
  };
  assert.ok(centreX(8) > centreX(-8), "opposite winds move the same seeded drop in opposite directions");
});

test("arc and static drizzle have the same density with phone caps and custom drizzle settings", () => {
  for (const mobile of [false, true]) for (const drizzleCount of [0.1, 0.3, 0.8]) {
    const draw = (drizzle) => {
      const uploads = [], P = make(uploads, null, { mobile, count: 650, drizzleCount });
      P.rainSeed(drizzle); P.rainShow(true);
      P.rainUpdate(0, [100, 5, -30], 0.5); P.draw();
      const u = uploads.at(-1);
      return { floats: u?.floats || 0, first: u ? Array.from(u.data.slice(0, 60)) : [] };
    };
    assert.deepEqual(draw(false), draw(true), `same density, alpha and streak shape: mobile ${mobile}, drizzle ${drizzleCount}`);
  }
});

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

test("clear() disposes the pool and flare latch so draw cannot resurrect them", () => {
  const uploads = [];
  const P = make(uploads);
  P.tyreSmoke(0, 0, 0, 1, 0, 1, 8);
  P.flare(0, 1, 0, 1, 1, 0, 0, 1, true);
  P.update(0.016);
  P.draw();
  assert.ok(P.count() > 0);
  assert.ok(uploads.length > 0);
  uploads.length = 0;
  P.clear();
  assert.equal(P.count(), 0);
  assert.equal(P.flareCount(), 0);
  P.draw();
  assert.equal(uploads.length, 0, "cleared pool must not re-issue the previous batch");
  // Rain stays under rainShow/rainSeed — clear must not hide a wet field.
  P.rainSeed(false); P.rainShow(true);
  P.rainUpdate(0.016, [0, 5, 0], true); P.draw();
  assert.ok(uploads.length > 0, "rain still draws after a pool clear");
});


test("one-frame flares refresh additive data while clean rain reuses alpha", () => {
  const uploads = [], P = make(uploads), eye = [100, 5, -30];
  P.rainSeed(false); P.rainShow(true); P.rainUpdate(0.001, eye, true); P.draw();
  const floats = uploads[0].floats;
  P.resetStats(); uploads.length = 0;
  P.flare(100, 5, -30, 1, 1, 0, 0, 1, true);
  P.rainUpdate(0.001, eye, true); P.draw();
  assert.equal(uploads.find((u) => !u.additive).dirty, false);
  assert.equal(uploads.find((u) => u.additive).dirty, true);
  assert.equal(P.stats().uploadFloats, 60);
  assert.equal(P.stats().alphaExpands, 0); assert.equal(P.stats().additiveExpands, 1);
  uploads.length = 0; P.rainUpdate(0.001, eye, true); P.draw();
  assert.equal(uploads.length, 1, "removed flare is absent from the next frame");
  assert.equal(uploads[0].floats, floats); assert.equal(uploads[0].dirty, false);
});

test("rain offsets wrap across several widths in either camera direction", () => {
  const uploads = [], P = make(uploads);
  P.rainSeed(false); P.rainShow(true);
  let eye = [0, 0, 0]; P.rainUpdate(0.01, eye, true); P.draw();
  for (const next of [[30, 0, 0], [0, 30, 0], [-30, 0, 0], [-30, -30, 0], [-30, -30, 30]]) {
    uploads.length = 0; eye = next; P.rainUpdate(0.01, eye, true); P.draw();
    const u = uploads[0]; assert.ok(u);
    for (let i = 0; i < u.floats; i += 60) {
      const center = (k) => (u.data[i + k] + u.data[i + 20 + k]) / 2 - eye[k - 2];
      assert.ok(Math.abs(center(2)) <= 9.0001); assert.ok(Math.abs(center(4)) <= 9.0001);
      assert.ok(center(3) >= -3.0001 && center(3) <= 5.0001);
    }
  }
});
