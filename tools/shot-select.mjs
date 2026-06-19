import { chromium } from "playwright";

const EXEC = "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const BASE = "http://localhost:3456";

const shots = [
  { name: "portrait", w: 390, h: 844 },
  { name: "landscape", w: 844, h: 390 },
];

const browser = await chromium.launch({
  executablePath: EXEC,
  args: ["--use-angle=swiftshader", "--enable-unsafe-webgpu"],
});

for (const s of shots) {
  const ctx = await browser.newContext({
    viewport: { width: s.w, height: s.h },
    deviceScaleFactor: 2,
  });
  const page = await ctx.newPage();
  await page.goto(BASE + "/");
  await page.locator("#mb-race").click();
  await page.locator("#select").waitFor({ state: "visible" });
  await page.waitForTimeout(300);
  await page.screenshot({ path: `/tmp/select-${s.name}.png` });
  console.log(`shot ${s.name} done`);
  await ctx.close();
}

await browser.close();
