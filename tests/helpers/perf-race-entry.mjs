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
