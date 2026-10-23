// Run readback-quit-menu-oracle.mjs N times; print median/worst summary.
// @doc Aggregates N quit-menu oracle runs into median/worst TTI, stall, and garage-close metrics.
// Usage: APEX_ORACLE_RUNS=3 node tools/gfx/readback-quit-menu-oracle-repeat.mjs
// Env: APEX_ORACLE_LABEL (base|branch), APEX_ORACLE_OUT_DIR
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("../..", import.meta.url)).replace(/[\\/]$/, "");
const RUNS = Math.max(1, +process.env.APEX_ORACLE_RUNS || 3);
const LABEL = process.env.APEX_ORACLE_LABEL || "run";
const OUT_DIR = process.env.APEX_ORACLE_OUT_DIR || join(ROOT, "artifacts/logs/quit-oracle-repeat", LABEL);

function median(nums) {
  const a = nums.filter((n) => Number.isFinite(n)).sort((x, y) => x - y);
  if (!a.length) return null;
  const m = Math.floor(a.length / 2);
  return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
}
function worst(nums) {
  const a = nums.filter((n) => Number.isFinite(n));
  return a.length ? Math.max(...a) : null;
}

mkdirSync(OUT_DIR, { recursive: true });
const runs = [];
for (let i = 1; i <= RUNS; i++) {
  const out = join(OUT_DIR, `run-${i}.json`);
  console.log(`= repeat ${LABEL} ${i}/${RUNS} -> ${out}`);
  try {
    execFileSync("node", ["tools/gfx/readback-quit-menu-oracle.mjs"], {
      cwd: ROOT,
      env: { ...process.env, APEX_ORACLE_OUT: out },
      stdio: "inherit",
      timeout: Math.max(600000, (+process.env.APEX_PROFILE_WAIT_MS || 600000) * 2),
    });
    const row = JSON.parse(readFileSync(out, "utf8"));
    if (row.softwareRaster !== true || row.quit?.softwareRaster !== true) {
      throw new Error(`run ${i}: softwareRaster not true`);
    }
    runs.push(row);
  } catch (e) {
    runs.push({ error: String(e.message || e).slice(0, 400) });
  }
}

const ok = runs.filter((r) => !r.error && r.quit);
const pick = (fn) => ok.map(fn);
const summary = {
  label: LABEL,
  runs: RUNS,
  ok: ok.length,
  failed: runs.filter((r) => r.error).length,
  quitTtiMs: { median: median(pick((r) => r.quit.ttiMs)), worst: worst(pick((r) => r.quit.ttiMs)) },
  syncWorstMs: { median: median(pick((r) => r.quit.stall?.syncWorstMs)), worst: worst(pick((r) => r.quit.stall?.syncWorstMs)) },
  stallWorstMs: { median: median(pick((r) => r.quit.stall?.worstMs)), worst: worst(pick((r) => r.quit.stall?.worstMs)) },
  stallReloads: { median: median(pick((r) => r.quit.stallReloads)), worst: worst(pick((r) => r.quit.stallReloads)) },
  garageCloseClicks: { median: median(pick((r) => r.garageClose?.closeClicks)), worst: worst(pick((r) => r.garageClose?.closeClicks)) },
  garageCloseMs: { median: median(pick((r) => r.garageClose?.closeMs)), worst: worst(pick((r) => r.garageClose?.closeMs)) },
  raw: runs,
};
const sumPath = join(OUT_DIR, "summary.json");
writeFileSync(sumPath, JSON.stringify(summary, null, 2) + "\n");
console.log("= summary", JSON.stringify(summary, null, 2));
