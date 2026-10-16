/* wind.test.mjs — WIND (js/race/wind.js), pure, in a VM: the wind is a
 * function of (seed, circuit, weather, race clock) so replays and friend-race
 * peers agree; fog is calm and a storm gusty; gusts and the side force are
 * bounded; a headwind costs top speed and a tailwind gives it, modestly; level
 * "off" is a true no-op. The in-game straight-line run is wind-vm.test.mjs.
 *
 * Run: node --test tests/unit/wind.test.mjs   (npm run test:tooling-fast)
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import { seedLog } from "../helpers/seed-log.mjs";
import { gameSource } from "../helpers/game-source.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
function load() {
  const ctx = vm.createContext({ Math, console, Object, Array, Number, JSON, isFinite, String });
  seedLog(ctx);
  ctx.window = ctx;
  for (const f of ["js/core/mat4.js", "js/physics/consts.js", "js/race/wind.js"]) {
    vm.runInContext(readFileSync(join(ROOT, f), "utf8"), ctx, { filename: f });
  }
  return vm.runInContext("Wind", ctx);
}

test("the wind is a pure function of (seed, circuit, weather, clock): fresh modules agree, walked or jumped", () => {
  const a = load(), b = load();
  for (let i = 0; i <= 600; i++) a.sync(42, "rain", "silverstone", i / 60 * 10);   // 100 s at 6 Hz
  const sb = b.sync(42, "rain", "silverstone", 100);                               // one jump straight there
  assert.deepEqual({ ...a.state() }, { ...sb }, "walked = jumped (a peer's frame rate cannot move it)");
  const series = (W, seed) => Array.from({ length: 40 }, (_, k) => W.at(W.plan(seed, "rain", "silverstone"), k * 7.3, 6, "rain").ms);
  assert.deepEqual(series(a, 7), series(b, 7), "same seed → same series");
  assert.notDeepEqual(series(a, 7), series(a, 8), "another seed → another wind");
  assert.notDeepEqual(a.plan(7, "rain", "monza").dir0, a.plan(7, "rain", "spa").dir0, "the circuit is in the key");
});

test("fog is calm, a storm gusty; exposed circuits windier than sheltered streets", () => {
  const W = load();
  const avg = (wx, track) => {
    let s = 0, n = 0;
    for (let seed = 1; seed <= 60; seed++) {
      const p = W.plan(seed, wx, track), m = W.meanOf(p, wx);
      for (let t = 0; t < 600; t += 13) { s += W.at(p, t, m, wx).ms; n++; }
    }
    return s / n;
  };
  const fog = avg("fog", "monza"), dry = avg("dry", "monza"), rain = avg("rain", "monza"), storm = avg("storm", "monza");
  assert.ok(fog < dry && dry < rain && rain < storm, `fog ${fog.toFixed(2)} < dry ${dry.toFixed(2)} < rain ${rain.toFixed(2)} < storm ${storm.toFixed(2)} m/s`);
  assert.ok(avg("dry", "bahrain") > avg("dry", "monaco") * 1.5, "Bahrain's desert vs Monaco's walls");
});

test("gusts are bounded: total speed ≤ MAX_SPEED, side force ≤ LAT_CAP, and a strong gust is reachable", () => {
  const W = load();
  let top = 0, gusty = 0;
  for (let seed = 1; seed <= 80; seed++) {
    const p = W.plan(seed, "storm", "bahrain"), m = W.meanOf(p, "storm");
    for (let t = 0; t < 900; t += 0.5) {
      const a = W.at(p, t, m, "storm");
      top = Math.max(top, a.ms);
      if (a.gust > 0.5 && a.ms >= W.GUST_CALL_MS) gusty++;
      assert.ok(a.ms <= W.MAX_SPEED + 1e-9 && a.gust >= 0 && a.gust <= 1);
    }
  }
  assert.ok(top > 12, `a storm at Bahrain does gust (${(top * 3.6).toFixed(0)} km/h)`);
  assert.ok(gusty > 0, "the engineer's gust call can fire");
  for (const v of [0, 30, 60, 100]) for (const x of [-W.MAX_SPEED, -8, 0, 8, W.MAX_SPEED]) {
    const a = W.latAccel(v, x);
    assert.ok(Math.abs(a) <= W.LAT_CAP, `|${a}| ≤ ${W.LAT_CAP} at ${v} m/s, cross ${x}`);
    assert.equal(Math.sign(a) || 0, v > 0 ? Math.sign(x) || 0 : 0, "pushes the way the wind blows; nothing at a standstill");
  }
});

test("a headwind costs top speed and a tailwind gives it back — a few km/h at 30 km/h", () => {
  const W = load();
  assert.equal(W.vmaxMul(0), 1, "still air is exactly 1");
  const vTop = 280 / 3.6, w = 30 / 3.6;
  const head = (W.vmaxMul(w) - 1) * vTop * 3.6, tail = (W.vmaxMul(-w) - 1) * vTop * 3.6;
  assert.ok(head < -2 && head > -8, `headwind ${head.toFixed(2)} km/h`);
  assert.ok(tail > 2 && tail < 8, `tailwind +${tail.toFixed(2)} km/h`);
  // carInto resolves head/cross off the car's heading: wind blowing toward +z.
  const st = { on: true, ms: w, wx: 0, wz: w };
  const into = (h) => ({ ...W.carInto(st, h, 70) });
  assert.ok(into(Math.PI).vmaxMul < 1, "car heading −z into a +z wind: headwind");
  assert.ok(into(0).vmaxMul > 1, "car heading +z with it: tailwind");
  const side = into(Math.PI / 2);                   // heading +x: its right is +z (right = (−cos h, sin h): the player's vLat axis)
  assert.ok(side.latA > 0 && Math.abs(side.vmaxMul - 1) < 1e-12, "pure crosswind: a push to the right, no drag change");
  assert.ok(into(-Math.PI / 2).latA < 0, "…and the other way round, to the left");
});

test("level OFF is a true no-op: calm state, vmaxMul exactly 1, latA exactly 0", () => {
  const W = load();
  W.setLevel("off");
  const st = W.sync(5, "storm", "bahrain", 120);
  assert.equal(st.on, false);
  assert.equal(st.ms, 0);
  const c = W.carInto(st, 1.2, 80);
  assert.equal(c.vmaxMul, 1);
  assert.equal(c.latA, 0);
  assert.equal(W.gustCall(), null);
  assert.equal(W.setLevel("bogus"), "off", "an unknown level is refused");
  assert.equal(W.setLevel("real"), "real");
  assert.ok(W.sync(5, "storm", "bahrain", 120).ms > 0);
});

test("race settings offer WIND off/real and persist it (phone players can turn it off)", () => {
  const src = readFileSync(join(ROOT, "js/race/race-settings.js"), "utf8");
  assert.match(src, /function ensureWindRow[\s\S]*?\$\("rs-dirty"\)[\s\S]*?id="rs-wind-label">WIND</, "WIND row injected after DIRTY AIR");
  assert.match(src, /RS_WIND = \[\["off", "OFF"\], \["real", "REAL"\]\]/);
  assert.match(src, /store\.set\("wind", Wind\.setLevel\(v\)\)/, "the choice reaches Wind and apex26.wind");
  assert.match(gameSource(), /Wind\.setLevel\(store\.get\("wind", "real"\)\)/, "boot reads the same key");
});
