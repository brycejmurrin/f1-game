// Scenery audit: chase-cam parked screenshots across all tracks, day + dusk.
// Output → tests/scenery-shots/<track>-<frac>-<tod>.png
import { test, expect } from "@playwright/test";
import fs from "fs";

const TRACKS = (process.env.AUDIT_TRACKS || "abudhabi,albert_park,bahrain,baku,cota,hungaroring,imola,interlagos,jeddah,madrid,mexico,miami,monaco,montreal,monza,qatar,redbull,shanghai,silverstone,singapore,spa,suzuka,vegas,zandvoort").split(",");
const FRACS = (process.env.AUDIT_FRACS || "0.12,0.4,0.7").split(",").map(Number);
const TODS = (process.env.AUDIT_TODS || "day,dusk").split(",");

const OUT = "tests/scenery-shots";
fs.mkdirSync(OUT, { recursive: true });

test.use({ viewport: { width: 844, height: 390 } });

for (const trk of TRACKS) {
  test(`scenery ${trk}`, async ({ page }) => {
    test.setTimeout(120000);
    const errs = [];
    page.on("pageerror", (e) => errs.push(String(e)));
    await page.goto("/");
    await page.evaluate(() => new Promise((r) => {
      const t = setInterval(() => { if (window.__apex) { clearInterval(t); r(); } }, 50);
    }));
    for (const tod of TODS) {
      await page.evaluate(({ trk, tod }) => {
        __apex.race(trk, tod === "dusk" ? "dusk" : "day", "dry");
      }, { trk, tod });
      await page.waitForTimeout(1800);
      for (const f of FRACS) {
        await page.evaluate((f) => { __apex.park(f); __apex.camera("chase"); __apex.snapCam && __apex.snapCam(); __apex.hud(false); }, f);
        await page.waitForTimeout(350);
        await page.screenshot({ path: `${OUT}/${trk}-${String(f).replace("0.", "")}-${tod}.png` });
      }
    }
    expect(errs, errs.join("\n")).toEqual([]);
  });
}
