#!/usr/bin/env node
// @doc Garage camera-preset shots — ONE Chromium; optional --livery / --spine-side walks.
//   node tools/shot/garage-angles.mjs [--team=redbull] [--views=spine] [--livery=default,rb_white]
//     [--spine-side=logo,duo] [--spine-logo=…] [--zoom=8] [--pan=2,0] [--out=dir]
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
// Capture prefers #game-soft via screenshotGameCanvas — page.screenshot hangs
// under SwiftShader (document.fonts.ready after freeze).
import vm from "node:vm";
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
// --team takes a LIST, or `all`. --livery / --spine-side / --spine-logo have
// always been lists because the point of this tool is a WALK; team was the one
// axis that still cost a whole browser per value. The garage already knows how
// to switch team in-page (the picker click below), so walking it is the same
// boot, one team-card click per car — and "does this design read on every car"
// is a question about the grid, never about one of them.
const teamArg = flag("--team", "mclaren").trim();
const teamIds = teamArg === "all" ? null : teamArg.split(",").map((s) => s.trim()).filter(Boolean);
// `team` is the team being shot RIGHT NOW: applyDesign / applyLivery / frame all
// read it, so the walk rebinds it per car rather than threading it through four
// signatures. It is a `let` for that reason and for no other.
let team = null;
const liveries = flag("--livery", "default").split(",").map((s) => s.trim()).filter(Boolean);
const spineSides = (flag("--spine-side", "") || "").split(",").map((s) => s.trim()).filter(Boolean);
const spineLogos = (flag("--spine-logo", "") || "").split(",").map((s) => s.trim()).filter(Boolean);
const vp = flag("--viewport", "1280x720").split("x").map(Number);
const outDir = flag("--out", "artifacts/garage-angles");
const zoom = Number(flag("--zoom", "0")) || 0;
const [strafe = 0, dolly = 0] = (flag("--pan", "0,0")).split(",").map(Number);

/** Roster order == store.team index (game.js boot). */
// Teams.LIST, EVALUATED — not scraped. Two regexes over teams.js used to answer
// this, and both also matched `id: "custom"` on DEFAULT_CUSTOM, the MY TEAM seed
// that is NOT a roster member: `--team=all` shot twelve cars while render-car's
// `all` shot eleven, so the two tools disagreed about what "every team" means.
// The index matters as much as the list — the in-page switch uses
// Teams.LIST.indexOf, so anything but that order pins the wrong car.
// `const Teams` in an IIFE is a lexical binding that never lands on the sandbox,
// hence evaluating the identifier back out (as the car tools do).
const ROSTER = (() => {
  const sb = { console, Math, Object, Array, String, Number, JSON };
  sb.globalThis = sb;
  vm.createContext(sb);
  vm.runInContext(readFileSync(fileURLToPath(new URL("../../js/data/teams.js", import.meta.url)), "utf8"),
                  sb, { filename: "teams.js" });
  return vm.runInContext("Teams", sb).LIST.map((t) => t.id);
})();
function teamIndex(id) {
  const i = ROSTER.indexOf(id);
  if (i < 0) {
    console.error(`no team "${id}" — available: ${ROSTER.join(", ")}`);
    process.exit(1);
  }
  return i;
}
const WALK = teamIds || ROSTER.slice();
for (const t of WALK) {
  if (!ROSTER.includes(t)) { console.error(`no team "${t}" — available: ${ROSTER.join(", ")}, or "all"`); process.exit(1); }
}
team = WALK[0];
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
  const srv = await startStaticServer(process.cwd());
  const t0 = Date.now();
  const browser = await launchChromium({ headless: true, args: chromiumArgsForBackend("webgl2") });
  try {
    const page = await browser.newPage();
    await page.setViewportSize({ width: vp[0], height: vp[1] });
    // Pin the INDEX before first paint — #mb-garage never re-reads the store.
    await installProbeInit(page, { backend: "webgl2", team: teamIdx });
    await gotoGame(page, srv.url, 120000);
    // First paint already on the first --livery (or default).
    await page.evaluate(({ t, liv }) => {
      GameStore.store.set("livery." + t, liv);
    }, { t: team, liv: liveries[0] });
    await openGarage(page, { team });
    // The picker click, per car. Returns the sheet head so the caller can prove
    // the garage is actually showing the team it asked for — a shot of the wrong
    // car is the one failure this tool must never report as success.
    async function selectTeam(id) {
      const switched = await page.evaluate((tid) => {
        const t = Teams.LIST.find((x) => x.id === tid);
        if (!t) throw new Error("unknown team " + tid);
        const head = document.getElementById("cs-team");
        if (head && head.textContent === t.name.toUpperCase()) return false;
        document.querySelector('#cs-tabs [data-cs-cat="team"]')?.click();
        document.getElementById("cs-team-card")?.click();
        const tiles = document.querySelectorAll("#sel-teams .team-tile");
        const i = Teams.LIST.indexOf(t);
        if (!tiles[i]) throw new Error("no team tile for " + tid);
        tiles[i].click();
        return true;
      }, id);
      if (switched) {
        await page.waitForFunction(() => {
          const tp = document.getElementById("teampicker");
          return !tp || tp.hidden || getComputedStyle(tp).display === "none";
        }, null, { polling: 100, timeout: 15000 }).catch(() => {});
      }
      await settleGarage(page, { frames: 12 });
      const head = await page.evaluate(() => ({
        sheet: (document.querySelector("#carsetup .sheet-head, #cs-inner .sheet-head") || {}).textContent || null,
        team: (document.getElementById("cs-team") || {}).textContent || "",
      }));
      if (!head.team) throw new Error(`garage opened but #cs-team empty (sheet: ${head.sheet})`);
      console.log(`team sheet: ${head.team}  [switched=${switched}]`);
      return head;
    }
    let shown = (await selectTeam(team)).sheet;

    const shots = [];
    const designs = spineSides.length
      ? (spineLogos.length ? spineLogos : [""]).flatMap((logo) =>
        spineSides.map((side) => ({ spineLogo: logo, spineSide: side })))
      : null;
    for (const id of WALK) {
     // Rebind before any shot: applyDesign writes the custom livery under THIS
     // team's store key, and frame() names the PNG with it.
     team = id;
     if (id !== WALK[0]) shown = (await selectTeam(id)).sheet;
     if (designs) {
      for (const d of designs) {
        const name = await applyDesign(page, d);
        const tag = (d.spineLogo || "def") + "-" + d.spineSide;
        for (const v of views) {
          const s = await frame(page, tag, v);
          s.liveryName = name;
          s.team = id;
          s.spineLogo = d.spineLogo || null;
          s.spineSide = d.spineSide;
          shots.push(s);
          console.log(`shot ${tag}/${s.view} via=${s.via} az ${s.az} el ${s.el} dist ${s.dist} spread ${s.spread} -> ${s.png}`);
        }
      }
     } else {
      for (const liv of liveries) {
        const name = await applyLivery(page, liv);
        for (const v of views) {
          const s = await frame(page, liv, v);
          s.livery = liv;
          s.team = id;
          s.liveryName = name;
          shots.push(s);
          console.log(`shot ${liv}/${s.view} via=${s.via} az ${s.az} el ${s.el} dist ${s.dist} spread ${s.spread} -> ${s.png}`);
        }
      }
     }
    }
    const meta = join(outDir, `${WALK.length > 1 ? "teams" : team}-angles.json`);
    writeFileSync(meta, JSON.stringify({
      teams: WALK, team, teamIdx, liveries, spineSides, spineLogos,
      zoom, pan: [strafe, dolly], sheetHead: shown, viewport: vp, views, shots,
      seconds: +((Date.now() - t0) / 1000).toFixed(1),
    }, null, 2));
    console.log(`wrote ${shots.length} angle(s) in ${((Date.now() - t0) / 1000).toFixed(1)}s + ${meta}  [sheet: ${shown}]`);
  } finally {
    await browser.close();
  }
}

main().then(() => shutdown()).catch((e) => { console.error(e); shutdown(); process.exit(1); });
