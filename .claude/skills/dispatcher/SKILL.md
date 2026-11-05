---
name: dispatcher
description: "Use when asked how workers get launched, why an issue was not picked up, or to plan or run a dispatch cycle by hand: the dispatch Action, queue ledger and capacity. Not for: owning one PR → steward."
---

# Dispatch — durable, bounded GitHub coordination

Read `docs/ACTIONS.md` for the active/shadow distinction, label catalog, `/apex` commands and migration. The ledger
on `bot/actions-state` is durable state. PR bodies/comments are human-readable requests and hand-offs; there is no
session task-list authority and no comment-first ownership election.

Only the trusted coordinator reserves and launches work. Persist the request/attempt before dispatch; startup
claims it atomically. A duplicate event or startup cannot acquire a second lease. Timeouts do not reassign a
proven live worker; `/apex recover` requests a checked recovery, not a force takeover.

Intake uses open `queue:ready` issues with satisfied native dependencies, explicit batch membership and no pause
or owner. Check parent/member overlap before admission. Owner-direct `queue:priority` reorders eligible work but
adds no validation request. `queue:paused` stops new expensive work and merge; owner pauses are sticky.

Global `/apex pause` and `/apex resume` controls are on issue #3899, with workers, validation, merges or all as
the scope. Owner provenance is mandatory for resume/priority/approval. Unreadable authoritative state stays pending.

Control jobs also consume runners. Coalesce wakeups, admit bounded waves and record why each request waits.
Separate implementation, validation and release capacity. Latest head supersedes within a PR; fair admission
across PRs; explicit experiments retain durable FIFO. Do not claim GitHub concurrency provides FIFO guarantees.

Shadow mode proposes decisions only. Do not invoke a second launcher, edit ledger ownership by hand, migrate labels
or bypass gates from a session. A status request is read-only: report request/attempt id, head, pending reason,
capacity and available evidence. Sweeps/archive cleanup must not evict an active owner or claim a release succeeded.
