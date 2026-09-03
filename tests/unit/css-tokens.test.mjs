/* css-tokens.test.mjs — every design token must have a consumer.
 *
 * `css/tokens.css` is the design-token sheet: 54 custom properties that the
 * other ten stylesheets build on. A token nobody reads is worse than ordinary
 * dead code, because a token is an INVITATION — the next person writing a rule
 * scans this file for the right variable, finds one whose name fits, uses it,
 * and inherits whatever value was last plausible rather than whatever value is
 * currently true. Nothing was maintaining it, because nothing was reading it.
 *
 * Seven were unused when this guard was written, and the sheet's own prose had
 * already drifted onto them: `--safe-*` are introduced as "ready-made paddings;
 * --safe-w/h the usable box", and `--safe-w`/`--safe-h` had no consumer at all
 * while `--safe-t/r/b/l` did. `--surf-2` sat between `--surf-1` and `--surf-3`,
 * both used, as a middle step nothing ever took.
 *
 * NO ALLOW-LIST, deliberately. The seven were deleted rather than exempted, so
 * this starts at zero and any exception has to be argued for by adding one —
 * which is a conversation, where a pre-seeded list is a place to hide.
 *
 * A token counts as consumed by `var(--x)` anywhere in css/, js/ or index.html,
 * or by `setProperty("--x", …)` from JS (js/ui/scroll-fade.js and
 * js/data/standings.js both write tokens that no stylesheet mentions by name).
 *
 * Run: node --test tests/unit/css-tokens.test.mjs   (npm run test:tooling-fast)
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

/** Strip comments as a CSS tokenizer does, so a commented-out token is not "defined". */
function stripComments(src) {
  let out = "", i = 0;
  for (;;) {
    const open = src.indexOf("/*", i);
    if (open < 0) { out += src.slice(i); break; }
    out += src.slice(i, open);
    const close = src.indexOf("*/", open + 2);
    if (close < 0) break;
    i = close + 2;
  }
  return out;
}

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (/\.(css|js|html)$/.test(e.name)) out.push(p);
  }
  return out;
}

test("every token defined in css/tokens.css is read somewhere", () => {
  const defined = new Set();
  const src = stripComments(fs.readFileSync(path.join(ROOT, "css/tokens.css"), "utf8"));
  for (const m of src.matchAll(/(--[\w-]+)\s*:/g)) defined.add(m[1]);
  assert.ok(defined.size > 30, `only found ${defined.size} tokens — the scan broke, not the sheet`);

  const haystack = [...walk(path.join(ROOT, "css")), ...walk(path.join(ROOT, "js")),
                    path.join(ROOT, "index.html")]
    .map((f) => fs.readFileSync(f, "utf8")).join("\n");

  const unused = [...defined].filter((t) =>
    !new RegExp("var\\(" + t + "\\b").test(haystack) &&
    !new RegExp("setProperty\\([\"']" + t + "\\b").test(haystack)).sort();

  assert.deepEqual(unused, [],
    "a token in css/tokens.css has no consumer. Delete it — an unread token is an invitation to " +
    "use a value nobody has been maintaining. If it is genuinely a public hook, say so here.");
});

// A SHEET THAT DECLARES `.pane-pair` MUST DECLARE `--pair-at`.
//
// js/ui/sheet-shape.js:classifyPair reads that property to decide `data-pair`,
// and its miss branch is silent by design: no value means DELETE the attribute
// and return. So a pair sheet that forgets it does not fail loudly — it renders
// as a plain vertical stack, and because `data-pair="on"` is what puts the panes
// in a `minmax(0, 1fr)` row with `min-height: 0`, the panes never get a bounded
// height and `.pane`'s own `overflow-y: auto` has nothing to scroll against.
//
// That is not hypothetical. #season-setup shipped without it: measured at
// 844x390 the calendar pane stood at its full 1417px, ADD A CIRCUIT began
// 1063px below the fold, and the sheet became one 2526px scroll with BACK and
// APPLY at the bottom of it. The layout looked deliberate enough that only a
// measurement found it, which is exactly the kind of miss a cheap structural
// guard should own rather than a browser spec per screen.
test("every .pane-pair sheet declares the --pair-at that switches it on", () => {
  const html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
  const css = walk(path.join(ROOT, "css"))
    .map((f) => stripComments(fs.readFileSync(f, "utf8"))).join("\n");

  const pairs = [...html.matchAll(/<div id="([\w-]+)"[^>]*class="[^"]*\bpane-pair\b/g)].map((m) => m[1]);
  assert.ok(pairs.length >= 3, `only found ${pairs.length} pane-pair sheets — the scan broke, not the shell`);

  const missing = pairs.filter((id) => !new RegExp("#" + id + "\\b[^{}]*\\{[^{}]*--pair-at\\s*:").test(css));
  assert.deepEqual(missing, [],
    "a .pane-pair sheet has no --pair-at, so js/ui/sheet-shape.js will delete its data-pair and " +
    "the two panes will stack at full height instead of becoming bounded scroll regions. " +
    "Declare it beside the sheet's --sheet-w (620px matches #sel-inner / #cr-inner / #ss-inner).");

  const shape = fs.readFileSync(path.join(ROOT, "js/ui/sheet-shape.js"), "utf8");
  assert.match(css, /\.pane-pair\s*\{[^}]*--pair-compact\s*:\s*off/,
    "`.pane-pair` must default `--pair-compact: off` so compact sheets stack " +
    "without four copies of `--pair-at: 2000px`.");
  assert.match(shape, /--pair-compact/,
    "classifyPair must read --pair-compact after data-density is written.");
  assert.match(shape, /mode === "wide"/,
    "SELECT's compact+horizontal pair is classifyPair's `wide` mode.");
  assert.match(css, /#sel-inner\s*\{[^}]*--pair-compact\s*:\s*wide/);
  assert.doesNotMatch(css, /\[data-density="compact"\]\s*\{[^}]*--pair-at\s*:\s*2000px/,
    "the 2000px compact raise is retired — --pair-compact: off on .pane-pair is the stack.");
});

test("stacked season setup has one reachable vertical scroll owner", () => {
  const css = stripComments(fs.readFileSync(path.join(ROOT, "css/menus.css"), "utf8"));
  const body = css.match(/#ss-inner:not\(\[data-pair="on"\]\)\s*>\s*#ss-body\s*\{([^}]*)\}/);
  assert.ok(body, "stacked #ss-inner needs an explicit #ss-body layout branch");
  assert.match(body[1], /overflow-y\s*:\s*auto\b/,
    "the stacked season body must scroll instead of overflowing into #ss-inner's clip");

  const panes = css.match(/#ss-inner:not\(\[data-pair="on"\]\)\s*>\s*#ss-body\s*>\s*\.pane\s*\{([^}]*)\}/);
  assert.ok(panes, "stacked season panes need a local overflow override");
  assert.match(panes[1], /overflow\s*:\s*visible\b/,
    "natural-height child panes must not contain wheel chaining away from #ss-body");
});
