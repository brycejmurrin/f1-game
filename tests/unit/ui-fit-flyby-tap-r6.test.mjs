/* ui-fit round 6 — flyby editor compact foot / pose-select tap floors.
   Pins #flyby-inner / #fb-*-only overrides in css/tuner.css (camera/lighting untouched). */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const css = fs.readFileSync(path.join(ROOT, "css/tuner.css"), "utf8");

test("flyby editor compact foot buttons floor at --tap-paint (rail off and on)", () => {
  assert.match(
    css,
    /#flyby-inner\[data-density="compact"\]\s*>\s*\.sheet-foot\s+button,\s*\n\s*#flyby-inner\[data-density="compact"\]\[data-rail="on"\]\s*>\s*\.sheet-foot\s+button\s*\{[^}]*min-height:\s*var\(--tap-paint\)/s,
    "compact foot RESET/COPY/DONE must paint at --tap-paint, not --tap-min",
  );
  assert.match(
    css,
    /#flyby-inner\[data-density="compact"\]\s*>\s*\.sheet-foot\s+button,[\s\S]*?padding:\s*calc\(var\(--gap\)\s*\/\s*2\)\s+calc\(var\(--gap\)\s*\*\s*2\s*\/\s*3\)/s,
    "foot padding restored via --gap tokens so tap-paint height is reachable",
  );
});

test("flyby foot stays on --tap-paint outside compact (portrait 51px vs house 52)", () => {
  assert.match(
    css,
    /#flyby-inner\s*>\s*\.sheet-foot\s+button\s*\{[^}]*min-height:\s*var\(--tap-paint\)/s,
    "non-compact RESET/COPY also floor at --tap-paint",
  );
});

test("flyby pose selects floor at --tap-paint (#fb-in-ease / #fb-in-eye*-at)", () => {
  assert.match(
    css,
    /#flyby-inner\s+#fb-rows\s+select,\s*\n\s*#flyby-inner\s+:is\(#fb-in-ease, \[id\^="fb-in-eye"\]\[id\$="-at"\], \[id\^="fb-in-look"\]\[id\$="-at"\]\)\s*\{[^}]*min-height:\s*var\(--tap-paint\)/s,
    "EASE and pose ANCHOR selects must paint at --tap-paint, not --tap-min",
  );
});

test("r6 overrides stay flyby-only (no camtune / lighting retarget in the block)", () => {
  const m = css.match(/UI Fit r6: flyby editor compact tap floor[\s\S]*?(?=\/\* GARAGE ANGLE)/);
  assert.ok(m, "r6 flyby block present before garage-angle and shared workspace styles");
  assert.doesNotMatch(m[0], /#camtune-inner/, "must not retarget camera in the r6 carve");
  assert.doesNotMatch(m[0], /#lighting-inner/, "must not retarget lighting in the r6 carve");
  assert.doesNotMatch(m[0], /#ct-/, "must not retarget #ct-* camera selectors");
  assert.doesNotMatch(m[0], /#lt-/, "must not retarget #lt-* lighting selectors");
});
