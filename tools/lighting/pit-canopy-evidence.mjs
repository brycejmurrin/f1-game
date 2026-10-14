#!/usr/bin/env node
// Pit-canopy A/B on Bahrain night (pit straight) + lightState slot counts.
// @doc Bahrain pit night A/B: canopy lamps on vs patched off; PNGs + lightState under artifacts/pit-canopy-night/.
// Before = canopy registerLamp disabled via in-memory serve patch (no repo edit).
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { launchChromium, sleep, startStaticServer } from "../lib/harness.mjs";
import { awaitPresentedFrame, screenshotPresentedCanvas } from "../shot/probe-page.mjs";

const ROOT = fileURLToPath(new URL("../..", import.meta.url)).replace(/[\\/]$/, "");
const OUT = "/opt/cursor/artifacts/pit-canopy-night";
const PATCH_FIND = "if ((i & 1) === 0 && i + 1 < count && typeof ctx.registerLamp === \"function\")";
const PATCH_OFF = "if (false && (i & 1) === 0 && i + 1 < count && typeof ctx.registerLamp === \"function\")";

async function server(off) {
  return startStaticServer(ROOT, {
    route: (req, res, url) => {
      if (!off || url.pathname !== "/js/track/scenery/pits.js") return false;
      let body = readFileSync(`${ROOT}/js/track/scenery/pits.js`, "utf8");
      if (!body.includes(PATCH_FIND)) { res.writeHead(500).end("patch find missing"); return true; }
      body = body.replace(PATCH_FIND, PATCH_OFF);
      res.writeHead(200, { "Content-Type": "application/javascript" });
      res.end(body);
      return true;
    },
  });
}

async function capture(browser, port, tag) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  await page.goto(`http://127.0.0.1:${port}/`);
  for (let i = 0; i < 120 && !(await page.evaluate(() => !!window.__apex)); i++) await sleep(250);
  await page.evaluate(() => {
    try { localStorage.setItem("apex26.gfxBackend", "webgl2"); } catch (_) { /* no storage */ }
  });
  const state = await page.evaluate(async () => {
    const a = window.__apex;
    a.setTimeOfDay("night");
    a.weather("dry");
    if (a.tyres) a.tyres({ level: "real" });
    a.race("bahrain");
    for (let i = 0; i < 80; i++) {
      if (a.info().track === "bahrain") break;
      await new Promise((r) => setTimeout(r, 100));
    }
    a.go();
    a.freeze(true);
    const p = a.pit();
    const r = a.info();
    const L = r.lapLen || r.total || 5400;
    const sMid = p.atM + p.lenM * 0.48;
    const frac = ((sMid % L) + L) % L / L;
    const laneX = p.laneX != null ? p.laneX : 0;
    const driveX = p.driveX != null ? p.driveX : laneX;
    a.jump(frac, 0, driveX);
    for (let i = 0; i < 24; i++) a.step(1 / 60, 1);
    a.eyeAt(frac, driveX, 2.0, frac + 0.003, laneX, 1.0);
    for (let i = 0; i < 12; i++) a.step(1 / 60, 1);
    const ls = a.lightState();
    let pitLamps = 0;
    const tr = window.Game && window.Game.track;
    if (tr && tr.lampPosts) pitLamps = tr.lampPosts.filter((l) => l.pit && !l.entry).length;
    return {
      frac: +frac.toFixed(4),
      lightState: {
        numLights: ls.numLights,
        lampPosts: ls.lampPosts,
        bakedLights: ls.bakedLights,
        lampCull: ls.lampCull,
        mobileTier: ls.mobileTier,
      },
      pitLamps,
      maxLights: typeof gfx !== "undefined" && gfx.maxLights ? gfx.maxLights() : null,
    };
  });
  await sleep(300);
  await awaitPresentedFrame(page);
  const shot = `${OUT}/bahrain-pit-straight-${tag}.png`;
  await screenshotPresentedCanvas(page, { path: shot, skipAwait: true, timeout: 90000 });
  await page.close();
  return { shot, ...state };
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  const browser = await launchChromium({
    args: ["--use-angle=swiftshader", "--enable-unsafe-webgpu", "--disable-background-timer-throttling"],
  });
  const offSrv = await server(true);
  const before = await capture(browser, offSrv.port, "before-no-canopy-lamps");
  await offSrv.close();

  const onSrv = await server(false);
  const after = await capture(browser, onSrv.port, "after-canopy-lamps");
  await onSrv.close();

  const report = { track: "bahrain", tod: "night", before, after };
  writeFileSync(`${OUT}/light-state.json`, JSON.stringify(report, null, 2));
  await browser.close();
  console.log(JSON.stringify(report, null, 2));
}

main().catch((e) => { console.error(e); process.exit(1); });
