/* js-strip.test.mjs — tools/lib/js-strip.mjs keeps every token of every eager script (acorn reads the same token
 * stream before and after) and lands between terser's shipped size and the raw size. eagerCodeBytes counts it
 * (docs/notes/RATCHET-REVIEW-2026-11-20.md). Run: node --test tests/unit/js-strip.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
import { stripJs } from "../../tools/lib/js-strip.mjs";
import { wallNow } from "../../tools/check/boot-wall.mjs";

const acorn = createRequire(import.meta.url)("acorn");
const ROOT = new URL("../../", import.meta.url);
const tokens = (s) => [...acorn.tokenizer(s, { ecmaVersion: "latest", sourceType: "script", allowHashBang: true })]
  .map((t) => `${t.type.label}\u0000${t.value && typeof t.value === "object" ? `${t.value.pattern}/${t.value.flags}` : t.value ?? ""}`);

test("the shapes that trip a naive stripper keep their tokens", () => {
  const cases = [
    "a = b / c / d; e = /x\\/y[/]/g.test(f)",
    "return /re/.test(s)", "x = f.in / 10", "y = a++ / 2", "z = (a) / 2",
    "q = `a ${ b /* c */ } d ${ `n ${ 1 } m` } e` + 1", "n = 1 .toString(); m = .5 + 1e-3",
    "a = b\n++c", "x = a + +b - -c", "s = 'it\\'s // not a comment'", "if (a) { /x/.test(b) }",
    "let o = { a: 1 } /* block\n */ \n g()",
  ];
  for (const c of cases) assert.deepEqual(tokens(stripJs(c)), tokens(c), c);
  assert.equal(stripJs("a = 1 // c\nb = 2"), "a=1\nb=2", "a newline stays where one was (ASI)");
});

test("every eager script: the same token stream, and the count sits between terser's and the raw size", async () => {
  const { files, bytes, codeBytes } = wallNow();
  for (const f of files) {
    const src = fs.readFileSync(new URL(f, ROOT), "utf8");
    assert.deepEqual(tokens(stripJs(src)), tokens(src), f);
  }
  assert.ok(codeBytes < bytes, `${codeBytes} < ${bytes}`);
  // terser (what Pages ships) also mangles local names, so it is smaller still; the gap is names, not comments.
  const { minifySource } = await import("../../tools/desktop/minify.mjs");
  let shipped = 0;
  for (const f of files.slice(0, 40)) shipped += Buffer.byteLength((await minifySource(fs.readFileSync(new URL(f, ROOT), "utf8"), f)).code);
  const ours = files.slice(0, 40).reduce((n, f) => n + Buffer.byteLength(stripJs(fs.readFileSync(new URL(f, ROOT), "utf8"))), 0);
  assert.ok(ours >= shipped && ours <= shipped * 1.5, `stripped ${ours} vs terser ${shipped} on the first 40 eager scripts`);
});
