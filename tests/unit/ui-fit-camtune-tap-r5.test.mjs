/* ui-fit round 5 — camera tuner compact foot / preview / copy-select tap floors.
   Pins #camtune-inner-only overrides in css/tuner.css (lighting untouched). */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const css = fs.readFileSync(path.join(ROOT, "css/tuner.css"), "utf8");

test("camera tuner compact foot buttons floor at --tap-paint (rail off and on)", () => {
  assert.match(
    css,
    /#camtune-inner\[data-density="compact"\]\[data-rail="off"\]\s*>\s*\.sheet-foot\s+button,\s*\n\s*#camtune-inner\[data-density="compact"\]\[data-rail="on"\]\s*>\s*\.sheet-foot\s+button\s*\{[^}]*min-height:\s*var\(--tap-paint\)/s,
    "compact foot DONE/RESET/COPY must paint at --tap-paint, not --tap-min",
  );
  assert.match(
    css,
    /#camtune-inner\[data-density="compact"\]\[data-rail="off"\]\s*>\s*\.sheet-foot\s+button,[\s\S]*?padding:\s*calc\(var\(--gap\)\s*\/\s*2\)\s+calc\(var\(--gap\)\s*\*\s*2\s*\/\s*3\)/s,
    "foot padding restored via --gap tokens so tap-paint height is reachable",
  );
});

test("compact rail-on tuner actions use a readable two-column foot", () => {
  assert.match(
    css,
    /\[data-density="compact"\]\[data-rail="on"\]\s*>\s*\.sheet-foot\s*\{[^}]*display:\s*grid;[^}]*grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/s,
    "short landscape rails must not crush RESET/COPY/DONE labels into one row",
  );
  assert.match(
    css,
    /\[data-density="compact"\]\[data-rail="on"\][^}]*\.sheet-foot\s+button\s*\{[^}]*white-space:\s*normal;[^}]*line-height:\s*1\.1/s,
    "rail actions may wrap inside their readable grid cells",
  );
});

test("short phone landscape tuner rails keep action labels readable at normal scale", () => {
  assert.match(
    css,
    /@media \(max-width: 900px\) and \(max-height: 500px\)[\s\S]*?:is\(#lighting-inner, #camtune-inner\)\s*>\s*\.sheet-foot\s*\{[^}]*display:\s*grid;[^}]*grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/s,
    "short landscape tuner feet need two action columns regardless of rail state or UI scale",
  );
});

test("camera tuner compact preview chips and copy-from select floor at --tap-paint", () => {
  assert.match(
    css,
    /#camtune-inner\[data-density="compact"\]\s+#ct-previews\s*>\s*button\s*\{[^}]*min-height:\s*var\(--tap-paint\)/s,
    "MONZA/SPA/MONACO preview chips use --tap-paint",
  );
  assert.match(
    css,
    /#camtune-inner\s+#ct-copyrow\s+select,\s*\n\s*#camtune-inner\s+#ct-copy-from\s*\{[^}]*min-height:\s*var\(--tap-paint\)/s,
    "copy-from select meets --tap-paint",
  );
});

test("camera mode chips keep a --tap-paint min-width (short labels like TV)", () => {
  assert.match(
    css,
    /#camtune-inner\s+#ct-modes\s+\.lt-tab\s*\{[^}]*min-width:\s*var\(--tap-paint\)/s,
    "TV and other short mode chips are at least --tap-paint wide",
  );
});

test("r5 overrides stay camera-only (no lighting-inner retarget in the block)", () => {
  const m = css.match(/UI Fit r5: camera tuner compact tap floor[\s\S]*?\}\s*\/\* @layer components \*\//);
  assert.ok(m, "r5 block present before @layer components close");
  assert.doesNotMatch(m[0], /#lighting-inner/, "must not retarget lighting in the r5 carve");
});
