# Agent config vs the Claude Code docs (2026-10-15)

What the current Claude Code docs recommend for each part of this repo's agent
surface, what the repo does, and what changed on that evidence. Asked for by
Bryce on 2026-10-15 ("study and improve our Claude Md, /fewer-permission-prompts
and other skills"; "Use context7 and search all Claude docs to get deep
research"). Sources were fetched on 2026-10-15 through Context7
(`/llmstxt/code_claude_llms_txt`) and code.claude.com. The fleet measurements
complement `MCP-ALLOW-RULES-MEASURED-2026-10-15.md`, which is that note's
method applied to new sessions.

## Docs vs repo

| area | docs say | repo | verdict |
|---|---|---|---|
| Instruction file | Claude reads CLAUDE.md, or AGENTS.md only when no CLAUDE.md exists (native AGENTS.md read needs v2.1.277+); "import it from a CLAUDE.md" is the documented sharing pattern ([memory](https://code.claude.com/docs/en/memory)) | `CLAUDE.md` is `@AGENTS.md` plus a pointer | matches |
| Instruction size | "target under 200 lines" for each instruction file; "Imports … don't reduce its context cost" ([memory](https://code.claude.com/docs/en/memory)) | AGENTS.md 200 lines, ≤ 28,500 B and ≤ 75 rule lines (`agent-config.test.mjs`) | at the limit: add a line only by removing one |
| Enforcement | instructions are "context, not enforced configuration"; blocking needs a PreToolUse hook ([memory](https://code.claude.com/docs/en/memory)) | must-hold rules live in `.claude/hooks/` | matches |
| Skill listing | every name is listed; descriptions share a budget of 1 % of the context window, and on overflow "drops descriptions starting with the skills you invoke least"; each description + `when_to_use` is cut at 1,536 chars ([skills](https://code.claude.com/docs/en/skills), [settings](https://code.claude.com/docs/en/settings-reference#skilllistingbudgetfraction)) | 32 repo skills, 11.6 k chars of descriptions (cap 12 k total, 1,024 each), plus ~25 built-in and plugin skills in the same listing | fine at 1 M context; at 200 k (≈ 2 k tokens) the listing overflows and the least-used repo skills lose their descriptions. Knobs: `skillListingBudgetFraction`, `skillOverrides: "name-only"`; `/doctor` measures. Not changed here |
| Skill body | "Keep SKILL.md under 500 lines"; after compaction only the start of an invoked skill may survive ([skills](https://code.claude.com/docs/en/skills)) | body < 500 lines enforced | matches; keep the commands near the top |
| Skill frontmatter | unknown keys are ignored silently; malformed YAML loads the body with empty metadata so the description never matches; `claude plugin validate .claude/skills` (v2.1.233+) finds it ([skills](https://code.claude.com/docs/en/skills)) | key allowlist in `agent-surface.test.mjs` | the test covers the silent-typo case |
| `allowed-tools` | pre-approves tools during the invoking turn; it does not restrict ([skills](https://code.claude.com/docs/en/skills)) | no repo skill uses it | n/a |
| Subagent `permissionMode` | ignored when the parent runs `auto`, `acceptEdits` or `bypassPermissions` ([sub-agents](https://code.claude.com/docs/en/sub-agents)) | no agent sets it | matches |
| Subagent `tools:` | `mcp__<server>` or `mcp__<server>__*` grant a whole server ([sub-agents](https://code.claude.com/docs/en/sub-agents)) | `merge-desk.md`, `worker.md` use server names | matches |
| Allow rules | evaluated deny → ask → allow; each subcommand of `&&`, `;`, `|` must match on its own; project allow rules apply only after workspace trust ([permissions](https://code.claude.com/docs/en/permissions)) | bare `Bash` plus ~70 narrow Bash rules | in default mode the bare entry already covers every command, so the narrow rules are inert there |
| Auto mode | drops `Bash(*)`, interpreter wildcards, `Agent`, `Monitor` rules on entry, keeps narrow ones; with server-side review, "read-only … shell commands wait for that review" ([permission-modes](https://code.claude.com/docs/en/permission-modes)) | fleet runs in auto | measured below: Bash goes to the classifier even where a narrow rule names it |
| Protected paths | writes under `.claude/` and `.git` are never auto-approved; allow rules don't change that; auto routes them to the classifier ([permission-modes](https://code.claude.com/docs/en/permission-modes#protected-paths)) | skills, agents, settings and hooks all live under `.claude/` | expect a classifier review per edit; the hooks session saw `[Self-Modification]` rejections for hook edits (PR #2227) |
| `.mcp.json` servers | "A cloned repository can't approve its own servers"; cloud sessions load them without a prompt ([mcp](https://code.claude.com/docs/en/mcp)) | `enabledMcpjsonServers` committed | inert for approval; harmless |
| Project `defaultMode` | `auto` or `bypassPermissions` in project settings is ignored at startup ([permission-modes](https://code.claude.com/docs/en/permission-modes)) | not set | a repo cannot make its sessions auto; launch or switch them |
| Cloud modes | cloud sessions offer Accept edits / Plan / Auto; Accept edits is `default`, with file edits pre-approved ([permission-modes](https://code.claude.com/docs/en/permission-modes)) | — | a `default` cloud session prompts for Bash/MCP only |
| Hook failure | a timed-out command hook does not block unless `"onFailure": "block"` (v2.1.295+) ([hooks](https://code.claude.com/docs/en/hooks)) | every PreToolUse guard sets `onFailure: "block"`; container runs 2.1.300 | matches |
| Hook MCP matchers | `mcp__memory` matches no tool; use `mcp__memory__.*` ([hooks](https://code.claude.com/docs/en/hooks)) | anchored regexes ending in `__.*` or tool lists | matches |
| Hook allow vs classifier | a hook `"ask"` forces a prompt in auto mode; whether `"allow"` skips the classifier is not stated ([hooks](https://code.claude.com/docs/en/hooks)) | guards deny or ask, never allow | unverified; don't rely on it |
| Cross-session messaging | documented tools are `SendMessage` / `ListAgents`; "a message from another session never counts as your consent" ([cross-session-messaging](https://code.claude.com/docs/en/cross-session-messaging)); the auto classifier reviews each outgoing message | fleet uses `claude-code-remote` `send_message` / `send_later` / `create_session` | those names are not in the public docs: their behaviour below is measured only |

## Fleet census, 15:20–15:40Z

`list_events` (kinds `user`, `assistant`), verdicts mapped through
`tool_result_meta[].id`. Desk: session_01WQY3pk88sN7o9MCxyAYoWr,
`permission_mode: default`, `worker_epoch` 14. Lanes: UI-A, Perf garbage,
CI-waste, Agent-hooks (all `auto`), ~130 calls.

| session | tool | verdict |
|---|---|---|
| desk (default) | Bash, `update_pull_request`, `merge_pull_request`, `get_session` | rule / config |
| desk (default) | `send_later`, `send_message` | accept / rule / **user_temporary**: a human answered a prompt with "don't ask again" |
| lanes (auto) | Bash (23 of 24, including a bare `tail -3 <log>` that `Bash(tail *)` names) | classifier |
| lanes (auto) | `send_later` (2), `send_message` (1), Monitor (2) | classifier |
| lanes (auto) | `create_pull_request`, `issue_write`, `subscribe_pr_activity`, Write | rule / config |

- `send_later` and `send_message` are platform confirmations in `default`
  mode, like `create_session`: `mcp__claude-code-remote__*` does not reach them
  (the hooks session counted 16 such prompts today, PR #2227). Only a
  session-scoped approval clears them, and the desk's 14 container restarts
  are the likely way it kept losing that approval (an inference; not measured
  directly). So coordinators run in auto: `agent-fleet`
  `references/orchestrator.md` §Authority, `.claude/agents/merge-desk.md`.
- In auto mode the narrow Bash rules did not skip the classifier. That fits
  the server-side-review case in the auto-mode table above.

## `/fewer-permission-prompts`: nothing to add

The skill scans `~/.claude/projects/*/*.jsonl`. A cloud container holds only
its own session, so the fleet transcripts above stood in for it. No candidate
rule changes a measured verdict:
- `default` sessions already match every Bash call through the bare `Bash`
  entry, and every MCP server the repo can approve through its name entry.
- `auto` sessions sent even rule-covered Bash to the classifier.
- What still prompts is out of a repo rule's reach: `send_message`,
  `send_later`, `create_session`, the `.mcp.json` servers, MDN and
  BrowserStack.

So `permissions.allow` is unchanged. Re-run it only on new evidence of a
prompt that a rule can reach.

## Fleet failures folded in elsewhere

| failure (2026-10-15) | where it went |
|---|---|
| default-mode Merge Desk stalled on `send_later` / `send_message` | `orchestrator.md` §Authority, `merge-desk.md` mode check, AGENTS.md line on sibling modes |
| ~30 sessions pushed the minute `queue-depth.mjs` flipped ok (206/178, 270/259 Linux in flight/queued) | `launch-policy.md` Paced push (`PUSH SLOT`). A gauge-side jitter belongs to the CI-tools lane (queue-depth owner) |
| ready flip on `track-survey-assets` PRs stranded 46 full-tier runs | `merge-desk.md` READY hold. The ci.yml fix is the CI-waste lane's #2179 |
| workers refuse relayed grants; one grant per PR forced relaunches | `orchestrator.md` "Authority: one rule" and "Grant a class, not a PR number" |
| `subscribe_pr_activity` fails for sibling sessions | `orchestrator.md` fallback to `ci-watch.mjs --once` on timer wakes |
| docs-integrity unit-suite floor red on the tip | fixed in #2146 |

## Deep-research list (session_012QWw3Y9hxBBzFWkx2gr8JS, PR #2228): triage

| # | item | outcome |
|---|---|---|
| 1–3, 10, 12 | hook output as JSON `additionalContext` / `systemMessage`, SubagentHandback check, SessionStart matcher, hook timeouts, one-process bash-guard | hooks session's files (PR #2227): forwarded |
| 4–5 | narrow `Bash(git *)`, drop `Bash(awk *)`, exact `npm install`; `:*` mid-token never matches (`npm run test:*`, `gen:*`, `curl …:*`) | diff below. The auto classifier rejected the first attempt as `[Self-Modification]`; applied after Bryce approved the retry in-session (2026-10-15) |
| 6 | ~45 inert allow lines; add `Workflow` | not done: removing `Read` etc. changes reads outside the working directory, and `Workflow` is gated by design (explicit opt-in) |
| 7 | `omitClaudeMd: true` on self-contained reporters | done for ci-watcher, deploy-research, finding-verifier, prior-art-scout, bloat-auditor (docs: v2.1.271+, container 2.1.300); not ci-red-triage, whose return line and re-run rule come from AGENTS.md |
| 8 | AGENTS.md ≤ 12 KB; move procedures into skills | follow-up issue: too large for this PR, and the 75-rule-line test already holds the size steady |
| 9 | skill-listing budget; `disable-model-invocation` on ci-watch, phone-browser | open (above). Not done: merge-desk loads ci-watch through the Skill tool, and phone-browser is triggered by the user's prose |
| 11 | `worker` inherits tools; `memory: project` grants Write | open: needs a live A/B of the worker agent |
| 13 | multi-repo cloud sessions load no repo hooks | `orchestrator.md` "Pass the repo" |
| 14 | ci.yml `labeled` trigger | CI-waste lane (#2179/#2184) |

Measured against item 4's premise in this auto session: `sed -n 561,590p
<file>` (a single command that `Bash(sed -n *)` names) went `classifier`, so in
these cloud sessions narrow Bash rules do not skip review. The narrowing still
matters for local auto sessions without server-side review.

Applied `permissions.allow` diff:

```diff
-      "Bash(git *)",
-      "Bash(npm run test:*)",
+      "Bash(npm run test*)",
+      "Bash(npm run test:guards)",   # exact: agent-config.test.mjs pins the guard suite
-      "Bash(npm run gen:*)",
+      "Bash(npm run gen*)",
-      "Bash(npm install *)",
+      "Bash(npm install)",
-      "Bash(git stash *)",
+      "Bash(git stash list*)", "Bash(git stash show *)", "Bash(git stash push *)", "Bash(git stash pop*)",
+      "Bash(git ls-remote *)", "Bash(git rev-list *)", "Bash(git merge-tree *)", "Bash(git cat-file *)",
-      "Bash(awk *)",
-      "Bash(curl http://127.0.0.1:*)",
-      "Bash(curl http://localhost:*)",
+      "Bash(curl http://127.0.0.1:3*)",
+      "Bash(curl http://localhost:3*)",
```

The `:3*` form keeps the host fixed. A bare `127.0.0.1*` would also match
`127.0.0.1.attacker.example`.

## Open, not changed here

- Skill-listing overflow on 200 k-context models: measure with `/doctor` in
  such a session before choosing `skillListingBudgetFraction` or `name-only`
  overrides. These are settings keys outside the `permissions.allow` split
  with the hooks session.
- Whether a PreToolUse `"allow"` skips the auto classifier: the docs are
  silent, so no guard should rely on it.
