# Harness settings, measured and sourced — 2026-10-26

Lane R5 of the system-audit implementation (PR #3785). Goes one level deeper than the audit's §13 "harness"
and "github" research sessions: every claim below is a quote from a doc fetched today (Claude Code 2.1.310 is
what this container runs), a measurement taken today, or marked **verify in a pilot**. Raw doc copies and
measurements: `scratch/sysaudit-research/docs/`, `scratch/sysaudit-research/ctx/`. This note proposes; lane S5
owns `.claude/settings.json`, and environment variables are set by Bryce on claude.ai.

## 1. Where a fresh session's context goes (measured)

`claude -p "Reply with the single word ok." --output-format json --model claude-opus-5-5 --settings
'{"disableAllHooks":true}'` from the repo root, one variant per run, summing `input_tokens +
cache_creation_input_tokens + cache_read_input_tokens` of the single response (script:
`scratch/sysaudit-research/bin/ctx-ab.sh`; browser MCP servers never loaded):

| variant | first-turn tokens | delta |
|---|---:|---|
| harness only: `CLAUDE_CODE_DISABLE_CLAUDE_MDS=1`, `--strict-mcp-config`, `--disable-slash-commands` | 42,311 | floor of `claude -p` |
| + skill listing (46 repo skills + claude.ai skills) | 43,973 | **+1,662** |
| + CLAUDE.md → AGENTS.md, unscoped rules, memory index | 56,370 | **+12,397** |
| + `apex-lsp` (deferred) | 56,875 | +505 |
| + `js-debugger` (deferred) | 57,035 | +665 |
| + `browserstack` (deferred) | 57,454 | +1,084 |
| + `apex-tools` (deferred) | 57,497 | +1,127 |
| + `apex-tools` with `ENABLE_TOOL_SEARCH=false` | 100,311 | **+43,941** |

A cloud session's first turn is ~98k ([BASE-CONTEXT-2026-10-26](BASE-CONTEXT-2026-10-26.md)). So: repo
prose is ~12.4k (13 %), the skill listing 1.7k, each `.mcp.json` server 0.5–1.1k while deferred (~5k for all
six), and **~40k is what the cloud host adds** beyond `claude -p` (claude-code-remote tools, Artifact, Claude
Docs, connector instructions) — outside the repo's control. Two consequences: tool search is load-bearing
(never set `ENABLE_TOOL_SEARCH=false`: one server goes from 1.1k to 44k), and trimming MCP descriptions or skill
descriptions saves hundreds of tokens, while the rulebook is the largest repo-controlled block.

How to repeat it for any server: `claude -p … --strict-mcp-config --mcp-config <one-server>.json` vs. without,
same flags; in a live session `/context` lists the categories and `/usage` attributes recent usage per MCP
server ("An MCP server's share counts only the requests that consumed one of its tool results",
https://code.claude.com/docs/en/costs). From transcripts: the first assistant `usage` block of a session, as
BASE-CONTEXT does.

## 2. Settings, one by one

### Auto-compaction: `CLAUDE_CODE_AUTO_COMPACT_WINDOW`, `CLAUDE_AUTOCOMPACT_PCT_OVERRIDE`

- "Set the auto-compact window, how full the context gets before compaction, from `100000` to `1000000`
  tokens." … "the variable takes precedence over the command, the flag, and the `autoCompactWindow` setting."
  https://code.claude.com/docs/en/env-vars, https://code.claude.com/docs/en/model-config#set-the-auto-compact-window
- "Set the percentage (1-100) of the auto-compact window at which auto-compaction triggers … the variable
  can't raise the threshold." https://code.claude.com/docs/en/env-vars
- "A cloud session also sets some variables itself when it starts. For `CLAUDE_AUTOCOMPACT_PCT_OVERRIDE`, the
  value the session sets overrides one you add here, so adding that key here has no effect."
  https://code.claude.com/docs/en/cloud-environments#set-environment-variables
- **Measured in this container:** `CLAUDE_AUTOCOMPACT_PCT_OVERRIDE=80` is set by the host. 80 % of a ~980k
  window = 784k, exactly the "autocompact threshold 784,000" the audit read from get_session. The
  orchestrators' 200k hand-off was a fleet rule, not the harness.
- **Adopt:** on the orchestrator's environment only, `CLAUDE_CODE_AUTO_COMPACT_WINDOW=375000` → compaction at
  80 % = **300k**, matching the audit's "boot + 200k" cap, instead of rotating sessions. Workers keep the
  default. **Verify in a pilot** (one orchestrator, one compaction): what survives is documented — "Project-root
  CLAUDE.md and unscoped rules: Re-injected from disk"; "Invoked skill bodies: Re-injected, capped at 5,000
  tokens per skill and 25,000 tokens total"; "Files Claude read or edited: … re-reads up to five"; "Context that
  hooks added earlier: Summarized" (https://code.claude.com/docs/en/context-window#what-survives-compaction).
  So the live-state file must be one of the five most recent edits or be re-read by a `SessionStart` hook with
  matcher `compact` ("Claude Code runs them and adds their output to the compacted context").
- `autoCompactWindow` (settings key, "Scope: Any file") would apply to every role from a committed file — do not
  commit it; per role use the env var or a subagent's `autoCompactWindow` frontmatter.
- Compaction guidance: "customize compaction behavior in your CLAUDE.md file at the root of your project:
  `# Compact instructions`" (https://code.claude.com/docs/en/costs). Rulebook lane: add a ≤5-line
  `# Compact instructions` block (keep PR number, branch, open Plan item, live-state file path, pending CI sha).

### MCP: `deniedMcpServers`, `disabledMcpjsonServers`, `CLAUDE_CODE_MAX_MCP_DESCRIPTION_LENGTH`, `MAX_MCP_OUTPUT_TOKENS`

- `deniedMcpServers`: "Claude Code refuses to load a matching server wherever it's defined, including plugin
  servers, … and the claude.ai connectors it fetches itself." "Scope: Any file. Entries from every file merge
  into one denylist." Entries are `{ "serverName": … }` ("a claude.ai connector's display name such as
  `"claude.ai Slack"` works"), `serverCommand` or `serverUrl`. https://code.claude.com/docs/en/settings-reference#deniedmcpservers
- `disabledMcpjsonServers`: "A rejection in any settings file applies, including a project
  `.claude/settings.json` checked into the repository." Rejection beats `enabledMcpjsonServers` (which the repo
  sets for all six). https://code.claude.com/docs/en/settings-reference#disabledmcpjsonservers
- Cloud: "Your repo's `.mcp.json` MCP servers — Yes, in a session with one repository"; user/local settings are
  not read (https://code.claude.com/docs/en/cloud-environments#what-carries-over-from-your-setup), so a
  committed file is the only per-repo lever, and it applies to every role.
- `CLAUDE_CODE_MAX_MCP_DESCRIPTION_LENGTH`: "Maximum length in characters of MCP tool descriptions and MCP
  server instructions … replaces both default limits: 4096, and 16384 for … a tool that Claude loads through tool
  search." **Measured:** the host already sets `4096`.
- `MAX_MCP_OUTPUT_TOKENS`: "(default: 25000) … warning when output exceeds 10,000 tokens … A successful text
  result longer than 50,000 characters … is saved to a file."
- **Adopt:** nothing global for `.mcp.json` (deferred cost ~5k for all six; the browser servers are needed by UI
  lanes). Deny only connectors no lane uses — candidate `Three_js_3D_Viewer` — **verify in a pilot** that a
  cloud session honours `deniedMcpServers` for host-provided connectors and the exact `serverName`
  (`/mcp` shows it). Do NOT lower `CLAUDE_CODE_MAX_MCP_DESCRIPTION_LENGTH` to 1024 (the §13 suggestion): it
  truncates server instructions that carry operating rules (Claude Docs' is ~2.4k chars) to save a few hundred
  tokens.

### Skills: `skillOverrides`, `skillListingMaxDescChars`, `skillListingBudgetFraction`

- `skillOverrides`: "`"name-only"`: Claude sees the skill by name without its description …
  `"user-invocable-only"` … `"off"`." "Scope: Any file." https://code.claude.com/docs/en/settings-reference#skilloverrides
- `skillListingMaxDescChars`: "Default: `1536`." `skillListingBudgetFraction`: "Default: `0.01`, which reserves
  1% of the context window … drops the descriptions of the least-used skills".
- `syncClaudeAiSkills` `false` is ignored from `.claude/settings.json` ("a `false` in `.claude/settings.json` is
  ignored", https://code.claude.com/docs/en/settings#exceptions-to-managed-settings-precedence): the
  `anthropic-skills:*` listing can only be trimmed on claude.ai.
- **Measured:** the whole listing costs 1,662 tokens. **Adopt:** `skillOverrides` `"user-invocable-only"` for the
  run-once workflow skills (`redesign-judge-panel`, `test-semantics-audit`) and `"name-only"` for `code-survey`
  and `total-audit`; leave `skillListingMaxDescChars` at its default (descriptions are the routing signal and
  the saving is < 1k).

### Hooks: `timeout` default, `async`, `onFailure`, what costs context

- "`timeout` … Defaults: 600 for `command`, `http`, and `mcp_tool`; 30 for `prompt`; 60 for `agent`. Claude
  Code lowers the … default to 30 on `UserPromptSubmit` …" https://code.claude.com/docs/en/hooks#common-fields
- "On `PreToolUse`, a timed-out `command` … hook doesn't block the tool call … To block the action instead, set
  `"onFailure": "block"`" (v2.1.295+). https://code.claude.com/docs/en/hooks#block-the-action-when-a-hook-fails
  — corrected 2026-10-26: this note first said the committed guards **fail open**; the `onFailure` block has since landed.
  `.claude/settings.json` carries `"onFailure": "block"` on every PreToolUse command hook (`protect-files.sh`,
  `bash-guard.sh`, `mcp-browser-guard.sh`, `github-mcp-guard.sh`, `subagent-contract.py`, `context-cap.py`), so a
  timed-out or crashing guard now BLOCKS the call (a loaded box can therefore stall a commit: the guard timeout is
  `apex.guardTimeout` / `APEX_GUARD_TIMEOUT`).
- `async`: "runs in the background without blocking … Async hooks can't block or control Claude's behavior …
  Claude Code doesn't enforce `timeout` on it"; results (`additionalContext`, `systemMessage`) arrive "on the
  next conversation turn". `asyncRewake` "wakes Claude on exit code 2". https://code.claude.com/docs/en/hooks#run-hooks-in-the-background
- Context cost: "For most events, Claude Code writes stdout to the debug log … The exceptions are
  `UserPromptSubmit`, `UserPromptExpansion`, `SessionStart`, and `PostModelSwitch`, where Claude Code adds
  plain-text stdout as context." `additionalContext` is always injected as a system reminder.
- **Adopted (landed).** Every PreToolUse guard has `"onFailure": "block"` (read in `.claude/settings.json`
  2026-10-26; this bullet first described it as lane S5's uncommitted tree). Still open: `memory-sync.sh save` (Stop and PostToolUse) and the advisory `lsp-hint.py` → `"async":
  true` (they can neither block nor need to delay the turn); keep `session-start.sh` and `skill-hint.py` stdout
  to one line each, because that stdout is context on every session/prompt. With `onFailure: "block"` on
  `bash-guard.sh`, its 20-s `fleet-owner.mjs` path (audit item 7) must be fixed, or a slow run blocks commands.

### Subagents: `omitClaudeMd`

- "Set to `true` to start this subagent without the user, project, and local CLAUDE.md files in its initial
  context … Use it for subagents that take everything they need from the delegation prompt … Requires Claude
  Code v2.1.271 or later." https://code.claude.com/docs/en/sub-agents#supported-frontmatter-fields (Agent SDK:
  `AgentDefinition.omitClaudeMd`, "requires SDK v0.3.271+", Context7 `/websites/code_claude_en_agent-sdk`).
- **Measured saving:** ~12.4k tokens per spawn (the CLAUDE.md row above). **Adopt** on read-only reporters
  whose brief is self-contained (`deploy-research`, `bloat-auditor`, `code-hunter`, `finding-verifier`,
  `prior-art-scout`); not on `worker` or `track-surveyor`, which need the rules.
- Subagents get the 5-minute cache TTL by default ("Subagents fall outside the main-conversation TTL bucket, so
  they get five minutes even on a subscription", https://code.claude.com/docs/en/prompt-caching).

### Prompt cache: TTL and what breaks the prefix

- "Claude Code requests the one-hour TTL only on a Claude subscription within your plan's included usage …
  Once you go over your plan's usage limit and Claude Code draws on usage credits … drops the main conversation
  to the five-minute TTL." Controls: `promptCacheTtl` / `CLAUDE_CODE_PROMPT_CACHE_TTL` (`5m`|`1h`, v2.1.242+).
  https://code.claude.com/docs/en/prompt-caching#which-ttl-each-request-gets
- **Measured:** `claude -p` here wrote `ephemeral_1h_input_tokens` (1-hour TTL in force).
- Price (Opus 5.5, https://platform.claude.com/docs/en/build-with-claude/prompt-caching): base $4/MTok, 5-min
  write $5, 1-hour write $8, cache hit $0.20 ("priced at 0.05x the base input price"). A 200k wake costs $0.04
  warm vs $1.60 cold (1-hour write); the gap is why wakes must stay inside the TTL.
- What breaks it: "A change to the system prompt invalidates everything" (tool definitions sit there); model
  switch ("each model has its own cache"); effort change on most models (not Opus 5.5 / Sonnet 5.5 / Fable 5.1);
  compaction; Claude Code upgrade. What does NOT: editing CLAUDE.md mid-session (it does not apply until
  `/clear`, `/compact` or restart), skills (appended as messages), and — with tool search — MCP servers
  connecting mid-session ("keeps the tool list from the conversation's first request").
- **Adopt:** `CLAUDE_CODE_PROMPT_CACHE_TTL=1h` on orchestrator/watcher environments so an overage period does
  not silently switch long-gap wakes to 5-minute writes; orchestrator wakes ≤ 55 min apart.

### Cross-session messages, scheduled tasks, the routine fire endpoint

- Claude Code's own `SendMessage`: "The receiving Claude reads the message between tool calls during an active
  turn … When the receiving session is idle, Claude Code starts a new turn with the message." "Once delivered,
  the message counts toward usage like a prompt you type." "A cloud session … can't use `SendMessage` to answer
  a message from another machine." https://code.claude.com/docs/en/cross-session-messaging
- The fleet uses the cloud MCP `send_message`, which takes `priority: now|next|later` ("'next' joins the running
  turn without stopping it; 'later' waits for turn end"; tool schema). The audit's 3–6 min peer latency was the
  default, which queued behind the running turn. **Adopt:** `priority: "next"` for READY/BLOCKED, default for
  INFO. Cost per delivery to an idle session = one turn = the whole context re-sent (warm $0.04 / cold $1.60 at
  200k on Opus 5.5).
- `send_later`: "Granularity is one minute — the scheduler polls every minute" and a due message "waits and is
  normally delivered after that turn ends" (tool description) — matches the measured 2-min → 6 m 19 s.
- Cloud scheduled tasks: "Expressions that run more often than once per hour are rejected"; "if you schedule a
  run exactly on the hour … it can start several minutes late".
  https://code.claude.com/docs/en/routines#add-a-schedule-trigger
- `/fire`: "30 per hour — Each scheduled task, one count shared by [Run now, API fires, re-run]"; "API fires —
  100 per hour — Your account"; "None of these hourly limits has overage"; beta header
  `experimental-cc-routine-2026-04-01`; body `text` "is not parsed". https://code.claude.com/docs/en/routines#usage-and-limits
  The audit measured a 400 without `anthropic-version`; each fire boots a fresh session (~98k).

## 2b. Auto mode: the project's `autoMode` is ignored (added 2026-10-26)

Source: https://code.claude.com/docs/en/auto-mode-config and https://code.claude.com/docs/en/permission-modes
(fetched by the pass-4 web-claude-code slice).

- "The classifier doesn't read `autoMode` from project settings in `.claude/settings.json` or
  `.claude/settings.local.json`." It reads only user settings (`~/.claude/settings.json`), managed settings or
  `--settings`; cloud sessions do not read the user file, and `/auto-mode-setup` is not available there. So an
  `autoMode` block committed to this repo does nothing, and an earlier suggestion to move the needed npm/Monitor
  rules into `autoMode.allow` cannot work from the repo.
- `autoMode.allow` entries are prose exceptions to `soft_deny`, "natural-language rules", not tool patterns.
- On entering auto mode, broad allow rules that grant arbitrary code execution are dropped (blanket `Bash(*)`,
  wildcarded interpreters such as `Bash(python*)`, package-manager run commands, `Agent` and `Monitor` allows);
  narrow rules such as `Bash(npm test)` stay in effect and skip the classifier. A narrow rule can still let a
  destructive argument through (for example `Bash(find *)`).
- The classifier reads the CLAUDE.md content Claude loads, so AGENTS.md (imported by CLAUDE.md) steers it.
- Consequence for this repo: call node scripts directly (`node tools/...`) rather than relying on `npm run` or
  `node -e` allows, and keep allow rules narrow.

## 3. Ready-to-paste fragment (for lane S5) and environment variables

Merge into `.claude/settings.json` (only the changed fields; the `hooks` entries replace the existing
PostToolUse/Stop `memory-sync.sh` and `lsp-hint.py` entries one for one):

```json
{
  "skillOverrides": {
    "redesign-judge-panel": "user-invocable-only",
    "test-semantics-audit": "user-invocable-only",
    "code-survey": "name-only",
    "total-audit": "name-only"
  },
  "deniedMcpServers": [
    { "serverName": "Three_js_3D_Viewer" }
  ],
  "hooks": {
    "PostToolUse": [
      { "matcher": "Grep|Bash", "hooks": [{ "type": "command", "command": "\"$CLAUDE_PROJECT_DIR/.claude/hooks/lsp-hint.py\"", "timeout": 5, "async": true }] },
      { "matcher": "Write|Edit|MultiEdit", "hooks": [{ "type": "command", "command": "\"$CLAUDE_PROJECT_DIR/.claude/hooks/memory-sync.sh\" save", "timeout": 10, "async": true }] }
    ],
    "Stop": [
      { "hooks": [{ "type": "command", "command": "\"$CLAUDE_PROJECT_DIR/.claude/hooks/memory-sync.sh\" save", "timeout": 10, "async": true }] }
    ]
  }
}
```

`deniedMcpServers` is the one entry to pilot before committing (§2 MCP). `async`/`onFailure` need v2.1.295+
(container: 2.1.310). Subagent frontmatter, per reporter agent: `omitClaudeMd: true`.

Environment variables (claude.ai → environment → Environment variables; per environment):

| variable | orchestrator / watcher env | worker env | source |
|---|---|---|---|
| `CLAUDE_CODE_AUTO_COMPACT_WINDOW` | `375000` (→ compacts at 300k with the host's PCT 80) — pilot first | unset | env-vars, cloud-environments |
| `CLAUDE_CODE_PROMPT_CACHE_TTL` | `1h` | unset (default 1h within plan) | prompt-caching |
| `ENABLE_TOOL_SEARCH` | leave unset (never `false`) | same | measured +43.9k |
| `CLAUDE_CODE_MAX_MCP_DESCRIPTION_LENGTH` | leave at host's `4096` | same | measured |
| `CLAUDE_AUTOCOMPACT_PCT_OVERRIDE` | do not set (host value wins) | same | cloud-environments |
| `APEX_MERGE_DESK` | `1` here only (S5 removed it from the committed `env`) | unset | audit item 9 |

## §GitHub

Repo facts (read today with `gh api`): owner type **User**, **public**; `allow_squash_merge false`,
`allow_rebase_merge true`, `allow_merge_commit true`, `allow_auto_merge true`. One active ruleset, "Deploy
Ruleset" (id 22828280) on `refs/heads/claude/f1-game-project-26h3ng`, `bypass_actors: []`, rules
`non_fast_forward` + `deletion` only. Classic branch protection is not readable with the session's token (403).

### Ruleset: pull_request + required check + no bypass

- REST: `PUT /repos/{owner}/{repo}/rulesets/{ruleset_id}` (create: `POST …/rulesets`); rule
  `pull_request.parameters` = `allowed_merge_methods` (`merge|squash|rebase`), `required_approving_review_count`
  (0–10), `dismiss_stale_reviews_on_push`, `require_code_owner_review`, `require_last_push_approval`,
  `required_review_thread_resolution`; rule `required_status_checks.parameters` =
  `required_status_checks[{context, integration_id}]`, `strict_required_status_checks_policy`,
  `do_not_enforce_on_create`; `bypass_actors[].bypass_mode` `always|pull_request|exempt`.
  https://docs.github.com/en/rest/repos/rules
- "you can allow certain users to bypass the rules … such as repository administrator" — bypass is opt-in, so
  an empty list binds the owner's token and the proxy's App token too.
  https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/about-rulesets
- UI path: repo → Settings → Rules → Rulesets → "Deploy Ruleset" → add "Require a pull request before merging"
  (Allowed merge methods: Merge) and "Require status checks to pass" (add `CI`, source GitHub Actions); leave
  Bypass list empty. Also Settings → General → Pull Requests: untick "Allow rebase merging".
- Body for Bryce to apply (`gh api -X PUT repos/brycejmurrin/f1-game/rulesets/22828280 --input body.json`;
  `integration_id` 15368 is `github-actions`, read from the deploy tip's check runs; confirm the PR-run check
  is named exactly `CI` on a PR head first — on the deploy branch it appears as `ci / CI`):

```json
{
  "name": "Deploy Ruleset", "target": "branch", "enforcement": "active",
  "conditions": { "ref_name": { "include": ["refs/heads/claude/f1-game-project-26h3ng"], "exclude": [] } },
  "bypass_actors": [],
  "rules": [
    { "type": "non_fast_forward" },
    { "type": "deletion" },
    { "type": "pull_request", "parameters": {
        "allowed_merge_methods": ["merge"], "required_approving_review_count": 0,
        "dismiss_stale_reviews_on_push": false, "require_code_owner_review": false,
        "require_last_push_approval": false, "required_review_thread_resolution": false } },
    { "type": "required_status_checks", "parameters": {
        "strict_required_status_checks_policy": false, "do_not_enforce_on_create": false,
        "required_status_checks": [{ "context": "CI", "integration_id": 15368 }] } }
  ]
}
```

This closes the audit's item 9 holes server-side: `push_files`/`create_or_update_file` and a raw `curl PUT
…/merge` with squash can no longer land on the deploy branch, whatever the hooks miss.

### A merge queue without `merge_group`

- GitHub's merge queue is for "public repositories owned by organizations" (and private org repos on
  Enterprise Cloud), and requires the `merge_group` trigger ("You **must** use the `merge_group` event");
  a user-owned repo cannot enable it.
  https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/configuring-pull-request-merges/managing-a-merge-queue,
  https://github.blog/changelog/2023-07-12-pull-request-merge-queue-is-now-generally-available/
- A required check cannot itself queue (it reports per head sha). The serialising piece is Actions concurrency:
  "`queue: max`: Up to 100 jobs or workflow runs can be `pending` in the concurrency group" (default `single`
  cancels the waiting run); "`queue: max` and `cancel-in-progress: true` is not allowed".
  https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/control-workflow-concurrency
- Shape: a `merge-train.yml` on `pull_request: [labeled]` (label `queue`) with `concurrency: {group:
  merge-train, queue: max}`; each run in FIFO order checks the PR's `CI` is green on its head, merges the deploy
  tip into the head when behind (App token, so CI re-runs), waits for CI on that sha, then `PUT
  /pulls/{n}/merge` with `merge_method: merge` and `sha: <head>` (refuses if the head moved). Same guarantees
  as a queue of size 1; the ruleset stays the enforcement. Estimate, **verify in a pilot**: one PR at a time
  costs one CI tier per PR in the train (no batching).

### Static previews from Actions

- Cloudflare Pages Direct Upload: token "Custom Token with **Account**, **Cloudflare Pages**, and **Edit**
  permissions" + account id; `cloudflare/wrangler-action@v4` with `command: pages deploy <dir>
  --project-name=<name>` ("automatically triggers on the current git branch, unless you add a `branch` option").
  https://developers.cloudflare.com/pages/how-to/use-direct-upload-with-continuous-integration/
  URLs: "`<hash>.<project>.pages.dev`" per deployment and "`<branch>.<project>.pages.dev`" per branch
  (`fix/api` → `fix-api`); "these deployment URLs are public" unless Access is enabled.
  https://developers.cloudflare.com/pages/configuration/preview-deployments/
  Free plan: 500 builds/month (Git builds), "unlimited number of preview deployments", 20,000 files per site,
  25 MiB per asset, 100 projects. https://developers.cloudflare.com/pages/platform/limits/ — the repo has 4,774
  tracked files, the largest 7.4 MB, so `_site` fits. Whether direct uploads count against the 500: not stated.
- Netlify: `netlify deploy --dir=<dir> --alias=pr-<n>` (draft by default; `--prod` publishes), env
  `NETLIFY_AUTH_TOKEN` + `NETLIFY_SITE_ID`. https://docs.netlify.com/cli/get-started/ Cost on the current
  credit-based plans: not checked — verify before choosing it.
- GitHub Pages PR previews: the §13 research found them alpha and not public; nothing newer found.
- Recommendation: Cloudflare (one secret `CLOUDFLARE_API_TOKEN` + var `CLOUDFLARE_ACCOUNT_ID`, from Bryce),
  deploying the staged `_site` that pages.yml already builds, URL posted in the job summary (not a PR comment).
  Same-repo branches only; fork PRs get no secrets.

### Why a GITHUB_TOKEN-created PR starts no CI, and the fixes

- "When you use the repository's `GITHUB_TOKEN` to perform tasks, events triggered by the `GITHUB_TOKEN` will
  not create a new workflow run, with the following exceptions: … `pull_request` events with the `opened`,
  `synchronize`, or `reopened` activity types: … creates workflow runs in an **approval-required** state. The
  pull request displays a banner … a user with write access … can start the runs by selecting **Approve workflows
  to run**." "If you do want to trigger a workflow from within a workflow run, you can use a GitHub App
  installation access token or a personal access token instead … Using one of these alternatives also lets
  `pull_request` workflows run automatically (without the approval prompt …)".
  https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/trigger-a-workflow
- So ratchets-fold's PR sits waiting for a human click today. Fix (sanctioned): a GitHub App with
  contents+pull-requests write, installed on the repo, and `actions/create-github-app-token@v3`
  (`client-id: ${{ vars.APP_CLIENT_ID }}`, `private-key: ${{ secrets.APP_PRIVATE_KEY }}`, output `token`;
  "An installation access token expires after 1 hour"; scope it with `permission-contents: write`,
  `permission-pull-requests: write`). https://github.com/actions/create-github-app-token
  A fine-grained PAT works too but is tied to Bryce's account and expires; the App is the better owner.

## Not verified here

- That a cloud session honours a committed `deniedMcpServers` for host connectors, and the connector's exact
  `serverName`.
- That `CLAUDE_CODE_AUTO_COMPACT_WINDOW` on an environment survives the host's own launch env (the doc says the
  host overrides only `CLAUDE_AUTOCOMPACT_PCT_OVERRIDE`), and how an orchestrator behaves after one compaction.
- The ~40k cloud-host share was derived (98k − 56k), not itemised; `/context` in a fresh cloud session would.
- `onFailure` on PreToolUse hooks in cloud sessions (documented, not exercised here).
- The merge-train workflow and Cloudflare previews are designs, not built.
