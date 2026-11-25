// Title-entry framing on Bryce's iPhone 15 (Chromium emulation), his live export (scratch/lib → 2026-11-25 10:32Z).
// node scratch/entry-frame.mjs <portrait|standalone> <outdir> [ids,comma]  → JSON on stdout, PNG per entry (DPR 2)
import fs from "node:fs";
import { chromium } from "playwright";
import { openBrycePhone, mismatches, readBackInPage } from "./lib/bryce-phone.mjs";

const [win = "standalone", outDir = "artifacts/framing/entries", only] = process.argv.slice(2);
const IDS = (only || "mb-tt,mb-practice,mb-watch,mb-learn,mb-daily,mb-visual,mb-phonepad,mb-saves,mb-race,mb-career,mb-season").split(",");
fs.mkdirSync(outDir, { recursive: true });
const browser = await chromium.launch();
const { context, page, preset } = await openBrycePhone(browser, { window: win, dpr: 2 });
const ins = preset.insets;
const results = [];
for (const id of IDS) {
  const errors = [];
  const onErr = (e) => errors.push(String(e.message || e).slice(0, 160));
  page.on("pageerror", onErr);
  try {
    await page.goto("http://127.0.0.1:3456/", { waitUntil: "load" });
    await page.waitForFunction(() => window.__apex && document.getElementById("mb-race"), null, { timeout: 90000 });
    await page.waitForTimeout(2500);
    const emu = mismatches(preset, await page.evaluate(readBackInPage));
    await page.evaluate(() => { const g = document.getElementById("game"); if (g) g.style.visibility = "hidden"; });
    await page.locator("#" + id).click({ timeout: 15000 });
    await page.waitForTimeout(3000);
    const m = await page.evaluate(({ ins }) => {
      const W = innerWidth, H = innerHeight;
      const shown = (el) => { for (let e = el; e && e !== document.body; e = e.parentElement) { const cs = getComputedStyle(e); if (e.hidden || cs.display === "none" || cs.visibility === "hidden" || +cs.opacity === 0) return false; } return true; };
      const R = (r) => ({ x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height) });
      // topmost open screen: open dialogs first, else visible full-screen sections
      const open = [...document.querySelectorAll("dialog[open], .screen:not([hidden]), section:not([hidden]), [role=dialog]:not([hidden])")].filter((e) => shown(e) && e.getBoundingClientRect().width > W * 0.3);
      const root = open.length ? open[open.length - 1] : document.body;
      const inView = (r) => r.right > 0 && r.bottom > 0 && r.left < W && r.top < H;
      // a control scrolled out of its own scroller is not "outside the safe area": test against its clip box
      const clipBox = (el) => { let b = { l: 0, t: 0, r: W, b: H }; for (let e = el.parentElement; e && e !== document.body; e = e.parentElement) { const cs = getComputedStyle(e); if (/(auto|scroll|hidden)/.test(cs.overflow + cs.overflowX + cs.overflowY)) { const r = e.getBoundingClientRect(); b = { l: Math.max(b.l, r.left), t: Math.max(b.t, r.top), r: Math.min(b.r, r.right), b: Math.min(b.b, r.bottom) }; } } return b; };
      const ctrls = [...root.querySelectorAll("button, a[href], input, select, summary, [role=button], [role=tab]")].filter(shown);
      const unsafe = [], small = [];
      for (const el of ctrls) {
        const r = el.getBoundingClientRect(); if (!(r.width > 0 && r.height > 0) || !inView(r)) continue;
        const c = clipBox(el); const vis = { l: Math.max(r.left, c.l), t: Math.max(r.top, c.t), r: Math.min(r.right, c.r), b: Math.min(r.bottom, c.b) };
        if (vis.r - vis.l < 4 || vis.b - vis.t < 4) continue; // clipped away inside a scroller
        const into = Math.max(ins.left - vis.l, ins.top - vis.t, vis.r - (W - ins.right), vis.b - (H - ins.bottom));
        if (into > 0.5) unsafe.push({ el: el.id || el.tagName.toLowerCase() + "." + String(el.className).split(" ")[0], text: (el.textContent || "").trim().slice(0, 24), into: Math.round(into), rect: R(r) });
        if (Math.min(r.width, r.height) < 43.5 && el.type !== "range" && el.type !== "checkbox" && el.type !== "radio") small.push({ el: el.id || el.tagName.toLowerCase() + "." + String(el.className).split(" ")[0], text: (el.textContent || "").trim().slice(0, 24), rect: R(r) });
      }
      const tiny = []; const clipped = [];
      for (const el of root.querySelectorAll("*")) {
        if (!shown(el) || ![...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())) continue;
        const r = el.getBoundingClientRect(); if (!(r.width > 0) || !inView(r)) continue;
        const cs = getComputedStyle(el); const z = el.currentCSSZoom || 1; const px = parseFloat(cs.fontSize) * z;
        if (px < 11.95) tiny.push({ el: el.id || el.tagName.toLowerCase() + "." + String(el.className).split(" ")[0], px: +px.toFixed(2), text: el.textContent.trim().slice(0, 30) });
        if ((cs.overflow + cs.overflowX).includes("hidden") && el.scrollWidth > el.clientWidth + 1 && cs.textOverflow !== "clip") clipped.push({ el: el.id || el.tagName.toLowerCase() + "." + String(el.className).split(" ")[0], text: el.textContent.trim().slice(0, 30), over: el.scrollWidth - el.clientWidth, ellipsis: cs.textOverflow === "ellipsis" });
      }
      const de = document.documentElement;
      return { root: root.id || root.tagName, title: (root.querySelector("h1,h2")?.textContent || "").trim().slice(0, 40), docOverflowX: de.scrollWidth > W + 1, docOverflowY: de.scrollHeight > H + 1 && getComputedStyle(document.body).overflowY !== "hidden",
        unsafe, small, tiny: tiny.slice(0, 20), tinyN: tiny.length, clipped: clipped.slice(0, 12) };
    }, { ins });
    const shot = `${outDir}/${id}__${win}.png`;
    await page.screenshot({ path: shot, timeout: 120000 });
    results.push({ id, emu, ...m, shot, errors });
  } catch (e) { results.push({ id, error: String(e.message || e).slice(0, 300), errors }); }
  page.off("pageerror", onErr);
}
console.log(JSON.stringify({ window: win, viewport: preset.viewport, insets: ins, results }, null, 1));
await browser.close();
