#!/usr/bin/env node
// @doc Garage shots, ONE Chromium: walks teams × liveries/any livery field/parts × cameras (views, absolute az/el/dist, zoom, pan) × viewports; clears dead DISPLAY for headless WebGL.
//   node tools/shot/garage-angles.mjs [--team=redbull,mclaren|all] [--views=spine] [--livery=default,rb_white]
//     [--spineLogo=wrap,saddle] [--finShape=blade] [--cover=#101014] [--part.engine=turbo,stock]
//     [--design='[{"spineLogo":"wrap"},…]'|@file.json] [--zip] [--base=<liveryId>] [--against=HEAD~1]
//     [--az=60deg,90deg|50deg..130deg:9] [--el=0.1,0.35] [--dist=6,9] [--zoom=8,4] [--pan=2,0;4,0]
//     [--cam=bay,bayFront|side:1.2,0.3,7;…] [--target=crown,fin,wall|x,y,z] [--lamp=side,off]
//     [--az-nudge=-1] [--el-nudge=1] [--viewport=1280x720,844x390] [--dpr=1,2] [--crop=0.3,0.2,0.4,0.5]
//     [--driver=0,1] [--light.keyMul=0.8,1.2] [--spineSide=all] [--part.aero=all] [--base=default,rb_white]
//     [--oracle] [--baseline=dir] [--budget=10m]
//     [--station=spineTop,spineSide,finBadge,…] [--pair=spineLogo:wrap|saddle] [--flat]
//     [--eye=x,y,z;…] [--look=x,y,z] [--clamp=0] [--path=@keyframes.json] [--path-steps=6]
//     [--serve] [--watch[=js/car/liverytex.js,…]]
//     [--preset=wall|fin|flank|mark|quick|sweep|none] [--plan] [--fast] [--settle=8] [--view-settle=4]
//     [--name='{team}-{tag}-{cam}'] [--out=dir] [--label=0] [--sheet=0] [--cols=3] [--cell=420] [--json]
//     [--team=all+custom] [--rollup-only|--full-views] [--rollup-view=wingRear]
//     [--reset] [--resume] [--oracle] [--picker-team] [--slow]
// @skill playwright-probe
// @skill garage-parts-livery
//
// Counterpart to garage-frame.mjs (one preset × backend A/B). This walks the
// CAMERA STACK on a single backend: open once, frame each camera, soft-present
// capture each frame. Two shipped defects (wordmarks vs gantry, sunk signs)
// were only visible from one angle each.
//
// Views: hero,front,side,rear,top,wingFront,wingRear,free — or groups:
//   spine  = hero,top,rear,side   (engine-cover crown / SPINE TOP)
//   all    = every preset; `free` keeps whatever camera the last shot left
//
// CAMERA AXES: a view is only the BASE framing. Every camera number is a LIST
// and the lists walk as a cartesian product with the views: `--az` / `--el`
// (radians, `45deg`, `0.5pi`) and `--dist` (metres) are ABSOLUTE orbit values
// applied after the preset; `--zoom` / `--pan` / `--az-nudge` / `--el-nudge`
// are counted clicks on #cs-view-* / #cs-pan-* (`;` separates pan entries), so
// a framing that reads here is one a player can reach. `--cam` names whole
// cameras (`[view:]az,el[,dist[,strafe,dolly]]`, `;`-separated) on top of the
// product. `--viewport` is an axis too — the docked sheet takes a different
// share of a phone-landscape canvas than of a desktop one, and `--dpr` walks
// device scale factors (one browser context each). `--target` aims the orbit at
// a named car-space point (crown, fin, wall, …) or x,y,z so any azimuth looks
// at the crown instead of panning toward it; `--lamp` aims the inspection lamp.
// Any numeric list takes a RANGE, `a..b:n`. `--crop=x,y,w,h` (fractions) cuts
// every frame to the region under review. `--oracle` records, per shot, how
// much of the flank mark the car's own tyres and bodywork hide at that camera;
// `--baseline=dir` scores every frame against a saved run as a changed-pixel
// fraction; `--budget` refuses a matrix the estimate says will not fit.
//
// `--livery` walks paint jobs via a store write (opening the LIVERY tab slams
// FRONT); `--base` names the catalog livery a DESIGN walk paints on top of.
//
// STATIONS: `--station=spineTop,finBadge` names camera bundles keyed to a PART
// (view + orbit + look-at + lamp + crop), and a design walk with no camera flag
// shoots the stations its fields need (FIELD_STATIONS) instead of `side`.
// COMPARISONS: `--pair=field:a|b` pairs designs in one run (Δ% + a diff
// overlay each), `--flat` puts the flat atlas art beside every lit frame.
// FREE CAMERA: `--clamp=0` lifts the player's orbit floors (el ≥ 0, minDist),
// `--eye=x,y,z --look=x,y,z` places the eye itself, `--path=@keyframes.json`
// shoots an interpolated dolly into `path-strip.png`.
// SESSION: `--serve` keeps the garage open and takes JSON-line commands on
// stdin (team / livery / design / frame / shot / diff / sheet / reload / quit);
// `--watch` reloads on a source change and re-shoots. apex_garage (MCP) wraps
// the session.
//
// DESIGN AXES: any field in `Liveries.FIELDS` is a flag, and passing more than
// one walks their CARTESIAN PRODUCT as custom liveries on the team default
// paint — `--spineLogo=wrap,saddle --finShape=blade` is four cars. It used to
// be two hard-coded axes (spineSide, spineLogo) against a livery system with
// 33 fields, so the garage — the one place occlusion and real lighting get a
// vote — could not be pointed at a fin, a cover colour or any tint row.
// `--spine-side` / `--spine-logo` still work as aliases. Colours take `#rrggbb`;
// everything else is the enum id, validated in-page against the real list so a
// typo prints what was available instead of silently painting the default.
// `--driver=0,1` walks the seat (number, helmet, T-cam); `--light.<knob>=`
// walks a lighting-tuner knob (`__apex.lightTune()` lists them); `all` on any
// enum axis expands to the real list, `--part.<category>=all` to the catalog.
// `--zip` pairs the axes index-wise instead of multiplying them; `--design`
// takes an explicit list (inline JSON, or `@file` of JSON / one object per
// line) when the cars to shoot are not a grid at all. `--part.<category>=`
// axes fit catalog PARTS through __apex.garageParts, so wing, fin and floor
// geometry walk the same way paint does (parts persist in the store for the
// rest of the run until a later design changes them).
//
// LABELS AND SHEETS: every PNG gets a caption bar burned under it (team,
// design, view, az/el/dist) and the run gets a contact sheet, because a
// directory of bare frames is unreadable an hour later and every session was
// hand-rolling a compositor to find out which car it was looking at. `--label=0`
// / `--sheet=0` opt out.
//
// `--against=<git ref>` shoots the WHOLE matrix twice — once on the working
// tree, once with every js/css/index.html blob that differs at that ref served
// from memory through startStaticServer's `route` hook — and writes before/after
// pairs plus a pair sheet. The working tree is never touched, which is the
// point: checking the old file out to compare is a race with anything else in
// the session and loses the diff if the run dies.
//
// Capture prefers #game-soft via screenshotGameCanvas — page.screenshot hangs
// under SwiftShader (document.fonts.ready after freeze).
//
// SETUP: launchChromium clears a dead local DISPLAY (no /tmp/.X11-unix/XN) so
// headless SwiftShader WebGL can start. If you still see "__apex never appeared"
// with gl2:false, unset DISPLAY or wrap: xvfb-run -a node tools/shot/garage-angles.mjs …
// Chromium args come from chromiumArgsForBackend("webgl2") and include
// --enable-unsafe-swiftshader. No separate serve on :3456 — this tool starts
// its own static server. Check loadavg < 3 first (AGENTS.md §Verification).
//
// TIMING: every phase is recorded (boot, open, and per shot settle/capture/gate)
// and printed. A run reporting one total number cannot tell a slow tool from a
// busy box, and on this container the same two-shot walk measured 240.9 s and
// 286.4 s on consecutive teams. The loadavg is read once and warned about for
// the same reason — see AGENTS.md §Verification.
import vm from "node:vm";
import { mkdirSync, writeFileSync, readFileSync, renameSync, existsSync, rmSync, statSync, watch as fsWatch } from "node:fs";
import readline from "node:readline";
import { execFileSync } from "node:child_process";
import { join, extname, basename } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { launchChromium, shutdown, startStaticServer } from "../lib/harness.mjs";
import {
  chromiumArgsForBackend, installProbeInit, gotoGame, openGarage, settleGarage,
  screenshotGameCanvas,
} from "./probe-page.mjs";
import { loadParts } from "../car/parts-sweep.mjs";
import { loadAtlas } from "../car/livery-contrast.mjs";
import { occlusionMap, hiddenIn } from "../car/flank-occlusion.mjs";
import { sweep as spineSweep, writePng as writeFlatPng } from "../car/spine-station.mjs";

const LIVE_BASE = "https://brycejmurrin.github.io/f1-game/";
const argv = process.argv.slice(2);
/** Accept `--name=value` and `--name value` (render-car style). */
const flag = (name, dflt) => {
  const eq = argv.find((a) => a.startsWith(name + "="));
  if (eq) return eq.slice(name.length + 1) || dflt;
  const i = argv.indexOf(name);
  if (i >= 0 && argv[i + 1] && !argv[i + 1].startsWith("-")) return argv[i + 1];
  return dflt;
};
// --team takes a LIST, or `all`. Every other axis has always been a list because
// the point of this tool is a WALK; team was the one that still cost a whole
// browser per value.
const argvHas = (name) => argv.some((a) => a === name || a.startsWith(name + "="));

/** Purpose-built bundles — same idea as render-car --preset. Every key is a
 *  plain CLI flag (views / zoom / pan / az / el / dist / any livery field), so
 *  a preset is a STARTING POINT and never a ceiling: `--preset=flank --az=80deg`
 *  is the flank framing swung to a new azimuth. CLI flags override; `none` is
 *  the default (no preset). */
const PRESETS = {
  wall:  { views: "front", zoom: 4 },
  fin:   { views: "rear", zoom: 4 },
  flank: { views: "side", zoom: 8, pan: "5,0" },
  // Wall crest + flank mark + fin badge in one pass (mark colour reviews).
  mark:  { views: "front,side,rear", zoom: 6, pan: "4,0", finBadge: "logo" },
  quick: { views: "side", zoom: 6, pan: "4,0", fast: true },
  // Five azimuths across the flank at flank zoom — foreshortening review.
  sweep: { views: "side", zoom: 6, pan: "4,0", az: "50deg,70deg,90deg,110deg,130deg" },
  // Wall crest AND saddle flank mark in one frame, at the team's own mark
  // colours — every key here is a plain flag, `bayFront` a named camera.
  saddleWall: { views: "bayFront", spineLogo: "saddle", spineSide: "logo", logos: "default" },
};
const presetRaw = flag("--preset", "").trim();
if (presetRaw === "list") {
  console.log("Presets (every key is a CLI flag; CLI flags override):");
  for (const [id, p] of Object.entries(PRESETS)) {
    console.log(`  ${id}: ${Object.entries(p).map(([k, v]) => (v === true ? k : `${k}=${v}`)).join(" ")}`);
  }
  process.exit(0);
}
const preset = (presetRaw && presetRaw !== "none" && PRESETS[presetRaw]) || null;
if (presetRaw && presetRaw !== "none" && !preset) {
  console.error(`Unknown --preset=${presetRaw} — try --preset=list`);
  process.exit(1);
}
/** A flag with the preset as its fallback: explicit beats preset beats default. */
const pflag = (name, key, dflt) => (argvHas(name) ? flag(name, dflt)
  : (preset && preset[key] != null ? String(preset[key]) : dflt));
const listOf = (raw, sep = ",") => String(raw ?? "").split(sep).map((s) => s.trim()).filter(Boolean);
/** Angles: radians by default, `45deg`, or `0.5pi`. */
const angle = (s) => (/deg$/i.test(s) ? Number(s.slice(0, -3)) * Math.PI / 180
  : /pi$/i.test(s) ? Number(s.slice(0, -2) || 1) * Math.PI : Number(s));
/** `a..b:n` expands to n evenly spaced values, inclusive — `50deg..130deg:9`
 *  is nine azimuths in one token, and it composes with every other axis. */
function expandRange(tok, map) {
  const m = /^(.+?)\.\.(.+?):(\d+)$/.exec(tok);
  if (!m) return [map(tok)];
  const a = map(m[1]), b = map(m[2]), n = Math.max(2, Number(m[3]));
  return Array.from({ length: n }, (_, i) => a + (b - a) * i / (n - 1));
}
const nums = (raw, map = Number) => listOf(raw).flatMap((t) => expandRange(t, map)).filter((n) => Number.isFinite(n));

const teamArg = flag("--team", "mclaren").trim();
const liveries = listOf(flag("--livery", "default"));
// `--base` is a LIST: a design walk runs over each named catalog livery.
const baseList = listOf(flag("--base", ""));
const baseLivery = baseList[0] || null;
// DEVICE PIXEL RATIO is an axis with a cost: a DPR needs its own browser
// context, so every value re-boots the garage once. Phones are 2x–3x and the
// docked sheet's text changes size with it.
const dprs = nums(flag("--dpr", "1")).filter((d) => d > 0);
if (!dprs.length) { console.error("--dpr needs one or more positive scale factors"); process.exit(1); }
// `--budget=600s|10m`: refuse a matrix the estimate says will not fit. On this
// box a casual product is an 80-minute run; the tool should say so, not boot.
const budgetRaw = flag("--budget", "");
const budgetSec = budgetRaw ? (/m$/i.test(budgetRaw) ? Number(budgetRaw.slice(0, -1)) * 60 : Number(budgetRaw.replace(/s$/i, ""))) : 0;
// `--baseline=dir`: score every frame against the same-named PNG in that dir
// (a saved run), as a changed-pixel fraction — an A/B with no git ref.
const baselineDir = flag("--baseline", "").trim() || null;
// VIEWPORTS are an axis: the docked sheet takes a different share of a
// phone-landscape canvas than of a desktop one, and a framing signed off at
// 1280x720 has shipped unreadable at 844x390.
const vps = listOf(flag("--viewport", "1280x720"))
  .map((s) => s.toLowerCase().split("x").map(Number))
  .filter((v) => v.length === 2 && v.every((n) => n > 0));
if (!vps.length) { console.error("--viewport needs WxH[,WxH…]"); process.exit(1); }
const vp = vps[0];
const outDir = flag("--out", "artifacts/garage-angles");
const fast = argvHas("--fast") || !!(preset && preset.fast);
// ── CAMERA AXES — every camera number is a LIST, walked as a product with the
// named views. A preset is the base (it resets orbit, target and pan); the
// absolutes go on top, then the counted UI nudges. Nothing here is a single
// number any more: `--zoom=8,4` is two framings, `--pan=2,0;4,0` two more.
const zoomList = nums(pflag("--zoom", "zoom", "0"));
if (!zoomList.length) zoomList.push(0);
const panList = listOf(pflag("--pan", "pan", "0,0"), ";").map((p) => {
  const [s = 0, d = 0] = p.split(",").map(Number);
  return [s || 0, d || 0];
});
if (!panList.length) panList.push([0, 0]);
const azList = nums(pflag("--az", "az", ""), angle);
const elList = nums(pflag("--el", "el", ""), angle);
const distList = nums(pflag("--dist", "dist", ""));
// The inspection LAMP is aimed by preset name; `off` parks it. A preset view
// re-aims it, so the lamp is a CAMERA axis (applied after the framing).
const LAMPS = ["hero", "bay", "bayFront", "wingRear", "rear", "side", "front", "wingFront", "off"];
const lampList = listOf(pflag("--lamp", "lamp", "")).map((l) => (l === "all" ? LAMPS : [l])).flat();
for (const l of lampList) if (!LAMPS.includes(l)) { console.error(`--lamp "${l}" is not one of ${LAMPS.join(", ")}`); process.exit(1); }
// Where the orbit LOOKS. Every preset orbits the car centre (or a flap); a
// target lets any azimuth look at the crown instead of panning toward it.
// Names are car-space points, metres, +z nose; `x,y,z` is accepted too.
const TARGETS = {
  car: null,
  nose:  [0, 0.35, 2.0],
  crown: [0, 0.95, -0.55],
  fin:   [0, 1.05, -1.5],
  flank: [0.6, 0.65, -0.35],
  wall:  [0, 1.8, -6.0],
};
function parseTarget(t, strict = true) {
  if (Array.isArray(t)) t = t.join(",");
  if (t in TARGETS) return { name: t, at: TARGETS[t] };
  const xyz = String(t).split(",").map(Number);
  if (xyz.length === 3 && xyz.every(Number.isFinite)) return { name: xyz.map((n) => +n.toFixed(2)).join("x").replace(/-/g, "m"), at: xyz };
  const msg = `--target "${t}" is not one of ${Object.keys(TARGETS).join(", ")} or x,y,z`;
  if (!strict) throw new Error(msg);
  console.error(msg);
  process.exit(1);
}
const targetList = listOf(pflag("--target", "target", ""), ";").flatMap((part) => {
  // `;` separates x,y,z triples; a list of NAMES has no commas of its own.
  const names = listOf(part);
  return (names.length > 1 && names.every((n) => n in TARGETS)) ? names : [part];
}).map(parseTarget);
const azNudgeList = nums(pflag("--az-nudge", "azNudge", ""));
const elNudgeList = nums(pflag("--el-nudge", "elNudge", ""));
// NAMED CAMERAS ARE PARAMETER BUNDLES, not presets in the game. Each is the
// `--cam` grammar itself — a base view (which also aims the work lamp) plus an
// absolute orbit — so a name and a hand-written camera are the same thing, and
// `--az`/`--el`/`--dist` can sweep BETWEEN two named framings. `bay` and
// `bayFront` were briefly SP_VIEWS entries in js/game.js with no player button;
// production data carrying a shot tool's camera is the thing this replaces.
const CAM_ALIAS = {
  bay:      "hero:0.68pi,0.26,9.2",    // rear-left three-quarter, back wall in frame
  bayFront: "front:0.32pi,0.28,9.4",   // opposite diagonal, same left flank
};
// STATIONS are camera bundles keyed to a PART, not to a preset. Each frames
// one thing a livery field paints — the crown, the flank, the fin badge, the
// endplate — with a base view, an orbit, a look-at, the lamp, and (where the
// part is small in frame) a CROP, so a pair's Δ% scores the part and not the
// pit wall behind it. Every component is a default the axes override
// (`--station=spineTop --az=150deg` is the crown station swung round), and
// FIELD_STATIONS below says which station shows which field, so a design walk
// with no camera flags shoots where the change is visible instead of `side`.
// A station closer than the player's 4.6 m floor carries `clamp: false` — it
// is a survey framing, and the part is the subject, not the car.
const STATIONS = {
  // crown / SPINE TOP, read top-down nose-up the way the chase camera does
  spineTop:  { view: "rear",      az: 0.92 * Math.PI, el: 0.72, dist: 3.2, target: [0, 0.9, -0.85], lamp: "off", clamp: false },
  // flank / SPINE SIDE at shoulder height, the sidepod line in frame
  spineSide: { view: "side",      az: 0.50 * Math.PI, el: 0.15, dist: 3.4, target: "flank", lamp: "side",     clamp: false },
  finBadge:  { view: "rear",      az: 0.78 * Math.PI, el: 0.30, dist: 3.0, target: "fin",   lamp: "wingRear", clamp: false },
  sidepod:   { view: "side",      az: 0.56 * Math.PI, el: 0.12, dist: 3.6, target: [0.7, 0.45, 0.2], lamp: "side", clamp: false },
  noseFlash: { view: "wingFront", az: 0.18 * Math.PI, el: 0.14, dist: 4.0, target: "nose",  lamp: "front" },
  endplate:  { view: "wingFront", az: 0.35 * Math.PI, el: 0.10, dist: 2.6, target: [0.9, 0.2, 2.3], lamp: "wingFront" },
  rearWing:  { view: "wingRear",  az: 0.72 * Math.PI, el: 0.30, dist: 2.8, target: [0, 1.0, -2.4], lamp: "wingRear" },
  wallCrest: { view: "front",     az: 0.32 * Math.PI, el: 0.28, dist: 9.4, target: "wall",  lamp: "off" },
  // the floor-level nose framing measured 2026-09-10 (eye 9 cm off the floor)
  floorNose: { view: "wingFront", az: 0,              el: 0.04, dist: 3.5, target: [0, -0.15, 2.2] },
};
// Which station SHOWS a field. A crown design is invisible from `side` and a
// flank fill from `rear`; a run that names a design and no camera used to
// shoot `side` regardless, and the change was as often out of frame as in it.
const FIELD_STATIONS = {
  spineLogo: ["spineTop"], spineTint: ["spineTop"], bandTint2: ["spineTop"], sunTint: ["spineTop", "spineSide"],
  spineHeight: ["spineTop", "spineSide"], cover: ["spineTop", "spineSide"], coverVents: ["spineTop"],
  coverBind: ["spineTop", "spineSide"], halo: ["spineTop"], tcam: ["spineTop"],
  spineSide: ["spineSide"], sideTint: ["spineSide"], plateTint: ["spineSide"], saddleTint: ["spineSide"],
  numFont: ["spineSide"], sponsors: ["spineSide", "sidepod"],
  fin: ["finBadge"], finArt: ["finBadge"], finStyle: ["finBadge"], finBadge: ["finBadge"],
  finShape: ["finBadge"], finHandoff: ["finBadge"],
  nose: ["noseFlash"], noseStripe: ["noseFlash"], pod: ["sidepod"], stripe: ["sidepod"],
  accent: ["sidepod", "noseFlash"], finish: ["sidepod"], bodySplit: ["sidepod"],
  wing: ["endplate"], wingCarbon: ["endplate"], rearWing: ["rearWing"],
  logo: ["wallCrest", "spineTop"], logo2: ["wallCrest", "spineTop"], logo3: ["wallCrest", "spineTop"],
};
const isAlias = (n) => !!(CAM_ALIAS[n] || STATIONS[n]);
/** `--cam=[view:]az,el[,dist[,strafe,dolly]]`, an alias name, or a station. */
function parseCam(raw) {
  const st = STATIONS[raw];
  if (st) {
    return { view: st.view, alias: raw, station: raw, az: st.az, el: st.el, dist: st.dist,
             target: st.target != null ? parseTarget(st.target) : null, lamp: st.lamp || null,
             crop: st.crop || null, clamp: st.clamp === false ? false : undefined,
             strafe: 0, dolly: 0, zoom: 0, azNudge: 0, elNudge: 0, explicit: true };
  }
  const spec = CAM_ALIAS[raw] || raw;
  const m = /^(?:([A-Za-z]+):)?(.+)$/.exec(spec);
  const [az, el, dist, strafe, dolly] = m[2].split(",").map((v, i) => (i < 2 ? angle(v.trim()) : Number(v)));
  if (!Number.isFinite(az) || !Number.isFinite(el)) {
    console.error(`--cam entry "${spec}" needs at least az,el`);
    process.exit(1);
  }
  return { view: m[1] || null, alias: CAM_ALIAS[raw] ? raw : null, station: null,
           az, el, dist: Number.isFinite(dist) ? dist : null, target: null, lamp: null, crop: null,
           strafe: strafe || 0, dolly: dolly || 0, zoom: 0, azNudge: 0, elNudge: 0, explicit: true };
}
// `;` separates cameras because az,el,dist are commas — but a list of NAMES
// has no commas of its own, so `--cam=bay,bayFront` expands too.
// `;` separates cameras because az,el,dist are commas — but a list of NAMES
// has no commas of its own, so `--cam=bay,bayFront` expands too. A NAME is a
// combinable base (the axes below override its components); a camera written
// out in numbers already names everything, so it stands alone.
const camParts = listOf(flag("--cam", ""), ";").flatMap((part) => {
  const names = listOf(part);
  return (names.length > 1 && names.every(isAlias)) ? names : [part];
});
// `--station=spineTop,finBadge` is the same list by another name; a name that
// is not a station is an error here, where `--cam` would try to parse numbers.
const stationNames = listOf(flag("--station", ""));
for (const n of stationNames) if (!STATIONS[n]) { console.error(`--station "${n}" is not one of ${Object.keys(STATIONS).join(", ")}`); process.exit(1); }
const camAliasNames = [...camParts.filter(isAlias), ...stationNames];
const camSpecs = camParts.filter((c) => !isAlias(c)).map(parseCam);
// `--crop=none` switches a station's own crop OFF (to see the whole framing
// while tuning one); `--crop=x,y,w,h` replaces it.
const cropRaw = flag("--crop", "");
const cropOff = cropRaw === "none" || cropRaw === "0";
const crop = cropRaw && !cropOff ? cropRaw.split(",").map(Number) : null;
if (crop && (crop.length !== 4 || crop.some((n) => !(n >= 0 && n <= 1)) || crop[2] <= 0 || crop[3] <= 0)) {
  console.error("--crop wants x,y,w,h as fractions of the frame (0..1)");
  process.exit(1);
}
const nameTpl = flag("--name", "");
// `--logos=default|clear` strips the authored mark rows so the wall lightbox and
// the flank mark both fall to the team's default paintTeamMark colours — the
// A/B for "is this MY colour or the brand's?".
const logosMode = pflag("--logos", "logos", "").trim();
const clearLogos = logosMode === "default" || logosMode === "clear";
// `--site` / `--cdn` boots the DEPLOYED build instead of the working tree.
// `--live` is the local gallery only and must never switch the tree under test.
const doSite = argvHas("--site") || argvHas("--cdn");
const againstRef = flag("--against", null);
const doLabel = flag("--label", fast ? "0" : "1") !== "0";
const doSheet = flag("--sheet", fast ? "0" : "1") !== "0";
const sheetCols = Number(flag("--cols", "0")) || 0;
const cell = Math.max(120, Number(flag("--cell", "420")) || 420);
const liverySettle = Math.max(0, Number(flag("--settle", fast ? "6" : "8")) || 0);
const viewSettle = Math.max(0, Number(flag("--view-settle", fast ? "2" : "4")) || 0);
const liveryAwait = fast ? 8000 : 12000;
const viewAwait = fast ? 5000 : 8000;
const gateRetries = fast ? 1 : 3;
const doPlan = argvHas("--plan");
// `--serve` keeps the browser open and takes JSON-line commands on stdin;
// `--watch[=paths]` reloads the page when a source file changes and re-shoots.
// Both exist because a design loop is many looks at one car, and a boot per
// look (~25 s) plus a settle per shot (~20 s) is the whole cost of iterating.
const doServe = argvHas("--serve");
const WATCH_DEFAULT = ["js/car/liverytex.js", "js/car/liveries.js", "js/car/car3d.js", "js/data/teams.js", "js/garage"];
const watchList = argvHas("--watch") ? (listOf(flag("--watch", "")).length ? listOf(flag("--watch", "")) : WATCH_DEFAULT) : [];
const doLive = argvHas("--live");
const doJson = argvHas("--json");

// Everything the tool owns. Anything ELSE of the form --name=value is taken as
// a livery field (or `--part.<category>` — a catalog part) and validated
// in-page — so the flag surface grows with Liveries.FIELDS and Parts.CATALOG
// instead of with this file.
const OWN_FLAGS = new Set(["--team", "--livery", "--viewport", "--out", "--zoom", "--pan",
  "--views", "--against", "--label", "--sheet", "--cell", "--spine-side", "--spine-logo",
  "--preset", "--plan", "--fast", "--slow", "--settle", "--view-settle", "--live",
  "--reset", "--resume", "--oracle", "--picker-team", "--rollup-only", "--full-views",
  "--rollup-view", "--rollup-side", "--rollup-logo",
  "--az", "--el", "--dist", "--az-nudge", "--el-nudge", "--cam", "--crop", "--name",
  "--cols", "--json", "--base", "--design", "--zip", "--logos", "--site", "--cdn",
  "--lamp", "--target", "--dpr", "--budget", "--baseline",
  "--station", "--pair", "--flat", "--eye", "--look", "--path", "--path-steps", "--clamp",
  "--serve", "--watch", "--overlay"]);
const axes = [];
const addAxis = (field, raw) => {
  const values = String(raw).split(",").map((s) => s.trim()).filter(Boolean);
  if (values.length) axes.push({ field, values });
};
// The two legacy names first, so their order in the product is unchanged.
if (flag("--spine-logo", "")) addAxis("spineLogo", flag("--spine-logo", ""));
if (flag("--spine-side", "")) addAxis("spineSide", flag("--spine-side", ""));
// `--pair=spineLogo:wrap|saddle[|cap]` is an axis AND a comparison: every value
// after the first is paired with the first, same car and camera, and each pair
// gets a Δ% plus a diff overlay — the A/B you actually want while choosing
// between two designs, with no git ref and no saved run.
const pairRaw = flag("--pair", "").trim();
const pairAxis = (() => {
  if (!pairRaw) return null;
  const m = /^([A-Za-z0-9_.]+):(.+)$/.exec(pairRaw);
  const values = m ? m[2].split("|").map((v) => v.trim()).filter(Boolean) : [];
  if (!m || values.length < 2) { console.error("--pair wants field:a|b[|c…]"); process.exit(1); }
  return { field: m[1], values };
})();
if (pairAxis) addAxis(pairAxis.field, pairAxis.values.join(","));
// Every livery-field key a preset carries becomes an axis unless the CLI names it.
const CAM_KEYS = new Set(["views", "zoom", "pan", "az", "el", "dist", "azNudge", "elNudge",
  "fast", "cam", "logos", "lamp", "target", "station"]);
for (const [k, v] of Object.entries(preset || {})) {
  if (CAM_KEYS.has(k) || argv.some((a) => a.startsWith(`--${k}=`))) continue;
  addAxis(k, v);
}
for (const a of argv) {
  if (!a.startsWith("--") || !a.includes("=")) continue;
  const name = a.slice(0, a.indexOf("="));
  if (OWN_FLAGS.has(name)) continue;
  addAxis(name.slice(2), a.slice(a.indexOf("=") + 1));
}
// `all` on an enum axis expands to the real list — the same registries the
// in-page validator reads, loaded here so `--plan` can count the matrix.
function expandAllValues() {
  if (!axes.some((ax) => ax.values.includes("all"))) return;
  const M = loadParts();
  const LT = M.LiveryTex, C3 = M.Car3D;
  const ids = (reg, extra) => { const l = Array.isArray(reg) ? reg.slice() : Object.keys(reg || {}); if (extra && !l.includes(extra)) l.push(extra); return l; };
  const ENUMS = {
    spineLogo: ids(LT.SPINE_LOGO_IDS), spineSide: ids(LT.SPINE_SIDE_IDS), finStyle: ids(LT.TAIL_STYLE_IDS),
    finBadge: ids(LT.FIN_BADGE_IDS), numFont: ids(LT.NUM_FONT_IDS), sponsors: ids(LT.SPONSOR_PACK_IDS),
    finShape: ids(C3.FIN_SHAPES, "none"), tcam: ids(C3.TCAM_IDS), coverVents: ids(C3.COVER_VENT_IDS),
    spineHeight: ids(C3.SPINE_HEIGHT_IDS), coverBind: ["independent", "saddleWrap", "spineOnly"],
    finHandoff: ["match", "contrast", "hardCut"], wingCarbon: ["paint", "carbon"], bodySplit: ["off", "lr"],
    finish: ["gloss"].concat(ids(C3.FINISH_SURFACE)), driver: ["0", "1"],
  };
  for (const ax of axes) {
    if (!ax.values.includes("all")) continue;
    let list = ENUMS[ax.field];
    if (!list && ax.field.startsWith("part.")) {
      const cat = M.Parts.CATALOG.find((c) => c.id === ax.field.slice(5));
      list = cat && cat.options ? cat.options.map((o) => o.id) : null;
    }
    if (!list) { console.error(`--${ax.field}=all: no list to expand (colour rows and light.* take values)`); process.exit(1); }
    ax.values = [...new Set(ax.values.flatMap((v) => (v === "all" ? list : [v])))];
  }
}
expandAllValues();
/** `--design`: an explicit list of cars — inline JSON, or `@file` holding a
 *  JSON array / one object per line. Each object is livery fields plus optional
 *  `part.<category>` keys and an optional `name`. */
function explicitDesigns(raw) {
  if (!raw) return null;
  const text = raw.startsWith("@") ? readFileSync(raw.slice(1), "utf8") : raw;
  const t = text.trim();
  const parsed = t.startsWith("[") || t.startsWith("{")
    ? JSON.parse(t)
    : t.split("\n").map((l) => l.trim()).filter(Boolean).map((l) => JSON.parse(l));
  const list = Array.isArray(parsed) ? parsed : [parsed];
  if (!list.length || list.some((d) => !d || typeof d !== "object")) {
    console.error("--design must be a JSON object, an array of them, or @file with one per line");
    process.exit(1);
  }
  return list;
}
/** The design matrix: an explicit list, the axes zipped (`--zip`, index-wise,
 *  the shorter lists cycling), or the cartesian product of every axis — or null. */
const designs = explicitDesigns(flag("--design", ""))
  || (axes.length
    ? (argvHas("--zip")
      ? Array.from({ length: Math.max(...axes.map((ax) => ax.values.length)) }, (_, i) =>
        Object.fromEntries(axes.map((ax) => [ax.field, ax.values[i % ax.values.length]])))
      : axes.reduce((acc, ax) => acc.flatMap((d) => ax.values.map((v) => ({ ...d, [ax.field]: v }))), [{}]))
    : null);

// The stations the DESIGN asks for: every field named by an axis or an
// explicit design, through FIELD_STATIONS, in first-seen order. They become the
// cameras only when nothing else names one — a `--views`, `--cam`, `--station`
// or a preset with views wins, because the user said where to look.
const fieldStations = (() => {
  const fields = [];
  for (const ax of axes) if (!fields.includes(ax.field)) fields.push(ax.field);
  for (const d of designs || []) for (const k of Object.keys(d)) if (!fields.includes(k)) fields.push(k);
  const out = [];
  for (const f of fields) for (const st of FIELD_STATIONS[f] || []) {
    if (!out.some((o) => o.station === st)) out.push({ station: st, fields: [] });
    out.find((o) => o.station === st).fields.push(f);
  }
  return out;
})();
const autoStations = (fieldStations.length && !argvHas("--views") && !argvHas("--cam") && !argvHas("--station")
  && !argvHas("--path") && !argvHas("--eye") && !(preset && preset.views)) ? fieldStations.map((o) => o.station) : [];
camAliasNames.push(...autoStations);

// Roster order == store.team index (game.js boot). EVALUATED, not regexed: a
// regex over teams.js also matched `id: "custom"` on DEFAULT_CUSTOM, the MY TEAM
// seed that is NOT a roster member, so this tool's idea of "every team" was
// twelve cars where render-car's was eleven. The index matters as much as the
// list — the in-page switch uses Teams.LIST.indexOf, so anything but that order
// pins the wrong car. `const Teams` in an IIFE is a lexical binding that never
// lands on the sandbox, hence evaluating the identifier back out.
const ROSTER = (() => {
  const sb = { console, Math, Object, Array, String, Number, JSON };
  sb.globalThis = sb;
  vm.createContext(sb);
  vm.runInContext(readFileSync(fileURLToPath(new URL("../../js/data/teams.js", import.meta.url)), "utf8"),
                  sb, { filename: "teams.js" });
  return vm.runInContext("Teams", sb).LIST.map((t) => t.id);
})();
function parseTeams(arg) {
  if (arg === "all") return ROSTER.slice();
  if (arg === "*" || arg === "all+custom" || arg === "all,*") return [...ROSTER, "custom"];
  const picked = [];
  for (const raw of arg.split(",").map((s) => s.trim()).filter(Boolean)) {
    if (raw === "all") picked.push(...ROSTER);
    else if (raw === "all+custom" || raw === "*") picked.push(...ROSTER, "custom");
    else if (raw === "custom" || ROSTER.includes(raw)) picked.push(raw);
    else {
      console.error(`no team "${raw}" — grid: ${ROSTER.join(", ")}, custom, or all/all+custom`);
      process.exit(1);
    }
  }
  return [...new Set(picked)];
}
function teamIndex(id) {
  if (id === "custom") return ROSTER.length;
  const i = ROSTER.indexOf(id);
  if (i < 0) {
    console.error(`no team "${id}" — available: ${ROSTER.join(", ")}, custom`);
    process.exit(1);
  }
  return i;
}
const teams = teamArg === "all" ? ROSTER.slice() : parseTeams(teamArg);
const multiTeam = teams.length > 1;
const rollupOnly = argvHas("--rollup-only")
  || (multiTeam && !argvHas("--full-views") && !designs);
const rollupViewFlag = argvHas("--rollup-view") ? flag("--rollup-view", "side") : null;
const useStoreTeam = !argvHas("--picker-team") && (fast || multiTeam);
const withOracle = argvHas("--oracle") && rollupOnly
  && axes.some((ax) => ax.field === "spineLogo" && ax.values.length);

// `free` is not a preset: it keeps whatever camera the previous shot left, so
// an absolute --az/--el/--dist (or a --cam) can start from a clean slate
// without a preset first resetting the orbit under it.
const ALL = ["hero", "front", "side", "rear", "top", "wingFront", "wingRear", "free"];
const GROUPS = {
  spine: ["hero", "top", "rear", "side"],
  wings: ["wingFront", "wingRear"],
  front: ["front"],
  rear: ["rear"],
  aero: ["wingFront", "wingRear", "rear"],
  all: ALL.filter((v) => v !== "free"),
};
// A PRESET that names views beats the multi-team rollup default: the preset
// asked for those views explicitly, and a rollup silently shooting one of them
// is the "I asked for three angles and got one" surprise.
const viewsDefault = (() => {
  if (preset && !argvHas("--views")) return preset.views;
  if (rollupOnly && !argvHas("--views")) return rollupViewFlag || "side";
  return "spine";
})();
const rawViews = flag("--views", viewsDefault).split(",").map((s) => s.trim()).filter(Boolean);
// A named camera given as a view is lifted into --cam, so `--views=bay` and
// `--cam=bay` mean the same thing and neither needs a game preset.
const viewAliases = rawViews.filter(isAlias);
// Naming cameras and NOT naming views means the cameras are the run: the
// default view group would otherwise silently double every such matrix.
const camsNamed = argvHas("--cam") || argvHas("--station") || viewAliases.length > 0 || autoStations.length > 0
  || argvHas("--path") || argvHas("--eye");
// `plainViews` drive the camera PRODUCT; an alias contributes exactly one
// camera (its own bundle), so naming one does not also shoot its base view.
const plainViews = (camsNamed && !argvHas("--views"))
  ? []
  : [...new Set(rawViews.filter((v) => !isAlias(v)).flatMap((v) => GROUPS[v] || [v]))];
const aliasViews = [...new Set([...viewAliases, ...camAliasNames].map((v) => parseCam(v).view).filter(Boolean))];
const views = [...new Set([...plainViews, ...aliasViews])];
const rollupView = rollupViewFlag
  || (views.length === 1 ? views[0]
    : (views.includes("wingRear") ? "wingRear"
      : (views.includes("side") ? "side" : views[0])));
const bad = views.filter((v) => !ALL.includes(v));
if (bad.length) {
  console.error(`Unknown view(s): ${bad.join(", ")}\nAvailable: ${ALL.join(", ")} + groups ${Object.keys(GROUPS).join(", ")}`);
  process.exit(1);
}

// ── THE CAMERA MATRIX: views × az × el × dist × zoom × pan × nudges, plus the
// explicit --cam entries. A camera's KEY names only what was set, so a run with
// no camera axes keeps the old `<team>-<tag>-<view>.png` names exactly.
const degs = (r) => Math.round(r * 180 / Math.PI);
const orNull = (list) => (list.length ? list : [null]);
function xyzKey(v) { return v.map((n) => +n.toFixed(2)).join("x").replace(/-/g, "m").replace(/\./g, "_"); }
function camKey(c) {
  const b = [c.view];
  if (c.eye) b.push(`eye${xyzKey(c.eye)}`);
  if (c.target && !c.eye) b.push(`at${cap(c.target.name)}`);
  if (c.lamp) b.push(`lamp${cap(c.lamp)}`);
  if (c.az != null) b.push(`az${degs(c.az)}`);
  if (c.el != null) b.push(`el${degs(c.el)}`);
  if (c.dist != null) b.push(`d${c.dist}`);
  if (c.zoom) b.push(`z${c.zoom}`);
  if (c.strafe || c.dolly) b.push(`p${c.strafe}x${c.dolly}`);
  if (c.azNudge) b.push(`na${c.azNudge}`);
  if (c.elNudge) b.push(`ne${c.elNudge}`);
  return b.join("_").replace(/-/g, "m").replace(/\./g, "_");
}
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
function aliasKey(b, c) {
  const bits = [b.alias];
  if (c.target && !(b.target && c.target.name === b.target.name)) bits.push(`at${cap(c.target.name)}`);
  if (c.lamp && c.lamp !== b.lamp) bits.push(`lamp${cap(c.lamp)}`);
  if (c.az !== b.az) bits.push(`az${degs(c.az)}`);
  if (c.el !== b.el) bits.push(`el${degs(c.el)}`);
  if (c.dist !== b.dist) bits.push(`d${c.dist}`);
  if (c.zoom) bits.push(`z${c.zoom}`);
  if (c.strafe !== (b.strafe || 0) || c.dolly !== (b.dolly || 0)) bits.push(`p${c.strafe}x${c.dolly}`);
  if (c.azNudge) bits.push(`na${c.azNudge}`);
  if (c.elNudge) bits.push(`ne${c.elNudge}`);
  return bits.join("_").replace(/-/g, "m").replace(/\./g, "_");
}
const cams = [];
// A BASE is a plain view (no camera of its own) or a NAMED camera, whose
// az / el / dist are defaults the axis lists override component by component —
// so `--views=bay --az=100deg,140deg` sweeps azimuth from the bay framing and
// keeps its elevation and distance. That is the whole point of naming one.
const bases = [
  ...plainViews.map((view) => ({ view })),
  ...[...new Set([...viewAliases, ...camAliasNames])].map((name) => {
    const c = parseCam(name);
    return { view: c.view || "free", alias: name, station: c.station, az: c.az, el: c.el, dist: c.dist,
             strafe: c.strafe, dolly: c.dolly, target: c.target, lamp: c.lamp, crop: c.crop, clamp: c.clamp };
  }),
];
const pick = (list, dflt) => (list.length ? list : [dflt ?? null]);
for (const b of bases) {
  for (const target of pick(targetList, b.target)) for (const lamp of pick(lampList, b.lamp)) {
  for (const az of pick(azList, b.az)) for (const el of pick(elList, b.el)) {
    for (const dist of pick(distList, b.dist)) for (const zoom of zoomList) {
      for (const [ps, pd] of panList) for (const azNudge of orNull(azNudgeList)) {
        for (const elNudge of orNull(elNudgeList)) {
          const c = { view: b.view, alias: b.alias || null, station: b.station || null, az, el, dist, zoom,
                      strafe: (b.strafe || 0) + ps, dolly: (b.dolly || 0) + pd,
                      azNudge: azNudge || 0, elNudge: elNudge || 0,
                      target: target && target.at ? target : null, lamp: lamp || null,
                      crop: b.crop || null, clamp: b.clamp === false ? false : undefined };
          // A named base keeps its NAME, and appends only what was changed on
          // top of it, so `bay`, `bay_az100` and `bay_z6` are distinct files.
          c.key = b.alias ? aliasKey(b, c) : camKey(c);
          cams.push(c);
        }
      }
    }
  }
  }
}
for (const c of camSpecs) {
  c.view = c.view || plainViews[0] || "free";
  if (!ALL.includes(c.view)) { console.error(`--cam view "${c.view}" is not one of ${ALL.join(", ")}`); process.exit(1); }
  c.key = camKey(c);
  cams.push(c);
}
// FREE CAMERAS. `--eye=x,y,z --look=x,y,z` places the eye itself (car space,
// metres) and looks at a point — the hook turns the pair into an orbit and
// lifts the player's clamps for it. `--path=@keyframes.json` shoots a dolly:
// every keyframe is {az, el, dist, target?, eye?, look?, lamp?, view?} and
// `--path-steps` frames are interpolated per segment, so "how does the wrap
// read as the camera swings" is one strip instead of a hand-typed list.
const triples = (raw) => listOf(raw, ";").map((t) => t.split(",").map(Number))
  .filter((v) => v.length === 3 && v.every(Number.isFinite));
const eyeList = triples(flag("--eye", "")), lookList = triples(flag("--look", ""));
if ((argvHas("--eye") && !eyeList.length) || (argvHas("--look") && !lookList.length)) {
  console.error("--eye / --look want x,y,z[;x,y,z…] in car-space metres"); process.exit(1);
}
const noClamp = flag("--clamp", "1") === "0";
eyeList.forEach((eye, i) => {
  for (const look of (lookList.length ? lookList : [[0, 0.45, 0.2]])) {
    const c = { view: "free", alias: null, station: null, az: null, el: null, dist: null, zoom: 0, strafe: 0, dolly: 0,
                azNudge: 0, elNudge: 0, target: null, lamp: lampList[0] || null, crop: null, eye, look, clamp: false,
                key: `eye${xyzKey(eye)}${lookList.length > 1 ? `_look${xyzKey(look)}` : ""}` };
    cams.push(c);
  }
});
const pathSteps = Math.max(1, Number(flag("--path-steps", "6")) || 6);
const pathFrames = (() => {
  const raw = flag("--path", "");
  if (!raw) return [];
  const text = raw.startsWith("@") ? readFileSync(raw.slice(1), "utf8") : raw;
  const kfs = JSON.parse(text);
  if (!Array.isArray(kfs) || kfs.length < 2) { console.error("--path wants a JSON array of ≥2 keyframes"); process.exit(1); }
  const num = (v) => (typeof v === "string" ? angle(v) : v);
  const at = (t) => (t == null ? null : parseTarget(t).at);
  const lerp = (a, b, u) => (a == null || b == null ? (u < 1 ? a : b) : a + (b - a) * u);
  const lerp3 = (a, b, u) => (a && b ? a.map((v, i) => v + (b[i] - v) * u) : (u < 1 ? a : b));
  const out = [];
  for (let k = 0; k < kfs.length - 1; k++) {
    const A = kfs[k], B = kfs[k + 1];
    const last = k === kfs.length - 2;
    for (let i = 0; i < pathSteps + (last ? 1 : 0); i++) {
      const u = i / pathSteps;
      const tgt = lerp3(at(A.target), at(B.target), u);
      out.push({
        view: (i === 0 && A.view) || "free", alias: null, station: null, zoom: 0, strafe: 0, dolly: 0, azNudge: 0, elNudge: 0,
        az: lerp(num(A.az), num(B.az), u), el: lerp(num(A.el), num(B.el), u), dist: lerp(A.dist, B.dist, u),
        target: tgt ? { name: xyzKey(tgt), at: tgt } : null, lamp: A.lamp || null, crop: null,
        eye: lerp3(A.eye, B.eye, u), look: lerp3(A.look, B.look, u), clamp: false, path: true,
        key: `path${String(out.length + 1).padStart(2, "0")}`,
      });
    }
  }
  return out;
})();
cams.push(...pathFrames);
if (!cams.length) { console.error("no camera to shoot — give --views, a --cam, a --station, --eye or --path"); process.exit(1); }
const camsOf = (view) => cams.filter((c) => c.view === view);

// ── timing ──────────────────────────────────────────────────────────────────
const ms = (t0) => +(Date.now() - t0);
/** loadavg once, up front: every number below is only as good as this one. */
function loadavg1() {
  try { return +readFileSync("/proc/loadavg", "utf8").split(" ")[0]; } catch { return null; }
}

// ── labels and sheets ───────────────────────────────────────────────────────
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const BAR = 34;

/** Burn a two-line caption bar UNDER the frame. sharp cannot read and write the
 *  same path, so this goes through a sibling temp and renames. */
async function labelPng(file, title, sub) {
  const meta = await sharp(file).metadata();
  const { width: w, height: h } = meta;
  const body = await sharp(file).png().toBuffer();
  const svg = Buffer.from(`<svg width="${w}" height="${BAR}">`
    + `<rect width="${w}" height="${BAR}" fill="#0d0f14"/>`
    + `<text x="10" y="15" fill="#f2f4f8" font-family="monospace" font-size="13">${esc(title)}</text>`
    + `<text x="10" y="28" fill="#8b93a3" font-family="monospace" font-size="11">${esc(sub)}</text>`
    + `</svg>`);
  const tmp = join(outDir, `.lbl-${basename(file)}`);
  await sharp({ create: { width: w, height: h + BAR, channels: 3, background: "#0d0f14" } })
    .composite([{ input: body, left: 0, top: 0 }, { input: svg, left: 0, top: h }])
    .png().toFile(tmp);
  renameSync(tmp, file);
}

/** Auto-refreshing HTML gallery — one card per shot as it lands (`--live`). */
function writeLiveGallery(shots, file, heading) {
  const cards = shots.map((s, i) => {
    const fn = basename(s.png);
    const title = `${s.team} · ${s.name} · ${s.view}`;
    return `<figure style="margin:0;background:#1a1d24;border-radius:8px;overflow:hidden">`
      + `<img src="${fn}" style="width:100%;display:block" loading="lazy" alt="${esc(title)}"/>`
      + `<figcaption style="padding:8px 10px;font:12px/1.3 monospace;color:#c8cdd8">`
      + `#${i + 1} ${esc(title)}</figcaption></figure>`;
  }).join("\n");
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8">`
    + `<meta http-equiv="refresh" content="3">`
    + `<title>${esc(heading)} (${shots.length})</title>`
    + `<style>body{margin:0;padding:16px;background:#0d0f14;color:#e8eaed;font-family:system-ui,sans-serif}`
    + `h1{font-size:16px;font-weight:600;margin:0 0 12px}`
    + `.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(320px,1fr));gap:12px}</style>`
    + `</head><body><h1>${esc(heading)} — ${shots.length} shot(s)</h1>`
    + `<div class="grid">${cards}</div></body></html>`;
  writeFileSync(file, html);
}

/** A labelled grid of frames. `items` is [{png, title, sub}]. */
async function writeSheet(items, file, heading, cols) {
  if (!items.length) return null;
  const first = await sharp(items[0].png).metadata();
  const cw = cell, ch = Math.round(cell * first.height / first.width);
  const n = cols || Math.min(items.length, Math.max(1, Math.round(Math.sqrt(items.length * 1.6))));
  const rows = Math.ceil(items.length / n);
  const PAD = 10, LAB = 30, HEAD = 30;
  const W = n * (cw + PAD) + PAD, H = HEAD + rows * (ch + LAB + PAD) + PAD;
  const comp = [], svg = [`<text x="${PAD}" y="20" fill="#fff" font-family="monospace" font-size="14">${esc(heading)}</text>`];
  for (let i = 0; i < items.length; i++) {
    const c = i % n, r = (i / n) | 0;
    const x = PAD + c * (cw + PAD), y = HEAD + PAD + r * (ch + LAB + PAD);
    comp.push({ input: await sharp(items[i].png).resize(cw, ch, { fit: "fill" }).toBuffer(), left: x, top: y });
    svg.push(`<text x="${x}" y="${y + ch + 14}" fill="#e6e9ef" font-family="monospace" font-size="12">${esc(items[i].title)}</text>`);
    if (items[i].sub) svg.push(`<text x="${x}" y="${y + ch + 26}" fill="#8b93a3" font-family="monospace" font-size="10">${esc(items[i].sub)}</text>`);
  }
  comp.push({ input: Buffer.from(`<svg width="${W}" height="${H}">${svg.join("")}</svg>`), left: 0, top: 0 });
  await sharp({ create: { width: W, height: H, channels: 3, background: "#14161c" } })
    .composite(comp).png().toFile(file);
  return file;
}

function escSvg(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");
}
function labelSvg(title, sub, w, h) {
  return Buffer.from(
    `<svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg">`
    + `<rect width="${w}" height="${h}" fill="#14161a"/>`
    + `<text x="${w / 2}" y="${h * 0.46}" font-family="DejaVu Sans, sans-serif" font-size="${Math.round(h * 0.40)}"`
    + ` font-weight="700" fill="#f0f0f2" text-anchor="middle">${escSvg(title)}</text>`
    + `<text x="${w / 2}" y="${h * 0.86}" font-family="DejaVu Sans, sans-serif" font-size="${Math.round(h * 0.30)}"`
    + ` fill="#9a9ca3" text-anchor="middle">${escSvg(sub)}</text></svg>`);
}

/** One cell per team — multi-team rollup grid. */
async function buildTeamRollup(entries, { surveyName, liveBuild, view }) {
  if (!entries.length) return null;
  const cols = Math.min(4, entries.length);
  const rows = Math.ceil(entries.length / cols);
  const cellW = 480, cellH = 270, labH = 40, pad = 6;
  const tileW = cellW + pad * 2, tileH = cellH + labH + pad;
  const W = cols * tileW, H = rows * tileH;
  const buildNote = liveBuild != null ? `build ${liveBuild}` : "local";
  const tiles = await Promise.all(entries.map(async (e, i) => {
    const gx = (i % cols) * tileW, gy = Math.floor(i / cols) * tileH;
    const img = await sharp(e.png).resize(cellW, cellH, { fit: "cover" }).png().toBuffer();
    const oracleNote = e.oracleHidden != null ? ` · occl ${Math.round(e.oracleHidden * 100)}%` : "";
    const sub = `${view} · ${e.design}${oracleNote} · ${buildNote}`;
    return [
      { input: img, left: gx + pad, top: gy + pad },
      { input: labelSvg(e.teamLabel || e.teamId.toUpperCase(), sub, cellW, labH), left: gx + pad, top: gy + pad + cellH },
    ];
  }));
  const tag = surveyName || "survey";
  const sheet = join(outDir, `all-teams-${tag}-${view}-rollup.png`);
  await sharp({ create: { width: W, height: H, channels: 3, background: { r: 16, g: 17, b: 20 } } })
    .composite(tiles.flat()).png().toFile(sheet);
  return sheet;
}

let _oracleParts = null, _oracleAtlas = null;
const _oracleCache = new Map();
function oracleHiddenPct(teamId, spineLogo, cam) {
  if (!_oracleParts) _oracleParts = loadParts();
  if (!_oracleAtlas) _oracleAtlas = loadAtlas();
  const key = teamId + "|" + spineLogo + "|" + cam.az + "|" + cam.el + "|" + cam.dist;
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

/** WHICH DESIGN FLAGS CANNOT PAINT ANYTHING on the car they were given.
 *  LiveryTex owns the answer (FILL_SURFACES / fillInert — the same table the
 *  garage sheet greys a row with), so the tool and the sheet cannot disagree.
 *  This is the class of mistake the tool has shipped twice: `--spineLogo=wrap`
 *  used to be a silent no-op, and a run's JSON sidecar recorded the flag
 *  anyway, because that is the CONFIG and not what was painted. Now a `sunTint`
 *  handed to a car whose crown is not a wrap says so before the browser boots. */
function inertFlags(designList) {
  if (!designList || !designList.length) return [];
  let LT;
  try { LT = loadAtlas().LT; } catch (_) { return []; }
  if (!LT || !LT.fillInert) return [];
  const out = [];
  for (const d of designList) {
    for (const k of Object.keys(d)) {
      if (k === "name" || k.startsWith("part.")) continue;
      if (LT.fillInert(k, d)) {
        const need = (LT.FILL_SURFACES.find((f) => f.key === k) || {}).why || "";
        out.push({ design: d, field: k, why: need });
      }
    }
  }
  return out;
}

/** The team default's SPINE TOP, for the occlusion oracle when a run walks
 *  liveries rather than designs. */
let _teamCrown = null;
function teamCrown(teamId) {
  if (!_teamCrown) {
    const A = loadAtlas();
    _teamCrown = Object.fromEntries(A.Teams.LIST.map((t) => [t.id, (A.Liveries.forTeam(t)[0] || {}).spineLogo || "logo"]));
  }
  return _teamCrown[teamId] || "logo";
}

/** Fraction of pixels that changed between two PNGs (any channel off by more
 *  than 24/255), on the smaller of the two sizes. `null` when `a` is absent. */
async function pixelDiff(a, b, overlayOut = null) {
  if (!existsSync(a) || !existsSync(b)) return null;
  const [ma, mb] = await Promise.all([sharp(a).metadata(), sharp(b).metadata()]);
  const w = Math.min(ma.width, mb.width), h = Math.min(ma.height, mb.height);
  const [ra, rb] = await Promise.all([a, b].map((f) => sharp(f).resize(w, h, { fit: "fill" }).removeAlpha().raw().toBuffer()));
  let changed = 0;
  // The OVERLAY is `b` with every changed pixel pulled toward magenta, so a
  // "4.2 % changed" has a WHERE: a number cannot say whether the change was
  // the crown or the wall reflection behind it.
  const out = overlayOut ? Buffer.from(rb) : null;
  for (let i = 0; i < ra.length; i += 3) {
    if (Math.abs(ra[i] - rb[i]) > 24 || Math.abs(ra[i + 1] - rb[i + 1]) > 24 || Math.abs(ra[i + 2] - rb[i + 2]) > 24) {
      changed++;
      if (out) { out[i] = (255 * 0.7 + rb[i] * 0.3) | 0; out[i + 1] = (rb[i + 1] * 0.3) | 0; out[i + 2] = (190 * 0.7 + rb[i + 2] * 0.3) | 0; }
    }
  }
  if (out) await sharp(out, { raw: { width: w, height: h, channels: 3 } }).png().toFile(overlayOut);
  return +(changed / (ra.length / 3)).toFixed(4);
}

/** A list of {a, b, labelA, labelB, key} shot pairs → Δ% + overlay each, a
 *  three-column pair sheet (A · B · overlay), and the pairs as a record. */
async function writePairs(pairs, file, heading) {
  if (!pairs.length) return { sheet: null, pairs: [] };
  const dir = join(outDir, "diff");
  mkdirSync(dir, { recursive: true });
  const items = [], out = [];
  for (const p of pairs) {
    const overlay = join(dir, `${safe(p.key)}.diff.png`);
    const diff = await pixelDiff(p.a.png, p.b.png, overlay);
    out.push({ key: p.key, a: p.a.png, b: p.b.png, diff, overlay });
    items.push({ png: p.a.png, title: titleOf(p.a), sub: p.labelA });
    items.push({ png: p.b.png, title: titleOf(p.b), sub: `${p.labelB} · Δ ${(diff * 100).toFixed(1)}% px` });
    items.push({ png: overlay, title: "changed pixels", sub: `${p.key}` });
    console.log(`pair ${p.key}: ${(diff * 100).toFixed(1)}% of pixels changed -> ${overlay}`);
  }
  const sheet = await writeSheet(items, file, heading, 3);
  return { sheet, pairs: out };
}

/** The flat atlas art beside the lit frame. spine-station replays the real
 *  buildAtlas into a recording context, so the flank region is exactly what
 *  the painter drew, before the cover curved it and the tyre got in the way.
 *  `--flat` writes one per shot (spineSide region; the crown's flank graphic
 *  when the design names no side) and a two-column sheet. */
let _flatAtlas = null;
async function flatArtFor(shot, dir) {
  if (!_flatAtlas) _flatAtlas = loadAtlas();
  const d = shot.design || {};
  const fields = {};
  for (const [k, v] of Object.entries(d)) {
    if (k === "name" || k === "driver" || k.startsWith("part.") || k.startsWith("light.")) continue;
    fields[k] = /^#[0-9a-fA-F]{6}$/.test(String(v))
      ? [parseInt(v.slice(1, 3), 16) / 255, parseInt(v.slice(3, 5), 16) / 255, parseInt(v.slice(5, 7), 16) / 255]
      : v;
  }
  const side = d.spineSide || "none";
  const sw = spineSweep(_flatAtlas, { team: shot.team, logo: d.spineLogo || null, sides: [side], fields, livery: shot.livery || null });
  const sample = side === "none" ? sw.base : (sw.rows[0] && sw.rows[0].sample);
  if (!sample) return null;
  const file = join(dir, `${safe(basename(shot.png, ".png"))}.flat.png`);
  await writeFlatPng(sample, file, 3);
  return file;
}

/** Rows = car (team · design · viewport), columns = camera. A product of axes
 *  is unreadable as a flat grid past a dozen frames; this is the grid the
 *  matrix actually has. */
async function writeMatrixSheet(shots, file) {
  const rowKey = (s) => `${s.team} · ${s.name}${vps.length > 1 ? ` · ${s.vp}` : ""}${s.dpr > 1 ? ` @${s.dpr}x` : ""}`;
  const rows = [...new Set(shots.map(rowKey))], cols = [...new Set(shots.map((s) => s.cam))];
  if (rows.length < 2 || cols.length < 2) return null;
  const first = await sharp(shots[0].png).metadata();
  const cw = cell, ch = Math.round(cell * first.height / first.width);
  const PAD = 8, LAB = 24, HEAD = 34, LEFT = 260;
  const W = LEFT + cols.length * (cw + PAD) + PAD, H = HEAD + LAB + rows.length * (ch + PAD) + PAD;
  const comp = [], svg = [];
  cols.forEach((c, j) => svg.push(`<text x="${LEFT + PAD + j * (cw + PAD)}" y="${HEAD + 16}" fill="#e6e9ef" font-family="monospace" font-size="12">${esc(c)}</text>`));
  for (let i = 0; i < rows.length; i++) {
    const y = HEAD + LAB + PAD + i * (ch + PAD);
    svg.push(`<text x="${PAD}" y="${y + ch / 2}" fill="#e6e9ef" font-family="monospace" font-size="12">${esc(rows[i])}</text>`);
    for (let j = 0; j < cols.length; j++) {
      const sh = shots.find((x) => rowKey(x) === rows[i] && x.cam === cols[j]);
      if (!sh) continue;
      comp.push({ input: await sharp(sh.png).resize(cw, ch, { fit: "fill" }).toBuffer(), left: LEFT + PAD + j * (cw + PAD), top: y });
    }
  }
  svg.unshift(`<text x="${PAD}" y="22" fill="#fff" font-family="monospace" font-size="14">garage matrix — ${rows.length} car(s) × ${cols.length} camera(s)</text>`);
  comp.push({ input: Buffer.from(`<svg width="${W}" height="${H}">${svg.join("")}</svg>`), left: 0, top: 0 });
  await sharp({ create: { width: W, height: H, channels: 3, background: "#14161c" } }).composite(comp).png().toFile(file);
  return file;
}

function surveyTag() {
  const bits = [];
  if (views.length === 1) bits.push(views[0]);
  else if (views.length) bits.push(views.length + "views");
  if (rollupOnly) bits.push("rollup");
  return bits.join("_") || "survey";
}

function resumeTeamSet() {
  if (!argvHas("--resume")) return new Set();
  const done = new Set();
  const metaPath = join(outDir, multiTeam ? "all-teams-angles.json" : `${teams[0]}-angles.json`);
  if (existsSync(metaPath)) {
    try {
      const meta = JSON.parse(readFileSync(metaPath, "utf8"));
      for (const e of meta.rollupEntries || []) done.add(e.teamId);
      for (const s of meta.shots || []) done.add(s.team);
    } catch (_) { /* stale meta */ }
  }
  for (const tid of teams) {
    const tag = designs ? "def" : liveries[0];
    const cam = (rollupOnly && camsOf(rollupView)[0]) || cams[0];
    const png = join(outDir, shotName({ team: tid, tag, cam: cam.key, view: cam.view,
      vp: `${vp[0]}x${vp[1]}`, i: 0, az: "", el: "", dist: "" }));
    if (existsSync(png)) done.add(tid);
  }
  return done;
}

function pushRollupEntry(rollupEntries, teamId, teamLabel, name, pick, designFields) {
  if (!rollupEntries || !views.includes(rollupView) || !pick) return;
  const entry = { teamId, teamLabel, design: name, png: pick.png, view: rollupView };
  if (withOracle && designFields && designFields.spineLogo) {
    entry.oracleHidden = oracleHiddenPct(teamId, designFields.spineLogo, pick);
  }
  rollupEntries.push(entry);
}

// ── --against: the ref's tree, served from memory ───────────────────────────
const MIME = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css",
  ".json": "application/json", ".png": "image/png", ".svg": "image/svg+xml",
  ".webp": "image/webp", ".ktx2": "application/octet-stream" };

/**
 * Every js/css/shell path that DIFFERS at `ref`, mapped to the ref's bytes —
 * or to null where the file does not exist there, which the route answers 404
 * so a missing script is a visible boot failure rather than the working tree's
 * version quietly standing in and making the A and the B the same car.
 */
function refBlobs(ref) {
  const changed = execFileSync("git",
    ["diff", "--name-only", ref, "--", "js", "css", "index.html", "tools/carview.html"],
    { encoding: "utf8" }).split("\n").map((s) => s.trim()).filter(Boolean);
  const map = new Map();
  for (const p of changed) {
    let buf = null;
    try { buf = execFileSync("git", ["show", `${ref}:${p}`], { maxBuffer: 64 << 20 }); } catch { buf = null; }
    map.set("/" + p, buf);
  }
  return map;
}
function blobRoute(blobs) {
  if (!blobs) return null;
  return (req, res, url) => {
    const key = url.pathname === "/" ? "/index.html" : decodeURIComponent(url.pathname);
    if (!blobs.has(key)) return false;
    const buf = blobs.get(key);
    if (buf == null) { res.writeHead(404).end("absent at ref"); return true; }
    res.writeHead(200, {
      "Content-Type": MIME[extname(key).toLowerCase()] || "application/octet-stream",
      "Content-Length": buf.length, "Cache-Control": "no-store",
    });
    res.end(buf);
    return true;
  };
}

/** Gate the CANVAS half only — the setup sheet always has text spread. */
async function bayRendered(png, vpW) {
  const meta = await sharp(png).metadata();
  const cut = Math.max(80, Math.round(vpW * 0.55));
  const st = await sharp(png).extract({
    left: 0, top: 0, width: cut, height: meta.height,
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

/** Output file name — `--name` template over {team} {tag} {cam} {view} {vp} {i}
 *  {az} {el} {dist}; the default reproduces the historic names and appends the
 *  viewport only when more than one is walked. */
const safe = (s) => String(s).replace(/[^A-Za-z0-9_.-]+/g, "_");
function shotName(fields) {
  const tpl = nameTpl || `{team}-{tag}-{cam}${vps.length > 1 ? "-{vp}" : ""}${dprs.length > 1 ? "@{dpr}x" : ""}`;
  return tpl.replace(/\{(\w+)\}/g, (_, k) => safe(fields[k] ?? "")) + ".png";
}

/** Cut a frame to `--crop` (fractions) in place — after the render gate, which
 *  scores the whole canvas, and before the label bar. */
async function cropPng(png, box = crop) {
  if (!box) return;
  const meta = await sharp(png).metadata();
  const left = Math.round(box[0] * meta.width), top = Math.round(box[1] * meta.height);
  const width = Math.max(8, Math.min(meta.width - left, Math.round(box[2] * meta.width)));
  const height = Math.max(8, Math.min(meta.height - top, Math.round(box[3] * meta.height)));
  const tmp = join(outDir, `.crop-${basename(png)}`);
  await sharp(png).extract({ left, top, width, height }).png().toFile(tmp);
  renameSync(tmp, png);
}

/** The `__apex.garageFrame` options for a camera record. */
function hookOptsFor(cam) {
  return {
    zoom: cam.zoom, strafe: cam.strafe, dolly: cam.dolly, azNudge: cam.azNudge, elNudge: cam.elNudge,
    az: cam.az ?? undefined, el: cam.el ?? undefined, dist: cam.dist ?? undefined,
    target: cam.target ? cam.target.at : undefined,
    lamp: cam.lamp === "off" ? null : (cam.lamp || undefined),
    eye: cam.eye || undefined, look: cam.look || undefined,
    // `--clamp=0`, an eye, or a path frame may leave the player's orbit range.
    clamp: (noClamp || cam.clamp === false) ? false : undefined,
  };
}

/** A camera from a SESSION command: a station / alias / view name, or an
 *  object with any of view, cam, station, az, el, dist, target, lamp, zoom,
 *  pan, eye, look, clamp, crop. Throws instead of exiting — the browser is up. */
function camFromSpec(spec) {
  const o = typeof spec === "string" ? (isAlias(spec) ? { cam: spec } : { view: spec }) : (spec || {});
  let c;
  if (o.cam || o.station) {
    const name = o.cam || o.station;
    if (!isAlias(name) && !/[,:]/.test(name)) throw new Error(`no camera "${name}" — stations: ${Object.keys(STATIONS).join(", ")}; aliases: ${Object.keys(CAM_ALIAS).join(", ")}`);
    c = parseCam(name);
    if (!c.view) c.view = "free";
  } else {
    c = { view: o.view || "free", alias: null, station: null, az: null, el: null, dist: null, target: null, lamp: null,
          crop: null, strafe: 0, dolly: 0, zoom: 0, azNudge: 0, elNudge: 0 };
    if (!ALL.includes(c.view)) throw new Error(`no view "${c.view}" — one of ${ALL.join(", ")}`);
  }
  const ang = (v) => (typeof v === "string" ? angle(v) : Number(v));
  if (o.az != null) c.az = ang(o.az);
  if (o.el != null) c.el = ang(o.el);
  if (o.dist != null) c.dist = Number(o.dist);
  if (o.target != null) c.target = parseTarget(o.target, false);
  if (o.lamp !== undefined) c.lamp = o.lamp || "off";
  if (Array.isArray(o.eye) && Array.isArray(o.look)) { c.eye = o.eye.map(Number); c.look = o.look.map(Number); c.clamp = false; }
  if (o.clamp === false) c.clamp = false;
  if (o.zoom) c.zoom = Number(o.zoom) | 0;
  if (Array.isArray(o.pan)) { c.strafe = Number(o.pan[0]) || 0; c.dolly = Number(o.pan[1]) || 0; }
  if (Array.isArray(o.crop) && o.crop.length === 4) c.crop = o.crop.map(Number);
  c.key = o.key ? safe(o.key) : (c.alias ? aliasKey(parseCam(c.alias), c) : camKey(c));
  return c;
}

/** Debounced file watching over files and directories (recursive). */
function watchPaths(paths, onChange) {
  let timer = null;
  const changed = new Set();
  for (const p of paths) {
    try {
      const st = statSync(p);
      fsWatch(p, { recursive: st.isDirectory() }, (_ev, name) => {
        changed.add(name ? join(p, String(name)) : p);
        clearTimeout(timer);
        timer = setTimeout(() => { const list = [...changed]; changed.clear(); onChange(list); }, 400);
      });
    } catch (e) {
      console.warn(`watch: cannot watch ${p}: ${e.message}`);
    }
  }
}

async function frame(page, teamId, tag, cam, dir, capOpts = {}) {
  const tSettle = Date.now();
  const view = cam.view;
  const vpCur = capOpts.vp || vp;
  const hookOpts = hookOptsFor(cam);
  const absolute = cam.az != null || cam.el != null || cam.dist != null || view === "free"
    || !!cam.target || !!cam.lamp || !!cam.eye;
  let framed;
  // The hook path frames in one call; the DOM path is what a player can click
  // and cannot express an absolute orbit, so any absolute camera takes the hook.
  if (useStoreTeam || absolute) {
    framed = await page.evaluate(({ v, o }) => {
      const a = window.__apex;
      if (!a.garageFrame) return { ok: false, error: "no garageFrame hook" };
      return a.garageFrame(v, o);
    }, { v: view, o: hookOpts });
    if (!framed.ok) throw new Error(`${teamId}/${tag}/${cam.key}: ${framed.error || "frame failed"}`);
  } else {
    const clicked = await page.evaluate((v) => {
      const b = document.querySelector('#cs-stack [data-cs-view="' + v + '"]');
      if (!b) return false;
      b.click();
      return true;
    }, view);
    if (!clicked) throw new Error(`no camera preset "${view}" in #cs-stack`);
    await nudge(page, cam.zoom > 0 ? "cs-view-in" : "cs-view-out", cam.zoom);
    await nudge(page, cam.strafe > 0 ? "cs-pan-right" : "cs-pan-left", cam.strafe);
    await nudge(page, cam.dolly > 0 ? "cs-pan-fwd" : "cs-pan-back", cam.dolly);
    await nudge(page, cam.azNudge > 0 ? "cs-view-right" : "cs-view-left", cam.azNudge);
    await nudge(page, cam.elNudge > 0 ? "cs-view-up" : "cs-view-down", cam.elNudge);
  }
  await settleGarage(page, { frames: viewSettle, awaitMs: viewAwait });
  const settleMs = ms(tSettle);
  const vpTag = `${vpCur[0]}x${vpCur[1]}`;
  const png = join(dir, capOpts.name ? `${safe(capOpts.name)}.png`
    : shotName({ team: teamId, tag, cam: cam.key, view, vp: vpTag, i: capOpts.index ?? 0, dpr: capOpts.dpr || 1,
      az: cam.az != null ? degs(cam.az) : "", el: cam.el != null ? degs(cam.el) : "", dist: cam.dist ?? "" }));
  let gate = null, capMs = 0, gateMs = 0, tries = 0;
  for (let attempt = 0; attempt < gateRetries; attempt++) {
    tries++;
    if (attempt) await settleGarage(page, { frames: Math.max(2, viewSettle - 2), awaitMs: viewAwait });
    const tCap = Date.now();
    const shot = await screenshotGameCanvas(page, png, {
      skipAwait: true,
      skipVisible: !!capOpts.gameVisible,
    });
    capMs += ms(tCap);
    const tGate = Date.now();
    gate = await bayRendered(png, vpCur[0]);
    gateMs += ms(tGate);
    if (gate.ok) {
      // `--crop` beats a station's own crop: the user named the region.
      await cropPng(png, cropOff ? null : (crop || cam.crop || null));
      // READ THE CAMERA BACK AFTER THE SETTLE, never the value garageFrame
      // returned. `garageCam().effDist` is published by the LAST RENDERED
      // FRAME, so a read taken inside the framing call reports the previous
      // shot's distance: measured 2026-09-10, an absolute --dist=6.5 logged
      // 11.2 (the preset it replaced) and the next shot logged 6.5. The frames
      // themselves were right; the sidecar and the caption bar were one shot
      // behind, which is the half of this tool that is EVIDENCE.
      const c = await page.evaluate(() => window.__apex.garageCam());
      // Occlusion from the camera actually used: how much of the flank mark the
      // car's own tyres and bodywork hide at THIS az/el/dist. It used to label
      // rollups only; a sweep is a question only this number answers.
      const occl = argvHas("--oracle")
        ? oracleHiddenPct(teamId, (capOpts.design && capOpts.design.spineLogo) || teamCrown(teamId),
            { az: c.az, el: c.el, dist: c.dist ?? c.effDist })
        : null;
      const baselineDiff = baselineDir ? await pixelDiff(join(baselineDir, basename(png)), png) : null;
      return {
        view, cam: cam.key, tag, png, vp: vpTag, spread: gate.spread, via: shot.via || "page-clip",
        occl: occl == null ? undefined : +(occl * 100).toFixed(1),
        baselineDiff: baselineDiff == null ? undefined : baselineDiff,
        dpr: capOpts.dpr || 1,
        az: +c.az.toFixed(3), el: +c.el.toFixed(3), dist: +(c.dist ?? c.effDist).toFixed(3),
        pan: c.pan ? c.pan.map((n) => +n.toFixed(3)) : null,
        ms: { settle: settleMs, capture: capMs, gate: gateMs, tries },
      };
    }
  }
  throw new Error(`${tag}/${cam.key}: the bay never rendered (canvas pixel spread ${gate.spread})`);
}

async function applyLivery(page, teamId, livId) {
  const got = await page.evaluate(({ team, id }) => {
    const t = Teams.LIST.find((x) => x.id === team);
    if (!t) return { ok: false, error: `no team "${team}"` };
    const list = Liveries.forTeam(t);
    if (!list.some((l) => l.id === id)) {
      return { ok: false, error: `no livery "${id}"`, have: list.map((l) => l.id) };
    }
    GameStore.store.set("livery." + team, id);
    return { ok: true, name: list.find((l) => l.id === id).name };
  }, { team: teamId, id: livId });
  if (!got.ok) {
    const extra = got.have ? ` (have ${got.have.join(",")})` : "";
    throw new Error(`${got.error}${extra}`);
  }
  await settleGarage(page, { frames: liverySettle, awaitMs: liveryAwait });
  return got.name;
}

/** Custom id so mesh/atlas caches (keyed on getLiveryId) miss — design walk, not catalog. */
async function applyDesign(page, teamId, fields, base) {
  const got = await page.evaluate(({ team, fields, base, clearLogos }) => {
    const t = Teams.LIST.find((x) => x.id === team);
    if (!t) return { ok: false, error: `no team "${team}"` };
    // `--base` paints the design over a named catalog livery, not the default.
    const list = Liveries.forTeam(t);
    const def = base ? list.find((l) => l.id === base) : list[0];
    if (!def) return { ok: false, error: `no livery "${base}"`, have: list.map((l) => l.id) };
    // The field list is Liveries' own (Liveries.FIELDS), so the tool cannot
    // fall behind the livery system the way the hand-copied lists did.
    const known = (typeof Liveries !== "undefined" && Liveries.FIELDS) || [];
    const LT = typeof LiveryTex !== "undefined" ? LiveryTex : null;
    const C3 = typeof Car3D !== "undefined" ? Car3D : null;
    // These registries are not one shape: the ID lists are arrays but
    // Car3D.FIN_SHAPES is a frozen MAP of shape -> profile, so `.concat` threw.
    // Normalise rather than hard-code which is which — the next registry to
    // arrive should not be able to break the walk.
    const ids = (reg, extra) => {
      if (!reg) return null;
      const list = Array.isArray(reg) ? reg.slice() : Object.keys(reg);
      if (extra && list.indexOf(extra) < 0) list.push(extra);
      return list;
    };
    const ENUMS = {
      spineSide: ids(LT && LT.SPINE_SIDE_IDS),
      spineLogo: ids(LT && LT.SPINE_LOGO_IDS),
      finStyle: ids(LT && LT.TAIL_STYLE_IDS),
      // `none` is a legal finShape and is NOT in the profile map (it is the
      // absence of one) — see SP_HULL_GEOM_FIELDS in the garage sheet.
      finShape: ids(C3 && C3.FIN_SHAPES, "none"),
      tcam: ids(C3 && C3.TCAM_IDS),
      coverVents: ids(C3 && C3.COVER_VENT_IDS),
      spineHeight: ids(C3 && C3.SPINE_HEIGHT_IDS),
    };
    const liv = Object.assign({}, def);
    const parts = [];
    // `part.<category>` keys are catalog PARTS, fitted through the same hook the
    // garage sheet's own picks go through; `driver` is the seat (number, helmet,
    // T-cam); `light.<knob>` is a lighting-tuner knob; the rest are livery fields.
    const fit = {}, light = {};
    let seat = null;
    for (const k of Object.keys(fields)) {
      if (k === "name") continue;
      const raw = String(fields[k]);
      if (k === "driver") {
        seat = Number(raw);
        if (!Number.isInteger(seat) || !t.drivers[seat]) return { ok: false, error: `no seat "${raw}"`, have: t.drivers.map((_, i) => String(i)) };
        parts.push("d" + seat);
        continue;
      }
      if (k.startsWith("light.")) {
        const knob = k.slice(6), known = window.__apex.lightTune();
        if (!(knob in known)) return { ok: false, error: `no lighting knob "${knob}"`, have: Object.keys(known) };
        light[knob] = Number(raw);
        parts.push(knob + "-" + raw);
        continue;
      }
      if (k.startsWith("part.")) {
        const cat = k.slice(5);
        const catDef = typeof Parts !== "undefined" && Parts.CATALOG.find((c) => c.id === cat);
        if (!catDef) {
          return { ok: false, error: `no parts category "${cat}"`,
                   have: typeof Parts !== "undefined" ? Parts.CATALOG.map((c) => c.id) : [] };
        }
        if (catDef.options && !catDef.options.some((o) => o.id === raw)) {
          return { ok: false, error: `no ${cat} part "${raw}"`, have: catDef.options.map((o) => o.id) };
        }
        fit[cat] = raw;
        parts.push(cat + "-" + raw);
        continue;
      }
      if (known.length && known.indexOf(k) < 0) {
        return { ok: false, error: `no livery field "${k}"`, have: known };
      }
      const en = ENUMS[k];
      const hex = /^#[0-9a-fA-F]{6}$/.test(raw);
      if (en && en.length && !hex && en.indexOf(raw) < 0) {
        return { ok: false, error: `no ${k} "${raw}"`, have: en };
      }
      liv[k] = hex
        ? [parseInt(raw.slice(1, 3), 16) / 255, parseInt(raw.slice(3, 5), 16) / 255,
          parseInt(raw.slice(5, 7), 16) / 255]
        : raw;
      parts.push(k + "-" + raw.replace(/^#/, ""));
    }
    const id = "_shot_" + (parts.join("_") || "def");
    liv.id = id;
    liv.name = id;
    const customs = (GameStore.store.get("livery.custom." + team, []) || []).filter((l) => l.id !== id);
    customs.push(liv);
    GameStore.store.set("livery.custom." + team, customs);
    GameStore.store.set("livery." + team, id);
    if (typeof GarageScene !== "undefined" && GarageScene.dropPreviewMeshes) GarageScene.dropPreviewMeshes();
    if (Object.keys(fit).length) {
      const r = window.__apex.garageParts(fit);
      if (!r || !r.ok) return { ok: false, error: `garageParts: ${(r && r.error) || "refused"}` };
    }
    if (seat != null) {
      const r = window.__apex.garageTeam(team, seat);
      if (!r || !r.ok) return { ok: false, error: `garageTeam seat ${seat}: ${(r && r.error) || "refused"}` };
    }
    if (Object.keys(light).length) window.__apex.lightTune(light);
    if (clearLogos) {
      delete liv.logo; delete liv.logo2; delete liv.logo3;
      parts.push("logos-default");
    }
    if (base && base !== "default") parts.unshift("on-" + base);
    const label = fields.name ? String(fields.name) : (parts.join(" ") || "default");
    return { ok: true, name: label, tag: fields.name ? String(fields.name) : (parts.join("_") || "def") };
  }, { team: teamId, fields, base: base || baseLivery, clearLogos });
  if (!got.ok) {
    const extra = got.have ? ` (have ${got.have.join(",")})` : "";
    throw new Error(`${got.error}${extra}`);
  }
  await settleGarage(page, { frames: liverySettle, awaitMs: liveryAwait });
  return got;
}

/** Team tiles — the store index only binds before first paint, so after the
 *  first team the picker is the way in. Returns whether it had to switch. */
async function switchTeam(page, teamId) {
  if (useStoreTeam) {
    const got = await page.evaluate((id) => window.__apex.garageTeam(id), teamId);
    if (!got.ok) throw new Error(`garageTeam(${teamId}): ${got.error || "failed"}`);
    if (got.switched) await settleGarage(page, { frames: liverySettle, awaitMs: liveryAwait });
    if (!got.label) throw new Error(`garage opened but label empty after switch to ${teamId}`);
    return { switched: got.switched, label: got.label };
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
    }, null, { polling: 100, timeout: 15000 }).catch(() => {});
  }
  if (switched) await settleGarage(page, { frames: liverySettle, awaitMs: liveryAwait });
  const label = await page.evaluate(() => document.getElementById("cs-team")?.textContent || "");
  return { switched, label };
}

/** One full matrix — every team × (design | livery) × view — into `dir`. */
async function walk(browser, srvUrl, dir, side, opts = {}) {
  mkdirSync(dir, { recursive: true });
  const ownPage = !opts.page;
  const page = opts.page || await (opts.context || browser).newPage();
  const phase = {};
  const rollupEntries = opts.rollupEntries || null;
  const resumeSet = opts.resumeSet || new Set();
  const workTeams = opts.workTeams || teams;
  try {
    await page.setViewportSize({ width: vp[0], height: vp[1] });
    if (ownPage) {
      await installProbeInit(page, { backend: "webgl2", team: teamIndex(workTeams[0]) });
    }
    const tBoot = Date.now();
    await gotoGame(page, srvUrl, 120000);
    phase.boot = ms(tBoot);
    await page.evaluate(({ t, liv }) => {
      GameStore.store.set("livery." + t, liv);
    }, { t: workTeams[0], liv: liveries[0] });
    const tOpen = Date.now();
    await openGarage(page, { team: workTeams[0] });
    phase.open = ms(tOpen);

    const shots = [];
    let heads = null;
    let gameVisible = false;
    for (const teamId of workTeams) {
      if (resumeSet.has(teamId)) {
        console.log(`resume: skip ${teamId}`);
        continue;
      }
      const tSwitch = Date.now();
      const sw = await switchTeam(page, teamId);
      const switchMs = ms(tSwitch);
      const label = sw.label || "";
      if (!label) throw new Error(`garage opened but #cs-team empty for ${teamId}`);
      const shown = await page.evaluate(() => {
        const h = document.querySelector("#carsetup .sheet-head, #cs-inner .sheet-head");
        return h ? h.textContent.trim().slice(0, 80) : null;
      });
      if (!heads) heads = shown;
      console.log(`team sheet: ${label}  [switched=${sw.switched} ${switchMs}ms]`);

      const items = designs
        ? designs.flatMap((d) => (baseList.length ? baseList : [null]).map((b) => ({ design: d, base: b })))
        : liveries.map((l) => ({ livery: l }));
      for (const it of items) {
        let tag, name, designFields = null;
        const tagShots = [];
        if (it.design) {
          const got = await applyDesign(page, teamId, it.design, it.base);
          tag = got.tag;
          name = got.name;
          designFields = it.design;
        } else {
          name = await applyLivery(page, teamId, it.livery);
          tag = it.livery;
        }
        // Viewports are the inner walk: a resize re-lays the docked sheet out
        // and needs a settle, but not a team switch or a repaint.
        for (const v of vps) {
          if (vps.length > 1 || v !== vp) {
            await page.setViewportSize({ width: v[0], height: v[1] });
            await settleGarage(page, { frames: viewSettle, awaitMs: viewAwait });
          }
          for (const cam of cams) {
            const s = await frame(page, teamId, tag, cam, dir, {
              gameVisible, vp: v, index: shots.length, design: it.design || null, dpr: opts.dpr || 1,
            });
            gameVisible = true;
            s.team = teamId;
            s.name = name;
            if (it.design) s.design = it.design; else s.livery = it.livery;
            if (side) s.side = side;
            tagShots.push(s);
            shots.push(s);
            console.log(`shot ${teamId}/${tag}/${s.cam}${vps.length > 1 ? "@" + s.vp : ""}${opts.dpr > 1 ? "@" + opts.dpr + "x" : ""} via=${s.via}`
              + ` az ${s.az} el ${s.el} dist ${s.dist}`
              + `${s.occl != null ? ` occl ${s.occl}%` : ""}${s.baselineDiff != null ? ` Δbaseline ${(s.baselineDiff * 100).toFixed(1)}%` : ""}`
              + ` spread ${s.spread} [settle ${s.ms.settle} cap ${s.ms.capture} gate ${s.ms.gate}`
              + `${s.ms.tries > 1 ? ` tries ${s.ms.tries}` : ""}] -> ${s.png}`);
            if (doLive) {
              writeLiveGallery(shots, join(dir, "live.html"),
                `garage — ${teams.join(",")} · ${views.join(",")}`);
            }
          }
        }
        pushRollupEntry(rollupEntries, teamId, label, name,
          tagShots.find((s) => s.view === rollupView), designFields);
      }
    }
    return { shots, phase, sheetHead: heads, page, rollupEntries };
  } finally {
    if (ownPage && !opts.keepPage) await page.close().catch(() => {});
  }
}

/** `--serve`: one browser, one garage, commands on stdin as JSON lines, one
 *  JSON line back per command. A command is an object and may combine steps,
 *  applied in this order: team (+seat) → livery | design (+base) → frame →
 *  shot → diff → sheet → reload → status → quit. Each result echoes `id`. */
async function serveSession(browser, gameUrl) {
  const page = await browser.newPage();
  await page.setViewportSize({ width: vp[0], height: vp[1] });
  await installProbeInit(page, { backend: "webgl2", team: teamIndex(teams[0]) });
  const tBoot = Date.now();
  await gotoGame(page, gameUrl, 120000);
  await page.evaluate(({ t, liv }) => { GameStore.store.set("livery." + t, liv); }, { t: teams[0], liv: liveries[0] });
  await openGarage(page, { team: teams[0] });
  const st = { team: teams[0], tag: liveries[0], name: liveries[0], livery: liveries[0], design: null, base: null,
               cam: cams[0] || null, shots: [], n: 0 };
  const out = (o) => process.stdout.write(JSON.stringify(o) + "\n");
  const cameraNow = () => page.evaluate(() => window.__apex.garageCam());
  const reapply = async () => {
    await switchTeam(page, st.team);
    if (st.design) await applyDesign(page, st.team, st.design, st.base);
    else await applyLivery(page, st.team, st.livery);
  };
  const reload = async () => {
    // The static server serves js/ from the working tree, so a reload IS the
    // edited painter; the garage, team, paint and camera are put back after.
    await page.reload({ waitUntil: "domcontentloaded", timeout: 120000 });
    await page.waitForFunction(() => window.__apex && window.__apex.race, null, { polling: 200, timeout: 120000 });
    await openGarage(page, { team: st.team });
    await reapply();
  };
  const pngOf = (name) => {
    if (existsSync(String(name))) return String(name);
    const hit = st.shots.find((s) => basename(s.png, ".png") === name);
    return hit ? hit.png : join(outDir, `${safe(name)}.png`);
  };
  const run = async (cmd) => {
    const r = {};
    if (cmd.team) {
      const sw = await switchTeam(page, cmd.team);
      st.team = cmd.team; r.team = cmd.team; r.switched = sw.switched;
      if (cmd.seat != null) {
        const got = await page.evaluate(({ t, seat }) => window.__apex.garageTeam(t, seat), { t: cmd.team, seat: Number(cmd.seat) });
        if (!got.ok) throw new Error(`seat ${cmd.seat}: ${got.error || "refused"}`);
        if (got.switched) await settleGarage(page, { frames: liverySettle, awaitMs: liveryAwait });
        r.seat = got.seat;
      }
    }
    if (cmd.livery) {
      st.name = await applyLivery(page, st.team, String(cmd.livery));
      st.tag = st.livery = String(cmd.livery); st.design = null; st.base = null;
      r.livery = st.livery;
    }
    if (cmd.design && typeof cmd.design === "object") {
      const got = await applyDesign(page, st.team, cmd.design, cmd.base || null);
      st.tag = got.tag; st.name = got.name; st.design = cmd.design; st.base = cmd.base || null;
      r.design = got.name;
    }
    if (cmd.frame) {
      st.cam = camFromSpec(cmd.frame);
      const framed = await page.evaluate(({ v, o }) => window.__apex.garageFrame(v, o), { v: st.cam.view, o: hookOptsFor(st.cam) });
      if (!framed.ok) throw new Error(`frame: ${framed.error || "failed"}`);
      await settleGarage(page, { frames: viewSettle, awaitMs: viewAwait });
      r.cam = st.cam.key; r.camera = await cameraNow();
    }
    if (cmd.shot) {
      if (!st.cam) throw new Error("no camera — send a frame first");
      const s = await frame(page, st.team, st.tag, st.cam, outDir, {
        gameVisible: st.n > 0, index: st.n++, design: st.design,
        name: typeof cmd.shot === "string" ? cmd.shot : null,
      });
      s.team = st.team; s.name = st.name;
      if (st.design) s.design = st.design; else s.livery = st.livery;
      if (doLabel) await labelPng(s.png, titleOf(s), subOf(s));
      st.shots.push(s);
      r.shot = s;
    }
    if (Array.isArray(cmd.diff) && cmd.diff.length === 2) {
      const [a, b] = cmd.diff.map(pngOf);
      mkdirSync(join(outDir, "diff"), { recursive: true });
      const overlay = join(outDir, "diff", `${safe(basename(a, ".png"))}__${safe(basename(b, ".png"))}.diff.png`);
      r.diff = await pixelDiff(a, b, overlay);
      if (r.diff == null) throw new Error(`diff: missing ${existsSync(a) ? b : a}`);
      r.overlay = overlay;
    }
    if (cmd.sheet) {
      const file = join(outDir, typeof cmd.sheet === "string" ? `${safe(cmd.sheet)}.png` : "sheet.png");
      r.sheet = await writeSheet(st.shots.map((s) => ({ png: s.png, title: titleOf(s), sub: subOf(s) })), file,
        `garage session — ${st.shots.length} shot(s)`, sheetCols || undefined);
    }
    if (cmd.reload) { await reload(); r.reloaded = true; }
    if (cmd.status || Object.keys(cmd).every((k) => k === "id")) {
      r.status = { team: st.team, tag: st.tag, livery: st.livery, design: st.design, base: st.base,
                   cam: st.cam ? st.cam.key : null, shots: st.shots.length, out: outDir, camera: await cameraNow() };
    }
    return r;
  };
  // One thing at a time: stdin commands and watch events share a queue so a
  // reload never lands mid-shot.
  let chain = Promise.resolve();
  const enqueue = (fn) => { chain = chain.then(fn, fn); return chain; };
  if (watchList.length) {
    watchPaths(watchList, (files) => enqueue(async () => {
      const t = Date.now();
      try {
        await reload();
        const r = st.cam && st.shots.length ? await run({ shot: true }) : {};
        out({ event: "watch", files, ms: ms(t), ...r, ok: true });
      } catch (e) { out({ event: "watch", files, ok: false, error: String((e && e.message) || e) }); }
    }));
  }
  out({ ok: true, ready: true, team: st.team, livery: st.livery, cams: cams.map((c) => c.key), cam: st.cam ? st.cam.key : null,
        stations: Object.keys(STATIONS), out: outDir, bootMs: ms(tBoot), watch: watchList });
  await new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });
    rl.on("line", (line) => {
      if (!line.trim()) return;
      enqueue(async () => {
        let cmd;
        try { cmd = JSON.parse(line); } catch { out({ ok: false, error: "bad_json", line: line.slice(0, 120) }); return; }
        if (!cmd || typeof cmd !== "object") { out({ ok: false, error: "bad_command" }); return; }
        if (cmd.quit) { out({ id: cmd.id, ok: true, quit: true, shots: st.shots.length }); rl.close(); return; }
        const t = Date.now();
        try { const r = await run(cmd); out({ id: cmd.id, ok: true, ms: ms(t), ...r }); }
        catch (e) { out({ id: cmd.id, ok: false, error: String((e && e.message) || e) }); }
      });
    });
    rl.on("close", () => enqueue(async () => resolve()));
  });
  await page.close().catch(() => {});
  return st.shots;
}

const capMs = (s) => s.ms.settle + s.ms.capture + s.ms.gate;
const titleOf = (s) => `${s.team} · ${s.name} · ${s.cam || s.view}${vps.length > 1 ? ` · ${s.vp}` : ""}`;
const subOf = (s) => `az ${s.az} el ${s.el} dist ${s.dist}${s.occl != null ? ` · occl ${s.occl}%` : ""}`
  + `${s.baselineDiff != null ? ` · Δbase ${(s.baselineDiff * 100).toFixed(1)}%` : ""} · spread ${s.spread} · ${(capMs(s) / 1000).toFixed(1)}s`;

/** Everything after the frames land: rollup, pairs, flat art, labels, sheets,
 *  the JSON sidecar and the summary — factored so `--watch` can run it again
 *  after every re-shoot. */
async function finishRun(A, B, ctx) {
  const { rollupEntries, resumeSet, metaPath, liveBuild, load, t0, inert = [] } = ctx;
  const shots = A.shots.concat(B ? B.shots : []);
  let mergedRollup = rollupEntries;
  if (rollupEntries) {
    let priorRollup = [];
    if (resumeSet.size && existsSync(metaPath)) {
      try { priorRollup = JSON.parse(readFileSync(metaPath, "utf8")).rollupEntries || []; } catch (_) {}
    }
    mergedRollup = [
      ...priorRollup.filter((e) => !rollupEntries.some((n) => n.teamId === e.teamId)),
      ...rollupEntries,
    ];
  }
  let teamRollup = null;
  if (mergedRollup && mergedRollup.length) {
    teamRollup = await buildTeamRollup(mergedRollup, {
      surveyName: surveyTag(), liveBuild, view: rollupView,
    });
    console.log(`rollup (${mergedRollup.length} teams, ${rollupView}) -> ${teamRollup}`);
  }
  // PAIRS are scored before the caption bars go on: a bar that says
  // "BEFORE" on one frame and "AFTER" on the other is not a change to the car.
  const sheets = [], pairRecords = [];
  if (B) {
    // Pair sheet: the same cell twice, ref on the left, tree on the right,
    // so the eye compares neighbours instead of scrolling between folders.
    const key = (s) => `${s.team}|${s.tag}|${s.cam || s.view}`;
    const byKey = new Map(B.shots.map((s) => [key(s), s]));
    const pairs = [];
    for (const a of A.shots) {
      const b = byKey.get(key(a));
      if (b) pairs.push({ a: b, b: a, key: key(a), labelA: `BEFORE — ${againstRef}`, labelB: "AFTER — working tree" });
    }
    const r = await writePairs(pairs, join(outDir, "pairs-sheet.png"),
      `garage A/B — ${againstRef} (left) vs the working tree (right) · changed pixels`);
    for (const p of r.pairs) { const a = A.shots.find((s) => s.png === p.b); if (a) a.diff = p.diff; }
    if (r.sheet) sheets.push(r.sheet);
    pairRecords.push(...r.pairs);
  }
  if (pairAxis) {
    // Design pairs: the same car and camera, the pair field's first value on
    // the left and each other value on the right, everything else equal.
    const rest = (s) => JSON.stringify(Object.entries(s.design || {}).filter(([k]) => k !== pairAxis.field).sort());
    const cell = (s) => `${s.team}|${s.cam}|${s.vp}|${s.dpr}|${rest(s)}`;
    const base = new Map(A.shots.filter((s) => s.design && String(s.design[pairAxis.field]) === pairAxis.values[0]).map((s) => [cell(s), s]));
    const pairs = [];
    for (const b of A.shots) {
      if (!b.design || String(b.design[pairAxis.field]) === pairAxis.values[0]) continue;
      const a = base.get(cell(b));
      if (a) pairs.push({ a, b, key: `${b.team}_${b.cam}_${pairAxis.field}-${pairAxis.values[0]}-vs-${b.design[pairAxis.field]}`,
                          labelA: `${pairAxis.field}=${pairAxis.values[0]}`, labelB: `${pairAxis.field}=${b.design[pairAxis.field]}` });
    }
    const r = await writePairs(pairs, join(outDir, "design-pairs.png"),
      `garage — ${pairAxis.field}: ${pairAxis.values[0]} (left) vs ${pairAxis.values.slice(1).join(" / ")} (right) · changed pixels`);
    if (r.sheet) sheets.push(r.sheet);
    pairRecords.push(...r.pairs);
  }
  if (argvHas("--flat")) {
    const dir = join(outDir, "flat");
    mkdirSync(dir, { recursive: true });
    const items = [];
    for (const s of A.shots) {
      const f = await flatArtFor(s, dir).catch((e) => { console.warn(`flat ${s.team}/${s.name}: ${e.message}`); return null; });
      if (!f) continue;
      s.flat = f;
      items.push({ png: f, title: `${s.team} · ${s.name} · flat atlas (flank region)`, sub: "spine-station replay, ×3" });
      items.push({ png: s.png, title: titleOf(s), sub: subOf(s) });
    }
    const f = await writeSheet(items, join(outDir, "flat-sheet.png"), "flat art (left) vs the lit garage frame (right)", 2);
    if (f) sheets.push(f);
  }
  if (doLabel) {
    await Promise.all(shots.map((s) =>
      labelPng(s.png, `${titleOf(s)}${s.side ? `  [${s.side === "before" ? againstRef : "working tree"}]` : ""}`, subOf(s))));
  }
  if (doSheet) {
    const f = await writeSheet(A.shots.map((s) => ({ png: s.png, title: titleOf(s), sub: subOf(s) })),
      join(outDir, "sheet.png"),
      `garage — ${teams.join(",")} · ${views.join(",")}${againstRef ? " (working tree)" : ""}`,
      sheetCols || undefined);
    if (f) sheets.push(f);
    const mx = await writeMatrixSheet(A.shots, join(outDir, "matrix.png"));
    if (mx) sheets.push(mx);
    if (pathFrames.length) {
      // The dolly as ONE ROW, in shot order — the strip is the deliverable.
      const strip = A.shots.filter((s) => cams.find((c) => c.key === s.cam && c.path));
      const p = await writeSheet(strip.map((s) => ({ png: s.png, title: `${s.team} · ${s.cam}`, sub: subOf(s) })),
        join(outDir, "path-strip.png"), `garage dolly — ${pathFrames.length} frame(s)`, Math.min(strip.length, 8));
      if (p) sheets.push(p);
    }
  }

  const seconds = +((Date.now() - t0) / 1000).toFixed(1);
  const meta = metaPath;
  const record = {
    teams, liveries, base: baseLivery, axes, designs, against: againstRef, preset: presetRaw || null,
    fast, rollupOnly, rollupView, multiTeam, useStoreTeam, withOracle, live: doLive, liveBuild,
    liverySettle, viewSettle, gateRetries,
    zoom: zoomList, pan: panList, cams, crop, name: nameTpl || null,
    logos: logosMode || null, site: doSite, inert, dprs, bases: baseList,
    lamps: lampList, targets: targetList.map((t) => t.name), baseline: baselineDir, budget: budgetSec || null,
    sheetHead: A.sheetHead, viewport: vp, viewports: vps, views,
    loadavg1: load, phase: { after: A.phase, before: B ? B.phase : null },
    sheets, shots, rollupEntries: mergedRollup, teamRollup,
    pairs: pairRecords, pairAxis, path: pathFrames.length || null, eyes: eyeList.length || null, clamp: !noClamp,
    resumed: resumeSet.size ? [...resumeSet] : null, seconds,
  };
  writeFileSync(meta, JSON.stringify(record, null, 2));
  if (doJson) console.log(JSON.stringify(record));
  const shotMs = shots.reduce((n, s) => n + capMs(s), 0);
  console.log(`wrote ${shots.length} angle(s) in ${seconds}s`
    + `  [boot ${A.phase.boot}ms open ${A.phase.open}ms · shots ${(shotMs / 1000).toFixed(1)}s`
    + ` = ${(shotMs / 1000 / Math.max(1, shots.length)).toFixed(1)}s each · loadavg ${load ?? "?"}]`);
  for (const s of sheets) console.log(`sheet: ${s}`);
  console.log(`${meta}  [sheet: ${A.sheetHead}]`);
}

async function main() {
  if (argvHas("--reset") && existsSync(outDir)) {
    rmSync(outDir, { recursive: true, force: true });
    console.log(`reset: cleared ${outDir}`);
  }
  mkdirSync(outDir, { recursive: true });
  const items = designs
    ? designs.map((d) => ({ design: d }))
    : liveries.map((l) => ({ livery: l }));
  const shotCount = teams.length * items.length * (baseList.length || 1) * cams.length * vps.length * dprs.length;
  const inert = inertFlags(designs);
  const estSeconds = Math.round(shotCount * (fast ? 12 : 18) + 25 * dprs.length);
  if (budgetSec && estSeconds > budgetSec && !doPlan) {
    console.error(`REFUSED: ${shotCount} shot(s) ≈ ${estSeconds}s, over --budget=${budgetRaw} (${budgetSec}s). `
      + `Trim an axis (--plan prints the matrix), or raise the budget.`);
    process.exit(2);
  }
  if (doPlan) {
    console.log(JSON.stringify({
      teams, liveries, base: baseLivery, axes, designs, views, cams, viewports: vps,
      preset: presetRaw || null, crop, name: nameTpl || null, logos: logosMode || null,
      stations: [...new Set(cams.map((c) => c.station).filter(Boolean))],
      stationsFrom: autoStations.length ? fieldStations : null,
      inert: inert.map((i) => ({ field: i.field, design: i.design, why: i.why })),
      fast, rollupOnly, rollupView, multiTeam, useStoreTeam, withOracle,
      liverySettle, viewSettle, gateRetries, zoom: zoomList, pan: panList,
      shotCount, against: againstRef, dprs, bases: baseList, lamps: lampList, targets: targetList.map((t) => t.name),
      pair: pairAxis, path: pathFrames.length || null, pathSteps: pathFrames.length ? pathSteps : null,
      eyes: eyeList, looks: lookList, clamp: !noClamp,
      baseline: baselineDir, budget: budgetSec || null,
      estSeconds, overBudget: !!(budgetSec && estSeconds > budgetSec),
    }, null, 2));
    return;
  }
  for (const i of inert) {
    console.warn(`WARNING ${i.field} paints NOTHING on ${JSON.stringify(i.design)} — ${i.why}`);
  }
  if (autoStations.length) {
    console.log(`stations: ${fieldStations.map((o) => `${o.station} (${o.fields.join(", ")})`).join(", ")}`
      + " — from the design fields; --views / --cam / --station override");
  }
  if (dprs.some((d) => d > 1)) {
    // Measured 2026-09-10 on SwiftShader: at DPR 2 a team switch took 59.7 s
    // (6 ms at DPR 1) and the capture's visibility poll starved past 30 s with
    // the canvas already visible. Four times the pixels on a CPU rasteriser.
    console.warn("WARNING --dpr above 1 needs a real GPU: on a software renderer the page starves "
      + "(a 2x garage measured a 60 s team switch here) — raise --settle / --view-settle or run on the macOS census runner.");
  }
  const resumeSet = argvHas("--reset") ? new Set() : resumeTeamSet();
  const workTeams = resumeSet.size ? teams.filter((t) => !resumeSet.has(t)) : teams;
  const metaPath = join(outDir, multiTeam ? "all-teams-angles.json" : `${teams[0]}-angles.json`);
  if (!workTeams.length) {
    console.log("nothing to shoot — all teams done (--resume)");
    if (existsSync(metaPath)) {
      try {
        const prior = JSON.parse(readFileSync(metaPath, "utf8"));
        if (prior.rollupEntries?.length) {
          const sheet = await buildTeamRollup(prior.rollupEntries, {
            surveyName: surveyTag(), liveBuild: prior.liveBuild, view: prior.rollupView || rollupView,
          });
          console.log(`rollup (${prior.rollupEntries.length} teams) -> ${sheet}`);
        }
      } catch (_) { /* no rollup */ }
    }
    return;
  }
  if (multiTeam) {
    console.log(`teams (${teams.length}): ${teams.join(", ")}`);
    if (resumeSet.size) console.log(`resume: skip ${resumeSet.size}, shoot ${workTeams.length}`);
    if (rollupOnly) console.log(`rollup-only (${rollupView}) — --full-views for every preset`);
    if (useStoreTeam) console.log("fast path: __apex.garageTeam + garageFrame");
    if (withOracle) console.log("oracle: flank-occlusion % on rollup labels");
  }
  const load = loadavg1();
  if (load != null && load >= 3) {
    console.warn(`WARNING loadavg ${load} >= 3 — every duration below measures the BOX, `
      + `not the tool. Reap orphans first (AGENTS.md §Verification, rule 7).`);
  }
  let liveBuild = null;
  let gameUrl;
  const servers = [];
  if (doSite && !againstRef) {
    liveBuild = await fetch(LIVE_BASE + "version.json")
      .then((r) => r.json()).then((j) => j.build ?? null).catch(() => null);
    gameUrl = LIVE_BASE;
    console.log(`site github.io — build ${liveBuild ?? "?"}`);
  } else {
    if (doSite && againstRef) {
      console.warn("--site ignored with --against (local tree serves both passes)");
    }
    const srv = await startStaticServer(process.cwd());
    servers.push(srv);
    gameUrl = srv.url;
  }
  const t0 = Date.now();
  const browser = await launchChromium({
    headless: process.env.APEX_HEADED !== "1",
    args: chromiumArgsForBackend("webgl2"),
  });
  const rollupEntries = multiTeam && rollupOnly ? [] : null;
  try {
    if (doServe) {
      console.error(`serve: garage open for ${teams[0]} — JSON lines on stdin ({"frame":"spineTop","shot":"a"}), {"quit":true} to end`);
      await serveSession(browser, gameUrl);
      return;
    }
    const afterDir = againstRef ? join(outDir, "after") : outDir;
    // One browser, one context per DPR: a scale factor is fixed at context
    // creation, so each value re-boots the garage once and reuses everything else.
    const A = await walk(browser, gameUrl, afterDir, againstRef ? "after" : null, {
      keepPage: !!againstRef || watchList.length > 0, rollupEntries, resumeSet, workTeams, dpr: dprs[0],
      context: dprs[0] !== 1 ? await browser.newContext({ deviceScaleFactor: dprs[0] }) : null,
    });
    for (const dpr of dprs.slice(1)) {
      const ctx = await browser.newContext({ deviceScaleFactor: dpr });
      const D = await walk(browser, gameUrl, afterDir, null, { rollupEntries: null, resumeSet: new Set(), workTeams, dpr, context: ctx });
      A.shots.push(...D.shots);
      await ctx.close().catch(() => {});
    }
    let B = null;
    if (againstRef) {
      const blobs = refBlobs(againstRef);
      if (!blobs.size) {
        console.warn(`--against=${againstRef}: no js/css/shell file differs from the working tree `
          + `— the pair would be the same car twice, so the B pass is skipped.`);
        await A.page?.close().catch(() => {});
      } else {
        console.log(`--against=${againstRef}: serving ${blobs.size} file(s) from that ref `
          + `(${[...blobs.keys()].map((k) => k.slice(1)).join(", ")})`);
        const srvB = await startStaticServer(process.cwd(), { route: blobRoute(blobs) });
        servers.push(srvB);
        B = await walk(browser, srvB.url, join(outDir, "before"), "before", {
          page: A.page, rollupEntries: null, resumeSet: new Set(), workTeams,
        });
        await A.page?.close().catch(() => {});
      }
    }

    await finishRun(A, B, { rollupEntries, resumeSet, metaPath, liveBuild, load, t0, inert });
    if (watchList.length) {
      // Batch watch: keep the page, re-walk the matrix on every change, and
      // re-run the finish so the sheets and pairs are always of the current tree.
      if (againstRef) console.warn("--watch ignores --against after the first pass (the tree is what changes)");
      console.log(`watch: ${watchList.join(", ")} — re-shoots ${A.shots.length} frame(s) on change; Ctrl-C to stop`);
      let chain = Promise.resolve();
      await new Promise((resolve) => {
        process.once("SIGINT", () => chain.then(resolve, resolve));
        watchPaths(watchList, (files) => { chain = chain.then(async () => {
          const t = Date.now();
          console.log(`watch: ${files.join(", ")} changed — re-shooting`);
          try {
            const R = await walk(browser, gameUrl, afterDir, null, { page: A.page, keepPage: true, rollupEntries: rollupEntries ? [] : null, resumeSet: new Set(), workTeams, dpr: dprs[0] });
            A.shots = R.shots; A.phase = R.phase; A.page = R.page;
            await finishRun(A, null, { rollupEntries: R.rollupEntries, resumeSet: new Set(), metaPath, liveBuild, load, t0: t, inert });
          } catch (e) { console.error(`watch: re-shoot failed: ${e.message}`); }
        }, () => {}); });
      });
      await A.page?.close().catch(() => {});
    }
  } finally {
    await browser.close();
    for (const s of servers) await s.close().catch(() => {});
  }
}

main().then(() => shutdown()).catch((e) => { console.error(e); shutdown(); process.exit(1); });
