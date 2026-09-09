// tools/shot/profile-gameloop.mjs — headless CPU profile of the game loop.
// @doc Headless V8 CPU profile of the game loop → a `.cpuprofile` for Chrome DevTools.
// @skill playwright-probe
// Usage: node tools/shot/profile-gameloop.mjs [track] [mode]
//   mode "physics" (default): __apex.step()-driven synchronous loop
//   mode "render": recordVideo-ticked rAF loop (compositor drives frames)
import { writeFileSync, mkdirSync } from "node:fs";
import { launchChromium, shutdown, sleep, startStaticServer } from "../lib/harness.mjs";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("../..", import.meta.url)).replace(/[\\/]$/, "");
const [track = "vegas", mode = "physics"] = process.argv.slice(2);

const srv = await startStaticServer(ROOT);
let browser;
try {
  browser = await launchChromium({
    args: ["--use-angle=swiftshader", "--disable-background-timer-throttling"],
  });
  const ctxOpts = { viewport: { width: 844, height: 390 } };
  if (mode === "render") ctxOpts.recordVideo = { dir: ROOT + "/scratch/profiles/vid" };
  const context = await browser.newContext(ctxOpts);
  const page = await context.newPage();
  await page.goto(srv.url);
  await page.waitForFunction(() => window.__apex != null, null, { timeout: 20000 });
  await page.evaluate((t) => { window.__apex.race(t); }, track);
  await page.waitForFunction((t) => window.__apex.info().track === t, track, { timeout: 20000 });
  await sleep(2000);

  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Profiler.enable");
  await cdp.send("Profiler.setSamplingInterval", { interval: 200 });
  await cdp.send("Profiler.start");

  if (mode === "render") {
    // Compositor (recordVideo) ticks rAF; drive at speed for ~10 s wall.
    await page.evaluate(() => { window.__apex.go(); window.__apex.jump(0.1, 55, 0); window.__apex.setInput({ throttle: true }); });
    await sleep(10000);
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
  }).sort((a, b) => b.pct - a.pct);
  // A SYNC POINT IS NOT A HOT SPOT. gl.getError/finish/readPixels block until
  // the rasteriser has drained the command buffer, so every sample taken while
  // one is in flight is charged to it — all the GL work the loop QUEUED, under
  // one name. Measured on this box: a monza physics profile is 93 % getError
  // from FIVE calls (~1 s each), while `update` — the actual JS hot spot — reads
  // 1.8 %. So the flush is reported separately and the JS table is normalised
  // over what is left, or the top row sends every reader chasing a stall that
  // exists only because SwiftShader rasterises on the CPU.
  const SYNC = new Set(["getError", "finish", "readPixels", "getBufferSubData", "clientWaitSync"]);
  const flush = rows.filter((r) => SYNC.has(r.name));
  const js = rows.filter((r) => !SYNC.has(r.name));
  const jsTotal = js.reduce((a, r) => a + r.pct, 0) || 1;
  console.log(`profile: ${track} ${mode} — ${total} samples`);
  if (flush.length) {
    const fp = flush.reduce((a, r) => a + r.pct, 0);
    console.log(`  GPU sync ${fp.toFixed(1)}% of samples (${flush.map((r) => r.name).join(", ")}) — the`);
    console.log(`  rasteriser draining what the loop queued, NOT a JS cost. Percentages below are`);
    console.log(`  of the remaining ${(100 - fp).toFixed(1)}%.`);
  }
  for (const r of js.slice(0, 22))
    console.log(`  ${((r.pct / jsTotal) * 100).toFixed(1).padStart(5)}%  ${r.name}  ${r.url}`);
} catch (err) {
  console.error("profile failed:", err.message);
  process.exitCode = 1;
} finally {
  // Browser + server go together, on the throw path as well — an orphaned
  // pair keeps eating this 4-core box invisibly (same lesson survey-track.mjs
  // records in its own finally).
  await shutdown();
}
