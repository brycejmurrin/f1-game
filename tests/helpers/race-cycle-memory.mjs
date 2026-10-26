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
  const heapDelta = (typeof later.heapMB === "number" && typeof earlier.heapMB === "number")
    ? +(later.heapMB - earlier.heapMB).toFixed(1)
    : null;
  const audioDelta = (typeof later.audioMB === "number" && typeof earlier.audioMB === "number")
    ? +(later.audioMB - earlier.audioMB).toFixed(1)
    : null;
  return {
    ok: true,
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
