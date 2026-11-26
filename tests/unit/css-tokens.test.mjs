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
import { readCssSource } from "../helpers/css-source.mjs";
import { cssRules } from "../helpers/css-rules.mjs";
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
    "SEASON SETUP's compact+horizontal pair is classifyPair's `wide` mode.");
  // #sel-inner left the pane-pair primitive in the 2026-09 picker redesign
  // (flag strip over a hero — one column, no pair to keep), so only the
  // season-setup sheet still declares the wide mode.
  assert.match(css, /#ss-inner\s*\{[^}]*--pair-compact\s*:\s*wide/);
  assert.doesNotMatch(css, /\[data-density="compact"\]\s*\{[^}]*--pair-at\s*:\s*2000px/,
    "the 2000px compact raise is retired — --pair-compact: off on .pane-pair is the stack.");
});

test("stacked season setup has one reachable vertical scroll owner", () => {
  const css = stripComments(readCssSource("css/menus.css"));
  const body = css.match(/#ss-inner:not\(\[data-pair="on"\]\)\s*>\s*#ss-body\s*\{([^}]*)\}/);
  assert.ok(body, "stacked #ss-inner needs an explicit #ss-body layout branch");
  assert.match(body[1], /overflow-y\s*:\s*auto\b/,
    "the stacked season body must scroll instead of overflowing into #ss-inner's clip");

  const panes = css.match(/#ss-inner:not\(\[data-pair="on"\]\)\s*>\s*#ss-body\s*>\s*\.pane\s*\{([^}]*)\}/);
  assert.ok(panes, "stacked season panes need a local overflow override");
  assert.match(panes[1], /overflow\s*:\s*visible\b/,
    "natural-height child panes must not contain wheel chaining away from #ss-body");
});

/* #6751: the type-scale roots --label and [data-dep-reason] paint >= 12 px at every UI SIZE, and --label follows TEXT
 * SIZE. A BEHAVIOUR test: it runs the cascade of css/tokens.css (specificity, then source order; html, then body
 * inheriting from it), substitutes var() and computes max()/calc() to the PAINTED px (own px x --ui-scale, the menu
 * zoom), as getComputedStyle would. A reworded rule that still paints the same passes; one that paints under the floor
 * fails. The bug it caught: a touch body re-declared a flat 14px --label (9.8 painted at UI SIZE 70). */
const tokenRules = cssRules(fs.readFileSync(path.join(ROOT, "css/tokens.css"), "utf8"))
  .map((r, order) => ({ ...r, order })).filter((r) => r.context.every((c) => c.slice(0, 6) !== "@media"));
const specificity = (sel) => (sel.split("[").length - 1) + (sel.split(".").length - 1) + (sel.split(":root").length - 1);
function cascade(selectors, inherited, inline = []) {
  const vars = new Map(inherited);
  tokenRules.filter((r) => selectors.has(r.selector))
    .sort((a, b) => specificity(a.selector) - specificity(b.selector) || a.order - b.order)
    .forEach((r) => { for (const [k, v] of r.decls) if (k.slice(0, 2) === "--") vars.set(k, v); });
  for (const [k, v] of inline) vars.set(k, v);   // an inline style beats every rule
  // A custom property's computed value has its var() references substituted on the element that declares it.
  for (const [k, v] of vars) vars.set(k, substitute(v, vars, 0));
  return vars;
}
function substitute(v, vars, depth) {
  assert.ok(depth < 20, `var() cycle at ${v}`);
  const at = v.lastIndexOf("var(");
  if (at < 0) return v;
  let d = 0, end = at + 3;
  for (; end < v.length; end++) { if (v[end] === "(") d++; else if (v[end] === ")" && --d === 0) break; }
  const inner = v.slice(at + 4, end), comma = inner.indexOf(",");
  const name = (comma < 0 ? inner : inner.slice(0, comma)).trim();
  const own = vars.get(name);
  const val = own !== undefined ? substitute(own, vars, depth + 1) : comma < 0 ? "" : inner.slice(comma + 1).trim();
  return substitute(v.slice(0, at) + val + v.slice(end + 1), vars, depth + 1);
}
/** Evaluate a resolved length (px, em, bare numbers, calc/max/min, + - * /) to px. */
function px(expr, emPx) {
  const toks = expr.replace(/\s+/g, " ").match(/-?\d*\.?\d+(?:px|em)?|[a-z]+\(|[()+\-*\/,]/g);
  let i = 0;
  const peek = () => toks[i], next = () => toks[i++];
  function primary() {
    const t = next();
    if (t === "(" || t === "calc(") { const v = sum(); next(); return v; }
    if (t === "max(" || t === "min(") {
      const args = [sum()];
      while (peek() === ",") { next(); args.push(sum()); }
      next();
      return t === "max(" ? Math.max(...args) : Math.min(...args);
    }
    const n = parseFloat(t);
    return t.slice(-2) === "em" ? n * emPx : n;
  }
  function product() {
    let v = primary();
    while (peek() === "*" || peek() === "/") v = next() === "*" ? v * primary() : v / primary();
    return v;
  }
  function sum() {
    let v = product();
    while (peek() === "+" || peek() === "-") v = next() === "+" ? v + product() : v - product();
    return v;
  }
  const v = sum();
  assert.equal(i, toks.length, `unparsed tail in ${expr}`);
  return v;
}
/** The custom properties a menu element under <body> inherits, at a UI SIZE, TEXT SIZE and input mode. */
function menuVars({ scale, text, touch }) {
  // js/ui/scale.js writes --ui-scale inline on <html>.
  const html = cascade(new Set([":root", `:root[data-text-size="${text}"]`]), [], [["--ui-scale", String(scale)]]);
  return cascade(new Set(["body", touch ? "body:not(.desktop)" : "body.desktop"]), html);
}
const SCALES = [0.5, 0.6, 0.7, 0.85, 1, 1.15, 1.5];

test("--label paints at least 12 px at every UI SIZE, touch and mouse, every TEXT SIZE (#6751)", () => {
  for (const touch of [true, false]) for (const text of ["normal", "large", "larger"]) for (const scale of SCALES) {
    const painted = px(menuVars({ scale, text, touch }).get("--label"), 16) * scale;
    assert.ok(painted >= 11.995, `${touch ? "touch" : "mouse"} UI SIZE ${scale * 100}% TEXT ${text}: --label paints ${painted.toFixed(2)} px`);
  }
});

test("--label grows with TEXT SIZE and is the same for touch and mouse (#6751)", () => {
  for (const touch of [true, false]) {
    const at = (text) => px(menuVars({ scale: 1, text, touch }).get("--label"), 16);
    assert.ok(at("large") > at("normal") && at("larger") > at("large"),
      `${touch ? "touch" : "mouse"}: normal ${at("normal")} < large ${at("large")} < larger ${at("larger")}`);
  }
  for (const scale of SCALES) {
    const a = px(menuVars({ scale, text: "normal", touch: true }).get("--label"), 16);
    const b = px(menuVars({ scale, text: "normal", touch: false }).get("--label"), 16);
    assert.equal(a, b, `UI SIZE ${scale * 100}%: a touch body must not shadow the floored --label`);
  }
});

test("a [data-dep-reason] line paints at least 12 px and keeps its 0.8em where that already clears (#6751)", () => {
  const rule = cssRules(fs.readFileSync(path.join(ROOT, "css/settings-controls.css"), "utf8"))
    .filter((r) => r.selector === "[data-dep-reason]" && r.decls.has("font-size")).pop();
  assert.ok(rule, "[data-dep-reason] declares a font-size");
  for (const touch of [true, false]) for (const scale of SCALES) {
    const vars = menuVars({ scale, text: "normal", touch });
    // The row it sits in: 16 px own type (the 8.96 px measurement at UI SIZE 70 was 0.8 x 16 x 0.7).
    const own = px(substitute(rule.decls.get("font-size"), vars, 0), 16);
    assert.ok(own * scale >= 11.995, `UI SIZE ${scale * 100}%: paints ${(own * scale).toFixed(2)} px`);
    if (0.8 * 16 * scale >= 12) assert.equal(own, 0.8 * 16, `UI SIZE ${scale * 100}%: the floor must not enlarge a line that already clears 12 px`);
  }
});
