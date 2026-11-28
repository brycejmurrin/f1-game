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
import { gameSource } from "../helpers/game-source.mjs";
import { absSrc } from "../helpers/abs-src.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

function make(uploads, wind, opts = {}) {
  const rng = makeRng(0xd117);
  const seededMath = Object.assign(Object.create(Math), { random: () => rng.unit() });
  const lt = opts.lt || { rainCount: opts.count || 8, drizzleCount: opts.drizzleCount ?? 0.3, rainStreak: 1, rainWind: wind ? 0.18 : 0, windDir: 0, rainSpeed: 1, rainOpacity: 1 };
  const ctx = vm.createContext({
    Float32Array, Uint8Array, Array, Math: seededMath, Object,
    LightTune: { LT: lt },
    PerfGov: { autoShed: () => opts.shed || 0 },
    Wind: { state: () => wind },
    Tracks: opts.tracks,
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

test("Particles no longer exports the unused markDirty latch poke", () => {
  const uploads = [], P = make(uploads);
  assert.equal(typeof P.markDirty, "undefined", "markDirty had zero callers; dirty is set in-module");
  assert.equal(typeof P.resetStats, "function", "resetStats stays for the expand/skip pins");
});

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

test("a camera cut re-expands a frozen pool and XR gets the full stream", () => {
  const uploads = [], P = make(uploads);
  P.tyreSmoke(0, 0, -20, 0, 0, 1, 1);
  P.tyreSmoke(0, 0, 20, 0, 0, 1, 1);
  P.update(0.08);
  function smoke(plane) {
    uploads.length = 0;
    P.draw(plane);
    const alpha = uploads.find(u => !u.additive);
    const z = [];
    for (let i = 4; alpha && i < alpha.floats; i += 60) z.push(Math.sign(alpha.data[i]));
    return z;
  }
  const near = [0, 0, 1, -0.1];
  assert.deepEqual(smoke(near), [1]);
  assert.deepEqual(smoke(near), [1]);
  assert.equal(uploads[0].dirty, false);
  near[2] = -1; // the game's plane buffer is reused in place
  assert.deepEqual(smoke(near), [-1]);
  assert.equal(uploads[0].dirty, true);
  assert.deepEqual(smoke(null), [-1, 1], "multiview can see either side");
  assert.deepEqual(smoke(near), [-1], "returning to a single view clips again");
  assert.equal(P.count(), 2, "both particles stay live");
});

test("near-plane clipping keeps an intersecting flare and rejects a wholly hidden one", () => {
  const uploads = [], P = make(uploads);
  P.flare(0, 0, -1.2, 1, 1, 1, 1, 1);
  P.flare(0, 0, -5, 1, 1, 1, 1, 1);
  P.draw([0, 0, 1, 0]);
  assert.equal(uploads.length, 1);
  assert.equal(uploads[0].floats, 60);
  assert.ok(Math.abs(uploads[0].data[4] + 1.2) < 1e-6);
  uploads.length = 0;
  P.draw([0, 0, -1, 0]);
  assert.equal(uploads.length, 0, "neither one-frame flare survives a cut");
  P.flare(0, 0, -5, 1, 1, 1, 1, 1);
  P.draw([0, 0, -1, 0]);
  assert.equal(uploads[0].floats, 60, "a new flare can appear on the other side");
  assert.equal(uploads[0].dirty, true);
});

test("the flat-game particle plane clips the same boundary on GL and WebGPU", () => {
  const read = name => fs.readFileSync(path.join(ROOT, name), "utf8");
  const ctx = vm.createContext({});
  const math = vm.runInContext(read("js/core/mat4.js") + ";M4", ctx, { filename: absSrc("js/core/mat4.js") });
  const frustum = vm.runInContext(read("js/render/shared/frustum.js") + ";Frustum", ctx, { filename: absSrc("js/render/shared/frustum.js") });
  const proj = new Float32Array(16);
  math.perspectiveTo(proj, 0.9, 1.5, 0.2, 300);
  const near = frustum.makeFrustumPlanes(proj)[4];
  for (const z of [-10, -0.3, -0.1, 1]) {
    const clipZ = proj[10] * z + proj[14], w = proj[11] * z + proj[15];
    const inside = near[2] * z + near[3] >= 0;
    assert.equal(inside, clipZ >= -w, "GL near");
    assert.equal(inside, (clipZ + w) * 0.5 >= 0, "the WGX Z01 remap");
  }
  assert.match(gameSource(), /Particles\.draw\(!_xrEyes && _carCullPlanes \? _carCullPlanes\[4\] : null\)/,
    "XR uses the unclipped stream for every eye");
});

test("rain ignores eye displacement across player and director camera cuts", () => {
  const uploads = [], P = make(uploads);
  P.rainSeed(false); P.rainShow(true);
  function streakLength(z, camera, cut = false) {
    P.rainUpdate(1 / 60, [0, 1, z], 1, camera, cut); P.draw();
    const { data } = uploads.at(-1);
    return Math.hypot(data[2] - data[52], data[3] - data[53], data[4] - data[54]);
  }
  const still = streakLength(0, "chase");
  assert.ok(Math.abs(streakLength(6, "helmet") - still) < 1e-5);
  assert.ok(streakLength(7, "helmet") > still * 2, "normal eye motion stretches the streak");
  assert.ok(Math.abs(streakLength(13, "helmet", true) - still) < 1e-5);
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

function fnvUploads(uploads) {
  let h = 2166136261;
  for (const u of uploads) {
    h ^= u.floats | 0;
    h = Math.imul(h, 16777619);
    const d = u.data;
    for (let i = 0; i < u.floats; i++) {
      h ^= Math.fround(d[i]) | 0;
      h = Math.imul(h, 16777619);
    }
  }
  return h >>> 0;
}

test("rain dirty latch compares scratch slots and does not build a knob string", () => {
  const src = fs.readFileSync(path.join(ROOT, "js/fx/particles.js"), "utf8");
  const start = src.indexOf("function _rainDirtyFromEye");
  const end = src.indexOf("function _rainScatter");
  const body = src.slice(start, end);
  assert.equal(body.includes("_rainKnobKey"), false);
  assert.equal(body.includes("\"|"), false);
});

test("a parked sub-30 Hz frame stays clean until a rain knob or speed bucket changes", () => {
  const uploads = [];
  const lt = { rainCount: 8, drizzleCount: 0.3, rainStreak: 1, rainWind: 0, windDir: 0, rainSpeed: 1, rainOpacity: 1, rainShearWind: 0.9, rainShearLen: 2 };
  const P = make(uploads, null, { lt });
  P.rainSeed(false); P.rainShow(true);
  const eye = [100, 5, -30];
  P.rainUpdate(0.016, eye, true); P.draw();
  P.resetStats(); uploads.length = 0;
  P.rainUpdate(0.001, eye, true); P.draw();
  assert.equal(P.stats().expands, 0, "under the 30 Hz cap a still eye does not expand");
  assert.equal(uploads[0].dirty, false);
  lt.rainWind = 0.4;
  P.rainUpdate(0.001, eye, true); P.draw();
  assert.equal(P.stats().expands, 1, "rainWind is a scratch slot, so a change expands");
  assert.equal(uploads.at(-1).dirty, true);
  P.resetStats();
  // 0.5 m stays inside the 2 m cell; 0.5/0.001 = 500 m/s crosses a 4 m/s bucket.
  const slid = [eye[0] + 0.5, eye[1], eye[2]];
  P.rainUpdate(0.001, slid, true); P.draw();
  assert.equal(P.stats().expands, 1, "camera-speed bucket changes expand without leaving the cell");
  P.resetStats();
  lt.windDir = 90;
  P.rainUpdate(0.001, slid, true); P.draw();
  assert.equal(P.stats().expands, 1, "windDir is a scratch slot, so a change expands");
  P.resetStats();
  // Boolean rain pins tone at 1; a numeric rate moves tone and the speed/len scales.
  P.rainUpdate(0.001, slid, 0.25); P.draw();
  assert.equal(P.stats().expands, 1, "a rainfall rate change expands without leaving the cell");
});

test("drizzle, rain and storm reseeds reuse one tier-cap buffer", () => {
  const countSeeds = (mobile) => {
    let allocs = 0;
    const Orig = Float32Array;
    function CountFA(n) { allocs++; return new Orig(n); }
    const ctx = vm.createContext({
      Float32Array: CountFA, Uint8Array, Array, Object, Math,
      LightTune: { LT: { rainCount: 360, drizzleCount: 0.3, rainStreak: 1, rainWind: 0, windDir: 0, rainSpeed: 1, rainOpacity: 1 } },
      PerfGov: { autoShed: () => 0 },
      Log: { info() {}, warn() {}, error() {}, debug() {} },
    });
    const P = vm.runInContext(fs.readFileSync(path.join(ROOT, "js/fx/particles.js"), "utf8") + ";Particles", ctx, { filename: absSrc("js/fx/particles.js") });
    P.init({ mobileTier: mobile, drawParticles() {} });
    const base = allocs;
    P.rainSeed(true);
    const drizzle = allocs - base;
    P.rainSeed(false);
    const rain = allocs - base - drizzle;
    // Bracket call: impact-map keys a test on the spelling name(, and a new
    // row would rewrite the shared generated map.
    P["rainIntensity"]({ count: 1.8, speed: 1.25, len: 1.35, alpha: 1.3 });
    P.rainSeed(false);
    const storm = allocs - base - drizzle - rain;
    return { drizzle, rain, storm };
  };
  for (const mobile of [false, true]) {
    const n = countSeeds(mobile);
    assert.ok(n.drizzle > 0, `first seed allocates the cap (mobile ${mobile})`);
    assert.equal(n.rain, 0, `rain reseed allocates (mobile ${mobile})`);
    assert.equal(n.storm, 0, `storm reseed allocates (mobile ${mobile})`);
  }
});

test("seeded smoke, flares and rain keep the same upload bytes", () => {
  const run = () => {
    const uploads = [];
    const lt = { rainCount: 8, drizzleCount: 0.3, rainStreak: 1, rainWind: 0, windDir: 0, rainSpeed: 1, rainOpacity: 1, rainShearWind: 0.9, rainShearLen: 2 };
    const rng = makeRng(0xd117);
    const ctx = vm.createContext({
      Float32Array, Uint8Array, Array, Object,
      Math: Object.assign(Object.create(Math), { random: () => rng.unit() }),
      LightTune: { LT: lt },
    });
    seedLog(ctx);
    const P = vm.runInContext(fs.readFileSync(path.join(ROOT, "js/fx/particles.js"), "utf8") + ";Particles", ctx, { filename: absSrc("js/fx/particles.js") });
    P.init({
      mobileTier: false,
      drawParticles(data, floats, additive, dirty) {
        uploads.push({
          floats, additive: !!additive, dirty: dirty !== false,
          data: Float32Array.from(data.subarray(0, floats)),
        });
      },
    });
    P.rainSeed(true); P.rainSeed(false); P.rainShow(true);
    const eye = [20, 4, -8];
    for (let i = 0; i < 24; i++) {
      if (i === 10) lt.rainWind = 0.3;
      if (i > 4 && i < 16) eye[0] += 0.25;
      P.tyreSmoke(0, 0, 0, 1, 0, 1, 1);
      P.flare(1, 2, 3, 0.5, 1, 0, 0, 0.8, i % 5 === 0);
      P.rainUpdate(i === 0 ? 0.016 : 0.001, eye, true);
      P.update(0.016);
      P.draw();
    }
    return fnvUploads(uploads);
  };
  const hash = run();
  assert.equal(run(), hash, "two runs of the seeded harness match");
  // Copied upload bytes, not the live buffer. Same digest as the pre-fix pool
  // (scratch compare, seed 0xd117): scratch slots and the tier-cap reseed
  // do not move a streak, a flare or a smoke quad.
  assert.equal(hash, 2712992901);
});

test("armPrime: each blend group with nothing to draw submits one zero-size, zero-alpha particle from its own buffer, once (#5387)", () => {
  const uploads = [], P = make(uploads);
  P.armPrime(); P.draw();
  assert.deepEqual(uploads.map((u) => [u.floats, u.additive, u.dirty]), [[60, false, true], [60, true, true]], "both groups, 6 verts each");
  for (const u of uploads) assert.ok(u.data.subarray(0, 60).every((v) => v === 0), "size 0, alpha 0: no fragments");
  const [alphaBuf, addBuf] = uploads.map((u) => u.data);
  uploads.length = 0;
  P.draw();
  assert.equal(uploads.length, 0, "one-shot: the next frame draws nothing again");
  P.tyreSmoke(0, 0, 0, 1, 0, 1, 4); P.flare(0, 1, 0, 1, 1, 0, 0, 1, true); P.update(0.016); P.draw();
  assert.ok(uploads.find((u) => !u.additive).data === alphaBuf && uploads.find((u) => u.additive).data === addBuf,
    "the race's real draws reuse the primed buffers, so TLX keeps the wrapped stream (no new geometry)");
  uploads.length = 0;
  P.update(0.016); P.armPrime(); P.draw();
  assert.deepEqual(uploads.map((u) => [u.additive, u.floats === 60]), [[false, false], [true, true]], "a group already drawing this frame is left alone");
});

// Re-init under a live shower used to allocate only MAX*FLOATS_PER for _vertA
// while leaving _rainN set: rainFill then wrote past the TypedArray length
// (silent no-ops — streaks vanished / corrupted). init drops the field;
// rainSeed re-arms. clear() also drops a pending armPrime.
test("re-init under a live shower does not overflow the alpha buffer", () => {
  const uploads = [];
  const P = make(uploads, null, { count: 650 });
  P.rainSeed(false); P.rainShow(true);
  P.rainUpdate(0.016, [0, 5, 0], true); P.draw();
  const seeded = uploads.at(-1);
  assert.ok(seeded && seeded.floats > 0 && seeded.floats <= seeded.data.length,
    "seeded shower fits the buffer it was sized for");
  // Desktop → mobile re-init: old code shrunk _vertA to 96*60 while _rainN stayed 650.
  uploads.length = 0;
  P.init({
    mobileTier: true,
    drawParticles: (data, floats, additive, dirty) => {
      uploads.push({ floats, additive: !!additive, dirty: dirty !== false, len: data.length });
    },
  });
  assert.equal(P.rainActive(), false, "re-init drops the armed shower");
  P.rainUpdate(0.016, [1, 5, 0], true); P.draw();
  assert.equal(uploads.length, 0, "no rain geometry is submitted until rainSeed");
  P.rainSeed(false); P.rainShow(true);
  P.rainUpdate(0.016, [2, 5, 0], true); P.draw();
  const u = uploads.at(-1);
  assert.ok(u && u.floats > 0 && u.floats <= u.len,
    `re-seeded mobile shower fits its buffer (floats ${u?.floats} len ${u?.len})`);
});

test("clear disarms a pending armPrime so the next draw is not a stale idle prime", () => {
  const uploads = [], P = make(uploads);
  P.armPrime();
  P.clear();
  P.draw();
  assert.equal(uploads.length, 0, "clear dropped the pending prime");
});

test("distant rain follows the moving cell in world space and clears after the shower", () => {
  const uploads = [], samples = [];
  const track = { total: 2000 };
  const weather = { arc: { t: 0, cell: { c0: 0.95, h: 0.15, total: 2000, life: 30, v: 10 } }, rainfallAt: () => 1 };
  const P = make(uploads, null, { tracks: { sample(track, s, out) {
    samples.push(s);
    out.p[0] = (s % track.total + track.total) % track.total;
    out.p[1] = 5; out.p[2] = 0;
  } } });
  const eye = [0, 0, 1000], fog = [1, 1, 1];
  P.rainCurtain(track, weather, eye, fog); P.draw();
  assert.equal(uploads.length, 1);
  assert.equal(uploads[0].floats, 9 * 60);
  assert.equal(samples[4], 1900);
  const anchor = (data, k) => (data[60 * k + 2] + data[60 * k + 12]) / 2;
  assert.ok(Math.abs(anchor(uploads[0].data, 4) - 1900) < 0.01);
  weather.arc.t = 20;
  P.rainCurtain(track, weather, eye, fog); P.draw();
  assert.ok(Math.abs(anchor(uploads[1].data, 4) - 100) < 0.01, "crosses the start line");
  weather.arc.t = weather.arc.cell.life;
  P.rainCurtain(track, weather, eye, fog); P.draw();
  assert.equal(uploads.length, 2);
  P.rainSeed(false); P.rainShow(true);
  P.rainUpdate(0.016, eye, 1); P.draw();
  assert.equal(uploads.at(-1).floats, 8 * 60, "local rain alone after the curtain expires");
});

test("gravel stones rebound, expire, and give way to reduced effects and primary particles", () => {
  const tint = [0.55, 0.41, 0.29];
  const emit = (pool, count) => pool.gravel(0, 10, 0, 0, -10, tint, count);
  const uploads = [], P = make(uploads);
  emit(P, 1);
  let previousY = 10, falling = false, bounced = false;
  for (let i = 0; i < 100 && P.count(); i++) {
    P.update(0.02); P.draw();
    if (!P.count()) break;
    const y = uploads.at(-1).data[3];
    assert.ok(y >= 10.029);
    if (y < previousY - 0.001) falling = true;
    if (falling && y > previousY + 0.001) bounced = true;
    previousY = y;
  }
  assert.ok(bounced);
  assert.equal(P.count(), 0);
  for (const opts of [{ mobile: true }, { shed: 1 }, { lt: { particleMul: 0 } }]) {
    const limited = make([], null, opts);
    emit(limited, 24);
    assert.equal(limited.count(), 0);
  }
  for (let i = 0; i < 10; i++) emit(P, 24);
  assert.ok(P.count() <= Math.ceil(P.capacity() * 0.4));
});

test("spray and mist fade to nothing in the last metre before the lens; ≥ 3 m stays bit-identical (#7508)", () => {
  // One quad = 6 vertices × 10 floats [u, w, x, y, z, r, g, b, size, alpha].
  const quads = (u) => {
    const out = [];
    for (let p = 0; p < u.floats; p += 60) out.push({ x: u.data[p + 2], alpha: u.data[p + 9] });
    return out;
  };
  const run = (plane, smoke) => {
    const uploads = [], P = make(uploads);
    P.spray(0, 0, 0, 0, 0, 1, 12);
    if (smoke) P.tyreSmoke(0, 0, 0, 0, 0, 1, 4);
    P.update(0.05);
    P.draw(plane);
    const u = uploads.filter((x) => !x.additive).at(-1) || { floats: 0, data: new Float32Array(0) };
    return { quads: quads(u), bytes: Array.from(u.data.subarray(0, u.floats)) };
  };
  const base = run(null), xs = base.quads.map((q) => q.x);
  assert.ok(xs.length >= 4, "the seeded burst draws quads");
  // plane [1,0,0,c]: a quad's distance in front of the near plane is x + c.
  const far = run([1, 0, 0, 3 - Math.min(...xs)]);
  assert.deepEqual(far.bytes, base.bytes, "every quad ≥ 3 m away keeps the base alpha bit for bit");
  const x0 = Math.min(...xs), near = run([1, 0, 0, 0.3 - x0]);
  assert.ok(!near.quads.some((q) => q.x === x0), "the quad 0.3 m from the lens draws with alpha 0 (culled)");
  for (const q of near.quads) {
    const d = q.x + 0.3 - x0, b = base.quads.find((r) => r.x === q.x);
    assert.ok(d > 0.5, "nothing inside 0.5 m survives");
    assert.ok(q.alpha <= b.alpha + 1e-7, "the fade only ever thins a quad");
    if (d >= 1.5) assert.equal(q.alpha, b.alpha);
  }
  // Tyre smoke is not spray: the lens fade leaves it alone.
  const smokeBase = run(null, true), smokeNear = run([1, 0, 0, 0.3 - x0], true);
  assert.ok(smokeNear.quads.length > near.quads.length, "smoke quads at the lens still draw");
  assert.ok(smokeBase.quads.length >= smokeNear.quads.length);
});
