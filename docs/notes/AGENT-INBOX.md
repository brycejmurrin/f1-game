# GitHub inbox CLI — first implementation

`node tools/agent/inbox.mjs` implements the read-only first slice of #4387/#4394.
GitHub remains authoritative under [WORKERS.md](../WORKERS.md). Grok continues
managing the Cursor bots; this tool does not launch, message or adopt any bot.

Requires Node 22.13+ with `node:sqlite` (experimental in Node 22). Uses the existing
repository REST client and its GitHub authentication. No new package, MCP server,
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

Next: expose the same reader operations through a narrow MCP adapter, then
validate Grok's actual incoming route before implementing a provider follow-up.
Independent Codex/Claude management requires an owned, authenticated runtime;
native child workers do not establish that access. #4387 tracks those later slices.

Primary API sources checked 2026-10-30:
[GitHub comment reads](https://docs.github.com/en/rest/issues/comments),
[Node SQLite and version history](https://nodejs.org/api/sqlite.html),
[Node 22 SQLite source](https://github.com/nodejs/node/blob/v22.x/doc/api/sqlite.md).
