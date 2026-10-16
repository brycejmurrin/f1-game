/* ui-fit round 6 — Settings ACCESSIBILITY panel fit (survey rank 8).
   Pins #pm-panel-a11y pad / scroll-pad in css/settings.css and the
   layout-audit SCREENS cell so the last colourblind help stays above BACK. */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { cssRules, decl } from "../helpers/css-rules.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const css = fs.readFileSync(path.join(ROOT, "css/settings.css"), "utf8");
const screens = fs.readFileSync(path.join(ROOT, "tools/ui/menu-screens.mjs"), "utf8");
const rules = cssRules(css);
const PAD = "calc(var(--tap) + var(--pad))";
const PANEL = "#pm-panel-a11y";
const BODY = "#pmsettings:has(#pm-panel-a11y:not([hidden])) #pm-settings-body";
const FOOT = "#pmsettings:has(#pm-panel-a11y:not([hidden])) #pmsettings-inner > .sheet-foot";

test("ACCESSIBILITY panel pads so the last help can scroll above BACK", () => {
  assert.equal(decl(rules, PANEL, "padding-bottom"), PAD,
    "#pm-panel-a11y must pad by --tap + --pad so #pm-cbcues-help clears .sheet-foot");
  assert.equal(decl(rules, PANEL, "scroll-padding-bottom"), PAD);
  assert.equal(decl(rules, PANEL, "overflow"), null,
    "do not give the region its own scroller — #pm-settings-body already scrolls");
  assert.equal(decl(rules, PANEL, "min-height"), null,
    "do not lock panel height — portrait already clears BACK");
});

test("open ACCESSIBILITY page keeps body scroll-pad and foot tap floor", () => {
  assert.equal(decl(rules, BODY, "scroll-padding-bottom"), PAD);
  assert.equal(decl(rules, FOOT, "min-height"), "var(--tap)",
    "BACK foot stays at the --tap floor while the a11y page is open");
});

test("layout-audit SCREENS opens #pm-panel-a11y", () => {
  assert.match(screens, /id:\s*"settingsa11y"/, "settingsa11y catalog id");
  assert.match(
    screens,
    /id:\s*"settingsa11y"[\s\S]*?#pm-open-a11y[\s\S]*?pm-panel-a11y/,
    "settingsa11y must click the ACCESSIBILITY door and wait for #pm-panel-a11y",
  );
  assert.match(
    screens,
    /id:\s*"settingsa11y"[\s\S]*?root:\s*"#pmsettings"/,
    "measure the whole sheet (BACK lives in .sheet-foot, not the region)",
  );
});

test("r6 carve stays Settings ACCESSIBILITY (no foreign selectors)", () => {
  const m = css.match(/UI Fit r6: Settings ACCESSIBILITY[\s\S]*?#pmsettings-inner > \.sheet-foot\s*\{[^}]*\}/);
  assert.ok(m, "r6 a11y block present with panel / body / foot selectors");
  assert.doesNotMatch(m[0], /#hud|#lighting|#camtune|#ps-|title|#cs-|touch-controls|appearance-studio/,
    "must not retarget HUD / tuner / Photo Studio / garage / title selectors");
  assert.match(m[0], /#pm-panel-a11y/);
  assert.match(m[0], /#pm-settings-body/);
  assert.match(m[0], /\.sheet-foot/);
});
