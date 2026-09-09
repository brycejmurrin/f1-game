#!/usr/bin/env node
// @doc Garage shot MATRIX — ONE Chromium; every axis is a list (team/livery/design/parts/view/framing).
//   node tools/shot/garage-angles.mjs [--team=redbull,ferrari] [--views=spine] [--livery=default,rb_white]
//     [--parts=factory,stock] [--spine-side=logo,duo] [--spine-logo=…] [--zoom=0,8] [--pan=2,0] [--out=dir]
//     [--dry-run]
// @skill playwright-probe
// @skill garage-parts-livery
//
// Counterpart to garage-frame.mjs (one preset × backend A/B). This walks the
// whole GARAGE STATE SPACE on a single backend: open once, then re-shoot the
// bay for every combination. Two shipped defects (wordmarks vs gantry, sunk
// signs) were only visible from one angle each, and a third (flank marks the
// body covers) only on one team's chassis.
//
// EVERY AXIS IS A COMMA LIST and the tool walks their product:
//   --team        roster ids                      redbull,ferrari
//   --livery      catalog paint ids                default,rb_white
//   --spine-side  DESIGN walk, crossed WITH the livery above (not instead of it)
//   --spine-logo  ditto
//   --parts       build per shot (see below)      factory,stock
//   --views       camera presets or a group       spine | all | hero,top
//   --zoom/--pan  framing nudges                  0,8 / 2,0;0,-3
//
// --parts takes one of:
//   current                  leave the store alone (what the team already has)
//   stock                    Parts.DEFAULTS — the works car
//   factory                  Parts.FACTORY_PRESETS[team] — the signature build
//   cat:opt+cat:opt          overrides on top of the team's current build
// Option ids are validated against CATALOG *and* isOptionAvailable for the team
// being shot, so a signature part locked to another team fails fast with the
// list rather than silently resolving to the default (the trap that made an
// early parts audit report 100+ dead options).
//
// COST ORDER. The walk nests team → paint → parts → aero → view → framing,
// cheapest axis innermost, because each outer step costs more. MEASURED on an
// 8-shot run (2 team x 2 view x 2 aero), which is why the tool now reports its
// own phase timings: team 45.7s over 2 switches, paint 71.1s over 2, aero
// 198.2s over 4, frame 375.1s over 8 (46.9s each). Aero was nested INSIDE view
// on the first cut, which cost 4 changes where the order above costs 2 — an
// axis is placed by what it costs, and the flap ease is dearer than a preset
// click even though it looks like a smaller thing. Adding a
// second framing to a 12-shot run is nearly free; adding a second team is not.
// `--dry-run` prints the matrix and the nesting without booting Chromium —
// worth doing first, because the product multiplies out fast.
//
// Mesh invalidation is the game's own: the preview key is
// `team:partsVisualKey:num` and partsVisualKey reads the store live, so a parts
// write misses the cache by itself. Paint needs the explicit drop (a custom id
// for designs, dropPreviewMeshes for the hull).
//
// SHOTS ARE NOT REPRODUCIBLE ACROSS RUNS, AND THAT IS A REAL LIMIT ON WHAT
// THIS TOOL CAN PROVE. Measured 2026-09-09: two runs of the SAME code and the
// SAME config (redbull, hero/side/rear) produced hero and side images differing
// in ~43% of bytes; rear differed in 0.3%. Nothing in the tree changed between
// them. So a diff of one run's PNG against another run's is not evidence of
// anything, and a before/after visual A/B has to compare shots taken INSIDE one
// run — which is what every axis being a list is for.
//
// Two clocks are candidates and neither is pinned here. `_skyT` (game.js)
// accumulates dt and is freezable via __apex.renderClock(t, true), the hook the
// image-grade spec already uses. `GarageScene.pulse()` records
// performance.now() — WALL clock, so what it contributes depends on how long
// the box took between the preset click and the blit, which on a loaded machine
// is tens of seconds. Pinning them is unfinished work, not a thing this tool
// does today; --settle exists so the step count can be varied while chasing it.
//
// Capture prefers #game-soft via screenshotGameCanvas — page.screenshot hangs
// under SwiftShader (document.fonts.ready after freeze).
import { mkdirSync, writeFileSync, readFileSync, existsSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { launchChromium, shutdown, startStaticServer } from "../lib/harness.mjs";
import { parseFlags, runCli } from "../lib/cli-args.mjs";
import {
  chromiumArgsForBackend, installProbeInit, gotoGame, openGarage, settleGarage,
  screenshotGameCanvas,
} from "../capture/probe-page.mjs";

const argv = process.argv.slice(2);
const KNOWN = ["--team", "--livery", "--spine-side", "--spine-logo", "--parts", "--views",
               "--zoom", "--pan", "--aero", "--viewport", "--out", "--backend", "--jpeg",
               "--dry-run", "--visible-only", "--skip-existing", "--label", "--sheet", "--settle"];
// Shared with the other garage/car CLIs: both `--name=v` and `--name v`, and an
// unknown flag stops the run rather than silently using the default.
const { flag, list, has } = parseFlags(argv, KNOWN);
const dryRun = has("--dry-run");
// THE CANVAS IS NOT WHAT THE PLAYER SEES. The setup sheet is DOM docked over
// part of #game, and the preview compensates with an off-axis frustum
// (_spProj[8] = panelFrac, [9] = panelFracY) that shifts the car into the gap
// the sheet does not cover. screenshotGameCanvas captures the bare canvas, so
// the car reads as pushed off-centre with dead space on the panel side — which
// is CORRECT framing photographed wrongly. Measured 2026-09-09 at 1280x720:
// the sheet holds x 848..1268, panelFrac 0.328, and the car sits centred in the
// left 848 px exactly as intended. That misread cost a false defect report, so
// --visible-only crops every shot to the region the sheet leaves and the
// manifest always records the panel geometry, whether or not it is cropped.
const visibleOnly = has("--visible-only");
const skipExisting = has("--skip-existing");   // resume a run that died part-way
const wantLabel = has("--label");              // burn the coordinates into each PNG
const wantSheet = has("--sheet");              // + one labelled contact sheet of the run
const backend = flag("--backend", "webgl2");
// Frames settled before a capture. The default is the long-standing 6; the flag
// exists because the light rig EASES, so this number decides whether a shot is
// a settled frame or a mid-ease one — see the note above frame() for the A/B
// that established it, and raise it if a run shows lighting drift between shots.
const settleN = Math.max(1, +flag("--settle", "6") || 6);
const jpeg = has("--jpeg") ? Math.max(1, Math.min(100, +flag("--jpeg", "82") || 82)) : 0;

const teams = list("--team", "mclaren");
const liveries = list("--livery", "default");
const spineSides = list("--spine-side", "");
const spineLogos = list("--spine-logo", "");
const partSpecs = list("--parts", "current");
const vp = flag("--viewport", "1280x720").split("x").map(Number);
const outDir = flag("--out", "artifacts/garage-angles");
// Framings pair a zoom with a pan. `--zoom=0,8` × `--pan=0,0;2,-3` is 2×2; a
// pan uses ";" between framings because "," already separates its own x,y.
const zooms = list("--zoom", "0").map(Number);
const pans = (flag("--pan", "0,0") || "0,0").split(";").map((p) => {
  const [strafe = 0, dolly = 0] = p.split(",").map(Number);
  return { strafe, dolly };
});
const framings = zooms.flatMap((zoom) => pans.map((pan) => ({ zoom, ...pan })));
// ACTIVE AERO — the wing presets exist to watch the flaps travel, and both
// states of that travel are a thing you want side by side. "z" is closed, "x"
// open; __apex.garageAero(bool) drives the same switch the button does.
const aeros = list("--aero", "").map((a) => a.toLowerCase());
for (const a of aeros) {
  if (a !== "z" && a !== "x") { console.error(`--aero takes z (closed) or x (open), not "${a}"`); process.exit(1); }
}
const aeroStates = aeros.length ? aeros : [null];
if (framings.some((f) => !Number.isFinite(f.zoom) || !Number.isFinite(f.strafe) || !Number.isFinite(f.dolly))) {
  console.error("--zoom and --pan take numbers: --zoom=0,8 --pan=0,0;2,-3");
  process.exit(1);
}

/** Roster order == store.team index (game.js boot). */
function rosterIds() {
  const src = readFileSync(fileURLToPath(new URL("../../js/data/teams.js", import.meta.url)), "utf8");
  return Array.from(src.matchAll(/^ *id: "([a-z]+)",/gm)).map((m) => m[1]);
}
const ROSTER = rosterIds();
for (const t of teams) {
  if (!ROSTER.includes(t)) {
    console.error(`no team "${t}" — available: ${ROSTER.join(", ")}`);
    process.exit(1);
  }
}
const teamIndex = (id) => ROSTER.indexOf(id);

/** A --parts token → {kind, tag, overrides}. Validation of ids needs the page
 *  (CATALOG + per-team availability), so this is shape-only. */
function parsePartSpec(spec) {
  if (spec === "current" || spec === "stock" || spec === "factory") {
    return { kind: spec, tag: spec, overrides: {} };
  }
  const overrides = {};
  for (const pair of spec.split("+")) {
    const [cat, opt] = pair.split(":");
    if (!cat || !opt) {
      console.error(`--parts "${spec}": expected cat:opt pairs joined by "+", or one of current/stock/factory`);
      process.exit(1);
    }
    overrides[cat.trim()] = opt.trim();
  }
  // Short tag: signature/manufacturer prefixes carry no information in a
  // filename when every option in the run shares them.
  const tag = Object.values(overrides)
    .map((o) => o.replace(/^sig_[a-z]+_/, "").replace(/^manu_/, ""))
    .join("-") || "parts";
  return { kind: "set", tag, overrides };
}
const parts = partSpecs.map(parsePartSpec);

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
/* ---- the shot PLAN ------------------------------------------------------
   Built before Chromium starts so --dry-run can print it, and so the walk
   below is a flat list rather than five nested loops. Order IS the cost
   order: team, paint, parts, view, framing — outermost changes are the
   expensive ones, so consecutive shots share as much state as possible. */
const paints = liveries.flatMap((livery) => {
  const designs = spineSides.length || spineLogos.length
    ? (spineLogos.length ? spineLogos : [""]).flatMap((spineLogo) =>
      (spineSides.length ? spineSides : [""]).map((spineSide) => ({ spineLogo, spineSide })))
    : [null];
  // A design is applied ON TOP of the livery it is crossed with, so
  // "the duo spine on the white paint" is one shot rather than unreachable.
  return designs.map((design) => ({
    livery, design,
    tag: design
      ? livery + "-" + (design.spineLogo || "def") + "-" + (design.spineSide || "def")
      : livery,
  }));
});

function framingTag(f) {
  if (!f.zoom && !f.strafe && !f.dolly) return "";
  return "z" + f.zoom + (f.strafe || f.dolly ? `p${f.strafe}_${f.dolly}` : "");
}

/** Only name an axis in the filename when the run actually walks it — a
 *  single-team single-paint run keeps the short names it has always had.
 *  The manifest carries every coordinate regardless. */
function shotName(c) {
  const seg = [c.team];
  if (paints.length > 1 || c.paint.tag !== "default") seg.push(c.paint.tag);
  if (parts.length > 1 || parts[0].kind !== "current") seg.push(c.parts.tag);
  seg.push(c.view);
  if (c.aero) seg.push(c.aero);
  const f = framingTag(c.framing);
  if (framings.length > 1 && f) seg.push(f);
  return seg.join("-");
}

/** The human caption for a shot: every axis, in the order the walk nests. */
function shotLabel(c) {
  const bits = [c.team, c.paint.tag];
  if (parts.length > 1 || parts[0].kind !== "current") bits.push(c.parts.tag);
  bits.push(c.view);
  if (c.aero) bits.push(c.aero === "x" ? "X-MODE" : "closed");
  const f = framingTag(c.framing);
  if (f) bits.push(f);
  return bits.join("  \u00b7  ");
}

const PLAN = [];
for (const team of teams) {
  for (const paint of paints) {
    for (const part of parts) {
      for (const aero of aeroStates) {
        for (const view of views) {
          for (const framing of framings) {
            const c = { team, paint, parts: part, view, aero, framing };
            PLAN.push({ ...c, name: shotName(c), label: shotLabel(c) });
          }
        }
      }
    }
  }
}
const dupes = PLAN.map((p) => p.name).filter((n, i, a) => a.indexOf(n) !== i);
if (dupes.length) {
  console.error(`shot names collide (${[...new Set(dupes)].join(", ")}) — an axis is walked but not named`);
  process.exit(1);
}

if (dryRun) {
  console.log(`${PLAN.length} shot(s): ${teams.length} team x ${paints.length} paint x ${parts.length} parts`
    + ` x ${views.length} view x ${aeroStates.length} aero x ${framings.length} framing`);
  for (const p of PLAN) console.log(`  ${p.name.padEnd(38)}  ${p.label}`);
  process.exit(0);
}

/** Gate the region the SHEET LEAVES — the bay, never the sheet's own text
 *  spread. The cut used to be a hardcoded 55% of the canvas, a guess at where
 *  the sheet sits; panelGeometry knows it exactly, so prefer that. */
async function bayRendered(png, vpW, visible) {
  const cut = visible ? visible.w : Math.max(80, Math.round(vpW * 0.55));
  // ONE decode. This read the file through sharp TWICE — once for .metadata()
  // to learn the height and once for the crop — so every gate attempt decoded
  // a 1280x720 PNG twice, and a retry did it four times. The buffer is reused
  // by the --visible-only crop and the label, so a shot now decodes once.
  const img = sharp(png);
  const meta = await img.metadata();
  const st = await img.extract({ left: visible ? visible.x : 0, top: 0,
                                 width: cut, height: meta.height }).stats();
  const spread = Math.max(...st.channels.map((c) => c.stdev));
  return { ok: spread > 8, spread: +spread.toFixed(2), meta };
}

/** Discrete clicks — detail 0 is the keyboard path in holdSetupCtl (not hold-ramp). */
/** Discrete clicks for a whole framing in ONE round-trip. This was three
 *  separate page.evaluate calls (zoom, strafe, dolly) per shot even though
 *  they are independent button presses on the same document. */
async function nudgeAll(page, framing) {
  const want = [
    [framing.zoom > 0 ? "cs-view-in" : "cs-view-out", Math.abs(framing.zoom)],
    [framing.strafe > 0 ? "cs-pan-right" : "cs-pan-left", Math.abs(framing.strafe)],
    [framing.dolly > 0 ? "cs-pan-fwd" : "cs-pan-back", Math.abs(framing.dolly)],
  ].filter(([, n]) => n > 0);
  if (!want.length) return;
  const missing = await page.evaluate((jobs) => {
    const gone = [];
    for (const [ctl, times] of jobs) {
      const b = document.getElementById(ctl);
      if (!b) { gone.push(ctl); continue; }
      for (let i = 0; i < times; i++) b.click();
    }
    return gone;
  }, want);
  if (missing.length) throw new Error(`no camera control #${missing.join(", #")}`);
}

const LABEL_H = 26;
/** A shot with no caption is a filename you have to decode by eye, and a
 *  contact sheet of them is worse — I built one by hand to read the last run.
 *  The caption is BELOW the frame, never over it: burning text into the bay
 *  would corrupt the very pixels the shot exists to show. */
function labelSvg(text, w) {
  const esc = String(text).replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]);
  return Buffer.from(`<svg width="${w}" height="${LABEL_H}">`
    + `<rect width="${w}" height="${LABEL_H}" fill="#12141a"/>`
    + `<text x="8" y="18" font-family="monospace" font-size="14" fill="#cfd6e4">${esc}</text></svg>`);
}

/** Crop, caption and encode in ONE pass off the already-decoded frame. */
async function finishImage(png, shot, panel, meta) {
  const crop = visibleOnly && panel.visible ? panel.visible : null;
  if (!crop && !wantLabel && !jpeg) return png;
  let img = sharp(png);
  if (crop) img = img.extract({ left: crop.x, top: crop.y, width: crop.w, height: crop.h });
  let buf = await img.toBuffer();
  if (wantLabel) {
    const w = crop ? crop.w : meta.width;
    buf = await sharp(buf)
      .extend({ bottom: LABEL_H, background: "#12141a" })
      .composite([{ input: labelSvg(shot.label, w), top: (crop ? crop.h : meta.height), left: 0 }])
      .toBuffer();
  }
  if (jpeg) {
    const out = png.replace(/\.png$/, ".jpg");
    await sharp(buf).jpeg({ quality: jpeg }).toFile(out);
    unlinkSync(png);
    return out;
  }
  writeFileSync(png, buf);
  return png;
}

/** Where the docked sheet sits over #game, and what the preview's off-axis
 *  frustum was compensating by. Both go in the manifest: a framing judgement
 *  made without them is a judgement about the wrong rectangle. */
let _panelCache = null;
async function panelGeometry(page) {
  // The sheet is docked at a fixed edge and the viewport never changes inside a
  // run, so this was one page round-trip per shot for an answer that cannot
  // move. Measured once, reused for the rest of the walk.
  if (_panelCache) return _panelCache;
  _panelCache = await page.evaluate(() => {
    const cam = window.__apex.garageCam();
    const cv = document.getElementById("game").getBoundingClientRect();
    const sheet = document.getElementById("cs-inner") || document.getElementById("carsetup");
    const r = sheet ? sheet.getBoundingClientRect() : null;
    const g = { panelFrac: cam.panelFrac, canvas: [Math.round(cv.width), Math.round(cv.height)] };
    if (!r || !r.width || !r.height) return { ...g, sheet: null, visible: null };
    // The sheet docks to one edge; the visible region is the canvas minus it.
    const left = Math.max(0, r.left - cv.left), right = Math.min(cv.width, r.right - cv.left);
    const box = left > cv.width - right
      ? { x: 0, y: 0, w: Math.round(left), h: Math.round(cv.height) }            // docked right
      : { x: Math.round(right), y: 0, w: Math.round(cv.width - right), h: Math.round(cv.height) };
    return { ...g,
      sheet: { x: Math.round(left), w: Math.round(r.width), h: Math.round(r.height) },
      visible: box.w > 32 ? box : null };
  });
  return _panelCache;
}

/* WHY THERE IS NO stepFrames() HERE, AND WHY THE PRESENT STAYS.
 *
 * The in-frame timings below say a 49.5 s shot is screenshot 22.8 s plus
 * settleGarage 21.1 s, with every other step under 4 s, and settleGarage's
 * second half is GLX.awaitSoftPresent — a FORCED blit (GPU readback plus
 * putImageData) that screenshotGameCanvas then awaits again. Dropping the
 * first one looked like free money: 223.7 s -> 127.7 s on the same 3-shot
 * config, a 43% cut.
 *
 * It was wrong. The forced present is not only blitting, it advances the
 * light-rig ease, so plain stepping captured a MID-EASE frame — 43% of bytes
 * different from the settled one, and no less plausible-looking, which is
 * exactly why this needed a pixel A/B rather than an eye. Raising the step
 * count to 24 recovered convergence on a single shot (0.28% from the old
 * path) but not across a 3-shot walk (11.9% on hero), and by then the box's
 * own variance had swallowed the result: three runs of the identical config
 * booted in 17.9 s, 4.3 s and 14.8 s. That is measuring the machine, not the
 * code (AGENTS.md session-shape 8).
 *
 * So the present stays and the saving is not taken. What survives is the
 * measurement: the cost is localised to the double soft-present, it is
 * ~40 s of a ~45 s shot, and llvmpipe is what makes it that. On a box with a
 * real GPU, or with a quieter one to A/B on, the lever is known and the
 * numbers to beat are in this comment. --settle exposes the step count so the
 * next attempt does not have to patch the source to try it. */

// Sub-phase wall time INSIDE a frame. The per-phase totals said `frame` was
// 46.9 s of a 47 s shot; this says which part of a frame that is, because the
// two candidates (a soft-present that waits, an encode that decodes) are not
// distinguishable from the outside.
const inFrame = { preset: 0, nudge: 0, settle: 0, panel: 0, shot: 0, gate: 0, cam: 0, encode: 0 };
async function sub(key, fn) {
  const t = Date.now();
  try { return await fn(); } finally { inFrame[key] += +((Date.now() - t) / 1000).toFixed(2); }
}

async function frame(page, shot) {
  const { view, framing } = shot;
  const clicked = await sub("preset", () => page.evaluate((v) => {
    const b = document.querySelector('#cs-stack [data-cs-view="' + v + '"]');
    if (!b) return false;
    b.click();
    return true;
  }, view));
  if (!clicked) throw new Error(`no camera preset "${view}" in #cs-stack`);
  // AFTER the preset: setSetupView is absolute and drops stored distance/pan,
  // so the framing nudges are re-applied per shot rather than once per run.
  await sub("nudge", () => nudgeAll(page, framing));
  await sub("settle", () => settleGarage(page, { frames: settleN }));
  const png = join(outDir, `${shot.name}.png`);
  const panel = await sub("panel", () => panelGeometry(page));
  let gate = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt) await sub("settle", () => settleGarage(page, { frames: 4 }));
    const got = await sub("shot", () => screenshotGameCanvas(page, png));
    gate = await sub("gate", () => bayRendered(png, vp[0], panel.visible));
    if (gate.ok) {
      const cam = await sub("cam", () => page.evaluate(() => window.__apex.garageCam()));
      const finalPng = await sub("encode", () => finishImage(png, shot, panel, gate.meta));
      return {
        panel, label: shot.label,
        name: shot.name, png: finalPng, view, team: shot.team, aero: shot.aero,
        livery: shot.paint.livery, design: shot.paint.design, parts: shot.parts.tag,
        framing, spread: gate.spread, via: got.via || "page-clip",
        az: +cam.az.toFixed(3), el: +cam.el.toFixed(3), dist: +cam.effDist.toFixed(3),
        pan: cam.pan ? cam.pan.map((n) => +n.toFixed(3)) : null,
      };
    }
  }
  throw new Error(`${shot.name}: the bay never rendered (canvas pixel spread ${gate.spread})`);
}

async function applyLivery(page, team, livId) {
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
    throw new Error(`${team}: ${got.error}${extra}`);
  }
  await settleGarage(page, { frames: 12 });
  return got.name;
}

/** Custom id so mesh/atlas caches (keyed on getLiveryId) miss — design walk,
 *  not catalog. Based on the LIVERY it is crossed with, so a design can be
 *  seen on every paint job rather than only on the team default. */
async function applyDesign(page, team, baseLivery, { spineSide, spineLogo }) {
  const got = await page.evaluate(({ teamId, base, side, logo }) => {
    const t = Teams.LIST.find((x) => x.id === teamId);
    if (!t) return { ok: false, error: `no team "${teamId}"` };
    const list = Liveries.forTeam(t);
    const def = list.find((l) => l.id === base) || list[0];
    const sides = (typeof LiveryTex !== "undefined" && LiveryTex.SPINE_SIDE_IDS) || [];
    const logos = (typeof LiveryTex !== "undefined" && LiveryTex.SPINE_LOGO_IDS) || [];
    if (side && sides.length && !sides.includes(side)) {
      return { ok: false, error: `no spineSide "${side}"`, have: sides };
    }
    if (logo && logos.length && !logos.includes(logo)) {
      return { ok: false, error: `no spineLogo "${logo}"`, have: logos };
    }
    const id = "_shot_" + def.id + "_" + (logo || def.spineLogo || "x") + "_" + (side || def.spineSide || "none");
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
    return { ok: true, name: liv.spineLogo + "/" + liv.spineSide, id, base: def.id };
  }, { teamId: team, base: baseLivery, side: spineSide || "", logo: spineLogo || "" });
  if (!got.ok) {
    const extra = got.have ? ` (have ${got.have.join(",")})` : "";
    throw new Error(`${team}: ${got.error}${extra}`);
  }
  await settleGarage(page, { frames: 12 });
  return got.name;
}

/** Write the build for `team`. Ids are checked against CATALOG *and*
 *  isOptionAvailable for THIS team: a signature part locked to another team
 *  silently resolves to the default, which is how an early audit came to
 *  report 100+ "dead" options that were only ever built against one chassis. */
async function applyParts(page, team, spec) {
  if (spec.kind === "current") return "current";
  const got = await page.evaluate(({ teamId, kind, overrides }) => {
    const t = Teams.LIST.find((x) => x.id === teamId);
    if (!t) return { ok: false, error: `no team "${teamId}"` };
    let build;
    if (kind === "stock") build = Object.assign({}, Parts.DEFAULTS);
    else if (kind === "factory") build = Object.assign({}, Parts.FACTORY_PRESETS[teamId] || Parts.DEFAULTS);
    else build = Object.assign({}, GameStore.store.get("parts." + teamId, {}));
    for (const cat in overrides) {
      const catalog = Parts.CATALOG.find((c) => c.id === cat);
      if (!catalog) {
        return { ok: false, error: `no part category "${cat}"`, have: Parts.CATALOG.map((c) => c.id) };
      }
      const opt = (catalog.options || []).find((o) => o.id === overrides[cat]);
      if (!opt) {
        return { ok: false, error: `no option "${overrides[cat]}" in ${cat}`,
                 have: (catalog.options || []).map((o) => o.id) };
      }
      if (!Parts.isOptionAvailable(opt, t)) {
        return { ok: false, error: `option "${opt.id}" is not available to ${teamId}`,
                 have: (catalog.options || []).filter((o) => Parts.isOptionAvailable(o, t)).map((o) => o.id) };
      }
      build[cat] = opt.id;
    }
    GameStore.store.set("parts." + teamId, build);
    // No explicit bust: the preview key is team:partsVisualKey:num and
    // partsVisualKey reads the store live, so this write misses the cache.
    return { ok: true, build, ids: Parts.CATALOG.map((c) => build[c.id] || "-").join("|") };
  }, { teamId: team, kind: spec.kind, overrides: spec.overrides });
  if (!got.ok) {
    const extra = got.have ? `\n  available: ${got.have.join(", ")}` : "";
    throw new Error(`${team} --parts: ${got.error}${extra}`);
  }
  await settleGarage(page, { frames: 12 });
  return got.ids;
}

/** ACTIVE AERO. The flaps EASE toward the switch inside the rAF render, and a
 *  headless page composites no frames, so garageStep is what actually moves
 *  them — flipping the switch and shooting immediately catches the old pose. */
async function applyAero(page, want) {
  const got = await page.evaluate((on) => {
    if (!window.__apex.garageAero) return { ok: false, error: "no garageAero hook" };
    window.__apex.garageAero(on === "x");
    for (let i = 0; i < 90; i++) window.__apex.garageStep(1 / 60);
    const a = window.__apex.garageAero();
    return { ok: true, mode: a.mode, aeroX: a.aeroX };
  }, want);
  if (!got.ok) throw new Error(`--aero: ${got.error}`);
  await settleGarage(page, { frames: 6 });
  return `${got.mode} (aeroX ${(+got.aeroX).toFixed(2)})`;
}

/** Switch the open sheet to another team through the TEAM tab's tiles — the
 *  reliable in-place path (#mb-garage never re-reads the store, and a reload
 *  would cost a second boot, which is the whole point of this tool). */
async function switchTeam(page, team) {
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
  const label = await page.evaluate(() => document.getElementById("cs-team")?.textContent || "");
  if (!label) throw new Error(`garage opened but #cs-team empty after switching to ${team}`);
  return { switched, label };
}

/** One labelled montage of the run. Built by hand the first time this tool was
 *  used in anger, which is the argument for it living here.
 *  With --label the tiles already carry their caption, so the sheet drops its
 *  own strip rather than printing every coordinate twice. */
async function contactSheet(shots, out) {
  const CW = 420, PAD = 8, LBL = wantLabel ? 0 : 22;
  const cols = Math.min(shots.length, Math.max(1, Math.round(Math.sqrt(shots.length * 1.6))));
  const rows = Math.ceil(shots.length / cols);
  const first = await sharp(shots[0].png).metadata();
  const CH = Math.round(CW * (first.height / first.width));
  const tiles = [];
  for (let i = 0; i < shots.length; i++) {
    tiles.push({
      input: await sharp(shots[i].png).resize(CW, CH, { fit: "cover" }).toBuffer(),
      left: PAD + (i % cols) * (CW + PAD),
      top: LBL + PAD + Math.floor(i / cols) * (CH + PAD + LBL),
    });
  }
  const W = PAD + cols * (CW + PAD), H = (CH + PAD + LBL) * rows + PAD;
  const caption = (t, x, y) => `<text x="${x}" y="${y}" font-family="monospace" font-size="13"`
    + ` fill="#cfd6e4">${String(t).replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c])}</text>`;
  const svg = `<svg width="${W}" height="${H}"><rect width="${W}" height="${H}" fill="#12141a"/>`
    + (LBL ? shots.map((s, i) => caption(s.label, PAD + (i % cols) * (CW + PAD),
        LBL + Math.floor(i / cols) * (CH + PAD + LBL) - 6)).join("") : "") + "</svg>";
  await sharp(Buffer.from(svg)).composite(tiles).png().toFile(out);
  console.log(`sheet ${shots.length} tile(s) ${W}x${H} -> ${out}`);
}

async function main() {
  mkdirSync(outDir, { recursive: true });
  const srv = await startStaticServer(process.cwd());
  const t0 = Date.now();
  const browser = await launchChromium({ headless: true, args: chromiumArgsForBackend(backend) });
  try {
    const page = await browser.newPage();
    await page.setViewportSize({ width: vp[0], height: vp[1] });
    // Pin the FIRST team's INDEX before first paint — #mb-garage never
    // re-reads the store. Every later team goes through switchTeam's tiles.
    await installProbeInit(page, { backend, team: teamIndex(teams[0]) });
    await gotoGame(page, srv.url, 120000);
    // First paint already on the first paint job.
    await page.evaluate(({ t, liv }) => {
      GameStore.store.set("livery." + t, liv);
    }, { t: teams[0], liv: paints[0].livery });
    await openGarage(page, { team: teams[0] });

    // One state cursor per axis: a step is only paid when its coordinate
    // actually moves, so the plan's cost ordering turns into real savings.
    const at = { team: null, paint: null, parts: null, aero: null };
    const shots = [];
    let sheetHead = null;
    // Per-phase wall time, so "make it faster" is answerable from a run rather
    // than from a guess about which step costs what.
    const spent = { boot: +((Date.now() - t0) / 1000).toFixed(1), team: 0, paint: 0, parts: 0, aero: 0, frame: 0 };
    const timed = async (key, fn) => {
      const t = Date.now();
      try { return await fn(); } finally { spent[key] += +((Date.now() - t) / 1000).toFixed(2); }
    };
    for (const shot of PLAN) {
      if (skipExisting && (existsSync(join(outDir, `${shot.name}.png`))
                        || existsSync(join(outDir, `${shot.name}.jpg`)))) {
        console.log(`skip ${shot.name} (already on disk)`);
        continue;
      }
      if (at.team !== shot.team) {
        const { switched, label } = await timed("team", () => switchTeam(page, shot.team));
        console.log(`team sheet: ${label}  [switched=${switched}]`);
        at.team = shot.team;
        // A team switch resets the sheet: re-apply paint and parts below.
        at.paint = at.parts = at.aero = null;
        sheetHead = await page.evaluate(() => {
          const h = document.querySelector("#carsetup .sheet-head, #cs-inner .sheet-head");
          return h ? h.textContent.trim().slice(0, 80) : null;
        });
      }
      const paintKey = shot.paint.tag;
      if (at.paint !== paintKey) {
        const name = await timed("paint", () => (shot.paint.design
          ? applyDesign(page, shot.team, shot.paint.livery, shot.paint.design)
          : applyLivery(page, shot.team, shot.paint.livery)));
        console.log(`  paint ${paintKey} -> ${name}`);
        at.paint = paintKey;
      }
      if (at.parts !== shot.parts.tag) {
        const ids = await timed("parts", () => applyParts(page, shot.team, shot.parts));
        console.log(`  parts ${shot.parts.tag} -> ${ids}`);
        at.parts = shot.parts.tag;
        // A parts write can move vertices the paint cache still holds a hull
        // for; the paint cursor stands, but the mesh key already changed.
      }
      if (shot.aero && at.aero !== shot.aero) {
        const got = await timed("aero", () => applyAero(page, shot.aero));
        console.log(`  aero ${shot.aero} -> ${got}`);
        at.aero = shot.aero;
      }
      const s = await timed("frame", () => frame(page, shot));
      shots.push(s);
      console.log(`shot ${s.name} via=${s.via} az ${s.az} el ${s.el} dist ${s.dist} spread ${s.spread} -> ${s.png}`);
    }

    const stem = teams.length === 1 ? teams[0] : "matrix";
    if (wantSheet && shots.length) await contactSheet(shots, join(outDir, `${stem}-sheet.png`));
    const meta = join(outDir, `${stem}-angles.json`);
    const total = +((Date.now() - t0) / 1000).toFixed(1);
    writeFileSync(meta, JSON.stringify({
      teams, liveries, spineSides, spineLogos, aero: aeros,
      parts: parts.map((p) => ({ tag: p.tag, kind: p.kind, overrides: p.overrides })),
      views, framings, viewport: vp, backend, sheetHead, shots,
      seconds: total, spent, inFrame,
    }, null, 2));
    console.log(`wrote ${shots.length} shot(s) in ${total}s + ${meta}`);
    // Where the time actually went, every run — the answer to "why is this slow"
    // should never need a bespoke instrumented build.
    console.log(`  boot ${spent.boot}s  team ${spent.team}s  paint ${spent.paint}s`
      + `  parts ${spent.parts}s  aero ${spent.aero}s  frame ${spent.frame}s`
      + (shots.length ? `  (${(spent.frame / shots.length).toFixed(1)}s per frame)` : ""));
    console.log("  in-frame: " + Object.entries(inFrame)
      .sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v.toFixed(1)}s`).join("  "));
  } finally {
    await browser.close();
  }
}

runCli(() => main().then(() => shutdown()).catch((e) => { shutdown(); throw e; }));
