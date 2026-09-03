#!/usr/bin/env node
// @doc Garage turntable screenshot + garageCam() JSON for WebGPU/WebGL2 A/B.
//   node tools/shot/garage-frame.mjs [--backend webgpu|webgl2] [--viewport 1440x900] [--out dir]
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  launchChromium, shutdown, startStaticServer, sleep,
} from "../lib/harness.mjs";
import {
  chromiumArgsForBackend, installProbeInit, gotoGame, openGarage, settleGarage,
  garageDiagnostics, screenshotGameCanvas,
} from "../capture/probe-page.mjs";
import { assertGarageInterior } from "../capture/garage-interior.mjs";

const ROOT = fileURLToPath(new URL("../..", import.meta.url));
const argv = process.argv.slice(2);
const flag = (n, d) => {
  const i = argv.indexOf(n);
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith("-") ? argv[i + 1] : d;
};
const backends = flag("--backend", "webgpu,webgl2").split(",").map((s) => s.trim());
const vp = flag("--viewport", "1440x900").split("x").map(Number);
const outDir = flag("--out", "/opt/cursor/artifacts/garage-frame");

mkdirSync(outDir, { recursive: true });

async function waitGarageInterior(page, backend) {
  await page.waitForFunction(() => {
    const c = window.__apex?.garageCam?.();
    return c && c.effDist > 4 && c.on;
  }, null, { polling: 100, timeout: 120000 });
  await settleGarage(page, { frames: 120 });
  if (backend === "webgpu") {
    await page.waitForFunction(async () => {
      if (typeof GLX?.awaitSoftPresent !== "function") return true;
      try { await GLX.awaitSoftPresent(20000); return true; } catch (_) { return false; }
    }, null, { polling: 200, timeout: 45000 });
  }
  // Reject flat team-tint wall frames (the Mercedes teal defect).
  for (let attempt = 0; attempt < 8; attempt++) {
    const diag = await garageDiagnostics(page);
    if (diag.overlay) throw new Error(`error overlay: ${diag.overlay}`);
    const sample = diag.gapSample?.pixels;
    const gate = assertGarageInterior(sample);
    if (gate.ok) return diag;
    await settleGarage(page, { frames: 30 });
    await sleep(400);
  }
  const final = await garageDiagnostics(page);
  const gate = assertGarageInterior(final.gapSample?.pixels);
  throw new Error(`garage interior gate failed: ${gate.reason} ${JSON.stringify(gate)}`);
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
  const diag = await waitGarageInterior(page, backend);
  const meta = {
    garageCam: diag.cam,
    backend: diag.backend,
    interior: assertGarageInterior(diag.gapSample?.pixels),
    aspect: diag.aspect,
    gpuErrors: diag.gpuErrors,
    canvas: await page.evaluate(() => {
      const c = document.getElementById("game");
      return c ? { w: c.clientWidth, h: c.clientHeight, bw: c.width, bh: c.height } : null;
    }),
  };
  const png = join(outDir, `garage-${backend}-${vp[0]}x${vp[1]}.png`);
  await screenshotGameCanvas(page, png);
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
