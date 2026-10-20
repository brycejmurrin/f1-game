# MCP context cost: measured; one-tool redesign rejected; gateway trimmed (2026-10-20)

Bryce's question (2026-10-20, to OrchB 24): every agent loads every project MCP
tool description, so should each server expose ONE parameterized tool plus a
pairing skill? Worker B·W11 measured the listings, read each client's current
docs, and prototyped one tool on apex-tools. Bryce chose (21:49Z) to keep this
note and the meter, drop the prototype, and fix the gateway overhead (§6).

**Answer: no, on all five servers.** Every client we ship config for
(Claude Code, Cursor IDE and CLI, and Codex at our tool count) defers MCP
schemas. Only tool NAMES go in the prompt, so a session pays about 1.3k tokens
at start for all 139 tools, not 53k. A one-tool apex-tools saves about 330 of
those tokens. It would break the subagent browser guard and per-tool subagent
grants. It would also drop us under Codex's deferral threshold, so Codex would
load 33k tokens of schemas upfront. The lever worth pulling was the
output-level gateway: it added 59 % to the listings. This branch cuts that to
39 % (§6).

## 1. What each server costs (measured on the deploy tip, before §6)

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

**The output-level wrapper added 56–68 % to every listing (§6 cuts it to 37–43 %).** It appends a fixed
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
  is a `.claude/**` edit, and the prototype's `isBrowserOp()` (commit
  `27348d3b`) was the list it would need. That list is not the catalog's `kind`: `apex_diagnostics` and
  `apex_job_start` are kind "tree", but the guard refuses them because they can
  boot Chromium. The prototype hard-coded the pair, and its test pinned the
  list to the guard's regex. `shellparse.py`'s `APEX_BROWSER` (the `apex-tools-mcp.sh call`
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
  proved an unknown argument is refused. `readOnlyHint`, `destructiveHint` and
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
- **The cheaper lever for every server** is the output-level gateway's
  per-tool text, which is first-party and applies to all five servers. §6.

## 6. The gateway trim (shipped on this branch)

`tools/mcp/output-level-mcp.mjs` decorates every tool. Before this change,
every tool's `outputLevel` property carried a 190-char description that
repeated the description hint. The property is now bare
(`{type, enum, default}`), the hint is shorter, and `output_read` keeps the
full prose once per server. Behaviour, names, the enum, `default: "compact"`,
the collision rename and the anyOf output envelope are unchanged.
`tests/unit/output-level-mcp.test.mjs` passes unedited.
`tests/unit/mcp-listing-cost.test.mjs` bounds the per-tool addition.

| server | raw (no gateway) | before: wrapped | gateway share | after: wrapped | gateway share |
|---|---:|---:|---:|---:|---:|
| apex-tools | 53,919 | 84,027 | +56 % | 75,249 | +40 % |
| playwright-official | 18,502 | 31,096 | +68 % | 26,464 | +43 % |
| chrome-devtools | 31,994 | 52,093 | +63 % | 44,373 | +39 % |
| js-debugger | 19,598 | 31,253 | +59 % | 27,007 | +38 % |
| apex-lsp | 8,882 | 13,505 | +52 % | 12,154 | +37 % |
| **total** | **132,895** | **211,974** | **+59 %** | **185,247** | **+39 %** |

That is −26.7k chars (about −6.7k tokens) for a client that loads every
schema, and about −190 chars on each deferred tool load. The remaining
overhead, about 52k chars, has three parts:

- the per-tool hint, about 160 chars × 139;
- `output_read`, about 1.3k per server;
- the output envelope on apex-tools' 41 output schemas.

The hint's wording is pinned per tool by `output-level-mcp.test.mjs` (it must
name `compact`, `diagnostic`, `full`, `final-page`,
`structuredContent.artifact.path` and `_meta["apex/agent-output"].artifact.path`).
Moving it into the server instructions once would save about 22k chars more.
It would also put the text in front of every Claude Code session at start,
where descriptions cost nothing, so that is Bryce's call, not a bug.

```sh
node tools/mcp/mcp-listing-cost.mjs                                               # after, every server
node tools/mcp/mcp-listing-cost.mjs --entry 'raw-apex=bash tools/mcp/apex-tools-mcp.sh serve'   # no gateway
node --test tests/unit/mcp-listing-cost.test.mjs tests/unit/output-level-mcp.test.mjs
```

### Second trim (Bryce, 2026-10-20, typed in the B·W11 session)

Bryce asked for the three cuts the tests pinned:

- **Generic output schema.** apex-tools no longer publishes an
  `outputSchema` for the 24 tools whose shape is the generic CLI envelope
  (`{ok, error, message, fix, out}` with `additionalProperties`). It was 394
  chars each through the gateway. The 17 tools with a measured shape keep
  theirs, and `apex-tools-mcp.test.mjs` pins that list.
- **Gateway hint.** It is no longer appended to every tool. The gateway
  appends it once to `initialize`'s `instructions`, after the upstream text.
  A per-tool line remains only when the level key was renamed to avoid a
  name collision.
- **Default annotation values.** The gateway drops any hint equal to its MCP
  2025-06-18 default (`readOnlyHint` false, `destructiveHint` true,
  `idempotentHint` false, `openWorldHint` true;
  https://modelcontextprotocol.io/specification/2025-06-18/schema
  §ToolAnnotations). This applies to all five servers.

| server | after §6 | after the second trim | raw (no gateway) |
|---|---:|---:|---:|
| apex-tools | 75,249 | 56,946 | 53,919 |
| playwright-official | 26,464 | 20,772 | 18,502 |
| chrome-devtools | 44,373 | 36,490 | 31,994 |
| js-debugger | 27,007 | 21,708 | 19,598 |
| apex-lsp | 12,154 | 10,859 | 8,882 |
| **total** | **185,247** | **146,775** | **132,895** |

Over the day the total went from 211,974 to 146,775 chars (−31 %). The
gateway's share fell from +59 % to +10 %, and apex-tools now lists only 6 %
above its raw server.

The cost of this trim: server `instructions` grew from 995 to 2,521 chars
(the hint appears once per server). Claude Code loads instructions at every
session start, so a deferring session pays about +380 tokens at start. In
exchange, every loaded schema is about 270 chars smaller on average, and a
full-schema client pays 38k chars (about 9.6k tokens) less.

### The one-tool prototype (built, measured, removed)

`apex {op, args}` worked like this. `op` was an enum of the 41 apex_* names
with the prefix removed, derived from `CATALOG`. `args` was validated
server-side by the existing `dispatch()`. `op:"help"` returned one op's full
schema. Behind `serve --one-tool` it cut apex-tools' listing from 84,027 to
3,578 chars, and its names-only cost from 1,364 to 47. It was dropped from the
branch (Bryce, 21:49Z) for the reasons in §2 to §4. It is commit `27348d3b` on
`cursor/mcp-one-tool-w11a` if anyone revisits it. One more finding from
building it: the browser guard's list is NOT the catalog's `kind`.
`apex_diagnostics` and `apex_job_start` are kind "tree", but the guard refuses
them in a subagent because they can boot Chromium.

## 7. Recommendation

| server | do | why |
|---|---|---|
| apex-tools | keep 41 tools | one tool saves about 330 tokens per session in deferred clients; it costs the browser guard, subagent grants and annotations, and it flips Codex to upfront loading |
| playwright-official | gate per host; no redesign | third-party; already deferred |
| chrome-devtools | gate per host; no redesign | third-party; its heap tools are candidates to hide |
| js-debugger | don't | 207 tokens of names |
| apex-lsp | don't | 56 tokens of names; `lsp_*` names are what agents search for |
| output-level gateway | **done** (§6 and the second trim) | −65k chars across all five servers |
| server instructions | name when to search each server (the Claude Code docs say instructions "help Claude understand when to search for your tools") | instructions are the only per-server text a deferred client always sees |

Revisit if a client we use stops deferring: Claude Code with
`ENABLE_TOOL_SEARCH=false` or behind a gateway, or a Codex release that
changes the threshold. That client then pays the full-schema column. Keep the
total tool count above Codex's threshold, or trim schemas first.

## 8. Pairing skill draft (not installed; kept for the record)

It would have been needed only with the one-tool surface. Draft for
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

A skill line that names an op the catalog drops goes stale silently. That is
one more reason to keep the self-describing 41-tool surface.
