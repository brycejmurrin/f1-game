#!/usr/bin/env node
// Quick flag matrix for WebGPU canvas pixels (artifacts/tmp/wgpu-flag-test.json).
// @doc Flag-matrix probe for WebGPU canvas pixels (SwiftShader / Lavapipe / headed) → `artifacts/tmp/wgpu-flag-test.json`.
// @skill webgpu-debug
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { startStaticServer, launchChromium, shutdown, WEBGPU_CHROMIUM_ARGS, WEBGPU_LAVAPE_CHROMIUM_ARGS, WEBGPU_LAVAPE_ENV } from "../lib/harness.mjs";

const require = createRequire(import.meta.url);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../..");

const PRESETS = {
  swiftshader: { args: WEBGPU_CHROMIUM_ARGS, headless: true, xvfb: false, env: {} },
  lavapipe: { args: [...WEBGPU_LAVAPE_CHROMIUM_ARGS, "--headless=new"], headless: true, xvfb: false, env: WEBGPU_LAVAPE_ENV },
  lavapipe_xvfb: { args: WEBGPU_LAVAPE_CHROMIUM_ARGS, headless: false, xvfb: true, env: WEBGPU_LAVAPE_ENV },
};

async function probeOnce(preset) {
  const { chromium } = require("playwright");
  const srv = await startStaticServer(ROOT);
  const browser = await launchChromium({
    executablePath: chromium.executablePath(),
    headless: preset.headless,
    args: preset.args,
    env: { ...process.env, ...preset.env },
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
    () => { try { const p = __apex.physState(); return p && p.ok !== false; } catch { return false; } },
    null, { polling: 100, timeout: 120000 });
  await page.evaluate(() => { __apex.jump(0.12, 65); __apex.snapCam(); });
  await page.evaluate((n) => new Promise((res) => {
    let i = 0; const t = () => (++i > n ? res() : requestAnimationFrame(t)); requestAnimationFrame(t);
  }), 30);
  await page.evaluate(async () => {
    if (typeof GLX !== "undefined" && GLX.awaitSoftPresent) await GLX.awaitSoftPresent(15000);
  });
  const stats = await page.evaluate(async () => {
    const c = document.getElementById("game");
    const tmp = document.createElement("canvas");
    tmp.width = c.width; tmp.height = c.height;
    tmp.getContext("2d").drawImage(c, 0, 0);
    const d = tmp.getContext("2d").getImageData(c.width >> 1, c.height >> 1, 1, 1).data;
    const ad = await navigator.gpu.requestAdapter();
    return {
      backend: __apex.diag({ download: false }).env.backend,
      msaa: __apex.diag({ download: false }).env.msaa,
      gpuErrors: window.WGX ? WGX.gpuErrors() : null,
      canvasPx: [d[0], d[1], d[2], d[3]],
      adapterInfo: ad && ad.info ? ad.info : null,
    };
  });
  await browser.close();
  await shutdown();
  return stats;
}

async function probe(name, preset) {
  if (!preset.xvfb) return probeOnce(preset);
  const inner = `
import { createRequire } from "node:module";
const preset = ${JSON.stringify(preset)};
const { startStaticServer, launchChromium, shutdown } = await import("../lib/harness.mjs");
const { chromium } = createRequire(import.meta.url)("playwright");
const srv = await startStaticServer(${JSON.stringify(ROOT)});
const browser = await launchChromium({ executablePath: chromium.executablePath(), headless: false, args: preset.args, env: { ...process.env, ...preset.env } });
const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
await page.addInitScript(() => { localStorage.setItem("apex26.gfxBackend","webgpu"); localStorage.setItem("apex26.gfxWgxAllowSoftware","1"); localStorage.setItem("apex26.gfxWgxLite","1"); sessionStorage.setItem("apex26.wgxCapture","1"); });
await page.goto(srv.url + "index.html");
await page.waitForFunction(() => window.__apex, null, { polling: 100, timeout: 60000 });
await page.evaluate(() => { __apex.race("montreal"); __apex.go(); });
await page.waitForFunction(() => { try { const p = __apex.physState(); return p && p.ok !== false; } catch { return false; } }, null, { polling: 100, timeout: 120000 });
await page.evaluate(() => { __apex.jump(0.12, 65); __apex.snapCam(); });
await page.evaluate(n => new Promise(r => { let i=0; const t=()=>(++i>n?r():requestAnimationFrame(t)); requestAnimationFrame(t); }), 30);
await page.evaluate(async () => { if (typeof GLX !== "undefined" && GLX.awaitSoftPresent) await GLX.awaitSoftPresent(15000); });
const stats = await page.evaluate(async () => { const c=document.getElementById("game"); const t=document.createElement("canvas"); t.width=c.width;t.height=c.height; t.getContext("2d").drawImage(c,0,0); const d=t.getContext("2d").getImageData(c.width>>1,c.height>>1,1,1).data; const ad=await navigator.gpu.requestAdapter(); return { backend: __apex.diag({download:false}).env.backend, gpuErrors: WGX?WGX.gpuErrors():null, canvasPx:[d[0],d[1],d[2],d[3]], adapterInfo: ad?.info||null }; });
console.log(JSON.stringify(stats));
await browser.close(); await shutdown();
`;
  const res = spawnSync("xvfb-run", ["-a", "node", "--input-type=module", "-e", inner], {
    cwd: ROOT, encoding: "utf8", env: { ...process.env, ...preset.env }, timeout: 180000,
  });
  if (res.status !== 0) throw new Error(res.stderr || res.stdout || "xvfb probe failed");
  return JSON.parse((res.stdout || "").trim().split("\n").pop());
}

mkdirSync(join(ROOT, "artifacts/tmp"), { recursive: true });
const out = {};
for (const [name, preset] of Object.entries(PRESETS)) {
  try {
    out[name] = await probe(name, preset);
    console.log(name, JSON.stringify(out[name]));
  } catch (e) {
    out[name] = { error: String(e && e.message || e) };
    console.log(name, "FAIL", out[name].error);
  }
}
writeFileSync(join(ROOT, "artifacts/tmp/wgpu-flag-test.json"), JSON.stringify(out, null, 2));
console.log("wrote artifacts/tmp/wgpu-flag-test.json");
