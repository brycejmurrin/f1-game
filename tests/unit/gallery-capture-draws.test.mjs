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
// TWO idioms, because two shapes of file need it:
//   opts  — the opener takes { draw: true } and the screenshotting tests pass it
//           (parts-catalog, parts-persistence, parts-setup-ids).
//   shot  — the file has a shot() helper that turns drawing on, waits for real
//           frames, captures, and turns it off again (parts-budget, where the
//           captures are the expensive tests, so opting them out saved nothing).
// A file using EITHER is in scope, and the violation differs per idiom.
const OPTS_IDIOM = /const\s+draw\s*=\s*!!\(\s*opts\s*&&\s*opts\.draw\s*\)/;
// Matched on the MECHANISM, not the helper's name: three other specs
// (hud-audit, menu-survey, ui-audit) have a shot() of their own that never
// touches the render loop, and they are not in scope. What puts a file in scope
// is a shot() that turns drawing back ON.
const SHOT_IDIOM = /async\s+function\s+shot\s*\(\s*page[\s\S]{0,1200}?headless\(false\)/;
const STOPS_BY_DEFAULT = (src) => OPTS_IDIOM.test(src) || SHOT_IDIOM.test(src);
function specsThatStopTheLoop() {
  return fs.readdirSync(SPECS)
    .filter((f) => f.endsWith(".spec.js"))
    .map((f) => ({ file: f, src: fs.readFileSync(path.join(SPECS, f), "utf8") }))
    .filter((s) => STOPS_BY_DEFAULT(s.src) && s.src.includes("page.screenshot"));
}

// Split a spec into its individual test blocks.
const blocksOf = (src) => src.split(/\n(?=\s*(?:test|freshTest)\s*\()/);
const nameOf = (b) => (b.match(/(?:test|freshTest)\s*\(\s*"([^"]+)"/) || [])[1] || null;

test("every gallery screenshot is taken with the render loop running", () => {
  const specs = specsThatStopTheLoop();
  // If this ever finds nothing, the guard has stopped guarding — the three
  // files below are the reason it exists.
  assert.ok(specs.length >= 2,
    `no spec both stops the render loop and screenshots; this guard is now dead code (found ${specs.length})`);

  const bad = [];
  for (const { file, src } of specs) {
    // With a shot() helper the rule is absolute: a test must not reach for
    // page.screenshot itself, because the helper is the only thing that turns
    // drawing back on and waits for a frame. With the opts idiom the test keeps
    // its own screenshot line and opts the OPENER in.
    const viaShot = SHOT_IDIOM.test(src);
    for (const b of blocksOf(src)) {
      // Only real TEST bodies. The first chunk is the file preamble, which is
      // where shot() itself lives — its screenshot is the sanctioned one.
      const name = nameOf(b);
      if (!name) continue;
      if (!b.includes("page.screenshot")) continue;
      if (!viaShot && b.includes("draw: true")) continue;
      bad.push(`${file} › ${name}` + (viaShot ? "  (call shot(page, name), not page.screenshot)" : ""));
    }
  }
  assert.deepEqual(bad, [],
    "these tests screenshot the garage with the render loop stopped, so they capture a STALE canvas.\n" +
    "Either pass { draw: true } to openSetup, or capture through shot() — whichever\n" +
    "idiom the file uses:\n  " + bad.join("\n  "));
});
