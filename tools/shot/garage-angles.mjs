#!/usr/bin/env node
// @doc Garage camera-preset shots for one team and optional --livery list — hero/front/side/rear/top/wings.
// @skill garage-parts-livery
//   node tools/shot/garage-angles.mjs [--team redbull] [--livery default,rb_white] [--views hero,side] [--out dir]
//
// The counterpart to garage-frame.mjs, which shoots ONE preset for a backend
// A/B. This one walks the CAMERA STACK for a single backend, which is what a
// "does the bay still read from every angle" pass needs: two shipped defects
// (wordmarks cut by a service gantry, a sign hidden inside its own fascia)
// were only ever visible from one preset each. `--livery` is the same walk
// across paint jobs — the mesh key includes getLiveryId, so a store write is
// enough; opening the LIVERY tab would also slam the camera to FRONT.
//
// Capture is screenshotGameCanvas (CDP clip of #game-soft, setup sheet faded).
// page.screenshot used to (a) include the sheet, which fooled the blank-bay
// gate, and (b) hang on document.fonts.ready after headless(true).
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";
import { launchChromium, shutdown, startStaticServer, sleep } from "../lib/harness.mjs";
import {
  chromiumArgsForBackend, screenshotGameCanvas, settleGarage,
} from "../capture/probe-page.mjs";

const argv = process.argv.slice(2);
const flag = (name, dflt) => {
  const i = argv.indexOf(name);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : dflt;
};
const team = flag("--team", "mclaren");
const liveries = flag("--livery", "default").split(",").map((s) => s.trim()).filter(Boolean);
const views = flag("--views", "hero,front,side,rear,top,wingFront,wingRear").split(",").map((s) => s.trim()).filter(Boolean);
const vp = flag("--viewport", "1280x720").split("x").map(Number);
const outDir = flag("--out", "artifacts/garage-angles");

// "Did the BAY actually render?" — the PNG is the presented canvas (sheet
// faded), so a whole-frame spread is the canvas, not the UI. The first cut of
// this tool shipped a directory of blanks; do not drop the gate.
async function bayRendered(png) {
  const st = await sharp(png).stats();
  const spread = Math.max(...st.channels.map((c) => c.stdev));
  return { ok: spread > 8, spread: +spread.toFixed(2) };
}

async function frame(page, liv, view) {
  const clicked = await page.evaluate((v) => {
    const b = document.querySelector('#cs-stack [data-cs-view="' + v + '"]');
    if (!b) return false;
    b.click();
    return true;
  }, view);
  if (!clicked) throw new Error(`no camera preset "${view}" in #cs-stack`);
  const png = join(outDir, `${team}-${liv}-${view}.png`);
  let gate = null;
  for (let attempt = 0; attempt < 5; attempt++) {
    await settleGarage(page, { frames: attempt === 0 ? 45 : 20 });
    await screenshotGameCanvas(page, png);
    gate = await bayRendered(png);
    if (gate.ok) {
      const cam = await page.evaluate(() => window.__apex.garageCam());
      return {
        view, livery: liv, png, spread: gate.spread,
        az: +cam.az.toFixed(3), el: +cam.el.toFixed(3), dist: +cam.effDist.toFixed(3),
      };
    }
  }
  throw new Error(`${liv}/${view}: the bay never rendered (canvas pixel spread ${gate.spread})`);
}

async function applyLivery(page, livId) {
  const got = await page.evaluate(({ teamId, id }) => {
    const t = Teams.LIST.find((x) => x.id === teamId);
    if (!t) return { ok: false, error: `no team "${teamId}"` };
    const list = Liveries.forTeam(t);
    if (!list.some((l) => l.id === id)) {
      return { ok: false, error: `no livery "${id}"`, have: list.map((l) => l.id) };
    }
    // saveLiveryId is a store write; G is not a global (module façade only).
    GameStore.store.set("livery." + teamId, id);
    return { ok: true, name: list.find((l) => l.id === id).name };
  }, { teamId: team, id: livId });
  if (!got.ok) {
    const extra = got.have ? ` (have ${got.have.join(",")})` : "";
    throw new Error(`${got.error}${extra}`);
  }
  await settleGarage(page, { frames: 60 });
  return got.name;
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
  // source of truth for which car this is. Livery is the same store; pin the
  // first scheme before reload so the first mesh is already the right paint.
  const idx = await page.evaluate(({ t, liv }) => {
    const i = Teams.LIST.findIndex((x) => x.id === t);
    if (i >= 0) {
      GameStore.store.set("team", i);
      GameStore.store.set("livery." + t, liv);
    }
    return i;
  }, { t: team, liv: liveries[0] });
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
  for (const liv of liveries) {
    const name = await applyLivery(page, liv);
    for (const v of views) {
      const s = await frame(page, liv, v);
      s.liveryName = name;
      shots.push(s);
      console.log(`shot ${liv}/${s.view} az ${s.az} el ${s.el} dist ${s.dist} spread ${s.spread} -> ${s.png}`);
    }
  }
  const meta = join(outDir, `${team}-angles.json`);
  writeFileSync(meta, JSON.stringify({ team, teamIdx: idx, liveries, sheetHead: shown, viewport: vp, shots }, null, 2));
  console.log(`wrote ${shots.length} angle(s) + ${meta}  [sheet: ${shown}]`);
  await browser.close();
  await srv.close();
}

main().then(() => shutdown()).catch((e) => { console.error(e); shutdown(); process.exit(1); });
