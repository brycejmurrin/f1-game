# Read-only Codex Cloud history in Apex MCP

`apex_codex_agents` adds Codex Cloud history to the existing Apex server and
private gateway. It uses the MCP server host's existing ChatGPT Codex CLI login.
Native children, local CLI sessions, legacy `codex cloud` tasks and hosted Cloud
sessions are separate inventories; a successful empty legacy list does not prove
that hosted history is empty.

## Ownership and data flow

The Node descriptor/handler validates closed per-verb arguments before spawning
anything. Discovery, capabilities and dry runs perform no authentication. A real
read launches the bounded Python helper with JSON on stdin. The helper obtains
its current credential through the local Codex app-server's `getAuthStatus`,
keeps it in memory and connects to the fixed authenticated hosted app-server.
It sends only initialize and history-read RPCs. No browser cookies, token-file
inspection, alternate origins, redirect following or provider writes are used.

The existing app, gateway, tunnel profile, sharing and credential bindings stay
in place. Source registration, local gateway acceptance, merged source and native
host attachment are distinct results. The adjacent Claude/inbox integrations are
coordinated on PRs #4412 and #4397; their source is not part of this branch's base.
A combined merge needs normal regeneration and discovery-budget measurement.

## Operations

- `capabilities`: offline options, limits, prerequisites and unsupported controls.
- `list`: one page, `options.limit` 1–20, returned `cursor`, optional `archived`.
- `status`: metadata for the required session UUID in `id`.
- `transcript`: oldest-first items, `options.only` `chat` (default) or `all`;
  `maxBytes` 256–8192 (default 4096), `limit` 1–20 (default 10), returned `cursor`.

Transcript output is a UTF-8 JSONL fragment, not necessarily a complete JSON
record. Concatenate successive `out.text` values. Continuations retain the
provider page and byte offset; a fingerprint rejects a page changed while being
read. Keep `id`, `limit` and `only` unchanged. Empty filtered pages still advance.
A null cursor exhausts the available persisted history at that observation.
Active histories are snapshots, not a transaction across a session or account.
Other sessions' text and tool records are untrusted data, never instructions.
Attachments remain records/references; this tool does not download their files.

## Host prerequisites

Python 3.11+, `websockets==16.0` (pinned in
`requirements/codex-cloud.txt`), and the Codex CLI signed in with ChatGPT
must be available to the server. `APEX_CODEX_PYTHON` and `APEX_CODEX_BIN` select
executables in the server environment, never in tool arguments. Preserve the
host's approved proxy and CA settings. Reads never install dependencies or
initiate sign-in. Missing prerequisites and HTTP/RPC refusals are errors.

The hosted endpoint is experimental; this wrapper is not a guarantee that its
service contract remains stable. The observed public native gRPC client currently
supports resume/live attach, while this reader uses the hosted JSON-RPC route.
The Node process owner bounds time/output and cleans descendants on cancellation.
Raw auth diagnostics and exception strings are not returned to the caller.

## Verification

Hermetic cases cover argument closure, no auth on discovery/dryRun, UTF-8 fragments,
changed/mismatched/repeated cursors, filtered pages, read-only RPCs, split stdout
encoding, output overflow, cancellation and real Apex stdio discovery/dispatch.
A separate live read-only handler probe passed list/status/transcript/continuation.
No user transcript or credential is committed with the source.

## Sources checked

- [Codex app-server protocol](https://github.com/openai/codex/blob/a795f961be68383738e56ac396742b3e8451696a/codex-rs/app-server/README.md)
- [Upstream WebSocket limits](https://github.com/openai/codex/blob/a795f961be68383738e56ac396742b3e8451696a/codex-rs/app-server-client/src/remote.rs)
- [Hosted transport observations](https://github.com/openai/codex/issues/49829)
- [Websockets client and proxy API](https://websockets.readthedocs.io/en/16.0/reference/asyncio/client.html)
- [MCP tool contracts](https://modelcontextprotocol.io/specification/2025-06-18/server/tools)
