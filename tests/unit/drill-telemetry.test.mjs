/* drill-telemetry.test.mjs — LEARN's Telemetry Detective (js/learn-drills/telemetry.js, #6559 step 14, #6551 §4): the
 * pure classifier, the pick judge and the medal rule, on synthetic traces. The VM runs (a deterministic score and
 * medal over the reference, a faulted run and a FIX IT run): tests/unit/drill-telemetry-vm.test.mjs. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const abs = (rel) => fileURLToPath(new URL("../../" + rel, import.meta.url));
function load() {
  const ctx = vm.createContext({ console, Math, Object, Array, Number, String, Map, Set, Error });
  for (const rel of ["js/learn-drills/registry.js", "js/learn-drills/telemetry.js"]) vm.runInContext(readFileSync(abs(rel), "utf8"), ctx, { filename: abs(rel) });
  return ctx;
}

/** A 1200 m synthetic run on the 5 m grid: 80 m/s, a braking zone to 30 m/s at brakeAt, then throttle from `on`
 *  (coasting between).
 *  Time integrates 5 m / v. minV scales the corner's minimum speed. */
function trace({ brakeAt = 600, on = 700, minV = 30 } = {}) {
  const t = [], v = [], b = [], th = [];
  let time = 0, speed = 80;
  for (let d = 0; d <= 1200; d += 5) {
    const braking = d >= brakeAt && speed > minV && d < on;
    if (braking) speed = Math.max(minV, speed - 4);
    else if (d >= on) speed = Math.min(80, speed + 0.8);
    t.push(+time.toFixed(4)); v.push(speed); b.push(braking ? 1 : 0); th.push(braking || (d >= brakeAt && d < on) ? 0 : 1);
    time += 5 / speed;
  }
  return { t, v, b, th };
}

test("a 20 m-early brake: the classifier finds that corner's window and names EARLY BRAKE", () => {
  const T = vm.runInContext("TelemetryDrill", load());
  const ref = trace(), run = trace({ brakeAt: 580 });
  const a = T.analyze(ref, run);
  assert.ok(a.total > 0, "the early-braking run is slower: " + a.total);
  assert.ok(a.window.from >= 520 && a.window.from <= 700, "the window sits at the braking zone: " + JSON.stringify(a.window));
  assert.equal(a.window.to - a.window.from, T.WIN);
  assert.equal(a.cause, "brake");
  assert.equal(a.causeAt, 580, "the first lane to differ is the brake, where it went on early");
  assert.equal(T.lossIn(ref, run, a.window), a.window.loss, "lossIn over the window is the window's loss");
});

test("late throttle and a low minimum are told apart from an early brake", () => {
  const T = vm.runInContext("TelemetryDrill", load());
  assert.equal(T.analyze(trace(), trace({ on: 730 })).cause, "throttle");
  assert.equal(T.analyze(trace(), trace({ minV: 24 })).cause, "speed");
  const same = T.analyze(trace(), trace());
  assert.equal(same.window.loss, 0, "identical runs lose nothing");
  assert.equal(same.cause, null);
});

test("judge: bronze within 60 m of the window, silver with the cause, nothing further away", () => {
  const T = vm.runInContext("TelemetryDrill", load());
  const a = { window: { from: 600, to: 700, loss: 0.2 }, cause: "brake" };
  assert.equal(T.judge(a, 650, "brake").medal, "silver");
  assert.equal(T.judge(a, 650, "throttle").medal, "bronze");
  assert.equal(T.judge(a, 540, null).medal, "bronze", "60 m before the window still counts");
  assert.equal(T.judge(a, 535, "brake").medal, null, "65 m before does not");
  assert.equal(T.judge(a, 761, "brake").medal, null);
  assert.equal(T.judge({ ...a, window: { ...a.window, loss: 0 } }, 650, "brake").medal, null, "no loss, nothing to find");
});

test("medals: a clean FIX IT run winning back 60 % of a silver window, faster overall, is gold; otherwise the pick decides", () => {
  const T = vm.runInContext("TelemetryDrill", load());
  assert.equal(T.medals({ clean: true, fix: { silver: true, faster: true, frac: 0.6 } }), "gold");
  assert.equal(T.medals({ clean: true, fix: { silver: true, faster: true, frac: 0.59 } }), null);
  assert.equal(T.medals({ clean: true, fix: { silver: true, faster: false, frac: 1 } }), null, "won the window back, lost more elsewhere");
  assert.equal(T.medals({ clean: true, fix: { silver: false, faster: true, frac: 1 } }), null, "gold needs a solved cause first");
  assert.equal(T.medals({ clean: false, fix: { silver: true, faster: true, frac: 1 } }), null);
  assert.equal(T.medals({ clean: true, pickMedal: "silver" }), "silver");
  assert.equal(T.medals({ clean: true }), null, "a run earns nothing until it is picked");
});

test("registered on the telemetry lesson as a solo Monza TT on the sector goal", () => {
  const ctx = load();
  const d = vm.runInContext("DrillRegistry.get('telemetry')", ctx);
  assert.equal(d.lesson, "telemetry");
  assert.equal(d.goal, "sector");
  assert.deepEqual({ ...d.setup }, { flow: "gp", session: "tt", track: "monza", weather: "dry", changeable: false, grid: "tier", duel: false, dirtyAir: "classic", wind: "off" });
  assert.equal(vm.runInContext("TelemetryDrill.define() === DrillRegistry.get('telemetry')", ctx), true, "define is idempotent");
});
