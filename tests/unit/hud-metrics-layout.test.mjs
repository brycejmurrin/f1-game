import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "../..");

test("HUD metrics layout modes are stored and resolved in hud.js", () => {
  const hud = fs.readFileSync(path.join(root, "js/ui/hud.js"), "utf8");
  const game = fs.readFileSync(path.join(root, "js/game.js"), "utf8");
  assert.match(game, /HUD_MET_LAYOUTS\s*=\s*\["auto", "full", "timing", "driver", "compact"\]/);
  assert.match(game, /HUD_VIS_MODES\s*=\s*\["auto", "on", "off"\]/);
  assert.match(game, /LAYOUT: /);
  assert.match(game, /hudMapVisLabel/);
  assert.match(hud, /function resolveMetricsLayout\(\)/);
  assert.match(hud, /function syncHudVisClasses\(/);
  const camSync = hud.slice(hud.indexOf("function syncHudCamClasses"), hud.indexOf("function flashSector"));
  assert.match(camSync, /syncHudVisClasses\(modeId\)/);
  assert.doesNotMatch(camSync, /if \(key === _hudCamKey\) return;/);
  assert.match(hud, /hud-hide-map/);
  assert.match(hud, /bandCapped\("--hud-z-bot"\)/);
});

test("metrics layout CSS hides the right clusters", () => {
  const css = fs.readFileSync(path.join(root, "css/hud.css"), "utf8");
  assert.match(css, /body\.hud-hide-map #minimap/);
  assert.match(css, /body\.hud-hide-gaps \.hud-gaps/);
  assert.match(css, /body\.hud-met-timing \.hud-bottom/);
  assert.doesNotMatch(css, /body\.hud-met-driver #minimap/);
  assert.match(css, /body\.hud-met-driver #hud-sectors/);
  assert.match(css, /body\.hud-map-low #minimap/);
  assert.match(css, /body\.hud-met-compact #hud-energy/);
});

test("HUD layout options live in a full-width pause submenu", () => {
  const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
  const css = fs.readFileSync(path.join(root, "css/components.css"), "utf8");
  assert.match(html, /id="pm-hud-details"/);
  assert.match(html, /LAYOUT: AUTO/);
  assert.match(css, /#pm-hud-details \[role="group"\]/);
  assert.match(css, /grid-area:\s*hudopts/);
});
