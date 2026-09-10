#!/usr/bin/env node
// @doc Garage preset shots, ONE Chromium: walks teams/liveries/any livery field, labels frames, sheets, `--against` A/Bs a ref.
//   node tools/shot/garage-angles.mjs [--team=redbull,mclaren|all] [--views=spine] [--livery=default,rb_white]
//     [--spineLogo=wrap,saddle] [--finShape=blade] [--cover=#101014] [--against=HEAD~1]
//     [--preset=wall|fin|flank|mark|quick] [--plan] [--fast] [--settle=8] [--view-settle=4]
//     [--zoom=8] [--pan=2,0] [--out=dir] [--label=0] [--sheet=0] [--cell=420]
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
// FRONT). `--zoom` / `--pan` are counted clicks on #cs-view-in / #cs-pan-* so a
// framing that reads here is one a player can reach.
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
// TIMING: every phase is recorded (boot, open, and per shot settle/capture/gate)
// and printed. A run reporting one total number cannot tell a slow tool from a
// busy box, and on this container the same two-shot walk measured 240.9 s and
// 286.4 s on consecutive teams. The loadavg is read once and warned about for
// the same reason — see AGENTS.md §Verification.
import vm from "node:vm";
import { mkdirSync, writeFileSync, readFileSync, renameSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join, extname, basename } from "node:path";
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
// --team takes a LIST, or `all`. Every other axis has always been a list because
// the point of this tool is a WALK; team was the one that still cost a whole
// browser per value.
const argvHas = (name) => argv.some((a) => a === name || a.startsWith(name + "="));

/** Purpose-built bundles — same idea as render-car --preset. CLI flags override. */
const PRESETS = {
  wall:  { views: "front", zoom: 4 },
  fin:   { views: "rear", zoom: 4 },
  flank: { views: "side", zoom: 8, pan: "5,0" },
  // Wall crest + flank mark + fin badge in one pass (mark colour reviews).
  mark:  { views: "front,side,rear", zoom: 6, pan: "4,0", finBadge: "logo" },
  quick: { views: "side", zoom: 6, pan: "4,0", fast: true },
};
const presetRaw = flag("--preset", "").trim();
if (presetRaw === "list") {
  console.log("Presets (CLI flags override preset defaults):");
  for (const [id, p] of Object.entries(PRESETS)) {
    const bits = [`views=${p.views}`];
    if (p.finBadge) bits.push(`finBadge=${p.finBadge}`);
    if (p.zoom) bits.push(`zoom=${p.zoom}`);
    if (p.pan) bits.push(`pan=${p.pan}`);
    if (p.fast) bits.push("fast");
    console.log(`  ${id}: ${bits.join(" ")}`);
  }
  process.exit(0);
}
const preset = presetRaw && PRESETS[presetRaw];
if (presetRaw && !preset) {
  console.error(`Unknown --preset=${presetRaw} — try --preset=list`);
  process.exit(1);
}

const teamArg = flag("--team", "mclaren").trim();
const teamsArg = teamArg === "all" ? null : teamArg.split(",").map((s) => s.trim()).filter(Boolean);
const liveries = flag("--livery", "default").split(",").map((s) => s.trim()).filter(Boolean);
const vp = flag("--viewport", "1280x720").split("x").map(Number);
const outDir = flag("--out", "artifacts/garage-angles");
const fast = argvHas("--fast") || !!(preset && preset.fast);
let zoom = Number(flag("--zoom", preset && !argvHas("--zoom") ? String(preset.zoom || 0) : "0")) || 0;
const panRaw = flag("--pan", preset && !argvHas("--pan") ? (preset.pan || "0,0") : "0,0");
let [strafe = 0, dolly = 0] = panRaw.split(",").map(Number);
const againstRef = flag("--against", null);
const doLabel = flag("--label", fast ? "0" : "1") !== "0";
const doSheet = flag("--sheet", fast ? "0" : "1") !== "0";
const cell = Math.max(120, Number(flag("--cell", "420")) || 420);
const liverySettle = Math.max(0, Number(flag("--settle", fast ? "6" : "8")) || 0);
const viewSettle = Math.max(0, Number(flag("--view-settle", fast ? "2" : "4")) || 0);
const liveryAwait = fast ? 8000 : 12000;
const viewAwait = fast ? 5000 : 8000;
const gateRetries = fast ? 1 : 3;
const doPlan = argvHas("--plan");
const doLive = argvHas("--live");

// Everything the tool owns. Anything ELSE of the form --name=value is taken as
// a livery field and validated in-page — so the flag surface grows with
// Liveries.FIELDS instead of with this file.
const OWN_FLAGS = new Set(["--team", "--livery", "--viewport", "--out", "--zoom", "--pan",
  "--views", "--against", "--label", "--sheet", "--cell", "--spine-side", "--spine-logo",
  "--preset", "--plan", "--fast", "--settle", "--view-settle", "--live"]);
const axes = [];
const addAxis = (field, raw) => {
  const values = String(raw).split(",").map((s) => s.trim()).filter(Boolean);
  if (values.length) axes.push({ field, values });
};
// The two legacy names first, so their order in the product is unchanged.
if (flag("--spine-logo", "")) addAxis("spineLogo", flag("--spine-logo", ""));
if (flag("--spine-side", "")) addAxis("spineSide", flag("--spine-side", ""));
if (preset && preset.finBadge && !argv.some((a) => a.startsWith("--finBadge=")))
  addAxis("finBadge", preset.finBadge);
for (const a of argv) {
  if (!a.startsWith("--") || !a.includes("=")) continue;
  const name = a.slice(0, a.indexOf("="));
  if (OWN_FLAGS.has(name)) continue;
  addAxis(name.slice(2), a.slice(a.indexOf("=") + 1));
}
/** The design matrix: the cartesian product of every axis given, or null. */
const designs = axes.length
  ? axes.reduce((acc, ax) => acc.flatMap((d) => ax.values.map((v) => ({ ...d, [ax.field]: v }))), [{}])
  : null;

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
function teamIndex(id) {
  const i = ROSTER.indexOf(id);
  if (i < 0) {
    console.error(`no team "${id}" — available: ${ROSTER.join(", ")}`);
    process.exit(1);
  }
  return i;
}
const teams = teamsArg || ROSTER.slice();
for (const t of teams) {
  if (!ROSTER.includes(t)) {
    console.error(`no team "${t}" — available: ${ROSTER.join(", ")}, or "all"`);
    process.exit(1);
  }
}

const ALL = ["hero", "front", "side", "rear", "top", "wingFront", "wingRear"];
const GROUPS = {
  spine: ["hero", "top", "rear", "side"],
  all: ALL,
};
const viewsDefault = preset && !argvHas("--views") ? preset.views : "spine";
const rawViews = flag("--views", viewsDefault).split(",").map((s) => s.trim()).filter(Boolean);
const views = [...new Set(rawViews.flatMap((v) => GROUPS[v] || [v]))];
const bad = views.filter((v) => !ALL.includes(v));
if (bad.length) {
  console.error(`Unknown view(s): ${bad.join(", ")}\nAvailable: ${ALL.join(", ")} + groups ${Object.keys(GROUPS).join(", ")}`);
  process.exit(1);
}

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

async function frame(page, teamId, tag, view, dir, capOpts = {}) {
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
  const tSettle = Date.now();
  await settleGarage(page, { frames: viewSettle, awaitMs: viewAwait });
  const settleMs = ms(tSettle);
  const png = join(dir, `${teamId}-${tag}-${view}.png`);
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
    gate = await bayRendered(png, vp[0]);
    gateMs += ms(tGate);
    if (gate.ok) {
      const cam = await page.evaluate(() => window.__apex.garageCam());
      return {
        view, tag, png, spread: gate.spread, via: shot.via || "page-clip",
        az: +cam.az.toFixed(3), el: +cam.el.toFixed(3), dist: +cam.effDist.toFixed(3),
        pan: cam.pan ? cam.pan.map((n) => +n.toFixed(3)) : null,
        ms: { settle: settleMs, capture: capMs, gate: gateMs, tries },
      };
    }
  }
  throw new Error(`${tag}/${view}: the bay never rendered (canvas pixel spread ${gate.spread})`);
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
async function applyDesign(page, teamId, fields) {
  const got = await page.evaluate(({ team, fields }) => {
    const t = Teams.LIST.find((x) => x.id === team);
    if (!t) return { ok: false, error: `no team "${team}"` };
    const def = Liveries.forTeam(t)[0];
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
    for (const k of Object.keys(fields)) {
      const raw = String(fields[k]);
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
    return { ok: true, name: parts.join(" ") || "default", tag: parts.join("_") || "def" };
  }, { team: teamId, fields });
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
  // Only settle if the bay actually changed. The unconditional settle cost 31.3 s
  // and 32.3 s on the two `switched=false` teams of the runs that added this
  // timing — 12 frames at ~2.6 s each under SwiftShader, spent re-settling a car
  // that had not moved. The design/livery apply below settles again anyway.
  if (switched) await settleGarage(page, { frames: liverySettle, awaitMs: liveryAwait });
  return switched;
}

/** One full matrix — every team × (design | livery) × view — into `dir`. */
async function walk(browser, srvUrl, dir, side, opts = {}) {
  mkdirSync(dir, { recursive: true });
  const ownPage = !opts.page;
  const page = opts.page || await browser.newPage();
  const phase = {};
  try {
    await page.setViewportSize({ width: vp[0], height: vp[1] });
    if (ownPage) {
      // Pin the INDEX before first paint — #mb-garage never re-reads the store.
      await installProbeInit(page, { backend: "webgl2", team: teamIndex(teams[0]) });
    }
    const tBoot = Date.now();
    await gotoGame(page, srvUrl, 120000);
    phase.boot = ms(tBoot);
    // First paint already on the first --livery (or default).
    await page.evaluate(({ t, liv }) => {
      GameStore.store.set("livery." + t, liv);
    }, { t: teams[0], liv: liveries[0] });
    const tOpen = Date.now();
    await openGarage(page, { team: teams[0] });
    phase.open = ms(tOpen);

    const shots = [];
    let heads = null;
    let gameVisible = false;
    for (const teamId of teams) {
      const tSwitch = Date.now();
      const switched = await switchTeam(page, teamId);
      const switchMs = ms(tSwitch);
      const label = await page.evaluate(() => document.getElementById("cs-team")?.textContent || "");
      if (!label) throw new Error(`garage opened but #cs-team empty for ${teamId}`);
      const shown = await page.evaluate(() => {
        const h = document.querySelector("#carsetup .sheet-head, #cs-inner .sheet-head");
        return h ? h.textContent.trim().slice(0, 80) : null;
      });
      if (!heads) heads = shown;
      console.log(`team sheet: ${label}  [switched=${switched} ${switchMs}ms]`);

      const items = designs
        ? designs.map((d) => ({ design: d }))
        : liveries.map((l) => ({ livery: l }));
      for (const it of items) {
        let tag, name;
        if (it.design) {
          const got = await applyDesign(page, teamId, it.design);
          tag = got.tag;
          name = got.name;
        } else {
          name = await applyLivery(page, teamId, it.livery);
          tag = it.livery;
        }
        for (const v of views) {
          const s = await frame(page, teamId, tag, v, dir, { gameVisible });
          gameVisible = true;
          s.team = teamId;
          s.name = name;
          if (it.design) s.design = it.design; else s.livery = it.livery;
          if (side) s.side = side;
          shots.push(s);
          console.log(`shot ${teamId}/${tag}/${s.view} via=${s.via} az ${s.az} el ${s.el} dist ${s.dist}`
            + ` spread ${s.spread} [settle ${s.ms.settle} cap ${s.ms.capture} gate ${s.ms.gate}`
            + `${s.ms.tries > 1 ? ` tries ${s.ms.tries}` : ""}] -> ${s.png}`);
          if (doLive) {
            writeLiveGallery(shots, join(dir, "live.html"),
              `garage — ${teams.join(",")} · ${views.join(",")}`);
          }
        }
      }
    }
    return { shots, phase, sheetHead: heads, page };
  } finally {
    if (ownPage && !opts.keepPage) await page.close().catch(() => {});
  }
}

const capMs = (s) => s.ms.settle + s.ms.capture + s.ms.gate;
const titleOf = (s) => `${s.team} · ${s.name} · ${s.view}`;
const subOf = (s) => `az ${s.az} el ${s.el} dist ${s.dist} · spread ${s.spread} · ${(capMs(s) / 1000).toFixed(1)}s`;

async function main() {
  mkdirSync(outDir, { recursive: true });
  const items = designs
    ? designs.map((d) => ({ design: d }))
    : liveries.map((l) => ({ livery: l }));
  const shotCount = teams.length * items.length * views.length;
  if (doPlan) {
    console.log(JSON.stringify({
      teams, liveries, axes, designs, views, preset: presetRaw || null,
      fast, liverySettle, viewSettle, gateRetries, zoom, pan: [strafe, dolly],
      shotCount, against: againstRef,
      estSeconds: Math.round(shotCount * (fast ? 12 : 18) + 25),
    }, null, 2));
    return;
  }
  const load = loadavg1();
  if (load != null && load >= 3) {
    console.warn(`WARNING loadavg ${load} >= 3 — every duration below measures the BOX, `
      + `not the tool. Reap orphans first (AGENTS.md §Verification, rule 7).`);
  }
  const t0 = Date.now();
  // APEX_HEADED=1: headed Chromium (use under xvfb-run when headless WebGL2 is
  // null — measured on this box after X/VNC loss: GLX.init fails, #nogl stays).
  const browser = await launchChromium({
    headless: process.env.APEX_HEADED !== "1",
    args: chromiumArgsForBackend("webgl2"),
  });
  const servers = [];
  try {
    const srvA = await startStaticServer(process.cwd());
    servers.push(srvA);
    const afterDir = againstRef ? join(outDir, "after") : outDir;
    const A = await walk(browser, srvA.url, afterDir, againstRef ? "after" : null,
      { keepPage: !!againstRef });
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
        B = await walk(browser, srvB.url, join(outDir, "before"), "before", { page: A.page });
        await A.page?.close().catch(() => {});
      }
    }

    const shots = A.shots.concat(B ? B.shots : []);
    if (doLabel) {
      await Promise.all(shots.map((s) =>
        labelPng(s.png, `${titleOf(s)}${s.side ? `  [${s.side === "before" ? againstRef : "working tree"}]` : ""}`, subOf(s))));
    }
    const sheets = [];
    if (doSheet) {
      if (B) {
        // Pair sheet: the same cell twice, ref on the left, tree on the right,
        // so the eye compares neighbours instead of scrolling between folders.
        const key = (s) => `${s.team}|${s.tag}|${s.view}`;
        const byKey = new Map(B.shots.map((s) => [key(s), s]));
        const items = [];
        for (const a of A.shots) {
          const b = byKey.get(key(a));
          if (!b) continue;
          items.push({ png: b.png, title: `${titleOf(b)}`, sub: `BEFORE — ${againstRef}` });
          items.push({ png: a.png, title: `${titleOf(a)}`, sub: "AFTER — working tree" });
        }
        const f = await writeSheet(items, join(outDir, "pairs-sheet.png"),
          `garage A/B — ${againstRef} (left) vs the working tree (right)`, 2);
        if (f) sheets.push(f);
      }
      const f = await writeSheet(A.shots.map((s) => ({ png: s.png, title: titleOf(s), sub: subOf(s) })),
        join(outDir, "sheet.png"),
        `garage — ${teams.join(",")} · ${views.join(",")}${againstRef ? " (working tree)" : ""}`);
      if (f) sheets.push(f);
    }

    const seconds = +((Date.now() - t0) / 1000).toFixed(1);
    const meta = join(outDir, `${teams.join("-")}-angles.json`);
    writeFileSync(meta, JSON.stringify({
      teams, liveries, axes, designs, against: againstRef, preset: presetRaw || null,
      fast, liverySettle, viewSettle, gateRetries,
      zoom, pan: [strafe, dolly], sheetHead: A.sheetHead, viewport: vp, views,
      loadavg1: load, phase: { after: A.phase, before: B ? B.phase : null },
      sheets, shots, seconds,
    }, null, 2));
    const shotMs = shots.reduce((n, s) => n + capMs(s), 0);
    console.log(`wrote ${shots.length} angle(s) in ${seconds}s`
      + `  [boot ${A.phase.boot}ms open ${A.phase.open}ms · shots ${(shotMs / 1000).toFixed(1)}s`
      + ` = ${(shotMs / 1000 / Math.max(1, shots.length)).toFixed(1)}s each · loadavg ${load ?? "?"}]`);
    for (const s of sheets) console.log(`sheet: ${s}`);
    console.log(`${meta}  [sheet: ${A.sheetHead}]`);
  } finally {
    await browser.close();
    for (const s of servers) await s.close().catch(() => {});
  }
}

main().then(() => shutdown()).catch((e) => { console.error(e); shutdown(); process.exit(1); });
