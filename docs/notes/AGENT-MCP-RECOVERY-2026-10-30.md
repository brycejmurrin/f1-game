# Agent inbox and MCP recovery audit

Measured 2026-10-30 Pacific (some runner logs are dated 2026-10-31 UTC).
This is evidence from the implementation session, not another policy home.
The coordination contract remains [WORKERS.md](../WORKERS.md); inbox usage and
activation proposals remain [AGENT-INBOX.md](AGENT-INBOX.md).

## Prioritized findings

| Priority | Measured problem | Implemented response | Remaining limit |
| --- | --- | --- | --- |
| P0 | Five idle hosted MCP wrappers consumed about 108% of one CPU core in a short measurement. Each sampled every visible proc-stat file every 50 ms. | Bounded shared descriptor pool reads fresh metadata, with identity-safe reopen, resource fallback and cleanup. | One paired trial suggests 21% lower parent CPU; substantial residual scanning cost remains. Hosted rollout has not occurred. |
| P1 | Default sync load-wait requested 600 seconds from a helper capped at 590 seconds, then ignored the helper's refusal. | Default nine-minute wait, explicit duration validation, and stop before fetch on waiter failure/timeout/signal. | Busy machines still wait or refuse. Thresholds and the foreground cap are unchanged. |
| P1 | Inbox was CLI-only; opening cached data used a writable SQLite connection. | Four inbox tools in the existing server; list/get/status use actual read-only handles. | Source deployment and host catalog refresh must be verified separately. |
| P1 | Standalone adapter accepted inherited argument names and could accumulate unterminated input. | Own-property validation and bounded frame discard/recovery. | The 32 KiB input cap describes the standalone adapter, not every existing gateway transport. |
| P1 | SQLite loading could block discovery and dry runs. | Lazy backend loading; discovery/help/dryRun work without SQLite. | Real cache operations require the documented Node/SQLite runtime. |
| P1 | New tools exceeded the existing 55,000-byte inner discovery budget. | Discovery-only long-description compaction; full help, schemas, validation and annotations retained. | The combined catalog with the independent Claude-tool PR must be measured again. |
| P1 | CI caught new pin-shaped assertions despite an earlier green commit gate. | Replace five text-pattern checks with stronger observable contracts; preserve all ceilings. | Commit guards are a subset of the structural floor; their success is not full verification. |
| P2 | Long verification was interrupted when the workspace session restarted. | Pushed source checkpoints, explicit unknown verdicts, and the sync tool's supported final-stage resume. | Local log artifacts are not automatically transferable to another machine. |

## Capabilities actually exercised

| Capability | Observation | What it establishes |
| --- | --- | --- |
| GitHub inbox sync/list/get | Board thread: 19 comments, three GETs; one retrieved body matched GitHub exactly. Public tokenless sync also passed. | Source-linked retrieval, not provider delivery. |
| Local inbox stdio MCP | Actual child processes tested discovery, errors, bounded frames, cache reads and SQLite-unavailable discovery. | Local transport/backend behavior. |
| Existing server integration | Actual stdio discovery/help/dryRun; fixture status/get/error and complete bounded Unicode reconstruction. | The four tools work inside the existing server. |
| Production wrapper topology | Local output-level wrapper preserved discovery, dryRun and structured errors; no cache/network sync occurred. | Integration through the same transport layers, using this checkout. |
| Hosted gateway | Help for the new inbox name returned `unknown_tool`. | The connected host has not activated the new source. |
| Cursor management | Exposed adapter; bounded list returned `no_key`. | Server authentication is missing; an empty local ownership registry is not Grok's fleet inventory. |
| Claude management | Independent PR #4412 reports local CLI auth/list/dryRun; this lane did not repeat those calls. | Reported implementation evidence, not attached hosted-MCP access or a cross-provider reply. |
| Codex management | No independent coding-session manager was attached in the discovered tools. | A limit of this session, not a claim about every Codex host. |
| Native workers | Independent audits, protocol tests and bounded implementation work used shared-filesystem child workers. | These are not separate Claude/Cursor/Codex provider sessions. |

## Context and output measurements

These are UTF-8 bytes, not token counts. Compact decoded-result serialization is
also distinct from raw JSON-RPC wire size.

- Existing-server tools: 39 to 43. Four compact inbox descriptors: 4,337 bytes.
- Full CLI catalog: 154,741 to 162,527 bytes.
- Inner compact `tools/list`: 55,260 bytes before the compaction correction,
  54,904 afterward; the existing 55,000-byte ceiling was not raised.
- Wrapped compact listing, including the gateway retrieval tool: 58,827 to
  61,264 bytes, an increase of 2,437 bytes (4.14%).
- Wrapped initialization result: 1,899 to 2,134 bytes. Server instructions:
  1,625 characters, below the documented 4,096-character host limit.
- Inbox core JSON responses remain bounded at 16 KiB; encoding and wrapper
  envelopes add overhead. Tests reconstruct the complete quoted, multiline,
  accented and supplementary-Unicode body from bounded chunks.

## Process tracking: benefit, resource cost and rejected shortcuts

The original scanner's causal inert-child fixture cost about 398 ms parent CPU
versus 2 ms for raw spawn. The repeating scan was the source of idle work.

One controlled paired 1,200 ms trial, with 1,793 visible proc entries, measured:

| | Parent CPU | Wall time | Retained descriptors |
| --- | ---: | ---: | --- |
| Original helper | 395 ms | 1,288 ms | 22 before/during/after |
| FD pool plus token parser | 313 ms | 1,251 ms | 22 before, 1,046 during, 22 after |

This single trial suggests about 21% less CPU, with residual use around 25% of
one core. It is not a repeated production measurement or complete elimination.
The actual pool cap was 1,024 because the soft open-file limit was 16,384.
At 4 KiB pages, 1,024 proc seq-file buffers can cost about 4 MiB of kernel memory,
plus file/inode overhead; this is an estimate, not measured memory consumption.

The process-global pool retains at most the minimum of 2,048 descriptors,
one sixteenth of the soft limit, and startup headroom leaving 64 descriptors
free. Unknown limits disable retention. Exhaustion releases retained descriptors
and retries without caching; last-owner release closes the pool. Separate Node
wrapper processes each have their own pool. Every read still obtains current
state, PPID, group and start time at the existing sampling interval.

A directory-inode metadata cache was rejected: an adversarial PID/inode reuse
case missed a replacement descendant. It was not shipped. Parser-only tests
showed better microbenchmark results but no demonstrated whole-wrapper benefit;
the FD trial above is the operational evidence for the accepted approach.

Actual-mount tests cover old-FD exit failure, fresh PPID adoption through the
same descriptor, parent-thread exit, noninheritance across spawn, balanced
descriptor counts, timeout escalation, detached-grandchild cleanup, cancellation
and intentional background handoff. Fake-I/O cases additionally exercise reuse,
partial reads, capacity, eviction and resource errors.

## Verification and coordination

Initial inbox/core/MCP tests passed; CI subsequently exposed the pin ratchet
failure on the older synced head. The correction passed 36 focused tests and
24 ratchet tests. Process changes passed 79 preflight tests; sync-wait changes
passed 47. These are scoped results. The PR handoff holds the current combined
commit, structural-floor and CI verdicts; this dated note does not declare them
green in advance.

An overloaded local run failed a timing-spread benchmark at load 9.26. It was
recorded and stopped, with no tolerance or quarantine change. Verification was
then serialized. A later broad run was stopped after CI identified the pin
failure; interrupted or incomplete runs are not counted as passes.

PR #4412 independently modifies shared catalog entrypoints for the modular
Claude tool. The pushed inbox checkpoint and combined-budget requirement were
[recorded with that owner](https://github.com/brycejmurrin/f1-game/pull/4412#issuecomment-6536526967).
Whichever addition lands second needs normal integration and regeneration.
Research PR #4388 passed full CI; its landing workflow encountered repeated
deploy-tip races. No session merge, manual arm or cancellation was used.

Source identities: inbox work began at fetched `d556deb8dd452471d677d91864e37d442d27fda0`;
the deploy sync produced `a357be45e2a24be1bc902bb3bac42cac5cd5c500`, MCP checkpoint
`fdf510c28694082ac3f8834aea67d0c017d2fec0`, and behavioral correction
`d641b7a7a912b3332f6ec7a5cf935ffe403e4d6e`. Recovery workers used fresh fetched
deploy `b97531beb82c432551bec956861e697c971085fb`. Final combined identity is in
the PR handoff. The hosted MCP checkout was neither pulled nor switched.

## Remaining activation decisions

Reviewed source must land before a host operator activates it and refreshes the
catalog. Host login, Cursor credentials, Grok's actual incoming route and
independent runtime ownership must be established before a nonce round trip.
The implementation sends no provider messages and creates no provider worker.
No hooks, host settings, permissions, credentials, Pages deployment or gameplay
were changed. Concrete registration/canary proposals remain in the inbox note.

Primary references checked for this work:
[MCP tools](https://modelcontextprotocol.io/specification/2025-06-18/server/tools),
[Node SQLite](https://nodejs.org/api/sqlite.html),
[GitHub comments](https://docs.github.com/en/rest/issues/comments),
[proc FD identity](https://github.com/torvalds/linux/blob/v6.12/Documentation/filesystems/proc.rst#L130-L136),
[seq-file fresh reads](https://kernel.googlesource.com/pub/scm/linux/kernel/git/torvalds/linux/+/v6.12/fs/seq_file.c),
[proc inode allocation](https://github.com/torvalds/linux/blob/v6.12/fs/inode.c),
[orphan adoption](https://github.com/torvalds/linux/blob/v6.12/kernel/exit.c).
