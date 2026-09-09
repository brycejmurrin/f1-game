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
// COST ORDER. The walk nests team → paint → parts → view → framing, cheapest
// axis innermost, because each outer step costs more: a team switch is UI
// navigation plus a full rebuild, paint and parts are a store write plus a
// settle, a preset is one click, and a framing nudge is a few more. Adding a
// second framing to a 12-shot run is nearly free; adding a second team is not.
// `--dry-run` prints the matrix and the nesting without booting Chromium —
// worth doing first, because the product multiplies out fast.
//
// Mesh invalidation is the game's own: the preview key is
// `team:partsVisualKey:num` and partsVisualKey reads the store live, so a parts
// write misses the cache by itself. Paint needs the explicit drop (a custom id
// for designs, dropPreviewMeshes for the hull).
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

const argv = process.argv.slice(2);
/** Accept `--name=value` and `--name value` (render-car style). */
const flag = (name, dflt) => {
  const eq = argv.find((a) => a.startsWith(name + "="));
  if (eq) return eq.slice(name.length + 1) || dflt;
  const i = argv.indexOf(name);
  if (i >= 0 && argv[i + 1] && !argv[i + 1].startsWith("-")) return argv[i + 1];
  return dflt;
};
/** Every axis is a comma list; empty entries drop out so `--livery=a,,b` is 2. */
const list = (name, dflt) => (flag(name, dflt) || "").split(",").map((x) => x.trim()).filter(Boolean);
const dryRun = argv.includes("--dry-run");

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
  const f = framingTag(c.framing);
  if (framings.length > 1 && f) seg.push(f);
  return seg.join("-");
}

const PLAN = [];
for (const team of teams) {
  for (const paint of paints) {
    for (const part of parts) {
      for (const view of views) {
        for (const framing of framings) {
          const c = { team, paint, parts: part, view, framing };
          PLAN.push({ ...c, name: shotName(c) });
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
    + ` x ${views.length} view x ${framings.length} framing`);
  for (const p of PLAN) console.log(`  ${p.name}`);
  process.exit(0);
}

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

async function frame(page, shot) {
  const { view, framing } = shot;
  const clicked = await page.evaluate((v) => {
    const b = document.querySelector('#cs-stack [data-cs-view="' + v + '"]');
    if (!b) return false;
    b.click();
    return true;
  }, view);
  if (!clicked) throw new Error(`no camera preset "${view}" in #cs-stack`);
  // AFTER the preset: setSetupView is absolute and drops stored distance/pan,
  // so the framing nudges are re-applied per shot rather than once per run.
  await nudge(page, framing.zoom > 0 ? "cs-view-in" : "cs-view-out", framing.zoom);
  await nudge(page, framing.strafe > 0 ? "cs-pan-right" : "cs-pan-left", framing.strafe);
  await nudge(page, framing.dolly > 0 ? "cs-pan-fwd" : "cs-pan-back", framing.dolly);
  await settleGarage(page, { frames: 6 });
  const png = join(outDir, `${shot.name}.png`);
  let gate = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt) await settleGarage(page, { frames: 4 });
    const got = await screenshotGameCanvas(page, png);
    gate = await bayRendered(png, vp[0]);
    if (gate.ok) {
      const cam = await page.evaluate(() => window.__apex.garageCam());
      return {
        name: shot.name, png, view, team: shot.team,
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

async function main() {
  mkdirSync(outDir, { recursive: true });
  const srv = await startStaticServer(process.cwd());
  const t0 = Date.now();
  const browser = await launchChromium({ headless: true, args: chromiumArgsForBackend("webgl2") });
  try {
    const page = await browser.newPage();
    await page.setViewportSize({ width: vp[0], height: vp[1] });
    // Pin the FIRST team's INDEX before first paint — #mb-garage never
    // re-reads the store. Every later team goes through switchTeam's tiles.
    await installProbeInit(page, { backend: "webgl2", team: teamIndex(teams[0]) });
    await gotoGame(page, srv.url, 120000);
    // First paint already on the first paint job.
    await page.evaluate(({ t, liv }) => {
      GameStore.store.set("livery." + t, liv);
    }, { t: teams[0], liv: paints[0].livery });
    await openGarage(page, { team: teams[0] });

    // One state cursor per axis: a step is only paid when its coordinate
    // actually moves, so the plan's cost ordering turns into real savings.
    const at = { team: null, paint: null, parts: null };
    const shots = [];
    let sheetHead = null;
    for (const shot of PLAN) {
      if (at.team !== shot.team) {
        const { switched, label } = await switchTeam(page, shot.team);
        console.log(`team sheet: ${label}  [switched=${switched}]`);
        at.team = shot.team;
        // A team switch resets the sheet: re-apply paint and parts below.
        at.paint = at.parts = null;
        sheetHead = await page.evaluate(() => {
          const h = document.querySelector("#carsetup .sheet-head, #cs-inner .sheet-head");
          return h ? h.textContent.trim().slice(0, 80) : null;
        });
      }
      const paintKey = shot.paint.tag;
      if (at.paint !== paintKey) {
        const name = shot.paint.design
          ? await applyDesign(page, shot.team, shot.paint.livery, shot.paint.design)
          : await applyLivery(page, shot.team, shot.paint.livery);
        console.log(`  paint ${paintKey} -> ${name}`);
        at.paint = paintKey;
      }
      if (at.parts !== shot.parts.tag) {
        const ids = await applyParts(page, shot.team, shot.parts);
        console.log(`  parts ${shot.parts.tag} -> ${ids}`);
        at.parts = shot.parts.tag;
        // A parts write can move vertices the paint cache still holds a hull
        // for; the paint cursor stands, but the mesh key already changed.
      }
      const s = await frame(page, shot);
      shots.push(s);
      console.log(`shot ${s.name} via=${s.via} az ${s.az} el ${s.el} dist ${s.dist} spread ${s.spread} -> ${s.png}`);
    }

    const stem = teams.length === 1 ? teams[0] : "matrix";
    const meta = join(outDir, `${stem}-angles.json`);
    writeFileSync(meta, JSON.stringify({
      teams, liveries, spineSides, spineLogos,
      parts: parts.map((p) => ({ tag: p.tag, kind: p.kind, overrides: p.overrides })),
      views, framings, viewport: vp, sheetHead, shots,
      seconds: +((Date.now() - t0) / 1000).toFixed(1),
    }, null, 2));
    console.log(`wrote ${shots.length} shot(s) in ${((Date.now() - t0) / 1000).toFixed(1)}s + ${meta}`);
  } finally {
    await browser.close();
  }
}

main().then(() => shutdown()).catch((e) => { console.error(e); shutdown(); process.exit(1); });
