/* Helmet visor HUD — ERS pill and portrait PLAN line placement (DOM/CSS pins). */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { cssRules, decl } from "../helpers/css-rules.mjs";
import { readCssSource } from "../helpers/css-source.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const CAMG = fs.readFileSync(path.join(ROOT, "js/camera/cam-groups.js"), "utf8");
const LAYOUT_SRC = CAMG + "\n" + fs.readFileSync(path.join(ROOT, "js/ui/hud-layout.js"), "utf8");
const CSS = readCssSource("css/hud.css");
const rules = cssRules(CSS);

function loadHudLayout() {
  const ctx = {
    console,
    document: { readyState: "complete", getElementById: () => null, querySelector: () => null, addEventListener() {} },
    GameStore: { store: { get: (_k, d) => d, set() {} } },
  };
  vm.createContext(ctx);
  vm.runInContext(LAYOUT_SRC + "; this.HudLayout = HudLayout;", ctx);
  return ctx.HudLayout;
}

test("touch HELMET docks ENERGY in the bottom strip (not mid-visor y:-37)", () => {
  const H = loadHudLayout();
  const e = H.TOUCH_SHIPPED.helmet.energy;
  assert.notEqual(e.y, -37, "y:-37 floated the ERS pill mid-visor (player shots 2026-10-07)");
  assert.ok(e.y >= -10 && e.y <= -2, `ENERGY y=${e.y} should sit in the bottom chip band beside TYRES, not above the wheel`);
  assert.equal(e.x, 0, "touch helmet ENERGY stays centred on the strip anchor until CSS docks it on the left column");
});

test("touch helmet ENERGY stays in the cluster grid beside the gear (never anchored to the later-sibling tyre)", () => {
  const src = CSS.replace(/\/\*[\s\S]*?\*\//g, "");
  // anchor() cannot resolve a LATER sibling: tethering ENERGY to the tyre dropped the bar onto the gear plate (852x393 helmet).
  assert.doesNotMatch(src, /body\[data-hl-set="helmet"\]:not\(\.desktop\) #hud-energy\s*\{[^}]*position-anchor:/,
    "helmet touch ENERGY must not tether to the tyre anchor");
  assert.match(src, /body\[data-hl-set="helmet"\]:not\(\.desktop\) #hud-tyre\[data-hl\]\s*\{\s*translate:\s*none/,
    "the shipped y:-6 translate is dropped so the dock anchor on TYRES is the only shift");
});

test("portrait helmet touch hides the PLAN row when it would crowd GEAR/SPEED", () => {
  const src = CSS.replace(/\/\*[\s\S]*?\*\//g, "");
  assert.match(src,
    /@media \(orientation: portrait\) and \(max-width: 500px\)[\s\S]*body\[data-hl-set="helmet"\]:not\(\.desktop\) #hud-plan:not\(:empty\)\s*\{\s*display:\s*none/,
    "PLAN must not paint over the centred gear readout on 390×844 helmet");
  assert.equal(decl(rules, "#hud-plan:empty", "display"), "none", "empty plan still collapses everywhere");
});
