#!/usr/bin/env node
// @doc Garage camera shots — combos, parts/liv flags, --team=all, --live, --oracle.
//   node tools/shot/garage-angles.mjs [--combo=wrap-spine] [--team=all] [--live] [--list-combos]
//     [--spine-logo=wrap] [--spine-side=duo|all] [--part=aero:extreme] [--liv=finStyle:stars]
//     [--views=spine|wings] [--zoom=8] [--pan=5,0] [--aero-x] [--resume] [--out=dir]
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
// surveys (explicit flags override). `--team=all` + combo defaults to
// rollup-only (one shot per team → labeled rollup grid). `--full-views` keeps
// every spine preset per team; `--fast` tightens settle/wait (on by default
// for multi-team combo runs).
//
// `--live` loads github.io; labeled rollup + optional per-team sheets.
// `--resume` skips teams already in meta/PNG; `--oracle` adds offline occl % on rollup.
// Multi-team fast runs use __apex.garageTeam + garageFrame (not the picker UI).
//
// Capture prefers #game-soft via screenshotGameCanvas — page.screenshot hangs
// under SwiftShader (document.fonts.ready after freeze).
import { mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { launchChromium, shutdown, startStaticServer } from "../lib/harness.mjs";
import {
  chromiumArgsForBackend, installProbeInit, gotoGame, openGarage, settleGarage,
  screenshotGameCanvas,
} from "../capture/probe-page.mjs";
import { loadParts } from "../car/parts-sweep.mjs";
import { loadAtlas } from "../car/livery-contrast.mjs";
import { occlusionMap, hiddenIn } from "../car/flank-occlusion.mjs";
import { sweep as spineSweep } from "../car/spine-station.mjs";

const LIVE_BASE = "https://brycejmurrin.github.io/f1-game/";
const argv = process.argv.slice(2);
const isLive = argv.includes("--live");

/** Bundled surveys — explicit CLI flags override any field. */
const COMBOS = {
  "wrap-spine": {
    desc: "Wrap crown, zoomed side — the shipped flank occlusion check (build 8421+).",
    spineLogo: "wrap",
    spineSide: "none",
    views: "spine",
    zoom: 8,
    pan: "5,0",
    rollupView: "side",
  },
  "wrap-duo": {
    desc: "Red Bull default pair (wrap + duo) — spine group, moderate zoom.",
    spineLogo: "wrap",
    spineSide: "duo",
    views: "spine",
    zoom: 6,
    pan: "3,0",
    rollupView: "side",
  },
  "wrap-side": {
    desc: "Wrap crown + logo flank mark — tight side only.",
    spineLogo: "wrap",
    spineSide: "logo",
    views: "side",
    zoom: 8,
    pan: "5,0",
    rollupView: "side",
  },
  "duo-grid": {
    desc: "Shipped wrap/duo on every team — one side rollup cell per car.",
    spineLogo: "wrap",
    spineSide: "duo",
    views: "side",
    zoom: 8,
    pan: "5,0",
    rollupView: "side",
  },
  "flank-pack": {
    desc: "Five common flank marks (duo/slash/logo/wordmark/lockup) — single-team diagnostic.",
    spineLogo: "wrap",
    spineSide: "duo,slash,logo,wordmark,lockup",
    views: "side",
    zoom: 8,
    pan: "5,0",
    rollupView: "side",
    rollupSide: "duo",
  },
  "side-survey": {
    desc: "Every SPINE_SIDE id under wrap crown — single team, side view.",
    spineLogo: "wrap",
    spineSide: "all",
    views: "side",
    zoom: 8,
    pan: "5,0",
    rollupView: "side",
    rollupSide: "duo",
  },
  "crown-grid": {
    desc: "Four crown styles (wrap/bigmark/wedge/saddle) — spine group, top rollup.",
    spineLogo: "wrap,bigmark,wedge,saddle",
    spineSide: "none",
    views: "spine",
    zoom: 0,
    pan: "0,0",
    rollupView: "top",
    rollupLogo: "wrap",
  },
  "aero-wings": {
    desc: "Active-aero wing presets with X-mode + extreme aero parts.",
    views: "wings",
    zoom: 2,
    pan: "0,0",
    rollupView: "wingRear",
    aeroX: true,
    parts: { aero: "extreme" },
  },
  "livery-wall": {
    desc: "Front preset for crest / garage-wall readability.",
    views: "front",
    zoom: 0,
    pan: "0,0",
    rollupView: "front",
  },
  "wrap-rear": {
    desc: "Wrap crown aft visibility — rear + zoomed side.",
    spineLogo: "wrap",
    spineSide: "none",
    views: "rear,side",
    zoom: 4,
    pan: "3,0",
    rollupView: "side",
  },
  "fin-stars": {
    desc: "W17 star tail + wrap side — finStyle override.",
    spineLogo: "wrap",
    spineSide: "none",
    views: "rear,top",
    zoom: 2,
    pan: "0,0",
    rollupView: "rear",
    liv: { finStyle: "stars" },
  },
};

const PART_CATS = ["engine", "aero", "brakes", "gearbox", "ers", "tyres", "suspension", "fuel", "floor", "cockpit", "wheels"];
const LIV_KEYS = ["finStyle", "finShape", "finBadge", "spineHeight", "coverVents", "wingCarbon", "rearWing", "finish", "tcam", "dorsal"];

function readLiverytexIds(name) {
  const src = readFileSync(fileURLToPath(new URL("../../js/car/liverytex.js", import.meta.url)), "utf8");
  const m = src.match(new RegExp(`const ${name} = \\[([^\\]]+)\\]`));
  if (!m) return [];
  return m[1].split(",").map((s) => s.trim().replace(/"/g, "")).filter(Boolean);
}

function expandTokenList(list, allIds) {
  if (!list.length || !list.includes("all")) return list.filter((x) => x !== "all");
  return allIds.slice();
}

function printHelp() {
  console.log(`garage-angles — garage camera walks (one Chromium, soft-present capture)

Usage:
  node tools/shot/garage-angles.mjs [--live] [--combo=NAME] [--team=ID|all] [--out=dir]

Combos (--list-combos for table):
  ${Object.keys(COMBOS).join(", ")}

Teams / resume:
  --team=redbull,mclaren|all     roster walk (all = 11 grid teams, not custom)
  --resume                       skip teams already in meta/PNG
  --picker-team                  use #teampicker UI instead of __apex.garageTeam

Design (explicit flags override combo defaults):
  --spine-logo=wrap[,bigmark]     crown style(s); 'all' expands SPINE_LOGO_IDS
  --spine-side=duo[,slash]        flank mark(s); 'all' expands SPINE_SIDE_IDS
  --livery=default[,alt]          catalog livery ids when no spine-* flags
  --liv=finStyle:stars            livery field override (repeatable)
  --liv-fin-style=stars           same, kebab form

Parts / aero (applied after team switch):
  --part=aero:extreme             category:option (repeatable)
  --aero=extreme                  shorthand for --part=aero:…
  --aero-x                        enable garage X-mode (flaps open) before shots

Views / camera:
  --views=spine|side|wings|all    preset or group (spine, wings, front, rear, livery, all)
  --rollup-view=side              cell view for --team=all rollup
  --rollup-only | --full-views    one shot vs every preset per team
  --zoom=N --pan=strafe,dolly     discrete #cs-view-in / #cs-pan-* clicks after preset

Output / speed:
  --live                          github.io + labeled rollup
  --oracle                        offline flank-occlusion % on rollup labels
  --fast | --slow                 settle/wait tuning (fast default for multi-team combo)
  --labels | --no-labels          per-shot labels (live defaults on)
  --team-sheets | --label-shots     contact sheets on multi-team runs
`);
}

if (argv.includes("--help") || argv.includes("-h")) {
  printHelp();
  process.exit(0);
}
if (argv.includes("--list-combos")) {
  for (const [k, c] of Object.entries(COMBOS)) {
    const bits = [
      c.desc,
      c.spineLogo ? `logo=${c.spineLogo}` : null,
      c.spineSide ? `side=${c.spineSide}` : null,
      `views=${c.views || "spine"}`,
      `zoom=${c.zoom ?? 0} pan=${c.pan ?? "0,0"}`,
      c.rollupView ? `rollup=${c.rollupView}` : null,
    ].filter(Boolean).join(" · ");
    console.log(`${k.padEnd(14)} ${bits}`);
  }
  process.exit(0);
}

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

/** Roster order == Teams.LIST == store.team index. Excludes DEFAULT_CUSTOM. */
function rosterIds() {
  const src = readFileSync(fileURLToPath(new URL("../../js/data/teams.js", import.meta.url)), "utf8");
  const block = src.match(/const LIST = \[([\s\S]*?)\n  \];/);
  if (!block) {
    console.error("teams.js: could not parse const LIST");
    process.exit(1);
  }
  return Array.from(block[1].matchAll(/^      id: "([a-z]+)",/gm)).map((m) => m[1]);
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

const teamArg = flag("--team", "mclaren");
const liveries = flag("--livery", "default").split(",").map((s) => s.trim()).filter(Boolean);
const spineSideAll = readLiverytexIds("SPINE_SIDE_IDS");
const spineLogoAll = readLiverytexIds("SPINE_LOGO_IDS");
let spineSides = expandTokenList(
  (hasFlag("--spine-side") ? flag("--spine-side", "") : (combo?.spineSide ?? ""))
    .split(",").map((s) => s.trim()).filter(Boolean),
  spineSideAll,
);
let spineLogos = expandTokenList(
  (hasFlag("--spine-logo") ? flag("--spine-logo", "") : (combo?.spineLogo ?? ""))
    .split(",").map((s) => s.trim()).filter(Boolean),
  spineLogoAll,
);
const livOverrides = Object.assign({}, combo?.liv || {});
for (const raw of argv.filter((a) => a.startsWith("--liv="))) {
  const [k, v] = raw.slice(5).split(":");
  if (k && v != null) livOverrides[k] = v;
}
for (const k of LIV_KEYS) {
  const kebab = k.replace(/([A-Z])/g, "-$1").toLowerCase();
  if (hasFlag(`--liv-${kebab}`)) livOverrides[k] = flag(`--liv-${kebab}`, "");
}
const partsOverrides = Object.assign({}, combo?.parts || {});
for (const c of PART_CATS) {
  if (hasFlag(`--${c}`)) partsOverrides[c] = flag(`--${c}`, "");
}
for (const raw of argv.filter((a) => a.startsWith("--part="))) {
  const [cat, id] = raw.slice(7).split(":");
  if (cat && id) partsOverrides[cat] = id;
}
const aeroX = argv.includes("--aero-x") || !!combo?.aeroX;
const vp = flag("--viewport", "1280x720").split("x").map(Number);
const outDir = flag("--out", isLive ? "artifacts/garage-angles-live" : "artifacts/garage-angles");
const teams = parseTeams(teamArg);
const multiTeam = teams.length > 1;
const rollupView = flag("--rollup-view", combo?.rollupView || "side");
const rollupOnly = argv.includes("--rollup-only")
  || (multiTeam && combo && !hasFlag("--views") && !argv.includes("--full-views"));
const isFastMode = argv.includes("--fast") || (multiTeam && combo && !argv.includes("--slow"));
const viewsDefault = rollupOnly ? rollupView : (combo?.views ?? (isLive ? "all" : "spine"));
const rawViews = flag("--views", viewsDefault).split(",").map((s) => s.trim()).filter(Boolean);
const zoomDefault = combo?.zoom ?? (isLive ? 6 : 0);
const panDefault = combo?.pan ?? (isLive ? "3,0" : "0,0");
const zoom = Number(hasFlag("--zoom") ? flag("--zoom", "0") : String(zoomDefault)) || 0;
const [strafe = 0, dolly = 0] = (hasFlag("--pan") ? flag("--pan", "0,0") : panDefault).split(",").map(Number);
const withLabels = isLive ? !argv.includes("--no-labels") : argv.includes("--labels");
const labelEachShot = withLabels && (!multiTeam || argv.includes("--label-shots") || argv.includes("--full-views"));
const teamSheets = withLabels && (!multiTeam || argv.includes("--team-sheets") || argv.includes("--full-views"));
const withOracle = argv.includes("--oracle") && spineLogos.length && rollupOnly;
const useStoreTeam = !argv.includes("--picker-team") && (isFastMode || multiTeam);
const presentMs = isFastMode ? 4000 : 12000;
const settleShot = isFastMode ? 2 : 6;
const settleApply = isFastMode ? 4 : 12;
const settleSwitch = isFastMode ? 3 : 12;

function teamIndex(id) {
  const ids = rosterIds();
  const i = ids.indexOf(id);
  if (i < 0) {
    console.error(`no team "${id}" — available: ${ids.join(", ")}`);
    process.exit(1);
  }
  return i;
}

const ALL = ["hero", "front", "side", "rear", "top", "wingFront", "wingRear"];
const GROUPS = {
  spine: ["hero", "top", "rear", "side"],
  wings: ["wingFront", "wingRear"],
  front: ["front"],
  rear: ["rear"],
  livery: ["front"],
  aero: ["wingFront", "wingRear", "rear"],
  all: ALL,
};
const rollupSidePick = flag("--rollup-side", combo?.rollupSide || "");
const rollupLogoPick = flag("--rollup-logo", combo?.rollupLogo || "");
if (rollupOnly && multiTeam && spineSides.length > 1) {
  const pick = rollupSidePick || spineSides[0];
  if (!rollupSidePick) console.log(`multi-team rollup: one flank (${pick}) — --rollup-side or --full-views for more`);
  spineSides = [pick];
}
if (rollupOnly && multiTeam && spineLogos.length > 1) {
  const pick = rollupLogoPick || spineLogos[0];
  if (!rollupLogoPick) console.log(`multi-team rollup: one crown (${pick}) — --rollup-logo or --full-views for more`);
  spineLogos = [pick];
}
const views = [...new Set(rawViews.flatMap((v) => GROUPS[v] || [v]))];
const bad = views.filter((v) => !ALL.includes(v));
if (bad.length) {
  console.error(`Unknown view(s): ${bad.join(", ")}\nAvailable: ${ALL.join(", ")} + groups ${Object.keys(GROUPS).join(", ")}`);
  process.exit(1);
}
const skipBayGate = isFastMode && rollupOnly && views.length === 1;
const gateTries = skipBayGate ? 0 : (isFastMode ? 1 : 3);

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
  const tiles = await Promise.all(entries.map(async (e, i) => {
    const gx = (i % cols) * tileW;
    const gy = Math.floor(i / cols) * tileH;
    const img = await sharp(e.png).resize(cellW, cellH, { fit: "cover" }).png().toBuffer();
    const oracleNote = e.oracleHidden != null ? ` · occl ${Math.round(e.oracleHidden * 100)}%` : "";
    const sub = `${view} · ${e.design}${oracleNote} · ${buildNote}`;
    return [
      { input: img, left: gx + pad, top: gy + pad },
      {
        input: labelSvg(e.teamLabel || e.teamId.toUpperCase(), sub, cellW, labH),
        left: gx + pad,
        top: gy + pad + cellH,
      },
    ];
  }));
  const tag = comboName || "survey";
  const sheet = join(outDir, `all-teams-${tag}-${view}-rollup.png`);
  await sharp({ create: { width: W, height: H, channels: 3, background: { r: 16, g: 17, b: 20 } } })
    .composite(tiles.flat())
    .png()
    .toFile(sheet);
  return sheet;
}

/** Offline flank occlusion for rollup labels (--oracle). Cached per team. */
let _oracleParts = null;
let _oracleAtlas = null;
const _oracleCache = new Map();
function oracleHiddenPct(teamId, spineLogo, cam) {
  if (!_oracleParts) _oracleParts = loadParts();
  if (!_oracleAtlas) _oracleAtlas = loadAtlas();
  const key = teamId + "|" + spineLogo + "|" + cam.az.toFixed(3) + "|" + cam.el.toFixed(3) + "|" + cam.dist.toFixed(2);
  if (_oracleCache.has(key)) return _oracleCache.get(key);
  const om = occlusionMap(_oracleParts, {
    team: teamId,
    cam: { az: cam.az, el: cam.el, dist: cam.dist, ctr: [0, 0.45, 0.245], fov: 36 },
    grid: 32,
  });
  const sw = spineSweep(_oracleAtlas, { team: teamId, logo: spineLogo, sides: ["none"] });
  const crown = sw.crown;
  let hidden = hiddenIn(om, 0, 1);
  if (crown && crown.u0 != null) hidden = hiddenIn(om, crown.u0, crown.u1, crown.v0, crown.v1);
  _oracleCache.set(key, hidden);
  return hidden;
}

/** Teams already captured — from meta JSON or existing PNGs (--resume). */
function resumeTeamSet() {
  if (!argv.includes("--resume")) return new Set();
  const done = new Set();
  const metaPath = join(outDir, multiTeam ? "all-teams-angles.json" : `${teams[0]}-angles.json`);
  if (existsSync(metaPath)) {
    try {
      const meta = JSON.parse(readFileSync(metaPath, "utf8"));
      for (const e of meta.rollupEntries || []) done.add(e.teamId);
      for (const s of meta.shots || []) done.add(s.teamId);
    } catch (_) { /* stale meta — fall through to PNG scan */ }
  }
  for (const tid of teams) {
    const tag = spineLogos.length
      ? (spineLogos[0] || "def") + "-" + (spineSides[0] || "none")
      : liveries[0];
    const png = join(outDir, `${tid}-${tag}-${rollupOnly ? rollupView : views[0]}.png`);
    if (existsSync(png)) done.add(tid);
  }
  return done;
}

async function bayRendered(png, vpW) {
  const cut = Math.max(80, Math.round(vpW * 0.55));
  const st = await sharp(png).extract({
    left: 0, top: 0, width: cut, height: (await sharp(png).metadata()).height,
  }).stats();
  const spread = Math.max(...st.channels.map((c) => c.stdev));
  return { ok: spread > 8, spread: +spread.toFixed(2) };
}

async function frame(page, teamId, tag, view) {
  const framed = await page.evaluate(({ v, zoom: z, strafe: st, dolly: dl }) => {
    const a = window.__apex;
    if (!a.garageFrame) return { ok: false, error: "no garageFrame hook" };
    return a.garageFrame(v, { zoom: z, strafe: st, dolly: dl });
  }, { v: view, zoom, strafe, dolly });
  if (!framed.ok) throw new Error(`${teamId}/${tag}/${view}: ${framed.error || "frame failed"}`);
  await settleGarage(page, { frames: settleShot, presentMs });
  const png = join(outDir, `${teamId}-${tag}-${view}.png`);
  const shot = await screenshotGameCanvas(page, png, { skipAwait: true });
  let spread = null;
  if (gateTries > 0) {
    const gate = await bayRendered(png, vp[0]);
    spread = gate.spread;
    if (!gate.ok) throw new Error(`${teamId}/${tag}/${view}: bay never rendered (spread ${gate.spread})`);
  }
  return {
    view, tag, teamId, png, spread, via: shot.via || "page-clip",
    az: +framed.az.toFixed(3), el: +framed.el.toFixed(3), dist: +framed.dist.toFixed(3),
    pan: framed.pan ? framed.pan.map((n) => +n.toFixed(3)) : null,
  };
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
  await settleGarage(page, { frames: settleApply, presentMs });
  return got.name;
}

async function applyDesign(page, teamId, { spineSide, spineLogo, livExtra }) {
  const got = await page.evaluate(({ tid, side, logo, extra }) => {
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
    const liv = Object.assign({}, def, extra || {}, {
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
  }, { tid: teamId, side: spineSide || "", logo: spineLogo || "", extra: livExtra || {} });
  if (!got.ok) {
    const extra = got.have ? ` (have ${got.have.join(",")})` : "";
    throw new Error(`${got.error}${extra}`);
  }
  await settleGarage(page, { frames: settleApply, presentMs });
  return got.name;
}

async function applyParts(page, partsMap) {
  if (!partsMap || !Object.keys(partsMap).length) return null;
  const got = await page.evaluate((parts) => window.__apex.garageParts(parts), partsMap);
  if (!got.ok) throw new Error(`garageParts: ${got.error || "failed"}`);
  await settleGarage(page, { frames: settleApply, presentMs });
  return got.parts;
}

async function applyAeroX(page) {
  await page.evaluate(() => window.__apex.garageAero(true));
  await settleGarage(page, { frames: settleApply, presentMs });
}

async function switchTeam(page, teamId) {
  if (useStoreTeam) {
    const got = await page.evaluate((id) => window.__apex.garageTeam(id), teamId);
    if (!got.ok) throw new Error(`garageTeam(${teamId}): ${got.error || "failed"}`);
    if (got.switched) await settleGarage(page, { frames: settleSwitch, presentMs });
    if (!got.label) throw new Error(`garage opened but label empty after switch to ${teamId}`);
    return got.label;
  }
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
    }, null, { polling: 100, timeout: isFastMode ? 8000 : 15000 }).catch(() => {});
    await settleGarage(page, { frames: settleSwitch, presentMs });
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
      const name = await applyDesign(page, teamId, { ...d, livExtra: livOverrides });
      const tag = (d.spineLogo || "def") + "-" + d.spineSide;
      const tagShots = [];
      for (const v of views) {
        const s = await frame(page, teamId, tag, v);
        s.liveryName = name;
        s.spineLogo = d.spineLogo || null;
        s.spineSide = d.spineSide;
        if (labelEachShot) {
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
          const entry = {
            teamId, teamLabel, design: name, png: pick.png, view: rollupView,
          };
          if (withOracle && d.spineLogo) {
            entry.oracleHidden = oracleHiddenPct(teamId, d.spineLogo, pick);
          }
          rollupEntries.push(entry);
        }
      }
      if (teamSheets) {
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
        if (labelEachShot) {
          const sub = [name, buildNote, `dist ${s.dist}`].join(" · ");
          s.labeled = await labelShot(s.png, v.toUpperCase(), sub);
        }
        tagShots.push(s);
        shots.push(s);
        console.log(`shot ${teamId}/${liv}/${s.view} via=${s.via} az ${s.az} el ${s.el} dist ${s.dist} -> ${s.png}${s.labeled ? " +" + s.labeled : ""}`);
      }
      if (teamSheets) {
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
  if (combo) {
    console.log(`combo ${comboKey}: ${combo.desc || ""}`);
    console.log(`  logo=${spineLogos.join(",") || "(def)"} side=${spineSides.join(",") || "(def)"} views=${views.join(",")} zoom=${zoom} pan=${strafe},${dolly}`);
  }
  if (Object.keys(partsOverrides).length) console.log(`parts: ${JSON.stringify(partsOverrides)}`);
  if (Object.keys(livOverrides).length) console.log(`liv overrides: ${JSON.stringify(livOverrides)}`);
  if (aeroX) console.log("aero-x: flaps open (X-mode)");
  const resumeSet = resumeTeamSet();
  const workTeams = resumeSet.size
    ? teams.filter((t) => !resumeSet.has(t))
    : teams;
  if (multiTeam) {
    console.log(`teams (${teams.length}): ${teams.join(", ")}`);
    if (resumeSet.size) console.log(`resume: skip ${resumeSet.size} done, shoot ${workTeams.length}`);
    if (rollupOnly) console.log(`rollup-only (${rollupView}) — --full-views for every preset per team`);
    if (isFastMode) {
      console.log(`fast: settle ${settleShot}/${settleApply}f present ${presentMs}ms`
        + (useStoreTeam ? " store-team" : "") + (skipBayGate ? " no-gate" : ""));
    }
    if (withOracle) console.log("oracle: flank-occlusion % on rollup labels");
  }
  if (!workTeams.length) {
    console.log("nothing to shoot — all teams done (--resume)");
    const metaPath = join(outDir, multiTeam ? "all-teams-angles.json" : `${teams[0]}-angles.json`);
    if (existsSync(metaPath)) {
      try {
        const prior = JSON.parse(readFileSync(metaPath, "utf8"));
        if (prior.rollupEntries?.length) {
          const sheet = await buildTeamRollup(prior.rollupEntries, {
            comboName: comboKey || "survey", liveBuild, view: rollupView,
          });
          console.log(`rollup (${prior.rollupEntries.length} teams, ${rollupView}) -> ${sheet}`);
        }
      } catch (_) { /* no rollup */ }
    }
    shutdown();
    return;
  }

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

    for (const tid of workTeams) {
      const teamLabel = await switchTeam(page, tid);
      console.log(`team sheet: ${teamLabel}`);
      if (Object.keys(partsOverrides).length) await applyParts(page, partsOverrides);
      if (aeroX) await applyAeroX(page);
      const { shots, sheets } = await captureDesigns(page, tid, teamLabel, { liveBuild, rollupEntries });
      allShots.push(...shots);
      allSheets.push(...sheets);
    }

    let priorRollup = [];
    const metaPath = join(outDir, multiTeam ? "all-teams-angles.json" : `${teams[0]}-angles.json`);
    if (resumeSet.size && existsSync(metaPath)) {
      try {
        priorRollup = JSON.parse(readFileSync(metaPath, "utf8")).rollupEntries || [];
      } catch (_) { /* fresh rollup */ }
    }
    const mergedRollup = rollupEntries
      ? [...priorRollup.filter((e) => !rollupEntries.some((n) => n.teamId === e.teamId)), ...rollupEntries]
      : null;

    let teamRollup = null;
    if (mergedRollup && mergedRollup.length) {
      teamRollup = await buildTeamRollup(mergedRollup, {
        comboName: comboKey || "survey",
        liveBuild,
        view: rollupView,
      });
      console.log(`rollup (${mergedRollup.length} teams, ${rollupView}) -> ${teamRollup}`);
    }

    const meta = metaPath;
    writeFileSync(meta, JSON.stringify({
      teams, combo: comboKey || null, liveries, spineSides, spineLogos, livOverrides,
      parts: partsOverrides, aeroX,
      live: isLive, liveBuild, rollupOnly, fast: isFastMode, oracle: withOracle,
      storeTeam: useStoreTeam, resumed: resumeSet.size ? [...resumeSet] : null,
      zoom, pan: [strafe, dolly], viewport: vp, views,
      rollupView, shots: allShots, sheets: allSheets,
      rollupEntries: mergedRollup, teamRollup,
      seconds: +((Date.now() - t0) / 1000).toFixed(1),
    }, null, 2));
    console.log(`wrote ${allShots.length} angle(s) in ${((Date.now() - t0) / 1000).toFixed(1)}s + ${meta}`);
  } finally {
    await browser.close();
  }
}

main().then(() => shutdown()).catch((e) => { console.error(e); shutdown(); process.exit(1); });
