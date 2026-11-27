/* css-ladder-ink.test.mjs — the #7054 batch (#6548 items 9, 10, 12), pinned.
 *
 * 1. Z-INDEX LADDER. Every z-index >= 24 in css/ is a cross-sheet stacking
 *    decision, so it reads a `--z-*` rung of the one :root ladder in
 *    css/tokens.css; a bare number up there is how two sheets drift into the
 *    same slot unnoticed. Below 24 the values are local (#hud's 10 is pinned
 *    literal by camera-feel.test.mjs).
 * 2. CONSTANT INK. `--ink-on-accent` (#fff) and `--ink-black` (#000) are white
 *    on red and black shadows in EVERY theme: defined once in a bare :root and
 *    never redefined under a theme, accent or contrast selector. A theme that
 *    wants its own ink uses --text / --accent-ink instead.
 * 3. ONE SPELLING PER COLOUR. A literal written two ways (`rgba(0,0,0,.5)` and
 *    `rgba(0, 0, 0, 0.5)`) reads as two colours to a grep-based dedup plan.
 *
 * Run: node --test tests/unit/css-ladder-ink.test.mjs   (npm run test:tooling-fast)
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { sheets, colorForks } from "../../tools/check/tree-counts.mjs";

const all = sheets(); // comments stripped
const tokens = all.find((s) => s.name === "tokens.css").src;
const ladder = new Map([...tokens.matchAll(/(--z-[a-z0-9-]+)\s*:\s*(\d+)\s*;/g)].map((m) => [m[1], +m[2]]));

test("the --z-* ladder is one :root block of distinct, ascending rungs", () => {
  assert.ok(ladder.size >= 10, `ladder has ${ladder.size} rungs`);
  const blocks = [...tokens.matchAll(/([^{}]*)\{([^{}]*--z-[a-z0-9-]+\s*:[^{}]*)\}/g)];
  assert.deepEqual(blocks.map((b) => b[1].trim()), [":root"], "every --z-* rung lives in ONE bare :root block");
  const values = [...ladder.values()];
  assert.deepEqual(values, [...values].sort((a, b) => a - b), "rungs are listed bottom to top");
  assert.equal(new Set(values).size, values.length, "two rungs share a value");
  for (const v of values) assert.ok(v >= 24, `rung ${v} is below the ladder floor of 24`);
});

test("every z-index >= 24 in css/ reads a --z-* rung, and every rung read exists", () => {
  const literal = [], unknown = [];
  for (const { name, src } of all) {
    if (name === "tokens.css") continue;
    for (const m of src.matchAll(/z-index\s*:\s*([^;{}]+)/g)) {
      const v = m[1].trim().replace(/\s*!important$/, "");
      if (/^-?\d+$/.test(v) && +v >= 24) literal.push(`${name}: z-index ${v}`);
      const t = /^var\((--z-[a-z0-9-]+)\)$/.exec(v);
      if (t && !ladder.has(t[1])) unknown.push(`${name}: ${t[1]}`);
    }
  }
  assert.deepEqual(literal, [], "a cross-sheet z-index is a bare number; add or reuse a --z-* rung in css/tokens.css");
  assert.deepEqual(unknown, [], "a z-index reads a rung the ladder does not define");
});

test("--ink-on-accent and --ink-black are defined once, in :root, and no theme redefines them", () => {
  for (const [name, value] of [["--ink-on-accent", "#fff"], ["--ink-black", "#000"]]) {
    const defs = [];
    for (const { name: file, src } of all) {
      for (const m of src.matchAll(new RegExp(`([^{}]*)\\{[^{}]*${name}\\s*:\\s*([^;{}]+)`, "g"))) {
        defs.push({ file, selector: m[1].trim().split("\n").pop().trim(), value: m[2].trim() });
      }
    }
    assert.deepEqual(defs, [{ file: "tokens.css", selector: ":root", value }],
      `${name} must be defined exactly once, as ${value} in a bare :root`);
  }
});

test("no colour literal is written in two spellings", () => {
  const forks = [...colorForks()].filter(([, s]) => s.size > 1)
    // `rgba(6, 6, 10, var(--pause-scrim, .38))` defeats the literal regex (it stops at the
    // inner paren), so two DIFFERENT fallbacks read as one value: not a fork.
    .filter(([, s]) => ![...s].some((v) => v.includes("var(")))
    .map(([n, s]) => `${n} <- ${[...s].join(" | ")}`);
  assert.deepEqual(forks, [], "pick the spelling the tree already uses most");
});
