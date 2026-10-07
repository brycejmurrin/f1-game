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

const box = (key, role, x, y, w, h, round = false) => ({
  key, role, visible: true, exists: true,
  x, y, r: x + w, b: y + h, w, h,
  round, cx: x + w / 2, cy: y + h / 2, rr: w / 2, contains: [],
});

test("CSS: #hud-sectors clears the right dock on every phone steer mode", () => {
  // game.js only toggles body.steer-touch / body.steer-buttons — tilt is the
  // unmarked phone mode. body:not(.desktop) covers tilt + touch + buttons;
  // --dock-r-w is 0 on desktop so the home right: calc stays put there.
  assert.match(CSS,
    /body:not\(\.desktop\) #hud-sectors\s*\{[\s\S]*?--dock-r-w/,
    "phone #hud-sectors takes --dock-r-w (tilt has no steer-* class)");
  assert.match(CSS,
    /@supports \(anchor-name: --a\)[\s\S]*body:not\(\.desktop\) #dock-right\s*\{[^}]*anchor-name:\s*--apex-dock-right/,
    "phone right dock is the sectors anchor");
  assert.match(CSS,
    /body:not\(\.desktop\) #hud-sectors\s*\{[^}]*position-anchor:\s*--apex-dock-right/,
    "phone sectors tether to the right dock");
});

test("CSS: touch #hud-rel is capped above the left dock (steer / BRAKE)", () => {
  assert.match(CSS,
    /body:not\(\.desktop\) #hud-rel:not\(\[data-hl-user\]\)[\s\S]{0,400}?position-anchor:\s*--apex-dock-left/,
    "touch RELATIVE anchors to the left dock");
  assert.match(CSS,
    /#hud-rel:not\(\[data-hl-user\]\)[\s\S]{0,500}?max-height:[\s\S]{0,120}?anchor\(top\)/,
    "touch RELATIVE max-height clears anchor(top) of the left dock");
});

test("CSS: #hud-inputs clears the right dock on touch and the gear box on desktop", () => {
  assert.match(CSS,
    /body:not\(\.desktop\) #hud-inputs:not\(\[data-hl-user\]\)[\s\S]{0,500}?position-anchor:\s*--apex-dock-right/,
    "touch INPUTS anchors to the right dock");
  assert.match(CSS,
    /body:not\(\.desktop\) #hud-inputs:not\(\[data-hl-user\]\)[\s\S]{0,600}?max-height:[\s\S]{0,120}?anchor\(top\)/,
    "touch INPUTS max-height clears the right-dock top");
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
