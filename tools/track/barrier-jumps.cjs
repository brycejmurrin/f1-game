// @doc Pure helpers: max adjacent |Δbar| / wallAt step on a barrier table (run-off terminus teleports).
// @skill check-changes
"use strict";

/**
 * Max adjacent-node |Δ| on a barrier lateral array (track.barL / barR).
 * Open-circuit tyre termini today land at RUNOFF_DEFAULT(9) ↔ (2.2−1.1)=1.1 → 7.9 m.
 */
function maxAdjDelta(arr) {
  if (!arr || arr.length < 2) return 0;
  const n = arr.length;
  let max = 0;
  for (let k = 0; k < n; k++) {
    const d = Math.abs(arr[k] - arr[(k + 1) % n]);
    if (d > max) max = d;
  }
  return max;
}

/**
 * Max adjacent |Δ| of (bar − hw) — isolates the clearance cliff from hw changes.
 */
function maxAdjOver(bar, hw) {
  if (!bar || !hw || bar.length !== hw.length || bar.length < 2) return 0;
  const n = bar.length;
  let max = 0;
  for (let k = 0; k < n; k++) {
    const j = (k + 1) % n;
    const d = Math.abs((bar[k] - hw[k]) - (bar[j] - hw[j]));
    if (d > max) max = d;
  }
  return max;
}

/**
 * wallAt's shipped sampler: Math.min of the two bracketing nodes.
 * Returns the max one-node-boundary jump that sampler can produce.
 */
function maxWallAtStep(arr) {
  if (!arr || arr.length < 2) return 0;
  const n = arr.length;
  let max = 0;
  for (let k = 0; k < n; k++) {
    // Just before leaving node k's segment vs just into node (k+1)'s:
    // at frac→1 inside [k,k+1], min(arr[k],arr[k+1]); at frac→0 of [k+1,k+2],
    // min(arr[k+1],arr[k+2]). The cliff at the node boundary equals the
    // adjacent-node delta when the third node is not tighter.
    const a = Math.min(arr[k], arr[(k + 1) % n]);
    const b = Math.min(arr[(k + 1) % n], arr[(k + 2) % n]);
    const d = Math.abs(a - b);
    if (d > max) max = d;
  }
  return max;
}

/**
 * Summarise both sides of a built track. `{ maxAdj, maxOver, maxWallStep, sides }`.
 */
function summariseTrack(track) {
  const sides = {
    L: {
      maxAdj: maxAdjDelta(track.barL),
      maxOver: maxAdjOver(track.barL, track.hw),
      maxWallStep: maxWallAtStep(track.barL),
    },
    R: {
      maxAdj: maxAdjDelta(track.barR),
      maxOver: maxAdjOver(track.barR, track.hw),
      maxWallStep: maxWallAtStep(track.barR),
    },
  };
  return {
    maxAdj: Math.max(sides.L.maxAdj, sides.R.maxAdj),
    maxOver: Math.max(sides.L.maxOver, sides.R.maxOver),
    maxWallStep: Math.max(sides.L.maxWallStep, sides.R.maxWallStep),
    sides,
  };
}

/**
 * Build a synthetic bar cliff: `n` nodes, jump of `cliff` at index `at`.
 * Optional `feather` nodes ramp linearly from the low side back to the high.
 */
function syntheticCliff(n, at, high, low, feather) {
  const arr = new Float32Array(n);
  for (let i = 0; i < n; i++) arr[i] = high;
  const span = Math.max(1, feather | 0);
  // Tight region of `span` nodes starting at `at`.
  for (let i = 0; i < span; i++) arr[(at + i) % n] = low;
  if (feather > 1) {
    // Ramp into and out of the tight span over (feather-1) neighbour nodes.
    const ramp = feather - 1;
    for (let i = 1; i <= ramp; i++) {
      const t = i / (ramp + 1);
      const v = low + (high - low) * t;
      arr[(at - i + n) % n] = Math.min(arr[(at - i + n) % n], v);
      arr[(at + span - 1 + i) % n] = Math.min(arr[(at + span - 1 + i) % n], v);
    }
  }
  return arr;
}

module.exports = {
  maxAdjDelta,
  maxAdjOver,
  maxWallAtStep,
  summariseTrack,
  syntheticCliff,
};
