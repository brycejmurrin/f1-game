#!/usr/bin/env node
// select-recall — WOULD THE SELECTOR HAVE CAUGHT IT?
// @doc Would the selector have caught it? Replays `select-specs` against real past regressions and asserts recall.
// @section runner
//
// Facebook's Predictive Test Selection (arXiv:1810.05286) reports the number
// that matters for a selector, and it is not the one everybody quotes: their
// deployed model reports ">95% of individual test failures" but ">99.9% of
// FAULTY CHANGES". The gap is the whole point — a bad change is usually caught
// by several tests, so missing individual tests barely dents the odds of
// catching the change. A selector must therefore be judged on faulty-change
// recall, never on how much of the suite it reproduces.
//
// This repo has no ML model and does not need one; it has something better for
// the purpose — a written history of real regressions with the spec that caught
// each one. CASES below is that history. The harness replays today's selector
// against each case's changed-file set and asserts the catching spec is in the
// selection (or that the case is honestly reported as infra/over-budget).
//
// ANTI-VACUITY IS THE POINT. A selector that quietly stopped selecting anything
// would still "pass" a test that only checked it does not crash; every case
// here names a spec that MUST appear, so a broken selector fails loudly.
//
//   node tools/ci/select-recall.mjs          # the table
//   node tools/ci/select-recall.mjs --json
import path from "node:path";
import { fileURLToPath } from "node:url";
import { pick } from "./pick-tests.mjs";
import { specsOf, fit, specsImporting, prioritise, TRACKED } from "./select-specs.mjs";
import fs from "node:fs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

// Real regressions from this repo's own record. `catches` is the spec that
// actually reported the failure — not a spec that merely looks related.
export const CASES = [
  {
    name: "side-flip moved kerbs/barriers on all 40 circuits (89ce4f2f)",
    changed: ["js/track/tracks.js", "js/track/core/geom.js"],
    catches: "tests/specs/terrain-over-road.spec.js",
  },
  {
    // PARTLY COVERED OUTSIDE THE SELECTOR (2026-09-22). This row reads "MISSED
    // but NAMED" because the catching spec declares 1500 s against the gate's
    // 180 s per-test cap — a real limit of the SELECTED gate, and still worth
    // reading as one. tests/unit/props-over-road.test.mjs now runs the same
    // audit in test:sweeps, which the Pages gate runs on a js/track diff
    // blocking, so the class is guarded on the diffs that cause it. PARTLY,
    // not wholly: that suite audits tools/lib/track-build-vm.cjs's build, and
    // the browser builds at least one monza prop the VM does not (measured;
    // docs/notes/DEFECT-LEDGER.md). So do not read this row as "this defect
    // class can ship", and do not read it as fully covered either.
    name: "street-barrier chord-cut hung a panel over the racing line (c0bd0abe)",
    changed: ["js/track/tracks.js"],
    catches: "tests/specs/props-over-road.spec.js",
  },
  {
    name: "MUSIC & SOUND panel extracted out of game.js (bb4268b0)",
    changed: ["js/audio/panel.js", "js/game.js"],
    catches: "tests/specs/audio-smoke.spec.js",
  },
  {
    name: "hold-button input net #4 (716bd1a2)",
    changed: ["js/input/input.js"],
    catches: "tests/specs/touch-steer.spec.js",
  },
  {
    name: "a narrow helper changes — import graph, not the path rules",
    changed: ["tests/helpers/qr-camera.js"],
    catches: "tests/specs/multiplayer-scan.spec.js",
  },
];

/** Replay the selector against a case's changed-file list (no git needed). */
export function replay(changed, budgetMin = 15) {
  const tracked = changed.filter((f) => TRACKED.some((re) => re.test(f)));
  if (tracked.length) return { reason: "infra", tracked, selected: [] };
  const scripts = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8")).scripts;
  const g = pick(changed);
  const groups = [...g.keys()].map((n) => `test:${n}`)
    .filter((s) => scripts[s] && scripts[s].includes("run-playwright")).sort();
  const changedSpecs = changed.filter((f) => /^tests\/specs\/.+\.spec\.js$/.test(f));
  const imported = specsImporting(changed);
  const candidates = [...new Set([...changedSpecs, ...imported, ...specsOf(groups, scripts)])];
  /* THE SAME RANK THE GATE USES. This called fit() with no `rank` at all, so
     every candidate defaulted to 3 — "merely routed by a path rule" — while the
     real gate ranks 0 edited / 1 previously failed / 2 imports a changed helper
     / 3 routed (see select-specs.mjs main()). A harness that models a DIFFERENT
     selector is not evidence about the one that ships, and it is the reason
     every one of these five cases read "MISSED but NAMED": at rank 3 an
     over-budget spec can only ever be excluded. */
  const rank = (f) => changedSpecs.includes(f) ? 0 : imported.includes(f) ? 2 : 3;
  const cut = fit(candidates, budgetMin, { rank });
  return { reason: "matched", groups,
    // Oversize is a RUN, not a miss: an affected spec that will not fit the
    // budgeted shard gets one of its own. Counting it as "named" would score a
    // spec that actually executes as a miss.
    oversize: (cut.oversize || []).map((s) => s.file),
    selected: prioritise(cut.selected, { changedSpecs, imported }).map((s) => s.file),
    skipped: cut.skipped.map((s) => s.file),
    // `unreachable` is the third NAMED bucket (a spec bigger than the whole
    // cap). It is still named in the selector's output, so recall must count
    // it as named — otherwise splitting the report reads as a new silence.
    unreachable: (cut.unreachable || []).map((s) => s.file),
    overBudget: cut.overBudgetSpecs.map((s) => s.file) };
}

export function recall(cases = CASES) {
  return cases.map((c) => {
    const r = replay(c.changed);
    const hit = r.selected.includes(c.catches) || (r.oversize || []).includes(c.catches);
    // A case is "reported" when the selector either picked the catching spec or
    // said plainly that it could not help (infra) / could not afford it. Silence
    // is the only real failure: a selection that omits the spec with no word.
    const named = r.reason === "infra"
      || (r.skipped || []).includes(c.catches) || (r.overBudget || []).includes(c.catches)
      || (r.unreachable || []).includes(c.catches);
    const inOversize = (r.oversize || []).includes(c.catches);
    return { ...c, reason: r.reason, hit, named, oversize: inOversize,
             rank: r.selected.indexOf(c.catches), n: r.selected.length };
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const rows = recall();
  if (process.argv.includes("--json")) { console.log(JSON.stringify(rows, null, 2)); process.exit(0); }
  const hits = rows.filter((r) => r.hit).length;
  console.log(`FAULTY-CHANGE RECALL: ${hits}/${rows.length} caught outright\n`);
  for (const r of rows) {
    const verdict = r.hit ? `CAUGHT (rank ${r.rank + 1} of ${r.n})`
      : r.reason === "infra" ? "reported as infra — gates own it"
      : r.named ? "MISSED but NAMED (skipped / unreachable / over budget)"
      : "SILENTLY MISSED";
    console.log(`  ${r.hit ? "+" : r.named || r.reason === "infra" ? "~" : "x"} ${r.name}`);
    console.log(`      catches ${r.catches}  ->  ${verdict}`);
  }
  /* A RATCHET, NOT A TARGET. Before 2026-09-20 this printed 0/5 and exited 0,
     and it was scoring a selector the gate does not run (replay() passed no
     rank, so every candidate looked "merely routed"). Fixed, it catches 1 of 5
     outright; the other four are specs a PATH RULE routes, which declare >= the
     gate's per-test budget and are excluded by the deliberate `>=` policy in
     select-specs.mjs — a real limit of the selected gate, and one that should
     be read rather than buried under a routine line.

     Raise this when the selector genuinely improves. Never lower it to make a
     red go away: below the floor means recall REGRESSED, which is the whole
     point of keeping five reproductions of faults that actually shipped. */
  const RECALL_FLOOR = 1;
  if (hits < RECALL_FLOOR) {
    console.log(`\nRECALL REGRESSED: ${hits}/${rows.length} caught, floor is ${RECALL_FLOOR}.`);
    console.log("A change made the selector worse at the faults it is known to catch.");
    process.exitCode = 1;
  }
  const silent = rows.filter((r) => !r.hit && !r.named && r.reason !== "infra");
  if (silent.length) {
    console.log(`\n${silent.length} SILENT MISS(ES) — the selector dropped a spec that caught a real`);
    console.log("regression, and said nothing. That is the failure mode this harness exists for.");
    process.exitCode = 1;
  }
}
