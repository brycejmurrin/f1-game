#!/usr/bin/env node
// shot-car — full-frame static + moving car screenshots via the race chase cam.
// Self-boots a free-port static server (no need for a pre-started :3456).
// Output: artifacts/tmp/car-static.png + car-moving.png
//
//   node tools/shot-car.mjs
//
// For a cropped studio-orbit JPEG of one team/livery, prefer tools/carshot.mjs.
import { chromium } from "playwright";
import { existsSync, mkdirSync } from "node:fs";
import { createServer } from "node:net";
import { spawn } from "node:child_process";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "artifacts", "tmp");
mkdirSync(OUT, { recursive: true });

const EXEC = process.env.CHROME || process.env.PW_CHROMIUM ||
  ["/opt/pw-browsers/chromium", "/opt/pw-browsers/chromium-1194/chrome-linux/chrome"]
    .find(existsSync);

const port = await new Promise((res, rej) => {
  const s = createServer();
  s.listen(0, "127.0.0.1", () => {
    const p = s.address().port;
    s.close(() => res(p));
  });
  s.on("error", rej);
});

const srv = spawn("python3", ["-m", "http.server", String(port)], {
  cwd: ROOT,
  stdio: "ignore",
});
await new Promise((r) => setTimeout(r, 800));

const browser = await chromium.launch({
  ...(EXEC ? { executablePath: EXEC } : {}),
  args: ["--use-angle=swiftshader", "--enable-unsafe-webgpu"],
});
try {
  const ctx = await browser.newContext({ viewport: { width: 900, height: 506 } });
  const page = await ctx.newPage();
  const errs = [];
  page.on("console", (m) => { if (m.type() === "error") errs.push(m.text()); });
  await page.goto(`http://127.0.0.1:${port}/`);
  await page.waitForFunction(() => window.__apex?.race, { timeout: 30_000 });
  await page.evaluate(() => window.__apex.race("monza"));
  await page.waitForFunction(() => window.__apex.info().track != null, { timeout: 30_000 });
  // park the player on a straight at a standstill for a clean, framed shot of the car
  await page.evaluate(() => window.__apex.park(0.0));
  await page.waitForTimeout(1200);   // let the chase camera settle behind the car
  await page.screenshot({ path: join(OUT, "car-static.png") });
  // a moving shot to exercise wheel spin + a steered shot
  await page.evaluate(() => {
    window.__apex.jump(0.0, 30, 0);
    window.__apex.setInput({ steer: 1, throttle: true });
    window.__apex.step(1 / 60, 20);
  });
  await page.waitForTimeout(400);
  await page.screenshot({ path: join(OUT, "car-moving.png") });
  console.log("console errors:", errs.filter((e) => !e.includes("favicon")).slice(0, 5));
  console.log("done →", OUT);
} finally {
  await browser.close();
  try { srv.kill("SIGKILL"); } catch (_) {}
}
