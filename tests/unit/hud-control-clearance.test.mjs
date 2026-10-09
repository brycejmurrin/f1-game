/* hud-control-clearance — phone-landscape opt-in readouts must not sit on
   touch controls. Pins the CSS standoffs / anchor tethers for #hud-sectors
   (all three steer modes), #hud-rel (left dock) and #hud-inputs (right dock
   + desktop gear box), plus a pure analyzeOverlap shape for the measured
   clash classes from the 2026-10-07 HUD survey (REL×steer/BRAKE, INPUTS×
   BOOST/gearbox, SECTORS×BOOST on tilt @ 150%). */
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

test("fitHud publishes --hud-fit-stamp after painted phone clearance", () => {
  assert.match(HUD_JS, /--hud-fit-stamp/,
    "fitHud bumps a published stamp specs can wait on");
  assert.match(HUD_JS, /phonePaintedClash\(\)/,
    "stamp must not advance while painted readout-on-control clashes remain");
  assert.match(HUD_JS, /phoneFitStampSync/,
    "stamp publishes at end of updateHud after REL/sectors land");
});

test("CSS: #hud-sectors clears the right dock on every phone steer mode", () => {
  // game.js only toggles body.steer-touch / body.steer-buttons — tilt is the
  // unmarked phone mode. body:not(.desktop) covers tilt + touch + buttons;
  // --dock-r-w is 0 on desktop so the home right: calc stays put there.
  // Do NOT max() with anchor(left): #1191's tether overshot into #announce
  // when wrap-reverse under-measured --dock-r-w (Pages notched-landscape).
  assert.match(CSS,
    /body:not\(\.desktop\) #hud-sectors\s*\{[\s\S]*?--dock-r-w/,
    "phone #hud-sectors takes --dock-r-w (tilt has no steer-* class)");
  assert.doesNotMatch(CSS,
    /body:not\(\.desktop\) #hud-sectors\s*\{[^}]*position-anchor:\s*--apex-dock-right/,
    "phone sectors must not tether via max(anchor(left)) — that shoved S1–S3 into #announce");
  assert.doesNotMatch(CSS,
    /#hud-sectors\s*\{[^}]*max\(\s*calc\(10px \+ var\(--sar\)[^}]*anchor\(left\)/,
    "no max(dock-r-w, anchor(left)) on sectors");
});

test("CSS: touch #hud-rel is capped above the left dock (steer / BRAKE)", () => {
  assert.match(CSS,
    /body:not\(\.desktop\) #hud-rel:not\(\[data-hl-user\]\)[\s\S]{0,500}?max-height:\s*min\(42svh/,
    "touch RELATIVE has a height cap so five rows cannot cover the pedals");
});

test("CSS: #hud-inputs clears the right dock on touch and the gear box on desktop", () => {
  assert.match(CSS,
    /body:not\(\.desktop\) #hud-inputs:not\(\[data-hl-user\]\)\s*\{[^}]*position:\s*fixed/,
    "touch INPUTS uses fixed layout like sectors");
  assert.match(CSS,
    /min\(var\(--dock-r-w, 0px\), 128px\)/,
    "touch INPUTS caps --dock-r-w so a wrapped dock cannot shove it left");
  assert.match(CSS,
    /#hud-inputs:not\(\[data-hl-user\]\)[\s\S]*?max-height:\s*min\(18svh/,
    "touch INPUTS height-caps so it cannot grow into BOOST");
  assert.match(CSS,
    /body\.desktop #hud-inputs:not\(\[data-hl-user\]\)\s*\{[^}]*bottom:\s*auto/,
    "desktop INPUTS leaves the bottom band (SPEED & GEAR) alone");
  assert.match(CSS,
    /body\.desktop #hud-inputs:not\(\[data-hl-user\]\)\s*\{[^}]*right:\s*calc\(10px/,
    "desktop INPUTS homes under the sector column, not over the gear box");
});

test("analyzeOverlap: survey clash shapes are the failure mode we clear", () => {
  // Synthetic phone-landscape 844×390 @ ~150%: measured class of bugs.
  const W = 844, H = 390, ins = { sal: 47, sar: 47, sat: 0, sab: 21 };
  const rel = box("hud-rel", "hud", 55, 170, 180, 160);
  const steerL = box("btn-steer-left", "ctrl", 60, 290, 64, 64, true);
  const brake = box("btn-brake", "ctrl", 130, 290, 64, 64, true);
  const relClash = analyzeOverlap([rel, steerL, brake], W, H, ins);
  assert.ok(relClash.hudClash.includes("hud-rel+btn-steer-left"), "REL×steer is a hudClash");
  assert.ok(relClash.hudClash.includes("hud-rel+btn-brake"), "REL×BRAKE is a hudClash");
  assert.ok(overlapArea(rel, steerL) > 1000, "REL×steer area is material");

  const sectors = box("hud-sectors", "hud", 700, 70, 90, 90);
  const boost = box("btn-boost", "ctrl", 720, 120, 70, 70, true);
  const secClash = analyzeOverlap([sectors, boost], W, H, ins);
  assert.ok(secClash.hudClash.includes("hud-sectors+btn-boost"), "SECTORS×BOOST is a hudClash");

  // Desktop chase 1280×720 @ 150%: INPUTS grows from bottom-left into SPEED & GEAR.
  const dInputs = box("hud-inputs", "hud", 420, 500, 280, 150);
  const dGear = box("hud-gearbox", "hud", 560, 540, 140, 110);
  const desk = analyzeOverlap([dInputs, dGear], 1280, 720, {});
  assert.ok(desk.hudClash.includes("hud-inputs+hud-gearbox") || desk.hudClash.includes("hud-gearbox+hud-inputs"),
    "INPUTS×gearbox is a hudClash on desktop geometry");
  assert.ok(overlapArea(dInputs, dGear) > 500, "INPUTS×gearbox area is material");
  // Phone INPUTS×BOOST crowd: wide trace under sectors into the button column.
  const inTouch = box("hud-inputs", "hud", 620, 160, 160, 100);
  const ot = box("btn-ot", "ctrl", 720, 200, 70, 70, true);
  const inClash = analyzeOverlap([inTouch, boost, ot], W, H, ins);
  assert.ok(inClash.hudClash.some((p) => p.includes("hud-inputs")), "INPUTS×right-dock is a hudClash");
});
