# Gate sees a red tip; budgets without stale constants, 2026-11-19

Kind: design · Re-measure-by: 2026-12-19

Decision: Bryce, about 01:05Z on 2026-11-19, picked "#2+#3 gate fixes" (relayed in the orchestrator's brief with the time).
This PR needs his `config-ok` (tools/ci, tools/check).

Summary: the gate's `base` row now runs the tip's own budget tests when Pages has not judged the tip yet. The boot wall's
hand-written `MAX_EAGER_*` constants move into `tests/data/ratchets.json` `tree`. There a lowering is the branch's own
delta, and a raise is a ratchets.d fragment that needs Bryce's `ratchet-raise`.

## What went wrong

- #5714 merged at 23:59:45Z and #5634 at 00:07Z. Each was green alone. Together they put the tip over
  `tests/unit/boot-load-budget.test.mjs`: tip f0f5c5a4 measured 8,020,524 B against a cap of 8,018,484.
- At least eight more PRs merged onto that red tip (#5808, #5805, train #5804, #5667, #5582 and others), and the tip
  grew to 8,026,058 B.
- Why the gate let them through: the `base` row read "the newest COMPLETED pages.yml run on the base branch"
  (`tools/ci/lib/deploy-tip.mjs`). The tip's Pages runs were pending or cancelled in a CI backlog of about 2.5 h, so the
  row kept reading an older green run.
- Three fixers (#5815, #5754, #5665) each edit the same `MAX_EAGER_BYTES` line, and each measured it on a different old
  tip. Whichever merges second fails its own test.

## Goal 1: the base row sees a red tip while Pages is slow

**Picked: (a), the tip's own unit gate.** Option (b) would hold every non-fixer merge until Pages reaches the tip. In
the 2026-11-18 backlog that meant about 2.5 h with no merges, even when the tip was green.

How (a) works (`tools/ci/lib/tip-gate.mjs`, `tipView` + `runTipGate`):

1. merge-gate reads the base branch's head sha (`branches/<base>`).
2. If the newest completed, non-cancelled pages.yml run is on that sha, or is a code red, Pages decides, as before.
3. Otherwise the gate checks out the tip sha as a detached worktree. It runs `tools/gen/ensure-built.mjs` (BUILT_PATHS
   such as `js/track/circuit-meta.js`), then `node --test` on `TIP_GATE_TESTS`.
4. The result:
   - Red: `code-red` on the tip sha. The row WAITs, exactly like a Pages red.
   - Green: the row passes and says that Pages has not reached the tip.
   - The gate cannot run: `unverified`, which WAITs (fail closed).
5. The fixer routes are unchanged:
   - `deploy:red` plus a head that contains the red sha. Now that is the tip sha the gate judged.
   - Bryce's own `deploy:red` or `priority`, clicked after the red. For a tip-gate red, "the red" is the tip commit's
     committer date.

`TIP_GATE_TESTS` holds the tests that sum a size over many files, so two green PRs can cross them together:

- `boot-load-budget.test.mjs`
- `css-critical-path.test.mjs`

Every test there must import only node built-ins and repo files. `tests/unit/tip-gate.test.mjs` pins this, because
land.yml's `trusted-rows` job installs nothing.

The tip is merged code, so this runs no PR code. The `trusted-rows` leg, which owns the base row in `post`, can run it
from its deploy-branch checkout. The verdict is cached per tip sha under `artifacts/merge-gate/tip-gate/`, so one job
pays the cost once for all its PRs.

Measured 2026-11-19 on tip 8a9d0796: `worktree add` took 3.4 s and ensure-built plus both files took 0.2 s. The tests
failed on "the eager shell stays inside its script budget", which is the red the old row missed.

Pinned by `tests/unit/merge-gate.test.mjs`, "base row: a PENDING pages.yml run on a red tip holds merges". It fakes a
queued Pages run (the newest completed run is green on an older sha) on a red tip.

Not changed: `needs-sync.mjs` still reads Pages alone for `tip-red`. A session there may sync onto a red tip that the
gate holds. That is harmless, because the merge waits anyway. A follow-up can reuse `tipView`.

## Goal 2: no hand-edited budget constant that goes stale

The owner's rules (from the constant's history, `boot-load-budget.test.mjs`):

- Freed bytes are not headroom. Each lowering kept "the room the owner's decision left".
- A raise is Bryce's decision. Examples: "Raise to 326"; "decision: 8150000" on #5523.

The repo already has this mechanism for other counts: `tests/data/ratchets.json` `tree`, measured by
`tools/check/ratchets.mjs`. The pin counters used to live as `const CEILING = N` in three tests and moved there for the
same reason on 2026-10-26. What it does:

- **Lowering.** A branch's own reduction is measured at its merge-base (`tree-counts.mjs` `AT_REF`, #4257). The
  commit hook (`--auto-raise`) writes it as that branch's delta in `tests/data/ratchets.d/<branch>.json`. Deltas measured
  against the merge-base add up under a clean merge. Two fixers that each free bytes lower the ceiling by the sum, and
  neither goes stale.
- **Raise.** A tree metric is never auto-raised. `--update --fragment --reason=…` writes the raise as a delta. The
  merge-gate `raise` row then needs `ratchet-raise`, last added by Bryce in person and newer than the push that raised
  it. A hand edit to the test's constant had no such row.
- **Composition.** merge-gate's `ratchets` row runs `ratchets.mjs` on the merge result onto the current tip. The pair
  #5714 + #5634 would have been refused at the gate of whichever merged second. Before, nothing would have caught it
  until Pages ran.
- **Folding.** `ratchets-fold.yml` folds the deltas into absolutes on schedule.

What this PR does:

1. **First commit (0e0f876d).** It adds the measurement `tools/check/boot-wall.mjs` (`wallNow`, `wallAt(ref)`) and the tree
   metrics `eagerScripts` / `eagerBytes` (`TREE_METRICS` and `AT_REF`). They stay dormant until seeded, because
   `measure()` reads only the metrics that ratchets.json names. `wallAt` takes a BUILT_PATHS file's size from the
   working tree, because the file is in no git tree. Its change counts 0 toward a branch's own lowering.
2. **After #5815 and #5816 merged (synced onto 1cb36d81).** This PR changed no budget number while #5815 was open.
   - Seed both metrics at the tip's measurement with `slack: 0`, meaning exact. #5815 leaves zero room: "growth spent
     the owner's room".
   - `boot-load-budget.test.mjs` then asserts against the effective ceiling, `load().tree.eagerBytes`, instead of a
     constant.
   - The constant's history moves to `docs/notes/CEILING-HISTORY.md`.
   - When Bryce grants room again, the grant is the entry's `slack` (for example `{ "ceiling": N, "slack": 50000 }`).
     A slack that loosens is itself a raise (`diffRatchets`), so it needs his label.
   - Under a non-zero slack, freed bytes refill room up to the granted slack and no further. Past that, `--update` must
     lower the ceiling. That matches the history, where each lowering "kept the room the owner's decision left".

After that, #5754 and #5665 conflict on the test's constant. Each one drops its number and lets the commit hook write
its own delta.

## Survey: which other budgets share the problem

| Budget | Where | Shape | Shares the problem? |
| --- | --- | --- | --- |
| `MAX_EAGER_BYTES` / `MAX_EAGER_SCRIPTS` | `boot-load-budget.test.mjs` | Hand constant. A sum over ~310 files. | **Yes**: the 2026-11-19 red. Fixed here. |
| Blocking/preload CSS `239000` | `css-critical-path.test.mjs` | Inline literal. A sum over 6 sheets. 238,599 B measured on 8a9d0796, so 401 B of room. | **Yes**. Any `menus.css` edit can cross it together with another PR. The same move applies (`cssBlockingBytes` / `cssPreloadBytes` tree metrics). Seeding them sets the room, so that is Bryce's call. Not done here. |
| `assertPins` / `assertPinsAll` / `rawGameReads` / `vmSrcLoads` | `ratchets.json` `tree` | Diff-relative pin counters (`pinVerdict`, since 2026-10-26). | No. A PR is red only for growth it adds, and the ceiling moves by delta. |
| `rawColor`, `rawSpacing`, `subFloorFontSize`, … | `ratchets.json` `tree`, slack 0 | Own lowering by delta (`AT_REF`, #4257). | No. This is the model Goal 2 reuses. |
| `NURBURGRING_ABS_BUDGET` 6,000,000 | `track-build-load.test.mjs` | Hand constant. Math.abs calls in one circuit's build. | Low. It moves only with Nürburgring or engine edits, so two PRs rarely cross it together. |
| `MAX_PRELUDE` 230 | `css-comments.test.mjs` | The maximum of one file, not a sum. | No. One PR cannot make another PR's file longer. |
