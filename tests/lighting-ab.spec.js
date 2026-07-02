// Lighting A/B invariants — the fast, always-on companion to the offline
// variant harness (tools/ab-lighting.mjs). Two layers:
//
// 1. CATALOG INTEGRITY: every knob in tools/ab-lighting.mjs must match its
//    source file EXACTLY ONCE. Retuning or renaming a lighting constant
//    without updating the catalog fails here, immediately — so the A/B
//    harness can never silently rot.
//
// 2. LIVE A/B: the invariants the engine can flip at runtime without a
//    variant server — weather live-apply (regression for the bug where
//    weather() changed nothing but wetness), glowing fog, the night light
//    budget, the PCSS rig, and the TOD exposure table.
import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { KNOBS } from "../tools/ab-lighting.mjs";

const ROOT = new URL("..", import.meta.url).pathname;

async function boot(page, track, tod, wx, frac) {
  await page.goto("/");
  await page.waitForFunction(() => window.__apex != null, { timeout: 15000 });
  await page.evaluate((t) => window.__apex.race(t), track);
  await page.waitForFunction(() => window.__apex.info && window.__apex.info().track != null, { timeout: 25000 });
  if (tod) await page.evaluate((t) => window.__apex.setTimeOfDay(t), tod);
  if (wx) await page.evaluate((w) => window.__apex.weather(w), wx);
  if (frac != null) {
    await page.evaluate((f) => window.__apex.park(f), frac);
    await page.waitForTimeout(2200);
    await page.evaluate((f) => window.__apex.eyeAt(f, 0.2, 1.35), frac);
    await page.waitForTimeout(1100);
  }
}

// Mean luminance of a fractional region of the game canvas, decoded in-page.
async function regionMean(page, fx, fy, fw, fh) {
  const buf = await page.locator("canvas#game").screenshot({ type: "jpeg", quality: 70 });
  return page.evaluate(async ({ b64, fx, fy, fw, fh }) => {
    const img = new Image(); img.src = "data:image/jpeg;base64," + b64; await img.decode();
    const c = document.createElement("canvas"); c.width = img.width; c.height = img.height;
    const cx = c.getContext("2d"); cx.drawImage(img, 0, 0);
    const d = cx.getImageData(Math.round(img.width * fx), Math.round(img.height * fy),
      Math.round(img.width * fw), Math.round(img.height * fh)).data;
    let s = 0; for (let i = 0; i < d.length; i += 4) s += (d[i] + d[i + 1] + d[i + 2]) / 3;
    return s / (d.length / 4);
  }, { b64: buf.toString("base64"), fx, fy, fw, fh });
}

test("A/B knob catalog matches the source exactly (1 hit per knob)", () => {
  const srcCache = {};
  const problems = [];
  for (const k of KNOBS) {
    const src = srcCache[k.file] || (srcCache[k.file] = readFileSync(ROOT + k.file, "utf8"));
    const n = src.split(k.find).length - 1;
    if (n !== 1) problems.push(`${k.id}: "${k.find.slice(0, 60)}..." found ${n}x in ${k.file}`);
    if (k.find === k.b) problems.push(`${k.id}: A and B are identical`);
  }
  expect(problems, problems.join("\n")).toEqual([]);
});

test("weather() applies lighting live (fog mutes sun + lifts exposure)", async ({ page }) => {
  await boot(page, "monza", "day", "dry");
  const before = await page.evaluate(() => window.__apex.lightState());
  await page.evaluate(() => window.__apex.weather("fog"));
  await page.waitForTimeout(300);
  const after = await page.evaluate(() => window.__apex.lightState());
  // Regression: weather() used to change nothing but the wetness ramp.
  expect(Math.max(...after.sunColor)).toBeLessThan(Math.max(...before.sunColor) * 0.8);
  expect(after.exposure).toBeGreaterThanOrEqual(1.08);
});

test("night fog GLOWS around lamps (fog wall brighter than dry-night sky band)", async ({ page }) => {
  test.setTimeout(180_000);
  await boot(page, "singapore", "night", "dry", 0.35);
  const dry = await regionMean(page, 0.34, 0.38, 0.32, 0.16);
  await page.evaluate(() => window.__apex.weather("fog"));
  await page.waitForTimeout(2000);
  const foggy = await regionMean(page, 0.34, 0.38, 0.32, 0.16);
  // The lamp-tinted fog wall must add real luminance where the lamps stand.
  expect(foggy).toBeGreaterThan(dry * 1.1);
});

test("night light budget: lamps on at night, off by day, exposure per table", async ({ page }) => {
  test.setTimeout(180_000);
  await boot(page, "qatar", "night", "dry", 0.4);
  const night = await page.evaluate(() => window.__apex.lightState());
  expect(night.numLights).toBeGreaterThan(0);
  expect(night.numLights).toBeLessThanOrEqual(32);
  expect(night.exposure).toBeCloseTo(0.90, 1);   // desert night
  expect(night.floodEmit).toBeCloseTo(0.78, 2);  // prop emissive ramp
  await page.evaluate(() => window.__apex.setTimeOfDay("day"));
  await page.waitForTimeout(2500);
  const day = await page.evaluate(() => window.__apex.lightState());
  expect(day.numLights).toBe(0);
});

test("PCSS contact-hardening rig is alive", async ({ page }) => {
  await boot(page, "monza", "day", "dry");
  const pcss = await page.evaluate(() => (typeof GLX !== "undefined" && GLX.pcss) ? GLX.pcss() : null);
  expect(pcss).toBe(true);
});

test("dark sessions keep their exposure floors in fog (night must stay night)", async ({ page }) => {
  test.setTimeout(180_000);
  await boot(page, "vegas", "night", "fog");
  const ls = await page.evaluate(() => window.__apex.lightState());
  // Night fog floor is 0.95 — NOT the daytime 1.08 (that grey-washed the dark).
  expect(ls.exposure).toBeGreaterThanOrEqual(0.94);
  expect(ls.exposure).toBeLessThan(1.05);
});
