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
// Pair this with eye/orbit screenshots (inspect-scene/shot.mjs) — numbers find the
// gap, pictures confirm the read. See the survey-track SKILL.

import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { existsSync } from "node:fs";
import { createServer } from "node:net";

const ROOT = new URL("../../..", import.meta.url).pathname.replace(/\/$/, "");
const require = createRequire(ROOT + "/");
const { chromium } = require("playwright");

const [trackId = "montreal", fracsArg, latsArg] = process.argv.slice(2);
const fracs = (fracsArg || "0,0.12,0.25,0.5,0.65,0.8").split(",").map(Number);
const lats = (latsArg || "8,12,20,30,45,70,110").split(",").map(Number);

function freePort() {
  return new Promise((res, rej) => {
    const s = createServer();
    s.listen(0, "127.0.0.1", () => { const p = s.address().port; s.close(() => res(p)); });
    s.on("error", rej);
  });
}
function pickChromium() {
  for (const p of ["/opt/pw-browsers/chromium", "/opt/pw-browsers/chromium-1194/chrome-linux/chrome"])
    if (existsSync(p)) return p;
  return undefined;
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const PORT = await freePort();
const server = spawn("python3", ["-m", "http.server", String(PORT)], { cwd: ROOT, stdio: "ignore" });
const done = () => { try { server.kill(); } catch {} };
process.on("exit", done);

try {
  await sleep(700);
  const browser = await chromium.launch({
    executablePath: pickChromium(),
    args: ["--use-angle=swiftshader", "--enable-unsafe-webgpu"],
  });
  const page = await browser.newPage({ viewport: { width: 800, height: 480 } });
  const errs = [];
  page.on("pageerror", (e) => errs.push(String(e).split("\n")[0]));
  await page.goto(`http://127.0.0.1:${PORT}/`);
  await page.waitForFunction(() => window.__apex != null, { timeout: 10_000 });
  await page.evaluate((id) => window.__apex.race(id), trackId);
  await page.waitForFunction(() => window.__apex.info().track != null, { timeout: 15_000 });
  await sleep(1500);

  const rows = await page.evaluate(({ fracs, lats }) => {
    const out = [];
    for (const f of fracs) {
      const cells = [];
      for (const lat of lats) {
        // probe both sides; report whichever side has rendered terrain (or null)
        const R = window.__apex.groundY(f, lat), L = window.__apex.groundY(f, -lat);
        const pick = R.terrainY != null ? R : L;
        cells.push({ lat, terrainY: pick.terrainY, gap: pick.gap });
      }
      out.push({ frac: f, roadY: window.__apex.groundY(f, 0).roadY, cells });
    }
    return out;
  }, { fracs, lats });

  console.log(`\nground-profile  ${trackId}   (terrainY === "--" → no rendered ground; props there float on groundYAt)\n`);
  const head = "frac   roadY  " + lats.map((l) => String(l + "m").padStart(8)).join("");
  console.log(head);
  console.log("-".repeat(head.length));
  for (const r of rows) {
    const cells = r.cells.map((c) => (c.terrainY == null ? "--" : c.terrainY.toFixed(2)).padStart(8)).join("");
    console.log(String(r.frac).padEnd(7) + String(r.roadY.toFixed(2)).padStart(5) + "  " + cells);
  }
  if (errs.length) console.log("\npage errors:", errs.slice(0, 5));
  console.log("");
  await browser.close();
} catch (err) {
  console.error("ground-profile failed:", err.message);
  process.exitCode = 1;
} finally {
  done();
}
