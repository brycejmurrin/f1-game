// @doc UI contract PR D (#5153) measurement probe: the five sheets (select, race settings, career hub, pause, results) in the
// contract windows A/C/D seeded from the owner export, x textSize x uiScale. Parent only (one browser); needs `npx serve -l 3456 .`.
// Usage: node tools/ui/probe-sheets-contract.mjs [A,C,D] [owner|full] [out.json]. Cells per the UI contract note (PR #5154) §2.
import { chromium, devices } from "playwright";
import fs from "node:fs";

const ROOT = "/home/user/f1-game";
const EXPORT = JSON.parse(fs.readFileSync(ROOT + "/tests/data/settings-defaults-export.json", "utf8"));
const EXPORT_UI = EXPORT.uiScale == null ? null : Math.round(100 * EXPORT.uiScale);   // percent for __apex.uiScale; null = the export's default
const WINDOWS = [
  { name: "A", w: 852, h: 393, sal: 59, sar: 59, sat: 0, sab: 21 },
  { name: "C", w: 852, h: 283, sal: 59, sar: 59, sat: 0, sab: 0 },
  { name: "D", w: 844, h: 390, sal: 0, sar: 0, sat: 0, sab: 0 },
];
const only = process.argv[2] ? process.argv[2].split(",") : null;
const KNOBS = process.argv[3] === "owner" ? [["large", null]] : [["large", null], ["normal", 100], ["large", 100], ["normal", 130], ["large", 130]];
const BASE = "http://127.0.0.1:3456";
// SHEETS=pause,results limits a run to those sheets (the flow is select+race, career, pause+results).
const ONLY_SHEETS = (process.env.SHEETS || "").split(",").filter(Boolean);
const want = (k) => !ONLY_SHEETS.length || ONLY_SHEETS.includes(k);

const raf2 = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));

function common() {
  const z = (el) => el.currentCSSZoom || 1;
  const own = (el) => { const r = el.getBoundingClientRect(); const k = z(el); return { x: +(r.x).toFixed(1), y: +(r.y).toFixed(1), w: +(r.width / k).toFixed(1), h: +(r.height / k).toFixed(1), pw: +(r.width).toFixed(1), ph: +(r.height).toFixed(1) }; };
  const flags = (el) => ({ density: el.dataset.density, shape: el.dataset.shape, pair: el.dataset.pair, fit: el.dataset.fit, sheetScale: el.style.getPropertyValue("--sheet-scale"), compactAt: getComputedStyle(el).getPropertyValue("--compact-at").trim(), cw: el.clientWidth, ch: el.clientHeight, sh: el.scrollHeight, zoom: z(el) });
  return { z, own, flags };
}

async function knob(page, text, ui) {
  await page.evaluate(async ([t, u, exp]) => {
    if (window.AppearanceOpts && typeof AppearanceOpts.setTextSize === "function") { try { AppearanceOpts.setTextSize(t); } catch (_) {} }
    if (t === "normal") delete document.documentElement.dataset.textSize; else document.documentElement.dataset.textSize = t;
    // `exp` = the export's own UI SIZE, re-applied: a previous sheet's knob loop leaves the live scale at its last
    // value (130), and the first results/pause cells of the 2026-11-06 run were measured there (sheet zoom 1.25).
    if (u != null) window.__apex.uiScale(u); else window.__apex.uiScale(exp);   // null = the stored default (109 % on touch)
    window.SheetShape && SheetShape.reclassify();
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    window.SheetShape && SheetShape.reclassify();
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  }, [text, ui, EXPORT_UI]);
}

const SEL = `(() => {
  const z = (el) => el.currentCSSZoom || 1;
  const own = (el) => { const r = el.getBoundingClientRect(); const k = z(el); return { y: +r.y.toFixed(1), w: +(r.width / k).toFixed(1), h: +(r.height / k).toFixed(1), ph: +r.height.toFixed(1) }; };
  const F = (el) => ({ density: el.dataset.density, shape: el.dataset.shape, pair: el.dataset.pair, fit: el.dataset.fit, page: el.dataset.page, sheetScale: el.style.getPropertyValue("--sheet-scale"), compactAt: getComputedStyle(el).getPropertyValue("--compact-at").trim(), zoom: z(el) });
  const $ = (id) => document.getElementById(id);
  const sel = $("sel-inner"), sec = $("sel-track-section"), hero = $("sel-hero"), info = $("sel-preview-info"), prev = $("sel-track-preview");
  const body = document.body;
  return { body: { density: body.dataset.density, shape: body.dataset.shape, width: body.dataset.width, ui: getComputedStyle(document.documentElement).getPropertyValue("--ui-scale").trim() },
    sheet: Object.assign(own(sel), F(sel)),
    head: own(sel.querySelector(":scope > .sheet-head")), shelf: own($("sel-shelf")), foot: own(sel.querySelector(":scope > .sheet-foot")),
    section: Object.assign(own(sec), { sh: sec.scrollHeight, ch: sec.clientHeight, scrolls: sec.scrollHeight - sec.clientHeight }),
    preview: Object.assign(own(prev), { rows: getComputedStyle(prev).gridTemplateRows, cols: getComputedStyle(prev).gridTemplateColumns }),
    hero: own(hero), info: own(info), label: own($("sel-circuit-label")), filter: own($("sel-track-filter")),
    name: own($("sel-preview-name")), goVisible: (() => { const r = $("sel-go").getBoundingClientRect(); return r.bottom <= innerHeight && r.top >= 0; })() };
})()`;

const RS = `(() => {
  const z = (el) => el.currentCSSZoom || 1;
  const own = (el) => { const r = el.getBoundingClientRect(); const k = z(el); return { y: +r.y.toFixed(1), w: +(r.width / k).toFixed(1), h: +(r.height / k).toFixed(1), ph: +r.height.toFixed(1) }; };
  const $ = (id) => document.getElementById(id);
  const sh = document.querySelector("#race-settings > .sheet"), rb = $("rs-body");
  return { sheet: Object.assign(own(sh), { density: sh.dataset.density, shape: sh.dataset.shape, compactAt: getComputedStyle(sh).getPropertyValue("--compact-at").trim(), zoom: z(sh), sh: sh.scrollHeight, ch: sh.clientHeight, display: getComputedStyle(sh).display }),
    body: Object.assign(own(rb), { cols: getComputedStyle(rb).gridTemplateColumns, sh: rb.scrollHeight, ch: rb.clientHeight }),
    head: own(sh.querySelector(":scope > .sheet-head")), foot: own(sh.querySelector(":scope > .sheet-foot")),
    goVisible: (() => { const b = $("rs-go") || sh.querySelector(".sheet-foot .bigbtn:not(.alt)"); if (!b) return null; const r = b.getBoundingClientRect(); return r.bottom <= innerHeight + 0.5 && r.top >= 0; })() };
})()`;

const CR = `(() => {
  const z = (el) => el.currentCSSZoom || 1;
  const own = (el) => { const r = el.getBoundingClientRect(); const k = z(el); return { y: +r.y.toFixed(1), w: +(r.width / k).toFixed(1), h: +(r.height / k).toFixed(1), ph: +r.height.toFixed(1), bottom: +r.bottom.toFixed(1) }; };
  const $ = (id) => document.getElementById(id);
  const cr = $("cr-inner"), body = $("cr-body"), left = $("cr-left"), right = $("cr-right"), head = $("cr-header"), foot = $("cr-foot");
  const ir = cr.getBoundingClientRect();
  const clipped = [];
  for (const el of cr.querySelectorAll("button, .cr-slot, .cr-nextrace, [data-career-nav], #cr-meters, h3")) { const r = el.getBoundingClientRect(); if (r.height > 2 && r.bottom > ir.bottom + 1) clipped.push((el.id || el.className || el.tagName).toString().slice(0, 30) + "+" + Math.round(r.bottom - ir.bottom)); }
  return { sheet: Object.assign(own(cr), { density: cr.dataset.density, shape: cr.dataset.shape, pair: cr.dataset.pair, fit: cr.dataset.fit, sheetScale: cr.style.getPropertyValue("--sheet-scale"), compactAt: getComputedStyle(cr).getPropertyValue("--compact-at").trim(), pairAt: getComputedStyle(cr).getPropertyValue("--pair-at").trim(), pairCompact: getComputedStyle(cr).getPropertyValue("--pair-compact").trim(), zoom: z(cr), cols: getComputedStyle(cr).gridTemplateColumns }),
    head: Object.assign(own(head), { cols: getComputedStyle(head).gridTemplateColumns }), meters: Object.assign(own($("cr-meters")), { display: getComputedStyle($("cr-meters")).display }),
    body: Object.assign(own(body), { display: getComputedStyle(body).display, sh: body.scrollHeight, ch: body.clientHeight }),
    left: Object.assign(own(left), { sh: left.scrollHeight, ch: left.clientHeight, overflowY: getComputedStyle(left).overflowY }), right: Object.assign(own(right), { sh: right.scrollHeight, ch: right.clientHeight, overflowY: getComputedStyle(right).overflowY }),
    foot: own(foot), clipped: clipped.slice(0, 8), look: { density: document.documentElement.dataset.lookCareerDensity, layout: document.documentElement.dataset.lookCareerLayout } };
})()`;

const PM = `(() => {
  const z = (el) => el.currentCSSZoom || 1;
  const own = (el) => { const r = el.getBoundingClientRect(); const k = z(el); return { y: +r.y.toFixed(1), w: +(r.width / k).toFixed(1), h: +(r.height / k).toFixed(1), ph: +r.height.toFixed(1), bottom: +r.bottom.toFixed(1) }; };
  const $ = (id) => document.getElementById(id);
  const pm = $("pausemenu"), sh = pm.querySelector(":scope > .sheet"), body = sh.querySelector(":scope > .sheet-body"), tray = $("pm-quick-doors");
  const sr = sh.getBoundingClientRect();
  const doors = {};
  for (const id of ["pm-race-context", "pm-resume", "pm-restart", "pm-settings", "pm-quit", "pm-quick-doors", "pm-now-card", "pm-build"]) { const el = $(id); if (!el) continue; const r = el.getBoundingClientRect(); doors[id] = { h: +(r.height / z(el)).toFixed(1), ph: +r.height.toFixed(1), top: +(r.top - sr.top).toFixed(1), pastSheet: +(r.bottom - sr.bottom).toFixed(1), hidden: el.hidden || getComputedStyle(el).display === "none" }; }
  const tiles = [...tray.children].filter((c) => !c.hidden && getComputedStyle(c).display !== "none").map((c) => Math.round(c.getBoundingClientRect().top));
  const trayRows = new Set(tiles).size;
  const cs = getComputedStyle(body);
  return { root: { pauseLayout: document.documentElement.dataset.pauseLayout, lookBtn: document.documentElement.dataset.lookPauseBtn, lookW: document.documentElement.dataset.lookPauseW },
    body: { density: document.body.dataset.density, shape: document.body.dataset.shape },
    sheet: Object.assign(own(sh), { density: sh.dataset.density, shape: sh.dataset.shape, fit: sh.dataset.fit, sheetScale: sh.style.getPropertyValue("--sheet-scale"), zoom: z(sh), maxH: getComputedStyle(sh).maxHeight, sheetW: getComputedStyle(pm).getPropertyValue("--sheet-w").trim() }),
    sbody: Object.assign(own(body), { sh: body.scrollHeight, ch: body.clientHeight, scrolls: body.scrollHeight - body.clientHeight, overflowY: cs.overflowY, cols: cs.gridTemplateColumns, rows: cs.gridTemplateRows, areas: cs.gridTemplateAreas }),
    head: (() => { const h = sh.querySelector(":scope > .sheet-head"); return h ? Object.assign(own(h), { display: getComputedStyle(h).display }) : null; })(),
    doors, trayRows, trayTiles: tiles.length, screenH: innerHeight };
})()`;

const RES = `(() => {
  const z = (el) => el.currentCSSZoom || 1;
  const own = (el) => { const r = el.getBoundingClientRect(); const k = z(el); return { y: +r.y.toFixed(1), w: +(r.width / k).toFixed(1), h: +(r.height / k).toFixed(1), ph: +r.height.toFixed(1) }; };
  const $ = (id) => document.getElementById(id);
  const res = $("results"), sh = res.querySelector(":scope > .sheet"), body = sh.querySelector(":scope > .sheet-body"), table = $("results-table");
  const rows = [...table.querySelectorAll(".res-row[role=listitem]")];
  const sticky = rows.filter((r) => getComputedStyle(r).position === "sticky");
  const rrH = getComputedStyle(table).getPropertyValue("--rr-h").trim();
  const rowH = rows[0] ? rows[0].getBoundingClientRect().height : 0;
  const pane = (table.closest("[class*=scroll], .sheet-body") || body);
  const scroller = (() => { let el = table; while (el && el !== sh) { const o = getComputedStyle(el).overflowY; if (o === "auto" || o === "scroll") return el; el = el.parentElement; } return body; })();
  const pinned = sticky.length * rowH;
  return { body: { density: document.body.dataset.density, shape: document.body.dataset.shape },
    sheet: Object.assign(own(sh), { density: sh.dataset.density, shape: sh.dataset.shape, fit: sh.dataset.fit, sheetScale: sh.style.getPropertyValue("--sheet-scale"), zoom: z(sh), cols: getComputedStyle(sh).gridTemplateColumns, rows: getComputedStyle(sh).gridTemplateRows }),
    head: own(sh.querySelector(":scope > .sheet-head")), foot: (() => { const f = sh.querySelector(":scope > .sheet-foot"); return f ? own(f) : null; })(),
    scroller: Object.assign(own(scroller), { id: scroller.id || scroller.className, sh: scroller.scrollHeight, ch: scroller.clientHeight }),
    rows: rows.length, rowPh: +rowH.toFixed(1), rrH, sticky: sticky.map((r) => r.className.replace("res-row", "").trim()), pinnedPh: +pinned.toFixed(1),
    scrollingRows: +(((scroller.clientHeight * (z(scroller))) - pinned) / Math.max(1, rowH)).toFixed(2),
    youIdx: rows.findIndex((r) => r.classList.contains("you")) };
})()`;

async function main() {
  const browser = await chromium.launch();
  const out = {};
  for (const v of WINDOWS) {
    if (only && !only.includes(v.name)) continue;
    const desc = devices["iPhone 15 Pro landscape"];
    const ctx = await browser.newContext({ ...desc, viewport: { width: v.w, height: v.h }, screen: { width: v.w, height: v.h }, deviceScaleFactor: 1 });
    const page = await ctx.newPage();
    page.on("pageerror", (e) => console.error("[pageerror]", v.name, e.message.slice(0, 200)));
    await page.addInitScript(() => { try { localStorage.setItem("apex26.gfxBackend", "webgl2"); localStorage.setItem("apex26.tyreWear", JSON.stringify("off")); } catch (_) {} });
    await page.goto(BASE + "/?inspector=0");
    await page.waitForFunction(() => window.__apex != null, null, { polling: 100, timeout: 90000 });
    const imp = await page.evaluate((d) => SettingsExport.applySettings(d, {}), EXPORT);
    if (!imp.ok || imp.failed) throw new Error("import " + JSON.stringify(imp));
    await page.reload();
    await page.waitForFunction(() => window.__apex != null, null, { polling: 100, timeout: 90000 });
    await page.addStyleTag({ content: `:root{--sal:${v.sal}px;--sar:${v.sar}px;--sat:${v.sat}px;--sab:${v.sab}px;}` });
    await page.evaluate(() => window.__apex.headless(true));
    const W = (out[v.name] = { boot: await page.evaluate(() => ({ ui: getComputedStyle(document.documentElement).getPropertyValue("--ui-scale").trim(), text: document.documentElement.dataset.textSize, contrast: document.documentElement.dataset.uiContrast, body: { ...document.body.dataset }, inner: [innerWidth, innerHeight], client: [document.documentElement.clientWidth, document.documentElement.clientHeight] })) });
    console.log(v.name, JSON.stringify(W.boot));

    // SELECT + RACE SETTINGS
    if (want("select") || want("race")) {
    await page.click("#mb-race");
    await page.waitForSelector("#select:not([hidden])", { timeout: 15000 });
    await page.waitForFunction(() => document.querySelectorAll("#sel-tracks .track-row").length > 20, null, { polling: 100, timeout: 15000 });
    W.select = {}; W.race = {};
    for (const [t, u] of KNOBS) {
      await knob(page, t, u);
      await page.evaluate(raf2);
      W.select[`${t}/${u ?? "exp"}`] = await page.evaluate(SEL);
    }
    await knob(page, "large", null);
    await page.click("#sel-go");
    await page.waitForSelector("#race-settings:not([hidden])", { timeout: 15000 });
    await page.waitForTimeout(400);
    for (const [t, u] of KNOBS) {
      await knob(page, t, u);
      W.race[`${t}/${u ?? "exp"}`] = await page.evaluate(RS);
    }
    await knob(page, "large", null);
    await page.evaluate(() => document.getElementById("rs-cancel")?.click());
    await page.waitForTimeout(300);
    await page.evaluate(() => document.getElementById("sel-back")?.click());
    await page.waitForTimeout(300);
    }

    // CAREER HUB
    if (want("career")) {
    await page.evaluate(() => window.__apex.career({ teamId: "haas", seat: 1, seed: 4242 }));
    await page.waitForSelector("#career:not([hidden])", { timeout: 30000 });
    await page.waitForSelector("#cr-nextrace", { timeout: 60000 });
    await page.waitForTimeout(500);
    W.career = {};
    for (const [t, u] of KNOBS) {
      await knob(page, t, u);
      W.career[`${t}/${u ?? "exp"}`] = await page.evaluate(CR);
    }
    // career with density auto (what the fix would give) for comparison
    await knob(page, "large", null);
    await page.evaluate(async () => {
      const root = document.documentElement; delete root.dataset.lookCareerDensity;
      SheetShape.reclassify(); await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))); SheetShape.reclassify(); await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    });
    W.careerAuto = await page.evaluate(CR);
    await page.evaluate(() => { document.documentElement.dataset.lookCareerDensity = "roomy"; SheetShape.reclassify(); });
    await page.evaluate(() => document.getElementById("cr-back")?.click());
    await page.waitForTimeout(300);
    }

    // PAUSE + RESULTS (a race)
    if (want("pause") || want("results")) {
    await page.evaluate(async () => { await window.__apex.race("monza", null, null, { grid: "tier" }); });
    await page.waitForFunction(() => window.__apex.info().track === "monza", null, { polling: 100, timeout: 60000 });
    await page.evaluate(() => { window.__apex.go(); window.__apex.jump(0.2, 40); });
    await page.evaluate(() => { document.getElementById("pausemenu").hidden = false; });
    await page.waitForTimeout(400);
    W.pause = {};
    for (const [t, u] of KNOBS) {
      await knob(page, t, u);
      W.pause[`${t}/${u ?? "exp"}`] = await page.evaluate(PM);
    }
    // the stored layouts, owner knobs only
    W.pauseLayouts = {};
    for (const lay of ["list", "compact", "wide", "sidebar"]) {
      await page.evaluate(async (l) => { document.documentElement.dataset.pauseLayout = l; SheetShape.reclassify(); await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))); }, lay);
      W.pauseLayouts[lay] = await page.evaluate(PM);
    }
    await page.evaluate(() => { delete document.documentElement.dataset.pauseLayout; SheetShape.reclassify(); });
    await page.evaluate(() => { document.getElementById("pausemenu").hidden = true; });
    await page.evaluate(() => { window.__apex.setLap(3); window.__apex.finishRace(); });
    await page.waitForSelector("#results:not([hidden])", { timeout: 20000 });
    await page.waitForTimeout(600);
    W.results = {};
    for (const [t, u] of KNOBS) {
      await knob(page, t, u);
      W.results[`${t}/${u ?? "exp"}`] = await page.evaluate(RES);
    }
    }
    await ctx.close();
  }
  await browser.close();
  const outPath = process.argv[4] || "/home/user/f1-game/artifacts/pr-d-probe.json";
  fs.writeFileSync(outPath, JSON.stringify(out, null, 1));
  console.log("wrote", outPath);
}
main().catch((e) => { console.error(e); process.exit(1); });
