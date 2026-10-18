---
name: compound-review
description: "Use when /compound-review is typed: report-only review of a scoped diff."
disable-model-invocation: true
---
## F1 project integration

This project copy is an explicit opt-in. The repository subsystem skills, `check-changes`, browser occupancy rules, generated-file policy, and verification gates govern F1 work. Use those workflows for their mechanisms; this skill supplies supporting diagnosis, review, or verification reasoning. It does not authorize bypassing repository gates or publishing changes.

In this repo: `node tools/ci/pick-tests.mjs` names the groups the diff needs (judge test gaps against it); agent `verify-agent` with `--base <ref>` tells a new red from one the base already had; never a browser run inside a subagent (AGENTS.md rule 10).

# Review a scoped change

Done when the intended behavior and reviewed scope are clear, retained findings have evidence and consequences, and the report states coverage and verification limits.

Review is report-only unless the user requests fixes. A PR URL or branch name chooses the review target; it does not authorize checkout changes, publishing comments, commits, or external model review. Use the active host's available read tools and project conventions. Do not require other skills, a particular CLI, or subagents. Use a single review context unless the user requests delegation.

Resolve the requested diff, base, and target without switching branches. Distinguish committed changes, staged changes, and unstaged work so the review does not silently omit the requested scope. Infer intent from the user's request, associated requirements, and relevant code. If intent remains uncertain, state the assumption and continue useful review.

Trace changed behavior through callers, state transitions, error handling, and tests. Check correctness and regressions first. Include security, data integrity, concurrency, compatibility, and performance where the changed behavior creates a concrete risk. Compare implementation against the stated requirements and governing project standards. Review a small change proportionately; do not manufacture findings or demand broad refactors.

For each candidate defect, verify the affected path and identify the input or condition that causes an observable consequence. Retain it as a finding only when the source or a check supports that consequence. Keep speculative concerns separate. Explain a meaningful test gap through the failure it would leave undetected, rather than demanding tests that mirror implementation.

Where execution is available and useful, run targeted checks without disturbing unrelated work. Distinguish checks you ran from test files you inspected. If the user requested fixes, correct validated findings within scope and verify the resulting diff; do not apply speculative redesigns.

Return findings ordered by impact, each with severity, file and line, trigger, consequence, and evidence. Then give the reviewed scope, checks and outcomes, coverage limits, and readiness assessment. If there are no supported findings, say so. Do not label a change fully verified when required checks could not run.

Adaptation and attribution: see `references/source.md`.
