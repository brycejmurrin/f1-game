/**
 * @doc Pick the browser GROUP tonight's scheduled ci.yml run should cover.
 *
 * WHY THIS EXISTS. The deploy gate runs exactly ONE browser group
 * unconditionally (`smoke`), and everything else runs only when a change
 * selects it. The nightly was pinned to `tiny` — 4 of 118 specs — so the other
 * 114 had NO scheduled coverage at all, and a spec could sit red indefinitely
 * with nothing to notice. That is not hypothetical: `physics-fixes.spec.js`
 * was red on the deploy branch and was found by a benchmarking run, not by a
 * gate (docs/notes/DEFECT-LEDGER.md, 2026-09-16).
 *
 * So the nightly ROTATES instead. One group a night, deterministic by UTC day,
 * every rotatable group covered within ROTATION.length nights at exactly the
 * cost the nightly already paid. Deterministic (not random) so a failure can
 * be reproduced from its date alone, and so the unit test can prove coverage.
 *
 * Prints the BARE group name ci.yml wants (it runs `npm run "test:$GROUP"`).
 *
 * Usage:  node tools/ci/nightly-group.mjs            # -> GROUP=hooks
 *         node tools/ci/nightly-group.mjs --day=123  # a chosen day index
 *         node tools/ci/nightly-group.mjs --list     # the whole rotation
 */
import fs from "node:fs";

const GROUPS = JSON.parse(fs.readFileSync(new URL("../../tests/groups.json", import.meta.url), "utf8")).groups;

// EXCLUDED, each for a stated reason — an unexplained exclusion is how the
// coverage hole above opened in the first place.
export const EXCLUDED = {
  "test": "the whole suite — hours, and the point of a rotation is to fit one night",
  "test:gfx": "macOS/Metal, and it already has its own renderer-macos job",
  "test:baseline": "the golden trial runs itself on the nightly, non-blocking",
  "test:gallery": "a screenshot gallery with no assertions — nothing to go red",
  "test:render": "empty group (its specs live in the renderer job)",
  "test:smoke": "already runs unconditionally on EVERY push and every train",
};

export const ROTATION = Object.keys(GROUPS)
  .filter((k) => GROUPS[k].kind === "browser" && !(k in EXCLUDED))
  .sort();

// THE SAME HOLE, ONE CATEGORY OVER. EXCLUDED above covers the BROWSER groups,
// because the rotation only ever considered those — so the guard next to it
// only ever asked the question of those. A census on 2026-09-22 asked it of
// every group in tests/groups.json and found five that run in no workflow, no
// rotation, and no local gate: `test:float`, `test:clip`, `test:graph-parity`,
// `test:shimmer` and `test:tooling`. Nothing was wrong with any of them; they
// were simply invisible, which is exactly how test:gallery and test:render got
// into EXCLUDED in the first place.
//
// So every group now needs a home, and one that is not a workflow is stated
// here. tests/unit/nightly-group.test.mjs scans the workflows, deploy.mjs and
// tooling-fast.mjs, and fails on a group that appears in none of them and is
// not listed below — a NEW orphan can no longer be added silently.
export const UNSCHEDULED = {
  // Both of these spawn the same audit CLI that a test:sweeps suite already
  // spawns, against the same fleet — but with `--gate`/`--all` rather than the
  // suite's ratcheted `--json`, so they fail on ANY floater or clip where the
  // suite fails only on GROWTH. 37 of 52 circuits have some. They are the
  // documented manual entry points (docs/SCENERY-API.md, docs/TESTING.md) and
  // could not be wired to a gate as they stand.
  "test:float": "manual: the un-ratcheted twin of scenery-grounding.test.mjs, which gates float-audit inside test:sweeps",
  "test:clip": "manual: the un-ratcheted twin of prop-clipping.test.mjs, which gates clip-audit inside test:sweeps",
  // Needs a BASE ref to mean anything (`BASE=<ref> npm run test:graph-parity`);
  // with the default HEAD it compares a tree to itself. verify-change.mjs
  // routes a js/track/scenery/graph.js edit to it, which is where it belongs.
  "test:graph-parity": "manual/routed: a two-ref comparison — verify-change.mjs routes graph.js edits to it; it is meaningless without BASE",
  // Gated behind APEX_SHIMMER, which only this script sets. One spec, and the
  // measurement it takes is a deliberate A/B, not a pass/fail.
  "test:shimmer": "manual: an opt-in A/B measurement (APEX_SHIMMER) of material-shimmer.spec.js, with no pass/fail verdict to gate on",
  // An alias, not a group: both halves have their own homes.
  "test:tooling": "an alias for test:tooling-fast + test:sweeps; CI runs both halves directly",
};

/** ci.yml runs `npm run "test:$GROUP"`, so it wants the name WITHOUT the prefix. */
export const bare = (g) => g.replace(/^test:/, "");

/** Days since the UTC epoch — the rotation's clock. */
export const dayIndex = (now = Date.now()) => Math.floor(now / 86_400_000);

export function groupForDay(day) {
  if (!ROTATION.length) throw new Error("nightly-group: the rotation is empty");
  return ROTATION[((day % ROTATION.length) + ROTATION.length) % ROTATION.length];
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const arg = process.argv.slice(2).find((a) => a.startsWith("--day=")); 
  if (process.argv.includes("--list")) {
    for (let i = 0; i < ROTATION.length; i++) console.log(`${i}\t${bare(ROTATION[i])}`);
  } else {
    console.log(`GROUP=${bare(groupForDay(arg ? Number(arg.slice(6)) : dayIndex()))}`);
  }
}
