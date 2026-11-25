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

// The loop as it stood before #6505 (tree 0d28a237), frozen as the reference for input shapes the race never
// records: missing banks, plain arrays, NaN / ±0 / undefined / null / strings, n = 0, n > 64, descending rows,
// negative steps. The prologue and epilogue were not touched, so a no-attack ctx compares through vLim.
function refLimSq(ctx) {
  const samples = ctx.samples, window = samples && samples.v !== undefined && !Array.isArray(samples) ? samples : null;
  const n = window ? window.n : samples.length, AI_DF = 0.65;
  let windowD = window ? window.d : 0, vLimSq = Infinity;
  const load = ctx.aeroLoad != null ? ctx.aeroLoad : 0.5, latMax = (ctx.latMax || 22) * (1 + (load - 0.5) * 0.055);
  const brake = ctx.brake || 22, grip = ctx.grip || 1, gravity = ctx.gravity ?? 9, scrub = 2 * brake * 0.85;
  const V = Math.max(0.05, ctx.pace ?? 1) * Math.max(1, ctx.vmax ?? 72), vSq = V * V;
  const env = (kk, L, support) => {
    const den = kk - L * AI_DF / vSq;
    if (den > 0) { const v = Math.sqrt(Math.max(0, L + support) / den); if (v <= V) return v; }
    return Math.sqrt(Math.max(0, L * (1 + AI_DF) + support) / kk);
  };
  for (let i = 0; i < n; i++) {
    const s = window ? null : samples[i];
    const d = Math.max((window ? windowD : s.d) || 0, 1);
    if (window) windowD += window.step;
    const dSq = scrub * d;
    if (dSq >= vLimSq) continue;   // the result is order-independent, so the reference never breaks early
    const k = Math.max(Math.abs((window ? window.v[i] : s.k) || 0), 1e-5);
    const bankMu = window ? window.mu[i] : s.mu !== undefined ? s.mu : A.bankGrip(s.bank);
    const bank = window ? window.bank && window.bank[i] : s.bank;
    const support = bank && Number.isFinite(bank) ? gravity * Math.sin(bank) : 0;
    const vC = env(k, Math.max(0, latMax * bankMu * grip), support) * ctx.traits.skill * (ctx.diffCorner || 1);
    const entrySq = vC * vC + dSq;
    if (entrySq >= 0 && entrySq < vLimSq) vLimSq = entrySq;
  }
  let vLim = Math.sqrt(vLimSq);
  if (!Number.isFinite(vLim)) vLim = 1e6;
  return ctx.errMul ? vLim * ctx.errMul : vLim;
}

test("brakeTarget matches the pre-#6505 loop on edge-shaped inputs (differential)", () => {
  let seed = 6505; const rnd = () => (seed = (seed * 1103515245 + 12345) >>> 0) / 4294967296;
  const odd = [NaN, 0, -0, undefined, null, "0.1", true, Infinity, -Infinity];
  const pick = (p, f) => (rnd() < p ? odd[(rnd() * odd.length) | 0] : f());
  const traits = { skill: 0.97, craft: 0.8, optimism: 0, consistency: 0.75 };
  for (let run = 0; run < 3000; run++) {
    const n = [0, 1, 3, 20, 41, 64, 70, 130][run % 8], typed = rnd() < 0.6, oddP = run % 3 === 0 ? 0.15 : 0;
    const mk = () => (typed ? new Float64Array(n + 4) : new Array(n));
    const v = mk(), mu = mk(), bank = rnd() < 0.3 ? null : mk(), rows = [];
    for (let i = 0; i < n; i++) {
      v[i] = pick(oddP, () => (rnd() - 0.5) * 0.06);
      mu[i] = pick(oddP, () => 0.9 + rnd() * 0.1);
      if (bank) bank[i] = pick(oddP, () => (rnd() < 0.3 ? (rnd() - 0.5) * 0.4 : 0));
      const row = { d: pick(oddP, () => i * 4 + rnd() * 4), k: v[i], bank: bank ? bank[i] : undefined };
      if (rnd() < 0.5) row.mu = mu[i];
      rows.push(row);
    }
    if (rnd() < 0.2) rows.reverse();
    // A window's d and step are numbers by lookWindow's contract (the old loop string-concatenated a string d).
    const num = f => { const x = pick(oddP, f); return typeof x === "string" ? NaN : x; };
    const step = rnd() < 0.1 ? -4 : num(() => 2 + rnd() * 4), d0 = num(() => rnd() * 8 - 2);
    const base = { traits, latMax: 20 + rnd() * 6, aeroLoad: rnd(), brake: 18 + rnd() * 8, grip: 0.8 + rnd() * 0.4,
      pace: rnd() < 0.5 ? 1 : 0.8 + rnd() * 0.4, vmax: 70 + rnd() * 25, diffCorner: rnd() < 0.5 ? 1 : 0.95, gravity: 9.81,
      speed: 60, errMul: rnd() < 0.2 ? 0.96 : 1 };
    const win = A.lookWindow(v, mu, n, d0, step, bank);
    const want = refLimSq({ ...base, samples: { v, mu, bank, n, d: d0, step } });
    assert.ok(same(A.brakeTarget({ ...base, samples: win }), want), `run ${run} window n=${n}`);
    assert.ok(same(A.brakeTarget({ ...base, samples: rows }), refLimSq({ ...base, samples: rows })), `run ${run} rows n=${n}`);
  }
  // One binding row per odd bank: a non-number bank gave no gravity support (Number.isFinite), staged or not.
  for (const b of ["0.3", true, null, undefined, NaN, Infinity, -0, 0.3]) {
    const one = { traits, samples: [{ d: 1, k: 0.03, bank: b }], gravity: 9.81 };
    assert.ok(same(A.brakeTarget(one), refLimSq(one)), `row bank ${String(b)}`);
  }
});
