---
name: perf-profile
description: Capture a headless V8 CPU flame chart of the game loop via Playwright CDP (Chrome DevTools Protocol) — no manual browser interaction. Writes a .cpuprofile file openable in Chrome DevTools. Use when hunting frame-time spikes, GC jitter on night tracks, or slow track-build times. Triggers - "profile the game loop", "find the frame budget hog", "GC spike", "slow track load", "measure physics cost", "flame chart".
---

# Headless CPU profiling via Playwright + CDP

Captures a V8 `.cpuprofile` of the running game loop without opening a browser
manually.  Uses Playwright's `newCDPSession()` to drive the built-in V8 profiler.

## Quick capture (copy-paste harness)

```js
// tools/profile-gameloop.mjs — run with: node tools/profile-gameloop.mjs
import { createRequire } from "node:module";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { writeFileSync, existsSync } from "node:fs";

const ROOT = new URL("..", import.meta.url).pathname.replace(/\/$/, "");
const require = createRequire(ROOT + "/");
const { chromium } = require("playwright");

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
await new Promise(r => setTimeout(r, 700));

const browser = await chromium.launch({ executablePath: pickChromium(),
  args: ["--use-angle=swiftshader", "--enable-unsafe-webgpu"] });
const page = await browser.newPage({ viewport: { width: 844, height: 390 } });
await page.goto(`http://127.0.0.1:${port}/`);
await page.waitForFunction(() => window.__apex != null, { timeout: 15000 });

// Load track and go headless (uncapped physics, no render cost)
await page.evaluate(() => { window.__apex.race("monza"); });
await page.waitForFunction(() => window.__apex.info().track === "monza", { timeout: 15000 });
await new Promise(r => setTimeout(r, 1600));

const cdp = await page.context().newCDPSession(page);
await cdp.send("Profiler.enable");
await cdp.send("Profiler.start");

// Run 5 seconds of game loop (300 frames at 60 fps)
await page.evaluate(() => {
  window.__apex.go();
  window.__apex.jump(0.1, 55, 0);
  window.__apex.step(1/60, 300);  // headless: uncapped, runs synchronously
});

const { profile } = await cdp.send("Profiler.stop");
const outPath = ROOT + "/scratch/gameloop.cpuprofile";
writeFileSync(outPath, JSON.stringify(profile));
console.log("Profile written to", outPath);
console.log("Open in Chrome DevTools: Performance tab → Load profile");

await browser.close();
server.kill();
```

## Reading the flame chart

Open `scratch/gameloop.cpuprofile` in Chrome DevTools → **Performance** tab →
**Load profile** button.  Key functions to look for:

| Function | What it means |
|---|---|
| `updateCar` | Per-car physics tick — hot if AI count is high |
| `buildTrackLights` | Light culling each frame — should be < 0.5 ms |
| `begin` / `gl.uniform*` | Shader uniform upload — flag if > 2 ms |
| `(garbage collector)` | GC jitter — look for `Minor GC` during night races |
| `buildRoad` / `buildProps` | Track mesh build — runs once on load, not per-frame |

## Headless vs rendered profiling

`__apex.step(1/60, N)` runs the physics loop synchronously (no render).  To
profile the **full render pipeline** including WebGL draw calls, omit
`headless(true)` and instead run the game normally for N frames with rAF:

```js
await page.evaluate(async (n) => {
  window.__apex.go(); window.__apex.jump(0.1, 55, 0);
  await new Promise(r => { let i = 0; function f() { if (++i < n) requestAnimationFrame(f); else r(); } requestAnimationFrame(f); });
}, 300);
```

Then `Profiler.stop` as above.

## Interpreting GC spikes on night tracks

If `Minor GC` appears frequently during a Vegas/Singapore session, the cause is
almost certainly per-frame `new Float32Array(...)` in the light-upload path.
Check `GLX.hdrMode()` returns `true` (RGBA16F FBO active) — RGBA8 fallback does
additional intermediate copies.
