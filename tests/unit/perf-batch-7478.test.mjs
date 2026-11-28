/* perf-batch-7478.test.mjs — batch #7478 (hunt #7477 rows 2 and 3): rainFill
 * holds no 3-argument Math.hypot and draws the same streaks as the hypot form;
 * Wind.sync refills ONE module scratch object per step (no allocation) with the
 * values the allocating base returned (goldens captured on ae8ce29d).
 *
 * Run: node --test tests/unit/perf-batch-7478.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import { seedLog } from "../helpers/seed-log.mjs";
import { makeRng } from "../helpers/seeded-fuzz.mjs";
import { absSrc } from "../helpers/abs-src.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const PARTICLES = readFileSync(join(ROOT, "js/fx/particles.js"), "utf8");

function rainFillBody(src) {
  const i = src.indexOf("function rainFill(");
  const j = src.indexOf("\n  }\n", i) + 4;   // the closing brace at the function's own indent
  assert.ok(i > 0 && j > i + 4, "rainFill found");
  return src.slice(i, j);
}

test("rainFill holds no Math.hypot (V8 allocates on the 3-argument form, #7478)", () => {
  assert.doesNotMatch(rainFillBody(PARTICLES), /Math\.hypot/);
});

// The base form: the same source with each len3 (sqrt of the sum of squares) in rainFill put back as Math.hypot.
function hypotForm(src) {
  const body = rainFillBody(src);
  const back = body.replace(/\blen3\(/g, "Math.hypot(");
  assert.equal((back.match(/Math\.hypot\(/g) || []).length, 4, "the four #7477 row-2 sites round-trip");
  return src.replace(body, back);
}

function streaks(src) {
  const rng = makeRng(0x7478);
  const seededMath = Object.assign(Object.create(Math), { random: () => rng.unit() });
  const ctx = vm.createContext({
    Float32Array, Uint8Array, Array, Math: seededMath, Object,
    LightTune: { LT: { rainCount: 200, drizzleCount: 0.3, rainStreak: 1, rainWind: 0.18, windDir: 30, rainSpeed: 1, rainOpacity: 1 } },
    PerfGov: { autoShed: () => 0 },
    Wind: { state: () => ({ on: true, wx: 3, wz: -2 }) },
  });
  seedLog(ctx);
  const P = vm.runInContext(src + ";Particles", ctx, { filename: absSrc("js/fx/particles.js") });
  const frames = [];
  P.init({ drawParticles: (data, floats, additive) => { if (!additive) frames.push(Float32Array.from(data.subarray(0, floats))); } });
  P.rainSeed(false); P.rainShow(true);
  // A moving camera, so the camera-velocity terms (camSpeed, the apparent velocity) are live.
  for (let f = 0; f < 8; f++) { P.rainUpdate(1 / 60, [100 + f * 0.9, 5 + f * 0.05, -30 - f * 0.4], 1); P.draw(); }
  return frames;
}

test("rainFill draws the hypot form's streaks within 1e-5 per float on a seeded field", () => {
  const now = streaks(PARTICLES), base = streaks(hypotForm(PARTICLES));
  assert.equal(now.length, base.length);
  assert.ok(now.length > 0 && now.at(-1).length > 600, "the field drew streaks");
  for (let f = 0; f < now.length; f++) {
    assert.equal(now[f].length, base[f].length, `frame ${f}: same drop count`);
    for (let i = 0; i < now[f].length; i++) {
      assert.ok(Math.abs(now[f][i] - base[f][i]) <= 1e-5, `frame ${f} float ${i}: ${now[f][i]} vs ${base[f][i]}`);
    }
  }
});

function wind() {
  const ctx = vm.createContext({ Math, console, Object, Array, Number, JSON, isFinite, String });
  seedLog(ctx);
  ctx.window = ctx;
  for (const f of ["js/core/mat4.js", "js/physics/consts.js", "js/core/hash32.js", "js/race/wind.js"]) {
    vm.runInContext(readFileSync(join(ROOT, f), "utf8"), ctx, { filename: absSrc(f) });
  }
  return vm.runInContext("Wind", ctx);
}

// Wind.sync(5, "storm", "bahrain", t) on base ae8ce29d (fresh objects per call).
const GOLD = {
  120: { dir: -0.09176193119598867, ms: 18.645095440416895, wx: -1.7085099267682042, wz: 18.566652304936113, gust: 0.9651254838500367, gustMs: 6.12036505012793, mean: 12.525750839833249, on: true, kmh: 67, fromDeg: 175 },
  137.5: { dir: -0.1581306374358811, ms: 13.204354281423175, wx: -2.079321934767515, wz: 13.03960859385485, gust: 0, gustMs: 0, mean: 13.204354281423177, on: true, kmh: 48, fromDeg: 171 },
};
function sameAs(got, want, label) {
  assert.deepEqual(Object.keys(got).sort(), Object.keys(want).sort(), `${label}: same fields`);
  for (const k of Object.keys(want)) {
    if (typeof want[k] === "number" && !Number.isInteger(want[k])) assert.ok(Math.abs(got[k] - want[k]) <= 1e-12, `${label}.${k}: ${got[k]} vs ${want[k]}`);
    else assert.equal(got[k], want[k], `${label}.${k}`);
  }
}

test("Wind.sync refills one scratch object per step with the base values", () => {
  const W = wind();
  const a = W.sync(5, "storm", "bahrain", 120);
  sameAs({ ...a }, GOLD[120], "t=120");
  const b = W.sync(5, "storm", "bahrain", 137.5);
  assert.equal(b, a, "the same reference: no object per physics step");
  sameAs({ ...b }, GOLD[137.5], "t=137.5");
  assert.equal(W.state(), b);
});

test("Wind.at stays pure: a fresh object per call, untouched by a later sync", () => {
  const W = wind();
  const p = W.plan(5, "storm", "bahrain");
  const m = W.meanOf(p, "storm");
  const x = W.at(p, 120, m, "storm"), y = W.at(p, 120, m, "storm");
  assert.notEqual(x, y);
  assert.deepEqual({ ...x }, { ...y });
  const keep = { ...x };
  W.sync(5, "storm", "bahrain", 300);
  assert.deepEqual({ ...x }, keep, "a caller's at() answer is its own");
});
