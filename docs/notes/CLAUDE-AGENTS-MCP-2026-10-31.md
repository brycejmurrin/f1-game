# Claude Code session adapter

`apex_claude_agents` is an additional tool in the existing Apex MCP server. It
uses Claude Code's authenticated CLI on that server's host. It creates no
new server, credential store, tunnel, provider session or permission bypass.

## Supported operations

| Verb | Arguments | Result |
| --- | --- | --- |
| `capabilities` | none | Supported operations and explicit cloud limitations |
| `auth` | none | Login state, authentication method and subscription type; account identity omitted |
| `remember` | `id`, `options.title` | Store a known cloud session address locally; no ownership claim |
| `list` | optional `options.limit` (1–100) | Locally remembered cloud addresses, with `live:false`; not account inventory |
| `followup` | `id`, exactly one of `options.text` or `options.textFile` | Queue one cloud message; report delivery separately from any response |
| `local-list` | optional `options.all`, `options.limit` | Local interactive/background sessions from `claude agents --json` |
| `local-logs` | local `id`, optional `options.maxChars` (1–32000) | Bounded recent local output, explicitly untrusted data |

Every operation accepts `dryRun:true`. Mock mode validates and produces a dry
run without calling the CLI or reading/writing the registry or message files.
Options are closed per verb; unknown fields fail before process creation.

```json
{"verb":"auth"}
{"verb":"remember","id":"cse_example","options":{"title":"Example session"}}
{"verb":"list"}
{"verb":"followup","id":"cse_example","options":{"text":"Reply with your current status only; do not change files or run commands."},"dryRun":true}
```

The shell route uses the same implementation:

```sh
node tools/mcp/apex-tools-mcp.mjs call apex_claude_agents '{"verb":"capabilities"}'
node tools/ci/claude-agents.mjs '{"verb":"auth"}'
```

Install Claude Code on the MCP server host and put `claude` on its PATH, or set
`APEX_CLAUDE_BIN` to the CLI executable. Run `claude auth login` there manually.
Do not put keys, OAuth tokens or passwords into tool arguments or tracked files.
The adapter does not invoke npm, download a package, start login or change host
configuration. Signing in on an attached executor does not authenticate a
different hosted MCP machine.

## Cloud boundaries

The documented cloud send command is `claude -p --cloud <id> --output-format json`
with the message on stdin. Sending is a single attempt, never an automatic retry.
A successful matching JSON receipt returns `delivery:"queued"` and
`replyRetrieved:false`. A timeout, output overflow, malformed/mismatched receipt
or nonzero exit without a rejection receipt returns `delivery_unknown`. Check
the cloud conversation before resending: killing the CLI cannot retract a
message already accepted by the provider. A missing CLI is `not_attempted`.

The adapter accepts `cse_` and `session_` identifiers and official HTTPS session
URLs. `cshk_` links are rejected; their prefix is never rewritten by guessing.
The tested interactive `claude --teleport` picker can discover account sessions,
but there is no documented noninteractive JSON cloud-list operation in the
tested CLI. This adapter does not scrape that picker, teleport a checkout or
claim that its local address book is a live inventory. The registry is
`artifacts/claude-agents.json`, with exclusive mutation lock and atomic replacement.

Cloud launch, interactive attach, cancellation, remote transcripts and usage
retrieval are not implemented. CLI testing before this implementation found
interactive cloud attachment disabled for this account; that is distinct from
the successfully delivered cloud follow-up. Local listing and logs are not
cloud session access. No new follow-up or worker launch is needed for adapter
unit tests or read-only authentication smoke checks.

## Verification and provenance

Source began at the prepared checkout on `claude/f1-game-project-26h3ng`; work is
on `cursor/claude-agents-mcp-10c31`. Contract tests share the existing registered
`tests/unit/cursor-agents.test.mjs` suite, with main-server discovery/mock checks
in `tests/unit/apex-tools-mcp.test.mjs`.

Fixtures cover exact stdin delivery, queued versus unknown/rejected verdicts,
no retries, unsupported controls, CLI absence, cancellation, message-file
symlink escapes, registry locking, bounded local output and identity omission.
The real child-transport test launches a local fixture executable, not Claude.
Read-only live checks used Claude Code 2.1.314 and the existing local Max login.
They do not establish activation or authentication on the separately hosted MCP.

Primary references checked for this change:

- [Claude CLI reference](https://code.claude.com/docs/en/cli-reference)
- [Cloud follow-ups](https://code.claude.com/docs/en/claude-code-on-the-web#send-follow-ups-from-the-cli)
- [Cloud teleport](https://code.claude.com/docs/en/claude-code-on-the-web#continue-a-cloud-session-in-your-terminal)

The main-server integration is a descriptor spread and lazy handler route;
the existing Cursor adapter remains unchanged. PR #4397 owns separate inbox
work. Its pushed file list was checked; no inbox source or groups registry was
edited here. Shared generated output should be regenerated when both branches
are integrated rather than preserving conflicting generated hunks by hand.
