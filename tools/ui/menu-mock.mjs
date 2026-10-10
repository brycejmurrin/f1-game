#!/usr/bin/env node
// menu-mock.mjs — every menu / sheet on BLACK with the 3D off: labelled boxes, numbers per screen, a cell cache, ~1 s a shot.
// @doc Menu-screen layout shots (menu-screens SCREENS x VIEWPORTS), 3D off, one boot per pointer shape, boxes + tap/overflow/text numbers, content-hash cell cache.
// @skill survey-ui-matrix
//
//   node tools/ui/menu-mock.mjs                                                    # title,settings,racesettings,results,quali,pause @ the play-shape phone
//   node tools/ui/menu-mock.mjs --screens=select,garage --viewports=ios-iphone-landscape-844,desktop-1280x800
//   node tools/ui/menu-mock.mjs --screens='*' --viewports='ios-*' --format jpeg    # everything on every phone
//   node tools/ui/menu-mock.mjs --list                                             # cells, no browser
//   node tools/ui/menu-mock.mjs --no-cache --no-boxes --out artifacts/menu-mock/x
//
// Flags: --screens a,b|'*' (tools/ui/menu-screens.mjs ids; a trailing * is a prefix)  --viewports a,b (same file)
//   --format png|jpeg  --no-boxes  --no-cache  --min-tap 44 (touch) / 24 (pointer)  --min-font 10  --out artifacts/menu-mock/<stamp>
//   --gl swiftshader|llvmpipe (default $APEX_GL or llvmpipe)  --list  --json  --help
//
// WHY IT IS FAST. layout-audit --gallery already boots once per viewport; this boots once per POINTER
// SHAPE (hasTouch x isMobile are fixed at context creation, the viewport is not): the viewport and the
// safe-area insets change in place on the same page, the 3D stays off (__apex.headless + #game hidden),
// the capture is JPEG-able at device scale 1, and a cell whose definition AND js/ css/ index.html are
// unchanged is served from artifacts/ui-mock-cache without opening the screen at all.
//
// WHAT IT MEASURES (per cell, inside the screen's root): controls below the tap floor, controls painted
// off-screen with no scrollable ancestor, scroll containers whose content is cut with no way to reach it,
// text under the font floor. It is a LOOK-FAST tool: layout-audit / fit-audit stay the numbers of record.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { launchChromium, shutdown, startStaticServer } from "../lib/harness.mjs";
import { CliArgError, makeFlags, runCli } from "../lib/cli-args.mjs";
import { drawBoxes, captureShot, contactSheet, inputsHash, cellCache } from "../lib/ui-mock-core.mjs";
import { SCREENS, VIEWPORTS, pickScreens, pickViewports } from "./menu-screens.mjs";
import { bootPage, resetToTitle, waitScreenReady, applyInsets } from "./menu-capture.mjs";
import { chromiumArgs } from "../shot/hud-survey.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const KNOWN = ["--screens", "--viewports", "--format", "--no-boxes", "--no-cache", "--min-tap", "--min-font", "--out", "--gl", "--list", "--json", "--help"];
export const DEFAULT_SCREENS = "title,settings,racesettings,results,quali,pause";
export const DEFAULT_VIEWPORTS = "ios-iphone-landscape-844";
// The race-bound screens last, as the gallery orders them: each one leaves a race behind it.
const LAST = ["hud", "pause", "results"];

/** Pure: the cell list + the boot groups it needs. Throws CliArgError on an unknown id. */
export function planMenuCells(screensArg, viewportsArg, { screens = SCREENS, viewports = VIEWPORTS } = {}) {
  const sc = screensArg === "*" ? screens : pickScreens(screens, screensArg);
  const vp = pickViewports(viewports, viewportsArg);
  const known = (all, id) => all.some((x) => (Array.isArray(x) ? x[0] : x.id) === id);
  for (const id of String(screensArg).split(",")) if (id !== "*" && !id.endsWith("*") && !known(screens, id)) throw new CliArgError(`--screens: unknown ${id}`);
  for (const id of String(viewportsArg).split(",")) if (!id.endsWith("*") && !known(viewports, id)) throw new CliArgError(`--viewports: unknown ${id}`);
  const ordered = [...sc].sort((a, b) => LAST.some((p) => a.id.startsWith(p)) - LAST.some((p) => b.id.startsWith(p)));
  const cells = [];
  for (const v of vp) for (const s of ordered) cells.push({ id: `${s.id}__${v[0]}`, screen: s.id, viewport: v[0] });
  return cells;
}

/** Pure: which browser context a viewport needs. hasTouch / isMobile cannot change after creation. */
export function groupKey(vpOpts) { return `${vpOpts.hasTouch ? "touch" : "pointer"}-${vpOpts.isMobile ? "mobile" : "desktop"}`; }

/** In-page (self-contained): measure the open screen. */
export function probeMenu({ rootSel, minTap, minFont }) {
  const root = document.querySelector(rootSel) || document.body;
  const W = window.innerWidth, H = window.innerHeight;
  const vis = (el) => {
    const cs = getComputedStyle(el);
    if (cs.display === "none" || cs.visibility === "hidden" || Number(cs.opacity) === 0) return false;
    const r = el.getBoundingClientRect();
    return r.width > 1 && r.height > 1;
  };
  const scrollableAncestor = (el) => {
    for (let p = el.parentElement; p && p !== document.documentElement; p = p.parentElement) {
      const cs = getComputedStyle(p);
      if (/(auto|scroll)/.test(cs.overflowY + cs.overflowX) && (p.scrollHeight > p.clientHeight + 1 || p.scrollWidth > p.clientWidth + 1)) return p;
    }
    return null;
  };
  const label = (el) => (el.id ? "#" + el.id : (el.getAttribute("aria-label") || el.textContent || el.tagName).trim().replace(/\s+/g, " ").slice(0, 24));
  const issues = { tap: [], offscreen: [], clipped: [], smallText: [] }, recs = [];
  const ctrls = root.querySelectorAll("button, a[href], input:not([type=hidden]), select, textarea, summary, [role=button], [tabindex]:not([tabindex='-1'])");
  for (const el of ctrls) {
    if (!vis(el)) continue;
    const r = el.getBoundingClientRect();
    const rec = { key: label(el), role: "ctrl", x: r.left, y: r.top, r: r.right, b: r.bottom };
    const w = Math.round(r.width), h = Math.round(r.height);
    if (Math.min(w, h) < minTap) issues.tap.push([rec.key, w, h]);
    if ((r.right < 0 || r.bottom < 0 || r.left > W || r.top > H || r.right > W + 1 || r.bottom > H + 1) && !scrollableAncestor(el)) issues.offscreen.push([rec.key, Math.round(r.left), Math.round(r.top)]);
    recs.push(rec);
  }
  // CLIPPED = content cut by overflow hidden/clip on the axis that overflows. A scroller (auto/scroll on that axis) is the way TO the content,
  // and an ellipsis is a deliberate cut, so neither counts.
  for (const el of root.querySelectorAll("*")) {
    if (!el.children.length) continue;
    const cs = getComputedStyle(el);
    if (cs.textOverflow === "ellipsis") continue;
    const cutX = /^(hidden|clip)$/.test(cs.overflowX) && el.scrollWidth > el.clientWidth + 2;
    const cutY = /^(hidden|clip)$/.test(cs.overflowY) && el.scrollHeight > el.clientHeight + 2;
    if ((cutX || cutY) && vis(el)) issues.clipped.push([label(el), cutX ? el.scrollWidth - el.clientWidth : 0, cutY ? el.scrollHeight - el.clientHeight : 0]);
  }
  const seen = new Set();
  for (const el of root.querySelectorAll("*")) {
    if (![...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim()) || !vis(el)) continue;
    const fs_ = parseFloat(getComputedStyle(el).fontSize);
    if (fs_ < minFont) { const k = label(el); if (!seen.has(k)) { seen.add(k); issues.smallText.push([k, Math.round(fs_ * 10) / 10]); } }
  }
  return { issues, recs, viewport: [W, H] };
}

/** In-page: leave whatever the previous cell left behind (a race, a quali session, an open sheet) through the game's OWN exits,
 *  so the next cell's race() starts from state "menu" (a stale quali session made race() refuse: "did not reach the grid"). */
export function leaveToMenu() {
  const $ = (id) => document.getElementById(id);
  const a = window.__apex;
  if (a && a.info && a.info().state !== "menu") { const q = $("pm-quit"); if (q) { q.click(); if (q.classList.contains("armed")) q.click(); } }
  const quali = $("quali");
  if (quali && !quali.hidden) { if (quali.classList.contains("q-done")) quali.hidden = true; else $("q-back")?.click(); }
  const rs = $("race-settings");
  if (rs && !rs.hidden) $("rs-cancel")?.click();
  // The quali route sets GRID = QUALIFYING LAP, and the game keeps it: every later race() would open the quali sheet instead of the grid.
  const g = $("rs-quali-sel");
  if (g && window.__mmGrid != null && a.info().raceGrid !== window.__mmGrid && [...g.options].some((o) => o.value === window.__mmGrid)) { g.value = window.__mmGrid; g.dispatchEvent(new Event("change", { bubbles: true })); }
}

const countIssues = (i) => i.tap.length + i.offscreen.length + i.clipped.length + i.smallText.length;

async function main() {
  const F = makeFlags(process.argv.slice(2), KNOWN);
  if (F.has("--help")) { console.log(fs.readFileSync(fileURLToPath(import.meta.url), "utf8").split("\n").slice(1, 18).map((l) => l.replace(/^\/\/ ?/, "")).join("\n")); return; }
  const cells = planMenuCells(F.flag("--screens", DEFAULT_SCREENS), F.flag("--viewports", DEFAULT_VIEWPORTS));
  if (F.has("--list")) { for (const c of cells) console.log(c.id); console.log(`[menu-mock] ${cells.length} cells`); return; }
  const fmt = F.flag("--format", "png");
  if (fmt !== "png" && fmt !== "jpeg") throw new CliArgError("--format: png | jpeg");
  const ext = fmt === "jpeg" ? ".jpg" : ".png";
  const minFont = Number(F.flag("--min-font", "10"));
  const tapFlag = F.has("--min-tap") ? Number(F.flag("--min-tap", "44")) : null;
  const boxes = !F.has("--no-boxes");
  const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const out = path.resolve(ROOT, F.flag("--out", path.join("artifacts", "menu-mock", stamp)));
  if (!["artifacts", "scratch"].some((d) => !path.relative(path.join(ROOT, d), out).startsWith(".."))) throw new CliArgError("--out must stay under artifacts/ or scratch/");
  fs.mkdirSync(out, { recursive: true });
  const log = (m) => (F.has("--json") ? console.error : console.log)("[menu-mock] " + m);
  const gl = F.flag("--gl", process.env.APEX_GL === "swiftshader" ? "swiftshader" : "llvmpipe");
  const cache = cellCache(path.join(ROOT, "artifacts", "ui-mock-cache"), "menu-mock", inputsHash(ROOT), { enabled: !F.has("--no-cache") });
  const byGroup = new Map();
  for (const c of cells) {
    const vp = VIEWPORTS.find((v) => v[0] === c.viewport);
    const g = groupKey(vp[1]);
    if (!byGroup.has(g)) byGroup.set(g, []);
    byGroup.get(g).push({ ...c, vp });
  }
  const srv = await startStaticServer(ROOT);
  const rows = [];
  let cachedN = 0;
  const t0 = Date.now();
  try {
    const browser = await launchChromium({ args: [...chromiumArgs({ backend: "three", gl }), "--hide-scrollbars"] });
    for (const [g, mine] of byGroup) {
      let booted = null;
      const getBoot = async () => {
        if (booted) return booted;
        const tb = Date.now();
        const [, o] = mine[0].vp;
        const ctx = await browser.newContext({ hasTouch: !!o.hasTouch, isMobile: !!o.isMobile, userAgent: o.userAgent, deviceScaleFactor: 1, colorScheme: "dark",
          viewport: o.viewport || { width: 1280, height: 800 } });
        const page = await ctx.newPage();
        const errs = [];
        page.on("pageerror", (e) => errs.push(String(e && e.message || e).slice(0, 200)));
        await bootPage(page, srv.url, { hideGame: true });
        await page.evaluate(() => { window.__mmGrid = window.__apex.info().raceGrid; });
        await page.addStyleTag({ content: "html,body{background:#000!important}#game,#game-soft{visibility:hidden!important}" });
        booted = { ctx, page, errs };
        log(`boot ${g} in ${((Date.now() - tb) / 1000).toFixed(0)} s`);
        return booted;
      };
      for (const cell of mine) {
        const t1 = Date.now();
        const key = cache.key({ screen: cell.screen, viewport: cell.viewport, boxes, fmt, minFont, tapFlag });
        const hit = cache.get(key);
        if (hit) {
          const file = path.join(out, cell.id + ext);
          fs.copyFileSync(hit.file, file);
          const { _img, ...row } = hit.row;
          rows.push({ ...row, shot: path.relative(ROOT, file), cached: true, ms: Date.now() - t1 });
          cachedN++;
          log(`${cell.id}: cached`);
          continue;
        }
        const { page, errs } = await getBoot();
        const [, o, , insets] = cell.vp;
        const screen = SCREENS.find((s) => s.id === cell.screen);
        const row = { id: cell.id, screen: cell.screen, viewport: cell.viewport, error: null };
        try {
          const v = o.viewport || { width: 1280, height: 800 };
          await page.setViewportSize({ width: v.width, height: v.height });
          await page.evaluate(leaveToMenu);
          await page.waitForFunction(() => window.__apex.info().state === "menu", null, { polling: 100, timeout: 10000 });
          await resetToTitle(page, srv.url, true);
          await screen.open(page, screen.circuit);
          await waitScreenReady(page, screen);
          await applyInsets(page, insets);
          const touch = !!o.hasTouch;
          const m = await page.evaluate(probeMenu, { rootSel: screen.root, minTap: tapFlag ?? (touch ? 44 : 24), minFont });
          if (boxes) {
            const bad = new Set([...m.issues.tap, ...m.issues.offscreen].map((x) => x[0]));
            await page.evaluate(drawBoxes, { recs: m.recs, bad: [...bad] });
          }
          const file = path.join(out, cell.id + ext);
          await captureShot(page, file, { format: fmt });
          Object.assign(row, { shot: path.relative(ROOT, file), issues: m.issues, controls: m.recs.length, pageErrors: errs.splice(0) });
          if (boxes) await page.evaluate(() => document.getElementById("hm-boxes")?.remove());
          cache.put(key, row, file);
        } catch (e) {
          row.error = String(e && e.message || e).slice(0, 200);
          row.issues = { tap: [], offscreen: [], clipped: [], smallText: [] };
        }
        row.ms = Date.now() - t1;
        rows.push(row);
        log(`${cell.id}: ${row.error ? "ERROR " + row.error : countIssues(row.issues) + " issues, " + row.controls + " controls"}, ${row.ms} ms`);
      }
      if (booted) await booted.ctx.close().catch(() => {});
    }
  } finally {
    await shutdown();
    await srv.close?.();
  }
  fs.writeFileSync(path.join(out, "report.json"), JSON.stringify({ when: new Date().toISOString(), cells: rows }, null, 1));
  const f = (a, n = 3) => a.slice(0, n).map((x) => x.join(" ")).join(", ") + (a.length > n ? ` +${a.length - n}` : "") || "—";
  const md = ["| cell | tap | off-screen | clipped | small text |", "|---|---|---|---|---|",
    ...rows.map((r) => r.error ? `| ${r.id} | ERROR: ${r.error} | | | |` :
      `| [${r.id}](${path.basename(r.shot)}) | ${f(r.issues.tap)} | ${f(r.issues.offscreen)} | ${f(r.issues.clipped)} | ${f(r.issues.smallText)} |`)];
  fs.writeFileSync(path.join(out, "index.md"), md.join("\n") + "\n");
  const ok = rows.filter((r) => !r.error && r.shot);
  const sheet = contactSheet(ok.map((r) => ({ id: r.id, file: path.join(ROOT, r.shot) })), path.join(out, "sheet.jpg"));
  const errN = rows.filter((r) => r.error).length;
  log(`= menu-mock done: ${rows.length} cells (${cachedN} cached, ${errN} errors) in ${((Date.now() - t0) / 1000).toFixed(0)} s → ${path.relative(ROOT, out)}${sheet ? " (sheet.jpg)" : ""}`);
  if (F.has("--json")) console.log(JSON.stringify({ ok: errN === 0, out: path.relative(ROOT, out), report: path.relative(ROOT, path.join(out, "report.json")), cells: rows.map((r) => ({ id: r.id, shot: r.shot || null, issues: r.issues, error: r.error })) }));
  if (errN) process.exitCode = 1;
}

let isEntry = false;
try { isEntry = fs.realpathSync(process.argv[1]) === fileURLToPath(import.meta.url); } catch { /* imported */ }
if (isEntry) runCli(main);
