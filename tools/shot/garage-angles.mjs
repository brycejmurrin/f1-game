#!/usr/bin/env node
// @doc Garage camera-preset screenshots for one team — many views, ONE Chromium.
//   node tools/shot/garage-angles.mjs [--team=redbull] [--views=spine] [--viewport=1280x720] [--out=dir]
//
// Counterpart to garage-frame.mjs (one preset × backend A/B). This walks the
// CAMERA STACK on a single backend: open once, click each preset, soft-present
// capture each frame. Two shipped defects (wordmarks vs gantry, sunk signs)
// were only visible from one angle each.
//
// Views: hero,front,side,rear,top,wingFront,wingRear — or groups:
//   spine  = hero,top,rear,side   (engine-cover crown / SPINE TOP)
//   all    = every preset
//
// Capture prefers #game-soft toDataURL (HeadlessChrome soft-present) via
// screenshotGameCanvas — full-page screenshots hang under SwiftShader.
import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { launchChromium, shutdown, startStaticServer } from "../lib/harness.mjs";
import {
  chromiumArgsForBackend, installProbeInit, gotoGame, openGarage, settleGarage,
  screenshotGameCanvas,
} from "../capture/probe-page.mjs";

const argv = process.argv.slice(2);
/** Accept `--name=value` and `--name value` (render-car style). */
const flag = (name, dflt) => {
  const eq = argv.find((a) => a.startsWith(name + "="));
  if (eq) return eq.slice(name.length + 1) || dflt;
  const i = argv.indexOf(name);
  if (i >= 0 && argv[i + 1] && !argv[i + 1].startsWith("-")) return argv[i + 1];
  return dflt;
};
const team = flag("--team", "mclaren");
const vp = flag("--viewport", "1280x720").split("x").map(Number);
const outDir = flag("--out", "artifacts/garage-angles");

/** Roster order == store.team index (game.js boot). */
function teamIndex(id) {
  const src = readFileSync(fileURLToPath(new URL("../../js/data/teams.js", import.meta.url)), "utf8");
  const ids = Array.from(src.matchAll(/^ *id: "([a-z]+)",/gm)).map((m) => m[1]);
  const i = ids.indexOf(id);
  if (i < 0) {
    console.error(`no team "${id}" — available: ${ids.join(", ")}`);
    process.exit(1);
  }
  return i;
}
const teamIdx = teamIndex(team);

const ALL = ["hero", "front", "side", "rear", "top", "wingFront", "wingRear"];
const GROUPS = {
  spine: ["hero", "top", "rear", "side"],
  all: ALL,
};
const rawViews = flag("--views", "spine").split(",").map((s) => s.trim()).filter(Boolean);
const views = [...new Set(rawViews.flatMap((v) => GROUPS[v] || [v]))];
const bad = views.filter((v) => !ALL.includes(v));
if (bad.length) {
  console.error(`Unknown view(s): ${bad.join(", ")}\nAvailable: ${ALL.join(", ")} + groups ${Object.keys(GROUPS).join(", ")}`);
  process.exit(1);
}

/** Gate the CANVAS half only — the setup sheet always has text spread. */
async function bayRendered(png, vpW) {
  const cut = Math.max(80, Math.round(vpW * 0.55));
  const st = await sharp(png).extract({
    left: 0, top: 0, width: cut, height: (await sharp(png).metadata()).height,
  }).stats();
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
  // setSetupView already stops the turntable; soft-present await is the real
  // settle — a few steps are enough between presets on one Chromium.
  await settleGarage(page, { frames: 6 });
  const png = join(outDir, `${team}-${view}.png`);
  let gate = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt) await settleGarage(page, { frames: 4 });
    const shot = await screenshotGameCanvas(page, png);
    gate = await bayRendered(png, vp[0]);
    if (gate.ok) {
      const cam = await page.evaluate(() => window.__apex.garageCam());
      return {
        view, png, spread: gate.spread, via: shot.via || "page-clip",
        az: +cam.az.toFixed(3), el: +cam.el.toFixed(3), dist: +cam.effDist.toFixed(3),
      };
    }
  }
  throw new Error(`${view}: the bay never rendered (canvas pixel spread ${gate.spread})`);
}

async function main() {
  mkdirSync(outDir, { recursive: true });
  const srv = await startStaticServer(process.cwd());
  const t0 = Date.now();
  const browser = await launchChromium({ headless: true, args: chromiumArgsForBackend("webgl2") });
  try {
    const page = await browser.newPage();
    await page.setViewportSize({ width: vp[0], height: vp[1] });
    // Pin the INDEX before first paint — #mb-garage never re-reads the store.
    await installProbeInit(page, { backend: "webgl2", team: teamIdx });
    await gotoGame(page, srv.url, 120000);
    await openGarage(page, { team });
    // TEAM-tab path updates live teamIdx if boot somehow missed the pin.
    const switched = await page.evaluate((id) => {
      const t = Teams.LIST.find((x) => x.id === id);
      if (!t) throw new Error("unknown team " + id);
      const head = document.getElementById("cs-team");
      if (head && head.textContent === t.name.toUpperCase()) return false;
      document.querySelector('#cs-tabs [data-cs-cat="team"]')?.click();
      document.getElementById("cs-team-card")?.click();
      const tiles = document.querySelectorAll("#sel-teams .team-tile");
      const i = Teams.LIST.indexOf(t);
      if (!tiles[i]) throw new Error("no team tile for " + id);
      tiles[i].click();
      return true;
    }, team);
    if (switched) {
      await page.waitForFunction(() => {
        const tp = document.getElementById("teampicker");
        return !tp || tp.hidden || getComputedStyle(tp).display === "none";
      }, null, { polling: 100, timeout: 15000 }).catch(() => {});
    }
    await settleGarage(page, { frames: 12 });
    const shown = await page.evaluate(() => {
      const h = document.querySelector("#carsetup .sheet-head, #cs-inner .sheet-head");
      return h ? h.textContent.trim().slice(0, 80) : null;
    });
    const teamLabel = await page.evaluate(() => document.getElementById("cs-team")?.textContent || "");
    if (!teamLabel) throw new Error(`garage opened but #cs-team empty (sheet: ${shown})`);
    console.log(`team sheet: ${teamLabel}  [switched=${switched}]`);
    const shots = [];
    for (const v of views) {
      const s = await frame(page, v);
      shots.push(s);
      console.log(`shot ${s.view} via=${s.via} az ${s.az} el ${s.el} dist ${s.dist} spread ${s.spread} -> ${s.png}`);
    }
    const meta = join(outDir, `${team}-angles.json`);
    writeFileSync(meta, JSON.stringify({
      team, teamIdx, sheetHead: shown, viewport: vp, views, shots,
      seconds: +((Date.now() - t0) / 1000).toFixed(1),
    }, null, 2));
    console.log(`wrote ${shots.length} angle(s) in ${((Date.now() - t0) / 1000).toFixed(1)}s + ${meta}  [sheet: ${shown}]`);
  } finally {
    await browser.close();
  }
}

main().then(() => shutdown()).catch((e) => { console.error(e); shutdown(); process.exit(1); });
