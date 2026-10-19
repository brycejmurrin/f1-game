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

export const MIN_REPEATS = 3;   // two samples give a spread of one difference: not a noise floor
/** The rule: a delta no larger than the larger of the two spreads is NOISE, never a win or a regression.
 *  Fewer than MIN_REPEATS repeats on either side leaves no trustworthy spread, so the verdict is "unproven".
 *  The "raf" row is the compositor cadence (SwiftShader, not the code under test): shown, never judged. */
export function verdict(base, head, key = "p50", name = "") {
  const sk = key === "p95" ? "spread95" : "spread50";
  if (!base || !head) return "n/a";
  if (name === "raf") return "info";
  if (base.runs < MIN_REPEATS || head.runs < MIN_REPEATS) return "unproven";
  const d = head[key] - base[key], floor = Math.max(base[sk], head[sk]);
  if (Math.abs(d) <= floor) return "noise";
  return d < 0 ? "WIN" : "REGRESS";
}

/** Saved profiles can only support a verdict when workload AND observed renderer agree.
 * Unknown/legacy metadata stays readable, but cannot prove a performance change. */
export function profileScenario({ track, frames, viewport, capture, environment } = {}) {
  return { version: 1, workload: "race-go-jump-steer-sine-v1", warmupFrames: 20,
    track, frames, viewport, capture, environment };
}
export function profileScenarioSignature(s) {
  if (!s || s.version !== 1 || s.workload !== "race-go-jump-steer-sine-v1" || s.warmupFrames !== 20 ||
      typeof s.track !== "string" || !s.track || !Number.isInteger(s.frames) || s.frames < 1 ||
      !["enabled", "disabled"].includes(s.capture)) return null;
  const v = s.viewport, e = s.environment;
  if (!v || ![v.width, v.height, v.deviceScaleFactor].every(x => Number.isFinite(x) && x > 0) ||
      !e || ![e.backend, e.api, e.device, e.browser].every(x => typeof x === "string" && x.trim())) return null;
  // Rebuild in a stable field order, ignoring incidental report ordering and extra fields.
  return JSON.stringify({ version: s.version, workload: s.workload, warmupFrames: s.warmupFrames,
    track: s.track, frames: s.frames,
    viewport: { width: v.width, height: v.height, deviceScaleFactor: v.deviceScaleFactor }, capture: s.capture,
    environment: { backend: e.backend, api: e.api, device: e.device, browser: e.browser } });
}
export function profileComparability(base, candidate) {
  const a = profileScenarioSignature(base?.scenario), b = profileScenarioSignature(candidate?.scenario);
  if (!a || !b) return { comparable: false, reason: "unknown scenario: missing or incomplete workload/renderer/capture metadata" };
  return a === b ? { comparable: true, reason: "matching workload, capture and observed renderer" }
    : { comparable: false, reason: "incompatible workload, capture or observed renderer" };
}

/** True when a ref's source reads the `apex26.wgxCapture` switch profile.mjs sets to turn the per-frame software
 *  readback off. A base without it still pays the readback, so its numbers are not comparable with HEAD's. */
export const supportsCaptureKey = (sources) => sources.some((t) => typeof t === "string" && t.includes("apex26.wgxCapture"));

/** `incomparable` replaces every judged verdict (info/n-a rows keep theirs): the arms ran different capture modes. */
export function diff(baseAgg, headAgg, { incomparable = false } = {}) {
  const judge = (b, h, key, name) => { const v = verdict(b, h, key, name); return incomparable && (v === "noise" || v === "WIN" || v === "REGRESS" || v === "unproven") ? "incomparable" : v; };
  const names = [...new Set([...Object.keys(baseAgg), ...Object.keys(headAgg)])];
  return names.map((name) => {
    const b = baseAgg[name], h = headAgg[name];
    const dp50 = b && h ? r2(h.p50 - b.p50) : null, dp95 = b && h ? r2(h.p95 - b.p95) : null;
    return { name, base: b || null, head: h || null, dp50, dp95, pct50: b && h && b.p50 ? r2(((h.p50 - b.p50) / b.p50) * 100) : null, verdict: judge(b, h, "p50", name), verdict95: judge(b, h, "p95", name) };
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
