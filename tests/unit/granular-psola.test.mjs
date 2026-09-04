/* granular-psola.test.mjs — the granular engine voice must move PITCH without
 * moving the engine's fixed resonances.
 *
 * This is the measurement that condemned the previous attempt at the same
 * problem. js/audio/engine.js records it: crossfading f1_rev.mp3 in under load
 * read DARKER (centroid 1489 -> 1389 Hz at the same rev) instead of brighter,
 * so the crossfade was removed and load moved onto the lowpass. A replacement
 * for the pitching core that is not held to the same number would be shipping
 * on hope.
 *
 * The defect being fixed, measured on the shipped asset: playbackRate takes the
 * spectral centroid of f1_engine.mp3 from 1526 Hz at ratio 1.0 to 798 Hz at
 * 0.25 — a 48% darkening, because tape speed drags the exhaust/airbox/body
 * resonances down with the firing rate. Those resonances are physical; they do
 * not change with rpm.
 *
 * A synthetic source is used ON PURPOSE rather than the real mp3: node cannot
 * decode MP3 (playwright's bundled ffmpeg has no mp3 decoder), and more to the
 * point a synthetic one has KNOWN ground truth — three resonances at
 * 700/1600/2900 Hz that must not move. The same algorithm was separately
 * measured against the real f1_engine.mp3 through Chromium's own decoder and
 * held the centroid at 1522 -> 1525 Hz across the same range.
 *
 * Run: node --test tests/unit/granular-psola.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const SR = 48000;

// Evaluate the REAL worklet against a fake AudioWorkletProcessor, the same way
// audio-sample-upgrade.test.mjs runs the real engine.js against a fake context.
function loadProcessor() {
  let Registered = null;
  const sb = {
    Math, Map, Float32Array, Object,
    AudioWorkletProcessor: class { constructor() { this.port = { onmessage: null, postMessage() {} }; } },
    registerProcessor: (name, cls) => { Registered = { name, cls }; },
    sampleRate: SR,
  };
  const src = fs.readFileSync(path.join(ROOT, "js/audio/granular-worklet.js"), "utf8")
    .replace(/^export\s+/gm, "");
  vm.runInContext(src, vm.createContext(sb), { filename: "js/audio/granular-worklet.js" });
  assert.ok(Registered, "the worklet must registerProcessor");
  assert.equal(Registered.name, "apex-granular", "engine.js constructs the node by this exact name");
  return Registered.cls;
}

const FORMANTS = [700, 1600, 2900];
const F0 = 100;

/** Pulse train at F0 through three FIXED resonances — an engine's exhaust,
 *  airbox and body, which do not move with rpm. */
function source(n) {
  const exc = new Float32Array(n);
  const P = Math.round(SR / F0);
  for (let i = 0; i < n; i += P) exc[i] = 1;
  const out = new Float32Array(n);
  for (const f of FORMANTS) {
    const w = (2 * Math.PI * f) / SR, r = Math.exp((-Math.PI * 90) / SR);
    const a1 = -2 * r * Math.cos(w), a2 = r * r;
    let y1 = 0, y2 = 0;
    for (let i = 0; i < n; i++) { const y = exc[i] - a1 * y1 - a2 * y2; out[i] += y * (1 - r); y2 = y1; y1 = y; }
  }
  let peak = 0;
  for (const v of out) peak = Math.max(peak, Math.abs(v));
  for (let i = 0; i < n; i++) out[i] /= peak || 1;
  return out;
}

function goertzel(x, f) {
  const w = (2 * Math.PI * f) / SR, c = 2 * Math.cos(w);
  let s1 = 0, s2 = 0;
  for (let i = 0; i < x.length; i++) { const s = x[i] + c * s1 - s2; s2 = s1; s1 = s; }
  return Math.sqrt(Math.max(0, s1 * s1 + s2 * s2 - c * s1 * s2)) / x.length;
}
function centroid(x) {
  let num = 0, den = 0;
  for (let f = 100; f <= 5000; f += 25) { const m = goertzel(x, f); num += f * m; den += m; }
  return den ? num / den : 0;
}
function period(x) {                       // autocorrelation lag -> samples
  let best = -Infinity, lag0 = 0;
  for (let lag = 60; lag < 3000; lag++) {
    let s = 0;
    for (let i = 0; i + lag < x.length; i++) s += x[i] * x[i + lag];
    if (s > best) { best = s; lag0 = lag; }
  }
  return lag0;
}

/** What the shipped core does today: resample the whole recording. */
function naive(src, ratio, n) {
  const out = new Float32Array(n);
  let p = 0;
  for (let i = 0; i < n; i++) {
    const i0 = Math.floor(p), fr = p - i0;
    out[i] = src[i0 % src.length] * (1 - fr) + src[(i0 + 1) % src.length] * fr;
    p += ratio;
  }
  return out;
}

/** Render n samples out of the real worklet at a fixed ratio. */
function render(Cls, src, p0, ratio, n) {
  const proc = new Cls();
  proc.port.onmessage({ data: { pcm: src, p0, loopStart: 0, loopEnd: src.length } });
  const out = new Float32Array(n);
  const block = new Float32Array(128);
  const params = { ratio: new Float32Array([ratio]) };
  for (let off = 0; off < n; off += 128) {
    block.fill(0);
    proc.process([], [[block]], params);
    out.set(block.subarray(0, Math.min(128, n - off)), off);
  }
  return out;
}

const RATIOS = [1.0, 0.7, 0.5, 0.35, 0.25];

test("the worklet registers as apex-granular and survives a block before it is loaded", () => {
  const Cls = loadProcessor();
  const proc = new Cls();
  const block = new Float32Array(128).fill(0.5);
  const params = { ratio: new Float32Array([0.5]) };
  assert.equal(proc.process([], [[block]], params), true, "process must keep the node alive");
  assert.ok(block.every((v) => v === 0), "with no PCM yet it must emit silence, not the caller's junk");
});

test("pitch tracks the ratio — the same curve the playbackRate core gave", () => {
  const Cls = loadProcessor();
  const src = source(SR * 2);
  const p0 = SR / F0;
  let prev = 0;
  for (const r of RATIOS.slice().reverse()) {       // ascending ratio
    const got = period(render(Cls, src, p0, r, SR));
    const want = p0 / r;
    assert.ok(Math.abs(got - want) / want < 0.06,
      `ratio ${r}: period ${got} samples, expected ~${want.toFixed(0)}`);
    assert.ok(prev === 0 || got < prev, `ratio ${r}: period must shorten as the ratio rises`);
    prev = got;
  }
});

test("the resonances DO NOT move with the pitch — the whole point of the rewrite", () => {
  const Cls = loadProcessor();
  const src = source(SR * 2);
  const p0 = SR / F0;
  const ref = centroid(src.subarray(0, SR));
  const naiveC = [], psolaC = [];
  for (const r of RATIOS) {
    naiveC.push(centroid(naive(src, r, SR)));
    psolaC.push(centroid(render(Cls, src, p0, r, SR)));
  }
  // The defect, reproduced: tape speed drags the spectrum down with the pitch.
  const naiveDrop = 1 - naiveC[naiveC.length - 1] / naiveC[0];
  assert.ok(naiveDrop > 0.3,
    `precondition: playbackRate should darken badly across this range, got ${(naiveDrop * 100).toFixed(0)}%` +
    ` (${naiveC.map((c) => c.toFixed(0)).join(" -> ")})`);
  // The fix: every ratio keeps the source's own spectral centre.
  for (let i = 0; i < RATIOS.length; i++) {
    const err = Math.abs(psolaC[i] - ref) / ref;
    assert.ok(err < 0.2,
      `ratio ${RATIOS[i]}: centroid ${psolaC[i].toFixed(0)} Hz vs source ${ref.toFixed(0)} Hz ` +
      `(${(err * 100).toFixed(0)}% off). Naive for comparison: ${naiveC[i].toFixed(0)} Hz`);
  }
  // And it must beat the thing it replaces where that thing is worst.
  assert.ok(psolaC[psolaC.length - 1] > naiveC[naiveC.length - 1] * 1.4,
    `at the lowest ratio PSOLA ${psolaC.at(-1).toFixed(0)} Hz must clearly beat naive ${naiveC.at(-1).toFixed(0)} Hz`);
});

test("output stays bounded and finite at every ratio and overlap", () => {
  const Cls = loadProcessor();
  const src = source(SR);
  const p0 = SR / F0;
  for (const r of [0.05, 0.25, 1, 4]) {
    const out = render(Cls, src, p0, r, SR / 4);
    let peak = 0;
    for (const v of out) { assert.ok(Number.isFinite(v), `ratio ${r}: non-finite sample`); peak = Math.max(peak, Math.abs(v)); }
    assert.ok(peak > 0, `ratio ${r}: silent output`);
    assert.ok(peak < 4, `ratio ${r}: peak ${peak.toFixed(2)} — overlap-add is not being normalised`);
  }
});
