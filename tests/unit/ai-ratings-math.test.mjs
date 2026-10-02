/**
 * Unit pins for tools/lib/ai-ratings-math.mjs — the personality dial census.
 * Failing-first for Slice 2: craftClusterMaxAbsR is currently >> 0.5 on BASE.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  pearson,
  mean,
  correlationMatrix,
  columnStats,
  styleZeroMean,
  maxCraftClusterR,
  QUALITY_AXES,
} from "../../tools/lib/ai-ratings-math.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

test("pearson: perfect, anti, and independent", () => {
  assert.equal(pearson([1, 2, 3], [2, 4, 6]), 1);
  assert.equal(pearson([1, 2, 3], [6, 4, 2]), -1);
  assert.equal(pearson([1, 1, 1], [1, 2, 3]), null, "zero variance → null");
  const near = pearson([1, 2, 3, 4], [1, 2, 3, 5]);
  assert.ok(near > 0.98 && near < 1, `near-linear got ${near}`);
});

test("correlationMatrix + maxCraftClusterR on a one-dial table", () => {
  const rows = [
    { pace: 90, craft: 90, awareness: 90, consistency: 90, experience: 50 },
    { pace: 80, craft: 80, awareness: 80, consistency: 80, experience: 40 },
    { pace: 70, craft: 70, awareness: 70, consistency: 70, experience: 30 },
  ];
  const m = correlationMatrix(rows);
  assert.equal(m["craft~awareness"], 1);
  assert.equal(m["awareness~consistency"], 1);
  assert.equal(maxCraftClusterR(m), 1);
});

test("styleZeroMean: absent vs present", () => {
  const rows = [{ aggression: 10 }, { aggression: -10 }, { aggression: 0 }];
  assert.equal(styleZeroMean(rows, []).present, false);
  const z = styleZeroMean(rows, ["aggression"]);
  assert.equal(z.present, true);
  assert.equal(z.sums.aggression, 0);
});

test("columnStats mean matches mean()", () => {
  const rows = [
    { pace: 10, craft: 1, awareness: 1, consistency: 1, experience: 1 },
    { pace: 20, craft: 1, awareness: 1, consistency: 1, experience: 1 },
  ];
  assert.equal(columnStats(rows).pace.mean, mean([10, 20]));
  assert.deepEqual(QUALITY_AXES, ["pace", "craft", "awareness", "consistency", "experience"]);
});

test("ai-ratings.mjs --json: craft/awareness/consistency are decorrelated", () => {
  const r = spawnSync(process.execPath, ["tools/check/ai-ratings.mjs", "--json"], {
    cwd: ROOT, encoding: "utf8", timeout: 15000,
  });
  assert.equal(r.status, 0, r.stderr || r.stdout);
  const j = JSON.parse(r.stdout);
  assert.equal(j.n, 22);
  assert.ok(j.craftClusterMaxAbsR < 0.5, `decorrelation gate |r|<0.5, got ${j.craftClusterMaxAbsR}`);
  assert.equal(j.decorrelated, true);
  // Slice 3+: style axes are present and zero-mean by construction.
  assert.equal(j.style.present, true);
  assert.deepEqual(j.styleAxes, ["aggression", "optimism"]);
  assert.equal(j.style.sums.aggression, 0);
  assert.equal(j.style.sums.optimism, 0);
  // Column means stay near the pre-decorrelation tip (±1.5).
  assert.ok(Math.abs(j.stats.craft.mean - 82.9) <= 1.5, `craft mean ${j.stats.craft.mean}`);
  assert.ok(Math.abs(j.stats.awareness.mean - 80.0) <= 1.5, `awareness mean ${j.stats.awareness.mean}`);
  assert.ok(Math.abs(j.stats.consistency.mean - 81.3) <= 1.5, `consistency mean ${j.stats.consistency.mean}`);
  // Overall top/bottom stay recognisable (pace dominates the weight).
  assert.ok(j.overallTop5.includes("VER"), `VER still top-ish: ${j.overallTop5}`);
  assert.ok(j.overallBottom5.includes("LIN"), `LIN still bottom-ish: ${j.overallBottom5}`);
});

test("ai-race.mjs ratings dispatches (help and json)", () => {
  const help = spawnSync(process.execPath, ["tools/check/ai-race.mjs", "ratings", "--help"], {
    cwd: ROOT, encoding: "utf8", timeout: 15000,
  });
  assert.equal(help.status, 0, help.stderr);
  assert.match(help.stdout, /ai-ratings/);
  const json = spawnSync(process.execPath, ["tools/check/ai-race.mjs", "ratings", "--json"], {
    cwd: ROOT, encoding: "utf8", timeout: 15000,
  });
  assert.equal(json.status, 0, json.stderr);
  assert.equal(JSON.parse(json.stdout).n, 22);
});

test("ai-band.mjs --help exits 0 and names the Melder checklist", () => {
  const r = spawnSync(process.execPath, ["tools/check/ai-band.mjs", "--help"], {
    cwd: ROOT, encoding: "utf8", timeout: 10000,
  });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /ai-band/);
  assert.match(r.stdout, /--wear/);
});

test("defend-duel.mjs --help exits 0 before the VM boot and names the real path", () => {
  // A missing --help used to run the full duel grid; the header also pointed
  // at scratch/defend-duel.mjs (file lives under tools/check/).
  const r = spawnSync(process.execPath, ["tools/check/defend-duel.mjs", "--help"], {
    cwd: ROOT, encoding: "utf8", timeout: 10000,
  });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /defend-duel/);
  assert.match(r.stdout, /tools\/check\/defend-duel\.mjs/);
  assert.doesNotMatch(r.stdout, /scratch\/defend-duel/);
});
