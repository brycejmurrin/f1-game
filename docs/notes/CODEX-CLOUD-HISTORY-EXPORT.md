# Codex Cloud persisted history export

The read-only exporter at [`tools/env/codex-cloud-history.py`](../../tools/env/codex-cloud-history.py)
retrieves original persisted Cloud thread items, including native tool records and
referenced subagents. It creates private resumable checkpoints and a separate
credential-redacted directory suitable for review before uploading to Google Drive.
It does not upload files itself.

## Interface and evidence

This uses an **observed, undocumented hosted interface**, not a supported public
consumer history API. On 2026-10-26, authenticated read-only checks verified the
hosted WebSocket endpoint `wss://codex-cloud-backend.chatgpt.com/`, metadata reads,
paginated item reads, and archived listings. The separate legacy `codex cloud`
task list did not enumerate these modern threads.

The protocol is also independently described in
[AgentsView's pinned Cloud source design](https://github.com/kenn-io/agentsview/blob/v0.46.1/docs/internal/codex-cloud-source.md),
its [listing implementation](https://github.com/kenn-io/agentsview/blob/v0.46.1/internal/codexcloud/listing.go),
and [client implementation](https://github.com/kenn-io/agentsview/blob/v0.46.1/internal/codexcloud/client.go).
Those are third-party implementation evidence. They do not establish an OpenAI
support commitment or permission beyond the signed-in user's accessible threads.

Current first-party protocol reference material is the
[Codex App Server source](https://github.com/openai/codex/tree/main/codex-rs/app-server)
and [generated protocol definitions](https://github.com/openai/codex/tree/main/codex-rs/app-server-protocol).
The local schema inspected for this implementation describes metadata-only
`thread/read`, `thread/list`'s archived filter, and cross-thread item pagination.
The hosted transport and available methods may change independently of a local
Codex release. A schema or client account alone does not establish Cloud access.

[Official shared-snapshot documentation](https://learn.chatgpt.com/docs/use-chatgpt#share-a-read-only-snapshot-of-a-codex-thread)
explicitly excludes the original thread's tool calls, shell commands, and tool
inputs/outputs. A shared link is therefore a different source from this exporter.

## Run with an existing official sign-in

Requirements: a POSIX terminal host (Linux/macOS or the authorized cloud workspace),
Python 3.11 or later, a signed-in official Codex CLI, and `websockets>=15,<17`.
This is a host-side command, not an iOS app slash command.
Only the connection path imports `websockets`; `--help` and
offline fixtures use the standard library. Follow the
[official authentication instructions](https://learn.chatgpt.com/docs/auth)
for signing in. Do not paste tokens into command arguments or this repository.

Export every root returned by the archived listing, then traverse its persisted
subagent references:

```sh
python3 tools/env/codex-cloud-history.py --archived --output scratch/codex-history --markdown
```

`--archived` selects **only archived roots**. Descendants of those roots may be
unarchived. It does not discover arbitrary active tasks or run a separate global
subagent listing. For explicitly selected original threads, use `--thread` instead:

```sh
python3 tools/env/codex-cloud-history.py --thread THREAD_ID --output scratch/selected-history
```

Repeat `--thread` to select additional roots. `--thread` and `--archived` are
mutually exclusive, and one is required. Thread IDs and output artifacts belong
in ignored local paths, never in source, fixtures, commits, or PR descriptions.
Inside a git checkout the exporter enforces this: an `--output` whose `_private/`
would not be git-ignored fails with `output_not_gitignored` before any request.

To continue an interrupted capture, repeat the same scope and output with
`--resume`. This continues existing page cursors and retries incomplete threads;
completed threads retain their captured version. Use a new directory to refresh
an earlier snapshot. `--resume` does not convert an existing export to a broader
scope.

```sh
python3 tools/env/codex-cloud-history.py --archived --output scratch/codex-history --resume --markdown
```

The default authentication command is the JSON argv array
`["codex","app-server","--stdio"]`. `--auth-command` accepts another JSON argv
array for an existing authorized official App Server process, including a wrapper
that starts the already configured isolated Docker authentication helper:

```sh
python3 tools/env/codex-cloud-history.py --archived --output scratch/codex-history --auth-command '["/absolute/path/to/official-auth-ipc-wrapper"]'
```

The wrapper must expose the official App Server's JSONL stdin/stdout interface.
The exporter invokes it directly, without a shell. It sends local `initialize`,
the `initialized` notification, and `getAuthStatus` with `includeToken: true` and
`refreshToken: true`. The official client owns credential-store access and token
refresh. The exporter does not read `auth.json`, inspect a keyring, start login,
or save the returned token. Choose the intended signed-in account/profile in the
authentication command before running the export.

## Read-only and recovery behavior

The hosted request allowlist is `initialize`, `thread/list`, `thread/read`, and
`thread/items/list`, plus the required `initialized` notification. It does not
resume threads, start turns, answer approvals, send messages, archive, or delete.
Any server-initiated request is left unanswered and closes the connection.

The handshake includes `codex-app-server`, the currently required
`codex-client.browser` discriminator, and the in-memory `openai-bearer.<token>`
subprotocol. `clientInfo` identifies this exporter. TLS verification stays enabled;
the library uses the configured operating-system/environment proxy. Redirects
are refused so that the bearer subprotocol cannot follow them to another host.
See the [websockets client reference](https://websockets.readthedocs.io/en/stable/reference/asyncio/client.html)
and [proxy behavior](https://websockets.readthedocs.io/en/stable/topics/proxies.html).
No exception message or stderr diagnostic is printed: handshake errors can contain
the credential-bearing subprotocol. Reports contain fixed failure reasons,
exception class names, and numeric HTTP status where available.

Listings and item pages preserve request parameters and the server's complete
result envelope after reasoning removal. Each continuation cursor is checked for
cycles, malformed values, and a 10,000-page bound per stream. Connections rotate
after 48 MiB received; transport failures retry at most three times. A page that
exceeds the 64 MiB message bound fails visibly. Every completed page has a private
checkpoint, so a lost connection does not discard earlier pages.

Subagent closure follows `subAgentActivity.agentThreadId`,
`collabAgentToolCall.receiverThreadIds`, and `collabAgentToolCall.agentsStates`
keys. Every reference requires metadata ancestry back to a selected root or an
already accepted descendant before that target's item contents are read.
Communication targets can be unrelated tasks, so a send, wait, or close call
alone never establishes descent.
The proof uses `parentThreadId` or `source.subAgent.thread_spawn.parent_thread_id`;
fork ancestry and prompt text are not proof of parentage. Unverified references
remain in the graph, with no content export for that target. Missing or denied
children remain recorded failures. A visited set prevents recursive cycles and
shared descendants are captured once.

This is **closure over persisted references**, not proof that every backend child
was discovered. Separate live subagent-listing checks returned no rows despite
known children. An orphan child with no retained native reference can remain
undiscoverable. The manifest reports unresolved references, failed threads, and
pagination completion; it does not turn missing records into successful captures.

## Files and redaction

The output layout is:

```text
OUTPUT/
  _private/state.json                 resumable scope, cursors, graph and failures
  _private/listing/page-*.json         original listing envelopes, reasoning removed
  _private/threads/ID/pages/*.json     original item envelopes, reasoning removed
  share/manifest.json                 redacted scope, graph, counts and limitations
  share/listing/page-*.json            redacted listing envelopes
  share/threads/ID/metadata*.json      redacted metadata read envelopes
  share/threads/ID/pages/*.json        redacted item envelopes, all native fields
  share/threads/ID/transcript.json     all persisted non-reasoning items
  share/threads/ID/transcript.md       optional native-record Markdown view
```

Directories use mode `0700` and JSON files use mode `0600`. Reasoning items and
reasoning payload fields are removed **before any checkpoint is written**.
The private tree otherwise retains unredacted records and must stay private.

Redaction makes two passes over all checkpoint JSON before producing `share/`:
it first collects values from credential fields, embedded JSON, JWTs, bearer
strings, common credential assignments, known OpenAI/GitHub/Google/Slack key
patterns, PEM private keys, and sensitive headers (including name/value records),
then removes those values from every
packaged occurrence, including earlier messages and mirrored tool output.
Structured credential fields are masked as well. A known-value list in memory
also contains the access tokens used for retrieval. Values themselves are never
included in the manifest.

Credential values shorter than eight characters are masked in structured fields,
exact scalar echoes, and recognized assignment values. They are not replaced as
arbitrary substrings of ordinary prose. Overlapping matches are merged before a
single replacement pass; existing redaction markers remain intact.
Map keys are checked for known credential formats and known-value mirrors too,
including escaped JSON and URL-encoded long values. If redacted keys collide,
stable ordinal labels preserve each entry's distinct value. Ordinary schema keys
remain unchanged unless they match a known credential. This remains best effort,
not a guarantee that every encoding or secret format is recognized.

The rules are conservative and can mask innocent text; they cannot identify every
kind of secret. Review the **`share/` directory only** before uploading it. Package
or upload that directory, never `OUTPUT/` or `_private/`. No transcript, account
identifier, login state, or generated archive should be committed to this project.

Unknown native item types and unknown tool fields are preserved. Transcript JSON
keeps the latest encountered version of each item ID, while per-page envelopes
retain every observed version and wrapper field. Entries without IDs remain
present. Markdown presents the same redacted native records; JSON is the primary
interchange format.

Exit status is `0` for completed requested pagination and reference traversal,
`2` for recorded thread/reference failures, and `1` for a fatal error or
interruption. Where possible, a partial redacted `share/` is still produced; its
manifest must be checked before treating it as a completed export.

## Material limits and verification

Retrieval is not an atomic snapshot. Active descendants can change during a
capture, and an interrupted resumed capture can span several retrieval times.
Initial/final metadata and page envelopes retain the evidence needed to assess
those limits. Upstream retention, access control, environment termination, and
history migrations can prevent reads even when the original UI shows a task.

Native records are the persisted public representation. A command's null output
means unavailable, not an empty successful output. Persisted output may be
truncated; absence of a truncation marker does not guarantee completeness.
Native command records do not necessarily reproduce the original execution
wrapper's JSON, separate stdout/stderr, every intermediate event, or nested tool
calls absent from the saved representation. The exporter preserves what it
receives without inventing missing payloads. Image/file references remain
references; it does not download image bytes, attachments, or expiring URLs.
Reasoning is excluded. Historical token usage need not be present.

Useful offline fixtures exercise: archived-only listing requests and pagination;
cursor cycles; unknown fields and item versions; reasoning removal from wrapped
items; nested credential fields and mirrored values across pages; a multi-level
native child graph; receiver and `agentsStates` ancestry rejection; missing
children; and resume after an item page or final metadata read fails. A fake async
`client.call(method, params)` can drive `Exporter` without opening a connection.
These fixtures verify exporter behavior, not current hosted service availability.

## Uploading the redacted export

Check the destination's actual Drive permissions before transferring transcripts.
A new subfolder inherits its parent's permissions, including anyone-with-link
access. Use a private My Drive folder for a personal archive and verify the
folder and uploaded files are owner-only. Do not change the sharing of an
existing project folder just to store a backup. See Google's
[sharing and inherited-permission reference](https://developers.google.com/workspace/drive/api/guides/manage-sharing).

An installed Google Drive plugin does not establish an authenticated account
connection. In the observed Apps runtime, tools whose
`_meta._codex_apps.synthetic_link` was `true` appeared in discovery but returned
`Unknown tool`; connecting the underlying Drive account resolved the calls.
The official CLI can inspect `app/installed` and `mcpServerStatus/list` without
extracting Google's tokens. Standalone `gws` and `rclone` have their own
authentication setup; a working Apps connection does not create their credential
files. See the [Google Workspace CLI authentication guide](https://github.com/googleworkspace/cli#authentication).

Use a transfer surface that supports runtime file references. A direct
`mcpServer/tool/call` with a local-path string was rejected because the underlying
Drive upload schema expected a file-reference object. The connected host upload
tool materialized the local file successfully. Do not replace that handoff with
inline archive bytes or copied access tokens. Read back the uploaded file's ID,
parent, size, and permissions before treating the backup as stored.
