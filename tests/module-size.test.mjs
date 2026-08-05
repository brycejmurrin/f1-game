/* module-size.test.mjs — a RATCHET on the files that only ever grow.
 *
 * docs/ARCHITECTURE.md records that the July reorg took js/game.js from 8,955
 * lines to ~4,700, and that it is back over 8,000: "extraction moved code out
 * once and nothing stopped it accumulating again, because no guard bounds the
 * file."
 *
 * This session watched that happen in miniature. Two extractions
 * (js/game/aerozones.js, js/game/skidmarks.js) took 91 lines out of game.js,
 * and a concurrent branch put 130 back in over the same period. Nobody did
 * anything wrong — there was simply nothing that would notice, and the net
 * direction of an unbounded file is always up.
 *
 * So: a ceiling per file, and the rule that you LOWER it when you extract.
 * Raising one is allowed — this is a ratchet, not a cap on doing work — but it
 * has to be a deliberate edit here with a reason in the commit message, which
 * is the whole point. A number nobody can raise gets deleted the first time it
 * is inconvenient; a number you must look at gets thought about.
 *
 * Same idiom as tools/clip-baseline.json and tools/coplanar-baseline.json, and
 * as the FLOOR in tools/fixture-consumer-audit.mjs.
 *
 * Run: node --test tests/module-size.test.mjs   (npm run test:tooling)
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const lines = (p) => fs.readFileSync(path.join(ROOT, p), "utf8").split("\n").length;

// file -> ceiling. LOWER these when you extract. Raising one is a deliberate
// act: say why in the commit message.
const CEILINGS = {
  // The monolith. Every line removed here is the point of the extraction work;
  // js/game/ is where it goes. Do not raise this to land a feature — put the
  // feature in a module.
  "js/game.js": 8112,
  // The next three largest. Each is cohesive today (a dev API, an agent view, a
  // procedural mesh), so these are drift alarms rather than extraction targets.
  "js/game/apex.js": 3050,
  "js/game/agentview.js": 2900,
  "js/car/car3d.js": 2700,
  "js/track/tracks.js": 2600,
};

test("the big modules are not growing unnoticed", () => {
  const over = [];
  for (const [file, ceiling] of Object.entries(CEILINGS)) {
    const n = lines(file);
    if (n > ceiling) over.push(`${file}: ${n} lines, ceiling ${ceiling} (+${n - ceiling})`);
  }
  assert.deepEqual(over, [],
    "a module grew past its ceiling — extract something into js/game/, or raise the ceiling in " +
    "tests/module-size.test.mjs deliberately and say why in the commit");
});

test("a ceiling is not left far above the file it guards", () => {
  // The other failure mode: extract 500 lines, never lower the ceiling, and the
  // ratchet silently stops ratcheting. A ceiling more than 400 lines above its
  // file has lost its grip and should be pulled down.
  const slack = [];
  for (const [file, ceiling] of Object.entries(CEILINGS)) {
    const n = lines(file);
    if (ceiling - n > 400) slack.push(`${file}: ${n} lines but ceiling is ${ceiling} — lower it`);
  }
  assert.deepEqual(slack, [],
    "a ceiling drifted far above its file — lower it so the ratchet keeps working");
});
