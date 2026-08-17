#!/usr/bin/env node
// Quick flag matrix for WebGPU canvas pixels (artifacts/tmp/wgpu-flag-test.json).
import { createRequire } from "node:module";
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { startStaticServer, launchChromium, shutdown } from "./harness.mjs";

const require = createRequire(import.meta.url);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const LVP = "/usr/share/vulkan/icd.d/lvp_icd.json";

const PRESETS = {
  swiftshader: [
    "--headless=new", "--enable-unsafe-webgpu", "--enable-features=Vulkan",
    "--use-vulkan=swiftshader", "--use-webgpu-adapter=swiftshader", "--no-sandbox",
  ],
  lavapipe: [
    "--headless=new", "--enable-unsafe-webgpu", "--enable-features=Vulkan",
    "--use-angle=vulkan", "--use-vulkan=native", "--disable-vulkan-surface",
    "--no-sandbox",
  ],
  lavapipe_headed: [
    "--enable-unsafe-webgpu", "--enable-features=Vulkan",
    "--use-angle=vulkan", "--use-vulkan=native", "--disable-vulkan-surface",
    "--no-sandbox",
  ],
};

async function probe(name, args, headed) {
  const env = { ...process.env, VK_ICD_FILENAMES: LVP };
  const srv = await startStaticServer(ROOT);
  const { chromium } = require("playwright");
  const browser = await launchChromium({
    executablePath: chromium.executablePath(),
    headless: !headed,
    args,
    env,
  });
  const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
  await page.addInitScript(() => {
    localStorage.setItem("apex26.gfxBackend", "webgpu");
    localStorage.setItem("apex26.gfxWgxLite", "1");
    sessionStorage.setItem("apex26.wgxCapture", "1");
  });
  await page.goto(srv.url + "index.html");
  await page.waitForFunction(() => window.__apex, null, { polling: 100, timeout: 60000 });
  await page.evaluate(() => { __apex.race("montreal"); __apex.go(); });
  await page.waitForFunction(
    () => { try { const p = __apex.physState(); return p && p.ok !== false; } catch { return false; } },
    null, { polling: 100, timeout: 120000 });
  await page.evaluate(() => { __apex.jump(0.12, 65); __apex.snapCam(); });
  await page.evaluate((n) => new Promise((res) => {
    let i = 0; const t = () => (++i > n ? res() : requestAnimationFrame(t)); requestAnimationFrame(t);
  }), 30);
  const stats = await page.evaluate(async () => {
    const c = document.getElementById("game");
    const tmp = document.createElement("canvas");
    tmp.width = c.width; tmp.height = c.height;
    const tctx = tmp.getContext("2d");
    tctx.drawImage(c, 0, 0);
    const d = tctx.getImageData(c.width >> 1, c.height >> 1, 1, 1).data;
    const diag = __apex.diag({ download: false });
    let adapterInfo = null;
    try {
      const ad = await navigator.gpu.requestAdapter();
      adapterInfo = ad && ad.info ? ad.info : null;
    } catch (_) {}
    return {
      backend: diag.env.backend,
      msaa: diag.env.msaa,
      gpuErrors: window.WGX ? WGX.gpuErrors() : null,
      canvasPx: [d[0], d[1], d[2], d[3]],
      adapterInfo,
    };
  });
  await page.locator("#game").screenshot({ path: join(ROOT, "artifacts/tmp/wgpu-flag-" + name + ".png"), type: "png" });
  await browser.close();
  await shutdown();
  return stats;
}

mkdirSync(join(ROOT, "artifacts/tmp"), { recursive: true });
const out = {};
for (const [name, args] of Object.entries(PRESETS)) {
  try {
    out[name] = await probe(name, args, name.includes("headed"));
    console.log(name, JSON.stringify(out[name]));
  } catch (e) {
    out[name] = { error: String(e && e.message || e) };
    console.log(name, "FAIL", out[name].error);
  }
}
writeFileSync(join(ROOT, "artifacts/tmp/wgpu-flag-test.json"), JSON.stringify(out, null, 2));
console.log("wrote artifacts/tmp/wgpu-flag-test.json");
