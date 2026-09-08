#!/usr/bin/env node
// @doc Garage camera-preset screenshots for one team — hero/front/side/rear/top/wingFront/wingRear in one run.
//   node tools/shot/garage-angles.mjs [--team mclaren] [--views hero,side] [--viewport 1280x720] [--out dir]
//
// The counterpart to garage-frame.mjs, which shoots ONE preset for a backend
// A/B. This one walks the CAMERA STACK for a single backend, which is what a
// "does the bay still read from every angle" pass needs: two shipped defects
// (wordmarks cut by a service gantry, a sign hidden inside its own fascia)
// were only ever visible from one preset each. It reuses the same harness and
// the same page helpers rather than driving Playwright by hand — openGarage
// already retries the title flyby, and screenshotGameCanvas already hides the
// setup sheet so the shot is the bay, not the UI.
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { launchChromium, shutdown, startStaticServer, sleep } from "../lib/harness.mjs";
import { installProbeInit, gotoGame, openGarage, settleGarage, screenshotGameCanvas } from "../capture/probe-page.mjs";

const argv = process.argv.slice(2);
const flag = (name, dflt) => {
  const i = argv.indexOf(name);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : dflt;
};
const team = flag("--team", "mclaren");
const views = flag("--views", "hero,front,side,rear,top,wingFront,wingRear").split(",").map((s) => s.trim()).filter(Boolean);
const vp = flag("--viewport", "1280x720").split("x").map(Number);
const outDir = flag("--out", "artifacts/garage-angles");

// A preset that does not exist would otherwise shoot the previous angle twice
// and read as "the camera button is broken" — say so instead.
async function frame(page, view) {
  const clicked = await page.evaluate((v) => {
    const b = document.querySelector('#cs-stack [data-cs-view="' + v + '"]');
    if (!b) return false;
    b.click();
    return true;
  }, view);
  if (!clicked) throw new Error(`no camera preset "${view}" in #cs-stack`);
  await settleGarage(page, { frames: 30 });
  await sleep(500);
  const png = join(outDir, `${team}-${view}.png`);
  await screenshotGameCanvas(page, png);
  const cam = await page.evaluate(() => window.__apex.garageCam());
  return { view, png, az: +cam.az.toFixed(3), el: +cam.el.toFixed(3), dist: +cam.effDist.toFixed(3) };
}

async function main() {
  mkdirSync(outDir, { recursive: true });
  const srv = await startStaticServer(process.cwd());
  const browser = await launchChromium({ headless: true });
  const page = await browser.newPage();
  await page.setViewportSize({ width: vp[0], height: vp[1] });
  await installProbeInit(page, {});
  await gotoGame(page, srv.url);
  await openGarage(page, { team });
  await settleGarage(page, { frames: 60 });
  const shots = [];
  for (const v of views) {
    const s = await frame(page, v);
    shots.push(s);
    console.log(`shot ${s.view} az ${s.az} el ${s.el} dist ${s.dist} -> ${s.png}`);
  }
  const meta = join(outDir, `${team}-angles.json`);
  writeFileSync(meta, JSON.stringify({ team, viewport: vp, shots }, null, 2));
  console.log(`wrote ${shots.length} angle(s) + ${meta}`);
  await browser.close();
}

main().then(() => shutdown()).catch((e) => { console.error(e); shutdown(); process.exit(1); });
