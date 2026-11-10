// @doc Owner-profile screen survey: all menu screens at contract windows A/C/D/As, seeded from the settings export.
// #5201. Every menu-screens.mjs screen at the UI-contract windows (As = A with a stale portrait inner*), seeded from
// tests/data/settings-defaults-export.json: scrollers, controls outside the safe box, fat controls. Parent only (one browser).
// Usage: node tools/ui/profile-survey.mjs [A,C,D,As] [screenA,screenB|*]   env SURVEY_ROOT=<tree to serve> SURVEY_OUT=<dir under artifacts/> SURVEY_SCALE=<UI SIZE percent; unset = the export's>
// Output: artifacts/profile-survey/report-<windows>.json + one JPEG per cell. Insets are injected as --sa* before first layout. Results: docs/notes/VIEWPORT-ASSUMPTIONS-2026-11-10.md.
import fs from "node:fs";
import path from "node:path";
import { devices } from "playwright";
import { launchChromium, shutdown, startStaticServer } from "../lib/harness.mjs";
import { captureShot } from "../lib/ui-mock-core.mjs";
import { SCREENS } from "./menu-screens.mjs";
import { bootPage, resetToTitle, waitScreenReady } from "./menu-capture.mjs";
import { chromiumArgs } from "../shot/hud-survey.mjs";
import { ensureTapFloor } from "./tap-floor.mjs";
import { probeMenu, leaveToMenu } from "./menu-mock.mjs";

const ROOT = path.resolve(import.meta.dirname, "../..");
const EXPORT = JSON.parse(fs.readFileSync(path.join(ROOT, "tests/data/settings-defaults-export.json"), "utf8"));
const WINDOWS = {
  A: { w: 852, h: 393, l: 59, r: 59, t: 0, b: 21, standalone: true },
  C: { w: 852, h: 283, l: 59, r: 59, t: 0, b: 0 },
  D: { w: 844, h: 390, l: 47, r: 47, t: 0, b: 21, standalone: true },
  As: { w: 852, h: 393, l: 59, r: 59, t: 0, b: 21, standalone: true, stale: true },
};
const wantW = (process.argv[2] || "A,C,D").split(",");
const wantS = process.argv[3] && process.argv[3] !== "*" ? process.argv[3].split(",") : null;
const OUT = path.join(ROOT, "artifacts", process.env.SURVEY_OUT || "profile-survey");
const SCALE = process.env.SURVEY_SCALE ? Number(process.env.SURVEY_SCALE) : null;   // percent, stored by __apex.uiScale
const SERVE = process.env.SURVEY_ROOT || ROOT;   // the tree served (a worktree at the base for a before run)
fs.mkdirSync(OUT, { recursive: true });

/** In-page: the extra facts menu-mock's probe does not give. */
function probeExtra({ rootSel, win }) {
  const root = document.querySelector(rootSel) || document.body;
  const W = document.documentElement.clientWidth, H = document.documentElement.clientHeight;
  const z = (el) => el.currentCSSZoom || 1;
  const vis = (el) => { if (el.checkVisibility && !el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })) return false; const r = el.getBoundingClientRect(); return r.width > 1 && r.height > 1; };
  const label = (el) => (el.id ? "#" + el.id : (el.className && typeof el.className === "string" ? "." + el.className.trim().split(/\s+/).slice(0, 2).join(".") : el.tagName.toLowerCase()));
  const rr = (r) => [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)];
  const safe = { l: win.l, r: W - win.r, t: win.t, b: H - win.b };
  const scrollers = [];
  for (const el of [root, ...root.querySelectorAll("*")]) {
    const cs = getComputedStyle(el);
    const y = /(auto|scroll)/.test(cs.overflowY) && el.scrollHeight > el.clientHeight + 1;
    const x = /(auto|scroll)/.test(cs.overflowX) && el.scrollWidth > el.clientWidth + 1;
    if ((x || y) && vis(el)) scrollers.push({ el: label(el), y: y ? el.scrollHeight - el.clientHeight : 0, x: x ? el.scrollWidth - el.clientWidth : 0, box: rr(el.getBoundingClientRect()), zoom: +z(el).toFixed(3) });
  }
  // Controls: outside the safe box, and drawn far larger than their content.
  const unsafe = [], fat = [];
  const ctrls = root.querySelectorAll("button, a[href], input:not([type=hidden]), select, textarea, summary, [role=button], [role=tab], [role=switch]");
  let n = 0;
  for (const el of ctrls) {
    if (!vis(el)) continue;
    n++;
    const r0 = el.getBoundingClientRect();
    // only the part actually painted (a scrolled-away row is the scroller's finding): clip by every clipping ancestor
    let L = r0.left, T = r0.top, Rr = r0.right, Bb = r0.bottom;
    for (let p = el.parentElement; p && p !== document.documentElement; p = p.parentElement) { const pc = getComputedStyle(p); if (pc.overflowX !== "visible" || pc.overflowY !== "visible") { const q = p.getBoundingClientRect(); L = Math.max(L, q.left); T = Math.max(T, q.top); Rr = Math.min(Rr, q.right); Bb = Math.min(Bb, q.bottom); } }
    if (Rr - L < 2 || Bb - T < 2) continue;
    const r = { left: L, top: T, right: Rr, bottom: Bb, width: Rr - L, height: Bb - T };
    if (r.bottom < 0 || r.top > H || r.right < 0 || r.left > W) continue;
    const out = { l: Math.round(safe.l - r.left), r: Math.round(r.right - safe.r), b: Math.round(r.bottom - safe.b), t: Math.round(safe.t - r.top) };
    if (out.l > 1 || out.r > 1 || out.b > 1 || out.t > 1) unsafe.push({ el: label(el), box: rr(r), over: Object.fromEntries(Object.entries(out).filter(([, v]) => v > 1)) });
    // content box: text range, or the union of child rects
    let cw = 0, ch = 0;
    if (el.tagName === "SELECT") { const cv = document.createElement("canvas").getContext("2d"); const cs = getComputedStyle(el); cv.font = cs.fontWeight + " " + cs.fontSize + " " + cs.fontFamily; const o = el.options[el.selectedIndex]; cw = (o ? cv.measureText(o.text).width : 0) * z(el) / z(el); ch = parseFloat(cs.fontSize) * 1.2; cw *= z(el); ch *= z(el); }
    else if (el.tagName === "INPUT" || el.tagName === "TEXTAREA") { continue; }
    else { const rg = document.createRange(); rg.selectNodeContents(el); const c = rg.getBoundingClientRect(); cw = c.width; ch = c.height; }
    if (ch < 1 || cw < 1) continue;
    const kh = r0.height / ch, kw = r0.width / cw;
    if ((r0.height >= 72 && kh >= 2.6) || (r0.height >= 96) || (r0.width >= 240 && kw >= 4 && r0.height >= 60)) fat.push({ el: label(el), box: rr(r0), content: [Math.round(cw), Math.round(ch)], kh: +kh.toFixed(1), kw: +kw.toFixed(1), fs: +(parseFloat(getComputedStyle(el).fontSize) * z(el)).toFixed(1) });
  }
  const sheet = root.matches(".sheet") ? root : root.querySelector(".sheet, .dh-card") || root;
  const sr = sheet.getBoundingClientRect(), cs = getComputedStyle(sheet);
  const R = document.documentElement, B = document.body, rs = getComputedStyle(R), bs = getComputedStyle(B);
  return {
    n, scrollers, unsafe, fat,
    doc: { sw: R.scrollWidth, sh: R.scrollHeight, cw: W, ch: H, inner: [innerWidth, innerHeight], vv: window.visualViewport ? [Math.round(visualViewport.width), Math.round(visualViewport.height)] : null },
    body: { density: B.dataset.density, shape: B.dataset.shape, width: B.dataset.width, cls: B.className.split(/\s+/).filter((c) => /desktop|touch|coarse|standalone|compact/.test(c)).join(" ") },
    html: { layout: R.dataset.layout, text: R.dataset.textSize, contrast: R.dataset.uiContrast, ui: rs.getPropertyValue("--ui-scale").trim(), hud: rs.getPropertyValue("--hud-scale").trim(), btn: bs.getPropertyValue("--hud-btn-scale").trim() || rs.getPropertyValue("--hud-btn-scale").trim(), tap: bs.getPropertyValue("--tap").trim(), kb: rs.getPropertyValue("--kb").trim(), sal: rs.getPropertyValue("--sal").trim(), safeL: bs.getPropertyValue("--safe-l").trim(), gut: bs.getPropertyValue("--gut").trim() },
    sheet: { el: label(sheet), box: rr(sr), zoom: +z(sheet).toFixed(3), density: sheet.dataset.density, shape: sheet.dataset.shape, pair: sheet.dataset.pair, fit: sheet.dataset.fit, sheetScale: sheet.style.getPropertyValue("--sheet-scale"), compactAt: cs.getPropertyValue("--compact-at").trim(),
      outside: { l: Math.round(safe.l - sr.left), r: Math.round(sr.right - safe.r), b: Math.round(sr.bottom - safe.b), t: Math.round(safe.t - sr.top) } },
    rootBox: rr(root.getBoundingClientRect()),
  };
}

const srv = await startStaticServer(SERVE);
const rows = [];
const t0 = Date.now();
try {
  const browser = await launchChromium({ args: [...chromiumArgs({ backend: "three", gl: "llvmpipe" }), "--hide-scrollbars"] });
  for (const name of wantW) {
    const win = WINDOWS[name];
    if (!win) throw new Error("window " + name);
    const o = devices["iPhone 15 Pro landscape"];
    const ctx = await browser.newContext({ hasTouch: true, isMobile: true, userAgent: o.userAgent, deviceScaleFactor: 1, colorScheme: "dark", viewport: { width: win.w, height: win.h }, screen: { width: win.w, height: win.h } });
    // Insets before first layout (a real device has env() at parse time); standalone; the #5152 stale launch.
    await ctx.addInitScript((v) => {
      const put = () => { const s = document.documentElement.style; s.setProperty("--sal", v.l + "px"); s.setProperty("--sar", v.r + "px"); s.setProperty("--sat", v.t + "px"); s.setProperty("--sab", v.b + "px"); };
      if (document.documentElement) put(); else new MutationObserver((_, mo) => { if (document.documentElement) { mo.disconnect(); put(); } }).observe(document, { childList: true });
      if (v.standalone) { try { Object.defineProperty(navigator, "standalone", { get: () => true, configurable: true }); } catch (_) {} }
      if (v.stale) { for (const [k, val] of [["innerWidth", v.h], ["innerHeight", v.w]]) Object.defineProperty(window, k, { get: () => val, configurable: true }); }
    }, win);
    const page = await ctx.newPage();
    if (win.standalone) { const cdp = await ctx.newCDPSession(page); await cdp.send("Emulation.setEmulatedMedia", { features: [{ name: "display-mode", value: "standalone" }] }).catch((e) => console.log("display-mode emulation: " + e.message)); }
    const errs = [];
    page.on("pageerror", (e) => errs.push(String(e && e.message || e).slice(0, 160)));
    await bootPage(page, srv.url, { hideGame: true });
    const imp = await page.evaluate((d) => SettingsExport.applySettings(d, {}), EXPORT);
    if (!imp.ok || imp.failed) throw new Error("import " + JSON.stringify(imp));
    if (SCALE != null) { const u = await page.evaluate((n) => window.__apex.uiScale(n), SCALE); if (!u || u.ok === false || u.pct !== SCALE) throw new Error("uiScale " + JSON.stringify(u)); }
    await bootPage(page, srv.url, { hideGame: true });
    await page.evaluate(() => { window.__mmGrid = window.__apex.info().raceGrid; });
    await page.addStyleTag({ content: "html,body{background:#000!important}#game,#game-soft{visibility:hidden!important}" });
    console.log(`[survey] ${name} booted ${((Date.now() - t0) / 1000).toFixed(0)} s`);
    for (const screen of SCREENS) {
      if (wantS && !wantS.includes(screen.id)) continue;
      const t1 = Date.now();
      const row = { window: name, screen: screen.id, root: screen.root, error: null };
      try {
        await page.evaluate(leaveToMenu);
        await page.waitForFunction(() => window.__apex.info().state === "menu", null, { polling: 100, timeout: 10000 });
        await resetToTitle(page, srv.url, true);
        await screen.open(page, screen.circuit);
        await waitScreenReady(page, screen);
        await page.evaluate(() => window.SheetShape && SheetShape.reclassify());
        await page.waitForTimeout(250);
        await ensureTapFloor(page);
        const m = await page.evaluate(probeMenu, { rootSel: screen.root, minTap: null, touch: true, minFont: 10 });
        const x = await page.evaluate(probeExtra, { rootSel: screen.root, win });
        Object.assign(row, { issues: m.issues, tapFloor: m.tapFloor }, x, { pageErrors: errs.splice(0) });
        await captureShot(page, path.join(OUT, `${name}-${screen.id}.jpg`), { format: "jpeg" });
      } catch (e) { row.error = String(e && e.message || e).slice(0, 240); }
      row.ms = Date.now() - t1;
      rows.push(row);
      console.log(`[survey] ${name} ${screen.id}: ${row.error ? "ERROR " + row.error : `scroll ${row.scrollers.length} unsafe ${row.unsafe.length} fat ${row.fat.length} clipped ${row.issues.clipped.length} off ${row.issues.offscreen.length} tap ${row.issues.tap.length}`} ${row.ms} ms`);
      fs.writeFileSync(path.join(OUT, `report-${wantW.join("")}.json`), JSON.stringify({ when: new Date().toISOString(), rows }, null, 1));
    }
    await ctx.close().catch(() => {});
  }
} finally {
  await shutdown();
  await srv.close?.();
}
console.log(`[survey] = done ${rows.length} cells, ${rows.filter((r) => r.error).length} errors, ${((Date.now() - t0) / 1000).toFixed(0)} s`);
