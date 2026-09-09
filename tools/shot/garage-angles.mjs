#!/usr/bin/env node
// @doc Garage camera-preset shots — ONE Chromium; optional --livery / --spine-side walks; --live hits github.io.
//   node tools/shot/garage-angles.mjs [--team=redbull] [--views=spine] [--livery=default,rb_white]
//     [--spine-side=logo,duo] [--spine-logo=…] [--zoom=8] [--pan=2,0] [--out=dir] [--live]
// @skill playwright-probe
// @skill garage-parts-livery
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
// `--livery` walks paint jobs via a store write (opening the LIVERY tab slams
// FRONT). `--spine-side` / `--spine-logo` walk DESIGN as custom ids on the
// team default paint. `--zoom` / `--pan` are counted clicks on #cs-view-in /
// #cs-pan-* so a framing that reads here is one a player can reach.
//
// `--live` loads https://brycejmurrin.github.io/f1-game/ (no local static
// server), defaults `--views=all`, writes labeled PNGs + a contact sheet.
//
// Capture prefers #game-soft via screenshotGameCanvas — page.screenshot hangs
// under SwiftShader (document.fonts.ready after freeze).
import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { launchChromium, shutdown, startStaticServer } from "../lib/harness.mjs";
import {
  chromiumArgsForBackend, installProbeInit, gotoGame, openGarage, settleGarage,
  screenshotGameCanvas,
} from "../capture/probe-page.mjs";

const LIVE_BASE = "https://brycejmurrin.github.io/f1-game/";
const argv = process.argv.slice(2);
const isLive = argv.includes("--live");
/** Accept `--name=value` and `--name value` (render-car style). */
const flag = (name, dflt) => {
  const eq = argv.find((a) => a.startsWith(name + "="));
  if (eq) return eq.slice(name.length + 1) || dflt;
  const i = argv.indexOf(name);
  if (i >= 0 && argv[i + 1] && !argv[i + 1].startsWith("-")) return argv[i + 1];
  return dflt;
};
const team = flag("--team", "mclaren");
const liveries = flag("--livery", "default").split(",").map((s) => s.trim()).filter(Boolean);
const spineSides = (flag("--spine-side", "") || "").split(",").map((s) => s.trim()).filter(Boolean);
const spineLogos = (flag("--spine-logo", "") || "").split(",").map((s) => s.trim()).filter(Boolean);
const vp = flag("--viewport", "1280x720").split("x").map(Number);
const outDir = flag("--out", isLive ? "artifacts/garage-angles-live" : "artifacts/garage-angles");
const zoom = Number(flag("--zoom", isLive ? "6" : "0")) || 0;
const [strafe = 0, dolly = 0] = (flag("--pan", isLive ? "3,0" : "0,0")).split(",").map(Number);
const withLabels = !argv.includes("--no-labels");

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
const rawViews = flag("--views", isLive ? "all" : "spine").split(",").map((s) => s.trim()).filter(Boolean);
const views = [...new Set(rawViews.flatMap((v) => GROUPS[v] || [v]))];
const bad = views.filter((v) => !ALL.includes(v));
if (bad.length) {
  console.error(`Unknown view(s): ${bad.join(", ")}\nAvailable: ${ALL.join(", ")} + groups ${Object.keys(GROUPS).join(", ")}`);
  process.exit(1);
}

function escSvg(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");
}

/** Title + subtitle bar (helmet-sheet pattern). */
function labelSvg(title, sub, w, h) {
  return Buffer.from(
    `<svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg">
       <rect width="${w}" height="${h}" fill="#14161a"/>
       <text x="${w / 2}" y="${h * 0.46}" font-family="DejaVu Sans, sans-serif" font-size="${Math.round(h * 0.40)}"
             font-weight="700" fill="#f0f0f2" text-anchor="middle">${escSvg(title)}</text>
       <text x="${w / 2}" y="${h * 0.86}" font-family="DejaVu Sans, sans-serif" font-size="${Math.round(h * 0.30)}"
             fill="#9a9ca3" text-anchor="middle">${escSvg(sub)}</text>
     </svg>`);
}

/** Burn a caption bar under a capture; returns the labeled path. */
async function labelShot(pngPath, title, sub) {
  const meta = await sharp(pngPath).metadata();
  const labH = Math.max(40, Math.round(meta.height * 0.075));
  const labeled = pngPath.replace(/\.png$/, "-labeled.png");
  const bar = labelSvg(title, sub, meta.width, labH);
  await sharp(pngPath)
    .extend({ bottom: labH, background: { r: 20, g: 22, b: 26 } })
    .composite([{ input: bar, top: meta.height, left: 0 }])
    .png()
    .toFile(labeled);
  return labeled;
}

/** Grid of labeled captures — one PNG per design tag. */
async function buildContactSheet(shots, { team, tag, liveBuild, teamLabel }) {
  if (!shots.length) return null;
  const cols = Math.min(4, shots.length);
  const rows = Math.ceil(shots.length / cols);
  const cellW = 640;
  const cellH = 360;
  const labH = 44;
  const pad = 8;
  const tileW = cellW + pad * 2;
  const tileH = cellH + labH + pad;
  const W = cols * tileW;
  const H = rows * tileH;
  const buildNote = liveBuild != null ? ` · build ${liveBuild}` : "";
  const composites = [];
  for (let i = 0; i < shots.length; i++) {
    const s = shots[i];
    const gx = (i % cols) * tileW;
    const gy = Math.floor(i / cols) * tileH;
    const img = await sharp(s.png).resize(cellW, cellH, { fit: "cover" }).png().toBuffer();
    composites.push({ input: img, left: gx + pad, top: gy + pad });
    const sub = [
      teamLabel || team,
      s.liveryName || s.livery || tag,
      `az ${s.az} el ${s.el}`,
      buildNote.trim(),
    ].filter(Boolean).join(" · ");
    composites.push({
      input: labelSvg(s.view.toUpperCase(), sub, cellW, labH),
      left: gx + pad,
      top: gy + pad + cellH,
    });
  }
  const sheet = join(outDir, `${team}-${tag}-labeled-sheet.png`);
  await sharp({ create: { width: W, height: H, channels: 3, background: { r: 16, g: 17, b: 20 } } })
    .composite(composites)
    .png()
    .toFile(sheet);
  return sheet;
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

/** Discrete clicks — detail 0 is the keyboard path in holdSetupCtl (not hold-ramp). */
async function nudge(page, id, n) {
  if (!n) return;
  const ok = await page.evaluate(({ ctl, times }) => {
    const b = document.getElementById(ctl);
    if (!b) return false;
    for (let i = 0; i < times; i++) b.click();
    return true;
  }, { ctl: id, times: Math.abs(n) });
  if (!ok) throw new Error(`no camera control #${id}`);
}

async function frame(page, tag, view) {
  const clicked = await page.evaluate((v) => {
    const b = document.querySelector('#cs-stack [data-cs-view="' + v + '"]');
    if (!b) return false;
    b.click();
    return true;
  }, view);
  if (!clicked) throw new Error(`no camera preset "${view}" in #cs-stack`);
  // AFTER the preset: setSetupView is absolute and drops stored distance/pan.
  await nudge(page, zoom > 0 ? "cs-view-in" : "cs-view-out", zoom);
  await nudge(page, strafe > 0 ? "cs-pan-right" : "cs-pan-left", strafe);
  await nudge(page, dolly > 0 ? "cs-pan-fwd" : "cs-pan-back", dolly);
  await settleGarage(page, { frames: 6 });
  const png = join(outDir, `${team}-${tag}-${view}.png`);
  let gate = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt) await settleGarage(page, { frames: 4 });
    const shot = await screenshotGameCanvas(page, png);
    gate = await bayRendered(png, vp[0]);
    if (gate.ok) {
      const cam = await page.evaluate(() => window.__apex.garageCam());
      return {
        view, tag, png, spread: gate.spread, via: shot.via || "page-clip",
        az: +cam.az.toFixed(3), el: +cam.el.toFixed(3), dist: +cam.effDist.toFixed(3),
        pan: cam.pan ? cam.pan.map((n) => +n.toFixed(3)) : null,
      };
    }
  }
  throw new Error(`${tag}/${view}: the bay never rendered (canvas pixel spread ${gate.spread})`);
}

async function applyLivery(page, livId) {
  const got = await page.evaluate(({ teamId, id }) => {
    const t = Teams.LIST.find((x) => x.id === teamId);
    if (!t) return { ok: false, error: `no team "${teamId}"` };
    const list = Liveries.forTeam(t);
    if (!list.some((l) => l.id === id)) {
      return { ok: false, error: `no livery "${id}"`, have: list.map((l) => l.id) };
    }
    GameStore.store.set("livery." + teamId, id);
    return { ok: true, name: list.find((l) => l.id === id).name };
  }, { teamId: team, id: livId });
  if (!got.ok) {
    const extra = got.have ? ` (have ${got.have.join(",")})` : "";
    throw new Error(`${got.error}${extra}`);
  }
  await settleGarage(page, { frames: 12 });
  return got.name;
}

/** Custom id so mesh/atlas caches (keyed on getLiveryId) miss — design walk, not catalog. */
async function applyDesign(page, { spineSide, spineLogo }) {
  const got = await page.evaluate(({ teamId, side, logo }) => {
    const t = Teams.LIST.find((x) => x.id === teamId);
    if (!t) return { ok: false, error: `no team "${teamId}"` };
    const def = Liveries.forTeam(t)[0];
    const sides = (typeof LiveryTex !== "undefined" && LiveryTex.SPINE_SIDE_IDS) || [];
    const logos = (typeof LiveryTex !== "undefined" && LiveryTex.SPINE_LOGO_IDS) || [];
    if (side && sides.length && !sides.includes(side)) {
      return { ok: false, error: `no spineSide "${side}"`, have: sides };
    }
    if (logo && logos.length && !logos.includes(logo)) {
      return { ok: false, error: `no spineLogo "${logo}"`, have: logos };
    }
    const id = "_shot_" + (logo || def.spineLogo || "x") + "_" + (side || def.spineSide || "none");
    const liv = Object.assign({}, def, {
      id, name: id,
      spineSide: side || def.spineSide || "none",
    });
    if (logo) liv.spineLogo = logo;
    const customs = (GameStore.store.get("livery.custom." + teamId, []) || []).filter((l) => l.id !== id);
    customs.push(liv);
    GameStore.store.set("livery.custom." + teamId, customs);
    GameStore.store.set("livery." + teamId, id);
    if (typeof GarageScene !== "undefined" && GarageScene.dropPreviewMeshes) GarageScene.dropPreviewMeshes();
    return { ok: true, name: liv.spineLogo + "/" + liv.spineSide, id };
  }, { teamId: team, side: spineSide || "", logo: spineLogo || "" });
  if (!got.ok) {
    const extra = got.have ? ` (have ${got.have.join(",")})` : "";
    throw new Error(`${got.error}${extra}`);
  }
  await settleGarage(page, { frames: 12 });
  return got.name;
}

async function main() {
  mkdirSync(outDir, { recursive: true });
  let gameUrl;
  let liveBuild = null;
  if (isLive) {
    liveBuild = await fetch(LIVE_BASE + "version.json")
      .then((r) => r.json())
      .then((j) => j.build ?? null)
      .catch(() => null);
    gameUrl = LIVE_BASE;
    console.log(`live github.io — build ${liveBuild ?? "?"}`);
  } else {
    const srv = await startStaticServer(process.cwd());
    gameUrl = srv.url;
  }
  const t0 = Date.now();
  const browser = await launchChromium({ headless: true, args: chromiumArgsForBackend("webgl2") });
  try {
    const page = await browser.newPage();
    await page.setViewportSize({ width: vp[0], height: vp[1] });
    // Pin the INDEX before first paint — #mb-garage never re-reads the store.
    await installProbeInit(page, { backend: "webgl2", team: teamIdx });
    await gotoGame(page, gameUrl, 120000);
    // First paint already on the first --livery (or default).
    await page.evaluate(({ t, liv }) => {
      GameStore.store.set("livery." + t, liv);
    }, { t: team, liv: liveries[0] });
    await openGarage(page, { team });
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
    const sheets = [];
    const designs = spineSides.length
      ? (spineLogos.length ? spineLogos : [""]).flatMap((logo) =>
        spineSides.map((side) => ({ spineLogo: logo, spineSide: side })))
      : null;
    const buildNote = liveBuild != null ? `build ${liveBuild}` : "local tree";
    if (designs) {
      for (const d of designs) {
        const name = await applyDesign(page, d);
        const tag = (d.spineLogo || "def") + "-" + d.spineSide;
        const tagShots = [];
        for (const v of views) {
          const s = await frame(page, tag, v);
          s.liveryName = name;
          s.spineLogo = d.spineLogo || null;
          s.spineSide = d.spineSide;
          if (withLabels) {
            const sub = [name, buildNote, `dist ${s.dist}`].join(" · ");
            s.labeled = await labelShot(s.png, v.toUpperCase(), sub);
          }
          tagShots.push(s);
          shots.push(s);
          console.log(`shot ${tag}/${s.view} via=${s.via} az ${s.az} el ${s.el} dist ${s.dist} spread ${s.spread} -> ${s.png}${s.labeled ? " +" + s.labeled : ""}`);
        }
        if (withLabels) {
          const sheet = await buildContactSheet(tagShots, { team, tag, liveBuild, teamLabel });
          if (sheet) {
            sheets.push(sheet);
            console.log(`sheet ${tag} -> ${sheet}`);
          }
        }
      }
    } else {
      for (const liv of liveries) {
        const name = await applyLivery(page, liv);
        const tagShots = [];
        for (const v of views) {
          const s = await frame(page, liv, v);
          s.livery = liv;
          s.liveryName = name;
          if (withLabels) {
            const sub = [name, buildNote, `dist ${s.dist}`].join(" · ");
            s.labeled = await labelShot(s.png, v.toUpperCase(), sub);
          }
          tagShots.push(s);
          shots.push(s);
          console.log(`shot ${liv}/${s.view} via=${s.via} az ${s.az} el ${s.el} dist ${s.dist} spread ${s.spread} -> ${s.png}${s.labeled ? " +" + s.labeled : ""}`);
        }
        if (withLabels) {
          const sheet = await buildContactSheet(tagShots, { team, tag: liv, liveBuild, teamLabel });
          if (sheet) {
            sheets.push(sheet);
            console.log(`sheet ${liv} -> ${sheet}`);
          }
        }
      }
    }
    const meta = join(outDir, `${team}-angles.json`);
    writeFileSync(meta, JSON.stringify({
      team, teamIdx, liveries, spineSides, spineLogos, live: isLive, liveBuild,
      zoom, pan: [strafe, dolly], sheetHead: shown, viewport: vp, views, shots, sheets,
      seconds: +((Date.now() - t0) / 1000).toFixed(1),
    }, null, 2));
    console.log(`wrote ${shots.length} angle(s) in ${((Date.now() - t0) / 1000).toFixed(1)}s + ${meta}  [sheet: ${shown}]`);
  } finally {
    await browser.close();
  }
}

main().then(() => shutdown()).catch((e) => { console.error(e); shutdown(); process.exit(1); });
