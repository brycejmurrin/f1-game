import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "../..");

test("HUD metrics layout AUTO keeps every cluster and lets fitHud adapt", () => {
  const hud = fs.readFileSync(path.join(root, "js/ui/hud.js"), "utf8");
  const game = fs.readFileSync(path.join(root, "js/game.js"), "utf8");
  assert.match(game, /HUD_MET_LAYOUTS\s*=\s*\["auto", "full", "timing", "driver", "compact"\]/);
  assert.match(game, /HUD_VIS_MODES\s*=\s*\["auto", "on", "off"\]/);
  assert.match(game, /store\.get\("hudMapVis", "on"\)/);
  assert.match(game, /store\.get\("hudGapsVis", "on"\)/);
  assert.match(game, /hud-met-\(\[a-z\]\+\)/);
  assert.match(game, /hudMapVisLabel/);
  assert.match(game, /return "LAYOUT: " \+ hudMetricsLayout\.toUpperCase\(\)/);
  assert.match(game, /LAYOUT: AUTO/);
  assert.match(hud, /function resolveMetricsLayout\(\)/);
  assert.match(hud, /return "full";/);
  assert.equal(hud.includes("bandCapped"), false);
  assert.match(hud, /function syncHudVisClasses\(/);
  const camSync = hud.slice(hud.indexOf("function syncHudCamClasses"), hud.indexOf("function flashSector"));
  assert.match(camSync, /syncHudVisClasses\(modeId\)/);
  assert.doesNotMatch(camSync, /if \(key === _hudCamKey\) return;/);
  assert.match(hud, /hud-hide-map/);
});

test("LAYOUT modes do not hide clusters; MAP/GAPS still can", () => {
  const css = fs.readFileSync(path.join(root, "css/hud.css"), "utf8");
  assert.match(css, /body\.hud-hide-map #minimap/);
  assert.match(css, /body\.hud-hide-gaps \.hud-gaps/);
  assert.equal(css.includes("body.hud-met-timing .hud-bottom"), false);
  assert.equal(css.includes("body.hud-met-driver #minimap"), false);
  assert.equal(css.includes("body.hud-met-compact #hud-energy"), false);
  assert.match(css, /body\.hud-map-low #minimap/);
});

test("HUD layout options live in a full-width pause submenu", () => {
  const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
  const css = fs.readFileSync(path.join(root, "css/components.css"), "utf8");
  assert.match(html, /id="pm-hud-details"/);
  assert.match(html, /LAYOUT: AUTO/);
  assert.match(css, /#pm-hud-details \[role="group"\]/);
  assert.match(css, /grid-area:\s*hudopts/);
});
