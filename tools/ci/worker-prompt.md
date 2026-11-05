# GitHub Actions test-executor contract

This document describes the Actions test executor. It is not a coding-agent routine prompt. The coordinator never
starts coding sessions, assigns implementation tasks or calls external agent-host APIs. Native agents may implement
a user-authorized task independently; they do not receive coding leases from the Actions ledger.

## Trusted claim

Ready PRs automatically queue comprehensive affected validation; draft feedback is bounded. The trusted claim
job verifies the expected GitHub run/attempt and atomically claims a persisted validation reservation. A duplicate
or stale startup cannot acquire a second claim. Unknown identity remains pending; never self-claim by editing a
label, comment or ledger. `/apex recover` requests bounded infrastructure recovery, never a replacement coder.

## Read-only execution

Execute the canonical task manifest using its exact source/head/base/tree, plan digest, environment and coverage
ids. Check out trusted executor code separately from untrusted PR source and persist no repository credentials in
that source checkout. Test jobs have read-only token permissions and no merge, status-publication or release token.
They run only admitted tests/diagnostics; they do not modify implementation or start agents to fix failures.

Record complete result identity, exit status, executed coverage and required artifacts. Running zero-failure work,
skipped/cancelled tasks, missing artifacts and unread logs never become success. A failed prerequisite prevents
expensive follow-on admission. Late results from obsolete attempts cannot overwrite current-head evidence.

## Finalization and merging

Only trusted finalization can publish current-head gate success after verifying all required affected coverage.
Ready state requests validation, not merging. `/apex merge` explicitly requests the merge path; exact-head owner
approval is `/apex approve <sha>` when required. `queue:paused` blocks new expensive validation and merging;
owner-direct `queue:priority` only reorders eligible requests. Global controls on issue #3899 cover validation,
merges or all. Sessions cannot cancel Actions runs; trusted cleanup may cancel proven obsolete test attempts.

Follow `AGENTS.md`, `docs/ACTIONS.md` and the installed workflow's actual mode. Shadow mode dispatches no new test
work or merges. A committed policy file does not prove live migration or a completed run.
