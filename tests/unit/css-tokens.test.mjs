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
 * or by `setProperty("--x", …)` from JS (js/game/scrollfade.js and
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
