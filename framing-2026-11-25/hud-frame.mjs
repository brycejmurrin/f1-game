// HUD framing on Bryce's iPhone 15 (Chromium emulation), his 2026-11-25 export as is.
// node scratch/hud-frame.mjs <portrait|standalone> <camera id|stored> [shot.png]  → JSON on stdout
import { chromium } from "playwright";
import { openBrycePhone, readBackInPage, mismatches } from "./lib/bryce-phone.mjs";

const [win = "standalone", cam = "stored", shot] = process.argv.slice(2);
const browser = await chromium.launch();
const { context, page, preset } = await openBrycePhone(browser, { window: win, dpr: shot ? 2 : 1, profile: process.env.FRESH ? false : true });
// OVR='{"hudBtnScale":100}' isolates one key: SHARED shapes, so the landscape park swap does not undo it.
if (process.env.OVR) await context.addInitScript((o) => { try { localStorage.setItem("apex26.appearanceShapes", "null");
  for (const [k, v] of Object.entries(o)) localStorage.setItem("apex26." + k, JSON.stringify(v)); } catch (_) {} }, JSON.parse(process.env.OVR));
const errors = [];
page.on("pageerror", (e) => errors.push(String(e.message || e).slice(0, 200)));
await page.goto("http://127.0.0.1:3456/", { waitUntil: "load" });
await page.waitForFunction(() => window.__apex && __apex.race, null, { timeout: 90000 });
await page.waitForTimeout(2500);
const emu = await page.evaluate(readBackInPage);
await page.evaluate(() => __apex.race("bahrain"));
const camInfo = await page.evaluate(async (cam) => { __apex.go(); if (cam !== "stored") await __apex.camera(cam); const c = __apex.camera(); return c && c.mode !== undefined ? c : (typeof c?.then === "function" ? await c : c); }, cam);
await page.waitForFunction(() => { const h = document.getElementById("hud"); return h && getComputedStyle(h).visibility !== "hidden"; }, null, { timeout: 60000 });
await page.waitForTimeout(3000);
const ins = preset.insets;
const out = await page.evaluate((ins) => {
  const W = innerWidth, H = innerHeight;
  const vis = (el) => { if (!el || el.closest("[hidden]")) return null; const cs = getComputedStyle(el); if (cs.display === "none" || cs.visibility === "hidden" || +cs.opacity === 0) return null;
    const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 ? { x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height), r: Math.round(r.right), b: Math.round(r.bottom) } : null; };
  const controls = [...document.querySelectorAll(".touchbtn, #pausebtn, #btn-cam")].map((e) => ({ id: e.id || e.className, kind: "control", rect: vis(e) })).filter((e) => e.rect);
  const ro = [...document.querySelectorAll("#hud [id^=hud-], #hud-dock > [id], #minimap, #hud-map, [id^=hud-tower], #radio-card, #gap-card")]
    .filter((e) => e.id !== "hud-dock" && !e.closest(".touchbtn"))
    .map((e) => ({ id: e.id, kind: "readout", rect: vis(e), parent: e.parentElement && e.parentElement.id }));
  // Keep only outermost readouts (a readout inside another readout is part of it).
  const ids = new Set(ro.filter((e) => e.rect).map((e) => e.id));
  const readouts = ro.filter((e) => e.rect && !(e.parent && ids.has(e.parent)) && e.rect.w < W * 0.9);
  const all = [...controls, ...readouts];
  const hit = (a, b) => Math.max(0, Math.min(a.r, b.r) - Math.max(a.x, b.x)) * Math.max(0, Math.min(a.b, b.b) - Math.max(a.y, b.y));
  const overlaps = [];
  for (let i = 0; i < all.length; i++) for (let j = i + 1; j < all.length; j++) {
    const A = all[i], B = all[j], a = hit(A.rect, B.rect);
    if (a > 0) overlaps.push({ a: A.id, b: B.id, kinds: A.kind + "/" + B.kind, area: a,
      ix: Math.min(A.rect.r, B.rect.r) - Math.max(A.rect.x, B.rect.x), iy: Math.min(A.rect.b, B.rect.b) - Math.max(A.rect.y, B.rect.y) });
  }
  const unsafe = all.filter((e) => e.rect.x < ins.left - 0.5 || e.rect.y < ins.top - 0.5 || e.rect.r > W - ins.right + 0.5 || e.rect.b > H - ins.bottom + 0.5)
    .map((e) => ({ id: e.id, kind: e.kind, rect: e.rect }));
  const offscreen = all.filter((e) => e.rect.x < 0 || e.rect.y < 0 || e.rect.r > W || e.rect.b > H).map((e) => e.id);
  const smallTaps = controls.filter((e) => Math.min(e.rect.w, e.rect.h) < 44).map((e) => ({ id: e.id, w: e.rect.w, h: e.rect.h }));
  const smallText = [];
  for (const el of document.querySelectorAll("#hud *, #hud-dock *")) {
    if (!el.childNodes.length || ![...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())) continue;
    const r = vis(el); if (!r) continue;
    const fs = parseFloat(getComputedStyle(el).fontSize);
    if (fs < 12) smallText.push({ id: el.id || el.className.toString().slice(0, 40), fs: +fs.toFixed(1), text: el.textContent.trim().slice(0, 20) });
  }
  const cam = window.__apex.info ? (__apex.info().camMode || null) : null;
  return { viewport: [W, H], cam, overflowX: document.documentElement.scrollWidth > W, all, overlaps, unsafe, offscreen, smallTaps, smallText: smallText.slice(0, 30) };
}, ins);
if (shot) await page.screenshot({ path: shot, timeout: 120000 });
console.log(JSON.stringify({ window: win, camera: cam, camInfo, emulation: mismatches(preset, emu), insets: ins, ...out, errors }, null, 1));
await browser.close();
