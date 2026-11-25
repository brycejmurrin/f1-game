/* AiDrive.brakeTarget / brakeDecision characterization (#6505): replays ctxs recorded from a live full-grid
   Monza race and pins every output bit for bit, so an allocation fix to the look-ahead loop cannot move a
   braking point. `out` is what the game produced live; `outHard` is the same ctx driven 8 % + 2 m/s over its live vLim with a
   0.96 errMul (braking engaged, so the _bind feed-forward is exercised), computed at tree 0d28a237.
   Run: node --test tests/unit/brake-target-characterization.test.mjs */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import { seedLog } from "../helpers/seed-log.mjs";
import { absSrc } from "../helpers/abs-src.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const GOLD = JSON.parse(readFileSync(join(ROOT, "tests/data/brake-target-golden.json"), "utf8"));

function load() {
  const ctx = vm.createContext({ Math, console, Object, Array, Number, isFinite, Float64Array });
  seedLog(ctx);
  for (const f of ["js/core/mat4.js", "js/physics/ai-strategy.js", "js/physics/ai-drive.js"]) {
    vm.runInContext(readFileSync(join(ROOT, f), "utf8"), ctx, { filename: absSrc(f) });
  }
  return vm.runInContext("AiDrive", ctx);
}
const A = load();

// JSON cannot carry -0, so a recorded -0 reads back as 0: equal as numbers, every other bit pinned.
const same = (a, b) => Object.is(a, b) || (a === 0 && b === 0);
const KEYS = ["braking", "brakeLvl", "vLim", "excess", "ff"];

function ctxOf(r, samples, hard) {
  const { rows, win, out, outHard, stats, ...scalars } = r;
  const c = { ...scalars, traits: r.traits, samples, team: null, stats };
  if (hard) { c.speed = r.out.vLim * 1.08 + 2; c.errMul = 0.96; }
  return c;
}
function windowOf(r) {
  const w = r.win, n = w.n;
  // The game passes AI_LOOK_CAP-long per-car Float64Arrays and reads only the first n.
  const cap = n + 8, v = new Float64Array(cap), mu = new Float64Array(cap), bank = w.bank ? new Float64Array(cap) : null;
  v.set(w.v); mu.set(w.mu); if (bank) bank.set(w.bank);
  return A.lookWindow(v, mu, n, w.d, w.step, bank);
}
function pooledOf(r) {
  const w = r.win;
  A.beginLook();
  for (let i = 0; i < w.n; i++) A.pushLook(w.d + i * w.step, w.v[i], w.bank ? w.bank[i] : 0, w.mu[i]);
  return A.endLook();
}
function check(got, want, label) {
  for (const k of KEYS) assert.ok(same(got[k], want[k]), `${label} ${k}: ${got[k]} vs golden ${want[k]}`);
}

test("brakeDecision replays the recorded Monza race bit for bit (#6505)", () => {
  assert.ok(GOLD.recs.length >= 80, "golden set present");
  assert.ok(GOLD.recs.filter(r => r.blocker && r.blockerGap < 16).length >= 20, "attacking ctxs covered");
  GOLD.recs.forEach((r, i) => {
    check(A.brakeDecision(ctxOf(r, windowOf(r))), r.out, `rec ${i} live`);
    check(A.brakeDecision(ctxOf(r, windowOf(r), true)), r.outHard, `rec ${i} hard`);
  });
  assert.ok(GOLD.recs.filter(r => r.outHard.braking).length >= 40, "the hard variant exercises the feed-forward");
});

test("brakeTarget: the pooled array path and the indexed window agree on the recorded race (#6505)", () => {
  GOLD.recs.forEach((r, i) => {
    assert.ok(same(A.brakeTarget(ctxOf(r, pooledOf(r))), r.out.vLim), `rec ${i} pooled vLim`);
    check(A.brakeDecision(ctxOf(r, pooledOf(r), true)), r.outHard, `rec ${i} pooled hard`);
  });
});

test("brakeTarget: repeated calls on one ctx are stable (no hidden state across calls)", () => {
  const r = GOLD.recs.find(x => x.blocker && x.blockerGap < 16);
  const c = ctxOf(r, windowOf(r), true);
  const first = { ...A.brakeDecision(c) };
  for (let k = 0; k < 2000; k++) A.brakeDecision(c);
  check(A.brakeDecision(c), first, "after 2000 calls");
});
