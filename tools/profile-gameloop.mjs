// tools/profile-gameloop.mjs — headless CPU profile of the game loop.
// Usage: node tools/profile-gameloop.mjs [track] [mode]
//   mode "physics" (default): __apex.step()-driven synchronous loop
//   mode "render": recordVideo-ticked rAF loop (compositor drives frames)
import { createRequire } from "node:module";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { writeFileSync, existsSync, mkdirSync } from "node:fs";

const ROOT = new URL("..", import.meta.url).pathname.replace(/\/$/, "");
const require = createRequire(ROOT + "/");
const { chromium } = require("playwright");
const [track = "vegas", mode = "physics"] = process.argv.slice(2);

function freePort() {
  return new Promise((res, rej) => {
    const s = createServer();
    s.listen(0, "127.0.0.1", () => { const p = s.address().port; s.close(() => res(p)); });
    s.on("error", rej);
  });
}
function pickChromium() {
  for (const p of ["/opt/pw-browsers/chromium", "/opt/pw-browsers/chromium-1194/chrome-linux/chrome"])
    if (existsSync(p)) return p;
}

const port = await freePort();
const server = spawn("python3", ["-m", "http.server", String(port)], { cwd: ROOT, stdio: "ignore" });
await new Promise((r) => setTimeout(r, 700));

let browser;
try {
  browser = await chromium.launch({ executablePath: pickChromium(),
    args: ["--use-angle=swiftshader", "--disable-background-timer-throttling"] });
  const ctxOpts = { viewport: { width: 844, height: 390 } };
  if (mode === "render") ctxOpts.recordVideo = { dir: ROOT + "/scratch/profiles/vid" };
  const context = await browser.newContext(ctxOpts);
  const page = await context.newPage();
  await page.goto(`http://127.0.0.1:${port}/`);
  await page.waitForFunction(() => window.__apex != null, { timeout: 20000 });
  await page.evaluate((t) => { window.__apex.race(t); }, track);
  await page.waitForFunction((t) => window.__apex.info().track === t, track, { timeout: 20000 });
  await new Promise((r) => setTimeout(r, 2000));

  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Profiler.enable");
  await cdp.send("Profiler.setSamplingInterval", { interval: 200 });
  await cdp.send("Profiler.start");

  if (mode === "render") {
    // Compositor (recordVideo) ticks rAF; drive at speed for ~10 s wall.
    await page.evaluate(() => { window.__apex.go(); window.__apex.jump(0.1, 55, 0); window.__apex.setInput({ throttle: true }); });
    await new Promise((r) => setTimeout(r, 10000));
    await page.evaluate(() => window.__apex.clearInput());
  } else {
    await page.evaluate(() => {
      window.__apex.go();
      window.__apex.jump(0.1, 55, 0);
      window.__apex.step(1 / 60, 600);   // 10 s of physics, synchronous
    });
  }

  const { profile } = await cdp.send("Profiler.stop");
  mkdirSync(ROOT + "/scratch/profiles", { recursive: true });
  const outPath = `${ROOT}/scratch/profiles/${track}-${mode}.cpuprofile`;
  writeFileSync(outPath, JSON.stringify(profile));

  // Self-report: top functions by SELF time so no DevTools round-trip is needed.
  const nodes = profile.nodes || [];
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const self = new Map();
  const samples = profile.samples || [];
  for (const id of samples) self.set(id, (self.get(id) || 0) + 1);
  const total = samples.length || 1;
  const rows = [...self.entries()].map(([id, c]) => {
    const n = byId.get(id); const f = n && n.callFrame;
    return { name: (f && (f.functionName || "(anon)")) || "?", url: f && f.url ? f.url.split("/").pop().split("?")[0] : "", pct: (c / total) * 100 };
  }).sort((a, b) => b.pct - a.pct).slice(0, 22);
  console.log(`profile: ${track} ${mode} — ${total} samples`);
  for (const r of rows) console.log(`  ${r.pct.toFixed(1).padStart(5)}%  ${r.name}  ${r.url}`);
} catch (err) {
  console.error("profile failed:", err.message);
  process.exitCode = 1;
} finally {
  // Browser + server go together, on the throw path as well — an orphaned
  // pair keeps eating this 4-core box invisibly (same lesson survey-track.mjs
  // records in its own finally).
  if (browser) await browser.close().catch(() => {});
  server.kill();
}
