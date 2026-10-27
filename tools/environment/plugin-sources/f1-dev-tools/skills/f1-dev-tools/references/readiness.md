# Route selection and readiness receipts

Use this reference before local executor probes, browser ownership changes, or
interpreting an asynchronous tool/job result. Existing prepared-environment
recovery remains in [environment.md](environment.md). This document is a workflow,
not a report of the current host, attached tools or Cloud readiness.

## Hosted read or local work

Start with the actually exposed F1 tools and their current schemas. A host prefix
can differ from the examples; discover the suffix instead of inventing a callable
tool. Prefer an existing connected gateway and a bounded hosted `apex_status`
read. Working hosted reads do not require a local checkout, dependency install,
MCP launcher, tunnel restart or a desktop process manager.

Status is scoped evidence. A successful status call can establish its reported
prerequisites or occupancy, not every operation or a rendered game. A published
plugin, configured server or healthy local catalog does not prove attachment.
An absent/unauthorized hosted capability does not authorize a new connection or
credential replacement. Follow the supported fallback and report the specific
unavailable capability.

Only inspect local readiness when the requested work needs that executor or a
documented local fallback. When a managed executor is attached, use its runtime
guidance/status. For the prepared F1 environment, read `environment.md` before
recovery: preserve its `f1-env doctor`/`resume` lifecycle route and existing runtime
bindings. A `Session terminated` response, missing tool, permission error and
missing local dependency have different remedies. Do not install dependencies
as routine startup or ask for sandbox escalation where the environment disables
it. A local recovery still needs a fresh hosted read before claiming reconnection.

## One local owner, reusable evidence

The parent or designated local owner performs the required read-only preflight
once for the selected route. Keep a compact receipt containing:

- Resolved repository root and cwd/worktree, commit HEAD, and relevant dirty
  wrapper/source identity when it differs from HEAD.
- Dependency identity, such as the applicable lockfile fingerprint and observed
  required executable versions/availability; an existing lockfile alone is not
  proof its dependencies are installed.
- Selected endpoint/service identities and execution host, with credentials,
  URL secrets, runtime values and full profiles excluded.
- Which status/doctor/schema checks ran, when they ran, their native outcome,
  omissions, and any saved evidence location.
- Browser/job occupancy and ownership when needed for the next action.

Artifact-only children can reuse that receipt for the same worktree, source,
dependencies and endpoint identities. Recheck only the affected portion after a
relevant change, a new/changed capability failure, or a dynamic observation
becoming unsuitable for the next action. Browser occupancy, permissions and job
state can change even when source identity is unchanged; refresh those facts
before an ownership-sensitive operation.

For a checkout CLI path, use that checkout's documented
`bash tools/env/ensure-mcp-ready.sh` check once (`--strict` when missing
prerequisites must fail). Keep its actual failure visible and use the documented
repair/install procedure only when required. Neither this helper nor a matching
receipt can attach host tools, grant permissions or change global trust.

## Executable cold-start report and handoff

When the local owner needs a cold-start report, run the plugin-root
`scripts/readiness.mjs` from the intended checkout. Reuse a matching existing
receipt instead of repeating the three probes for each child or workflow.

```sh
node /path/to/plugin/scripts/readiness.mjs --checkout "$PWD" --out artifacts/f1-readiness.json
```

The checkout path is mandatory and exact: no automatic choice among worktrees.
Choose a new output path; the script preserves existing evidence. It checks the
existing Apex wrapper, Git identity and working tree, then calls `apex_status`,
`apex_catalog` and `apex_doctor` serially with a per-call timeout. It does not run
bootstrap, install dependencies, acquire a browser, change settings or attach a
server. Use the checkout's documented repair/bootstrap only when inspection shows
it is needed. An unsupported/missing wrapper or unreadable result is FAIL, never
an empty successful result. This local report is optional for a working hosted
read and does not replace the route-specific receipt fields above.

For host discovery, save the active session's actual tool names as a JSON array
of strings, or an object with a `tools` array of strings / objects with `name`.
Then add `--catalog /absolute/path/to/host-tools.json`. Do not use `.mcp.json` or a
package manifest as a host snapshot. No snapshot = UNKNOWN; an empty snapshot =
no relevant tool exposed. A matched name establishes exposure only. The snapshot
is supplied evidence; this CLI cannot authenticate its freshness or make host
tool calls.

The report separates three known checkout MCP routes (none declared as local
plugin servers) from exposed tools and executed local CLI checks. It does not
repeat the checkout catalog; counts and warnings point back to current discovery.
`overall: PARTIAL` is expected while host service checks and rendered behavior
are SKIP. Exit 0 means local checks passed, even when overall coverage is PARTIAL;
exit 1 means a local check failed. Do not label the entire host verified because
a local exit is zero.

When attachment is absent, use the checkout CLI fallbacks while preserving their
scope: LSP via `bash tools/mcp/lsp-mcp.sh`, persistent debugger via its documented
wrapper, and browser setup/cleanup via
`.claude/skills/mcp-probe/references/offline.md`. Missing tmux or an unwritable
browser cache is reported by doctor; it is not repaired by changing permissions.
After an account update, inspect actual host exposure again. A supporting local
executor can reload stdio connections; a new hosted chat does not guarantee
attachment. Make a harmless attached call only when the tools are exposed.

Handoff includes the report location, checked Git SHA, local checks and warnings,
supplied host-snapshot state, missing exposed tools and unexecuted host/browser
checks. A report under ignored artifacts is local evidence; transfer it or state
that it is local-only. Do not include career saves, tokens, process environments
or full tool descriptions.

## Bound reads to the resolved source

Instruction and source read receipts bind resolved worktree/root, file or skill
identity, revision/content change signal and range/cursor. The same relative
command in another worktree can read different content. HEAD equality alone does
not prove dirty files or dependencies are unchanged. Preserve required instruction
reads and read newly relevant sections; avoid rereading unchanged manuals merely
to restate a handoff.

Use relevant schema/catalog entries, LSP outlines then bounded definitions, or
filename/count searches before selected source windows. Preserve tool errors and
explicit omissions. Retrieve a saved output range/artifact when available instead
of rerunning the action for a different presentation. If a receipt lacks the
evidence needed for the next decision, obtain that bounded evidence; do not infer
it from a truncated summary.

## One parent-owned browser

The parent/browser owner checks current occupancy and the checkout's locking
rules before starting a rendered workflow. Reuse the authorized managed page or
documented local profile and keep one browser route/process at a time. Children
can inspect source or saved artifacts without launching parallel browsers.

Localhost is local to the browser's executor. Record source/build, URL identity
without secret query values, renderer, viewport and the relevant replay/device
conditions. Close/release owned sessions and confirm an earlier owned browser job
has ended before changing modes. Use only the supported cancellation procedure
within existing authorization; do not terminate another session's process or
mistake a released client for proof all browser work stopped.

## Jobs, waits and completion

Use the selected tool/runner's native fields and supported status/result route.
Keep its job/run ID, execution host, source/worktree identity, expected artifacts
and latest observed status. Do not invent parameters, a missing job API, or a
terminal result because the package describes one.

For reporting, distinguish these outcomes without replacing the native evidence:

| Observation | Interpretation and next step |
|---|---|
| Running or pending prerequisite | Existing work may still be healthy; use its owned monitor policy and bounded progress deltas. |
| Expected search no-match or unchanged status | Not automatically a failed task; interpret the operation's documented semantics. |
| Monitor/wait deadline | The observer stopped waiting. Check whether the underlying owned run is alive before retrying or launching another. |
| Interrupted or cancelled run | Record an incomplete/terminal outcome as reported; retain valid checkpoints and confirm cleanup. |
| Terminal failure | Inspect the actionable failure and changed prerequisite/hypothesis before a bounded retry. |
| Terminal success | Match the verdict to the intended job/source and verify the expected artifact and acceptance checks. |

A waiter exit such as 124 is only a waiter deadline when that runner documents
it that way; the same code from another command can mean something else. A shell
wrapper's exit, an empty output or a status saying ready does not by itself prove
that every child completed or that UI/camera/render acceptance passed.

Use one owner/controller per job, keep the original command/status/error and
source-bound receipt, and preserve required user progress updates. Prefer
completion notifications when the host actually supports them; otherwise follow
the supported bounded status/wait procedure. No native timer or subscription is
created by installing this skill. Before relaunch, check for the existing run and
whether source, command scope, dependencies, endpoint or policy changed.

Verify the supported terminal verdict plus the relevant artifact's identity and
content against acceptance criteria. An artifact's existence/hash alone does not
prove domain correctness. If a remote artifact is unavailable, say that its
verification remains incomplete. Report local readiness, hosted attachment,
rendered evidence, PR CI and deployment separately.

Codex child-task and host boundaries are covered in
[Codex workflows](../../f1-agent-coordination/references/codex-workflows.md).
