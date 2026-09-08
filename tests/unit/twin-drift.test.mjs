/* twin-drift.test.mjs — a VM twin and its browser spec are ONE test in two
 * places. Correcting one and not the other leaves a red that looks like
 * whatever change happens to run the group next.
 *
 * That is not hypothetical. On 2026-09-08 the AI's lateral controller changed
 * and the `driving` group came back with five failures. Two of them were
 * collisions-deep specs whose Node twins had been corrected months earlier —
 * "the shove AT THE CONTACT, not at frame 40", with a comment in the twin
 * explaining exactly that — while the browser copies still asserted the old
 * thing. Both had been red before the controller change; nobody knew, because
 * a browser group costs 10-40 minutes here and is not run casually. This guard
 * costs milliseconds.
 *
 * WHAT IT COMPARES, and why it is narrow. The two files are written in
 * different dialects (`expect(x).toBeGreaterThan(2)` against `gt(x, 2)`), so
 * matching assertions textually is hopeless. What survives translation is the
 * THRESHOLD: the numbers a test asserts against. A pair drifts when each side
 * asserts against a number the other side never mentions — the -0.1 / 0 that
 * shipped above. A number on one side only (a `toBeCloseTo` precision, a
 * count written as a variable) is dialect, not drift, and is ignored.
 *
 * Validated against the real defect: run against the pre-fix spec this flags
 * "a single AI rub only nudges the player apart" and nothing else.
 *
 * Run: node --test tests/unit/twin-drift.test.mjs   (~40 ms, no browser)
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const norm = (t) => t.replace(/\s+/g, " ").trim();

// Legitimate divergences, each with the reason it is not drift. Keyed
// "<vm file>::<test title>". Empty on purpose: prefer fixing the pair.
const ALLOW = new Map();

/** title -> body, for every test() in a file. */
function testsOf(src) {
  const out = new Map();
  const re = /\btest(?:\.skip|\.only)?\s*\(\s*(["'`])((?:\\.|(?!\1)[^\\])*)\1/g;
  let m;
  while ((m = re.exec(src))) {
    const start = m.index;
    const after = new RegExp(re.source, "g");
    after.lastIndex = m.index + m[0].length;
    const next = after.exec(src);
    out.set(norm(m[2]), src.slice(start, next ? next.index : src.length));
    re.lastIndex = m.index + m[0].length;
  }
  return out;
}

/** The numbers a body ASSERTS against. Statements are joined before scanning,
 *  so a threshold parked on a continuation line (`.toBeGreaterThan(2);`) counts;
 *  comments and message strings are stripped, so "10 s after the green light"
 *  is not mistaken for a threshold. */
function thresholds(body) {
  const stmts = body
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .split("\n")
    .map((l) => l.replace(/\/\/.*$/, ""))
    .join(" ")
    .split(";");
  const nums = new Set();
  for (const stmt of stmts) {
    if (!/\b(expect|assert|gt|lt|lte|gte)\s*\(/.test(stmt)) continue;
    const bare = stmt.replace(/(["'`])(?:\\.|(?!\1)[^\\])*\1/g, "");
    for (const n of bare.match(/-?\d+(?:\.\d+)?/g) || []) nums.add(n);
  }
  return nums;
}

function pairs() {
  const dir = path.join(ROOT, "tests/unit");
  return fs.readdirSync(dir)
    .filter((f) => f.endsWith("-vm.test.mjs"))
    .map((vm) => ({ vm, spec: path.join(ROOT, "tests/specs", vm.replace(/-vm\.test\.mjs$/, "") + ".spec.js") }))
    .filter((p) => fs.existsSync(p.spec));
}

test("every VM twin and its browser spec assert the same thresholds", () => {
  const found = [];
  for (const { vm, spec } of pairs()) {
    const A = testsOf(fs.readFileSync(path.join(ROOT, "tests/unit", vm), "utf8"));
    const B = testsOf(fs.readFileSync(spec, "utf8"));
    for (const [title, bodyA] of A) {
      const bodyB = B.get(title);
      if (!bodyB) continue;                       // only-in-one is the other guard's job
      if (ALLOW.has(`${vm}::${title}`)) continue;
      const a = thresholds(bodyA), b = thresholds(bodyB);
      const onlyA = [...a].filter((n) => !b.has(n));
      const onlyB = [...b].filter((n) => !a.has(n));
      // BOTH directions: each side asserting a threshold the other never
      // mentions is the drift. One-sided extras are dialect.
      if (onlyA.length && onlyB.length) {
        found.push(`  ${vm}\n    "${title}"\n      twin asserts ${onlyA.join(", ")} — the spec never mentions it` +
                   `\n      spec asserts ${onlyB.join(", ")} — the twin never mentions it`);
      }
    }
  }
  assert.deepEqual(found, [],
    "a VM twin and its browser spec have drifted apart — one was corrected and the other left behind:\n" +
    found.join("\n") +
    "\n\nFix the pair so both assert the same thing (and carry the same reason), or, if the\n" +
    "divergence is deliberate, add it to ALLOW in this file WITH the reason.");
});

test("the twins this guard covers are actually paired up", () => {
  // Anti-vacuity: if the naming convention changes and nothing pairs, the test
  // above passes by looking at nothing at all.
  const ps = pairs();
  assert.ok(ps.length >= 12, `only ${ps.length} twin pairs resolved — has the *-vm.test.mjs convention moved?`);
  const named = ps.map((p) => p.vm);
  for (const must of ["collisions-deep-vm.test.mjs", "longitudinal-vm.test.mjs", "world-physics-vm.test.mjs"]) {
    assert.ok(named.includes(must), `${must} should pair with a browser spec`);
  }
});
