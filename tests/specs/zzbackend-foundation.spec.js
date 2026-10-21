// @ts-check
// THROWAWAY PROBE (B·W12, 2026-10-21): which render backend does an UNPINNED page boot on a CI runner, and what do
// monza/redbull-style boots cost? Deliberately FAILS with the measurements in its message so they show in the job log.
// Never merge. Imports `test` from @playwright/test directly, exactly like the foundation specs it sits beside.
import { test } from "@playwright/test";
import { BOOT_MS } from "../helpers/fixtures.js";

test("backend probe (unpinned) reports and fails on purpose", async ({ page }) => {
  test.setTimeout(300_000);
  const lines = [];
  page.on("console", (m) => { const t = m.text(); if (/\[gfx\]|rigWarm|rig warm|context ready|backend/i.test(t)) lines.push(t.slice(0, 140)); });
  await page.addInitScript(() => { try { localStorage.setItem("apex26.logLevel", "debug"); } catch (_) {} });
  const t0 = Date.now();
  await page.goto("/");
  await page.waitForFunction(() => window.__apex?.race, null, { polling: 100, timeout: BOOT_MS });
  const bootMs = Date.now() - t0;
  const t1 = Date.now();
  await page.evaluate(() => { window.__pr = "pending"; Promise.resolve(window.__apex.race("monza")).then(() => { window.__pr = "ok"; }, (e) => { window.__pr = "err:" + (e && e.message); }); });
  await page.waitForFunction(() => window.__pr !== "pending", null, { polling: 200, timeout: 200_000 });
  const raceMs = Date.now() - t1;
  const info = await page.evaluate(() => ({ gpu: typeof navigator.gpu, ua: navigator.userAgent.slice(0, 60), glx: typeof window.GLX, pin: localStorage.getItem("apex26.gfxBackend"), race: window.__pr }));
  throw new Error("PROBE " + JSON.stringify({ bootMs, raceMs, ...info, gfx: lines.slice(0, 14) }));
});
