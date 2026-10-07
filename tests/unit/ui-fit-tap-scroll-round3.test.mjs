/* ui-fit round 3 — tap floors (settings HUD checklist, photo studio, How to Play)
   and ScrollFade selectors for #cr-body / .td-rail. */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const rd = (f) => fs.readFileSync(path.join(ROOT, f), "utf8");

test("ScrollFade SEL includes career body and track-designer rail", () => {
  const fade = rd("js/ui/scroll-fade.js");
  assert.match(fade, /"#cr-body"/, "career hub scroll body");
  assert.match(fade, /"\.td-rail"/, "track designer tool rail");
});

test("settings HUD checklist floors labels and checkboxes in settings-controls.css", () => {
  const css = rd("css/settings-controls.css");
  assert.match(
    css,
    /#pm-hud-details #pm-hud-elements-list label\s*\{[^}]*min-height:\s*var\(--tap-paint\)/s,
    "checklist rows paint at --tap-paint",
  );
  assert.match(
    css,
    /#pm-hud-details #pm-hud-elements-list input\[type="checkbox"\]\s*\{[^}]*min-width:\s*20px/s,
    "checkbox width floor ≥20px",
  );
  assert.match(
    css,
    /#pm-hud-details #pm-hud-elements-list input\[type="checkbox"\]\s*\{[^}]*min-height:\s*20px/s,
    "checkbox height floor ≥20px",
  );
  assert.match(
    css,
    /#pm-hud-details #pm-hidehud:has\(select:disabled\)/s,
    "race-only HUD row has a clearer disabled plate",
  );
});

test("photo studio compact / coarse controls use --tap-paint", () => {
  const css = rd("css/photo-studio.css");
  assert.match(
    css,
    /@media \(pointer: coarse\)[\s\S]*#ps-panel button:not\(\.bigbtn\):not\(\[data-step\]\)[\s\S]*min-height:\s*var\(--tap-paint\)/,
    "coarse pointer buttons floor at --tap-paint",
  );
  assert.match(
    css,
    /body\[data-density="compact"\] #ps-panel button:not\(\.bigbtn\):not\(\[data-step\]\),[\s\S]*min-height:\s*var\(--tap-paint\)/,
    "compact density buttons floor at --tap-paint",
  );
});

test("How to Play compact section chips floor at --tap-paint", () => {
  const css = rd("css/overlays.css");
  assert.match(
    css,
    /#howtoplay-inner\[data-density="compact"\] #htp-contents a\s*\{[^}]*min-height:\s*max\(var\(--tap-paint\),\s*1lh\)/s,
    "compact htp section links use --tap-paint not a hard 44px",
  );
  assert.doesNotMatch(
    css,
    /#howtoplay-inner\[data-density="compact"\] #htp-contents a\s*\{[^}]*44px/s,
    "no hard-coded 44px floor on compact htp chips",
  );
});
