/* race-cycle-memory.mjs — heap / audioMB slope helpers for
 * tests/specs/race-cycle-memory.spec.js (W24c finding 1–2 / W25c; H17 ACK).
 *
 * Soft by default (annotation); APEX_PERF_MEMORY_STRICT=1 or APEX_PERF_STRICT=1
 * fails. Hard ceiling catches the H12-class ~12 MB/cycle phone leak; soft
 * ceiling is the MEMORY-TOOLING “cycle-3 − cycle-2 ≤ 2 MB” nightly ask —
 * applied to the first *post-warm* pair (H17: TLX renderer.info climbs ~5
 * cycles before flattening; heap slope is measured after that warm-up).
 */
export const HEAP_SLOPE_HARD_MB = 10;
export const HEAP_SLOPE_SOFT_MB = 2;
/** Decoded PCM must not accumulate a full extra buffer across post-warm cycles. */
export const AUDIO_SLOPE_SOFT_MB = 5;
/** Cycles whose menu readings are warm-up only (H17 / LIVE-MEMORY-H12). */
export const WARM_CYCLES = 5;

export const STRICT = process.env.APEX_PERF_MEMORY_STRICT === "1"
  || process.env.APEX_PERF_STRICT === "1";

const available = (value) => typeof value === "number" && Number.isFinite(value) && value >= 0;

/** Validate observation coverage, separately from retention and growth bounds. */
export function cycleCensusIssues(row) {
  const issues = [];
  if (row?.backend?.renderer !== "three" || !["webgl2", "webgpu"].includes(row?.backend?.api))
    issues.push("expected observed three renderer and WebGL2/WebGPU API");
  if (row?.instrumentation?.tracksReady !== true) issues.push("track census hooks unavailable");
  if (![row?.heapMB, row?.audioMB].every(available)) issues.push("finite nonnegative heap and audio observations required");
  if (![row?.three?.geometries, row?.three?.textures].every(available)) issues.push("Three geometry/texture counters unavailable");
  return issues;
}

/**
 * Post-warm menu heap / audio slope: cycle N minus cycle N-1 (1-based).
 * `byCycle` maps cycle number → { heapMB, audioMB } from the final menu
 * reading of that cycle (after the last circuit). Caller must pass a
 * `laterCycle` > WARM_CYCLES so both samples sit after the TLX warm-up climb.
 *
 * @param {Map<number, { heapMB: number|null, audioMB: number|null }>|Record<number, { heapMB: number|null, audioMB: number|null }>} byCycle
 * @param {number} [laterCycle]
 * @returns {{ ok: boolean, reason?: string, later: number, earlier: number, heapDelta: number|null, audioDelta: number|null, heapHardFail: boolean, heapSoftFail: boolean, audioSoftFail: boolean, series: Array<{ cycle: number, heapMB: number|null, audioMB: number|null }> }}
 */
export function postWarmSlope(byCycle, laterCycle = WARM_CYCLES + 1) {
  const earlierCycle = laterCycle - 1;
  const get = (c) => (byCycle instanceof Map ? byCycle.get(c) : byCycle[c]);
  const series = [];
  const keys = byCycle instanceof Map
    ? [...byCycle.keys()].sort((a, b) => a - b)
    : Object.keys(byCycle).map(Number).sort((a, b) => a - b);
  for (const c of keys) {
    const row = get(c);
    if (row) series.push({ cycle: c, heapMB: row.heapMB ?? null, audioMB: row.audioMB ?? null });
  }
  if (laterCycle <= WARM_CYCLES) {
    return {
      ok: false,
      reason: `laterCycle ${laterCycle} must be > WARM_CYCLES (${WARM_CYCLES}) so slope is post-warm`,
      later: laterCycle,
      earlier: earlierCycle,
      heapDelta: null,
      audioDelta: null,
      heapHardFail: false,
      heapSoftFail: false,
      audioSoftFail: false,
      series,
    };
  }
  const later = get(laterCycle);
  const earlier = get(earlierCycle);
  if (!later || !earlier) {
    return {
      ok: false,
      reason: `need menu readings for cycles ${earlierCycle} and ${laterCycle} (post-warm; WARM_CYCLES=${WARM_CYCLES})`,
      later: laterCycle,
      earlier: earlierCycle,
      heapDelta: null,
      audioDelta: null,
      heapHardFail: false,
      heapSoftFail: false,
      audioSoftFail: false,
      series,
    };
  }
  const heapDelta = (available(later.heapMB) && available(earlier.heapMB))
    ? +(later.heapMB - earlier.heapMB).toFixed(1)
    : null;
  const audioDelta = (available(later.audioMB) && available(earlier.audioMB))
    ? +(later.audioMB - earlier.audioMB).toFixed(1)
    : null;
  return {
    ok: heapDelta != null && audioDelta != null,
    ...(heapDelta == null || audioDelta == null ? { reason: "finite nonnegative post-warm heap and audio observations required" } : {}),
    later: laterCycle,
    earlier: earlierCycle,
    heapDelta,
    audioDelta,
    heapHardFail: heapDelta != null && heapDelta > HEAP_SLOPE_HARD_MB,
    heapSoftFail: heapDelta != null && heapDelta > HEAP_SLOPE_SOFT_MB,
    audioSoftFail: audioDelta != null && audioDelta > AUDIO_SLOPE_SOFT_MB,
    series,
  };
}

/** Extra post-warm cycles raced only when the single pair (cycle WARM+1 − WARM) exceeds the hard bound. */
export const CONFIRM_CYCLES = 2;

/**
 * Robust post-warm heap slope (Theil–Sen: median of every pairwise slope) over the cycles after the warm-up
 * baseline (cycle WARM_CYCLES onward). One forced-GC reading can dip or step by 12–15 MiB on a real GPU leg
 * (Pages #4577: 148.1 → 134.9 → 149.2; PR #4316: 146.9 → 162.4), so a single pair measures that reading, not
 * growth. A steady leak (H12: ~12 MiB/cycle) makes EVERY pairwise slope ≈ its rate, so the median stays at
 * the rate; a one-reading dip or a one-time step is outvoted by the later readings.
 * @param {Array<{ cycle: number, heapMB: number|null }>} series
 * @returns {{ slope: number|null, points: number }}
 */
export function robustHeapSlope(series) {
  const pts = series.filter((r) => r.cycle >= WARM_CYCLES && available(r.heapMB));
  const slopes = [];
  for (let i = 0; i < pts.length; i++) for (let j = i + 1; j < pts.length; j++) {
    slopes.push((pts[j].heapMB - pts[i].heapMB) / (pts[j].cycle - pts[i].cycle));
  }
  if (!slopes.length) return { slope: null, points: pts.length };
  slopes.sort((a, b) => a - b);
  const m = slopes.length >> 1;
  const med = slopes.length % 2 ? slopes[m] : (slopes[m - 1] + slopes[m]) / 2;
  return { slope: +med.toFixed(1), points: pts.length };
}

/* ---- WebGPU wrapper-object census (#4778) -------------------------------------------------------------------
 * The heap slope cannot see per-cycle wrapper objects (Research B §2.3: GPURenderBundle +81 and GPUTextureView +81
 * per race→menu cycle while the JS heap was flat). Counting live wrappers by prototype after a forced GC is
 * cheap (Runtime.queryObjects) and exact. WHAT the +81 is: three's WebGPU backend builds one mip-chain bundle per
 * (mip level × layer) of every mipmapped texture it uploads (`_mipmapCreateBundles`, each holding a view), and
 * caches them on that texture's backend data (`r.layers`) until the texture is disposed. They follow the live
 * texture count, which warms for ~5 cycles (renderer.info.memory.textures 40 → 57), so a plateau is expected
 * and a post-warm pair must be flat. Soft by default like the heap slope; STRICT fails. */
export const GPU_WRAPPER_CLASSES = ["GPUBuffer", "GPUTexture", "GPUTextureView", "GPURenderBundle", "GPUBindGroup", "GPURenderPipeline"];

/** Live wrapper counts per class (null where the class is absent, e.g. WebGL2). Call after a forced GC. */
export async function gpuWrapperCounts(cdp, classes = GPU_WRAPPER_CLASSES) {
  const out = {};
  for (const name of classes) {
    out[name] = null;
    let proto = null, objs = null;
    try {
      const ev = await cdp.send("Runtime.evaluate", { expression: `typeof ${name} === "function" ? ${name}.prototype : undefined` });
      proto = ev.result && ev.result.objectId;
      if (!proto) continue;
      objs = (await cdp.send("Runtime.queryObjects", { prototypeObjectId: proto })).objects;
      const n = await cdp.send("Runtime.callFunctionOn", { objectId: objs.objectId, functionDeclaration: "function () { return this.length; }", returnByValue: true });
      out[name] = n.result.value;
    } catch (_) { out[name] = null; }
    finally {
      for (const o of [objs, proto ? { objectId: proto } : null]) if (o && o.objectId) await cdp.send("Runtime.releaseObject", { objectId: o.objectId }).catch(() => {});
    }
  }
  return out;
}

/** CDP DOM leak counters (documents / nodes / listeners), after GC. Null when the domain is unavailable. */
export async function domLeakCounters(cdp) {
  try { return await cdp.send("Memory.getDOMCountersForLeakDetection").then((r) => Object.fromEntries((r.counters || []).map((c) => [c.name, c.count]))); }
  catch (_) { return null; }
}

/**
 * Count of `system / Context` closure scopes in a heap snapshot (#4778). Takes one snapshot over CDP (call after a
 * forced GC, once per cycle: it is the slow census) and counts nodes by class name. Null when it cannot be taken.
 */
export async function contextScopeCount(cdp) {
  const chunks = [];
  const onChunk = (e) => { chunks.push(e.chunk); };
  try {
    cdp.on("HeapProfiler.addHeapSnapshotChunk", onChunk);
    await cdp.send("HeapProfiler.takeHeapSnapshot", { reportProgress: false, captureNumericValue: false });
    const snap = JSON.parse(chunks.join(""));
    chunks.length = 0;
    return countSnapshotClass(snap, "system / Context");
  } catch (_) { return null; }
  finally { try { cdp.off("HeapProfiler.addHeapSnapshotChunk", onChunk); } catch (_) { /* ignore */ } }
}

/** Nodes named `name` in a parsed V8 heap snapshot. */
export function countSnapshotClass(snap, name) {
  const f = snap.snapshot.meta.node_fields, w = f.length, ni = f.indexOf("name");
  const strings = snap.strings, nodes = snap.nodes;
  let n = 0;
  for (let i = 0; i < nodes.length; i += w) if (strings[nodes[i + ni]] === name) n++;
  return n;
}

/** Closure-scope bound between post-warm cycles: growth above this fraction (plus slack) is a leak. */
export const CONTEXT_GROWTH_FRACTION = 0.05;
export const CONTEXT_GROWTH_SLACK = 50;

/** Per-class growth between the last two entries of `series` ([{ cycle, wrappers, dom }]): exact for GPU classes. */
export function wrapperGrowth(series, laterCycle) {
  const a = series.find((r) => r.cycle === laterCycle - 1), b = series.find((r) => r.cycle === laterCycle);
  const issues = [];
  if (!a || !b) return { ok: false, issues: [`need readings for cycles ${laterCycle - 1} and ${laterCycle}`] };
  for (const name of GPU_WRAPPER_CLASSES) {
    const x = a.wrappers && a.wrappers[name], y = b.wrappers && b.wrappers[name];
    if (typeof x === "number" && typeof y === "number" && y > x) issues.push(`${name} ${x} → ${y} (+${y - x})`);
  }
  for (const name of ["documents", "nodes", "jsEventListeners"]) {
    const x = a.dom && a.dom[name], y = b.dom && b.dom[name];
    if (typeof x === "number" && typeof y === "number" && y > x * 1.05 + 5) issues.push(`DOM ${name} ${x} → ${y}`);
  }
  const cx = a.contexts, cy = b.contexts;
  if (typeof cx === "number" && typeof cy === "number" && cy > cx * (1 + CONTEXT_GROWTH_FRACTION) + CONTEXT_GROWTH_SLACK)
    issues.push(`system / Context ${cx} → ${cy} (> +${CONTEXT_GROWTH_FRACTION * 100}%)`);
  return { ok: issues.length === 0, issues };
}
