// Career draws go through the stateless Career.rnd(...parts) hash (js/career/career.js).
// Consuming the physics simRnd() stream from career code makes a career's existence
// change seeded race results; Math.random makes a save unreproducible. This pins the
// rule the career-mode skill states (references/workflow.md step 6) instead of
// leaving it as prose. Source scan only, no VM, < 50 ms.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const DIR = path.join(ROOT, "js/career");

// Math.random sites that are NOT career draws. A new entry needs the same kind of reason.
const MATH_RANDOM_OK = {
  // shuffled(): the standalone Season calendar shuffle with no seed; a seeded call never reaches it.
  "season-cal.js": 1,
  // restore-point id suffix: uniqueness only, never feeds a game outcome.
  "restore-points.js": 1,
};

// Drop /* */ blocks and // line comments so a comment that NAMES the rule is not a hit.
const code = (src) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`\\])\/\/.*$/gm, "$1");
const count = (src, re) => (src.match(re) || []).length;
const files = () => fs.readdirSync(DIR).filter((f) => f.endsWith(".js")).sort();
const src = (f) => code(fs.readFileSync(path.join(DIR, f), "utf8"));

test("js/career/ never consumes the physics simRnd() stream", () => {
  assert.ok(files().length >= 5, "js/career/*.js found");
  for (const f of files()) {
    const n = count(src(f), /\bsimRnd\b/g);
    assert.equal(n, 0, `js/career/${f}: ${n} simRnd reference(s) — use Career.rnd(...parts), a stateless hash`);
  }
});

test("js/career/ calls Math.random only at the allowlisted non-draw sites", () => {
  for (const f of files()) {
    const n = count(src(f), /\bMath\.random\s*\(/g);
    const ok = MATH_RANDOM_OK[f] || 0;
    assert.ok(n <= ok, `js/career/${f}: ${n} Math.random() call(s), allowed ${ok} — a career draw uses Career.rnd(...parts)`);
  }
  for (const f of Object.keys(MATH_RANDOM_OK)) {
    assert.ok(fs.existsSync(path.join(DIR, f)), `stale allowlist entry js/career/${f}`);
  }
});
