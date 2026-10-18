import { chromium } from "playwright";
import { execSync } from "node:child_process";
const OUT = "scratch/a2846/";
const exe = execSync("node tools/lib/chromium-path.mjs --path").toString().trim();
const b = await chromium.launch({ executablePath: exe, args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
const ctx = await b.newContext({ viewport: { width: 852, height: 393 }, hasTouch: true, isMobile: true });
const p = await ctx.newPage();
await p.goto("http://127.0.0.1:3456/");
await p.waitForFunction(() => window.__apex != null, null, { polling: 200, timeout: 180000 });
await p.evaluate(() => window.__apex.headless(true));
await p.waitForTimeout(1500);
await p.locator("#mb-settings").tap();
await p.locator("#pm-open-appearance").tap();
await p.waitForSelector("#appearance-studio", { timeout: 60000 });
const shot = async (name, sel) => {
  const info = await p.evaluate((s) => {
    const e = document.querySelector(s); if (!e) return "missing " + s;
    let sc = e.parentElement; while (sc && !(sc.scrollHeight > sc.clientHeight + 4 && /auto|scroll/.test(getComputedStyle(sc).overflowY))) sc = sc.parentElement;
    if (!sc) return "no scroller; rect " + JSON.stringify(e.getBoundingClientRect());
    sc.scrollTop += e.getBoundingClientRect().top - sc.getBoundingClientRect().top - 4;
    return sc.id + "." + sc.className + " top=" + sc.scrollTop + " h=" + e.getBoundingClientRect().height;
  }, sel);
  console.log(name, info);
  await p.waitForTimeout(400);
  await p.screenshot({ path: OUT + name + ".png" });
};
// headings in the studio: find group sections by text
const grp = (t) => `[data-shot="${t}"]`;
await p.evaluate(() => {
  for (const h of document.querySelectorAll("#appearance-studio h3, #appearance-studio legend, #appearance-studio .as-heading")) {
    const t = h.textContent.trim();
    if (/^MENU/.test(t)) h.parentElement.dataset.shot = "menu";
    if (/^RACE HUD/.test(t)) h.parentElement.dataset.shot = "hud";
  }
  for (let e = document.querySelector("#pm-general"); e; e = e.parentElement) if (e.tagName === "DETAILS") e.open = true;
});
await shot("0-current-studio-menu", grp("menu"));
await shot("0-current-general", "#pm-general-body");
const jump = (text) => `<button type="button" class="adv-more-btn" style="width:100%;text-align:left">${text} &rsaquo;</button>`;
// OPTION A: Studio home for the six; General keeps UNITS + HELP TEXT and gets one jump.
await p.evaluate((j) => {
  const body = document.querySelector("#pm-general-body");
  for (const id of ["pm-appearance-preview", "pm-uitheme", "pm-menuaccent", "pm-menuaccent-swatches", "pm-hudaccent", "pm-hudaccent-swatches", "pm-textsize", "pm-textsize-help", "pm-contrast", "pm-contrast-help", "pm-uiscale", "pm-uiscale-help", "pm-uiscale-h"]) { const e = document.getElementById(id); if (e) { (e.closest("label") || e).style.display = "none"; } }
  body.insertAdjacentHTML("afterbegin", '<div id="mockA">' + j + "</div>");
  document.getElementById("pm-general-sum").textContent = "GENERAL · UNITS & HELP TEXT";
}, jump("THEME, ACCENTS, TEXT &amp; UI SIZE, CONTRAST — in APPEARANCE STUDIO › MENU / RACE HUD"));
await shot("A-general", "#pm-general");
await shot("A-general-2", "#pm-units");
await p.reload(); await p.waitForFunction(() => window.__apex != null, null, { polling: 200, timeout: 180000 });
await p.evaluate(() => window.__apex.headless(true)); await p.waitForTimeout(1500);
await p.locator("#mb-settings").tap(); await p.locator("#pm-open-appearance").tap(); await p.waitForSelector("#appearance-studio");
// OPTION B: General fold is home; the Studio's MENU · GLOBAL rows collapse to one jump.
await p.evaluate((j) => {
  for (const h of document.querySelectorAll("#appearance-studio h3, #appearance-studio legend, #appearance-studio .as-heading")) {
    const t = h.textContent.trim();
    if (/^MENU/.test(t)) { const g = h.parentElement; g.dataset.shot = "menu"; for (const c of [...g.children]) if (c !== h) c.style.display = "none"; g.insertAdjacentHTML("beforeend", j); }
  }
}, jump("THEME, ACCENT, TEXT &amp; UI SIZE, CONTRAST, MOTION — in GENERAL below"));
await shot("B-studio-menu", grp("menu"));
await b.close();
