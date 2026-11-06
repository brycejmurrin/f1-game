// phone-layout-pin — the layout fingerprint of Bryce's phone (#5139).
// @doc Bryce's phone cell (852x393 standalone, his export): screen boxes + global tokens vs a blessed golden; `--update`.
//
// ONE cell, pinned: 852x393 landscape, the Home-Screen app (display-mode:
// standalone, safe-area insets 59/21/59), touch, Bryce's own settings export
// (tests/data/settings-defaults-export.json). For every screen below, the boxes
// of a few structural elements and the global tokens (root font, --ui-scale,
// --tap, the safe-area tokens, the HUD scales, body data-shape/data-density) are
// compared with tests/data/phone-layout-pin.json at a 1 px tolerance.
//
// It catches what the geometry audit does not ask about: a screen that MOVES
// (the Nov 4-5 sweep found the title cluster 34 px right of where it was, a
// wanted #5126 change that nothing had pinned) or a global token that changes
// under the whole UI. A failure names the screen, the element and the delta.
// A wanted change re-blesses the golden ON PURPOSE:
//   node tools/ui/phone-layout-pin.mjs --update [--url http://127.0.0.1:3456]
// and the PR says why (the blessed golden is reviewed like a pixel baseline).
// `--check` prints the comparison without the test runner.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const PIN_FILE = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "tests", "data", "phone-layout-pin.json");
export const CELL = Object.freeze({ width: 852, height: 393, insets: Object.freeze({ top: 0, right: 59, bottom: 21, left: 59 }), displayMode: "standalone" });
export const TOL = 1;
export const GLOBAL_VARS = Object.freeze(["--ui-scale", "--tap", "--tap-hud", "--safe-t", "--safe-r", "--safe-b", "--safe-l", "--hud-scale", "--hud-btn-scale"]);

/** Screen → the structural boxes pinned there. `@ltw` pins left/top/width only
 *  (a panel whose HEIGHT grows with every row added would otherwise re-bless
 *  on every appearance change). Each screen's `open` leaves the page on it. */
export const SCREENS = Object.freeze([
  { id: "title", sel: ["#overlay", "#menu-brand", "#title", "#tc-frame", "#menu-buttons", "#mb-career", "#mb-race", "#mb-settings", "#menu-secondary"],
    open: async () => {} },
  { id: "select", sel: ["#select", "#sel-inner", "#sel-body", "#sel-hero", "#sel-tracks", "#sel-track-filter", "#sel-go"],
    open: async (p) => { await click(p, "mb-race"); await shown(p, "select"); await p.waitForFunction(() => document.querySelectorAll("#sel-tracks .track-row").length > 5, null, { polling: 100, timeout: 30000 }); } },
  { id: "garage", sel: ["#carsetup", "#cs-inner", "#cs-header", "#cs-tabs", "#cs-options", "#cs-stack", "#cs-done"],
    open: async (p) => { await garageTab(p, "engine"); } },
  { id: "career", sel: ["#career", "#cr-inner", "#cr-header", "#cr-left", "#cr-right", "#cr-foot", "#cr-back"],
    open: async (p) => { await click(p, "mb-career"); await shown(p, "career"); } },
  { id: "season-setup", sel: ["#season-setup", "#ss-inner", "#ss-cal", "#ss-pool"],
    open: async (p) => { await click(p, "mb-season"); await shown(p, "select"); await click(p, "sel-customise"); await shown(p, "season-setup"); } },
  { id: "howtoplay", sel: ["#howtoplay", "#howtoplay-inner", "#htp-contents"],
    open: async (p) => { await click(p, "mb-help"); await shown(p, "howtoplay"); } },
  { id: "settings", sel: ["#pmsettings", "#pmsettings-inner", "#pm-settings-body", "#pm-settings-index", "#pm-open-appearance", "#pm-open-a11y", "#pm-settings-close"],
    open: async (p) => { await click(p, "mb-settings"); await shown(p, "pmsettings"); } },
  { id: "settingsappearance", sel: ["#pmsettings-inner", "#pm-panel-appearance@ltw", "#appearance-studio@ltw"],
    open: async (p) => { await click(p, "mb-settings"); await shown(p, "pmsettings"); await click(p, "pm-open-appearance"); await shown(p, "pm-panel-appearance"); await p.waitForSelector("#appearance-studio", { state: "attached", timeout: 30000 }); } },
  { id: "settingsdisplay", sel: ["#pm-panel-display@ltw", "#pm-hud-sample"],
    open: async (p) => { await click(p, "mb-settings"); await shown(p, "pmsettings"); await click(p, "pm-open-display"); await shown(p, "pm-panel-display"); } },
  { id: "racesettings", sel: ["#race-settings", "#rs-body", "#rs-presets", "#rs-go"],
    open: async (p) => { await click(p, "mb-race"); await shown(p, "select"); await click(p, "sel-go"); await shown(p, "race-settings"); } },
  { id: "teampicker", sel: ["#teampicker", "#sel-teams"],
    open: async (p) => { await garageTab(p, "team"); await p.waitForSelector("#cs-team-card", { state: "attached", timeout: 30000 }); await click(p, "cs-team-card"); await shown(p, "teampicker"); } },
  { id: "hud", sel: ["#hud", "#hud-dock", "#dock-left", "#dock-right", "#btn-brake", "#btn-throttle", "#minimap", "#hud-box-time", "#pausebtn", "#btn-cam"],
    open: async (p) => {
      await p.evaluate(() => {
        const $ = (id) => document.getElementById(id);
        if (typeof SurveyHud === "undefined") throw new Error("SurveyHud missing");
        SurveyHud.apply({ $, document, els: { overlay: $("overlay"), hud: $("hud"), pausebtn: $("pausebtn"), btnCam: $("btn-cam"), pausemenu: $("pausemenu") } });
      });
      await shown(p, "hud"); } },
]);
const click = (p, id) => p.evaluate((id) => { const e = document.getElementById(id); if (!e) throw new Error("#" + id + " missing"); e.click(); }, id);
// The garage, the player's way (tools/ui/menu-screens.mjs openGarageTab): the door, the settled sheet, the exact tab.
async function garageTab(p, tab) {
  await click(p, "mb-garage");
  await p.waitForSelector('#carsetup:not([hidden]):not([aria-busy="true"])', { timeout: 30000 });
  await p.waitForSelector(`#cs-tab-${tab}`, { state: "attached", timeout: 30000 });
  await click(p, `cs-tab-${tab}`);
  await p.waitForSelector(`#cs-tab-${tab}[aria-selected="true"]`, { timeout: 30000 });
  await p.waitForSelector(`#cs-options[aria-labelledby="cs-tab-${tab}"] > *`, { state: "attached", timeout: 30000 });
}
const shown = (p, id) => p.waitForFunction((id) => { const e = document.getElementById(id); return !!e && !e.hidden && e.getBoundingClientRect().width > 0; }, id, { polling: 100, timeout: 30000 });

/** Runs IN THE PAGE: the fingerprint of the screen it is on. */
export function readFingerprint({ sels, vars }) {
  const de = document.documentElement, b = document.body, cs = getComputedStyle(de);
  const r2 = (n) => Math.round(n * 2) / 2;
  const globals = { fontSize: cs.fontSize, inner: innerWidth + "x" + innerHeight, shape: b.getAttribute("data-shape"), density: b.getAttribute("data-density") || "", standalone: !!(navigator.standalone || matchMedia("(display-mode: standalone)").matches) };   // the game's own test (js/ui/platform-session.js)
  for (const v of vars) globals[v] = cs.getPropertyValue(v).trim();
  const boxes = {};
  for (const s of sels) {
    const [q, mode] = s.split("@");
    const e = document.querySelector(q);
    if (!e || e.closest("[hidden]")) { boxes[s] = null; continue; }
    const r = e.getBoundingClientRect();
    boxes[s] = mode === "ltw" ? [r2(r.left), r2(r.top), r2(r.width)] : [r2(r.left), r2(r.top), r2(r.width), r2(r.height)];
  }
  return { globals, boxes };
}

/** Golden vs measured: the mismatches, as lines. Empty = pinned. */
export function compareFingerprint(screen, want, got, tol = TOL) {
  const out = [];
  if (!want) return [`${screen}: not in the golden (re-bless with --update)`];
  for (const k in want.globals) if (String(want.globals[k]) !== String(got.globals[k])) out.push(`${screen} global ${k}: ${want.globals[k]} -> ${got.globals[k]}`);
  for (const s in want.boxes) {
    const a = want.boxes[s], g = got.boxes[s];
    if (!a || !g) { if (!!a !== !!g) out.push(`${screen} ${s}: ${a ? "present" : "absent"} -> ${g ? "present" : "absent"}`); continue; }
    const d = a.map((v, i) => g[i] - v);
    if (d.some((n) => Math.abs(n) > tol)) out.push(`${screen} ${s}: [${a.join(",")}] -> [${g.join(",")}] (d ${d.map((n) => (n > 0 ? "+" : "") + n).join(",")})`);
  }
  return out;
}

/** Boot the cell on `page` (a context made by `contextOptions()`), seed the export, open each screen, measure. */
export async function measureAll(page, { baseUrl = "", bootMs = 60000, only = null } = {}) {
  // The Home-Screen app, both ways the game asks (js/ui/platform-session.js): iOS's navigator.standalone and the
  // display-mode media feature. Before the first boot, so the install banner and every standalone branch see it.
  await page.context().addInitScript(() => { try { Object.defineProperty(navigator, "standalone", { value: true, configurable: true }); } catch (_) { /* read-only */ } });
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Emulation.setSafeAreaInsetsOverride", { insets: CELL.insets });
  await cdp.send("Emulation.setEmulatedMedia", { features: [{ name: "display-mode", value: CELL.displayMode }] });
  const boot = async () => {
    await page.goto(baseUrl + "/?apex", { waitUntil: "domcontentloaded", timeout: 90000 });
    await page.waitForFunction(() => window.__apex && window.__apex.race && typeof SettingsExport !== "undefined" && document.body.dataset.shape && !document.getElementById("overlay").hidden, null, { polling: 100, timeout: bootMs });
    await page.evaluate(() => window.__apex.headless(true));
    // Playwright re-sends its own emulated-media features on navigation; restate display-mode for the page that booted.
    await cdp.send("Emulation.setEmulatedMedia", { features: [{ name: "display-mode", value: CELL.displayMode }] });
  };
  await boot();
  const applied = await page.evaluate(async () => { const f = await (await fetch("/tests/data/settings-defaults-export.json")).json(); return SettingsExport.applySettings(f); });
  if (!applied || !applied.ok) throw new Error("Bryce's export did not apply: " + JSON.stringify(applied).slice(0, 200));
  const out = {};
  for (const scr of SCREENS) {
    if (only && !only.includes(scr.id)) continue;
    await boot();
    await page.waitForTimeout(500);
    await scr.open(page);
    await page.waitForTimeout(500);
    out[scr.id] = await page.evaluate(readFingerprint, { sels: scr.sel, vars: GLOBAL_VARS });
  }
  return out;
}
export function contextOptions(devices) {
  return { ...devices["iPhone 15 Pro landscape"], viewport: { width: CELL.width, height: CELL.height }, screen: { width: CELL.width, height: CELL.height }, deviceScaleFactor: 1, hasTouch: true, isMobile: true };
}
export const readGolden = () => JSON.parse(fs.readFileSync(PIN_FILE, "utf8"));

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const args = Object.fromEntries(process.argv.slice(2).map((a) => { const [k, ...v] = a.replace(/^--/, "").split("="); return [k, v.join("=") || "1"]; }));
  const baseUrl = args.url || "http://127.0.0.1:3456";
  const { chromium, devices } = await import("playwright");
  const browser = await chromium.launch();
  const page = await (await browser.newContext(contextOptions(devices))).newPage();
  const got = await measureAll(page, { baseUrl, only: args.screens ? args.screens.split(",") : null });
  await browser.close();
  if (args.update) {
    const prev = fs.existsSync(PIN_FILE) ? readGolden() : { cell: CELL, screens: {} };
    fs.writeFileSync(PIN_FILE, JSON.stringify({ cell: CELL, export: "tests/data/settings-defaults-export.json", screens: Object.assign(prev.screens || {}, got) }, null, 1) + "\n");
    console.log("blessed", PIN_FILE, Object.keys(got).length, "screens");
  } else {
    const golden = readGolden(); let bad = 0;
    for (const id in got) { const lines = compareFingerprint(id, golden.screens[id], got[id]); bad += lines.length; console.log(lines.length ? lines.join("\n") : `${id}: pinned`); }
    process.exit(bad ? 1 : 0);
  }
}
