#!/usr/bin/env node
// frame-hitch.mjs — PERIODIC frame-hitch detector for the render backends.
// @doc Measures per-rAF-callback main-thread cost and finds PERIODIC hitches (spike train + autocorrelation).
// @skill playwright-probe / webgpu-debug
//
// Why this and not profile-gameloop.mjs: a sampling CPU profile answers "what
// is expensive on average". A report of "it lags every few seconds" is about
// the TAIL and its PERIOD, which an average hides completely. This records
// every rAF callback's own wall cost (not the interval — the interval is
// compositor-driven and meaningless headless), finds the spikes, and asks
// whether they are evenly spaced.
//
// The cost signal is the DURATION OF THE CALLBACK, so it is valid on a box
// with no GPU and no vsync: it measures main-thread work, which is where a
// JS-side periodic stall lives. GPU-side stalls do not show here — that needs
// gpu-census.yml on real hardware.
//
// Usage:
// It also runs V8's sampling heap profiler across the same window (out.alloc).
// That answers WHAT SURVIVES by call stack, not what is allocated — V8 erases a
// sampled object from the profile when it is collected, which --selftest-kb
// proved by putting a known 500 KB/frame of garbage at 1.2% of the profile.
// Garbage is attributed by ABLATION: change one site, re-run, read analyseHeap.
//
//   node tools/gfx/frame-hitch.mjs [track] [--backend three|webgpu|webgl2]
//        [--tlx-webgpu] [--capture] [--seconds N] [--settle N] [--steer-hz N]
//        [--ls k=v] [--json PATH] [--quiet]
//
// --capture turns the soft blit back ON (it is OFF by default here, unlike
// every other probe in tools/gfx): it is a readback that halves the rendered
// frames and restarts the pipeline every 20 s, so it is measurable only as
// itself. Pass it when pixels are the point, never for timing.
//
// Output: a human summary on stderr, one JSON object on stdout.
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  startStaticServer, launchChromium, shutdown, sleep, WEBGPU_CHROMIUM_ARGS,
} from "../lib/harness.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../..");

function parseArgs(argv) {
  const o = { track: "montreal", backend: "three", tlxWebgpu: false, seconds: 30, settle: 6, steerHz: 0, ls: [], json: null, quiet: false, capture: false, selftestKb: 0, ablate: "", cpuProfile: 0 };
  const skip = new Set();
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]; const next = () => argv[++i];
    if (a === "--backend") { o.backend = next(); skip.add(o.backend); }
    else if (a === "--seconds") { o.seconds = +next(); }
    else if (a === "--settle") { o.settle = +next(); }
    // Sinusoidal steering. The sun-shadow anchor is camEye + 20 m along the
    // car's HEADING, so the mechanism under test is heading CHANGE, not lap
    // realism: an oscillating steer exercises it deterministically, and
    // --steer-hz 0 is the straight-line control arm.
    else if (a === "--steer-hz") { o.steerHz = +next(); }
    else if (a === "--ls") { o.ls.push(next()); }
    else if (a === "--json") { o.json = next(); }
    else if (a === "--tlx-webgpu") o.tlxWebgpu = true;
    // THE SOFT BLIT, now opt-in. See the addInitScript below for why it was
    // wrong as a default for a timing tool.
    else if (a === "--capture") o.capture = true;
    // CALIBRATION. Allocate a KNOWN number of KB per frame and see what each
    // instrument says about it. Two of them disagreed by 500x on the real page
    // (sawtooth 256 KB/frame, sampling profiler 0.5), and no amount of reading
    // V8 source settles which one is wrong — a known input does.
    else if (a === "--selftest-kb") { o.selftestKb = +next(); }
    // ABLATION is how short-lived garbage gets attributed here, because the
    // sampling profiler cannot (see analyseAlloc: it reports what SURVIVES).
    // Turn one thing off, re-run, read the allocation rate.
    else if (a === "--ablate") { o.ablate = next(); }
    // CPU PROFILE OF THE RACE START. Census 201 moved every lazy pipeline
    // compile off the main thread (createRenderPipeline 26 -> 1) and the
    // 18-25 s spikes stayed, so the stall is somewhere else in the same
    // first-draw path — node-graph codegen, per-object bind-group cloning,
    // uniform-buffer allocation — and those are CPU time, which a sampling
    // profiler measures honestly (unlike garbage; see analyseAlloc). Arms
    // V8's profiler from race() for N seconds, no settle, and ranks
    // functions by SELF time. three's property names survive minification,
    // so getNodeBuilderState / createBindings / build name themselves.
    else if (a === "--cpu-profile") { o.cpuProfile = +next(); }
    else if (a === "--quiet") o.quiet = true;
    else if (!a.startsWith("--") && !skip.has(a)) o.track = a;
  }
  return o;
}
const opts = parseArgs(process.argv.slice(2));
const log = (...m) => { if (!opts.quiet) console.error("[frame-hitch]", ...m); };

// ---- analysis (pure, exported for the unit test) ------------------------
export function analyse(t0, dur, { minSpikes = 4 } = {}) {
  const n = dur.length;
  if (n < 30) return { frames: n, ok: false, reason: "too few frames" };
  const sorted = Array.from(dur).sort((a, b) => a - b);
  const q = (p) => sorted[Math.min(n - 1, Math.max(0, Math.ceil((n - 1) * p)))];
  const p50 = q(0.5);
  // A spike is a frame that costs MUCH more than this page's own typical
  // frame. Relative, because a software rasteriser's "normal" is 10x a real
  // GPU's and a fixed ms threshold would call every frame a spike there.
  // The additive floor stops a page whose p50 is ~0 from flagging noise.
  const thresh = Math.max(p50 * 2.5, p50 + 8);
  const spikes = [];
  for (let i = 0; i < n; i++) if (dur[i] > thresh) spikes.push({ i, t: t0[i], ms: dur[i] });
  const gaps = [];
  for (let i = 1; i < spikes.length; i++) gaps.push((spikes[i].t - spikes[i - 1].t) / 1000);
  const gapSorted = gaps.slice().sort((a, b) => a - b);
  const gapMed = gapSorted.length ? gapSorted[Math.floor(gapSorted.length / 2)] : 0;
  const gapMean = gaps.length ? gaps.reduce((a, b) => a + b, 0) / gaps.length : 0;
  const sd = gaps.length > 1
    ? Math.sqrt(gaps.reduce((a, g) => a + (g - gapMean) ** 2, 0) / (gaps.length - 1)) : 0;
  // Coefficient of variation of the inter-spike gap. A Poisson (random) spike
  // train sits near 1; a periodic one sits near 0. < 0.35 over >= minSpikes
  // spikes is the call.
  const cv = gapMean > 0 ? sd / gapMean : 0;
  const periodic = spikes.length >= minSpikes && gapMed >= 0.4 && cv < 0.35;
  return {
    frames: n, ok: true,
    p50: +p50.toFixed(2), p95: +q(0.95).toFixed(2), p99: +q(0.99).toFixed(2), max: +q(1).toFixed(2),
    spikeThresholdMs: +thresh.toFixed(2),
    spikes: spikes.length,
    spikeMs: spikes.map((s) => +s.ms.toFixed(1)),
    spikeAtS: spikes.map((s) => +(s.t / 1000).toFixed(2)),
    gapsS: gaps.map((g) => +g.toFixed(2)),
    gapMedianS: +gapMed.toFixed(2), gapCV: +cv.toFixed(3),
    periodic,
    verdict: periodic
      ? `PERIODIC hitch: ${spikes.length} spikes, every ~${gapMed.toFixed(1)} s (CV ${cv.toFixed(2)})`
      : spikes.length ? `${spikes.length} spikes, irregular (CV ${cv.toFixed(2)})` : "no spikes",
  };
}

// WHERE THE CPU TIME GOES, by function, over the race start.
//
// A CDP Profiler.Profile: nodes carry a callFrame and an id, `samples` is
// the node id hit at each sample and `timeDeltas` the microseconds between
// samples. Self time per node is the sum of the deltas of the samples that
// hit it — exact, not scaled, which is what makes this the right instrument
// for CPU cost where the heap sampler was the wrong one for garbage.
export function analyseCpu(profile, topN = 28) {
  if (!profile || !profile.nodes || !profile.samples) return { note: "no CPU profile" };
  const byId = new Map();
  for (const n of profile.nodes) byId.set(n.id, n);
  const self = new Map();
  let total = 0;
  const samples = profile.samples, deltas = profile.timeDeltas || [];
  for (let i = 0; i < samples.length; i++) {
    const dt = (deltas[i] || 0) / 1000;   // ms
    total += dt;
    self.set(samples[i], (self.get(samples[i]) || 0) + dt);
  }
  // Fold by (function, file:line): the same function reached from several
  // parents is one row, as analyseAlloc learned the hard way.
  const bySite = new Map();
  for (const [id, ms] of self) {
    const f = (byId.get(id) || {}).callFrame || {};
    const url = String(f.url || "").replace(/\?v=[a-z0-9]+/g, "").replace(/^https?:\/\/[^/]+\//, "");
    const k = `${f.functionName || "(anonymous)"} @ ${url}:${f.lineNumber != null ? f.lineNumber + 1 : "?"}`;
    bySite.set(k, (bySite.get(k) || 0) + ms);
  }
  const rows = [...bySite.entries()].sort((a, b) => b[1] - a[1]).slice(0, topN)
    .map(([site, ms]) => ({ site, ms: +ms.toFixed(1), share: +(ms / Math.max(1e-9, total)).toFixed(3) }));
  // Also fold by FILE, which is the coarse answer: three's bundle vs ours vs
  // the browser's own (garbage collector, program) rows.
  const byFile = new Map();
  for (const [site, ms] of bySite) {
    const file = (site.split(" @ ")[1] || "").replace(/:\d+$/, "") || "(native)";
    byFile.set(file, (byFile.get(file) || 0) + ms);
  }
  const files = [...byFile.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10)
    .map(([file, ms]) => ({ file, ms: +ms.toFixed(1), share: +(ms / Math.max(1e-9, total)).toFixed(3) }));
  return { totalMs: +total.toFixed(1), samples: samples.length, rows, files,
    verdict: rows.length ? `TOP SELF TIME: ${rows[0].site} — ${(rows[0].share * 100).toFixed(0)}% of ${total.toFixed(0)} ms` : "empty profile" };
}

// FORCED SYNCHRONOUS LAYOUT, and whether it is the stall.
//
// The one main-thread cost no renderer instrument can see. It is not a render
// pass, not an allocation and not a draw call — it is the browser recomputing
// layout because JavaScript asked for a measurement after dirtying the DOM,
// and it lands inside the rAF callback with everything else.
//
// The named suspect is js/ui/hud.js's fitHud(): ~15-20 getBoundingClientRect
// reads interleaved with ~9 setProperty writes on document.documentElement,
// memoised on a key but forced through in full every `_fitWait = 30` ticks,
// which at the 10 Hz HUD tick is every 3.0 SECONDS, on by default, in every
// race. "Every few seconds" is the report, so the cadence wants checking
// rather than assuming.
export function analyseLayout(layoutMs, layoutN, t0, dur, threshMs) {
  const n = layoutMs ? layoutMs.length : 0;
  if (n < 30) return { note: "no layout series" };
  // Never sampled must not read as never happened — the window.GLX rule.
  if (!layoutN.some((x) => x > 0)) return { note: "no layout reads observed — the accessors were not wrappable in this context" };
  const elapsedS = (t0[n - 1] - t0[0]) / 1000;
  let total = 0, reads = 0;
  const heavy = [];
  // A frame whose layout reads cost more than a millisecond is a frame that
  // paid for a recalc rather than reading a cached box. Below that it is the
  // accessor call itself and says nothing.
  for (let i = 0; i < n; i++) {
    total += layoutMs[i]; reads += layoutN[i];
    if (layoutMs[i] >= 1) heavy.push({ i, t: t0[i], ms: layoutMs[i], reads: layoutN[i] });
  }
  const gaps = [];
  for (let i = 1; i < heavy.length; i++) gaps.push((heavy[i].t - heavy[i - 1].t) / 1000);
  const gs = gaps.slice().sort((a, b) => a - b);
  const gapMed = gs.length ? gs[Math.floor(gs.length / 2)] : 0;
  const gapMean = gaps.length ? gaps.reduce((a, b) => a + b, 0) / gaps.length : 0;
  const sd = gaps.length > 1
    ? Math.sqrt(gaps.reduce((a, g) => a + (g - gapMean) ** 2, 0) / (gaps.length - 1)) : 0;
  // THE SHARE THAT MATTERS: on the frames that actually stalled, how much of
  // the stall was layout? A cadence that matches proves nothing on its own —
  // plenty of things happen every three seconds — but layout owning most of a
  // spike frame's cost is an attribution.
  let spikeN = 0, spikeCost = 0, spikeLayout = 0;
  for (let i = 0; i < n; i++) {
    if (threshMs && dur[i] > threshMs) { spikeN++; spikeCost += dur[i]; spikeLayout += layoutMs[i]; }
  }
  const share = spikeCost > 0 ? spikeLayout / spikeCost : 0;
  return {
    frames: n, reads, readsPerFrame: +(reads / n).toFixed(1),
    totalMs: +total.toFixed(1),
    msPerSecond: elapsedS > 0 ? +(total / elapsedS).toFixed(2) : null,
    heavyFrames: heavy.length,
    heavyGapMedianS: +gapMed.toFixed(2),
    heavyGapCV: gapMean > 0 ? +(sd / gapMean).toFixed(3) : 0,
    worstMs: heavy.length ? +Math.max(...heavy.map((h) => h.ms)).toFixed(1) : 0,
    spikeFrames: spikeN,
    layoutShareOfSpikeCost: +share.toFixed(3),
    verdict: !heavy.length
      ? "no frame paid a recalc — layout is not a cost here"
      : share >= 0.25
        ? `LAYOUT IS ${(share * 100).toFixed(0)}% OF SPIKE COST: ${heavy.length} recalc frames every ~${gapMed.toFixed(1)}s (CV ${(gapMean > 0 ? sd / gapMean : 0).toFixed(2)}), worst ${Math.max(...heavy.map((h) => h.ms)).toFixed(0)}ms`
        : `layout recalcs every ~${gapMed.toFixed(1)}s (CV ${(gapMean > 0 ? sd / gapMean : 0).toFixed(2)}) but only ${(share * 100).toFixed(0)}% of spike cost — matching cadence is not attribution`,
  };
}

// WHICH passes the wide frames carry, not how many.
//
// analysePasses() found the shape: about once a second a frame issues up to
// nine more render passes than the median, on a fairly regular beat (CV 0.73).
// That is the reported hitch's shape and it is a GPU question, not an
// allocation one — and a count cannot say which nine.
//
// Resolution is the fingerprint. A shadow atlas, a 64 px env-probe cube face,
// each bloom mip, the SSAO target and the full-size HDR scene target all have
// different dimensions, so the difference between a wide frame's composition
// and a normal frame's NAMES the periodic work.
export function analysePassKinds(passSig, passes) {
  if (!passSig || passSig.length < 30) return { note: "no per-frame pass composition recorded" };
  const n = passSig.length;
  const counts = passes.slice(0, n);
  // RENDERING FRAMES ONLY, on both arms. analysePasses already takes its
  // median over frames that encoded something; this function did not, and the
  // zero-pass callbacks then sat in the "normal" bucket and halved every
  // normal average. That is what made a frame's ordinary bloom chain look like
  // work the wide frames ADD: with ~50% of callbacks presenting nothing,
  // normal read 0.95 of each bloom mip against a wide frame's 1.74, and the
  // apparent doubling was the dilution, not the renderer. The only rows that
  // survived it were the ones that are exactly zero on a normal frame — which
  // is the signal, and which is why the verdict must not be read off the
  // others.
  const sorted = Array.from(counts).filter((v) => v > 0).sort((a, b) => a - b);
  if (sorted.length < 20) return { note: "too few rendering frames to compare compositions" };
  const med = sorted[Math.floor(sorted.length / 2)];
  const normal = [], wide = [];
  for (let i = 0; i < n; i++) {
    if (!(counts[i] > 0)) continue;
    (counts[i] > med ? wide : normal).push(passSig[i]);
  }
  if (!wide.length) return { medianPasses: med, note: "no frame exceeded the median — nothing periodic to name" };
  const tally = (frames) => {
    const m = new Map();
    for (const f of frames) for (const sig of f) m.set(sig, (m.get(sig) || 0) + 1);
    return m;
  };
  const tn = tally(normal), tw = tally(wide);
  const keys = new Set([...tn.keys(), ...tw.keys()]);
  const rows = [];
  for (const k of keys) {
    const perNormal = normal.length ? (tn.get(k) || 0) / normal.length : 0;
    const perWide = wide.length ? (tw.get(k) || 0) / wide.length : 0;
    rows.push({ pass: k, perNormalFrame: +perNormal.toFixed(2), perWideFrame: +perWide.toFixed(2),
      extra: +(perWide - perNormal).toFixed(2) });
  }
  rows.sort((a, b) => b.extra - a.extra);
  const added = rows.filter((r) => r.extra >= 0.25);
  const extraTotal = +rows.reduce((a, r) => a + Math.max(0, r.extra), 0).toFixed(1);
  return {
    frames: n, medianPasses: med, normalFrames: normal.length, wideFrames: wide.length,
    extraPassesPerWideFrame: extraTotal,
    rows: rows.slice(0, 16),
    // A NAME, or an honest refusal. If the extra passes are spread thinly over
    // many signatures there is no single periodic job to point at, and saying
    // so beats pointing at whichever row sorted first.
    verdict: added.length
      ? `WIDE FRAMES ADD: ${added.slice(0, 4).map((r) => `${r.extra}x ${r.pass}`).join(", ")}`
      : `no pass kind is reliably added on a wide frame (largest delta ${rows.length ? rows[0].extra : 0})`,
  };
}

// WHAT SURVIVES, by call stack — and NOT where the garbage comes from.
//
// This function was built to answer "who allocates the 255 KB a frame", and it
// cannot. --selftest-kb proved it: a known 500 KB/frame of 56-byte objects
// against a ~250 KB/frame baseline came out at 1.2% of the profile, below
// fourteen three.js internals, and correcting the sampler's size bias moved it
// to 1.1%. The tell is the sample COUNT — 395 samples in 90 s, where a 16 KB
// interval against ~50 MB/s owes ~275,000.
//
// The reason is structural, not a bug. V8's sampling heap profiler holds each
// sampled object behind a weak handle and DECREMENTS the node when that object
// is collected, so the profile it returns describes what is still ALIVE. Pure
// garbage is erased from it by definition. 395 samples x 16 KB is ~6.5 MB,
// which is the window's RETAINED growth, and that is the number this reports.
//
// So this is a retention instrument. It is genuinely useful for that — a site
// that climbs here is holding on to something — and it must never again be
// read as an allocation ranking. Short-lived garbage needs an ablation
// (change one site, re-measure analyseHeap) or an allocation-tracking heap
// snapshot, which records a stack for every allocation and costs accordingly.
//
// The size correction below stays, because the same bias applies to what
// survives: V8 samples an object of size s with probability 1-exp(-s/rate),
// ~1/293 for 56 bytes at a 16 KB rate and ~0.98 for 64 KB, so raw bytes
// under-count small-object sites by nearly three hundred times.
export function analyseAlloc(profile, elapsedS, frames, rate) {
  if (!profile || !profile.head) return { note: "no sampling profile — CDP HeapProfiler unavailable" };
  // Said on every result, because the name of this function is a trap and the
  // last reader of it (this one) fell in.
  const MEANS = "RETAINED bytes by site, not allocated — V8 drops a sampled object from the profile when it is collected (see --selftest-kb)";
  // The node tree, flattened to id -> site name. The URL carries a
  // cache-buster and an origin; neither identifies a site and both make one
  // site look like several across runs.
  const nameById = new Map();
  let selfTotal = 0;
  (function walk(node) {
    const f = node.callFrame || {};
    const url = String(f.url || "").replace(/\?v=[a-z0-9]+/g, "").replace(/^https?:\/\/[^/]+\//, "");
    nameById.set(node.id, `${f.functionName || "(anonymous)"} @ ${url}:${f.lineNumber != null ? f.lineNumber + 1 : "?"}`);
    selfTotal += node.selfSize || 0;
    for (const c of node.children || []) walk(c);
  })(profile.head);

  const samples = profile.samples || [];
  if (!samples.length) {
    return { means: MEANS,
      note: "sampling profile carries no samples — only the biased tree, which is not usable for attribution",
      biasedSelfMB: +(selfTotal / 1048576).toFixed(2) };
  }
  const R = rate > 0 ? rate : 16384;
  const bySite = new Map();
  let total = 0;
  for (const s of samples) {
    const size = s.size || 0;
    if (size <= 0) continue;
    // Horvitz-Thompson: each sampled allocation stands for 1/p of itself,
    // where p is its own chance of having been sampled. For a 56-byte object
    // at a 16 KB rate that is a factor of ~293; for a 64 KB object it is ~1.
    const p = 1 - Math.exp(-size / R);
    const bytes = p > 0 ? size / p : size;
    total += bytes;
    const k = nameById.get(s.nodeId) || `(unknown node ${s.nodeId})`;
    bySite.set(k, (bySite.get(k) || 0) + bytes);
  }
  if (!total) return { note: "sampling profile is empty — nothing was allocated, or sampling never started" };
  const sites = [...bySite.entries()].sort((a, b) => b[1] - a[1]).slice(0, 18)
    .map(([site, bytes]) => ({
      site,
      mb: +(bytes / 1048576).toFixed(2),
      share: +(bytes / total).toFixed(3),
      perFrameKB: frames ? +((bytes / 1024) / frames).toFixed(2) : null,
    }));
  return {
    means: MEANS,
    samples: samples.length,
    rate: R,
    totalMB: +(total / 1048576).toFixed(2),
    // Kept so a future reader can see the size of the bias rather than take
    // this comment's word for it.
    biasedSelfMB: +(selfTotal / 1048576).toFixed(2),
    mbPerSecond: elapsedS > 0 ? +((total / 1048576) / elapsedS).toFixed(2) : null,
    perFrameKB: frames ? +((total / 1024) / frames).toFixed(1) : null,
    sites,
    // The verdict is a NAME, which is the whole point of this function. A flat
    // profile whose biggest site is under a fifth of the total has no single
    // answer in it and must not be reported as though it had one.
    verdict: sites.length && sites[0].share >= 0.2
      ? `TOP RETAINER: ${sites[0].site} — ${(sites[0].share * 100).toFixed(0)}% of ${(total / 1048576).toFixed(1)} MB retained`
      : `no dominant retainer: the largest is ${sites.length ? (sites[0].share * 100).toFixed(0) : 0}% of the retained total`,
  };
}

// THE ALLOCATION QUESTION, which every earlier memory pass in this repo
// skipped by construction. snapMem() forces a collection before reading, so
// it answers "what is RETAINED" — and the answer was flat while the hitch
// stayed. Retention and allocation are independent: a frame loop that mints
// short-lived garbage retains nothing, and still buys a major GC on a period
// set by how fast it fills the nursery. That is a spike train by another
// name, and this is the function that tells them apart.
//
// The unforced per-frame heap series is a sawtooth: rising edges are
// allocation, falling edges are collections. Two numbers come out of it —
// the allocation RATE, and whether the falls land ON the spikes.
export function analyseHeap(heap, t0, dur, threshMs) {
  const n = heap.length;
  if (n < 30) return { note: "too few frames" };
  // performance.memory is absent outside Chrome and returns 0 where a policy
  // blocks it; either way an all-zero series is "never sampled", not "flat".
  if (!heap.some((x) => x > 0)) return { note: "no performance.memory — not Chrome, or blocked" };
  const elapsedS = (t0[n - 1] - t0[0]) / 1000;
  let up = 0;
  const drops = [];
  const sortedHeap = Array.from(heap).sort((a, b) => a - b);
  const medHeap = sortedHeap[Math.floor(n / 2)];
  // A drop worth calling a collection: the heap fell by more than 1% of its
  // own size, floored at 0.25 MB so a small heap still registers. Below that
  // is quantisation — Chrome buckets usedJSHeapSize to 100 KB unless
  // --enable-precise-memory-info is on, and this tool passes it.
  const DROP = Math.max(0.25, medHeap * 0.01);
  for (let i = 1; i < n; i++) {
    const d = heap[i] - heap[i - 1];
    if (d > 0) up += d;
    else if (d < -DROP) drops.push({ i, t: t0[i], mb: -d });
  }
  const gaps = [];
  for (let i = 1; i < drops.length; i++) gaps.push((drops[i].t - drops[i - 1].t) / 1000);
  const gs = gaps.slice().sort((a, b) => a - b);
  const gapMed = gs.length ? gs[Math.floor(gs.length / 2)] : 0;
  const gapMean = gaps.length ? gaps.reduce((a, b) => a + b, 0) / gaps.length : 0;
  const sd = gaps.length > 1 ? Math.sqrt(gaps.reduce((a, g) => a + (g - gapMean) ** 2, 0) / (gaps.length - 1)) : 0;
  // THE COINCIDENCE, and its NULL. "80% of spikes had a collection nearby" is
  // not a finding if collections are so frequent that 80% of ANY frames do.
  // The window is +/-1 frame, so the null is the share of frames within one
  // frame of a drop, and the ratio of the two is the only readable number.
  const isDrop = new Uint8Array(n);
  for (const d of drops) isDrop[d.i] = 1;
  const near = (i) => isDrop[i] || (i > 0 && isDrop[i - 1]) || (i + 1 < n && isDrop[i + 1]);
  let spikes = 0, spikesNear = 0, allNear = 0;
  for (let i = 0; i < n; i++) {
    if (near(i)) allNear++;
    if (dur[i] > threshMs) { spikes++; if (near(i)) spikesNear++; }
  }
  const baseRate = allNear / n;
  const hitRate = spikes ? spikesNear / spikes : 0;
  const enrich = baseRate > 0 ? hitRate / baseRate : null;
  const allocMBps = elapsedS > 0 ? up / elapsedS : 0;
  return {
    frames: n, elapsedS: +elapsedS.toFixed(1),
    heapMedMB: +medHeap.toFixed(1),
    allocMBps: +allocMBps.toFixed(2),
    allocPerFrameKB: +((up * 1024) / Math.max(1, n - 1)).toFixed(1),
    collections: drops.length,
    dropMedianMB: drops.length ? +drops.map((d) => d.mb).sort((a, b) => a - b)[drops.length >> 1].toFixed(2) : null,
    gapMedianS: +gapMed.toFixed(2),
    gapCV: gapMean > 0 ? +(sd / gapMean).toFixed(3) : 0,
    spikes, spikesNearGC: spikesNear,
    hitRate: +hitRate.toFixed(3), baseRate: +baseRate.toFixed(3),
    enrichment: enrich == null ? null : +enrich.toFixed(2),
    verdict: !spikes ? "no spikes to attribute"
      : enrich != null && enrich >= 1.8 && spikesNear >= 3
        ? `GC IS ON THE SPIKES: ${spikesNear}/${spikes} within one frame of a collection, ${enrich.toFixed(1)}x the base rate (alloc ${allocMBps.toFixed(1)} MB/s)`
        : `GC is NOT the spike source: ${spikesNear}/${spikes} near a collection vs a ${(baseRate * 100).toFixed(0)}% base rate (alloc ${allocMBps.toFixed(1)} MB/s)`,
  };
}

// Per-kind verdict over the bucketed work counts. The question is never
// "how many" alone — it is whether the calls STOP after warm-up (a healthy
// renderer compiles once) or keep arriving, and if they keep arriving,
// whether they arrive on a PERIOD.
export function analyseWork(work, bucketMs, frames) {
  const out = [];
  for (const [kind, arr] of work) {
    let last = arr.length - 1;
    while (last >= 0 && arr[last] === 0) last--;
    if (last < 0) continue;
    const a = arr.slice(0, last + 1);
    const total = a.reduce((x, y) => x + y, 0);
    // "Settled" = every call landed in the first 20% of the window. A
    // renderer that builds its pipelines once looks like this.
    const head = Math.max(1, Math.ceil(a.length * 0.2));
    const inHead = a.slice(0, head).reduce((x, y) => x + y, 0);
    const settled = inHead === total;
    // Period hunt: autocorrelate the mean-removed series and take the best
    // lag in 2..len/2 buckets. Reported only when it is a clear peak.
    const mean = total / a.length;
    const dev = a.map((v) => v - mean);
    const denom = dev.reduce((x, v) => x + v * v, 0) || 1;
    let bestLag = 0, bestR = 0;
    for (let lag = 2; lag <= Math.floor(a.length / 2); lag++) {
      let num = 0;
      for (let i = 0; i + lag < a.length; i++) num += dev[i] * dev[i + lag];
      const r = num / denom;
      if (r > bestR) { bestR = r; bestLag = lag; }
    }
    const busy = a.filter((v) => v > 0).length;
    out.push({
      kind, total, buckets: a.length,
      perSecond: +(total / (a.length * bucketMs / 1000)).toFixed(2),
      // The container-valid number: a software rasteriser's SECONDS are
      // meaningless, its CALL COUNTS are exact. Per frame is the ratio that
      // carries over to a real GPU.
      perFrame: frames ? +(total / frames).toFixed(2) : null,
      settled, busyBuckets: busy,
      tailTotal: total - inHead,
      periodS: bestR > 0.25 ? +(bestLag * bucketMs / 1000).toFixed(2) : null,
      periodR: +bestR.toFixed(2),
      series: a.join(","),
    });
  }
  // Loudest first: sustained work matters more than a big warm-up burst.
  out.sort((x, y) => (y.settled ? 0 : y.tailTotal) - (x.settled ? 0 : x.tailTotal));
  return out;
}

// Is the extra-work frame PERIODIC? A shadow rebuild makes a frame wider
// than its neighbours, so classify frames by pass count and measure the
// spacing between the wide ones — the same coefficient-of-variation test
// analyse() uses for time spikes.
export function analysePasses(passes, t0, dur, threshMs) {
  const n = passes.length;
  if (n < 50) return { frames: n, ok: false, reason: "too few frames" };
  // Only frames that ENCODED something are frames for this purpose. Including
  // zero-pass callbacks lets the count of non-rendering rAF users move the
  // median and silently redefine "wide".
  const drew = Array.from(passes).filter((v) => v > 0);
  if (drew.length < 20) return { frames: n, drewFrames: drew.length, ok: false, reason: "too few rendering frames" };
  const sorted = drew.slice().sort((a, b) => a - b);
  const med = sorted[Math.floor(sorted.length / 2)];
  const wideAt = [];
  // Indices as well as times: the gap statistics want seconds, the cost
  // comparison below wants to look each frame up in dur[].
  const wideIdx = [], drewAt = [];
  for (let i = 0; i < n; i++) {
    if (passes[i] > 0) drewAt.push(i);
    if (passes[i] > med) { wideAt.push(t0[i] / 1000); wideIdx.push(i); }
  }
  const gaps = wideAt.slice(1).map((x, i) => x - wideAt[i]);
  const mean = gaps.length ? gaps.reduce((a, b) => a + b, 0) / gaps.length : 0;
  const sd = gaps.length > 1
    ? Math.sqrt(gaps.reduce((a, g) => a + (g - mean) ** 2, 0) / (gaps.length - 1)) : 0;
  const gs = gaps.slice().sort((a, b) => a - b);
  return {
    frames: n, drewFrames: drew.length, medianPasses: med,
    // sorted holds only the RENDERING frames now, so index it by its own
    // length — `n` is the full callback count and ran off the end, which is
    // why this reported null.
    maxPasses: sorted[sorted.length - 1],
    widerThanMedian: wideAt.length,
    widePerSecond: t0.length ? +(wideAt.length / ((t0[n - 1] - t0[0]) / 1000)).toFixed(2) : null,
    // Per RENDERING frame, so the two arms compare even if their rAF counts differ.
    widePerDrewFrame: drew.length ? +(wideAt.length / drew.length).toFixed(4) : null,
    gapMedianS: gs.length ? +gs[Math.floor(gs.length / 2)].toFixed(3) : null,
    gapMeanS: +mean.toFixed(3),
    gapCV: mean > 0 ? +(sd / mean).toFixed(3) : null,
    // DO THE WIDE FRAMES COST MORE? Without this the pass census is a curio:
    // "about once a second a frame issues nine more passes" is only a lead if
    // those are the frames that stall. Compared against RENDERING frames only,
    // because a callback that presented nothing has neither passes nor cost and
    // would flatter both arms.
    ...(function cost() {
      if (!dur || !dur.length) return {};
      const wide = new Set(wideIdx);
      let wn = 0, ws = 0, nn = 0, ns = 0, wSpike = 0, nSpike = 0;
      for (const i of drewAt) {
        const d = dur[i];
        if (d == null) continue;
        if (wide.has(i)) { wn++; ws += d; if (threshMs && d > threshMs) wSpike++; }
        else { nn++; ns += d; if (threshMs && d > threshMs) nSpike++; }
      }
      if (!wn || !nn) return {};
      const wMean = ws / wn, nMean = ns / nn;
      const wRate = wSpike / wn, nRate = nSpike / nn;
      return {
        wideMeanMs: +wMean.toFixed(2), normalMeanMs: +nMean.toFixed(2),
        wideCostRatio: nMean > 0 ? +(wMean / nMean).toFixed(2) : null,
        wideSpikeRate: +wRate.toFixed(3), normalSpikeRate: +nRate.toFixed(3),
        spikeEnrichmentOnWide: nRate > 0 ? +(wRate / nRate).toFixed(2) : null,
        costVerdict: nMean > 0 && wMean / nMean >= 1.5
          ? `WIDE FRAMES COST ${(wMean / nMean).toFixed(1)}x a normal rendering frame (${wMean.toFixed(1)} vs ${nMean.toFixed(1)} ms)`
          : `wide frames cost about the same as normal ones (${wMean.toFixed(1)} vs ${nMean.toFixed(1)} ms) — the extra passes are not the stall`,
      };
    })(),
  };
}

if (import.meta.url === `file://${process.argv[1]}`) await main();

async function main() {
  const srv = await startStaticServer(ROOT);
  const args = ["--disable-background-timer-throttling", "--disable-renderer-backgrounding",
    "--disable-backgrounding-occluded-windows",
    // Exposes window.gc() so the heap sample can be forced to RETAINED bytes.
    "--js-flags=--expose-gc",
    // Without this, usedJSHeapSize is bucketed to 100 KB AND rate-limited to
    // one update per 20 ms — at 60 fps that is a fresh reading every second
    // frame at best, which turns a real sawtooth into a staircase and makes
    // the drop detector read quantisation. analyseHeap's whole premise needs
    // a per-frame-accurate number.
    "--enable-precise-memory-info"];
  if (opts.backend === "webgpu" || opts.tlxWebgpu) args.push(...WEBGPU_CHROMIUM_ARGS);
  else args.push("--use-angle=swiftshader");
  const browser = await launchChromium({ args });
  const out = { backend: opts.backend, tlxWebgpu: opts.tlxWebgpu, track: opts.track, seconds: opts.seconds };
  if (opts.selftestKb > 0) out.selftestKb = opts.selftestKb;
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    const consoleLines = [];
    page.on("console", (m) => { if (m.type() === "error") consoleLines.push(m.text().slice(0, 300)); });
    page.on("pageerror", (e) => consoleLines.push("[pageerror] " + String(e).slice(0, 300)));

    await page.addInitScript(([be, wantTlxGpu, extraLs, wantCapture, selftestKb]) => {
      try {
        localStorage.removeItem("apex26.gfxWgxFail");
        localStorage.removeItem("apex26.gfxBackendProbe");
        // THE SOFT BLIT IS THE WRONG DEFAULT FOR A TIMING TOOL, and it was
        // this one's default for both WebGPU paths. wgxCapture="1" makes
        // tlx.js (and WGX) replace present() with a GPU readback plus
        // putImageData, which exists so a headless screenshot has pixels in
        // it. It changes the loop being measured in two ways that swamp the
        // signal:
        //   1. The read never completes on a software adapter, so the
        //      back-pressure branch (tlx.js:3455) draws NOTHING while one is
        //      in flight. Measured: 8,946 rendered frames out of 17,892 rAF
        //      callbacks — half the samples are no-ops, and the p50 they set
        //      is the cost of doing nothing.
        //   2. SOFT_READ_STALE_MS is 20,000, so an abandoned read restarts
        //      the pipeline every 20 s. That produced a bind-group and buffer
        //      burst at 5.2 / 25.2 / 45.5 / 65.5 / 85.5 / 105.5 / 125.5 /
        //      145.5 s — a period of exactly 20.0 s with zero variance, which
        //      reads as a textbook periodic hitch and belongs entirely to the
        //      instrument. softRead.abandoned was 9 across those 150 s.
        // So default to NATIVE present ("0", which tlx.js short-circuits the
        // blit on) and make the blit --capture, for when pixels are the
        // point. A headless swapchain does not composite, so a --capture-less
        // run has no meaningful screenshot: that is the trade, and for "when
        // does the main thread stall" it is the right one, because the GPU
        // work is still submitted and only the readback tax disappears.
        const cap = wantCapture ? "1" : "0";
        if (be === "webgpu") {
          localStorage.setItem("apex26.gfxBackend", "webgpu");
          localStorage.setItem("apex26.gfxWgxAllowSoftware", "1");
          sessionStorage.setItem("apex26.wgxCapture", cap);
        } else if (be === "webgl2") {
          localStorage.setItem("apex26.gfxBackend", "webgl2");
        } else {
          localStorage.setItem("apex26.gfxBackend", "three");
          localStorage.setItem("apex26.tlxForceGL", wantTlxGpu ? "0" : "1");
          if (wantTlxGpu) sessionStorage.setItem("apex26.wgxCapture", cap);
        }
        for (const kv of extraLs || []) {
          const i = kv.indexOf("="); if (i > 0) localStorage.setItem(kv.slice(0, i), kv.slice(i + 1));
        }
      } catch (_) { /* blocked storage: the defaults still boot a backend */ }

      // The instrument. Installed before any page script so it wraps the
      // game's own rAF chain, and preallocated so the recorder never
      // allocates inside the frame it is measuring.
      const CAP = 60000;
      const t0 = new Float64Array(CAP), dur = new Float64Array(CAP);
      // THE SAWTOOTH. Everything this tool measured before was RETENTION —
      // snapMem() forces a collection first, on purpose, so it reports what
      // survives. Retention was flat (2.6 MB/min) and the hitch stayed, which
      // does not clear allocation: a loop minting 40 MB/s of SHORT-LIVED
      // garbage retains nothing and still buys a major GC every few seconds.
      // So sample the heap UNFORCED, once per frame, and read the sawtooth:
      // the rising edges are the allocation rate, the falling edges are the
      // collections, and the question is whether the falls land on the spikes.
      const heap = new Float32Array(CAP);
      let n = 0, armed = false;
      const raw = window.requestAnimationFrame.bind(window);
      window.requestAnimationFrame = function (cb) {
        return raw(function (ts) {
          const a = performance.now();
          try { return cb(ts); } finally {
            const b = performance.now();
            if (armed && n < CAP) {
              t0[n] = a; dur[n] = b - a;
              // AFTER the callback, not before: a collection triggered BY this
              // frame's allocation has to be inside the window whose cost we
              // are attributing to it, or the drop lands one frame late and
              // the correlation reads as zero.
              try { heap[n] = performance.memory ? performance.memory.usedJSHeapSize / 1048576 : 0; } catch (_) { heap[n] = 0; }
              layoutMs[n] = layCur; layoutN[n] = layCount > 32767 ? 32767 : layCount;
              layCur = 0; layCount = 0;
              if (n < PASS_CAP) {
                passPerFrame[n] = passCur > 32767 ? 32767 : passCur;
                // Bounded: only the first 4,000 frames keep their composition,
                // which is ~35 s of racing and plenty of both kinds of frame.
                if (n < 4000) passSig.push(sigCur);
              }
              passCur = 0; sigCur = [];
              n++;
            }
          }
        });
      };
      // THE WORK RECORDER. Frame TIME is not measurable on a software
      // rasteriser (16 frames in 40 s, measured), but the CALL COUNTS are
      // exact — the same reasoning docs/PERF-FINDINGS.md uses for the census
      // `ubo` beats. So count the calls that cost a real GPU a stall —
      // pipeline/program builds, shader modules, texture and target creation
      // — into fixed time buckets, and look for a PERIOD in the buckets.
      const BUCKET_MS = 250, BUCKETS = 1200;   // 5 minutes
      const kinds = [];
      const counts = new Map();
      let armAt = 0;
      function bump(kind) {
        let arr = counts.get(kind);
        if (!arr) { arr = new Int32Array(BUCKETS); counts.set(kind, arr); kinds.push(kind); }
        const b = ((performance.now() - armAt) / BUCKET_MS) | 0;
        if (b >= 0 && b < BUCKETS) arr[b]++;
      }
      // WHO IS ALLOCATING. A count says the renderer is minting resources; it
      // does not say WHERE, and guessing cost this project a round before
      // (PERF-FINDINGS 2o wrote down a hypothesis that 2p killed with one
      // grep). Capture a bounded sample of call stacks per kind and aggregate
      // by signature, so the answer is a function name, not a theory.
      const stacks = new Map();
      const STACK_KINDS = { "gpu.createBindGroup": 1, "gpu.createBuffer": 1, "gpu.createTexture": 1, "gpu.createRenderPipeline": 1 };
      let stackBudget = 400;
      function note(kind) {
        if (!STACK_KINDS[kind] || stackBudget <= 0) return;
        stackBudget--;
        let sig = "?";
        try {
          // Drop this wrapper's own frames, keep the next few — enough to name
          // the caller and its parent without storing whole stacks.
          // Deep enough to walk THROUGH three's own frames and reach the
          // Apex caller: three's binding path is 4-5 frames on its own, and
          // the name that matters is ours, below it.
          const raw = (new Error().stack || "").split("\n").slice(3, 16);
          const fr = raw.map((l) => l.trim().replace(/^at\s+/, "").replace(/\?v=[a-z0-9]+/g, "").replace(/https?:\/\/[^\s)]*\//g, ""));
          // three's minified frames are noise once we have one of them; the
          // ANSWER is the first frames that live in our own files.
          const ours = fr.filter((l) => !/three\.webgpu|three\.core|three\.tsl/.test(l));
          sig = (fr.slice(0, 2).join(" <- ")) + "  ||OURS|| " + (ours.slice(0, 4).join(" <- ") || "(none in window)");
        } catch (_) { /* no stack: the count still stands */ }
        const key = kind + " :: " + sig;
        stacks.set(key, (stacks.get(key) || 0) + 1);
      }
      function wrap(proto, name, kind) {
        try {
          if (!proto || typeof proto[name] !== "function") return;
          const orig = proto[name];
          proto[name] = function () { if (armed) { bump(kind); note(kind); } return orig.apply(this, arguments); };
        } catch (_) { /* a frozen prototype just means this kind goes unmeasured */ }
      }
      try {
        const G2 = window.WebGL2RenderingContext && window.WebGL2RenderingContext.prototype;
        wrap(G2, "linkProgram", "gl.linkProgram");
        wrap(G2, "compileShader", "gl.compileShader");
        wrap(G2, "texImage2D", "gl.texImage2D");
        wrap(G2, "createFramebuffer", "gl.createFramebuffer");
        wrap(G2, "createTexture", "gl.createTexture");
        wrap(G2, "bufferData", "gl.bufferData");
        const GD = window.GPUDevice && window.GPUDevice.prototype;
        wrap(GD, "createRenderPipeline", "gpu.createRenderPipeline");
        wrap(GD, "createRenderPipelineAsync", "gpu.createRenderPipelineAsync");
        wrap(GD, "createShaderModule", "gpu.createShaderModule");
        wrap(GD, "createBindGroup", "gpu.createBindGroup");
        wrap(GD, "createTexture", "gpu.createTexture");
        wrap(GD, "createBuffer", "gpu.createBuffer");
      } catch (_) { /* no WebGL2/WebGPU in this context: the rAF timing still runs */ }

      // three's own counters plus the JS heap. Counts are EXACT on a software
      // adapter even where the milliseconds are not, which is what makes this
      // valid in a container with no GPU.
      let mem0 = null;
      function snapMem() {
        const o = { heapMB: null, gcForced: false };
        // Collect first, THEN read: usedJSHeapSize counts garbage, so an
        // un-forced sample says nothing about retention.
        try {
          if (typeof window.gc === "function") { window.gc(); window.gc(); o.gcForced = true; }
        } catch (_) { /* no --expose-gc: the reading stays garbage-inclusive and says so */ }
        try {
          if (performance.memory) o.heapMB = +(performance.memory.usedJSHeapSize / 1048576).toFixed(1);
        } catch (_) { /* Chrome-only; absent is reported as absent */ }
        try {
          // BARE identifier on purpose: js/render/glx/glx.js declares
          // `const GLX = ...` at top level, so it is in the global lexical
          // environment and NOT on window. Reading window.GLX returns
          // undefined and every counter below silently goes missing — which
          // reads as "flat" when the truth is "never sampled".
          // eslint-disable-next-line no-undef
          const t = (typeof GLX !== "undefined") && GLX && GLX.__tlx;
          if (t && t.memState) Object.assign(o, t.memState());
          o.hasTlx = !!t;
        } catch (_) { o.hasTlx = false; }
        return o;
      }

      // Per-frame render-pass count. The rAF wrapper stamps the boundary, so
      // each entry is "passes encoded during frame i".
      const PASS_CAP = 60000;
      const passPerFrame = new Int16Array(PASS_CAP);
      let passCur = 0;
      // ...AND WHICH PASSES THEY ARE. A count said about once a second a frame
      // issues up to nine more passes than the median, on a fairly regular
      // beat — which is the shape of the reported hitch and is not a JS
      // allocation question at all. A count cannot say WHICH nine.
      //
      // Resolution is the fingerprint. A shadow atlas, a 64px env-probe cube
      // face, each bloom mip, the SSAO target and the full-size HDR scene
      // target all have different dimensions, so "1024x1024/depth32float" names
      // a pass without needing three to label anything. GPUTextureView carries
      // no size, so tag the view when it is created from a texture that does.
      const passSig = [];            // parallel to passPerFrame: signatures per frame
      let sigCur = [];
      try {
        const TP = window.GPUTexture && window.GPUTexture.prototype;
        if (TP && typeof TP.createView === "function") {
          const origCV = TP.createView;
          TP.createView = function () {
            const v = origCV.apply(this, arguments);
            try { v.__sig = this.width + "x" + this.height + "/" + this.format; } catch (_) { /* expando refused */ }
            return v;
          };
        }
      } catch (_) { /* untagged views degrade to "?" rather than to silence */ }
      function sigOf(desc) {
        try {
          const ca = (desc && desc.colorAttachments) || [];
          let out = "";
          for (let i = 0; i < ca.length; i++) {
            const v = ca[i] && (ca[i].view || ca[i].resolveTarget);
            out += (i ? "+" : "") + ((v && v.__sig) || "?");
          }
          if (!ca.length) out = "depth-only";
          if (desc && desc.depthStencilAttachment) out += "|d";
          // The load op separates a clear from a draw into the same target,
          // which is how a shadow atlas rebuild reads against a reuse.
          const lo = ca.length && ca[0] ? ca[0].loadOp : (desc && desc.depthStencilAttachment && desc.depthStencilAttachment.depthLoadOp);
          if (lo) out += ":" + lo;
          return out;
        } catch (_) { return "?"; }
      }
      try {
        const CE = window.GPUCommandEncoder && window.GPUCommandEncoder.prototype;
        if (CE && typeof CE.beginRenderPass === "function") {
          const origBRP = CE.beginRenderPass;
          CE.beginRenderPass = function (desc) {
            if (armed) { passCur++; if (sigCur.length < 64) sigCur.push(sigOf(desc)); }
            return origBRP.apply(this, arguments);
          };
        }
      } catch (_) { /* no WebGPU in this context: the pass series stays empty */ }

      // FORCED SYNCHRONOUS LAYOUT, per frame. A reflow is main-thread time that
      // no renderer instrument can see: it is not a pass, not an allocation and
      // not a draw call, and it lands inside the rAF callback like everything
      // else. js/ui/hud.js's fitHud() interleaves ~15-20 getBoundingClientRect
      // reads with ~9 setProperty writes on document.documentElement, and a
      // root-level style write invalidates layout for the whole document — so
      // every read after a write is a fresh recalc rather than a cached one. It
      // is memoised, but `_fitWait = 30` at the 10 Hz HUD tick forces the full
      // pass every 3.0 s whatever happens, on by default, in every race.
      //
      // Timing the ACCESSORS is the measurement: a read that triggers no
      // recalc returns in microseconds, one that does pays for the whole
      // layout. Sum per frame and the expensive frames name themselves.
      const layoutMs = new Float32Array(CAP);
      const layoutN = new Int16Array(CAP);
      let layCur = 0, layCount = 0;
      try {
        const EP = window.Element && window.Element.prototype;
        const wrapRead = (proto, name) => {
          const orig = proto && proto[name];
          if (typeof orig !== "function") return;
          proto[name] = function () {
            if (!armed) return orig.apply(this, arguments);
            const a = performance.now();
            try { return orig.apply(this, arguments); }
            finally { layCur += performance.now() - a; layCount++; }
          };
        };
        wrapRead(EP, "getBoundingClientRect");
        wrapRead(EP, "getClientRects");
        // The other half of the same tax: reading a computed style after a
        // style write flushes layout exactly as a rect read does.
        const origGCS = window.getComputedStyle;
        if (typeof origGCS === "function") {
          window.getComputedStyle = function () {
            if (!armed) return origGCS.apply(window, arguments);
            const a = performance.now();
            try { return origGCS.apply(window, arguments); }
            finally { layCur += performance.now() - a; layCount++; }
          };
        }
        // offsetWidth and friends are accessors on the prototype, so they need
        // the descriptor rather than a plain assignment.
        for (const [proto, prop] of [[EP, "clientWidth"], [EP, "clientHeight"],
          [window.HTMLElement && window.HTMLElement.prototype, "offsetWidth"],
          [window.HTMLElement && window.HTMLElement.prototype, "offsetHeight"]]) {
          if (!proto) continue;
          const d = Object.getOwnPropertyDescriptor(proto, prop);
          if (!d || typeof d.get !== "function") continue;
          const g = d.get;
          Object.defineProperty(proto, prop, Object.assign({}, d, {
            get() {
              if (!armed) return g.call(this);
              const a = performance.now();
              try { return g.call(this); } finally { layCur += performance.now() - a; layCount++; }
            },
          }));
        }
      } catch (_) { /* a sealed prototype just means this column stays zero, and analyseLayout says so */ }

      const longtasks = [];
      try {
        new PerformanceObserver((l) => {
          for (const e of l.getEntries()) if (armed && longtasks.length < 4000) longtasks.push([+e.startTime.toFixed(1), +e.duration.toFixed(1)]);
        }).observe({ entryTypes: ["longtask"] });
      } catch (_) { /* longtask unsupported: the rAF timing is the primary signal */ }
      // Governor timeline, so a spike can be attributed to a scale/tier step.
      const gov = [];
      setInterval(() => {
        if (!armed || gov.length > 4000) return;
        try {
          const p = window.__apex && window.__apex.perf && window.__apex.perf();
          if (p) gov.push([+performance.now().toFixed(0), p.scale, p.tier, p.autoShed, p.fps]);
        } catch (_) { /* perf() needs a live race; before that there is nothing to sample */ }
      }, 200);
      // THE CALIBRATION LOAD. Small short-lived objects, the shape a per-draw
      // cache key or an options literal has — three fields plus a map pointer,
      // ~56 bytes — dropped at the end of the tick so none of it is retained.
      //
      // Scheduled on the RAW rAF, never the wrapped one. A driver that
      // schedules itself through the instrument BECOMES a frame: --steer-hz
      // did exactly that, added ~3,600 non-rendering callbacks, dragged the
      // pass median from 1 to 0 and reclassified every rendering frame as
      // "wide" (the tell was `presents` unchanged at 3588 vs 3597). The bytes
      // still land inside the window both memory instruments measure, which is
      // the entire point; the frame statistics stay the page's own.
      if (selftestKb > 0) {
        const per = Math.max(1, Math.round((selftestKb * 1024) / 56));
        const sink = [];
        const _burn = function () {
          for (let i = 0; i < per; i++) sink.push({ a: i, b: i + 1, c: i + 2 });
          sink.length = 0;
          raw(_burn);
        };
        raw(_burn);
      }
      window.__hitch = {
        selftestKb,
        arm() {
          armed = true; n = 0; longtasks.length = 0; gov.length = 0;
          armAt = performance.now(); counts.clear(); kinds.length = 0;
          heap.fill(0);
          // DRIFT, NOT A SNAPSHOT — docs/notes/PERF-FINDINGS.md 2o's own rule:
          // any TLX memory claim reporting a single heap number is measuring
          // the wrong thing. Baseline here, delta at dump.
          mem0 = snapMem();
        },
        n: () => n,
        dump: () => ({
          t0: Array.from(t0.subarray(0, n)), dur: Array.from(dur.subarray(0, n)), longtasks, gov,
          heap: Array.from(heap.subarray(0, n), (x) => +x.toFixed(3)),
          layoutMs: Array.from(layoutMs.subarray(0, n), (x) => +x.toFixed(3)),
          layoutN: Array.from(layoutN.subarray(0, n)),
          bucketMs: BUCKET_MS,
          work: kinds.map((k) => [k, Array.from(counts.get(k))]),
          mem0, mem1: snapMem(),
          stacks: [...stacks.entries()].sort((a, b) => b[1] - a[1]).slice(0, 25),
          passes: Array.from(passPerFrame.subarray(0, Math.min(n, PASS_CAP))),
          passSig,
          backend: (() => {
            // eslint-disable-next-line no-undef
            try { const t = (typeof GLX !== "undefined") && GLX && GLX.__tlx; return t && t.backendState ? t.backendState() : null; }
            catch (_) { return null; }
          })(),
        }),
      };
    }, [opts.backend, opts.tlxWebgpu, opts.ls, opts.capture, opts.selftestKb]);

    await page.goto(srv.url + "index.html", { waitUntil: "domcontentloaded", timeout: 90000 });
    await page.waitForFunction(() => window.__apex, null, { polling: 100, timeout: 90000 });
    await page.evaluate(async () => {
      if (typeof Assets !== "undefined" && Assets.loadModels) { try { await Assets.loadModels(); } catch (_) { /* pack optional */ } }
    });
    let cpuCdp = null;
    if (opts.cpuProfile > 0) {
      // Armed BEFORE race(): the stall under test is the race start itself,
      // and a settle would skip exactly the window that matters.
      try {
        cpuCdp = await page.context().newCDPSession(page);
        await cpuCdp.send("Profiler.enable");
        await cpuCdp.send("Profiler.setSamplingInterval", { interval: 500 });
        await cpuCdp.send("Profiler.start");
      } catch (e) { out.cpuProfileError = String((e && e.message) || e).slice(0, 120); cpuCdp = null; }
    }
    await page.evaluate((t) => window.__apex.race(t), opts.track);
    await page.waitForFunction((t) => window.__apex.info().track === t, opts.track, { polling: 100, timeout: 60000 });
    await page.evaluate((hz) => {
      window.__apex.go(); window.__apex.jump(0.1, 55, 0);
      if (!(hz > 0)) { window.__apex.setInput({ steer: 0, throttle: true, brake: false }); return; }
      const t0 = performance.now();
      setInterval(() => {
        const t = (performance.now() - t0) / 1000;
        window.__apex.setInput({ steer: Math.sin(2 * Math.PI * hz * t) * 0.6, throttle: true, brake: false });
      }, 16);
    }, opts.steerHz);
    // Let boot-time work AND the working set finish filling: a cache
    // reaching its high-water mark is not a leak, and a baseline taken
    // during the fill turns ordinary warm-up into a fake slope.
    // The ablation goes on BEFORE the settle, so the working set settles in
    // the configuration being measured rather than in the one being removed.
    if (opts.ablate) {
      out.ablate = opts.ablate;
      out.ablateApplied = await page.evaluate((name) => {
        const A = window.__apex;
        try {
          // headless: stops the render path and leaves the simulation running,
          // which splits "the renderer allocates it" from "the game does".
          if (name === "headless") { A.headless(true); return A.headless() === true; }
          return "unknown ablation: " + name;
        } catch (e) { return "failed: " + String((e && e.message) || e).slice(0, 80); }
      }, opts.ablate);
      log(`ablation ${opts.ablate}: ${out.ablateApplied}`);
    }
    if (cpuCdp) {
      log(`cpu-profiling the race start for ${opts.cpuProfile}s`);
      await sleep(opts.cpuProfile * 1000);
      try {
        const { profile } = await cpuCdp.send("Profiler.stop");
        out.cpu = analyseCpu(profile);
      } catch (e) { out.cpu = { note: "profile stop failed: " + String((e && e.message) || e).slice(0, 120) }; }
    }
    log(`settling ${opts.settle}s before the baseline`);
    await sleep(opts.settle * 1000);
    // WHO ALLOCATES, sampled over exactly the window analyseHeap() measures.
    // 16 KB interval: small enough that a 250 KB/frame site is sampled tens of
    // times a second, large enough that the sampler itself is not the load.
    // A failure here is NOT fatal — the rest of the run still answers "how
    // much" — but it is reported as a note rather than as an empty profile,
    // because "never sampled" must never read as "allocated nothing".
    let cdp = null;
    try {
      cdp = await page.context().newCDPSession(page);
      await cdp.send("HeapProfiler.enable");
      await cdp.send("HeapProfiler.startSampling", { samplingInterval: 16384 });
    } catch (e) { out.allocProfileError = String((e && e.message) || e).slice(0, 120); cdp = null; }
    await page.evaluate(() => window.__hitch.arm());
    await sleep(opts.seconds * 1000);
    let allocProfile = null;
    if (cdp) {
      try { allocProfile = (await cdp.send("HeapProfiler.stopSampling")).profile; }
      catch (e) { out.allocProfileError = String((e && e.message) || e).slice(0, 120); }
    }
    const d = await page.evaluate(() => window.__hitch.dump());
    out.backendBound = await page.evaluate(() => { try { return window.__apex.info().gfx || null; } catch (_) { return null; } });
    Object.assign(out, analyse(d.t0, d.dur));
    out.work = analyseWork(d.work || [], d.bucketMs || 250, out.frames);
    out.backend = d.backend;
    out.passes = analysePasses(d.passes || [], d.t0 || [], d.dur || [], out.spikeThresholdMs);
    out.passKinds = analysePassKinds(d.passSig || [], d.passes || []);
    out.layout = analyseLayout(d.layoutMs || [], d.layoutN || [], d.t0 || [], d.dur || [], out.spikeThresholdMs);
    out.heap = analyseHeap(d.heap || [], d.t0 || [], d.dur || [], out.spikeThresholdMs);
    out.alloc = allocProfile
      ? analyseAlloc(allocProfile, out.heap && out.heap.elapsedS, out.frames, 16384)
      : { note: out.allocProfileError ? "sampling failed: " + out.allocProfileError : "no CDP session" };
    out.stacks = d.stacks;
    out.mem0 = d.mem0; out.mem1 = d.mem1;
    // The leak test: every numeric counter three tracks, as a DELTA over the
    // measured window. A bounded working set saturates; a leak climbs.
    out.memDrift = (() => {
      const a = d.mem0 || {}, b = d.mem1 || {};
      const o = {};
      for (const k of Object.keys(b)) {
        if (typeof b[k] === "number" && typeof a[k] === "number" && b[k] !== a[k]) {
          o[k] = +(b[k] - a[k]).toFixed(2);
        }
      }
      return o;
    })();
    out.longtasks = d.longtasks.length;
    out.longtaskTop = d.longtasks.slice().sort((a, b) => b[1] - a[1]).slice(0, 10);
    out.gov = d.gov.filter((g, i, a) => i === 0 || g[1] !== a[i - 1][1] || g[2] !== a[i - 1][2]);
    out.consoleErrors = consoleLines.slice(0, 10);
    log(out.verdict);
    log(`p50 ${out.p50} ms  p95 ${out.p95}  p99 ${out.p99}  max ${out.max}  frames ${out.frames}`);
    log(`backend ${JSON.stringify(out.backend)}`);
    log(`MEM DRIFT over the window: ${JSON.stringify(out.memDrift)}`);
    log(`PASSES/frame: ${JSON.stringify(out.passes)}`);
    for (const [sig, n] of (out.stacks || []).slice(0, 12)) log(`  ${String(n).padStart(4)}x  ${sig}`);
    for (const w of out.work) {
      if (w.settled && w.total < 4000) continue;   // built once at warm-up: the healthy shape
      log(`WORK ${w.kind}: ${w.total} calls, ${w.perFrame}/frame, ${w.busyBuckets}/${w.buckets} buckets busy` +
        (w.settled ? " (all in warm-up)" : `, ${w.tailTotal} AFTER warm-up`) +
        (w.periodS ? `  PERIOD ~${w.periodS}s (r=${w.periodR})` : ""));
    }
    if (out.gov.length > 1) log(`governor stepped ${out.gov.length - 1}x: ` + out.gov.map((g) => `${(g[0] / 1000) | 0}s scale=${g[1]} tier=${g[2]}`).join(" | "));
  } finally {
    await browser.close().catch(() => {});
    srv.close();
    shutdown();
  }
  const json = JSON.stringify(out, null, 2);
  if (opts.json) { mkdirSync(dirname(opts.json), { recursive: true }); writeFileSync(opts.json, json); }
  console.log(json);
}
