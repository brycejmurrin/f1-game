# MCP refinement: field tests, research, fixes (2026-10-30)

Bryce asked to "really refine and improve" the project MCP servers: try and test them with subagents and
sessions, research design, best practices and token use, and consider MCP resources and skills over MCP.
PR #4252. Earlier work this note builds on: MCP-SINGLE-TOOL-REDESIGN-2026-10-20 (deferred loading; one-tool
servers rejected), AGENT-TOKEN-USE-2026-10-20, BROWSER-MCP-DEEP-DIVE-2026-10-19.

## Method

| probe | who | what it exercised |
|---|---|---|
| apex-tools field test | subagent, no browser | 39 calls over 21 tree tools; compact vs diagnostic; `output_read`; raw JSON-RPC (both protocol versions); `mcp-listing-cost`, `mcp-smoke` |
| apex-lsp / js-debugger / gateway | subagent, no browser | navigation tasks checked against grep; bad inputs; gateway levels; raw JSON-RPC |
| cold start | a fresh cloud session given 4 plain tasks and no tool hints | which tools a cold agent reaches for, how it finds them, what it wasted |
| browser servers | this session | chrome-devtools `new_page`/`take_snapshot`/`evaluate_script`, playwright-official `navigate`/`find`/`evaluate` |
| research | subagent + spot checks of the primary pages | spec 2025-11-25 and 2026-07-28, Claude Code MCP docs, Anthropic tool-design posts, SEP-2640 |

The subagents were refused every browser-capable call by `mcp-browser-guard.sh` (rule 10), including
tree-only routes. See P3.

## What the model actually reads

Claude Code passes a tool result's `content` to the model, not `_meta`. So the gateway's receipt in
`_meta["apex/agent-output"]` costs wire bytes, not tokens. The subagent counted those bytes as "compact bigger
than full"; the token cost was elsewhere:

- **Forced follow-ups.** Every compacted 2–8 KB lsp result needed an `output_read`. `lsp_references
  Tracks.curvature` compacted 7.2 KB to 2.0 KB, showing 2 of 53 rows, so 9.2 KB in total to get the answer.
  `apex_select_specs` showed 3 of 6 specs, `apex_locations` 3 of 17, and `apex_car_audit` hid its one finding
  under `{"omitted":true}`.
- **Blind cuts.** Row text was cut mid-row at 650 chars, losing the server's own `… N more (offset:…)`
  footer. chrome-devtools `evaluate_script` wraps JSON in prose and a fence, which the summarizer could not
  parse, so `__apex.agentHelp()` came back as a 650-char head/tail of a JSON string.
- **Escaping.** `output_read format=page` JSON-escaped the page inside a JSON string: 15.3 KB to read 7.2 KB.
- **Stub descriptions.** apex-tools cut every description over 240 chars to 60 chars plus an `apex_help`
  pointer. The field test needed 3 `apex_help` round trips. Enums of more than 6 values collapsed to
  "apex_catalog / apex_help", and apex_catalog never held op or command values.

## Fixed in this PR

| finding (source) | fix | measured after |
|---|---|---|
| mid-size answers summarized, then re-read (both field tests) | `presentMcpResult`: text blocks ≤ `NATIVE_MAX` 8192 chars go out native, measured on the model-visible text, not the `structuredContent` wire mirror | select_specs 5.2 KB and locations 4.9 KB, whole; no `output_read` |
| row text cut mid-row (lsp test) | `excerpt` cuts row-shaped text on whole lines; the tail keeps the paging footer | unit test |
| fenced JSON unparsed (live chrome-devtools) | `parseEmbeddedJson`: one ```` ```json ```` fence after a prose lead-in; collection pointers cross it too | agentHelp summarized structurally, pageable by pointer |
| argv cut mid-array; depth cap hid findings (apex-tools test) | scalar arrays ≤ 24 items / 600 chars stay whole; compact depth 4 → 6 (the MCP envelope spends two) | unit tests |
| `output_read` page ~2.1× (lsp test) | page text sent raw after a one-line JSON header | unit test |
| 85 artifacts / 448 KB after one test (lsp test) | first save in a process reaps files older than 2 days | unit test |
| 60-char descriptions (apex-tools test) | `DESC_KEEP` 400; an enum collapses by size (> 240 chars, the circuit/device ids), not count | listing 45.5k → 52.5k chars, paid per loaded tool |
| cold agent missed tree tools, read groups as specs (cold start) | apex-tools `instructions` = the question → tool map (1.4 KB of Claude Code's 4,096); the same text as resource `apex://start-here`; a test keeps every routed name real | — |
| one 310 KB `DEBUG-HOOKS.md` resource read (apex-tools test) | `apex://debug-hooks` index + template `apex://debug-hooks/{section}`; every section < 50,000 chars (pinned) | 23 sections, largest 46 KB |
| `pick_tests` `specs: []`; `select_specs` cannot take files (cold start) | `select-specs --files`; `floor` names rule 3's ONE spec only when the diff evidences one (edited, failed, imports or pinned: rank ≤ 2), else `floorReason`; `pick-tests --json` adds `specsNote` | hud.js → no floor ("routed by group"); career-ui.js → career-season.spec.js |
| browser servers never say what to serve (cold start) | prefaces name `http://127.0.0.1:3456/` and `npx serve -l 3456 .` | 276 / 231 chars |
| "Monza" refused with an unrelated fix line; catalog filter ignored; unknown-tool hint named a nonexistent tool (apex-tools test) | circuit ids lowercased before validation; filter narrows the general catalog; hints point at `apex_help`, which now lists every tool when called bare | unit tests |
| "Ran Playwright code" echo on every browser_* result (live) | `--codegen none` (pinned 0.0.79 README; `APEX_PW_CODEGEN` overrides) | — |
| `lsp_callers` dropped same-file callers (lsp test) | merge the export re-anchor's refs with the declaration's | wrapS: 9 uses / 4 files → 38 / 5 (matches grep) |
| hover past a line's end answered for another name (lsp test) | bounds errors name the line count or the line length | — |
| `Head.member` refs missed the `[def]`; the "query at" header read as a row (lsp test, cold start) | `followExports` follows up to 4 hops; header says "resolved from a use at …; declared at …" | Tracks.curvature 53 rows → 55 with spline.js:147 [def] |

## Dropped, with why

- **js-debugger annotations** (`debugger_instances`/`debugger_logpoint_read` "should be read-only"). Not so:
  `logpoint_read` can clear hits, and `instances` forces a GC and evaluates an expression. `node_test` is
  destructive under the file's stated rule ("can run arbitrary code").
- **Single envelope instead of text plus `structuredContent`.** The 2025-06-18 spec says a tool returning
  structured content SHOULD also send it as text, and Claude Code shows only one, so the duplicate costs no
  tokens.
- **`alwaysLoad` on hot tools** (`_meta["anthropic/alwaysLoad"]`). The cold agent found apex-lsp from names
  plus instructions in one ToolSearch, so the instructions map is the cheaper lever.
- **MCP prompts.** Claude Code lists them as `/server:prompt`, but skills already are the workflow channel in
  all three clients, and Cursor/Codex prompt support is unverified.
- **Skills over MCP (SEP-2640, Final, `skill://` resources).** All three clients already load
  `.claude/skills` natively (Codex through `.agents/skills`), and no client has been shown to consume `skill://`.
  Serving the skills twice would add a second copy that can drift. Revisit if a client we ship config for
  reads `skill://`.

## Research (pages read 2026-10-30)

- **Spec 2026-07-28** is the current revision
  ([changelog](https://modelcontextprotocol.io/specification/2026-07-28/changelog)). It drops `initialize`
  and sessions (every request carries its version in `_meta`). It adds a required `server/discover`, a
  required `resultType`, `ttlMs`/`cacheScope` on list and read results, and SHOULD-deterministic `tools/list`
  order. Tasks move to the `io.modelcontextprotocol/tasks` extension. Roots, Sampling and Logging are
  deprecated. Resource-not-found becomes -32602. Our servers speak 2025-06-18; an unknown `server/discover`
  gets -32601, so Claude Code falls back to the old handshake.
- **Claude Code** ([MCP docs](https://code.claude.com/docs/en/mcp)):
  - Output: a warning at 10,000 tokens and a 25,000-token cap (`MAX_MCP_OUTPUT_TOKENS`). Text results over
    50,000 chars are saved to a file unless the tool sets `_meta["anthropic/maxResultSizeChars"]` (≤ 500,000).
  - Descriptions and instructions: server instructions and upfront descriptions are cut at 4,096 chars, and a
    description loaded by tool search at 16,384. Tool search matches only within the shorter limit, so search
    words go first.
  - Prompts and resources: prompts appear as `/server:prompt`; resources are referenced as `@server:uri`.
  - MCP tasks (beta, v2.1.304+) need protocol 2026-07-28, and calls over 2 minutes are already moved to a
    background task client-side.
- **Tool design** ([advanced tool use](https://www.anthropic.com/engineering/advanced-tool-use),
  [writing tools for agents](https://www.anthropic.com/engineering/writing-tools-for-agents)): actionable
  errors with the fix, examples for complex parameters (72 → 90 % on their measurement), and descriptions that
  say what the tool returns. A study of 10,831 servers ([arXiv 2602.18914](https://arxiv.org/abs/2602.18914))
  found 73 % of descriptions repeat the tool name; functionality and accuracy edits improved selection most.

## Proposals (not done here)

- **P1 — dual-stack protocol 2026-07-28** for apex-tools, apex-lsp and js-debugger, plus the gateway's
  passthrough: `server/discover`, `resultType`, `ttlMs`/`cacheScope`, and keep answering `initialize`. Its
  payoff is Claude Code MCP tasks in place of `apex_job_start` + `apex_job_status` polling. The client already
  backgrounds long calls, so it is not urgent.
- **P2 — `apex_job_status` failure surfacing.** A failed `verify_change_fast` returned `verdict: fail` with
  an empty tail; the failing file was only in `artifacts/logs/tooling-fast-suite.log`. Name the failing files
  and the log path in `out`.
- **P3 (Bryce's call: a guard) — the subagent browser guard over-blocks tree routes.** It refuses
  `apex_eval {vm:true}`, `apex_diagnostics {op:capabilities}`, tree `apex_job_start` kinds and node-only
  `debugger_node_test`, while `apex_verify_change_fast` (which starts the same job) passes. The guard could read
  `tool_input` the way its `debug_start` branch does.
