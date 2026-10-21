// Garage LIVERY sheet still: card list region, 844x390 touch, for a base/after pixel diff.
import { startStaticServer, launchChromium } from "../../tools/lib/harness.mjs";
const ROOT = process.argv[2], OUT = process.argv[3];
const srv = await startStaticServer(ROOT);
const browser = await launchChromium({ args: ["--use-angle=swiftshader", "--disable-background-timer-throttling"] });
const page = await (await browser.newContext({ viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 })).newPage();
await page.goto(srv.url);
await page.waitForFunction(() => window.__apex != null && document.getElementById("mb-race") && document.fonts.status === "loaded", null, { timeout: 240000, polling: 200 });
await page.locator("#mb-race").click();
await page.locator("#select").waitFor({ state: "visible", timeout: 120000 });
await page.locator("#sel-car").click();
await page.locator("#carsetup").waitFor({ state: "visible", timeout: 120000 });
await page.locator('#cs-tabs [data-cs-cat="livery"]').click();
await page.waitForFunction(() => document.querySelectorAll(".cs-liv-swatch:not(.cs-liv-plus) canvas").length > 8, null, { timeout: 60000, polling: 200 });
// Pick one card so the sheet is rebuilt once (the cached path), then shoot the cards themselves.
await page.evaluate(() => { const s = [...document.querySelectorAll(".cs-liv-swatch:not(.cs-liv-plus)")][2]; s && s.click(); });
await page.waitForTimeout(4000);
const n = await page.evaluate(() => document.querySelectorAll(".cs-liv-swatch:not(.cs-liv-plus) canvas").length);
// Stack the first 24 card canvases into one image (their pixels are what the cache could change).
const png = await page.evaluate(() => {
  const cs = [...document.querySelectorAll(".cs-liv-swatch:not(.cs-liv-plus) canvas")].slice(0, 24);
  const w = cs[0].width, h = cs[0].height, cols = 6, out = document.createElement("canvas");
  out.width = w * cols; out.height = h * Math.ceil(cs.length / cols);
  const g = out.getContext("2d"); cs.forEach((c, i) => g.drawImage(c, (i % cols) * w, Math.floor(i / cols) * h));
  return out.toDataURL("image/png");
});
(await import("node:fs")).writeFileSync(OUT, Buffer.from(png.split(",")[1], "base64"));
console.log(JSON.stringify({ root: ROOT, cards: n, out: OUT }));
await browser.close(); await srv.close?.();
