/* ui-fit round 6 — lighting tuner compact foot / short-tab tap floors.
   Pins #lighting-inner-only overrides in css/tuner.css (camera untouched). */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const css = fs.readFileSync(path.join(ROOT, "css/tuner.css"), "utf8");

test("lighting tuner compact foot buttons floor at --tap-paint (rail off and on)", () => {
  assert.match(
    css,
    /#lighting-inner\[data-density="compact"\]\[data-rail="off"\]\s*>\s*\.sheet-foot\s+button,\s*\n\s*#lighting-inner\[data-density="compact"\]\[data-rail="on"\]\s*>\s*\.sheet-foot\s+button\s*\{[^}]*min-height:\s*var\(--tap-paint\)/s,
    "compact foot RESET/COPY/DONE must paint at --tap-paint, not --tap-min",
  );
  assert.match(
    css,
    /#lighting-inner\[data-density="compact"\]\[data-rail="off"\]\s*>\s*\.sheet-foot\s+button,[\s\S]*?padding:\s*calc\(var\(--gap\)\s*\/\s*2\)\s+calc\(var\(--gap\)\s*\*\s*2\s*\/\s*3\)/s,
    "foot padding restored via --gap tokens so tap-paint height is reachable",
  );
});

test("lighting category chips keep a --tap-paint min-width (short labels like FX)", () => {
  assert.match(
    css,
    /#lighting-inner\s+#lt-tabs\s+\.lt-tab\s*\{[^}]*min-width:\s*var\(--tap-paint\)/s,
    "FX and other short category chips are at least --tap-paint wide",
  );
});

test("r6 overrides stay lighting-only (no camtune-inner retarget in the block)", () => {
  const m = css.match(/UI Fit r6: lighting tuner compact tap floor[\s\S]*?\}\s*\/\* #pc-toggle/);
  assert.ok(m, "r6 block present before the #pc-toggle hud carve");
  assert.doesNotMatch(m[0], /#camtune-inner/, "must not retarget camera in the r6 carve");
  assert.doesNotMatch(m[0], /#ct-/, "must not retarget #ct-* camera selectors");
});
