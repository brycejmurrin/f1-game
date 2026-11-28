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

test("score: a crashed FIX IT run wins nothing back (review F1)", () => {
  const ctx = load(), T = vm.runInContext("TelemetryDrill", ctx);
  const ref = trace(), G = { player: null, raceT: 0 };
  // Run 1: the reference (score() keeps a clean first run).
  T.score(G, { clean: true, seconds: 20 }, { ...ref });
  const early = trace({ brakeAt: 580 }), r2 = T.score(G, { clean: true, seconds: 20.3 }, { ...early });
  assert.equal(r2.analysis.cause, "brake");
  // Solve it through pick()'s host path: a host whose lastResult is r2.
  const host = { lastResult: () => r2 };
  vm.runInContext("globalThis.DrillCard = { record() {} }", ctx);
  const w = r2.analysis.window;
  assert.equal(T.pick({ drills: () => host, store: null }, (w.from + w.to) / 2, "brake"), null, "a result with no drill id is refused");
  r2.id = "telemetry"; r2.clean = true;
  assert.equal(T.pick({ drills: () => host, store: null }, (w.from + w.to) / 2, "brake").medal, "silver");
  // A FIX IT run that crashed 200 m in: no fix, no score.
  const short = { t: ref.t.slice(0, 40), v: ref.v.slice(0, 40), b: ref.b.slice(0, 40), th: ref.th.slice(0, 40) };
  const r3 = T.score(G, { clean: false, reason: "left the track", seconds: 5 }, short);
  assert.equal(r3.fix, null);
  assert.equal(r3.value, 0);
  assert.equal(T.medals({ ...r3, clean: false }), null);
});

test("THIS CORNER re-scores the run finish() saved: n stays 1, the card's best follows the pick (#7346 row 6)", () => {
  const ctx = load(), T = vm.runInContext("TelemetryDrill", ctx);
  vm.runInContext(readFileSync(abs("js/learn-drills/drill-card.js"), "utf8"), ctx, { filename: abs("js/learn-drills/drill-card.js") });
  const disk = new Map(), store = { get: (k, d) => (disk.has(k) ? disk.get(k) : d), set: (k, v) => { disk.set(k, v); } };
  const G = { player: null, raceT: 0 }, ref = trace();
  T.score(G, { clean: true, seconds: 20 }, { ...ref });
  const r = T.score(G, { clean: true, seconds: 20.3 }, { ...trace({ brakeAt: 580 }) });
  Object.assign(r, { id: "telemetry", variant: "classic", medal: null });
  // What registry.js finish() does with the run before the card shows.
  const DrillCard = vm.runInContext("DrillCard", ctx), first = DrillCard.record(store, "telemetry|classic", r);
  r.best = first.row.best; r.improved = first.improved;
  const w = r.analysis.window;
  const out = T.pick({ drills: () => ({ lastResult: () => r }), store }, (w.from + w.to) / 2, "brake");
  assert.equal(out.medal, "silver");
  const row = disk.get("learnMedals.v1")["telemetry|classic"];
  assert.equal(row.n, 1, "one run, one count: the pick re-scores it");
  assert.equal(row.medal, "silver");
  assert.equal(r.best, row.best, "the card's best is the saved row's, not finish()'s stale one");
});
