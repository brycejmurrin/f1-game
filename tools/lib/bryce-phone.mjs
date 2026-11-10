// @doc ONE "Bryce's phone" preset for every UI tool and spec: window, DPR, safe-area insets, UA, his settings export.
// bryce-phone.mjs — the owner's iPhone as an emulation recipe, in one place (2026-11-10, docs/notes/TOOLING-HUNT-2026-11-09.md).
//
// WHY: the same phone was spelled six ways. tools/ui/menu-screens.mjs used DPR 2 and no insets, css-play.mjs 852x393
// with no insets, probe-sheets-contract.mjs windows A/C/D, tests/helpers/title-fit.mjs a Safari cell with 67 px side
// insets where the UI contract says 59, tools/lib/ui-device-profile.mjs defaults a touch probe to "iPhone 13"
// (844x390, no notch, an empty profile), and tools/mcp/browser-http.mjs has its own table. A report measured in one
// of them did not reproduce in another, and none of them carried his settings.
//
// WHAT IS MEASURED AND WHAT IS NOT (the geometry truth hunt note on PR #5216): the `standalone` window
// (852x393 CSS px, DPR 3, env() insets left 59 / right 59 / bottom 21 / top 0) is the Chromium emulation that hunt
// booted and read back; no real device has confirmed it yet (issue #5218, the phone-bridge `geom` command). The
// `safari` window is the UI contract's cell C and is UNVERIFIED on both height and insets. `display-mode: standalone`
// cannot be emulated through CDP; no CSS rule keys on it. The profile is tests/data/settings-defaults-export.json,
// exported 2026-10-05: #5218 records that it does not reproduce his 2026-11-09 pause screenshot, so `uiScale`
// overrides it when a report names an effective UI SIZE.
//
//   import { brycePhone, openBrycePhone } from "../lib/bryce-phone.mjs";
//   const { context, page, preset } = await openBrycePhone(browser, { window: "standalone" });   // then page.goto(...)
//   node tools/ui/bryce-phone.mjs            # the preset as JSON; --measure boots a page and reads it back
import fs from "node:fs";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("../..", import.meta.url));
export const OWNER_EXPORT = "tests/data/settings-defaults-export.json";
export const STORE_PREFIX = "apex26.";

/** The windows his phone shows the game in. `verified` names what confirmed the numbers. */
export const BRYCE_WINDOWS = Object.freeze({
  standalone: Object.freeze({ width: 852, height: 393, insets: Object.freeze({ top: 0, left: 59, bottom: 21, right: 59 }),
    verified: "Chromium emulation read-back (PR #5216); real device pending #5218" }),
  safari: Object.freeze({ width: 852, height: 283, insets: Object.freeze({ top: 0, left: 59, bottom: 0, right: 59 }),
    verified: "UNVERIFIED: UI contract cell C; tests/helpers/title-fit.mjs uses 67/21/67 (#5218)" }),
});
export const BRYCE_DPR = 3;
/** A screenshot of the standalone window is 2556x1179 device px; the app he sends them through downscales to 2000x923. */
export const SHOT_ASPECT_TOLERANCE = 0.012;

/** His export as the store keys a boot writes: `json` through store.set (JSON), `raw` verbatim; null = unset. Pure. */
export function ownerStore({ root = ROOT, exportJson = null, specSource = null } = {}) {
  const exp = exportJson || JSON.parse(fs.readFileSync(root + OWNER_EXPORT, "utf8"));
  const spec = specSource ?? fs.readFileSync(root + "js/ui/settings-export.js", "utf8");
  const rawKeys = new Set([...spec.matchAll(/k: "([^"]+)", lane: "raw"/g)].map((m) => m[1]));
  const out = { json: {}, raw: {} };
  for (const group of Object.values(exp.settings || {})) {
    for (const [k, v] of Object.entries(group)) { if (v === null) continue; (rawKeys.has(k) ? out.raw : out.json)[k] = v; }
  }
  return { store: out, userAgent: exp.device?.userAgent || null, exportedAt: exp.exportedAt || null };
}

/** The localStorage entries (key → string) `store` boots with. Pure. */
export function storeEntries(store) {
  const out = {};
  for (const [k, v] of Object.entries(store.json || {})) out[STORE_PREFIX + k] = JSON.stringify(v);
  for (const [k, v] of Object.entries(store.raw || {})) out[STORE_PREFIX + k] = String(v);
  return out;
}

/**
 * The preset. Pure apart from reading the export.
 * @param {{ window?: "standalone"|"safari", dpr?: number, profile?: boolean, uiScale?: number|null, root?: string }} [o]
 *   `dpr` below 3 is for a software-GL box (at DPR 3 the 10 Hz HUD tick starves here: measure HUD fit at 1 or under
 *   `__apex.headless(true)`); CSS geometry does not depend on it. `uiScale` (percent) overrides the export's UI SIZE.
 */
export function brycePhone({ window = "standalone", dpr = BRYCE_DPR, profile = true, uiScale = null, root = ROOT } = {}) {
  const win = BRYCE_WINDOWS[window];
  if (!win) throw new Error(`bryce-phone: unknown window "${window}" (${Object.keys(BRYCE_WINDOWS).join(" | ")})`);
  if (!Number.isFinite(dpr) || dpr <= 0 || dpr > 4) throw new Error("bryce-phone: dpr must be in (0, 4]");
  if (uiScale !== null && (!Number.isFinite(uiScale) || uiScale < 30 || uiScale > 300)) throw new Error("bryce-phone: uiScale is a percent in [30, 300]");
  const owner = profile ? ownerStore({ root }) : { store: { json: {}, raw: {} }, userAgent: null, exportedAt: null };
  const store = { json: { ...owner.store.json }, raw: { ...owner.store.raw } };
  if (uiScale !== null) store.json.uiScale = uiScale / 100;
  const userAgent = owner.userAgent || "Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.6.2 Mobile/15E148 Safari/604.1";
  return {
    name: `bryce-${window}`, window, verified: win.verified,
    viewport: { width: win.width, height: win.height }, deviceScaleFactor: dpr, insets: { ...win.insets },
    contextOptions: { viewport: { width: win.width, height: win.height }, screen: { width: win.width, height: win.height },
      deviceScaleFactor: dpr, isMobile: true, hasTouch: true, userAgent },
    store, localStorage: storeEntries(store), profile: profile ? { file: OWNER_EXPORT, exportedAt: owner.exportedAt, uiScale: uiScale === null ? "export" : uiScale } : null,
    limits: "Chromium emulation: not WebKit, display-mode stays `browser`, no dynamic toolbar. Real-device numbers: phone-bridge `geom` (#5218).",
  };
}

/** In-page (addInitScript): write the profile before the first script reads it; once per origin, so a reload keeps edits. */
export function seedStoreInPage(entries) {
  try {
    if (localStorage.getItem("__bryce-phone-seeded")) return;
    for (const [k, v] of Object.entries(entries)) localStorage.setItem(k, v);
    localStorage.setItem("__bryce-phone-seeded", "1");
  } catch (_) { /* storage refused: the page boots fresh and readBack says so */ }
}

/**
 * A context + page on his phone: descriptor, seeded profile, and REAL env() insets through CDP
 * (Emulation.setSafeAreaInsetsOverride — what `env(safe-area-inset-*)` reads; injected tokens are not the same thing).
 * The caller navigates. Chromium only.
 */
export async function openBrycePhone(browser, opts = {}) {
  const preset = brycePhone(opts);
  const context = await browser.newContext(preset.contextOptions);
  await context.addInitScript(seedStoreInPage, preset.localStorage);
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  await cdp.send("Emulation.setSafeAreaInsetsOverride", { insets: preset.insets });
  return { context, page, cdp, preset };
}

/** In-page: what the page itself reports, to prove the emulation took (compare with `mismatches`). */
export function readBackInPage() {
  const probe = document.createElement("div");
  probe.style.cssText = "position:fixed;visibility:hidden;pointer-events:none;top:env(safe-area-inset-top,0px);left:env(safe-area-inset-left,0px);right:env(safe-area-inset-right,0px);bottom:env(safe-area-inset-bottom,0px)";
  document.documentElement.appendChild(probe);
  const r = probe.getBoundingClientRect();
  probe.remove();
  const css = getComputedStyle(document.documentElement);
  const stored = (k) => { try { return localStorage.getItem("apex26." + k); } catch (_) { return null; } };
  return {
    viewport: { width: innerWidth, height: innerHeight }, deviceScaleFactor: devicePixelRatio,
    insets: { top: Math.round(r.top), left: Math.round(r.left), bottom: Math.round(innerHeight - r.bottom), right: Math.round(innerWidth - r.right) },
    coarse: matchMedia("(pointer:coarse)").matches, hover: matchMedia("(hover:hover)").matches,
    standalone: matchMedia("(display-mode: standalone)").matches, userAgent: navigator.userAgent,
    uiScaleVar: css.getPropertyValue("--ui-scale").trim() || null, hudScaleVar: css.getPropertyValue("--hud-scale").trim() || null,
    stored: { uiScale: stored("uiScale"), hudScale: stored("hudScale"), hudBtnScale: stored("hudBtnScale"), textSize: stored("textSize"), steerMode: stored("steerMode"), camMode: stored("camMode") },
  };
}

/** What the page reported that the preset did not ask for. Pure; [] = the emulation took. */
export function mismatches(preset, got) {
  const out = [];
  if (got.viewport.width !== preset.viewport.width || got.viewport.height !== preset.viewport.height) out.push(`viewport ${got.viewport.width}x${got.viewport.height}, wanted ${preset.viewport.width}x${preset.viewport.height}`);
  if (Math.abs(got.deviceScaleFactor - preset.deviceScaleFactor) > 0.01) out.push(`devicePixelRatio ${got.deviceScaleFactor}, wanted ${preset.deviceScaleFactor}`);
  for (const side of ["top", "left", "bottom", "right"]) if (got.insets[side] !== preset.insets[side]) out.push(`env(safe-area-inset-${side}) ${got.insets[side]}, wanted ${preset.insets[side]}`);
  if (!got.coarse) out.push("(pointer: coarse) is false");
  for (const [k, v] of Object.entries(preset.localStorage)) {
    const short = k.slice(STORE_PREFIX.length);
    if (short in got.stored && got.stored[short] !== v) out.push(`stored ${short} = ${got.stored[short]}, seeded ${v}`);
  }
  return out;
}

/**
 * Which of his windows a screenshot shows, from its pixel size alone, and its px per CSS px. Pure.
 * 2000x923 → standalone at 2.347; a 2000x664 image → the Safari tab. `null` window = neither aspect (cropped, or another device).
 */
export function classifyShot(width, height) {
  if (!(width > 0 && height > 0)) throw new Error("classifyShot: width and height must be positive");
  const landscape = width >= height;
  const [w, h] = landscape ? [width, height] : [height, width];
  let best = null;
  for (const [name, win] of Object.entries(BRYCE_WINDOWS)) {
    const err = Math.abs(w / h - win.width / win.height) / (win.width / win.height);
    if (!best || err < best.err) best = { name, err, win };
  }
  const hit = best.err <= SHOT_ASPECT_TOLERANCE;
  return { window: hit ? best.name : null, orientation: landscape ? "landscape" : "portrait", pxPerCss: hit ? +(w / best.win.width).toFixed(4) : null,
    nearest: best.name, aspectError: +best.err.toFixed(4) };
}
