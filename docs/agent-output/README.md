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
Small MCP results (at most 1 KiB) keep their native content and structured data
when that is smaller than the summary envelope. Their saved-evidence receipt is
in `_meta["apex/agent-output"].artifact`. Larger previews use
`structuredContent.artifact`. Terminal execution records still add overhead to
tiny commands: prefer the existing concise native answer for commands marked
`keep-native`, such as plain `doctor`, unless retention is needed.

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

Compact is most useful for bulky producer output. Native tool limits may already
give a concise answer: use the native route or `--output-level full` for a bounded
source definition or a small VM report whose facts are all needed. Receipt
metadata adds overhead, and retrieving omitted facts adds another response.
Compare the whole workflow, including retrievals, when choosing a level.

For long commands, add `--progress` before `--`. One JSON receipt goes to stderr
before launch with stdout/stderr and status artifact identities. Stdout remains
one final JSON record (or the unchanged full streams). There is no polling timer
or repeated progress tail. Read a receipt while the command runs:

```sh
node tools/agent-run.mjs --progress -- node tools/ci/tooling-fast.mjs --jobs=3
node tools/agent-run.mjs --status artifacts/agent-output/<status-file>.json
node tools/agent-run.mjs --status artifacts/agent-output/<status-file>.json --since <cursor>
```

Status includes observed stream sizes, elapsed time and a change cursor.
`--since` returns only an unchanged marker when state and stream sizes match.
An old running receipt never establishes completion or success. Existing native
phase logs remain in the retained streams. The quiet skill-smoke runner also
supports native `--progress` JSONL on stderr with recipe counts and elapsed time.

Native `deploy.mjs --json` also retains complete child stdout in private log
artifacts and announces each path on stderr before execution. Child stderr stays
live; a failed child produces a final JSON error with its stdout artifact, so a
quiet gate still leaves evidence for diagnosis.

Compact terminal logs include a bounded actionable failure block even when the
cause occurs in the middle, plus reported test counts and artifact/verdict
receipts where available. Diagnostic adds surrounding context. Test counts
describe reported stream summaries; nested/repeated suites can overlap, so the
exit/status remains authoritative. Passing TAP/spec test names cannot consume
failure slots, including markers after bracketed producer tags such as
`[tooling-fast]`. Explicit failure markers take priority over generic error text
and zero-valued expectations inside an assertion.
Warnings have a separate bounded `warnings` block in each stream summary.
Status-bearing JSON collections prioritize failed/warning rows regardless of
their field name (`rows`, `items`, or producer-specific names); ordinary arrays
keep their original order. Omission counts and saved-result pointers still apply.
Capture and performance commands that print
phase logs followed by final JSON receive a semantic preview of that report,
including validity, baselines, units and prioritized failures. Complete phase
logs and numeric data remain in the original artifact. A mixed-log stream also
provides `reportArtifact`, a complete JSON copy for its collection source
pointers; use that artifact for exact rows, and the stream artifact for logs.

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

For exact JSON collection rows, use `--read <artifact> --pointer /rows
--offset 3 --limit 20`. A pointer is an RFC 6901 JSON pointer, with `~0` and `~1`
escaping. Collection pages return unchanged rows and a `nextOffset`, within the
retained result. They do not advance upstream pagination. Collection limits are
1–100 rows, at most 262144 bytes per page and an 8 MiB source artifact; reduce
the row limit or use byte pages for larger evidence. No individual row is clipped.

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

Use `format=collection`, `pointer`, `offset` and `limit` for exact rows without
repeating the action. For example, `/structuredContent/rows` selects structured
rows; `/content/0/text/rows` also works when native JSON lives inside a text
block. Preview collection receipts distinguish fetched total, displayed and
omitted rows and identify the source pointer. A native upstream `nextCursor`
still means another upstream page; retrieve omitted rows in the saved page
before moving that cursor. Summary normalization may display text JSON under
`data`, but its source pointer uses the original `text` field.

Schemas advertise both the original full result and the bounded presentation
envelope. Full results preserve their original content and structured data.
Protocol notifications, cancellation and approval decisions are unaffected.

## Coverage and discovery

[The generated catalog](catalog.json) lists the tool-file inventory, npm scripts,
configured MCP routes and entrypoint coverage. Libraries, assets and data files
are distinguished from executable candidates; the inventory does not execute
scripts to guess what they do.

[Per-file policies](policies.json) record the reviewed output decision and
preservation contract for every tool file. Shared `contracts` entries are
referenced as `@name` preserve values so repeated prose is not duplicated.
The generated catalog stores only `outputPolicy` (action); look up the preserve
text in policies.json. Libraries and control protocols receive no invented
verbosity flags; protocol entrypoints have no terminal-wrapper recommendation.
Shared profiles apply to report, artifact, collection and long-job producers, so
npm aliases inherit the same behavior without separate implementations.
Candidate argv is `catalog.runner` + `interpreter` + `path` (or
`npm run <name>`), not a duplicated argv array on every row.

Native retention exceptions are fixed at their producer: probe-mcp emits valid
JSON and saves oversized originals under `artifacts/probe-mcp/`; cdmcp-measure
saves complete JSON; debugger operation previews retain private original CDP
responses under `artifacts/agent-output/`. Read those debugger artifacts as byte
or collection pages, rather than evaluating again. Probe originals can be read
directly from their returned local path.

Notification-origin skill hints are skipped only when host event metadata
identifies a nonprompt event. Plain user prompts remain routable. Memory-sync
conflicts use PostToolUse context or a nonblocking Stop user warning. Guard
allow/deny JSON, silent successful paths and exit codes keep their exact native
contracts and are excluded from generic wrapping.

Every terminal command can be presented through `agent-run`; every tool returned
by a configured server's `tools/list` is adapted by the gateway, including
paginated discoveries. Native flags are listed separately so a generated catalog
does not falsely claim every script accepts `--output-level` directly.
Search or filter the catalog for the command being used; avoid loading the
whole inventory into an agent conversation. For example, with `jq`:

```sh
jq '.tools[] | select(.path == "tools/check/doctor.mjs")' docs/agent-output/catalog.json
jq '.tools["tools/check/doctor.mjs"]' docs/agent-output/policies.json
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
