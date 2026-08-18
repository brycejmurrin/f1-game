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

const SESSION = ["results", "standings", "race-settings", "pausemenu", "audioset"];

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
  assert.match(css, /#audioset\s*\{[^}]*--fit-at:\s*300px/);
  assert.match(css, /#pausemenu\s*\{[^}]*--fit-at:\s*260px/,
    "pause is a short button stack — slightly smaller floor than Settings");
});

test("landscape --fit-at uses a viewport orientation query", () => {
  const css = read("css/components.css");
  const land = css.match(/@media\s*\(orientation:\s*landscape\)\s*\{[\s\S]*?#pausemenu[\s\S]*?\}/);
  assert.ok(land, "pause landscape --fit-at lives in an orientation query");
  assert.match(css, /@media\s*\(orientation:\s*landscape\)[\s\S]*#results[\s\S]*--fit-at:\s*220px/);
  assert.match(css, /@media\s*\(orientation:\s*landscape\)[\s\S]*#standings[\s\S]*--fit-at:\s*220px/);
  assert.match(css, /@media\s*\(orientation:\s*landscape\)[\s\S]*#race-settings[\s\S]*--fit-at:\s*220px/);
  assert.match(css, /@media\s*\(orientation:\s*landscape\)[\s\S]*#audioset[\s\S]*--fit-at:\s*220px/);
  assert.match(css, /@media\s*\(orientation:\s*landscape\)[\s\S]*#pausemenu\s*\{[^}]*--fit-at:\s*180px/);
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
