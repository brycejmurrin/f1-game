#!/usr/bin/env node
// Diagnose WGX soft-present: visible #game 2D blit vs capturePixels readback
// @doc Phased soft-present diagnostic (2D blit vs `capturePixels`) across SwiftShader / Lavapipe / Lavapipe+Xvfb.
// @skill webgpu-debug / mcp-probe
// across SwiftShader / Lavapipe / Lavapipe+Xvfb. Prefer gfx-probe.mjs for the
// primary visible-canvas gate; this tool is a low-level A/B diagnostic.
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const preset = process.argv[2] || "lavapipe_xvfb";

const PRESETS = {
  swiftshader: {
    args: ["--headless=new", "--enable-unsafe-webgpu", "--enable-features=Vulkan",
      "--use-vulkan=swiftshader", "--use-webgpu-adapter=swiftshader", "--no-sandbox"],
    headless: true, xvfb: false, env: {},
  },
  lavapipe: {
    args: ["--enable-unsafe-webgpu", "--enable-features=Vulkan,DefaultANGLEVulkan,VulkanFromANGLE",
      "--use-angle=vulkan", "--use-vulkan=native", "--disable-vulkan-surface", "--no-sandbox", "--headless=new"],
    headless: true, xvfb: false,
    env: { VK_ICD_FILENAMES: "/usr/share/vulkan/icd.d/lvp_icd.json" },
  },
  lavapipe_xvfb: {
    args: ["--enable-unsafe-webgpu", "--enable-features=Vulkan,DefaultANGLEVulkan,VulkanFromANGLE",
      "--use-angle=vulkan", "--use-vulkan=native", "--disable-vulkan-surface", "--no-sandbox"],
    headless: false, xvfb: true,
    env: { VK_ICD_FILENAMES: "/usr/share/vulkan/icd.d/lvp_icd.json" },
  },
};

const p = PRESETS[preset];
if (!p) {
  console.error("usage: node tools/wgx-soft-present-diag.mjs [swiftshader|lavapipe|lavapipe_xvfb]");
  process.exit(1);
}

const inner = `
import { createRequire } from "node:module";
const { startStaticServer, launchChromium, shutdown, WEBGPU_LAVAPE_CHROMIUM_ARGS, WEBGPU_LAVAPE_ENV } = await import("./tools/harness.mjs");
const { chromium } = createRequire(import.meta.url)("playwright");
const preset = ${JSON.stringify(preset)};
const ROOT = ${JSON.stringify(ROOT)};
const launchArgs = ${JSON.stringify(p.args)};
const launchEnv = ${JSON.stringify(p.env)};
const headless = ${JSON.stringify(p.headless)};
const srv = await startStaticServer(ROOT);
const browser = await launchChromium({
  executablePath: chromium.executablePath(),
  headless,
  args: launchArgs,
  env: { ...process.env, ...launchEnv },
});
const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
await page.addInitScript(() => {
  localStorage.setItem("apex26.gfxBackend", "webgpu");
  localStorage.setItem("apex26.gfxWgxAllowSoftware", "1");
  localStorage.setItem("apex26.gfxWgxLite", "1");
  sessionStorage.setItem("apex26.wgxCapture", "1");
});
await page.goto(srv.url + "index.html");
await page.waitForFunction(() => window.__apex, null, { polling: 100, timeout: 60000 });
await page.evaluate(() => { __apex.race("montreal"); __apex.go(); });
await page.waitForFunction(
  () => { try { const ps = __apex.physState(); return ps && ps.ok !== false; } catch { return false; } },
  null, { polling: 100, timeout: 120000 });
await page.evaluate(() => { __apex.jump(0.12, 65); __apex.snapCam(); });
await page.evaluate(() => { try { __apex.step(1 / 60); } catch (_) {} });
await page.evaluate(async () => {
  if (typeof GLX !== "undefined" && GLX.awaitSoftPresent) await GLX.awaitSoftPresent(15000);
});
const snap0 = await page.evaluate(async () => {
  const c = document.getElementById("game");
  const tmp = document.createElement("canvas");
  tmp.width = c.width; tmp.height = c.height;
  tmp.getContext("2d").drawImage(c, 0, 0);
  const d = tmp.getContext("2d").getImageData(c.width >> 1, c.height >> 1, 1, 1).data;
  return { frame: 0, canvasPx: [d[0], d[1], d[2], d[3]] };
});
console.log(JSON.stringify({ preset, ...snap0 }));
const snaps = [snap0];
for (let f = 1; f < 30; f++) {
  await page.evaluate(() => { try { __apex.step(1 / 60); } catch (_) {} });
  if (f === 15 || f === 29) {
    const snap = await page.evaluate(async (fi) => {
      const c = document.getElementById("game");
      const tmp = document.createElement("canvas");
      tmp.width = c.width; tmp.height = c.height;
      tmp.getContext("2d").drawImage(c, 0, 0);
      const d = tmp.getContext("2d").getImageData(c.width >> 1, c.height >> 1, 1, 1).data;
      const hidden = document.querySelector('canvas[aria-hidden="true"]');
      let capture = null;
      try {
        const backend = typeof GLX !== "undefined" ? GLX : null;
        const capFn = backend && backend.capturePixels;
        if (capFn) {
          const p = await Promise.race([
            capFn.call(backend),
            new Promise((_, rej) => setTimeout(() => rej(new Error("cap timeout")), 10000)),
          ]);
          let sum = 0;
          for (let i = 0; i < Math.min(p.data.length, 4000); i++) sum += p.data[i];
          capture = { w: p.width, h: p.height, sampleSum: sum };
        } else capture = { err: "no capturePixels on GLX" };
      } catch (e) {
        capture = { err: String(e.message || e) };
      }
      const ad = await navigator.gpu.requestAdapter();
      return {
        frame: fi,
        canvasPx: [d[0], d[1], d[2], d[3]],
        gameSize: [c.width, c.height],
        gameCtx2d: !!c.getContext("2d"),
        hidden: hidden ? { w: hidden.width, h: hidden.height } : null,
        capture,
        adapterInfo: ad && ad.info ? ad.info : {},
        gpuErrors: typeof WGX !== "undefined" && WGX.gpuErrors ? WGX.gpuErrors() : null,
        backend: __apex.diag({ download: false }).env.backend,
      };
    }, f);
    snaps.push(snap);
    console.log(JSON.stringify({ preset, ...snap }));
  }
}
await browser.close();
await shutdown();
console.log(JSON.stringify({ preset, done: true, snaps }));
`;

function run() {
  if (p.xvfb) {
    return spawnSync("xvfb-run", ["-a", "node", "--input-type=module", "-e", inner], {
      cwd: ROOT, encoding: "utf8", env: { ...process.env, ...p.env }, timeout: 300000,
    });
  }
  return spawnSync("node", ["--input-type=module", "-e", inner], {
    cwd: ROOT, encoding: "utf8", env: { ...process.env, ...p.env }, timeout: 300000,
  });
}

const res = run();
process.stdout.write(res.stdout || "");
process.stderr.write(res.stderr || "");
process.exit(res.status ?? 1);
