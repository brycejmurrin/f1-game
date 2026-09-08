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
import sharp from "sharp";
import { launchChromium, shutdown, startStaticServer, sleep } from "../lib/harness.mjs";
import { chromiumArgsForBackend } from "../capture/probe-page.mjs";

const argv = process.argv.slice(2);
const flag = (name, dflt) => {
  const i = argv.indexOf(name);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : dflt;
};
const team = flag("--team", "mclaren");
const views = flag("--views", "hero,front,side,rear,top,wingFront,wingRear").split(",").map((s) => s.trim()).filter(Boolean);
const vp = flag("--viewport", "1280x720").split("x").map(Number);
const outDir = flag("--out", "artifacts/garage-angles");

// "Did the BAY actually render?" — gate the CANVAS half of the frame only.
// The setup sheet is full of text and always has plenty of pixel spread, so a
// whole-frame check passes while the 3D canvas beside it is a blank white
// rectangle. That is not hypothetical: the first cut of this tool shipped a
// directory of blanks, and the second cut's gate was fooled by the sheet.
async function bayRendered(png, vpW) {
  const cut = Math.max(80, Math.round(vpW * 0.55));
  const st = await sharp(png).extract({ left: 0, top: 0, width: cut, height: (await sharp(png).metadata()).height }).stats();
  const spread = Math.max(...st.channels.map((c) => c.stdev));
  return { ok: spread > 8, spread: +spread.toFixed(2) };
}

async function frame(page, view) {
  const clicked = await page.evaluate((v) => {
    const b = document.querySelector('#cs-stack [data-cs-view="' + v + '"]');
    if (!b) return false;
    b.click();
    return true;
  }, view);
  if (!clicked) throw new Error(`no camera preset "${view}" in #cs-stack`);
  const png = join(outDir, `${team}-${view}.png`);
  let gate = null;
  for (let attempt = 0; attempt < 5; attempt++) {
    await sleep(attempt === 0 ? 900 : 700);
    await page.screenshot({ path: png, timeout: 60000 });
    gate = await bayRendered(png, vp[0]);
    if (gate.ok) {
      const cam = await page.evaluate(() => window.__apex.garageCam());
      return { view, png, spread: gate.spread, az: +cam.az.toFixed(3), el: +cam.el.toFixed(3), dist: +cam.effDist.toFixed(3) };
    }
  }
  throw new Error(`${view}: the bay never rendered (canvas pixel spread ${gate.spread})`);
}

async function main() {
  mkdirSync(outDir, { recursive: true });
  const srv = await startStaticServer(process.cwd());
  // WITHOUT the backend args the canvas never initialises WebGL and every
  // shot comes back a blank white rectangle — this box has no real GPU, so
  // the software-GL flags are not optional here.
  const browser = await launchChromium({ headless: true, args: chromiumArgsForBackend("webgl2") });
  const page = await browser.newPage();
  await page.setViewportSize({ width: vp[0], height: vp[1] });
  await page.goto(srv.url, { waitUntil: "commit", timeout: 120000 });
  await page.waitForFunction(() => window.__apex != null, null, { polling: 100, timeout: 120000 });
  // Team selection is STORED and read when the garage opens, so it is set and
  // the page reloaded — clicking through the team picker would be a second
  // source of truth for which car this is.
  const idx = await page.evaluate((t) => {
    const i = Teams.LIST.findIndex((x) => x.id === t);
    if (i >= 0) localStorage.setItem("apex26.team", String(i));
    return i;
  }, team);
  if (idx < 0) throw new Error(`no team "${team}" in Teams.LIST`);
  await page.reload({ waitUntil: "commit", timeout: 120000 });
  await page.waitForFunction(() => window.__apex != null, null, { polling: 100, timeout: 120000 });
  await page.evaluate(() => document.getElementById("mb-garage").click());
  await page.waitForFunction(() => {
    const el = document.getElementById("carsetup");
    return el && !el.hidden;
  }, null, { polling: 100, timeout: 60000 });
  await sleep(1800);
  const shown = await page.evaluate(() => {
    const h = document.querySelector("#carsetup .sheet-head, #cs-inner .sheet-head");
    return h ? h.textContent.trim().slice(0, 60) : null;
  });
  const shots = [];
  for (const v of views) {
    const s = await frame(page, v);
    shots.push(s);
    console.log(`shot ${s.view} az ${s.az} el ${s.el} dist ${s.dist} spread ${s.spread} -> ${s.png}`);
  }
  const meta = join(outDir, `${team}-angles.json`);
  writeFileSync(meta, JSON.stringify({ team, teamIdx: idx, sheetHead: shown, viewport: vp, shots }, null, 2));
  console.log(`wrote ${shots.length} angle(s) + ${meta}  [sheet: ${shown}]`);
  await browser.close();
}

main().then(() => shutdown()).catch((e) => { console.error(e); shutdown(); process.exit(1); });
