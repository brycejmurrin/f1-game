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
import fs from "node:fs";
import { analyse, analyseHeap, analyseAlloc, analyseCpu, analyseSpikeCpu, analyseSpikeWork, analyseSpikePassKinds, analyseWindow, analyseGapWork, analyseRaceEntrySpans, analyseRaceEntryLoaf, raceEntrySpanList, analyseDepthDiscard } from "../../tools/gfx/frame-hitch.mjs";

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

// A CDP Profiler.Profile: nodes with callFrames, `samples` naming the node
// hit at each tick, `timeDeltas` in MICROseconds between ticks.
function cpuNode(id, fn, url, line, children) {
  return { id, callFrame: { functionName: fn, url, lineNumber: line }, children: children || [] };
}

test("analyseCpu ranks by exact self time and folds a function reached two ways", () => {
  // getNodeBuilderState reached from two parents (ids 3 and 5) with 300 ms
  // between them; createBindings 100 ms; the root itself 10 ms. Self time is
  // the sum of the deltas of the samples that hit a node, not a hit count,
  // so unequal sample spacing must be respected.
  const profile = {
    nodes: [
      cpuNode(1, "(root)", "", 0, [2, 4]),
      cpuNode(2, "render", "http://x/js/render/three/tlx.js?v=abc", 3400, [3]),
      cpuNode(3, "getNodeBuilderState", "http://x/vendor/three-0.186.1/three.webgpu.min.js", 5, []),
      cpuNode(4, "endPass", "http://x/js/render/three/tlx-shadow.js?v=abc", 260, [5, 6]),
      cpuNode(5, "getNodeBuilderState", "http://x/vendor/three-0.186.1/three.webgpu.min.js", 5, []),
      cpuNode(6, "createBindings", "http://x/vendor/three-0.186.1/three.webgpu.min.js", 5, []),
    ],
    samples:    [3,      3,      5,       6,      1,     6],
    timeDeltas: [100000, 50000,  150000,  40000,  10000, 60000],
  };
  const a = analyseCpu(profile);
  assert.equal(a.totalMs, 410, "total is the sum of the deltas");
  assert.match(a.verdict, /TOP SELF TIME: getNodeBuilderState/);
  assert.equal(a.rows[0].ms, 300, "two parents fold into one 300 ms row");
  assert.equal(a.rows[1].site, "createBindings @ vendor/three-0.186.1/three.webgpu.min.js:6");
  assert.equal(a.rows[1].ms, 100);
  assert.equal(a.files[0].file, "vendor/three-0.186.1/three.webgpu.min.js");
  assert.ok(a.files[0].share > 0.97, "the per-file fold attributes 400 of 410 ms to the bundle");
});

test("analyseCpu reports an absent profile as absent, never as an empty ranking", () => {
  assert.match(analyseCpu(null).note, /no CPU profile/);
  assert.match(analyseCpu({ nodes: [] }).note, /no CPU profile/);
});

test("analyseSpikeCpu attributes only the samples that fall inside spike frames, on the joined clock", () => {
  // Profiler clock: startTime 5,000,000 us; one sample every 500 us. Page clock at
  // Profiler.start: 1000 ms. So sample i sits at page 1000 + 0.5 * (i + 1) ms.
  const nodes = [
    { id: 1, callFrame: { functionName: "(root)", url: "" }, children: [2, 5, 4] },
    { id: 2, callFrame: { functionName: "(garbage collector)", url: "" } },
    { id: 5, callFrame: { functionName: "tick", url: "http://127.0.0.1:1/probe-fixture.js?v=dev", lineNumber: 1 }, children: [6] },
    { id: 6, callFrame: { functionName: "build", url: "" }, children: [7] },
    { id: 7, callFrame: { functionName: "build", url: "" }, children: [3] },
    { id: 3, callFrame: { functionName: "render", url: "http://127.0.0.1:1/probe-fixture.js?v=dev", lineNumber: 9 } },
    { id: 4, callFrame: { functionName: "idle", url: "" } },
  ];
  const samples = [], timeDeltas = [];
  for (let i = 0; i < 2000; i++) {           // 1000 ms of samples, page 1000.5 .. 2000
    const page = 1000 + 0.5 * (i + 1);
    samples.push(page >= 1200 && page < 1350 ? 2 : page >= 1350 && page < 1400 ? 3 : 4);
    timeDeltas.push(500);
  }
  const profile = { startTime: 5000000, nodes, samples, timeDeltas };
  // Frames: one 200 ms spike at page 1200-1400, normal frames elsewhere.
  const t0 = [1100, 1200, 1500], dur = [16, 200, 16];
  const a = analyseSpikeCpu(profile, t0, dur, 100, 1000);
  assert.equal(a.spikes, 1); assert.equal(a.spikeMs, 200);
  assert.ok(Math.abs(a.sampledMs - 200) <= 1, "every sample of the 200 ms frame is inside: " + a.sampledMs);
  assert.ok(a.coverage >= 0.99 && a.coverage <= 1.01, "the clock join covers the spike: " + a.coverage);
  assert.equal(a.rows[0].site, "(garbage collector) @ :?"); assert.ok(Math.abs(a.rows[0].ms - 150) <= 1);
  assert.equal(a.rows[1].site, "render @ probe-fixture.js:10"); assert.ok(Math.abs(a.rows[1].ms - 50) <= 1);
  assert.equal(a.rows[1].path, "build×2 <- tick", "the caller chain, nearest first, repeats folded, without (root)");
  assert.ok(!a.rows.some((r) => r.site.startsWith("idle")), "samples outside the spike are not attributed");
  assert.match(a.verdict, /INSIDE THE 1 SPIKES: \(garbage collector\)/);
  // A wrong join (page clock off by a second) reports a coverage of ~0, not a ranking.
  const off = analyseSpikeCpu(profile, t0, dur, 100, 3000);
  assert.equal(off.sampledMs, 0); assert.match(off.verdict, /clock join failed/);
  assert.equal(analyseSpikeCpu(profile, t0, [16, 16, 16], 100, 1000).spikes, 0);
  assert.match(analyseSpikeCpu(null, t0, dur, 100, 1000).note, /no CPU profile/);
});

test("analyseSpikeWork sums per-frame resource calls inside and outside the spike frames", () => {
  const dur = [16, 200, 16, 150, 16];
  const workFrames = [[0, { "gpu.createBuffer": 1, "gpu.submitMs": 0.5, "gpu.wrappedMs": 0.5 }], [1, { "gpu.createBuffer": 30, "gpu.writeBufferKB": 4096, "gpu.submitMs": 180.2, "gpu.writeBufferMs": 4, "gpu.wrappedMs": 184.2 }],
                      [3, { "gpu.createBuffer": 10, "gpu.submitMs": 120, "gpu.wrappedMs": 120 }], [4, { "gpu.submit": 1 }]];
  const w = analyseSpikeWork(workFrames, dur, 100);
  assert.equal(w.frames, 2); assert.equal(w.restFrames, 3);
  assert.equal(w.inSpike["gpu.createBuffer"], 40); assert.equal(w.inRest["gpu.createBuffer"], 1);
  assert.equal(w.inSpike["gpu.writeBufferKB"], 4096); assert.equal(w.inRest["gpu.submit"], 1);
  assert.match(w.summary, /createBuffer=40 \(20\.0\/f vs 0\.33\/f\)/);
  assert.doesNotMatch(w.summary, /Ms/, "timed kinds leave the count summary");
  assert.match(w.timed, /^submit=300ms \(150\.1\/f vs 0\.17\/f\) writeBuffer=4ms/, "the blocking call reads first: " + w.timed);
  assert.doesNotMatch(w.timed, /wrapped/, "the per-frame total is not a timed kind");
  assert.deepEqual(w.wrappedMs, { spike: 304.2, rest: 0.5, spikeDur: 350, restDur: 48 });
  assert.match(w.remainder, /^wrapped GPU calls 304 ms of 350 ms inside the spikes \(87%\) vs 1 of 48 ms outside \(1%\)/, w.remainder);
  assert.match(analyseSpikeWork(null, dur, 100).note, /no per-frame work/);
});

test("analyseSpikePassKinds ranks the pass kinds that spike frames run and normal frames do not", () => {
  const main = "1152x648/rgba16float:clear", shadow = "2048x2048/depth:clear", post = "1152x648/rgba8unorm:load";
  const passSig = [], dur = [];
  for (let i = 0; i < 40; i++) {
    const isSpike = i % 10 === 0;                       // 4 spike frames, 36 normal
    passSig.push(isSpike ? [main, shadow, post] : (i % 3 === 0 ? [main, post] : [main, post, post]));
    dur.push(isSpike ? 180 : 16);
  }
  passSig.push([]); dur.push(16);                       // a frame that drew nothing is not counted
  const k = analyseSpikePassKinds(passSig, dur, 100);
  assert.equal(k.spikeFrames, 4); assert.equal(k.restFrames, 36);
  assert.equal(k.rows[0].sig, shadow); assert.equal(k.rows[0].inSpikeFrames, 4);
  assert.equal(k.rows[0].spikePerFrame, 1); assert.equal(k.rows[0].restPerFrame, 0);
  assert.match(k.summary, /^2048x2048\/depth:clear: 4\/4 spike frames, 1\/f vs 0\/f/);
  assert.match(analyseSpikePassKinds(passSig, dur.map(() => 16), 100).note, /no rendering frame/);
  assert.match(analyseSpikePassKinds(null, dur, 100).note, /no per-frame pass/);
});

test("analyseWindow reads the driven window in GAME frames, not callbacks or the end-of-run ring (hunt 4 I4)", () => {
  // 20 s window, 400 game frames at a steady 50 ms with one 500 ms frame, and
  // two wrapped rAF callbacks per game frame (the WebGPU legs' shape): fps must
  // come from the frame count (20.0), not the 800 callbacks (40.0).
  const t = [];
  let at = 1000;
  for (let i = 0; i < 400; i++) { at += i === 200 ? 500 : 50; t.push(at); }
  const w = analyseWindow({ t0: 1000, t1: 21000, f0: 120, f1: 520 }, t, 800);
  assert.equal(w.source, "LoopHealth.frames");
  assert.equal(w.frames, 400);
  assert.equal(w.fps, 20);
  assert.equal(w.msPerFrame, 50);
  assert.equal(w.callbacksPerFrame, 2);
  assert.equal(w.p50, 50); assert.equal(w.p95, 50); assert.equal(w.max, 500);
  assert.equal(w.intervals, 399);
  // No LoopHealth: the callbacks stand in, and the source says they may over-count.
  const cb = analyseWindow({ t0: 0, t1: 10000, f0: -1, f1: -1 }, [], 600);
  assert.equal(cb.frames, 600); assert.equal(cb.fps, 60);
  assert.match(cb.source, /rAF callbacks/);
  // A window that never closed is named, never a zero.
  assert.match(analyseWindow({ t0: 5, t1: null, f0: 1, f1: null }, [], 0).note, /never disarmed/);
  assert.match(analyseWindow(null, [], 0).note, /never armed/);
});

test("analyseGapWork attributes a multi-second rAF gap to the step before it and its phase (hunt 4 §A gap ii)", () => {
  // The shape census 452 could not read: a 4.1 s first-draw stall right after
  // the race gate, in which no callback ran, so the >= 100 ms CALLBACK filter
  // of analyseSpikeWork saw nothing at all.
  const marks = { raceCall: 1000, trackReady: 3000 };
  const win = { t0: 5000, t1: 25000 };
  const gaps = [
    { at: 2000, gapMs: 700, prevFrameMs: 12, prevWork: null, between: { "gl.bufferData": 900, "gl.bufferDataKB": 40960, "gpu.wrappedMs": 210 }, armed: false },
    { at: 6000, gapMs: 4100, prevFrameMs: 3900, armed: true,
      prevWork: { "gl.linkProgram": 14, "gl.texImage2D": 6, "gl.texImage2DKB": 8192, "gl.linkProgramMs": 120, "gpu.wrappedMs": 180 }, between: null },
    { at: 26000, gapMs: 650, prevFrameMs: 30, prevWork: null, between: null, armed: false },
  ];
  const longTasks = [[6010, 3895], [100, 50]];
  const g = analyseGapWork(gaps, { marks, win, longTasks });
  assert.equal(g.gaps, 3);
  assert.deepEqual(g.byPhase, { "track build": 1, "driven window": 1, "after window": 1 });
  const w = g.rows[0];
  assert.equal(w.gapMs, 4100); assert.equal(w.phase, "driven window"); assert.equal(w.atMs, 5000);
  assert.equal(w.prevFrameMs, 3900); assert.equal(w.outsideMs, 200); assert.equal(w.longTaskMs, 3895);
  assert.match(w.prev, /linkProgram=14/); assert.match(w.prev, /texImage2D=8192KB/); assert.match(w.prev, /wrapped=180ms/);
  assert.equal(w.between, "-");
  assert.match(g.rows[1].between, /bufferData=900 bufferData=40960KB wrapped=210ms/);
  assert.match(g.summary, /^3 rAF gap\(s\) >= 500 ms .*worst 4100 ms \[driven window\], 3900 ms of it in the step before, 3895 ms in long tasks/);
  assert.match(analyseGapWork([], {}).summary, /no rAF gap/);
  assert.match(analyseGapWork(null).note, /no gap series/);
});

test("analyseRaceEntrySpans names the race-entry span each long task and rAF gap fell in (hunt 4 B-F3.3)", () => {
  // The shape hunter B could only infer: a 2.1 s single task that IS
  // warmCarAssets, the lazy-bundle "resets" leg, a warm stage, and a task in
  // no span at all. Page clock throughout; marks are ms from winT0.
  const rep = { winT0: 1010,
    legs: [{ n: "scenery", ms: 100 }, { n: "resets", ms: 600 }, { n: "loadTrack", ms: 1200 }, { n: "makeCars", ms: 50 },
      { n: "settings", ms: 400 }, { n: "gridUp", ms: 40 }, { n: "finish", ms: 10 }],
    marks: [{ n: "begin:startRace", t: 0 }, { n: "ensureScenery:start", t: 1 }, { n: "ensureScenery:end", t: 80 },
      { n: "warm:request", t: 2400 }, { n: "warmCarAssets:start", t: 2410 }, { n: "warmCarAssets:end", t: 4510 },
      { n: "debrisPrime:start", t: 4511 }, { n: "debrisPrime:end", t: 4530 }, { n: "present:warming", t: 4600 },
      { n: "present:ready", t: 12000 }, { n: "end", t: 12030 }] };
  const warm = { at: 5600, scene: 3000, fx: 1000, post: 500, shadow: 0, mirror: 2900, draw: null, total: 7400 };
  const censusMarks = { raceCall: 1000, trackReady: 2950, parked: 13500 };
  const longTasks = [[500, 100], [1020, 60], [1200, 550], [3425, 2090], [9000, 300], [13100, 200]];
  const gaps = [{ at: 3415, gapMs: 2150, prevFrameMs: 4 }, { at: 20000, gapMs: 900, prevFrameMs: 3 }];
  const r = analyseRaceEntrySpans({ rep, warm, censusMarks, gaps, longTasks, win: { t0: 14000, t1: 34000 } });
  assert.equal(r.fromMark, "census:raceCall");
  assert.equal(r.windowMs, 13000, "race() to the census arming its window");
  assert.equal(r.eventCount, 6, "the task before race() and the gap after the window are out");
  assert.deepEqual(r.events.slice(0, 2).map((e) => e.kind), ["gap", "longtask"], "ranked by length, gaps and tasks together");
  const top = r.events[1];
  assert.equal(top.ms, 2090); assert.equal(top.span, "warmCarAssets");
  assert.equal(top.share, 1); assert.equal(top.atMs, 2425);
  assert.match(top.after, /^warmCarAssets:start \(\+5 ms\)$/); assert.equal(top.before, "warmCarAssets:end");
  const gap = r.events.find((e) => e.kind === "gap");
  assert.equal(gap.span, "warmCarAssets"); assert.equal(gap.prevFrameMs, 4);
  assert.equal(r.events.find((e) => e.ms === 550).span, "leg:resets (ensureRaceSession + ensureAudio lazy bundles)");
  assert.equal(r.events.find((e) => e.ms === 300).span, "warm:fx");
  assert.equal(r.events.find((e) => e.ms === 60).span, "ensureScenery", "a mark span nested in its leg wins the tie");
  const lost = r.events.find((e) => e.ms === 200);
  assert.equal(lost.span, null); assert.match(lost.after, /^end \(\+60 ms\)$/); assert.equal(lost.before, "census:parked");
  assert.deepEqual(r.bySpan.warmCarAssets, { tasks: 1, ms: 2090, longestMs: 2090 });
  assert.equal(r.unattributedMs, 200);
  assert.match(r.summary, /^5 long task\(s\) \(3200 ms\) \+ 1 rAF gap\(s\) in 13000 ms of race entry; warmCarAssets 2090 ms\/1, leg:resets .* 510 ms\/1, warm:fx 300 ms\/1, ensureScenery 60 ms\/1; 200 ms in no span$/);
  // Spans: legs cumulative from winT0, warm stages sequential from warm.at, an
  // unclosed mark span flagged open rather than dropped.
  const { spans } = raceEntrySpanList({ winT0: 0, legs: [{ n: "a", ms: 10 }, { n: "b", ms: 5 }],
    marks: [{ n: "x:start", t: 2 }, { n: "y", t: 9 }] }, { at: 100, scene: 7, fx: null, mirror: 3, total: 12 });
  assert.deepEqual(spans.map((s) => [s.n, s.t0, s.t1, !!s.open]), [["leg:a", 0, 10, false], ["leg:b", 10, 15, false],
    ["x", 2, 9, true], ["warm:scene", 100, 107, false], ["warm:mirror", 107, 110, false], ["warm (other)", 100, 112, false]]);
  // Absence is named, never an empty table.
  assert.match(analyseRaceEntrySpans({ rep: { note: "no __apex.raceEntryProfile" } }).note, /no raceEntryProfile snapshot — no __apex/);
  assert.match(analyseRaceEntrySpans({ rep: { winT0: null } }).note, /never armed/);
  assert.match(analyseRaceEntrySpans().note, /not read/);
});

test("analyseRaceEntryLoaf keeps the longest LoAFs of race entry with their scripts' invokers, named by span (hunt 5 E)", () => {
  // The shape the coordinator asked about: a ~1 s frame inside the stepped car
  // warm whose script attribution says rAF callback vs await continuation.
  const rep = { winT0: 1010, legs: [{ n: "scenery", ms: 100 }, { n: "resets", ms: 600 }],
    marks: [{ n: "warmCarAssets:start", t: 2410 }, { n: "warmCarAssets:end", t: 4510 }, { n: "end", t: 12030 }] };
  const censusMarks = { raceCall: 1000, trackReady: 2950 };
  const loaf = [
    { t: 400, d: 80, rs: 470, bd: 30, s: [{ it: "classic-script", inv: "https://x/js/boot-entry.js", fn: "", url: "https://x/js/boot-entry.js", t: 401, d: 70 }] },   // before race(): out
    { t: 3500, d: 1012.4, rs: 4500, bd: 962.4, s: [
      { it: "user-callback", inv: "FrameRequestCallback", fn: "frame", url: "http://h/js/entry.js", t: 3501, d: 160 },
      { it: "resolve-promise", inv: "startRaceBody.then", fn: "startRaceBody", url: "http://h/js/entry.js", t: 3662, d: 840 }] },
    { t: 1100, d: 120, rs: 0, bd: null, s: [] },
    { t: 30000, d: 400, rs: 30390, bd: 350, s: [] },   // after the window: out
  ];
  const r = analyseRaceEntryLoaf({ loaf, supported: true, rep, censusMarks, win: { t0: 14000, t1: 34000 } });
  assert.equal(r.supported, true);
  assert.equal(r.windowMs, 13000); assert.equal(r.frames, 2); assert.equal(r.framesMs, 1132);
  assert.deepEqual(Object.keys(r.byInvokerType), ["resolve-promise", "user-callback"], "ranked by script ms");
  assert.deepEqual(r.byInvokerType["resolve-promise"], { scripts: 1, ms: 840 });
  const w = r.longest[0];
  assert.deepEqual(Object.keys(w), ["atMs", "startTime", "duration", "renderStart", "blockingDuration", "span", "scripts"]);
  assert.equal(w.atMs, 2500); assert.equal(w.duration, 1012.4); assert.equal(w.renderStart, 3500); assert.equal(w.blockingDuration, 962.4);
  assert.equal(w.span, "warmCarAssets");
  assert.deepEqual(w.scripts[1], { invokerType: "resolve-promise", invoker: "startRaceBody.then", sourceFunctionName: "startRaceBody",
    sourceURL: "http://h/js/entry.js", startTime: 2662, duration: 840 });
  assert.equal(r.longest[1].renderStart, null, "a frame with no rendering step says so");
  assert.equal(r.longest[1].span, "leg:resets (ensureRaceSession + ensureAudio lazy bundles)", "the span it overlaps most");
  assert.match(r.summary, /^2 LoAF\(s\), 1132 ms in 13000 ms of race entry; scripts by invoker: resolve-promise 840 ms\/1, user-callback 160 ms\/1; longest 1012\.4 ms at \+2500 ms in warmCarAssets$/);
  // Capped: never more than topN frames in the JSON.
  const many = Array.from({ length: 40 }, (_, i) => ({ t: 2000 + i * 100, d: 50 + i, rs: 0, bd: 0, s: [] }));
  const capped = analyseRaceEntryLoaf({ loaf: many, supported: true, rep, censusMarks });
  assert.equal(capped.frames, 40); assert.equal(capped.longest.length, 20); assert.equal(capped.longest[0].duration, 89);
  // Absence is named.
  assert.match(analyseRaceEntryLoaf({ supported: false, loaf: [] }).note, /no long-animation-frame PerformanceObserver/);
  assert.match(analyseRaceEntryLoaf({ loaf: null }).note, /no LoAF series/);
  assert.match(analyseRaceEntryLoaf({ loaf: [], supported: true, rep: { note: "x" } }).note, /cannot be placed/);
  assert.match(analyseRaceEntryLoaf({ loaf: [], supported: true, rep, censusMarks }).summary, /^no long animation frame in 12040 ms/);
  // The gap rows carry the step's callback count (one long callback vs many short).
  const g = analyseGapWork([{ at: 3400, gapMs: 1100, prevFrameMs: 1000, prevCallbacks: 7 }, { at: 9000, gapMs: 600, prevFrameMs: 5 }], { marks: censusMarks });
  assert.equal(g.rows[0].prevCallbacks, 7);
  assert.equal(g.rows[1].prevCallbacks, null, "an older recorder's row says unknown, not 0");
});

test("analyseDepthDiscard reads TLX's depth row over the window only, and is null-safe off TLX (hunt 4 A-P1)", () => {
  // WebGL2 with nothing reading depth: 380 of 400 window frames invalidated it.
  const d = analyseDepthDiscard({ on: true, discard: true, kept: false, discards: 120 }, { on: true, discard: true, kept: false, discards: 500 }, 400);
  assert.deepEqual(d, { supported: true, discard: true, keptLastFrame: false, discards: 500, windowDiscards: 380, windowFrames: 400, discardShare: 0.95,
    summary: "380 of 400 window frames discarded depth (95%); last frame dropped it" });
  // WebGPU: depth unneeded, but r186 has no lever — zero invalidations is expected, and said.
  assert.match(analyseDepthDiscard({ on: true, discard: true, kept: false, discards: 0 }, { on: true, discard: true, kept: false, discards: 0 }, 300).summary,
    /^0 of 300 window frames discarded depth \(0%\); last frame dropped it — 0 invalidations with depth unneeded: the WebGPU path/);
  assert.match(analyseDepthDiscard(null, { on: true, discard: false, kept: true, discards: 0 }, 300).summary, /knob OFF/);
  const noStart = analyseDepthDiscard(null, { on: true, discard: true, kept: true, discards: 7 }, 300);
  assert.equal(noStart.windowDiscards, undefined, "no arm-time read: no window count, never a cumulative one passed off as it");
  // GLX/WGX (null), a failed read, post off, a pre-A-P1 build: named, never a zero.
  assert.equal(analyseDepthDiscard(null, null, 300).supported, false);
  assert.match(analyseDepthDiscard(null, { error: "depth-read timeout" }, 300).note, /read failed\): depth-read timeout/);
  assert.match(analyseDepthDiscard(null, { on: false }, 300).note, /post chain is off/);
  assert.match(analyseDepthDiscard(null, { on: true }, 300).note, /predates A-P1/);
});

test("the census sizes WebGL2 uploads from the call's own arguments (hunt 4 §A gap i)", () => {
  // The byte rules live inside gpu-game-check's page init script, which only
  // a browser runs; lift exactly that block and run it here.
  const src = fs.readFileSync(new URL("../../tools/gfx/gpu-game-check.mjs", import.meta.url), "utf8");
  const a = src.indexOf("const viewBytes = ");
  const b = src.indexOf("for (const name of Object.keys(GL_BYTES))");
  assert.ok(a > 0 && b > a, "the GL_BYTES block moved — re-anchor this test, do not drop it");
  const GL = new Function(src.slice(a, b) + "\nreturn GL_BYTES;")();
  const f32 = new Float32Array(256);          // 1024 B
  assert.equal(GL.bufferData([0, f32, 0]), 1024);
  assert.equal(GL.bufferData([0, 4096, 0]), 0, "a size-only bufferData allocates, uploads nothing");
  assert.equal(GL.bufferData([0, f32, 0, 16, 32]), 128, "srcOffset/length are elements");
  assert.equal(GL.bufferSubData([0, 0, f32]), 1024);
  assert.equal(GL.bufferSubData([0, 0, f32, 64]), 768);
  assert.equal(GL.texImage2D([0, 0, 0, 0, 0, { width: 64, height: 32 }]), 64 * 32 * 4, "6-arg TexImageSource form");
  assert.equal(GL.texImage2D([0, 0, 0, 16, 16, 0, 0, 0, new Uint8Array(1024)]), 1024);
  assert.equal(GL.texImage2D([0, 0, 0, 16, 16, 0, 0, 0, null]), 0, "null pixels: allocation only");
  assert.equal(GL.texSubImage2D([0, 0, 0, 0, 0, 0, { naturalWidth: 10, naturalHeight: 10 }]), 400);
  assert.equal(GL.texSubImage2D([0, 0, 0, 0, 8, 8, 0, 0, new Uint8Array(256)]), 256);
  assert.equal(GL.texImage3D([0, 0, 0, 4, 4, 2, 0, 0, 0, new Uint8Array(128)]), 128);
  assert.equal(GL.texSubImage3D([0, 0, 0, 0, 0, 4, 4, 3, 0, 0, { width: 4, height: 4 }]), 4 * 4 * 3 * 4, "image source per layer at 4 B/texel");
});
