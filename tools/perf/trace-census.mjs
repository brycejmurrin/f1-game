// tools/perf/trace-census.mjs — count what a CDP trace says about a steady race: layouts, style recalcs, paints,
// the top-frame sites that invalidate layout/style, GC scavenges and long tasks.
// @doc Pure CDP-trace census + baseline judge for the steady-race perf gate (#4776).
// @skill playwright-probe
//
// Counts are exact on any rasteriser (SwiftShader included); milliseconds are not, so the gate asserts counts and rates only.
// Input: Chrome trace events (the `traceEvents` array, or a `{traceEvents}` object). Output of census(): plain JSON.
// judge(census, baseline) returns the list of failures ([] = pass); the baseline is tests/data/perf-trace-baseline.json.

export const TRACE_CATEGORIES = "devtools.timeline,disabled-by-default-devtools.timeline,disabled-by-default-devtools.timeline.invalidationTracking,v8.cpu_profiler";
const LONG_TASK_US = 50000;
const round = (n, d = 2) => +n.toFixed(d);

/** `file:function` of a stack's first frame (a line number moves on any edit; the function name does not). */
export function siteKey(frame) {
  if (!frame) return "(no stack)";
  const url = String(frame.url || "").split("?")[0];
  const file = url.slice(url.lastIndexOf("/") + 1) || "(native)";
  return `${file}:${frame.functionName || "(anonymous)"}`;
}

function topFrame(ev) {
  const st = ev.args && ev.args.data && ev.args.data.stackTrace;
  return Array.isArray(st) && st.length ? st[0] : null;
}

/**
 * @param {object[]|{traceEvents:object[]}} trace
 * @param {{windowS?:number, frames?:number, skipFirstMs?:number}} [opts]  windowS: the steady window in seconds
 *   (default: first to last timeline event); frames: rendered frames in the window, for the per-1000-frames GC rate.
 */
export function census(trace, opts = {}) {
  const events = Array.isArray(trace) ? trace : (trace && trace.traceEvents) || [];
  let t0 = Infinity, t1 = -Infinity;
  for (const e of events) {
    if (e.ph !== "X" && e.ph !== "B") continue;
    if (e.name === "RunTask" || e.name === "Layout" || e.name === "Paint") { t0 = Math.min(t0, e.ts); t1 = Math.max(t1, e.ts + (e.dur || 0)); }
  }
  const windowS = opts.windowS || (t1 > t0 ? (t1 - t0) / 1e6 : 0);
  const perS = (n) => (windowS > 0 ? round(n / windowS) : 0);
  const timed = (name) => events.filter((e) => e.name === name && e.ph === "X");
  const layouts = timed("Layout"), styles = timed("UpdateLayoutTree"), paints = timed("Paint");
  const dirty = layouts.map((e) => (e.args && e.args.beginData && e.args.beginData.dirtyObjects) || 0);
  const invalidators = {};
  const tally = (kind, name) => {
    for (const e of events) {
      if (e.name !== name) continue;
      const k = `${kind} ← ${siteKey(topFrame(e))}`;
      invalidators[k] = (invalidators[k] || 0) + 1;
    }
  };
  tally("InvalidateLayout", "InvalidateLayout");
  tally("ScheduleStyleRecalculation", "ScheduleStyleRecalculation");
  const minor = events.filter((e) => e.name === "MinorGC" || e.name === "V8.GCScavenger");
  const major = events.filter((e) => e.name === "MajorGC" || e.name === "V8.GCCompactor");
  const gcMs = (list) => list.reduce((m, e) => Math.max(m, (e.dur || 0) / 1000), 0);
  const frames = opts.frames || 0;
  const tasks = timed("RunTask").sort((a, b) => a.ts - b.ts);
  // The profiler attach alone is a 600-665 ms task (research B §2.5): tasks starting in the first `skipFirstMs` of the window are excluded.
  const cut = tasks.length ? tasks[0].ts + (opts.skipFirstMs || 0) * 1000 : 0;
  const longTasks = tasks.filter((e) => e.ts >= cut && (e.dur || 0) > LONG_TASK_US);
  return {
    windowS: round(windowS, 1),
    frames,
    layout: { Layout: { count: layouts.length, perS: perS(layouts.length), meanDirty: layouts.length ? round(dirty.reduce((a, b) => a + b, 0) / layouts.length, 1) : 0 },
      UpdateLayoutTree: { count: styles.length, perS: perS(styles.length) }, Paint: { count: paints.length, perS: perS(paints.length) } },
    invalidators,
    gc: { scavenges: minor.length, scavengesPer1000Frames: frames ? round((minor.length * 1000) / frames) : 0, scavengePerS: perS(minor.length), maxScavengeMs: round(gcMs(minor)), majors: major.length },
    tasks: { total: tasks.length, longOver50ms: longTasks.length, longestMs: round(longTasks.reduce((m, e) => Math.max(m, e.dur / 1000), 0), 1) },
  };
}

/** Failures of `c` against `baseline` ({headroom, layout:{perS}, gcPer1000Frames, invalidatorSites:[...]}) — [] passes. */
export function judge(c, baseline) {
  const fail = [];
  const h = baseline.headroom || 1.25;
  const lim = baseline.layout && baseline.layout.perS;
  if (lim != null && c.layout.Layout.perS > lim * h) fail.push(`Layout/s ${c.layout.Layout.perS} > baseline ${lim} x ${h}`);
  const limGc = baseline.gcPer1000Frames;
  if (limGc != null && c.gc.scavengesPer1000Frames > limGc * h) fail.push(`scavenges per 1000 frames ${c.gc.scavengesPer1000Frames} > baseline ${limGc} x ${h}`);
  const allowed = new Set(baseline.invalidatorSites || []);
  for (const k of Object.keys(c.invalidators)) {
    const site = k.split(" ← ")[1];
    if (!allowed.has(site)) fail.push(`new invalidator site ${site} (${c.invalidators[k]}x ${k.split(" ← ")[0]}): review it, then add it to the baseline`);
  }
  if (c.tasks.longOver50ms > (baseline.longTasks || 0)) fail.push(`${c.tasks.longOver50ms} tasks over 50 ms (longest ${c.tasks.longestMs} ms) after the warm-up window`);
  return fail;
}
