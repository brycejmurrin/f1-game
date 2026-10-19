# Test suite review, 2026-10-19

Issue #2952 holds the ask, the rubric and the report format. `batches.json`
splits all 1,013 test files (854 `tests/unit`, 159 `tests/specs`) into 22
batches of ≤ ~16k lines. Each batch gets one reviewer session; pass 1 is
findings only.

A reviewer posts its report as one comment on #2952 headed `REPORT <batch>`.
The orchestrator folds the 22 reports into `SYNTHESIS.md` here: a ranked
defect list, the gaps per subsystem, and the pass-2 fix lanes.

Get a batch's files with:

```sh
node -e 'console.log(require("./docs/notes/test-review-2026-10-19/batches.json").batches[process.argv[1]].join("\n"))' <batch>
```

## Synthesis files (pass 1 → pass 2)

| file | what |
|---|---|
| `reports/<batch>.md` | each `REPORT` comment verbatim, with its URL and date; partials as `<batch>.part-<n>of<m>.md`, a later part supersedes and both stay |
| `findings.jsonl` | one normalized row per finding (fields below), de-duplicated across batches via `dup_of` |
| `SYNTHESIS.md` | status, top 25, recurring patterns, gaps by subsystem, debugger findings, verification notes |
| `PLANS.md` | pass-2 fix lanes: goal, owned globs (disjoint), finding ids, verify command, effort, model, order |

All three are generated: edit `src/rows.py` (findings), `src/status.py` (status and prose) or `src/lanes.py` (lanes), then
`python3 src/build.py src .` from this folder. `build.py` fails on a duplicate id, a `dup_of` that names no row, or a
finding in two lanes. `src/mkreports.py <dir with comments.json and reportmap.json> reports` rewrites the verbatim reports.

Row fields: `id` (batch prefix + number; `DBG-*` for debugger/tooling rows), `batch`, `file`, `line`, `kind`
(dead-assert, vacuous, tautology, source-scan, over-mock, wrong-target, gap, flaky, slow, stale-doc, tooling),
`severity`, `confidence`, `defect`, `impact`, `fix`, `effort` (S/M/L), `subsystem`, `verified` (`reviewer` or
`subagent-unverified`, as the report says), `synth_check` (what the synthesis re-read on the tree, or null),
`impact_class` (player, pipeline, hygiene: drives the ranking), `patterns`, `dup_of`.
