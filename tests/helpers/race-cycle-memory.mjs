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
