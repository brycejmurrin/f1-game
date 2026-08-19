#!/usr/bin/env node
// menu-capture.mjs — library for layout-audit --gallery / --screen= (not a CLI).
//
//   import { runMenuShot, runMenuGallery } from "./menu-capture.mjs";
//
// Single cell:
//   await runMenuShot({ screen: "settings", viewport: "ios-iphone-landscape" });
//
// Batch (one boot per viewport, parallel jobs, resumable):
//   await runMenuGallery({ jobs: 2, force: false });
//
// CLI: node tools/layout-audit.mjs --gallery | --screen=ID | --list | --report
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { applyScale, parseScales, scaleTag } from "./ui-scale-axis.mjs";
import { parseCircuits, circuitTag, pickCircuit } from "./circuit-axis.mjs";
import { launchChromium, shutdown, startStaticServer } from "./harness.mjs";
import { collectDomInfo } from "./css-play.mjs";
import {
  SCREENS,
  VIEWPORTS,
  OVERLAY_IDS,
  pickScreens,
  pickViewports,
  listScreenIds,
  getScreen,
} from "./menu-screens.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DEFAULT_OUT = path.join(ROOT, "artifacts", "layout-audit", "gallery");

export { SCREENS, VIEWPORTS, OVERLAY_IDS, listScreenIds, getScreen, pickScreens, pickViewports };

export function listViewports() {
  return VIEWPORTS.map(([name, , why]) => ({ name, why }));
}

export function cellFileBase(screenId, vpName) {
  return `${screenId}__${vpName}`;
}

export function cellPaths(outDir, screenId, vpName) {
  const base = cellFileBase(screenId, vpName);
  return {
    png: path.join(outDir, "shots", `${base}.png`),
    dom: path.join(outDir, "dom", `${base}.dom.json`),
    relShot: `shots/${base}.png`,
    relDom: `dom/${base}.dom.json`,
  };
}

export function cellRecorded(outDir, screenId, vpName) {
  const { png, dom } = cellPaths(outDir, screenId, vpName);
  return fs.existsSync(png) && fs.existsSync(dom);
}

function resolveViewport(name) {
  const hit = VIEWPORTS.find(([n]) => n === name);
  if (!hit) throw new Error(`unknown viewport: ${name}. Use --list`);
  return hit;
}

function expandScreens(screens, circuitsAxis) {
  const ordered = [...screens].sort((a, b) =>
    (["hud", "pause", "results"].some((p) => a.id.startsWith(p)) ? 1 : 0) -
    (["hud", "pause", "results"].some((p) => b.id.startsWith(p)) ? 1 : 0));
  const expanded = [];
  for (const s of ordered) {
    if (s.mapAxis && circuitsAxis[0] != null) {
      for (const c of circuitsAxis) expanded.push({ ...s, id: s.id + circuitTag(c), circuit: c });
    } else expanded.push(s);
  }
  return expanded;
}

async function bootPage(page, base, { hideGame = true, scale = null, timeout = 90000 } = {}) {
  await page.goto(base, { waitUntil: "domcontentloaded", timeout });
  await page.waitForFunction(() => window.__apex && window.__apex.race, null, {
    polling: 100,
    timeout: 60000,
  });
  await page.evaluate((hide) => {
    window.__apex.headless(true);
    if (hide) {
      const g = document.querySelector("#game");
      if (g) g.style.visibility = "hidden";
    }
  }, hideGame);
  if (scale != null) await applyScale(page, scale);
  page.setDefaultTimeout(12000);
}

async function resetToTitle(page, base, hideGame) {
  await page.evaluate((ids) => {
    for (const id of ids) {
      const el = document.getElementById(id);
      if (el) el.hidden = true;
    }
    const ov = document.getElementById("overlay");
    if (ov) {
      ov.hidden = false;
      ov.style.removeProperty("display");
    }
    document.body.classList.remove("in-race");
  }, OVERLAY_IDS);
  await page.waitForTimeout(200);
  const titleUsable = await page.evaluate(() => {
    const b = document.getElementById("mb-race");
    if (!b) return false;
    const r = b.getBoundingClientRect();
    return r.width > 1 && r.height > 1;
  });
  if (!titleUsable) {
    await page.goto(base, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => !!window.__apex, null, { polling: 100, timeout: 60000 });
    await page.evaluate((hide) => {
      window.__apex.headless(true);
      if (hide) {
        const g = document.querySelector("#game");
        if (g) g.style.visibility = "hidden";
      }
    }, hideGame);
    await page.waitForTimeout(300);
  }
}

async function waitScreenReady(page, screen) {
  await page.waitForFunction((sel) => {
    const el = document.querySelector(sel);
    if (!el) return true;
    const anims = el.getAnimations ? el.getAnimations({ subtree: true }) : [];
    if (anims.some((a) => a.playState === "running")) return false;
    return getComputedStyle(el).opacity !== "0";
  }, screen.root, { polling: 50, timeout: 5000 }).catch(() => {});
  await page.waitForTimeout(150);
  if (screen.id.split("#")[0] === "select") {
    await page.waitForFunction(() => {
      const cv = document.getElementById("sel-preview-map");
      if (!(cv instanceof HTMLCanvasElement) || cv.width <= 8 || cv.height <= 8) return false;
      const r = cv.getBoundingClientRect();
      const z = cv.currentCSSZoom || 1;
      const bufferAspect = cv.width / cv.height;
      const boxAspect = (r.width / z) / Math.max(1, r.height / z);
      return Math.abs(bufferAspect - boxAspect) /
        Math.max(bufferAspect, boxAspect, 0.001) < 0.03;
    }, null, { polling: 50, timeout: 5000 }).catch(() => {});
  }
}

async function applyInsets(page, insets) {
  if (!insets) return;
  await page.evaluate((i) => {
    const d = document.documentElement.style;
    d.setProperty("--sat", i.t + "px");
    d.setProperty("--sar", i.r + "px");
    d.setProperty("--sab", i.b + "px");
    d.setProperty("--sal", i.l + "px");
    if (window.SheetShape) SheetShape.reclassify();
  }, insets);
  await page.waitForTimeout(150);
}

export async function captureOpenScreen(page, screen, { insets } = {}) {
  await screen.open(page, screen.circuit);
  await waitScreenReady(page, screen);
  await applyInsets(page, insets);
}

export async function writeMenuCapture(page, screen, outDir, vpName) {
  fs.mkdirSync(path.join(outDir, "shots"), { recursive: true });
  fs.mkdirSync(path.join(outDir, "dom"), { recursive: true });
  const paths = cellPaths(outDir, screen.id, vpName);
  const dom = await page.evaluate(collectDomInfo, { root: screen.root });
  fs.writeFileSync(paths.dom, JSON.stringify(dom, null, 2));
  await page.screenshot({ path: paths.png, timeout: 300000 });
  return { ...paths, domData: dom };
}

/**
 * Capture one (screen × viewport) cell — one browser boot.
 * @param {object} opts
 */
export async function runMenuShot(opts = {}) {
  const screenId = opts.screen || "title";
  const screen = typeof screenId === "string" ? getScreen(screenId) : screenId;
  if (!screen) throw new Error(`unknown screen: ${screenId}`);
  const vpName = opts.viewport || "ios-iphone-landscape";
  const [baseName, vpOpts, , insets] = resolveViewport(vpName);
  const scale = opts.scale ?? null;
  const vpTag = baseName + scaleTag(scale);
  const outDir = opts.outDir || DEFAULT_OUT;
  const force = !!opts.force;

  if (!force && cellRecorded(outDir, screen.id, vpTag)) {
    const paths = cellPaths(outDir, screen.id, vpTag);
    return { ok: true, skipped: true, screen: screen.id, viewport: vpTag, ...paths };
  }

  const srv = await startStaticServer(ROOT);
  let browser;
  try {
    browser = await launchChromium({ args: ["--use-angle=swiftshader", "--hide-scrollbars"] });
    const ctx = await browser.newContext({ ...vpOpts, colorScheme: "dark" });
    const page = await ctx.newPage();
    await bootPage(page, srv.url, { hideGame: opts.hideGame !== false, scale });
    await resetToTitle(page, srv.url, opts.hideGame !== false);
    await captureOpenScreen(page, screen, { insets });
    const written = await writeMenuCapture(page, screen, outDir, vpTag);
    await ctx.close();
    return {
      ok: true,
      skipped: false,
      screen: screen.id,
      viewport: vpTag,
      shot: written.relShot,
      dom: written.relDom,
      outDir,
    };
  } finally {
    await shutdown();
    await srv.close();
  }
}

function writeCaptureIndex(outDir, rows) {
  const esc = (s) => String(s).replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
  const items = rows.filter((r) => !r.skipped && r.shot).map((r) => {
    const dom = r.dom ? `<a href="${esc(r.dom)}">dom</a>` : "";
    return `<tr><td>${esc(r.screen)}</td><td>${esc(r.viewport)}</td>` +
      `<td><a href="${esc(r.shot)}"><img src="${esc(r.shot)}" alt="" style="max-width:280px;border:1px solid #333"></a></td>` +
      `<td>${dom}</td></tr>`;
  }).join("\n");
  fs.writeFileSync(path.join(outDir, "index.html"), `<!doctype html><meta charset="utf-8">
<title>Apex 26 menu gallery</title>
<style>
 body{background:#0b0b10;color:#e8e8ee;font:13px/1.5 ui-sans-serif,system-ui;padding:24px}
 h1{font-size:18px} table{border-collapse:collapse;margin-top:16px;width:100%}
 th,td{border:1px solid #26262e;padding:8px 10px;vertical-align:top}
 th{font-weight:600;color:#a9a9b6;font-size:11px;text-align:left}
 a{color:#7fd89a}
</style>
<h1>APEX 26 — MENU SCREENSHOT + DOM GALLERY</h1>
<p>Fast capture: one boot per viewport, resumable shards, parallel <code>--jobs</code>.</p>
<table><thead><tr><th>Screen</th><th>Viewport</th><th>Screenshot</th><th>DOM</th></tr></thead>
<tbody>${items}</tbody></table>`);
}

/**
 * Batch gallery — one boot per (viewport × scale), screens swept in-page.
 */
export async function runMenuGallery(opts = {}) {
  const outDir = opts.outDir || DEFAULT_OUT;
  const force = !!opts.force;
  const jobs = Math.max(1, opts.jobs ?? 2);
  const screens = opts.screens || SCREENS;
  const viewports = opts.viewports || VIEWPORTS;
  const scales = opts.scales ?? [null];
  const circuitsAxis = opts.circuits ?? [];
  const onCell = opts.onCell || ((msg) => console.log(msg));

  fs.mkdirSync(path.join(outDir, "shots"), { recursive: true });
  fs.mkdirSync(path.join(outDir, "dom"), { recursive: true });

  const srv = await startStaticServer(ROOT);
  const browser = await launchChromium({ args: ["--use-angle=swiftshader", "--hide-scrollbars"] });
  const rows = [];
  const queue = [];
  for (const vp of viewports) for (const sc of scales) queue.push([vp, sc]);

  async function sweepViewport([baseName, vpOpts, why, insets], scale) {
    const vpName = baseName + scaleTag(scale);
    const ctx = await browser.newContext({ ...vpOpts, colorScheme: "dark" });
    const page = await ctx.newPage();
    let booted = false;
    try {
      await bootPage(page, srv.url, { hideGame: true, scale });
      booted = true;
    } catch (e) {
      onCell(`${vpName}: BOOT FAILED — ${e.message.split("\n")[0]}`);
    }
    const expanded = expandScreens(screens, circuitsAxis);
    for (const screen of expanded) {
      const cell = { viewport: vpName, why, screen: screen.id, screenName: screen.name };
      if (!booted) {
        cell.skipped = "boot failed";
        rows.push(cell);
        onCell(`${cell.screen.padEnd(13)} ${vpName.padEnd(28)} SKIPPED: boot failed`);
        continue;
      }
      if (!force && cellRecorded(outDir, screen.id, vpName)) {
        const paths = cellPaths(outDir, screen.id, vpName);
        cell.shot = paths.relShot;
        cell.dom = paths.relDom;
        cell.skipped = false;
        cell.resumed = true;
        rows.push(cell);
        onCell(`${cell.screen.padEnd(13)} ${vpName.padEnd(28)} resumed ${cell.shot}`);
        continue;
      }
      try {
        await resetToTitle(page, srv.url, true);
        await captureOpenScreen(page, screen, { insets });
        const written = await writeMenuCapture(page, screen, outDir, vpName);
        cell.shot = written.relShot;
        cell.dom = written.relDom;
      } catch (e) {
        cell.skipped = e.message.split("\n")[0].slice(0, 120);
      }
      rows.push(cell);
      onCell(`${cell.screen.padEnd(13)} ${vpName.padEnd(28)} ` +
        (cell.skipped ? `SKIPPED: ${cell.skipped}` : `shot ${cell.shot}  dom ${cell.dom}`));
    }
    await ctx.close();
  }

  try {
    const workers = Array.from({ length: Math.min(jobs, queue.length) }, async () => {
      while (queue.length) {
        const job = queue.shift();
        if (job) await sweepViewport(job[0], job[1]);
      }
    });
    await Promise.all(workers);
  } finally {
    await browser.close();
    await srv.close();
    await shutdown();
  }

  const manifest = {
    when: new Date().toISOString(),
    build: JSON.parse(fs.readFileSync(path.join(ROOT, "version.json"), "utf8")).build,
    viewports: viewports.map(([n, , w]) => ({ name: n, why: w })),
    screens: screens.map((s) => ({ id: s.id, name: s.name, root: s.root })),
    cells: rows.map((r) => ({
      screen: r.screen,
      viewport: r.viewport,
      shot: r.shot || null,
      dom: r.dom || null,
      skipped: r.skipped || null,
      resumed: r.resumed || false,
    })),
  };
  fs.writeFileSync(path.join(outDir, "manifest.json"), JSON.stringify(manifest, null, 2));
  writeCaptureIndex(outDir, rows);
  const skipped = rows.filter((r) => r.skipped && r.skipped !== false);
  return { ok: skipped.length === 0, outDir, rows, manifest, skipped: skipped.length };
}

export function reportMenuGallery(outDir = DEFAULT_OUT) {
  const manifestPath = path.join(outDir, "manifest.json");
  if (!fs.existsSync(manifestPath)) {
    console.log("no manifest yet — run: node tools/layout-audit.mjs --gallery");
    return { ok: false };
  }
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  const cells = manifest.cells || [];
  const done = cells.filter((c) => c.shot && !c.skipped);
  const skipped = cells.filter((c) => c.skipped);
  const resumed = cells.filter((c) => c.resumed);
  console.log(`cells: ${cells.length}  captured: ${done.length}  resumed: ${resumed.length}  skipped: ${skipped.length}`);
  console.log(`out: ${outDir}`);
  if (skipped.length) {
    console.log("\nskipped:");
    for (const c of skipped.slice(0, 20)) console.log(`  ${c.screen} @ ${c.viewport}: ${c.skipped}`);
  }
  return { ok: skipped.length === 0, manifest };
}

export function printMenuCatalog() {
  console.log("screens:", listScreenIds().join(", "));
  console.log("\nviewports:");
  for (const { name, why } of listViewports()) console.log(`  ${name.padEnd(24)} ${why}`);
}

export function parseMenuGalleryArgv(argv) {
  const has = (f) => argv.includes(f);
  const arg = (prefix) => {
    const hit = argv.find((a) => a.startsWith(prefix));
    return hit ? hit.slice(prefix.length) : null;
  };
  return {
    list: has("--list"),
    report: has("--report"),
    force: has("--force"),
    jobs: Number(arg("--jobs=") || "2") || 2,
    screens: arg("--screens=") ? pickScreens(SCREENS, arg("--screens=")) : SCREENS,
    viewports: arg("--viewports=")
      ? pickViewports(VIEWPORTS, arg("--viewports="))
      : pickViewports(VIEWPORTS, "ios-iphone-landscape,ios-iphone-portrait"),
    scales: parseScales(argv),
    circuits: parseCircuits(argv),
    outDir: arg("--out=") ? path.resolve(ROOT, arg("--out=")) : DEFAULT_OUT,
    screen: arg("--screen=") || argv.find((a) => !a.startsWith("--")) || null,
    viewport: arg("--viewport=") || "ios-iphone-landscape",
  };
}
