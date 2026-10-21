#!/usr/bin/env node
// B·H8 incident A/B: per-wait times of the selected-9 specs. Boot to __apex.race, then race("monza") to
// info().track === "monza", REPS fresh contexts in one browser (like one Playwright worker). Usage:
//   node scratch/h8-boot-ab.mjs [reps]   (run from the tree under test)
import { startStaticServer, launchChromium } from "../tools/lib/harness.mjs";
const REPS = +(process.argv[2] || 3);
const server = await startStaticServer(process.cwd());
const browser = await launchChromium({});
const rows = [];
for (let i = 0; i < REPS; i++) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await ctx.newPage();
  const t0 = Date.now();
  await page.goto(server.url, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => window.__apex?.race, null, { polling: 100, timeout: 120000 });
  const boot = Date.now() - t0;
  const prep = await page.evaluate(() => { try { return window.__apex.menuPrep ? window.__apex.menuPrep() : null; } catch (_) { return null; } });
  const t1 = Date.now();
  await page.evaluate(() => window.__apex.race("monza", "day", "dry"));
  const raceCall = Date.now() - t1;
  await page.waitForFunction(() => window.__apex.info().track === "monza", null, { polling: 100, timeout: 120000 });
  const track = Date.now() - t1;
  rows.push({ boot, raceCall, track, prep: prep && JSON.stringify(prep).slice(0, 160) });
  console.log(JSON.stringify(rows[rows.length - 1]));
  await ctx.close();
}
const med = (k) => rows.map((r) => r[k]).sort((a, b) => a - b)[Math.floor(rows.length / 2)];
console.log("MEDIAN boot", med("boot"), "raceCall", med("raceCall"), "track", med("track"));
await browser.close(); server.close && server.close(); process.exit(0);
