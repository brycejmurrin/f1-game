---
name: dispatcher
description: "Use when asked how GitHub Actions tests get queued, why PR checks wait for runners, or to plan a dispatch cycle: validation queue ledger and capacity. Not for: owning one PR → steward."
---

# Dispatch — PR validation and runner capacity

Read `docs/ACTIONS.md` for the active/shadow distinction and two PR labels. The durable ledger on
`bot/actions-state` records validation requests and GitHub Actions attempts. The coordinator never launches coding
agents, assigns implementation tasks, groups issue batches or manages coding-session leases. The old coding-agent
dispatcher is disabled in every mode. User-authorized native agents remain independent of this system.

Ready PRs automatically queue comprehensive affected validation; draft feedback is bounded. `/apex merge` is
explicit landing intent and never an automatic consequence of readiness. `queue:paused` stops new expensive
validation and merging; owner-direct `queue:priority` reorders existing eligible requests without duplicating tests.

Global `/apex pause` and `/apex resume` controls on issue #3899 accept validation, merges or all. On a PR,
`/apex recover` requests infrastructure recovery of missing executor evidence. It never resumes or replaces a
coding agent. Provenance, required coverage, pause and capacity remain mandatory.

Only trusted test startup claims a persisted GitHub Actions reservation. Duplicate delivery cannot execute a
second copy. Recovery checks actual runs/attempts; expiry alone does not free a running test executor. Test jobs
are read-only; trusted finalization and merge/release use separate permissions.

Coalesce control wakeups and account for their runners too. Latest head supersedes within a PR; fair admission
across PRs; explicit experiments retain durable FIFO admission within each runner pool. GitHub controls physical
start order. Report request/attempt id, head, pending reason, capacity and actual evidence. Shadow mode proposes
decisions only; a session does not run an alternate launcher, self-claim ledger state or bypass protected checks.
