// ci-guard-tools — two guards born on 2026-10-15 (weather PRs #1800 / #1885):
//  - tools/ci/ci-rerun.mjs refuses a superseded PR run (re-running one cancelled
//    the live run on the new head), a live run, a green run and a second re-run;
//  - tools/gfx/knob-ab.mjs fails a visual knob whose ON vs OFF frame does not
//    beat the frame-to-frame noise (puddles passed every unit test, rendered invisible).
// Pure functions only, no network, no browser.
//
// Run: node --test tests/unit/ci-guard-tools.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { decide, prNumberOf } from "../../tools/ci/ci-rerun.mjs";
import { diffRaw, verdict, parseSet, parseArgs, PIXEL_DELTA, NOISE_MULT, MIN_MARGIN } from "../../tools/gfx/knob-ab.mjs";

const run = (o = {}) => ({ id: 1, status: "completed", conclusion: "failure", event: "pull_request", head_sha: "aaaa1111", run_attempt: 1, pull_requests: [{ number: 7 }], ...o });

test("ci-rerun: a superseded PR run is refused (the #1800 trap)", () => {
  const v = decide(run({ conclusion: "cancelled", head_sha: "82e73b048" }), "8fca23f8d");
  assert.equal(v.ok, false);
  assert.match(v.reason, /superseded/);
});

test("ci-rerun: a live run, a green run, an unreadable PR head and a second attempt are refused", () => {
  assert.equal(decide(run({ status: "queued" }), "aaaa1111").ok, false);
  assert.equal(decide(run({ status: "in_progress" }), "aaaa1111").ok, false);
  assert.equal(decide(run({ conclusion: "success" }), "aaaa1111").ok, false);
  assert.equal(decide(run(), null).ok, false);
  assert.equal(decide(run({ run_attempt: 2 }), "aaaa1111").ok, false);
  assert.equal(decide(run({ run_attempt: 2 }), "aaaa1111", { again: true }).ok, true);
});

test("ci-rerun: a completed failed run on the current head is allowed; push/dispatch runs need no PR", () => {
  assert.equal(decide(run(), "aaaa1111").ok, true);
  assert.equal(decide(run({ event: "push", pull_requests: [] }), null).ok, true);
  assert.equal(decide(run({ event: "workflow_dispatch", pull_requests: [] }), null).ok, true);
  assert.equal(prNumberOf(run()), 7);
  assert.equal(prNumberOf(run({ pull_requests: [] })), null);
});

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
