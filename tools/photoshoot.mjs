// Close-camera photo session across lighting/tracks. Small JPEGs.
import { createRequire } from "node:module";
import { spawn } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { createServer } from "node:net";

const NEW = "/home/user/f1-game";
const OUT = "/tmp/claude-0/-home-user-f1-game/b17a0e49-28c1-58ee-b7dd-0da154666824/scratchpad/shoot";
mkdirSync(OUT, { recursive: true });
const require = createRequire(NEW + "/");
const { chromium } = require("playwright");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const port = await new Promise((res) => {
  const s = createServer();
  s.listen(0, "127.0.0.1", () => { const p = s.address().port; s.close(() => res(p)); });
});
const srv = spawn("npx", ["serve", "-l", String(port), "."], { cwd: NEW, stdio: "ignore" });
await sleep(1500);
const exe = ["/opt/pw-browsers/chromium", "/opt/pw-browsers/chromium-1194/chrome-linux/chrome"].find(existsSync);
const browser = await chromium.launch({ executablePath: exe, args: ["--use-gl=angle"] });

async function session(teamIdx, tag, track, cases) {
  const page = await browser.newPage({ viewport: { width: 560, height: 260 } });
  await page.addInitScript((i) => localStorage.setItem("apex26.team", String(i)), teamIdx);
  page.on("pageerror", (e) => console.log("PAGEERROR", tag, String(e).slice(0, 120)));
  await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: "load" });
  await page.waitForFunction(() => window.__apex, null, { timeout: 30000 });
  await page.evaluate((t) => __apex.race(t), track);
  await sleep(2500);
  for (const c of cases) {
    if (c.tod) { await page.evaluate((t) => __apex.setTimeOfDay(t), c.tod); await sleep(2200); }
    if (c.weather) { await page.evaluate((w) => __apex.weather(w), c.weather); await sleep(1200); }
    if (c.drive) {
      await page.evaluate(() => { __apex.camera("chase"); __apex.jump(0.32, 55, 0); __apex.setInput({ steer: 0, throttle: true, brake: false }); });
      await sleep(900);
    } else {
      await page.evaluate(() => __apex.park(0.30));
      await sleep(300);
      await page.evaluate(([az, el, d]) => __apex.orbit(0.30, az, el, d), [c.az, c.el, c.d]);
      await sleep(400);
    }
    await page.screenshot({ path: `${OUT}/${tag}-${c.name}.jpg`, type: "jpeg", quality: 68 });
    if (c.drive) await page.evaluate(() => __apex.clearInput());
    console.log("shot", tag, c.name);
  }
  await page.close();
}

// McLaren @ Monza: day close-ups, dusk, wet
await session(2, "mcl-monza", "monza", [
  { name: "day-front34-close", tod: "day", az: 35, el: 8, d: 3.6 },
  { name: "day-hero-low", az: 100, el: 5, d: 4.2 },
  { name: "day-top34", az: 60, el: 35, d: 4.5 },
  { name: "dusk-rear34", tod: "dusk", az: 215, el: 10, d: 4.0 },
  { name: "wet-chase", weather: "wet", drive: true },
]);
// Ferrari @ Monaco night: lamps/neon SSR + rain light + exhaust
await session(1, "fer-monaco", "monaco", [
  { name: "night-front34-close", tod: "night", az: 40, el: 9, d: 3.8 },
  { name: "night-rear-close", az: 185, el: 8, d: 3.6 },
  { name: "night-chase-drive", drive: true },
]);
await browser.close();
srv.kill();
process.exit(0);
