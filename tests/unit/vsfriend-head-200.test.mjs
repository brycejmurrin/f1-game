/* vsfriend-head-200.test.mjs — compact VS Friend title band must not clip
 * #dlg-vsfriend when UI SIZE is 200% on desktop.
 *
 * layout-audit desktop-1440x900@200 reported #dlg-vsfriend clipped by #vs-head
 * (top 7 / bottom 2) because the compact head locked height to --tap-paint
 * under border-box while still inheriting .sheet-head vertical padding from
 * @layer components (#3306).
 *
 * Run: node --test tests/unit/vsfriend-head-200.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const CSS = fs.readFileSync(path.join(ROOT, "css/overlays.css"), "utf8");

/** First `{…}` block whose selector matches `sel` (exact line start). */
function block(sel) {
  const re = new RegExp(
    String.raw`(?:^|\n)` + sel.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + String.raw`\s*\{`,
  );
  const m = re.exec(CSS);
  assert.ok(m, `missing rule ${sel}`);
  const start = m.index + m[0].length;
  let depth = 1, i = start;
  for (; i < CSS.length && depth > 0; i++) {
    if (CSS[i] === "{") depth++;
    else if (CSS[i] === "}") depth--;
  }
  return CSS.slice(start, i - 1);
}

function decl(sel, prop) {
  const body = block(sel);
  const m = body.match(new RegExp(String.raw`(^|;|\n)\s*` + prop.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + String.raw`\s*:\s*([^;]+)`, "m"));
  assert.ok(m, `${sel} missing ${prop}`);
  return m[2].trim();
}

const HEAD = '#vsfriend-inner[data-density="compact"] > #vs-head';
const TITLE = '#vsfriend-inner[data-density="compact"] > #vs-head > #dlg-vsfriend';

test("compact #vs-head zeros vertical padding so --tap-paint fits #dlg-vsfriend (#3306)", () => {
  assert.equal(decl(HEAD, "padding-top"), "0",
    "compact head must beat .sheet-head padding-top (border-box + --tap-paint)");
  assert.equal(decl(HEAD, "padding-bottom"), "0",
    "compact head must beat .sheet-head padding-bottom");
  assert.equal(decl(HEAD, "min-height"), "var(--tap-paint)",
    "title band still clears absolute CLOSE");
  assert.equal(decl(HEAD, "height"), "var(--tap-paint)",
    "title band height stays locked with CLOSE");
  assert.equal(decl(HEAD, "max-height"), "var(--tap-paint)");
  assert.equal(decl(HEAD, "overflow"), "hidden");
  assert.equal(decl(HEAD, "box-sizing"), "border-box");
});

test("compact #dlg-vsfriend keeps line-height 1 inside the --tap-paint band (#3306)", () => {
  assert.equal(decl(TITLE, "line-height"), "1");
  assert.equal(decl(TITLE, "margin"), "0");
});
