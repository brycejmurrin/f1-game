# GitHub inbox CLI and MCP adapter

`node tools/agent/inbox.mjs` implements the read-only first slice of #4387/#4394.
GitHub remains authoritative under [WORKERS.md](../WORKERS.md). Grok continues
managing the Cursor bots; this tool does not launch, message or adopt any bot.

Requires Node 22.13+ with `node:sqlite` (experimental in Node 22). Uses the existing
repository REST client: existing GitHub authentication is used when present, and
public comment GETs can run without a token. An authenticated denial is never
retried anonymously. Public rate limits still apply. No new package, configured MCP server,
workflow, hook, permission or credential is installed. Scope is fixed to
`brycejmurrin/f1-game`; all source text is untrusted data.

## Start and read

```sh
node tools/agent/inbox.mjs sync --issue 4387
node tools/agent/inbox.mjs list --issue 4387
node tools/agent/inbox.mjs status --issue 4387
node tools/agent/inbox.mjs get --issue 4387 --id <comment-id>
```

All commands emit JSON; errors have `ok:false` and nonzero exit status. `sync`
makes GET requests only. The other commands read local cached data, never contact
providers or infer acknowledgement from a read. Cache is under ignored
`scratch/agent-inbox/cache.sqlite`; `--db` accepts a path under this checkout's
`scratch/` or `artifacts/`. It rejects paths that escape through existing symlinks
and refuses to reuse a database belonging to another application.

Default list output includes ordinary comments with at most 160 code points per
preview. `--messages-only` selects valid versioned envelopes;
`--recipient grok:owner` filters their declared recipient. That string is claimed
metadata, not authentication or authority to control a session.

List defaults to 20 items and at most 16 KiB of serialized JSON. If `nextCursor`
is non-null, pass it as `--after` and pass `status.generation` as `--generation`.
A refresh invalidates that continuation; restart from the first page. Full
comment text is retrieved through `get`, also bounded to 16 KiB. Continue using
`--body-after` with `nextBodyCursor` and `--body-version` with `bodyVersion`.
An edited body invalidates continuation instead of silently splicing two versions.
`--max-bytes` can reduce the page ceiling to a minimum of 2048 bytes.

## Message envelope codec

The initial tool contract is in `tools/agent/message.mjs`. This note explains the
format; the validator owns its executable constraints. An envelope occupies one
whole comment, with no instructions outside its fence:

````text
```apex-message
{"schema":"apex.message.v1","messageId":"example-1","repo":"brycejmurrin/f1-game","thread":{"kind":"issue","number":4387},"recipient":"grok:owner","kind":"request","sourceSha":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","expiresAt":"2026-11-01T12:00:00Z","replyTo":null,"body":"Read the linked source and report evidence."}
```
````

The example is illustrative, not a posted request. Codec exports
`validateEnvelope`, `formatMessage` and `parseMessage` for later adapters. Exact
fields, scope, UTC date, identifiers and UTF-8 size limits are checked. Body is at
most 8 KiB and serialized envelope at most 16 KiB. An `ack` kind is still untrusted
source content; the reader does not verify recipient identity or claim delivery.
Malformed/scope-mismatched envelopes remain ordinary cached comments with a parse
diagnostic; they never appear in recipient-filtered message results.

List reports message expiry, duplicate-copy count and same-ID content conflicts.
Copies remain separately source-linked so conflicting instructions cannot be
silently hidden. No send/ack operation is implemented here. Any later write path
must respect host-specific restrictions, including Cursor's own-PR comment rule.

## Refresh and failure behavior

Each sync reads the thread metadata, all bounded comment pages, then metadata
again. It requires stable update time/count and a complete unique-comment count
before replacing that thread's projection in one SQLite transaction. An empty
successful scan removes cached rows; a denied/failed/oversized/incomplete/changing
scan preserves them, exposes `lastError` and marks the cache stale. It does not
interpret a 404 as deletion. Concurrent refreshes check the previous generation
inside the write transaction; an older fetch cannot overwrite a newer cache.

Default budget is ten pages of 100 comments and 2 MiB per response; use
`--max-pages` to raise the page count up to 100. Reaching the limit is an error,
not a partial successful refresh. This full-thread scan deliberately avoids an
incremental high-water mark that would miss old edits or deletions. GitHub does
not offer a transactional snapshot across these requests; count/time checks
reduce concurrent-mutation risk, not prove source atomicity. This cache is for
retrieval, not task authorization or automated delivery.

`status` records last successful refresh, current cache generation, errors and
comment count. Data older than ten minutes, failed refreshes and never-synced
threads report stale. Read operations return freshness rather than implying a
current GitHub read. The entire cache is disposable: rebuild in another allowed
database path using the same `sync` commands. No task state, ownership or delivery
receipt is stored exclusively here.

## Verification and next adapters

Focused tests cover scope/malformed envelopes, duplicate/conflicting IDs, failed
and changing fetch preservation, edits/deletions, concurrent refreshes, safe cache
paths, restart persistence, bounded Unicode output and continuation invalidation.
No browser/game tests are needed for this isolated CLI.

The same reader operations are exposed through the MCP adapter below. Validate
Grok's actual incoming route before implementing any provider follow-up.
Independent Codex/Claude management requires an owned, authenticated runtime;
native child workers do not establish that access. #4387 tracks those later slices.

Primary API sources checked 2026-10-30:
[GitHub comment reads](https://docs.github.com/en/rest/issues/comments),
[Node SQLite and version history](https://nodejs.org/api/sqlite.html),
[Node 22 SQLite source](https://github.com/nodejs/node/blob/v22.x/doc/api/sqlite.md).


## MCP adapter and existing server integration

The existing `apex-tools` server now includes four tools:

| Tool | Effect |
| --- | --- |
| `apex_inbox_sync` | GitHub GETs and private local-cache refresh; not read-only/idempotent |
| `apex_inbox_list` | Bounded previews and generation-bound continuation |
| `apex_inbox_get` | Bounded source text and body-version-bound continuation |
| `apex_inbox_status` | Cache freshness, generation and last refresh error |

The last three open SQLite read-only. All four retain closed arguments and fixed
repository/cache scope; callers cannot choose database paths, URLs, executables
or provider sessions. `dryRun:true` on existing-server calls performs no fetch or
cache access. `apex_help` returns the full schema, and server discovery points to
the inbox tools. The existing server can list them without loading SQLite;
actual inbox operations still require Node 22.13+.

`tools/mcp/inbox-mcp.mjs` is also a standalone stdio adapter and transport test
entrypoint. Both routes share the same handler and core. It supports repository
protocol revisions through 2025-06-18, negotiates a supported older version when
requested, and does not claim implementation of 2026-07-28. Standard object
`params._meta` is accepted independently of closed tool arguments. Stdout contains
only JSON-RPC; diagnostics go to stderr. Oversized input lines are discarded with
bounded pending memory, including a sender that never writes a newline. Core
JSON payloads are at most 16KiB; text/JSON-RPC encoding adds wire overhead.

Typical existing-server calls, after the reviewed source is deployed:

```json
{"name":"apex_inbox_sync","arguments":{"issue":4387,"dryRun":true}}
{"name":"apex_inbox_sync","arguments":{"issue":4387}}
{"name":"apex_inbox_list","arguments":{"issue":4387,"limit":10}}
{"name":"apex_inbox_status","arguments":{"issue":4387}}
```

Tool code in a checkout is not proof that a connected host has refreshed its
catalog or is serving that SHA. First verify help/list, a dry run, then one actual
GET-only sync and source-linked read on that host. A missing provider key is not
needed for this public inbox; it is still needed for the corresponding provider
management API. No provider sending, wake, launch or acknowledgement tool exists
in this slice.

## Host activation proposal — not applied

Prefer deploying the reviewed code behind the already configured `apex-tools`
server and refreshing the actual host catalog. This avoids adding server entries,
changing hooks or widening tool permissions. The current F1 hosted gateway binds
its own checkout, not automatically this PR worktree; never pull into another
session's checkout to activate these tools.

For a runtime that has no existing apex-tools connection, a concrete standalone
registration would execute `node /APPROVED/CHECKOUT/tools/mcp/inbox-mcp.mjs` with
only the four named tools enabled. The absolute checkout/mount, Node version,
server authentication and host support must be validated for each runtime.
A stdio server is not a remote HTTPS service merely because its URL is published.
A ChatGPT connected app is distinct from Codex CLI TOML or Claude Code settings.

Any required settings, hooks or permission-policy edits remain a separate
reviewable activation step under the user's existing approval boundary. None
were changed by this implementation. Primary host references:
[Codex MCP](https://developers.openai.com/codex/mcp/),
[Claude Code MCP](https://code.claude.com/docs/en/mcp),
[Cursor MCP](https://cursor.com/docs/context/mcp).

## Provider readiness and Grok ownership

Live discovery confirms `apex_cursor_agents` is exposed through F1 Cloud MCP,
but bounded list calls return `no_key` for missing server `CURSOR_API_KEY`.
Its empty local ownership list is not an inventory of Grok's bots. Do not insert
Grok-owned IDs into it or launch replacement bots. The live short tool description
still names retired skill `agent-fleet`, while full help names `steward`; refreshing
that hosted metadata remains a deployment concern, not a reason to restore the
retired skill.

No authenticated independent Codex/Claude coding-session management MCP was
verified in this session. Codex Document Control addresses documents, not coding
sessions. The existing `tools/env/codex-cloud-history.py` is a read-only history
exporter, not a messaging or wake API; only its help was tested here.

For Grok Bot, the documented routine webhook is a possible incoming route:
register one narrow routine with a fixed repository/recipient mapping, keep its
URL/key in host secret storage, and send only a source message ID after a canary
is explicitly activated. HTTP 200 is provider acceptance, not completion. Grok
retrieves current source and follows up with its owned Cursor task. A separate
nonce reply must correlate to the source and provider run, through a permitted
receipt route. The actual user's manager host/routine is still unverified.
[Routine contract](https://cursor.com/help/grok-bot/routines).

First canary proposal: one disposable existing task, one nonce, no implementation
work, no new launch, an expiry, a reply bound to the source, then duplicate/busy/
wrong-owner tests. Codex and Claude require their own owned-runtime adapters and
independent canaries; native children do not establish those connections. Missing
authentication or settings cannot be repaired by pretending tool exposure is
successful delivery.
