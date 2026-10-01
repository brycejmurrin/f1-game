#!/usr/bin/env node
// Lateral ground-profile probe — the "are props floating / is there a channel?" check.
// Usage: node .claude/skills/survey-track/ground-profile.mjs <trackId> [fracs] [lats]
//   fracs = comma list of lap fractions (default 0,0.12,0.25,0.5,0.65,0.8)
//   lats  = comma list of lateral metres from centreline (default 8,12,20,30,45,70,110)
//
// For each (frac, lat) it reads __apex.groundY(frac, lat) = {roadY, terrainY, gap}.
//   • terrainY === null  → NO rendered terrain mesh covers that point. Trackside
//     props placed out there fall back to the closed-form groundYAt() estimate, so
//     if that estimate disagrees with whatever flat slab/water you drew, the props
//     FLOAT (or sink) and a visible step ("channel between rings") appears.
//   • gap (terrainY - roadY) should be small & smooth. A big jump between adjacent
//     lats = a cliff/step; sudden null after solid = the ribbon's outer edge.
// Pair this with eye/orbit screenshots (tools/shot/shot.mjs) — numbers find the
// gap, pictures confirm the read. See the survey-track SKILL.

import {
  launchChromium,
  shutdown,
  sleep,
  startStaticServer,
} from "../../../tools/lib/harness.mjs";

import { fileURLToPath } from "node:url";
import { assertSafePathToken } from "../../../tools/lib/output-paths.mjs";
import { chromiumArgsForBackend, installProbeInit } from "../../../tools/shot/probe-page.mjs";
const ROOT = fileURLToPath(new URL("../../..", import.meta.url)).replace(/[\\/]$/, "");

const [trackId = "montreal", fracsArg, latsArg] = process.argv.slice(2);
if (trackId === "--help" || trackId === "-h") { console.log("usage: ground-profile.mjs <trackId> [fracs] [lats]"); process.exit(0); }
assertSafePathToken(trackId, "track id");
if (process.argv.slice(2).length > 3) throw new Error("too many arguments");
const fracs = (fracsArg || "0,0.12,0.25,0.5,0.65,0.8").split(",").map((s) => s.trim() === "" ? NaN : Number(s));
const lats = (latsArg || "8,12,20,30,45,70,110").split(",").map((s) => s.trim() === "" ? NaN : Number(s));

if (!fracs.length || !fracs.every((n) => Number.isFinite(n) && n >= 0 && n <= 1) || fracs.length > 32) throw new Error("fracs must be finite 0..1 (at most 32)");
if (!lats.length || !lats.every((n) => Number.isFinite(n) && n > 0 && n <= 1000) || lats.length > 32) throw new Error("lats must be finite 0..1000 (at most 32)");
const srv = await startStaticServer(ROOT);

try {
  const browser = await launchChromium({
    args: chromiumArgsForBackend("three"),
  });
  const page = await browser.newPage({ viewport: { width: 800, height: 480 } });
  const errs = [];
  page.on("pageerror", (e) => errs.push(String(e).split("\n")[0]));
  await installProbeInit(page, { backend: "three" });
  await page.goto(srv.url);
  await page.waitForFunction(() => window.__apex != null, null, { timeout: 10_000, polling: 100 });
  await page.evaluate((id) => window.__apex.race(id), trackId);
  await page.waitForFunction(() => window.__apex.info().track != null, null, { timeout: 15_000, polling: 100 });
  await sleep(1500);

  const rows = await page.evaluate(({ fracs, lats }) => {
    const out = [];
    for (const f of fracs) for (const side of [1, -1]) {
      const cells = [];
      for (const lat of lats) {
        // probe both sides; report whichever side has rendered terrain (or null)
        const pick = window.__apex.groundY(f, side * lat);
        cells.push({ lat: side * lat, terrainY: pick.terrainY, gap: pick.gap });
      }
      out.push({ frac: f, side: side > 0 ? "R" : "L", roadY: window.__apex.groundY(f, 0).roadY, cells });
    }
    return out;
  }, { fracs, lats });

  console.log(`\nground-profile  ${trackId}   (terrainY === "--" → no rendered ground; props there float on groundYAt)\n`);
  const head = "frac   roadY  " + lats.map((l) => String(l + "m").padStart(8)).join("");
  console.log(head);
  console.log("-".repeat(head.length));
  for (const r of rows) {
    const cells = r.cells.map((c) => (c.terrainY == null ? "--" : c.terrainY.toFixed(2)).padStart(8)).join("");
    console.log((String(r.frac) + r.side).padEnd(7) + String(r.roadY.toFixed(2)).padStart(5) + "  " + cells);
  }
  if (errs.length) console.log("\npage errors:", errs.slice(0, 5));
  console.log("");
  await browser.close();
} catch (err) {
  console.error("ground-profile failed:", err.message);
  process.exitCode = 1;
} finally {
  await shutdown();
}
