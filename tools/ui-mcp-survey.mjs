#!/usr/bin/env node
// ui-mcp-survey — clip / truncation / tap-target probe over six screens at ONE
// mobile viewport (852x393 landscape, dsf 3, coarse pointer), plus a PNG each.
//
// THE NAME IS HISTORICAL AND THE "mcp" IN IT IS NOT TRUE: this drives PLAYWRIGHT
// Chromium through tools/harness.mjs, exactly like layout-audit.mjs, and no MCP
// is involved anywhere in the file. It is kept because `npm run ui:survey`
// points at it. The MCP-driven survey with sheet shape/pair/density numbers is
// tools/ui-readable-survey-mcp.py — do not cite one as the other.
//
// Needs a static server already on http://127.0.0.1:3456 (npx serve -l 3456 .).
// Output: <repo>/scratch/ui-survey/*.png and scratch/ui-survey-probe.json.
"use strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { launchChromium, shutdown } from "./harness.mjs";
import { setupApiMocks } from "../tests/helpers/f1-api-mock.js";
import { resolveRepoDefault } from "./output-paths.mjs";

// Was hardcoded to /workspace/scratch/... — a container path from another
// machine, which on this tree means the module-scope mkdirSync either fails or
// scatters output outside the repo. Output belongs under the repo's scratch/
// (CLAUDE.md "Output dirs"), derived from this file's own location.
const ROOT = new URL("..", import.meta.url).pathname.replace(/\/$/, "");
const OUT = resolveRepoDefault(ROOT, "scratch", "ui-survey");
const JSON_OUT = resolveRepoDefault(ROOT, "scratch", "ui-survey-probe.json");
mkdirSync(OUT, { recursive: true });

const SCREENS = [
  ["title", "#overlay", []],
  ["select", "#select", ["mb-race"]],
  ["garage", "#carsetup", ["mb-race", "sel-go"]],
  ["pause-settings", "#pmsettings", ["mb-settings"]],
  ["career", "#career", ["mb-career"]],
  ["datahub", "#datahub", ["mb-data"]],
];
const OV = ["select", "carsetup", "career", "teampicker", "race-settings", "quali", "standings",
  "results", "customize", "howtoplay", "advanced", "pmsettings", "pausemenu", "datahub",
  "track-detail", "vsfriend", "audioset", "lighting", "camtune", "photomode"];

const PROBE = (sel) => {
  const root = document.querySelector(sel);
  const d = (el) => el.id ? "#" + el.id : (el.className && typeof el.className === "string"
    ? el.tagName.toLowerCase() + "." + el.className.trim().split(/\s+/)[0] : el.tagName.toLowerCase());
  const vis = (el) => { const c = getComputedStyle(el); return c.display !== "none" && c.visibility !== "hidden" && +c.opacity > 0.05; };
  if (!root || root.hidden) return { error: "missing/hidden " + sel };
  const clipped = [];
  for (const box of root.querySelectorAll(".sheet, .pane")) {
    if (!vis(box)) continue;
    const br = box.getBoundingClientRect(), cs = getComputedStyle(box);
    const scY = /(auto|scroll)/.test(cs.overflowY), scX = /(auto|scroll)/.test(cs.overflowX);
    for (const el of box.querySelectorAll("*")) {
      if (!vis(el)) continue;
      const r = el.getBoundingClientRect();
      if (r.width < 2 || r.height < 2) continue;
      const oB = r.bottom - br.bottom, oT = br.top - r.top, oR = r.right - br.right, oL = br.left - r.left;
      const badY = !scY && (oB > 1 || oT > 1), badX = !scX && (oR > 1 || oL > 1);
      if (badY || badX) clipped.push({ el: d(el), box: d(box), px: Math.round(Math.max(oB, oT, oR, oL, 0)),
        text: (el.textContent || "").trim().slice(0, 30) });
    }
  }
  const truncated = [];
  for (const el of root.querySelectorAll("label, .label, .row-label, .pm-label, .dh-th, .cs-label")) {
    if (!vis(el)) continue;
    const t = (el.textContent || "").trim();
    if (!t) continue;
    if (el.scrollWidth > el.clientWidth + 1 && el.clientWidth > 0)
      truncated.push({ el: d(el), text: t.slice(0, 28), need: el.scrollWidth, got: el.clientWidth });
  }
  const floor = parseFloat(getComputedStyle(document.body).getPropertyValue("--tap")) || 44;
  const chip = parseFloat(getComputedStyle(document.body).getPropertyValue("--chip-h")) || floor;
  const SEL = "button:not([disabled]),a[href],input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex='-1'])";
  const under = [];
  for (const el of root.querySelectorAll(SEL)) {
    if (!vis(el)) continue;
    let r = el.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) continue;
    const lab = el.closest("label");
    if (lab) { const lr = lab.getBoundingClientRect(); r = { width: Math.max(r.width, lr.width), height: Math.max(r.height, lr.height) }; }
    const z = el.currentCSSZoom || 1, w = r.width / z, h = r.height / z;
    if (Math.min(w, h) < 24 || h < chip - 1.5)
      under.push({ el: d(el), w: Math.round(w), h: Math.round(h), wcag: Math.min(w, h) < 24 });
  }
  return { clipped, truncated, taps: { floor, chip, under }, docOverflowX: document.documentElement.scrollWidth > innerWidth + 1 };
};

async function main() {
  const browser = await launchChromium({ headless: true });
  const ctx = await browser.newContext({
    viewport: { width: 852, height: 393 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true,
    userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
  });
  const page = await ctx.newPage();
  await setupApiMocks(page);
  await page.goto("http://127.0.0.1:3456/index.html");
  await page.waitForFunction(() => window.__apex?.race, { timeout: 30000 });
  await page.evaluate(() => {
    window.__apex.headless(true);
    const g = document.getElementById("game");
    if (g) g.style.visibility = "hidden";
  });
  await page.waitForTimeout(500);

  const harness = await page.evaluate(() => ({
    viewport: innerWidth + "x" + innerHeight, coarse: matchMedia("(pointer: coarse)").matches,
    tapBody: getComputedStyle(document.body).getPropertyValue("--tap").trim(),
    uiScale: getComputedStyle(document.documentElement).getPropertyValue("--ui-scale").trim(),
    build: document.querySelector('script[src*="game.js"]')?.src.match(/v=(\d+)/)?.[1],
  }));
  const results = { harness, screens: {}, ts: new Date().toISOString() };

  for (const [id, root, clicks] of SCREENS) {
    await page.evaluate((ids) => {
      for (const i of ids) {
        const e = document.getElementById(i);
        if (e?.tagName === "DIALOG" && e.open) e.close();
        if (e) e.hidden = true;
      }
      const ov = document.getElementById("overlay");
      if (ov) { ov.hidden = false; ov.style.removeProperty("display"); }
      document.body.classList.remove("in-race");
    }, OV);
    await page.waitForTimeout(150);
    for (const cid of clicks) {
      await page.evaluate((i) => document.getElementById(i)?.click(), cid);
      await page.waitForTimeout(250);
    }
    if (id === "datahub") {
      await page.waitForFunction(() => !document.querySelector(".dh-spinner"), { timeout: 8000 }).catch(() => {});
      await page.waitForTimeout(400);
    }
    await page.evaluate(() => { for (const a of document.getAnimations()) { try { a.finish(); } catch {} } });
    await page.waitForTimeout(150);
    results.screens[id] = await page.evaluate(PROBE, root);
    await page.screenshot({ path: join(OUT, `${id}.png`) });
  }

  writeFileSync(JSON_OUT, JSON.stringify(results, null, 2));
  await browser.close();
  await shutdown();
  console.log("Wrote", JSON_OUT, "and", SCREENS.length, "PNGs to", OUT);
}

main().catch((e) => { console.error(e); process.exit(1); });
