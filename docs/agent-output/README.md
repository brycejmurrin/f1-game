# Agent output levels

Agent-facing project entrypoints default to **compact**. Choose **diagnostic**
when investigating a failure and **full** when the complete result is needed.
The choice changes presentation, not which checks run or what the command does.
Native command flags and programmatic interfaces keep their existing behavior.

| Level | Information returned | Full evidence |
|---|---|---|
| `compact` (default) | Bounded status, errors, counts and data excerpts, with explicit omissions. | Saved before summarizing; result includes its artifact path. |
| `diagnostic` | Larger excerpts, error/cause/stack context and relevant warning/failure lines. | Same artifact; no action needs to run again. |
| `full` | Original output, including its native format and MCP content. | Also retained when possible; persistence problems are explicit. |

Bounded data is a preview, never proof that omitted findings are absent. Exit
codes and MCP errors remain errors at every level. Unknown and pending states
stay unknown and pending. A short successful result does not prove a test suite
or readiness gate ran.
Small native results may grow when wrapped in a summary and evidence envelope;
these levels bound large output rather than promise savings on every call.

## Terminal commands

Use the shared entrypoint for any explicit command, keeping its arguments after
`--`. Arguments are passed literally without a shell; shell operators are not
interpreted. For example:

```sh
node tools/agent-run.mjs -- node tools/check/doctor.mjs --json
node tools/agent-run.mjs --output-level diagnostic -- node tools/ci/sync-pr.mjs <branch> --resume
node tools/agent-run.mjs --output-level full -- npm run test:audit
node tools/agent-run.mjs --help
```

The wrapper retains stdout and stderr separately and preserves the command's
exit status. If an explicit timeout fires and the child handles termination with
exit 0, the wrapper returns 124 and retains the child's original exit in its
record. Cleanup failures also return a failure. A long-running command remains long-running; output levels do not
add timeouts or authorize an action. Continue to use the repository's background
execution, browser serialization, ownership and pre-push rules.
Cancellation and explicit timeouts forward signals and escalate cleanup of owned
processes. Ordinary CLI completion preserves deliberate background-job handoffs.
MCP server shutdown allows a brief EOF grace period before escalating cleanup.
Detached descendants that start and reparent between process scans can escape
tracking; keep using the project's supervisors for managed background runs.

Use the returned artifact with `--read` to inspect saved evidence without
re-running a command. Page large results; use `--help` for the supported read
offset/limit options. `full` for a new invocation executes the command again,
so use saved-result retrieval for actions already completed.

## MCP tools

All five project-configured stdio servers run through the same presentation
gateway: `apex-tools`, `apex-lsp`, `js-debugger`, `chrome-devtools` and
`playwright-official`. Their existing pinned upstream launchers remain intact.
The gateway adds a selectable parameter to discovered tools:

```json
{"outputLevel":"compact"}
```

Merge it with the tool's normal arguments. The other choices are `diagnostic`
and `full`; omission means `compact`. If an upstream tool already owns the name,
the gateway advertises a collision-free parameter in that tool's schema instead.
The tool description identifies that name. Existing fields such as `format`,
`limit`, `offset`, `full` or `image` still control the upstream operation; the
gateway's level controls the final presentation and cannot restore data the
upstream tool never returned.

Each server also exposes `output_read`. Pass the returned artifact path and a
page offset/limit to retrieve saved evidence at the requested level. Retrieval
does not repeat the original action. Original image/content blocks are retained
in the saved result; use `full` when the next action requires the original MCP
image or machine-readable result rather than a text preview. To restore a saved
MCP result, call `output_read` with
`{"artifact":"<artifact.path>","format":"original","outputLevel":"full"}`.
This restores original blocks without repeating the action, up to 8 MiB; larger
artifacts remain accessible in bounded text pages. The default `format` is
`page`. Original retrieval rejects page offsets/limits.

Schemas advertise both the original full result and the bounded presentation
envelope. Full results preserve their original content and structured data.
Protocol notifications, cancellation and approval decisions are unaffected.

## Coverage and discovery

[The generated catalog](catalog.json) lists the tool-file inventory, npm scripts,
configured MCP routes and entrypoint coverage. Libraries, assets and data files
are distinguished from executable candidates; the inventory does not execute
scripts to guess what they do.

Every terminal command can be presented through `agent-run`; every tool returned
by a configured server's `tools/list` is adapted by the gateway, including
paginated discoveries. Native flags are listed separately so a generated catalog
does not falsely claim every script accepts `--output-level` directly.
Search or filter the catalog for the command being used; avoid loading the
whole inventory into an agent conversation. For example, with `jq`:

```sh
jq '.tools[] | select(.path == "tools/check/doctor.mjs")' docs/agent-output/catalog.json
```

Hosted tools outside these configured servers, such as Cursor's built-in file
reader or another application's connector, keep their host-controlled formats.
Scope those queries at the source. This repository cannot change their schemas.
Changes to configured MCP entrypoints take effect when the host reloads them;
an already-running hosted session may still expose the previous tools.

Saved results live under `artifacts/agent-output/` and are local, regenerable
evidence. Do not commit raw logs or transcripts. Read access is constrained to
that artifact directory; arbitrary files, traversal and symlink escapes are
rejected. Large full results still cost context to read, so request the evidence
needed for the next decision.
