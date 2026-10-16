/* ui-fit round 6 — Settings APPEARANCE studio fit (survey rank 7).
   Pins css/appearance-studio.css tall/wide reflow + pad above BACK, and
   the layout-audit SCREENS cell so PREVIEW PRESET tiles stay reachable. */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { cssRules, decl } from "../helpers/css-rules.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const css = fs.readFileSync(path.join(ROOT, "css/appearance-studio.css"), "utf8");
const screens = fs.readFileSync(path.join(ROOT, "tools/ui/menu-screens.mjs"), "utf8");
const rules = cssRules(css);
const PAD = "calc(var(--tap) + var(--pad))";
const PANEL = "#pm-panel-appearance[data-appearance-studio]";
const BODY = "#pmsettings:has(#pm-panel-appearance:not([hidden])[data-appearance-studio]) #pm-settings-body";
const FOOT = "#pmsettings:has(#pm-panel-appearance:not([hidden])[data-appearance-studio]) #pmsettings-inner > .sheet-foot";
const TALL = "#pmsettings-inner[data-shape=\"tall\"] #appearance-studio";
const TALL_CTRL = "#pmsettings-inner[data-shape=\"tall\"] #appearance-studio [data-as=\"controls\"]";
const TALL_PREV = "#pmsettings-inner[data-shape=\"tall\"] #appearance-studio [data-as=\"preview-side\"]";
const TALL_LIST = "#pmsettings-inner[data-shape=\"tall\"] #appearance-studio [data-as=\"preset-list\"]";
const TALL_TILE = "#pmsettings-inner[data-shape=\"tall\"] #appearance-studio [data-as=\"preset-list\"] button";
const WIDE = "#pmsettings-inner[data-shape=\"wide\"] #appearance-studio";
const WIDE_COMPACT_LIST = "#pmsettings-inner[data-shape=\"wide\"][data-density=\"compact\"] #appearance-studio [data-as=\"preset-list\"]";
const WIDE_COMPACT_TILE = "#pmsettings-inner[data-shape=\"wide\"][data-density=\"compact\"] #appearance-studio [data-as=\"preset-list\"] button";
const WIDE_COMPACT_SHORT_LIST = WIDE_COMPACT_LIST;

test("APPEARANCE panel pads so the last studio tile can scroll above BACK", () => {
  assert.equal(decl(rules, PANEL, "padding-bottom"), PAD,
    "#pm-panel-appearance must pad by --tap + --pad so presets clear .sheet-foot");
  assert.equal(decl(rules, PANEL, "scroll-padding-bottom"), PAD);
  assert.equal(decl(rules, PANEL, "overflow"), null,
    "do not give the region its own scroller — #pm-settings-body already scrolls");
});

test("open APPEARANCE page keeps body scroll-pad and foot tap floor", () => {
  assert.equal(decl(rules, BODY, "scroll-padding-bottom"), PAD);
  assert.equal(decl(rules, FOOT, "min-height"), "var(--tap)",
    "BACK foot stays at the --tap floor while the appearance page is open");
});

test("tall studio puts presets first and uses a 2-col tile track", () => {
  assert.equal(decl(rules, TALL, "grid-template-columns"), "minmax(0, 1fr)");
  assert.equal(decl(rules, TALL_CTRL, "order"), "-1",
    "controls (PREVIEW PRESET) sit above the preview so tiles are not under BACK");
  assert.equal(decl(rules, TALL_PREV, "order"), "0");
  assert.equal(decl(rules, TALL_PREV, "position"), "static");
  assert.equal(decl(rules, TALL_LIST, "grid-template-columns"), "repeat(2, minmax(0, 1fr))",
    "two equal columns — not auto-fit leftovers that crush at scale 200");
  assert.equal(decl(rules, TALL_TILE, "min-height"), "max(var(--tap-paint), calc(var(--tap) * 2.1))");
  assert.equal(decl(rules, TALL_TILE, "min-width"), "var(--tap-paint)");
});

test("wide studio keeps two columns (scale 200 landscape still uses data-shape)", () => {
  assert.equal(decl(rules, WIDE, "grid-template-columns"), "minmax(0, 1.15fr) minmax(0, 0.95fr)");
});

test("wide compact studio keeps a 5-tile desktop row at --tap-paint", () => {
  assert.equal(decl(rules, WIDE_COMPACT_LIST, "grid-template-columns"), "repeat(5, minmax(0, 1fr))",
    "short landscape: one row of five, not a 3-row stack under BACK");
  assert.equal(decl(rules, WIDE_COMPACT_TILE, "min-height"), "var(--tap-paint)");
  assert.equal(decl(rules, WIDE_COMPACT_TILE, "min-width"), "var(--tap-paint)");
});

test("short wide compact studio widens preset tiles at high-scale phone landscape", () => {
  assert.equal(
    decl(rules, WIDE_COMPACT_SHORT_LIST, "grid-template-columns", {
      context: /@media \(max-width: 900px\) and \(max-height: 500px\)/,
    }),
    "repeat(3, minmax(0, 1fr))",
    "short phone landscapes need readable preset names at 130–200% UI scale",
  );
});

test("short wide compact studio keeps preset words intact", () => {
  const context = /@media \(max-width: 900px\) and \(max-height: 500px\)/;
  assert.equal(decl(rules, WIDE_COMPACT_SHORT_LIST + " strong", "overflow-wrap", { context }), "normal");
  assert.equal(decl(rules, WIDE_COMPACT_SHORT_LIST + " strong", "word-break", { context }), "normal");
  assert.equal(decl(rules, WIDE_COMPACT_SHORT_LIST + " strong", "hyphens", { context }), "none");
});

test("studio buttons keep the --tap / --tap-paint floors", () => {
  assert.equal(decl(rules, "#appearance-studio button", "min-height"), "var(--tap)");
  assert.equal(decl(rules, "#appearance-studio [data-as=\"preset-list\"] button", "min-height"),
    "max(var(--tap-paint), calc(var(--tap) * 2.35))",
    "preset tiles keep the taller art box and never drop below --tap-paint");
  assert.equal(decl(rules, "#appearance-studio input, #appearance-studio select", "min-height"), "var(--tap-paint)");
  assert.equal(decl(rules, "#appearance-studio [data-as=\"segment\"] > button", "min-width"), "var(--tap-paint)",
    "HOME / HUD / device chips never shrink below --tap-paint");
});

test("layout-audit SCREENS opens #pm-panel-appearance", () => {
  assert.match(screens, /id:\s*"settingsappearance"/, "settingsappearance catalog id");
  assert.match(
    screens,
    /id:\s*"settingsappearance"[\s\S]*?#pm-open-appearance[\s\S]*?pm-panel-appearance/,
    "settingsappearance must click the APPEARANCE door and wait for #pm-panel-appearance",
  );
  assert.match(
    screens,
    /id:\s*"settingsappearance"[\s\S]*?root:\s*"#pmsettings"/,
    "measure the whole sheet (BACK lives in .sheet-foot, not the region)",
  );
});

test("r6 carve stays Settings APPEARANCE (no foreign selectors)", () => {
  const m = css.match(/UI Fit r6: Settings APPEARANCE[\s\S]*?#appearance-studio \[data-as="preview-content"\]\s*\{[^}]*\}/);
  assert.ok(m, "r6 appearance block present with studio / pad / shape selectors");
  assert.doesNotMatch(m[0], /#hud|#lighting|#camtune|#ps-|title|#cs-|touch-controls|#pm-panel-a11y/,
    "must not retarget HUD / tuner / Photo Studio / garage / title / a11y selectors");
  assert.match(m[0], /#pm-panel-appearance/);
  assert.match(m[0], /#appearance-studio/);
  assert.match(m[0], /data-shape="tall"/);
  assert.match(m[0], /preset-list/);
});
