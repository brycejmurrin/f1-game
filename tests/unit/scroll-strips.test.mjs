/* scroll-strips.test.mjs — every SIDEWAYS scroll region declares the whole
 * pattern, not most of it.
 *
 * WHY THIS EXISTS. `.pane` (css/components.css) is the primitive for a region
 * that scrolls DOWN, and it is complete: `overflow-x: hidden`,
 * `overscroll-behavior-y: contain`, `touch-action: pan-y`, `scrollbar-gutter:
 * stable`. Every consumer gets all four by adding one class.
 *
 * There is no horizontal twin, so the four screens that need one each invented
 * it — the garage's category rail, the data hub's tab strip, and the lighting
 * tuner's chips in each of its two tiers. Found 2026-08-12, they disagreed:
 *
 *     strip                     overscroll-x   touch-action   scrollbar
 *     garage #cs-tabs           contain        pan-x          hidden
 *     data hub .dh-tabs         MISSING        MISSING        hidden
 *     tuner .lt-tabs (compact)  contain        pan-x          hidden
 *     tuner .lt-tabs (flying)   MISSING        pan-x          MISSING
 *
 * Neither omission is cosmetic. Without `touch-action: pan-x` the browser may
 * hand a diagonal drag to an ancestor, so the strip feels dead or the panel
 * behind it moves. Without `overscroll-behavior-x: contain` a flick past the
 * last chip CHAINS outward — and on iOS the thing it chains into is the
 * back-navigation gesture, so overscrolling a tab strip can leave the page.
 *
 * AND NOTHING COULD SEE IT. This is behaviour, not geometry: every box is the
 * right size in the right place, so tools/ui/layout-audit.mjs scores all four
 * green, at every viewport and every scale. The only way to find it was to read
 * the four rules side by side.
 *
 * A no-build codebase cannot express "share these four declarations" without
 * either a class the conditional tiers cannot apply (the same element is a GRID
 * in one tier and a strip in another) or a primitive that names its own
 * consumers. So the rules stay where they are and this asserts they agree —
 * the same answer tools/README.md and docs/COMPONENTS.md already use.
 *
 * Run: node --test tests/unit/scroll-strips.test.mjs  (npm run test:tooling-fast)
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const CSS = path.join(ROOT, "css");

/** Every INNERMOST block — the ones that hold declarations — with its prelude
 *  and the line it starts on.
 *
 *  Innermost, not top-level: every file here wraps its rules in `@layer
 *  components { … }`, and half of them nest again inside `@media` or
 *  `@container`. A depth-1 scan sees one block per file and finds nothing, which
 *  is exactly what the first version of this did — both tests failed, including
 *  the anti-vacuity one, which is the only reason it was caught rather than
 *  shipping green and vacuous. A block with no `{` inside it is a declaration
 *  block at any depth. */
function blocks(src) {
  const clean = src.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "));
  const out = [];
  const re = /([^{}]*)\{([^{}]*)\}/g;
  let m;
  while ((m = re.exec(clean))) {
    const line = clean.slice(0, m.index + m[1].length).split("\n").length;
    out.push({ prelude: m[1].trim().replace(/\s+/g, " "), body: m[2], line });
  }
  return out;
}

test("every horizontal scroll strip declares the whole pattern", () => {
  // The three declarations that make a sideways strip actually pan under a
  // thumb. `scrollbar-width` is deliberately NOT required — a visible scrollbar
  // is a look, not a behaviour, and a strip is free to want one.
  const REQUIRED = ["overscroll-behavior-x", "touch-action"];
  const bad = [];
  for (const f of fs.readdirSync(CSS).filter((n) => n.endsWith(".css"))) {
    const src = fs.readFileSync(path.join(CSS, f), "utf8");
    for (const b of blocks(src)) {
      // A block that opts into horizontal scrolling. `overflow: auto` shorthand
      // counts too — it turns BOTH axes on, which is how a region becomes a
      // sideways scroller without anyone deciding it should be one.
      const horiz = /overflow-x:\s*(auto|scroll)/.test(b.body)
        || /overflow:\s*(auto|scroll)\b/.test(b.body);
      if (!horiz) continue;
      const missing = REQUIRED.filter((d) => !new RegExp(`${d}\\s*:`).test(b.body));
      if (missing.length) {
        bad.push(`css/${f}:${b.line} — ${b.prelude.slice(0, 70)} is missing ${missing.join(", ")}`);
      }
    }
  }
  assert.deepEqual(bad, [],
    "a region scrolls sideways without saying how a thumb should drive it. " +
    "`touch-action: pan-x` claims the gesture, or an ancestor may take it; " +
    "`overscroll-behavior-x: contain` stops a flick past the end chaining out, " +
    "which on iOS is the back-navigation gesture. Neither is visible to the " +
    "layout audit — every box is the right size, so the cell scores green");
});

/* THE VERTICAL HALF, asserting ONE declaration rather than two.
 *
 * `overscroll-behavior-y: contain` is unambiguous: a flick at the end of an
 * inner list should not move whatever is behind it. `.pane` sets it, so every
 * screen built from the primitive is covered — and the F1 data hub is not. It
 * rolls its own six scroll regions (`.dh-split-L/R`, `.dh-tpopup-body`,
 * `.dh-telem-main/side`), the largest screen in the app and the one least
 * covered by the shared vocabulary. Found by reading, not by measuring: nothing
 * about the boxes is wrong.
 *
 * `touch-action` is deliberately NOT required here. On a vertical region it is
 * usually `pan-y`, but a region that also wants a horizontal gesture inside it
 * would be broken by that, and this guard cannot tell the two apart. Requiring
 * only what is always right keeps it from becoming a rule people work around. */
test("every vertical scroll region contains its own overscroll", () => {
  const bad = [];
  for (const f of fs.readdirSync(CSS).filter((n) => n.endsWith(".css"))) {
    const src = fs.readFileSync(path.join(CSS, f), "utf8");
    for (const b of blocks(src)) {
      if (!/overflow-y:\s*(auto|scroll)/.test(b.body)) continue;
      if (/overscroll-behavior(-y)?\s*:/.test(b.body)) continue;
      bad.push(`css/${f}:${b.line} — ${b.prelude.slice(0, 70)}`);
    }
  }
  assert.deepEqual(bad, [],
    "a region scrolls vertically without `overscroll-behavior-y: contain`, so a " +
    "flick at the end of it chains into whatever is behind — the screen, or the " +
    "page. `.pane` (css/components.css) sets it; anything not built on the " +
    "primitive has to say it itself");
});

test("the strips are found at all — anti-vacuity", () => {
  // A guard whose matcher silently stops matching is worse than no guard: it
  // goes green forever. This asserts the search still finds the family it was
  // written for.
  let found = 0;
  for (const f of fs.readdirSync(CSS).filter((n) => n.endsWith(".css"))) {
    for (const b of blocks(fs.readFileSync(path.join(CSS, f), "utf8"))) {
      if (/overflow-x:\s*(auto|scroll)/.test(b.body)) found++;
    }
  }
  assert.ok(found >= 4,
    `expected at least the four known horizontal strips, found ${found} — the ` +
    "block parser or the declaration spelling has drifted and this guard is now vacuous");
});
