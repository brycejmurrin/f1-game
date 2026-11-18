/* ui-fit round 5 — camera tuner compact foot / preview / copy-select tap floors.
   Pins #camtune-inner-only overrides in css/tuner.css (lighting untouched).
   Read as RULES (tests/helpers/css-rules.mjs), not as text: a regex over the raw
   file also matched a rule that had been commented out, and a lazy `[\s\S]*?`
   ran on into the next rule's padding. */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { cssRules, decl } from "../helpers/css-rules.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const css = fs.readFileSync(path.join(ROOT, "css/tuner.css"), "utf8");
const rules = cssRules(css);
const D = '[data-density="compact"]';

test("camera tuner compact foot buttons floor at --tap-paint (rail off and on)", () => {
  const FOOT = `#camtune-inner${D}[data-rail="off"] > .sheet-foot button, #camtune-inner${D}[data-rail="on"] > .sheet-foot button`;
  assert.equal(decl(rules, FOOT, "min-height"), "var(--tap-paint)",
    "compact foot DONE/RESET/COPY must paint at --tap-paint, not --tap-min");
  assert.equal(decl(rules, FOOT, "padding"), "calc(var(--gap) / 2) calc(var(--gap) * 2 / 3)",
    "foot padding restored via --gap tokens so tap-paint height is reachable");
});

test("compact rail-on tuner actions use a readable two-column foot", () => {
  const RAIL = `:is(#lighting-inner, #camtune-inner)${D}[data-rail="on"] > .sheet-foot`;
  assert.equal(decl(rules, RAIL, "display"), "grid");
  assert.equal(decl(rules, RAIL, "grid-template-columns"), "repeat(2, minmax(0, 1fr))",
    "short landscape rails must not crush RESET/COPY/DONE labels into one row");
  assert.equal(decl(rules, RAIL + " button", "white-space"), "normal", "rail actions may wrap inside their readable grid cells");
  assert.equal(decl(rules, RAIL + " button", "line-height"), "1.1");
});

test("short tuner sheets keep action labels readable at every UI scale: two columns keyed on the sheet's density", () => {
  // UI scaling contract gap 24 (PR #5156): `[data-density="compact"]` is measured in the
  // sheet's own px by SheetShape, so UI SIZE moves it; the old `(max-width: 900px) and
  // (max-height: 500px)` window band could not see the zoom.
  const FOOT = `:is(#lighting-inner, #camtune-inner)${D} > .sheet-foot`;
  assert.equal(decl(rules, FOOT, "display"), "grid");
  assert.equal(decl(rules, FOOT, "grid-template-columns"), "repeat(2, minmax(0, 1fr))",
    "short tuner feet need two action columns regardless of rail state or UI scale");
  assert.ok(!rules.some((r) => r.context.includes("@media (max-width: 900px) and (max-height: 500px)")),
    "the zoom-blind window band is gone");
});

test("camera tuner compact preview chips and copy-from select floor at --tap-paint", () => {
  // The base compact rule floors chips at --tap-min; the r5 override is the LATER rule with the same selector.
  const chips = rules.filter((r) => r.selector === `#camtune-inner${D} #ct-previews > button` && r.decls.has("min-height"));
  assert.ok(chips.length, "the compact preview-chip rule is found");
  assert.equal(chips.at(-1).decls.get("min-height"), "var(--tap-paint)", "MONZA/SPA/MONACO preview chips use --tap-paint");
  assert.equal(decl(rules, "#camtune-inner #ct-copyrow select, #camtune-inner #ct-copy-from", "min-height"), "var(--tap-paint)",
    "copy-from select meets --tap-paint");
});

test("camera mode chips keep a --tap-paint min-width (short labels like TV)", () => {
  assert.equal(decl(rules, "#camtune-inner #ct-modes .lt-tab", "min-width"), "var(--tap-paint)",
    "TV and other short mode chips are at least --tap-paint wide");
});

test("r5 overrides stay camera-only (no lighting-inner retarget in the block)", () => {
  const m = css.match(/UI Fit r5: camera tuner compact tap floor[\s\S]*?\}\s*\/\* @layer components \*\//);
  assert.ok(m, "r5 block present before @layer components close");
  assert.doesNotMatch(m[0], /#lighting-inner/, "must not retarget lighting in the r5 carve");
});
