/* css-class-ratchet.test.mjs — a RATCHET on the two counts that only ever grow:
 * the distinct CSS class tokens across css/, and the DOM node count of the
 * single-file shell.
 *
 * WHY THIS FILE EXISTS AT ALL. `.claude/skills/restructure-screens-css/SKILL.md`
 * rule 11 says to "ratchet the distinct-class count the way module-size.test.mjs
 * ratchets game.js". docs/archive/research/UI-REMODEL-DECISION-2026-08.md
 * prescribed it concretely ("start at 538"). It was never installed — and
 * docs/research/STRUCTURE-REDECISION-2026-08.md §Q5 records the consequence as a
 * formal execution debt: with no test carrying a ceiling, the count crept
 * 538 -> 543 in five days while every suite stayed green. That is the exact
 * failure mode module-size.test.mjs was written for, in a different currency:
 * nobody did anything wrong, there was simply nothing that would notice.
 *
 * The class count is the repo's headline structural cost. Measured against Pico
 * CSS (a complete design system in 2,835 lines / 16 classes / 251 custom
 * properties), this repo runs ~7,800 lines / 543 classes / 75 properties —
 * 34x the classes on 2.8x the lines with 0.3x the tokens. SKILL.md rule 8's
 * answer is `--sheet-w`: one primitive class plus N one-line `--property`
 * contexts, which is already the shape used by fourteen dialogs here. Every
 * consolidation onto that shape lowers this number; LOWER THE CEILING WHEN IT
 * DOES, the same way you lower a module-size ceiling after an extraction.
 *
 * The body-node ceiling is the second half, endorsed by STRUCTURE-REDECISION
 * §Q1's operational addendum. The split-index.html question was decided
 * UPHOLD (keep the monolith) on the grounds that the node count sits under
 * Lighthouse's ~1,400 error band — but it drifted 969 -> 1,133 over rule 13's
 * lifetime with nothing watching, and "the drift rate is the thing to watch".
 * A ceiling here does not forbid growth; it makes the growth a deliberate edit,
 * which is the whole mechanism.
 *
 * COUNTING METHOD IS THE SKILL'S OWN, DELIBERATELY. Both counts reproduce
 * SKILL.md's shell commands character-for-character:
 *
 *   grep -ohE '\.[a-zA-Z_-][a-zA-Z0-9_-]*' css/*.css | sort -u | wc -l   -> 543
 *   grep -oE '<[a-zA-Z][a-zA-Z0-9-]*' index.html | wc -l                 -> 1133
 *
 * Both are approximations — the class grep does not strip comments, so a
 * `.sheet-foot` named in prose and a filename like `game.js` both land in the
 * set; the node grep counts every tag occurrence in the whole file including
 * `<script>` and closing-tag-free voids. A stricter parse would give different
 * numbers (952 body element nodes, for instance). That is fine and it is the
 * point: these are TREND instruments, and comparability with the 543 / 1,133
 * figures written into SKILL.md, UI-REMODEL-DECISION and STRUCTURE-REDECISION
 * is worth more than a purer number nobody can line up against the record.
 * If you improve the method, restate the baselines in all four places at once.
 *
 * Run: node --test tests/unit/css-class-ratchet.test.mjs   (npm run test:tooling-fast)
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

/** SKILL.md: grep -ohE '\.[a-zA-Z_-][a-zA-Z0-9_-]*' css/*.css | sort -u | wc -l */
export function classTokens() {
  const dir = path.join(ROOT, "css");
  const seen = new Set();
  for (const f of fs.readdirSync(dir).filter((x) => x.endsWith(".css")).sort())
    for (const m of fs.readFileSync(path.join(dir, f), "utf8")
      .matchAll(/\.[a-zA-Z_-][a-zA-Z0-9_-]*/g)) seen.add(m[0]);
  return seen;
}

/** SKILL.md rule 13: grep -oE '<[a-zA-Z][a-zA-Z0-9-]*' index.html | wc -l */
export function shellNodes() {
  return [...fs.readFileSync(path.join(ROOT, "index.html"), "utf8")
    .matchAll(/<[a-zA-Z][a-zA-Z0-9-]*/g)].length;
}

// LOWER THESE WHEN YOU CONSOLIDATE. Raising one is allowed — this is a ratchet,
// not a cap on doing work — but it must be a deliberate edit here with the
// reason in the commit message, which is the entire mechanism.
//
// 543 was the count at install time (STRUCTURE-REDECISION-2026-08 §Q5), and is
// the figure SKILL.md rule 8 quotes as "the whole finding".
// 541 after the mb-prefix family collapsed onto #mb-career / #mb-career-sub.
// 538 after the garage preview bar's two chip variants became --vb-fs / --vb-pad
// on the buttons' own ids, and .cs-cam-lbl (a duplicate of an inherited value)
// went entirely.
const CLASS_CEILING = 538;

// 1,133 at install time. Lighthouse warns at ~800 nodes and errors at ~1,400;
// SKILL.md rule 13's ruling (do not split the shell) rests on staying under
// that error band, so this ceiling is where the ruling's premise is kept true.
// Growth points named by STRUCTURE-REDECISION §Q1: #advanced (106 nodes),
// #vsfriend (95).
const NODE_CEILING = 1133;

test("the distinct CSS class count is not growing unnoticed", () => {
  const n = classTokens().size;
  assert.ok(n <= CLASS_CEILING,
    `css/ defines ${n} distinct class tokens, ceiling ${CLASS_CEILING} (+${n - CLASS_CEILING}).\n` +
    "Put the variation in a custom property on a context selector instead of a new class " +
    "(SKILL.md rule 8; `--sheet-w` in css/components.css is the worked template) — or raise " +
    "CLASS_CEILING in tests/unit/css-class-ratchet.test.mjs deliberately and say why in the commit.");
});

test("the shell's DOM node count stays under the Lighthouse error band", () => {
  const n = shellNodes();
  assert.ok(n <= NODE_CEILING,
    `index.html holds ${n} tag occurrences, ceiling ${NODE_CEILING} (+${n - NODE_CEILING}).\n` +
    "The ruling to keep index.html monolithic (SKILL.md rule 13, STRUCTURE-REDECISION §Q1) is " +
    "conditional on staying under Lighthouse's ~1,400 error band. Raise NODE_CEILING here " +
    "deliberately, or take the nodes out of the shell.");
});

// The other failure mode, straight out of module-size.test.mjs: consolidate, never
// lower the ceiling, and the ratchet silently stops ratcheting. A ceiling sitting
// well above what it guards has lost its grip. The slack allowances are small on
// purpose — these counts move in ones and twos, not in hundreds like a line count.
test("neither ceiling is left slack above the count it guards", () => {
  const slack = [];
  const classes = classTokens().size;
  if (CLASS_CEILING - classes > 5)
    slack.push(`CLASS_CEILING is ${CLASS_CEILING} but css/ defines ${classes} — lower it`);
  const nodes = shellNodes();
  if (NODE_CEILING - nodes > 25)
    slack.push(`NODE_CEILING is ${NODE_CEILING} but index.html holds ${nodes} — lower it`);
  assert.deepEqual(slack, [],
    "a ceiling drifted above the count it guards — lower it so the ratchet keeps working");
});
