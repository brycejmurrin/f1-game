/* source-integrity.test.mjs — the three checks that cost a second and caught
 * nothing, because nothing was running them.
 *
 * Every one of these exists because of a real failure in the 2026-08 UI pass,
 * and in each case the 350-odd guards that DO run were green through it:
 *
 *   1. A comment body with no opening `/*` in js/game/sheetshape.js. That is a
 *      SyntaxError, so the whole IIFE never ran, so no sheet carried
 *      `data-shape` or `data-pair` and every list/detail layout in the app
 *      silently fell back to stacked. Nothing failed. It was caught by looking
 *      at a rendered page.
 *   2. A stray `}` left by a scripted edit in css/carsetup.css, which closed
 *      `@layer components` early. Everything after it became UNLAYERED, and an
 *      unlayered rule beats every layer — so roughly half a stylesheet quietly
 *      changed precedence. A stylesheet does not report errors; it just stops
 *      containing what you thought.
 *   3. tools/layout-audit.mjs surveyed 38 screens while the shell had 39. The
 *      missing one was #track-detail, which is exactly why a landscape
 *      dead-band in it survived a 380-cell survey and had to be found by hand.
 *      A survey is only as good as its inventory, and nothing checked the
 *      inventory.
 *
 * (1) and (2) are not style rules — they are "does this file still parse", and
 * the answer being NO is invisible at runtime in both languages. (3) is the
 * same idea one level up: does the thing that measures us know what to measure.
 *
 * Run: node --test tests/unit/source-integrity.test.mjs  (npm run test:tooling-fast)
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

const walk = (dir, ext, out = []) => {
  for (const e of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
    const rel = `${dir}/${e.name}`;
    if (e.isDirectory()) walk(rel, ext, out);
    else if (e.name.endsWith(ext)) out.push(rel);
  }
  return out;
};

test("every js/ file still parses", () => {
  // vendor/ is excluded: it is a vendored three.js island of ES modules, not
  // ours to keep parsing, and `node --check` reads it as a script.
  const files = walk("js", ".js");
  assert.ok(files.length > 100, `expected the whole js tree, found ${files.length}`);
  const broken = [];
  for (const f of files) {
    try {
      execFileSync(process.execPath, ["--check", path.join(ROOT, f)], { stdio: "pipe" });
    } catch (e) {
      broken.push(`${f}: ${String(e.stderr || e).split("\n").find((l) => /Error/.test(l)) || "parse failed"}`);
    }
  }
  assert.deepEqual(broken, [],
    "a js file does not parse. Every file here is a plain <script>, so a SyntaxError " +
    "means the global it assigns never exists and everything downstream silently " +
    "degrades — no error, no failing test, just a different layout");
});

test("every css/ file has balanced braces outside comments", () => {
  const files = walk("css", ".css");
  const bad = [];
  for (const f of files) {
    const src = fs.readFileSync(path.join(ROOT, f), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
    let depth = 0, wentNegative = false;
    for (const ch of src) {
      if (ch === "{") depth++;
      else if (ch === "}") { depth--; if (depth < 0) { wentNegative = true; break; } }
    }
    if (wentNegative) bad.push(`${f}: a '}' closes more than was opened`);
    else if (depth !== 0) bad.push(`${f}: ${depth} block(s) left open`);
  }
  assert.deepEqual(bad, [],
    "a stylesheet's braces do not balance. Every file here wraps its rules in an " +
    "@layer, so one stray brace closes the layer early and everything after it " +
    "becomes UNLAYERED — which beats every layer, silently");
});

test("tools/layout-audit.mjs knows about every screen in the shell", () => {
  const html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
  const audit = fs.readFileSync(path.join(ROOT, "tools/layout-audit.mjs"), "utf8");

  const shell = new Set([
    ...[...html.matchAll(/<dialog id="([a-z0-9-]+)"/g)].map((m) => m[1]),
    ...[...html.matchAll(/<div id="([a-z0-9-]+)"[^>]*class="[^"]*\bscreen\b/g)].map((m) => m[1]),
  ]);
  // The audit names a screen either by its root selector or by an id: entry
  // whose spelling drops the hyphens (trackdetail for #track-detail).
  const known = new Set([
    ...[...audit.matchAll(/root:\s*"#([a-z0-9-]+)"/g)].map((m) => m[1]),
    ...[...audit.matchAll(/id:\s*"([a-z0-9-]+)"/g)].map((m) => m[1]),
  ]);
  const missing = [...shell].filter((id) => !known.has(id) && !known.has(id.replace(/-/g, "")));

  assert.deepEqual(missing, [],
    "a screen exists in index.html that tools/layout-audit.mjs never opens, so the " +
    "layout survey silently does not cover it. Add it to SCREENS there — or, if it " +
    "genuinely cannot be surveyed, say why here rather than leaving the gap unstated");
});
