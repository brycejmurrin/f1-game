#!/usr/bin/env node
// @doc Garage turntable screenshot + garageCam() JSON for WebGPU/WebGL2 A/B.
//   node tools/shot/garage-frame.mjs [--backend webgpu|webgl2] [--viewport 1440x900] [--out dir]
import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  launchChromium, shutdown, startStaticServer, sleep,
} from "../lib/harness.mjs";
import {
  chromiumArgsForBackend, installProbeInit, gotoGame, openGarage, settleGarage,
  garageDiagnostics, screenshotGameCanvas,
} from "./probe-page.mjs";
import { assertGarageInterior, sampleGarageGapPixels } from "./garage-interior.mjs";
import sharp from "sharp";
import { resolveRepoDefault, assertOutputDir } from "../lib/output-paths.mjs";
import { exitIfHelp } from "../lib/cli-args.mjs";

const ROOT = fileURLToPath(new URL("../..", import.meta.url));
const argv = process.argv.slice(2);
exitIfHelp(argv, `garage-frame — garage turntable screenshot + garageCam() JSON

  node tools/shot/garage-frame.mjs [--backend webgpu|webgl2] [--viewport 1440x900] [--out dir]

Default out: artifacts/garage-frame/. Soft-present + interior gate.`);
const flag = (n, d) => {
  const i = argv.indexOf(n);
  if (i < 0) return d;
  if (!argv[i + 1] || argv[i + 1].startsWith("-")) throw new Error(`${n} needs a value`);
  return argv[i + 1];
};
const backends = flag("--backend", "webgpu,webgl2").split(",").map((s) => s.trim());
if (!backends.length || backends.some((be) => !["webgpu", "webgl2"].includes(be)))
  throw new Error("--backend must be webgpu or webgl2 (comma-separated)");
const viewport = flag("--viewport", "1440x900");
const vp = viewport.split("x").map(Number);
if (!/^\d+x\d+$/.test(viewport) || vp.some((n) => !Number.isSafeInteger(n) || n <= 0))
  throw new Error("--viewport must contain positive integer dimensions, for example 1440x900");
// Was hardcoded to /opt/cursor/artifacts/garage-frame — a Cursor-Cloud path
// that does not exist on other boxes, and outside the repo either way.
// AGENTS.md: regenerable output goes in artifacts/ or scratch/, nowhere else,
// and tools/lib/output-paths.mjs already enforces exactly that.
const outDir = assertOutputDir(flag("--out", null)
  ? resolve(ROOT, flag("--out"))
  : resolveRepoDefault(ROOT, "artifacts", "garage-frame"), ROOT, "--out");

mkdirSync(outDir, { recursive: true });

/** Gap-region samples read back from a CAPTURED png (never from the live canvas). */
async function samplePng(pngPath, panelFrac) {
  const { data, info } = await sharp(pngPath).ensureAlpha().raw()
    .toBuffer({ resolveWithObject: true });
  return sampleGarageGapPixels({ width: info.width, data }, info.width, info.height, panelFrac);
}

/**
 * Settle, capture, and gate the CAPTURE.
 *
 * The gate used to read window-side pixels from ctx.drawImage(#game), which on
 * a context without preserveDrawingBuffer is the cleared buffer — solid black —
 * so it passed every frame it was meant to judge. The screenshot is the only
 * honest source of what the frame looks like, so shoot first and judge the PNG.
 */
async function captureGatedFrame(page, backend, pngPath) {
  await page.waitForFunction(() => {
    const c = window.__apex?.garageCam?.();
    return c && c.effDist > 4 && c.on;
  }, null, { polling: 100, timeout: 120000 });
  await settleGarage(page, { frames: 120 });
  if (backend === "webgpu") {
    // awaitSoftPresent is async — do not put it inside waitForFunction (#2825:
    // an async predicate returns a Promise and the wait passes on the first poll).
    await page.evaluate(async () => {
      if (typeof GLX?.awaitSoftPresent !== "function") return;
      try { await GLX.awaitSoftPresent(20000); } catch (_) { /* soft present optional */ }
    });
  }
  // Reject flat team-tint wall frames (the Mercedes teal defect) and black ones.
  let gate = null, diag = null, shot = null;
  for (let attempt = 0; attempt < 8; attempt++) {
    diag = await garageDiagnostics(page);
    if (diag.overlay) throw new Error(`error overlay: ${diag.overlay}`);
    shot = await screenshotGameCanvas(page, pngPath);
    gate = assertGarageInterior(await samplePng(pngPath, diag.panelFrac));
    if (gate.ok) return { diag, gate, shot };
    await settleGarage(page, { frames: 30 });
    await sleep(400);
  }
  throw new Error(`garage interior gate failed: ${gate?.reason} ${JSON.stringify(gate)}`);
}

async function captureOne(srv, backend) {
  const browser = await launchChromium({ headless: true, args: chromiumArgsForBackend(backend) });
  const page = await browser.newPage();
  await page.setViewportSize({ width: vp[0], height: vp[1] });
  await installProbeInit(page, { backend });
  await gotoGame(page, srv.url);
  await openGarage(page, { team: "mercedes" });
  await page.evaluate(() => {
    const b = document.getElementById("cs-unlimited");
    if (b?.classList.contains("active")) b.click();
    document.querySelector('[data-cs-view="hero"]')?.click();
  });
  await sleep(800);
  const png = join(outDir, `garage-${backend}-${vp[0]}x${vp[1]}.png`);
  const { diag, gate } = await captureGatedFrame(page, backend, png);
  const meta = {
    garageCam: diag.cam,
    backend: diag.backend,
    interior: gate,
    aspect: diag.aspect,
    gpuErrors: diag.gpuErrors,
    canvas: await page.evaluate(() => {
      const c = document.getElementById("game");
      return c ? { w: c.clientWidth, h: c.clientHeight, bw: c.width, bh: c.height } : null;
    }),
  };
  writeFileSync(join(outDir, `garage-${backend}-${vp[0]}x${vp[1]}.json`), JSON.stringify(meta, null, 2));
  await browser.close();
  return { png, meta };
}

const srv = await startStaticServer(ROOT);
const results = [];
try {
  for (const be of backends) {
    console.log(`[garage-frame] ${be} …`);
    results.push({ backend: be, ...(await captureOne(srv, be)) });
  }
} finally {
  await srv.close();
  await shutdown();
}
const failed = results.filter((r) => !r.meta?.interior?.ok);
console.log(JSON.stringify({
  ok: failed.length === 0,
  outDir,
  results: results.map((r) => ({
    backend: r.backend, png: r.png,
    effDist: r.meta?.garageCam?.effDist, fitD: r.meta?.garageCam?.fitD,
    panelFrac: r.meta?.garageCam?.panelFrac,
    interior: r.meta?.interior,
  })),
}, null, 2));
if (failed.length) process.exit(1);
