# Token efficiency: development context and optional detail

Research snapshot: 2026-10-18, checkout `b5b9b70`. This is a recommendation,
not a new mandatory workflow. No runtime, host configuration, skill triggers,
verification gates or tool response contracts are changed by this note.

## Recommendation

Keep required skills and checks, but load their detail by task and return
bounded evidence by default. Start with host/plugin overhead and the root
reading route; extending tool summaries comes next. Shorter final replies alone
will not fix large tool definitions, instructions and intermediate results.

## Evidence from this project

| Surface | Observed size or behavior | Implication |
|---|---|---|
| `AGENTS.md` | 200 lines, 27,750 bytes | A line cap allows very dense instructions; use a byte/token budget too. |
| `CLAUDE.md` | 259 bytes; imports AGENTS.md | The import avoids maintenance duplication, but still loads the root text. |
| Architecture map / full architecture / testing | 8,120 / 169,153 / 94,615 bytes | The reading order should select sections by task, never dump these files together. |
| Canonical skills | 41 SKILL.md files, 193,644 bytes total; 12,160 description characters | Bodies are available on demand, not evidence they all load at startup. Keep that separation. |
| Subagent personas | 15 Markdown files | Availability does not mean all persona bodies are loaded. Delegate only a bounded task that benefits from isolation. |

Sizes are UTF-8 file bytes, not measured provider tokens or billing savings.
The skill description count is a simple frontmatter-line count, including quote
characters. `AGENTS.md` is roughly 6.9K tokens using bytes/4; tokenizers vary.
The mandatory route in [the docs index](../README.md) already says to skim the
module index and read relevant sections, but still routes every agent through
architecture and testing before the relevant area. Docs/tooling work can skip
game architecture entirely. [Verification](../VERIFICATION.md) already has a
docs-only path; preserve it.

Existing savings to retain (source inspected):

- `tools/mcp/apex-tools-mcp.mjs`: `splitOut` already removes parsed JSON from
  stdout; `slimBody` summarizes doctor, successful unit tests and spec selection.
  These tools already offer `full:true`; do not invent a new compression layer
  for work they do today. Failed unit tests retain their diagnostic stream.
- `tools/mcp/apex-extras.mjs`: job listings are bounded; progress tails cap at
  4,000 characters; parsed job results over 20,000 characters are summarized.
  The constant is called a byte cap, but the implementation uses string length.
  A named job status still returns a tail or result, so repeated polling can
  resend substantial content. Existing `wait` reduces repeat calls.
- `tools/mcp/lsp-mcp.mjs` and the `code-nav` skill already support files-only,
  concise references, limits and offsets. Detailed source rows remain the default.
- `ci-watch --failures-only` and background test logs already avoid routine
  progress chatter. Keep authoritative verdict lines and log paths.
- `tools/shot/agent.mjs help <hook>` reads one hook's help without booting the
  game. Prefer it to loading a full live manifest for a known hook.

## Related work: avoid parallel rewrites

As observed during this audit, [#2873](https://github.com/brycejmurrin/f1-game/pull/2873)
owns harness changes and reports a plugin-loaded first turn of 100.3K tokens,
96.3K attributed to system/tools/MCP. That is a reported measurement from another
session, not reproduced here and not necessarily this host's baseline.
[#2862](https://github.com/brycejmurrin/f1-game/pull/2862) changes plugin policy and
MCP wrappers; [#2884](https://github.com/brycejmurrin/f1-game/pull/2884) changes
skills; [#2870](https://github.com/brycejmurrin/f1-game/pull/2870) and
[#2878](https://github.com/brycejmurrin/f1-game/pull/2878) touch MCP tools/tests.
Land or reconcile those before implementing overlapping recommendations.

## Proposed compact default

This is proposed policy text for a later coordinated edit to AGENTS.md, not an
instruction override for the current checkout:

> Read the applicable agent instructions and the matching skill once, then only
> the reference sections needed for the task. Prefer supported concise, scoped
> and paginated tool modes. Save complete logs in artifacts/; return verdict,
> counts, the first actionable failure with its cause/stack, omitted-count and
> log path. Expand detail when diagnosis needs it or the user requests it.
> Preserve exit codes, pending/red verdicts, truncation markers and required checks.

Use three levels; these are proposed behavior levels, not new universal flags:

| Level | When | Return |
|---|---|---|
| Compact | Routine successful work | Verdict, key counts, changed paths, evidence location; proposed target about 2K characters per routine response. |
| Diagnostic | Failure, uncertainty or investigation | Relevant failure blocks, cause/stack, limits and next retrieval path; proposed target about 8K characters, expand if needed. |
| Full | Explicit request or a diagnosis requiring full data | Original detail, preferably fetched from the saved artifact in targeted sections. |

Targets are starting budgets to evaluate, not hard truncation rules. Any
omission must be explicit and recoverable. Never turn missing evidence into a
pass. Do not add `--quiet`/`--summary` flags to calls unless the tool supports them.

Use existing controls immediately: `lsp_references {symbol, files:true}` for file
counts; `{symbol, format:"concise", limit:20}` for bounded reference locations;
`apex_doctor` / `apex_unit_test` / `apex_select_specs` without `full:true` for their
current summaries; `full:true` only when their details are needed. In a host
with code orchestration, project just the required fields before returning the
result to the model. Printing a whole tool envelope and its text again defeats
that filtering. Collapsing visible UI output is not proof that model input shrank.

## Prioritized implementation

1. **Measure and trim host overhead.** Compare fresh equivalent sessions with
   required plugins only versus the current catalog; inspect Claude `/context`
   and `/usage` where available. Disable unused plugins/servers at the host,
   not by deleting required project tooling. Keep the catalog stable during a
   task where possible; cache reuse and context size are separate concerns.
2. **Make reading task-specific.** Keep universal authority, generated-file,
   browser-serialization and verification rules in AGENTS.md. Move procedural
   inventories and dated rationale to existing references. Propose a 12–16 KB
   root target after routing is verified; do not raise the current caps. Route
   docs/config tasks straight to verification and agent-config; game changes
   additionally load architecture/area sections. Scope live `agentHelp()` to
   dev-API discovery, not every documentation session.
3. **Extend optional output at the producer.** Add a backward-compatible summary
   option to named job status first (state/exit/counts/log, no repeated tail),
   then opt in from skills. Evaluate concise reference defaults after checking
   callers that need source text. Extend `slimBody` per tool rather than blindly
   slicing every JSON result. Keep full logs before omitting anything.
4. **Reduce repeated work.** Read a selected skill once unless it changes;
   load its reference only when the relevant step is reached. Prefer one
   bounded wait/subscription to tight polling. Use subagents when isolation
   helps, but remember each agent consumes its own context and model calls.

Do not implement a blanket Bash-rewriting hook with `grep | head`: it can hide
the command's exit status, discard the actual cause, or interrupt the producer.
Capture the full log and original exit code first. Do not remove MCP text versus
structured-content compatibility fields simply because they look duplicated;
measure what the host actually forwards to the model.

## Validation before adopting defaults

Use the same three tasks before/after: a docs-only correction, a JS symbol lookup
and edit, and a failing test/CI diagnosis. Record tool calls, returned characters,
provider input/output and cache tokens where exposed, model/effort, wall time,
verification coverage and whether the failure is correctly diagnosed. Keep
catalog/model/task fixed when testing output changes; measure catalog changes
separately. A bytes/4 estimate must never be presented as a billing measurement.
Accept smaller responses only when verdicts, diagnostics and full-result
retrieval remain correct. Add focused behavior tests when tool code changes;
this research note needs only the existing docs/config checks.

## Primary research

- [Claude Code costs](https://code.claude.com/docs/en/costs): inspect context and
  usage, load specialist procedures on demand, and account for subagent costs.
- [OpenAI skills](https://developers.openai.com/codex/skills): descriptions route
  skills; the full body loads when selected. Shorten descriptions carefully so
  matching remains reliable.
- [OpenAI AGENTS.md](https://developers.openai.com/codex/guides/agents-md): root
  and nested instructions combine under a default 32 KiB project-doc budget.
- [Anthropic: code execution with MCP](https://www.anthropic.com/engineering/code-execution-with-mcp):
  filter intermediate tool data before returning it to model context.
- [MCP TypeScript SDK compatibility](https://ts.sdk.modelcontextprotocol.io/v2/migration/upgrade-to-v2):
  structured/text result adaptation depends on protocol-era compatibility.
