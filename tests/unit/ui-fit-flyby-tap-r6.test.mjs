/* ui-fit round 6 — flyby editor compact foot / pose-select tap floors.
   Pins #flyby-inner / #fb-*-only overrides in css/tuner.css (camera/lighting untouched).
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

test("flyby editor compact foot buttons floor at --tap-paint (rail off and on)", () => {
  const FOOT = `#flyby-inner${D} > .sheet-foot button, #flyby-inner${D}[data-rail="on"] > .sheet-foot button`;
  assert.equal(decl(rules, FOOT, "min-height"), "var(--tap-paint)",
    "compact foot RESET/COPY/DONE must paint at --tap-paint, not --tap-min");
  assert.equal(decl(rules, FOOT, "padding"), "calc(var(--gap) / 2) calc(var(--gap) * 2 / 3)",
    "foot padding restored via --gap tokens so tap-paint height is reachable");
});

test("flyby compact operations use three readable columns", () => {
  assert.equal(decl(rules, `#flyby-inner${D} #fb-ops`, "grid-template-columns"), "repeat(3, minmax(0, 1fr))",
    "compact Flyby operation labels need room for DOWN and NORM");
});

test("flyby foot stays on --tap-paint outside compact (portrait 51px vs house 52)", () => {
  assert.equal(decl(rules, "#flyby-inner > .sheet-foot button", "min-height"), "var(--tap-paint)",
    "non-compact RESET/COPY also floor at --tap-paint");
});

test("flyby pose selects floor at --tap-paint (#fb-in-ease / #fb-in-eye*-at)", () => {
  const SEL = '#flyby-inner #fb-rows select, #flyby-inner :is(#fb-in-ease, [id^="fb-in-eye"][id$="-at"], [id^="fb-in-look"][id$="-at"])';
  assert.equal(decl(rules, SEL, "min-height"), "var(--tap-paint)",
    "EASE and pose ANCHOR selects must paint at --tap-paint, not --tap-min");
});

test("r6 overrides stay flyby-only (no camtune / lighting retarget in the block)", () => {
  const m = css.match(/UI Fit r6: flyby editor compact tap floor[\s\S]*?(?=\/\* GARAGE ANGLE)/);
  assert.ok(m, "r6 flyby block present before garage-angle and shared workspace styles");
  assert.doesNotMatch(m[0], /#camtune-inner/, "must not retarget camera in the r6 carve");
  assert.doesNotMatch(m[0], /#lighting-inner/, "must not retarget lighting in the r6 carve");
  assert.doesNotMatch(m[0], /#ct-/, "must not retarget #ct-* camera selectors");
  assert.doesNotMatch(m[0], /#lt-/, "must not retarget #lt-* lighting selectors");
});
