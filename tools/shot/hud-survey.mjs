#!/usr/bin/env node
// hud-survey.mjs — screenshot + MEASURE the race HUD across a matrix of
// devices x cameras x HUD settings, and report what is wrong with each cell.
// @doc Race-HUD survey: devices x cameras x presets/themes/scale → overlaps, missing, offscreen, tiny text + shots, gallery.
// @skill survey-ui-matrix
//
//   node tools/shot/hud-survey.mjs --matrix quick                 # 13 cells, 3 boots, ~10 min here
//   node tools/shot/hud-survey.mjs --matrix quick --only chase-default
//   node tools/shot/hud-survey.mjs --matrix full                  # pairwise, 33 cells / 20 boots, ~45 min
//   node tools/shot/hud-survey.mjs --matrix exhaustive --list     # ~440 cells / ~49 boots: CI shards it
//   node tools/shot/hud-survey.mjs --matrix exhaustive --shard 2/8 --no-shots --out artifacts/hud-survey/s2
//   node tools/shot/hud-survey.mjs --merge artifacts/hud-survey/s1 artifacts/hud-survey/s2 --out artifacts/hud-survey/all
//   node tools/shot/hud-survey.mjs --matrix scratch/my-matrix.json --no-shots
//   node tools/shot/hud-survey.mjs --cam cockpit --device phone-landscape-844x390 --preset clean   # ONE cell
//   node tools/shot/hud-survey.mjs --plan --matrix full           # boot groups + estimate as JSON, no browser
//   node tools/shot/hud-survey.mjs --self-test                    # the pure logic, no browser
//
// Flags: --matrix quick|full|exhaustive|leads|<file.json>  --track monza  --frac 0.18
//   --only <substr,…>  --shard i/n  --out artifacts/hud-survey/<stamp>
//   --no-shots (measure only; skips the lit-frame wait)  --backend three|webgl2
//   --gl swiftshader|llvmpipe (default $APEX_GL or swiftshader)  --min-font 10
//   --wait <s boot budget, 180>  --json (summary JSON as the last stdout block)
//   --list (cells, no browser)  --plan  --self-test  --merge <dir…>
//   one-cell knobs: --device --cam --profile --layout --map --gaps --mirror
//   --preset (name or inline JSON offsets) --preset-set cam|both
//   --preset-prof shown|standard|minimal|broadcast (the HUD style written) --theme --cvd
//   --contrast --text-size --hud-scale --ui-scale --btn-scale --tyres --hud
//   --tod --steer --profile-live --off <HudElements ids,…> --name. --url is NOT supported: local tree only.
//
// HOW A CELL IS MADE. Cells are grouped by BOOT KEY: device (viewport), track
// (one race build per page) and the store keys js/game.js reads once at eval
// (hudProfile, hudMetricsLayout). One page per group: those keys are written
// by an init script before any page script runs — the state hud-layout.spec.js
// reaches with set-then-reload, for one boot instead of two. Every other knob
// is LIVE: camera (__apex.camera), MAP / GAPS / MIRROR (their SETTINGS rows,
// #pm-hudmap/-hudgaps/-hudmirror: set the select, dispatch change), MOVE & SIZE
// (HudLayout.resetSet on every style + applyPreset / set on the camera's set,
// or both, of the style on screen or the cell's presetProf),
// HudElements toggles (all on, then the cell's offs), theme / CVD / contrast /
// text size (AppearanceOpts), HUD / UI / BUTTON SIZE (__apex.hudScale /
// uiScale / btnScale), tyre wear (__apex.tyres), time of day
// (__apex.setTimeOfDay), HUD visibility (__apex.hud). Each cell resets every
// live knob, so order never leaks. Then jump(frac) → freeze → snapCam, and —
// unless --no-shots — wait for a LIT frame (#game-soft ≥ 30 % non-dark).
//
// WHAT IS MEASURED (tools/lib/hud-geometry.mjs probeHudElements): every
// HudLayout element plus the tower plates, delta, BEST, gap chips, speed, pit,
// the touch buttons, cam/pause/mirror-chip — rect, visibility, min rendered
// font px. Twice: as painted (the expected-visible rules judge this), and
// with the radio card / track-limits chip / flag forced on with their widest
// text in ONE synchronous evaluate (overlaps judge this).
// Findings: tools/lib/hud-survey-matrix.mjs classifyFindings.
//
// RUNTIME HERE: SwiftShader, ~1-1.5 min per boot (page + race build), then
// ~20-30 s per cell (first lit present after a camera cut), ~5-10 s with
// --no-shots. quick ≈ 10 min, full ≈ 45 min, exhaustive ≈ 4 h (shard it:
// .github/workflows/hud-survey.yml runs it on llvmpipe). AGENTS.md rule 4:
// run it in the BACKGROUND with its log in artifacts/logs/, never beside a
// Playwright run (check /proc/loadavg < 3).
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { launchChromium, shutdown, sleep, startStaticServer } from "../lib/harness.mjs";
import { CliArgError, makeFlags, runCli } from "../lib/cli-args.mjs";
import { probeHudElements, analyzeOverlap } from "../lib/hud-geometry.mjs";
import {
  DEVICES, DEFAULT_CELL, HUD_TARGETS, CellError, ENUMS, bootGroups, cellId, classifyFindings, countBy,
  applyChecks, estimateMinutes, expandMatrix, filterOnly, mergeReports, normalizeCell, parseShard, rankFindings,
  renderFindingsMd, renderIndexHtml, selfTest, shardCells,
} from "../lib/hud-survey-matrix.mjs";
import { awaitPresentedFrame, chromiumArgsForBackend, installProbeInit } from "./probe-page.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const require = createRequire(import.meta.url);

const CELL_FLAGS = { "--device": "device", "--cam": "cam", "--profile": "profile", "--layout": "layout", "--map": "map",
  "--gaps": "gaps", "--mirror": "mirror", "--preset": "preset", "--preset-set": "presetSet", "--preset-prof": "presetProf", "--theme": "theme",
  "--cvd": "cvd", "--contrast": "contrast", "--text-size": "textSize", "--hud-scale": "hudScale", "--ui-scale": "uiScale",
  "--btn-scale": "btnScale", "--tyres": "tyres", "--hud": "hud", "--tod": "tod", "--steer": "steer", "--profile-live": "profileLive", "--off": "off", "--name": "name" };
export const KNOWN_FLAGS = ["--matrix", "--track", "--frac", "--only", "--shard", "--out", "--no-shots", "--backend", "--gl",
  "--min-font", "--wait", "--json", "--list", "--plan", "--self-test", "--merge", "--url", "--help", ...Object.keys(CELL_FLAGS)];

const insideOutput = (p) => ["artifacts", "scratch"].some((d) => {
  const rel = path.relative(path.join(ROOT, d), p);
  return rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel));
});
const circuits = () => require(path.join(ROOT, "tools/manifest.cjs")).CIRCUITS;

/** argv → a validated plan. Pure (reads a matrix FILE only when one is named). */
export function parseArgs(argv, { now = new Date(), readFile = (p) => fs.readFileSync(p, "utf8"), env = process.env } = {}) {
  const F = makeFlags(argv, KNOWN_FLAGS);
  if (F.has("--url")) throw new CliArgError("--url is not supported: hud-survey serves the LOCAL working tree only (deployed checks: deploy-research)");
  const track = F.flag("--track", "monza");
  if (!circuits().includes(track)) throw new CliArgError(`--track: unknown circuit ${track}`);
  const frac = Number(F.flag("--frac", "0.18"));
  if (!Number.isFinite(frac) || frac < 0 || frac > 1) throw new CliArgError("--frac must be 0..1");
  const backend = F.flag("--backend", "three");
  if (!["three", "webgl2"].includes(backend)) throw new CliArgError("--backend must be three or webgl2");
  const gl = F.flag("--gl", env.APEX_GL === "llvmpipe" ? "llvmpipe" : "swiftshader");
  if (!["swiftshader", "llvmpipe"].includes(gl)) throw new CliArgError("--gl must be swiftshader or llvmpipe");
  const minFont = Number(F.flag("--min-font", "10"));
  if (!Number.isFinite(minFont) || minFont < 4 || minFont > 40) throw new CliArgError("--min-font must be 4..40 px");
  const waitS = Number(F.flag("--wait", "180"));
  if (!Number.isFinite(waitS) || waitS < 10 || waitS > 900) throw new CliArgError("--wait must be 10..900 s");
  const stamp = now.toISOString().replace(/[:.]/g, "-").replace(/Z$/, "");
  const out = path.resolve(ROOT, F.flag("--out", path.join("artifacts", "hud-survey", stamp)));
  if (!insideOutput(out)) throw new CliArgError(`--out must stay under artifacts/ or scratch/ (got ${out})`);
  const common = { out, track, frac, backend, gl, minFont, waitMs: waitS * 1000, shots: !F.has("--no-shots"),
    json: F.has("--json"), list: F.has("--list"), plan: F.has("--plan") };
  if (F.has("--merge")) {
    // Every non-flag token after --merge is a shard directory.
    const i = argv.indexOf("--merge");
    const dirs = [];
    for (let j = i + 1; j < argv.length && !argv[j].startsWith("--"); j++) dirs.push(path.resolve(ROOT, argv[j]));
    if (!dirs.length) throw new CliArgError("--merge needs one or more shard directories");
    return { ...common, merge: dirs };
  }
  const one = {};
  for (const [fl, k] of Object.entries(CELL_FLAGS)) {
    if (!F.has(fl)) continue;
    let v = F.flag(fl, "");
    if (k === "preset" && /^\s*\{/.test(v)) {
      try { v = JSON.parse(v); } catch { throw new CliArgError("--preset: inline offsets must be JSON, e.g. '{\"map\":{\"s\":150}}'"); }
    }
    one[k] = v;
  }
  let expanded;
  try {
    if (Object.keys(one).length) {
      if (F.has("--matrix")) throw new CliArgError("pass --matrix OR one-cell knobs, not both");
      const c = normalizeCell(one, { track });
      expanded = { cells: [{ ...c, id: cellId(c) }], meta: { matrix: "cell" } };
    } else {
      const m = F.flag("--matrix", "quick");
      if (["quick", "full", "exhaustive", "leads"].includes(m)) expanded = expandMatrix(m, { track });
      else {
        const file = path.resolve(ROOT, m);
        let text;
        try { text = readFile(file); } catch { throw new CliArgError(`--matrix: cannot read ${m}`); }
        if (text.length > 1024 * 1024) throw new CliArgError("--matrix file exceeds 1 MiB");
        let spec;
        try { spec = JSON.parse(text); } catch { throw new CliArgError(`--matrix: ${m} is not JSON`); }
        expanded = expandMatrix(spec, { track });
        expanded.meta.file = path.relative(ROOT, file);
      }
    }
    for (const c of expanded.cells) if (!circuits().includes(c.track)) throw new CliArgError(`cell ${c.id}: unknown track ${c.track}`);
    let cells = filterOnly(expanded.cells, F.list("--only", ""));
    if (!cells.length) throw new CliArgError(`no cells match --only ${F.flag("--only", "")} (ids: ${expanded.cells.slice(0, 40).map((c) => c.id).join(", ")}…)`);
    let shard = null;
    if (F.has("--shard")) {
      shard = parseShard(F.flag("--shard", ""));
      cells = shardCells(cells, shard.i, shard.n);
    }
    return { ...common, cells, meta: { ...expanded.meta, track, frac, shard: shard ? `${shard.i}/${shard.n}` : null },
      selfTest: F.has("--self-test") };
  } catch (e) {
    if (e instanceof CellError) throw new CliArgError(e.message);
    throw e;
  }
}

/** Chromium flags: the probe's backend set, plus llvmpipe the way
 *  playwright.config.js does it under APEX_GL=llvmpipe (CI only: no /dev/dri here). */
export function chromiumArgs(plan) {
  const args = chromiumArgsForBackend(plan.backend);
  if (plan.gl !== "llvmpipe") return args;
  return args.map((a) => (a === "--use-angle=swiftshader" ? "--use-angle=gl" : a)).concat(["--use-gl=angle", "--ignore-gpu-blocklist"]);
}

// ── in-page helpers (self-contained: serialised into the page) ────────────
export function applyCell(c) {
  const a = window.__apex;
  const errors = [];
  const step = (k, f) => { try { f(); } catch (e) { errors.push(`${k}: ${e && e.message || e}`); } };
  // A SETTINGS row (SettingRow select): set the value, dispatch change — the
  // path a player's click takes, so the row's own handler persists + applies.
  const row = (id, v) => {
    const s = document.getElementById(id + "-sel");
    if (!s) throw new Error(`no #${id}-sel`);
    s.value = v;
    if (s.value !== v) throw new Error(`#${id}-sel has no option ${v}`);
    s.dispatchEvent(new Event("change", { bubbles: true }));
  };
  a.freeze(false);
  // The boot profile back first: a previous cell's live switch must not leak.
  step("profile", () => row("pm-hudprofile", c.profile));
  step("theme", () => AppearanceOpts.setTheme(c.theme));
  step("cvd", () => AppearanceOpts.setCvdMode(c.cvd));
  step("contrast", () => AppearanceOpts.setContrast(c.contrast));
  step("textSize", () => AppearanceOpts.setTextSize(c.textSize));
  step("hudScale", () => a.hudScale(c.hudScale == null ? null : c.hudScale));
  step("uiScale", () => a.uiScale(c.uiScale == null ? null : c.uiScale));
  step("btnScale", () => a.btnScale(c.btnScale == null ? null : c.btnScale));
  step("tyres", () => a.tyres({ level: c.tyres === "off" ? "off" : "real" }));
  step("map", () => row("pm-hudmap", c.map));
  step("gaps", () => row("pm-hudgaps", c.gaps));
  step("mirror", () => { try { row("pm-hudmirror", c.mirror); } catch (e) { a.mirror(c.mirror); } });
  step("elements", () => {
    for (const [id] of HudElements.ELEMENTS) HudElements.set(id, true);
    for (const id of c.off || []) HudElements.set(id, false);
  });
  step("tod", () => a.setTimeOfDay(c.tod));
  step("go", () => a.go());
  step("camera", () => a.camera(c.cam));
  step("preset", () => {
    // Every style: a previous cell's presetProf write must not leak.
    for (const pn of HudLayout.PROFILES || [undefined]) { HudLayout.resetSet("cockpit", pn); HudLayout.resetSet("other", pn); }
    const sets = c.presetSet === "both" ? ["cockpit", "other"] : [HudLayout.camSet(c.cam)];
    const pn = c.presetProf && c.presetProf !== "shown" ? c.presetProf : undefined;
    for (const sn of sets) {
      if (typeof c.preset === "string") { if (!HudLayout.applyPreset(c.preset, sn, pn)) throw new Error("unknown preset " + c.preset); }
      else for (const [id, v] of Object.entries(c.preset)) HudLayout.set(id, v, sn, pn);
    }
  });
  if (c.profileLive && c.profileLive !== "none") step("profileLive", () => row("pm-hudprofile", c.profileLive));
  step("jump", () => { a.jump(c.frac, 60, 0); if (a.step) a.step(1 / 60, 2); });
  a.freeze(true);
  step("snapCam", () => a.snapCam());
  // Only on a change: hud(true) also re-derives #pausebtn from G.state.
  step("hud", () => { if (a.hud() !== (c.hud !== "off")) a.hud(c.hud !== "off"); });
  const body = document.body.classList;
  const m = a.mirror ? a.mirror() : null;
  return {
    errors,
    state: {
      camera: a.camera(), hudScale: a.hudScale(), mirror: m && { mode: m.mode, shown: m.shown },
      layoutSet: typeof HudLayout !== "undefined" ? HudLayout.shown() : null,
      presetOf: typeof HudLayout !== "undefined" ? HudLayout.presetOf() : null,
      hudHide: document.body.dataset.hudHide || "",
      bodyHud: (document.body.className.match(/\b(hud-[a-z-]+|cockpit-cam|desktop|in-race)\b/g) || []).join(" "),
      theme: document.documentElement.getAttribute("data-ui-theme"),
    },
    ctx: { desktop: body.contains("desktop"), cockpitCam: body.contains("cockpit-cam"), bcam: body.contains("hud-bcam") },
  };
}

/** Force the transient readouts on with their widest text, probe, restore —
 *  ONE synchronous task, so the 10 Hz HUD tick cannot re-hide them between
 *  the write and the read (hud-layout.spec "track-limits chip"). */
export function probeWithTransients({ src, arg }) {
  const probe = (0, eval)("(" + src + ")");
  const saved = [];
  const force = (id, fill) => {
    const el = document.getElementById(id);
    if (!el) return;
    saved.push([el, el.hidden, el.innerHTML]);
    el.hidden = false;
    fill(el);
  };
  force("announce", () => {
    const who = document.getElementById("announce-who"), text = document.getElementById("announce-text");
    if (who) who.textContent = "VERSTAPPEN · RADIO · 33";
    if (text) text.textContent = "CAUTION — CHEAPER STOP, ABOUT 23s LOST";
  });
  force("hud-limits", (el) => { const s = el.querySelector("span"); if (s) s.textContent = "●●●○"; });
  force("hud-flag", (el) => { if (!el.textContent.trim()) el.textContent = "YELLOW · SECTOR 2"; });
  // Under MOTION: REDUCED (the survey's default) every HUD descendant carries a 0.01 ms `transition: all`
  // (css/hud.css), and a style change made in THIS task starts it: a read here still returns the OLD top /
  // left of anything that reacts to the forced chips (INPUTS stepping below the limits chip). Finish
  // them so the probe sees the settled geometry a player sees a frame later.
  try { for (const a of document.getAnimations()) { try { a.finish(); } catch (_) { /* infinite or detached */ } } } catch (_) { /* old engine */ }
  try { return probe(arg); }
  finally { for (const [el, hidden, html] of saved.reverse()) { el.innerHTML = html; el.hidden = hidden; } }
}

/** fitHud's published caps and modes (js/ui/hud.js): the numbers a lead compares. */
export function hudFitState() {
  const root = document.documentElement;
  const vars = {};
  for (const k of ["--hud-z-top", "--hud-z-bot", "--hud-z-dock", "--hud-z", "--hud-scale", "--hud-top-h"]) vars[k] = root.style.getPropertyValue(k).trim();
  return {
    vars, limitsLeft: "limitsLeft" in root.dataset,
    // fitHud's gap-strip rungs (shorten, then drop under the map): read with the caps so a tower x gaps
    // overlap can be told apart as "the strip never dropped" vs "it dropped and still clashes".
    gapShort: "gapShort" in root.dataset, gapDrop: "gapDrop" in root.dataset,
    layoutSet: typeof HudLayout !== "undefined" ? HudLayout.shown() : null,
    bodyHud: (document.body.className.match(/\b(hud-[a-z-]+|cockpit-cam|desktop|in-race)\b/g) || []).join(" "),
  };
}

/** The in-page half of a lead's CHECKS (tools/lib/hud-survey-matrix.mjs
 *  LEADS): colours, a label's clip, and how long fitHud takes to re-cap. */
export async function runExtras(checks) {
  const root = document.documentElement;
  const rect = (el) => { const b = el.getBoundingClientRect(); return { x: Math.round(b.x * 10) / 10, y: Math.round(b.y * 10) / 10, r: Math.round(b.right * 10) / 10, b: Math.round(b.bottom * 10) / 10 }; };
  const out = [];
  for (const ch of checks) {
    if (ch.type === "contrast") {
      const el = document.querySelector(ch.sel);
      if (!el) { out.push({ missing: true }); continue; }
      let bg = null, from = null;
      for (let p = el; p; p = p.parentElement) {
        const c = getComputedStyle(p).backgroundColor;
        const m = /rgba?\(([^)]+)\)/.exec(c);
        if (m) { const v = m[1].split(/[\s,/]+/).filter(Boolean).map(Number); if (v.length < 4 || v[3] > 0) { bg = c; from = p.id || String(p.className).split(" ")[0]; break; } }
      }
      out.push({ fg: getComputedStyle(el).color, bg, bgFrom: from });
    } else if (ch.type === "clip") {
      const bar = document.querySelector(ch.sel), lab = document.querySelector(ch.label);
      if (!bar || !lab) { out.push({ missing: true }); continue; }
      out.push({ scrollW: lab.scrollWidth, clientW: lab.clientWidth, scrollH: lab.scrollHeight, clientH: lab.clientHeight, lab: rect(lab), bar: rect(bar) });
    } else if (ch.type === "settle") {
      const read = () => root.style.getPropertyValue(ch.var).trim();
      const before = read();
      const t0 = performance.now();
      if (ch.off) HudElements.set(ch.off, false);
      if (ch.set) HudLayout.set(ch.set[0], ch.set[1], HudLayout.shown());
      let last = before, lastAt = null;
      while (performance.now() - t0 < (ch.windowMs || 3000)) {
        await new Promise((r) => setTimeout(r, 20));
        const v = read();
        if (v !== last) { last = v; lastAt = performance.now() - t0; }
      }
      out.push({ before, after: last, lastChangeMs: lastAt });
    } else out.push(null);
  }
  return out;
}

function litFraction() {
  const c = document.getElementById("game-soft");
  if (!c || !c.width) return -1;
  const d = c.getContext("2d").getImageData(0, 0, c.width, c.height).data;
  let n = 0, k = 0;
  for (let i = 0; i < d.length; i += 4 * 97) { k++; if (d[i] + d[i + 1] + d[i + 2] > 60) n++; }
  return k ? n / k : -1;
}

const round = (recs) => recs.map((r) => {
  const o = { ...r };
  for (const k of ["x", "y", "r", "b", "w", "h", "cx", "cy", "rr"]) if (typeof o[k] === "number") o[k] = Math.round(o[k] * 10) / 10;
  return o;
});

/** How long one CDP capture may take. Software GL (SwiftShader) paints a 1920x1080 frame several times slower than a phone
 *  frame: lead10-announce-s150-1920 failed the old flat 60 s cap on an idle box twice (2026-10-10) and passed under llvmpipe, so
 *  the cap scales with the pixel count. Phones and 1280-wide desktops keep 60 s. */
export function shotTimeoutMs(w, h) {
  return w * h > 1.5e6 ? 180000 : 60000;
}

async function cdpShot(page, file) {
  // CDP directly, not page.screenshot(): Playwright's path waits on
  // document.fonts.ready, which hung GHA smoke shards (probe-page.mjs).
  // file null: a 1x1 capture whose only job is to PRODUCE a frame (see the
  // measure step) — measure-only runs need the frame, not the pixels.
  const session = await page.context().newCDPSession(page);
  try {
    const opts = { format: "png", captureBeyondViewport: false };
    if (!file) opts.clip = { x: 0, y: 0, width: 1, height: 1, scale: 1 };
    const vp = page.viewportSize() || { width: 0, height: 0 };
    const cap = shotTimeoutMs(vp.width, vp.height);
    const { data } = await Promise.race([
      session.send("Page.captureScreenshot", opts),
      sleep(cap).then(() => { throw new Error(`CDP captureScreenshot timed out after ${cap / 1000} s at ${vp.width}x${vp.height} (software GL; --gl llvmpipe is faster)`); }),
    ]);
    if (file) fs.writeFileSync(file, Buffer.from(data, "base64"));
  } finally { try { await session.detach(); } catch { /* closed */ } }
}

async function runGroup(browser, group, plan, log) {
  const c0 = group.cells[0];
  const dev = DEVICES[c0.device];
  const ctx = await browser.newContext({ viewport: { width: dev.w, height: dev.h }, hasTouch: dev.touch, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  let current = "boot";
  const errs = [];
  page.on("pageerror", (e) => errs.push({ cell: current, msg: String(e && e.message || e).slice(0, 300) }));
  await installProbeInit(page, { backend: plan.backend });
  await page.addInitScript((keys) => {
    try { for (const [k, v] of Object.entries(keys)) localStorage.setItem("apex26." + k, JSON.stringify(v)); } catch { /* storage off */ }
  }, { hudProfile: c0.profile, hudMetricsLayout: c0.layout, ...(c0.steer !== "default" ? { steerMode: c0.steer } : {}) });
  const results = [];
  try {
    const t0 = Date.now();
    await page.goto(plan.url, { waitUntil: "domcontentloaded", timeout: plan.waitMs });
    await page.waitForFunction(() => window.__apex != null && window.__apex.race, null, { polling: 100, timeout: plan.waitMs });
    await page.evaluate(async () => { try { if (window.Assets && Assets.loadModels) await Assets.loadModels(); } catch { /* procedural */ } });
    const ins = dev.ins;
    if (ins.sal || ins.sar || ins.sat || ins.sab) {
      await page.addStyleTag({ content: `:root{--sal:${ins.sal}px;--sar:${ins.sar}px;--sat:${ins.sat}px;--sab:${ins.sab}px;}` });
    }
    await page.evaluate((id) => window.__apex.race(id), c0.track);
    await page.waitForFunction(() => window.__apex.info().track != null, null, { polling: 100, timeout: plan.waitMs });
    await sleep(1200);
    log(`boot ${group.bootKey} in ${((Date.now() - t0) / 1000).toFixed(0)} s`);
    for (const cell of group.cells) {
      current = cell.id;
      const t1 = Date.now();
      const rec = { id: cell.id, cell, shot: null, shotRel: null };
      try {
        const applied = await page.evaluate(applyCell, { ...cell, frac: plan.frac });
        await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
        await sleep(300);
        let lit = null;
        // Measure-only skips the lit-frame wait: the DOM boxes do not depend
        // on the canvas, and that wait is most of a cell's cost here.
        if (plan.shots) {
          for (let t = 0; t < 30; t++) {
            await awaitPresentedFrame(page, 12000);
            lit = await page.evaluate(litFraction);
            if (lit > 0.3 || lit < 0) break;
            await sleep(500);
          }
        }
        const targets = HUD_TARGETS.map((t) => ({ ...t }));
        // SHOT FIRST, MEASURE AFTER. Here (headless, frozen sim) a MOVE & SIZE
        // change only reaches the boxes when a frame is produced: probing before
        // the capture read the PREVIOUS cell's layout every time (2026-10-04,
        // HUD_SURVEY_DEBUG: corners cell probed big's boxes, light probed
        // corners'), while the PNG was right. The capture produces that frame;
        // measure-only runs force one with a 1x1 capture (awaitPresentedFrame
        // did not: its probe still read the previous cell). Then re-probe
        // until two reads agree (fitHud re-fits on its own tick), 3 s cap.
        // ONE HUD REFRESH, FRAMED. The sim is frozen, so the HUD's own ~10 Hz tick
        // (fitHud: band caps, the radio card's slot, --mir-paint-b) does not run
        // between cells; and a layout change lands only when a frame is produced.
        // So: a frame (1x1 capture) to land the cell's layout, then a forced
        // re-fit (GameHud.invalidateFit + __apex.jump's refreshHud(true) at the
        // same spot), then the measured frame. Without it the leads compared one
        // cell's caps against the previous cell's (2026-10-04: --radio-top-*
        // identical before and after the slot fix).
        await cdpShot(page, null);
        // THREE REFRESHES, not one: fitHud settles its gap-strip rungs over consecutive ticks (shorten the
        // strip, then drop it under the map — each change re-keys the fit), and the sim is frozen here, so
        // the game's own 10 Hz tick never supplies them. One pass left the strip in the tower's row on a
        // cell where play drops it (2026-10-10, phoneL-cockpit: tower x gaps, gapShort/gapDrop both false).
        await page.evaluate((frac) => {
          const a = window.__apex;
          for (let pass = 0; pass < 3; pass++) {
            try { if (window.GameHud && GameHud.invalidateFit) GameHud.invalidateFit(); } catch { /* old tree */ }
            a.freeze(false); a.jump(frac, 60, 0); if (a.step) a.step(1 / 60, 2); a.freeze(true);
          }
        }, plan.frac);
        await cdpShot(page, null);
        if (plan.shots) {
          const file = path.join(plan.out, "shots", `${cell.id}.png`);
          await cdpShot(page, file);
          rec.shot = path.relative(ROOT, file);
          rec.shotRel = path.relative(plan.out, file);
        }
        let records = await page.evaluate(probeHudElements, { targets, fonts: true });
        for (let k = 0, prev = JSON.stringify(round(records)); k < 20; k++) {
          await sleep(150);
          records = await page.evaluate(probeHudElements, { targets, fonts: true });
          const cur = JSON.stringify(round(records));
          if (cur === prev) break;
          prev = cur;
        }
        const transientRecords = await page.evaluate(probeWithTransients, { src: probeHudElements.toString(), arg: { targets } });
        // The fit pass's own outputs, read at measure time (fitHud writes them on its tick, not in applyCell).
        const fit = await page.evaluate(hudFitState);
        // Lead extras LAST: a `settle` check mutates the HUD (the next cell resets it).
        const extras = cell.checks && cell.checks.length ? await page.evaluate(runExtras, cell.checks) : undefined;
        Object.assign(rec, { lit: lit == null ? null : +lit.toFixed(3), applyErrors: applied.errors, state: { ...applied.state, ...fit },
          ctx: applied.ctx, records: round(records), transientRecords: round(transientRecords), extras });
      } catch (e) {
        rec.cellError = String(e && e.message || e).slice(0, 400);
      }
      rec.pageErrors = errs.filter((x) => x.cell === cell.id).map((x) => x.msg);
      rec.findings = classifyFindings(cell, rec, { minFontPx: plan.minFont, analyze: analyzeOverlap });
      for (const msg of rec.applyErrors || []) rec.findings.push({ cell: cell.id, kind: "pageError", elements: [], detail: "knob failed: " + msg, severity: "medium" });
      rec.ms = Date.now() - t1;
      log(`${cell.id}: ${rec.findings.length} findings${rec.lit != null ? `, lit ${rec.lit}` : ""}, ${(rec.ms / 1000).toFixed(0)} s${rec.cellError ? " ERROR " + rec.cellError : ""}`);
      results.push(rec);
    }
  } catch (e) {
    // The boot failed: every cell of the group reports it, none is silently dropped.
    for (const cell of group.cells.filter((c) => !results.some((r) => r.id === c.id))) {
      const rec = { id: cell.id, cell, cellError: "boot failed: " + String(e && e.message || e).slice(0, 300),
        pageErrors: errs.filter((x) => x.cell === "boot").map((x) => x.msg) };
      rec.findings = classifyFindings(cell, rec, { minFontPx: plan.minFont });
      results.push(rec);
    }
    log(`boot ${group.bootKey} FAILED: ${e && e.message || e}`);
  } finally {
    await ctx.close().catch(() => {});
  }
  return results;
}

function contactSheets(out, cells) {
  const which = spawnSync("sh", ["-c", "command -v montage"], { encoding: "utf8" });
  if (which.status !== 0) return { skipped: "ImageMagick montage not installed" };
  const sheets = [];
  const byDev = new Map();
  for (const c of cells) if (c.shotRel) { const k = c.cell.device; if (!byDev.has(k)) byDev.set(k, []); byDev.get(k).push(c); }
  for (const [dev, list] of byDev) {
    for (let i = 0; i < list.length; i += 12) {
      const part = list.slice(i, i + 12);
      const file = path.join(out, `sheet-${dev}-${i / 12 + 1}.png`);
      const args = [];
      for (const c of part) args.push("-label", c.id, path.join(out, c.shotRel));
      args.push("-tile", "4x", "-geometry", "480x+6+6", "-pointsize", "13", "-background", "#222", "-fill", "#eee", file);
      const r = spawnSync("montage", args, { encoding: "utf8", timeout: 120000 });
      if (r.status === 0) sheets.push(path.relative(ROOT, file));
    }
  }
  return { sheets };
}

/** report.json + findings.md + index.html + contact sheets, and the --json summary.
 *  Exit success only when every cell was measured and none carried a cellError
 *  (a CDP timeout mid-matrix used to leave exit 0 with "27/28 cells measured"). */
function writeReport(plan, report, log) {
  const sheets = report.cells.some((c) => c.shotRel) ? contactSheets(plan.out, report.cells) : { skipped: "no shots" };
  report.sheets = sheets;
  fs.mkdirSync(plan.out, { recursive: true });
  fs.writeFileSync(path.join(plan.out, "report.json"), JSON.stringify(report, null, 2));
  fs.writeFileSync(path.join(plan.out, "findings.md"), renderFindingsMd(report) + "\n");
  fs.writeFileSync(path.join(plan.out, "index.html"), renderIndexHtml(report));
  const rel = (f) => path.relative(ROOT, path.join(plan.out, f));
  const measured = report.cells.filter((c) => c.records && c.records.length).length;
  const cellFailed = report.cells.filter((c) => c.cellError).length;
  const ok = measured > 0 && cellFailed === 0 && measured === report.cells.length;
  log(`= hud-survey ${ok ? "done" : "failed"}: ${measured}/${report.cells.length} cells measured` +
    `${cellFailed ? `, ${cellFailed} cellError` : ""}, ${JSON.stringify(report.counts)}`);
  for (const f of report.findings.slice(0, 12)) log(`  ${f.severity.padEnd(6)} ${f.kind.padEnd(10)} ${f.cell}: ${f.detail}`);
  if (plan.json) {
    const summary = {
      ok, out: path.relative(ROOT, plan.out), report: rel("report.json"), findingsMd: rel("findings.md"),
      indexHtml: rel("index.html"), sheets: sheets.sheets || [], counts: report.counts, meta: report.meta.matrix,
      measured, cellFailed, cells: report.cells.map((c) => ({
        id: c.id, shot: c.shotRel ? path.relative(ROOT, path.join(plan.out, c.shotRel)) : null, lit: c.lit ?? null,
        error: c.cellError || null, state: c.state || null, findings: c.findings || [],
        measurements: (c.records || []).filter((r) => r.exists).map((r) => ({ key: r.key, visible: r.visible && !r.fadedByAncestor,
          hiddenBy: r.hiddenBy, rect: r.visible ? [r.x, r.y, r.w, r.h] : null, minFontPx: r.minFontPx ?? null })),
      })),
    };
    console.log(JSON.stringify(summary));
  }
  return ok;
}

/** --merge: shard dirs → one report; shots are copied under <out>/shots. */
function runMerge(plan, log) {
  const parts = [];
  fs.mkdirSync(path.join(plan.out, "shots"), { recursive: true });
  for (const dir of plan.merge) {
    // A downloaded artifact may nest the report one level down.
    const found = fs.existsSync(path.join(dir, "report.json")) ? dir
      : (fs.readdirSync(dir, { withFileTypes: true }).filter((d) => d.isDirectory())
        .map((d) => path.join(dir, d.name)).find((d) => fs.existsSync(path.join(d, "report.json"))));
    if (!found) throw new CliArgError(`--merge: no report.json in ${dir}`);
    const report = JSON.parse(fs.readFileSync(path.join(found, "report.json"), "utf8"));
    parts.push({ report, relink: (c) => {
      if (!c.shotRel) return null;
      const src = path.join(found, c.shotRel);
      if (!fs.existsSync(src)) return null;
      const dst = path.join(plan.out, "shots", path.basename(src));
      if (path.resolve(src) !== path.resolve(dst)) fs.copyFileSync(src, dst);
      return path.relative(plan.out, dst);
    } });
  }
  const report = mergeReports(parts);
  log(`merged ${parts.length} reports → ${report.cells.length} cells`);
  return writeReport(plan, report, log);
}

function runSelfTest() {
  const res = selfTest(analyzeOverlap);
  // The CLI's own parse rules, still browser-free.
  const p = parseArgs(["--matrix", "quick", "--only", "chase-default"]);
  res.push({ name: "--only selects one cell", ok: p.cells.length === 1 && p.cells[0].id === "chase-default" });
  const one = parseArgs(["--cam", "cockpit", "--preset", '{"map":{"s":150}}', "--off", "gear,ot"]);
  res.push({ name: "one-cell knobs + inline offsets + offs", ok: one.cells.length === 1 && one.cells[0].preset.map.s === 150 && one.cells[0].off.join() === "gear,ot" });
  const s = [1, 2, 3].map((i) => parseArgs(["--matrix", "full", "--shard", `${i}/3`]).cells.length);
  res.push({ name: "--shard 1..3/3 partitions full", ok: s.reduce((a, b) => a + b, 0) === parseArgs(["--matrix", "full"]).cells.length, detail: s.join("+") });
  res.push({ name: "--gl llvmpipe maps the ANGLE flags", ok: chromiumArgs({ backend: "three", gl: "llvmpipe" }).includes("--use-angle=gl") });
  for (const bad of [["--url", "http://x"], ["--out", "/tmp/x"], ["--cam", "nope"], ["--frac", "2"], ["--shard", "5/4"], ["--off", "map"]]) {
    let ok = false;
    try { parseArgs(bad); } catch (e) { ok = e instanceof CliArgError; }
    res.push({ name: `refuses ${bad.join(" ")}`, ok });
  }
  for (const r of res) console.log(`${r.ok ? "ok  " : "FAIL"} ${r.name}${r.detail ? " — " + r.detail : ""}`);
  const failed = res.filter((r) => !r.ok).length;
  console.log(`= self-test ${failed ? "failed" : "passed"} (${res.length - failed}/${res.length})`);
  return failed ? 1 : 0;
}

async function main() {
  const argv = process.argv.slice(2);
  if (argv.includes("--help") || argv.includes("-h")) {
    const src = fs.readFileSync(fileURLToPath(import.meta.url), "utf8").split("\n");
    console.log(src.slice(1, src.findIndex((l) => l.startsWith("import "))).map((l) => l.replace(/^\/\/ ?/, "")).join("\n"));
    return;
  }
  if (argv.includes("--self-test")) { process.exitCode = runSelfTest(); return; }
  const plan = parseArgs(argv);
  const log = (s) => console.error(`[hud-survey] ${s}`);
  if (plan.merge) { process.exitCode = runMerge(plan, log) ? 0 : 1; return; }
  const groups = bootGroups(plan.cells);
  const est = estimateMinutes(plan.cells, { shots: plan.shots });
  // The cost first, always: an exhaustive run is hours on this container.
  console.error(`[hud-survey] ${plan.meta.matrix}${plan.meta.shard ? ` shard ${plan.meta.shard}` : ""}: ${plan.cells.length} cells in ${groups.length} boots — estimate ${est} min on SwiftShader${plan.shots ? "" : " (measure only)"}`);
  if (plan.list) {
    for (const g of groups) for (const c of g.cells) console.log(`${c.id}\t${g.bootKey}`);
    return;
  }
  if (plan.plan) {
    const body = { ok: true, plan: true, meta: plan.meta, out: path.relative(ROOT, plan.out), cells: plan.cells.length,
      boots: groups.length, estimateMin: est, groups: groups.map((g) => ({ bootKey: g.bootKey, cells: g.cells.map((c) => c.id) })) };
    console.log(JSON.stringify(body, null, 2));
    return;
  }
  fs.mkdirSync(path.join(plan.out, "shots"), { recursive: true });
  log(`→ ${path.relative(ROOT, plan.out)} (gl ${plan.gl}, backend ${plan.backend})`);
  const srv = await startStaticServer(ROOT);
  plan.url = srv.url;
  const cells = [];
  try {
    const browser = await launchChromium({ args: chromiumArgs(plan) });
    for (const g of groups) cells.push(...await runGroup(browser, g, plan, log));
  } finally {
    await shutdown();
  }
  const findings = rankFindings(applyChecks(cells).flatMap((c) => c.findings));
  const report = { meta: { ...plan.meta, when: new Date().toISOString(), backend: plan.backend, gl: plan.gl, minFontPx: plan.minFont,
    shots: plan.shots, defaults: DEFAULT_CELL, enums: ENUMS }, cells, findings, counts: countBy(findings) };
  process.exitCode = writeReport(plan, report, log) ? 0 : 1;
}

let isEntry = false;
try { isEntry = fs.realpathSync(process.argv[1]) === fileURLToPath(import.meta.url); } catch { /* imported */ }
if (isEntry) runCli(main);
