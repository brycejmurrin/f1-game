/* css-comments.test.mjs — a broken comment eats the rule after it, silently.
 *
 * CSS has no nesting and no escape inside comments: `/ *` opens one and the
 * FIRST `* /` closes it, wherever that lands. When a comment ends early — or
 * never opens — the prose after it does not become a syntax error. It becomes a
 * SELECTOR PRELUDE, and CSS error recovery then consumes everything up to the
 * next `{` and DROPS THAT RULE. No console warning, no visual clue in the
 * source, and the file still parses.
 *
 * Two live instances, found in the 2026-08 cleanup pass by measuring prelude
 * lengths rather than by reading:
 *
 *   css/tuner.css:2   — the header wrote `.adv-*` followed by `/`, i.e. an
 *                       accidental `* /`, closing the comment 4 lines early.
 *                       The swallowed rule was `:root { --dock-w: 0; --dock-px: 0 }`,
 *                       the no-panel defaults the file's own comment promises.
 *   css/menus.css:362 — a block lost its opening `/ *` in an edit, so nine lines
 *                       of prose swallowed `#sel-inner[data-shape="tall"]
 *                       #sel-track-section { flex: 0 0 52% }`. That rule IS the
 *                       fix its own comment describes — the map band collapsing
 *                       to "743x74, a full-width smear" on an upright iPad — so
 *                       the bug was still live while the file explained the cure.
 *
 * THE SIGNATURE IS PRELUDE LENGTH, and it separates cleanly. Once comments are
 * stripped the way a tokenizer strips them, the longest legitimate prelude in
 * this repo is 173 characters (a nine-selector `:active` list in
 * components.css). The two broken ones measured 275 and 759. Prose does not fit
 * in a selector, so the gap is not a coincidence and will not close: a selector
 * list is bounded by how many things share a rule, and a comment is bounded by
 * how much someone had to say.
 *
 * Run: node --test tests/unit/css-comments.test.mjs   (npm run test:tooling-fast)
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const CSS_DIR = path.join(ROOT, "css");

// Comfortably above the real maximum (173) and far below the failures (275+).
const MAX_PRELUDE = 220;

/** Strip comments exactly as a CSS tokenizer does — the FIRST `*␑/` closes. */
function stripComments(src) {
  let out = "", i = 0;
  for (;;) {
    const open = src.indexOf("/*", i);
    if (open < 0) { out += src.slice(i); break; }
    out += src.slice(i, open);
    const close = src.indexOf("*/", open + 2);
    if (close < 0) break;            // unterminated: the rest is comment
    // Replace the comment with a newline so line numbers stay usable.
    out += "\n".repeat((src.slice(open, close).match(/\n/g) || []).length);
    i = close + 2;
  }
  return out;
}

/** Every `{`-block prelude in a stripped stylesheet, with its 1-based line. */
function preludes(stripped) {
  const out = [];
  let prev = 0, line = 1, prevLine = 1;
  for (let i = 0; i < stripped.length; i++) {
    const c = stripped[i];
    if (c === "\n") line++;
    else if (c === "{") {
      out.push({ text: stripped.slice(prev, i).trim(), line: prevLine });
      prev = i + 1; prevLine = line;
    } else if (c === "}") { prev = i + 1; prevLine = line; }
  }
  return out;
}

const FILES = fs.readdirSync(CSS_DIR).filter((f) => f.endsWith(".css")).sort();

test("no stylesheet has a prelude long enough to be prose", () => {
  const bad = [];
  for (const f of FILES) {
    const src = fs.readFileSync(path.join(CSS_DIR, f), "utf8");
    for (const p of preludes(stripComments(src))) {
      if (p.text.length > MAX_PRELUDE) {
        bad.push(`css/${f}:~${p.line} — ${p.text.length}-char prelude: ` +
                 JSON.stringify(p.text.replace(/\s+/g, " ").slice(0, 90)));
      }
    }
  }
  assert.deepEqual(bad, [],
    "a comment almost certainly ended early (or never opened), so the prose became a selector " +
    "and CSS error recovery DROPPED the rule after it. Check for a stray `*/` inside a comment — " +
    "`.adv-*` followed by `/` is the way it happens here — or a block missing its opening `/*`");
});

test("no orphaned comment-closer survives stripping", () => {
  // The shape the prelude check CANNOT see: a comment that quotes the closer
  // pair literally (tokens.css round 7: prose said `*/` in backticks) closes
  // itself mid-sentence. When the garbage lands inside a DECLARATION BLOCK,
  // error recovery eats to the next `;` — no long prelude ever forms, and the
  // eaten declaration was --plate-on-glow: every selected-state glow in the
  // app, gone silently. But the comment's INTENDED closer is still in the
  // file, and after tokenizer-faithful stripping it survives as an orphaned
  // `*` `/` pair — which a healthy stylesheet never contains.
  const bad = [];
  for (const f of FILES) {
    const s = stripComments(fs.readFileSync(path.join(CSS_DIR, f), "utf8"));
    const at = s.indexOf("*/");
    if (at >= 0) bad.push(`css/${f}: orphaned comment closer (line ~${s.slice(0, at).split("\n").length})`);
  }
  assert.deepEqual(bad, [],
    "an orphaned comment closer means an earlier comment ended before its author intended — " +
    "usually prose quoting the closer pair literally. Write it as 'star-slash' in prose.");
});

test("braces balance once comments are stripped", () => {
  // The cheap companion check: an unterminated comment swallows the rest of the
  // file, which shows up here rather than as a prelude.
  const bad = [];
  for (const f of FILES) {
    const s = stripComments(fs.readFileSync(path.join(CSS_DIR, f), "utf8"));
    const open = (s.match(/\{/g) || []).length, close = (s.match(/\}/g) || []).length;
    if (open !== close) bad.push(`css/${f}: ${open} '{' vs ${close} '}'`);
  }
  assert.deepEqual(bad, [], "unbalanced braces after comment stripping");
});
