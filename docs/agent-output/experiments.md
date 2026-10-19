# Bounded workflow experiments

Use the same committed revision, dependency installation, model, requested effort,
fixture, caps and correctness checks for every comparison arm. Change one policy
at a time. Different tasks or exploratory probes cannot establish a causal winner.

The parent supplies an exact workdir, expected HEAD, recorder invocation and
capability receipt before the first worker command. Include the required AGENTS.md
read in that first recorded action; do not ask a worker to discover its recorder
through an unrecorded bootstrap. Read relevant skill sections and bounded source
windows. Reuse matching readiness receipts; recheck drift or failures. LSP queries
are allowed against a shared daemon, whose lifecycle remains parent-owned.

Workers own only their private artifact scope, including `artifacts/agent-output/`
when using the shared runner. Artifact-only workers use local claims. They do not
change the remote claims board. Send actionable blockers and one final digest;
do not wake an idle parent merely to count completed workers.

## Recorder

Requires Python 3 and POSIX process groups/resource accounting (Linux/macOS);
this helper is not a Windows recorder. Run from the supplied checkout. Replace the example checkout and full SHA with
real values; the launcher must supply a literal executable first command.

```sh
python3 tests/helpers/agent-experiment.py \
  --worktree /absolute/checkout --expected-head FULL_COMMIT_SHA \
  --records artifacts/agent-experiments/records.jsonl \
  --tag startup --limit 8000 -- node tools/check/doctor.mjs
```

Use this wrapper for each measured command, including source reads, saved-output
retrievals, retries and report generation. `--mode` declares the intended output
level; it does not select a producer mode. The recorder infers direct native vs
`agent-run.mjs` routes and reports mismatches. Select shared output with the actual
runner flags. Prefer small native answers; retrieve retained ranges instead of
repeating a completed action just to change its formatting.

The recorder rejects unrelated cwd/HEAD, traversal and artifact symlinks before
launch. Evidence must live in a private artifacts subdirectory. Captures are
exclusive files with mode 0600; evidence directories use 0700. Do not put secrets
in command arguments, which are retained literally. `--limit` bounds displayed
bytes, not captured bytes; values over 12000 need `--large-output-reason`, and the
maximum is 30000. Captures are complete and are not a disk or memory quota.

Command, wall and reaped-child CPU budgets are admission checks between commands.
A single admitted command can overshoot; the record reports that overshoot.
Use `--timeout` for a per-command wall bound. Timeout/cancellation cleans the owned
process group; detached descendants and existing shared daemons are outside that
guarantee. `--heavy --lock-path /shared/experiment.lock` serializes expensive
probes when every participant uses that same lock. Do not overlap them with a
broad tooling or browser suite.

Records distinguish exact child exit/signal, timeout and launch error. Emitted
terminal bytes include the preview and receipt, and differ from raw captured
stdout/stderr. Reaped-child CPU excludes existing shared services. Host-visible
bytes and billed tokens remain null unless independently measured; do not infer
them from terminal bytes. Preserve failed attempts even when a correction passes.

## VM readiness and bounded reports

`game.settle` remains an asynchronous event-loop wait and does not simulate frames.
`game.settleAsync` names the same behavior explicitly. For simulation readiness,
use `await game.stepUntil(predicate, {maxSteps: 600, dt: 1/60})`; inspect its
`{ok, steps}` result and assert the required state. A new car array alone does not
prove WATCH has armed or its replay clock has advanced. VM results do not verify
rendering, DOM clicks or GPU behavior.

Require a bounded worker JSON digest containing `pass`, `family`, `instruction`,
`head`, `ledgerPath`, `scenarioArtifact`, `controlArtifact`, `producerInvocations`,
`failureVisible`, `warningVisible`, `retainedReceipt`, `retries`, and `limitations`.
Limit strings to 512 characters and limitations to eight entries. Link the ledger;
never embed it, raw outputs, arbitrary nested telemetry or source/argv strings.
The parent validates this allowlist before collecting reports, derives usage
from ledgers, and retains the original captures separately. A missing record is
unknown, never reconstructed from a worker estimate.

Use a fresh per-lane nonce for a retained-row check. Publish only the row identity
in the task, keep the producer invocation counter, and validate the returned nonce
against the original capture. Verify failure and warning visibility and unchanged
exit status before comparing output costs. Bounded previews can omit ordinary
rows; that is why retained-range retrieval is part of completion cost.
