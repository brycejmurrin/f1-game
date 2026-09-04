import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";

const root = path.resolve(import.meta.dirname, "../..");

function loadCockpitOpts(disk) {
  const store = new Map(Object.entries(disk || {}));
  const ctx = {
    GameStore: {
      store: {
        raw(k) { return store.has(k) ? store.get(k) : null; },
        rawSet(k, v) { store.set(k, v); return true; },
      },
    },
    Log: { info() {} },
  };
  vm.runInNewContext(
    fs.readFileSync(path.join(root, "js/camera/cockpit-opts.js"), "utf8") + "\nthis.exported = CockpitOpts;",
    ctx);
  return ctx.exported;
}

test("shipped chase corner lead is baked into vantage.js", () => {
  const src = fs.readFileSync(path.join(root, "js/camera/vantage.js"), "utf8");
  assert.match(src, /CHASE_CORNER_LEAD_DEFAULT\s*=\s*0\.18/);
  assert.match(src, /CamTune\.cornerLead\(mode\)/);
});

test("cockpit turn chasing is a 0–1 look-ahead blend, shipped at 0.35", () => {
  const src = fs.readFileSync(path.join(root, "js/camera/cockpit-opts.js"), "utf8");
  assert.match(src, /LEAD_DEFAULT\s*=\s*0\.35/,
    "0.35 is the blend the old ON switch used — keep that as the shipped amount");
  assert.match(src, /KEY_LEAD\s*=\s*"apex26\.cockpitTurnChaseLead"/,
    "the live value is a new key so a stored \"1\" is not read as 100%");
  assert.match(src, /inp\.type\s*=\s*"range"/,
    "SETTINGS > COCKPIT exposes TURN CHASING as a slider, not an ON/OFF");
  const Opts = loadCockpitOpts();
  assert.equal(Opts.parseLead("1", null), 1,
    "the new key stores a real 0–1; \"1\" is full look-ahead");
  assert.equal(Opts.parseLead("0", null), 0);
  assert.equal(Opts.parseLead("0.8", null), 0.8);
  assert.equal(Opts.parseLead("80", null), 0.8);
  assert.equal(Opts.parseLead(null, "1"), 0.35,
    "?turnchase=1 keeps the old ON meaning");
  assert.equal(Opts.parseLead(null, "100"), 1);
  assert.equal(Opts.parseLead(null, null), null,
    "parseLead leaves the default to readLead() when nothing is stored");
  assert.equal(loadCockpitOpts({ "apex26.cockpitTurnChase": "1" }).turnChaseLead(), 0.35,
    "legacy ON migrates to the shipped 0.35 blend");
  assert.equal(loadCockpitOpts({ "apex26.cockpitTurnChase": "0" }).turnChaseLead(), 0,
    "legacy OFF stays locked to the nose");
  assert.equal(loadCockpitOpts({
    "apex26.cockpitTurnChaseLead": "0.8",
    "apex26.cockpitTurnChase": "0",
  }).turnChaseLead(), 0.8, "the new key wins over the old flag");
  assert.equal(loadCockpitOpts({}).turnChaseLead(), 0.35,
    "untouched installs keep the old ON amount");
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
