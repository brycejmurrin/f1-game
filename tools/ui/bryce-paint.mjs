#!/usr/bin/env node
// @doc Owner-phone acceptance: PAINTED text/tap sizes, safe box, page scroll per window × UI SIZE; measure or check.
// bryce-paint.mjs — the measuring half of tests/specs/bryce-phone-paint.spec.js (issue #5262).
//
//   node tools/ui/bryce-paint.mjs                                  # every cell: 3 windows × UI SIZE 61/109/51/40 × 7 screens
//   node tools/ui/bryce-paint.mjs --window standalone --ui-scale 61 --screens title,settings
//   node tools/ui/bryce-paint.mjs --check                          # compare with tests/data/bryce-phone-paint.json; exit 1 on a difference
//   node tools/ui/bryce-paint.mjs --write                          # record the measured counts as the ceilings (only ever lower one by hand or by this)
//   --profile live|legacy   --no-profile   --json   --verbose (list every offender, not the first five)
//
// The spec and this CLI share `measureCell`, so a ceiling measured here is the number CI asserts. It starts a browser:
// parent session only, one browser at a time (AGENTS.md rule 5). A ceiling is an EXACT count of today's violations
// (tools/lib/paint-floor.mjs `judgePaint` fails above and below it): it can only ratchet down. Never raise one to get
// green; a rise is a regression to fix in the game.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { strictFlags, makeFlags } from "../lib/cli-args.mjs";
import { BRYCE_WINDOWS, UI_SIZE_AXIS, openBrycePhone, readBackInPage, mismatches } from "../lib/bryce-phone.mjs";
import { measurePaintInPage, summarisePaint, paintCounts, paintLine, judgePaint, PAINT_KINDS } from "../lib/paint-floor.mjs";
import { getScreen } from "./menu-screens.mjs";
import { resetToTitleState } from "./ui-reset.mjs";
import { menuReady, previewMapSettled } from "./menu-readiness.mjs";

const ROOT = fileURLToPath(new URL("../..", import.meta.url));
export const CEILINGS_FILE = "tests/data/bryce-phone-paint.json";
/** The screens the owner meets every session, menu screens first (the three in-race ones share one race build). */
export const ACCEPT_SCREENS = Object.freeze(["title", "select", "garage", "settings", "hud", "pause", "results"]);
const MENU = new Set(["title", "select", "garage", "settings"]);
/** What each screen measures: the sheet's own root; the race HUD is everything on screen (its buttons are body children). */
export const ACCEPT_ROOTS = Object.freeze({ title: "#overlay", select: "#select", garage: "#carsetup", settings: "#pmsettings", hud: "body", pause: "#pausemenu", results: "#results" });
export const cellKey = (window, uiScale) => `${window}@${uiScale}`;

export const USAGE = `usage: node tools/ui/bryce-paint.mjs [--window standalone,safari,w844] [--ui-scale 61,109,51,40] [--screens title,select,garage,settings,hud,pause,results]
                                     [--profile live|legacy] [--no-profile] [--check | --write] [--json] [--verbose]
  Painted sizes on Bryce's phone (tools/lib/bryce-phone.mjs + tools/lib/paint-floor.mjs): text >= 12 px, taps >= 44 px, nothing outside
  the safe box, no page scroll. --check compares with ${CEILINGS_FILE} (exit 1 on any difference); --write records the counts.
  Starts ONE browser (parent session only).`;
export const KNOWN = ["--window", "--ui-scale", "--screens", "--profile", "--no-profile", "--check", "--write", "--json", "--verbose"];

/** argv → the run plan. Pure; throws on a bad value. */
export function planRun(flags) {
  const csv = (name, all) => { const v = flags.flag(name); return v ? String(v).split(",").filter(Boolean) : [...all]; };
  const windows = csv("--window", Object.keys(BRYCE_WINDOWS));
  for (const w of windows) if (!BRYCE_WINDOWS[w]) throw new Error(`--window: unknown "${w}" (${Object.keys(BRYCE_WINDOWS).join(" | ")})`);
  const scales = csv("--ui-scale", UI_SIZE_AXIS).map((s) => { const n = Number(s); if (!Number.isFinite(n) || n < 40 || n > 200) throw new Error(`--ui-scale: "${s}" is not a percent in [40, 200]`); return n; });
  const screens = csv("--screens", ACCEPT_SCREENS);
  for (const s of screens) if (!ACCEPT_SCREENS.includes(s)) throw new Error(`--screens: unknown "${s}" (${ACCEPT_SCREENS.join(" | ")})`);
  if (flags.has("--check") && flags.has("--write")) throw new Error("--check and --write are exclusive");
  return { windows, scales, screens: ACCEPT_SCREENS.filter((s) => screens.includes(s)), profile: flags.has("--no-profile") ? false : (flags.flag("--profile") || true) };
}

export function readCeilings(root = ROOT) {
  return JSON.parse(fs.readFileSync(path.join(root, CEILINGS_FILE), "utf8"));
}

/**
 * Pure: every difference between measured cells and the ceilings file. `measured` is { [cellKey]: { [screen]: paint } }.
 * A measured screen with no recorded ceiling is judged against the hard floor (all zero).
 */
export function judgeCells(measured, ceilings) {
  const out = [];
  for (const [cell, screens] of Object.entries(measured)) {
    for (const [screen, paint] of Object.entries(screens)) {
      const label = `${cell} ${screen}`;
      if (paint.error) { out.push(`${label}: not measured — ${paint.error}`); continue; }
      if (!paint.taps.n) out.push(`${label}: no control was measured (the screen did not open, or its root moved)`);
      out.push(...judgePaint(paint, ceilings?.cells?.[cell]?.[screen] || {}, label));
    }
  }
  return out;
}

const settle = (page, ms) => page.waitForTimeout(ms);

async function measureRoot(page, screen, preset) {
  const raw = await page.evaluate(measurePaintInPage, { roots: ACCEPT_ROOTS[screen], insets: preset.insets });
  if (!raw.rootsVisible) return { error: `root ${ACCEPT_ROOTS[screen]} is not visible` };
  return { ...summarisePaint(raw), raw };
}

/**
 * One cell: boot the working tree on the preset, open each screen the way a player reaches it, measure its paint.
 * The caller owns `browser`. Returns { preset, readBack, mismatches, hudScale, screens: { [id]: paint | { error } } }.
 */
export async function measureCell(browser, baseUrl, { window = "standalone", uiScale = null, profile = true, screens = ACCEPT_SCREENS, log = () => {} } = {}) {
  const { context, page, preset } = await openBrycePhone(browser, { window, dpr: 1, uiScale, profile });
  // What tests/helpers/fixtures.js pins for every spec: the GLX backend (cheapest under SwiftShader) and test mode.
  await context.addInitScript(() => { window.__TEST_MODE = true; try { localStorage.setItem("apex26.gfxBackend", "webgl2"); } catch (_) { /* storage refused */ } });
  const out = { preset: preset.name, uiScale: preset.uiScale, screens: {} };
  try {
    await page.goto(baseUrl, { waitUntil: "domcontentloaded", timeout: 90000 });
    await page.waitForFunction(() => window.__apex && window.__apex.race, null, { polling: 100, timeout: 60000 });
    // Geometry, not frames: stop render() so every wait and evaluate below is not behind a SwiftShader frame.
    await page.evaluate(() => window.__apex.headless(true));
    page.setDefaultTimeout(15000);
    out.readBack = await page.evaluate(readBackInPage);
    out.mismatches = mismatches({ ...preset, deviceScaleFactor: 1 }, out.readBack);
    out.applied = { uiScale: out.readBack.uiScaleVar, hudScale: out.readBack.hudScaleVar };
    for (const id of screens.filter((s) => MENU.has(s))) {
      try {
        await resetToTitleState(page, { tag: `${id} ${preset.name}`, log: null });
        await settle(page, 200);
        const screen = getScreen(id);
        await screen.open(page);
        await page.waitForFunction(menuReady, screen.root, { polling: 100, timeout: 5000 }).catch(() => {});
        if (id === "select") await page.waitForFunction(previewMapSettled, null, { polling: 100, timeout: 5000 }).catch(() => {});
        await settle(page, 400);
        out.screens[id] = await measureRoot(page, id, preset);
      } catch (e) { out.screens[id] = { error: String(e.message || e).split("\n")[0].slice(0, 160) }; }
      log(id, out.screens[id]);
    }
    const race = screens.filter((s) => !MENU.has(s));
    if (race.length) {
      try {
        await resetToTitleState(page, { tag: `race ${preset.name}`, log: null });
        await page.evaluate(async () => { await window.__apex.race("monza", null, null, { grid: "tier" }); });
        await page.waitForFunction(() => window.__apex.info().track === "monza", null, { polling: 100, timeout: 90000 });
        // Freeze the sim in the same tick as the start: otherwise the field keeps racing through the HUD and pause
        // measurements for however long this box takes, and which cars have crossed the line when finishRace() stamps
        // the field decides which results rows carry a gap span (CI 2026-11-10: safari@40 results 34 vs 35 locally).
        // The HUD probes freeze the same way (hud.js updateHud); jump() refreshes the HUD with force.
        await page.evaluate(() => { window.__apex.go(); window.__apex.jump(0.2, 45); window.__apex.snapCam(); window.__apex.freeze(true); });
        await page.waitForSelector("#hud:not([hidden])", { timeout: 15000 });
        await settle(page, 800);
      } catch (e) {
        const error = `race did not start: ${String(e.message || e).split("\n")[0].slice(0, 140)}`;
        for (const id of race) { out.screens[id] = { error }; log(id, out.screens[id]); }
        race.length = 0;
      }
      for (const id of race) {
        try {
          if (id === "pause") {
            await page.evaluate(() => document.getElementById("pausebtn").click());
            await page.waitForSelector("#pausemenu:not([hidden])", { timeout: 8000 });
            await page.waitForFunction(menuReady, "#pausemenu", { polling: 100, timeout: 5000 }).catch(() => {});
            await settle(page, 400);
          } else if (id === "results") {
            await page.evaluate(() => { const r = document.getElementById("pm-resume"); const pm = document.getElementById("pausemenu"); if (r && pm && !pm.hidden) r.click(); });
            await settle(page, 300);
            await page.evaluate(() => { window.__apex.go(); window.__apex.setLap(3); window.__apex.finishRace(); });
            await page.waitForSelector("#results:not([hidden])", { timeout: 30000 });
            await page.waitForFunction(menuReady, "#results", { polling: 100, timeout: 5000 }).catch(() => {});
            await settle(page, 600);
          }
          out.screens[id] = await measureRoot(page, id, preset);
        } catch (e) { out.screens[id] = { error: String(e.message || e).split("\n")[0].slice(0, 160) }; }
        log(id, out.screens[id]);
      }
    }
  } finally { await context.close().catch(() => {}); }
  return out;
}

/** Pure: measured cells → the ceilings file body (counts only; offenders stay in the run's own output). */
export function ceilingsFrom(measured, prev = {}) {
  const cells = { ...(prev.cells || {}) };
  for (const [cell, screens] of Object.entries(measured)) {
    cells[cell] = { ...(cells[cell] || {}) };
    for (const [screen, paint] of Object.entries(screens)) if (!paint.error) cells[cell][screen] = paintCounts(paint);
  }
  return {
    doc: "Owner-phone acceptance ceilings (issue #5262): the EXACT number of painted-size violations per cell (window@UI SIZE) and screen, measured by `node tools/ui/bryce-paint.mjs --write` and asserted by tests/specs/bryce-phone-paint.spec.js. taps = controls painting under 44 px; text = text nodes painting under 12 px; outside = items crossing the safe box; blocked = controls covered at their centre; scroll = the page scrolls. A count may only go DOWN (the spec fails above and below it). The small-UI-SIZE reds wait on decision #5235. Never raise a number to get green.",
    floors: { tap: 44, text: 12 },
    kinds: [...PAINT_KINDS],
    cells: Object.fromEntries(Object.keys(cells).sort().map((k) => [k, cells[k]])),
  };
}

async function main(argv) {
  const flags = makeFlags(argv, KNOWN);
  const plan = planRun(flags);
  const { launchChromium, startStaticServer, shutdown } = await import("../lib/harness.mjs");
  const srv = await startStaticServer(ROOT);
  const browser = await launchChromium({ args: ["--use-angle=swiftshader"] });
  const measured = {}, runs = [];
  const verbose = flags.has("--verbose");
  try {
    for (const window of plan.windows) for (const uiScale of plan.scales) {
      const key = cellKey(window, uiScale);
      const t0 = Date.now();
      const cell = await measureCell(browser, srv.url, { window, uiScale, profile: plan.profile, screens: plan.screens,
        log: (id, p) => { if (!flags.has("--json")) console.log(`${key} ${id}: ${p.error ? "NOT MEASURED — " + p.error : paintLine(p)}`); } });
      if (cell.mismatches?.length) console.log(`${key}: emulation mismatch — ${cell.mismatches.join("; ")}`);
      if (!flags.has("--json")) console.log(`${key}: applied --ui-scale ${cell.applied?.uiScale ?? "unset"}, --hud-scale ${cell.applied?.hudScale ?? "unset (default)"} (${((Date.now() - t0) / 1000).toFixed(0)} s)`);
      if (verbose) for (const [id, p] of Object.entries(cell.screens)) if (!p.error) {
        const side = (t) => Math.min(t.w, t.h);
        for (const t of p.raw.taps.filter((x) => side(x) < 43.5)) console.log(`  ${key} ${id} tap ${t.el} ${t.w}x${t.h}`);
        for (const t of p.raw.texts.filter((x) => x.px < 11.5)) console.log(`  ${key} ${id} text ${t.el} ${t.px}px "${t.text}"`);
        for (const o of p.raw.outside) console.log(`  ${key} ${id} outside ${o.el} ${o.kind} at ${o.at}`);
        for (const b of p.raw.blocked) console.log(`  ${key} ${id} blocked ${b.el} under ${b.by} at ${b.at}`);
      }
      measured[key] = Object.fromEntries(Object.entries(cell.screens).map(([id, p]) => { const { raw, ...rest } = p; return [id, rest]; }));
      runs.push({ cell: key, applied: cell.applied, mismatches: cell.mismatches });
    }
  } finally { await browser.close().catch(() => {}); await srv.close?.(); shutdown?.(); }
  const file = path.join(ROOT, CEILINGS_FILE);
  const prev = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")) : {};
  const unmeasured = Object.entries(measured).flatMap(([c, s]) => Object.entries(s).filter(([, p]) => p.error).map(([id, p]) => `${c} ${id}: ${p.error}`));
  if (flags.has("--json")) console.log(JSON.stringify({ measured, runs }, null, 2));
  if (flags.has("--write")) {
    if (unmeasured.length) { console.log(`= bryce-paint: NOT written — ${unmeasured.length} screen(s) were not measured: ${unmeasured.join("; ")}`); return 1; }
    fs.writeFileSync(file, JSON.stringify(ceilingsFrom(measured, prev), null, 2) + "\n");
    console.log(`= bryce-paint: wrote ${Object.keys(measured).length} cell(s) to ${CEILINGS_FILE}`);
    return 0;
  }
  if (flags.has("--check")) {
    const bad = judgeCells(measured, prev);
    for (const b of bad) console.log(b);
    console.log(bad.length ? `= bryce-paint: ${bad.length} difference(s) from ${CEILINGS_FILE}` : `= bryce-paint: ${Object.keys(measured).length} cell(s) hold their ceilings`);
    return bad.length ? 1 : 0;
  }
  console.log(unmeasured.length ? `= bryce-paint: measured, ${unmeasured.length} screen(s) failed to open` : `= bryce-paint: measured ${Object.keys(measured).length} cell(s) (no --check / --write)`);
  return unmeasured.length ? 1 : 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const argv = process.argv.slice(2);
  strictFlags(argv, KNOWN, USAGE);
  try { process.exit(await main(argv)); } catch (e) { console.error(`bryce-paint: ${e.message}`); process.exit(2); }
}
