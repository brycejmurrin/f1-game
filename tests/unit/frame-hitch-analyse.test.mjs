// The hitch instrument's own arithmetic, on synthetic series where the answer
// is known.
//
// WHY THIS EXISTS. This repository has retracted three performance findings in
// a row, and not one of them was a reasoning error — each was an instrument
// that returned a number nobody had checked against a case with a known
// answer. `window.GLX` never resolved, so a whole memory column silently went
// unsampled and read as "flat". A steering driver ran its own rAF loop, added
// 3600 non-rendering callbacks, and moved the median that decided what
// "wide" meant. A leak was measured over a window that opened while the
// working set was still filling.
//
// analyseHeap() is the instrument the current hypothesis rests on: that the
// hitch is a major GC, driven by a per-frame allocation rate that every
// earlier pass missed because snapMem() forces a collection before reading and
// therefore reports RETENTION. Retention was flat. Allocation was never
// measured. Before that function is allowed to produce a verdict about the
// shipped renderer, it has to produce the right verdict about a series built
// to contain the thing, and the right verdict about one built not to.
import { test } from "node:test";
import assert from "node:assert/strict";
import { analyse, analyseHeap } from "../../tools/gfx/frame-hitch.mjs";

// A frame series: `spikeEvery` frames apart, `spikeMs` long, `baseMs` otherwise.
function series(frames, baseMs, spikeEvery, spikeMs) {
  const t0 = [], dur = [];
  let t = 0;
  for (let i = 0; i < frames; i++) {
    const isSpike = spikeEvery > 0 && i > 0 && i % spikeEvery === 0;
    const d = isSpike ? spikeMs : baseMs;
    t0.push(t); dur.push(d); t += d;
  }
  return { t0, dur };
}

test("analyse separates a periodic spike train from a clean run", () => {
  const clean = series(600, 16, 0, 0);
  assert.equal(analyse(clean.t0, clean.dur).spikes, 0, "a flat series has no spikes");

  // 16 ms frames with a 120 ms frame every 180 — about every 3 s, the symptom.
  const hitchy = series(1200, 16, 180, 120);
  const a = analyse(hitchy.t0, hitchy.dur);
  assert.ok(a.spikes >= 4, `expected a spike train, got ${a.spikes}`);
  assert.equal(a.periodic, true, `expected periodic, got CV ${a.gapCV}`);
  assert.ok(a.gapMedianS > 2.5 && a.gapMedianS < 4, `gap ${a.gapMedianS}s should be ~3s`);
});

// Build a sawtooth heap: `allocPerFrameMB` added each frame, and a collection
// that returns it to `floorMB` whenever the heap passes `ceilMB`. `onSpike`
// decides whether the collecting frame is also the expensive one.
function sawtooth(frames, baseMs, allocPerFrameMB, floorMB, ceilMB, gcCostMs) {
  const t0 = [], dur = [], heap = [];
  let t = 0, h = floorMB;
  for (let i = 0; i < frames; i++) {
    h += allocPerFrameMB;
    let d = baseMs;
    if (h > ceilMB) { h = floorMB; d = gcCostMs; }
    t0.push(t); dur.push(d); heap.push(h); t += d;
  }
  return { t0, dur, heap };
}

test("analyseHeap names GC when the collections land on the spikes", () => {
  // 0.7 MB/frame at 16 ms is ~44 MB/s: a 130 MB band then collects about
  // every 3 s, and the collecting frame costs 110 ms. This is the hypothesis
  // rendered as data.
  const s = sawtooth(1500, 16, 0.7, 60, 190, 110);
  const a = analyse(s.t0, s.dur);
  assert.ok(a.spikes >= 4, `fixture should spike, got ${a.spikes}`);
  const h = analyseHeap(s.heap, s.t0, s.dur, a.spikeThresholdMs);
  assert.ok(h.allocMBps > 35 && h.allocMBps < 55, `alloc rate ${h.allocMBps} MB/s should be ~44`);
  assert.ok(h.collections >= 4, `expected collections, got ${h.collections}`);
  assert.equal(h.spikesNearGC, h.spikes, "every spike here IS a collection");
  assert.ok(h.enrichment >= 1.8, `enrichment ${h.enrichment} should be well above chance`);
  assert.match(h.verdict, /GC IS ON THE SPIKES/);
});

test("analyseHeap clears GC when the spikes are somewhere else", () => {
  // Same allocation rate and the same collection cadence — but collecting is
  // cheap, and the expensive frames come from elsewhere on a DIFFERENT period.
  // A verdict that keys on "there are collections and there are spikes" passes
  // this by mistake; only the coincidence test rejects it.
  const s = sawtooth(1500, 16, 0.7, 60, 190, 16);
  for (let i = 0; i < s.dur.length; i++) if (i > 0 && i % 137 === 0) s.dur[i] = 120;
  // rebuild the clock so the injected spikes carry their own cost
  let t = 0;
  for (let i = 0; i < s.dur.length; i++) { s.t0[i] = t; t += s.dur[i]; }
  const a = analyse(s.t0, s.dur);
  assert.ok(a.spikes >= 4, `fixture should spike, got ${a.spikes}`);
  const h = analyseHeap(s.heap, s.t0, s.dur, a.spikeThresholdMs);
  assert.ok(h.collections >= 4, "the collections are still there");
  assert.ok(h.enrichment < 1.8, `enrichment ${h.enrichment} should not clear the bar`);
  assert.match(h.verdict, /GC is NOT the spike source/);
});

test("analyseHeap reports an unsampled series as unsampled, never as flat", () => {
  // The GLX-identifier bug in one line: a column that was never read must not
  // come back as a measurement. An all-zero heap is "no performance.memory",
  // not "0 MB/s allocated".
  const s = series(600, 16, 0, 0);
  const h = analyseHeap(new Array(600).fill(0), s.t0, s.dur, 40);
  assert.ok(h.note && /no performance\.memory/.test(h.note), `got ${JSON.stringify(h)}`);
  assert.equal(h.allocMBps, undefined, "an unsampled series reports no rate at all");
});
