#!/usr/bin/env node
// look-diff.mjs — does every customization knob value actually change the picture?
// @doc Pixel-diff each ScreenLooks/PauseOpts/TitleLayout knob value vs the default: DEAD/SUBTLE/VISIBLE + contact sheet.
// @skill css-play
//
//   node tools/ui/look-diff.mjs --list
//   node tools/ui/look-diff.mjs --touch                                   # every screen, 844x390 iPhone landscape
//   node tools/ui/look-diff.mjs --touch --screens=select,career --knobs=density,corners
//
// Why: Bryce on earlier design previews, "they all look the same" (memory
// preview-must-look-different). A knob value is only real if the picture moves,
// so this judges by pixels (and box geometry, to tell "moved" from "repainted"),
// never by the knob's own bookkeeping. Gap G4 of docs/notes/UI-LAYOUT-PROGRAM-2026-10-30.md.
//
// Per screen: a FRESH browser context (no reset needed), the app's own route
// (tools/ui/menu-screens.mjs SCREENS[].open), #game hidden (the 3D canvas changes
// frame to frame), the default captured twice (the noise floor), then each knob x
// value: set -> settle -> screenshot -> restore. Knob tables come from the shipped
// modules (look-diff/core.mjs reads them in a vm), so a new knob is covered at once.
//
// Pixel diff: sharp (already a devDependency; capture-contract.mjs pixelEvidence uses
// it) decodes the PNGs; the comparison is ours (core.mjs diffRaw) — no pixelmatch.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";
import { CliArgError, strictFlags } from "../lib/cli-args.mjs";
import { launchChromium, shutdown, startStaticServer } from "../lib/harness.mjs";
import { resolveUIProfile } from "../lib/ui-device-profile.mjs";
import { installProbeInit, gotoGame } from "../shot/probe-page.mjs";
import { menuReady, previewMapSettled } from "./menu-readiness.mjs";
import { getScreen } from "./menu-screens.mjs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import {
  ROOT, USAGE, buildCatalog, parseArgs, planCells, diffRaw, geometryDelta, classify,
  cropBox, slug, tally, renderMarkdown,
} from "./look-diff/core.mjs";

const require = createRequire(import.meta.url);
const { escapeHtml, screenshotCard, renderGallery } = require("../lib/screenshot-gallery.cjs");

// ── page-side (serialised by Playwright: no closures) ─────────────────────
function pageSetKnob({ id, src, k, v }) {
  if (src === "look") return ScreenLooks.set(id, k, v);
  if (src === "pause") return PauseOpts[{ layout: "setLayout", side: "setSide", dim: "setDim" }[k]](v);
  if (src === "title") return TitleLayout.set(Object.assign({}, TitleLayout.current(), { [k]: v }))[k];
  throw new Error("unknown knob family " + src);
}
function pageRestore({ id, src, k, def }) {
  if (src === "look") return ScreenLooks.reset(id);
  if (src === "pause") return PauseOpts[{ layout: "setLayout", side: "setSide", dim: "setDim" }[k]](def);
  if (src === "title") return TitleLayout.reset();
}
function pageBoxes(sel) {
  const r = document.querySelector(sel);
  if (!r) return [];
  const box = (e, key) => { const b = e.getBoundingClientRect(); return { key, x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width), h: Math.round(b.height) }; };
  const out = [box(r, "root")];
  Array.from(r.children).forEach((c, i) => {
    if (getComputedStyle(c).display === "none") return;
    out.push(box(c, i + ":" + c.tagName.toLowerCase() + (c.id ? "#" + c.id : "")));
  });
  return out;
}
function pageQuiet() {
  window.__apex.headless(true);
  for (const id of ["game", "game-soft"]) { const g = document.getElementById(id); if (g) g.style.visibility = "hidden"; }
  for (const id of ["ios-install", "install-chip"]) { const e = document.getElementById(id); if (e) e.hidden = true; }
}

async function settle(page, screen) {
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  await page.waitForFunction(menuReady, screen.root, { polling: 100, timeout: 5000 }).catch(() => {});
  if (screen.id === "select") await page.waitForFunction(previewMapSettled, null, { polling: 100, timeout: 5000 }).catch(() => {});
  await page.waitForTimeout(150);
}

async function shoot(page, file) {
  const buf = await page.screenshot({ path: file, animations: "disabled", caret: "hide", timeout: 120000 });
  const { data, info } = await sharp(buf).raw().toBuffer({ resolveWithObject: true });
  return { data, width: info.width, height: info.height, channels: info.channels };
}

async function crop(src, dst, box) {
  await sharp(src).extract({ left: box.x, top: box.y, width: box.w, height: box.h }).png().toFile(dst);
}

const rel = (outDir, f) => path.relative(outDir, f).split(path.sep).join("/");

async function runScreen(browser, srvUrl, ctxOpts, entry, opts, rows) {
  const screen = getScreen(entry.route);
  const info = { id: entry.id, title: entry.title, route: entry.route, root: screen && screen.root };
  if (!screen) { info.error = `no menu-screens route ${entry.route}`; return info; }
  const dir = path.join(opts.outDir, entry.id);
  fs.mkdirSync(path.join(dir, "full"), { recursive: true });
  fs.mkdirSync(path.join(dir, "zoom"), { recursive: true });
  const ctx = await browser.newContext({ ...ctxOpts, colorScheme: "dark" });
  try {
    const page = await ctx.newPage();
    page.setDefaultTimeout(15000);
    await installProbeInit(page);
    await gotoGame(page, srvUrl);
    await page.evaluate(pageQuiet);
    await page.waitForTimeout(300);
    await screen.open(page);
    await page.evaluate(pageQuiet);   // a race route re-shows the canvas
    await settle(page, screen);
    const defFile = path.join(dir, "full", "default.png");
    const def = await shoot(page, defFile);
    const defBoxes = await page.evaluate(pageBoxes, screen.root);
    const noise = diffRaw(def, await shoot(page, path.join(dir, "full", "default-2.png")));
    info.noisePct = noise.pct;
    info.default = rel(opts.outDir, defFile);
    info.frame = { width: def.width, height: def.height };
    for (const knob of entry.knobs) {
      const krows = [];
      for (const v of knob.test) {
        const row = { screen: entry.id, key: knob.key, k: knob.k, src: knob.src, label: knob.label, value: v, def: knob.def };
        const file = path.join(dir, "full", `${slug(knob.key)}__${slug(v)}.png`);
        try {
          const got = await page.evaluate(pageSetKnob, { id: entry.id, src: knob.src, k: knob.k, v });
          if (String(got) !== String(v)) row.note = `set returned ${got}`;
          await settle(page, screen);
          const img = await shoot(page, file);
          const boxes = await page.evaluate(pageBoxes, screen.root);
          const d = diffRaw(def, img);
          row.pct = d.pct; row.box = d.box; row.shot = rel(opts.outDir, file);
          row.geometry = geometryDelta(defBoxes, boxes);
          row.class = classify({ pct: d.pct, geometryChanged: row.geometry.changed, threshold: opts.threshold, noisePct: info.noisePct });
        } catch (e) {
          row.class = "ERROR"; row.error = String(e.message || e).split("\n")[0].slice(0, 160);
        } finally {
          await page.evaluate(pageRestore, { id: entry.id, src: knob.src, k: knob.k, def: knob.def }).catch(() => {});
          await settle(page, screen).catch(() => {});
        }
        krows.push(row); rows.push(row);
        console.log(`${entry.id.padEnd(9)} ${String(knob.key).padEnd(14)} ${String(v).padEnd(10)} ${String(row.pct ?? "—").padStart(6)} % ${row.class}${row.error ? " " + row.error : ""}`);
      }
      // One close-up frame per knob: every value of the row cropped to the same box.
      const box = cropBox(krows.map((r) => r.box), info.frame);
      if (box) {
        const zdef = path.join(dir, "zoom", `${slug(knob.key)}__default.png`);
        await crop(defFile, zdef, box);
        for (const r of krows) {
          if (!r.shot) continue;
          const z = path.join(dir, "zoom", path.basename(r.shot));
          await crop(path.join(opts.outDir, r.shot), z, box);
          r.zoom = rel(opts.outDir, z);
          r.zoomDefault = rel(opts.outDir, zdef);
        }
      }
    }
  } catch (e) {
    info.error = String(e.message || e).split("\n")[0].slice(0, 200);
  } finally {
    await ctx.close().catch(() => {});
  }
  return info;
}

function renderSheet(report) {
  const groups = [];
  for (const s of report.screens) {
    const srows = report.rows.filter((r) => r.screen === s.id);
    const keys = [...new Set(srows.map((r) => r.key))];
    for (const key of keys) {
      const kr = srows.filter((r) => r.key === key);
      const first = kr[0];
      const cards = [screenshotCard({ title: `${first.def} (default)`, image: first.zoomDefault || s.default,
        caption: "baseline", links: s.default ? `<a href="${escapeHtml(s.default)}">full frame</a>` : "" })];
      for (const r of kr) {
        cards.push(screenshotCard({ title: String(r.value), image: r.zoom || r.shot,
          caption: r.class === "ERROR" ? `ERROR — ${r.error}` : `${r.pct} % changed · ${r.class}${r.geometry && r.geometry.changed ? ` · ${r.geometry.moved.length} box moved` : ""}`,
          links: r.shot ? `<a href="${escapeHtml(r.shot)}">full frame</a>` : "", className: `look-${r.class.toLowerCase()}` }));
      }
      groups.push({ title: `${s.id} · ${first.label} (${key})`, cards });
    }
  }
  const t = tally(report.rows);
  return renderGallery({ title: "Look diff",
    summary: `${report.viewport.width}x${report.viewport.height}${report.touch ? " touch" : ""} · ${t.VISIBLE} visible · ${t.SUBTLE} subtle · ${t.DEAD} dead · ${t.ERROR} error. Each row is one knob, cropped to the region any of its values changed.`,
    groups, head: "<style>.look-dead{outline:3px solid #e5484d}.look-subtle{outline:3px solid #f5a524}</style>" });
}

async function main() {
  const argv = process.argv.slice(2);
  if (!strictFlags(argv, ["--screens", "--knobs", "--viewport", "--touch", "--out", "--threshold", "--list"], USAGE)) return;
  const catalog = buildCatalog();
  let opts;
  try { opts = parseArgs(argv, catalog); }
  catch (e) { if (e instanceof CliArgError) { console.error(`${e.message}\n\n${USAGE}`); process.exitCode = 2; return; } throw e; }
  const plan = planCells(catalog, opts);
  if (opts.list) {
    for (const s of plan) {
      console.log(`${s.id} (${s.title}) via ${s.route}`);
      for (const n of s.knobs) console.log(`  ${n.key.padEnd(14)} def ${String(n.def).padEnd(8)} test ${n.test.join(", ")}`);
    }
    console.log(`${plan.reduce((a, s) => a + s.knobs.reduce((b, n) => b + n.test.length, 0), 0)} captures + 2 per screen`);
    return;
  }
  const load = os.loadavg()[0];
  if (load >= 3) { console.error(`look-diff: load average ${load.toFixed(2)} >= 3 — deferred, try later`); process.exitCode = 75; return; }
  const { contextOptions, profile } = resolveUIProfile({ touch: opts.touch, viewport: opts.viewport });
  fs.mkdirSync(opts.outDir, { recursive: true });
  const rows = [], screens = [];
  const srv = await startStaticServer(ROOT);
  try {
    const browser = await launchChromium({ args: ["--use-angle=swiftshader", "--hide-scrollbars"] });
    for (const entry of plan) screens.push(await runScreen(browser, srv.url, contextOptions, entry, opts, rows));
  } finally {
    await shutdown();
    await srv.close().catch(() => {});
  }
  const report = { generated: new Date().toISOString(), viewport: opts.viewport, touch: opts.touch, profile,
    threshold: opts.threshold, screens, rows, totals: tally(rows) };
  fs.writeFileSync(path.join(opts.outDir, "report.json"), JSON.stringify(report, null, 2));
  fs.writeFileSync(path.join(opts.outDir, "report.md"), renderMarkdown(report));
  fs.writeFileSync(path.join(opts.outDir, "index.html"), renderSheet(report));
  const t = report.totals;
  console.log(`= look-diff ${t.VISIBLE} visible · ${t.SUBTLE} subtle · ${t.DEAD} dead · ${t.ERROR} error · ${screens.filter((s) => s.error).length} screen(s) unreached → ${path.relative(ROOT, opts.outDir)}/index.html`);
  if (t.ERROR || screens.some((s) => s.error)) process.exitCode = 1;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) main().catch(async (e) => { console.error(e); await shutdown(); process.exit(1); });

export { renderSheet };
