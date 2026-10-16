// knob-ab — tools/gfx/knob-ab.mjs fails a visual knob whose ON vs OFF frame does
// not beat the frame-to-frame noise. Born on weather PR #1885 (2026-10-15): the
// puddles passed every unit test and still rendered invisible.
// Pure functions only, no network, no browser.
//
// Run: node --test tests/unit/knob-ab.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { diffRaw, verdict, parseSet, parseArgs, PIXEL_DELTA, NOISE_MULT, MIN_MARGIN } from "../../tools/gfx/knob-ab.mjs";

test("knob-ab: diffRaw counts pixels over the delta and the mean", () => {
  const a = new Uint8Array([0, 0, 0, 255, 100, 100, 100, 255]);
  const b = new Uint8Array([4, 4, 4, 255, 100, 100, 100, 255]);     // |Δ| = 12: not changed
  assert.deepEqual(diffRaw(a, b, 2, 1, 4).pct, 0);
  const c = new Uint8Array([5, 4, 4, 255, 100, 100, 100, 255]);     // 13: changed
  assert.equal(diffRaw(a, c, 2, 1, 4).pct, 50);
  assert.throws(() => diffRaw(a, c, 4, 1, 4));
  assert.equal(PIXEL_DELTA, 12);
});

test("knob-ab: verdict needs max(3×noise, noise+2pp) — calibrated on the measured puddle A/Bs", () => {
  assert.equal(NOISE_MULT, 3);
  assert.equal(MIN_MARGIN, 2.0);
  assert.equal(verdict(1.0, 2.38).pass, false);    // GLX pre-satin: invisible by eye → FAIL (2× would have passed it)
  assert.equal(verdict(3.03, 3.69).pass, false);   // TLX pre-satin: within noise → FAIL
  assert.equal(verdict(1.05, 35.51).pass, true);   // GLX satin
  assert.equal(verdict(2.99, 22.0).pass, true);    // TLX satin
  assert.equal(verdict(0.1, 1.9).pass, false);     // tiny noise still needs +2 pp
  assert.match(verdict(3.03, 3.69).line, /^= knob-ab FAIL/);
});

test("knob-ab: args — --knob required, numbers checked, --wet feeds wetness, --set parses", () => {
  assert.throws(() => parseArgs([]), /--knob/);
  assert.throws(() => parseArgs(["--knob", "x", "--backend", "vulkan"]), /backend/);
  const o = parseArgs(["--knob", "puddles", "--weather", "rain", "--wet", "1", "--set", "lampWarmup=0"]);
  assert.deepEqual(o.set, { lampWarmup: 0, wetness: 1 });
  assert.equal(o.backend, "three");
  assert.equal(o.desktop, false);
  assert.throws(() => parseSet("a=x"), /bad pair/);
});
