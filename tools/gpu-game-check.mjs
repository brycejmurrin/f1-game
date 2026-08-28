#!/usr/bin/env node
/* gpu-game-check.mjs — run the ACTUAL GAME on whatever GPU this machine has,
 * and report the renderer's own verdict.
 *
 * The portable sibling of tools/gfx-probe.mjs. gfx-probe is tuned for this
 * container (Lavapipe ICD, soft-present blit, Linux paths); this one assumes
 * nothing but Playwright and a static server, so it runs on a GitHub macOS or
 * Windows image where a real adapter may exist. It answers the question the
 * software container cannot: with a hardware GPU, does the three.js/WebGPU path
 * boot, present, and reach zero uncaptured Dawn errors?
 *
 * It reads the SAME hooks the ?gfxdebug=1 overlay prints, so a CI answer and a
 * player's copy-pasted answer are directly comparable.
 *
 * Run: node tools/gpu-game-check.mjs [track] [--json out.json] [--shot out.png]
 *      [--backend three|webgpu] [--path webgpu|webgl2] [--boot-timeout MS]
 */
import { chromium } from "playwright";
import http from "node:http";
import { readFileSync, existsSync, writeFileSync } from "node:fs";
import { join, extname, resolve } from "node:path";

const ROOT = resolve(new URL("..", import.meta.url).pathname);
const MIME = {
  ".html": "text/html; charset=utf-8", ".js": "application/javascript; charset=utf-8",
  ".mjs": "application/javascript; charset=utf-8", ".css": "text/css; charset=utf-8",
  ".json": "application/json", ".png": "image/png", ".jpg": "image/jpeg",
  ".webp": "image/webp", ".svg": "image/svg+xml", ".wasm": "application/wasm",
  ".ico": "image/x-icon", ".txt": "text/plain", ".map": "application/json",
};
const PINNED = ["/opt/pw-browsers/chromium", process.env.APEX_CHROMIUM].filter(Boolean)
  .find((p) => { try { return existsSync(p); } catch (_) { return false; } }) || null;

const argv = process.argv.slice(2);
const flag = (n, d = null) => { const i = argv.indexOf(n); return i > -1 ? argv[i + 1] : d; };
const track = argv.find((a) => !a.startsWith("--") && argv[argv.indexOf(a) - 1] !== "--json"
  && argv[argv.indexOf(a) - 1] !== "--shot" && argv[argv.indexOf(a) - 1] !== "--backend"
  && argv[argv.indexOf(a) - 1] !== "--path") || "montreal";
const backend = flag("--backend", "three");
const path3 = flag("--path", "webgpu");

function serve() {
  return new Promise((res) => {
    const s = http.createServer((req, rp) => {
      const url = decodeURIComponent((req.url || "/").split("?")[0]);
      const f = join(ROOT, url === "/" ? "index.html" : url.replace(/^\/+/, ""));
      // Path containment: a static server that follows ../ out of the repo is a
      // hazard even in CI, and it costs one comparison to refuse.
      if (!f.startsWith(ROOT) || !existsSync(f)) { rp.writeHead(404); rp.end("nope"); return; }
      try {
        rp.writeHead(200, { "content-type": MIME[extname(f)] || "application/octet-stream" });
        rp.end(readFileSync(f));
      } catch (_) { rp.writeHead(500); rp.end("err"); }
    });
    s.listen(0, "127.0.0.1", () => res({ server: s, port: s.address().port }));
  });
}

const log = (m) => console.log(`[game-check] ${m}`);
const { server, port } = await serve();
const browser = await chromium.launch({
  ...(PINNED ? { executablePath: PINNED } : { channel: "chromium" }),
  args: ["--enable-unsafe-webgpu", ...(process.platform === "linux" ? ["--no-sandbox"] : [])],
});
const out = { platform: process.platform, arch: process.arch, track, backend, path: path3 };
try {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await ctx.newPage();
  const console_ = [];
  page.on("console", (m) => { if (console_.length < 200) console_.push(`${m.type()}: ${m.text()}`.slice(0, 300)); });
  page.on("pageerror", (e) => console_.push("pageerror: " + String(e && e.message).slice(0, 300)));
  await page.addInitScript(([be, p]) => {
    try {
      localStorage.setItem("apex26.gfxBackend", be);
      if (be === "three") localStorage.setItem("apex26.tlxForceGL", p === "webgl2" ? "1" : "0");
      localStorage.setItem("apex26.gfxWgxAllowSoftware", "1");
    } catch (_) { /* blocked storage: the defaults still boot */ }
  }, [backend, path3]);

  await page.goto(`http://127.0.0.1:${port}/index.html?gfxdebug=1`,
    { waitUntil: "domcontentloaded", timeout: 120000 });
  // 120 s is not enough on a software rasteriser that is ALSO a slow disk:
  // windows-latest (WARP + "Microsoft Basic Render Driver") timed out here on
  // both backends while ubuntu booted the same tree in 3 s. A boot timeout on
  // an image with no GPU says nothing about the renderer, so give it room.
  await page.waitForFunction(() => window.__apex != null, null,
    { polling: 100, timeout: Number(flag("--boot-timeout", 300000)) });
  log("booted");
  out.adapter = await page.evaluate(async () => {
    if (!navigator.gpu) return { hasGpu: false };
    try {
      const a = await navigator.gpu.requestAdapter({ powerPreference: "high-performance" });
      const i = (a && a.info) || {};
      return { hasGpu: true, vendor: i.vendor, architecture: i.architecture, description: i.description };
    } catch (e) { return { hasGpu: true, error: String((e && e.message) || e) }; }
  });

  await page.evaluate((t) => window.__apex.race(t), track);
  await page.waitForFunction(() => window.__apex.info().track != null, null, { polling: 100, timeout: 300000 });
  await page.evaluate(() => window.__apex.park(0.1));
  log("racing " + track);
  // Give the env probe its six faces and the post chain a few frames. On real
  // hardware this is fast; the wait is generous so a slow image is not read as
  // a failure.
  await page.waitForTimeout(15000);

  out.overlay = await page.evaluate(() => {
    const el = document.getElementById("gfx-debug");
    return el ? el.innerText : null;
  });
  out.gfx = await page.evaluate(() => {
    const g = typeof GLX !== "undefined" ? GLX : null;
    if (!g) return { glx: false };
    const r = { glx: true, gpuErrors: g.gpuErrors ? g.gpuErrors() : null,
      gpuFirstError: g.gpuFirstError ? g.gpuFirstError() : null };
    if (g.__tlx) {
      try { r.backendState = g.__tlx.backendState(); } catch (e) { r.backendStateError = String(e && e.message); }
      try { r.envState = g.__tlx.envState(); } catch (_) { /* pre-probe */ }
      try { r.skyState = g.__tlx.skyState(); } catch (_) { /* no sky yet */ }
    }
    try { r.engine = document.getElementById("game").getAttribute("data-engine"); } catch (_) { /* no canvas */ }
    return r;
  });
  const shot = flag("--shot", null);
  if (shot) { await page.screenshot({ path: shot, fullPage: false }); out.shot = shot; }
  out.console = console_.filter((l) => /error|warn|refus|fail|WGX|TLX/i.test(l)).slice(0, 40);
  out.ok = true;
} catch (e) {
  out.ok = false;
  out.error = String((e && e.message) || e);
} finally {
  await browser.close().catch(() => {});
  server.close();
}
console.log(JSON.stringify(out, null, 2));
const jsonAt = flag("--json", null);
if (jsonAt) writeFileSync(jsonAt, JSON.stringify(out, null, 2));
process.exit(out.ok ? 0 : 1);
