/* css-faces.test.mjs — an unterminated CSS comment ATE EVERY WEBFONT, and the
 * whole no-browser suite stayed green.
 *
 * WHAT HAPPENED (2026-09-14, ebde6cd..58bc33c3, ~85 minutes on the deploy
 * branch). A commit deleted the four Titillium Web `@font-face` blocks from
 * css/tokens.css and, with them, the terminator that closed the explanatory
 * comment above. CSS comments do not nest and `}` does not end one, so the
 * comment ran on to the NEXT terminator further down the file and swallowed the
 * three Rajdhani faces as well. Measured at that revision: zero live
 * `@font-face` blocks. Every self-hosted face was dead and the game rendered in
 * system fonts — the shipped look, not a test artefact.
 *
 * WHY NOTHING CAUGHT IT. The only red was two BROWSER jobs: golden menu
 * screenshots (the type changed everywhere) and a ui-redesign assertion about a
 * CLOSE button's height inside its title band (39.2px in a 36.2px head — new
 * text metrics). Both were right, and both cost a full browser group and a
 * bisect to read. Nothing cheap fired, because a `grep` for the woff2 filenames
 * still matched all three Rajdhani lines: they were COMMENTED OUT, not removed.
 * That is the trap — to a naive search, a live face and a buried one are
 * byte-identical.
 *
 * NOR WOULD A BRACE-COUNTER HAVE FIRED. The obvious guard is "every `/*` is
 * closed", and at ebde6cd every one was: the comment found a later terminator
 * and simply ate what lay between. Checked against the real revision, that scan
 * reports clean. The only thing that sees this defect is counting the faces in
 * what SURVIVES a parse, which is what the two tests below do:
 *
 *   - every woff2 on disk is named by a LIVE `@font-face` src (7 vs 0 at ebde6cd);
 *   - no font reference exists only inside a comment (3 buried at ebde6cd).
 *
 * The comment-terminator test is kept for the neighbouring case it does own —
 * a comment opened and never closed at all, which kills the rest of the file —
 * and claims nothing more.
 *
 * Anti-vacuity is not asserted here, it is exercised: the last test feeds the
 * check a fixture with ebde6cd's exact shape and fails if the check reports it
 * healthy. A guard written against a silent failure has to be shown to fire, or
 * it becomes the thing it was written to catch.
 *
 * Run: node --test tests/unit/css-faces.test.mjs   (npm run test:tooling-fast)
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const CSS_DIR = path.join(ROOT, "css");
const sheets = fs.readdirSync(CSS_DIR).filter((f) => f.endsWith(".css")).sort();
const read = (f) => fs.readFileSync(path.join(CSS_DIR, f), "utf8");

// Replace every comment with an equal run of spaces, so byte offsets — and so
// line numbers in any message below — survive the strip. Returns the open
// offset when a comment never closes, which IS the defect this file exists for.
function stripComments(src) {
  let out = "", i = 0, unterminated = -1;
  while (i < src.length) {
    const open = src.indexOf("/*", i);
    if (open < 0) { out += src.slice(i); break; }
    out += src.slice(i, open);
    const close = src.indexOf("*/", open + 2);
    if (close < 0) { unterminated = open; out += " ".repeat(src.length - open); break; }
    out += src.slice(open, close + 2).replace(/[^\n]/g, " ");
    i = close + 2;
  }
  return { out, unterminated };
}

const lineOf = (src, off) => src.slice(0, off).split("\n").length;

test("every CSS comment is terminated", () => {
  for (const f of sheets) {
    const src = read(f);
    const { unterminated } = stripComments(src);
    assert.equal(unterminated, -1,
      `css/${f}:${unterminated < 0 ? "" : lineOf(src, unterminated)} opens a comment ` +
      `that is never closed, so the rest of the file is dead CSS. (This is the ` +
      `NEIGHBOUR of the 2026-09-14 webfont loss, not that bug: there the comment ` +
      `did close, on a terminator further down, having eaten the faces between. ` +
      `The two tests below are what catch that one.)`);
  }
});

test("every shipped woff2 is named by a LIVE @font-face", () => {
  const onDisk = fs.readdirSync(path.join(ROOT, "assets/fonts"))
    .filter((f) => f.endsWith(".woff2")).sort();
  assert.ok(onDisk.length > 0, "assets/fonts must contain woff2 files");

  const live = sheets.map((f) => stripComments(read(f)).out).join("\n");
  const faces = live.match(/@font-face\s*\{[^}]*\}/g) || [];
  const named = new Set();
  for (const b of faces)
    for (const m of b.matchAll(/assets\/fonts\/([A-Za-z0-9._-]+\.woff2)/g)) named.add(m[1]);

  assert.deepEqual([...named].sort(), onDisk,
    `the live @font-face blocks name [${[...named].sort()}] but assets/fonts holds ` +
    `[${onDisk}]. A face on disk with no live rule never loads; a rule naming a ` +
    `file that is gone is a 404 on every page view.`);
  assert.equal(faces.length, onDisk.length,
    `${faces.length} live @font-face blocks for ${onDisk.length} font files — one ` +
    `block per face is the convention in css/tokens.css`);
});

test("no font reference survives ONLY inside a comment", () => {
  for (const f of sheets) {
    const src = read(f);
    const live = stripComments(src).out;
    const all = new Set((src.match(/assets\/fonts\/[A-Za-z0-9._-]+\.woff2/g) || []));
    const kept = new Set((live.match(/assets\/fonts\/[A-Za-z0-9._-]+\.woff2/g) || []));
    const buried = [...all].filter((u) => !kept.has(u));
    assert.deepEqual(buried, [],
      `css/${f} mentions ${buried.join(", ")} only inside a comment. grep cannot ` +
      `tell that apart from a working @font-face, which is why this test parses.`);
  }
});

test("the guard fires on ebde6cd's shape, not just on healthy input", () => {
  // The defect, reduced to its bones and taken from the real revision: a
  // comment whose terminator is gone, faces in the gap, and a LATER terminator
  // that closes it. Every `/*` here is balanced — which is the point.
  const broken = [
    "/* Titillium Web is the family the real F1 site uses.",
    "   @font-face {",                       // the terminator that used to be here is gone
    "@font-face {",
    '  font-family: "Rajdhani"; font-weight: 500;',
    '  src: url("../assets/fonts/rajdhani-latin-500-normal.woff2") format("woff2");',
    "}",
    "/* the next comment in the file closes the runaway one */",
    ":root { --font-hud: Rajdhani, sans-serif; }",
  ].join("\n");

  const { out, unterminated } = stripComments(broken);
  assert.equal(unterminated, -1,
    "the fixture is supposed to be brace-balanced — that is what made the real " +
    "bug invisible; if it is not, it is not reproducing ebde6cd");
  assert.equal((out.match(/@font-face\s*\{[^}]*\}/g) || []).length, 0,
    "the surviving text still reads as a live @font-face, so the strip is not " +
    "modelling how a browser parses this and both tests above are vacuous");
  assert.deepEqual(out.match(/assets\/fonts\/[A-Za-z0-9._-]+\.woff2/g), null,
    "a buried font url survived the strip — the only signal this file has");
});
