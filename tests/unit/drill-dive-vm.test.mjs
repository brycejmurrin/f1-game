/* drill-dive-vm.test.mjs — LEARN's Monza Dive Test (js/learn-drills/dive.js, #6559 step 9, #6555 §2, Bryce's decision D2)
 * end to end in the real game VM, through DrillRegistry's own host.
 *
 * THE PIN (D2): the drill's anti-dive knob, BodyAttitude.setPitchScale, is cosmetic. The same scripted pedal trace with
 * the scale at 1 and at 0.45 gives a BIT-IDENTICAL car (every field but the c.ba* body fields) frame by frame, so the
 * stop distance, axEstSm and the front load share are untouched, while the peak pitch drops by at least 40 % and the
 * floor clearance changes. Headless runs skip render(), so the loop advances BodyAttitude after each physics step the
 * way game.js's render does (after the step, from the same car).
 *
 * Run: node --test tests/unit/drill-dive-vm.test.mjs
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const ROOT = fileURLToPath(new URL("../../", import.meta.url));
const BRAKE_AT = 1.5;   // s of full throttle before the stop
let g, G, host, BA, D;
const reopened = [];

before(async () => {
  const { createGame } = require(ROOT + "tools/lib/game-vm.cjs");
  g = await createGame({});
  for (const rel of ["js/learn-drills/registry.js", "js/learn-drills/drill-card.js", "js/learn-drills/dive.js"]) {
    vm.runInContext(readFileSync(ROOT + rel, "utf8"), g.ctx, { filename: ROOT + rel });
  }
  G = g.G;
  BA = vm.runInContext("BodyAttitude", g.ctx);
  D = vm.runInContext("DiveDrill", g.ctx);
  host = vm.runInContext("DrillRegistry", g.ctx).create(G, {
    retry: () => G.coach.retry(),
    setDirtyAir: () => {},
    insights: () => G.coach.insights,
    reopenLesson: (lesson, payload) => reopened.push({ lesson, payload }),
  });
  assert.ok(host.launch("dive", "low"), "launch");
  assert.ok(await g.settle(() => G.state === "count", 6000), "countdown");
  if (!G.practice) assert.ok(G.coach.armPractice(), "practice");
  assert.ok(host.begin(), "begin() placed the car");
  g.apex.headless(true);
});
after(() => g?.close());

/** The player's state minus the cosmetic body fields: every own number, boolean and string. */
function physics(c) {
  const out = {};
  for (const [k, v] of Object.entries(c)) {
    if (/^_?ba/.test(k)) continue;
    if (typeof v === "number" || typeof v === "boolean" || typeof v === "string") out[k] = v;
  }
  return out;
}

/** One run: full throttle for BRAKE_AT s, then full brake to the stop. Returns the host's result and the trace. */
function drive() {
  const trace = [];
  let peakPitch = 0, minClear = Infinity;
  for (let i = 0; i < 60 * 30; i++) {
    const braking = i >= Math.round(BRAKE_AT * 60);
    g.apex.act({ throttle: !braking, brake: braking, steer: 0 }, 1 / 60, 1);
    const p = G.player, vF = Math.min(1, Math.abs(p.speed) / G.vTop());
    BA.update(p, 0, 1 / 60, 0, vF * vF, vF);   // render()'s call, after the step
    trace.push(physics(p));
    peakPitch = Math.max(peakPitch, p.baPitch);
    minClear = Math.min(minClear, p.baClear);
    const r = host.tick();
    if (r) return { r, trace, peakPitch, minClear };
  }
  return null;
}

let low, high;
test("the lower and higher anti-dive stops: one pedal trace, a bit-identical car, a different body", (t) => {
  assert.ok(drive(), "warm-up run finished");
  assert.ok(host.retry(), "retry");
  assert.equal(BA.pitchScale(), 1, "lower anti-dive is the shipped dive");
  low = drive();
  assert.ok(low && low.r.clean, "clean lower run: " + (low && low.r.reason));
  assert.equal(D.predict("same"), "same");
  assert.ok(host.rerun("high"), "rerun high");
  assert.equal(BA.pitchScale(), D.HIGH_SCALE, "vary() set the scale");
  assert.equal(D.predict("same"), "same", "the prediction before the higher run (vary() cleared the old one)");
  high = drive();
  assert.ok(high && high.r.clean, "clean higher run: " + (high && high.r.reason));
  t.diagnostic(JSON.stringify({ frames: low.trace.length, low: low.r.run, high: high.r.run, pitch: [low.peakPitch, high.peakPitch], clear: [low.minClear, high.minClear] }));
  assert.equal(high.trace.length, low.trace.length, "same frame count to the stop");
  for (let i = 0; i < low.trace.length; i++) assert.deepEqual(high.trace[i], low.trace[i], "frame " + i + " differs");
  assert.equal(high.r.run.stop, low.r.run.stop, "stop metres bit-identical");
  assert.equal(high.r.run.moved, low.r.run.moved, "front load moved identical");
  assert.ok(low.peakPitch > 0, "the car dived");
  assert.ok(high.peakPitch <= 0.6 * low.peakPitch, "peak pitch down by ≥ 40 %: " + high.peakPitch + " vs " + low.peakPitch);
  assert.ok(high.minClear > low.minClear, "the floor stays higher: " + high.minClear + " vs " + low.minClear);
});

test("the card: an A | B table, a gold for a correct prediction and a repeat, measured numbers only", () => {
  assert.equal(low.r.medal, null, "a lower run alone earns nothing");
  assert.equal(high.r.medal, "gold", "both clean, predicted same, same stop");
  assert.equal(high.r.metrics.length, 6);
  assert.match(high.r.metrics[0][1], /^\d+ \| \d+$/);
  assert.match(high.r.verdict, /shown on the body and floor/);
  assert.ok(high.r.run.moved > 10, "a stop from 80 % of top speed moves the front load: " + high.r.run.moved);
});

test("medals: bronze without the prediction, silver without the repeat; pure", () => {
  const a = { run: { variant: "low", clean: true, stop: 40 } };
  const hi = (guess, stop, clean = true) => ({ run: { variant: "high", clean, stop, guess } });
  assert.equal(D.medals(hi("same", 41), [a]), "gold");
  assert.equal(D.medals(hi("same", 44), [a]), "silver");
  assert.equal(D.medals(hi("less", 40), [a]), "bronze");
  assert.equal(D.medals(hi(null, 40), [a]), "bronze");
  assert.equal(D.medals(hi("same", 40, false), [a]), null, "an unclean higher run");
  assert.equal(D.medals(hi("same", 40), []), null, "no lower run this launch");
  assert.equal(D.medals(hi("same", 40), [{ run: { ...a.run, clean: false } }]), null);
});

test("end() puts the shipped dive back and reopens the suspension lesson with the last run", () => {
  assert.equal(BA.pitchScale(), D.HIGH_SCALE);
  assert.ok(host.end("quit"));
  assert.equal(BA.pitchScale(), 1, "stage()'s undo");
  const last = reopened.at(-1);
  assert.equal(last.lesson, "suspension");
  assert.equal(last.payload.id, "dive");
  assert.equal(BA.setPitchScale(NaN), 1, "a bad scale is the shipped one");
  assert.equal(BA.setPitchScale(2), 1, "clamped to [0, 1]");
  BA.setPitchScale(1);
});
