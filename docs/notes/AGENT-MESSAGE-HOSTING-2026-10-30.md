# Agent mailbox options: GitHub Pages + SQLite

Research date: 2026-10-30 UTC. Independent research worker; no accounts, deployments, provider sessions, settings, permission policies or tracked source changed. This is a proposal, not a claim of a working cross-host mailbox.

Source: fetched deploy `claude/f1-game-project-26h3ng` at
`661492189a1876fe90d6cda6b3fcca335926d025`; isolated branch `cursor/agent-comms-6614`.
The parent session combined official-doc research with the local experiment below.
No player-facing change. This note does not amend [WORKERS.md](../WORKERS.md):
GitHub remains the authoritative store and comments remain the message transport.

## Recommendation

Start with a bounded GitHub-backed mailbox reader and SQLite **local index**, then consider a read-only Pages dashboard. Keep `docs/WORKERS.md`'s existing GitHub authority: issues own tasks, labels own state, PRs own handoffs, comments carry messages. A separate hosted mailbox is a later decision, not an implicit replacement of this contract.

GitHub Pages cannot itself host a writable server-side SQLite mailbox. Pages serves static HTML, CSS and JavaScript. A browser may download a `.sqlite` snapshot or run SQLite WASM, but mutations do not write back to Pages or become visible to another agent. This is an architectural inference from the documented static hosting model. [GitHub Pages overview](https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages)

## Options

| Option | Shared durable writes | Fit today | Main limitation |
| --- | --- | --- | --- |
| GitHub comments + local SQLite index + optional Pages snapshot | GitHub API | Recommended first increment | Polling, rate limits, eventual snapshot freshness; index must recover edits/deletions |
| GitHub Pages UI + authenticated Worker API + D1 | Backend API | Feasible optional prototype | New service ownership, credentials and authority decision; no deployed proof yet |
| Browser SQLite WASM/OPFS alone | Browser-local only | Optional offline search cache | Does not connect independent hosts or devices |
| `.sqlite` file committed/published per message | Repository commits, not database transactions | Reject as live bus | Conflicting writers and publication lag; no shared SQL write endpoint |

Cloudflare Pages and GitHub Pages are different products. D1 can be reached through Cloudflare Workers or HTTP APIs; a GitHub Pages UI can call a separate Worker. D1 documents SQLite SQL semantics and managed recovery. This does not imply full native SQLite file/API interchangeability or that an account is configured here. [D1 overview](https://developers.cloudflare.com/d1/)

## Verified constraints

- GitHub Pages documents a 1 GB published site limit, a soft 100 GB/month bandwidth limit, and a soft ten builds/hour limit (with a custom Actions workflow exception). Recommendation: publish summaries independently from the game release train, not a deployment for every message. Publication latency has not been measured. [Pages limits](https://docs.github.com/en/pages/getting-started-with-github-pages/github-pages-limits)
- SQLite WASM persistence may use browser storage, including OPFS. Browser/private mode can restrict persistence. SQLite's OPFS implementation involves worker contexts and locking; the ordinary OPFS VFS needs COOP/COEP headers for SharedArrayBuffer support. `opfs-sahpool` avoids that header requirement but lacks transparent concurrency (version 3.50+ has cooperative pause/unpause); `opfs`/`opfs-wl` target multi-tab concurrency. SQLite explicitly warns against assuming desktop-scale browser concurrency. Do not make persisted browser state the sole record of agent handoffs. Compatibility and eviction behavior require actual supported-browser tests. [SQLite browser persistence](https://sqlite.org/wasm/doc/trunk/persistence.md)
- Sharing an ordinary SQLite file over a network filesystem can fail because filesystem locking and durability assumptions vary. An API owning the database is the appropriate boundary for remote agents; downloaded HTTP snapshots are copies, not a shared connection. [SQLite over networks](https://sqlite.org/useovernet.html)
- D1 exposes `prepare().bind()` and ordered batches from a Worker database binding. Use named application operations and parameter binding rather than exposing arbitrary SQL through a public MCP. Atomic send/dedup/ack semantics still need explicit implementation and tests; this research does not establish them. [D1 database API](https://developers.cloudflare.com/d1/worker-api/d1-database/)
- D1 read replication requires Sessions API use; otherwise queries execute on the primary. Sessions provide sequential consistency. First prototype should use the primary, or propagate session bookmarks deliberately, rather than assume arbitrary replica read-after-write behavior. [D1 read replication](https://developers.cloudflare.com/d1/best-practices/read-replication/)
- Cloudflare Access service tokens can authenticate HTTP clients with client ID/secret headers; the Access policy must accept service authentication. This is a possible machine-auth option, not evidence it is enabled. Keep machine secrets in executor/MCP server storage, never in published Pages JavaScript. Per-agent application authorization remains necessary. [Access service tokens](https://developers.cloudflare.com/cloudflare-one/access-controls/service-credentials/service-tokens/)
- Workers can handle CORS preflight and return origin headers. Design recommendation: allow only the dashboard origin if browser access is needed; CORS does not authenticate agents. Do not copy the example's wildcard proxy as a mailbox security policy. [Worker CORS example](https://developers.cloudflare.com/workers/examples/cors-header-proxy/)
- GitHub supports API comments on issues and PRs. Creation requires Issues(write) or Pull requests(write) for fine-grained tokens. Repository comment reads support pagination and filtering by update timestamp. A cache must deduplicate by comment ID, retain source URLs, overlap timestamp windows and reconcile edits/deletions. A posted comment proves storage, not that a recipient session observed it. [GitHub issue comments API](https://docs.github.com/en/rest/issues/comments)

## Bounded new work

Tracking issue: [#4387](https://github.com/brycejmurrin/f1-game/issues/4387).
The [expanded setup plan](AGENT-MESSAGE-IMPLEMENTATION-PLAN-2026-10-30.md)
details API/MCP compatibility, Actions triggers, provider adapters, identity,
recovery, measured preview costs and dependency-ordered rollout gates.

First deliverable: a read-only `messages.list` / `messages.get` interface over existing
GitHub comments, with a rebuildable local index. Prove it reduces API calls or output
bytes before adding a write wrapper. Open PR #4252 owns current MCP refinements;
coordinate with that owner before editing MCP registration or gateway paths.

1. **Mailbox contract and fixtures.** Define a versioned envelope with message ID, sender identity, recipient, thread/task reference, source SHA, timestamp, body and idempotency key. Distinguish stored, observed and acknowledged. Message text does not grant permissions or transfer ownership by itself. Add fixtures for malformed, duplicate, edited and stale messages.
2. **Read-only GitHub index tool.** Index existing repository comments into local SQLite; support bounded list/get/search with source links and byte limits. Tests: pagination, overlapping incremental updates, edited/deleted comments, retry duplicates, crash resume, empty/forbidden responses. Rebuild the cache from GitHub. Measure API calls, bytes returned and cold/warm latency.
3. **GitHub-backed MCP message adapter.** Reuse current authenticated GitHub transport and existing comment format. Add explicit acknowledgements only through the current contract; confirm source issue/PR and permission failures. No provider launch or wake claims. Compare the typed wrapper against existing tools before adding another surface.
4. **Read-only Pages projection.** Render an approved, redacted snapshot with source links, generation timestamp, source SHA and stale indicator. Keep its publish workflow independent of the game's Pages deployment. Test fixture rendering and missing/stale data. Confirm site/repository visibility before publishing private coordination content. Start with JSON; only add SQLite WASM if measured search costs justify it.
5. **Optional Worker + D1 local spike.** Build send/list/ack operations with authenticated server-derived identities, bounded payloads, unique idempotency keys, stable cursors and prepared statements. Tests: concurrent sends, duplicate retries, unauthorized reads/writes, forged sender, restart persistence and ack ownership. No exactly-once claim; measure retry behavior. Prepare deployment/credential/authority changes concretely for the existing approval boundary.
6. **Real host acceptance.** Codex, Claude and Cursor independent sessions each send an exact nonce, retrieve another host's message, and explicitly acknowledge it. Record identity, source SHA, endpoint and latency. Mark absent provider access as not-run. Native worker subagents sharing this session/filesystem are useful test clients, but do not prove independent provider reachability or session wake-up.

## Measured local storage experiment

Python stdlib SQLite 3.53.1, a fresh local database in WAL mode, fabricated message
payloads, and parameterized SQL; no external service or real inbox was modified.

| Check | Observed result |
| --- | --- |
| Four writer processes, 25 IDs each, each send retried once | 200 attempts; 100 persisted messages; 100 duplicate suppressions |
| Same ID retried with different content | Rejected by stored sender/content-hash comparison |
| Four connections racing one conditional lease update | Exactly one winning lease |
| Acknowledgement with wrong / matching lease token | Wrong rejected; matching accepted; acknowledged row could not be reclaimed |
| Lease expiry | Another token reclaimed the expired lease |
| Cursor pages of at most 17 rows | All 100 IDs returned once, using sequence rather than offset |
| Close and reopen database connection | 100 messages and acknowledgement still present |

Recipe: give messages a unique stable ID and monotonic sequence; use
`INSERT ... ON CONFLICT(id) DO NOTHING`, then compare the saved immutable envelope
before accepting a retry. A same-ID different envelope is a conflict. The probe
compared sender and body hash only; a production implementation must also compare
recipient, task and every other immutable field. Race separate connections on:

```sql
UPDATE deliveries SET token = ?, until = ?
WHERE id = ? AND ack IS NULL AND (until IS NULL OR until < ?)
RETURNING id;
```

Require the matching lease token for acknowledgement; query pages with
`WHERE seq > ? ORDER BY seq LIMIT ?`. Test recovery after lease expiry and a new
database connection. SQLite supports this `RETURNING` form; the result above is
local SQLite evidence, not proof of D1 behavior. [SQLite RETURNING](https://sqlite.org/lang_returning.html)

The scratch script and JSON result were `scratch/agent-comms/sqlite_mailbox_probe.py`
and `scratch/agent-comms/sqlite-probe-result.json` in this session's worktree; they
are ignored, local evidence, not transferable artifacts. The table preserves the
observations. No elapsed-time, token-cost or throughput claim was measured. Lease
exclusion does not establish exactly-once external side effects: consumers still
need idempotent handlers and crash/retry tests. This probe is not a production
schema, authentication implementation, or adopted coordination tool.

## Decisions before a hosted mailbox

- Keep GitHub authoritative (recommended first increment), or explicitly approve
  replacing part of its transport contract. Do not create two competing task stores.
- Select backend owner, account, authentication and operating budget before any
  deployment. No Cloudflare account access or credentials were established here.
- Select a separate site/repository or isolated dashboard path. The current Pages
  site already hosts the game; the dashboard must not overwrite its deployment.
- Define retention, read authorization and acknowledgement semantics before storing
  real messages. Public Pages output must be an intentionally publishable projection.

These decisions do not block the read-only local index. Hooks, settings and
permission-policy proposals remain subject to their existing explicit-approval
requirements; this research changes none of them.

## Evidence status

PASS: live official-doc reads for all linked sources through the web MCP on 2026-10-30. SQLite page also fetched directly with Python HTTP. Direct Cloudflare `.md` endpoint fetches returned HTTP 403; the web MCP successfully returned the corresponding official HTML documents, so no capability conclusion rests on those direct failures.

NOT RUN: D1 account access, Worker deployment, Pages publication, browser SQLite persistence/eviction, cross-origin authenticated browser requests, independent-provider send/read/ack, performance benchmark. No cost or latency numbers are invented. Current research establishes product constraints and a testable design, not delivery guarantees.
