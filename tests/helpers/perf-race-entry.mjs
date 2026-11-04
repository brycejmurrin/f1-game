// @ts-check
// SwiftShader race-entry stage harness — menu path, stage table + race vs practice diff.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

export const SCENARIO = {
  track: "bahrain",
  viewport: { width: 1440, height: 900 },
  gfxPreset: { tier: 1, mobileHigh: false },
  renderScale: 0.85,
  seed: 42,
};

/** Soft gate: report in annotations; strict fails when race menu path exceeds this (ms). */
export const RACE_ENTRY_SOFT_MS = 75000;
export const STRICT = !!process.env.APEX_PERF_RACE_ENTRY_STRICT;

export function writeArtifact(dir, payload) {
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `perf-race-entry-${Date.now()}.json`);
  fs.writeFileSync(file, JSON.stringify(payload, null, 2) + "\n");
  return file;
}

export function formatStageTable(table) {
  if (!table || !Array.isArray(table.stages)) return "(no stages)";
  return table.stages
    .filter((r) => r && r.ms != null && r.ms > 0)
    .sort((a, b) => b.ms - a.ms)
    .map((r) => `${r.n} ${Math.round(r.ms)}ms`)
    .join(" · ");
}

export function markdownStageTable(table) {
  if (!table || !Array.isArray(table.stages)) return "| stage | ms |\n|---|---|\n| (none) | — |";
  const rows = table.stages
    .filter((r) => r && (r.ms == null || r.ms > 0))
    .sort((a, b) => (b.ms || 0) - (a.ms || 0))
    .map((r) => `| ${r.n} | ${r.ms != null ? Math.round(r.ms) : "open"} |`);
  return "| stage | ms |\n|---|---|\n" + rows.join("\n");
}

export function markdownDiffTable(diff) {
  if (!diff || !Array.isArray(diff.rows)) return "| stage | race ms | practice ms | Δ |\n|---|---:|---:|---:|";
  const rows = diff.rows
    .filter((r) => (r.raceMs ?? 0) > 0 || (r.practiceMs ?? 0) > 0)
    .sort((a, b) => Math.max(b.raceMs || 0, b.practiceMs || 0) - Math.max(a.raceMs || 0, a.practiceMs || 0));
  const body = rows.map((r) => `| ${r.n} | ${r.raceMs != null ? Math.round(r.raceMs) : "—"} | ${r.practiceMs != null ? Math.round(r.practiceMs) : "—"} | ${r.deltaMs != null ? Math.round(r.deltaMs) : "—"} |`).join("\n");
  return "| stage | race ms | practice ms | Δ |\n|---|---:|---:|---:|\n" + body;
}

/** Stages with meaningful race time and negligible practice time (ms). */
export function raceOnlyStages(diff, raceFloorMs = 50, practiceCeilMs = 5) {
  if (!diff?.rows) return [];
  return diff.rows.filter((r) => (r.raceMs ?? 0) >= raceFloorMs && (r.practiceMs ?? 0) <= practiceCeilMs).map((r) => r.n);
}

/** GL lane the run is on: CI sets APEX_GL (llvmpipe); unset means SwiftShader. */
export function glLane(env = process.env) {
  return String(env.APEX_GL || "swiftshader").toLowerCase();
}

/** Long-task baseline for one GL lane (#4777): tools/perf/baselines/race-entry-swiftshader.json. A lane
 *  with no entry (or null numbers) records only. */
export function loadBaseline(lane = glLane()) {
  const f = JSON.parse(fs.readFileSync(path.join(ROOT, "tools", "perf", "baselines", "race-entry-swiftshader.json"), "utf8"));
  const l = (f.lanes && f.lanes[lane]) || {};
  return {
    lane,
    ratio: f.ratio,
    baseline: l.baseline || { blockMs: null, maxBlockMs: null, longTaskCount: null },
    runs: l.runs || {},
    loafScriptAllow: f.loafScriptAllow,
    loafMinScriptMs: f.loafMinScriptMs || 0,
  };
}

/** Pure check: measured long-task numbers vs baseline x ratio. Returns failure strings ([] = pass; null baseline = record-only). */
export function longTaskFailures(snap, base) {
  const b = base.baseline, out = [];
  if (b.blockMs == null) return out;
  const r = base.ratio;
  if (snap.blockMs > b.blockMs * r) out.push(`blockMs ${snap.blockMs} > ${b.blockMs} x ${r}`);
  if (snap.maxBlockMs > b.maxBlockMs * r) out.push(`maxBlockMs ${snap.maxBlockMs} > ${b.maxBlockMs} x ${r}`);
  if (snap.longTasks.length > b.longTaskCount * r) out.push(`long-task count ${snap.longTasks.length} > ${b.longTaskCount} x ${r}`);
  return out;
}

/** Attributed LoAF script URLs that match no allow-list entry (substring). Only scripts that ran >= minMs
 *  in a frame count: incidental UI scripts (loading-screen, race-entry-profile, ...) come and go with timing
 *  and never exceed ~50 ms, while every heavy one measured is >= 370 ms (#4777). */
export function loafUnlisted(snap, allow, minMs = 0) {
  const seen = new Set();
  for (const f of snap.loaf || []) for (const s of f.scripts) {
    if (s.url && !(s.ms < minMs) && !allow.some((a) => s.url.includes(a))) seen.add(s.url);
  }
  return [...seen].sort();
}
