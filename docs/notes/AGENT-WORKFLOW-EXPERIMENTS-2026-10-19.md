# Twenty agent workflow experiments: output, MCP and instruction costs

Twenty `gpt-6.1-sol` agents completed ten brief/guided workflow pairs against
frozen revision `3368dd5b985e52cf33814e787312aab0cad6745f`. The experiment found
usable retained-result retrieval and several concrete defects. More detailed
instructions produced more substantive calls and fewer command failures in this
sample, but also more output. It does not establish a causal token-cost winner.

## Method

Five waves of four agents used isolated worktrees, one shared dependency
installation, the same model with no effort override, and a 24-command,
600-recorded-wall-second, 90-reaped-child-CPU-second admission budget per agent.
The ten task families were PWA, garage, navigation, UI planning, WATCH/data hub,
race control, input, multiplayer, career and audio. Each pair received the same
task and fixtures with brief or more detailed instructions. They read relevant
local skills and source and exercised the configured `apex-tools` and `apex-lsp`
servers using actual stdio JSON-RPC. These were local server exchanges, not
native Cursor/Claude attachment tests. Browser, VM probes and test suites were
parent-owned; workers prepared proposed probes without running them.

The [experiment protocol](../agent-output/experiments.md) describes the recorder,
caps and evidence boundaries. Command ledgers retain exact argv, worktree, source
SHA, exit status, raw captures and emitted bytes. RPC traces retain requests,
responses and errors. Independent checks validated all twenty reports, primary
ledger prefixes, response byte counts, source identity and clean tracked trees.
Original primary reports and ledger prefixes have immutable SHA256 snapshots.

## Results

| Measure | Brief (10) | Guided (10) | Total |
|---|---:|---:|---:|
| Admitted commands | 155 | 178 | 333 |
| Nonzero command exits | 12 | 7 | 19 |
| Terminal emitted bytes | 961,474 | 1,003,636 | 1,965,110 |
| RPC request bytes | 24,036 | 33,379 | 57,415 |
| RPC response bytes | 2,269,988 | 2,842,077 | 5,112,065 |
| MCP tool calls | 80 | 108 | 188 |
| Successful substantive calls | 51 | 80 | 131 |
| MCP errors, including negative controls | 7 | 6 | 13 |
| Successful retained-result reads | 16 | 16 | 32 |
| Identical producer repeats | 0 | 0 | 0 |
| Terminal truncations, original retained | 30 | 26 | 56 |

The [machine-readable summary](AGENT-WORKFLOW-EXPERIMENTS-2026-10-19.json)
contains per-lane counts. Intentional invalid-input controls are included in
errors, not treated as product defects. A tool can return `isError: true` while
the harness exits zero; aggregation checks tool results rather than just exits.
The zero-repeat count refers to identical producer invocations, including an
independent comparison with presentation arguments removed. It does not mean
every differently bounded query explored distinct semantic information.

The CLI harness opened 104 MCP sessions and fetched 104 tool lists for 188 calls.
Tool-list responses account for 4,456,232 of 5,112,065 response bytes. This is
ephemeral harness discovery overhead, not evidence that a native IDE reconnects
on every call. Reusing a connected server and batching bounded independent
queries should be measured separately. Required startup instruction reads and
their receipts contributed 577,480 terminal bytes.

## Confirmed findings and corrections

| Finding | Correction and independent evidence |
|---|---|
| Six published MCP schemas omitted supported optional keys while declaring `additionalProperties: false` | Advertise accepted top-level keys and reduce dense property prose within the existing 55 KB cap. Four discovery cases and actual schema-aware MCP calls verify a valid plan, expected invalid-input error and retained-result read. |
| Deferred SessionEntry preparation still ran after same-turn cancellation or replacement | Check request ownership before preparing. Actual old-source reproduction performed stale work; the correction prevented it. Eighteen SessionEntry VM cases cover cancellation, replacement and duplicate identity. |
| A hidden-tab rain snapshot survived an explicit dry stop | Explicit stop invalidates `resumeRain`. The old code restarted a second source; the fix preserved one. Thirty-seven real-module audio recovery cases include ordinary wet resumption. |
| LSP fallback inferred possible missing exports from absent direct uses | Report module-file fallback and unverified export/caller coverage without implying the declaration is absent. Fixture and actual Input queries verify the wording. |
| Repeated MCP presentation hints inflated discovery | Shorten repeated prose without changing tool schemas or other fields. A same-upstream paired comparison measured 87,454 to 83,174 bytes: 4,280 discovery bytes saved. |
| PASS-status warning fields were excluded from issue previews | Prioritize meaningful warning fields independently while retaining original status counts and complete evidence. Tests preserve a warning at row 130 and a failure at row 159. |
| Async settling was confused with advancing simulation frames | Keep `settle`, add its explicit `settleAsync` alias and bounded `stepUntil`. Real WATCH countdown/replay cases and separate runtime probes verify readiness semantics. |
| Timeout cleanup could miss a TERM-ignoring owned descendant whose pipes closed | Always escalate the owned process group independently of pipe completion. A real process regression fails before and passes after the fix; eight recorder cases pass. Detached descendants remain outside that guarantee. |

Worker and plugin guidance now describes output levels, saved-result receipts,
capability discovery, bounded source reads and one final wave digest. Full MCP
output preserves the original object; it deliberately injects no artifact
receipt. A harness attempt to follow a nonexistent receipt after full output was
misuse, not evidence loss. Reuse the complete response capture in that case.

## Rejected and incomplete hypotheses

Parent execution did not reproduce the suspected inactive-career research bug.
The repeated race-restart clock/fuel probe passed; its overlapping second probe
was not run again. Career save-durability concerns lacked fault-injection or
browser evidence and conflict with the documented session-only fallback contract.
PWA HTTP-502 cache fallback and audio-generation/mute-graph guards matched
existing behavior; they are not newly established defects.

Separate gameplay fixes in [PR #2973](https://github.com/brycejmurrin/f1-game/pull/2973)
were not counted as new findings. The primary study predates the fixes above.
Post-fix and combined-parent MCP/runtime retests have separate ledgers and source
identities; they are not added to the primary 333-command totals.

## Measurement limits and follow-up

Terminal bytes cover recorder-admitted commands and include receipts. Preflight
refusals occur before ledger admission and are excluded. Truncated originals
remain available; a preview does not establish that omitted findings are absent.
Recorded command time excludes model reasoning; CPU is reaped-child usage, not a
process-tree quota. Budgets are checked between commands, so overshoot is recorded.
Host/model-visible bytes, billed tokens, dollars and native IDE connection reuse
are unmeasured. Bytes cannot substitute for billing. One exploratory pair per
family, unequal branches and intentional controls prevent a causal comparison.

Lane20 omitted one physical trace directory from its report; aggregation used
all physical traces. A later authorized audio follow-up appended three commands
to lane19's ledger and amended its report. Immutable first-N ledger snapshots and
the retained original report-write argv reconstruct its primary evidence without
silently rewriting the current report. Those follow-up commands are excluded.

The earlier [Claude transcript audit](CLAUDE-TRANSCRIPT-TOKEN-AUDIT-2026-10-18.md)
identified notification wakes and large-context rereads as the dominant Claude
cost, unlike the Cursor audit's oversized outputs. These Sol experiments do not
measure that issue. Claude follow-up should verify actual hook, notification,
watcher and subagent behavior, then compare matched host workflows with transcript
usage. Preserve actionable red/pending signals and measure whole-workflow cost,
including discovery, retrieval, retries and wakeups. Process-monitor scan overhead
remains unresolved; cleanup guarantees were not weakened to make output smaller.
