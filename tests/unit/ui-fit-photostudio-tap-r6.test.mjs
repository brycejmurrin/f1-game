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
const SELECTS = "#ps-panel :is(#ps-subject, #ps-aspect, #ps-grid-select, #ps-postcard, #ps-tod, #ps-weather, #ps-look-room, #ps-look-crew, #ps-look-mood)";

test("Photo Studio setting-row selects floor at max(--tap, --tap-paint)", () => {
  assert.match(
    css,
    /#ps-panel :is\(#ps-subject, #ps-aspect, #ps-grid-select, #ps-postcard, #ps-tod, #ps-weather, #ps-look-room, #ps-look-crew, #ps-look-mood\)\s*\{[^}]*min-height:\s*max\(var\(--tap\), var\(--tap-paint\)\)/s,
    "#ps-subject / #ps-aspect / #ps-grid-select / #ps-postcard / #ps-tod / #ps-weather / #ps-look-* must paint at max(--tap, --tap-paint) (#3337), not --chip-h",
  );
  assert.equal(decl(rules, SELECTS, "min-height"), "max(var(--tap), var(--tap-paint))");
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

test("portrait studio: preview-band pad, guide, overflow and --bg (393×852 hunt)", () => {
  // One pin for the whole portrait carve — assertPinsAll is at its ceiling.
  assert.match(
    css,
    /body\.photo-studio-open\s*\{\s*background:\s*var\(--bg\)\s*;\s*\}[\s\S]*@media\s*\(max-width:\s*640px\)\s*\{[\s\S]*?#photo-studio\s*\{[^}]*--ps-preview-h:\s*calc\(100svh\s*-\s*42svh\s*-\s*var\(--safe-b\)\)[^}]*padding-top:\s*var\(--ps-preview-h\)[^}]*padding-bottom:\s*0[\s\S]*?#ps-guide\s*\{[^}]*top:\s*calc\(var\(--ps-preview-h\)\s*\/\s*2\)[\s\S]*?#ps-panel\s*\{[^}]*overflow:\s*visible[\s\S]*?#ps-body\s*\{[^}]*overscroll-behavior:\s*contain/,
    "portrait: --bg letterbox, pad = 100svh-42svh-safe-b, guide in preview, panel overflow visible, body overscroll contained",
  );
});
