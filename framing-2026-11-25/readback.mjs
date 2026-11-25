// Settings read-back for the 2026-11-25 export, per window, two seeding paths:
//   import = the game's own SettingsExport.applySettings(file) on a fresh boot, then reload
//   seed   = openBrycePhone's localStorage seed (what layout-audit's bryce-* cells use)
// usage: node scratch/readback.mjs <portrait|standalone> <import|seed>  → JSON on stdout
import fs from "node:fs";
import { chromium } from "playwright";
import { openBrycePhone, readBackInPage, mismatches } from "./lib/bryce-phone.mjs";

const [win = "standalone", path = "import"] = process.argv.slice(2);
const EXP = JSON.parse(fs.readFileSync("tests/data/settings-live-export-2026-11-25.json", "utf8"));
const browser = await chromium.launch();
const { context, page, preset } = await openBrycePhone(browser, { window: win, dpr: 1, profile: path === "seed" });
const errors = [];
page.on("pageerror", (e) => errors.push(String(e.message || e).slice(0, 200)));
const boot = async () => {
  await page.waitForFunction(() => window.__apex != null && typeof SettingsExport !== "undefined", null, { timeout: 90000 });
  await page.waitForTimeout(4000); // let SheetShape settle and AppearanceStudio.syncShape run
};
await page.goto("http://127.0.0.1:3456/");
await boot();
let receipt = null;
if (path === "import") {
  receipt = await page.evaluate(async (d) => {
    if (SettingsExport.ready) await SettingsExport.ready();
    const r = SettingsExport.applySettings(d, {});
    return r && typeof r.then === "function" ? await r : r;
  }, EXP);
  await page.reload();
  await boot();
}
const back = await page.evaluate(() => {
  const rows = SettingsExport.SPEC.map((r) => ({ k: r.k, lane: r.lane, group: r.group, info: !!r.info, noImport: !!r.noImport, perDevice: !!r.perDevice }));
  const val = {};
  for (const r of rows) {
    const s = localStorage.getItem("apex26." + r.k);
    if (s === null) { val[r.k] = null; continue; }
    if (r.lane === "raw") { val[r.k] = s; continue; }
    try { val[r.k] = JSON.parse(s); } catch (_) { val[r.k] = s; }
  }
  const css = getComputedStyle(document.documentElement);
  return { rows, val, shape: document.body.dataset.shape || null,
    vars: { uiScale: css.getPropertyValue("--ui-scale").trim(), hudScale: css.getPropertyValue("--hud-scale").trim(), btn: css.getPropertyValue("--hud-btn-scale").trim() },
    bodyClass: document.body.className.slice(0, 400), htmlClass: document.documentElement.className.slice(0, 400) };
});
const emu = mismatches(preset, await page.evaluate(readBackInPage));
const emuRaw = await page.evaluate(readBackInPage);

// Expected: the export's groups; in landscape the SHAPE keys come from appearanceShapes.park.
const SHAPE_KEYS = ["uiScale", "hudScale", "hudBtnScale", "hudBtnOpacity", "hudPanelOpacity", "hudMetricsLayout", "hudMapVis", "hudGapsVis",
  "pauseLayout", "pauseSide", "pauseDim", "lookPause", "lookDatahub", "lookSelect", "lookRace", "lookCareer", "lookGarage", "lookPopups", "lookDesigner"];
const flat = {};
for (const [g, o] of Object.entries(EXP.settings)) for (const [k, v] of Object.entries(o)) flat[k] = { g, v };
const landscape = preset.viewport.width > preset.viewport.height;
const shapes = flat.appearanceShapes?.v;
const canon = (v) => JSON.stringify(v, (_, x) => (x && typeof x === "object" && !Array.isArray(x) ? Object.fromEntries(Object.keys(x).sort().map((k) => [k, x[k]])) : x));
const loose = (a, b) => canon(a) === canon(b) || (a != null && b != null && String(a) === String(b));
const rowsByK = Object.fromEntries(back.rows.map((r) => [r.k, r]));
const diff = [], notInSpec = [], ok = [];
for (const [k, { g, v }] of Object.entries(flat)) {
  const row = rowsByK[k];
  if (!row) { notInSpec.push(k); continue; }
  let want = v;
  if (shapes?.mode === "separate" && shapes.live !== (landscape ? "wide" : "tall") && SHAPE_KEYS.includes(k) && shapes.park) want = shapes.park[k] ?? null;
  if (k === "appearanceShapes") { ok.push(k); continue; } // its live/park swap is checked by the SHAPE rows
  const got = back.val[k];
  if (loose(got, want)) ok.push(k);
  else diff.push({ k, group: g, info: row.info, noImport: row.noImport, perDevice: row.perDevice, want, got });
}
const out = { window: win, path, viewport: preset.viewport, exportedAt: EXP.exportedAt, receipt, emulation: emu, emuRaw,
  shape: back.shape, vars: back.vars, storedShapes: back.val.appearanceShapes && { live: back.val.appearanceShapes.live, mode: back.val.appearanceShapes.mode },
  totals: { exportKeys: Object.keys(flat).length, matched: ok.length, differ: diff.length, notInSpec: notInSpec.length }, diff, notInSpec, errors: errors.slice(0, 8) };
console.log(JSON.stringify(out, null, 1));
await browser.close();
