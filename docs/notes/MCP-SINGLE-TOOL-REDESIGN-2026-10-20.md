# MCP single-tool redesign: measured, prototyped, not recommended as default (2026-10-20)

Bryce's question (2026-10-20, to OrchB 24): every agent loads every project MCP
tool description; should each server expose ONE parameterized tool plus a
pairing skill? Worker B·W11 measured it, read the current client docs, and
prototyped the design on apex-tools behind an opt-in flag.

**Answer: no, not as the default, on any of the five servers.** Every client
we ship config for (Claude Code, Cursor IDE and CLI, Codex at our tool count)
now defers MCP schemas and puts only tool NAMES in the prompt. The cost a
session pays at start is 1.3k tokens for all 139 tools, not 53k. A one-tool
apex-tools saves about 330 tokens of that. It would break the subagent browser
guard and per-tool subagent grants, and it would push Codex back under its
deferral threshold, so Codex would load 33k tokens of schemas upfront. The
cheaper win is the output-level wrapper's per-tool text (below).

## 1. What each server costs (measured)

`node tools/mcp/mcp-listing-cost.mjs` spawns each `.mcp.json` entry exactly as
configured (through `tools/mcp/output-level-mcp.sh`), runs `initialize` and
every `tools/list` page, and sizes the result. Tokens are chars / 4, an
estimate good enough to rank servers. "Names only" is one
`mcp__<server>__<tool>` line per tool, which is what a deferring client lists.

| server | tools | full schemas chars | ~tokens | names-only chars | ~tokens | without the output-level wrapper |
|---|---:|---:|---:|---:|---:|---:|
| apex-tools | 42 | 84,027 | 21.0k | 1,364 | 341 | 53,919 (41 tools) |
| playwright-official | 25 | 31,096 | 7.8k | 1,096 | 274 | 18,502 (24) |
| chrome-devtools | 41 | 52,093 | 13.0k | 1,616 | 404 | 31,994 (40) |
| js-debugger | 23 | 31,253 | 7.8k | 829 | 207 | — |
| apex-lsp | 8 | 13,505 | 3.4k | 224 | 56 | — |
| **total** | **139** | **211,974** | **53.0k** | **5,129** | **1.3k** | |

Each wrapped server has one tool more than the raw server: the wrapper adds
`output_read`. Server `instructions` (apex-tools 318 chars, js-debugger 336,
apex-lsp 341) load at start in every client. The largest entries are
apex_shot_survey (4.0k chars), apex_hud_shot (3.3k), apex_job_start (3.3k),
chrome-devtools emulate (2.1k) and debugger_node_test (3.7k).

**The output-level wrapper adds 56–68 % to every listing.** It appends a fixed
~230-char "Output: outputLevel=…" sentence to every description, adds an
`outputLevel` property to every input schema, and wraps every output schema.
That costs about 30k chars on apex-tools alone, and it is paid again on every
ToolSearch load of every tool.

## 2. What each client actually loads (docs read 2026-10-20)

| client | at session start | when a tool is needed | source |
|---|---|---|---|
| Claude Code (Opus/Sonnet 4+, first-party API) | tool names + server instructions; "tool search is enabled by default" | `ToolSearch` loads the full schema; deferred descriptions are cut at 16,384 chars, upfront ones at 4,096 | [code.claude.com/docs/en/mcp §Scale with MCP tool search](https://code.claude.com/docs/en/mcp) |
| Claude Code, `ENABLE_TOOL_SEARCH=false`, a non-first-party `ANTHROPIC_BASE_URL`, or a pre-4 model | every schema (the 53k column) | — | same page, §Configure tool search |
| Cursor IDE agent | "a small bit of static context, including names of the tools"; descriptions synced to a folder per server (A/B: −46.9 % tokens on runs that called an MCP tool), since 2026-01-06 | the agent reads the tool's file | [cursor.com/blog/dynamic-context-discovery](https://cursor.com/blog/dynamic-context-discovery) |
| Cursor CLI | was "all MCP tool definitions at session start" with a per-model "Too many MCP tools are enabled" error; staff 2026-09-09: "now loads MCP tool definitions only when needed" | on demand | [forum.cursor.com/t/cli-mcp-tool-limits/165642](https://forum.cursor.com/t/cli-mcp-tool-limits/165642) |
| Codex CLI | defers ALL MCP tools behind `tool_search` once the combined MCP tool count crosses `DIRECT_MCP_TOOL_EXPOSURE_THRESHOLD = 100` (rust-v0.133.0); below it, tools are exposed directly | `tool_search` (BM25; can miss an exactly-named tool) | [openai/codex#24536](https://github.com/openai/codex/issues/24536), [#21503](https://github.com/openai/codex/issues/21503); filtering: [learn.chatgpt.com/docs/extend/mcp](https://learn.chatgpt.com/docs/extend/mcp.md?surface=cli) (`enabled_tools`, `disabled_tools`) |

My own session confirms the Claude Code row: its system context lists all
139 tools as deferred, by name only, plus three servers' instructions. The
Cursor "40 tools total" cap shows up only in 2025 forum threads
([#67976](https://forum.cursor.com/t/tools-limited-to-40-total/67976)).
Cursor's current MCP page
([cursor.com/docs/context/mcp](https://cursor.com/docs/context/mcp)) names no
cap. I found no doc on how subagents receive deferred tools in Claude Code,
so that is not measured here.

**The Codex trap.** We have 139 tools today, so Codex defers them all. Make
apex-tools one tool (42 → 2 with `output_read`) and the total drops to 99, under
the threshold. Codex would then load 131,529 chars (about 33k tokens) of
schemas upfront. The redesign would make Codex worse. Only a cut across all
servers that keeps the total under 100 tools AND small would avoid that.

## 3. A one-tool design's cost, per server

A one-tool server costs less at start and the same or more per use. Deferred
clients load the one tool's schema once (its op enum and the op list in its
description), then need the op's argument schema: from the pairing skill, or
from `op:"help"`, whose result enters the conversation like any tool result.

| server | today, at start (names) | one-tool, at start | today, per tool used (ToolSearch load) | one-tool, per op used |
|---|---:|---:|---:|---:|
| apex-tools | 1,364 chars | 47 | ~2.0k avg, 4.0k max | 2.2k once + help ~1.0k median, 5.8k max (`apex_help`, uncompacted) |
| playwright-official | 1,096 | n/a: third-party | ~1.2k | — |
| chrome-devtools | 1,616 | n/a: third-party | ~1.3k | — |
| js-debugger | 829 | ~40 | ~1.4k | similar |
| apex-lsp | 224 | ~40 | ~1.7k | worse: 8 tools, small, and `lsp_*` names are what agents search for |

A task that uses three apex ops pays about 6k chars today and about 5k with
one tool. Over a session that is noise. The real per-session saving is the
startup name list: about 330 tokens for apex-tools, under 100 each for the
others.

## 4. What one tool costs us

- **The subagent browser guard.** `.claude/hooks/mcp-browser-guard.sh` and the
  PreToolUse matcher in `.claude/settings.json` match browser tools BY NAME
  (`apex-tools__apex_(eval|shot|…)`). A call to `mcp__apex-tools__apex` with
  `op:"shot"` passes both. The guard would have to parse `tool_input.op`. That
  is a `.claude/**` edit, and `isBrowserOp()` in the prototype is the list it
  would need. That list is not the catalog's `kind`: `apex_diagnostics` and
  `apex_job_start` are kind "tree", but the guard refuses them because they can
  boot Chromium. The prototype hard-codes the pair, and a test pins its list to
  the guard's regex. `shellparse.py`'s `APEX_BROWSER` (the `apex-tools-mcp.sh call`
  path) already keys on the name as an argument, so it is unaffected.
- **Per-tool subagent grants.** `.claude/agents/track-surveyor.md` grants five
  named apex tools (`apex_track_audit`, `apex_graph_parity`, …). One tool
  grants every op, browser ops included.
- **Permission rules: nothing lost.** Every project server is allowed by
  wildcard (`mcp__apex-tools__*` and the like in `.claude/settings.json`;
  docs/notes/MCP-ALLOW-RULES-MEASURED-2026-10-15.md). No per-tool allow rule
  exists to lose. Codex's per-tool `tools.<tool>.approval_mode` and
  `enabled_tools` would collapse to all-or-nothing.
- **Client-side schema validation and annotations.** The model sees
  `args: object`, so it guesses argument shapes from the skill or `help`. The
  server still validates every op against its full schema. The prototype test
  proves an unknown argument is refused. `readOnlyHint`, `destructiveHint` and
  `openWorldHint` are per tool. One tool must claim the most permissive
  values, so clients that auto-approve read-only tools (Codex `writes` mode)
  would prompt on everything.
- **Discoverability.** Today ToolSearch and Codex `tool_search` match 41
  descriptive names. With one tool, every query has to land on one
  description. Codex's BM25 already misses exact names (#21503).
- **Tests and docs that pin names.** `tests/unit/apex-tools-mcp.test.mjs` pins
  the name set (412 `apex_` references), `tools/mcp/apex-tools-mcp.json` lists
  41 names, and skills, docs and AGENTS.md carry 599 `apex_*` references.
- **outputSchema.** It is per tool today. One tool can only publish none or a
  union.

## 5. Third-party servers: wrap or gate, never redesign

- **playwright-official** (`@playwright/mcp`): the right lever is to GATE
  it. It is used only in UI and browser work, so per host: Codex
  `enabled_tools`; Claude Code `"alwaysLoad": false` (it is already deferred).
  Wrapping it as one tool is possible inside output-level-mcp.mjs but loses
  everything in §4 for 274 tokens.
- **chrome-devtools**: same, gate it. Its 41 tools include 10 heap-snapshot
  tools that only perf-memory-census work uses. Upstream can hide groups of
  them; check its current `--categories`-style flags before trimming.
- **The cheaper lever for every server:** cut the output-level wrapper's
  per-tool suffix (about 230 chars × 139 tools) down to a pointer, and say it
  once in the wrapper's server instructions, which load once. That saves about
  30k chars for full-load clients and about 700 chars on every deferred tool
  load. It is the most valuable follow-up, but it is outside this worker's
  OWNED paths (`tools/mcp/output-level-mcp.mjs`).

## 6. The prototype (apex-tools only, off by default)

`tools/mcp/apex-one-tool.mjs`. `APEX_MCP_ONE_TOOL=1` or `serve --one-tool`
makes `tools/list` publish one tool, `apex`, with input `{op, args}`. `op` is
an enum of the 41 apex_* names with the prefix removed, derived from `CATALOG`,
so it cannot drift. `tools/call apex` routes to the same `dispatch()`, so
validation, the browser lock and refusals are unchanged. Legacy `apex_*`
names still route. `.mcp.json` is untouched; to try it, add a user-scope
server: `claude mcp add apex-one -- bash tools/mcp/output-level-mcp.sh --server
apex-tools -- bash tools/mcp/apex-tools-mcp.sh serve --one-tool`.

Before and after, measured through the wrapper:

| | tools | full chars | ~tokens | names-only chars |
|---|---:|---:|---:|---:|
| apex-tools today | 42 | 84,027 | 21.0k | 1,364 |
| apex-tools `--one-tool` | 2 | 3,578 | 0.9k | 47 |

```sh
node tools/mcp/mcp-listing-cost.mjs --only=apex-tools,apex-one \
  --entry 'apex-one=bash tools/mcp/output-level-mcp.sh --server apex-tools -- bash tools/mcp/apex-tools-mcp.sh serve --one-tool'
node --test tests/unit/apex-one-tool.test.mjs
```

## 7. Recommendation

| server | do | why |
|---|---|---|
| apex-tools | keep 41 tools; keep the prototype opt-in | saves 330 tokens per session in deferred clients; costs the browser guard, subagent grants, annotations; flips Codex to upfront |
| playwright-official | gate per host; no redesign | third-party; already deferred |
| chrome-devtools | gate per host; no redesign | third-party; heap tools are a candidate to hide |
| js-debugger | don't | 207 tokens of names |
| apex-lsp | don't | 56 tokens of names; `lsp_*` names are the search targets |
| output-level wrapper | **do**: move the per-tool suffix to server instructions | −30k chars full-load, −700 chars per deferred load, on all five servers |
| server instructions | do: name when to search each server (Claude Code docs: instructions "help Claude understand when to search for your tools") | instructions are the only per-server text a deferred client always sees |

Revisit if a client we use stops deferring: Claude Code with
`ENABLE_TOOL_SEARCH=false` or behind a gateway, or a Codex release that
changes the threshold. Then the 53k column is what that client pays, and the
prototype is the starting point. The guard change in §4 must land first.

## 8. Pairing skill draft (not installed: `.claude/**` needs Bryce's grant)

Only useful if the one-tool surface is enabled. Draft for
`.claude/skills/apex-ops/SKILL.md`:

```markdown
---
name: apex-ops
description: Use when calling the one-tool apex MCP (`apex {op, args}`): which op does what, its key args, tree vs browser. The 41-tool apex_* surface needs no skill.
---
# apex ops

Call `apex` with `{op, args}`. `op:"help", args:{tool:"<op>"}` returns one op's full schema; read it before an op not listed here.

Tree ops (no lock):
- status — occupancy: lock, chrome, test-bg, playwright, loadavg. Call before any browser op.
- pick_tests / select_specs — which groups or specs a diff needs. args: {since?, staged?}
- verify_change_fast — the fast gate as a background job; poll with job_status.
- track_audit / graph_parity / frame_report — circuit geometry audits. args: {track}
- catalog / locations — ids: circuits, devices, cams; survey locations for a track.
- who_is_on_it / session_status / ci_status — fleet and CI state.
- doctor / debug_chrome / bump_cache_check / rotate_markings_check / garage_plan / ui_mission_plan / ui_diff / unit_test / car_audit / profile_query / job_status / job_cancel / viewer / help

Browser-capable ops (never inside a subagent; status first):
- shot_survey {track, preset|location|fracs} — survey panel; shot {track, frac} — one still.
- track {op:open|shot|eval|close, track} — persistent track session.
- garage {op:open|team|livery|shot|close} — persistent garage session.
- hud_shot / hud_survey / hud_mock {device} — HUD captures at phone landscape first.
- eval / agent / ui_fit / ui_shot / ui_inspect / profile / diagnostics / job_start
```

The pin `tests/unit/apex-one-tool.test.mjs` keeps the op enum equal to the
catalog. A skill line that names an op the catalog drops goes stale silently.
That is one more reason to keep the self-describing 41-tool surface as the
default.
