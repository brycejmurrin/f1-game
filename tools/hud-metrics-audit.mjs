#!/usr/bin/env node
/* One-shot HUD metrics + resize audit — screenshots + DOM state JSON. */
import { chromium } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

const OUT = "/opt/cursor/artifacts/hud-metrics-audit";
const BASE = process.env.APEX_BASE || "http://127.0.0.1:3456";
const BOOT_MS = 45000;

const VIEWS = [
  { id: "phone-landscape", w: 852, h: 393, sal: 59, sar: 59, sat: 0, sab: 21 },
  { id: "tablet-landscape", w: 1280, h: 800, sal: 0, sar: 0, sat: 0, sab: 0 },
  { id: "desktop", w: 1920, h: 1080, sal: 0, sar: 0, sat: 0, sab: 0 },
];

const CASES = [
  { id: "heli-auto", cam: "heli", map: "auto", gaps: "auto", metrics: "auto", hud: 100 },
  { id: "cockpit-auto", cam: "cockpit", map: "auto", gaps: "auto", metrics: "auto", hud: 100 },
  { id: "cockpit-map-on", cam: "cockpit", map: "on", gaps: "on", metrics: "full", hud: 100 },
  { id: "cockpit-map-on-hud150", cam: "cockpit", map: "on", gaps: "on", metrics: "full", hud: 150 },
  { id: "heli-timing", cam: "heli", map: "on", gaps: "on", metrics: "timing", hud: 100 },
  { id: "heli-compact", cam: "heli", map: "on", gaps: "on", metrics: "compact", hud: 200 },
];

async function domState(page) {
  return page.evaluate(() => {
    const vis = (sel) => {
      const el = document.querySelector(sel);
      if (!el) return { sel, present: false };
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      const shown = cs.display !== "none" && cs.visibility !== "hidden" && !el.hidden && r.width > 0 && r.height > 0;
      return {
        sel, present: true, shown,
        text: (el.textContent || "").trim().slice(0, 80),
        box: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) },
      };
    };
    const root = document.documentElement;
    return {
      bodyClasses: [...document.body.classList].filter((c) => c.startsWith("hud-")).sort(),
      hudScale: root.style.getPropertyValue("--hud-scale") || getComputedStyle(root).getPropertyValue("--hud-scale"),
      hudZTop: root.style.getPropertyValue("--hud-z-top"),
      gapDrop: "gapDrop" in root.dataset,
      widgets: [
        vis("#minimap"), vis(".hud-gaps"), vis(".hud-top"), vis(".hud-bottom"),
        vis("#hud-sectors"), vis("#hud-speed"), vis("#hud-gearbox"),
      ],
      camera: window.__apex && window.__apex.camera ? window.__apex.camera() : null,
      settings: {
        hudProfile: localStorage.getItem("apex26.hudProfile"),
        hudMapVis: localStorage.getItem("apex26.hudMapVis"),
        hudGapsVis: localStorage.getItem("apex26.hudGapsVis"),
        hudMetricsLayout: localStorage.getItem("apex26.hudMetricsLayout"),
      },
    };
  });
}

async function bootRace(page, ins, c) {
  await page.goto(BASE + "/");
  await page.waitForFunction(() => window.__apex != null, null, { polling: 100, timeout: BOOT_MS });
  await page.evaluate(({ map, gaps, metrics }) => {
    localStorage.setItem("apex26.steerMode", JSON.stringify("buttons"));
    localStorage.setItem("apex26.manual", JSON.stringify(false));
    localStorage.setItem("apex26.hudProfile", JSON.stringify("standard"));
    localStorage.setItem("apex26.hudMapVis", JSON.stringify(map));
    localStorage.setItem("apex26.hudGapsVis", JSON.stringify(gaps));
    localStorage.setItem("apex26.hudMetricsLayout", JSON.stringify(metrics));
  }, c);
  await page.reload();
  await page.waitForFunction(() => window.__apex != null, null, { polling: 100, timeout: BOOT_MS });
  await page.addStyleTag({
    content: `:root{--sal:${ins.sal}px;--sar:${ins.sar}px;--sat:${ins.sat}px;--sab:${ins.sab}px;}`,
  });
  await page.evaluate(() => window.__apex.race("monza"));
  await page.waitForFunction(() => window.__apex.info().track != null, null, { polling: 100, timeout: BOOT_MS });
  await page.evaluate(({ cam, hud }) => {
    window.__apex.headless(true);
    window.__apex.go();
    window.__apex.jump(0.1, 60, 0);
    window.__apex.hudScale(hud);
    window.__apex.camera(cam);
  }, c);
  await page.waitForTimeout(500);
}

fs.mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ headless: true });
const results = [];

for (const view of VIEWS) {
  for (const c of CASES) {
    const id = `${view.id}__${c.id}`;
    const page = await browser.newPage();
    await page.setViewportSize({ width: view.w, height: view.h });
    try {
      await bootRace(page, view, c);
      const state = await domState(page);
      const shot = path.join(OUT, `${id}.png`);
      await page.screenshot({ path: shot, fullPage: false });
      let a11y = "";
      try { a11y = await page.locator("#hud").ariaSnapshot(); } catch (_) { /* no a11y tree */ }
      const domPath = path.join(OUT, `${id}.json`);
      fs.writeFileSync(domPath, JSON.stringify({ id, view, case: c, state, a11y }, null, 2));
      const mapShown = state.widgets.find((w) => w.sel === "#minimap")?.shown;
      const gapsShown = state.widgets.find((w) => w.sel === ".hud-gaps")?.shown;
      results.push({ id, ok: true, mapShown, gapsShown, bodyClasses: state.bodyClasses, shot, domPath });
      console.log("OK", id, "map", mapShown, "gaps", gapsShown, state.bodyClasses.join(","));
    } catch (e) {
      results.push({ id, ok: false, error: String(e) });
      console.error("FAIL", id, e.message);
    } finally {
      await page.close();
    }
  }
}

await browser.close();
fs.writeFileSync(path.join(OUT, "summary.json"), JSON.stringify(results, null, 2));
console.log("Wrote", OUT);
