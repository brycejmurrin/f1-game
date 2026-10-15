# Deep research: Claude Code fleet configuration vs current docs (2026-10-15)

The /deep-research pass produced this report for the orchestrator. It is docs-only: nothing was edited, dispatched or run in a browser. The agent-config lane implements the changes, and every "docs say" claim cites its URL. Docs were read on 2026-10-15 from code.claude.com, platform.claude.com, agentskills.io, docs.github.com and anthropic.com/engineering. The installed CLI was Claude Code 2.1.300, so every version gate cited below is met. Repo facts were measured read-only at session HEAD.

**Bottom line.** The fleet's design matches what the docs recommend: a blanket `Bash` allow plus blocking hooks, worktree isolation, disjoint ownership, a no-cancel CI policy and `queue: max` lanes. The waste and the silent failures are elsewhere:

- **Always-loaded context is several times larger than the docs' guidance.** AGENTS.md is 26 KB, about 8k tokens, and every subagent loads it too.
- **Three hooks talk to Claude through channels the docs say Claude never sees.** These are post-edit.sh stdout, warn-on-exit-0 stderr, and the `last_assistant_message` check under SubagentHandback.
- **One allow rule is too broad and probably survives into auto mode.** `Bash(git *)` would let `git reset --hard` skip the classifier.
- **Cloud provisioning runs on every session start.** It belongs in the snapshot-cached setup script.
- **One CI trigger can cancel a live run.** The `labeled` trigger can cancel a ready PR's full tier.

The most valuable changes:

| Change | Effect |
|---|---|
| `omitClaudeMd` on reporter subagents | Saves about 8k tokens per spawn |
| JSON `additionalContext` in post-edit.sh | The hook's warnings reach Claude for the first time |
| Report contract moved to a `SubagentHandback` PreToolUse check | The contract is enforced again |
| Narrow the git allow | `git reset --hard` and similar go back to classifier review |
| Move procedure out of AGENTS.md into skills | Saves about 5k tokens per session |

## 1. CLAUDE.md / AGENTS.md: a 200-line file that costs about 8k tokens

### Docs say
- **What belongs in CLAUDE.md.** Only facts Claude needs in every session: build commands, conventions, layout and "always do X" rules. "If an entry is a multi-step procedure or only matters for one part of the codebase, move it to a skill or a path-scoped rule" ([memory](https://code.claude.com/docs/en/memory)).
- **Size.** Target **under 200 lines per file**. "Longer files consume more context and reduce adherence." Imports "don't reduce its context cost, because imported files also load at launch" ([memory](https://code.claude.com/docs/en/memory)).
- **Example sizes.** The docs' illustrative project CLAUDE.md is **about 1,800 tokens** ([context-window](https://code.claude.com/docs/en/context-window)).
- **Pruning.** For each line, ask "Would removing this cause Claude to make mistakes? If not, cut it." Exclude information that changes frequently and long explanations. "If Claude keeps doing something you don't want despite having a rule against it, the file is probably too long", and the fix is to prune or convert the rule to a hook ([best-practices](https://code.claude.com/docs/en/best-practices)).
- **Emphasis.** Emphasize one line at most: "If you emphasize many lines, none of them stands out" ([best-practices](https://code.claude.com/docs/en/best-practices)).
- **Context engineering.** Anthropic recommends "the minimal set of information that fully outlines your expected behavior" and warns about context rot ([effective context engineering](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents)).
- **How AGENTS.md is read.** Claude Code reads AGENTS.md natively from v2.1.277, but only when no CLAUDE.md exists. A `CLAUDE.md` that contains `@AGENTS.md` is the documented bridge and "never makes Claude read AGENTS.md twice". A subdirectory's AGENTS.md is read only when that directory has no CLAUDE.md ([memory](https://code.claude.com/docs/en/memory)).
- **HTML comments.** Block-level HTML comments are stripped before the file is injected ([memory](https://code.claude.com/docs/en/memory)).
- **Rules files.** Path-scoped `.claude/rules/` files load on a matching Read, Write or Edit, and not at launch ([memory](https://code.claude.com/docs/en/memory)).
- **Subagents.** A non-fork subagent receives "every level of the CLAUDE.md hierarchy the main conversation loads". `omitClaudeMd: true` (v2.1.271+) skips it. "The main conversation still has your full CLAUDE.md when it reads these subagents' results, so most rules don't need to reach the subagent itself" ([sub-agents](https://code.claude.com/docs/en/sub-agents)).
- **Compaction.** The project-root CLAUDE.md and auto memory are re-injected from disk after compaction. Path-scoped rules and nested CLAUDE.md files reload on demand. Invoked skill bodies come back capped at **5,000 tokens each and 25,000 in total** ([context-window](https://code.claude.com/docs/en/context-window)).
- **Audit tools.** `/doctor prompt-audit` (v2.1.283+) audits CLAUDE.md, AGENTS.md, rules, skills and agents for stale or conflicting content ([memory](https://code.claude.com/docs/en/memory)).
- **Auto memory.** It loads the first **200 lines or 25 KB of MEMORY.md**, and it is machine-local and "not shared across... cloud environments" ([memory](https://code.claude.com/docs/en/memory)).

### This repo does
`CLAUDE.md` is a 7-line stub containing `@AGENTS.md`, which is the documented pattern. `AGENTS.md` meets the 200-line target on paper only:

- **Size.** It is exactly **200 lines but 26,103 bytes and 3,726 words**, an estimated 7.5k–8.5k tokens. That is about 4–5× the docs' example. 38 lines are longer than 200 characters.
- **The size gate.** `tests/unit/agent-config.test.mjs` enforces "≤ 200 lines". A dense author can satisfy that by packing more text into each line.
- **Where the bytes go.**
  - §Verification is about 9.1 KB, roughly 35% of the file. Its 12-rule session-shape block is multi-step procedure that the docs place in skills; `check-changes`, `steward`, `agent-fleet` and `ci-watch` already exist.
  - §Git branch & deploy is about 6 KB.
  - §Agent extensions is about 3 KB of routing text that partly repeats skill descriptions already injected at startup.
- **Content the docs say to keep out.**
  - 7 ISO dates and run statistics, such as "306 of 401 PR runs".
  - About 0.7 KB of Cursor/Codex-only instructions.
  - At least 10 ALL-CAPS emphasis runs, such as "THE GATE IS A LADDER" and "HAND OFF THROUGH GIT". The test caps IMPORTANT and bold, but it does not count these.
- **Restated hooks.** Much of the prose repeats rules that hooks already enforce: `protect-files.sh`, `bash-guard.sh`, `github-mcp-guard.sh`.
- **Subagent cost.** None of the 13 agent definitions in `.claude/agents/` (14 files including the README) sets `omitClaudeMd`. Every custom subagent therefore starts with the whole of AGENTS.md.
- **What is already correct.**
  - The nested `js/track/CLAUDE.md` and `js/circuits/CLAUDE.md` are real files, and their AGENTS.md symlinks serve other tools. There is no double load.
  - `.claude/rules/render-tlx.md` and `.claude/rules/render-wgx.md` are correctly path-scoped.
  - MEMORY.md (28 lines, 4.2 KB) is well inside the limits.
  - `.claude/hooks/memory-sync.sh` is a sensible workaround for auto memory not crossing cloud containers.

## 2. Permissions and modes: one broad git rule escapes the auto classifier

### Docs say
**How rules evaluate.** Rules are evaluated **deny → ask → allow, and "rule specificity doesn't change the order"**. A deny at any scope beats an allow at any other ([permissions](https://code.claude.com/docs/en/permissions#manage-permissions)).

**Bash wildcards.**
- `:*` is "an equivalent way to write a trailing wildcard" and is "only recognized at the end of a pattern". The space before a trailing `*` is part of the rule ([permissions#wildcard-patterns](https://code.claude.com/docs/en/permissions#wildcard-patterns)).
- Built-in read-only commands such as `ls cat grep find wc head tail diff` and read-only git never prompt, in any mode ([permissions#read-only-commands](https://code.claude.com/docs/en/permissions#read-only-commands)).
- Bash rules are not a security boundary: a `git push *` deny misses `git -C . push` ([permissions#bash-rule-limits](https://code.claude.com/docs/en/permissions#bash-rule-limits)).

**Modes.**
- There are six: `default`, `acceptEdits`, `plan`, `auto`, `dontAsk` and `bypassPermissions` ([permission-modes](https://code.claude.com/docs/en/permission-modes)).
- In auto mode, allow, ask and deny rules **resolve before the classifier**.
- On entering auto mode, broad code-execution allows are dropped: blanket `Bash(*)`, wildcarded interpreters, package-manager run commands, `Agent` and `Monitor`. Narrow rules stay ([permission-modes](https://code.claude.com/docs/en/permission-modes)).
- The classifier blocks `git reset --hard`, `git clean -fd`, `git checkout -- .` and `git stash drop|clear` by default.
- 3 consecutive or 20 total classifier blocks pause auto mode.
- `defaultMode: "auto"` and `autoMode` are ignored in project settings ([auto-mode-config](https://code.claude.com/docs/en/auto-mode-config)).
- Content-scoped `ask` rules "always force a permission prompt, even in auto mode" ([auto-mode-config](https://code.claude.com/docs/en/auto-mode-config)).

**Protected paths.** These include `.claude`, `.git` and `.mcp.json`. Allow rules never pre-approve writes there ([permission-modes#protected-paths](https://code.claude.com/docs/en/permission-modes)).

**Cloud sessions.**
- Only Accept edits (= `default`), Plan and Auto are offered. File edits are pre-approved, and `bypassPermissions`/`dontAsk` are ignored silently ([permission-modes](https://code.claude.com/docs/en/permission-modes)).
- A **multi-repository** cloud session "reads only the `enabledPlugins` and `extraKnownMarketplaces` keys… not permission rules, hooks, `env`" ([settings#settings-in-cloud-sessions](https://code.claude.com/docs/en/settings#settings-in-cloud-sessions)).

**Project MCP servers and connectors.**
- "A cloned repository can't approve its own servers"; "the repository's own approvals don't count" ([mcp](https://code.claude.com/docs/en/mcp#project-server-approvals-and-workspace-trust), [permissions](https://code.claude.com/docs/en/permissions#what-runs-before-you-trust-a-folder)).
- An org-`ask` connector prompts "even in `acceptEdits`, `auto`, and `bypassPermissions`… Allow rules that match the tool don't skip the prompt either" ([mcp](https://code.claude.com/docs/en/mcp#organization-controls-on-connector-tools)).

**Tools.** `Workflow` needs permission; Read, Glob, Grep, Agent, Task*, SendMessage, ToolSearch and similar do not ([tools-reference](https://code.claude.com/docs/en/tools-reference)).

**`/fewer-permission-prompts`.** It is a bundled skill that "scan[s] your transcripts for common read-only Bash and MCP tool calls" and merges an allowlist into the project `.claude/settings.json` ([commands](https://code.claude.com/docs/en/commands)). The prompt text compiled into the 2.1.300 binary (repo measurement) says it:
- scans about 50 recent transcripts across all projects;
- keeps commands seen 3 or more times, capped near 20;
- never allowlists interpreters, `npx` or task-runner wildcards;
- never adds ask or deny rules.

**`create_session` mode inheritance.** No public doc covers it. The tool's schema says a child "Cannot be more permissive than the calling session's mode".

### This repo does
`.claude/settings.json` holds **129 allow rules** (72 `Bash(...)`, 28 `mcp__...`, 29 bare tool names), **16 deny rules and 0 ask rules**, with `defaultMode` unset. Leaving `defaultMode` unset is correct, because project settings cannot set auto mode.

**`Bash(git *)` is the main risk.** It is not in the documented drop list, so it very likely **survives into auto mode and auto-approves `git reset --hard`, `git clean -fdx`, `git stash clear` and `git -c core.fsmonitor=…` without classifier review**. That defeats the classifier's default git blocks. Similar but narrower holes:
- `Bash(git checkout *)`
- `Bash(git stash *)`
- `Bash(git branch *)`
- `Bash(git worktree *)`
- `Bash(awk *)` (awk's `system()` makes it code execution)
- `Bash(npm install *)`

**Some rules probably never match.** `Bash(npm run test:*)`, `Bash(npm run gen:*)`, `Bash(curl http://127.0.0.1:*)` and `Bash(curl http://localhost:*)` read like `npm run test *` and similar. So they miss `npm run test:guards`, `npm run gen:check` and `curl http://127.0.0.1:3456/x`. This is inferred from the doc text and not measured. In default mode the bare `Bash` allow hides the problem.

**About 45 allow lines are inert.**
- 10 duplicate MCP pairs (a bare name plus `__*`).
- 5 UUID-prefixed MCP entries.
- `mcp__tinyfish`, a lowercase duplicate.
- `mcp__plugin_browser-use_browser-use`, which names no live server.
- 4 MDN and BrowserStack lines, overridden by the org `ask` setting.
- 6 lines for the `.mcp.json` servers (apex-tools, chrome-devtools, playwright-official). These were measured as never matching from the project file in `docs/notes/MCP-ALLOW-RULES-MEASURED-2026-10-15.md`, which is consistent with the docs' trust rule.
- 16 tools that need no permission.

**`Workflow` is missing.** The repo ships workflow skills (`code-survey`, `total-audit`), so each run prompts in default mode.

**What is correct.**
- The deny list is sound as a cheap first layer that works in every mode. `bash-guard.sh` stays the real boundary.
- Having no `ask` rules is deliberate. Merge and ready gates are hooks, and `APEX_MERGE_DESK=1` is set in `env`.

**`/fewer-permission-prompts` would collide with this repo's policy.**
- It writes to a protected file.
- It would re-add MCP names that are measured as inert.
- Its own rules reject `Bash(node -e *)` and `Bash(npx serve *)`.

**Fleet launches must be single-repo.** The memory note "auto siblings need an auto parent + `source_url`" matches the schema rule. The multi-repo point is not yet recorded in the repo: a session holding f1-game alongside another clone **runs without the repo's guard hooks as well as without its allow rules**.

## 3. Hooks: a sound fail-closed layer with three silent channels

### Docs say
**Events, matchers and `if`.**
- There are about 30 events ([hooks](https://code.claude.com/docs/en/hooks)).
- A matcher made only of `[A-Za-z0-9_ ,|-]` is an exact name or list; anything else is an unanchored regex.
- The per-handler `if` field takes one permission rule and filters "so the hook process only spawns when the tool call matches". It is best-effort and is not an enforcement boundary ([hooks-guide](https://code.claude.com/docs/en/hooks-guide)).

**Decisions.**
- Precedence across hooks is **deny > defer > ask > allow**. "PreToolUse hook decisions don't bypass permission rules" ([permissions](https://code.claude.com/docs/en/permissions)).
- The documented recipe is to "add `"Bash"` to your allow list and register a PreToolUse hook that rejects those specific commands".
- A hook `ask` forces a human prompt even in auto mode ([hooks](https://code.claude.com/docs/en/hooks)).

**Failure semantics.** Hooks run in parallel.
- **A crashed, timed-out or garbled PreToolUse hook fails open unless `onFailure: "block"` (v2.1.295+) is set.** Non-0/2 exits and invalid JSON are non-blocking errors, and "The action goes ahead".
- **"Claude never sees stderr from a hook that exits 0."**
- Plain stdout reaches the transcript only for `UserPromptSubmit`, `UserPromptExpansion`, `SessionStart` and `PostModelSwitch`. Every other event needs JSON `additionalContext` or `systemMessage`, capped at 10,000 characters ([hooks](https://code.claude.com/docs/en/hooks)).

**SubagentHandback.** "On Claude Code v2.1.271 or later, a subagent that runs with the `SubagentHandback` tool delivers its report through that tool… The `last_assistant_message` field then holds the subagent's closing text… which is not the delivered report." The report reaches PreToolUse and PostToolUse hooks as `tool_input.message`. SubagentHandback exists only in auto mode ([hooks](https://code.claude.com/docs/en/hooks), [tools-reference](https://code.claude.com/docs/en/tools-reference)).

**`agent_type`.** It is present when a hook fires inside a subagent and also when the main session runs with `--agent` ([hooks](https://code.claude.com/docs/en/hooks)).

**Cloud setup vs SessionStart.**
- Use the setup script "to provision the VM itself". It is snapshot-cached when it finishes within about 5 minutes, and is rebuilt after about 7 days or when it changes.
- SessionStart runs "on every session including resumed" and "adds startup latency" ([cloud-environments](https://code.claude.com/docs/en/cloud-environments)).
- The SessionStart matcher takes `startup|resume|clear|compact|fork`, and `CLAUDE_ENV_FILE` exports environment variables to later Bash calls ([hooks](https://code.claude.com/docs/en/hooks)).

**Other knobs.**
- An exec form `"args": []` skips the wrapper shell.
- `statusMessage` sets spinner text.
- Command hooks time out after 600 s by default ([hooks](https://code.claude.com/docs/en/hooks)).

### This repo does
The design is the documented one: a blanket `Bash` allow, blocking PreToolUse guards, **`onFailure: "block"` on every PreToolUse guard**, anchored MCP regexes and JSON `permissionDecision` in `github-mcp-guard.sh`. Overhead measured on an idle box (load 1.24):

- `bash-guard.sh` spawns **about 20 processes and takes about 180 ms per Bash call** (3× python3, 10× grep, 3× sed). It runs in parallel with `protect-files.sh`, which takes about 46 ms.
- An Edit costs `protect-files` (6 processes, about 60 ms), `post-edit.sh` (6 processes, about 74 ms) and `memory-sync.sh save` (not measured).

**Six findings contradict the current docs.**

1. **`post-edit.sh` prints plain stdout on PostToolUse.** Its header says "the model reads it as context", but the docs send that output to the debug log. The node-check, stale-gen and unregistered-test warnings never reach Claude.
2. **Fail-loud paths are silent.** `bash-guard.sh` ("must at least fail LOUDLY"), `protect-files.py` ("Fail open, but LOUDLY") and the queue-depth "not held" line all write to stderr and exit 0, which Claude never sees. A guard that has disabled itself is therefore silent.
3. **`subagent-contract.py` (SubagentStop) checks the wrong string.** It validates `last_assistant_message` for 8 reporter agents. Under SubagentHandback, which is how auto-mode fleets run, that field is the closing text, not the report. The contract is unenforced, or it fires spuriously. The repo never mentions `SubagentHandback`.
4. **Subagent detection is too broad.** `mcp-browser-guard.sh` and bash-guard's fallback treat `agent_id OR agent_type` as "is a subagent". A top-level `--agent` session would therefore be denied the browser.
5. **`session-start.sh` has no matcher.** It re-runs npm, Chromium discovery, git, `memory-sync restore` and `gen-ladder-figures` on every compact, clear and fork, and re-injects the orientation line each time. Provisioning (Chromium, the first `npm install`) runs there rather than in the cached setup script.
6. **Housekeeping.** The Write/Edit `protect-files` handler inherits the 600 s timeout. `MultiEdit` in the matchers is dead text: it is absent from the tools reference. `mcp-browser-guard.sh`'s comment says the docs promise "no fail-open", which is the reverse of what they say; the hook is safe only because `onFailure` is set.

## 4. Skills: lean bodies, but the listing budget is unmeasured

### Docs say
**Frontmatter.**
- In Claude Code every field is optional, and `description` is recommended.
- Extra fields include `when_to_use`, `disable-model-invocation`, `user-invocable`, `allowed-tools`, `model`, `effort`, `context: fork` plus `agent`, `hooks`, `paths` and `arguments`.
- Unknown keys are ignored in Claude Code but are "a hard error" for claude.ai uploads and the Skills API ([skills](https://code.claude.com/docs/en/skills)).

**The listing.**
- "The listing always contains every skill name". Descriptions are dropped, **least-invoked first**, once the listing passes **1% of the context window**.
- Each entry is capped at 1,536 characters.
- Knobs: `skillListingBudgetFraction`, `SLASH_COMMAND_TOOL_CHAR_BUDGET` and `skillListingMaxDescChars`, plus `skillOverrides` (`on`/`name-only`/`user-invocable-only`/`off`).
- `/doctor`, `/context` and `--debug` report listing cost and overflow ([skills](https://code.claude.com/docs/en/skills)).

**Writing descriptions.** The guidance conflicts.
- Anthropic says "Always write in third person" and to say what the skill does and when to use it ([best-practices](https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices)).
- agentskills.io recommends imperative "Use this skill when…" and "pushy" phrasing ([optimizing-descriptions](https://agentskills.io/skill-creation/optimizing-descriptions)).

**Progressive disclosure.**
- Keep the body under 500 lines and references **one level deep**, and put a table of contents on any reference over 100 lines ([best-practices](https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices)).
- Instructions should be under 5,000 tokens ([spec](https://agentskills.io/specification)).
- After compaction a skill keeps its first 5k tokens, so "put the most important instructions near the top" ([skills](https://code.claude.com/docs/en/skills)).

**Evals.**
- `claude plugin eval` (v2.1.269+) has a `tool_used: Skill` grader and a with/without Δ, and targets `name@skills-dir` ([plugin-evals](https://code.claude.com/docs/en/plugin-evals)).
- agentskills.io uses about 20 queries per skill, 3 runs each, a 60/40 train/validation split, and warns against keyword overfitting ([optimizing-descriptions](https://agentskills.io/skill-creation/optimizing-descriptions)).
- `claude plugin validate` (v2.1.233+) catches frontmatter the host cannot parse ([skills](https://code.claude.com/docs/en/skills)).

### This repo does
**32 skills.**
- They use only `name` and `description`; `survey-track` also has `argument-hint`.
- Descriptions run 186–562 characters and total **11,762 characters** against an internal cap of 12,000 in `tests/unit/agent-config.test.mjs`. That cap is not tied to the host budget.
- Bodies run 23–179 lines; `steward` is the longest.
- 90 reference files total 7,739 lines.
- Every description starts "Use when…" and most carry a "Not X → skill" boundary. That matches agentskills.io, not Anthropic's third-person rule, but the routing eval scored 214/216 on 2026-09-30.
- `paths:` was removed after it measurably hurt routing (182 vs 214 of 216). Keep it off.

**Budget risk (inference).** On a 200k-token window, 1% is about 2k tokens, or roughly 7–8k characters. The project descriptions alone overflow that, before about 60 bundled and claude.ai-synced skills (`dataviz`, `claude-api`, `pptx`…) take their share. Rarely used skills such as `audio-debug`, `multiplayer-debug` and `phone-browser` would lose their trigger text first. No session has checked this with `/doctor` or `/context`.

**Other findings.**
- **Nested references.** About 37 of the 90 reference files link to other `.md` files (a crude count). One two-level chain is confirmed and even test-asserted: `mcp-probe` `traps.md` → `traps-*.md`.
- **The routing eval** (`tools/check/skill-routing-eval.py`) uses 8 queries per skill, no train/validation split, and 1 run by default.
- **No invocation control is used.** No skill sets `disable-model-invocation`. `ci-watch` (Merge Desk only) and `phone-browser` are the obvious candidates.
- **A stale note.** `docs/notes/AGENT-SURFACE-SURVEY-2026-10-05.md` still claims `survey-track` uses `context: fork`; it no longer does.

## 5. Subagents and fleets: good briefs, unused config levers

### Docs say
**Frontmatter.**
- Fields: `tools`, `disallowedTools`, `model`, `permissionMode`, `maxTurns`, `autoCompactWindow` (v2.1.296+), `skills` (preload, up to 32), `mcpServers`, `hooks`, `memory`, `background`, `omitClaudeMd`, `effort`, `isolation: worktree` and `experimental.cacheTtl`. Unknown fields are ignored ([sub-agents](https://code.claude.com/docs/en/sub-agents)).
- **"Background subagents keep every MCP tool but only a limited built-in set… Other built-in tools are silently removed."** Fork mode is the interactive default and runs subagents in the background ([sub-agents](https://code.claude.com/docs/en/sub-agents)).
- `memory` "Enables Read, Write, and Edit" ([sub-agents](https://code.claude.com/docs/en/sub-agents)).

**Nesting.**
- Up to three layers deep. **`CLAUDE_CODE_MAX_SUBAGENT_SPAWN_DEPTH`** caps depth, not breadth.
- `Agent(type)` lists in a subagent's definition are ignored; use `permissions.deny` with `Agent(name)` ([sub-agents](https://code.claude.com/docs/en/sub-agents)).

**Worktrees.** `worktree.baseRef: "head"` is for subagents that work on in-progress changes. Isolation blocks edits and git into the main checkout, but not `cp` or a shell redirect ([worktrees](https://code.claude.com/docs/en/worktrees)).

**Agent teams.**
- They are experimental, single-session and local, with one team per session, no nesting, and teammates that cannot spawn `background: true` subagents.
- With teams enabled, named subagents become teammates. The docs suggest starting with 3–5 teammates ([agent-teams](https://code.claude.com/docs/en/agent-teams)).

**Cloud sessions.**
- Each VM has **4 vCPU, 16 GB RAM and 30 GB disk** ([cloud-environments](https://code.claude.com/docs/en/cloud-environments)).
- An idle VM pauses and "can later be reclaimed". Background subagents and shell commands are not restored ([claude-code-on-the-web](https://code.claude.com/docs/en/claude-code-on-the-web)).
- Sessions "share rate limits with all other Claude and Claude Code usage", and no concurrent-session cap is documented ([claude-code-on-the-web](https://code.claude.com/docs/en/claude-code-on-the-web)).

**Cross-session messages.** They "can't approve anything", and in auto mode the classifier "treats an approval claim relayed from another agent as untrusted input" ([cross-session-messaging](https://code.claude.com/docs/en/cross-session-messaging)).

**Routines.**
- A routine's saved prompt arrives "as its assigned task… rather than treating it as untrusted content", but it "can't act as approval or consent".
- Fire `text` arrives wrapped as untrusted data.
- Limits: 30 fires per hour per routine and 100 API fires per hour per account.
- Routines push `claude/` branches unless told otherwise ([routines](https://code.claude.com/docs/en/routines)).

**Auto-fix PRs.** They require the Claude GitHub App. The docs' advice on merge conflicts is "ask Claude to rebase" ([claude-code-on-the-web](https://code.claude.com/docs/en/claude-code-on-the-web)).

**Projects.** A coordinator with threads, a 16k-character instruction cap and 200 threads per day; Pro and Max only ([claude-projects](https://code.claude.com/docs/en/claude-projects)).

**Engineering guidance.**
- Multi-agent runs use about **15× the tokens of chat**.
- Each worker needs "an objective, an output format, guidance on tools and sources, and clear task boundaries".
- An early failure mode was "spawning 50 subagents for simple queries".
- "most coding tasks [have] fewer parallelizable subtasks than research" ([multi-agent research system](https://www.anthropic.com/engineering/multi-agent-research-system)).
- "finding the simplest solution possible" ([building effective agents](https://www.anthropic.com/engineering/building-effective-agents)).

### This repo does
**The fleet machinery is a rigorous version of the documented advice.**
- `references/orchestrator.md` in `.claude/skills/agent-fleet/` defines a launch template: GOAL / OWNED / FORBIDDEN / DONE WHEN / CAPS / USER GRANTS.
- Lane mutexes and the twin guard.
- A cross-container, cross-vendor claims board (`tools/ci/who-is-on-it.mjs`), which no documented feature provides.
- The PR body as the fleet bus.
- Merge authority enforced by hooks.
- `worktree.baseRef: "head"`.
- Measured behaviour matches the docs: relayed grants are refused, idle owners go `session_inactive`, and reclaimed containers lose unpushed work (rule 12).

**Agent definitions.**
- There are 13: haiku ×4, sonnet ×5, opus ×1, inherit ×3. All set `maxTurns`.
- The Cursor keys `readonly` and `is_background` are harmless because unknown fields are ignored.

**Gaps against the docs.**
- **`worker` lists about 60 explicit tools.** They include Monitor, Task*, Artifact*, LSP and EnterWorktree, which background runs strip silently, and account-specific UUID MCP names.
- **`verify-agent` and `bloat-auditor` set `memory: project` but call themselves read-only.** The docs say memory enables Write and Edit. Whether that applies when `tools` is explicit is untested.
- **Prose caps that could be config.** The "≤ 2 nested subagents" cap lives in `references/launch-policy.md` rather than in `CLAUDE_CODE_MAX_SUBAGENT_SPAWN_DEPTH`.
- **Unused fields.** `omitClaudeMd`, `effort`, `skills` preload and `cacheTtl` are not used anywhere.
- **The key whitelist lags.** `AGENT_KEYS` in `tests/unit/agent-surface.test.mjs` lacks the newly documented `autoCompactWindow` and `experimental`.
- **Stalled briefs.** Measured worker stalls on a `create_session` brief received as peer data are exactly the case that Routines' "assigned task" semantics address.

## 6. GitHub Actions cost: minutes are free, slots and job starts are the budget

### Docs say
**Billing and limits.**
- **Standard runners on public repos are free.** Artifact storage is the only Actions cost a public repo can run up ([billing](https://docs.github.com/en/billing/concepts/product-billing/github-actions)).
- **Pro allows 40 concurrent standard jobs and 5 macOS**; Team allows 60. "Support can increase these via a support ticket" ([limits](https://docs.github.com/en/actions/reference/limits)).

**Concurrency groups.**
- By default a newer pending run replaces an older one.
- **`queue: max`** (announced 2026-05-07) holds up to 100 pending runs or jobs per group, roughly FIFO.
- `queue: max` combined with `cancel-in-progress: true` is a validation error ([workflow syntax](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax), [changelog](https://github.blog/changelog/2026-05-07-github-actions-concurrency-groups-now-allow-larger-queues)).
- The canonical PR pattern groups on `head_ref || run_id` and cancels only on `pull_request` ([control concurrency](https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/control-workflow-concurrency)).

**Triggers and required checks.**
- `ready_for_review` and `labeled` must be listed explicitly ([events](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows)).
- A required workflow skipped by a path filter "stay[s] in a 'Pending' state and block[s] merging"; a job skipped by `if:` "reports 'Success'" ([troubleshooting required checks](https://docs.github.com/en/pull-requests/collaborating-with-pull-requests/collaborating-on-repositories-with-code-quality-features/troubleshooting-required-status-checks)).

**Merge queue.** It needs `merge_group` and supports batching ([merge queue](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/configuring-pull-request-merges/managing-a-merge-queue)). It is available to organization-owned repos per the [GA changelog](https://github.blog/changelog/2023-07-12-pull-request-merge-queue-is-now-generally-available/); the direct docs fetch did not show the availability sentence.

**Other limits.**
- Artifacts default to 90-day retention ([remove artifacts](https://docs.github.com/en/actions/how-tos/manage-workflow-runs/remove-workflow-artifacts)).
- `workflow_run` chains are capped at three levels, and `schedule` runs are delayed at the top of the hour.
- Events made with `GITHUB_TOKEN` trigger no runs except `workflow_dispatch` and `repository_dispatch` ([events](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows)).

**Anthropic's levers for `claude-code-action`.** A concise CLAUDE.md, `--max-turns`, workflow timeouts and concurrency controls ([Claude Code GitHub Actions](https://code.claude.com/docs/en/github-actions)).

### This repo does
The repo is public and user-owned on GitHub Pro, so **the budget is 40 slots and the time each job waits for one, not minutes**.

**Matches the docs.**
- `ci.yml` groups per PR and cancels only on `pull_request`.
- Schedule and dispatch runs get `run_id` groups.
- `ship-fast`, `pages-train` and `fleet-board` use no-cancel single-pending debounce.
- Job-level `queue: max` lanes cover smoke and `selected` (12 lanes).
- Every job sets `timeout-minutes`, artifact retention is 5–30 days, npm and Chromium are cached, and schedules avoid :00.
- There is no `paths-ignore` on `pull_request`, which is correct given the Pending-forever rule.
- The train is poked with `workflow_dispatch`, the documented exception for `GITHUB_TOKEN` events.
- **The ban on agent cancels is well-founded.** Superseded PR runs are already auto-cancelled, and pending runs hold no slot. The repo's own CI-CLOG survey found 73% of PR runs cancelled by manual sweeps that were followed by retrigger pushes.

**Gaps.**
- **(a) The `labeled` trigger can cancel a live run.** `ci.yml` lists `labeled` in its PR types with PR `cancel-in-progress`, and no label-name filter. **Any label added to a ready PR cancels its in-flight full tier**, about 37 jobs.
- **(b) A stale claim.** `tools/ci/ready-full-cap.mjs` says concurrency "can only serialize to one run per group", which is false since `queue: max`.
- **(c) 12 required check names freeze the job shape on drafts.** A single aggregator check would free them.
- **(d) Merge queue would remove the 49% of PR runs that are base syncs, but needs an org-owned repo.**
- **(e) `docs-guards.yml` is gone from `.github/workflows/`.** Whether it was also removed from the required contexts is unconfirmed.

## Ranked changes

Owners: **agent-config** means the agent-config lane, as repo edits. **Bryce** means account or repo settings that only the user can change. **Merge Desk CI** means workflow edits that go through the CI lane and Merge Desk.

| # | Change | Expected effect | Owner | Unverified |
|---|---|---|---|---|
| 1 | `post-edit.sh`: emit `{"hookSpecificOutput":{"hookEventName":"PostToolUse","additionalContext":…}}` instead of plain stdout | Syntax, stale-gen and unregistered-test warnings reach Claude for the first time. Today the hook costs latency and does nothing | agent-config | None. The doc is explicit |
| 2 | Move the report-contract check to a PreToolUse hook matched on `SubagentHandback` that reads `tool_input.message` and denies with the reason. Keep SubagentStop for non-auto runs | The 8 reporter contracts are enforced again in auto-mode fleets, with no spurious blocks | agent-config | Whether a deny on SubagentHandback makes the subagent retry. Test with one reporter |
| 3 | `omitClaudeMd: true` (+ `effort: low`) on ci-watcher, deploy-research, prior-art-scout, finding-verifier, verify-agent (ci-red-triage optional) | About 8k fewer input tokens per spawn, compounding across the fleet. Removes main-session rules that do not apply to these agents | agent-config | That the bodies restate every prohibition they need (review each) |
| 4 | Replace `Bash(git *)` with the subcommands actually used: add, commit, fetch, merge, switch, `worktree add/list`, `stash push/list`, `push … cursor/*`. Drop `awk *`. Make `npm install *` exact (`npm install`, `npm ci`) | In auto mode, `git reset --hard`, `clean`, `stash clear` and `-c` go back to classifier review. No prompt change in default mode | agent-config | Whether `git *` is already dropped on auto entry. Check `permission_decision` in list_events before and after |
| 5 | Move the §Verification session-shape rules and most of §Git branch & deploy into `check-changes`, `steward`, `agent-fleet` and `ci-watch`, putting must-hold lines at the top of each SKILL.md. Collapse §Agent extensions. Move dated stats to `docs/notes/` and Cursor/Codex text to `.cursor/rules/apex-shared.mdc`. Reduce restated hook rules to one line each | AGENTS.md shrinks from about 26 KB to about 10–12 KB, saving about 5k tokens per session and per non-omitting subagent. The docs tie this to adherence | agent-config | Adherence gain is qualitative in the docs. Run the routing eval before and after |
| 6 | Change the AGENTS.md gate in `tests/unit/agent-config.test.mjs` from lines to bytes (e.g. ≤ 12 KB) and count ALL-CAPS runs as emphasis | The gate measures what the docs care about, so packing lines no longer evades it | agent-config | The threshold value is a judgement call |
| 7 | Put Chromium and the first `npm ci` into the cloud environment's setup script (under about 5 minutes, snapshot-cached). Give `session-start.sh` the matcher `startup\|resume` and keep only a fast staleness check | Faster cold start for every worker and resume. No re-run on each compaction. Fewer "missing dependency" total-red starts | Bryce (environment settings) + agent-config (hook) | The current setup-script contents. The per-compaction cost was not measured |
| 8 | `ci.yml`: make cancellation label-aware (`github.event.action != 'labeled' \|\| github.event.label.name == 'run-ci'`), or drop `labeled` in favour of a dispatch path | An unrelated PR label no longer discards an in-flight full tier of about 37 jobs | Merge Desk CI | How branch protection reads a skipped-success check next to a running one on the same SHA |
| 9 | Make fail-open paths visible: JSON `systemMessage` + `additionalContext` on exit 0 when bash-guard cannot extract the command, protect-files cannot parse, or queue-depth cannot answer (or exit 1 deliberately, which blocks under `onFailure`) | A self-disabled guard becomes visible to Claude and the user | agent-config | None |
| 10 | Rewrite `worker` to inherit tools, with `disallowedTools` for playwright-official, chrome-devtools and browser-use MCP | No false belief that Monitor, Task or Artifact are available in background runs. The browser ban moves into config. No brittle UUID names | agent-config | How unresolved `tools` entries behave |
| 11 | Test whether `memory: project` grants Write on verify-agent and bloat-auditor. If it does, add a frontmatter PreToolUse hook limiting writes to `.claude/agent-memory/<name>/`, or drop `memory` | "Read-only" agents stay read-only | agent-config | The whole premise. Needs one live spawn |
| 12 | Run `/doctor`, `/context` (Skills row) and `--debug` on the fleet's smallest-context model. Then use `skillOverrides` to set synced skills nobody routes to here (morning, pptx, docx, xlsx, import-memory) to `name-only` or `off`, and `ci-watch` and `phone-browser` to `user-invocable-only` | Stops least-invoked project skills silently losing their trigger text. Fewer mis-routes on "CI"/"merge" | Bryce (synced-skill settings) + agent-config | Whether descriptions are being dropped today. Whether project settings can override claude.ai-synced skills |
| 13 | Delete the about 45 inert allow lines (duplicate MCP pairs, UUIDs, `tinyfish`, browser-use, MDN and BrowserStack, `.mcp.json` trio, no-permission tools). Fix the `:*` rules to `npm run test*`, `npm run gen*` and `curl http://127.0.0.1*`. Add `Workflow` | Zero prompt change except one fewer prompt per workflow run. The list becomes auditable and nobody believes a dead rule works | agent-config | The `:*` mis-parse (inferred from the docs, not measured) |
| 14 | Record in `agent-fleet` (launch policy) that siblings must be single-repo (`source_url`): a multi-repo cloud session loads no repo hooks, permissions or `env`. Do not run `/fewer-permission-prompts` here | Prevents fleet sessions that run without `bash-guard.sh` and `protect-files.sh` | agent-config | Whether `add_repo` mid-session counts as multi-repo |
| 15 | `CLAUDE_CODE_MAX_SUBAGENT_SPAWN_DEPTH=2` in `.claude/settings.json` `env` | The nesting cap becomes config, not prose. It does not cap breadth | agent-config | None material |
| 16 | Ask GitHub Support to raise the Pro 40-job cap. Longer-term, consider an org (Team: 60 jobs plus merge queue) | Direct cut in queue wait: the repo measured a median job wait of 2 s under 20 in flight and 264 s above 60. Merge queue would replace base-sync runs | Bryce | Whether Support grants this on Pro. The org move changes the Pages URL and repo literals |
| 17 | One aggregator (`CI`) as the only required check. Then trim plumbing jobs, confirm `docs-guards` is out of the required contexts, and fix the stale `queue: max` claim in `tools/ci/ready-full-cap.mjs` | Fewer job starts per draft push. Admission control is enforced by GitHub rather than by desk polling | Bryce (branch protection) + Merge Desk CI | The live required-context list (not read) |
| 18 | Hook latency: fold bash-guard into one python3 process (import shellparse; regexes replace the 10 greps). Use `if` to skip `memory-sync save` and `post-edit` spawns by path. Set a 15 s timeout on the Write/Edit `protect-files` handler. Use exec form. Drop `MultiEdit` | About 180 → 50–60 ms per Bash call on an idle box, more under SwiftShader load. No 10-minute freeze when a hook hangs | agent-config | Whether `if` path rules expand `~/`. Latency under load |
| 19 | Key the subagent test in `mcp-browser-guard.sh` and bash-guard's fallback on `agent_id` only; keep `agent_type` for protect-files roles | A top-level `--agent` session (e.g. a standing Merge Desk) is no longer denied the browser | agent-config | Whether any sibling launches with `--agent` |
| 20 | Skills hygiene: link the `mcp-probe` `traps-*.md` files directly from SKILL.md and audit the other onward-linking references. Grow the routing eval to about 20 queries on confused clusters with a 60/40 split and `--runs 3`. Add `claude plugin validate .claude/skills` to guards. Fix the stale `survey-track` `context: fork` note | Fewer partial reference reads, overfit descriptions caught, host-parser frontmatter check | agent-config | The 37-file count is a heuristic |
| 21 | Pilots, each behind a measurement: Routines `/fire` as the worker-launch vehicle (the brief becomes the assigned task); Auto-fix on one PR (restate no-rebase / `sync-pr.mjs`); `skills:` preload + `experimental.cacheTtl: 1h` on merge-desk (after updating `AGENT_KEYS`); wrap the CLAUDE.md preamble in an HTML comment; `/doctor prompt-audit` | Fewer stalled workers, possibly fewer missed reds, fewer Skill turns, small token savings | Bryce (Routines, GitHub App) + agent-config | Whether MCP `create_trigger` uses the Routines backend. Whether Auto-fix receives the `check_run` events that `subscribe_pr_activity` drops. Whether 1 h cache writes pay off |

Keep these as they are, because they already match the docs:
- the blanket-allow-plus-hook design and `onFailure: "block"`;
- the deny list;
- no `ask` rules and no `defaultMode`;
- `paths:` off skills;
- the `@AGENTS.md` stub with nested CLAUDE.md files and AGENTS.md symlinks;
- the no-cancel, no-update-branch and push-hold policy;
- agent teams OFF. They are local, cannot nest and would turn `background: true` agents into teammates. The claims board covers cross-container, cross-vendor work that teams cannot.

## Unverified / gaps

**Measurements not taken.**
- AGENTS.md was not tokenized; about 8k tokens is an estimate from 26 KB.
- No session checked whether the startup "recommended length" warning fires, or whether the skill listing overflows its budget today. `/status`, `/doctor` and `/context` would show both.
- Hook latency was measured idle only. Not measured: latency under a browser group, `memory-sync.sh`, `session-start.sh` per compaction, and the `git commit`/`git push` guard paths.
- `/fewer-permission-prompts` was not run, and its prompt text was read from the binary. Its output on this repo's transcripts is unknown.
- The live branch-protection required-context list was not read.

**Questions the docs leave open.**
- Whether `Bash(git *)`, `Bash(npx serve *)`, `Bash(npm test *)` or `Bash(node tools/check/*)` count as code-execution wildcards that auto mode drops.
- Whether a mid-token `:*` (`test:*`) parses as the docs imply.
- Whether `disable-model-invocation` removes a skill from the listing or only blocks auto-invocation.
- Whether the 1% listing budget counts tokens or characters.
- Whether `memory` adds Write/Edit to an explicit `tools` list.
- How unresolvable `tools` entries are handled.
- Whether a PreToolUse deny on `SubagentHandback` causes a retry.
- Whether `if` sees through `bash -c`/`eval` or expands `~/`.
- How branch protection resolves a skipped-success and a running check of the same name on one SHA.

**Behaviour known only from the repo's own measurements.** These have no public doc:
- the `claude-code-remote` tools (`create_session` mode inheritance, `send_message`, `subscribe_pr_activity` dropping `check_run` events, `create_trigger` vs Routines);
- why project allow rules never match `.mcp.json` server tools (`docs/notes/MCP-ALLOW-RULES-MEASURED-2026-10-15.md`);
- whether cloud sessions use server-side classifier review, which would add value to the read-only Bash allows.

**Settings and limits that need the user.**
- Whether GitHub Support grants Pro concurrency increases.
- Larger-runner pricing for public repos.
- Whether the account plan allows Projects (Pro/Max only).
- What the cloud environment's setup script currently contains.

**Guidance that conflicts or has no counterpart.**
- Anthropic says to write descriptions in the third person; agentskills.io says to use imperative "Use this skill when…". The repo uses the imperative form and measures well with it.
- Anthropic's skills best-practices page says there is no built-in eval runner, which predates `claude plugin eval`.
- No public doc gives a recommended number of parallel cloud sessions per repo, or covers coordinating Cursor and Grok workers with Claude ones. The repo's claims board and PR-body bus have no documented equivalent to compare against.
