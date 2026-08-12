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
 * Run: node --test tests/unit/module-size.test.mjs   (npm run test:tooling)
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const lines = (p) => fs.readFileSync(path.join(ROOT, p), "utf8").split("\n").length;

// file -> ceiling. LOWER these when you extract. Raising one is a deliberate
// act: say why in the commit message.
const CEILINGS = {
  // The monolith. Every line removed here is the point of the extraction work;
  // js/game/ is where it goes. Do not raise this to land a feature — put the
  // feature in a module. (7970 -> 7975 in the 2026-08 audit fix train: net +3
  // after dead-code removals, from comments explaining real fixed bugs at
  // their sites — the quali-Escape guard, the DRIZZLE gates, the vLat basis
  // label. Bug-explaining comments are the one growth the ratchet tolerates.)
  // Lowered from 7975 after the R1 audio-panel extraction (AUDIT-SYNTHESIS)
  // took the MUSIC & SOUND panel out — the ratchet follows the file down.
  // 7795 -> 7804 for aTop(): the ground-truth acceleration next to vTop(), plus
  // the comment recording the mismatch it fixes (js/game/quali.js modelled the
  // field at pace-5 acceleration into a pace-scaled ceiling). It belongs beside
  // vTop()/vStd()/aStd() and nowhere else, so this is a bug-explaining growth of
  // exactly the kind the note above tolerates — not a feature.
  // 7804 -> 7810 for the G.netNow accessor + backing store + the comment saying
  // why: netplay/apex wrote G.netNow at four sites and this file declared it
  // NOWHERE, so it existed only as an expando (the countT bug's shape, and what
  // would make an Object.seal(G) throw). Declaring a member the façade already
  // pretends to own is the ratchet-tolerated growth, not a feature.
  // 7810 -> 7826 for the garage turntable's fit-to-visible-region distance, plus
  // the comment recording what was wrong: SP_DIST_DEF framed the car against the
  // WHOLE frustum while the docked panel covers a third of it, so every broadside
  // swing ran the wings off both edges. The lens shift that creates the visible
  // region already lives here, three lines up, and the fit is the same
  // measurement — splitting them would put two halves of one framing rule in two
  // files. Bug-explaining growth at the site of the bug, not a feature.
  // 7896 -> 7912 for the ACTIVE AERO flap distance gate, plus the comment
  // recording why its radius differs from the brake rings' 40 m twelve lines
  // above. The flaps were the one per-car detail draw with no distance test —
  // ~84 draws a frame for the field, each a VAO bind the cache always misses,
  // because every flap element is its own mesh. The gate belongs beside the
  // draw it guards and beside the ring gate it mirrors; moving it out would
  // separate two halves of one "how far do small car details stay worth
  // drawing" rule. Bug-explaining growth at the site of the bug.
  // game.js: concurrent camera/preview work + wheel-to-wheel racecraft.
  // 7896 -> 7928 for the bug-hunt fix train: the sector-PB incident-invalid gate,
  // the offT grace-sentinel two-sided decay, the ghost-recorder reset on a backward
  // line crossing, the G.seasonRound accessor (quali round resolved as reliability
  // does), the reliability `networked` build-relief opt, and the aero-flap livery
  // finish thread — each landed with the comment recording the bug it fixes at its
  // site, the one growth this ratchet tolerates.
  // Merged with the ACTIVE AERO flap distance gate from the other branch;
  // the file carries both sets of lines, so neither side's number fits it.
  // Set from the merged file: 7944.
  "js/game.js": 7944,
  // The next three largest. Each is cohesive today (a dev API, an agent view, a
  // procedural mesh), so these are drift alarms rather than extraction targets.
  "js/game/apex.js": 3050,
  "js/game/agentview.js": 2900,
  "js/car/car3d.js": 2700,
  // Raised 2600 -> 2670 for the start-line origin shift: buildCenterline's
  // arc-length lookup, the dressingExclusions shift, and the shift-only remaps
  // for the six emitters transformSceneryApi never covered (groundPatch,
  // overheadSpan, circuitKit, groundedSegments, waterField, frameAt). Mostly
  // the comments explaining why the shift is an ARC-LENGTH fraction and not
  // `startFrac - sceneryStartFrac` — the trap that cost a full debugging pass.
  // Raised again 2670 -> 2725: elevation/bridge anchors were remapped against
  // `startFrac` instead of the authoring origin, sliding the road surface
  // vertically under its own dressing (measured up to 43 m at Spa) — fixed by
  // freezing that remap at `sceneryStartFrac` and rotating the bumps and the
  // undulation ripple by the same arc-length shift in buildCenterline.
  "js/track/tracks.js": 2725,
};

test("the big modules are not growing unnoticed", () => {
  const over = [];
  for (const [file, ceiling] of Object.entries(CEILINGS)) {
    const n = lines(file);
    if (n > ceiling) over.push(`${file}: ${n} lines, ceiling ${ceiling} (+${n - ceiling})`);
  }
  assert.deepEqual(over, [],
    "a module grew past its ceiling — extract something into js/game/, or raise the ceiling in " +
    "tests/unit/module-size.test.mjs deliberately and say why in the commit");
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
