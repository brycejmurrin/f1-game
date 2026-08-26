/* sheet-per-screen.test.mjs — ONE `.sheet` PER PARENT, asserted on the shell.
 *
 * Why this invariant is load-bearing: js/game/sheetshape.js classifyFit()
 * writes and removes `--sheet-eff-scale` on el.parentElement — the property
 * every `.sheet` reads back for its zoom compensation. Two sheets sharing a
 * parent would clobber each other's value on every reclassify: whichever
 * classified last would win for BOTH, and the loser's fit cap would silently
 * apply to the wrong sheet. Today the shell keeps exactly one `.sheet` under
 * any parent, which is why the write is safe; this test turns that accident
 * into a contract, so the day a second sheet lands beside an existing one the
 * failure names the fix (scope the property to the sheet, not the parent)
 * instead of shipping a layout bug only visible at non-default UI sizes.
 *
 * Static shell only — index.html holds every screen (AGENTS.md: all static
 * DOM lives there). A sheet injected at runtime is out of scope here.
 *
 * Run: node --test tests/unit/sheet-per-screen.test.mjs   (npm run test:tooling-fast)
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const HTML = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");

const VOID = new Set(["area", "base", "br", "col", "embed", "hr", "img", "input",
  "link", "meta", "param", "source", "track", "wbr"]);

// Walk the shell's tags with a stack so every element knows its parent.
// Attribute values may contain ">" inside quotes, so the tag regex consumes
// quoted runs atomically.
function sheetParents(html) {
  const tagRe = /<(\/?)([a-zA-Z][a-zA-Z0-9-]*)((?:"[^"]*"|'[^']*'|[^>"'])*)>/g;
  const stack = [];       // { name, label } — label = id attr if present, else tag#n
  const parents = [];     // one entry per `.sheet` element: its parent's label
  let n = 0, m;
  while ((m = tagRe.exec(html)) !== null) {
    const [, close, name, attrs] = m;
    if (close) {
      // Close the nearest matching open tag (tolerates the shell's valid HTML).
      for (let i = stack.length - 1; i >= 0; i--) {
        if (stack[i].name === name.toLowerCase()) { stack.length = i; break; }
      }
      continue;
    }
    const tag = name.toLowerCase();
    if (tag.startsWith("!")) continue;
    const idm = /\bid\s*=\s*("([^"]*)"|'([^']*)')/.exec(attrs);
    const clsm = /\bclass\s*=\s*("([^"]*)"|'([^']*)')/.exec(attrs);
    const cls = clsm ? (clsm[2] ?? clsm[3] ?? "") : "";
    const label = idm ? "#" + (idm[2] ?? idm[3]) : tag + "#" + n;
    n++;
    if (/(^|\s)sheet(\s|$)/.test(cls)) {
      const parent = stack[stack.length - 1];
      parents.push(parent ? parent.label : "<root>");
    }
    if (!VOID.has(tag) && !/\/\s*$/.test(attrs)) stack.push({ name: tag, label });
  }
  return parents;
}

test("no two .sheet elements share a parent (the --sheet-eff-scale host)", () => {
  const parents = sheetParents(HTML);
  assert.ok(parents.length >= 10,
    `parser found only ${parents.length} .sheet elements — shell moved or parser broke`);
  const seen = new Map();
  const dupes = [];
  for (const p of parents) {
    if (seen.has(p)) dupes.push(p);
    seen.set(p, (seen.get(p) || 0) + 1);
  }
  assert.deepEqual(dupes, [],
    "these parents host more than one .sheet — sheetshape writes " +
    "--sheet-eff-scale on the PARENT, so co-hosted sheets clobber each " +
    "other's fit cap; scope the property to the sheet before adding a second one");
});
