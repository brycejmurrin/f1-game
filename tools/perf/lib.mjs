// tools/perf/lib.mjs — pure helpers for profile.mjs: repeat aggregation, the A/B
// delta table, the noise rule. No I/O, no browser; tests/unit/profile-lib.test.mjs.
// @doc Aggregation + A/B diff for tools/perf/profile.mjs (median of repeats, spread, win/regress/noise verdict).

export const median = (a) => {
  if (!a.length) return NaN;
  const s = [...a].sort((x, y) => x - y), m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
export const spread = (a) => (a.length ? Math.max(...a) - Math.min(...a) : NaN);
const r2 = (x) => (Number.isFinite(x) ? Math.round(x * 100) / 100 : null);

/** runs: [{ spans: {name:{p50,p95,p99,max,n}} }] one per repeat.
 *  → { name: { p50, p95, p99, max, n, spread50, spread95, runs } } (median of each stat across repeats;
 *  spread = max-min of that stat across repeats — the noise floor). */
export function aggregate(runs) {
  const names = new Set();
  for (const r of runs) for (const k of Object.keys(r.spans || {})) names.add(k);
  const out = {};
  for (const name of names) {
    const rows = runs.map((r) => (r.spans || {})[name]).filter(Boolean);
    const col = (k) => rows.map((x) => x[k]);
    out[name] = {
      p50: r2(median(col("p50"))), p95: r2(median(col("p95"))), p99: r2(median(col("p99"))), max: r2(median(col("max"))),
      n: rows.reduce((a, x) => a + (x.n || 0), 0),
      spread50: r2(spread(col("p50"))), spread95: r2(spread(col("p95"))), runs: rows.length,
    };
  }
  return out;
}

/** The rule: a delta no larger than the larger of the two spreads is NOISE, never a win or a regression.
 *  With a single repeat there is no spread, so every verdict is "unproven (--repeat 1)". */
export function verdict(base, head, key = "p50") {
  const sk = key === "p95" ? "spread95" : "spread50";
  if (!base || !head) return "n/a";
  if (base.runs < 2 || head.runs < 2) return "unproven";
  const d = head[key] - base[key], floor = Math.max(base[sk], head[sk]);
  if (Math.abs(d) <= floor) return "noise";
  return d < 0 ? "WIN" : "REGRESS";
}

export function diff(baseAgg, headAgg) {
  const names = [...new Set([...Object.keys(baseAgg), ...Object.keys(headAgg)])];
  return names.map((name) => {
    const b = baseAgg[name], h = headAgg[name];
    const dp50 = b && h ? r2(h.p50 - b.p50) : null, dp95 = b && h ? r2(h.p95 - b.p95) : null;
    return { name, base: b || null, head: h || null, dp50, dp95, pct50: b && h && b.p50 ? r2(((h.p50 - b.p50) / b.p50) * 100) : null, verdict: verdict(b, h, "p50"), verdict95: verdict(b, h, "p95") };
  });
}

const pad = (x, n) => String(x == null ? "-" : x).padStart(n);
export function formatTable(agg) {
  const rows = Object.keys(agg).sort((a, b) => agg[b].p50 - agg[a].p50);
  const head = `${"span".padEnd(10)}${pad("n", 7)}${pad("p50", 9)}${pad("p95", 9)}${pad("p99", 9)}${pad("max", 9)}${pad("±p50", 8)}`;
  return [head, ...rows.map((k) => { const s = agg[k]; return `${k.padEnd(10)}${pad(s.n, 7)}${pad(s.p50, 9)}${pad(s.p95, 9)}${pad(s.p99, 9)}${pad(s.max, 9)}${pad(s.spread50, 8)}`; })].join("\n");
}
export function formatDiff(rows, baseLabel, headLabel) {
  const head = `${"span".padEnd(10)}${pad("base p50", 10)}${pad("head p50", 10)}${pad("Δp50", 8)}${pad("Δ%", 8)}${pad("base p95", 10)}${pad("head p95", 10)}${pad("Δp95", 8)}  verdict`;
  const out = [`A/B  base=${baseLabel}  head=${headLabel}  (ms; noise floor = larger spread of the repeats)`, head];
  for (const r of rows.sort((a, b) => (b.head ? b.head.p50 : 0) - (a.head ? a.head.p50 : 0))) {
    out.push(`${r.name.padEnd(10)}${pad(r.base && r.base.p50, 10)}${pad(r.head && r.head.p50, 10)}${pad(r.dp50, 8)}${pad(r.pct50, 8)}${pad(r.base && r.base.p95, 10)}${pad(r.head && r.head.p95, 10)}${pad(r.dp95, 8)}  ${r.verdict}`);
  }
  return out.join("\n");
}

/** Interval stats of a raw ms array (the rAF cadence row that exists on every ref, spans or not). */
export function intervalStats(a) {
  if (!a.length) return null;
  const s = [...a].sort((x, y) => x - y), q = (p) => s[Math.min(s.length - 1, Math.max(0, Math.ceil(p * s.length) - 1))];
  return { n: a.length, p50: r2(q(0.5)), p95: r2(q(0.95)), p99: r2(q(0.99)), max: r2(s[s.length - 1]) };
}
