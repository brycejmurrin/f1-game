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
import { analyse, analyseHeap, analyseAlloc } from "../../tools/gfx/frame-hitch.mjs";

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

// A CDP sampling profile: a node tree plus a `samples` array, where each
// sample is one sampled allocation carrying its REAL size and the id of the
// node that made it.
function node(id, fn, url, line, selfSize, children) {
  return { id, callFrame: { functionName: fn, url, lineNumber: line }, selfSize, children: children || [] };
}
function samplesOf(nodeId, size, count) {
  const out = [];
  for (let i = 0; i < count; i++) out.push({ size, nodeId, ordinal: i });
  return out;
}

test("analyseAlloc corrects the sampler's bias against many small objects", () => {
  // THE CALIBRATION, as a fixture. A run injected a known 500 KB/frame of
  // 56-byte objects against a ~250 KB/frame page baseline, so the injector had
  // to come out around two thirds of the profile. Reading the tree's selfSize
  // put it at 1.2%, below fourteen three.js internals, because V8 samples one
  // allocation per `rate` bytes: a 56-byte object is sampled with probability
  // 1-exp(-56/16384) ~ 1/293, a 64 KB object with probability ~0.98. Raw bytes
  // therefore under-count small-object sites by nearly three hundred times.
  //
  // Here: 2,000 samples of 56 bytes (112 KB raw) against 40 samples of 64 KB
  // (2,560 KB raw). By raw bytes the big-object site wins 23:1. Corrected, the
  // small-object site stands for 2000*56*293 ~ 32.8 MB and the other for
  // 40*64K*1.02 ~ 2.6 MB, so it wins about 12:1 — which is the truth.
  const head = node(1, "(root)", "", 0, 0, [
    node(2, "mintsManySmall", "http://x/js/render/three/tlx.js?v=abc", 1224, 112 * 1024, []),
    node(3, "mintsFewLarge", "http://x/js/render/three/tlx.js?v=abc", 2000, 2560 * 1024, []),
  ]);
  const profile = { head, samples: samplesOf(2, 56, 2000).concat(samplesOf(3, 65536, 40)) };
  const a = analyseAlloc(profile, 100, 6000, 16384);
  assert.match(a.verdict, /TOP RETAINER: mintsManySmall/,
    `raw selfSize would have named mintsFewLarge; got ${a.verdict}`);
  assert.ok(a.sites[0].share > 0.85, `small-object site should dominate once corrected, got ${a.sites[0].share}`);
  // And the bias it corrected stays visible, so a reader can check the claim.
  assert.ok(a.biasedSelfMB < a.totalMB / 10, "the uncorrected total must be reported and must be far smaller");
});

test("analyseAlloc folds one site reached two ways into one row", () => {
  // `materialFor` is reached from draw() and from drawChunked(); the profile
  // therefore holds two nodes for it. They are ONE site — a report that split
  // them would rank a single 60% allocator below a 25% one.
  const head = node(1, "(root)", "", 0, 0, [
    node(2, "draw", "http://x/js/render/three/tlx.js?v=abc", 3107, 0, [
      node(3, "materialFor", "http://x/js/render/three/tlx.js?v=abc", 1224, 0, []),
    ]),
    node(4, "drawChunked", "http://x/js/render/three/tlx.js?v=abc", 3110, 0, [
      node(5, "materialFor", "http://x/js/render/three/tlx.js?v=abc", 1224, 0, []),
    ]),
    node(6, "acquireMesh", "http://x/js/render/three/tlx.js?v=abc", 1859, 0, []),
  ]);
  const profile = { head, samples: samplesOf(3, 64, 500).concat(samplesOf(5, 64, 500), samplesOf(6, 64, 120)) };
  const a = analyseAlloc(profile, 100, 6000, 16384);
  const top = a.sites[0];
  assert.match(top.site, /^materialFor @ js\/render\/three\/tlx\.js:1225$/,
    `site should be folded and cache-buster-free, got ${top.site}`);
  assert.equal(a.sites.filter((x) => /materialFor/.test(x.site)).length, 1, "one site, not two");
  assert.ok(top.share > 0.85, `folded materialFor should dominate, got ${top.share}`);
});

test("analyseAlloc refuses to name a winner when the profile is flat", () => {
  // Eight sites at 12.5% each. The failure mode this guards is the one that
  // matters: a ranked list always HAS a first row, and reporting it as "the
  // allocator" when it holds an eighth of the bytes is how a round gets spent
  // fixing 2% of a problem.
  const kids = [];
  let samples = [];
  for (let i = 0; i < 8; i++) {
    kids.push(node(10 + i, `f${i}`, `http://x/js/a${i}.js`, 10, 0, []));
    samples = samples.concat(samplesOf(10 + i, 64, 100));
  }
  const a = analyseAlloc({ head: node(1, "(root)", "", 0, 0, kids), samples }, 100, 6000, 16384);
  assert.match(a.verdict, /no dominant retainer/);
});

test("analyseAlloc reports an absent or sample-less profile as unusable, never as zero", () => {
  assert.match(analyseAlloc(null, 100, 6000, 16384).note, /no sampling profile/);
  // A tree with no samples is the biased view only. It must say so rather than
  // quietly fall back to it — falling back is what produced the 1.2% reading.
  const t = analyseAlloc({ head: node(1, "(root)", "", 0, 0, [node(2, "f", "u", 1, 999, [])]) }, 100, 6000, 16384);
  assert.match(t.note, /no samples/);
  assert.equal(t.totalMB, undefined, "an unusable profile reports no total at all");
});

test("analyseAlloc says on every result that it measures RETENTION, not allocation", () => {
  // The name is a trap and the last reader of it fell in: a 500 KB/frame
  // injection of pure garbage came out at 1.2% of the profile, because V8
  // holds each sampled object weakly and drops it from the profile when it is
  // collected. Every shape of result therefore carries the caveat, including
  // the degraded one — a note is exactly where a hurried reader looks.
  const withSamples = analyseAlloc(
    { head: node(1, "(root)", "", 0, 0, [node(2, "f", "u", 1, 0, [])]), samples: samplesOf(2, 64, 50) },
    100, 6000, 16384);
  assert.match(withSamples.means, /RETAINED/);
  const noSamples = analyseAlloc({ head: node(1, "(root)", "", 0, 0, [node(2, "f", "u", 1, 9, [])]) }, 100, 6000, 16384);
  assert.match(noSamples.means, /RETAINED/);
});
