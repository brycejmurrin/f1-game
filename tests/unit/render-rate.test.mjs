/* render-rate.test.mjs — behavioural pins for js/perf/render-rate.js (#2652).
 *
 * RenderRate halves the DRAW rate on a phone whose rAF runs at 100 Hz or more
 * (Safari's 120 Hz opt-in) and nowhere else. The pins: a desktop never skips; a
 * phone at 60 or 30 Hz never trips it; a 120 Hz phone does, after a sustained
 * fast cadence, draws every second rAF, and loses no time (the skipped frame's dt
 * and ms are paid into the next drawn one); it leaves when the cadence slows;
 * an XR session is never gated; apex26.renderRate off/half override the device
 * class. VM-executed real source, no browser, ~0.1 s.
 *
 * Run: node --test tests/unit/render-rate.test.mjs   (npm run test:tooling-fast)
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { absSrc } from "../helpers/abs-src.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const SRC = fs.readFileSync(path.join(ROOT, "js/perf/render-rate.js"), "utf8");

/** Fresh RenderRate in a VM; `store` stands in for localStorage. */
function load({ mobile, store = {} } = {}) {
  const ctx = { Math, localStorage: { getItem: (k) => (k in store ? store[k] : null) } };
  vm.createContext(ctx);
  vm.runInContext(SRC.replace(/^const\b/gm, "var"), ctx, { filename: absSrc("js/perf/render-rate.js") });
  ctx.RenderRate.init({ isMobile: mobile });
  return ctx.RenderRate;
}

/** Drive `n` rAF ticks at `ms` apart; returns { drawn, dtSum, drawnDt, msSum, drawnMs }. */
function run(R, n, ms, presenting = false) {
  const r = { ticks: n, drawn: 0, dtSum: 0, drawnDt: 0, msSum: 0, drawnMs: 0 };
  for (let i = 0; i < n; i++) {
    const dt = ms / 1000;
    R.observe(ms);
    r.dtSum += dt; r.msSum += ms;
    if (R.gate(dt, ms, presenting)) { r.drawn++; r.drawnDt += R.dt(); r.drawnMs += R.ms(); }
  }
  return r;
}

test("a desktop draws every frame even at 144 Hz", () => {
  const R = load({ mobile: false });
  const r = run(R, 600, 1000 / 144);
  assert.equal(r.drawn, r.ticks);
  assert.equal(R.active(), false);
});

test("a phone at 60 Hz, 90 Hz or 30 Hz draws every frame", () => {
  for (const ms of [1000 / 60, 1000 / 90, 1000 / 30]) {
    const R = load({ mobile: true });
    const r = run(R, 600, ms);
    assert.equal(r.drawn, r.ticks, `interval ${ms.toFixed(1)} ms`);
    assert.equal(R.active(), false);
  }
});

test("a phone at 120 Hz trips after a sustained fast cadence, then draws every second rAF", () => {
  const R = load({ mobile: true });
  run(R, 60, 1000 / 120);
  assert.equal(R.active(), false, "60 fast frames are not enough: the hold is 90");
  run(R, 60, 1000 / 120);
  assert.equal(R.active(), true);
  const r = run(R, 240, 1000 / 120);
  assert.equal(r.drawn, 120, "exactly half of the ticks draw");
});

test("no time is lost: the skipped frame's dt and ms are paid into the next drawn frame", () => {
  const R = load({ mobile: true });
  run(R, 200, 1000 / 120);
  assert.equal(R.active(), true);
  const r = run(R, 240, 1000 / 120);
  assert.ok(Math.abs(r.drawnDt - r.dtSum) < 1e-9, `dt ${r.drawnDt} vs ${r.dtSum}`);
  assert.ok(Math.abs(r.drawnMs - r.msSum) < 1e-9, `ms ${r.drawnMs} vs ${r.msSum}`);
});

test("it leaves when the cadence slows, and flushes the carried time on the next frame", () => {
  const R = load({ mobile: true });
  run(R, 200, 1000 / 120);
  assert.equal(R.active(), true);
  // an odd count leaves one skipped frame's time in the accumulator
  run(R, 1, 1000 / 120);
  const r = run(R, 120, 1000 / 60);
  assert.equal(R.active(), false);
  assert.ok(r.drawnDt >= r.dtSum - 1e-9, "the carried dt is not dropped");
  const after = run(R, 60, 1000 / 60);
  assert.equal(after.drawn, after.ticks, "every frame draws once it left");
});

test("a stall or tab resume is not a cadence sample", () => {
  const R = load({ mobile: true });
  run(R, 60, 1000 / 120);
  R.observe(5000);
  assert.ok(R.state().emaMs < 11, "a 5 s gap leaves the EMA alone");
});

test("an immersive session is never gated, and returning from it flushes the carry", () => {
  const R = load({ mobile: true });
  run(R, 200, 1000 / 120);
  assert.equal(R.active(), true);
  const r = run(R, 100, 1000 / 120, true);
  assert.equal(r.drawn, r.ticks, "presenting draws every rAF");
});

test("apex26.renderRate overrides the device class", () => {
  const off = load({ mobile: true, store: { "apex26.renderRate": "off" } });
  run(off, 400, 1000 / 120);
  assert.equal(off.active(), false);
  const half = load({ mobile: false, store: { "apex26.renderRate": "half" } });
  const r = run(half, 100, 1000 / 60);
  assert.equal(r.drawn, 50, "half forces it on a desktop at 60 Hz");
  const junk = load({ mobile: false, store: { "apex26.renderRate": "banana" } });
  assert.equal(junk.state().mode, "auto");
});

test("physics is untouched: the fixed-step loop runs before the gate and the gate wraps only render + HUD", () => {
  const g = fs.readFileSync(path.join(ROOT, "js/game.js"), "utf8");
  const body = g.slice(g.indexOf("function tickBody("));
  const step = body.indexOf("update(PHYS_DT)");
  const paused = body.indexOf("if ((paused || UiExperience.resumeHolding(dt)) && !netPlay.active())");
  const pausedEnd = body.indexOf("  replayBuf.onTick(", paused);
  const pausedGate = body.indexOf("RenderRate.gate(");
  const gate = body.indexOf("RenderRate.gate(", pausedGate + 1);
  assert.ok(paused >= 0 && pausedGate > paused && pausedGate < pausedEnd && pausedEnd < step,
    "the early gate is isolated inside the solo paused branch, which returns before physics");
  assert.match(body.slice(pausedGate, pausedEnd), /return;[^\n]*\n  }/);
  assert.ok(step > 0 && gate > step, "update(PHYS_DT) precedes the racing render gate");
  assert.equal(g.split("RenderRate.gate(").length - 1, 2, "only paused Settings and racing render gates");
  const block = body.slice(gate, body.indexOf("\n}\n", gate));
  assert.ok(!/update\(|physAcc|stepPhys/.test(block), "gated block holds no physics");
  assert.match(block, /render\(/);
  assert.match(block, /updateHud\(/);
});

test("drew() reports the last gate verdict (PerfGov.tick judges only intervals that began at a draw)", () => {
  const R = load({ mobile: true, store: { "apex26.renderRate": "half" } });
  assert.equal(R.drew(), true, "before any gate: every interval counts (identical to no RenderRate)");
  const seen = [];
  for (let i = 0; i < 6; i++) { R.observe(8.33); seen.push(R.gate(0.00833, 8.33, false, true) === R.drew()); }
  assert.ok(seen.every(Boolean));
  const off = load({ mobile: true, store: { "apex26.renderRate": "off" } });
  for (let i = 0; i < 20; i++) { off.observe(8.33); off.gate(0.00833, 8.33, false, true); assert.equal(off.drew(), true); }
});


test("force draws a live preview, flushes skipped time and restarts half-frame phase", () => {
  const R = load({ mobile: true, store: { "apex26.renderRate": "half" } });
  assert.equal(R.gate(1 / 60, 1000 / 60, false, true), false);
  assert.equal(R.drew(), false);
  assert.equal(R.force(1 / 60, 1000 / 60), true);
  assert.equal(R.drew(), true);
  assert.equal(R.dt(), 2 / 60); assert.equal(R.ms(), 2000 / 60);
  R.force(1 / 60, 1000 / 60);
  assert.equal(R.dt(), 1 / 60); assert.equal(R.ms(), 1000 / 60);
  assert.equal(R.gate(1 / 60, 1000 / 60, false, true), false, "preview reset the half-frame phase");
  assert.equal(R.gate(1 / 60, 1000 / 60, false, true), true);
  assert.equal(R.dt(), 2 / 60); assert.equal(R.ms(), 2000 / 60);
  assert.equal(R.state().drawn, 3); assert.equal(R.state().skipped, 2);
});
