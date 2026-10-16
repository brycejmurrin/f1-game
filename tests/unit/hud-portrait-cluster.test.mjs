/* hud-portrait-cluster — phone-portrait bottom readout stack must not pile
   TYRES / PLAN onto GEAR, or grow the gear box into AERO/OT. Pins the CSS
   scope (tyre dock-anchor is landscape-only; portrait shrinks gear children)
   and the measured clash shapes from the 2026-10-07 tip survey (390×844
   chase @150%: gearbox×tyre 12499px², gearbox×btn-aero). */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { analyzeOverlap, overlapArea } from "../../tools/lib/hud-geometry.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const CSS = fs.readFileSync(path.join(ROOT, "css/hud.css"), "utf8");
const HUD_JS = fs.readFileSync(path.join(ROOT, "js/ui/hud.js"), "utf8");

const box = (key, role, x, y, w, h, round = false) => ({
  key, role, visible: true, exists: true,
  x, y, r: x + w, b: y + h, w, h,
  round, cx: x + w / 2, cy: y + h / 2, rr: w / 2, contains: [],
});

test("CSS: touch TYRES dock-anchor is landscape-only (portrait stays in stack)", () => {
  // The absolute+anchor rule used to be unscoped; portrait ladder buttons are
  // position:fixed so #dock-left collapses and TYRES landed on GEAR.
  assert.match(CSS,
    /@supports\s*\(anchor-name:\s*--a\)\s*\{[\s\S]*?@media\s*\(orientation:\s*landscape\)\s*\{[\s\S]*?#hud-tyre\s*\{[\s\S]*?position:\s*absolute/,
    "TYRES absolute+anchor lives under orientation:landscape");
  assert.doesNotMatch(CSS,
    /@supports\s*\(anchor-name:\s*--a\)\s*\{\s*body:not\(\.desktop\) #hud-tyre\s*\{/,
    "TYRES absolute must not apply outside the landscape media query");
});

test("CSS: portrait phone parks TYRES above the bottom stack", () => {
  assert.match(CSS,
    /@media\s*\(orientation:\s*portrait\)\s*and\s*\(max-width:\s*500px\)\s*\{[\s\S]*?#hud-tyre\s*\{[\s\S]*?bottom:\s*calc\(100%\s*\+\s*4px\)/,
    "portrait TYRES sits above .hud-bottom (out of flow)");
  assert.match(CSS,
    /@media\s*\(orientation:\s*portrait\)\s*and\s*\(max-width:\s*500px\)\s*\{[\s\S]*?#hud-gear\s*\{[\s\S]*?min\(58px,\s*14vw\)/,
    "portrait phone caps the gear numeral with min(58px, 14vw)");
});

test("fitHud: portrait path caps --hud-z-bot against the side button columns", () => {
  assert.match(HUD_JS, /matchMedia\("\(orientation: portrait\)"\)/,
    "fitHud asks orientation:portrait for the bottom-band width budget");
  assert.match(HUD_JS, /capBot = Math\.min\(capBot, room \/ bottom\)/,
    "portrait fitHud budgets the cluster width between left/right columns");
  assert.match(HUD_JS, /querySelectorAll\("\.touchbtn, \.shiftbtn, \.steerbtn"\)/,
    "portrait width budget reads dock discs without dynamic getElementById");
});

test("CSS: portrait phone left-aligns the tower so it cannot cover #hud-sectors", () => {
  assert.match(CSS,
    /@media\s*\(orientation:\s*portrait\)\s*and\s*\(max-width:\s*500px\)\s*\{[\s\S]*?\.hud-top\s*\{[\s\S]*?flex-wrap:\s*wrap/,
    "portrait .hud-top wraps and leaves the right column for #hud-sectors");
  assert.match(CSS,
    /@media\s*\(orientation:\s*portrait\)\s*and\s*\(max-width:\s*500px\)\s*\{[\s\S]*?\.hud-top\s*\{[\s\S]*?max-width:\s*calc\(100vw/,
    "portrait .hud-top max-width reserves the sector plate");
});

test("CSS: portrait phone floors tower labels and sector times at 10 CSS px", () => {
  assert.match(CSS,
    /@media\s*\(orientation:\s*portrait\)\s*and\s*\(max-width:\s*500px\)\s*\{[\s\S]*?#hud-sectors[\s\S]*?font-size:\s*max\(\s*var\(--fs-micro\),\s*calc\(var\(--fs-micro\)\s*\/\s*1\.4\s*\/\s*var\(--hud-z,\s*1\)\)\)/,
    "portrait #hud-sectors / .sec-* use max(--fs-micro, --fs-micro/1.4/--hud-z)");
  assert.match(CSS,
    /@media\s*\(orientation:\s*portrait\)\s*and\s*\(max-width:\s*500px\)\s*\{[\s\S]*?\.hud-top \.hud-label[\s\S]*?var\(--fs-micro\)\s*\/\s*1\.4\s*\/\s*var\(--hud-z/,
    "portrait tower labels share the 10 CSS px floor (--fs-micro/1.4)");
});

test("fitHud: portrait top-band capFor stacks the map under the tower and floors --hud-z-top", () => {
  const fit = HUD_JS.slice(HUD_JS.indexOf("function fitHud("), HUD_JS.indexOf("function paintInstruments"));
  assert.match(fit, /portraitPhone/,
    "fitHud names a portraitPhone flag for the stacked budget");
  assert.match(fit, /orientation:\s*portrait\)\s*and\s*\(max-width:\s*500px\)/,
    "portrait stacked budget matches the CSS max-width: 500px query");
  assert.match(fit, /READABLE_Z = 10 \/ 14/,
    "portrait --hud-z-top floor is 10/14 (10 CSS px over --fs-micro 14)");
  assert.match(fit, /portraitPhone && prop === "--hud-z-top"/,
    "the 10/14 floor applies only to portrait --hud-z-top, not the dock/bottom bands");
});

test("analyzeOverlap: tip portrait clash shapes are the failure mode we clear", () => {
  // Synthetic 390×844 @ ~150% from artifacts/hud-survey/before-portrait.
  const W = 390, H = 844, ins = { sal: 0, sar: 0, sat: 47, sab: 34 };
  const gear = box("hud-gearbox", "hud", 83, 446.6, 224, 122.4);
  const tyre = box("hud-tyre", "hud", 97.5, 446.6, 195, 64.1);
  const aero = box("btn-aero", "ctrl", 298, 542, 76, 76, true);
  const ot = box("btn-ot", "ctrl", 298, 630, 76, 76, true);
  const pile = analyzeOverlap([gear, tyre, aero, ot], W, H, ins);
  assert.ok(pile.hudClash.includes("hud-gearbox+hud-tyre") || pile.hudClash.includes("hud-tyre+hud-gearbox"),
    "gearbox×tyre is a hudClash on tip geometry");
  assert.ok(overlapArea(gear, tyre) > 5000, "gearbox×tyre area is material");
  assert.ok(pile.hudClash.some((p) => p.includes("hud-gearbox") && p.includes("btn-aero")),
    "gearbox×AERO is a hudClash on tip geometry");

  // Cleared shape: tyre below gear, gear narrow enough for AERO.
  const gearOk = box("hud-gearbox", "hud", 120, 400, 150, 100);
  const tyreOk = box("hud-tyre", "hud", 130, 510, 130, 50);
  const clear = analyzeOverlap([gearOk, tyreOk, aero, ot], W, H, ins);
  const hits = clear.hudClash.filter((p) =>
    p.includes("hud-gearbox") || p.includes("hud-tyre"));
  assert.deepEqual(hits, [], "cleared portrait stack has no gearbox/tyre clashes");
});
