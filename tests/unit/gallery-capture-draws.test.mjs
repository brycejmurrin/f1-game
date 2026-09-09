/* A gallery screenshot must be taken with the render loop RUNNING.
 *
 * Three garage specs stop the loop by default (`__apex.headless(true)` in their
 * openSetup) because the garage draws a live turntable and
 * getSetupPreviewMesh() re-keys on partsVisualKey — so every option click
 * rebuilds the car mesh and repaints the livery atlas at SwiftShader speed.
 * That is most of what those files cost and none of what their DOM assertions
 * read. parts-budget went 693 s -> 47 s on it.
 *
 * THE HAZARD IS SILENT. An undrawn canvas keeps its LAST frame, so a
 * page.screenshot() taken with the loop stopped still produces a PNG — of a
 * stale car, or of whatever the previous test left there. Nothing fails. The
 * gallery is a capture harness whose product is the image (docs/TESTING.md), so
 * a wrong image that nobody is told about is worse than a slow one.
 *
 * The rule is one line — a test that screenshots opts back in with
 * { draw: true } — and a rule that lives only in a comment is a rule that gets
 * missed on the next test somebody adds. So it is asserted here instead.
 *
 * Run: node --test tests/unit/gallery-capture-draws.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const SPECS = path.join(ROOT, "tests", "specs");

// The files whose SHARED opener stops the loop by default, found by the shape of
// that opener — `headless(!draw)` — rather than by a list, so a fourth file
// adopting the idiom comes under this guard instead of quietly opting out.
//
// NOT any headless(true): a test that stops the loop for ITSELF is a local
// decision and cannot reach another test's screenshot. ui-button-touch does
// exactly that in two DOM-geometry tests while screenshotting in a different
// describe off its own page.goto — flagging it was this guard's first false
// positive, and the fix is to key on the opt-in parameter, which is the whole
// mechanism the hazard depends on.
const STOPS_BY_DEFAULT = /const\s+draw\s*=\s*!!\(\s*opts\s*&&\s*opts\.draw\s*\)/;
function specsThatStopTheLoop() {
  return fs.readdirSync(SPECS)
    .filter((f) => f.endsWith(".spec.js"))
    .map((f) => ({ file: f, src: fs.readFileSync(path.join(SPECS, f), "utf8") }))
    .filter((s) => STOPS_BY_DEFAULT.test(s.src) && s.src.includes("page.screenshot"));
}

// Split a spec into its individual test blocks.
const blocksOf = (src) => src.split(/\n(?=\s*(?:test|freshTest)\s*\()/);
const nameOf = (b) => (b.match(/(?:test|freshTest)\s*\(\s*"([^"]+)"/) || [])[1] || "(unnamed)";

test("every gallery screenshot is taken with the render loop running", () => {
  const specs = specsThatStopTheLoop();
  // If this ever finds nothing, the guard has stopped guarding — the three
  // files below are the reason it exists.
  assert.ok(specs.length >= 2,
    `no spec both stops the render loop and screenshots; this guard is now dead code (found ${specs.length})`);

  const bad = [];
  for (const { file, src } of specs) {
    for (const b of blocksOf(src)) {
      if (!b.includes("page.screenshot")) continue;
      if (b.includes("draw: true")) continue;
      bad.push(`${file} › ${nameOf(b)}`);
    }
  }
  assert.deepEqual(bad, [],
    "these tests screenshot the garage with the render loop stopped, so they capture a STALE canvas.\n" +
    "Pass { draw: true } to openSetup in each:\n  " + bad.join("\n  "));
});
