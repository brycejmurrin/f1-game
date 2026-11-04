// tools/perf/trace-gate.mjs — the steady-race perf gate (#4776) on top of trace-census.mjs: cut a trace to the window
// between two performance.mark()s, run the shared census, judge it against tests/data/perf-trace-baseline.json.
// @doc Steady-race trace gate: mark-window cut + baseline judge over trace-census (spec perf-trace-census.spec.js).
// @skill playwright-probe
import { census } from "./trace-census.mjs";

export const TRACE_CATEGORIES = "devtools.timeline,disabled-by-default-devtools.timeline,disabled-by-default-devtools.timeline.invalidationTracking,disabled-by-default-devtools.timeline.stack,blink.user_timing,v8.cpu_profiler";

/** `file:function` of an invalidator row `"<Event> <fn> <file>:<line>"` (a line moves on any edit; the function does not). */
export function siteKey(site) {
  const [, rest] = [site.split(" ")[0], site.slice(site.indexOf(" ") + 1)];
  if (rest === "(no stack)") return "(no stack)";
  const i = rest.lastIndexOf(" ");
  const fn = rest.slice(0, i), loc = rest.slice(i + 1).replace(/:\d+$/, "");
  return `${loc.slice(loc.lastIndexOf("/") + 1) || "(native)"}:${fn}`;
}

/**
 * Census of the events between marks `markStart` and `markEnd` (everything outside — track build, warm-up — dropped).
 * `skipFirstMs` drops long-task candidates that start in the first ms of the window; `frames` feeds the GC-per-1000-frames rate.
 */
export function windowCensus(events, { markStart, markEnd, frames = 0, skipFirstMs = 0 }) {
  const at = (n) => { const m = events.find((e) => e.name === n && typeof e.ts === "number"); return m ? m.ts : null; };
  const t0 = at(markStart), t1 = at(markEnd);
  if (t0 == null || t1 == null || t1 <= t0) throw new Error(`trace-gate: marks ${markStart}/${markEnd} not both in the trace`);
  const inWin = events.filter((e) => e.ph === "M" || (e.ts >= t0 && e.ts <= t1));
  const c = census(inWin, { top: 200 });
  const cut = t0 + skipFirstMs * 1000;
  const late = inWin.filter((e) => e.ph === "X" && e.name === "RunTask" && e.ts >= cut && (e.dur || 0) > 50000);
  const sites = {};
  for (const r of c.invalidators) { const k = siteKey(r.site); sites[k] = (sites[k] || 0) + r.n; }
  const winS = (t1 - t0) / 1e6, perS = (n) => +(n / winS).toFixed(2);   // the mark span, not the census's event extent
  return {
    windowS: +winS.toFixed(1), frames,
    layoutPerS: perS(c.layout.Layout.n), layoutMeanDirty: c.layoutDirtyAvg,
    styleRecalcPerS: perS(c.layout.UpdateLayoutTree.n), paintPerS: perS(c.layout.Paint.n),
    invalidatorSites: sites,
    scavenges: c.gc.scavenges, scavengesPer1000Frames: frames ? +((c.gc.scavenges * 1000) / frames).toFixed(2) : 0, majors: c.gc.majors,
    longTasksAfterSkip: late.length, longestMs: late.reduce((m, e) => Math.max(m, e.dur / 1000), 0),
  };
}

/** Failures of `w` (a windowCensus) against `baseline` — [] passes. */
export function judge(w, baseline) {
  const fail = [], h = baseline.headroom || 1.25;
  if (baseline.layoutPerS != null && w.layoutPerS > baseline.layoutPerS * h) fail.push(`Layout/s ${w.layoutPerS} > baseline ${baseline.layoutPerS} x ${h}`);
  if (baseline.gcPer1000Frames != null && w.scavengesPer1000Frames > baseline.gcPer1000Frames * h) fail.push(`scavenges per 1000 frames ${w.scavengesPer1000Frames} > baseline ${baseline.gcPer1000Frames} x ${h}`);
  const allowed = new Set(baseline.invalidatorSites || []);
  for (const [k, n] of Object.entries(w.invalidatorSites)) if (!allowed.has(k)) fail.push(`new invalidator site ${k} (${n}x): review it, then add it to the baseline`);
  if (w.longTasksAfterSkip > (baseline.longTasks || 0)) fail.push(`${w.longTasksAfterSkip} tasks over 50 ms after the first window ms (longest ${w.longestMs.toFixed(1)} ms)`);
  return fail;
}
