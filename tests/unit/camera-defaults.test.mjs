import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "../..");

test("shipped chase corner lead is baked into vantage.js", () => {
  const src = fs.readFileSync(path.join(root, "js/camera/vantage.js"), "utf8");
  assert.match(src, /CHASE_CORNER_LEAD_DEFAULT\s*=\s*0\.18/);
  assert.match(src, /CamTune\.cornerLead\(mode\)/);
});

test("cockpit turn chasing defaults ON", () => {
  const src = fs.readFileSync(path.join(root, "js/camera/cockpit-opts.js"), "utf8");
  assert.match(src, /read\(KEY_TC,\s*"turnchase",\s*true\)/);
});

test("broadcast cameras carry per-mode cut ease durations", () => {
  const src = fs.readFileSync(path.join(root, "js/camera/mode-switch.js"), "utf8");
  assert.match(src, /id:\s*"cinematic"[\s\S]*cut:\s*0\.6/);
  assert.match(src, /id:\s*"heli"[\s\S]*cut:\s*0\.55/);
  assert.match(src, /\.cut\s*\|\|\s*0\.35/);
});

test("HUD applies camera/profile body classes", () => {
  const src = fs.readFileSync(path.join(root, "js/ui/hud.js"), "utf8");
  assert.match(src, /hud-onboard/);
  assert.match(src, /hud-bcam/);
  assert.match(src, /hud-hide-map/);
  assert.match(src, /hud-prof-minimal/);
  const css = fs.readFileSync(path.join(root, "css/hud.css"), "utf8");
  assert.match(css, /body\.hud-bcam #hud-gearbox/);
  assert.match(css, /body\.hud-hide-map #minimap/);
  assert.match(css, /body\.hud-map-low #minimap/);
});

test("CamTune exports player edits as window.CameraEdits", () => {
  const src = fs.readFileSync(path.join(root, "js/camera/offsets.js"), "utf8");
  assert.match(src, /function exportEdits\(\)/);
  const panel = fs.readFileSync(path.join(root, "js/camera/tuner-panel.js"), "utf8");
  assert.match(panel, /window\.CameraEdits/);
});

test("announce suppresses low-priority banners on broadcast cameras unless broadcast HUD", () => {
  const src = fs.readFileSync(path.join(root, "js/game.js"), "utf8");
  assert.match(src, /hudProfile !== "broadcast"/);
  assert.match(src, /if \(pri < 4\) return;/);
});

test("broadcast HUD profile keeps two-decimal gaps", () => {
  const src = fs.readFileSync(path.join(root, "js/ui/hud.js"), "utf8");
  assert.match(src, /function gapDecimals\(\)/);
  assert.match(src, /=== "broadcast" \? 2 : 1/);
  const css = fs.readFileSync(path.join(root, "css/hud.css"), "utf8");
  assert.match(css, /body\.hud-prof-broadcast \.hud-top/);
  assert.match(css, /body\.hud-prof-broadcast\.hud-bcam \.hud-bottom/);
});
