/* css-rules.mjs — read a stylesheet as RULES, not as text.
 *
 * A unit test that wants "`.dh-card` declares `zoom: var(--sheet-scale, …)`"
 * used to say it as a regex over the raw file — `\.dh-card\s*\{[\s\S]*?zoom:`
 * — which is order-sensitive, whitespace-sensitive, and matches ACROSS rule
 * boundaries (the lazy `[\s\S]*?` happily runs into the next block). This
 * helper walks the sheet once, flattening nested at-rules, and answers by
 * selector + property so a reformat, a reordered declaration, or a comment
 * cannot fail a test while a dropped declaration still does.
 *
 *   const rules = cssRules(read("css/data.css"));
 *   decl(rules, ".dh-card", "zoom")            → "var(--sheet-scale, var(--ui-scale))"
 *   decl(rules, /^#sel-inner\[data-pair="on"\]/, "overflow")
 *   ruleFor(rules, ".dh-card")                  → { selector, decls, context }
 *
 * `context` is the enclosing at-rule chain (`@media (…)`, `@container …`,
 * `@layer x`), so a test can ask for the rule inside a specific query.
 * Selectors are whitespace-normalised (one space, no newlines); a rule list
 * "a, b {…}" keeps its comma-joined selector, so match with a regex when the
 * selector of interest is one of several.
 */

/** Tokenise `css` into flat rules: [{ selector, decls: Map, context: string[] }]. */
export function cssRules(css) {
  const src = String(css).replace(/\/\*[\s\S]*?\*\//g, "");
  const out = [];
  walk(src, [], out);
  return out;
}

function walk(src, context, out) {
  let i = 0;
  const n = src.length;
  while (i < n) {
    const open = src.indexOf("{", i);
    if (open < 0) break;
    // The prelude is everything since the last `}` or `;` at this level.
    let start = open - 1;
    while (start >= 0 && src[start] !== "{" && src[start] !== "}" && src[start] !== ";") start--;
    const prelude = src.slice(start + 1, open).replace(/\s+/g, " ").trim();
    const close = matchBrace(src, open);
    const body = src.slice(open + 1, close);
    if (prelude.startsWith("@") && /^@(media|container|supports|layer|scope|document)/.test(prelude) && body.includes("{")) {
      walk(body, context.concat(prelude), out);
    } else if (prelude.startsWith("@") && body.includes("{") && !/^@(font-face|page|property|counter-style)/.test(prelude)) {
      // @keyframes and friends: not selector rules, skip their frames.
    } else {
      const decls = new Map();
      for (const part of splitDecls(body)) {
        const k = part.indexOf(":");
        if (k <= 0) continue;
        const prop = part.slice(0, k).trim();
        const value = part.slice(k + 1).replace(/\s+/g, " ").trim();
        if (prop) decls.set(prop, value);   // last write wins, like the cascade within a block
      }
      out.push({ selector: prelude, decls, context });
    }
    i = close + 1;
  }
}

function matchBrace(src, open) {
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    if (src[i] === "{") depth++;
    else if (src[i] === "}" && --depth === 0) return i;
  }
  return src.length;
}

/** Split a declaration block on `;` while respecting parentheses and quotes. */
function splitDecls(body) {
  const parts = [];
  let depth = 0, quote = null, cur = "";
  for (const ch of body) {
    if (quote) { cur += ch; if (ch === quote) quote = null; continue; }
    if (ch === '"' || ch === "'") { quote = ch; cur += ch; continue; }
    if (ch === "(") depth++;
    else if (ch === ")") depth--;
    if (ch === ";" && depth === 0) { parts.push(cur); cur = ""; continue; }
    cur += ch;
  }
  if (cur.trim()) parts.push(cur);
  return parts;
}

const selMatches = (rule, sel) => (sel instanceof RegExp ? sel.test(rule.selector) : rule.selector === sel);

/** Every rule whose selector equals `sel` (string) or matches it (RegExp). */
export function rulesFor(rules, sel, opts = {}) {
  return rules.filter((r) => selMatches(r, sel) && (!opts.context || r.context.some((c) => opts.context.test(c))));
}

/** The first rule for `sel` that declares `prop` (or the first rule at all when `prop` is omitted). */
export function ruleFor(rules, sel, prop, opts) {
  const list = rulesFor(rules, sel, opts);
  return (prop ? list.find((r) => r.decls.has(prop)) : list[0]) || null;
}

/** The value `sel` declares for `prop`, or null when no rule for `sel` sets it. */
export function decl(rules, sel, prop, opts) {
  const r = ruleFor(rules, sel, prop, opts);
  return r ? r.decls.get(prop) : null;
}

/** True when SOME rule for `sel` declares `prop` matching `value` (string or RegExp). */
export function declares(rules, sel, prop, value, opts) {
  return rulesFor(rules, sel, opts).some((r) => {
    if (!r.decls.has(prop)) return false;
    const v = r.decls.get(prop);
    return value === undefined ? true : value instanceof RegExp ? value.test(v) : v === value;
  });
}
