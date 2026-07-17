#!/usr/bin/env node
// chase-shots.mjs — capture N chase-camera screenshots evenly spaced around a
// lap of one circuit. Standalone review tool (no Playwright test harness):
// spins up its own static server, drives the real in-game CHASE camera via
// __apex (not the debug free-cam), and writes PNGs to scratch/captures/.
//
//   node tools/chase-shots.mjs monza                 # 6 shots, day, dry
//   node tools/chase-shots.mjs spa --n=10 --tod=dusk --weather=wet
//   node tools/chase-shots.mjs vegas --n=4 --tod=night --speed=55 --hud
//
// Flags: --n=<shots>  --tod=day|dawn|dusk|night|default  --weather=dry|wet
//        --speed=<m/s at capture, default 45>  --hud (keep HUD; default off)
//        --port=<http port, default 3550>  --out=<dir, default scratch/captures>
//        --size=WxH (default 960x540)
//
// The car is jumped to each lap fraction at speed with physics frozen after a
// couple of settle ticks, so the chase cam sits in its natural driving pose
// (behind + above, looking through the corner) rather than a parked pose.
import { spawn } from "node:child_process";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { chromium } from "playwright";

const args = process.argv.slice(2);
const track = args.find((a) => !a.startsWith("--"));
if (!track) {
  console.error("usage: node tools/chase-shots.mjs <trackId> [--n=6] [--tod=day] [--weather=dry] [--speed=45] [--hud] [--port=3550] [--out=scratch/captures] [--size=960x540]");
  process.exit(2);
}
const flag = (name, def) => {
  const hit = args.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.split("=")[1] : def;
};
const N = Math.max(1, parseInt(flag("n", "6"), 10));
const tod = flag("tod", "day");
const weather = flag("weather", "dry");
const speed = parseFloat(flag("speed", "45"));
const port = parseInt(flag("port", "3550"), 10);
const outDir = flag("out", "scratch/captures");
const [vw, vh] = flag("size", "960x540").split("x").map((v) => parseInt(v, 10));
const keepHud = args.includes("--hud");

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
mkdirSync(path.resolve(root, outDir), { recursive: true });

// Static server (same pattern as the probe scripts; --directory pins the root).
const server = spawn("python3", ["-m", "http.server", String(port), "--directory", root], {
  stdio: "ignore",
});
const stop = () => { try { server.kill("SIGKILL"); } catch {} };
process.on("exit", stop);
process.on("SIGINT", () => { stop(); process.exit(130); });

const exePath = process.env.PW_CHROMIUM || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";

try {
  const browser = await chromium.launch({
    executablePath: exePath,
    args: ["--use-angle=swiftshader"],
  });
  const page = await browser.newPage({ viewport: { width: vw, height: vh } });
  page.setDefaultTimeout(120000);
  await page.goto(`http://127.0.0.1:${port}/index.html`, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => window.__apex, null, { timeout: 120000 });

  const ok = await page.evaluate(async ({ track, tod, weather, keepHud }) => {
    const ids = __apex.tracks().map((t) => (typeof t === "string" ? t : t.id));
    if (!ids.includes(track)) return `unknown track "${track}" — ids: ${ids.join(", ")}`;
    __apex.race(track);
    __apex.go();
    __apex.setTimeOfDay(tod);
    __apex.weather(weather);
    __apex.camera("chase");
    __apex.hud(keepHud);
    __apex.step(1 / 60, 2); // initialise player.px so jump/probe work
    return true;
  }, { track, tod, weather, keepHud });
  if (ok !== true) { console.error(ok); stop(); process.exit(2); }
  if (!keepHud) await page.addStyleTag({ content: "#btn-cam{display:none!important}" });

  // SwiftShader renders ~0.2-1 fps: after staging each shot, wait for two real
  // rAF frames so the freshly positioned chase camera is what's on the canvas.
  const twoFrames = () =>
    page.evaluate(() => new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(res))));

  for (let i = 0; i < N; i++) {
    const frac = i / N;
    await page.evaluate(({ frac, speed }) => {
      __apex.freeze(false);
      __apex.jump(frac, speed, 0);
      __apex.step(1 / 60, 12); // settle heading/velocity into the corner
      __apex.freeze(true);
      __apex.snapCam();        // chase cam directly to its final pose (no easing lag)
    }, { frac, speed });
    await twoFrames();
    const file = path.resolve(root, outDir,
      `chase-${track}-${tod}-${weather}-f${String(Math.round(frac * 100)).padStart(2, "0")}.png`);
    await page.screenshot({ path: file });
    console.log(`[${i + 1}/${N}] frac=${frac.toFixed(2)}  ${path.relative(root, file)}`);
  }

  await browser.close();
} finally {
  stop();
}
console.log(`done: ${N} chase shots of "${track}" (${tod}, ${weather}) in ${outDir}/`);
