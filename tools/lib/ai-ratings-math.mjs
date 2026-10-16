/**
 * @doc Pure Pearson / means / style zero-mean helpers for `ai-ratings.mjs` (personality dial census).
 * Pure helpers for the AI personality ratings instrument.
 * No VM, no game boot — Pearson / means / style zero-mean only.
 * Consumed by tools/check/ai-ratings.mjs and unit tests.
 */
export const QUALITY_AXES = ["pace", "craft", "awareness", "consistency", "experience"];

/** Pearson product-moment correlation. Returns null if a column has zero variance. */
export function pearson(a, b) {
  const n = a.length;
  if (n !== b.length || n < 2) return null;
  let sx = 0, sy = 0, sxx = 0, syy = 0, sxy = 0;
  for (let i = 0; i < n; i++) {
    sx += a[i]; sy += b[i];
    sxx += a[i] * a[i]; syy += b[i] * b[i];
    sxy += a[i] * b[i];
  }
  const den = Math.sqrt((n * sxx - sx * sx) * (n * syy - sy * sy));
  if (!(den > 0)) return null;
  return (n * sxy - sx * sy) / den;
}

/** Column mean of a numeric array. */
export function mean(a) {
  if (!a.length) return null;
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i];
  return s / a.length;
}

/**
 * Pairwise Pearson matrix for named columns over row objects.
 * `axes` defaults to the five quality axes.
 */
export function correlationMatrix(rows, axes = QUALITY_AXES) {
  const out = {};
  for (let i = 0; i < axes.length; i++) {
    for (let j = i + 1; j < axes.length; j++) {
      const ai = axes[i], aj = axes[j];
      const a = rows.map((r) => +r[ai]), b = rows.map((r) => +r[aj]);
      out[`${ai}~${aj}`] = pearson(a, b);
    }
  }
  return out;
}

/** Per-axis mean / min / max over authored rows. */
export function columnStats(rows, axes = QUALITY_AXES) {
  const out = {};
  for (const ax of axes) {
    const v = rows.map((r) => +r[ax]);
    out[ax] = {
      mean: mean(v),
      min: Math.min(...v),
      max: Math.max(...v),
      n: v.length,
    };
  }
  return out;
}

/**
 * Style axes must be zero-mean across the grid by construction
 * (docs/notes/AI-PERSONALITY-PLAN-2026-09-16.md). Returns sum and mean; a live
 * table with no style keys reports present:false.
 */
export function styleZeroMean(rows, styleAxes) {
  if (!styleAxes || !styleAxes.length) {
    return { present: false, axes: [], sum: null, meanAbs: null };
  }
  const sums = {};
  for (const ax of styleAxes) {
    let s = 0;
    for (const r of rows) s += +r[ax] || 0;
    sums[ax] = s;
  }
  const vals = Object.values(sums);
  const meanAbs = vals.reduce((a, b) => a + Math.abs(b), 0) / vals.length;
  return { present: true, axes: styleAxes.slice(), sums, sum: vals.reduce((a, b) => a + b, 0), meanAbs };
}

/**
 * Highest pairwise |r| among craft / awareness / consistency — the dial the
 * personality plan targets below 0.5 after decorrelation.
 */
export function maxCraftClusterR(matrix) {
  const keys = ["craft~awareness", "awareness~consistency", "craft~consistency"];
  let m = 0;
  for (const k of keys) {
    const v = matrix[k];
    if (v == null) continue;
    const a = Math.abs(v);
    if (a > m) m = a;
  }
  return m;
}
