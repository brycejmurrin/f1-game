#!/usr/bin/env node
// @doc Garage camera shots — livery/spine walks, --combo presets, --team=all, --live github.io.
//   node tools/shot/garage-angles.mjs [--team=redbull|all] [--combo=wrap-spine] [--live]
//     [--spine-logo=wrap] [--spine-side=duo] [--views=spine] [--zoom=8] [--pan=5,0] [--out=dir]
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
// `--combo` bundles spine-logo / spine-side / views / zoom / pan for common
// surveys (explicit flags override). `--team=all` walks every roster team in
// ONE Chromium and writes a rollup sheet of the combo's hero view per team.
//
// `--live` loads github.io, defaults `--views=all`, labeled PNGs + sheets.
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

/** Bundled surveys — explicit CLI flags override any field. */
const COMBOS = {
  "wrap-spine": {
    spineLogo: "wrap",
    spineSide: "none",
    views: "spine",
    zoom: 8,
    pan: "5,0",
    rollupView: "side",
  },
  "wrap-duo": {
    spineLogo: "wrap",
    spineSide: "duo",
    views: "spine",
    zoom: 6,
    pan: "3,0",
    rollupView: "side",
  },
  "wrap-side": {
    spineLogo: "wrap",
    spineSide: "logo",
    views: "side",
    zoom: 8,
    pan: "5,0",
    rollupView: "side",
  },
};

/** Accept `--name=value` and `--name value` (render-car style). */
const flag = (name, dflt) => {
  const eq = argv.find((a) => a.startsWith(name + "="));
  if (eq) return eq.slice(name.length + 1) || dflt;
  const i = argv.indexOf(name);
  if (i >= 0 && argv[i + 1] && !argv[i + 1].startsWith("-")) return argv[i + 1];
  return dflt;
};
const hasFlag = (name) => argv.some((a) => a === name || a.startsWith(name + "="));

const comboKey = flag("--combo", "");
const combo = COMBOS[comboKey] || null;
if (comboKey && !combo) {
  console.error(`unknown --combo "${comboKey}" — have: ${Object.keys(COMBOS).join(", ")}`);
  process.exit(1);
}

const teamArg = flag("--team", "mclaren");
const liveries = flag("--livery", "default").split(",").map((s) => s.trim()).filter(Boolean);
const spineSides = (hasFlag("--spine-side") ? flag("--spine-side", "") : (combo?.spineSide ?? ""))
  .split(",").map((s) => s.trim()).filter(Boolean);
const spineLogos = (hasFlag("--spine-logo") ? flag("--spine-logo", "") : (combo?.spineLogo ?? ""))
  .split(",").map((s) => s.trim()).filter(Boolean);
const vp = flag("--viewport", "1280x720").split("x").map(Number);
const outDir = flag("--out", isLive ? "artifacts/garage-angles-live" : "artifacts/garage-angles");
const viewsDefault = combo?.views ?? (isLive ? "all" : "spine");
const rawViews = flag("--views", viewsDefault).split(",").map((s) => s.trim()).filter(Boolean);
const zoomDefault = combo?.zoom ?? (isLive ? 6 : 0);
const panDefault = combo?.pan ?? (isLive ? "3,0" : "0,0");
const zoom = Number(hasFlag("--zoom") ? flag("--zoom", "0") : String(zoomDefault)) || 0;
const [strafe = 0, dolly = 0] = (hasFlag("--pan") ? flag("--pan", "0,0") : panDefault).split(",").map(Number);
const withLabels = isLive ? !argv.includes("--no-labels") : argv.includes("--labels");
const rollupView = flag("--rollup-view", combo?.rollupView || "side");

/** Roster order == store.team index (game.js boot). */
function rosterIds() {
  const src = readFileSync(fileURLToPath(new URL("../../js/data/teams.js", import.meta.url)), "utf8");
  return Array.from(src.matchAll(/^ *id: "([a-z]+)",/gm)).map((m) => m[1]);
}

function teamIndex(id) {
  const ids = rosterIds();
  const i = ids.indexOf(id);
  if (i < 0) {
    console.error(`no team "${id}" — available: ${ids.join(", ")}`);
    process.exit(1);
  }
  return i;
}

function parseTeams(arg) {
  const ids = rosterIds();
  if (arg === "all") return ids;
  const picked = arg.split(",").map((s) => s.trim()).filter(Boolean);
  for (const id of picked) {
    if (!ids.includes(id)) {
      console.error(`no team "${id}" — available: ${ids.join(", ")}`);
      process.exit(1);
    }
  }
  return picked;
}

const teams = parseTeams(teamArg);
const multiTeam = teams.length > 1;

const ALL = ["hero", "front", "side", "rear", "top", "wingFront", "wingRear"];
const GROUPS = {
  spine: ["hero", "top", "rear", "side"],
  all: ALL,
};
const views = [...new Set(rawViews.flatMap((v) => GROUPS[v] || [v]))];
const bad = views.filter((v) => !ALL.includes(v));
if (bad.length) {
  console.error(`Unknown view(s): ${bad.join(", ")}\nAvailable: ${ALL.join(", ")} + groups ${Object.keys(GROUPS).join(", ")}`);
  process.exit(1);
}

function escSvg(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");
}

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

async function buildContactSheet(shots, { teamId, tag, liveBuild, teamLabel, suffix = "" }) {
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
      teamLabel || teamId,
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
  const sheet = join(outDir, `${teamId}-${tag}${suffix}-labeled-sheet.png`);
  await sharp({ create: { width: W, height: H, channels: 3, background: { r: 16, g: 17, b: 20 } } })
    .composite(composites)
    .png()
    .toFile(sheet);
  return sheet;
}

/** One cell per team — the combo rollup (e.g. zoomed wrap side on every car). */
async function buildTeamRollup(entries, { comboName, liveBuild, view }) {
  if (!entries.length) return null;
  const cols = Math.min(4, entries.length);
  const rows = Math.ceil(entries.length / cols);
  const cellW = 480;
  const cellH = 270;
  const labH = 40;
  const pad = 6;
  const tileW = cellW + pad * 2;
  const tileH = cellH + labH + pad;
  const W = cols * tileW;
  const H = rows * tileH;
  const buildNote = liveBuild != null ? `build ${liveBuild}` : "local";
  const composites = [];
  for (let i = 0; i < entries.length; i++) {
    const e = entries[i];
    const gx = (i % cols) * tileW;
    const gy = Math.floor(i / cols) * tileH;
    const img = await sharp(e.png).resize(cellW, cellH, { fit: "cover" }).png().toBuffer();
    composites.push({ input: img, left: gx + pad, top: gy + pad });
    composites.push({
      input: labelSvg(e.teamLabel || e.teamId.toUpperCase(), `${view} · ${e.design} · ${buildNote}`, cellW, labH),
      left: gx + pad,
      top: gy + pad + cellH,
    });
  }
  const tag = comboName || "survey";
  const sheet = join(outDir, `all-teams-${tag}-${view}-rollup.png`);
  await sharp({ create: { width: W, height: H, channels: 3, background: { r: 16, g: 17, b: 20 } } })
    .composite(composites)
    .png()
    .toFile(sheet);
  return sheet;
}

async function bayRendered(png, vpW) {
  const cut = Math.max(80, Math.round(vpW * 0.55));
  const st = await sharp(png).extract({
    left: 0, top: 0, width: cut, height: (await sharp(png).metadata()).height,
  }).stats();
  const spread = Math.max(...st.channels.map((c) => c.stdev));
  return { ok: spread > 8, spread: +spread.toFixed(2) };
}

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

async function frame(page, teamId, tag, view) {
  const clicked = await page.evaluate((v) => {
    const b = document.querySelector('#cs-stack [data-cs-view="' + v + '"]');
    if (!b) return false;
    b.click();
    return true;
  }, view);
  if (!clicked) throw new Error(`no camera preset "${view}" in #cs-stack`);
  await nudge(page, zoom > 0 ? "cs-view-in" : "cs-view-out", zoom);
  await nudge(page, strafe > 0 ? "cs-pan-right" : "cs-pan-left", strafe);
  await nudge(page, dolly > 0 ? "cs-pan-fwd" : "cs-pan-back", dolly);
  await settleGarage(page, { frames: 6 });
  const png = join(outDir, `${teamId}-${tag}-${view}.png`);
  let gate = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt) await settleGarage(page, { frames: 4 });
    const shot = await screenshotGameCanvas(page, png);
    gate = await bayRendered(png, vp[0]);
    if (gate.ok) {
      const cam = await page.evaluate(() => window.__apex.garageCam());
      return {
        view, tag, teamId, png, spread: gate.spread, via: shot.via || "page-clip",
        az: +cam.az.toFixed(3), el: +cam.el.toFixed(3), dist: +cam.effDist.toFixed(3),
        pan: cam.pan ? cam.pan.map((n) => +n.toFixed(3)) : null,
      };
    }
  }
  throw new Error(`${teamId}/${tag}/${view}: the bay never rendered (canvas pixel spread ${gate.spread})`);
}

async function applyLivery(page, teamId, livId) {
  const got = await page.evaluate(({ tid, id }) => {
    const t = Teams.LIST.find((x) => x.id === tid);
    if (!t) return { ok: false, error: `no team "${tid}"` };
    const list = Liveries.forTeam(t);
    if (!list.some((l) => l.id === id)) {
      return { ok: false, error: `no livery "${id}"`, have: list.map((l) => l.id) };
    }
    GameStore.store.set("livery." + tid, id);
    return { ok: true, name: list.find((l) => l.id === id).name };
  }, { tid: teamId, id: livId });
  if (!got.ok) {
    const extra = got.have ? ` (have ${got.have.join(",")})` : "";
    throw new Error(`${got.error}${extra}`);
  }
  await settleGarage(page, { frames: 12 });
  return got.name;
}

async function applyDesign(page, teamId, { spineSide, spineLogo }) {
  const got = await page.evaluate(({ tid, side, logo }) => {
    const t = Teams.LIST.find((x) => x.id === tid);
    if (!t) return { ok: false, error: `no team "${tid}"` };
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
    const customs = (GameStore.store.get("livery.custom." + tid, []) || []).filter((l) => l.id !== id);
    customs.push(liv);
    GameStore.store.set("livery.custom." + tid, customs);
    GameStore.store.set("livery." + tid, id);
    if (typeof GarageScene !== "undefined" && GarageScene.dropPreviewMeshes) GarageScene.dropPreviewMeshes();
    return { ok: true, name: liv.spineLogo + "/" + liv.spineSide, id };
  }, { tid: teamId, side: spineSide || "", logo: spineLogo || "" });
  if (!got.ok) {
    const extra = got.have ? ` (have ${got.have.join(",")})` : "";
    throw new Error(`${got.error}${extra}`);
  }
  await settleGarage(page, { frames: 12 });
  return got.name;
}

async function switchTeam(page, teamId) {
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
  }, teamId);
  if (switched) {
    await page.waitForFunction(() => {
      const tp = document.getElementById("teampicker");
      return !tp || tp.hidden || getComputedStyle(tp).display === "none";
    }, null, { polling: 100, timeout: 15000 }).catch(() => {});
    await settleGarage(page, { frames: 12 });
  }
  const teamLabel = await page.evaluate(() => document.getElementById("cs-team")?.textContent || "");
  if (!teamLabel) throw new Error(`garage opened but #cs-team empty after switch to ${teamId}`);
  return teamLabel;
}

async function captureDesigns(page, teamId, teamLabel, { liveBuild, rollupEntries }) {
  const shots = [];
  const sheets = [];
  const buildNote = liveBuild != null ? `build ${liveBuild}` : "local tree";
  const designs = spineSides.length
    ? (spineLogos.length ? spineLogos : [""]).flatMap((logo) =>
      spineSides.map((side) => ({ spineLogo: logo, spineSide: side })))
    : null;

  if (designs) {
    for (const d of designs) {
      const name = await applyDesign(page, teamId, d);
      const tag = (d.spineLogo || "def") + "-" + d.spineSide;
      const tagShots = [];
      for (const v of views) {
        const s = await frame(page, teamId, tag, v);
        s.liveryName = name;
        s.spineLogo = d.spineLogo || null;
        s.spineSide = d.spineSide;
        if (withLabels) {
          const sub = [name, buildNote, `dist ${s.dist}`].join(" · ");
          s.labeled = await labelShot(s.png, v.toUpperCase(), sub);
        }
        tagShots.push(s);
        shots.push(s);
        console.log(`shot ${teamId}/${tag}/${s.view} via=${s.via} az ${s.az} el ${s.el} dist ${s.dist} -> ${s.png}${s.labeled ? " +" + s.labeled : ""}`);
      }
      if (rollupEntries && views.includes(rollupView)) {
        const pick = tagShots.find((s) => s.view === rollupView);
        if (pick) {
          rollupEntries.push({
            teamId, teamLabel, design: name, png: pick.png, view: rollupView,
          });
        }
      }
      if (withLabels) {
        const sheet = await buildContactSheet(tagShots, { teamId, tag, liveBuild, teamLabel });
        if (sheet) {
          sheets.push(sheet);
          console.log(`sheet ${teamId}/${tag} -> ${sheet}`);
        }
      }
    }
  } else {
    for (const liv of liveries) {
      const name = await applyLivery(page, teamId, liv);
      const tagShots = [];
      for (const v of views) {
        const s = await frame(page, teamId, liv, v);
        s.livery = liv;
        s.liveryName = name;
        if (withLabels) {
          const sub = [name, buildNote, `dist ${s.dist}`].join(" · ");
          s.labeled = await labelShot(s.png, v.toUpperCase(), sub);
        }
        tagShots.push(s);
        shots.push(s);
        console.log(`shot ${teamId}/${liv}/${s.view} via=${s.via} az ${s.az} el ${s.el} dist ${s.dist} -> ${s.png}${s.labeled ? " +" + s.labeled : ""}`);
      }
      if (withLabels) {
        const sheet = await buildContactSheet(tagShots, { teamId, tag: liv, liveBuild, teamLabel });
        if (sheet) sheets.push(sheet);
      }
    }
  }
  return { shots, sheets };
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
  if (combo) console.log(`combo ${comboKey}: logo=${combo.spineLogo} side=${combo.spineSide} views=${views.join(",")} zoom=${zoom} pan=${strafe},${dolly}`);
  if (multiTeam) console.log(`teams (${teams.length}): ${teams.join(", ")}`);

  const t0 = Date.now();
  const browser = await launchChromium({ headless: true, args: chromiumArgsForBackend("webgl2") });
  const allShots = [];
  const allSheets = [];
  const rollupEntries = multiTeam ? [] : null;
  try {
    const page = await browser.newPage();
    await page.setViewportSize({ width: vp[0], height: vp[1] });
    const bootTeam = teams[0];
    await installProbeInit(page, { backend: "webgl2", team: teamIndex(bootTeam) });
    await gotoGame(page, gameUrl, 120000);
    await page.evaluate(({ t, liv }) => {
      GameStore.store.set("livery." + t, liv);
    }, { t: bootTeam, liv: liveries[0] });
    await openGarage(page, { team: bootTeam });

    for (const tid of teams) {
      const teamLabel = await switchTeam(page, tid);
      console.log(`team sheet: ${teamLabel}`);
      const { shots, sheets } = await captureDesigns(page, tid, teamLabel, { liveBuild, rollupEntries });
      allShots.push(...shots);
      allSheets.push(...sheets);
    }

    let teamRollup = null;
    if (rollupEntries && rollupEntries.length) {
      teamRollup = await buildTeamRollup(rollupEntries, {
        comboName: comboKey || "survey",
        liveBuild,
        view: rollupView,
      });
      console.log(`rollup (${rollupEntries.length} teams, ${rollupView}) -> ${teamRollup}`);
    }

    const meta = join(outDir, multiTeam ? "all-teams-angles.json" : `${teams[0]}-angles.json`);
    writeFileSync(meta, JSON.stringify({
      teams, combo: comboKey || null, liveries, spineSides, spineLogos,
      live: isLive, liveBuild, zoom, pan: [strafe, dolly], viewport: vp, views,
      rollupView, shots: allShots, sheets: allSheets, teamRollup,
      seconds: +((Date.now() - t0) / 1000).toFixed(1),
    }, null, 2));
    console.log(`wrote ${allShots.length} angle(s) in ${((Date.now() - t0) / 1000).toFixed(1)}s + ${meta}`);
  } finally {
    await browser.close();
  }
}

main().then(() => shutdown()).catch((e) => { console.error(e); shutdown(); process.exit(1); });
