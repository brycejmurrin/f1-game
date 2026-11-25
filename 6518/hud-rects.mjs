// HUD overlap check on Bryce's iPhone 15 (Chromium emulation), #6518 / #6476.
// node scratch/hud-rects-6518.mjs <window: portrait|standalone> <variant: live|all-on> [shot.png]
import { chromium } from "playwright";
import { openBrycePhone, readBackInPage, mismatches } from "../tools/lib/bryce-phone.mjs";

const [win = "portrait", variant = "live", shot] = process.argv.slice(2);
const browser = await chromium.launch();
// dpr 1 for the measure (CSS geometry does not depend on DPR; DPR 3 starves the HUD tick on software GL here).
const { context, page, preset } = await openBrycePhone(browser, { window: win, dpr: shot ? 2 : 1 });
if (variant === "all-on") await context.addInitScript(() => { try { localStorage.setItem("apex26.hudElements", JSON.stringify({ speed: "on", gear: "on", energy: "on", ot: "on", aero: "on" })); } catch (_) {} });
// RACE IN PORTRAIT = on (SETTINGS > DISPLAY): without it the rotate blocker pauses a portrait race.
await context.addInitScript(() => { try { localStorage.setItem("apex26.portraitOk", "1"); } catch (_) {} });
await page.goto("http://127.0.0.1:3456/", { waitUntil: "load" });
await page.waitForFunction(() => window.__apex && __apex.race, null, { timeout: 60000 });
const emu = await page.evaluate(readBackInPage);
await page.evaluate(() => __apex.race("bahrain"));
await page.evaluate(() => { __apex.go(); return __apex.camera("chase"); });
await page.waitForFunction(() => { const s = document.getElementById("btn-steer-right"); return s && !s.hidden && s.getBoundingClientRect().width > 0; }, null, { timeout: 60000 });
await page.waitForTimeout(2500);
const out = await page.evaluate(() => {
  const vis = (el) => { if (!el || el.closest("[hidden]")) return null; const cs = getComputedStyle(el); if (cs.display === "none" || cs.visibility === "hidden" || +cs.opacity === 0) return null;
    const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 ? { x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height), r: Math.round(r.right), b: Math.round(r.bottom) } : null; };
  const controls = [...document.querySelectorAll(".touchbtn, #pausebtn, #btn-cam")].map((e) => ({ id: e.id, kind: "control", rect: vis(e) })).filter((e) => e.rect);
  const readouts = ["hud-speed", "hud-gearbox", "hud-energy", "hud-tyre", "hud-ot", "hud-aero", "hud-box-pos", "hud-box-lap", "hud-box-time", "hud-box-best", "hud-delta", "hud-gap-ahead", "hud-gap-behind", "hud-map", "hud-tower", "hud-mirror", "hud-inputs", "hud-damage", "hud-pit"]
    .map((id) => ({ id, kind: "readout", rect: vis(document.getElementById(id)) }))
    .concat([...document.querySelectorAll("#hud [id^=hud-]")].filter((e) => e.parentElement && (e.parentElement.id === "hud" || e.parentElement.classList.contains("hud-bottom"))).map((e) => ({ id: e.id, kind: "readout", rect: vis(e) })))
    .filter((e, i, a) => e.rect && e.id !== "hud-dock" && a.findIndex((f) => f.id === e.id) === i);
  const all = [...controls, ...readouts];
  const hit = (a, b) => a.x < b.r && b.x < a.r && a.y < b.b && b.y < a.b;
  const overlaps = [];
  for (let i = 0; i < all.length; i++) for (let j = i + 1; j < all.length; j++) {
    const A = all[i], B = all[j]; if (A.kind === "readout" && B.kind === "readout" && (A.rect.w > innerWidth * 0.9 || B.rect.w > innerWidth * 0.9)) continue;
    if (A.kind === "control" && B.kind === "control") { if (hit(A.rect, B.rect)) overlaps.push([A.id, B.id]); continue; }
    if (hit(A.rect, B.rect)) overlaps.push([A.id, B.id]);
  }
  return { rotateGate: (() => { const g = document.getElementById("rotate-race"); return !!(g && g.offsetParent); })(), portraitOk: localStorage.getItem("apex26.portraitOk"), cam: __apex.camera?.().mode, viewport: [innerWidth, innerHeight], hudElements: localStorage.getItem("apex26.hudElements"), all, overlaps };
});
const dbg = await page.evaluate(() => { const e = document.getElementById("btn-steer-right"); const cs = getComputedStyle(e); const h = document.getElementById("hud"); return { hidden: !!e.closest("[hidden]"), closest: e.closest("[hidden]")?.id, op: cs.opacity, vis: cs.visibility, disp: cs.display, hudOp: h && getComputedStyle(h).opacity, hudVis: h && getComputedStyle(h).visibility, rect: e.getBoundingClientRect().toJSON() }; }); console.error(JSON.stringify(dbg));
if (shot) await page.screenshot({ path: shot, timeout: 120000 });
console.log(JSON.stringify({ window: win, variant, sha: process.env.SHA, emulation: { mismatches: mismatches(preset, emu), insets: emu.insets, uiScaleVar: emu.uiScaleVar, stored: emu.stored }, ...out }, null, 1));
await browser.close();
