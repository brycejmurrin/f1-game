# Tool output probes and compact status — 2026-10-18

Measured on the `891df16` checkout while implementing the changes below. These
are local command-output bytes and wall times, not provider token measurements
or billing savings. The application was not changed and no browser was started.
Background validation is separate from the output probes.

## Method and observations

Ran 21 bounded CLI invocations sequentially, capturing full stdout/stderr and
exit status under `artifacts/token-tool-probes/`; `manifest.json` records argv,
bytes, line counts and duration. Twenty returned exit 0. One deliberately invalid
doctor argument returned exit 1 with `bad_args`, the unknown argument and valid
options; that refusal is an expected negative probe, not a passing doctor check.
The artifacts are regenerable local evidence and are not committed transcripts.

| Question / command | stdout bytes | Result / interpretation |
|---|---:|---|
| `node tools/check/doctor.mjs` | 418 | All 3 warnings plus 237 pass / 3 warning / 0 fail counts. |
| Same doctor, `--json` | 94,758 | All 240 check rows and their detailed metadata. |
| MCP CLI `call apex_doctor '{}'` | 1,246 | All 3 warnings plus the count of 237 passing checks. |
| Same MCP CLI, `'{"full":true}'` | 102,126 | Full check rows plus the wrapper envelope. |
| LSP `refs Tracks.curvature --limit=40` | 5,589 | 40 of 52 references in 17 files, source lines included. |
| Same reference page, `--concise --limit=40` | 2,754 | Same bounded page with locations/context and pagination, source text omitted. |
| Same symbol, `--files` | 471 | Per-file scope/counts; this answers a narrower question than reference locations. |
| `session-status.mjs` default | 1,776 | Existing full Markdown handoff. |
| Same status, new `--summary` | 1,099 | Counts, state, bounded unresolved examples and retrieval instructions. |
| `pick-tests.mjs` / `--json` | 388 / 876 | The structured format was larger than plain text for this diff. |
| `verify-change.mjs --plan --json` | 2,324 | Read-only plan; no verification run started. |
| `select-specs.mjs --since origin/claude/f1-game-project-26h3ng --json` | 645 | Diff-specific selection. |
| `bloat-scan.mjs` / `--json` | 3,022 / 7,412 | Structured detail costs more output than its table. |
| `ratchets.mjs --json` | 6,522 | Read-only metrics; about 8.5 seconds, the slowest output probe. |
| `agent.mjs help info` | 105 | One hook's help without launching the game. |
| `mirror-skills.sh --check` | 30 | Mirror check passed. |
| MCP CLI `call apex_status '{}'` | 1,566 | Runtime/occupancy snapshot; no browser launched. |
| MCP CLI `list-tools` | 127,723 | 33 full tool schemas; inspect only needed entries outside model context. |

For MCP CLI calls the table measures the CLI's emitted body, not stdio JSON-RPC
serialization or a hosted model's context. The full catalog is not evidence
that a host injects all schemas on every turn; deferred loading is host-specific.
Doctor timings were about 0.17–0.33 seconds, so compact output saves context here,
not substantial tool execution time.

The strongest immediate finding is that compact doctor output already works.
The plain CLI is 99.6% smaller in stdout bytes than its full JSON output; MCP's
existing compact result is 98.8% smaller than `full:true`. Both retained the
observed warnings and passing-check count. Do not implement another compressor
for this tool or assume `--json` means concise. Use full data for programmatic
analysis and targeted diagnosis.

The three doctor warnings were browser-cache writability, missing tmux, and no
supplied host catalog. These are environment/capability limits, not game bugs.
The doctor explicitly says live services are unverified. No configuration or
browser installation was changed to silence them.

## Initial implementation measured by these probes

- `tools/ci/session-status.mjs --summary`: optional routine Markdown with branch,
  dirty/push/live-run state; commit/session counts; all log outcome counts;
  up to three failed/unresolved log examples; omission counts; and a command
  for retrieving full data. Failures take priority over unresolved examples.
  Verdict excerpts over 240 characters are explicitly marked truncated.
- The default full Markdown remains unchanged. `--json` still returns complete
  data and takes precedence over `--summary`. `--pr <n>` still appends the
  existing live PR/CI snapshot. Local log counts explicitly describe historical
  files, not verification of the current commit; unknown push/CI/readiness
  states remain unknown.
- `code-nav` examples now use supported concise/bounded reference calls and
  bounded callers/outlines. The skill explicitly requires following pagination
  when complete impact analysis is needed and warns that capped definition
  bodies are incomplete. Full definitions remain available.
- `check-changes` now distinguishes structured data from small output, uses
  existing compact doctor output, routes routine status to `--summary`, and
  requires exit codes, full logs and actionable failure evidence to survive
  reporting. Required verification groups and gates are unchanged.
- [The verification reader](../VERIFICATION.md) documents the optional mode and
  its limits. No skill trigger/description, host policy or timer was changed.

The new status output was 38.1% smaller in stdout bytes in the recorded local
comparison. A separate synthetic fixture of 100 commits, 30 sessions and 100
logs measured 3,996 → 864 characters; that is a formatter-scale example, not a
prediction of typical savings. Focused tests cover large inventories, failures,
timeouts, unresolved exits, unknown state, retrieval and JSON/default compatibility.

## Shared output controls added after these probes

The expanded request adds a common CLI runner and a presentation gateway for
the five configured MCP servers. Their contract and selectable compact,
diagnostic and full modes are documented in
[Agent output levels](../agent-output/README.md). Native commands and upstream
server implementations retain their behavior; host launch configuration now
routes MCP calls through the gateway. The measurements above describe the
earlier native interfaces, not a measured saving from this new gateway.
Small results can grow when wrapped in an evidence envelope. Prefer existing
native summaries and scoped queries before applying presentation limits.

The terminal runner passes literal argv without a shell. Hook inspection now
unwraps the canonical runner so existing command policies still see its action;
it uses Python's [shlex.join](https://docs.python.org/3/library/shlex.html#shlex.join)
when exposing the leaf to legacy text policies, preserving quoted operator
arguments. Recognition is scoped to the hook checkout's canonical runner;
cross-checkout hook execution remains a limitation. No new action authority is
conferred by choosing an output level.

A real stdio gateway smoke call to `apex_doctor` with upstream `full:true`
retained 125,756 bytes of original result and returned a 2,620-byte compact
result, including warning and check-count evidence. `output_read` restored the
saved original identically without rerunning doctor. These are local serialized
bytes, not model tokens. Synthetic protocol tests cover the other server routes;
third-party browser servers were not launched for end-to-end validation.

## Remaining improvements and ownership

1. **Task-specific root reading:** remains useful, but the root harness and docs
   index overlap active PRs; root/index restructuring remains outside this
   implementation. Coordinate a later root/index edit.
2. **Named background-job summaries:** repeated tails remain a candidate. The
   `apex-tools-mcp` / `apex-extras` implementation is actively owned elsewhere;
   no overlapping response-contract changes were made here.
3. **Session-status upstream resolution:** in this shallow clone, branch remote/
   merge config exists after a successful push, but `remote.origin.fetch` maps
   only the deploy branch. `@{u}` cannot resolve the missing tracking ref. The
   optional summary reports unknown instead of directing a repeat push; a full
   upstream-resolution repair needs separate Git-fixture coverage.
4. **Session-status log classification:** ordinary Node test summaries can be
   successful yet appear as unrecognized/no-verdict logs because `parseVerdict`
   recognizes the project's authoritative runner lines. The new summary keeps
   those unresolved. Expanding the parser needs terminal-summary and
   interrupted-run fixtures; do not infer green from an earlier passing line.
5. **Session lifecycle:** this probe does not access raw cross-session histories
   or prove whether context/cost stops are followed. Combine the requested
   Cursor/Claude transcript reports with these output measurements before
   changing monitoring frequency, model choices or fleet policy.

## Research and related evidence

Validation environment: an unchanged track-survey fixture failed with `EXDEV`
because it hard-links workspace files into `os.tmpdir()` and `/tmp` is a
different filesystem in this container. An initial in-checkout `TMPDIR` passed
all 29 tests in that file, but invalidated other tests' assumption that temporary
fixtures are outside the allowed output roots. The integration and pre-push
commands instead use `/workspace/artifacts/f1-test-tmp`, on the workspace
filesystem and outside the checkout, without changing either test's assertions.
An earlier skill-hash guard also caught the edited `check-changes` body; only
that hash was refreshed in the steward card, and its 7 tests passed.

This implements the producer-side filtering and progressive reading approach in
[the earlier review](TOKEN-EFFICIENCY-2026-10-18.md). Primary sources:
[Claude Code costs](https://code.claude.com/docs/en/costs),
[OpenAI skill disclosure](https://developers.openai.com/codex/skills), and
[Anthropic code execution with MCP](https://www.anthropic.com/engineering/code-execution-with-mcp).
The bounded `code-nav` examples also received a source/schema review with no
actionable gaps. Validation results and commands are recorded in the PR body;
the existing docs, tooling and pre-push gates remain authoritative.
