#!/usr/bin/env node
/**
 * @doc Pearson matrix and column stats over DriverRatings.BASE — the personality dial check.
 * @skill ai-racecraft
 * ai-ratings.mjs — are the five axes one axis?
 *
 * docs/notes/AI-PERSONALITY-PLAN-2026-09-16.md measured craft/awareness/
 * consistency near r≈0.9, so every consumer is monotone in "good". Nothing in
 * the tree printed that matrix, so decorrelation had no gate. This does.
 *
 * Pure data: loads js/data/driver-ratings.js in a tiny VM (mat4 + hash32), no
 * race, no rubber band, no wear flag. Style axes (aggression / optimism), when
 * present, are checked for zero-mean across the authored grid.
 *
 *   node tools/check/ai-ratings.mjs
 *   node tools/check/ai-ratings.mjs --json
 *   node tools/check/ai-race.mjs ratings
 *
 * Gate target after decorrelation (Slice 2): max |r| among craft/awareness/
 * consistency < 0.5. Until then this prints the shipped defect.
 */
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

import {
  QUALITY_AXES,
  correlationMatrix,
  columnStats,
  styleZeroMean,
  maxCraftClusterR,
} from "../lib/ai-ratings-math.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const argv = process.argv.slice(2);
const JSON_OUT = argv.includes("--json");
if (argv.includes("--help") || argv.includes("-h")) {
  console.log(`ai-ratings — DriverRatings.BASE correlation census

  node tools/check/ai-ratings.mjs [--json]

No race. No --wear. Owned by ai-racecraft.`);
  process.exit(0);
}

function loadDriverRatings() {
  const ctx = vm.createContext({ console, Object, Math, window: {} });
  for (const f of ["js/core/mat4.js", "js/core/hash32.js", "js/data/driver-ratings.js"]) {
    vm.runInContext(fs.readFileSync(path.join(ROOT, f), "utf8"), ctx, { filename: f });
  }
  return vm.runInContext("DriverRatings", ctx);
}

const DR = loadDriverRatings();
const axes = (DR.AXES || QUALITY_AXES).slice();
const styleAxes = (DR.STYLE_AXES || []).slice();
const rows = Object.entries(DR.BASE).map(([code, row]) => {
  const o = { code };
  for (let i = 0; i < axes.length; i++) o[axes[i]] = row[i];
  // Style columns ride AFTER the quality tuple when present (Slice 3+).
  if (styleAxes.length && Array.isArray(row) && row.length > axes.length) {
    for (let i = 0; i < styleAxes.length; i++) o[styleAxes[i]] = row[axes.length + i];
  } else if (styleAxes.length && row && typeof row === "object" && !Array.isArray(row)) {
    for (const ax of styleAxes) o[ax] = row[ax];
  }
  return o;
});

const matrix = correlationMatrix(rows, axes);
const stats = columnStats(rows, axes);
const style = styleZeroMean(rows, styleAxes);
const craftCluster = maxCraftClusterR(matrix);

// overall() order — top/bottom five, for the decorrelation "recognisable grid" gate
const ranked = rows
  .map((r) => ({ code: r.code, overall: DR.overall(r) }))
  .sort((a, b) => b.overall - a.overall);

const report = {
  n: rows.length,
  axes,
  styleAxes,
  matrix,
  craftClusterMaxAbsR: craftCluster,
  decorrelated: craftCluster < 0.5,
  stats,
  style,
  overallTop5: ranked.slice(0, 5).map((r) => r.code),
  overallBottom5: ranked.slice(-5).map((r) => r.code),
};

if (JSON_OUT) {
  console.log(JSON.stringify(report, null, 2));
} else {
  console.log(`ai-ratings — ${report.n} authored drivers`);
  console.log("Pearson r:");
  for (const [k, v] of Object.entries(matrix)) {
    console.log(`  ${k.padEnd(28)} ${v == null ? "n/a" : v.toFixed(3)}`);
  }
  console.log(`craft/awareness/consistency max |r| = ${craftCluster.toFixed(3)}` +
    (report.decorrelated ? "  (decorrelated gate OK)" : "  (STILL ONE DIAL — target < 0.5)"));
  console.log("column means:");
  for (const ax of axes) {
    const s = stats[ax];
    console.log(`  ${ax.padEnd(12)} mean ${s.mean.toFixed(1)}  [${s.min}–${s.max}]`);
  }
  if (!style.present) {
    console.log("style axes: none yet (aggression / optimism land in Slice 3)");
  } else {
    console.log("style zero-mean:");
    for (const ax of style.axes) {
      console.log(`  ${ax.padEnd(12)} sum ${style.sums[ax].toFixed(2)}`);
    }
  }
  console.log(`overall top5    ${report.overallTop5.join(" ")}`);
  console.log(`overall bottom5 ${report.overallBottom5.join(" ")}`);
}
