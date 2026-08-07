// EVERY RULE IN A LAYERED STYLESHEET MUST BE INSIDE ITS LAYER.
//
// WHY. css/tokens.css declares the cascade order once:
//
//     @layer reset, base, components, hud, overlays;
//
// and every other stylesheet opens with `@layer <name> {` and is meant to close
// it on its last line. The catch is that UNLAYERED normal declarations outrank
// EVERY cascade layer — that is the spec, not a quirk — so a rule that falls
// outside its file's layer silently beats every layered rule anywhere,
// regardless of specificity.
//
// This is not hypothetical. css/menus.css carried a stray `}` that closed
// `@layer components` two hundred lines early, which put the preview card's base
// rules outside the cascade. The result: `#sel-track-preview #sel-preview-elev
// { display: none }` — two IDs, inside the layer, written specifically to drop
// the elevation strip on a phone — lost to `#sel-preview-elev { display: block }`
// — one ID, unlayered. The strip stayed on screen, ate 30px of a 635px sheet,
// and the file accumulated comments blaming source order and container-query
// specificity for what was actually layer precedence. Three other stylesheets
// had picked up the same defect by having rules appended after their closing
// brace.
//
// The failure is invisible: no parse error, no console warning, and the page
// looks *almost* right. So it needs a test.
import { test } from "node:test";
import assert from "node:assert";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CSS_DIR = path.join(ROOT, "css");

// Braces inside comments are prose, not syntax — "{" shows up in more than one
// explanatory note in these files. Blank the comments, keeping line numbers.
function stripComments(text) {
  const out = [];
  let i = 0;
  while (i < text.length) {
    if (text.startsWith("/*", i)) {
      let j = text.indexOf("*/", i + 2);
      j = j < 0 ? text.length : j + 2;
      out.push("\n".repeat((text.slice(i, j).match(/\n/g) || []).length));
      i = j;
    } else {
      out.push(text[i]);
      i += 1;
    }
  }
  return out.join("");
}

const files = fs.readdirSync(CSS_DIR).filter((f) => f.endsWith(".css")).sort();

for (const file of files) {
  const raw = fs.readFileSync(path.join(CSS_DIR, file), "utf8");
  const src = stripComments(raw);
  const lines = src.split("\n");
  const first = (lines.find((l) => l.trim()) || "").trim();
  // tokens.css declares the order and layers its sections individually; files
  // that do not open with a single wrapping `@layer x {` are not this shape.
  if (!/^@layer\s+[\w-]+\s*\{/.test(first)) continue;

  test(`${file}: every rule is inside its @layer`, () => {
    let depth = 0;
    let closedAt = null;
    let lastContent = 0;
    lines.forEach((line, idx) => {
      const n = idx + 1;
      const before = depth;
      depth += (line.match(/\{/g) || []).length;
      depth -= (line.match(/\}/g) || []).length;
      if (before === 1 && depth === 0 && closedAt === null && n > 1) closedAt = n;
      if (line.trim()) lastContent = n;
    });

    assert.strictEqual(depth, 0,
      `${file} has unbalanced braces (final depth ${depth}). A stray '}' closes ` +
      `the layer early and everything after it becomes unlayered, which outranks ` +
      `every layer in the project.`);

    assert.ok(closedAt !== null, `${file} never closes its @layer block`);
    assert.strictEqual(closedAt, lastContent,
      `${file} closes its @layer at line ${closedAt} but has rules through line ` +
      `${lastContent}. Those ${lastContent - closedAt} trailing lines are UNLAYERED ` +
      `and therefore beat every layered rule in the project regardless of ` +
      `specificity. Move them inside the layer (or, if the closing brace is a ` +
      `stray, delete it).`);
  });
}

test("every stylesheet except tokens.css opens with its @layer wrapper", () => {
  // The per-file test above SKIPS files that don't open with `@layer x {` —
  // so a file that loses its wrapper entirely (the worst version of the
  // defect this guard exists for: every rule unlayered, outranking every
  // layer in the project) would silently exit the guard. Pin the roster.
  const unwrapped = files.filter((f) => {
    if (f === "tokens.css") return false;   // declares the order; sections layer individually
    const s = stripComments(fs.readFileSync(path.join(CSS_DIR, f), "utf8"));
    const first = (s.split("\n").find((l) => l.trim()) || "").trim();
    return !/^@layer\s+[\w-]+\s*\{/.test(first);
  });
  assert.deepStrictEqual(unwrapped, [],
    "these css/ files do not open with `@layer <name> {`, so ALL their rules " +
    "are unlayered (beating every layered rule) and the per-file guard above " +
    "cannot see them: " + unwrapped.join(", "));
});

test("the cascade order is declared exactly once, in tokens.css", () => {
  const decls = files.filter((f) => {
    const s = stripComments(fs.readFileSync(path.join(CSS_DIR, f), "utf8"));
    return /@layer\s+[\w-]+\s*(,\s*[\w-]+\s*)+;/.test(s);
  });
  assert.deepStrictEqual(decls, ["tokens.css"],
    "the layer ORDER statement decides which layer wins; it must live in one " +
    "place. Found in: " + decls.join(", "));
});
