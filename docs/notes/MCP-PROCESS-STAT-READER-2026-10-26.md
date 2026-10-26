# MCP process-stat reader

An idle-process review during the audit found that five MCP output wrappers
together consumed about one CPU core in a 15-second sample. Their lifecycle
owner samples descendants every 50 ms. On this host the scoped procfs children
interface is unavailable, so each sample scans the process table and reads
every process stat record. This is a separate follow-up to PR #3845.

The candidate replaces ordinary full-file stat reads with one bounded raw read
into a reusable buffer. An ambiguous, partial or oversized record falls back
to the original full reader. Process birth remains an exact string. Sampling,
descendant traversal, pre-signal collection and cleanup ordering stay unchanged.

Focused tests cover normal reads, truncation, unusual names, exact identities,
descriptor closure, timeout escalation, cancellation and intentional handoffs.
Independent review found no supported correctness blocker. These results do
not establish a performance improvement: a quiet baseline/candidate CPU
comparison, the full tooling floor and required pre-push checks remain pending.

API references checked for the implementation:

- https://nodejs.org/api/fs.html
- https://man7.org/linux/man-pages/man5/proc_pid_stat.5.html

No live MCP server is restarted or reconfigured by this change.
