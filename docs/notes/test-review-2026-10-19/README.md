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
