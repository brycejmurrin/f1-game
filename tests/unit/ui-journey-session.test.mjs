/* ui-journey-session.test.mjs — leftover session sheets (Step 4).
 *
 * Results, Standings, Race settings, Audio, and Pause already declare
 * --sheet-w. They also need --fit-at so SheetShape.classifyFit can shrink
 * them at 200% UI size. Standings must not cap its body in viewport units.
 *
 * Run: node --test tests/unit/ui-journey-session.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");

const SESSION = ["results", "standings", "race-settings", "pausemenu", "customize"];

/** `#id { … --fit-at: … }` or a grouped selector list that includes `#id`. */
function fitAtBlocks(css, id) {
  const re = new RegExp(`#[\\w-]+(?:\\s*,\\s*#[\\w-]+)*\\s*\\{[^}]*--fit-at\\s*:[^}]*\\}`, "g");
  return [...css.matchAll(re)]
    .map((m) => m[0])
    .filter((block) => new RegExp(`#${id}\\b`).test(block.split("{")[0]));
}

test("session dialogs declare --fit-at next to --sheet-w so classifyFit can shrink them", () => {
  const css = read("css/components.css");
  for (const id of SESSION) {
    const blocks = fitAtBlocks(css, id);
    assert.ok(blocks.length >= 1, `#${id} must declare --fit-at (inherits onto .sheet)`);
    assert.match(css, new RegExp(`#${id}\\s*\\{[^}]*--sheet-w\\s*:`),
      `#${id} keeps --sheet-w on the dialog id`);
  }
  assert.match(css, /#results\s*\{[^}]*--fit-at:\s*300px/);
  assert.match(css, /#standings\s*\{[^}]*--fit-at:\s*300px/);
  assert.match(css, /#race-settings\s*\{[^}]*--fit-at:\s*300px/);
  assert.match(css, /#customize\s*\{[^}]*--fit-at:\s*300px/);
  assert.match(css, /#pausemenu\s*\{[^}]*--fit-at:\s*260px/,
    "pause is a short button stack — slightly smaller floor than Settings");
});

test("landscape --fit-at uses zoom-correct data-shape selector (not @media orientation)", () => {
  const css = read("css/components.css");
  // Converted from @media (orientation: landscape) to data-shape="wide" (sheetshape.js).
  for (const id of ["results", "standings", "race-settings", "customize"]) {
    assert.match(css, new RegExp(`#${id} \\.sheet:not\\(\\[data-shape="tall"\\]\\)[^{]*\\{[^}]*--fit-at:\\s*220px`),
      `${id} --fit-at must use data-shape selector`);
  }
  assert.match(css, /#pausemenu \.sheet:not\(\[data-shape="tall"\]\)[^{]*\{[^}]*--fit-at:\s*180px/,
    "pausemenu --fit-at must use data-shape selector");
  assert.doesNotMatch(css, /@media\s*\(orientation:\s*landscape\)\s*\{[\s\S]*?#pausemenu/,
    "pausemenu must not use @media orientation for --fit-at (zoom-blind)");
});

test("standings body uses local leftover height, not a viewport svh cap", () => {
  const css = read("css/track-detail.css");
  assert.doesNotMatch(css, /55svh/, "the 55svh cap was zoom-blind");
  const body = css.match(/#standings-body\s*\{([^}]*)\}/);
  assert.ok(body, "#standings-body still has a local-space rule");
  const decl = body[1];
  assert.match(decl, /overflow-y:\s*auto/);
  assert.match(decl, /overscroll-behavior-y:\s*contain/);
  assert.match(decl, /font-size:\s*var\(--fs-micro\)/);
  const noCap = /max-height:\s*none/.test(decl) || !/max-height\s*:/.test(decl);
  const canShrink = /min-height:\s*0/.test(decl);
  assert.ok(noCap && canShrink,
    "#standings-body must yield leftover sheet-grid height (min-height:0, no svh cap)");
});

test("the garage stands down under its own dialogs: customize/teampicker fade #carsetup", () => {
  // The fade family in css/components.css (the "fade the menu under a dim
  // dialog" block) covered select, career and pmsettings hosts but missed the
  // garage — the one host whose own chrome sits close enough behind a
  // translucent sheet to composite into its form fields ("DRIVER" ghosting
  // inside CUSTOMIZE's CODE input). opacity, not hidden, so the turntable
  // canvas keeps its frustum while the dialog is up.
  const css = read("css/components.css");
  assert.match(css,
    /body:has\(#customize:not\(\[hidden\]\)\) #carsetup,\s*\nbody:has\(#teampicker:not\(\[hidden\]\)\) #carsetup \{\s*\n\s*opacity:\s*0;\s*\n\s*pointer-events:\s*none;/,
    "#carsetup must fade under #customize and #teampicker like every other dialog host");
});
