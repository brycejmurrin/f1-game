# Agent roles: what the subagents actually call (2026-11-25)

Kind: measurement · Re-measure-by: 2026-12-09 (two weeks of LSP-first cards; rerun the recipe below on that week's hunter and gardener sessions and compare the lsp share with 1.3%).

Ask (Bryce, 2026-11-25 ~02:31Z): "Let's verify their subagents are using it, otherwise we should design specific
subagent types for each role to launch." What prompted it: the first Gardener survey (session_017YzwxyzdifNVPPbSVMvGg8)
was told to use apex-lsp heavily and made almost no apex-lsp calls.

## Method (repeatable)

`list_events {session_id, kinds:["assistant"], limit:100}` pages, oldest-first via `before_id`; each page the harness
saved is digested by `node tools/ci/session-transcript.mjs <pages…> --tally agents` (added in this PR). A call made
inside a subagent carries `parent_tool_use_id` and `subagent_type`. Methods: **lsp** = an `mcp__apex-lsp__*` call or
`node tools/mcp/lsp-mcp.mjs`. **grep** = Grep, or a Bash pipeline whose stage STARTS with grep/rg/git grep (a
`| grep` filter does not count). **read** = Read or a cat/sed -n/head/tail stage. **browser** = the playwright,
chrome-devtools and js-debugger MCP servers. `SubagentHandback` is not counted as a call. Sample: 19 saved pages from 5
sessions tagged `apex-orchestrator-2026-11-24`. Three small pages that came back inline (the first 100 events of the
Gardener, Fix-row-4 and Runtime-F sessions) are not in the counts. Those pages held mostly main-thread launches and
about 20 subagent calls, none of them lsp.

## Per session

| Session | Thread | Calls | lsp | grep | read | browser |
|---|---|---|---|---|---|---|
| Gardener survey 1 (`…yzdifNVPPbSVMvGg8`) | code-hunter ×6 | 163 | 4 (2%) | 98 (60%) | 37 | 0 |
| | finding-verifier | 34 | 0 | 25 (74%) | 8 | 0 |
| | prior-art-scout | 17 | 0 | 9 | 4 | 0 |
| Code hunter G (`…xxUyVLgTiGGZYF7bJ4`) | code-hunter | 72 | 0 | 32 (44%) | 32 | 0 |
| | finding-verifier | 56 | 0 | 23 (41%) | 30 | 0 |
| Fix merged-review row 4 (`…xzGjb1XvjhZPARbxSn`) | pr-reviewer | 10 | 1 (10%) | 4 | 3 | 0 |
| | ci-red-triage | 3 | 0 | 0 | 0 | 0 |
| Runtime hunter F (`…xxEqSKutPQzSkRTMCQ`) | main | 56 | 0 | 15 | 9 | 18 |
| | prior-art-scout | 5 | 0 | 0 | 3 | 0 |
| Merged-today reviewer (`…xxE5JHPFDEzBEdDTgY`) | finding-verifier | 30 | 0 | 12 (40%) | 18 | 0 |

**Headline:** the subagents made 390 calls. 5 were apex-lsp (1.3%) and 203 were text search (52%). Every
code-hunter brief in the Gardener session named apex-lsp. The project's `lsp-hint.py` (PostToolUse on Grep/Bash)
prints the matching lsp call after a bare-symbol search. Neither changed the split.

## Per card: method vs use

| Card | What the card says | Use | Violations of its own card |
|---|---|---|---|
| code-hunter | step 2: named JS symbols through `code-nav` / apex-lsp | lsp 2%, grep 55% | 128 of its 159 Bash calls were compound (`&&`, `|`, `;`); the card says "one simple command per Bash call". 4 calls used `git -C`, which the card forbids. |
| finding-verifier | step 2: a moved JS symbol through apex-lsp | lsp 0 / 120, grep 50% | it identified symbols by text search throughout, so its "binding-aware" step 3 was never run |
| prior-art-scout | grep the ledgers and git log | grep 41%, read 32% | none: text search is its method. It also used `git -C` in Bash, which is harmless for a scout. |
| pr-reviewer | diff + lsp for callers | lsp 1 / 10 | light, but within the card |
| ci-red-triage | GitHub MCP job logs | 2 MCP calls + 1 Bash | none |
| runtime hunter (a session, not a card) | `__apex` hooks cheapest first (AGENTS.md §Seeing the game) | 18 `browser_run_code_unsafe` calls, 0 `apex_*` or lsp calls | invoked a skill named `runtime-hunt`, which does not exist |
| verify-agent, track-surveyor, surface-reviewer, physics-contract-auditor, deploy-research, Explore, worker | — | not launched in the sample | unmeasured |

No subagent started a browser (AGENTS.md rule 10 held; the hook is the enforcement).

## Why prose alone failed

A subagent picks the tool that is cheapest to reach for. With Grep and Bash on its list, a name search is one call;
an lsp call needs a symbol form and a position. The card's prose, the brief's prose and the advisory hook all lost
to that habit. A first draft of this PR made the method the list, with an lsp-only `js-hunter` that had no Grep and
no Bash. Bryce's call at ~02:33Z, relayed by the orchestrator: "it can use grep but should use the lsp". So Grep
stays, and LSP-first is enforced by evidence in the report instead. Tool-list restriction stays for what must not
happen at all: read-only roles get no Edit or Write, and no card gets a browser.

## What this PR changes

- **LSP-first evidence rule**, one home in `.claude/agents/README.md` §LSP-first. Every card that lists the apex-lsp
  tools (code-hunter, finding-verifier, pr-reviewer, physics-contract-auditor, Explore) now lists them FIRST. Its
  report ends with `tools used: lsp <n> · grep <m> · read <k>`. A row about a named JS symbol cites the lsp call that
  shows it; a grep is the cross-check for text consumers. `skill-progressive.test.mjs` pins the order and the line.
- **New card `session-reader`** (haiku), the orchestrator's helper. Its tools are the four read tools of
  claude-code-remote, plus Bash under `readonly-bash.sh` for the digest scripts. It has no send, create, archive or
  interrupt tool, and the test pins that.
- **Role → subagent matrix** in `.claude/agents/README.md` §Roles. The worker brief (skill `dispatcher`
  `references/orchestrator-brief.md`) gains a `SUBAGENTS:` line that names the row. The Gardener PR #6451 owns that
  file's `## Roles` launch table, so this PR does not add a second table there.
- **`session-transcript.mjs --tally agents`**: the audit above, repeatable in one command. A low lsp share on a JS
  slice is the signal.

## Proposals for Bryce (PROTECTED or out of scope)

1. **subagent-contract rows** (`.claude/hooks/subagent-contract.py`, PROTECTED). Add
   `r"^tools used: lsp \d+ · grep \d+ · read \d+"` to the `need` list of code-hunter, finding-verifier, pr-reviewer
   and physics-contract-auditor. Then a report without the split goes back to the subagent, which turns the evidence
   line from prose into a check. Add a row for the new card: `"session-reader": {"file": "session-reader.md",
   "prefix": "SESSION", "cap": 40, "row": r"^SESSION (none\b|\S+ \| \S+ \| updated \S+ \| .+)", "need": [r"^pages: ",
   r"^not read: "]}`. Until then the hook fails open for it.
2. **`lsp-hint.py`** (PROTECTED). Today it adds one line after a bare-symbol Grep or grep. In the sample that line
   changed nothing: code-hunter's searches were mostly compound Bash (`cd … && grep -rn X js | head`). The hook
   would need to read those compound commands (shellparse already splits them), and inside a subagent (payload
   `agent_id`) it could name the exact `lsp_references` call with the symbol filled in.
3. **Workflows** (`.claude/workflows/code-survey.js`, `total-audit.js`). Their structured-output schemas could carry a
   `toolsUsed {lsp, grep}` field per finding batch, so a run reports its own split.

## Open-PR overlap

PR #6451 (Gardener role, session_017YzwxvZQLG67piGbafaYha) adds `.claude/agents/gardener.md` and the brief's `## Roles`. Both PRs edit the
roster in `tests/unit/skill-progressive.test.mjs` and `.claude/agents/README.md`; whichever merges second syncs.
