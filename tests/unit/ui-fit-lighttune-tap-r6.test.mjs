/* ui-fit round 6 — lighting tuner compact foot / short-tab tap floors.
   Pins #lighting-inner-only overrides in css/tuner.css (camera untouched).
   Read as RULES (tests/helpers/css-rules.mjs): a regex over the raw file also
   matched a commented-out rule and ran across rule boundaries. */
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

test("lighting tuner compact foot buttons floor at --tap-paint (rail off and on)", () => {
  const FOOT = `#lighting-inner${D}[data-rail="off"] > .sheet-foot button, #lighting-inner${D}[data-rail="on"] > .sheet-foot button`;
  assert.equal(decl(rules, FOOT, "min-height"), "var(--tap-paint)",
    "compact foot RESET/COPY/DONE must paint at --tap-paint, not --tap-min");
  assert.equal(decl(rules, FOOT, "padding"), "calc(var(--gap) / 2) calc(var(--gap) * 2 / 3)",
    "foot padding restored via --gap tokens so tap-paint height is reachable");
});

test("lighting category chips keep a --tap-paint min-width (short labels like FX)", () => {
  assert.equal(decl(rules, "#lighting-inner #lt-tabs .lt-tab", "min-width"), "var(--tap-paint)",
    "FX and other short category chips are at least --tap-paint wide");
});

test("r6 overrides stay lighting-only (no camtune-inner retarget in the block)", () => {
  const m = css.match(/UI Fit r6: lighting tuner compact tap floor[\s\S]*?\}\s*\/\* #pc-toggle/);
  assert.ok(m, "r6 block present before the #pc-toggle hud carve");
  assert.doesNotMatch(m[0], /#camtune-inner/, "must not retarget camera in the r6 carve");
  assert.doesNotMatch(m[0], /#ct-/, "must not retarget #ct-* camera selectors");
});
