# pr-reviewer calibration replay (2026-11-24)

Kind: measurement · Re-measure-by: 2026-12-08

Bryce's `decision: A1` (PR #6377, comment 7145323212) adds the advisory `.claude/agents/pr-reviewer.md`, with a
two-week pilot. Before it ran on a live PR, the card was replayed read-only on the reds the proposal names
(`docs/notes/PROCESS-REVIEW-2026-11-24.md` §4a). Each replay judged only what the card reads at the red head: the
diff, the issue's Done-when and the routed specs. Two sonnet agents did the replays by reasoning, without running a
spec. The verdicts are estimates, not measured catches.

## Results

| PR @ head | what CI found | reviewer would flag | verdict | false positives |
|---|---|---|---|---|
| #6307 @ 5906215b | `vm-a1` stale `LAZY_UI_PRESETS` list; `telemetry-fit` spec missing the new prepare step | both, as blocker-candidates (`layout-presets.test.mjs:245`, `telemetry-fit.spec.js:300`) | caught | 1 nit (scope) |
| #6351 @ 75b6ca1d (Dependabot) | pinned `androidLine` in `shipped-notices.test.mjs` | — | would not run (`mobile/` only); missed if forced | 0 |
| #6368 @ c3a4ef4b | `gen-arch-table`: stale `docs/ARCHITECTURE.md` | header-comment edit with no regen (about 50%: needs the header→generator link) | partial | 1 nit |
| #6368 @ fb52d1b5 | ready-tier `oversize-gamepad-1of2` red (draft green) | `gamepad.spec.js:173` pins CAM cycling on press, and the diff moves it to release | caught (also visible at c3a4ef4b) | 1 nit |
| #5229 @ 0c6c257 | `time-trial` spec the PR's CI never selected | global `--tap` token change vs `time-trial.spec.js` fit asserts (routed today, possibly not then) | partial | 2 nits |
| #5298 @ 4729b65 | feed-mock spec red | widened Jolpica mock + unrun gallery/hooks (right area, not the exact spec) | partial, low confidence | 2 nits |
| #5346 @ c1b0c1b | `menu-baseline` select-screen snapshots after re-shot stills | only with a snapshot grep (`menu-baseline` is not routed for these paths) | partial (about 50%) | 1 nit |

Tally: 7 heads, 2 caught, 4 partial, 1 not run. About 8 nits looked like false positives. Every blocker-candidate
row pointed at a real red or at a real behaviour change.

## What changed in the card because of this

- Grep `tests/` for a list, string, id or version the diff changes (#6307 `LAZY_UI_PRESETS`, #6351's pin).
- A `js/` header-comment edit feeds `gen-arch-table` (#6368).
- Pixel baselines that name a changed screen (#5346), and specs the selector did not route (#5229, #5298).
- Changed paths come from `get_files`, not a local three-dot diff: a shallow clone may not have the merge base.

## Limits

- The two 2026-11-11 crossings (#5300 × #5392, #5384 × #5282) cannot be seen from one PR. The reviewer has no
  cross-PR or tip check: that is merge-gate's `retest` row.
- The verdicts are judgement calls by the replaying agents and were not re-verified. The pilot's live
  `review: <n> findings, <k> accepted` Plan lines are the real measure. At Re-measure-by, count catches that CI
  missed and the acceptance rate (the A2 threshold is 50% or more), then decide A2 or A0 (`PROCESS-REVIEW-2026-11-24.md` §4a).
