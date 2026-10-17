/* ui-fit round 6 — Photo Studio portrait select tap floors.
   Pins #ps-* setting-row selects in css/photo-studio.css. */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { cssRules, decl } from "../helpers/css-rules.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const css = fs.readFileSync(path.join(ROOT, "css/photo-studio.css"), "utf8");
const rules = cssRules(css);
const SELECTS = "#ps-panel :is(#ps-subject, #ps-aspect, #ps-grid-select, #ps-postcard, #ps-tod, #ps-weather)";

test("Photo Studio setting-row selects floor at --tap-paint", () => {
  assert.match(
    css,
    /#ps-panel :is\(#ps-subject, #ps-aspect, #ps-grid-select, #ps-postcard, #ps-tod, #ps-weather\)\s*\{[^}]*min-height:\s*var\(--tap-paint\)/s,
    "#ps-subject / #ps-aspect / #ps-grid-select / #ps-postcard / #ps-tod / #ps-weather must paint at --tap-paint, not --chip-h",
  );
  assert.equal(decl(rules, SELECTS, "min-height"), "var(--tap-paint)");
});

test("r6 select floor is min-height only (no height lock that would shrink landscape)", () => {
  assert.equal(decl(rules, SELECTS, "height"), null,
    "do not set height — landscape already met --tap; a height lock can shrink it");
  assert.equal(decl(rules, SELECTS, "max-height"), null,
    "do not cap height on the r6 select carve");
});

test("r6 carve stays Photo Studio #ps-* (no foreign selectors)", () => {
  const m = css.match(/UI Fit r6: Photo Studio setting-row selects[\s\S]*?\n#ps-panel \.tune-row/);
  assert.ok(m, "r6 block present before #ps-panel .tune-row");
  assert.doesNotMatch(m[0], /#lighting|#camtune|#ct-|#lt-|title|#hud/,
    "must not retarget tuner / title / HUD selectors");
});
