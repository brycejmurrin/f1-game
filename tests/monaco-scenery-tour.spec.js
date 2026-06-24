// @ts-check
import { test } from "@playwright/test";
import fs from "fs";
import path from "path";

const OUT = path.join(import.meta.dirname, "monaco-scenery");

test("Monaco full scenery tour", async ({ page }) => {
  test.setTimeout(180_000);
  fs.mkdirSync(OUT, { recursive: true });
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto("/");
  await page.waitForFunction(() => window.__apex, { timeout: 15000 });

  await page.evaluate(async () => {
    __apex.race("monaco");
    await new Promise(r => setTimeout(r, 4000));
    __apex.go();
    await new Promise(r => setTimeout(r, 400));
    __apex.freeze(true);
    __apex.hud(false);
  });

  async function orbitShot(label, s) {
    await page.evaluate(s => __apex.orbit(s.frac, s.az, s.el, s.dist), s);
    await page.waitForTimeout(160);
    await page.screenshot({ path: path.join(OUT, label + ".png") });
    console.log("  " + label);
  }

  async function rsShot(label, frac, side, dist, h, look) {
    await page.evaluate(
      ([f,si,di,h,lo]) => __apex.roadside(f, si, di, h, { look: lo }),
      [frac, side, dist, h, look]
    );
    await page.waitForTimeout(160);
    await page.screenshot({ path: path.join(OUT, label + ".png") });
    console.log("  " + label);
  }

  async function dlShot(label, frac, fwd, right, up, lookF) {
    await page.evaluate(
      ([f,fw,ri,up,lf]) => __apex.dolly(f, fw, ri, up, { lookF: lf }),
      [frac, fwd, right, up, lookF]
    );
    await page.waitForTimeout(160);
    await page.screenshot({ path: path.join(OUT, label + ".png") });
    console.log("  " + label);
  }

  // ── 1. tourShots: 20 evenly-spaced orbit shots ────────────────────────────
  console.log("\n── tourShots ──");
  const shots = await page.evaluate(() => __apex.tourShots(20, { dist: 120, el: 22 }));
  for (const s of shots) await orbitShot(s.label, s);

  // ── 2. roadside shots ─────────────────────────────────────────────────────
  console.log("\n── roadside ──");
  await rsShot("rs-00-sf-fwd",         0.00,  1, 10, 3, "fwd");
  await rsShot("rs-01-sf-back",        0.00, -1, 10, 3, "back");
  await rsShot("rs-02-devote-in",      0.06,  1,  8, 2, "in");
  await rsShot("rs-03-casino-out",     0.22, -1, 12, 4, "out");
  await rsShot("rs-04-hairpin-in",     0.33,  1,  6, 2, "in");
  await rsShot("rs-05-hairpin-fwd",    0.33, -1, 10, 3, "fwd");
  await rsShot("rs-06-tunnel-fwd",     0.48,  1, 10, 2, "fwd");
  await rsShot("rs-07-texit-in",       0.55, -1,  8, 2, "in");
  await rsShot("rs-08-chicane-out",    0.63,  1, 12, 4, "out");
  await rsShot("rs-09-tabac-back",     0.72,  1, 10, 3, "back");
  await rsShot("rs-10-rascasse-in",    0.82, -1,  6, 2, "in");
  await rsShot("rs-11-noghes-fwd",     0.90,  1, 10, 3, "fwd");

  // ── 3. dolly compositional shots ──────────────────────────────────────────
  console.log("\n── dolly ──");
  await dlShot("dl-00-devote",     0.06, -30,  20,  6, 0.08);
  await dlShot("dl-01-casino-app", 0.19, -20,  18,  5, 0.22);
  await dlShot("dl-02-casino-ex",  0.24,  15, -15,  5, 0.26);
  await dlShot("dl-03-hairpin",    0.33, -15,  -8,  4, 0.35);
  await dlShot("dl-04-portier",    0.42, -20,  15,  4, 0.44);
  await dlShot("dl-05-tunnel",     0.50,   0,   0,  8, 0.53);
  await dlShot("dl-06-chicane",    0.60, -20, -15,  5, 0.63);
  await dlShot("dl-07-piscine",    0.72,  20,  20,  5, 0.74);
  await dlShot("dl-08-rascasse",   0.82, -15, -12,  4, 0.84);
  await dlShot("dl-09-high",       0.50,   0,   0, 80, 0.52);

  console.log("\nDone: " + (shots.length + 12 + 10) + " shots -> " + OUT);
});
