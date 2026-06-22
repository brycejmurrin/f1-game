// Multi-angle scenery inspection. Output → tests/scenery-shots/angle-<track>-<view>.png
import { test, expect } from "@playwright/test";
import fs from "fs";

const TRACKS = (process.env.ANGLE_TRACKS || "madrid").split(",");
const TOD = process.env.ANGLE_TOD || "day";
const S = parseFloat(process.env.ANGLE_S || "0.12");
const OUT = "tests/scenery-shots";
fs.mkdirSync(OUT, { recursive: true });

test.use({ viewport: { width: 1000, height: 600 } });

for (const trk of TRACKS) {
  test(`angles ${trk}`, async ({ page }) => {
    test.setTimeout(90000);
    await page.goto("/");
    await page.evaluate(() => new Promise((r) => {
      const t = setInterval(() => { if (window.__apex) { clearInterval(t); r(); } }, 50);
    }));
    await page.evaluate(({ trk, TOD }) => { __apex.race(trk, TOD, "dry"); __apex.hud(false); }, { trk, TOD });
    await page.waitForTimeout(2000);
    // Resolve a world eye/target set around the focus fraction so we frame the
    // roadside buildings (not the sky). Uses view()'s explicit eye/target form.
    const views = await page.evaluate((S) => {
      const out = {};
      // eye-level on the track looking at the RIGHT-side buildings
      out.street_R = { s: S, side: "R", dist: 6, height: 5, look: "out", fov: 70 };
      // a step back + up, still looking outward at the facades
      out.facade_R = { s: S, side: "R", dist: 22, height: 14, look: "out", fov: 62 };
      // low 3/4 from the left looking across the street to the right buildings
      out.oblique  = { s: S, side: "L", dist: 70, height: 26, look: "in", fov: 55 };
      // high 3/4 aerial
      out.aerial   = { s: S, radius: 130, azimuth: 45, elevation: 32, zoom: 1.0 };
      return out;
    }, S);
    for (const [name, v] of Object.entries(views)) {
      await page.evaluate((v) => __apex.view(v), v);
      await page.waitForTimeout(300);
      await page.screenshot({ path: `${OUT}/angle-${trk}-${name}.png` });
    }
    expect(true).toBe(true);
  });
}
