// @ts-check
// Steady-race trace census (#4776): arm a CDP trace BEFORE race(), drive ~20 s of steady throttle, stop, run census() and judge it
// against tests/data/perf-trace-baseline.json — layouts/s, the frozen list of layout/style invalidator sites, GC scavenges per
// 1000 frames, and no task over 50 ms after the warm-up window. Counts are exact on SwiftShader; milliseconds are not, so none are asserted.
// A new invalidator site is a reviewed diff: add it to the baseline's invalidatorSites in the same PR. Never widen headroom to pass.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test, expect, BOOT_MS, awaitTrackBuild } from "../helpers/fixtures.js";
import { census, judge, TRACE_CATEGORIES } from "../../tools/perf/trace-census.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const BASELINE = JSON.parse(fs.readFileSync(path.join(ROOT, "tests/data/perf-trace-baseline.json"), "utf8"));
const OUT = path.join(ROOT, "artifacts", "perf-trace-census");
const WINDOW_MS = 20_000;

test.use({ viewport: { width: 844, height: 390 } });

test("steady race: layouts/s, invalidator sites, GC and long tasks stay inside the baseline", async ({ page }, testInfo) => {
  test.setTimeout(600_000);
  await page.goto("/");
  await page.waitForFunction(() => window.__apex != null, null, { polling: 100, timeout: BOOT_MS });

  const cdp = await page.context().newCDPSession(page);
  /** @type {any[]} */ const chunks = [];
  cdp.on("Tracing.dataCollected", (e) => chunks.push(...e.value));
  const done = new Promise((r) => cdp.once("Tracing.tracingComplete", r));
  await cdp.send("Tracing.start", { categories: TRACE_CATEGORIES, transferMode: "ReportEvents" });

  await page.evaluate((id) => window.__apex.race(id), BASELINE.track);
  await awaitTrackBuild(page);
  await page.evaluate(() => {
    const A = window.__apex;
    A.go(); A.headless(true); A.setInput({ throttle: true });
    const w = /** @type {any} */ (window);
    w.__censusFrames = 0;
    const tick = () => { w.__censusFrames++; requestAnimationFrame(tick); };
    requestAnimationFrame(tick);
  });
  await page.waitForTimeout(BASELINE.warmMs);
  await page.evaluate(() => performance.mark("census:start"));
  const t0 = await page.evaluate(() => ({ f: /** @type {any} */ (window).__censusFrames, t: performance.now() }));
  await page.waitForTimeout(WINDOW_MS);
  const t1 = await page.evaluate(() => ({ f: /** @type {any} */ (window).__censusFrames, t: performance.now() }));
  await page.evaluate(() => performance.mark("census:end"));
  await cdp.send("Tracing.end");
  await done;

  const c = census(chunks, { markStart: "census:start", markEnd: "census:end", frames: t1.f - t0.f, skipFirstMs: BASELINE.skipMs });
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(path.join(OUT, "census.json"), JSON.stringify(c, null, 2));
  testInfo.annotations.push({ type: "census", description: JSON.stringify(c) });
  console.log("TRACE-CENSUS " + JSON.stringify(c));

  expect(c.layout.Layout.count, "a trace with no layouts measured nothing").toBeGreaterThan(0);
  expect(judge(c, BASELINE), JSON.stringify(c)).toEqual([]);
});
